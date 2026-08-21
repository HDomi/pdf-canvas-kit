/**
 * 순수 함수 검증 케이스.
 *
 * 렌더와 데이터를 분리해 둔다. 나중에 테스트 러너를 도입하면 이 배열을 그대로 소비할 수 있다.
 * 지금은 `/checks/` 화면이 표로 렌더하고 불일치 행을 빨갛게 칠한다.
 */
import {
  boxStyleToCss,
  clampIntoPage,
  clampPageIndex,
  clampScale,
  clientToPage,
  constrainRect,
  createId,
  createObjectTypeRegistry,
  createPage,
  createPDFCanvasDoc,
  configureFonts,
  EDITOR_DEFAULTS,
  defineObjectType,
  DEFAULT_FONTS,
  fontOptions,
  arrowHeadSize,
  isLineShape,
  isPolygonShape,
  lineShapeHeight,
  normalizeShapeRect,
  normalizeWheelDelta,
  updateObject,
  LIMITS,
  polygonPoints,
  resetFonts,
  UNKNOWN_KIND_ISSUE,
  validateDoc,
  formatPaperLabel,
  hitTestObject,
  mergeBoxStyle,
  moveRect,
  rotationFromPointer,
  pageToFrame,
  pickObjectsInRect,
  rectFromPoints,
  resizeRect,
  stepZoom,
  validateObject,
  type CustomObject,
  type PageViewport,
  type PDFCanvasObject,
  type Pt,
  type ShapeKind,
  type ShapeObject,
} from '@h_domi/pdf-canvas-kit'

/**
 * 한 건의 검증 케이스. `actual` 은 렌더 시점에 실행된다.
 *
 * `Promise` 를 반환해도 된다. 마이크로태스크 경계를 넘어야 확인되는 것(예: `watch` 의 `defer`,
 * 디바운스 저장)이 있어서 러너와 화면이 둘 다 await 한다.
 */
export interface Case {
  name: string
  expected: unknown
  actual: () => unknown | Promise<unknown>
}

export interface CaseGroup {
  title: string
  /** 이 그룹이 확인하는 설계 근거. 화면에 함께 표시한다. */
  note?: string
  cases: Case[]
}

const A4 = { width: 595.28, height: 841.89 }

const vp = (scale: number, left = 100, top = 50): PageViewport => ({
  pageId: 'p1',
  size: A4,
  scale,
  frameRect: { left, top },
})

/** 소수 오차를 흡수해 비교한다. 좌표 왕복은 부동소수 계산이다. */
const round = (n: number, digits = 4) => Number(n.toFixed(digits))

/**
 * 커스텀 객체 (커스텀 객체는 소비자가 정의한다).
 *
 * 구 `shortBox` · `dropboxBox` · `essayBox` 를 대신한다. 이 패키지는 `data` 를 해석하지 않으므로
 * 케이스도 내용을 신경 쓰지 않는다 — 확인하는 것은 기본 틀의 기하와 스타일이다.
 */
function customBox(over: Partial<CustomObject> = {}): CustomObject {
  return {
    id: 'custom-1',
    type: 'custom',
    kind: 'demo.box',
    rect: { x: 0, y: 0, w: 160, h: 40 },
    data: {},
    ...over,
  }
}

/** 도형 객체. `strokeWidth` 가 선 계열 박스 높이를 정하므로 인자로 받는다. */
function shapeObj(shape: ShapeKind, strokeWidth: Pt): ShapeObject {
  return {
    id: 'shape-1',
    type: 'shape',
    shape,
    rect: { x: 0, y: 0, w: 100, h: 60 },
    style: { fill: null, stroke: '#000', strokeWidth },
  }
}

export const GROUPS: CaseGroup[] = [
  {
    title: '도형 정점 (2026.08.21)',
    note: '다각형 도형은 정점이 순수 계산이다. 브라우저 없이 여기서 고정한다.',
    cases: [
      {
        name: '마름모는 네 변의 중점',
        expected: '50,0 100,30 50,60 0,30',
        actual: () => polygonPoints('diamond', 100, 60),
      },
      {
        name: '삼각형은 위 꼭짓점 + 아래 변',
        expected: '50,0 100,60 0,60',
        actual: () => polygonPoints('triangle', 100, 60),
      },
      {
        name: '별은 정점 10개 (꼭짓점 5 + 골 5)',
        expected: 10,
        actual: () => polygonPoints('star', 100, 100).split(' ').length,
      },
      {
        name: '별의 첫 정점은 위쪽 꼭짓점',
        expected: '50,0',
        actual: () => polygonPoints('star', 100, 100).split(' ')[0],
      },
      {
        name: '십자는 정점 12개',
        expected: 12,
        actual: () => polygonPoints('cross', 90, 90).split(' ').length,
      },
      {
        name: '오각형·육각형은 변 수만큼',
        expected: [5, 6],
        actual: () => [
          polygonPoints('pentagon', 100, 100).split(' ').length,
          polygonPoints('hexagon', 100, 100).split(' ').length,
        ],
      },
      {
        name: 'inset 은 바운딩 박스를 양쪽에서 줄인다 (테두리가 박스 밖으로 새지 않게)',
        expected: '50,1 99,30 50,59 1,30',
        actual: () => polygonPoints('diamond', 100, 60, 1),
      },
      {
        name: 'inset 이 박스보다 크면 0 으로 접는다 — 음수 크기로 뒤집히지 않게',
        expected: '50,50 50,50 50,50 50,50',
        actual: () => polygonPoints('diamond', 20, 20, 50),
      },
      {
        name: '좌표는 소수 3자리까지 — 부동소수 잔재가 속성에 새지 않게',
        expected: true,
        actual: () =>
          polygonPoints('pentagon', 100, 100)
            .split(/[ ,]/)
            .every((v) => /^-?\d+(\.\d{1,3})?$/.test(v)),
      },
      {
        name: '분류: 다각형 계열',
        expected: [true, true, false, false],
        actual: () => [
          isPolygonShape('star'),
          isPolygonShape('cross'),
          isPolygonShape('rect'),
          isPolygonShape('arrow'),
        ],
      },
      {
        name: '분류: 선 계열 (doubleArrow 포함)',
        expected: [true, true, true, false],
        actual: () => [
          isLineShape('line'),
          isLineShape('arrow'),
          isLineShape('doubleArrow'),
          isLineShape('ellipse'),
        ],
      },
    ],
  },

  {
    title: '휠 단위 정규화 (2026.08.21) ★',
    note: 'WheelEvent.deltaY 의 단위가 브라우저마다 다르다. 맞추지 않으면 Firefox 에서 줌이 거의 움직이지 않는다 — 브라우저를 띄우기 어려운 항목이라 여기서 고정한다.',
    cases: [
      {
        name: 'DOM_DELTA_PIXEL(0) 은 그대로 (Chrome · Safari)',
        expected: 100,
        actual: () => normalizeWheelDelta(100, 0),
      },
      {
        name: '★ DOM_DELTA_LINE(1) 은 줄 수 → 픽셀 (Firefox 마우스 휠 한 틱 ≈ 3)',
        expected: 48,
        actual: () => normalizeWheelDelta(3, 1),
      },
      {
        name: 'DOM_DELTA_PAGE(2) 는 페이지 수 → 픽셀',
        expected: 400,
        actual: () => normalizeWheelDelta(1, 2),
      },
      {
        name: '부호를 유지한다 — 방향이 뒤집히면 확대·축소가 반대가 된다',
        expected: [-48, -100],
        actual: () => [normalizeWheelDelta(-3, 1), normalizeWheelDelta(-100, 0)],
      },
      {
        name: '규격 밖의 deltaMode 는 픽셀로 본다 — 모르는 값을 확대하는 쪽이 더 위험하다',
        expected: 100,
        actual: () => normalizeWheelDelta(100, 99),
      },
      {
        /*
         * 감도 자체는 눈으로 고른 값이라 케이스로 고정하지 않는다. 다만 **방향**과
         * **비율 불변성**은 계약이다 — 지수를 쓰는 이유가 그것이다.
         */
        name: '★ 배율 변화는 비율이다 — 400% 와 25% 에서 같은 비율로 움직인다',
        expected: true,
        actual: () => {
          const f = EDITOR_DEFAULTS.zoom.wheelFactor ** -100
          return Math.abs((4 * f) / 4 - (0.25 * f) / 0.25) < 1e-12
        },
      },
      {
        name: '위로 굴리면(deltaY < 0) 확대된다',
        expected: true,
        actual: () => EDITOR_DEFAULTS.zoom.wheelFactor ** 100 > 1,
      },
    ],
  },

  {
    title: '선 계열 도형의 박스 크기 (2026.08.21) ★',
    note: '선·화살표는 박스 높이가 그림에 영향을 주지 않는다. 그대로 두면 얇은 선 하나가 큰 빈 상자 안에 남고 핸들·썸네일이 그 상자를 따라간다.',
    cases: [
      {
        name: 'line 의 높이는 선 두께 그대로',
        expected: 2,
        actual: () => lineShapeHeight('line', 2, 100),
      },
      {
        name: 'arrow 의 높이는 화살촉 높이 (두께 × 4)',
        expected: 8,
        actual: () => lineShapeHeight('arrow', 2, 100),
      },
      {
        name: '폭이 짧으면 화살촉이 폭의 절반으로 줄고 박스도 따라 줄어든다',
        expected: 5,
        actual: () => lineShapeHeight('arrow', 4, 10),
      },
      {
        name: '아주 짧아도 선 두께는 확보한다 — 박스가 선보다 얇으면 선이 잘린다',
        expected: 4,
        actual: () => lineShapeHeight('arrow', 4, 2),
      },
      {
        name: '화살촉은 박스 높이를 넘지 않는다 (svg 는 overflow: hidden 이라 잘린다)',
        expected: [8, 6],
        actual: () => [arrowHeadSize(100, 40, 2), arrowHeadSize(100, 6, 2)],
      },
      {
        name: '★ 정규화는 세로 중심을 유지한다 — 그림이 제자리에 남아야 한다',
        expected: { x: 10, y: 118, w: 100, h: 4 },
        actual: () => normalizeShapeRect(shapeObj('arrow', 1), { x: 10, y: 60, w: 100, h: 120 }),
      },
      {
        name: '면 도형은 손대지 않는다 (박스를 꽉 채우므로)',
        expected: { x: 10, y: 60, w: 100, h: 120 },
        actual: () => normalizeShapeRect(shapeObj('star', 1), { x: 10, y: 60, w: 100, h: 120 }),
      },
      {
        name: '바꿀 것이 없으면 원본 참조를 그대로 돌려준다',
        expected: true,
        actual: () => {
          const rect = { x: 0, y: 0, w: 100, h: 4 }
          return normalizeShapeRect(shapeObj('arrow', 1), rect) === rect
        },
      },
      {
        name: '★ 인스펙터에서 rect → arrow 로 바꾸면 박스가 따라 얇아진다',
        expected: { x: 0, y: 28, w: 100, h: 4 },
        actual: () => {
          const obj = shapeObj('rect', 1)
          const doc = createPDFCanvasDoc({
            pages: [createPage({ size: A4, objects: [obj] })],
          })
          const next = updateObject(0, obj.id, { shape: 'arrow' })(doc)
          return next?.pages[0]?.objects[0]?.rect ?? null
        },
      },
      {
        name: '테두리를 두껍게 하면 박스도 함께 커진다',
        expected: 16,
        actual: () => {
          const obj = shapeObj('arrow', 1)
          const doc = createPDFCanvasDoc({
            pages: [createPage({ size: A4, objects: [obj] })],
          })
          const next = updateObject(0, obj.id, {
            style: { fill: null, stroke: '#000', strokeWidth: 4 },
          })(doc)
          return next?.pages[0]?.objects[0]?.rect.h ?? null
        },
      },
      {
        name: '★ 얇은 객체는 히트 테스트에 여유를 준다 (1pt 선을 집을 수 있어야 한다)',
        expected: [true, true, false],
        actual: () => {
          const arrow = { ...shapeObj('arrow', 1), rect: { x: 100, y: 100, w: 200, h: 4 } }
          return [
            // 박스 안
            hitTestObject({ x: 150, y: 102 }, arrow),
            // 박스 위쪽 2pt — 여유 안 (8pt 기준이므로 위아래 2pt 씩)
            hitTestObject({ x: 150, y: 98 }, arrow),
            // 여유를 넘은 지점
            hitTestObject({ x: 150, y: 90 }, arrow),
          ]
        },
      },
      {
        name: '충분히 큰 객체에는 여유가 붙지 않는다',
        expected: false,
        actual: () =>
          hitTestObject(
            { x: 150, y: 99 },
            {
              ...shapeObj('star', 1),
              rect: { x: 100, y: 100, w: 200, h: 200 },
            },
          ),
      },
    ],
  },

  {
    title: '글꼴 목록 (2026.08.21)',
    note: '패키지는 웹폰트를 싣지 않는다. 저장되는 값은 CSS font-family 스택 문자열이다.',
    cases: [
      {
        name: '기본 목록의 첫 스택은 새 텍스트 객체의 기본값과 같다',
        expected: 'sans-serif',
        actual: () => DEFAULT_FONTS[0]?.stack ?? null,
      },
      {
        name: '모든 스택에 제네릭 폴백이 있다 — 폰트가 없으면 두부(□)가 되지 않게',
        expected: true,
        actual: () =>
          DEFAULT_FONTS.every((f) => /(sans-serif|serif|monospace)$/.test(f.stack.trim())),
      },
      {
        name: 'configureFonts 는 병합이 아니라 교체다',
        expected: [1, 'Inter, sans-serif'],
        actual: () => {
          configureFonts([{ stack: 'Inter, sans-serif', label: 'Inter' }])
          const out = [fontOptions().length, fontOptions()[0]?.stack ?? null]
          resetFonts()
          return out
        },
      },
      {
        name: '빈 배열이면 인스펙터에서 글꼴 항목이 사라진다',
        expected: 0,
        actual: () => {
          configureFonts([])
          const n = fontOptions().length
          resetFonts()
          return n
        },
      },
      {
        name: 'resetFonts 로 기본 목록이 돌아온다',
        expected: DEFAULT_FONTS.length,
        actual: () => {
          configureFonts([])
          resetFonts()
          return fontOptions().length
        },
      },
    ],
  },

  {
    title: '좌표 왕복',
    note: 'clientToPage → pageToFrame 왕복이 원래 값으로 돌아와야 한다. 배율·오프셋과 무관하다.',
    cases: [
      ...[0.25, 0.8, 1, 2.5, 4].map((scale) => ({
        name: `scale ${scale}: (300,400) 왕복`,
        expected: { x: 300, y: 400 },
        actual: () => {
          const v = vp(scale)
          // 화면 좌표로 만든 뒤 다시 pt로 돌린다.
          const screen = pageToFrame({ x: 300, y: 400 }, v)
          const back = clientToPage(
            { x: screen.x + v.frameRect.left, y: screen.y + v.frameRect.top },
            v,
          )
          return { x: round(back.x), y: round(back.y) }
        },
      })),
      {
        name: '프레임 오프셋이 달라도 결과 동일',
        expected: { x: 100, y: 100 },
        actual: () => {
          const a = clientToPage({ x: 200, y: 150 }, vp(1, 100, 50))
          return { x: round(a.x), y: round(a.y) }
        },
      },
    ],
  },

  {
    title: '클램프·최소 크기',
    note: 'Answer Box 최소 80×32pt, 텍스트·도형 8×8pt. 이동은 크기를 바꾸지 않는다.',
    cases: [
      {
        name: '페이지 밖으로 이동 → 경계에 멈춤',
        expected: { x: 435.28, y: 801.89, w: 160, h: 40 },
        actual: () => clampIntoPage({ x: 900, y: 900, w: 160, h: 40 }, A4),
      },
      {
        name: '음수 좌표 → 0으로',
        expected: { x: 0, y: 0, w: 100, h: 50 },
        actual: () => clampIntoPage({ x: -50, y: -20, w: 100, h: 50 }, A4),
      },
      {
        /*
         * 구 판은 Answer Box 에 80×32pt 최소 크기를 코어에 박아 뒀다(모바일에서 탭할 수 있어야
         * 하므로). 그 판단은 콘텐츠를 아는 쪽의 것이라 `objectType.minSize` 로 옮겼고,
         * `minSizeFor` 는 override 를 받는다 (커스텀 객체는 소비자가 정의한다).
         */
        name: '커스텀 최소 크기는 override 로 들어온다',
        expected: { x: 10, y: 10, w: 80, h: 32 },
        actual: () => constrainRect({ x: 10, y: 10, w: 5, h: 5 }, A4, 'custom', { w: 80, h: 32 }),
      },
      {
        name: 'override 가 없으면 공통 최소 크기',
        expected: { x: 10, y: 10, w: 8, h: 8 },
        actual: () => constrainRect({ x: 10, y: 10, w: 1, h: 1 }, A4, 'custom'),
      },
      {
        name: '도형 최소 크기 적용',
        expected: { x: 10, y: 10, w: 8, h: 8 },
        actual: () => constrainRect({ x: 10, y: 10, w: 1, h: 1 }, A4, 'shape'),
      },
      {
        name: '이동은 크기를 유지',
        expected: { w: 160, h: 40 },
        actual: () => {
          const r = moveRect({ x: 0, y: 0, w: 160, h: 40 }, { dx: 5000, dy: 5000 }, A4, 'text')
          return { w: r.w, h: r.h }
        },
      },
      {
        name: '드래그 방향 무관 (역방향)',
        expected: { x: 10, y: 20, w: 90, h: 80 },
        actual: () => rectFromPoints({ x: 100, y: 100 }, { x: 10, y: 20 }),
      },
    ],
  },

  {
    title: '핸들 리사이즈',
    note: 'se는 좌상단 고정, nw는 우하단 고정. Shift는 종횡비, Alt는 중심 기준.',
    cases: [
      {
        name: 'se 핸들: 좌상단 고정',
        expected: { x: 100, y: 100, w: 220, h: 90 },
        actual: () =>
          resizeRect({ x: 100, y: 100, w: 200, h: 80 }, 'se', { dx: 20, dy: 10 }, A4, 'shape'),
      },
      {
        name: 'nw 핸들: 우하단 고정',
        expected: { x: 120, y: 110, w: 180, h: 70 },
        actual: () =>
          resizeRect({ x: 100, y: 100, w: 200, h: 80 }, 'nw', { dx: 20, dy: 10 }, A4, 'shape'),
      },
      {
        name: 'n 핸들: x축 델타 무시',
        expected: { x: 100, w: 200 },
        actual: () => {
          const r = resizeRect(
            { x: 100, y: 100, w: 200, h: 80 },
            'n',
            { dx: 50, dy: 10 },
            A4,
            'shape',
          )
          return { x: r.x, w: r.w }
        },
      },
      {
        name: 'Shift: 종횡비 유지 (2:1)',
        expected: 2,
        actual: () => {
          const r = resizeRect(
            { x: 0, y: 0, w: 200, h: 100 },
            'se',
            { dx: 40, dy: 0 },
            A4,
            'shape',
            { keepAspect: true },
          )
          return round(r.w / r.h, 3)
        },
      },
      {
        name: 'Alt: 중심 고정',
        expected: 100,
        actual: () => {
          const start = { x: 50, y: 50, w: 100, h: 100 }
          const r = resizeRect(start, 'se', { dx: 20, dy: 20 }, A4, 'shape', { fromCenter: true })
          // 중심이 유지돼야 한다.
          return round(r.x + r.w / 2)
        },
      },
      {
        name: '리사이즈도 최소 크기 준수',
        expected: { w: 80, h: 32 },
        actual: () => {
          const r = resizeRect(
            { x: 100, y: 100, w: 160, h: 40 },
            'se',
            { dx: -500, dy: -500 },
            A4,
            'custom',
            { minSize: { w: 80, h: 32 } },
          )
          return { w: r.w, h: r.h }
        },
      },
    ],
  },

  {
    title: '회전된 객체 리사이즈',
    note: '핸들의 반대편(앵커)이 화면상 같은 자리에 머물러야 한다. 축 보정만으로는 미끄러진다.',
    cases: [
      {
        name: '회전 0: se 핸들 → 좌상단 고정 (기존 동작 유지)',
        expected: { x: 100, y: 100 },
        actual: () => {
          const r = resizeRect(
            { x: 100, y: 100, w: 200, h: 100 },
            'se',
            { dx: 40, dy: 20 },
            A4,
            'shape',
            {
              rotation: 0,
            },
          )
          return { x: round(r.x), y: round(r.y) }
        },
      },
      {
        name: '90° 회전: se 핸들 → 앵커(nw 코너)가 화면상 그대로',
        expected: true,
        actual: () => {
          const start = { x: 100, y: 100, w: 200, h: 100 }
          const rotation = 90
          // 앵커는 nw 코너. 중심 기준 오프셋을 회전시켜 화면 위치를 구한다.
          const anchorOf = (r: typeof start) => {
            const cx = r.x + r.w / 2
            const cy = r.y + r.h / 2
            const ox = -r.w / 2
            const oy = -r.h / 2
            const rad = (rotation * Math.PI) / 180
            return {
              x: cx + (ox * Math.cos(rad) - oy * Math.sin(rad)),
              y: cy + (ox * Math.sin(rad) + oy * Math.cos(rad)),
            }
          }
          const before = anchorOf(start)
          const next = resizeRect(start, 'se', { dx: 0, dy: 60 }, A4, 'shape', { rotation })
          const after = anchorOf(next)
          // 0.01pt 이내면 같은 자리로 본다.
          return Math.abs(before.x - after.x) < 0.01 && Math.abs(before.y - after.y) < 0.01
        },
      },
      {
        name: '45° 회전: nw 핸들 → 앵커(se 코너)가 화면상 그대로',
        expected: true,
        actual: () => {
          const start = { x: 200, y: 200, w: 160, h: 120 }
          const rotation = 45
          const anchorOf = (r: typeof start) => {
            const cx = r.x + r.w / 2
            const cy = r.y + r.h / 2
            const ox = r.w / 2
            const oy = r.h / 2
            const rad = (rotation * Math.PI) / 180
            return {
              x: cx + (ox * Math.cos(rad) - oy * Math.sin(rad)),
              y: cy + (ox * Math.sin(rad) + oy * Math.cos(rad)),
            }
          }
          const before = anchorOf(start)
          const next = resizeRect(start, 'nw', { dx: -30, dy: -30 }, A4, 'shape', { rotation })
          const after = anchorOf(next)
          return Math.abs(before.x - after.x) < 0.01 && Math.abs(before.y - after.y) < 0.01
        },
      },
      {
        name: '90° 회전: 화면 오른쪽으로 끌면 e 핸들이 높이를 키운다 (델타 역회전)',
        expected: true,
        actual: () => {
          // 90도 돌아간 객체에서 화면 오른쪽(dx>0)은 로컬 아래쪽이다.
          const r = resizeRect(
            { x: 100, y: 100, w: 200, h: 100 },
            'e',
            { dx: 40, dy: 0 },
            A4,
            'shape',
            {
              rotation: 90,
            },
          )
          // 로컬 x축이 화면 y축이므로 폭은 거의 그대로여야 한다.
          return Math.abs(r.w - 200) < 0.01
        },
      },
      {
        name: 'Alt(중심 기준)는 회전과 무관하게 중심 유지',
        expected: { cx: 200, cy: 150 },
        actual: () => {
          const r = resizeRect(
            { x: 100, y: 100, w: 200, h: 100 },
            'se',
            { dx: 20, dy: 20 },
            A4,
            'shape',
            {
              rotation: 30,
              fromCenter: true,
            },
          )
          return { cx: round(r.x + r.w / 2), cy: round(r.y + r.h / 2) }
        },
      },
      {
        name: '회전된 객체는 경계 클램프를 건너뛴다',
        expected: true,
        actual: () => {
          // 회전 상태에서 축 정렬 클램프를 걸면 앵커가 어긋난다. 넘어가도 그대로 둔다.
          const r = resizeRect(
            { x: 10, y: 10, w: 100, h: 100 },
            'nw',
            { dx: -200, dy: -200 },
            A4,
            'shape',
            {
              rotation: 30,
            },
          )
          return r.x < 0 || r.y < 0
        },
      },
    ],
  },

  {
    title: '히트 테스트 · 회전',
    note: '포인터를 역회전시켜 축 정렬 사각형과 비교한다.',
    cases: [
      {
        name: '회전 없음: 내부',
        expected: true,
        actual: () =>
          hitTestObject(
            { x: 50, y: 50 },
            {
              id: 'o',
              type: 'mask',
              fill: '#fff',
              rect: { x: 0, y: 0, w: 100, h: 100 },
            },
          ),
      },
      {
        name: '회전 없음: 외부',
        expected: false,
        actual: () =>
          hitTestObject(
            { x: 150, y: 50 },
            {
              id: 'o',
              type: 'mask',
              fill: '#fff',
              rect: { x: 0, y: 0, w: 100, h: 100 },
            },
          ),
      },
      {
        name: '45° 회전: 코너 밖의 점은 미스',
        expected: false,
        actual: () =>
          hitTestObject(
            { x: 8, y: 8 },
            {
              id: 'o',
              type: 'mask',
              fill: '#fff',
              rotation: 45,
              rect: { x: 0, y: 40, w: 100, h: 20 },
            },
          ),
      },
      {
        name: '마퀴: 교차 기준으로 선택',
        expected: 1,
        actual: () =>
          pickObjectsInRect({ x: 90, y: 90, w: 20, h: 20 }, [
            { id: 'a', type: 'mask', fill: '#fff', rect: { x: 0, y: 0, w: 100, h: 100 } },
          ] as PDFCanvasObject[]).length,
      },
      {
        name: '마퀴: 잠긴 객체는 제외',
        expected: 0,
        actual: () =>
          pickObjectsInRect({ x: 0, y: 0, w: 200, h: 200 }, [
            {
              id: 'a',
              type: 'mask',
              fill: '#fff',
              locked: true,
              rect: { x: 0, y: 0, w: 10, h: 10 },
            },
          ] as PDFCanvasObject[]).length,
      },
    ],
  },

  {
    title: '회전',
    note: '12시 방향을 0°로 보는 시계방향 각도. CSS rotate() 와 같은 방향이다.',
    cases: [
      {
        name: '포인터가 위 → 0°',
        expected: 0,
        actual: () => rotationFromPointer({ x: 100, y: 100 }, { x: 100, y: 0 }),
      },
      {
        name: '포인터가 오른쪽 → 90°',
        expected: 90,
        actual: () => rotationFromPointer({ x: 100, y: 100 }, { x: 200, y: 100 }),
      },
      {
        name: '포인터가 아래 → 180°',
        expected: 180,
        actual: () => rotationFromPointer({ x: 100, y: 100 }, { x: 100, y: 200 }),
      },
      {
        name: '포인터가 왼쪽 → 270°',
        expected: 270,
        actual: () => rotationFromPointer({ x: 100, y: 100 }, { x: 0, y: 100 }),
      },
      {
        name: '15° 스냅 (Shift)',
        expected: 45,
        actual: () => rotationFromPointer({ x: 0, y: 0 }, { x: 100, y: -96 }, 15),
      },
      {
        name: '스냅이 360으로 넘어가면 0',
        expected: 0,
        actual: () => rotationFromPointer({ x: 0, y: 0 }, { x: -4, y: -100 }, 15),
      },
    ],
  },

  {
    title: '줌 · 페이지 인덱스',
    cases: [
      { name: '프리셋 위로', expected: 1.25, actual: () => stepZoom(1, 1) },
      { name: '프리셋 아래로', expected: 0.75, actual: () => stepZoom(1, -1) },
      { name: '프리셋 위 경계', expected: 4, actual: () => stepZoom(4, 1) },
      { name: '배율 클램프 (하한)', expected: 0.25, actual: () => clampScale(0.01) },
      { name: '배율 클램프 (상한)', expected: 4, actual: () => clampScale(99) },
      { name: '페이지 인덱스 클램프', expected: 2, actual: () => clampPageIndex(9, 3) },
      { name: '빈 문서는 -1', expected: -1, actual: () => clampPageIndex(0, 0) },
    ],
  },

  {
    title: '용지 이름',
    note: '±3pt 허용. 매칭되지 않으면 raw pt로 떨어진다.',
    cases: [
      {
        name: 'A4 세로',
        expected: 'A4 세로',
        actual: () => formatPaperLabel({ width: 595.28, height: 841.89 }),
      },
      {
        name: 'A4 가로',
        expected: 'A4 가로',
        actual: () => formatPaperLabel({ width: 841.89, height: 595.28 }),
      },
      {
        name: 'A3 세로',
        expected: 'A3 세로',
        actual: () => formatPaperLabel({ width: 841.89, height: 1190.55 }),
      },
      {
        name: 'Letter 세로',
        expected: 'Letter 세로',
        actual: () => formatPaperLabel({ width: 612, height: 792 }),
      },
      {
        name: '비표준 → 사용자 지정',
        expected: '사용자 지정 (395×642pt)',
        actual: () => formatPaperLabel({ width: 395.28, height: 641.89 }),
      },
    ],
  },

  {
    title: '검증 규칙 (커스텀 객체는 소비자가 정의한다)',
    note: '이 패키지가 아는 것은 문서·페이지 수준 규칙과 등록되지 않은 kind 뿐이다. 커스텀 객체의 내용 검증은 소비자 objectType.validate(data) 가 한다.',
    cases: [
      {
        name: '빈 문서',
        expected: ['EMPTY_DOC'],
        actual: () => validateDoc(createPDFCanvasDoc()).issues.map((i) => i.code),
      },
      {
        name: '페이지가 있으면 통과',
        expected: [],
        actual: () =>
          validateDoc(createPDFCanvasDoc({ pages: [createPage()] })).issues.map((i) => i.code),
      },
      {
        name: '레지스트리 없이 검증하면 커스텀을 건너뛴다',
        expected: [],
        actual: () => validateObject(customBox()),
      },
      {
        name: '★ 등록되지 않은 kind 를 잡는다 (객체를 버리지 않는다)',
        expected: [UNKNOWN_KIND_ISSUE],
        actual: () => {
          const types = createObjectTypeRegistry([
            defineObjectType({
              kind: 'other',
              label: '다른 것',
              defaultSize: { w: 10, h: 10 },
              defaultData: () => ({}),
            }),
          ])
          return validateObject(customBox({ kind: 'demo.box' }), types).map((i) => i.code)
        },
      },
      {
        name: '소비자 validate 가 낸 메시지를 그대로 전달한다',
        expected: [{ code: 'CUSTOM_INVALID', message: '정답을 입력하세요' }],
        actual: () => {
          const types = createObjectTypeRegistry([
            defineObjectType<{ answers: string[] }>({
              kind: 'demo.box',
              label: '단답형',
              defaultSize: { w: 160, h: 40 },
              defaultData: () => ({ answers: [] }),
              validate: (d) => (d.answers.length > 0 ? null : ['정답을 입력하세요']),
            }),
          ])
          return validateObject(customBox({ data: { answers: [] } }), types)
        },
      },
      {
        name: 'validate 가 통과하면 빈 배열',
        expected: [],
        actual: () => {
          const types = createObjectTypeRegistry([
            defineObjectType<{ answers: string[] }>({
              kind: 'demo.box',
              label: '단답형',
              defaultSize: { w: 160, h: 40 },
              defaultData: () => ({ answers: [] }),
              validate: (d) => (d.answers.length > 0 ? null : ['정답을 입력하세요']),
            }),
          ])
          return validateObject(customBox({ data: { answers: ['서울'] } }), types)
        },
      },
      {
        name: '페이지당 객체 한도를 넘기면 잡는다',
        expected: ['OBJECT_LIMIT_PAGE'],
        actual: () => {
          const objects = Array.from({ length: LIMITS.objectsPerPage + 1 }, (_, i) =>
            customBox({ id: `o${i}` }),
          )
          const doc = createPDFCanvasDoc({ pages: [createPage({ objects })] })
          return validateDoc(doc).issues.map((i) => i.code)
        },
      },
      {
        name: '중복 kind 등록은 던진다',
        expected: true,
        actual: () => {
          const def = defineObjectType({
            kind: 'dup',
            label: 'x',
            defaultSize: { w: 10, h: 10 },
            defaultData: () => ({}),
          })
          try {
            createObjectTypeRegistry([def, def])
            return false
          } catch {
            return true
          }
        },
      },
    ],
  },

  {
    title: '식별자 생성',
    note: 'crypto.randomUUID 는 secure context 전용이다. LAN 주소에서는 getRandomValues 폴백을 쓴다.',
    cases: [
      {
        name: 'UUID v4 형식',
        expected: true,
        actual: () =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(createId()),
      },
      {
        name: '1000개 생성해도 중복 없음',
        expected: 1000,
        actual: () => new Set(Array.from({ length: 1000 }, () => createId())).size,
      },
      {
        name: 'randomUUID 가 없어도 같은 형식 (LAN 주소 재현)',
        expected: true,
        actual: () => {
          const holder = crypto as unknown as { randomUUID?: unknown }
          const original = holder.randomUUID
          holder.randomUUID = undefined
          try {
            const ids = Array.from({ length: 200 }, () => createId())
            const valid = ids.every((id) =>
              /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id),
            )
            return valid && new Set(ids).size === ids.length
          } finally {
            // 다른 케이스에 영향을 주지 않도록 반드시 복원한다.
            holder.randomUUID = original
          }
        },
      },
    ],
  },

  {
    title: '박스 색 스타일',
    note: '미지정 필드는 CSS로 내보내지 않는다 — 그래야 토큰 기본값이 유지된다. null 은 "투명/없음" 이라는 명시적 지정이다.',
    cases: [
      {
        name: '미지정이면 아무 CSS도 내보내지 않는다',
        expected: {},
        actual: () => boxStyleToCss(undefined),
      },
      {
        name: '배경만 지정',
        expected: { background: '#ff0000' },
        actual: () => boxStyleToCss({ fill: '#ff0000' }),
      },
      {
        name: 'fill: null 은 투명으로 내보낸다 (미지정과 다르다)',
        expected: { background: 'transparent' },
        actual: () => boxStyleToCss({ fill: null }),
      },
      {
        name: '테두리 색을 주면 borderStyle 도 함께 나온다',
        expected: { borderColor: '#00ff00', borderStyle: 'solid', borderWidth: '2px' },
        actual: () => boxStyleToCss({ stroke: '#00ff00', strokeWidth: 2 }),
      },
      {
        name: 'stroke: null 이면 두께와 무관하게 테두리를 그리지 않는다',
        expected: { borderStyle: 'none' },
        actual: () => boxStyleToCss({ stroke: null, strokeWidth: 5 }),
      },
      {
        name: '텍스트 기본 배경은 투명 (defaultFill)',
        expected: { background: 'transparent', color: '#111111' },
        actual: () => boxStyleToCss({ color: '#111111' }, { defaultFill: null }),
      },
      {
        name: 'Answer Box 는 배경 미지정 시 CSS를 내보내지 않는다',
        expected: { color: '#111111' },
        actual: () => boxStyleToCss({ color: '#111111' }),
      },
      {
        name: '병합: 새 필드 추가',
        expected: { fill: '#fff', color: '#000' },
        actual: () => mergeBoxStyle({ fill: '#fff' }, { color: '#000' }),
      },
      {
        name: '병합: undefined 는 필드를 제거한다',
        expected: { color: '#000' },
        actual: () => mergeBoxStyle({ fill: '#fff', color: '#000' }, { fill: undefined }),
      },
      {
        name: '병합: null 은 값으로 유지된다 (제거가 아니다)',
        expected: { fill: null },
        actual: () => mergeBoxStyle({ fill: '#fff' }, { fill: null }),
      },
      {
        name: '병합: 모든 필드가 사라지면 undefined',
        expected: undefined,
        actual: () => mergeBoxStyle({ fill: '#fff' }, { fill: undefined }),
      },
      {
        name: '병합: stroke 를 끄면 두께도 함께 사라진다',
        expected: undefined,
        actual: () =>
          mergeBoxStyle(
            { stroke: '#000', strokeWidth: 3 },
            { stroke: undefined, strokeWidth: undefined },
          ),
      },
    ],
  },
]
