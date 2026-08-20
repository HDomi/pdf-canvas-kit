import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/**
 * 라이브러리 빌드. 데모 dev 서버는 vite.demo.config.ts 를 쓴다.
 *
 * **Vue 플러그인이 없다.** SFC 를 쓰지 않으므로(PLAN D19) `@vitejs/plugin-vue` 도 `vue-tsc` 도
 * 필요하지 않다 — `.d.ts` 생성이 평범한 `tsc` 가 된다. R9 에서 devDependency 에서도 뺀다.
 */
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    /**
     * 라이브러리 소스는 worker를 참조하지 않으므로(resources.ts 참고) 인라인될 큰 자산이 없다.
     * 0으로 두는 것은 가드다. 나중에 자산 URL이 추가되면 base64로 번들에 박히는 대신
     * 파일로 emit돼야 한다.
     */
    assetsInlineLimit: 0,
    lib: {
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        /*
         * CSS 전용 엔트리. `assetFileNames: 'styles.css'` 가 여기서 나온 스타일을
         * `dist/styles.css` 로 모은다. 이 JS 산출물 자체는 쓰이지 않는다.
         */
        styles: resolve(import.meta.dirname, 'src/styles.ts'),
        // `react/index` · `vue/index` 는 R8 에서 추가한다.
      },
      formats: ['es'],
    },
    rollupOptions: {
      /**
       * peerDependencies/dependencies 에 선언된 것은 모두 external 로 둔다.
       *
       * `pdfjs-dist` 는 인라인하면 약 3.5MB 가 늘고 호스트의 사본과 이중으로 배포된다.
       * `vue`·`react` 는 호스트 인스턴스를 공유해야 한다 — 사본을 함께 번들하면 Vue 는
       * provide/inject 와 reactivity 가 깨지고 React 는 훅이 "Invalid hook call" 로 죽는다.
       */
      external: (id) =>
        id === 'vue' ||
        id === 'react' ||
        id === 'react-dom' ||
        id === 'react/jsx-runtime' ||
        id === 'pdfjs-dist' ||
        id.startsWith('pdfjs-dist/'),
      output: { assetFileNames: 'styles.css' },
    },
  },
})
