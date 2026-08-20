/**
 * 키 기반 문구 조회 (기획 3.2는 UI 문구 하드코딩을 금지한다).
 *
 * 호스트가 자기 {@link I18nPort} 를 넘겨 표 전체를 교체할 수 있다. 이건 ko·en을 담은
 * 내장 구현이다.
 */
import type { I18nPort } from '../ports/I18nPort'
import { en } from './en'
import { ko, type I18nKey } from './ko'

export type Locale = 'ko' | 'en'

const TABLES: Record<Locale, Record<string, string>> = { ko, en }

/**
 * @param locale 사용할 문구 표
 * @param overrides 키별 교체값. 다른 문구가 필요한 제품용
 */
export function createI18n(
  locale: Locale = 'ko',
  overrides: Partial<Record<I18nKey, string>> = {},
): I18nPort {
  const table: Record<string, string> = { ...TABLES[locale], ...overrides }
  return {
    t(key, vars) {
      // 없는 키는 키 자체를 돌려준다. UI에 `pages.title` 이 그대로 보이는 편이
      // 빈 엘리먼트보다 발견하고 고치기 쉽다.
      const template = table[key] ?? key
      if (!vars) return template
      return template.replace(/\{(\w+)\}/g, (_match: string, name: string) =>
        name in vars ? String(vars[name]) : `{${name}}`,
      )
    },
  }
}

export type { I18nKey }
