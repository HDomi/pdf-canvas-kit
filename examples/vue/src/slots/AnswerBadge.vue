<script setup lang="ts">
/**
 * 편집기 캔버스의 커스텀 객체 — **미리보기**다.
 *
 * 편집은 인스펙터에서 한다 (커스텀 객체의 편집 창구는 인스펙터 하나다). 캔버스에서 입력을 받으려 하면 드래그와 포커스가 같은
 * 포인터 이벤트를 다투고, `pointerdown` 의 `preventDefault()` 가 포커스를 취소한다.
 */
import { computed } from 'vue'
import type { Answer } from '../objectType'

const props = defineProps<{ objectId: string; data: Answer }>()
const filled = computed(() => props.data.answers.some((a) => a.trim()))
</script>

<template>
  <div class="ex-badge">
    <b>{{ data.points }}점</b>
    <span v-if="!filled" class="ex-badge-warn">정답 미입력</span>
  </div>
</template>
