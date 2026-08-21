/**
 * 스테이지 배율. 맞춤 모드, 앵커 기준 줌, 리사이즈 추적.
 *
 * ## 순서 함정 — Vue 판과 달라진 지점
 *
 * `scale` 을 바꾸면 페이지 프레임 크기가 변하고, 그에 따라 스크롤 범위가 달라진다. 그 레이아웃이
 * 반영되기 전에 스크롤을 보정하면 *이전* 최대값에 걸려 잘리고, 앵커가 밀린다.
 *
 * Vue 판은 이 때문에 모든 보정 앞에 `await nextTick()` 이 있었다. **여기서는 필요 없다.**
 * effect 가 동기이므로 `scale.value = next` 가 끝나는 순간 프레임의 인라인 스타일이 이미
 * 갱신돼 있고, 이어서 `scrollLeft` 를 읽거나 쓰면 브라우저가 reflow 를 강제한다. 그래서
 * 같은 순서 제약이 동기 코드로 성립하고, 함수들이 `Promise` 를 반환하지 않는다.
 *
 * ⚠️ **이 성질은 실제 브라우저에서 확인해야 한다.** happy-dom 은 `getBoundingClientRect()` 가
 * 전부 0 이라 헤드리스 검증으로 덮이지 않는다.
 *
 * 구 `src/vue/composables/useStage.ts` 의 이식.
 */
import { computed, signal, watch, type ReadSignal, type Signal } from '../dom/reactive'
import { EDITOR_DEFAULTS } from '../core/config/defaults'
import { clampScale, stepZoom, type FitMode } from '../core/model/viewState'
import type { Rect, Size } from '../core/model/types'

export interface StageOptions {
  /** 스크롤 컨테이너. 팬과 줌 앵커링이 이걸 대상으로 동작한다. */
  stageEl: ReadSignal<HTMLElement | null>
  /** 현재 스테이지에 올라온 페이지의 크기. 없으면 null. */
  pageSize: ReadSignal<Size | null>
  /**
   * 시작 배율.
   * @default 'fit-page' — 로드 시 페이지 전체가 보인다. 편집기가 어디서 작업할지 정하기 전에
   * 무엇을 올렸는지 먼저 확인할 수 있어야 한다.
   */
  initialScale?: number | 'fit-width' | 'fit-page'
}

export interface Stage {
  scale: Signal<number>
  fitMode: Signal<FitMode>
  /** 정수 퍼센트로 표현한 배율. 줌 컨트롤 라벨용. */
  percent: ReadSignal<number>
  /** 현재 맞춤 모드로 배율을 다시 계산한다. 리사이즈와 페이지 전환 시 호출된다. */
  applyFit: () => void
  setFitMode: (mode: Exclude<FitMode, 'none'>) => void
  /** 배율을 직접 지정하고 `fitMode: 'none'` 으로 전환한다. */
  zoomTo: (next: number, anchor?: { x: number; y: number }) => void
  /** 프리셋 계단을 밟는다. 스테이지 중앙을 앵커로 삼는다. */
  zoomStep: (direction: 1 | -1) => void
  /** Ctrl/Cmd + 휠, 트랙패드 pinch. 포인터 위치를 앵커로 한 연속 줌. */
  zoomByWheel: (deltaY: number, anchor: { x: number; y: number }) => void
  canZoomIn: ReadSignal<boolean>
  canZoomOut: ReadSignal<boolean>
  /** pt rect 를 화면 중앙으로 스크롤한다. 이미 보이면 움직이지 않는다. */
  scrollRectIntoView: (rect: Rect) => void
}

export function createStage(options: StageOptions): Stage {
  const { stageEl, pageSize } = options
  const pad = EDITOR_DEFAULTS.stagePadding

  const initial = options.initialScale ?? 'fit-page'
  const scale = signal(typeof initial === 'number' ? clampScale(initial) : 1)
  const fitMode = signal<FitMode>(
    typeof initial === 'number' ? 'none' : initial === 'fit-width' ? 'width' : 'page',
  )

  /**
   * 주어진 모드에서 페이지가 스테이지에 맞는 배율.
   *
   * `page` 는 두 비율 중 작은 쪽을 택해 잘리는 부분이 없게 한다 — 그게 "페이지 전체가 보인다"의
   * 뜻이다. `width` 는 폭을 채우고 페이지가 아래로 넘어가는 것을 허용한다.
   *
   * 스테이지나 페이지를 아직 측정할 수 없으면 null 을 돌려준다. 호출자는 이걸 배율 1로
   * 취급해서는 안 된다.
   */
  function fitScale(mode: Exclude<FitMode, 'none'>): number | null {
    const el = stageEl.value
    const size = pageSize.value
    if (!el || !size || size.width <= 0 || size.height <= 0) return null
    // clientWidth/Height 는 스크롤바를 제외하므로, "맞음"과 "스크롤바 필요" 사이를
    // 왕복하는 일이 없다.
    if (el.clientWidth <= 0 || el.clientHeight <= 0) return null
    const byWidth = (el.clientWidth - pad * 2) / size.width
    if (mode === 'width') return clampScale(byWidth)
    const byHeight = (el.clientHeight - pad * 2) / size.height
    return clampScale(Math.min(byWidth, byHeight))
  }

  function applyFit() {
    if (fitMode.value === 'none') return
    const next = fitScale(fitMode.value)
    if (next !== null) scale.value = next
  }

  /**
   * `anchor`(뷰포트 좌표)가 같은 문서 지점 위에 머물도록 유지하며 새 배율을 적용한다.
   *
   * 페이지가 스테이지보다 작으면 보정을 건너뛴다. 스크롤 범위가 0이고 위치는 중앙 정렬이
   * 결정하므로, "보정"이 오히려 레이아웃과 싸운다.
   */
  function applyScale(next: number, anchor?: { x: number; y: number }) {
    const el = stageEl.value
    const clamped = clampScale(next)
    if (!el) {
      scale.value = clamped
      return
    }

    const rect = el.getBoundingClientRect()
    const point = anchor ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    const offsetX = point.x - rect.left
    const offsetY = point.y - rect.top
    // 현재 배율에서 앵커의 콘텐트 좌표.
    const contentX = offsetX + el.scrollLeft
    const contentY = offsetY + el.scrollTop
    const ratio = clamped / scale.value
    const wasScrollable = el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight

    // 대입이 끝나면 프레임 스타일이 이미 갱신돼 있다. 아래 scrollWidth 읽기가 reflow 를 강제한다.
    scale.value = clamped

    if (!wasScrollable && el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) {
      return
    }
    el.scrollLeft = contentX * ratio - offsetX
    el.scrollTop = contentY * ratio - offsetY
  }

  // 페이지 크기가 변하면 다시 맞춘다. 스테이지 리사이즈는 호출자가 applyFit 을 부른다.
  watch(() => pageSize.value, applyFit)

  return {
    scale,
    fitMode,
    percent: computed(() => Math.round(scale.value * 100)),
    applyFit,

    setFitMode(mode) {
      fitMode.value = mode
      const next = fitScale(mode)
      if (next === null) return
      // 페이지 좌상단을 앵커로 삼는다. "맞춤"의 시각적 의미와 일치한다.
      const el = stageEl.value
      scale.value = next
      if (el) {
        el.scrollTop = 0
        el.scrollLeft = 0
      }
    },

    zoomTo(next, anchor) {
      // 직접 줌하면 맞춤 모드에서 빠진다. 그래야 창 크기 변경이 사용자의 선택을
      // 덮어쓰지 않는다.
      fitMode.value = 'none'
      applyScale(next, anchor)
    },

    zoomStep(direction) {
      fitMode.value = 'none'
      applyScale(stepZoom(scale.value, direction))
    },

    zoomByWheel(deltaY, anchor) {
      fitMode.value = 'none'
      const { wheelFactor, wheelMaxDelta } = EDITOR_DEFAULTS.zoom
      /*
       * 상한을 둔다. `deltaMode: PAGE` 나 관성 스크롤의 급발진 한 방에 배율이 최소·최대로
       * 튀는 것을 막는다 — 정규화(`normalizeWheelDelta`)를 거쳐도 값 자체는 브라우저가 정한다.
       */
      const d = Math.max(-wheelMaxDelta, Math.min(wheelMaxDelta, deltaY))
      applyScale(scale.value * wheelFactor ** -d, anchor)
    },

    canZoomIn: computed(() => scale.value < EDITOR_DEFAULTS.zoom.max - 0.001),
    canZoomOut: computed(() => scale.value > EDITOR_DEFAULTS.zoom.min + 0.001),

    /**
     * 객체를 화면에 들어오게 스크롤한다.
     *
     * 이미 보이는 객체는 움직이지 않는다. 내보내기 차단 안내처럼 자동으로 불리는 경우에
     * 화면이 매번 튀면 방향 감각을 잃는다.
     */
    scrollRectIntoView(rect) {
      const el = stageEl.value
      if (!el) return

      // 페이지 콘텐트 좌표. pad 가 페이지를 밀어낸 만큼을 더해야 한다.
      const frame = el.querySelector<HTMLElement>('.pck-page-frame')
      if (!frame) return
      const stageRect = el.getBoundingClientRect()
      const frameRect = frame.getBoundingClientRect()
      const s = scale.value

      // 객체의 스테이지 뷰포트 기준 위치.
      const left = frameRect.left - stageRect.left + rect.x * s
      const top = frameRect.top - stageRect.top + rect.y * s
      const right = left + rect.w * s
      const bottom = top + rect.h * s

      const margin = pad
      let dx = 0
      let dy = 0
      if (left < margin) dx = left - margin
      else if (right > el.clientWidth - margin) dx = right - (el.clientWidth - margin)
      if (top < margin) dy = top - margin
      else if (bottom > el.clientHeight - margin) dy = bottom - (el.clientHeight - margin)

      if (dx === 0 && dy === 0) return
      el.scrollBy({ left: dx, top: dy, behavior: 'smooth' })
    },
  }
}
