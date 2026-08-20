<script setup lang="ts">
/**
 * 8방향 리사이즈 핸들 + 회전 핸들 (PLAN 11.3).
 *
 * **배율 transform 밖에** 그린다 (PLAN D5). 안에 두면 25% 배율에서 핸들이 2px로 줄어 잡을 수
 * 없다. 그래서 좌표는 `rectToFrame` 으로 화면 px로 변환하고, 핸들 자체 크기는 배율과 무관하게
 * 고정한다.
 *
 * ## 회전 반영
 *
 * 객체가 회전하면 핸들도 함께 돌아야 한다. 핸들 좌표를 하나씩 회전 계산하는 대신 **감싸는
 * 래퍼에 `rotate()` 를 걸고, 핸들 자신은 역회전**시킨다. 그러면 핸들 위치는 객체를 따라 돌고
 * 핸들 모양(정사각형)은 화면 기준으로 유지된다 — 기울어진 핸들은 잡기 어렵다.
 */
import { computed } from 'vue'
import { EDITOR_DEFAULTS } from '../../core/config/defaults'
import {
  HANDLE_ANCHORS,
  HANDLE_CURSORS,
  HANDLE_IDS,
  ROTATE_HANDLE_OFFSET_PX,
  type HandleId,
} from '../../core/geometry/handles'
import { rectToFrame, type PageViewport } from '../../core/geometry/units'
import type { Rect } from '../../core/model/types'

const props = defineProps<{
  rect: Rect
  viewport: PageViewport
  /** 회전 핸들을 그릴지. Answer Box는 회전하지 않는다 (PLAN Q8). */
  rotatable: boolean
  /** 현재 각도(deg). 드래그 중이면 미리보기 값이 들어온다. */
  rotation: number
}>()

const emit = defineEmits<{
  grab: [handle: HandleId, event: PointerEvent]
  grabRotate: [event: PointerEvent]
}>()

const frameRect = computed(() => rectToFrame(props.rect, props.viewport))
const size = EDITOR_DEFAULTS.handles.sizePx
const hit = EDITOR_DEFAULTS.handles.hitPx

/**
 * 회전을 담당하는 래퍼 스타일.
 *
 * 객체의 중심을 회전 원점으로 삼는다. 객체 렌더도 `transform-origin: center` 를 쓰므로
 * 두 회전이 정확히 겹친다.
 */
const groupStyle = computed(() => {
  if (!props.rotation) return {}
  const r = frameRect.value
  return {
    transform: `rotate(${props.rotation}deg)`,
    transformOrigin: `${r.x + r.w / 2}px ${r.y + r.h / 2}px`,
  }
})

/** 핸들 자신은 역회전시켜 화면 기준 정사각형을 유지한다. */
const counterRotate = computed(() => (props.rotation ? ` rotate(${-props.rotation}deg)` : ''))

function styleFor(id: HandleId) {
  const a = HANDLE_ANCHORS[id]
  const r = frameRect.value
  return {
    left: `${r.x + r.w * a.fx}px`,
    top: `${r.y + r.h * a.fy}px`,
    width: `${size}px`,
    height: `${size}px`,
    // 히트 영역을 시각 크기보다 키운다. 잡기 편해야 한다.
    padding: `${(hit - size) / 2}px`,
    // translate 로 앵커를 핸들 중앙에 맞춘 뒤 역회전을 얹는다.
    transform: `translate(-50%, -50%)${counterRotate.value}`,
    cursor: HANDLE_CURSORS[id],
  }
}

/** 회전 핸들은 위쪽 엣지 밖에 둔다. 리사이즈 핸들과 겹치지 않는 관례적 위치다. */
const rotateStyle = computed(() => {
  const r = frameRect.value
  return {
    left: `${r.x + r.w / 2}px`,
    top: `${r.y - ROTATE_HANDLE_OFFSET_PX}px`,
    width: `${size}px`,
    height: `${size}px`,
    padding: `${(hit - size) / 2}px`,
    transform: `translate(-50%, -50%)${counterRotate.value}`,
  }
})
</script>

<template>
  <!-- 회전은 이 래퍼가 담당한다. 핸들 좌표를 개별로 회전 계산하지 않는다. -->
  <div class="pck-handle-group" :style="groupStyle">
    <button
      v-for="id in HANDLE_IDS"
      :key="id"
      type="button"
      class="pck-handle"
      :data-handle="id"
      :style="styleFor(id)"
      :aria-label="`resize ${id}`"
      @pointerdown.stop.prevent="emit('grab', id, $event)"
    />

    <button
      v-if="props.rotatable"
      type="button"
      class="pck-handle pck-handle--rotate"
      :style="rotateStyle"
      aria-label="rotate"
      @pointerdown.stop.prevent="emit('grabRotate', $event)"
    />
  </div>
</template>
