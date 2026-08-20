/**
 * CSS 전용 엔트리 — `dist/styles.css` 를 만들기 위해서만 존재한다.
 *
 * 이전에는 Vue 엔트리(`src/vue/index.ts`)가 CSS 를 import 했다. 그 층이 사라지면서
 * `dist/styles.css` 가 emit 되지 않았는데, `package.json` 의 `exports` 는 여전히
 * `./styles.css` 를 가리키고 있었다 — 소비자가 `import 'pdf-canvas-kit/styles.css'` 를
 * 쓰면 해석에 실패한다.
 *
 * ## 왜 JS 가 CSS 를 import 하지 않는가
 *
 * `src/index.ts` 는 코어 API 다. 거기서 CSS 를 import 하면 편집기를 쓰지 않고 채점 함수만
 * 가져다 쓰는 소비자에게도 19KB 스타일이 딸려 간다. 스타일은 명시적으로 가져가게 둔다.
 *
 * 프레임워크 래퍼(`/react` · `/vue`)도 CSS 를 import 하지 않는다 — 번들러 설정이나 SSR 환경에
 * 따라 CSS import 가 실패하는 경우가 있어, 호스트가 자기 방식으로 넣는 편이 안전하다.
 */
import './styles/tokens.css'
import './styles/editor.css'
