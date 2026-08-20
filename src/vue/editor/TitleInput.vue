<script setup lang="ts">
/**
 * 인라인 편집 가능한 워크시트 타이틀 (기획 4.1–4.3).
 *
 * 클릭 전까지는 라벨로 보이고, 클릭하면 입력 필드가 된다. blur나 Enter로 확정하고 Escape로
 * 되돌린다. 공백만 입력하면 빈 바를 남기는 대신 기본값을 복원하는데, 이 규칙은 커맨드 층이
 * 강제하므로 프로그램적 편집에도 적용된다 (commands/doc.ts 참고).
 */
import { nextTick, ref, watch } from 'vue'
import { LIMITS } from '../../core/config/defaults'

const props = defineProps<{
  modelValue: string
  placeholder: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const editing = ref(false)
const draft = ref(props.modelValue)
const inputEl = ref<HTMLInputElement | null>(null)

// 아래에서 문서가 바뀌는 경우(undo, import)에도 draft를 맞춰 둔다.
watch(
  () => props.modelValue,
  (v) => {
    if (!editing.value) draft.value = v
  },
)

async function startEditing() {
  draft.value = props.modelValue
  editing.value = true
  await nextTick()
  inputEl.value?.select()
}

function commit() {
  if (!editing.value) return
  editing.value = false
  if (draft.value !== props.modelValue) emit('update:modelValue', draft.value)
}

function cancel() {
  editing.value = false
  draft.value = props.modelValue
}
</script>

<template>
  <div class="lws-title">
    <input
      v-if="editing"
      ref="inputEl"
      v-model="draft"
      class="lws-title-input"
      type="text"
      :maxlength="LIMITS.titleChars"
      :placeholder="props.placeholder"
      @blur="commit"
      @keydown.enter.prevent="commit"
      @keydown.esc.prevent="cancel"
    />
    <button v-else type="button" class="lws-title-label" @click="startEditing">
      {{ props.modelValue || props.placeholder }}
    </button>
  </div>
</template>
