# 내보내기

편집기는 **검증만** 한다. 과제 생성·링크·QR·팝업 UI 는 전부 호스트 몫이다 — 그래야 도메인
없는 패키지로 남는다.

---

## 흐름

```
호스트가 [내보내기] 버튼을 만든다
   │
   ├─ handle.checkBeforeExport()
   │     실패 → false. 편집기가 문제 객체로 이동·선택·스크롤한다
   │     통과 → true
   │
   └─ handle.toPublicDoc()   타입별 toPublic(data) 를 거친 뷰어용 스냅샷
         │
         └─ 호스트 API 로 보낸다
```

---

## React

```tsx
const editor = useRef<EditorHandle>(null)

async function onExport() {
  // 검증 실패 시 편집기가 스스로 문제 지점을 보여주므로 여기서 할 일이 없다
  if (!editor.current?.checkBeforeExport()) return
  await api.createAssignment({ doc: editor.current.toPublicDoc() })
}

<PDFCanvasEditor ref={editor} initialDoc={doc} objectTypes={[shortAnswer]} />
<button onClick={onExport}>내보내기</button>
```

## Vue

```vue
<script setup lang="ts">
import { PDFCanvasEditor, type PDFCanvasEditorRef } from 'pdf-canvas-kit/vue'

// ⚠️ 타입을 명시한다 — Vue 의 expose 는 .d.ts 에 타입을 남기지 않는다
const editor = ref<PDFCanvasEditorRef | null>(null)

async function onExport() {
  if (!editor.value?.handle?.checkBeforeExport()) return
  await api.createAssignment({ doc: editor.value.handle.toPublicDoc() })
}
</script>

<template>
  <PDFCanvasEditor ref="editor" :initial-doc="doc" />
  <button @click="onExport">내보내기</button>
</template>
```

---

## `toPublicDoc()` 이 비밀을 제거한다

각 커스텀 객체 타입의 `toPublic(data)` 를 거친다.

```ts
defineObjectType<Answer, Omit<Answer, 'answers'>>({
  toPublic: ({ answers: _answers, ...rest }) => rest,   // 정답 제거
})
```

⚠️ **구현하지 않은 타입은 데이터가 그대로 나간다.** 이 패키지는 `data` 안에서 무엇이 비밀인지
모르므로 강제할 방법이 없다.

반환 타입은 `PublicPDFCanvasDoc` 이고, 뷰어는 그 타입만 받는다 — 편집 문서를 실수로 넘기는 것이
컴파일 에러가 된다. [뷰어](06-viewer.md#타입이-정답-유출을-막는다) 참고.

---

## 검증만 읽기

게이트를 열지 않고 상태만 보려면:

```ts
const result = editor.current?.validate()
// { ok: boolean, issues: ValidationIssue[] }
```

인스펙터의 실시간 경고가 **같은 규칙**을 쓰므로 결과가 어긋나지 않는다.

### 규칙

| 코드 | 언제 |
| --- | --- |
| `EMPTY_DOC` | 페이지가 없다 |
| `PAGE_LIMIT` | `LIMITS.pagesPerDoc` 초과 |
| `OBJECT_LIMIT_PAGE` | 한 페이지의 객체가 `LIMITS.objectsPerPage` 초과 |
| `CUSTOM_INVALID` | 커스텀 타입의 `validate` 가 실패했다 |
| `CUSTOM_UNKNOWN_KIND` | 등록되지 않은 `kind` 가 문서에 있다 |

`CUSTOM_INVALID` 의 문구는 소비자가 `validate` 에서 반환한 문자열이 그대로 나온다.

```ts
validate: (d) => (d.answers.some((a) => a.trim()) ? null : ['정답을 입력하세요']),
```

---

## 팝업은 제공하지 않는다

과제 이름·공개 범위·학급 선택·QR 은 이 패키지의 도메인이 아니다. 폼 하나를 위해 그 도메인을
다시 끌어들이면 [커스텀 객체 레지스트리](05-custom-objects.md)로 얻은 것을 잃는다.

QR 인코더도 번들에 넣지 않는다 — QR 이미지 URL 도 호스트가 준다.

문구는 필요하면 `export.*` 키를 쓸 수 있다 (`export.name` · `export.public` 등).

---

## 내보내기 후

문서는 편집기가 계속 소유한다. `toPublicDoc()` 은 **스냅샷**이고 편집기 상태를 바꾸지 않는다.

저장까지 하려면 [저장 · 업로드](07-storage.md)의 `flushSave()` 를 함께 부른다.

```ts
await editor.current?.flushSave()
await api.createAssignment({ doc: editor.current!.toPublicDoc() })
```
