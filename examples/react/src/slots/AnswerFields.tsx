/**
 * 편집기 인스펙터의 커스텀 객체 패널 — 교사가 정답·배점을 넣는다.
 *
 * portal 안이라 **포커스 가드가 필요 없다.** 배열을 늘리고 줄여도 React 가 노드를 유지한다.
 * vanilla 슬롯(`objectType.renderInspector`)은 `render` 가 객체당 한 번만 불려 DOM 을 직접
 * 다뤄야 하고, `document.activeElement` 를 확인해 포커스된 입력을 덮지 않아야 한다
 * (PLAN 20.14). 그 제약이 여기에는 없다.
 */
import type { CustomSlotProps } from 'pdf-canvas-kit/react'
import type { Answer } from '../objectType'

export function AnswerFields({ data, onChange }: CustomSlotProps<Answer>) {
  const setAnswer = (i: number, value: string) => {
    const next = [...data.answers]
    next[i] = value
    onChange({ ...data, answers: next })
  }

  return (
    <div className="ex-fields">
      {data.answers.map((a, i) => (
        <div className="ex-row" key={i}>
          <input
            className="pck-input"
            value={a}
            placeholder={`정답 ${i + 1}`}
            onChange={(e) => setAnswer(i, e.target.value)}
          />
          <button
            type="button"
            className="ex-mini"
            onClick={() => onChange({ ...data, answers: data.answers.filter((_, j) => j !== i) })}
          >
            −
          </button>
        </div>
      ))}
      <button
        type="button"
        className="ex-mini"
        onClick={() => onChange({ ...data, answers: [...data.answers, ''] })}
      >
        + 정답 추가
      </button>
      <label className="ex-label">
        배점
        <input
          className="pck-input pck-input--num"
          type="number"
          min={1}
          value={data.points}
          onChange={(e) => onChange({ ...data, points: Number(e.target.value) || 1 })}
        />
      </label>
    </div>
  )
}
