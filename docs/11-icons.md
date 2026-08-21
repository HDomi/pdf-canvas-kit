# 아이콘

세 경로가 있고 **위에서부터 먼저 이긴다.** 하나만 주면 나머지는 기본값이 나온다.

| 우선순위 | 방법 | 무엇을 주는가 | 언제 |
| --- | --- | --- | --- |
| 1 | `icons` | `() => Node` | vanilla, SVG 를 직접 만들 때 |
| 2 | `renderIcon` (래퍼) | 프레임워크 컴포넌트 | React·Vue 아이콘 라이브러리 |
| 3 | `strings` 의 `icon.*` | 글리프 문자열 | 다른 유니코드·이모지 (기본값) |

네 번째로 CSS 경로도 있다 — 아래 참고.

---

## 아이콘 이름

```ts
type IconName =
  | 'back'      // 상단바 뒤로
  | 'undo'
  | 'redo'
  | 'zoomOut'
  | 'zoomIn'
  | 'close'     // 팝업 닫기
  | 'remove'    // 인스펙터 필드 지우기 (여러 개 나온다)
  | 'unknown'   // 등록되지 않은 커스텀 타입 표시
  | 'caret'     // 드롭다운 화살표
```

---

## 1. 프레임워크 컴포넌트 (`renderIcon`)

가장 흔한 경로. 아이콘 라이브러리를 그대로 쓴다.

### React

```tsx
import { Undo2, Redo2, ZoomIn, ZoomOut, ChevronLeft } from 'lucide-react'

<PDFCanvasEditor
  renderIcon={{
    back: ChevronLeft,
    undo: Undo2,
    redo: Redo2,
    zoomIn: ZoomIn,
    zoomOut: ZoomOut,
  }}
/>
```

### Vue

```vue
<script setup lang="ts">
import UndoIcon from './icons/UndoIcon.vue'
const RENDER_ICON = { undo: UndoIcon, redo: RedoIcon }
</script>

<template>
  <PDFCanvasEditor :render-icon="RENDER_ICON" />
</template>
```

컴포넌트는 prop 을 받지 않는다. 크기·색은 CSS 로 맞춘다 — `currentColor` 를 쓰면 버튼의
글자색을 따라간다.

```tsx
function UndoIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 7v6h6" />
      <path d="M3.5 13a9 9 0 1 0 2.6-6.4L3 9" />
    </svg>
  )
}
```

---

## 2. vanilla 노드 (`icons`)

`renderIcon` 보다 **먼저 이긴다.** 프레임워크 없이 쓰거나, SVG 를 이미 문자열로 들고 있을 때.

```ts
<PDFCanvasEditor
  icons={{
    close: () => {
      const NS = 'http://www.w3.org/2000/svg'
      const svg = document.createElementNS(NS, 'svg')
      svg.setAttribute('viewBox', '0 0 24 24')
      svg.setAttribute('stroke', 'currentColor')
      const path = document.createElementNS(NS, 'path')
      path.setAttribute('d', 'M6 6l12 12M18 6L6 18')
      svg.append(path)
      return svg
    },
  }}
/>
```

앱 전체에 한 번만 설정하려면:

```ts
import { configureIcons } from 'pdf-canvas-kit'
configureIcons({ undo: () => mySvgNode() })
```

### ⚠️ 매번 새 노드를 반환해야 한다

```ts
// ✗ 같은 노드를 돌려주면 두 번째 사용처에서 첫 번째 아이콘이 사라진다
const shared = mySvg()
icons={{ remove: () => shared }}

// ✓ 부를 때마다 새로 만든다
icons={{ remove: () => mySvg() }}
```

DOM 노드는 한 곳에만 붙을 수 있다. `icon.remove`(×)는 인스펙터 필드마다 하나씩 나오므로 이
실수가 바로 드러난다.

---

## 3. 글리프 (`strings` 의 `icon.*`)

기본값이 유니코드 글리프다. 문구와 **같은 경로**로 바꿀 수 있다.

```tsx
<PDFCanvasEditor
  strings={{
    'icon.caret': '⌄',
    'icon.close': '✕',
    'icon.undo': '⟲',
    'icon.redo': '⟳',
  }}
/>
```

### 왜 기본이 SVG 가 아닌가

SVG 스프라이트를 내장하면 소비자가 그것을 교체할 수단이 **따로** 필요해지고, 결국 아이콘
프레임워크를 요구하게 된다. 글리프는 문구 테이블 하나로 덮어쓸 수 있어 계약이 하나 줄어든다.

---

## 4. CSS (`data-icon`)

아이콘 버튼에 `data-icon` 속성이 있다. 패키지 스타일이 `@layer` 안에 있으므로 단일 선택자가
이긴다.

```css
.pck-icon-btn[data-icon='undo'] {
  font-size: 0;                                      /* 글리프를 숨긴다 */
  background: url(/icons/undo.svg) center / 16px no-repeat;
}

.pck-zoom-btn[data-icon='zoomIn'] {
  font-size: 0;
  background: url(/icons/plus.svg) center / 14px no-repeat;
}
```

스프라이트나 아이콘 폰트를 이미 쓰는 앱에 맞다.

---

## 접근성

아이콘 버튼은 `aria-label` 과 `title` 을 이미 갖고 있다. 아이콘을 교체해도 유지된다.

```html
<button class="pck-icon-btn" data-icon="undo" title="되돌리기" aria-label="되돌리기">…</button>
```

교체한 SVG 에는 `aria-hidden="true"` 를 붙인다 — 버튼이 이미 라벨을 갖고 있으므로 중복 읽기를
막는다.

---

## 새 아이콘이 추가되면

패키지에 새 아이콘이 생기면 `IconName` 에 이름이 늘고 기본 글리프가 함께 들어온다. 기존
설정은 그대로 동작하고, 새 아이콘만 기본값으로 보인다.

---

## 우선순위 확인

세 경로가 겹칠 때 어느 쪽이 이기는지 예제로 확인할 수 있다.

```tsx
<PDFCanvasEditor
  icons={{ close: closeIconNode }}        // ← 이것이 이긴다
  renderIcon={{ close: CloseIcon }}       // 무시됨
  strings={{ 'icon.close': '✕' }}          // 무시됨
/>
```

[examples/react/src/components/Icons.tsx](../examples/react/src/components/Icons.tsx) —
`renderIcon` 으로 undo·redo·zoom·back 을, `icons` 로 close 를, `strings` 로 caret 을 각각 써서
셋을 한 화면에서 비교한다.
