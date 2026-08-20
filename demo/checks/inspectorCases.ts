/**
 * 인스펙터 검증 케이스 (PLAN 20.12, R7).
 *
 * 인스펙터는 편집기에서 **문서를 실제로 바꾸는** 유일한 폼이다. 여기가 틀리면 교사가 입력한
 * 정답·배점·색이 문서에 안 들어가고, 증상이 "저장했는데 없어졌다" 로 나타난다.
 *
 * 확인하는 것 셋:
 *
 * 1. **유형별 분기** — 유형이 바뀌면 패널도 바뀌는가 (`when` 조건을 유형으로 둔 이유)
 * 2. **패치 내용** — 입력이 올바른 커맨드 패치를 만드는가
 * 3. **`BoxStyle` 의 3상태** — `undefined`(미지정) · `null`(투명) · 색 문자열의 구분이 유지되는가
 *
 * ⚠️ 색 선택기(`<input type=color>`)의 네이티브 UI 는 검증되지 않는다. `value` 프로퍼티와
 * `input` 이벤트만 본다.
 */
import { inspector } from '../../src/dom/editor/inspector/inspector'
import { scope, signal } from '../../src/dom/reactive'
import { createId, LIMITS } from 'pdf-canvas-kit'
import type {
  BoxStyle,
  DropboxAnswerBox,
  PDFCanvasObject,
  ShapeObject,
  ShortAnswerBox,
  TextObject,
} from 'pdf-canvas-kit'
import type { CaseGroup } from './cases'

const RECT = { x: 0, y: 0, w: 160, h: 40 }

function shortObj(over: Partial<ShortAnswerBox> = {}): ShortAnswerBox {
  return {
    id: createId(),
    type: 'answer.short',
    rect: RECT,
    points: 5,
    answers: [],
    style: {},
    ...over,
  }
}

function dropboxObj(over: Partial<DropboxAnswerBox> = {}): DropboxAnswerBox {
  return {
    id: createId(),
    type: 'answer.dropbox',
    rect: RECT,
    points: 3,
    choices: [
      { id: 'c1', label: '가' },
      { id: 'c2', label: '나' },
    ],
    correctChoiceIds: ['c1'],
    style: {},
    ...over,
  }
}

function textObj(over: Partial<TextObject> = {}): TextObject {
  return {
    id: createId(),
    type: 'text',
    rect: RECT,
    text: '안녕',
    style: {
      fontFamily: 'sans-serif',
      fontSize: 14,
      bold: false,
      italic: false,
      underline: false,
      align: 'left',
      lineHeight: 1.4,
      color: '#111111',
    },
    ...over,
  }
}

function shapeObj(over: Partial<ShapeObject> = {}): ShapeObject {
  return {
    id: createId(),
    type: 'shape',
    rect: RECT,
    shape: 'rect',
    style: { stroke: '#000000', strokeWidth: 2, fill: null },
    ...over,
  }
}

interface Harness {
  root: HTMLElement
  /** 선택을 교체한다. */
  select: (objects: PDFCanvasObject[]) => void
  /** 마지막 `onUpdate` 패치. */
  patches: { id: string; patch: Partial<PDFCanvasObject> }[]
  rotates: { id: string; deg: number }[]
  removes: string[]
}

/** 인스펙터를 만들고 검사한 뒤 정리한다. 패치는 문서에 반영하지 않고 기록만 한다. */
function withInspector<T>(initial: PDFCanvasObject[], fn: (h: Harness) => T): T {
  const [result, dispose] = scope(() => {
    const selected = signal<readonly PDFCanvasObject[]>(initial)
    const h: Harness = {
      root: null as unknown as HTMLElement,
      select: (objects) => (selected.value = objects),
      patches: [],
      rotates: [],
      removes: [],
    }
    h.root = inspector({
      selected,
      autoNumber: signal<string | null>('7'),
      readOnly: signal(false),
      onUpdate: (id, patch) => h.patches.push({ id, patch }),
      onRemove: (id) => h.removes.push(id),
      onRotate: (id, deg) => h.rotates.push({ id, deg }),
    })
    document.body.append(h.root)
    try {
      return fn(h)
    } finally {
      h.root.remove()
    }
  })
  dispose()
  return result
}

const has = (root: HTMLElement, sel: string) => root.querySelector(sel) !== null

/** `input` 이벤트를 흉내낸다. `prop` 바인딩이 값을 되돌리지 않는지도 함께 본다. */
function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function clickIt(el: Element | null) {
  el?.dispatchEvent(new Event('click', { bubbles: true }))
}

function toggle(input: HTMLInputElement, checked: boolean) {
  input.checked = checked
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

export const INSPECTOR_GROUPS: CaseGroup[] = [
  {
    title: 'inspector — 선택 상태별 분기',
    note: '다중 선택에는 공통 편집 UI 를 두지 않는다. 유형이 섞이면 무엇을 바꿀지 정의가 필요하다.',
    cases: [
      {
        name: '선택이 없으면 빈 상태',
        expected: [true, false],
        actual: () =>
          withInspector([], (h) => [has(h.root, '.pck-panel-empty'), has(h.root, '.pck-input')]),
      },
      {
        name: '2개 이상이면 개수만 보여준다',
        expected: [true, false],
        actual: () =>
          withInspector([shortObj(), textObj()], (h) => [
            has(h.root, '.pck-panel-empty'),
            has(h.root, '.pck-panel-section'),
          ]),
      },
      {
        name: '단답형이면 정답·배점 입력이 나온다',
        expected: [true, true],
        actual: () =>
          withInspector([shortObj()], (h) => [
            has(h.root, '.pck-input--num'),
            has(h.root, '.pck-dashed-btn'),
          ]),
      },
      {
        name: '★ 유형이 바뀌면 패널도 바뀐다 (when 조건을 유형으로 둔 이유)',
        expected: [true, false, false, true],
        actual: () =>
          withInspector([shortObj()], (h) => {
            // 단답형: 답안 추가 버튼 O, 도형 세그먼트 X
            const a = has(h.root, '.pck-dashed-btn')
            const b = has(h.root, '.pck-segmented')
            h.select([shapeObj()])
            // 도형: 답안 추가 버튼 X, 세그먼트 O
            return [a, b, has(h.root, '.pck-dashed-btn'), has(h.root, '.pck-segmented')]
          }),
      },
      {
        name: '같은 유형 안에서 객체를 바꾸면 값만 갱신된다',
        expected: ['5', '9'],
        actual: () =>
          withInspector([shortObj({ points: 5 })], (h) => {
            const num = () => h.root.querySelector<HTMLInputElement>('.pck-input--num')!
            const before = num().value
            const node = num()
            h.select([shortObj({ points: 9 })])
            // 같은 DOM 노드가 유지되고 값만 바뀐다.
            return [before, node.value]
          }),
      },
      {
        name: 'Answer Box 는 회전 입력이 없다 (PLAN Q8)',
        expected: [1, 2],
        actual: () =>
          withInspector([shortObj()], (h) => {
            const answerNums = h.root.querySelectorAll('.pck-input--num').length
            h.select([textObj()])
            // 텍스트: 글자 크기 + 회전 = 2
            return [answerNums, h.root.querySelectorAll('.pck-input--num').length]
          }),
      },
      {
        name: '텍스트·도형에는 문항 번호·배점이 없다',
        expected: false,
        actual: () =>
          withInspector([textObj()], (h) => (h.root.textContent ?? '').includes('배점')),
      },
    ],
  },

  {
    title: 'inspector — 패치 내용',
    note: '입력을 강제로 되돌리지 않는다. 유효하지 않은 값도 문서에 넣고 검증이 잡는다 — 되돌리면 "2를 지우고 3을 쓰려는" 중간 상태가 불가능해진다.',
    cases: [
      {
        name: '배점 입력이 숫자 패치를 만든다',
        expected: { points: 12 },
        actual: () =>
          withInspector([shortObj()], (h) => {
            type(h.root.querySelector<HTMLInputElement>('.pck-input--num')!, '12')
            return h.patches.at(-1)?.patch
          }),
      },
      {
        name: '배점을 비우면 0 으로 보낸다 (NaN 을 문서에 넣지 않는다)',
        expected: { points: 0 },
        actual: () =>
          withInspector([shortObj()], (h) => {
            type(h.root.querySelector<HTMLInputElement>('.pck-input--num')!, '')
            return h.patches.at(-1)?.patch
          }),
      },
      {
        name: '정답 입력이 answers 배열을 만든다',
        expected: { answers: ['서울'] },
        actual: () =>
          withInspector([shortObj()], (h) => {
            const inputs = h.root.querySelectorAll<HTMLInputElement>(
              '.pck-input:not(.pck-input--num)',
            )
            // [0] 문항 번호, [1] 정답
            type(inputs[1]!, '서울')
            return h.patches.at(-1)?.patch
          }),
      },
      {
        name: '허용 답안 추가가 빈 칸을 붙인다',
        expected: { answers: ['서울', ''] },
        actual: () =>
          withInspector([shortObj({ answers: ['서울'] })], (h) => {
            clickIt(h.root.querySelector('.pck-dashed-btn'))
            return h.patches.at(-1)?.patch
          }),
      },
      {
        name: '허용 답안 상한을 넘기면 추가 버튼이 비활성',
        expected: true,
        actual: () =>
          withInspector(
            [shortObj({ answers: Array.from({ length: LIMITS.shortAnswers.max }, () => 'x') })],
            (h) => h.root.querySelector<HTMLButtonElement>('.pck-dashed-btn')!.disabled,
          ),
      },
      {
        name: '문항 번호 placeholder 가 자동 번호를 보여준다 (PLAN Q9)',
        expected: '7',
        actual: () =>
          withInspector(
            [shortObj()],
            (h) =>
              h.root
                .querySelector('.pck-input:not(.pck-input--num)')
                ?.getAttribute('placeholder') ?? null,
          ),
      },
      {
        name: '드롭박스 보기 삭제가 정답 목록에서도 뺀다 (유령 정답 방지)',
        expected: { choices: [{ id: 'c2', label: '나' }], correctChoiceIds: [] },
        actual: () =>
          withInspector([dropboxObj()], (h) => {
            // 첫 보기의 × 버튼. 최소 개수라 비활성일 수 있으므로 보기를 3개로 만든다.
            return withInspector(
              [
                dropboxObj({
                  choices: [
                    { id: 'c1', label: '가' },
                    { id: 'c2', label: '나' },
                    { id: 'c3', label: '다' },
                  ],
                  correctChoiceIds: ['c1'],
                }),
              ],
              (h2) => {
                clickIt(h2.root.querySelector('.pck-row-btn'))
                const p = h2.patches.at(-1)?.patch as Partial<DropboxAnswerBox> | undefined
                void h
                return {
                  choices: p?.choices?.slice(0, 1),
                  correctChoiceIds: p?.correctChoiceIds,
                }
              },
            )
          }),
      },
      {
        name: '드롭박스 정답 체크가 correctChoiceIds 를 토글한다',
        expected: [],
        actual: () =>
          withInspector([dropboxObj()], (h) => {
            const cb = h.root.querySelector<HTMLInputElement>('.pck-row .pck-check')!
            toggle(cb, false)
            return (h.patches.at(-1)?.patch as Partial<DropboxAnswerBox>).correctChoiceIds
          }),
      },
      {
        name: '텍스트 정렬 세그먼트가 style 을 통째로 다시 만든다 (나머지 필드 유지)',
        expected: ['center', 14, false],
        actual: () =>
          withInspector([textObj()], (h) => {
            const buttons = h.root.querySelectorAll('.pck-segmented button')
            clickIt(buttons[1]!) // center
            const style = (h.patches.at(-1)?.patch as Partial<TextObject>).style!
            return [style.align, style.fontSize, style.bold]
          }),
      },
      {
        name: '도형 모양 변경은 shape 만 패치한다',
        expected: { shape: 'ellipse' },
        actual: () =>
          withInspector([shapeObj()], (h) => {
            clickIt(h.root.querySelectorAll('.pck-segmented button')[1]!)
            return h.patches.at(-1)?.patch
          }),
      },
      {
        name: '회전 입력은 update 가 아니라 rotate 로 간다 (별도 커맨드)',
        expected: [0, 45],
        actual: () =>
          withInspector([textObj()], (h) => {
            const nums = h.root.querySelectorAll<HTMLInputElement>('.pck-input--num')
            type(nums[nums.length - 1]!, '45')
            return [h.patches.length, h.rotates.at(-1)?.deg]
          }),
      },
      {
        name: '삭제 버튼이 onRemove 를 부른다',
        expected: 1,
        actual: () =>
          withInspector([textObj()], (h) => {
            clickIt(h.root.querySelector('.pck-inspector-delete'))
            return h.removes.length
          }),
      },
    ],
  },

  {
    title: 'inspector — BoxStyle 3상태 (PLAN 18.8) ★',
    note: 'undefined(미지정) · null(투명) · 색 문자열은 서로 다른 뜻이다. 미지정이면 CSS 토큰 기본값이 살아 있어 호스트가 테마를 바꿀 수 있다.',
    cases: [
      {
        name: '미지정이면 색 선택기를 그리지 않는다 (체크박스만)',
        expected: [3, 0],
        actual: () =>
          withInspector([shortObj({ style: {} })], (h) => [
            h.root.querySelectorAll('.pck-field--inline .pck-check').length,
            h.root.querySelectorAll('.pck-input--color').length,
          ]),
      },
      {
        name: '배경 체크를 켜면 색이 지정된다',
        expected: '#ffffff',
        actual: () =>
          withInspector([shortObj({ style: {} })], (h) => {
            const checks = h.root.querySelectorAll<HTMLInputElement>(
              '.pck-field--inline .pck-check',
            )
            toggle(checks[0]!, true)
            return (h.patches.at(-1)?.patch as { style?: BoxStyle }).style?.fill
          }),
      },
      {
        /*
         * `mergeBoxStyle` 은 모든 필드가 사라지면 스타일 자체를 `undefined` 로 만든다 —
         * 빈 객체를 문서에 남기면 JSON 만 커진다. 그래서 유일한 필드를 끄면 `style: undefined` 다.
         */
        name: '★ 유일한 필드를 끄면 style 자체가 undefined 가 된다 (null 이 아니다)',
        expected: [true, false],
        actual: () =>
          withInspector([shortObj({ style: { fill: '#ff0000' } })], (h) => {
            const checks = h.root.querySelectorAll<HTMLInputElement>(
              '.pck-field--inline .pck-check',
            )
            toggle(checks[0]!, false)
            const style = (h.patches.at(-1)?.patch as { style?: BoxStyle }).style
            return [style === undefined, style?.fill === null]
          }),
      },
      {
        name: '★ 다른 필드가 남아 있으면 그 키만 지운다',
        expected: [false, '#000000'],
        actual: () =>
          withInspector(
            [shortObj({ style: { fill: '#ff0000', stroke: '#000000', strokeWidth: 1 } })],
            (h) => {
              const checks = h.root.querySelectorAll<HTMLInputElement>(
                '.pck-field--inline .pck-check',
              )
              toggle(checks[0]!, false)
              const style = (h.patches.at(-1)?.patch as { style?: BoxStyle }).style
              // fill 키는 사라지고 stroke 는 남는다. `null` 이 아니라 키 부재여야 한다.
              return [style !== undefined && 'fill' in style, style?.stroke]
            },
          ),
      },
      {
        name: '투명 칩이 fill 을 null 로 만든다',
        expected: null,
        actual: () =>
          withInspector([shortObj({ style: { fill: '#ffffff' } })], (h) => {
            clickIt(h.root.querySelector('.pck-chip'))
            return (h.patches.at(-1)?.patch as { style?: BoxStyle }).style?.fill
          }),
      },
      {
        name: '테두리를 켜면 색과 두께가 함께 지정된다',
        expected: true,
        actual: () =>
          withInspector([shortObj({ style: {} })], (h) => {
            const checks = h.root.querySelectorAll<HTMLInputElement>(
              '.pck-field--inline .pck-check',
            )
            toggle(checks[1]!, true)
            const style = (h.patches.at(-1)?.patch as { style?: BoxStyle }).style
            return style?.stroke !== undefined && style?.strokeWidth !== undefined
          }),
      },
      {
        name: '테두리를 끄면 색과 두께가 함께 지워진다',
        expected: [false, false],
        actual: () =>
          withInspector([shortObj({ style: { stroke: '#000000', strokeWidth: 2 } })], (h) => {
            const checks = h.root.querySelectorAll<HTMLInputElement>(
              '.pck-field--inline .pck-check',
            )
            toggle(checks[1]!, false)
            const style = (h.patches.at(-1)?.patch as { style?: BoxStyle }).style
            return [
              style !== undefined && 'stroke' in style,
              style !== undefined && 'strokeWidth' in style,
            ]
          }),
      },
      {
        name: '★ 텍스트는 글꼴 속성을 유지하며 색만 바꾼다',
        // 배경 체크를 켜면 기본값 #ffffff 로 시작한다. 글꼴 속성은 그대로 남아야 한다.
        expected: [14, 'left', '#ffffff'],
        actual: () =>
          withInspector([textObj()], (h) => {
            const checks = h.root.querySelectorAll<HTMLInputElement>(
              '.pck-field--inline .pck-check',
            )
            // 텍스트의 체크박스: [0] 굵게, [1] 배경, [2] 테두리, [3] 글자색
            toggle(checks[1]!, true)
            const style = (h.patches.at(-1)?.patch as Partial<TextObject>).style!
            return [style.fontSize, style.align, style.fill]
          }),
      },
      {
        name: '텍스트 글자색 지정을 끄면 기본값으로 되돌린다 (필수 필드다)',
        expected: '#1c1c1a',
        actual: () =>
          withInspector([textObj()], (h) => {
            const checks = h.root.querySelectorAll<HTMLInputElement>(
              '.pck-field--inline .pck-check',
            )
            toggle(checks[3]!, false)
            return (h.patches.at(-1)?.patch as Partial<TextObject>).style!.color
          }),
      },
      {
        name: '도형에는 BoxStyle 패널이 없다 (전용 패널과 충돌 방지)',
        expected: false,
        actual: () =>
          withInspector([shapeObj()], (h) => (h.root.textContent ?? '').includes('투명')),
      },
    ],
  },
]
