/**
 * 이 코드베이스에 존재하는 좌표 변환의 전부 (PLAN 5.4).
 *
 * ## 규칙
 *
 * 저장되는 좌표는 페이지 로컬 **pt**, 좌상단 원점, y-down이다. 화면 위치는 파생값이며 저장하지
 * 않는다. 배율은 페이지 엘리먼트의 CSS `transform: scale()` 한 곳에서만 적용되므로,
 * 객체 렌더는 계산을 전혀 하지 않고 pt 값을 `left`/`top`/`width`/`height` 에 px로 그대로 쓴다.
 *
 * 이 함수들은 화면 좌표가 실제로 필요한 두 곳을 위해 존재한다. 포인터 처리(화면 → pt), 그리고
 * scale transform **밖에** 그려지므로 pt → 화면 변환이 필요한 선택 오버레이다.
 *
 * ## 스크롤 오프셋 대신 `frameRect` 를 쓰는 이유
 *
 * 뷰포트는 페이지 프레임의 `getBoundingClientRect()` 를 들고 있다. `scrollLeft`/`offsetTop` 을
 * 직접 더하려면 스테이지 스크롤, sticky 툴바, 호스트 앱이 편집기를 감싼 레이아웃까지 모두
 * 합산해야 하고 — 하나만 빠져도 클릭 지점이 전부 어긋난다. rect에는 이미 그 전부가 들어 있다.
 *
 * 객체 뷰 컴포넌트는 이 모듈을 import 하지 않는다. ESLint로 강제한다.
 */
import type { Pt, Rect, Size } from '../model/types'

/** 두 공간 중 하나의 점. 어느 공간인지는 함수별로 명시한다. */
export interface Point {
  x: number
  y: number
}

/** 두 공간 중 하나의 이동량. */
export interface Delta {
  dx: number
  dy: number
}

/**
 * 한 페이지의 pt 공간과 화면 사이를 변환하는 데 필요한 값 전부.
 *
 * 문서 단위가 아니라 페이지 단위로 만든다. 페이지 크기가 서로 다를 수 있고(PLAN D7),
 * 뷰어에서는 페이지마다 자기 맞춤 배율을 갖는다.
 */
export interface PageViewport {
  pageId: string
  /** 페이지 크기(pt). */
  size: Size
  /** pt당 CSS px. */
  scale: number
  /**
   * 뷰포트 좌표계에서의 페이지 프레임 위치, 즉 `pageFrameEl.getBoundingClientRect()`.
   * 스크롤과 팬이 이미 반영돼 있다.
   */
  frameRect: { left: number; top: number }
}

/** 소수 2자리로 라운드. 커밋 시점에만 적용하고 드래그 중에는 쓰지 않는다 (PLAN 5.6). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** rect의 모든 필드를 소수 2자리로 라운드. */
export function roundRect(r: Rect): Rect {
  return { x: round2(r.x), y: round2(r.y), w: round2(r.w), h: round2(r.h) }
}

/**
 * 뷰포트 좌표(`clientX`/`clientY`) → 페이지 로컬 pt.
 *
 * 모든 포인터 이벤트에 쓴다. 결과는 클램프되지 않아 페이지 밖 값이 나올 수 있으며,
 * 그 판정이나 클램프는 호출자 몫이다.
 */
export function clientToPage(p: Point, vp: PageViewport): { x: Pt; y: Pt } {
  return {
    x: (p.x - vp.frameRect.left) / vp.scale,
    y: (p.y - vp.frameRect.top) / vp.scale,
  }
}

/**
 * 페이지 로컬 pt → 페이지 프레임 좌상단 기준 CSS px.
 *
 * 선택 오버레이 전용이다. 객체 뷰는 부모 transform이 이미 스케일하므로 pt를 px로 그대로 쓴다.
 */
export function pageToFrame(p: { x: Pt; y: Pt }, vp: PageViewport): Point {
  return { x: p.x * vp.scale, y: p.y * vp.scale }
}

/** rect 단위의 {@link pageToFrame}. 오버레이 전용. */
export function rectToFrame(r: Rect, vp: PageViewport): Rect {
  return { x: r.x * vp.scale, y: r.y * vp.scale, w: r.w * vp.scale, h: r.h * vp.scale }
}

/**
 * 화면 이동량 → pt 이동량.
 *
 * 델타에는 배율만 관여하므로 뷰포트 전체가 아니라 숫자를 받는다. 덕분에 드래그 중
 * 프레임을 다시 측정하지 않고도 쓸 수 있다.
 */
export function clientDeltaToPage(d: Delta, scale: number): { dx: Pt; dy: Pt } {
  return { dx: d.dx / scale, dy: d.dy / scale }
}

/** 프레임이 실제로 차지하는 CSS px 크기. 레이아웃이 확보해야 하는 값이다 (PLAN 5.3). */
export function frameSize(size: Size, scale: number): { width: number; height: number } {
  return { width: size.width * scale, height: size.height * scale }
}
