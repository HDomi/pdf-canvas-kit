/**
 * 서술형 Answer Box. 자동 채점이 불가하므로 편집기에서 정답 상태를 표시할 것이 없다.
 *
 * 채점 가이드(`rubric`)는 교사용이며 학생에게 노출되지 않으므로 캔버스에도 그리지 않는다.
 *
 * 구 `src/vue/editor/objects/EssayAnswerView.vue` 의 이식.
 */
import { el } from '../../h'
import type { ReadSignal } from '../../reactive'
import { text } from '../../../core/config/strings'
import { boxStyleToCss } from '../../../core/model/boxStyle'
import type { EssayAnswerBox } from '../../../core/model/types'
import { answerBadges } from './objectView'

export interface EssayAnswerViewProps {
  object: ReadSignal<EssayAnswerBox>
  questionNumber: () => string | null
}

export function essayAnswerView(props: EssayAnswerViewProps): HTMLElement {
  return el(
    'div',
    {
      class: 'pck-answer pck-answer--essay',
      style: () => boxStyleToCss(props.object.value.style),
    },
    [
      answerBadges(props.questionNumber, () => props.object.value.points),
      el('span', { class: 'pck-answer-hint' }, [() => text('canvas.essayManual')]),
    ],
  )
}
