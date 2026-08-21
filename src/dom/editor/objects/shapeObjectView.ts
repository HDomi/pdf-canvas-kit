/**
 * 도형 객체. SVG 로 그린다.
 *
 * SVG 를 쓰는 이유: 타원과 화살표를 CSS 로 그리면 편법이 필요하고, 선 두께가 pt 인데 CSS border 는
 * 방향별로 다루기 번거롭다. `viewBox` 를 객체 크기와 일치시켜 좌표를 pt 로 유지한다.
 *
 * ⚠️ **자식도 `svg()` 로 만들어야 한다.** `el()` 로 만들면 HTML 네임스페이스가 되어 에러 없이
 * 안 보인다 (ARCHITECTURE §13.4).
 *
 * ## ⚠️ `shape` 은 `keyed` 로 갈아탄다 (2026.08.21)
 *
 * 예전에는 `const shape = o().shape` 로 **한 번 읽고** `when(() => shape === 'rect', …)` 로
 * 분기했다. `shape` 이 반응형 읽기가 아니므로 인스펙터에서 모양을 바꿔도 조건이 다시 평가되지
 * 않았고, 캔버스는 처음 모양에 굳어 있었다. 뷰어에서는 문서가 교체될 때 노드가 새로 만들어져
 * 정상으로 보였고, 그래서 "편집기만 안 바뀐다" 로 나타났다.
 *
 * `when` 은 **불리언 전용**이라 값 변화를 못 잡는다. 값에 따라 다른 노드를 그리는 자리는
 * `keyed` 다 (ARCHITECTURE §13.5).
 *
 * ## ⚠️ 크기를 `previewRect` 에서 읽는다
 *
 * SVG 의 `viewBox` · `width` · `height` 를 직접 계산하는 유일한 뷰다. 다른 유형은 컨테이너를
 * `100%` 로 채우므로 부모(`objectView`)가 크기를 바꾸면 알아서 따라오지만, 여기는 그 값을
 * 스스로 쓴다. **그래서 미리보기 rect 를 따로 받아야 한다** — 문서를 아직 바꾸지 않은 드래그
 * 중에는 `object.rect` 가 옛 값이고, 그러면 핸들은 움직이는데 도형만 제자리에 남는다
 * (2026.08.21 에 실제로 그 버그가 있었다).
 *
 * 구 `src/vue/editor/objects/ShapeObjectView.vue` 의 이식.
 */
import { keyed, svg } from '../../h'
import type { ReadSignal } from '../../reactive'
import { arrowHeadSize, isPolygonShape, polygonPoints } from '../../../core/geometry/shapes'
import type { Rect, ShapeKind, ShapeObject } from '../../../core/model/types'

export interface ShapeObjectViewProps {
  object: ReadSignal<ShapeObject>
  /**
   * 드래그·리사이즈 중 미리보기 rect. 없으면 문서 값을 쓴다.
   *
   * 뷰어에는 드래그가 없으므로 optional 이다.
   */
  previewRect?: () => Rect | null
}

export function shapeObjectView(props: ShapeObjectViewProps): SVGElement {
  const o = () => props.object.value
  /** 미리보기가 있으면 그것을 쓴다. 드래그 중 문서는 아직 옛 값이다. */
  const rect = () => props.previewRect?.() ?? o().rect
  const w = () => rect().w
  const h = () => rect().h
  const st = () => o().style
  const dash = () => st().dash?.join(' ') ?? null
  /** 테두리가 박스 밖으로 새지 않도록 경로를 안으로 민다. */
  const inset = () => st().strokeWidth / 2

  /**
   * 화살촉 크기. 계산은 core 가 갖는다 — 박스 높이를 정하는 `lineShapeHeight` 와 **같은 식**을
   * 써야 촉이 박스에 정확히 들어찬다. 두 곳에 적으면 한쪽만 고쳐 촉이 잘린다.
   */
  const arrowHead = () => arrowHeadSize(w(), h(), st().strokeWidth)

  /** 모든 도형이 공유하는 페인트 속성. */
  const paint = () => ({
    fill: st().fill ?? 'none',
    stroke: st().stroke,
    'stroke-width': st().strokeWidth,
    'stroke-dasharray': dash(),
  })

  /**
   * 모양별 노드.
   *
   * `keyed` 의 렌더는 키가 바뀔 때 한 번만 돈다 — 안쪽 속성은 각자 effect 로 계속 갱신된다.
   */
  const geometry = (shape: ShapeKind): SVGElement | SVGElement[] => {
    if (shape === 'rect') {
      return svg('rect', {
        attr: {
          x: inset,
          y: inset,
          width: () => Math.max(w() - st().strokeWidth, 0),
          height: () => Math.max(h() - st().strokeWidth, 0),
          fill: () => paint().fill,
          stroke: () => paint().stroke,
          'stroke-width': () => st().strokeWidth,
          'stroke-dasharray': dash,
        },
      })
    }

    if (shape === 'ellipse') {
      return svg('ellipse', {
        attr: {
          cx: () => w() / 2,
          cy: () => h() / 2,
          rx: () => Math.max(w() / 2 - inset(), 0),
          ry: () => Math.max(h() / 2 - inset(), 0),
          fill: () => paint().fill,
          stroke: () => paint().stroke,
          'stroke-width': () => st().strokeWidth,
          'stroke-dasharray': dash,
        },
      })
    }

    if (isPolygonShape(shape)) {
      return svg('polygon', {
        attr: {
          points: () => polygonPoints(shape, w(), h(), inset()),
          fill: () => paint().fill,
          stroke: () => paint().stroke,
          'stroke-width': () => st().strokeWidth,
          'stroke-dasharray': dash,
          /*
           * 뾰족한 꼭짓점에서 miter 가 길게 튀어나온다 — 별의 다섯 끝이 특히 심하다.
           * `round` 는 두께와 무관하게 박스 안에 머문다.
           */
          'stroke-linejoin': 'round',
        },
      })
    }

    // 선 계열. rect 의 좌측 중앙에서 우측 중앙으로 그린다.
    const heads = shape === 'arrow' ? 1 : shape === 'doubleArrow' ? 2 : 0
    /** 화살촉이 있는 쪽은 선을 촉만큼 물러서게 한다 — 촉 안에서 선이 비쳐 보이지 않게. */
    const x1 = () => (heads === 2 ? arrowHead() : 0)
    const x2 = () => (heads >= 1 ? Math.max(w() - arrowHead(), x1()) : w())

    /** 한쪽 화살촉. `dir` 은 `1` 이면 오른쪽(x = w), `-1` 이면 왼쪽(x = 0) 을 가리킨다. */
    const head = (dir: 1 | -1) =>
      svg('polygon', {
        attr: {
          points: () => {
            const a = arrowHead()
            const mid = h() / 2
            const tip = dir === 1 ? w() : 0
            const back = tip - dir * a
            return `${tip},${mid} ${back},${mid - a / 2} ${back},${mid + a / 2}`
          },
          fill: () => st().stroke,
        },
      })

    return [
      svg('line', {
        attr: {
          x1,
          y1: () => h() / 2,
          x2,
          y2: () => h() / 2,
          stroke: () => st().stroke,
          'stroke-width': () => st().strokeWidth,
          'stroke-dasharray': dash,
        },
      }),
      ...(heads >= 1 ? [head(1)] : []),
      ...(heads === 2 ? [head(-1)] : []),
    ]
  }

  return svg(
    'svg',
    {
      class: 'pck-obj-shape',
      attr: {
        viewBox: () => `0 0 ${w()} ${h()}`,
        width: w,
        height: h,
        preserveAspectRatio: 'none',
      },
    },
    [keyed(() => o().shape, geometry)],
  )
}
