<script setup lang="ts">
/**
 * 서술형 Answer Box. 자동 채점이 불가하므로 편집기에서 정답 상태를 표시할 것이 없다.
 *
 * 채점 가이드(`rubric`)는 교사용이며 학생에게 노출되지 않으므로 캔버스에도 그리지 않는다.
 */
import { computed } from 'vue'
import { boxStyleToCss } from '../../../core/model/boxStyle'
import type { EssayAnswerBox } from '../../../core/model/types'

const props = defineProps<{
  object: EssayAnswerBox
  /** 자동 부여된 문항 번호. 없으면 배지를 그리지 않는다 (PLAN Q9). */
  questionNumber?: string | null
}>()

/** 교사가 지정한 색만 인라인으로 덮는다. 미지정 필드는 CSS 토큰 기본값이 유지된다. */
const style = computed(() => boxStyleToCss(props.object.style))
</script>

<template>
  <div class="pck-answer pck-answer--essay" :style="style">
    <span v-if="props.questionNumber" class="pck-answer-no">{{ props.questionNumber }}</span>
    <span class="pck-answer-badge">{{ props.object.points }}</span>
    <span class="pck-answer-hint">서술형 · 수동 채점</span>
  </div>
</template>
