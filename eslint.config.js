import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-demo/**',
      'node_modules/**',
      'demo/fixtures/**',
      // 복사된 pdf.js 런타임 자산(npm run copy:pdfjs). 우리 소스가 아니다.
      'demo/public/**',
      'examples/*/public/**',
      'examples/*/dist/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...pluginVue.configs['flat/recommended'],

  {
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        // 설정 파일과 스크립트는 tsconfig의 `include` 밖에 있으므로,
        // project service에 명시적으로 나열해야 한다.
        projectService: {
          allowDefaultProject: ['*.ts', '*.js', 'scripts/*.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.vue'],
      },
    },
  },

  // Vue SFC 안의 <script lang="ts"> 를 TS 파서로 처리한다
  {
    files: ['**/*.vue'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      // withDefaults + exactOptionalPropertyTypes 조합에서는 명시적 `undefined` 기본값을
      // 대입할 수 없고, 엔진이 이미 자체 기본값을 적용한다.
      'vue/require-default-prop': 'off',
    },
  },

  {
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          // `const { secret: _secret, ...rest } = obj` is how fields are omitted
          // in a type-checked way (see model/publicDoc.ts).
          ignoreRestSiblings: true,
        },
      ],
      'vue/multi-word-component-names': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // 코어 경계. 프레임워크 의존을 금지한다 (PLAN 2.1)
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['vue', 'vue/*', '@vueuse/*', '**/*.vue'],
              message: 'core must stay framework-agnostic (PLAN 2.1)',
            },
            {
              group: ['../vue/**', '**/src/vue/**'],
              message: 'core must not depend on the Vue layer (PLAN 2.1)',
            },
          ],
        },
      ],
    },
  },

  /*
   * 렌더 층·컨트롤러 경계 (PLAN D19).
   *
   * `src/dom/**` 과 `src/controller/**` 는 프레임워크 무관 층이다. Vue 나 React 를 import 하면
   * 그 순간 "프레임워크 런타임 0KB" 라는 D19 의 전제가 깨지고, 그 사실이 번들 크기로만
   * 드러난다 — 린트로 막는 편이 빠르다.
   *
   * 반대 방향(`src/react/**` · `src/vue/**` → `src/dom/**`)은 정상이다. 래퍼가 얇은 이유가 그것이다.
   */
  {
    files: ['src/dom/**/*.ts', 'src/controller/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['vue', 'vue/*', '@vueuse/*', 'react', 'react/*', 'react-dom', 'react-dom/*'],
              message: 'the render layer must stay framework-agnostic (PLAN D19)',
            },
            {
              group: ['**/*.vue', '../vue/**', '../react/**', '**/src/vue/**', '**/src/react/**'],
              message: 'the render layer must not depend on a framework wrapper (PLAN D19)',
            },
          ],
        },
      ],
    },
  },

  // 객체 렌더 컴포넌트는 좌표 변환을 호출하지 않는다 (PLAN 5.4)
  {
    files: ['src/vue/editor/objects/**', 'src/dom/editor/objects/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/geometry/units'],
              message:
                'object views must not convert coordinates; render pt as px directly (PLAN 5.4)',
            },
          ],
        },
      ],
    },
  },

  /*
   * typescript-eslint 는 순수 TypeScript 프로그램을 만들기 때문에 `.vue` import에 타입을 줄 수
   * 없다. 모든 SFC가 `any` 로 해석되어 정상 코드에서도 no-unsafe-* 규칙이 발동한다.
   * SFC를 이해하는 `vue-tsc`(npm run typecheck)가 실제 게이트이므로, SFC를 import하는 곳에서만
   * 이 규칙들을 완화한다.
   */
  {
    files: ['src/vue/**/*.ts', 'demo/**/*.ts', 'examples/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
    },
  },

  /*
   * 데모는 예제이므로 한 파일에 여러 컴포넌트를 둔다 — 소비자가 한 화면에서 전체 사용법을
   * 읽는 편이 파일을 오가는 것보다 낫다.
   */
  {
    files: ['demo/**'],
    rules: { 'vue/one-component-per-file': 'off' },
  },

  // 데모·스크립트는 console 사용을 허용한다
  {
    files: ['demo/**', 'scripts/**', '*.config.ts', 'eslint.config.js'],
    rules: { 'no-console': 'off' },
  },
  // Node 스크립트와 설정 파일. 타입 인식 린트를 끄고 Node 전역을 준다.
  {
    files: ['scripts/**/*.mjs', 'eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: false, program: null },
    },
  },

  prettier,
)
