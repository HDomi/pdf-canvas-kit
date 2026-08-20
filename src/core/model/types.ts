/**
 * 문서 모델.
 * PLAN 4장(데이터 모델)과 5장(좌표계) 참고.
 */

/** 1pt = 1/72 inch. 저장되는 모든 좌표의 단위 (PLAN D3). */
export type Pt = number

/**
 * 페이지 로컬 사각형(pt). 좌상단 원점, y-down (PLAN D6).
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
 * - `blob`   메모리 object URL. 새로고침 시 소멸, **직렬화 불가** (PLAN 4.1).
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
      /** 래스터 픽셀 크기. 품질 판단에만 쓰고 좌표 계산에는 절대 쓰지 않는다 (PLAN 5.7). */
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
   * 문서 단일 크기를 가정하면 배경이 왜곡된다 (PLAN D7).
   */
  size: Size
  background: PageBackground
  /** 이 페이지의 출처. 디버깅과 페이지 목록 툴팁용. */
  source?: PageSource
  /** 배경 위에 얹히는 객체들. 배열 순서가 z-order이며 마지막이 위. */
  objects: PDFCanvasObject[]
}

/**
 * 교사가 편집하는 워크시트 — **정답을 포함한다**.
 *
 * 학생에게 이 타입을 그대로 넘기면 안 된다. `toPublicDoc()` 이 정답 필드를 제거하고
 * 별도 타입을 돌려주므로 실수는 컴파일 시점에 걸린다 (PLAN D14).
 *
 * 뷰 상태(배율·스크롤·선택·현재 페이지)는 의도적으로 여기에 없다. `EditorViewState` 에 두는데,
 * 문서에 섞으면 배율만 바꿔도 dirty가 되고 자동저장이 돈다 (PLAN 6.6).
 */
export interface PDFCanvasDoc {
  /** 구조가 바뀌면 올린다. `migrate.ts` 가 이전 문서를 올려준다. */
  schemaVersion: 1
  id: string
  /** 상단 바와 My Storage에 표시된다. 최대 100자 (기획 4.2). */
  title: string
  /**
   * 교사가 타이틀을 한 번이라도 손으로 고쳤는지.
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
 * 값을 주지 않으면 CSS 토큰(`--pck-answerbox-bg` 등)의 기본값이 그대로 적용된다. 객체마다 색을
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
  /** 페이지 로컬 pt 좌표의 위치·크기 (PLAN D3). */
  rect: Rect
  /**
   * 객체 중심 기준 시계방향 각도(deg).
   *
   * 텍스트와 도형만 회전한다. Answer Box는 0으로 고정 — 폼 요소가 기울면 학생의 입력과
   * 모바일 렌더가 깨진다 (PLAN Q8).
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

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow'

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
 * 구현했고, 이 타입은 "배경 가리기" 해석을 위해 남겨 둔다 (PLAN Q1).
 * 나중 버전이 쓴 문서도 파싱되도록 유니온에 포함한다.
 */
export interface MaskObject extends ObjectBase {
  type: 'mask'
  /** CSS 색상. 기본은 종이와 같은 흰색. */
  fill: string
}

/** Answer Box 3종이 공유하는 필드. */
interface AnswerBoxBase extends ObjectBase {
  /**
   * 정답 시 부여하는 배점. 1 이상 정수, 기본 1.
   *
   * all-or-nothing이다 — 틀리거나 미응답이면 0점이고 부분 점수는 없다 (기획 3.3).
   */
  points: number
  /** 교사에게 보이는 문항 번호. 자동 부여 + 수동 오버라이드 (PLAN Q9). */
  label?: string
  /**
   * 시각 스타일. 미지정 필드는 CSS 토큰 기본값을 따른다 (PLAN 18.8).
   *
   * **학생 화면에도 그대로 적용된다.** 교사가 교재 배경에 맞춰 색을 조정하면 학생도 같은 모양을
   * 봐야 하므로, `toPublicDoc` 이 이 필드를 제거하지 않는다.
   */
  style?: BoxStyle
}

/**
 * 자유 텍스트 입력, 자동 채점.
 *
 * 비교 전에 공백을 제거하고 대소문자를 무시한다(기획 3.3). 그래서 "Seoul" 과 "seo ul" 이
 * 모두 "seoul" 과 일치한다.
 */
export interface ShortAnswerBox extends AnswerBoxBase {
  type: 'answer.short'
  /**
   * 허용 정답. 1~5개, 각 1~50자.
   * **하나라도** 일치하면 정답이며, 이게 동의어를 처리하는 방식이다.
   */
  answers: string[]
}

/**
 * 서술형 답안. **자동 채점 불가** — 교사가 Report에서 정답/오답을 지정하며,
 * 지정 전까지는 '미채점' 상태로 점수에 반영되지 않는다 (기획 3.3).
 */
export interface EssayAnswerBox extends AnswerBoxBase {
  type: 'answer.essay'
  /** 교사용 채점 가이드. 학생 문서에서는 제거된다. */
  rubric?: string
}

/**
 * 드롭다운 선택, 자동 채점. 학생에게는 placeholder "선택" 의 select로 보인다.
 */
export interface DropboxAnswerBox extends AnswerBoxBase {
  type: 'answer.dropbox'
  /** 보기 2~5개, 각 1~50자. 배열 순서대로 학생에게 노출되고 중복은 거부한다. */
  choices: { id: string; label: string }[]
  /**
   * 정답 보기. 최소 1개.
   *
   * 복수면 학생이 **지정 정답을 모두, 그리고 그것만** 선택해야 정답이다 —
   * all-or-nothing, 부분 점수 없음 (기획 3.3).
   */
  correctChoiceIds: string[]
}

export type AnswerBox = ShortAnswerBox | EssayAnswerBox | DropboxAnswerBox

export type PDFCanvasObject = TextObject | ShapeObject | MaskObject | AnswerBox

export type PDFCanvasObjectType = PDFCanvasObject['type']
