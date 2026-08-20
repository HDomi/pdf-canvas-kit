/**
 * i18n port 를 결정한다. 호스트가 준 것이 있으면 그것, 없으면 내장 표.
 *
 * 구 `src/vue/composables/useI18n.ts` 의 이식.
 */
import { computed, type ReadSignal } from '../dom/reactive'
import { createI18n, type Locale } from '../core/i18n/createI18n'
import type { I18nPort } from '../core/ports/I18nPort'

/** 문구를 뽑는 함수. 컴포넌트가 이 형태로 받는다. */
export type Translate = (key: string, vars?: Record<string, unknown>) => string

export function createTranslator(
  locale: ReadSignal<Locale | undefined>,
  injected: ReadSignal<I18nPort | undefined>,
): ReadSignal<Translate> {
  const port = computed<I18nPort>(() => injected.value ?? createI18n(locale.value ?? 'ko'))
  return computed<Translate>(() => (key, vars) => port.value.t(key, vars))
}
