/**
 * 휠 이벤트의 `deltaY` 를 픽셀로 정규화한다 (2026.08.21).
 *
 * ## 왜 필요한가 ★
 *
 * `WheelEvent.deltaY` 의 **단위가 브라우저마다 다르다.** `deltaMode` 가 그 단위를 말한다.
 *
 * | `deltaMode` | 단위 | 어디서 |
 * | --- | --- | --- |
 * | `0` DOM_DELTA_PIXEL | 픽셀 | Chrome · Safari (마우스 휠 한 틱 ≈ 100) |
 * | `1` DOM_DELTA_LINE | **줄 수** | Firefox 의 마우스 휠 (한 틱 ≈ 3) |
 * | `2` DOM_DELTA_PAGE | **페이지 수** | 드물다. 일부 설정·환경 |
 *
 * 정규화하지 않으면 Firefox 에서 줌이 거의 움직이지 않는다 — `deltaY: 3` 을 픽셀로 읽으면
 * 배율 변화가 1% 도 안 된다. 이 함수 없이 계수만 올리면 Chrome 이 폭주하고 Firefox 는 여전히
 * 느리다. **단위를 맞추는 것과 감도를 정하는 것은 다른 일이다.**
 *
 * ## 순수 함수인 이유
 *
 * 렌더 층에 두면 브라우저 없이 확인할 수 없다. 여기 두면 `npm run checks` 가 세 모드를 전부
 * 고정한다 — 실제로 Firefox 를 띄워 보기 어려운 항목이라 그 차이가 크다.
 */

/**
 * 한 줄의 픽셀 높이.
 *
 * 브라우저가 알려 주지 않으므로 관례값을 쓴다. Firefox 자신이 `deltaMode: LINE` 을 픽셀로
 * 환산할 때 쓰는 값이 기본 폰트 크기 기반이고, 그것이 대체로 16px 다. 정확히 맞출 필요는
 * 없다 — 줌 감도는 어차피 계수로 조정하고, 여기서 필요한 것은 **자릿수를 맞추는 것**이다.
 */
const LINE_PX = 16

/**
 * 한 페이지의 픽셀 높이.
 *
 * 실제로는 뷰포트 높이지만 이 함수는 DOM 을 모른다. 넘겨받게 만들면 호출부마다 스테이지
 * 높이를 구해 와야 하는데, `DOM_DELTA_PAGE` 는 거의 오지 않아 그 비용이 맞지 않는다.
 * 상한(`EDITOR_DEFAULTS.zoom.wheelMaxDelta`)이 이 값의 오차를 흡수한다.
 */
const PAGE_PX = 400

/**
 * `deltaY` 를 픽셀 단위로 바꾼다.
 *
 * @param deltaMode `WheelEvent.deltaMode`. 알 수 없는 값은 픽셀로 본다 — 브라우저가 규격 밖의
 *   값을 준다면 그것을 확대해 주는 쪽이 더 위험하다.
 */
export function normalizeWheelDelta(deltaY: number, deltaMode: number): number {
  if (deltaMode === 1) return deltaY * LINE_PX
  if (deltaMode === 2) return deltaY * PAGE_PX
  return deltaY
}
