/**
 * 저장 상태 배지 (기획 1.3).
 *
 * 기본값은 `disabled` 다. StoragePort 가 연결되지 않은 상태에서 "저장됨" 을 띄우는 것은
 * 거짓말이다.
 *
 * 구 `src/vue/editor/SaveBadge.vue` 의 이식.
 */
import { el } from '../h'
import { text } from '../../core/config/strings'
import type { ReadSignal } from '../reactive'
import type { SaveState } from '../../core/model/viewState'

export function saveBadge(state: ReadSignal<SaveState>): HTMLElement {
  return el(
    'span',
    {
      class: () => `pck-badge is-${state.value}`,
      attr: { role: 'status' },
    },
    [() => text(`save.${state.value}`)],
  )
}
