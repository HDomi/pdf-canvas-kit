# `src/prototype/` — 임시 코드

⚠️ **이 디렉토리는 실서버가 붙으면 통째로 삭제한다.**

실제 저장·업로드 경로가 아직 없어서 프로토타입 확인용으로 만든 코드다. 라이브러리 본체와 섞이지
않도록 분리해 두었으니, 들어낼 때는 다음 세 곳만 건드리면 된다.

1. 이 디렉토리 삭제
2. `src/index.ts` 의 "프로토타입" 블록 삭제
3. `WorksheetEditor.vue` 의 `manual-save` 를 `export` 로 되돌리고
   `TopBar.vue` 의 버튼을 [내보내기] 로 복원

## localStorage 저장 (`localStorageStore.ts`)

| 키 | 내용 |
| --- | --- |
| `IMAGES` | `{ [assetId]: base64 data URL }` — 페이지 배경 이미지 |
| `SAVED_DOC` | 문서 JSON. 배경 `url` 은 `local:<assetId>` 참조로 바뀐다 |

Viewer가 두 키를 읽어 `local:` 참조를 `IMAGES` 의 base64로 되돌려 조합한다.

**localStorage 용량 한계가 실질적 제약이다.** 브라우저는 오리진당 5~10MB만 준다.
1654px JPEG 한 페이지가 약 400KB이고 base64는 +33% 팽창하므로 **약 9~18페이지에서 한계에 닿는다.**
초과하면 `QuotaExceededError` 를 그대로 던진다 — 조용히 잘라내면 나중에 없는 페이지를 찾게 된다.

이것이 PLAN Q11에서 S3를 택한 이유이기도 하다. 실제 제품이 이 방식으로 갈 수는 없다.
