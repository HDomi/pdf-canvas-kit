<script setup lang="ts">
/**
 * 배경을 가리는 불투명 사각형 (기획의 지우개 해석 중 하나, PLAN Q1).
 */
import type { MaskObject } from '../../../core/model/types'

const props = defineProps<{ object: MaskObject }>()
</script>

<template>
  <div class="lws-obj-mask" :style="{ background: props.object.fill }" />
</template>
