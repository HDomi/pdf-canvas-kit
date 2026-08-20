import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/** 라이브러리 빌드. 데모 dev 서버는 vite.demo.config.ts 를 쓴다. */
export default defineConfig({
  plugins: [vue()],
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
        'vue/index': resolve(import.meta.dirname, 'src/vue/index.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      /**
       * peerDependencies/dependencies 에 선언된 것은 모두 external로 둔다.
       * `vue` 는 호스트 인스턴스를 공유해야 하기 때문이고(사본을 함께 번들하면 provide/inject와
       * reactivity가 깨진다), `pdfjs-dist` 는 인라인하면 약 3.5MB가 늘고 호스트의 사본과
       * 이중으로 배포되기 때문이다.
       */
      external: (id) => id === 'vue' || id === 'pdfjs-dist' || id.startsWith('pdfjs-dist/'),
      output: { assetFileNames: 'styles.css' },
    },
  },
})
