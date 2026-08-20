/**
 * 페이지 하나. 레이아웃 박스, 스케일된 페이지, 오버레이로 구성된다.
 *
 * ## 두 겹 구조 ★ (PLAN 5.3)
 *
 * `transform` 은 **레이아웃 크기에 영향을 주지 않는다.** 그래서 스케일된 엘리먼트 하나만 두면
 * 스크롤 컨테이너가 배율 1 기준 크기로 남아 — 축소 시 여백이, 확대 시 잘림이 생긴다.
 * 그래서 바깥 프레임이 `size * scale` 을 실제 크기로 갖고, 안쪽 엘리먼트가 pt 크기와 transform 을
 * 갖는다.
 *
 * 안쪽 엘리먼트 덕분에 객체 뷰는 계산이 필요 없다. `left: 120px` 에 놓인 자식은 배율과 무관하게
 * 120pt 지점에 놓인다.
 *
 * 오버레이는 스케일된 엘리먼트 **밖**이다. 그래야 핸들이 어떤 배율에서도 일정한 픽셀 크기를
 * 유지한다 (PLAN D5).
 *
 * ## 편집기·뷰어 공용이다
 *
 * 두 겹 구조는 좌표 규칙의 핵심이라 중복하면 한쪽만 고치는 버그가 난다. 그래서
 * `src/dom/editor/` 밖에 둔다. 뷰어는 `overlay` 와 `ref` 를 쓰지 않으므로 둘 다 optional 이다.
 *
 * 구 `src/vue/editor/PageFrame.vue` 의 이식.
 */
import { el, type Child, type ElProps } from '../h'
import type { ReadSignal } from '../reactive'
import { frameSize } from '../../core/geometry/units'
import type { PDFCanvasPage } from '../../core/model/types'
import { pageBackground } from './pageBackground'

export interface PageFrameProps {
  page: ReadSignal<PDFCanvasPage>
  scale: ReadSignal<number>
  /** 스케일 안쪽 — 객체들. rect 값을 px 로 그대로 읽는다 (PLAN 5.3). */
  objects: Child
  /** 스케일 밖 — 선택 테두리·핸들·마퀴. 뷰어에는 없다. */
  overlay?: Child
  /**
   * 프레임 엘리먼트를 컨트롤러에 넘긴다.
   *
   * 좌표 변환이 이 요소의 `getBoundingClientRect()` 를 기준으로 하기 때문이다 (PLAN 5.4).
   */
  ref?: (el: HTMLElement | null) => void
  /**
   * 프레임에 붙일 이벤트.
   *
   * 스테이지가 아니라 **프레임**에 붙인다. 스테이지에 붙이면 페이지 밖 여백을 클릭해도
   * 객체 생성 드래그가 시작된다.
   */
  on?: ElProps<HTMLDivElement>['on']
}

export function pageFrame(props: PageFrameProps): HTMLElement {
  const frame = () => frameSize(props.page.value.size, props.scale.value)

  return el(
    'div',
    {
      class: 'pck-page-frame',
      attr: { 'data-page-id': () => props.page.value.id },
      ...(props.on ? { on: props.on } : {}),
      style: {
        width: () => frame().width,
        height: () => frame().height,
      },
      ...(props.ref ? { ref: props.ref } : {}),
    },
    [
      el(
        'div',
        {
          class: 'pck-page',
          style: {
            // pt 값을 px 로 그대로 쓴다. 스케일은 아래 transform 이 담당한다.
            width: () => props.page.value.size.width,
            height: () => props.page.value.size.height,
            transform: () => `scale(${props.scale.value})`,
            'transform-origin': 'top left',
          },
        },
        [pageBackground(props.page), props.objects],
      ),
      ...(props.overlay === undefined ? [] : [props.overlay]),
    ],
  )
}
