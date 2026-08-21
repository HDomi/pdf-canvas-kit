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
  /*
   * 레이어 밖에는 **토큰 선언만** 있어야 한다.
   *
   * 허용하는 것 셋:
   *   `--pck-*`           우리 토큰
   *   `--lightningcss-*`  minifier 가 `light-dark()` 를 폴리필하며 만드는 헬퍼
   *   `color-scheme`      `light-dark()` 가 이 값을 보고 팔레트를 고른다. 토큰과 함께 있어야
   *                       하고, 소비자는 이 속성을 덮어써서 모드를 강제한다
   *
   * 그 밖의 속성이 있으면 실패다 — 레이어 밖이라 소비자가 단일 클래스로 이길 수 없고,
   * §19.1 의 계약이 그 속성에만 조용히 적용되지 않는다. `font-family` 와 `color` 가 실제로
   * 그렇게 섞여 있었다.
   *
   * `}` 로 자르므로 `@media` 블록은 조각이 된다. 선택자가 남아 있는 조각(`{` 를 다시 포함)은
   * 선언을 온전히 읽을 수 없으니 건너뛴다 — 그 안의 규칙은 다음 조각에서 검사된다.
   */
  const ALLOWED_PLAIN = new Set(['color-scheme'])
  const outside = css
    .slice(0, layerAt < 0 ? css.length : layerAt)
    .split('}')
    .filter((block) => {
      if (!block.includes('.pck-')) return false
      const open = block.indexOf('{')
      if (open < 0) return false
      const body = block.slice(open + 1)
      // 중첩 블록의 조각. 선언을 온전히 읽을 수 없으므로 다음 조각에 맡긴다
      if (body.includes('{')) return false
      const decls = body
        .split(';')
        .map((d) => d.trim())
        .filter(Boolean)
      return decls.some((d) => !d.startsWith('--') && !ALLOWED_PLAIN.has(d.split(':')[0].trim()))
    })
  check('레이어 밖에 규칙이 없다 (토큰 선언만 허용)', outside.length === 0, `${outside.length}개`)

  /*
   * 폼 컨트롤은 **색을 명시해야 한다.**
   *
   * UA 스타일시트가 `<button>` 에 `color: ButtonText` 를, 입력에 `color: FieldText` 를 준다.
   * 부모의 `color` 를 상속하는 것이 아니라 **시스템 색**을 쓴다는 뜻이다. `color-scheme:
   * light dark` (§20.3) 를 켜면 OS 다크 모드에서 그 값이 흰색 계열이 되고, 팔레트를 밝은 값으로
   * 하드코딩한 호스트 테마에서 흰 버튼에 흰 글자가 된다 — 2026.08.21 에 예제 앱에서 툴바
   * 글자가 통째로 사라진 원인이다.
   *
   * 선택자별 규칙을 파싱하지 않고 "그 클래스를 포함한 어떤 블록이 `color` 를 선언한다" 만
   * 본다. 정확한 캐스케이드 판정은 브라우저의 일이고, 여기서 잡고 싶은 것은 **선언을 아예
   * 빠뜨린 경우**다.
   */
  const CONTROL_CLASSES = [
    'pck-tool',
    'pck-icon-btn',
    'pck-primary-btn',
    'pck-ghost-btn',
    'pck-dashed-btn',
    'pck-zoom-btn',
    'pck-input',
  ]
  const blocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  for (const cls of CONTROL_CLASSES) {
    const colored = blocks.some(
      (m) =>
        /*
         * 뒤에 `.` · `:` 가 붙은 것은 세지 않는다. `.pck-tool.is-active` 나
         * `.pck-tool:hover` 가 `color` 를 주는 것으로는 기본 상태가 덮이지 않는다 —
         * 그걸 통과로 세면 검사가 아무것도 잡지 못한다.
         */
        new RegExp(`\\.${cls}(?![\\w\\-.:])`).test(m[1]) && /(^|;)\s*color\s*:/.test(m[2]),
    )
    check(`.${cls} 이 color 를 명시한다 (시스템 색 의존 금지)`, colored)
  }

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
