/**
 * 뷰어의 커스텀 객체 — **학생이 답을 쓴다** (PLAN D29).
 *
 * 여기서는 콘텐츠가 포인터 이벤트를 받는다. 편집기와 반대인 이유는 화면의 목적이 다르기
 * 때문이다 — 뷰어에는 드래그가 없으므로 프레임이 이벤트를 먹을 이유가 없다.
 *
 * `data` 에 `answers` 가 **없다.** `toPublic` 이 지웠고 타입도 그 사실을 안다
 * (`PublicAnswer`) — 두 번째 제네릭이 그걸 정정한다 (ARCHITECTURE §18.4).
 */
import type { CustomSlotProps } from 'pdf-canvas-kit/react'
import type { PublicAnswer } from '../objectType'

export function AnswerInput({ data, onChange }: CustomSlotProps<PublicAnswer>) {
  return (
    <input
      className="pck-input ex-answer"
      placeholder={`답을 입력하세요 (${data.points}점)`}
      value={data.response ?? ''}
      onChange={(e) => onChange({ ...data, response: e.target.value })}
    />
  )
}
