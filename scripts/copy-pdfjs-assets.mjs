/**
 * pdf.js 런타임 자산을 서빙 폴더로 복사한다.
 *
 * pdf.js는 CMap·표준 폰트·wasm 디코더·ICC 프로파일을 런타임에 URL로 가져온다. 번들러는
 * *디렉토리* URL을 재작성하지 못하므로 앱이 파일을 서빙해야 한다. `cmaps/` 가 없으면 렌더된
 * 페이지에서 CJK 텍스트가 조용히 사라진다 — src/core/pdf/resources.ts 참고.
 *
 * 사용법: node scripts/copy-pdfjs-assets.mjs [대상디렉토리]
 * 기본 대상: demo/public/pdfjs
 */
import { cp, mkdir, rm, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const src = resolve(root, 'node_modules/pdfjs-dist')
const target = resolve(root, process.argv[2] ?? 'demo/public/pdfjs')

/** `iccs` 는 선택 사항이지만(색 정확도만 영향) 아주 작아서 함께 복사한다. */
const DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs']

/**
 * worker 파일. 디렉토리들과 나란히 평평하게 복사한다. 라이브러리는 의도적으로 이 경로를
 * 해석하지 않는다(라이브러리 빌드가 3MB를 base64로 인라인해 버린다). 그래서 앱이 가리켜야 하며,
 * 이 복사본이나 번들러의 `?url` import 중 하나를 쓴다.
 */
const FILES = [['build/pdf.worker.mjs', 'pdf.worker.mjs']]

if (!(await stat(src).catch(() => null))) {
  console.error(`pdfjs-dist not found at ${src} — run npm install first`)
  process.exit(1)
}

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })

for (const dir of DIRS) {
  const from = resolve(src, dir)
  if (!(await stat(from).catch(() => null))) {
    console.warn(`skip ${dir} (not present in this pdfjs-dist version)`)
    continue
  }
  await cp(from, resolve(target, dir), { recursive: true })
  console.log(`copied ${dir}/`)
}

for (const [from, to] of FILES) {
  const srcFile = resolve(src, from)
  if (!(await stat(srcFile).catch(() => null))) {
    console.warn(`skip ${from} (not present in this pdfjs-dist version)`)
    continue
  }
  await cp(srcFile, resolve(target, to))
  console.log(`copied ${to}`)
}

console.log(`\npdf.js assets -> ${target}`)
