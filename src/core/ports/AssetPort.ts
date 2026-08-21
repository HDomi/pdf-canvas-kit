import type { BackgroundOrigin } from '../model/types'

/**
 * 래스터화된 페이지 이미지가 최종적으로 어디에 사는지 (이미지 영속화는 AssetPort 가 결정한다).
 *
 * 코어는 이걸 결정하지 않는다. base64 인라인이냐 S3 업로드냐가 아직 미결이므로,
 * 코어는 표시용 URL만 다루고 영속화는 호스트에 맡긴다.
 *
 * `origin` 은 URL의 성질을 정직하게 알려야 한다. blob URL을 돌려주는 port는 `'blob'` 으로
 * 보고해야 하며, 그래야 `serializeDoc` 이 문서 쓰기를 거부한다.
 * 그러지 않으면 새로고침에 죽는 링크가 조용히 저장된다.
 */
export interface PersistedAsset {
  url: string
  origin: BackgroundOrigin
  assetId?: string
}

export interface AssetMeta {
  pageId: string
  fileName?: string
  mime: string
}

export interface AssetPort {
  persist(blob: Blob, meta: AssetMeta): Promise<PersistedAsset>
  /** 페이지 삭제 시 호출된다. 원격 저장소에 orphan이 쌓이지 않게. */
  release?(assetId: string): Promise<void>
}
