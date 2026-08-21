/**
 * 텍스트 객체가 고를 수 있는 글꼴 목록 (2026.08.21).
 *
 * ## 패키지는 웹폰트를 싣지 않는다 ★
 *
 * 여기 있는 것은 **가족 이름뿐**이다. `.woff2` 파일도, `@font-face` 도, Google Fonts 링크도
 * 넣지 않는다. 이유 셋:
 *
 * | | 왜 |
 * | --- | --- |
 * | 용량 | 한글 폰트는 서브셋 없이 1.5~4MB 다. 안 쓰는 소비자도 받는다 |
 * | 라이선스 | 재배포 조건은 폰트마다 다르다. 파일을 싣는 순간 이 패키지가 그 조건을 진다 |
 * | 중복 | 앱이 이미 같은 폰트를 자기 방식으로 불러오고 있으면 두 번 받는다 |
 *
 * 그래서 문서에 저장되는 값은 CSS `font-family` **스택 문자열**이다. 폰트가 없는 환경에서는
 * 스택의 다음 후보로 떨어진다 — 글자가 사라지지 않는다.
 *
 * ⚠️ **호스트가 웹폰트를 불러와야 실제로 그 모양이 나온다.** 기본 목록의 한글 폰트는 전부
 * 상용 이용이 무료인 OFL(SIL Open Font License 1.1) 폰트로 골랐지만, 불러오는 것은 앱의 몫이다.
 * `docs/16-fonts.md` 에 방법을 적었다.
 *
 * ## PDF 로 내보낼 때
 *
 * 내보내기는 화면을 그대로 래스터화한다. 즉 **브라우저에 폰트가 로드되어 있어야** 결과에
 * 반영된다. 로드 전에 내보내면 폴백 글꼴로 굳는다 — `document.fonts.ready` 를 기다린 뒤
 * 내보내는 것을 권한다.
 *
 * ## 모듈 수준 상태다
 *
 * `strings` · `icons` 와 같은 판단이다 (D32). 인스턴스별로 다른 목록을 쓰는 요구가 아직 없고,
 * 그것을 지원하려면 목록을 컨트롤러까지 내려보내야 한다.
 */

export interface FontOption {
  /**
   * CSS `font-family` 값. **이것이 문서에 저장된다.**
   *
   * 폴백을 포함한 스택으로 쓴다 — 첫 후보가 없는 기기에서 두부(□)가 되지 않게.
   */
  stack: string
  /** 인스펙터 목록에 보이는 이름. */
  label: string
}

/**
 * 기본 목록.
 *
 * 첫 항목의 스택이 `sans-serif` 인 것은 의도다 — 새 텍스트 객체의 기본값
 * (`core/interaction/tools.ts`)과 같아야 인스펙터가 "선택 없음" 으로 열리지 않는다.
 *
 * 한글 폰트는 **상용 이용 무료**만 골랐다. 전부 OFL 1.1 이다.
 *
 * | 가족 | 라이선스 | 배포 |
 * | --- | --- | --- |
 * | Noto Sans KR · Noto Serif KR | OFL 1.1 | Google Fonts |
 * | Nanum Gothic · Nanum Myeongjo | OFL 1.1 | Google Fonts · 네이버 |
 * | Pretendard | OFL 1.1 | jsDelivr · GitHub |
 * | IBM Plex Sans KR | OFL 1.1 | Google Fonts |
 * | Gowun Dodum | OFL 1.1 | Google Fonts |
 *
 * 웹폰트 이름 뒤에 항상 `sans-serif` · `serif` 를 붙인다. 로드 실패가 조용히 넘어가야 한다.
 */
export const DEFAULT_FONTS: readonly FontOption[] = [
  { stack: 'sans-serif', label: '기본 산세리프' },
  { stack: 'serif', label: '기본 세리프' },
  { stack: 'monospace', label: '고정폭' },
  {
    stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    label: '시스템 UI',
  },
  { stack: '"Pretendard", sans-serif', label: 'Pretendard' },
  { stack: '"Noto Sans KR", sans-serif', label: 'Noto Sans KR' },
  { stack: '"Noto Serif KR", serif', label: 'Noto Serif KR' },
  { stack: '"Nanum Gothic", sans-serif', label: '나눔고딕' },
  { stack: '"Nanum Myeongjo", serif', label: '나눔명조' },
  { stack: '"IBM Plex Sans KR", sans-serif', label: 'IBM Plex Sans KR' },
  { stack: '"Gowun Dodum", sans-serif', label: '고운돋움' },
]

let table: readonly FontOption[] = DEFAULT_FONTS

/**
 * 목록을 **교체한다.** 병합이 아니다.
 *
 * 앱이 실제로 불러오는 폰트만 보여야 한다 — 없는 폰트를 고르면 폴백으로 그려져 "왜 안 바뀌지"
 * 가 된다. 그래서 병합이 아니라 교체다.
 *
 * 빈 배열을 주면 인스펙터에서 글꼴 항목이 사라진다. 글꼴 선택을 막고 싶을 때 쓴다.
 *
 * ⚠️ 모듈 수준 상태다. **앱 부트스트랩에서 한 번** 부른다 — 이미 렌더된 인스펙터는 갱신되지
 * 않는다.
 */
export function configureFonts(fonts: readonly FontOption[]): void {
  table = [...fonts]
}

/** 기본 목록으로 되돌린다. 검증 화면에서 상태가 새는 것을 막는다. */
export function resetFonts(): void {
  table = DEFAULT_FONTS
}

/** 현재 목록. 인스펙터가 읽는다. */
export function fontOptions(): readonly FontOption[] {
  return table
}
