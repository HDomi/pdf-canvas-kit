/**
 * 순수 함수 검증 케이스 (PLAN 17.2).
 *
 * 렌더와 데이터를 분리해 둔다. 나중에 테스트 러너를 도입하면 이 배열을 그대로 소비할 수 있다.
 * 지금은 `/checks/` 화면이 표로 렌더하고 불일치 행을 빨갛게 칠한다.
 */
import {
  boxStyleToCss,
  clampIntoPage,
  clampPageIndex,
  clampScale,
  clientToPage,
  constrainRect,
  createId,
  createPage,
  createPDFCanvasDoc,
  findAnswerFieldPaths,
  formatPaperLabel,
  hitTestObject,
  matchesAnyAnswer,
  matchesChoiceSet,
  mergeBoxStyle,
  moveRect,
  normalizeAnswer,
  numberQuestions,
  rotationFromPointer,
  pageToFrame,
  pickObjectsInRect,
  rectFromPoints,
  resizeRect,
  scoreAttempt,
  scoreItem,
  serializeDoc,
  stepZoom,
  toPublicDoc,
  validateObject,
  type PageViewport,
  type ShortAnswerBox,
  type DropboxAnswerBox,
  type EssayAnswerBox,
  type PDFCanvasObject,
} from 'pdf-canvas-kit'

/** 한 건의 검증 케이스. `actual` 은 렌더 시점에 실행된다. */
export interface Case {
  name: string
  expected: unknown
  actual: () => unknown
}

export interface CaseGroup {
  title: string
  /** 이 그룹이 확인하는 설계 근거. 화면에 함께 표시한다. */
  note?: string
  cases: Case[]
}

const A4 = { width: 595.28, height: 841.89 }

const vp = (scale: number, left = 100, top = 50): PageViewport => ({
  pageId: 'p1',
  size: A4,
  scale,
  frameRect: { left, top },
})

/** 소수 오차를 흡수해 비교한다. 좌표 왕복은 부동소수 계산이다. */
const round = (n: number, digits = 4) => Number(n.toFixed(digits))

function shortBox(answers: string[], points = 1): ShortAnswerBox {
  return {
    id: 'short-1',
    type: 'answer.short',
    rect: { x: 0, y: 0, w: 160, h: 40 },
    points,
    answers,
  }
}

function dropboxBox(labels: string[], correctIndexes: number[], points = 1): DropboxAnswerBox {
  const choices = labels.map((label, i) => ({ id: `c${i}`, label }))
  return {
    id: 'drop-1',
    type: 'answer.dropbox',
    rect: { x: 0, y: 0, w: 160, h: 40 },
    points,
    choices,
    correctChoiceIds: correctIndexes.map((i) => `c${i}`),
  }
}

function essayBox(points = 5): EssayAnswerBox {
  return {
    id: 'essay-1',
    type: 'answer.essay',
    rect: { x: 0, y: 0, w: 200, h: 80 },
    points,
    rubric: '모범답안',
  }
}

export const GROUPS: CaseGroup[] = [
  {
    title: '좌표 왕복 (PLAN 5.4)',
    note: 'clientToPage → pageToFrame 왕복이 원래 값으로 돌아와야 한다. 배율·오프셋과 무관하다.',
    cases: [
      ...[0.25, 0.8, 1, 2.5, 4].map((scale) => ({
        name: `scale ${scale}: (300,400) 왕복`,
        expected: { x: 300, y: 400 },
        actual: () => {
          const v = vp(scale)
          // 화면 좌표로 만든 뒤 다시 pt로 돌린다.
          const screen = pageToFrame({ x: 300, y: 400 }, v)
          const back = clientToPage(
            { x: screen.x + v.frameRect.left, y: screen.y + v.frameRect.top },
            v,
          )
          return { x: round(back.x), y: round(back.y) }
        },
      })),
      {
        name: '프레임 오프셋이 달라도 결과 동일',
        expected: { x: 100, y: 100 },
        actual: () => {
          const a = clientToPage({ x: 200, y: 150 }, vp(1, 100, 50))
          return { x: round(a.x), y: round(a.y) }
        },
      },
    ],
  },

  {
    title: '클램프·최소 크기 (PLAN 11.3)',
    note: 'Answer Box 최소 80×32pt, 텍스트·도형 8×8pt. 이동은 크기를 바꾸지 않는다.',
    cases: [
      {
        name: '페이지 밖으로 이동 → 경계에 멈춤',
        expected: { x: 435.28, y: 801.89, w: 160, h: 40 },
        actual: () => clampIntoPage({ x: 900, y: 900, w: 160, h: 40 }, A4),
      },
      {
        name: '음수 좌표 → 0으로',
        expected: { x: 0, y: 0, w: 100, h: 50 },
        actual: () => clampIntoPage({ x: -50, y: -20, w: 100, h: 50 }, A4),
      },
      {
        name: 'Answer Box 최소 크기 적용',
        expected: { x: 10, y: 10, w: 80, h: 32 },
        actual: () => constrainRect({ x: 10, y: 10, w: 5, h: 5 }, A4, 'answer.short'),
      },
      {
        name: '도형 최소 크기 적용',
        expected: { x: 10, y: 10, w: 8, h: 8 },
        actual: () => constrainRect({ x: 10, y: 10, w: 1, h: 1 }, A4, 'shape'),
      },
      {
        name: '이동은 크기를 유지',
        expected: { w: 160, h: 40 },
        actual: () => {
          const r = moveRect({ x: 0, y: 0, w: 160, h: 40 }, { dx: 5000, dy: 5000 }, A4, 'text')
          return { w: r.w, h: r.h }
        },
      },
      {
        name: '드래그 방향 무관 (역방향)',
        expected: { x: 10, y: 20, w: 90, h: 80 },
        actual: () => rectFromPoints({ x: 100, y: 100 }, { x: 10, y: 20 }),
      },
    ],
  },

  {
    title: '핸들 리사이즈 (PLAN 11.3)',
    note: 'se는 좌상단 고정, nw는 우하단 고정. Shift는 종횡비, Alt는 중심 기준.',
    cases: [
      {
        name: 'se 핸들: 좌상단 고정',
        expected: { x: 100, y: 100, w: 220, h: 90 },
        actual: () =>
          resizeRect({ x: 100, y: 100, w: 200, h: 80 }, 'se', { dx: 20, dy: 10 }, A4, 'shape'),
      },
      {
        name: 'nw 핸들: 우하단 고정',
        expected: { x: 120, y: 110, w: 180, h: 70 },
        actual: () =>
          resizeRect({ x: 100, y: 100, w: 200, h: 80 }, 'nw', { dx: 20, dy: 10 }, A4, 'shape'),
      },
      {
        name: 'n 핸들: x축 델타 무시',
        expected: { x: 100, w: 200 },
        actual: () => {
          const r = resizeRect(
            { x: 100, y: 100, w: 200, h: 80 },
            'n',
            { dx: 50, dy: 10 },
            A4,
            'shape',
          )
          return { x: r.x, w: r.w }
        },
      },
      {
        name: 'Shift: 종횡비 유지 (2:1)',
        expected: 2,
        actual: () => {
          const r = resizeRect(
            { x: 0, y: 0, w: 200, h: 100 },
            'se',
            { dx: 40, dy: 0 },
            A4,
            'shape',
            { keepAspect: true },
          )
          return round(r.w / r.h, 3)
        },
      },
      {
        name: 'Alt: 중심 고정',
        expected: 100,
        actual: () => {
          const start = { x: 50, y: 50, w: 100, h: 100 }
          const r = resizeRect(start, 'se', { dx: 20, dy: 20 }, A4, 'shape', { fromCenter: true })
          // 중심이 유지돼야 한다.
          return round(r.x + r.w / 2)
        },
      },
      {
        name: '리사이즈도 최소 크기 준수',
        expected: { w: 80, h: 32 },
        actual: () => {
          const r = resizeRect(
            { x: 100, y: 100, w: 160, h: 40 },
            'se',
            { dx: -500, dy: -500 },
            A4,
            'answer.short',
          )
          return { w: r.w, h: r.h }
        },
      },
    ],
  },

  {
    title: '회전된 객체 리사이즈 (PLAN 18.7)',
    note: '핸들의 반대편(앵커)이 화면상 같은 자리에 머물러야 한다. 축 보정만으로는 미끄러진다.',
    cases: [
      {
        name: '회전 0: se 핸들 → 좌상단 고정 (기존 동작 유지)',
        expected: { x: 100, y: 100 },
        actual: () => {
          const r = resizeRect(
            { x: 100, y: 100, w: 200, h: 100 },
            'se',
            { dx: 40, dy: 20 },
            A4,
            'shape',
            {
              rotation: 0,
            },
          )
          return { x: round(r.x), y: round(r.y) }
        },
      },
      {
        name: '90° 회전: se 핸들 → 앵커(nw 코너)가 화면상 그대로',
        expected: true,
        actual: () => {
          const start = { x: 100, y: 100, w: 200, h: 100 }
          const rotation = 90
          // 앵커는 nw 코너. 중심 기준 오프셋을 회전시켜 화면 위치를 구한다.
          const anchorOf = (r: typeof start) => {
            const cx = r.x + r.w / 2
            const cy = r.y + r.h / 2
            const ox = -r.w / 2
            const oy = -r.h / 2
            const rad = (rotation * Math.PI) / 180
            return {
              x: cx + (ox * Math.cos(rad) - oy * Math.sin(rad)),
              y: cy + (ox * Math.sin(rad) + oy * Math.cos(rad)),
            }
          }
          const before = anchorOf(start)
          const next = resizeRect(start, 'se', { dx: 0, dy: 60 }, A4, 'shape', { rotation })
          const after = anchorOf(next)
          // 0.01pt 이내면 같은 자리로 본다.
          return Math.abs(before.x - after.x) < 0.01 && Math.abs(before.y - after.y) < 0.01
        },
      },
      {
        name: '45° 회전: nw 핸들 → 앵커(se 코너)가 화면상 그대로',
        expected: true,
        actual: () => {
          const start = { x: 200, y: 200, w: 160, h: 120 }
          const rotation = 45
          const anchorOf = (r: typeof start) => {
            const cx = r.x + r.w / 2
            const cy = r.y + r.h / 2
            const ox = r.w / 2
            const oy = r.h / 2
            const rad = (rotation * Math.PI) / 180
            return {
              x: cx + (ox * Math.cos(rad) - oy * Math.sin(rad)),
              y: cy + (ox * Math.sin(rad) + oy * Math.cos(rad)),
            }
          }
          const before = anchorOf(start)
          const next = resizeRect(start, 'nw', { dx: -30, dy: -30 }, A4, 'shape', { rotation })
          const after = anchorOf(next)
          return Math.abs(before.x - after.x) < 0.01 && Math.abs(before.y - after.y) < 0.01
        },
      },
      {
        name: '90° 회전: 화면 오른쪽으로 끌면 e 핸들이 높이를 키운다 (델타 역회전)',
        expected: true,
        actual: () => {
          // 90도 돌아간 객체에서 화면 오른쪽(dx>0)은 로컬 아래쪽이다.
          const r = resizeRect(
            { x: 100, y: 100, w: 200, h: 100 },
            'e',
            { dx: 40, dy: 0 },
            A4,
            'shape',
            {
              rotation: 90,
            },
          )
          // 로컬 x축이 화면 y축이므로 폭은 거의 그대로여야 한다.
          return Math.abs(r.w - 200) < 0.01
        },
      },
      {
        name: 'Alt(중심 기준)는 회전과 무관하게 중심 유지',
        expected: { cx: 200, cy: 150 },
        actual: () => {
          const r = resizeRect(
            { x: 100, y: 100, w: 200, h: 100 },
            'se',
            { dx: 20, dy: 20 },
            A4,
            'shape',
            {
              rotation: 30,
              fromCenter: true,
            },
          )
          return { cx: round(r.x + r.w / 2), cy: round(r.y + r.h / 2) }
        },
      },
      {
        name: '회전된 객체는 경계 클램프를 건너뛴다',
        expected: true,
        actual: () => {
          // 회전 상태에서 축 정렬 클램프를 걸면 앵커가 어긋난다. 넘어가도 그대로 둔다.
          const r = resizeRect(
            { x: 10, y: 10, w: 100, h: 100 },
            'nw',
            { dx: -200, dy: -200 },
            A4,
            'shape',
            {
              rotation: 30,
            },
          )
          return r.x < 0 || r.y < 0
        },
      },
    ],
  },

  {
    title: '히트 테스트 · 회전 (PLAN 5.5)',
    note: '포인터를 역회전시켜 축 정렬 사각형과 비교한다.',
    cases: [
      {
        name: '회전 없음: 내부',
        expected: true,
        actual: () =>
          hitTestObject(
            { x: 50, y: 50 },
            {
              id: 'o',
              type: 'mask',
              fill: '#fff',
              rect: { x: 0, y: 0, w: 100, h: 100 },
            },
          ),
      },
      {
        name: '회전 없음: 외부',
        expected: false,
        actual: () =>
          hitTestObject(
            { x: 150, y: 50 },
            {
              id: 'o',
              type: 'mask',
              fill: '#fff',
              rect: { x: 0, y: 0, w: 100, h: 100 },
            },
          ),
      },
      {
        name: '45° 회전: 코너 밖의 점은 미스',
        expected: false,
        actual: () =>
          hitTestObject(
            { x: 8, y: 8 },
            {
              id: 'o',
              type: 'mask',
              fill: '#fff',
              rotation: 45,
              rect: { x: 0, y: 40, w: 100, h: 20 },
            },
          ),
      },
      {
        name: '마퀴: 교차 기준으로 선택',
        expected: 1,
        actual: () =>
          pickObjectsInRect({ x: 90, y: 90, w: 20, h: 20 }, [
            { id: 'a', type: 'mask', fill: '#fff', rect: { x: 0, y: 0, w: 100, h: 100 } },
          ] as PDFCanvasObject[]).length,
      },
      {
        name: '마퀴: 잠긴 객체는 제외',
        expected: 0,
        actual: () =>
          pickObjectsInRect({ x: 0, y: 0, w: 200, h: 200 }, [
            {
              id: 'a',
              type: 'mask',
              fill: '#fff',
              locked: true,
              rect: { x: 0, y: 0, w: 10, h: 10 },
            },
          ] as PDFCanvasObject[]).length,
      },
    ],
  },

  {
    title: '회전 (PLAN 5.5, Q8)',
    note: '12시 방향을 0°로 보는 시계방향 각도. CSS rotate() 와 같은 방향이다.',
    cases: [
      {
        name: '포인터가 위 → 0°',
        expected: 0,
        actual: () => rotationFromPointer({ x: 100, y: 100 }, { x: 100, y: 0 }),
      },
      {
        name: '포인터가 오른쪽 → 90°',
        expected: 90,
        actual: () => rotationFromPointer({ x: 100, y: 100 }, { x: 200, y: 100 }),
      },
      {
        name: '포인터가 아래 → 180°',
        expected: 180,
        actual: () => rotationFromPointer({ x: 100, y: 100 }, { x: 100, y: 200 }),
      },
      {
        name: '포인터가 왼쪽 → 270°',
        expected: 270,
        actual: () => rotationFromPointer({ x: 100, y: 100 }, { x: 0, y: 100 }),
      },
      {
        name: '15° 스냅 (Shift)',
        expected: 45,
        actual: () => rotationFromPointer({ x: 0, y: 0 }, { x: 100, y: -96 }, 15),
      },
      {
        name: '스냅이 360으로 넘어가면 0',
        expected: 0,
        actual: () => rotationFromPointer({ x: 0, y: 0 }, { x: -4, y: -100 }, 15),
      },
    ],
  },

  {
    title: '줌 · 페이지 인덱스 (PLAN 6.4, 6.6)',
    cases: [
      { name: '프리셋 위로', expected: 1.25, actual: () => stepZoom(1, 1) },
      { name: '프리셋 아래로', expected: 0.75, actual: () => stepZoom(1, -1) },
      { name: '프리셋 위 경계', expected: 4, actual: () => stepZoom(4, 1) },
      { name: '배율 클램프 (하한)', expected: 0.25, actual: () => clampScale(0.01) },
      { name: '배율 클램프 (상한)', expected: 4, actual: () => clampScale(99) },
      { name: '페이지 인덱스 클램프', expected: 2, actual: () => clampPageIndex(9, 3) },
      { name: '빈 문서는 -1', expected: -1, actual: () => clampPageIndex(0, 0) },
    ],
  },

  {
    title: '용지 이름 (PLAN 6.7)',
    note: '±3pt 허용. 매칭되지 않으면 raw pt로 떨어진다.',
    cases: [
      {
        name: 'A4 세로',
        expected: 'A4 세로',
        actual: () => formatPaperLabel({ width: 595.28, height: 841.89 }),
      },
      {
        name: 'A4 가로',
        expected: 'A4 가로',
        actual: () => formatPaperLabel({ width: 841.89, height: 595.28 }),
      },
      {
        name: 'A3 세로',
        expected: 'A3 세로',
        actual: () => formatPaperLabel({ width: 841.89, height: 1190.55 }),
      },
      {
        name: 'Letter 세로',
        expected: 'Letter 세로',
        actual: () => formatPaperLabel({ width: 612, height: 792 }),
      },
      {
        name: '비표준 → 사용자 지정',
        expected: '사용자 지정 (395×642pt)',
        actual: () => formatPaperLabel({ width: 395.28, height: 641.89 }),
      },
    ],
  },

  {
    title: '검증 규칙 (PLAN 12)',
    note: '인스펙터 경고와 내보내기 차단이 같은 함수를 쓴다.',
    cases: [
      {
        name: '단답형 정답 없음',
        expected: ['SHORT_NO_ANSWER'],
        actual: () => validateObject(shortBox([])),
      },
      {
        name: '단답형 공백만',
        expected: ['SHORT_NO_ANSWER'],
        actual: () => validateObject(shortBox(['  '])),
      },
      { name: '단답형 정상', expected: [], actual: () => validateObject(shortBox(['서울'])) },
      {
        name: '단답형 50자 초과',
        expected: ['SHORT_ANSWER_TOO_LONG'],
        actual: () => validateObject(shortBox(['a'.repeat(51)])),
      },
      {
        name: '배점 0',
        expected: ['POINTS_INVALID', 'SHORT_NO_ANSWER'],
        actual: () => validateObject(shortBox([], 0)),
      },
      {
        name: '배점 소수',
        expected: ['POINTS_INVALID'],
        actual: () => validateObject(shortBox(['답'], 1.5)),
      },
      {
        name: '드롭박스 보기 부족',
        expected: ['DROPBOX_FEW_CHOICES', 'DROPBOX_NO_CORRECT'],
        actual: () => validateObject(dropboxBox(['하나', ''], [])),
      },
      {
        name: '드롭박스 정답 미지정',
        expected: ['DROPBOX_NO_CORRECT'],
        actual: () => validateObject(dropboxBox(['가', '나'], [])),
      },
      {
        name: '드롭박스 중복 보기',
        expected: ['DROPBOX_DUPLICATE_CHOICE'],
        actual: () => validateObject(dropboxBox(['가', '가'], [0])),
      },
      {
        name: '드롭박스 정상 (복수 정답)',
        expected: [],
        actual: () => validateObject(dropboxBox(['가', '나', '다'], [0, 2])),
      },
      {
        name: '빈 보기가 정답이면 정답 없음으로',
        expected: ['DROPBOX_NO_CORRECT'],
        actual: () => validateObject(dropboxBox(['가', '나', ''], [2])),
      },
      { name: '서술형은 정답 검증 없음', expected: [], actual: () => validateObject(essayBox()) },
    ],
  },

  {
    title: '채점 정규화 (기획 3.3)',
    note: '공백 제거 · 대소문자 무시 · 전각/반각 통일(NFKC).',
    cases: [
      { name: '공백 제거', expected: 'seoul', actual: () => normalizeAnswer(' Se oul ') },
      { name: '줄바꿈·탭도 공백', expected: 'ab', actual: () => normalizeAnswer('a\n\tb') },
      {
        name: '전각 영숫자 → 반각',
        expected: 'abc123',
        actual: () => normalizeAnswer('ＡＢＣ１２３'),
      },
      { name: '한글 유지', expected: '대한민국', actual: () => normalizeAnswer('대한 민국') },
      {
        name: '허용 답안 중 하나와 일치',
        expected: true,
        actual: () => matchesAnyAnswer('SEOUL', ['서울', 'seoul']),
      },
      { name: '빈 답안은 오답', expected: false, actual: () => matchesAnyAnswer('   ', ['서울']) },
      {
        name: '허용 답안에 빈 값이 있어도 오답',
        expected: false,
        actual: () => matchesAnyAnswer('', ['']),
      },
      {
        name: '드롭박스 정확히 일치',
        expected: true,
        actual: () => matchesChoiceSet(['c0', 'c2'], ['c2', 'c0']),
      },
      {
        name: '드롭박스 부분 선택은 오답',
        expected: false,
        actual: () => matchesChoiceSet(['c0'], ['c0', 'c2']),
      },
      {
        name: '드롭박스 초과 선택도 오답',
        expected: false,
        actual: () => matchesChoiceSet(['c0', 'c1', 'c2'], ['c0', 'c2']),
      },
    ],
  },

  {
    title: '채점 (기획 3.3)',
    note: '배점 전액 또는 0. 미채점 서술형은 집계에서 제외된다.',
    cases: [
      {
        name: '단답형 정답 → 배점 전액',
        expected: { score: 3, correct: true, graded: true },
        actual: () => {
          const s = scoreItem(shortBox(['서울'], 3), { type: 'answer.short', value: '서 울' })
          return { score: s.score, correct: s.correct, graded: s.graded }
        },
      },
      {
        name: '단답형 미응답 → 0점',
        expected: { score: 0, correct: false },
        actual: () => {
          const s = scoreItem(shortBox(['서울'], 3), undefined)
          return { score: s.score, correct: s.correct }
        },
      },
      {
        name: '서술형 미채점 → graded false',
        expected: { score: 0, correct: null, graded: false },
        actual: () => {
          const s = scoreItem(essayBox(5), { type: 'answer.essay', value: '답안' })
          return { score: s.score, correct: s.correct, graded: s.graded }
        },
      },
      {
        name: '서술형 정답 지정 → 배점 반영',
        expected: { score: 5, graded: true },
        actual: () => {
          const s = scoreItem(essayBox(5), { type: 'answer.essay', value: '답안' }, 'correct')
          return { score: s.score, graded: s.graded }
        },
      },
      {
        name: '집계: 미채점 서술형은 분모에서 제외',
        expected: { score: 1, gradedPoints: 1, totalPoints: 6, pendingEssays: 1 },
        actual: () => {
          const objs: PDFCanvasObject[] = [shortBox(['가'], 1), essayBox(5)]
          const r = scoreAttempt(objs, { 'short-1': { type: 'answer.short', value: '가' } })
          return {
            score: r.score,
            gradedPoints: r.gradedPoints,
            totalPoints: r.totalPoints,
            pendingEssays: r.pendingEssays,
          }
        },
      },
    ],
  },

  {
    title: '식별자 생성 (PLAN 18.9)',
    note: 'crypto.randomUUID 는 secure context 전용이다. LAN 주소에서는 getRandomValues 폴백을 쓴다.',
    cases: [
      {
        name: 'UUID v4 형식',
        expected: true,
        actual: () =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(createId()),
      },
      {
        name: '1000개 생성해도 중복 없음',
        expected: 1000,
        actual: () => new Set(Array.from({ length: 1000 }, () => createId())).size,
      },
      {
        name: 'randomUUID 가 없어도 같은 형식 (LAN 주소 재현)',
        expected: true,
        actual: () => {
          const holder = crypto as unknown as { randomUUID?: unknown }
          const original = holder.randomUUID
          holder.randomUUID = undefined
          try {
            const ids = Array.from({ length: 200 }, () => createId())
            const valid = ids.every((id) =>
              /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id),
            )
            return valid && new Set(ids).size === ids.length
          } finally {
            // 다른 케이스에 영향을 주지 않도록 반드시 복원한다.
            holder.randomUUID = original
          }
        },
      },
    ],
  },

  {
    title: '박스 색 스타일 (PLAN 18.8)',
    note: '미지정 필드는 CSS로 내보내지 않는다 — 그래야 토큰 기본값이 유지된다. null 은 "투명/없음" 이라는 명시적 지정이다.',
    cases: [
      {
        name: '미지정이면 아무 CSS도 내보내지 않는다',
        expected: {},
        actual: () => boxStyleToCss(undefined),
      },
      {
        name: '배경만 지정',
        expected: { background: '#ff0000' },
        actual: () => boxStyleToCss({ fill: '#ff0000' }),
      },
      {
        name: 'fill: null 은 투명으로 내보낸다 (미지정과 다르다)',
        expected: { background: 'transparent' },
        actual: () => boxStyleToCss({ fill: null }),
      },
      {
        name: '테두리 색을 주면 borderStyle 도 함께 나온다',
        expected: { borderColor: '#00ff00', borderStyle: 'solid', borderWidth: '2px' },
        actual: () => boxStyleToCss({ stroke: '#00ff00', strokeWidth: 2 }),
      },
      {
        name: 'stroke: null 이면 두께와 무관하게 테두리를 그리지 않는다',
        expected: { borderStyle: 'none' },
        actual: () => boxStyleToCss({ stroke: null, strokeWidth: 5 }),
      },
      {
        name: '텍스트 기본 배경은 투명 (defaultFill)',
        expected: { background: 'transparent', color: '#111111' },
        actual: () => boxStyleToCss({ color: '#111111' }, { defaultFill: null }),
      },
      {
        name: 'Answer Box 는 배경 미지정 시 CSS를 내보내지 않는다',
        expected: { color: '#111111' },
        actual: () => boxStyleToCss({ color: '#111111' }),
      },
      {
        name: '병합: 새 필드 추가',
        expected: { fill: '#fff', color: '#000' },
        actual: () => mergeBoxStyle({ fill: '#fff' }, { color: '#000' }),
      },
      {
        name: '병합: undefined 는 필드를 제거한다',
        expected: { color: '#000' },
        actual: () => mergeBoxStyle({ fill: '#fff', color: '#000' }, { fill: undefined }),
      },
      {
        name: '병합: null 은 값으로 유지된다 (제거가 아니다)',
        expected: { fill: null },
        actual: () => mergeBoxStyle({ fill: '#fff' }, { fill: null }),
      },
      {
        name: '병합: 모든 필드가 사라지면 undefined',
        expected: undefined,
        actual: () => mergeBoxStyle({ fill: '#fff' }, { fill: undefined }),
      },
      {
        name: '병합: stroke 를 끄면 두께도 함께 사라진다',
        expected: undefined,
        actual: () =>
          mergeBoxStyle(
            { stroke: '#000', strokeWidth: 3 },
            { stroke: undefined, strokeWidth: undefined },
          ),
      },
      {
        name: '학생용 문서에 스타일이 유지된다 (교사가 맞춘 색을 학생도 본다)',
        expected: '#abcdef',
        actual: () => {
          const box: ShortAnswerBox = { ...shortBox(['a']), style: { fill: '#abcdef' } }
          const doc = createPDFCanvasDoc({ pages: [createPage({ objects: [box] })] })
          const pub = toPublicDoc(doc)
          const obj = pub.pages[0]!.objects[0] as { style?: { fill?: string | null } }
          return obj.style?.fill
        },
      },
    ],
  },

  {
    title: '문항 번호 자동 부여 (PLAN Q9)',
    note: '페이지 순 → 같은 페이지 안에서 위에서 아래, 같은 줄이면 왼쪽에서 오른쪽. 수동 label 우선.',
    cases: [
      {
        name: '한 페이지 위→아래 순서',
        expected: ['1', '2', '3'],
        actual: () => {
          const mk = (id: string, y: number): ShortAnswerBox => ({
            id,
            type: 'answer.short',
            rect: { x: 100, y, w: 80, h: 32 },
            points: 1,
            answers: ['a'],
          })
          const doc = createPDFCanvasDoc({
            pages: [createPage({ objects: [mk('c', 300), mk('a', 100), mk('b', 200)] })],
          })
          return numberQuestions(doc).map((q) => q.display)
        },
      },
      {
        name: '같은 줄이면 왼쪽부터 (y 오차 8pt 안)',
        expected: ['left', 'right'],
        actual: () => {
          const mk = (id: string, x: number, y: number): ShortAnswerBox => ({
            id,
            type: 'answer.short',
            rect: { x, y, w: 80, h: 32 },
            points: 1,
            answers: ['a'],
          })
          const doc = createPDFCanvasDoc({
            // y가 5pt 어긋났지만 같은 줄로 봐야 한다.
            pages: [createPage({ objects: [mk('right', 300, 105), mk('left', 100, 100)] })],
          })
          return numberQuestions(doc).map((q) => q.objectId)
        },
      },
      {
        name: 'y 오차를 넘으면 다른 줄',
        expected: ['upper', 'lower'],
        actual: () => {
          const mk = (id: string, x: number, y: number): ShortAnswerBox => ({
            id,
            type: 'answer.short',
            rect: { x, y, w: 80, h: 32 },
            points: 1,
            answers: ['a'],
          })
          const doc = createPDFCanvasDoc({
            // 20pt 차이면 다른 줄이므로 x가 커도 upper가 먼저다.
            pages: [createPage({ objects: [mk('lower', 100, 130), mk('upper', 300, 100)] })],
          })
          return numberQuestions(doc).map((q) => q.objectId)
        },
      },
      {
        name: '페이지를 넘어 통과 번호',
        expected: [1, 2, 3],
        actual: () => {
          const mk = (id: string): ShortAnswerBox => ({
            id,
            type: 'answer.short',
            rect: { x: 0, y: 0, w: 80, h: 32 },
            points: 1,
            answers: ['a'],
          })
          const doc = createPDFCanvasDoc({
            pages: [
              createPage({ objects: [mk('p1a')] }),
              createPage({ objects: [mk('p2a'), mk('p2b')] }),
            ],
          })
          return numberQuestions(doc).map((q) => q.number)
        },
      },
      {
        name: '수동 label 이 자동 번호를 덮는다',
        expected: [
          { display: '가', manual: true, number: 1 },
          { display: '2', manual: false, number: 2 },
        ],
        actual: () => {
          const doc = createPDFCanvasDoc({
            pages: [
              createPage({
                objects: [
                  { ...shortBox(['a']), id: 'x', label: '가', rect: { x: 0, y: 0, w: 80, h: 32 } },
                  { ...shortBox(['b']), id: 'y', rect: { x: 0, y: 100, w: 80, h: 32 } },
                ],
              }),
            ],
          })
          return numberQuestions(doc).map((q) => ({
            display: q.display,
            manual: q.manual,
            number: q.number,
          }))
        },
      },
      {
        name: '공백만 있는 label 은 수동으로 보지 않는다',
        expected: { display: '1', manual: false },
        actual: () => {
          const doc = createPDFCanvasDoc({
            pages: [createPage({ objects: [{ ...shortBox(['a']), id: 'x', label: '   ' }] })],
          })
          const q = numberQuestions(doc)[0]!
          return { display: q.display, manual: q.manual }
        },
      },
      {
        name: 'Answer Box 가 아닌 객체는 번호에서 제외',
        expected: 1,
        actual: () => {
          const doc = createPDFCanvasDoc({
            pages: [
              createPage({
                objects: [
                  { id: 'm', type: 'mask', fill: '#fff', rect: { x: 0, y: 0, w: 10, h: 10 } },
                  shortBox(['a']),
                ],
              }),
            ],
          })
          return numberQuestions(doc).length
        },
      },
    ],
  },

  {
    title: '학생용 문서 · 직렬화 (PLAN D14, 4.1)',
    note: '정답 필드가 학생 번들에 남으면 안 된다. blob 배경은 저장을 거부한다.',
    cases: [
      {
        name: 'toPublicDoc 후 정답 필드 부재',
        expected: [],
        actual: () => {
          const doc = createPDFCanvasDoc({
            pages: [
              createPage({
                objects: [shortBox(['정답']), dropboxBox(['가', '나'], [0]), essayBox()],
              }),
            ],
          })
          return findAnswerFieldPaths(toPublicDoc(doc))
        },
      },
      {
        name: '원본에는 정답 필드가 있다 (대조군)',
        expected: 3,
        actual: () => {
          const doc = createPDFCanvasDoc({
            pages: [
              createPage({
                objects: [shortBox(['정답']), dropboxBox(['가', '나'], [0]), essayBox()],
              }),
            ],
          })
          return findAnswerFieldPaths(doc).length
        },
      },
      {
        name: 'blob 배경 직렬화 → 에러',
        expected: 'BlobBackgroundError',
        actual: () => {
          const doc = createPDFCanvasDoc({
            pages: [
              createPage({
                background: {
                  kind: 'image',
                  url: 'blob:http://x/1',
                  origin: 'blob',
                  naturalWidth: 100,
                  naturalHeight: 100,
                  renderScale: 1,
                },
              }),
            ],
          })
          try {
            serializeDoc(doc)
            return 'no error'
          } catch (e) {
            return e instanceof Error ? e.name : 'unknown'
          }
        },
      },
      {
        name: 'remote 배경은 직렬화 가능',
        expected: true,
        actual: () => {
          const doc = createPDFCanvasDoc({
            pages: [
              createPage({
                background: {
                  kind: 'image',
                  url: 'https://cdn/1.jpg',
                  origin: 'remote',
                  assetId: 'a1',
                  naturalWidth: 100,
                  naturalHeight: 100,
                  renderScale: 1,
                },
              }),
            ],
          })
          return serializeDoc(doc).length > 0
        },
      },
    ],
  },
]
