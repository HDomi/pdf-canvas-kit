/**
 * 도구 정의와 도구별 객체 생성 (커스텀 객체는 소비자가 정의한다).
 *
 * 모든 생성 도구가 같은 흐름을 공유한다.
 * pointerdown → 드래그(마퀴 표시) → pointerup → 객체 생성 → 자동 선택 → select 복귀.
 *
 * 도구별로 다른 것은 "어떤 객체를 만드는가" 뿐이므로 그 차이만 여기 모아 둔다.
 *
 * ## 커스텀 도구
 *
 * 이전 판은 도구 6개가 하드코딩이었다. 이제 텍스트·도형만 내장이고, 나머지는 레지스트리에
 * 등록된 타입마다 `custom:<kind>` 도구가 하나씩 생긴다 — 툴바가 데이터 주도가 된다.
 */
import { createId } from '../util/id'
import { EDITOR_DEFAULTS } from '../config/defaults'
import type { ObjectSize, ObjectTypeRegistry } from '../objectTypes'
import type { PDFCanvasObject, Rect } from '../model/types'
import { kindFromTool, type ToolId } from '../model/viewState'

/** 객체를 만드는 도구들. `select` 와 `eraser` 는 제외된다. */
export type CreationToolId = Exclude<ToolId, 'select' | 'eraser'>

/** 이 도구가 드래그로 객체를 만드는지. */
export function isCreationTool(tool: ToolId): tool is CreationToolId {
  return tool !== 'select' && tool !== 'eraser'
}

/**
 * 드래그 영역으로 새 객체를 만든다.
 *
 * 커스텀 도구인데 `kind` 가 등록돼 있지 않으면 `null` 을 돌려준다 — 도구가 사라진 뒤에도
 * 툴바 상태가 남아 있는 경우다. 조용히 빈 객체를 만들면 문서에 해석 불가한 데이터가 들어간다.
 */
export function createObjectForTool(
  tool: CreationToolId,
  rect: Rect,
  types?: ObjectTypeRegistry,
): PDFCanvasObject | null {
  const base = { id: createId(), rect }

  if (tool === 'text') {
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
  }

  if (tool === 'shape') {
    return {
      ...base,
      type: 'shape',
      shape: 'rect',
      style: { fill: null, stroke: '#1c1c1a', strokeWidth: 1 },
    }
  }

  const kind = kindFromTool(tool)
  if (!kind) return null
  const def = types?.get(kind)
  if (!def) return null

  return { ...base, type: 'custom', kind, data: def.defaultData() }
}

/**
 * 클릭만 했을 때 놓을 rect. 포인터를 중심으로 기본 크기 객체를 만든다.
 *
 * 커스텀 타입은 자기 `defaultSize` 를 쓴다 — 텍스트 한 줄과 큰 표를 같은 크기로 놓으면
 * 둘 다 어색하다.
 */
export function defaultRectAt(point: { x: number; y: number }, size?: ObjectSize): Rect {
  const { w, h } = size ?? EDITOR_DEFAULTS.newObjectSize
  return { x: point.x - w / 2, y: point.y - h / 2, w, h }
}

/** 도구가 만들 객체의 기본 크기. 커스텀은 레지스트리에서, 내장은 공통 기본값. */
export function defaultSizeForTool(tool: CreationToolId, types?: ObjectTypeRegistry): ObjectSize {
  const kind = kindFromTool(tool)
  if (!kind) return EDITOR_DEFAULTS.newObjectSize
  return types?.get(kind)?.defaultSize ?? EDITOR_DEFAULTS.newObjectSize
}
