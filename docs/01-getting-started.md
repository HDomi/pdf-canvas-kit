# 시작하기

## 설치

```bash
npm install @h_domi/pdf-canvas-kit
```

런타임 의존성은 `pdfjs-dist` 하나다. `react` · `vue` 는 **optional peer** 라 쓰는 쪽만 설치된다.

```jsonc
// package.json — 필요한 것만
"dependencies": {
  "@h_domi/pdf-canvas-kit": "^0.1.0",
  "react": "^19",        // React 로 쓸 때
  "vue": "^3.4"          // Vue 로 쓸 때
}
```

---

## 1. pdf.js 런타임 자산을 서빙한다 — **필수** ⚠️

pdf.js는 CMap·표준 폰트·wasm 디코더를 **런타임에 URL로** 가져온다. 번들러는 *디렉토리* URL을
재작성할 수 없으므로 앱이 파일을 직접 서빙해야 한다.

**빠뜨리면 한국어 PDF에서 글자가 조용히 사라진다.** 에러도 나지 않는다.

### 자산을 복사한다

```jsonc
// package.json
"scripts": {
  "postinstall": "node -e \"const{cpSync}=require('fs');for(const d of ['cmaps','standard_fonts','wasm','iccs'])cpSync('node_modules/pdfjs-dist/'+d,'public/pdfjs/'+d,{recursive:true});cpSync('node_modules/pdfjs-dist/build/pdf.worker.mjs','public/pdfjs/pdf.worker.mjs')\""
}
```

### 경로를 알려준다

```ts
import { configurePdfResources } from '@h_domi/pdf-canvas-kit'

configurePdfResources({
  // 필수. 라이브러리는 이 경로를 스스로 찾지 않는다
  workerSrc: '/pdfjs/pdf.worker.mjs',
  // ⚠️ 아래 넷을 빠뜨리면 한국어 글자가 사라진다
  cMapUrl: '/pdfjs/cmaps/',
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/',
  iccUrl: '/pdfjs/iccs/',
})
```

**디렉토리 경로 끝 슬래시는 필수다.** `workerSrc` 없이 변환하면 `PdfWorkerNotConfiguredError`
가 난다.

### 잘 됐는지 확인

| 증상 | 원인 |
| --- | --- |
| `pdf.worker.mjs 404` + `MIME type "text/html"` | 자산 복사를 안 했다. 두 번째 에러는 404 HTML 을 스크립트로 읽으려다 나는 2차 증상 |
| PDF 는 열리는데 **한글만 안 보인다** | `cMapUrl` 이 없다 |
| 일부 이미지가 안 보인다 | `wasmUrl` 이 없다 (JPEG2000·JBIG2) |

---

## 2. 컨테이너에 높이를 준다 — 가장 흔한 함정 ⚠️

`.pck-editor` 와 `.pck-viewer` 는 `height: 100%` 다. 컨테이너에 확정된 높이가 없으면
**편집기가 접히고 빈 상태 아이콘이 편집기 밖으로 삐져나온다.**

```css
/* 화면 전체 */
html, body, #app { height: 100%; margin: 0; }

/* 다른 UI 와 나눠 쓸 때 */
.my-layout { display: flex; flex-direction: column; height: 100vh; }
.my-editor-host { flex: 1; min-height: 0; }   /* min-height: 0 이 반드시 필요하다 */
```

`min-height: 0` 이 없으면 flex 자식이 콘텐츠 최소 높이를 우선해 부모를 넘어간다.

감싸는 요소를 한 겹 더 두면 **그 요소도 높이를 넘겨야 한다.** 규칙 없는 `<div>` 를 끼우면
체인이 끊긴다.

---

## 3. 편집기에 좁은 폭을 주지 않는다 ⚠️

편집기는 3분할이고 페이지 목록 240px + 인스펙터 280px 를 **고정으로** 먹는다. 1920px 화면의
절반(960px)에 넣으면 캔버스에 남는 폭이 400px 대가 되어 못 쓴다.

편집기와 뷰어를 한 화면에 두고 싶으면 **나란히가 아니라 탭으로 전환한다.**

```css
/* 둘 다 마운트해 두고 visibility 로 숨긴다 */
.pane { position: absolute; inset: 0; }
.pane[hidden] {
  display: block;      /* display: none 은 뷰어의 폭 측정을 죽인다 */
  visibility: hidden;
}
```

언마운트하면 편집기의 undo 스택이 날아가고 뷰어는 입력 중인 응답을 잃는다.

---

## 4. 스타일을 가져온다

```ts
import '@h_domi/pdf-canvas-kit/styles.css'
```

코어 엔트리는 CSS를 import 하지 않는다 — 검증·좌표 함수만 쓰는 소비자에게 20KB 스타일을
딸려 보내지 않기 위해서다.

---

## 5. 클라이언트 전용으로 마운트한다 (Nuxt · Next)

pdf.js·포인터 이벤트·`createObjectURL` 이 브라우저 전용이라 **SSR을 지원하지 않는다.**

```vue
<!-- Nuxt -->
<ClientOnly>
  <PDFCanvasEditor :initial-doc="doc" @change="onChange" />
</ClientOnly>
```

```tsx
// Next (App Router)
'use client'
```

```ts
// Next (dynamic import)
const Editor = dynamic(() => import('./Editor'), { ssr: false })
```

---

## 6. Vite 설정 (선택)

```ts
export default defineConfig({
  optimizeDeps: { include: ['pdfjs-dist'] },
})
```

Nuxt:

```ts
export default defineNuxtConfig({
  css: ['@h_domi/pdf-canvas-kit/styles.css'],
  vite: { optimizeDeps: { include: ['pdfjs-dist'] } },
})
```

---

## 다음

- [React 로 쓰기](02-react.md)
- [Vue 로 쓰기](03-vue.md)
- [프레임워크 없이 쓰기](04-vanilla.md)
