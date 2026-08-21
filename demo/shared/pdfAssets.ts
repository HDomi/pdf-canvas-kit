/**
 * pdf.js 런타임 자산 경로 (데모·예제 공통).
 *
 * ## 왜 절대 경로를 쓰지 않는가
 *
 * pdf.js 는 CMap·표준 폰트·wasm 을 **런타임에 URL 로** 가져온다. `/pdfjs/...` 로 하드코딩하면
 * 사이트가 루트에 있을 때만 동작하고, GitHub Pages 처럼 `/<repo>/` 서브패스에 올라가면 전부
 * 404 가 된다 — 그때 증상은 "PDF 는 열리는데 한글만 사라진다" 라서 원인을 찾기 어렵다.
 *
 * `import.meta.env.BASE_URL` 은 vite 가 빌드 시점의 `base` 로 치환한다. dev 에서는 `/`,
 * Pages 빌드에서는 `/pdf-canvas-kit/` 이 된다.
 *
 * ⚠️ **디렉토리 경로의 끝 슬래시는 필수다.** pdf.js 가 파일명을 이어 붙이므로 빠뜨리면
 * `cmapsAdobe-Korea1-UCS2.bcmap` 같은 경로가 만들어진다.
 */
import { configurePdfResources } from '@h_domi/pdf-canvas-kit'

/** `BASE_URL` 은 항상 슬래시로 끝난다 (vite 보장). 중복 슬래시를 만들지 않는다. */
const base = import.meta.env.BASE_URL

export function configureDemoPdfAssets(): void {
  configurePdfResources({
    workerSrc: `${base}pdfjs/pdf.worker.mjs`,
    cMapUrl: `${base}pdfjs/cmaps/`,
    standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
    wasmUrl: `${base}pdfjs/wasm/`,
    iccUrl: `${base}pdfjs/iccs/`,
  })
}
