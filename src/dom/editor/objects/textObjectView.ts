/**
 * 텍스트 객체. 더블클릭하면 인라인 편집 상태가 된다 (기획 7.1).
 *
 * `contenteditable` 을 쓴다. `<textarea>` 를 겹치면 폰트·행간·정렬을 픽셀 단위로 맞춰야 하고,
 * 배율이 걸린 상태에서 캐럿 위치가 어긋난다. `contenteditable` 은 표시 요소가 그대로 편집 요소가
 * 되므로 그 문제가 없다.
 *
 * ## 한글 IME ★ (ARCHITECTURE §6.5)
 *
 * 조합 중(`compositionstart`~`compositionend`)에는 **DOM 을 덮지 않는다.** 조합 중간에
 * `textContent` 를 다시 쓰면 조합이 끊겨 "한글이 한 글자씩 사라지는" 증상이 난다.
 *
 * 두 지점에서 지킨다.
 *
 * | 지점 | 규칙 |
 * | --- | --- |
 * | `input` 이벤트 | 조합 중이면 커밋하지 않는다. `compositionend` 에서 한 번에 보낸다 |
 * | 문서 → DOM effect | 편집 중·조합 중이면 건너뛴다. 그러지 않으면 캐럿이 맨 앞으로 튄다 |
 *
 * 구 `src/vue/editor/objects/TextObjectView.vue` 의 이식.
 *
 * ⚠️ **IME 동작은 헤드리스로 검증되지 않는다.** happy-dom 에 조합 이벤트와 selection 이 없다.
 * 축소·확대 배율 양쪽에서 브라우저로 확인해야 한다 (PLAN 20.5).
 */
import { el } from '../../h'
import { effect, signal, type ReadSignal } from '../../reactive'
import { boxStyleToCss } from '../../../core/model/boxStyle'
import type { TextObject } from '../../../core/model/types'

export interface TextObjectViewProps {
  object: ReadSignal<TextObject>
  editing: () => boolean
  onEdit: (value: string) => void
}

export function textObjectView(props: TextObjectViewProps): HTMLElement {
  /** IME 조합 중인지. effect 와 이벤트 핸들러가 함께 본다. */
  const composing = signal(false)

  const style = () => {
    const s = props.object.value.style
    return {
      'font-family': s.fontFamily,
      'font-size': `${s.fontSize}px`,
      'font-weight': s.bold ? '700' : '400',
      'font-style': s.italic ? 'italic' : 'normal',
      'text-decoration': s.underline ? 'underline' : 'none',
      'text-align': s.align,
      'line-height': String(s.lineHeight),
      /*
       * 배경·테두리·글자색은 공용 해석기를 거친다. 텍스트의 기본 배경은 투명이다 —
       * 텍스트는 문서 배경 위에 얹히는 게 자연스럽고, 색을 채우면 아래 내용을 가린다.
       */
      ...boxStyleToCss(
        {
          // exactOptionalPropertyTypes: 미지정 필드는 키 자체를 빼야 한다.
          ...(s.fill !== undefined ? { fill: s.fill } : {}),
          ...(s.stroke !== undefined ? { stroke: s.stroke } : {}),
          ...(s.strokeWidth !== undefined ? { strokeWidth: s.strokeWidth } : {}),
          color: s.color,
        },
        { defaultFill: null },
      ),
    }
  }

  const node = el('div', {
    class: { 'pck-obj-text': true, 'is-editing': props.editing },
    // 레코드를 반환하는 함수. `boxStyleToCss` 가 필드를 빼면 그 프로퍼티가 제거된다 (§13).
    style,
    attr: {
      // `contenteditable` 은 속성이다. `false` 를 지우면 브라우저 기본(상속)이 되므로
      // 문자열 'false' 를 명시한다.
      contenteditable: () => (props.editing() ? 'true' : 'false'),
      spellcheck: 'false',
    },
    on: {
      input: () => {
        // 조합 중에는 중간 상태를 문서에 커밋하지 않는다. compositionend 에서 한 번에 보낸다.
        if (composing.value) return
        props.onEdit(node.textContent ?? '')
      },
      compositionstart: () => (composing.value = true),
      compositionend: () => {
        composing.value = false
        props.onEdit(node.textContent ?? '')
      },
    },
  })

  /*
   * 문서 값 → DOM.
   *
   * 편집 중과 조합 중에는 건너뛴다. 사용자가 입력하는 동안 DOM 을 덮으면 캐럿이 앞으로 튀고,
   * IME 조합이 끊긴다. `textContent` 비교도 필요하다 — 같은 값을 다시 써도 캐럿이 움직인다.
   *
   * **첫 실행은 건너뛰지 않는다.** 가드는 사용자가 타이핑하는 중의 캐럿을 지키려는 것이고,
   * 아직 아무것도 쓰지 않은 상태에는 지킬 캐럿이 없다. 이걸 빠뜨리면 `editing` 이 처음부터
   * true 인 상태로 마운트될 때 **텍스트가 아예 안 보인다.**
   *
   * 세 의존성을 조건 앞에서 모두 읽는다. `&&` 로 짧게 끊으면 그 값이 추적되지 않아
   * `editing` 이 false 로 바뀔 때 effect 가 다시 돌지 않는다.
   */
  let initialized = false
  effect(() => {
    const text = props.object.value.text
    const editing = props.editing()
    const isComposing = composing.value
    if (initialized && (editing || isComposing)) return
    initialized = true
    if (node.textContent !== text) node.textContent = text
  })

  /*
   * 편집 시작 시 포커스를 주고 캐럿을 끝으로 보낸다.
   *
   * Vue 판은 `await nextTick()` 을 기다렸다. 여기서는 effect 가 동기이고 `contenteditable`
   * 속성이 이미 설정된 뒤에 이 effect 가 돌므로 (등록 순서: 위 attr 바인딩 → 이 effect)
   * 바로 `focus()` 할 수 있다.
   *
   * ⚠️ 노드가 아직 문서에 붙지 않았으면 `focus()` 는 조용히 실패한다. 편집은 사용자가
   * 더블클릭해야 시작되고 그 시점에는 이미 붙어 있으므로 실제로는 문제가 되지 않는다.
   */
  effect(() => {
    if (!props.editing()) return
    node.focus()
    const range = document.createRange()
    range.selectNodeContents(node)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  })

  return node
}
