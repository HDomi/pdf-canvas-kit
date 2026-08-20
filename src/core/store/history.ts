/**
 * 역연산 스택으로 구현한 undo/redo (PLAN 12).
 *
 * 각 항목은 하나의 논리적 변경 전후 문서를 담는다. diff가 아니라 문서 참조를 그대로 들고 있어도
 * 되는 이유는 페이지들이 구조를 공유하기 때문이다 — 커맨드는 건드린 가지만 교체하므로,
 * 500페이지 문서의 두 스냅샷은 객체 몇 개만 다르다.
 *
 * 스택이 의미를 유지하도록 두 가지 규칙을 지킨다.
 *
 * - **사용자 제스처 하나 = 항목 하나.** 드래그가 `pointermove` 마다 항목을 쌓아서는 안 되므로,
 *   상호작용 층이 `pointerup` 에 한 번 커밋한다.
 * - **뷰 상태는 기록하지 않는다.** 배율이나 현재 페이지를 되돌리는 undo는 도움보다 혼란이 크므로
 *   배율·스크롤·선택은 문서 밖에 둔다 (PLAN 6.6).
 */
import type { PDFCanvasDoc } from '../model/types'

export interface HistoryEntry {
  /** 디버깅용, 그리고 나중에 "무엇을 되돌릴지" 보여줄 때 쓸 짧은 라벨. */
  label: string
  before: PDFCanvasDoc
  after: PDFCanvasDoc
}

export interface History {
  /** 완료된 변경을 기록한다. redo 스택을 비운다. */
  push(entry: HistoryEntry): void
  /** 복원할 문서를 돌려준다. 되돌릴 것이 없으면 null. */
  undo(): PDFCanvasDoc | null
  /** 복원할 문서를 돌려준다. 다시 실행할 것이 없으면 null. */
  redo(): PDFCanvasDoc | null
  canUndo(): boolean
  canRedo(): boolean
  /** 모든 항목을 버린다. 다른 문서를 불러올 때 등. */
  clear(): void
  /** 대기 중인 undo/redo 항목의 라벨. UI용. */
  peek(): { undo: string | null; redo: string | null }
}

export interface HistoryOptions {
  /**
   * 보관할 최대 항목 수. 넘으면 오래된 것부터 버린다.
   * @default 100
   */
  limit?: number
}

export function createHistory(opts: HistoryOptions = {}): History {
  const limit = opts.limit ?? 100
  let past: HistoryEntry[] = []
  let future: HistoryEntry[] = []

  return {
    push(entry) {
      past.push(entry)
      if (past.length > limit) past = past.slice(past.length - limit)
      // 새 변경은 되돌려 둔 것들을 무효화한다.
      future = []
    },

    undo() {
      const entry = past.pop()
      if (!entry) return null
      future.push(entry)
      return entry.before
    },

    redo() {
      const entry = future.pop()
      if (!entry) return null
      past.push(entry)
      return entry.after
    },

    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,

    clear() {
      past = []
      future = []
    },

    peek: () => ({
      undo: past.at(-1)?.label ?? null,
      redo: future.at(-1)?.label ?? null,
    }),
  }
}
