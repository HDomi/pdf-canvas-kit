/**
 * 포인터 이벤트를 상태 머신에 연결한다 (PLAN 11.2).
 *
 * DOM 이벤트를 pt 좌표로 바꿔 머신에 넘기고, `pointerup` 에서 나온 커밋을 호출자에게 전달한다.
 * 머신 자체는 DOM을 모르므로 이 파일이 유일한 접점이다.
 *
 * `setPointerCapture` 를 쓴다. 포인터가 페이지 밖으로 나가도 드래그가 이어져야 한다.
 *
 * ## rAF 코얼레싱을 쓰지 않는 이유
 *
 * 처음에는 `pointermove` 를 `requestAnimationFrame` 으로 묶어 프레임당 한 번만 처리했다.
 * 그런데 rAF 콜백에서 반응형 값을 바꾸면 그 프레임의 페인트에는 반영되지 않고 **다음 프레임**에
 * 들어간다. 결과적으로 리사이즈·이동이 포인터를 한 박자 늦게 따라오는 것이 눈에 보였다.
 *
 * 브라우저는 이미 `pointermove` 를 프레임당 한 번 정도로 합쳐서 보내고, 객체 상한이 페이지당
 * 30개·문서 200개라 즉시 처리해도 계산량이 문제되지 않는다. 그래서 이벤트에서 바로 처리한다.
 */
import { computed, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue'
import { clientToPage, type PageViewport } from '../../core/geometry/units'
import type { HandleId } from '../../core/geometry/handles'
import {
  createPointerMachine,
  type MachineContext,
  type PointerCommit,
  type PointerInput,
} from '../../core/interaction/pointerMachine'
import type { Rect, PDFCanvasObject } from '../../core/model/types'
import type { ToolId } from '../../core/model/viewState'

export interface UsePointerToolOptions {
  viewport: Ref<PageViewport | null>
  /** 드래그 시작 시 프레임 위치를 다시 측정한다. */
  remeasure: () => PageViewport | null
  objects: ComputedRef<readonly PDFCanvasObject[]>
  selectedIds: Ref<string[]>
  activeTool: Ref<ToolId>
  gridSnap: Ref<boolean>
  /** true면 포인터 입력을 무시한다. 팬 중이거나 읽기 전용일 때. */
  disabled: ComputedRef<boolean>
  /** `pointerup` 결과를 처리한다. */
  onCommit: (commit: PointerCommit) => void
}

export interface UsePointerTool {
  /** 그리는 중인 마퀴. */
  preview: ComputedRef<{ rect: Rect; kind: 'create' | 'marquee' } | null>
  /** 변형 중인 객체들의 미리보기 rect. */
  previewRects: ComputedRef<ReadonlyMap<string, Rect>>
  /** 회전 중인 객체의 미리보기 각도. */
  previewRotation: ComputedRef<{ id: string; deg: number } | null>
  /** 캔버스 pointerdown 핸들러. */
  onPointerDown: (e: PointerEvent) => void
  /** 핸들 pointerdown 핸들러. */
  onHandleDown: (handle: HandleId, e: PointerEvent) => void
  /** 회전 핸들 pointerdown 핸들러. */
  onRotateDown: (e: PointerEvent) => void
  dragging: Ref<boolean>
}

export function usePointerTool(options: UsePointerToolOptions): UsePointerTool {
  const { viewport, remeasure, objects, selectedIds, activeTool, gridSnap, disabled, onCommit } =
    options

  const dragging = ref(false)
  // 반응형 재계산을 유발하지 않도록 머신 상태는 버전 카운터로만 노출한다.
  const version = ref(0)
  const bump = () => version.value++

  const getContext = (): MachineContext => ({
    page: viewport.value?.size ?? { width: 0, height: 0 },
    objects: objects.value,
    grid: gridSnap.value ? 4 : 0,
    selectedIds: selectedIds.value,
  })

  const machine = createPointerMachine(getContext)

  let pointerId: number | null = null
  let captureEl: HTMLElement | null = null

  function toInput(e: PointerEvent, vp: PageViewport): PointerInput {
    const p = clientToPage({ x: e.clientX, y: e.clientY }, vp)
    return {
      x: p.x,
      y: p.y,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey || e.ctrlKey,
    }
  }

  function onMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return
    const vp = viewport.value
    if (!vp) return
    // 즉시 처리한다. rAF로 미루면 반영이 한 프레임 밀려 눈에 보인다(위 주석).
    machine.move(toInput(e, vp))
    bump()
  }

  function finish(e: PointerEvent) {
    if (e.pointerId !== pointerId) return
    const vp = viewport.value
    const commit = vp ? machine.up(toInput(e, vp)) : { kind: 'none' as const }
    if (captureEl?.hasPointerCapture(e.pointerId)) captureEl.releasePointerCapture(e.pointerId)
    pointerId = null
    captureEl = null
    dragging.value = false
    bump()
    onCommit(commit)
  }

  function begin(
    e: PointerEvent,
    opts: { handle?: HandleId; handleTargetId?: string; rotateTargetId?: string } = {},
  ) {
    if (disabled.value || e.button !== 0) return
    const vp = remeasure()
    if (!vp) return

    e.preventDefault()
    pointerId = e.pointerId
    captureEl = e.currentTarget instanceof HTMLElement ? e.currentTarget : null
    captureEl?.setPointerCapture(e.pointerId)
    dragging.value = true

    machine.down(toInput(e, vp), { tool: activeTool.value, ...opts })
    bump()
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', finish)
  window.addEventListener('pointercancel', finish)
  onScopeDispose(() => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', finish)
    window.removeEventListener('pointercancel', finish)
  })

  return {
    preview: computed(() => {
      void version.value
      return machine.preview()
    }),
    previewRects: computed(() => {
      void version.value
      return machine.previewRects()
    }),
    previewRotation: computed(() => {
      void version.value
      return machine.previewRotation()
    }),
    onPointerDown: (e) => begin(e),
    onHandleDown: (handle, e) => {
      // 핸들은 단일 선택일 때만 그리므로 대상은 선택 항목의 첫 번째다.
      const targetId = selectedIds.value[0]
      if (targetId) begin(e, { handle, handleTargetId: targetId })
    },
    onRotateDown: (e) => {
      const targetId = selectedIds.value[0]
      if (targetId) begin(e, { rotateTargetId: targetId })
    },
    dragging,
  }
}
