/**
 * 내보내기 검증 규칙 (PLAN 12).
 *
 * 인스펙터의 실시간 경고와 내보내기 차단이 **같은 함수**를 쓴다. 두 곳에서 따로 판단하면
 * "인스펙터는 통과인데 내보내기가 막히는" 상태가 생기고, 교사는 이유를 알 수 없다.
 *
 * 규칙은 순수 함수이며 문서만 입력으로 받는다. 그래서 서버가 같은 규칙을 재사용할 수 있다.
 */
import { LIMITS } from '../config/defaults'
import type { PDFCanvasDoc, PDFCanvasObject } from '../model/types'
import { countAnswerBoxes, isAnswerBox } from '../commands/objects'

/** 검증 실패 코드. UI가 i18n 키로 매핑한다. */
export type IssueCode =
  | 'EMPTY_DOC'
  | 'SHORT_NO_ANSWER'
  | 'SHORT_ANSWER_TOO_LONG'
  | 'DROPBOX_FEW_CHOICES'
  | 'DROPBOX_NO_CORRECT'
  | 'DROPBOX_DUPLICATE_CHOICE'
  | 'CHOICE_TOO_LONG'
  | 'POINTS_INVALID'
  | 'BOX_LIMIT_PAGE'
  | 'BOX_LIMIT_DOC'
  | 'PAGE_LIMIT'

export interface ValidationIssue {
  code: IssueCode
  /** 문제가 있는 페이지. 문서 전체 문제면 null. */
  pageId: string | null
  /** 0-based 페이지 인덱스. UI가 해당 페이지로 이동할 때 쓴다. */
  pageIndex: number | null
  /** 문제가 있는 객체. 페이지·문서 수준 문제면 null. */
  objectId: string | null
}

export interface ValidationResult {
  ok: boolean
  issues: ValidationIssue[]
}

/** 코드 → i18n 키. 인스펙터와 내보내기가 같은 문구를 쓴다. */
export const ISSUE_MESSAGE_KEYS: Record<IssueCode, string> = {
  EMPTY_DOC: 'error.emptyDoc',
  SHORT_NO_ANSWER: 'error.answerRequired',
  SHORT_ANSWER_TOO_LONG: 'error.max50',
  DROPBOX_FEW_CHOICES: 'error.dropboxIncomplete',
  DROPBOX_NO_CORRECT: 'error.dropboxIncomplete',
  DROPBOX_DUPLICATE_CHOICE: 'error.duplicateChoice',
  CHOICE_TOO_LONG: 'error.max50',
  POINTS_INVALID: 'error.pointsRequired',
  BOX_LIMIT_PAGE: 'error.boxLimit',
  BOX_LIMIT_DOC: 'error.boxLimit',
  PAGE_LIMIT: 'error.pageLimit',
}

/** 배점은 1 이상 정수여야 한다 (기획 6.4). */
function invalidPoints(points: number): boolean {
  return !Number.isInteger(points) || points < 1
}

/**
 * 객체 하나를 검증한다.
 *
 * 인스펙터가 이 함수를 직접 호출해 실시간 경고를 띄운다. 그래서 문서 전체를 훑지 않는다.
 */
export function validateObject(obj: PDFCanvasObject): IssueCode[] {
  const codes: IssueCode[] = []

  if (isAnswerBox(obj) && invalidPoints(obj.points)) codes.push('POINTS_INVALID')

  switch (obj.type) {
    case 'answer.short': {
      const filled = obj.answers.filter((a) => a.trim().length > 0)
      if (filled.length === 0) codes.push('SHORT_NO_ANSWER')
      if (filled.some((a) => a.length > LIMITS.choiceChars)) codes.push('SHORT_ANSWER_TOO_LONG')
      break
    }

    case 'answer.dropbox': {
      const filled = obj.choices.filter((c) => c.label.trim().length > 0)
      if (filled.length < LIMITS.dropboxChoices.min) codes.push('DROPBOX_FEW_CHOICES')
      if (filled.some((c) => c.label.length > LIMITS.choiceChars)) codes.push('CHOICE_TOO_LONG')

      // 중복 판정은 채점과 같은 정규화를 쓰지 않는다. 학생에게 보이는 라벨이 다르면
      // 서로 다른 보기로 취급하는 편이 자연스럽고, 공백만 다른 보기는 사실상 실수다.
      const labels = filled.map((c) => c.label.trim())
      if (new Set(labels).size !== labels.length) codes.push('DROPBOX_DUPLICATE_CHOICE')

      // 비어 있는 보기가 정답으로 지정돼 있으면 정답이 없는 것과 같다.
      const validCorrect = obj.correctChoiceIds.filter((id) => filled.some((c) => c.id === id))
      if (validCorrect.length === 0) codes.push('DROPBOX_NO_CORRECT')
      break
    }

    // 서술형은 교사가 Report에서 채점하므로 정답 관련 검증이 없다 (기획 3.3).
    case 'answer.essay':
    case 'text':
    case 'shape':
    case 'mask':
      break
  }

  return codes
}

/**
 * 문서 전체를 검증한다. 내보내기 게이트가 호출한다.
 *
 * 페이지가 0인 경우는 버튼 비활성으로도 막지만, 여기서도 코드를 낸다. 호출 경로가 여럿이므로
 * 한 곳에서 판단해야 한다.
 */
export function validateDoc(doc: PDFCanvasDoc): ValidationResult {
  const issues: ValidationIssue[] = []

  if (doc.pages.length === 0) {
    issues.push({ code: 'EMPTY_DOC', pageId: null, pageIndex: null, objectId: null })
  }
  if (doc.pages.length > LIMITS.pagesPerDoc) {
    issues.push({ code: 'PAGE_LIMIT', pageId: null, pageIndex: null, objectId: null })
  }

  const counts = countAnswerBoxes(doc)
  if (counts.total > LIMITS.answerBoxesPerDoc) {
    issues.push({ code: 'BOX_LIMIT_DOC', pageId: null, pageIndex: null, objectId: null })
  }

  doc.pages.forEach((page, pageIndex) => {
    if ((counts.perPage.get(page.id) ?? 0) > LIMITS.answerBoxesPerPage) {
      issues.push({ code: 'BOX_LIMIT_PAGE', pageId: page.id, pageIndex, objectId: null })
    }
    for (const obj of page.objects) {
      for (const code of validateObject(obj)) {
        issues.push({ code, pageId: page.id, pageIndex, objectId: obj.id })
      }
    }
  })

  return { ok: issues.length === 0, issues }
}

/** 내보내기를 막는 객체 id 집합. 캔버스 하이라이트에 쓴다. */
export function invalidObjectIds(result: ValidationResult): Set<string> {
  const ids = new Set<string>()
  for (const issue of result.issues) if (issue.objectId) ids.add(issue.objectId)
  return ids
}
