/**
 * 스테이지 위의 도구 띠 (와이어프레임 1.2, 기획 1.5).
 *
 * 복제·삭제는 모드가 아니라 선택 항목에 대한 즉시 동작이다. 그래서 활성 상태를 갖지 않고
 * 선택이 없으면 비활성이 된다.
 *
 * 구 `src/vue/editor/Toolbar.vue` 의 이식.
 */
import { el } from '../h'
import { text } from '../../core/config/strings'
import type { ReadSignal } from '../reactive'
import type { ToolId } from '../../core/model/viewState'

export interface ToolbarProps {
  activeTool: ReadSignal<ToolId>
  /** 도구는 그릴 페이지가 있어야 쓸 수 있다. */
  enabled: ReadSignal<boolean>
  hasSelection: ReadSignal<boolean>
  onPick: (tool: ToolId) => void
  onDuplicate: () => void
  onRemove: () => void
}

const TOOLS: { id: ToolId; key: string }[] = [
  { id: 'text', key: 'toolbar.text' },
  { id: 'answer.short', key: 'toolbar.short' },
  { id: 'answer.essay', key: 'toolbar.essay' },
  { id: 'answer.dropbox', key: 'toolbar.dropbox' },
  { id: 'shape', key: 'toolbar.shape' },
  { id: 'eraser', key: 'toolbar.eraser' },
]

export function toolbar(props: ToolbarProps): HTMLElement {
  /** 활성 도구를 다시 누르면 select 로 돌아간다. 모드 토글이 그래야 자연스럽다. */
  const pick = (id: ToolId) => props.onPick(props.activeTool.value === id ? 'select' : id)

  return el('div', { class: 'pck-toolbar', attr: { role: 'toolbar' } }, [
    TOOLS.map((tool) =>
      el(
        'button',
        {
          class: { 'pck-tool': true, 'is-active': () => props.activeTool.value === tool.id },
          attr: {
            type: 'button',
            'aria-pressed': () => props.activeTool.value === tool.id,
          },
          // `disabled` 는 속성이 아니라 프로퍼티다 (ARCHITECTURE §13.1).
          prop: { disabled: () => !props.enabled.value },
          on: { click: () => pick(tool.id) },
        },
        [text(tool.key)],
      ),
    ),

    el('span', { class: 'pck-toolbar-divider' }),

    el(
      'button',
      {
        class: 'pck-tool',
        attr: { type: 'button' },
        prop: { disabled: () => !props.hasSelection.value },
        on: { click: props.onDuplicate },
      },
      [text('toolbar.duplicate')],
    ),
    el(
      'button',
      {
        class: 'pck-tool',
        attr: { type: 'button' },
        prop: { disabled: () => !props.hasSelection.value },
        on: { click: props.onRemove },
      },
      [text('toolbar.delete')],
    ),
  ])
}
