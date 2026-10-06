// 말결 메시지 자동 점검 (문장 정리 엔진 결과 품질 점검용 · 앱에는 포함되지 않음)
// engine.js·content.js와 같은 페이지에서 돌기 때문에 이름이 겹치지 않게 점검 쪽 이름에는 QA·qa를 붙인다.
// 실행: scripts/qa.html을 로컬 서버로 열기 (README '메시지 자동 점검' 참고)
//   이 PC에는 Node가 없어서 Node vm 대신 브라우저에서 engine.js·content.js를 그대로 불러와 돌린다.
//   engine.js·content.js는 고치지 않고, 이 파일은 generateMessages()의 결과만 본다.
//
// 점검 패턴·문구 목록은 아래 [점검 기준] 구역에 모여 있다. 새 패턴은 배열에 한 줄씩 추가하면 된다.

// ===================== [점검 기준] =====================

// 5) 문법 깨짐: 본문 어디에 나오든 문제인 글자 모양
const GRAMMAR_PATTERNS = [
  { re: /[.?!](?:을|를|은|는|이|가|으로|로|입니다|이에요|예요)/, desc: '문장부호 바로 뒤에 조사·서술어가 붙음 (예: "주세요.을")' },
  { re: /(?:어|아|해|세|게|에|죠|래)요(?:을|를|은|는|이|가|입니다|이에요|예요)/, desc: '"~요" 문장 끝 뒤에 조사·서술어가 붙음 (예: "좋겠어요를")' },
  { re: /(?:니|습|었|았|했|한|된)다(?:을|를|은|는|이|가|입니다|이에요|예요)/, desc: '"~다" 문장 끝 뒤에 조사·서술어가 붙음 (예: "있습니다를")' },
  { re: /(?:까지|내로|안에|이내|중으로)까지/, desc: '기한 끝에 "까지"가 또 붙음 (예: "오늘 내로까지")' },
  { re: /(?:니다|요)\s*(?:입니다|이에요|예요)/, desc: '서술어가 두 번 붙음 (예: "입니다입니다", "불가능한지입니다"류)' },
  { re: /(?<![까가])지(?:입니다|이에요|예요)/, desc: '"~지" 뒤에 "입니다"가 붙음 (예: "가능한지 불가능한지입니다" · "오전까지입니다"·"두 가지입니다"는 정상이라 뺌)' },
  { re: /\{[^}]*\}|을를|은는|으로로/, desc: "조사 자리표시가 그대로 남음 (예: {을를}, 을를)" },
  { re: /\bnull\b|\bundefined\b/, desc: 'null·undefined가 본문에 나옴' },
  { re: / {2,}/, desc: "공백 두 칸 이상" },
  { re: /\.\./, desc: "마침표 두 개" },
  { re: /[?!]\./, desc: '물음표·느낌표 뒤에 마침표 (예: "?.")' },
  // 10/06 추가: 실제로 나온 오류 문장
  { re: /[봄함음됨]\s?[을를] 해 봤/, desc: '메모체 끝 뒤에 "~을 해 봤습니다" 틀 (예: "요청해봄을 해 봤습니다")' },
  { re: /야\s?했(?:습니다|어요|어)/, desc: '"~해야함"이 과거형으로 바뀜 (예: "요청해줘야했습니다")' },
  { re: /(?:나요|까요|가요|니까)\s*(?:입니다|이에요|예요|부탁)/, desc: '질문 문장 뒤에 "입니다"·요청 틀 (예: "있나요입니다", "해야나요 부탁드려요")' },
  { re: /야나요|야나\?/, desc: '"해야 하나요"가 "해야나요"로 깨짐' },
  { re: /(?:는지|은지|한지|할지|인지|던지)(?:을|를|이|가)(?=[\s.,?!]|$)/, desc: '"~지"형 값 뒤에 조사 (예: "없는지를")' },
  { re: /[을를] 없는지/, desc: '"불이익을 없는지"처럼 조사가 틀림' },
  { re: /해(?:봤|봐요|봐|볼|주시|주세|주실|줘|드리|드려)/, desc: '보조 용언 띄어쓰기 (예: "해봤습니다" → "해 봤습니다")' },
  { re: /[가-힣](?<![물알찾돌])[어아](?:봤|봐요|볼게)/, desc: '보조 용언 띄어쓰기 (예: "읽어봤어" → "읽어 봤어")' },
  { re: /(?:는|은|한|된|할|될)것(?:처럼|이|을|은|도|으로|만)/, desc: '"것" 띄어쓰기 (예: "미달하는것처럼" → "미달하는 것처럼")' },
  { re: /완료[은는]\s?완료/, desc: '같은 말 반복 (예: "완료는 완료했습니다")' },
  { re: /(?:좋겠어요|좋겠습니다|좋겠어|싶어요|싶습니다|해요|합니다)\s?(?:을|를) 부탁/, desc: '완성 문장 뒤에 "~를 부탁드립니다" (예: "좋겠어요를 부탁드립니다")' },
  { re: /내로\s?까지|까지\s?까지|까지로(?:\s|$)/, desc: '기한 "까지" 중복 (예: "내로까지", "까지까지")' },
];

// 1) B1: 앱이 덧붙이는 요청 문장 (사용자가 쓴 칸 값 밖에서 나오면 '추가한 요청'으로 본다)
const REQUEST_PHRASES = ["확인 부탁", "시간 되실 때", "편하실 때", "답변 부탁", "확인해 주시면", "검토 부탁"];
// 급한 기한 표현과 여유 있는 끝인사
const QA_URGENT_RE = /오늘|지금|바로|급히|즉시|금일|내일 오전/;
const RELAXED_PHRASES = ["시간 되실 때", "편하실 때", "여유 되실 때", "여유 있으실 때", "시간 될 때", "편할 때", "여유 있을 때"];

// 3) B3: 칸이 비어 있을 때 수정 이유에 나오면 안 되는 단어 (칸 key → 단어)
const B3_KEYWORDS = {
  question: { situation: ["상황"], tried: ["해본 것"], blocker: ["막힌 지점"], options: ["선택지"], judgment: ["판단"], ask: ["질문", "묻고 싶은"] },
  request: { request: ["요청"], deadline: ["기한"], deliverable: ["필요한 결과", "결과물"], reason: ["이유", "배경"], alternative: ["대안", "조건"], consentNeeded: ["동의", "승인"] },
  status: { done: ["완료한 것"], inProgress: ["진행 중"], blocker: ["막힌 점"], helpNeeded: ["도움 요청"], nextEta: ["예상 시점", "다음 예정"] },
};
// 값이 있어도 '없음'을 뜻하는 칸 (T8: s05 막힌 점 "특별히 막힌 점은 없습니다.")
// "자료가 없습니다"처럼 문제를 설명하는 문장은 빼고, "특별히·별다른·딱히 … 없습니다" / "없음" / "해당 없음"만 본다.
const QA_MEANS_NONE_RE = /^(?:특별히|별다른|딱히|특이 ?사항).*(?:없|않)|^(?:없음|해당 없음|없습니다)\.?$/;

// 2·6) 문장 끝 모양 (목록 줄은 마침표가 없어서 마침표는 있어도 없어도 본다. "필요"처럼 요로 끝나는 낱말은 빼려고 앞 글자를 본다)
const HAEYO_END_RE = /(?:어|아|해|세|게|에|죠|래|네|대|여)요\.?$/;
const HAMNIDA_END_RE = /니다\.?$/;
const POLITE_END_RE = /(?:(?:어|아|해|세|게|에|죠|래|네|대|여)요|니다|니까)[.?!]?$/;

// 4) 받는 사람 규칙: 인차지는 결론 먼저 — 카드별 '결론' 칸
//    질문 준비실은 첫 문장에 용건만 밝히고 순서(상황 → … → 내 판단 → 질문)를 유지하므로 따로 보지 않는다 (10/06 변경)
const QA_LEAD_FIELD = { question: null, request: "request", status: "done" };
// 존댓말 메시지의 1인칭은 '저/제' (반말인 동기 제외)
const QA_PLAIN_I_RE = /(^|[\s"'(])(?:나는|나를|나도|나한테|나에게|내가)(?=[\s,.?!]|$)/;

// 7) 마스킹 표현과, 점검용으로 넣는 피하고 싶은 표현
const MASK_TOKENS = ["A사", "X원"];
const AVOID_TEST = "죄송, 바쁘신";

// ===================== [시험 사례] =====================
// 샘플 30건 전부 + 일부 칸만 채운 사례. 사례마다 끝맺음 2종 × 요청 방식 3종을 돌리고, 결과의 탭 3종을 모두 본다.
const EXTRA_CASES = [
  {
    id: "T5",
    title: "상황보고 · 완료한 것만 채움",
    cardId: "status",
    partner: "선배",
    fields: { done: "매출 표본 40건 중 35건의 증빙 대사" },
  },
  {
    id: "X1",
    title: "예전 문제 사례 · 부탁 한 장 · 인차지",
    cardId: "request",
    partner: "인차지",
    fields: {
      request: "세무조사 대응업무를 저 대신 다른 사람이 나가주셨으면 좋겠어요",
      deadline: "오늘 내로",
      deliverable: "가능한지 불가능한지",
      reason: "X사 업무의 과중",
    },
  },
  // 10/06 추가: 실제로 오류가 났던 입력 모양 (메모체 ~봄·~해야함, 물음표 없는 질문, "~지"형, 존댓말 속 '나')
  {
    id: "E1",
    title: "오류 사례 · 질문 준비실 · 메모체·물음표 없는 질문",
    cardId: "question",
    partner: "선배",
    fields: {
      situation: "외상매출금 조회서 회신 대사 중임",
      tried: "거래처에 회신 요청해봄",
      blocker: "회신이 아직 오지 않음",
      options: "해당 건을 표본에서 제외해주실 수 있나요",
      judgment: "추가 증빙을 요청해줘야함",
      ask: "어떻게 해야하나요",
    },
  },
  {
    id: "E2",
    title: "오류 사례 · 상황보고 · 인차지 · ~봄·~지형·'나를'",
    cardId: "status",
    partner: "인차지",
    fields: {
      done: "창고 재고 수량 새어봄",
      inProgress: "차이 원인 확인",
      blocker: "보관 기간이 지난 품목에 불이익이 없는지",
      helpNeeded: "나를 대신해 창고 담당자에게 연락해 주실 수 있는지",
    },
  },
  {
    id: "E3",
    title: "오류 사례 · 부탁 한 장 · '나를·내가'·~해야함",
    cardId: "request",
    partner: "선배",
    fields: {
      request: "나를 대신해 오후 회의 참석",
      deadline: "오늘 오후 3시까지",
      reason: "내가 같은 시간에 재고 실사에 나가야함",
    },
  },
  {
    id: "REAL",
    title: "실제 사례(10/06 결과가 나빴던 입력 · '내 판단'은 복원한 값)",
    cardId: "question",
    partner: "선배",
    fields: {
      situation: "표본 추출 기준 검토",
      tried: "무작위 추출을 해봄",
      blocker: "추출된 항목이 중요성 기준에 미달하는것처럼 보임",
      judgment: "무작위 추출 결과를 그대로 써도 될 것 같음",
      ask: "모르겠는데 정당한가요?",
    },
  },
  // 10/06 추가: "좋겠어요를 부탁드립니다" · "내로까지"가 나왔던 입력 모양
  {
    id: "E4",
    title: "오류 사례 · 부탁 한 장 · 완성 문장 요청 · '내로' 기한",
    cardId: "request",
    partner: "클라이언트",
    fields: {
      request: "감사에 필요한 자료를 보내주시면 좋겠어요",
      deadline: "금요일 내로",
      reason: "기말 감사 일정상 이번 주 안에 검토해야 함",
    },
  },
  {
    id: "E5",
    title: "오류 사례 · 상황보고 · 기한 표현이 든 완료 예상",
    cardId: "status",
    partner: "선배",
    fields: {
      done: "매입 테스트 표본 추출 완료",
      nextEta: "목요일 오전 중까지",
      helpNeeded: "검토 일정을 잡아 주시면 좋겠어요",
    },
  },
];

// ===================== [점검 로직] =====================

const ITEMS = [
  { id: "B1", name: "B1 · 빈 칸의 요청·기한 문장 추가 / 급한 기한에 여유 끝인사" },
  { id: "B2", name: "B2 · 질문 준비실 마지막 문장에 '묻고 싶은 것' / 해본 것·내 판단 포함" },
  { id: "B3", name: "B3 · 수정 이유가 빈 칸(또는 '없음' 칸)을 언급" },
  { id: "R", name: "받는 사람 규칙 (선배님 · 인차지 결론 먼저 · 동기 반말 · 클라이언트 담당자님·합니다체)" },
  { id: "G", name: "문법 깨짐" },
  { id: "T", name: "말투 혼합 (합니다체↔해요체)" },
  { id: "M", name: "마스킹(A사·X원) 유지" },
  { id: "E", name: "의도 체크 근거 구절이 본문에 있는지" },
  { id: "A", name: "피하고 싶은 표현이 본문에 들어감" },
];
const INFO = [{ id: "R3", name: "(참고) 탭 3종의 수정 이유가 모두 같음" }];

function qaSplitSentences(text) {
  const out = [];
  String(text)
    .split("\n")
    .forEach((line) => {
      const body = line.replace(/^-\s*[^:]+:\s*/, ""); // 목록 줄은 값 부분만
      (body.match(/[^.?!]+[.?!]+|[^.?!]+$/g) || []).forEach((s) => {
        const t = s.trim();
        if (t) out.push(t);
      });
    });
  return out;
}

const stripEnd = (v) => String(v || "").trim().replace(/[.?!\s]+$/, "");
const core = (v, n = 10) => stripEnd(v).slice(0, n);
// 띄어쓰기를 무시하고 앞부분이 들어 있는지 (맞춤법 다듬기로 "해봄" → "해 봤습니다"처럼 바뀌어도 내용은 같음)
const noSpace = (v) => String(v || "").replace(/\s+/g, "");
const hasCore = (text, v, n = 6) => noSpace(text).includes(noSpace(stripEnd(v)).slice(0, n));

// 사용자가 쓴 칸 값을 지운 나머지 = 앱이 붙인 글
function appText(text, values) {
  let rest = text;
  Object.values(values)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .forEach((v) => {
      rest = rest.split(stripEnd(v)).join(" ");
    });
  return rest;
}

function checkMessage(run, variant) {
  const problems = [];
  const add = (item, detail) => problems.push({ item, detail });
  const { card, values, partner, profile } = run;
  const text = variant.text;
  const app = appText(text, values);
  const sentences = qaSplitSentences(text);
  const reasons = variant.reasons || run.reasons;

  // B1
  const empty = (key) => !values[key];
  const hitRequest = REQUEST_PHRASES.find((p) => app.includes(p));
  if (card.id === "status" && empty("helpNeeded") && hitRequest) add("B1", `도움 요청이 비었는데 "${hitRequest}" 문장이 붙음`);
  if (card.id === "question" && hitRequest) add("B1", `질문 외에 요청 문장 "${hitRequest}"이 붙음`);
  const urgent = Object.values(values).some((v) => QA_URGENT_RE.test(v));
  const relaxed = RELAXED_PHRASES.find((p) => app.includes(p));
  if (urgent && relaxed) add("B1", `급한 기한인데 "${relaxed}" 끝인사`);

  // B2
  if (card.id === "question") {
    const last = sentences[sentences.length - 1] || "";
    if (values.ask && !hasCore(last, values.ask, 5)) add("B2", `마지막 문장에 묻고 싶은 것이 없음 (마지막: "${last}")`);
    ["tried", "judgment"].forEach((key) => {
      if (values[key] && !hasCore(text, values[key], 6)) add("B2", `${key === "tried" ? "해본 것" : "내 판단"}이 본문에 없음`);
    });
  }

  // B3
  const words = B3_KEYWORDS[card.id] || {};
  Object.entries(words).forEach(([key, list]) => {
    const none = values[key] && QA_MEANS_NONE_RE.test(String(values[key]).trim());
    if (!empty(key) && !none) return;
    reasons.forEach((reason) => {
      const w = list.find((word) => reason.includes(word));
      if (w) add("B3", `${none ? "'없음' 칸" : "빈 칸"}(${key})을 수정 이유가 언급: "${reason}"`);
    });
  });

  // 받는 사람 규칙
  const firstLine = text.split("\n")[0] || "";
  if (partner.id === "senior" && !firstLine.startsWith("선배님")) add("R", "선배인데 '선배님'으로 시작하지 않음");
  if (partner.id !== "peer" && QA_PLAIN_I_RE.test(text)) add("R", "존댓말 메시지에 '나/내가'가 있음 (저/제로)");
  if (partner.id === "incharge") {
    if (!firstLine.startsWith("인차지님")) add("R", "인차지인데 '인차지님'으로 시작하지 않음");
    const lead = QA_LEAD_FIELD[card.id] && values[QA_LEAD_FIELD[card.id]];
    const firstTwo = sentences.slice(0, 2).join(" ");
    // 존댓말 메시지에서는 '나를/내가'가 '저를/제가'로 바뀌므로 같은 말로 본다
    const politeLead = lead && lead.replace(/^나(?=는|를|도|한테|에게)/, "저").replace(/^내가/, "제가");
    if (lead && !hasCore(firstTwo, politeLead, 6)) add("R", `인차지인데 결론(${QA_LEAD_FIELD[card.id]})이 앞 두 문장 안에 없음`);
  }
  if (partner.id === "peer") {
    if (/님[,.]/.test(firstLine)) add("R", "동기인데 호칭(~님)으로 시작");
    const polite = sentences.filter((s) => POLITE_END_RE.test(s));
    if (polite.length) add("R", `동기인데 존댓말 문장 ${polite.length}개 (예: "${polite[0]}")`);
  }
  if (partner.id === "client") {
    if (!text.includes("담당자님")) add("R", "클라이언트인데 '담당자님'이 없음");
    const yo = sentences.filter((s) => HAEYO_END_RE.test(s));
    if (yo.length) add("R", `클라이언트인데 해요체 문장 ${yo.length}개 (예: "${yo[0]}")`);
  }

  // 문법 깨짐
  GRAMMAR_PATTERNS.forEach((p) => {
    const m = text.match(p.re);
    if (m) {
      const at = text.indexOf(m[0]);
      add("G", `${p.desc} · "…${text.slice(Math.max(0, at - 12), at + m[0].length + 6).replace(/\n/g, " ")}…"`);
    }
  });

  // 말투 혼합 (동기는 반말 규칙, 클라이언트는 합니다체 고정으로 대신 본다)
  if (partner.id !== "peer") {
    const target = partner.id === "client" ? "hamnida" : profile.ending;
    const bad = sentences.filter((s) => (target === "hamnida" ? HAEYO_END_RE.test(s) : HAMNIDA_END_RE.test(s)));
    if (bad.length) add("T", `${target === "hamnida" ? "합니다체인데 '~요.'" : "해요체인데 '~니다.'"} 문장 ${bad.length}개 (예: "${bad[0]}")`);
  }

  // 마스킹
  MASK_TOKENS.forEach((token) => {
    if (Object.values(values).some((v) => v.includes(token)) && !text.includes(token)) add("M", `"${token}"이 본문에서 사라짐`);
  });

  // 의도 체크 근거 구절
  Object.keys(values).forEach((key) => {
    const phrase = variant.evidence && variant.evidence[key];
    if (!phrase) add("E", `${key} 근거 구절이 없음`);
    else if (!text.includes(phrase)) add("E", `${key} 근거 구절 "${phrase}"이 본문에 없음`);
  });

  // 피하고 싶은 표현
  if (profile.avoidPhrases) {
    profile.avoidPhrases
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean)
      .forEach((w) => {
        if (app.includes(w)) add("A", `피하고 싶은 표현 "${w}"이 앱이 붙인 문장에 있음`);
      });
  }

  return problems;
}

// 모든 사례를 돌려 { runs, results } 를 만든다. generate는 engine.js의 generateMessages.
// [다시 만들기] 조합 번호: 처음(0)과 다시 만들기 두 번(1·2)
const QA_VARIATIONS = [0, 1, 2];

async function runAll(DATA, SAMPLES, generate) {
  const partnerByLabel = Object.fromEntries(DATA.partners.map((p) => [p.label, p]));
  const cases = [
    ...SAMPLES.samples.map((s) => ({ id: s.id, title: s.oneLine, cardId: s.cardId, partner: s.partner, fields: s.fields })),
    ...EXTRA_CASES,
  ];
  const profiles = [];
  ["hamnida", "haeyo"].forEach((ending) =>
    ["direct", "soft", "careful"].forEach((requestStyle) =>
      profiles.push({ sentenceLength: "normal", requestStyle, ending, avoidPhrases: "", preferredExamples: [] }),
    ),
  );

  const jobs = [];
  cases.forEach((c) => {
    const card = DATA.cards.find((x) => x.id === c.cardId);
    const fields = Object.fromEntries(card.fields.map((f) => [f.key, c.fields[f.key] || null]));
    const values = Object.fromEntries(Object.entries(fields).filter(([, v]) => v && String(v).trim()));
    // 받는 사람 4종 모두 (샘플에 적힌 받는 사람이 아니어도 같은 내용으로 돌려 본다)
    DATA.partners.forEach((partner) => {
      profiles.forEach((profile) => QA_VARIATIONS.forEach((variation) => jobs.push({ c, card, fields, values, partner, profile, variation })));
    });
    // 피하고 싶은 표현 점검용 1회 (샘플의 받는 사람 · 합니다체 · 매우 조심스럽게 — 앱 문장에 '죄송'이 들어가는 조건)
    const avoidProfile = { sentenceLength: "normal", requestStyle: "careful", ending: "hamnida", avoidPhrases: AVOID_TEST, preferredExamples: [] };
    jobs.push({ c, card, fields, values, partner: partnerByLabel[c.partner], profile: avoidProfile, variation: 0 });
  });

  const runs = await Promise.all(
    jobs.map(async (job) => {
      const out = await generate(
        { card: job.card, fields: job.fields, recipient: job.partner, profile: job.profile, preferred: [] },
        { variation: job.variation },
      );
      return { ...job, variants: out.variants, reasons: out.reasons };
    }),
  );

  const results = [];
  runs.forEach((run) => {
    const reasonSets = run.variants.map((v) => JSON.stringify(v.reasons || run.reasons));
    run.sameReasons = new Set(reasonSets).size === 1;
    run.variants.forEach((variant) => {
      checkMessage(run, variant).forEach((p) =>
        results.push({ ...p, caseId: run.c.id, cardId: run.card.id, partner: run.partner.label, profile: run.profile, variation: run.variation, tab: variant.type, text: variant.text }),
      );
    });
  });
  return { runs, results, caseCount: cases.length };
}

function summarize({ runs, results, caseCount }) {
  const messages = runs.length * 3;
  const rows = ITEMS.map((item) => {
    const list = results.filter((r) => r.item === item.id);
    const msgKeys = new Set(list.map((r) => `${r.caseId}|${JSON.stringify(r.profile)}|${r.tab}`));
    return { ...item, count: list.length, messages: msgKeys.size };
  });
  const sameReasons = runs.filter((r) => r.sameReasons).length;
  return { messages, runs: runs.length, caseCount, rows, sameReasons };
}

const TAB_LABEL = { mine: "내 말투안", concise: "더 간결하게", soft: "더 부드럽게" };
const ENDING_LABEL = { hamnida: "합니다체", haeyo: "해요체" };
const STYLE_LABEL = { direct: "직접적으로", soft: "부드럽게", careful: "매우 조심스럽게" };

function toMarkdown(data, { title, date }) {
  const s = summarize(data);
  const lines = [];
  lines.push(`# ${title}`, "");
  lines.push(`- 실행일: ${date}`);
  lines.push(`- 방법: \`scripts/qa.html\`(브라우저)에서 \`engine.js\`의 generateMessages()를 그대로 실행 · 점검 기준은 \`scripts/check-messages.js\` 위쪽`);
  lines.push(`- 대상: 사례 ${s.caseCount}개(샘플 30건 + 추가 사례 ${s.caseCount - 30}개) × 받는 사람 4종 × 끝맺음 2종 × 요청 방식 3종 × [다시 만들기] 조합 3가지 (+ 사례마다 피하고 싶은 표현 1회) = 생성 ${s.runs}회 × 탭 3종 = 메시지 ${s.messages}개`);
  lines.push("", "## 항목별 요약", "", "| 항목 | 문제 수 | 문제 난 메시지 수 |", "|---|---:|---:|");
  s.rows.forEach((r) => lines.push(`| ${r.name} | ${r.count} | ${r.messages} |`));
  lines.push(`| **합계** | **${s.rows.reduce((a, r) => a + r.count, 0)}** | |`);
  lines.push("", `${INFO[0].name}: 생성 ${s.runs}회 중 ${s.sameReasons}회`, "");

  lines.push("## 문제 예시 (항목별 최대 12개 · 같은 사례·같은 문제는 한 번만)", "");
  ITEMS.forEach((item) => {
    const list = data.results.filter((r) => r.item === item.id);
    if (!list.length) return;
    lines.push(`### ${item.name} — ${list.length}건`, "");
    const seen = new Set();
    let n = 0;
    for (const r of list) {
      const key = `${r.caseId}|${r.detail.replace(/\d+개/, "")}|${r.tab}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`- **${r.caseId}** · ${r.partner} · ${TAB_LABEL[r.tab]} · ${ENDING_LABEL[r.profile.ending]} · ${STYLE_LABEL[r.profile.requestStyle]}${r.profile.avoidPhrases ? " · 피할 표현 있음" : ""} — ${r.detail}`);
      if (++n >= 12) break;
    }
    lines.push("");
  });
  return lines.join("\n");
}

// ===================== [문체 점검 · 2026-10-05 추가] =====================
// 원칙: 메시지 한 통 = 문체 하나. 클라이언트 = 합니다체, 동기 = 반말, 선배·인차지 = 내 말투 끝맺음 설정.
// 합니다체 의문문은 "~ㄹ까요?"도 허용한다 (팀 결정 10/05 · 직장 메신저 관용).
// 앱 안내 문구(수정 이유)는 해요체.
// 대상: 샘플 30건 × 받는 사람 4종 × 끝맺음 2종 × 탭 3종 (요청 방식 '부드럽게' · 문장 길이 '보통')

const QA_TONE_BY_PARTNER = { client: "hamnida", peer: "banmal" };
// 문장 끝 분류 (위에서부터 먼저 맞는 것)
const QA_ENDING_CLASS = [
  { cls: "hamnida", re: /(?:니다|니까|십시오)$/ },
  { cls: "kkayo", re: /까요$/ }, // ~ㄹ까요? : 합니다체·해요체 모두 허용
  { cls: "haeyo", re: /요$/ },
  { cls: "banmal", re: /(?:어|아|해|돼|야|줘|봐|와|워|려|겨|라|러|게|래|까|나|지|자|네|군|거든|대)$/ },
];
const QA_ALLOWED = { hamnida: ["hamnida", "kkayo"], haeyo: ["haeyo", "kkayo"], banmal: ["banmal"] };
const QA_TONE_LABEL = { hamnida: "합니다체", haeyo: "해요체", banmal: "반말", kkayo: "~ㄹ까요?", unknown: "모름" };

function qaClassifyEnding(sentence) {
  const body = sentence.replace(/[.?!\s]+$/, "");
  const hit = QA_ENDING_CLASS.find((c) => c.re.test(body));
  return hit ? hit.cls : "unknown";
}

// 메시지 한 통의 문장들. 목록 줄("- 기한: …")은 값이 문장 끝(니다·요·?)으로 끝날 때만 문장으로 본다.
// 괄호로 시작하는 줄("(상대 확인: …)")은 문장이 아니라서 뺀다.
function qaToneSentences(text) {
  const out = [];
  String(text)
    .split("\n")
    .forEach((line) => {
      const bullet = line.match(/^-\s*[^:]+:\s*(.*)$/);
      if (bullet) {
        const v = bullet[1].trim();
        if (/(?:니다|니까|요)[.?!]?$|\?$/.test(v)) out.push(v);
        return;
      }
      (line.match(/[^.?!]+[.?!]+|[^.?!]+$/g) || []).forEach((s) => {
        const t = s.trim();
        if (!t || t.startsWith("(") || !/[가-힣]/.test(t)) return;
        if (/님[.,]?$/.test(t)) return; // "안녕하세요, 담당자님." 같은 인사는 문장 끝맺음이 아니다
        out.push(t);
      });
    });
  return out;
}

async function runToneCheck(DATA, SAMPLES, generate) {
  const jobs = [];
  SAMPLES.samples.forEach((sample) => {
    const card = DATA.cards.find((c) => c.id === sample.cardId);
    const fields = Object.fromEntries(card.fields.map((f) => [f.key, sample.fields[f.key] || null]));
    DATA.partners.forEach((partner) => {
      ["hamnida", "haeyo"].forEach((ending) => {
        const profile = { sentenceLength: "normal", requestStyle: "soft", ending, avoidPhrases: "", preferredExamples: [] };
        jobs.push({ sample, card, fields, partner, profile, tone: QA_TONE_BY_PARTNER[partner.id] || ending });
      });
    });
  });
  const runs = await Promise.all(
    jobs.map(async (job) => {
      const out = await generate({ card: job.card, fields: job.fields, recipient: job.partner, profile: job.profile, preferred: [] });
      return { ...job, variants: out.variants, reasons: out.reasons };
    }),
  );

  const mixed = []; // 문체 혼합 (메시지 단위)
  const unknown = {}; // 변환 못 한 끝맺음: 끝 2글자 → { count, example }
  const reasonIssues = []; // 수정 이유가 해요체가 아님
  let messages = 0;
  runs.forEach((run) => {
    run.variants.forEach((variant) => {
      messages += 1;
      const bad = [];
      qaToneSentences(variant.text).forEach((s) => {
        const cls = qaClassifyEnding(s);
        if (cls === "unknown") {
          const end = s.replace(/[.?!\s]+$/, "").slice(-2);
          unknown[end] = unknown[end] || { count: 0, example: s };
          unknown[end].count += 1;
          return;
        }
        if (!QA_ALLOWED[run.tone].includes(cls)) bad.push({ s, cls });
      });
      if (bad.length) mixed.push({ run, tab: variant.type, bad });
      (variant.reasons || run.reasons).forEach((reason) => {
        if (qaClassifyEnding(reason) !== "haeyo") reasonIssues.push({ run, tab: variant.type, reason });
      });
    });
  });
  return { runs, messages, mixed, unknown, reasonIssues };
}

function toneMarkdown(tone, { title, date }) {
  const lines = [`# ${title}`, ""];
  lines.push(`- 실행일: ${date} · \`scripts/qa.html\` (브라우저에서 engine.js 그대로 실행)`);
  lines.push(`- 대상: 샘플 30건 × 받는 사람 4종 × 끝맺음 2종 = 생성 ${tone.runs.length}회 × 탭 3종 = 메시지 ${tone.messages}개 (요청 방식 '부드럽게' · 문장 길이 '보통')`);
  lines.push('- 기준: 메시지 한 통 = 문체 하나 (클라이언트 합니다체 · 동기 반말 · 선배·인차지 = 끝맺음 설정). 합니다체 의문문은 "~ㄹ까요?" 허용', "");
  const byPartner = {};
  tone.mixed.forEach((m) => (byPartner[m.run.partner.label] = (byPartner[m.run.partner.label] || 0) + 1));
  const unknownTotal = Object.values(tone.unknown).reduce((a, u) => a + u.count, 0);
  lines.push("| 항목 | 개수 |", "|---|---:|");
  lines.push(`| 문체 혼합 메시지 | ${tone.mixed.length} / ${tone.messages} |`);
  lines.push(`| 받는 사람별 (선배 · 인차지 · 동기 · 클라이언트) | ${["선배", "인차지", "동기", "클라이언트"].map((p) => byPartner[p] || 0).join(" · ")} |`);
  lines.push(`| 변환 못 한 끝맺음 (문장 수) | ${unknownTotal} |`);
  lines.push(`| 수정 이유가 해요체가 아님 | ${tone.reasonIssues.length} |`, "");

  lines.push("## 변환 못 한 끝맺음 목록 (끝 2글자 · 개수 · 예)", "");
  const unk = Object.entries(tone.unknown).sort((a, b) => b[1].count - a[1].count);
  if (!unk.length) lines.push("- 없음");
  unk.forEach(([end, u]) => lines.push(`- "${end}" · ${u.count} · "${u.example}"`));
  lines.push("");

  lines.push("## 문체 혼합 예시 (최대 15개 · 같은 샘플·같은 문장은 한 번만)", "");
  if (!tone.mixed.length) lines.push("- 없음");
  const seen = new Set();
  let n = 0;
  for (const m of tone.mixed) {
    for (const b of m.bad) {
      const key = `${m.run.sample.id}|${b.s}`;
      if (seen.has(key) || n >= 15) continue;
      seen.add(key);
      n += 1;
      lines.push(`- **${m.run.sample.id}** · ${m.run.partner.label} · 설정 ${QA_TONE_LABEL[m.run.profile.ending]} → 정한 문체 ${QA_TONE_LABEL[m.run.tone]} · ${TAB_LABEL[m.tab]} — "${b.s}" (${QA_TONE_LABEL[b.cls]})`);
    }
  }
  lines.push("");
  if (tone.reasonIssues.length) {
    lines.push("## 수정 이유가 해요체가 아닌 문장", "");
    tone.reasonIssues.slice(0, 10).forEach((r) => lines.push(`- ${r.run.sample.id} · ${TAB_LABEL[r.tab]} — "${r.reason}"`));
    lines.push("");
  }
  return lines.join("\n");
}
