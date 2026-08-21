# 문구 · 번역

UI 문구는 **전부** `strings` 를 거친다. 하드코딩이 없다.

---

## prop 으로 넘긴다

```tsx
<PDFCanvasEditor
  strings={{
    'confirm.deletePage': 'Delete this page?',
    'toolbar.text': 'Text',
    'toolbar.shape': 'Shape',
    'inspector.empty': 'Nothing selected',
  }}
/>
```

```vue
<PDFCanvasEditor :strings="STRINGS" />
```

```ts
// vanilla
createPDFCanvasEditor(el, { strings: { 'toolbar.text': 'Text' } })
```

키는 `StringKey` 로 타입이 잡혀 **오타가 컴파일 에러**가 된다.

---

## 앱 전체에 한 번만

```ts
import { configureStrings } from 'pdf-canvas-kit'

configureStrings({ 'confirm.deletePage': 'Delete this page?' })
```

부팅 코드에서 부른다. prop 과 같은 전역 표에 병합된다.

---

## 내 i18n 에서 뽑아 쓰기

```tsx
import { useTranslation } from 'react-i18next'
import { DEFAULT_STRINGS, type StringKey } from 'pdf-canvas-kit'

function Editor() {
  const { t } = useTranslation('pdfCanvas')

  // 키 목록을 순회해 번역 테이블을 만든다
  const strings = useMemo(() => {
    const out: Partial<Record<StringKey, string>> = {}
    for (const key of Object.keys(DEFAULT_STRINGS) as StringKey[]) {
      const translated = t(key, { defaultValue: '' })
      if (translated) out[key] = translated
    }
    return out
  }, [t])

  return <PDFCanvasEditor strings={strings} />
}
```

`DEFAULT_STRINGS` 가 키 목록의 단일 출처다. 번역이 없는 키는 넣지 않으면 기본값(한국어)이
나온다.

---

## ⚠️ 최초 1회만 읽는다

`setProps`(React 는 매 렌더)에서 다시 읽지 않는다. 렌더 층이 `text()` 를 렌더 시점에 한 번
평가하므로, 나중에 바꿔도 **이미 그려진 노드는 갱신되지 않는다.**

언어를 런타임에 바꾸려면 컴포넌트를 다시 마운트한다.

```tsx
<PDFCanvasEditor key={locale} strings={strings} initialDoc={doc} />
```

`key` 가 바뀌면 편집기가 다시 만들어지므로 **undo 스택도 초기화된다.** 언어 전환은 흔한 조작이
아니라 그 비용을 감수했다.

---

## ⚠️ 전역 표에 병합된다

한 페이지에 **언어가 다른 편집기 둘은 지원하지 않는다.** 나중에 만든 쪽의 설정이 이긴다.

인스턴스 스코프로 만들려면 렌더 층 14개 파일(~80 호출)에 `t` 를 흘려야 하고, 반응형으로
만들려면 그 80곳의 렌더 경로를 signal 로 바꿔야 한다. 실제 요구("부팅 시 언어를 정한다")에
그 비용은 과하다고 판단했다.

그 요구가 생기면 인스턴스 스코프로 바꾼다. [ARCHITECTURE §19.4](../ARCHITECTURE.md) 참고.

---

## 키 그룹

| 접두사 | 무엇 |
| --- | --- |
| `topbar.*` | 뒤로·undo·redo·저장·타이틀 |
| `toolbar.*` | 도구 이름 (텍스트·도형·지우개·복제·삭제) |
| `pages.*` | 좌측 패널 (파일 추가·빈 페이지·복제·삭제) |
| `stage.*` | 줌 (확대·축소·맞춤) |
| `inspector.*` | 우측 패널 제목·빈 상태 |
| `field.*` `style.*` | 인스펙터 필드 라벨 |
| `upload.*` | 문서 불러오기 팝업 |
| `confirm.*` | 확인 팝업 |
| `empty.*` | 빈 문서 안내 |
| `viewer.*` | 뷰어 빈 상태 |
| `error.*` | 오류 문구 |
| `export.*` | 내보내기 (호스트가 팝업을 만들 때 참고) |
| **`icon.*`** | **아이콘 글리프** — [아이콘](11-icons.md) 참고 |

전체 목록은 [src/core/config/strings.ts](../src/core/config/strings.ts).

---

## 변수 치환

일부 문구에 `{name}` 자리가 있다.

```ts
// 기본값: '내보낼 수 없는 문항이 {count}개 있습니다.'
configureStrings({ 'error.exportBlocked': '{count} items cannot be exported.' })
```

`{count}` 를 그대로 유지해야 값이 채워진다.

---

## 되돌리기

```ts
import { resetStrings } from 'pdf-canvas-kit'
resetStrings()   // 기본 표로. 테스트에서 상태가 새는 것을 막는다
```

---

## 와이어프레임 라벨

`pages.title`(PAGES) · `inspector.title`(INSPECTOR) 는 **의도적으로 영어 대문자**다. 패널
제목을 라벨처럼 보이게 하는 디자인이고, 바꾸고 싶으면 문구든 CSS 든 덮어쓸 수 있다.

```ts
configureStrings({ 'pages.title': '페이지', 'inspector.title': '속성' })
```

```css
/* 대문자 스타일만 되돌리기 */
.pck-panel-head { text-transform: none; letter-spacing: 0; }
```
