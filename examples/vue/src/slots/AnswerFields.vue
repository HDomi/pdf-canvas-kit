<script setup lang="ts">
/**
 * 편집기 인스펙터의 커스텀 객체 패널 — 정답·배점을 입력한다.
 *
 * Teleport 안이라 **포커스 가드가 필요 없다.** `v-for` 로 배열을 늘리고 줄여도 Vue 가 노드를
 * 유지한다. vanilla 슬롯은 `render` 가 객체당 한 번만 불려 DOM 을 직접 다뤄야 하고
 * `document.activeElement` 를 확인해야 한다. 그 제약이 여기에는 없다.
 */
import type { Answer } from '../objectType'

const props = defineProps<{ objectId: string; data: Answer }>()
const emit = defineEmits<{ change: [next: Answer] }>()

function setAnswer(i: number, value: string) {
  const next = [...props.data.answers]
  next[i] = value
  emit('change', { ...props.data, answers: next })
}

function removeAnswer(i: number) {
  emit('change', { ...props.data, answers: props.data.answers.filter((_, j) => j !== i) })
}

function setPoints(value: string) {
  emit('change', { ...props.data, points: Number(value) || 1 })
}
</script>

<template>
  <div class="ex-fields">
    <div v-for="(a, i) in data.answers" :key="i" class="ex-row">
      <input
        class="pck-input"
        :value="a"
        :placeholder="`정답 ${i + 1}`"
        @input="setAnswer(i, ($event.target as HTMLInputElement).value)"
      />
      <button type="button" class="ex-mini" @click="removeAnswer(i)">−</button>
    </div>
    <button
      type="button"
      class="ex-mini"
      @click="emit('change', { ...data, answers: [...data.answers, ''] })"
    >
      + 정답 추가
    </button>
    <label class="ex-label">
      배점
      <input
        class="pck-input pck-input--num"
        type="number"
        :min="1"
        :value="data.points"
        @input="setPoints(($event.target as HTMLInputElement).value)"
      />
    </label>
  </div>
</template>
