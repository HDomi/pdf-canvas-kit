/**
 * 예제 앱의 vite 설정. `examples/react` 와 같은 이유로 **별칭이 없다.**
 * `node_modules/pdf-canvas-kit` 을 `exports` 맵으로 해석한다.
 */
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  optimizeDeps: { exclude: ['pdf-canvas-kit'] },
  server: { fs: { allow: ['..', '../..'] } },
})
