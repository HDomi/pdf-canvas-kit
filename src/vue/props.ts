/**
 * Vue prop → facade prop 변환 (2026.08.21).
 *
 * ## 왜 별도 파일인가
 *
 * `setup()` 안에 두면 브라우저(와 Vue 런타임) 없이 확인할 수 없다. 여기 순수 함수로 두면
 * `npm run checks` 가 "새 prop 이 실제로 흘러가는가" 를 고정한다 — 이 파일이 존재하는 이유가
 * 그 회귀다.
 *
 * ## 나열하지 않는다 ★
 *
 * 예전에는 흘릴 prop 을 `watchEffect` 안에 하나씩 적었다. 그러면 prop 을 추가할 때마다 **거기를
 * 함께 고쳐야 한다는 것을 기억해야** 하고, 실제로 D33 의 `shortcuts` · `warnOnUnload` ·
 * `onError` 셋이 빠졌다. React 래퍼는 prop 을 통째로 넘기므로 정상이었고 Vue 만 먹지 않았다 —
 * **같은 계약이 프레임워크마다 다르게 동작하면 그게 버그의 형태다.**
 *
 * 그래서 반대로 뒤집었다. 기본이 "전부 흘린다" 이고, 흘리지 **않을** 것만 적는다. 새 prop 은
 * 선언만 하면 따라온다.
 */
import type { EditorProps } from '../dom/createEditor'
import type { ViewerProps } from '../dom/createViewer'

/**
 * 갱신으로 흘리지 않는 prop.
 *
 * 두 부류다.
 *
 * | 부류 | 왜 |
 * | --- | --- |
 * | `initialDoc` · `initialScale` · `objectTypes` | facade 가 **최초 1회만** 읽는다. 넘겨도 무시되지만 의도를 드러내려 제외한다 |
 * | `strings` · `icons` | 전역 표에 병합되고 컨트롤러 생성 시 1회 적용된다 (§19.4) |
 * | `renderObject` · `renderInspector` · `renderIcon` | Vue 전용이다. facade 는 이 이름을 모른다 |
 */
const EDITOR_MOUNT_ONLY = new Set([
  'initialDoc',
  'initialScale',
  'objectTypes',
  'strings',
  'icons',
  'renderObject',
  'renderInspector',
  'renderIcon',
])

/** 뷰어는 `doc` 이 controlled 라 제외 목록이 다르다 — `doc` 은 **흘려야** 한다. */
const VIEWER_MOUNT_ONLY = new Set(['objectTypes', 'strings', 'icons', 'renderObject', 'renderIcon'])

/**
 * `undefined` 는 뺀다.
 *
 * Vue 는 선언된 prop 을 주지 않아도 키를 만들고 값에 `undefined` 를 넣는다. 그대로 넘기면
 * `setProps` 의 `'key' in next` 판정이 통과해 **facade 의 기본값을 `undefined` 로 덮는다.**
 */
function pick<T>(props: Record<string, unknown>, skip: ReadonlySet<string>): Partial<T> {
  const out: Record<string, unknown> = {}
  /*
   * `Object.entries` 가 모든 키를 읽는다. Vue 의 props 는 reactive proxy 이므로 이 읽기가
   * 곧 의존성 등록이다 — 나열식과 달리 새 prop 을 빠뜨릴 수 없는 이유다.
   */
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || skip.has(k)) continue
    out[k] = v
  }
  return out as Partial<T>
}

/**
 * Vue 전용 prop. facade 는 이 이름을 모르므로 마운트에도 넘기지 않는다.
 *
 * 슬롯은 Teleport 로 채우고 아이콘 컴포넌트는 마운트 통지로 처리한다 (§17.2).
 */
const VUE_ONLY = new Set(['renderObject', 'renderInspector', 'renderIcon'])

/** 마운트에 넘길 것 — Vue 전용 키만 뺀 **전부**. */
export function mountProps(props: Record<string, unknown>): Partial<EditorProps> {
  return pick<EditorProps>(props, VUE_ONLY)
}

/** 갱신으로 흘릴 것 — 위에 더해 "최초 1회만 읽는" 것도 뺀다. */
export function updatableProps(props: Record<string, unknown>): Partial<EditorProps> {
  return pick<EditorProps>(props, EDITOR_MOUNT_ONLY)
}

export function mountViewerProps(props: Record<string, unknown>): Partial<ViewerProps> {
  return pick<ViewerProps>(props, VUE_ONLY)
}

export function updatableViewerProps(props: Record<string, unknown>): Partial<ViewerProps> {
  return pick<ViewerProps>(props, VIEWER_MOUNT_ONLY)
}
