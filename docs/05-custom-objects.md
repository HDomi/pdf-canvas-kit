# 커스텀 객체

PDF 위에 **내 컴포넌트**를 올린다. 이 패키지는 **기본 틀**만 그린다 — pt 사각형, 리사이즈
핸들, 배경·테두리, 회전. 그 안을 채우는 것은 소비자 코드다.

핸들로 틀을 키우면 안쪽 컴포넌트가 **자기 CSS 대로 다시 흐른다** — flex 면 줄바꿈이 일어난다.
틀 안에 갇히므로 밖으로 삐져나오지 않는다 (`container-type: size`).

---

## 1. 타입을 선언한다

프레임워크와 무관하다. React·Vue·vanilla 모두 같은 정의를 쓴다.

```ts
import { defineObjectType } from '@h_domi/pdf-canvas-kit'

interface Answer {
  answers: string[]   // 정답 — 뷰어에 나가면 안 된다
  points: number
  response?: string   // 뷰어 응답 — 편집 시점에는 없다
}

/** 뷰어가 보는 형태. toPublic 이 answers 를 지운 결과다 */
type PublicAnswer = Omit<Answer, 'answers'>

export const shortAnswer = defineObjectType<Answer, PublicAnswer>({
  kind: 'answer.short',              // Editor ↔ Viewer 계약. 문서에 저장된다
  label: '단답형',                    // 툴바 버튼 이름
  defaultSize: { w: 160, h: 44 },
  minSize: { w: 80, h: 32 },
  defaultData: () => ({ answers: [], points: 1 }),
  rotatable: false,                  // 기울어진 입력은 쓰기 어렵다

  // 인스펙터 경고와 내보내기 게이트가 같은 규칙을 쓴다
  validate: (d) => (d.answers.some((a) => a.trim()) ? null : ['정답을 입력하세요']),

  // 뷰어 번들에서 제거할 것
  toPublic: ({ answers: _answers, ...rest }) => rest,
})
```

### ⚠️ 제네릭이 둘인 이유

`toPublic` 이 필드를 지우면 **뷰어가 보는 형태가 달라진다.** 두 번째 제네릭을 주지 않으면
`PublicData` 가 `Data` 로 고정되어, 실제로는 없는 `answers` 를 타입이 있다고 말한다.

```ts
// toPublic 이 없다 — 두 형태가 같으므로 하나면 된다
defineObjectType<Memo>({ … })

// answers 를 지운다 — 뷰어가 보는 형태를 명시한다
defineObjectType<Answer, Omit<Answer, 'answers'>>({ … })
```

### ⚠️ `toPublic` 을 빠뜨리면 데이터가 그대로 나간다

이 패키지는 `data` 안에서 **무엇이 비밀인지 모른다.** 정답처럼 뷰어에 나가면 안 되는 값은
반드시 이 함수로 제거한다. 강제할 방법이 없다.

---

## 2. 컴포넌트를 붙인다

### React

```tsx
<PDFCanvasEditor
  objectTypes={[shortAnswer]}
  renderObject={{ 'answer.short': AnswerBadge }}      // 캔버스
  renderInspector={{ 'answer.short': AnswerFields }}  // 인스펙터
/>
```

```tsx
import type { CustomSlotProps } from '@h_domi/pdf-canvas-kit/react'

function AnswerBadge({ data }: CustomSlotProps<Answer>) {
  return <b>{data.points}점</b>
}

function AnswerFields({ data, onChange }: CustomSlotProps<Answer>) {
  return (
    <>
      {data.answers.map((a, i) => (
        <input
          key={i}
          value={a}
          onChange={(e) => {
            const next = [...data.answers]
            next[i] = e.target.value
            onChange({ ...data, answers: next })
          }}
        />
      ))}
      <button onClick={() => onChange({ ...data, answers: [...data.answers, ''] })}>추가</button>
    </>
  )
}
```

### Vue

```vue
<PDFCanvasEditor
  :object-types="[shortAnswer]"
  :render-object="{ 'answer.short': AnswerBadge }"
  :render-inspector="{ 'answer.short': AnswerFields }"
/>
```

```vue
<!-- AnswerBadge.vue -->
<script setup lang="ts">
defineProps<{ objectId: string; data: Answer }>()
</script>
<template><b>{{ data.points }}점</b></template>
```

```vue
<!-- AnswerFields.vue -->
<script setup lang="ts">
const props = defineProps<{ objectId: string; data: Answer }>()
const emit = defineEmits<{ change: [next: Answer] }>()
</script>
<template>
  <input
    v-for="(a, i) in data.answers"
    :key="i"
    :value="a"
    @input="setAnswer(i, ($event.target as HTMLInputElement).value)"
  />
</template>
```

---

## 3. 편집 창구는 인스펙터 하나다 ⚠️

캔버스 안 객체는 **배치·크기 조절만** 받는다. 거기서 직접 입력받게 하려고 하면 동작하지 않는다.

| | 캔버스 (`renderObject`) | 인스펙터 (`renderInspector`) |
| --- | --- | --- |
| 역할 | 미리보기 배지 | 실제 편집 |
| 포인터 | **프레임이 먹는다** (드래그) | 콘텐츠가 받는다 |
| 예 | "2점 · 정답 미입력" | `<input>` 여러 개 |

### 왜 캔버스에서 입력을 못 받나

콘텐츠에 `pointer-events: auto` 를 줘도 `pointerdown` 이 페이지 프레임까지 버블링되고, 거기서
포인터 도구가 `preventDefault()` 를 부른다. **`pointerdown` 의 `preventDefault()` 는 포커스
이동을 취소한다.**

`stopPropagation` 으로 막으면 그 객체는 가운데를 끌어 옮길 수 없어져 배치가 불편해진다.
그래서 규칙을 하나로 정했다.

**뷰어는 다르다** — 드래그가 없으므로 콘텐츠가 이벤트를 받는다.

---

## 4. 세 슬롯

| 슬롯 | 화면 | 하는 일 |
| --- | --- | --- |
| `render` / `renderObject` | 편집기 캔버스 | 미리보기 |
| `renderInspector` | 편집기 인스펙터 | 편집기에서 편집 |
| `renderViewer` / 뷰어의 `renderObject` | 뷰어 | **응답을 받는다** |

`renderViewer` 를 `render` 와 나누는 이유: 편집기의 객체는 배치 대상이고 뷰어의 객체는 폼이다.
같은 슬롯이면 "2점" 배지가 입력칸 자리에 들어간다.

`renderViewer` 의 `data` 는 **`toPublic` 을 거친 값**이다 — 정답을 읽으려 해도 없다.

---

## 5. 툴바는 데이터 주도다

등록한 타입마다 툴바 버튼이 하나 생긴다. `label` 이 버튼 이름이다.

```ts
objectTypes={[shortAnswer, choice, memo]}   // 툴바에 3개 추가
```

순서도 배열 순서를 따른다.

---

## 6. 등록되지 않은 `kind`

저장된 문서가 지금 없는 타입을 담고 있을 수 있다 — 타입을 지웠거나, 다른 앱이 만든 문서를
열었거나. **객체를 버리지 않는다.**

| | |
| --- | --- |
| 편집기 | 자리와 크기를 그리고 `?` 안내를 띄운다 |
| 뷰어 | 자리만 비운다 (뷰어에서 할 수 있는 일이 없다) |
| 검증 | `CUSTOM_UNKNOWN_KIND` 로 잡는다 |

버리면 저장할 때 데이터가 사라진다.

---

## 7. vanilla 슬롯의 두 제약

프레임워크 래퍼를 쓰면 아래가 **모두 사라진다.** vanilla 로 쓸 때만 지킨다.

### 슬롯은 객체당 한 번만 불린다

값은 `data()` **함수**로 읽고 갱신은 `onUpdate(fn)` 으로 등록한다. 매번 다시 그리면 입력 중
노드가 파괴되어 포커스가 날아가고 한글 IME 조합이 끊긴다.

### 포커스가 있는 입력은 덮지 않는다

```ts
const sync = () => {
  if (document.activeElement !== input) input.value = data().answers[0] ?? ''
}
```

`onUpdate` 는 자기가 낸 변경으로도 불린다. 무조건 대입하면 캐럿이 끝으로 튄다.

---

## 8. ⚠️ `position: fixed` 는 갇힌다

컨테이너가 `transform: scale()` 안에 있다. CSS 스펙상 `transform` 조상이 `fixed` 의 컨테이닝
블록이 되므로 **드롭다운·툴팁이 페이지 프레임 기준으로 갇힌다.** 우회로가 없다.

그런 UI 는 `document.body` 로 따로 portal / Teleport 한다.

---

## 렌더 컨텍스트 (vanilla)

```ts
render: (ctx) => Node
```

| | |
| --- | --- |
| `ctx.objectId` | 객체 id |
| `ctx.data()` | 현재 데이터. **함수다** |
| `ctx.rect()` | pt 사각형. 드래그 중에는 미리보기 값 |
| `ctx.selected()` | 선택 상태 (뷰어는 항상 `false`) |
| `ctx.onChange(next)` | 데이터 변경. 커맨드 한 번 = undo 한 항목 |
| `ctx.onUpdate(fn)` | 갱신 콜백 등록 |

---

## 예제

- [examples/react/src/slots](../examples/react/src/slots) — portal 경로 (배열 증감, 가드 없음)
- [demo/editor/objectTypes.ts](../demo/editor/objectTypes.ts) — vanilla 경로 (가드 있음)
