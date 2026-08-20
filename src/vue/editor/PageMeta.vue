<script setup lang="ts">
/**
 * 스테이지 위의 "1 / 3 · A4 세로" 표기.
 *
 * 용지 이름은 페이지의 pt 크기를 표준 규격과 매칭해 얻는다. 스캔 문서와 슬라이드는 보통
 * raw 크기로 떨어진다 (PLAN 6.7).
 */
import { computed } from 'vue'
import { formatPaperLabel } from '../../core/geometry/paperSize'
import type { Size } from '../../core/model/types'

const props = defineProps<{
  current: number
  total: number
  size: Size | null
}>()

const paper = computed(() => (props.size ? formatPaperLabel(props.size) : null))
</script>

<template>
  <p v-if="props.total > 0" class="pck-pagemeta">
    <span class="mono">{{ props.current }} / {{ props.total }}</span>
    <template v-if="paper"> · {{ paper }}</template>
  </p>
</template>
