# src/controller — 프레임워크 무관 컨트롤러

`src/vue/composables/**` 를 이식한 것이다 (PLAN 20.1, R3).

`src/core/` 와 다른 점: **여기는 DOM 을 안다.** 스크롤 컨테이너를 잡고, `getBoundingClientRect()`
를 읽고, `window` 리스너를 붙인다. 대신 **프레임워크는 모른다** — ESLint 가 `vue` · `react`
import 를 막는다(ARCHITECTURE §10).

| 계층 | DOM | 프레임워크 |
| --- | --- | --- |
| `src/core/` | 모름 | 모름 |
| `src/controller/` | **안다** | 모름 |
| `src/dom/` | 안다 (생성·바인딩) | 모름 |
| `src/react/` · `src/vue/` | 안다 | 안다 |

---

## Vue → 여기 대응표

이식은 기계적이다. 아래 표가 전부다.

| Vue | 여기 |
| --- | --- |
| `ref(x)` · `shallowRef(x)` | `signal(x)` |
| `computed(fn)` | `computed(fn)` |
| `computed({ get, set })` | `computed(get, set)` |
| `watch(src, cb, { immediate })` | `watch(() => src.value, cb, { immediate })` |
| `watch([a, b], cb)` | `watch(() => [a.value, b.value], cb)` |
| `watch(src, cb, { flush: 'post' })` | `watch(src, cb, { defer: true })` |
| `onScopeDispose(fn)` | `onCleanup(fn)` |
| `await nextTick()` | **삭제** (effect 가 동기다) |
| `Ref<T>` | `Signal<T>` |
| `ComputedRef<T>` | `ReadSignal<T>` |
| `useX(...)` | `createX(...)` |

---

## 이식할 때 반드시 확인하는 것 3개

### 1. 깊은 반응성이 없다

Vue 의 `ref(obj)` 는 내부를 프록시로 감싸므로 `view.value.activeTool = x` 가 반응성을 일으킨다.
여기서는 **아무 일도 일어나지 않는다.** 필드마다 signal 을 둔다.

`Map` · `Set` · 배열도 같다 — `.set()` 이 아니라 새 값을 대입한다.

```ts
previewRects.value = new Map(next)   // ✓
previewRects.value.set(id, rect)     // ✗ 조용히 실패
```

### 2. `nextTick()` 이 사라진다 — 그리고 그것이 옳다

`scale.value = next` 가 끝나는 순간 DOM 스타일이 이미 갱신돼 있고, 이어서 `scrollLeft` 를
읽거나 쓰면 브라우저가 reflow 를 강제한다. 그래서 순서 함정(배율 → 레이아웃 → 스크롤 보정)이
동기 코드로 그대로 성립한다.

⚠️ **이건 브라우저에서 확인해야 한다.** happy-dom 은 `getBoundingClientRect()` 가 전부 0 이라
헤드리스 검증으로 덮이지 않는다 (PLAN 20.5).

### 3. 레이아웃을 읽는 `watch` 는 `defer: true`

effect 실행 순서는 **등록 순서**다. "스타일을 쓰는 effect" 보다 "레이아웃을 읽는 콜백" 이 먼저
등록돼 있으면 낡은 값을 읽는다 — 줌 직후 선택 핸들이 어긋나는 증상이 된다.

`defer` 는 그 턴의 동기 effect 가 모두 끝난 뒤에 콜백을 돌린다. Vue 의 `flush: 'post'` 자리다.

---

## `src/vue/composables/**` 와 중복인 이유

리라이트가 끝날 때까지 **Vue 층을 살려 둔다** (PLAN D23). 자동 테스트가 없으므로(D17), 새
렌더러를 만드는 동안 동작하는 기준 구현이 같은 저장소에 있어야 회귀를 눈으로 대조할 수 있다.

**R9 에서 `src/vue/composables/**` 와 `src/vue/editor/**` 를 삭제한다.** 그때까지 두 곳을
함께 고쳐야 하는 변경은 피한다 — 기준 구현은 건드리지 않는 것이 원칙이다.
