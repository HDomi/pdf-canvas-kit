/**
 * 코드 힌트 — 감싼 UI 가 **어떻게 구현됐는지** 보여준다.
 *
 * 이 예제의 목적은 "동작한다" 가 아니라 "이렇게 쓴다" 를 보이는 것이다. 화면과 코드가 떨어져
 * 있으면 독자가 둘을 스스로 연결해야 하는데, 붙여 놓으면 그 일이 사라진다.
 *
 * ## 왜 hover 가 아니라 클릭인가
 *
 * hover 로 열면 편집기를 조작하는 동안 팝오버가 계속 튀어나와 방해한다. 배지를 눌러 열고
 * 다시 눌러 닫는다 — 읽고 싶을 때만 나온다.
 *
 * ## ⚠️ 패키지가 그리는 DOM 에는 붙일 수 없다
 *
 * 편집기 내부(툴바·인스펙터·캔버스)는 패키지가 만든다. 감쌀 수 있는 것은 **호스트가 만든
 * 부분** 뿐이다 — devbar, 모달, 슬롯 컴포넌트. 편집기 자체를 설명할 때는 `<CodeHint>` 로
 * 편집기를 감싸 왼쪽 위에 배지를 띄운다.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

export interface CodeHintProps {
  /** 배지에 뜨는 이름. 무엇을 설명하는지 */
  label: string
  /** 한 줄 설명. 코드보다 먼저 읽힌다 */
  note?: string
  /** 보여줄 코드. 앞쪽 공백은 자동으로 정리된다 */
  code: string
  /** 배지 위치. 감싼 요소의 어느 모서리에 붙일지 */
  corner?: 'tl' | 'tr' | 'bl' | 'br'
  children: ReactNode
}

/**
 * 템플릿 리터럴의 들여쓰기를 벗긴다.
 *
 * JSX 안에서 코드를 쓰면 파일의 들여쓰기가 그대로 들어온다. 가장 얕은 줄을 기준으로 깎아
 * 원래 모양을 되살린다 — 빈 줄은 기준에서 뺀다(들여쓰기가 0 이라 전부 무효가 된다).
 */
function dedent(src: string): string {
  const lines = src.replace(/^\n/, '').replace(/\s+$/, '').split('\n')
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length)
  const cut = indents.length ? Math.min(...indents) : 0
  return lines.map((l) => l.slice(cut)).join('\n')
}

export function CodeHint({ label, note, code, corner = 'tl', children }: CodeHintProps) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const id = useId()

  // 열려 있을 때 바깥을 누르거나 ESC 를 누르면 닫는다.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    // capture 로 받는다 — 편집기가 pointerdown 에서 preventDefault 를 부르기 때문이다
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="hint-wrap" ref={boxRef}>
      {children}
      <button
        type="button"
        className={`hint-badge hint-${corner}${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-controls={id}
        title={`${label} — 코드 보기`}
        onClick={() => setOpen((v) => !v)}
      >
        {'</>'}
      </button>
      {open && (
        <div className="hint-pop" id={id} role="dialog" aria-label={`${label} 코드`}>
          <div className="hint-pop-head">
            <strong>{label}</strong>
            <button type="button" className="hint-close" onClick={() => setOpen(false)}>
              닫기
            </button>
          </div>
          {note && <p className="hint-note">{note}</p>}
          <pre className="hint-code">
            <code>{dedent(code)}</code>
          </pre>
        </div>
      )}
    </div>
  )
}
