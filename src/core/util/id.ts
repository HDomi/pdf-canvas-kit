/**
 * 객체·페이지 식별자 생성.
 *
 * ## `crypto.randomUUID()` 를 직접 쓰지 않는 이유
 *
 * `crypto.randomUUID` 는 **secure context 전용**이다. `https://` 와 `localhost` 에서만 존재하고,
 * `http://192.168.1.5:3100` 같은 LAN 주소에서는 `undefined` 다.
 *
 * dev 서버를 다른 기기(태블릿·다른 PC)에서 열어 보는 순간 페이지 생성·객체 생성이 전부
 * `TypeError` 로 죽는다. 실제로 그 상황을 만들 수 있으므로 폴백을 둔다.
 *
 * `crypto.getRandomValues` 는 secure context 제한이 없어 insecure origin에서도 동작한다.
 * 그것으로 같은 형식(UUID v4)을 직접 만든다 — 형식이 달라지면 서버 검증이나 로그 파싱이 갈린다.
 */

/** 16진수 룩업. 문자열 연결보다 배열 인덱싱이 빠르고, 앞자리 0 패딩 실수를 막는다. */
const HEX: string[] = Array.from({ length: 256 }, (_, i) => (i + 0x100).toString(16).slice(1))

/**
 * `getRandomValues` 로 UUID v4를 만든다.
 *
 * 버전(4)과 variant(10xx) 비트를 규격대로 세팅한다. 그러지 않으면 형태만 UUID인 문자열이 되고,
 * 서버가 UUID 컬럼에 넣을 때 거부할 수 있다.
 */
function uuidV4FromRandomValues(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)

  /*
   * version 4 와 variant 비트를 세팅한다.
   *
   * `?? 0` 은 실제로는 도달하지 않는다 — `getRandomValues` 가 모든 바이트를 채운다.
   * `noUncheckedIndexedAccess` 는 TypedArray 인덱스도 `number | undefined` 로 보는데,
   * ESLint 의 `no-unnecessary-type-assertion` 은 같은 자리를 `number` 로 보아 `!` 를 거부한다.
   * 두 도구를 동시에 만족시키는 방법이 이것뿐이다.
   */
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80

  // 하이픈 위치(8-4-4-4-12)에 맞춰 조립한다.
  const hex = Array.from(bytes, (b) => HEX[b]!)
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  )
}

/**
 * 새 식별자를 만든다. 모든 id 생성은 이 함수를 거친다.
 *
 * secure context에서는 브라우저 구현을 쓰고, 그 외에는 `getRandomValues` 폴백을 쓴다.
 * 두 경로 모두 UUID v4 형식이다.
 */
export function createId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return uuidV4FromRandomValues()
}

/**
 * 클립보드에 텍스트를 쓴다.
 *
 * `navigator.clipboard` 도 secure context 전용이다. LAN 주소로 열면 없으므로, 화면 밖
 * `<textarea>` + `document.execCommand('copy')` 로 폴백한다. `execCommand` 는 deprecated지만
 * insecure origin에서 복사를 할 수 있는 유일한 경로다.
 *
 * @returns 복사 성공 여부. 실패해도 던지지 않는다 — 링크는 화면에 이미 보이므로 직접 복사할 수 있다.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 권한 거부 등. 아래 폴백을 시도한다.
    }
  }

  try {
    const el = document.createElement('textarea')
    el.value = text
    // 화면 밖에 두되 `display: none` 은 쓰지 않는다. 숨긴 요소는 선택할 수 없다.
    el.style.position = 'fixed'
    el.style.top = '-9999px'
    el.setAttribute('readonly', '')
    document.body.append(el)
    el.select()
    const ok = document.execCommand('copy')
    el.remove()
    return ok
  } catch {
    return false
  }
}
