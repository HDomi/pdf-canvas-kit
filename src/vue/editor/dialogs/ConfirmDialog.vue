<script setup lang="ts">
/**
 * 확인 모달 (기획 9.3).
 *
 * 되돌릴 수 있는 동작에는 쓰지 않는다 — undo가 있는 편집기에서 모든 삭제를 확인받으면 방해만 된다.
 * 페이지 삭제처럼 **여러 객체가 함께 사라지는** 경우에만 쓴다.
 */
const props = defineProps<{
  message: string
  confirmLabel: string
  cancelLabel: string
  /** 위험한 동작이면 확인 버튼을 경고색으로 칠한다. */
  danger?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <div class="lws-modal-scrim" @click.self="emit('cancel')">
    <section class="lws-modal lws-modal--confirm" role="alertdialog" aria-modal="true">
      <p class="lws-confirm-message">{{ props.message }}</p>
      <div class="lws-confirm-actions">
        <button type="button" class="lws-ghost-btn" @click="emit('cancel')">
          {{ props.cancelLabel }}
        </button>
        <button
          type="button"
          class="lws-primary-btn"
          :class="{ 'is-danger': props.danger }"
          @click="emit('confirm')"
        >
          {{ props.confirmLabel }}
        </button>
      </div>
    </section>
  </div>
</template>
