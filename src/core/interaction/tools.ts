/**
 * 도구 정의와 도구별 객체 생성 (PLAN 11.1).
 *
 * 모든 생성 도구가 같은 흐름을 공유한다.
 * pointerdown → 드래그(마퀴 표시) → pointerup → 객체 생성 → 자동 선택 → select 복귀.
 *
 * 도구별로 다른 것은 "어떤 객체를 만드는가" 뿐이므로, 그 차이만 여기 모아 둔다.
 */
import { createId } from '../util/id'
import { EDITOR_DEFAULTS } from '../config/defaults'
import type { Rect, WorksheetObject, WorksheetObjectType } from '../model/types'
import type { ToolId } from '../model/viewState'

/** 객체를 만드는 도구들. `select` 와 `eraser` 는 제외된다. */
export type CreationToolId = Exclude<ToolId, 'select' | 'eraser'>

/** 이 도구가 드래그로 객체를 만드는지. */
export function isCreationTool(tool: ToolId): tool is CreationToolId {
  return tool !== 'select' && tool !== 'eraser'
}

/** 도구가 만드는 객체 유형. */
export function objectTypeForTool(tool: CreationToolId): WorksheetObjectType {
  return tool
}

/**
 * 드래그 영역으로 새 객체를 만든다.
 *
 * 기본값은 기획이 요구하는 최소한만 채운다. 단답형은 정답이 비어 있어 검증에 걸리는데,
 * 이건 의도다. 교사가 인스펙터에서 정답을 넣기 전까지 내보내기가 막혀야 한다 (기획 6.3).
 */
export function createObjectForTool(tool: CreationToolId, rect: Rect): WorksheetObject {
  const base = { id: createId(), rect }

  switch (tool) {
    case 'text':
      return {
        ...base,
        type: 'text',
        text: '',
        style: {
          fontFamily: 'sans-serif',
          fontSize: 12,
          bold: false,
          italic: false,
          underline: false,
          color: '#1c1c1a',
          align: 'left',
          lineHeight: 1.4,
        },
      }

    case 'shape':
      return {
        ...base,
        type: 'shape',
        shape: 'rect',
        style: { fill: null, stroke: '#1c1c1a', strokeWidth: 1 },
      }

    case 'answer.short':
      return { ...base, type: 'answer.short', points: 1, answers: [] }

    case 'answer.essay':
      return { ...base, type: 'answer.essay', points: 1 }

    case 'answer.dropbox':
      // 보기를 두 개 넣어 두면 교사가 곧바로 라벨만 채울 수 있다. 기획 최소 개수와도 맞는다.
      return {
        ...base,
        type: 'answer.dropbox',
        points: 1,
        choices: [
          { id: createId(), label: '' },
          { id: createId(), label: '' },
        ],
        correctChoiceIds: [],
      }
  }
}

/** 클릭만 했을 때 놓을 rect. 포인터를 중심으로 기본 크기 객체를 만든다. */
export function defaultRectAt(point: { x: number; y: number }): Rect {
  const { w, h } = EDITOR_DEFAULTS.newObjectSize
  return { x: point.x - w / 2, y: point.y - h / 2, w, h }
}
