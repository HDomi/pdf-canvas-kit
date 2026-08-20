/**
 * 단답형 Answer Box. 편집기에서는 학생이 보게 될 입력창을 흉내낸 자리로만 보여준다.
 *
 * 실제 입력 요소(`<input>`)를 쓰지 않는다. 편집 중에는 클릭이 객체 선택으로 가야 하는데,
 * 입력 요소를 두면 포커스를 가로채고 드래그도 막는다. 학생용 뷰어에서 진짜 input 이 된다 (M10).
 *
 * 구 `src/vue/editor/objects/ShortAnswerView.vue` 의 이식.
 */
import { el, when } from '../../h'
import type { ReadSignal } from '../../reactive'
import { boxStyleToCss } from '../../../core/model/boxStyle'
import type { ShortAnswerBox } from '../../../core/model/types'
import type { Translate } from '../../../controller/i18n'
import { answerBadges } from './objectView'

export interface ShortAnswerViewProps {
  object: ReadSignal<ShortAnswerBox>
  questionNumber: () => string | null
  t: ReadSignal<Translate>
}

export function shortAnswerView(props: ShortAnswerViewProps): HTMLElement {
  /** 정답이 하나도 없으면 내보내기가 막힌다 (기획 6.3). 편집 중에도 티가 나야 한다. */
  const hasAnswer = () => props.object.value.answers.some((a) => a.trim().length > 0)

  return el(
    'div',
    {
      class: 'pck-answer pck-answer--short',
      // 교사가 지정한 색만 인라인으로 덮는다. 미지정 필드는 CSS 토큰 기본값이 유지된다.
      style: () => boxStyleToCss(props.object.value.style),
    },
    [
      answerBadges(props.questionNumber, () => props.object.value.points),
      when(
        () => !hasAnswer(),
        () => el('span', { class: 'pck-answer-hint' }, [() => props.t.value('canvas.noAnswer')]),
      ),
    ],
  )
}
