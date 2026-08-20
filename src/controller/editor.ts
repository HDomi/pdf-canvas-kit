/**
 * 편집기 루트 컨트롤러 (PLAN 6.1, 20.2).
 *
 * 엔진·뷰 상태·좌표계·포인터·검증을 조립하고, 렌더 층이 구독할 signal 과 호출할 액션을 내놓는다.
 * **DOM 을 만들지 않는다** — 렌더 층(`src/dom/editor/**`)이 이걸 읽어 그린다.
 *
 * 구 `src/vue/PDFCanvasEditor.vue` 의 `<script setup>` 이식. 대응표는 `src/controller/README.md`.
 *
 * ## props 계약 ★
 *
 * `setProps()` 로 갱신할 수 있는 것과 **최초 1회만 읽는 것**이 나뉜다. React 는 렌더마다
 * `setProps` 를 부르므로 이 구분이 중요하다.
 *
 * | prop | 갱신 |
 * | --- | --- |
 * | `readOnly` · `autosave` | 반영된다 |
 * | `on*` 콜백 | 반영된다 (React 는 렌더마다 함수 신원이 바뀐다) |
 *
 * UI 문구는 prop 이 아니다. `configureStrings()` 로 모듈 수준에서 한 번 설정한다
 * (`core/config/strings.ts`).
 * | `ports` · `uploadFile` | 반영된다 — 단 엔진에 이미 넘어간 port 는 교체되지 않는다 |
 * | **`initialDoc`** | **최초 1회만.** 이름 그대로다 |
 * | **`initialScale`** · **`objectTypes`** | **최초 1회만.** 이름 그대로다 |
 *
 * `initialDoc` 이라는 이름이 그 계약을 드러낸다 — 편집기가 문서를 소유하고 `onChange` 로
 * 변경을 밀어낸다. React 의 `defaultValue` 와 같은 성격이다 (PLAN 20.8 결정).
 */
import { batch, computed, onCleanup, signal, watch, type ReadSignal } from '../dom/reactive'
import { EDITOR_DEFAULTS } from '../core/config/defaults'
import { text } from '../core/config/strings'
import { setTitle } from '../core/commands/doc'
import {
  addObject,
  ObjectLimitError,
  duplicateObjects,
  newIdsAfterDuplicate,
  removeObjects,
  setRotation,
  transformObjects,
  updateObject,
} from '../core/commands/objects'
import {
  duplicatePage,
  insertBlankPage,
  movePage,
  PageLimitError,
  removePage,
} from '../core/commands/pages'
import { moveRect, type HandleId } from '../core/geometry/handles'
import { isMeaningfulDrag } from '../core/geometry/constrain'
import { pickObject } from '../core/geometry/hitTest'
import { clientToPage } from '../core/geometry/units'
import { createObjectForTool, defaultRectAt, defaultSizeForTool } from '../core/interaction/tools'
import type { PointerCommit } from '../core/interaction/pointerMachine'
import type { PDFCanvasDoc, PDFCanvasObject, Rect } from '../core/model/types'
import type { SaveState, ToolId } from '../core/model/viewState'
import { ConvertError } from '../core/ports/ConverterPort'
import type { AssetPort } from '../core/ports/AssetPort'
import { invalidObjectIds, validateDoc } from '../core/validation/rules'
import type { EnginePorts, ImportProgress } from '../core/engine'
import {
  createObjectTypeRegistry,
  type AnyObjectTypeDef,
  type ObjectTypeRegistry,
} from '../core/objectTypes'
// ⚠️ 프로토타입 저장. 실서버가 붙으면 이 import 와 아래 `savePrototypeDoc` 을 함께 지운다 (PLAN 18.5).
import { PrototypeQuotaError, savePrototype } from '../prototype/localStorageStore'

import { createEditorViewSignals } from './editorState'
import { createEngineState } from './engineState'
import { createPageNav } from './pageNav'
import { createPageReorder } from './pageReorder'
import { createPageViewport } from './pageViewport'
import { createPan } from './pan'
import { createPanelSizes } from './panelSizes'
import { createPointerTool } from './pointerTool'
import { createStage } from './stage'
import { isTextEntry } from './textEntry'

/* ------------------------------------------------------------------ props -- */

export type UploadFile = (
  blob: Blob,
  meta: { pageId: string; fileName?: string; mime: string },
) => Promise<{ url: string; assetId?: string }>

export interface EditorProps {
  /**
   * 초기 문서. `null` 이면 빈 상태로 시작해 문서 불러오기 안내를 띄운다.
   *
   * **이름이 계약이다** (PLAN 20.8 결정). 편집기가 문서를 소유하고 변경을 `onChange` 로 밀어낸다 —
   * controlled prop 이 아니다. `doc` 이라고 부르면 React 소비자가 controlled 로 착각하는데,
   * 그건 API 이름이 거짓말을 하는 것이다.
   *
   * 문서를 교체해야 하면 컴포넌트를 다시 마운트한다 (React 는 `key` 변경).
   */
  initialDoc?: PDFCanvasDoc | null
  ports?: EnginePorts
  readOnly?: boolean
  /**
   * 커스텀 객체 타입 (PLAN D25). **최초 1회만 읽는다.**
   *
   * 툴바 도구·인스펙터 패널·검증이 모두 이 목록에서 나온다. 런타임에 바꾸려면 컴포넌트를
   * 다시 마운트한다 — 도구가 도중에 생기고 사라지면 사용자가 방향을 잃는다.
   */
  objectTypes?: readonly AnyObjectTypeDef[]
  /** 시작 배율. 기본값 `'fit-page'` — 불러오는 즉시 페이지 전체가 보인다. **최초 1회만 읽는다.** */
  initialScale?: number | 'fit-width' | 'fit-page'
  /**
   * 페이지 이미지를 업로드하는 함수 (PLAN Q11 결정: S3).
   *
   * 주면 `AssetPort` 로 감싸 배경을 영속 URL 로 저장한다. 주지 않으면 세션 한정 blob URL 을 쓰고,
   * 그 문서는 저장할 수 없다 — `serializeDoc` 이 거부한다 (PLAN 4.1).
   *
   * presigned URL 방식이면 `createS3AssetPort` 를 `ports.asset` 에 주는 편이 간단하다.
   * 이 prop 은 업로드 경로가 완전히 다른 제품을 위한 것이다.
   */
  uploadFile?: UploadFile
  /**
   * 자동저장을 켠다. `ports.storage` 가 있을 때만 의미가 있다.
   *
   * 기본값은 storage port 유무를 따른다. 저장할 곳이 없는데 "저장 중" 배지를 띄우면 거짓말이다.
   */
  autosave?: boolean

  onChange?: (doc: PDFCanvasDoc) => void
  onSaveStateChange?: (state: SaveState) => void
  onBack?: () => void
  /**
   * 커스텀 객체의 콘텐츠 컨테이너가 생기거나 사라질 때 (PLAN D25).
   *
   * 프레임워크 래퍼가 여기로 받은 엘리먼트에 `createPortal` · `Teleport` 한다.
   * vanilla 로 쓰는 경우 `objectType.render` 를 주면 이 콜백이 불리지 않는다.
   */
  onMountCustom?: (objectId: string, el: HTMLElement | null) => void
  /** 커스텀 객체의 인스펙터 컨테이너. 위와 같은 규칙. */
  onMountInspector?: (objectId: string, el: HTMLElement | null) => void
}

/* ----------------------------------------------------------------- 반환 계약 -- */

/** 렌더 층이 쓰는 표면. 여기에 없는 것은 렌더 층이 알 필요가 없다. */
export interface EditorController {
  /* 문서 */
  doc: ReadSignal<PDFCanvasDoc>
  pages: EngineStatePages
  pageCount: ReadSignal<number>
  saveState: ReadSignal<SaveState>
  canUndo: ReadSignal<boolean>
  canRedo: ReadSignal<boolean>
  undo: () => void
  redo: () => void

  /* 뷰 상태 */
  currentPageIndex: ReadSignal<number>
  currentPage: ReadSignal<PageOrNull>
  currentPageNumber: ReadSignal<number>
  currentObjects: ReadSignal<readonly PDFCanvasObject[]>
  selectedObjectIds: ReadSignal<string[]>
  selectedObjects: ReadSignal<readonly PDFCanvasObject[]>
  activeTool: ReadSignal<ToolId>
  setActiveTool: (tool: ToolId) => void
  panArmed: ReadSignal<boolean>
  panning: ReadSignal<boolean>
  editingObjectId: ReadSignal<string | null>
  readOnly: ReadSignal<boolean>

  /* 스테이지 */
  scale: ReadSignal<number>
  percent: ReadSignal<number>
  canZoomIn: ReadSignal<boolean>
  canZoomOut: ReadSignal<boolean>
  zoomPresets: readonly number[]
  zoomStep: (direction: 1 | -1) => void
  zoomTo: (scale: number) => void
  zoomByWheel: (deltaY: number, anchor: { x: number; y: number }) => void
  fitWidth: () => void
  fitPage: () => void

  /* 좌표·포인터 */
  viewport: ReadSignal<ViewportOrNull>
  preview: ReadSignal<PreviewOrNull>
  previewRects: ReadSignal<ReadonlyMap<string, Rect>>
  /** 회전 드래그 중인 객체의 미리보기 각도. 객체 뷰가 자기 것인지 확인해 쓴다. */
  previewRotation: ReadSignal<{ id: string; deg: number } | null>
  selectedRects: ReadSignal<readonly { rect: Rect; rotation: number }[]>
  handleRect: ReadSignal<Rect | null>
  handleRotation: ReadSignal<number>
  rotatable: ReadSignal<boolean>
  onPagePointerDown: (e: PointerEvent) => void
  onPageDoubleClick: (e: MouseEvent) => void
  onHandleGrab: (handle: HandleId, e: PointerEvent) => void
  onRotateGrab: (e: PointerEvent) => void

  /* 엘리먼트 등록 — 렌더 층이 ref 콜백으로 넘긴다 */
  setStageEl: (el: HTMLElement | null) => void
  setFrameEl: (el: HTMLElement | null) => void
  setPageListEl: (el: HTMLElement | null) => void

  /* 패널 */
  pageListWidth: ReadSignal<number>
  inspectorWidth: ReadSignal<number>
  panelResizing: ReadSignal<'pageList' | 'inspector' | null>
  startPanelResize: (panel: 'pageList' | 'inspector', e: PointerEvent) => void
  resetPanels: () => void

  /* 페이지 순서 변경 */
  reorderDraggingIndex: ReadSignal<number | null>
  reorderDropIndex: ReadSignal<number | null>
  onThumbPointerDown: (index: number, e: PointerEvent) => void

  /* 액션 */
  goToPage: (index: number) => void
  goToPageId: (pageId: string) => void
  setTitle: (value: string) => void
  duplicatePage: (index: number) => void
  requestRemovePage: (index: number) => void
  confirmRemovePage: () => void
  addBlankPage: () => void
  duplicateSelection: () => void
  deleteSelection: (ids?: readonly string[]) => void
  updateObject: (objectId: string, patch: Partial<PDFCanvasObject>) => void
  rotateObject: (objectId: string, deg: number) => void
  editText: (objectId: string, value: string) => void

  /* 검증 */
  validation: ReadSignal<ReturnType<typeof validateDoc>>
  invalidIds: ReadSignal<ReadonlySet<string>>
  canExport: ReadSignal<boolean>
  /**
   * 검증 게이트. 통과하면 `true`.
   *
   * 실패하면 문제가 있는 첫 객체로 페이지를 옮기고 선택·스크롤한 뒤 안내 문구를 세운다.
   */
  checkBeforeExport: () => boolean

  /* 커스텀 객체 (PLAN D25) */
  objectTypes: ObjectTypeRegistry | undefined
  onMountCustom: ((objectId: string, el: HTMLElement | null) => void) | undefined
  onMountInspector: ((objectId: string, el: HTMLElement | null) => void) | undefined
  /** 비밀을 제거한 문서. 뷰어에 넘기는 스냅샷이다. */
  toPublicDoc: () => PDFCanvasDoc

  /* 불러오기 */
  uploadOpen: ReadSignal<boolean>
  importProgress: ReadSignal<ImportProgress | null>
  importError: ReadSignal<string | null>
  openUpload: () => void
  closeUpload: () => void
  pickFile: (file: File) => Promise<void>
  cancelImport: () => void

  /* 메뉴·확인 모달 */
  pageMenu: ReadSignal<{ x: number; y: number; index: number } | null>
  openPageMenu: (index: number, e: MouseEvent) => void
  closePageMenu: () => void
  pendingPageDelete: ReadSignal<number | null>
  cancelRemovePage: () => void
  modalOpen: ReadSignal<boolean>

  /* 오류 문구 */
  toolError: ReadSignal<string | null>
  exportError: ReadSignal<string | null>

  /* ⚠️ 프로토타입 저장 (PLAN 18.5) */
  manualSaving: ReadSignal<boolean>
  manualSave: () => Promise<void>

  /**
   * 상단바 뒤로 가기. `onBack` prop 을 부른다.
   *
   * prop 만 있고 부르는 지점이 없었다 — 구 Vue 판은 템플릿에서 `emit('back')` 를 직접 했고,
   * 컨트롤러로 옮길 때 빠졌다.
   */
  back: () => void

  /** 문서 변경을 구독한다. 프레임워크 래퍼가 리렌더 신호로 쓴다 (facade `subscribe`). */
  subscribeDoc: (fn: (doc: PDFCanvasDoc) => void) => () => void

  /* 수명 */
  setProps: (next: Partial<EditorProps>) => void
  flushSave: () => Promise<void>
  /** 승격된 배경이 있었으면 `true`. 저장 전에 호스트가 부를 수 있다 (ARCHITECTURE §7.1). */
  promoteBackgrounds: () => Promise<boolean>
  /** 키보드 핸들러. 렌더 층이 `window` 에 붙인다. */
  onKeyDown: (e: KeyboardEvent) => void
  /** 스테이지 리사이즈 시 맞춤 배율을 다시 적용한다. */
  applyFit: () => void
}

type PageOrNull =
  ReturnType<typeof createPageNav>['currentPage'] extends ReadSignal<infer T> ? T : never
type EngineStatePages = ReturnType<typeof createEngineState>['pages']
type ViewportOrNull =
  ReturnType<typeof createPageViewport>['viewport'] extends ReadSignal<infer T> ? T : never
type PreviewOrNull =
  ReturnType<typeof createPointerTool>['preview'] extends ReadSignal<infer T> ? T : never

/* ------------------------------------------------------------------ 구현 -- */

export function createEditorController(initialProps: EditorProps = {}): EditorController {
  /*
   * prop 을 signal 로 들되, **엔진에 넘기는 것은 최초 값**이다. 콜백은 매번 최신을 부른다 —
   * React 가 렌더마다 새 함수를 만들기 때문에 최초 값을 붙들면 오래된 setState 를 부르게 된다.
   */
  const props = signal<EditorProps>(initialProps)
  const readOnly = computed(() => props.value.readOnly === true)

  /* ---------------------------------------------------------------- engine -- */

  /**
   * `uploadFile` prop 을 AssetPort 로 감싼다.
   *
   * prop 과 `ports.asset` 이 함께 오면 명시적으로 준 port 를 우선한다 — 더 구체적인 설정이다.
   */
  function resolveAssetPort(p: EditorProps): AssetPort | undefined {
    if (p.ports?.asset) return p.ports.asset
    const upload = p.uploadFile
    if (!upload) return undefined
    return {
      async persist(blob, meta) {
        const r = await upload(blob, meta)
        // 호스트가 올린 URL 은 세션을 넘겨 살아남는다.
        return { url: r.url, origin: 'remote', ...(r.assetId ? { assetId: r.assetId } : {}) }
      },
    }
  }

  /**
   * 커스텀 객체 타입 레지스트리 (PLAN D25). **최초 1회만 만든다.**
   *
   * 툴바 도구·인스펙터 패널·검증이 이 목록에서 나오므로 런타임에 바뀌면 화면이 흔들린다.
   */
  const objectTypes =
    initialProps.objectTypes && initialProps.objectTypes.length > 0
      ? createObjectTypeRegistry(initialProps.objectTypes)
      : undefined

  const startAsset = resolveAssetPort(initialProps)
  const engineState = createEngineState({
    ...(initialProps.initialDoc ? { doc: initialProps.initialDoc } : {}),
    ports: {
      ...initialProps.ports,
      ...(startAsset ? { asset: startAsset } : {}),
    },
    ...(initialProps.autosave !== undefined ? { autosave: initialProps.autosave } : {}),
    ...(objectTypes ? { objectTypes } : {}),
  })
  const { engine, doc, saveState, pages, pageCount, canUndo, canRedo, run } = engineState

  watch(
    () => doc.value,
    (next) => props.value.onChange?.(next),
  )
  watch(
    () => saveState.value,
    (state) => props.value.onSaveStateChange?.(state),
    {
      immediate: true,
    },
  )

  /* ------------------------------------------------------------- 뷰 상태 -- */

  const view = createEditorViewSignals()
  const {
    currentPageIndex,
    selectedObjectIds,
    activeTool,
    gridSnap,
    panArmed,
    editingObjectId,
    toolError,
    exportError,
  } = view

  const stageEl = signal<HTMLElement | null>(null)
  const frameEl = signal<HTMLElement | null>(null)
  const pageListEl = signal<HTMLElement | null>(null)

  /* 모달 상태는 아래 것들이 참조하므로 먼저 선언한다. */
  const uploadOpen = signal(false)
  const pendingPageDelete = signal<number | null>(null)
  const modalOpen = computed(() => uploadOpen.value || pendingPageDelete.value !== null)

  const panels = createPanelSizes()

  const nav = createPageNav({ pages, currentPageIndex, selectedObjectIds, stageEl })

  const stage = createStage({
    stageEl,
    pageSize: computed(() => nav.currentPage.value?.size ?? null),
    ...(initialProps.initialScale !== undefined ? { initialScale: initialProps.initialScale } : {}),
  })

  const { panning } = createPan({ stageEl, panArmed, disabled: modalOpen })

  /* ------------------------------------------------------- 좌표계·포인터 -- */

  const { viewport, remeasure } = createPageViewport({
    stageEl,
    frameEl,
    pageId: computed(() => nav.currentPage.value?.id ?? null),
    pageSize: computed(() => nav.currentPage.value?.size ?? null),
    scale: stage.scale,
  })

  const currentObjects = computed<readonly PDFCanvasObject[]>(
    () => nav.currentPage.value?.objects ?? [],
  )

  /** 팬 중이거나 읽기 전용이면 도구 입력을 받지 않는다. 팬이 좌클릭과 겹치지 않게. */
  const toolsDisabled = computed(
    () => readOnly.value || modalOpen.value || panArmed.value || panning.value,
  )

  /** Shift 를 누른 상태로 생성하면 도구를 유지한다. 연속 배치를 위한 관례다 (PLAN Q3). */
  let keepToolArmed = false

  const pointer = createPointerTool({
    viewport,
    remeasure,
    objects: currentObjects,
    selectedIds: selectedObjectIds,
    activeTool,
    gridSnap,
    disabled: toolsDisabled,
    onCommit: handlePointerCommit,
  })

  /**
   * 드래그 결과를 문서에 반영한다.
   *
   * 생성·변형은 커맨드 한 번으로 커밋되므로 사용자 제스처 하나가 undo 한 항목이 된다 (PLAN 11.2).
   */
  function handlePointerCommit(commit: PointerCommit) {
    const pageIndex = currentPageIndex.value
    const page = nav.currentPage.value
    if (!page) return

    switch (commit.kind) {
      case 'create': {
        // 의미 있는 드래그가 아니면 클릭으로 보고 기본 크기 객체를 놓는다.
        const rect = isMeaningfulDrag(commit.rect)
          ? commit.rect
          : defaultRectAt(
              { x: commit.rect.x, y: commit.rect.y },
              defaultSizeForTool(commit.tool, objectTypes),
            )
        /*
         * 등록되지 않은 커스텀 도구면 `null` 이다 — 타입이 사라진 뒤에도 툴바 상태가 남은 경우.
         * 조용히 빈 객체를 만들면 문서에 해석 불가한 데이터가 들어간다.
         */
        const obj = createObjectForTool(commit.tool, rect, objectTypes)
        if (!obj) {
          activeTool.value = 'select'
          return
        }
        try {
          if (run(`add ${obj.type}`, addObject(pageIndex, obj))) {
            selectedObjectIds.value = [obj.id]
          }
        } catch (err) {
          toolError.value =
            err instanceof ObjectLimitError ? text('error.objectLimit') : String(err)
          return
        }
        // 도구는 한 번 쓰면 select 로 돌아간다. Shift 를 누르고 있으면 유지한다 (PLAN Q3).
        if (!keepToolArmed) activeTool.value = 'select'
        break
      }

      case 'transform':
        run('move objects', transformObjects(pageIndex, commit.rects))
        break

      case 'rotate':
        run('rotate object', setRotation(pageIndex, commit.id, commit.deg, canRotate))
        break

      case 'select':
        selectedObjectIds.value = commit.ids
        // 다른 객체를 선택하면 인라인 편집을 끝낸다.
        if (editingObjectId.value && !commit.ids.includes(editingObjectId.value)) {
          editingObjectId.value = null
        }
        break

      case 'none':
        break
    }
  }

  /**
   * 지우개 (PLAN Q1).
   *
   * 기획은 툴바에 지우개를 두었지만 동작을 정의하지 않았다. 클릭한 객체를 삭제하는 쪽으로 구현한다 —
   * "배경 가리기" 해석은 `MaskObject` 타입으로 열어 두었고, 지금은 더 흔한 해석을 택했다.
   */
  function onEraserClick(e: PointerEvent) {
    const vp = viewport.value
    if (!vp) return
    const point = clientToPage({ x: e.clientX, y: e.clientY }, vp)
    const hit = pickObject(point, currentObjects.value)
    if (hit) deleteSelection([hit.id])
  }

  /** 캔버스 pointerdown 라우팅. 지우개는 드래그가 아니라 클릭 동작이다. */
  function onPagePointerDown(e: PointerEvent) {
    if (activeTool.value === 'eraser') {
      if (readOnly.value) return
      e.preventDefault()
      onEraserClick(e)
      return
    }
    keepToolArmed = e.shiftKey
    pointer.onPointerDown(e)
  }

  /** 더블클릭으로 텍스트 편집을 시작한다. */
  function onPageDoubleClick(e: MouseEvent) {
    if (readOnly.value) return
    const vp = viewport.value
    if (!vp) return
    const point = clientToPage({ x: e.clientX, y: e.clientY }, vp)
    const hit = pickObject(point, currentObjects.value)
    if (hit?.type === 'text') {
      batch(() => {
        editingObjectId.value = hit.id
        selectedObjectIds.value = [hit.id]
      })
    } else {
      editingObjectId.value = null
    }
  }

  /* --------------------------------------------------------- 선택·오버레이 -- */

  /** 선택된 객체들의 rect. 드래그 중이면 미리보기 값을 쓴다. */
  function rectFor(objectId: string): Rect | null {
    const preview = pointer.previewRects.value.get(objectId)
    if (preview) return preview
    return currentObjects.value.find((o) => o.id === objectId)?.rect ?? null
  }

  /** 오버레이가 그릴 선택 테두리. 회전 중이면 미리보기 각도를 쓴다. */
  const selectedRects = computed<readonly { rect: Rect; rotation: number }[]>(() =>
    selectedObjectIds.value
      .map((id) => {
        const rect = rectFor(id)
        if (!rect) return null
        const preview = pointer.previewRotation.value
        const rotation =
          preview?.id === id
            ? preview.deg
            : (currentObjects.value.find((o) => o.id === id)?.rotation ?? 0)
        return { rect, rotation }
      })
      .filter((v): v is { rect: Rect; rotation: number } => v !== null),
  )

  /** 핸들은 단일 선택일 때만 그린다. 다중 선택 리사이즈는 범위 밖이다. */
  const handleRect = computed(() =>
    selectedObjectIds.value.length === 1 ? (rectFor(selectedObjectIds.value[0]!) ?? null) : null,
  )

  /** 핸들 대상의 현재 각도. 회전 드래그 중에는 미리보기 값을 따라간다. */
  const handleRotation = computed(() => {
    const id = selectedObjectIds.value[0]
    if (selectedObjectIds.value.length !== 1 || !id) return 0
    const preview = pointer.previewRotation.value
    if (preview?.id === id) return preview.deg
    return currentObjects.value.find((o) => o.id === id)?.rotation ?? 0
  })

  /** 선택된 객체들. 인스펙터가 유형별 패널로 분기하는 데 쓴다. */
  const selectedObjects = computed<readonly PDFCanvasObject[]>(() =>
    currentObjects.value.filter((o) => selectedObjectIds.value.includes(o.id)),
  )

  /** Answer Box 는 회전하지 않는다 (PLAN Q8). 학생 폼 요소가 기울면 입력이 깨진다. */
  const rotatable = computed(() => {
    if (selectedObjectIds.value.length !== 1) return false
    const obj = selectedObjects.value[0]
    return obj?.type === 'text' || obj?.type === 'shape' || obj?.type === 'mask'
  })

  /* --------------------------------------------------------------- 감시자 -- */

  watch(
    () => selectedObjectIds.value,
    () => {
      toolError.value = null
      exportError.value = null
    },
  )

  // 페이지를 넘기면 편집 중이던 객체는 화면에 없다.
  watch(
    () => currentPageIndex.value,
    () => (editingObjectId.value = null),
  )

  /**
   * 페이지가 늘거나 줄어도 현재 페이지를 유효하게 유지하고, 페이지가 처음 생긴 순간 첫 페이지를
   * 선택한다. 페이지가 있는데 스테이지가 비어 보이는 상태를 만들지 않기 위해서다.
   *
   * ## ★ `immediate: true` 가 필요한 이유 — Vue 판의 버그를 고친 지점
   *
   * Vue 판에는 `immediate` 가 없었다. 그래서 **초기 `doc` 에 페이지가 이미 있으면** `pageCount` 가
   * 처음부터 N 이고 한 번도 *변하지* 않으므로 이 감시자가 돌지 않았다. `currentPageIndex` 가
   * `-1` 로 남아 툴바는 있는데 스테이지가 빈 화면이 나온다.
   *
   * 데모는 항상 `doc: null` 로 시작해 파일을 import 하므로 `0 → N` 전이가 생겨 이 경로를
   * 밟지 않았다. 그래서 발견되지 않았다 — README 가 첫 줄에 적어 둔
   * `<PDFCanvasEditor :doc="doc" />` 가 정확히 이 경로다 (PLAN 20.8).
   *
   * `immediate: true` 면 첫 호출의 `prev` 가 `undefined` 이므로, 아래 조건이 "처음 관측" 과
   * "0 에서 늘어남" 을 함께 덮는다.
   */
  watch(
    () => pageCount.value,
    (count, prev) => {
      if (count === 0) {
        currentPageIndex.value = -1
        return
      }
      if (prev === undefined || prev === 0) {
        nav.goTo(0)
        return
      }
      nav.reclamp()
    },
    { immediate: true },
  )

  /**
   * 마운트가 바뀌어도 스테이지 엘리먼트를 따라간다.
   *
   * 스테이지는 문서에 페이지가 있는 동안만 존재하므로, 옵저버를 한 번 설정하는 게 아니라 다시
   * 붙여야 한다. 붙일 때 맞춤을 다시 적용한다.
   *
   * `defer: true` — 엘리먼트가 레이아웃에 들어간 뒤에 측정해야 한다. 없는 엘리먼트나 크기 0인
   * 엘리먼트를 대상으로 계산한 맞춤은 조용히 아무 일도 하지 않는다.
   */
  let observer: ResizeObserver | null = null
  watch(
    () => stageEl.value,
    (el) => {
      observer?.disconnect()
      observer = null
      if (!el) return
      observer = new ResizeObserver(() => stage.applyFit())
      observer.observe(el)
      stage.applyFit()
    },
    { immediate: true, defer: true },
  )

  onCleanup(() => {
    observer?.disconnect()
    observer = null
  })

  /**
   * 대기 중인 저장을 내보낸다 (기획 3.2, PLAN 12).
   *
   * `visibilitychange` 도 듣는다. 모바일 브라우저는 탭을 닫을 때 `beforeunload` 를 부르지 않는
   * 경우가 있다.
   */
  const flushOnLeave = () => void engine.flushSave()

  function onBeforeUnload(e: BeforeUnloadEvent) {
    flushOnLeave()
    // 저장이 끝나지 않았으면 사용자에게 알린다. 문구는 브라우저가 정한다.
    if (engine.isDirty()) e.preventDefault()
  }

  window.addEventListener('beforeunload', onBeforeUnload)
  document.addEventListener('visibilitychange', flushOnLeave)
  onCleanup(() => {
    window.removeEventListener('beforeunload', onBeforeUnload)
    document.removeEventListener('visibilitychange', flushOnLeave)
  })

  /* -------------------------------------------------------------- keyboard -- */

  /**
   * 편집기 단축키 (PLAN 11.4).
   *
   * 텍스트 입력에 포커스가 있으면 전부 건너뛴다. 그 상황에서 Delete 나 Space 를 가로채면
   * 타이핑이 깨진다.
   */
  function onKeyDown(e: KeyboardEvent) {
    // 인라인 편집 중에는 Esc 만 처리한다. 나머지를 가로채면 타이핑이 불가능해진다.
    if (editingObjectId.value) {
      if (e.key === 'Escape') {
        e.preventDefault()
        editingObjectId.value = null
      }
      return
    }
    if (isTextEntry(e.target) || modalOpen.value) return
    const mod = e.metaKey || e.ctrlKey

    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) engineState.redo()
      else engineState.undo()
      return
    }
    if (mod && (e.key === '=' || e.key === '+')) {
      e.preventDefault()
      stage.zoomStep(1)
      return
    }
    if (mod && e.key === '-') {
      e.preventDefault()
      stage.zoomStep(-1)
      return
    }
    if (mod && e.key === '0') {
      e.preventDefault()
      // 페이지 맞춤. 기본 배율과 Acrobat 의 Cmd+0 과 일치한다. 폭 맞춤은 줌 메뉴에 있으며,
      // 둘을 한 키에 묶으면 단축키가 모호해진다.
      stage.setFitMode('page')
      return
    }
    if (mod && e.key === '1') {
      e.preventDefault()
      stage.zoomTo(1)
      return
    }
    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault()
      duplicateSelection()
      return
    }

    switch (e.key) {
      case 'Delete':
      case 'Backspace':
        // 선택이 없으면 브라우저 기본 동작(뒤로 가기 등)을 막지 않는다.
        if (selectedObjectIds.value.length === 0) break
        e.preventDefault()
        deleteSelection()
        break
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown': {
        if (selectedObjectIds.value.length === 0) break
        e.preventDefault()
        const step = e.shiftKey ? EDITOR_DEFAULTS.nudge.large : EDITOR_DEFAULTS.nudge.small
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        nudgeSelection(dx, dy)
        break
      }
      case 'PageDown':
        e.preventDefault()
        nav.next()
        break
      case 'PageUp':
        e.preventDefault()
        nav.prev()
        break
      case 'Home':
        e.preventDefault()
        nav.first()
        break
      case 'End':
        e.preventDefault()
        nav.last()
        break
      case 'Escape':
        batch(() => {
          activeTool.value = 'select'
          selectedObjectIds.value = []
          editingObjectId.value = null
        })
        break
    }
  }

  /* ---------------------------------------------------------------- import -- */

  const importProgress = signal<ImportProgress | null>(null)
  const importError = signal<string | null>(null)

  /** 실패를 기획이 정한 문구로 옮긴다 (기획 2.4). */
  function describeImportError(err: unknown): string {
    if (err instanceof PageLimitError) return text('error.pageLimit')
    if (err instanceof ConvertError) {
      switch (err.code) {
        case 'unsupported-format':
          return text('error.format')
        case 'file-too-large':
          return text('error.size')
        case 'page-limit':
          return text('error.pageLimit')
        case 'encrypted':
          return text('error.encrypted')
        case 'aborted':
          return text('error.aborted')
        case 'worker-unavailable':
        case 'corrupt':
        default:
          return text('error.convertFailed')
      }
    }
    return text('error.convertFailed')
  }

  async function pickFile(file: File) {
    importError.value = null
    try {
      await engine.importFile(file, (p) => (importProgress.value = p))
      uploadOpen.value = false
    } catch (err) {
      importError.value = describeImportError(err)
      if (!(err instanceof ConvertError) && !(err instanceof PageLimitError)) console.error(err)
    } finally {
      importProgress.value = null
    }
  }

  /* --------------------------------------------------------------- actions -- */

  function duplicatePageAt(index: number) {
    if (readOnly.value) return
    try {
      if (run('duplicate page', duplicatePage(index))) nav.goTo(index + 1)
    } catch (err) {
      importError.value = describeImportError(err)
      uploadOpen.value = false
    }
  }

  function removePageAt(index: number) {
    if (readOnly.value) return
    run('remove page', removePage(index))
  }

  /**
   * 삭제 확인 대기 상태 (기획 9.3).
   *
   * 객체가 없는 페이지는 확인 없이 지운다. undo 가 있는 편집기에서 모든 삭제를 확인받으면 방해다.
   * 객체가 있으면 **함께 사라진다는 사실**을 알려야 한다.
   */
  function requestRemovePage(index: number) {
    pageMenu.value = null
    if (readOnly.value) return

    const page = pages.value[index]
    if (!page) return

    if (pages.value.length <= 1) {
      toolError.value = text('error.minPages')
      return
    }

    if (page.objects.length > 0) {
      pendingPageDelete.value = index
      return
    }
    removePageAt(index)
  }

  function confirmRemovePage() {
    const index = pendingPageDelete.value
    pendingPageDelete.value = null
    if (index !== null) removePageAt(index)
  }

  /**
   * 드래그로 페이지 순서를 바꾼다.
   *
   * 보고 있던 페이지를 따라간다. 인덱스만 유지하면 순서 변경 후 다른 페이지가 화면에 나타나
   * 사용자가 방향을 잃는다.
   */
  function onReorderPage(from: number, to: number) {
    if (readOnly.value) return
    const movedId = pages.value[from]?.id
    if (!run('move page', movePage(from, to))) return
    const next = movedId ? pages.value.findIndex((p) => p.id === movedId) : -1
    if (next >= 0 && from === currentPageIndex.value) nav.goTo(next)
    else nav.reclamp()
  }

  const reorder = createPageReorder({
    listEl: pageListEl,
    onReorder: onReorderPage,
    disabled: readOnly,
  })

  function addBlankPage() {
    if (readOnly.value) return
    try {
      if (run('add blank page', insertBlankPage(currentPageIndex.value))) {
        nav.goTo(currentPageIndex.value + 1)
      }
    } catch {
      importError.value = text('error.pageLimit')
    }
  }

  function duplicateSelection() {
    if (readOnly.value || selectedObjectIds.value.length === 0) return
    const pageIndex = currentPageIndex.value
    const before = doc.value
    try {
      if (run('duplicate objects', duplicateObjects(pageIndex, selectedObjectIds.value))) {
        // 복제 직후에는 새 객체가 선택돼 있어야 바로 옮길 수 있다.
        selectedObjectIds.value = newIdsAfterDuplicate(before, doc.value, pageIndex)
      }
    } catch (err) {
      toolError.value = err instanceof ObjectLimitError ? text('error.objectLimit') : String(err)
    }
  }

  /** 객체 삭제. 대상을 주지 않으면 현재 선택을 지운다. */
  function deleteSelection(ids: readonly string[] = selectedObjectIds.value) {
    if (readOnly.value || ids.length === 0) return
    if (run('remove objects', removeObjects(currentPageIndex.value, ids))) {
      selectedObjectIds.value = selectedObjectIds.value.filter((id) => !ids.includes(id))
    }
  }

  /** 방향키 이동. 커맨드 한 번이므로 연속 입력도 각각 undo 된다. */
  function nudgeSelection(dx: number, dy: number) {
    if (readOnly.value || selectedObjectIds.value.length === 0) return
    const page = nav.currentPage.value
    if (!page) return
    const rects = new Map<string, Rect>()
    for (const id of selectedObjectIds.value) {
      const obj = page.objects.find((o) => o.id === id)
      if (!obj) continue
      rects.set(
        id,
        moveRect(obj.rect, { dx, dy }, page.size, obj.type, { rotation: obj.rotation ?? 0 }),
      )
    }
    run('nudge objects', transformObjects(currentPageIndex.value, rects))
  }

  /* ------------------------------------------------------- 페이지 컨텍스트 -- */

  /** 우클릭 메뉴 상태. null 이면 닫혀 있다. */
  const pageMenu = signal<{ x: number; y: number; index: number } | null>(null)

  function openPageMenu(index: number, e: MouseEvent) {
    if (readOnly.value) return
    // 메뉴를 여는 페이지를 선택 상태로 만든다. 대상이 눈에 보여야 한다.
    nav.goTo(index)
    pageMenu.value = { x: e.clientX, y: e.clientY, index }
  }

  /* ----------------------------------------------------------- 검증·내보내기 -- */

  /**
   * 문서 전체 검증. 인스펙터 경고와 같은 규칙을 쓴다 (PLAN 12).
   *
   * 문서가 바뀔 때마다 다시 계산한다. 500페이지 문서에서도 객체 상한이 200개라 비용이 작다.
   */
  const validation = computed(() => validateDoc(doc.value, objectTypes))

  /** 내보내기를 막는 객체들. 캔버스에서 테두리로 표시한다. */
  const invalidIds = computed(() => invalidObjectIds(validation.value))

  /**
   * 회전 허용 판단. 커맨드에 넘겨 문서 불변식을 커맨드가 지키게 한다.
   *
   * 커스텀 객체는 소비자가 `rotatable` 로 정한다 (PLAN D25). 기본은 허용이다.
   */
  function canRotate(obj: PDFCanvasObject): boolean {
    if (obj.type !== 'custom') return true
    return objectTypes?.get(obj.kind)?.rotatable !== false
  }

  /**
   * 검증 게이트. 실패하면 문제가 있는 첫 객체로 데려간다 (기획 3.5).
   *
   * 이전 판은 `guardExport` 가 정답 미지정을 막고 학생용 문서를 만들었다. 그 규칙은 문제지
   * 도메인이므로 소비자의 `objectType.validate` 로 옮겼다 (PLAN D25). 여기 남은 것은
   * **문제 지점으로 데려가는 UX** 다.
   */
  function checkBeforeExport(): boolean {
    exportError.value = null
    const result = validation.value
    if (result.ok) return true

    const issue = result.issues.find((i) => i.objectId !== null) ?? result.issues[0]
    if (issue?.pageIndex !== null && issue?.pageIndex !== undefined) nav.goTo(issue.pageIndex)
    if (issue?.objectId) {
      selectedObjectIds.value = [issue.objectId]
      // 확대 상태에서 문제 객체가 화면 밖이면 선택만으로는 알 수 없다 (기획 3.5).
      const target = nav.currentPage.value?.objects.find((o) => o.id === issue.objectId)
      if (target) stage.scrollRectIntoView(target.rect)
    }
    exportError.value = text('error.exportBlocked', {
      count: invalidObjectIds(result).size,
    })
    return false
  }

  /** 페이지가 있으면 버튼을 활성화한다. 검증 실패는 클릭 후 안내한다 — 왜 막혔는지 알려야 한다. */
  const canExport = computed(() => pageCount.value > 0)

  /* --------------------------------------------------- 프로토타입 저장 ⚠️ -- */

  /**
   * ⚠️ **프로토타입 저장.** 실서버가 붙으면 이 블록과 `src/prototype/` 을 함께 삭제한다.
   *
   * localStorage 에 문서와 이미지(base64)를 넣어, 아직 없는 뷰어가 나중에 조합해 띄울 수 있게 한다.
   * 상단바 버튼이 [내보내기] 대신 이걸 부른다 — 과제 생성 API 가 없어 내보내기는 빈 팝업만 뜬다.
   *
   * 되돌리는 방법은 `src/prototype/README.md` 참고.
   */
  const manualSaving = signal(false)

  async function manualSave() {
    if (manualSaving.value || pageCount.value === 0) return
    manualSaving.value = true
    toolError.value = null
    try {
      const result = await savePrototype(doc.value)
      // 저장 결과는 콘솔로만 알린다. 프로토타입 동작이라 UI 를 늘리지 않는다.
      // eslint-disable-next-line no-console
      console.debug(
        `[pdf-canvas-kit:prototype] saved · ${pageCount.value} pages · ${result.images} images · ` +
          `~${(result.approxBytes / 1024 / 1024).toFixed(2)}MB`,
      )
      engine.markSaved()
    } catch (err) {
      toolError.value =
        err instanceof PrototypeQuotaError
          ? err.message
          : `[prototype] save failed: ${err instanceof Error ? err.message : String(err)}`
      console.error(err)
    } finally {
      manualSaving.value = false
    }
  }

  /* ---------------------------------------------------------------- 반환 -- */

  return {
    doc,
    pages,
    pageCount,
    saveState,
    canUndo,
    canRedo,
    undo: () => void engineState.undo(),
    redo: () => void engineState.redo(),

    currentPageIndex,
    currentPage: nav.currentPage,
    currentPageNumber: nav.currentPageNumber,
    currentObjects,
    selectedObjectIds,
    selectedObjects,
    activeTool,
    setActiveTool: (tool) => (activeTool.value = tool),
    panArmed,
    panning,
    editingObjectId,
    readOnly,

    scale: stage.scale,
    percent: stage.percent,
    canZoomIn: stage.canZoomIn,
    canZoomOut: stage.canZoomOut,
    zoomPresets: EDITOR_DEFAULTS.zoom.presets,
    zoomStep: stage.zoomStep,
    zoomTo: (s) => stage.zoomTo(s),
    zoomByWheel: stage.zoomByWheel,
    fitWidth: () => stage.setFitMode('width'),
    fitPage: () => stage.setFitMode('page'),

    viewport,
    preview: pointer.preview,
    previewRects: pointer.previewRects,
    previewRotation: pointer.previewRotation,
    selectedRects,
    handleRect,
    handleRotation,
    rotatable,
    onPagePointerDown,
    onPageDoubleClick,
    onHandleGrab: (handle, e) => pointer.onHandleDown(handle, e),
    onRotateGrab: (e) => pointer.onRotateDown(e),

    setStageEl: (el) => (stageEl.value = el),
    setFrameEl: (el) => (frameEl.value = el),
    setPageListEl: (el) => (pageListEl.value = el),

    pageListWidth: panels.pageListWidth,
    inspectorWidth: panels.inspectorWidth,
    panelResizing: panels.resizing,
    startPanelResize: panels.startResize,
    resetPanels: panels.reset,

    reorderDraggingIndex: reorder.draggingIndex,
    reorderDropIndex: reorder.dropIndex,
    onThumbPointerDown: reorder.onItemPointerDown,

    goToPage: nav.goTo,
    goToPageId: nav.goToPageId,
    setTitle: (value) => {
      if (readOnly.value) return
      run('title', setTitle(value))
    },
    duplicatePage: duplicatePageAt,
    requestRemovePage,
    confirmRemovePage,
    addBlankPage,
    duplicateSelection,
    deleteSelection,
    updateObject: (objectId, patch) => {
      if (readOnly.value) return
      run('edit object', updateObject(currentPageIndex.value, objectId, patch))
    },
    rotateObject: (objectId, deg) => {
      run('rotate object', setRotation(currentPageIndex.value, objectId, deg, canRotate))
    },
    editText: (objectId, value) => {
      if (readOnly.value) return
      run('edit text', updateObject(currentPageIndex.value, objectId, { text: value }))
    },

    validation,
    invalidIds,
    canExport,

    checkBeforeExport,

    objectTypes,
    onMountCustom: props.value.onMountCustom,
    onMountInspector: props.value.onMountInspector,
    toPublicDoc: () => engine.toPublicDoc(),

    uploadOpen,
    importProgress,
    importError,
    openUpload: () => {
      importError.value = null
      uploadOpen.value = true
    },
    closeUpload: () => (uploadOpen.value = false),
    pickFile,
    cancelImport: () => {
      engine.cancelImport()
      importProgress.value = null
    },

    pageMenu,
    openPageMenu,
    closePageMenu: () => (pageMenu.value = null),
    pendingPageDelete,
    cancelRemovePage: () => (pendingPageDelete.value = null),
    modalOpen,

    toolError,
    exportError,

    manualSaving,
    manualSave,

    back: () => props.value.onBack?.(),

    subscribeDoc: (fn) => engine.doc.subscribe(fn),

    /**
     * prop 을 갱신한다.
     *
     * `initialDoc` · `initialScale` · `objectTypes` 는 무시된다 — 위 props 계약 참고. 조용히 무시하는 대신 개발 모드에서
     * 경고를 낼 수도 있지만, React 는 렌더마다 같은 `doc` 을 다시 넘기므로 경고가 폭주한다.
     */
    setProps: (next) => {
      props.value = { ...props.value, ...next }
    },
    flushSave: () => engine.flushSave(),
    promoteBackgrounds: () => engine.promoteBackgrounds(),
    onKeyDown,
    applyFit: stage.applyFit,
  }
}
