/**
 * pt 크기를 인쇄 용지 이름으로 매칭한다. 스테이지 위의 "1 / 3 · A4 세로" 표기에 쓴다.
 */
import type { Size } from '../model/types'

export type Orientation = 'portrait' | 'landscape'

export interface PaperMatch {
  /** 표준 용지 이름. 일치하는 게 없으면 null. */
  name: string | null
  orientation: Orientation
  size: Size
}

/** 세로 방향 기준 크기(pt). */
const PAPERS: { name: string; width: number; height: number }[] = [
  { name: 'A3', width: 842, height: 1191 },
  { name: 'A4', width: 595, height: 842 },
  { name: 'A5', width: 420, height: 595 },
  { name: 'B5', width: 499, height: 709 },
  { name: 'Letter', width: 612, height: 792 },
  { name: 'Legal', width: 612, height: 1008 },
]

/** 생성 도구마다 반올림이 달라 정확히 일치하는 경우는 드물다. */
const TOLERANCE_PT = 3

export function matchPaper(size: Size): PaperMatch {
  const orientation: Orientation = size.width > size.height ? 'landscape' : 'portrait'
  // 페이지 방향과 무관하게 세로 기준 크기와 비교한다.
  const short = Math.min(size.width, size.height)
  const long = Math.max(size.width, size.height)

  const hit = PAPERS.find(
    (p) => Math.abs(p.width - short) <= TOLERANCE_PT && Math.abs(p.height - long) <= TOLERANCE_PT,
  )

  return { name: hit?.name ?? null, orientation, size }
}

export interface PaperLabelStrings {
  portrait: string
  landscape: string
  /** 이미 라운드된 width/height를 받는다. */
  custom: (w: number, h: number) => string
}

const KO: PaperLabelStrings = {
  portrait: '세로',
  landscape: '가로',
  custom: (w, h) => `사용자 지정 (${w}×${h}pt)`,
}

/**
 * 표시용으로 페이지 크기를 문자열로 만든다. 일치하는 용지가 없으면 raw pt로 떨어지는데,
 * 슬라이드나 스캔 문서에서 흔한 경우다.
 */
export function formatPaperLabel(size: Size, strings: PaperLabelStrings = KO): string {
  const m = matchPaper(size)
  if (!m.name) return strings.custom(Math.round(size.width), Math.round(size.height))
  return `${m.name} ${m.orientation === 'landscape' ? strings.landscape : strings.portrait}`
}
