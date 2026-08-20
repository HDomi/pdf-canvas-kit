# ARCHITECTURE

이 문서는 **코드가 어떻게 구성돼 있고, 무엇을 어디서 바꾸면 되는지**를 설명한다.
기능 범위·마일스톤·미결정 사항은 [PLAN.md](PLAN.md)에, 설치·실행은 [README.md](README.md)에 있다.

| 항목 | 내용 |
| --- | --- |
| 문서 버전 | arch-2.3 |
| 최종 수정일 | 2026.08.20 |
| 대응 코드 | M0~M7 + M8 부분 · **R 트랙 진행 중** (R0~R8 완료 — PLAN 20장) |
| 대상 환경 | **프레임워크 무관** — vanilla DOM + Vue·React 래퍼 (PLAN D19) |

---

## 1. 레이어

```
┌──────────────────────────┐   ┌──────────────────────────┐
│ 호스트 앱 (React)         │   │ 호스트 앱 (Vue / Nuxt)    │
│  · 과제 생성 API · 인증 · S3 · Class 목록 · QR           │
└────────────┬─────────────┘   └────────────┬─────────────┘
             │                              │
┌────────────▼─────────────┐   ┌────────────▼─────────────┐
│ src/react/  ~120줄        │   │ src/vue/  ~60줄           │
│  <PDFCanvasEditor />     │   │  <PDFCanvasEditor />     │
└────────────┬─────────────┘   └────────────┬─────────────┘
             └──────────────┬───────────────┘
                            │ createPdfCanvasEditor(el, props) → EditorHandle
┌───────────────────────────▼─────────────────────────────────┐
│ src/dom/            프레임워크 무관 렌더 층                    │
│  reactive.ts (§12) · h.ts (§13) · editor/** — DOM 을 바인딩   │
└───────────────────────────┬─────────────────────────────────┘
                            │ signal 을 읽고 액션을 부른다
┌───────────────────────────▼─────────────────────────────────┐
│ src/controller/     DOM 은 알고 프레임워크는 모른다 (§14)      │
│  editor.ts · stage.ts · pageViewport.ts · pointerTool.ts …   │
└───────────────────────────┬─────────────────────────────────┘
                            │ 함수 호출만. 역방향 의존 없음
┌───────────────────────────▼─────────────────────────────────┐
│ src/core/           순수 TypeScript (프레임워크 import 금지)   │
│  model · config · geometry · interaction · pdf · validation  │
│  grading · assets · ports · i18n                            │
└─────────────────────────────────────────────────────────────┘
```

**`src/core/`는 프레임워크를 import 하지 않는다.** ESLint `no-restricted-imports`로 강제한다
([eslint.config.js](eslint.config.js)).

이 규칙을 문서가 아니라 린트로 잡아 둔 값이 회수됐다 — 프레임워크 무관 재구조화(PLAN 20장)에서
`src/core/` 4,957줄은 **손댈 필요가 없었다.** 바꿀 대상은 UI 층뿐이다.

**래퍼는 `EditorHandle` 계약 하나만 안다.** 그래서 세 번째 프레임워크가 와도 비용이 같다.

> ⚠️ **R 트랙 진행 중이다** (PLAN 20.4). `src/vue/**` 는 2026.08.20 에 **삭제됐다** —
> 원본은 `_LumiTeach/lumiteach-worksheet-system` 에 git 으로 보존돼 있다.
> `src/react/` · `src/vue/` 의 얇은 래퍼와 `EditorHandle` facade 는 **R8 에서 만들어진다.**
> 현재 소비 경로는 `createEditorController()` + `stageWrap()` 직접 마운트뿐이고,
> 상단바·툴바·페이지 목록·인스펙터는 R6·R7 에서 붙는다.

---

## 2. 무엇을 어디서 바꾸는가 (한눈에)

| 바꾸고 싶은 것 | 파일 | 비고 |
| --- | --- | --- |
| 색·폰트·패널 폭·그림자 | [src/styles/tokens.css](src/styles/tokens.css) | CSS 변수. 호스트에서 오버라이드 가능(§3) |
| 새 객체 기본 크기, 줌 단계, 스냅 그리드, undo 깊이 | [src/core/config/defaults.ts](src/core/config/defaults.ts) → `EDITOR_DEFAULTS` | 제품별 조정 가능 |
| 페이지 수·Answer Box 수·글자 수 한도 | 같은 파일 → `LIMITS` | **기획 스펙. 서버와 반드시 동일해야 함** |
| 이미지 해상도·포맷·품질 | 같은 파일 → `RENDER_DEFAULTS` | 속도·용량 트레이드오프(§5) |
| 상단바 높이·좌우 패널 폭 | `LAYOUT_DEFAULTS` + `tokens.css` | **두 곳을 함께** 고쳐야 함(§3.2) |
| pdf.js 자산 경로 | `configurePdfResources()` 호출부 | 호스트 앱에서 1회(§4) |
| 페이지 이미지 업로드 | `ports.asset` 또는 `uploadFile` prop | §7.4 |
| 문서 저장 | `ports.storage` | 현재는 콘솔 출력(§7.5) |
| 패널 폭 기본값 | `LAYOUT_DEFAULTS` + `tokens.css` | 사용자가 조정하면 localStorage가 우선(§7.6) |
| 문항 번호 규칙 | `core/model/numbering.ts` → `Y_TOLERANCE_PT` | 문서에 저장되지 않는 파생값 |
| 박스 기본 색 | `tokens.css` → `--pck-answerbox-*` | 객체가 색을 지정하지 않았을 때만 적용(§3.3) |
| UI 문구 | [src/core/config/strings.ts](src/core/config/strings.ts) | **§15.** `configureStrings()` 로 키별 교체. i18n 시스템은 제거했다(PLAN D24) |
| 반응성 동작 (signal·effect) | [src/dom/reactive.ts](src/dom/reactive.ts) | **§12.** 깊은 반응성이 없다는 함정을 먼저 읽는다 |
| 편집기 동작·단축키·액션 | [src/controller/editor.ts](src/controller/editor.ts) | **§14.** UI 가 아니라 여기가 동작을 정한다 |

---

## 3. 스타일 토큰

### 3.1 오버라이드 방법
모든 시각 값은 `--pck-*` CSS 변수다. 호스트 앱에서 감싸는 요소에 덮어쓰면 된다.

```css
.my-app .pck-editor {
  --pck-topbar-bg: #101014;
  --pck-topbar-ink: #f5f5f5;
  --pck-accent: #3b82f6;
  --pck-pagelist-width: 200px;
}
```

토큰 이름은 `--pck-<영역>-<역할>` 규칙을 따른다.
영역은 `topbar` · `pagelist` · `stage` · `toolbar` · `inspector` · `select` · `answerbox` · `state`.

### 3.2 CSS 토큰 vs TS 상수 — 구분 기준

| | CSS 토큰 (`tokens.css`) | TS 상수 (`defaults.ts`) |
| --- | --- | --- |
| 성격 | **보이는 것** | **계산에 쓰이는 것** |
| 예 | 색, 그림자, 폰트, 라운드 | 최소 객체 크기(pt), 줌 배열, 한도 |
| 왜 | 리빌드 없이 테마 변경 | 좌표 계산·검증이 숫자로 필요 |

**치수는 양쪽에 있다** — 레이아웃 CSS가 변수를 쓰고, 줌 맞춤 계산이 숫자를 쓴다.
아래 짝은 **항상 같은 값을 유지**해야 한다.

| CSS 토큰 | TS 상수 | 어긋나면 |
| --- | --- | --- |
| `--pck-stage-padding` | `EDITOR_DEFAULTS.stagePadding` | "페이지 맞춤"이 페이지를 자르거나 여백을 남긴다 |
| `--pck-pagelist-width` | `LAYOUT_DEFAULTS.pageListWidthPx` | 맞춤 배율이 실제 스테이지 폭과 어긋난다 |
| `--pck-inspector-width` | `LAYOUT_DEFAULTS.inspectorWidthPx` | 같음 |
| `--pck-topbar-height` | `LAYOUT_DEFAULTS.topBarHeightPx` | 스테이지 높이 계산이 어긋난다 |

### 3.3 객체 색과 토큰의 관계

텍스트·Answer Box는 `BoxStyle` 로 배경·테두리·글자색을 가질 수 있다(PLAN 18.8).
**지정하지 않은 필드는 인라인 스타일로 내보내지 않는다** — 그래야 `--pck-*` 토큰이 살아 있다.

| 상태 | 뜻 | 렌더 |
| --- | --- | --- |
| `undefined` | 미지정 | 토큰 기본값 |
| `null` | 투명 / 테두리 없음 | `transparent` / `border-style: none` |
| 색 문자열 | 지정 | 인라인 스타일 |

객체마다 색을 채워 두면 호스트가 테마를 바꿀 수 없다. 그래서 인스펙터는 항목마다 체크박스를 둔다.

판단은 `core/model/boxStyle.ts` 한곳에 모여 있다 — 컴포넌트마다 `if (style?.fill)` 를 흩어 두면
텍스트와 Answer Box가 서로 다르게 동작하기 시작한다.

**기본 배율은 `fit-page`** — 문서를 올린 직후 페이지 전체가 보인다.
`min(폭 비율, 높이 비율)` 이라 잘리는 부분이 없고, 페이지를 넘길 때마다 그 페이지 크기로 다시 계산된다.
`initialScale` prop 으로 `'fit-width'` 나 숫자를 줄 수 있다.

---

## 4. pdf.js 런타임 자산 ★ (한국어 PDF에서 글자가 사라지는 원인)

pdf.js는 자기 완결적이지 않다. 워커 외에 **런타임에 URL로 가져오는 파일**이 있다.

| 자산 | 없으면 생기는 일 |
| --- | --- |
| `pdf.worker.mjs` | **변환 자체가 안 된다** — `PdfWorkerNotConfiguredError` |
| `cmaps/` | **predefined CMap을 쓰는 CID 폰트**의 글자가 사라진다 — 한국어 교재의 실제 사례(§4.4) |
| `standard_fonts/` | 14개 표준 폰트(Helvetica 등)를 임베드하지 않은 PDF의 글자가 사라진다 |
| `wasm/` | JBIG2·JPEG2000으로 압축된 스캔 이미지가 렌더되지 않는다 |
| `iccs/` | 색이 부정확해진다 (글자에는 영향 없음) |

**두 가지 제약이 겹쳐서 자산은 반드시 호스트가 공급해야 한다.**

1. **번들러는 *디렉토리* URL을 재작성하지 못한다.** 파일 URL은 되지만 디렉토리는 안 된다(실측).
   그래서 `cmaps/` 같은 폴더는 서빙 폴더로 복사하고 base URL을 주입하는 방법만 동작한다.
2. **라이브러리 빌드에서 `new URL(..., import.meta.url)` 은 자산을 base64로 인라인한다.**
   worker를 이렇게 자동 해석했더니 번들이 **3MB**로 불었고(`assetsInlineLimit: 0`·`external` 둘 다
   막지 못했다), 호스트의 pdfjs-dist와 다른 worker 빌드가 박히는 문제도 있었다.
   그래서 worker 자동 해석을 **제거**하고 `workerSrc` 를 필수 설정으로 바꿨다.
   (수정 후 번들 3MB → **10.5KB**)

앱에서는 두 방법 중 하나를 쓴다.

```ts
// (a) 번들러가 emit 하게 한다 — Vite/Nuxt 앱에서 정상 동작
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url'

// (b) 정적 파일로 서빙한다 — copy 스크립트가 함께 복사한다
const workerSrc = '/pdfjs/pdf.worker.mjs'
```

### 4.1 이 저장소(데모)
```bash
npm run copy:pdfjs   # {cmaps,standard_fonts,wasm,iccs}/ + build/pdf.worker.mjs → demo/public/pdfjs/
```
`npm run dev` 와 `postinstall` 이 자동 실행한다.

### 4.2 Nuxt 3 호스트 앱
```bash
# package.json
"postinstall": "node -e \"const{cpSync}=require('fs');for(const d of ['cmaps','standard_fonts','wasm','iccs'])cpSync('node_modules/pdfjs-dist/'+d,'public/pdfjs/'+d,{recursive:true});cpSync('node_modules/pdfjs-dist/build/pdf.worker.mjs','public/pdfjs/pdf.worker.mjs')\""
```
```ts
// plugins/pdf-canvas-kit.client.ts
import { configurePdfResources } from 'pdf-canvas-kit'

export default defineNuxtPlugin(() => {
  configurePdfResources({
    workerSrc: '/pdfjs/pdf.worker.mjs', // 필수
    cMapUrl: '/pdfjs/cmaps/',
    standardFontDataUrl: '/pdfjs/standard_fonts/',
    wasmUrl: '/pdfjs/wasm/',
    iccUrl: '/pdfjs/iccs/',
  })
})
```
**경로 끝의 슬래시는 필수다.** pdf.js가 파일명을 그대로 이어 붙인다.

`cMapUrl` 미설정 시 `pdfResourceParams()`가 콘솔에 경고를 1회 낸다.
조용히 글자가 사라지는 것보다 시끄러운 게 낫다는 판단이다
([src/core/pdf/resources.ts](src/core/pdf/resources.ts)).

### 4.4 확인된 사례 — 한국어 교재에서 글자가 사라짐

실제 교재(48페이지)로 확정한 원인이다. **`cMapUrl` 누락.**

폰트 35종이 모두 `KSCms-UHC-H` 인코딩을 쓴다. 이건 Adobe **predefined CMap**이고,
pdf.js가 `cmaps/KSCms-UHC-H.bcmap` 파일을 fetch해야 한다.
설정하지 않으면 pdf.js가 폰트 변환 단계에서 실패하고, 이미지·도형만 남은 페이지가 나온다.

| | 잉크(비백색 픽셀) | 텍스트 추출 |
| --- | --- | --- |
| `cMapUrl` 설정 | 8.14% | 568자 |
| `cMapUrl` 없음 | 3.70% | 21자 |

**중요한 오해 하나** — 폰트가 임베드돼 있어도 CMap이 필요할 수 있다.
이 교재는 `FontFile3`(임베드 CFF) 38개를 가지면서 **인코딩 테이블만 외부 참조**한다.
"임베드 폰트니까 CMap은 필요 없다"는 추론은 틀렸다.

`Identity-H` 인코딩(브라우저 print-to-PDF가 만드는 방식)은 CID를 GID로 직결하므로
CMap 파일이 필요 없다. **그래서 합성 픽스처로는 이 문제가 재현되지 않는다** —
`demo/fixtures/korean.pdf` 는 `Identity-H` 다. predefined CMap 경로는 실제 교재로 확인해야 한다.

### 4.3 글자가 안 보일 때 진단 순서

`/spike/` 화면의 **폰트 · 텍스트 진단** 패널을 본다.

패널이 pdf.js 경고를 집계해 **원인 코드로 번역**해준다.

| 진단 코드 | 의미 | 조치 |
| --- | --- | --- |
| `missing-cmap` | predefined CMap 데이터 없음 (§4.4) | `cMapUrl` 설정 + `cmaps/` 서빙 |
| `missing-standard-font` | 표준 14폰트 데이터 없음 | `standardFontDataUrl` 설정 |
| `missing-wasm` | JBIG2/JPEG2000 디코더 없음 | `wasmUrl` 설정 |
| `font-load-failed` | 그 외 폰트 실패 | 폰트 손상 가능. `?fontface=off` 비교 |

경고가 없는데도 안 보이면:

| 관측 | 해석 |
| --- | --- |
| `텍스트 0자` | PDF에 텍스트 객체가 없다(스캔 이미지). 정상 — 글자가 사라진 게 아니다 |
| 문자 수 정상, 경고 없음, 안 보임 | 흰 오버레이·클리핑 등 렌더 외 요인. `?fontface=off` 로 비교 |
| `?resources=off` 와 결과가 같다 | 이 PDF는 `Identity-H` 라 CMap이 불필요하다. 원인은 다른 곳 |

진단 스위치:
- `?resources=off` — CMap·표준폰트 URL 없이 렌더(수정 전 상태 재현)
- `?fontface=off` — FontFace API 대신 글리프 아웃라인으로 렌더
- `?targetPx=1240&mime=image/png&quality=0.9` — 해상도·포맷 즉시 비교

---

## 5. 렌더링 (실측 근거)

`RENDER_DEFAULTS` 값은 추측이 아니라 측정 결과다.
**headless Chrome(GPU 비활성) · A4 100페이지 벡터 텍스트 PDF** 기준:

| 포맷 · 해상도 | 총 소요 | 페이지당 | 이미지 용량 |
| --- | --- | --- | --- |
| **jpeg q.85 · 1654px (기본값)** | **1.72초** | **17.2ms** | **399KB** |
| jpeg q.75 · 1654px | 1.73초 | 17.3ms | 329KB |
| png · 1654px | 1.76초 | 17.6ms | 482KB |
| webp q.85 · 1654px | 11.5초 | 115.1ms | 225KB |
| jpeg q.85 · 1240px | 0.92초 | 9.2ms | 268KB |

**WebP를 쓰지 않는다**: 용량은 44% 작지만 인코딩이 6.7배 느리다.
100페이지에서 11.5초는 교사가 업로드하고 기다리는 시간이다.

**측정 편향**: 픽스처가 벡터 텍스트라 무손실 PNG에 유리하게 나온 값이다.
스캔 PDF·사진 문서에서는 PNG가 크게 불리해지고 JPEG의 우위가 더 벌어진다.
반대로 얇은 선 도면에서는 JPEG 링잉이 생길 수 있다(PLAN Q18).

**해상도를 바꿔도 객체 좌표는 움직이지 않는다.** 좌표는 pt이고 배경 픽셀 크기는
품질 판단에만 쓰인다(§6.4). `targetPx`를 낮추는 건 안전한 조정이다.

---

## 6. 좌표계 ★

버그가 가장 많이 나는 지점이므로 규칙이 엄격하다. 상세는 PLAN 5장.

### 6.1 단위
저장되는 좌표는 **pt(1/72인치), 페이지 로컬, 좌상단 원점, y-down**뿐이다.
정규화 비율(0~1)이 아니고 화면 px도 아니다.

PDF 어노테이션 도메인의 표준이며(PDF `/Rect`, pdf-lib, Acrobat),
"최소 80×32pt" 같은 기획 제약을 곱셈 없이 검증할 수 있다.

### 6.2 배율은 한 곳에만
```html
<div class="pck-page-frame" style="width:476px; height:674px">   <!-- size × scale -->
  <div class="pck-page" style="width:595px; height:842px;         /* pt를 px로 그대로 */
                               transform: scale(0.8);
                               transform-origin: top left">
    <div class="pck-obj" style="left:120px; top:300px">…</div>    <!-- 곱셈 없음 -->
  </div>
  <svg class="pck-overlay">…</svg>                                <!-- scale 밖 -->
</div>
```

- 객체 렌더 컴포넌트는 `scale`을 **모른다**. `left: rect.x + 'px'` 로 끝난다
- 그래서 곱셈 누락·이중 적용이 구조적으로 불가능하다
- **선택 핸들은 `scale` 밖 오버레이**에 그린다. 그래야 어느 배율에서도 8px을 유지한다
- `pck-page-frame`이 `size × scale`을 실제 크기로 잡는다. `transform`은 레이아웃 크기에
  영향을 주지 않으므로, 이 래퍼가 없으면 스크롤 범위가 틀어진다

### 6.3 변환 함수는 4개뿐
[src/core/geometry/units.ts](src/core/geometry/units.ts) (M2에서 구현)

```ts
clientToPage(p, viewport)        // 마우스 이벤트 → pt
pageToFrame(p, viewport)         // pt → CSS px (오버레이 전용)
rectToFrame(r, viewport)         // 같음, rect 단위
clientDeltaToPage(d, scale)      // 드래그 델타
```

변환은 `getBoundingClientRect()` 기준이다. **`scrollLeft`·`offsetTop`을 더하지 않는다** —
스테이지 스크롤·sticky 툴바·호스트 레이아웃을 전부 합산해야 맞는데 하나만 빠져도 어긋난다.

`objects/*.vue` 에서 이 모듈 import는 ESLint로 막혀 있다.

### 6.5 한글 IME 와 인라인 편집

텍스트 인라인 편집은 `contenteditable` 이다. **조합 중에는 DOM을 덮지 않는다** —
`compositionstart`~`compositionend` 사이에 `textContent` 를 다시 쓰면 조합이 끊겨
한글이 한 글자씩 사라진다.

두 지점에서 이를 지킨다 (`src/vue/editor/objects/TextObjectView.vue`).

| 지점 | 규칙 |
| --- | --- |
| `input` 이벤트 | `composing` 이면 커밋하지 않는다. `compositionend` 에서 한 번에 보낸다 |
| 문서 → DOM `watch` | 편집 중·조합 중이면 건너뛴다. 그러지 않으면 캐럿이 맨 앞으로 튄다 |

`<textarea>` 를 겹치는 방식은 쓰지 않는다. 폰트·행간·정렬을 픽셀 단위로 맞춰야 하고
배율이 걸린 상태에서 캐럿이 어긋난다.

### 6.4 배경 이미지와 좌표의 관계
배경은 `page.size`(pt)를 100% 채운다. `naturalWidth/Height`는 **품질 판단에만** 쓴다.
즉 배경 픽셀 크기가 좌표계에 영향을 주지 않으므로, 나중에 해상도를 바꿔 다시 래스터화해도
객체 위치는 그대로다. pt 좌표계를 택한 실질적 이득이다.

---

## 7. Ports — 호스트가 주입하는 것

라이브러리는 서버 통신·파일 변환·영속화를 직접 하지 않는다.

| Port | 책임 | 내장 기본값 |
| --- | --- | --- |
| `AssetPort` | 페이지 이미지를 어디에 둘지 | `createBlobAssetPort()` — 메모리, 세션 한정 |
| `ConverterPort` | 문서 → 페이지 이미지 | `createPdfjsConverter()` — **PDF만** |
| `StoragePort` | 문서 저장 | `noopStoragePort()` — 저장 안 함 |
| `I18nPort` | 문구 | 내장 ko/en |

### 7.1 AssetPort와 blob 안전장치
`persist()`는 `origin`을 **정직하게** 반환해야 한다.

| origin | 의미 |
| --- | --- |
| `blob` | `URL.createObjectURL`. 새로고침 시 소멸, **저장 불가** |
| `inline` | base64 data URL. 문서 JSON에 그대로 실린다 |
| `remote` | 업로드 완료. JSON에는 `assetId` + `url`만 |

`serializeDoc()`은 `origin: 'blob'` 배경을 만나면 **에러를 던진다**.
blob URL을 저장하면 다음 세션에 죽은 링크가 되므로, 저장 전에
`promoteBackgrounds()`로 승격해야 한다. blob port가 `'inline'`으로 위장하면
이 가드가 무력화되므로 하지 않는다.

### 7.2 DOC/PPT
`createPdfjsConverter().supports()`가 `false`를 반환한다. 브라우저에서 DOCX/PPTX를
신뢰성 있게 렌더할 방법이 없기 때문이다. 서버 컨버터를 `ConverterPort`로 주입해야 한다.

---

### 7.4 페이지 이미지 업로드 (Q11 결정: S3)

라이브러리는 AWS SDK를 번들에 넣지 않는다. SDK가 크고, 브라우저에서 직접 S3에 쓰려면 자격증명이
필요한데 그건 서버가 발급하는 presigned URL로 해결하는 것이 표준이다. 자격증명을 클라이언트에 두는
구현을 제공하면 잘못된 사용을 유도한다.

```ts
// (a) presigned URL 방식 — 가장 흔한 형태
import { createS3AssetPort } from 'pdf-canvas-kit'

const asset = createS3AssetPort({
  async getUploadUrl({ pageId, mime }) {
    const r = await fetch('/api/uploads', {
      method: 'POST',
      body: JSON.stringify({ pageId, mime }),
    })
    return r.json() // { uploadUrl, publicUrl, assetId }
  },
  deleteAsset: (id) => fetch(`/api/uploads/${id}`, { method: 'DELETE' }).then(() => undefined),
})
```

```vue
<!-- (b) 업로드 경로가 완전히 다른 제품 — 함수만 넘긴다 -->
<PDFCanvasEditor :upload-file="myUploader" />
```

`uploadUrl` 과 `publicUrl` 을 나눠 받는다. presigned URL에는 만료되는 서명 쿼리가 붙으므로
문서에 저장되는 값은 `publicUrl` 이다.

네트워크 오류와 5xx만 재시도한다(기본 2회, 지수 백오프). 4xx는 다시 시도해도 같은 결과다.

### 7.5 저장 파이프라인

```
문서 변경 → engine.doc.subscribe → saver.schedule(doc)
                                       │ 5초 디바운스 (최대 지연 30초)
                                       ▼
                                  storage.save(doc)
                                       │ 실패 → 지수 백오프 3회 → error 배지
                                       ▼
                                  savedSnapshot 갱신
```

`beforeunload` 와 `visibilitychange` 에서 `flushSave()` 를 부른다. 모바일 브라우저는 탭을 닫을 때
`beforeunload` 를 부르지 않는 경우가 있어 후자도 함께 듣는다.

**최대 지연이 필요한 이유**: 디바운스만 두면 사용자가 계속 타이핑하는 동안 저장이 무한히 밀린다.
첫 변경으로부터 30초가 지나면 타이핑 중이라도 한 번 저장한다.

**현재는 `createConsoleStoragePort()` 가 기본이다** (PLAN 18.2). 파이프라인은 실제와 같은 조건으로
돌고 저장 대상만 콘솔이 된다. 실서버가 준비되면 이 port만 교체된다.

**blob 배경 가드는 우회하지 않는다.** 저장 전에 `promoteBackgrounds(doc, assetPort)` 로
승격해야 한다(§7.1). 승격은 사용자 편집이 아니므로 히스토리에 남기지 않는다.

### 7.7 프로토타입 저장 ⚠️ (임시)

**`src/prototype/` 은 실서버가 붙으면 통째로 삭제한다.** 자세한 절차는 그 안의 `README.md`.

상단바 [내보내기] 버튼이 [저장 (프로토타입)] 으로 대체돼 있다 — 과제 생성 API가 없어 내보내기를
누르면 빈 팝업만 뜨기 때문이다. 검증 게이트와 `ExportDialog` 는 그대로 남아 있고,
`requestExport()` 는 expose로 공개돼 있으므로 호스트가 직접 부를 수 있다 (PLAN 18.5).

```ts
// localStorage 에 문서 + 이미지(base64) 저장
await savePrototype(doc) // pdf-canvas-kit.images / pdf-canvas-kit.doc 두 키
// 되읽기 — pck-local: 참조를 base64로 복원해 렌더 가능한 문서를 준다
const doc = loadPrototype()
```

⚠️ localStorage는 오리진당 5~10MB다. **약 9~18페이지에서 한계에 닿고** 초과하면
`PrototypeQuotaError` 를 던진다. 실제 제품이 이 방식으로 갈 수는 없다(PLAN Q11에서 S3를 택한 이유).

### 7.6 패널 폭 (Q17)

고정 폭으로 시작하고, 패널 사이 핸들을 드래그하면 조정된다.
**한 번이라도 조정하면** `localStorage['pck.panelSizes.v1']` 에 남아 같은 브라우저에서 복원된다.
핸들 더블클릭으로 기본값 복귀.

조정한 적이 없으면 저장하지 않는다 — 제품 기본값을 나중에 바꿨을 때, 손대지 않은 사용자는
새 기본값을 받고 직접 맞춘 사용자는 자기 값을 유지해야 한다.

폭은 CSS 변수로 내려보내므로 레이아웃 규칙을 CSS와 JS 두 곳에서 정의하지 않는다.

## 7.3 내보내기 경계

편집기는 **검증만** 하고 `request-export` 를 발행한다. 그 뒤는 호스트 몫이다.

```
편집기: guardExport(doc)
   ├─ 실패 → 팝업 안 열고 문제 객체로 이동·선택·스크롤
   └─ 통과 → request-export { doc, publicDoc, validation }
                    │
호스트: 과제 생성 API · Class 목록 · 링크·QR 발급
                    │
        (옵션) <ExportDialog :result="{ url, qrUrl }" />
```

`ExportDialog` 는 **옵션 컴포넌트**다. 폼 상태만 관리하고 `submit` 으로 `ExportSettings` 를
넘긴다. 호스트가 자기 팝업을 써도 검증 게이트는 동일하게 통과한다.

QR 인코더를 번들에 넣지 않는다 — QR 이미지 URL도 호스트가 준다.

```ts
import { ExportDialog, type ExportSettings } from 'pdf-canvas-kit/vue'

async function onSubmit(settings: ExportSettings) {
  const { url, qrUrl } = await api.createAssignment({ ...settings, doc: payload.publicDoc })
  result.value = { url, qrUrl }
}
```

## 8. 디렉토리

```
src/
├─ index.ts                  공개 API (프레임워크 무관)
├─ core/                     ★ Vue import 금지
│  ├─ model/types.ts         문서·객체 타입
│  ├─ config/defaults.ts     ★ 모든 튜너블 상수
│  ├─ geometry/
│  │   paperSize.ts           pt → "A4 세로"
│  │   units.ts              ★ 좌표 변환 4함수
│  │   constrain.ts            클램프·최소 크기·드래그 rect
│  │   handles.ts              9방향 리사이즈 수학
│  │   hitTest.ts              회전 고려 히트 테스트·마퀴
│  ├─ store/
│  │   createStore.ts         옵저버블 (40줄)
│  │   history.ts             undo/redo 역연산 스택
│  ├─ commands/               doc.ts pages.ts objects.ts — 모든 문서 변경의 단일 창구
│  ├─ engine.ts              ★ 문서·히스토리·import 파이프라인 (프레임워크 무관)
│  ├─ i18n/                   ko.ts en.ts createI18n.ts
│  ├─ interaction/
│  │   tools.ts                도구 정의·도구별 객체 생성
│  │   pointerMachine.ts      ★ 드래그 상태 머신 (DOM 비의존)
│  ├─ pdf/
│  │   resources.ts          ★ worker·CMap·wasm 설정
│  │   loadPdf.ts            문서 열기 + 실패 분류
│  │   rasterize.ts          페이지 → 이미지 blob
│  │   pdfjsConverter.ts     ConverterPort 구현
│  │   diagnose.ts           텍스트·폰트 진단
│  ├─ assets/
│  │   blobAsset.ts          세션 한정 AssetPort (기본값)
│  │   s3Asset.ts           ★ presigned URL PUT
│  │   promoteBackgrounds.ts blob → 영속 배경 승격
│  ├─ autosave/
│  │   debouncedSaver.ts     5초 디바운스 + 최대 지연 + 재시도
│  ├─ model/numbering.ts     문항 번호 (위치에서 파생)
│  ├─ ports/                 호스트 주입 인터페이스
│  ├─ validation/
│  │   rules.ts             ★ 검증 규칙 — 인스펙터와 내보내기가 공유
│  │   exportGuard.ts        내보내기 게이트 + publicDoc 생성
│  └─ grading/
│      normalize.ts          공백·대소문자·NFKC 정규화
│      score.ts              문항·응시 채점 (서버와 공유 가능)
├─ dom/                    ★ 프레임워크 무관 렌더 층 (PLAN 20.2)
│  reactive.ts               ★ signal · computed · effect · watch · batch · scope (§12)
│  h.ts                      ★ el · svg · when · list — DOM 바인딩 (§13)
│  editor/                    재작성된 UI (구 src/vue/editor/**)
│    canvasStage.ts            스크롤 컨테이너 — 한 페이지만 (D8)
│    stageArea.ts             ★ 컨트롤러 ↔ 렌더 층이 만나는 유일한 지점
│    pageFrame.ts            ★ 두 겹 구조 — 프레임(size×scale) + 페이지(pt+scale)
│    pageBackground.ts         배경 이미지 또는 빈 종이
│    selectionOverlay.ts      ★ 스케일 밖 — 선택 테두리·마퀴
│    resizeHandles.ts         ★ 9방향 + 회전. 래퍼 회전 · 핸들 역회전
│    editorShell.ts         ★ 3분할 레이아웃 조립 — 컨트롤러를 받아 화면 전체를 만든다
│    topBar.ts titleInput.ts saveBadge.ts toolbar.ts pageMeta.ts
│    pageThumbList.ts stageControls.ts pageContextMenu.ts emptyState.ts
│    dialogs/{confirmDialog,uploadDialog}.ts
│    inspector/inspector.ts   ★ 유형별 분기 — when 조건을 **유형**으로 둔다 (§13.2)
│    inspector/fields.ts       공용 폼 위젯 — 패널 6개가 공유
│    inspector/{objectPanels,boxStylePanel}.ts
│    objects/customObjectView.ts ★ 기본 틀 + 콘텐츠 컨테이너 (§16)
│    objects/*.ts            ★ pt를 px로 그대로. units import 금지
├─ controller/             ★ 프레임워크 무관 컨트롤러 (§14). README.md 에 이식 대응표
│  editor.ts                 ★ 루트 — 조립·단축키·액션·검증
│  stage.ts                   배율·맞춤·앵커 줌
│  pageViewport.ts           ★ frameRect 캐시·무효화 (defer 필수)
│  pointerTool.ts             포인터 → 상태 머신
│  pageNav.ts pan.ts panelSizes.ts pageReorder.ts
│  engineState.ts i18n.ts editorState.ts textEntry.ts
│  ├─ PDFCanvasEditor.vue     3분할 레이아웃 + 뷰 상태
│  ├─ composables/
│  │   useEngine.ts           engine → Vue reactive 브릿지
│  │   useStage.ts           ★ scale · fitMode · 앵커 줌
│  │   usePan.ts              Space/중간버튼 드래그 팬
│  │   usePageNav.ts          currentPageIndex 전환·클램프
│  │   usePageViewport.ts     ★ frameRect 캐시·무효화
│  │   usePointerTool.ts       포인터 → 상태 머신 바인딩
│  │   usePanelSizes.ts       패널 폭 리사이즈 + localStorage
│  │   usePageReorder.ts      썸네일 드래그 순서 변경
│  └─ editor/                 TopBar · PageThumbList · CanvasStage · PageFrame
│                             StageControls · Toolbar · UploadDialog · EmptyState
│                             SelectionOverlay · ResizeHandles · objects/*.vue
│                             inspector/*.vue (유형별 패널)
│                             PageContextMenu · dialogs/ConfirmDialog
├─ prototype/               ⚠️ 임시 — 실서버 연결 시 삭제
│  localStorageStore.ts       images / doc 두 키 저장·복원
└─ styles/
   tokens.css                ★ CSS 변수
   editor.css                 레이아웃·크롬

demo/          :3100 개발 서버 (spike / editor / viewer / checks)
scripts/       픽스처 생성 · pdf.js 자산 복사 · 헤드리스 검증(run-checks.mjs)
```

---

## 9. 타입 사용 (외부에서)

모든 공개 타입은 `src/index.ts`에서 재export된다.

```ts
import type {
  PDFCanvasDoc, PDFCanvasPage, PDFCanvasObject,
  ShortAnswerBox, DropboxAnswerBox, EssayAnswerBox,
  PageBackground, Rect, Size, Pt,
  AssetPort, ConverterPort, StoragePort, I18nPort,
  RasterPage, ConvertProgress,
} from 'pdf-canvas-kit'

import {
  createPdfjsConverter, createBlobAssetPort, configurePdfResources,
  LIMITS, EDITOR_DEFAULTS, RENDER_DEFAULTS,
  formatPaperLabel, ConvertError,
} from 'pdf-canvas-kit'
```

- 객체는 `type` 필드로 판별하는 **discriminated union**이다.
  `if (o.type === 'answer.dropbox')` 후에는 `o.choices`가 좁혀진다
- `LIMITS` 등은 `as const`라 리터럴 타입이 유지된다
- 오류는 `ConvertError` 인스턴스이며 `code`로 분기한다
  (`unsupported-format` · `file-too-large` · `page-limit` · `encrypted` · `corrupt` · `aborted`)

---

## 10. 아키텍처 규칙 (ESLint 강제)

| 규칙 | 대상 | 왜 |
| --- | --- | --- |
| `vue`·`@vueuse/*`·`*.vue` import 금지 | `src/core/**` | 코어를 프레임워크 무관하게 유지(PLAN 2.1) |
| `geometry/units` import 금지 | `src/vue/editor/objects/**` | 객체 렌더는 pt를 px로 그대로 쓴다(§6.2) |
| `no-floating-promises` | 전체 | PDF 변환 비동기 누락 방지 |
| `consistent-type-imports` | 전체 | 타입 전용 import를 런타임에서 제거 |

문서로 적은 규칙은 잊히지만 린트는 잊히지 않는다.

---

## 10.1 드래그 반응성 — rAF를 쓰지 않는다

`pointermove` 를 `requestAnimationFrame` 으로 묶지 않는다.

rAF 콜백에서 반응형 값을 바꾸면 **그 프레임의 페인트에 반영되지 않고 다음 프레임에 들어간다.**
실제로 리사이즈·이동이 포인터를 한 박자 늦게 따라오는 것이 눈에 보였다(PLAN 18.6).

브라우저가 이미 `pointermove` 를 프레임당 한 번 정도로 합쳐 보내고, 객체 상한이 페이지당 30개·
문서 200개라 즉시 처리해도 계산량이 문제되지 않는다.

## 10.3 회전된 객체의 리사이즈

회전이 있으면 두 가지를 더 해야 한다 (`core/geometry/handles.ts`).

| 단계 | 이유 |
| --- | --- |
| 화면 델타를 `-rotation` 역회전 | 45도 돌아간 객체에서 오른쪽으로 끌면 로컬 기준으로는 대각선이다 |
| `anchoredRect` 로 새 위치 계산 | 축 방향 보정만으로는 앵커(잡은 핸들의 반대편)가 미끄러진다 |

`anchoredRect` 는 축이 아니라 **중심과 앵커**로 계산한다.

```
1. 시작 중심 → 앵커 오프셋을 회전 적용  → 앵커의 절대 위치
2. 새 크기의 같은 오프셋도 회전 적용
3. 새 중심 = 앵커 − 새 오프셋
4. 새 좌상단 = 새 중심 − 새 크기/2
```

같은 저장소 `frontend-service` 의 `useDraggableResize.anchorResizeRect` 와 같은 접근이다
(PLAN 18.7).

**회전된 객체는 페이지 경계 클램프를 건너뛴다.** `constrainRect` 는 축 정렬 rect를 가정하는데
회전된 객체의 실제 점유 영역은 그보다 크다. 클램프하면 앵커가 어긋나 리사이즈가 튄다.

**이동에는 역회전을 적용하지 않는다.** 화면에서 끌린 방향 그대로 움직이는 것이 자연스럽다.

## 10.2 회전과 오버레이

핸들은 배율 transform 밖에 있으므로(§6.2) 객체가 회전하면 **오버레이도 따로 회전시켜야 한다.**

핸들 좌표를 하나씩 회전 계산하지 않는다. 감싸는 래퍼에 `rotate()` 를 걸고 핸들 자신은
역회전시킨다 — 핸들 위치는 객체를 따라 돌고 모양은 화면 기준 정사각형을 유지한다.
기울어진 핸들은 잡기 어렵다.

회전 원점은 객체 렌더와 같은 `center` 다. 다르면 테두리가 객체에서 어긋난다.

## 10.4 secure context 의존 API ⚠️

`https://` 와 `localhost` 만 secure context다. **LAN 주소(`http://10.x.x.x:3100`)는 아니다.**
dev 서버를 다른 기기에서 열거나 사내 HTTP 환경에 배포하면 다음 API가 사라진다.

| API | 대체 | 위치 |
| --- | --- | --- |
| `crypto.randomUUID` | `crypto.getRandomValues` 로 UUID v4 생성 | `core/util/id.ts` → `createId()` |
| `navigator.clipboard` | `<textarea>` + `execCommand('copy')` | `core/util/id.ts` → `copyText()` |

**id 생성은 반드시 `createId()` 를 쓴다.** `crypto.randomUUID()` 를 직접 부르면 insecure origin에서
`TypeError` 가 나고, id를 만드는 모든 동작(페이지 추가·객체 생성·보기 추가)이 죽는다.

localStorage는 오리진별로 분리된다 — `localhost:3100` 과 `10.1.0.112:3100` 의 저장 데이터는
서로 보이지 않는다. 프로토타입 저장과 패널 폭이 주소마다 따로 쌓이는 것은 정상이다.

## 11. 자동 테스트가 없다는 것 (의도)

테스트 러너를 도입하지 않았다(PLAN D17). 대신:

1. **TS strict + `noUncheckedIndexedAccess`** — `pages[i]`·`objects[i]` 접근이 많아 실효가 크다
2. **ESLint 아키텍처 규칙** — §10
3. **`/checks/` 검증 화면** — 순수 함수·반응성 결과를 표로 렌더, 불일치 행을 빨갛게.
   **234 케이스 / 33 그룹** (순수 71 + 반응성 35 + DOM 35 + 컨트롤러 35 + 렌더 38 + 셸 20)

**커밋 전에 이걸 돌린다.** 브라우저를 열지 않아도 된다.

```bash
npm run checks                    # 234 / 234 passed · 33 groups · ok  (실패 시 exit 1)
PCK_BREAKDOWN=1 npm run checks    # 파일별 내역까지 출력
```

**케이스 수를 문서에 적을 때는 위 명령으로 확인한다.** 이 문서에 오래 적혀 있던 "79 케이스" 는
실제(101)와 달랐다 — 케이스를 추가하면서 수치를 갱신하지 않은 결과였고, 그 뒤 계산이 전부
어긋났다(2026.08.20 정정).

케이스는 `demo/checks/allCases.ts` 가 단일 출처다 —
**화면(`main.ts`)과 헤드리스 러너(`scripts/run-checks.mjs`)가 같은 배열을 소비한다.**
새 그룹은 `allCases.ts` 에만 추가한다. 두 곳에서 각자 합치면 한쪽에만 있는 그룹이 생긴다.

| 파일 | 담는 것 |
| --- | --- |
| `demo/checks/cases.ts` | 순수 함수 케이스 — 입력 → 출력 한 줄 |
| `demo/checks/reactiveCases.ts` | 반응성 케이스 — 상태 변화 **순서**를 확인 |
| `demo/checks/domCases.ts` | 렌더 층 케이스 — 바인딩·조건부·**키 리스트 재조정**. DOM 이 필요하다 |
| `demo/checks/controllerCases.ts` | 컨트롤러 조립 — signal 배선·액션. DOM 이 필요하다 |
| `demo/checks/objectRenderCases.ts` | 객체·페이지 렌더 — pt→px, SVG NS, 두 겹 구조. DOM 이 필요하다 |
| `demo/checks/shellCases.ts` | 편집기 셸 조립 — 컨트롤러↔컴포넌트 계약. DOM 이 필요하다 |
| `demo/checks/allCases.ts` | 여섯을 합친 단일 출처 |

DOM 케이스는 헤드리스에서 **happy-dom**(dev 의존성)으로 돈다. 없으면 `h.ts` 전체가 게이트에서
빠지는데, 키 기반 재조정은 눈으로 확인하기 가장 어려운 코드라 그건 받아들일 수 없었다.

⚠️ **happy-dom 은 `getBoundingClientRect()` 가 전부 0 이다.** 좌표 변환·맞춤 배율·줌 앵커링은
헤드리스로 검증되지 않는다 — 실제 레이아웃이 필요하다.

번들러로 **vite** 를 쓴다(`scripts/run-checks.mjs`). esbuild 를 직접 부르는 편이 짧지만
esbuild 는 이 저장소의 의존성이 아니며 — vite 8 은 esbuild 를 끌고 오지 않는다 —
`npx esbuild` 는 매번 원격에서 받아온다. 검증 스크립트가 네트워크에 의존하면 안 된다.

**남는 리스크**: 줌·팬·스크롤·IME 는 실제 브라우저 레이아웃에 의존해 이 방식으로 덮이지 않는다.
수동 확인만 가능하다. 그래서 코어 순수 함수의 시그니처 변경은 보수적으로 한다.

---

## 12. 반응성 프리미티브 ★ (UI 층의 바닥)

`src/dom/reactive.ts` (PLAN D20). UI 가 프레임워크 없이 DOM 을 직접 바인딩하므로, 그 바닥에
signal 이 있다. API 모양은 Vue 의 `ref`·`computed`·`watch` 와 일부러 같다.

| 함수 | 역할 |
| --- | --- |
| `signal(v)` | 읽고 쓰는 반응형 값 |
| `computed(get)` / `computed(get, set)` | 파생 값. **지연 계산 + 캐시** |
| `effect(fn)` | 의존성 변경마다 재실행. 즉시 1회 실행. DOM 바인딩이 전부 이걸 쓴다 |
| `watch(src, cb, {immediate})` | `src` 만 구독한다. 콜백이 읽은 값은 의존성이 아니다 |
| `batch(fn)` | 여러 대입을 1회 갱신으로 합친다 |
| `untrack(fn)` | 의존성으로 잡지 않고 읽는다 |

### 12.1 함정 두 개 — Vue 에서 옮겨온 코드가 여기서 조용히 죽는다

**① 깊은 반응성이 없다.** Vue 의 `ref(obj)` 는 내부를 프록시로 감싸므로 `x.value.a = 1` 이
반응성을 일으킨다. **여기서는 아무 일도 일어나지 않는다.**

```ts
const view = signal(createViewState())
view.value.activeTool = 'select'     // ✗ 조용히 실패
```

필드마다 signal 을 둔다. `Map`·`Set`·배열도 같다 — 내용을 변형하지 말고 **새 값을 대입**한다.

```ts
const activeTool = signal<ToolId>('select')   // ✓
previewRects.value = new Map(next)            // ✓ .set() 이 아니라 대입
```

프록시를 두지 않은 이유: 프록시는 "왜 이건 반응하고 저건 안 하나" 를 런타임에만 알 수 있게 만든다.
얕은 것만 있으면 규칙이 하나다 — **대입해야 알린다.**

**② effect 가 동기다.** Vue 는 마이크로태스크 큐에 모으고, 그래서 레이아웃을 읽는 코드가
`flush: 'post'` 를 필요로 했다. 여기서는 대입이 끝나는 순간 DOM 이 이미 갱신돼 있으므로
**다음 줄에서 바로 `getBoundingClientRect()` 를 읽어도 된다** (좌표계가 여기에 의존한다 — §6.3).

한 제스처가 여러 signal 을 건드릴 때는 `batch()` 로 묶어 중간 상태 렌더를 건너뛴다.

### 12.2 왜 VDOM 을 만들지 않았나

바뀐 노드만 건드리므로 `contenteditable` 의 IME 조합·캐럿을 깨뜨릴 표면이 **애초에 없다**(§6.5).
상태 변경마다 페이지 전체를 다시 그리는 방식은 객체 상한이 30개라 성능은 되지만,
편집 중인 텍스트 노드를 매번 덮어써 한글 입력이 깨진다. 상세는 PLAN D20.

`reactive.ts` 는 `src/index.ts` 에 내보내지 않는다 — 라이브러리 소비자가 아니라 UI 층이 쓰는 것이다.
`/checks/` 는 내부 모듈을 직접 import 한다.

### 12.3 scope — 정리가 기본값

`effect` 와 `computed` 는 **열려 있는 `scope` 에 자기 정리 함수를 스스로 등록한다.**
컴포넌트가 dispose 를 반환하거나 모을 필요가 없다.

```ts
const [root, dispose] = scope(() => buildEditor(props))
container.append(root)
dispose()   // buildEditor 안에서 만든 effect·리스너 전부 정리
```

중첩된다 — 리스트 항목 하나를 지우면 그 항목의 effect 만 끊긴다.
`onCleanup(fn)` 으로 임의의 정리를 등록할 수 있고, scope 밖에서 부르면 아무 일도 하지 않는다.

**`computed` 도 등록한다.** 수동적이라 끊을 것이 없어 보이지만, 자기가 읽은 signal 의 구독 집합에
자신이 들어 있다. 리스트 항목마다 만든 computed 를 정리하지 않으면 문서 signal 이 지워진 항목의
computed 를 계속 붙든다.

---

## 13. DOM 바인딩 (`h.ts`)

Vue 템플릿을 대체한다. 템플릿 컴파일러도 VDOM 도 없다 — **바인딩마다 effect 하나**가 붙어
자기 노드만 갱신한다.

| 함수 | Vue 대응 |
| --- | --- |
| `el(tag, props, children)` | 엘리먼트 + 디렉티브 |
| `svg(tag, props, children)` | 같음, SVG 네임스페이스 |
| `when(cond, render)` | `v-if` |
| `list(items, key, render)` | `v-for` + `:key` |
| `text(value)` | `{{ }}` |

**컴포넌트는 `Element` 를 반환하는 평범한 함수다.** 클래스도 라이프사이클 훅도 없다.

```ts
function saveBadge(state: ReadSignal<SaveState>): HTMLElement {
  return el('span', { class: () => `pck-badge is-${state.value}` }, [() => label(state.value)])
}
```

**값 자리에 함수를 넣으면 반응형이 된다.** 정적인 값은 그대로 쓴다.

| 쓰는 법 | 결과 |
| --- | --- |
| `class: 'pck-page'` | 한 번만 설정 |
| `class: () => …` | 값이 바뀔 때마다 갱신 |
| `class: { 'is-on': () => sel.value }` | 조건이 바뀐 클래스만 토글 |
| 자식으로 `'제목'` | 정적 텍스트 |
| 자식으로 `() => doc.value.title` | 반응형 텍스트 노드 |

### 13.1 `attr` vs `prop` ★ — 추측하지 않는다

```ts
el('input', {
  attr: { type: 'text', 'aria-label': t('title'), placeholder: () => hint.value },
  prop: { value: () => title.value, disabled: () => readOnly.value },
})
```

| 쓰는 곳 | 예 |
| --- | --- |
| `attr` | `role` · `aria-*` · `data-*` · `type` · `placeholder` · `viewBox` |
| `prop` | 폼 컨트롤의 `value` · `checked` · `disabled` · `selectedIndex` |

Vue 는 이름을 보고 어느 쪽인지 추측한다. 그 추측이 어긋나면 **"input 에 타이핑한 뒤 값이
갱신되지 않는다"** 가 되고, 원인이 프레임워크 안쪽이라 찾기 어렵다. 호출부가 밝히면 그 종류의
버그가 존재할 수 없다.

`prop` 은 값이 실제로 달라졌을 때만 대입한다 — `input.value` 재대입은 캐럿을 끝으로 보낸다.

#### boolean 직렬화 — ARIA 는 규칙이 다르다 ★

| 값 | HTML 속성 (`disabled`) | `aria-*` |
| --- | --- | --- |
| `null` · `undefined` | 제거 | 제거 |
| `true` | `=""` (존재하면 참) | `="true"` |
| `false` | 제거 | **`="false"`** |
| 그 외 | `String(v)` | `String(v)` |

`aria-pressed=""` 는 유효하지 않다. 그리고 속성을 지우면 "눌리지 않음" 이 아니라 **"토글이 아님"**
이라는 다른 뜻이 되어 스크린리더가 토글 버튼을 일반 버튼으로 읽는다.

`applyAttr` 이 `aria-` 접두사를 보고 알아서 처리한다. 호출부에서 `String(x)` 을 하게 두면
네 곳 중 한 곳을 빠뜨린다 — 2026.08.20 에 실제로 그랬다(PLAN 20.11).

### 13.2 `when` 은 조건이 바뀔 때만 다시 그린다

`truthy → truthy` 는 재생성하지 않는다. 그래야 안에서 편집 중인 텍스트 노드가 살아남는다(§6.5).
사라질 때 그 안의 effect 는 자기 scope 와 함께 정리된다.

### 13.3 `list` 는 키로 재조정한다 ★

키가 같으면 노드를 재사용하고, 순서만 바뀌면 `insertBefore` 로 **옮긴다.**
그래서 페이지 순서를 바꿀 때 썸네일 이미지가 다시 로드되며 깜빡이지 않는다.

```ts
list(
  () => pages.value,
  (p) => p.id,
  (page, index) => pageThumb(page, index),   // 둘 다 signal 이다
)
```

`render` 가 항목과 인덱스를 **signal 로** 받는 것이 핵심이다. 키가 같고 내용만 바뀌면 노드를
다시 만들지 않고 그 signal 만 갱신하므로, 순서 변경은 DOM 이동만 일어난다.

### 13.4 SVG 는 `svg()` 로만

SVG 는 별도 네임스페이스라 `createElement` 로 만들면 **렌더되지 않는다.** 에러도 없이 안 보이므로
원인을 찾기 어렵다. 선택 오버레이·핸들이 SVG 이고(§6.2), 그 자식도 `svg()` 로 만들어야 한다.

### 13.5 `when`·`list` 가 앵커 주석을 남기는 이유

둘은 자기 위치에 `<!--when-->` · `<!--list-->` 주석 노드를 두고 그 뒤에 내용을 넣는다.
래퍼 엘리먼트를 쓰면 간단하지만, `pck-body` 가 grid 이므로 래퍼가 grid 항목이 되어 레이아웃이
깨진다. 주석은 레이아웃에 영향이 없다.

DOM 을 검사하는 코드(테스트·진단)는 주석 노드를 건너뛰어야 한다.

---

## 14. 컨트롤러 (`src/controller/`)

**동작이 여기 있다.** UI 컴포넌트는 signal 을 읽어 그리고 액션을 부를 뿐이다.
편집기 동작을 바꾸려면 컴포넌트가 아니라 이 디렉토리를 본다.

`src/core/` 와 다른 점: **DOM 을 안다.** 스크롤 컨테이너를 잡고 `getBoundingClientRect()` 를
읽고 `window` 리스너를 붙인다. 대신 프레임워크는 모른다 — ESLint 가 막는다(§10).

| 파일 | 담당 |
| --- | --- |
| `editor.ts` | ★ 루트. 조립·단축키·객체/페이지 액션·검증·내보내기 게이트 |
| `stage.ts` | 배율·맞춤 모드·앵커 줌·`scrollRectIntoView` |
| `pageViewport.ts` | ★ 프레임 위치 캐시와 무효화 (좌표 변환의 입력) |
| `pointerTool.ts` | 포인터 이벤트 → 상태 머신 → 커밋 |
| `pageNav.ts` | 현재 페이지 전환·클램프 |
| `pan.ts` | Space/중간버튼 드래그 팬 |
| `panelSizes.ts` | 패널 폭 리사이즈 + localStorage |
| `pageReorder.ts` | 썸네일 드래그 순서 변경 |
| `engineState.ts` | 엔진 → signal 브릿지 |
| `i18n.ts` · `editorState.ts` · `textEntry.ts` | 문구·뷰 상태 signal·입력 판정 |

### 14.1 렌더 층과의 계약

`createEditorController(props)` 가 `EditorController` 를 돌려준다. 렌더 층이 쓰는 것은
**signal(읽기)과 함수(액션)뿐**이다. 컨트롤러는 DOM 을 만들지 않는다.

엘리먼트는 렌더 층이 `ref` 콜백으로 넘긴다 — `setStageEl` · `setFrameEl` · `setPageListEl`.
스테이지는 문서에 페이지가 있는 동안만 존재하므로 한 번 넘기는 게 아니라 마운트가 바뀔 때마다
넘긴다.

### 14.2 `props` 계약 ★ — `doc` 은 controlled 가 아니다

`setProps()` 로 갱신되는 것과 **최초 1회만 읽는 것**이 나뉜다. React 는 렌더마다 `setProps` 를
부르므로 이 구분이 중요하다.

| prop | 갱신 |
| --- | --- |
| `locale` · `readOnly` · `autosave` · `on*` 콜백 | 반영된다 |
| `ports` · `uploadFile` | 반영된다 — 단 엔진에 이미 넘어간 port 는 교체되지 않는다 |
| **`doc`** · **`initialScale`** | **최초 1회만.** 이후 변경은 무시된다 |

⚠️ `<PDFCanvasEditor doc={doc} onChange={setDoc} />` 는 controlled 처럼 보이지만 아니다.
편집기가 문서를 소유하고 변경을 밖으로 밀어낼 뿐이다. 문서를 교체해야 하면 컴포넌트를 다시
마운트한다(React 는 `key` 변경). 이 계약을 바꿀지는 PLAN 20.8 에서 R8 로 미뤄 두었다.

### 14.3 이식 함정 (Vue → 여기)

전체 대응표는 [src/controller/README.md](src/controller/README.md). 조용히 실패하는 것 셋:

1. **깊은 반응성이 없다** — `view.value.activeTool = x` 는 아무 일도 하지 않는다(§12.1)
2. **`nextTick()` 이 사라진다** — effect 가 동기라 대입 직후 스타일이 갱신돼 있다
3. **레이아웃을 읽는 `watch` 는 `defer: true`** — 아니면 낡은 좌표를 캐시한다(§12.1 ②)

---

## 15. UI 문구 (`core/config/strings.ts`)

**i18n 시스템은 제거됐다** (PLAN D24, 2026.08.20). `I18nPort` · `createI18n` · ko/en 두 표 ·
locale 전환이 모두 없어지고, 문구 표 하나와 조회 함수만 남았다.

```ts
import { text } from 'pdf-canvas-kit'   // 내부에서는 core/config/strings
text('error.pageLimit')
text('error.exportBlocked', { count: 3 })   // {count} 자리를 채운다
```

`t` 가 컴포넌트·컨트롤러 시그니처에서 전부 사라졌다. 모듈 수준 조회이므로 배선이 없다.

### 15.1 문구 바꾸기

```ts
import { configureStrings } from 'pdf-canvas-kit'

// 앱 부트스트랩에서 한 번. 지정한 키만 덮는다.
configureStrings({ 'topbar.export': '과제로 내보내기' })
```

`configurePdfResources()` 와 같은 형태다 — 모듈 수준 설정을 한 번 주입한다.

⚠️ **반응형이 아니다.** 편집기가 떠 있는 상태에서 바꾸면 이미 렌더된 문구는 갱신되지 않는다.
검증·테스트에서는 `resetStrings()` 로 되돌려 상태가 새지 않게 한다.

없는 키는 **키 자체를 돌려준다.** UI 에 `topbar.export` 가 그대로 보이는 편이 빈 엘리먼트보다
발견하고 고치기 쉽다.

### 15.2 다국어를 나중에 다시 하는 이유

쓰이는 표가 하나였는데 추상화가 세 겹이었다. 그 배선 비용을 계속 내는 대신 걷어냈고, **문구가
컴포넌트에 흩어져 있지 않고 한곳에 모여 있는 것**이 나중에 제대로 설계할 때의 출발점이다.

컴포넌트에 하드코딩하는 안은 버렸다 — R4 에서 걷어낸 위반(캔버스 문구 3건이 한국어로 박혀 있어
`locale: 'en'` 에서도 한국어가 남았다)을 되돌리는 것이기 때문이다.

---

## 16. 커스텀 객체 (`core/objectTypes.ts`) ★

이 패키지가 그리는 것은 **기본 틀**뿐이다 — pt 사각형, 리사이즈 핸들, 배경·테두리(`BoxStyle`),
회전. 그 안에 무엇을 그릴지는 소비자가 정한다 (PLAN D25).

```ts
const shortAnswer = defineObjectType<{ answers: string[]; points: number }>({
  kind: 'answer.short',            // 문서에 저장. Editor↔Viewer 계약이다
  label: '단답형',                 // 툴바가 읽는다
  defaultSize: { w: 160, h: 40 },
  minSize: { w: 80, h: 32 },
  defaultData: () => ({ answers: [], points: 1 }),
  interactive: false,              // §16.2
  rotatable: false,
  validate: (d) => (d.answers.some((a) => a.trim()) ? null : ['정답을 입력하세요']),
  toPublic: ({ answers: _a, ...rest }) => rest,
})

<PDFCanvasEditor objectTypes={[shortAnswer]} />
<PDFCanvasViewer objectTypes={[shortAnswer]} />
```

**같은 레지스트리를 Editor 와 Viewer 에 넘긴다.** `kind` 가 둘 사이의 계약이다.

| 이 패키지가 아는 것 | 소비자가 아는 것 |
| --- | --- |
| 자리·크기·회전·배경·테두리 | `data` 의 내용 |
| 문서·페이지 한도 · 등록되지 않은 `kind` | `validate(data)` · `toPublic(data)` |
| 도구 목록(레지스트리에서 만든다) | 렌더 |

### 16.1 렌더 경로가 둘이다

| `render` | 누가 채우나 |
| --- | --- |
| 있다 | 렌더 층이 부른다 (vanilla) |
| 없다 | **컨테이너를 비워 두고 알린다.** 래퍼가 `createPortal` · `Teleport` 로 꽂는다 |

프레임워크 래퍼는 `render` 를 주지 않는다 — portal 은 컨테이너 노드에 컴포넌트를 꽂는 방식이라
렌더 층이 내용을 만들면 안 된다. 마운트 통지는 `onMountCustom(objectId, el)` 이고,
객체가 사라지면 `el: null` 로 한 번 더 불린다.

### 16.2 ★ 포인터 이벤트 소유권

편집기에서 콘텐츠는 기본적으로 `pointer-events: none` 이다. 클릭이 **객체 선택·드래그**로 가야
하기 때문이다 — 안쪽 `<input>` 이 포커스를 가로채면 객체를 옮길 수 없다.

| | 편집기 | 뷰어 |
| --- | --- | --- |
| 기본 | **프레임**이 먹는다 | 콘텐츠가 먹는다 |
| `interactive: true` | 콘텐츠가 먹는다 (테두리·핸들로만 선택) | 콘텐츠가 먹는다 |

### 16.3 ⚠️ `position: fixed` 는 갇힌다 — 우회 불가

콘텐츠는 페이지 컨테이너의 `transform: scale()` **안**에 있다. CSS 는 transform 이 걸린 조상을
`fixed` 의 containing block 으로 만들므로, 소비자 컴포넌트 안의 드롭다운·툴팁·모달이 화면
기준이 아니라 **프레임 기준으로 갇힌다.** 스펙이라 우회할 수 없다.

그런 UI 는 소비자가 자기 portal 로 `document.body` 에 띄운다.

반대로 배율이 콘텐츠를 함께 줄이는 것은 의도한 동작이다. 컨테이너 쿼리는 **pt 박스 크기**를
보므로 배율과 무관하게 레이아웃이 일정하다.

### 16.4 리사이즈 리플로우는 공짜다

프레임의 `width`/`height` 가 pt 인라인 스타일이고 드래그 중에는 `previewRect` 를 쓴다.
핸들을 끌면 프레임 폭이 실시간으로 바뀌고 콘텐츠는 평범한 DOM 자식이므로 **flex 줄바꿈이
알아서 일어난다.**

⚠️ 드래그 중 rAF 코얼레싱을 쓰지 않는 판단(§10.1)은 **가벼운 박스를 전제로 했다.** 무거운
소비자 컴포넌트가 매 `pointermove` 마다 리플로우하면 그 판단이 되돌아올 수 있다 — 실측 필요.

### 16.5 등록되지 않은 `kind`

**객체를 버리지 않는다.** 자리와 크기는 그리고 점선 테두리로 표시한 뒤 검증에서 잡는다.
저장된 문서가 지금 없는 타입을 담고 있을 수 있고(타입을 지웠거나 다른 앱이 만든 문서),
버리면 저장할 때 데이터가 사라진다.

---

### 15.4 ★ 호스트가 컨테이너에 **높이를 줘야 한다**

`.pck-editor` 는 `height: 100%` 다. 그래서 **마운트하는 컨테이너에 확정된 높이가 없으면
편집기가 접힌다.** 증상이 특징적이다.

| 증상 | 원인 |
| --- | --- |
| 편집기가 화면 위쪽 200px 만 차지하고 아래가 비어 있다 | 컨테이너 높이가 auto |
| EmptyState 아이콘이 편집기 **밖 위쪽**에 떠 있다 | `.pck-stage-wrap` 이 0 높이라 `place-content: center` 가 위아래로 넘친다 |
| 스테이지가 안 보이는데 툴바는 보인다 | 같은 원인 |

`.pck-empty` 가 `position: absolute; inset: 0` 이라 부모가 0이면 내용이 양쪽으로 흘러나온다.
높이 체인 한 겹만 끊겨도 이 모양이 된다.

```css
/* 화면 전체를 쓰는 경우 */
html, body, #app { height: 100%; margin: 0; }

/* 다른 UI 와 나눠 쓰는 경우 — flex 항목에 min-height: 0 을 반드시 함께 준다 */
.my-layout { display: flex; flex-direction: column; height: 100vh; }
.my-editor-host { flex: 1; min-height: 0; }
```

`min-height: 0` 이 없으면 flex 항목의 기본 `min-height: auto` 가 내용 크기를 최소로 잡아
스테이지 스크롤이 컨테이너를 밀어낸다.

**감싸는 요소를 한 겹 더 두면 그 요소도 높이를 넘겨야 한다.** 아무 규칙 없는 `<div>` 를
끼우면 체인이 끊긴다 — 2026.08.20 에 데모에서 실제로 이 실수를 했다(PLAN 20.11).

### 15.3 스타일 배포

`dist/styles.css` 는 CSS 전용 엔트리(`src/styles.ts`)에서 나온다.

**코어 엔트리는 CSS 를 import 하지 않는다.** 채점 함수만 가져다 쓰는 소비자에게 19KB 스타일을
딸려 보내지 않기 위해서다. 소비자가 명시적으로 가져간다.

```ts
import 'pdf-canvas-kit/styles.css'
```
