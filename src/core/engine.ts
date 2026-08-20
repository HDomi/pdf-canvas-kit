/**
 * 편집기 엔진. 문서 상태·히스토리·변환 파이프라인을 담고, 렌더링과 프레임워크는 없다 (PLAN 2.1).
 *
 * Vue 층이 이걸 하나 만들어 스토어를 reactivity에 브릿지하고 커맨드를 호출한다. 분리해 두면
 * 편집 규칙을 검증할 수 있고, 다른 렌더러가 추가돼도 재사용된다.
 *
 * 뷰 상태(배율·선택·현재 페이지)는 **여기 없다**. DOM 측정에 묶여 있으므로 렌더러 몫이다
 * (PLAN 6.6, 8.1).
 */
import { createId } from './util/id'
import { createBlobAssetPort } from './assets/blobAsset'
import { promoteBackgrounds } from './assets/promoteBackgrounds'
import { createDebouncedSaver, type DebouncedSaver } from './autosave/debouncedSaver'
import { touch, type Command } from './commands'
import { appendPages } from './commands/pages'
import { applyFileNameToTitle } from './commands/doc'
import { createPDFCanvasDoc } from './model/defaults'
import { toPublicDoc, type PublicPDFCanvasDoc } from './model/publicDoc'
import type { PageBackground, PDFCanvasDoc, PDFCanvasPage } from './model/types'
import { createPdfjsConverter } from './pdf/pdfjsConverter'
import type { AssetPort, ConverterPort, StoragePort } from './ports'
import { ConvertError, type ConvertProgress } from './ports/ConverterPort'
import { noopStoragePort } from './ports/StoragePort'
import type { SaveState } from './model/viewState'
import { createStore, type Store, type Unsubscribe } from './store/createStore'
import { createHistory, type History } from './store/history'

export interface EnginePorts {
  asset?: AssetPort
  converter?: ConverterPort
  storage?: StoragePort
}

export interface EngineOptions {
  doc?: PDFCanvasDoc | null
  ports?: EnginePorts
  /** undo 깊이. 기본값은 `EDITOR_DEFAULTS.historyLimit`. */
  historyLimit?: number
  /**
   * 자동저장을 켠다. StoragePort가 주입됐을 때만 의미가 있다.
   *
   * 기본값은 `storage` 포트가 있으면 true다. 저장할 곳이 없는데 배지를 "저장 중"으로 두면
   * 거짓말이 된다.
   */
  autosave?: boolean
  /** 저장 상태가 바뀔 때 호출된다. */
  onSaveStateChange?: (state: SaveState) => void
}

/** 진행 중인 import의 진행률. 유휴 상태면 null. */
export interface ImportProgress extends ConvertProgress {
  fileName: string
  /** `converting` 은 래스터화 단계, `storing` 은 AssetPort 영속화 단계. */
  phase: 'converting' | 'storing'
}

export interface ImportResult {
  pages: PDFCanvasPage[]
  /** 소요 시간(ms). spike 화면과 로깅에 쓴다. */
  elapsedMs: number
}

export interface PDFCanvasEngine {
  readonly doc: Store<PDFCanvasDoc>
  readonly history: History
  /** 마지막 저장 성공 이후 문서가 바뀌었으면 true. */
  isDirty(): boolean
  markSaved(): void

  /** 현재 저장 상태. StoragePort가 없으면 항상 `disabled`. */
  saveState(): SaveState
  /**
   * 대기 중인 저장을 즉시 실행한다.
   *
   * `beforeunload` 와 페이지 숨김에서 호출한다 (PLAN 12).
   */
  flushSave(): Promise<void>
  /**
   * blob 배경을 업로드해 저장 가능한 문서로 만든다 (PLAN 4.1).
   *
   * AssetPort가 `remote`/`inline` 을 돌려주는 구현일 때만 의미가 있다. 기본 blob port에서는
   * 아무것도 바뀌지 않는다.
   */
  promoteBackgrounds(): Promise<boolean>

  /** 커맨드를 적용하고, 변경이 있었으면 히스토리에 기록한다. */
  run(label: string, command: Command): boolean
  undo(): boolean
  redo(): boolean

  /**
   * 파일을 변환하고 결과 페이지를 뒤에 붙인다.
   *
   * UI가 설명해야 하는 실패(포맷·용량·페이지 한도·손상 파일)는 {@link ConvertError} 로 던지므로,
   * 호출자가 `error.code` 를 메시지로 매핑한다.
   */
  importFile(file: File, onProgress?: (p: ImportProgress) => void): Promise<ImportResult>

  /** 진행 중인 import를 취소한다. 유휴 상태에서 호출해도 안전하다. */
  cancelImport(): void

  /** 정답을 제거한 문서. 뷰어 프리뷰용 (PLAN D14). */
  toPublicDoc(): PublicPDFCanvasDoc

  /** blob URL을 해제하고 대기 중인 작업을 중단한다. */
  destroy(): void

  subscribe(fn: (doc: PDFCanvasDoc) => void): Unsubscribe
}

export function createPDFCanvasEngine(options: EngineOptions = {}): PDFCanvasEngine {
  const doc = createStore<PDFCanvasDoc>(options.doc ?? createPDFCanvasDoc())
  const history = createHistory(
    options.historyLimit === undefined ? {} : { limit: options.historyLimit },
  )

  // 기본값 덕분에 설정 없이도 편집기가 동작한다. 이미지는 메모리에 있고 아무것도 저장되지 않는다
  // (PLAN 9).
  const asset = options.ports?.asset ?? createBlobAssetPort()
  const converter = options.ports?.converter ?? createPdfjsConverter()
  const storage = options.ports?.storage ?? noopStoragePort()

  let savedSnapshot: PDFCanvasDoc = doc.get()
  let controller: AbortController | null = null

  /**
   * 자동저장을 실제로 돌릴지.
   *
   * StoragePort를 주입하지 않았으면 저장할 곳이 없으므로 끈다. 배지도 `disabled` 로 남는다.
   */
  const autosaveEnabled = options.autosave ?? options.ports?.storage !== undefined

  let saveState: SaveState = autosaveEnabled ? 'saved' : 'disabled'

  const saver: DebouncedSaver | null = autosaveEnabled
    ? createDebouncedSaver({
        save: async (snapshot) => {
          await storage.save(snapshot)
          // 저장 성공 시점의 문서를 기준으로 dirty를 판단한다.
          savedSnapshot = snapshot
        },
        onStateChange: (state) => {
          saveState = state
          options.onSaveStateChange?.(state)
        },
      })
    : null

  // 문서가 바뀔 때마다 저장을 예약한다. 커맨드마다 개별 처리하지 않아도 되는 이유가 이것이다.
  if (saver) {
    doc.subscribe((next) => saver.schedule(next))
  }

  /**
   * 커맨드를 적용한다. 새 문서를 발행하기 *전에* 히스토리를 기록한다.
   *
   * 순서가 중요하다. `doc.set` 은 구독자를 동기적으로 호출하고, 그 구독자가
   * `history.canUndo()` 를 읽는다. 뒤에 push하면 관계없는 다음 변경이 올 때까지
   * undo 버튼이 비활성으로 남는다.
   */
  function run(label: string, command: Command): boolean {
    const before = doc.get()
    const after = command(before)
    if (!after || after === before) return false
    history.push({ label, before, after })
    doc.set(after)
    return true
  }

  return {
    doc,
    history,

    isDirty: () => doc.get() !== savedSnapshot,
    markSaved() {
      savedSnapshot = doc.get()
    },

    saveState: () => saveState,

    flushSave: () => saver?.flush() ?? Promise.resolve(),

    async promoteBackgrounds() {
      const before = doc.get()
      const after = await promoteBackgrounds(before, asset)
      if (after === before) return false
      // 승격은 사용자 편집이 아니므로 히스토리에 남기지 않는다. undo가 업로드를 되돌릴 수는 없다.
      doc.set(after)
      return true
    },

    run,

    undo() {
      const restored = history.undo()
      if (!restored) return false
      doc.set(restored)
      return true
    },

    redo() {
      const restored = history.redo()
      if (!restored) return false
      doc.set(restored)
      return true
    },

    async importFile(file, onProgress) {
      if (!converter.supports(file)) {
        // "서버에서는 지원 가능"과 "애초에 불가"를 구분한다.
        throw new ConvertError(
          'unsupported-format',
          `${file.name} needs a server-side converter or is not a supported format`,
        )
      }

      controller?.abort()
      controller = new AbortController()
      const startedAt = performance.now()

      try {
        const raster = await converter.convert(file, {
          signal: controller.signal,
          onProgress: (p) => onProgress?.({ ...p, fileName: file.name, phase: 'converting' }),
        })

        const pages: PDFCanvasPage[] = []
        for (const [i, r] of raster.entries()) {
          const id = createId()
          const stored = await asset.persist(r.blob, {
            pageId: id,
            fileName: file.name,
            mime: r.blob.type,
          })
          const background: PageBackground = {
            kind: 'image',
            url: stored.url,
            origin: stored.origin,
            naturalWidth: r.naturalWidth,
            naturalHeight: r.naturalHeight,
            renderScale: r.renderScale,
          }
          if (stored.assetId !== undefined) background.assetId = stored.assetId
          pages.push({
            id,
            size: r.size,
            background,
            source: {
              fileId: file.name,
              fileName: file.name,
              pageIndex: r.pageIndex,
              rotation: r.rotation,
            },
            objects: [],
          })
          onProgress?.({
            ratio: (i + 1) / raster.length,
            page: i + 1,
            total: raster.length,
            fileName: file.name,
            phase: 'storing',
          })
        }

        // import 전체를 히스토리 한 항목으로 만든다. 페이지 추가와 워크시트 이름 변경은
        // 사용자에게 하나의 동작이므로 undo가 둘 다 되돌려야 한다.
        const before = doc.get()
        let next = appendPages(pages)(before) ?? before
        next = applyFileNameToTitle(file.name)(next) ?? next
        if (next !== before) {
          const after = touch(next)
          // run() 과 같은 이유로 히스토리를 먼저 기록한다. doc.set() 의 구독자가
          // canUndo() 를 동기적으로 읽는다.
          history.push({ label: `import ${file.name}`, before, after })
          doc.set(after)
        }

        return { pages, elapsedMs: performance.now() - startedAt }
      } finally {
        controller = null
      }
    },

    cancelImport() {
      controller?.abort()
      controller = null
    },

    toPublicDoc: () => toPublicDoc(doc.get()),

    destroy() {
      saver?.cancel()
      controller?.abort()
      controller = null
      // 우리가 만든 기본 port만 일괄 해제할 수 있다. 호스트가 준 port는 수명을 스스로 관리한다.
      if (!options.ports?.asset && 'revokeAll' in asset) {
        ;(asset as { revokeAll(): void }).revokeAll()
      }
      history.clear()
    },

    subscribe: (fn) => doc.subscribe((value) => fn(value)),
  }
}
