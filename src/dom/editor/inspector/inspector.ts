/**
 * 우측 인스펙터 패널 (기획 1.6).
 *
 * 선택 상태에 따라 유형별 패널로 분기한다. 검증 경고는 내보내기 게이트와 **같은 규칙**을 쓰므로
 * (`validateObject`), 여기서 통과한 문항이 내보내기에서 막히는 일이 없다 (PLAN 12).
 *
 * 구 `src/vue/editor/inspector/Inspector.vue` 의 이식.
 */
import { el, when } from '../../h'
import { computed, type ReadSignal } from '../../reactive'
import { text } from '../../../core/config/strings'
import { mergeBoxStyle, type BoxStylePatch } from '../../../core/model/boxStyle'
import { validateObject } from '../../../core/validation/rules'
import type {
  BoxStyle,
  DropboxAnswerBox,
  EssayAnswerBox,
  PDFCanvasObject,
  ShapeObject,
  ShortAnswerBox,
  TextObject,
} from '../../../core/model/types'
import { dropboxPanel, essayPanel, shortAnswerPanel } from './answerPanels'
import { boxStylePanel } from './boxStylePanel'
import { field, numberInput, panelSection, textInput } from './fields'
import { shapePanel, textPanel } from './objectPanels'

export interface InspectorProps {
  /** 선택된 객체들. 0개면 빈 상태, 2개 이상이면 개수만 보여준다. */
  selected: ReadSignal<readonly PDFCanvasObject[]>
  /** 자동 부여된 문항 번호. 수동 입력이 비어 있을 때 placeholder 로 보여준다 (PLAN Q9). */
  autoNumber: ReadSignal<string | null>
  readOnly: ReadSignal<boolean>
  onUpdate: (objectId: string, patch: Partial<PDFCanvasObject>) => void
  onRemove: (objectId: string) => void
  /** 회전은 별도 커맨드다. Answer Box 를 거르는 불변식이 커맨드에 있다. */
  onRotate: (objectId: string, deg: number) => void
}

/** 텍스트의 글자색은 필수 필드다. 지정을 지우면 이 값으로 되돌린다. */
const DEFAULT_TEXT_COLOR = '#1c1c1a'

export function inspector(props: InspectorProps): HTMLElement {
  /** 다중 선택에는 공통 편집 UI 를 두지 않는다. 유형이 섞이면 무엇을 바꿀지 정의가 필요하다. */
  const single = computed<PDFCanvasObject | null>(() =>
    props.selected.value.length === 1 ? props.selected.value[0]! : null,
  )

  const issues = computed<readonly string[]>(() =>
    single.value ? validateObject(single.value) : [],
  )

  const isAnswerBox = () => {
    const t = single.value?.type
    return t === 'answer.short' || t === 'answer.essay' || t === 'answer.dropbox'
  }

  /**
   * 색 편집이 가능한 유형 (PLAN 18.8).
   *
   * 도형은 자기 전용 패널에서 채움·테두리를 다루므로 여기서 제외한다. 두 곳에서 같은 값을
   * 편집하면 어느 쪽이 이기는지 알 수 없다.
   */
  const styleable = () => single.value?.type === 'text' || isAnswerBox()

  /** 회전 가능한 유형만 회전 입력을 보여준다 (PLAN Q8). */
  const rotatable = () => {
    const t = single.value?.type
    return t === 'text' || t === 'shape' || t === 'mask'
  }

  function patch(p: Partial<PDFCanvasObject>) {
    const obj = single.value
    if (!obj || props.readOnly.value) return
    props.onUpdate(obj.id, p)
  }

  /**
   * 현재 객체의 박스 스타일.
   *
   * 텍스트는 `style` 안에 글꼴 속성과 색이 섞여 있고, Answer Box 는 `style` 이 색 전용이다.
   * 패널에는 색 부분만 넘긴다.
   */
  const boxStyle = computed<BoxStyle | undefined>(() => {
    const obj = single.value
    if (!obj) return undefined
    if (obj.type === 'text') {
      const s = obj.style
      const out: BoxStyle = { color: s.color }
      if (s.fill !== undefined) out.fill = s.fill
      if (s.stroke !== undefined) out.stroke = s.stroke
      if (s.strokeWidth !== undefined) out.strokeWidth = s.strokeWidth
      return out
    }
    return 'style' in obj ? obj.style : undefined
  })

  /**
   * 색 패치를 적용한다.
   *
   * 텍스트는 글꼴 속성과 한 객체에 있으므로 `style` 전체를 다시 만들어야 한다. Answer Box 는
   * `style` 이 색 전용이라 `mergeBoxStyle` 결과를 그대로 넣는다.
   */
  function patchBoxStyle(p: BoxStylePatch) {
    const obj = single.value
    if (!obj || props.readOnly.value) return

    if (obj.type === 'text') {
      const merged = mergeBoxStyle(boxStyle.value, p) ?? {}
      const style: TextObject['style'] = {
        ...obj.style,
        color: merged.color ?? DEFAULT_TEXT_COLOR,
      }
      // `exactOptionalPropertyTypes`: 지정이 없으면 키 자체를 지운다.
      if (merged.fill !== undefined) style.fill = merged.fill
      else delete style.fill
      if (merged.stroke !== undefined) style.stroke = merged.stroke
      else delete style.stroke
      if (merged.strokeWidth !== undefined) style.strokeWidth = merged.strokeWidth
      else delete style.strokeWidth
      patch({ style })
      return
    }

    patch({ style: mergeBoxStyle(boxStyle.value, p) } as Partial<PDFCanvasObject>)
  }

  /**
   * 유형별 패널. **유형마다 `when` 을 따로 둔다.**
   *
   * 하나의 `when` 안에서 `switch` 로 분기하면 조건이 "단일 선택인가" 로 고정되어, 다른 유형의
   * 객체를 선택해도 조건이 참을 유지해 **패널이 바뀌지 않는다.** 조건을 유형으로 두면
   * 유형이 바뀔 때만 재생성되고, 같은 유형 안에서 객체를 옮겨 선택하면 signal 만 갱신된다.
   */
  const isType = (t: PDFCanvasObject['type']) => () => single.value?.type === t

  const typePanels = [
    when(isType('answer.short'), () =>
      shortAnswerPanel(
        computed(() => single.value as ShortAnswerBox),
        issues,
        patch,
      ),
    ),
    when(isType('answer.essay'), () =>
      essayPanel(
        computed(() => single.value as EssayAnswerBox),
        patch,
      ),
    ),
    when(isType('answer.dropbox'), () =>
      dropboxPanel(
        computed(() => single.value as DropboxAnswerBox),
        issues,
        patch,
      ),
    ),
    when(isType('text'), () =>
      textPanel(
        computed(() => single.value as TextObject),
        patch,
      ),
    ),
    when(isType('shape'), () =>
      shapePanel(
        computed(() => single.value as ShapeObject),
        patch,
      ),
    ),
  ]

  return el('aside', { class: 'pck-inspector' }, [
    el('header', { class: 'pck-panel-head' }, [
      el('span', {}, [text('inspector.title')]),
      when(
        () => single.value !== null,
        () =>
          el('span', { class: 'pck-panel-count' }, [
            () => text(`inspector.type.${single.value?.type ?? ''}`),
          ]),
      ),
    ]),

    el('div', { class: 'pck-inspector-body' }, [
      when(
        () => props.selected.value.length === 0,
        () => el('p', { class: 'pck-panel-empty' }, [text('inspector.empty')]),
      ),

      when(
        () => props.selected.value.length > 1,
        () =>
          el('p', { class: 'pck-panel-empty' }, [
            () => text('inspector.multiple', { count: props.selected.value.length }),
          ]),
      ),

      /*
       * 단일 선택 본문.
       *
       * 조건이 "단일 선택인가" 이므로 다른 객체를 선택해도 이 껍데기는 재생성되지 않는다 —
       * 안쪽 입력들이 signal 을 읽어 값만 갱신한다. 유형이 바뀔 때 패널을 바꾸는 것은
       * `typePanels` 가 유형별 `when` 으로 처리한다.
       */
      when(
        () => single.value !== null,
        () =>
          el('div', {}, [
            // 문항 번호 수동 오버라이드 (PLAN Q9)
            when(isAnswerBox, () =>
              field(
                text('inspector.label'),
                textInput({
                  value: () => {
                    const obj = single.value
                    return obj && 'label' in obj ? (obj.label ?? '') : ''
                  },
                  maxlength: 12,
                  placeholder: () => props.autoNumber.value ?? false,
                  onInput: (label) => patch({ label }),
                }),
                text('inspector.labelNote'),
              ),
            ),

            // 배점 — 1 이상 정수. 유효하지 않아도 입력을 되돌리지 않고 경고만 띄운다.
            when(isAnswerBox, () =>
              panelSection(null, [
                field(
                  text('inspector.points'),
                  numberInput({
                    value: () => {
                      const obj = single.value
                      return obj && 'points' in obj ? obj.points : 0
                    },
                    min: 1,
                    step: 1,
                    fallback: 0,
                    invalid: () => issues.value.includes('POINTS_INVALID'),
                    onInput: (points) => patch({ points }),
                  }),
                ),
                when(
                  () => issues.value.includes('POINTS_INVALID'),
                  () =>
                    el('p', { class: 'pck-field-error', attr: { role: 'alert' } }, [
                      text('error.pointsRequired'),
                    ]),
                ),
              ]),
            ),

            typePanels,

            when(styleable, () => boxStylePanel(boxStyle, patchBoxStyle)),

            when(rotatable, () =>
              field(
                text('inspector.rotation'),
                numberInput({
                  value: () => Math.round(single.value?.rotation ?? 0),
                  min: 0,
                  max: 359,
                  step: 1,
                  fallback: 0,
                  onInput: (deg) => {
                    const obj = single.value
                    if (obj) props.onRotate(obj.id, deg)
                  },
                }),
              ),
            ),

            el(
              'button',
              {
                class: 'pck-ghost-btn pck-inspector-delete',
                attr: { type: 'button' },
                prop: { disabled: () => props.readOnly.value },
                on: {
                  click: () => {
                    const obj = single.value
                    if (obj) props.onRemove(obj.id)
                  },
                },
              },
              [text('inspector.delete')],
            ),
          ]),
      ),
    ]),
  ])
}
