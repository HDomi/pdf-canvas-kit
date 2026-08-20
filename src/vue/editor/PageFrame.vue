<script setup lang="ts">
/**
 * 페이지 하나. 레이아웃 박스, 스케일된 페이지, 오버레이용 슬롯으로 구성된다.
 *
 * ## 두 겹 구조 (PLAN 5.3)
 *
 * `transform` 은 레이아웃 크기에 영향을 주지 않는다. 그래서 스케일된 엘리먼트 하나만 두면
 * 스크롤 컨테이너가 배율 1 기준 크기로 남아 — 축소 시 여백이, 확대 시 잘림이 생긴다.
 * 그래서 바깥 프레임이 `size * scale` 을 실제 크기로 갖고, 안쪽 엘리먼트가 pt 크기와 transform을
 * 갖는다.
 *
 * 안쪽 엘리먼트 덕분에 객체 뷰는 계산이 필요 없다. `left: 120px` 에 놓인 자식은 배율과 무관하게
 * 120pt 지점에 놓인다.
 */
import { computed, ref } from 'vue'
import { frameSize } from '../../core/geometry/units'
import type { WorksheetPage } from '../../core/model/types'
import PageBackgroundView from './PageBackgroundView.vue'

const props = defineProps<{
  page: WorksheetPage
  scale: number
}>()

/**
 * 프레임 엘리먼트를 노출한다. 좌표 변환이 이 요소의 `getBoundingClientRect()` 를 기준으로
 * 하기 때문이다 (PLAN 5.4).
 */
const frameEl = ref<HTMLElement | null>(null)
defineExpose({ frameEl })

const frame = computed(() => frameSize(props.page.size, props.scale))

const frameStyle = computed(() => ({
  width: `${frame.value.width}px`,
  height: `${frame.value.height}px`,
}))

const pageStyle = computed(() => ({
  // pt 값을 px로 그대로 쓴다. 스케일은 아래 transform이 담당한다.
  width: `${props.page.size.width}px`,
  height: `${props.page.size.height}px`,
  transform: `scale(${props.scale})`,
  transformOrigin: 'top left',
}))
</script>

<template>
  <div ref="frameEl" class="lws-page-frame" :data-page-id="page.id" :style="frameStyle">
    <div class="lws-page" :style="pageStyle">
      <PageBackgroundView :page="page" />
      <!-- 객체들. rect 값을 px로 그대로 읽는다 (PLAN 5.3). -->
      <slot name="objects" />
    </div>

    <!--
      오버레이는 스케일된 엘리먼트 밖에 둔다. 그래야 핸들이 어떤 배율에서도 일정한 픽셀 크기를
      유지한다 (PLAN D5). 좌표는 rectToFrame() 에서 얻는다.
    -->
    <slot name="overlay" :frame="frame" />
  </div>
</template>
