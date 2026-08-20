/**
 * S3(또는 호환 스토리지) AssetPort (PLAN Q11 결정: S3).
 *
 * ## 왜 이 구현이 얇은가
 *
 * 라이브러리가 AWS SDK를 번들에 넣지 않는다. 이유가 여럿이다.
 *
 * - SDK가 크고, 대부분의 호스트는 이미 자기 업로드 경로(백엔드 프록시, presigned URL 발급 API)를
 *   갖고 있다.
 * - 브라우저에서 직접 S3에 쓰려면 자격증명이 필요한데, 그건 서버가 발급하는 presigned URL로
 *   해결하는 것이 표준이다. 자격증명을 클라이언트에 두는 구현을 제공하면 잘못된 사용을 유도한다.
 *
 * 그래서 이 port는 **"업로드 URL을 받아 PUT 한다"** 만 한다. URL 발급은 호스트가 준
 * `getUploadUrl` 이 담당한다.
 *
 * ```ts
 * const asset = createS3AssetPort({
 *   async getUploadUrl({ pageId, mime }) {
 *     const r = await fetch('/api/uploads', { method: 'POST', body: JSON.stringify({ pageId, mime }) })
 *     return r.json() // { uploadUrl, publicUrl, assetId }
 *   },
 * })
 * ```
 *
 * 업로드 경로가 완전히 다른 제품이라면 `AssetPort` 를 직접 구현하면 된다. 이건 가장 흔한 형태를
 * 위한 편의 구현이다.
 */
import type { AssetMeta, AssetPort, PersistedAsset } from '../ports/AssetPort'

/** 호스트가 발급하는 업로드 대상. */
export interface UploadTarget {
  /** PUT 할 presigned URL. */
  uploadUrl: string
  /**
   * 업로드 후 이미지를 읽을 URL.
   *
   * `uploadUrl` 과 다른 경우가 많다(presigned URL에는 서명 쿼리가 붙는데, 그건 만료된다).
   * 문서에 저장되는 값은 이쪽이다.
   */
  publicUrl: string
  /** 서버가 부여한 asset 식별자. 페이지 삭제 시 정리에 쓴다. */
  assetId?: string
  /** PUT 에 함께 보낼 헤더. presigned URL이 특정 헤더를 요구하는 경우가 있다. */
  headers?: Record<string, string>
}

export interface S3AssetPortOptions {
  /** 업로드 URL을 발급받는다. 보통 백엔드 API 호출이다. */
  getUploadUrl: (meta: AssetMeta) => Promise<UploadTarget>
  /**
   * asset 삭제를 요청한다. 페이지가 삭제될 때 호출된다.
   *
   * 생략하면 정리하지 않는다 — 그 경우 orphan 정리는 서버의 배치 작업 몫이 된다.
   */
  deleteAsset?: (assetId: string) => Promise<void>
  /** 업로드 실패 시 재시도 횟수. @default 2 */
  retries?: number
}

export class AssetUploadError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AssetUploadError'
    this.status = status
  }
}

/** 지수 백오프 대기. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createS3AssetPort(options: S3AssetPortOptions): AssetPort {
  const retries = options.retries ?? 2

  return {
    async persist(blob: Blob, meta: AssetMeta): Promise<PersistedAsset> {
      let lastError: unknown = null

      // 네트워크 오류와 5xx만 재시도한다. 4xx는 다시 시도해도 같은 결과다.
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (attempt > 0) await delay(300 * 2 ** (attempt - 1))
        try {
          const target = await options.getUploadUrl(meta)
          const res = await fetch(target.uploadUrl, {
            method: 'PUT',
            body: blob,
            headers: { 'Content-Type': meta.mime, ...target.headers },
          })
          if (!res.ok) {
            const err = new AssetUploadError(
              `[worksheet] asset upload failed with ${res.status}`,
              res.status,
            )
            if (res.status < 500) throw err
            lastError = err
            continue
          }
          const persisted: PersistedAsset = { url: target.publicUrl, origin: 'remote' }
          if (target.assetId !== undefined) persisted.assetId = target.assetId
          return persisted
        } catch (err) {
          if (err instanceof AssetUploadError && err.status !== null && err.status < 500) throw err
          lastError = err
        }
      }

      throw new AssetUploadError(
        `[worksheet] asset upload failed after ${retries + 1} attempts`,
        null,
        { cause: lastError },
      )
    },

    ...(options.deleteAsset ? { release: options.deleteAsset } : {}),
  }
}
