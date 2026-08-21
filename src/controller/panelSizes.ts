/**
 * 좌·우 패널 폭 리사이즈와 기억.
 *
 * 고정 폭으로 시작하고, **한 번이라도 드래그하면 그 값을 `localStorage` 에 남긴다.** 같은
 * 브라우저에서 다시 열면 그 폭이 복원된다.
 *
 * ## 왜 "한 번이라도 조정했을 때만" 저장하는가
 *
 * 조정하지 않은 사용자에게는 항상 제품의 기본값이 적용되어야 한다. 기본값을 나중에 바꾸면 손대지
 * 않은 사용자는 새 기본값을 받고, 직접 맞춘 사용자는 자기 값을 유지한다. 초기값까지 저장하면
 * 기본값 변경이 아무에게도 전달되지 않는다.
 *
 * ## 저장 실패를 무시하는 이유
 *
 * Safari 프라이빗 모드는 `localStorage` 쓰기에서 예외를 던지고, 일부 환경은 접근 자체를 막는다.
 * 패널 폭은 그 때문에 편집기가 죽을 만한 값이 아니다.
 *
 * 구 `src/vue/composables/usePanelSizes.ts` 의 이식. 대응표는 `src/controller/README.md`.
 */
import { onCleanup, signal, watch, type ReadSignal, type Signal } from '../dom/reactive'
import { LAYOUT_DEFAULTS } from '../core/config/defaults'

/** 저장 키. 호스트 앱의 키와 충돌하지 않도록 접두사를 붙인다. */
const STORAGE_KEY = 'pck.panelSizes.v1'

/** 패널이 쓸모 있으려면 최소 폭이 필요하고, 스테이지도 남아 있어야 한다. */
const BOUNDS = {
  pageList: { min: 160, max: 420 },
  inspector: { min: 220, max: 480 },
} as const

export type PanelId = 'pageList' | 'inspector'

export interface PanelSizes {
  pageListWidth: number
  inspectorWidth: number
}

interface StoredSizes {
  pageListWidth?: number
  inspectorWidth?: number
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

/**
 * 저장된 폭을 읽는다.
 *
 * 값이 손상됐거나 범위를 벗어나면 무시한다. 저장 시점의 한계값이 지금과 다를 수 있고,
 * 사용자가 직접 편집한 값이 들어올 수도 있다.
 */
function readStored(): StoredSizes {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const { pageListWidth, inspectorWidth } = parsed as StoredSizes
    const out: StoredSizes = {}
    if (typeof pageListWidth === 'number' && Number.isFinite(pageListWidth)) {
      out.pageListWidth = clamp(pageListWidth, BOUNDS.pageList.min, BOUNDS.pageList.max)
    }
    if (typeof inspectorWidth === 'number' && Number.isFinite(inspectorWidth)) {
      out.inspectorWidth = clamp(inspectorWidth, BOUNDS.inspector.min, BOUNDS.inspector.max)
    }
    return out
  } catch {
    return {}
  }
}

export interface PanelSizeController {
  pageListWidth: ReadSignal<number>
  inspectorWidth: ReadSignal<number>
  /** 드래그 중인 패널. 커서·오버레이 처리에 쓴다. */
  resizing: ReadSignal<PanelId | null>
  /** 리사이즈 핸들의 pointerdown 핸들러. */
  startResize: (panel: PanelId, e: PointerEvent) => void
  /** 기본값으로 되돌리고 저장된 값을 지운다. */
  reset: () => void
}

export function createPanelSizes(): PanelSizeController {
  const stored = readStored()
  const pageListWidth: Signal<number> = signal(
    stored.pageListWidth ?? LAYOUT_DEFAULTS.pageListWidthPx,
  )
  const inspectorWidth: Signal<number> = signal(
    stored.inspectorWidth ?? LAYOUT_DEFAULTS.inspectorWidthPx,
  )
  const resizing: Signal<PanelId | null> = signal<PanelId | null>(null)

  /** 사용자가 조정한 적이 있는지. 없으면 저장하지 않는다. */
  let touched = stored.pageListWidth !== undefined || stored.inspectorWidth !== undefined

  function persist() {
    if (!touched) return
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          pageListWidth: pageListWidth.value,
          inspectorWidth: inspectorWidth.value,
        }),
      )
    } catch {
      // 프라이빗 모드 등에서 실패한다. 패널 폭 때문에 편집기가 죽어서는 안 된다.
    }
  }

  watch(() => [pageListWidth.value, inspectorWidth.value], persist)

  let startX = 0
  let startWidth = 0
  let pointerId: number | null = null

  function onMove(e: PointerEvent) {
    const panel = resizing.value
    if (!panel || e.pointerId !== pointerId) return
    const delta = e.clientX - startX
    // 좌측 패널은 오른쪽으로 끌면 넓어지고, 우측 패널은 왼쪽으로 끌면 넓어진다.
    const next = panel === 'pageList' ? startWidth + delta : startWidth - delta
    const bounds = panel === 'pageList' ? BOUNDS.pageList : BOUNDS.inspector
    const clamped = Math.round(clamp(next, bounds.min, bounds.max))
    if (panel === 'pageList') pageListWidth.value = clamped
    else inspectorWidth.value = clamped
  }

  function onUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return
    resizing.value = null
    pointerId = null
    persist()
  }

  function startResize(panel: PanelId, e: PointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    touched = true
    resizing.value = panel
    pointerId = e.pointerId
    startX = e.clientX
    startWidth = panel === 'pageList' ? pageListWidth.value : inspectorWidth.value
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  onCleanup(() => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  })

  return {
    pageListWidth,
    inspectorWidth,
    resizing,
    startResize,
    reset() {
      pageListWidth.value = LAYOUT_DEFAULTS.pageListWidthPx
      inspectorWidth.value = LAYOUT_DEFAULTS.inspectorWidthPx
      touched = false
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // 위와 같은 이유로 무시한다.
      }
    },
  }
}
