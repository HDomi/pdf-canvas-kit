# API 레퍼런스

---

## 컴포넌트 prop

### `PDFCanvasEditor`

| prop | 타입 | 갱신 | 설명 |
| --- | --- | --- | --- |
| `initialDoc` | `PDFCanvasDoc \| null` | **1회** | 초기 문서. `null` 이면 빈 상태 |
| `objectTypes` | `AnyObjectTypeDef[]` | **1회** | 커스텀 객체 타입. 툴바가 이걸 읽는다 |
| `initialScale` | `number \| 'fit-width' \| 'fit-page'` | **1회** | 기본 `'fit-page'` |
| `strings` | `Partial<Record<StringKey, string>>` | **1회** | 문구 오버라이드 |
| `icons` | `Partial<Record<IconName, () => Node>>` | **1회** | vanilla 아이콘 |
| `ports` | `EnginePorts` | 매번 | `asset` · `storage` · `converter` |
| `readOnly` | `boolean` | 매번 | 편집을 막는다 |
| `autosave` | `boolean` | 매번 | 기본은 `ports.storage` 유무를 따른다 |
| `uploadFile` | `UploadFile` | 매번 | 이미지 업로드 함수 (`ports.asset` 대안) |
| `onChange` | `(doc) => void` | — | 문서 변경 |
| `onSaveStateChange` | `(state: SaveState) => void` | — | 자동저장 상태 |
| `onBack` | `() => void` | — | 상단바 뒤로 |
| `onRequestUpload` | `() => void` | 매번 | **주면 내장 업로드 팝업이 꺼진다** |
| `onRequestConfirm` | `(req: ConfirmRequest) => void` | 매번 | **주면 내장 확인 팝업이 꺼진다** |
| `onImportStateChange` | `(state: ImportState) => void` | 매번 | 진행률·오류 |
| `shortcuts` | `boolean` | 매번 | 기본 `true`. **활성일 때만 동작한다** |
| `warnOnUnload` | `boolean` | 매번 | 기본 `true`. 브라우저 이탈 확인창 |
| `onError` | `(err, ctx: ErrorContext) => void` | 매번 | **error boundary 가 못 잡는다** |

**래퍼 전용**

| prop | 타입 | 설명 |
| --- | --- | --- |
| `renderObject` | `SlotMap` | 캔버스 커스텀 객체 |
| `renderInspector` | `SlotMap` | 인스펙터 패널 |
| `renderIcon` | `IconMap` | 아이콘 컴포넌트 |
| `className` · `style` | — | 컨테이너에 붙는다 (React) |
| `ref` | `Ref<EditorHandle>` | React. Vue 는 `ref="…"` + `PDFCanvasEditorRef` |

### `PDFCanvasViewer`

| prop | 타입 | 갱신 | 설명 |
| --- | --- | --- | --- |
| `doc` | `PublicPDFCanvasDoc \| null` | **매번** | controlled. 편집기와 반대다 |
| `objectTypes` | `AnyObjectTypeDef[]` | **1회** | 편집기와 같은 배열 |
| `maxScale` | `number` | 매번 | 배율 상한. 기본은 없음 |
| `onChangeData` | `(objectId, next) => void` | 매번 | 응답 변경 |
| `renderObject` | `SlotMap` | — | 응답 폼 (래퍼 전용) |
| `renderIcon` | `IconMap` | — | 래퍼 전용 |

> **"1회"** 는 최초 마운트 때만 읽는다는 뜻이다. React 는 렌더마다 prop 을 흘리지만 그 값들은
> 무시된다 — 바꿔야 하면 `key` 로 재마운트한다.

---

## `EditorHandle`

`ref`(React) · `ref.handle`(Vue) · `createPDFCanvasEditor()` 반환값.

### 문서

| | |
| --- | --- |
| `getDoc(): PDFCanvasDoc` | 현재 문서 |
| `subscribe(fn): Dispose` | 문서 변경 구독 |
| `updateObjectData(objectId, data)` | 커스텀 객체 데이터 변경 (undo 한 항목) |
| `toPublicDoc(): PublicPDFCanvasDoc` | 비밀 제거 스냅샷 |

### 검증

| | |
| --- | --- |
| `checkBeforeExport(): boolean` | 게이트. 실패 시 문제 객체로 이동 |
| `isDirty(): boolean` | 저장되지 않은 변경. 호스트 라우터 가드용 |
| `validate(): ValidationResult` | 게이트를 열지 않고 상태만 |

### 불러오기

| | |
| --- | --- |
| `importFile(file): Promise<void>` | 문서 불러오기. 실패는 UI 로 표시되고 던지지 않는다 |
| `cancelImport()` | 진행 중인 변환 중단 |
| `requestUpload()` | `onRequestUpload` 를 부르거나 내장 팝업을 연다 |

### 다이얼로그 위임

| | |
| --- | --- |
| `confirmPending()` | 대기 중인 확인 동작 수행 |
| `cancelPending()` | 대기 중인 확인 동작 취소 |
| `requestRemovePage(index)` | 페이지 삭제 요청 (객체가 있으면 확인) |

### 뷰

| | |
| --- | --- |
| `zoomTo(scale)` · `fitWidth()` · `fitPage()` | 배율 |
| `goToPage(index)` · `goToPageId(pageId)` | 페이지 이동 |

### 저장

| | |
| --- | --- |
| `flushSave(): Promise<void>` | 디바운스를 건너뛰고 즉시 저장 |
| `promoteBackgrounds(): Promise<boolean>` | blob 배경을 영속 URL 로 |

### 생명주기

| | |
| --- | --- |
| `update(next)` | prop 갱신. `initialDoc` 류는 무시 |
| `destroy()` | **멱등.** 두 번 불러도 안전 |

---

## `ViewerHandle`

| | |
| --- | --- |
| `getDoc(): PublicPDFCanvasDoc \| null` | 현재 문서 |
| `pageCount(): number` | 페이지 수 |
| `scrollToObject(objectId): boolean` | 객체가 보이게 스크롤. 없으면 `false` |
| `scrollToPage(pageId): boolean` | 페이지가 보이게 스크롤 |
| `update(next)` | **`doc` 이 반영된다** |
| `destroy()` | 멱등 |

---

## 커스텀 객체

### `defineObjectType<Data, PublicData = Data>(def)`

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| `kind` | ✅ | 문서에 저장되는 식별자. Editor↔Viewer 계약 |
| `label` | ✅ | 툴바 버튼 이름 |
| `defaultSize` | ✅ | `{ w, h }` (pt) |
| `defaultData` | ✅ | `() => Data` |
| `minSize` | | `{ w, h }`. 기본은 유형 공통값 |
| `rotatable` | | 기본 `true` |
| `validate` | | `(data) => string[] \| null` |
| `toPublic` | | `(data) => unknown`. **빠뜨리면 데이터가 그대로 나간다** |
| `render` | | 편집기 캔버스 (vanilla) |
| `renderInspector` | | 편집기 인스펙터 (vanilla) |
| `renderViewer` | | 뷰어 (vanilla). `ctx.data` 는 `PublicData` |

### `ObjectRenderContext<Data>`

| | |
| --- | --- |
| `objectId` | 객체 id |
| `data()` | 현재 데이터. **함수다** |
| `rect()` | pt 사각형. 드래그 중에는 미리보기 값 |
| `selected()` | 선택 상태 |
| `onChange(next)` | 데이터 변경 |
| `onUpdate(fn)` | 갱신 콜백 등록 |

### 레지스트리

```ts
createObjectTypeRegistry(defs)   // kind → 정의. 중복 kind 는 던진다
```

---

## 코어

### 문서

```ts
createPDFCanvasDoc({ pages, title })
createPage({ size, objects, background })
serializeDoc(doc)          // JSON. blob 배경이 있으면 거부한다
deserializeDoc(json)
asPublicDoc(doc)           // 브랜드 단언. 검사하지 않는다
```

### 좌표 (pt ↔ CSS px)

```ts
scaledRect(rect, scale)
frameSize(size, scale)
clientToPage(point, viewport)
pageToClient(point, viewport)
```

**직접 계산하지 않는다.** 이 네 함수만 쓴다 — 배율 이중 적용이 가장 흔한 버그다.

### 기하

```ts
constrainRect(rect, page, opts)   // 클램프·최소 크기
resizeRect(rect, handle, delta, opts)
hitTest(objects, point)
marqueeHit(objects, rect)
matchPaper(size)                  // pt → "A4 세로"
```

### 휠

```ts
normalizeWheelDelta(deltaY, deltaMode)  // deltaY 를 픽셀로. 브라우저마다 단위가 다르다
```

호스트가 자기 줌 UI 를 만들 때도 같은 함수를 쓴다 — 안 쓰면 Firefox 에서 줌이 거의 움직이지
않는다([함정 모음](14-pitfalls.md)).

### 도형 정점

```ts
polygonPoints(shape, w, h, inset?)  // '<polygon points>' 문자열. 단위는 pt
isPolygonShape(shape) · isLineShape(shape)
```

[도형](17-shapes.md) 참고.

### PDF

```ts
configurePdfResources({ workerSrc, cMapUrl, standardFontDataUrl, wasmUrl, iccUrl })
loadPdf(file)
rasterizePage(pdf, pageNumber, opts)
diagnoseFonts(pdf)
```

### 검증

```ts
validateDoc(doc, types)
validateObject(obj, types)
invalidObjectIds(doc, types)
```

### 저장

```ts
createS3AssetPort({ getUploadUrl })
createBlobAssetPort()             // 세션 한정. 저장할 수 없다
createConsoleStoragePort({ label })
promoteBackgrounds(doc, asset)
createDebouncedSaver(opts)
```

### 문구 · 아이콘 · 글꼴

```ts
configureStrings(overrides) · resetStrings() · text(key, vars) · DEFAULT_STRINGS
configureIcons(overrides) · resetIcons()
configureFonts(list) · resetFonts() · fontOptions() · DEFAULT_FONTS
```

`configureFonts` 는 **교체**다(병합이 아니다). 패키지는 웹폰트 파일을 싣지 않는다 —
[글꼴](16-fonts.md) 참고.

### 상수

```ts
LIMITS            // 페이지·객체 한도. 서버와 같아야 한다
EDITOR_DEFAULTS   // 새 객체 크기, 줌 단계, 스냅
RENDER_DEFAULTS   // 이미지 해상도·포맷
LAYOUT_DEFAULTS
A4_PT             // { width: 595.28, height: 841.89 }
```

---

## 타입

### 문서 모델

```ts
PDFCanvasDoc · PublicPDFCanvasDoc · PDFCanvasPage · PDFCanvasObject
TextObject · ShapeObject · MaskObject · CustomObject
Rect · Size · Pt · PageBackground · BoxStyle

// 도형 11종. 추가만 한다 — 지우면 기존 문서가 해석되지 않는다
ShapeKind =
  | 'rect' | 'ellipse'
  | 'triangle' | 'diamond' | 'pentagon' | 'hexagon' | 'star' | 'cross'
  | 'line' | 'arrow' | 'doubleArrow'
PolygonShape   // 위 중 <polygon> 으로 그리는 것
FontOption     // { stack, label }
```

### 뷰 상태

```ts
EditorViewState · FitMode · ToolId · SaveState · PageViewport
```

### 포트

```ts
AssetPort · StoragePort · ConverterPort · EnginePorts
ImportProgress · ImportState · ConfirmRequest · ErrorContext
```

### 검증

```ts
ValidationResult · ValidationIssue · IssueCode
```

### 커스텀 객체

```ts
ObjectTypeDef<Data, PublicData> · AnyObjectTypeDef · ObjectTypeRegistry
ObjectRenderContext<Data> · ObjectSize · IconName · IconFactory
```

전체 export 목록은 [src/index.ts](../src/index.ts).
