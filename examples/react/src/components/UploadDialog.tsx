/**
 * 호스트가 만든 문서 불러오기 모달 (PLAN D31).
 *
 * 편집기의 내장 업로드 팝업을 대체한다. 파일을 고르면 `handle.importFile(file)` 로 넘기고,
 * 진행률·오류는 `onImportStateChange` 로 받은 것을 그린다.
 *
 * 드래그&드롭을 붙였다 — 내장 팝업에도 있지만, **호스트가 자기 UX 를 얹을 수 있다**는 것이
 * 위임의 요점이다. 편집기는 파일 하나만 받으면 된다.
 */
import { useState } from 'react'
import type { ImportState } from 'pdf-canvas-kit'

export interface UploadDialogProps {
  state: ImportState | null
  onPick: (file: File) => void
  onCancel: () => void
  onClose: () => void
}

export function UploadDialog({ state, onPick, onCancel, onClose }: UploadDialogProps) {
  const [over, setOver] = useState(false)
  const busy = state?.progress != null

  return (
    <div className="host-scrim" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="host-sheet"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="host-sheet-title">문서 불러오기</h2>

        {busy ? (
          <div className="host-sheet-body">
            <p>
              {state?.progress?.fileName} — {Math.round((state?.progress?.ratio ?? 0) * 100)}%
              {state?.progress?.total
                ? ` (${state.progress.page}/${state.progress.total} 페이지)`
                : ''}
            </p>
            <progress value={state?.progress?.ratio ?? 0} max={1} className="host-progress" />
            <p className="host-hint">
              {state?.progress?.phase === 'storing'
                ? '이미지를 저장하는 중'
                : '페이지를 변환하는 중'}
            </p>
          </div>
        ) : (
          <label
            className={over ? 'host-drop is-over' : 'host-drop'}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              const file = e.dataTransfer.files[0]
              if (file) onPick(file)
            }}
          >
            <input
              type="file"
              accept=".pdf"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) onPick(file)
                // 같은 파일을 다시 고를 수 있어야 한다.
                e.target.value = ''
              }}
            />
            <strong>PDF 를 끌어다 놓거나 클릭해서 고르세요</strong>
            <span className="host-hint">호스트가 만든 UI 다. 편집기 팝업이 아니다</span>
          </label>
        )}

        {state?.error && <p className="host-error">{state.error}</p>}

        <div className="host-sheet-actions">
          {busy ? (
            <button type="button" className="host-btn" onClick={onCancel}>
              변환 취소
            </button>
          ) : (
            <button type="button" className="host-btn" onClick={onClose}>
              닫기
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
