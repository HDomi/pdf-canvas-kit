/**
 * 문서에 페이지가 없을 때 보여준다 (와이어프레임 1.1, 기획 1.5).
 *
 * 구 `src/vue/editor/EmptyState.vue` 의 이식.
 */
import { el } from '../h'
import { text } from '../../core/config/strings'

export function emptyState(onImport: () => void): HTMLElement {
  return el('div', { class: 'pck-empty' }, [
    el('div', { class: 'pck-empty-doc', attr: { 'aria-hidden': 'true' } }, [
      el('span'),
      el('span'),
      el('span'),
    ]),
    el('h2', {}, [text('empty.title')]),
    el('p', {}, [text('empty.description')]),
    el('button', { class: 'pck-primary-btn', attr: { type: 'button' }, on: { click: onImport } }, [
      text('empty.action'),
    ]),
  ])
}
