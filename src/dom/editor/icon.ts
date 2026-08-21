/**
 * 아이콘 하나를 그린다 (R12 후속).
 *
 * 세 경로를 **한 곳에서** 결정한다. 각 사용처에 분기를 두면 새 아이콘을 추가할 때마다
 * 세 갈래를 다시 쓰게 되고, 한 곳만 빠뜨리면 그 아이콘만 조용히 커스터마이징이 안 된다.
 *
 * | 우선순위 | 조건 | 결과 |
 * | --- | --- | --- |
 * | 1 | `configureIcons` 에 팩토리가 있다 | 그 노드 |
 * | 2 | `onMountIcon` 이 있다 (래퍼) | 빈 컨테이너 + 통지 → portal |
 * | 3 | — | `strings` 의 `icon.<name>` 글리프 |
 *
 * 3번이 기본이므로 아무것도 설정하지 않은 소비자도 아이콘이 보인다.
 */
import { el } from '../h'
import { onCleanup } from '../reactive'
import { text } from '../../core/config/strings'
import { iconFactory, type IconName } from '../../core/config/icons'

/**
 * 프레임워크 래퍼가 아이콘 컨테이너를 받는 통로.
 *
 * `strings`·`icons` 와 달리 **모듈 스코프가 아니다.** 래퍼는 편집기 인스턴스마다 다른
 * portal 트리를 가지므로 인스턴스와 묶여야 한다.
 */
let mountIcon: ((name: IconName, el: HTMLElement | null) => void) | null = null

/**
 * 래퍼의 아이콘 마운트 콜백을 설정한다. facade 가 편집기를 만들 때 부른다.
 *
 * ⚠️ 한 페이지에 편집기가 둘이고 **둘 중 하나만** `renderIcon` 을 주면 나중에 만든 쪽의
 * 설정이 이긴다. 커스텀 객체 슬롯(`onMountCustom`)이 컨트롤러에 묶여 있는 것과 달리, 아이콘은
 * 렌더 층 깊은 곳(인스펙터 필드 등)에서도 쓰이므로 prop 을 흘리는 비용이 크다. 그 한계를
 * 문서에 적었다 (ARCHITECTURE §19.4).
 */
export function setIconMount(fn: ((name: IconName, el: HTMLElement | null) => void) | null): void {
  mountIcon = fn
}

/** 아이콘 노드. 버튼 안에 넣는다. */
export function icon(name: IconName): Node {
  const factory = iconFactory(name)
  if (factory) return factory()

  if (mountIcon) {
    /*
     * portal 경로 — 빈 컨테이너만 만들고 알린다.
     *
     * 커스텀 객체와 같은 프로토콜이다 (ARCHITECTURE §17.2). 정리 시 `null` 을 보내 래퍼가
     * portal 을 걷게 한다.
     */
    const box = el('span', { class: 'pck-icon-slot', attr: { 'data-icon-name': name } })
    mountIcon(name, box)
    const notify = mountIcon
    onCleanup(() => notify(name, null))
    return box
  }

  // 기본 — 글리프. `strings` 로 바꿀 수 있다.
  return document.createTextNode(text(`icon.${name}`))
}
