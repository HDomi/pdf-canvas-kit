/**
 * 인스펙터 폼 위젯 (R7).
 *
 * 패널 6개가 같은 모양의 입력을 반복한다. Vue 판은 각 SFC 가 `<label class="pck-field">` 를
 * 각자 적었고, 그래서 클래스 조합과 라벨 배치가 조금씩 달랐다. 여기 모아 둔다.
 *
 * ## 입력을 되돌리지 않는다
 *
 * 숫자 입력은 값이 유효하지 않아도 **그대로 문서에 넣고 검증이 잡게** 한다. 강제로 되돌리면
 * "2를 지우고 3을 쓰려는" 중간 상태가 불가능해진다 (기획 6.4).
 *
 * 빈 문자열은 `0` 으로 보낸다. `NaN` 을 문서에 넣으면 직렬화가 깨진다.
 */
import { el, when, type Child } from '../../h'

/** 라벨 + 컨트롤. 세로 배치. */
export function field(label: string, control: Child, note?: string): HTMLElement {
  return el('label', { class: 'pck-field' }, [
    el('span', { class: 'pck-field-label' }, [label]),
    control,
    ...(note ? [el('span', { class: 'pck-field-note' }, [note])] : []),
  ])
}

/** 라벨과 컨트롤을 한 줄에. 체크박스가 앞에 오는 경우에 쓴다. */
export function inlineField(children: Child[]): HTMLElement {
  return el('label', { class: 'pck-field pck-field--inline' }, children)
}

export function textInput(opts: {
  value: () => string
  placeholder?: () => string | false
  maxlength?: number
  invalid?: () => boolean
  onInput: (value: string) => void
}): HTMLElement {
  return el('input', {
    class: 'pck-input',
    attr: {
      type: 'text',
      ...(opts.maxlength !== undefined ? { maxlength: opts.maxlength } : {}),
      ...(opts.placeholder ? { placeholder: opts.placeholder } : {}),
      ...(opts.invalid ? { 'aria-invalid': opts.invalid } : {}),
    },
    prop: { value: opts.value },
    on: { input: (e) => opts.onInput((e.target as HTMLInputElement).value) },
  })
}

export function numberInput(opts: {
  value: () => number | string
  min?: number
  max?: number
  step?: number
  narrow?: boolean
  title?: string
  invalid?: () => boolean
  /** 빈 값이나 파싱 실패는 `fallback` 으로 보낸다. */
  fallback: number
  onInput: (value: number) => void
}): HTMLElement {
  return el('input', {
    class: { 'pck-input': true, 'pck-input--num': true, 'pck-input--narrow': opts.narrow === true },
    attr: {
      type: 'number',
      ...(opts.min !== undefined ? { min: opts.min } : {}),
      ...(opts.max !== undefined ? { max: opts.max } : {}),
      ...(opts.step !== undefined ? { step: opts.step } : {}),
      ...(opts.title ? { title: opts.title } : {}),
      ...(opts.invalid ? { 'aria-invalid': opts.invalid } : {}),
    },
    prop: { value: () => String(opts.value()) },
    on: {
      input: (e) => {
        const raw = (e.target as HTMLInputElement).value
        const n = raw.trim() === '' ? opts.fallback : Number(raw)
        opts.onInput(Number.isFinite(n) ? n : opts.fallback)
      },
    },
  })
}

export function textArea(opts: {
  value: () => string
  rows: number
  placeholder?: string
  onInput: (value: string) => void
}): HTMLElement {
  return el('textarea', {
    class: 'pck-input pck-textarea',
    attr: {
      rows: opts.rows,
      ...(opts.placeholder ? { placeholder: opts.placeholder } : {}),
    },
    prop: { value: opts.value },
    on: { input: (e) => opts.onInput((e.target as HTMLTextAreaElement).value) },
  })
}

export function checkbox(opts: {
  checked: () => boolean
  ariaLabel?: string
  onChange: (checked: boolean) => void
}): HTMLElement {
  return el('input', {
    class: 'pck-check',
    attr: { type: 'checkbox', ...(opts.ariaLabel ? { 'aria-label': opts.ariaLabel } : {}) },
    prop: { checked: opts.checked },
    on: { change: (e) => opts.onChange((e.target as HTMLInputElement).checked) },
  })
}

export function colorInput(opts: {
  value: () => string
  onInput: (value: string) => void
}): HTMLElement {
  return el('input', {
    class: 'pck-input pck-input--color',
    attr: { type: 'color' },
    prop: { value: opts.value },
    on: { input: (e) => opts.onInput((e.target as HTMLInputElement).value) },
  })
}

/** 배타 선택 버튼 묶음. 정렬·도형 종류가 쓴다. */
export function segmented<T>(opts: {
  items: readonly { id: T; label: string }[]
  active: () => T
  onPick: (id: T) => void
}): HTMLElement {
  return el(
    'div',
    { class: 'pck-segmented' },
    opts.items.map((item) =>
      el(
        'button',
        {
          class: { 'is-active': () => opts.active() === item.id },
          attr: { type: 'button', 'aria-pressed': () => opts.active() === item.id },
          on: { click: () => opts.onPick(item.id) },
        },
        [item.label],
      ),
    ),
  )
}

/** 검증 경고 한 줄. 조건이 거짓이면 그리지 않는다. */
export function fieldError(show: () => boolean, message: string): Child {
  return when(show, () => el('p', { class: 'pck-field-error', attr: { role: 'alert' } }, [message]))
}

/** 패널 한 섹션. 제목이 있으면 `h3` 로 얹는다. */
export function panelSection(title: string | null, children: Child[]): HTMLElement {
  return el('section', { class: 'pck-panel-section' }, [
    ...(title ? [el('h3', { class: 'pck-field-label' }, [title])] : []),
    ...children,
  ])
}

/** 행 삭제 버튼(×). 답안·보기 목록이 쓴다. */
export function rowButton(opts: {
  ariaLabel: string
  disabled?: () => boolean
  onClick: () => void
}): HTMLElement {
  return el(
    'button',
    {
      class: 'pck-row-btn',
      attr: { type: 'button', 'aria-label': opts.ariaLabel },
      ...(opts.disabled ? { prop: { disabled: opts.disabled } } : {}),
      on: { click: opts.onClick },
    },
    ['×'],
  )
}

/** 점선 추가 버튼. 답안·보기 추가가 쓴다. */
export function dashedButton(opts: {
  label: string
  small?: boolean
  disabled?: () => boolean
  onClick: () => void
}): HTMLElement {
  return el(
    'button',
    {
      class: {
        'pck-dashed-btn': true,
        'pck-dashed-btn--sm': opts.small === true,
      },
      attr: { type: 'button' },
      ...(opts.disabled ? { prop: { disabled: opts.disabled } } : {}),
      on: { click: opts.onClick },
    },
    [opts.label],
  )
}
