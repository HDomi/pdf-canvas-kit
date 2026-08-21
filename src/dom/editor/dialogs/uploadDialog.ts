/**
 * 문서 업로드 팝업 (기획 2.3).
 *
 * 탭 두 개, From File 이 기본 선택이다. Google Drive 탭은 자리만 잡아 둔 것으로, 기획은
 * 요구하지만 연동은 범위 밖이다 (PLAN 19). 실패하는 버튼보다 빈 탭이 정직하다.
 *
 * 한 번에 파일 하나. 기획의 "(1 limit, 500MB)" 와 일치한다.
 *
 * 구 `src/vue/editor/dialogs/UploadDialog.vue` 의 이식.
 */
import { el, when } from '../../h'
import { text } from '../../../core/config/strings'
import { signal, type ReadSignal } from '../../reactive'
import { LIMITS } from '../../../core/config/defaults'
import type { ImportProgress } from '../../../core/engine'
import { icon } from '../icon'

export interface UploadDialogProps {
  /** 변환이 진행 중인 동안 non-null. */
  progress: ReadSignal<ImportProgress | null>
  error: ReadSignal<string | null>
  onClose: () => void
  onPick: (file: File) => void
  onCancel: () => void
}

export function uploadDialog(props: UploadDialogProps): HTMLElement {
  const tab = signal<'file' | 'drive'>('file')
  const busy = () => props.progress.value !== null

  const accept = LIMITS.formats.map((f) => `.${f}`).join(',')

  const fileInput = el('input', {
    attr: { type: 'file', hidden: true, accept },
    on: {
      change: (e) => {
        const input = e.target as HTMLInputElement
        const file = input.files?.[0]
        // 같은 파일을 두 번 골라도 change 이벤트가 발생하도록 초기화한다.
        input.value = ''
        if (file) props.onPick(file)
      },
    },
  })

  const tabButton = (id: 'file' | 'drive', labelKey: string) =>
    el(
      'button',
      {
        class: { 'is-active': () => tab.value === id },
        attr: { type: 'button', role: 'tab', 'aria-selected': () => tab.value === id },
        on: { click: () => (tab.value = id) },
      },
      [text(labelKey)],
    )

  const scrim = el(
    'div',
    {
      class: 'pck-modal-scrim',
      on: {
        // 변환 중에는 바깥 클릭으로 닫지 않는다. 진행 중인 작업이 조용히 사라지면 안 된다.
        click: (e) => {
          if (e.target === scrim && !busy()) props.onClose()
        },
      },
    },
    [
      el(
        'section',
        {
          class: 'pck-modal',
          attr: { role: 'dialog', 'aria-modal': 'true', 'aria-label': text('upload.title') },
        },
        [
          el('header', { class: 'pck-modal-head' }, [
            el('h2', {}, [text('upload.title')]),
            el(
              'button',
              {
                class: 'pck-icon-btn',
                attr: { type: 'button', 'aria-label': 'close' },
                prop: { disabled: busy },
                on: { click: props.onClose },
              },
              [icon('close')],
            ),
          ]),

          el('nav', { class: 'pck-tabs', attr: { role: 'tablist' } }, [
            tabButton('file', 'upload.tabFile'),
            tabButton('drive', 'upload.tabDrive'),
          ]),

          when(
            () => tab.value === 'file',
            () =>
              el('div', { class: 'pck-modal-body' }, [
                // 변환 중 — 진행률과 취소
                when(busy, () => [
                  el('p', { class: 'pck-upload-hint' }, [
                    () => `${props.progress.value?.fileName ?? ''} — ${text('upload.converting')}`,
                    when(
                      () => props.progress.value?.total !== undefined,
                      () =>
                        el('span', { class: 'mono' }, [
                          () => {
                            const p = props.progress.value
                            return p ? ` ${p.page ?? 0} / ${p.total ?? 0}` : ''
                          },
                        ]),
                    ),
                  ]),
                  el('div', { class: 'pck-progress' }, [
                    el('i', {
                      style: () => ({
                        width: `${(props.progress.value?.ratio ?? 0) * 100}%`,
                      }),
                    }),
                  ]),
                  el(
                    'button',
                    {
                      class: 'pck-ghost-btn',
                      attr: { type: 'button' },
                      on: { click: props.onCancel },
                    },
                    [text('confirm.cancel')],
                  ),
                ]),

                // 대기 중 — 파일 선택
                when(
                  () => !busy(),
                  () => [
                    el('p', { class: 'pck-upload-hint' }, [text('upload.hint')]),
                    el('p', { class: 'pck-upload-sub' }, [text('upload.subHint')]),
                    el(
                      'button',
                      {
                        class: 'pck-primary-btn',
                        attr: { type: 'button' },
                        on: { click: () => fileInput.click() },
                      },
                      [text('upload.action')],
                    ),
                    fileInput,
                    el('p', { class: 'pck-upload-limit' }, [text('upload.limit')]),
                    el('p', { class: 'pck-upload-formats' }, [text('upload.formats')]),
                  ],
                ),

                when(
                  () => props.error.value !== null,
                  () =>
                    el('p', { class: 'pck-upload-error', attr: { role: 'alert' } }, [
                      () => props.error.value ?? '',
                    ]),
                ),
              ]),
          ),

          when(
            () => tab.value === 'drive',
            () =>
              el('div', { class: 'pck-modal-body' }, [
                el('p', { class: 'pck-upload-sub' }, [text('upload.driveUnavailable')]),
              ]),
          ),
        ],
      ),
    ],
  )
  return scrim
}
