/**
 * vanilla 렌더 슬롯을 한 번 호출하고 갱신 통로를 배선한다 (커스텀 객체는 소비자가 정의한다).
 *
 * ## 왜 한 번만 부르는가
 *
 * 데이터가 바뀔 때마다 `render` 를 다시 부르고 `replaceChildren` 하면 **입력 중 노드가
 * 파괴되어 포커스가 날아간다.** 한글 IME 는 조합까지 끊겨 한 글자마다 입력이 멈춘다 —
 * 2026.08.20 에 실제로 그 버그를 냈다.
 *
 * 그래서 노드는 한 번만 만들고, 소비자가 `ctx.onUpdate(fn)` 로 등록한 콜백만 다시 돌린다.
 * 이건 프레임워크 경로(portal)의 동작과도 같다 — 컨테이너는 한 번 만들어지고 React·Vue 가
 * 안쪽만 갱신한다.
 */
import { effect } from '../../reactive'
import type { ObjectRenderContext } from '../../../core/objectTypes'

export interface MountSlotOptions<Data> {
  /** 갱신 시 읽을 값들. 이 함수 안에서 읽은 signal 이 의존성이 된다. */
  read: () => {
    data: Data
    rect: { x: number; y: number; w: number; h: number }
    selected: boolean
  }
  objectId: string
  onChange: (next: Data) => void
  render: (ctx: ObjectRenderContext<Data>) => Node
  /** 노드를 넣을 컨테이너. */
  container: HTMLElement
}

export function mountRenderSlot<Data>(opts: MountSlotOptions<Data>): void {
  const updaters: (() => void)[] = []

  const node = opts.render({
    objectId: opts.objectId,
    data: () => opts.read().data,
    rect: () => opts.read().rect,
    selected: () => opts.read().selected,
    onChange: opts.onChange,
    onUpdate: (fn) => updaters.push(fn),
  })
  opts.container.replaceChildren(node)

  if (updaters.length === 0) return

  /*
   * 등록된 콜백을 우리 effect 로 돌린다.
   *
   * `read()` 를 effect 안에서 호출해 의존성을 잡는다 — 소비자 콜백이 무엇을 읽는지 모르므로
   * 여기서 대신 구독한다. 첫 실행은 즉시 일어나지만 갱신은 멱등이어야 하므로 문제가 없다.
   */
  effect(() => {
    opts.read()
    for (const fn of updaters) fn()
  })
}
