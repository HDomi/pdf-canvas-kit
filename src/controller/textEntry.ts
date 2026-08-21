/**
 * 텍스트 입력 중인지 판정한다.
 *
 * 편집기 단축키는 텍스트 입력에 포커스가 있으면 전부 건너뛴다. 그 상황에서 `Delete` 나 `Space` 를
 * 가로채면 타이핑이 깨진다 — `Delete` 는 객체를 지우고 `Space` 는 팬을 켠다.
 *
 * `contenteditable` 을 포함한다. 텍스트 객체의 인라인 편집이 그것이다 (ARCHITECTURE §6.5).
 *
 * 구 판에서는 이 함수가 `usePan.ts` 와 루트 컴포넌트에 **각각 복사**돼 있었다. 한쪽만 고치면
 * 팬과 단축키가 서로 다른 판정을 하기 시작하므로 한곳으로 모았다.
 */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}
