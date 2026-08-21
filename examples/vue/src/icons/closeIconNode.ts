/**
 * vanilla 경로 시범 (문구·아이콘은 prop 으로 받는다) — DOM 노드를 직접 만든다.
 *
 * `renderIcon`(컴포넌트)보다 **먼저 이긴다.** 프레임워크 없이 쓰는 소비자, 또는 SVG 를
 * 이미 문자열로 들고 있는 경우의 경로다.
 *
 * ⚠️ **매번 새 노드를 반환해야 한다.** 같은 노드를 돌려주면 DOM 은 한 곳에만 붙을 수 있으므로
 * 두 번째 사용처에서 첫 번째의 아이콘이 사라진다.
 */
export function closeIconNode(): Node {
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('width', '14')
  svg.setAttribute('height', '14')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2.4')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(NS, 'path')
  path.setAttribute('d', 'M6 6l12 12M18 6L6 18')
  svg.append(path)
  return svg
}
