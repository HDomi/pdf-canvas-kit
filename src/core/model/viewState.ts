/**
 * 편집기 뷰 상태 — 사용자에게는 보이지만 문서에는 저장하지 않는 값들.
 *
 * {@link ../model/types.PDFCanvasDoc} 와 분리한 것은 의도다 (PLAN 6.6). 배율이나 선택을
 * 문서에 접어 넣으면 줌 클릭마다 dirty가 되어 자동저장이 돌고, undo가 뷰포트를 되돌린다.
 */
import { EDITOR_DEFAULTS } from '../config/defaults'

/** 배율 산출 방식. `none` 은 사용자가 직접 지정했다는 뜻이다. */
export type FitMode = 'width' | 'page' | 'none'

/** 툴바의 도구들. `select` 가 기본 상태다. */
export type ToolId =
  'select' | 'text' | 'shape' | 'answer.short' | 'answer.essay' | 'answer.dropbox' | 'eraser'

/** 저장 배지 상태. `disabled` 는 StoragePort가 연결되지 않았다는 뜻이다 (PLAN 12). */
export type SaveState = 'saved' | 'saving' | 'error' | 'disabled'

export interface EditorViewState {
  /** pt당 CSS px. */
  scale: number
  fitMode: FitMode
  /**
   * `doc.pages` 의 인덱스. 문서가 비어 있으면 -1.
   *
   * id가 아니라 인덱스인 이유: 페이지를 삭제해도 "같은 자리"를 유지하는 동작이 자연스럽고
   * 범위 클램프가 단순하다 (PLAN 6.6).
   */
  currentPageIndex: number
  selectedObjectIds: string[]
  activeTool: ToolId
  /** Space를 누르고 있는 동안 true. 스테이지가 그리기 대신 팬한다 (PLAN 6.3). */
  panArmed: boolean
  gridSnap: boolean
  saveState: SaveState
}

export function createViewState(overrides: Partial<EditorViewState> = {}): EditorViewState {
  return {
    scale: 1,
    fitMode: 'width',
    currentPageIndex: -1,
    selectedObjectIds: [],
    activeTool: 'select',
    panArmed: false,
    gridSnap: false,
    saveState: 'disabled',
    ...overrides,
  }
}

/** 페이지 인덱스를 범위 안으로 클램프한다. 빈 문서는 -1. */
export function clampPageIndex(index: number, pageCount: number): number {
  if (pageCount <= 0) return -1
  return Math.min(Math.max(index, 0), pageCount - 1)
}

/** 배율을 설정된 줌 범위 안으로 클램프한다. */
export function clampScale(scale: number): number {
  const { min, max } = EDITOR_DEFAULTS.zoom
  return Math.min(Math.max(scale, min), max)
}

/**
 * `scale` 기준 위/아래의 다음 프리셋.
 *
 * 곱셈이 아니라 계단을 밟는다. 그래야 +/- 버튼이 줌 메뉴에 표시된 값에 정확히 떨어진다.
 */
export function stepZoom(scale: number, direction: 1 | -1): number {
  const presets = EDITOR_DEFAULTS.zoom.presets
  if (direction > 0) {
    // 프리셋 값에 정확히 걸쳐 있을 때 그 자리에 머물지 않도록 작은 epsilon을 준다.
    return presets.find((p) => p > scale + 0.001) ?? clampScale(scale)
  }
  return [...presets].reverse().find((p) => p < scale - 0.001) ?? clampScale(scale)
}
