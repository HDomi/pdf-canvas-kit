/**
 * 박스 스타일 해석.
 *
 * 모델의 `BoxStyle` 은 모든 필드가 optional이다. "지정하지 않음" 을 유지해야 CSS 토큰으로 테마를
 * 바꿀 수 있기 때문이다(ARCHITECTURE §3). 렌더는 지정된 값만 인라인 스타일로 내보내야 한다.
 *
 * 이 모듈은 그 판단을 한곳에 모은다. 컴포넌트마다 `if (style?.fill)` 를 흩어 두면 텍스트와
 * Answer Box가 서로 다르게 동작하기 시작한다.
 */
import type { BoxStyle, Pt } from './types'

/** 인라인으로 내보낼 CSS 속성 모음. 비어 있으면 토큰 기본값이 그대로 쓰인다. */
export type BoxStyleCss = Partial<
  Record<'background' | 'borderColor' | 'borderWidth' | 'borderStyle' | 'color', string>
>

export interface ResolveOptions {
  /**
   * 배경을 지정하지 않았을 때 쓸 값.
   *
   * 텍스트는 투명이 기본이고(배경 위에 얹히는 게 자연스럽다), Answer Box는 토큰을 따른다.
   * 그래서 호출자가 정한다.
   */
  defaultFill?: string | null
}

/**
 * `BoxStyle` 을 인라인 CSS로 바꾼다.
 *
 * 지정되지 않은 필드는 **결과에 넣지 않는다.** `undefined` 를 빈 문자열로 내보내면 CSS 변수에서
 * 온 값을 덮어써 버린다.
 *
 * `fill: null` 은 "투명" 이라는 명시적 지정이므로 결과에 포함한다 — 미지정과 다르다.
 */
export function boxStyleToCss(style: BoxStyle | undefined, opts: ResolveOptions = {}): BoxStyleCss {
  const css: BoxStyleCss = {}

  const fill = style?.fill !== undefined ? style.fill : opts.defaultFill
  if (fill !== undefined) css.background = fill ?? 'transparent'

  if (style?.color !== undefined) css.color = style.color

  // 테두리는 색과 두께가 함께 의미를 갖는다. 색이 null이면 두께와 무관하게 그리지 않는다.
  if (style?.stroke !== undefined) {
    if (style.stroke === null) {
      css.borderStyle = 'none'
    } else {
      css.borderColor = style.stroke
      css.borderStyle = 'solid'
    }
  }
  if (style?.strokeWidth !== undefined && style.stroke !== null) {
    // pt를 px로 그대로 쓴다. 배율은 부모 transform이 처리한다.
    css.borderWidth = `${style.strokeWidth}px`
  }

  return css
}

/**
 * 스타일 패치.
 *
 * `undefined` 를 **명시적으로** 허용한다. `exactOptionalPropertyTypes` 아래에서는 optional
 * 필드에 `undefined` 를 대입할 수 없는데, 인스펙터는 "이 항목을 지정하지 않음으로 되돌린다" 를
 * 표현해야 한다. `null`(투명/없음)과 `undefined`(미지정)는 다른 뜻이므로 둘 다 필요하다.
 */
export interface BoxStylePatch {
  fill?: string | null | undefined
  stroke?: string | null | undefined
  strokeWidth?: Pt | undefined
  color?: string | undefined
}

/**
 * 패치를 기존 스타일에 병합한다.
 *
 * `undefined` 인 키는 결과에서 **제거한다.** 단순 스프레드로는 `{ fill: undefined }` 가 남아
 * `exactOptionalPropertyTypes` 를 위반하고, 직렬화에도 `"fill": null` 로 새어 나간다.
 *
 * 모든 필드가 사라지면 `undefined` 를 돌려준다 — 빈 객체를 문서에 남기면 JSON만 커진다.
 */
export function mergeBoxStyle(
  current: BoxStyle | undefined,
  patch: BoxStylePatch,
): BoxStyle | undefined {
  const next: BoxStyle = { ...current }

  for (const key of ['fill', 'stroke', 'strokeWidth', 'color'] as const) {
    if (!(key in patch)) continue
    const value = patch[key]
    if (value === undefined) delete next[key]
    // 키별 타입이 서로 달라 한 번에 대입할 수 없다. 좁혀서 넣는다.
    else if (key === 'strokeWidth') next.strokeWidth = value as Pt
    else if (key === 'color') next.color = value as string
    else next[key] = value as string | null
  }

  return Object.keys(next).length > 0 ? next : undefined
}

/** 기본 테두리 두께(pt). 인스펙터가 새 값을 만들 때 쓴다. */
export const DEFAULT_BOX_STROKE_WIDTH: Pt = 1

/** 스타일에 지정된 값이 하나라도 있는지. 인스펙터의 "기본값으로" 버튼 활성 판단에 쓴다. */
export function hasBoxStyle(style: BoxStyle | undefined): boolean {
  if (!style) return false
  return (
    style.fill !== undefined ||
    style.stroke !== undefined ||
    style.strokeWidth !== undefined ||
    style.color !== undefined
  )
}
