/**
 * React 소비자 예제 — 실제 설치 환경 (PLAN 20.22).
 *
 * `demo/` 와 다른 점이 하나뿐이지만 그것이 핵심이다. **별칭이 없다.**
 * `pdf-canvas-kit` 을 `node_modules` 에서 `exports` 맵으로 해석하므로, 빌드 산출물과 진입점
 * 정의가 틀리면 여기서 즉시 드러난다 — R10·R11 의 버그 두 개가 정확히 그 종류였다.
 *
 * ## 편집기와 뷰어를 나란히 두지 않는다
 *
 * 편집기는 3분할이고 페이지 목록 240px + 인스펙터 280px 를 고정으로 먹는다 (D15). 화면
 * 절반에 넣으면 캔버스가 남는 폭만 쓰게 되어 못 쓴다. 탭으로 전환하고 **둘 다 마운트해
 * 둔다** — 걷어 내면 편집기의 undo 스택이 날아가고 뷰어는 입력 중인 응답을 잃는다.
 */
import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  PDFCanvasEditor,
  PDFCanvasViewer,
  type CustomSlotProps,
  type EditorHandle,
} from 'pdf-canvas-kit/react'
import type { ConfirmRequest, ImportState } from 'pdf-canvas-kit'
import {
  configurePdfResources,
  createPDFCanvasDoc,
  createPage,
  defineObjectType,
  A4_PT,
  LIMITS,
  type PDFCanvasDoc,
  type PublicPDFCanvasDoc,
} from 'pdf-canvas-kit'
import 'pdf-canvas-kit/styles.css'

/*
 * pdf.js 는 CMap·표준 폰트·wasm 을 런타임에 URL 로 가져온다.
 *
 * ⚠️ `workerSrc` 만 주면 PDF 는 열리지만 **한국어 글자가 조용히 사라진다.** 자산 복사는
 * `scripts/dev-examples.mjs` 가 대신 해 준다 — 실제 앱에서는 README 의 `postinstall` 을 쓴다.
 */
configurePdfResources({
  workerSrc: '/pdfjs/pdf.worker.mjs',
  cMapUrl: '/pdfjs/cmaps/',
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/',
  iccUrl: '/pdfjs/iccs/',
})

/* --------------------------------------------------- 커스텀 객체 타입 -- */

interface Answer {
  /** 정답. 학생에게 가면 안 된다. */
  answers: string[]
  points: number
  /** 학생 응답. 편집 시점에는 없다. */
  response?: string
}

/** 뷰어가 보는 형태. `toPublic` 이 `answers` 를 지운 결과다. */
type PublicAnswer = Omit<Answer, 'answers'>

/*
 * 제네릭이 둘이다. 두 번째를 주지 않으면 `renderViewer`(여기서는 portal 슬롯)의 데이터가
 * `Answer` 로 보이고, 실제로는 없는 `answers` 를 타입이 있다고 말한다 (ARCHITECTURE §18.4).
 */
const shortAnswer = defineObjectType<Answer, PublicAnswer>({
  kind: 'example.shortAnswer',
  label: '단답형',
  defaultSize: { w: 160, h: 44 },
  minSize: { w: 80, h: 32 },
  defaultData: () => ({ answers: [], points: 1 }),
  // 기울어진 입력은 쓰기 어렵다.
  rotatable: false,
  validate: (d) => (d.answers.some((a) => a.trim()) ? null : ['정답을 입력하세요']),
  toPublic: ({ answers: _answers, ...rest }) => rest,
})

/** 편집기 캔버스 — 미리보기. 편집은 인스펙터에서 한다 (D26). */
function AnswerBadge({ data }: CustomSlotProps<Answer>) {
  const filled = data.answers.some((a) => a.trim())
  return (
    <div style={{ padding: '0 8px', fontSize: 11, lineHeight: '44px' }}>
      <b>{data.points}점</b>
      {!filled && <span style={{ color: '#b4342b', marginLeft: 6 }}>정답 미입력</span>}
    </div>
  )
}

/**
 * 편집기 인스펙터 — 교사가 정답·배점을 넣는다.
 *
 * portal 안이라 포커스 가드가 필요 없다. 배열을 늘리고 줄여도 React 가 노드를 유지한다
 * (vanilla 슬롯은 `render` 가 한 번만 불려 직접 DOM 을 다뤄야 한다 — PLAN 20.14).
 */
function AnswerFields({ data, onChange }: CustomSlotProps<Answer>) {
  return (
    <div>
      {data.answers.map((a, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <input
            className="pck-input"
            value={a}
            placeholder={`정답 ${i + 1}`}
            onChange={(e) => {
              const next = [...data.answers]
              next[i] = e.target.value
              onChange({ ...data, answers: next })
            }}
          />
          <button
            type="button"
            onClick={() => onChange({ ...data, answers: data.answers.filter((_, j) => j !== i) })}
          >
            −
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange({ ...data, answers: [...data.answers, ''] })}>
        + 정답 추가
      </button>
      <label style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
        배점{' '}
        <input
          className="pck-input pck-input--num"
          type="number"
          min={1}
          value={data.points}
          onChange={(e) => onChange({ ...data, points: Number(e.target.value) || 1 })}
        />
      </label>
    </div>
  )
}

/** 뷰어 — 학생이 답을 쓴다. 여기서는 콘텐츠가 포인터 이벤트를 받는다 (D29). */
function AnswerInput({ data, onChange }: CustomSlotProps<PublicAnswer>) {
  return (
    <input
      className="pck-input"
      style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}
      placeholder={`답을 입력하세요 (${data.points}점)`}
      value={data.response ?? ''}
      onChange={(e) => onChange({ ...data, response: e.target.value })}
    />
  )
}

/* ------------------------------------------------------------- 앱 -- */

/**
 * 문서 전체의 객체 수.
 *
 * ⚠️ `pages[0]` 만 세면 안 된다. 현재 페이지가 아닌 곳의 객체가 빠진다.
 */
function countObjects(doc: PDFCanvasDoc | null): number {
  return doc?.pages.reduce((n, page) => n + page.objects.length, 0) ?? 0
}

const initialDoc = createPDFCanvasDoc({ pages: [createPage({ size: A4_PT })] })

function App() {
  const editor = useRef<EditorHandle>(null)
  const [doc, setDoc] = useState<PDFCanvasDoc | null>(null)
  const [publicDoc, setPublicDoc] = useState<PublicPDFCanvasDoc | null>(null)
  const [tab, setTab] = useState<'editor' | 'viewer'>('editor')
  const [note, setNote] = useState('')

  /*
   * 다이얼로그를 호스트가 맡는다 (PLAN D31).
   *
   * `onRequestUpload` · `onRequestConfirm` 을 주면 편집기가 내장 팝업을 띄우지 않는다.
   * 여기서는 브라우저 기본 UI 로 대체했지만 실제 앱은 자기 디자인 시스템 모달을 쓴다 —
   * **패키지가 알아야 하는 것은 "확인/취소" 뿐이다.**
   */
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const [importing, setImporting] = useState<ImportState | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={bar}>
        <strong>React 예제</strong>
        <span>
          객체 {countObjects(doc)} · 페이지 {doc?.pages.length ?? 0}/{LIMITS.pagesPerDoc}
        </span>
        <button onClick={send}>뷰어로 보내기</button>
        <button onClick={() => setTab('editor')} disabled={tab === 'editor'}>
          편집기
        </button>
        <button onClick={() => setTab('viewer')} disabled={tab === 'viewer'}>
          뷰어
        </button>
        <span style={{ color: '#e0a' }}>{note}</span>
        {importing?.progress && (
          <span>
            불러오는 중 {Math.round(importing.progress.ratio * 100)}%
            {importing.progress.total
              ? ` (${importing.progress.page}/${importing.progress.total})`
              : ''}
          </span>
        )}
        {importing?.error && <span style={{ color: '#f66' }}>{importing.error}</span>}
        <a href="http://localhost:3102/" style={{ marginLeft: 'auto', color: '#9a9aa0' }}>
          Vue 예제 →
        </a>
      </div>
      {/* 호스트가 만든 확인 모달. 편집기는 이것의 존재를 모른다. */}
      {confirm && (
        <div style={sheet}>
          <div style={sheetBox}>
            <p style={{ margin: '0 0 12px' }}>{confirm.message}</p>
            <button
              onClick={() => {
                editor.current?.confirmPending()
                setConfirm(null)
              }}
              style={{ color: confirm.danger ? '#b4342b' : undefined }}
            >
              확인
            </button>
            <button
              onClick={() => {
                editor.current?.cancelPending()
                setConfirm(null)
              }}
            >
              취소
            </button>
          </div>
        </div>
      )}
      {/*
        업로드도 호스트 것이다. 파일을 고르면 handle.importFile 로 넘긴다 —
        진행률·오류는 onImportStateChange 로 돌아온다.
      */}
      <input
        ref={fileInput}
        type="file"
        accept=".pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void editor.current?.importFile(file)
          e.target.value = ''
        }}
      />
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div style={pane(tab === 'editor')}>
          <PDFCanvasEditor
            ref={editor}
            initialDoc={initialDoc}
            objectTypes={[shortAnswer]}
            renderObject={{ 'example.shortAnswer': AnswerBadge }}
            renderInspector={{ 'example.shortAnswer': AnswerFields }}
            onChange={setDoc}
            onRequestUpload={() => fileInput.current?.click()}
            onRequestConfirm={setConfirm}
            onImportStateChange={setImporting}
            style={{ height: '100%' }}
          />
        </div>
        <div style={pane(tab === 'viewer')}>
          <PDFCanvasViewer
            doc={publicDoc}
            objectTypes={[shortAnswer]}
            renderObject={{ 'example.shortAnswer': AnswerInput }}
            /*
             * 응답을 호스트가 소유한다 (D29). 뷰어는 문서를 소유하지 않으므로 저장할 곳이
             * 없다 — 여기서 문서를 고쳐 다시 내려 준다.
             */
            onChangeData={(objectId, next) =>
              setPublicDoc((prev) =>
                prev === null
                  ? prev
                  : /*
                     * 캐스트가 없다. 브랜드는 spread 로 파생한 객체에도 유지되므로
                     * 소비자가 응답을 반영한 문서를 그대로 다시 내려 줄 수 있다.
                     */
                    {
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

const bar: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  padding: '6px 12px',
  background: '#26262a',
  color: '#e8e8e4',
  fontSize: 12,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  flex: 'none',
}

/*
 * 탭은 `visibility` 로 숨긴다. `display: none` 은 뷰어의 폭 측정(ResizeObserver)을 죽인다
 * (ARCHITECTURE §18.3).
 */
/** 호스트 모달. 패키지 CSS 와 무관하다 — 편집기는 이 UI 를 모른다. */
const sheet: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 100,
  display: 'grid',
  placeItems: 'center',
  background: 'rgb(0 0 0 / 40%)',
}
const sheetBox: React.CSSProperties = {
  background: '#fff',
  padding: 20,
  borderRadius: 4,
  fontSize: 13,
}

const pane = (visible: boolean): React.CSSProperties => ({
  position: 'absolute',
  inset: 0,
  visibility: visible ? 'visible' : 'hidden',
})

// StrictMode 로 띄운다. destroy() 가 멱등이 아니면 편집기가 두 벌 남는다 (PLAN 20.5).
createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
