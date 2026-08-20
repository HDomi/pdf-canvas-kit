/**
 * 뷰어 데모 (PLAN R11).
 *
 * 편집기와 뷰어를 **나란히** 둔다. 왼쪽에서 문제를 만들고 [뷰어로 보내기] 를 누르면
 * `toPublicDoc()` 을 거친 문서가 오른쪽에 들어간다.
 *
 * 이 배치가 확인하는 것 셋:
 *
 * 1. **정답이 지워졌는가** — `renderViewer` 가 `answers` 가 있으면 콘솔에 error 를 낸다
 * 2. **`kind` 계약이 성립하는가** — 양쪽에 같은 `objectTypes` 배열을 넘긴다
 * 3. **응답이 호스트 것인가** (D29) — 뷰어가 응답을 저장하지 않으므로 여기서 상태를 들고 있다
 */
import {
  createPDFCanvasEditor,
  createPDFCanvasViewer,
  createPDFCanvasDoc,
  createPage,
  configurePdfResources,
  A4_PT,
  type PublicPDFCanvasDoc,
} from 'pdf-canvas-kit'
import { DEMO_VIEWER_TYPES } from './objectTypes'
import 'pdf-canvas-kit/styles.css'
import '../styles.css'

configurePdfResources({
  workerSrc: '/pdfjs/pdf.worker.mjs',
  cMapUrl: '/pdfjs/cmaps/',
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/',
  iccUrl: '/pdfjs/iccs/',
})

const editorHost = document.getElementById('editor')!
const viewerHost = document.getElementById('viewer')!
const sendBtn = document.getElementById('send') as HTMLButtonElement
const status = document.getElementById('status')!
const paneEditor = document.getElementById('pane-editor')!
const paneViewer = document.getElementById('pane-viewer')!
const tabEditor = document.getElementById('tab-editor') as HTMLButtonElement
const tabViewer = document.getElementById('tab-viewer') as HTMLButtonElement

/**
 * 탭 전환.
 *
 * 두 컴포넌트를 걷지 않고 숨긴다 — 편집기를 언마운트하면 undo 스택이 날아가고, 뷰어는
 * 입력 중인 응답을 잃는다. `visibility` 를 쓰므로 뷰어의 폭 측정도 계속 살아 있다.
 */
function showTab(which: 'editor' | 'viewer') {
  paneEditor.hidden = which !== 'editor'
  paneViewer.hidden = which !== 'viewer'
  tabEditor.disabled = which === 'editor'
  tabViewer.disabled = which === 'viewer'
}
tabEditor.addEventListener('click', () => showTab('editor'))
tabViewer.addEventListener('click', () => showTab('viewer'))

const editor = createPDFCanvasEditor(editorHost, {
  initialDoc: createPDFCanvasDoc({ pages: [createPage({ size: A4_PT })] }),
  objectTypes: DEMO_VIEWER_TYPES,
})

/*
 * 응답을 **호스트가 들고 있다** (D29).
 *
 * 뷰어는 문서를 소유하지 않으므로 응답을 저장할 곳이 없다. `onChangeData` 로 받아 여기서
 * 문서를 고치고 `update()` 로 되돌려 주는 것이 유일한 경로다.
 */
let current: PublicPDFCanvasDoc | null = null

const viewer = createPDFCanvasViewer(viewerHost, {
  doc: null,
  objectTypes: DEMO_VIEWER_TYPES,
  onChangeData: (objectId, next) => {
    if (!current) return
    /*
     * 문서를 다시 만든다. 뷰어는 controlled 이므로 새 객체를 넘겨야 갱신이 보인다.
     *
     * 브랜드는 유지된다 — 이미 public 인 문서에서 파생했다.
     */
    current = {
      ...current,
      pages: current.pages.map((page) => ({
        ...page,
        objects: page.objects.map((obj) =>
          obj.id === objectId && obj.type === 'custom' ? { ...obj, data: next } : obj,
        ),
      })),
    }
    viewer.update({ doc: current })
    report()
  },
})

/** 응답 상황을 보여준다. 호스트가 채점·저장을 하는 지점이 여기다. */
function report() {
  const answered =
    current?.pages
      .flatMap((p) => p.objects)
      .filter(
        (o) =>
          o.type === 'custom' &&
          typeof (o.data as { response?: string }).response === 'string' &&
          (o.data as { response?: string }).response !== '',
      ).length ?? 0
  const total =
    current?.pages.flatMap((p) => p.objects).filter((o) => o.type === 'custom').length ?? 0
  status.textContent = total === 0 ? '문항 없음' : `응답 ${answered} / ${total}`
}

sendBtn.addEventListener('click', () => {
  // 검증 게이트를 거친다 — 편집기가 실패 시 문제 객체로 데려간다.
  if (!editor.checkBeforeExport()) {
    status.textContent = '검증 실패 — 편집기를 확인하세요'
    return
  }
  current = editor.toPublicDoc()
  viewer.update({ doc: current })
  report()
  showTab('viewer')
})

// 좁은 폭 확인용 (D15 — 375px 에서 가로 스크롤이 없어야 한다).
const narrow = document.getElementById('narrow') as HTMLInputElement
narrow.addEventListener('change', () => {
  viewerHost.style.width = narrow.checked ? '375px' : ''
})

report()
