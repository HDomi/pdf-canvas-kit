/**
 * 커스텀 객체 타입. **프레임워크와 무관하다** — React 예제와 같은 정의 방식이다.
 *
 * `kind` 가 Editor↔Viewer 계약이므로 양쪽에 같은 배열을 넘긴다 (PLAN D25).
 */
import { defineObjectType } from 'pdf-canvas-kit'

export interface Answer {
  /** 정답. 학생에게 가면 안 된다. */
  answers: string[]
  points: number
  /** 학생 응답. 편집 시점에는 없다. */
  response?: string
}

/** 뷰어가 보는 형태. `toPublic` 이 `answers` 를 지운 결과다. */
export type PublicAnswer = Omit<Answer, 'answers'>

/*
 * 제네릭이 둘이다. 두 번째를 주지 않으면 뷰어 슬롯의 데이터가 `Answer` 로 보이고, 실제로는
 * 없는 `answers` 를 타입이 있다고 말한다 (ARCHITECTURE §18.4).
 */
export const shortAnswer = defineObjectType<Answer, PublicAnswer>({
  kind: 'example.shortAnswer',
  label: '단답형',
  defaultSize: { w: 160, h: 44 },
  minSize: { w: 80, h: 32 },
  defaultData: () => ({ answers: [], points: 1 }),
  rotatable: false,
  validate: (d) => (d.answers.some((a) => a.trim()) ? null : ['정답을 입력하세요']),
  toPublic: ({ answers: _answers, ...rest }) => rest,
})
