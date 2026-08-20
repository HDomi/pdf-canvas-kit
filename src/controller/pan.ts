/**
 * 스테이지의 네이티브 스크롤을 이용한 드래그 팬 (PLAN 6.3, D9/D10).
 *
 * 팬은 transform 이 아니라 `scrollLeft`/`scrollTop` 을 움직인다. 스테이지가 스크롤 컨테이너이므로
 * 스크롤바·관성·키보드 스크롤이 공짜로 따라온다.
 *
 * 좌클릭 드래그는 팬이 **아니다**. 그건 생성 도구와 마퀴 선택의 몫이다. 팬은 Space+드래그
 * (Figma·Photoshop 관례)나 중간 버튼 드래그다.
 *
 * 구 `src/vue/composables/usePan.ts` 의 이식.
 */
import { onCleanup, signal, watch, type ReadSignal, type Signal } from '../dom/reactive'
import { isTextEntry } from './textEntry'

export interface PanOptions {
  stageEl: ReadSignal<HTMLElement | null>
  /** Space 를 누르고 있는 동안 세워진다. 커서와 히트 테스트가 반응할 수 있게. */
  panArmed: Signal<boolean>
  /** 팬을 끈다. 모달이 열려 있을 때 등. */
  disabled?: ReadSignal<boolean>
}

export interface Pan {
  /** 팬 드래그가 진행 중이면 true. */
  panning: ReadSignal<boolean>
}

export function createPan(options: PanOptions): Pan {
  const { stageEl, panArmed } = options
  const panning = signal(false)

  let pointerId: number | null = null
  let lastX = 0
  let lastY = 0

  function onKeyDown(e: KeyboardEvent) {
    if (e.code !== 'Space' || options.disabled?.value) return
    if (isTextEntry(e.target)) return
    // 이게 없으면 Space 에 브라우저가 페이지를 스크롤해 팬과 충돌한다.
    e.preventDefault()
    panArmed.value = true
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.code !== 'Space') return
    panArmed.value = false
  }

  /** Space 를 누른 채 포커스를 잃으면 스테이지가 계속 팬 대기 상태로 남는다. */
  function onBlur() {
    panArmed.value = false
    panning.value = false
  }

  function onPointerDown(e: PointerEvent) {
    if (options.disabled?.value) return
    const middleButton = e.button === 1
    if (!middleButton && !(panArmed.value && e.button === 0)) return
    const el = stageEl.value
    if (!el) return

    e.preventDefault()
    pointerId = e.pointerId
    lastX = e.clientX
    lastY = e.clientY
    panning.value = true
    el.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: PointerEvent) {
    if (!panning.value || e.pointerId !== pointerId) return
    const el = stageEl.value
    if (!el) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    // 오른쪽으로 끌면 콘텐트가 오른쪽으로 가므로 스크롤 오프셋은 줄어든다.
    el.scrollLeft -= dx
    el.scrollTop -= dy
  }

  function onPointerUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return
    const el = stageEl.value
    if (el?.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    pointerId = null
    panning.value = false
  }

  watch(
    () => stageEl.value,
    (el, prev) => {
      prev?.removeEventListener('pointerdown', onPointerDown)
      el?.addEventListener('pointerdown', onPointerDown)
    },
    { immediate: true },
  )

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)

  onCleanup(() => {
    stageEl.value?.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
  })

  return { panning }
}
