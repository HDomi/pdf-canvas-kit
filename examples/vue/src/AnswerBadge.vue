<script setup lang="ts">
// 편집기 캔버스 — 미리보기. 편집은 인스펙터에서 한다 (PLAN D26).
import type { Answer } from './objectType'

const props = defineProps<{ objectId: string; data: Answer }>()
const filled = () => props.data.answers.some((a) => a.trim())
</script>

<template>
  <div style="padding: 0 8px; font-size: 11px; line-height: 44px">
    <b>{{ data.points }}점</b>
    <span v-if="!filled()" style="color: #b4342b; margin-left: 6px">정답 미입력</span>
  </div>
</template>
