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
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from 'react'
import { createPortal } from 'react-dom'
import { createPDFCanvasEditor, type EditorHandle, type EditorProps } from '../dom/createEditor'
import { createPDFCanvasViewer, type ViewerHandle, type ViewerProps } from '../dom/createViewer'
import type { CustomObject, PDFCanvasDoc, PublicPDFCanvasDoc } from '../core/model/types'

export type { EditorHandle, ViewerHandle }

/** 커스텀 객체 슬롯이 받는 것. `kind` 별로 컴포넌트를 정한다. */
export interface CustomSlotProps<Data = unknown> {
  objectId: string
  data: Data
  /** 데이터를 바꾼다. 커맨드 한 번이라 undo 한 항목이 된다. */
  onChange: (next: Data) => void
}

/**
 * `kind` → 컴포넌트. 등록되지 않은 `kind` 는 그리지 않는다.
 *
 * `any` 가 여기서는 정확한 선택이다. `kind` 마다 `Data` 가 다른 컴포넌트를 한 맵에 담아야
 * 하는데, `never` 로 두면 `onChange: (next: never) => void` 가 되어 **반공변 위치에서**
 * `CustomSlotProps<Note>` 컴포넌트가 거절되고, `unknown` 으로 두면 이번엔 `data` 쪽(공변)이
 * 거절된다. 양쪽을 통과하는 것은 `any` 뿐이다 — `AnyObjectTypeDef` 가 같은 이유로 같은
 * 선택을 했다 (`core/objectTypes.ts`).
 *
 * 슬롯 내부의 타입 안전은 컴포넌트가 `CustomSlotProps<Data>` 를 명시해서 얻는다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SlotMap = Record<string, (props: CustomSlotProps<any>) => ReactNode>

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

/**
 * `ref` 를 직접 채운다. **`useImperativeHandle` 을 쓰지 않는다** (R11, 2026.08.21).
 *
 * `useImperativeHandle` 은 layout effect 라 편집기를 만드는 `useEffect` 보다 **먼저** 돈다.
 * 그래서 `() => handleRef.current` 를 넘기면 아직 `null` 인 값이 ref 에 박히고, 소비자의
 * `editorRef.current?.toPublicDoc()` 이 조용히 `undefined` 를 돌려준다 — 에러도 없이
 * 아무 일도 일어나지 않는다. R9 부터 있던 버그이고 실제로 그렇게 새어 나갔다.
 *
 * 대신 facade 를 만든 직후 여기서 채운다. Vue 쪽은 `expose({ get handle() {…} })` 게터라
 * 접근 시점에 평가되어 같은 문제가 없다 — 그 비대칭을 이 함수가 메운다.
 */
function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value)
  else if (ref) (ref as { current: T | null }).current = value
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
  ref: refProp,
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
    assignRef(refProp, handle)

    return () => {
      handle.destroy()
      handleRef.current = null
      assignRef(refProp, null)
    }
    // 마운트 시 한 번만. 콜백은 `useCallback` 으로 안정적이다.
  }, [onMountCustom, onMountInspector])

  // 렌더마다 prop 을 흘린다. `initialDoc` 류는 facade 가 무시한다.
  useEffect(() => {
    handleRef.current?.update(editorProps)
  })

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
            data={obj.data}
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

/* ------------------------------------------------------ PDFCanvasViewer -- */

export interface PDFCanvasViewerProps extends Omit<ViewerProps, 'onMountCustom'> {
  /**
   * 캔버스 안 커스텀 객체 — **응답을 받는 폼**이다 (PLAN D29).
   *
   * 편집기의 `renderObject` 와 슬롯 맵 형태가 같지만 화면의 목적이 다르다. 편집기는 미리보기를
   * 그리고 편집은 인스펙터에서 하는데(D26), 뷰어는 그 자리에서 입력을 받는다.
   */
  renderObject?: SlotMap
  className?: string
  style?: React.CSSProperties
  ref?: Ref<ViewerHandle>
}

/**
 * 읽기 전용 뷰어 (PLAN D15 · R11).
 *
 * ```tsx
 * <PDFCanvasViewer
 *   doc={publicDoc}                       // toPublicDoc() 또는 asPublicDoc()
 *   objectTypes={[shortAnswer]}           // 편집기와 같은 배열
 *   renderObject={{ 'answer.short': AnswerInput }}
 *   onChangeData={(id, next) => setResponses((r) => ({ ...r, [id]: next }))}
 * />
 * ```
 *
 * 편집기와 달리 **`doc` 이 controlled 다.** 뷰어는 문서를 소유하지 않으므로 응답을 저장할 곳도
 * 없다 — `onChangeData` 로 받아 호스트가 자기 상태를 고치고 새 `doc` 을 내려 준다.
 */
export function PDFCanvasViewer({
  renderObject,
  className,
  style,
  ref: refProp,
  ...viewerProps
}: PDFCanvasViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<ViewerHandle | null>(null)
  const [mounts, onMountCustom] = useMounts()

  // 편집기 래퍼와 같은 이유로 ref 를 쓴다 — 마운트 effect 를 한 번만 돌리기 위해.
  const propsRef = useRef(viewerProps)
  propsRef.current = viewerProps

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const handle = createPDFCanvasViewer(host, { ...propsRef.current, onMountCustom })
    handleRef.current = handle
    assignRef(refProp, handle)
    return () => {
      handle.destroy()
      handleRef.current = null
      assignRef(refProp, null)
    }
  }, [onMountCustom])

  // 렌더마다 흘린다. 뷰어는 `doc` 도 여기서 반영된다.
  useEffect(() => {
    handleRef.current?.update(viewerProps)
  })

  /*
   * 문서를 구독하지 않는다 — 편집기와 다른 지점.
   *
   * 뷰어의 문서는 **prop 으로 내려온다.** `props.doc` 이 이미 최신이므로 외부 스토어를
   * 구독할 이유가 없고, 구독하면 같은 값을 두 경로로 읽어 tearing 위험만 생긴다.
   */
  const doc: PublicPDFCanvasDoc | null = viewerProps.doc

  const portals: ReactNode[] = []
  if (doc && renderObject) {
    for (const [objectId, el] of mounts) {
      const obj = findCustom(doc, objectId)
      if (!obj) continue
      const Slot = renderObject[obj.kind]
      if (!Slot) continue
      portals.push(
        createPortal(
          <Slot
            objectId={objectId}
            data={obj.data}
            onChange={(next: unknown) => viewerProps.onChangeData?.(objectId, next)}
          />,
          el,
          objectId,
        ),
      )
    }
  }

  return (
    <>
      <div
        ref={hostRef}
        {...(className !== undefined ? { className } : {})}
        {...(style !== undefined ? { style } : {})}
      />
      {portals}
    </>
  )
}
