<script setup lang="ts">
/**
 * 스테이지. 정확히 한 페이지만 담는 스크롤 컨테이너다 (PLAN D8).
 *
 * 페이지 하나만 렌더하면 DOM 비용이 문서 길이와 무관해지고(500페이지 워크시트가 3페이지와 같은
 * 비용), "현재 페이지"가 스크롤 위치에서 파생되는 값이 아니라 명시적 상태가 된다.
 *
 * 스크롤은 페이지가 스테이지보다 클 때, 즉 확대했을 때만 생긴다. 맞춤 상태에서는 팬할 것이
 * 없으므로 pad가 페이지를 중앙에 둔다.
 */
import { computed, ref } from 'vue'
import type { WorksheetPage } from '../../core/model/types'
import PageFrame from './PageFrame.vue'

const props = defineProps<{
  page: WorksheetPage | null
  scale: number
  panArmed: boolean
  panning: boolean
  /** 생성 도구가 선택돼 있으면 커서를 십자로 바꾼다. */
  toolActive: boolean
}>()

const emit = defineEmits<{
  wheelZoom: [deltaY: number, anchor: { x: number; y: number }]
  pagePointerDown: [event: PointerEvent]
  pageDblclick: [event: MouseEvent]
}>()

/**
 * Ctrl/Cmd + 휠은 줌, 그냥 휠은 스크롤이다.
 *
 * macOS 트랙패드 pinch도 `ctrlKey: true` 인 휠 이벤트로 들어오므로 두 제스처가 같은 경로를
 * 공유한다.
 */
function onWheel(e: WheelEvent) {
  if (!e.ctrlKey && !e.metaKey) return
  // 이걸 막지 않으면 브라우저가 자기 페이지 줌을 적용한다.
  e.preventDefault()
  emit('wheelZoom', e.deltaY, { x: e.clientX, y: e.clientY })
}

const cursorClass = computed(() => ({
  'is-pan-armed': props.panArmed,
  'is-panning': props.panning,
  'is-tool-active': props.toolActive && !props.panArmed,
}))

/**
 * 스크롤 컨테이너 자체. 줌 앵커링·팬·맞춤 계산이 모두 이 요소의 스크롤 오프셋과 client 크기를
 * 대상으로 하므로 노출한다. 컴포넌트 인스턴스만으로는 부모가 할 일을 할 수 없다.
 */
const scrollEl = ref<HTMLElement | null>(null)
const frameRef = ref<{ frameEl: HTMLElement | null } | null>(null)

/** 좌표 변환의 기준이 되는 페이지 프레임 엘리먼트. */
const frameEl = computed(() => frameRef.value?.frameEl ?? null)

defineExpose({ scrollEl, frameEl })
</script>

<template>
  <div ref="scrollEl" class="lws-stage" :class="cursorClass" tabindex="0" @wheel="onWheel">
    <div class="lws-stage-pad">
      <PageFrame
        v-if="props.page"
        ref="frameRef"
        :page="props.page"
        :scale="props.scale"
        @pointerdown="emit('pagePointerDown', $event)"
        @dblclick="emit('pageDblclick', $event)"
      >
        <template #objects><slot name="objects" /></template>
        <template #overlay="slotProps"><slot name="overlay" v-bind="slotProps" /></template>
      </PageFrame>
    </div>
  </div>
</template>
