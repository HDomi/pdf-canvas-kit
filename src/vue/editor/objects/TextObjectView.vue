<script setup lang="ts">
/**
 * 텍스트 객체. 더블클릭하면 인라인 편집 상태가 된다 (기획 7.1).
 *
 * `contenteditable` 을 쓴다. `<textarea>` 를 겹치면 폰트·행간·정렬을 픽셀 단위로 맞춰야 하고,
 * 배율이 걸린 상태에서 캐럿 위치가 어긋난다. `contenteditable` 은 표시 요소가 그대로 편집 요소가
 * 되므로 그 문제가 없다.
 *
 * 한글 IME 주의: 조합 중(`compositionstart`~`end`)에는 값을 되돌려 쓰지 않는다. 조합 중간에
 * DOM textContent를 덮으면 조합이 끊겨 "한글이 한 글자씩 사라지는" 증상이 난다.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { boxStyleToCss } from '../../../core/model/boxStyle'
import type { TextObject } from '../../../core/model/types'

const props = defineProps<{
  object: TextObject
  editing: boolean
}>()

const emit = defineEmits<{ edit: [value: string] }>()

const el = ref<HTMLElement | null>(null)
const composing = ref(false)

const style = computed(() => {
  const s = props.object.style
  return {
    fontFamily: s.fontFamily,
    fontSize: `${s.fontSize}px`,
    fontWeight: s.bold ? '700' : '400',
    fontStyle: s.italic ? 'italic' : 'normal',
    textDecoration: s.underline ? 'underline' : 'none',
    textAlign: s.align,
    lineHeight: String(s.lineHeight),
    /*
     * 배경·테두리·글자색은 공용 해석기를 거친다. 텍스트의 기본 배경은 투명이다 —
     * 텍스트는 문서 배경 위에 얹히는 게 자연스럽고, 색을 채우면 아래 내용을 가린다.
     */
    ...boxStyleToCss(
      {
        // exactOptionalPropertyTypes: 미지정 필드는 키 자체를 빼야 한다.
        ...(s.fill !== undefined ? { fill: s.fill } : {}),
        ...(s.stroke !== undefined ? { stroke: s.stroke } : {}),
        ...(s.strokeWidth !== undefined ? { strokeWidth: s.strokeWidth } : {}),
        color: s.color,
      },
      { defaultFill: null },
    ),
  }
})

/** 편집 시작 시 포커스를 주고 캐럿을 끝으로 보낸다. */
watch(
  () => props.editing,
  async (editing) => {
    if (!editing) return
    await nextTick()
    const node = el.value
    if (!node) return
    node.focus()
    const range = document.createRange()
    range.selectNodeContents(node)
    range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  },
)

/**
 * 문서 값이 바뀌면 DOM을 맞춘다.
 *
 * 편집 중과 조합 중에는 건너뛴다. 사용자가 입력하는 동안 DOM을 덮으면 캐럿이 앞으로 튀고,
 * IME 조합이 끊긴다.
 */
watch(
  () => props.object.text,
  (text) => {
    if (props.editing || composing.value) return
    if (el.value && el.value.textContent !== text) el.value.textContent = text
  },
  { immediate: true },
)

function onInput() {
  // 조합 중에는 중간 상태를 문서에 커밋하지 않는다. compositionend 에서 한 번에 보낸다.
  if (composing.value) return
  emit('edit', el.value?.textContent ?? '')
}

function onCompositionEnd() {
  composing.value = false
  emit('edit', el.value?.textContent ?? '')
}
</script>

<template>
  <div
    ref="el"
    class="pck-obj-text"
    :class="{ 'is-editing': props.editing }"
    :style="style"
    :contenteditable="props.editing"
    :spellcheck="false"
    @input="onInput"
    @compositionstart="composing = true"
    @compositionend="onCompositionEnd"
  />
</template>
