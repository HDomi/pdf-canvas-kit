# 호스트 앱에 녹이기

편집기를 화면에 띄우는 것과 **앱에 녹아들게** 하는 것은 다른 일이다. 이 문서는 후자에 필요한
경계 설정을 모았다.

스타일·문구·아이콘·다이얼로그는 각각 [09](09-styling.md)~[12](12-dialogs.md) 에 있다.
여기는 **전역 이벤트·예외·테마** 다.

---

## 1. 단축키가 호스트와 충돌하지 않게 ⚠️

편집기는 `Cmd+Z` · `Cmd+D` · `Cmd+0` · `Cmd+1` · `Cmd+±` · `Delete` · `Escape` · `Space`(팬)를
쓴다. 그런데 리스너가 `window` 에 붙는다 — 아무 조치도 없으면 편집기가 화면에 없어도 이 키를
먹는다.

### 기본 동작 — 활성일 때만

**편집기 안을 마지막으로 클릭했을 때**만 단축키가 동작한다. 다른 곳을 클릭하면 멈춘다.

```tsx
<PDFCanvasEditor />   // 별도 설정 없이 스코프된다
```

판정에 `document.activeElement` 를 쓰지 않는다 — 캔버스와 오버레이가 포커스를 받지 않는
`div` 라서 객체를 클릭해도 `activeElement` 는 `body` 에 남는다.

화면에서 빠진 상태(`display: none`, 탭으로 숨김)도 비활성이다.

### 완전히 끄기

호스트가 자기 단축키 체계를 쓰거나 편집기를 읽기 전용 프리뷰로 둘 때.

```tsx
<PDFCanvasEditor shortcuts={false} />
```

키보드 이벤트를 **전혀 듣지 않는다.** Space 팬도 멈추므로 페이지 스크롤이 정상 동작한다.

---

## 2. 예외를 잡기 ⚠️

렌더 층이 vanilla DOM 이라 **React error boundary·Vue `errorHandler` 가 잡지 못한다.**
`onError` 가 유일한 관측 지점이다.

```tsx
<PDFCanvasEditor
  onError={(err, ctx) => {
    // ctx: 'import' | 'save' | 'slot' | 'editor'
    Sentry.captureException(err, { tags: { pckContext: ctx } })
  }}
/>
```

| `ctx` | 언제 |
| --- | --- |
| `import` | 문서 불러오기·변환. **예상된 실패는 제외**된다 (변환 거부·페이지 한도는 UI 문구로 끝난다) |
| `save` | 저장 경로 |
| `slot` | 커스텀 객체의 vanilla 렌더 슬롯 |
| `editor` | 그 밖의 내부 |

값이 늘어날 수 있으므로 `switch` 에 `default` 를 둔다.

### 슬롯 예외는 격리된다

`render` 와 `onUpdate` 콜백은 소비자 코드다. 예외가 나면 **그 객체의 내용만** 비고 나머지
객체와 편집기는 계속 동작한다 — 객체 하나의 버그가 화면을 다 죽이지 않는다.

프레임(자리·크기·테두리)은 이미 그려져 있으므로 객체가 사라지지도 않는다.

`onUpdate` 콜백은 하나가 던져도 나머지를 계속 돌린다. 루프 밖에서 감싸면 첫 실패가 뒤의
콜백을 건너뛰게 되고, 같은 객체의 다른 부분이 낡은 값을 보여준다 — 그게 더 찾기 어렵다.

### 핸들러가 던져도 안전하다

`onError` 자체가 던지면 `console.error` 로만 남는다. 로깅 코드의 버그가 편집기를 죽이지 않는다.

---

## 3. 페이지 이탈 확인 ⚠️

저장되지 않은 변경이 있으면 기본적으로 브라우저 확인창이 뜬다. 호스트가 라우터 가드를
쓰면 두 번 물어보게 된다.

```tsx
<PDFCanvasEditor warnOnUnload={false} />
```

그러면 `handle.isDirty()` 로 상태를 읽어 자기 가드에 쓴다.

```tsx
// React Router
const blocker = useBlocker(() => editor.current?.isDirty() ?? false)

// Vue Router
onBeforeRouteLeave(() => {
  if (!editor.value?.handle?.isDirty()) return true
  return confirm('저장하지 않은 변경이 있습니다. 나갈까요?')
})
```

⚠️ **대기 중인 저장 flush 는 이 값과 무관하게 계속 동작한다.** 그건 확인이 아니라 데이터
보전이다 — `warnOnUnload: false` 로도 꺼지지 않는다.

---

## 4. 다크 모드

**OS 설정에 자동으로 대응한다.** 아무것도 하지 않아도 된다.

```css
/* tokens.css 가 이렇게 되어 있다 */
.pck-editor { color-scheme: light dark; }
--pck-bg: #f4f4f2;                          /* fallback */
--pck-bg: light-dark(#f4f4f2, #17171a);
```

### 호스트가 강제하기

앱이 자기 테마 스위치를 가지고 있으면 OS 설정을 따르는 것이 오히려 어긋난다. **표준
속성 하나로** 끝난다.

```css
.my-app .pck-editor { color-scheme: light; }   /* OS 가 어둡든 밝게 */
.my-app .pck-editor { color-scheme: dark; }    /* 항상 어둡게 */
```

토큰을 두 벌 쓰거나 우리 전용 attribute 를 배울 필요가 없다.

### 종이는 흰색이다

`--pck-page-bg` 는 다크 모드에서도 흰색이다. 배경이 PDF 를 래스터화한 이미지이고 그건 흰
종이다 — 프레임만 어둡게 하면 이미지와 경계가 어긋나 보인다.

바꾸고 싶으면 토큰을 덮어쓴다.

---

## 아직 없는 것

실제 요구가 오기 전에는 만들지 않았다. 필요하면 이슈로 알려준다.

| | 지금 상태 |
| --- | --- |
| 키보드만으로 편집 | `tabindex` 가 2곳뿐이다. 객체 선택·이동을 키보드로 할 수 없다 |
| RTL | `left`/`right` 가 하드코딩이다. 아랍어·히브리어 레이아웃 미지원 |
| Shadow DOM | 전역 CSS 다. 호스트 리셋이 편집기에 셀 수 있다 |
| 한 페이지에 언어가 다른 편집기 둘 | 문구·아이콘이 전역이다 ([문구](10-strings.md)) |
