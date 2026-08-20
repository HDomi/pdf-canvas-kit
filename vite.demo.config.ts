import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const r = (p: string) => resolve(import.meta.dirname, p)

/** 데모 dev 서버 (PLAN 14.1). */
export default defineConfig({
  root: r('demo'),
  plugins: [react()],
  resolve: {
    /**
     * 배열 형태를 쓴다. 순서가 중요하다 — 서브패스가 패키지 이름보다 먼저 해석돼야 하며,
     * 그러지 않으면 `src/index.ts/react` 가 된다. package.json 의 `exports` 맵과 같은 구조다.
     *
     */
    alias: [
      // `styles.css` 는 실제 파일이 아니라 빌드 산출물이다. 데모는 소스 CSS 를 직접 본다.
      { find: 'pdf-canvas-kit/styles.css', replacement: r('src/styles.ts') },
      { find: 'pdf-canvas-kit/react', replacement: r('src/react/index.tsx') },
      { find: 'pdf-canvas-kit/vue', replacement: r('src/vue/index.ts') },
      { find: 'pdf-canvas-kit', replacement: r('src/index.ts') },
      { find: '@core', replacement: r('src/core') },
    ],
  },
  server: {
    port: 3100,
    strictPort: true,
    open: false,
    /**
     * LAN의 다른 기기(태블릿·다른 PC)에서 열 수 있도록 모든 인터페이스에 바인딩한다.
     *
     * ⚠️ 같은 네트워크의 누구나 접근할 수 있다. 개발용 서버이므로 신뢰할 수 있는 네트워크에서만
     * 쓴다. 공용 Wi-Fi에서는 `--host false` 로 되돌리거나 방화벽으로 막는다.
     *
     * ⚠️ LAN 주소는 **secure context가 아니다.** 그래서 두 가지가 달라진다.
     * 1. `crypto.randomUUID` · `navigator.clipboard` 가 없다 → `core/util/id.ts` 가 폴백한다
     * 2. localStorage 오리진이 `localhost:3100` 과 **별개**다 → 프로토타입 저장 데이터가
     *    주소마다 따로 쌓인다 (PLAN 18.5)
     */
    host: true,
  },
  build: {
    outDir: r('dist-demo'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        landing: r('demo/index.html'),
        spike: r('demo/spike/index.html'),
        editor: r('demo/editor/index.html'),
        react: r('demo/react/index.html'),
        vue: r('demo/vue/index.html'),
        viewer: r('demo/viewer/index.html'),
        checks: r('demo/checks/index.html'),
      },
    },
  },
})
