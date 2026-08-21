/**
 * tarball 설치 검증 — `npm pack --dry-run` 이 잡지 못하는 것을 잡는다.
 *
 * `--dry-run` 은 **파일 목록만** 보여주고 설치를 실행하지 않는다. 그래서 설치 시점의 실패가
 * 통과한다 — `postinstall` 이 tarball 에 없는 파일을 실행해 소비자 설치가 전부 죽는 사고가
 * 실제로 그렇게 새어 나갔다.
 *
 * 여기서 확인하는 것은 **정적으로 확인 가능한 것**뿐이다. 실제 React·Vue 앱 빌드는
 * 프레임워크 설치가 필요해 이 스크립트 범위 밖이다.
 *
 * ⚠️ **`prepublishOnly` 에서 부르지 않는다.** 그 훅은 `npm publish` 가 부르고, 이 스크립트는
 * `npm pack` 을 부른다 — `publish → prepublishOnly → pack → prepare` 로 npm 이 재귀 실행되며
 * 출력이 섞여 tarball 이름을 못 찾는다. 배포 스크립트(`publish.sh`)가 publish **전에** 부른다.
 *
 * 사용법: node scripts/verify-tarball.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const check = (name, ok, detail) => {
  if (ok) console.log(`  ok   ${name}`)
  else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
    failures.push(name)
  }
}

const work = mkdtempSync(join(tmpdir(), 'pck-tarball-'))
try {
  console.log('packing…')
  /*
   * `npm pack` 의 stdout 마지막 줄을 파일명으로 쓰지 않는다.
   *
   * `prepare` 훅이 먼저 돌면서 자기 로그를 stdout 에 쓴다 — 그 줄이 마지막이 되면 파일명이
   * 아니라 로그를 경로로 쓰게 된다. 2026.08.21 에 실제로 그 실패를 냈다.
   *
   * 출력에서 `.tgz` 로 끝나는 줄을 찾는다. 없으면 디렉토리를 읽는다 — 어느 쪽이든 파일명을
   * 추측하지 않는다 (scoped 이름은 `@scope/x` → `scope-x-1.0.0.tgz` 로 바뀐다).
   */
  const packOut = execFileSync('npm', ['pack', '--pack-destination', work], {
    cwd: root,
    encoding: 'utf8',
  })
  const named = packOut
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.endsWith('.tgz'))
    .pop()
  const tgz = join(work, named ?? readdirSync(work).find((f) => f.endsWith('.tgz')) ?? '')
  if (!tgz.endsWith('.tgz')) throw new Error('verify-tarball: tarball 을 찾지 못했다')

  execFileSync('tar', ['xzf', tgz, '-C', work])
  const pkgDir = join(work, 'package')
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
  const files = execFileSync('tar', ['tzf', tgz], { encoding: 'utf8' }).split('\n')

  console.log('\n[라이프사이클 훅]')
  /*
   * 소비자 설치 시 실행되는 훅은 tarball 안의 파일만 참조할 수 있다.
   * `files` 가 dist 만 담으므로 레포 스크립트를 부르는 훅은 반드시 죽는다.
   */
  for (const hook of ['preinstall', 'install', 'postinstall']) {
    const cmd = pkg.scripts?.[hook]
    check(
      `${hook} 없음 (또는 레포 파일을 참조하지 않음)`,
      !cmd || !cmd.includes('scripts/'),
      cmd && `"${cmd}" — scripts/ 는 tarball 에 없다. prepare 로 옮긴다`,
    )
  }

  console.log('\n[exports 맵의 대상이 실제로 있는가]')
  const targets = []
  const walk = (v) => {
    if (typeof v === 'string') targets.push(v)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(pkg.exports)
  for (const t of [...new Set(targets)]) {
    if (!t.startsWith('./')) continue
    check(t, existsSync(join(pkgDir, t)))
  }

  console.log('\n[불필요한 것이 섞이지 않았는가]')
  // 소스·데모·설정이 tarball 에 들어가면 소비자 node_modules 가 부풀고 오해를 부른다.
  for (const junk of [
    'package/src/',
    'package/demo/',
    'package/scripts/',
    'package/node_modules/',
  ]) {
    const hit = files.filter((f) => f.startsWith(junk))
    check(`${junk} 없음`, hit.length === 0, hit.length ? `${hit.length}개 발견` : undefined)
  }

  /*
   * 스타일 커스터마이징 계약 (커스터마이징은 토큰 → @layer → 다이얼로그 위임 3단계다).
   *
   * `editor.css` 전체가 `@layer` 안에 있어야 소비자 규칙이 특이도 싸움 없이 이긴다. 토큰은
   * 레이어 **밖**이어야 한다 — 안에 있으면 토큰 오버라이드도 한 단계 낮아진다.
   *
   * 번들러가 레이어를 삼키거나 평탄화하면 이 계약이 조용히 깨진다. 그때 증상은 "호스트
   * CSS 가 안 먹는다" 이고, 원인을 찾기 어렵다.
   */
  console.log('\n[스타일 레이어]')
  const css = readFileSync(join(pkgDir, 'dist/styles.css'), 'utf8')
  const layerAt = css.indexOf('@layer')
  const layerName = css.match(/@layer\s+([a-z-]+)\s*\{/)?.[1]
  check('@layer 선언이 있다', layerAt >= 0)
  /*
   * 레이어 이름은 **패키지명이 아니다.** 소비자가 `@layer pdf-canvas-kit, my-app;` 으로
   * 순서를 지정하는 데 쓰는 식별자라, 패키지명을 바꿔도 그대로 둔다 — 바꾸면 소비자의
   * 레이어 선언이 조용히 무효가 된다.
   */
  check('레이어 이름이 pdf-canvas-kit', layerName === 'pdf-canvas-kit', layerName)
  const tokenAt = css.indexOf('--pck-bg')
  check('토큰이 레이어 밖(앞)에 있다', tokenAt >= 0 && tokenAt < layerAt)
  const outside = css
    .slice(0, layerAt < 0 ? css.length : layerAt)
    .split('}')
    .filter((r) => r.includes('.pck-') && !r.includes('--pck-'))
  check('레이어 밖에 규칙이 없다', outside.length === 0, `${outside.length}개`)

  console.log('\n[의존성]')
  check(
    'dependencies 는 pdfjs-dist 하나',
    Object.keys(pkg.dependencies ?? {}).join() === 'pdfjs-dist',
  )
  for (const peer of Object.keys(pkg.peerDependencies ?? {})) {
    check(`${peer} 는 optional peer`, pkg.peerDependenciesMeta?.[peer]?.optional === true)
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log(failures.length ? `\n${failures.length}건 실패` : '\n전부 통과')
process.exit(failures.length ? 1 : 0)
