<script setup lang="ts">
/**
 * Vue 소비자 예제 — 실제 설치 환경 (PLAN 20.22).
 *
 * `demo/` 와 다른 점이 하나뿐이지만 그것이 핵심이다. **별칭이 없다.** `pdf-canvas-kit` 을
 * `node_modules` 에서 `exports` 맵으로 해석하므로, 빌드 산출물과 진입점 정의가 틀리면 여기서
 * 즉시 드러난다.
 *
 * 편집기와 뷰어를 나란히 두지 않는다 — 편집기는 3분할이고 240px + 280px 를 고정으로 먹어
 * 절반 폭에서는 못 쓴다 (D15). 탭으로 전환하고 **둘 다 마운트해 둔다.**
 */
import { computed, ref, shallowRef } from 'vue'
import { PDFCanvasEditor, PDFCanvasViewer, type PDFCanvasEditorRef } from 'pdf-canvas-kit/vue'
import type { ConfirmRequest, ImportState } from 'pdf-canvas-kit'
import {
  configurePdfResources,
  createPDFCanvasDoc,
  createPage,
  A4_PT,
  LIMITS,
  type PDFCanvasDoc,
  type PublicPDFCanvasDoc,
} from 'pdf-canvas-kit'
import { shortAnswer } from './objectType'
import AnswerBadge from './AnswerBadge.vue'
import AnswerFields from './AnswerFields.vue'
import AnswerInput from './AnswerInput.vue'

/*
 * ⚠️ `workerSrc` 만 주면 PDF 는 열리지만 **한국어 글자가 조용히 사라진다.**
 * 자산 복사는 `scripts/dev-examples.mjs` 가 대신 해 준다.
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

/*
 * 다이얼로그를 호스트가 맡는다 (PLAN D31).
 *
 * onRequestUpload · onRequestConfirm 을 주면 편집기가 내장 팝업을 띄우지 않는다.
 * 패키지가 알아야 하는 것은 "확인/취소" 와 "이 파일" 뿐이다.
 */
const confirmReq = ref<ConfirmRequest | null>(null)
const importing = ref<ImportState | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) void editor.value?.handle?.importFile(file)
  input.value = ''
}

function resolveConfirm(ok: boolean) {
  if (ok) editor.value?.handle?.confirmPending()
  else editor.value?.handle?.cancelPending()
  confirmReq.value = null
}

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

/**
 * 응답을 호스트가 소유한다 (D29).
 *
 * 뷰어는 문서를 소유하지 않으므로 저장할 곳이 없다. 여기서 문서를 고쳐 다시 내려 준다.
 */
function onChangeData(objectId: string, next: unknown) {
  const prev = publicDoc.value
  if (!prev) return
  // 캐스트가 없다. 브랜드는 spread 로 파생한 객체에도 유지된다.
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
  <div style="display: flex; flex-direction: column; height: 100%">
    <div class="bar">
      <strong>Vue 예제</strong>
      <span
        >객체 {{ objectCount }} · 페이지 {{ doc?.pages.length ?? 0 }}/{{ LIMITS.pagesPerDoc }}</span
      >
      <button @click="send">뷰어로 보내기</button>
      <button :disabled="tab === 'editor'" @click="tab = 'editor'">편집기</button>
      <button :disabled="tab === 'viewer'" @click="tab = 'viewer'">뷰어</button>
      <span style="color: #e0a">{{ note }}</span>
      <span v-if="importing?.progress">
        불러오는 중 {{ Math.round(importing.progress.ratio * 100) }}%
      </span>
      <span v-if="importing?.error" style="color: #f66">{{ importing.error }}</span>
      <a href="http://localhost:3101/" style="margin-left: auto; color: #9a9aa0">React 예제 →</a>
    </div>
    <!-- 호스트가 만든 확인 모달. 편집기는 이것의 존재를 모른다. -->
    <div v-if="confirmReq" class="host-sheet">
      <div class="host-sheet-box">
        <p style="margin: 0 0 12px">{{ confirmReq.message }}</p>
        <button
          :style="{ color: confirmReq.danger ? '#b4342b' : undefined }"
          @click="resolveConfirm(true)"
        >
          확인
        </button>
        <button @click="resolveConfirm(false)">취소</button>
      </div>
    </div>
    <!-- 업로드도 호스트 것이다. 고른 파일을 handle.importFile 로 넘긴다. -->
    <input ref="fileInput" type="file" accept=".pdf" style="display: none" @change="onPick" />
    <!--
      탭은 visibility 로 숨긴다. display:none 은 뷰어의 폭 측정(ResizeObserver)을 죽인다
      (ARCHITECTURE §18.3).
    -->
    <div style="flex: 1; min-height: 0; position: relative">
      <div class="pane" :style="{ visibility: tab === 'editor' ? 'visible' : 'hidden' }">
        <PDFCanvasEditor
          ref="editor"
          :initial-doc="initialDoc"
          :object-types="[shortAnswer]"
          :render-object="{ 'example.shortAnswer': AnswerBadge }"
          :render-inspector="{ 'example.shortAnswer': AnswerFields }"
          @change="(d) => (doc = d)"
          :on-request-upload="() => fileInput?.click()"
          :on-request-confirm="(req) => (confirmReq = req)"
          :on-import-state-change="(st) => (importing = st)"
        />
      </div>
      <div class="pane" :style="{ visibility: tab === 'viewer' ? 'visible' : 'hidden' }">
        <PDFCanvasViewer
          :doc="publicDoc"
          :object-types="[shortAnswer]"
          :render-object="{ 'example.shortAnswer': AnswerInput }"
          @change-data="onChangeData"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * 호스트 모달. 패키지 CSS 와 무관하다.
 *
 * 패키지 스타일을 덮어쓰고 싶으면 토큰(--pck-*)을 바꾸거나, 규칙을 그대로 쓰면 된다 —
 * editor.css 전체가 @layer 안에 있으므로 레이어 밖의 이 규칙이 특이도와 무관하게 이긴다.
 */
.host-sheet {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: rgb(0 0 0 / 40%);
}
.host-sheet-box {
  background: #fff;
  padding: 20px;
  border-radius: 4px;
  font-size: 13px;
}
.bar {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 6px 12px;
  background: #26262a;
  color: #e8e8e4;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  flex: none;
}
.pane {
  position: absolute;
  inset: 0;
}
</style>
