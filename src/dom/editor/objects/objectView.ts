/**
 * 캔버스 객체 하나를 렌더한다. 유형별 뷰로 분기하는 얇은 껍데기다.
 *
 * ## 좌표를 계산하지 않는다 ★
 *
 * pt 값을 px 에 **그대로** 쓴다. 배율은 부모 페이지 엘리먼트의 `transform: scale()` 이 처리하므로
 * 여기에 곱셈이 없다. 그래서 이 디렉토리에서는 `geometry/units` import 를 ESLint 가
 * 막는다 — 좌표 변환을 하려는 시도 자체가 설계 위반이다.
 *
 * 드래그 중에는 `previewRect` 가 들어온다. 문서를 아직 바꾸지 않은 상태에서 위치만 미리 보여주기
 * 위한 것으로, 커밋은 `pointerup` 에서 한 번 일어난다.
 *
 * 구 `src/vue/editor/objects/ObjectView.vue` 의 이식.
 */
import { el, type Child } from '../../h'
import type { ReadSignal } from '../../reactive'
import type { PDFCanvasObject, Rect } from '../../../core/model/types'
import { customObjectView } from './customObjectView'
import { maskView } from './maskView'
import { shapeObjectView } from './shapeObjectView'
import type { ObjectTypeRegistry } from '../../../core/objectTypes'
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
  onEditText: (value: string) => void
  /** 커스텀 객체 타입 레지스트리 (커스텀 객체는 소비자가 정의한다). */
  types?: ObjectTypeRegistry
  /** 커스텀 객체의 데이터 변경. */
  onChangeData?: (next: unknown) => void
  /** 커스텀 객체의 콘텐츠 컨테이너를 알린다. 프레임워크 래퍼가 portal 한다. */
  onMountCustom?: (objectId: string, el: HTMLElement | null) => void
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
        // SVG 는 크기를 스스로 쓴다. 미리보기를 넘기지 않으면 드래그 중 제자리에 남는다.
        previewRect: props.previewRect,
      })

    case 'mask':
      return maskView({
        object: props.object as ReadSignal<Extract<PDFCanvasObject, { type: 'mask' }>>,
      })

    case 'custom':
      return customObjectView({
        object: props.object as ReadSignal<Extract<PDFCanvasObject, { type: 'custom' }>>,
        selected: props.selected,
        types: props.types,
        onChange: (next) => props.onChangeData?.(next),
        // 슬롯의 ctx.rect() 가 드래그 중에도 맞아야 한다.
        previewRect: props.previewRect,
        ...(props.onMountCustom ? { onMount: props.onMountCustom } : {}),
      })
  }
}
