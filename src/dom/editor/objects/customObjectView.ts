/**
 * 커스텀 객체 (PLAN D25).
 *
 * 이 패키지가 그리는 것은 **기본 틀**뿐이다 — pt 사각형, 배경·테두리(`BoxStyle`), 그리고
 * 안쪽에 비어 있는 콘텐츠 컨테이너. 그 컨테이너를 채우는 방법이 둘이다.
 *
 * | 경로 | 누가 채우나 |
 * | --- | --- |
 * | `objectType.render` 가 있다 | 이 함수가 부른다 (vanilla) |
 * | 없다 | **비워 둔다.** 프레임워크 래퍼가 `createPortal` · `Teleport` 로 꽂는다 |
 *
 * 두 번째 경로 때문에 컨테이너 엘리먼트를 밖으로 알려야 한다 — `onMount` 가 그 통로다.
 *
 * ## ★ 콘텐츠는 포인터 이벤트를 받지 않는다 (PLAN D26)
 *
 * 편집기에서 커스텀 객체의 **편집 창구는 인스펙터 하나**다. 캔버스는 배치와 크기 조절만 한다.
 *
 * 이전에는 `interactive: true` 로 캔버스에서 직접 입력받는 길을 열어 뒀는데 **원리적으로
 * 동작하지 않았다.** 콘텐츠가 이벤트를 받아도 그 이벤트가 페이지 프레임까지 버블링되고,
 * 거기서 포인터 도구가 `preventDefault()` 를 부른다 — `pointerdown` 의 `preventDefault()` 는
 * **포커스 이동을 취소**하므로 클릭해도 커서가 들어가지 않는다.
 *
 * `stopPropagation` 으로 고칠 수는 있지만 그러면 그 객체는 가운데를 끌어 옮길 수 없어진다.
 * 편집 경로를 하나로 두는 편이 규칙이 하나이고 텍스트·도형과도 같다 (PLAN 20.15).
 *
 * 뷰어는 다르다 — 응답을 받는 화면이므로 콘텐츠가 이벤트를 먹는다 (R11).
 *
 * ## ⚠️ `position: fixed` 함정
 *
 * 콘텐츠는 페이지 컨테이너의 `transform: scale()` **안**에 있다. CSS 는 transform 이 걸린
 * 조상을 `fixed` 의 containing block 으로 만들므로, 소비자 컴포넌트 안의 드롭다운·툴팁·모달이
 * 화면 기준이 아니라 **프레임 기준으로 갇힌다.** 우회할 방법이 없다(스펙) — 그런 UI 는
 * 소비자가 자기 portal 로 `document.body` 에 띄워야 한다.
 */
import { el } from '../../h'
import { onCleanup, type ReadSignal } from '../../reactive'
import { boxStyleToCss } from '../../../core/model/boxStyle'
import type { ObjectTypeRegistry } from '../../../core/objectTypes'
import type { CustomObject } from '../../../core/model/types'
import { mountRenderSlot } from './renderSlot'

export interface CustomObjectViewProps {
  object: ReadSignal<CustomObject>
  selected: () => boolean
  types: ObjectTypeRegistry | undefined
  /** 데이터 변경. 커맨드 한 번으로 커밋되어 undo 한 항목이 된다. */
  onChange: (next: unknown) => void
  /**
   * 콘텐츠 컨테이너를 알린다. 프레임워크 래퍼가 여기에 portal 한다.
   *
   * 언마운트 시 `null` 로 한 번 더 불린다 — 래퍼가 portal 을 걷어야 한다.
   */
  onMount?: (objectId: string, el: HTMLElement | null) => void
}

export function customObjectView(props: CustomObjectViewProps): HTMLElement {
  const kind = props.object.value.kind
  const def = props.types?.get(kind)

  /**
   * 등록되지 않은 `kind`.
   *
   * 저장된 문서가 지금 없는 타입을 담고 있을 수 있다 — 소비자가 타입을 지웠거나, 다른 앱이
   * 만든 문서를 열었거나. **객체를 버리지 않는다.** 자리와 크기는 그리고 안내만 띄운다.
   * 버리면 저장할 때 데이터가 사라진다. 검증이 별도로 이 상태를 잡는다.
   */
  if (!def) {
    return el(
      'div',
      {
        class: 'pck-obj-custom pck-obj-custom--unknown',
        attr: { 'data-kind': kind, title: `unknown object kind: ${kind}` },
        style: () => boxStyleToCss(props.object.value.style),
      },
      [el('span', { class: 'pck-obj-custom-unknown-mark' }, ['?'])],
    )
  }

  /*
   * 콘텐츠는 포인터 이벤트를 받지 않는다 (CSS 가 `pointer-events: none`).
   *
   * 편집기에서 커스텀 객체의 **편집 창구는 인스펙터 하나**다 (PLAN D26). 캔버스는 배치와
   * 크기 조절만 한다.
   */
  const content = el('div', { class: 'pck-obj-custom-content' })

  // vanilla 경로 — 정의가 렌더를 주면 여기서 그린다. **한 번만** 부른다 (renderSlot.ts).
  if (def.render) {
    mountRenderSlot({
      objectId: props.object.value.id,
      container: content,
      render: def.render,
      onChange: props.onChange,
      read: () => ({
        data: props.object.value.data,
        rect: props.object.value.rect,
        selected: props.selected(),
      }),
    })
  } else if (props.onMount) {
    /*
     * portal 경로 — 컨테이너만 알린다.
     *
     * 마운트를 effect 안에서 알리지 않는다. 이 노드의 신원은 객체 수명 동안 바뀌지 않으므로
     * 한 번 알리면 충분하고, effect 로 두면 재실행마다 래퍼가 portal 을 다시 만든다.
     */
    const id = props.object.value.id
    props.onMount(id, content)
    // 객체가 사라지면 래퍼가 portal 을 걷어야 한다.
    onCleanup(() => props.onMount?.(id, null))
  }

  return el(
    'div',
    {
      class: 'pck-obj-custom',
      attr: { 'data-kind': kind },
      // 기본 틀의 배경·테두리. 미지정 필드는 CSS 토큰 기본값을 따른다 (ARCHITECTURE §3.3).
      style: () => boxStyleToCss(props.object.value.style),
    },
    [content],
  )
}
