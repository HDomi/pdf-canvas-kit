/**
 * 문항 채점 (기획 3.3).
 *
 * 순수 함수로 두어 서버와 동일한 로직을 공유할 수 있게 한다. 클라이언트가 보여준 점수와 리포트가
 * 달라지는 상황을 막는 것이 목적이다.
 */
import type { AnswerBox, PDFCanvasObject } from '../model/types'
import { matchesAnyAnswer, matchesChoiceSet } from './normalize'

/** 학생의 한 문항 응답. */
export type Response =
  | { type: 'answer.short'; value: string }
  | { type: 'answer.essay'; value: string }
  | { type: 'answer.dropbox'; choiceIds: string[] }

/**
 * 서술형 채점 상태 (기획 3.3).
 * `ungraded` 는 점수에 반영되지 않는다 — 0점과 구분해야 리포트가 정확하다.
 */
export type EssayVerdict = 'ungraded' | 'correct' | 'incorrect'

export interface ItemScore {
  objectId: string
  /** 배점 전액 또는 0. 부분 점수는 없다. */
  score: number
  points: number
  /** 자동 채점 결과. 서술형은 교사 지정 전까지 null. */
  correct: boolean | null
  /** 점수 집계에 포함할 수 있는지. 미채점 서술형은 false. */
  graded: boolean
}

/** Answer Box 여부. 채점 대상만 걸러낸다. */
export function isGradableObject(obj: PDFCanvasObject): obj is AnswerBox {
  return obj.type === 'answer.short' || obj.type === 'answer.essay' || obj.type === 'answer.dropbox'
}

/**
 * 한 문항을 채점한다.
 *
 * @param verdict 서술형에만 쓰는 교사 판정. 없으면 `ungraded`.
 */
export function scoreItem(
  box: AnswerBox,
  response: Response | undefined,
  verdict: EssayVerdict = 'ungraded',
): ItemScore {
  const base = { objectId: box.id, points: box.points }

  // 미응답은 오답이다 (기획 3.3). 단 서술형 미응답도 교사가 채점할 수 있어야 하므로
  // 자동으로 0점 확정하지 않고 판정을 따른다.
  switch (box.type) {
    case 'answer.short': {
      const value = response?.type === 'answer.short' ? response.value : ''
      const correct = matchesAnyAnswer(value, box.answers)
      return { ...base, correct, graded: true, score: correct ? box.points : 0 }
    }

    case 'answer.dropbox': {
      const ids = response?.type === 'answer.dropbox' ? response.choiceIds : []
      const correct = matchesChoiceSet(ids, box.correctChoiceIds)
      return { ...base, correct, graded: true, score: correct ? box.points : 0 }
    }

    case 'answer.essay': {
      if (verdict === 'ungraded') {
        return { ...base, correct: null, graded: false, score: 0 }
      }
      const correct = verdict === 'correct'
      return { ...base, correct, graded: true, score: correct ? box.points : 0 }
    }
  }
}

export interface AttemptScore {
  items: ItemScore[]
  /** 채점된 문항의 획득 점수 합. */
  score: number
  /** 채점된 문항의 배점 합. 미채점 서술형은 제외된다. */
  gradedPoints: number
  /** 문서 전체 배점 합. 진행률 표시에 쓴다. */
  totalPoints: number
  /** 아직 교사 채점이 필요한 서술형 개수. */
  pendingEssays: number
}

/**
 * 응시 전체를 채점한다.
 *
 * `gradedPoints` 와 `totalPoints` 를 나눠 두는 이유: 서술형이 미채점인 동안 분모를 전체 배점으로
 * 쓰면 점수가 실제보다 낮게 보인다. 리포트가 "현재까지 채점된 범위"를 정확히 말할 수 있어야 한다.
 */
export function scoreAttempt(
  objects: readonly PDFCanvasObject[],
  responses: Readonly<Record<string, Response>>,
  verdicts: Readonly<Record<string, EssayVerdict>> = {},
): AttemptScore {
  const boxes = objects.filter(isGradableObject)
  const items = boxes.map((box) =>
    scoreItem(box, responses[box.id], verdicts[box.id] ?? 'ungraded'),
  )
  return {
    items,
    score: items.reduce((n, i) => n + i.score, 0),
    gradedPoints: items.filter((i) => i.graded).reduce((n, i) => n + i.points, 0),
    totalPoints: boxes.reduce((n, b) => n + b.points, 0),
    pendingEssays: items.filter((i) => !i.graded).length,
  }
}
