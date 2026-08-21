# 다이얼로그 위임

패키지가 만드는 팝업(문서 불러오기, 삭제 확인)을 **끄고 동작만 함수로 받는다.** 호스트 앱에는
이미 자기 디자인 시스템 모달이 있으니까.

스타일만 맞추고 내장 팝업을 쓰고 싶으면 [스타일 오버라이드](09-styling.md)의 `modal` 토큰을 쓴다.

---

## 원리

```
호스트: onRequestUpload   →  편집기가 내장 업로드 팝업을 그리지 않는다
        onRequestConfirm  →  편집기가 내장 확인 팝업을 그리지 않는다
              │
        호스트 모달에서 사용자가 결정
              │
        handle.importFile(file) / confirmPending() / cancelPending()
```

**콜백을 주는 것만으로 내장 팝업이 꺼진다.** 별도 플래그가 없다.

---

## 확인 모달

```tsx
import type { ConfirmRequest } from 'pdf-canvas-kit'

const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
const editor = useRef<EditorHandle>(null)

<PDFCanvasEditor ref={editor} onRequestConfirm={setConfirm} />

{confirm && (
  <MyModal
    message={confirm.message}
    danger={confirm.danger}
    onConfirm={() => {
      editor.current?.confirmPending()
      setConfirm(null)
    }}
    onCancel={() => {
      editor.current?.cancelPending()
      setConfirm(null)
    }}
  />
)}
```

### `ConfirmRequest`

| | |
| --- | --- |
| `message` | 무엇을 확인하는지. **이미 `strings` 를 거친 문구**다 |
| `danger` | 되돌릴 수 없는 동작이면 `true` — 호스트가 강조 색을 고른다 |

### ⚠️ 반드시 하나를 불러야 한다

`confirmPending()` 도 `cancelPending()` 도 부르지 않으면 편집기는 그 동작을 **대기 상태로
유지한다.** 조용히 취소하지 않는다.

사용자가 [삭제]를 눌렀는데 아무 일도 없는 것과, 확인 없이 지워지는 것 중 어느 쪽도 낫지
않으므로 결정을 호스트에 남긴다. 모달을 닫을 때(배경 클릭·ESC)도 `cancelPending()` 을 부른다.

---

## 업로드 모달

```tsx
import type { ImportState } from 'pdf-canvas-kit'

const [uploadOpen, setUploadOpen] = useState(false)
const [importing, setImporting] = useState<ImportState | null>(null)

<PDFCanvasEditor
  ref={editor}
  onRequestUpload={() => setUploadOpen(true)}
  onImportStateChange={setImporting}
/>

{uploadOpen && (
  <MyUploadModal
    progress={importing?.progress}
    error={importing?.error}
    onPick={(file) => void editor.current?.importFile(file)}
    onCancel={() => editor.current?.cancelImport()}
    onClose={() => setUploadOpen(false)}
  />
)}
```

### `ImportState`

| | |
| --- | --- |
| `progress` | `null` 이면 진행 중인 작업이 없다 |
| `progress.fileName` | 파일 이름 |
| `progress.ratio` | `0..1` |
| `progress.page` · `total` | 현재/전체 페이지 (있을 때) |
| `progress.phase` | `'converting'`(래스터화) 또는 `'storing'`(업로드) |
| `error` | 실패 문구. 이미 `strings` 를 거쳤다 |

### 진행률 표시

```tsx
{importing?.progress && (
  <>
    <progress value={importing.progress.ratio} max={1} />
    <p>
      {importing.progress.fileName} — {Math.round(importing.progress.ratio * 100)}%
      {importing.progress.total &&
        ` (${importing.progress.page}/${importing.progress.total} 페이지)`}
    </p>
    <p>{importing.progress.phase === 'storing' ? '이미지 저장 중' : '페이지 변환 중'}</p>
  </>
)}
```

### 파일을 어디서 받든 상관없다

편집기는 `File` 하나만 받는다. 드래그&드롭, 자체 파일 선택기, 클립보드 붙여넣기, 원격 URL 을
fetch 한 결과 — 무엇이든 된다.

```tsx
// 드래그&드롭
onDrop={(e) => {
  e.preventDefault()
  const file = e.dataTransfer.files[0]
  if (file) void editor.current?.importFile(file)
}}

// 원격 파일
const res = await fetch('/templates/worksheet.pdf')
const file = new File([await res.blob()], 'worksheet.pdf', { type: 'application/pdf' })
await editor.current?.importFile(file)
```

---

## 편집기 밖에 버튼 두기

호스트 UI 에서 편집기 동작을 부를 수 있다.

```tsx
<MyToolbar>
  <button onClick={() => editor.current?.requestUpload()}>파일 열기</button>
  <button onClick={() => editor.current?.requestRemovePage(0)}>첫 페이지 삭제</button>
</MyToolbar>
```

| | 하는 일 |
| --- | --- |
| `requestUpload()` | `onRequestUpload` 를 줬으면 그 콜백이, 아니면 내장 팝업 |
| `requestRemovePage(i)` | 객체가 있으면 확인을 요청하고, 비어 있으면 즉시 삭제 |

---

## Vue

```vue
<script setup lang="ts">
import type { ConfirmRequest, ImportState } from 'pdf-canvas-kit'
import { PDFCanvasEditor, type PDFCanvasEditorRef } from 'pdf-canvas-kit/vue'

const editor = ref<PDFCanvasEditorRef | null>(null)
const confirmReq = ref<ConfirmRequest | null>(null)
const importing = ref<ImportState | null>(null)

function resolveConfirm(ok: boolean) {
  if (ok) editor.value?.handle?.confirmPending()
  else editor.value?.handle?.cancelPending()
  confirmReq.value = null
}
</script>

<template>
  <PDFCanvasEditor
    ref="editor"
    :on-request-confirm="(req) => (confirmReq = req)"
    :on-request-upload="() => (uploadOpen = true)"
    :on-import-state-change="(st) => (importing = st)"
  />

  <MyModal v-if="confirmReq" :message="confirmReq.message" @confirm="resolveConfirm(true)"
           @cancel="resolveConfirm(false)" />
</template>
```

---

## 내보내기 팝업은 아예 없다

패키지가 내보내기 UI 를 제공하지 않는다 — 과제·학급·링크·QR 은 이 패키지의 도메인이 아니다.
검증 게이트만 준다.

[내보내기](08-export.md) 참고.

---

## 전체 예제

- [examples/react/src/components/ConfirmDialog.tsx](../examples/react/src/components/ConfirmDialog.tsx)
- [examples/react/src/components/UploadDialog.tsx](../examples/react/src/components/UploadDialog.tsx) — 드래그&드롭·진행률·취소
- [examples/vue/src/components](../examples/vue/src/components) — SFC 판

두 예제 모두 패키지 클래스(`pck-`)를 하나도 쓰지 않는다. **호스트 디자인 시스템이 그대로
나오는 모습**이 요점이다.
