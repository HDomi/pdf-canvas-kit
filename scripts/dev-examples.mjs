/**
 * 데모 + 예제 앱 두 개를 함께 띄운다 (PLAN 20.22).
 *
 *   :3100  demo/          레포 소스를 **별칭으로** 본다 — 고치면 즉시 반영
 *   :3101  examples/react node_modules 의 dist 를 **exports 맵으로** 해석
 *   :3102  examples/vue   같음
 *
 * ## 왜 concurrently 를 쓰지 않는가
 *
 * 의존성 하나를 아끼려는 것이 아니다. 이 패키지는 남의 제품에 임베드되고 라이선스 정책이
 * 좁다(README). devDependency 도 같은 심사를 거쳐야 하는데, `child_process.spawn` 열 줄이면
 * 되는 일에 그 비용을 낼 이유가 없다. `&` 를 쓰는 셸 스크립트는 Windows 에서 깨진다.
 *
 * ## pdf.js 자산을 먼저 복사한다
 *
 * 예제 앱은 `/pdfjs/*` 를 URL 로 가져온다. 빠뜨리면 worker 가 404 이고, `cMapUrl` 이 없으면
 * **한국어 PDF 에서 글자가 조용히 사라진다** (2026.08.21 에 실제로 그랬다 — PLAN 20.19).
 * 실제 소비자 앱은 README 의 `postinstall` 로 같은 일을 한다.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** 예제 앱이 workspace 심링크로 dist 를 보므로 빌드가 선행돼야 한다. */
function ensureBuilt() {
  if (existsSync(join(root, 'dist/index.js'))) return
  console.log('[dev] dist 가 없다. 먼저 빌드한다 — 예제 앱은 소스가 아니라 dist 를 본다.')
  const r = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

function copyAssets(target) {
  const r = spawnSync('node', [join(root, 'scripts/copy-pdfjs-assets.mjs'), target], {
    cwd: root,
    stdio: 'inherit',
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

ensureBuilt()
for (const t of ['demo/public/pdfjs', 'examples/react/public/pdfjs', 'examples/vue/public/pdfjs']) {
  copyAssets(t)
}

const targets = [
  {
    name: 'demo ',
    color: '\x1b[36m',
    cwd: root,
    args: ['vite', '--config', 'vite.demo.config.ts', '--strictPort'],
  },
  {
    name: 'react',
    color: '\x1b[35m',
    cwd: join(root, 'examples/react'),
    args: ['vite', '--port', '3101', '--strictPort'],
  },
  {
    name: 'vue  ',
    color: '\x1b[32m',
    cwd: join(root, 'examples/vue'),
    args: ['vite', '--port', '3102', '--strictPort'],
  },
]

const children = []
let shuttingDown = false

/** 한 줄씩 접두사를 붙여 어느 서버의 출력인지 알 수 있게 한다. */
function pipe(stream, name, color) {
  let buf = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buf += chunk
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (line.trim()) console.log(`${color}[${name}]\x1b[0m ${line}`)
    }
  })
}

for (const t of targets) {
  const child = spawn('npx', t.args, { cwd: t.cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  pipe(child.stdout, t.name, t.color)
  pipe(child.stderr, t.name, t.color)
  child.on('exit', (code) => {
    // 하나가 죽으면 전부 내린다. 반쯤 뜬 상태로 두면 어느 포트가 살았는지 헷갈린다.
    if (shuttingDown) return
    console.error(`\x1b[31m[dev] ${t.name.trim()} 가 종료됐다 (code ${code}). 전부 내린다.\x1b[0m`)
    shutdown(code ?? 1)
  })
  children.push(child)
}

function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  for (const c of children) c.kill('SIGTERM')
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

console.log('')
console.log('  \x1b[36mdemo \x1b[0m http://localhost:3100/   레포 소스 (별칭)')
console.log('  \x1b[35mreact\x1b[0m http://localhost:3101/   설치된 dist (exports 맵)')
console.log('  \x1b[32mvue  \x1b[0m http://localhost:3102/   설치된 dist (exports 맵)')
console.log('')
