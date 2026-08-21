# TODO

앞으로 할 일. **끝난 것은 지운다** — 완료 목록을 쌓으면 남은 일이 묻힌다.

날짜는 절대 표기. 근거가 있는 항목에는 왜 그렇게 판단했는지 함께 적는다.

---

## 배포

- [x] `0.1.0-beta.1` **배포** — `./publish.sh 0.1.0-beta.1`
  - prerelease 라 `next` 태그로 올라간다. `latest` 를 건드리지 않으므로 소비자가 실수로
  받지 않는다 — 실제 앱에 붙여 본 것이 `examples/` 뿐이라 그렇게 시작한다
  - [x] 배포 후: 빈 프로젝트에서 `npm i @h_domi/pdf-canvas-kit@next` 로 registry 경로 확인
    (`file:` 프로토콜과 tarball 해석이 같지만 **동일하다고 단정하지 않았다**)
  - [x] beta 로 실제 앱을 한 번 만들어 본 뒤 `0.1.0` (latest) 로 승격
- [x] **npm publish** — `./publish.sh` 로 한다 (gitignore 대상. `DRY_RUN=1` 로 먼저 확인)
  - 인증: `.env` 에 `NPM_TOKEN`(granular, **Bypass 2FA 체크**) 또는 2FA + OTP.
  npm 이 2024 부터 publish 에 2FA 를 의무화했다 — 둘 중 하나가 없으면 403 이다.
  `.env.example` 을 복사해 채운다
  - scoped 패키지라 `publishConfig.access = "public"` 이 필수다
  - ⚠️ `verify:tarball` 을 `prepublishOnly` 에 넣지 않는다 — `publish → prepublishOnly → pack → prepare` 로 npm 이 재귀 실행되며 출력이 섞인다. `publish.sh` 가 publish 전에 부른다
  - tarball 을 실제 React·Vue 앱에 설치해 검증했다 (`examples/*` 가 그 경로를 계속 지킨다)
  - registry 설치는 `file:` 프로토콜과 tarball 해석이 같지만 **동일하다고 단정하지 않았다** —
  첫 배포 후 빈 프로젝트에서 `npm i @h_domi/pdf-canvas-kit` 로 한 번 확인한다
- [x] **GitHub Pages 로 예제 배포** — `.github/workflows/pages.yml`
  - 데모(`/`) + React 예제(`/react/`) + Vue 예제(`/vue/`)를 한 사이트로 합친다
  - base 는 `PAGES_BASE` 환경변수로 주고 앱이 `import.meta.env.BASE_URL` 로 읽는다.
  로컬에서 서브패스로 서빙해 라우트 7개·자산·번들 치환을 확인했다
  - [x] **실제 Actions 실행 확인** — 로컬 재현은 됐지만 CI 에서 돌려 보지 않았다
- [ ] CHANGELOG 시작 — 0.1.0 부터. **파일이 아직 없다** (2026.08.21 확인)
- [x] `0.1.0-beta.2` 배포
- [x] `0.1.0-beta.3` 배포
- [ ] **`0.1.0-beta.4` 배포** — `./publish.sh 0.1.0-beta.3`
  - beta.3 에 없는 것: 휠 줌 감도(1.0015 → 1.0025) + **deltaMode 정규화**
  (Firefox 에서 줌이 거의 안 움직였다), publish 를 항상 latest 태그로,
  **선택 테두리를 핸들과 같은 사각형으로**, **Vue 래퍼의 D33 prop 누락**,
  `ErrorContext` · `UploadFile` export 누락, 죽은 문구 26개 제거(파괴적)
  - ⚠️ `publish.sh` 가 이제 prerelease 도 **latest** 로 올린다. `npm i <pkg>` 기본 설치가
  베타가 된다 — 지금은 베타가 곧 최신이라 그게 맞다
  - beta.2 에 없는 것: **폼 컨트롤 색 명시**(§22 — 다크 모드에서 버튼 글자가 사라졌다),
  선 계열 도형의 박스 정규화(§21.1.1), 핸들 시각·위치 재작업(§3.2), **종이 위 레이어를
  다크 모드에서 분리**, 뷰어 커스텀 객체 틀의 미정의 토큰 수정



## 브라우저 확인이 남은 것

헤드리스(happy-dom)에는 레이아웃·포커스·캐스케이드 레이어가 없어 **원리적으로** 덮이지 않는다.

- [ ] `@layer` 오버라이드가 실제로 이기는지 — 예제의 [테마 ON/OFF] 로 확인. 빌드 구조만 검사했다
- [ ] 375px 폭에서 뷰어에 가로 스크롤이 없는지
- [ ] `align-items: safe center` 가 실제로 먹는지 — Safari 지원이 비교적 최근이라
  앞줄 `center` 폴백만 확인했다
- [ ] 인스펙터 [모양] 11개 버튼의 줄바꿈 모양 (`gap` 구분선). 폭 280px 기준 8 + 3 예상
- [ ] `⬠`(U+2B20) · `⬡`(U+2B21) 글리프가 두부(□)로 보이지 않는지 — 환경 의존이라
  문구로 열어 두었지만 기본값이 쓸 만한지는 봐야 한다
- [ ] 글꼴을 바꿨을 때 캔버스 텍스트가 실제로 바뀌는지 (예제가 Google Fonts 를 받는다)
- [ ] **OS 다크 모드에서 버튼 글자가 보이는지** — §22 의 수정. 구조 검사(verify:tarball)만 했다
- [ ] 얇은 화살표(높이 4pt)를 마우스로 집을 수 있는지 — 히트 여유 8pt 가 실제로 충분한지
- [ ] 얇아진 박스에서 리사이즈 핸들 8개가 겹쳐 보이지 않는지 (outset 10px 로 벌렸다)
- [ ] 휠 줌 감도가 실제로 적당한지 — 눈으로 고른 값이다. 마우스 휠 한 틱이 22% 라 클 수도
  있다 (`EDITOR_DEFAULTS.zoom.wheelFactor`)
- [ ] Firefox 에서 휠 줌이 움직이는지 — `deltaMode: LINE` 정규화. 케이스로만 고정했다
- [ ] 핸들이 흰 사각형 + 파란 테두리로 보이는지 — `box-shadow: inset` 이 padding-box 기준이라는
  전제에 의존한다. 구조만 확인했다
- [ ] 얇은 선의 **본체**를 잡아 드래그할 수 있는지 (핸들 히트가 본체를 안 덮는지)
- [ ] 선택 테두리가 도형 테두리와 떨어져 보이는지 — 도형 색이 가려지지 않아야 한다
- [ ] Vue 예제에서 `:shortcuts="false"` · `:warn-on-unload="false"` · `:on-error` 가 먹는지
  (순수 함수는 케이스로 고정했지만 컴포넌트를 통한 경로는 브라우저에서만 확인된다)
- [ ] 핸들이 밖으로 나가면서 옆 객체를 가리는 정도가 실제로 견딜 만한지
- [ ] `ResizeObserver` 발화 · `scrollIntoView` 위치
- [ ] 뷰어 응답 폼의 한글 IME
- [ ] 호스트 모달로 실제 업로드·페이지 삭제가 되는지
- [ ] `importFile()` 로 CJK PDF 를 열었을 때 글자가 보이는지 (cMapUrl 경로 검증)



## 기능

- [ ] 도형 `dash`(점선) UI — 모델에는 이미 있고 인스펙터에만 없다
- [ ] 텍스트 `italic` · `underline` · `lineHeight` UI — 같은 상황이다
- [ ] 자동저장 실서버 연결 — 지금은 `createConsoleStoragePort` 로 파이프라인만 돈다
- [ ] 상단바 [내보내기] 버튼 복원 — 검증 게이트는 `EditorHandle` 에 이미 있고 버튼만 없다



## 검토 대기

- [ ] 크롬 UI 슬롯 — 토큰·`@layer`·다이얼로그 위임으로 실제 수요가 해결됐다. 구조가 다른 UI 를
  ```
  넣어야 하는 요구가 실제로 오면 그때 만든다. 조각 props 가 전부 `ReadSignal<T>` 라
  스냅샷 타입 + 구독 배선이 조각마다 필요하다
  ```
- [ ] 문구·아이콘의 인스턴스 스코프 — 지금은 전역 병합이라 한 페이지에 언어가 다른 편집기
  ```
  둘을 지원하지 않는다. 렌더 층 14개 파일(~80 호출)에 `t` 를 흘려야 한다
  ```

