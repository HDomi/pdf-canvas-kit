/**
 * 단일 페이지 스테이지의 현재 페이지 내비게이션 (PLAN 6.2, D8).
 *
 * 스테이지가 페이지 하나만 렌더하므로 "현재 페이지"는 스크롤 위치에서 추론하는 값이 아니라
 * 명시적 상태다. 그래서 연속 스크롤 레이아웃에 필요한 가시성 추적과 억제 플래그가 사라지고,
 * DOM 비용이 페이지 수와 무관해진다.
 *
 * 페이지를 전환하면 스크롤을 리셋하고 선택을 비운다. 둘 중 하나라도 그대로 넘기면 이미 화면에
 * 없는 내용을 가리키게 된다.
 *
 * 구 `src/vue/composables/usePageNav.ts` 의 이식.
 */
import { computed, type ReadSignal, type Signal } from '../dom/reactive'
import { clampPageIndex } from '../core/model/viewState'
import type { PDFCanvasPage } from '../core/model/types'

export interface PageNavOptions {
  pages: ReadSignal<PDFCanvasPage[]>
  currentPageIndex: Signal<number>
  selectedObjectIds: Signal<string[]>
  stageEl: ReadSignal<HTMLElement | null>
}

export interface PageNav {
  currentPage: ReadSignal<PDFCanvasPage | null>
  /** 표시용 1-based 번호. 문서가 비어 있으면 0. */
  currentPageNumber: ReadSignal<number>
  canGoPrev: ReadSignal<boolean>
  canGoNext: ReadSignal<boolean>
  goTo: (index: number) => void
  goToPageId: (pageId: string) => void
  prev: () => void
  next: () => void
  first: () => void
  last: () => void
  /** 페이지가 추가·삭제된 뒤 인덱스를 다시 클램프한다. */
  reclamp: () => void
}

export function createPageNav(options: PageNavOptions): PageNav {
  const { pages, currentPageIndex, selectedObjectIds, stageEl } = options

  const currentPage = computed(() => pages.value[currentPageIndex.value] ?? null)

  function goTo(index: number) {
    const next = clampPageIndex(index, pages.value.length)
    if (next === currentPageIndex.value) return
    currentPageIndex.value = next
    // 선택 항목은 방금 떠난 페이지의 객체를 가리킨다.
    selectedObjectIds.value = []
    const el = stageEl.value
    if (el) {
      el.scrollTop = 0
      el.scrollLeft = 0
    }
  }

  return {
    currentPage,
    currentPageNumber: computed(() =>
      currentPageIndex.value < 0 ? 0 : currentPageIndex.value + 1,
    ),
    canGoPrev: computed(() => currentPageIndex.value > 0),
    canGoNext: computed(() => currentPageIndex.value < pages.value.length - 1),
    goTo,
    goToPageId(pageId) {
      const index = pages.value.findIndex((p) => p.id === pageId)
      if (index >= 0) goTo(index)
    },
    prev: () => goTo(currentPageIndex.value - 1),
    next: () => goTo(currentPageIndex.value + 1),
    first: () => goTo(0),
    last: () => goTo(pages.value.length - 1),
    reclamp() {
      const next = clampPageIndex(currentPageIndex.value, pages.value.length)
      if (next !== currentPageIndex.value) currentPageIndex.value = next
    },
  }
}
