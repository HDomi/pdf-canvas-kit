# TODO

앞으로 할 일. **끝난 것은 지운다** — 완료 목록을 쌓으면 남은 일이 묻힌다.

날짜는 절대 표기. 근거가 있는 항목에는 왜 그렇게 판단했는지 함께 적는다.

---

## 배포

- [ ] **`0.1.0-beta.1` 배포** — `./publish.sh 0.1.0-beta.1`
  - prerelease 라 `next` 태그로 올라간다. `latest` 를 건드리지 않으므로 소비자가 실수로
    받지 않는다 — 실제 앱에 붙여 본 것이 `examples/` 뿐이라 그렇게 시작한다
  - [ ] 배포 후: 빈 프로젝트에서 `npm i @h_domi/pdf-canvas-kit@next` 로 registry 경로 확인
    (`file:` 프로토콜과 tarball 해석이 같지만 **동일하다고 단정하지 않았다**)
  - [ ] beta 로 실제 앱을 한 번 만들어 본 뒤 `0.1.0` (latest) 로 승격
- [ ] **npm publish** — `./publish.sh` 로 한다 (gitignore 대상. `DRY_RUN=1` 로 먼저 확인)
  - 인증: `.env` 에 `NPM_TOKEN`(granular, **Bypass 2FA 체크**) 또는 2FA + OTP.
    npm 이 2024 부터 publish 에 2FA 를 의무화했다 — 둘 중 하나가 없으면 403 이다.
    `.env.example` 을 복사해 채운다
  - scoped 패키지라 `publishConfig.access = "public"` 이 필수다
  - ⚠️ `verify:tarball` 을 `prepublishOnly` 에 넣지 않는다 — `publish → prepublishOnly →
    pack → prepare` 로 npm 이 재귀 실행되며 출력이 섞인다. `publish.sh` 가 publish 전에 부른다
  - tarball 을 실제 React·Vue 앱에 설치해 검증했다 (`examples/*` 가 그 경로를 계속 지킨다)
  - registry 설치는 `file:` 프로토콜과 tarball 해석이 같지만 **동일하다고 단정하지 않았다** —
    첫 배포 후 빈 프로젝트에서 `npm i @h_domi/pdf-canvas-kit` 로 한 번 확인한다
- [x] **GitHub Pages 로 예제 배포** — `.github/workflows/pages.yml`
  - 데모(`/`) + React 예제(`/react/`) + Vue 예제(`/vue/`)를 한 사이트로 합친다
  - base 는 `PAGES_BASE` 환경변수로 주고 앱이 `import.meta.env.BASE_URL` 로 읽는다.
    로컬에서 서브패스로 서빙해 라우트 7개·자산·번들 치환을 확인했다
  - [ ] **실제 Actions 실행 확인** — 로컬 재현은 됐지만 CI 에서 돌려 보지 않았다
- [ ] CHANGELOG 시작 — 0.1.0 부터

## 브라우저 확인이 남은 것

헤드리스(happy-dom)에는 레이아웃·포커스·캐스케이드 레이어가 없어 **원리적으로** 덮이지 않는다.

- [ ] `@layer` 오버라이드가 실제로 이기는지 — 예제의 [테마 ON/OFF] 로 확인. 빌드 구조만 검사했다
- [ ] 375px 폭에서 뷰어에 가로 스크롤이 없는지
- [ ] `ResizeObserver` 발화 · `scrollIntoView` 위치
- [ ] 뷰어 응답 폼의 한글 IME
- [ ] 호스트 모달로 실제 업로드·페이지 삭제가 되는지
- [ ] `importFile()` 로 CJK PDF 를 열었을 때 글자가 보이는지 (cMapUrl 경로 검증)

## 기능

- [ ] 자동저장 실서버 연결 — 지금은 `createConsoleStoragePort` 로 파이프라인만 돈다
- [ ] 상단바 [내보내기] 버튼 복원 — 검증 게이트는 `EditorHandle` 에 이미 있고 버튼만 없다

## 검토 대기

- [ ] 크롬 UI 슬롯 — 토큰·`@layer`·다이얼로그 위임으로 실제 수요가 해결됐다. 구조가 다른 UI 를
      넣어야 하는 요구가 실제로 오면 그때 만든다. 조각 props 가 전부 `ReadSignal<T>` 라
      스냅샷 타입 + 구독 배선이 조각마다 필요하다
- [ ] 문구·아이콘의 인스턴스 스코프 — 지금은 전역 병합이라 한 페이지에 언어가 다른 편집기
      둘을 지원하지 않는다. 렌더 층 14개 파일(~80 호출)에 `t` 를 흘려야 한다
