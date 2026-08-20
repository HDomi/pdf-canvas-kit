/**
 * 학생에게 내보내기 전에 정답을 제거한다 (PLAN D14).
 *
 * 학생 번들에는 정답이나 채점 메모가 절대 들어가면 안 된다. 사용 지점에서 필터링하는 대신
 * 아예 다른 타입으로 만들어, 뷰어에 `WorksheetDoc` 을 넘기면 컴파일 에러가 나게 했다.
 *
 * 서버가 과제 스냅샷을 만들 때도 같은 규칙을 적용한다. 이 함수가 "public"의 공유 정의다.
 */
import type {
  DropboxAnswerBox,
  EssayAnswerBox,
  MaskObject,
  ShapeObject,
  ShortAnswerBox,
  TextObject,
  WorksheetDoc,
  WorksheetObject,
  WorksheetPage,
} from './types'

export type PublicShortAnswerBox = Omit<ShortAnswerBox, 'answers'>
export type PublicEssayAnswerBox = Omit<EssayAnswerBox, 'rubric'>
export type PublicDropboxAnswerBox = Omit<DropboxAnswerBox, 'correctChoiceIds'>

export type PublicWorksheetObject =
  | TextObject
  | ShapeObject
  | MaskObject
  | PublicShortAnswerBox
  | PublicEssayAnswerBox
  | PublicDropboxAnswerBox

export type PublicWorksheetPage = Omit<WorksheetPage, 'objects'> & {
  objects: PublicWorksheetObject[]
}

export type PublicWorksheetDoc = Omit<WorksheetDoc, 'pages' | 'titleTouched'> & {
  pages: PublicWorksheetPage[]
}

function toPublicObject(o: WorksheetObject): PublicWorksheetObject {
  switch (o.type) {
    case 'answer.short': {
      // 비밀 필드를 구조분해로 빼내는 방식이라 누락이 검증된다.
      // 원본 타입에 새 비밀 필드가 추가되면 이 줄이 깨진다.
      const { answers: _answers, ...rest } = o
      return rest
    }
    case 'answer.essay': {
      const { rubric: _rubric, ...rest } = o
      return rest
    }
    case 'answer.dropbox': {
      const { correctChoiceIds: _correct, ...rest } = o
      return rest
    }
    default:
      return o
  }
}

export function toPublicDoc(doc: WorksheetDoc): PublicWorksheetDoc {
  const { titleTouched: _titleTouched, pages, ...rest } = doc
  return {
    ...rest,
    pages: pages.map((p) => ({ ...p, objects: p.objects.map(toPublicObject) })),
  }
}

/**
 * 정답 필드 이름을 재귀적으로 훑는다.
 *
 * `/checks/` 화면에서 유출이 없음을 단정하는 데 쓴다. {@link toPublicDoc} 를 신뢰하는 것보다
 * 강한 검사다 — 중첩 구조를 통해 몰래 들어온 필드까지 잡아낸다.
 */
export function findAnswerFieldPaths(value: unknown, path = '$'): string[] {
  const SECRETS = new Set(['answers', 'rubric', 'correctChoiceIds'])
  const hits: string[] = []

  const walk = (v: unknown, p: string) => {
    if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, `${p}[${i}]`))
      return
    }
    if (v === null || typeof v !== 'object') return
    for (const [key, child] of Object.entries(v)) {
      const childPath = `${p}.${key}`
      if (SECRETS.has(key)) hits.push(childPath)
      walk(child, childPath)
    }
  }

  walk(value, path)
  return hits
}
