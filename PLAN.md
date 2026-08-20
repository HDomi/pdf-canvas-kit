# LumiTeach Worksheet System — 구현 계획 (PLAN)

| 항목 | 내용 |
| --- | --- |
| 대상 기획 | Worksheet v0.19 (초안) |
| 문서 버전 | plan-2.0 |
| 최초 작성일 | 2026.08.19 |
| 최종 수정일 | 2026.08.20 |
| 범위 | `PDFCanvasEditor` 우선 구현, `PDFCanvasViewer` 골격만 |
| 배포 형태 | **공개 npm 패키지 `pdf-canvas-kit` (MIT).** submodule 겸용은 버렸다(D22) |
| 소비 환경 | **프레임워크 무관.** vanilla DOM 렌더 층 + Vue·React 얇은 래퍼 (D19·D21, 상세 20장) |
| 현 단계 목표 | **R 트랙 — 프레임워크 무관 재구조화** (20.4). 기능은 M7 완료 + M8 부분. 남은 기능은 M8 실서버 연결·M10 Viewer |
| 관련 문서 | [ARCHITECTURE.md](ARCHITECTURE.md) 코드 구조·튜닝 지점 · [README.md](README.md) 사용법 · [CLAUDE.md](CLAUDE.md) 작업 규칙 |

---

## 1. 이 패키지가 무엇인가

Teacher의 오프라인 학습 자료(PDF/DOC/PPT)를 **페이지별 배경 이미지 + 그 위 객체 레이어**로 다루는
편집기/뷰어 컴포넌트 라이브러리.

```ts
// Nuxt 3 / Vue 3
import { WorksheetEditor, WorksheetViewer } from '@lumiteach/worksheet-system/vue'
```

라이브러리이므로 **서버 통신·인증·파일 변환·이미지 영속화를 직접 하지 않는다.** 모두 호스트 앱이 주입한다(9장 Ports).
과제(Assignment) 생성·리포트·채점 서버 로직은 범위 밖이며,
편집기는 "내보내기 가능 상태인지 검증"과 "내보내기 요청 이벤트 발행"까지만 담당한다.

---

## 2. 핵심 설계 결정

| # | 결정 | 이유 | 대안과 트레이드오프 |
| --- | --- | --- | --- |
| ~~D1~~ | ~~**headless 코어(순수 TS) + Vue 컴포넌트 렌더링 층**~~ **D19로 대체(2026.08.20)** — 코어 경계는 유지하고 렌더 층만 vanilla DOM 으로 교체한다 | 소비처가 Vue(Nuxt) 하나로 확정됐으니 렌더링을 vanilla DOM으로 직접 짜는 건 낭비다. 리스트 diff·조건부 렌더를 Vue에 맡긴다. 단, 상태·기하·검증·채점은 프레임워크 무관 순수 TS로 남겨 React가 필요해지면 **렌더 층만** 새로 짜면 되게 한다 | (a) 완전 vanilla 렌더러: DOM diff를 손으로 (b) 로직까지 Vue reactive에 녹이기: 재사용 불가 |
| D2 | **캔버스는 `<canvas>`가 아니라 DOM(절대 배치) 렌더링** | Answer Box는 실제 input·select·textarea가 필요하고, 접근성·IME(한글 입력)·복붙이 공짜로 따라온다. 객체 상한이 페이지 30 / 문서 200이라 DOM 노드 수도 안전 | Canvas 2D: 텍스트 캐럿·IME·셀렉션을 직접 구현. 배경 이미지만 `<img>`로 깐다 |
| D3 | **좌표는 페이지 로컬 pt 절대좌표. 정규화(0~1) 아님** | PDF 어노테이션 도메인의 표준(PDF `/Rect`, pdf-lib, Acrobat, PDF.js annotation layer 전부 pt). 기획의 "최소 80×32pt" 제약을 곱셈 없이 그대로 검증할 수 있다 | 정규화: 페이지 크기 변경엔 강하지만 pt 제약 검증마다 곱셈이 필요하고 값을 사람이 못 읽는다. 상세 5장 |
| D4 | **화면 배율은 페이지 컨테이너의 `transform: scale()` 한 지점에만 적용** | 객체 렌더 코드에서 좌표 곱셈이 사라진다 = 좌표 변환 버그가 구조적으로 안 생긴다 | 객체마다 `x*scale`: 곱셈 누락·이중 적용 버그의 단골. 상세 5.3 |
| D5 | **선택 핸들·마퀴·가이드는 scale 밖 별도 오버레이 레이어** | D4의 부작용(핸들이 축소 배율에서 같이 작아짐)을 구조로 해결 | 핸들에 `1/scale` 역보정: 보더·그림자까지 개별 보정 + 소수점 흐림 |
| D6 | **y축은 전부 y-down(좌상단 원점)으로 통일** | HTML/CSS와 일치. pdfjs `getViewport()` 가 PDF의 y-up을 이미 y-down으로 변환해준다 | PDF 원본 y-up 유지: 렌더마다 뒤집어야 함. **PDF 재생성 시에만** 경계에서 변환(5.2) |
| D7 | **페이지는 각자 `size{width,height}`를 갖는다** | PDF는 페이지별 크기·회전이 다를 수 있음 | 문서 단일 크기: 혼합 PDF에서 배경 왜곡 |
| **D8** | **스테이지는 한 번에 한 페이지만 렌더한다 (single page mode)** — 확정 | 와이어프레임대로 스테이지에 현재 페이지 하나만 둔다. DOM에 페이지 프레임이 1개뿐이라 500페이지 문서에서도 렌더 비용이 페이지 수와 무관하고, "현재 페이지"가 스크롤에서 추론하는 값이 아니라 **명시적 상태**가 되어 로직이 크게 단순해진다 | 연속 세로 나열: 스크롤 동기·가시성 추적·프로그램 스크롤 억제 플래그가 다 필요하다. 상세 6.6 |
| **D9** | **팬(위치 이동)은 네이티브 스크롤(`overflow:auto`)로 구현. `transform: translate` 무한 캔버스가 아니다** | 스크롤바·관성·키보드 스크롤·접근성을 브라우저가 공짜로 준다. D8과 합쳐지면 스크롤은 **페이지가 스테이지보다 클 때(확대 상태)만** 생기는 단순한 상태가 된다 | Figma식 translate 팬: 무한 영역엔 유리하나 스크롤바를 직접 구현해야 하고 접근성이 나빠진다. 여백으로 나갈 이유가 없다. 상세 6.2 |
| **D10** | **드래그 팬은 `Space+드래그` / `중간버튼 드래그` 로만. 좌클릭 드래그는 객체 생성·마퀴 선택에 예약** | 좌클릭 드래그가 툴의 주 동작(영역 생성)이므로 팬과 충돌한다. Space+드래그는 Figma·Photoshop·Illustrator 공통 관례 | `select` 툴 빈 영역 드래그를 팬으로: 마퀴 선택을 잃는다. 손 도구 툴 추가: 기획 툴바에 없다 |
| **D11** | **화면 좌표 → pt 변환은 `getBoundingClientRect()` 기준. 스크롤 오프셋을 좌표 수학에 넣지 않는다** | 스크롤·팬·부모 레이아웃 변화가 자동 반영된다. 스크롤 상태를 수식에 넣으면 반드시 어긋난다 | `scrollLeft`·`offsetTop` 누적 계산: 중첩 스크롤·sticky 헤더가 끼면 틀린다. 상세 5.4 |
| D12 | **PDF는 업로드 시점에 전체 페이지를 이미지로 변환해 배열에 바인딩** (확정) | 편집 중 페이지 이동이 즉시 반응. pdfjs 인스턴스를 세션 내내 붙들지 않아 메모리 모델이 단순 | lazy 렌더: 첫 화면은 빠르나 페이지 전환마다 지연. 페이지 수가 많을 때만 부분 lazy(10.2) |
| D13 | **이미지 영속화 형태는 `AssetPort`가 결정. 코어는 항상 표시용 URL만 다룬다** | base64 vs S3가 미정(→ Q11). 코어를 `url` 기준으로 짜두면 결정이 늦어도 막힘이 없다 | 코어가 base64를 직접 들면 S3 전환 시 모델·저장 경로를 다 고쳐야 함 |
| D14 | **정답 데이터는 편집 문서에만 존재. Viewer는 `PublicWorksheetDoc`을 받는다** | 정답이 학생 번들에 실려 가면 안 됨. 타입 분리로 실수를 컴파일 타임에 막는다 | 한 타입 공유 + 런타임 필터: 유출 사고 여지 |
| D15 | **Editor는 데스크탑 전용, Viewer만 반응형** | 기획 3.1(Teacher Web PC / Student PC·태블릿·모바일) | — |
| D16 | **Nuxt에서는 클라이언트 전용 컴포넌트** | pdfjs·pointer 이벤트·`URL.createObjectURL`이 브라우저 전용 | SSR 지원: 얻는 게 없다. `<ClientOnly>` 안내로 끝 |
| D17 | **테스트 러너 미도입. TS strict + ESLint + 데모 검증 화면으로 대체** (확정) | 팀이 운용하지 않는 도구는 방치된다. 타입·린트로 정적 안전망을 두껍게 깔고, 데모에 눈으로 확인하는 검증 화면을 만든다 | **리스크 인정**: geometry·validation 회귀를 자동으로 못 잡는다. 완화책 17장 |
| D18 | i18n은 키 기반 + 주입 가능한 `I18nPort`, 기본 ko/en 내장 | 기획 3.2 하드코딩 금지 | — |
| **D19** | **UI 렌더 층을 vanilla DOM 으로 다시 쓴다. Vue·React 는 얇은 래퍼만** (2026.08.20 결정, D1 대체) | 소비처가 Nuxt 하나라는 D1 의 전제가 깨졌다 — 이제 Vue·React 양쪽에서 쓰여야 한다. UI 를 프레임워크 없이 한 벌만 두면 구현이 하나고 프레임워크 런타임이 0KB 다. 래퍼는 각 ~100줄이라 세 번째 프레임워크가 와도 같은 비용이다 | (a) **Vue 를 내부 엔진으로 쓰고 양쪽 래퍼**: 기존 4,771줄을 그대로 살리지만 React 사용자 번들에 Vue 런타임 ~40KB gzip 이 강제로 들어간다 (b) **React 층 별도 구현**: UI 가 영구히 두 벌이 되고 반드시 갈라진다. 상세 20장 |
| **D20** | **미세 반응성(signal)으로 DOM 을 직접 바인딩한다. VDOM diff 를 만들지 않는다** | ① VDOM 을 직접 구현하는 것은 D1 이 "낭비"라고 판단한 그 작업이다 ② 바뀐 노드만 건드리므로 `contenteditable` 의 IME 조합·캐럿을 깨뜨릴 표면이 애초에 없다(6.5) ③ API 를 Vue 의 `ref`/`computed`/`watch` 와 같은 모양으로 두면 기존 컨트롤러 2,000줄이 기계적 이식이 된다 | (a) 상태 변경마다 현재 페이지 전체 재렌더: 객체 상한이 30개라 성능은 되지만 편집 중인 텍스트 노드를 매번 덮어써 한글 입력이 깨진다 (b) 외부 signal 라이브러리: 의존성 하나를 UI 근간에 놓게 되고 ~150줄로 끝나는 범위다 |
| **D21** | **패키지명 `pdf-canvas-kit` · CSS 프리픽스 `pck-` · 공개 npm + MIT.** `lumiteach` 는 코드·문서·토큰에서 전부 제거한다 | 공개 배포하는 범용 라이브러리가 특정 사내 제품 이름을 달고 있으면 안 된다. 스코프를 떼면 `import 'pdf-canvas-kit'` 로 이름 자체가 설명이 된다 | 스코프 유지(`@lumiteach/…`): 이름 선점 걱정이 없지만 공개 패키지에 사내 조직명이 남는다 |
| **D22** | **submodule 겸용을 버리고 npm 배포 단일 경로로 간다** | 두 경로를 동시에 지원하려면 `exports` 맵과 `src/*` 직접 참조를 함께 유지해야 하고, 소비자가 어느 쪽을 쓰는지에 따라 빌드 문제가 갈린다. 배포본 하나만 검증하는 편이 확실하다 | submodule 유지: 호스트 Vite 가 소스를 직접 컴파일해 빌드 단계가 없다는 이점이 있었지만, 이제 소비처가 여러 프레임워크라 "호스트가 알아서 컴파일" 이 성립하지 않는다 |
| **D23** | **리라이트 중 Vue SFC 층을 지우지 않고 병행 유지한다. 마지막 단계에서 삭제** | 자동 테스트가 없다(D17). 새 렌더러를 만드는 동안 **동작하는 기준 구현**이 같은 저장소에 살아 있어야 회귀를 눈으로 대조할 수 있다. `/editor/`(Vue)와 `/editor-dom/`(신규)을 나란히 띄워 비교한다 | 먼저 지우고 새로 짜기: 비교 대상이 사라져 "원래 이랬나?" 를 판단할 근거가 없어진다. D17 의 리스크가 그대로 터지는 경로다 |

### 2.1 왜 Vue만인가 (D1 보충) — **2026.08.20 D19로 대체됨**

> ~~소비처가 Nuxt 3 하나다. React 래퍼를 지금 만들면 검증되지 않은 추상화만 늘어난다.~~
>
> 전제가 깨졌다. 이제 Vue·React 양쪽에서 쓰는 공개 npm 패키지로 간다(D19·D21). 남은 계획은 20장.

**다만 이 결정이 남긴 것이 리라이트를 가능하게 만들었다.** `src/core/` 가 Vue를 `import` 하지
않는다는 규칙을 ESLint 로 강제해 왔으므로(`no-restricted-imports`), 4,957줄의
`geometry` · `validation` · `grading` · `store` · `commands` · `pdf` 는 **손댈 필요가 없다.**
바꿀 대상은 `src/vue/` 4,771줄뿐이다.

경계를 문서가 아니라 린트로 잡아 둔 값이 여기서 회수됐다.

---

## 3. 외부 패키지 · 라이선스 정책

### 3.1 허용 기준
- **허용 라이선스**: MIT · Apache-2.0 · BSD-2/3-Clause · ISC · CC0 · Unlicense
- **금지**: GPL · LGPL · AGPL · SSPL · BUSL · 상업 라이선스 · "무료 티어 + 유료 전환" 모델
- **이유**: 이 패키지는 사내 제품에 임베드되어 배포된다. copyleft는 소스 공개 의무를,
  상업 라이선스는 좌석·볼륨 과금을 제품에 전염시킨다.

### 3.2 PDF 라이브러리 주의 (자주 밟는 함정)
| 패키지 | 라이선스 | 판정 |
| --- | --- | --- |
| `pdfjs-dist` (Mozilla) | Apache-2.0 | **사용** |
| `pdf-lib` | MIT | 사용 가능 (후속 PDF 내보내기 시) |
| `mupdf` / `mupdf.js` | **AGPL-3.0** | **금지** |
| `iText` | **AGPL-3.0** | **금지** |
| PSPDFKit / Nutrient, PDFTron / Apryse | 상업 | **금지** |

### 3.3 채택 목록

| 패키지 | 라이선스 | 용도 | 상태 |
| --- | --- | --- | --- |
| `vue` | MIT | peer (external) | 필수 |
| `pdfjs-dist` | Apache-2.0 | PDF → 페이지 이미지 | 필수 |
| `typescript` | Apache-2.0 | — | 필수(dev) |
| `vite` · `@vitejs/plugin-vue` · `vue-tsc` | MIT | 빌드·타입체크 | 필수(dev) |
| `eslint` · `typescript-eslint` · `eslint-plugin-vue` · `prettier` · `eslint-config-prettier` | MIT | 린트·포맷 | 필수(dev) |
| `@vueuse/core` | MIT | `useResizeObserver` · `useEventListener` · `useElementSize` · `useScroll` (스테이지에 직접 필요) | 채택 |
| `@floating-ui/vue` | MIT | 인스펙터 드롭다운 · 줌 프리셋 팝업 위치 계산 | 채택 (M4) |
| `lucide-vue-next` | ISC | 아이콘 (tree-shakeable) | 채택 (M3) |
| `@tanstack/vue-virtual` | MIT | 페이지 썸네일 가상 스크롤 (500페이지 대응) | 채택 (M3, 실측 후 확정) |
| `sortablejs` | MIT | 썸네일 순서 변경 DnD | 후보 (M3에서 직접 구현과 비교) |

### 3.4 의도적으로 안 쓰는 것
| 대신 | 이유 |
| --- | --- |
| 상태관리(Pinia/zustand) → 자체 `createStore` | 호스트 스토어 오염 방지. 필요한 건 구독 + 히스토리뿐 |
| 캔버스 엔진(fabric/konva) → DOM 렌더 | D2. Answer Box가 실제 폼 요소여야 한다 |
| 팬줌 라이브러리(panzoom 등) → 네이티브 스크롤 | D9. 스크롤 컨테이너 + `scrollBy` 로 충분하고, 라이브러리는 `transform` 방식이라 D9과 충돌 |
| 이벤트 버스(mitt) → 자체 emitter | 20줄 |
| ID 생성(nanoid/uuid) → `crypto.randomUUID()` + `getRandomValues` 폴백 | 브라우저 내장. insecure origin 대응은 `core/util/id.ts` 20줄로 끝난다(18.9) |
| 유틸(lodash) → 표준 JS | 번들 절약 |
| Tailwind → CSS 변수 + `lws-` 프리픽스 | 호스트 설정 충돌 방지 |

`package.json` 에 `license-check` 스크립트를 두어 의존성 라이선스를 확인한다.

---

## 4. 데이터 모델

`src/core/model/types.ts` (초안 — M2에서 확정)

```ts
/** 1pt = 1/72 inch. 페이지 로컬 좌표의 단위 (D3) */
export type Pt = number

export interface WorksheetDoc {
  schemaVersion: 1
  id: string
  title: string
  titleTouched: boolean                       // 기획 4.2 자동 세팅 규칙용
  pages: WorksheetPage[]
  updatedAt: string                           // UTC ISO8601
}

export interface WorksheetPage {
  id: string
  size: { width: Pt; height: Pt }             // D7: 페이지마다 다름
  background: PageBackground
  source?: { fileId: string; fileName: string; pageIndex: number }
  objects: WorksheetObject[]                  // z-order = 배열 순서
}
```

**뷰 상태는 문서에 저장하지 않는다.** 배율·스크롤 위치·선택·현재 페이지는 `EditorViewState`(6.5)에 따로 둔다.
문서는 저장·내보내기·스냅샷의 대상이고, 뷰 상태는 세션 값이다. 섞으면 자동저장이 배율 변경마다 돈다.

### 4.1 PageBackground — 영속화 미정을 흡수하는 형태 (D13)

```ts
export type PageBackground =
  | { kind: 'blank' }
  | {
      kind: 'image'
      /** 렌더용 표시 URL. blob: / data: / https: 무엇이든 */
      url: string
      /** 이 URL의 성질 — 직렬화 가능 여부의 판단 근거 */
      origin: 'blob' | 'inline' | 'remote'
      /** origin='remote' 일 때 서버가 부여한 식별자 */
      assetId?: string
      /** 이미지 원본 픽셀 크기 (품질 판단용, 좌표 계산에 쓰지 않음 — 5.8) */
      naturalWidth: number
      naturalHeight: number
      /** 래스터화에 쓴 배율 — 재변환 판단용 */
      renderScale: number
    }
```

- `origin: 'blob'` — `URL.createObjectURL`. **메모리 한정, 새로고침 시 소멸.** 현 단계(M1~M7) 기본값.
- `origin: 'inline'` — base64 data URL. 문서 JSON에 그대로 실린다.
- `origin: 'remote'` — S3 등 업로드 후 URL. 문서 JSON에는 `assetId` + `url` 만.

**직렬화 가드**: `serializeDoc(doc)` 은 `origin: 'blob'` 배경을 만나면 **에러를 던진다.**
blob URL을 저장하면 다음 세션에 죽은 링크가 되므로, 저장 전에 반드시
`promoteBackgrounds(doc, assetPort, { onProgress })` 로 `inline` 또는 `remote` 로 승격해야 한다.

### 4.2 객체 타입

```ts
interface ObjectBase {
  id: string
  /** 페이지 로컬 pt 좌표. 좌상단 원점, y-down (D3, D6) */
  rect: { x: Pt; y: Pt; w: Pt; h: Pt }
  /** deg, 중심 기준 시계방향. Answer Box는 항상 0 (Q8) */
  rotation?: number
  locked?: boolean
}

export type WorksheetObject =
  | TextObject | ShapeObject | MaskObject
  | ShortAnswerBox | EssayAnswerBox | DropboxAnswerBox

export interface TextObject extends ObjectBase {
  type: 'text'
  text: string
  style: { fontFamily: string; fontSize: Pt; bold: boolean; italic: boolean
           underline: boolean; color: string; align: 'left'|'center'|'right'
           lineHeight: number }
}

export interface ShapeObject extends ObjectBase {
  type: 'shape'
  shape: 'rect' | 'ellipse' | 'line' | 'arrow'
  style: { fill: string | null; stroke: string; strokeWidth: Pt; dash?: number[] }
}

export interface MaskObject extends ObjectBase {   // 지우개(배경 가리기) — Q1
  type: 'mask'
  fill: string                                     // 기본 #FFFFFF
}

interface AnswerBoxBase extends ObjectBase {
  points: number                                   // 기본 1, 1 이상 정수
  label?: string                                    // 문항 번호 표기 (Q9)
}

export interface ShortAnswerBox extends AnswerBoxBase {
  type: 'answer.short'
  answers: string[]                                // 1~5개, 각 1~50자. 하나라도 일치하면 정답
}

export interface EssayAnswerBox extends AnswerBoxBase {
  type: 'answer.essay'
  rubric?: string                                  // 교사용 채점 가이드, 학생 비노출
}

export interface DropboxAnswerBox extends AnswerBoxBase {
  type: 'answer.dropbox'
  choices: { id: string; label: string }[]         // 2~5개, 각 1~50자
  correctChoiceIds: string[]                       // 1개 이상, 복수면 all-or-nothing
}
```

### 4.3 학생용 문서(정답 제거)

```ts
export type PublicWorksheetObject =
  | TextObject | ShapeObject | MaskObject
  | Omit<ShortAnswerBox, 'answers'>
  | Omit<EssayAnswerBox, 'rubric'>
  | Omit<DropboxAnswerBox, 'correctChoiceIds'>
```

`toPublicDoc(doc)` 을 코어에 두고, **서버도 같은 규칙으로 스냅샷을 만든다**.

### 4.4 학생 응답 모델 (Viewer 골격용)

```ts
export interface AttemptDraft {
  attemptId: string
  assignmentId: string
  responses: Record<string /*objectId*/, ShortRes | EssayRes | DropboxRes>
  submittedAt?: string
}
type ShortRes   = { type:'answer.short';   value: string }
type EssayRes   = { type:'answer.essay';   value: string }
type DropboxRes = { type:'answer.dropbox'; choiceIds: string[] }
```

채점 규칙(단답형: 공백 제거·대소문자 무시 후 완전 일치 / 드롭박스: all-or-nothing / 서술형: 수동)은
`src/core/grading/` 에 **순수 함수**로 두어 서버와 동일 로직을 공유할 수 있게 한다.

---

## 5. 좌표계 ★

이 프로젝트에서 버그가 가장 많이 나는 지점이므로 규칙을 먼저 못 박는다.

### 5.1 좌표 공간

```
① 문서 좌표 (pt)            저장되는 유일한 진실. 페이지 로컬, 좌상단 원점, y-down
      │  × scale            페이지 컨테이너의 CSS transform 한 곳에서만 (D4)
      ▼
② 페이지 화면 좌표 (CSS px) 페이지 프레임 좌상단 기준
      │  + 페이지 프레임의 화면 위치 (getBoundingClientRect — D11)
      ▼                     ※ 스크롤·팬은 여기에 자동으로 녹아 있다. 수식에 안 넣는다
③ 뷰포트 좌표 (clientX/Y)   마우스 이벤트가 들어오는 공간
      │  × devicePixelRatio  pdfjs 래스터화에서만
      ▼
④ 래스터 픽셀               배경 이미지의 실제 픽셀. 좌표 계산에 절대 쓰지 않는다
```

**규칙**
- 문서에 저장되는 좌표는 ①뿐이다. ②③은 파생값이며 저장하지 않는다.
- ④는 이미지 품질에만 관여하고 좌표 계산에 등장하지 않는다(5.8).
- **스크롤 위치·팬 오프셋은 좌표 변환식에 등장하지 않는다** (D11, 5.4).

### 5.2 pt 절대좌표를 쓰는 이유 (D3)

| 방식 | 도메인 관례 | 판정 |
| --- | --- | --- |
| **페이지 로컬 pt 절대** | PDF 어노테이션·폼 필드 표준 (PDF `/Rect`, Acrobat, pdf-lib, PDF.js annotation layer) | **채택.** 기획 제약이 pt(최소 80×32pt)라 곱셈 없이 검증. 서버에서 PDF 재생성·인쇄할 때 1:1 대응 |
| 정규화 비율 (0~1) | 이미지 라벨링·CV (CVAT, Roboflow) | 반응형엔 강하나 pt 제약 검증마다 페이지 크기를 곱해야 하고, 페이지마다 크기가 달라(D7) 같은 0.1이 페이지마다 다른 거리가 된다 |
| 화면 px 저장 | — | **금지.** 줌·창 크기·DPI가 바뀌면 데이터가 깨진다 |

**y축 (D6)**: PDF 원본은 좌하단 원점 y-up이지만 pdfjs `getViewport()` 결과가 이미 y-down이다.
전 구간 y-down으로 통일하고, **PDF 재생성 경계에서만** `y_pdf = pageHeight - y - h` 로 뒤집는다.
이 변환은 `core/geometry/pdfSpace.ts` 한 곳에만 존재한다.

**rect 표현**: `{x, y, w, h}`. `{x1,y1,x2,y2}` 대비 CSS 매핑이 직접적이고 리사이즈에서 음수 폭 처리가 단순하다.

### 5.3 DOM 구조 — scale은 한 곳에만 (D4)

스테이지에는 **현재 페이지 하나만** 존재한다(D8).

```html
<!-- position: relative 래퍼 — 줌 컨트롤을 스크롤 밖에 고정하기 위해 필요 -->
<div class="lws-stage-wrap">

  <!-- 스크롤 컨테이너 = 팬의 주체 (D9). 확대 상태에서만 스크롤이 생긴다 -->
  <div class="lws-stage" tabindex="0">          <!-- overflow: auto -->
    <div class="lws-stage-pad">                 <!-- 여백 + 가운데 정렬 -->

      <!-- 페이지 프레임: 레이아웃이 차지하는 실제 크기. 문서에 단 하나 -->
      <div class="lws-page-frame" data-page-id="p1" style="width:476px; height:674px">
        <!--                                            ↑ size × scale -->

        <!-- ★ 스케일 지점: 여기 단 한 곳 -->
        <div class="lws-page" style="
            width:595px; height:842px;            /* page.size 를 px로 그대로 */
            transform: scale(0.8);
            transform-origin: top left">

          <img class="lws-page-bg" src="blob:…">  <!-- width/height 100% -->

          <!-- 객체: pt 값을 px에 그대로. 곱셈 없음 -->
          <div class="lws-obj" style="left:120px; top:300px; width:160px; height:40px">…</div>
        </div>

        <!-- ★ 오버레이: scale 밖, 프레임 기준 absolute (D5) -->
        <svg class="lws-overlay" style="width:476px; height:674px">
          <rect x="96" y="240" width="128" height="32"/>   <!-- 120*0.8, 300*0.8 … -->
          <!-- 핸들 9개: 어떤 배율에서도 8×8 CSS px -->
        </svg>
      </div>

    </div>
  </div>

  <!-- 우측 하단 고정. 스크롤 컨테이너 밖이라 스크롤에 딸려가지 않는다 -->
  <div class="lws-stage-controls">  −  80%  +  </div>
</div>
```

이 구조의 이득:
- 객체 렌더 컴포넌트가 `scale` 을 **모른다.** `left: rect.x + 'px'` 로 끝. 곱셈 누락·이중 적용이 불가능.
- 텍스트·보더·이미지가 배율에 맞춰 함께 커진다 = 문서 확대의 자연스러운 동작.
- 핸들만 스케일 밖이라 어떤 배율에서도 잡기 좋은 크기를 유지한다.
- 페이지가 하나뿐이라 500페이지 문서에서도 DOM 크기가 일정하다(D8).

`lws-page-frame` 을 따로 두는 이유: `transform` 은 레이아웃 크기에 영향을 주지 않으므로,
스크롤 영역이 올바른 크기를 갖도록 부모가 `size × scale` 을 실제 크기로 잡아준다.
**이걸 빼면 스크롤 범위가 항상 원래 크기(scale=1)로 계산돼 축소 시 여백이, 확대 시 잘림이 생긴다.**

`lws-stage-pad` 는 페이지를 가운데 두고 여백을 준다. 축소 상태(페이지 < 스테이지)에서는
`display:flex; align-items:center; justify-content:center; min-height:100%` 로 중앙 정렬,
확대 상태에서는 패딩만 남고 스크롤이 생긴다.

### 5.4 변환 함수 — 이 4개만 존재한다 (D11)

`src/core/geometry/units.ts`

```ts
export interface PageViewport {
  pageId: string
  size: { width: Pt; height: Pt }
  scale: number
  /** 페이지 프레임의 뷰포트 기준 위치 = pageFrameEl.getBoundingClientRect() */
  frameRect: { left: number; top: number }
}

/** 뷰포트 좌표(clientX/Y) → 문서 pt. 마우스 이벤트 처리 */
export function clientToPage(p: { x: number; y: number }, vp: PageViewport): { x: Pt; y: Pt }

/** 문서 pt → 프레임 기준 CSS px. 오버레이 배치 전용 */
export function pageToFrame(p: { x: Pt; y: Pt }, vp: PageViewport): { x: number; y: number }

/** rect 단위 변환. 오버레이 전용 */
export function rectToFrame(r: Rect, vp: PageViewport): Rect

/** 화면 이동량 → pt 이동량. 드래그 델타 */
export function clientDeltaToPage(d: { dx: number; dy: number }, scale: number): { dx: Pt; dy: Pt }
```

구현은 이 정도로 단순하다:

```ts
export function clientToPage(p, vp) {
  return {
    x: (p.x - vp.frameRect.left) / vp.scale,
    y: (p.y - vp.frameRect.top) / vp.scale,
  }
}
```

**`scrollLeft` · `offsetTop` 누적 계산을 하지 않는 이유**: 스테이지 스크롤·페이지 나열 오프셋·
sticky 헤더·호스트 앱의 부모 레이아웃까지 전부 더해야 맞는데, 하나라도 빠지면 클릭 지점이 어긋난다.
`getBoundingClientRect()` 는 그 모든 걸 이미 포함한 값이다.

**`frameRect` 캐시 정책**
- 드래그 시작(`pointerdown`)에 1회 측정해 드래그 내내 재사용 — `pointermove` 마다 측정하면 레이아웃 스래싱
- 무효화 트리거: 스테이지 `scroll` · 줌 변경 · `ResizeObserver` · 페이지 목록 변경
- 드래그 중 자동 스크롤(경계 근처 드래그)이 발생하면 그 프레임에서 다시 측정

**객체 렌더 컴포넌트에서는 이 함수들을 호출하지 않는다.** 호출처는 오버레이와 포인터 핸들러뿐.
ESLint로 `objects/*.vue` 의 import를 막는다(14.3).

### 5.5 회전 처리 (도형·텍스트만)

```html
<div class="lws-obj" style="left:120px; top:300px; width:160px; height:40px;
     transform: rotate(15deg); transform-origin: center">
```

- 히트 테스트: 포인터를 객체 중심 기준 `-rotation` 역회전 후 축 정렬 사각형과 비교 (`geometry/hitTest.ts`)
- 리사이즈: 핸들 델타를 `-rotation` 회전 → 로컬 공간 계산 → 다시 `+rotation`
- Answer Box는 회전 금지(Q8) — 학생 폼 요소가 기울면 입력·모바일 렌더가 깨진다

### 5.6 정밀도
- 저장 시 pt를 **소수 2자리로 라운드**(`round2`). JSON 크기와 diff 안정성.
- 드래그 중 임시 값은 라운드하지 않는다(누적 오차 방지). 커밋 시점에만 라운드.
- 스냅 그리드 4pt(토글) — 라운드와 별개.

### 5.7 배경 이미지와 pt의 관계
배경은 `page.size`(pt)를 꽉 채우도록 `width:100%; height:100%` 로 깐다.
`naturalWidth/Height` 는 pt 변환에 쓰지 않고 **이미지 품질 판단**(현재 배율에서 해상도가 충분한지)에만 쓴다.
즉 **배경 픽셀 크기가 좌표계에 영향을 주지 않는다** — 해상도를 바꿔 재래스터화해도 객체 좌표는 그대로다.
이게 pt 좌표계를 택한 실질적 이득이다.

---

## 6. 스테이지 — 레이아웃 · 페이지 전환 · 줌 · 팬 ★

### 6.1 편집 화면 레이아웃

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TopBar   [←] [제목 없는 Worksheet] (저장됨)      [↶][↷] │ [ 내보내기 ]    │  56px 고정
├──────────┬────────────────────────────────────────────────┬──────────────┤
│ PAGES  3 │  ┌ Toolbar ────────────────────────────────┐   │ INSPECTOR    │
│          │  │ T 텍스트 │ 단답형 │ 서술형 │ 드롭박스 │  │   │              │
│ ┌──────┐ │  │ 도형 │ 지우개 ‖ 복제 │ 삭제           │   │  선택된 요소  │
│ │  1   │◀│  └─────────────────────────────────────────┘   │  없음        │
│ └──────┘ │  1 / 3 · A4 세로                               │  (empty)     │
│ ┌──────┐ │  ┌───────── lws-stage (overflow:auto) ──────┐  │              │
│ │  2   │ │  │        ┌─────────────────┐               │  │              │
│ └──────┘ │  │        │  현재 페이지    │  ← 1개만      │  │              │
│ ┌──────┐ │  │        │   (page frame)  │               │  │              │
│ │  3   │ │  │        └─────────────────┘               │  │              │
│ └──────┘ │  │                              ┌─────────┐ │  │              │
│ ┌ +파일 ┐│  │                              │ − 80% + │ │  │              │
│ └──────┘ │  └──────────────────────────────└─────────┘─┘  │              │
│  240px   │              flex: 1                           │    280px     │
└──────────┴────────────────────────────────────────────────┴──────────────┘
```

| 영역 | 컴포넌트 | 규칙 |
| --- | --- | --- |
| TopBar | `TopBar.vue` | 높이 56px 고정 |
| 좌측 | `PageThumbList.vue` | 폭 240px. 500페이지 대응 가상 스크롤 |
| 툴바 | `Toolbar.vue` | 스테이지 위 고정 영역(스테이지 스크롤과 무관) |
| 페이지 정보 | `PageMeta.vue` | `1 / 3 · A4 세로`. 현재 페이지는 명시적 상태(6.2) |
| 스테이지 | `CanvasStage.vue` | `overflow:auto`, `flex:1`. **현재 페이지 1장만 렌더**(D8) |
| 줌 컨트롤 | `StageControls.vue` | 스테이지 래퍼의 우측 하단 `absolute; right:16px; bottom:16px` |
| 우측 | `Inspector.vue` | 폭 280px |

**줌 컨트롤은 `lws-stage` 의 자식이 아니라 `lws-stage-wrap` 의 자식이다**(5.3).
스크롤 컨테이너 안에 두면 스크롤에 딸려가 사라진다.

### 6.2 페이지 전환 (single page mode — D8)

`currentPageIndex` 는 **명시적 상태**다. 스크롤 위치에서 추론하지 않는다.

| 트리거 | 동작 |
| --- | --- |
| 좌측 썸네일 클릭 | 해당 페이지로 전환 |
| `PageUp` / `PageDown` | 이전 / 다음 페이지 |
| `Home` / `End` | 첫 / 마지막 페이지 |
| 페이지 삭제 | 같은 인덱스 유지(마지막이었으면 -1) |
| 페이지 복제 | 새로 만들어진 페이지로 이동 |
| 파일 추가 | 추가된 첫 페이지로 이동 |
| 검증 실패 하이라이트 | 문제가 있는 객체의 페이지로 이동 후 선택(13장) |

**전환 시 처리**
- 스크롤 위치를 좌상단으로 리셋한다(이전 페이지의 스크롤 위치를 물려받으면 엉뚱한 곳을 본다)
- 배율은 유지한다. 단 `fitMode !== 'none'` 이면 새 페이지 크기로 **재계산**한다(6.5)
- 선택(`selectedObjectIds`)을 비운다 — 다른 페이지의 객체를 선택한 상태가 남으면 인스펙터가 유령을 가리킨다
- 진행 중인 드래그·팬은 취소한다

**연속 스크롤 대비 얻는 것**(D8): `IntersectionObserver` 로 가시 비율을 추적하지 않고,
프로그램 스크롤 중 하이라이트가 튀는 것을 막는 억제 플래그도 필요 없고,
DOM에 페이지가 1개라 500페이지 문서에서도 렌더 비용이 페이지 수와 무관하다.

**배경 이미지 메모리**: 페이지 전환이 즉시여야 하므로 blob URL은 전체 페이지에 대해 미리 만들어 둔다(D12).
`<img>` 엘리먼트는 현재 페이지 것 하나만 DOM에 있으므로 디코딩된 비트맵 메모리는 1장분이다.
브라우저가 최근 이미지를 캐시하므로 인접 페이지 전환도 빠르다.

### 6.3 팬 (위치 이동) — 네이티브 스크롤 (D9)

`lws-stage` 가 `overflow: auto` 스크롤 컨테이너다. 팬은 `scrollLeft` / `scrollTop` 조작.

**단일 페이지 모드에서 스크롤은 "페이지가 스테이지보다 클 때"만 생긴다** = 확대 상태.
`fit-width` 기본값에서는 스크롤이 없고, 사용자가 확대한 뒤부터 팬이 의미를 갖는다.

| 입력 | 동작 | 근거 |
| --- | --- | --- |
| **Space + 드래그** | 팬. 커서 `grab` → 드래그 중 `grabbing` | Figma·Photoshop·Illustrator 공통 (D10) |
| **중간 버튼(휠 클릭) 드래그** | 팬 | 브라우저·CAD 관례. `button === 1` |
| 휠 | 세로 스크롤 (브라우저 기본, 가로채지 않음) | — |
| Shift + 휠 | 가로 스크롤 | — |
| **Cmd/Ctrl + 휠** | 줌 (포인터 앵커) | 6.4 |
| 트랙패드 두 손가락 | 스크롤 (기본) | — |
| **트랙패드 pinch** | 줌. macOS는 `wheel` 에 `ctrlKey:true` 로 들어온다 | 6.4 |
| 객체를 스테이지 경계까지 드래그 | 자동 스크롤 (경계 40px 안에서 최대 20px/frame) | 5.4 `frameRect` 재측정 필요 |

**좌클릭 드래그는 팬이 아니다** (D10) — 툴의 영역 생성·마퀴 선택에 예약.

구현 메모:
- Space 키다운에 `panArmed = true`, 커서 변경. **키다운을 `preventDefault`** 해야 페이지 스크롤이 안 튄다
- 입력 필드 포커스 중에는 Space를 가로채지 않는다(공백 입력이 막힌다) — 11.4와 동일 규칙
- 팬 드래그는 `scrollBy({ left: -dx, top: -dy, behavior: 'instant' })`
- 스크롤이 없는 상태(축소·맞춤)에서도 Space 커서는 바뀌되 실제 이동은 0이다. 커서만 반응해도 무해
- 팬 중에는 툴 상태를 건드리지 않는다. `pointerup` 후에도 Space를 놓을 때까지 `panArmed` 유지

### 6.4 줌

| 항목 | 값 |
| --- | --- |
| 범위 | 25% ~ 400% |
| 프리셋 계단 | 25 · 50 · 75 · 100 · 125 · 150 · 200 · 300 · 400 (`+`/`−` 는 계단 이동) |
| `Cmd/Ctrl + 휠` | 연속 배율(계단 무시), 지수 스텝 `scale *= 1.0015 ** -deltaY` 후 클램프 |
| `Cmd/Ctrl + 0` | 페이지 맞춤 (기본 배율과 동일) |
| `Cmd/Ctrl + 1` | 100% |
| `Cmd/Ctrl + +/−` | 계단 이동 |
| 표시 | 정수 % (반올림). 클릭하면 프리셋 메뉴(`ZoomPresetMenu`) — 계단 + `폭 맞춤` · `페이지 맞춤` |

**앵커 규칙** — 확대해도 보고 있던 지점이 안 움직여야 한다.

| 트리거 | 앵커 |
| --- | --- |
| `Cmd/Ctrl + 휠`, pinch | **포인터 위치** |
| `−` / `+` 버튼, 키보드 단축키 | **스테이지 중앙** |
| 폭/페이지 맞춤 | 페이지 좌상단 |

```ts
/** 앵커를 화면에 고정한 채 배율 변경 (D9: 스크롤 기반) */
async function zoomTo(next: number, anchorClient: { x: number; y: number }) {
  const el = stageEl, r = el.getBoundingClientRect()
  const ax = anchorClient.x - r.left + el.scrollLeft   // 콘텐트 좌표(현재 배율)
  const ay = anchorClient.y - r.top  + el.scrollTop
  const k = next / scale.value

  scale.value = next                                   // → 프레임 크기 재계산
  await nextTick()                                     // ★ 레이아웃 반영 대기

  el.scrollLeft = ax * k - (anchorClient.x - r.left)
  el.scrollTop  = ay * k - (anchorClient.y - r.top)
}
```

**순서가 중요하다.** `scale` 을 바꾸면 `lws-page-frame` 크기가 변해 스크롤 범위가 바뀐다.
스크롤 보정은 **레이아웃이 반영된 뒤**에 해야 한다(`await nextTick()` 또는 `requestAnimationFrame`).
보정을 먼저 하면 옛 스크롤 최대값에 걸려 잘린다.

**축소 상태 예외**: 페이지가 스테이지보다 작으면 스크롤 범위가 0이라 앵커 보정이 무의미하다.
이때는 `lws-stage-pad` 의 중앙 정렬이 위치를 결정하므로 보정을 건너뛴다.

### 6.5 맞춤 모드 (fitMode)

```ts
type FitMode = 'width' | 'page' | 'none'
```

| 모드 | scale 산출 | 전환 조건 |
| --- | --- | --- |
| `page` | `min(폭 비율, 높이 비율)` — 페이지 전체가 보인다 | **초기 기본값** (확정 2026.08.19) |
| `width` | `(stageWidth - padding·2) / page.size.width` | 사용자가 "폭 맞춤" 선택 |
| `none` | 사용자가 지정한 고정 배율 | **`+`/`−`/휠 줌을 쓰는 순간 자동 전환** |

**기본값이 `page` 인 이유**: 문서를 올린 직후에는 무엇을 올렸는지 한눈에 확인하는 게 먼저다.
폭 맞춤은 A4 세로에서 아래가 잘려 첫 화면에 페이지 하단이 안 보인다.

`padding` 은 양쪽에 각각 적용되므로 계산에서 `padding × 2` 를 뺀다.
이 값은 `EDITOR_DEFAULTS.stagePadding` 과 `--lws-stage-padding` **두 곳에 있으며 같아야 한다** —
어긋나면 "페이지 맞춤"이 페이지를 자르거나 여백을 남긴다.

- `width`·`page` 모드에서는 `ResizeObserver` 로 스테이지 크기 변화에 맞춰 scale을 재계산한다.
- **페이지를 전환할 때도 재계산한다**(6.2). 단일 페이지 모드라 페이지마다 크기가 달라도(D7)
  각 페이지가 자기 크기에 맞게 채워진다 — 연속 나열이었으면 스크롤 중 배율이 튀어서 못 쓰는 동작인데,
  한 장씩 보여주므로 오히려 자연스럽다.
- `none` 으로 전환하는 규칙이 없으면 창 크기를 바꿀 때마다 사용자가 맞춘 배율이 날아간다.

### 6.6 뷰 상태 (문서와 분리 — 4장)

```ts
export interface EditorViewState {
  scale: number
  fitMode: FitMode
  currentPageIndex: number      // 명시적 상태 (6.2)
  selectedObjectIds: string[]
  activeTool: ToolId
  panArmed: boolean             // Space 눌림
  gridSnap: boolean
}
```

`WorksheetDoc` 과 별도 store. **자동저장 대상이 아니다.** 배율을 바꿀 때마다 서버 저장이 도는 걸 막는다.
**히스토리 대상도 아니다** — undo가 배율·페이지를 되돌리면 혼란스럽다(12장).

`currentPageIndex` 를 id가 아니라 인덱스로 두는 이유: 페이지 삭제·순서 변경 시
"같은 자리를 유지" 하는 동작이 자연스럽고, 범위 클램프가 단순하다.
단 인덱스는 항상 `clamp(0, pages.length - 1)` 로 보정하고, 페이지 0개면 `-1`.

### 6.7 용지 이름 표기 (`A4 세로`)
`core/geometry/paperSize.ts` — pt 크기를 표준 용지에 매칭(±3pt 허용).

| 이름 | pt (세로) |
| --- | --- |
| A4 | 595 × 842 |
| A3 | 842 × 1191 |
| A5 | 420 × 595 |
| Letter | 612 × 792 |
| Legal | 612 × 1008 |
| B5 | 499 × 709 |

매칭되면 `A4 세로` / `A4 가로`, 아니면 `사용자 지정 (612×792pt)`. `width > height` 면 가로.

### 6.8 Viewer의 스테이지 (D15)
Editor와 다르다.
- 줌 컨트롤·팬 없음. **페이지별 fit-to-width** (`containerWidth / page.size.width`, 상한 없음)
- 학생은 문제를 위에서 아래로 훑어야 하므로 **연속 세로 스크롤**이 맞다(Editor와 반대 — Q15는 Editor 한정 결정)
- 페이지 크기가 섞여 있어도 각자 폭을 채운다
- `ResizeObserver` 로 회전·창 크기 변화에 재계산
- 375px 폭에서 가로 스크롤이 생기면 안 된다(M10 DoD)

---

## 7. 디렉토리 구조

```
lumiteach-worksheet-system/
├─ PLAN.md
├─ package.json                    # exports: '.', './vue', './styles.css'
├─ tsconfig.json  tsconfig.build.json
├─ eslint.config.js  .prettierrc
├─ vite.config.ts                  # library build (core + vue 엔트리)
├─ vite.demo.config.ts             # dev server :3100
├─ src/
│  ├─ index.ts                     # core 공개 API (프레임워크 무관)
│  ├─ core/                        # ★ Vue import 금지 (ESLint)
│  │  ├─ model/         types.ts  viewState.ts  publicDoc.ts  serialize.ts
│  │  │                 numbering.ts  defaults.ts
│  │  ├─ config/        defaults.ts        ★ LIMITS · EDITOR/RENDER/LAYOUT_DEFAULTS
│  │  ├─ store/         createStore.ts  history.ts  selectors.ts
│  │  ├─ commands/      doc.ts  pages.ts  objects.ts  answerBox.ts  index.ts
│  │  ├─ geometry/      units.ts  handles.ts  constrain.ts  hitTest.ts
│  │  │                 paperSize.ts  zoom.ts  pdfSpace.ts
│  │  ├─ interaction/   tools.ts  pointerMachine.ts  panMachine.ts  keymap.ts
│  │  ├─ pdf/           resources.ts  loadPdf.ts  rasterize.ts  pdfjsConverter.ts
│  │  │                 diagnose.ts  thumbnails.ts
│  │  ├─ assets/        blobAsset.ts  s3Asset.ts  promoteBackgrounds.ts
│  │  ├─ autosave/      debouncedSaver.ts
│  │  ├─ validation/    rules.ts  exportGuard.ts
│  │  ├─ grading/       normalize.ts  score.ts
│  │  ├─ ports/         AssetPort.ts  ConverterPort.ts  StoragePort.ts  I18nPort.ts
│  │  └─ i18n/          ko.ts  en.ts  createI18n.ts
│  ├─ vue/                         # ★ 모든 UI
│  │  ├─ index.ts
│  │  ├─ WorksheetEditor.vue       # 6.1 레이아웃
│  │  ├─ WorksheetViewer.vue       # 골격
│  │  ├─ composables/
│  │  │   useEngine.ts             # core store → Vue reactive 브릿지
│  │  │   useStage.ts              # scale·fitMode·스크롤·ResizeObserver (6.3~6.4)
│  │  │   usePan.ts                # Space/중간버튼 드래그 팬 (6.2)
│  │  │   useZoom.ts               # 앵커 줌 + 휠/pinch (6.3)
│  │  │   usePageViewport.ts       # frameRect 캐시·무효화 (5.4)
│  │  │   usePageNav.ts            # currentPageIndex 전환·클램프 (6.2)
│  │  │   usePointerTool.ts        # pointerMachine 바인딩
│  │  │   useKeymap.ts  useI18n.ts
│  │  ├─ editor/
│  │  │   TopBar.vue  TitleInput.vue  SaveBadge.vue
│  │  │   PageThumbList.vue  PageThumb.vue
│  │  │   Toolbar.vue  PageMeta.vue
│  │  │   CanvasStage.vue  StagePad.vue  StageControls.vue  ZoomPresetMenu.vue
│  │  │   PageFrame.vue  PageBackgroundView.vue
│  │  │   SelectionOverlay.vue  ResizeHandles.vue  MarqueeLayer.vue
│  │  │   objects/{ObjectView,TextObjectView,ShapeObjectView,ShortAnswerView,
│  │  │            EssayAnswerView,DropboxAnswerView,MaskView}.vue
│  │  │   inspector/{Inspector,ShortAnswerPanel,EssayPanel,DropboxPanel,
│  │  │              TextPanel,ShapePanel,PointsField,EmptyPanel}.vue
│  │  │   dialogs/{UploadDialog,ExportDialog,ConfirmDialog}.vue
│  │  └─ viewer/  ViewerPage.vue  ViewerAnswerBox.vue
│  └─ styles/     tokens.css  editor.css  viewer.css     ★ 모든 --lws-* CSS 변수
├─ demo/
│  ├─ index.html                   # :3100 랜딩
│  ├─ spike/   index.html  main.ts   # M1: PDF → 이미지 배열 확인
│  ├─ editor/  index.html  main.ts
│  ├─ viewer/  index.html  main.ts
│  ├─ checks/  index.html  main.ts  cases.ts   # 검증 화면 (17장)
│  ├─ mocks/   memoryStorage.ts  blobAssetPort.ts  fakeServerConverter.ts
│  └─ fixtures/ mixed-size.pdf  rotated-90.pdf  a4-3page.pdf  large-100page.pdf
├─ examples/
│  └─ nuxt-app/                    # M9: 실제 Nuxt 3 소비 검증
└─ .gitlab-ci.yml                  # typecheck + lint + build
```

---

## 8. 컴포넌트 공개 API (Vue 3)

```vue
<template>
  <ClientOnly>
    <WorksheetEditor
      :doc="doc"
      :ports="{ asset, converter, storage, i18n }"
      locale="ko"
      :read-only="false"
      :initial-scale="'fit-width'"
      @change="onChange"
      @save-state-change="onSaveState"
      @request-export="onExport"
      @back="goBack"
    >
      <template #top-bar="{ ctx }">…</template>
    </WorksheetEditor>
  </ClientOnly>
</template>
```

| Prop | 타입 | 비고 |
| --- | --- | --- |
| `doc` | `WorksheetDoc \| null` | null이면 빈 상태(문서 불러오기) |
| `ports` | `Partial<Ports>` | 미주입 시 내장 기본값(blob asset · pdfjs converter · noop storage) |
| `locale` | `'ko' \| 'en'` | — |
| `readOnly` | `boolean` | — |
| `initialScale` | `number \| 'fit-width' \| 'fit-page'` | 기본 `'fit-width'` |

| Emit | payload |
| --- | --- |
| `change` | `(doc, meta: { source, dirty })` |
| `save-state-change` | `'saved' \| 'saving' \| 'error' \| 'disabled'` |
| `request-export` | `{ doc, publicDoc, validation }` |
| `back` | `void` |

`expose`: `zoomTo(scale)` · `fitWidth()` · `goToPage(pageId)` · `validateForExport()`

### 8.1 코어 직접 사용 (프레임워크 무관)

```ts
const engine = createWorksheetEngine({ doc, ports })
await engine.commands.addPagesFromFile(file)
engine.validateForExport()   // → { ok, issues }
engine.subscribe(state => …)
```

`WorksheetEditor.vue` 는 이 engine을 만들고 `useEngine` 으로 Vue reactive에 브릿지한다.
**스테이지 상태(scale·스크롤)는 engine이 아니라 Vue 층이 가진다** — DOM에 밀착된 값이므로.

### 8.2 Nuxt 사용 주의 (D16)
- `<ClientOnly>` 로 감싸거나 `components/WorksheetEditor.client.vue` 로 래핑
- `nuxt.config.ts`: `vite: { optimizeDeps: { include: ['pdfjs-dist'] } }`
- pdfjs worker는 `configurePdfWorker({ workerSrc })` 로 명시 주입 가능(10.4)
- CSS: `css: ['@lumiteach/worksheet-system/styles.css']`
- Nuxt 모듈(`/nuxt` 서브엔트리) 제공은 **Q12로 보류**

---

## 9. Ports (호스트 주입 인터페이스)

```ts
interface AssetPort {                        // ★ 이미지 영속화의 단일 지점 (D13, Q11)
  persist(blob: Blob, meta: { pageId: string; fileName?: string; mime: string }):
    Promise<{ url: string; origin: BackgroundOrigin; assetId?: string }>
  release?(assetId: string): Promise<void>   // 페이지 삭제 시 정리 (S3 orphan 방지)
}

interface ConverterPort {                    // doc/docx/ppt/pptx → 페이지 이미지 (서버)
  supports(file: File): boolean
  convert(file: File, opts: { signal: AbortSignal;
    onProgress(p: { ratio: number; page?: number; total?: number }): void }
  ): Promise<RasterPage[]>                   // { blob, size(pt), naturalWidth, naturalHeight, renderScale }
}

interface StoragePort { save(doc): Promise<void>; load?(id): Promise<WorksheetDoc> }
interface I18nPort    { t(key: string, vars?: Record<string, unknown>): string }
```

내장 구현:

| 구현 | 용도 | 상태 |
| --- | --- | --- |
| `createBlobAssetPort()` | 메모리 blob URL, 저장 불가 | **현 단계 기본** |
| | ↑ `origin: 'blob'` 을 **정직하게 반환**해야 한다. `'inline'` 으로 위장하면 `serializeDoc` 의 blob 가드(4.1)가 무력화돼 죽은 링크가 저장된다 | |
| `createBase64AssetPort()` | data URL 인라인 | Q11 후보 |
| `createPdfjsConverter()` | PDF → 페이지 이미지 (클라이언트) | M1 핵심 |
| `noopStoragePort()` | 저장 없음, 배지 `disabled` | **현 단계 기본** |

DOC/PPT 계열은 `createPdfjsConverter().supports()` 가 false를 반환하며, 호스트가 서버 컨버터를 주입해야 한다.
주입 없이 DOC 업로드 시 기획 2.4의 "파일을 변환할 수 없습니다." 경로로 떨어진다.

---

## 10. PDF → 페이지 이미지 배열 (현 단계 핵심)

### 10.1 파이프라인

```
File
 └ pdfjs getDocument()                        → PDFDocumentProxy
   └ 페이지 루프 i = 1..numPages
     ├ page.getViewport({ scale: 1, rotation: page.rotate })
     │    → size { width, height } (pt, y-down)  ← 페이지마다 다름 (D7)
     ├ scale = clamp(TARGET_PX / viewport.width, 1, MAX_SCALE)
     ├ 재사용 캔버스에 page.render({ viewport: getViewport({ scale }) })
     ├ canvas.convertToBlob({ type:'image/webp', quality:.85 })   ← 폴백 image/png
     ├ page.cleanup()
     └ assetPort.persist(blob) 또는 URL.createObjectURL(blob)
        → WorksheetPage { id, size, background:{ kind:'image', url, origin,
                          naturalWidth, naturalHeight, renderScale } }
 → pdf.destroy()
 → WorksheetPage[]  (문서에 append)
```

- **한 번에 한 페이지만** 렌더하고 캔버스를 재사용한다(동시 렌더는 메모리 스파이크).
- 루프 종료 후 `pdf.destroy()` — pdfjs 인스턴스를 세션 내내 붙들지 않는다(D12).
- 진행률: `onProgress({ ratio: i/total, page: i, total })` → 업로드 팝업 진행바.
- 취소: 페이지 루프마다 `AbortSignal` 확인.

### 10.2 렌더 해상도 · 포맷 (M1 실측으로 확정)

| 상수 | 값 | 근거 |
| --- | --- | --- |
| `TARGET_PX` | 1654px (A4 폭 @ 200dpi) | 편집 확대에서 글자가 뭉개지지 않는 최소선 |
| `MAX_SCALE` | 3 | 대형 페이지(A0 등)에서 캔버스 폭주 방지 |
| `DEFAULT_MIME` | **`image/jpeg`** | 아래 실측. 배경 이미지에 투명이 없어 알파를 포기해도 잃는 게 없다 |
| `DEFAULT_QUALITY` | 0.85 | q.75로 낮추면 용량 18% 절감·속도 이득 없음 → 화질을 택함 |
| 썸네일 | 폭 160px 별도 렌더, 캐시 분리 | 좌측 리스트용 |

**실측** (2026.08.19 · headless Chrome, GPU 비활성 · `large-100page.pdf` = A4 100페이지 벡터 텍스트):

| 포맷 · 해상도 | 총 소요 | 페이지당 | 이미지 용량 |
| --- | --- | --- | --- |
| **jpeg q.85 · 1654px** | **1.72초** | **17.2ms** | **399KB/page** |
| jpeg q.75 · 1654px | 1.73초 | 17.3ms | 329KB/page |
| png · 1654px | 1.76초 | 17.6ms | 482KB/page |
| webp q.85 · 1654px | 11.5초 | 115.1ms | 225KB/page |
| jpeg q.85 · 1240px | 0.92초 | 9.2ms | 268KB/page |

**WebP를 버린 이유**: 용량은 44% 작지만 인코딩이 **6.7배 느리다**(115ms vs 17ms per page).
100페이지에서 11.5초 대기는 교사가 업로드하고 기다리는 시간이고, 500페이지면 1분에 가까워진다.
용량 이득은 S3 비용에만 유효한데(Q11), 그건 서버에서 재인코딩해도 되는 일이다.

**측정 편향 (명시)**: 픽스처가 벡터 텍스트라 무손실 PNG에 유리하게 나온 값이다.
실사용의 상당수인 **스캔 PDF·사진 포함 문서에서는 PNG가 크게 불리해지고 JPEG의 우위가 더 벌어진다.**
반대로 JPEG는 선이 얇은 도면에서 링잉이 생길 수 있다 → Q18.

**대용량 전략**: 17.2ms/page이면 **500페이지 전량 변환이 약 8.6초**다.
기획 3.2가 파일 업로드·변환을 로딩 타임아웃 예외로 두므로, 진행률만 정확히 보여주면
**부분 lazy 없이 전량 즉시 변환으로 충분하다**(D12 유지). 앞 N페이지만 먼저 변환하는
`EAGER_PAGE_LIMIT` 분기는 **도입하지 않는다** — 없어도 되는 상태 분기다.

**남는 한계**: 500페이지 × 399KB = **약 200MB의 blob**. 브라우저가 디스크로 내리므로 JS heap은 아니지만
무시할 양이 아니다. 실사용 대다수인 수십 페이지 문서에서는 문제가 없고,
극단 케이스 대응(해상도 하향 또는 페이지별 해제)은 Q16·Q19로 미룬다.

**줌과의 관계**: 배경은 `TARGET_PX` 로 한 번 래스터화한 이미지다. 400% 확대에서는 흐려질 수 있다.
`renderScale` 과 현재 `scale` 을 비교해 부족하면 **해당 페이지만 고해상도 재래스터화**하는 여지를 남긴다
(좌표계가 pt라 재래스터화가 객체 위치에 영향을 주지 않는다 — 5.7). 구현은 M8 이후, Q16.

### 10.3 검증할 엣지 케이스 (M1 DoD)
- 페이지마다 크기가 다른 PDF → 각 페이지가 자기 비율로 렌더되는가
- `page.rotate` 90/270 → 가로/세로가 뒤바뀐 채 정상인가
- CropBox ≠ MediaBox → 잘린 영역 기준으로 렌더되는가
- 암호화·손상 PDF → 기획 2.4 메시지로 떨어지는가
- 100페이지 PDF → 변환 총 소요·피크 메모리 실측

### 10.4 런타임 자산 — 호스트 주입 필수 (M1에서 확정)

pdf.js는 자기 완결적이지 않다. worker · CMap · 표준 폰트 · wasm 디코더를 **런타임 URL**로 가져온다.

| 자산 | 없으면 |
| --- | --- |
| `pdf.worker.mjs` | 변환 불가 — `PdfWorkerNotConfiguredError` |
| `cmaps/` | 비임베드 CID 폰트의 글자가 사라진다 (한국어 교재) |
| `standard_fonts/` | 표준 14폰트를 임베드하지 않은 PDF의 글자가 사라진다 |
| `wasm/` | JBIG2·JPEG2000 스캔 이미지가 렌더되지 않는다 |

**자동 해석을 시도했다가 철회했다.** 두 가지가 막았다.

1. 번들러는 **디렉토리 URL을 재작성하지 못한다**(파일 URL은 됨) — Vite dev에서 실측 확인.
   `new URL('pdfjs-dist/cmaps/', import.meta.url)` 이 소스 상대 경로로 잘못 해석됐다.
2. **라이브러리 빌드에서 `new URL(..., import.meta.url)` 은 자산을 base64로 인라인한다.**
   worker를 자동 해석했더니 `dist/index.js` 가 **3MB**가 됐다.
   `build.assetsInlineLimit: 0` 과 `rollupOptions.external` 둘 다 막지 못했다.
   덤으로 호스트의 pdfjs-dist와 다른 worker 빌드가 고정되는 위험도 있었다.
   → 자동 해석 제거 후 **10.5KB**.

그래서 `configurePdfResources({ workerSrc, cMapUrl, standardFontDataUrl, wasmUrl })` 로
호스트가 주입한다. 앱 쪽 방법은 두 가지:

```ts
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url'  // 번들러가 emit
const workerSrc = '/pdfjs/pdf.worker.mjs'                    // 정적 서빙 (copy 스크립트)
```

`cMapUrl` 미설정 시 **경고를 1회 낸다**. 조용히 글자가 사라지는 실패는 원인을 찾기 어렵다.

### 10.5 실제 교재에서 글자가 사라진 사례 — 원인 확정 (2026.08.19)

실제 교재 PDF(48페이지, 6.8MB)로 재현·확정했다.

**원인**: 폰트 인코딩이 `KSCms-UHC-H` — Adobe **predefined CMap**이다.
pdf.js가 `cmaps/KSCms-UHC-H.bcmap` 을 fetch해야 하며, `cMapUrl` 이 없으면 폰트 변환 자체가 실패한다.
pdf.js 경고가 원인을 그대로 말한다: `Ensure that the cMapUrl API parameter is provided.`

**같은 페이지 A/B** (`/spike/` 실측):

| | 잉크(비백색 픽셀) | 텍스트 추출 | pdf.js 경고 |
| --- | --- | --- | --- |
| `cMapUrl` 설정 | **8.14%** | **568자** | 0건 |
| `cMapUrl` 없음 | 3.70% | 21자 | 13종 폰트에서 실패 |

**왜 합성 픽스처로는 재현되지 않았는가** — 이 함정을 기록해 둔다:

| | 인코딩 | `.bcmap` 필요? |
| --- | --- | --- |
| 실제 교재 | `KSCms-UHC-H` (predefined) | **필요** |
| `korean.pdf` (Chrome 생성 픽스처) | `Identity-H` | 불필요 (CID = GID 직결) |

`Identity-H` 는 CMap 파일 없이 동작하므로 픽스처 A/B에서 차이가 나지 않았고,
**"임베드 폰트면 CMap이 불필요하다"는 잘못된 결론**으로 이어졌다.
실제 교재는 `FontFile3`(임베드 CFF) 38개를 가지면서 인코딩만 외부 참조한다 —
**폰트 프로그램 임베드와 CMap 필요성은 별개다.**

Chrome의 print-to-PDF는 `Identity-H` 만 생성하므로 이 케이스를 합성할 수 없다.
저작물이라 교재를 저장소에 넣지 않으므로, **predefined CMap 경로는 실제 교재 파일로 수동 확인한다**
(`docs/checklist-M1.md`).

**진단 지원**: `diagnose.ts` 가 pdf.js 경고를 중복 집계하고 알려진 원인으로 번역한다
(`missing-cmap` · `missing-standard-font` · `missing-wasm` · `font-load-failed`).
같은 경고가 폰트마다 반복돼 원문 100줄에 실제 원인 1줄이 묻히는 문제를 없앤다.

## 11. 상호작용 모델 (툴바 · 9방향 핸들)

### 11.1 툴
`select | text | shape | answer.short | answer.essay | answer.dropbox | eraser`
(+ 툴바 우측 `복제` · `삭제` 는 툴이 아니라 선택 객체에 대한 즉시 동작)

모든 생성 툴이 같은 흐름을 공유한다:
**pointerdown → drag(마퀴) → pointerup → 객체 생성 → 자동 선택 → 툴 select 복귀**
(Shift 유지 시 툴 유지 = 연속 생성 — Q3)

드래그가 최소 크기 미만이면 기본 크기(160×40pt)로 클릭 배치.

### 11.2 pointerMachine (순수 TS, DOM 비의존)

```
idle → marquee-create → idle
idle → move(selected)  → idle
idle → resize(handle)  → idle
idle → marquee-select  → idle
```

- 입력은 이미 **pt로 변환된** `{ x, y, shiftKey, altKey }`. DOM 이벤트 → pt 변환은 Vue 층이 `clientToPage` 로(5.4).
- `setPointerCapture` 사용. **rAF 코얼레싱은 쓰지 않는다** — rAF 콜백에서 반응형 값을 바꾸면
  다음 프레임에 반영돼 드래그가 한 박자 늦게 따라온다(18.6). 브라우저가 이미 `pointermove` 를
  프레임당 한 번 정도로 합쳐 보낸다.
- **드래그 중에는 문서 상태를 건드리지 않고 임시 트랜스폼만 갱신** → `pointerup` 에 command 1회 커밋
  → 히스토리 1스텝. (안 하면 히스토리가 픽셀 단위로 오염된다)
- `panArmed` 이면 pointerMachine에 이벤트를 넘기지 않는다 — `panMachine` 이 먼저 잡는다(6.2).

### 11.3 핸들 (9방향)
8방향 코너/엣지 + 본체(이동).
- **핸들은 오버레이 레이어에 그린다**(D5) — 항상 8×8 CSS px, 히트 영역 14px.
  25%~400% 전 배율에서 크기가 일정해야 한다(M4 DoD)
- Shift: 종횡비 유지 · Alt: 중심 기준 · 그리드 스냅 4pt(토글)
- 제약: 페이지 경계 클램프, 최소 80×32pt(Answer Box) / 8×8pt(도형·텍스트)
- 회전 핸들은 도형·텍스트만(5.5, Q8)

### 11.4 키맵
| 키 | 동작 |
| --- | --- |
| `Delete` / `Backspace` | 삭제 |
| `Cmd/Ctrl+Z` / `Shift+Cmd/Ctrl+Z` | undo / redo |
| `Cmd/Ctrl+D` | 복제 |
| 방향키 (Shift 시 10pt) | 1pt 이동 |
| `Cmd/Ctrl+C/V` | 복사·붙여넣기 (+8pt 오프셋) |
| `Cmd/Ctrl + +/−` | 줌 계단 |
| `Cmd/Ctrl+0` / `Cmd/Ctrl+1` | 페이지 맞춤 / 100% (Acrobat 관례, 기본 배율과 일치) |
| `Space`(누른 채) | 팬 (6.3) |
| `Esc` | 툴/선택 해제 |
| `PageUp` / `PageDown` | 이전 / 다음 페이지로 **전환** (스크롤이 아니라 페이지 교체 — D8) |
| `Home` / `End` | 첫 / 마지막 페이지 |

**입력 필드(텍스트 편집·인스펙터 input) 포커스 중에는 편집기 키맵을 전부 가로채지 않는다.**
특히 `Space`(팬)와 `Delete`(삭제)는 입력을 망가뜨리므로 반드시 예외 처리한다.

### 11.5 지우개
기획에 툴바 항목만 있고 정의가 없다 → **Q1**. 잠정: 클릭한 객체를 삭제하는 모드.
배경 가리기는 `MaskObject` 로 확장 가능하게 타입만 열어 둔다.

---

## 12. 히스토리 · 저장 (현 단계는 저장 미구현)

- **히스토리**: 커맨드 단위 역연산 스택(`{ do, undo, label }`), 상한 100스텝.
  배경 이미지 같은 큰 데이터는 참조만 담는다. `transact()` 로 여러 변경을 1스텝 병합.
  세션 범위(새로고침 시 초기화 — 기획 1.3). **M7에서 구현.**
  **뷰 상태(배율·스크롤·선택)는 히스토리 대상이 아니다** — undo가 배율을 되돌리면 혼란스럽다.
- **저장**: 이번 범위에서 붙이지 않는다.
  - `noopStoragePort()` 기본 → 저장 배지는 `disabled` 로 렌더
  - 코어는 `dirty` 플래그와 `change` 이벤트만 정확히 발행 → M8에서 디바운스 저장을 얹으면 끝
  - `serializeDoc` 이 blob 배경에서 에러를 던지므로(4.1), 저장을 붙이는 순간
    `promoteBackgrounds` 가 필수 경로가 된다
- **M8 예정 사양**: 5초 디바운스 + 최대 지연 30초, `beforeunload`·`visibilitychange` flush,
  실패 시 지수 백오프 3회 → `error` 배지.

---

## 13. 검증 (내보내기 게이트)

`src/core/validation/rules.ts` — 순수 함수. 인스펙터 실시간 경고와 내보내기 차단이 **같은 규칙**을 쓴다.

| 코드 | 조건 | 메시지 키 |
| --- | --- | --- |
| `EMPTY_DOC` | 페이지 0 | 버튼 비활성 |
| `SHORT_NO_ANSWER` | 단답형 정답 0개 | `error.answerRequired` |
| `DROPBOX_FEW_CHOICES` | 드롭박스 보기 < 2 | `error.dropboxIncomplete` |
| `DROPBOX_NO_CORRECT` | 정답 지정 0개 | `error.dropboxIncomplete` |
| `POINTS_INVALID` | 배점 < 1 또는 정수 아님 | `error.pointsRequired` |
| `CHOICE_TOO_LONG` | 보기 > 50자 | `error.max50` (입력 시 실시간 차단) |
| `CHOICE_DUPLICATE` | 보기 중복 | `error.duplicateChoice` |
| `BOX_LIMIT_PAGE` | 페이지당 Answer Box > 30 | `error.boxLimit` |
| `BOX_LIMIT_DOC` | 문서 전체 > 200 | `error.boxLimit` |
| `PAGE_LIMIT` | 페이지 > 500 | `error.pageLimit` |
| `FILE_FORMAT` | 지원 외 포맷 | `error.format` |
| `FILE_SIZE` | 500MB 초과 | `error.size` |

`validateForExport()` → `{ ok, issues:[{ code, pageId, objectId }] }`.
편집기는 해당 객체를 하이라이트하고 **첫 이슈로 스크롤**한다(`goToPage` + 객체 위치로 `scrollIntoView`).

내보내기 팝업 본체는 **호스트 책임**(과제 생성 API·Class 목록·QR이 앱 도메인).
패키지는 `request-export` 이벤트만 발행하고, 원하면 쓰도록 `ExportDialog.vue` 를 옵션 제공(M7 후반).

---

## 14. 개발 환경 · 빌드

### 14.1 `npm run dev` → **http://localhost:3100**

| 경로 | 내용 |
| --- | --- |
| `/spike/` | **M1**: PDF 드롭 → 페이지 이미지 배열 렌더 + 페이지별 pt 크기·소요시간 표시 |
| `/editor/` | `WorksheetEditor` 전체 |
| `/viewer/` | `WorksheetViewer` + 반응형(모바일 폭 시뮬) |
| `/checks/` | 순수 함수 검증 화면 — 72 케이스, 불일치 행 강조 (17장) |

데모는 `demo/mocks` 의 blob AssetPort · pdfjs 컨버터 · noop Storage를 주입한다.
픽스처에 **페이지 크기가 섞인 PDF**와 **rotate 90 PDF**를 반드시 포함한다.

### 14.2 TypeScript 설정
```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,     // pages[i]·objects[i] 접근 사고 방지
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "isolatedDeclarations": true          // d.ts 생성 안정성
  }
}
```
테스트 러너가 없으므로(D17) **타입을 안전망으로 쓴다.**

### 14.3 ESLint 핵심 규칙
```js
// eslint.config.js 요지
{
  files: ['src/core/**'],
  rules: { 'no-restricted-imports': ['error', { patterns: ['vue', '@vueuse/*', '*.vue'] }] }
},
{
  files: ['src/vue/editor/objects/**'],
  rules: { 'no-restricted-imports': ['error', {
    patterns: ['**/geometry/units'],       // 객체 렌더에서 좌표 변환 금지 (5.4)
  }]}
},
{
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',   // PDF 변환 비동기 누락 방지
    '@typescript-eslint/consistent-type-imports': 'error',
    'vue/multi-word-component-names': 'off',
  }
}
```
좌표 규칙(5.4)과 코어 경계(2.1)를 **린트로 강제**한다. 문서 규칙은 잊히지만 린트는 잊히지 않는다.
Prettier: `printWidth 100`, `semi: false`, `singleQuote: true`, `eslint-config-prettier` 로 충돌 제거.

### 14.4 스크립트
```json
{
  "dev": "vite --config vite.demo.config.ts --port 3100 --strictPort",
  "build": "vite build && vue-tsc -p tsconfig.build.json --emitDeclarationOnly",
  "typecheck": "vue-tsc --noEmit",
  "lint": "eslint . && prettier --check .",
  "fix": "eslint . --fix && prettier --write .",
  "license-check": "npx license-checker --production --onlyAllow 'MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;CC0-1.0;Unlicense'"
}
```
CI는 `typecheck` + `lint` + `build` 만 돈다(테스트 러너 없음).

### 14.5 패키징
```json
{
  "name": "@lumiteach/worksheet-system",
  "type": "module",
  "sideEffects": ["**/*.css"],
  "exports": {
    ".":            { "types": "./dist/index.d.ts",     "import": "./dist/index.js" },
    "./vue":        { "types": "./dist/vue/index.d.ts", "import": "./dist/vue/index.js" },
    "./styles.css": "./dist/styles.css",
    "./src/*":      "./src/*"
  },
  "peerDependencies": { "vue": ">=3.4" },
  "dependencies": { "pdfjs-dist": "^4", "@vueuse/core": "^11", "@floating-ui/vue": "^1",
                    "lucide-vue-next": "^0.4", "@tanstack/vue-virtual": "^3" }
}
```
- **submodule 사용**: `./src/*` export + `tsconfig paths` / `vite resolve.alias` 안내를 README에.
- **CSS**: 클래스 프리픽스 `lws-`, 색·간격은 CSS 변수(`--lws-*`).
- **`vue` 는 external** — 호스트 Vue 인스턴스를 공유해야 한다(중복 번들 시 provide/inject·reactivity 깨짐).

---

## 15. 마일스톤

### M0 — 스캐폴딩 ✅ 완료 (2026.08.19)
Vite 8 + Vue 3.5 + TS strict(14.2), ESLint 9 flat config(14.3)/Prettier, 라이브러리·데모 두 config, 3100 랜딩.
- **DoD**: `npm run dev` → 3100 랜딩 진입 ✅ · `npm run build` → dist + d.ts 생성 ✅ · `lint`·`typecheck` 통과 ✅
- 실제 버전: pdfjs-dist **6.2.108** (PLAN 초안의 ^4 아님 — v6에서 `PDFDocumentProxy.destroy()` 가 사라져
  `PDFDocumentLoadingTask.destroy()` 를 쓰도록 `LoadedPdf.dispose()` 로 감쌌다)
- CI 파일은 아직 없음 (`.gitlab-ci.yml` 미작성 — M9로 이월)

### M1 — ★ PDF → 페이지 이미지 배열 ✅ 완료 (2026.08.19)
`loadPdf` · `rasterize` · `resources`(worker + CMap/폰트/wasm) · `createPdfjsConverter` ·
`createBlobAssetPort` · `diagnose` · `/spike/` 데모.
- **DoD** (headless Chrome 실측으로 확인)
  - `mixed-size.pdf` 6페이지가 각자 비율로 렌더 ✅ — 595×842 / 842×1191 / 420×595 / 792×612 / 612×1008 / 842×595 pt
  - 페이지별 pt 크기 · 픽셀 크기 · renderScale · 용지명 · 소요시간 화면 표시 ✅
  - `rotated-90.pdf` — Rotate 90/270 페이지가 842×595pt(가로)로 정확히 뒤바뀜 ✅
  - `cropbox.pdf` — CropBox 반영 확인(595−200=395.28 × 842−200=641.89pt), 잘린 영역 밖 텍스트는 추출되지 않음 ✅
  - `large-100page.pdf` — 100페이지 **1.72초** (17.2ms/page), 이미지 39MB ✅ → 포맷 JPEG 확정(Q13), `EAGER_PAGE_LIMIT` 불필요 판정
  - `corrupt.pdf` — `ConvertError('corrupt')` 로 실패 경로 동작 ✅
  - `korean.pdf`(CID 임베드 한글) 렌더 ✅
  - 실제 교재 48페이지 — 2.06초, `cMapUrl` 설정 후 한글 정상 렌더 ✅ (10.5)
- **추가로 발견해 처리한 것**
  - pdf.js는 CMap·표준폰트·wasm을 **런타임 URL로** 가져온다 → `configurePdfResources()` +
    `npm run copy:pdfjs` 추가. 미설정 시 경고 1회(조용한 글자 소실 방지)
  - **번들러는 디렉토리 URL을 재작성하지 못한다** (파일 URL만 가능) — 실측 확인, 그래서 자산 복사 방식이 유일
  - **라이브러리 빌드에서 worker 자동 해석이 3MB를 base64로 인라인**했다(`assetsInlineLimit`·`external`
    둘 다 무력). `workerSrc` 를 호스트 주입 필수로 바꿔 **3MB → 10.5KB**(10.4)
  - `disableFontFace` 기본값 판단: FontFace 렌더가 아웃라인 렌더보다 잉크 6% 많음(1.85% vs 1.75%)
    → pdf.js 기본값(FontFace 사용) 유지
  - 텍스트·폰트 진단 모듈(`diagnose.ts`) — "텍스트가 없는가 / 렌더가 실패했는가" 를 구분.
    pdf.js가 임베드 여부를 신뢰성 있게 노출하지 않으므로 **폰트 식별자만 보고하고 판정은 하지 않는다**

### M2 — 문서 모델 · store · 좌표계 기반 ✅ 완료 (2026.08.19)
`types.ts`·`viewState.ts` 확정, `createStore`, `commands/doc.ts`, `geometry/units.ts`(5.4),
`geometry/paperSize.ts`(6.7), `toPublicDoc`, `serializeDoc`(blob 가드), `/checks/` 1차.
- 구현: `geometry/units.ts`(변환 4함수) · `store/createStore.ts` · `store/history.ts` ·
  `model/{viewState,defaults,publicDoc,serialize}.ts` · `commands/{index,doc,pages}.ts` ·
  `engine.ts` · `i18n/{ko,en,createI18n}.ts`
- **DoD**: 타입·린트 게이트 통과 ✅ / `serializeDoc` blob 가드 ✅ / `toPublicDoc` + `findAnswerFieldPaths` ✅
- **`/checks/` 검증 화면은 M5에서 구현했다**(17.2). 현재 72 케이스 전부 통과.

### M3 — 레이아웃 · 스테이지 · 페이지 전환 · 줌 · 팬 · 페이지 리스트 ✅ 완료 (2026.08.19)
6.1 레이아웃 3분할, `CanvasStage`·`StagePad`·`PageFrame`(5.3 DOM 구조, **페이지 1장만**),
`useStage`·`useZoom`·`usePan`·`usePageNav`, `StageControls`(`− 배율 +` + 프리셋 메뉴), `PageMeta`,
좌측 썸네일(선택·순서 변경·복제·삭제·`+ 파일 추가`·`+ 빈 페이지`), 빈 상태(`문서 불러오기`),
업로드 팝업(From File / 진행률 / 포맷·용량·500페이지 예외). Google Drive 탭 자리만.
- **DoD**
  - 스테이지 DOM에 페이지 프레임이 **항상 1개** (100페이지 문서에서도 동일 — D8)
  - 썸네일 클릭·`PageUp/PageDown`·`Home/End` 로 페이지 전환. 전환 시 스크롤 상단 리셋·선택 해제(6.2)
  - 25%~400% 줌: `Cmd+휠` 이 **포인터 아래 지점을 고정**, `+`/`−` 는 스테이지 중앙 고정
  - 축소 상태에서 페이지가 스테이지 중앙에 오고, 확대 상태에서만 스크롤이 생김(5.3 `stage-pad`)
  - `Space+드래그`·중간버튼 드래그로 팬. 좌클릭 드래그는 팬이 아님
  - 문서 로드 직후 페이지 **전체가** 보임(`fit-page` 기본값), 창 크기 변경 시 따라오고
    수동 줌 후에는 배율이 유지됨(6.5)
  - 페이지 크기가 섞인 문서에서 페이지를 넘기면 `fit-width` 가 각 페이지 크기로 재계산되고
    `1 / 3 · A4 세로` 표기가 정확히 갱신됨
  - 3페이지 PDF 둘을 이어붙여 6페이지, 복제·삭제 후 썸네일·현재 페이지 인덱스 정합(6.6)
- **구현 범위**: 3분할 레이아웃 · `CanvasStage`(단일 페이지) · `PageFrame`(5.3 두 겹 구조) ·
  줌(버튼·프리셋 메뉴·Cmd+휠 앵커) · 팬(Space/중간버튼) · 페이지 리스트(클릭 전환·복제·삭제·빈 페이지) ·
  업로드 팝업(진행률·스펙 2.4 메시지) · 빈 상태 · 타이틀 인라인 편집 · undo/redo · 키맵
- **미구현(후속)**: 500페이지 썸네일 가상 스크롤
  (드래그 순서 변경은 2026.08.20 완료 — `usePageReorder`, 툴은 M4, 인스펙터는 M5에서 완료)
- **작업 중 고친 버그 2개** (아래 M3 노트)

#### M3 노트 — 구현 중 발견한 버그

두 건 모두 "조용히 아무 일도 일어나지 않는" 종류라 기록해 둔다.

1. **undo 버튼이 계속 비활성이었다.** `engine.run()` 이 `doc.set()` 뒤에 `history.push()` 를
   호출했는데, `set` 은 구독자를 **동기적으로** 부르고 그 구독자가 `canUndo()` 를 읽는다.
   결과적으로 push 전 상태를 읽어 버튼이 꺼진 채 남았다. → **history.push 를 doc.set 보다 먼저** 실행.
2. **`fit-width` 가 적용되지 않고 항상 100%였다.** `stageEl` ref 가 `CanvasStage` 내부의
   스크롤 컨테이너에 연결되지 않아 계속 null이었고, `applyFit()` 이 매번 조용히 no-op 됐다.
   → `CanvasStage` 가 `defineExpose({ scrollEl })` 로 컨테이너를 노출하고,
   부모가 `watch` 로 따라가며 `ResizeObserver` 를 재부착한다.
   (스테이지는 페이지가 0이면 언마운트되므로 한 번 읽어 두는 방식이 애초에 성립하지 않는다.)

### M4 — 툴 시스템 · 드래그 생성 · 9핸들 ✅ 완료 (2026.08.20)
- 구현: `geometry/{constrain,handles,hitTest}.ts` · `interaction/{tools,pointerMachine}.ts` ·
  `commands/objects.ts` · `composables/{usePageViewport,usePointerTool}.ts` ·
  `editor/{SelectionOverlay,ResizeHandles}.vue` · `editor/objects/*.vue` (7개) · 키맵 확장
- **DoD**
  - 드래그로 6종 객체 생성(텍스트·도형·단답형·서술형·드롭박스, 지우개는 M6) ✅
  - 8방향 핸들 리사이즈 + 본체 이동 = 9방향 ✅ (Shift 종횡비, Alt 중심 기준)
  - 경계 클램프·유형별 최소 크기(Answer Box 80×32pt / 나머지 8×8pt) ✅
  - **드래그 1회 = undo 1스텝** — 드래그 중에는 `preview` rect만 갱신하고 `pointerup` 에 커밋 ✅
  - 핸들을 배율 밖 오버레이에 그려 전 배율에서 8px 유지 ✅ (D5)
  - Answer Box 수량 한도(페이지 30 / 문서 200) 초과 시 생성 차단 + 문구 표시 ✅
  - 키맵: Delete·방향키(Shift 10pt)·Cmd+D 복제 ✅
- **미구현**: 스테이지 경계 자동 스크롤(`edgeScroll` 상수만 정의) · 다중 선택 리사이즈 — 아래 노트
  (회전 핸들은 M6에서, 썸네일 드래그 순서 변경은 2026.08.20에 완료)

#### M4 노트 — 결정과 미구현

**결정한 것** (기획에 없어 통념대로 처리):
1. **마퀴 선택은 교차 기준**(완전 포함 아님). 큰 배경 객체를 고르려고 화면 밖까지 끌어야 하는
   상황을 피한다. 대부분의 편집기 관례.
2. **핸들은 단일 선택일 때만** 그린다. 다중 선택 리사이즈는 기준점·종횡비 규칙이 따로 필요하고
   기획에 요구가 없다. 다중 선택 상태에서는 이동만 된다.
3. **생성 도구는 사용 후 select로 복귀**하되 **Shift를 누른 채 그리면 유지**한다 (Q3 결정).
4. **편집기의 Answer Box는 실제 `input`/`select` 가 아니다.** 실제 폼 요소를 두면 클릭이
   포커스로 가로채여 객체 선택과 드래그가 막힌다. 학생용 뷰어에서만 진짜 폼이 된다(M10).
5. **드래그가 4pt 미만이면 클릭으로 간주**해 기본 크기(160×40pt) 객체를 놓는다. 도구를 고르고
   클릭했는데 아무 일도 없는 것보다 낫다.
6. **`Delete` 는 선택이 없으면 가로채지 않는다.** 브라우저 뒤로 가기 등 기본 동작을 막지 않는다.

**미구현으로 남긴 것**:
- **경계 자동 스크롤** — 확대 상태에서 객체를 스테이지 밖으로 끌 때 스크롤이 따라가지 않는다.
  `EDITOR_DEFAULTS.edgeScroll` 상수와 `usePageViewport.remeasure()` 훅은 준비돼 있다.
  자동 스크롤 중 `frameRect` 재측정이 필요해(5.4) 구현량이 있고, 페이지 맞춤 기본 배율에서는
  스크롤 자체가 없어 체감 빈도가 낮다고 판단했다.
- **회전** — 도형·텍스트 회전은 `hitTest`·`rotatePoint` 로 수학은 준비했으나 회전 핸들 UI는 M6.

### M5 — Answer Box 3종 + 인스펙터 + 검증 ✅ 완료 (2026.08.20)
- 구현: `validation/{rules,exportGuard}.ts` · `grading/{normalize,score}.ts` ·
  `editor/inspector/*.vue` (7개) · `/checks/` 검증 화면(`cases.ts` + `main.ts`)
- **DoD**
  - 검증 12코드 + 추가 3코드 전부 `/checks/` 에서 확인 ✅ — **전 케이스 통과**
  - 인스펙터 실시간 경고와 내보내기 차단이 **같은 `validateObject()`** 를 호출 ✅
  - 단답형(정답 1~5개), 서술형(채점 가이드), 드롭박스(보기 2~5 + 복수 정답), 배점 입력 ✅
  - 내보내기 차단 시 문제 객체가 있는 페이지로 이동 + 선택 + 캔버스 테두리 강조 ✅
  - 채점 순수 함수: 공백 제거·대소문자 무시·NFKC, 드롭박스 all-or-nothing, 서술형 미채점 분리 ✅

#### M5 노트 — 결정 사항

기획에 명시가 없어 통념대로 처리한 것들:

1. **`/checks/` 화면을 M5에서 만들었다** (원래 M2 DoD). 검증할 순수 함수의 절반이 M4~M5에서
   나오므로 함께 만드는 편이 합리적이었다. 케이스는 `cases.ts` 로 분리했으니 나중에 러너를
   붙이면 그대로 소비된다 (PLAN 17.4 약속대로).
2. **정규화에 NFKC를 추가했다.** 기획은 "공백 제거·대소문자 무시" 만 말하지만, 한국어 입력기에서
   전각 영숫자가 섞이는 일이 흔하다. 학생이 눈으로 구분할 수 없는 차이로 오답 처리되면 안 된다.
3. **드롭박스 중복 판정은 채점 정규화를 쓰지 않는다.** 라벨을 `trim()` 만 해서 비교한다.
   학생에게 보이는 글자가 다르면 서로 다른 보기로 취급하는 편이 자연스럽다.
4. **비어 있는 보기가 정답으로 지정되면 "정답 없음"** 으로 본다. 보이지 않는 보기를 정답이라고
   할 수 없다.
5. **배점 입력을 실시간으로 되돌리지 않는다.** 빈 값·0을 허용하고 경고만 띄운다. 강제로 되돌리면
   "2를 지우고 3을 쓰려는" 중간 상태가 불가능해진다.
6. **`gradedPoints` 와 `totalPoints` 를 분리했다.** 서술형이 미채점인 동안 분모를 전체 배점으로
   쓰면 점수가 실제보다 낮게 보인다. 리포트가 "현재까지 채점된 범위"를 정확히 말해야 한다.
7. **다중 선택 인스펙터는 개수만 표시한다.** 유형이 섞인 선택에서 무엇을 일괄 편집할지 정의가
   필요하고 기획에 요구가 없다.
8. **내보내기 버튼은 검증 실패에도 활성 상태로 둔다** (페이지 0일 때만 비활성). 눌렀을 때 무엇이
   막혔는지 알려주는 편이, 왜 눌리지 않는지 모르게 두는 것보다 낫다.

### M6 — 텍스트 · 도형 · 지우개
텍스트 인라인 편집(폰트·크기·색·정렬·굵기), 도형(rect/ellipse/line/arrow), 회전(5.5), 지우개(11.5).
- **DoD**: 한글 IME 입력 정상(축소·확대 배율 모두), 회전 객체 히트테스트·리사이즈 정확,
  페이지 삭제 시 위 객체 동반 삭제

### M7 — 상단바 · undo/redo · 내보내기 게이트 ✅ 완료 (2026.08.20)
- 구현: `scrollRectIntoView` (문제 객체로 스크롤) · 옵션 `ExportDialog.vue` ·
  상단바·타이틀·저장 배지·undo/redo는 M3에서 이미 구현됨
- **DoD**
  - 정답 미지정 상태에서 내보내기 차단 → **페이지 이동 + 객체 선택 + 화면으로 스크롤** ✅
  - undo/redo 버튼 활성 조건 정확 ✅ (M3 노트의 순서 버그 수정 이후)
  - undo가 배율·스크롤·현재 페이지를 되돌리지 않음 ✅ (뷰 상태가 문서 밖에 있으므로 — PLAN 6.6)
  - 타이틀: 100자 제한 · 공백만 입력 시 기본값 복원 · 첫 업로드 파일명 자동 세팅 + `titleTouched` ✅
  - 저장 배지 `disabled` (StoragePort 미연결) ✅

#### M7 노트 — ExportDialog 의 경계

**`ExportDialog` 는 옵션 컴포넌트다.** 편집기는 검증만 하고 `request-export` 를 발행한다.

과제(Assignment) 생성, Class 목록 조회, 링크·QR 발급은 전부 호스트의 서버 도메인이다(PLAN 10).
그래서 이 컴포넌트는 **폼 상태만 관리**하고 `submit` 으로 설정값(`ExportSettings`)을 넘긴다.
호스트가 API를 호출한 뒤 결과(`result` prop)를 되돌려주면 링크·QR 영역을 보여준다.

이 분리의 이득: 호스트가 자기 팝업을 쓰든 이 컴포넌트를 쓰든 **검증 게이트는 동일**하다.

**QR 생성 라이브러리를 넣지 않았다.** QR 이미지 URL도 호스트가 준다. 번들에 QR 인코더를 넣으면
대부분의 소비자가 쓰지 않는 코드를 함께 받는다.

**결정한 것**:
1. **내보내기 버튼은 검증 실패에도 활성**이고(페이지 0일 때만 비활성), 눌렀을 때 무엇이 막혔는지
   알려준다. 왜 안 눌리는지 모르게 두는 것보다 낫다.
2. **`scrollRectIntoView` 는 이미 보이는 객체를 움직이지 않는다.** 자동으로 불리는 동작이라
   매번 화면이 튀면 방향 감각을 잃는다.
3. **내보낸 뒤에는 설정을 다시 만질 수 없다.** 이미 만든 과제와 어긋난 값을 보여주게 된다.
   수정본을 내려면 팝업을 닫고 다시 내보낸다 (기획 3.4의 불변 정책).
4. **클립보드 실패를 조용히 넘긴다.** 비 HTTPS 환경에서는 권한이 없는데, 링크가 화면에 이미
   보이므로 사용자가 직접 복사할 수 있다.

### M8 — 영속화 🟡 부분 완료 (2026.08.20)
- **완료**: `createS3AssetPort`(presigned URL PUT + 재시도) · `promoteBackgrounds` ·
  `createDebouncedSaver`(5초 디바운스 · 최대 지연 30초 · 지수 백오프 3회) ·
  저장 배지 4상태 · `beforeunload`/`visibilitychange` flush · `uploadFile` prop ·
  `createConsoleStoragePort`(실서버 대체)
- **남은 것**: 실제 서버 `StoragePort` 연결, 문서 불러오기(`load`) 경로, 저장 후 새로고침 복원 확인
- **DoD 미충족**: "저장 → 새로고침 → 복원" 은 실서버가 있어야 확인 가능하다.
  현재는 콘솔 출력으로 저장 시점·주기·상태 전이만 확인할 수 있다 (18.2)

### M9 — 패키징 + Nuxt 검증 → **R9로 흡수 (2026.08.20)**
~~d.ts, exports map, `examples/nuxt-app` 실제 소비, `license-check`~~ — 배포 형태가 바뀌었으므로
(D21·D22) 검증 대상이 "Nuxt 앱 하나" 가 아니라 "React 앱 + Vue 앱" 이 된다. 20.4 의 R9 를 따른다.

### M10 — Viewer 골격
`PublicWorksheetDoc` 읽기 전용 렌더, 페이지별 fit-to-width(6.8),
Answer Box를 실제 입력 요소로(단답 input / 서술 textarea / 드롭박스 select, placeholder "선택"),
`AttemptDraft` 로컬 상태 + `response-change`/`submit` 이벤트.
- **DoD**: 375px 폭에서 가로 스크롤 없이 읽히고 모든 입력 조작 가능. 정답 데이터가 뷰어 DOM에 부재

---

## 16. 성능 기준

| 항목 | 목표 |
| --- | --- |
| 10페이지 PDF 전체 이미지화 | 1초 이내 <span title="M1 실측 17.2ms/page">(실측 0.2초)</span> |
| 100페이지 PDF 전체 이미지화 | 3초 이내 **(실측 1.72초 — 달성)** |
| 500페이지 PDF 전체 이미지화 | 10초 이내 (실측 추정 8.6초) |
| 페이지 전환 | 100ms 이내 (이미지 배열 바인딩이라 사실상 즉시) |
| 줌 (휠 연속) | 60fps. `scale` 변경은 프레임 크기 + `transform` 만 건드린다 |
| 팬 드래그 | 60fps. `scrollBy` 만 호출, 리렌더 없음 |
| 객체 드래그 | 60fps. 드래그 중 store 미갱신. rAF 코얼레싱은 지연 때문에 쓰지 않는다(18.6) |
| 메모리 | 100페이지 배경 합계 40MB 이하 (M1 실측으로 포맷·해상도 조정) |
| 500페이지 썸네일 리스트 | 스크롤 60fps (필요 시 가상 스크롤) |

---

## 17. 검증 방식 (테스트 러너 미도입 — D17)

자동 테스트가 없으므로 **세 겹의 대체 안전망**을 둔다. 리스크를 줄이는 것이지 없애는 게 아니다.

### 17.1 정적 안전망
TS strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`(14.2),
ESLint로 아키텍처 규칙 강제(14.3), CI: `typecheck` + `lint` + `build`.

### 17.2 `/checks/` 검증 화면
3100의 한 페이지에 순수 함수 결과를 표로 렌더한다. 케이스와 기대값을 나란히 두고
**불일치 행을 빨갛게 칠한다.**

| 블록 | 내용 |
| --- | --- |
| 좌표 왕복 | `clientToPage` → `pageToFrame`, 여러 scale·frameRect 조합 |
| 줌 앵커 | `zoomTo` 후 앵커 지점의 문서 좌표 불변 확인 (6.4) |
| 페이지 인덱스 클램프 | 삭제·순서 변경 후 `currentPageIndex` 보정 (6.6) |
| 클램프 | 페이지 경계 밖·최소 크기 미만 입력 결과 |
| 핸들 수학 | 8방향 × (Shift/Alt) 조합 리사이즈 결과 |
| 회전 히트테스트 | 회전 객체 내부/외부 포인터 판정 |
| 용지 이름 | pt 크기 → `A4 세로` 등 매칭 (6.7) |
| 검증 12룰 | 각 코드별 위반 문서 → 기대 issue 목록 |
| 채점 정규화 | 공백·대소문자·전각 입력 → 정답 판정 |
| publicDoc | 정답 필드 잔존 여부 (키 스캔) |

**케이스 데이터(`cases.ts`)와 렌더(`main.ts`)를 분리해서 작성한다** — 나중에 러너를 붙이면
그 배열을 그대로 소비할 수 있다.

### 17.3 수동 체크리스트
각 마일스톤 DoD를 `docs/checklist-M{n}.md` 로 두고 머지 전에 손으로 확인한다.
줌·팬은 순수 함수로 다 덮이지 않으므로(브라우저 스크롤 동작 의존) 이 체크리스트가 주된 검증 수단이다.

### 17.4 남는 리스크 (명시)
- geometry·validation 회귀가 **커밋 시점에 자동으로 잡히지 않는다.** `/checks/` 를 열어봐야 안다.
- 줌·팬·스크롤은 실제 브라우저 레이아웃에 의존해 `/checks/` 로 덮이지 않는다. 수동 확인만.
- 리팩터링 안전성이 낮으므로 **코어 순수 함수의 시그니처 변경을 보수적으로** 한다.

---

## 18. 결정 이력 (구 TBD)

**2026.08.20 — 남아 있던 모든 항목을 확정했다.** 질문을 지우지 않고 결론과 함께 남긴다(CLAUDE.md §2.2).

| # | 질문 | 결론 |
| --- | --- | --- |
| ~~Q1~~ | ~~지우개 정의~~ | **객체 삭제.** M6 구현 완료. `MaskObject` 타입·렌더는 준비돼 있어 "배경 가리기"로 바꾸려면 도구 동작만 교체하면 된다 |
| ~~Q2~~ | ~~툴바 라벨~~ | **와이어프레임대로.** `텍스트 입력 / 단답형 / 서술형 / 드롭박스 / 도형 / 지우개 ‖ 복제 / 삭제` |
| ~~Q3~~ | ~~생성 후 도구 복귀~~ | **기본 복귀, Shift로 유지.** M4 구현 완료 |
| ~~Q4~~ | ~~최소 1페이지 유지~~ | **마지막 1페이지 삭제 차단.** `removePage` 가 거부하고 버튼도 비활성 |
| ~~Q5~~ | ~~빈 페이지 추가~~ | **좌측 패널 하단에 `+ 빈 페이지` 버튼.** 이웃 페이지와 같은 용지 크기로 삽입 |
| ~~Q6~~ | ~~허용 답안 개수~~ | **드롭박스=보기 2~5, 단답형=허용 답안 1~5.** 기획 표가 섞여 있던 부분을 이렇게 해석 |
| ~~Q7~~ | ~~[General] 문서 스펙~~ | **최소 세트로 확정.** 범위를 `TextPanel.vue` · `ShapePanel.vue` 주석에 3단계로 열거했다. 2026.08.20에 **배경·테두리·글자색**을 추가했다(18.8) |
| ~~Q8~~ | ~~회전 범위~~ | **텍스트·도형·마스크만.** Answer Box는 UI와 커맨드 양쪽에서 금지 |
| ~~Q9~~ | ~~문항 번호 자동 부여~~ | **위치에서 파생, 문서에 저장하지 않음.** 페이지 순 → 위에서 아래 → 같은 줄(±8pt)이면 왼쪽부터. 교사가 `label` 을 넣으면 그 값이 우선. 상세는 18.1 |
| ~~Q10~~ | ~~자동저장 API 형태~~ | **S3 전제. 업로드 함수를 호스트가 주입.** 지금은 콘솔 출력으로 대체. 상세는 18.2 |
| ~~Q11~~ | ~~base64 vs S3~~ | **S3.** `createS3AssetPort`(presigned URL PUT) + `promoteBackgrounds` 구현 완료 |
| ~~Q12~~ | ~~Nuxt 모듈 제공~~ | **보류.** 컴포넌트 직접 import + `<ClientOnly>` 안내로 충분하다고 판단 |
| ~~Q13~~ | ~~배경 이미지 포맷~~ | **JPEG q.85.** M1 실측(WebP가 6.7배 느림) |
| ~~Q14~~ | ~~서버 컨버터 스펙~~ | **`ConverterPort` 로 열어 두고 호스트 주입 대기.** DOC/PPT는 `supports()` 가 false를 반환하며 기획 2.4 메시지로 떨어진다 |
| ~~Q15~~ | ~~페이지 나열 방식~~ | **Editor는 한 페이지씩, Viewer는 연속 스크롤** |
| ~~Q16~~ | ~~고배율 재래스터화~~ | **지원하지 않는다.** 400% 확대에서 배경이 흐릿한 것은 알려진 한계다. 추후 대비를 위해 `renderScale` 을 보관하고 `rasterize.ts` 주석에 판단 근거를 남겼다 — 필요해지면 이 값과 현재 배율을 비교해 해당 페이지만 다시 래스터화하면 되고, 좌표가 pt라 객체 위치는 움직이지 않는다(5.7) |
| ~~Q17~~ | ~~패널 폭 리사이즈~~ | **고정 폭으로 시작 + 드래그 리사이즈 + localStorage 기억.** 상세는 18.3 |
| ~~Q18~~ | ~~JPEG 링잉~~ | **JPEG 일괄 유지.** 얇은 선 도면에서 링잉 가능성은 인지하되, 실사용 파일에서 문제가 확인되면 문서 종류별 분기를 검토한다 |
| ~~Q19~~ | ~~500페이지 blob 200MB~~ | **현 구조 유지 + 강력 주석.** `RENDER_DEFAULTS.targetPx` 와 `pdfjsConverter` 에 ⚠️ 경고를 달았다. 상세는 18.4 |
| ~~Q20~~ | ~~교재 글자 소실~~ | **`cMapUrl` 누락이 원인.** 해결 완료(10.5) |

### 18.1 문항 번호 (Q9)

`src/core/model/numbering.ts`. **문서에 저장하지 않는 파생값**이다.

저장하면 객체를 옮기거나 페이지를 지울 때마다 전체 번호를 다시 쓰는 커맨드가 필요하고,
그 커맨드가 히스토리를 오염시킨다(사용자가 하지 않은 변경이 undo 스택에 쌓인다).
위치에서 계산하면 문서를 건드리지 않고도 항상 최신이다.

| 항목 | 규칙 |
| --- | --- |
| 순서 | 페이지 순 → 같은 페이지 안에서 위에서 아래 → 같은 줄이면 왼쪽부터 |
| "같은 줄" 판정 | y 차이 **±8pt** (`Y_TOLERANCE_PT`). 교사가 눈으로 맞춘 빈칸은 몇 pt씩 어긋나 있는데, 그걸 다른 줄로 취급하면 번호가 지그재그로 붙는다 |
| 수동 오버라이드 | `label` 에 값이 있으면 그 값을 표시한다. 교재의 원래 번호와 맞추려는 경우가 있다 |
| 집계 순서 | 수동 label이 있어도 자동 번호(`number`)를 함께 부여한다. 리포트 집계에는 일관된 순서가 필요하다 |
| 대상 | Answer Box 3종만. 텍스트·도형·마스크는 번호가 없다 |

### 18.2 저장 (Q10, Q11)

**결정: S3 전제. 업로드는 호스트가 주입한다.**

라이브러리가 AWS SDK를 번들에 넣지 않는다. SDK가 크고, 브라우저에서 직접 S3에 쓰려면 자격증명이
필요한데 그건 서버가 발급하는 presigned URL로 해결하는 것이 표준이다. 자격증명을 클라이언트에 두는
구현을 제공하면 잘못된 사용을 유도한다.

두 가지 주입 경로를 제공한다.

```ts
// (a) presigned URL 방식 — 가장 흔한 형태
ports: {
  asset: createS3AssetPort({
    async getUploadUrl({ pageId, mime }) {
      const r = await fetch('/api/uploads', { method: 'POST', body: JSON.stringify({ pageId, mime }) })
      return r.json() // { uploadUrl, publicUrl, assetId }
    },
  }),
}

// (b) 업로드 경로가 완전히 다른 제품 — 함수만 넘긴다
<WorksheetEditor :upload-file="myUploader" />
```

**현재는 콘솔 출력으로 대체한다.** `createConsoleStoragePort()` 를 `ports.storage` 로 주면
자동저장 파이프라인이 실제와 같은 조건으로 돌고(5초 디바운스 · 최대 지연 30초 · 실패 지수 백오프
3회 · `beforeunload`/`visibilitychange` flush) 저장 대상만 콘솔이 된다. 실서버가 준비되면
이 port만 교체된다.

**blob 배경 가드는 우회하지 않는다.** 콘솔 출력에서도 `serializeDoc` 규칙을 존중해,
blob 배경이 남아 있으면 경고를 함께 찍는다. 실제 저장 전에는 `promoteBackgrounds()` 로
승격해야 한다(4.1) — 승격은 사용자 편집이 아니므로 히스토리에 남기지 않는다.

### 18.3 패널 폭 리사이즈 (Q17)

`src/vue/composables/usePanelSizes.ts`. 고정 폭(240 / 280)으로 시작하고, 패널 사이의 핸들을
드래그하면 조정된다. **한 번이라도 조정하면** `localStorage['lws.panelSizes.v1']` 에 남아
같은 브라우저에서 복원된다. 핸들 더블클릭으로 기본값 복귀.

| 결정 | 이유 |
| --- | --- |
| 조정한 적이 없으면 **저장하지 않는다** | 제품 기본값을 나중에 바꾸면, 손대지 않은 사용자는 새 기본값을 받고 직접 맞춘 사용자는 자기 값을 유지한다. 초기값까지 저장하면 기본값 변경이 아무에게도 전달되지 않는다 |
| 저장 실패를 **무시한다** | Safari 프라이빗 모드는 `localStorage` 쓰기에서 예외를 던진다. 패널 폭 때문에 편집기가 죽어서는 안 된다 |
| 읽을 때 범위를 **다시 클램프한다** | 저장 시점의 한계값이 지금과 다를 수 있고, 사용자가 직접 편집한 값이 들어올 수도 있다 |
| 폭은 **CSS 변수로 내려보낸다** | 레이아웃 규칙을 CSS와 JS 두 곳에서 정의하지 않는다. `tokens.css` 의 기본값을 인라인 스타일이 덮어쓴다 |

범위: 페이지 목록 160~420px, 인스펙터 220~480px.

### 18.9 dev 서버 LAN 노출과 secure context 문제 (2026.08.20)

dev 서버를 다른 기기(태블릿·다른 PC)에서 열 수 있도록 `server.host: true` 로 바꿨다.
`npm run dev` 가 `http://10.x.x.x:3100` 같은 주소를 함께 출력한다.
로컬만 열려면 `npm run dev:local`.

#### ⚠️ 이걸 켜면 바로 깨지는 것이 있었다

**LAN 주소는 secure context가 아니다.** `https://` 와 `localhost` 만 secure context이고,
`http://192.168.1.5:3100` 은 아니다. 그래서 다음 API가 **존재하지 않는다.**

| API | 우리 사용처 | 켜기 전 결과 |
| --- | --- | --- |
| `crypto.randomUUID` | 페이지·객체·보기 id 생성 (**13곳**) | `TypeError` — 페이지 추가·객체 생성이 전부 죽는다 |
| `navigator.clipboard` | 내보내기 링크 복사 | 복사 실패 |

id 생성이 죽으면 편집기가 아무것도 못 한다. LAN 노출과 함께 반드시 처리해야 하는 문제였다.

#### 해결 — `core/util/id.ts`

`crypto.getRandomValues` 는 **secure context 제한이 없다.** 그것으로 UUID v4를 직접 만든다.

```ts
export function createId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return uuidV4FromRandomValues() // getRandomValues 기반
}
```

**형식을 UUID v4로 맞춘다.** version(4)·variant(10xx) 비트를 규격대로 세팅한다. 형태만 비슷한
문자열을 쓰면 서버가 UUID 컬럼에 넣을 때 거부할 수 있고, 로그 파싱도 갈린다.

클립보드도 `copyText()` 로 감쌌다. `navigator.clipboard` 가 없으면 화면 밖 `<textarea>` +
`document.execCommand('copy')` 로 폴백한다. deprecated지만 insecure origin에서 복사가 되는
유일한 경로다. 그래도 실패하면 `false` 를 돌려주고 던지지 않는다 — 링크는 화면에 이미 보이므로
사용자가 직접 복사할 수 있다.

`/checks/` 에 `randomUUID` 를 일시적으로 제거해 폴백 경로를 강제로 타는 케이스를 넣었다.

#### 또 하나 — localStorage 오리진이 분리된다

`http://localhost:3100` 과 `http://10.1.0.112:3100` 은 **다른 오리진**이다.
프로토타입 저장(`SAVED_DOC`·`IMAGES`)과 패널 폭(`lws.panelSizes.v1`)이 주소마다 따로 쌓인다.

localhost에서 저장한 문서가 LAN 주소에서 안 보이는 것은 버그가 아니다. 실서버가 붙으면
사라지는 문제이므로(문서가 서버에 있게 된다) 별도 대응은 하지 않는다.

#### 보안

같은 네트워크의 누구나 접근할 수 있다. 신뢰할 수 있는 네트워크에서만 쓴다.
공용 Wi-Fi에서는 `npm run dev:local` 을 쓰거나 방화벽으로 막는다.

### 18.8 박스 색 편집 — 텍스트·Answer Box 3종 (2026.08.20)

텍스트 입력·단답형·서술형의 **테두리·배경·글자색**을 편집할 수 있게 했다.

**드롭박스도 함께 넣었다.** Answer Box 3종이 `AnswerBoxBase` 를 공유하므로 2종만 스타일을 갖게
하면 타입과 인스펙터 패널이 갈라진다. 요청 범위를 넓힌 것이 아니라 같은 기반을 일관되게 다룬 것이다.

#### "미지정" 을 유지하는 이유

`BoxStyle` 의 모든 필드가 optional이다. 값을 주지 않으면 CSS 토큰(`--lws-answerbox-bg` 등)의
기본값이 그대로 적용된다.

객체마다 색을 하드코딩해 채워 두면 **호스트 앱이 `--lws-*` 로 테마를 바꿀 수 없다**
(ARCHITECTURE §3). 그래서 세 가지 상태를 구분한다.

| 상태 | 뜻 | 렌더 |
| --- | --- | --- |
| `undefined` | 미지정 | CSS 토큰 기본값 (인라인 스타일을 내보내지 않는다) |
| `null` | 투명 / 테두리 없음 | `transparent` / `border-style: none` |
| 색 문자열 | 지정 | 인라인 스타일로 덮는다 |

인스펙터는 각 항목에 **체크박스**를 둔다. 색 선택기만 두면 항상 값이 채워져 이 구분이 사라진다.

`exactOptionalPropertyTypes` 때문에 optional 필드에 `undefined` 를 대입할 수 없어,
"지정 해제" 를 표현하는 `BoxStylePatch`(명시적 `| undefined`)와 `mergeBoxStyle` 을 따로 두었다.
`mergeBoxStyle` 은 `undefined` 키를 실제로 **제거**한다 — 단순 스프레드로는 `{ fill: undefined }`
가 남아 직렬화에 `"fill": null` 로 새어 나간다.

#### 학생 화면에도 적용된다

`toPublicDoc` 이 `style` 을 제거하지 않는다. 교사가 교재 배경에 맞춰 색을 조정했다면 학생도 같은
모양을 봐야 한다. 정답(`answers`·`correctChoiceIds`·`rubric`)만 제거 대상이다.
`/checks/` 에 이 사실을 단정하는 케이스를 넣었다.

#### 텍스트의 기본 배경은 투명

Answer Box는 미지정 시 토큰 기본값(반투명 흰 배경)을 따르지만, 텍스트는 **투명**이 기본이다.
텍스트는 문서 배경 위에 얹히는 게 자연스럽고, 색을 채우면 아래 교재 내용을 가린다.
`boxStyleToCss(style, { defaultFill: null })` 로 호출자가 정한다.

#### 색 편집을 한 곳에만 둔다

기존 `TextPanel` 의 글자색 입력을 제거하고 공용 `BoxStylePanel` 로 옮겼다. 도형은 자기 전용
패널에서 채움·테두리를 다루므로 `BoxStylePanel` 대상에서 제외한다 — 두 곳에서 같은 값을 편집하면
어느 쪽이 이기는지 알 수 없다.

### 18.7 `frontend-service` 도형 구현 조사와 알고리즘 이식 (2026.08.20)

같은 저장소의 `frontend-service` 가 lesson 도형을 어떻게 만들었는지 확인했다.

#### 조사 결과 — **fabric은 도형에 쓰지 않는다**

`fabric@6` 은 **화이트보드(자유 필기)** 전용이다(`src/components/modules/whiteboard/`).
lesson 의 도형 추가·편집은 **우리와 같은 접근**이다.

| 관심사 | frontend-service | 이 프로젝트 |
| --- | --- | --- |
| 도형 렌더 | SVG (`StaticShape.vue`) | SVG (`ShapeObjectView.vue`) |
| 드래그·리사이즈 | 순수 포인터 이벤트 (`useDraggableResize.ts` 862줄) | 순수 포인터 이벤트 (`pointerMachine` + `handles`) |
| 도형 기하 | `shapeGeometry.ts` 104줄 (삼각형 points, 화살표 chevron, 라운드 path) | `ShapeObjectView.vue` 안 |
| 좌표 | px + `emit('update:x')` 양방향 바인딩 | pt + 커맨드/히스토리 |
| 도형 종류 | 12종 (circle, ellipse-h/v, rect 3종, triangle 3종, arrow 3종) | 4종 (rect, ellipse, line, arrow) |

**규모**: `useDraggableResize` 862줄 + 편집기 UI 831줄 + 기하 104줄 = 약 1,900줄.
그중 상당 부분이 우리 구조와 다른 관심사다 — 코너별 회전 커서 SVG 동적 생성, alt-drag 복제,
`emit('update:*')` 양방향 바인딩, 편집 모드 전환.

**통째로 가져오지 않는다.** 좌표계(px vs pt)와 상태 관리(양방향 바인딩 vs 커맨드/히스토리)가
근본적으로 다르므로, 이식하면 우리 구조를 그쪽에 맞춰야 한다.

#### 이식한 것 — 회전 리사이즈 알고리즘 (약 40줄)

**조사 중 우리 쪽 버그를 찾았다. `resizeRect` 가 회전을 전혀 고려하지 않았다.**
회전 0에서만 맞고, 회전된 객체를 리사이즈하면 앵커를 중심으로 미끄러졌다. 오빠가 보고한
"회전 시 핸들이 반영되지 않음" 의 나머지 절반이다 — 핸들 표시는 18.6에서 고쳤지만 수학은
여전히 회전을 몰랐다.

`useDraggableResize` 에서 두 함수를 가져와 `geometry/handles.ts` 에 넣었다.

1. **델타 역회전** — 화면 기준 드래그 델타를 `-rotation` 만큼 돌려 객체 로컬 공간으로 옮긴다.
   없으면 45도 돌아간 객체에서 오른쪽으로 끌 때 대각선으로 커진다.
2. **`anchoredRect`** — 축 방향 보정 대신 **중심과 앵커**로 새 위치를 구한다.
   시작 중심에서 앵커까지의 오프셋을 회전 적용해 앵커의 절대 위치를 얻고, 새 크기의 오프셋으로
   새 중심을 역산한다. 회전 편집이 있는 편집기에서 사실상 표준 계산이다.

**추가 결정**: 회전된 객체는 **페이지 경계 클램프를 건너뛴다.** `constrainRect` 는 축 정렬 rect를
가정하는데 회전된 객체의 실제 점유 영역은 그보다 크다. 그 상태로 클램프하면 앵커가 어긋나
리사이즈가 튄다 — 회전된 객체가 페이지를 살짝 넘는 것보다 나쁜 결과다. 최소 크기는 그대로 보장한다.

**이동에는 역회전을 적용하지 않는다.** 회전된 객체도 화면에서 끌린 방향 그대로 움직이는 것이
자연스럽다. 로컬 공간으로 옮기면 오른쪽으로 끌었는데 비스듬히 가는 것처럼 보인다.

`/checks/` 에 회전 리사이즈 6케이스를 추가했다 — 앵커가 화면상 같은 자리에 머무는지를
0.01pt 오차로 단정한다.

#### 참고했지만 채택하지 않은 것

| 그쪽 방식 | 채택하지 않은 이유 |
| --- | --- |
| 코너 리사이즈에서 **항상** 종횡비 유지 | 도형만 다루면 자연스럽지만 우리는 Answer Box·텍스트도 같은 핸들을 쓴다. Shift로 선택하는 현재 방식을 유지 |
| 코너 hover 시 회전 커서 (별도 회전 핸들 없음) | 코너의 리사이즈/회전 판정 영역을 나눠야 해 히트 영역이 복잡해진다. 위쪽 별도 핸들이 대상이 분명하다 |
| `MAX_DIMENSION = 4000` 상한 | 우리는 페이지 크기로 이미 제한된다(회전 시 예외지만 pt 단위라 폭주 위험이 낮다) |
| 도형 12종 | 기획 8장이 요구하는 4종으로 충분하다. 필요해지면 `shapeGeometry.ts` 방식(SVG points 생성 유틸)을 그대로 참고할 수 있다 |

### 18.6 버그 수정 3건 (2026.08.20)

#### 페이지 삭제 — 기획 9.1의 우클릭 경로가 없었다

`removePage` 커맨드와 좌측 패널 하단 버튼은 있었지만, 기획 9.1이 요구하는 **우클릭 메뉴**와
9.3의 **확인 모달**이 없었다. 하단 버튼만으로는 어떤 페이지에 적용되는지 헷갈린다.

- `PageContextMenu.vue` — 썸네일 우클릭 → 복제 / 빈 페이지 추가 / 삭제.
  메뉴를 열면 그 페이지를 선택 상태로 만든다(대상이 눈에 보여야 한다).
  `position: fixed` 로 포인터 좌표에 붙인다 — 좌측 패널은 스크롤 컨테이너라 그 안에 두면
  메뉴가 잘리거나 스크롤에 딸려간다.
- `ConfirmDialog.vue` — **객체가 있는 페이지만** 확인을 받는다. undo가 있는 편집기에서 모든
  삭제를 확인받으면 방해만 되고, 여러 객체가 함께 사라지는 경우에만 알릴 가치가 있다.
- 마지막 1페이지는 메뉴에서 비활성 + 문구 표시(기획 9.2).

#### 도형 채움 색 선택기 폭이 무너졌다

`.lws-input` 의 `width: 100%` 를 색 선택기가 그대로 물려받아, flex 행(`.lws-field--inline`)
안에서 폭이 0에 가깝게 줄어 세로 막대처럼 보였다.

→ `.lws-input--color` 에 `width: 48px; flex: none` 을 못 박고, `.lws-field--inline` 을
`grid-auto-flow: column` 에서 `display: flex` 로 바꿨다. 그리드 셀 안(테두리 색)에서는
셀 폭을 채우도록 예외를 뒀다.

#### 드래그가 한 박자 늦게 따라왔다 (원인: rAF 코얼레싱)

`pointermove` 를 `requestAnimationFrame` 으로 묶어 프레임당 한 번만 처리했다. 그런데
**rAF 콜백에서 반응형 값을 바꾸면 그 프레임의 페인트에 반영되지 않고 다음 프레임에 들어간다.**
결과적으로 리사이즈·이동이 포인터를 한 프레임 뒤에서 따라오는 것이 눈에 보였다.

→ rAF를 제거하고 이벤트에서 즉시 처리한다. 브라우저가 이미 `pointermove` 를 프레임당 한 번
정도로 합쳐 보내고, 객체 상한이 페이지당 30개·문서 200개라 즉시 처리해도 계산량이 문제되지 않는다.
**PLAN 11.2의 "rAF 코얼레싱" 서술을 이 결정으로 대체한다.**

#### 회전 시 핸들이 따라오지 않았다

오버레이가 `rect` 만 읽고 `rotation` 을 무시했다. 도형은 돌아가는데 선택 테두리와 핸들은
축 정렬 상태로 남았다.

→ 핸들 좌표를 하나씩 회전 계산하는 대신 **감싸는 래퍼에 `rotate()` 를 걸고 핸들 자신은
역회전**시킨다. 핸들 위치는 객체를 따라 돌고 핸들 모양은 화면 기준 정사각형을 유지한다 —
기울어진 핸들은 잡기 어렵다. 선택 테두리도 같은 원점(`center`)으로 회전시켜 객체에 정확히 겹친다.

회전 드래그 중에는 미리보기 각도를 쓰므로 커밋 전에도 핸들이 실시간으로 따라간다.

#### Fabric.js 도입을 검토하고 채택하지 않았다

같은 저장소의 `frontend-service` 가 `fabric@6` 을 쓴다. 확인한 결과 **화이트보드(자유 필기)**
용도이고(`src/components/modules/whiteboard/`), 폼 요소가 필요 없는 성격이다.

Worksheet에 도입하려면 D2(DOM 렌더)를 뒤집어야 한다. Answer Box를 canvas에 그리면
**한글 IME·접근성·실제 `input`/`select` 를 모두 잃고**, 학생 뷰어의 폼 요소를 별도로 구현해야
하며 편집기와 뷰어의 렌더 경로가 갈라진다.

이번 문제는 도형 자체가 아니라 **오버레이가 회전을 반영하지 않은 것**과 **rAF 지연** 두 버그였고
둘 다 수정했다. 도형 기능이 기획 범위를 넘어 확장되면(다각형·자유 곡선·부분 서식) 그때 다시
검토한다.

### 18.5 프로토타입 저장 · 내보내기 버튼 임시 제거 ⚠️ (2026.08.20)

**실서버가 없어서 두 가지를 임시로 바꿨다. 둘 다 되돌리기 쉽게 격리했다.**

#### 상단바 [내보내기] → [저장]

과제 생성 API가 없어 [내보내기] 를 누르면 빈 팝업만 뜬다(실제로 배경이 투명하게 비치는 상태로
확인됐다). 프로토타입 확인을 방해하므로 버튼을 프로토타입 저장으로 대체했다.

**남아 있는 것** — `guardExport` 검증 게이트, `ExportDialog` 컴포넌트, `request-export` 이벤트,
`requestExport()` expose. 호스트가 자기 UI에서 내보내기를 트리거하면 그대로 동작한다.

**되돌리는 방법** — `TopBar.vue` 의 버튼을 `emit('export')` 로, `WorksheetEditor.vue` 의
`@manual-save` 를 `@export="onRequestExport"` 로 바꾼다.

#### 팝업이 투명하게 보였던 원인

`--lws-*` 토큰이 `.lws-editor` 스코프에만 정의돼 있었다. 팝업을 편집기 밖(앱 루트, teleport 대상)에
렌더하면 토큰을 상속받지 못해 `background: var(--lws-surface)` 가 빈 값이 되고 배경이 투명해진다.
→ `tokens.css` 의 셀렉터에 `.lws-modal-scrim` 을 추가해 해결했다.

#### `src/prototype/` — localStorage 저장

| 키 | 내용 |
| --- | --- |
| `IMAGES` | `{ [assetId]: base64 data URL }` |
| `SAVED_DOC` | 문서 JSON. 배경 `url` 은 `local:<assetId>` 참조 |

이미지와 문서를 나눈 이유: 한 덩어리면 문서 구조를 확인할 때마다 수백 KB의 base64를 헤집어야 한다.
나눠 두면 `SAVED_DOC` 만 읽어 구조를 볼 수 있고, 실제 서버가 이미지를 별도 스토리지에 두는 형태와도
같은 모양이 된다. 뷰어(M10)가 두 키를 읽어 `local:` 참조를 base64로 되돌려 조합한다.

**⚠️ localStorage 용량이 실질적 제약이다.** 오리진당 5~10MB인데 1654px JPEG 한 페이지가 약 400KB이고
base64는 +33% 팽창하므로 **약 9~18페이지에서 한계에 닿는다.** 초과하면 `PrototypeQuotaError` 를
던진다 — 조용히 잘라내면 나중에 없는 페이지를 찾게 된다.
**이것이 Q11에서 S3를 택한 이유이기도 하다. 실제 제품이 이 방식으로 갈 수는 없다.**

**삭제 절차** (`src/prototype/README.md` 에도 있다):
1. `src/prototype/` 디렉토리 삭제
2. `src/index.ts` 의 "프로토타입 (임시)" 블록 삭제
3. `WorksheetEditor.vue` 의 `onManualSave` 블록과 import 삭제, 상단바 버튼 복원

#### 자동저장 로그

문서 전체는 `console.debug` 로 낸다. 크롬 콘솔의 기본 필터가 debug(Verbose) 레벨을 숨기므로
5초마다 도는 자동저장이 평소 콘솔을 어지럽히지 않고, 확인이 필요할 때 Verbose를 켜면 보인다.
요약과 blob 배경 경고는 평소에도 보여야 하므로 각각 `log`/`warn` 으로 남긴다.

### 18.4 500페이지 메모리 (Q19) ⚠️

**현 구조를 유지한다.** 전량 선변환(D12)이므로 배경 blob이 모두 살아 있다.

| 해상도 | 페이지당 | 500페이지 |
| --- | --- | --- |
| 1654px (기본) | 약 400KB | **약 200MB** |
| 1240px | 약 270KB | 약 135MB |
| 992px | 약 115KB | 약 58MB |

브라우저가 blob을 디스크로 내리므로 JS heap은 아니지만 무시할 양이 아니다.
실사용 대다수인 수십 페이지 문서에서는 문제가 없다.

**극단 케이스가 문제가 되면 우선순위는 이 순서다.**
1. `RENDER_DEFAULTS.targetPx` 를 낮춘다 — 가장 효과가 크고, 좌표가 pt라 **객체 위치가 움직이지
   않는다**(5.7). 화질만 내려간다.
2. 비활성 페이지의 blob을 해제한다 — 페이지 전환 지연을 만들므로 D12의 전제와 상충한다.
   그래서 지금은 도입하지 않았다.

경고는 `src/core/config/defaults.ts` 의 `targetPx` 와 `src/core/pdf/pdfjsConverter.ts` 두 곳에
⚠️ 표시로 달려 있다.

## 19. 지금 하지 않는 것

- **문서 저장·자동저장** (M8로 분리, Q11 결정 대기)
- **자동 테스트 러너** (D17 — 17장의 대체 안전망으로 진행)
- **무한 캔버스 팬** (D9 — 스크롤 기반으로 확정)
- **Editor의 연속 페이지 스크롤** (D8 — 한 페이지씩으로 확정. Viewer는 연속)
- ~~React 래퍼~~ → **취소(2026.08.20). D19 로 착수한다.** 코어를 프레임워크 무관으로 유지해 온 값이
  여기서 회수됐다 — 바꿀 대상은 UI 층뿐이다(20.1)
- Svelte · Solid 래퍼 (facade 계약이 프레임워크를 모르므로 필요해지면 ~100줄이다 — 20.2)
- Web Components / Shadow DOM 배포 (`contenteditable` 의 selection API 가 shadow root 안에서
  다르게 동작해 한글 IME 처리(6.5)를 다시 검증해야 한다. 얻는 것이 없다)
- 과제(Assignment) 생성·마감·보관, Class 연동, QR 생성, 링크 발급 — 호스트 앱/서버
- Report·수동 채점 화면
- Google Drive 연동 실제 구현(탭 자리만)
- 문서 내 텍스트 검색·추출 (기획 2.3: 배경이 이미지라 미지원)
- PDF 재생성·인쇄 내보내기 (`pdfSpace.ts` 자리만 마련)
- 실시간 협업 편집
- SSR 렌더링 (D16)
- 네이티브 앱


## 20. 프레임워크 무관 재구조화 (2026.08.20 착수)

목표는 하나다. **Vue 앱과 React 앱에서 같은 방식으로 쓰이는 공개 npm 패키지.**

```tsx
// React
import { PDFCanvasEditor } from 'pdf-canvas-kit/react'
;<PDFCanvasEditor doc={doc} ports={ports} onChange={setDoc} />
```

```vue
<!-- Vue -->
<script setup>
import { PDFCanvasEditor } from 'pdf-canvas-kit/vue'
</script>
<template><PDFCanvasEditor :doc="doc" :ports="ports" @change="onChange" /></template>
```

### 20.1 무엇을 버리고 무엇을 남기는가

| 대상 | 줄수 | 처분 |
| --- | --- | --- |
| `src/core/**` | 4,957 | **그대로.** Vue 를 import 하지 않으므로 이미 프레임워크 무관이다(2.1) |
| `src/vue/composables/**` | 1,015 | **기계적 이식.** `ref`/`computed`/`watch` 만 쓰는 컨트롤러 로직이다 → `src/controller/` |
| `WorksheetEditor.vue` 의 `<script>` | ~900 | **기계적 이식.** 같은 이유. 템플릿과 분리해 컨트롤러로 |
| SFC 34개의 `<template>` | ~2,700 | **재작성.** 여기가 실제 리라이트 대상이다 |
| `src/styles/**` | — | 그대로. 프리픽스만 `lws-` → `pck-` (D21) |

즉 4,771줄 전체가 아니라 **~2,700줄이 실제 재작성 범위**다. 나머지는 반응성 API 의 모양을
Vue 와 같게 맞추는 것(D20)으로 이식된다.

### 20.2 새 레이어

```
src/
├─ core/          그대로 — 순수 TS, 프레임워크 무관
├─ dom/           ★ 신규 — 반응성 프리미티브 + DOM 렌더 층
│   reactive.ts     signal · computed · effect · watch · batch  (~150줄)
│   h.ts            el() · text() · when() · list()             (~200줄)
│   editor/         재작성된 UI (구 src/vue/editor/**)
│   createEditor.ts ★ imperative facade — 프레임워크 래퍼의 유일한 접점
├─ controller/    ★ 신규 — 구 composables + 루트 스크립트 (DOM 참조는 갖지만 프레임워크는 모름)
├─ react/         ★ 신규 — <PDFCanvasEditor /> (~120줄)
├─ vue/           ★ 재작성 — <PDFCanvasEditor /> (~60줄, SFC 아님·defineComponent)
└─ styles/        그대로 (프리픽스만 교체)
```

**facade 계약** — 래퍼가 의존하는 표면은 이것뿐이다. 프레임워크가 늘어도 이 계약은 안 바뀐다.

```ts
createPdfCanvasEditor(container: HTMLElement, props: EditorProps): EditorHandle

interface EditorHandle {
  update(next: Partial<EditorProps>): void   // prop 변경 반영
  destroy(): void                            // 멱등 — React StrictMode 이중 마운트 대비
  // 구 defineExpose 가 그대로 여기로 온다
  requestExport(): void
  validateForExport(): ExportGuardResult
  zoomTo(scale: number): void
  fitWidth(): void
  fitPage(): void
  goToPage(index: number): void
  goToPageId(id: string): void
  flushSave(): Promise<void>
  promoteBackgrounds(): Promise<void>
}
```

이벤트는 `onChange` · `onSaveStateChange` · `onRequestExport` · `onBack` 콜백 prop 으로 받는다.
Vue 래퍼가 이를 `emit` 으로 되돌려주므로 Vue 쪽 사용감은 지금과 같다.

### 20.3 부수 이득 — 빌드가 단순해진다

SFC 가 사라지면 `@vitejs/plugin-vue` · `vue-tsc` 가 필요 없다. `.d.ts` 생성이 평범한 `tsc` 가 된다.
`vue` 는 optional peer 로 내려가고, `react` 도 같은 자격으로 올라온다 — 둘 다 없어도
`import 'pdf-canvas-kit'` (코어 + facade)는 동작한다.

```jsonc
"peerDependencies":     { "react": ">=18", "react-dom": ">=18", "vue": ">=3.4" },
"peerDependenciesMeta": { "react": { "optional": true }, "react-dom": { "optional": true },
                          "vue":   { "optional": true } }
```

### 20.4 단계 (R 트랙)

기존 M 트랙(기능)과 구분해 **R** 로 번호를 붙인다. 각 단계 끝에서 네 게이트가 통과해야 다음으로 넘어간다.

```bash
npm run typecheck && npm run lint && npm run build && npm run checks
```

| # | 단계 | DoD |
| --- | --- | --- |
| **R0** ✅ | 안전장치 · 베이스라인 | `.gitignore` · `.prettierrc` 추가 → `npm run lint` 통과 ✅ (216개 파일 불일치 → 0). 리라이트 전 전체 코드 커밋 🟡 대기 |
| **R1** | 리네임 · 패키징 골격 | `pdf-canvas-kit` · `pck-` · MIT · `exports` 맵 3엔트리. `grep -ri lumiteach` 가 **0건** |
| **R2** 🟡 | 반응성 · DOM substrate | `reactive.ts` ✅ (`/checks/` 반응성 50 케이스 추가 → **129 / 129 통과**, `npm run checks` 로 헤드리스 실행). `h.ts` 남음 |
| **R3** | 컨트롤러 이식 | composables + 루트 스크립트 → `src/controller/`. ESLint 경계 규칙에 `controller` 추가 |
| **R4** | 객체 · 페이지 렌더 | 객체 7종 + `PageFrame` + 배경 + 오버레이 + 핸들. `/editor-dom/` 에서 렌더·선택 확인 |
| **R5** | 스테이지 | 줌 · 팬 · 포인터 배선. `/editor-dom/` 에서 생성·이동·리사이즈·회전 동작 |
| **R6** | 크롬 | 상단바 · 툴바 · 썸네일 · 줌 컨트롤 · 다이얼로그 · 컨텍스트 메뉴 |
| **R7** | 인스펙터 | 패널 8개. 검증 경고 · 박스 색 편집 포함 |
| **R8** | 프레임워크 래퍼 | `/react` · `/vue` 엔트리 + 데모 2개. **양쪽에서 같은 조작이 다 되는지 손으로 확인** |
| **R9** | 배포 준비 · Vue SFC 층 삭제 | `npm pack` 산출물을 React 앱·Vue 앱에 각각 설치해 동작. 구 `src/vue/editor/**` 삭제. 문서 3종 갱신 |

**R4~R7 동안 `/editor/`(Vue)는 계속 동작한다**(D23). 신규 화면은 `/editor-dom/` 에서 따로 자란다.
둘을 나란히 열어 대조하는 것이 이 리라이트의 유일한 회귀 검출 수단이다.

### 20.5 인정하는 리스크

| 리스크 | 왜 남는가 | 완화 |
| --- | --- | --- |
| geometry · 상호작용 회귀 | 자동 테스트가 없다(D17). 순수 함수는 `/checks/` 가 잡지만 드래그·줌·IME 는 안 잡힌다 | D23 병행 유지 + 각 R 단계 DoD 를 손으로 확인 |
| 한글 IME 회귀 | `contenteditable` 조합 처리는 6.5 의 두 규칙에 걸려 있고, 새 렌더러에서 다시 지켜야 한다 | D20 의 미세 반응성으로 편집 중 노드를 아예 건드리지 않게 만든다. 축소·확대 배율 양쪽에서 손으로 확인 |
| React StrictMode | 개발 모드에서 effect 가 두 번 돈다. `destroy()` 가 멱등이 아니면 리스너가 두 벌 남는다 | facade 의 `destroy()` 를 멱등으로 만들고 데모를 StrictMode 로 띄워 확인 |
| prop 동기화 비용 | React 는 렌더마다 `update()` 를 부른다 | `update()` 가 값이 실제로 바뀐 signal 만 쓰도록 얕은 비교를 넣는다 |
