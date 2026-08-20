/**
 * 객체 단위 커맨드. 추가·변형·삭제·복제·z-order.
 *
 * 모두 Answer Box 수량 한도(페이지 30 / 문서 200, 기획 6.2)를 지킨다.
 */
import { createId } from '../util/id'
import { EDITOR_DEFAULTS, LIMITS } from '../config/defaults'
import { clampIntoPage } from '../geometry/constrain'
import type { AnswerBox, Rect, WorksheetDoc, WorksheetObject } from '../model/types'
import { replacePage, touch, type Command } from './index'

/** Answer Box 수량 한도를 넘길 때 던진다. UI가 기획 6.3 문구를 보여준다. */
export class AnswerBoxLimitError extends Error {
  readonly scope: 'page' | 'doc'
  constructor(scope: 'page' | 'doc') {
    super(
      scope === 'page'
        ? `[worksheet] page answer box limit is ${LIMITS.answerBoxesPerPage}`
        : `[worksheet] document answer box limit is ${LIMITS.answerBoxesPerDoc}`,
    )
    this.name = 'AnswerBoxLimitError'
    this.scope = scope
  }
}

/**
 * Answer Box 계열인지. 수량 한도는 이 세 유형에만 적용된다.
 *
 * 타입 가드로 선언해 호출부에서 `points` 같은 공통 필드에 접근할 수 있게 한다.
 */
export function isAnswerBox(obj: WorksheetObject): obj is AnswerBox {
  return obj.type === 'answer.short' || obj.type === 'answer.essay' || obj.type === 'answer.dropbox'
}

export function countAnswerBoxes(doc: WorksheetDoc): {
  perPage: Map<string, number>
  total: number
} {
  const perPage = new Map<string, number>()
  let total = 0
  for (const page of doc.pages) {
    const n = page.objects.filter(isAnswerBox).length
    perPage.set(page.id, n)
    total += n
  }
  return { perPage, total }
}

/**
 * 페이지에 객체를 추가한다.
 *
 * @throws {AnswerBoxLimitError} Answer Box 수량 한도를 넘기면. 조용히 무시하지 않고 던지는 이유는,
 * 드래그했는데 아무 일도 일어나지 않으면 사용자가 원인을 알 수 없기 때문이다.
 */
export function addObject(pageIndex: number, obj: WorksheetObject): Command {
  return (doc) => {
    const page = doc.pages[pageIndex]
    if (!page) return null

    if (isAnswerBox(obj)) {
      const counts = countAnswerBoxes(doc)
      if ((counts.perPage.get(page.id) ?? 0) + 1 > LIMITS.answerBoxesPerPage) {
        throw new AnswerBoxLimitError('page')
      }
      if (counts.total + 1 > LIMITS.answerBoxesPerDoc) {
        throw new AnswerBoxLimitError('doc')
      }
    }

    const next = replacePage(doc, pageIndex, (p) => ({ ...p, objects: [...p.objects, obj] }))
    return next ? touch(next) : null
  }
}

/**
 * 여러 객체의 rect를 한 번에 바꾼다. 드래그·리사이즈 커밋에 쓴다.
 *
 * 하나의 커맨드로 처리해야 여러 객체를 함께 옮긴 동작이 undo 한 번에 되돌아간다.
 */
export function transformObjects(pageIndex: number, rects: ReadonlyMap<string, Rect>): Command {
  return (doc) => {
    if (rects.size === 0) return null
    const next = replacePage(doc, pageIndex, (page) => {
      let changed = false
      const objects = page.objects.map((o) => {
        const rect = rects.get(o.id)
        if (!rect) return o
        if (
          rect.x === o.rect.x &&
          rect.y === o.rect.y &&
          rect.w === o.rect.w &&
          rect.h === o.rect.h
        ) {
          return o
        }
        changed = true
        return { ...o, rect }
      })
      return changed ? { ...page, objects } : page
    })
    return next ? touch(next) : null
  }
}

/**
 * 객체 속성을 부분 갱신한다. 인스펙터 편집에 쓴다.
 *
 * 패치 타입은 유니온 전체(`WorksheetObject`)에 대한 Partial이다. 유형별로 좁힌 제네릭을 쓰면
 * 호출부에서 매번 캐스트가 필요해지므로, 호출자가 올바른 유형에 올바른 필드를 넘긴다고 신뢰한다.
 * 인스펙터 패널이 이미 유형별로 분리돼 있어 실수 여지가 작다.
 */
export function updateObject(
  pageIndex: number,
  objectId: string,
  patch: Partial<WorksheetObject>,
): Command {
  return (doc) => {
    const next = replacePage(doc, pageIndex, (page) => {
      const index = page.objects.findIndex((o) => o.id === objectId)
      const target = page.objects[index]
      if (!target) return page
      const objects = [...page.objects]
      // 스프레드가 유니온 판별자를 넓히므로 대상 유형으로 되돌린다.
      objects[index] = { ...target, ...patch } as typeof target
      return { ...page, objects }
    })
    return next ? touch(next) : null
  }
}

/** 객체들을 삭제한다. 페이지의 다른 요소에는 영향이 없다 (기획 6.2). */
export function removeObjects(pageIndex: number, ids: readonly string[]): Command {
  return (doc) => {
    if (ids.length === 0) return null
    const idSet = new Set(ids)
    const next = replacePage(doc, pageIndex, (page) => {
      const objects = page.objects.filter((o) => !idSet.has(o.id))
      return objects.length === page.objects.length ? page : { ...page, objects }
    })
    return next ? touch(next) : null
  }
}

/**
 * 객체들을 복제해 약간 옮긴 위치에 놓는다.
 *
 * 오프셋이 없으면 복제본이 원본을 정확히 덮어 아무 일도 안 일어난 것처럼 보인다.
 */
export function duplicateObjects(pageIndex: number, ids: readonly string[]): Command {
  return (doc) => {
    const page = doc.pages[pageIndex]
    if (!page || ids.length === 0) return null

    const idSet = new Set(ids)
    const sources = page.objects.filter((o) => idSet.has(o.id))
    if (sources.length === 0) return null

    const answerBoxCount = sources.filter(isAnswerBox).length
    if (answerBoxCount > 0) {
      const counts = countAnswerBoxes(doc)
      if ((counts.perPage.get(page.id) ?? 0) + answerBoxCount > LIMITS.answerBoxesPerPage) {
        throw new AnswerBoxLimitError('page')
      }
      if (counts.total + answerBoxCount > LIMITS.answerBoxesPerDoc) {
        throw new AnswerBoxLimitError('doc')
      }
    }

    const offset = EDITOR_DEFAULTS.duplicateOffset
    const copies = sources.map((o) => ({
      ...o,
      id: createId(),
      rect: clampIntoPage({ ...o.rect, x: o.rect.x + offset, y: o.rect.y + offset }, page.size),
    }))

    const next = replacePage(doc, pageIndex, (p) => ({ ...p, objects: [...p.objects, ...copies] }))
    return next ? touch(next) : null
  }
}

/** 복제 결과로 새로 생긴 객체 id들. 복제 직후 선택을 옮길 때 쓴다. */
export function newIdsAfterDuplicate(
  before: WorksheetDoc,
  after: WorksheetDoc,
  pageIndex: number,
): string[] {
  const prev = new Set((before.pages[pageIndex]?.objects ?? []).map((o) => o.id))
  return (after.pages[pageIndex]?.objects ?? []).filter((o) => !prev.has(o.id)).map((o) => o.id)
}

/**
 * 객체 회전을 설정한다.
 *
 * Answer Box는 회전하지 않는다 (PLAN Q8). 학생 폼 요소가 기울면 입력과 모바일 렌더가 깨진다.
 * 호출부에서 막더라도 커맨드에서 한 번 더 거른다 — 문서 불변식은 커맨드가 지켜야 한다.
 */
export function setRotation(pageIndex: number, objectId: string, deg: number): Command {
  return (doc) => {
    const next = replacePage(doc, pageIndex, (page) => {
      const index = page.objects.findIndex((o) => o.id === objectId)
      const target = page.objects[index]
      if (!target || isAnswerBox(target)) return page
      const rotation = (((Math.round(deg * 10) / 10) % 360) + 360) % 360
      if ((target.rotation ?? 0) === rotation) return page
      const objects = [...page.objects]
      // 0°는 필드를 지운다. 기본값을 명시적으로 저장하면 JSON만 커진다.
      objects[index] = rotation === 0 ? omitRotation(target) : { ...target, rotation }
      return { ...page, objects }
    })
    return next ? touch(next) : null
  }
}

/** `rotation` 필드를 제거한 사본. */
function omitRotation<T extends WorksheetObject>(obj: T): T {
  const { rotation: _rotation, ...rest } = obj
  return rest as T
}

/** z-order를 바꾼다. 배열 순서가 z-order다. */
export function reorderObject(pageIndex: number, objectId: string, to: 'front' | 'back'): Command {
  return (doc) => {
    const next = replacePage(doc, pageIndex, (page) => {
      const index = page.objects.findIndex((o) => o.id === objectId)
      const target = page.objects[index]
      if (!target) return page
      const rest = page.objects.filter((o) => o.id !== objectId)
      return { ...page, objects: to === 'front' ? [...rest, target] : [target, ...rest] }
    })
    return next ? touch(next) : null
  }
}
