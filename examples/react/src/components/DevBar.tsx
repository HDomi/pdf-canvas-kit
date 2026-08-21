/** 예제용 상단 바. 패키지와 무관한 호스트 UI 다. */
import type { ReactNode } from 'react'

export interface DevBarProps {
  children: ReactNode
}

export function DevBar({ children }: DevBarProps) {
  return <div className="ex-bar">{children}</div>
}
