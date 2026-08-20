/**
 * 전체 케이스 목록 — `/checks/` 화면과 헤드리스 러너의 **단일 출처** (PLAN 17.2).
 *
 * 두 소비자가 각자 그룹을 합치면 한쪽에만 추가되는 그룹이 생긴다. 새 그룹은 여기에만 넣는다.
 *
 * 순수 함수 케이스와 반응성 케이스를 파일로 나눈 이유는 성격이 다르기 때문이다 — 전자는
 * 입력→출력 한 줄이고, 후자는 상태 변화 순서를 확인한다.
 */
import { GROUPS, type CaseGroup } from './cases'
import { REACTIVE_GROUPS } from './reactiveCases'

export type { Case, CaseGroup } from './cases'

export const ALL_GROUPS: CaseGroup[] = [...GROUPS, ...REACTIVE_GROUPS]
