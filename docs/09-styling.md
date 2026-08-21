# 스타일 오버라이드

두 단계다. 위에서부터 시도하면 대부분 첫 단계에서 끝난다.

| 원하는 것 | 방법 |
| --- | --- |
| 색·폰트·간격·패널 폭·모달 모양 | **토큰** — `--pck-*` 를 덮어쓴다 |
| 배치·정렬·배경 이미지처럼 값으로 안 되는 것 | **CSS 규칙을 그대로 쓴다.** 특이도 싸움이 없다 |

내 모달을 쓰고 싶으면 스타일이 아니라 [다이얼로그 위임](12-dialogs.md)이다.

---

## 1. 토큰 (74개)

감싸는 요소나 `:root` 어디서든 덮어쓴다.

```css
.my-app .pck-editor {
  --pck-accent: #3b82f6;
  --pck-topbar-bg: #101014;
  --pck-pagelist-width: 200px;
  --pck-modal-radius: 0;
  --pck-btn-padding: 10px 24px;
}
```

### 영역별 접두사

| 접두사 | 무엇 |
| --- | --- |
| (없음) | `bg` `surface` `line` `ink` `accent` `state-*` — 팔레트 |
| `font` `text-*` `space-*` `radius*` `shadow` | 타이포·간격 |
| `topbar` | 상단 바 |
| `pagelist` | 좌측 페이지 목록 |
| `stage` `page` | 페이지 뷰 영역과 종이 |
| `inspector` | 우측 패널 |
| `toolbar` | 도구 바 |
| `obj` | 캔버스 객체 (선택·핸들·커스텀 틀) |
| `thumb-obj` | 썸네일의 객체 표시 **기본값** |
| `modal` | 팝업 (scrim·배경·폭·라운드·그림자·z-index) |
| `btn` `input` `menu` | 버튼·입력·컨텍스트 메뉴 |
| `viewer` | 뷰어 (페이지 간격) |

전체 목록과 기본값은 [src/styles/tokens.css](../src/styles/tokens.css).

### ⚠️ 토큰이 아닌 것

동작에 영향을 주는 수치는 토큰이 아니다. 레이아웃 코드와 검증이 숫자로 필요하다.

```ts
import { LIMITS, EDITOR_DEFAULTS, RENDER_DEFAULTS } from '@h_domi/pdf-canvas-kit'
```

| | |
| --- | --- |
| `LIMITS` | 페이지·객체 한도. **서버와 같아야 한다** |
| `EDITOR_DEFAULTS` | 새 객체 크기, 줌 단계, 스냅 |
| `RENDER_DEFAULTS` | 이미지 해상도·포맷 |

---

## 2. CSS 규칙 — `@layer` 라서 특이도 싸움이 없다 ★

패키지 스타일 **전체**가 `@layer pdf-canvas-kit` 안에 있다.

> 캐스케이드 레이어에 속한 규칙은 **레이어 밖 규칙에게 항상 진다 — 특이도와 무관하게.**

그래서 아래 한 줄이 이긴다.

```css
/* !important 도, .my-app .pck-x 같은 특이도 올리기도 필요 없다 */
.pck-modal {
  border-radius: 0;
  box-shadow: none;
}

.pck-toolbar {
  justify-content: center;
}

.pck-stage {
  background-image: linear-gradient(#eee 1px, transparent 1px);
  background-size: 24px 24px;
}
```

레이어가 없으면 소비자는 패키지보다 특이도를 높여야 하고, **패키지가 선택자를 하나 늘리는
순간 조용히 깨진다.** `!important` 를 쓰라고 안내하는 것도 같은 문제를 미루는 것뿐이다.

### 레이어 순서를 직접 정하기

```css
/* 호스트 레이어를 패키지 뒤에 두면 그 안의 규칙도 이긴다 */
@layer pdf-canvas-kit, my-app;

@layer my-app {
  .pck-topbar { background: #000; }
}
```

### 토큰은 레이어 밖이다

커스텀 프로퍼티 선언은 레이어에 넣지 않았다. 토큰 오버라이드는 이미 의도된 첫 경로인데 한
단계 더 낮출 이유가 없다 — 값 하나만 바꾸려는 호스트가 레이어 규칙을 몰라도 되게 둔다.

---

## 주요 클래스

**클래스 이름은 공개 계약으로 취급한다.** 바뀌면 breaking change다.

### 레이아웃

| | |
| --- | --- |
| `.pck-editor` | 편집기 루트 (3분할 그리드) |
| `.pck-topbar` | 상단 바 |
| `.pck-main` | 툴바 + 스테이지 영역 |
| `.pck-pagelist` | 좌측 패널 |
| `.pck-inspector` | 우측 패널 |
| `.pck-resizer` | 패널 폭 조절 손잡이 |
| `.pck-viewer` | 뷰어 루트 (스크롤 컨테이너) |

### 크롬

| | |
| --- | --- |
| `.pck-panel-head` | 패널 제목 (PAGES · INSPECTOR) |
| `.pck-toolbar` · `.pck-tool` | 도구 바와 버튼 |
| `.pck-thumb-item` · `.pck-thumb` · `.pck-thumb-paper` | 썸네일 |
| `.pck-thumb-obj` | 썸네일의 객체 표시 (`data-type` 속성 있음) |
| `.pck-pagemeta` | "1 / 50 · A4 세로" |
| `.pck-stage-controls` · `.pck-zoom-btn` | 줌 컨트롤 |
| `.pck-badge` | 저장 상태 배지 (`.is-saving` · `.is-error`) |
| `.pck-icon-btn` | 아이콘 버튼 (`data-icon` 속성 있음) |

### 캔버스

| | |
| --- | --- |
| `.pck-stage` · `.pck-stage-pad` | 스크롤 영역과 여백 |
| `.pck-page-frame` | 페이지 프레임 (`size × scale`) |
| `.pck-page` | 페이지 (pt 크기 + `transform: scale()`) |
| `.pck-obj` | 객체 래퍼 |
| `.pck-obj-text` · `.pck-obj-shape` · `.pck-obj-mask` | 유형별 뷰 |
| `.pck-obj-custom` · `.pck-obj-custom-content` | 커스텀 객체 틀과 콘텐츠 |
| `.pck-select-box` · `.pck-handle` · `.pck-marquee` | 선택 오버레이 |

### 폼 · 팝업

| | |
| --- | --- |
| `.pck-modal-scrim` · `.pck-modal` | 팝업 배경과 시트 |
| `.pck-primary-btn` · `.pck-ghost-btn` · `.pck-dashed-btn` | 버튼 |
| `.pck-input` (`--num` `--color` `--narrow`) · `.pck-textarea` | 입력 |
| `.pck-field` · `.pck-field-label` · `.pck-field-error` | 인스펙터 필드 |
| `.pck-context-menu` | 우클릭 메뉴 |

### 뷰어

| | |
| --- | --- |
| `.pck-viewer-pages` | 페이지 세로 스택 |
| `.pck-viewer-obj` | 객체 래퍼 |
| `.pck-viewer-custom` · `.pck-viewer-custom-content` | 커스텀 객체 |
| `.pck-viewer-empty` | 빈 상태 |

---

## 다크 테마 예제

```css
.pck-editor,
.pck-viewer,
.pck-modal-scrim {
  --pck-bg: #17141f;
  --pck-surface: #221d2e;
  --pck-surface-sunken: #1b1725;
  --pck-line: #352c47;
  --pck-ink: #ece7f7;
  --pck-ink-muted: #9b91b0;
  --pck-accent: #6d4aff;
  --pck-topbar-bg: #12101c;
  --pck-topbar-ink: #efeaff;
  --pck-pagelist-bg: #1b1725;
  --pck-stage-bg: #17141f;
  --pck-inspector-bg: #1b1725;
  --pck-input-bg: #2a2338;
  --pck-input-ink: #ece7f7;
  --pck-modal-bg: #221d2e;
  /* 종이는 흰색으로 둔다 — PDF 배경이 흰색이다 */
  --pck-page-bg: #ffffff;
}
```

`.pck-modal-scrim` 을 함께 쓰는 이유: 팝업은 편집기 **밖**(앱 루트)에 렌더될 수 있어서
`.pck-editor` 안에서만 정의된 토큰을 상속받지 못한다.

전체 테마는 [examples/react/src/theme.css](../examples/react/src/theme.css) — 상단바·툴바·패널·
스테이지·인스펙터·뷰어를 모두 덮고, 예제의 [테마 ON/OFF] 버튼으로 켜고 끌 수 있다.

---

## 아이콘을 CSS 로 바꾸기

아이콘 버튼에 `data-icon` 이 붙어 있다.

```css
.pck-icon-btn[data-icon='undo'] {
  font-size: 0;                                    /* 글리프를 숨긴다 */
  background: url(undo.svg) center / 16px no-repeat;
}
```

SVG·컴포넌트로 교체하는 다른 경로는 [아이콘](11-icons.md).

---

## ⚠️ 밝은 팔레트로 고정하면 `color-scheme` 도 고정한다

패키지 기본값은 `color-scheme: light dark` 라 OS 다크 모드를 따라간다
([호스트 앱에 녹이기](15-integration.md)). 토큰을 밝은 값으로 하드코딩하면 짝이 맞지 않는다.

```css
.pck-editor,
.pck-viewer,
.pck-modal-scrim {
  color-scheme: light;   /* ← 함께 준다 */

  --pck-bg: #f4f7f7;
  --pck-surface: #ffffff;
  --pck-ink: #123330;
}
```

체크박스 · 드롭다운 · 색 선택기처럼 **브라우저가 직접 그리는** 컨트롤은 CSS 로 색을 줄 수
없다. `color-scheme` 만이 그것을 정한다. 이 속성을 빠뜨리면 밝은 편집기 안에서 체크박스만
어둡게 남는다.

> 패키지의 버튼·입력은 전부 `color` 를 우리 토큰으로 명시한다. UA 스타일시트가 `<button>` 에
> 주는 `color: ButtonText` 는 상속이 아니라 **시스템 색**이라, 그것에 의존하면 다크 모드에서
> 흰 버튼에 흰 글자가 된다. `npm run verify:tarball` 이 이 규칙을 검사한다.
