# 도형

편집기 툴바의 [도형] 으로 만들고, 인스펙터 [모양] 에서 종류를 바꾼다.

- [11 종](#11-종)
- [모양별 기하](#모양별-기하)
- [글리프 바꾸기 · 아이콘 붙이기](#글리프-바꾸기--아이콘-붙이기)
- [정점 계산을 직접 쓰기](#정점-계산을-직접-쓰기)
- [문서 호환](#문서-호환)

---

## 11 종

| `ShapeKind` | 글리프 | 이름 | 그리는 방식 |
| --- | --- | --- | --- |
| `rect` | ▭ | 사각형 | `<rect>` |
| `ellipse` | ◯ | 원 | `<ellipse>` |
| `triangle` | △ | 삼각형 | `<polygon>` |
| `diamond` | ◇ | 마름모 | `<polygon>` |
| `pentagon` | ⬠ | 오각형 | `<polygon>` |
| `hexagon` | ⬡ | 육각형 | `<polygon>` |
| `star` | ☆ | 별 | `<polygon>` |
| `cross` | ✚ | 십자 | `<polygon>` |
| `line` | ╱ | 선 | `<line>` |
| `arrow` | → | 화살표 | `<line>` + `<polygon>` |
| `doubleArrow` | ↔ | 양쪽 화살표 | `<line>` + `<polygon>` × 2 |

전부 같은 스타일 속성을 쓴다 — 채움 색(`null` 이면 없음), 테두리 색, 테두리 두께,
점선 패턴(`dash`, UI 는 없고 모델에만 있다).

---

## 모양별 기하

박스를 늘리면 도형도 **늘어난다.** 원에 내접시켜 만드는 오각형·육각형·별도 그렇다 —
사용자가 박스를 늘렸으면 도형이 따라오는 것이 기대다.

| | |
| --- | --- |
| 별 | 5 각. 안쪽 반지름은 `1 / φ²` ≈ 0.382 — 다섯 변이 일직선이 되는 비율이다 |
| 육각형 | 좌우가 뾰족하고 위아래가 평평하다 |
| 오각형 · 별 | 꼭짓점 하나가 위를 향한다 |
| 십자 | 팔 두께 1/3. 박스를 세 칸으로 균등 분할한다 |
| 선 계열 | 박스의 좌측 중앙 → 우측 중앙. 화살촉이 있는 쪽은 선이 촉만큼 물러선다 |

테두리는 SVG 규칙대로 경로 **중앙**에 그려지므로, 정점을 `strokeWidth / 2` 만큼 안으로 민다.
그래서 두께를 키워도 도형이 리사이즈 핸들 밖으로 새지 않는다.

별처럼 뾰족한 꼭짓점은 `stroke-linejoin: round` 다. miter 로 두면 두께에 비례해 침처럼
튀어나온다.

---

## 글리프 바꾸기 · 아이콘 붙이기

[모양] 선택기의 라벨은 유니코드 글리프다. `⬠`(U+2B20) · `⬡`(U+2B21) 은 폰트 커버리지가 넓지
않아 환경에 따라 두부(□)로 보일 수 있으므로 **문구로 열어 두었다.**

```tsx
<PDFCanvasEditor
  strings={{
    'icon.shape.pentagon': '5',
    'icon.shape.hexagon': '6',
    // 접근 가능한 이름(title · aria-label)도 문구다
    'shape.star': 'Star',
  }}
/>
```

SVG 아이콘을 붙이려면 글리프를 지우고 CSS 로 그린다. 각 버튼에 `data-shape` 속성이 있고
패키지 스타일이 `@layer` 안에 있으므로 아래가 이긴다([스타일 오버라이드](09-styling.md)).

```css
.pck-segmented button[data-shape='star'] {
  font-size: 0;
  background: url(/icons/star.svg) center / 16px no-repeat;
}
```

문구 키 전체는 [문구 · 번역](10-strings.md), 다른 아이콘 경로는 [아이콘](11-icons.md).

---

## 정점 계산을 직접 쓰기

다각형 정점은 순수 함수로 내보낸다. 썸네일을 직접 그리거나 서버에서 같은 도형을 재현할 때
쓴다.

```ts
import { polygonPoints, isPolygonShape, isLineShape } from '@h_domi/pdf-canvas-kit'

polygonPoints('diamond', 100, 60)
// '50,0 100,30 50,60 0,30'

polygonPoints('diamond', 100, 60, 1) // inset = strokeWidth / 2
// '50,1 99,30 50,59 1,30'

isPolygonShape('star') // true
isLineShape('doubleArrow') // true
```

좌표 단위는 **pt** 다. 배율은 페이지 컨테이너의 `transform` 한 곳에만 있으므로 이 함수는
배율을 모른다 — 결과에 배율을 곱하면 이중 적용이다([함정 모음](14-pitfalls.md)).

---

## 문서 호환

`ShapeKind` 는 **추가만** 한다. 값을 지우면 그 도형으로 저장된 기존 문서가 해석되지 않는다.

반대로, 옛 버전의 뷰어가 새 도형을 담은 문서를 받으면 그 객체는 그려지지 않는다. 편집기와
뷰어의 패키지 버전을 맞추는 것이 안전하다.

---

관련: [스타일 오버라이드](09-styling.md) · [글꼴](16-fonts.md) ·
[API 레퍼런스](13-api.md)
