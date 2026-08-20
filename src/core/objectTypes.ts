/**
 * 커스텀 객체 타입 레지스트리 (PLAN D25).
 *
 * 이 패키지는 **기본 틀**만 안다 — pt 사각형, 리사이즈, 배경·테두리, 회전. 그 안에 무엇을
 * 그릴지, 무엇이 유효한지는 소비자가 여기로 알려 준다.
 *
 * ```ts
 * const shortAnswer = defineObjectType<{ answers: string[]; points: number }>({
 *   kind: 'answer.short',
 *   label: '단답형',
 *   defaultSize: { w: 160, h: 40 },
 *   defaultData: () => ({ answers: [], points: 5 }),
 *   validate: (d) => (d.answers.some((a) => a.trim()) ? null : ['정답을 입력하세요']),
 * })
 *
 * <PDFCanvasEditor objectTypes={[shortAnswer]} />
 * <PDFCanvasViewer objectTypes={[shortAnswer]} />
 * ```
 *
 * **같은 레지스트리를 Editor 와 Viewer 에 넘긴다.** 그래야 편집기에서 넣은 객체를 뷰어가
 * 해석할 수 있다 — `kind` 가 둘 사이의 계약이다.
 *
 * ## 렌더 슬롯이 둘로 갈리는 이유
 *
 * | 슬롯 | 쓰는 곳 | 누가 부르는가 |
 * | --- | --- | --- |
 * | `render` | vanilla DOM | 렌더 층이 직접 부른다 |
 * | (없음) | React·Vue | **빈 컨테이너**만 만들고 마운트 포인트로 알린다. 래퍼가 portal 한다 |
 *
 * 프레임워크 래퍼는 `render` 를 쓰지 않는다. React 의 `createPortal` · Vue 의 `Teleport` 가
 * 컨테이너 노드에 자기 컴포넌트를 꽂는 방식이라, 렌더 층이 내용을 만들면 안 된다.
 * 그래서 `render` 는 optional 이고, 없으면 컨테이너가 비어 있는 채로 남는다.
 */
import type { Pt } from './model/types'

/**
 * 객체 크기(pt).
 *
 * `Size`(`{ width, height }`)와 다르다 — 그건 **페이지** 크기다. 객체는 `Rect` 와 같은
 * `{ w, h }` 를 쓴다. 두 이름을 섞으면 어느 쪽인지 호출부에서 알 수 없다.
 */
export interface ObjectSize {
  w: Pt
  h: Pt
}

/**
 * vanilla DOM 렌더 슬롯이 받는 것.
 *
 * ## ★ `render` 는 객체당 **한 번만** 불린다
 *
 * 데이터가 바뀔 때마다 다시 부르면 **입력 중 노드가 파괴되어 포커스가 날아간다.** 한글 IME 는
 * 조합까지 끊긴다 — 2026.08.20 에 실제로 그 버그를 냈다(PLAN 20.14).
 *
 * 그래서 값은 스냅샷이 아니라 **함수**로 준다. 스냅샷을 들고 있으면 즉시 낡는다.
 *
 * ```ts
 * render: (ctx) => {
 *   const input = document.createElement('input')
 *   input.value = ctx.data().answers[0] ?? ''
 *   input.addEventListener('input', () =>
 *     ctx.onChange({ ...ctx.data(), answers: [input.value] }),
 *   )
 *   // 밖에서 값이 바뀌면(undo 등) 반영한다. 편집 중에는 덮지 않는다.
 *   ctx.onUpdate(() => {
 *     if (document.activeElement !== input) input.value = ctx.data().answers[0] ?? ''
 *   })
 *   return input
 * }
 * ```
 */
export interface ObjectRenderContext<Data = unknown> {
  objectId: string
  /** 현재 데이터. **함수다** — `render` 가 한 번만 불리므로 스냅샷은 낡는다. */
  data: () => Data
  /** pt 단위. 배율은 부모 컨테이너가 처리하므로 곱하지 않는다 (PLAN 5.3). */
  rect: () => { x: Pt; y: Pt; w: Pt; h: Pt }
  selected: () => boolean
  /** 데이터를 바꾼다. 커맨드 한 번으로 커밋되어 undo 한 항목이 된다. */
  onChange: (next: Data) => void
  /**
   * 데이터·선택·크기가 바뀔 때 부를 콜백을 등록한다. DOM 을 직접 갱신하는 통로다.
   *
   * ⚠️ **자기가 만든 변경으로도 불린다.** 입력 요소를 무조건 덮어쓰면 캐럿이 끝으로 튀고
   * IME 조합이 끊긴다 — `document.activeElement` 로 걸러야 한다(위 예제).
   */
  onUpdate: (fn: () => void) => void
}

export interface ObjectTypeDef<Data = unknown> {
  /** 문서에 저장되는 식별자. 레지스트리 키다. */
  kind: string
  /** 툴바에 보이는 이름. */
  label: string
  /** 도구로 클릭만 했을 때(드래그 없이) 만들 크기. pt. */
  defaultSize: ObjectSize
  /**
   * 리사이즈 최소 크기. pt. 생략하면 `EDITOR_DEFAULTS.minObjectSize` 를 쓴다.
   *
   * 학생이 탭해야 하는 입력처럼 손가락보다 커야 하는 객체가 있다. 이전 판은 이걸
   * `LIMITS.minAnswerBoxSize`(80×32pt)로 코어에 박아 뒀는데, 타입별 요구라 여기가 맞다.
   */
  minSize?: ObjectSize
  /** 새 객체의 초기 데이터. 매번 새 객체를 돌려줘야 한다 — 공유하면 객체가 서로 엮인다. */
  defaultData: () => Data
  /**
   * 회전을 허용할지. **기본은 `true`.**
   *
   * 이전 판은 "Answer Box 는 회전하지 않는다"(PLAN Q8)를 코어에 박아 뒀다 — 학생 폼 요소가
   * 기울면 입력과 모바일 렌더가 깨지기 때문이다. 그 판단은 콘텐츠를 아는 쪽의 것이므로
   * 여기로 옮겼다. 입력 요소를 담는 타입은 대개 `rotatable: false` 가 맞다 — 기울어진 입력은 쓰기 어렵다.
   */
  rotatable?: boolean
  /**
   * 검증. `null` 이나 빈 배열이면 통과다.
   *
   * 문자열은 그대로 사용자에게 보여진다 — i18n 이 필요하면 소비자가 이미 번역해 넘긴다.
   * 이 패키지는 `data` 를 해석하지 않으므로 검증 규칙도 소비자 것이다.
   */
  validate?: (data: Data) => string[] | null
  /**
   * 학생·독자에게 내보낼 때 데이터에서 **비밀을 제거한다** (구 PLAN D14).
   *
   * 이전 판은 `toPublicDoc()` 이 `answers` · `correctChoiceIds` · `rubric` 을 코어에서 지웠다.
   * 이제 이 패키지는 `data` 안에 무엇이 비밀인지 모르므로 소비자가 알려 준다.
   *
   * ```ts
   * toPublic: ({ answers: _a, ...rest }) => rest
   * ```
   *
   * **생략하면 데이터가 그대로 나간다.** 정답이 학생 번들에 실려 가면 안 되는 타입은 반드시
   * 구현해야 한다 — 이 패키지는 그것을 강제할 방법이 없다.
   */
  toPublic?: (data: Data) => unknown
  /**
   * vanilla DOM 렌더. **프레임워크 래퍼는 이걸 주지 않는다** (위 표 참고).
   *
   * 반환한 노드가 프레임 안쪽 컨테이너의 자식이 된다. **객체당 한 번만 불린다** —
   * 갱신은 `ctx.onUpdate` 로 받는다.
   */
  render?: (ctx: ObjectRenderContext<Data>) => Node
  /**
   * 우측 인스펙터의 속성 편집 패널. vanilla DOM.
   *
   * `render` 와 같은 규칙이다 — 프레임워크 래퍼는 이걸 주지 않고 컨테이너에 portal 한다.
   * **선택된 객체당 한 번만 불린다.** 이전 판의 `ShortAnswerPanel` · `DropboxPanel` 이
   * 여기로 옮겨졌다 (PLAN D25).
   */
  renderInspector?: (ctx: ObjectRenderContext<Data>) => Node
}

/**
 * 타입 정의를 만든다. 런타임 동작은 없고 **제네릭을 잡아 주기 위한** 함수다.
 *
 * ```ts
 * // 이렇게 쓰면 defaultData 와 validate·render 의 Data 가 서로 묶인다
 * const t = defineObjectType({ kind: 'x', defaultData: () => ({ n: 1 }), … })
 * ```
 */
export function defineObjectType<Data>(def: ObjectTypeDef<Data>): ObjectTypeDef<Data> {
  return def
}

/**
 * 서로 다른 `Data` 를 가진 정의들을 한 배열에 담기 위한 타입.
 *
 * `ObjectTypeDef<unknown>` 으로는 안 된다 — `validate(data: Data)` 가 함수 파라미터이므로
 * 반공변이고, `ObjectTypeDef<{ n: number }>` 를 `ObjectTypeDef<unknown>` 에 넣을 수 없다.
 * 레지스트리는 `data` 를 해석하지 않고 통과시키기만 하므로 여기서만 `any` 를 쓴다.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyObjectTypeDef = ObjectTypeDef<any>

/** `kind` → 정의. 렌더 층과 컨트롤러가 이걸 통해 조회한다. */
export interface ObjectTypeRegistry {
  get(kind: string): AnyObjectTypeDef | undefined
  /** 툴바 순서. 등록 순서를 유지한다. */
  all(): readonly AnyObjectTypeDef[]
  has(kind: string): boolean
}

/**
 * 레지스트리를 만든다.
 *
 * 같은 `kind` 를 두 번 등록하면 **던진다.** 조용히 뒤에 온 것이 이기면, 문서를 저장한 뒤
 * 다른 렌더러가 붙는 상황을 디버깅할 방법이 없다.
 */
export function createObjectTypeRegistry(
  defs: readonly AnyObjectTypeDef[] = [],
): ObjectTypeRegistry {
  const map = new Map<string, AnyObjectTypeDef>()

  for (const def of defs) {
    if (map.has(def.kind)) {
      throw new Error(`[pdf-canvas-kit] duplicate object kind: ${def.kind}`)
    }
    map.set(def.kind, def)
  }

  const ordered = [...map.values()]

  return {
    get: (kind) => map.get(kind),
    all: () => ordered,
    has: (kind) => map.has(kind),
  }
}

/**
 * 등록되지 않은 `kind` 를 만났을 때.
 *
 * 저장된 문서가 지금 등록되지 않은 타입을 담고 있을 수 있다 — 소비자가 타입을 지웠거나,
 * 다른 앱이 만든 문서를 열었거나. **객체를 조용히 버리지 않는다.** 자리와 크기는 그리고
 * 콘텐츠만 비운 뒤 검증에서 잡는다. 버리면 저장할 때 데이터가 사라진다.
 */
export const UNKNOWN_KIND_ISSUE = 'CUSTOM_UNKNOWN_KIND'
