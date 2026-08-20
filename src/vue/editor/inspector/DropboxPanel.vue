<script setup lang="ts">
/**
 * 드롭박스 인스펙터 (기획 6.4-1).
 *
 * 보기 2~5개, 정답 1개 이상. 복수 정답이면 학생이 모두 골라야 정답이다(all-or-nothing).
 */
import { createId } from '../../../core/util/id'
import { computed } from 'vue'
import { LIMITS } from '../../../core/config/defaults'
import type { DropboxAnswerBox } from '../../../core/model/types'

const props = defineProps<{
  object: DropboxAnswerBox
  issues: string[]
  t: (key: string) => string
}>()

const emit = defineEmits<{ update: [patch: Partial<DropboxAnswerBox>] }>()

const canAdd = computed(() => props.object.choices.length < LIMITS.dropboxChoices.max)
const canRemove = computed(() => props.object.choices.length > LIMITS.dropboxChoices.min)

function setLabel(id: string, label: string) {
  emit('update', {
    choices: props.object.choices.map((c) =>
      c.id === id ? { ...c, label: label.slice(0, LIMITS.choiceChars) } : c,
    ),
  })
}

function addChoice() {
  if (!canAdd.value) return
  emit('update', {
    choices: [...props.object.choices, { id: createId(), label: '' }],
  })
}

function removeChoice(id: string) {
  if (!canRemove.value) return
  emit('update', {
    choices: props.object.choices.filter((c) => c.id !== id),
    // 정답 목록에서도 함께 빼야 유령 정답이 남지 않는다.
    correctChoiceIds: props.object.correctChoiceIds.filter((c) => c !== id),
  })
}

function toggleCorrect(id: string) {
  const set = new Set(props.object.correctChoiceIds)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  emit('update', { correctChoiceIds: [...set] })
}

const fewChoices = computed(() => props.issues.includes('DROPBOX_FEW_CHOICES'))
const noCorrect = computed(() => props.issues.includes('DROPBOX_NO_CORRECT'))
const duplicate = computed(() => props.issues.includes('DROPBOX_DUPLICATE_CHOICE'))
</script>

<template>
  <section class="pck-panel-section">
    <h3 class="pck-field-label">{{ props.t('inspector.choices') }}</h3>

    <div v-for="(choice, i) in props.object.choices" :key="choice.id" class="pck-row">
      <input
        class="pck-check"
        type="checkbox"
        :checked="props.object.correctChoiceIds.includes(choice.id)"
        :aria-label="`correct ${i + 1}`"
        @change="toggleCorrect(choice.id)"
      />
      <input
        class="pck-input"
        type="text"
        :value="choice.label"
        :maxlength="LIMITS.choiceChars"
        :placeholder="props.t('inspector.choicePlaceholder')"
        @input="setLabel(choice.id, ($event.target as HTMLInputElement).value)"
      />
      <button
        type="button"
        class="pck-row-btn"
        :disabled="!canRemove"
        aria-label="remove"
        @click="removeChoice(choice.id)"
      >
        ×
      </button>
    </div>

    <button
      type="button"
      class="pck-dashed-btn pck-dashed-btn--sm"
      :disabled="!canAdd"
      @click="addChoice"
    >
      {{ props.t('inspector.addChoice') }}
    </button>

    <p v-if="fewChoices || noCorrect" class="pck-field-error" role="alert">
      {{ props.t('error.dropboxIncomplete') }}
    </p>
    <p v-if="duplicate" class="pck-field-error" role="alert">
      {{ props.t('error.duplicateChoice') }}
    </p>
    <p class="pck-field-note">{{ props.t('inspector.correctHint') }}</p>
  </section>
</template>
