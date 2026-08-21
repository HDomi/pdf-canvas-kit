/**
 * 예제 앱의 vite 설정. `examples/react` 와 같은 이유로 **별칭이 없다.**
 * `node_modules/@h_domi/pdf-canvas-kit` 을 `exports` 맵으로 해석한다.
 */
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  /*
   * Pages 에서는 데모 사이트 아래 `/vue/` 에 놓인다. 워크플로가 PAGES_BASE 를 준다.
   * 로컬 dev 는 `/` 다 — :310x 포트를 각자 쓰므로 서브패스가 없다.
   */
  base: process.env.PAGES_BASE ?? '/',
  plugins: [vue()],
  optimizeDeps: { exclude: ['@h_domi/pdf-canvas-kit'] },
  server: { fs: { allow: ['..', '../..'] } },
})
