/**
 * 개발용 편집기 화면.
 *
 * 호스트 앱 역할을 대신한다. pdf.js 자산을 설정하고 데모 port 를 주입하며, 매번 업로드 팝업을
 * 클릭하지 않고 픽스처를 불러올 수 있는 dev 바를 붙인다.
 *
 * **Vue 없이 새 렌더 층을 직접 마운트한다** (렌더 층은 vanilla DOM 이다). 이전 판은 `@h_domi/pdf-canvas-kit/vue` 의 SFC
 * 편집기를 띄웠다 — 그 층은 2026.08.20 에 삭제됐고, 원본은
 * `_LumiTeach/lumiteach-worksheet-system` 에 보존돼 있다.
 *
 * **커스텀 객체 레지스트리** (커스텀 객체는 소비자가 정의한다). 타입 정의는 `objectTypes.ts` 에 있다 — 그쪽이
 * "소비자가 라이브러리를 쓰는 법" 이고 이 파일은 마운트·dev 바를 다룬다.
 */
import { createConsoleStoragePort, type PDFCanvasDoc, type SaveState } from '@h_domi/pdf-canvas-kit'
import { DEMO_OBJECT_TYPES } from './objectTypes'
import { createEditorController } from '../../src/controller/editor'
import { editorShell } from '../../src/dom/editor/editorShell'
import { el } from '../../src/dom/h'
import { onCleanup, scope, signal } from '../../src/dom/reactive'
import '../../src/styles/tokens.css'
import '../../src/styles/editor.css'
import '../styles.css'
import { configureDemoPdfAssets } from '../shared/pdfAssets'

/**
 * pdf.js 가 런타임에 가져오는 자산들. `npm run copy:pdfjs` 가 자리를 잡아 준다.
 * `cMapUrl` 이 없으면 렌더된 페이지에서 한글이 조용히 사라진다 (ARCHITECTURE §4).
 */
configureDemoPdfAssets()

/**
 * 저장 대체 구현.
 *
 * 실제 서버가 아직 없어 콘솔에 문서를 출력한다. 자동저장 파이프라인(5초 디바운스, 최대 지연 30초,
 * 실패 재시도)은 그대로 동작하므로 저장 주기와 배지 상태를 실제와 같은 조건에서 확인할 수 있다.
 */
const storage = createConsoleStoragePort({ label: '[demo]' })

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

/**
 * 편집기를 만든다.
 *
 * `initialDoc` 은 최초 1회만 읽히므로(ARCHITECTURE §14.2) 다른 문서를 열 때는 컨트롤러를
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
      ...(doc ? { initialDoc: doc } : {}),
      ports: { storage },
      objectTypes: DEMO_OBJECT_TYPES,
      onSaveStateChange: (s) => (saveState.value = s),
      onChange: (next) => {
        status.value = `${next.pages.length} 페이지 · "${next.title}"`
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
    el('span', { class: 'spacer' }),
    el('span', {}, [() => `${saveState.value} · ${status.value}`]),
  ]),
  el('div', { class: 'editor-host', ref: (e) => (stageHost = e) }),
])

host.append(...nodes)
mountEditor(null)
