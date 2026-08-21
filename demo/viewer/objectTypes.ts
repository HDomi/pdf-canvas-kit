/**
 * 뷰어 데모용 객체 타입 (커스텀 객체는 소비자가 정의한다 / 뷰어는 응답을 갖지 않는다).
 *
 * 편집기 데모(`demo/editor/objectTypes.ts`)와 **같은 `kind`** 를 쓴다 — 그게 Editor↔Viewer
 * 계약이다. 다른 것은 슬롯 셋이다.
 *
 * | 슬롯 | 화면 | 하는 일 |
 * | --- | --- | --- |
 * | `render` | 편집기 캔버스 | 미리보기 배지 ("2점 · 정답 미입력") |
 * | `renderInspector` | 편집기 인스펙터 | 정답·배점을 입력한다 |
 * | `renderViewer` | **뷰어** | 응답을 입력한다 |
 *
 * `toPublic` 이 정답을 지우므로 뷰어의 `data()` 에는 `answers` 가 **없다**. 이 파일의
 * `renderViewer` 가 그 사실을 화면에 드러낸다 — 정답을 읽으려 해도 `undefined` 다.
 */
import { defineObjectType } from '@h_domi/pdf-canvas-kit'

/* ------------------------------------------------------------------ 단답형 -- */

interface AnswerData {
  answers: string[]
  points: number
  /** 뷰어 응답. 편집 시점에는 없다. */
  response?: string
}

/** 뷰어가 받는 데이터. `toPublic` 이 `answers` 를 지운 형태다. */
type PublicAnswerData = Omit<AnswerData, 'answers'>

/*
 * 제네릭이 둘이다 (R11).
 *
 * 두 번째를 주지 않으면 `renderViewer` 의 `ctx.data()` 가 `AnswerData` 로 보이고, 실제로는
 * 없는 `answers` 를 타입이 있다고 말한다. 명시하면 그 자리에서 컴파일 에러가 난다 —
 * 아래 `renderViewer` 에 캐스트가 하나도 없는 이유다.
 */
export const shortAnswer = defineObjectType<AnswerData, PublicAnswerData>({
  kind: 'demo.shortAnswer',
  label: '단답형',
  defaultSize: { w: 160, h: 40 },
  minSize: { w: 80, h: 32 },
  defaultData: () => ({ answers: [], points: 1 }),
  rotatable: false,
  validate: (d) => (d.answers.some((a) => a.trim()) ? null : ['정답을 입력하세요']),
  // 정답은 뷰어 번들에 실려 가면 안 된다 (정답은 편집 문서에만 있다).
  toPublic: ({ answers: _answers, ...rest }) => rest,

  render: ({ data, onUpdate }) => {
    const box = document.createElement('div')
    box.style.cssText =
      'display:flex;align-items:center;gap:6px;padding:0 8px;height:100%;font-size:11px'
    const badge = document.createElement('b')
    box.append(badge)
    const sync = () => (badge.textContent = `${data().points}점`)
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
    wrap.append(answer)
    // ⚠️ 포커스가 있는 입력은 덮지 않는다 — 캐럿이 튀고 IME 조합이 끊긴다.
    const sync = () => {
      if (document.activeElement !== answer) answer.value = data().answers[0] ?? ''
    }
    sync()
    onUpdate(sync)
    return wrap
  },

  /**
   * 뷰어 — 응답을 입력한다.
   *
   * 여기서는 콘텐츠가 포인터 이벤트를 받으므로(D29) 실제 `<input>` 이 동작한다. 편집기
   * 캔버스에서는 같은 코드가 동작하지 않았고, 그게 D26 의 이유였다.
   */
  renderViewer: ({ data, onChange, onUpdate }) => {
    const input = document.createElement('input')
    input.className = 'pck-input'
    input.style.cssText = 'width:100%;height:100%;box-sizing:border-box'
    input.placeholder = '답을 입력하세요'

    /*
     * 정답이 정말 없는지 런타임에서도 확인한다.
     *
     * 타입은 이미 `answers` 를 모른다(위 제네릭). 그래도 확인하는 이유: `toPublic` 을 빠뜨린
     * 타입은 데이터가 그대로 나가고, 그건 타입이 잡아 주지 않는다. 이 데모의 목적 절반이
     * 그 사실을 눈에 보이게 하는 것이다.
     */
    const leaked = (data() as Record<string, unknown>).answers
    if (leaked !== undefined) {
      console.error('[viewer] answers leaked into the public doc:', leaked)
    }

    input.addEventListener('input', () => {
      onChange({ ...data(), response: input.value })
    })

    // ⚠️ 편집기와 같은 이유의 포커스 가드.
    const sync = () => {
      if (document.activeElement !== input) input.value = data().response ?? ''
    }
    sync()
    onUpdate(sync)
    return input
  },
})

/** 편집기·뷰어 양쪽에 같은 배열을 넘긴다. */
export const DEMO_VIEWER_TYPES = [shortAnswer]
