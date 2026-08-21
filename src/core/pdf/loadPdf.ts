/**
 * PDF 문서 로딩. 기획 2.4가 요구하는 실패 케이스들을 다룬다.
 */
import { getDocument, PasswordResponses } from 'pdfjs-dist'
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist'
import { ConvertError } from '../ports/ConverterPort'
import { ensurePdfWorker, pdfResourceParams } from './resources'

/**
 * 한 워크시트의 최대 페이지 수는 500이다 (기획 2.2).
 * `LIMITS.pagesPerDoc` 와 같은 값이며, 서버도 같은 수치를 검증한다.
 */
export const MAX_DOC_PAGES = 500

/** 파일 1개당 업로드 상한(바이트) (기획 2.2). */
export const MAX_FILE_BYTES = 500 * 1024 * 1024

/** 업로드 팝업이 받는 포맷 (기획 2.2). 클라이언트에서 처리하는 건 `pdf` 뿐이다. */
export const SUPPORTED_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx'] as const

/** 점 없는 소문자 확장자. 확장자가 없으면 `''`. */
export function fileExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i + 1).toLowerCase()
}

/**
 * 이 파일을 브라우저에서 변환할 수 있는지.
 *
 * MIME 타입과 확장자를 함께 본다. 드래그 앤 드롭이나 일부 OS 파일 선택기에서 온 파일은
 * `type` 이 비어 있다.
 */
export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || fileExtension(file.name) === 'pdf'
}

/**
 * 열린 문서와, 그 worker를 소유한 task.
 *
 * pdf.js v6에는 `PDFDocumentProxy.destroy()` 가 없다. worker 정리는 loading task를 통해
 * 하므로 호출자가 task를 들고 있어야 한다.
 */
export interface LoadedPdf {
  pdf: PDFDocumentProxy
  task: PDFDocumentLoadingTask
  /** 문서와 worker를 정리한다. 여러 번 호출해도 안전하다. */
  dispose: () => Promise<void>
}

/**
 * PDF를 열고, pdf.js 실패를 UI가 기획 2.4 메시지로 매핑할 수 있는 코드로 바꾼다.
 * 암호가 걸린 파일은 암호를 묻지 않고 그대로 보고한다. 기획에 암호 입력 흐름이 없다.
 */
/** pdf.js가 파일을 해석하는 방식을 바꾸는 옵션. */
export interface LoadPdfOptions {
  /**
   * 글리프 아웃라인을 그리는 대신 FontFace API로 임베드 폰트를 등록한다(pdf.js 기본값).
   *
   * 기본값으로 유지한다. 한국어 CID 폰트 페이지 실측에서 FontFace가 아웃라인 렌더보다 잉크가
   * 약간 *더* 많았다(비백색 픽셀 1.85% 대 1.75%). 즉 아웃라인 모드는 어떤 폰트에서 잘 렌더되는
   * 글리프를 놓칠 수 있다. `render()` 가 내부적으로 폰트 로딩을 기다리므로 캡처와 경합하지 않는다.
   */
  useFontFace?: boolean
  /**
   * 이 문서에 대해 설정된 CMap·표준 폰트 URL을 무시한다.
   *
   * 진단 전용이다. "텍스트가 사라지는" 실패를 의도적으로 재현해, 설정된 렌더와 설정되지 않은
   * 렌더를 나란히 비교할 수 있게 한다 (ARCHITECTURE §4.3 참고).
   */
  skipResources?: boolean
}

export async function loadPdf(file: File, opts: LoadPdfOptions = {}): Promise<LoadedPdf> {
  if (file.size > MAX_FILE_BYTES) {
    throw new ConvertError('file-too-large', `${file.name} exceeds the 500MB limit`)
  }

  ensurePdfWorker()

  const data = new Uint8Array(await file.arrayBuffer())
  const task = getDocument({
    data,
    ...(opts.skipResources ? { cMapPacked: true } : pdfResourceParams()),
    disableFontFace: opts.useFontFace === false,
  })

  // 핸들러가 없으면 pdf.js는 결코 오지 않을 암호를 영원히 기다린다.
  task.onPassword = (_updatePassword: (pw: string) => void, reason: number) => {
    throw new ConvertError(
      'encrypted',
      reason === PasswordResponses.INCORRECT_PASSWORD
        ? `${file.name} has an incorrect password`
        : `${file.name} is password protected`,
    )
  }

  const dispose = async () => {
    if (!task.destroyed) await task.destroy()
  }

  try {
    const pdf = await task.promise
    return { pdf, task, dispose }
  } catch (cause) {
    await dispose().catch(() => undefined)
    if (cause instanceof ConvertError) throw cause
    const name = (cause as { name?: string } | null)?.name
    if (name === 'PasswordException') {
      throw new ConvertError('encrypted', `${file.name} is password protected`, { cause })
    }
    throw new ConvertError('corrupt', `${file.name} could not be read`, { cause })
  }
}
