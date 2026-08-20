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
 *
 * ## ★ `defer: true` 가 필요한 이유
 *
 * effect 실행 순서는 **등록 순서**다. 배율이 바뀌면 두 가지가 일어난다 — 페이지 프레임의 인라인
 * 스타일이 갱신되고(렌더 층의 effect), 프레임 위치를 다시 측정해야 한다(여기).
 *
 * 이 컨트롤러는 DOM 이 만들어지기 **전에** 설정되므로 스타일 바인딩보다 먼저 등록된다.
 * `defer` 없이 두면 **이전 배율의 위치를 캐시하고**, 선택 핸들이 줌 직후 어긋난 자리에 그려진다.
 * `defer` 는 그 턴의 동기 effect 가 전부 끝난 뒤에 측정하게 한다 (Vue 의 `flush: 'post'` 자리).
 *
 * 구 `src/vue/composables/usePageViewport.ts` 의 이식.
 */
import { onCleanup, signal, watch, type ReadSignal, type Signal } from '../dom/reactive'
import type { PageViewport } from '../core/geometry/units'
import type { Size } from '../core/model/types'

export interface PageViewportOptions {
  /** 스테이지 스크롤 컨테이너. 스크롤이 발생하면 캐시를 버린다. */
  stageEl: ReadSignal<HTMLElement | null>
  /** 현재 페이지의 프레임 엘리먼트. */
  frameEl: ReadSignal<HTMLElement | null>
  pageId: ReadSignal<string | null>
  pageSize: ReadSignal<Size | null>
  scale: ReadSignal<number>
}

export interface PageViewportTracker {
  /** 현재 뷰포트. 페이지가 없으면 null. */
  viewport: ReadSignal<PageViewport | null>
  /** 프레임 위치를 다시 측정한다. 드래그 시작과 자동 스크롤 중에 호출한다. */
  remeasure: () => PageViewport | null
}

export function createPageViewport(options: PageViewportOptions): PageViewportTracker {
  const { stageEl, frameEl, pageId, pageSize, scale } = options
  const viewport: Signal<PageViewport | null> = signal<PageViewport | null>(null)

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

  /*
   * 배율·페이지가 바뀌면 프레임 위치도 바뀐다. `defer: true` 로 스타일 갱신 뒤에 측정한다
   * (위 주석 참고).
   */
  watch(
    () => [pageId.value, pageSize.value, scale.value, frameEl.value],
    () => remeasure(),
    { immediate: true, defer: true },
  )

  const onScroll = () => remeasure()

  // 스테이지 엘리먼트가 바뀔 때마다 리스너를 옮긴다. 문서가 비면 스테이지가 사라진다.
  watch(
    () => stageEl.value,
    (el, prev) => {
      prev?.removeEventListener('scroll', onScroll)
      el?.addEventListener('scroll', onScroll, { passive: true })
    },
    { immediate: true },
  )

  window.addEventListener('resize', onScroll)
  onCleanup(() => {
    stageEl.value?.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
  })

  return { viewport, remeasure }
}
