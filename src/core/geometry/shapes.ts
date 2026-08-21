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
import type { Pt } from '../model/types'
import type { ShapeKind } from '../model/types'

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
