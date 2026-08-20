/**
 * 객체·페이지 렌더 검증 케이스 (PLAN 20.9, R4).
 *
 * 확인하는 것은 하나로 요약된다 — **pt 가 px 로 그대로 나가는가.** 배율은 페이지 컨테이너의
 * `transform: scale()` 한 곳에만 적용되므로(PLAN 5.3), 객체 스타일에 배율이 섞이면 이중 적용이다.
 * 그 버그는 "확대하면 객체가 점점 멀어진다" 로 나타나고 원인을 찾기 어렵다.
 *
 * ⚠️ **덮이지 않는 것**: happy-dom 은 레이아웃이 없다. 실제 겹침·핸들 크기·IME 조합은
 * 브라우저에서 손으로 확인해야 한다 (PLAN 20.5).
 */
import { objectView } from '../../src/dom/editor/objects/objectView'
import { pageFrame } from '../../src/dom/editor/pageFrame'
import { selectionOverlay } from '../../src/dom/editor/selectionOverlay'
import { scope, signal } from '../../src/dom/reactive'
import {
  createId,
  createObjectTypeRegistry,
  createPage,
  defineObjectType,
  A4_PT,
} from 'pdf-canvas-kit'
import type { AnyObjectTypeDef } from 'pdf-canvas-kit'
import type {
  CustomObject,
  PageViewport,
  PDFCanvasObject,
  PDFCanvasPage,
  Rect,
  ShapeObject,
  TextObject,
} from 'pdf-canvas-kit'
import type { CaseGroup } from './cases'

const RECT: Rect = { x: 120, y: 300, w: 160, h: 40 }

function textObj(over: Partial<TextObject> = {}): TextObject {
  return {
    id: createId(),
    type: 'text',
    rect: RECT,
    text: '안녕',
    style: {
      fontFamily: 'sans-serif',
      fontSize: 14,
      bold: false,
      italic: false,
      underline: false,
      align: 'left',
      lineHeight: 1.4,
      color: '#111',
    },
    ...over,
  }
}

function customObj(over: Partial<CustomObject> = {}): CustomObject {
  return {
    id: createId(),
    type: 'custom',
    kind: 'demo.box',
    rect: RECT,
    data: {},
    ...over,
  }
}

/** 커스텀 객체를 레지스트리와 함께 렌더하고 정리한다. */
function renderCustom<T>(
  over: Partial<CustomObject>,
  defs: readonly AnyObjectTypeDef[],
  fn: (root: HTMLElement) => T,
  opts: { onMountCustom?: (id: string, el: HTMLElement | null) => void } = {},
): T {
  const types = createObjectTypeRegistry(defs)
  const [result, dispose] = scope(() => {
    const node = objectView({
      object: signal<PDFCanvasObject>(customObj(over)),
      selected: () => false,
      invalid: () => false,
      previewRect: () => null,
      previewRotation: () => null,
      editing: () => false,
      onEditText: () => {},
      types,
      ...(opts.onMountCustom ? { onMountCustom: opts.onMountCustom } : {}),
    })
    return fn(node)
  })
  dispose()
  return result
}

function shapeObj(shape: ShapeObject['shape']): ShapeObject {
  return {
    id: createId(),
    type: 'shape',
    rect: { x: 0, y: 0, w: 100, h: 60 },
    shape,
    style: { stroke: '#000', strokeWidth: 2 },
  } as ShapeObject
}

/** 객체 하나를 렌더하고 정리까지 해 준다. */
function render<T>(
  object: PDFCanvasObject,
  fn: (root: HTMLElement) => T,
  over: Partial<{
    selected: boolean
    invalid: boolean
    previewRect: Rect | null
    previewRotation: number | null
    editing: boolean
  }> = {},
): T {
  const [result, dispose] = scope(() => {
    const node = objectView({
      object: signal(object),
      selected: () => over.selected ?? false,
      invalid: () => over.invalid ?? false,
      previewRect: () => over.previewRect ?? null,
      previewRotation: () => over.previewRotation ?? null,
      editing: () => over.editing ?? false,
      onEditText: () => {},
    })
    return fn(node)
  })
  dispose()
  return result
}

const px = (node: HTMLElement) => [
  node.style.getPropertyValue('left'),
  node.style.getPropertyValue('top'),
  node.style.getPropertyValue('width'),
  node.style.getPropertyValue('height'),
]

export const OBJECT_RENDER_GROUPS: CaseGroup[] = [
  {
    title: 'render — 객체 좌표는 pt 를 px 로 그대로 (PLAN 5.3) ★',
    note: '배율은 페이지 컨테이너 transform 한 곳에만. 객체 스타일에 배율이 섞이면 이중 적용이고, 증상은 "확대하면 객체가 멀어진다" 다.',
    cases: [
      {
        name: 'rect 가 곱셈 없이 px 로 나간다',
        expected: ['120px', '300px', '160px', '40px'],
        actual: () => render(textObj(), px),
      },
      {
        name: 'previewRect 가 문서 값을 대신한다',
        expected: ['10px', '20px', '30px', '40px'],
        actual: () => render(textObj(), px, { previewRect: { x: 10, y: 20, w: 30, h: 40 } }),
      },
      {
        name: '회전 0 이면 transform 을 남기지 않는다',
        expected: '',
        actual: () => render(textObj(), (n) => n.style.getPropertyValue('transform')),
      },
      {
        name: '회전이 있으면 center 원점으로 rotate',
        expected: ['rotate(45deg)', 'center'],
        actual: () =>
          render(textObj({ rotation: 45 }), (n) => [
            n.style.getPropertyValue('transform'),
            n.style.getPropertyValue('transform-origin'),
          ]),
      },
      {
        name: 'previewRotation 이 문서 각도를 대신한다',
        expected: 'rotate(10deg)',
        actual: () =>
          render(textObj({ rotation: 45 }), (n) => n.style.getPropertyValue('transform'), {
            previewRotation: 10,
          }),
      },
    ],
  },

  {
    title: 'render — 객체 클래스·상태',
    cases: [
      {
        name: '유형 클래스가 붙는다',
        expected: [true, true],
        actual: () => [
          render(textObj(), (n) => n.classList.contains('is-text')),
          render(customObj(), (n) => n.classList.contains('is-custom')),
        ],
      },
      {
        name: 'selected · invalid · editing 클래스',
        expected: [true, true, true],
        actual: () =>
          render(
            textObj(),
            (n) => [
              n.classList.contains('is-selected'),
              n.classList.contains('is-invalid'),
              n.classList.contains('is-editing'),
            ],
            { selected: true, invalid: true, editing: true },
          ),
      },
      {
        name: '선택 해제되면 클래스가 사라진다',
        expected: [true, false],
        actual: () => {
          const selected = signal(true)
          const [res, dispose] = scope(() => {
            const n = objectView({
              object: signal<PDFCanvasObject>(textObj()),
              selected: () => selected.value,
              invalid: () => false,
              previewRect: () => null,
              previewRotation: () => null,
              editing: () => false,
              onEditText: () => {},
            })
            const before = n.classList.contains('is-selected')
            selected.value = false
            return [before, n.classList.contains('is-selected')]
          })
          dispose()
          return res
        },
      },
      {
        name: 'data-object-id 가 붙는다',
        expected: true,
        actual: () => {
          const o = textObj()
          return render(o, (n) => n.getAttribute('data-object-id') === o.id)
        },
      },
    ],
  },

  {
    title: 'render — 커스텀 객체 (PLAN D25) ★',
    note: '이 패키지가 그리는 것은 기본 틀뿐이다. 콘텐츠는 objectType.render 가 그리거나(vanilla) 프레임워크 래퍼가 portal 한다. 포인터 이벤트는 기본적으로 프레임이 먹는다.',
    cases: [
      {
        name: 'render 슬롯이 콘텐츠를 그린다 (vanilla 경로)',
        expected: '내 컴포넌트',
        actual: () =>
          renderCustom(
            { kind: 'demo.box' },
            [
              defineObjectType({
                kind: 'demo.box',
                label: '데모',
                defaultSize: { w: 100, h: 40 },
                defaultData: () => ({}),
                render: () => {
                  const s = document.createElement('span')
                  s.textContent = '내 컴포넌트'
                  return s
                },
              }),
            ],
            (root) => root.querySelector('.pck-obj-custom-content')?.textContent ?? null,
          ),
      },
      {
        name: 'render 가 없으면 컨테이너를 비워 두고 마운트를 알린다 (portal 경로)',
        expected: [true, ''],
        actual: () => {
          let mounted: HTMLElement | null = null
          const got = renderCustom(
            { kind: 'demo.box' },
            [
              defineObjectType({
                kind: 'demo.box',
                label: '데모',
                defaultSize: { w: 100, h: 40 },
                defaultData: () => ({}),
              }),
            ],
            (root) => root.querySelector('.pck-obj-custom-content')?.textContent ?? null,
            { onMountCustom: (_id, el) => (mounted = el ?? mounted) },
          )
          return [(mounted as unknown as HTMLElement | null) !== null, got]
        },
      },
      {
        name: '★ 기본은 콘텐츠가 포인터를 먹지 않는다 (클릭이 객체 선택으로 간다)',
        expected: false,
        actual: () =>
          renderCustom(
            { kind: 'demo.box' },
            [
              defineObjectType({
                kind: 'demo.box',
                label: '데모',
                defaultSize: { w: 100, h: 40 },
                defaultData: () => ({}),
              }),
            ],
            (root) =>
              root.querySelector('.pck-obj-custom-content')?.classList.contains('is-interactive') ??
              null,
          ),
      },
      {
        name: '★ interactive: true 면 콘텐츠가 먹는다',
        expected: true,
        actual: () =>
          renderCustom(
            { kind: 'demo.box' },
            [
              defineObjectType({
                kind: 'demo.box',
                label: '데모',
                defaultSize: { w: 100, h: 40 },
                defaultData: () => ({}),
                interactive: true,
              }),
            ],
            (root) =>
              root.querySelector('.pck-obj-custom-content')?.classList.contains('is-interactive') ??
              null,
          ),
      },
      {
        name: '★ 등록되지 않은 kind 는 객체를 버리지 않고 자리를 지킨다',
        expected: [true, true],
        actual: () =>
          renderCustom({ kind: 'gone' }, [], (root) => [
            root.querySelector('.pck-obj-custom--unknown') !== null,
            // 프레임 자체는 그대로 있어야 한다 — 버리면 저장할 때 데이터가 사라진다.
            root.classList.contains('pck-obj'),
          ]),
      },
      {
        // happy-dom 은 색을 정규화하지 않고 그대로 돌려준다. 브라우저는 rgb() 로 바꾼다.
        name: '기본 틀의 BoxStyle 이 인라인 스타일로 나간다',
        expected: '#ff0000',
        actual: () =>
          renderCustom(
            { kind: 'demo.box', style: { fill: '#ff0000' } },
            [
              defineObjectType({
                kind: 'demo.box',
                label: '데모',
                defaultSize: { w: 100, h: 40 },
                defaultData: () => ({}),
              }),
            ],
            (root) =>
              root.querySelector<HTMLElement>('.pck-obj-custom')?.style.backgroundColor ?? null,
          ),
      },
      {
        name: 'data 가 바뀌면 render 가 다시 불린다',
        expected: ['1', '2'],
        actual: () => {
          const obj = signal<PDFCanvasObject>(customObj({ data: { n: 1 } }))
          const types = createObjectTypeRegistry([
            defineObjectType<{ n: number }>({
              kind: 'demo.box',
              label: '데모',
              defaultSize: { w: 100, h: 40 },
              defaultData: () => ({ n: 0 }),
              render: ({ data }) => {
                const s = document.createElement('span')
                s.textContent = String(data.n)
                return s
              },
            }),
          ])
          const [res, dispose] = scope(() => {
            const node = objectView({
              object: obj,
              selected: () => false,
              invalid: () => false,
              previewRect: () => null,
              previewRotation: () => null,
              editing: () => false,
              onEditText: () => {},
              types,
            })
            const before = node.querySelector('.pck-obj-custom-content')?.textContent ?? null
            obj.value = { ...(obj.value as CustomObject), data: { n: 2 } }
            return [before, node.querySelector('.pck-obj-custom-content')?.textContent ?? null]
          })
          dispose()
          return res
        },
      },
    ],
  },

  {
    title: 'render — 도형은 SVG 네임스페이스 (§13.4) ★',
    note: 'createElement 로 만든 SVG 는 에러 없이 안 보인다. 자식까지 네임스페이스가 맞아야 한다.',
    cases: [
      {
        name: 'rect 도형',
        expected: ['http://www.w3.org/2000/svg', 'rect', 'http://www.w3.org/2000/svg'],
        actual: () =>
          render(shapeObj('rect'), (n) => {
            const s = n.querySelector('svg')
            const child = s?.querySelector('rect')
            return [s?.namespaceURI ?? null, child?.tagName ?? null, child?.namespaceURI ?? null]
          }),
      },
      {
        name: 'ellipse 도형',
        expected: 'ellipse',
        actual: () =>
          render(shapeObj('ellipse'), (n) => n.querySelector('ellipse')?.tagName ?? null),
      },
      {
        name: 'line 은 line 만, 화살촉은 없다',
        expected: [true, false],
        actual: () =>
          render(shapeObj('line'), (n) => [
            n.querySelector('line') !== null,
            n.querySelector('polygon') !== null,
          ]),
      },
      {
        name: 'arrow 는 line + polygon',
        expected: [true, true],
        actual: () =>
          render(shapeObj('arrow'), (n) => [
            n.querySelector('line') !== null,
            n.querySelector('polygon') !== null,
          ]),
      },
      {
        name: 'viewBox 가 객체 크기와 같다 (좌표를 pt 로 유지)',
        expected: '0 0 100 60',
        actual: () =>
          render(shapeObj('rect'), (n) => n.querySelector('svg')?.getAttribute('viewBox') ?? null),
      },
    ],
  },

  {
    title: 'render — 텍스트 · contenteditable',
    note: 'IME 조합 처리는 브라우저에서만 확인 가능하다. 여기서는 편집 상태 전환과 문서→DOM 반영만 고정한다.',
    cases: [
      {
        name: '문서 텍스트가 DOM 에 들어간다',
        expected: '안녕',
        actual: () =>
          render(textObj(), (n) => n.querySelector('.pck-obj-text')?.textContent ?? null),
      },
      {
        name: '편집 중이 아니면 contenteditable="false"',
        expected: 'false',
        actual: () =>
          render(
            textObj(),
            (n) => n.querySelector('.pck-obj-text')?.getAttribute('contenteditable') ?? null,
          ),
      },
      {
        name: '편집 중이면 contenteditable="true"',
        expected: 'true',
        actual: () =>
          render(
            textObj(),
            (n) => n.querySelector('.pck-obj-text')?.getAttribute('contenteditable') ?? null,
            { editing: true },
          ),
      },
      {
        name: '⚠️ 편집 중에는 문서 값이 DOM 을 덮지 않는다 (캐럿 보호)',
        expected: '처음',
        actual: () => {
          const obj = signal<PDFCanvasObject>(textObj({ text: '처음' }))
          const [res, dispose] = scope(() => {
            const n = objectView({
              object: obj,
              selected: () => false,
              invalid: () => false,
              previewRect: () => null,
              previewRotation: () => null,
              editing: () => true, // 편집 중
              onEditText: () => {},
            })
            // 편집 중에 문서가 바뀌어도 DOM 을 덮지 않는다.
            obj.value = { ...(obj.value as TextObject), text: '나중' }
            return n.querySelector('.pck-obj-text')?.textContent ?? null
          })
          dispose()
          return res
        },
      },
      {
        name: '편집 중이 아니면 문서 값 변경이 DOM 에 반영된다',
        expected: ['처음', '나중'],
        actual: () => {
          const obj = signal<PDFCanvasObject>(textObj({ text: '처음' }))
          const [res, dispose] = scope(() => {
            const n = objectView({
              object: obj,
              selected: () => false,
              invalid: () => false,
              previewRect: () => null,
              previewRotation: () => null,
              editing: () => false,
              onEditText: () => {},
            })
            const before = n.querySelector('.pck-obj-text')?.textContent ?? null
            obj.value = { ...(obj.value as TextObject), text: '나중' }
            return [before, n.querySelector('.pck-obj-text')?.textContent ?? null]
          })
          dispose()
          return res
        },
      },
    ],
  },

  {
    title: 'render — 페이지 프레임 두 겹 구조 (PLAN 5.3) ★',
    note: 'transform 은 레이아웃 크기에 영향을 주지 않는다. 바깥 프레임이 size*scale 을 실제 크기로 갖지 않으면 스크롤 범위가 틀어진다.',
    cases: [
      {
        name: '프레임은 size * scale, 안쪽은 pt 크기 + scale transform',
        expected: {
          frame: ['297.64px', '420.945px'],
          page: ['595.28px', '841.89px', 'scale(0.5)', 'top left'],
        },
        actual: () => {
          const page = signal<PDFCanvasPage>(createPage({ size: A4_PT }))
          const [res, dispose] = scope(() => {
            const root = pageFrame({
              page,
              scale: signal(0.5),
              objects: null,
              overlay: null,
              ref: () => {},
            })
            const inner = root.querySelector<HTMLElement>('.pck-page')!
            return {
              frame: [root.style.getPropertyValue('width'), root.style.getPropertyValue('height')],
              page: [
                inner.style.getPropertyValue('width'),
                inner.style.getPropertyValue('height'),
                inner.style.getPropertyValue('transform'),
                inner.style.getPropertyValue('transform-origin'),
              ],
            }
          })
          dispose()
          return res
        },
      },
      {
        name: '배율을 바꾸면 프레임 크기만 따라간다 (안쪽 pt 는 불변)',
        expected: [['297.64px', '595.28px'], '595.28px'],
        actual: () => {
          const page = signal<PDFCanvasPage>(createPage({ size: A4_PT }))
          const scale = signal(0.5)
          const [res, dispose] = scope(() => {
            const root = pageFrame({
              page,
              scale,
              objects: null,
              overlay: null,
              ref: () => {},
            })
            const inner = root.querySelector<HTMLElement>('.pck-page')!
            const before = root.style.getPropertyValue('width')
            scale.value = 1
            return [
              [before, root.style.getPropertyValue('width')],
              inner.style.getPropertyValue('width'),
            ]
          })
          dispose()
          return res
        },
      },
      {
        name: '오버레이는 스케일된 엘리먼트 밖에 있다 (핸들 크기 고정 — PLAN D5)',
        expected: true,
        actual: () => {
          const page = signal<PDFCanvasPage>(createPage({ size: A4_PT }))
          const [res, dispose] = scope(() => {
            const marker = document.createElement('i')
            marker.className = 'marker'
            const root = pageFrame({
              page,
              scale: signal(0.5),
              objects: null,
              overlay: marker,
              ref: () => {},
            })
            // 마커가 .pck-page 안에 있으면 배율을 함께 받는다 — 그러면 안 된다.
            return root.querySelector('.pck-page .marker') === null && marker.parentElement === root
          })
          dispose()
          return res
        },
      },
      {
        name: '빈 배경이면 img 를 만들지 않는다 (빈 src 요청 방지)',
        expected: [false, true],
        actual: () => {
          const page = signal<PDFCanvasPage>(createPage({ size: A4_PT }))
          const [res, dispose] = scope(() => {
            const root = pageFrame({
              page,
              scale: signal(1),
              objects: null,
              overlay: null,
              ref: () => {},
            })
            return [
              root.querySelector('img') !== null,
              root.querySelector('.pck-page-bg--blank') !== null,
            ]
          })
          dispose()
          return res
        },
      },
      {
        name: 'ref 로 프레임 엘리먼트를 넘긴다 (좌표 변환의 기준 — PLAN 5.4)',
        expected: true,
        actual: () => {
          const page = signal<PDFCanvasPage>(createPage({ size: A4_PT }))
          const [res, dispose] = scope(() => {
            let got: HTMLElement | null = null
            const root = pageFrame({
              page,
              scale: signal(1),
              objects: null,
              overlay: null,
              ref: (e) => (got = e),
            })
            return (got as unknown as HTMLElement | null) === root
          })
          dispose()
          return res
        },
      },
    ],
  },

  {
    title: 'render — 선택 오버레이 · 핸들',
    cases: [
      {
        name: '뷰포트가 없으면 아무것도 그리지 않는다',
        expected: [0, false],
        actual: () => {
          const [res, dispose] = scope(() => {
            const n = selectionOverlay({
              viewport: signal<PageViewport | null>(null),
              selectedRects: signal([{ rect: RECT, rotation: 0 }]),
              preview: signal(null),
              handleRect: signal(RECT),
              rotatable: signal(true),
              handleRotation: signal(0),
              onGrabHandle: () => {},
              onGrabRotate: () => {},
            })
            return [
              n.querySelectorAll('.pck-select-box').length,
              n.querySelector('.pck-handle-group') !== null,
            ]
          })
          dispose()
          return res
        },
      },
      {
        /*
         * 오버레이는 `.pck-page-frame` 안에 절대배치된다. 그래서 `rectToFrame` 은 배율만
         * 곱하고 `frameRect.left/top` 을 더하지 않는다 — 더하면 이중 가산이고, 증상은
         * "확대할수록 선택 테두리가 객체에서 멀어진다" 다 (CLAUDE.md 6장의 단골 실수).
         */
        name: '★ 선택 박스는 프레임 로컬 좌표다 — frameRect 를 더하지 않는다',
        expected: ['60px', '150px', '80px', '20px'],
        actual: () => {
          const vp: PageViewport = {
            pageId: 'p',
            size: A4_PT,
            scale: 0.5,
            frameRect: { left: 100, top: 50 },
          }
          const [res, dispose] = scope(() => {
            const n = selectionOverlay({
              viewport: signal<PageViewport | null>(vp),
              selectedRects: signal([{ rect: RECT, rotation: 0 }]),
              preview: signal(null),
              handleRect: signal(null),
              rotatable: signal(false),
              handleRotation: signal(0),
              onGrabHandle: () => {},
              onGrabRotate: () => {},
            })
            const box = n.querySelector<HTMLElement>('.pck-select-box')!
            return [
              box.style.getPropertyValue('left'),
              box.style.getPropertyValue('top'),
              box.style.getPropertyValue('width'),
              box.style.getPropertyValue('height'),
            ]
          })
          dispose()
          return res
        },
      },
      {
        name: '핸들 8개 + 회전 핸들',
        expected: [8, 1],
        actual: () => {
          const vp: PageViewport = {
            pageId: 'p',
            size: A4_PT,
            scale: 1,
            frameRect: { left: 0, top: 0 },
          }
          const [res, dispose] = scope(() => {
            const n = selectionOverlay({
              viewport: signal<PageViewport | null>(vp),
              selectedRects: signal([]),
              preview: signal(null),
              handleRect: signal(RECT),
              rotatable: signal(true),
              handleRotation: signal(0),
              onGrabHandle: () => {},
              onGrabRotate: () => {},
            })
            return [
              n.querySelectorAll('.pck-handle:not(.pck-handle--rotate)').length,
              n.querySelectorAll('.pck-handle--rotate').length,
            ]
          })
          dispose()
          return res
        },
      },
      {
        name: 'rotatable 이 false 면 회전 핸들이 없다 (Answer Box — PLAN Q8)',
        expected: 0,
        actual: () => {
          const vp: PageViewport = {
            pageId: 'p',
            size: A4_PT,
            scale: 1,
            frameRect: { left: 0, top: 0 },
          }
          const [res, dispose] = scope(() => {
            const n = selectionOverlay({
              viewport: signal<PageViewport | null>(vp),
              selectedRects: signal([]),
              preview: signal(null),
              handleRect: signal(RECT),
              rotatable: signal(false),
              handleRotation: signal(0),
              onGrabHandle: () => {},
              onGrabRotate: () => {},
            })
            return n.querySelectorAll('.pck-handle--rotate').length
          })
          dispose()
          return res
        },
      },
      {
        name: '★ 회전 시 래퍼가 돌고 핸들은 역회전한다 (기울어진 핸들 방지)',
        expected: ['rotate(30deg)', true],
        actual: () => {
          const vp: PageViewport = {
            pageId: 'p',
            size: A4_PT,
            scale: 1,
            frameRect: { left: 0, top: 0 },
          }
          const [res, dispose] = scope(() => {
            const n = selectionOverlay({
              viewport: signal<PageViewport | null>(vp),
              selectedRects: signal([]),
              preview: signal(null),
              handleRect: signal(RECT),
              rotatable: signal(false),
              handleRotation: signal(30),
              onGrabHandle: () => {},
              onGrabRotate: () => {},
            })
            const group = n.querySelector<HTMLElement>('.pck-handle-group')!
            const handle = n.querySelector<HTMLElement>('.pck-handle')!
            return [
              group.style.getPropertyValue('transform'),
              handle.style.getPropertyValue('transform').includes('rotate(-30deg)'),
            ]
          })
          dispose()
          return res
        },
      },
      {
        name: '마퀴는 kind 로 클래스가 갈린다',
        expected: ['pck-marquee is-create', 'pck-marquee is-marquee'],
        actual: () => {
          const vp: PageViewport = {
            pageId: 'p',
            size: A4_PT,
            scale: 1,
            frameRect: { left: 0, top: 0 },
          }
          const preview = signal<{ rect: Rect; kind: 'create' | 'marquee' } | null>({
            rect: RECT,
            kind: 'create',
          })
          const [res, dispose] = scope(() => {
            const n = selectionOverlay({
              viewport: signal<PageViewport | null>(vp),
              selectedRects: signal([]),
              preview,
              handleRect: signal(null),
              rotatable: signal(false),
              handleRotation: signal(0),
              onGrabHandle: () => {},
              onGrabRotate: () => {},
            })
            const before = n.querySelector('.pck-marquee')?.getAttribute('class') ?? null
            preview.value = { rect: RECT, kind: 'marquee' }
            return [before, n.querySelector('.pck-marquee')?.getAttribute('class') ?? null]
          })
          dispose()
          return res
        },
      },
      {
        name: '핸들 pointerdown 이 콜백을 부르고 전파를 막는다',
        expected: [true, true],
        actual: () => {
          const vp: PageViewport = {
            pageId: 'p',
            size: A4_PT,
            scale: 1,
            frameRect: { left: 0, top: 0 },
          }
          const [res, dispose] = scope(() => {
            let grabbed = false
            const n = selectionOverlay({
              viewport: signal<PageViewport | null>(vp),
              selectedRects: signal([]),
              preview: signal(null),
              handleRect: signal(RECT),
              rotatable: signal(false),
              handleRotation: signal(0),
              onGrabHandle: () => (grabbed = true),
              onGrabRotate: () => {},
            })
            let bubbled = false
            n.addEventListener('pointerdown', () => (bubbled = true))
            const handle = n.querySelector('.pck-handle')!
            handle.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }))
            return [grabbed, !bubbled]
          })
          dispose()
          return res
        },
      },
    ],
  },
]
