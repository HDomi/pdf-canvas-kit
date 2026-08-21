# 글꼴

텍스트 객체의 글꼴을 인스펙터에서 고를 수 있다. 목록은 호스트가 정한다.

- [기본 목록](#기본-목록)
- [⚠️ 패키지는 웹폰트를 싣지 않는다](#️-패키지는-웹폰트를-싣지-않는다)
- [내 폰트만 보이게 하기](#내-폰트만-보이게-하기)
- [웹폰트를 실제로 불러오기](#웹폰트를-실제로-불러오기)
- [내보내기와 글꼴](#내보내기와-글꼴)
- [글꼴 선택을 아예 막기](#글꼴-선택을-아예-막기)
- [문서에 저장되는 값](#문서에-저장되는-값)

---

## 기본 목록

| 라벨 | `font-family` 스택 | 라이선스 |
| --- | --- | --- |
| 기본 산세리프 | `sans-serif` | — (브라우저 제네릭) |
| 기본 세리프 | `serif` | — |
| 고정폭 | `monospace` | — |
| 시스템 UI | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | — (OS 폰트) |
| Pretendard | `"Pretendard", sans-serif` | OFL 1.1 |
| Noto Sans KR | `"Noto Sans KR", sans-serif` | OFL 1.1 |
| Noto Serif KR | `"Noto Serif KR", serif` | OFL 1.1 |
| 나눔고딕 | `"Nanum Gothic", sans-serif` | OFL 1.1 |
| 나눔명조 | `"Nanum Myeongjo", serif` | OFL 1.1 |
| IBM Plex Sans KR | `"IBM Plex Sans KR", sans-serif` | OFL 1.1 |
| 고운돋움 | `"Gowun Dodum", sans-serif` | OFL 1.1 |

한글 폰트는 **상용 이용이 무료**인 것만 골랐다. 전부 SIL Open Font License 1.1 이다.

```ts
import { DEFAULT_FONTS } from '@h_domi/pdf-canvas-kit'
```

---

## ⚠️ 패키지는 웹폰트를 싣지 않는다

목록에 있는 것은 **가족 이름뿐**이다. `.woff2` 파일도, `@font-face` 도, Google Fonts 링크도
들어 있지 않다.

| | 왜 |
| --- | --- |
| 용량 | 한글 폰트는 서브셋 없이 1.5~4MB 다. 안 쓰는 소비자도 받는다 |
| 라이선스 | 재배포 조건은 폰트마다 다르다. 파일을 싣는 순간 이 패키지가 그 조건을 진다 |
| 중복 | 앱이 이미 같은 폰트를 자기 방식으로 불러오고 있으면 두 번 받는다 |

그래서 **불러오지 않은 폰트를 고르면 폴백으로 그려진다.** 글자가 사라지지는 않는다 —
모든 기본 스택 끝에 `sans-serif` · `serif` · `monospace` 가 있다.

인스펙터의 글꼴 항목에도 그 사실을 한 줄로 적어 두었다(`inspector.fontFamilyNote`).
문구는 [문구 · 번역](10-strings.md)으로 바꿀 수 있다.

---

## 내 폰트만 보이게 하기

```ts
import { configureFonts } from '@h_domi/pdf-canvas-kit'

// 앱 부트스트랩에서 한 번.
configureFonts([
  { stack: '"Pretendard Variable", Pretendard, sans-serif', label: '본문' },
  { stack: '"Gmarket Sans", sans-serif', label: '제목' },
  { stack: 'monospace', label: '코드' },
])
```

**병합이 아니라 교체다.** 앱이 실제로 불러오는 폰트만 보여야 하기 때문이다 — 없는 폰트를
고르면 폴백으로 그려져 "왜 안 바뀌지" 가 된다.

`stack` 이 문서에 저장되는 값이고 `label` 이 인스펙터에 보이는 이름이다. `label` 은 자유롭게
쓴다 — 위 예시처럼 폰트 이름이 아니라 **역할**로 부르는 편이 편집자에게 낫다.

> ⚠️ 모듈 수준 상태다. `configureStrings` · `configureIcons` 와 같다(D32). 편집기가 이미 떠
> 있는 상태에서 바꾸면 이미 그려진 인스펙터는 갱신되지 않는다.

---

## 웹폰트를 실제로 불러오기

패키지가 하지 않으므로 앱이 한다. 방법은 셋 다 된다.

### Google Fonts

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap"
  rel="stylesheet"
/>
```

### CDN (Pretendard)

```css
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css');
```

### 자체 호스팅 (권장)

오프라인 환경, 사내망, 개인정보 정책이 외부 요청을 막는 경우에 필요하다.

```css
@font-face {
  font-family: 'Pretendard';
  src: url('/fonts/Pretendard-Regular.subset.woff2') format('woff2');
  font-weight: 400;
  /* 로드 전에는 폴백으로 그리고, 오면 갈아탄다 — 빈 화면을 만들지 않는다. */
  font-display: swap;
}
```

한글은 **서브셋**을 꼭 만든다. 원본 4MB 가 실사용 글자만 남기면 수백 KB 로 떨어진다.

---

## 내보내기와 글꼴

내보내기는 화면을 그대로 래스터화한다. 즉 **브라우저에 폰트가 로드된 뒤**에 내보내야 결과에
반영된다. 로드 전에 내보내면 폴백 글꼴로 굳는다.

```ts
// 폰트가 준비된 뒤에 내보낸다.
await document.fonts.ready
const doc = editor.toPublicDoc()
```

`document.fonts.ready` 는 **현재 문서에서 쓰이고 있는** 폰트만 기다린다. 아직 화면에 없는
글꼴은 포함되지 않으므로, 특정 폰트를 확실히 기다려야 하면 명시한다.

```ts
await document.fonts.load('400 12px Pretendard')
```

자세한 것은 [내보내기](08-export.md).

---

## 글꼴 선택을 아예 막기

빈 배열을 주면 인스펙터에서 글꼴 항목이 **사라진다.**

```ts
configureFonts([])
```

문서 서식을 앱이 통제하고 편집자에게는 내용만 맡기는 경우에 쓴다.

---

## 문서에 저장되는 값

`TextObject['style'].fontFamily` 에 **CSS `font-family` 스택 문자열**이 그대로 들어간다.

```json
{
  "type": "text",
  "text": "안녕",
  "style": { "fontFamily": "\"Noto Sans KR\", sans-serif", "fontSize": 12 }
}
```

스택을 그대로 저장하는 이유: 문서가 다른 앱·다른 기기에서 열려도 **그 자리에서 폴백이
결정된다.** 폰트 id 만 저장하면 그 id 를 해석할 표가 어디에도 없다.

현재 값이 `configureFonts()` 목록에 없으면 인스펙터의 드롭다운은 **빈 선택**으로 남는다.
없는 항목을 몰래 추가하지 않는다 — 다른 앱에서 온 문서라는 사실이 보여야 하기 때문이다.

---

관련: [스타일 오버라이드](09-styling.md) · [문구 · 번역](10-strings.md) ·
[API 레퍼런스](13-api.md) · [내보내기](08-export.md)
