/**
 * 문서 단위 커맨드. 타이틀 처리.
 */
import { LIMITS } from '../config/defaults'
import { UNTITLED_TITLE } from '../model/defaults'
import type { PDFCanvasDoc } from '../model/types'
import { touch, type Command } from './index'

/**
 * 수동 편집으로 타이틀을 설정한다.
 *
 * 공백만 입력하면 상단 바를 비워 두는 대신 기본값을 복원한다 (기획 4.3).
 * `titleTouched` 를 세워 아래의 자동 명명 규칙을 영구히 끈다 — 워크시트에 이름을 붙인 편집기의
 * 타이틀이 다음 업로드에 덮여서는 안 된다.
 */
export function setTitle(raw: string): Command {
  return (doc) => {
    const trimmed = raw.trim()
    const title = trimmed.length === 0 ? UNTITLED_TITLE : raw.slice(0, LIMITS.titleChars)
    if (title === doc.title && doc.titleTouched) return null
    return touch({ ...doc, title, titleTouched: true })
  }
}

/**
 * 첫 업로드 파일명으로 워크시트 이름을 정한다 (기획 4.2).
 *
 * 사용자가 타이틀을 손으로 고친 뒤에는 동작하지 않고, 이후 업로드에도 동작하지 않는다.
 * 확장자를 떼는 이유는 이 타이틀이 파일명이 아니라 사람에게 보이는 이름이기 때문이다.
 */
export function applyFileNameToTitle(fileName: string): Command {
  return (doc) => {
    if (doc.titleTouched) return null
    const base = fileName.replace(/\.[^.]+$/, '').trim()
    if (base.length === 0) return null
    const title = base.slice(0, LIMITS.titleChars)
    if (title === doc.title) return null
    // titleTouched는 false로 남긴다. 이번은 자동이므로, *이후*의 수동 편집이 여전히
    // 첫 수동 편집이다.
    return touch({ ...doc, title })
  }
}

/** 문서 전체를 교체한다. 저장소에서 불러온 직후 등. */
export function replaceDoc(next: PDFCanvasDoc): Command {
  return () => next
}
