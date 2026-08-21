/**
 * 페이지 배경. 변환된 문서 이미지이거나 빈 종이다.
 *
 * 이미지는 픽셀 크기가 아니라 퍼센트로 페이지 박스를 채운다. 그래서 래스터 해상도가 좌표와
 * 무관해진다 — `targetPx` 를 바꿔 다시 래스터화해도 아무것도 움직이지 않는다.
 *
 * 구 `src/vue/editor/PageBackgroundView.vue` 의 이식.
 */
import { el, when, type Child } from '../h'
import type { ReadSignal } from '../reactive'
import type { PDFCanvasPage } from '../../core/model/types'

export function pageBackground(page: ReadSignal<PDFCanvasPage>): Child[] {
  const image = () => {
    const bg = page.value.background
    return bg.kind === 'image' ? bg : null
  }

  /*
   * 이미지와 빈 종이를 `when()` 두 개로 나눈다. 하나의 엘리먼트에 `src` 를 조건부로 붙이면
   * 빈 배경일 때 `<img src="">` 가 남아 브라우저가 현재 페이지를 다시 요청한다.
   */
  return [
    when(
      () => image() !== null,
      () =>
        el('img', {
          class: 'pck-page-bg',
          attr: {
            src: () => image()?.url ?? '',
            alt: '',
            draggable: 'false',
            decoding: 'async',
          },
        }),
    ),
    when(
      () => image() === null,
      () => el('div', { class: 'pck-page-bg pck-page-bg--blank' }),
    ),
  ]
}
