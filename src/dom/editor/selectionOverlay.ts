/**
 * 선택 테두리·핸들·마퀴를 그리는 오버레이 (PLAN D5).
 *
 * 페이지 프레임 위에 절대 배치되며 **배율 transform 밖**이다. 그래서 어떤 배율에서도 선 두께와
 * 핸들 크기가 일정하다. 좌표는 `rectToFrame` 으로 변환한다 — 객체 뷰와 달리 여기서는 변환이
 * 정상이고 필요하다.
 *
 * 구 `src/vue/editor/SelectionOverlay.vue` 의 이식.
 */
import { el, list, when } from '../h'
import type { ReadSignal } from '../reactive'
import { rectToFrame, type PageViewport } from '../../core/geometry/units'
import type { HandleId } from '../../core/geometry/handles'
import type { Rect } from '../../core/model/types'
import { resizeHandles } from './resizeHandles'

export interface SelectionOverlayProps {
  viewport: ReadSignal<PageViewport | null>
  /**
   * 선택된 객체들. rect 는 pt 이고, 드래그 중이면 미리보기 값이 들어온다.
   * `rotation` 을 함께 받아 테두리도 객체와 같이 기울인다.
   */
  selectedRects: ReadSignal<readonly { rect: Rect; rotation: number }[]>
  /** 드래그로 그리는 중인 영역. 생성 마퀴와 선택 마퀴를 구분한다. */
  preview: ReadSignal<{ rect: Rect; kind: 'create' | 'marquee' } | null>
  /** 핸들을 그릴 대상. 단일 선택일 때만 준다. */
  handleRect: ReadSignal<Rect | null>
  rotatable: ReadSignal<boolean>
  handleRotation: ReadSignal<number>
  onGrabHandle: (handle: HandleId, e: PointerEvent) => void
  onGrabRotate: (e: PointerEvent) => void
}

/** pt rect → 프레임 px 스타일. 회전 원점은 객체 렌더와 같은 center 다. */
function boxStyle(frame: Rect, rotation: number) {
  return {
    left: frame.x,
    top: frame.y,
    width: frame.w,
    height: frame.h,
    transform: rotation ? `rotate(${rotation}deg)` : null,
    'transform-origin': rotation ? 'center' : null,
  }
}

export function selectionOverlay(props: SelectionOverlayProps): HTMLElement {
  return el('div', { class: 'pck-overlay', attr: { 'aria-hidden': 'true' } }, [
    /*
     * 선택 박스. 인덱스를 키로 쓴다 — 여기서 재사용할 상태가 없는 순수 표시 요소이고,
     * 개수가 1~수십이라 키 최적화의 이득이 없다.
     */
    list(
      () => (props.viewport.value ? props.selectedRects.value : []),
      (_, i) => i,
      (item) =>
        el('div', {
          class: 'pck-select-box',
          style: () => {
            const vp = props.viewport.value
            if (!vp) return {}
            return boxStyle(rectToFrame(item.value.rect, vp), item.value.rotation)
          },
        }),
    ),

    when(
      () => props.viewport.value !== null && props.preview.value !== null,
      () =>
        el('div', {
          class: () => `pck-marquee is-${props.preview.value?.kind ?? 'marquee'}`,
          style: () => {
            const vp = props.viewport.value
            const p = props.preview.value
            if (!vp || !p) return {}
            return boxStyle(rectToFrame(p.rect, vp), 0)
          },
        }),
    ),

    when(
      () => props.viewport.value !== null && props.handleRect.value !== null,
      () =>
        resizeHandles({
          // 위 조건이 통과한 뒤에만 그려지므로 `!` 가 안전하다.
          rect: () => props.handleRect.value!,
          viewport: () => props.viewport.value!,
          rotatable: () => props.rotatable.value,
          rotation: () => props.handleRotation.value,
          onGrab: props.onGrabHandle,
          onGrabRotate: props.onGrabRotate,
        }),
    ),
  ])
}
