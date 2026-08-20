/**
 * 세션 한정 배경을 영속 배경으로 승격한다 (PLAN 4.1).
 *
 * 페이지 배경은 blob URL로 시작한다. 그대로 저장하면 다음 세션에 죽은 링크가 되므로,
 * `serializeDoc` 이 blob 배경을 거부한다. 이 함수가 그 앞단을 담당한다.
 *
 * 저장 직전에 호출한다. 이미 `inline`/`remote` 인 배경은 건너뛰므로 여러 번 불려도 안전하고,
 * 두 번째 저장부터는 업로드가 일어나지 않는다.
 */
import type { AssetPort } from '../ports/AssetPort'
import type { PageBackground, PDFCanvasDoc } from '../model/types'

export interface PromoteProgress {
  /** 승격 완료한 페이지 수. */
  done: number
  /** 승격이 필요한 총 페이지 수. */
  total: number
  pageId: string
}

export interface PromoteOptions {
  onProgress?: (p: PromoteProgress) => void
  signal?: AbortSignal
}

export class PromoteAbortError extends Error {
  constructor() {
    super('[pdf-canvas-kit] background promotion aborted')
    this.name = 'PromoteAbortError'
  }
}

/** blob URL을 다시 Blob으로 읽는다. 같은 세션 안에서는 fetch로 접근할 수 있다. */
async function readBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(
      `[pdf-canvas-kit] could not read blob url (${res.status}) — session may have ended`,
    )
  }
  return res.blob()
}

/**
 * blob 배경을 모두 업로드하고 새 문서를 돌려준다.
 *
 * 원본 문서를 변경하지 않는다. 승격 중 사용자가 계속 편집할 수 있어야 하므로, 호출자는 결과를
 * 커맨드로 반영하면서 그 사이 생긴 변경과 병합해야 한다.
 *
 * 순차 업로드다. 병렬로 올리면 500페이지 문서에서 동시 요청이 폭주하고, 브라우저 연결 수 제한에
 * 걸려 오히려 느려진다.
 */
export async function promoteBackgrounds(
  doc: PDFCanvasDoc,
  asset: AssetPort,
  options: PromoteOptions = {},
): Promise<PDFCanvasDoc> {
  const targets = doc.pages.filter(
    (p) => p.background.kind === 'image' && p.background.origin === 'blob',
  )
  if (targets.length === 0) return doc

  const promoted = new Map<string, PageBackground>()
  let done = 0

  for (const page of targets) {
    if (options.signal?.aborted) throw new PromoteAbortError()
    const bg = page.background
    if (bg.kind !== 'image') continue

    const blob = await readBlob(bg.url)
    const stored = await asset.persist(blob, { pageId: page.id, mime: blob.type })

    const next: PageBackground = {
      kind: 'image',
      url: stored.url,
      origin: stored.origin,
      naturalWidth: bg.naturalWidth,
      naturalHeight: bg.naturalHeight,
      renderScale: bg.renderScale,
    }
    if (stored.assetId !== undefined) next.assetId = stored.assetId
    promoted.set(page.id, next)

    done++
    options.onProgress?.({ done, total: targets.length, pageId: page.id })
  }

  return {
    ...doc,
    pages: doc.pages.map((p) => {
      const next = promoted.get(p.id)
      return next ? { ...p, background: next } : p
    }),
  }
}
