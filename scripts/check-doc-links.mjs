/**
 * 문서의 상대 링크가 실제 파일을 가리키는지 검사한다.
 *
 * 문서가 14개로 갈라지면서 서로를 링크하기 시작했다. 파일 이름을 바꾸거나 절을 옮기면 링크가
 * 조용히 죽는데, 그건 문서를 읽는 사람에게만 보인다 — 검사로 잡는다.
 *
 * 앵커(`#섹션`)는 검사하지 않는다. 한글 헤딩의 슬러그 규칙이 렌더러마다 달라 오탐이 많다.
 *
 * 사용법: node scripts/check-doc-links.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'

const docs = readdirSync('docs')
  .filter((f) => f.endsWith('.md'))
  .map((f) => join('docs', f))
const files = ['README.md', 'ARCHITECTURE.md', 'CLAUDE.md', ...docs]

let bad = 0
for (const f of files) {
  if (!existsSync(f)) continue
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/\[[^\]]*\]\(([^)#\s]+)(#[^)]*)?\)/g)) {
    const target = m[1]
    if (/^(https?:|mailto:|#)/.test(target)) continue
    if (!existsSync(resolve(dirname(f), target))) {
      console.log(`  FAIL ${f} → ${target}`)
      bad++
    }
  }
}

console.log(bad === 0 ? '문서 링크 전부 정상' : `${bad}개 죽은 링크`)
process.exit(bad === 0 ? 0 : 1)
