/**
 * React 소비 예제 (PLAN 20.17).
 *
 * 이게 소비자가 실제로 쓰는 모습이다. 편집기 자체는 vanilla DOM 이고, 커스텀 객체의 내용만
 * React 컴포넌트가 채운다 (`createPortal`).
 *
 * **vanilla 슬롯과 비교해 보라** (`demo/editor/objectTypes.ts`). 거기서는 `render` 가 한 번만
 * 불리는 계약 때문에 `onUpdate` 로 DOM 을 직접 갱신하고 보기 칸을 고정 3개로 뒀다.
 * 여기서는 그냥 `useState` 없이 prop 만 쓰고 `map` 으로 배열을 그린다 — 추가·삭제가 자유롭다.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  clearPrototypeSave,
  configurePdfResources,
  createConsoleStoragePort,
  defineObjectType,
  loadPrototype,
  type PDFCanvasDoc,
} from 'pdf-canvas-kit'
import { PDFCanvasEditor, type CustomSlotProps, type EditorHandle } from 'pdf-canvas-kit/react'
import 'pdf-canvas-kit/styles.css'
import { useCallback, useRef, useState } from 'react'

configurePdfResources({
  workerSrc: '/pdfjs/pdf.worker.mjs',
  cMapUrl: '/pdfjs/cmaps/',
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/',
  iccUrl: '/pdfjs/iccs/',
})

const storage = createConsoleStoragePort({ label: '[react-demo]' })

/* --------------------------------------------------- 커스텀 객체 타입 -- */

interface ChoiceData {
  choices: string[]
  correct: number
}

/**
 * 타입 정의에 렌더가 없다.
 *
 * `render` · `renderInspector` 는 vanilla 경로용이다. 프레임워크 래퍼는 그 슬롯을 주지 않고
 * 컨테이너에 portal 한다 (PLAN D25) — 그래서 여기는 데이터 계약만 담는다.
 */
const choice = defineObjectType<ChoiceData>({
  kind: 'demo.choice',
  label: '선택형',
  defaultSize: { w: 200, h: 44 },
  minSize: { w: 80, h: 32 },
  defaultData: () => ({ choices: ['', ''], correct: 0 }),
  rotatable: false,
  validate: (d) => {
    const filled = d.choices.filter((c) => c.trim())
    if (filled.length < 2) return ['보기를 2개 이상 입력하세요']
    if (!d.choices[d.correct]?.trim()) return ['정답 보기를 고르세요']
    return null
  },
  toPublic: ({ correct: _correct, ...rest }) => rest,
})

/** 캔버스 안. 기본 틀은 패키지가 그리고 이 컴포넌트가 안을 채운다. */
function ChoiceCanvas({ data }: CustomSlotProps<ChoiceData>) {
  const filled = data.choices.filter((c) => c.trim())
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '100%',
        padding: '0 8px',
        fontSize: 11,
        color: filled.length >= 2 ? 'inherit' : '#b4342b',
      }}
    >
      <span>{filled.length >= 2 ? `${filled.length}개 보기` : '보기 미완성'}</span>
      <span aria-hidden>▾</span>
    </div>
  )
}

/**
 * 인스펙터. **여기가 vanilla 슬롯과 갈리는 지점이다.**
 *
 * 보기 개수가 동적이다 — `map` 으로 그리고 버튼으로 추가·삭제한다. vanilla 경로에서는
 * `render` 가 한 번만 불리므로 DOM 을 손으로 추가·제거해야 했다 (PLAN 20.15).
 *
 * 포커스 가드도 필요 없다. React 가 노드를 재사용하므로 `document.activeElement` 를 볼 일이
 * 없다 (PLAN 20.14 의 문제가 여기서는 발생하지 않는다).
 */
function ChoiceInspector({ data, onChange }: CustomSlotProps<ChoiceData>) {
  const set = (i: number, value: string) => {
    const choices = [...data.choices]
    choices[i] = value
    onChange({ ...data, choices })
  }

  return (
    <section className="pck-panel-section">
      <h3 className="pck-field-label">보기</h3>

      {data.choices.map((c, i) => (
        <div className="pck-row" key={i}>
          <input
            className="pck-check"
            type="radio"
            name="react-choice-correct"
            aria-label={`정답 ${i + 1}`}
            checked={data.correct === i}
            onChange={() => onChange({ ...data, correct: i })}
          />
          <input
            className="pck-input"
            value={c}
            placeholder={`보기 ${i + 1}`}
            onChange={(e) => set(i, e.target.value)}
          />
          <button
            type="button"
            className="pck-row-btn"
            aria-label="remove"
            disabled={data.choices.length <= 2}
            onClick={() => {
              const choices = data.choices.filter((_, k) => k !== i)
              onChange({
                choices,
                // 정답 인덱스가 밀리지 않게 보정한다.
                correct:
                  data.correct > i ? data.correct - 1 : Math.min(data.correct, choices.length - 1),
              })
            }}
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        className="pck-dashed-btn pck-dashed-btn--sm"
        disabled={data.choices.length >= 5}
        onClick={() => onChange({ ...data, choices: [...data.choices, ''] })}
      >
        + 보기 추가
      </button>
    </section>
  )
}

/* ------------------------------------------------------------------ 앱 -- */

const FIXTURES = [
  ['a4-3page.pdf', 'A4 3p'],
  ['korean.pdf', '한글'],
] as const

function App() {
  const [status, setStatus] = useState('픽스처를 눌러 불러온다.')
  const [seed, setSeed] = useState(0)
  const [loaded, setLoaded] = useState<PDFCanvasDoc | null>(null)
  const editor = useRef<EditorHandle>(null)

  const loadFixture = useCallback(async (name: string) => {
    setStatus(`${name} 불러오는 중…`)
    try {
      const res = await fetch(`/fixtures/${name}`)
      if (!res.ok) throw new Error(`${res.status} — npm run fixtures 를 먼저 실행한다`)
      const file = new File([await res.blob()], name, { type: 'application/pdf' })
      // 편집기 안의 업로드 팝업과 같은 경로다.
      await editor.current?.importFile(file)
    } catch (err) {
      setStatus(`실패: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  return (
    <>
      <div className="devbar">
        <strong>react</strong>
        {FIXTURES.map(([file, label]) => (
          <button key={file} type="button" onClick={() => void loadFixture(file)}>
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            const doc = loadPrototype()
            if (!doc) {
              setStatus('저장된 데이터가 없다. /editor/ 에서 먼저 저장한다.')
              return
            }
            setLoaded(doc)
            // initialDoc 은 최초 1회만 읽힌다 — key 를 바꿔 리마운트한다 (PLAN 20.8).
            setSeed((n) => n + 1)
            setStatus(`불러옴 · ${doc.pages.length} 페이지`)
          }}
        >
          불러오기
        </button>
        <button
          type="button"
          onClick={() => {
            clearPrototypeSave()
            setStatus('저장 삭제됨.')
          }}
        >
          저장 삭제
        </button>
        <button type="button" onClick={() => editor.current?.fitPage()}>
          페이지 맞춤
        </button>
        <span style={{ marginLeft: 'auto' }}>{status}</span>
      </div>

      <div className="editor-host">
        <PDFCanvasEditor
          key={seed}
          ref={editor}
          initialDoc={loaded}
          ports={{ storage }}
          objectTypes={[choice]}
          renderObject={{ 'demo.choice': ChoiceCanvas }}
          renderInspector={{ 'demo.choice': ChoiceInspector }}
          onChange={(doc) => setStatus(`${doc.pages.length} 페이지 · "${doc.title}"`)}
          style={{ height: '100%' }}
        />
      </div>
    </>
  )
}

const host = document.getElementById('app')
if (!host) throw new Error('[react-demo] #app not found')

/*
 * StrictMode 로 띄운다.
 *
 * 개발 모드에서 effect 가 두 번 돌아 마운트→언마운트→마운트가 일어난다. facade 의
 * `destroy()` 가 멱등이 아니거나 정리가 새면 여기서 바로 드러난다 (PLAN 20.5).
 */
createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
