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
 * import { configureStrings } from 'pdf-canvas-kit'
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
  'topbar.export': '내보내기',
  'topbar.save': '저장 (프로토타입)',
  'topbar.saving': '저장 중…',
  'topbar.saveHint':
    '프로토타입 저장 — localStorage 에 문서와 이미지를 넣는다. 실서버 연결 전 임시 동작이다.',

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

  'toolbar.text': '텍스트 입력',
  'toolbar.short': '단답형',
  'toolbar.essay': '서술형',
  'toolbar.dropbox': '드롭박스',
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
  'inspector.type.answer.short': '단답형',
  'inspector.type.answer.essay': '서술형',
  'inspector.type.answer.dropbox': '드롭박스',
  'inspector.label': '문항 번호',
  'inspector.labelNote': '비워 두면 위치에 따라 자동으로 번호가 붙는다.',
  'inspector.boxStyle': '색',
  'inspector.background': '배경',
  'inspector.textColor': '글자색',
  'inspector.transparent': '투명',
  'inspector.transparentHint': '배경을 투명하게 둔다. 아래 문서 내용이 그대로 보인다.',
  'inspector.boxStyleNote': '체크를 끄면 기본 테마 색을 따른다. 학생 화면에도 같은 색이 적용된다.',
  'inspector.points': '배점',
  'inspector.delete': '삭제',
  'inspector.answer': '정답',
  'inspector.answerPlaceholder': '정답 입력',
  'inspector.addAnswer': '+ 허용 답안 추가',
  'inspector.gradingNote': '공백·대소문자는 무시하고 채점됩니다.',
  'inspector.choices': '보기',
  'inspector.choicePlaceholder': '보기 입력',
  'inspector.addChoice': '+ 보기 추가',
  'inspector.correctHint': '정답인 보기를 체크한다. 복수면 모두 골라야 정답이다.',
  'inspector.rubric': '채점 가이드',
  'inspector.rubricPlaceholder': '채점 기준·모범답안 (교사용, 학생에게 노출되지 않음)',
  'inspector.essayNote': '서술형은 학생 제출 후 Report에서 교사가 수동 채점합니다.',

  'canvas.noAnswer': '정답 미입력',
  'canvas.essayManual': '서술형 · 수동 채점',
  'canvas.dropboxIncomplete': '보기·정답 미완성',

  'inspector.text': '내용',
  'inspector.fontSize': '크기',
  'inspector.color': '색',
  'inspector.align': '정렬',
  'inspector.bold': '굵게',
  'inspector.shapeKind': '모양',
  'inspector.fill': '채움',
  'inspector.stroke': '테두리',
  'inspector.strokeWidth': '두께',
  'inspector.rotation': '회전',
  'inspector.noFill': '없음',

  'stage.zoomOut': '축소',
  'stage.zoomIn': '확대',
  'stage.fitWidth': '폭 맞춤',
  'stage.fitPage': '페이지 맞춤',
  'stage.actualSize': '100%',

  'export.title': '문서를 과제로 내보내기',
  'export.name': 'Assignment Name',
  'export.namePlaceholder': 'Untitled Document',
  'export.access': '공개 범위',
  'export.public': 'Public',
  'export.classOnly': 'Class Only',
  'export.class': '대상 Class',
  'export.classPlaceholder': '대상 Class 선택',
  'export.noClasses': '선택할 수 있는 Class가 없습니다.',
  'export.submitLimit': '제출 횟수',
  'export.submitOnce': '1회만 제출',
  'export.submitMultiple': '여러 번 제출',
  'export.due': '제출 기한',
  'export.dueNote': '선택 입력. 기한이 지나면 과제가 자동으로 마감됩니다.',
  'export.submit': '내보내기',
  'export.submitting': '내보내는 중…',
  'export.link': '공유 링크',
  'export.copy': '링크 복사',
  'export.copied': '복사됨',
  'export.qr': 'QR 코드',
  'export.afterNote':
    '이후 문서를 수정해도 이 과제에는 반영되지 않습니다. 수정본을 내려면 다시 내보내 주세요.',
  'export.failed': '내보내기에 실패했습니다. 다시 시도해 주세요.',

  'upload.title': 'Upload Documents',
  'upload.tabFile': 'From File',
  'upload.tabDrive': 'Google Drive',
  'upload.hint': 'Click to upload a file',
  'upload.subHint': 'Automatically Create activity from an uploaded file',
  'upload.action': 'Upload file',
  'upload.limit': '(1 limit, 500MB)',
  'upload.formats': 'Supported file format: pdf, doc, docx, ppt, pptx',
  'upload.converting': '변환 중…',
  'upload.driveUnavailable': 'Google Drive 연동은 아직 준비 중입니다.',

  'error.format': 'pdf, doc, docx, ppt, pptx 파일만 업로드할 수 있습니다.',
  'error.size': '최대 500MB까지 업로드할 수 있습니다.',
  'error.pageLimit': '문서 하나에 최대 500페이지까지 지원합니다.',
  'error.convertFailed': '파일을 변환할 수 없습니다. 파일을 확인해 주세요.',
  'error.encrypted': '암호가 설정된 파일은 불러올 수 없습니다.',
  'error.serverConverter': '이 형식은 서버 변환이 필요합니다. 관리자에게 문의해 주세요.',
  'error.aborted': '업로드를 취소했습니다.',
  'error.titleMax': '최대 100자까지 입력할 수 있습니다.',
  'error.max50': '최대 50자까지 입력할 수 있습니다.',
  'error.duplicateChoice': '동일한 보기가 이미 있습니다.',
  'error.boxLimit': 'Answer Box는 페이지당 최대 30개, 전체 200개까지 만들 수 있습니다.',
  'error.answerRequired': '정답이 지정되지 않은 문항이 있습니다.',
  'error.dropboxIncomplete': '보기를 2개 이상 입력하고 정답을 1개 이상 지정해 주세요.',
  'error.pointsRequired': '배점을 입력해 주세요. (1 이상)',
  'error.emptyDoc': '페이지가 없습니다. 문서를 먼저 불러와 주세요.',
  'error.exportBlocked': '내보낼 수 없는 문항이 {count}개 있습니다.',
  'error.minPages': '최소 1페이지는 유지해야 합니다.',

  'confirm.deletePage': '이 페이지의 Answer Box·객체가 함께 삭제됩니다. 삭제할까요?',
  'confirm.cancel': '취소',
  'confirm.ok': '삭제',
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
