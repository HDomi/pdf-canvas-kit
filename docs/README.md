# 문서

`@h_domi/pdf-canvas-kit` 사용 설명서. 설계 근거와 내부 구조는 ARCHITECTURE.md ·
[ARCHITECTURE.md](../ARCHITECTURE.md)에 있다.

## 처음이라면

| | |
| --- | --- |
| [시작하기](01-getting-started.md) | 설치, **pdf.js 자산**(필수), 높이·폭 함정 |
| [React](02-react.md) | `PDFCanvasEditor` · `PDFCanvasViewer`, ref, StrictMode |
| [Vue](03-vue.md) | 같은 것 + `expose` 타입 주의 |
| [프레임워크 없이](04-vanilla.md) | `createPDFCanvasEditor` facade |

## 기능

| | |
| --- | --- |
| [커스텀 객체](05-custom-objects.md) | PDF 위에 **내 컴포넌트**를 올린다 |
| [뷰어](06-viewer.md) | 읽기 전용 렌더 + 응답 받기 |
| [저장 · 업로드](07-storage.md) | `AssetPort` · `StoragePort` · 자동저장 |
| [내보내기](08-export.md) | 검증 게이트 + 정답 제거 |

## 내 앱에 맞추기

| | |
| --- | --- |
| [스타일 오버라이드](09-styling.md) | 토큰 75개 + **`@layer`** — 특이도 싸움이 없다 |
| [문구 · 번역](10-strings.md) | 모든 UI 문구를 prop 으로 |
| [아이콘](11-icons.md) | 글리프 · SVG · **프레임워크 컴포넌트** 3경로 |
| [다이얼로그 위임](12-dialogs.md) | 우리 팝업을 안 쓰고 **내 모달**을 쓴다 |
| [호스트 앱에 녹이기](15-integration.md) | 단축키 충돌 · 예외 잡기 · 이탈 확인 · 다크 모드 |

## 참고

| | |
| --- | --- |
| [API 레퍼런스](13-api.md) | prop · handle · 타입 전체 |
| [함정 모음](14-pitfalls.md) | 실제로 겪은 문제와 원인 |
| [TODO](TODO.md) | 남은 일 |

## 동작하는 예제

레포에 소비자 앱 두 개가 있다. **별칭 없이** 설치된 `dist` 를 쓰므로 실제 환경과 같다.

```bash
npm install
npm run dev
# :3100 데모(레포 소스) :3101 React 예제 :3102 Vue 예제
```

- [examples/react](../examples/react) — 단일 파일 아님. `components/` `slots/` `theme.css` 로 나뉘어 있다
- [examples/vue](../examples/vue) — 같은 구조의 SFC 판

두 예제가 **커스터마이징 셋을 동시에** 보여준다. 상단 [테마 ON/OFF] 버튼이 `@layer`
오버라이드를 눈으로 확인하는 장치다.
