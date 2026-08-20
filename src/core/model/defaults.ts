/**
 * 문서 팩토리.
 *
 * id는 `createId()` 를 쓴다. 이 라이브러리가 대상으로 하는 모든 브라우저에 내장돼 있고,
 * nanoid보다 의존성이 하나 적다 (PLAN 3.4).
 */
import { createId } from '../util/id'
import type { PageBackground, Size, PDFCanvasDoc, PDFCanvasPage } from './types'

/** 기본 타이틀. 기획서 기본값과 같다 (기획 4.2). */
export const UNTITLED_TITLE = '제목 없는 문서'

/** A4 크기(pt). 크기를 정할 문서가 없는 빈 페이지에 쓴다. */
export const A4_PT: Size = { width: 595.28, height: 841.89 }

export function createPDFCanvasDoc(overrides: Partial<PDFCanvasDoc> = {}): PDFCanvasDoc {
  return {
    schemaVersion: 1,
    id: createId(),
    title: UNTITLED_TITLE,
    titleTouched: false,
    pages: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

export function createPage(
  init: { size?: Size; background?: PageBackground } & Partial<
    Pick<PDFCanvasPage, 'source' | 'objects'>
  > = {},
): PDFCanvasPage {
  const page: PDFCanvasPage = {
    id: createId(),
    size: init.size ?? A4_PT,
    background: init.background ?? { kind: 'blank' },
    objects: init.objects ?? [],
  }
  // `exactOptionalPropertyTypes` 는 optional 필드에 undefined 대입을 금지한다.
  if (init.source) page.source = init.source
  return page
}

/** 이웃 페이지와 같은 크기의 빈 페이지. 삽입이 용지 규격을 바꾸지 않게 한다. */
export function createBlankPageLike(reference?: PDFCanvasPage): PDFCanvasPage {
  return createPage({ size: reference?.size ?? A4_PT })
}
