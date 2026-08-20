<script setup lang="ts">
/**
 * 배점 입력 (기획 6.4 공통).
 *
 * 1 이상 정수만 유효하다. 빈 값이나 0은 검증에서 걸리며, 여기서는 입력을 막지 않고 경고만 띄운다.
 * 입력을 강제로 되돌리면 "2를 지우고 3을 쓰려는" 중간 상태가 불가능해진다.
 */
import { computed } from 'vue'

const props = defineProps<{
  modelValue: number
  invalid: boolean
  t: (key: string) => string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const display = computed(() => (Number.isFinite(props.modelValue) ? String(props.modelValue) : ''))

function onInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value
  // 빈 문자열은 0으로 보내 검증이 잡게 한다. NaN을 문서에 넣으면 직렬화가 깨진다.
  const n = raw.trim() === '' ? 0 : Number(raw)
  emit('update:modelValue', Number.isFinite(n) ? n : 0)
}
</script>

<template>
  <label class="pck-field">
    <span class="pck-field-label">{{ props.t('inspector.points') }}</span>
    <input
      class="pck-input pck-input--num"
      type="number"
      min="1"
      step="1"
      :value="display"
      :aria-invalid="props.invalid"
      @input="onInput"
    />
  </label>
</template>
