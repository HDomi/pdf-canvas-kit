/**
 * ⚠️ **프로토타입 전용 저장.** 실서버가 붙으면 이 파일과 `src/prototype/` 전체를 삭제한다.
 *
 * 뷰어를 만들기 전에 "저장한 문서를 다시 조합해 띄울 수 있는가" 를 확인하려고 만들었다.
 * 자세한 삭제 절차와 한계는 `src/prototype/README.md` 참고.
 *
 * ## 저장 형태
 *
 * | 키 | 내용 |
 * | --- | --- |
 * | `IMAGES` | `{ [assetId]: base64 data URL }` |
 * | `SAVED_DOC` | 문서 JSON. 배경 `url` 은 `local:<assetId>` 참조 |
 *
 * 이미지와 문서를 나눈 이유: 한 덩어리로 넣으면 문서 구조를 눈으로 확인할 때마다 수백 KB의
 * base64를 헤집어야 한다. 나눠 두면 `SAVED_DOC` 만 읽어 구조를 볼 수 있고, 실제 서버가
 * 이미지를 별도 스토리지에 두는 형태와도 같은 모양이 된다.
 *
 * ## 한계 (프로토타입인 이유)
 *
 * localStorage는 오리진당 5~10MB다. 1654px JPEG 한 페이지가 약 400KB이고 base64는 +33%
 * 팽창하므로 **약 9~18페이지에서 한계에 닿는다.** 초과하면 `QuotaExceededError` 를 그대로
 * 던진다 — 조용히 잘라내면 나중에 없는 페이지를 찾게 된다.
 */
import type { PageBackground, WorksheetDoc } from '../core/model/types'

/** 이미지 저장 키. */
export const IMAGES_KEY = 'IMAGES'
/** 문서 저장 키. */
export const SAVED_DOC_KEY = 'SAVED_DOC'

/** 배경 `url` 에 쓰는 참조 접두사. */
export const LOCAL_REF_PREFIX = 'local:'

/** `IMAGES` 의 형태. */
export type ImageMap = Record<string, string>

export class PrototypeQuotaError extends Error {
  readonly approxBytes: number
  constructor(approxBytes: number, cause?: unknown) {
    super(
      `[worksheet:prototype] localStorage quota exceeded (~${Math.round(approxBytes / 1024 / 1024)}MB). ` +
        'localStorage 는 오리진당 5~10MB 입니다. 페이지를 줄이거나 RENDER_DEFAULTS.targetPx 를 낮춰 주세요.',
      cause === undefined ? undefined : { cause },
    )
    this.name = 'PrototypeQuotaError'
    this.approxBytes = approxBytes
  }
}

/**
 * Blob → base64 data URL.
 *
 * `readAsDataURL` 은 항상 문자열을 주지만 타입은 `string | ArrayBuffer | null` 이다.
 * 문자열이 아니면 예외로 알린다 — 조용히 `[object ...]` 를 저장하면 나중에 깨진 이미지를 만난다.
 */
function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') resolve(result)
      else reject(new Error('[worksheet:prototype] readAsDataURL did not return a string'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}

/** URL(blob:/data:/http:)에서 data URL을 만든다. 이미 data URL이면 그대로 쓴다. */
async function readAsDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url
  const res = await fetch(url)
  if (!res.ok) throw new Error(`[worksheet:prototype] could not read ${url} (${res.status})`)
  return toDataUrl(await res.blob())
}

export interface SaveResult {
  /** 저장한 이미지 개수. */
  images: number
  /** 대략적인 총 바이트. 용량 한계를 체감하기 위한 값이다. */
  approxBytes: number
}

/**
 * 문서와 이미지를 localStorage에 저장한다.
 *
 * 배경 `url` 을 `local:<assetId>` 로 바꿔 저장하므로, 문서 JSON에는 base64가 들어가지 않는다.
 * `assetId` 가 없는 배경은 페이지 id를 대신 쓴다 — blob port는 assetId를 주지만, 다른 port가
 * 생략할 수도 있다.
 *
 * @throws {PrototypeQuotaError} localStorage 용량을 넘겼을 때
 */
export async function savePrototype(doc: WorksheetDoc): Promise<SaveResult> {
  const images: ImageMap = {}

  const pages = await Promise.all(
    doc.pages.map(async (page) => {
      const bg = page.background
      if (bg.kind !== 'image') return page

      const assetId = bg.assetId ?? page.id
      images[assetId] = await readAsDataUrl(bg.url)

      const background: PageBackground = {
        ...bg,
        // 참조로 바꾼다. 문서 JSON에 base64를 넣지 않기 위한 것이다.
        url: `${LOCAL_REF_PREFIX}${assetId}`,
        origin: 'inline',
        assetId,
      }
      return { ...page, background }
    }),
  )

  const payload: WorksheetDoc = { ...doc, pages }
  const docJson = JSON.stringify(payload)
  const imagesJson = JSON.stringify(images)
  const approxBytes = docJson.length + imagesJson.length

  try {
    // 이미지를 먼저 쓴다. 문서만 남고 이미지가 없는 상태보다, 이미지만 남는 편이 덜 나쁘다.
    localStorage.setItem(IMAGES_KEY, imagesJson)
    localStorage.setItem(SAVED_DOC_KEY, docJson)
  } catch (err) {
    throw new PrototypeQuotaError(approxBytes, err)
  }

  return { images: Object.keys(images).length, approxBytes }
}

/**
 * 저장된 문서를 읽어 배경 참조를 base64로 되돌린다.
 *
 * 뷰어가 이걸 그대로 렌더할 수 있다. 이미지가 없는 참조는 `blank` 배경으로 떨어뜨린다 —
 * 깨진 이미지 아이콘보다 빈 페이지가 낫고, 무엇이 없는지 콘솔로 알린다.
 */
export function loadPrototype(): WorksheetDoc | null {
  const docJson = localStorage.getItem(SAVED_DOC_KEY)
  if (!docJson) return null

  const doc = JSON.parse(docJson) as WorksheetDoc
  const imagesJson = localStorage.getItem(IMAGES_KEY)
  const images = (imagesJson ? JSON.parse(imagesJson) : {}) as ImageMap

  return {
    ...doc,
    pages: doc.pages.map((page) => {
      const bg = page.background
      if (bg.kind !== 'image' || !bg.url.startsWith(LOCAL_REF_PREFIX)) return page

      const assetId = bg.url.slice(LOCAL_REF_PREFIX.length)
      const dataUrl = images[assetId]
      if (!dataUrl) {
        console.warn(`[worksheet:prototype] image ${assetId} missing — rendering a blank page`)
        return { ...page, background: { kind: 'blank' as const } }
      }
      return { ...page, background: { ...bg, url: dataUrl } }
    }),
  }
}

/** 저장된 데이터가 있는지. 뷰어의 "불러오기" 버튼 활성 판단에 쓴다. */
export function hasPrototypeSave(): boolean {
  return localStorage.getItem(SAVED_DOC_KEY) !== null
}

/** 저장된 데이터를 지운다. */
export function clearPrototypeSave(): void {
  localStorage.removeItem(SAVED_DOC_KEY)
  localStorage.removeItem(IMAGES_KEY)
}
