/**
 * 호스트 아이콘 (문구·아이콘은 prop 으로 받는다).
 *
 * 아이콘을 넣는 길이 셋이고 이 예제가 셋 다 보여준다.
 *
 * | 방법 | 어디서 | 이 예제에서 |
 * | --- | --- | --- |
 * | `strings` 의 `icon.*` | 글리프 문자열 | `caret` — 다른 유니코드로 |
 * | `icons` | `() => Node` (vanilla) | `close` — SVG 를 직접 만든다 |
 * | `renderIcon` | 프레임워크 컴포넌트 | `undo` · `redo` · `zoomIn` · `zoomOut` |
 *
 * 우선순위는 `icons` > `renderIcon` > 글리프다. 셋 중 하나만 주면 나머지는 기본값이 나온다.
 */

/** 공통 SVG 껍데기. `currentColor` 를 쓰므로 버튼의 글자색을 따라간다. */
function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function UndoIcon() {
  return (
    <Svg>
      <path d="M3 7v6h6" />
      <path d="M3.5 13a9 9 0 1 0 2.6-6.4L3 9" />
    </Svg>
  )
}

export function RedoIcon() {
  return (
    <Svg>
      <path d="M21 7v6h-6" />
      <path d="M20.5 13a9 9 0 1 1-2.6-6.4L21 9" />
    </Svg>
  )
}

export function ZoomInIcon() {
  return (
    <Svg>
      <circle cx="11" cy="11" r="7" />
      <path d="M11 8v6M8 11h6M20 20l-3.6-3.6" />
    </Svg>
  )
}

export function ZoomOutIcon() {
  return (
    <Svg>
      <circle cx="11" cy="11" r="7" />
      <path d="M8 11h6M20 20l-3.6-3.6" />
    </Svg>
  )
}

export function BackIcon() {
  return (
    <Svg>
      <path d="M15 18l-6-6 6-6" />
    </Svg>
  )
}

/**
 * vanilla 경로 시범 — DOM 노드를 직접 만든다.
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
