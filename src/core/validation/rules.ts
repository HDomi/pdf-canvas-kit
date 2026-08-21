/**
 * 검증 규칙 (커스텀 객체는 소비자가 정의한다).
 *
 * 인스펙터의 실시간 경고와 저장·내보내기 게이트가 **같은 함수**를 쓴다. 두 곳에서 따로 판단하면
 * "인스펙터는 통과인데 게이트가 막히는" 상태가 생기고, 사용자는 이유를 알 수 없다.
 *
 * ## 이 패키지가 아는 규칙과 모르는 규칙
 *
 * | | 누가 판단하나 |
 * | --- | --- |
 * | 문서가 비었다 · 페이지 한도 초과 | **이 패키지** |
 * | 등록되지 않은 `kind` | **이 패키지** — 레지스트리를 보면 안다 |
 * | 커스텀 객체의 내용이 유효한가 | **소비자** — `objectType.validate(data)` |
 *
 * 이전 판은 정답·배점·보기 개수를 코어에서 검증했다. 그 규칙들은 문제지 도메인의 것이고
 * 이 패키지는 `data` 를 해석하지 않으므로 소비자에게 넘겼다 (커스텀 객체는 소비자가 정의한다).
 */
import { LIMITS } from '../config/defaults'
import type { ObjectTypeRegistry } from '../objectTypes'
import { UNKNOWN_KIND_ISSUE } from '../objectTypes'
import type { PDFCanvasDoc, PDFCanvasObject } from '../model/types'

/** 이 패키지가 내는 검증 코드. 소비자 규칙은 문자열 메시지로 온다. */
export type IssueCode = 'EMPTY_DOC' | 'PAGE_LIMIT' | 'OBJECT_LIMIT_PAGE' | typeof UNKNOWN_KIND_ISSUE

/**
 * 소비자 `objectType.validate()` 가 낸 위반.
 *
 * 코드는 하나로 고정하고 사람이 읽는 내용은 `message` 에 담는다. 소비자가 임의 코드를 내면
 * UI 가 분기할 수 없고, 문자열 유니온이 사실상 `string` 이 되어 타입이 무의미해진다.
 */
export const CUSTOM_INVALID = 'CUSTOM_INVALID'

export interface ValidationIssue {
  /**
   * 이 패키지의 코드이거나 `'CUSTOM_INVALID'`(소비자 규칙).
   *
   * `IssueCode | string` 으로 두면 리터럴이 무의미해진다 — 소비자 코드를 하나로 고정해
   * 분기할 수 있게 한다.
   */
  code: IssueCode | typeof CUSTOM_INVALID
  /** 소비자 규칙이면 그 메시지. 이 패키지 코드면 `strings.ts` 의 문구를 UI 가 찾는다. */
  message?: string
  /** 문제가 있는 페이지. 문서 전체 문제면 null. */
  pageId: string | null
  /** 0-based 페이지 인덱스. UI 가 해당 페이지로 이동할 때 쓴다. */
  pageIndex: number | null
  /** 문제가 있는 객체. 페이지·문서 수준 문제면 null. */
  objectId: string | null
}

export interface ValidationResult {
  ok: boolean
  issues: ValidationIssue[]
}

/** 이 패키지 코드 → 문구 키. 소비자 메시지는 그대로 보여진다. */
export const ISSUE_MESSAGE_KEYS: Record<IssueCode, string> = {
  EMPTY_DOC: 'error.emptyDoc',
  PAGE_LIMIT: 'error.pageLimit',
  OBJECT_LIMIT_PAGE: 'error.objectLimit',
  [UNKNOWN_KIND_ISSUE]: 'error.unknownKind',
}

/**
 * 객체 하나를 검증한다.
 *
 * 인스펙터가 직접 호출해 실시간 경고를 띄운다. 그래서 문서 전체를 훑지 않는다.
 *
 * 커스텀 객체는 두 단계로 본다. 먼저 `kind` 가 등록됐는지 — 저장된 문서가 지금 없는 타입을
 * 담고 있을 수 있다. 그다음 소비자 `validate(data)`.
 */
export function validateObject(
  obj: PDFCanvasObject,
  types?: ObjectTypeRegistry,
): { code: IssueCode | typeof CUSTOM_INVALID; message?: string }[] {
  if (obj.type !== 'custom') return []

  const def = types?.get(obj.kind)
  if (types && !def) {
    return [{ code: UNKNOWN_KIND_ISSUE, message: obj.kind }]
  }

  const messages = def?.validate?.(obj.data) ?? null
  if (!messages || messages.length === 0) return []
  return messages.map((message) => ({ code: CUSTOM_INVALID, message }))
}

/**
 * 문서 전체를 검증한다. 저장·내보내기 게이트가 호출한다.
 *
 * 페이지가 0인 경우는 버튼 비활성으로도 막지만 여기서도 코드를 낸다. 호출 경로가 여럿이므로
 * 한 곳에서 판단해야 한다.
 */
export function validateDoc(doc: PDFCanvasDoc, types?: ObjectTypeRegistry): ValidationResult {
  const issues: ValidationIssue[] = []

  if (doc.pages.length === 0) {
    issues.push({ code: 'EMPTY_DOC', pageId: null, pageIndex: null, objectId: null })
  }
  if (doc.pages.length > LIMITS.pagesPerDoc) {
    issues.push({ code: 'PAGE_LIMIT', pageId: null, pageIndex: null, objectId: null })
  }

  doc.pages.forEach((page, pageIndex) => {
    if (page.objects.length > LIMITS.objectsPerPage) {
      issues.push({ code: 'OBJECT_LIMIT_PAGE', pageId: page.id, pageIndex, objectId: null })
    }
    for (const obj of page.objects) {
      for (const issue of validateObject(obj, types)) {
        issues.push({
          code: issue.code,
          ...(issue.message !== undefined ? { message: issue.message } : {}),
          pageId: page.id,
          pageIndex,
          objectId: obj.id,
        })
      }
    }
  })

  return { ok: issues.length === 0, issues }
}

/** 게이트를 막는 객체 id 집합. 캔버스 하이라이트에 쓴다. */
export function invalidObjectIds(result: ValidationResult): Set<string> {
  const ids = new Set<string>()
  for (const issue of result.issues) if (issue.objectId) ids.add(issue.objectId)
  return ids
}
