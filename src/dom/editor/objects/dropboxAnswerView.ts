/**
 * 드롭박스 Answer Box. 학생에게는 select 로 보이지만 편집 중에는 자리와 상태만 보여준다.
 *
 * 실제 select 를 쓰지 않는 이유는 단답형과 같다. 클릭이 객체 선택으로 가야 한다.
 *
 * 구 `src/vue/editor/objects/DropboxAnswerView.vue` 의 이식.
 */
import { el, when } from '../../h'
import type { ReadSignal } from '../../reactive'
import { LIMITS } from '../../../core/config/defaults'
import { text } from '../../../core/config/strings'
import { boxStyleToCss } from '../../../core/model/boxStyle'
import type { DropboxAnswerBox } from '../../../core/model/types'
import { answerBadges } from './objectView'

export interface DropboxAnswerViewProps {
  object: ReadSignal<DropboxAnswerBox>
  questionNumber: () => string | null
}

export function dropboxAnswerView(props: DropboxAnswerViewProps): HTMLElement {
  /** 보기가 최소 개수에 못 미치거나 정답이 없으면 내보내기가 막힌다 (기획 6.3). */
  const incomplete = () => {
    const o = props.object.value
    const filled = o.choices.filter((c) => c.label.trim().length > 0).length
    return filled < LIMITS.dropboxChoices.min || o.correctChoiceIds.length === 0
  }

  return el(
    'div',
    {
      class: 'pck-answer pck-answer--dropbox',
      style: () => boxStyleToCss(props.object.value.style),
    },
    [
      answerBadges(props.questionNumber, () => props.object.value.points),
      el('span', { class: 'pck-answer-caret', attr: { 'aria-hidden': 'true' } }, ['▾']),
      when(incomplete, () =>
        el('span', { class: 'pck-answer-hint' }, [() => text('canvas.dropboxIncomplete')]),
      ),
    ],
  )
}
