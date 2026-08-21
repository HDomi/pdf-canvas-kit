/**
 * imperative facade — 프레임워크 래퍼의 **유일한 접점** (PLAN 20.2).
 *
 * ```ts
 * const editor = createPDFCanvasEditor(container, { initialDoc, objectTypes })
 * editor.update({ readOnly: true })
 * editor.destroy()
 * ```
 *
 * 래퍼(`/react` · `/vue`)는 이 계약만 안다. 그래서 세 번째 프레임워크가 와도 비용이 같다 —
 * 컨트롤러도, 렌더 층도 건드리지 않는다.
 *
 * ## 컨테이너에 높이가 필요하다
 *
 * `.pck-editor` 는 `height: 100%` 다. 컨테이너에 확정된 높이가 없으면 편집기가 접힌다
 * (ARCHITECTURE §15.4). 래퍼가 이걸 대신 해 줄 수 없다 — 호스트 레이아웃의 문제다.
 */
import { onCleanup, scope, type Dispose } from './reactive'
import { editorShell } from './editor/editorShell'
import { createEditorController, type EditorProps } from '../controller/editor'
import type { PDFCanvasDoc, PublicPDFCanvasDoc } from '../core/model/types'
import type { ValidationResult } from '../core/validation/rules'

export type { EditorProps }

/**
 * 호스트가 프로그램으로 편집기를 조작하는 지점.
 *
 * 구 Vue 판의 `defineExpose` 가 여기로 왔다.
 */
export interface EditorHandle {
  /**
   * prop 을 갱신한다.
   *
   * React 는 렌더마다 부른다. `initialDoc` 과 `initialScale` · `objectTypes` 는 **무시된다** —
   * 이름 그대로 최초 1회만 읽는다 (ARCHITECTURE §14.2).
   */
  update(next: Partial<EditorProps>): void
  /** 멱등이다. React StrictMode 의 이중 언마운트에 대비한다 (PLAN 20.5). */
  destroy(): void

  /** 현재 문서. 편집기가 소유한다. */
  getDoc(): PDFCanvasDoc
  /** 문서가 바뀔 때 알린다. 래퍼가 리렌더 신호로 쓴다. */
  subscribe(fn: (doc: PDFCanvasDoc) => void): Dispose

  /**
   * 커스텀 객체의 데이터를 바꾼다 (PLAN D25).
   *
   * 래퍼가 portal 안에서 받은 `onChange` 가 이걸 부른다. 커맨드 한 번이라 undo 한 항목이 된다.
   */
  updateObjectData(objectId: string, data: unknown): void

  /** 검증 게이트. 실패하면 문제 객체로 데려가고 `false`. */
  checkBeforeExport(): boolean
  /** 문서 전체 검증 결과. 게이트를 열지 않고 상태만 볼 때. */
  validate(): ValidationResult
  /** 커스텀 객체의 비밀을 제거한 스냅샷. 뷰어에 넘긴다. */
  toPublicDoc(): PublicPDFCanvasDoc

  /**
   * 문서를 불러온다. 편집기 안의 업로드 팝업과 **같은 경로**다.
   *
   * 호스트가 자기 UI(드래그&드롭·자체 파일 선택기)에서 파일을 넘길 수 있어야 한다.
   * 실패는 편집기 안의 오류 문구로 표시되므로 던지지 않는다.
   */
  importFile(file: File): Promise<void>
  /** 진행 중인 import 를 중단한다. 유휴 상태에서 불러도 안전하다. */
  cancelImport(): void

  /**
   * 대기 중인 확인 동작을 수행한다 (PLAN D31).
   *
   * `onRequestConfirm` 으로 확인을 위임한 호스트가 자기 모달의 [확인] 에 연결한다.
   * 대기 중인 것이 없으면 아무 일도 하지 않는다.
   */
  confirmPending(): void
  /** 대기 중인 확인 동작을 취소한다. 호스트 모달의 [취소]·닫기에 연결한다. */
  cancelPending(): void
  /**
   * 페이지 삭제를 요청한다.
   *
   * 객체가 있는 페이지면 확인이 필요하므로 곧바로 지우지 않는다 — `onRequestConfirm` 을 준
   * 호스트에게는 그 콜백이 불리고, 주지 않았으면 내장 확인 팝업이 뜬다. 비어 있으면 즉시
   * 지운다.
   */
  requestRemovePage(index: number): void
  /**
   * 문서 불러오기를 요청한다.
   *
   * `onRequestUpload` 를 줬으면 그 콜백이 불리고, 주지 않았으면 내장 팝업이 열린다.
   * 호스트가 자기 [파일 열기] 버튼을 편집기 밖에 두고 싶을 때 쓴다.
   */
  requestUpload(): void

  zoomTo(scale: number): void
  fitWidth(): void
  fitPage(): void
  goToPage(index: number): void
  goToPageId(pageId: string): void
  flushSave(): Promise<void>
  promoteBackgrounds(): Promise<boolean>
}

export function createPDFCanvasEditor(
  container: HTMLElement,
  props: EditorProps = {},
): EditorHandle {
  const [inner, dispose] = scope(() => {
    const c = createEditorController(props)

    /*
     * 단축키를 `window` 에 붙이는 것은 렌더 층의 몫이다. 컨트롤러는 핸들러만 정의한다 —
     * 그래야 컨트롤러가 DOM 전역을 건드리지 않고 테스트에서 직접 부를 수 있다.
     */
    window.addEventListener('keydown', c.onKeyDown)
    onCleanup(() => window.removeEventListener('keydown', c.onKeyDown))

    const root = editorShell(c)
    container.append(root)
    onCleanup(() => root.remove())

    return c
  })

  let destroyed = false

  return {
    update: (next) => inner.setProps(next),
    destroy: () => {
      // 멱등. StrictMode 는 effect 를 두 번 돌리고 정리도 두 번 부른다.
      if (destroyed) return
      destroyed = true
      dispose()
    },

    getDoc: () => inner.doc.value,
    subscribe: (fn) => inner.subscribeDoc(fn),

    updateObjectData: (objectId, data) => inner.updateObject(objectId, { data }),

    checkBeforeExport: () => inner.checkBeforeExport(),
    validate: () => inner.validation.value,
    toPublicDoc: () => inner.toPublicDoc(),
    importFile: (file) => inner.pickFile(file),
    cancelImport: () => inner.cancelImport(),
    confirmPending: () => inner.confirmRemovePage(),
    cancelPending: () => inner.cancelRemovePage(),
    requestUpload: () => inner.openUpload(),
    requestRemovePage: (index) => inner.requestRemovePage(index),

    zoomTo: (scale) => inner.zoomTo(scale),
    fitWidth: () => inner.fitWidth(),
    fitPage: () => inner.fitPage(),
    goToPage: (index) => inner.goToPage(index),
    goToPageId: (pageId) => inner.goToPageId(pageId),
    flushSave: () => inner.flushSave(),
    promoteBackgrounds: () => inner.promoteBackgrounds(),
  }
}
