<script setup lang="ts">
/**
 * 캔버스 객체 하나를 렌더한다. 유형별 뷰로 분기하는 얇은 껍데기다.
 *
 * ## 좌표를 계산하지 않는다
 *
 * pt 값을 px에 그대로 쓴다. 배율은 부모 페이지 엘리먼트의 `transform: scale()` 이 처리하므로
 * 여기에 곱셈이 없다 (PLAN 5.3). 그래서 이 디렉토리에서는 `geometry/units` import를 ESLint가
 * 막는다 — 좌표 변환을 하려는 시도 자체가 설계 위반이다.
 *
 * 드래그 중에는 `previewRect` 가 들어온다. 문서를 아직 바꾸지 않은 상태에서 위치만 미리 보여주기
 * 위한 것으로, 커밋은 `pointerup` 에서 한 번 일어난다 (PLAN 11.2).
 */
import { computed } from 'vue'
import type { Rect, WorksheetObject } from '../../../core/model/types'
import DropboxAnswerView from './DropboxAnswerView.vue'
import EssayAnswerView from './EssayAnswerView.vue'
import MaskView from './MaskView.vue'
import ShapeObjectView from './ShapeObjectView.vue'
import ShortAnswerView from './ShortAnswerView.vue'
import TextObjectView from './TextObjectView.vue'

const props = defineProps<{
  object: WorksheetObject
  selected: boolean
  /** 내보내기를 막는 상태면 true. 테두리를 경고색으로 바꾼다. */
  invalid: boolean
  /** 드래그·리사이즈 중 미리보기 rect. 없으면 문서 값을 쓴다. */
  previewRect?: Rect | null
  /** 회전 중 미리보기 각도. 없으면 문서 값을 쓴다. */
  previewRotation?: number | null
  /** 이 객체가 인라인 텍스트 편집 중인지. */
  editing?: boolean
  /** 자동 부여된 문항 번호. Answer Box에만 표시한다 (PLAN Q9). */
  questionNumber?: string | null
}>()

const emit = defineEmits<{ editText: [value: string] }>()

const rect = computed(() => props.previewRect ?? props.object.rect)
const rotation = computed(() => props.previewRotation ?? props.object.rotation ?? 0)

const style = computed(() => {
  const r = rect.value
  const base: Record<string, string> = {
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${r.w}px`,
    height: `${r.h}px`,
  }
  if (rotation.value) {
    base['transform'] = `rotate(${rotation.value}deg)`
    base['transformOrigin'] = 'center'
  }
  return base
})
</script>

<template>
  <div
    class="lws-obj"
    :class="{
      'is-selected': props.selected,
      'is-invalid': props.invalid,
      'is-editing': props.editing === true,
      [`is-${props.object.type.replace('.', '-')}`]: true,
    }"
    :data-object-id="props.object.id"
    :style="style"
  >
    <TextObjectView
      v-if="props.object.type === 'text'"
      :object="props.object"
      :editing="props.editing === true"
      @edit="emit('editText', $event)"
    />
    <ShapeObjectView v-else-if="props.object.type === 'shape'" :object="props.object" />
    <MaskView v-else-if="props.object.type === 'mask'" :object="props.object" />
    <ShortAnswerView
      v-else-if="props.object.type === 'answer.short'"
      :object="props.object"
      :question-number="props.questionNumber ?? null"
    />
    <EssayAnswerView
      v-else-if="props.object.type === 'answer.essay'"
      :object="props.object"
      :question-number="props.questionNumber ?? null"
    />
    <DropboxAnswerView
      v-else
      :object="props.object"
      :question-number="props.questionNumber ?? null"
    />
  </div>
</template>
