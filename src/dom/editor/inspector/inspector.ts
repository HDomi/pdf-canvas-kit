/**
 * 우측 인스펙터 패널 (기획 1.6, PLAN D25).
 *
 * 선택 상태에 따라 유형별 패널로 분기한다. 내장 유형은 텍스트·도형뿐이고, 커스텀 객체는
 * `objectType.renderInspector` 나 프레임워크 portal 이 채운다.
 *
 * ## 유형별 `when` 을 따로 둔다
 *
 * 하나의 `when(단일 선택인가)` 안에서 `switch` 로 분기하면 다른 유형의 객체를 선택해도 조건이
 * 참을 유지해 **패널이 바뀌지 않는다.** 조건을 유형으로 두면 유형이 바뀔 때만 재생성되고,
 * 같은 유형 안에서 객체를 옮겨 선택하면 signal 만 갱신된다 (ARCHITECTURE §13.2).
 */
import { el, keyed, when } from '../../h'
import { computed, onCleanup, type ReadSignal } from '../../reactive'
import { text } from '../../../core/config/strings'
import { mergeBoxStyle, type BoxStylePatch } from '../../../core/model/boxStyle'
import { validateObject } from '../../../core/validation/rules'
import type { ObjectTypeRegistry } from '../../../core/objectTypes'
import type {
  BoxStyle,
  CustomObject,
  PDFCanvasObject,
  ShapeObject,
  TextObject,
} from '../../../core/model/types'
import { boxStylePanel } from './boxStylePanel'
import { field, numberInput } from './fields'
import { shapePanel, textPanel } from './objectPanels'
import { mountRenderSlot } from '../objects/renderSlot'

export interface InspectorProps {
  /** 선택된 객체들. 0개면 빈 상태, 2개 이상이면 개수만 보여준다. */
  selected: ReadSignal<readonly PDFCanvasObject[]>
  readOnly: ReadSignal<boolean>
  types?: ObjectTypeRegistry
  onUpdate: (objectId: string, patch: Partial<PDFCanvasObject>) => void
  onRemove: (objectId: string) => void
  /** 회전은 별도 커맨드다. 회전 가능 여부는 레지스트리가 정한다. */
  onRotate: (objectId: string, deg: number) => void
  /**
   * 커스텀 객체의 인스펙터 컨테이너를 알린다. 프레임워크 래퍼가 portal 한다.
   *
   * 언마운트 시 `null` 로 한 번 더 불린다.
   */
  onMountInspector?: (objectId: string, el: HTMLElement | null) => void
}

/** 텍스트의 글자색은 필수 필드다. 지정을 지우면 이 값으로 되돌린다. */
const DEFAULT_TEXT_COLOR = '#1c1c1a'

export function inspector(props: InspectorProps): HTMLElement {
  /** 다중 선택에는 공통 편집 UI 를 두지 않는다. 유형이 섞이면 무엇을 바꿀지 정의가 필요하다. */
  const single = computed<PDFCanvasObject | null>(() =>
    props.selected.value.length === 1 ? props.selected.value[0]! : null,
  )

  /** 검증 결과. 커스텀은 소비자 `validate(data)` 가 낸 메시지다. */
  const issues = computed(() => (single.value ? validateObject(single.value, props.types) : []))

  const isType = (t: PDFCanvasObject['type']) => () => single.value?.type === t

  /**
   * 색 편집이 가능한 유형.
   *
   * 도형은 자기 패널에서 채움·테두리를 다루므로 제외한다 — 두 곳에서 같은 값을 편집하면
   * 어느 쪽이 이기는지 알 수 없다. 커스텀은 **기본 틀**의 배경·테두리라 포함한다.
   */
  const styleable = () => single.value?.type === 'text' || single.value?.type === 'custom'

  /** 회전 가능 여부. 커스텀은 레지스트리가 정한다 (기본 허용). */
  const rotatable = () => {
    const obj = single.value
    if (!obj) return false
    if (obj.type === 'text' || obj.type === 'shape' || obj.type === 'mask') return true
    if (obj.type === 'custom') return props.types?.get(obj.kind)?.rotatable !== false
    return false
  }

  function patch(p: Partial<PDFCanvasObject>) {
    const obj = single.value
    if (!obj || props.readOnly.value) return
    props.onUpdate(obj.id, p)
  }

  /**
   * 현재 객체의 박스 스타일.
   *
   * 텍스트는 `style` 안에 글꼴 속성과 색이 섞여 있고, 커스텀은 `style` 이 색 전용이다.
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
    if (obj.type === 'custom') return obj.style
    return undefined
  })

  /**
   * 색 패치를 적용한다.
   *
   * 텍스트는 글꼴 속성과 한 객체에 있으므로 `style` 전체를 다시 만들어야 한다. 커스텀은
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
   * 커스텀 객체 패널.
   *
   * `renderInspector` 가 있으면 그리고, 없으면 컨테이너만 알린다 — 프레임워크 래퍼가
   * portal 하는 경로다 (`customObjectView` 와 같은 규칙).
   */
  function customPanel(): HTMLElement {
    const obj = single.value as CustomObject
    const def = props.types?.get(obj.kind)

    const container = el('section', { class: 'pck-panel-section' })

    if (def?.renderInspector) {
      /*
       * **한 번만** 부른다. 매 변경마다 다시 부르면 입력 중 노드가 파괴되어 한 글자마다
       * 포커스가 날아간다 (PLAN 20.14).
       */
      mountRenderSlot({
        objectId: obj.id,
        container,
        render: def.renderInspector,
        onChange: (data: unknown) => patch({ data }),
        read: () => {
          const current = single.value
          const c = current?.type === 'custom' ? current : obj
          return { data: c.data, rect: c.rect, selected: true }
        },
      })
    } else if (props.onMountInspector) {
      const id = obj.id
      props.onMountInspector(id, container)
      onCleanup(() => props.onMountInspector?.(id, null))
    } else {
      /*
       * 이 타입은 편집할 것을 주지 않았다.
       *
       * 빈 패널을 두면 "왜 편집이 안 되나" 를 알 수 없다. 커스텀 객체의 편집 창구는 인스펙터
       * 하나이므로(PLAN D26), 슬롯이 없다는 사실을 드러내는 편이 낫다.
       */
      container.append(el('p', { class: 'pck-panel-empty' }, [text('inspector.noCustomEditor')]))
    }

    return container
  }

  const typePanels = [
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
    /*
     * 커스텀은 `kind` 로 **키잉**한다.
     *
     * `when` 은 조건을 `!!cond()` 로 보므로 `'demo.shortAnswer'` → `'demo.choice'` 처럼
     * 둘 다 truthy 인 변화를 감지하지 못한다 — 단답형 패널이 그대로 남는다 (PLAN 20.16).
     */
    keyed(
      () => (single.value?.type === 'custom' ? single.value.kind : null),
      () => customPanel(),
    ),
  ]

  return el('aside', { class: 'pck-inspector' }, [
    el('header', { class: 'pck-panel-head' }, [
      el('span', {}, [text('inspector.title')]),
      when(
        () => single.value !== null,
        () =>
          el('span', { class: 'pck-panel-count' }, [() => typeLabel(single.value, props.types)]),
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

      when(
        () => single.value !== null,
        () =>
          el('div', {}, [
            typePanels,

            /* 검증 경고. 소비자 `validate()` 가 낸 메시지를 그대로 보여준다. */
            when(
              () => issues.value.length > 0,
              () =>
                el('div', {}, [
                  el('p', { class: 'pck-field-error', attr: { role: 'alert' } }, [
                    () => issues.value.map((i) => i.message ?? i.code).join(' · '),
                  ]),
                ]),
            ),

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

/** 헤더에 보이는 유형 이름. 커스텀은 레지스트리의 `label` 을 쓴다. */
function typeLabel(obj: PDFCanvasObject | null, types?: ObjectTypeRegistry): string {
  if (!obj) return ''
  if (obj.type === 'custom') return types?.get(obj.kind)?.label ?? obj.kind
  return text(`inspector.type.${obj.type}`)
}
