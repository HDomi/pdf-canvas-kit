/**
 * 편집기 전체 셸 — 3분할 레이아웃 (PLAN 6.1).
 *
 * 구 `src/vue/PDFCanvasEditor.vue` 의 `<template>` 이식. 스크립트 부분은 R3 에서
 * `controller/editor.ts` 로 갔으므로 여기는 **조립만** 한다.
 *
 * ```
 * ┌─────────────────────────────────────────────┐
 * │ topBar                                      │
 * ├──────────┬───────────────────────┬──────────┤
 * │ 페이지    │ toolbar · pageMeta    │ 인스펙터  │
 * │ 목록      │ ┌───────────────────┐ │ (R7)     │
 * │          │ │ stage (한 페이지)  │ │          │
 * │          │ └───────────────────┘ │          │
 * │          │        stageControls  │          │
 * └──────────┴───────────────────────┴──────────┘
 * ```
 *
 * 패널 폭은 CSS 변수로 내려보낸다. 레이아웃 규칙을 CSS 와 JS 두 곳에서 정의하지 않기 위해서다
 * (ARCHITECTURE §7.6).
 */
import { el, when } from '../h'
import { text } from '../../core/config/strings'
import { computed } from '../reactive'
import type { EditorController } from '../../controller/editor'
import { confirmDialog } from './dialogs/confirmDialog'
import { uploadDialog } from './dialogs/uploadDialog'
import { emptyState } from './emptyState'
import { inspector } from './inspector/inspector'
import { pageContextMenu } from './pageContextMenu'
import { pageMeta } from './pageMeta'
import { pageThumbList } from './pageThumbList'
import { stageArea } from './stageArea'
import { stageControls } from './stageControls'
import { toolbar } from './toolbar'
import { topBar } from './topBar'

export function editorShell(c: EditorController): HTMLElement {
  /** 패널 사이의 드래그 핸들. 얇은 요소지만 히트 영역은 CSS 에서 넓힌다. */
  const resizer = (panel: 'pageList' | 'inspector', labelKey: string) =>
    el('div', {
      class: 'pck-resizer',
      attr: {
        role: 'separator',
        'aria-orientation': 'vertical',
        'aria-label': text(labelKey),
      },
      on: {
        pointerdown: (e) => c.startPanelResize(panel, e as PointerEvent),
        dblclick: c.resetPanels,
      },
    })

  return el('div', { class: { 'pck-editor': true, 'is-readonly': () => c.readOnly.value } }, [
    topBar({
      title: computed(() => c.doc.value.title),
      saveState: c.saveState,
      canUndo: c.canUndo,
      canRedo: c.canRedo,
      canSave: c.canExport,
      saving: c.manualSaving,
      onBack: c.back,
      onTitleChange: c.setTitle,
      onUndo: c.undo,
      onRedo: c.redo,
      onManualSave: () => void c.manualSave(),
    }),

    el(
      'div',
      {
        class: { 'pck-body': true, 'is-resizing': () => c.panelResizing.value !== null },
        style: () => ({
          '--pck-pagelist-width': `${c.pageListWidth.value}px`,
          '--pck-inspector-width': `${c.inspectorWidth.value}px`,
        }),
      },
      [
        pageThumbList({
          pages: c.pages,
          currentIndex: c.currentPageIndex,
          draggingIndex: c.reorderDraggingIndex,
          dropIndex: c.reorderDropIndex,
          listRef: c.setPageListEl,
          onSelect: c.goToPage,
          onThumbPointerDown: c.onThumbPointerDown,
          onContextMenu: c.openPageMenu,
          onAddFile: c.openUpload,
          onAddBlank: c.addBlankPage,
          onDuplicate: c.duplicatePage,
          onRemove: c.requestRemovePage,
        }),

        resizer('pageList', 'panel.resizePageList'),

        el('main', { class: 'pck-main' }, [
          when(
            () => c.pageCount.value > 0,
            () => [
              toolbar({
                activeTool: c.activeTool,
                enabled: computed(() => !c.readOnly.value && c.currentPage.value !== null),
                hasSelection: computed(() => c.selectedObjectIds.value.length > 0),
                onPick: c.setActiveTool,
                onDuplicate: c.duplicateSelection,
                onRemove: () => c.deleteSelection(),
              }),
              pageMeta({
                current: c.currentPageNumber,
                total: c.pageCount,
                size: computed(() => c.currentPage.value?.size ?? null),
              }),
            ],
          ),

          /*
           * `position: relative` 래퍼. 줌 컨트롤이 페이지와 함께 스크롤돼 사라지면 안 되므로
           * 스크롤 컨테이너 **밖**에 있어야 한다 (PLAN 6.1).
           */
          el('div', { class: 'pck-stage-wrap' }, [
            when(
              () => c.pageCount.value > 0,
              () => stageArea(c),
            ),
            when(
              () => c.pageCount.value === 0,
              () => emptyState(c.openUpload),
            ),

            when(
              () => c.toolError.value !== null || c.exportError.value !== null,
              () =>
                el('p', { class: 'pck-tool-error', attr: { role: 'alert' } }, [
                  () => c.toolError.value ?? c.exportError.value ?? '',
                ]),
            ),

            when(
              () => c.pageCount.value > 0,
              () =>
                stageControls({
                  percent: c.percent,
                  canZoomIn: c.canZoomIn,
                  canZoomOut: c.canZoomOut,
                  presets: c.zoomPresets,
                  onStep: c.zoomStep,
                  onSet: c.zoomTo,
                  onFitWidth: c.fitWidth,
                  onFitPage: c.fitPage,
                }),
            ),
          ]),
        ]),

        resizer('inspector', 'panel.resizeInspector'),

        inspector({
          selected: c.selectedObjects,
          autoNumber: c.autoNumber,
          readOnly: c.readOnly,
          onUpdate: c.updateObject,
          onRemove: (id) => c.deleteSelection([id]),
          onRotate: c.rotateObject,
        }),
      ],
    ),

    /* 컨텍스트 메뉴·모달은 레이아웃 밖. `position: fixed` 로 뜬다. */
    when(
      () => c.pageMenu.value !== null,
      () => {
        const menu = c.pageMenu.value!
        return pageContextMenu({
          x: menu.x,
          y: menu.y,
          pageIndex: menu.index,
          canDelete: c.pageCount.value > 1,
          onDuplicate: (i) => {
            c.closePageMenu()
            c.duplicatePage(i)
          },
          onAddBlankAfter: (i) => {
            c.closePageMenu()
            c.goToPage(i)
            c.addBlankPage()
          },
          onRemove: c.requestRemovePage,
          onClose: c.closePageMenu,
        })
      },
    ),

    when(
      () => c.pendingPageDelete.value !== null,
      () =>
        confirmDialog({
          message: text('confirm.deletePage'),
          confirmLabel: text('confirm.ok'),
          cancelLabel: text('confirm.cancel'),
          danger: true,
          onConfirm: c.confirmRemovePage,
          onCancel: c.cancelRemovePage,
        }),
    ),

    when(
      () => c.uploadOpen.value,
      () =>
        uploadDialog({
          progress: c.importProgress,
          error: c.importError,
          onClose: c.closeUpload,
          onPick: (file) => void c.pickFile(file),
          onCancel: c.cancelImport,
        }),
    ),
  ])
}
