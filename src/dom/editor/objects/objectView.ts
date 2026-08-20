/**
 * 캔버스 객체 하나를 렌더한다. 유형별 뷰로 분기하는 얇은 껍데기다.
 *
 * ## 좌표를 계산하지 않는다 ★
 *
 * pt 값을 px 에 **그대로** 쓴다. 배율은 부모 페이지 엘리먼트의 `transform: scale()` 이 처리하므로
 * 여기에 곱셈이 없다 (PLAN 5.3). 그래서 이 디렉토리에서는 `geometry/units` import 를 ESLint 가
 * 막는다 — 좌표 변환을 하려는 시도 자체가 설계 위반이다.
 *
 * 드래그 중에는 `previewRect` 가 들어온다. 문서를 아직 바꾸지 않은 상태에서 위치만 미리 보여주기
 * 위한 것으로, 커밋은 `pointerup` 에서 한 번 일어난다 (PLAN 11.2).
 *
 * 구 `src/vue/editor/objects/ObjectView.vue` 의 이식.
 */
import { el, when, type Child } from '../../h'
import type { ReadSignal } from '../../reactive'
import type { PDFCanvasObject, Rect } from '../../../core/model/types'
import type { Translate } from '../../../controller/i18n'
import { dropboxAnswerView } from './dropboxAnswerView'
import { essayAnswerView } from './essayAnswerView'
import { maskView } from './maskView'
import { shapeObjectView } from './shapeObjectView'
import { shortAnswerView } from './shortAnswerView'
import { textObjectView } from './textObjectView'

export interface ObjectViewProps {
  /** 객체. 리스트 재조정이 이 signal 만 갱신하므로 노드는 재사용된다 (§13.3). */
  object: ReadSignal<PDFCanvasObject>
  selected: () => boolean
  /** 내보내기를 막는 상태면 true. 테두리를 경고색으로 바꾼다. */
  invalid: () => boolean
  /** 드래그·리사이즈 중 미리보기 rect. 없으면 문서 값을 쓴다. */
  previewRect: () => Rect | null
  /** 회전 중 미리보기 각도. 없으면 문서 값을 쓴다. */
  previewRotation: () => number | null
  /** 이 객체가 인라인 텍스트 편집 중인지. */
  editing: () => boolean
  /** 자동 부여된 문항 번호. Answer Box 에만 표시한다 (PLAN Q9). */
  questionNumber: () => string | null
  t: ReadSignal<Translate>
  onEditText: (value: string) => void
}

export function objectView(props: ObjectViewProps): HTMLElement {
  const rect = () => props.previewRect() ?? props.object.value.rect
  const rotation = () => props.previewRotation() ?? props.object.value.rotation ?? 0

  /**
   * 유형은 객체 수명 동안 바뀌지 않는다.
   *
   * 인스펙터는 속성만 고치고, 유형을 바꾸는 커맨드는 없다. 유형이 바뀌면 id 가 다른 새 객체이고
   * `list()` 가 키로 노드를 새로 만든다(§13.3). 그래서 여기서 분기를 한 번만 하고,
   * `when()` 으로 매번 판정하지 않는다.
   */
  const type = props.object.value.type

  return el(
    'div',
    {
      class: {
        'pck-obj': true,
        [`is-${type.replace('.', '-')}`]: true,
        'is-selected': props.selected,
        'is-invalid': props.invalid,
        'is-editing': props.editing,
      },
      attr: { 'data-object-id': props.object.value.id },
      style: {
        left: () => rect().x,
        top: () => rect().y,
        width: () => rect().w,
        height: () => rect().h,
        // 회전이 0이면 프로퍼티를 지운다 — 빈 transform 이 남으면 합성 레이어가 생긴다.
        transform: () => (rotation() ? `rotate(${rotation()}deg)` : null),
        'transform-origin': () => (rotation() ? 'center' : null),
      },
    },
    [inner(type, props)],
  )
}

function inner(type: PDFCanvasObject['type'], props: ObjectViewProps): Child {
  const questionNumber = props.questionNumber
  const t = props.t

  switch (type) {
    case 'text':
      return textObjectView({
        object: props.object as ReadSignal<Extract<PDFCanvasObject, { type: 'text' }>>,
        editing: props.editing,
        onEdit: props.onEditText,
      })

    case 'shape':
      return shapeObjectView({
        object: props.object as ReadSignal<Extract<PDFCanvasObject, { type: 'shape' }>>,
      })

    case 'mask':
      return maskView({
        object: props.object as ReadSignal<Extract<PDFCanvasObject, { type: 'mask' }>>,
      })

    case 'answer.short':
      return shortAnswerView({
        object: props.object as ReadSignal<Extract<PDFCanvasObject, { type: 'answer.short' }>>,
        questionNumber,
        t,
      })

    case 'answer.essay':
      return essayAnswerView({
        object: props.object as ReadSignal<Extract<PDFCanvasObject, { type: 'answer.essay' }>>,
        questionNumber,
        t,
      })

    case 'answer.dropbox':
      return dropboxAnswerView({
        object: props.object as ReadSignal<Extract<PDFCanvasObject, { type: 'answer.dropbox' }>>,
        questionNumber,
        t,
      })
  }
}

/**
 * Answer Box 3종이 공유하는 앞머리 — 문항 번호 배지와 배점.
 *
 * 세 뷰에 같은 두 줄을 복사해 두면 배지 순서나 클래스가 갈라진다. 실제로 Vue 판에서
 * 세 파일이 같은 마크업을 각자 들고 있었다.
 */
export function answerBadges(questionNumber: () => string | null, points: () => number): Child[] {
  return [
    when(
      () => questionNumber() !== null,
      () => el('span', { class: 'pck-answer-no' }, [() => questionNumber()]),
    ),
    el('span', { class: 'pck-answer-badge' }, [points]),
  ]
}
