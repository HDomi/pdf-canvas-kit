/**
 * 모든 문서 변경은 커맨드를 통과한다 (PLAN D8).
 *
 * 커맨드는 `WorksheetDoc -> WorksheetDoc | null` 순수 함수이고, null은 "할 일 없음"이다.
 * 모든 변경을 한 지점으로 모으는 덕분에, 각 컴포넌트가 따로 신경 쓰지 않아도
 * undo/redo·dirty 추적·자동저장이 성립한다.
 *
 * 커맨드는 **바뀐 가지에 대해서만 새 객체**를 돌려준다. 그래서 히스토리 항목이 문서 전체 참조를
 * 싸게 들고 있을 수 있다 (../store/history.ts 참고).
 */
import type { WorksheetDoc } from '../model/types'

/** 다음 문서를 돌려준다. 변경이 없으면 null. */
export type Command = (doc: WorksheetDoc) => WorksheetDoc | null

export interface LabeledCommand {
  label: string
  run: Command
}

/** `updatedAt` 을 갱신한다. 헬퍼마다가 아니라 커밋되는 커맨드마다 한 번 적용한다. */
export function touch(doc: WorksheetDoc): WorksheetDoc {
  return { ...doc, updatedAt: new Date().toISOString() }
}

/** 인덱스로 한 페이지만 교체한다. 나머지 페이지는 참조가 그대로 유지된다. */
export function replacePage(
  doc: WorksheetDoc,
  index: number,
  map: (page: WorksheetDoc['pages'][number]) => WorksheetDoc['pages'][number],
): WorksheetDoc | null {
  const page = doc.pages[index]
  if (!page) return null
  const next = map(page)
  if (next === page) return null
  const pages = [...doc.pages]
  pages[index] = next
  return { ...doc, pages }
}

export * from './doc'
export * from './pages'
export * from './objects'
