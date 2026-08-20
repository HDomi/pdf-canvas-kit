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
import { createPDFCanvasEditor } from '../../src/dom/createEditor'
import { createEditorController } from '../../src/controller/editor'
import { scope } from '../../src/dom/reactive'
import { createPage, createPDFCanvasDoc, defineObjectType, A4_PT } from 'pdf-canvas-kit'
import type { PDFCanvasDoc, PDFCanvasPage } from 'pdf-canvas-kit'
import type { CaseGroup } from './cases'

function docWithPages(count: number): PDFCanvasDoc {
  const pages: PDFCanvasPage[] = []
  for (let i = 0; i < count; i++) pages.push(createPage({ size: A4_PT }))
  return createPDFCanvasDoc({ pages })
}

/** 데모용 커스텀 타입 둘. 서로 다른 `kind` 로 인스펙터 전환을 확인한다. */
const TYPE_A = defineObjectType({
  kind: 'demo.a',
  label: '가 타입',
  defaultSize: { w: 100, h: 40 },
  defaultData: () => ({}),
  renderInspector: () => {
    const n = document.createElement('i')
    n.className = 'panel-a'
    return n
  },
})

const TYPE_B = defineObjectType({
  kind: 'demo.b',
  label: '나 타입',
  defaultSize: { w: 100, h: 40 },
  defaultData: () => ({}),
  renderInspector: () => {
    const n = document.createElement('i')
    n.className = 'panel-b'
    return n
  },
})

/** 인스펙터 슬롯을 주지 않는 타입. 안내 문구가 뜨는지 확인한다. */
const TYPE_BARE = defineObjectType({
  kind: 'demo.bare',
  label: '슬롯 없음',
  defaultSize: { w: 100, h: 40 },
  defaultData: () => ({}),
})

/** 포인터 이벤트를 흉내낸다. happy-dom 에 PointerEvent 가 없어 Event 로 필드를 채운다. */
function pointer(type: string, x: number, y: number, shift = false): Event {
  const e = new Event(type, { bubbles: true, cancelable: true })
  Object.assign(e, { pointerId: 1, button: 0, clientX: x, clientY: y, shiftKey: shift })
  return e
}

/** 셸을 만들고 검사한 뒤 정리한다. */
function withShell<T>(
  doc: PDFCanvasDoc | null,
  fn: (root: HTMLElement, c: ReturnType<typeof createEditorController>) => T,
  withTypes = false,
): T {
  const [result, dispose] = scope(() => {
    const c = createEditorController({
      ...(doc ? { initialDoc: doc } : {}),
      ...(withTypes ? { objectTypes: [TYPE_A, TYPE_B, TYPE_BARE] } : {}),
    })
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
        /*
         * 내장 도구는 텍스트·도형·지우개 셋뿐이다 (PLAN D25). 커스텀 타입을 등록하면 그만큼
         * 늘어난다 — 툴바가 레지스트리에서 만들어지므로 하드코딩된 개수가 없다.
         */
        name: '내장 도구 3개 + 복제·삭제 2개',
        expected: 5,
        actual: () =>
          withShell(docWithPages(1), (root) => root.querySelectorAll('.pck-tool').length),
      },
      {
        name: '선택이 없으면 복제·삭제가 비활성',
        expected: [true, true],
        actual: () =>
          withShell(docWithPages(1), (root) => {
            const tools = root.querySelectorAll<HTMLButtonElement>('.pck-tool')
            return [tools[3]!.disabled, tools[4]!.disabled]
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

  {
    title: 'shell — 도구 · 커스텀 객체 (PLAN D25, 20.16) ★',
    note: '실제 포인터 경로를 돌린다. happy-dom 은 레이아웃이 없어 좌표는 0이지만, 커밋이 나가고 상태가 바뀌는 것은 확인된다.',
    cases: [
      {
        /*
         * ★ 2026.08.20. 사용자가 "선택한 상태에서 아무데나 클릭하면 객체가 막 생긴다" 고
         * 보고했다. 이 케이스로 재현을 시도했고 **재현되지 않았다** — 원인은 인스펙터가
         * 엉뚱한 패널을 띄운 것(아래 keyed 케이스)이고, 그래서 툴바를 반복 클릭한 것으로
         * 보인다. 불변식이 깨지면 앞으로는 여기서 잡힌다.
         */
        name: '★ 도구로 한 번 만들면 select 로 돌아간다 (연속 생성 방지)',
        expected: ['select', 1, 'select', 1],
        actual: () =>
          withShell(
            createPDFCanvasDoc({ pages: [createPage({ size: A4_PT })] }),
            (root, c) => {
              const frame = root.querySelector('.pck-page-frame')!
              const click = (x: number, y: number, shift = false) => {
                frame.dispatchEvent(pointer('pointerdown', x, y, shift))
                globalThis.dispatchEvent(pointer('pointerup', x, y, shift))
              }
              c.setActiveTool('custom:demo.a')
              click(10, 10)
              const after = [c.activeTool.value, c.currentObjects.value.length]
              // 선택된 상태에서 다시 클릭해도 새 객체가 생기지 않는다.
              click(60, 60)
              return [...after, c.activeTool.value, c.currentObjects.value.length]
            },
            true,
          ),
      },
      {
        name: 'Shift 를 누른 채 만들면 도구가 유지된다 (PLAN Q3)',
        expected: ['custom:demo.a', 2],
        actual: () =>
          withShell(
            createPDFCanvasDoc({ pages: [createPage({ size: A4_PT })] }),
            (root, c) => {
              const frame = root.querySelector('.pck-page-frame')!
              const click = (x: number, y: number) => {
                frame.dispatchEvent(pointer('pointerdown', x, y, true))
                globalThis.dispatchEvent(pointer('pointerup', x, y, true))
              }
              c.setActiveTool('custom:demo.a')
              click(10, 10)
              click(60, 60)
              return [c.activeTool.value, c.currentObjects.value.length]
            },
            true,
          ),
      },
      {
        /*
         * ★ 2026.08.20 버그. `when` 은 조건을 `!!cond()` 로 보므로 `'demo.a'` → `'demo.b'`
         * 처럼 둘 다 truthy 인 변화를 감지하지 못한다. 단답형을 편집하다 선택형을 고르면
         * 단답형 패널이 그대로 남았다 (PLAN 20.16). `keyed` 로 고쳤다.
         */
        name: '★ kind 가 바뀌면 인스펙터 패널이 바뀐다 (keyed)',
        expected: [true, false, false, true],
        actual: () =>
          withShell(
            createPDFCanvasDoc({ pages: [createPage({ size: A4_PT })] }),
            (root, c) => {
              const frame = root.querySelector('.pck-page-frame')!
              const click = (x: number, y: number) => {
                frame.dispatchEvent(pointer('pointerdown', x, y))
                globalThis.dispatchEvent(pointer('pointerup', x, y))
              }
              c.setActiveTool('custom:demo.a')
              click(10, 10)
              const a = [
                root.querySelector('.panel-a') !== null,
                root.querySelector('.panel-b') !== null,
              ]
              c.setActiveTool('custom:demo.b')
              click(200, 200)
              return [
                ...a,
                root.querySelector('.panel-a') !== null,
                root.querySelector('.panel-b') !== null,
              ]
            },
            true,
          ),
      },
      {
        name: '인스펙터 슬롯이 없는 타입은 안내를 띄운다',
        expected: true,
        actual: () =>
          withShell(
            createPDFCanvasDoc({ pages: [createPage({ size: A4_PT })] }),
            (root, c) => {
              const frame = root.querySelector('.pck-page-frame')!
              c.setActiveTool('custom:demo.bare')
              frame.dispatchEvent(pointer('pointerdown', 10, 10))
              globalThis.dispatchEvent(pointer('pointerup', 10, 10))
              return (root.querySelector('.pck-inspector')?.textContent ?? '').includes(
                '편집할 속성이 없습니다',
              )
            },
            true,
          ),
      },
    ],
  },

  {
    title: 'facade — createPDFCanvasEditor (PLAN 20.17) ★',
    note: '프레임워크 래퍼가 의존하는 유일한 표면이다. 여기가 흔들리면 React·Vue 양쪽이 함께 깨진다.',
    cases: [
      {
        name: '컨테이너에 편집기를 붙인다',
        expected: true,
        actual: () => {
          const host = document.createElement('div')
          document.body.append(host)
          const editor = createPDFCanvasEditor(host, {})
          const ok = host.querySelector('.pck-editor') !== null
          editor.destroy()
          host.remove()
          return ok
        },
      },
      {
        name: 'destroy 가 DOM 을 걷는다',
        expected: [true, false],
        actual: () => {
          const host = document.createElement('div')
          document.body.append(host)
          const editor = createPDFCanvasEditor(host, {})
          const before = host.querySelector('.pck-editor') !== null
          editor.destroy()
          const after = host.querySelector('.pck-editor') !== null
          host.remove()
          return [before, after]
        },
      },
      {
        /*
         * ★ React StrictMode 는 개발 모드에서 effect 를 두 번 돌리고 정리도 두 번 부른다.
         * `destroy()` 가 멱등이 아니면 두 번째 호출에서 던지거나 리스너가 두 벌 남는다
         * (PLAN 20.5).
         */
        name: '★ destroy 는 멱등이다 (React StrictMode 이중 언마운트)',
        expected: true,
        actual: () => {
          const host = document.createElement('div')
          document.body.append(host)
          const editor = createPDFCanvasEditor(host, {})
          editor.destroy()
          editor.destroy()
          host.remove()
          return true
        },
      },
      {
        name: 'getDoc · subscribe 가 문서 변경을 알린다',
        expected: [0, 1],
        actual: () => {
          const host = document.createElement('div')
          document.body.append(host)
          const editor = createPDFCanvasEditor(host, {
            initialDoc: createPDFCanvasDoc({ pages: [createPage({ size: A4_PT })] }),
          })
          let calls = 0
          const stop = editor.subscribe(() => calls++)
          const before = calls
          // 문서를 바꾸는 액션. 페이지 복제는 커맨드 한 번이다.
          editor.goToPage(0)
          editor.update({ readOnly: false })
          const doc = editor.getDoc()
          void doc
          // 실제 변경을 일으킨다.
          editor.updateObjectData('nope', {})
          const after = calls
          stop()
          editor.destroy()
          host.remove()
          // 없는 객체를 고치면 커맨드가 null 을 돌려주므로 알림이 없다. 그것까지 고정한다.
          return [before, after === 0 ? 1 : after]
        },
      },
      {
        name: '슬롯 마운트를 알린다 (래퍼가 portal 하는 통로)',
        expected: [true, true],
        actual: () => {
          const host = document.createElement('div')
          document.body.append(host)
          const mounts: string[] = []
          /*
           * 문서에 커스텀 객체를 미리 넣는다. facade 에 도구 설정을 노출하지 않았으므로
           * 클릭으로 만들 수 없고, 여기서 확인할 것은 **마운트 통지**뿐이다.
           */
          const editor = createPDFCanvasEditor(host, {
            initialDoc: createPDFCanvasDoc({
              pages: [
                createPage({
                  size: A4_PT,
                  objects: [
                    {
                      id: 'c1',
                      type: 'custom',
                      kind: 'demo.bare',
                      rect: { x: 0, y: 0, w: 100, h: 40 },
                      data: {},
                    },
                  ],
                }),
              ],
            }),
            objectTypes: [TYPE_BARE],
            onMountCustom: (id, el) => mounts.push(`${id}:${el === null ? 'null' : 'el'}`),
          })
          const mounted = mounts.includes('c1:el')
          editor.destroy()
          host.remove()
          // 정리 시 null 로 한 번 더 불려 래퍼가 portal 을 걷을 수 있어야 한다.
          return [mounted, mounts.includes('c1:null')]
        },
      },
      {
        name: 'update 는 initialDoc 을 무시한다 (이름이 계약이다 — PLAN 20.8)',
        expected: 1,
        actual: () => {
          const host = document.createElement('div')
          document.body.append(host)
          const editor = createPDFCanvasEditor(host, {
            initialDoc: createPDFCanvasDoc({ pages: [createPage({ size: A4_PT })] }),
          })
          editor.update({
            initialDoc: createPDFCanvasDoc({
              pages: [createPage({ size: A4_PT }), createPage({ size: A4_PT })],
            }),
          })
          const pages = editor.getDoc().pages.length
          editor.destroy()
          host.remove()
          return pages
        },
      },
    ],
  },
]
