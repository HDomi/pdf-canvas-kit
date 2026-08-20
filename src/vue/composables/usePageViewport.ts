/**
 * 페이지 프레임의 화면 위치를 추적한다 (PLAN 5.4, D11).
 *
 * 좌표 변환은 `getBoundingClientRect()` 기준이다. `scrollLeft` 를 직접 더하지 않는 이유는
 * 스테이지 스크롤·툴바·호스트 레이아웃까지 전부 합산해야 하고 하나만 빠지면 클릭 지점이
 * 어긋나기 때문이다.
 *
 * ## 캐시 정책
 *
 * `pointermove` 마다 측정하면 레이아웃 스래싱이 난다. 그래서 드래그 시작에 한 번 측정하고,
 * 스크롤·줌·리사이즈에 무효화한다. 드래그 중 자동 스크롤이 일어나면 그 프레임에서 다시 측정해야
 * 하므로 `remeasure()` 를 노출한다.
 */
import { onScopeDispose, ref, watch, type Ref } from 'vue'
import type { PageViewport } from '../../core/geometry/units'
import type { Size } from '../../core/model/types'

export interface UsePageViewportOptions {
  /** 스테이지 스크롤 컨테이너. 스크롤이 발생하면 캐시를 버린다. */
  stageEl: Ref<HTMLElement | null>
  /** 현재 페이지의 프레임 엘리먼트. */
  frameEl: Ref<HTMLElement | null>
  pageId: Ref<string | null>
  pageSize: Ref<Size | null>
  scale: Ref<number>
}

export interface UsePageViewport {
  /** 현재 뷰포트. 페이지가 없으면 null. */
  viewport: Ref<PageViewport | null>
  /** 프레임 위치를 다시 측정한다. 드래그 시작과 자동 스크롤 중에 호출한다. */
  remeasure: () => PageViewport | null
}

export function usePageViewport(options: UsePageViewportOptions): UsePageViewport {
  const { stageEl, frameEl, pageId, pageSize, scale } = options
  const viewport = ref<PageViewport | null>(null)

  function remeasure(): PageViewport | null {
    const el = frameEl.value
    const id = pageId.value
    const size = pageSize.value
    if (!el || !id || !size) {
      viewport.value = null
      return null
    }
    const rect = el.getBoundingClientRect()
    const next: PageViewport = {
      pageId: id,
      size,
      scale: scale.value,
      frameRect: { left: rect.left, top: rect.top },
    }
    viewport.value = next
    return next
  }

  // 배율·페이지가 바뀌면 프레임 위치도 바뀐다. flush: 'post' 로 레이아웃 반영 후 측정한다.
  watch([pageId, pageSize, scale, frameEl], () => remeasure(), { flush: 'post', immediate: true })

  const onScroll = () => remeasure()
  watch(
    stageEl,
    (el, prev) => {
      prev?.removeEventListener('scroll', onScroll)
      el?.addEventListener('scroll', onScroll, { passive: true })
    },
    { immediate: true },
  )

  window.addEventListener('resize', onScroll)
  onScopeDispose(() => {
    stageEl.value?.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
  })

  return { viewport, remeasure }
}
