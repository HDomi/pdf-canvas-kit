/**
 * 문서 모델.
 *(데이터 모델)과 5장(좌표계) 참고.
 */

/** 1pt = 1/72 inch. 저장되는 모든 좌표의 단위 (좌표는 페이지 로컬 pt 절대값이다). */
export type Pt = number

/**
 * 페이지 로컬 사각형(pt). 좌상단 원점, y-down (y축은 y-down 이다).
 *
 * 두 코너가 아니라 `{x, y, w, h}` 인 이유: CSS `left/top/width/height` 에 그대로 매핑되고,
 * 리사이즈 계산에서 음수 폭 예외 처리가 필요 없다.
 */
export interface Rect {
  /** 페이지 좌측 경계로부터의 거리(pt). */
  x: Pt
  /** 페이지 **상단** 경계로부터의 거리(pt). PDF 원본과 달리 y-down이다. */
  y: Pt
  /** 폭(pt). */
  w: Pt
  /** 높이(pt). */
  h: Pt
}

/** 페이지 크기(pt). */
export interface Size {
  width: Pt
  height: Pt
}

/**
 * 배경 이미지 URL의 성질.
 * - `blob`   메모리 object URL. 새로고침 시 소멸, **직렬화 불가**.
 * - `inline` base64 data URL. 문서 JSON에 그대로 실린다.
 * - `remote` 업로드 완료(S3 등). JSON에는 `assetId` + `url` 만 남는다.
 */
export type BackgroundOrigin = 'blob' | 'inline' | 'remote'

export type PageBackground =
  | { kind: 'blank' }
  | {
      kind: 'image'
      url: string
      origin: BackgroundOrigin
      assetId?: string
      /** 래스터 픽셀 크기. 품질 판단에만 쓰고 좌표 계산에는 절대 쓰지 않는다. */
      naturalWidth: number
      naturalHeight: number
      /** 래스터화에 사용한 배율. 재렌더 판단용. */
      renderScale: number
    }

export interface PageSource {
  fileId: string
  fileName: string
  /** 원본 파일 안에서의 0-based 인덱스. */
  pageIndex: number
  /**
   * 원본 페이지의 회전 각도(0 | 90 | 180 | 270).
   *
   * `size` 에 이미 반영돼 있으므로 레이아웃에는 쓰지 않는다. 예상과 다른 방향으로 보일 때
   * 이유를 설명하고, 재래스터화가 같은 결과를 내도록 보관한다.
   */
  rotation?: 0 | 90 | 180 | 270
}

export interface PDFCanvasPage {
  id: string
  /**
   * pt 크기. **페이지마다 각자 갖는다** — 한 PDF에 A4·A3·가로 페이지가 섞일 수 있고,
   * 문서 단일 크기를 가정하면 배경이 왜곡된다 (페이지가 각자 size 를 갖는다).
   */
  size: Size
  background: PageBackground
  /** 이 페이지의 출처. 디버깅과 페이지 목록 툴팁용. */
  source?: PageSource
  /** 배경 위에 얹히는 객체들. 배열 순서가 z-order이며 마지막이 위. */
  objects: PDFCanvasObject[]
}

/**
 * 편집기에서 편집하는 워크시트 — **정답을 포함한다**.
 *
 * 뷰어에 이 타입을 그대로 넘기면 안 된다. `toPublicDoc()` 이 정답 필드를 제거하고
 * 별도 타입을 돌려주므로 실수는 컴파일 시점에 걸린다 (정답은 편집 문서에만 있다).
 *
 * 뷰 상태(배율·스크롤·선택·현재 페이지)는 의도적으로 여기에 없다. `EditorViewState` 에 두는데,
 * 문서에 섞으면 배율만 바꿔도 dirty가 되고 자동저장이 돈다.
 */
export interface PDFCanvasDoc {
  /** 구조가 바뀌면 올린다. `migrate.ts` 가 이전 문서를 올려준다. */
  schemaVersion: 1
  id: string
  /** 상단 바와 My Storage에 표시된다. 최대 100자 (기획 4.2). */
  title: string
  /**
   * 사용자가 타이틀을 한 번이라도 손으로 고쳤는지.
   *
   * 기획 4.2 규칙을 구현한다 — 손대지 않은 타이틀은 첫 업로드 시 파일명으로 바뀌지만,
   * 직접 고친 타이틀은 이후 업로드에도 덮어쓰지 않는다.
   */
  titleTouched: boolean
  /** 순서가 있는 페이지 목록. 최대 500개 (기획 2.2). */
  pages: PDFCanvasPage[]
  /** UTC ISO8601. 저장되는 모든 시간은 UTC이고 클라이언트가 로컬로 변환한다 (기획 3.2). */
  updatedAt: string
}

/**
 * 박스 계열 객체(텍스트·Answer Box)의 시각 스타일.
 *
 * ## 왜 모든 필드가 optional 인가
 *
 * 값을 주지 않으면 CSS 토큰(`--pck-custom-bg` 등)의 기본값이 그대로 적용된다. 객체마다 색을
 * 하드코딩해 채워 두면 호스트 앱이 `--pck-*` 로 테마를 바꿀 수 없다 (ARCHITECTURE §3).
 *
 * 그래서 "지정하지 않음" 과 "지정함" 을 구분한다. 렌더는 지정된 값만 인라인 스타일로 덮는다.
 */
export interface BoxStyle {
  /** 배경색. `null` 이면 투명, 미지정이면 토큰 기본값. */
  fill?: string | null
  /** 테두리 색. `null` 이면 테두리 없음, 미지정이면 토큰 기본값. */
  stroke?: string | null
  /** 테두리 두께(pt). */
  strokeWidth?: Pt
  /** 글자색. */
  color?: string
}

/** 모든 캔버스 객체가 공유하는 필드. */
interface ObjectBase {
  id: string
  /** 페이지 로컬 pt 좌표의 위치·크기 (좌표는 페이지 로컬 pt 절대값이다). */
  rect: Rect
  /**
   * 객체 중심 기준 시계방향 각도(deg).
   *
   * 텍스트와 도형만 회전한다. Answer Box는 0으로 고정 — 폼 요소가 기울면 뷰어의 입력과
   * 모바일 렌더가 깨진다.
   */
  rotation?: number
  /** 잠긴 객체는 렌더되지만 선택되지 않는다. */
  locked?: boolean
}

export interface TextObject extends ObjectBase {
  type: 'text'
  text: string
  style: {
    fontFamily: string
    fontSize: Pt
    bold: boolean
    italic: boolean
    underline: boolean
    color: string
    align: 'left' | 'center' | 'right'
    lineHeight: number
    /** 배경색. `null` 또는 미지정이면 투명하다 — 텍스트는 배경 위에 얹히는 게 기본이다. */
    fill?: string | null
    /** 테두리 색. 미지정이면 테두리를 그리지 않는다. */
    stroke?: string | null
    /** 테두리 두께(pt). */
    strokeWidth?: Pt
  }
}

/**
 * 도형 종류.
 *
 * 렌더 방식으로 세 무리다 — 전용 SVG 요소(`rect` · `ellipse`), `<polygon>`
 * (`src/core/geometry/shapes.ts` 가 정점을 만든다), 선 계열(`line` · `arrow` · `doubleArrow`).
 *
 * 값을 **추가만** 한다. 지우면 그 도형으로 저장된 기존 문서가 해석되지 않는다.
 */
export type ShapeKind =
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'star'
  | 'cross'
  | 'line'
  | 'arrow'
  | 'doubleArrow'

export interface ShapeObject extends ObjectBase {
  type: 'shape'
  shape: ShapeKind
  style: {
    fill: string | null
    stroke: string
    strokeWidth: Pt
    dash?: number[]
  }
}

/**
 * 배경의 일부를 가리는 불투명 사각형.
 *
 * 기획은 툴바에 지우개를 두었지만 동작을 정의하지 않았다. 현재 툴은 객체를 삭제하는 쪽으로
 * 구현했고, 이 타입은 "배경 가리기" 해석을 위해 남겨 둔다.
 * 나중 버전이 쓴 문서도 파싱되도록 유니온에 포함한다.
 */
export interface MaskObject extends ObjectBase {
  type: 'mask'
  /** CSS 색상. 기본은 종이와 같은 흰색. */
  fill: string
}

/**
 * 소비자가 정의한 커스텀 객체 (커스텀 객체는 소비자가 정의한다).
 *
 * 이 패키지는 **기본 틀**만 제공한다 — pt 사각형, 리사이즈 핸들, 배경·테두리, 회전.
 * 그 안에 무엇을 그릴지는 소비자가 `objectTypes` 레지스트리로 정한다.
 *
 * ```ts
 * // 소비자 앱
 * const shortAnswer = defineObjectType({
 *   kind: 'answer.short',
 *   label: '단답형',
 *   defaultSize: { w: 160, h: 40 },
 *   defaultData: () => ({ answers: [], points: 5 }),
 * })
 * ```
 *
 * ## 왜 Answer Box 를 타입으로 두지 않는가
 *
 * 이전 판에는 `ShortAnswerBox` · `EssayAnswerBox` · `DropboxAnswerBox` 가 있었고, 그에 딸린
 * 채점·문항 번호·정답 제거·검증이 코어에 있었다. 그건 **문제지 편집기**의 기능이고 이 패키지의
 * 이름과 범위(PDF 위에 객체를 배치하는 도구)와 맞지 않았다. 문제지 도메인은 소비자 앱으로
 * 옮겼다 — 상세는 커스텀 객체는 소비자가 정의한다.
 */
export interface CustomObject extends ObjectBase {
  type: 'custom'
  /** 레지스트리 키. 소비자가 이 값으로 렌더러를 찾는다. */
  kind: string
  /**
   * 소비자 데이터. **JSON 직렬화가 가능해야 한다** — 문서에 그대로 실린다.
   *
   * 이 패키지는 내용을 해석하지 않는다. 검증·채점이 필요하면 소비자가
   * `objectType.validate(data)` 를 제공한다.
   */
  data: unknown
  /**
   * 시각 스타일. 미지정 필드는 CSS 토큰 기본값을 따른다.
   *
   * 기본 틀의 배경·테두리·글자색이다. 콘텐츠 내부 스타일은 소비자 컴포넌트가 정한다.
   */
  style?: BoxStyle
}

export type PDFCanvasObject = TextObject | ShapeObject | MaskObject | CustomObject

export type PDFCanvasObjectType = PDFCanvasObject['type']

/* ------------------------------------------------ 뷰어용 문서 (D14 · D28) -- */

/**
 * 브랜드용 심볼. **런타임 값이 없다** — `declare` 라 타입 검사에만 존재한다.
 */
declare const PUBLIC_BRAND: unique symbol

/**
 * 비밀이 제거된 문서. **뷰어는 이것만 받는다** (정답은 편집 문서에만 있다 / 뷰어는 브랜드 타입만 받는다).
 *
 * 구조는 `PDFCanvasDoc` 과 같다. 다른 것은 **어떻게 얻었는지**뿐이고, 그 출처를 타입이
 * 기억한다. 브랜드가 없으면 뷰어에 넘길 수 없으므로 아래가 컴파일 에러다.
 *
 * ```ts
 * viewer.update({ doc: editor.getDoc() })   // ✗ 편집 문서. 정답이 들어 있다
 * viewer.update({ doc: editor.toPublicDoc() })  // ✓
 * ```
 *
 * D25 이후로 이 패키지는 `data` 안에서 **무엇이 비밀인지 모른다** — 커스텀 객체 타입의
 * `toPublic(data)` 만 안다. 그래서 구조가 다른 타입을 만들 방법이 없고, 브랜드가 남은
 * 유일한 수단이다. 실수를 못 하게 막는 것이지 유출을 물리적으로 막는 것은 아니다.
 */
export type PublicPDFCanvasDoc = PDFCanvasDoc & { readonly [PUBLIC_BRAND]: true }

/**
 * 서버에서 받은 문서를 뷰어용으로 단언한다.
 *
 * `toPublicDoc()` 을 거치지 않은 문서 — JSON 응답, localStorage 복원 — 에는 브랜드가 없다.
 * 그 문서가 이미 정답을 제거한 것이라면 여기서 단언한다.
 *
 * ⚠️ **이름 그대로 단언이다. 검사하지 않는다.** 이 함수를 부르는 쪽이 "서버가 뷰어용으로
 * 내려준 문서" 임을 보장해야 한다. 편집 문서를 여기 통과시키면 정답이 그대로 뷰어 DOM 에
 * 들어간다 — 그때 타입은 아무 말도 해 주지 않는다.
 */
export function asPublicDoc(doc: PDFCanvasDoc): PublicPDFCanvasDoc {
  return doc as PublicPDFCanvasDoc
}
