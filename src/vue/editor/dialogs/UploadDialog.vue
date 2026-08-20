<script setup lang="ts">
/**
 * 문서 업로드 팝업 (기획 2.3).
 *
 * 탭 두 개, From File이 기본 선택이다. Google Drive 탭은 자리만 잡아 둔 것으로, 기획은 요구하지만
 * 연동은 범위 밖이다 (PLAN 19). 실패하는 버튼보다 빈 탭이 정직하다.
 *
 * 한 번에 파일 하나. 기획의 "(1 limit, 500MB)" 와 일치한다.
 */
import { computed, ref } from 'vue'
import { LIMITS } from '../../../core/config/defaults'

const props = defineProps<{
  /** 변환이 진행 중인 동안 non-null. */
  progress: { ratio: number; page?: number; total?: number; fileName: string } | null
  error: string | null
  t: (key: string) => string
}>()

const emit = defineEmits<{
  close: []
  pick: [file: File]
  cancel: []
}>()

const tab = ref<'file' | 'drive'>('file')
const inputEl = ref<HTMLInputElement | null>(null)

const accept = computed(() => LIMITS.formats.map((f) => `.${f}`).join(','))
const busy = computed(() => props.progress !== null)

function onChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  // 같은 파일을 두 번 골라도 change 이벤트가 발생하도록 초기화한다.
  input.value = ''
  if (file) emit('pick', file)
}
</script>

<template>
  <div class="lws-modal-scrim" @click.self="busy ? null : emit('close')">
    <section
      class="lws-modal"
      role="dialog"
      aria-modal="true"
      :aria-label="props.t('upload.title')"
    >
      <header class="lws-modal-head">
        <h2>{{ props.t('upload.title') }}</h2>
        <button
          type="button"
          class="lws-icon-btn"
          :disabled="busy"
          aria-label="close"
          @click="emit('close')"
        >
          ×
        </button>
      </header>

      <nav class="lws-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'file'"
          :class="{ 'is-active': tab === 'file' }"
          @click="tab = 'file'"
        >
          {{ props.t('upload.tabFile') }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'drive'"
          :class="{ 'is-active': tab === 'drive' }"
          @click="tab = 'drive'"
        >
          {{ props.t('upload.tabDrive') }}
        </button>
      </nav>

      <div v-if="tab === 'file'" class="lws-modal-body">
        <template v-if="busy && props.progress">
          <p class="lws-upload-hint">
            {{ props.progress.fileName }} — {{ props.t('upload.converting') }}
            <span v-if="props.progress.total" class="mono">
              {{ props.progress.page }} / {{ props.progress.total }}
            </span>
          </p>
          <div class="lws-progress"><i :style="{ width: `${props.progress.ratio * 100}%` }" /></div>
          <button type="button" class="lws-ghost-btn" @click="emit('cancel')">
            {{ props.t('confirm.cancel') }}
          </button>
        </template>

        <template v-else>
          <p class="lws-upload-hint">{{ props.t('upload.hint') }}</p>
          <p class="lws-upload-sub">{{ props.t('upload.subHint') }}</p>
          <button type="button" class="lws-primary-btn" @click="inputEl?.click()">
            {{ props.t('upload.action') }}
          </button>
          <input ref="inputEl" type="file" hidden :accept="accept" @change="onChange" />
          <p class="lws-upload-limit">{{ props.t('upload.limit') }}</p>
          <p class="lws-upload-formats">{{ props.t('upload.formats') }}</p>
        </template>

        <p v-if="props.error" class="lws-upload-error" role="alert">{{ props.error }}</p>
      </div>

      <div v-else class="lws-modal-body">
        <p class="lws-upload-sub">{{ props.t('upload.driveUnavailable') }}</p>
      </div>
    </section>
  </div>
</template>
