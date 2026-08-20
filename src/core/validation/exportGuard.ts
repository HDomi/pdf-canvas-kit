/**
 * 내보내기 게이트 (PLAN 12, 기획 3.5).
 *
 * 검증에 실패하면 팝업을 열지 않고 문제가 있는 첫 객체로 이동시킨다. 교사가 "왜 안 되는지"를
 * 찾아 헤매지 않게 하는 것이 목적이다.
 */
import type { WorksheetDoc } from '../model/types'
import { toPublicDoc, type PublicWorksheetDoc } from '../model/publicDoc'
import { invalidObjectIds, validateDoc, type ValidationIssue, type ValidationResult } from './rules'

export interface ExportPayload {
  doc: WorksheetDoc
  /** 정답을 제거한 학생용 문서. 호스트가 과제 스냅샷을 만들 때 쓴다 (PLAN D14). */
  publicDoc: PublicWorksheetDoc
  validation: ValidationResult
}

export interface ExportGuardResult {
  ok: boolean
  /** 통과 시 호스트에 넘길 payload. 실패면 null. */
  payload: ExportPayload | null
  /** 실패 시 사용자를 데려갈 첫 문제. */
  firstIssue: ValidationIssue | null
  invalidIds: Set<string>
}

/**
 * 내보내기 가능 여부를 판단한다.
 *
 * 실패해도 `validation` 전체를 돌려주므로 호출자가 문제 개수를 세거나 목록을 보여줄 수 있다.
 */
export function guardExport(doc: WorksheetDoc): ExportGuardResult {
  const validation = validateDoc(doc)
  if (!validation.ok) {
    // 객체 문제를 우선 안내한다. 페이지·문서 수준 문제(한도 초과)는 이동할 대상이 없다.
    const firstIssue =
      validation.issues.find((i) => i.objectId !== null) ?? validation.issues[0] ?? null
    return { ok: false, payload: null, firstIssue, invalidIds: invalidObjectIds(validation) }
  }
  return {
    ok: true,
    payload: { doc, publicDoc: toPublicDoc(doc), validation },
    firstIssue: null,
    invalidIds: new Set(),
  }
}
