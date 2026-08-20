/**
 * 페이지 썸네일 우클릭 메뉴 (기획 9.1, 10.1).
 *
 * 기획이 "우클릭 메뉴 또는 삭제 버튼" 을 요구한다. 좌측 패널 하단 버튼만으로는 어떤 페이지에
 * 적용되는지 헷갈리므로, 대상이 분명한 우클릭 경로를 함께 둔다.
 *
 * 위치는 `position: fixed` 로 포인터 좌표에 붙인다. 좌측 패널은 스크롤 컨테이너라 그 안에 두면
 * 메뉴가 잘리거나 스크롤에 딸려간다.
 *
 * 구 `src/vue/editor/PageContextMenu.vue` 의 이식.
 */
import { el } from '../h'
import { text } from '../../core/config/strings'

export interface PageContextMenuProps {
  /** 뷰포트 좌표. */
  x: number
  y: number
  pageIndex: number
  /** 마지막 1페이지는 삭제할 수 없다 (기획 9.2). */
  canDelete: boolean
  onDuplicate: (index: number) => void
  onAddBlankAfter: (index: number) => void
  onRemove: (index: number) => void
  onClose: () => void
}

const MENU_WIDTH = 168
const MENU_HEIGHT = 116

export function pageContextMenu(props: PageContextMenuProps): HTMLElement[] {
  /*
   * 메뉴가 화면 밖으로 나가지 않게 민다.
   *
   * 아래쪽 여백이 부족하면 포인터 위로 올린다 — 목록 하단에서 우클릭하면 흔한 상황이다.
   * 좌표는 열릴 때 한 번 정해지므로 반응형이 아니다.
   */
  const left = Math.max(8, Math.min(props.x, window.innerWidth - MENU_WIDTH - 8))
  const top = Math.max(8, Math.min(props.y, window.innerHeight - MENU_HEIGHT - 8))

  const item = (label: string, onClick: () => void, extra: Parameters<typeof el>[1] = {}) =>
    el('button', { attr: { type: 'button', role: 'menuitem' }, on: { click: onClick }, ...extra }, [
      label,
    ])

  return [
    // 바깥 클릭·우클릭으로 닫는다. document 리스너보다 스크림이 확실하다.
    el('div', {
      class: 'pck-menu-scrim',
      on: {
        pointerdown: props.onClose,
        contextmenu: (e) => {
          e.preventDefault()
          props.onClose()
        },
      },
    }),
    el(
      'div',
      {
        class: 'pck-context-menu',
        attr: { role: 'menu' },
        style: { left, top, width: MENU_WIDTH },
      },
      [
        item(text('pages.duplicate'), () => props.onDuplicate(props.pageIndex)),
        item(text('pages.addBlank'), () => props.onAddBlankAfter(props.pageIndex)),
        el('hr'),
        item(text('pages.delete'), () => props.onRemove(props.pageIndex), {
          class: 'is-danger',
          prop: { disabled: !props.canDelete },
          attr: {
            type: 'button',
            role: 'menuitem',
            title: props.canDelete ? false : text('error.minPages'),
          },
        }),
      ],
    ),
  ]
}
