/**
 * 페이지 단위 커맨드. 추가·삭제·순서 변경·복제.
 *
 * 모두 500페이지 상한(기획 2.2)을 지키고, 문서에 내용이 생긴 뒤에는 최소 1페이지를 남긴다
 * (PLAN Q4).
 */
import { createId } from '../util/id'
import { LIMITS } from '../config/defaults'
import { createBlankPageLike } from '../model/defaults'
import type { WorksheetPage } from '../model/types'
import { touch, type Command } from './index'

/** 커맨드가 기획 한도를 넘길 때 던진다. UI가 메시지를 보여줄 수 있도록. */
export class PageLimitError extends Error {
  constructor(attempted: number) {
    super(
      `[worksheet] ${attempted} pages exceeds the limit of ${LIMITS.pagesPerWorksheet}. ` +
        '1개의 워크시트에 최대 500페이지까지 지원합니다.',
    )
    this.name = 'PageLimitError'
  }
}

/**
 * 페이지를 뒤에 붙인다. 보통 파일 변환 결과다.
 *
 * @throws {PageLimitError} 결과가 페이지 상한을 넘기면. 조용히 잘라내지 않고 던지는 이유는,
 * 교사가 올린 문서에서 말없이 페이지를 버리는 것이 거부하는 것보다 나쁘기 때문이다.
 */
export function appendPages(newPages: WorksheetPage[]): Command {
  return (doc) => {
    if (newPages.length === 0) return null
    const total = doc.pages.length + newPages.length
    if (total > LIMITS.pagesPerWorksheet) throw new PageLimitError(total)
    return touch({ ...doc, pages: [...doc.pages, ...newPages] })
  }
}

/** `index` 뒤에 빈 페이지를 삽입한다. 범위를 벗어나면 맨 끝에 넣는다. */
export function insertBlankPage(index: number): Command {
  return (doc) => {
    if (doc.pages.length + 1 > LIMITS.pagesPerWorksheet) {
      throw new PageLimitError(doc.pages.length + 1)
    }
    const at = index >= 0 && index < doc.pages.length ? index + 1 : doc.pages.length
    // 이웃 페이지의 용지 규격을 따라간다. 삽입이 문서 규격을 바꾸지 않게.
    const reference = doc.pages[index] ?? doc.pages.at(-1)
    const pages = [...doc.pages]
    pages.splice(at, 0, createBlankPageLike(reference))
    return touch({ ...doc, pages })
  }
}

/**
 * 페이지와 그 위에 얹힌 모든 것을 삭제한다 (기획 9.2).
 *
 * 마지막 페이지는 삭제하지 않는다. 페이지가 0이 되면 편집기가 빈 상태로 떨어져 툴바까지
 * 사라지는데, 사용자가 "페이지 삭제"로 기대하는 결과가 아니다 (PLAN Q4).
 */
export function removePage(index: number): Command {
  return (doc) => {
    if (!doc.pages[index]) return null
    if (doc.pages.length <= 1) return null
    const pages = doc.pages.filter((_, i) => i !== index)
    return touch({ ...doc, pages })
  }
}

/** 페이지를 객체까지 통째로 복제해 원본 바로 뒤에 삽입한다 (기획 10.2). */
export function duplicatePage(index: number): Command {
  return (doc) => {
    const page = doc.pages[index]
    if (!page) return null
    if (doc.pages.length + 1 > LIMITS.pagesPerWorksheet) {
      throw new PageLimitError(doc.pages.length + 1)
    }
    const copy: WorksheetPage = {
      ...page,
      id: createId(),
      // 객체 id를 새로 발급한다. 복제된 Answer Box는 별개 문항이며,
      // id를 공유하면 선택과 채점이 모호해진다.
      objects: page.objects.map((o) => ({ ...o, id: createId() })),
    }
    const pages = [...doc.pages]
    pages.splice(index + 1, 0, copy)
    return touch({ ...doc, pages })
  }
}

/** 페이지를 이동한다. `to` 는 제거 *후* 목록에서의 목표 인덱스다. */
export function movePage(from: number, to: number): Command {
  return (doc) => {
    if (!doc.pages[from]) return null
    const target = Math.min(Math.max(to, 0), doc.pages.length - 1)
    if (from === target) return null
    const pages = [...doc.pages]
    const [moved] = pages.splice(from, 1)
    if (!moved) return null
    pages.splice(target, 0, moved)
    return touch({ ...doc, pages })
  }
}
