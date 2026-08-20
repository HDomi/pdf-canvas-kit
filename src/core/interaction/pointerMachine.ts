/**
 * 포인터 상호작용 상태 머신 (PLAN 11.2).
 *
 * DOM에 의존하지 않는다. 입력은 이미 pt로 변환된 좌표이며(Vue 층이 `clientToPage` 로 변환),
 * 출력은 "무엇을 커밋해야 하는가" 다.
 *
 * ## 드래그 중에 문서를 건드리지 않는 이유
 *
 * `pointermove` 마다 커맨드를 실행하면 undo 스택이 픽셀 단위로 오염된다. 그래서 드래그 중에는
 * `preview` rect만 갱신하고, `pointerup` 에서 커맨드를 한 번 커밋한다. 사용자 제스처 하나가
 * 히스토리 한 항목이 된다.
 */
import type { Pt, Rect, Size, WorksheetObject } from '../model/types'
import { rectFromPoints } from '../geometry/constrain'
import { moveRect, resizeRect, rotationFromPointer, type HandleId } from '../geometry/handles'
import { pickObject, rectCenter } from '../geometry/hitTest'
import type { CreationToolId } from './tools'

/** pt 좌표의 포인터 입력. 수정자 키를 함께 담는다. */
export interface PointerInput {
  x: Pt
  y: Pt
  shiftKey: boolean
  altKey: boolean
  /** 다중 선택 토글 (Cmd/Ctrl). */
  metaKey: boolean
}

export type PointerPhase =
  | { kind: 'idle' }
  /** 생성 도구로 영역을 끌고 있다. */
  | { kind: 'create'; tool: CreationToolId; origin: PointerInput; rect: Rect }
  /** 선택된 객체들을 옮기고 있다. */
  | {
      kind: 'move'
      origin: PointerInput
      ids: string[]
      starts: Map<string, Rect>
      rects: Map<string, Rect>
    }
  /** 핸들로 크기를 바꾸고 있다. */
  | { kind: 'resize'; origin: PointerInput; id: string; handle: HandleId; start: Rect; rect: Rect }
  /** 회전 핸들을 돌리고 있다. */
  | { kind: 'rotate'; id: string; center: { x: Pt; y: Pt }; deg: number }
  /** 빈 영역에서 마퀴 선택을 끌고 있다. */
  | { kind: 'marquee'; origin: PointerInput; rect: Rect }

/** `pointerup` 에서 호출자가 처리해야 할 결과. */
export type PointerCommit =
  | { kind: 'none' }
  /** 새 객체를 만든다. */
  | { kind: 'create'; tool: CreationToolId; rect: Rect }
  /** 객체들의 rect를 바꾼다. */
  | { kind: 'transform'; rects: Map<string, Rect> }
  /** 선택을 교체한다. */
  | { kind: 'select'; ids: string[] }
  /** 객체 회전을 설정한다. */
  | { kind: 'rotate'; id: string; deg: number }

export interface MachineContext {
  page: Size
  objects: readonly WorksheetObject[]
  /** 스냅 그리드(pt). 0이면 스냅 없음. */
  grid: number
  selectedIds: readonly string[]
}

export interface PointerMachine {
  readonly phase: PointerPhase
  /** 그리는 중인 미리보기 rect. 없으면 null. */
  preview(): { rect: Rect; kind: 'create' | 'marquee' } | null
  /** 변형 중인 객체들의 미리보기 rect. */
  previewRects(): ReadonlyMap<string, Rect>
  /** 회전 중인 객체의 미리보기 각도. 없으면 null. */
  previewRotation(): { id: string; deg: number } | null
  down(
    input: PointerInput,
    opts: {
      tool: string
      handle?: HandleId
      handleTargetId?: string
      /** 회전 핸들을 잡았을 때의 대상 객체 id. */
      rotateTargetId?: string
    },
  ): void
  move(input: PointerInput): void
  up(input: PointerInput): PointerCommit
  cancel(): void
}

export function createPointerMachine(getContext: () => MachineContext): PointerMachine {
  let phase: PointerPhase = { kind: 'idle' }

  /** 시작점 기준 이동량. */
  const deltaOf = (origin: PointerInput, input: PointerInput) => ({
    dx: input.x - origin.x,
    dy: input.y - origin.y,
  })

  return {
    get phase() {
      return phase
    },

    preview() {
      if (phase.kind === 'create') return { rect: phase.rect, kind: 'create' }
      if (phase.kind === 'marquee') return { rect: phase.rect, kind: 'marquee' }
      return null
    },

    previewRects() {
      if (phase.kind === 'move') return phase.rects
      if (phase.kind === 'resize') return new Map([[phase.id, phase.rect]])
      return new Map()
    },

    previewRotation() {
      return phase.kind === 'rotate' ? { id: phase.id, deg: phase.deg } : null
    },

    down(input, opts) {
      const ctx = getContext()

      // 회전 핸들도 객체 위에 겹쳐 있어 히트 테스트보다 먼저 본다.
      if (opts.rotateTargetId) {
        const target = ctx.objects.find((o) => o.id === opts.rotateTargetId)
        if (target) {
          phase = {
            kind: 'rotate',
            id: target.id,
            center: rectCenter(target.rect),
            deg: target.rotation ?? 0,
          }
          return
        }
      }

      // 핸들을 잡았으면 다른 판정보다 우선한다. 핸들은 객체 위에 겹쳐 있다.
      if (opts.handle && opts.handleTargetId) {
        const target = ctx.objects.find((o) => o.id === opts.handleTargetId)
        if (target) {
          phase = {
            kind: 'resize',
            origin: input,
            id: target.id,
            handle: opts.handle,
            start: target.rect,
            rect: target.rect,
          }
          return
        }
      }

      if (opts.tool !== 'select' && opts.tool !== 'eraser') {
        phase = {
          kind: 'create',
          tool: opts.tool as CreationToolId,
          origin: input,
          rect: { x: input.x, y: input.y, w: 0, h: 0 },
        }
        return
      }

      const hit = pickObject(input, ctx.objects)
      if (!hit) {
        phase = { kind: 'marquee', origin: input, rect: { x: input.x, y: input.y, w: 0, h: 0 } }
        return
      }

      // 이미 선택된 객체를 잡으면 선택 전체를 함께 옮긴다. 하나만 잡았으면 그것만.
      const ids = ctx.selectedIds.includes(hit.id) ? [...ctx.selectedIds] : [hit.id]
      const starts = new Map<string, Rect>()
      for (const id of ids) {
        const obj = ctx.objects.find((o) => o.id === id)
        if (obj) starts.set(id, obj.rect)
      }
      phase = { kind: 'move', origin: input, ids, starts, rects: new Map(starts) }
    },

    move(input) {
      const ctx = getContext()
      const grid = ctx.grid
      // 로컬로 캡처한다. 아래에서 `phase` 에 대입하면 TypeScript의 좁힘이 풀린다.
      const current = phase

      switch (current.kind) {
        case 'create':
          phase = { ...current, rect: rectFromPoints(current.origin, input) }
          break

        case 'marquee':
          phase = { ...current, rect: rectFromPoints(current.origin, input) }
          break

        case 'move': {
          const delta = deltaOf(current.origin, input)
          const rects = new Map<string, Rect>()
          for (const [id, start] of current.starts) {
            const obj = ctx.objects.find((o) => o.id === id)
            if (!obj) continue
            rects.set(
              id,
              moveRect(start, delta, ctx.page, obj.type, {
                grid,
                rotation: obj.rotation ?? 0,
              }),
            )
          }
          phase = { ...current, rects }
          break
        }

        case 'resize': {
          const obj = ctx.objects.find((o) => o.id === current.id)
          if (!obj) break
          phase = {
            ...current,
            rect: resizeRect(
              current.start,
              current.handle,
              deltaOf(current.origin, input),
              ctx.page,
              obj.type,
              {
                keepAspect: input.shiftKey,
                fromCenter: input.altKey,
                grid,
                // 회전을 빼먹으면 회전된 객체의 리사이즈가 앵커를 중심으로 미끄러진다.
                rotation: obj.rotation ?? 0,
              },
            ),
          }
          break
        }

        case 'rotate':
          // Shift를 누르면 15° 단위로 스냅한다. 도형을 눕히거나 세울 때 흔한 요구다.
          phase = {
            ...current,
            deg: rotationFromPointer(current.center, input, input.shiftKey ? 15 : 0),
          }
          break

        case 'idle':
          break
      }
    },

    up(input) {
      const current = phase
      phase = { kind: 'idle' }

      switch (current.kind) {
        case 'create':
          return { kind: 'create', tool: current.tool, rect: rectFromPoints(current.origin, input) }

        case 'move':
        case 'resize': {
          const rects =
            current.kind === 'move' ? current.rects : new Map([[current.id, current.rect]])
          // 실제로 움직이지 않았으면 히스토리에 항목을 남기지 않는다. 단순 클릭 선택이었다는 뜻.
          const ctx = getContext()
          const moved = [...rects].some(([id, r]) => {
            const obj = ctx.objects.find((o) => o.id === id)
            return obj
              ? obj.rect.x !== r.x || obj.rect.y !== r.y || obj.rect.w !== r.w || obj.rect.h !== r.h
              : false
          })
          if (!moved) {
            const ids = current.kind === 'move' ? current.ids : [current.id]
            return { kind: 'select', ids }
          }
          return { kind: 'transform', rects }
        }

        case 'rotate': {
          const ctx = getContext()
          const obj = ctx.objects.find((o) => o.id === current.id)
          // 각도가 그대로면 히스토리에 남기지 않는다. 살짝 잡았다 놓은 경우다.
          if (!obj || (obj.rotation ?? 0) === current.deg) return { kind: 'none' }
          return { kind: 'rotate', id: current.id, deg: current.deg }
        }

        case 'marquee': {
          const ctx = getContext()
          const rect = rectFromPoints(current.origin, input)
          // 실질적 드래그가 아니었다면 빈 영역 클릭이므로 선택을 비운다.
          if (rect.w < 2 && rect.h < 2) return { kind: 'select', ids: [] }
          const ids = ctx.objects
            .filter((o) => !o.locked)
            .filter(
              (o) =>
                rect.x < o.rect.x + o.rect.w &&
                rect.x + rect.w > o.rect.x &&
                rect.y < o.rect.y + o.rect.h &&
                rect.y + rect.h > o.rect.y,
            )
            .map((o) => o.id)
          return { kind: 'select', ids }
        }

        case 'idle':
          return { kind: 'none' }
      }
    },

    cancel() {
      phase = { kind: 'idle' }
    },
  }
}
