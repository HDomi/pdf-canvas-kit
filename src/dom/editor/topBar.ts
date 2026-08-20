/**
 * 상단 바. 뒤로 가기, 인라인 타이틀, 저장 배지, undo/redo, 수동 저장 (기획 1.3).
 *
 * ⚠️ **[내보내기] 버튼을 임시로 제거했다.** 과제 생성 API 가 아직 없어 누르면 빈 팝업만 뜨고,
 * 그게 프로토타입 확인을 방해한다. 대신 프로토타입 저장 버튼을 둔다.
 *
 * 서버가 준비되면 `onManualSave` 를 `requestExport` 로 되돌린다. `guardExport` 검증 게이트는
 * 그대로 남아 있고 컨트롤러가 `requestExport()` 를 노출하므로 버튼만 바꾸면 된다 (PLAN 18.5).
 *
 * 구 `src/vue/editor/TopBar.vue` 의 이식.
 */
import { el } from '../h'
import { text } from '../../core/config/strings'
import type { ReadSignal } from '../reactive'
import type { SaveState } from '../../core/model/viewState'
import { saveBadge } from './saveBadge'
import { titleInput } from './titleInput'

export interface TopBarProps {
  title: ReadSignal<string>
  saveState: ReadSignal<SaveState>
  canUndo: ReadSignal<boolean>
  canRedo: ReadSignal<boolean>
  /** 빈 문서에서는 저장할 것이 없다. */
  canSave: ReadSignal<boolean>
  /** 저장 진행 중이면 버튼을 잠근다. */
  saving: ReadSignal<boolean>
  onBack: () => void
  onTitleChange: (value: string) => void
  onUndo: () => void
  onRedo: () => void
  onManualSave: () => void
}

/** 아이콘 버튼. 라벨이 글리프라 `aria-label` 이 반드시 필요하다. */
function iconButton(
  glyph: string,
  labelKey: string,
  disabled: (() => boolean) | null,
  onClick: () => void,
): HTMLElement {
  const label = text(labelKey)
  return el(
    'button',
    {
      class: 'pck-icon-btn',
      attr: { type: 'button', title: label, 'aria-label': label },
      ...(disabled ? { prop: { disabled } } : {}),
      on: { click: onClick },
    },
    [glyph],
  )
}

export function topBar(props: TopBarProps): HTMLElement {
  return el('header', { class: 'pck-topbar' }, [
    iconButton('‹', 'topbar.back', null, props.onBack),

    titleInput({
      value: props.title,
      placeholder: text('topbar.titlePlaceholder'),
      onCommit: props.onTitleChange,
    }),

    saveBadge(props.saveState),

    el('div', { class: 'pck-topbar-spacer' }),

    iconButton('↶', 'topbar.undo', () => !props.canUndo.value, props.onUndo),
    iconButton('↷', 'topbar.redo', () => !props.canRedo.value, props.onRedo),

    el('span', { class: 'pck-topbar-divider' }),

    // 프로토타입 저장 버튼. 실서버가 붙으면 [내보내기] 로 되돌린다 (PLAN 18.5).
    el(
      'button',
      {
        class: 'pck-primary-btn',
        attr: { type: 'button', title: text('topbar.saveHint') },
        prop: { disabled: () => !props.canSave.value || props.saving.value },
        on: { click: props.onManualSave },
      },
      [() => (props.saving.value ? text('topbar.saving') : text('topbar.save'))],
    ),
  ])
}
