/**
 * PDF의 텍스트·폰트 진단.
 *
 * ## 왜 필요한가
 *
 * "페이지는 렌더되는데 글자가 없다"는 화면상 똑같아 보이는 여러 원인을 갖고, 그 사이를 추측으로
 * 좁히려 하면 시간을 크게 버린다.
 *
 * 1. 애초에 텍스트가 아니다 — 스캔 페이지이고 폰트가 관여하지 않는다
 * 2. 텍스트는 있지만 폰트 로딩이 실패했다(빈 글리프 또는 `notdef`)
 * 3. predefined CMap을 쓰는 CID 폰트인데 CMap URL이 설정되지 않았다
 *    ({@link ./resources.ts} 참고)
 * 4. 글리프는 정상 렌더되는데 무언가가 가린다(흰 오버레이, 클리핑 경로)
 *
 * ## 여기서 신뢰할 수 있는 것
 *
 * `getTextContent()` 의 문자 수는 신뢰할 수 있고 1번을 나머지와 구분해 준다. 0자면 그 페이지에
 * 정말로 텍스트가 없다는 뜻이다.
 *
 * 반면 pdf.js는 폰트가 임베드됐는지 물어볼 공식 경로를 제공하지 않는다. `commonObjs` 로 닿는
 * `FontFaceObject` 는 분명히 임베드된 폰트에 대해서도 `data: null` 을 보고하는데, face를 등록할
 * 때 버퍼가 소비되기 때문이다. 그래서 이 모듈은 의도적으로 **폰트 식별자만** 보고하고
 * 임베드 여부나 subtype 판정은 하지 않는다. 확신에 찬 틀린 답은 무답보다 나쁘다.
 *
 * 2번과 3번에 유용한 신호는 pdf.js 자신의 경고이며, {@link capturePdfWarnings} 가 수집한다.
 */
import { OPS } from 'pdfjs-dist'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'

/** 페이지의 드로잉 연산자가 선택한 폰트. 식별자만 담는다 — 모듈 주석 참고. */
export interface FontUsage {
  /** pdf.js 내부 이름(예: `g_d0_f1`). pdf.js 경고 문구와 대조할 때 쓴다. */
  loadedName: string
  /**
   * PDF에 적힌 폰트 이름(예: `AAAAAA+AppleGothic`).
   * `XXXXXX+` 접두사는 서브셋을 뜻하며, 폰트가 임베드됐음을 시사한다.
   */
  name: string
}

export interface PageTextReport {
  /** 1-based 페이지 번호. */
  page: number
  /** `getTextContent()` 가 복원한 문자 수. 0이면 그 페이지에 텍스트가 없다. */
  charCount: number
  /** 앞 80자. 인코딩이 정상인지 눈으로 확인하는 용도. */
  sample: string
  /** 페이지의 텍스트 드로잉 항목 수. */
  textItems: number
  /** 페이지 연산자가 선택한 서로 다른 폰트들. */
  fonts: FontUsage[]
}

/** 중복을 합치고 개수를 센 pdf.js 경고. */
export interface WarningGroup {
  message: string
  count: number
}

/**
 * pdf.js 경고 문구에서 매칭한, 알려진 실패 유형.
 *
 * pdf.js는 원인을 분명히 말하지만 폰트마다 한 번씩 반복한다. 그래서 35종 폰트 문서에서는
 * 조치 가능한 한 줄이 똑같은 백 줄 아래 묻힌다.
 */
export interface KnownIssue {
  code: 'missing-cmap' | 'missing-standard-font' | 'missing-wasm' | 'font-load-failed'
  /** 무엇이 잘못됐고 무엇을 해야 하는지. */
  explain: string
  /** 매칭된 경고 개수. */
  count: number
}

export interface DiagnosisReport {
  pages: PageTextReport[]
  /** pdf.js가 낸 경고(중복 제거). */
  warnings: WarningGroup[]
  /** 알려진 원인. 빈도 높은 순. 매칭이 없으면 빈 배열. */
  issues: KnownIssue[]
  /** 검사한 모든 페이지에 텍스트가 전혀 없으면 true. */
  imageOnly: boolean
}

/**
 * 조치로 번역할 가치가 있는 경고 문구 패턴.
 *
 * 순서가 중요하다. CMap 누락도 일반적인 "폰트 로딩 실패" 줄을 함께 만들기 때문에,
 * 더 구체적인 패턴이 먼저 이겨야 한다.
 */
const ISSUE_PATTERNS: {
  code: KnownIssue['code']
  test: RegExp
  explain: string
}[] = [
  {
    code: 'missing-cmap',
    test: /cMapUrl/i,
    explain:
      'CMap 데이터가 없다. 이 PDF는 Adobe predefined CMap(예: KSCms-UHC-H)을 쓰는 CID 폰트를 참조하므로 ' +
      'cmaps/ 를 서빙하고 configurePdfResources({ cMapUrl }) 를 설정해야 글자가 렌더된다. ' +
      '폰트가 임베드돼 있어도 필요하다 — 인코딩 테이블은 폰트 안에 없다.',
  },
  {
    code: 'missing-standard-font',
    test: /standardFontDataUrl/i,
    explain:
      '표준 14폰트 데이터가 없다. standard_fonts/ 를 서빙하고 ' +
      'configurePdfResources({ standardFontDataUrl }) 를 설정한다.',
  },
  {
    code: 'missing-wasm',
    test: /wasm/i,
    explain:
      'wasm 디코더가 없다. JBIG2·JPEG2000으로 압축된 스캔 이미지가 렌더되지 않는다. ' +
      'wasm/ 을 서빙하고 configurePdfResources({ wasmUrl }) 를 설정한다.',
  },
  {
    code: 'font-load-failed',
    test: /font loading|translateFont|loadFont/i,
    explain:
      '폰트 로딩이 실패했다. 위 항목에 해당하지 않으면 폰트 자체가 손상됐을 수 있다. ' +
      '?fontface=off 로 아웃라인 렌더와 비교해 본다.',
  },
]

/** 동일한 경고를 묶고 {@link ISSUE_PATTERNS} 와 매칭한다. */
function summarizeWarnings(raw: string[]): { warnings: WarningGroup[]; issues: KnownIssue[] } {
  const counts = new Map<string, number>()
  for (const w of raw) counts.set(w, (counts.get(w) ?? 0) + 1)

  const warnings = [...counts.entries()]
    .map(([message, count]) => ({ message, count }))
    .sort((a, b) => b.count - a.count)

  const issueCounts = new Map<KnownIssue['code'], { explain: string; count: number }>()
  for (const { message, count } of warnings) {
    // 첫 매칭 패턴만 쓴다. CMap 누락이 일반 폰트 실패로 중복 보고되지 않게.
    const hit = ISSUE_PATTERNS.find((p) => p.test.test(message))
    if (!hit) continue
    const prev = issueCounts.get(hit.code)
    issueCounts.set(hit.code, { explain: hit.explain, count: (prev?.count ?? 0) + count })
  }

  const issues = [...issueCounts.entries()]
    .map(([code, v]) => ({ code, explain: v.explain, count: v.count }))
    .sort((a, b) => b.count - a.count)

  return { warnings, issues }
}

/**
 * 페이지 연산자가 실제로 선택하는 폰트를 수집한다.
 *
 * pdf.js는 객체 맵을 private 필드에 두므로, operator list를 훑어 `setFont` 를 찾고 각 이름을
 * `commonObjs` 에서 조회한다 — 공개 API가 허용하는 유일한 경로다.
 */
async function pageFonts(page: PDFPageProxy): Promise<FontUsage[]> {
  const list = await page.getOperatorList()
  const objs = page.commonObjs
  const out: FontUsage[] = []
  const seen = new Set<string>()

  for (let i = 0; i < list.fnArray.length; i++) {
    if (list.fnArray[i] !== OPS.setFont) continue
    const args = list.argsArray[i] as unknown
    if (!Array.isArray(args)) continue
    const loadedName: unknown = (args as unknown[])[0]
    if (typeof loadedName !== 'string' || seen.has(loadedName)) continue
    seen.add(loadedName)

    if (!objs.has(loadedName)) continue
    const font = objs.get(loadedName) as { name?: unknown } | null
    const name = typeof font?.name === 'string' ? font.name : loadedName
    out.push({ loadedName, name })
  }

  return out
}

/**
 * pdf.js가 남기는 로그를 수집하면서 `fn` 을 실행한다.
 *
 * pdf.js는 폰트 문제를 `console.warn` 으로만 보고하므로, 콘솔을 일시적으로 가로채는 것이
 * UI에 그걸 드러낼 유일한 방법이다. 예외가 나도 원래 메서드를 항상 복원한다.
 */
export async function capturePdfWarnings<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; warnings: string[] }> {
  const warnings: string[] = []
  const original = { warn: console.warn, error: console.error }
  const record =
    (level: string, passthrough: (...a: unknown[]) => void) =>
    (...args: unknown[]) => {
      warnings.push(`[${level}] ${args.map((a) => String(a)).join(' ')}`)
      passthrough(...args)
    }
  console.warn = record('warn', original.warn.bind(console))
  console.error = record('error', original.error.bind(console))
  try {
    return { result: await fn(), warnings }
  } finally {
    console.warn = original.warn
    console.error = original.error
  }
}

/**
 * 문서 앞부분 페이지들에 대한 텍스트·폰트 리포트를 만든다.
 *
 * 변환 경로에서 분리해 두었다. 페이지마다 operator list를 한 번 더 만드는 비용이 들기 때문에,
 * 누군가 렌더링 문제를 조사할 때만 실행한다.
 *
 * @param maxPages 검사할 앞쪽 페이지 수 (기본 5)
 */
export async function diagnoseFonts(
  pdf: PDFDocumentProxy,
  opts: { maxPages?: number } = {},
): Promise<DiagnosisReport> {
  const limit = Math.min(pdf.numPages, opts.maxPages ?? 5)

  const { result: pages, warnings } = await capturePdfWarnings(async () => {
    const acc: PageTextReport[] = []
    for (let i = 1; i <= limit; i++) {
      const page = await pdf.getPage(i)
      try {
        const text = await page.getTextContent()
        const items = text.items as { str?: string }[]
        const joined = items.map((it) => it.str ?? '').join('')
        acc.push({
          page: i,
          charCount: joined.length,
          sample: joined.slice(0, 80),
          textItems: items.length,
          fonts: await pageFonts(page),
        })
      } finally {
        page.cleanup()
      }
    }
    return acc
  })

  return {
    pages,
    ...summarizeWarnings(warnings),
    imageOnly: pages.length > 0 && pages.every((p) => p.charCount === 0),
  }
}
