/**
 * pdf.js 런타임 자산 연결 (worker, CMap, 표준 폰트, wasm 디코더).
 *
 * ## 이 파일이 존재하는 이유
 *
 * pdf.js는 자기 완결적이지 않다. worker 외에도 네 종류의 파일을 런타임에 URL로 가져온다.
 *
 * | 자산                  | 필요한 곳                                              |
 * | --------------------- | ------------------------------------------------------ |
 * | `cMapUrl`             | CID 키 폰트 — **모든 CJK 텍스트**(한국어·일본어·중국어) |
 * | `standardFontDataUrl` | PDF가 임베드하지 않은 14개 표준 폰트                    |
 * | `wasmUrl`             | JBIG2 / OpenJPEG 이미지 디코더, 색 관리                 |
 * | `iccUrl`              | ICC 색 프로파일                                        |
 *
 * `cMapUrl` 이 없으면 한국어 워크시트의 도형과 이미지는 완벽하게 렌더되면서 **글리프만 전부
 * 사라진다** — 조용하고 놓치기 쉬운 실패다. 그래서 기본 동작을 보수적으로 잡았다.
 * 아무것도 설정되지 않았으면 빈 것처럼 보이는 페이지를 만들지 않고 크게 경고한다.
 *
 * worker도 같은 문제를 가진 다섯 번째 자산이다.
 *
 * ## 호스트 앱이 공급하는 방법
 *
 * 파일들은 `node_modules/pdfjs-dist/` 안에 들어 있다. 번들러는 *디렉토리* URL을 재작성하지
 * 못하므로, 서빙되는 폴더로 복사하고 base URL을 주입해야 한다. Nuxt 설정법은
 * ARCHITECTURE.md의 "pdf.js 런타임 자산" 절 참고. 이 저장소의 데모는 `npm run copy:pdfjs` 로
 * `demo/public/pdfjs/` 에 복사한다.
 *
 * ```ts
 * configurePdfResources({
 *   workerSrc: '/pdfjs/pdf.worker.mjs',
 *   cMapUrl: '/pdfjs/cmaps/',
 *   standardFontDataUrl: '/pdfjs/standard_fonts/',
 *   wasmUrl: '/pdfjs/wasm/',
 *   iccUrl: '/pdfjs/iccs/',
 * })
 * ```
 *
 * ## worker를 자동 해석하지 않는 이유
 *
 * 이전 버전은 `new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url)` 로 해석했다.
 * 애플리케이션 빌드에서는 동작하지만 **라이브러리** 빌드에서 Vite는 이걸 자산으로 취급해
 * 3MB worker를 base64 data URL로 인라인한다 — `assetsInlineLimit` 과 `external` 둘 다 막지
 * 못한다. 결과적으로 호스트의 pdfjs-dist 버전과 어긋날 수 있는 worker 빌드가 고정된다.
 *
 * 그래서 worker URL은 호스트에게 요구한다. 앱에서는 두 방법 중 하나를 쓴다.
 *
 * ```ts
 * // Vite/Nuxt: 번들러가 emit 하게 한다
 * import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url'
 *
 * // 또는 정적 파일로 서빙한다 (scripts/copy-pdfjs-assets.mjs 참고)
 * const workerSrc = '/pdfjs/pdf.worker.mjs'
 * ```
 */
import { GlobalWorkerOptions } from 'pdfjs-dist'

/**
 * pdf.js 런타임 자산의 base URL. 모든 값은 슬래시로 끝나야 한다 —
 * pdf.js가 파일명을 그대로 이어 붙이며 슬래시를 넣어 주지 않는다.
 */
export interface PdfResourceUrls {
  /**
   * packed `.bcmap` 파일 디렉토리 (`pdfjs-dist/cmaps/`).
   * CJK 텍스트에 필수다. 없으면 한글 글리프가 조용히 사라진다.
   */
  cMapUrl?: string
  /**
   * 14개 표준 폰트의 `.pfb` 대체 파일 디렉토리 (`pdfjs-dist/standard_fonts/`).
   * PDF가 Helvetica 같은 폰트를 임베드하지 않고 참조할 때 필요하다.
   */
  standardFontDataUrl?: string
  /** `.wasm` 디코더 디렉토리 (`pdfjs-dist/wasm/`). JBIG2/JPEG2000 스캔에 필요하다. */
  wasmUrl?: string
  /** ICC 프로파일 디렉토리 (`pdfjs-dist/iccs/`). 색 정확도에만 영향을 준다. */
  iccUrl?: string
}

export interface PdfWorkerConfig {
  /**
   * `pdf.worker.mjs` 의 URL. **필수** — 라이브러리가 스스로 해석할 수 없다(모듈 주석 참고).
   * 없으면 변환 시 {@link PdfWorkerNotConfiguredError} 를 던진다.
   */
  workerSrc?: string
  /** worker 대신 메인 스레드에서 렌더한다. 느리다. 최후의 수단. */
  disableWorker?: boolean
}

export type PdfRuntimeConfig = PdfResourceUrls & PdfWorkerConfig

let resources: PdfResourceUrls = {}
let workerConfig: PdfWorkerConfig = {}
let workerConfigured = false
let warnedMissingCMap = false

/**
 * pdf.js 런타임 자산과 worker 옵션을 등록한다. 앱 시작 시 첫 변환 전에 한 번 호출한다.
 *
 * 값은 병합되므로 worker와 자산 URL을 따로 설정할 수 있다.
 */
export function configurePdfResources(config: PdfRuntimeConfig): void {
  const { workerSrc, disableWorker, ...urls } = config
  resources = { ...resources, ...urls }
  if (workerSrc !== undefined || disableWorker !== undefined) {
    workerConfig = {
      ...workerConfig,
      ...(workerSrc !== undefined ? { workerSrc } : {}),
      ...(disableWorker !== undefined ? { disableWorker } : {}),
    }
    workerConfigured = false
  }
}

/** @deprecated {@link configurePdfResources} 를 쓴다. worker만 설정할 때 읽기 좋아 남겨 둔 별칭이다. */
export const configurePdfWorker = configurePdfResources

/**
 * 설정된 자산에 대응하는 `getDocument` 파라미터를 돌려준다.
 *
 * `cMapUrl` 이 없으면 한 번 경고한다. 그로 인한 실패(CJK 문서에서 텍스트가 사라짐)가
 * 설정 누락이 아니라 렌더링 버그처럼 보이기 때문이다.
 */
export function pdfResourceParams(): {
  cMapUrl?: string
  cMapPacked: boolean
  standardFontDataUrl?: string
  wasmUrl?: string
  iccUrl?: string
} {
  if (!resources.cMapUrl && !warnedMissingCMap) {
    warnedMissingCMap = true
    console.warn(
      '[worksheet] no cMapUrl configured: text in CJK (Korean/Japanese/Chinese) PDFs will not render. ' +
        'Call configurePdfResources({ cMapUrl, standardFontDataUrl, wasmUrl }) — see ARCHITECTURE.md.',
    )
  }
  return {
    ...(resources.cMapUrl ? { cMapUrl: resources.cMapUrl } : {}),
    // 함께 배포되는 CMap은 바이너리(packed) 형식이다.
    cMapPacked: true,
    ...(resources.standardFontDataUrl
      ? { standardFontDataUrl: resources.standardFontDataUrl }
      : {}),
    ...(resources.wasmUrl ? { wasmUrl: resources.wasmUrl } : {}),
    ...(resources.iccUrl ? { iccUrl: resources.iccUrl } : {}),
  }
}

/** 현재 자산 설정. 진단 화면용. */
export function getPdfResources(): Readonly<PdfResourceUrls> {
  return { ...resources }
}

/**
 * 설정된 worker 경로를 설치한다. 여러 번 호출해도 안전하다.
 *
 * @throws {PdfWorkerNotConfiguredError} `workerSrc` 가 주어지지 않았을 때. 나중에 정체불명의
 * pdf.js 오류로 드러나는 대신, 실패가 스스로 해결 방법을 알려주게 한다.
 */
export function ensurePdfWorker(): void {
  if (workerConfigured) return

  if (workerConfig.disableWorker) {
    console.warn(
      '[worksheet] pdf.js worker disabled; rendering on the main thread will block the UI',
    )
    // pdf.js는 빈 workerSrc를 "같은 프로세스에서 실행"으로 해석한다.
    GlobalWorkerOptions.workerSrc = ''
    workerConfigured = true
    return
  }

  if (workerConfig.workerSrc) {
    GlobalWorkerOptions.workerSrc = workerConfig.workerSrc
    workerConfigured = true
    return
  }

  throw new PdfWorkerNotConfiguredError()
}

/** worker URL이 주어지지 않았을 때 던진다. 메시지에 해결 방법이 담겨 있다. */
export class PdfWorkerNotConfiguredError extends Error {
  constructor() {
    super(
      '[worksheet] pdf.js worker URL is not configured. Call configurePdfResources({ workerSrc }) ' +
        "before converting — e.g. import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url', " +
        "or serve the file and pass '/pdfjs/pdf.worker.mjs'. See ARCHITECTURE.md section 4.",
    )
    this.name = 'PdfWorkerNotConfiguredError'
  }
}

/** 테스트·데모용 헬퍼. 이전 설정을 모두 잊는다. */
export function resetPdfRuntime(): void {
  resources = {}
  workerConfig = {}
  workerConfigured = false
  warnedMissingCMap = false
}
