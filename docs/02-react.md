# React

`@h_domi/pdf-canvas-kit/react` 는 vanilla facade 를 감싼 **2.8KB** 래퍼다. 편집기 본체는 프레임워크를
모르는 DOM 코드이고, 래퍼가 하는 일은 셋뿐이다 — 마운트/정리, prop 전달, **`createPortal`**.

> 먼저 [시작하기](01-getting-started.md)의 pdf.js 자산 설정과 높이 규칙을 확인한다.

---

## 최소 예제

```tsx
import { PDFCanvasEditor } from '@h_domi/pdf-canvas-kit/react'
import { createPDFCanvasDoc, createPage, A4_PT } from '@h_domi/pdf-canvas-kit'
import '@h_domi/pdf-canvas-kit/styles.css'

const initialDoc = createPDFCanvasDoc({ pages: [createPage({ size: A4_PT })] })

export function App() {
  return (
    <div style={{ height: '100vh' }}>
      <PDFCanvasEditor initialDoc={initialDoc} onChange={(doc) => console.log(doc)} />
    </div>
  )
}
```

---

## `initialDoc` — 이름이 계약이다 ⚠️

**최초 1회만 읽는다.** 편집기가 문서를 소유하고 변경을 `onChange` 로 밀어낸다 — controlled
prop 이 아니다.

```tsx
// ✗ state 를 넣어도 편집기는 첫 값만 본다
<PDFCanvasEditor initialDoc={doc} />

// ✓ 문서를 교체해야 하면 key 로 재마운트한다
<PDFCanvasEditor key={docId} initialDoc={doc} />
```

`doc` 이 아니라 `initialDoc` 인 이유가 이것이다. React 관례에서 `doc` 은 controlled 를 뜻하고,
그렇게 부르면 API 이름이 거짓말을 한다.

같은 규칙이 `objectTypes` · `initialScale` 에도 적용된다.

---

## `ref` 로 프로그램 조작

```tsx
import { useRef } from 'react'
import { PDFCanvasEditor, type EditorHandle } from '@h_domi/pdf-canvas-kit/react'

const editor = useRef<EditorHandle>(null)

async function onExport() {
  // 검증 게이트. 실패하면 편집기가 문제 객체로 데려간다
  if (!editor.current?.checkBeforeExport()) return
  await api.save(editor.current.toPublicDoc())
}

<PDFCanvasEditor ref={editor} initialDoc={doc} />
<button onClick={onExport}>내보내기</button>
```

`handle` 전체 목록은 [API 레퍼런스](13-api.md#editorhandle)에 있다.

---

## 문서 변경 구독

두 방법이 있고 목적이 다르다.

```tsx
// 1. onChange — 저장·상태 미러링
<PDFCanvasEditor onChange={setDoc} />

// 2. handle.subscribe — 렌더 밖에서 듣기
useEffect(() => editor.current?.subscribe((doc) => analytics(doc)), [])
```

래퍼는 내부에서 `useSyncExternalStore` 로 구독한다 — 편집기가 문서를 React 밖에서 바꾸므로
tearing 없이 읽으려면 공식 API 가 필요하다.

---

## StrictMode

개발 모드에서 effect 가 두 번 돌고 정리도 두 번 불린다. facade 의 `destroy()` 는 **멱등**이라
안전하다.

```tsx
createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

예제 앱이 일부러 StrictMode 로 띄운다 — 편집기가 두 벌 남는 회귀를 개발 중에 잡으려고.

---

## 커스텀 객체 — `createPortal`

PDF 위에 **내 컴포넌트**를 올린다. 렌더 층이 빈 컨테이너를 만들고 알려주면 래퍼가 portal 한다.

```tsx
<PDFCanvasEditor
  objectTypes={[shortAnswer]}
  renderObject={{ 'answer.short': AnswerBadge }}      // 캔버스 — 미리보기
  renderInspector={{ 'answer.short': AnswerFields }}  // 인스펙터 — 편집
/>
```

**portal 안에서는 평범한 React 코드가 그대로 동작한다.** 배열 추가·삭제, 조건부 렌더, 훅 전부.
포커스 가드도 필요 없다.

자세한 것은 [커스텀 객체](05-custom-objects.md).

---

## ⚠️ `position: fixed` 는 갇힌다

커스텀 객체 컨테이너가 `transform: scale()` 안에 있다. CSS 스펙상 `transform` 조상이 `fixed`
의 컨테이닝 블록이 되므로 **드롭다운·툴팁이 페이지 프레임 기준으로 갇힌다.** 우회로가 없다.

그런 UI 는 `document.body` 로 따로 portal 한다.

```tsx
function MySelect() {
  return (
    <>
      <button>고르기</button>
      {open && createPortal(<Menu />, document.body)}
    </>
  )
}
```

---

## 뷰어

```tsx
import { PDFCanvasViewer } from '@h_domi/pdf-canvas-kit/react'

// 편집기와 달리 doc 이 controlled 다
<PDFCanvasViewer
  doc={publicDoc}
  objectTypes={[shortAnswer]}
  renderObject={{ 'answer.short': AnswerInput }}
  onChangeData={(id, next) => setResponses((r) => ({ ...r, [id]: next }))}
/>
```

[뷰어](06-viewer.md) 참고.

---

## 타입

```tsx
import type {
  EditorHandle,
  ViewerHandle,
  CustomSlotProps,
  SlotMap,
  IconMap,
  PDFCanvasEditorProps,
  PDFCanvasViewerProps,
} from '@h_domi/pdf-canvas-kit/react'
```

`CustomSlotProps<Data>` 가 슬롯 컴포넌트의 prop 타입이다.

```tsx
function AnswerBadge({ objectId, data, onChange }: CustomSlotProps<Answer>) { … }
```

---

## 전체 예제

[examples/react](../examples/react) — 편집기·뷰어 탭 전환, 호스트 모달, 테마 토글, 아이콘 3경로가
모두 들어 있다. `npm run dev` 후 http://localhost:3101/.
