/**
 * Vue 엔트리 — `pdf-canvas-kit/vue`.
 *
 * ```ts
 * import { PDFCanvasEditor } from 'pdf-canvas-kit/vue'
 * ```
 *
 * `PDFCanvasEditor` 는 클라이언트 전용이다. pdf.js·포인터 이벤트·`createObjectURL` 이 브라우저
 * API이므로 Nuxt에서는 `<ClientOnly>` 로 감싸야 한다 (PLAN D16).
 *
 * `PDFCanvasViewer` 는 아직 구현되지 않았다 (PLAN M10).
 */
import '../styles/tokens.css'
import '../styles/editor.css'

export { default as PDFCanvasEditor } from './PDFCanvasEditor.vue'

/**
 * 과제 내보내기 팝업. **옵션 컴포넌트다.**
 *
 * 편집기는 검증만 하고 `request-export` 를 발행한다. 과제 생성·Class 목록·링크·QR은 호스트의
 * 서버 도메인이므로(PLAN 10), 자기 팝업을 쓰고 싶으면 이 컴포넌트를 쓰지 않아도 된다.
 */
export { default as ExportDialog } from './editor/dialogs/ExportDialog.vue'
export type {
  AccessLevel,
  SubmitLimit,
  ExportSettings,
  ExportResult,
} from './editor/dialogs/ExportDialog.vue'

export type { UseEngine } from './composables/useEngine'
export { useEngine } from './composables/useEngine'

import type { AssetPort, ConverterPort, I18nPort, StoragePort } from '../core/ports'

/** 호스트가 주입하는 의존성. 모두 optional이며 빠진 것은 내장 기본값이 채운다. */
export interface PDFCanvasPorts {
  /** 래스터화된 페이지 이미지가 사는 곳. 기본은 세션 한정 blob URL. */
  asset?: AssetPort
  /** 문서 → 페이지 이미지. 기본은 브라우저 PDF 컨버터(PDF만). */
  converter?: ConverterPort
  /** 문서 영속화. 기본은 no-op이며 저장 배지가 `disabled` 로 표시된다. */
  storage?: StoragePort
  /** UI 문구. 기본은 내장 ko/en 표. */
  i18n?: I18nPort
}

export type PDFCanvasLocale = 'ko' | 'en'

/**
 * 시작 배율. 명시적 배율이거나, 스테이지 기준으로 계산되는 맞춤 모드.
 * 편집기 기본값은 `'fit-page'` 이며, 갓 불러온 페이지가 전체로 보인다.
 */
export type InitialScale = number | 'fit-width' | 'fit-page'

export type { SaveState, ToolId, FitMode, EditorViewState } from '../core/model/viewState'
