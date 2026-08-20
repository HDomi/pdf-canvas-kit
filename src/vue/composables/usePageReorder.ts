/**
 * 좌측 페이지 목록의 드래그 순서 변경.
 *
 * HTML5 Drag and Drop이 아니라 포인터 이벤트로 구현한다. HTML5 DnD는 드래그 이미지를 브라우저가
 * 만들어 커스터마이즈가 어렵고, `dragover` 좌표가 요소 경계에서 튀어 삽입 위치 계산이 불안정하다.
 * 편집기의 다른 드래그(객체 이동·팬)가 이미 포인터 이벤트를 쓰므로 방식도 통일된다.
 *
 * ## 삽입 위치 판정
 *
 * 포인터가 어느 썸네일의 중간선을 넘었는지로 정한다. 요소 위에 있는지가 아니라 중간선 기준이라,
 * 목록 끝이나 항목 사이 빈 틈에서도 판정이 끊기지 않는다.
 */
import { onScopeDispose, ref, type Ref } from 'vue'

export interface UsePageReorderOptions {
  /** 스크롤 컨테이너. 각 항목은 `[data-page-index]` 를 갖는다. */
  listEl: Ref<HTMLElement | null>
  /** 드래그가 끝났을 때 호출된다. `to` 는 제거 후 목록에서의 목표 인덱스다. */
  onReorder: (from: number, to: number) => void
  disabled?: Ref<boolean>
}

export interface UsePageReorder {
  /** 드래그 중인 원본 인덱스. 없으면 null. */
  draggingIndex: Ref<number | null>
  /**
   * 삽입 표시선을 그릴 위치. `n` 이면 n번째 항목 **앞**을 뜻하고,
   * 목록 길이와 같으면 맨 끝이다.
   */
  dropIndex: Ref<number | null>
  onItemPointerDown: (index: number, e: PointerEvent) => void
}

/** 드래그로 인정할 최소 이동 거리(px). 클릭이 드래그로 오인되지 않게 한다. */
const DRAG_THRESHOLD_PX = 4

export function usePageReorder(options: UsePageReorderOptions): UsePageReorder {
  const draggingIndex = ref<number | null>(null)
  const dropIndex = ref<number | null>(null)

  let pointerId: number | null = null
  let startY = 0
  let armedIndex: number | null = null
  let captureEl: HTMLElement | null = null

  /** 포인터 y로 삽입 인덱스를 구한다. 각 항목의 중간선을 기준으로 한다. */
  function computeDropIndex(clientY: number): number {
    const list = options.listEl.value
    if (!list) return 0
    const items = [...list.querySelectorAll<HTMLElement>('[data-page-index]')]
    for (const item of items) {
      const rect = item.getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) {
        return Number(item.dataset['pageIndex'])
      }
    }
    return items.length
  }

  function onMove(e: PointerEvent) {
    if (e.pointerId !== pointerId || armedIndex === null) return

    // 임계값을 넘기 전에는 드래그로 보지 않는다. 썸네일 클릭이 페이지 전환이어야 하기 때문이다.
    if (draggingIndex.value === null) {
      if (Math.abs(e.clientY - startY) < DRAG_THRESHOLD_PX) return
      draggingIndex.value = armedIndex
    }

    dropIndex.value = computeDropIndex(e.clientY)
  }

  function finish(e: PointerEvent) {
    if (e.pointerId !== pointerId) return
    const from = draggingIndex.value
    const drop = dropIndex.value

    if (captureEl?.hasPointerCapture(e.pointerId)) captureEl.releasePointerCapture(e.pointerId)
    pointerId = null
    armedIndex = null
    captureEl = null
    draggingIndex.value = null
    dropIndex.value = null

    if (from === null || drop === null) return

    // 삽입 위치를 "제거 후 인덱스" 로 바꾼다. 자기 앞으로 넣는 경우 인덱스가 하나 밀린다.
    const to = drop > from ? drop - 1 : drop
    if (to === from) return
    options.onReorder(from, to)
  }

  function onItemPointerDown(index: number, e: PointerEvent) {
    if (options.disabled?.value || e.button !== 0) return
    pointerId = e.pointerId
    armedIndex = index
    startY = e.clientY
    captureEl = e.currentTarget instanceof HTMLElement ? e.currentTarget : null
    captureEl?.setPointerCapture(e.pointerId)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', finish)
  window.addEventListener('pointercancel', finish)
  onScopeDispose(() => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
  })

  return { draggingIndex, dropIndex, onItemPointerDown }
}
