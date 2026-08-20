<script setup lang="ts">
/**
 * 단답형 Answer Box. 편집기에서는 학생이 보게 될 입력창을 흉내낸 자리로만 보여준다.
 *
 * 실제 입력 요소(`<input>`)를 쓰지 않는다. 편집 중에는 클릭이 객체 선택으로 가야 하는데,
 * 입력 요소를 두면 포커스를 가로채고 드래그도 막는다. 학생용 뷰어에서 진짜 input이 된다 (M10).
 */
import { computed } from 'vue'
import { boxStyleToCss } from '../../../core/model/boxStyle'
import type { ShortAnswerBox } from '../../../core/model/types'

const props = defineProps<{
  object: ShortAnswerBox /** 자동 부여된 문항 번호. 없으면 배지를 그리지 않는다 (PLAN Q9). */
  questionNumber?: string | null
}>()

/** 정답이 하나도 없으면 내보내기가 막힌다 (기획 6.3). 편집 중에도 티가 나야 한다. */
const hasAnswer = computed(() => props.object.answers.some((a) => a.trim().length > 0))

/** 교사가 지정한 색만 인라인으로 덮는다. 미지정 필드는 CSS 토큰 기본값이 유지된다. */
const style = computed(() => boxStyleToCss(props.object.style))
</script>

<template>
  <div class="pck-answer pck-answer--short" :style="style">
    <span v-if="props.questionNumber" class="pck-answer-no">{{ props.questionNumber }}</span>
    <span class="pck-answer-badge">{{ props.object.points }}</span>
    <span v-if="!hasAnswer" class="pck-answer-hint">정답 미입력</span>
  </div>
</template>
