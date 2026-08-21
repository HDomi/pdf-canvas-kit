/**
 * 좌측 패널. 페이지 썸네일과 페이지 조작.
 *
 * 썸네일 클릭이 스테이지를 전환하고, 위아래로 드래그하면 순서가 바뀐다.
 * 클릭과 드래그를 구분하는 임계값은 컨트롤러의 `pageReorder` 가 관리한다.
 *
 * ## 객체는 사각형으로, **자기 색으로** 표시한다 (2026.08.21)
 *
 * 객체를 제대로 렌더하지 않는다. 텍스트 내용이나 도형 모양(타원·화살표)은 썸네일 크기에서
 * 읽히지 않고, 실제 뷰를 재사용하면 커스텀 객체 슬롯이 객체당 한 번씩 더 불려 소비자 코드가
 * 페이지 수만큼 중복 실행된다.
 *
 * 다만 **색은 실제 값을 쓴다.** 처음에는 단색(accent)으로 그렸는데, 캔버스의 빨간 도형이
 * 썸네일에서 보라색으로 보여 "다른 객체" 처럼 읽혔다. 모양을 단순화하는 것과 색을 바꾸는
 * 것은 다른 이야기다 — 색은 어느 객체인지 알아보는 단서다.
 *
 * 색이 없는 객체(투명 배경 텍스트 등)는 토큰 기본값으로 떨어진다. 그 경우에도 자리는 보인다.
 *
 * 좌표는 **퍼센트**로 쓴다. 페이지 크기로 나누면 배율이 필요 없고, 크기가 섞인 문서에서도
 * 각 썸네일이 자기 비율로 맞는다 (`aspect-ratio` 가 이미 그 비율을 잡고 있다).
 *
 * 비용은 문서 전체 객체 수에 비례한다 — `LIMITS.objectsPerDoc` 이 200 이므로 500페이지
 * 문서에서도 span 이 200개 이하다.
 *
 * ## 썸네일이 원본 배경을 그대로 쓴다
 *
 * 저해상도 이미지를 따로 렌더하지 않는다. 축소는 브라우저가 처리하고, 썸네일 전용 래스터화
 * 패스를 두면 대부분 스쳐 지나가는 목록 때문에 변환 시간이 두 배가 된다.
 * `loading="lazy"` 덕분에 500페이지 문서가 비트맵 500개를 한 번에 디코딩하지 않는다.
 *
 * 구 `src/vue/editor/PageThumbList.vue` + `PageThumb.vue` 의 이식.
 * 둘을 한 파일에 둔 이유: `PageThumb` 는 이 목록 밖에서 쓰이지 않고, 드롭 표시선 판정이
 * 목록의 길이를 알아야 한다 — 나눠 두면 그 조건이 두 파일에 걸친다.
 */
import { el, list, when } from '../h'
import { text } from '../../core/config/strings'
import type { ReadSignal } from '../reactive'
import type { PDFCanvasObject, PDFCanvasPage } from '../../core/model/types'

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

/**
 * 썸네일에 쓸 색. 캔버스와 같은 값을 읽는다.
 *
 * 유형마다 색이 사는 곳이 다르다 — 도형은 `style.fill`/`stroke`, 텍스트·커스텀은 박스 스타일,
 * 마스크는 `fill` 하나다. 없으면 `null` 을 돌려 CSS 토큰 기본값으로 떨어지게 한다.
 */
function objectColors(obj: PDFCanvasObject): { fill: string | null; stroke: string | null } {
  switch (obj.type) {
    case 'shape':
      return { fill: obj.style.fill, stroke: obj.style.stroke }
    case 'mask':
      // 마스크는 채우기만 있다. 테두리를 그리면 가리려는 영역이 오히려 눈에 띈다.
      return { fill: obj.fill, stroke: null }
    case 'text':
      return { fill: obj.style.fill ?? null, stroke: obj.style.stroke ?? null }
    case 'custom':
      return { fill: obj.style?.fill ?? null, stroke: obj.style?.stroke ?? null }
  }
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
              /*
               * 객체 자리 표시.
               *
               * 키가 `id` 라 객체를 옮기거나 크기를 바꿔도 노드가 재사용된다 — 목록 전체가
               * 다시 만들어지면 500페이지 문서에서 스크롤이 튄다.
               */
              list(
                () => page.value.objects,
                (obj) => obj.id,
                (obj) =>
                  el('span', {
                    class: 'pck-thumb-obj',
                    attr: { 'data-type': () => obj.value.type },
                    style: () => {
                      const { width, height } = page.value.size
                      const r = obj.value.rect
                      const c = objectColors(obj.value)
                      return {
                        left: `${(r.x / width) * 100}%`,
                        top: `${(r.y / height) * 100}%`,
                        width: `${(r.w / width) * 100}%`,
                        height: `${(r.h / height) * 100}%`,
                        // 회전은 중심 기준. 캔버스와 같은 규칙이다.
                        transform: obj.value.rotation ? `rotate(${obj.value.rotation}deg)` : '',
                        /*
                         * 실제 색. `null` 이면 빈 문자열을 줘 CSS 토큰 기본값이 이긴다 —
                         * 인라인 스타일에 `null` 을 넣으면 속성이 남아 토큰을 가린다.
                         */
                        background: c.fill ?? '',
                        'border-color': c.stroke ?? '',
                      }
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
