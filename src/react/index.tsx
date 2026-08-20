/**
 * React 래퍼 — `pdf-canvas-kit/react` (PLAN 20.2, D25).
 *
 * ```tsx
 * <PDFCanvasEditor
 *   initialDoc={doc}
 *   objectTypes={[shortAnswer]}
 *   renderObject={{ 'answer.short': ({ data }) => <Badge {...data} /> }}
 *   renderInspector={{ 'answer.short': ({ data, onChange }) => <Fields … /> }}
 *   onChange={setDoc}
 * />
 * ```
 *
 * 편집기 자체는 vanilla DOM 이다. 이 래퍼가 하는 일은 셋뿐이다.
 *
 * 1. facade 를 마운트·정리한다
 * 2. prop 변경을 `handle.update()` 로 흘린다
 * 3. **커스텀 객체 슬롯에 `createPortal` 한다** — 아래가 그 설명
 *
 * ## 왜 portal 인가
 *
 * 렌더 층이 커스텀 객체의 **빈 컨테이너**를 만들고 그 엘리먼트를 알려 준다 (PLAN D25).
 * `createPortal(children, el)` 은 React 트리 밖의 DOM 노드에 렌더하는 공식 수단이다 — 컨텍스트와
 * 훅이 정상 동작하고, 노드는 한 번 만들어진 뒤 React 가 안쪽만 갱신한다.
 *
 * 그래서 **vanilla 경로의 제약이 여기서는 사라진다.** `objectType.render` 는 객체당 한 번만
 * 불려야 하고 갱신을 `onUpdate` 로 받아야 하지만(PLAN 20.14), portal 안에서는 그냥 컴포넌트를
 * 쓰면 된다 — 배열 추가·삭제, 조건부 렌더, 훅 전부.
 *
 * ⚠️ **`position: fixed` 는 갇힌다.** 컨테이너가 `transform: scale()` 안에 있어 드롭다운·툴팁이
 * 프레임 기준으로 갇힌다. 그런 UI 는 `document.body` 로 따로 portal 한다 (ARCHITECTURE §16.3).
 */
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'
import { createPDFCanvasEditor, type EditorHandle, type EditorProps } from '../dom/createEditor'
import type { CustomObject, PDFCanvasDoc } from '../core/model/types'

export type { EditorHandle }

/** 커스텀 객체 슬롯이 받는 것. `kind` 별로 컴포넌트를 정한다. */
export interface CustomSlotProps<Data = unknown> {
  objectId: string
  data: Data
  /** 데이터를 바꾼다. 커맨드 한 번이라 undo 한 항목이 된다. */
  onChange: (next: Data) => void
}

/** `kind` → 컴포넌트. 등록되지 않은 `kind` 는 그리지 않는다. */
export type SlotMap = Record<string, (props: CustomSlotProps<never>) => ReactNode>

export interface PDFCanvasEditorProps extends Omit<
  EditorProps,
  'onMountCustom' | 'onMountInspector'
> {
  /** 캔버스 안 커스텀 객체. 기본 틀은 패키지가 그리고 이 컴포넌트가 안을 채운다. */
  renderObject?: SlotMap
  /** 우측 인스펙터의 속성 편집. 커스텀 객체의 **편집 창구는 여기 하나**다 (PLAN D26). */
  renderInspector?: SlotMap
  /** 컨테이너에 붙는다. **높이를 반드시 줘야 한다** (ARCHITECTURE §15.4). */
  className?: string
  style?: React.CSSProperties
  ref?: Ref<EditorHandle>
}

/** 마운트된 슬롯 컨테이너. `objectId` → 엘리먼트. */
type Mounts = ReadonlyMap<string, HTMLElement>

/**
 * 슬롯 마운트 집합을 관리한다.
 *
 * 렌더 층이 `(objectId, el | null)` 로 알려 주므로 `null` 이 언마운트다. 새 `Map` 을 만들어
 * 대입해야 React 가 변경을 본다 — 같은 Map 을 변형하면 리렌더가 일어나지 않는다.
 */
function useMounts(): [Mounts, (objectId: string, el: HTMLElement | null) => void] {
  const [mounts, setMounts] = useState<Mounts>(() => new Map())

  const onMount = useCallback((objectId: string, el: HTMLElement | null) => {
    setMounts((prev) => {
      if (el === null) {
        if (!prev.has(objectId)) return prev
        const next = new Map(prev)
        next.delete(objectId)
        return next
      }
      if (prev.get(objectId) === el) return prev
      return new Map(prev).set(objectId, el)
    })
  }, [])

  return [mounts, onMount]
}

/** 문서에서 커스텀 객체를 찾는다. 모든 페이지를 훑는다 — 인스펙터 대상이 현재 페이지가 아닐 수 있다. */
function findCustom(doc: PDFCanvasDoc, objectId: string): CustomObject | null {
  for (const page of doc.pages) {
    for (const obj of page.objects) {
      if (obj.id === objectId && obj.type === 'custom') return obj
    }
  }
  return null
}

export function PDFCanvasEditor({
  renderObject,
  renderInspector,
  className,
  style,
  ref,
  ...editorProps
}: PDFCanvasEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<EditorHandle | null>(null)

  const [objectMounts, onMountCustom] = useMounts()
  const [inspectorMounts, onMountInspector] = useMounts()

  /*
   * prop 을 ref 로 들고 있다가 마운트 effect 안에서 읽는다.
   *
   * 마운트 effect 는 한 번만 돌아야 하는데(편집기를 다시 만들면 undo 스택이 날아간다) prop 을
   * 의존성에 넣으면 매번 다시 돈다. 그래서 최신 값을 ref 로 전달하고, 갱신은 아래 별도
   * effect 가 `handle.update()` 로 흘린다.
   */
  const propsRef = useRef(editorProps)
  propsRef.current = editorProps

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const handle = createPDFCanvasEditor(host, {
      ...propsRef.current,
      onMountCustom,
      onMountInspector,
    })
    handleRef.current = handle

    return () => {
      handle.destroy()
      handleRef.current = null
    }
    // 마운트 시 한 번만. 콜백은 `useCallback` 으로 안정적이다.
  }, [onMountCustom, onMountInspector])

  // 렌더마다 prop 을 흘린다. `initialDoc` 류는 facade 가 무시한다.
  useEffect(() => {
    handleRef.current?.update(editorProps)
  })

  useImperativeHandle(ref, () => handleRef.current as EditorHandle, [])

  /**
   * 문서 변경에 리렌더한다.
   *
   * `useSyncExternalStore` 를 쓰는 이유: 편집기가 문서를 소유하고 React 밖에서 바꾸므로,
   * tearing 없이 읽으려면 공식 구독 API 가 필요하다.
   */
  const subscribe = useCallback((notify: () => void) => {
    const handle = handleRef.current
    if (!handle) return () => {}
    return handle.subscribe(() => notify())
  }, [])
  const getSnapshot = useCallback(() => handleRef.current?.getDoc() ?? null, [])
  const doc = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const portals = (mounts: Mounts, slots: SlotMap | undefined) => {
    if (!doc || !slots) return null
    const out: ReactNode[] = []
    for (const [objectId, el] of mounts) {
      const obj = findCustom(doc, objectId)
      if (!obj) continue
      const Slot = slots[obj.kind]
      if (!Slot) continue
      out.push(
        createPortal(
          <Slot
            objectId={objectId}
            data={obj.data as never}
            onChange={(next: unknown) => handleRef.current?.updateObjectData(objectId, next)}
          />,
          el,
          // 키가 있어야 객체가 사라질 때 portal 이 정확히 걷힌다.
          objectId,
        ),
      )
    }
    return out
  }

  return (
    <>
      <div
        ref={hostRef}
        {...(className !== undefined ? { className } : {})}
        {...(style !== undefined ? { style } : {})}
      />
      {portals(objectMounts, renderObject)}
      {portals(inspectorMounts, renderInspector)}
    </>
  )
}
