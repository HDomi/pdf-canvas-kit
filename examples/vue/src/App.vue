<script setup lang="ts">
/**
 * Vue 소비자 예제.
 *
 * `demo/` 와 다른 점이 하나뿐이지만 그것이 핵심이다. **별칭이 없다.** `@h_domi/pdf-canvas-kit` 을
 * `node_modules` 에서 `exports` 맵으로 해석하므로 빌드 산출물과 진입점 정의가 틀리면 여기서
 * 즉시 드러난다.
 *
 * ## 이 예제가 보여주는 것 셋
 *
 * | | 어디서 |
 * | --- | --- |
 * | 커스텀 객체를 Teleport 로 채운다 | `slots/` |
 * | **패키지 팝업을 호스트 모달로 대체한다** (D31) | `components/{Confirm,Upload}Dialog.vue` |
 * | **패키지 스타일을 단일 클래스로 덮어쓴다** (`@layer`) | `theme.css` + [테마] 토글 |
 *
 * 편집기와 뷰어를 나란히 두지 않는다 — 편집기는 3분할이고 페이지 목록 + 인스펙터를 고정
 * 폭으로 먹어 절반 폭에서는 못 쓴다 (D15). 탭으로 전환하고 **둘 다 마운트해 둔다.**
 */
import { computed, ref, shallowRef } from 'vue'
import {
  PDFCanvasEditor,
  PDFCanvasViewer,
  type PDFCanvasEditorRef,
} from '@h_domi/pdf-canvas-kit/vue'
import {
  configurePdfResources,
  createPDFCanvasDoc,
  createPage,
  A4_PT,
  LIMITS,
  type ConfirmRequest,
  type ImportState,
  type PDFCanvasDoc,
  type PublicPDFCanvasDoc,
} from '@h_domi/pdf-canvas-kit'
import '@h_domi/pdf-canvas-kit/styles.css'
import './host.css'
import { OBJECT_TYPES } from './objectType'
import AnswerBadge from './slots/AnswerBadge.vue'
import AnswerFields from './slots/AnswerFields.vue'
import AnswerInput from './slots/AnswerInput.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import UploadDialog from './components/UploadDialog.vue'
import DevBar from './components/DevBar.vue'
import CodeHint from './components/CodeHint.vue'
import { useThemeToggle } from './useThemeToggle'
import { demoHomeUrl, siblingExampleUrl } from './links'
import BackIcon from './icons/BackIcon.vue'
import UndoIcon from './icons/UndoIcon.vue'
import RedoIcon from './icons/RedoIcon.vue'
import ZoomInIcon from './icons/ZoomInIcon.vue'
import ZoomOutIcon from './icons/ZoomOutIcon.vue'
import { closeIconNode } from './icons/closeIconNode'

/*
 * 문구를 호스트가 정한다 (문구·아이콘은 prop 으로 받는다).
 *
 * 번역이 필요한 앱은 자기 i18n 에서 뽑아 넘긴다. **최초 1회만 읽는다** — 언어를 런타임에
 * 바꾸려면 컴포넌트를 다시 마운트한다.
 */
const STRINGS = {
  // 글리프도 문구다. 캐럿만 다른 유니코드로 바꿔 본다
  'icon.caret': '⌄',
  'toolbar.duplicate': '복사',
  'confirm.deletePage': '이 페이지의 객체가 함께 사라집니다. 계속할까요?',
  'inspector.empty': '캔버스에서 객체를 골라 주세요',
}

/**
 * vanilla 아이콘 — 노드를 직접 만든다. `renderIcon`(컴포넌트)보다 **먼저 이긴다.**
 *
 * 여기서는 `close` 만 이 경로로 넣어 우선순위를 드러낸다.
 */
const ICONS = { close: closeIconNode }

/** 프레임워크 컴포넌트 경로. 아이콘 라이브러리를 그대로 쓸 수 있다. */
/*
 * 코드 힌트 본문.
 *
 * 템플릿이 아니라 script 에 둔다 — 템플릿 속성에 여러 줄 백틱 문자열을 넣으면 들여쓰기가
 * 섞여 읽기 어렵고, prettier 가 줄을 다시 접으면서 코드 모양이 깨진다.
 */
const CODE_EDITOR = `import { PDFCanvasEditor } from '@h_domi/pdf-canvas-kit/vue'

<PDFCanvasEditor
  ref="editor"
  :initial-doc="initialDoc"       <!-- 최초 1회만 읽는다. 교체는 key 로 -->
  :object-types="OBJECT_TYPES"    <!-- 툴바가 이 목록에서 나온다 -->
  :render-object="{ 'example.shortAnswer': AnswerBadge }"
  :render-inspector="{ 'example.shortAnswer': AnswerFields }"
  :strings="STRINGS"
  :icons="ICONS"
  :render-icon="RENDER_ICON"
  :on-request-upload="() => (uploadOpen = true)"
  :on-request-confirm="(req) => (confirmReq = req)"
  @change="(d) => (doc = d)"
/>

// ⚠️ ref 타입을 명시한다 — Vue 의 expose 는 .d.ts 에 타입을 남기지 않는다
const editor = ref<PDFCanvasEditorRef | null>(null)`

const CODE_VIEWER = `import { PDFCanvasViewer } from '@h_domi/pdf-canvas-kit/vue'

<PDFCanvasViewer
  :doc="publicDoc"                <!-- controlled — 편집기와 반대다 -->
  :object-types="OBJECT_TYPES"    <!-- 편집기와 같은 배열. kind 가 계약이다 -->
  :render-object="{ 'example.shortAnswer': AnswerInput }"
  @change-data="onChangeData"
/>

// 뷰어는 문서를 소유하지 않는다. 호스트가 고쳐 다시 내려 준다
function onChangeData(objectId: string, next: unknown) {
  publicDoc.value = patch(publicDoc.value, objectId, next)
}`

const CODE_HANDLE = `// ⚠️ 타입을 명시한다. Vue 의 expose 는 런타임 API 라 자동 추론되지 않는다
const editor = ref<PDFCanvasEditorRef | null>(null)

// 검증 게이트 — 실패하면 편집기가 문제 객체로 데려간다
if (!editor.value?.handle?.checkBeforeExport()) return
publicDoc.value = editor.value.handle.toPublicDoc()

// 그 밖에 쓸 수 있는 것
editor.value?.handle?.importFile(file)
editor.value?.handle?.confirmPending()
editor.value?.handle?.cancelPending()
editor.value?.handle?.requestUpload()`

const CODE_THEME = `/* theme.css — 특이도를 올리지 않았고 !important 도 없다 */
.pck-toolbar { justify-content: flex-end; }   /* 배치는 토큰으로 못 한다 */
.pck-panel-head { text-transform: none; }
.pck-stage {
  background-image: radial-gradient(...);     /* 두 값이 함께 필요하다 */
  background-size: 18px 18px;
}

/* 토큰만 바꾸는 것으로 끝나는 경우가 대부분이다 */
.pck-editor { --pck-accent: #0f9b8e; --pck-radius: 10px; }

/* 토글: import 하면 끌 수 없어 ?raw 로 읽어 <style> 로 넣는다 */
import themeCss from './theme.css?raw'`

const CODE_SLOTS = `// 1. 타입 선언 — 프레임워크 무관. 제네릭이 둘인 이유는 toPublic 때문이다
const shortAnswer = defineObjectType<Answer, PublicAnswer>({
  kind: 'example.shortAnswer',   // Editor ↔ Viewer 계약
  label: '단답형',                // 툴바 버튼 이름
  defaultSize: { w: 160, h: 44 },
  defaultData: () => ({ answers: [], points: 1 }),
  validate: (d) => (d.answers.some((a) => a.trim()) ? null : ['정답을 입력하세요']),
  toPublic: ({ answers: _a, ...rest }) => rest,
})

// 2. SFC 를 붙인다
:render-object="{ 'example.shortAnswer': AnswerBadge }"
:render-inspector="{ 'example.shortAnswer': AnswerFields }"

// 3. 슬롯 SFC 가 받는 것
const props = defineProps<{ objectId: string; data: Answer }>()
const emit = defineEmits<{ change: [next: Answer] }>()`

const CODE_DIALOG = `<PDFCanvasEditor
  :on-request-upload="() => (uploadOpen = true)"
  :on-request-confirm="(req) => (confirmReq = req)"
  :on-import-state-change="(st) => (importing = st)"
/>

// 내 모달에서 결과를 알려준다
editor.value?.handle?.importFile(file)
editor.value?.handle?.confirmPending()
editor.value?.handle?.cancelPending()

// ⚠️ 둘 중 하나를 반드시 부른다. 안 부르면 그 동작은 대기 상태로 남는다`

const CODE_STRINGS = `<PDFCanvasEditor
  :strings="{ 'toolbar.duplicate': '복사', 'icon.caret': '⌄' }"
  :icons="{ close: closeIconNode }"
  :render-icon="{ undo: UndoIcon, redo: RedoIcon }"
/>

/* 아이콘 세 번째 경로 — CSS. 버튼에 data-icon 이 붙어 있다 */
.pck-icon-btn[data-icon='undo'] {
  font-size: 0;
  background: url(undo.svg) center / 16px no-repeat;
}`

const CODE_SHAPES = `import { configureFonts, polygonPoints } from '@h_domi/pdf-canvas-kit'

/* 앱이 실제로 불러오는 폰트만 남긴다. 병합이 아니라 교체다 */
configureFonts([
  { stack: '"Noto Sans KR", sans-serif', label: '본문' },
  { stack: '"Nanum Myeongjo", serif', label: '제목' },
  { stack: 'monospace', label: '코드' },
])
configureFonts([])   // 빈 배열 = 인스펙터에서 글꼴 항목이 사라진다

/* 다각형 정점은 순수 함수로 열려 있다. 단위는 pt — 배율을 곱하지 않는다 */
polygonPoints('diamond', 100, 60)      // '50,0 100,30 50,60 0,30'

/* 선택기 버튼에 data-shape 가 있어 CSS 로 아이콘화할 수 있다 */
.pck-segmented button[data-shape='star'] {
  font-size: 0;
  background: url(/icons/star.svg) center / 16px no-repeat;
}`

const RENDER_ICON = {
  back: BackIcon,
  undo: UndoIcon,
  redo: RedoIcon,
  zoomIn: ZoomInIcon,
  zoomOut: ZoomOutIcon,
}

/*
 * ⚠️ `workerSrc` 만 주면 PDF 는 열리지만 **한국어 글자가 조용히 사라진다.**
 * 자산 복사는 `scripts/dev-examples.mjs` 가 해 준다.
 */
/*
 * 자산 경로의 기준.
 *
 * `import.meta.env.BASE_URL` 은 vite 가 빌드 시점의 `base` 로 치환한다 — dev 는 `/`,
 * GitHub Pages 는 `/pdf-canvas-kit/react/` 다. 절대 경로로 하드코딩하면 Pages 에서 전부
 * 404 가 되고, 증상이 "PDF 는 열리는데 한글만 사라진다" 라 원인을 찾기 어렵다.
 */
const base = import.meta.env.BASE_URL

configurePdfResources({
  workerSrc: `${base}pdfjs/pdf.worker.mjs`,
  // ⚠️ 아래 넷을 빠뜨리면 한국어 PDF 에서 글자가 조용히 사라진다
  cMapUrl: `${base}pdfjs/cmaps/`,
  standardFontDataUrl: `${base}pdfjs/standard_fonts/`,
  wasmUrl: `${base}pdfjs/wasm/`,
  iccUrl: `${base}pdfjs/iccs/`,
})

// ⚠️ 타입을 명시한다. Vue 의 expose 는 런타임 API 라 자동 추론되지 않는다 (ARCHITECTURE §17.2).
const editor = ref<PDFCanvasEditorRef | null>(null)
const doc = shallowRef<PDFCanvasDoc | null>(null)
const publicDoc = shallowRef<PublicPDFCanvasDoc | null>(null)
const tab = ref<'editor' | 'viewer'>('editor')
const note = ref('')
const { on: themeOn, toggle: toggleTheme } = useThemeToggle()

/*
 * 다이얼로그를 호스트가 소유한다 (D31).
 *
 * onRequestUpload · onRequestConfirm 을 주면 편집기가 내장 팝업을 띄우지 않는다.
 * 패키지가 알아야 하는 것은 "이 파일" 과 "확인/취소" 뿐이다.
 */
const confirmReq = ref<ConfirmRequest | null>(null)
const uploadOpen = ref(false)
const importing = ref<ImportState | null>(null)

const initialDoc = createPDFCanvasDoc({ pages: [createPage({ size: A4_PT })] })

/** ⚠️ `pages[0]` 만 세면 현재 페이지가 아닌 곳의 객체가 빠진다. */
const objectCount = computed(
  () => doc.value?.pages.reduce((n, page) => n + page.objects.length, 0) ?? 0,
)

function send() {
  // 검증 게이트. 실패하면 편집기가 문제 객체로 데려간다.
  if (!editor.value?.handle?.checkBeforeExport()) {
    note.value = '검증 실패 — 편집기를 확인하세요'
    return
  }
  publicDoc.value = editor.value.handle.toPublicDoc()
  tab.value = 'viewer'
  note.value = ''
}

function resolveConfirm(ok: boolean) {
  if (ok) editor.value?.handle?.confirmPending()
  else editor.value?.handle?.cancelPending()
  confirmReq.value = null
}

function closeUpload() {
  uploadOpen.value = false
  importing.value = null
}

/**
 * 응답을 호스트가 소유한다 (D29).
 *
 * 뷰어는 문서를 소유하지 않으므로 저장할 곳이 없다. 여기서 문서를 고쳐 다시 내려 준다 —
 * 브랜드는 spread 로 파생한 객체에도 유지되므로 캐스트가 필요 없다.
 */
function onChangeData(objectId: string, next: unknown) {
  const prev = publicDoc.value
  if (!prev) return
  publicDoc.value = {
    ...prev,
    pages: prev.pages.map((page) => ({
      ...page,
      objects: page.objects.map((o) =>
        o.id === objectId && o.type === 'custom' ? { ...o, data: next } : o,
      ),
    })),
  }
}
</script>

<template>
  <div class="ex-root">
    <div class="hint-wrap is-inline">
      <CodeHint
        corner="br"
        label="호스트 UI · handle"
        note="devbar 는 패키지와 무관한 내 UI 다. 편집기 조작은 ref 로 받은 handle 을 부른다."
        :code="CODE_HANDLE"
      >
        <DevBar>
          <strong>Vue 예제</strong>
          <span
            >객체 {{ objectCount }} · 페이지 {{ doc?.pages.length ?? 0 }}/{{
              LIMITS.pagesPerDoc
            }}</span
          >
          <button @click="uploadOpen = true">문서 불러오기</button>
          <button @click="send">뷰어로 보내기</button>
          <button :disabled="tab === 'editor'" @click="tab = 'editor'">편집기</button>
          <button :disabled="tab === 'viewer'" @click="tab = 'viewer'">뷰어</button>
          <!-- 이 토글이 @layer 오버라이드를 눈으로 확인하는 장치다 -->
          <CodeHint
            corner="br"
            label="@layer 오버라이드"
            note="theme.css 를 <style> 로 붙였다 뗀다. 단일 클래스 선택자인데 패키지 규칙을 이긴다."
            :code="CODE_THEME"
          >
            <button :class="themeOn ? 'is-on' : ''" @click="toggleTheme">
              테마 {{ themeOn ? 'ON' : 'OFF' }}
            </button>
          </CodeHint>
          <span v-if="note" class="ex-note">{{ note }}</span>
          <span v-if="importing?.error" class="ex-err">{{ importing.error }}</span>
          <CodeHint
            corner="br"
            label="커스텀 객체 슬롯"
            note="패키지는 기본 틀만 그린다. 그 안을 내 SFC 가 채운다 — Teleport 라 v-for·v-if 가 그대로 동작한다."
            :code="CODE_SLOTS"
          >
            <span class="hint-chip">슬롯</span>
          </CodeHint>
          <CodeHint
            corner="br"
            label="다이얼로그 위임"
            note="콜백을 주는 것만으로 내장 팝업이 꺼진다. 별도 플래그가 없다."
            :code="CODE_DIALOG"
          >
            <span class="hint-chip">다이얼로그</span>
          </CodeHint>
          <CodeHint
            corner="br"
            label="문구 · 아이콘"
            note="아이콘은 icons → renderIcon → 글리프 순으로 이긴다."
            :code="CODE_STRINGS"
          >
            <span class="hint-chip">문구·아이콘</span>
          </CodeHint>
          <CodeHint
            corner="br"
            label="도형 · 글꼴"
            note="도형은 11종이고 정점 계산이 core 에 있다. 글꼴은 목록만 패키지가 갖고 웹폰트 파일은 호스트가 불러온다 — 이 예제는 index.html 에서 Google Fonts 를 받는다."
            :code="CODE_SHAPES"
          >
            <span class="hint-chip">도형·글꼴</span>
          </CodeHint>
          <span class="ex-spacer">
            <a :href="demoHomeUrl()">← 데모</a>
            <a :href="siblingExampleUrl('react')">React 예제 →</a>
          </span>
        </DevBar>
      </CodeHint>
    </div>

    <ConfirmDialog
      v-if="confirmReq"
      :request="confirmReq"
      @confirm="resolveConfirm(true)"
      @cancel="resolveConfirm(false)"
    />

    <UploadDialog
      v-if="uploadOpen"
      :state="importing"
      @pick="(file) => editor?.handle?.importFile(file)"
      @cancel="editor?.handle?.cancelImport()"
      @close="closeUpload"
    />

    <div class="ex-stack">
      <div class="ex-pane" :hidden="tab !== 'editor'">
        <CodeHint
          corner="tr"
          label="PDFCanvasEditor"
          note="편집기 전체가 패키지가 그린 DOM 이다. 커스텀 객체 자리에만 내 SFC 가 Teleport 로 들어간다."
          :code="CODE_EDITOR"
        >
          <PDFCanvasEditor
            ref="editor"
            :initial-doc="initialDoc"
            :object-types="OBJECT_TYPES"
            :render-object="{ 'example.shortAnswer': AnswerBadge }"
            :render-inspector="{ 'example.shortAnswer': AnswerFields }"
            :strings="STRINGS"
            :icons="ICONS"
            :render-icon="RENDER_ICON"
            :on-request-upload="() => (uploadOpen = true)"
            :on-request-confirm="(req) => (confirmReq = req)"
            :on-import-state-change="(st) => (importing = st)"
            @change="(d) => (doc = d)"
          />
        </CodeHint>
      </div>
      <div class="ex-pane" :hidden="tab !== 'viewer'">
        <CodeHint
          corner="tr"
          label="PDFCanvasViewer"
          note="doc 이 controlled 다. 응답은 호스트가 소유하고 change-data 로 올라온다."
          :code="CODE_VIEWER"
        >
          <PDFCanvasViewer
            :doc="publicDoc"
            :object-types="OBJECT_TYPES"
            :render-object="{ 'example.shortAnswer': AnswerInput }"
            @change-data="onChangeData"
          />
        </CodeHint>
      </div>
    </div>
  </div>
</template>
