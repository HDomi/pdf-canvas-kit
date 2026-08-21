/**
 * 순수 함수 검증 화면.
 *
 * 자동 테스트 러너를 도입하지 않았으므로 (테스트 러너가 없다 — 검증 화면으로 대체한다), 케이스 결과를 표로 렌더하고 불일치 행을
 * 빨갛게 칠해 회귀를 눈에 띄게 만든다.
 *
 * 케이스 데이터는 `allCases.ts` 에 분리돼 있다. `npm run checks` 가 같은 배열을 브라우저 없이
 * 소비한다 — 두 곳이 같은 데이터를 보는 것이 요점이다.
 */
import { ALL_GROUPS as GROUPS, type Case } from './allCases'
import '../styles.css'

/**
 * 값을 안정적인 문자열로 만든다.
 *
 * 객체 키 순서에 따라 비교 결과가 달라지지 않도록 정렬한다. 기대값과 실제값을 손으로 같은 순서로
 * 쓰게 만드는 것은 케이스 작성자에게 불필요한 부담이다.
 */
function stable(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, val]) => [k, walk(val)]),
      )
    }
    return v
  }
  return JSON.stringify(walk(value))
}

interface Outcome {
  pass: boolean
  actual: string
  expected: string
}

async function runCase(c: Case): Promise<Outcome> {
  const expected = stable(c.expected)
  try {
    const actual = stable(await c.actual())
    return { pass: actual === expected, actual, expected }
  } catch (err) {
    // 던진 예외도 결과로 취급한다. 케이스가 예외를 기대하는 경우가 있다.
    return { pass: false, actual: `throw: ${String(err)}`, expected }
  }
}

const esc = (s: string) => s.replace(/[<>&]/g, (c) => `&#${c.charCodeAt(0)};`)

let total = 0
let failed = 0
const html: string[] = []

for (const group of GROUPS) {
  const rows: string[] = []
  for (const c of group.cases) {
    const r = await runCase(c)
    total++
    if (!r.pass) failed++
    rows.push(
      `<tr class="${r.pass ? '' : 'fail'}">
        <td class="verdict">${r.pass ? '✓' : '✗'}</td>
        <td class="name">${esc(c.name)}</td>
        <td class="val">${esc(r.expected)}</td>
        <td class="val">${esc(r.actual)}</td>
      </tr>`,
    )
  }

  html.push(`
    <section class="group">
      <h2>${esc(group.title)}</h2>
      ${group.note ? `<p class="note">${esc(group.note)}</p>` : ''}
      <div class="card" style="padding: 0">
        <table>
          <thead>
            <tr><th></th><th>case</th><th>expected</th><th>actual</th></tr>
          </thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>
    </section>`)
}

const summary = document.getElementById('summary')
if (summary) {
  summary.innerHTML =
    `<span class="pill ${failed === 0 ? 'ok' : 'bad'}">${total - failed} / ${total} 통과</span>` +
    (failed > 0 ? `<span class="pill bad">${failed}건 불일치</span>` : '') +
    `<span class="pill">${GROUPS.length} 그룹</span>`
}

const host = document.getElementById('groups')
if (host) host.innerHTML = html.join('')

// 헤드리스에서 결과를 읽을 수 있도록 상태를 노출한다.
document.body.dataset['checksTotal'] = String(total)
document.body.dataset['checksFailed'] = String(failed)
