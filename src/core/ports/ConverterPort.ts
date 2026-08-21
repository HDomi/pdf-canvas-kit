import type { Size } from '../model/types'

/** 컨버터가 만들어 낸 래스터 페이지 하나. */
export interface RasterPage {
  blob: Blob
  /** pt 단위 페이지 크기. 객체가 사는 좌표 공간이다 (좌표는 페이지 로컬 pt 절대값이다). */
  size: Size
  /** `blob` 의 픽셀 크기. */
  naturalWidth: number
  naturalHeight: number
  /** 래스터화에 쓴 배율. 즉 naturalWidth / size.width. */
  renderScale: number
  /** 원본 파일 안에서의 0-based 인덱스. */
  pageIndex: number
  /**
   * 원본 페이지의 회전 각도(0 | 90 | 180 | 270).
   *
   * `size` 와 래스터에 이미 반영돼 있다. UI가 표시할 수 있게, 그리고 재렌더가 같은 방향을
   * 재현할 수 있게 함께 전달한다.
   */
  rotation: 0 | 90 | 180 | 270
}

export interface ConvertProgress {
  /** 0..1 */
  ratio: number
  /** 현재 변환 중인 페이지(1-based). */
  page?: number
  total?: number
}

export interface ConvertOptions {
  signal?: AbortSignal
  onProgress?: (p: ConvertProgress) => void
}

/**
 * 업로드된 문서를 페이지 이미지로 바꾼다.
 *
 * PDF는 `createPdfjsConverter()` 가 브라우저에서 처리한다. DOC/PPT 계열은 호스트가 주입한
 * 서버 컨버터가 필요하며, 그런 경우 `supports()` 가 false를 돌려주고
 * 호출자가 기획 2.4 오류를 표시한다.
 */
export interface ConverterPort {
  supports(file: File): boolean
  convert(file: File, opts?: ConvertOptions): Promise<RasterPage[]>
}

/** 변환이 실패하는 이유. UI가 기획 2.4 메시지로 매핑한다. */
export type ConvertErrorCode =
  | 'unsupported-format'
  | 'file-too-large'
  | 'page-limit'
  | 'encrypted'
  | 'corrupt'
  | 'aborted'
  | 'worker-unavailable'

export class ConvertError extends Error {
  readonly code: ConvertErrorCode
  constructor(code: ConvertErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ConvertError'
    this.code = code
  }
}
