# @h_domi/pdf-canvas-kit

PDF를 페이지별 **배경 이미지**로 깔고, 그 위에 **텍스트·도형·직접 만든 객체를 레이어**로
올리는 편집기와 뷰어. **프레임워크에 종속되지 않는다** — 렌더 층이 vanilla DOM 이고
React·Vue 래퍼가 같은 컴포넌트를 제공한다.

```bash
# 첫 공개는 beta 다. latest 태그는 아직 비어 있다
npm install @h_domi/pdf-canvas-kit@next
```

```tsx
// React
import { PDFCanvasEditor } from '@h_domi/pdf-canvas-kit/react'
import '@h_domi/pdf-canvas-kit/styles.css'

<PDFCanvasEditor initialDoc={doc} onChange={setDoc} />
```

```vue
<!-- Vue / Nuxt -->
<script setup>
import { PDFCanvasEditor } from '@h_domi/pdf-canvas-kit/vue'
import '@h_domi/pdf-canvas-kit/styles.css'
</script>
<template><PDFCanvasEditor :initial-doc="doc" @change="onChange" /></template>
```

```ts
// 프레임워크 없이 — imperative facade
import { createPDFCanvasEditor, createPDFCanvasViewer } from '@h_domi/pdf-canvas-kit'

const editor = createPDFCanvasEditor(container, { initialDoc: doc })
const viewer = createPDFCanvasViewer(other, { doc: editor.toPublicDoc() })
```

> `initialDoc` 은 **최초 1회만 읽는다.** 편집기가 문서를 소유하고 `onChange` 로 밀어낸다 —
> controlled 가 아니다. 이름이 그 계약이다.

런타임 의존성은 `pdfjs-dist` 하나다. `react` · `vue` 는 **optional peer** 라 쓰는 쪽만 설치한다.
번들 크기는 코어 11KB + React 래퍼 2.8KB / Vue 래퍼 4.5KB + CSS 20KB.

---

## ⚠️ 시작 전에 두 가지

이 둘을 빠뜨리면 **에러 없이 조용히** 잘못 동작한다.

### 1. pdf.js 런타임 자산을 서빙한다

pdf.js는 CMap·표준 폰트·wasm 을 런타임에 URL로 가져온다. 빠뜨리면 **한국어 PDF에서 글자가
사라진다.**

```jsonc
// package.json
"postinstall": "node -e \"const{cpSync}=require('fs');for(const d of ['cmaps','standard_fonts','wasm','iccs'])cpSync('node_modules/pdfjs-dist/'+d,'public/pdfjs/'+d,{recursive:true});cpSync('node_modules/pdfjs-dist/build/pdf.worker.mjs','public/pdfjs/pdf.worker.mjs')\""
```

```ts
configurePdfResources({
  workerSrc: '/pdfjs/pdf.worker.mjs',
  cMapUrl: '/pdfjs/cmaps/',              // ⚠️ 이것 없으면 한글이 사라진다
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/',
  iccUrl: '/pdfjs/iccs/',
})
```

### 2. 컨테이너에 높이를 준다

`.pck-editor` 는 `height: 100%` 다. 확정 높이가 없으면 **편집기가 접힌다.**

```css
html, body, #app { height: 100%; margin: 0; }
/* flex 안이면 min-height: 0 도 필요하다 */
```

자세한 것은 [시작하기](docs/01-getting-started.md).

---

## 문서

전체 사용 설명서는 **[docs/](docs/)** 에 있다.

| | |
| --- | --- |
| [시작하기](docs/01-getting-started.md) | 설치, pdf.js 자산, 높이·폭 함정, SSR |
| [React](docs/02-react.md) · [Vue](docs/03-vue.md) · [프레임워크 없이](docs/04-vanilla.md) | 환경별 적용법 |
| [커스텀 객체](docs/05-custom-objects.md) | PDF 위에 **내 컴포넌트**를 올린다 |
| [뷰어](docs/06-viewer.md) | 읽기 전용 렌더 + 응답 받기 |
| [저장 · 업로드](docs/07-storage.md) · [내보내기](docs/08-export.md) | 포트 주입, 검증 게이트 |
| [스타일 오버라이드](docs/09-styling.md) | 토큰 75개 + **`@layer`** — 특이도 싸움이 없다 |
| [문구 · 번역](docs/10-strings.md) · [아이콘](docs/11-icons.md) | 모든 텍스트·아이콘을 교체 |
| [다이얼로그 위임](docs/12-dialogs.md) | 우리 팝업 대신 **내 모달** |
| [API 레퍼런스](docs/13-api.md) · [함정 모음](docs/14-pitfalls.md) | prop·handle·타입 / 실제로 겪은 문제 |
| [TODO](docs/TODO.md) | 남은 일 |

내부 구조는 따로 있다.

| | |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 코드 구조, **무엇을 어디서 바꾸는지**, 좌표계 규칙 |
| [CLAUDE.md](CLAUDE.md) | 이 저장소의 작업 규칙 |

---

## 커스터마이징 한눈에

호스트 앱에 맞추는 길이 네 개다. 위에서부터 시도하면 대부분 첫 단계에서 끝난다.

```css
/* 1. 토큰 — 색·간격·폭·모달 모양 */
.my-app .pck-editor {
  --pck-accent: #3b82f6;
  --pck-pagelist-width: 200px;
}

/* 2. CSS 규칙 — @layer 라서 단일 클래스가 이긴다. !important 불필요 */
.pck-toolbar { justify-content: center; }
```

```tsx
{/* 3. 문구·아이콘 — 번역이나 아이콘 라이브러리 */}
<PDFCanvasEditor
  strings={{ 'toolbar.text': 'Text' }}
  renderIcon={{ undo: UndoIcon }}
/>

{/* 4. 다이얼로그 위임 — 내 모달을 쓴다 */}
<PDFCanvasEditor
  onRequestUpload={() => setMyUploadOpen(true)}
  onRequestConfirm={(req) => setMyConfirm(req)}
/>
```

[스타일](docs/09-styling.md) · [문구](docs/10-strings.md) · [아이콘](docs/11-icons.md) ·
[다이얼로그](docs/12-dialogs.md) 에 각각 자세히 있다.

---

## 커스텀 객체 한눈에

패키지는 **기본 틀**(사각형·리사이즈·색)만 그린다. 그 안을 내 컴포넌트가 채운다.

```ts
const shortAnswer = defineObjectType<Answer, Omit<Answer, 'answers'>>({
  kind: 'answer.short',
  label: '단답형',
  defaultSize: { w: 160, h: 44 },
  defaultData: () => ({ answers: [], points: 1 }),
  validate: (d) => (d.answers.some((a) => a.trim()) ? null : ['정답을 입력하세요']),
  toPublic: ({ answers: _a, ...rest }) => rest,   // 뷰어에 나가면 안 되는 것
})
```

```tsx
<PDFCanvasEditor
  objectTypes={[shortAnswer]}
  renderObject={{ 'answer.short': AnswerBadge }}       // 캔버스 — 미리보기
  renderInspector={{ 'answer.short': AnswerFields }}   // 인스펙터 — 편집
/>
```

핸들로 틀을 키우면 안쪽 컴포넌트가 **자기 CSS 대로 다시 흐른다.**
[커스텀 객체](docs/05-custom-objects.md).

---

## 현재 상태

**미배포.** 편집 기능은 전부 동작하고, 남은 일은 [docs/TODO.md](docs/TODO.md) 에 있다.

**위 세 예제는 동작한다.** 편집기와 뷰어 모두 React·Vue·vanilla 에서 쓸 수 있다. 남은 것은 npm 배포뿐이다.

| 항목 | 상태 |
| --- | --- |
| vanilla facade (`createPDFCanvasEditor`) | 완료 (R9) |
| React 래퍼 (`@h_domi/pdf-canvas-kit/react`) | 완료 (R9) — 번들 2.0KB |
| Vue 래퍼 (`@h_domi/pdf-canvas-kit/vue`) | 완료 (R9) — 번들 3.0KB |
| 렌더 층 바닥 (`src/dom/reactive.ts` · `h.ts`) | 완료 (R2) |
| 객체·페이지·스테이지 렌더 | 완료 (R4·R5) |
| 편집기 크롬 (상단바·툴바·페이지목록·다이얼로그) | 완료 (R6) |
| 인스펙터 | 완료 (R7) |
| 커스텀 객체 레지스트리 | 완료 (R8) — 소비자가 타입을 정의한다 |
| 프레임워크 무관 컨트롤러 (`src/controller/`) | 완료 (R3) |
| 검증 케이스 | **287건 / 42 그룹** (`npm run checks`) |
| npm 배포 | **미배포.** tarball 설치 검증은 완료 (R10) — React 19 앱 · Vue 3.5 앱 |
| `PDFCanvasViewer` | 완료 (R11) — 연속 스크롤 · 페이지별 fit-to-width · `renderViewer` 슬롯 |
| 크롬 UI 슬롯 교체 | **미구현** (R12) — 결정은 D27 |


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
| 객체 생성 (텍스트·도형·커스텀) | 동작 — 도구 선택 후 드래그 |
| 객체 이동·리사이즈 (9방향 핸들) | 동작 (Shift 종횡비, Alt 중심 기준) |
| 다중 선택 (마퀴) · 복제 · 삭제 | 동작 |
| 텍스트 인라인 편집 (한글 IME 안전) | 동작 — 더블클릭 |
| 회전 (텍스트·도형) | 동작 — 회전 핸들 또는 인스펙터 |
| 지우개 | 동작 — 클릭한 객체 삭제 |
| 인스펙터 (텍스트·도형·커스텀 객체 편집) | 동작 — 커스텀 객체의 **편집 창구는 여기 하나**다 |
| 박스 색 편집 (배경·테두리·글자색) | 동작 — 텍스트·커스텀. 미지정은 테마 색을 따른다 |
| 검증 (내보내기 차단·실시간 경고) | 동작 — 같은 규칙을 공유 |
| 내보내기 검증 게이트 | 동작 — 실패 시 문제 객체로 이동·스크롤 |
| 내보내기 팝업 | **제공하지 않는다** — 검증 게이트만 준다 (`checkBeforeExport` · `toPublicDoc`) |
| 문항 번호 자동 부여 | 동작 — 위치에서 파생, 인스펙터에서 수동 오버라이드 |
| 패널 폭 리사이즈 | 동작 — 조정하면 localStorage에 기억 |
| 페이지 이미지 업로드 (S3) | 동작 — `createS3AssetPort` 또는 `uploadFile` prop |
| 페이지 드래그 순서 변경 | 동작 — 좌측 썸네일을 위아래로 끈다 |
| 페이지 삭제·복제 | 동작 — 썸네일 우클릭 메뉴 또는 하단 버튼. 객체가 있으면 확인 모달 |
| 자동저장 파이프라인 | 동작 — 저장 대상은 콘솔(`console.debug`). 실서버 미연결 |
| 상단바 [JSON 출력] | 문서 JSON 을 콘솔로. 실서버 연결 전의 자리다 |
| 상단바 [내보내기] | ⚠️ **임시 제거** — 검증 게이트는 `EditorHandle` 로 노출돼 있다 |

---

---

## 개발

```bash
npm install
npm run dev      # 3100 데모(레포 소스) · 3101 React 예제 · 3102 Vue 예제
```

`examples/*` 는 **별칭 없이** 설치된 `dist` 를 쓴다 — `exports` 맵·진입점·`.d.ts` 를 검증하는
유일한 자리다. 패키지 소스를 고치면 `npm run build` 후 반영된다.

| 화면 | |
| --- | --- |
| [`/editor/`](http://localhost:3100/editor/) | 편집기 (vanilla facade) |
| [`/viewer/`](http://localhost:3100/viewer/) | 편집기 ↔ 뷰어 왕복, 정답 제거 확인 |
| [`/checks/`](http://localhost:3100/checks/) | 검증 케이스 **303건 / 45 그룹** |
| [`/spike/`](http://localhost:3100/spike/) | PDF 변환 진단 (페이지 크기·폰트) |
| [React 예제](http://localhost:3101/) | **테마 토글 · 호스트 모달 · 아이콘 3경로** |
| [Vue 예제](http://localhost:3102/) | 같은 것의 SFC 판 |

## 스크립트

| 명령 | 하는 일 |
| --- | --- |
| `npm run dev` | **셋을 함께 띄운다** — 데모(:3100) + React 예제(:3101) + Vue 예제(:3102) |
| `npm run dev:demo` | 데모만(:3100). **LAN에서도 접근 가능** |
| `npm run dev:local` | 같지만 localhost만 바인딩 |
| `npm run build` | 라이브러리 빌드 + `.d.ts` 생성 |
| `npm run typecheck` | `vue-tsc` + node config 타입체크 |
| `npm run lint` | ESLint + Prettier 검사 |
| `npm run fix` | ESLint --fix + Prettier --write |
| `npm run checks` | **검증 케이스를 브라우저 없이 실행** (287 케이스. 실패 시 exit 1) |
| `npm run fixtures` | 테스트 PDF 생성 (크기 혼합·회전·CropBox·100페이지·손상) |
| `npm run copy:pdfjs` | pdf.js 런타임 자산을 `demo/public/pdfjs` 로 복사 |
| `npm run check:docs` | 문서의 죽은 상대 링크 검사 (lint 게이트에 포함) |
| `npm run examples:build` | 예제 앱 타입체크 + 빌드. **소비 경로를 검증하는 자리** |
| `./publish.sh` | **npm 배포.** gitignore 대상. 인증은 `.env` 의 `NPM_TOKEN`([.env.example](.env.example)) 또는 2FA OTP. `DRY_RUN=1` 로 먼저 확인한다 |
| `npm run verify:tarball` | 배포 산출물 검사 — 훅 · `exports` · 불필요 파일 · peer · `@layer` |
| `npm run license-check` | 의존성 라이선스 검사 (MIT/Apache-2.0/BSD/ISC만 허용) |
| `./publish.sh` | **npm 배포.** gitignore 대상. 인증은 `.env` 의 `NPM_TOKEN`([.env.example](.env.example)) 또는 2FA OTP. `DRY_RUN=1` 로 먼저 확인한다 |
| `npm run verify:tarball` | **배포 산출물 검사** — 라이프사이클 훅 · `exports` 대상 · 불필요 파일 · peer 설정 |
| `npm run examples:build` | **예제 앱 타입체크 + 빌드** (`skipLibCheck: false`). 소비 경로를 검증하는 자리다 |

자동 테스트 러너는 없다. 대신 `npm run checks` 가 커밋 전 게이트다 — 이유와 한계는
[ARCHITECTURE §11](ARCHITECTURE.md).
줌·팬·스크롤·IME 는 실제 브라우저 레이아웃에 의존해 덮이지 않는다. 손으로 확인해야 한다.

자동 테스트 러너는 없다. `npm run checks` 가 커밋 전 게이트다 — 이유와 한계는
[ARCHITECTURE §11](ARCHITECTURE.md). 줌·팬·드래그·한글 IME 는 실제 브라우저 레이아웃에 의존해
덮이지 않으므로 손으로 확인한다.

---

## 라이선스

이 패키지는 **MIT** 다. `LICENSE` 참고.

### 의존성 라이선스 정책

MIT · Apache-2.0 · BSD · ISC · CC0 · 0BSD 만 허용한다.
**GPL/LGPL/AGPL/SSPL/상업 라이선스는 금지** — 이 패키지가 남의 제품에 임베드 배포되므로
copyleft 의무나 좌석 과금이 소비자에게 전염된다.

PDF 계열에 특히 함정이 많다: `mupdf`·`iText` 는 AGPL, PSPDFKit·PDFTron 은 상업 라이선스다.
런타임 의존성은 `pdfjs-dist`(Apache-2.0) **하나**뿐이다. `npm run license-check` 로 검사한다.
