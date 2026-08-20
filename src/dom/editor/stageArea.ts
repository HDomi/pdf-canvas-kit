/**
 * 스테이지 영역 — 컨트롤러와 렌더 층을 잇는 유일한 지점 (PLAN 20.2).
 *
 * 컨트롤러가 내놓는 signal 을 읽어 `canvasStage` · `objectView` · `selectionOverlay` 를 조립한다.
 * 컴포넌트들은 서로를 모르고, 여기서만 만난다.
 *
 * ## 객체 리스트를 키로 재조정한다 (§13.3)
 *
 * 객체가 하나 움직일 때 페이지의 나머지 객체 노드를 다시 만들지 않는다. 텍스트를 편집하는 중에
 * 다른 객체가 추가돼도 편집 중인 노드가 살아남아야 한다 — 그러지 않으면 캐럿과 IME 조합이
 * 날아간다 (ARCHITECTURE §6.5).
 */
import { el, list, when } from '../h'
import { computed } from '../reactive'
import type { EditorController } from '../../controller/editor'
import { canvasStage } from './canvasStage'
import { objectView } from './objects/objectView'
import { selectionOverlay } from './selectionOverlay'

export function stageArea(c: EditorController): HTMLElement {
  /*
   * 객체들. `list()` 가 `id` 를 키로 노드를 재사용한다.
   *
   * 미리보기 rect·회전은 **객체마다 따로** 읽는다. 드래그 중인 객체 하나 때문에 전체가
   * 다시 그려지면 30개 객체가 매 `pointermove` 마다 갱신된다.
   */
  const objects = list(
    () => c.currentObjects.value,
    (o) => o.id,
    (object) =>
      objectView({
        object,
        selected: () => c.selectedObjectIds.value.includes(object.value.id),
        invalid: () => c.invalidIds.value.has(object.value.id),
        previewRect: () => c.previewRects.value.get(object.value.id) ?? null,
        previewRotation: () => {
          const p = c.previewRotation.value
          return p?.id === object.value.id ? p.deg : null
        },
        editing: () => c.editingObjectId.value === object.value.id,
        onEditText: (value) => c.editText(object.value.id, value),
        ...(c.objectTypes ? { types: c.objectTypes } : {}),
        onChangeData: (next) => c.updateObject(object.value.id, { data: next }),
        ...(c.onMountCustom ? { onMountCustom: c.onMountCustom } : {}),
      }),
  )

  const overlay = selectionOverlay({
    viewport: c.viewport,
    selectedRects: c.selectedRects,
    preview: c.preview,
    handleRect: c.handleRect,
    rotatable: c.rotatable,
    handleRotation: c.handleRotation,
    onGrabHandle: c.onHandleGrab,
    onGrabRotate: c.onRotateGrab,
  })

  return canvasStage({
    page: c.currentPage,
    scale: c.scale,
    panArmed: c.panArmed,
    panning: c.panning,
    toolActive: computed(() => c.activeTool.value !== 'select'),
    objects,
    overlay,
    stageRef: c.setStageEl,
    frameRef: c.setFrameEl,
    onWheelZoom: c.zoomByWheel,
    onPagePointerDown: c.onPagePointerDown,
    onPageDoubleClick: c.onPageDoubleClick,
  })
}

/**
 * 스테이지를 감싸는 래퍼 + 오류 문구.
 *
 * `position: relative` 래퍼가 필요하다 — 줌 컨트롤이 페이지와 함께 스크롤돼 사라지면 안 되므로
 * 스크롤 컨테이너 **밖**에 있어야 한다 (PLAN 6.1).
 *
 * 줌 컨트롤·툴바·페이지 메타는 R6 에서 붙인다.
 */
export function stageWrap(c: EditorController): HTMLElement {
  return el('div', { class: 'pck-stage-wrap' }, [
    when(
      () => c.pageCount.value > 0,
      () => stageArea(c),
    ),
    when(
      () => c.toolError.value !== null || c.exportError.value !== null,
      () =>
        el('p', { class: 'pck-tool-error', attr: { role: 'alert' } }, [
          () => c.toolError.value ?? c.exportError.value ?? '',
        ]),
    ),
  ])
}
