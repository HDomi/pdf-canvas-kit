<script setup lang="ts">
/**
 * 스테이지 위의 도구 띠 (와이어프레임 1.2, 기획 1.5).
 *
 * 도구의 실제 동작은 M4에서 붙는다. 여기서는 띠를 렌더하고 선택 상태를 보고해 레이아웃과
 * 비활성 상태를 먼저 확정한다. 복제·삭제는 모드가 아니라 선택 항목에 대한 즉시 동작이다.
 */
import type { ToolId } from '../../core/model/viewState'

const props = defineProps<{
  activeTool: ToolId
  /** 도구는 그릴 페이지가 있어야 쓸 수 있다. */
  enabled: boolean
  hasSelection: boolean
  t: (key: string) => string
}>()

const emit = defineEmits<{
  'update:activeTool': [tool: ToolId]
  duplicate: []
  remove: []
}>()

const TOOLS: { id: ToolId; key: string }[] = [
  { id: 'text', key: 'toolbar.text' },
  { id: 'answer.short', key: 'toolbar.short' },
  { id: 'answer.essay', key: 'toolbar.essay' },
  { id: 'answer.dropbox', key: 'toolbar.dropbox' },
  { id: 'shape', key: 'toolbar.shape' },
  { id: 'eraser', key: 'toolbar.eraser' },
]

/** 활성 도구를 다시 누르면 select로 돌아간다. 모드 토글이 그래야 자연스럽다. */
function pick(id: ToolId) {
  emit('update:activeTool', props.activeTool === id ? 'select' : id)
}
</script>

<template>
  <div class="lws-toolbar" role="toolbar">
    <button
      v-for="tool in TOOLS"
      :key="tool.id"
      type="button"
      class="lws-tool"
      :class="{ 'is-active': props.activeTool === tool.id }"
      :disabled="!props.enabled"
      :aria-pressed="props.activeTool === tool.id"
      @click="pick(tool.id)"
    >
      {{ props.t(tool.key) }}
    </button>

    <span class="lws-toolbar-divider" />

    <button
      type="button"
      class="lws-tool"
      :disabled="!props.hasSelection"
      @click="emit('duplicate')"
    >
      {{ props.t('toolbar.duplicate') }}
    </button>
    <button type="button" class="lws-tool" :disabled="!props.hasSelection" @click="emit('remove')">
      {{ props.t('toolbar.delete') }}
    </button>
  </div>
</template>
