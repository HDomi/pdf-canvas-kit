<script setup lang="ts">
/**
 * 저장 상태 배지 (기획 1.3).
 *
 * 현재 기본값은 `disabled` 다. M8까지 StoragePort가 연결되지 않으며, 아무것도 저장되지 않는
 * 상태에서 "저장됨"을 띄우는 것은 거짓말이다.
 */
import { computed } from 'vue'
import type { SaveState } from '../../core/model/viewState'

const props = defineProps<{
  state: SaveState
  t: (key: string) => string
}>()

const label = computed(() => props.t(`save.${props.state}`))
</script>

<template>
  <span class="pck-badge" :class="`is-${props.state}`" role="status">{{ label }}</span>
</template>
