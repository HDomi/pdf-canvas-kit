/**
 * DOM 생성·바인딩 헬퍼 (PLAN D20).
 *
 * Vue 템플릿이 하던 일을 대신한다. 템플릿 컴파일러도 VDOM 도 없고, **바인딩마다 effect 하나**가
 * 붙어 자기 노드만 갱신한다.
 *
 * ```ts
 * const [root, dispose] = scope(() =>
 *   el('div', { class: 'pck-editor' }, [
 *     el('h1', {}, [() => doc.value.title]),
 *     when(() => selected.value.length > 0, () => el('aside', …)),
 *     list(() => pages.value, (p) => p.id, (page, i) => thumb(page, i)),
 *   ]),
 * )
 * ```
 *
 * ## 컴포넌트 계약
 *
 * 컴포넌트는 **`Element` 를 반환하는 평범한 함수**다. 클래스도, 라이프사이클 훅도 없다.
 * 정리는 `scope` 가 맡으므로 dispose 를 반환하지 않는다 — 필요하면 `onCleanup` 을 부른다.
 *
 * ```ts
 * function saveBadge(state: ReadSignal<SaveState>): HTMLElement {
 *   return el('span', { class: () => `pck-badge is-${state.value}` }, [() => label(state.value)])
 * }
 * ```
 *
 * ## 반응성을 켜는 방법
 *
 * 값 자리에 **함수를 넣으면** 반응형이 된다. 정적인 값은 그대로 쓴다.
 *
 * | 쓰는 법 | 결과 |
 * | --- | --- |
 * | `class: 'pck-page'` | 한 번만 설정 |
 * | `class: () => …` | 값이 바뀔 때마다 갱신 |
 * | 자식으로 `'제목'` | 정적 텍스트 |
 * | 자식으로 `() => doc.value.title` | 반응형 텍스트 노드 |
 */
import {
  effect,
  onCleanup,
  read,
  scope,
  signal,
  type Dispose,
  type MaybeReactive,
  type ReadSignal,
} from './reactive'

/* ------------------------------------------------------------------ 자식 -- */

/**
 * `el()` 의 자식으로 넣을 수 있는 것.
 *
 * 함수를 넣으면 **반응형 텍스트**가 된다. 조건에 따라 다른 노드를 그리려면 `when()` 을 쓴다 —
 * 함수가 Node 를 반환하는 것도 허용하면 "텍스트인가 노드인가" 를 런타임에 판단해야 하고,
 * 그 분기가 틀렸을 때 증상이 "글자가 `[object HTMLDivElement]` 로 보임" 이 된다.
 */
export type Child =
  | Node
  | string
  | number
  | null
  | undefined
  | false
  | Fragment
  | (() => string | number | null | undefined | false)
  | Child[]

/**
 * 스스로 부모에 붙는 자식. `when()` · `list()` 가 이 형태다.
 *
 * 두 단계로 나눈 이유: 조건부·리스트는 **앵커 노드가 부모에 붙은 뒤에** 내용을 넣어야 한다.
 * 생성 시점에 바로 넣으려 하면 앵커에 `parentNode` 가 없다.
 */
export interface Fragment {
  readonly __fragment: true
  /** 부모에 붙이고 반응성을 켠다. */
  attach(parent: Node): void
}

const isFragment = (v: unknown): v is Fragment =>
  typeof v === 'object' && v !== null && '__fragment' in v

function appendChild(parent: Node, child: Child): void {
  if (child === null || child === undefined || child === false) return

  if (Array.isArray(child)) {
    for (const c of child) appendChild(parent, c)
    return
  }

  if (isFragment(child)) {
    child.attach(parent)
    return
  }

  if (child instanceof Node) {
    parent.appendChild(child)
    return
  }

  if (typeof child === 'function') {
    const node = document.createTextNode('')
    parent.appendChild(node)
    effect(() => {
      const v = child()
      node.data = v === null || v === undefined || v === false ? '' : String(v)
    })
    return
  }

  parent.appendChild(document.createTextNode(String(child)))
}

/* ------------------------------------------------------------------ props -- */

/** 클래스. 문자열이거나, `{ 클래스명: 조건 }` 맵이다. */
export type ClassValue =
  | MaybeReactive<string | null | undefined>
  | Record<string, MaybeReactive<boolean | null | undefined>>

/** 스타일 프로퍼티 하나의 값. 숫자는 px 로, `null`·`undefined`·`''` 는 제거로 해석된다. */
export type StyleProp = string | number | null | undefined

/**
 * 스타일. 세 가지 형태를 받는다.
 *
 * | 형태 | 쓰는 곳 |
 * | --- | --- |
 * | `'left:10px'` · `() => '…'` | 문자열 그대로 |
 * | `{ left: 10, top: () => y.value }` | **키가 고정**일 때. 항목마다 effect 가 붙는다 |
 * | `() => ({ ... })` | **키 집합이 동적**일 때. 사라진 키를 제거한다 |
 *
 * 세 번째가 필요한 이유: `boxStyleToCss()` 는 지정된 필드만 내보낸다(§3.3). 교사가 배경색을
 * 껐을 때 그 키가 사라지므로, 이전 키를 지워 주지 않으면 색이 화면에 남는다.
 *
 * `--pck-*` 같은 CSS 변수도 키로 쓸 수 있다 — 패널 폭을 CSS 변수로 내려보내는 데 필요하다
 * (ARCHITECTURE §7.6). `setProperty` 를 쓰므로 커스텀 프로퍼티가 그대로 동작한다.
 */
export type StyleValue =
  | string
  | null
  | undefined
  | (() => string | Record<string, StyleProp> | null | undefined)
  | Record<string, MaybeReactive<StyleProp>>

/**
 * 속성 값.
 *
 * | 값 | HTML 속성 | `aria-*` |
 * | --- | --- | --- |
 * | `null` · `undefined` | 제거 | 제거 |
 * | `true` | `=""` (존재하면 참) | `="true"` |
 * | `false` | 제거 | `="false"` |
 * | 그 외 | `String(v)` | `String(v)` |
 */
export type AttrValue = MaybeReactive<string | number | boolean | null | undefined>

export interface ElProps<E extends Element = Element> {
  class?: ClassValue
  style?: StyleValue
  /**
   * HTML **속성**. `role` · `aria-*` · `data-*` · `type` · `placeholder` 등.
   *
   * `prop` 과 나눠 둔 것은 의도다. Vue 는 이름을 보고 속성인지 프로퍼티인지 추측하는데,
   * 그 추측이 어긋나면 "input 에 타이핑한 뒤 값이 갱신되지 않는다" 같은 증상이 된다.
   * 어느 쪽인지 호출부가 밝히면 그 종류의 버그가 없다.
   */
  attr?: Record<string, AttrValue>
  /**
   * DOM **프로퍼티**. 폼 컨트롤의 `value` · `checked` · `disabled` · `selectedIndex` 처럼
   * 속성이 아니라 프로퍼티가 실제 상태인 것들.
   */
  prop?: Record<string, MaybeReactive<unknown>>
  /** 이벤트. `[핸들러, 옵션]` 형태로 `passive` · `capture` 를 줄 수 있다. */
  on?: Record<string, EventListener | [EventListener, AddEventListenerOptions]>
  /** 만들어진 엘리먼트를 받는다. Vue 의 template ref 자리. */
  ref?: (el: E) => void
}

function applyClass(node: Element, value: ClassValue): void {
  if (typeof value === 'string' || value === null || value === undefined) {
    if (value) node.setAttribute('class', value)
    return
  }

  if (typeof value === 'function') {
    effect(() => {
      const v = value()
      if (v) node.setAttribute('class', v)
      else node.removeAttribute('class')
    })
    return
  }

  // { 클래스명: 조건 } 맵. 항목마다 effect 를 붙여 조건이 바뀐 클래스만 건드린다.
  for (const [name, cond] of Object.entries(value)) {
    if (typeof cond === 'function') {
      effect(() => node.classList.toggle(name, !!cond()))
    } else if (cond) {
      node.classList.add(name)
    }
  }
}

function applyStyle(node: Element, value: StyleValue): void {
  const style = (node as HTMLElement | SVGElement).style

  const setProp = (name: string, raw: StyleProp) => {
    if (raw === null || raw === undefined || raw === '') style.removeProperty(name)
    else style.setProperty(name, typeof raw === 'number' ? `${raw}px` : raw)
  }

  if (typeof value === 'string' || value === null || value === undefined) {
    if (value) node.setAttribute('style', value)
    return
  }

  if (typeof value === 'function') {
    /*
     * 문자열과 레코드를 모두 받는다. 레코드일 때는 **이전에 설정했던 키 중 사라진 것을 지운다** —
     * 그러지 않으면 `boxStyleToCss()` 가 필드를 빼도 화면에 옛 값이 남는다.
     */
    let prevKeys: string[] = []
    effect(() => {
      const v = value()

      if (v === null || v === undefined) {
        for (const k of prevKeys) style.removeProperty(k)
        prevKeys = []
        node.removeAttribute('style')
        return
      }

      if (typeof v === 'string') {
        prevKeys = []
        node.setAttribute('style', v)
        return
      }

      for (const k of prevKeys) if (!(k in v)) style.removeProperty(k)
      for (const [k, raw] of Object.entries(v)) setProp(k, raw)
      prevKeys = Object.keys(v)
    })
    return
  }

  for (const [name, v] of Object.entries(value)) {
    if (typeof v === 'function') effect(() => setProp(name, v()))
    else setProp(name, v)
  }
}

/**
 * ARIA 속성은 boolean 을 **리터럴 문자열**로 쓴다.
 *
 * HTML boolean 속성(`disabled` · `hidden`)은 "존재하면 참" 이므로 참일 때 빈 문자열, 거짓일 때
 * 제거가 맞다. **ARIA 는 그렇지 않다** — `aria-pressed=""` 는 유효하지 않고, 스크린리더가
 * "눌리지 않음" 을 알려면 `aria-pressed="false"` 가 있어야 한다. 제거하면 "토글이 아님" 이라는
 * 다른 뜻이 된다.
 *
 * 호출부에서 `String(x)` 을 하게 두면 네 곳 중 한 곳을 빠뜨린다(실제로 그랬다). 여기서 처리한다.
 */
const isAria = (name: string) => name.startsWith('aria-')

function applyAttr(node: Element, name: string, value: AttrValue): void {
  const aria = isAria(name)
  const set = (raw: string | number | boolean | null | undefined) => {
    if (raw === null || raw === undefined) {
      node.removeAttribute(name)
      return
    }
    if (typeof raw === 'boolean') {
      if (aria) node.setAttribute(name, raw ? 'true' : 'false')
      else if (raw) node.setAttribute(name, '')
      else node.removeAttribute(name)
      return
    }
    node.setAttribute(name, String(raw))
  }
  if (typeof value === 'function') effect(() => set(value()))
  else set(value)
}

function applyProps<E extends Element>(node: E, props: ElProps<E>): void {
  if (props.class !== undefined) applyClass(node, props.class)
  if (props.style !== undefined) applyStyle(node, props.style)

  if (props.attr) {
    for (const [name, value] of Object.entries(props.attr)) applyAttr(node, name, value)
  }

  if (props.prop) {
    for (const [name, value] of Object.entries(props.prop)) {
      const target = node as unknown as Record<string, unknown>
      if (typeof value === 'function') {
        effect(() => {
          const next = (value as () => unknown)()
          // 같은 값을 다시 쓰지 않는다. `input.value` 재대입은 캐럿을 끝으로 보낸다.
          if (target[name] !== next) target[name] = next
        })
      } else {
        target[name] = value
      }
    }
  }

  if (props.on) {
    for (const [type, handler] of Object.entries(props.on)) {
      const [fn, options] = Array.isArray(handler) ? handler : [handler, undefined]
      node.addEventListener(type, fn, options)
      onCleanup(() => node.removeEventListener(type, fn, options))
    }
  }

  props.ref?.(node)
}

/* --------------------------------------------------------------- el · svg -- */

/**
 * 엘리먼트를 만들고 props 를 바인딩한다.
 *
 * 자식은 순서대로 붙는다. `Fragment`(=`when`·`list`)는 **부모에 붙은 뒤** 반응성을 켜므로,
 * 이 함수 안에서 앵커가 먼저 `appendChild` 되고 그 다음 내용이 들어간다.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: ElProps<HTMLElementTagNameMap[K]>,
  children?: Child[],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (props) applyProps(node, props)
  if (children) appendChild(node, children)
  return node
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * SVG 엘리먼트. 선택 오버레이·핸들이 쓴다 (ARCHITECTURE §6.2).
 *
 * SVG 는 별도 네임스페이스라 `createElement` 로 만들면 렌더되지 않는다 — 조용히 안 보이므로
 * 원인을 찾기 어렵다. **SVG 자식도 이 함수로 만들어야 한다.**
 */
export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  props?: ElProps<SVGElementTagNameMap[K]>,
  children?: Child[],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag)
  if (props) applyProps(node, props)
  if (children) appendChild(node, children)
  return node
}

/* ------------------------------------------------------------------ when -- */

/** 앵커 뒤에 붙은 노드들을 제거한다. */
function removeNodes(nodes: Node[]): void {
  for (const n of nodes) n.parentNode?.removeChild(n)
  nodes.length = 0
}

/** `el` 이 반환한 것을 삽입 가능한 노드 배열로 만든다. */
function toNodes(rendered: Element | Element[] | null): Node[] {
  if (rendered === null) return []
  return Array.isArray(rendered) ? rendered : [rendered]
}

/**
 * 조건부 렌더. Vue 의 `v-if` 자리.
 *
 * 조건이 **바뀔 때만** 다시 그린다. `truthy → truthy` 는 재생성하지 않으므로, 안에서 편집 중인
 * 텍스트 노드가 살아남는다 (한글 IME — ARCHITECTURE §6.5).
 *
 * 내용은 자기 scope 에서 만들어지므로, 사라질 때 그 안의 effect 가 함께 정리된다.
 */
export function when(cond: () => unknown, render: () => Element | Element[] | null): Fragment {
  return {
    __fragment: true,
    attach(parent: Node) {
      const anchor = document.createComment('when')
      parent.appendChild(anchor)

      let nodes: Node[] = []
      let dispose: Dispose | null = null
      let shown = false

      const clear = () => {
        removeNodes(nodes)
        dispose?.()
        dispose = null
        shown = false
      }

      effect(() => {
        const next = !!cond()
        if (next === shown) return

        if (!next) {
          clear()
          return
        }

        const [rendered, d] = scope(render)
        dispose = d
        nodes = toNodes(rendered)
        const ref = anchor.nextSibling
        for (const n of nodes) anchor.parentNode!.insertBefore(n, ref)
        shown = true
      })

      onCleanup(clear)
    },
  }
}

/* ------------------------------------------------------------------ list -- */

interface Entry<T> {
  key: unknown
  node: Node
  dispose: Dispose
  item: T
  /** 키가 같고 내용만 바뀌면 노드를 다시 만들지 않고 이 signal 만 갱신한다. */
  setItem: (v: T) => void
  setIndex: (v: number) => void
}

/**
 * 키 기반 리스트. Vue 의 `v-for` + `:key` 자리.
 *
 * **키가 같으면 노드를 재사용한다.** 페이지 순서를 바꿀 때 썸네일을 다시 만들지 않으므로
 * 이미지가 다시 로드되며 깜빡이지 않고, 순서 변경 드래그 중에도 노드가 유지된다.
 *
 * `render` 는 항목과 인덱스를 **signal 로** 받는다. 값이 바뀌었을 때 노드를 새로 만드는 대신
 * 그 signal 만 갱신하기 때문이다 — 순서만 바뀐 경우 DOM 이동만 일어난다.
 *
 * ```ts
 * list(
 *   () => pages.value,
 *   (p) => p.id,
 *   (page, index) => el('button', { class: () => (index.value === current.value ? 'is-on' : '') }),
 * )
 * ```
 */
export function list<T>(
  items: () => readonly T[],
  key: (item: T, index: number) => unknown,
  render: (item: ReadSignal<T>, index: ReadSignal<number>) => Element,
): Fragment {
  return {
    __fragment: true,
    attach(parent: Node) {
      const anchor = document.createComment('list')
      parent.appendChild(anchor)

      let entries: Entry<T>[] = []

      const disposeAll = () => {
        for (const e of entries) {
          e.node.parentNode?.removeChild(e.node)
          e.dispose()
        }
        entries = []
      }

      effect(() => {
        const next = items()
        const prevByKey = new Map<unknown, Entry<T>>()
        for (const e of entries) prevByKey.set(e.key, e)

        const nextEntries: Entry<T>[] = []

        for (let i = 0; i < next.length; i++) {
          const item: T = next[i] as T
          const k = key(item, i)
          const existing = prevByKey.get(k)

          if (existing) {
            prevByKey.delete(k)
            // 내용이 바뀌었으면 signal 만 갱신한다. 노드는 그대로 둔다.
            if (existing.item !== item) {
              existing.item = item
              existing.setItem(item)
            }
            existing.setIndex(i)
            nextEntries.push(existing)
            continue
          }

          nextEntries.push(createEntry<T>(item, i, k, render))
        }

        // 남은 것은 사라진 항목이다. 노드를 떼고 그 항목의 effect 를 정리한다.
        for (const gone of prevByKey.values()) {
          gone.node.parentNode?.removeChild(gone.node)
          gone.dispose()
        }

        /*
         * 순서를 맞춘다. 앵커 바로 뒤부터 새 순서대로 훑으며, 이미 제 위치에 있는 노드는
         * 건드리지 않는다. `insertBefore` 는 이동이므로 옮겨진 노드만 DOM 조작이 일어난다.
         */
        const container = anchor.parentNode!
        let cursor: Node | null = anchor.nextSibling
        for (const e of nextEntries) {
          if (cursor === e.node) {
            cursor = e.node.nextSibling
            continue
          }
          container.insertBefore(e.node, cursor)
        }

        entries = nextEntries
      })

      onCleanup(disposeAll)
    },
  }
}

function createEntry<T>(
  item: T,
  index: number,
  k: unknown,
  render: (item: ReadSignal<T>, index: ReadSignal<number>) => Element,
): Entry<T> {
  /*
   * signal 은 scope 밖에서 만든다. signal 자체는 정리할 것이 없고(effect 가 아니다), 수명은
   * Entry 가 직접 들고 있다. 반대로 `render` 는 scope 안에서 불러야 그 안의 effect 가
   * 항목과 함께 정리된다.
   */
  const itemSignal = signal(item)
  const indexSignal = signal(index)

  const [node, dispose] = scope(() => render(itemSignal, indexSignal))

  return {
    key: k,
    node,
    dispose,
    item,
    setItem: (v: T) => (itemSignal.value = v),
    setIndex: (v: number) => (indexSignal.value = v),
  }
}

/* ------------------------------------------------------------------ 기타 -- */

/**
 * 텍스트 노드. 자식 자리에 함수를 넣는 것과 같지만, 부모 없이 노드만 필요할 때 쓴다.
 */
export function text(value: MaybeReactive<string | number>): Text {
  const node = document.createTextNode('')
  if (typeof value === 'function') effect(() => (node.data = String(read(value))))
  else node.data = String(value)
  return node
}
