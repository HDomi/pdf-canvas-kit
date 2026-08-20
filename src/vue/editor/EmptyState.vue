<script setup lang="ts">
/**
 * 워크시트에 페이지가 없을 때 보여준다 (와이어프레임 1.1, 기획 1.5).
 */
const props = defineProps<{ t: (key: string) => string }>()
const emit = defineEmits<{ import: [] }>()
</script>

<template>
  <div class="lws-empty">
    <div class="lws-empty-doc" aria-hidden="true"><span /><span /><span /></div>
    <h2>{{ props.t('empty.title') }}</h2>
    <p>{{ props.t('empty.description') }}</p>
    <button type="button" class="lws-primary-btn" @click="emit('import')">
      {{ props.t('empty.action') }}
    </button>
  </div>
</template>
