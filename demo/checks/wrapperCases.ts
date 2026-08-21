/**
 * 프레임워크 래퍼 검증.
 *
 * 여기서 확인하는 것은 **소비자가 facade 에 닿을 수 있는가**다. 래퍼가 화면을 그려도 `ref` 가
 * 비어 있으면 `toPublicDoc()` 이 조용히 `undefined` 를 돌려주고, 호스트의 [내보내기] 버튼이
 * 에러 없이 아무 일도 하지 않는다 — 2026.08.21 에 실제로 그렇게 새어 나갔다.
 *
 * ## JSX 를 쓰지 않는다
 *
 * 헤드리스 러너(`scripts/run-checks.mjs`)에 `@vitejs/plugin-react` 도 `plugin-vue` 도 없다.
 * 플러그인을 넣으면 케이스 전체의 번들 경로가 바뀌므로, `createElement` 와 `h()` 를 직접
 * 부른다 — SFC 없이도 래퍼 계약은 전부 확인된다.
 *
 * ## effect flush 를 직접 다룬다
 *
 * `act` 가 이 번들 형태에서 잡히지 않는다. `flushSync` 는 렌더와 **layout effect** 까지만
 * 동기로 돌리고 `useEffect`(passive)는 다음 태스크로 미뤄지므로, 매크로태스크를 몇 번 양보해야
 * 마운트가 끝난 상태를 볼 수 있다. **이 순서 차이가 검증 대상 그 자체다** — 래퍼가 layout
 * effect 에서 `ref` 를 채우면 그 시점의 facade 는 아직 없다.
 */
import { createApp, defineComponent, h, nextTick, ref, shallowRef } from 'vue'
import { createElement, createRef } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { PDFCanvasEditor, PDFCanvasViewer } from '../../src/react/index'
import type { EditorHandle, ViewerHandle } from '../../src/react/index'
import { mountProps, updatableProps, updatableViewerProps } from '../../src/vue/props'
import {
  PDFCanvasEditor as VueEditor,
  PDFCanvasViewer as VueViewer,
  type PDFCanvasEditorRef,
} from '../../src/vue/index'
import type { PublicPDFCanvasDoc } from '@h_domi/pdf-canvas-kit'
import { asPublicDoc, createPDFCanvasDoc, createPage, A4_PT } from '@h_domi/pdf-canvas-kit'
import type { CaseGroup } from './cases'

/** 마운트하고 passive effect 까지 끝난 뒤 검사한다. */
async function mounted<T>(
  render: (host: HTMLElement) => void,
  read: (host: HTMLElement) => T,
): Promise<T> {
  const host = document.createElement('div')
  document.body.append(host)
  flushSync(() => render(host))
  // passive effect 는 다음 태스크다. 여유를 두고 양보한다.
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
  const result = read(host)
  host.remove()
  return result
}

const oneDoc = () => createPDFCanvasDoc({ pages: [createPage({ size: A4_PT })] })

const REACT_GROUPS: CaseGroup[] = [
  {
    title: 'react 래퍼 — ref 로 facade 에 닿는다 ★',
    note: 'useImperativeHandle 은 layout effect 라 편집기를 만드는 useEffect 보다 먼저 돈다. 그걸로 ref 를 채우면 null 이 박히고, 소비자의 [내보내기] 가 에러 없이 아무 일도 하지 않는다.',
    cases: [
      {
        name: '★ 마운트 후 ref 가 채워진다',
        expected: true,
        actual: () =>
          mounted(
            (host) =>
              createRoot(host).render(
                createElement(PDFCanvasEditor, { ref: refEditor, initialDoc: oneDoc() }),
              ),
            () => refEditor.current !== null,
          ),
      },
      {
        name: '★ ref 로 facade 메서드를 부를 수 있다 (toPublicDoc 이 undefined 가 아니다)',
        expected: 1,
        actual: () =>
          mounted(
            (host) =>
              createRoot(host).render(
                createElement(PDFCanvasEditor, { ref: refEditor2, initialDoc: oneDoc() }),
              ),
            () => refEditor2.current?.toPublicDoc().pages.length ?? -1,
          ),
      },
      {
        name: '편집기가 실제로 그려진다',
        expected: true,
        actual: () =>
          mounted(
            (host) => createRoot(host).render(createElement(PDFCanvasEditor, {})),
            (host) => host.querySelector('.pck-editor') !== null,
          ),
      },
      {
        name: '★ 뷰어도 ref 로 facade 에 닿는다',
        expected: 2,
        actual: () =>
          mounted(
            (host) =>
              createRoot(host).render(
                createElement(PDFCanvasViewer, {
                  ref: refViewer,
                  doc: asPublicDoc(
                    createPDFCanvasDoc({
                      pages: [createPage({ size: A4_PT }), createPage({ size: A4_PT })],
                    }),
                  ),
                }),
              ),
            () => refViewer.current?.pageCount() ?? -1,
          ),
      },
      {
        name: '뷰어가 doc 없이도 그려진다 (빈 상태)',
        expected: true,
        actual: () =>
          mounted(
            (host) => createRoot(host).render(createElement(PDFCanvasViewer, { doc: null })),
            (host) => host.querySelector('.pck-viewer-empty') !== null,
          ),
      },
    ],
  },
]

/* ------------------------------------------------------------ Vue 래퍼 -- */

/** Vue 앱을 마운트하고 `nextTick` + 태스크 양보까지 기다린다. */
async function vueMounted<T>(
  setup: (host: HTMLElement) => void,
  read: (host: HTMLElement) => Promise<T> | T,
): Promise<T> {
  const host = document.createElement('div')
  document.body.append(host)
  setup(host)
  await nextTick()
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0))
  const result = await read(host)
  host.remove()
  return result
}

const twoPageDoc = () =>
  createPDFCanvasDoc({ pages: [createPage({ size: A4_PT }), createPage({ size: A4_PT })] })

const VUE_GROUPS: CaseGroup[] = [
  {
    title: 'vue 래퍼 — prop 갱신이 흘러야 한다 ★',
    note: '⚠️ handle?.update({ … props.x … }) 로 쓰면 optional chaining 이 짧은 순환해 인자 표현식도 평가되지 않는다. watchEffect 의 첫 실행은 setup 시점이고 그때 handle 은 null 이므로 의존성이 등록되지 않고, 이후 갱신이 전부 무시된다.',
    cases: [
      {
        name: 'expose 로 handle 에 닿는다',
        expected: ['set', true],
        actual: () => {
          const r = ref<PDFCanvasEditorRef | null>(null)
          return vueMounted(
            (host) => {
              const App = defineComponent({
                setup: () => () => h(VueEditor, { ref: r, initialDoc: twoPageDoc() }),
              })
              createApp(App).mount(host)
            },
            () => [
              r.value === null ? 'null' : 'set',
              typeof r.value?.handle?.toPublicDoc === 'function',
            ],
          )
        },
      },
      {
        /*
         * ★ 이 케이스가 2026.08.21 의 버그를 잡는다.
         *
         * 편집기에서 [뷰어로 보내기] 를 눌러도 뷰어가 "표시할 문서가 없습니다" 에 머물렀다.
         * doc prop 이 바뀌었는데 watchEffect 가 다시 돌지 않았기 때문이다.
         */
        name: '★ doc prop 갱신이 뷰어에 반영된다 (optional chaining 함정)',
        expected: [0, 2],
        actual: () => {
          const doc = shallowRef<PublicPDFCanvasDoc | null>(null)
          return vueMounted(
            (host) => {
              const App = defineComponent({
                setup: () => () => h(VueViewer, { doc: doc.value }),
              })
              createApp(App).mount(host)
            },
            async (host) => {
              const before = host.querySelectorAll('.pck-page-frame').length
              doc.value = asPublicDoc(twoPageDoc())
              await nextTick()
              for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0))
              return [before, host.querySelectorAll('.pck-page-frame').length]
            },
          )
        },
      },
      {
        name: '★ 편집기의 readOnly prop 갱신도 흘러야 한다 (같은 함정)',
        expected: [false, true],
        actual: () => {
          const readOnly = ref(false)
          const r = ref<PDFCanvasEditorRef | null>(null)
          return vueMounted(
            (host) => {
              const App = defineComponent({
                setup: () => () =>
                  h(VueEditor, { ref: r, initialDoc: twoPageDoc(), readOnly: readOnly.value }),
              })
              createApp(App).mount(host)
            },
            async (host) => {
              // 읽기 전용이면 툴바 도구가 비활성된다.
              const enabled = () =>
                host.querySelector<HTMLButtonElement>('.pck-toolbar button')?.disabled ?? null
              const before = enabled()
              readOnly.value = true
              await nextTick()
              for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0))
              return [before, enabled()]
            },
          )
        },
      },
      {
        name: '뷰어가 편집기 문서를 그대로 그린다 (편집기 → 뷰어 왕복)',
        expected: 2,
        actual: () => {
          const r = ref<PDFCanvasEditorRef | null>(null)
          const doc = shallowRef<PublicPDFCanvasDoc | null>(null)
          return vueMounted(
            (host) => {
              const App = defineComponent({
                setup: () => () => [
                  h(VueEditor, { ref: r, initialDoc: twoPageDoc() }),
                  h(VueViewer, { doc: doc.value }),
                ],
              })
              createApp(App).mount(host)
            },
            async (host) => {
              doc.value = r.value!.handle!.toPublicDoc()
              await nextTick()
              for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0))
              return host.querySelectorAll('.pck-viewer .pck-page-frame').length
            },
          )
        },
      },
    ],
  },
]

/*
 * ref 를 케이스 밖에 두는 이유: `actual` 이 두 콜백으로 나뉘어 있고, 렌더 콜백이 만든 ref 를
 * 읽기 콜백이 봐야 한다. 케이스마다 별도 ref 를 써서 서로 간섭하지 않게 한다.
 */
const refEditor = createRef<EditorHandle>()
const refEditor2 = createRef<EditorHandle>()
const refViewer = createRef<ViewerHandle>()

/**
 * Vue prop 전달 (2026.08.21) ★
 *
 * `updatableProps` 를 순수 함수로 뽑은 이유가 이 그룹이다. 예전에는 흘릴 prop 을 `setup()` 안에
 * 나열했고 D33 의 셋(`shortcuts` · `warnOnUnload` · `onError`)이 빠져 Vue 에서만 먹지 않았다.
 * "제외 목록만 둔다" 로 뒤집은 뒤에도 그 제외 목록이 잘못되면 같은 증상이 나므로 고정한다.
 */
const VUE_PROPS_GROUP: CaseGroup = {
  title: 'wrapper — Vue prop 전달 (2026.08.21) ★',
  note: 'facade 는 아는 키만 읽으므로 "전부 넘기고 제외만 적는" 방향이 안전하다. 나열식은 새 prop 을 빠뜨린다.',
  cases: [
    {
      name: '★ D33 prop 셋이 갱신으로 흘러간다 (2026.08.21 에 전부 빠져 있었다)',
      expected: { shortcuts: false, warnOnUnload: false, onError: 'function' },
      actual: () => {
        const out = updatableProps({
          shortcuts: false,
          warnOnUnload: false,
          onError: () => {},
          readOnly: false,
        })
        return {
          shortcuts: out.shortcuts,
          warnOnUnload: out.warnOnUnload,
          onError: typeof out.onError,
        }
      },
    },
    {
      name: '`undefined` 는 빼고 넘긴다 — facade 기본값을 undefined 로 덮지 않게',
      expected: [false, false],
      actual: () => {
        const out = updatableProps({ autosave: undefined, ports: undefined, readOnly: true })
        return ['autosave' in out, 'ports' in out]
      },
    },
    {
      name: '최초 1회만 읽는 것은 갱신에서 뺀다 (initialDoc · strings · icons …)',
      expected: [],
      actual: () => {
        const out = updatableProps({
          initialDoc: {},
          initialScale: 1,
          objectTypes: [],
          strings: {},
          icons: {},
        })
        return Object.keys(out)
      },
    },
    {
      name: '마운트에는 그것들도 넘긴다 — Vue 전용 키만 뺀다',
      expected: [true, true, false],
      actual: () => {
        const out = mountProps({
          initialDoc: {},
          strings: {},
          renderObject: {},
        }) as Record<string, unknown>
        return ['initialDoc' in out, 'strings' in out, 'renderObject' in out]
      },
    },
    {
      name: '뷰어는 doc 을 흘린다 (controlled) — 편집기의 initialDoc 과 반대다',
      expected: true,
      actual: () => 'doc' in (updatableViewerProps({ doc: null, maxScale: 2 }) as object),
    },
  ],
}

/** React·Vue 두 그룹. 러너와 화면이 이 배열만 본다. */
export const WRAPPER_GROUPS: CaseGroup[] = [...REACT_GROUPS, ...VUE_GROUPS, VUE_PROPS_GROUP]
