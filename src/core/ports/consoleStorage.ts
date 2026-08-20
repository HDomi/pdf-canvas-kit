/**
 * 문서를 콘솔에 출력하는 StoragePort (PLAN Q10 잠정).
 *
 * 실제 서버 저장이 아직 없는 동안의 자리다. 자동저장 파이프라인은 그대로 돌아가므로,
 * 저장 주기·상태 배지·재시도 동작을 실제와 같은 조건에서 확인할 수 있다.
 * 나중에 진짜 `StoragePort` 로 바꾸면 이 파일만 교체된다.
 *
 * ## blob 배경 처리
 *
 * `serializeDoc` 은 blob 배경을 거부한다(PLAN 4.1). 여기서도 그 규칙을 우회하지 않는다 —
 * 대신 배경 URL을 요약한 **읽기용 사본**을 출력한다. 콘솔에 6.8MB base64가 찍히면 아무도 읽을 수
 * 없고, 그게 실제로 저장될 형태라고 오해할 여지도 생긴다.
 */
import { findBlobBackgrounds, isSerializable } from '../model/serialize'
import type { PDFCanvasDoc } from '../model/types'
import type { StoragePort } from './StoragePort'

export interface ConsoleStorageOptions {
  /** 로그 접두사. 여러 편집기를 동시에 띄울 때 구분한다. */
  label?: string
  /**
   * 배경 URL을 줄이지 않고 그대로 출력한다.
   *
   * base64 data URL이면 한 줄이 수백 KB가 되어 콘솔이 사실상 멈춘다. 기본은 false이고,
   * 저장 페이로드를 그대로 확인해야 할 때만 켠다.
   */
  verbose?: boolean
}

/** 사람이 읽을 수 있도록 배경 URL을 줄인 사본. 저장 페이로드가 아니다. */
function describe(doc: PDFCanvasDoc, verbose: boolean): unknown {
  return {
    ...doc,
    pages: doc.pages.map((p) => ({
      ...p,
      background:
        p.background.kind === 'image' && !verbose
          ? {
              ...p.background,
              url: `${p.background.url.slice(0, 48)}… (${p.background.url.length} chars)`,
            }
          : p.background,
    })),
  }
}

export function createConsoleStoragePort(options: ConsoleStorageOptions = {}): StoragePort {
  const label = options.label ?? '[pdf-canvas-kit]'
  const verbose = options.verbose ?? false

  return {
    save(doc) {
      const summary = {
        title: doc.title,
        pages: doc.pages.length,
        objects: doc.pages.reduce((n, p) => n + p.objects.length, 0),
        updatedAt: doc.updatedAt,
        serializable: isSerializable(doc),
      }

      /*
       * 문서 전체는 `console.debug` 로 낸다.
       *
       * 크롬 콘솔의 기본 필터가 debug(Verbose) 레벨을 숨기므로, 자동저장이 5초마다 돌아도 평소
       * 콘솔을 어지럽히지 않는다. 확인이 필요할 때 Verbose를 켜면 전체 구조가 보인다.
       * 요약과 경고는 평소에도 보여야 하므로 각각 log/warn 으로 남긴다.
       */
      // eslint-disable-next-line no-console
      console.groupCollapsed(
        `${label} save · ${summary.pages}p · ${summary.objects} objects · ${summary.title}`,
      )
      // eslint-disable-next-line no-console
      console.log('summary', summary)
      if (!summary.serializable) {
        console.warn(
          `${label} ${findBlobBackgrounds(doc).length} page(s) still hold blob backgrounds — ` +
            'promoteBackgrounds(doc, assetPort) is required before real persistence (PLAN 4.1)',
        )
      }
      // eslint-disable-next-line no-console
      console.debug('document', describe(doc, verbose))
      // eslint-disable-next-line no-console
      console.debug('json', JSON.stringify(describe(doc, verbose)))
      // eslint-disable-next-line no-console
      console.groupEnd()

      return Promise.resolve()
    },
  }
}
