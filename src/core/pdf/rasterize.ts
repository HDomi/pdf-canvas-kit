/**
 * PDF 페이지 → 이미지 blob.
 *
 * 캔버스 하나를 페이지마다 재사용하는 것은 의도다. 페이지를 동시에 렌더하면 큰 문서에서
 * 메모리가 크게 튀는데, 500페이지 상한 때문에 이건 이론이 아니라 실제 위험이다.
 */
import type { PDFPageProxy } from 'pdfjs-dist'
import type { Size } from '../model/types'

/** 약 200dpi에서의 A4 폭. 이보다 낮으면 편집기가 확대했을 때 글자가 뭉개진다. */
export const TARGET_PX = 1654

/** 지나치게 큰 페이지(A0 포스터, 플로터 출력)에서 캔버스가 폭주하는 것을 막는다. */
export const MAX_SCALE = 3

/**
 * WebP가 아니라 JPEG를 쓴다. A4 100페이지 픽스처 실측에서 Chrome은 비슷한 용량 기준으로
 * JPEG를 WebP보다 약 6배 빠르게 인코딩했고, 페이지 배경에는 보존할 투명도도 없다.
 * 수치는 참고.
 */
export const DEFAULT_MIME = 'image/jpeg'

export const DEFAULT_QUALITY = 0.85

export interface RasterizeOptions {
  /**
   * 목표 래스터 폭(**픽셀** 단위, pt 아님). 배율은 이 값과 페이지의 pt 폭에서 유도되므로,
   * 크기가 다른 페이지들이 모두 대략 같은 픽셀 폭에 도달한다.
   * @default TARGET_PX (1654)
   */
  targetPx?: number
  /**
   * 유도된 배율의 상한. 작은 페이지가 터무니없이 확대되는 것과, 큰 페이지가 브라우저가 거부할
   * 크기의 캔버스를 만드는 것을 막는다.
   * @default MAX_SCALE (3)
   */
  maxScale?: number
  /**
   * 출력 MIME 타입. `image/webp` 는 미지원 환경에서 PNG로 떨어지고, 다른 타입은 그대로 쓴다.
   * @default DEFAULT_MIME ('image/jpeg' — WebP보다 6.7배 빠르다, ARCHITECTURE §5 참고)
   */
  mime?: string
  /**
   * 손실 인코더 품질, 0..1. PNG에서는 무시된다.
   * @default DEFAULT_QUALITY (0.85)
   */
  quality?: number
}

export interface RasterizeResult {
  /** 인코딩된 페이지 이미지. */
  blob: Blob
  /**
   * scale 1 뷰포트에서 얻은 **pt** 단위 페이지 크기. 객체가 사는 좌표 공간이다 (좌표는 페이지 로컬 pt 절대값이다).
   * 페이지의 `/Rotate` 가 반영돼 있어, 회전된 가로 페이지는 가로 크기를 보고한다.
   */
  size: Size
  /** `blob` 의 래스터 픽셀 폭. 품질 신호일 뿐 좌표가 아니다. */
  naturalWidth: number
  /** `blob` 의 래스터 픽셀 높이. */
  naturalHeight: number
  /**
   * `naturalWidth / size.width`.
   *
   * **고배율 재래스터화는 구현하지 않는다**. 이 값은 그 판단에 필요한 정보를
   * 미리 갖춰 두기 위해 보관한다 — 400% 확대에서 배경이 흐릿한 것은 알려진 한계이며,
   * 필요해지면 이 값과 현재 배율을 비교해 해당 페이지만 다시 래스터화하면 된다.
   * 좌표가 pt라 재래스터화가 객체 위치에 영향을 주지 않는다.
   */
  renderScale: number
  /**
   * 페이지의 `/Rotate` 값을 0 | 90 | 180 | 270 으로 정규화한 것.
   *
   * `size` 와 래스터에 이미 적용돼 있으므로 정보용이다. 어떤 페이지가 *왜* 가로 크기를
   * 보고하는지 설명해 주며, 방향이 섞인 문서에서 의미가 있다.
   */
  rotation: 0 | 90 | 180 | 270
}

/**
 * 한 번의 변환에서 모든 페이지가 재사용하는 캔버스.
 *
 * 페이지마다 자기 캔버스를 두고 동시에 렌더하면 큰 문서에서 메모리가 크게 튀고, 500페이지
 * 상한 때문에 이건 실제 위험이다. 캔버스 하나를 페이지마다 리사이즈하면 피크 메모리가
 * 한 페이지 비트맵 수준으로 유지된다.
 */
export interface RasterTarget {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
}

/**
 * 공유 렌더 타깃을 만든다.
 *
 * 페이지 배경이 불투명하므로 `alpha: false` 다. 덤으로 브라우저가 페이지마다 하는 합성 작업을
 * 건너뛸 수 있다.
 */
export function createRasterTarget(): RasterTarget {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('[pdf-canvas-kit] 2D canvas context unavailable')
  return { canvas, ctx }
}

/**
 * PDF `/Rotate` 값을 정규화한다.
 *
 * 스펙은 90의 배수를 모두 허용하며 음수도 포함한다. 실제로 생성 도구들이 -90이나 450 같은
 * 값을 내보낸다.
 */
export function normalizeRotation(rotate: number): 0 | 90 | 180 | 270 {
  const r = (((Math.round(rotate / 90) * 90) % 360) + 360) % 360
  return r as 0 | 90 | 180 | 270
}

let webpSupport: boolean | null = null

/** Safari가 WebP 인코딩을 늦게 지원했다. UA를 믿지 말고 한 번 실제로 확인한다. */
function supportsWebp(): boolean {
  if (webpSupport !== null) return webpSupport
  const c = document.createElement('canvas')
  c.width = 1
  c.height = 1
  webpSupport = c.toDataURL('image/webp').startsWith('data:image/webp')
  return webpSupport
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('[pdf-canvas-kit] canvas.toBlob returned null')),
      mime,
      quality,
    )
  })
}

/**
 * 페이지 하나를 `target` 에 렌더하고 인코딩한다.
 *
 * 정확성에 관계되는 두 가지가 있다.
 *
 * - `size` 는 **scale 1** 뷰포트에서 얻는다. 그래서 `/Rotate` 를 포함한 페이지의 진짜 pt
 *   크기다. 객체 좌표는 래스터 픽셀이 아니라 이 값을 기준으로 한다.
 * - 렌더 전에 캔버스를 흰색으로 채운다. width/height 설정만으로도 비워지지만, 투명 영역이 있는
 *   페이지는 그대로 두면 이전 페이지가 남긴 것 위에 합성된다 — 눈에 잘 안 띄는 페이지 간 번짐이다.
 *
 * `target` 을 재사용하므로 호출이 겹쳐서는 안 된다.
 */
export async function rasterizePage(
  page: PDFPageProxy,
  target: RasterTarget,
  opts: RasterizeOptions = {},
): Promise<RasterizeResult> {
  const targetPx = opts.targetPx ?? TARGET_PX
  const maxScale = opts.maxScale ?? MAX_SCALE

  // rotation의 기본값은 page.rotate다. 명시적으로 넘겨 의도를 드러낸다.
  const rotation = normalizeRotation(page.rotate)
  const base = page.getViewport({ scale: 1, rotation })
  const size: Size = { width: base.width, height: base.height }

  const renderScale = Math.min(Math.max(targetPx / base.width, 1), maxScale)
  const viewport = page.getViewport({ scale: renderScale, rotation })

  const width = Math.max(1, Math.floor(viewport.width))
  const height = Math.max(1, Math.floor(viewport.height))

  const { canvas, ctx } = target
  canvas.width = width
  canvas.height = height
  // width/height 설정만으로도 캔버스가 비워지지만, 투명 영역이 있는 페이지는
  // 그대로 두면 이전 페이지가 남긴 내용 위에 합성된다.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  await page.render({ canvas, viewport }).promise

  const requested = opts.mime ?? DEFAULT_MIME
  // 지원 여부 확인이 필요한 건 WebP뿐이다. PNG와 JPEG는 어디서나 인코딩된다.
  const mime = requested === 'image/webp' && !supportsWebp() ? 'image/png' : requested
  const blob = await toBlob(canvas, mime, opts.quality ?? DEFAULT_QUALITY)

  return { blob, size, naturalWidth: width, naturalHeight: height, renderScale, rotation }
}
