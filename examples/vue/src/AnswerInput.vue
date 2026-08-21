<script setup lang="ts">
// 뷰어 — 학생이 답을 쓴다. 여기서는 콘텐츠가 포인터 이벤트를 받는다 (PLAN D29).
import type { PublicAnswer } from './objectType'

const props = defineProps<{ objectId: string; data: PublicAnswer }>()
const emit = defineEmits<{ change: [next: PublicAnswer] }>()
</script>

<template>
  <input
    class="pck-input"
    style="width: 100%; height: 100%; box-sizing: border-box"
    :placeholder="`답을 입력하세요 (${data.points}점)`"
    :value="data.response ?? ''"
    @input="emit('change', { ...props.data, response: ($event.target as HTMLInputElement).value })"
  />
</template>
