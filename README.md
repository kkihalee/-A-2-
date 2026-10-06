# 말결 프로젝트
### **By AI, As a Team, Solve Important problems.**

#### **팀 미션 : 바이브코딩으로 우리 조 앱 만들기**

- 코딩을 몰라도 괜찮아요 !
AI와 대화하며 동기들과 함께 실제로 작동하는 가벼운 웹앱 하나를 만드는 미션입니다.

모든 앱은 **Claude** 로 만드는 **3~5화면짜리 웹앱**입니다.
설치 없이 링크로 바로 열리고, **1~2분 안에 시연할 수 있을 만큼 가벼워야 합니다.**
(발표 당일 300~400명이 동시에 접속이 필요합니다.)

---

## 말결 개발 현황

### 배포
- **제출 링크: https://malgyeol-neon.vercel.app/** (팀 저장소 `origin`의 main 기준)
- 개인 확인용: https://malgyeoll.vercel.app/ (개인 저장소 `mine`의 main · 제출과 관계없음)

### 만드는 방식
- **외부 AI API 사용 안 함.** 샘플 데이터와 규칙 기반 엔진으로 동작하고, Claude와 협업해 개발했다. (10/06 운영진 안내 · `docs/decision-log.md`)

### 기준 문서 (충돌하면 위에 있는 것을 따른다 · `CLAUDE.md` 우선순위와 같음)
1. 코딩 레퍼런스 2장 design: `docs/content/말결_코딩레퍼런스.md` — 화면·컴포넌트·색·문구·메시지 생성 규칙
2. 코딩 레퍼런스 4장 카드 데이터: `data/cards.json` — 카드 3개의 입력 항목, placeholder, 되묻기 문구, 받는 사람, 말투 옵션, UI 문구 (레퍼런스 4장 JSON을 그대로 옮긴 파일)
3. 샘플 데이터: `data/malgyeol_sample_data.json` — 카드별 10건, 총 30건 (테스트·시연용 가짜 데이터)
4. UI 레퍼런스 수집자료(이은서) — PDF 원본은 저장소에 올리지 않음
- 작업 규칙: `CLAUDE.md` (코딩 레퍼런스 1장 '프로젝트 지침'과 같은 내용)
- 참고(이전 기준): `docs/말결_기획안_v1.1.md`, `docs/design/wireframe.png`, `docs/말결_STEP1_기획서.md` — 위 1~4와 다르면 위를 따른다
- 결정 기록: `docs/decision-log.md` / 작업 프롬프트 기록: `docs/prompts/`

### 현재 구현 (2026-10-05 · 콘텐츠팀 코딩 레퍼런스 기준)
- 화면 4개: 홈 → 구조화 확인 → 결과 → 내 말투 (10/04 앱 화면 · 상단 헤더 · 주황색)
- **화면 문구·카드·칸·받는 사람·버전 탭·온보딩·말투 옵션은 `data/cards.json`에서 읽어 그린다.** 문구는 코드가 아니라 cards.json에서 고친다
  - 카드 3개(질문 준비실 · 부탁 한 장 · 한 줄 상황보고), 홈은 질문 준비실이 선택된 상태로 시작하고 카드를 바꾸면 입력창 예시도 바뀐다
  - 받는 사람 4종: 선배 · 인차지 · 동기 · 클라이언트(호칭 "담당자님", 말투 설정과 관계없이 가장 격식 있는 합니다체 · B4)
  - 빈 **필수** 칸만 노란 칸 + 되묻기 질문(cards.json `followUp`)
- 구조화(엔진 호출 1): 한 줄이 샘플 30건 중 하나와 같거나 비슷하면 그 샘플에서 한 줄로 알 수 있는 칸만 채운다. 비슷한 샘플이 없으면 연결어(~했는데·~인데·~지만·~해서·~인지)로 나눠 상황·막힌 지점·묻고 싶은 것 등에 배치한다. 모르는 칸은 비워서 노란 칸으로 되묻는다(지어내지 않음). 시연 한 줄("재고평가충당금…")은 상황만 채워지고 해본 것·막힌 지점·내 판단·묻고 싶은 것이 노란 칸으로 나온다
- 메시지 생성(엔진 호출 2): 칸 값 모양(완성 문장·질문·명사구·메모체·"~지"형)에 맞는 문장 틀 → 받는 사람별 호칭·순서 → 메시지 한 통 = 문체 하나로 끝맺음 통일 → 맞춤법·띄어쓰기·존댓말 1인칭(저/제) 다듬기. 탭 3종(내 말투안 · 더 간결하게 · 더 부드럽게)과 의도 체크 근거 구절·수정 이유를 함께 만든다
- [다시 만들기]: 칸 내용은 그대로 두고 인사·연결어·끝인사 조합만 바꾼다 (누를 때마다 다른 조합)
- 말투 저장: `malgyeol.profile` = { sentenceLength, requestStyle, ending, avoidPhrases, preferredExamples, onboarded } (코딩 레퍼런스 2장 8절). 예전 형식 값은 처음 열 때 자동으로 옮긴다
- 다시 적용한 개선: 본문·입력 16px, 모바일 안전 영역·확대 방지, 피하고 싶은 표현을 앱이 붙이는 문장에서 빼기, `?review` 바 겹침 방지, 내 말투 → [← 결과로 돌아가기], 결과 본문 높이 자동 맞춤
- 반응형 레이아웃 (10/04 iPhone Safari, 카카오톡 인앱 브라우저에서 확인 완료 · 10/05 변경 후 모바일 재확인 필요)

### 남은 수정 요청 · 디자인
- 코딩 레퍼런스 5장: B1~B4·B5(복사 버튼 "✓ 복사됐어요")·B8(`?review` 바 숨김) 반영. B6(△ 근거 강조)·B7(진행 단계 표시)은 미반영
- 디자인: 메인 색 주황 #FD5108(삼일 상징색 · 사용자 결정) · Pretendard · 최대 폭 480px · 주 버튼 52px · 본문·입력 16px (색 외에는 코딩 레퍼런스 2장 디자인 토큰)

### 데이터 반영 위치
- `data/cards.json`: 카드·입력 칸·placeholder·되묻기 문구·받는 사람·버전 탭·온보딩·말투 옵션·화면 문구(uiCopy). **문구는 여기서 고친다.**
- `data/malgyeol_sample_data.json`: 샘플 30건 (구조화가 같은·비슷한 샘플을 찾을 때 참고)
- `engine.js`: 문장 정리 엔진 로직 (structurize · generateMessages)
- `content.js`: 엔진이 쓰는 규칙 데이터(문장 틀, [다시 만들기] 후보, 받는 사람별 인사 방식, 끝인사, 끝맺음 변환 표, 맞춤법 다듬기 표)와 cards.json에 없는 토스트·오류 문구. 수정 이유 문구는 cards.json `reasons`
- `index.html`: cards.json에 없는 문구 몇 개('말투 설정' 제목·안내, '피하고 싶은 표현' 라벨, '마음에 든 문장' 제목, '← 결과로 돌아가기')
- 이름이 서로 어긋나면 브라우저 콘솔(`Cmd+Option+I` / Windows `F12`)에 `[cards.json]` 또는 `[content.js]` 오류가 뜹니다.

### 내 PC에서 확인하기 (설치 없이)
앱이 `data/cards.json`을 읽어 화면을 그리기 때문에 **index.html을 더블클릭해서 열면 화면이 뜨지 않습니다**(브라우저가 파일 읽기를 막음 · 안내 문구가 대신 보임). 아래 중 하나로 여세요. 새 npm 패키지는 필요 없습니다.
- **Python (Windows · Mac 기본)**: 프로젝트 폴더에서 아래 명령을 실행한 뒤 브라우저로 `http://localhost:8000` 을 엽니다. 끝낼 때는 터미널에서 `Ctrl+C`.
  - Windows: `py -m http.server 8000`
  - Mac: `python3 -m http.server 8000`
- **VS Code Live Server 확장**: VS Code에서 index.html을 열고 오른쪽 아래 **Go Live**를 누릅니다.
- 화면 바로가기를 보려면 주소 뒤에 `?review`를 붙입니다. 예: `http://localhost:8000/?review`

### 메시지 자동 점검 (엔진 문장 품질)
- 위 '내 PC에서 확인하기'처럼 로컬 서버를 켠 뒤 브라우저로 `http://localhost:8000/scripts/qa.html` 을 엽니다. (Node 없이 브라우저에서 `engine.js`를 그대로 돌림)
- 샘플 30건 + 오류 사례 8개를 받는 사람 4종 × 끝맺음 2종 × 요청 방식 3종 × [다시 만들기] 조합 3가지(+피하고 싶은 표현)로 만들어 B1·B2·B3, 받는 사람 규칙, 문법 깨짐, 말투 혼합, 마스킹, 의도 체크 근거, 피하고 싶은 표현을 셉니다. 아래쪽에 대표 결과(q01·q03·r02·r05·s01·s05) 문장도 보여 줍니다.
- 최신 결과: `docs/qa/check-20261006-neon.md` (메시지 8,322개 · 문제 0건)
- **회귀 테스트** `http://localhost:8000/scripts/regression.html`: 팀원 피드백 케이스 10개를 실제 엔진으로 돌려 PASS/FAIL 표를 보여 줍니다. 결과 기록: `docs/qa/regression-20261007-before.md` → `-after.md` (0 / 10 → 10 / 10)
- 결과는 화면의 [결과 .md 내려받기]로 받아 `docs/qa/check-YYYYMMDD-before.md` / `-after.md` 로 저장합니다. 점검 기준(패턴 목록)은 `scripts/check-messages.js` 맨 위에 있습니다.
- 결과 기록: `docs/qa/check-20261005-before.md`(고치기 전) · `docs/qa/check-20261005-after.md`(고친 뒤, 비교표 포함)
- 같은 페이지 아래쪽에 '문체 점검'(메시지 한 통 = 문체 하나 · 변환 못 한 끝맺음 목록)도 나옵니다. 결과 기록: `docs/qa/tone-20261005-before.md` · `-after.md`. 끝맺음 변환 표는 `content.js`의 `TONE_TABLE`

### 내부 리뷰용 화면 바로가기
- 주소 뒤에 `?review`를 붙일 때만 화면 아래에 화면 바로가기가 나타납니다. 예: `https://malgyeol-neon.vercel.app/?review` (심사용 링크에는 안 보임)
- 주소에 `?review`가 없으면 바는 보이지 않습니다(B8). 완전히 없애려면 `review.js`, `review.css`를 지우고 `index.html`의 관련 3줄(`<link>`, `<nav>`, `<script>`)을 지웁니다.

### 남은 작업
1. 모바일 추가 점검 (iPhone Safari · Android Chrome · 카카오톡 인앱)
2. 발표용 시연 리허설 (코딩 레퍼런스 7절 · 2분 이내)
3. 제출: 팀 저장소 main 병합 후 https://malgyeol-neon.vercel.app/ 확인 (마감 10/8(목) 오전 11시)

### 개발 방식
VS Code + Claude Code (외부 AI API 없이 Claude와 협업해 규칙 기반 엔진을 개발)

### 저장소 2개와 작업 순서
| 이름 | 주소 | 용도 |
|---|---|---|
| `mine` | https://github.com/dohyun94932-pixel/Malgyeol | 개인 저장소 · 평소 작업과 확인용 |
| `origin` | https://github.com/kkihalee/-A-2- | 팀 저장소 · **요청할 때만** 올린다 |

1. 작업은 항상 브랜치에서 한다. (예: `git switch -c feature/작업이름`)
2. 확인하고 싶으면 그 브랜치를 `mine`에 push한다 → Vercel **미리보기 주소**가 생긴다. (실제 배포 주소는 그대로)
   - 미리보기가 생기려면 Vercel에 `mine` 저장소를 프로젝트로 한 번 연결해 둬야 한다 (vercel.com → Add New → Project → Malgyeol 가져오기).
3. `mine`의 main(https://malgyeoll.vercel.app/)은 10/06부터 **건드리지 않는다** (제출과 관계없는 개인 확인용).
4. 제출용 작업은 `release/neon` 브랜치에서 하고, 확인이 끝나면 팀 저장소(`origin`)에 브랜치를 올려 main으로 가는 PR을 만든다. 병합하면 제출 링크(https://malgyeol-neon.vercel.app/)가 바뀐다. 팀 저장소에는 내가 요청할 때만 push한다.

```bash
git push mine feature/작업이름
```
