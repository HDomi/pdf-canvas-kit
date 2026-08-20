/**
 * Vue 소비 예제 (PLAN 20.17).
 *
 * React 예제(`demo/react/main.tsx`)와 **같은 타입 정의를 같은 방식으로** 쓴다. 다른 것은
 * portal 메커니즘뿐이다 — React 는 `createPortal`, Vue 는 `Teleport`.
 *
 * SFC 를 쓰지 않는다. 데모 빌드에 `@vitejs/plugin-vue` 를 넣지 않기 위해서다 — 라이브러리가
 * SFC 를 쓰지 않으므로(PLAN 20.3) 데모도 같은 조건으로 두는 편이 정직하다.
 */
import { createApp, defineComponent, h, ref } from 'vue'
import {
  clearPrototypeSave,
  configurePdfResources,
  createConsoleStoragePort,
  defineObjectType,
  loadPrototype,
  type PDFCanvasDoc,
} from 'pdf-canvas-kit'
import { PDFCanvasEditor, type EditorHandle } from 'pdf-canvas-kit/vue'
import 'pdf-canvas-kit/styles.css'

configurePdfResources({
  workerSrc: '/pdfjs/pdf.worker.mjs',
  cMapUrl: '/pdfjs/cmaps/',
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/',
  iccUrl: '/pdfjs/iccs/',
})

const storage = createConsoleStoragePort({ label: '[vue-demo]' })

/* --------------------------------------------------- 커스텀 객체 타입 -- */

interface ChoiceData {
  choices: string[]
  correct: number
}

/** React 예제와 동일하다. 렌더가 없는 이유는 그쪽 주석 참고. */
const choice = defineObjectType<ChoiceData>({
  kind: 'demo.choice',
  label: '선택형',
  defaultSize: { w: 200, h: 44 },
  minSize: { w: 80, h: 32 },
  defaultData: () => ({ choices: ['', ''], correct: 0 }),
  rotatable: false,
  validate: (d) => {
    const filled = d.choices.filter((c) => c.trim())
    if (filled.length < 2) return ['보기를 2개 이상 입력하세요']
    if (!d.choices[d.correct]?.trim()) return ['정답 보기를 고르세요']
    return null
  },
  toPublic: ({ correct: _correct, ...rest }) => rest,
})

/** 슬롯 컴포넌트가 받는 prop. 래퍼가 이 세 개를 넘긴다. */
const slotProps = {
  objectId: { type: String, required: true as const },
  data: { type: Object as () => ChoiceData, required: true as const },
} as const

const ChoiceCanvas = defineComponent({
  props: slotProps,
  setup(props) {
    return () => {
      const filled = props.data.choices.filter((c) => c.trim())
      return h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '100%',
            padding: '0 8px',
            fontSize: '11px',
            color: filled.length >= 2 ? 'inherit' : '#b4342b',
          },
        },
        [
          h('span', filled.length >= 2 ? `${filled.length}개 보기` : '보기 미완성'),
          h('span', { 'aria-hidden': 'true' }, '▾'),
        ],
      )
    }
  },
})

/**
 * 인스펙터. **여기가 vanilla 슬롯과 갈리는 지점이다.**
 *
 * 보기 개수가 동적이다 — `v-for` 로 그리고 버튼으로 추가·삭제한다. vanilla 경로에서는
 * `render` 가 한 번만 불리므로 DOM 을 손으로 다뤄야 했다 (PLAN 20.15).
 *
 * 포커스 가드도 필요 없다. Vue 가 노드를 재사용하므로 `document.activeElement` 를 볼 일이
 * 없다 (PLAN 20.14 의 문제가 여기서는 발생하지 않는다).
 */
const ChoiceInspector = defineComponent({
  props: slotProps,
  emits: { change: (_d: ChoiceData) => true },
  setup(props, { emit }) {
    const set = (i: number, value: string) => {
      const choices = [...props.data.choices]
      choices[i] = value
      emit('change', { ...props.data, choices })
    }

    return () =>
      h('section', { class: 'pck-panel-section' }, [
        h('h3', { class: 'pck-field-label' }, '보기'),

        ...props.data.choices.map((c, i) =>
          h('div', { class: 'pck-row', key: i }, [
            h('input', {
              class: 'pck-check',
              type: 'radio',
              name: 'vue-choice-correct',
              'aria-label': `정답 ${i + 1}`,
              checked: props.data.correct === i,
              onChange: () => emit('change', { ...props.data, correct: i }),
            }),
            h('input', {
              class: 'pck-input',
              value: c,
              placeholder: `보기 ${i + 1}`,
              onInput: (e: Event) => set(i, (e.target as HTMLInputElement).value),
            }),
            h(
              'button',
              {
                class: 'pck-row-btn',
                type: 'button',
                'aria-label': 'remove',
                disabled: props.data.choices.length <= 2,
                onClick: () => {
                  const choices = props.data.choices.filter((_, k) => k !== i)
                  emit('change', {
                    choices,
                    // 정답 인덱스가 밀리지 않게 보정한다.
                    correct:
                      props.data.correct > i
                        ? props.data.correct - 1
                        : Math.min(props.data.correct, choices.length - 1),
                  })
                },
              },
              '×',
            ),
          ]),
        ),

        h(
          'button',
          {
            class: 'pck-dashed-btn pck-dashed-btn--sm',
            type: 'button',
            disabled: props.data.choices.length >= 5,
            onClick: () => emit('change', { ...props.data, choices: [...props.data.choices, ''] }),
          },
          '+ 보기 추가',
        ),
      ])
  },
})

/* ------------------------------------------------------------------ 앱 -- */

const FIXTURES = [
  ['a4-3page.pdf', 'A4 3p'],
  ['korean.pdf', '한글'],
] as const

const App = defineComponent({
  setup() {
    const status = ref('픽스처를 눌러 불러온다.')
    const seed = ref(0)
    const loaded = ref<PDFCanvasDoc | null>(null)
    const editor = ref<{ handle: EditorHandle | null } | null>(null)

    async function loadFixture(name: string) {
      status.value = `${name} 불러오는 중…`
      try {
        const res = await fetch(`/fixtures/${name}`)
        if (!res.ok) throw new Error(`${res.status} — npm run fixtures 를 먼저 실행한다`)
        const file = new File([await res.blob()], name, { type: 'application/pdf' })
        await editor.value?.handle?.importFile(file)
      } catch (err) {
        status.value = `실패: ${err instanceof Error ? err.message : String(err)}`
      }
    }

    return () =>
      h('div', { style: 'display:contents' }, [
        h('div', { class: 'devbar' }, [
          h('strong', 'vue'),
          ...FIXTURES.map(([file, label]) =>
            h('button', { type: 'button', onClick: () => void loadFixture(file) }, label),
          ),
          h(
            'button',
            {
              type: 'button',
              onClick: () => {
                const doc = loadPrototype()
                if (!doc) {
                  status.value = '저장된 데이터가 없다. /editor/ 에서 먼저 저장한다.'
                  return
                }
                loaded.value = doc
                // initialDoc 은 최초 1회만 읽힌다 — key 를 바꿔 리마운트한다 (PLAN 20.8).
                seed.value++
                status.value = `불러옴 · ${doc.pages.length} 페이지`
              },
            },
            '불러오기',
          ),
          h(
            'button',
            {
              type: 'button',
              onClick: () => {
                clearPrototypeSave()
                status.value = '저장 삭제됨.'
              },
            },
            '저장 삭제',
          ),
          h(
            'button',
            { type: 'button', onClick: () => editor.value?.handle?.fitPage() },
            '페이지 맞춤',
          ),
          h('span', { style: 'margin-left:auto' }, status.value),
        ]),

        h('div', { class: 'editor-host' }, [
          h(PDFCanvasEditor, {
            key: seed.value,
            ref: editor,
            initialDoc: loaded.value,
            ports: { storage },
            objectTypes: [choice],
            renderObject: { 'demo.choice': ChoiceCanvas },
            renderInspector: { 'demo.choice': ChoiceInspector },
            onChange: (doc: PDFCanvasDoc) =>
              (status.value = `${doc.pages.length} 페이지 · "${doc.title}"`),
          }),
        ]),
      ])
  },
})

const host = document.getElementById('app')
if (!host) throw new Error('[vue-demo] #app not found')
createApp(App).mount(host)
