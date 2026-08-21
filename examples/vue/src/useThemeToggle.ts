/**
 * 패키지 스타일 오버라이드를 켜고 끈다 (커스터마이징은 토큰 → @layer → 다이얼로그 위임 3단계다).
 *
 * ## 왜 `<style>` 을 직접 넣는가
 *
 * `import './theme.css'` 로 하면 vite 가 자동 주입해서 **끌 수가 없다.** 끄려고
 * `.plain .pck-x` 같은 스코프를 만들면 **특이도가 올라가 증명이 약해진다** — 이 예제의
 * 요점은 "단일 클래스 선택자가 패키지 규칙을 이긴다" 는 것이다.
 *
 * 그래서 `?raw` 로 문자열을 받아 `<style>` 로 붙이고 뗀다.
 */
import { onScopeDispose, ref, watchEffect } from 'vue'
import themeCss from './theme.css?raw'

export function useThemeToggle(initial = true) {
  const on = ref(initial)
  let style: HTMLStyleElement | null = null

  const remove = () => {
    style?.remove()
    style = null
  }

  watchEffect(() => {
    // ⚠️ on.value 를 먼저 읽는다. 조건 안에서만 읽으면 의존성이 등록되지 않는다.
    const enabled = on.value
    remove()
    if (!enabled) return
    style = document.createElement('style')
    style.dataset.exampleTheme = 'true'
    style.textContent = themeCss
    document.head.append(style)
  })

  onScopeDispose(remove)

  return { on, toggle: () => (on.value = !on.value) }
}
