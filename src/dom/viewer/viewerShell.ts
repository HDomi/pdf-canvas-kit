/**
 * 뷰어 화면 전체 (편집기는 데스크탑 전용, 뷰어만 반응형이다).
 *
 * ## 편집기와 정반대의 스테이지
 *
 * 편집기는 한 페이지만 담고 사용자가 배율을 정한다 (D8). 뷰어는 **모든 페이지를 세로로 잇고**
 * 배율을 컨테이너 폭에서 파생시킨다. 독자는 위에서 아래로 훑기 때문이다.
 *
 * ```
 * .pck-viewer                 스크롤 컨테이너 (overflow-y: auto)
 *   .pck-viewer-pages         세로 스택 (gap)
 *     .pck-page-frame         size × scale — 실제 레이아웃 크기
 *       .pck-page             pt 크기 + transform: scale()
 * ```
 *
 * ## 배율은 페이지마다 다르다
 *
 * `containerWidth / page.size.width` 다. 문서 전체에 한 배율을 쓰면 크기가 섞인 문서에서 작은
 * 페이지가 여백에 떠 버린다 — PDF 를 합쳐 만든 문서에서 흔한 상황이다.
 *
 * ## ResizeObserver 를 컨테이너가 아니라 내부 측정자에 붙인다 ★
 *
 * 스크롤 컨테이너 자신을 관측하면 **피드백 루프가 생긴다.** 폭이 넓어지면 배율이 커지고,
 * 페이지가 높아지면서 세로 스크롤바가 나타나고, 그러면 콘텐츠 폭이 줄어 다시 관측이 발화한다.
 * 그래서 스크롤바 안쪽 폭을 그대로 갖는 **빈 측정용 엘리먼트**를 관측한다.
 */
import { el, list, when } from '../h'
import { computed, effect, onCleanup, type ReadSignal } from '../reactive'
import type { PDFCanvasPage } from '../../core/model/types'
import type { ObjectTypeRegistry } from '../../core/objectTypes'
import { text } from '../../core/config/strings'
import { pageFrame } from '../page/pageFrame'
import { viewerObject } from './viewerObject'

export interface ViewerShellProps {
  pages: ReadSignal<readonly PDFCanvasPage[]>
  types: ObjectTypeRegistry
  /** 페이지별 배율. 컨트롤러가 컨테이너 폭에서 파생한다. */
  scaleOf: (page: PDFCanvasPage) => number
  setContainerWidth: (px: number) => void
  onChangeData: (objectId: string, next: unknown) => void
  onMountCustom?: (objectId: string, el: HTMLElement | null) => void
}

export function viewerShell(props: ViewerShellProps): HTMLElement {
  /*
   * 폭 측정자. 콘텐츠 흐름에 참여하되 아무것도 그리지 않는다.
   *
   * `height: 0` 이라 레이아웃에 영향이 없고, 블록이라 스크롤바 안쪽 폭을 그대로 받는다.
   */
  const meter = el('div', {
    class: 'pck-viewer-meter',
    attr: { 'aria-hidden': 'true' },
  })

  const root = el('div', { class: 'pck-viewer' }, [
    meter,
    /*
     * 빈 상태.
     *
     * 호스트가 아직 `doc` 을 주지 않았을 때 회색 판만 남으면 "깨진 것" 처럼 보인다 —
     * 2026.08.21 에 소비자 앱에서 실제로 그렇게 보였다. 편집기의 `emptyState` 와 달리
     * 버튼이 없다: 뷰어는 문서를 불러올 수 없고, 이 상태를 푸는 것은 호스트의 몫이다.
     */
    when(
      () => props.pages.value.length === 0,
      () => el('div', { class: 'pck-viewer-empty' }, [el('p', {}, [text('viewer.empty')])]),
    ),
    el('div', { class: 'pck-viewer-pages' }, [
      /*
       * 페이지 키는 `id` 다. 인덱스로 두면 호스트가 문서를 교체할 때 모든 페이지가
       * 재생성되어 스크롤 위치와 뷰어에서 입력 중인 폼이 날아간다.
       */
      list(
        () => props.pages.value,
        (page) => page.id,
        (page) =>
          pageFrame({
            page,
            // 페이지마다 자기 배율을 갖는다 (D15). `list` 의 렌더는 항목당 한 번이라
            // 여기서 computed 를 만들어도 항목 수만큼만 생긴다.
            scale: computed(() => props.scaleOf(page.value)),
            objects: list(
              () => page.value.objects,
              (obj) => obj.id,
              (obj) =>
                viewerObject({
                  object: obj,
                  types: props.types,
                  onChangeData: props.onChangeData,
                  ...(props.onMountCustom ? { onMountCustom: props.onMountCustom } : {}),
                }),
            ),
          }),
      ),
    ]),
  ])

  /*
   * 폭 관측.
   *
   * `ResizeObserver` 가 없는 환경(headless 검증의 happy-dom)에서는 조용히 건너뛴다. 그쪽에서는
   * 레이아웃이 없어 폭이 어차피 0 이고, 컨트롤러가 배율 1 로 떨어진다 (`scaleOf` 주석).
   */
  effect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) props.setContainerWidth(entry.contentRect.width)
    })
    ro.observe(meter)
    onCleanup(() => ro.disconnect())
  })

  return root
}
