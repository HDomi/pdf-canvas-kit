<script setup lang="ts">
/**
 * 도형 인스펙터.
 *
 * ## 편집 가능한 속성의 범위 (PLAN Q7)
 *
 * 기획 8.1도 [General] 문서에 위임한다. "최소 세트"의 정확한 범위는 아래와 같다.
 *
 * **지금 편집할 수 있는 것** — 모양(사각형/타원/선/화살표) · 채움 색 · 테두리 색 · 테두리 두께.
 *
 * **모델에는 있으나 UI가 없는 것** — `dash`(점선 패턴). 렌더는 이미 지원한다.
 *
 * **모델에도 없는 것** — 모서리 반경, 그림자, 그라디언트, 화살촉 방향·양단 선택,
 * 다각형·자유 곡선.
 *
 * 채움은 `null` 이 "없음" 이다. `transparent` 문자열을 쓰면 색 선택기 값과 구분되지 않는다.
 */
import type { ShapeKind, ShapeObject } from '../../../core/model/types'

const props = defineProps<{
  object: ShapeObject
  t: (key: string) => string
}>()

const emit = defineEmits<{ update: [patch: Partial<ShapeObject>] }>()

function patchStyle(patch: Partial<ShapeObject['style']>) {
  emit('update', { style: { ...props.object.style, ...patch } })
}

const KINDS: { id: ShapeKind; label: string }[] = [
  { id: 'rect', label: '▭' },
  { id: 'ellipse', label: '◯' },
  { id: 'line', label: '╱' },
  { id: 'arrow', label: '→' },
]
</script>

<template>
  <section class="lws-panel-section">
    <div class="lws-field">
      <span class="lws-field-label">{{ props.t('inspector.shapeKind') }}</span>
      <div class="lws-segmented">
        <button
          v-for="k in KINDS"
          :key="k.id"
          type="button"
          :class="{ 'is-active': props.object.shape === k.id }"
          @click="emit('update', { shape: k.id })"
        >
          {{ k.label }}
        </button>
      </div>
    </div>

    <label class="lws-field lws-field--inline">
      <input
        class="lws-check"
        type="checkbox"
        :checked="props.object.style.fill !== null"
        @change="
          patchStyle({ fill: ($event.target as HTMLInputElement).checked ? '#ffffff' : null })
        "
      />
      <span>{{ props.t('inspector.fill') }}</span>
      <input
        v-if="props.object.style.fill !== null"
        class="lws-input lws-input--color"
        type="color"
        :value="props.object.style.fill"
        @input="patchStyle({ fill: ($event.target as HTMLInputElement).value })"
      />
      <span v-else class="lws-field-note lws-field-note--inline">
        {{ props.t('inspector.noFill') }}
      </span>
    </label>

    <div class="lws-field-grid">
      <label class="lws-field">
        <span class="lws-field-label">{{ props.t('inspector.stroke') }}</span>
        <input
          class="lws-input lws-input--color"
          type="color"
          :value="props.object.style.stroke"
          @input="patchStyle({ stroke: ($event.target as HTMLInputElement).value })"
        />
      </label>

      <label class="lws-field">
        <span class="lws-field-label">{{ props.t('inspector.strokeWidth') }}</span>
        <input
          class="lws-input lws-input--num"
          type="number"
          min="0.5"
          max="40"
          step="0.5"
          :value="props.object.style.strokeWidth"
          @input="
            patchStyle({ strokeWidth: Number(($event.target as HTMLInputElement).value) || 1 })
          "
        />
      </label>
    </div>
  </section>
</template>
