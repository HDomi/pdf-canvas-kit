<script setup lang="ts">
/**
 * 좌측 목록의 페이지 썸네일 하나.
 *
 * 저해상도 이미지를 따로 렌더하지 않고 페이지의 원본 배경을 재사용한다. 축소는 브라우저가
 * 처리하고, 썸네일 전용 래스터화 패스를 두면 대부분의 교사가 스쳐 지나가는 목록 때문에
 * 변환 시간이 두 배가 된다. `loading="lazy"` 덕분에 500페이지 문서가 비트맵 500개를 한 번에
 * 디코딩하지 않는다.
 */
import { computed } from 'vue'
import type { WorksheetPage } from '../../core/model/types'

const props = defineProps<{
  page: WorksheetPage
  index: number
  active: boolean
  /** 드래그 중인 항목인지. 반투명하게 표시한다. */
  dragging: boolean
  /** 이 항목 앞에 삽입 표시선을 그릴지. */
  dropBefore: boolean
  /** 목록 마지막 항목이고 뒤에 삽입 표시선을 그릴지. */
  dropAfter: boolean
}>()

const emit = defineEmits<{
  select: [index: number]
  pointerdown: [index: number, event: PointerEvent]
  contextmenu: [index: number, event: MouseEvent]
}>()

const image = computed(() =>
  props.page.background.kind === 'image' ? props.page.background : null,
)

/** 페이지 비율을 유지한다. 크기가 섞인 문서도 제대로 보이게. */
const ratio = computed(() => `${props.page.size.width} / ${props.page.size.height}`)
</script>

<template>
  <li
    class="lws-thumb-item"
    :class="{
      'is-dragging': props.dragging,
      'is-drop-before': props.dropBefore,
      'is-drop-after': props.dropAfter,
    }"
    :data-page-index="props.index"
  >
    <button
      type="button"
      class="lws-thumb"
      :class="{ 'is-active': props.active }"
      :aria-current="props.active ? 'page' : undefined"
      @click="emit('select', props.index)"
      @pointerdown="emit('pointerdown', props.index, $event)"
      @contextmenu.prevent="emit('contextmenu', props.index, $event)"
    >
      <span class="lws-thumb-paper" :style="{ aspectRatio: ratio }">
        <img
          v-if="image"
          :src="image.url"
          alt=""
          loading="lazy"
          decoding="async"
          draggable="false"
        />
      </span>
      <span class="lws-thumb-no">{{ props.index + 1 }}</span>
    </button>
  </li>
</template>
