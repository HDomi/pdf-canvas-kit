<script setup lang="ts">
/**
 * 선택 테두리·핸들·마퀴를 그리는 오버레이 (PLAN D5).
 *
 * 페이지 프레임 위에 절대 배치되며 **배율 transform 밖**이다. 그래서 어떤 배율에서도 선 두께와
 * 핸들 크기가 일정하다. 좌표는 `rectToFrame` 으로 변환한다 — 객체 뷰와 달리 여기서는 변환이
 * 정상이고 필요하다.
 */
import { computed } from 'vue'
import { rectToFrame, type PageViewport } from '../../core/geometry/units'
import type { HandleId } from '../../core/geometry/handles'
import type { Rect } from '../../core/model/types'
import ResizeHandles from './ResizeHandles.vue'

const props = defineProps<{
  viewport: PageViewport
  /**
   * 선택된 객체들. rect는 pt이고, 드래그 중이면 미리보기 값이 들어온다.
   * `rotation` 을 함께 받아 테두리도 객체와 같이 기울인다.
   */
  selectedRects: { rect: Rect; rotation: number }[]
  /** 드래그로 그리는 중인 영역. 생성 마퀴와 선택 마퀴를 구분한다. */
  preview: { rect: Rect; kind: 'create' | 'marquee' } | null
  /** 핸들을 그릴 대상. 단일 선택일 때만 준다. */
  handleRect: Rect | null
  /** 회전 핸들 표시 여부. */
  rotatable: boolean
  /** 핸들 대상의 현재 각도(deg). */
  handleRotation: number
}>()

const emit = defineEmits<{
  grabHandle: [handle: HandleId, event: PointerEvent]
  grabRotate: [event: PointerEvent]
}>()

const boxes = computed(() =>
  props.selectedRects.map((s) => ({
    frame: rectToFrame(s.rect, props.viewport),
    rotation: s.rotation,
  })),
)
const previewBox = computed(() =>
  props.preview ? rectToFrame(props.preview.rect, props.viewport) : null,
)

function boxStyle(r: Rect, rotation = 0) {
  const base: Record<string, string> = {
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${r.w}px`,
    height: `${r.h}px`,
  }
  // 객체 렌더와 같은 원점(center)을 쓴다. 그래야 테두리가 객체에 정확히 겹친다.
  if (rotation) {
    base['transform'] = `rotate(${rotation}deg)`
    base['transformOrigin'] = 'center'
  }
  return base
}
</script>

<template>
  <div class="lws-overlay" aria-hidden="true">
    <div
      v-for="(b, i) in boxes"
      :key="i"
      class="lws-select-box"
      :style="boxStyle(b.frame, b.rotation)"
    />

    <div
      v-if="previewBox && props.preview"
      class="lws-marquee"
      :class="`is-${props.preview.kind}`"
      :style="boxStyle(previewBox)"
    />

    <ResizeHandles
      v-if="props.handleRect"
      :rect="props.handleRect"
      :viewport="props.viewport"
      :rotatable="props.rotatable"
      :rotation="props.handleRotation"
      @grab="(h, e) => emit('grabHandle', h, e)"
      @grab-rotate="(e) => emit('grabRotate', e)"
    />
  </div>
</template>
