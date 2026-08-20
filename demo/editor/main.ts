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
 * ⚠️ **R5 시점의 상태다.** 스테이지·객체·선택·줌·팬만 붙어 있다. 상단바·툴바·페이지 목록·
 * 인스펙터는 R6·R7 에서 붙는다. 그때까지 문서 불러오기는 아래 dev 바로만 할 수 있다.
 */
import {
  clearPrototypeSave,
  configurePdfResources,
  createConsoleStoragePort,
  hasPrototypeSave,
  loadPrototype,
  type PDFCanvasDoc,
  type SaveState,
} from 'pdf-canvas-kit'
import { createEditorController } from '../../src/controller/editor'
import { stageWrap } from '../../src/dom/editor/stageArea'
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
      onSaveStateChange: (s) => (saveState.value = s),
      onChange: (next) => {
        status.value = `${next.pages.length} 페이지 · "${next.title}"`
        hasSave.value = hasPrototypeSave()
      },
    })

    // 단축키는 컨트롤러가 정의하고, `window` 에 붙이는 것은 렌더 층(여기)의 몫이다.
    window.addEventListener('keydown', c.onKeyDown)
    onCleanup(() => window.removeEventListener('keydown', c.onKeyDown))

    stageHost?.append(stageWrap(c))
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

const [root] = scope(() =>
  el('div', { class: 'demo-shell' }, [
    el('div', { class: 'demo-bar' }, [
      el('strong', {}, ['editor (R5)']),
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
      el('span', { class: 'demo-status' }, [() => `${saveState.value} · ${status.value}`]),
    ]),
    el('div', { class: 'editor-host', ref: (e) => (stageHost = e) }),
  ]),
)

host.append(root)
mountEditor(null)
