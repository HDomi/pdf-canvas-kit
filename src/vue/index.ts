/**
 * Vue 래퍼 — `pdf-canvas-kit/vue` (PLAN 20.2, D25).
 *
 * ```vue
 * <script setup>
 * import { PDFCanvasEditor } from 'pdf-canvas-kit/vue'
 * </script>
 * <template>
 *   <PDFCanvasEditor
 *     :initial-doc="doc"
 *     :object-types="[shortAnswer]"
 *     :render-object="{ 'answer.short': AnswerBadge }"
 *     :render-inspector="{ 'answer.short': AnswerFields }"
 *     @change="onChange"
 *   />
 * </template>
 * ```
 *
 * SFC 가 아니다. `defineComponent` + `h()` 로 쓰므로 `@vitejs/plugin-vue` 도 `vue-tsc` 도
 * 필요하지 않고, `.d.ts` 생성이 평범한 `tsc` 다 (PLAN 20.3).
 *
 * ## `Teleport` 로 슬롯을 채운다
 *
 * 렌더 층이 커스텀 객체의 **빈 컨테이너**를 만들고 그 엘리먼트를 알려 준다. `<Teleport :to="el">`
 * 이 그 노드에 컴포넌트를 꽂는다 — React 의 `createPortal` 과 같은 역할이다.
 *
 * 그래서 **vanilla 경로의 제약이 여기서는 사라진다.** `objectType.render` 는 객체당 한 번만
 * 불려야 하고 갱신을 `onUpdate` 로 받아야 하지만(PLAN 20.14), Teleport 안에서는 평범한
 * 컴포넌트를 쓰면 된다 — `v-for`, `v-if`, `ref` 전부.
 *
 * ⚠️ **`position: fixed` 는 갇힌다.** 컨테이너가 `transform: scale()` 안에 있어 드롭다운·툴팁이
 * 프레임 기준으로 갇힌다. 그런 UI 는 `body` 로 따로 Teleport 한다 (ARCHITECTURE §16.3).
 */
import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  Teleport,
  watchEffect,
  type Component,
  type PropType,
  type VNode,
} from 'vue'
import { createPDFCanvasEditor, type EditorHandle, type EditorProps } from '../dom/createEditor'
import { createPDFCanvasViewer, type ViewerHandle } from '../dom/createViewer'
import type { AnyObjectTypeDef } from '../core/objectTypes'
import type { CustomObject, PDFCanvasDoc, PublicPDFCanvasDoc } from '../core/model/types'
import type { SaveState } from '../core/model/viewState'

export type { EditorHandle, ViewerHandle }

/** `kind` → 컴포넌트. `objectId` · `data` · `onChange` 를 prop 으로 받는다. */
export type SlotMap = Record<string, Component>

/** 문서에서 커스텀 객체를 찾는다. 인스펙터 대상이 현재 페이지가 아닐 수 있어 전부 훑는다. */
function findCustom(doc: PDFCanvasDoc, objectId: string): CustomObject | null {
  for (const page of doc.pages) {
    for (const obj of page.objects) {
      if (obj.id === objectId && obj.type === 'custom') return obj
    }
  }
  return null
}

export const PDFCanvasEditor = defineComponent({
  name: 'PDFCanvasEditor',

  props: {
    /**
     * 초기 문서. **최초 1회만 읽는다** — 편집기가 문서를 소유하고 `change` 로 밀어낸다.
     * 이름이 그 계약이다 (PLAN 20.8).
     */
    initialDoc: { type: Object as PropType<PDFCanvasDoc | null>, default: null },
    ports: { type: Object as PropType<EditorProps['ports']>, default: undefined },
    readOnly: { type: Boolean, default: false },
    autosave: { type: Boolean, default: undefined },
    initialScale: {
      type: [Number, String] as PropType<EditorProps['initialScale']>,
      default: undefined,
    },
    uploadFile: { type: Function as PropType<EditorProps['uploadFile']>, default: undefined },
    /** 커스텀 객체 타입 (PLAN D25). **최초 1회만 읽는다.** */
    objectTypes: { type: Array as PropType<AnyObjectTypeDef[]>, default: undefined },
    /** 캔버스 안 커스텀 객체. */
    renderObject: { type: Object as PropType<SlotMap>, default: undefined },
    /** 우측 인스펙터. 커스텀 객체의 **편집 창구는 여기 하나**다 (PLAN D26). */
    renderInspector: { type: Object as PropType<SlotMap>, default: undefined },
  },

  emits: {
    change: (_doc: PDFCanvasDoc) => true,
    saveStateChange: (_state: SaveState) => true,
    back: () => true,
  },

  setup(props, { emit, expose }) {
    const host = ref<HTMLElement | null>(null)
    let handle: EditorHandle | null = null

    /**
     * 문서 스냅샷.
     *
     * `shallowRef` 다 — 커맨드가 문서를 통째로 교체하므로 깊은 반응성은 500페이지 트리를
     * 훑으면서 얻는 게 없다 (구 `useEngine` 과 같은 판단).
     */
    const doc = shallowRef<PDFCanvasDoc | null>(null)

    /** 슬롯 컨테이너. 새 Map 을 대입해야 반응성이 전달된다. */
    const objectMounts = shallowRef<ReadonlyMap<string, HTMLElement>>(new Map())
    const inspectorMounts = shallowRef<ReadonlyMap<string, HTMLElement>>(new Map())

    const setMount =
      (target: typeof objectMounts) => (objectId: string, el: HTMLElement | null) => {
        const prev = target.value
        if (el === null) {
          if (!prev.has(objectId)) return
          const next = new Map(prev)
          next.delete(objectId)
          target.value = next
          return
        }
        if (prev.get(objectId) === el) return
        target.value = new Map(prev).set(objectId, el)
      }

    onMounted(() => {
      if (!host.value) return
      handle = createPDFCanvasEditor(host.value, {
        ...(props.initialDoc ? { initialDoc: props.initialDoc } : {}),
        ...(props.ports ? { ports: props.ports } : {}),
        readOnly: props.readOnly,
        ...(props.autosave !== undefined ? { autosave: props.autosave } : {}),
        ...(props.initialScale !== undefined ? { initialScale: props.initialScale } : {}),
        ...(props.uploadFile ? { uploadFile: props.uploadFile } : {}),
        ...(props.objectTypes ? { objectTypes: props.objectTypes } : {}),
        onChange: (next) => {
          doc.value = next
          emit('change', next)
        },
        onSaveStateChange: (state) => emit('saveStateChange', state),
        onBack: () => emit('back'),
        onMountCustom: setMount(objectMounts),
        onMountInspector: setMount(inspectorMounts),
      })
      doc.value = handle.getDoc()
    })

    // prop 변경을 흘린다. `initialDoc` 류는 facade 가 무시한다.
    watchEffect(() => {
      handle?.update({
        readOnly: props.readOnly,
        ...(props.autosave !== undefined ? { autosave: props.autosave } : {}),
        ...(props.ports ? { ports: props.ports } : {}),
        ...(props.uploadFile ? { uploadFile: props.uploadFile } : {}),
      })
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    /*
     * `expose` 로 `EditorHandle` 을 그대로 내보낸다.
     *
     * 함수를 다시 감싸지 않는다 — 감싸면 facade 에 메서드가 추가될 때마다 여기도 고쳐야 하고,
     * 빠뜨리면 조용히 없는 API 가 된다.
     */
    expose({
      get handle() {
        return handle
      },
    })

    const portals = (
      mounts: ReadonlyMap<string, HTMLElement>,
      slots: SlotMap | undefined,
    ): VNode[] => {
      const current = doc.value
      if (!current || !slots) return []
      const out: VNode[] = []
      for (const [objectId, el] of mounts) {
        const obj = findCustom(current, objectId)
        if (!obj) continue
        const slot = slots[obj.kind]
        if (!slot) continue
        out.push(
          h(Teleport, { to: el, key: objectId }, [
            h(slot, {
              objectId,
              data: obj.data,
              onChange: (next: unknown) => handle?.updateObjectData(objectId, next),
            }),
          ]),
        )
      }
      return out
    }

    return () =>
      h('div', { style: 'display:contents' }, [
        /*
         * 편집기가 붙는 컨테이너. **호스트가 높이를 줘야 한다** (ARCHITECTURE §15.4).
         *
         * 바깥을 `display: contents` 로 두는 이유: 래퍼 엘리먼트가 레이아웃에 끼면 호스트가
         * 준 높이가 여기서 끊긴다 — 2026.08.20 에 데모에서 실제로 그 실수를 했다.
         */
        h('div', { ref: host, style: 'height:100%' }),
        ...portals(objectMounts.value, props.renderObject),
        ...portals(inspectorMounts.value, props.renderInspector),
      ])
  },
})

/* ------------------------------------------------------ PDFCanvasViewer -- */

/**
 * 읽기 전용 뷰어 (PLAN D15 · R11).
 *
 * ```vue
 * <PDFCanvasViewer
 *   :doc="publicDoc"
 *   :object-types="[shortAnswer]"
 *   :render-object="{ 'answer.short': AnswerInput }"
 *   @change-data="(id, next) => (responses[id] = next)"
 * />
 * ```
 *
 * 편집기와 달리 **`doc` 이 controlled 다.** 뷰어는 문서를 소유하지 않으므로 응답도 저장하지
 * 않는다 — `change-data` 로 올려 보내고 호스트가 새 `doc` 을 내려 준다 (PLAN D29).
 */
export const PDFCanvasViewer = defineComponent({
  name: 'PDFCanvasViewer',

  props: {
    /** 표시할 문서. `toPublicDoc()` 또는 `asPublicDoc()` 으로 만든 브랜드 타입이다 (D28). */
    doc: { type: Object as PropType<PublicPDFCanvasDoc | null>, default: null },
    /** 커스텀 객체 타입. **최초 1회만 읽는다.** */
    objectTypes: { type: Array as PropType<AnyObjectTypeDef[]>, default: undefined },
    /** 최대 배율 상한. 기본은 상한 없음 (D15). */
    maxScale: { type: Number, default: undefined },
    /** 캔버스 안 커스텀 객체 — 응답을 받는 폼이다. */
    renderObject: { type: Object as PropType<SlotMap>, default: undefined },
  },

  emits: {
    changeData: (_objectId: string, _next: unknown) => true,
  },

  setup(props, { emit, expose }) {
    const host = ref<HTMLElement | null>(null)
    let handle: ViewerHandle | null = null

    const mounts = shallowRef<ReadonlyMap<string, HTMLElement>>(new Map())

    const setMount = (objectId: string, el: HTMLElement | null) => {
      const prev = mounts.value
      if (el === null) {
        if (!prev.has(objectId)) return
        const next = new Map(prev)
        next.delete(objectId)
        mounts.value = next
        return
      }
      if (prev.get(objectId) === el) return
      mounts.value = new Map(prev).set(objectId, el)
    }

    onMounted(() => {
      if (!host.value) return
      handle = createPDFCanvasViewer(host.value, {
        doc: props.doc,
        ...(props.objectTypes ? { objectTypes: props.objectTypes } : {}),
        ...(props.maxScale !== undefined ? { maxScale: props.maxScale } : {}),
        onChangeData: (objectId, next) => emit('changeData', objectId, next),
        onMountCustom: setMount,
      })
    })

    // `doc` 과 `maxScale` 을 흘린다. 뷰어는 controlled 다.
    watchEffect(() => {
      handle?.update({
        doc: props.doc,
        ...(props.maxScale !== undefined ? { maxScale: props.maxScale } : {}),
      })
    })

    onBeforeUnmount(() => {
      handle?.destroy()
      handle = null
    })

    expose({
      get handle() {
        return handle
      },
    })

    return () =>
      h('div', { style: 'display:contents' }, [
        h('div', { ref: host, style: 'height:100%' }),
        ...(() => {
          const current = props.doc
          const slots = props.renderObject
          if (!current || !slots) return []
          const out: VNode[] = []
          for (const [objectId, el] of mounts.value) {
            const obj = findCustom(current, objectId)
            if (!obj) continue
            const slot = slots[obj.kind]
            if (!slot) continue
            out.push(
              h(Teleport, { to: el, key: objectId }, [
                h(slot, {
                  objectId,
                  data: obj.data,
                  onChange: (next: unknown) => emit('changeData', objectId, next),
                }),
              ]),
            )
          }
          return out
        })(),
      ])
  },
})
