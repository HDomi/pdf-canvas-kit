<script setup lang="ts">
/**
 * 호스트가 만든 확인 모달 (커스터마이징은 토큰 → @layer → 다이얼로그 위임 3단계다).
 *
 * **편집기는 이 컴포넌트의 존재를 모른다.** `onRequestConfirm` 으로 요청만 받고, 결과를
 * `handle.confirmPending()` · `cancelPending()` 으로 돌려준다.
 *
 * 패키지 클래스(`pck-`)를 하나도 쓰지 않는다 — 우리 디자인 시스템이 그대로 나오는 모습이
 * 이 예제의 요점이다.
 *
 * ⚠️ 둘 중 하나를 **반드시** 불러야 한다. 부르지 않으면 편집기는 그 동작을 대기 상태로
 * 유지한다 — 조용히 취소하지 않는다.
 */
import type { ConfirmRequest } from 'pdf-canvas-kit'

defineProps<{ request: ConfirmRequest }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
</script>

<template>
  <div class="host-scrim" role="presentation" @click="emit('cancel')">
    <!-- 시트 클릭이 배경으로 새어 나가 모달을 닫으면 안 된다 -->
    <div class="host-sheet" role="alertdialog" aria-modal="true" @click.stop>
      <h2 class="host-sheet-title">확인</h2>
      <p class="host-sheet-body">{{ request.message }}</p>
      <div class="host-sheet-actions">
        <button type="button" class="host-btn" @click="emit('cancel')">취소</button>
        <button
          type="button"
          :class="request.danger ? 'host-btn host-btn--danger' : 'host-btn host-btn--primary'"
          @click="emit('confirm')"
        >
          {{ request.danger ? '삭제' : '확인' }}
        </button>
      </div>
    </div>
  </div>
</template>
