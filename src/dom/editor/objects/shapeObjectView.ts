/**
 * 도형 객체. SVG 로 그린다.
 *
 * SVG 를 쓰는 이유: 타원과 화살표를 CSS 로 그리면 편법이 필요하고, 선 두께가 pt 인데 CSS border 는
 * 방향별로 다루기 번거롭다. `viewBox` 를 객체 크기와 일치시켜 좌표를 pt 로 유지한다.
 *
 * ⚠️ **자식도 `svg()` 로 만들어야 한다.** `el()` 로 만들면 HTML 네임스페이스가 되어 에러 없이
 * 안 보인다 (ARCHITECTURE §13.4).
 *
 * 구 `src/vue/editor/objects/ShapeObjectView.vue` 의 이식.
 */
import { svg, when } from '../../h'
import type { ReadSignal } from '../../reactive'
import type { ShapeObject } from '../../../core/model/types'

export function shapeObjectView(props: { object: ReadSignal<ShapeObject> }): SVGElement {
  const o = () => props.object.value
  const w = () => o().rect.w
  const h = () => o().rect.h
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
