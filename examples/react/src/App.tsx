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
import { CodeHint } from './components/CodeHint'
import { useThemeToggle } from './useThemeToggle'
import { demoHomeUrl, siblingExampleUrl } from './links'
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
/*
 * 자산 경로의 기준.
 *
 * `import.meta.env.BASE_URL` 은 vite 가 빌드 시점의 `base` 로 치환한다 — dev 는 `/`,
 * GitHub Pages 는 `/pdf-canvas-kit/react/` 다. 절대 경로로 하드코딩하면 Pages 에서 전부
 * 404 가 되고, 증상이 "PDF 는 열리는데 한글만 사라진다" 라 원인을 찾기 어렵다.
 */
const base = import.meta.env.BASE_URL

configurePdfResources({
  workerSrc: `${base}pdfjs/pdf.worker.mjs`,
  // ⚠️ 아래 넷을 빠뜨리면 한국어 PDF 에서 글자가 조용히 사라진다
  cMapUrl: `${base}pdfjs/cmaps/`,
  standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
  wasmUrl: `${base}pdfjs/wasm/`,
  iccUrl: `${base}pdfjs/iccs/`,
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
      <div className="hint-wrap is-inline">
        <CodeHint
          corner="br"
          label="호스트 UI · handle"
          note="devbar 는 패키지와 무관한 내 UI 다. 편집기 조작은 ref 로 받은 handle 을 부른다."
          code={`const editor = useRef<EditorHandle>(null)

// 검증 게이트 — 실패하면 편집기가 문제 객체로 데려간다
if (!editor.current?.checkBeforeExport()) return
setPublicDoc(editor.current.toPublicDoc())   // 비밀 제거된 스냅샷

// 그 밖에 쓸 수 있는 것
editor.current?.importFile(file)
editor.current?.confirmPending()   // 호스트 모달의 [확인]
editor.current?.cancelPending()
editor.current?.requestUpload()
editor.current?.requestRemovePage(0)`}
        >
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
            <CodeHint
              corner="br"
              label="@layer 오버라이드"
              note="theme.css 를 <style> 로 붙였다 뗀다. 단일 클래스 선택자인데 패키지 규칙을 이긴다 — editor.css 전체가 @layer 안에 있기 때문이다."
              code={`/* theme.css — 특이도를 올리지 않았고 !important 도 없다 */
.pck-toolbar { justify-content: center; }   /* 배치는 토큰으로 못 한다 */
.pck-panel-head { text-transform: none; }
.pck-stage {
  background-image: linear-gradient(...);   /* 두 값이 함께 필요하다 */
  background-size: 24px 24px;
}

/* 토큰만 바꾸는 것으로 끝나는 경우가 대부분이다 */
.pck-editor { --pck-accent: #6d4aff; --pck-pagelist-width: 190px; }

/* 토글: import 하면 끌 수 없어 ?raw 로 읽어 <style> 로 넣는다 */
import themeCss from './theme.css?raw'`}
            >
              <button className={themeOn ? 'is-on' : ''} onClick={toggleTheme}>
                테마 {themeOn ? 'ON' : 'OFF'}
              </button>
            </CodeHint>
            <CodeHint
              corner="br"
              label="커스텀 객체 슬롯"
              note="패키지는 기본 틀(사각형·리사이즈·색)만 그린다. 그 안을 내 컴포넌트가 채운다. portal 이라 배열 증감·훅이 그대로 동작하고 포커스 가드도 필요 없다."
              code={`// 1. 타입 선언 — 프레임워크 무관. 제네릭이 둘인 이유는 toPublic 때문이다
const shortAnswer = defineObjectType<Answer, PublicAnswer>({
  kind: 'example.shortAnswer',   // Editor ↔ Viewer 계약
  label: '단답형',                // 툴바 버튼 이름
  defaultSize: { w: 160, h: 44 },
  defaultData: () => ({ answers: [], points: 1 }),
  validate: (d) => (d.answers.some((a) => a.trim()) ? null : ['정답을 입력하세요']),
  toPublic: ({ answers: _a, ...rest }) => rest,   // 뷰어에 나가면 안 되는 것
})

// 2. 컴포넌트를 붙인다
renderObject={{ 'example.shortAnswer': AnswerBadge }}       // 캔버스 — 미리보기
renderInspector={{ 'example.shortAnswer': AnswerFields }}   // 인스펙터 — 편집
// 뷰어에서는 같은 renderObject 자리에 응답 폼을 넣는다

// 3. 슬롯이 받는 prop
function AnswerFields({ objectId, data, onChange }: CustomSlotProps<Answer>) { … }`}
            >
              <span className="hint-chip">슬롯</span>
            </CodeHint>
            <CodeHint
              corner="br"
              label="다이얼로그 위임"
              note="콜백을 주는 것만으로 내장 팝업이 꺼진다. 별도 플래그가 없다."
              code={`<PDFCanvasEditor
  onRequestUpload={() => setUploadOpen(true)}    // 내장 업로드 팝업이 꺼진다
  onRequestConfirm={(req) => setConfirm(req)}    // { message, danger }
  onImportStateChange={(st) => setImporting(st)} // { progress, error }
/>

// 내 모달에서 결과를 알려준다
editor.current?.importFile(file)      // 파일을 골랐을 때
editor.current?.cancelImport()        // 변환 취소
editor.current?.confirmPending()      // [확인]
editor.current?.cancelPending()       // [취소]·닫기

// ⚠️ 둘 중 하나를 반드시 부른다. 안 부르면 그 동작은 대기 상태로 남는다`}
            >
              <span className="hint-chip">다이얼로그</span>
            </CodeHint>
            <CodeHint
              corner="br"
              label="문구 · 아이콘"
              note="아이콘은 세 경로가 있고 icons → renderIcon → 글리프 순으로 이긴다."
              code={`<PDFCanvasEditor
  // 문구 — 번역. 키는 StringKey 로 타입이 잡혀 오타가 컴파일 에러다
  strings={{ 'toolbar.duplicate': '복사', 'icon.caret': '⌄' }}
  // 아이콘 1) vanilla 노드 — 가장 먼저 이긴다. 매번 새 노드를 반환해야 한다
  icons={{ close: closeIconNode }}
  // 아이콘 2) 프레임워크 컴포넌트
  renderIcon={{ undo: UndoIcon, redo: RedoIcon, zoomIn: ZoomInIcon }}
/>

/* 아이콘 3) CSS — 버튼에 data-icon 이 붙어 있다 */
.pck-icon-btn[data-icon='undo'] {
  font-size: 0;
  background: url(undo.svg) center / 16px no-repeat;
}`}
            >
              <span className="hint-chip">문구·아이콘</span>
            </CodeHint>
            <CodeHint
              corner="br"
              label="도형 · 글꼴"
              note="도형은 11종이고 정점 계산이 core 에 있다. 글꼴은 목록만 패키지가 갖고 웹폰트 파일은 호스트가 불러온다 — 이 예제는 index.html 에서 Google Fonts 를 받는다."
              code={`import { configureFonts, polygonPoints } from '@h_domi/pdf-canvas-kit'

/* 앱이 실제로 불러오는 폰트만 남긴다. 병합이 아니라 교체다 */
configureFonts([
  { stack: '"Noto Sans KR", sans-serif', label: '본문' },
  { stack: '"Nanum Myeongjo", serif', label: '제목' },
  { stack: 'monospace', label: '코드' },
])
configureFonts([])   // 빈 배열 = 인스펙터에서 글꼴 항목이 사라진다

/* 다각형 정점은 순수 함수로 열려 있다. 단위는 pt — 배율을 곱하지 않는다 */
polygonPoints('diamond', 100, 60)      // '50,0 100,30 50,60 0,30'

/* 선택기 버튼에 data-shape 가 있어 CSS 로 아이콘화할 수 있다 */
.pck-segmented button[data-shape='star'] {
  font-size: 0;
  background: url(/icons/star.svg) center / 16px no-repeat;
}`}
            >
              <span className="hint-chip">도형·글꼴</span>
            </CodeHint>
            {note && <span className="ex-note">{note}</span>}
            {importing?.error && <span className="ex-err">{importing.error}</span>}
            <span className="ex-spacer">
              <a href={demoHomeUrl()}>← 데모</a> <a href={siblingExampleUrl('vue')}>Vue 예제 →</a>
            </span>
          </DevBar>
        </CodeHint>
      </div>

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
          <CodeHint
            corner="tr"
            label="PDFCanvasEditor"
            note="편집기 전체가 패키지가 그린 DOM 이다. 커스텀 객체 자리에만 내 컴포넌트가 portal 로 들어간다."
            code={`import { PDFCanvasEditor } from '@h_domi/pdf-canvas-kit/react'

<PDFCanvasEditor
  ref={editor}
  initialDoc={initialDoc}      // 최초 1회만 읽는다. 교체는 key 로
  objectTypes={OBJECT_TYPES}   // 툴바가 이 목록에서 나온다
  renderObject={{ 'example.shortAnswer': AnswerBadge }}
  renderInspector={{ 'example.shortAnswer': AnswerFields }}
  onChange={setDoc}
  strings={STRINGS}            // 문구 오버라이드
  icons={ICONS}                // vanilla SVG (renderIcon 보다 먼저 이긴다)
  renderIcon={RENDER_ICON}     // 프레임워크 컴포넌트
  onRequestUpload={...}        // 주면 내장 팝업이 꺼진다
  onRequestConfirm={setConfirm}
  onImportStateChange={setImporting}
  style={{ height: '100%' }}   // 컨테이너에 높이가 필요하다
/>`}
          >
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
          </CodeHint>
        </div>
        <div className="ex-pane" hidden={tab !== 'viewer'}>
          <CodeHint
            corner="tr"
            label="PDFCanvasViewer"
            note="doc 이 controlled 다. 응답은 호스트가 소유하고 onChangeData 로 올라온다."
            code={`import { PDFCanvasViewer } from '@h_domi/pdf-canvas-kit/react'

<PDFCanvasViewer
  doc={publicDoc}              // controlled — 편집기와 반대다
  objectTypes={OBJECT_TYPES}   // 편집기와 같은 배열. kind 가 계약이다
  renderObject={{ 'example.shortAnswer': AnswerInput }}
  onChangeData={(objectId, next) =>
    // 뷰어는 문서를 소유하지 않는다. 호스트가 고쳐 다시 내려 준다
    setPublicDoc((prev) => prev && patch(prev, objectId, next))
  }
/>`}
          >
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
          </CodeHint>
        </div>
      </div>
    </div>
  )
}
