/**
 * 객체 위치·크기 제약.
 *
 * 클램프 규칙을 한곳에 모아 두는 이유: 생성·이동·리사이즈·키보드 이동이 모두 같은 규칙을 지켜야
 * 하는데, 각자 계산하면 조금씩 어긋나서 "드래그로는 되는데 방향키로는 안 되는" 종류의 버그가 난다.
 */
import { EDITOR_DEFAULTS } from '../config/defaults'
import type { Pt, Rect, Size, PDFCanvasObjectType } from '../model/types'

/**
 * 유형별 최소 크기(pt).
 *
 * 커스텀 객체는 소비자가 `objectType.minSize` 로 더 크게 요구할 수 있다 — 예컨대 뷰어이
 * 탭해야 하는 입력은 손가락보다 커야 한다. 그래서 `override` 를 받는다.
 *
 * 레지스트리를 여기서 조회하지 않는 이유: 이 모듈은 순수 기하이고, 레지스트리를 import 하면
 * 드래그 수학이 UI 설정에 의존하게 된다. 호출자가 값만 넘긴다.
 */
export function minSizeFor(
  type: PDFCanvasObjectType,
  override?: { w: Pt; h: Pt },
): { w: Pt; h: Pt } {
  if (type === 'custom' && override) return override
  return EDITOR_DEFAULTS.minObjectSize
}

/** 값을 [min, max] 범위로 자른다. */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

/** 그리드에 맞춘다. `grid <= 0` 이면 그대로 돌려준다. */
export function snap(v: number, grid: number): number {
  return grid > 0 ? Math.round(v / grid) * grid : v
}

/**
 * rect를 페이지 경계 안으로 옮긴다. **크기는 바꾸지 않는다.**
 *
 * 이동에 쓴다. 경계에서 크기가 줄어들면 사용자가 되돌리기 어려운 변형이 남는데, 잘리는 대신
 * 멈추는 쪽이 예측 가능하다. 객체가 페이지보다 크면 좌상단에 붙인다.
 */
export function clampIntoPage(rect: Rect, page: Size): Rect {
  return {
    ...rect,
    x: rect.w >= page.width ? 0 : clamp(rect.x, 0, page.width - rect.w),
    y: rect.h >= page.height ? 0 : clamp(rect.y, 0, page.height - rect.h),
  }
}

/**
 * 최소 크기를 보장하고 페이지 안으로 자른다. 리사이즈·생성에 쓴다.
 *
 * 최소 크기를 먼저 적용한 뒤 경계로 자른다. 순서를 뒤집으면 경계에서 최소 크기가 깨진다.
 */
export function constrainRect(
  rect: Rect,
  page: Size,
  type: PDFCanvasObjectType,
  minOverride?: { w: Pt; h: Pt },
): Rect {
  const min = minSizeFor(type, minOverride)
  // 페이지가 최소 크기보다 작은 극단적인 경우에도 폭·높이가 음수가 되지 않게 한다.
  const w = clamp(Math.max(rect.w, min.w), 0, Math.max(page.width, min.w))
  const h = clamp(Math.max(rect.h, min.h), 0, Math.max(page.height, min.h))
  return clampIntoPage({ x: rect.x, y: rect.y, w, h }, page)
}

/** 드래그 시작·종료 두 점으로 정규화된 rect를 만든다. 어느 방향으로 끌어도 동작한다. */
export function rectFromPoints(a: { x: Pt; y: Pt }, b: { x: Pt; y: Pt }): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(b.x - a.x),
    h: Math.abs(b.y - a.y),
  }
}

/**
 * 드래그가 실제 영역 생성으로 볼 만한 크기인지.
 *
 * 이보다 작으면 클릭으로 간주해 기본 크기 객체를 놓는다. 툴을 고르고 그냥 클릭했을 때
 * 아무 일도 일어나지 않는 것보다 낫다.
 */
export function isMeaningfulDrag(rect: Rect): boolean {
  const threshold = 4
  return rect.w >= threshold && rect.h >= threshold
}
