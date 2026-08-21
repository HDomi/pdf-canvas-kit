<script setup lang="ts">
/**
 * Vue 소비자 예제 (PLAN 20.22 · 20.24).
 *
 * `demo/` 와 다른 점이 하나뿐이지만 그것이 핵심이다. **별칭이 없다.** `pdf-canvas-kit` 을
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
import { PDFCanvasEditor, PDFCanvasViewer, type PDFCanvasEditorRef } from 'pdf-canvas-kit/vue'
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
} from 'pdf-canvas-kit'
import 'pdf-canvas-kit/styles.css'
import './host.css'
import { OBJECT_TYPES } from './objectType'
import AnswerBadge from './slots/AnswerBadge.vue'
import AnswerFields from './slots/AnswerFields.vue'
import AnswerInput from './slots/AnswerInput.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import UploadDialog from './components/UploadDialog.vue'
import DevBar from './components/DevBar.vue'
import { useThemeToggle } from './useThemeToggle'
import BackIcon from './icons/BackIcon.vue'
import UndoIcon from './icons/UndoIcon.vue'
import RedoIcon from './icons/RedoIcon.vue'
import ZoomInIcon from './icons/ZoomInIcon.vue'
import ZoomOutIcon from './icons/ZoomOutIcon.vue'
import { closeIconNode } from './icons/closeIconNode'

/*
 * 문구를 호스트가 정한다 (PLAN D32).
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
configurePdfResources({
  workerSrc: '/pdfjs/pdf.worker.mjs',
  cMapUrl: '/pdfjs/cmaps/',
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/',
  iccUrl: '/pdfjs/iccs/',
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
    <DevBar>
      <strong>Vue 예제</strong>
      <span
        >객체 {{ objectCount }} · 페이지 {{ doc?.pages.length ?? 0 }}/{{ LIMITS.pagesPerDoc }}</span
      >
      <button @click="uploadOpen = true">문서 불러오기</button>
      <button @click="send">뷰어로 보내기</button>
      <button :disabled="tab === 'editor'" @click="tab = 'editor'">편집기</button>
      <button :disabled="tab === 'viewer'" @click="tab = 'viewer'">뷰어</button>
      <!-- 이 토글이 @layer 오버라이드를 눈으로 확인하는 장치다 -->
      <button :class="themeOn ? 'is-on' : ''" @click="toggleTheme">
        테마 {{ themeOn ? 'ON' : 'OFF' }}
      </button>
      <span v-if="note" class="ex-note">{{ note }}</span>
      <span v-if="importing?.error" class="ex-err">{{ importing.error }}</span>
      <span class="ex-spacer"><a href="http://localhost:3101/">React 예제 →</a></span>
    </DevBar>

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
      </div>
      <div class="ex-pane" :hidden="tab !== 'viewer'">
        <PDFCanvasViewer
          :doc="publicDoc"
          :object-types="OBJECT_TYPES"
          :render-object="{ 'example.shortAnswer': AnswerInput }"
          @change-data="onChangeData"
        />
      </div>
    </div>
  </div>
</template>
