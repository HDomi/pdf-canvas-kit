/**
 * Vue 래퍼 — `@h_domi/pdf-canvas-kit/vue` (커스텀 객체는 소비자가 정의한다).
 *
 * ```vue
 * <script setup>
 * import { PDFCanvasEditor } from '@h_domi/pdf-canvas-kit/vue'
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
 * 필요하지 않고, `.d.ts` 생성이 평범한 `tsc` 다.
 *
 * ## `Teleport` 로 슬롯을 채운다
 *
 * 렌더 층이 커스텀 객체의 **빈 컨테이너**를 만들고 그 엘리먼트를 알려 준다. `<Teleport :to="el">`
 * 이 그 노드에 컴포넌트를 꽂는다 — React 의 `createPortal` 과 같은 역할이다.
 *
 * 그래서 **vanilla 경로의 제약이 여기서는 사라진다.** `objectType.render` 는 객체당 한 번만
 * 불려야 하고 갱신을 `onUpdate` 로 받아야 하지만, Teleport 안에서는 평범한
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
import type { IconName } from '../core/config/icons'
import type { CustomObject, PDFCanvasDoc, PublicPDFCanvasDoc } from '../core/model/types'
import type { SaveState } from '../core/model/viewState'

export type { EditorHandle, ViewerHandle }

/**
 * `ref` 에 붙는 인스턴스 타입 (R11).
 *
 * Vue 의 `expose()` 는 **런타임 API 라 생성된 `.d.ts` 에 타입이 남지 않는다.** React 는
 * `useImperativeHandle` 로 `ref` 타입이 자동으로 잡히지만 Vue 는 소비자가 명시해야 한다.
 * 그 비대칭을 여기서 메운다 — 없으면 소비자가 캐스트를 발명하게 되고, 공개 API 가 캐스트를
 * 요구하면 그건 API 버그다.
 *
 * ```vue
 * <script setup lang="ts">
 * import { PDFCanvasEditor, type PDFCanvasEditorRef } from '@h_domi/pdf-canvas-kit/vue'
 * const editor = ref<PDFCanvasEditorRef | null>(null)
 * // 캐스트 없이 facade 전체가 나온다
 * await editor.value?.handle?.importFile(file)
 * </script>
 * <template><PDFCanvasEditor ref="editor" :initial-doc="doc" /></template>
 * ```
 */
export interface PDFCanvasEditorRef {
  /** 마운트 전이거나 언마운트 후에는 `null` 이다. */
  handle: EditorHandle | null
}

/** 뷰어의 `ref` 인스턴스 타입. `PDFCanvasEditorRef` 와 같은 이유로 필요하다. */
export interface PDFCanvasViewerRef {
  handle: ViewerHandle | null
}

/** `kind` → 컴포넌트. `objectId` · `data` · `onChange` 를 prop 으로 받는다. */
export type SlotMap = Record<string, Component>

/**
 * 아이콘 이름 → 컴포넌트 (문구·아이콘은 prop 으로 받는다).
 *
 * 글리프만 바꾸려면 `strings` 의 `icon.*` 을, vanilla SVG 는 `icons` 를 쓴다 — 셋 중
 * `icons` 가 가장 먼저 이긴다.
 */
export type IconMap = Partial<Record<IconName, Component>>

/** 문서에서 커스텀 객체를 찾는다. 인스펙터 대상이 현재 페이지가 아닐 수 있어 전부 훑는다. */
function findCustom(doc: PDFCanvasDoc, objectId: string): CustomObject | null {
  for (const page of doc.pages) {
    for (const obj of page.objects) {
      if (obj.id === objectId && obj.type === 'custom') return obj
    }
  }
  return null
}

/**
 * 아이콘 컨테이너에 Teleport 한다.
 *
 * 키는 엘리먼트가 아니라 이름+순번이다 — Teleport 의 `key` 는 문자열이어야 한다.
 */
function iconPortals(
  mounts: ReadonlyMap<HTMLElement, IconName>,
  icons: IconMap | undefined,
): VNode[] {
  if (!icons) return []
  const out: VNode[] = []
  let i = 0
  for (const [node, name] of mounts) {
    const comp = icons[name]
    i++
    if (!comp) continue
    out.push(h(Teleport, { to: node, key: `${name}-${i}` }, [h(comp)]))
  }
  return out
}

export const PDFCanvasEditor = defineComponent({
  name: 'PDFCanvasEditor',

  props: {
    /**
     * 초기 문서. **최초 1회만 읽는다** — 편집기가 문서를 소유하고 `change` 로 밀어낸다.
     * 이름이 그 계약이다.
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
    /**
     * 문서 불러오기 UI 를 호스트가 맡는다 (커스터마이징은 토큰 → @layer → 다이얼로그 위임 3단계다).
     *
     * 주면 내장 업로드 팝업을 띄우지 않는다. 파일은 `handle.importFile(file)` 로 넘긴다.
     */
    onRequestUpload: {
      type: Function as PropType<EditorProps['onRequestUpload']>,
      default: undefined,
    },
    /** 확인 모달을 호스트가 맡는다. 결과는 `handle.confirmPending()` · `cancelPending()`. */
    onRequestConfirm: {
      type: Function as PropType<EditorProps['onRequestConfirm']>,
      default: undefined,
    },
    /** import 진행률·오류. 내장 팝업을 끈 호스트가 자기 UI 에 보여준다. */
    onImportStateChange: {
      type: Function as PropType<EditorProps['onImportStateChange']>,
      default: undefined,
    },
    /** 커스텀 객체 타입 (커스텀 객체는 소비자가 정의한다). **최초 1회만 읽는다.** */
    objectTypes: { type: Array as PropType<AnyObjectTypeDef[]>, default: undefined },
    /** 캔버스 안 커스텀 객체. */
    renderObject: { type: Object as PropType<SlotMap>, default: undefined },
    /** 우측 인스펙터. 커스텀 객체의 **편집 창구는 여기 하나**다 (커스텀 객체의 편집 창구는 인스펙터 하나다). */
    renderInspector: { type: Object as PropType<SlotMap>, default: undefined },
    /** 아이콘을 컴포넌트로 교체한다 (D32). **최초 1회만 읽는다.** */
    renderIcon: { type: Object as PropType<IconMap>, default: undefined },
    /** UI 문구 오버라이드. **최초 1회만 읽는다.** 전역 표에 병합된다 (§19.4). */
    strings: { type: Object as PropType<EditorProps['strings']>, default: undefined },
    /** 아이콘을 vanilla 노드로 교체한다. **최초 1회만 읽는다.** */
    icons: { type: Object as PropType<EditorProps['icons']>, default: undefined },
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
    /*
     * 아이콘은 **엘리먼트를 키로** 쓴다.
     *
     * 같은 아이콘이 여러 곳에 나온다 — `icon.remove`(×)는 인스펙터 필드마다 하나씩이다.
     * 이름을 키로 쓰면 나중 것이 앞의 것을 덮어써 하나만 그려진다.
     */
    const iconMounts = shallowRef<ReadonlyMap<HTMLElement, IconName>>(new Map())

    const setIcon = (name: IconName, el: HTMLElement | null) => {
      const prev = iconMounts.value
      if (el === null) {
        // 엘리먼트가 null 이면 그 이름의 항목을 전부 걷는다.
        const next = new Map<HTMLElement, IconName>()
        let changed = false
        for (const [node, n] of prev) {
          if (n === name) changed = true
          else next.set(node, n)
        }
        if (changed) iconMounts.value = next
        return
      }
      if (prev.get(el) === name) return
      iconMounts.value = new Map(prev).set(el, name)
    }

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
        // 다이얼로그 위임 (D31). 아래 watchEffect 가 갱신도 흘린다.
        ...(props.onRequestUpload ? { onRequestUpload: props.onRequestUpload } : {}),
        ...(props.onRequestConfirm ? { onRequestConfirm: props.onRequestConfirm } : {}),
        ...(props.onImportStateChange ? { onImportStateChange: props.onImportStateChange } : {}),
        onChange: (next) => {
          doc.value = next
          emit('change', next)
        },
        onSaveStateChange: (state) => emit('saveStateChange', state),
        onBack: () => emit('back'),
        onMountCustom: setMount(objectMounts),
        onMountInspector: setMount(inspectorMounts),
        onMountIcon: setIcon,
        // 문구·아이콘은 최초 1회만 읽는다 (§19.4).
        ...(props.strings ? { strings: props.strings } : {}),
        ...(props.icons ? { icons: props.icons } : {}),
      })
      doc.value = handle.getDoc()
    })

    /*
     * prop 변경을 흘린다. `initialDoc` 류는 facade 가 무시한다.
     *
     * ⚠️ **`handle?.update({ … props.x … })` 로 쓰면 안 된다.**
     *
     * optional chaining 이 짧은 순환하면 **인자 표현식도 평가되지 않는다.** `watchEffect` 의
     * 첫 실행은 `setup` 시점이고 그때 `handle` 은 아직 `null` 이므로(생성은 `onMounted`),
     * prop 이 한 번도 읽히지 않아 **의존성이 등록되지 않는다.** 그러면 이후 prop 이 바뀌어도
     * 이 effect 는 영원히 다시 돌지 않는다 — 2026.08.21 에 뷰어에서 그 버그가 났다.
     *
     * 객체를 먼저 만들어 prop 을 확실히 읽는다.
     */
    watchEffect(() => {
      const next: Partial<EditorProps> = {
        readOnly: props.readOnly,
        ...(props.autosave !== undefined ? { autosave: props.autosave } : {}),
        ...(props.ports ? { ports: props.ports } : {}),
        ...(props.uploadFile ? { uploadFile: props.uploadFile } : {}),
        /*
         * 다이얼로그 위임도 흘린다 (D31). React 래퍼는 prop 을 통째로 넘기므로 자동으로
         * 갱신되는데, Vue 는 나열식이라 여기 없으면 마운트 값에 고정된다 — 같은 계약이
         * 프레임워크마다 다르게 동작하면 그게 버그의 형태다.
         */
        ...(props.onRequestUpload ? { onRequestUpload: props.onRequestUpload } : {}),
        ...(props.onRequestConfirm ? { onRequestConfirm: props.onRequestConfirm } : {}),
        ...(props.onImportStateChange ? { onImportStateChange: props.onImportStateChange } : {}),
      }
      handle?.update(next)
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
        ...iconPortals(iconMounts.value, props.renderIcon),
      ])
  },
})

/* ------------------------------------------------------ PDFCanvasViewer -- */

/**
 * 읽기 전용 뷰어 (편집기는 데스크탑 전용, 뷰어만 반응형이다).
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
 * 않는다 — `change-data` 로 올려 보내고 호스트가 새 `doc` 을 내려 준다 (뷰어는 응답을 갖지 않는다).
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

    /*
     * `doc` 과 `maxScale` 을 흘린다. 뷰어는 controlled 다.
     *
     * ⚠️ prop 을 먼저 읽는다. optional chaining 안에서 읽으면 첫 실행(`handle === null`)에
     * 의존성이 등록되지 않아 이후 갱신이 전부 무시된다 — 위 편집기 쪽 주석 참고.
     */
    watchEffect(() => {
      const next = {
        doc: props.doc,
        ...(props.maxScale !== undefined ? { maxScale: props.maxScale } : {}),
      }
      handle?.update(next)
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
