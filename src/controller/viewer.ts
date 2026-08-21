/**
 * 뷰어 컨트롤러 — 프레임워크 무관 (편집기는 데스크탑 전용, 뷰어만 반응형이다 / 뷰어는 응답을 갖지 않는다).
 *
 * ## 편집기와 공유하지 않는다
 *
 * 두 화면의 요구가 **정반대**다. 공통 컨트롤러를 만들면 양쪽 분기가 절반씩 죽은 코드가 된다.
 *
 * | | Editor | Viewer |
 * | --- | --- | --- |
 * | 배율 | 사용자가 정한다 (줌·팬·앵커 줌) | **컨테이너 폭에서 파생** — 조작 없음 |
 * | 페이지 | 한 번에 하나 (D8) | **연속 세로 스크롤** (Q15 는 Editor 한정) |
 * | 문서 | 편집 대상. 커맨드로 바꾼다 | **읽기 전용** |
 * | 반응형 | 데스크탑 전용 | **375px 까지** (D15) |
 * | 히스토리 | undo/redo | 없음 |
 *
 * 그래서 `engine` 도 쓰지 않는다 — 히스토리·자동저장·import 파이프라인이 전부 편집 기능이다.
 * 뷰어가 받는 것은 이미 완성된 `PublicPDFCanvasDoc` 하나다.
 *
 * ## 응답을 갖지 않는다 (D29)
 *
 * 뷰어 응답은 소비자 도메인이다. 이 컨트롤러는 `objectId` 를 알려 주고 슬롯을 열어 줄 뿐,
 * 값을 저장하지도 채점하지도 않는다. 의 `AttemptDraft` 는 D25 로 무효가 됐다 —
 * 객체 타입을 소비자가 정의하는데 응답 스키마만 패키지가 쥐고 있을 이유가 없다.
 */
import { computed, signal, type ReadSignal, type Signal } from '../dom/reactive'
import {
  createObjectTypeRegistry,
  type AnyObjectTypeDef,
  type ObjectTypeRegistry,
} from '../core/objectTypes'
import type { PDFCanvasPage, PublicPDFCanvasDoc } from '../core/model/types'

/** 뷰어에 넘기는 것. 편집기와 달리 문서가 **필수**다 — 뷰어는 빈 상태가 없다. */
export interface ViewerProps {
  /**
   * 표시할 문서. **브랜드 타입이다** (D14 · D28).
   *
   * `editor.toPublicDoc()` 이 만들거나, 서버 JSON 이면 `asPublicDoc()` 으로 단언한다.
   * 편집 문서를 그대로 넘기는 것을 타입이 막는다.
   */
  doc: PublicPDFCanvasDoc | null
  /** 커스텀 객체 타입. **편집기와 같은 배열을 넘긴다** — `kind` 가 둘 사이의 계약이다 (D25). */
  objectTypes?: readonly AnyObjectTypeDef[]
  /**
   * 최대 배율 상한.
   *
   * 기본은 상한 없음이다(D15) — 넓은 화면에서 페이지가 폭을 채워야 읽힌다. 다만 초대형
   * 모니터에서 A4 가 3배로 늘어나면 오히려 읽기 어려우므로 호스트가 조일 수 있게 남긴다.
   */
  maxScale?: number
  /**
   * 커스텀 객체의 데이터가 바뀌었다 — **뷰어의 응답**이다 (D29).
   *
   * 뷰어는 문서를 소유하지 않으므로 이 값을 저장할 곳이 없다. 호스트가 받아서 자기 상태를
   * 고치고, 새 `doc` 을 `update()` 로 돌려주는 것이 유일한 경로다. 그래야 응답 스키마·저장
   * 시점·채점이 전부 호스트 도메인에 남는다.
   */
  onChangeData?: (objectId: string, next: unknown) => void
  /** 커스텀 객체의 콘텐츠 컨테이너를 알린다. 프레임워크 래퍼가 portal 한다 (§17.2). */
  onMountCustom?: (objectId: string, el: HTMLElement | null) => void
}

export interface ViewerController {
  doc: ReadSignal<PublicPDFCanvasDoc | null>
  pages: ReadSignal<readonly PDFCanvasPage[]>
  pageCount: ReadSignal<number>
  /** 등록된 커스텀 객체 타입. */
  types: ObjectTypeRegistry
  onMountCustom: ViewerProps['onMountCustom']
  /** 최신 `onChangeData`. 렌더 층이 이걸 통해 부른다 — prop 이 바뀌어도 노드를 다시 만들지 않는다. */
  emitChangeData: (objectId: string, next: unknown) => void

  /**
   * 스크롤 컨테이너의 콘텐츠 폭 (CSS px). 배율 계산의 유일한 입력이다.
   *
   * 렌더 층이 `ResizeObserver` 로 밀어 넣는다. `0` 이면 아직 측정되지 않은 상태다.
   */
  containerWidthPx: ReadSignal<number>
  setContainerWidth: (px: number) => void

  /**
   * 페이지별 배율.
   *
   * `containerWidth / page.size.width` 다 (D15). 페이지 크기가 섞여 있어도 각자 폭을 채운다 —
   * 문서 전체에 한 배율을 쓰면 작은 페이지가 여백에 뜬다.
   *
   * 측정 전에는 `1` 을 쓴다. `0` 을 쓰면 페이지 프레임 높이가 0 이 되어 스크롤 컨테이너가
   * 접히고, `ResizeObserver` 가 그 접힌 폭을 다시 측정해 값이 굳는다.
   */
  scaleOf: (page: PDFCanvasPage) => number

  setProps: (next: Partial<ViewerProps>) => void
}

export function createViewerController(props: ViewerProps): ViewerController {
  const doc: Signal<PublicPDFCanvasDoc | null> = signal(props.doc)
  const containerWidthPx = signal(0)
  const maxScale = signal(props.maxScale)
  /*
   * 콜백은 signal 이 아니라 변수다.
   *
   * 렌더 층은 `emitChangeData` 를 한 번 잡아 두고 계속 쓴다. signal 로 두면 prop 이 바뀔 때마다
   * 슬롯을 다시 그려야 하고, 그러면 입력 중 포커스가 날아간다.
   */
  let onChangeData = props.onChangeData

  /*
   * 레지스트리는 최초 1회만 만든다.
   *
   * `kind` → 정의 매핑이 렌더 도중 바뀌면 이미 그려진 객체의 슬롯이 다른 타입으로 해석된다.
   * 편집기의 `objectTypes` 와 같은 판단이다 (ARCHITECTURE §14.2).
   */
  const types = createObjectTypeRegistry(props.objectTypes ?? [])

  const pages = computed(() => doc.value?.pages ?? [])
  const pageCount = computed(() => pages.value.length)

  const scaleOf = (page: PDFCanvasPage) => {
    const width = containerWidthPx.value
    // 측정 전. 위 JSDoc 의 이유로 0 이 아니라 1 이다.
    if (width <= 0) return 1
    const raw = width / page.size.width
    const cap = maxScale.value
    return cap !== undefined && cap > 0 ? Math.min(raw, cap) : raw
  }

  return {
    doc,
    pages,
    pageCount,
    types,
    onMountCustom: props.onMountCustom,
    emitChangeData: (objectId, next) => onChangeData?.(objectId, next),
    containerWidthPx,
    setContainerWidth: (px) => {
      /*
       * 같은 값이면 쓰지 않는다. `ResizeObserver` 는 스크롤바 등장·소멸로도 발화하는데,
       * 매번 대입하면 배율이 바뀌지 않아도 모든 페이지의 effect 가 다시 돈다.
       */
      const next = Math.max(0, Math.round(px))
      if (containerWidthPx.value !== next) containerWidthPx.value = next
    },
    scaleOf,
    setProps: (next) => {
      /*
       * `doc` 은 갱신된다 — 편집기의 `initialDoc` 과 다르다.
       *
       * 뷰어는 문서를 소유하지 않고 **보여주기만** 하므로 controlled 가 맞다. 호스트가 다른
       * 과제를 열면 같은 뷰어에 새 문서가 들어온다.
       */
      if ('doc' in next) doc.value = next.doc ?? null
      if ('maxScale' in next) maxScale.value = next.maxScale
      if ('onChangeData' in next) onChangeData = next.onChangeData
    },
  }
}
