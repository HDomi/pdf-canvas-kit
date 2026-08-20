<script setup lang="ts">
/**
 * 좌측 패널. 페이지 썸네일과 페이지 조작.
 *
 * 썸네일 클릭이 스테이지를 전환하고(PLAN 6.2), 위아래로 드래그하면 순서가 바뀐다.
 * 클릭과 드래그를 구분하는 임계값은 `usePageReorder` 가 관리한다.
 */
import { ref } from 'vue'
import { usePageReorder } from '../composables/usePageReorder'
import type { WorksheetPage } from '../../core/model/types'
import PageThumb from './PageThumb.vue'

const props = defineProps<{
  pages: WorksheetPage[]
  currentIndex: number
  readOnly: boolean
  t: (key: string) => string
}>()

const emit = defineEmits<{
  select: [index: number]
  addFile: []
  addBlank: []
  duplicate: [index: number]
  remove: [index: number]
  reorder: [from: number, to: number]
  contextmenu: [index: number, event: MouseEvent]
}>()

const listEl = ref<HTMLElement | null>(null)

const reorder = usePageReorder({
  listEl,
  disabled: ref(props.readOnly),
  onReorder: (from, to) => emit('reorder', from, to),
})
</script>

<template>
  <aside class="lws-pagelist">
    <header class="lws-panel-head">
      <span>{{ props.t('pages.title') }}</span>
      <span class="lws-panel-count">{{ props.pages.length }}</span>
    </header>

    <div ref="listEl" class="lws-pagelist-scroll">
      <p v-if="props.pages.length === 0" class="lws-panel-empty">
        {{ props.t('pages.empty') }}
      </p>

      <ol v-else class="lws-thumb-list">
        <PageThumb
          v-for="(page, i) in props.pages"
          :key="page.id"
          :page="page"
          :index="i"
          :active="i === props.currentIndex"
          :dragging="reorder.draggingIndex.value === i"
          :drop-before="reorder.dropIndex.value === i"
          :drop-after="
            i === props.pages.length - 1 && reorder.dropIndex.value === props.pages.length
          "
          @select="emit('select', $event)"
          @pointerdown="reorder.onItemPointerDown"
          @contextmenu="(i, e) => emit('contextmenu', i, e)"
        />
      </ol>

      <div v-if="props.pages.length > 0" class="lws-pagelist-actions">
        <button type="button" class="lws-dashed-btn" @click="emit('addFile')">
          {{ props.t('pages.addFile') }}
        </button>
        <button type="button" class="lws-dashed-btn" @click="emit('addBlank')">
          {{ props.t('pages.addBlank') }}
        </button>
        <div class="lws-pagelist-rowbtns">
          <button
            type="button"
            :disabled="props.currentIndex < 0"
            @click="emit('duplicate', props.currentIndex)"
          >
            {{ props.t('pages.duplicate') }}
          </button>
          <button
            type="button"
            :disabled="props.currentIndex < 0 || props.pages.length <= 1"
            :title="props.pages.length <= 1 ? props.t('error.minPages') : undefined"
            @click="emit('remove', props.currentIndex)"
          >
            {{ props.t('pages.delete') }}
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
