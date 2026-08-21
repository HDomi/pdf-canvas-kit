/**
 * 예제 앱의 vite 설정.
 *
 * **별칭이 없다.** 레포 소스를 직접 가리키지 않고 `node_modules/pdf-canvas-kit` 을
 * `exports` 맵으로 해석한다 — 그게 실제 소비자 환경이고, `demo/` 는 별칭을 쓰기 때문에
 * 이 경로를 검증하지 못한다.
 *
 * workspace 심링크라 소스가 아니라 **`dist` 를 본다.** 패키지를 고치면 `npm run build` 가
 * 필요하다 — 그 번거로움이 "빌드 산출물이 맞는지" 를 계속 확인하게 만든다.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 심링크된 패키지를 pre-bundle 하지 않으면 dist 변경이 반영되지 않을 때가 있다.
  optimizeDeps: { exclude: ['pdf-canvas-kit'] },
  server: { fs: { allow: ['..', '../..'] } },
})
