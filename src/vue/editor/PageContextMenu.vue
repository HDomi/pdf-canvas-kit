<script setup lang="ts">
/**
 * 페이지 썸네일 우클릭 메뉴 (기획 9.1, 10.1).
 *
 * 기획이 "우클릭 메뉴 또는 삭제 버튼" 을 요구한다. 좌측 패널 하단 버튼만으로는 어떤 페이지에
 * 적용되는지 헷갈리므로, 대상이 분명한 우클릭 경로를 함께 둔다.
 *
 * 위치는 `position: fixed` 로 포인터 좌표에 붙인다. 좌측 패널은 스크롤 컨테이너라 그 안에 두면
 * 메뉴가 잘리거나 스크롤에 딸려간다.
 */
import { computed } from 'vue'

const props = defineProps<{
  /** 뷰포트 좌표. */
  x: number
  y: number
  pageIndex: number
  /** 마지막 1페이지는 삭제할 수 없다 (기획 9.2). */
  canDelete: boolean
  t: (key: string) => string
}>()

const emit = defineEmits<{
  duplicate: [index: number]
  remove: [index: number]
  addBlankAfter: [index: number]
  close: []
}>()

/**
 * 메뉴가 화면 밖으로 나가지 않게 민다.
 *
 * 아래쪽 여백이 부족하면 포인터 위로 올린다 — 목록 하단에서 우클릭하면 흔한 상황이다.
 */
const style = computed(() => {
  const width = 168
  const height = 116
  const left = Math.min(props.x, window.innerWidth - width - 8)
  const top = Math.min(props.y, window.innerHeight - height - 8)
  return { left: `${Math.max(8, left)}px`, top: `${Math.max(8, top)}px`, width: `${width}px` }
})
</script>

<template>
  <!-- 바깥 클릭·우클릭으로 닫는다. document 리스너보다 스크림이 확실하다. -->
  <div class="pck-menu-scrim" @pointerdown="emit('close')" @contextmenu.prevent="emit('close')" />
  <div class="pck-context-menu" role="menu" :style="style">
    <button type="button" role="menuitem" @click="emit('duplicate', props.pageIndex)">
      {{ props.t('pages.duplicate') }}
    </button>
    <button type="button" role="menuitem" @click="emit('addBlankAfter', props.pageIndex)">
      {{ props.t('pages.addBlank') }}
    </button>
    <hr />
    <button
      type="button"
      role="menuitem"
      class="is-danger"
      :disabled="!props.canDelete"
      :title="props.canDelete ? undefined : props.t('error.minPages')"
      @click="emit('remove', props.pageIndex)"
    >
      {{ props.t('pages.delete') }}
    </button>
  </div>
</template>
