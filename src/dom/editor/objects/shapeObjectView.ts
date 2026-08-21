/**
 * 도형 객체. SVG 로 그린다.
 *
 * SVG 를 쓰는 이유: 타원과 화살표를 CSS 로 그리면 편법이 필요하고, 선 두께가 pt 인데 CSS border 는
 * 방향별로 다루기 번거롭다. `viewBox` 를 객체 크기와 일치시켜 좌표를 pt 로 유지한다.
 *
 * ⚠️ **자식도 `svg()` 로 만들어야 한다.** `el()` 로 만들면 HTML 네임스페이스가 되어 에러 없이
 * 안 보인다 (ARCHITECTURE §13.4).
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
import { svg, when } from '../../h'
import type { ReadSignal } from '../../reactive'
import type { Rect, ShapeObject } from '../../../core/model/types'

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

  /** 화살촉 크기. 선 두께에 비례하되 객체 크기를 넘지 않게 제한한다. */
  const arrowHead = () => Math.min(st().strokeWidth * 4, w() / 2, h() / 2 + 4)

  const shape = o().shape

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
    [
      when(
        () => shape === 'rect',
        () =>
          svg('rect', {
            attr: {
              x: () => st().strokeWidth / 2,
              y: () => st().strokeWidth / 2,
              width: () => Math.max(w() - st().strokeWidth, 0),
              height: () => Math.max(h() - st().strokeWidth, 0),
              fill: () => st().fill ?? 'none',
              stroke: () => st().stroke,
              'stroke-width': () => st().strokeWidth,
              'stroke-dasharray': dash,
            },
          }),
      ),
      when(
        () => shape === 'ellipse',
        () =>
          svg('ellipse', {
            attr: {
              cx: () => w() / 2,
              cy: () => h() / 2,
              rx: () => Math.max(w() / 2 - st().strokeWidth / 2, 0),
              ry: () => Math.max(h() / 2 - st().strokeWidth / 2, 0),
              fill: () => st().fill ?? 'none',
              stroke: () => st().stroke,
              'stroke-width': () => st().strokeWidth,
              'stroke-dasharray': dash,
            },
          }),
      ),
      // 선과 화살표는 rect 의 좌측 중앙에서 우측 중앙으로 그린다.
      when(
        () => shape === 'line' || shape === 'arrow',
        () => [
          svg('line', {
            attr: {
              x1: 0,
              y1: () => h() / 2,
              x2: () => (shape === 'arrow' ? Math.max(w() - arrowHead(), 0) : w()),
              y2: () => h() / 2,
              stroke: () => st().stroke,
              'stroke-width': () => st().strokeWidth,
              'stroke-dasharray': dash,
            },
          }),
          ...(shape === 'arrow'
            ? [
                svg('polygon', {
                  attr: {
                    points: () => {
                      const a = arrowHead()
                      const mid = h() / 2
                      return `${w()},${mid} ${w() - a},${mid - a / 2} ${w() - a},${mid + a / 2}`
                    },
                    fill: () => st().stroke,
                  },
                }),
              ]
            : []),
        ],
      ),
    ],
  )
}
