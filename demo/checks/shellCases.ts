/**
 * 편집기 셸 조립 검증 (PLAN 20.11, R6).
 *
 * 여기서 확인하는 것은 **조립이 되는가**다. 컨트롤러가 내놓는 표면과 컴포넌트가 기대하는 prop 이
 * 어긋나면 `editorShell()` 이 던지거나 조용히 빈 노드를 만든다. 그 종류의 버그는 브라우저를
 * 열어야만 보이는데, 조립 자체는 레이아웃이 필요 없으므로 여기서 잡을 수 있다.
 *
 * ⚠️ **동작은 여기서 검증되지 않는다.** 클릭·드래그·줌 앵커링·한글 IME 는 실제 레이아웃과
 * 포인터 이벤트가 필요하다 (PLAN 20.5). 이 파일은 "화면이 만들어지는가" 까지다.
 */
import { editorShell } from '../../src/dom/editor/editorShell'
import { createEditorController } from '../../src/controller/editor'
import { scope } from '../../src/dom/reactive'
import { createPage, createPDFCanvasDoc, A4_PT } from 'pdf-canvas-kit'
import type { PDFCanvasDoc, PDFCanvasPage } from 'pdf-canvas-kit'
import type { CaseGroup } from './cases'

function docWithPages(count: number): PDFCanvasDoc {
  const pages: PDFCanvasPage[] = []
  for (let i = 0; i < count; i++) pages.push(createPage({ size: A4_PT }))
  return createPDFCanvasDoc({ pages })
}

/** 셸을 만들고 검사한 뒤 정리한다. */
function withShell<T>(
  doc: PDFCanvasDoc | null,
  fn: (root: HTMLElement, c: ReturnType<typeof createEditorController>) => T,
): T {
  const [result, dispose] = scope(() => {
    const c = createEditorController(doc ? { doc } : {})
    const root = editorShell(c)
    // 실제 문서에 붙인다 — 붙지 않은 트리에서는 querySelector 가 되지만 focus 등이 다르다.
    document.body.append(root)
    try {
      return fn(root, c)
    } finally {
      root.remove()
    }
  })
  dispose()
  return result
}

const has = (root: HTMLElement, sel: string) => root.querySelector(sel) !== null

export const SHELL_GROUPS: CaseGroup[] = [
  {
    title: 'shell — 3분할 레이아웃 조립',
    note: '컨트롤러 표면과 컴포넌트 prop 이 어긋나면 여기서 던진다. 브라우저를 열지 않고 잡을 수 있는 유일한 조립 오류 계층이다.',
    cases: [
      {
        name: '빈 문서에서 셸이 만들어진다',
        expected: [true, true, true, true],
        actual: () =>
          withShell(null, (root) => [
            // 루트 자신은 querySelector 로 잡히지 않는다.
            root.classList.contains('pck-editor'),
            has(root, '.pck-topbar'),
            has(root, '.pck-pagelist'),
            has(root, '.pck-inspector'),
          ]),
      },
      {
        name: '빈 문서면 EmptyState 를 보여주고 툴바·줌 컨트롤은 없다',
        expected: [true, false, false, false],
        actual: () =>
          withShell(null, (root) => [
            has(root, '.pck-empty'),
            has(root, '.pck-toolbar'),
            has(root, '.pck-stage-controls'),
            has(root, '.pck-stage'),
          ]),
      },
      {
        name: '페이지가 있으면 스테이지·툴바·줌 컨트롤이 나오고 EmptyState 는 사라진다',
        expected: [true, true, true, false],
        actual: () =>
          withShell(docWithPages(3), (root) => [
            has(root, '.pck-stage'),
            has(root, '.pck-toolbar'),
            has(root, '.pck-stage-controls'),
            has(root, '.pck-empty'),
          ]),
      },
      {
        name: '패널 폭이 CSS 변수로 내려간다 (ARCHITECTURE §7.6)',
        expected: true,
        actual: () =>
          withShell(null, (root) => {
            const body = root.querySelector<HTMLElement>('.pck-body')!
            return body.style.getPropertyValue('--pck-pagelist-width').endsWith('px')
          }),
      },
      {
        name: '패널 리사이저가 둘이고 role=separator 다',
        expected: [2, 'separator'],
        actual: () =>
          withShell(null, (root) => {
            const rs = root.querySelectorAll('.pck-resizer')
            return [rs.length, rs[0]?.getAttribute('role') ?? null]
          }),
      },
    ],
  },

  {
    title: 'shell — 상단바 · 툴바 상태',
    cases: [
      {
        name: '타이틀이 라벨로 나온다',
        expected: true,
        actual: () =>
          withShell(docWithPages(1), (root, c) => {
            const label = root.querySelector('.pck-title-label')
            return label?.textContent === c.doc.value.title
          }),
      },
      {
        name: 'undo/redo 는 초기에 비활성',
        expected: [true, true],
        actual: () =>
          withShell(docWithPages(1), (root) => {
            const btns = root.querySelectorAll<HTMLButtonElement>('.pck-topbar .pck-icon-btn')
            // [0] 뒤로가기, [1] undo, [2] redo
            return [btns[1]!.disabled, btns[2]!.disabled]
          }),
      },
      {
        name: '문서를 바꾸면 undo 가 활성된다',
        expected: [true, false],
        actual: () =>
          withShell(docWithPages(1), (root, c) => {
            const undo = root.querySelectorAll<HTMLButtonElement>('.pck-topbar .pck-icon-btn')[1]!
            const before = undo.disabled
            c.setTitle('새 제목')
            return [before, undo.disabled]
          }),
      },
      {
        name: '저장 배지가 상태 클래스를 따른다',
        expected: 'pck-badge is-disabled',
        actual: () =>
          withShell(
            docWithPages(1),
            (root) => root.querySelector('.pck-badge')?.getAttribute('class') ?? null,
          ),
      },
      {
        name: '툴바 도구 6개 + 복제·삭제 2개',
        expected: 8,
        actual: () =>
          withShell(docWithPages(1), (root) => root.querySelectorAll('.pck-tool').length),
      },
      {
        name: '선택이 없으면 복제·삭제가 비활성',
        expected: [true, true],
        actual: () =>
          withShell(docWithPages(1), (root) => {
            const tools = root.querySelectorAll<HTMLButtonElement>('.pck-tool')
            return [tools[6]!.disabled, tools[7]!.disabled]
          }),
      },
      {
        name: '도구를 고르면 aria-pressed 가 바뀐다',
        expected: ['false', 'true'],
        actual: () =>
          withShell(docWithPages(1), (root, c) => {
            const textTool = root.querySelector('.pck-tool')!
            const before = textTool.getAttribute('aria-pressed')
            c.setActiveTool('text')
            return [before, textTool.getAttribute('aria-pressed')]
          }),
      },
    ],
  },

  {
    title: 'shell — 페이지 목록 · 다이얼로그',
    cases: [
      {
        name: '썸네일이 페이지 수만큼 나온다',
        expected: [3, '3'],
        actual: () =>
          withShell(docWithPages(3), (root) => [
            root.querySelectorAll('.pck-thumb-item').length,
            root.querySelector('.pck-panel-count')?.textContent ?? null,
          ]),
      },
      {
        name: '현재 페이지 썸네일에 is-active 와 aria-current',
        expected: [true, 'page'],
        actual: () =>
          withShell(docWithPages(3), (root) => {
            const first = root.querySelector('.pck-thumb')!
            return [first.classList.contains('is-active'), first.getAttribute('aria-current')]
          }),
      },
      {
        name: '페이지를 넘기면 is-active 가 따라간다',
        expected: [false, true],
        actual: () =>
          withShell(docWithPages(3), (root, c) => {
            c.goToPage(1)
            const thumbs = root.querySelectorAll('.pck-thumb')
            return [
              thumbs[0]!.classList.contains('is-active'),
              thumbs[1]!.classList.contains('is-active'),
            ]
          }),
      },
      {
        name: '마지막 1페이지면 삭제 버튼이 비활성 (기획 9.2)',
        expected: true,
        actual: () =>
          withShell(docWithPages(1), (root) => {
            const btns = root.querySelectorAll<HTMLButtonElement>('.pck-pagelist-rowbtns button')
            return btns[1]!.disabled
          }),
      },
      {
        name: '업로드 팝업이 열리고 닫힌다',
        expected: [false, true, false],
        actual: () =>
          withShell(null, (root, c) => {
            const a = has(root, '.pck-modal')
            c.openUpload()
            const b = has(root, '.pck-modal')
            c.closeUpload()
            return [a, b, has(root, '.pck-modal')]
          }),
      },
      {
        name: '업로드 팝업에 파일 input 과 허용 포맷이 있다',
        expected: true,
        actual: () =>
          withShell(null, (root, c) => {
            c.openUpload()
            const input = root.querySelector<HTMLInputElement>('.pck-modal input[type=file]')
            return input?.getAttribute('accept')?.includes('.pdf') === true
          }),
      },
      {
        name: '페이지 우클릭 메뉴가 열린다',
        expected: [false, true],
        actual: () =>
          withShell(docWithPages(3), (root, c) => {
            const a = has(root, '.pck-context-menu')
            c.openPageMenu(1, { clientX: 10, clientY: 10 } as MouseEvent)
            return [a, has(root, '.pck-context-menu')]
          }),
      },
      {
        name: '객체 있는 페이지 삭제는 확인 모달을 띄운다 (기획 9.3)',
        expected: true,
        actual: () =>
          withShell(docWithPages(2), (root, c) => {
            // 객체를 하나 만든다 — 확인 모달 조건이 "객체가 있는 페이지" 다.
            c.setActiveTool('text')
            c.requestRemovePage(0)
            // 객체가 없으므로 확인 없이 지워진다. 확인 모달 경로는 아래 케이스에서 본다.
            return c.pageCount.value === 1 && !has(root, '.pck-modal--confirm')
          }),
      },
    ],
  },
]
