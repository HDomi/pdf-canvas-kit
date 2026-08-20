/**
 * 확인 모달 (기획 9.3).
 *
 * 되돌릴 수 있는 동작에는 쓰지 않는다 — undo 가 있는 편집기에서 모든 삭제를 확인받으면 방해만
 * 된다. 페이지 삭제처럼 **여러 객체가 함께 사라지는** 경우에만 쓴다.
 *
 * 구 `src/vue/editor/dialogs/ConfirmDialog.vue` 의 이식.
 */
import { el } from '../../h'

export interface ConfirmDialogProps {
  message: string
  confirmLabel: string
  cancelLabel: string
  /** 위험한 동작이면 확인 버튼을 경고색으로 칠한다. */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function confirmDialog(props: ConfirmDialogProps): HTMLElement {
  const scrim = el(
    'div',
    {
      class: 'pck-modal-scrim',
      on: {
        // `click.self` 대응 — 모달 내부 클릭이 닫지 않게 대상을 확인한다.
        click: (e) => {
          if (e.target === scrim) props.onCancel()
        },
      },
    },
    [
      el(
        'section',
        {
          class: 'pck-modal pck-modal--confirm',
          attr: { role: 'alertdialog', 'aria-modal': 'true' },
        },
        [
          el('p', { class: 'pck-confirm-message' }, [props.message]),
          el('div', { class: 'pck-confirm-actions' }, [
            el(
              'button',
              {
                class: 'pck-ghost-btn',
                attr: { type: 'button' },
                on: { click: props.onCancel },
              },
              [props.cancelLabel],
            ),
            el(
              'button',
              {
                class: { 'pck-primary-btn': true, 'is-danger': props.danger === true },
                attr: { type: 'button' },
                on: { click: props.onConfirm },
              },
              [props.confirmLabel],
            ),
          ]),
        ],
      ),
    ],
  )
  return scrim
}
