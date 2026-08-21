# Vue

`@h_domi/pdf-canvas-kit/vue` 는 vanilla facade 를 감싼 **4.5KB** 래퍼다. SFC 가 아니라
`defineComponent` + `h()` 로 만들어져 `@vitejs/plugin-vue` 도 `vue-tsc` 도 요구하지 않는다.

> 먼저 [시작하기](01-getting-started.md)의 pdf.js 자산 설정과 높이 규칙을 확인한다.

---

## 최소 예제

```vue
<script setup lang="ts">
import { PDFCanvasEditor } from '@h_domi/pdf-canvas-kit/vue'
import { createPDFCanvasDoc, createPage, A4_PT } from '@h_domi/pdf-canvas-kit'
import '@h_domi/pdf-canvas-kit/styles.css'

const initialDoc = createPDFCanvasDoc({ pages: [createPage({ size: A4_PT })] })
</script>

<template>
  <div style="height: 100vh">
    <PDFCanvasEditor :initial-doc="initialDoc" @change="(doc) => console.log(doc)" />
  </div>
</template>
```

---

## `initial-doc` — 이름이 계약이다 ⚠️

**최초 1회만 읽는다.** 편집기가 문서를 소유하고 변경을 `change` 로 밀어낸다 — controlled prop
이 아니다. 문서를 교체해야 하면 `key` 로 재마운트한다.

```vue
<PDFCanvasEditor :key="docId" :initial-doc="doc" />
```

같은 규칙이 `object-types` · `initial-scale` 에도 적용된다.

---

## `ref` — 타입을 명시해야 한다 ⚠️

Vue 의 `expose()` 는 **런타임 API 라 생성된 `.d.ts` 에 타입을 남기지 않는다.** React 의
`useImperativeHandle` 은 자동인데 Vue 는 아니다. 래퍼가 그 비대칭을 메우는 타입을 내보낸다.

```vue
<script setup lang="ts">
import { PDFCanvasEditor, type PDFCanvasEditorRef } from '@h_domi/pdf-canvas-kit/vue'

// ⚠️ 타입을 명시한다. 안 하면 handle 이 any 로 잡혀 오타가 조용히 통과한다
const editor = ref<PDFCanvasEditorRef | null>(null)

async function onExport() {
  if (!editor.value?.handle?.checkBeforeExport()) return
  await api.save(editor.value.handle.toPublicDoc())
}
</script>

<template>
  <PDFCanvasEditor ref="editor" :initial-doc="doc" />
  <button @click="onExport">내보내기</button>
</template>
```

뷰어는 `PDFCanvasViewerRef` 다.

`handle` 전체 목록은 [API 레퍼런스](13-api.md#editorhandle)에 있다.

---

## 이벤트

| 이벤트 | 인자 | 언제 |
| --- | --- | --- |
| `change` | `PDFCanvasDoc` | 문서가 바뀔 때마다 |
| `save-state-change` | `SaveState` | 자동저장 상태 전이 |
| `back` | — | 상단바 뒤로 버튼 |
| `change-data` (뷰어) | `objectId`, `next` | 뷰어 응답 변경 |

```vue
<PDFCanvasEditor
  @change="onChange"
  @save-state-change="onSaveState"
  @back="router.back()"
/>
```

---

## 커스텀 객체 — `Teleport`

PDF 위에 **내 컴포넌트**를 올린다. 렌더 층이 빈 컨테이너를 만들고 알려주면 래퍼가 Teleport 한다.

```vue
<PDFCanvasEditor
  :object-types="[shortAnswer]"
  :render-object="{ 'answer.short': AnswerBadge }"
  :render-inspector="{ 'answer.short': AnswerFields }"
/>
```

슬롯 컴포넌트는 `objectId` · `data` 를 prop 으로 받고 `change` 를 emit 한다.

```vue
<script setup lang="ts">
const props = defineProps<{ objectId: string; data: Answer }>()
const emit = defineEmits<{ change: [next: Answer] }>()
</script>
```

**Teleport 안에서는 평범한 Vue 코드가 그대로 동작한다.** `v-for`, `v-if`, `ref` 전부. 포커스
가드도 필요 없다.

자세한 것은 [커스텀 객체](05-custom-objects.md).

---

## ⚠️ `position: fixed` 는 갇힌다

커스텀 객체 컨테이너가 `transform: scale()` 안에 있다. **드롭다운·툴팁이 페이지 프레임 기준으로
갇힌다.** 우회로가 없으므로 그런 UI 는 `body` 로 따로 Teleport 한다.

```vue
<Teleport to="body">
  <MyDropdown v-if="open" />
</Teleport>
```

---

## 뷰어

```vue
<script setup lang="ts">
import { PDFCanvasViewer } from '@h_domi/pdf-canvas-kit/vue'
</script>

<template>
  <!-- 편집기와 달리 doc 이 controlled 다 -->
  <PDFCanvasViewer
    :doc="publicDoc"
    :object-types="[shortAnswer]"
    :render-object="{ 'answer.short': AnswerInput }"
    @change-data="onChangeData"
  />
</template>
```

[뷰어](06-viewer.md) 참고.

---

## Nuxt

SSR 을 지원하지 않으므로 `<ClientOnly>` 로 감싼다.

```vue
<ClientOnly>
  <PDFCanvasEditor :initial-doc="doc" @change="onChange" />
</ClientOnly>
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  css: ['@h_domi/pdf-canvas-kit/styles.css'],
  vite: { optimizeDeps: { include: ['pdfjs-dist'] } },
})
```

`configurePdfResources` 는 클라이언트 플러그인에서 부른다.

```ts
// plugins/@h_domi/pdf-canvas-kit.client.ts
export default defineNuxtPlugin(() => {
  configurePdfResources({ workerSrc: '/pdfjs/pdf.worker.mjs', cMapUrl: '/pdfjs/cmaps/', … })
})
```

---

## 타입

```ts
import type {
  EditorHandle,
  ViewerHandle,
  PDFCanvasEditorRef,
  PDFCanvasViewerRef,
  SlotMap,
  IconMap,
} from '@h_domi/pdf-canvas-kit/vue'
```

---

## 전체 예제

[examples/vue](../examples/vue) — 편집기·뷰어 탭 전환, 호스트 모달, 테마 토글, 아이콘 3경로가
모두 들어 있다. `npm run dev` 후 http://localhost:3102/.
