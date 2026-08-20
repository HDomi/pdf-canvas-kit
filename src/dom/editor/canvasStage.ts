/**
 * 스테이지. 정확히 한 페이지만 담는 스크롤 컨테이너다 (PLAN D8).
 *
 * 페이지 하나만 렌더하면 DOM 비용이 문서 길이와 무관해지고(500페이지 문서가 3페이지와 같은
 * 비용), "현재 페이지"가 스크롤 위치에서 파생되는 값이 아니라 명시적 상태가 된다.
 *
 * 스크롤은 페이지가 스테이지보다 클 때, 즉 확대했을 때만 생긴다. 맞춤 상태에서는 팬할 것이
 * 없으므로 pad 가 페이지를 중앙에 둔다.
 *
 * 구 `src/vue/editor/CanvasStage.vue` 의 이식.
 */
import { el, when, type Child } from '../h'
import { computed, type ReadSignal } from '../reactive'
import type { PDFCanvasPage } from '../../core/model/types'
import { pageFrame } from '../page/pageFrame'

export interface CanvasStageProps {
  page: ReadSignal<PDFCanvasPage | null>
  scale: ReadSignal<number>
  panArmed: ReadSignal<boolean>
  panning: ReadSignal<boolean>
  /** 생성 도구가 선택돼 있으면 커서를 십자로 바꾼다. */
  toolActive: ReadSignal<boolean>
  /** 스케일 안쪽에 들어갈 객체들. */
  objects: Child
  /** 스케일 밖 오버레이. */
  overlay: Child
  /**
   * 스크롤 컨테이너를 컨트롤러에 넘긴다.
   *
   * 줌 앵커링·팬·맞춤 계산이 모두 이 요소의 스크롤 오프셋과 client 크기를 대상으로 한다.
   */
  stageRef: (el: HTMLElement | null) => void
  /** 좌표 변환의 기준이 되는 페이지 프레임 엘리먼트 (PLAN 5.4). */
  frameRef: (el: HTMLElement | null) => void
  onWheelZoom: (deltaY: number, anchor: { x: number; y: number }) => void
  onPagePointerDown: (e: PointerEvent) => void
  onPageDoubleClick: (e: MouseEvent) => void
}

export function canvasStage(props: CanvasStageProps): HTMLElement {
  /**
   * Ctrl/Cmd + 휠은 줌, 그냥 휠은 스크롤이다.
   *
   * macOS 트랙패드 pinch 도 `ctrlKey: true` 인 휠 이벤트로 들어오므로 두 제스처가 같은 경로를
   * 공유한다.
   */
  function onWheel(ev: Event) {
    const e = ev as WheelEvent
    if (!e.ctrlKey && !e.metaKey) return
    // 이걸 막지 않으면 브라우저가 자기 페이지 줌을 적용한다.
    e.preventDefault()
    props.onWheelZoom(e.deltaY, { x: e.clientX, y: e.clientY })
  }

  return el(
    'div',
    {
      class: {
        'pck-stage': true,
        'is-pan-armed': () => props.panArmed.value,
        'is-panning': () => props.panning.value,
        'is-tool-active': () => props.toolActive.value && !props.panArmed.value,
      },
      attr: { tabindex: '0' },
      // `passive: false` 를 명시한다. 브라우저는 wheel 을 기본 passive 로 다루고, 그러면
      // `preventDefault()` 가 무시되어 브라우저 줌이 그대로 걸린다.
      on: { wheel: [onWheel, { passive: false }] },
      ref: props.stageRef,
    },
    [
      el('div', { class: 'pck-stage-pad' }, [
        when(
          () => props.page.value !== null,
          () =>
            pageFrame({
              // 위 조건이 통과한 뒤에만 그려진다.
              page: computed(() => props.page.value!),
              scale: props.scale,
              objects: props.objects,
              overlay: props.overlay,
              ref: props.frameRef,
              on: {
                pointerdown: (e) => props.onPagePointerDown(e as PointerEvent),
                dblclick: (e) => props.onPageDoubleClick(e as MouseEvent),
              },
            }),
        ),
      ]),
    ],
  )
}
