<script setup lang="ts">
/**
 * 박스 색 편집. 텍스트·단답형·서술형·드롭박스가 공유한다 (PLAN 18.8).
 *
 * ## 체크박스로 "지정 여부" 를 다루는 이유
 *
 * 모델의 `BoxStyle` 은 "미지정" 과 "지정" 을 구분한다. 미지정이면 CSS 토큰 기본값이 적용되므로
 * 호스트가 `--lws-*` 로 테마를 바꿀 수 있다(ARCHITECTURE §3). 색 선택기만 두면 항상 값이
 * 채워져 그 구분이 사라진다.
 *
 * 그래서 각 항목에 체크박스를 두고, 껐을 때 필드를 **`undefined` 로 되돌린다**.
 * `null` 은 "투명/없음" 이라는 다른 의미이므로 배경·테두리에서 별도로 쓴다.
 */
import { computed } from 'vue'
import { DEFAULT_BOX_STROKE_WIDTH, type BoxStylePatch } from '../../../core/model/boxStyle'
import type { BoxStyle } from '../../../core/model/types'

const props = defineProps<{
  style: BoxStyle | undefined
  /**
   * 배경 항목의 라벨을 바꾼다. 텍스트는 "배경" 이 선택 사항이라는 뉘앙스가 필요하다.
   */
  t: (key: string) => string
}>()

const emit = defineEmits<{
  /** 변경된 필드만 담은 패치. 호출자가 `mergeBoxStyle` 로 병합한다. */
  update: [patch: BoxStylePatch]
}>()

/** 배경을 지정했는지. `null`(투명)도 지정에 포함된다. */
const fillOn = computed(() => props.style?.fill !== undefined)
const strokeOn = computed(() => props.style?.stroke !== undefined)
const colorOn = computed(() => props.style?.color !== undefined)

/** 색 선택기에 보여줄 값. 미지정이면 흔한 기본값을 placeholder처럼 쓴다. */
const fillValue = computed(() => props.style?.fill ?? '#ffffff')
const strokeValue = computed(() => props.style?.stroke ?? '#1c1c1a')
const colorValue = computed(() => props.style?.color ?? '#1c1c1a')

/**
 * 항목을 끈다.
 *
 * `undefined` 를 명시적으로 보낸다 — 호출자가 스프레드로 병합하므로 키가 있어야 지워진다.
 * 키를 생략하면 기존 값이 그대로 남는다.
 */
function toggleFill(on: boolean) {
  emit('update', { fill: on ? fillValue.value : undefined })
}

function toggleStroke(on: boolean) {
  emit(
    'update',
    on
      ? {
          stroke: strokeValue.value,
          strokeWidth: props.style?.strokeWidth ?? DEFAULT_BOX_STROKE_WIDTH,
        }
      : { stroke: undefined, strokeWidth: undefined },
  )
}

function toggleColor(on: boolean) {
  emit('update', { color: on ? colorValue.value : undefined })
}
</script>

<template>
  <section class="lws-panel-section">
    <h3 class="lws-field-label">{{ props.t('inspector.boxStyle') }}</h3>

    <label class="lws-field--inline">
      <input
        class="lws-check"
        type="checkbox"
        :checked="fillOn"
        @change="toggleFill(($event.target as HTMLInputElement).checked)"
      />
      <span class="lws-style-label">{{ props.t('inspector.background') }}</span>
      <input
        v-if="fillOn"
        class="lws-input lws-input--color"
        type="color"
        :value="fillValue === null ? '#ffffff' : fillValue"
        @input="emit('update', { fill: ($event.target as HTMLInputElement).value })"
      />
      <!-- 투명은 색으로 표현할 수 없으므로 별도 토글로 둔다. -->
      <button
        v-if="fillOn"
        type="button"
        class="lws-chip"
        :class="{ 'is-active': props.style?.fill === null }"
        :title="props.t('inspector.transparentHint')"
        @click="emit('update', { fill: props.style?.fill === null ? '#ffffff' : null })"
      >
        {{ props.t('inspector.transparent') }}
      </button>
    </label>

    <label class="lws-field--inline">
      <input
        class="lws-check"
        type="checkbox"
        :checked="strokeOn"
        @change="toggleStroke(($event.target as HTMLInputElement).checked)"
      />
      <span class="lws-style-label">{{ props.t('inspector.stroke') }}</span>
      <input
        v-if="strokeOn"
        class="lws-input lws-input--color"
        type="color"
        :value="strokeValue === null ? '#1c1c1a' : strokeValue"
        @input="emit('update', { stroke: ($event.target as HTMLInputElement).value })"
      />
      <input
        v-if="strokeOn"
        class="lws-input lws-input--num lws-input--narrow"
        type="number"
        min="0.5"
        max="20"
        step="0.5"
        :value="props.style?.strokeWidth ?? DEFAULT_BOX_STROKE_WIDTH"
        :title="props.t('inspector.strokeWidth')"
        @input="
          emit('update', {
            strokeWidth:
              Number(($event.target as HTMLInputElement).value) || DEFAULT_BOX_STROKE_WIDTH,
          })
        "
      />
    </label>

    <label class="lws-field--inline">
      <input
        class="lws-check"
        type="checkbox"
        :checked="colorOn"
        @change="toggleColor(($event.target as HTMLInputElement).checked)"
      />
      <span class="lws-style-label">{{ props.t('inspector.textColor') }}</span>
      <input
        v-if="colorOn"
        class="lws-input lws-input--color"
        type="color"
        :value="colorValue"
        @input="emit('update', { color: ($event.target as HTMLInputElement).value })"
      />
    </label>

    <p class="lws-field-note">{{ props.t('inspector.boxStyleNote') }}</p>
  </section>
</template>
