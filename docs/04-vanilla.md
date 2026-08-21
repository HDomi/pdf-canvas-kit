# 프레임워크 없이

편집기 본체는 vanilla DOM 이다. React·Vue 래퍼는 아래 facade 를 감싼 얇은 층이므로,
프레임워크 없이 쓰면 **래퍼 없이 같은 기능을 전부** 쓸 수 있다.

---

## 최소 예제

```ts
import {
  createPDFCanvasEditor,
  createPDFCanvasDoc,
  createPage,
  A4_PT,
} from '@h_domi/pdf-canvas-kit'
import '@h_domi/pdf-canvas-kit/styles.css'

const container = document.getElementById('editor')!  // 높이가 있어야 한다
const editor = createPDFCanvasEditor(container, {
  initialDoc: createPDFCanvasDoc({ pages: [createPage({ size: A4_PT })] }),
  onChange: (doc) => console.log(doc),
})

// 정리
editor.destroy()   // 멱등하다. 두 번 불러도 안전
```

---

## 뷰어

```ts
import { createPDFCanvasViewer } from '@h_domi/pdf-canvas-kit'

const viewer = createPDFCanvasViewer(el, {
  doc: editor.toPublicDoc(),   // 정답이 제거된 문서
  objectTypes: [shortAnswer],
  onChangeData: (objectId, next) => saveResponse(objectId, next),
})

// 편집기와 달리 doc 이 갱신된다
viewer.update({ doc: nextDoc })
```

---

## 커스텀 객체 — vanilla 슬롯

프레임워크 래퍼가 없으므로 타입 정의에 렌더 함수를 직접 넣는다.

```ts
import { defineObjectType } from '@h_domi/pdf-canvas-kit'

const shortAnswer = defineObjectType<Answer, PublicAnswer>({
  kind: 'answer.short',
  label: '단답형',
  defaultSize: { w: 160, h: 44 },
  defaultData: () => ({ answers: [], points: 1 }),
  validate: (d) => (d.answers.some((a) => a.trim()) ? null : ['정답을 입력하세요']),
  toPublic: ({ answers: _a, ...rest }) => rest,

  // 편집기 캔버스 — 미리보기
  render: ({ data, onUpdate }) => {
    const box = document.createElement('b')
    const sync = () => (box.textContent = `${data().points}점`)
    sync()
    onUpdate(sync)
    return box
  },

  // 편집기 인스펙터 — 편집 창구
  renderInspector: ({ data, onChange, onUpdate }) => { … },

  // 뷰어 — 응답 폼
  renderViewer: ({ data, onChange, onUpdate }) => { … },
})
```

### ⚠️ 슬롯은 객체당 **한 번만** 불린다

값은 `data()` **함수**로 읽고, 갱신은 `onUpdate(fn)` 으로 등록한다.

```ts
render: ({ data, onUpdate }) => {
  const el = document.createElement('div')
  // ✗ data 를 스냅샷으로 잡으면 낡는다
  // el.textContent = data.points

  const sync = () => (el.textContent = String(data().points))
  sync()            // 최초 1회
  onUpdate(sync)    // 이후 갱신
  return el
}
```

매번 다시 그리면 **입력 중 노드가 파괴되어 포커스가 날아가고 한글 IME 조합이 끊긴다.**

### ⚠️ 포커스가 있는 입력은 덮지 않는다

`onUpdate` 는 자기가 낸 변경으로도 불린다. 무조건 대입하면 캐럿이 끝으로 튄다.

```ts
const sync = () => {
  if (document.activeElement !== input) input.value = data().answers[0] ?? ''
}
```

프레임워크 래퍼를 쓰면 이 두 제약이 **모두 사라진다** — portal 안에서는 프레임워크가 노드를
유지한다.

---

## 문구 · 아이콘

prop 으로 넘기거나 전역 함수로 설정한다.

```ts
createPDFCanvasEditor(el, {
  strings: { 'confirm.deletePage': 'Delete this page?' },
  icons: { undo: () => mySvgNode() },
})
```

```ts
// 앱 전체에 한 번만
import { configureStrings, configureIcons } from '@h_domi/pdf-canvas-kit'
configureStrings({ 'toolbar.text': 'Text' })
configureIcons({ undo: () => mySvgNode() })
```

[문구](10-strings.md) · [아이콘](11-icons.md) 참고.

---

## 코어만 쓰기

편집기 UI 없이 PDF 파이프라인·좌표 계산·검증만 쓸 수도 있다. 스타일을 import 하지 않으면
20KB CSS 가 붙지 않는다.

```ts
import {
  loadPdf,
  rasterizePage,
  validateDoc,
  scaledRect,
  clientToPage,
  serializeDoc,
} from '@h_domi/pdf-canvas-kit'
```

[API 레퍼런스](13-api.md#코어)에 목록이 있다.

---

## 전체 예제

[demo/editor/main.ts](../demo/editor/main.ts) — 레포 데모가 이 경로를 쓴다.
`npm run dev` 후 http://localhost:3100/editor/.
