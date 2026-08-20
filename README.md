# pdf-canvas-kit

PDF를 페이지별 **배경 이미지**로 깔고, 그 위에 **Answer Box·텍스트·도형을 레이어**로 올리는
문제지 편집기. **프레임워크에 종속되지 않는다** — 렌더 층이 vanilla DOM 이고 Vue·React 래퍼가
같은 컴포넌트를 제공한다.

```tsx
// React
import { PDFCanvasEditor } from 'pdf-canvas-kit/react'
;<PDFCanvasEditor doc={doc} ports={ports} onChange={setDoc} />
```

```vue
<!-- Vue / Nuxt -->
<script setup>
import { PDFCanvasEditor } from 'pdf-canvas-kit/vue'
</script>
<template><PDFCanvasEditor :doc="doc" :ports="ports" @change="onChange" /></template>
```

```ts
// 프레임워크 없이 — 코어 + imperative facade
import { createPDFCanvasEditor } from 'pdf-canvas-kit'
```

런타임 의존성은 `pdfjs-dist` 하나다. `vue` · `react` 는 **optional peer** 라 쓰는 쪽만 설치한다.

| 문서 | 내용 |
| --- | --- |
| [PLAN.md](PLAN.md) | 설계 결정과 근거, 마일스톤, 미결정 사항 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 코드 구조, **무엇을 어디서 바꾸는지**, 좌표계 규칙 |
| [CLAUDE.md](CLAUDE.md) | 이 저장소의 작업 규칙 |

---

## 현재 상태

프로토타입, **미배포.** 기능은 M0~M7 완료 + M8 부분이고, 편집 기능은 전부 동작한다.

> ⚠️ **프레임워크 무관 재구조화(R 트랙)가 진행 중이다** — PLAN 20장.
> **위 세 예제 모두 아직 동작하지 않는다.** 프레임워크 래퍼와 facade 는 R8 에서 만들어진다.
> 현재는 `createEditorController()` + `stageWrap()` 을 직접 마운트하는 경로만 있다 (`demo/editor/main.ts` 참고).
> 진행 상황은 [PLAN 20.4 의 R 트랙 표](PLAN.md)에 있다.

| 항목 | 상태 |
| --- | --- |
| Vue 래퍼 (`/vue`) | **미구현** (R8). 구 SFC 구현은 R5 에서 삭제됐다 |
| React 래퍼 (`/react`) | **미구현** (R8) |
| vanilla facade (`createPDFCanvasEditor`) | **미구현** (R8) |
| 렌더 층 바닥 (`src/dom/reactive.ts` · `h.ts`) | 완료 (R2) — 검증 케이스 68건 |
| 객체·페이지·스테이지 렌더 | 완료 (R4·R5) — 검증 케이스 39건 |
| 편집기 크롬 (상단바·툴바·페이지목록·다이얼로그) | 완료 (R6) — 검증 케이스 20건 |
| 인스펙터 | **미구현** (R7) |
| 프레임워크 무관 컨트롤러 (`src/controller/`) | 완료 (R3) — 검증 케이스 33건 |
| npm 배포 | **미배포.** `npm pack` 검증은 R9 |

아래 기능 표는 **구 Vue 구현 기준**이다 — 새 렌더 층으로 옮겨진 항목은 R 트랙 표를 본다.

| | 상태 |
| --- | --- |
| PDF → 페이지 이미지 변환 | 동작 (페이지별 크기·회전·CropBox 확인) |
| 편집기 레이아웃 3분할 | 동작 |
| 중앙 페이지 렌더 (한 페이지씩) | 동작 |
| 좌측 페이지 리스트 · 클릭 전환 | 동작 |
| 확대/축소 · 팬 | 동작 (버튼 · 프리셋 · Cmd+휠 · Space 드래그) |
| 로드 시 자동 배율 | 페이지 **전체가 보이도록** 맞춤 (`fit-page` 기본) |
| 문서 업로드 · 진행률 | 동작 (PDF만, DOC/PPT는 서버 컨버터 필요) |
| undo/redo · 타이틀 편집 | 동작 |
| 객체 생성 (텍스트·도형·단답형·서술형·드롭박스) | 동작 — 도구 선택 후 드래그 |
| 객체 이동·리사이즈 (9방향 핸들) | 동작 (Shift 종횡비, Alt 중심 기준) |
| 다중 선택 (마퀴) · 복제 · 삭제 | 동작 |
| 텍스트 인라인 편집 (한글 IME 안전) | 동작 — 더블클릭 |
| 회전 (텍스트·도형) | 동작 — 회전 핸들 또는 인스펙터 |
| 지우개 | 동작 — 클릭한 객체 삭제 |
| 인스펙터 (정답·배점·텍스트·도형 편집) | 동작 |
| 박스 색 편집 (배경·테두리·글자색) | 동작 — 텍스트·단답형·서술형·드롭박스. 미지정은 테마 색을 따른다 |
| 검증 (내보내기 차단·실시간 경고) | 동작 — 같은 규칙을 공유 |
| 채점 순수 함수 | 동작 (`scoreAttempt` · `normalizeAnswer`) |
| 내보내기 검증 게이트 | 동작 — 실패 시 문제 객체로 이동·스크롤 |
| 내보내기 팝업 (`ExportDialog`) | 옵션 컴포넌트 제공 — 과제 생성 API는 호스트 몫 |
| 문항 번호 자동 부여 | 동작 — 위치에서 파생, 인스펙터에서 수동 오버라이드 |
| 패널 폭 리사이즈 | 동작 — 조정하면 localStorage에 기억 |
| 페이지 이미지 업로드 (S3) | 동작 — `createS3AssetPort` 또는 `uploadFile` prop |
| 페이지 드래그 순서 변경 | 동작 — 좌측 썸네일을 위아래로 끈다 |
| 페이지 삭제·복제 | 동작 — 썸네일 우클릭 메뉴 또는 하단 버튼. 객체가 있으면 확인 모달 |
| 자동저장 파이프라인 | 동작 — 저장 대상은 콘솔(`console.debug`). 실서버 미연결 |
| 상단바 [저장] | ⚠️ **프로토타입** — localStorage에 문서+이미지 저장 (PLAN 18.5) |
| 상단바 [내보내기] | ⚠️ **임시 제거** — 검증 게이트와 `ExportDialog` 는 그대로 |
| `PDFCanvasViewer` | **미구현** (M10) |

`/editor/` · `/spike/` · `/checks/` 를 확인할 수 있다.

---

## 시작하기

```bash
npm install          # postinstall이 pdf.js 자산을 demo/public/pdfjs 로 복사한다
npm run fixtures     # 테스트용 PDF 픽스처 생성 (선택)
npm run dev          # http://localhost:3100 + LAN 주소도 함께 출력
```

`npm run dev` 는 LAN에 노출된다. 다른 기기(태블릿 등)에서 출력된 `Network:` 주소로 열 수 있다.

⚠️ **LAN 주소는 secure context가 아니다.** 두 가지가 달라진다.

- `localStorage` 오리진이 `localhost:3100` 과 **별개다** — 프로토타입 저장 데이터와 패널 폭이
  주소마다 따로 쌓인다
- `crypto.randomUUID` · `navigator.clipboard` 가 없다. 라이브러리가 폴백하므로 동작은 하지만,
  직접 코드를 추가할 때는 `createId()` · `copyText()` 를 써야 한다 (PLAN 18.9)

같은 네트워크의 누구나 접근할 수 있다. 공용 Wi-Fi에서는 `npm run dev:local` 을 쓴다.

| 경로 | 내용 |
| --- | --- |
| [`/editor/`](http://localhost:3100/editor/) | `PDFCanvasEditor`. 상단 dev 바에서 픽스처를 바로 불러올 수 있다 |
| [`/spike/`](http://localhost:3100/spike/) | PDF를 페이지 이미지로 변환. 페이지별 pt 크기·해상도·소요시간·폰트 진단 |
| `/viewer/` | `PDFCanvasViewer` (미구현) |
| [`/checks/`](http://localhost:3100/checks/) | 순수 함수 · 반응성 · DOM · 컨트롤러 · 렌더 검증 — **266 케이스 / 37 그룹**, 불일치 행 강조. `npm run checks` 로 브라우저 없이도 돌린다 |

`/editor/` 에서 [문서 불러오기] 로 PDF를 올리거나, dev 바의 픽스처 버튼을 쓴다.
`/spike/` 는 PDF를 끌어다 놓아도 된다.

### 편집기 조작

| 조작 | 동작 |
| --- | --- |
| 좌측 썸네일 클릭 | 해당 페이지로 전환 |
| `PageUp` / `PageDown` · `Home` / `End` | 페이지 이동 |
| 우측 하단 `− 100% +` | 축소 / 배율 메뉴 / 확대 |
| `Cmd/Ctrl` + 휠 · 트랙패드 pinch | 포인터 위치 기준 확대·축소 |
| `Cmd/Ctrl` + `0` / `1` / `+` / `-` | 페이지 맞춤 / 100% / 확대 / 축소 |
| **`Space` + 드래그** · 중간 버튼 드래그 | 화면 이동(팬). 확대 상태에서만 의미가 있다 |
| `Cmd/Ctrl` + `Z` / `Shift`+`Cmd/Ctrl`+`Z` | undo / redo |
| 도구 선택 후 캔버스 드래그 | 객체 생성. `Shift` 를 누른 채 그리면 도구 유지 |
| 객체 클릭 · 빈 영역 드래그 | 선택 · 마퀴 다중 선택 |
| 핸들 드래그 | 리사이즈 (`Shift` 종횡비, `Alt` 중심 기준) |
| `Delete` / 방향키 (`Shift` 10pt) | 삭제 / 이동 |
| `Cmd/Ctrl` + `D` | 선택 객체 복제 |
| 텍스트 객체 더블클릭 | 인라인 편집 (`Esc` 로 종료) |
| 회전 핸들 드래그 | 회전 (`Shift` 15° 스냅) |
| 패널 사이 핸들 드래그 | 좌·우 패널 폭 조절 (더블클릭: 기본값) |
| 좌측 썸네일 위아래 드래그 | 페이지 순서 변경 |
| 좌측 썸네일 우클릭 | 복제 · 빈 페이지 추가 · 삭제 |

### 진단 스위치 (`/spike/`)

| 쿼리 | 효과 |
| --- | --- |
| `?run=mixed-size.pdf` | 로드하면서 바로 변환 |
| `?resources=off` | pdf.js CMap·표준폰트 URL 없이 렌더 (글자 사라짐 재현) |
| `?fontface=off` | FontFace API 대신 글리프 아웃라인으로 렌더 |
| `?targetPx=1240&mime=image/png&quality=0.9` | 해상도·포맷 즉시 비교 |

---

## 스크립트

| 명령 | 하는 일 |
| --- | --- |
| `npm run dev` | pdf.js 자산 복사 + 데모 서버(:3100). **LAN에서도 접근 가능** |
| `npm run dev:local` | 같지만 localhost만 바인딩 |
| `npm run build` | 라이브러리 빌드 + `.d.ts` 생성 |
| `npm run typecheck` | `vue-tsc` + node config 타입체크 |
| `npm run lint` | ESLint + Prettier 검사 |
| `npm run fix` | ESLint --fix + Prettier --write |
| `npm run checks` | **검증 케이스를 브라우저 없이 실행** (266 케이스. 실패 시 exit 1) |
| `npm run fixtures` | 테스트 PDF 생성 (크기 혼합·회전·CropBox·100페이지·손상) |
| `npm run copy:pdfjs` | pdf.js 런타임 자산을 `demo/public/pdfjs` 로 복사 |
| `npm run license-check` | 의존성 라이선스 검사 (MIT/Apache-2.0/BSD/ISC만 허용) |

자동 테스트 러너는 없다. 대신 `npm run checks` 가 커밋 전 게이트다 — 이유와 한계는
[PLAN D17](PLAN.md) · [ARCHITECTURE §11](ARCHITECTURE.md).
줌·팬·스크롤·IME 는 실제 브라우저 레이아웃에 의존해 덮이지 않는다. 손으로 확인해야 한다.

---

## 호스트 앱에서 쓰기 (Nuxt 3)

### 1. pdf.js 런타임 자산을 서빙한다 — **필수**

pdf.js는 CMap·표준 폰트·wasm 디코더를 **런타임에 URL로** 가져온다.
빠뜨리면 한국어 PDF에서 **글자가 조용히 사라진다.**

```jsonc
// package.json
"postinstall": "node -e \"const{cpSync}=require('fs');for(const d of ['cmaps','standard_fonts','wasm','iccs'])cpSync('node_modules/pdfjs-dist/'+d,'public/pdfjs/'+d,{recursive:true});cpSync('node_modules/pdfjs-dist/build/pdf.worker.mjs','public/pdfjs/pdf.worker.mjs')\""
```

```ts
// plugins/pdf-canvas-kit.client.ts
import { configurePdfResources } from 'pdf-canvas-kit'

export default defineNuxtPlugin(() => {
  configurePdfResources({
    // 필수. 라이브러리는 이 경로를 스스로 찾지 않는다 (ARCHITECTURE §4)
    workerSrc: '/pdfjs/pdf.worker.mjs',
    // 또는: import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url'
    cMapUrl: '/pdfjs/cmaps/',
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    wasmUrl: '/pdfjs/wasm/',
    iccUrl: '/pdfjs/iccs/',
  })
})
```

디렉토리 경로 끝 슬래시는 필수다. `workerSrc` 없이 변환하면
`PdfWorkerNotConfiguredError` 가 난다. 자세한 내용은 [ARCHITECTURE §4](ARCHITECTURE.md).

### 2. 클라이언트 전용으로 마운트한다

pdf.js·포인터 이벤트·`createObjectURL` 이 브라우저 전용이라 SSR을 지원하지 않는다.

```vue
<ClientOnly>
  <PDFCanvasEditor :doc="doc" :ports="ports" locale="ko" @change="onChange" />
</ClientOnly>
```

### 3. 기본 배율 바꾸기 (선택)

기본은 `fit-page` — 문서를 올리면 페이지 전체가 보인다. 폭 기준이 낫다면:

```vue
<PDFCanvasEditor :doc="doc" initial-scale="fit-width" />
<!-- 또는 고정 배율 -->
<PDFCanvasEditor :doc="doc" :initial-scale="1" />
```

### 4. Vite 설정

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  css: ['pdf-canvas-kit/styles.css'],
  vite: { optimizeDeps: { include: ['pdfjs-dist'] } },
})
```

---

## 현재 쓸 수 있는 API (M1)

컴포넌트는 아직 없지만 PDF 파이프라인은 단독으로 쓸 수 있다.

```ts
import {
  configurePdfResources,
  createPdfjsConverter,
  createBlobAssetPort,
  formatPaperLabel,
  ConvertError,
  type PDFCanvasPage,
  type PageBackground,
} from 'pdf-canvas-kit'

configurePdfResources({
  workerSrc: '/pdfjs/pdf.worker.mjs',
  cMapUrl: '/pdfjs/cmaps/',
  standardFontDataUrl: '/pdfjs/standard_fonts/',
})

const converter = createPdfjsConverter()
const assets = createBlobAssetPort()

try {
  const raster = await converter.convert(file, {
    onProgress: (p) => console.log(`${p.page}/${p.total}`),
  })

  const pages: PDFCanvasPage[] = []
  for (const r of raster) {
    const id = crypto.randomUUID()
    const asset = await assets.persist(r.blob, { pageId: id, mime: r.blob.type })
    const background: PageBackground = {
      kind: 'image',
      url: asset.url,
      origin: asset.origin,
      naturalWidth: r.naturalWidth,
      naturalHeight: r.naturalHeight,
      renderScale: r.renderScale,
    }
    pages.push({ id, size: r.size, background, objects: [] })
    console.log(formatPaperLabel(r.size)) // "A4 세로"
  }
} catch (e) {
  if (e instanceof ConvertError) {
    // 'unsupported-format' | 'file-too-large' | 'page-limit'
    // | 'encrypted' | 'corrupt' | 'aborted' | 'worker-unavailable'
    console.error(e.code, e.message)
  }
}
```

전체 타입 목록은 [ARCHITECTURE §9](ARCHITECTURE.md).

### 글자가 안 보일 때

`/spike/` 의 **폰트 · 텍스트 진단** 패널을 본다.

| 관측 | 의미 |
| --- | --- |
| 텍스트 0자 | PDF에 텍스트가 없다 (스캔 이미지). 정상 |
| 문자 수 정상 + pdf.js 경고 | 폰트 로딩 실패 → 자산 복사 확인 |
| 문자 수 정상 + 경고 없음 + 안 보임 | `?fontface=off` 로 비교 |

---

## 저장 · 업로드 연동

### 페이지 이미지 업로드

```ts
import { createS3AssetPort } from 'pdf-canvas-kit'

const asset = createS3AssetPort({
  async getUploadUrl({ pageId, mime }) {
    const r = await fetch('/api/uploads', { method: 'POST', body: JSON.stringify({ pageId, mime }) })
    return r.json() // { uploadUrl, publicUrl, assetId }
  },
})
```

`uploadUrl` 과 `publicUrl` 을 나눠 받는다 — presigned URL에는 만료되는 서명 쿼리가 붙으므로
문서에 저장되는 값은 `publicUrl` 이다.

업로드 경로가 완전히 다르면 함수만 넘겨도 된다.

```vue
<PDFCanvasEditor :upload-file="myUploader" />
```

### 문서 저장

```vue
<PDFCanvasEditor :ports="{ asset, storage }" @save-state-change="badge = $event" />
```

`ports.storage` 를 주면 자동저장이 켜진다 — 5초 디바운스, 최대 지연 30초, 실패 시 지수 백오프
3회, `beforeunload`/`visibilitychange` 에 flush.

**저장 전에 배경을 승격해야 한다.** 페이지 배경은 blob URL로 시작하고, 그대로 저장하면 다음
세션에 죽은 링크가 된다 — `serializeDoc` 이 이를 거부한다.

```ts
const storage = {
  async save(doc) {
    // blob 배경을 업로드해 영속 URL로 바꾼다
    const ready = await promoteBackgrounds(doc, asset)
    await fetch('/api/documents', { method: 'PUT', body: serializeDoc(ready) })
  },
}
```

**실서버가 없는 동안**은 콘솔 출력으로 대체할 수 있다. 파이프라인은 그대로 돌아간다.

```ts
import { createConsoleStoragePort } from 'pdf-canvas-kit'
const storage = createConsoleStoragePort({ label: '[myapp]' })
```

---

## ⚠️ 프로토타입 저장 (임시)

실서버가 없는 동안 상단바 [내보내기] 가 [저장 (프로토타입)] 으로 대체돼 있다.
누르면 localStorage에 문서와 이미지를 넣는다.

| 키 | 내용 |
| --- | --- |
| `pdf-canvas-kit.images` | `{ [assetId]: base64 data URL }` |
| `pdf-canvas-kit.doc` | 문서 JSON. 배경 `url` 은 `pck-local:<assetId>` 참조 |

```ts
import { savePrototype, loadPrototype } from 'pdf-canvas-kit'

await savePrototype(doc)
const restored = loadPrototype() // pck-pck-local: 참조를 base64로 복원한 문서
```

**localStorage는 오리진당 5~10MB다. 약 9~18페이지에서 한계에 닿고**, 초과하면
`PrototypeQuotaError` 를 던진다. 실제 제품용이 아니다 — `src/prototype/` 은 실서버가 붙으면
통째로 삭제한다(그 안의 `README.md` 에 절차가 있다).

`/editor/` dev 바의 [불러오기] · [저장 삭제] 로 확인할 수 있다.

---

## 내보내기 연동

편집기는 **검증만** 하고 `request-export` 를 발행한다. 과제 생성·Class 목록·링크·QR은 호스트 몫이다.

⚠️ 현재 상단바 버튼은 프로토타입 저장으로 대체돼 있다. 내보내기를 트리거하려면 expose된
`requestExport()` 를 호스트가 직접 부른다.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import type { ExportPayload } from 'pdf-canvas-kit'
import {
  PDFCanvasEditor,
  ExportDialog,
  type ExportSettings,
  type ExportResult,
} from 'pdf-canvas-kit/vue'

const payload = ref<ExportPayload | null>(null)
const result = ref<ExportResult | null>(null)
const busy = ref(false)

async function onSubmit(settings: ExportSettings) {
  busy.value = true
  // publicDoc 은 정답이 제거된 학생용 스냅샷이다
  const created = await api.createAssignment({ ...settings, doc: payload.value!.publicDoc })
  result.value = { url: created.url, qrUrl: created.qrUrl }
  busy.value = false
}
</script>

<template>
  <ClientOnly>
    <PDFCanvasEditor :doc="doc" @request-export="payload = $event" />
    <ExportDialog
      v-if="payload"
      :default-title="payload.doc.title"
      :classes="classes"
      :busy="busy"
      :result="result"
      :t="t"
      @submit="onSubmit"
      @close="((payload = null), (result = null))"
    />
  </ClientOnly>
</template>
```

`ExportDialog` 를 쓰지 않고 자기 팝업을 만들어도 검증 게이트는 동일하게 통과한다.
자세한 경계는 [ARCHITECTURE §7.3](ARCHITECTURE.md).

---

## 커스터마이징

| 대상 | 위치 |
| --- | --- |
| 색·폰트·패널 기본 폭 | [src/styles/tokens.css](src/styles/tokens.css) — `--pck-*` CSS 변수 오버라이드 |
| 새 객체 기본 크기, 줌 단계, 스냅 | [src/core/config/defaults.ts](src/core/config/defaults.ts) → `EDITOR_DEFAULTS` |
| 이미지 해상도·포맷 | 같은 파일 → `RENDER_DEFAULTS` |
| 페이지·Answer Box 한도 | 같은 파일 → `LIMITS` (**서버와 동일해야 함**) |

```css
.my-app .pck-editor {
  --pck-topbar-bg: #101014;
  --pck-accent: #3b82f6;
  --pck-pagelist-width: 200px;
}
```

기준과 주의점은 [ARCHITECTURE §2~3](ARCHITECTURE.md).

---

## 라이선스

이 패키지는 **MIT** 다. `LICENSE` 참고.

### 의존성 라이선스 정책

MIT · Apache-2.0 · BSD · ISC · CC0 · 0BSD 만 허용한다.
**GPL/LGPL/AGPL/SSPL/상업 라이선스는 금지** — 이 패키지가 남의 제품에 임베드 배포되므로
copyleft 의무나 좌석 과금이 소비자에게 전염된다.

PDF 계열에 특히 함정이 많다: `mupdf`·`iText` 는 AGPL, PSPDFKit·PDFTron 은 상업 라이선스다.
런타임 의존성은 `pdfjs-dist`(Apache-2.0) **하나**뿐이다. `npm run license-check` 로 검사한다.
