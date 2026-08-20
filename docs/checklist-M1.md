# M1 체크리스트 — PDF → 페이지 이미지 배열

자동 테스트 러너가 없으므로(PLAN D17) 머지 전에 손으로 확인한다.
`npm run dev` → http://localhost:3100/spike/

## 준비
- [ ] `npm run fixtures` 로 픽스처 7개 생성 (`korean.pdf` 는 Chrome 필요)
- [ ] `npm run copy:pdfjs` 로 `demo/public/pdfjs/{cmaps,standard_fonts,wasm,iccs}` 존재
- [ ] `npm run typecheck` · `npm run lint` 통과

## 페이지 크기 (PLAN D7)
- [ ] `mixed-size.pdf` — 6페이지가 각자 비율. 표에 6가지 서로 다른 pt 크기
- [ ] 용지명이 `A4 세로` / `A3 세로` / `A5 세로` / `Letter 가로` / `Legal 세로` / `A4 가로`
- [ ] `rotated-90.pdf` — Rotate 90/270 페이지가 `842 × 595` (가로)
- [ ] `cropbox.pdf` — 크기 `395.28 × 641.89`, 화면에 `INSIDE CROPBOX` 만 보이고 빨간 `OUTSIDE` 는 안 보임

## 성능·용량 (PLAN 16)
- [ ] `large-100page.pdf` — 3초 이내 (기준 실측 1.72초)
- [ ] 이미지 용량 표시가 페이지당 300~450KB 범위
- [ ] `?targetPx=1240` 으로 낮추면 소요·용량이 함께 감소

## 실패 경로 (기획 2.4)
- [ ] `corrupt.pdf` — `실패 [corrupt]` 표시, 페이지 렌더 없음
- [ ] 지원 외 포맷(예: `.txt`) 드롭 — `실패 [unsupported-format]`
- [ ] 변환 중 [취소] — `실패 [aborted]`

## 폰트·텍스트 (ARCHITECTURE §4)
- [ ] `korean.pdf` — 한글이 이미지에 보인다
- [ ] 진단 패널에 문자 수 > 0, 폰트 목록에 `AppleGothic` 계열
- [ ] `?resources=off` 비교 — 이 파일은 `Identity-H` 라 **차이가 없어야** 정상
- [ ] `?fontface=off` — 렌더는 되지만 잉크가 약간 줄어든다

## predefined CMap — 실제 교재로만 확인 가능 (ARCHITECTURE §4.4)
합성 픽스처는 `Identity-H` 라 이 경로를 재현하지 못한다.
한국어 교재 PDF(`KSCms-UHC-H` 등)를 직접 올려서 확인한다.
- [ ] 기본 설정에서 한글이 렌더된다
- [ ] `?resources=off` 로 열면 글자가 사라지고 진단에 `missing-cmap` 이 뜬다
- [ ] 진단 패널의 텍스트 문자 수가 두 경우에 크게 달라진다 (예: 568자 → 21자)

## 좌표계 불변 (PLAN 5.7)
- [ ] `?targetPx=800` 과 `?targetPx=1654` 에서 **pt 크기 표시가 동일**
      (해상도가 좌표에 영향을 주지 않는다는 확인)

## 메모리
- [ ] `large-100page.pdf` 변환 후 `live blob URLs = 100`
- [ ] 다른 파일로 재변환 후에도 숫자가 무한히 늘지 않는다
