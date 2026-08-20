/**
 * 뷰어 검증 (PLAN R11 · 20.20).
 *
 * 뷰어의 핵심 로직은 **배율 파생**과 **슬롯 분기**다. 둘 다 레이아웃 없이 확인할 수 있다 —
 * 배율은 순수 산술이고, 슬롯은 어느 함수를 부르는가의 문제다.
 *
 * ⚠️ **확인되지 않는 것:** 375px 폭에서 가로 스크롤이 없는지(D15 DoD), `ResizeObserver` 가
 * 실제로 발화하는지, 연속 스크롤에서 `scrollIntoView` 가 맞는 위치로 가는지. happy-dom 에는
 * 레이아웃이 없어 `getBoundingClientRect()` 가 전부 0 이다 (PLAN 20.5).
 */
import { createViewerController } from '../../src/controller/viewer'
import { createPDFCanvasViewer } from '../../src/dom/createViewer'
import { viewerObject } from '../../src/dom/viewer/viewerObject'
import { createObjectTypeRegistry } from '../../src/core/objectTypes'
import { effect, scope, signal } from '../../src/dom/reactive'
import { asPublicDoc, createPDFCanvasDoc, createPage, defineObjectType } from 'pdf-canvas-kit'
import type { CustomObject, PDFCanvasObject, PublicPDFCanvasDoc } from 'pdf-canvas-kit'
import type { CaseGroup } from './cases'

/**
 * 배율 케이스는 **정수 폭 페이지**를 쓴다.
 *
 * `setContainerWidth` 가 픽셀을 반올림하므로(서브픽셀 폭은 의미가 없다) A4 의 595.28pt 로는
 * `width / page.width` 가 정수로 떨어지지 않는다. 산술을 확인하려는 케이스에서 부동소수점
 * 오차를 비교하게 되므로 페이지 크기를 정수로 둔다.
 */
const SQUARE = { width: 400, height: 600 }

function docWith(objects: PDFCanvasObject[] = [], pageCount = 1): PublicPDFCanvasDoc {
  const pages = []
  for (let i = 0; i < pageCount; i++) {
    pages.push(createPage({ size: SQUARE, ...(i === 0 ? { objects } : {}) }))
  }
  return asPublicDoc(createPDFCanvasDoc({ pages }))
}

const custom = (id: string, kind: string, data: unknown = {}): CustomObject => ({
  id,
  type: 'custom',
  kind,
  rect: { x: 10, y: 20, w: 100, h: 40 },
  data,
})

/** 뷰어 슬롯만 가진 타입. */
const VIEWER_TYPE = defineObjectType<{ v?: string }>({
  kind: 'demo.v',
  label: '뷰어형',
  defaultSize: { w: 100, h: 40 },
  defaultData: () => ({}),
  renderViewer: ({ data, onUpdate }) => {
    const node = document.createElement('input')
    node.className = 'marker-viewer'
    const sync = () => (node.value = data().v ?? '')
    sync()
    onUpdate(sync)
    return node
  },
})

/** 편집기 슬롯만 가진 타입. 뷰어에서 그려지면 안 된다. */
const EDITOR_ONLY = defineObjectType({
  kind: 'demo.eo',
  label: '편집기만',
  defaultSize: { w: 100, h: 40 },
  defaultData: () => ({}),
  render: () => {
    const node = document.createElement('b')
    node.className = 'marker-editor'
    return node
  },
})

export const VIEWER_GROUPS: CaseGroup[] = [
  {
    title: 'viewer — 배율 파생 (D15) ★',
    note: '뷰어에는 줌이 없다. 배율은 컨테이너 폭에서만 나온다. 이 산술이 틀리면 페이지가 잘리거나 여백에 뜬다.',
    cases: [
      {
        name: '컨테이너 폭 / 페이지 폭',
        expected: 2,
        actual: () => {
          const c = createViewerController({ doc: docWith() })
          c.setContainerWidth(SQUARE.width * 2)
          return c.scaleOf(c.pages.value[0]!)
        },
      },
      {
        /*
         * ★ 측정 전에는 1 이다. 0 이면 프레임 높이가 0 이 되어 스크롤 컨테이너가 접히고,
         * ResizeObserver 가 그 접힌 폭을 다시 측정해 값이 굳는다.
         */
        name: '★ 측정 전 배율은 1 (0 이면 레이아웃이 붕괴한다)',
        expected: 1,
        actual: () => {
          const c = createViewerController({ doc: docWith() })
          return c.scaleOf(c.pages.value[0]!)
        },
      },
      {
        name: 'maxScale 상한을 넘지 않는다',
        expected: 1.5,
        actual: () => {
          const c = createViewerController({ doc: docWith(), maxScale: 1.5 })
          c.setContainerWidth(SQUARE.width * 3)
          return c.scaleOf(c.pages.value[0]!)
        },
      },
      {
        name: 'maxScale 은 상한일 뿐 확대하지 않는다',
        expected: 0.5,
        actual: () => {
          const c = createViewerController({ doc: docWith(), maxScale: 2 })
          c.setContainerWidth(SQUARE.width * 0.5)
          return c.scaleOf(c.pages.value[0]!)
        },
      },
      {
        /*
         * 페이지 크기가 섞인 문서. 문서 전체에 한 배율을 쓰면 작은 페이지가 여백에 뜬다.
         * PDF 를 합쳐 만든 문서에서 흔하다.
         */
        name: '페이지마다 자기 폭을 채운다 (크기 혼합 문서)',
        expected: [1, 2],
        actual: () => {
          const doc = asPublicDoc(
            createPDFCanvasDoc({
              pages: [
                createPage({ size: { width: 400, height: 600 } }),
                createPage({ size: { width: 200, height: 300 } }),
              ],
            }),
          )
          const c = createViewerController({ doc })
          c.setContainerWidth(400)
          return c.pages.value.map((p) => c.scaleOf(p))
        },
      },
      {
        /*
         * ResizeObserver 는 스크롤바 등장·소멸로도 발화한다. 같은 값에 매번 대입하면 배율이
         * 바뀌지 않아도 모든 페이지의 effect 가 다시 돈다 — effect 실행 횟수로 확인한다.
         */
        name: '★ 같은 폭을 다시 줘도 effect 가 다시 돌지 않는다',
        expected: 1,
        actual: () => {
          const c = createViewerController({ doc: docWith() })
          let runs = 0
          const [, dispose] = scope(() => {
            effect(() => {
              // 읽어서 의존성을 만든다. `void` 가 없으면 표현문 린트가 막는다.
              void c.containerWidthPx.value
              runs++
            })
          })
          const base = runs
          c.setContainerWidth(500)
          c.setContainerWidth(500)
          c.setContainerWidth(500.4) // 반올림하면 같은 500
          dispose()
          // 첫 대입 한 번만 effect 를 돌려야 한다.
          return runs - base
        },
      },
      {
        name: '소수 폭은 반올림한다',
        expected: 501,
        actual: () => {
          const c = createViewerController({ doc: docWith() })
          c.setContainerWidth(500.6)
          return c.containerWidthPx.value
        },
      },
    ],
  },

  {
    title: 'viewer — 문서는 controlled 다 ★',
    note: '편집기의 initialDoc 과 정반대다. 뷰어는 문서를 소유하지 않으므로 update 가 반영돼야 한다.',
    cases: [
      {
        name: '★ update({ doc }) 가 반영된다 (편집기와 반대)',
        expected: [1, 3],
        actual: () => {
          const c = createViewerController({ doc: docWith([], 1) })
          const before = c.pageCount.value
          c.setProps({ doc: docWith([], 3) })
          return [before, c.pageCount.value]
        },
      },
      {
        name: 'doc: null 이면 페이지가 없다 (던지지 않는다)',
        expected: 0,
        actual: () => {
          const c = createViewerController({ doc: null })
          return c.pageCount.value
        },
      },
      {
        name: 'objectTypes 는 최초 1회만 읽는다',
        expected: [true, false],
        actual: () => {
          const c = createViewerController({ doc: docWith(), objectTypes: [VIEWER_TYPE] })
          // setProps 에 objectTypes 가 없다 — 레지스트리는 고정이다.
          c.setProps({ doc: docWith() })
          return [c.types.has('demo.v'), c.types.has('demo.eo')]
        },
      },
      {
        name: 'onChangeData 는 교체할 수 있다 (응답 핸들러가 상태를 닫고 있다)',
        expected: ['first', 'second'],
        actual: () => {
          const seen: string[] = []
          const c = createViewerController({
            doc: docWith(),
            onChangeData: () => seen.push('first'),
          })
          c.emitChangeData('x', 1)
          c.setProps({ onChangeData: () => seen.push('second') })
          c.emitChangeData('x', 2)
          return seen
        },
      },
    ],
  },

  {
    title: 'viewer — 슬롯 분기 (D29) ★',
    note: 'renderViewer 와 render 는 다른 화면의 슬롯이다. 뷰어가 편집기 슬롯을 그리면 배지가 폼 자리에 들어간다.',
    cases: [
      {
        name: '★ renderViewer 를 부른다',
        expected: true,
        actual: () => {
          const node = viewerObject({
            object: signal<PDFCanvasObject>(custom('c1', 'demo.v', { v: 'hi' })),
            types: createObjectTypeRegistry([VIEWER_TYPE]),
            onChangeData: () => {},
          })
          return node.querySelector('.marker-viewer') !== null
        },
      },
      {
        name: '★ 편집기 전용 슬롯(render)은 뷰어에서 그리지 않는다',
        expected: false,
        actual: () => {
          const node = viewerObject({
            object: signal<PDFCanvasObject>(custom('c2', 'demo.eo')),
            types: createObjectTypeRegistry([EDITOR_ONLY]),
            onChangeData: () => {},
          })
          return node.querySelector('.marker-editor') !== null
        },
      },
      {
        name: 'renderViewer 가 없으면 portal 컨테이너를 알린다',
        expected: ['c3:el', 'c3:null'],
        actual: () => {
          const mounts: string[] = []
          // scope 를 열어야 onCleanup 이 동작한다 — 정리 시 null 통지가 그 안에 있다.
          const [, dispose] = scope(() =>
            viewerObject({
              object: signal<PDFCanvasObject>(custom('c3', 'demo.eo')),
              types: createObjectTypeRegistry([EDITOR_ONLY]),
              onChangeData: () => {},
              onMountCustom: (id, el) => mounts.push(`${id}:${el === null ? 'null' : 'el'}`),
            }),
          )
          dispose()
          return mounts
        },
      },
      {
        /*
         * 등록되지 않은 kind. 편집기는 물음표를 띄우지만 뷰어는 자리만 비운다 —
         * 학생이 할 수 있는 일이 없다.
         */
        name: '등록되지 않은 kind 는 자리만 남긴다 (객체를 버리지 않는다)',
        expected: [true, 100],
        actual: () => {
          const node = viewerObject({
            object: signal<PDFCanvasObject>(custom('c4', 'nope')),
            types: createObjectTypeRegistry([]),
            onChangeData: () => {},
          })
          const inner = node.querySelector('.pck-viewer-custom--unknown')
          return [inner !== null, Number.parseFloat(node.style.width)]
        },
      },
      {
        name: '응답 변경이 objectId 와 함께 올라온다 (D29 — 패키지는 저장하지 않는다)',
        expected: ['c5', 'typed'],
        actual: () => {
          const seen: unknown[] = []
          const def = defineObjectType<{ v?: string }>({
            kind: 'demo.emit',
            label: '응답형',
            defaultSize: { w: 100, h: 40 },
            defaultData: () => ({}),
            renderViewer: ({ onChange }) => {
              const n = document.createElement('input')
              n.addEventListener('input', () => onChange({ v: 'typed' }))
              return n
            },
          })
          const node = viewerObject({
            object: signal<PDFCanvasObject>(custom('c5', 'demo.emit')),
            types: createObjectTypeRegistry([def]),
            onChangeData: (id, next) => seen.push(id, (next as { v?: string }).v),
          })
          node.querySelector('input')!.dispatchEvent(new Event('input'))
          return seen
        },
      },
      {
        /*
         * 좌표 규칙. pt 를 px 로 그대로 쓴다 — 배율은 부모 페이지의 transform 한 곳에만 있다.
         * 여기서 곱하면 이중 적용된다 (CLAUDE.md 의 첫 번째 함정).
         */
        name: '★ pt 를 px 로 그대로 쓴다 (배율을 곱하지 않는다)',
        expected: ['10px', '20px', '100px', '40px'],
        actual: () => {
          const node = viewerObject({
            object: signal<PDFCanvasObject>(custom('c6', 'demo.v')),
            types: createObjectTypeRegistry([VIEWER_TYPE]),
            onChangeData: () => {},
          })
          return [node.style.left, node.style.top, node.style.width, node.style.height]
        },
      },
    ],
  },

  {
    title: 'viewer — facade (createPDFCanvasViewer)',
    cases: [
      {
        name: '컨테이너에 붙는다',
        expected: true,
        actual: () => {
          const host = document.createElement('div')
          document.body.append(host)
          const v = createPDFCanvasViewer(host, { doc: docWith() })
          const ok = host.querySelector('.pck-viewer') !== null
          v.destroy()
          host.remove()
          return ok
        },
      },
      {
        /*
         * doc 이 없을 때 회색 판만 남으면 "깨진 것" 처럼 보인다 — 2026.08.21 에 소비자 앱에서
         * 실제로 그렇게 보였다. 편집기의 emptyState 와 달리 버튼이 없다: 학생은 문서를
         * 불러올 수 없고 이 상태를 푸는 것은 호스트의 몫이다.
         */
        name: '★ doc 이 없으면 빈 상태를 보여준다 (회색 판만 남지 않는다)',
        expected: [true, false],
        actual: () => {
          const host = document.createElement('div')
          document.body.append(host)
          const v = createPDFCanvasViewer(host, { doc: null })
          const empty = host.querySelector('.pck-viewer-empty') !== null
          const hasButton = host.querySelector('.pck-viewer-empty button') !== null
          v.destroy()
          host.remove()
          return [empty, hasButton]
        },
      },
      {
        name: '문서가 들어오면 빈 상태가 사라진다',
        expected: [true, false],
        actual: () => {
          const host = document.createElement('div')
          document.body.append(host)
          const v = createPDFCanvasViewer(host, { doc: null })
          const before = host.querySelector('.pck-viewer-empty') !== null
          v.update({ doc: docWith([], 1) })
          const after = host.querySelector('.pck-viewer-empty') !== null
          v.destroy()
          host.remove()
          return [before, after]
        },
      },
      {
        name: '모든 페이지를 렌더한다 (연속 스크롤 — 편집기는 한 페이지뿐)',
        expected: 3,
        actual: () => {
          const host = document.createElement('div')
          document.body.append(host)
          const v = createPDFCanvasViewer(host, { doc: docWith([], 3) })
          const n = host.querySelectorAll('.pck-page-frame').length
          v.destroy()
          host.remove()
          return n
        },
      },
      {
        name: 'destroy 는 멱등이다 (React StrictMode)',
        expected: true,
        actual: () => {
          const host = document.createElement('div')
          document.body.append(host)
          const v = createPDFCanvasViewer(host, { doc: docWith() })
          v.destroy()
          v.destroy()
          host.remove()
          return true
        },
      },
      {
        name: 'update 후 페이지 수가 바뀐다',
        expected: [1, 2],
        actual: () => {
          const host = document.createElement('div')
          document.body.append(host)
          const v = createPDFCanvasViewer(host, { doc: docWith([], 1) })
          const before = host.querySelectorAll('.pck-page-frame').length
          v.update({ doc: docWith([], 2) })
          const after = host.querySelectorAll('.pck-page-frame').length
          v.destroy()
          host.remove()
          return [before, after]
        },
      },
      {
        name: '없는 id 로 스크롤하면 false (던지지 않는다)',
        expected: [false, false],
        actual: () => {
          const host = document.createElement('div')
          document.body.append(host)
          const v = createPDFCanvasViewer(host, { doc: docWith() })
          const r = [v.scrollToObject('nope'), v.scrollToPage('nope')]
          v.destroy()
          host.remove()
          return r
        },
      },
      {
        /*
         * `CSS.escape` 없이 선택자를 만들면 특수문자가 섞인 id 에서 던진다.
         * 서버가 만든 id 를 통제할 수 없으므로 확인해 둔다.
         */
        name: '★ 선택자 특수문자가 섞인 id 에서 던지지 않는다',
        expected: true,
        actual: () => {
          const host = document.createElement('div')
          document.body.append(host)
          const v = createPDFCanvasViewer(host, {
            doc: docWith([custom('a.b:c[d]', 'demo.v')]),
            objectTypes: [VIEWER_TYPE],
          })
          // 찾기만 하면 된다 — scrollIntoView 는 레이아웃이 없어 no-op 다.
          const found = v.scrollToObject('a.b:c[d]')
          v.destroy()
          host.remove()
          return found
        },
      },
    ],
  },
]
