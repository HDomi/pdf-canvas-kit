/**
 * React 소비자 예제.
 *
 * `demo/` 와 다른 점이 하나뿐이지만 그것이 핵심이다. **별칭이 없다.** `@h_domi/pdf-canvas-kit` 을
 * `node_modules` 에서 `exports` 맵으로 해석하므로 빌드 산출물과 진입점 정의가 틀리면 여기서
 * 즉시 드러난다.
 *
 * ## 이 예제가 보여주는 것 셋
 *
 * | | 어디서 |
 * | --- | --- |
 * | 커스텀 객체를 portal 로 채운다 | `slots/` |
 * | **패키지 팝업을 호스트 모달로 대체한다** (D31) | `components/{Confirm,Upload}Dialog` |
 * | **패키지 스타일을 단일 클래스로 덮어쓴다** (`@layer`) | `theme.css` + [테마] 토글 |
 *
 * ## 편집기와 뷰어를 나란히 두지 않는다
 *
 * 편집기는 3분할이고 페이지 목록 + 인스펙터를 고정 폭으로 먹는다 (D15). 화면 절반에 넣으면
 * 캔버스가 남는 폭만 쓰게 되어 못 쓴다. 탭으로 전환하고 **둘 다 마운트해 둔다** — 걷어 내면
 * 편집기의 undo 스택이 날아가고 뷰어는 입력 중인 응답을 잃는다.
 */
import { useRef, useState } from 'react'
import { PDFCanvasEditor, PDFCanvasViewer, type EditorHandle } from '@h_domi/pdf-canvas-kit/react'
import {
  configurePdfResources,
  createPDFCanvasDoc,
  createPage,
  A4_PT,
  LIMITS,
  type ConfirmRequest,
  type ImportState,
  type PDFCanvasDoc,
  type PublicPDFCanvasDoc,
} from '@h_domi/pdf-canvas-kit'
import '@h_domi/pdf-canvas-kit/styles.css'
import './host.css'
import { OBJECT_TYPES } from './objectType'
import { AnswerBadge } from './slots/AnswerBadge'
import { AnswerFields } from './slots/AnswerFields'
import { AnswerInput } from './slots/AnswerInput'
import { ConfirmDialog } from './components/ConfirmDialog'
import { UploadDialog } from './components/UploadDialog'
import { DevBar } from './components/DevBar'
import { useThemeToggle } from './useThemeToggle'
import {
  BackIcon,
  RedoIcon,
  UndoIcon,
  ZoomInIcon,
  ZoomOutIcon,
  closeIconNode,
} from './components/Icons'

/*
 * pdf.js 는 CMap·표준 폰트·wasm 을 런타임에 URL 로 가져온다.
 *
 * ⚠️ `workerSrc` 만 주면 PDF 는 열리지만 **한국어 글자가 조용히 사라진다.** 자산 복사는
 * `scripts/dev-examples.mjs` 가 해 준다 — 실제 앱은 README 의 `postinstall` 을 쓴다.
 */
configurePdfResources({
  workerSrc: '/pdfjs/pdf.worker.mjs',
  cMapUrl: '/pdfjs/cmaps/',
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/',
  iccUrl: '/pdfjs/iccs/',
})

/*
 * 문구를 호스트가 정한다 (문구·아이콘은 prop 으로 받는다).
 *
 * 번역이 필요한 앱은 자기 i18n 에서 뽑아 넘긴다. 키는 `StringKey` 로 타입이 잡혀 오타가
 * 컴파일 에러가 된다. **최초 1회만 읽는다** — 언어를 런타임에 바꾸려면 컴포넌트를 다시
 * 마운트한다 (React 는 `key` 변경).
 */
const STRINGS = {
  // 글리프도 문구다. 캐럿만 다른 유니코드로 바꿔 본다
  'icon.caret': '⌄',
  // 실제 앱이 흔히 바꾸는 것들
  'toolbar.duplicate': '복사',
  'confirm.deletePage': '이 페이지의 객체가 함께 사라집니다. 계속할까요?',
  'inspector.empty': '캔버스에서 객체를 골라 주세요',
} as const

/**
 * vanilla 아이콘 (D32) — 노드를 직접 만든다.
 *
 * `renderIcon`(컴포넌트)보다 **먼저 이긴다.** 여기서는 `close` 만 이 경로로 넣어 우선순위를
 * 드러낸다 — 나머지는 `renderIcon` 이 처리한다.
 */
const ICONS = { close: closeIconNode }

/** ⚠️ `pages[0]` 만 세면 현재 페이지가 아닌 곳의 객체가 빠진다. */
function countObjects(doc: PDFCanvasDoc | null): number {
  return doc?.pages.reduce((n, page) => n + page.objects.length, 0) ?? 0
}

const initialDoc = createPDFCanvasDoc({ pages: [createPage({ size: A4_PT })] })

export function App() {
  const editor = useRef<EditorHandle>(null)
  const [doc, setDoc] = useState<PDFCanvasDoc | null>(null)
  const [publicDoc, setPublicDoc] = useState<PublicPDFCanvasDoc | null>(null)
  const [tab, setTab] = useState<'editor' | 'viewer'>('editor')
  const [note, setNote] = useState('')
  const [themeOn, toggleTheme] = useThemeToggle()

  /*
   * 다이얼로그를 호스트가 소유한다 (D31).
   *
   * `onRequestUpload` · `onRequestConfirm` 을 주면 편집기가 내장 팝업을 띄우지 않는다.
   * 패키지가 알아야 하는 것은 "이 파일" 과 "확인/취소" 뿐이다.
   */
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [importing, setImporting] = useState<ImportState | null>(null)

  const send = () => {
    // 검증 게이트. 실패하면 편집기가 문제 객체로 데려간다.
    if (!editor.current?.checkBeforeExport()) {
      setNote('검증 실패 — 편집기를 확인하세요')
      return
    }
    setPublicDoc(editor.current.toPublicDoc())
    setTab('viewer')
    setNote('')
  }

  return (
    <div className="ex-root">
      <DevBar>
        <strong>React 예제</strong>
        <span>
          객체 {countObjects(doc)} · 페이지 {doc?.pages.length ?? 0}/{LIMITS.pagesPerDoc}
        </span>
        <button onClick={() => setUploadOpen(true)}>문서 불러오기</button>
        <button onClick={send}>뷰어로 보내기</button>
        <button onClick={() => setTab('editor')} disabled={tab === 'editor'}>
          편집기
        </button>
        <button onClick={() => setTab('viewer')} disabled={tab === 'viewer'}>
          뷰어
        </button>
        {/* 이 토글이 @layer 오버라이드를 눈으로 확인하는 장치다 */}
        <button className={themeOn ? 'is-on' : ''} onClick={toggleTheme}>
          테마 {themeOn ? 'ON' : 'OFF'}
        </button>
        {note && <span className="ex-note">{note}</span>}
        {importing?.error && <span className="ex-err">{importing.error}</span>}
        <span className="ex-spacer">
          <a href="http://localhost:3102/">Vue 예제 →</a>
        </span>
      </DevBar>

      {confirm && (
        <ConfirmDialog
          request={confirm}
          onConfirm={() => {
            editor.current?.confirmPending()
            setConfirm(null)
          }}
          onCancel={() => {
            editor.current?.cancelPending()
            setConfirm(null)
          }}
        />
      )}

      {uploadOpen && (
        <UploadDialog
          state={importing}
          onPick={(file) => void editor.current?.importFile(file)}
          onCancel={() => editor.current?.cancelImport()}
          onClose={() => {
            setUploadOpen(false)
            setImporting(null)
          }}
        />
      )}

      <div className="ex-stack">
        <div className="ex-pane" hidden={tab !== 'editor'}>
          <PDFCanvasEditor
            ref={editor}
            initialDoc={initialDoc}
            objectTypes={OBJECT_TYPES}
            renderObject={{ 'example.shortAnswer': AnswerBadge }}
            renderInspector={{ 'example.shortAnswer': AnswerFields }}
            onChange={setDoc}
            strings={STRINGS}
            icons={ICONS}
            /*
             * 프레임워크 컴포넌트 경로 (D32). 아이콘 라이브러리를 그대로 쓸 수 있다.
             * `icons` 에 있는 `close` 는 여기 없어도 되고, 있어도 `icons` 가 이긴다.
             */
            renderIcon={{
              back: BackIcon,
              undo: UndoIcon,
              redo: RedoIcon,
              zoomIn: ZoomInIcon,
              zoomOut: ZoomOutIcon,
            }}
            onRequestUpload={() => setUploadOpen(true)}
            onRequestConfirm={setConfirm}
            onImportStateChange={setImporting}
            style={{ height: '100%' }}
          />
        </div>
        <div className="ex-pane" hidden={tab !== 'viewer'}>
          <PDFCanvasViewer
            doc={publicDoc}
            objectTypes={OBJECT_TYPES}
            renderObject={{ 'example.shortAnswer': AnswerInput }}
            /*
             * 응답을 호스트가 소유한다 (D29). 뷰어는 문서를 소유하지 않으므로 저장할 곳이
             * 없다 — 여기서 문서를 고쳐 다시 내려 준다. 브랜드는 spread 로 유지된다.
             */
            onChangeData={(objectId, next) =>
              setPublicDoc((prev) =>
                prev === null
                  ? prev
                  : {
                      ...prev,
                      pages: prev.pages.map((page) => ({
                        ...page,
                        objects: page.objects.map((o) =>
                          o.id === objectId && o.type === 'custom' ? { ...o, data: next } : o,
                        ),
                      })),
                    },
              )
            }
            style={{ height: '100%' }}
          />
        </div>
      </div>
    </div>
  )
}
