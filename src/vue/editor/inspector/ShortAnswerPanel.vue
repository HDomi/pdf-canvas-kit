<script setup lang="ts">
/**
 * 단답형 인스펙터 (기획 6.4-2).
 *
 * 정답 하나가 필수이고, 동의어를 위해 허용 답안을 최대 5개까지 추가한다. 학생 답이 그중 하나와
 * 일치하면 정답이다.
 */
import { computed } from 'vue'
import { LIMITS } from '../../../core/config/defaults'
import type { ShortAnswerBox } from '../../../core/model/types'

const props = defineProps<{
  object: ShortAnswerBox
  issues: string[]
  t: (key: string) => string
}>()

const emit = defineEmits<{ update: [patch: Partial<ShortAnswerBox>] }>()

/** 항상 최소 한 칸은 보여준다. 빈 배열이면 입력할 자리가 없다. */
const answers = computed(() => (props.object.answers.length > 0 ? props.object.answers : ['']))

const canAdd = computed(() => answers.value.length < LIMITS.shortAnswers.max)

function setAnswer(index: number, value: string) {
  const next = [...answers.value]
  next[index] = value.slice(0, LIMITS.choiceChars)
  emit('update', { answers: next })
}

function addAnswer() {
  if (!canAdd.value) return
  emit('update', { answers: [...answers.value, ''] })
}

function removeAnswer(index: number) {
  // 마지막 한 칸은 지우지 않고 비운다. 입력할 자리가 사라지면 정답을 다시 넣을 수 없다.
  const next = answers.value.filter((_, i) => i !== index)
  emit('update', { answers: next.length > 0 ? next : [''] })
}

const missingAnswer = computed(() => props.issues.includes('SHORT_NO_ANSWER'))
</script>

<template>
  <section class="lws-panel-section">
    <h3 class="lws-field-label">{{ props.t('inspector.answer') }}</h3>

    <div v-for="(answer, i) in answers" :key="i" class="lws-row">
      <input
        class="lws-input"
        type="text"
        :value="answer"
        :maxlength="LIMITS.choiceChars"
        :placeholder="props.t('inspector.answerPlaceholder')"
        :aria-invalid="missingAnswer && i === 0"
        @input="setAnswer(i, ($event.target as HTMLInputElement).value)"
      />
      <button
        v-if="answers.length > 1"
        type="button"
        class="lws-row-btn"
        aria-label="remove"
        @click="removeAnswer(i)"
      >
        ×
      </button>
    </div>

    <button
      type="button"
      class="lws-dashed-btn lws-dashed-btn--sm"
      :disabled="!canAdd"
      @click="addAnswer"
    >
      {{ props.t('inspector.addAnswer') }}
    </button>

    <p v-if="missingAnswer" class="lws-field-error" role="alert">
      {{ props.t('error.answerRequired') }}
    </p>
    <p class="lws-field-note">{{ props.t('inspector.gradingNote') }}</p>
  </section>
</template>
