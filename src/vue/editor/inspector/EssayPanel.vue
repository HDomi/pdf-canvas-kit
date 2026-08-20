<script setup lang="ts">
/**
 * 서술형 인스펙터 (기획 6.4-3).
 *
 * 자동 채점이 불가하므로 정답 입력이 없다. 채점 가이드는 교사용이며 학생 문서에서 제거된다
 * (PLAN D14).
 */
import type { EssayAnswerBox } from '../../../core/model/types'

const props = defineProps<{
  object: EssayAnswerBox
  t: (key: string) => string
}>()

const emit = defineEmits<{ update: [patch: Partial<EssayAnswerBox>] }>()
</script>

<template>
  <section class="lws-panel-section">
    <h3 class="lws-field-label">{{ props.t('inspector.rubric') }}</h3>
    <textarea
      class="lws-input lws-textarea"
      rows="5"
      :value="props.object.rubric ?? ''"
      :placeholder="props.t('inspector.rubricPlaceholder')"
      @input="emit('update', { rubric: ($event.target as HTMLTextAreaElement).value })"
    />
    <p class="lws-field-note">{{ props.t('inspector.essayNote') }}</p>
  </section>
</template>
