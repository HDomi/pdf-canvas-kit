/**
 * 스테이지 위의 "1 / 3 · A4 세로" 표기.
 *
 * 용지 이름은 페이지의 pt 크기를 표준 규격과 매칭해 얻는다. 스캔 문서와 슬라이드는 보통
 * raw 크기로 떨어진다 (PLAN 6.7).
 *
 * 구 `src/vue/editor/PageMeta.vue` 의 이식.
 */
import { el, when } from '../h'
import { formatPaperLabel } from '../../core/geometry/paperSize'
import type { ReadSignal } from '../reactive'
import type { Size } from '../../core/model/types'

export interface PageMetaProps {
  current: ReadSignal<number>
  total: ReadSignal<number>
  size: ReadSignal<Size | null>
}

export function pageMeta(props: PageMetaProps): HTMLElement {
  const paper = () => {
    const s = props.size.value
    return s ? formatPaperLabel(s) : null
  }

  return el('div', {}, [
    when(
      () => props.total.value > 0,
      () =>
        el('p', { class: 'pck-pagemeta' }, [
          el('span', { class: 'mono' }, [() => `${props.current.value} / ${props.total.value}`]),
          when(
            () => paper() !== null,
            () => el('span', {}, [() => ` · ${paper() ?? ''}`]),
          ),
        ]),
    ),
  ])
}
