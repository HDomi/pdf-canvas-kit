/**
 * Answer Box 3종 인스펙터 패널 (기획 6.4).
 *
 * 세 패널을 한 파일에 둔 이유: 공통 구조(정답/보기 목록 + 검증 경고 + 안내)를 공유하고,
 * 셋 중 하나만 고칠 일이 거의 없다. Vue 판은 파일이 셋이었고 목록 편집 로직이 조금씩 달랐다.
 *
 * 구 `ShortAnswerPanel.vue` · `EssayPanel.vue` · `DropboxPanel.vue` 의 이식.
 */
import { el, list, when } from '../../h'
import { computed, type ReadSignal } from '../../reactive'
import { LIMITS } from '../../../core/config/defaults'
import { text } from '../../../core/config/strings'
import { createId } from '../../../core/util/id'
import type {
  DropboxAnswerBox,
  EssayAnswerBox,
  PDFCanvasObject,
  ShortAnswerBox,
} from '../../../core/model/types'
import {
  checkbox,
  dashedButton,
  fieldError,
  panelSection,
  rowButton,
  textArea,
  textInput,
} from './fields'

type Patch = (p: Partial<PDFCanvasObject>) => void

/* ------------------------------------------------------------------ 단답형 -- */

/**
 * 단답형. 정답 하나가 필수이고 동의어를 위해 허용 답안을 최대 5개까지 추가한다.
 * 학생 답이 그중 하나와 일치하면 정답이다.
 */
export function shortAnswerPanel(
  object: ReadSignal<ShortAnswerBox>,
  issues: ReadSignal<readonly string[]>,
  patch: Patch,
): HTMLElement {
  /** 항상 최소 한 칸은 보여준다. 빈 배열이면 입력할 자리가 없다. */
  const answers = computed(() => (object.value.answers.length > 0 ? object.value.answers : ['']))
  const canAdd = () => answers.value.length < LIMITS.shortAnswers.max
  const missing = () => issues.value.includes('SHORT_NO_ANSWER')

  const setAnswer = (index: number, value: string) => {
    const next = [...answers.value]
    next[index] = value.slice(0, LIMITS.choiceChars)
    patch({ answers: next })
  }

  const removeAnswer = (index: number) => {
    // 마지막 한 칸은 지우지 않고 비운다. 입력할 자리가 사라지면 정답을 다시 넣을 수 없다.
    const next = answers.value.filter((_, i) => i !== index)
    patch({ answers: next.length > 0 ? next : [''] })
  }

  return panelSection(text('inspector.answer'), [
    /*
     * 인덱스를 키로 쓴다. 답안은 id 가 없는 문자열 배열이고, 중간을 지우면 뒤가 앞으로
     * 당겨지는 것이 맞는 동작이다.
     */
    list(
      () => answers.value,
      (_, i) => i,
      (answer, index) =>
        el('div', { class: 'pck-row' }, [
          textInput({
            value: () => answer.value,
            maxlength: LIMITS.choiceChars,
            placeholder: () => text('inspector.answerPlaceholder'),
            invalid: () => missing() && index.value === 0,
            onInput: (v) => setAnswer(index.value, v),
          }),
          when(
            () => answers.value.length > 1,
            () => rowButton({ ariaLabel: 'remove', onClick: () => removeAnswer(index.value) }),
          ),
        ]),
    ),

    dashedButton({
      label: text('inspector.addAnswer'),
      small: true,
      disabled: () => !canAdd(),
      onClick: () => {
        if (canAdd()) patch({ answers: [...answers.value, ''] })
      },
    }),

    fieldError(missing, text('error.answerRequired')),
    el('p', { class: 'pck-field-note' }, [text('inspector.gradingNote')]),
  ])
}

/* ------------------------------------------------------------------ 서술형 -- */

/**
 * 서술형. 자동 채점이 불가하므로 정답 입력이 없다.
 * 채점 가이드는 교사용이며 학생 문서에서 제거된다 (PLAN D14).
 */
export function essayPanel(object: ReadSignal<EssayAnswerBox>, patch: Patch): HTMLElement {
  return panelSection(text('inspector.rubric'), [
    textArea({
      value: () => object.value.rubric ?? '',
      rows: 5,
      placeholder: text('inspector.rubricPlaceholder'),
      onInput: (v) => patch({ rubric: v }),
    }),
    el('p', { class: 'pck-field-note' }, [text('inspector.essayNote')]),
  ])
}

/* ----------------------------------------------------------------- 드롭박스 -- */

/**
 * 드롭박스. 보기 2~5개, 정답 1개 이상.
 * 복수 정답이면 학생이 모두 골라야 정답이다(all-or-nothing).
 */
export function dropboxPanel(
  object: ReadSignal<DropboxAnswerBox>,
  issues: ReadSignal<readonly string[]>,
  patch: Patch,
): HTMLElement {
  const choices = () => object.value.choices
  const canAdd = () => choices().length < LIMITS.dropboxChoices.max
  const canRemove = () => choices().length > LIMITS.dropboxChoices.min

  const setLabel = (id: string, label: string) =>
    patch({
      choices: choices().map((c) =>
        c.id === id ? { ...c, label: label.slice(0, LIMITS.choiceChars) } : c,
      ),
    })

  const removeChoice = (id: string) => {
    if (!canRemove()) return
    patch({
      choices: choices().filter((c) => c.id !== id),
      // 정답 목록에서도 함께 빼야 유령 정답이 남지 않는다.
      correctChoiceIds: object.value.correctChoiceIds.filter((c) => c !== id),
    })
  }

  const toggleCorrect = (id: string) => {
    const set = new Set(object.value.correctChoiceIds)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    patch({ correctChoiceIds: [...set] })
  }

  const fewChoices = () => issues.value.includes('DROPBOX_FEW_CHOICES')
  const noCorrect = () => issues.value.includes('DROPBOX_NO_CORRECT')
  const duplicate = () => issues.value.includes('DROPBOX_DUPLICATE_CHOICE')

  return panelSection(text('inspector.choices'), [
    list(
      choices,
      (c) => c.id,
      (choice, index) =>
        el('div', { class: 'pck-row' }, [
          checkbox({
            checked: () => object.value.correctChoiceIds.includes(choice.value.id),
            ariaLabel: `correct ${index.value + 1}`,
            onChange: () => toggleCorrect(choice.value.id),
          }),
          textInput({
            value: () => choice.value.label,
            maxlength: LIMITS.choiceChars,
            placeholder: () => text('inspector.choicePlaceholder'),
            onInput: (v) => setLabel(choice.value.id, v),
          }),
          rowButton({
            ariaLabel: 'remove',
            disabled: () => !canRemove(),
            onClick: () => removeChoice(choice.value.id),
          }),
        ]),
    ),

    dashedButton({
      label: text('inspector.addChoice'),
      small: true,
      disabled: () => !canAdd(),
      onClick: () => {
        if (canAdd()) {
          patch({
            choices: [...choices(), { id: createId(), label: '' }],
          })
        }
      },
    }),

    fieldError(() => fewChoices() || noCorrect(), text('error.dropboxIncomplete')),
    fieldError(duplicate, text('error.duplicateChoice')),
    el('p', { class: 'pck-field-note' }, [text('inspector.correctHint')]),
  ])
}
