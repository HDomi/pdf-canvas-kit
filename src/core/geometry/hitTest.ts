/**
 * 히트 테스트.
 *
 * 회전한 객체를 다루기 위해, 포인터를 객체 중심 기준으로 역회전시킨 뒤 축 정렬 사각형과 비교한다.
 * 회전한 사각형과 점을 직접 비교하는 것보다 계산이 단순하고, 리사이즈 로직도 같은 변환을 쓴다.
 */
import type { Pt, Rect, PDFCanvasObject } from '../model/types'

/** rect의 중심점. */
export function rectCenter(r: Rect): { x: Pt; y: Pt } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

/** `deg` 만큼 `origin` 기준으로 점을 회전한다. */
export function rotatePoint(
  p: { x: Pt; y: Pt },
  origin: { x: Pt; y: Pt },
  deg: number,
): { x: Pt; y: Pt } {
  if (!deg) return p
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = p.x - origin.x
  const dy = p.y - origin.y
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  }
}

/** 회전을 고려해 점이 객체 안에 있는지. */
export function hitTestObject(point: { x: Pt; y: Pt }, obj: PDFCanvasObject): boolean {
  const r = obj.rect
  const local = obj.rotation ? rotatePoint(point, rectCenter(r), -obj.rotation) : point
  return local.x >= r.x && local.x <= r.x + r.w && local.y >= r.y && local.y <= r.y + r.h
}

/**
 * 점 아래의 최상단 객체를 찾는다.
 *
 * 배열 순서가 z-order이므로 뒤에서부터 훑는다. 잠긴 객체는 건너뛴다.
 */
export function pickObject(
  point: { x: Pt; y: Pt },
  objects: readonly PDFCanvasObject[],
): PDFCanvasObject | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i]
    if (!obj || obj.locked) continue
    if (hitTestObject(point, obj)) return obj
  }
  return null
}

/** 두 rect가 겹치는지. 마퀴 선택에 쓴다. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/**
 * 마퀴에 걸리는 객체들.
 *
 * 완전 포함이 아니라 교차 기준이다. 큰 배경 객체를 선택하려고 화면 밖까지 끌어야 하는 상황을
 * 피하려는 것이고, 대부분의 편집기가 이렇게 동작한다.
 */
export function pickObjectsInRect(
  marquee: Rect,
  objects: readonly PDFCanvasObject[],
): PDFCanvasObject[] {
  return objects.filter((o) => !o.locked && rectsIntersect(marquee, o.rect))
}
