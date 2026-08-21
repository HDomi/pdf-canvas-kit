/**
 * `/checks/` 케이스를 브라우저 없이 실행한다 (테스트 러너가 없다 — 검증 화면으로 대체한다).
 *
 * 테스트 러너를 도입하지 않았으므로(D17) 이것이 커밋 전에 돌릴 수 있는 유일한 자동 검증이다.
 * 프레임워크 무관 재구조화 동안 각 R 단계마다 이걸 통과시킨다.
 *
 * 브라우저 화면(`/checks/`)과 **같은 데이터**를 소비한다 — 케이스가 `cases.ts` ·
 * `reactiveCases.ts` 에 데이터로 분리돼 있어서 가능한 일이다.
 *
 * DOM 케이스(`domCases.ts`)를 위해 happy-dom 으로 전역 `document` 를 세운다. 브라우저에서는
 * 실제 DOM 을 쓰므로 같은 케이스가 두 환경에서 돈다.
 *
 * ⚠️ 덮이지 않는 것: 줌·팬·스크롤·IME 는 **실제 레이아웃**에 의존한다. happy-dom 은
 * `getBoundingClientRect()` 가 전부 0 이므로 좌표 변환·맞춤 배율은 여기서 검증되지 않는다.
 * 그건 여전히 브라우저에서 손으로 확인해야 한다.
 */
/*
 * 번들러로 vite 를 쓴다. esbuild 를 직접 부르는 편이 짧지만 esbuild 는 이 저장소의 의존성이
 * 아니다 — vite 8 은 esbuild 를 끌고 오지 않으므로 `npx esbuild` 는 매번 원격에서 받아온다.
 * 검증 스크립트가 네트워크에 의존하면 안 된다.
 */
import { build } from 'vite'
import { Window } from 'happy-dom'
import { mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')

/** 화면(`main.ts`)과 같은 정규화 규칙. 객체 키 순서가 결과를 바꾸지 않게 한다. */
function stable(value) {
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, val]) => [k, walk(val)]),
      )
    }
    return v
  }
  return JSON.stringify(walk(value))
}

/*
 * DOM 을 전역에 세운다. 번들을 import 하기 **전에** 해야 한다 — 모듈 최상위에서 `document` 를
 * 만지는 코드가 있으면 그때 이미 필요하다.
 */
const window = new Window({ url: 'http://localhost/' })

/*
 * happy-dom 이 제공하는 것을 전부 전역에 올린다. 이름을 하나씩 나열하면 케이스가 새 API 를
 * 쓸 때마다 여기를 고쳐야 하고, 빠뜨렸을 때 증상이 "왜 이 케이스만 죽지" 가 된다.
 */
for (const name of Object.getOwnPropertyNames(window)) {
  if (name in globalThis) continue
  try {
    globalThis[name] = window[name]
  } catch {
    // getter 가 던지는 항목이 있다. 그건 건너뛴다.
  }
}
globalThis.window ??= window
globalThis.document ??= window.document

/*
 * Node 22 는 `Event` · `EventTarget` · `CustomEvent` 를 **자체적으로** 정의한다. 위 루프는
 * `name in globalThis` 로 건너뛰므로 그 Node 판이 남고, happy-dom 의 `EventTarget` 이
 * "parameter 1 is not of type 'Event'" 로 거부한다. 이건 반드시 덮어써야 한다.
 */
for (const name of ['Event', 'EventTarget', 'CustomEvent', 'MessageEvent']) {
  if (window[name]) globalThis[name] = window[name]
}

/*
 * `pdfjs-dist` 는 모듈 최상위에서 `new DOMMatrix()` 를 만든다. happy-dom 에는 없다.
 *
 * 여기서 PDF 기능을 검증하지는 않는다 — 컨트롤러가 엔진을 import 하고 엔진이 PDF 파이프라인을
 * import 하므로 **모듈이 로드되기만** 하면 된다. 그래서 최소 스텁으로 끝낸다.
 *
 * ⚠️ 이 스텁으로 렌더·변환을 검증할 수는 없다. PDF 경로는 `/spike/` 에서 실제 브라우저로
 * 확인한다.
 */
if (!('DOMMatrix' in globalThis)) {
  globalThis.DOMMatrix = class DOMMatrixStub {
    constructor() {
      Object.assign(this, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
    }
    scale() {
      return this
    }
    translate() {
      return this
    }
    transformPoint(p) {
      return p
    }
  }
}

/*
 * 번들을 **프로젝트 안에** 쓴다.
 *
 * `os.tmpdir()` 에 쓰면 externalize 된 의존성(`pdfjs-dist`)을 Node 가 해석하지 못한다 —
 * 모듈 해석이 상위 디렉토리의 `node_modules` 를 찾아 올라가는데, /tmp 위에는 없다.
 * `node_modules/` 안이면 그 탐색이 그대로 성립하고, 이미 gitignore 대상이다.
 */
const outDir = join(root, 'node_modules/.pck-checks')
mkdirSync(outDir, { recursive: true })

try {
  const result = await build({
    configFile: false,
    logLevel: 'error',
    resolve: {
      // vite.demo.config.ts 와 같은 별칭. 데모는 빌드된 dist 가 아니라 소스를 직접 본다.
      alias: [
        { find: '@h_domi/pdf-canvas-kit/react', replacement: join(root, 'src/react/index.tsx') },
        { find: '@h_domi/pdf-canvas-kit/vue', replacement: join(root, 'src/vue/index.ts') },
        { find: '@h_domi/pdf-canvas-kit', replacement: join(root, 'src/index.ts') },
      ],
    },
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      target: 'node20',
      // Node 에서 그대로 import 할 수 있는 단일 ESM 파일. 브라우저 폴리필을 넣지 않는다.
      ssr: true,
      lib: {
        entry: join(root, 'demo/checks/allCases.ts'),
        formats: ['es'],
        fileName: 'cases',
      },
    },
  })

  /*
   * 파일명을 추측하지 않고 rollup 이 실제로 낸 이름을 읽는다. vite 는 lib 모드에서 format 에 따라
   * 확장자를 붙이는데(`.js` / `.mjs`) 그 규칙이 버전마다 달라진 이력이 있다.
   */
  const outputs = Array.isArray(result) ? result : [result]
  const chunk = outputs.flatMap((o) => o.output ?? []).find((c) => c.type === 'chunk' && c.isEntry)
  if (!chunk) throw new Error('run-checks: bundler produced no entry chunk')

  const mod = await import(pathToFileURL(join(outDir, chunk.fileName)).href)
  const { ALL_GROUPS } = mod
  if (process.env.PCK_BREAKDOWN) {
    const src = {
      GROUPS: 'pure',
      REACTIVE_GROUPS: 'reactive',
      DOM_GROUPS: 'dom',
      CONTROLLER_GROUPS: 'controller',
      OBJECT_RENDER_GROUPS: 'render',
      SHELL_GROUPS: 'shell',
      VIEWER_GROUPS: 'viewer',
      WRAPPER_GROUPS: 'wrapper',
    }
    for (const [k, label] of Object.entries(src)) {
      const g = mod[k]
      if (!g) {
        console.log(label, 'NOT EXPORTED')
        continue
      }
      console.log(
        label.padEnd(11),
        'groups=' + g.length,
        'cases=' + g.reduce((n, x) => n + x.cases.length, 0),
      )
    }
  }

  let total = 0
  let failed = 0
  const failures = []

  for (const group of ALL_GROUPS) {
    for (const c of group.cases) {
      total++
      const expected = stable(c.expected)
      let actual
      try {
        actual = stable(await c.actual())
      } catch (err) {
        // 던진 예외도 결과로 취급한다. 케이스가 예외를 기대하는 경우가 있다.
        actual = `throw: ${String(err)}`
      }
      if (actual !== expected) {
        failed++
        failures.push({ group: group.title, name: c.name, expected, actual })
      }
    }
  }

  for (const f of failures) {
    console.error(`FAIL  [${f.group}] ${f.name}`)
    console.error(`      expected  ${f.expected}`)
    console.error(`      actual    ${f.actual}`)
  }

  const verdict = failed === 0 ? 'ok' : 'FAILED'
  console.log(`${total - failed} / ${total} passed · ${ALL_GROUPS.length} groups · ${verdict}`)
  process.exitCode = failed === 0 ? 0 : 1
} finally {
  rmSync(outDir, { recursive: true, force: true })
}
