<script setup lang="ts">
/**
 * 코드 힌트 — 감싼 UI 가 **어떻게 구현됐는지** 보여준다.
 *
 * React 판(`examples/react/src/components/CodeHint.tsx`)과 같은 계약이다. 화면과 코드가
 * 떨어져 있으면 독자가 둘을 스스로 연결해야 하는데, 붙여 놓으면 그 일이 사라진다.
 *
 * hover 가 아니라 클릭으로 여는 이유: hover 면 편집기를 조작하는 동안 팝오버가 계속
 * 튀어나와 방해한다.
 *
 * ⚠️ 패키지가 그리는 DOM(툴바·인스펙터·캔버스)에는 붙일 수 없다. 감쌀 수 있는 것은 호스트가
 * 만든 부분 — devbar, 모달, 슬롯 컴포넌트다.
 */
import { onBeforeUnmount, ref, watch } from 'vue'

/*
 * `withDefaults` 를 쓰지 않는다.
 *
 * `exactOptionalPropertyTypes` 아래서는 optional prop 에 `undefined` 기본값을 대입할 수 없고,
 * `note` 는 없으면 안 그리면 되므로 기본값이 필요하지 않다. `corner` 만 템플릿에서 대체한다.
 */
defineProps<{
  /** 배지에 뜨는 이름 */
  label: string
  /** 한 줄 설명. 코드보다 먼저 읽힌다 */
  note?: string
  /** 보여줄 코드. 앞쪽 공백은 자동으로 정리된다 */
  code: string
  /** 배지가 붙을 모서리. 기본은 왼쪽 위 */
  corner?: 'tl' | 'tr' | 'bl' | 'br'
}>()

const open = ref(false)
const boxRef = ref<HTMLElement | null>(null)

/**
 * 템플릿 리터럴의 들여쓰기를 벗긴다.
 *
 * 가장 얕은 줄을 기준으로 깎는다 — 빈 줄은 기준에서 뺀다(들여쓰기가 0 이라 전부 무효가 된다).
 */
function dedent(src: string): string {
  const lines = src.replace(/^\n/, '').replace(/\s+$/, '').split('\n')
  const indents = lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)![0].length)
  const cut = indents.length ? Math.min(...indents) : 0
  return lines.map((l) => l.slice(cut)).join('\n')
}

function onDown(e: PointerEvent) {
  if (!boxRef.value?.contains(e.target as Node)) open.value = false
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}

watch(open, (isOpen) => {
  if (isOpen) {
    // capture 로 받는다 — 편집기가 pointerdown 에서 preventDefault 를 부르기 때문이다
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
  } else {
    document.removeEventListener('pointerdown', onDown, true)
    document.removeEventListener('keydown', onKey)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDown, true)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div ref="boxRef" class="hint-wrap">
    <slot />
    <button
      type="button"
      :class="['hint-badge', `hint-${corner ?? 'tl'}`, { 'is-open': open }]"
      :aria-expanded="open"
      :title="`${label} — 코드 보기`"
      @click="open = !open"
    >
      &lt;/&gt;
    </button>
    <div v-if="open" class="hint-pop" role="dialog" :aria-label="`${label} 코드`">
      <div class="hint-pop-head">
        <strong>{{ label }}</strong>
        <button type="button" class="hint-close" @click="open = false">닫기</button>
      </div>
      <p v-if="note" class="hint-note">{{ note }}</p>
      <pre class="hint-code"><code>{{ dedent(code) }}</code></pre>
    </div>
  </div>
</template>
