import { createId } from '../util/id'
import type { AssetPort, PersistedAsset } from '../ports/AssetPort'

/**
 * `URL.createObjectURL` 기반의 세션 한정 asset 저장소.
 *
 * 저장이 범위 밖인 동안의 기본값이다. `origin: 'blob'` 을 보고하므로
 * `serializeDoc` 이 문서 영속화를 거부한다. 서버에 쓴 blob URL은 다음 세션에 죽은 링크이기
 * 때문이다. 나중에 base64나 S3로 바꾸는 일은 이 port만 갈아끼우면 된다 (이미지 영속화는 AssetPort 가 결정한다).
 */
export interface BlobAssetPort extends AssetPort {
  /** 이 port가 발급한 모든 URL을 해제한다. 편집기 정리 시 호출한다. */
  revokeAll(): void
  /** 살아 있는 object URL 개수. 데모에서 누수 확인용. */
  readonly size: number
}

export function createBlobAssetPort(): BlobAssetPort {
  const urls = new Map<string, string>()

  return {
    persist(blob: Blob): Promise<PersistedAsset> {
      const assetId = createId()
      const url = URL.createObjectURL(blob)
      urls.set(assetId, url)
      return Promise.resolve({ url, origin: 'blob', assetId })
    },
    release(assetId: string): Promise<void> {
      const url = urls.get(assetId)
      if (url) {
        URL.revokeObjectURL(url)
        urls.delete(assetId)
      }
      return Promise.resolve()
    },
    revokeAll() {
      for (const url of urls.values()) URL.revokeObjectURL(url)
      urls.clear()
    },
    get size() {
      return urls.size
    },
  }
}
