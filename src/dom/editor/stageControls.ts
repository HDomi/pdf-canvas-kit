/**
 * 스테이지 우측 하단에 고정되는 줌 컨트롤.
 *
 * 스크롤 컨테이너의 자식이 아니라 형제로 마운트한다. 안에 두면 컨트롤이 페이지와 함께
 * 스크롤돼 사라진다 (PLAN 6.1).
 *
 * +/- 버튼은 스테이지 중앙을 앵커로 쓴다. 포인터를 앵커로 쓰는 Ctrl+휠과 다르다 (PLAN 6.4).
 *
 * 구 `src/vue/editor/StageControls.vue` 의 이식.
 */
import { el, when } from '../h'
import { text } from '../../core/config/strings'
import { icon } from './icon'
import type { IconName } from '../../core/config/icons'
import { signal, type ReadSignal } from '../reactive'

export interface StageControlsProps {
  percent: ReadSignal<number>
  canZoomIn: ReadSignal<boolean>
  canZoomOut: ReadSignal<boolean>
  presets: readonly number[]
  onStep: (direction: 1 | -1) => void
  onSet: (scale: number) => void
  onFitWidth: () => void
  onFitPage: () => void
}

export function stageControls(props: StageControlsProps): HTMLElement {
  const menuOpen = signal(false)

  const choose = (action: () => void) => {
    action()
    menuOpen.value = false
  }

  const zoomButton = (
    name: IconName,
    labelKey: string,
    enabled: () => boolean,
    onClick: () => void,
  ) => {
    const label = text(labelKey)
    return el(
      'button',
      {
        class: 'pck-zoom-btn',
        // `data-icon` 으로 CSS 에서 이 버튼만 골라 SVG 배경을 줄 수 있다 (§19.4).
        attr: { type: 'button', title: label, 'aria-label': label, 'data-icon': name },
        prop: { disabled: () => !enabled() },
        on: { click: onClick },
      },
      [icon(name)],
    )
  }

  return el('div', { class: 'pck-stage-controls' }, [
    zoomButton(
      'zoomOut',
      'stage.zoomOut',
      () => props.canZoomOut.value,
      () => props.onStep(-1),
    ),

    el(
      'button',
      {
        class: 'pck-zoom-value',
        attr: {
          type: 'button',
          'aria-haspopup': 'menu',
          'aria-expanded': () => menuOpen.value,
        },
        on: { click: () => (menuOpen.value = !menuOpen.value) },
      },
      [() => `${props.percent.value}%`],
    ),

    zoomButton(
      'zoomIn',
      'stage.zoomIn',
      () => props.canZoomIn.value,
      () => props.onStep(1),
    ),

    /*
     * 바깥 클릭은 스크림 버튼이 처리한다. `document` 수준 리스너를 쓰면 정상적인 스테이지
     * 클릭까지 삼키게 된다.
     */
    when(
      () => menuOpen.value,
      () =>
        el('button', {
          class: 'pck-menu-scrim',
          attr: { type: 'button', tabindex: '-1' },
          on: { click: () => (menuOpen.value = false) },
        }),
    ),
    when(
      () => menuOpen.value,
      () =>
        el('div', { class: 'pck-zoom-menu', attr: { role: 'menu' } }, [
          el(
            'button',
            {
              attr: { type: 'button', role: 'menuitem' },
              on: { click: () => choose(props.onFitWidth) },
            },
            [text('stage.fitWidth')],
          ),
          el(
            'button',
            {
              attr: { type: 'button', role: 'menuitem' },
              on: { click: () => choose(props.onFitPage) },
            },
            [text('stage.fitPage')],
          ),
          el('hr'),
          props.presets.map((p) =>
            el(
              'button',
              {
                class: { 'is-current': () => Math.round(p * 100) === props.percent.value },
                attr: { type: 'button', role: 'menuitem' },
                on: { click: () => choose(() => props.onSet(p)) },
              },
              [`${Math.round(p * 100)}%`],
            ),
          ),
        ]),
    ),
  ])
}
