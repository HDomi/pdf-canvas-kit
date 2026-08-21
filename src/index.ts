/**
 * `@h_domi/pdf-canvas-kit` — 프레임워크 무관 코어.
 *
 * Vue 컴포넌트는 `/vue` 서브패스에 있다.
 * ```ts
 * import { PDFCanvasEditor } from '@h_domi/pdf-canvas-kit/react'   // 또는 /vue
 * ```
 *
 * 이 엔트리는 문서 모델, 좌표 헬퍼, PDF 파이프라인, 호스트가 주입하는 port들을 내보낸다.
 * 여기에는 Vue가 전혀 등장하지 않으므로, 나중에 다른 렌더러의 기반으로도 쓸 수 있다.
 *
 * 각 조각이 어떻게 맞물리고 어떤 값을 조정할 수 있는지는 ARCHITECTURE.md 참고.
 */

/* ------------------------------------------------------------------ 모델 -- */

export type {
  /** 포인트 단위 — 1/72 inch. 저장되는 모든 좌표의 단위. */
  Pt,
  Rect,
  Size,
  BackgroundOrigin,
  PageBackground,
  PageSource,
  PDFCanvasPage,
  PDFCanvasDoc,
  /** 뷰어가 받는 브랜드 타입 (D14 · D28). `toPublicDoc()` 또는 `asPublicDoc()` 으로만 만든다. */
  PublicPDFCanvasDoc,
  PDFCanvasObject,
  PDFCanvasObjectType,
  TextObject,
  ShapeObject,
  ShapeKind,
  MaskObject,
  BoxStyle,
  CustomObject,
} from './core/model/types'

/* ----------------------------------------------------------------- 설정 -- */

export { LIMITS, EDITOR_DEFAULTS, RENDER_DEFAULTS, LAYOUT_DEFAULTS } from './core/config/defaults'
export type { Limits, EditorDefaults, RenderDefaults, LayoutDefaults } from './core/config/defaults'

/* --------------------------------------------------------------- 좌표계 -- */

export { matchPaper, formatPaperLabel } from './core/geometry/paperSize'
export type { PaperMatch, PaperLabelStrings, Orientation } from './core/geometry/paperSize'

export {
  clientToPage,
  pageToFrame,
  rectToFrame,
  clientDeltaToPage,
  frameSize,
  round2,
  roundRect,
} from './core/geometry/units'
export type { PageViewport, Point, Delta } from './core/geometry/units'

export {
  clamp,
  clampIntoPage,
  constrainRect,
  minSizeFor,
  rectFromPoints,
  isMeaningfulDrag,
  snap,
} from './core/geometry/constrain'

export {
  resizeRect,
  moveRect,
  rotationFromPointer,
  HANDLE_IDS,
  HANDLE_ANCHORS,
  HANDLE_CURSORS,
  ROTATE_HANDLE_OFFSET_PX,
} from './core/geometry/handles'
export type { HandleId, ResizeOptions } from './core/geometry/handles'

export {
  isPolygonShape,
  isLineShape,
  polygonPoints,
  arrowHeadSize,
  lineShapeHeight,
  normalizeShapeRect,
} from './core/geometry/shapes'
export type { PolygonShape } from './core/geometry/shapes'

export {
  hitTestObject,
  pickObject,
  pickObjectsInRect,
  rectsIntersect,
  rectCenter,
  rotatePoint,
} from './core/geometry/hitTest'

/* ------------------------------------------------------------- 상태·커맨드 -- */

export { createStore } from './core/store/createStore'
export type { Store, Unsubscribe } from './core/store/createStore'
export { createHistory } from './core/store/history'
export type { History, HistoryEntry, HistoryOptions } from './core/store/history'

export * from './core/commands'

export { createPDFCanvasEngine } from './core/engine'
export type {
  PDFCanvasEngine,
  EngineOptions,
  EnginePorts,
  ImportProgress,
  ImportResult,
} from './core/engine'

export {
  createPDFCanvasDoc,
  createPage,
  createBlankPageLike,
  UNTITLED_TITLE,
  A4_PT,
} from './core/model/defaults'
export {
  boxStyleToCss,
  mergeBoxStyle,
  hasBoxStyle,
  DEFAULT_BOX_STROKE_WIDTH,
} from './core/model/boxStyle'
export type { BoxStyleCss, BoxStylePatch } from './core/model/boxStyle'
export {
  serializeDoc,
  deserializeDoc,
  isSerializable,
  findBlobBackgrounds,
  BlobBackgroundError,
} from './core/model/serialize'
export {
  createViewState,
  clampPageIndex,
  clampScale,
  stepZoom,
  kindFromTool,
  toolForKind,
} from './core/model/viewState'
export type { EditorViewState, FitMode, ToolId, SaveState } from './core/model/viewState'

/* ------------------------------------------------- 커스텀 객체 (D25) -- */

export { asPublicDoc } from './core/model/types'

/* --------------------------------------------- 프레임워크 없이 쓰는 facade -- */

/*
 * 프레임워크 래퍼(`@h_domi/pdf-canvas-kit/react` · `/vue`)를 쓰지 않는 소비자의 진입점이다.
 * 래퍼는 이 두 함수를 감싸기만 한다 (ARCHITECTURE §17).
 */
export { createPDFCanvasEditor } from './dom/createEditor'
export type { EditorHandle, EditorProps } from './dom/createEditor'
/* 다이얼로그 위임 (D31). 호스트가 자기 모달을 쓰려면 이 두 타입이 필요하다. */
export type { ConfirmRequest, ImportState } from './controller/editor'
export { createPDFCanvasViewer } from './dom/createViewer'
export type { ViewerHandle, ViewerProps } from './dom/createViewer'
export { defineObjectType, createObjectTypeRegistry, UNKNOWN_KIND_ISSUE } from './core/objectTypes'
export type {
  ObjectTypeDef,
  AnyObjectTypeDef,
  ObjectTypeRegistry,
  ObjectRenderContext,
  ObjectSize,
} from './core/objectTypes'

/* ------------------------------------------------------------------ 검증 -- */

export {
  validateDoc,
  validateObject,
  invalidObjectIds,
  ISSUE_MESSAGE_KEYS,
} from './core/validation/rules'
export type { IssueCode, ValidationIssue, ValidationResult } from './core/validation/rules'

/* ---------------------------------------------------------------- i18n -- */

/* ------------------------------------------------------------------ 유틸 -- */

export { createId, copyText } from './core/util/id'

export { DEFAULT_STRINGS, configureStrings, resetStrings, text } from './core/config/strings'
/* 아이콘 교체 (D32). 글리프는 `strings` 의 `icon.*`, 노드는 여기, 컴포넌트는 래퍼의 renderIcon. */
export { configureIcons, resetIcons } from './core/config/icons'
export type { IconName, IconFactory } from './core/config/icons'
/* 글꼴 목록 (2026.08.21). 패키지는 웹폰트를 싣지 않는다 — `core/config/fonts.ts` 참고. */
export { DEFAULT_FONTS, configureFonts, resetFonts, fontOptions } from './core/config/fonts'
export type { FontOption } from './core/config/fonts'
export type { StringKey } from './core/config/strings'

export { createPointerMachine } from './core/interaction/pointerMachine'
export type {
  PointerMachine,
  PointerPhase,
  PointerCommit,
  PointerInput,
  MachineContext,
} from './core/interaction/pointerMachine'
export {
  createObjectForTool,
  defaultRectAt,
  defaultSizeForTool,
  isCreationTool,
} from './core/interaction/tools'
export type { CreationToolId } from './core/interaction/tools'

/* ------------------------------------------------------------------ ports -- */

export type {
  AssetPort,
  AssetMeta,
  PersistedAsset,
  ConverterPort,
  ConvertOptions,
  ConvertProgress,
  ConvertErrorCode,
  RasterPage,
  StoragePort,
} from './core/ports'
export { ConvertError, noopStoragePort, createConsoleStoragePort } from './core/ports'
export type { ConsoleStorageOptions } from './core/ports'

export { createBlobAssetPort } from './core/assets/blobAsset'
export type { BlobAssetPort } from './core/assets/blobAsset'
export { createS3AssetPort, AssetUploadError } from './core/assets/s3Asset'
export type { S3AssetPortOptions, UploadTarget } from './core/assets/s3Asset'
export { promoteBackgrounds, PromoteAbortError } from './core/assets/promoteBackgrounds'
export type { PromoteOptions, PromoteProgress } from './core/assets/promoteBackgrounds'
export { createDebouncedSaver } from './core/autosave/debouncedSaver'
export type { DebouncedSaver, SaverOptions } from './core/autosave/debouncedSaver'

/* -------------------------------------------------------------------- pdf -- */

export {
  configurePdfResources,
  configurePdfWorker,
  ensurePdfWorker,
  getPdfResources,
  pdfResourceParams,
  resetPdfRuntime,
  PdfWorkerNotConfiguredError,
} from './core/pdf'
export type { PdfResourceUrls, PdfWorkerConfig, PdfRuntimeConfig } from './core/pdf'

export {
  loadPdf,
  isPdf,
  fileExtension,
  MAX_FILE_BYTES,
  MAX_DOC_PAGES,
  SUPPORTED_EXTENSIONS,
} from './core/pdf'
export type { LoadedPdf, LoadPdfOptions } from './core/pdf'

export {
  createPdfjsConverter,
  rasterizePage,
  createRasterTarget,
  normalizeRotation,
  TARGET_PX,
  MAX_SCALE,
  DEFAULT_MIME,
  DEFAULT_QUALITY,
} from './core/pdf'
export type {
  PdfjsConverterOptions,
  RasterizeOptions,
  RasterizeResult,
  RasterTarget,
} from './core/pdf'

export { diagnoseFonts, capturePdfWarnings } from './core/pdf'
export type {
  FontUsage,
  PageTextReport,
  DiagnosisReport,
  WarningGroup,
  KnownIssue,
} from './core/pdf'
