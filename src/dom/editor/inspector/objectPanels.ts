/**
 * 텍스트·도형 인스펙터 패널.
 *
 * ## 편집 가능한 속성의 범위
 *
 * 기획 7.1·8.1 은 세부 편집을 [General] 문서에 위임하지만 그 문서가 아직 없다. 그래서
 * "최소 세트" 로 시작하는데, 그게 무엇을 뜻하는지 흐릿하면 다음 사람이 판단할 수 없으므로
 * 정확히 적는다.
 *
 * ### 텍스트
 *
 * | | 항목 |
 * | --- | --- |
 * | 지금 편집 가능 | 내용 · 글자 크기 · **글꼴** · 정렬 · 굵게 (색은 공용 `boxStylePanel`) |
 * | 모델엔 있고 UI 없음 | `italic` · `underline` · `lineHeight` — 렌더는 이미 지원한다 |
 * | 모델에도 없음 | 자간 · 문단 간격 · 리스트 · **부분 서식**(한 객체 안에서 일부만 굵게) |
 *
 * 부분 서식은 `text: string` 을 리치 텍스트 구조로 바꿔야 하므로 모델 변경이 따른다.
 *
 * ### 도형
 *
 * | | 항목 |
 * | --- | --- |
 * | 지금 편집 가능 | 모양 11종 · 채움 색 · 테두리 색 · 테두리 두께 |
 * | 모델엔 있고 UI 없음 | `dash`(점선 패턴) |
 * | 모델에도 없음 | 모서리 반경 · 그림자 · 그라디언트 · 화살촉 방향 · 자유 곡선 |
 *
 * 채움은 `null` 이 "없음" 이다. `transparent` 문자열을 쓰면 색 선택기 값과 구분되지 않는다.
 *
 * 구 `TextPanel.vue` · `ShapePanel.vue` 의 이식.
 */
import { el, when } from '../../h'
import type { ReadSignal } from '../../reactive'
import { text } from '../../../core/config/strings'
import type { PDFCanvasObject, ShapeKind, ShapeObject, TextObject } from '../../../core/model/types'
import {
  checkbox,
  colorInput,
  field,
  inlineField,
  numberInput,
  panelSection,
  segmented,
  selectInput,
  textArea,
} from './fields'
import { fontOptions } from '../../../core/config/fonts'

type Patch = (p: Partial<PDFCanvasObject>) => void

const ALIGNS: readonly { id: TextObject['style']['align']; label: string }[] = [
  { id: 'left', label: '⇤' },
  { id: 'center', label: '↔' },
  { id: 'right', label: '⇥' },
]

export function textPanel(object: ReadSignal<TextObject>, patch: Patch): HTMLElement {
  /** 스타일은 중첩 객체라 부분 갱신 시 나머지 필드를 유지해야 한다. */
  const patchStyle = (p: Partial<TextObject['style']>) =>
    patch({ style: { ...object.value.style, ...p } })

  return panelSection(text('inspector.text'), [
    textArea({
      value: () => object.value.text,
      rows: 3,
      onInput: (v) => patch({ text: v }),
    }),

    // 색은 공용 boxStylePanel 이 담당한다. 두 곳에서 편집하면 어느 쪽이 이기는지 알 수 없다.
    field(
      text('inspector.fontSize'),
      numberInput({
        value: () => object.value.style.fontSize,
        min: 4,
        max: 200,
        step: 1,
        fallback: 12,
        onInput: (v) => patchStyle({ fontSize: v }),
      }),
    ),

    /*
     * 글꼴. 목록이 비면 항목 자체를 그리지 않는다 — `configureFonts([])` 로 선택을 막을 수 있다.
     *
     * 값은 CSS `font-family` 스택 문자열 그대로다. 현재 값이 목록에 없으면 빈 선택으로 남는다
     * (`selectInput` 주석) — 다른 앱에서 온 문서라는 사실이 보여야 한다.
     */
    ...(fontOptions().length > 0
      ? [
          field(
            text('inspector.fontFamily'),
            selectInput({
              items: fontOptions().map((f) => ({ id: f.stack, label: f.label })),
              value: () => object.value.style.fontFamily,
              onPick: (fontFamily) => patchStyle({ fontFamily }),
            }),
            text('inspector.fontFamilyNote'),
          ),
        ]
      : []),

    field(
      text('inspector.align'),
      segmented({
        items: ALIGNS,
        active: () => object.value.style.align,
        onPick: (align) => patchStyle({ align }),
      }),
    ),

    inlineField([
      checkbox({
        checked: () => object.value.style.bold,
        onChange: (bold) => patchStyle({ bold }),
      }),
      el('span', {}, [text('inspector.bold')]),
    ]),
  ])
}

/**
 * 도형 선택기 항목.
 *
 * 순서는 렌더 방식대로 묶었다 — 면(사각·타원), 다각형, 선. 사용자가 "비슷한 것끼리 붙어 있다"
 * 로 읽는 순서이기도 하다.
 *
 * 글리프와 이름 모두 문구다 (D32) — `text()` 로 뽑으므로 호스트가 번역하거나 커버리지가 없는
 * 글리프를 바꿀 수 있다. 라벨은 `title` 로도 들어가 글리프뿐인 버튼에 접근 가능한 이름을 준다.
 */
const SHAPE_KINDS: readonly ShapeKind[] = [
  'rect',
  'ellipse',
  'triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'star',
  'cross',
  'line',
  'arrow',
  'doubleArrow',
]

function shapeItems(): readonly { id: ShapeKind; label: string; title: string }[] {
  return SHAPE_KINDS.map((id) => ({
    id,
    label: text(`icon.shape.${id}`),
    title: text(`shape.${id}`),
  }))
}

export function shapePanel(object: ReadSignal<ShapeObject>, patch: Patch): HTMLElement {
  const patchStyle = (p: Partial<ShapeObject['style']>) =>
    patch({ style: { ...object.value.style, ...p } })

  const hasFill = () => object.value.style.fill !== null

  return panelSection(null, [
    field(
      text('inspector.shapeKind'),
      segmented({
        items: shapeItems(),
        active: () => object.value.shape,
        onPick: (shape) => patch({ shape }),
        // 호스트가 글리프 대신 CSS 아이콘을 붙일 수 있게 하는 갈고리.
        dataKey: 'shape',
      }),
    ),

    inlineField([
      checkbox({
        checked: hasFill,
        // 켜면 흰색으로 시작한다. `null` 이 "채움 없음" 이다.
        onChange: (on) => patchStyle({ fill: on ? '#ffffff' : null }),
      }),
      el('span', {}, [text('inspector.fill')]),
      when(hasFill, () =>
        colorInput({
          value: () => object.value.style.fill ?? '#ffffff',
          onInput: (fill) => patchStyle({ fill }),
        }),
      ),
      when(
        () => !hasFill(),
        () =>
          el('span', { class: 'pck-field-note pck-field-note--inline' }, [
            text('inspector.noFill'),
          ]),
      ),
    ]),

    el('div', { class: 'pck-field-grid' }, [
      field(
        text('inspector.stroke'),
        colorInput({
          value: () => object.value.style.stroke,
          onInput: (stroke) => patchStyle({ stroke }),
        }),
      ),
      field(
        text('inspector.strokeWidth'),
        numberInput({
          value: () => object.value.style.strokeWidth,
          min: 0.5,
          max: 40,
          step: 0.5,
          fallback: 1,
          onInput: (strokeWidth) => patchStyle({ strokeWidth }),
        }),
      ),
    ]),
  ])
}
