/**
 * 좌측 패널. 페이지 썸네일과 페이지 조작.
 *
 * 썸네일 클릭이 스테이지를 전환하고(PLAN 6.2), 위아래로 드래그하면 순서가 바뀐다.
 * 클릭과 드래그를 구분하는 임계값은 컨트롤러의 `pageReorder` 가 관리한다.
 *
 * ## 썸네일이 원본 배경을 그대로 쓴다
 *
 * 저해상도 이미지를 따로 렌더하지 않는다. 축소는 브라우저가 처리하고, 썸네일 전용 래스터화
 * 패스를 두면 대부분의 교사가 스쳐 지나가는 목록 때문에 변환 시간이 두 배가 된다.
 * `loading="lazy"` 덕분에 500페이지 문서가 비트맵 500개를 한 번에 디코딩하지 않는다.
 *
 * 구 `src/vue/editor/PageThumbList.vue` + `PageThumb.vue` 의 이식.
 * 둘을 한 파일에 둔 이유: `PageThumb` 는 이 목록 밖에서 쓰이지 않고, 드롭 표시선 판정이
 * 목록의 길이를 알아야 한다 — 나눠 두면 그 조건이 두 파일에 걸친다.
 */
import { el, list, when } from '../h'
import { text } from '../../core/config/strings'
import type { ReadSignal } from '../reactive'
import type { PDFCanvasPage } from '../../core/model/types'

export interface PageThumbListProps {
  pages: ReadSignal<PDFCanvasPage[]>
  currentIndex: ReadSignal<number>
  draggingIndex: ReadSignal<number | null>
  dropIndex: ReadSignal<number | null>
  listRef: (el: HTMLElement | null) => void
  onSelect: (index: number) => void
  onThumbPointerDown: (index: number, e: PointerEvent) => void
  onContextMenu: (index: number, e: MouseEvent) => void
  onAddFile: () => void
  onAddBlank: () => void
  onDuplicate: (index: number) => void
  onRemove: (index: number) => void
}

function thumb(
  props: PageThumbListProps,
  page: ReadSignal<PDFCanvasPage>,
  index: ReadSignal<number>,
): HTMLElement {
  const image = () => {
    const bg = page.value.background
    return bg.kind === 'image' ? bg : null
  }

  return el(
    'li',
    {
      class: {
        'pck-thumb-item': true,
        'is-dragging': () => props.draggingIndex.value === index.value,
        'is-drop-before': () => props.dropIndex.value === index.value,
        // 마지막 항목 뒤에 놓는 경우. 그 자리에는 "다음 항목 앞" 이 없다.
        'is-drop-after': () =>
          index.value === props.pages.value.length - 1 &&
          props.dropIndex.value === props.pages.value.length,
      },
      attr: { 'data-page-index': () => index.value },
    },
    [
      el(
        'button',
        {
          class: {
            'pck-thumb': true,
            'is-active': () => index.value === props.currentIndex.value,
          },
          attr: {
            type: 'button',
            'aria-current': () => (index.value === props.currentIndex.value ? 'page' : false),
          },
          on: {
            click: () => props.onSelect(index.value),
            pointerdown: (e) => props.onThumbPointerDown(index.value, e as PointerEvent),
            contextmenu: (e) => {
              e.preventDefault()
              props.onContextMenu(index.value, e as MouseEvent)
            },
          },
        },
        [
          el(
            'span',
            {
              class: 'pck-thumb-paper',
              // 페이지 비율을 유지한다. 크기가 섞인 문서도 제대로 보이게.
              style: () => ({
                'aspect-ratio': `${page.value.size.width} / ${page.value.size.height}`,
              }),
            },
            [
              when(
                () => image() !== null,
                () =>
                  el('img', {
                    attr: {
                      src: () => image()?.url ?? '',
                      alt: '',
                      loading: 'lazy',
                      decoding: 'async',
                      draggable: 'false',
                    },
                  }),
              ),
            ],
          ),
          el('span', { class: 'pck-thumb-no' }, [() => index.value + 1]),
        ],
      ),
    ],
  )
}

export function pageThumbList(props: PageThumbListProps): HTMLElement {
  return el('aside', { class: 'pck-pagelist' }, [
    el('header', { class: 'pck-panel-head' }, [
      el('span', {}, [text('pages.title')]),
      el('span', { class: 'pck-panel-count' }, [() => props.pages.value.length]),
    ]),

    el('div', { class: 'pck-pagelist-scroll', ref: props.listRef }, [
      when(
        () => props.pages.value.length === 0,
        () => el('p', { class: 'pck-panel-empty' }, [text('pages.empty')]),
      ),

      when(
        () => props.pages.value.length > 0,
        () =>
          el('ol', { class: 'pck-thumb-list' }, [
            list(
              () => props.pages.value,
              (p) => p.id,
              (page, index) => thumb(props, page, index),
            ),
          ]),
      ),

      when(
        () => props.pages.value.length > 0,
        () =>
          el('div', { class: 'pck-pagelist-actions' }, [
            el(
              'button',
              {
                class: 'pck-dashed-btn',
                attr: { type: 'button' },
                on: { click: props.onAddFile },
              },
              [text('pages.addFile')],
            ),
            el(
              'button',
              {
                class: 'pck-dashed-btn',
                attr: { type: 'button' },
                on: { click: props.onAddBlank },
              },
              [text('pages.addBlank')],
            ),
            el('div', { class: 'pck-pagelist-rowbtns' }, [
              el(
                'button',
                {
                  attr: { type: 'button' },
                  prop: { disabled: () => props.currentIndex.value < 0 },
                  on: { click: () => props.onDuplicate(props.currentIndex.value) },
                },
                [text('pages.duplicate')],
              ),
              el(
                'button',
                {
                  attr: {
                    type: 'button',
                    // 마지막 1페이지는 삭제할 수 없다 (기획 9.2). 왜 비활성인지 알려준다.
                    title: () => (props.pages.value.length <= 1 ? text('error.minPages') : false),
                  },
                  prop: {
                    disabled: () => props.currentIndex.value < 0 || props.pages.value.length <= 1,
                  },
                  on: { click: () => props.onRemove(props.currentIndex.value) },
                },
                [text('pages.delete')],
              ),
            ]),
          ]),
      ),
    ]),
  ])
}
