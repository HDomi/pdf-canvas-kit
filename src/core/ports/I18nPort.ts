/** UI 문구는 키로 참조하며 하드코딩하지 않는다 (기획 3.2). */
export interface I18nPort {
  t(key: string, vars?: Record<string, unknown>): string
}
