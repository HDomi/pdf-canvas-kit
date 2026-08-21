<script setup lang="ts">
/**
 * 호스트가 만든 문서 불러오기 모달 (커스터마이징은 토큰 → @layer → 다이얼로그 위임 3단계다).
 *
 * 편집기의 내장 업로드 팝업을 대체한다. 파일을 고르면 `handle.importFile(file)` 로 넘기고,
 * 진행률·오류는 `onImportStateChange` 로 받은 것을 그린다.
 *
 * 드래그&드롭을 붙였다 — 내장 팝업에도 있지만, **호스트가 자기 UX 를 얹을 수 있다**는 것이
 * 위임의 요점이다. 편집기는 파일 하나만 받으면 된다.
 */
import { computed, ref } from 'vue'
import type { ImportState } from 'pdf-canvas-kit'

const props = defineProps<{ state: ImportState | null }>()
const emit = defineEmits<{ pick: [file: File]; cancel: []; close: [] }>()

const over = ref(false)
const busy = computed(() => props.state?.progress != null)

function onDrop(e: DragEvent) {
  over.value = false
  const file = e.dataTransfer?.files[0]
  if (file) emit('pick', file)
}

function onChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('pick', file)
  // 같은 파일을 다시 고를 수 있어야 한다.
  input.value = ''
}
</script>

<template>
  <div class="host-scrim" role="presentation" @click="busy || emit('close')">
    <div class="host-sheet" role="dialog" aria-modal="true" @click.stop>
      <h2 class="host-sheet-title">문서 불러오기</h2>

      <div v-if="busy" class="host-sheet-body">
        <p>
          {{ state?.progress?.fileName }} — {{ Math.round((state?.progress?.ratio ?? 0) * 100) }}%
          <template v-if="state?.progress?.total">
            ({{ state.progress.page }}/{{ state.progress.total }} 페이지)
          </template>
        </p>
        <progress :value="state?.progress?.ratio ?? 0" :max="1" class="host-progress" />
        <p class="host-hint">
          {{
            state?.progress?.phase === 'storing' ? '이미지를 저장하는 중' : '페이지를 변환하는 중'
          }}
        </p>
      </div>

      <label
        v-else
        :class="over ? 'host-drop is-over' : 'host-drop'"
        @dragover.prevent="over = true"
        @dragleave="over = false"
        @drop.prevent="onDrop"
      >
        <input type="file" accept=".pdf" hidden @change="onChange" />
        <strong>PDF 를 끌어다 놓거나 클릭해서 고르세요</strong>
        <span class="host-hint">호스트가 만든 UI 다. 편집기 팝업이 아니다</span>
      </label>

      <p v-if="state?.error" class="host-error">{{ state.error }}</p>

      <div class="host-sheet-actions">
        <button v-if="busy" type="button" class="host-btn" @click="emit('cancel')">
          변환 취소
        </button>
        <button v-else type="button" class="host-btn" @click="emit('close')">닫기</button>
      </div>
    </div>
  </div>
</template>
