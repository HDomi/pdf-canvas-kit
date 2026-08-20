<script setup lang="ts">
/**
 * 상단 바. 뒤로 가기, 인라인 타이틀, 저장 배지, undo/redo, 수동 저장 (기획 1.3).
 *
 * ⚠️ **[내보내기] 버튼을 임시로 제거했다.** 과제 생성 API가 아직 없어 누르면 빈 팝업만 뜨고,
 * 그게 프로토타입 확인을 방해한다. 대신 프로토타입 저장 버튼을 둔다.
 *
 * 서버가 준비되면 `manual-save` 를 `export` 로 되돌린다. `ExportDialog` 와 검증 게이트
 * (`guardExport`)는 그대로 남아 있으므로 버튼과 이벤트만 바꾸면 된다 (PLAN 18.5).
 */
import SaveBadge from './SaveBadge.vue'
import TitleInput from './TitleInput.vue'
import type { SaveState } from '../../core/model/viewState'

const props = defineProps<{
  title: string
  saveState: SaveState
  canUndo: boolean
  canRedo: boolean
  /** 빈 워크시트에서는 저장할 것이 없다. */
  canSave: boolean
  /** 저장 진행 중이면 버튼을 잠근다. */
  saving: boolean
  t: (key: string) => string
}>()

const emit = defineEmits<{
  back: []
  'update:title': [value: string]
  undo: []
  redo: []
  manualSave: []
}>()
</script>

<template>
  <header class="pck-topbar">
    <button
      type="button"
      class="pck-icon-btn"
      :title="props.t('topbar.back')"
      :aria-label="props.t('topbar.back')"
      @click="emit('back')"
    >
      ‹
    </button>

    <TitleInput
      :model-value="props.title"
      :placeholder="props.t('topbar.titlePlaceholder')"
      @update:model-value="emit('update:title', $event)"
    />

    <SaveBadge :state="props.saveState" :t="props.t" />

    <div class="pck-topbar-spacer" />

    <button
      type="button"
      class="pck-icon-btn"
      :disabled="!props.canUndo"
      :title="props.t('topbar.undo')"
      :aria-label="props.t('topbar.undo')"
      @click="emit('undo')"
    >
      ↶
    </button>
    <button
      type="button"
      class="pck-icon-btn"
      :disabled="!props.canRedo"
      :title="props.t('topbar.redo')"
      :aria-label="props.t('topbar.redo')"
      @click="emit('redo')"
    >
      ↷
    </button>

    <span class="pck-topbar-divider" />

    <!-- 프로토타입 저장 버튼. 실서버가 붙으면 [내보내기] 로 되돌린다 (PLAN 18.5). -->
    <button
      type="button"
      class="pck-primary-btn"
      :disabled="!props.canSave || props.saving"
      :title="props.t('topbar.saveHint')"
      @click="emit('manualSave')"
    >
      {{ props.saving ? props.t('topbar.saving') : props.t('topbar.save') }}
    </button>
  </header>
</template>
