/**
 * 호스트가 만든 확인 모달 (커스터마이징은 토큰 → @layer → 다이얼로그 위임 3단계다).
 *
 * **편집기는 이 컴포넌트의 존재를 모른다.** `onRequestConfirm` 으로 요청만 받고, 결과를
 * `handle.confirmPending()` · `cancelPending()` 으로 돌려준다.
 *
 * 패키지 클래스(`pck-`)를 하나도 쓰지 않는다 — 우리 디자인 시스템이 그대로 나오는 모습이
 * 이 예제의 요점이다.
 *
 * ⚠️ 둘 중 하나를 **반드시** 불러야 한다. 부르지 않으면 편집기는 그 동작을 대기 상태로
 * 유지한다 — 조용히 취소하지 않는다.
 */
import type { ConfirmRequest } from '@h_domi/pdf-canvas-kit'

export interface ConfirmDialogProps {
  request: ConfirmRequest
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ request, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="host-scrim" role="presentation" onClick={onCancel}>
      <div
        className="host-sheet"
        role="alertdialog"
        aria-modal="true"
        // 시트 클릭이 배경으로 새어 나가 모달을 닫으면 안 된다.
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="host-sheet-title">확인</h2>
        <p className="host-sheet-body">{request.message}</p>
        <div className="host-sheet-actions">
          <button type="button" className="host-btn" onClick={onCancel}>
            취소
          </button>
          <button
            type="button"
            className={request.danger ? 'host-btn host-btn--danger' : 'host-btn host-btn--primary'}
            onClick={onConfirm}
          >
            {request.danger ? '삭제' : '확인'}
          </button>
        </div>
      </div>
    </div>
  )
}
