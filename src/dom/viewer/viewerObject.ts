/**
 * 뷰어의 객체 하나. 읽기 전용이거나 **응답을 받는 폼**이다 (뷰어는 응답을 갖지 않는다).
 *
 * ## 편집기와 갈리는 지점
 *
 * 텍스트·도형·마스크는 편집기와 같은 뷰를 쓴다 — 정적으로 그리기만 하면 되고, 그 코드가 이미
 * 좌표 규칙(pt 를 px 로 그대로)을 지킨다. 커스텀 객체만 다르다.
 *
 * | | 편집기 | 뷰어 |
 * | --- | --- | --- |
 * | 슬롯 | `render` | **`renderViewer`** |
 * | 포인터 | 프레임이 먹는다 (드래그 때문 — D26) | **콘텐츠가 먹는다** |
 * | 선택 | 있다 | 없다 |
 * | 데이터 | 편집 문서 | `toPublic` 을 거친 값 |
 *
 * 포인터가 뒤집히는 이유는 화면의 목적이 다르기 때문이다. 편집기의 객체는 배치 대상이라
 * 가운데를 끌어 옮겨야 하고, 뷰어의 객체는 폼이라 그 자리에서 입력을 받아야 한다.
 */
import { el, keyed } from '../h'
import { onCleanup, type ReadSignal } from '../reactive'
import { boxStyleToCss } from '../../core/model/boxStyle'
import type { CustomObject, PDFCanvasObject } from '../../core/model/types'
import type { ObjectTypeRegistry } from '../../core/objectTypes'
import { maskView } from '../editor/objects/maskView'
import { shapeObjectView } from '../editor/objects/shapeObjectView'
import { textObjectView } from '../editor/objects/textObjectView'
import { mountRenderSlot } from '../editor/objects/renderSlot'

export interface ViewerObjectProps {
  object: ReadSignal<PDFCanvasObject>
  types: ObjectTypeRegistry
  /**
   * 커스텀 객체의 데이터 변경 — **뷰어의 응답**이다.
   *
   * 패키지는 이 값을 저장하지 않는다 (D29). 호스트가 받아서 자기 상태에 넣는다.
   */
  onChangeData: (objectId: string, next: unknown) => void
  onMountCustom?: (objectId: string, el: HTMLElement | null) => void
}

export function viewerObject(props: ViewerObjectProps): HTMLElement {
  const rect = () => props.object.value.rect
  const rotation = () => props.object.value.rotation ?? 0

  /*
   * 유형은 객체 수명 동안 바뀌지 않지만 `keyed` 로 감싼다.
   *
   * 뷰어의 문서는 **교체된다** (controlled — `viewer.ts` 의 `setProps`). 호스트가 다른 과제를
   * 열면 같은 위치의 리스트 항목이 다른 유형일 수 있다. `when` 은 값 변화를 못 보므로
   * `keyed` 여야 한다.
   */
  const body = keyed(
    () => {
      const o = props.object.value
      return o.type === 'custom' ? `custom:${o.kind}` : o.type
    },
    () => {
      const o = props.object.value
      if (o.type === 'text') {
        return textObjectView({
          object: props.object as ReadSignal<Extract<PDFCanvasObject, { type: 'text' }>>,
          // 뷰어에는 인라인 편집이 없다. 값을 그리기만 한다.
          editing: () => false,
          onEdit: () => {},
        })
      }
      if (o.type === 'shape') {
        return shapeObjectView({
          object: props.object as ReadSignal<Extract<PDFCanvasObject, { type: 'shape' }>>,
        })
      }
      if (o.type === 'mask') {
        return maskView({
          object: props.object as ReadSignal<Extract<PDFCanvasObject, { type: 'mask' }>>,
        })
      }
      return viewerCustomObject({
        object: props.object as ReadSignal<CustomObject>,
        types: props.types,
        onChange: (next) => props.onChangeData(o.id, next),
        ...(props.onMountCustom ? { onMount: props.onMountCustom } : {}),
      })
    },
  )

  return el(
    'div',
    {
      class: 'pck-viewer-obj',
      attr: { 'data-object-id': () => props.object.value.id },
      style: {
        // pt 를 px 로 그대로. 배율은 부모 페이지의 transform 한 곳에만 있다.
        left: () => rect().x,
        top: () => rect().y,
        width: () => rect().w,
        height: () => rect().h,
        transform: () => (rotation() ? `rotate(${rotation()}deg)` : null),
        'transform-origin': 'center',
      },
    },
    [body],
  )
}

interface ViewerCustomProps {
  object: ReadSignal<CustomObject>
  types: ObjectTypeRegistry
  onChange: (next: unknown) => void
  onMount?: (objectId: string, el: HTMLElement | null) => void
}

/**
 * 커스텀 객체의 뷰어판.
 *
 * `customObjectView` 와 나눈다 — 슬롯 이름(`renderViewer`)과 포인터 정책이 다르고, 선택
 * 상태가 없다. 한 함수에 넣으면 분기가 절반씩 죽은 코드가 된다.
 */
function viewerCustomObject(props: ViewerCustomProps): HTMLElement {
  /*
   * `kind` 는 객체 수명 동안 바뀌지 않는다 — 그것을 바꾸는 커맨드가 없고, 인스펙터는 `data` 만
   * 고친다. `list()` 가 `id` 로 노드를 만들므로 다른 kind 는 곧 다른 노드다 (§13.3).
   *
   * 그래서 여기서 한 번만 읽는다. **근거 없이 이렇게 쓰면 안 된다** — `shape` 을 이렇게 읽어
   * 모양 변경이 반영되지 않는 버그가 있었다 (§13.2.1).
   */
  const kind = props.object.value.kind
  const def = props.types.get(kind)

  /*
   * 등록되지 않은 `kind`.
   *
   * 편집기와 같은 판단이다 — **객체를 버리지 않는다.** 자리만 그린다. 다만 뷰어에서는 뷰어에
   * 물음표를 보여 봐야 할 수 있는 것이 없으므로 안내를 띄우지 않고 조용히 자리만 남긴다.
   * 이 상태는 호스트가 편집기 쪽 검증(`validate`)에서 이미 잡을 수 있었다.
   */
  if (!def) {
    return el('div', {
      class: 'pck-viewer-custom pck-viewer-custom--unknown',
      attr: { 'data-kind': kind },
      style: () => boxStyleToCss(props.object.value.style),
    })
  }

  /*
   * 콘텐츠가 포인터 이벤트를 받는다 — 편집기와 **반대**다 (D29).
   *
   * 뷰어에는 드래그가 없으므로 프레임이 이벤트를 먹을 이유가 없고, 응답 폼이 클릭·포커스를
   * 받아야 한다. CSS 가 아니라 여기서 인라인으로 주는 이유: 이 정책은 뷰어의 계약이므로
   * 소비자가 스타일시트로 뒤집으면 폼이 죽는다.
   */
  const content = el('div', {
    class: 'pck-viewer-custom-content',
    style: { 'pointer-events': 'auto' },
  })

  if (def.renderViewer) {
    // vanilla 경로. **객체당 한 번만** 부른다 (renderSlot.ts).
    mountRenderSlot({
      objectId: props.object.value.id,
      container: content,
      render: def.renderViewer,
      onChange: props.onChange,
      read: () => ({
        data: props.object.value.data,
        rect: props.object.value.rect,
        // 뷰어에 선택이 없다. 계약을 맞추기 위해 항상 false 다.
        selected: false,
      }),
    })
  } else if (props.onMount) {
    /*
     * portal 경로 — 컨테이너만 알린다. 편집기와 같은 프로토콜이다 (ARCHITECTURE §17.2).
     * effect 안에서 알리지 않는다 — 노드 신원이 객체 수명 동안 고정이다.
     */
    const id = props.object.value.id
    props.onMount(id, content)
    onCleanup(() => props.onMount?.(id, null))
  }

  return el(
    'div',
    {
      class: 'pck-viewer-custom',
      attr: { 'data-kind': kind },
      style: () => boxStyleToCss(props.object.value.style),
    },
    [content],
  )
}
