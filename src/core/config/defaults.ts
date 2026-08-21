/**
 * 조정 가능한 모든 수치를 한곳에 모은다.
 *
 * 세 그룹으로 나뉘며, 섞으면 문제가 생긴다.
 *
 * - **기획 한도** (`LIMITS`) — 기획 스펙에서 온 값. 바꾸면 편집기가 만들 수 있는 결과물이
 *   달라지고 서버도 같은 규칙을 검증하므로, 호스트가 임의로 조정할 값이 아니다.
 * - **편집 동작** (`EDITOR_DEFAULTS`) — 기본 객체 크기, 줌 단계, 이동 거리 같은 ergonomics.
 *   제품별로 조정해도 안전하다.
 * - **렌더링** (`RENDER_DEFAULTS`) — 화질 대 변환 시간·메모리의 트레이드오프.
 *   수치의 근거가 되는 실측은 ARCHITECTURE.md 참고.
 *
 * 시각적 치수(패널 폭, 색)는 여기가 아니라 CSS 변수에 둔다. 리빌드 없이 테마를 바꿀 수 있어야
 * 하기 때문이다 — `src/styles/tokens.css` 참고.
 */
import type { Pt } from '../model/types'

/**
 * 기획서의 고정 한도. 서버도 같은 값을 검증하므로, 한쪽만 바꾸면
 * 소비자 서버가 문서를 거부하게 된다.
 */
export const LIMITS = {
  /** 한 문서의 최대 페이지 수 (기획 2.2). */
  pagesPerDoc: 500,
  /** 파일 1개당 최대 업로드 용량(바이트) (기획 2.2). */
  fileBytes: 500 * 1024 * 1024,
  /** 업로드 1회당 파일 수 (기획 2.2 — "1 limit"). */
  filesPerUpload: 1,
  /**
   * 페이지당 객체 최대 개수.
   *
   * DOM 렌더 (캔버스는 canvas 가 아니라 DOM 절대 배치다)의 상한이다. 이 수를 넘기면 페이지 하나의 노드 수가 드래그 성능에
   * 영향을 준다 — 드래그 중 rAF 코얼레싱을 쓰지 않는 판단이 이 상한을 전제로 한다.
   */
  objectsPerPage: 30,
  /** 문서 전체 객체 최대 개수. */
  objectsPerDoc: 200,
  /** 문서 타이틀 최대 글자 수 (기획 4.2). */
  titleChars: 100,
  /** 업로드 가능한 문서 포맷 (기획 2.2). */
  formats: ['pdf', 'doc', 'docx', 'ppt', 'pptx'] as const,
} as const

/**
 * 편집 ergonomics. 기획을 위반하지 않는 범위에서 제품별로 조정할 수 있다.
 */
export const EDITOR_DEFAULTS = {
  /** 생성 도구를 드래그 없이 클릭했을 때 쓰는 크기. */
  newObjectSize: { w: 160 as Pt, h: 40 as Pt },
  /** 텍스트·도형의 최소 크기. Answer Box는 `LIMITS.minAnswerBoxSize` 를 쓴다. */
  minObjectSize: { w: 8 as Pt, h: 8 as Pt },
  /**
   * 히트 테스트에만 주는 최소 집기 두께(pt). **객체 크기는 바꾸지 않는다.**
   *
   * 선·화살표는 박스가 실제로 얇다(2026.08.21 부터 — `normalizeShapeRect`). 1pt 두께 선의
   * 박스는 1pt 라 마우스로 정확히 집는 것이 사실상 불가능하다. 8pt 는 `minObjectSize` 와 같은
   * 값으로, "가장 작은 객체만큼은 집을 수 있다" 는 기준을 히트 테스트에도 맞춘 것이다.
   */
  minHitSize: 8 as Pt,
  /** 붙여넣기·복제한 객체가 원본을 가리지 않도록 주는 오프셋. */
  duplicateOffset: 8 as Pt,
  /** 방향키 이동 거리, 그리고 Shift를 누른 경우의 거리. */
  nudge: { small: 1 as Pt, large: 10 as Pt },
  /** 스냅이 켜져 있을 때의 그리드 간격(pt). */
  snapGrid: 4 as Pt,
  /** undo 스택 깊이. 더 키워도 메모리만 쓰고 실익이 적다. */
  historyLimit: 100,
  /** 자동저장 디바운스와, 대기 중인 변경을 최대 얼마나 미룰지. */
  autosave: { debounceMs: 5_000, maxDelayMs: 30_000, retries: 3 },

  /** 줌 범위와 +/- 버튼이 밟는 프리셋 계단. */
  zoom: {
    min: 0.25,
    max: 4,
    presets: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4],
    /** Ctrl/Cmd + 휠의 휠 단위당 지수 계수. */
    wheelFactor: 1.0015,
  },
  /**
   * 페이지와 스테이지 경계 사이의 여백(CSS px).
   *
   * 맞춤 모드가 양축에서 이 값을 빼므로 src/styles/tokens.css 의 `--pck-stage-padding` 과
   * 일치해야 한다. 어긋나면 "페이지 맞춤"이 페이지를 자르거나 눈에 보이는 여백을 남긴다
   * (ARCHITECTURE §3.2).
   */
  stagePadding: 32,

  /** 선택 핸들은 scale transform 밖에 그린다 (핸들·마퀴는 scale 밖 오버레이다). */
  /**
   * 리사이즈·회전 핸들.
   *
   * ## CSS 토큰이 아니라 TS 상수다 ★
   *
   * 시각 값은 보통 `tokens.css` 로 뺀다(ARCHITECTURE §3.2). 핸들은 **예외로 남긴다** —
   * 호스트가 바꿀 수 있게 하지 않는다. `resizeHandles.ts` 가 인라인 스타일로 주므로 CSS 로
   * 이길 수 없고, 그것이 의도다. 다음 사람이 "왜 토큰이 아니지" 하고 옮기지 않도록 적어 둔다.
   *
   * 이유: 핸들 크기는 취향이 아니라 **집을 수 있는지**의 문제다. 너무 작으면 잡히지 않고,
   * 너무 크면 얇은 객체(선·화살표는 박스가 실제로 얇다 — §21.1.1)에서 8개가 서로 겹쳐
   * 어느 것을 잡는지 알 수 없게 된다. 그 균형을 호스트 테마마다 다시 맞추게 할 이유가 없다.
   */
  handles: {
    /**
     * 화면상 **보이는** 크기(CSS px). 어떤 배율에서도 일정하다.
     *
     * 테두리 1px 이 더해져 실제로는 이 값 + 2px 로 보인다. 2026.08.21 에 8 → 6 으로 줄였다:
     * 선·화살표의 박스가 실제 두께로 조여진 뒤로(§21.1.1) 예전 크기에서는 얇은 객체의 핸들이
     * 서로 겹쳤다.
     */
    sizePx: 6,
    /**
     * 포인터 **히트** 영역(CSS px). 보이는 크기보다 크게 둔다.
     *
     * 차이를 `padding` 으로 주고 `background-clip: content-box` 로 그 부분을 칠하지 않는다.
     * 그래서 보이는 크기를 줄여도 집기 편함은 유지된다 — 16 은 위 6 과 짝을 맞춘 값으로,
     * 줄이기 전(8 / 14)과 총 히트 박스가 같다.
     */
    hitPx: 16,
  },

  /** 객체를 스테이지 경계로 끌 때의 자동 스크롤. */
  edgeScroll: { thresholdPx: 40, maxStepPx: 20 },
} as const

/**
 * 래스터화 설정. 실측은 ARCHITECTURE.md의 "렌더링" 절 참고.
 * 요지는 Chrome에서 이런 페이지를 JPEG로 인코딩하면 WebP보다 약 6.7배 빠르다는 것이다.
 */
export const RENDER_DEFAULTS = {
  /**
   * 목표 래스터 폭(px). 1654 ≈ 200dpi에서의 A4 폭.
   *
   * ⚠️ **메모리 주의** — 이 값이 배경 이미지 용량을 직접 결정한다.
   * 1654px · JPEG q.85 에서 페이지당 약 400KB이므로 **500페이지 문서는 약 200MB**의 blob을
   * 만든다. 브라우저가 디스크로 내리므로 JS heap은 아니지만 무시할 양이 아니다.
   *
   * 실사용 대다수인 수십 페이지 문서에서는 문제가 없다. 극단 케이스가 문제가 되면
   * 이 값을 낮추는 것이 가장 효과가 크다(1240px = 약 270KB/page, 화질은 150dpi 수준).
   * 좌표는 pt이므로 **해상도를 바꿔도 객체 위치는 움직이지 않는다**.
   */
  targetPx: 1654,
  /** 래스터화 배율 상한. 지나치게 큰 페이지로부터 보호한다. */
  maxScale: 3,
  /** 페이지 배경의 출력 포맷. 배경에는 투명이 없다. */
  mime: 'image/jpeg',
  quality: 0.85,
  /** 페이지 목록용 썸네일 폭(px). */
  thumbnailPx: 160,
} as const

/** 좌측 페이지 목록·우측 인스펙터의 폭. `tokens.css` 에도 같은 값이 있다. */
export const LAYOUT_DEFAULTS = {
  topBarHeightPx: 56,
  pageListWidthPx: 240,
  inspectorWidthPx: 280,
} as const

export type Limits = typeof LIMITS
export type EditorDefaults = typeof EDITOR_DEFAULTS
export type RenderDefaults = typeof RENDER_DEFAULTS
export type LayoutDefaults = typeof LAYOUT_DEFAULTS
