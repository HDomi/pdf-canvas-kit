/** i18n port를 결정한다. 호스트가 준 것이 있으면 그것, 없으면 내장 표. */
import { computed, type ComputedRef, type Ref } from 'vue'
import { createI18n, type Locale } from '../../core/i18n/createI18n'
import type { I18nPort } from '../../core/ports/I18nPort'

export function useI18n(
  locale: Ref<Locale | undefined>,
  injected: Ref<I18nPort | undefined>,
): ComputedRef<(key: string, vars?: Record<string, unknown>) => string> {
  const port = computed<I18nPort>(() => injected.value ?? createI18n(locale.value ?? 'ko'))
  return computed(() => (key: string, vars?: Record<string, unknown>) => port.value.t(key, vars))
}
