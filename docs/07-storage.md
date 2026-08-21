# 저장 · 업로드

호스트가 **포트**로 주입한다. 패키지는 HTTP 를 직접 부르지 않는다 — 인증·엔드포인트·재시도
정책이 앱마다 다르다.

```ts
<PDFCanvasEditor ports={{ asset, storage, converter }} />
```

| 포트 | 하는 일 | 없으면 |
| --- | --- | --- |
| `asset` | 페이지 이미지 업로드 | 세션 한정 blob URL. **저장할 수 없다** |
| `storage` | 문서 저장·불러오기 | 자동저장이 꺼진다 |
| `converter` | PDF → 이미지 변환 | 내장 pdf.js 구현을 쓴다 |

---

## 페이지 이미지 업로드 (`AssetPort`)

PDF 를 올리면 페이지가 이미지로 래스터화된다. 그 이미지를 어딘가 올려야 문서를 저장할 수 있다.

### presigned URL 방식

```ts
import { createS3AssetPort } from '@h_domi/pdf-canvas-kit'

const asset = createS3AssetPort({
  async getUploadUrl({ pageId, mime }) {
    const r = await fetch('/api/uploads', {
      method: 'POST',
      body: JSON.stringify({ pageId, mime }),
    })
    return r.json() // { uploadUrl, publicUrl, assetId }
  },
})
```

`uploadUrl` 과 `publicUrl` 을 나눠 받는 이유: presigned URL 에는 만료되는 서명 쿼리가 붙으므로
**문서에 저장되는 값은 `publicUrl`** 이어야 한다. 같은 값을 쓰면 며칠 뒤 이미지가 사라진다.

### 업로드 경로가 다르면

함수 하나만 넘긴다.

```tsx
<PDFCanvasEditor uploadFile={async (blob, meta) => {
  const form = new FormData()
  form.append('file', blob)
  const r = await fetch('/api/images', { method: 'POST', body: form })
  return (await r.json()).url
}} />
```

내부에서 `AssetPort` 로 감싼다.

---

## 문서 저장 (`StoragePort`)

```ts
const storage = {
  async save(doc) {
    await fetch('/api/documents', { method: 'PUT', body: serializeDoc(doc) })
  },
  async load(id) {
    const r = await fetch(`/api/documents/${id}`)
    return deserializeDoc(await r.text())
  },
}
```

`ports.storage` 를 주면 **자동저장이 켜진다.**

| | |
| --- | --- |
| 디바운스 | 5초 |
| 최대 지연 | 30초 (계속 편집해도 그 안에 한 번은 저장) |
| 실패 | 지수 백오프 3회 |
| flush | `beforeunload` · `visibilitychange` |

상태는 `onSaveStateChange` 로 온다 — `'idle'` `'saving'` `'saved'` `'error'` `'disabled'`.

```tsx
<PDFCanvasEditor ports={{ storage }} onSaveStateChange={setSaveState} />
```

자동저장을 끄려면:

```tsx
<PDFCanvasEditor ports={{ storage }} autosave={false} />
```

`handle.flushSave()` 로 직접 저장할 수 있다.

---

## ⚠️ 저장 전에 배경을 승격한다

페이지 배경은 **blob URL 로 시작한다.** 그대로 저장하면 다음 세션에 죽은 링크가 된다 —
`serializeDoc` 이 이를 **거부한다.**

```ts
import { promoteBackgrounds, serializeDoc } from '@h_domi/pdf-canvas-kit'

const storage = {
  async save(doc) {
    // blob 배경을 업로드해 영속 URL 로 바꾼다
    const ready = await promoteBackgrounds(doc, asset)
    await fetch('/api/documents', { method: 'PUT', body: serializeDoc(ready) })
  },
}
```

`handle.promoteBackgrounds()` 로 직접 부를 수도 있다 — 진행률이 필요하면 이 쪽이 낫다.

이 가드가 있는 이유: blob URL 을 `origin: 'inline'` 으로 저장하면 직렬화 검사가 무력화돼
죽은 링크가 조용히 남는다.

---

## 실서버가 없을 때

파이프라인은 그대로 돌리고 저장만 콘솔로 대체한다.

```ts
import { createConsoleStoragePort } from '@h_domi/pdf-canvas-kit'
const storage = createConsoleStoragePort({ label: '[myapp]' })
```

자동저장 디바운스·상태 전이·실패 처리가 모두 실제와 같이 동작한다.

---

## 실서버 연결 전 — 상단바 [JSON 출력]

편집기 상단바 버튼이 **문서 JSON 을 콘솔에 출력한다.** 저장 파이프라인은 `ports.storage` 가
담당하고, 이 버튼은 지금 문서 상태를 눈으로 확인하는 수단이다.

`serializeDoc` 을 **거치지 않는다.** 그 함수는 "저장 가능한 문서인가" 를 검사해 blob 배경이
있으면 던지는데, 이 버튼의 목적은 저장이 아니라 현재 상태 보기다 — `asset` port 없이 PDF 를
올리면 배경이 전부 blob 이라 그 가드를 태우면 버튼이 늘 막힌다.

대신 blob 배경이 있으면 **경고를 함께 낸다.** 저장 가능성과 문서 내용은 다른 정보이므로
하나가 다른 하나를 막지 않는다.

저장한 것이 아니므로 **dirty 상태를 지우지 않는다** — 저장 배지가 거짓말을 하면 안 된다.

실서버가 붙으면 이 버튼을 [내보내기] 로 되돌린다.

## PDF 변환 (`ConverterPort`)

기본은 내장 pdf.js 구현이다. 서버 변환이나 DOC/PPT 지원이 필요하면 교체한다.

```ts
const converter = {
  async convert(file, { onProgress, signal }) {
    const form = new FormData()
    form.append('file', file)
    const r = await fetch('/api/convert', { method: 'POST', body: form, signal })
    return r.json()   // { pages: [{ size, imageUrl }] }
  },
}
```

내장 구현은 PDF 만 처리한다 — DOC/PPT 는 서버 컨버터가 필요하다.

---

## 타입

```ts
import type {
  AssetPort,
  StoragePort,
  ConverterPort,
  EnginePorts,
  SaveState,
} from '@h_domi/pdf-canvas-kit'
```

[ARCHITECTURE §7](../ARCHITECTURE.md) 에 계약 상세가 있다.
