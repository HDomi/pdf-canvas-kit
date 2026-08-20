/**
 * 프레임워크 무관 엔진을 Vue reactivity에 연결한다.
 *
 * 문서 상태와 히스토리는 엔진이 갖고, 여기서는 커맨드가 커밋될 때마다 리렌더를 일으키는
 * `shallowRef` 를 얹는다. `ref` 가 아니라 `shallowRef` 인 이유는 커맨드가 문서를 통째로 교체하기
 * 때문이다. deep reactivity는 변경마다 500페이지 트리를 훑으면서 얻는 게 없다.
 */
import { computed, onScopeDispose, shallowRef, type ComputedRef, type ShallowRef } from 'vue'
import { createWorksheetEngine, type EngineOptions, type WorksheetEngine } from '../../core/engine'
import type { WorksheetDoc, WorksheetPage } from '../../core/model/types'
import type { SaveState } from '../../core/model/viewState'

export interface UseEngine {
  engine: WorksheetEngine
  doc: ShallowRef<WorksheetDoc>
  /** 저장 배지가 구독하는 상태. StoragePort가 없으면 `disabled`. */
  saveState: ShallowRef<SaveState>
  pages: ComputedRef<WorksheetPage[]>
  pageCount: ComputedRef<number>
  canUndo: ShallowRef<boolean>
  canRedo: ShallowRef<boolean>
  /** 커맨드를 적용하고 undo/redo 플래그를 갱신한다. */
  run: WorksheetEngine['run']
  undo: () => boolean
  redo: () => boolean
}

export function useEngine(options: EngineOptions = {}): UseEngine {
  const saveState = shallowRef<SaveState>('disabled')

  const engine = createWorksheetEngine({
    ...options,
    // 엔진이 상태를 밀어 주므로 폴링이 필요 없다.
    onSaveStateChange: (state) => {
      saveState.value = state
      options.onSaveStateChange?.(state)
    },
  })
  const doc = shallowRef<WorksheetDoc>(engine.doc.get())
  saveState.value = engine.saveState()
  const canUndo = shallowRef(false)
  const canRedo = shallowRef(false)

  const syncHistory = () => {
    canUndo.value = engine.history.canUndo()
    canRedo.value = engine.history.canRedo()
  }

  const stop = engine.doc.subscribe((next) => {
    doc.value = next
    syncHistory()
  })

  onScopeDispose(() => {
    stop()
    engine.destroy()
  })

  return {
    engine,
    doc,
    saveState,
    pages: computed(() => doc.value.pages),
    pageCount: computed(() => doc.value.pages.length),
    canUndo,
    canRedo,
    run: (label, command) => {
      const changed = engine.run(label, command)
      syncHistory()
      return changed
    },
    undo: () => {
      const ok = engine.undo()
      syncHistory()
      return ok
    },
    redo: () => {
      const ok = engine.redo()
      syncHistory()
      return ok
    },
  }
}
