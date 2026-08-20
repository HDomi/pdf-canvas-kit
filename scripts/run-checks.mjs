/**
 * `/checks/` 케이스를 브라우저 없이 실행한다 (PLAN 17.2 · D17).
 *
 * 테스트 러너를 도입하지 않았으므로(D17) 이것이 커밋 전에 돌릴 수 있는 유일한 자동 검증이다.
 * 프레임워크 무관 재구조화(PLAN 20장) 동안 각 R 단계마다 이걸 통과시킨다.
 *
 * 브라우저 화면(`/checks/`)과 **같은 데이터**를 소비한다 — 케이스가 `cases.ts` ·
 * `reactiveCases.ts` 에 데이터로 분리돼 있어서 가능한 일이다.
 *
 * ⚠️ 덮이지 않는 것: 줌·팬·스크롤·IME 는 실제 브라우저 레이아웃에 의존하므로 여기서 돌지 않는다.
 * 그건 여전히 손으로 확인해야 한다 (PLAN 17.4).
 */
/*
 * 번들러로 vite 를 쓴다. esbuild 를 직접 부르는 편이 짧지만 esbuild 는 이 저장소의 의존성이
 * 아니다 — vite 8 은 esbuild 를 끌고 오지 않으므로 `npx esbuild` 는 매번 원격에서 받아온다.
 * 검증 스크립트가 네트워크에 의존하면 안 된다.
 */
import { build } from 'vite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
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

const outDir = mkdtempSync(join(tmpdir(), 'pck-checks-'))

try {
  const result = await build({
    configFile: false,
    logLevel: 'error',
    resolve: {
      // vite.demo.config.ts 와 같은 별칭. 데모는 빌드된 dist 가 아니라 소스를 직접 본다.
      alias: [{ find: 'pdf-canvas-kit', replacement: join(root, 'src/index.ts') }],
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

  const { ALL_GROUPS } = await import(pathToFileURL(join(outDir, chunk.fileName)).href)

  let total = 0
  let failed = 0
  const failures = []

  for (const group of ALL_GROUPS) {
    for (const c of group.cases) {
      total++
      const expected = stable(c.expected)
      let actual
      try {
        actual = stable(c.actual())
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
