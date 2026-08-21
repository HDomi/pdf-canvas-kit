/**
 * 아이콘 레지스트리 (R12 후속).
 *
 * 아이콘을 넣는 길이 셋이고, 위에서부터 먼저 이긴다.
 *
 * | 방법 | 무엇을 주는가 | 누가 쓰나 |
 * | --- | --- | --- |
 * | `strings` 의 `icon.*` | 글리프 문자열 | 다른 유니코드·이모지로 바꿀 때 |
 * | **`icons`** | `() => Node` | vanilla 소비자, SVG 를 직접 만들 때 |
 * | **`renderIcon`** (래퍼) | 프레임워크 컴포넌트 | React·Vue 아이콘 라이브러리 |
 *
 * ## 왜 기본이 유니코드 글리프인가
 *
 * SVG 스프라이트를 내장하면 소비자가 그것을 교체할 수단이 **따로** 필요해지고, 결국 아이콘
 * 프레임워크를 요구하게 된다. 글리프는 문구와 같은 경로(`strings`)로 덮어쓸 수 있어 계약이
 * 하나 줄어든다. 더 필요한 소비자에게 아래 두 경로를 준다.
 *
 * ## 왜 모듈 스코프인가
 *
 * `strings` 와 같은 판단이다 (`strings.ts`). 아이콘은 앱 전체에서 같고, 인스턴스마다 다른
 * 아이콘 세트를 쓰는 요구는 실제로 없다. 렌더 층 14개 파일에 prop 을 흘리는 비용을 내지 않는다.
 * 한 페이지에 아이콘이 다른 편집기 둘은 **지원하지 않는다** — 그 요구가 오면 그때 인스턴스
 * 스코프로 바꾼다.
 */

/**
 * 아이콘 이름. `strings` 의 `icon.<name>` 키와 1:1 이다.
 *
 * 새 아이콘을 추가하면 `DEFAULT_STRINGS` 에 `icon.<name>` 도 함께 넣는다 — 글리프가 없으면
 * 아무것도 그려지지 않는다.
 */
export type IconName =
  'back' | 'undo' | 'redo' | 'zoomOut' | 'zoomIn' | 'close' | 'remove' | 'unknown' | 'caret'

/** 이름 → 노드를 만드는 함수. 부를 때마다 **새 노드**를 반환해야 한다. */
export type IconFactory = () => Node

let registry: Partial<Record<IconName, IconFactory>> = {}

/**
 * vanilla 아이콘을 등록한다.
 *
 * ```ts
 * configureIcons({
 *   undo: () => {
 *     const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
 *     // …
 *     return svg
 *   },
 * })
 * ```
 *
 * ⚠️ **매번 새 노드를 만들어야 한다.** 같은 노드를 돌려주면 DOM 은 한 곳에만 붙일 수 있으므로
 * 두 번째 사용처에서 첫 번째의 아이콘이 사라진다.
 */
export function configureIcons(overrides: Partial<Record<IconName, IconFactory>>): void {
  registry = { ...registry, ...overrides }
}

/** 기본값으로 되돌린다. 테스트·검증 화면에서 상태가 새는 것을 막는다. */
export function resetIcons(): void {
  registry = {}
}

/** 등록된 팩토리. 없으면 `undefined` — 렌더 층이 글리프로 떨어진다. */
export function iconFactory(name: IconName): IconFactory | undefined {
  return registry[name]
}
