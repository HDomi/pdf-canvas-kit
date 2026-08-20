/**
 * 객체 단위 커맨드. 추가·변형·삭제·복제·z-order.
 *
 * 모두 객체 수량 한도(페이지 30 / 문서 200)를 지킨다. 이 상한은 DOM 렌더(PLAN D2)의 전제이고,
 * 드래그 중 rAF 코얼레싱을 쓰지 않는 판단(PLAN 18.6)도 여기에 기댄다.
 *
 * 이전 판은 한도를 Answer Box 에만 적용했다. 커스텀 객체는 소비자가 무엇이든 넣을 수 있으므로
 * (PLAN D25) 전체 객체 수로 바꿨다 — 성능 상한은 유형과 무관하다.
 */
import { createId } from '../util/id'
import { EDITOR_DEFAULTS, LIMITS } from '../config/defaults'
import { clampIntoPage } from '../geometry/constrain'
import type { Rect, PDFCanvasDoc, PDFCanvasObject } from '../model/types'
import { replacePage, touch, type Command } from './index'

/** 객체 수량 한도를 넘길 때 던진다. UI 가 안내 문구를 보여준다. */
export class ObjectLimitError extends Error {
  readonly scope: 'page' | 'doc'
  constructor(scope: 'page' | 'doc') {
    super(
      scope === 'page'
        ? `[pdf-canvas-kit] page object limit is ${LIMITS.objectsPerPage}`
        : `[pdf-canvas-kit] document object limit is ${LIMITS.objectsPerDoc}`,
    )
    this.name = 'ObjectLimitError'
    this.scope = scope
  }
}

export function countObjects(doc: PDFCanvasDoc): {
  perPage: Map<string, number>
  total: number
} {
  const perPage = new Map<string, number>()
  let total = 0
  for (const page of doc.pages) {
    perPage.set(page.id, page.objects.length)
    total += page.objects.length
  }
  return { perPage, total }
}

/**
 * 페이지에 객체를 추가한다.
 *
 * @throws {ObjectLimitError} 수량 한도를 넘기면. 조용히 무시하지 않고 던지는 이유는,
 * 드래그했는데 아무 일도 일어나지 않으면 사용자가 원인을 알 수 없기 때문이다.
 */
export function addObject(pageIndex: number, obj: PDFCanvasObject): Command {
  return (doc) => {
    const page = doc.pages[pageIndex]
    if (!page) return null

    const counts = countObjects(doc)
    if ((counts.perPage.get(page.id) ?? 0) + 1 > LIMITS.objectsPerPage) {
      throw new ObjectLimitError('page')
    }
    if (counts.total + 1 > LIMITS.objectsPerDoc) {
      throw new ObjectLimitError('doc')
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
 * 패치 타입은 유니온 전체(`PDFCanvasObject`)에 대한 Partial이다. 유형별로 좁힌 제네릭을 쓰면
 * 호출부에서 매번 캐스트가 필요해지므로, 호출자가 올바른 유형에 올바른 필드를 넘긴다고 신뢰한다.
 * 인스펙터 패널이 이미 유형별로 분리돼 있어 실수 여지가 작다.
 */
export function updateObject(
  pageIndex: number,
  objectId: string,
  patch: Partial<PDFCanvasObject>,
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

    const counts = countObjects(doc)
    if ((counts.perPage.get(page.id) ?? 0) + sources.length > LIMITS.objectsPerPage) {
      throw new ObjectLimitError('page')
    }
    if (counts.total + sources.length > LIMITS.objectsPerDoc) {
      throw new ObjectLimitError('doc')
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
  before: PDFCanvasDoc,
  after: PDFCanvasDoc,
  pageIndex: number,
): string[] {
  const prev = new Set((before.pages[pageIndex]?.objects ?? []).map((o) => o.id))
  return (after.pages[pageIndex]?.objects ?? []).filter((o) => !prev.has(o.id)).map((o) => o.id)
}

/**
 * 객체 회전을 설정한다.
 *
 * ## `canRotate` 를 받는 이유
 *
 * 이전 판은 "Answer Box 는 회전하지 않는다"(PLAN Q8)를 커맨드에 박아 뒀다. 학생 폼 요소가
 * 기울면 입력과 모바일 렌더가 깨지기 때문이다.
 *
 * 커스텀 객체(PLAN D25)에서는 그 판단이 **소비자 것**이다 — `objectType.rotatable` 이 그것을
 * 표현한다. 그런데 이 모듈은 순수 커맨드이고 레지스트리를 모르므로, 술어를 받아 한 번 더
 * 거른다. 문서 불변식은 커맨드가 지켜야 하지만, 모르는 규칙을 아는 척할 수는 없다.
 *
 * 술어를 주지 않으면 모두 허용한다.
 */
export function setRotation(
  pageIndex: number,
  objectId: string,
  deg: number,
  canRotate?: (obj: PDFCanvasObject) => boolean,
): Command {
  return (doc) => {
    const next = replacePage(doc, pageIndex, (page) => {
      const index = page.objects.findIndex((o) => o.id === objectId)
      const target = page.objects[index]
      if (!target) return page
      if (canRotate && !canRotate(target)) return page
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
function omitRotation<T extends PDFCanvasObject>(obj: T): T {
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
