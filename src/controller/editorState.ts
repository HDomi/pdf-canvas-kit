/**
 * 편집기 뷰 상태.
 *
 * 문서와 히스토리는 엔진이 갖고, **DOM 측정에 묶인 것들** — 배율·스크롤·현재 페이지·선택 — 은
 * 여기 있다. 이 분리는 의도적이다. 뷰 상태를 문서에 넣으면 배율만 바꿔도 자동저장이 돌고
 * undo 가 배율을 되돌린다.
 *
 * ## 왜 `createViewState()` 를 통째로 signal 에 담지 않는가
 *
 * Vue 판은 `const view = ref(createViewState())` 였고 `view.value.activeTool = 'select'` 로
 * 필드를 직접 변형했다. Vue 의 `ref` 가 객체를 프록시로 감싸므로 동작했다.
 *
 * 여기 signal 은 **얕다**(ARCHITECTURE §12.1). 같은 코드를 쓰면 조용히 아무 일도 일어나지 않는다.
 * 그래서 필드마다 signal 을 둔다 — 어차피 Vue 판도 필드별 writable computed 로 감싸 쓰고 있었다.
 */
import { signal, type Signal } from '../dom/reactive'
import { createViewState, type FitMode, type ToolId } from '../core/model/viewState'

export interface EditorViewSignals {
  /** 스테이지에 올라온 페이지. 문서가 비면 -1. */
  currentPageIndex: Signal<number>
  selectedObjectIds: Signal<string[]>
  activeTool: Signal<ToolId>
  gridSnap: Signal<boolean>
  /** Space 를 누르고 있는 동안 세워진다 (드래그 팬은 Space·중간버튼만. 좌클릭은 객체 생성·마퀴에 예약). */
  panArmed: Signal<boolean>
  /** 인라인 텍스트 편집 중인 객체. null 이면 편집 중이 아니다. */
  editingObjectId: Signal<string | null>
  /** 도구·객체 조작 중 발생한 오류 문구. 한도 초과 등. */
  toolError: Signal<string | null>
  /** 내보내기 시도 후 남는 안내 문구. */
  exportError: Signal<string | null>
}

export function createEditorViewSignals(): EditorViewSignals {
  /*
   * 기본값은 `createViewState()` 에서 가져온다. 여기에 리터럴로 다시 적으면 두 곳이 갈라지고,
   * `gridSnap` 처럼 "상수는 4인데 기본은 꺼짐" 인 값에서 조용히 어긋난다.
   */
  const defaults = createViewState()

  return {
    currentPageIndex: signal(defaults.currentPageIndex),
    selectedObjectIds: signal<string[]>(defaults.selectedObjectIds),
    activeTool: signal<ToolId>(defaults.activeTool),
    gridSnap: signal(defaults.gridSnap),
    panArmed: signal(defaults.panArmed),
    editingObjectId: signal<string | null>(null),
    toolError: signal<string | null>(null),
    exportError: signal<string | null>(null),
  }
}

/** 맞춤 모드는 `Stage` 가 소유한다. 여기서 다시 들면 두 값이 갈라진다. */
export type { FitMode }
