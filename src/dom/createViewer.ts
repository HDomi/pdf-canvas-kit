/**
 * 뷰어 facade — 프레임워크 래퍼의 유일한 접점.
 *
 * ```ts
 * const viewer = createPDFCanvasViewer(container, { doc: editor.toPublicDoc(), objectTypes })
 * viewer.update({ doc: nextDoc })   // 뷰어의 doc 은 **갱신된다** — 편집기와 다르다
 * viewer.destroy()
 * ```
 *
 * ## 편집기 facade 와 대칭이지만 같지 않다
 *
 * | | Editor | Viewer |
 * | --- | --- | --- |
 * | 문서 | `initialDoc` — 최초 1회 | **`doc` — 매번 갱신** (controlled) |
 * | 소유 | 편집기가 소유하고 `onChange` 로 밀어낸다 | 호스트가 소유한다 |
 * | 타입 | `PDFCanvasDoc` | **`PublicPDFCanvasDoc`** (D14 · D28) |
 *
 * 이름이 다시 계약이다. 편집기는 문서를 바꾸므로 `initialDoc` 이고, 뷰어는 보여주기만 하므로
 * `doc` 이다.
 *
 * ## 컨테이너에 높이가 필요하다
 *
 * `.pck-viewer` 는 `height: 100%` 다. 편집기와 같은 함정이다 (ARCHITECTURE §15.4).
 */
import { onCleanup, scope } from './reactive'
import { viewerShell } from './viewer/viewerShell'
import { createViewerController, type ViewerProps } from '../controller/viewer'
import type { PublicPDFCanvasDoc } from '../core/model/types'

export type { ViewerProps }

export interface ViewerHandle {
  /**
   * prop 을 갱신한다. **`doc` 이 반영된다** — 편집기의 `initialDoc` 과 다르다.
   *
   * `objectTypes` 는 무시된다. 렌더 도중 `kind` 매핑이 바뀌면 이미 그려진 객체의 슬롯이
   * 다른 타입으로 해석된다.
   */
  update(next: Partial<ViewerProps>): void
  /** 멱등이다. React StrictMode 의 이중 언마운트에 대비한다. */
  destroy(): void

  /** 현재 문서. 호스트가 준 그대로다. */
  getDoc(): PublicPDFCanvasDoc | null
  /** 페이지 수. */
  pageCount(): number

  /**
   * 특정 객체가 보이도록 스크롤한다.
   *
   * 호스트가 "미응답 문항으로 이동" 같은 기능을 만들 수 있어야 한다. 뷰어에는 페이지 이동
   * 개념이 없다 — 연속 스크롤이므로 목표는 항상 객체나 페이지의 **위치**다.
   */
  scrollToObject(objectId: string): boolean
  /** 특정 페이지가 보이도록 스크롤한다. */
  scrollToPage(pageId: string): boolean
}

export function createPDFCanvasViewer(container: HTMLElement, props: ViewerProps): ViewerHandle {
  let root: HTMLElement | null = null

  const [inner, dispose] = scope(() => {
    const c = createViewerController(props)

    root = viewerShell({
      pages: c.pages,
      types: c.types,
      scaleOf: c.scaleOf,
      setContainerWidth: c.setContainerWidth,
      /*
       * 응답을 저장하지 않는다 (D29).
       *
       * vanilla 슬롯이 `onChange` 를 부르면 호스트가 알아야 하는데, 뷰어는 문서를 소유하지
       * 않으므로 문서를 고칠 수 없다. 호스트가 `onChangeData` 로 받아 자기 상태를 고치고
       * 새 `doc` 을 `update()` 로 돌려주는 것이 유일한 경로다.
       */
      onChangeData: c.emitChangeData,
      ...(c.onMountCustom ? { onMountCustom: c.onMountCustom } : {}),
    })
    container.append(root)
    onCleanup(() => root?.remove())

    return c
  })

  let destroyed = false

  /** 스크롤 대상을 찾아 보이게 한다. 없으면 false. */
  const scrollTo = (selector: string) => {
    const target = root?.querySelector(selector)
    if (!target) return false
    target.scrollIntoView({ block: 'center' })
    return true
  }

  return {
    update: (next) => inner.setProps(next),
    destroy: () => {
      if (destroyed) return
      destroyed = true
      dispose()
    },
    getDoc: () => inner.doc.value,
    pageCount: () => inner.pageCount.value,
    /*
     * `CSS.escape` 를 쓴다. id 는 소비자가 만든 문자열이고, 서버에서 온 문서라면 선택자
     * 특수문자가 섞일 수 있다 — 그때 escape 없이는 조용히 못 찾거나 던진다.
     */
    scrollToObject: (objectId) => scrollTo(`[data-object-id="${CSS.escape(objectId)}"]`),
    scrollToPage: (pageId) => scrollTo(`[data-page-id="${CSS.escape(pageId)}"]`),
  }
}
