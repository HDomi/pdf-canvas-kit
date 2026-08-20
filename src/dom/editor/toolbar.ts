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
import { toolForKind, type ToolId } from '../../core/model/viewState'
import type { AnyObjectTypeDef } from '../../core/objectTypes'

export interface ToolbarProps {
  activeTool: ReadSignal<ToolId>
  /** 도구는 그릴 페이지가 있어야 쓸 수 있다. */
  enabled: ReadSignal<boolean>
  hasSelection: ReadSignal<boolean>
  /**
   * 등록된 커스텀 타입. 각 타입마다 도구가 하나 생긴다 (PLAN D25).
   *
   * 이전 판은 도구 6개가 하드코딩이었다. 레지스트리를 읽으면 소비자가 타입을 추가하는 것이
   * 곧 도구 추가가 된다 — 툴바가 데이터 주도가 된다.
   */
  customTypes: readonly AnyObjectTypeDef[]
  onPick: (tool: ToolId) => void
  onDuplicate: () => void
  onRemove: () => void
}

/** 내장 도구. 커스텀 도구는 그 사이에 끼워 넣는다. */
const BUILTIN_BEFORE: { id: ToolId; key: string }[] = [{ id: 'text', key: 'toolbar.text' }]
const BUILTIN_AFTER: { id: ToolId; key: string }[] = [
  { id: 'shape', key: 'toolbar.shape' },
  { id: 'eraser', key: 'toolbar.eraser' },
]

export function toolbar(props: ToolbarProps): HTMLElement {
  /** 활성 도구를 다시 누르면 select 로 돌아간다. 모드 토글이 그래야 자연스럽다. */
  const pick = (id: ToolId) => props.onPick(props.activeTool.value === id ? 'select' : id)

  /*
   * 도구 목록. 텍스트 → 커스텀 타입들 → 도형·지우개 순서다.
   *
   * 레지스트리는 마운트 시점에 고정이라 여기서 한 번 만든다. 런타임에 타입을 추가하려면
   * 컴포넌트를 다시 마운트한다 — 도구가 도중에 생기고 사라지면 사용자가 방향을 잃는다.
   */
  const tools: { id: ToolId; label: string }[] = [
    ...BUILTIN_BEFORE.map((t) => ({ id: t.id, label: text(t.key) })),
    ...props.customTypes.map((def) => ({ id: toolForKind(def.kind), label: def.label })),
    ...BUILTIN_AFTER.map((t) => ({ id: t.id, label: text(t.key) })),
  ]

  return el('div', { class: 'pck-toolbar', attr: { role: 'toolbar' } }, [
    tools.map((tool) =>
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
        [tool.label],
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
