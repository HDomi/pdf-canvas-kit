/**
 * 미세 반응성 프리미티브 (PLAN D20).
 *
 * API 모양을 Vue 의 `ref` · `computed` · `watch` 와 일부러 같게 맞췄다. 구 `src/vue/` 의
 * 컨트롤러 로직 ~2,000줄이 이 파일 하나로 기계적으로 이식되기 때문이다 (PLAN 20.1).
 *
 * ---
 *
 * ## Vue 와 다른 점 두 가지 — 이식할 때 반드시 확인한다
 *
 * **1. 깊은 반응성이 없다.** Vue 의 `ref(obj)` 는 내부를 `reactive()` 프록시로 감싸므로
 * `view.value.activeTool = 'select'` 가 반응성을 일으킨다. 여기서는 **아무 일도 일어나지 않는다.**
 * `signal` 은 `.value` 대입만 감지한다.
 *
 * ```ts
 * // 안 됨 — 조용히 실패한다
 * const view = signal(createViewState())
 * view.value.activeTool = 'select'
 *
 * // 됨 — 필드마다 signal 을 둔다
 * const activeTool = signal<ToolId>('select')
 * ```
 *
 * 프록시를 두지 않은 이유: 프록시는 "왜 이건 반응하고 저건 안 하나" 를 런타임에만 알 수 있게 만든다.
 * 얕은 것만 있으면 규칙이 하나다 — **대입해야 알린다.** `Map`·`Set`·배열도 같다. 내용을 변형하지
 * 말고 새 값을 대입한다.
 *
 * **2. effect 가 동기다.** Vue 는 마이크로태스크 큐에 모아 실행하고, 그래서 레이아웃을 읽어야 하는
 * 코드가 `flush: 'post'` 를 필요로 했다. 여기서는 대입이 끝나는 순간 DOM 이 이미 갱신돼 있으므로
 * 다음 줄에서 바로 `getBoundingClientRect()` 를 읽어도 된다 (좌표계가 여기에 의존한다 — PLAN 5.4).
 *
 * 한 제스처가 여러 signal 을 건드릴 때는 `batch()` 로 묶어 중간 상태 렌더를 건너뛴다.
 */

/** 의존성 추적 단위. signal 하나가 자신을 읽은 구독자 집합을 들고 있다. */
type Dep = Set<Subscriber>

interface Subscriber {
  /** 의존성이 바뀌었을 때 다시 실행할 몸통. */
  run(): void
  /** 이 구독자가 등록된 모든 Dep. 재실행 전에 전부 끊고 다시 모은다. */
  deps: Set<Dep>
  disposed: boolean
}

/** 지금 실행 중인 구독자. `.value` 읽기가 이걸 보고 자기 자신을 등록한다. */
let activeSub: Subscriber | null = null

/** `batch()` 중첩 깊이. 0 이 아니면 알림을 `pending` 에 모은다. */
let batchDepth = 0
const pending = new Set<Subscriber>()

/**
 * 재진입 가드. effect 가 자기 의존성을 다시 쓰면 무한 루프가 된다.
 *
 * Vue 는 이 상황에서 경고를 내고 멈춘다. 여기서도 조용히 스택을 태우는 대신 던진다 — 원인을
 * 스택트레이스에서 볼 수 있어야 한다.
 */
let flushDepth = 0
const MAX_FLUSH_DEPTH = 100

/* ------------------------------------------------------------ 추적·알림 -- */

function track(dep: Dep): void {
  const sub = activeSub
  if (!sub) return
  dep.add(sub)
  sub.deps.add(dep)
}

function notify(dep: Dep): void {
  if (dep.size === 0) return
  // 순회 중 구독자가 자기 의존성을 갈아끼우므로 사본을 돈다.
  const subs = Array.from(dep)
  if (batchDepth > 0) {
    for (const sub of subs) if (!sub.disposed) pending.add(sub)
    return
  }
  runAll(subs)
}

function runAll(subs: readonly Subscriber[]): void {
  if (++flushDepth > MAX_FLUSH_DEPTH) {
    flushDepth = 0
    throw new Error('reactive: effect loop detected — an effect writes a signal it depends on')
  }
  try {
    for (const sub of subs) if (!sub.disposed) sub.run()
  } finally {
    flushDepth--
  }
}

/** 구독자를 모든 Dep 에서 떼어낸다. 재실행 직전과 dispose 시점에 부른다. */
function cleanup(sub: Subscriber): void {
  for (const dep of sub.deps) dep.delete(sub)
  sub.deps.clear()
}

/* -------------------------------------------------------------- signal -- */

/** 읽기만 가능한 반응형 값. `computed` 의 반환 타입. */
export interface ReadSignal<T> {
  readonly value: T
}

/** 읽고 쓰는 반응형 값. Vue 의 `ref` 자리. */
export interface Signal<T> extends ReadSignal<T> {
  value: T
}

/**
 * 반응형 값을 만든다.
 *
 * 같은 값(`Object.is`)을 다시 대입하면 알리지 않는다. 배열·객체는 참조가 다르면 다른 값이므로
 * `[...]` 를 새로 만들어 대입하는 패턴이 정상 동작한다.
 */
export function signal<T>(initial: T): Signal<T> {
  const dep: Dep = new Set()
  let v = initial
  return {
    get value() {
      track(dep)
      return v
    },
    set value(next: T) {
      if (Object.is(next, v)) return
      v = next
      notify(dep)
    },
  }
}

/* ------------------------------------------------------------ computed -- */

/** 읽고 쓰는 파생 값. 구 코드의 `computed({ get, set })` 자리. */
export interface WritableSignal<T> extends Signal<T> {
  value: T
}

/**
 * 파생 값. **지연 계산 + 캐시**다.
 *
 * 아무도 읽지 않으면 계산하지 않고, 의존성이 바뀌면 더럽다고 표시만 해 둔다. 문서 전체를 훑는
 * 파생값(문항 번호·검증 결과)이 문서 변경마다 즉시 재계산되지 않게 하려는 것이다 (PLAN 13).
 */
export function computed<T>(get: () => T): ReadSignal<T>
export function computed<T>(get: () => T, set: (v: T) => void): WritableSignal<T>
export function computed<T>(get: () => T, set?: (v: T) => void): WritableSignal<T> {
  const dep: Dep = new Set()
  let cached: T
  let dirty = true

  const sub: Subscriber = {
    deps: new Set(),
    disposed: false,
    run() {
      // 값을 여기서 다시 계산하지 않는다. 더럽다고만 표시하고, 실제 계산은 누군가 읽을 때.
      if (dirty) return
      dirty = true
      notify(dep)
    },
  }

  /*
   * computed 도 scope 에 정리를 등록한다.
   *
   * effect 와 달리 computed 는 수동적이라 "끊을 것이 없다" 고 생각하기 쉽지만, 자기가 읽은
   * signal 의 구독 집합에 자신이 들어 있다. 리스트 항목마다 만든 computed 를 정리하지 않으면
   * 문서 signal 이 지워진 항목의 computed 를 계속 붙들고 있게 된다.
   *
   * 정리 후 다시 읽히면 `dirty` 상태에서 재계산하며 의존성을 새로 모으므로 동작은 그대로다.
   */
  onCleanup(() => {
    cleanup(sub)
    dirty = true
  })

  return {
    get value() {
      track(dep)
      if (dirty) {
        cleanup(sub)
        const prev = activeSub
        activeSub = sub
        try {
          cached = get()
        } finally {
          activeSub = prev
        }
        dirty = false
      }
      return cached
    },
    set value(next: T) {
      if (!set) {
        throw new Error('reactive: computed is read-only — pass a setter to make it writable')
      }
      set(next)
    },
  }
}

/* -------------------------------------------------------------- effect -- */

/** effect · watch 를 끊는 함수. 두 번 불러도 안전하다. */
export type Dispose = () => void

/* --------------------------------------------------------------- 소유권 -- */

/**
 * 현재 열려 있는 scope 의 정리 목록.
 *
 * DOM 트리를 떼어낼 때 그 안에서 만든 effect 를 **전부** 끊어야 한다. 컴포넌트마다 dispose 를
 * 손으로 모아 반환하게 하면 하나만 빠뜨려도 리스너가 남고, 그 누수는 증상이 늦게 나타난다.
 * scope 를 두면 **누수가 아니라 정리가 기본값**이 된다.
 */
let currentScope: Dispose[] | null = null

/**
 * `fn` 안에서 만들어진 모든 effect 를 한 번에 끊을 수 있는 단위로 묶는다.
 *
 * 중첩된다 — 안쪽 scope 의 정리 함수는 안쪽에만 등록되므로, 리스트 항목 하나를 지울 때
 * 그 항목의 effect 만 끊긴다.
 *
 * ```ts
 * const [el, dispose] = scope(() => buildEditor(props))
 * container.append(el)
 * // 나중에
 * dispose()   // buildEditor 안의 effect 전부 정리
 * ```
 */
export function scope<T>(fn: () => T): [T, Dispose] {
  const disposers: Dispose[] = []
  const prev = currentScope
  currentScope = disposers
  let result: T
  try {
    result = fn()
  } finally {
    currentScope = prev
  }
  let done = false
  return [
    result,
    () => {
      if (done) return
      done = true
      // 역순으로 정리한다. 나중에 만든 것이 먼저 만든 것에 의존할 수 있다.
      for (let i = disposers.length - 1; i >= 0; i--) disposers[i]!()
      disposers.length = 0
    },
  ]
}

/**
 * 현재 scope 가 닫힐 때 부를 정리 함수를 등록한다.
 *
 * scope 밖에서 부르면 **아무 일도 하지 않는다** — 던지지 않는다. 컴포넌트 함수를 scope 없이
 * 단독 호출해 보는 것(디버깅·검증)을 막지 않기 위해서다. 대신 그 경우 정리는 호출자 몫이다.
 */
export function onCleanup(fn: Dispose): void {
  currentScope?.push(fn)
}

/* -------------------------------------------------------------- effect -- */

/**
 * 의존성이 바뀔 때마다 다시 실행되는 부수효과. **즉시 한 번 실행된다.**
 *
 * DOM 바인딩이 전부 이걸 쓴다 (`h.ts`). 읽은 signal 만 의존성이 되므로, 조건부 분기 안에서만
 * 읽는 값은 그 분기를 탈 때만 구독된다.
 *
 * **열려 있는 `scope` 가 있으면 자기 dispose 를 거기 등록한다.** 그래서 컴포넌트가 dispose 를
 * 반환하거나 모으지 않아도 정리가 된다. 반환값은 개별적으로 일찍 끊고 싶을 때만 쓴다.
 */
export function effect(fn: () => void): Dispose {
  const sub: Subscriber = {
    deps: new Set(),
    disposed: false,
    run() {
      if (sub.disposed) return
      cleanup(sub)
      const prev = activeSub
      activeSub = sub
      try {
        fn()
      } finally {
        activeSub = prev
      }
    },
  }
  sub.run()
  const dispose: Dispose = () => {
    if (sub.disposed) return
    sub.disposed = true
    cleanup(sub)
  }
  onCleanup(dispose)
  return dispose
}

export interface WatchOptions {
  /** 즉시 한 번 부른다. 이전 값은 `undefined` 다. */
  immediate?: boolean
  /**
   * 콜백을 **마이크로태스크로 미룬다.** Vue 의 `flush: 'post'` 자리.
   *
   * ## 언제 필요한가 — 레이아웃을 읽는 콜백
   *
   * effect 는 동기이고 실행 순서는 **등록 순서**다. 그래서 같은 signal 을 구독하는
   * "DOM 스타일을 쓰는 effect" 와 "레이아웃을 읽는 콜백" 이 있을 때, 후자가 먼저 등록돼 있으면
   * **낡은 값을 읽는다.**
   *
   * 실제 사례: 배율이 바뀌면 페이지 프레임 크기가 변하고 뷰포트 위치도 변한다. 측정 콜백이
   * 스타일 바인딩보다 먼저 등록돼 있으면 이전 배율의 위치를 캐시하고, 선택 핸들이 줌 직후
   * 어긋난 자리에 그려진다.
   *
   * `defer` 를 켜면 그 턴의 모든 동기 effect 가 끝난 뒤에 콜백이 돈다 — 등록 순서와 무관해진다.
   *
   * **레이아웃을 읽지 않는 콜백에는 쓰지 않는다.** 미루는 만큼 상태가 한 틱 늦게 반영된다.
   */
  defer?: boolean
}

/**
 * 특정 값이 바뀔 때만 콜백을 부른다. Vue 의 `watch(source, cb)` 자리.
 *
 * `effect` 와 달리 콜백 안에서 읽는 signal 은 의존성이 되지 않는다 — `source` 만 본다.
 * 콜백이 다른 상태를 읽고 쓰는 경우가 많아서, 그것까지 구독하면 의도하지 않은 재실행이 생긴다.
 *
 * **여러 값을 보려면 배열을 반환한다.** `Object.is` 로 비교하므로 배열은 매번 다른 참조가 되지만,
 * `source` 가 다시 실행되는 것 자체가 의존성이 실제로 바뀐 경우이므로 결과는 같다.
 *
 * ```ts
 * watch(() => [pageListWidth.value, inspectorWidth.value], persist)
 * ```
 */
export function watch<T>(
  source: () => T,
  cb: (value: T, prev: T | undefined) => void,
  options?: WatchOptions,
): Dispose {
  let prev: T | undefined
  let first = true
  const defer = options?.defer === true

  /** 미뤄 둔 호출. 한 턴에 여러 번 바뀌어도 마지막 것만 돈다. */
  let queued: { value: T; before: T | undefined } | null = null
  let disposed = false

  const fire = (value: T, before: T | undefined) => {
    if (!defer) {
      untrack(() => cb(value, before))
      return
    }
    const wasQueued = queued !== null
    // 여러 번 바뀌면 마지막 값만 남긴다. `before` 는 이 턴의 최초 이전 값을 유지한다.
    queued = { value, before: wasQueued ? queued!.before : before }
    if (wasQueued) return
    void Promise.resolve().then(() => {
      const pendingCall = queued
      queued = null
      if (disposed || !pendingCall) return
      untrack(() => cb(pendingCall.value, pendingCall.before))
    })
  }

  const stop = effect(() => {
    const value = source()
    if (first) {
      first = false
      prev = value
      if (options?.immediate) fire(value, undefined)
      return
    }
    if (Object.is(value, prev)) return
    const before = prev
    prev = value
    fire(value, before)
  })

  const dispose: Dispose = () => {
    disposed = true
    queued = null
    stop()
  }
  onCleanup(dispose)
  return dispose
}

/* --------------------------------------------------------- batch·untrack -- */

/**
 * 여러 대입을 하나의 갱신으로 묶는다.
 *
 * 한 사용자 제스처가 문서·선택·배율을 함께 바꿀 때 중간 상태로 렌더되는 것을 막는다.
 * 중첩해도 가장 바깥에서 한 번만 흘린다.
 */
export function batch<T>(fn: () => T): T {
  batchDepth++
  try {
    return fn()
  } finally {
    batchDepth--
    if (batchDepth === 0 && pending.size > 0) {
      const subs = Array.from(pending)
      pending.clear()
      runAll(subs)
    }
  }
}

/** 의존성으로 잡히지 않게 읽는다. effect 안에서 "지금 값만 보고 싶을 때" 쓴다. */
export function untrack<T>(fn: () => T): T {
  const prev = activeSub
  activeSub = null
  try {
    return fn()
  } finally {
    activeSub = prev
  }
}

/**
 * 값이거나 값을 주는 함수. DOM 바인딩 prop 이 전부 이 형태를 받는다.
 *
 * 정적인 값에 함수를 쓰라고 강요하지 않기 위한 것이다 — `class: 'pck-page'` 도
 * `class: () => …` 도 같이 받는다.
 */
export type MaybeReactive<T> = T | (() => T)

/** `MaybeReactive` 를 읽는다. 함수면 부르고, 그때 의존성이 잡힌다. */
export function read<T>(v: MaybeReactive<T>): T {
  return typeof v === 'function' ? (v as () => T)() : v
}
