import type { PDFCanvasDoc } from '../model/types'

/**
 * 문서 영속화. 아직 연결하지 않았다 — 편집기는 `noopStoragePort()` 를 기본으로 쓰고
 * 저장 배지를 `disabled` 로 표시한다 (PLAN 12).
 */
export interface StoragePort {
  save(doc: PDFCanvasDoc): Promise<void>
  load?(id: string): Promise<PDFCanvasDoc>
}

export function noopStoragePort(): StoragePort {
  return {
    save: () => Promise.resolve(),
  }
}
