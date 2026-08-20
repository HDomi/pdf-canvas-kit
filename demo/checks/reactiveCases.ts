/**
 * 반응성 프리미티브 검증 케이스 (PLAN D20 · 17.2).
 *
 * `src/dom/reactive.ts` 는 UI 층 전체가 올라앉는 바닥이다. 여기가 틀리면 증상이 "어떤 값이
 * 가끔 안 바뀐다" 로 나타나고, 그건 컴포넌트 어디를 봐도 원인이 안 보인다. 그래서 케이스를
 * 두껍게 깐다.
 *
 * 각 케이스는 자기 상태를 스스로 만든다 — 순서에 의존하지 않으므로 한 건이 실패해도
 * 나머지 결과를 신뢰할 수 있다.
 *
 * 이 파일은 공개 API 가 아니라 내부 모듈을 직접 import 한다. reactive 는 라이브러리 소비자가
 * 아니라 UI 층이 쓰는 것이라 `src/index.ts` 에 내보내지 않는다.
 */
import { batch, computed, effect, scope, signal, untrack, watch } from '../../src/dom/reactive'
import type { CaseGroup } from './cases'

export const REACTIVE_GROUPS: CaseGroup[] = [
  {
    title: 'reactive — signal · effect',
    note: 'effect 는 동기다. 대입이 끝난 다음 줄에서 DOM 과 레이아웃을 바로 읽을 수 있다는 뜻이고, 좌표 변환이 이 성질에 의존한다 (PLAN 5.4).',
    cases: [
      {
        name: 'signal 읽기·쓰기',
        expected: [1, 2],
        actual: () => {
          const a = signal(1)
          const first = a.value
          a.value = 2
          return [first, a.value]
        },
      },
      {
        name: 'effect 는 즉시 1회 실행된다',
        expected: [7],
        actual: () => {
          const a = signal(7)
          const log: number[] = []
          const stop = effect(() => log.push(a.value))
          stop()
          return log
        },
      },
      {
        name: 'effect 는 의존성 변경마다 재실행된다',
        expected: [1, 2, 3],
        actual: () => {
          const a = signal(1)
          const log: number[] = []
          const stop = effect(() => log.push(a.value))
          a.value = 2
          a.value = 3
          stop()
          return log
        },
      },
      {
        name: '같은 값 재대입은 알리지 않는다',
        expected: 1,
        actual: () => {
          const a = signal(1)
          let runs = 0
          const stop = effect(() => {
            runs++
            void a.value
          })
          a.value = 1
          stop()
          return runs
        },
      },
      {
        name: 'dispose 후에는 재실행되지 않는다',
        expected: 1,
        actual: () => {
          const a = signal(1)
          let runs = 0
          const stop = effect(() => {
            runs++
            void a.value
          })
          stop()
          a.value = 2
          return runs
        },
      },
      {
        name: 'dispose 는 멱등이다 (React StrictMode 이중 언마운트 — PLAN 20.5)',
        expected: true,
        actual: () => {
          const a = signal(1)
          const stop = effect(() => void a.value)
          stop()
          stop()
          return true
        },
      },
      {
        name: '자기 의존성에 쓰는 effect 는 던진다 (조용히 스택을 태우지 않는다)',
        expected: true,
        actual: () => {
          const a = signal(0)
          try {
            effect(() => {
              a.value = a.value + 1
            })
            return false
          } catch (e) {
            return e instanceof Error && e.message.includes('effect loop')
          }
        },
      },
    ],
  },

  {
    title: 'reactive — computed',
    note: '지연 계산 + 캐시. 문항 번호·검증 결과처럼 문서 전체를 훑는 파생값이 문서 변경마다 즉시 재계산되지 않게 한다.',
    cases: [
      {
        name: '읽기 전에는 계산하지 않는다',
        expected: 0,
        actual: () => {
          let evals = 0
          const a = signal(1)
          computed(() => {
            evals++
            return a.value
          })
          return evals
        },
      },
      {
        name: '읽으면 계산하고 값을 캐시한다',
        expected: [20, 1],
        actual: () => {
          let evals = 0
          const a = signal(10)
          const d = computed(() => {
            evals++
            return a.value * 2
          })
          const v = d.value
          void d.value
          return [v, evals]
        },
      },
      {
        name: '의존성이 바뀌면 무효화만 하고 계산은 미룬다',
        expected: 1,
        actual: () => {
          let evals = 0
          const a = signal(10)
          const d = computed(() => {
            evals++
            return a.value * 2
          })
          void d.value
          a.value = 11
          return evals
        },
      },
      {
        name: '무효화 후 다시 읽으면 새 값',
        expected: 22,
        actual: () => {
          const a = signal(10)
          const d = computed(() => a.value * 2)
          void d.value
          a.value = 11
          return d.value
        },
      },
      {
        name: 'computed 체인이 전파된다',
        expected: 8,
        actual: () => {
          const a = signal(1)
          const d = computed(() => a.value * 2)
          const q = computed(() => d.value * 2)
          void q.value
          a.value = 2
          return q.value
        },
      },
      {
        name: 'signal → computed → effect 까지 전파된다',
        expected: [4, 8],
        actual: () => {
          const a = signal(1)
          const d = computed(() => a.value * 2)
          const q = computed(() => d.value * 2)
          const seen: number[] = []
          const stop = effect(() => seen.push(q.value))
          a.value = 2
          stop()
          return seen
        },
      },
      {
        name: 'writable computed — setter 가 원본을 바꾼다',
        expected: [15, 30],
        actual: () => {
          const raw = signal(5)
          const rw = computed(
            () => raw.value * 2,
            (v: number) => (raw.value = v / 2),
          )
          rw.value = 30
          return [raw.value, rw.value]
        },
      },
      {
        name: '읽기 전용 computed 에 쓰면 던진다',
        expected: true,
        actual: () => {
          const a = signal(1)
          const d = computed(() => a.value)
          try {
            // @ts-expect-error 읽기 전용 computed 에 대입 — 런타임에서 막히는지 확인한다
            d.value = 2
            return false
          } catch {
            return true
          }
        },
      },
    ],
  },

  {
    title: 'reactive — watch',
    note: 'effect 와 다르게 콜백 안에서 읽은 signal 은 의존성이 되지 않는다. 콜백이 다른 상태를 읽고 쓰는 경우가 많고, 그것까지 구독하면 의도하지 않은 재실행이 생긴다.',
    cases: [
      {
        name: '기본은 즉시 실행하지 않는다',
        expected: 0,
        actual: () => {
          const a = signal('a')
          let calls = 0
          const stop = watch(
            () => a.value,
            () => calls++,
          )
          stop()
          return calls
        },
      },
      {
        name: '변경 시 (새 값, 이전 값) 을 준다',
        expected: ['b', 'a'],
        actual: () => {
          const a = signal('a')
          const got: Array<string | undefined> = []
          const stop = watch(
            () => a.value,
            (v, p) => got.push(v, p),
          )
          a.value = 'b'
          stop()
          return got
        },
      },
      {
        name: 'immediate 는 이전 값이 undefined 다',
        expected: ['x', undefined],
        actual: () => {
          const a = signal('x')
          const got: Array<string | undefined> = []
          const stop = watch(
            () => a.value,
            (v, p) => got.push(v, p),
            { immediate: true },
          )
          stop()
          return got
        },
      },
      {
        name: '여러 값을 배열로 본다',
        expected: [
          [1, 'b'],
          [2, 'b'],
        ],
        actual: () => {
          const a = signal(1)
          const b = signal('a')
          const got: unknown[] = []
          const stop = watch(
            () => [a.value, b.value],
            (v) => got.push(v),
          )
          b.value = 'b'
          a.value = 2
          stop()
          return got
        },
      },
      {
        name: 'defer 는 동기 구간에서 콜백을 부르지 않는다',
        expected: 0,
        actual: () => {
          const a = signal(1)
          let calls = 0
          const stop = watch(
            () => a.value,
            () => calls++,
            { defer: true },
          )
          a.value = 2
          stop()
          return calls
        },
      },
      {
        name: 'defer 콜백은 마이크로태스크에서 실제로 돈다',
        expected: [2, 1],
        actual: async () => {
          const a = signal(1)
          const got: Array<number | undefined> = []
          const stop = watch(
            () => a.value,
            (v, p) => got.push(v, p),
            { defer: true },
          )
          a.value = 2
          await Promise.resolve()
          stop()
          return got
        },
      },
      {
        name: 'defer 는 한 턴의 여러 변경을 1회로 합친다 (마지막 값 · 최초 이전 값)',
        expected: [
          [2, 1],
          [5, 2],
        ],
        actual: async () => {
          const a = signal(1)
          const got: Array<[number, number | undefined]> = []
          const stop = watch(
            () => a.value,
            (v, p) => got.push([v, p]),
            { defer: true },
          )
          a.value = 2
          await Promise.resolve()
          a.value = 3
          a.value = 4
          a.value = 5
          await Promise.resolve()
          stop()
          return got
        },
      },
      {
        name: 'dispose 는 미뤄 둔 defer 콜백을 취소한다',
        expected: 0,
        actual: async () => {
          const a = signal(1)
          let calls = 0
          const stop = watch(
            () => a.value,
            () => calls++,
            { defer: true },
          )
          a.value = 2
          stop()
          await Promise.resolve()
          return calls
        },
      },
      {
        name: 'immediate + defer 도 마이크로태스크에서 돈다',
        expected: [0, 1],
        actual: async () => {
          const c = signal('x')
          let calls = 0
          const stop = watch(
            () => c.value,
            () => calls++,
            { immediate: true, defer: true },
          )
          const sync = calls
          await Promise.resolve()
          stop()
          return [sync, calls]
        },
      },
      {
        name: 'scope dispose 가 미뤄 둔 defer 콜백도 취소한다',
        expected: 0,
        actual: async () => {
          const d = signal(1)
          let calls = 0
          const [, dispose] = scope(() => {
            watch(
              () => d.value,
              () => calls++,
              { defer: true },
            )
          })
          d.value = 2
          dispose()
          await Promise.resolve()
          return calls
        },
      },
      {
        name: '콜백이 읽은 signal 은 구독하지 않는다',
        expected: 1,
        actual: () => {
          const src = signal(0)
          const other = signal(100)
          let calls = 0
          const stop = watch(
            () => src.value,
            () => {
              calls++
              void other.value
            },
          )
          src.value = 1
          other.value = 200
          stop()
          return calls
        },
      },
    ],
  },

  {
    title: 'reactive — batch · untrack · 조건부 의존성',
    note: '한 사용자 제스처가 문서·선택·배율을 함께 바꿀 때 중간 상태로 렌더되지 않게 한다.',
    cases: [
      {
        name: 'batch 는 여러 대입을 1회 갱신으로 합친다',
        expected: ['0:0', '1:1'],
        actual: () => {
          const p = signal(0)
          const q = signal(0)
          const runs: string[] = []
          const stop = effect(() => runs.push(`${p.value}:${q.value}`))
          batch(() => {
            p.value = 1
            q.value = 1
          })
          stop()
          return runs
        },
      },
      {
        name: 'batch 밖에서는 각각 갱신된다',
        expected: 3,
        actual: () => {
          const p = signal(0)
          const q = signal(0)
          let runs = 0
          const stop = effect(() => {
            runs++
            void p.value
            void q.value
          })
          p.value = 1
          q.value = 1
          stop()
          return runs
        },
      },
      {
        name: '중첩 batch 는 가장 바깥에서 한 번만 흘린다',
        expected: [0, 3],
        actual: () => {
          const n = signal(0)
          const runs: number[] = []
          const stop = effect(() => runs.push(n.value))
          batch(() => {
            n.value = 1
            batch(() => {
              n.value = 2
            })
            n.value = 3
          })
          stop()
          return runs
        },
      },
      {
        name: 'untrack 으로 읽은 값은 구독하지 않는다',
        expected: 1,
        actual: () => {
          const tracked = signal(1)
          const hidden = signal(1)
          let runs = 0
          const stop = effect(() => {
            runs++
            void tracked.value
            untrack(() => void hidden.value)
          })
          hidden.value = 2
          stop()
          return runs
        },
      },
      {
        name: '타지 않는 분기의 signal 은 구독하지 않는다',
        expected: 1,
        actual: () => {
          const flag = signal(true)
          const left = signal('L')
          const right = signal('R')
          let runs = 0
          const stop = effect(() => {
            runs++
            void (flag.value ? left.value : right.value)
          })
          right.value = 'R2'
          stop()
          return runs
        },
      },
      {
        name: '분기가 바뀌면 옛 분기 구독이 끊긴다',
        expected: [3, 4, 4],
        actual: () => {
          const flag = signal(true)
          const left = signal('L')
          const right = signal('R')
          let runs = 0
          const stop = effect(() => {
            runs++
            void (flag.value ? left.value : right.value)
          })
          left.value = 'L2' // 구독 중 → 2
          flag.value = false // 분기 전환 → 3
          const afterSwitch = runs
          right.value = 'R2' // 새 분기 구독 → 4
          const afterNew = runs
          left.value = 'L3' // 옛 분기 해제 → 그대로
          const afterOld = runs
          stop()
          return [afterSwitch, afterNew, afterOld]
        },
      },
      {
        name: '⚠️ 깊은 반응성은 없다 — 내부 변형은 알리지 않는다 (의도된 계약)',
        expected: 1,
        actual: () => {
          const obj = signal({ n: 1 })
          let runs = 0
          const stop = effect(() => {
            runs++
            void obj.value.n
          })
          obj.value.n = 2
          stop()
          return runs
        },
      },
      {
        name: '새 객체를 대입하면 알린다 (위 케이스의 올바른 사용법)',
        expected: 2,
        actual: () => {
          const obj = signal({ n: 1 })
          let runs = 0
          const stop = effect(() => {
            runs++
            void obj.value.n
          })
          obj.value = { n: 2 }
          stop()
          return runs
        },
      },
      {
        name: 'Map 도 같다 — 새 Map 을 대입해야 알린다',
        expected: 2,
        actual: () => {
          const m = signal(new Map<string, number>())
          let runs = 0
          const stop = effect(() => {
            runs++
            void m.value.size
          })
          m.value.set('a', 1) // 알리지 않는다
          m.value = new Map([['b', 2]]) // 알린다
          stop()
          return runs
        },
      },
    ],
  },
]
