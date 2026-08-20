<script setup lang="ts">
/**
 * 페이지 배경. 변환된 문서 이미지이거나 빈 종이다.
 *
 * 이미지는 픽셀 크기가 아니라 퍼센트로 페이지 박스를 채운다. 그래서 래스터 해상도가 좌표와
 * 무관해진다 — `targetPx` 를 바꿔 다시 래스터화해도 아무것도 움직이지 않는다 (PLAN 5.7).
 */
import { computed } from 'vue'
import type { PDFCanvasPage } from '../../core/model/types'

const props = defineProps<{ page: PDFCanvasPage }>()

const image = computed(() =>
  props.page.background.kind === 'image' ? props.page.background : null,
)
</script>

<template>
  <img
    v-if="image"
    class="pck-page-bg"
    :src="image.url"
    :alt="''"
    draggable="false"
    decoding="async"
  />
  <div v-else class="pck-page-bg pck-page-bg--blank" />
</template>
