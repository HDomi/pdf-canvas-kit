<script setup lang="ts">
/**
 * 편집기 인스펙터 — 교사가 정답·배점을 넣는다.
 *
 * Teleport 안이라 포커스 가드가 필요 없다. `v-for` 로 배열을 늘리고 줄여도 Vue 가 노드를
 * 유지한다 (vanilla 슬롯은 `render` 가 한 번만 불려 직접 DOM 을 다뤄야 한다 — PLAN 20.14).
 */
import type { Answer } from './objectType'

const props = defineProps<{ objectId: string; data: Answer }>()
const emit = defineEmits<{ change: [next: Answer] }>()

function setAnswer(i: number, value: string) {
  const next = [...props.data.answers]
  next[i] = value
  emit('change', { ...props.data, answers: next })
}
</script>

<template>
  <div>
    <div
      v-for="(a, i) in data.answers"
      :key="i"
      style="display: flex; gap: 4px; margin-bottom: 4px"
    >
      <input
        class="pck-input"
        :value="a"
        :placeholder="`정답 ${i + 1}`"
        @input="setAnswer(i, ($event.target as HTMLInputElement).value)"
      />
      <button
        type="button"
        @click="emit('change', { ...data, answers: data.answers.filter((_, j) => j !== i) })"
      >
        −
      </button>
    </div>
    <button type="button" @click="emit('change', { ...data, answers: [...data.answers, ''] })">
      + 정답 추가
    </button>
    <label style="display: block; margin-top: 8px; font-size: 12px">
      배점
      <input
        class="pck-input pck-input--num"
        type="number"
        :min="1"
        :value="data.points"
        @input="
          emit('change', {
            ...data,
            points: Number(($event.target as HTMLInputElement).value) || 1,
          })
        "
      />
    </label>
  </div>
</template>
