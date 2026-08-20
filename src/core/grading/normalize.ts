/**
 * 채점용 문자열 정규화 (기획 3.3).
 *
 * 단답형은 "공백 제거·대소문자 무시 후 완전 일치" 로 채점한다. 서버도 같은 규칙을 쓰므로,
 * 이 함수가 그 규칙의 공유 정의다. 한쪽만 바뀌면 학생이 화면에서 본 결과와 리포트가 달라진다.
 */

/**
 * 비교용으로 답안을 정규화한다.
 *
 * 처리 순서:
 * 1. 유니코드 정규화(NFKC) — 전각 영숫자와 반각을 같게 만든다. 한국어 입력기에서 전각이 섞이는
 *    일이 흔하고, 학생이 눈으로 구분할 수 없는 차이로 오답 처리되면 안 된다.
 * 2. 모든 공백 문자 제거 — 기획이 "공백(띄어쓰기)을 제거" 라고 명시한다.
 *    줄바꿈·탭·전각 공백도 포함한다.
 * 3. 소문자화 — 기획의 "대소문자를 구분하지 않는다".
 */
export function normalizeAnswer(raw: string): string {
  return raw.normalize('NFKC').replace(/\s+/gu, '').toLowerCase()
}

/** 학생 답안이 허용 정답 중 하나와 일치하는지 (기획 3.3). */
export function matchesAnyAnswer(input: string, accepted: readonly string[]): boolean {
  const normalized = normalizeAnswer(input)
  // 빈 답안은 오답이다. 허용 정답에 빈 문자열이 섞여 있어도 정답으로 처리하지 않는다.
  if (normalized.length === 0) return false
  return accepted.some((a) => normalizeAnswer(a) === normalized)
}

/**
 * 드롭박스 정답 판정 (기획 3.3).
 *
 * 복수 정답이면 지정 정답을 **모두, 그리고 그것만** 골라야 정답이다(all-or-nothing).
 * 부분 점수는 없다.
 */
export function matchesChoiceSet(selected: readonly string[], correct: readonly string[]): boolean {
  if (correct.length === 0) return false
  const a = new Set(selected)
  const b = new Set(correct)
  if (a.size !== b.size) return false
  for (const id of b) if (!a.has(id)) return false
  return true
}
