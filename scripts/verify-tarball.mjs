/**
 * tarball 설치 검증 — `npm pack --dry-run` 이 잡지 못하는 것을 잡는다 (PLAN 20.19).
 *
 * `--dry-run` 은 **파일 목록만** 보여주고 설치를 실행하지 않는다. 그래서 설치 시점의 실패가
 * 통과한다 — `postinstall` 이 tarball 에 없는 파일을 실행해 소비자 설치가 전부 죽는 사고가
 * 실제로 그렇게 새어 나갔다.
 *
 * 여기서 확인하는 것은 **정적으로 확인 가능한 것**뿐이다. 실제 React·Vue 앱 빌드는
 * 프레임워크 설치가 필요해 이 스크립트 범위 밖이다 (PLAN 20.19 의 표 참고).
 *
 * 사용법: node scripts/verify-tarball.mjs
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
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
  const tgz = join(
    work,
    execFileSync('npm', ['pack', '--pack-destination', work], { cwd: root, encoding: 'utf8' })
      .trim()
      .split('\n')
      .pop()
      .trim(),
  )

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
   * 스타일 커스터마이징 계약 (PLAN D31).
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
