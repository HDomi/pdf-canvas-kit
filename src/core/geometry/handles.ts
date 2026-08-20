/**
 * 9방향 핸들의 리사이즈 수학 (PLAN 11.3).
 *
 * 8개 방향 핸들 + 본체 이동으로 9방향이다. 핸들은 배율 밖 오버레이에 그리므로(PLAN D5) 이
 * 모듈은 pt 공간만 다루고 화면 좌표를 모른다.
 */
import type { Pt, Rect, Size, WorksheetObjectType } from '../model/types'
import { constrainRect, minSizeFor } from './constrain'

/** 핸들 위치. `n` = 북(위), `se` = 남동 등. */
export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const HANDLE_IDS: readonly HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** 각 핸들의 rect 내 상대 위치(0~1). 오버레이가 이걸로 핸들을 배치한다. */
export const HANDLE_ANCHORS: Record<HandleId, { fx: number; fy: number }> = {
  nw: { fx: 0, fy: 0 },
  n: { fx: 0.5, fy: 0 },
  ne: { fx: 1, fy: 0 },
  e: { fx: 1, fy: 0.5 },
  se: { fx: 1, fy: 1 },
  s: { fx: 0.5, fy: 1 },
  sw: { fx: 0, fy: 1 },
  w: { fx: 0, fy: 0.5 },
}

/** 핸들별 CSS 커서. */
export const HANDLE_CURSORS: Record<HandleId, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
}

export interface ResizeOptions {
  /** 종횡비 유지 (Shift). */
  keepAspect?: boolean
  /** 중심 기준 리사이즈 (Alt). */
  fromCenter?: boolean
  /** 스냅 그리드(pt). 0이면 스냅하지 않는다. */
  grid?: number
  /**
   * 객체의 현재 각도(deg).
   *
   * 주지 않으면 0으로 본다. 회전된 객체에 이 값을 빼먹으면 리사이즈가 앵커를 중심으로 미끄러진다.
   */
  rotation?: number
}

/** 핸들이 각 축을 어느 방향으로 움직이는지. 0이면 그 축은 고정. */
function direction(handle: HandleId): { sx: -1 | 0 | 1; sy: -1 | 0 | 1 } {
  const sx = handle.includes('w') ? -1 : handle.includes('e') ? 1 : 0
  const sy = handle.includes('n') ? -1 : handle.includes('s') ? 1 : 0
  return { sx, sy }
}

/** 벡터를 `deg` 만큼 회전한다. */
function rotateVector(x: Pt, y: Pt, deg: number): { x: Pt; y: Pt } {
  if (!deg) return { x, y }
  const rad = (deg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: x * cos - y * sin, y: x * sin + y * cos }
}

/**
 * 회전을 고려해 "잡은 핸들의 반대편이 고정되도록" 새 위치를 구한다.
 *
 * ## 왜 필요한가
 *
 * 회전이 0이면 서쪽 핸들을 끌 때 `x -= 폭 증가분` 으로 충분하다. 하지만 객체가 30도 돌아 있으면
 * 반대편 코너의 **화면상 위치**는 회전된 벡터로 정해지므로, x/y를 축 방향으로만 보정하면 객체가
 * 앵커를 중심으로 미끄러진다.
 *
 * 그래서 축이 아니라 **중심과 앵커**로 계산한다.
 * 1. 시작 시점 중심에서 앵커(잡은 핸들의 반대편)까지의 오프셋을 회전 적용해 구한다 → 앵커 절대 위치
 * 2. 새 크기에서의 같은 오프셋도 회전 적용해 구한다
 * 3. 앵커를 그 자리에 두려면 새 중심 = 앵커 − 새 오프셋
 * 4. 새 좌상단 = 새 중심 − 새 크기/2
 *
 * 같은 저장소 `frontend-service` 의 `useDraggableResize.anchorResizeRect` 와 같은 접근이다.
 * 회전 편집이 있는 편집기에서 사실상 표준 계산이다.
 */
function anchoredRect(start: Rect, handle: HandleId, w: Pt, h: Pt, rotation: number): Rect {
  const { sx, sy } = direction(handle)
  // 축 방향이 모두 0인 핸들은 없지만, 방어적으로 크기만 바꾼다.
  if (sx === 0 && sy === 0) return { x: start.x, y: start.y, w, h }

  const startCenter = { x: start.x + start.w / 2, y: start.y + start.h / 2 }
  const startOffset = rotateVector((-sx * start.w) / 2, (-sy * start.h) / 2, rotation)
  const anchor = { x: startCenter.x + startOffset.x, y: startCenter.y + startOffset.y }

  const nextOffset = rotateVector((-sx * w) / 2, (-sy * h) / 2, rotation)
  const nextCenter = { x: anchor.x - nextOffset.x, y: anchor.y - nextOffset.y }

  return { x: nextCenter.x - w / 2, y: nextCenter.y - h / 2, w, h }
}

/**
 * 핸들 드래그 결과 rect를 계산한다.
 *
 * @param start 드래그 시작 시점의 rect (pt)
 * @param handle 잡은 핸들
 * @param delta 드래그 이동량 (pt, **화면 기준**)
 * @param page 페이지 크기. 결과를 경계 안으로 자를 때 쓴다
 * @param type 최소 크기 결정에 쓰는 객체 유형
 *
 * 축 방향이 0인 핸들(예: `n` 의 x축)은 델타를 무시한다. 그래서 위쪽 엣지를 잡고 대각선으로 끌어도
 * 높이만 변한다.
 *
 * **회전된 객체**는 두 단계를 더 거친다.
 * 1. 화면 기준 델타를 `-rotation` 만큼 역회전해 객체 로컬 공간으로 옮긴다. 그러지 않으면
 *    45도 돌아간 객체에서 오른쪽으로 끌 때 대각선으로 커진다.
 * 2. 새 위치를 {@link anchoredRect} 로 구한다. 축 방향 보정만으로는 앵커가 미끄러진다.
 */
export function resizeRect(
  start: Rect,
  handle: HandleId,
  delta: { dx: Pt; dy: Pt },
  page: Size,
  type: WorksheetObjectType,
  opts: ResizeOptions = {},
): Rect {
  const { sx, sy } = direction(handle)
  const grid = opts.grid ?? 0
  const min = minSizeFor(type)
  const rotation = opts.rotation ?? 0

  // 화면 델타를 객체 로컬 공간으로 옮긴다. 회전이 0이면 그대로다.
  const local = rotateVector(delta.dx, delta.dy, -rotation)

  // 중심 기준이면 반대편도 같이 움직이므로 델타가 두 배로 작용한다.
  const factor = opts.fromCenter ? 2 : 1
  let dw = sx * local.x * factor
  let dh = sy * local.y * factor

  if (opts.keepAspect && start.w > 0 && start.h > 0) {
    const ratio = start.w / start.h
    if (sx === 0) {
      // 위/아래 엣지: 높이가 주도한다.
      dw = dh * ratio
    } else if (sy === 0) {
      dh = dw / ratio
    } else {
      // 코너: 변화량이 큰 축을 따른다. 그래야 대각선 드래그가 자연스럽다.
      if (Math.abs(dw) > Math.abs(dh * ratio)) dh = dw / ratio
      else dw = dh * ratio
    }
  }

  let w = Math.max(start.w + dw, min.w)
  let h = Math.max(start.h + dh, min.h)

  if (grid > 0) {
    w = Math.max(Math.round(w / grid) * grid, min.w)
    h = Math.max(Math.round(h / grid) * grid, min.h)
  }

  if (opts.fromCenter) {
    // 중심 고정. 회전과 무관하게 중심이 그대로이므로 앵커 계산이 필요 없다.
    const x = start.x + start.w / 2 - w / 2
    const y = start.y + start.h / 2 - h / 2
    return constrainRect({ x, y, w, h }, page, type)
  }

  // 잡은 핸들의 반대편을 고정한다. 회전이 있으면 축 보정만으로는 앵커가 미끄러진다.
  const next = anchoredRect(start, handle, w, h, rotation)

  /*
   * 회전된 객체는 페이지 경계 클램프를 적용하지 않는다.
   *
   * `constrainRect` 는 축 정렬 rect를 가정하는데, 회전된 객체의 실제 화면 점유 영역은 그보다
   * 크다. 그 상태로 클램프하면 앵커가 어긋나 리사이즈가 튄다. 회전된 객체가 페이지를 살짝 넘는
   * 것보다 나쁜 결과다. 최소 크기는 위에서 이미 보장했다.
   */
  if (rotation) return next

  return constrainRect(next, page, type)
}

/** 회전 핸들의 rect 기준 위치. 위쪽 엣지 바깥이다. */
export const ROTATE_HANDLE_OFFSET_PX = 22

/**
 * 포인터 위치로 회전 각도를 구한다.
 *
 * 12시 방향을 0°로 보는 시계방향 각도다. CSS `rotate()` 와 같은 방향이라 변환이 필요 없다.
 *
 * @param snapDeg 이 값의 배수로 스냅한다. Shift를 누르면 15° 단위가 관례다. 0이면 스냅 없음
 */
export function rotationFromPointer(
  center: { x: Pt; y: Pt },
  pointer: { x: Pt; y: Pt },
  snapDeg = 0,
): number {
  // atan2는 3시 방향을 0으로 보므로 90°를 더해 12시 기준으로 옮긴다.
  const raw = (Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180) / Math.PI + 90
  const normalized = ((raw % 360) + 360) % 360
  if (snapDeg > 0) {
    const snapped = Math.round(normalized / snapDeg) * snapDeg
    return snapped % 360
  }
  return Math.round(normalized * 10) / 10
}

/**
 * 이동 결과 rect. 크기는 유지하고 페이지 안으로만 자른다.
 *
 * 이동에는 역회전이 필요 없다. 회전된 객체도 화면에서 끌린 방향 그대로 움직이는 것이 자연스럽다 —
 * 로컬 공간으로 옮기면 오른쪽으로 끌었는데 비스듬히 가는 것처럼 보인다.
 *
 * 회전된 객체는 경계 클램프를 건너뛴다. 이유는 {@link resizeRect} 와 같다.
 */
export function moveRect(
  start: Rect,
  delta: { dx: Pt; dy: Pt },
  page: Size,
  type: WorksheetObjectType,
  opts: { grid?: number; rotation?: number } = {},
): Rect {
  const grid = opts.grid ?? 0
  let x = start.x + delta.dx
  let y = start.y + delta.dy
  if (grid > 0) {
    x = Math.round(x / grid) * grid
    y = Math.round(y / grid) * grid
  }
  const next = { x, y, w: start.w, h: start.h }
  if (opts.rotation) return next
  return constrainRect(next, page, type)
}
