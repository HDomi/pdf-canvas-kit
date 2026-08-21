# 뷰어

편집기가 만든 문서를 읽기 전용으로 보여주고, 커스텀 객체 자리에서 **응답을 받는다.**

---

## 최소 예제

```tsx
// 1. 편집기에서 뷰어용 스냅샷을 만든다 (정답 제거됨)
const publicDoc = editor.current?.toPublicDoc()

// 2. 뷰어에 넘긴다
<PDFCanvasViewer
  doc={publicDoc}
  objectTypes={[shortAnswer]}          // 편집기와 같은 배열
  renderObject={{ 'answer.short': AnswerInput }}
  onChangeData={(id, next) => setResponses((r) => ({ ...r, [id]: next }))}
/>
```

---

## 편집기와 정반대다

| | Editor | Viewer |
| --- | --- | --- |
| 문서 | `initialDoc` — 최초 1회 | **`doc` — 매번 반영** (controlled) |
| 소유 | 편집기가 소유, `onChange` 로 밀어냄 | **호스트가 소유** |
| 타입 | `PDFCanvasDoc` | **`PublicPDFCanvasDoc`** |
| 배율 | 줌·팬·맞춤 | **컨테이너 폭에 자동으로 맞춘다.** 조작 없음 |
| 페이지 | 한 번에 하나 | **연속 세로 스크롤** |
| 화면 | 데스크탑 전용 | **375px 까지 반응형** |
| 포인터 | 프레임이 먹는다 (드래그) | **콘텐츠가 먹는다** (폼) |
| 슬롯 | `renderObject` (미리보기) | `renderObject` (**응답 폼**) |

배율이 페이지마다 다르다 — `컨테이너 폭 / 페이지 폭`. 크기가 섞인 문서에서도 각 페이지가 자기
폭을 채운다. 문서 전체에 한 배율을 쓰면 작은 페이지가 여백에 뜬다.

---

## 타입이 정답 유출을 막는다

뷰어는 `PublicPDFCanvasDoc` 만 받는다. 그래서 아래가 **컴파일 에러**다.

```ts
viewer.update({ doc: editor.getDoc() })        // ✗ 편집 문서. 정답이 들어 있다
viewer.update({ doc: editor.toPublicDoc() })   // ✓
```

구조는 `PDFCanvasDoc` 과 같고, 다른 것은 **어떻게 얻었는지**뿐이다. 타입이 그 출처를 기억한다.

### 서버에서 받은 문서

JSON 응답에는 그 표시가 없다. 이미 뷰어용이라면 단언한다.

```ts
import { asPublicDoc } from '@h_domi/pdf-canvas-kit'

const json = await api.getAssignment(id)
viewer.update({ doc: asPublicDoc(json) })
```

⚠️ **`asPublicDoc` 은 검사하지 않는다.** 이름 그대로 단언이고, 편집 문서를 통과시키면 정답이
그대로 뷰어에 들어간다. 무엇이 비밀인지는 각 타입의 `toPublic` 만 안다.

### 파생 문서는 브랜드를 유지한다

```ts
// spread 로 만든 객체도 PublicPDFCanvasDoc 이다. 캐스트가 필요 없다
const next = { ...publicDoc, pages: publicDoc.pages.map(…) }
viewer.update({ doc: next })
```

---

## 응답은 호스트가 소유한다

뷰어는 문서를 소유하지 않으므로 응답을 저장할 곳이 없다. `onChangeData` 로 올려 보내고,
호스트가 자기 상태를 고쳐 새 `doc` 을 내려 준다.

```tsx
const [publicDoc, setPublicDoc] = useState<PublicPDFCanvasDoc | null>(null)

<PDFCanvasViewer
  doc={publicDoc}
  onChangeData={(objectId, next) =>
    setPublicDoc((prev) =>
      prev === null
        ? prev
        : {
            ...prev,
            pages: prev.pages.map((page) => ({
              ...page,
              objects: page.objects.map((o) =>
                o.id === objectId && o.type === 'custom' ? { ...o, data: next } : o,
              ),
            })),
          },
    )
  }
/>
```

채점·저장 시점·응답 스키마가 전부 호스트 도메인에 남는다. 이 패키지는 **응답 모델을 갖지
않는다** — 객체 타입을 소비자가 정의하는데 응답 스키마만 패키지가 쥐고 있을 이유가 없다.

### 응답을 따로 들고 싶으면

문서를 고치지 않고 별도 맵에 모을 수도 있다.

```tsx
const [responses, setResponses] = useState<Record<string, unknown>>({})

onChangeData={(id, next) => setResponses((r) => ({ ...r, [id]: next }))}
```

단 이러면 뷰어의 폼에 값이 반영되지 않는다 — 뷰어는 `doc` 만 본다. 입력값을 화면에 유지해야
하면 문서를 고치는 쪽을 쓴다.

---

## 슬롯 — `renderViewer`

vanilla 로 쓸 때는 타입 정의에 `renderViewer` 를 넣는다. `render`(편집기)와 **다른 슬롯**이다.

```ts
defineObjectType<Answer, PublicAnswer>({
  toPublic: ({ answers: _a, ...rest }) => rest,
  render: ({ data }) => badge(`${data().points}점`),           // 편집기 — 미리보기
  renderViewer: ({ data, onChange }) => input(data(), onChange), // 뷰어 — 응답 폼
})
```

편집기의 객체는 배치 대상이고 뷰어의 객체는 폼이다. 같은 슬롯이면 배지가 입력칸 자리에 들어간다.

`renderViewer` 의 `data` 는 `toPublic` 을 거친 값이다 — 정답을 읽으려 해도 없고, 두 번째
제네릭을 주면 타입도 그 사실을 안다.

---

## handle

```tsx
const viewer = useRef<ViewerHandle>(null)

viewer.current?.pageCount()
viewer.current?.getDoc()
viewer.current?.scrollToObject('obj-1')   // "미응답 문항으로 이동"
viewer.current?.scrollToPage('page-3')
```

뷰어에는 페이지 이동 개념이 없다 — 연속 스크롤이므로 목표는 항상 객체나 페이지의 **위치**다.

---

## 배율 상한

기본은 상한 없음이다 — 넓은 화면에서 페이지가 폭을 채워야 읽힌다. 초대형 모니터에서 A4 가
3배로 늘어나는 것이 부담이면 조인다.

```tsx
<PDFCanvasViewer doc={doc} maxScale={1.5} />
```

---

## 빈 상태

`doc` 이 `null` 이면 "표시할 문서가 없습니다" 가 나온다. **버튼이 없다** — 뷰어은 문서를 불러올
수 없고 이 상태를 푸는 것은 호스트의 몫이다.

문구는 `viewer.empty` 키로 바꾼다.

---

## 모바일

375px 폭에서 가로 스크롤이 생기지 않는다. 배율이 컨테이너 폭에서 파생되므로 원리적으로
넘치지 않는다.

관성 스크롤(`-webkit-overflow-scrolling: touch`)이 켜져 있다.

---

## 전체 예제

[demo/viewer](../demo/viewer) — 편집기와 뷰어를 탭으로 두고 [뷰어로 보내기] 로 `toPublicDoc()`
을 거치게 한다. 정답이 새면 콘솔에 error 를 낸다. `npm run dev` 후
http://localhost:3100/viewer/.
