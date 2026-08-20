<script setup lang="ts">
/**
 * 워크시트 편집기 (PLAN 6.1).
 *
 * 3분할 레이아웃을 조립하고 엔진을 뷰 상태에 연결한다. 이 분리는 의도적이다. 문서와 히스토리는
 * 엔진이 갖고, DOM 측정에 묶인 것들 — 배율·스크롤·현재 페이지·선택 — 은 이 컴포넌트가 갖는다
 * (PLAN 6.6).
 *
 * 클라이언트 전용이다. pdf.js·포인터 이벤트·`createObjectURL` 이 브라우저 API이므로 Nuxt에서는
 * `<ClientOnly>` 로 감싸야 한다 (PLAN D16).
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { EDITOR_DEFAULTS } from '../core/config/defaults'
import { duplicatePage, insertBlankPage, movePage, removePage } from '../core/commands/pages'
import {
  addObject,
  AnswerBoxLimitError,
  duplicateObjects,
  newIdsAfterDuplicate,
  removeObjects,
  transformObjects,
  updateObject,
  setRotation,
} from '../core/commands/objects'
import { guardExport, type ExportPayload } from '../core/validation/exportGuard'
// ⚠️ 프로토타입 저장. 실서버가 붙으면 이 import와 아래 onManualSave 를 함께 지운다 (PLAN 18.5).
import { PrototypeQuotaError, savePrototype } from '../prototype/localStorageStore'
import { invalidObjectIds, validateDoc } from '../core/validation/rules'
import { setTitle } from '../core/commands/doc'
import { moveRect } from '../core/geometry/handles'
import type { HandleId } from '../core/geometry/handles'
import { createObjectForTool, defaultRectAt } from '../core/interaction/tools'
import { isMeaningfulDrag } from '../core/geometry/constrain'
import { pickObject } from '../core/geometry/hitTest'
import { clientToPage } from '../core/geometry/units'
import type { PointerCommit } from '../core/interaction/pointerMachine'
import type { Rect, PDFCanvasObject } from '../core/model/types'
import { questionNumberMap } from '../core/model/numbering'
import type { Locale } from '../core/i18n/createI18n'
import { createViewState, type SaveState, type ToolId } from '../core/model/viewState'
import type { PDFCanvasDoc } from '../core/model/types'
import { ConvertError } from '../core/ports/ConverterPort'
import { PageLimitError } from '../core/commands/pages'
import type { EnginePorts, ImportProgress } from '../core/engine'
import type { AssetPort } from '../core/ports/AssetPort'
import type { I18nPort } from '../core/ports/I18nPort'
import { useEngine } from './composables/useEngine'
import { useI18n } from './composables/useI18n'
import { usePageNav } from './composables/usePageNav'
import { usePageViewport } from './composables/usePageViewport'
import { usePan } from './composables/usePan'
import { usePanelSizes } from './composables/usePanelSizes'
import { usePointerTool } from './composables/usePointerTool'
import { useStage } from './composables/useStage'
import CanvasStage from './editor/CanvasStage.vue'
import EmptyState from './editor/EmptyState.vue'
import PageMeta from './editor/PageMeta.vue'
import PageThumbList from './editor/PageThumbList.vue'
import StageControls from './editor/StageControls.vue'
import Inspector from './editor/inspector/Inspector.vue'
import SelectionOverlay from './editor/SelectionOverlay.vue'
import Toolbar from './editor/Toolbar.vue'
import TopBar from './editor/TopBar.vue'
import ObjectView from './editor/objects/ObjectView.vue'
import ConfirmDialog from './editor/dialogs/ConfirmDialog.vue'
import PageContextMenu from './editor/PageContextMenu.vue'
import UploadDialog from './editor/dialogs/UploadDialog.vue'

const props = withDefaults(
  defineProps<{
    /** 초기 문서. `null` 이면 빈 상태로 시작해 문서 불러오기 안내를 띄운다. */
    doc?: PDFCanvasDoc | null
    ports?: EnginePorts
    locale?: Locale
    readOnly?: boolean
    /** 시작 배율. 기본값 `'fit-page'` — 불러오는 즉시 페이지 전체가 보인다. */
    initialScale?: number | 'fit-width' | 'fit-page'
    /**
     * 페이지 이미지를 업로드하는 함수 (PLAN Q11 결정: S3).
     *
     * 주면 `AssetPort` 로 감싸 배경을 영속 URL로 저장한다. 주지 않으면 세션 한정 blob URL을 쓰고,
     * 그 문서는 저장할 수 없다 — `serializeDoc` 이 거부한다 (PLAN 4.1).
     *
     * presigned URL 방식이면 `createS3AssetPort` 를 `ports.asset` 에 주는 편이 간단하다.
     * 이 prop은 업로드 경로가 완전히 다른 제품을 위한 것이다.
     */
    uploadFile?: (
      blob: Blob,
      meta: { pageId: string; fileName?: string; mime: string },
    ) => Promise<{ url: string; assetId?: string }>
    /**
     * 자동저장을 켠다. `ports.storage` 가 있을 때만 의미가 있다.
     *
     * 기본값은 storage 포트 유무를 따른다. 저장할 곳이 없는데 "저장 중" 배지를 띄우면 거짓말이다.
     */
    autosave?: boolean
  }>(),
  // `ports` · `uploadFile` 에는 의도적으로 기본값을 두지 않는다. exactOptionalPropertyTypes
  // 아래에서는 명시적 `undefined` 를 대입할 수 없고, 엔진이 이미 자체 기본값으로 떨어진다.
  {
    doc: null,
    locale: 'ko',
    readOnly: false,
    initialScale: 'fit-page',
  },
)

const emit = defineEmits<{
  change: [doc: PDFCanvasDoc]
  saveStateChange: [state: SaveState]
  requestExport: [payload: ExportPayload]
  back: []
}>()

/* ---------------------------------------------------------------- engine -- */

/**
 * `uploadFile` prop을 AssetPort로 감싼다.
 *
 * prop과 `ports.asset` 이 함께 오면 명시적으로 준 port를 우선한다 — 더 구체적인 설정이다.
 */
const assetPort = computed<AssetPort | undefined>(() => {
  if (props.ports?.asset) return props.ports.asset
  const upload = props.uploadFile
  if (!upload) return undefined
  return {
    async persist(blob, meta) {
      const r = await upload(blob, meta)
      // 호스트가 올린 URL은 세션을 넘겨 살아남는다.
      return { url: r.url, origin: 'remote', ...(r.assetId ? { assetId: r.assetId } : {}) }
    },
  }
})

const { engine, doc, saveState, pages, pageCount, canUndo, canRedo, run, undo, redo } = useEngine({
  ...(props.doc ? { doc: props.doc } : {}),
  ports: {
    ...props.ports,
    ...(assetPort.value ? { asset: assetPort.value } : {}),
  },
  ...(props.autosave !== undefined ? { autosave: props.autosave } : {}),
})

watch(doc, (value) => emit('change', value))

const injectedI18n = computed<I18nPort | undefined>(() => props.ports?.i18n)
const localeRef = computed(() => props.locale)
const t = useI18n(localeRef, injectedI18n)

/* ------------------------------------------------------------ view state -- */

const view = ref(createViewState())

// 저장 상태는 엔진이 소유한다. 뷰 상태에 사본을 두면 두 값이 갈라진다.
watch(saveState, (state) => emit('saveStateChange', state), { immediate: true })

/**
 * 스테이지의 스크롤 컨테이너.
 *
 * 컴포넌트에 template ref를 거는 대신 자식이 노출한 ref로 접근한다. 줌 앵커링·팬·맞춤 계산이
 * 모두 스크롤하는 엘리먼트 자체를 필요로 하기 때문이다. 문서가 비면 CanvasStage가 언마운트되므로,
 * 한 번 읽어 두지 않고 아래 watcher로 계속 맞춘다.
 */
/**
 * 좌·우 패널 폭. 드래그로 조정하면 `localStorage` 에 남는다 (PLAN Q17).
 *
 * CSS 변수로 내려보내므로 `tokens.css` 의 기본값을 그대로 덮어쓴다 — 레이아웃 규칙을 두 번
 * 정의하지 않는다.
 */
const panels = usePanelSizes()

const bodyStyle = computed(() => ({
  '--pck-pagelist-width': `${panels.pageListWidth.value}px`,
  '--pck-inspector-width': `${panels.inspectorWidth.value}px`,
}))

const stageEl = ref<HTMLElement | null>(null)
const stageComp = ref<{ scrollEl: HTMLElement | null; frameEl: HTMLElement | null } | null>(null)
const currentPageIndex = computed({
  get: () => view.value.currentPageIndex,
  set: (v) => (view.value.currentPageIndex = v),
})
const selectedObjectIds = computed({
  get: () => view.value.selectedObjectIds,
  set: (v) => (view.value.selectedObjectIds = v),
})
const panArmed = computed({
  get: () => view.value.panArmed,
  set: (v) => (view.value.panArmed = v),
})

const nav = usePageNav({ pages, currentPageIndex, selectedObjectIds, stageEl })

const stage = useStage({
  stageEl,
  pageSize: computed(() => nav.currentPage.value?.size ?? null),
  ...(props.initialScale !== undefined ? { initialScale: props.initialScale } : {}),
})

const modalOpen = computed(() => uploadOpen.value || pendingPageDelete.value !== null)
const { panning } = usePan({ stageEl, panArmed, disabled: modalOpen })

/* ------------------------------------------------------- 좌표계·포인터 -- */

const frameEl = computed(() => stageComp.value?.frameEl ?? null)

const { viewport, remeasure } = usePageViewport({
  stageEl,
  frameEl,
  pageId: computed(() => nav.currentPage.value?.id ?? null),
  pageSize: computed(() => nav.currentPage.value?.size ?? null),
  scale: stage.scale,
})

const currentObjects = computed(() => nav.currentPage.value?.objects ?? [])

/**
 * 문항 번호. 문서 전체를 훑어 페이지 순·읽는 순으로 부여한다 (PLAN Q9).
 *
 * 문서에 저장하지 않는 파생값이다. 객체를 옮기면 번호도 따라 바뀌므로 다시 계산해야 한다.
 * Answer Box 상한이 200개라 문서 변경마다 계산해도 비용이 작다.
 */
const questionNumbers = computed(() => questionNumberMap(doc.value))

/** 팬 중이거나 읽기 전용이면 도구 입력을 받지 않는다. 팬이 좌클릭과 겹치지 않게. */
const toolsDisabled = computed(
  () => props.readOnly || modalOpen.value || view.value.panArmed || panning.value,
)

const pointer = usePointerTool({
  viewport,
  remeasure,
  objects: currentObjects,
  selectedIds: selectedObjectIds,
  activeTool: computed({
    get: () => view.value.activeTool,
    set: (v) => (view.value.activeTool = v),
  }),
  gridSnap: computed({
    get: () => view.value.gridSnap,
    set: (v) => (view.value.gridSnap = v),
  }),
  disabled: toolsDisabled,
  onCommit: handlePointerCommit,
})

/**
 * 드래그 결과를 문서에 반영한다.
 *
 * 생성·변형은 커맨드 한 번으로 커밋되므로 사용자 제스처 하나가 undo 한 항목이 된다 (PLAN 11.2).
 */
function handlePointerCommit(commit: PointerCommit) {
  const pageIndex = view.value.currentPageIndex
  const page = nav.currentPage.value
  if (!page) return

  switch (commit.kind) {
    case 'create': {
      // 의미 있는 드래그가 아니면 클릭으로 보고 기본 크기 객체를 놓는다.
      const rect = isMeaningfulDrag(commit.rect)
        ? commit.rect
        : defaultRectAt({ x: commit.rect.x, y: commit.rect.y })
      const obj = createObjectForTool(commit.tool, rect)
      try {
        if (run(`add ${obj.type}`, addObject(pageIndex, obj))) {
          selectedObjectIds.value = [obj.id]
        }
      } catch (err) {
        toolError.value =
          err instanceof AnswerBoxLimitError ? t.value('error.boxLimit') : String(err)
        return
      }
      // 도구는 한 번 쓰면 select로 돌아간다. Shift를 누르고 있으면 유지한다 (PLAN Q3).
      if (!keepToolArmed.value) view.value.activeTool = 'select'
      break
    }

    case 'transform':
      run('move objects', transformObjects(pageIndex, commit.rects))
      break

    case 'rotate':
      run('rotate object', setRotation(pageIndex, commit.id, commit.deg))
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
 * 인라인 텍스트 편집 중인 객체 (기획 7.1).
 *
 * 편집 중에는 편집기 단축키를 가로채지 않는다. Delete가 객체를 지우거나 방향키가 객체를 옮기면
 * 타이핑이 불가능해진다.
 */
const editingObjectId = ref<string | null>(null)

/** 더블클릭으로 텍스트 편집을 시작한다. */
function onPageDoubleClick(e: MouseEvent) {
  if (props.readOnly) return
  const vp = viewport.value
  if (!vp) return
  const point = clientToPage({ x: e.clientX, y: e.clientY }, vp)
  const hit = pickObject(point, currentObjects.value)
  if (hit?.type === 'text') {
    editingObjectId.value = hit.id
    selectedObjectIds.value = [hit.id]
  } else {
    editingObjectId.value = null
  }
}

/** 인라인 편집 내용을 문서에 반영한다. */
function onEditText(objectId: string, value: string) {
  if (props.readOnly) return
  run('edit text', updateObject(view.value.currentPageIndex, objectId, { text: value }))
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
  if (hit) onDeleteSelection([hit.id])
}

/** 캔버스 pointerdown 라우팅. 지우개는 드래그가 아니라 클릭 동작이다. */
function onPagePointerDownRouted(e: PointerEvent) {
  if (view.value.activeTool === 'eraser') {
    if (props.readOnly) return
    e.preventDefault()
    onEraserClick(e)
    return
  }
  onPagePointerDown(e)
}

/** Shift를 누른 상태로 생성하면 도구를 유지한다. 연속 배치를 위한 관례다. */
const keepToolArmed = ref(false)

/** 선택된 객체들의 rect. 드래그 중이면 미리보기 값을 쓴다. */
function rectFor(objectId: string): Rect | null {
  const preview = pointer.previewRects.value.get(objectId)
  if (preview) return preview
  return currentObjects.value.find((o) => o.id === objectId)?.rect ?? null
}

/** 오버레이가 그릴 선택 테두리. 회전 중이면 미리보기 각도를 쓴다. */
const selectedRects = computed(() =>
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

function onHandleGrab(handle: HandleId, e: PointerEvent) {
  pointer.onHandleDown(handle, e)
}

/** 핸들 대상의 현재 각도. 회전 드래그 중에는 미리보기 값을 따라간다. */
const handleRotation = computed(() => {
  const id = selectedObjectIds.value[0]
  if (selectedObjectIds.value.length !== 1 || !id) return 0
  const preview = pointer.previewRotation.value
  if (preview?.id === id) return preview.deg
  return currentObjects.value.find((o) => o.id === id)?.rotation ?? 0
})

/** Answer Box는 회전하지 않는다 (PLAN Q8). 학생 폼 요소가 기울면 입력이 깨진다. */
const rotatable = computed(() => {
  if (selectedObjectIds.value.length !== 1) return false
  const obj = selectedObjects.value[0]
  return obj?.type === 'text' || obj?.type === 'shape' || obj?.type === 'mask'
})

/** 캔버스 pointerdown. Shift 여부를 기록해 생성 후 도구 유지를 결정한다 (PLAN Q3). */
function onPagePointerDown(e: PointerEvent) {
  keepToolArmed.value = e.shiftKey
  pointer.onPointerDown(e)
}

/** 도구·객체 조작 중 발생한 오류 문구. 한도 초과 등. */
const toolError = ref<string | null>(null)
watch(selectedObjectIds, () => {
  toolError.value = null
  exportError.value = null
})

// 페이지를 넘기면 편집 중이던 객체는 화면에 없다.
watch(
  () => view.value.currentPageIndex,
  () => (editingObjectId.value = null),
)

/**
 * 페이지가 늘거나 줄어도 현재 페이지를 유효하게 유지하고, 새로 import한 문서에서는 첫 페이지를
 * 선택한다. 페이지가 있는데 스테이지가 비어 보이는 상태를 만들지 않기 위해서다.
 */
watch(pageCount, (count, prev) => {
  if (count === 0) {
    currentPageIndex.value = -1
    return
  }
  if (prev === 0) {
    nav.goTo(0)
    return
  }
  nav.reclamp()
})

/* ------------------------------------------------------------- resizing --- */

let observer: ResizeObserver | null = null

/**
 * 마운트가 바뀌어도 스테이지 엘리먼트를 따라간다.
 *
 * 스테이지는 문서에 페이지가 있는 동안만 존재하므로, 옵저버를 한 번 설정하는 게 아니라 다시
 * 붙여야 한다. 붙일 때 맞춤을 다시 적용한다. 엘리먼트가 레이아웃에 들어가기 전에는 크기를 알 수
 * 없고, 없는 엘리먼트를 대상으로 계산한 맞춤은 조용히 아무 일도 하지 않는다.
 */
watch(
  () => stageComp.value?.scrollEl ?? null,
  (el) => {
    observer?.disconnect()
    stageEl.value = el
    if (!el) return
    observer = new ResizeObserver(() => stage.applyFit())
    observer.observe(el)
    stage.applyFit()
  },
  { flush: 'post' },
)

/**
 * 대기 중인 저장을 내보낸다 (기획 3.2, PLAN 12).
 *
 * `visibilitychange` 도 듣는다. 모바일 브라우저는 탭을 닫을 때 `beforeunload` 를 부르지 않는
 * 경우가 있다.
 */
function flushOnLeave() {
  void engine.flushSave()
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  flushOnLeave()
  // 저장이 끝나지 않았으면 사용자에게 알린다. 문구는 브라우저가 정한다.
  if (engine.isDirty()) e.preventDefault()
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('beforeunload', onBeforeUnload)
  document.addEventListener('visibilitychange', flushOnLeave)
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('beforeunload', onBeforeUnload)
  document.removeEventListener('visibilitychange', flushOnLeave)
})

/* -------------------------------------------------------------- keyboard -- */

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

/**
 * 편집기 단축키 (PLAN 11.4).
 *
 * 텍스트 입력에 포커스가 있으면 전부 건너뛴다. 그 상황에서 Delete나 Space를 가로채면
 * 타이핑이 깨진다.
 */
function onKeyDown(e: KeyboardEvent) {
  // 인라인 편집 중에는 Esc만 처리한다. 나머지를 가로채면 타이핑이 불가능해진다.
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
    if (e.shiftKey) redo()
    else undo()
    return
  }
  if (mod && (e.key === '=' || e.key === '+')) {
    e.preventDefault()
    void stage.zoomStep(1)
    return
  }
  if (mod && e.key === '-') {
    e.preventDefault()
    void stage.zoomStep(-1)
    return
  }
  if (mod && e.key === '0') {
    e.preventDefault()
    // 페이지 맞춤. 기본 배율과 Acrobat의 Cmd+0 과 일치한다. 폭 맞춤은 줌 메뉴에 있으며,
    // 둘을 한 키에 묶으면 단축키가 모호해진다.
    void stage.setFitMode('page')
    return
  }
  if (mod && e.key === '1') {
    e.preventDefault()
    void stage.zoomTo(1)
    return
  }
  if (mod && e.key.toLowerCase() === 'd') {
    e.preventDefault()
    onDuplicateSelection()
    return
  }

  switch (e.key) {
    case 'Delete':
    case 'Backspace':
      // 선택이 없으면 브라우저 기본 동작(뒤로 가기 등)을 막지 않는다.
      if (selectedObjectIds.value.length === 0) break
      e.preventDefault()
      onDeleteSelection()
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
      view.value.activeTool = 'select'
      selectedObjectIds.value = []
      editingObjectId.value = null
      break
  }
}

/* ---------------------------------------------------------------- import -- */

const uploadOpen = ref(false)
const importProgress = ref<ImportProgress | null>(null)
const importError = ref<string | null>(null)

/** Maps a failure to the exact wording the spec prescribes (spec 2.4). */
function describeImportError(err: unknown): string {
  if (err instanceof PageLimitError) return t.value('error.pageLimit')
  if (err instanceof ConvertError) {
    switch (err.code) {
      case 'unsupported-format':
        return t.value('error.format')
      case 'file-too-large':
        return t.value('error.size')
      case 'page-limit':
        return t.value('error.pageLimit')
      case 'encrypted':
        return t.value('error.encrypted')
      case 'aborted':
        return t.value('error.aborted')
      case 'worker-unavailable':
      case 'corrupt':
      default:
        return t.value('error.convertFailed')
    }
  }
  return t.value('error.convertFailed')
}

async function onPickFile(file: File) {
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

function openUpload() {
  importError.value = null
  uploadOpen.value = true
}

function cancelImport() {
  engine.cancelImport()
  importProgress.value = null
}

/* --------------------------------------------------------------- actions -- */

function onTitleChange(value: string) {
  if (props.readOnly) return
  run('title', setTitle(value))
}

function onDuplicatePage(index: number) {
  if (props.readOnly) return
  try {
    if (run('duplicate page', duplicatePage(index))) nav.goTo(index + 1)
  } catch (err) {
    importError.value = describeImportError(err)
    uploadOpen.value = false
  }
}

function onRemovePage(index: number) {
  if (props.readOnly) return
  run('remove page', removePage(index))
}

/* ------------------------------------------------------- 페이지 컨텍스트 -- */

/** 우클릭 메뉴 상태. null이면 닫혀 있다. */
const pageMenu = ref<{ x: number; y: number; index: number } | null>(null)

function openPageMenu(index: number, e: MouseEvent) {
  if (props.readOnly) return
  // 메뉴를 여는 페이지를 선택 상태로 만든다. 대상이 눈에 보여야 한다.
  nav.goTo(index)
  pageMenu.value = { x: e.clientX, y: e.clientY, index }
}

/**
 * 삭제 확인 대기 상태 (기획 9.3).
 *
 * 객체가 없는 페이지는 확인 없이 지운다. undo가 있는 편집기에서 모든 삭제를 확인받으면 방해다.
 * 객체가 있으면 **함께 사라진다는 사실**을 알려야 한다.
 */
const pendingPageDelete = ref<number | null>(null)

function requestRemovePage(index: number) {
  pageMenu.value = null
  if (props.readOnly) return

  const page = pages.value[index]
  if (!page) return

  if (pages.value.length <= 1) {
    toolError.value = t.value('error.minPages')
    return
  }

  if (page.objects.length > 0) {
    pendingPageDelete.value = index
    return
  }
  onRemovePage(index)
}

function confirmRemovePage() {
  const index = pendingPageDelete.value
  pendingPageDelete.value = null
  if (index !== null) onRemovePage(index)
}

/**
 * 드래그로 페이지 순서를 바꾼다.
 *
 * 보고 있던 페이지를 따라간다. 인덱스만 유지하면 순서 변경 후 다른 페이지가 화면에 나타나
 * 사용자가 방향을 잃는다.
 */
function onReorderPage(from: number, to: number) {
  if (props.readOnly) return
  const movedId = pages.value[from]?.id
  if (!run('move page', movePage(from, to))) return
  const next = movedId ? pages.value.findIndex((p) => p.id === movedId) : -1
  if (next >= 0 && from === view.value.currentPageIndex) nav.goTo(next)
  else nav.reclamp()
}

function onAddBlankPage() {
  if (props.readOnly) return
  try {
    if (run('add blank page', insertBlankPage(currentPageIndex.value))) {
      nav.goTo(currentPageIndex.value + 1)
    }
  } catch {
    importError.value = t.value('error.pageLimit')
  }
}

/* --------------------------------------------------------- 객체 동작 -- */

function onDuplicateSelection() {
  if (props.readOnly || selectedObjectIds.value.length === 0) return
  const pageIndex = view.value.currentPageIndex
  const before = doc.value
  try {
    if (run('duplicate objects', duplicateObjects(pageIndex, selectedObjectIds.value))) {
      // 복제 직후에는 새 객체가 선택돼 있어야 바로 옮길 수 있다.
      selectedObjectIds.value = newIdsAfterDuplicate(before, doc.value, pageIndex)
    }
  } catch (err) {
    toolError.value = err instanceof AnswerBoxLimitError ? t.value('error.boxLimit') : String(err)
  }
}

/** 객체 삭제. 대상을 주지 않으면 현재 선택을 지운다. */
function onDeleteSelection(ids: readonly string[] = selectedObjectIds.value) {
  if (props.readOnly || ids.length === 0) return
  if (run('remove objects', removeObjects(view.value.currentPageIndex, ids))) {
    selectedObjectIds.value = selectedObjectIds.value.filter((id) => !ids.includes(id))
  }
}

/** 인스펙터 편집. 객체 속성을 부분 갱신한다. */
function onInspectorUpdate(objectId: string, patch: Partial<PDFCanvasObject>) {
  if (props.readOnly) return
  run('edit object', updateObject(view.value.currentPageIndex, objectId, patch))
}

/** 선택된 객체들. 인스펙터가 유형별 패널로 분기하는 데 쓴다. */
const selectedObjects = computed(() =>
  currentObjects.value.filter((o) => selectedObjectIds.value.includes(o.id)),
)

/** 방향키 이동. 커맨드 한 번이므로 연속 입력도 각각 undo된다. */
function nudgeSelection(dx: number, dy: number) {
  if (props.readOnly || selectedObjectIds.value.length === 0) return
  const page = nav.currentPage.value
  if (!page) return
  const rects = new Map<string, Rect>()
  for (const id of selectedObjectIds.value) {
    const obj = page.objects.find((o) => o.id === id)
    if (!obj) continue
    rects.set(
      id,
      moveRect(obj.rect, { dx, dy }, page.size, obj.type, {
        rotation: obj.rotation ?? 0,
      }),
    )
  }
  run('nudge objects', transformObjects(view.value.currentPageIndex, rects))
}

/* ------------------------------------------------------------- 검증·내보내기 -- */

/**
 * 문서 전체 검증. 인스펙터 경고와 같은 규칙을 쓴다 (PLAN 12).
 *
 * 문서가 바뀔 때마다 다시 계산한다. 500페이지 문서에서도 객체 상한이 200개라 비용이 작다.
 */
const validation = computed(() => validateDoc(doc.value))

/** 내보내기를 막는 객체들. 캔버스에서 테두리로 표시한다. */
const invalidIds = computed(() => invalidObjectIds(validation.value))

/** 내보내기 시도 후 남는 안내 문구. */
const exportError = ref<string | null>(null)

/**
 * 검증을 통과한 내보내기 payload.
 *
 * 호스트가 `ExportDialog` 를 쓰지 않고 직접 팝업을 띄우는 경우에도 `request-export` 이벤트로
 * 같은 값을 받는다. 이 ref는 내장 팝업을 쓸 때만 의미가 있다.
 */
const exportPayload = ref<ExportPayload | null>(null)

/**
 * 내보내기 버튼. 검증에 실패하면 팝업을 열지 않고 문제가 있는 첫 객체로 데려간다 (기획 3.5).
 */
function onRequestExport() {
  exportError.value = null
  const result = guardExport(doc.value)

  if (!result.ok) {
    const issue = result.firstIssue
    if (issue?.pageIndex !== null && issue?.pageIndex !== undefined) nav.goTo(issue.pageIndex)
    if (issue?.objectId) {
      selectedObjectIds.value = [issue.objectId]
      // 확대 상태에서 문제 객체가 화면 밖이면 선택만으로는 알 수 없다 (기획 3.5).
      const target = nav.currentPage.value?.objects.find((o) => o.id === issue.objectId)
      if (target) void stage.scrollRectIntoView(target.rect)
    }
    exportError.value = t.value('error.exportBlocked', { count: result.invalidIds.size })
    return
  }

  exportPayload.value = result.payload
  emit('requestExport', result.payload!)
}

/** 페이지가 있으면 버튼을 활성화한다. 검증 실패는 클릭 후 안내한다 — 왜 막혔는지 알려야 한다. */
const canExport = computed(() => pageCount.value > 0)

/* ------------------------------------------------------------- 공개 API -- */

/**
 * 호스트가 프로그램으로 편집기를 조작할 수 있는 지점 (PLAN 8).
 *
 * `requestExport` 는 상단바 버튼이 프로토타입 저장으로 대체된 동안에도 남아 있다. 호스트가 자기
 * UI에서 내보내기를 트리거할 수 있고, 서버가 준비되면 버튼만 되돌리면 된다 (PLAN 18.5).
 */
defineExpose({
  requestExport: onRequestExport,
  validateForExport: () => guardExport(doc.value),
  zoomTo: (scale: number) => stage.zoomTo(scale),
  fitWidth: () => stage.setFitMode('width'),
  fitPage: () => stage.setFitMode('page'),
  goToPage: (index: number) => nav.goTo(index),
  goToPageId: (pageId: string) => nav.goToPageId(pageId),
  flushSave: () => engine.flushSave(),
  promoteBackgrounds: () => engine.promoteBackgrounds(),
})

/* --------------------------------------------------- 프로토타입 저장 ⚠️ -- */

/**
 * ⚠️ **프로토타입 저장.** 실서버가 붙으면 이 블록과 `src/prototype/` 을 함께 삭제한다.
 *
 * localStorage에 문서와 이미지(base64)를 넣어, 아직 없는 뷰어가 나중에 조합해 띄울 수 있게 한다.
 * 상단바 버튼이 [내보내기] 대신 이걸 부른다 — 과제 생성 API가 없어 내보내기는 빈 팝업만 뜬다.
 *
 * 되돌리는 방법은 `src/prototype/README.md` 참고.
 */
const manualSaving = ref(false)

async function onManualSave() {
  if (manualSaving.value || pageCount.value === 0) return
  manualSaving.value = true
  toolError.value = null
  try {
    const result = await savePrototype(doc.value)
    // 저장 결과는 콘솔로만 알린다. 프로토타입 동작이라 UI를 늘리지 않는다.
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
        : `[prototype] 저장 실패: ${err instanceof Error ? err.message : String(err)}`
    console.error(err)
  } finally {
    manualSaving.value = false
  }
}
</script>

<template>
  <div class="pck-editor" :class="{ 'is-readonly': props.readOnly }">
    <TopBar
      :title="doc.title"
      :save-state="saveState"
      :can-undo="canUndo"
      :can-redo="canRedo"
      :can-save="canExport"
      :saving="manualSaving"
      :t="t"
      @back="emit('back')"
      @update:title="onTitleChange"
      @undo="undo"
      @redo="redo"
      @manual-save="onManualSave"
    />

    <div
      class="pck-body"
      :class="{ 'is-resizing': panels.resizing.value !== null }"
      :style="bodyStyle"
    >
      <PageThumbList
        :pages="pages"
        :current-index="view.currentPageIndex"
        :read-only="props.readOnly"
        :t="t"
        @select="nav.goTo"
        @add-file="openUpload"
        @add-blank="onAddBlankPage"
        @duplicate="onDuplicatePage"
        @remove="requestRemovePage"
        @reorder="onReorderPage"
        @contextmenu="openPageMenu"
      />

      <!-- 패널 사이의 드래그 핸들. 얇은 요소지만 히트 영역은 CSS에서 넓힌다. -->
      <div
        class="pck-resizer"
        role="separator"
        aria-orientation="vertical"
        :aria-label="t('panel.resizePageList')"
        @pointerdown="panels.startResize('pageList', $event)"
        @dblclick="panels.reset()"
      />

      <main class="pck-main">
        <template v-if="pageCount > 0">
          <Toolbar
            :active-tool="view.activeTool"
            :enabled="!props.readOnly && !!nav.currentPage.value"
            :has-selection="view.selectedObjectIds.length > 0"
            :t="t"
            @update:active-tool="(tool: ToolId) => (view.activeTool = tool)"
            @duplicate="onDuplicateSelection"
            @remove="() => onDeleteSelection()"
          />
          <PageMeta
            :current="nav.currentPageNumber.value"
            :total="pageCount"
            :size="nav.currentPage.value?.size ?? null"
          />
        </template>

        <!-- position: relative wrapper: the zoom control must not scroll away
             with the page, so it sits outside the scroll container (PLAN 6.1). -->
        <div class="pck-stage-wrap">
          <CanvasStage
            v-if="pageCount > 0"
            ref="stageComp"
            :page="nav.currentPage.value"
            :scale="stage.scale.value"
            :pan-armed="view.panArmed"
            :panning="panning"
            :tool-active="view.activeTool !== 'select'"
            @wheel-zoom="(d, a) => stage.zoomByWheel(d, a)"
            @page-pointer-down="onPagePointerDownRouted"
            @page-dblclick="onPageDoubleClick"
          >
            <template #objects>
              <ObjectView
                v-for="obj in currentObjects"
                :key="obj.id"
                :object="obj"
                :selected="view.selectedObjectIds.includes(obj.id)"
                :invalid="invalidIds.has(obj.id)"
                :preview-rect="pointer.previewRects.value.get(obj.id) ?? null"
                :preview-rotation="
                  pointer.previewRotation.value?.id === obj.id
                    ? pointer.previewRotation.value.deg
                    : null
                "
                :editing="editingObjectId === obj.id"
                :question-number="questionNumbers.get(obj.id)?.display ?? null"
                @edit-text="(v: string) => onEditText(obj.id, v)"
              />
            </template>

            <template #overlay>
              <SelectionOverlay
                v-if="viewport"
                :viewport="viewport"
                :selected-rects="selectedRects"
                :preview="pointer.preview.value"
                :handle-rect="handleRect"
                :rotatable="rotatable"
                :handle-rotation="handleRotation"
                @grab-handle="onHandleGrab"
                @grab-rotate="pointer.onRotateDown"
              />
            </template>
          </CanvasStage>
          <EmptyState v-else :t="t" @import="openUpload" />

          <p v-if="toolError || exportError" class="pck-tool-error" role="alert">
            {{ toolError ?? exportError }}
          </p>

          <StageControls
            v-if="pageCount > 0"
            :percent="stage.percent.value"
            :can-zoom-in="stage.canZoomIn.value"
            :can-zoom-out="stage.canZoomOut.value"
            :presets="EDITOR_DEFAULTS.zoom.presets"
            :t="t"
            @step="(d) => stage.zoomStep(d)"
            @set="(s) => stage.zoomTo(s)"
            @fit-width="() => stage.setFitMode('width')"
            @fit-page="() => stage.setFitMode('page')"
          />
        </div>
      </main>

      <div
        class="pck-resizer"
        role="separator"
        aria-orientation="vertical"
        :aria-label="t('panel.resizeInspector')"
        @pointerdown="panels.startResize('inspector', $event)"
        @dblclick="panels.reset()"
      />

      <Inspector
        :selected="selectedObjects"
        :auto-number="
          selectedObjectIds.length === 1
            ? (questionNumbers.get(selectedObjectIds[0]!)?.number.toString() ?? null)
            : null
        "
        :t="t"
        :read-only="props.readOnly"
        @update="onInspectorUpdate"
        @remove="(id) => onDeleteSelection([id])"
        @rotate="(id, deg) => run('rotate object', setRotation(view.currentPageIndex, id, deg))"
      />
    </div>

    <PageContextMenu
      v-if="pageMenu"
      :x="pageMenu.x"
      :y="pageMenu.y"
      :page-index="pageMenu.index"
      :can-delete="pageCount > 1"
      :t="t"
      @duplicate="
        (i) => {
          pageMenu = null
          onDuplicatePage(i)
        }
      "
      @add-blank-after="
        (i) => {
          pageMenu = null
          nav.goTo(i)
          onAddBlankPage()
        }
      "
      @remove="requestRemovePage"
      @close="pageMenu = null"
    />

    <ConfirmDialog
      v-if="pendingPageDelete !== null"
      :message="t('confirm.deletePage')"
      :confirm-label="t('confirm.ok')"
      :cancel-label="t('confirm.cancel')"
      danger
      @confirm="confirmRemovePage"
      @cancel="pendingPageDelete = null"
    />

    <UploadDialog
      v-if="uploadOpen"
      :progress="importProgress"
      :error="importError"
      :t="t"
      @close="uploadOpen = false"
      @pick="onPickFile"
      @cancel="cancelImport"
    />
  </div>
</template>
