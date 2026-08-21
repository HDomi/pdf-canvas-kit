/**
 * 진입점. StrictMode 로 띄운다.
 *
 * `destroy()` 가 멱등이 아니면 편집기가 두 벌 남는다 (PLAN 20.5) — 개발 중에 그걸 잡으려고
 * 일부러 StrictMode 를 쓴다.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
