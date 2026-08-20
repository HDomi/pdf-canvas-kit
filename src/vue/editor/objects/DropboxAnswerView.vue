<script setup lang="ts">
/**
 * 드롭박스 Answer Box. 학생에게는 select로 보이지만 편집 중에는 자리와 상태만 보여준다.
 *
 * 실제 select를 쓰지 않는 이유는 단답형과 같다. 클릭이 객체 선택으로 가야 한다.
 */
import { computed } from 'vue'
import { LIMITS } from '../../../core/config/defaults'
import { boxStyleToCss } from '../../../core/model/boxStyle'
import type { DropboxAnswerBox } from '../../../core/model/types'

const props = defineProps<{
  object: DropboxAnswerBox /** 자동 부여된 문항 번호. 없으면 배지를 그리지 않는다 (PLAN Q9). */
  questionNumber?: string | null
}>()

/** 보기가 최소 개수에 못 미치거나 정답이 없으면 내보내기가 막힌다 (기획 6.3). */
/** 교사가 지정한 색만 인라인으로 덮는다. 미지정 필드는 CSS 토큰 기본값이 유지된다. */
const style = computed(() => boxStyleToCss(props.object.style))

const incomplete = computed(
  () =>
    props.object.choices.filter((c) => c.label.trim().length > 0).length <
      LIMITS.dropboxChoices.min || props.object.correctChoiceIds.length === 0,
)
</script>

<template>
  <div class="lws-answer lws-answer--dropbox" :style="style">
    <span v-if="props.questionNumber" class="lws-answer-no">{{ props.questionNumber }}</span>
    <span class="lws-answer-badge">{{ props.object.points }}</span>
    <span class="lws-answer-caret" aria-hidden="true">▾</span>
    <span v-if="incomplete" class="lws-answer-hint">보기·정답 미완성</span>
  </div>
</template>
