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

/**
 * 의존성이 바뀔 때마다 다시 실행되는 부수효과. **즉시 한 번 실행된다.**
 *
 * DOM 바인딩이 전부 이걸 쓴다 (`h.ts`). 읽은 signal 만 의존성이 되므로, 조건부 분기 안에서만
 * 읽는 값은 그 분기를 탈 때만 구독된다.
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
  return () => {
    if (sub.disposed) return
    sub.disposed = true
    cleanup(sub)
  }
}

/**
 * 특정 값이 바뀔 때만 콜백을 부른다. Vue 의 `watch(source, cb)` 자리.
 *
 * `effect` 와 달리 콜백 안에서 읽는 signal 은 의존성이 되지 않는다 — `source` 만 본다.
 * 콜백이 다른 상태를 읽고 쓰는 경우가 많아서, 그것까지 구독하면 의도하지 않은 재실행이 생긴다.
 */
export function watch<T>(
  source: () => T,
  cb: (value: T, prev: T | undefined) => void,
  options?: { immediate?: boolean },
): Dispose {
  let prev: T | undefined
  let first = true
  return effect(() => {
    const value = source()
    if (first) {
      first = false
      prev = value
      if (options?.immediate) untrack(() => cb(value, undefined))
      return
    }
    if (Object.is(value, prev)) return
    const before = prev
    prev = value
    untrack(() => cb(value, before))
  })
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
