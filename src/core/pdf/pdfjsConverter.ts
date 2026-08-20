/**
 * 브라우저 측 PDF 컨버터 (PLAN 10.1).
 *
 * 페이지 전환이 즉시 이뤄지도록 모든 페이지를 미리 래스터화하고(PLAN D12), 루프가 끝나는 즉시
 * pdf.js 문서를 정리한다. 편집 세션 내내 붙들고 있으면 worker와 그 캐시를 이유 없이 살려 둔다.
 */
import type { ConvertOptions, ConverterPort, RasterPage } from '../ports/ConverterPort'
import { ConvertError } from '../ports/ConverterPort'
import {
  isPdf,
  loadPdf,
  MAX_DOC_PAGES,
  fileExtension,
  SUPPORTED_EXTENSIONS,
  type LoadPdfOptions,
} from './loadPdf'
import { createRasterTarget, rasterizePage, type RasterizeOptions } from './rasterize'

export interface PdfjsConverterOptions extends RasterizeOptions, LoadPdfOptions {
  /**
   * 이보다 페이지가 많은 파일은 아무것도 렌더하기 전에 거부한다.
   * @default MAX_DOC_PAGES (500, 기획 2.2)
   */
  maxPages?: number
}

/**
 * 브라우저 측 PDF 컨버터를 만든다.
 *
 * 실측 처리량은 A4 한 페이지당 약 17ms다(1654px, JPEG q.85, headless Chrome). 그래서 500페이지
 * 문서가 대략 9초에 변환된다. 이게 lazy가 아니라 전량 선변환을 택한 이유다. 페이지 전환이
 * 즉시가 되고, 관리할 부분 변환 상태가 없다 (PLAN D12, ARCHITECTURE §5).
 *
 * ⚠️ **메모리 (PLAN Q19)** — 전량 선변환이므로 배경 blob이 모두 살아 있다. 페이지당 약 400KB로
 * **500페이지면 약 200MB**다. 브라우저가 디스크로 내리지만, 극단 케이스에서 문제가 되면
 * `targetPx` 를 낮추거나(가장 효과가 크다) 비활성 페이지의 blob을 해제하는 전략이 필요하다.
 * 후자는 페이지 전환 지연을 만들므로 D12의 전제와 상충한다 — 그래서 지금은 도입하지 않았다.
 *
 * CJK 문서를 위해 pdf.js 런타임 자산 설정이 필요하다 — {@link ../pdf/resources.ts} 와
 * ARCHITECTURE §4 참고.
 */
export function createPdfjsConverter(options: PdfjsConverterOptions = {}): ConverterPort {
  const maxPages = options.maxPages ?? MAX_DOC_PAGES

  return {
    supports(file: File): boolean {
      return isPdf(file)
    },

    async convert(file: File, opts: ConvertOptions = {}): Promise<RasterPage[]> {
      if (!isPdf(file)) {
        // 지원 포맷 목록에 있으면 서버 변환이 가능하다는 뜻이고, 없으면 아예 불가다.
        const ext = fileExtension(file.name)
        throw new ConvertError(
          'unsupported-format',
          SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number])
            ? `${ext} needs a server-side converter`
            : `${ext || 'this file'} is not a supported format`,
        )
      }

      const { signal, onProgress } = opts
      const { pdf, dispose } = await loadPdf(file, {
        ...(options.useFontFace !== undefined ? { useFontFace: options.useFontFace } : {}),
        ...(options.skipResources !== undefined ? { skipResources: options.skipResources } : {}),
      })

      try {
        const total = pdf.numPages
        if (total > maxPages) {
          throw new ConvertError(
            'page-limit',
            `${file.name} has ${total} pages; the limit is ${maxPages}`,
          )
        }

        const target = createRasterTarget()
        const pages: RasterPage[] = []

        for (let i = 1; i <= total; i++) {
          if (signal?.aborted) throw new ConvertError('aborted', 'conversion cancelled')

          const page = await pdf.getPage(i)
          try {
            const r = await rasterizePage(page, target, options)
            pages.push({ ...r, pageIndex: i - 1 })
          } finally {
            // 페이지의 operator list와 이미지 캐시를 해제한다.
            page.cleanup()
          }

          onProgress?.({ ratio: i / total, page: i, total })
        }

        // 전체 페이지 비트맵을 붙들지 않도록 캔버스가 회수되게 한다.
        target.canvas.width = 0
        target.canvas.height = 0

        return pages
      } finally {
        await dispose()
      }
    },
  }
}
