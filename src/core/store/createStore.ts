/**
 * 최소한의 옵저버블 스토어.
 *
 * Pinia나 zustand를 쓰지 않은 것은 의도다. 편집기에 필요한 건 구독과 교체뿐이고,
 * 자기 스토어를 설치하는 라이브러리는 호스트 앱의 스토어와 충돌할 위험이 있다.
 * 아래가 구현 전부다.
 */

export type Unsubscribe = () => void

export interface Store<T> {
  /** 현재 값. 불변으로 취급한다 — 절대 제자리에서 변경하지 않는다. */
  get(): T
  /** 값을 교체하고, 참조가 바뀐 경우에만 구독자에게 알린다. */
  set(next: T | ((prev: T) => T)): void
  /** 변경을 구독한다. 구독 해제 함수를 돌려준다. */
  subscribe(fn: (value: T, prev: T) => void): Unsubscribe
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const subs = new Set<(value: T, prev: T) => void>()

  return {
    get: () => value,

    set(next) {
      const prev = value
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      // 참조 비교로 충분하다. 커맨드는 바뀐 가지에 대해 항상 새 객체를 만들므로,
      // 아무것도 바꾸지 않은 커맨드는 알림 비용조차 들지 않는다.
      if (resolved === prev) return
      value = resolved
      // 집합을 스냅샷한다. 구독자가 순회 중에 구독을 해제할 수 있다.
      for (const fn of [...subs]) fn(value, prev)
    },

    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
  }
}
