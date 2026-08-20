/**
 * Answer Box 문항 번호 자동 부여 (PLAN Q9).
 *
 * 리포트가 "문항별 정답률" 을 보여주려면 학생과 교사가 같은 번호로 같은 문항을 가리켜야 한다.
 * 그 번호를 문서에 저장하지 않고 **위치에서 파생**한다.
 *
 * ## 왜 저장하지 않는가
 *
 * 저장하면 객체를 옮기거나 페이지를 삭제할 때마다 전체 번호를 다시 쓰는 커맨드가 필요하고,
 * 그 커맨드가 히스토리를 오염시킨다. 위치에서 계산하면 문서를 건드리지 않고도 항상 최신이다.
 *
 * 대신 교사가 직접 붙인 번호(`label`)는 그대로 존중한다 — 교재의 원래 번호와 맞추고 싶은 경우가
 * 있고, 자동 번호가 그걸 덮으면 안 된다.
 *
 * ## 순서
 *
 * 페이지 순 → 같은 페이지 안에서는 위에서 아래, 같은 높이면 왼쪽에서 오른쪽.
 * 사람이 문제를 읽는 순서다. 같은 줄에 나란히 놓인 두 빈칸이 뒤바뀌지 않도록 y를 먼저 본다.
 *
 * `Y_TOLERANCE_PT` 는 "같은 줄" 의 허용 오차다. 교사가 눈으로 맞춘 빈칸은 몇 pt씩 어긋나 있는데,
 * 그걸 다른 줄로 취급하면 번호가 지그재그로 붙는다.
 */
import type { AnswerBox, Pt, PDFCanvasDoc, PDFCanvasObject } from './types'

/** 같은 줄로 볼 y 오차(pt). 12pt 글자 한 줄 높이보다 작게 잡았다. */
export const Y_TOLERANCE_PT: Pt = 8

/** 번호가 붙는 객체인지. Answer Box만 문항이다. */
function isQuestion(obj: PDFCanvasObject): obj is AnswerBox {
  return obj.type === 'answer.short' || obj.type === 'answer.essay' || obj.type === 'answer.dropbox'
}

/** 읽는 순서 비교. y가 오차 안이면 같은 줄로 보고 x로 정렬한다. */
function readingOrder(a: AnswerBox, b: AnswerBox): number {
  const dy = a.rect.y - b.rect.y
  if (Math.abs(dy) > Y_TOLERANCE_PT) return dy
  return a.rect.x - b.rect.x
}

export interface QuestionNumber {
  objectId: string
  pageId: string
  /** 1부터 시작하는 문서 전체 통과 번호. */
  number: number
  /** 화면에 보여줄 문자열. 교사가 `label` 을 붙였으면 그 값이다. */
  display: string
  /** 교사가 직접 붙인 번호인지. */
  manual: boolean
}

/**
 * 문서의 모든 문항에 번호를 부여한다.
 *
 * 수동 `label` 이 있는 문항도 자동 번호를 함께 갖는다. 번호는 리포트 집계 순서로도 쓰이므로
 * 표시값과 무관하게 일관된 순서가 필요하다.
 */
export function numberQuestions(doc: PDFCanvasDoc): QuestionNumber[] {
  const out: QuestionNumber[] = []
  let n = 0

  for (const page of doc.pages) {
    const questions = page.objects.filter(isQuestion).sort(readingOrder)
    for (const obj of questions) {
      n++
      const label = obj.label?.trim() ?? ''
      const manual = label.length > 0
      out.push({
        objectId: obj.id,
        pageId: page.id,
        number: n,
        display: manual ? label : String(n),
        manual,
      })
    }
  }

  return out
}

/** `objectId → QuestionNumber` 맵. 렌더에서 조회하기 쉽도록. */
export function questionNumberMap(doc: PDFCanvasDoc): Map<string, QuestionNumber> {
  return new Map(numberQuestions(doc).map((q) => [q.objectId, q]))
}

/** 한 페이지 안에서만 번호를 매긴다. 페이지 단위 미리보기에 쓴다. */
export function numberQuestionsOnPage(doc: PDFCanvasDoc, pageIndex: number): QuestionNumber[] {
  const pageId = doc.pages[pageIndex]?.id
  if (!pageId) return []
  return numberQuestions(doc).filter((q) => q.pageId === pageId)
}
