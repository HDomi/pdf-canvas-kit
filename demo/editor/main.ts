/**
 * 개발용으로 WorksheetEditor를 마운트한다 (PLAN 14.1).
 *
 * 호스트 앱 역할을 대신한다. pdf.js 자산을 설정하고 데모 port를 주입하며, 매번 업로드 팝업을
 * 클릭하지 않고 픽스처를 불러올 수 있는 dev 바를 붙인다.
 */
import { createApp, defineComponent, h, ref, shallowRef } from 'vue'
import {
  clearPrototypeSave,
  configurePdfResources,
  createConsoleStoragePort,
  hasPrototypeSave,
  loadPrototype,
  type SaveState,
  type WorksheetDoc,
} from '@lumiteach/worksheet-system'
import { WorksheetEditor } from '@lumiteach/worksheet-system/vue'
import '../styles.css'

/**
 * pdf.js가 런타임에 가져오는 자산들. `npm run copy:pdfjs` 가 자리를 잡아 준다.
 * `cMapUrl` 이 없으면 렌더된 페이지에서 한글이 조용히 사라진다 (ARCHITECTURE §4).
 */
configurePdfResources({
  workerSrc: '/pdfjs/pdf.worker.mjs',
  cMapUrl: '/pdfjs/cmaps/',
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/',
  iccUrl: '/pdfjs/iccs/',
})

/**
 * 저장 대체 구현 (PLAN 18.2).
 *
 * 실제 서버가 아직 없어 콘솔에 문서를 출력한다. 자동저장 파이프라인(5초 디바운스, 최대 지연 30초,
 * 실패 재시도)은 그대로 동작하므로 저장 주기와 배지 상태를 실제와 같은 조건에서 확인할 수 있다.
 * 문서 전체는 `console.debug` 로 나가므로 콘솔에서 Verbose 레벨을 켜면 보인다.
 */
const storage = createConsoleStoragePort({ label: '[demo]' })

const FIXTURES = [
  ['a4-3page.pdf', 'A4 3p'],
  ['mixed-size.pdf', '크기 혼합 6p'],
  ['rotated-90.pdf', 'Rotate'],
  ['korean.pdf', '한글'],
  ['large-100page.pdf', '100p'],
] as const

const DevHarness = defineComponent({
  setup() {
    const doc = shallowRef<WorksheetDoc | null>(null)
    const status = ref('픽스처를 눌러 불러오거나, 편집기에서 [문서 불러오기] 를 쓴다.')
    const locale = ref<'ko' | 'en'>('ko')
    const saveState = ref<SaveState>('disabled')
    const hasSave = ref(hasPrototypeSave())

    /**
     * 편집기 자신의 import 경로를 통해 픽스처를 불러온다.
     *
     * private API가 아니라 DOM file input을 거친다. 실제 업로드와 같은 코드 경로를 지나가는 것이
     * 이 하네스의 목적이다.
     */
    async function loadFixture(name: string) {
      status.value = `${name} 불러오는 중…`
      const res = await fetch(`/fixtures/${name}`)
      if (!res.ok) {
        status.value = `픽스처 없음: ${name} — npm run fixtures 를 먼저 실행한다.`
        return
      }
      const file = new File([await res.blob()], name, { type: 'application/pdf' })
      const input = document.querySelector<HTMLInputElement>('.lws-modal input[type=file]')
      if (!input) {
        status.value = '업로드 팝업을 먼저 열어야 한다. [문서 불러오기] 클릭.'
        return
      }
      const dt = new DataTransfer()
      dt.items.add(file)
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
      status.value = `${name} 변환 요청`
    }

    /**
     * ⚠️ 프로토타입 저장 확인용.
     *
     * 상단바 [저장] 이 localStorage에 넣은 데이터를 다시 읽어 편집기에 로드한다. 뷰어가 만들어지면
     * 이 흐름을 뷰어가 담당한다 (src/prototype/README.md).
     */
    function reloadFromPrototype() {
      const loaded = loadPrototype()
      if (!loaded) {
        status.value = '저장된 데이터가 없다. 상단바 [저장] 을 먼저 누른다.'
        return
      }
      doc.value = loaded
      status.value = `불러옴 · ${loaded.pages.length} 페이지 · "${loaded.title}"`
    }

    return () =>
      h('div', { style: 'display:contents' }, [
        h('div', { class: 'devbar' }, [
          h('a', { href: '/', style: 'color:#9fd3ff' }, '← 목록'),
          h('span', 'fixtures:'),
          ...FIXTURES.map(([file, label]) =>
            h('button', { onClick: () => void loadFixture(file), title: file }, label),
          ),
          h('span', { class: 'spacer' }),
          h(
            'button',
            { onClick: () => (locale.value = locale.value === 'ko' ? 'en' : 'ko') },
            `locale: ${locale.value}`,
          ),
          h('span', `save: ${saveState.value}`),
          h(
            'button',
            { onClick: reloadFromPrototype, title: 'localStorage 에서 다시 불러온다' },
            '불러오기',
          ),
          h(
            'button',
            {
              onClick: () => {
                clearPrototypeSave()
                hasSave.value = false
                status.value = 'localStorage 저장 데이터를 지웠다.'
              },
            },
            '저장 삭제',
          ),
          h('span', hasSave.value ? '(저장 있음)' : ''),
          h('span', status.value),
        ]),
        h(
          'div',
          { class: 'editor-host' },
          h(WorksheetEditor, {
            doc: doc.value,
            locale: locale.value,
            // 콘솔 출력 StoragePort. 이걸 주면 자동저장이 켜진다.
            ports: { storage },
            onSaveStateChange: (state: SaveState) => (saveState.value = state),
            onChange: (next: WorksheetDoc) => {
              status.value = `${next.pages.length} 페이지 · "${next.title}"`
              // 상단바 [저장] 을 누르면 localStorage가 채워진다. 상태를 다시 읽어 표시를 맞춘다.
              hasSave.value = hasPrototypeSave()
            },
            onBack: () => (status.value = 'back 이벤트'),
            onRequestExport: () => {
              // 상단바 버튼이 프로토타입 저장으로 대체돼 있어 이 이벤트는 지금 발생하지 않는다.
              // 호스트가 expose된 `requestExport()` 를 직접 부르면 여기로 들어온다 (PLAN 18.5).
              status.value = 'requestExport 이벤트 (검증 통과)'
            },
          }),
        ),
      ])
  },
})

createApp(DevHarness).mount('#app')
