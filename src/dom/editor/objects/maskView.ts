/**
 * 배경을 가리는 불투명 사각형 (기획의 지우개 해석 중 하나,).
 *
 * 구 `src/vue/editor/objects/MaskView.vue` 의 이식.
 */
import { el } from '../../h'
import type { ReadSignal } from '../../reactive'
import type { MaskObject } from '../../../core/model/types'

export function maskView(props: { object: ReadSignal<MaskObject> }): HTMLElement {
  return el('div', {
    class: 'pck-obj-mask',
    style: { background: () => props.object.value.fill },
  })
}
