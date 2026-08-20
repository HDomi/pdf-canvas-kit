<script setup lang="ts">
/**
 * 스테이지 우측 하단에 고정되는 줌 컨트롤.
 *
 * 스크롤 컨테이너의 자식이 아니라 형제로 마운트한다. 안에 두면 컨트롤이 페이지와 함께
 * 스크롤돼 사라진다 (PLAN 6.1).
 *
 * +/- 버튼은 스테이지 중앙을 앵커로 쓴다. 포인터를 앵커로 쓰는 Ctrl+휠과 다르다 (PLAN 6.4).
 */
import { ref } from 'vue'

const props = defineProps<{
  percent: number
  canZoomIn: boolean
  canZoomOut: boolean
  presets: readonly number[]
  t: (key: string) => string
}>()

const emit = defineEmits<{
  step: [direction: 1 | -1]
  set: [scale: number]
  fitWidth: []
  fitPage: []
}>()

const menuOpen = ref(false)

function choose(action: () => void) {
  action()
  menuOpen.value = false
}
</script>

<template>
  <div class="pck-stage-controls">
    <button
      type="button"
      class="pck-zoom-btn"
      :disabled="!props.canZoomOut"
      :title="props.t('stage.zoomOut')"
      :aria-label="props.t('stage.zoomOut')"
      @click="emit('step', -1)"
    >
      −
    </button>

    <button
      type="button"
      class="pck-zoom-value"
      :aria-expanded="menuOpen"
      aria-haspopup="menu"
      @click="menuOpen = !menuOpen"
    >
      {{ props.percent }}%
    </button>

    <button
      type="button"
      class="pck-zoom-btn"
      :disabled="!props.canZoomIn"
      :title="props.t('stage.zoomIn')"
      :aria-label="props.t('stage.zoomIn')"
      @click="emit('step', 1)"
    >
      +
    </button>

    <!-- 바깥 클릭은 아래의 오버레이 버튼이 처리한다. document 수준 리스너를 쓰면
         정상적인 스테이지 클릭까지 삼키게 된다. -->
    <template v-if="menuOpen">
      <button type="button" class="pck-menu-scrim" tabindex="-1" @click="menuOpen = false" />
      <div class="pck-zoom-menu" role="menu">
        <button type="button" role="menuitem" @click="choose(() => emit('fitWidth'))">
          {{ props.t('stage.fitWidth') }}
        </button>
        <button type="button" role="menuitem" @click="choose(() => emit('fitPage'))">
          {{ props.t('stage.fitPage') }}
        </button>
        <hr />
        <button
          v-for="p in props.presets"
          :key="p"
          type="button"
          role="menuitem"
          :class="{ 'is-current': Math.round(p * 100) === props.percent }"
          @click="choose(() => emit('set', p))"
        >
          {{ Math.round(p * 100) }}%
        </button>
      </div>
    </template>
  </div>
</template>
