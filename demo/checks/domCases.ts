/**
 * DOM 렌더 층 검증 케이스 (미세 반응성으로 DOM 을 직접 바인딩한다. VDOM 이 없다).
 *
 * `src/dom/h.ts` 는 Vue 템플릿을 대체한다. 여기가 틀리면 증상이 "가끔 안 갱신됨" · "순서 바꾸면
 * 깜빡임" 처럼 나타나고, 원인을 컴포넌트에서 찾게 된다. 특히 **키 기반 리스트 재조정**은
 * 손으로 눈으로 확인하기 가장 어려운 코드라 케이스를 두껍게 깐다.
 *
 * 브라우저(`/checks/`)에서는 실제 DOM 으로, 헤드리스(`npm run checks`)에서는 happy-dom 으로
 * 같은 케이스가 돈다. 전역 `document` 를 쓰므로 러너가 먼저 그것을 세팅한다.
 */
import { el, keyed, list, svg, when } from '../../src/dom/h'
import { scope, signal } from '../../src/dom/reactive'
import type { CaseGroup } from './cases'

/** 자식 텍스트만 뽑는다. 앵커 주석 노드는 건너뛴다. */
function texts(node: Element): string[] {
  return Array.from(node.childNodes)
    .filter((n) => n.nodeType !== 8) // COMMENT_NODE
    .map((n) => (n.textContent ?? '').trim())
    .filter((s) => s.length > 0)
}

/** 자식 엘리먼트의 특정 속성을 순서대로 뽑는다. */
function attrs(node: Element, name: string): (string | null)[] {
  return Array.from(node.children).map((c) => c.getAttribute(name))
}

export const DOM_GROUPS: CaseGroup[] = [
  {
    title: 'h — el · 속성 · 클래스 · 스타일',
    note: 'attr 와 prop 을 나눠 둔 것은 의도다. Vue 는 이름으로 추측하는데, 그 추측이 어긋나면 "input 에 타이핑한 뒤 값이 갱신되지 않는다" 로 나타난다.',
    cases: [
      {
        name: '정적 클래스 · 자식 텍스트',
        expected: ['pck-page', ['안녕']],
        actual: () => {
          const [node] = scope(() => el('div', { class: 'pck-page' }, ['안녕']))
          return [node.getAttribute('class'), texts(node)]
        },
      },
      {
        name: '반응형 클래스는 값이 바뀌면 갱신된다',
        expected: ['is-off', 'is-on'],
        actual: () => {
          const on = signal(false)
          const [node] = scope(() => el('div', { class: () => (on.value ? 'is-on' : 'is-off') }))
          const before = node.getAttribute('class')
          on.value = true
          return [before, node.getAttribute('class')]
        },
      },
      {
        name: '클래스 맵은 조건이 바뀐 클래스만 토글한다',
        expected: ['pck-obj is-selected', 'pck-obj is-invalid'],
        actual: () => {
          const selected = signal(true)
          const invalid = signal(false)
          const [node] = scope(() =>
            el('div', {
              class: {
                'pck-obj': true,
                'is-selected': () => selected.value,
                'is-invalid': () => invalid.value,
              },
            }),
          )
          const before = node.getAttribute('class')
          selected.value = false
          invalid.value = true
          return [before, node.getAttribute('class')]
        },
      },
      {
        name: '반응형 텍스트 자식',
        expected: [['1'], ['2']],
        actual: () => {
          const n = signal(1)
          const [node] = scope(() => el('div', {}, [() => n.value]))
          const before = texts(node)
          n.value = 2
          return [before, texts(node)]
        },
      },
      {
        name: 'attr 은 null·undefined 면 속성을 제거한다',
        expected: ['x', null],
        actual: () => {
          const v = signal<string | null>('x')
          const [node] = scope(() => el('div', { attr: { 'data-k': () => v.value } }))
          const a = node.getAttribute('data-k')
          v.value = null
          return [a, node.getAttribute('data-k')]
        },
      },
      {
        name: 'HTML boolean 속성 — true 는 빈 문자열, false 는 제거',
        expected: ['', null],
        actual: () => {
          const v = signal(true)
          const [node] = scope(() => el('input', { attr: { disabled: () => v.value } }))
          const a = node.getAttribute('disabled')
          v.value = false
          return [a, node.getAttribute('disabled')]
        },
      },
      {
        /*
         * ARIA 는 HTML boolean 속성과 규칙이 다르다. `aria-pressed=""` 는 유효하지 않고,
         * 속성을 제거하면 "눌리지 않음" 이 아니라 "토글이 아님" 이라는 다른 뜻이 된다.
         * 2026.08.20 에 실제로 이 버그를 만들었다 — 툴바 버튼이 `aria-pressed=""` 를 냈다.
         */
        name: '★ aria-* boolean 은 "true"/"false" 리터럴이다',
        expected: ['true', 'false'],
        actual: () => {
          const v = signal(true)
          const [node] = scope(() => el('button', { attr: { 'aria-pressed': () => v.value } }))
          const a = node.getAttribute('aria-pressed')
          v.value = false
          return [a, node.getAttribute('aria-pressed')]
        },
      },
      {
        name: 'aria-* 도 null 이면 제거된다',
        expected: null,
        actual: () => {
          const [node] = scope(() => el('button', { attr: { 'aria-pressed': null } }))
          return node.getAttribute('aria-pressed')
        },
      },
      {
        name: 'prop 은 DOM 프로퍼티를 쓴다 (input.value)',
        expected: ['가', '나'],
        actual: () => {
          const v = signal('가')
          const [node] = scope(() => el('input', { prop: { value: () => v.value } }))
          const before = node.value
          v.value = '나'
          return [before, node.value]
        },
      },
      {
        name: '⚠️ prop 은 같은 값을 재대입하지 않는다 (캐럿이 끝으로 튀는 것 방지)',
        expected: 1,
        actual: () => {
          const v = signal('가')
          let writes = 0
          const [node] = scope(() => el('input', { prop: { value: () => v.value } }))
          // value 대입을 세는 스파이로 교체한다
          let stored = node.value
          Object.defineProperty(node, 'value', {
            get: () => stored,
            set: (next: string) => {
              writes++
              stored = next
            },
            configurable: true,
          })
          v.value = '나' // 1회 대입
          v.value = '나' // signal 이 같은 값이라 알리지 않음
          return writes
        },
      },
      {
        name: '스타일 맵 — 숫자는 px, CSS 변수도 설정된다',
        expected: ['120px', '240px'],
        actual: () => {
          const w = signal(240)
          const [node] = scope(() =>
            el('div', { style: { left: 120, '--pck-pagelist-width': () => `${w.value}px` } }),
          )
          return [
            node.style.getPropertyValue('left'),
            node.style.getPropertyValue('--pck-pagelist-width'),
          ]
        },
      },
      {
        name: '스타일 값이 null 이면 프로퍼티를 제거한다',
        expected: ['10px', ''],
        actual: () => {
          const v = signal<number | null>(10)
          const [node] = scope(() => el('div', { style: { top: () => v.value } }))
          const before = node.style.getPropertyValue('top')
          v.value = null
          return [before, node.style.getPropertyValue('top')]
        },
      },
      {
        name: 'ref 로 엘리먼트를 받는다',
        expected: 'DIV',
        actual: () => {
          let got: HTMLElement | null = null
          scope(() => el('div', { ref: (e) => (got = e) }))
          return (got as unknown as HTMLElement | null)?.tagName ?? null
        },
      },
      {
        name: 'svg 는 SVG 네임스페이스로 만들어진다',
        expected: 'http://www.w3.org/2000/svg',
        actual: () => {
          const [node] = scope(() => svg('rect'))
          return node.namespaceURI
        },
      },
    ],
  },

  {
    title: 'h — 이벤트 · scope 정리',
    note: 'scope 가 닫히면 그 안에서 붙인 리스너와 effect 가 전부 끊긴다. 정리가 기본값이어야 누수가 사고가 되지 않는다.',
    cases: [
      {
        name: '이벤트 핸들러가 붙는다',
        expected: 1,
        actual: () => {
          let clicks = 0
          const [node] = scope(() => el('button', { on: { click: () => clicks++ } }))
          node.dispatchEvent(new Event('click'))
          return clicks
        },
      },
      {
        name: 'scope 를 닫으면 리스너가 떼어진다',
        expected: 1,
        actual: () => {
          let clicks = 0
          const [node, dispose] = scope(() => el('button', { on: { click: () => clicks++ } }))
          node.dispatchEvent(new Event('click'))
          dispose()
          node.dispatchEvent(new Event('click'))
          return clicks
        },
      },
      {
        name: 'scope 를 닫으면 바인딩 effect 도 멈춘다',
        expected: ['1', '1'],
        actual: () => {
          const n = signal(1)
          const [node, dispose] = scope(() => el('div', {}, [() => n.value]))
          const before = node.textContent
          dispose()
          n.value = 2
          return [before, node.textContent]
        },
      },
      {
        name: 'dispose 는 멱등이다',
        expected: true,
        actual: () => {
          const n = signal(1)
          const [, dispose] = scope(() => el('div', {}, [() => n.value]))
          dispose()
          dispose()
          return true
        },
      },
    ],
  },

  {
    title: 'h — when (조건부)',
    note: 'truthy → truthy 로 값만 바뀔 때는 다시 그리지 않는다. 그래야 안에서 편집 중인 텍스트 노드가 살아남는다 (한글 IME — ARCHITECTURE §6.5).',
    cases: [
      {
        name: '거짓이면 아무것도 렌더하지 않는다',
        expected: [],
        actual: () => {
          const on = signal(false)
          const [node] = scope(() =>
            el('div', {}, [
              when(
                () => on.value,
                () => el('span', {}, ['보임']),
              ),
            ]),
          )
          return texts(node)
        },
      },
      {
        name: '참이 되면 나타나고 거짓이 되면 사라진다',
        expected: [[], ['보임'], []],
        actual: () => {
          const on = signal(false)
          const [node] = scope(() =>
            el('div', {}, [
              when(
                () => on.value,
                () => el('span', {}, ['보임']),
              ),
            ]),
          )
          const a = texts(node)
          on.value = true
          const b = texts(node)
          on.value = false
          return [a, b, texts(node)]
        },
      },
      {
        name: '⚠️ truthy → truthy 는 노드를 재생성하지 않는다',
        expected: 1,
        actual: () => {
          const count = signal(1)
          let renders = 0
          const [node] = scope(() =>
            el('div', {}, [
              when(
                () => count.value > 0,
                () => {
                  renders++
                  return el('span', {}, [() => count.value])
                },
              ),
            ]),
          )
          count.value = 5 // 여전히 truthy → 재생성 없음
          count.value = 9
          void node
          return renders
        },
      },
      {
        name: 'truthy → truthy 에서 내용은 갱신된다',
        expected: ['1', '9'],
        actual: () => {
          const count = signal(1)
          const [node] = scope(() =>
            el('div', {}, [
              when(
                () => count.value > 0,
                () => el('span', {}, [() => count.value]),
              ),
            ]),
          )
          const before = node.textContent
          count.value = 9
          return [before, node.textContent]
        },
      },
      {
        name: '사라질 때 안쪽 effect 가 정리된다',
        expected: 1,
        actual: () => {
          const on = signal(true)
          const inner = signal(1)
          let runs = 0
          const [node] = scope(() =>
            el('div', {}, [
              when(
                () => on.value,
                () =>
                  el('span', {}, [
                    () => {
                      runs++
                      return inner.value
                    },
                  ]),
              ),
            ]),
          )
          on.value = false
          inner.value = 2 // 정리됐으면 runs 가 늘지 않는다
          void node
          return runs
        },
      },
      {
        name: '형제 노드 사이에서 위치를 지킨다',
        expected: ['앞', '가운데', '뒤'],
        actual: () => {
          const on = signal(false)
          const [node] = scope(() =>
            el('div', {}, [
              el('i', {}, ['앞']),
              when(
                () => on.value,
                () => el('b', {}, ['가운데']),
              ),
              el('i', {}, ['뒤']),
            ]),
          )
          on.value = true
          return Array.from(node.children).map((c) => c.textContent)
        },
      },
    ],
  },

  {
    title: 'h — list (키 기반 재조정) ★',
    note: '키가 같으면 노드를 재사용한다. 페이지 순서를 바꿀 때 썸네일 이미지가 다시 로드되며 깜빡이지 않게 하려는 것이다.',
    cases: [
      {
        name: '초기 렌더 순서',
        expected: ['a', 'b', 'c'],
        actual: () => {
          const items = signal([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
          const [node] = scope(() =>
            el('div', {}, [
              list(
                () => items.value,
                (i) => i.id,
                (item) => el('span', { attr: { 'data-id': () => item.value.id } }),
              ),
            ]),
          )
          return attrs(node, 'data-id')
        },
      },
      {
        name: '추가 · 삭제가 반영된다',
        expected: [
          ['a', 'b'],
          ['a', 'b', 'c'],
          ['b', 'c'],
        ],
        actual: () => {
          const items = signal([{ id: 'a' }, { id: 'b' }])
          const [node] = scope(() =>
            el('div', {}, [
              list(
                () => items.value,
                (i) => i.id,
                (item) => el('span', { attr: { 'data-id': () => item.value.id } }),
              ),
            ]),
          )
          const a = attrs(node, 'data-id')
          items.value = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
          const b = attrs(node, 'data-id')
          items.value = [{ id: 'b' }, { id: 'c' }]
          return [a, b, attrs(node, 'data-id')]
        },
      },
      {
        name: '★ 순서를 바꿔도 노드를 재사용한다 (render 재호출 없음)',
        expected: [3, ['c', 'a', 'b']],
        actual: () => {
          const items = signal([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
          let renders = 0
          const [node] = scope(() =>
            el('div', {}, [
              list(
                () => items.value,
                (i) => i.id,
                (item) => {
                  renders++
                  return el('span', { attr: { 'data-id': () => item.value.id } })
                },
              ),
            ]),
          )
          items.value = [{ id: 'c' }, { id: 'a' }, { id: 'b' }]
          return [renders, attrs(node, 'data-id')]
        },
      },
      {
        name: '★ 순서를 바꿀 때 같은 DOM 노드 객체가 유지된다',
        expected: true,
        actual: () => {
          const items = signal([{ id: 'a' }, { id: 'b' }])
          const [node] = scope(() =>
            el('div', {}, [
              list(
                () => items.value,
                (i) => i.id,
                (item) => el('span', { attr: { 'data-id': () => item.value.id } }),
              ),
            ]),
          )
          const nodeA = node.querySelector('[data-id="a"]')
          items.value = [{ id: 'b' }, { id: 'a' }]
          return nodeA === node.querySelector('[data-id="a"]')
        },
      },
      {
        name: '키가 같고 내용이 바뀌면 item signal 만 갱신한다',
        expected: [1, ['새 제목']],
        actual: () => {
          const items = signal([{ id: 'a', title: '옛 제목' }])
          let renders = 0
          const [node] = scope(() =>
            el('div', {}, [
              list(
                () => items.value,
                (i) => i.id,
                (item) => {
                  renders++
                  return el('span', {}, [() => item.value.title])
                },
              ),
            ]),
          )
          items.value = [{ id: 'a', title: '새 제목' }]
          return [renders, texts(node)]
        },
      },
      {
        name: 'index signal 이 순서 변경을 따라간다',
        expected: ['b:0', 'a:1'],
        actual: () => {
          const items = signal([{ id: 'a' }, { id: 'b' }])
          const [node] = scope(() =>
            el('div', {}, [
              list(
                () => items.value,
                (i) => i.id,
                (item, index) =>
                  el('span', { attr: { 'data-k': () => `${item.value.id}:${index.value}` } }),
              ),
            ]),
          )
          items.value = [{ id: 'b' }, { id: 'a' }]
          return attrs(node, 'data-k')
        },
      },
      {
        name: '삭제된 항목의 effect 가 정리된다 (남은 항목은 건드리지 않는다)',
        expected: 2,
        actual: () => {
          /*
           * `a` 를 **같은 객체 참조로** 유지하는 것이 요점이다. 배열 리터럴을 새로 쓰면 `a` 도
           * 새 객체가 되어 item signal 이 정당하게 갱신되고 effect 가 한 번 더 돈다 —
           * 그건 아래 케이스에서 따로 고정한다.
           */
          const a = { id: 'a', n: 1 }
          const b = { id: 'b', n: 1 }
          const items = signal([a, b])
          let runs = 0
          const [node] = scope(() =>
            el('div', {}, [
              list(
                () => items.value,
                (i) => i.id,
                (item) =>
                  el('span', {}, [
                    () => {
                      runs++
                      return item.value.n
                    },
                  ]),
              ),
            ]),
          )
          // 초기 2회. b 를 지우면 b 의 effect 는 더 이상 돌지 않고, a 는 그대로여서 재실행도 없다.
          items.value = [a]
          void node
          return runs
        },
      },
      {
        name: '같은 키라도 객체 참조가 바뀌면 item signal 이 갱신된다',
        expected: [1, 2],
        actual: () => {
          const items = signal([{ id: 'a', n: 1 }])
          let renders = 0
          let runs = 0
          const [node] = scope(() =>
            el('div', {}, [
              list(
                () => items.value,
                (i) => i.id,
                (item) => {
                  renders++
                  return el('span', {}, [
                    () => {
                      runs++
                      return item.value.n
                    },
                  ])
                },
              ),
            ]),
          )
          // 내용이 같아도 참조가 다르면 signal 을 갱신한다. 노드는 재사용되므로 renders 는 1.
          items.value = [{ id: 'a', n: 1 }]
          void node
          return [renders, runs]
        },
      },
      {
        name: '전부 비우면 앵커만 남는다',
        expected: [0, true],
        actual: () => {
          const items = signal([{ id: 'a' }, { id: 'b' }])
          const [node] = scope(() =>
            el('div', {}, [
              list(
                () => items.value,
                (i) => i.id,
                () => el('span'),
              ),
            ]),
          )
          items.value = []
          return [node.children.length, node.childNodes.length === 1]
        },
      },
      {
        name: '리스트가 형제 노드 사이에서 위치를 지킨다',
        expected: ['앞', 'a', 'b', '뒤'],
        actual: () => {
          const items = signal([{ id: 'a' }, { id: 'b' }])
          const [node] = scope(() =>
            el('div', {}, [
              el('i', {}, ['앞']),
              list(
                () => items.value,
                (i) => i.id,
                (item) => el('span', {}, [() => item.value.id]),
              ),
              el('i', {}, ['뒤']),
            ]),
          )
          return Array.from(node.children).map((c) => c.textContent)
        },
      },
      {
        name: 'scope 를 닫으면 모든 항목이 정리된다',
        expected: [2, 0],
        actual: () => {
          const items = signal([{ id: 'a' }, { id: 'b' }])
          const [node, dispose] = scope(() =>
            el('div', {}, [
              list(
                () => items.value,
                (i) => i.id,
                () => el('span'),
              ),
            ]),
          )
          const before = node.children.length
          dispose()
          return [before, node.children.length]
        },
      },
    ],
  },

  {
    title: 'h — keyed (값 기반 재렌더) ★',
    note: 'when 은 조건을 !!cond() 로 본다. 그래서 둘 다 truthy 인 값 변화를 감지하지 못한다 — 2026.08.20 에 인스펙터가 정확히 이 함정에 빠졌다.',
    cases: [
      {
        name: '키가 있으면 그린다',
        expected: 'a',
        actual: () => {
          const k = signal<string | null>('a')
          const [node] = scope(() =>
            el('div', {}, [
              keyed(
                () => k.value,
                (v) => el('i', {}, [v]),
              ),
            ]),
          )
          return node.textContent
        },
      },
      {
        name: '키가 null 이면 아무것도 그리지 않는다',
        expected: '',
        actual: () => {
          const k = signal<string | null>(null)
          const [node] = scope(() =>
            el('div', {}, [
              keyed(
                () => k.value,
                (v) => el('i', {}, [v]),
              ),
            ]),
          )
          return node.textContent
        },
      },
      {
        /*
         * ★ `when` 이 못 하는 것. 둘 다 truthy 인 값 변화에서 다시 그려야 한다.
         */
        name: '★ 키가 바뀌면 다시 그린다 (둘 다 truthy 여도)',
        expected: [2, 'b'],
        actual: () => {
          const k = signal<string | null>('a')
          let renders = 0
          const [node] = scope(() =>
            el('div', {}, [
              keyed(
                () => k.value,
                (v) => {
                  renders++
                  return el('i', {}, [v])
                },
              ),
            ]),
          )
          k.value = 'b'
          return [renders, node.textContent]
        },
      },
      {
        name: '같은 키를 다시 대입하면 다시 그리지 않는다',
        expected: 1,
        actual: () => {
          const k = signal<string | null>('a')
          let renders = 0
          const [node] = scope(() =>
            el('div', {}, [
              keyed(
                () => k.value,
                () => {
                  renders++
                  return el('i')
                },
              ),
            ]),
          )
          k.value = 'a'
          void node
          return renders
        },
      },
      {
        name: '키가 사라지면 정리하고, 안쪽 effect 도 멈춘다',
        expected: [1, ''],
        actual: () => {
          const k = signal<string | null>('a')
          const inner = signal(1)
          let runs = 0
          const [node] = scope(() =>
            el('div', {}, [
              keyed(
                () => k.value,
                () =>
                  el('i', {}, [
                    () => {
                      runs++
                      return inner.value
                    },
                  ]),
              ),
            ]),
          )
          k.value = null
          inner.value = 2 // 정리됐으면 runs 가 늘지 않는다
          return [runs, node.textContent]
        },
      },
      {
        name: '형제 노드 사이에서 위치를 지킨다',
        expected: ['앞', 'b', '뒤'],
        actual: () => {
          const k = signal<string | null>('a')
          const [node] = scope(() =>
            el('div', {}, [
              el('u', {}, ['앞']),
              keyed(
                () => k.value,
                (v) => el('b', {}, [v]),
              ),
              el('u', {}, ['뒤']),
            ]),
          )
          k.value = 'b'
          return Array.from(node.children).map((c) => c.textContent)
        },
      },
    ],
  },
]
