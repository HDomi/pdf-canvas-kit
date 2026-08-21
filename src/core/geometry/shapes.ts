/**
 * 도형 정점 계산 — 다각형 계열 `ShapeKind` 의 유일한 출처.
 *
 * `rect` · `ellipse` · `line` · `arrow` 는 SVG 전용 요소(`<rect>` `<ellipse>` `<line>`)로
 * 그리므로 여기 없다. 나머지는 전부 `<polygon>` 하나로 그리고, 그 정점을 이 파일이 만든다.
 *
 * ## 왜 렌더 층이 아니라 core 인가
 *
 * 정점은 순수 계산이라 브라우저 없이 검증할 수 있다. 뷰 안에 두면 별 모양이 맞는지 확인하려면
 * 화면을 띄워야 한다 — `npm run checks` 가 커버하지 못하는 자리가 생긴다.
 *
 * ## 좌표 단위
 *
 * 입력·출력 모두 **pt** 다. 배율은 페이지 컨테이너의 `transform` 한 곳에만 있으므로
 * (ARCHITECTURE §4) 여기서는 배율을 모른다.
 *
 * ## 정점을 안쪽으로 밀어 넣는다
 *
 * SVG 의 stroke 는 경로 **중앙**에 그려진다. 정점을 박스 경계에 그대로 두면 테두리 절반이
 * 박스 밖으로 나가 리사이즈 핸들과 어긋난다. `rect` · `ellipse` 가 `strokeWidth / 2` 만큼
 * 줄여 그리는 것과 같은 처리를 다각형에도 한다.
 *
 * 정확한 오프셋 곡선(각 변을 법선 방향으로 밀기)이 아니라 **바운딩 박스를 줄이는** 방식이다.
 * 뾰족한 꼭짓점에서는 두 결과가 다르지만, 이 편이 박스 안에 확실히 들어가고 계산이 한 줄이다.
 */
import type { PDFCanvasObject, Pt, Rect, ShapeKind } from '../model/types'
import { round2 } from './units'

/** `<polygon>` 으로 그리는 도형. */
export type PolygonShape = 'triangle' | 'diamond' | 'pentagon' | 'hexagon' | 'star' | 'cross'

const POLYGON_SHAPES: readonly PolygonShape[] = [
  'triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'star',
  'cross',
]

export function isPolygonShape(shape: ShapeKind): shape is PolygonShape {
  return (POLYGON_SHAPES as readonly string[]).includes(shape)
}

/** 선으로 그리는 도형. 화살촉 개수만 다르다. */
export function isLineShape(shape: ShapeKind): shape is 'line' | 'arrow' | 'doubleArrow' {
  return shape === 'line' || shape === 'arrow' || shape === 'doubleArrow'
}

/** 별의 꼭짓점 수. 5 각별이 "별" 의 기본 형태다. */
const STAR_TIPS = 5
/**
 * 별의 안쪽 반지름 비율.
 *
 * `1 / φ²` ≈ 0.382 — 정오각형의 대각선이 만드는 교점 비율이고, 이 값에서 다섯 변이 일직선이
 * 되어 흔히 그리는 별 모양이 된다. 더 작으면 바늘처럼, 더 크면 꽃잎처럼 보인다.
 */
const STAR_INNER_RATIO = 0.382
/** 십자의 팔 두께 비율. 1/3 이면 세 칸으로 균등 분할된다. */
const CROSS_ARM_RATIO = 1 / 3

type UnitPoint = readonly [number, number]

/**
 * 단위 정사각형 `0..1` 안의 정점. 실제 크기 매핑은 `polygonPoints` 가 한다.
 *
 * 원에 내접시켜 만든 도형(오각형·육각형·별)은 박스가 정사각형이 아니면 **늘어난다.**
 * 의도한 동작이다 — 사용자가 박스를 늘렸으면 도형도 늘어나야 한다.
 */
function ngon(sides: number, startDeg: number): UnitPoint[] {
  const out: UnitPoint[] = []
  for (let i = 0; i < sides; i += 1) {
    const rad = ((startDeg + (360 / sides) * i) * Math.PI) / 180
    out.push([0.5 + 0.5 * Math.cos(rad), 0.5 + 0.5 * Math.sin(rad)])
  }
  return out
}

function starPoints(): UnitPoint[] {
  const out: UnitPoint[] = []
  // 꼭짓점과 골을 번갈아 놓는다. `-90` 은 첫 꼭짓점을 위로 세운다.
  for (let i = 0; i < STAR_TIPS * 2; i += 1) {
    const r = i % 2 === 0 ? 0.5 : 0.5 * STAR_INNER_RATIO
    const rad = ((-90 + (360 / (STAR_TIPS * 2)) * i) * Math.PI) / 180
    out.push([0.5 + r * Math.cos(rad), 0.5 + r * Math.sin(rad)])
  }
  return out
}

function crossPoints(): UnitPoint[] {
  const a = CROSS_ARM_RATIO
  const b = 1 - a
  return [
    [a, 0],
    [b, 0],
    [b, a],
    [1, a],
    [1, b],
    [b, b],
    [b, 1],
    [a, 1],
    [a, b],
    [0, b],
    [0, a],
    [a, a],
  ]
}

const UNIT_POINTS: Record<PolygonShape, readonly UnitPoint[]> = {
  // 위 꼭짓점 하나, 아래 변 하나.
  triangle: [
    [0.5, 0],
    [1, 1],
    [0, 1],
  ],
  diamond: [
    [0.5, 0],
    [1, 0.5],
    [0.5, 1],
    [0, 0.5],
  ],
  // `-90` 은 꼭짓점을 위로 세운다.
  pentagon: ngon(5, -90),
  // `0` 은 좌우가 뾰족하고 위아래가 평평한 육각형 — 아이콘에서 흔한 방향이다.
  hexagon: ngon(6, 0),
  star: starPoints(),
  cross: crossPoints(),
}

/**
 * `<polygon points>` 문자열을 만든다.
 *
 * @param inset 각 변에서 안으로 밀어 넣을 거리(pt). 보통 `strokeWidth / 2` 다.
 *   박스보다 큰 값이 오면 폭·높이를 0 으로 접는다 — 음수 크기로 정점이 뒤집히면 도형이
 *   안팎으로 꼬여 보인다.
 */
export function polygonPoints(shape: PolygonShape, w: Pt, h: Pt, inset: Pt = 0): string {
  const iw = Math.max(w - inset * 2, 0)
  const ih = Math.max(h - inset * 2, 0)
  return UNIT_POINTS[shape]
    .map(([ux, uy]) => `${round3(inset + ux * iw)},${round3(inset + uy * ih)}`)
    .join(' ')
}

/**
 * 소수점 3자리로 자른다.
 *
 * `Math.cos` 결과가 그대로 들어가면 `297.63999999999997` 같은 문자열이 나와 DOM 속성 비교가
 * 매번 달라지고, 검증 케이스의 기대값도 적을 수 없다. 3자리면 pt 기준 1/1000 이라 화면에
 * 차이가 없다.
 */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

/* --------------------------------------------------- 선 계열의 박스 크기 -- */

/** 화살촉 한 변 / 선 두께. 실측이 아니라 눈으로 고른 비율이다. */
const ARROW_HEAD_RATIO = 4

/**
 * 화살촉 크기(pt) — 정삼각형에 가까운 촉의 한 변.
 *
 * 선 두께에 비례시킨다. 두께 1pt 선에 20pt 촉이 붙으면 촉만 보이고, 두께 8pt 선에 4pt 촉은
 * 촉이 없는 것처럼 보인다. 박스를 넘지 않도록 폭·높이로도 조인다 — `<svg>` 의 기본
 * `overflow` 는 hidden 이라 넘치면 **잘려서** 화살표가 뭉툭해 보인다.
 */
export function arrowHeadSize(w: Pt, h: Pt, strokeWidth: Pt): Pt {
  return Math.min(strokeWidth * ARROW_HEAD_RATIO, w / 2, h)
}

/**
 * 선 계열 도형이 **실제로 차지하는** 높이(pt).
 *
 * 선은 박스의 좌측 중앙 → 우측 중앙에 그려지므로 박스 높이가 그림에 아무 영향을 주지 않는다.
 * 그대로 두면 200pt 높이 박스 안에 1pt 선 하나가 떠 있고, 선택 핸들과 썸네일 자리 표시가
 * 그 빈 박스를 따라간다 — 2026.08.21 에 실제로 그렇게 보였다.
 *
 * | | 높이 |
 * | --- | --- |
 * | `line` | 선 두께 그대로 |
 * | `arrow` · `doubleArrow` | 화살촉 높이 (선보다 두꺼운 쪽이 박스를 정한다) |
 */
export function lineShapeHeight(shape: ShapeKind, strokeWidth: Pt, w: Pt): Pt {
  if (shape === 'line') return strokeWidth
  /*
   * 촉 크기가 폭에 걸려 줄어들 수 있으므로 최소한 선 두께는 확보한다. 아주 짧은 화살표에서
   * 박스가 선보다 얇아지면 선이 잘린다.
   */
  return Math.max(arrowHeadSize(w, Number.POSITIVE_INFINITY, strokeWidth), strokeWidth)
}

/**
 * 도형의 rect 를 **실제로 그려지는 크기**에 맞춘다.
 *
 * 선 계열의 높이만 조인다. 나머지 도형은 박스를 꽉 채우므로 손댈 것이 없다.
 *
 * 세로 중심을 유지한다 — 높이만 줄이면 선이 위로 튀어 올라 "핸들을 놨는데 도형이 움직였다"
 * 가 된다. 중심을 고정하면 그림은 제자리에 남고 박스만 달라붙는다.
 *
 * ⚠️ 원본을 그대로 돌려줄 수 있다. 호출자가 참조 비교로 변경 여부를 판단해도 된다.
 */
export function normalizeShapeRect(obj: PDFCanvasObject, rect: Rect): Rect {
  if (obj.type !== 'shape' || !isLineShape(obj.shape)) return rect
  const h = round2(lineShapeHeight(obj.shape, obj.style.strokeWidth, rect.w))
  if (h === rect.h) return rect
  return { x: rect.x, y: round2(rect.y + (rect.h - h) / 2), w: rect.w, h }
}
