/**
 * 패키지 스타일 오버라이드를 켜고 끈다 (PLAN D31 · ARCHITECTURE §19.1).
 *
 * ## 왜 `<style>` 을 직접 넣는가
 *
 * `import './theme.css'` 로 하면 vite 가 자동 주입해서 **끌 수가 없다.** 끄려고
 * `.plain .pck-x` 같은 스코프를 만들면 **특이도가 올라가 증명이 약해진다** — 이 예제의
 * 요점은 "단일 클래스 선택자가 패키지 규칙을 이긴다" 는 것이다.
 *
 * 그래서 `?raw` 로 문자열을 받아 `<style>` 로 붙이고 뗀다. 켜고 끄면 오버라이드가 실제로
 * 먹는지 눈으로 확인된다.
 */
import { useEffect, useState } from 'react'
import themeCss from './theme.css?raw'

export function useThemeToggle(initial = true): [boolean, () => void] {
  const [on, setOn] = useState(initial)

  useEffect(() => {
    if (!on) return
    const style = document.createElement('style')
    style.dataset.exampleTheme = 'true'
    style.textContent = themeCss
    /*
     * `head` 끝에 붙인다. 레이어 밖 규칙이므로 위치는 사실 무관하지만(레이어가 순서보다
     * 우선한다), 같은 조건의 규칙끼리 부딪힐 때 뒤에 온 것이 이기므로 끝이 안전하다.
     */
    document.head.append(style)
    return () => style.remove()
  }, [on])

  return [on, () => setOn((v) => !v)]
}
