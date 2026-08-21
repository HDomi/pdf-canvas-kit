# 함정 모음

**실제로 겪은 문제와 원인**만 적었다. 추측한 것은 없다.

---

## 설정

### pdf.js 자산이 404 — worker MIME 에러가 함께 난다

```
pdf.worker.mjs  404 (Not Found)
Failed to load module script: MIME type "text/html"
```

두 번째 줄은 첫 번째의 **결과**다 — 404 응답의 HTML 본문을 module script 로 읽으려다 실패한다.
자산을 복사하지 않은 것이 원인이다. [시작하기](01-getting-started.md#1-pdfjs-런타임-자산을-서빙한다--필수-).

### PDF 는 열리는데 한글만 안 보인다

`cMapUrl` 을 빠뜨렸다. **에러가 나지 않는다** — pdf.js 가 CID 폰트 매핑을 못 찾고 글자를
조용히 버린다. `workerSrc` 만 설정하고 "됐다" 고 넘기는 것이 가장 흔한 실수다.

### 편집기가 접히고 아이콘이 밖으로 삐져나온다

컨테이너에 높이가 없다. `.pck-editor` 는 `height: 100%` 이므로 부모가 확정 높이를 줘야 한다.
flex 안이면 `min-height: 0` 도 필요하다.

### 편집기가 좁아서 캔버스가 안 보인다

편집기는 3분할이고 페이지 목록 240px + 인스펙터 280px 를 **고정으로** 먹는다. 화면 절반이나
사이드바 옆에 넣으면 캔버스에 남는 폭이 400px 대다.

편집기와 뷰어를 한 화면에 두려면 **나란히가 아니라 탭**으로 전환한다.

---

## React

### `ref.current` 가 `null` 이고 `handle` 메서드가 `undefined`

`?.` 때문에 에러도 나지 않아 **버튼이 죽은 것처럼** 보인다.

이건 패키지 버그였고 고쳤다(0.1.0). 그래도 같은 패턴을 직접 쓸 때 주의한다 —
`useImperativeHandle` 은 **layout effect** 라 편집기를 만드는 `useEffect` 보다 먼저 돈다.

### 탭 전환 후 뷰어 배율이 굳는다

`display: none` 으로 숨기면 폭이 0 이 되고, `ResizeObserver` 가 그 0 을 측정한다.
`visibility: hidden` 을 쓴다.

```css
.pane[hidden] { display: block; visibility: hidden; }
```

### 편집기가 두 벌 보인다 (StrictMode)

`destroy()` 가 멱등이 아니면 생긴다. 패키지 facade 는 멱등이므로 커스텀 마운트 코드를 쓸 때만
문제가 된다.

---

## Vue

### `handle` 이 `any` 로 잡혀 오타가 통과한다

Vue 의 `expose()` 는 **런타임 API 라 `.d.ts` 에 타입을 남기지 않는다.** `ref` 타입을 명시한다.

```ts
const editor = ref<PDFCanvasEditorRef | null>(null)
```

### prop 을 바꿨는데 반영되지 않는다

`watchEffect` 안에서 optional chaining 뒤에 prop 을 읽으면 **의존성이 등록되지 않는다.**

```ts
// ✗ handle 이 null 이면 인자 표현식도 평가되지 않는다
watchEffect(() => handle?.update({ doc: props.doc }))

// ✓ prop 을 먼저 읽는다
watchEffect(() => {
  const next = { doc: props.doc }
  handle?.update(next)
})
```

이건 패키지 버그였고 고쳤다(0.1.0). 같은 패턴을 직접 쓸 때 주의한다.

---

## 도형 · 텍스트

### 인스펙터에서 모양을 바꿨는데 캔버스가 안 바뀐다

`0.1.0-beta.1` 까지의 버그다. 뷰어에서는 정상으로 보여서 "편집기만 안 바뀐다" 로 나타났다 —
뷰어는 문서가 교체될 때 노드를 새로 만들기 때문이다.

원인은 렌더 층에서 `shape` 을 **한 번만 읽고** `when()` 으로 분기한 것이었다. `when` 은
불리언 전용이라 값 변화를 잡지 못한다. 값에 따라 다른 노드를 그리는 자리는 `keyed` 다.
직접 슬롯을 만들 때도 같은 함정이 있다 — [커스텀 객체](05-custom-objects.md).

### 글꼴을 골랐는데 모양이 그대로다

패키지는 웹폰트 파일을 싣지 않는다. 앱이 그 폰트를 불러오지 않았으면 스택의 다음 후보로
떨어진다. [글꼴](16-fonts.md) 의 불러오기 방법을 따르거나, `configureFonts()` 로 **실제로
불러오는 폰트만** 목록에 남긴다.

### 내보낸 결과의 글꼴이 화면과 다르다

내보내기는 화면을 래스터화한다. 폰트가 로드되기 전에 내보내면 폴백으로 굳는다.
`await document.fonts.ready` 뒤에 내보낸다.

---

## 커스텀 객체

### 캔버스에서 입력이 안 된다

**의도된 동작이다.** 커스텀 객체의 편집 창구는 인스펙터 하나다.

콘텐츠에 `pointer-events: auto` 를 줘도 `pointerdown` 이 페이지 프레임까지 버블링되고 거기서
포인터 도구가 `preventDefault()` 를 부른다 — 그것이 **포커스 이동을 취소한다.**
[커스텀 객체](05-custom-objects.md#3-편집-창구는-인스펙터-하나다-).

뷰어는 다르다 — 드래그가 없으므로 콘텐츠가 이벤트를 받는다.

### 인스펙터에서 한 글자마다 포커스가 풀린다 (vanilla)

`render` 를 데이터 변경마다 다시 부르면 노드가 파괴된다. **슬롯은 객체당 한 번만 불린다** —
값은 `data()` 로 읽고 갱신은 `onUpdate(fn)` 으로 받는다.

프레임워크 래퍼(portal)에는 이 제약이 없다.

### 입력 중 캐럿이 끝으로 튄다 (vanilla)

`onUpdate` 는 자기가 낸 변경으로도 불린다. 포커스가 있는 입력을 덮지 않는다.

```ts
if (document.activeElement !== input) input.value = data().answers[0] ?? ''
```

### 드롭다운·툴팁이 페이지 안에 갇힌다

컨테이너가 `transform: scale()` 안에 있다. CSS 스펙상 `transform` 조상이 `position: fixed` 의
컨테이닝 블록이 된다. **우회로가 없다** — `document.body` 로 따로 portal 한다.

### 인스펙터 패널이 다른 타입 것으로 남는다

`kind` 가 바뀌었는데 패널이 안 바뀌면 값 기반 조건을 쓴 것이다. 패키지 내부 버그였고 고쳤다
(`keyed` 프리미티브). 커스텀 렌더에서 같은 실수를 할 수 있다 — 조건이 truthy/falsy 가 아니라
**값 변화**면 그것을 감지하는 수단을 써야 한다.

---

## 뷰어

### `doc` 을 넘겼는데 "표시할 문서가 없습니다"

`asPublicDoc()` 없이 서버 JSON 을 넘기면 타입 에러가 나므로 컴파일에서 걸린다. 런타임에
비어 보이면 `doc` 이 실제로 `null` 인 것이다 — `toPublicDoc()` 반환값을 확인한다.

### 응답을 입력해도 화면에 남지 않는다

뷰어는 **문서만 본다.** `onChangeData` 를 별도 맵에 모으면 폼에 값이 반영되지 않는다.
문서를 고쳐 다시 내려 준다. [뷰어](06-viewer.md#응답은-호스트가-소유한다).

### 좁은 폭에서 뷰어가 깨져 보인다

먼저 **호스트 상단 바**를 본다. `display: flex` 한 줄에 버튼이 여러 개면 좁은 폭에서 가로로
넘치고, `<body>` 에 가로 스크롤이 생겨 페이지가 앱보다 넓어 보인다. 실제로 겪은 원인이
이것이었다 — 뷰어가 아니라 감싼 바였다.

```css
.my-toolbar { flex-wrap: wrap; }
```

패키지 쪽도 두 가지를 맞춰 두었다. `.pck-viewer` 는 `min-width: 0` 이라 flex 자식으로 놓여도
줄어들고, 페이지 스택은 `align-items: safe center` 라 페이지가 컨테이너보다 넓어지는 순간에도
왼쪽이 잘리지 않는다.

### 페이지가 여백에 뜬다

크기가 섞인 문서다. 뷰어는 **페이지마다** `컨테이너 폭 / 페이지 폭` 으로 배율을 정하므로 정상
동작하면 각 페이지가 자기 폭을 채운다. 뜬다면 컨테이너 폭 측정이 0 인 상태다 — 부모 높이·폭
체인을 확인한다.

---

## 스타일

### 내 CSS 가 안 먹는다

패키지 스타일이 `@layer pdf-canvas-kit` 안에 있으므로 **레이어 밖의 단일 클래스 선택자면
이긴다.** 안 먹으면 다음을 확인한다.

| 확인 | |
| --- | --- |
| 내 CSS 도 레이어 안에 있나 | 같은/앞선 레이어면 특이도 싸움이 된다 |
| 번들러가 레이어를 평탄화했나 | `dist/styles.css` 에 `@layer` 가 남아 있는지 본다 |
| 인라인 스타일과 싸우고 있나 | 좌표·색 일부는 인라인이다. 그건 CSS 로 못 이긴다 |

### 썸네일 객체 색이 캔버스와 다르다

0.1.0 에서 고쳤다 — 실제 객체 색을 쓴다. 색이 없는 객체(투명 배경)는 토큰 기본값으로 떨어진다.

### 팝업이 투명하게 보인다

팝업이 편집기 **밖**(앱 루트)에 렌더되면 `.pck-editor` 안에서만 정의한 토큰을 상속받지 못한다.
`.pck-modal-scrim` 에도 토큰을 정의한다.

```css
.pck-editor, .pck-viewer, .pck-modal-scrim { --pck-surface: #fff; }
```

---

## 아이콘

### 아이콘이 한 곳만 나온다

`icons` 의 함수가 **같은 노드를 반복 반환**하고 있다. DOM 노드는 한 곳에만 붙을 수 있다.
부를 때마다 새로 만든다.

### `renderIcon` 을 줬는데 안 바뀐다

`icons` 에 같은 이름이 있으면 그것이 이긴다. 우선순위는
`icons` → `renderIcon` → 글리프다. [아이콘](11-icons.md).

---

## 저장

### `serializeDoc` 이 던진다

blob URL 배경이 남아 있다. 저장 전에 `promoteBackgrounds(doc, asset)` 로 영속 URL 로 바꾼다.
이 가드가 없으면 다음 세션에 죽은 링크가 조용히 남는다.

### 이미지가 며칠 뒤 사라진다

presigned `uploadUrl` 을 문서에 저장했다. 만료되는 서명 쿼리가 붙어 있다 — 저장하는 값은
`publicUrl` 이어야 한다.

### 자동저장이 안 돈다

`ports.storage` 가 없으면 꺼진다. 저장할 곳이 없는데 "저장 중" 배지를 띄우면 거짓말이기
때문이다. 상태를 확인하려면 `onSaveStateChange` 로 `'disabled'` 가 오는지 본다.

---

## 좌표

### 확대하면 객체가 페이지에서 멀어진다

객체 렌더에서 `x * scale` 을 계산했다. **배율은 페이지 컨테이너의 `transform` 한 곳에만** 있다.
객체는 pt 를 px 로 그대로 쓴다.

### 클릭 위치가 어긋난다

좌표 변환에 `scrollLeft` 를 더했다. `getBoundingClientRect()` 에 이미 포함돼 있어 중복
가산된다. `clientToPage()` 를 쓴다.

### undo 가 픽셀 단위로 쪼개진다

드래그 중에 문서를 갱신했다. 커밋은 `pointerup` 에 **한 번**이다. 중간 상태는 `previewRect`
에만 있다.

---

## 검증

### 내보내기가 계속 막힌다

`handle.validate()` 로 `issues` 를 확인한다. `CUSTOM_INVALID` 면 커스텀 타입의 `validate` 가
반환한 문구가 그대로 들어 있다.

### `CUSTOM_UNKNOWN_KIND` 가 나온다

문서에 있는 `kind` 가 `objectTypes` 에 없다. 타입을 지웠거나, 다른 앱이 만든 문서를 열었거나,
편집기와 뷰어에 **다른 배열**을 넘겼다.

---

## 개발

### 예제 앱에 패키지 변경이 반영되지 않는다

`examples/*` 는 workspace 심링크로 **`dist` 를 본다.** `npm run build` 를 먼저 돌린다.
`demo/`(:3100)는 별칭으로 소스를 보므로 즉시 반영된다.

이 차이가 의도된 것이다 — `examples/` 만 `exports` 맵·진입점·`.d.ts` 를 검증한다.

### `npm run checks` 는 통과하는데 `typecheck` 가 실패한다

vite 변환은 타입을 보지 않는다. **두 게이트가 서로를 대신하지 못한다.**

### 헤드리스 검증이 레이아웃을 확인해 주지 않는다

happy-dom 에는 레이아웃이 없어 `getBoundingClientRect()` 가 전부 0 이다. 줌 앵커링·드래그·
한글 IME·375px 가로 스크롤은 **실제 브라우저에서만** 확인된다.
