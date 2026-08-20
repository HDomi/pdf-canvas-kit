/**
 * 데모용 커스텀 객체 타입 (PLAN D25, D26).
 *
 * 소비자 앱이 타입을 정의하는 방식의 예제다. 구 `ShortAnswerBox` · `DropboxAnswerBox` 가
 * 하던 일을 **소비자 코드로** 하는 모습이며, 코어에 그 도메인이 없어도 같은 UX 가 나온다.
 *
 * 데모 진입점(`main.ts`)과 분리한 이유: 진입점은 마운트·dev 바를 다루고 여기는 소비자 계약의
 * 예제다. 섞어 두면 "어디까지가 라이브러리 쓰는 법인지" 가 흐려진다.
 *
 * ## 두 가지 규칙이 이 파일 전체를 지배한다
 *
 * 1. **`render` 는 객체당 한 번만 불린다** (PLAN 20.14). 값은 `data()` 로 읽고 갱신은
 *    `onUpdate` 로 받는다. 매번 다시 그리면 입력 중 노드가 파괴돼 포커스가 날아간다.
 * 2. **편집 창구는 인스펙터 하나다** (PLAN D26). 캔버스는 배치와 크기 조절만 한다.
 *
 * 이 데모는 프레임워크가 없으므로 vanilla 슬롯을 쓴다. React·Vue 래퍼는 이 슬롯을 주지 않고
 * 컨테이너에 portal 한다 (R9).
 */
import { defineObjectType } from 'pdf-canvas-kit'

/* ------------------------------------------------------------------ 단답형 -- */

interface AnswerData {
  answers: string[]
  points: number
}

export const shortAnswer = defineObjectType<AnswerData>({
  kind: 'demo.shortAnswer',
  label: '단답형',
  defaultSize: { w: 160, h: 40 },
  minSize: { w: 80, h: 32 },
  defaultData: () => ({ answers: [], points: 1 }),
  // 기울어진 입력은 쓰기 어렵다. 구 PLAN Q8 이 이 자리로 옮겨졌다.
  rotatable: false,
  validate: (d) => (d.answers.some((a) => a.trim()) ? null : ['정답을 입력하세요']),
  // 정답은 학생 번들에 실려 가면 안 된다 (구 PLAN D14).
  toPublic: ({ answers: _answers, ...rest }) => rest,

  render: ({ data, onUpdate }) => {
    const box = document.createElement('div')
    box.style.cssText =
      'display:flex;align-items:center;gap:6px;padding:0 8px;height:100%;font-size:11px'
    const badge = document.createElement('b')
    const hint = document.createElement('span')
    hint.style.color = '#b4342b'
    box.append(badge, hint)

    const sync = () => {
      const d = data()
      badge.textContent = String(d.points)
      hint.textContent = d.answers.some((a) => a.trim()) ? '' : '정답 미입력'
    }
    sync()
    onUpdate(sync)
    return box
  },

  renderInspector: ({ data, onChange, onUpdate }) => {
    const wrap = document.createElement('div')

    const answer = document.createElement('input')
    answer.className = 'pck-input'
    answer.placeholder = '정답'
    answer.addEventListener('input', () => onChange({ ...data(), answers: [answer.value] }))

    const points = document.createElement('input')
    points.className = 'pck-input pck-input--num'
    points.type = 'number'
    points.min = '1'
    points.addEventListener('input', () =>
      onChange({ ...data(), points: Number(points.value) || 1 }),
    )

    wrap.append(answer, points)

    /*
     * ⚠️ **포커스가 있는 입력은 덮지 않는다.**
     *
     * `onUpdate` 는 자기가 만든 변경으로도 불린다. 무조건 대입하면 캐럿이 끝으로 튀고
     * 한글 IME 조합이 끊긴다 — 이 가드가 그 종류의 버그를 막는 유일한 지점이다.
     */
    const sync = () => {
      const d = data()
      if (document.activeElement !== answer) answer.value = d.answers[0] ?? ''
      if (document.activeElement !== points) points.value = String(d.points)
    }
    sync()
    onUpdate(sync)
    return wrap
  },
})

/* ------------------------------------------------------------------ 선택형 -- */

interface ChoiceData {
  choices: string[]
  correct: number
}

/** 보기 칸 수. 고정으로 둔 이유는 아래 `renderInspector` 주석 참고. */
const CHOICE_SLOTS = 3

export const choice = defineObjectType<ChoiceData>({
  kind: 'demo.choice',
  label: '선택형',
  defaultSize: { w: 180, h: 40 },
  minSize: { w: 80, h: 32 },
  defaultData: () => ({ choices: ['', ''], correct: 0 }),
  rotatable: false,
  validate: (d) => {
    const filled = d.choices.filter((c) => c.trim())
    if (filled.length < 2) return ['보기를 2개 이상 입력하세요']
    if (!d.choices[d.correct]?.trim()) return ['정답 보기를 고르세요']
    return null
  },
  toPublic: ({ correct: _correct, ...rest }) => rest,

  render: ({ data, onUpdate }) => {
    const box = document.createElement('div')
    box.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;gap:6px;' +
      'padding:0 8px;height:100%;font-size:11px'
    const label = document.createElement('span')
    const caret = document.createElement('span')
    caret.textContent = '▾'
    caret.setAttribute('aria-hidden', 'true')
    box.append(label, caret)

    const sync = () => {
      const filled = data().choices.filter((c) => c.trim())
      label.textContent = filled.length >= 2 ? `${filled.length}개 보기` : '보기 미완성'
      label.style.color = filled.length >= 2 ? 'inherit' : '#b4342b'
    }
    sync()
    onUpdate(sync)
    return box
  },

  renderInspector: ({ data, onChange, onUpdate }) => {
    const wrap = document.createElement('div')
    const inputs: HTMLInputElement[] = []
    const radios: HTMLInputElement[] = []

    /*
     * 보기 칸을 고정 개수로 둔다.
     *
     * 개수를 동적으로 늘리려면 `render` 가 한 번만 불리는 계약(PLAN 20.14) 아래서 DOM 을
     * 직접 추가·제거해야 한다. 그건 소비자가 자기 프레임워크로 하는 편이 낫다 — R9 의
     * portal 경로가 정확히 그 용도다. 여기서는 vanilla 슬롯의 최소 예제만 보여준다.
     */
    for (let i = 0; i < CHOICE_SLOTS; i++) {
      const row = document.createElement('div')
      row.className = 'pck-row'

      const radio = document.createElement('input')
      radio.type = 'radio'
      radio.name = 'demo-choice-correct'
      radio.className = 'pck-check'
      radio.setAttribute('aria-label', `정답 ${i + 1}`)
      radio.addEventListener('change', () => onChange({ ...data(), correct: i }))

      const input = document.createElement('input')
      input.className = 'pck-input'
      input.placeholder = `보기 ${i + 1}`
      input.addEventListener('input', () => {
        const next = [...data().choices]
        next[i] = input.value
        onChange({ ...data(), choices: next })
      })

      row.append(radio, input)
      wrap.append(row)
      inputs.push(input)
      radios.push(radio)
    }

    // ⚠️ 위와 같은 이유로 포커스가 있는 입력은 덮지 않는다.
    const sync = () => {
      const d = data()
      inputs.forEach((input, i) => {
        if (document.activeElement !== input) input.value = d.choices[i] ?? ''
      })
      radios.forEach((radio, i) => (radio.checked = d.correct === i))
    }
    sync()
    onUpdate(sync)
    return wrap
  },
})

/** 편집기에 넘기는 목록. 툴바 도구가 이 순서대로 만들어진다. */
export const DEMO_OBJECT_TYPES = [shortAnswer, choice]
