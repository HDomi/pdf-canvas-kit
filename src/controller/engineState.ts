/**
 * 프레임워크 무관 엔진을 signal 에 연결한다.
 *
 * 문서 상태와 히스토리는 엔진이 갖고, 여기서는 커맨드가 커밋될 때마다 리렌더를 일으키는 signal 을
 * 얹는다. signal 은 얕으므로 커맨드가 문서를 통째로 교체하는 방식과 정확히 맞는다 — 깊은
 * 반응성은 변경마다 500페이지 트리를 훑으면서 얻는 게 없다.
 *
 * 구 `src/vue/composables/useEngine.ts` 의 이식. 대응표는 `src/controller/README.md`.
 */
import { computed, onCleanup, signal, type ReadSignal, type Signal } from '../dom/reactive'
import { createPDFCanvasEngine, type EngineOptions, type PDFCanvasEngine } from '../core/engine'
import type { PDFCanvasDoc, PDFCanvasPage } from '../core/model/types'
import type { SaveState } from '../core/model/viewState'

export interface EngineState {
  engine: PDFCanvasEngine
  doc: ReadSignal<PDFCanvasDoc>
  /** 저장 배지가 구독하는 상태. StoragePort 가 없으면 `disabled`. */
  saveState: ReadSignal<SaveState>
  pages: ReadSignal<PDFCanvasPage[]>
  pageCount: ReadSignal<number>
  canUndo: ReadSignal<boolean>
  canRedo: ReadSignal<boolean>
  /** 커맨드를 적용하고 undo/redo 플래그를 갱신한다. */
  run: PDFCanvasEngine['run']
  undo: () => boolean
  redo: () => boolean
}

export function createEngineState(options: EngineOptions = {}): EngineState {
  const saveState: Signal<SaveState> = signal<SaveState>('disabled')

  const engine = createPDFCanvasEngine({
    ...options,
    // 엔진이 상태를 밀어 주므로 폴링이 필요 없다.
    onSaveStateChange: (state) => {
      saveState.value = state
      options.onSaveStateChange?.(state)
    },
  })

  const doc = signal<PDFCanvasDoc>(engine.doc.get())
  saveState.value = engine.saveState()
  const canUndo = signal(false)
  const canRedo = signal(false)

  const syncHistory = () => {
    canUndo.value = engine.history.canUndo()
    canRedo.value = engine.history.canRedo()
  }

  const stop = engine.doc.subscribe((next) => {
    doc.value = next
    syncHistory()
  })

  onCleanup(() => {
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
