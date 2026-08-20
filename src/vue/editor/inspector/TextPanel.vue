<script setup lang="ts">
/**
 * 텍스트 객체 인스펙터.
 *
 * ## 편집 가능한 속성의 범위 (PLAN Q7)
 *
 * 기획 7.1은 세부 편집을 [General] 문서에 위임하지만 그 문서가 아직 없다. 그래서 "최소 세트"로
 * 시작하는데, 그게 무엇을 뜻하는지 흐릿하면 다음 사람이 판단할 수 없으므로 정확히 적는다.
 *
 * **지금 편집할 수 있는 것** — 내용 · 글자 크기 · 정렬(좌/중/우) · 굵게.
 * 색(글자·배경·테두리)은 공용 `BoxStylePanel` 이 담당한다 (PLAN 18.8).
 *
 * **모델에는 있으나 UI가 없는 것** — `italic` · `underline` · `fontFamily` · `lineHeight`.
 * 타입과 렌더는 이미 이 값들을 지원하므로 [General] 문서가 오면 입력만 붙이면 된다.
 *
 * **모델에도 없는 것** — 자간, 문단 간격, 리스트, 부분 서식(한 객체 안에서 일부 글자만 굵게).
 * 부분 서식은 `text: string` 을 리치 텍스트 구조로 바꿔야 하므로 모델 변경이 따른다.
 */
import type { TextObject } from '../../../core/model/types'

const props = defineProps<{
  object: TextObject
  t: (key: string) => string
}>()

const emit = defineEmits<{ update: [patch: Partial<TextObject>] }>()

/** 스타일은 중첩 객체라 부분 갱신 시 나머지 필드를 유지해야 한다. */
function patchStyle(patch: Partial<TextObject['style']>) {
  emit('update', { style: { ...props.object.style, ...patch } })
}

const ALIGNS: TextObject['style']['align'][] = ['left', 'center', 'right']
</script>

<template>
  <section class="lws-panel-section">
    <h3 class="lws-field-label">{{ props.t('inspector.text') }}</h3>
    <textarea
      class="lws-input lws-textarea"
      rows="3"
      :value="props.object.text"
      @input="emit('update', { text: ($event.target as HTMLTextAreaElement).value })"
    />

    <!-- 색은 공용 BoxStylePanel 이 담당한다. 두 곳에서 편집하면 어느 쪽이 이기는지 알 수 없다. -->
    <label class="lws-field">
      <span class="lws-field-label">{{ props.t('inspector.fontSize') }}</span>
      <input
        class="lws-input lws-input--num"
        type="number"
        min="4"
        max="200"
        step="1"
        :value="props.object.style.fontSize"
        @input="patchStyle({ fontSize: Number(($event.target as HTMLInputElement).value) || 12 })"
      />
    </label>

    <div class="lws-field">
      <span class="lws-field-label">{{ props.t('inspector.align') }}</span>
      <div class="lws-segmented">
        <button
          v-for="a in ALIGNS"
          :key="a"
          type="button"
          :class="{ 'is-active': props.object.style.align === a }"
          @click="patchStyle({ align: a })"
        >
          {{ a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥' }}
        </button>
      </div>
    </div>

    <label class="lws-field lws-field--inline">
      <input
        class="lws-check"
        type="checkbox"
        :checked="props.object.style.bold"
        @change="patchStyle({ bold: ($event.target as HTMLInputElement).checked })"
      />
      <span>{{ props.t('inspector.bold') }}</span>
    </label>
  </section>
</template>
