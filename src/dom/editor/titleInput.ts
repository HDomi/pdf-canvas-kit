/**
 * 인라인 편집 가능한 문서 타이틀 (기획 4.1–4.3).
 *
 * 클릭 전까지는 라벨로 보이고, 클릭하면 입력 필드가 된다. blur 나 Enter 로 확정하고 Escape 로
 * 되돌린다. 공백만 입력하면 빈 바를 남기는 대신 기본값을 복원하는데, 이 규칙은 **커맨드 층이**
 * 강제하므로 프로그램적 편집에도 적용된다 (`core/commands/doc.ts`).
 *
 * 구 `src/vue/editor/TitleInput.vue` 의 이식.
 */
import { el, when } from '../h'
import { effect, signal, type ReadSignal } from '../reactive'
import { LIMITS } from '../../core/config/defaults'

export interface TitleInputProps {
  value: ReadSignal<string>
  placeholder: string
  onCommit: (value: string) => void
}

export function titleInput(props: TitleInputProps): HTMLElement {
  const editing = signal(false)
  const draft = signal(props.value.value)

  /*
   * 아래에서 문서가 바뀌는 경우(undo, import)에도 draft 를 맞춰 둔다.
   * 편집 중에는 건너뛴다 — 사용자가 타이핑하는 값을 덮으면 안 된다.
   */
  effect(() => {
    const v = props.value.value
    if (!editing.value) draft.value = v
  })

  function commit() {
    if (!editing.value) return
    editing.value = false
    if (draft.value !== props.value.value) props.onCommit(draft.value)
  }

  function cancel() {
    editing.value = false
    draft.value = props.value.value
  }

  return el('div', { class: 'pck-title' }, [
    when(
      () => editing.value,
      () => {
        const input = el('input', {
          class: 'pck-title-input',
          attr: { type: 'text', maxlength: LIMITS.titleChars, placeholder: props.placeholder },
          prop: { value: () => draft.value },
          on: {
            input: (e) => (draft.value = (e.target as HTMLInputElement).value),
            blur: commit,
            keydown: (e) => {
              const ev = e as KeyboardEvent
              if (ev.key === 'Enter') {
                ev.preventDefault()
                commit()
              } else if (ev.key === 'Escape') {
                ev.preventDefault()
                cancel()
              }
            },
          },
        })
        /*
         * 노드가 부모에 붙은 뒤에 select() 해야 한다. `when()` 은 앵커에 붙인 다음 이 함수를
         * 부르는 것이 아니라 **먼저 부르고** 붙이므로, 마이크로태스크로 한 틱 미룬다.
         * Vue 판의 `await nextTick()` 이 있던 자리다.
         */
        void Promise.resolve().then(() => input.select())
        return input
      },
    ),
    when(
      () => !editing.value,
      () =>
        el(
          'button',
          {
            class: 'pck-title-label',
            attr: { type: 'button' },
            on: {
              click: () => {
                draft.value = props.value.value
                editing.value = true
              },
            },
          },
          [() => props.value.value || props.placeholder],
        ),
    ),
  ])
}
