<script setup lang="ts">
/**
 * 우측 인스펙터 패널 (기획 1.6).
 *
 * 선택 상태에 따라 유형별 패널로 분기한다. 검증 경고는 내보내기 게이트와 **같은 규칙**을 쓰므로
 * (`validateObject`), 여기서 통과한 문항이 내보내기에서 막히는 일이 없다 (PLAN 12).
 */
import { computed } from 'vue'
import { mergeBoxStyle, type BoxStylePatch } from '../../../core/model/boxStyle'
import { validateObject } from '../../../core/validation/rules'
import type { BoxStyle, TextObject, PDFCanvasObject } from '../../../core/model/types'
import BoxStylePanel from './BoxStylePanel.vue'
import DropboxPanel from './DropboxPanel.vue'
import EssayPanel from './EssayPanel.vue'
import PointsField from './PointsField.vue'
import ShapePanel from './ShapePanel.vue'
import ShortAnswerPanel from './ShortAnswerPanel.vue'
import TextPanel from './TextPanel.vue'

const props = defineProps<{
  /** 선택된 객체들. 0개면 빈 상태, 2개 이상이면 개수만 보여준다. */
  selected: PDFCanvasObject[]
  /** 자동 부여된 문항 번호. 수동 입력이 비어 있을 때 placeholder로 보여준다 (PLAN Q9). */
  autoNumber?: string | null
  t: (key: string, vars?: Record<string, unknown>) => string
  readOnly: boolean
}>()

const emit = defineEmits<{
  update: [objectId: string, patch: Partial<PDFCanvasObject>]
  remove: [objectId: string]
  /** 회전은 별도 커맨드다. Answer Box를 거르는 불변식이 커맨드에 있다. */
  rotate: [objectId: string, deg: number]
}>()

/** 다중 선택에는 공통 편집 UI를 두지 않는다. 유형이 섞이면 무엇을 바꿀지 정의가 필요하다. */
const single = computed(() => (props.selected.length === 1 ? props.selected[0]! : null))

const issues = computed(() => (single.value ? validateObject(single.value) : []))

const typeLabel = computed(() =>
  single.value ? props.t(`inspector.type.${single.value.type}`) : '',
)

const isAnswerBox = computed(
  () =>
    single.value?.type === 'answer.short' ||
    single.value?.type === 'answer.essay' ||
    single.value?.type === 'answer.dropbox',
)

/**
 * 색 편집이 가능한 유형 (PLAN 18.8).
 *
 * 도형은 자기 전용 패널에서 채움·테두리를 다루므로 여기서 제외한다. 두 곳에서 같은 값을 편집하면
 * 어느 쪽이 이기는지 알 수 없다.
 */
const styleable = computed(
  () =>
    single.value?.type === 'text' ||
    single.value?.type === 'answer.short' ||
    single.value?.type === 'answer.essay' ||
    single.value?.type === 'answer.dropbox',
)

/**
 * 현재 객체의 박스 스타일.
 *
 * 텍스트는 `style` 안에 글꼴 속성과 색이 섞여 있고, Answer Box는 `style` 이 색 전용이다.
 * 패널에는 색 부분만 넘긴다.
 */
const boxStyle = computed<BoxStyle | undefined>(() => {
  const obj = single.value
  if (!obj) return undefined
  if (obj.type === 'text') {
    const s = obj.style
    const out: BoxStyle = { color: s.color }
    if (s.fill !== undefined) out.fill = s.fill
    if (s.stroke !== undefined) out.stroke = s.stroke
    if (s.strokeWidth !== undefined) out.strokeWidth = s.strokeWidth
    return out
  }
  return 'style' in obj ? obj.style : undefined
})

/**
 * 색 패치를 적용한다.
 *
 * 텍스트는 글꼴 속성과 한 객체에 있으므로 `style` 전체를 다시 만들어야 한다. Answer Box는
 * `style` 이 색 전용이라 `mergeBoxStyle` 결과를 그대로 넣는다.
 */
function patchBoxStyle(p: BoxStylePatch) {
  const obj = single.value
  if (!obj || props.readOnly) return

  if (obj.type === 'text') {
    const merged = mergeBoxStyle(boxStyle.value, p) ?? {}
    const style: TextObject['style'] = {
      ...obj.style,
      // 텍스트의 글자색은 필수 필드다. 지정을 지우면 기본값으로 되돌린다.
      color: merged.color ?? '#1c1c1a',
    }
    if (merged.fill !== undefined) style.fill = merged.fill
    else delete style.fill
    if (merged.stroke !== undefined) style.stroke = merged.stroke
    else delete style.stroke
    if (merged.strokeWidth !== undefined) style.strokeWidth = merged.strokeWidth
    else delete style.strokeWidth
    patch({ style })
    return
  }

  const merged = mergeBoxStyle(boxStyle.value, p)
  patch({ style: merged } as Partial<PDFCanvasObject>)
}

/** 회전 가능한 유형만 회전 입력을 보여준다 (PLAN Q8). */
const rotatable = computed(
  () =>
    single.value?.type === 'text' ||
    single.value?.type === 'shape' ||
    single.value?.type === 'mask',
)

function patch(p: Partial<PDFCanvasObject>) {
  if (!single.value || props.readOnly) return
  emit('update', single.value.id, p)
}
</script>

<template>
  <aside class="pck-inspector">
    <header class="pck-panel-head">
      <span>{{ props.t('inspector.title') }}</span>
      <span v-if="typeLabel" class="pck-panel-count">{{ typeLabel }}</span>
    </header>

    <div class="pck-inspector-body">
      <p v-if="props.selected.length === 0" class="pck-panel-empty">
        {{ props.t('inspector.empty') }}
      </p>

      <p v-else-if="!single" class="pck-panel-empty">
        {{ props.t('inspector.multiple', { count: props.selected.length }) }}
      </p>

      <template v-else>
        <label v-if="isAnswerBox" class="pck-field">
          <span class="pck-field-label">{{ props.t('inspector.label') }}</span>
          <input
            class="pck-input"
            type="text"
            maxlength="12"
            :value="'label' in single ? (single.label ?? '') : ''"
            :placeholder="props.autoNumber ?? ''"
            @input="
              patch({
                label: ($event.target as HTMLInputElement).value,
              } as Partial<PDFCanvasObject>)
            "
          />
          <span class="pck-field-note">{{ props.t('inspector.labelNote') }}</span>
        </label>

        <PointsField
          v-if="isAnswerBox && 'points' in single"
          :model-value="single.points"
          :invalid="issues.includes('POINTS_INVALID')"
          :t="props.t"
          @update:model-value="patch({ points: $event } as Partial<PDFCanvasObject>)"
        />
        <p v-if="issues.includes('POINTS_INVALID')" class="pck-field-error" role="alert">
          {{ props.t('error.pointsRequired') }}
        </p>

        <ShortAnswerPanel
          v-if="single.type === 'answer.short'"
          :object="single"
          :issues="issues"
          :t="props.t"
          @update="patch"
        />
        <EssayPanel
          v-else-if="single.type === 'answer.essay'"
          :object="single"
          :t="props.t"
          @update="patch"
        />
        <DropboxPanel
          v-else-if="single.type === 'answer.dropbox'"
          :object="single"
          :issues="issues"
          :t="props.t"
          @update="patch"
        />
        <TextPanel
          v-else-if="single.type === 'text'"
          :object="single"
          :t="props.t"
          @update="patch"
        />
        <ShapePanel
          v-else-if="single.type === 'shape'"
          :object="single"
          :t="props.t"
          @update="patch"
        />

        <BoxStylePanel v-if="styleable" :style="boxStyle" :t="props.t" @update="patchBoxStyle" />

        <label v-if="rotatable" class="pck-field">
          <span class="pck-field-label">{{ props.t('inspector.rotation') }}</span>
          <input
            class="pck-input pck-input--num"
            type="number"
            min="0"
            max="359"
            step="1"
            :value="Math.round(single.rotation ?? 0)"
            @input="
              emit('rotate', single.id, Number(($event.target as HTMLInputElement).value) || 0)
            "
          />
        </label>

        <button
          type="button"
          class="pck-ghost-btn pck-inspector-delete"
          :disabled="props.readOnly"
          @click="emit('remove', single.id)"
        >
          {{ props.t('inspector.delete') }}
        </button>
      </template>
    </div>
  </aside>
</template>
