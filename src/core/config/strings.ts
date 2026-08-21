/**
 * UI 문구 (2026.08.20 — i18n 시스템 제거 후 단일 표).
 *
 * ## 왜 표 하나인가
 *
 * 이전에는 `I18nPort` + `createI18n` + ko/en 두 표 + locale 전환이 있었다. 그 구조가 컴포넌트와
 * 컨트롤러 시그니처마다 `t` 를 끌고 다녀야 하는 배선 비용을 만들었고, 실제로 쓰이는 것은
 * 한국어 표 하나였다. 그래서 **시스템을 걷어내고 문구만 남겼다.**
 *
 * 다국어는 나중에 다시 설계한다 — 그때 이 파일이 그대로 출발점이 된다. 문구가 컴포넌트에
 * 흩어져 있지 않고 여기 모여 있는 것이 그 전제다.
 *
 * ## 바꾸는 방법
 *
 * ```ts
 * import { configureStrings } from '@h_domi/pdf-canvas-kit'
 *
 * // 앱 부트스트랩에서 한 번. 지정한 키만 덮는다.
 * configureStrings({ 'topbar.export': '과제로 내보내기' })
 * ```
 *
 * `configurePdfResources()` 와 같은 형태다 — 모듈 수준 설정을 한 번 주입한다.
 *
 * ## 없는 키
 *
 * 키 자체를 돌려준다. UI 에 `topbar.export` 가 그대로 보이는 편이 빈 엘리먼트보다
 * 발견하고 고치기 쉽다.
 */

/** 기본 문구. `configureStrings()` 가 이 위에 덮는다. */
export const DEFAULT_STRINGS = {
  'topbar.back': '뒤로 가기',
  'topbar.titlePlaceholder': '제목 없는 문서',
  'topbar.undo': '되돌리기',
  'topbar.redo': '다시 실행',
  /*
   * 상단바 [내보내기] 버튼은 아직 없다 (docs/TODO.md). 검증 게이트는 `EditorHandle` 에 이미
   * 있고 버튼만 빠져 있어 이 키만 미리 남긴다.
   */
  'topbar.export': '내보내기',
  'topbar.save': 'JSON 출력',
  'topbar.saving': '저장 중…',
  'topbar.saveHint': '문서 JSON 을 콘솔에 출력한다. 실서버 연결 전의 자리다.',

  'save.saved': '저장됨',
  'save.saving': '저장 중…',
  'save.error': '저장 안 됨',
  'save.disabled': '저장 없음',

  'pages.title': 'PAGES',
  'pages.addFile': '+ 파일 추가',
  'pages.addBlank': '+ 빈 페이지',
  'pages.duplicate': '페이지 복제',
  'pages.delete': '페이지 삭제',
  'pages.empty': '페이지 없음',

  'empty.title': '아직 불러온 문서가 없습니다',
  'empty.description': 'PDF나 문서를 불러오면 문서 편집을 시작할 수 있습니다.',
  'empty.action': '문서 불러오기',
  /*
   * 뷰어의 빈 상태. 편집기와 문구가 다르다 — 뷰어는 문서를 불러올 수 없고, 여기 온 것은
   * 호스트가 아직 `doc` 을 주지 않았다는 뜻이다.
   */
  'viewer.empty': '표시할 문서가 없습니다',

  'toolbar.text': '텍스트 입력',
  'toolbar.shape': '도형',
  'toolbar.eraser': '지우개',
  'toolbar.duplicate': '복제',
  'toolbar.delete': '삭제',

  'panel.resizePageList': '페이지 목록 폭 조절 (더블클릭: 기본값)',
  'panel.resizeInspector': '인스펙터 폭 조절 (더블클릭: 기본값)',

  'inspector.title': 'INSPECTOR',
  'inspector.empty': '선택된 요소 없음',
  'inspector.multiple': '{count}개 선택됨',
  'inspector.type.text': '텍스트',
  'inspector.type.shape': '도형',
  'inspector.type.mask': '지우개 영역',
  'inspector.boxStyle': '색',
  'inspector.background': '배경',
  'inspector.textColor': '글자색',
  'inspector.transparent': '투명',
  'inspector.transparentHint': '배경을 투명하게 둔다. 아래 문서 내용이 그대로 보인다.',
  'inspector.boxStyleNote': '체크를 끄면 기본 테마 색을 따른다. 뷰어 화면에도 같은 색이 적용된다.',
  'inspector.delete': '삭제',

  'inspector.text': '내용',
  'inspector.fontSize': '크기',
  'inspector.align': '정렬',
  'inspector.bold': '굵게',
  'inspector.shapeKind': '모양',
  'inspector.fill': '채움',
  'inspector.stroke': '테두리',
  'inspector.strokeWidth': '두께',
  'inspector.noCustomEditor': '이 객체는 편집할 속성이 없습니다.',
  'inspector.rotation': '회전',
  'inspector.noFill': '없음',
  'inspector.fontFamily': '글꼴',
  /*
   * 웹폰트를 패키지가 싣지 않는다는 사실을 UI 에서도 알린다 (`core/config/fonts.ts`).
   * 호스트가 폰트를 불러오지 않으면 목록에서 골라도 폴백으로 그려진다.
   */
  'inspector.fontFamilyNote': '앱이 불러온 폰트만 실제로 적용됩니다',

  /*
   * 도형 이름. 선택기 버튼의 접근 가능한 이름(`title` · `aria-label`)으로 쓴다 —
   * 라벨이 글리프뿐이라 이것이 없으면 스크린리더가 읽을 것이 없다.
   */
  'shape.rect': '사각형',
  'shape.ellipse': '원',
  'shape.triangle': '삼각형',
  'shape.diamond': '마름모',
  'shape.pentagon': '오각형',
  'shape.hexagon': '육각형',
  'shape.star': '별',
  'shape.cross': '십자',
  'shape.line': '선',
  'shape.arrow': '화살표',
  'shape.doubleArrow': '양쪽 화살표',

  'stage.zoomOut': '축소',
  'stage.zoomIn': '확대',
  'stage.fitWidth': '폭 맞춤',
  'stage.fitPage': '페이지 맞춤',

  'upload.title': '문서 불러오기',
  'upload.tabFile': '파일에서',
  'upload.tabDrive': 'Google Drive',
  'upload.hint': '클릭해서 파일을 고르세요',
  'upload.subHint': '올린 파일에서 문서를 자동으로 만듭니다',
  'upload.action': '파일 선택',
  'upload.limit': '(1 limit, 500MB)',
  'upload.formats': '지원 형식: pdf, doc, docx, ppt, pptx',
  'upload.converting': '변환 중…',
  'upload.driveUnavailable': 'Google Drive 연동은 아직 준비 중입니다.',

  'error.format': 'pdf, doc, docx, ppt, pptx 파일만 업로드할 수 있습니다.',
  'error.size': '최대 500MB까지 업로드할 수 있습니다.',
  'error.objectLimit': '한 페이지에 최대 30개, 문서 전체 200개까지 넣을 수 있습니다.',
  'error.unknownKind': '이 앱이 모르는 객체입니다. 자리는 유지되지만 편집할 수 없습니다.',
  'error.pageLimit': '문서 하나에 최대 500페이지까지 지원합니다.',
  'error.convertFailed': '파일을 변환할 수 없습니다. 파일을 확인해 주세요.',
  'error.encrypted': '암호가 설정된 파일은 불러올 수 없습니다.',
  'error.aborted': '업로드를 취소했습니다.',
  'error.emptyDoc': '페이지가 없습니다. 문서를 먼저 불러와 주세요.',
  'error.exportBlocked': '내보낼 수 없는 문항이 {count}개 있습니다.',
  'error.minPages': '최소 1페이지는 유지해야 합니다.',

  'confirm.deletePage': '이 페이지의 객체가 함께 삭제됩니다. 삭제할까요?',
  'confirm.cancel': '취소',
  'confirm.ok': '삭제',

  /* ------------------------------------------------------------ 아이콘 -- */

  /*
   * 아이콘도 문구다 (R12 후속).
   *
   * 유니코드 글리프를 쓰는 이유: SVG 스프라이트를 넣으면 소비자가 그것을 교체할 방법이
   * 별도로 필요해지고, 아이콘 프레임워크를 요구하게 된다. 문자열로 두면 **문구와 같은
   * 경로로 덮어쓸 수 있다** — `strings` prop 하나로 끝난다.
   *
   * SVG 로 바꾸고 싶으면 CSS 로 한다. 아이콘 버튼에 `data-icon` 속성이 있고 패키지 스타일이
   * `@layer` 안에 있으므로 아래가 이긴다.
   *
   *   .pck-icon-btn[data-icon='undo'] { font-size: 0; background: url(undo.svg) center/16px no-repeat; }
   */
  'icon.back': '‹',
  'icon.undo': '↶',
  'icon.redo': '↷',
  'icon.zoomOut': '−',
  'icon.zoomIn': '+',
  'icon.close': '×',
  'icon.remove': '×',
  /** 등록되지 않은 커스텀 객체 타입 표시. */
  'icon.unknown': '?',
  /** 드롭다운 캐럿. */
  'icon.caret': '▾',

  /*
   * 도형 종류 글리프 (2026.08.21).
   *
   * 인스펙터의 [모양] 선택기에 그대로 들어간다. `⬠` · `⬡` 처럼 커버리지가 넓지 않은 글리프가
   * 섞여 있으므로 **덮어쓸 수 있어야 한다** — 폰트가 없으면 두부(□)로 보인다. SVG 로 바꾸려면
   * 위 `data-icon` 방식이 아니라 이 문구를 빈 문자열로 두고 `.pck-segmented button` 을 CSS 로
   * 그리는 편이 낫다. 선택기 버튼에는 `data-shape` 속성이 있다.
   */
  'icon.shape.rect': '▭',
  'icon.shape.ellipse': '◯',
  'icon.shape.triangle': '△',
  'icon.shape.diamond': '◇',
  'icon.shape.pentagon': '⬠',
  'icon.shape.hexagon': '⬡',
  'icon.shape.star': '☆',
  'icon.shape.cross': '✚',
  'icon.shape.line': '╱',
  'icon.shape.arrow': '→',
  'icon.shape.doubleArrow': '↔',
} as const

export type StringKey = keyof typeof DEFAULT_STRINGS

/** 현재 적용된 표. `configureStrings()` 가 교체한다. */
let table: Record<string, string> = { ...DEFAULT_STRINGS }

/**
 * 문구를 덮어쓴다. 지정한 키만 바뀐다.
 *
 * 모듈 수준 상태이므로 **앱 부트스트랩에서 한 번** 부르는 것을 전제로 한다. 편집기가 이미
 * 떠 있는 상태에서 바꾸면 이미 렌더된 문구는 갱신되지 않는다 — 반응형이 아니다.
 */
export function configureStrings(overrides: Partial<Record<StringKey, string>>): void {
  table = { ...table, ...overrides }
}

/** 기본 표로 되돌린다. 테스트·검증 화면에서 상태가 새는 것을 막는다. */
export function resetStrings(): void {
  table = { ...DEFAULT_STRINGS }
}

/**
 * 문구를 읽는다. `{name}` 자리를 `vars` 로 채운다.
 *
 * ```ts
 * text('error.exportBlocked', { count: 3 })
 * ```
 */
export function text(key: string, vars?: Record<string, unknown>): string {
  const template = table[key] ?? key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_m: string, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  )
}
