/**
 * 디바운스 자동저장 (기획 3.2,).
 *
 * 기획은 "입력 후 5초 디바운스" 를 요구한다. 디바운스만 두면 사용자가 계속 타이핑하는 동안
 * 저장이 무한히 밀리므로, **최대 지연**을 함께 둔다. 첫 변경으로부터 30초가 지나면 타이핑 중이라도
 * 한 번 저장한다.
 *
 * 실패는 지수 백오프로 재시도하고, 모두 실패하면 `error` 상태로 남긴다. 조용히 포기하면
 * 편집기는 저장됐다고 믿는다.
 */
import { EDITOR_DEFAULTS } from '../config/defaults'
import type { PDFCanvasDoc } from '../model/types'
import type { SaveState } from '../model/viewState'

export interface SaverOptions {
  /** 실제 저장 동작. 실패하면 reject 해야 한다. */
  save: (doc: PDFCanvasDoc) => Promise<void>
  /** 상태가 바뀔 때마다 호출된다. 배지가 이걸 구독한다. */
  onStateChange?: (state: SaveState) => void
  debounceMs?: number
  maxDelayMs?: number
  retries?: number
}

export interface DebouncedSaver {
  /** 변경을 알린다. 타이머를 다시 설정한다. */
  schedule(doc: PDFCanvasDoc): void
  /**
   * 대기 중인 저장을 즉시 실행한다.
   *
   * `beforeunload` 와 페이지 숨김에서 호출한다. 대기 중인 변경이 없으면 아무 일도 하지 않는다.
   */
  flush(): Promise<void>
  /** 타이머를 취소한다. 대기 중인 변경은 버려진다. */
  cancel(): void
  state(): SaveState
  /** 저장되지 않은 변경이 있는지. `beforeunload` 경고 판단에 쓴다. */
  isPending(): boolean
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createDebouncedSaver(options: SaverOptions): DebouncedSaver {
  const debounceMs = options.debounceMs ?? EDITOR_DEFAULTS.autosave.debounceMs
  const maxDelayMs = options.maxDelayMs ?? EDITOR_DEFAULTS.autosave.maxDelayMs
  const retries = options.retries ?? EDITOR_DEFAULTS.autosave.retries

  let pending: PDFCanvasDoc | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  /** 첫 변경 시각. 최대 지연을 재는 기준이다. */
  let firstChangeAt = 0
  let state: SaveState = 'saved'
  let inFlight: Promise<void> | null = null

  function setState(next: SaveState) {
    if (state === next) return
    state = next
    options.onStateChange?.(next)
  }

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  async function run(doc: PDFCanvasDoc): Promise<void> {
    setState('saving')
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await delay(500 * 2 ** (attempt - 1))
      try {
        await options.save(doc)
        // 저장 중에 새 변경이 들어왔으면 아직 saved가 아니다.
        setState(pending === null ? 'saved' : 'saving')
        return
      } catch {
        // 마지막 시도까지 실패하면 아래에서 error로 떨어진다.
      }
    }
    setState('error')
  }

  async function performSave(): Promise<void> {
    clearTimer()
    const doc = pending
    if (!doc) return
    pending = null
    firstChangeAt = 0

    // 이전 저장이 진행 중이면 끝나고 이어서 한다. 순서가 뒤집히면 오래된 문서가 나중에 저장된다.
    const previous = inFlight
    const task = (async () => {
      if (previous) await previous.catch(() => undefined)
      await run(doc)
    })()
    inFlight = task
    await task
    if (inFlight === task) inFlight = null
  }

  return {
    schedule(doc) {
      pending = doc
      const now = Date.now()
      if (firstChangeAt === 0) firstChangeAt = now
      setState('saving')

      clearTimer()
      // 최대 지연을 넘기지 않는 범위에서 디바운스한다.
      const remainingMax = Math.max(0, firstChangeAt + maxDelayMs - now)
      timer = setTimeout(() => void performSave(), Math.min(debounceMs, remainingMax))
    },

    flush: () => performSave(),

    cancel() {
      clearTimer()
      pending = null
      firstChangeAt = 0
    },

    state: () => state,
    isPending: () => pending !== null || inFlight !== null,
  }
}
