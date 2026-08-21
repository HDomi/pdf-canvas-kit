/**
 * 다른 환경 예제로 가는 링크.
 *
 * dev 에서는 별도 포트(:3101 · :3102)로 뜨고, Pages 에서는 한 사이트의 형제 디렉토리
 * (`/pdf-canvas-kit/react/` · `/vue/`)에 놓인다. `BASE_URL` 로 어느 쪽인지 판단한다 —
 * dev 의 base 는 `/` 다.
 */
export function siblingExampleUrl(target: 'react' | 'vue'): string {
  const base = import.meta.env.BASE_URL
  if (base === '/') return target === 'react' ? 'http://localhost:3101/' : 'http://localhost:3102/'
  // Pages: /pdf-canvas-kit/react/ → /pdf-canvas-kit/vue/
  return base.replace(/\/(react|vue)\/$/, `/${target}/`)
}

/** 데모 랜딩으로. Pages 에서는 한 단계 위다. */
export function demoHomeUrl(): string {
  const base = import.meta.env.BASE_URL
  if (base === '/') return 'http://localhost:3100/'
  return base.replace(/\/(react|vue)\/$/, '/')
}
