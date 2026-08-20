/**
 * 전체 케이스 목록 — `/checks/` 화면과 헤드리스 러너의 **단일 출처** (PLAN 17.2).
 *
 * 두 소비자가 각자 그룹을 합치면 한쪽에만 추가되는 그룹이 생긴다. 새 그룹은 여기에만 넣는다.
 *
 * 세 종류를 파일로 나눈 이유는 성격이 다르기 때문이다.
 *
 * | 파일 | 확인하는 것 | DOM 필요 |
 * | --- | --- | --- |
 * | `cases.ts` | 순수 함수 — 입력 → 출력 한 줄 | 아니오 |
 * | `reactiveCases.ts` | 반응성 — 상태 변화 **순서** | 아니오 |
 * | `domCases.ts` | 렌더 층 — 바인딩·조건부·키 리스트 재조정 | **예** |
 *
 * 헤드리스 러너(`scripts/run-checks.mjs`)는 happy-dom 으로 전역 `document` 를 세운 뒤
 * 이 모듈을 불러온다. 브라우저에서는 실제 DOM 을 그대로 쓴다.
 */
import { GROUPS, type CaseGroup } from './cases'
import { REACTIVE_GROUPS } from './reactiveCases'
import { DOM_GROUPS } from './domCases'

export type { Case, CaseGroup } from './cases'

export const ALL_GROUPS: CaseGroup[] = [...GROUPS, ...REACTIVE_GROUPS, ...DOM_GROUPS]
