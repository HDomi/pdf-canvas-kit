<script setup lang="ts">
// 공통 SVG 껍데기. `currentColor` 를 쓰므로 버튼의 글자색을 따라간다.
withDefaults(defineProps<{ size?: number }>(), { size: 15 })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <slot />
  </svg>
</template>
