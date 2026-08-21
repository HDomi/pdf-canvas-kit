/**
 * 문서 직렬화. 죽은 링크 저장을 막는 가드를 포함한다.
 *
 * 페이지 배경은 blob URL로 시작하는데, 이건 현재 세션에만 존재한다. 그걸 서버에 써 두면
 * 문서는 정상적으로 로드되지만 다음 날 빈 페이지가 렌더된다 — 원인으로부터 한참 뒤에
 * 드러나는 실패다.
 *
 * 그래서 직렬화는 blob 배경을 가진 문서를 거부한다. 해결은 먼저 승격하는 것이며(업로드하거나
 * base64로 인라인), {@link ../assets/promoteBackgrounds} 가 그 역할을 한다.
 */
import type { PDFCanvasDoc } from './types'

export class BlobBackgroundError extends Error {
  /** 아직 세션 한정 배경을 들고 있는 페이지 id 목록. */
  readonly pageIds: string[]

  constructor(pageIds: string[]) {
    super(
      `[pdf-canvas-kit] cannot serialize: ${pageIds.length} page(s) still use session-only blob URLs. ` +
        'Call promoteBackgrounds(doc, assetPort) first, otherwise the saved document ' +
        'would point at URLs that die with this session.',
    )
    this.name = 'BlobBackgroundError'
    this.pageIds = pageIds
  }
}

/** 배경이 세션을 넘겨 살아남을 수 없는 페이지 id 목록. */
export function findBlobBackgrounds(doc: PDFCanvasDoc): string[] {
  return doc.pages
    .filter((p) => p.background.kind === 'image' && p.background.origin === 'blob')
    .map((p) => p.id)
}

/** 모든 배경을 그대로 영속화할 수 있으면 true. */
export function isSerializable(doc: PDFCanvasDoc): boolean {
  return findBlobBackgrounds(doc).length === 0
}

/**
 * 저장용 JSON 페이로드를 만든다.
 *
 * @throws {BlobBackgroundError} 한 페이지라도 blob URL을 들고 있으면.
 */
export function serializeDoc(doc: PDFCanvasDoc): string {
  const blobs = findBlobBackgrounds(doc)
  if (blobs.length > 0) throw new BlobBackgroundError(blobs)
  return JSON.stringify(doc)
}

/**
 * 저장된 문서를 파싱한다.
 *
 * 편집기가 의존하는 구조만 검증한다. 필드 단위 검증은 서버 몫이며, 이 함수는 잘린 페이로드나
 * 남의 페이로드에 대해 반쯤 깨진 편집기를 렌더하는 대신 크게 실패하기 위해 존재한다.
 */
export function deserializeDoc(json: string): PDFCanvasDoc {
  const parsed: unknown = JSON.parse(json)
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('[pdf-canvas-kit] document is not an object')
  }
  const doc = parsed as Partial<PDFCanvasDoc>
  if (doc.schemaVersion !== 1) {
    throw new Error(`[pdf-canvas-kit] unsupported schemaVersion: ${String(doc.schemaVersion)}`)
  }
  if (!Array.isArray(doc.pages)) {
    throw new Error('[pdf-canvas-kit] document has no pages array')
  }
  for (const page of doc.pages) {
    if (!page.size || typeof page.size.width !== 'number' || typeof page.size.height !== 'number') {
      throw new Error(`[pdf-canvas-kit] page ${page.id} has no valid size`)
    }
  }
  return parsed as PDFCanvasDoc
}
