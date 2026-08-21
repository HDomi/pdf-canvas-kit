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
      <a href="http://localhost:3101/" style="margin-left: auto; color: #9a9aa0">React 예제 →</a>
    </div>
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
