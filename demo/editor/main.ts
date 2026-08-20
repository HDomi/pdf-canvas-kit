/**
 * 개발용 편집기 화면 (PLAN 14.1).
 *
 * 호스트 앱 역할을 대신한다. pdf.js 자산을 설정하고 데모 port 를 주입하며, 매번 업로드 팝업을
 * 클릭하지 않고 픽스처를 불러올 수 있는 dev 바를 붙인다.
 *
 * **Vue 없이 새 렌더 층을 직접 마운트한다** (PLAN D19). 이전 판은 `pdf-canvas-kit/vue` 의 SFC
 * 편집기를 띄웠다 — 그 층은 2026.08.20 에 삭제됐고, 원본은
 * `_LumiTeach/lumiteach-worksheet-system` 에 보존돼 있다.
 *
 * **R8 시점 — 커스텀 객체 레지스트리** (PLAN D25). 아래 `shortAnswer` · `sticky` 가 소비자 앱이
 * 타입을 정의하는 방식의 예제다. 툴바 도구도 이 목록에서 만들어진다.
 *
 * 이 데모는 프레임워크가 없으므로 `render` 슬롯으로 vanilla DOM 을 그린다. React·Vue 래퍼는
 * 그 슬롯을 주지 않고 컨테이너에 portal 한다 (R9).
 */
import {
  clearPrototypeSave,
  configurePdfResources,
  defineObjectType,
  createConsoleStoragePort,
  hasPrototypeSave,
  loadPrototype,
  type PDFCanvasDoc,
  type SaveState,
} from 'pdf-canvas-kit'
import { createEditorController } from '../../src/controller/editor'
import { editorShell } from '../../src/dom/editor/editorShell'
import { el, when } from '../../src/dom/h'
import { onCleanup, scope, signal } from '../../src/dom/reactive'
import '../../src/styles/tokens.css'
import '../../src/styles/editor.css'
import '../styles.css'

/**
 * pdf.js 가 런타임에 가져오는 자산들. `npm run copy:pdfjs` 가 자리를 잡아 준다.
 * `cMapUrl` 이 없으면 렌더된 페이지에서 한글이 조용히 사라진다 (ARCHITECTURE §4).
 */
configurePdfResources({
  workerSrc: '/pdfjs/pdf.worker.mjs',
  cMapUrl: '/pdfjs/cmaps/',
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/',
  iccUrl: '/pdfjs/iccs/',
})

/**
 * 저장 대체 구현 (PLAN 18.2).
 *
 * 실제 서버가 아직 없어 콘솔에 문서를 출력한다. 자동저장 파이프라인(5초 디바운스, 최대 지연 30초,
 * 실패 재시도)은 그대로 동작하므로 저장 주기와 배지 상태를 실제와 같은 조건에서 확인할 수 있다.
 */
const storage = createConsoleStoragePort({ label: '[demo]' })

/**
 * 커스텀 객체 타입 예제 (PLAN D25).
 *
 * 이 데모는 프레임워크가 없으므로 `render` · `renderInspector` 로 vanilla DOM 을 그린다.
 * React·Vue 래퍼는 이 슬롯을 주지 않고 컨테이너에 portal 한다 (R9).
 *
 * **`interactive` 를 켠 타입과 끈 타입을 하나씩 둔다** — 편집기에서 포인터 소유권이 어떻게
 * 갈리는지 브라우저에서 직접 비교할 수 있어야 한다.
 */
interface AnswerData {
  answers: string[]
  points: number
}

const shortAnswer = defineObjectType<AnswerData>({
  kind: 'demo.shortAnswer',
  label: '단답형',
  defaultSize: { w: 160, h: 40 },
  minSize: { w: 80, h: 32 },
  defaultData: () => ({ answers: [], points: 1 }),
  // 편집기에서는 자리만 보여준다. 클릭이 객체 선택으로 가야 한다.
  interactive: false,
  rotatable: false,
  validate: (d) => (d.answers.some((a) => a.trim()) ? null : ['정답을 입력하세요']),
  toPublic: ({ answers: _answers, ...rest }) => rest,
  render: ({ data }) => {
    const box = document.createElement('div')
    box.style.cssText =
      'display:flex;align-items:center;gap:6px;padding:0 8px;height:100%;font-size:11px'
    const badge = document.createElement('b')
    badge.textContent = String(data.points)
    const hint = document.createElement('span')
    hint.style.color = '#b4342b'
    hint.textContent = data.answers.some((a) => a.trim()) ? '' : '정답 미입력'
    box.append(badge, hint)
    return box
  },
  renderInspector: ({ data, onChange }) => {
    const wrap = document.createElement('div')
    const input = document.createElement('input')
    input.className = 'pck-input'
    input.value = data.answers[0] ?? ''
    input.placeholder = '정답'
    input.addEventListener('input', () => onChange({ ...data, answers: [input.value] }))
    const points = document.createElement('input')
    points.className = 'pck-input pck-input--num'
    points.type = 'number'
    points.min = '1'
    points.value = String(data.points)
    points.addEventListener('input', () => onChange({ ...data, points: Number(points.value) || 1 }))
    wrap.append(input, points)
    return wrap
  },
})

/**
 * 상호작용형 예제.
 *
 * `interactive: true` 라 편집기에서도 콘텐츠가 포인터를 먹는다 — 이 객체는 테두리와 핸들로만
 * 선택된다. 가운데를 끌어 옮길 수 없다는 것을 눈으로 확인하기 위한 것이다.
 */
const sticky = defineObjectType<{ text: string }>({
  kind: 'demo.sticky',
  label: '메모(상호작용)',
  defaultSize: { w: 180, h: 90 },
  defaultData: () => ({ text: '' }),
  interactive: true,
  render: ({ data, onChange }) => {
    const ta = document.createElement('textarea')
    ta.style.cssText =
      'width:100%;height:100%;border:0;background:transparent;resize:none;font:inherit;padding:6px'
    ta.value = data.text
    ta.placeholder = '메모를 입력한다'
    ta.addEventListener('input', () => onChange({ text: ta.value }))
    return ta
  },
})

const FIXTURES = [
  ['a4-3page.pdf', 'A4 3p'],
  ['mixed-size.pdf', '크기 혼합 6p'],
  ['rotated-90.pdf', 'Rotate'],
  ['korean.pdf', '한글'],
  ['large-100page.pdf', '100p'],
] as const

const host = document.getElementById('app')
if (!host) throw new Error('[demo] #app not found')

const status = signal('픽스처를 눌러 불러온다.')
const saveState = signal<SaveState>('disabled')
const hasSave = signal(hasPrototypeSave())

/**
 * 편집기를 만든다.
 *
 * `doc` 은 최초 1회만 읽히므로(ARCHITECTURE §14.2) 프로토타입 저장을 불러올 때는 컨트롤러를
 * 통째로 다시 만든다. React 에서 `key` 를 바꾸는 것과 같은 처리다.
 */
let dispose: (() => void) | null = null
let stageHost: HTMLElement | null = null
let controller: ReturnType<typeof createEditorController> | null = null

function mountEditor(doc: PDFCanvasDoc | null) {
  dispose?.()
  stageHost?.replaceChildren()

  const [made, d] = scope(() => {
    const c = createEditorController({
      ...(doc ? { doc } : {}),
      ports: { storage },
      objectTypes: [shortAnswer, sticky],
      onSaveStateChange: (s) => (saveState.value = s),
      onChange: (next) => {
        status.value = `${next.pages.length} 페이지 · "${next.title}"`
        hasSave.value = hasPrototypeSave()
      },
    })

    // 단축키는 컨트롤러가 정의하고, `window` 에 붙이는 것은 렌더 층(여기)의 몫이다.
    window.addEventListener('keydown', c.onKeyDown)
    onCleanup(() => window.removeEventListener('keydown', c.onKeyDown))

    stageHost?.append(editorShell(c))
    return c
  })
  controller = made
  dispose = d
}

/** dev 바에서 픽스처를 불러온다. 실제 업로드와 같은 코드 경로를 지난다. */
async function loadFixture(name: string): Promise<void> {
  status.value = `${name} 불러오는 중…`
  try {
    const res = await fetch(`/fixtures/${name}`)
    if (!res.ok) throw new Error(`${res.status} — npm run fixtures 를 먼저 실행한다`)
    const file = new File([await res.blob()], name, { type: 'application/pdf' })
    mountEditor(null)
    await controller?.pickFile(file)
  } catch (err) {
    status.value = `실패: ${err instanceof Error ? err.message : String(err)}`
  }
}

/* ------------------------------------------------------------------ 화면 -- */

/*
 * `index.html` 이 레이아웃 계약을 갖고 있다 — `#app` 은 flex 컬럼이고 **직계 자식**이
 * `.devbar`(고정) + `.editor-host`(`flex: 1`) 여야 한다. `.pck-editor` 가 `height: 100%` 를
 * 요구하므로 이 체인 중 한 겹이라도 어긋나면 편집기가 화면을 채우지 못하고 EmptyState 가
 * 부모 밖으로 삐져나온다.
 *
 * 그래서 감싸는 `div` 를 두지 않고 두 노드를 `#app` 에 직접 붙인다. 구 Vue 판이
 * `style="display:contents"` 를 쓴 것도 같은 이유였다.
 */
const [nodes] = scope(() => [
  el('div', { class: 'devbar' }, [
    el('strong', {}, ['editor (R8)']),
    ...FIXTURES.map(([file, label]) =>
      el('button', { attr: { type: 'button' }, on: { click: () => void loadFixture(file) } }, [
        label,
      ]),
    ),
    el(
      'button',
      {
        attr: { type: 'button' },
        on: {
          click: () => {
            const loaded = loadPrototype()
            if (!loaded) {
              status.value = '저장된 데이터가 없다.'
              return
            }
            mountEditor(loaded)
            status.value = `불러옴 · ${loaded.pages.length} 페이지 · "${loaded.title}"`
          },
        },
      },
      ['불러오기'],
    ),
    when(
      () => hasSave.value,
      () =>
        el(
          'button',
          {
            attr: { type: 'button' },
            on: {
              click: () => {
                clearPrototypeSave()
                hasSave.value = hasPrototypeSave()
                status.value = '저장 삭제됨.'
              },
            },
          },
          ['저장 삭제'],
        ),
    ),
    el('span', { class: 'spacer' }),
    el('span', {}, [() => `${saveState.value} · ${status.value}`]),
  ]),
  el('div', { class: 'editor-host', ref: (e) => (stageHost = e) }),
])

host.append(...nodes)
mountEditor(null)
