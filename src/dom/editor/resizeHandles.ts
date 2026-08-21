/**
 * 8방향 리사이즈 핸들 + 회전 핸들.
 *
 * **배율 transform 밖에** 그린다 (핸들·마퀴는 scale 밖 오버레이다). 안에 두면 25% 배율에서 핸들이 2px 로 줄어 잡을 수
 * 없다. 그래서 좌표는 `rectToFrame` 으로 화면 px 로 변환하고, 핸들 자체 크기는 배율과 무관하게
 * 고정한다.
 *
 * ## 도형 밖으로 밀어낸다 (2026.08.21)
 *
 * 핸들 앵커는 객체 경계가 아니라 `EDITOR_DEFAULTS.handles.outsetPx` 만큼 넓힌 사각형이다.
 * 리사이즈 계산은 포인터 델타로 하므로 핸들이 어디 그려져도 결과가 같다 — 옮기는 것은
 * **보이는 위치와 히트 영역**뿐이다.
 *
 * ## 회전 반영
 *
 * 객체가 회전하면 핸들도 함께 돌아야 한다. 핸들 좌표를 하나씩 회전 계산하는 대신 **감싸는
 * 래퍼에 `rotate()` 를 걸고, 핸들 자신은 역회전**시킨다. 그러면 핸들 위치는 객체를 따라 돌고
 * 핸들 모양(정사각형)은 화면 기준으로 유지된다 — 기울어진 핸들은 잡기 어렵다.
 *
 * 구 `src/vue/editor/ResizeHandles.vue` 의 이식.
 */
import { el, when } from '../h'
import { EDITOR_DEFAULTS } from '../../core/config/defaults'
import {
  HANDLE_ANCHORS,
  HANDLE_CURSORS,
  HANDLE_IDS,
  outsetFrame,
  ROTATE_HANDLE_OFFSET_PX,
  type HandleId,
} from '../../core/geometry/handles'
import { rectToFrame, type PageViewport } from '../../core/geometry/units'
import type { Rect } from '../../core/model/types'

export interface ResizeHandlesProps {
  rect: () => Rect
  viewport: () => PageViewport
  /** 회전 핸들을 그릴지. Answer Box 는 회전하지 않는다. */
  rotatable: () => boolean
  /** 현재 각도(deg). 드래그 중이면 미리보기 값이 들어온다. */
  rotation: () => number
  onGrab: (handle: HandleId, e: PointerEvent) => void
  onGrabRotate: (e: PointerEvent) => void
}

const size = EDITOR_DEFAULTS.handles.sizePx
const hit = EDITOR_DEFAULTS.handles.hitPx
/**
 * 히트 영역을 시각 크기보다 키운다. 잡기 편해야 한다.
 *
 * **투명 테두리**로 준다 — `padding` 으로 주면 보이는 테두리(`box-shadow: inset`)가 흰
 * 사각형 경계가 아니라 히트 박스 경계에 그려진다 (`editor.css` 의 `.pck-handle` 주석).
 */
const border = (hit - size) / 2

export function resizeHandles(props: ResizeHandlesProps): HTMLElement {
  /**
   * 핸들을 놓을 사각형. 객체 프레임을 `outsetPx` 만큼 **밖으로 넓힌** 것이다.
   *
   * 객체 경계에 붙이면 핸들이 도형 위에 얹혀 얇은 객체(선·화살표)의 본체를 덮는다 —
   * 잡아 옮길 자리가 없어진다. 넓히면 가운데가 비고, 실제 도형 경계는 `.pck-select-box` 가
   * 계속 보여 준다.
   *
   * 좌우·상하로 같은 값을 더하므로 **중심은 변하지 않는다** — 회전 원점이 그대로다.
   */
  const frameRect = () => outsetFrame(rectToFrame(props.rect(), props.viewport()))

  /** 핸들 자신은 역회전시켜 화면 기준 정사각형을 유지한다. */
  const counterRotate = () => (props.rotation() ? ` rotate(${-props.rotation()}deg)` : '')

  /**
   * 회전을 담당하는 래퍼.
   *
   * 객체의 중심을 회전 원점으로 삼는다. 객체 렌더도 `transform-origin: center` 를 쓰므로
   * 두 회전이 정확히 겹친다.
   */
  return el(
    'div',
    {
      class: 'pck-handle-group',
      style: () => {
        if (!props.rotation()) return {}
        const r = frameRect()
        return {
          transform: `rotate(${props.rotation()}deg)`,
          'transform-origin': `${r.x + r.w / 2}px ${r.y + r.h / 2}px`,
        }
      },
    },
    [
      HANDLE_IDS.map((id) =>
        el('button', {
          class: 'pck-handle',
          attr: { type: 'button', 'data-handle': id, 'aria-label': `resize ${id}` },
          style: () => {
            const a = HANDLE_ANCHORS[id]
            const r = frameRect()
            return {
              left: r.x + r.w * a.fx,
              top: r.y + r.h * a.fy,
              width: size,
              height: size,
              'border-width': border,
              // translate 로 앵커를 핸들 중앙에 맞춘 뒤 역회전을 얹는다.
              transform: `translate(-50%, -50%)${counterRotate()}`,
              cursor: HANDLE_CURSORS[id],
            }
          },
          on: {
            pointerdown: (e) => {
              // 캔버스로 내려가면 마퀴 선택이 시작된다.
              e.stopPropagation()
              e.preventDefault()
              props.onGrab(id, e as PointerEvent)
            },
          },
        }),
      ),

      /** 회전 핸들은 위쪽 엣지 밖에 둔다. 리사이즈 핸들과 겹치지 않는 관례적 위치다. */
      when(props.rotatable, () =>
        el('button', {
          class: 'pck-handle pck-handle--rotate',
          attr: { type: 'button', 'aria-label': 'rotate' },
          style: () => {
            const r = frameRect()
            return {
              left: r.x + r.w / 2,
              top: r.y - ROTATE_HANDLE_OFFSET_PX,
              width: size,
              height: size,
              'border-width': border,
              transform: `translate(-50%, -50%)${counterRotate()}`,
            }
          },
          on: {
            pointerdown: (e) => {
              e.stopPropagation()
              e.preventDefault()
              props.onGrabRotate(e as PointerEvent)
            },
          },
        }),
      ),
    ],
  )
}
