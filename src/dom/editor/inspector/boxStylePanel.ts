/**
 * 박스 색 편집. 텍스트·단답형·서술형·드롭박스가 공유한다 (PLAN 18.8).
 *
 * ## 체크박스로 "지정 여부" 를 다루는 이유
 *
 * 모델의 `BoxStyle` 은 **미지정**과 **지정**을 구분한다. 미지정이면 CSS 토큰 기본값이 적용되므로
 * 호스트가 `--pck-*` 로 테마를 바꿀 수 있다(ARCHITECTURE §3.3). 색 선택기만 두면 항상 값이
 * 채워져 그 구분이 사라진다.
 *
 * 그래서 각 항목에 체크박스를 두고, 껐을 때 필드를 **`undefined` 로 되돌린다.**
 * `null` 은 "투명 / 없음" 이라는 다른 의미이므로 배경·테두리에서 별도 토글로 쓴다.
 *
 * 구 `BoxStylePanel.vue` 의 이식.
 */
import { el, when } from '../../h'
import type { ReadSignal } from '../../reactive'
import { text } from '../../../core/config/strings'
import { DEFAULT_BOX_STROKE_WIDTH, type BoxStylePatch } from '../../../core/model/boxStyle'
import type { BoxStyle } from '../../../core/model/types'
import { checkbox, colorInput, inlineField, numberInput, panelSection } from './fields'

export function boxStylePanel(
  style: ReadSignal<BoxStyle | undefined>,
  update: (patch: BoxStylePatch) => void,
): HTMLElement {
  /** 지정했는지. `null`(투명)도 지정에 포함된다. */
  const fillOn = () => style.value?.fill !== undefined
  const strokeOn = () => style.value?.stroke !== undefined
  const colorOn = () => style.value?.color !== undefined

  /** 색 선택기에 보여줄 값. 미지정이면 흔한 기본값을 쓴다. */
  const fillValue = () => style.value?.fill ?? '#ffffff'
  const strokeValue = () => style.value?.stroke ?? '#1c1c1a'
  const colorValue = () => style.value?.color ?? '#1c1c1a'

  return panelSection(text('inspector.boxStyle'), [
    /* 배경 */
    inlineField([
      checkbox({
        checked: fillOn,
        /*
         * 끌 때 `undefined` 를 **명시적으로** 보낸다. 호출자가 스프레드로 병합하므로 키가
         * 있어야 지워진다 — 키를 생략하면 기존 값이 그대로 남는다.
         */
        onChange: (on) => update({ fill: on ? fillValue() : undefined }),
      }),
      el('span', { class: 'pck-style-label' }, [text('inspector.background')]),
      when(fillOn, () =>
        colorInput({
          value: () => fillValue() ?? '#ffffff',
          onInput: (fill) => update({ fill }),
        }),
      ),
      // 투명은 색으로 표현할 수 없으므로 별도 토글로 둔다.
      when(fillOn, () =>
        el(
          'button',
          {
            class: { 'pck-chip': true, 'is-active': () => style.value?.fill === null },
            attr: { type: 'button', title: text('inspector.transparentHint') },
            on: {
              click: () => update({ fill: style.value?.fill === null ? '#ffffff' : null }),
            },
          },
          [text('inspector.transparent')],
        ),
      ),
    ]),

    /* 테두리 */
    inlineField([
      checkbox({
        checked: strokeOn,
        onChange: (on) =>
          update(
            on
              ? {
                  stroke: strokeValue(),
                  strokeWidth: style.value?.strokeWidth ?? DEFAULT_BOX_STROKE_WIDTH,
                }
              : { stroke: undefined, strokeWidth: undefined },
          ),
      }),
      el('span', { class: 'pck-style-label' }, [text('inspector.stroke')]),
      when(strokeOn, () =>
        colorInput({
          value: () => strokeValue() ?? '#1c1c1a',
          onInput: (stroke) => update({ stroke }),
        }),
      ),
      when(strokeOn, () =>
        numberInput({
          value: () => style.value?.strokeWidth ?? DEFAULT_BOX_STROKE_WIDTH,
          min: 0.5,
          max: 20,
          step: 0.5,
          narrow: true,
          title: text('inspector.strokeWidth'),
          fallback: DEFAULT_BOX_STROKE_WIDTH,
          onInput: (strokeWidth) => update({ strokeWidth }),
        }),
      ),
    ]),

    /* 글자색 */
    inlineField([
      checkbox({
        checked: colorOn,
        onChange: (on) => update({ color: on ? colorValue() : undefined }),
      }),
      el('span', { class: 'pck-style-label' }, [text('inspector.textColor')]),
      when(colorOn, () => colorInput({ value: colorValue, onInput: (color) => update({ color }) })),
    ]),

    el('p', { class: 'pck-field-note' }, [text('inspector.boxStyleNote')]),
  ])
}
