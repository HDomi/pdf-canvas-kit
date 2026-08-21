/**
 * 프레임워크 래퍼 검증 (PLAN 20.21).
 *
 * 여기서 확인하는 것은 **소비자가 facade 에 닿을 수 있는가**다. 래퍼가 화면을 그려도 `ref` 가
 * 비어 있으면 `toPublicDoc()` 이 조용히 `undefined` 를 돌려주고, 호스트의 [내보내기] 버튼이
 * 에러 없이 아무 일도 하지 않는다 — 2026.08.21 에 실제로 그렇게 새어 나갔다.
 *
 * ## JSX 를 쓰지 않는다
 *
 * 헤드리스 러너(`scripts/run-checks.mjs`)에 `@vitejs/plugin-react` 가 없다. 플러그인을 넣으면
 * 케이스 전체의 번들 경로가 바뀌므로, 여기서만 `createElement` 를 직접 부른다.
 *
 * ## effect flush 를 직접 다룬다
 *
 * `act` 가 이 번들 형태에서 잡히지 않는다. `flushSync` 는 렌더와 **layout effect** 까지만
 * 동기로 돌리고 `useEffect`(passive)는 다음 태스크로 미뤄지므로, 매크로태스크를 몇 번 양보해야
 * 마운트가 끝난 상태를 볼 수 있다. **이 순서 차이가 검증 대상 그 자체다** — 래퍼가 layout
 * effect 에서 `ref` 를 채우면 그 시점의 facade 는 아직 없다.
 */
import { createElement, createRef } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { PDFCanvasEditor, PDFCanvasViewer } from '../../src/react/index'
import type { EditorHandle, ViewerHandle } from '../../src/react/index'
import { asPublicDoc, createPDFCanvasDoc, createPage, A4_PT } from 'pdf-canvas-kit'
import type { CaseGroup } from './cases'

/** 마운트하고 passive effect 까지 끝난 뒤 검사한다. */
async function mounted<T>(
  render: (host: HTMLElement) => void,
  read: (host: HTMLElement) => T,
): Promise<T> {
  const host = document.createElement('div')
  document.body.append(host)
  flushSync(() => render(host))
  // passive effect 는 다음 태스크다. 여유를 두고 양보한다.
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0))
  const result = read(host)
  host.remove()
  return result
}

const oneDoc = () => createPDFCanvasDoc({ pages: [createPage({ size: A4_PT })] })

export const WRAPPER_GROUPS: CaseGroup[] = [
  {
    title: 'react 래퍼 — ref 로 facade 에 닿는다 ★',
    note: 'useImperativeHandle 은 layout effect 라 편집기를 만드는 useEffect 보다 먼저 돈다. 그걸로 ref 를 채우면 null 이 박히고, 소비자의 [내보내기] 가 에러 없이 아무 일도 하지 않는다.',
    cases: [
      {
        name: '★ 마운트 후 ref 가 채워진다',
        expected: true,
        actual: () =>
          mounted(
            (host) =>
              createRoot(host).render(
                createElement(PDFCanvasEditor, { ref: refEditor, initialDoc: oneDoc() }),
              ),
            () => refEditor.current !== null,
          ),
      },
      {
        name: '★ ref 로 facade 메서드를 부를 수 있다 (toPublicDoc 이 undefined 가 아니다)',
        expected: 1,
        actual: () =>
          mounted(
            (host) =>
              createRoot(host).render(
                createElement(PDFCanvasEditor, { ref: refEditor2, initialDoc: oneDoc() }),
              ),
            () => refEditor2.current?.toPublicDoc().pages.length ?? -1,
          ),
      },
      {
        name: '편집기가 실제로 그려진다',
        expected: true,
        actual: () =>
          mounted(
            (host) => createRoot(host).render(createElement(PDFCanvasEditor, {})),
            (host) => host.querySelector('.pck-editor') !== null,
          ),
      },
      {
        name: '★ 뷰어도 ref 로 facade 에 닿는다',
        expected: 2,
        actual: () =>
          mounted(
            (host) =>
              createRoot(host).render(
                createElement(PDFCanvasViewer, {
                  ref: refViewer,
                  doc: asPublicDoc(
                    createPDFCanvasDoc({
                      pages: [createPage({ size: A4_PT }), createPage({ size: A4_PT })],
                    }),
                  ),
                }),
              ),
            () => refViewer.current?.pageCount() ?? -1,
          ),
      },
      {
        name: '뷰어가 doc 없이도 그려진다 (빈 상태)',
        expected: true,
        actual: () =>
          mounted(
            (host) => createRoot(host).render(createElement(PDFCanvasViewer, { doc: null })),
            (host) => host.querySelector('.pck-viewer-empty') !== null,
          ),
      },
    ],
  },
]

/*
 * ref 를 케이스 밖에 두는 이유: `actual` 이 두 콜백으로 나뉘어 있고, 렌더 콜백이 만든 ref 를
 * 읽기 콜백이 봐야 한다. 케이스마다 별도 ref 를 써서 서로 간섭하지 않게 한다.
 */
const refEditor = createRef<EditorHandle>()
const refEditor2 = createRef<EditorHandle>()
const refViewer = createRef<ViewerHandle>()
