<script setup lang="ts">
/**
 * 도형 객체. SVG로 그린다.
 *
 * SVG를 쓰는 이유: 타원과 화살표를 CSS로 그리면 편법이 필요하고, 선 두께가 pt인데 CSS border는
 * 방향별로 다루기 번거롭다. viewBox를 객체 크기와 일치시켜 좌표를 pt로 유지한다.
 */
import { computed } from 'vue'
import type { ShapeObject } from '../../../core/model/types'

const props = defineProps<{ object: ShapeObject }>()

const w = computed(() => props.object.rect.w)
const h = computed(() => props.object.rect.h)
const style = computed(() => props.object.style)

/** 화살촉 크기. 선 두께에 비례하되 객체 크기를 넘지 않게 제한한다. */
const arrowHead = computed(() =>
  Math.min(style.value.strokeWidth * 4, w.value / 2, h.value / 2 + 4),
)
</script>

<template>
  <svg
    class="pck-obj-shape"
    :viewBox="`0 0 ${w} ${h}`"
    :width="w"
    :height="h"
    preserveAspectRatio="none"
  >
    <rect
      v-if="props.object.shape === 'rect'"
      :x="style.strokeWidth / 2"
      :y="style.strokeWidth / 2"
      :width="Math.max(w - style.strokeWidth, 0)"
      :height="Math.max(h - style.strokeWidth, 0)"
      :fill="style.fill ?? 'none'"
      :stroke="style.stroke"
      :stroke-width="style.strokeWidth"
      :stroke-dasharray="style.dash?.join(' ')"
    />
    <ellipse
      v-else-if="props.object.shape === 'ellipse'"
      :cx="w / 2"
      :cy="h / 2"
      :rx="Math.max(w / 2 - style.strokeWidth / 2, 0)"
      :ry="Math.max(h / 2 - style.strokeWidth / 2, 0)"
      :fill="style.fill ?? 'none'"
      :stroke="style.stroke"
      :stroke-width="style.strokeWidth"
      :stroke-dasharray="style.dash?.join(' ')"
    />
    <template v-else>
      <!-- 선과 화살표는 rect의 좌상단에서 우하단으로 그린다. -->
      <line
        :x1="0"
        :y1="h / 2"
        :x2="props.object.shape === 'arrow' ? Math.max(w - arrowHead, 0) : w"
        :y2="h / 2"
        :stroke="style.stroke"
        :stroke-width="style.strokeWidth"
        :stroke-dasharray="style.dash?.join(' ')"
      />
      <polygon
        v-if="props.object.shape === 'arrow'"
        :points="`${w},${h / 2} ${w - arrowHead},${h / 2 - arrowHead / 2} ${w - arrowHead},${h / 2 + arrowHead / 2}`"
        :fill="style.stroke"
      />
    </template>
  </svg>
</template>
