/**
 * 커스텀 객체 타입. **프레임워크와 무관하다** (커스텀 객체는 소비자가 정의한다).
 *
 * `kind` 가 Editor↔Viewer 계약이므로 편집기와 뷰어에 같은 배열을 넘긴다.
 */
import { defineObjectType } from 'pdf-canvas-kit'

export interface Answer {
  /** 정답. 뷰어에 나가면 안 된다. */
  answers: string[]
  points: number
  /** 뷰어 응답. 편집 시점에는 없다. */
  response?: string
}

/** 뷰어가 보는 형태. `toPublic` 이 `answers` 를 지운 결과다. */
export type PublicAnswer = Omit<Answer, 'answers'>

/*
 * 제네릭이 둘이다 (ARCHITECTURE §18.4).
 *
 * 두 번째를 주지 않으면 뷰어 슬롯의 데이터가 `Answer` 로 보이고, 실제로는 없는 `answers` 를
 * 타입이 있다고 말한다.
 */
export const shortAnswer = defineObjectType<Answer, PublicAnswer>({
  kind: 'example.shortAnswer',
  label: '단답형',
  defaultSize: { w: 160, h: 44 },
  minSize: { w: 80, h: 32 },
  defaultData: () => ({ answers: [], points: 1 }),
  // 기울어진 입력은 쓰기 어렵다.
  rotatable: false,
  validate: (d) => (d.answers.some((a) => a.trim()) ? null : ['정답을 입력하세요']),
  toPublic: ({ answers: _answers, ...rest }) => rest,
})

/** 편집기·뷰어 양쪽에 넘기는 목록. */
export const OBJECT_TYPES = [shortAnswer]
