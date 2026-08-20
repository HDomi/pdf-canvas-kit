/**
 * 컨트롤러 검증 케이스 (PLAN 20.1, R3).
 *
 * `src/controller/**` 는 순수 함수가 아니라 **조립체**다. 엔진·뷰 상태·좌표계를 엮으므로
 * 케이스가 확인할 수 있는 것은 "signal 이 올바르게 연결됐는가" 다.
 *
 * 이게 Vue 판을 이식할 때 가장 위험한 지점이다 — 깊은 반응성이 없어서(ARCHITECTURE §12.1)
 * `view.value.activeTool = x` 류의 코드는 **조용히** 아무 일도 하지 않는다. 아래 케이스들은
 * 그 조용한 실패를 시끄럽게 만든다.
 *
 * ⚠️ **덮이지 않는 것**: happy-dom 은 `getBoundingClientRect()` 가 전부 0 이고 레이아웃이 없다.
 * 그래서 맞춤 배율·줌 앵커링·좌표 변환은 여기서 검증되지 않는다. 브라우저에서 손으로 확인해야
 * 한다 (PLAN 20.5).
 */
import { createEditorController } from '../../src/controller/editor'
import { createEditorViewSignals } from '../../src/controller/editorState'
import { createPageNav } from '../../src/controller/pageNav'
import { isTextEntry } from '../../src/controller/textEntry'
import { configureStrings, resetStrings, text } from 'pdf-canvas-kit'
import { computed, scope, signal } from '../../src/dom/reactive'
import { createPage, createPDFCanvasDoc, createViewState, A4_PT } from 'pdf-canvas-kit'
import type { PDFCanvasDoc, PDFCanvasPage } from 'pdf-canvas-kit'
import type { CaseGroup } from './cases'

/** 페이지 n장을 가진 문서. 배경 없이 만든다 — 여기서는 렌더하지 않는다. */
function docWithPages(count: number): PDFCanvasDoc {
  const pages: PDFCanvasPage[] = []
  for (let i = 0; i < count; i++) pages.push(createPage({ size: A4_PT }))
  return createPDFCanvasDoc({ pages })
}

/**
 * 컨트롤러를 scope 안에서 만들고 정리까지 해 준다.
 *
 * scope 없이 만들면 `window` 리스너와 effect 가 케이스마다 쌓여, 뒤쪽 케이스가 앞쪽의
 * 리스너에 영향을 받는다.
 */
function withController<T>(
  doc: PDFCanvasDoc | null,
  fn: (c: ReturnType<typeof createEditorController>) => T,
): T {
  const [result, dispose] = scope(() => {
    const c = createEditorController(doc ? { doc } : {})
    return fn(c)
  })
  dispose()
  return result
}

export const CONTROLLER_GROUPS: CaseGroup[] = [
  {
    title: 'controller — 뷰 상태 signal',
    note: 'Vue 판은 createViewState() 를 통째로 ref 에 담고 필드를 변형했다. 얕은 signal 에서는 그게 조용히 실패하므로 필드마다 signal 을 둔다.',
    cases: [
      {
        name: '기본값이 createViewState() 와 일치한다',
        expected: (() => {
          const d = createViewState()
          return [d.currentPageIndex, d.selectedObjectIds, d.activeTool, d.gridSnap, d.panArmed]
        })(),
        actual: () => {
          const v = createEditorViewSignals()
          return [
            v.currentPageIndex.value,
            v.selectedObjectIds.value,
            v.activeTool.value,
            v.gridSnap.value,
            v.panArmed.value,
          ]
        },
      },
      {
        name: '⚠️ gridSnap 기본은 꺼짐 — 상수가 4 인 것과 별개다',
        expected: false,
        actual: () => createEditorViewSignals().gridSnap.value,
      },
      {
        name: '필드마다 signal 이라 대입이 반응성을 일으킨다',
        expected: ['select', 'text'],
        actual: () => {
          const v = createEditorViewSignals()
          const seen: string[] = []
          const [, dispose] = scope(() => {
            const c = computed(() => v.activeTool.value)
            seen.push(c.value)
            v.activeTool.value = 'text'
            seen.push(c.value)
          })
          dispose()
          return seen
        },
      },
    ],
  },

  {
    title: 'controller — pageNav',
    note: '페이지를 전환하면 스크롤을 리셋하고 선택을 비운다. 둘 중 하나라도 그대로 넘기면 이미 화면에 없는 내용을 가리킨다.',
    cases: [
      {
        name: '빈 문서에서 currentPage 는 null, 표시 번호는 0',
        expected: [null, 0],
        actual: () => {
          const pages = signal<PDFCanvasPage[]>([])
          const view = createEditorViewSignals()
          const nav = createPageNav({
            pages,
            currentPageIndex: view.currentPageIndex,
            selectedObjectIds: view.selectedObjectIds,
            stageEl: signal(null),
          })
          return [nav.currentPage.value, nav.currentPageNumber.value]
        },
      },
      {
        name: 'goTo 는 범위를 클램프한다',
        expected: [0, 2, 2],
        actual: () => {
          const pages = signal<PDFCanvasPage[]>(docWithPages(3).pages)
          const view = createEditorViewSignals()
          const nav = createPageNav({
            pages,
            currentPageIndex: view.currentPageIndex,
            selectedObjectIds: view.selectedObjectIds,
            stageEl: signal(null),
          })
          nav.goTo(-5)
          const a = view.currentPageIndex.value
          nav.goTo(99)
          const b = view.currentPageIndex.value
          nav.last()
          return [a, b, view.currentPageIndex.value]
        },
      },
      {
        name: '페이지를 전환하면 선택이 비워진다',
        expected: [['x'], []],
        actual: () => {
          const pages = signal<PDFCanvasPage[]>(docWithPages(3).pages)
          const view = createEditorViewSignals()
          const nav = createPageNav({
            pages,
            currentPageIndex: view.currentPageIndex,
            selectedObjectIds: view.selectedObjectIds,
            stageEl: signal(null),
          })
          nav.goTo(0)
          view.selectedObjectIds.value = ['x']
          const before = view.selectedObjectIds.value
          nav.goTo(1)
          return [before, view.selectedObjectIds.value]
        },
      },
      {
        name: '같은 페이지로 goTo 하면 선택을 건드리지 않는다',
        expected: ['x'],
        actual: () => {
          const pages = signal<PDFCanvasPage[]>(docWithPages(3).pages)
          const view = createEditorViewSignals()
          const nav = createPageNav({
            pages,
            currentPageIndex: view.currentPageIndex,
            selectedObjectIds: view.selectedObjectIds,
            stageEl: signal(null),
          })
          nav.goTo(1)
          view.selectedObjectIds.value = ['x']
          nav.goTo(1)
          return view.selectedObjectIds.value
        },
      },
      {
        name: 'goToPageId 는 없는 id 를 무시한다',
        expected: [1, 1],
        actual: () => {
          const doc = docWithPages(3)
          const pages = signal<PDFCanvasPage[]>(doc.pages)
          const view = createEditorViewSignals()
          const nav = createPageNav({
            pages,
            currentPageIndex: view.currentPageIndex,
            selectedObjectIds: view.selectedObjectIds,
            stageEl: signal(null),
          })
          nav.goTo(1)
          nav.goToPageId('nope')
          const a = view.currentPageIndex.value
          nav.goToPageId(doc.pages[1]!.id)
          return [a, view.currentPageIndex.value]
        },
      },
      {
        name: 'reclamp 은 페이지가 줄면 인덱스를 당긴다',
        expected: [2, 0],
        actual: () => {
          const doc = docWithPages(3)
          const pages = signal<PDFCanvasPage[]>(doc.pages)
          const view = createEditorViewSignals()
          const nav = createPageNav({
            pages,
            currentPageIndex: view.currentPageIndex,
            selectedObjectIds: view.selectedObjectIds,
            stageEl: signal(null),
          })
          nav.goTo(2)
          const before = view.currentPageIndex.value
          pages.value = [doc.pages[0]!]
          nav.reclamp()
          return [before, view.currentPageIndex.value]
        },
      },
    ],
  },

  {
    title: 'strings — 단일 문구 표 · textEntry',
    note: 'i18n 시스템(I18nPort · createI18n · ko/en 두 표 · locale 전환)을 제거하고 문구만 남겼다 (2026.08.20). 다국어는 나중에 다시 설계한다.',
    cases: [
      {
        name: '기본 표에서 문구를 읽는다',
        expected: true,
        actual: () => text('error.pageLimit').length > 0,
      },
      {
        name: '없는 키는 키 자체를 돌려준다 (빈 화면보다 발견하기 쉽다)',
        expected: 'nope.missing.key',
        actual: () => text('nope.missing.key'),
      },
      {
        name: '{name} 자리를 vars 로 채운다',
        expected: true,
        actual: () => text('error.exportBlocked', { count: 3 }).includes('3'),
      },
      {
        name: 'vars 에 없는 자리는 그대로 남긴다',
        expected: true,
        actual: () => text('error.exportBlocked').includes('{count}'),
      },
      {
        name: 'configureStrings 는 지정한 키만 덮는다',
        expected: ['덮음', true],
        actual: () => {
          const other = text('error.pageLimit')
          configureStrings({ 'error.format': '덮음' })
          const result = [text('error.format'), text('error.pageLimit') === other]
          resetStrings()
          return result
        },
      },
      {
        name: 'resetStrings 가 기본값으로 되돌린다',
        expected: true,
        actual: () => {
          const before = text('error.format')
          configureStrings({ 'error.format': '임시' })
          resetStrings()
          return text('error.format') === before
        },
      },
      {
        name: 'isTextEntry 는 input·textarea·select·contenteditable 을 잡는다',
        expected: [true, true, true, true, false, false],
        actual: () => {
          const mk = (tag: string, editable = false) => {
            const e = document.createElement(tag)
            if (editable) e.setAttribute('contenteditable', 'true')
            return e
          }
          return [
            isTextEntry(mk('input')),
            isTextEntry(mk('textarea')),
            isTextEntry(mk('select')),
            isTextEntry(mk('div', true)),
            isTextEntry(mk('div')),
            isTextEntry(null),
          ]
        },
      },
    ],
  },

  {
    title: 'controller — 루트 조립 (createEditorController)',
    note: '엔진·뷰 상태·검증이 실제로 엮이는지 확인한다. 레이아웃이 필요한 것(맞춤 배율·좌표)은 여기서 덮이지 않는다.',
    cases: [
      {
        name: '문서 없이 만들면 빈 문서 · 페이지 0',
        expected: [0, -1, true],
        actual: () =>
          withController(null, (c) => [
            c.pageCount.value,
            c.currentPageIndex.value,
            c.canExport.value === false,
          ]),
      },
      {
        name: '초기 문서의 페이지 수가 반영된다',
        expected: [3, true],
        actual: () =>
          withController(docWithPages(3), (c) => [c.pageCount.value, c.canExport.value]),
      },
      {
        name: '초기 문서가 있으면 첫 페이지가 선택된다',
        expected: [0, 1],
        actual: () =>
          withController(docWithPages(3), (c) => [
            c.currentPageIndex.value,
            c.currentPageNumber.value,
          ]),
      },
      {
        name: 'setActiveTool 이 signal 에 반영된다',
        expected: ['select', 'custom:demo.box'],
        actual: () =>
          withController(docWithPages(1), (c) => {
            const before = c.activeTool.value
            c.setActiveTool('custom:demo.box')
            return [before, c.activeTool.value]
          }),
      },
      {
        name: 'readOnly 는 setProps 로 갱신된다',
        expected: [false, true],
        actual: () =>
          withController(docWithPages(1), (c) => {
            const before = c.readOnly.value
            c.setProps({ readOnly: true })
            return [before, c.readOnly.value]
          }),
      },
      {
        name: 'readOnly 면 타이틀 변경이 무시된다',
        expected: true,
        actual: () =>
          withController(docWithPages(1), (c) => {
            const before = c.doc.value.title
            c.setProps({ readOnly: true })
            c.setTitle('바뀌면 안 됨')
            return c.doc.value.title === before
          }),
      },
      {
        name: '타이틀 변경이 문서에 반영되고 undo 가 가능해진다',
        expected: ['새 제목', true],
        actual: () =>
          withController(docWithPages(1), (c) => {
            c.setTitle('새 제목')
            return [c.doc.value.title, c.canUndo.value]
          }),
      },
      {
        name: 'undo 가 타이틀을 되돌린다',
        expected: true,
        actual: () =>
          withController(docWithPages(1), (c) => {
            const before = c.doc.value.title
            c.setTitle('임시')
            c.undo()
            return c.doc.value.title === before
          }),
      },
      {
        name: 'onChange 콜백이 문서 변경마다 불린다',
        expected: 1,
        actual: () => {
          let calls = 0
          return withController(docWithPages(1), (c) => {
            c.setProps({ onChange: () => calls++ })
            c.setTitle('제목')
            return calls
          })
        },
      },
      {
        name: '⚠️ setProps 의 doc 은 무시된다 (controlled 아님 — PLAN 20.8)',
        expected: 1,
        actual: () =>
          withController(docWithPages(1), (c) => {
            c.setProps({ doc: docWithPages(5) })
            return c.pageCount.value
          }),
      },
      {
        name: '빈 페이지 추가가 페이지 수를 늘리고 그 페이지로 이동한다',
        expected: [2, 1],
        actual: () =>
          withController(docWithPages(1), (c) => {
            c.addBlankPage()
            return [c.pageCount.value, c.currentPageIndex.value]
          }),
      },
      {
        name: '마지막 1페이지는 삭제되지 않고 안내 문구가 뜬다 (PLAN Q4)',
        expected: [1, true],
        actual: () =>
          withController(docWithPages(1), (c) => {
            c.requestRemovePage(0)
            return [c.pageCount.value, c.toolError.value !== null]
          }),
      },
      {
        name: '객체 없는 페이지는 확인 없이 삭제된다',
        expected: [2, null],
        actual: () =>
          withController(docWithPages(3), (c) => {
            c.requestRemovePage(0)
            return [c.pageCount.value, c.pendingPageDelete.value]
          }),
      },
      {
        name: '페이지 복제가 다음 자리로 들어간다',
        expected: [2, 1],
        actual: () =>
          withController(docWithPages(1), (c) => {
            c.duplicatePage(0)
            return [c.pageCount.value, c.currentPageIndex.value]
          }),
      },
      {
        name: '업로드 팝업 열기·닫기',
        expected: [false, true, false],
        actual: () =>
          withController(null, (c) => {
            const a = c.uploadOpen.value
            c.openUpload()
            const b = c.uploadOpen.value
            c.closeUpload()
            return [a, b, c.uploadOpen.value]
          }),
      },
      {
        name: 'modalOpen 은 업로드 팝업을 따라간다',
        expected: [false, true],
        actual: () =>
          withController(null, (c) => {
            const a = c.modalOpen.value
            c.openUpload()
            return [a, c.modalOpen.value]
          }),
      },
      {
        name: '페이지 0 이면 내보내기가 막힌다',
        expected: false,
        actual: () => withController(null, (c) => c.canExport.value),
      },
      {
        name: '검증 결과가 문서에서 파생된다 (객체 0 이면 위반 없음)',
        expected: 0,
        actual: () => withController(docWithPages(1), (c) => c.validation.value.issues.length),
      },
      {
        name: 'scope dispose 후 문서 변경 콜백이 오지 않는다',
        expected: 0,
        actual: () => {
          let calls = 0
          const [c, dispose] = scope(() => createEditorController({ doc: docWithPages(1) }))
          c.setProps({ onChange: () => calls++ })
          dispose()
          c.setTitle('dispose 후')
          return calls
        },
      },
    ],
  },
]
