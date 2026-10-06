// 말결 문장 정리 엔진 (규칙 기반 · 외부 AI API를 쓰지 않는다)
// structurize()  : 한 줄 입력 → 카드의 칸 나누기 (샘플 데이터 30건과 비교 + 문장 연결어 규칙)
// generateMessages(): 채운 칸 → 받는 사람·내 말투에 맞춘 메시지 3종 (문장 틀 + 끝맺음 변환 표)
// 이 파일에는 로직만 둔다. 문장 틀은 content.js, 카드·칸·받는 사람·수정 이유 문구는 data/cards.json,
// 샘플은 data/malgyeol_sample_data.json을 쓴다. (main.js가 불러 DATA · SAMPLE_DATA에 넣는다)
// 입출력 형식은 코딩 레퍼런스 2장(8절 데이터·저장)과 기획안 10장 기준.

const ENGINE_DELAY_MS = 400; // 정리하는 느낌을 주는 짧은 대기 (계산은 바로 끝난다)
const SAMPLE_SIMILARITY = 0.55; // 한 줄이 샘플과 이만큼 비슷하면 그 샘플을 쓴다 (0~1)

// 띄어쓰기·문장부호를 뺀 비교용 문자열
function normalizeLine(text) {
  return String(text || "").replace(/[\s.,!?~·]/g, "");
}

// 두 글자씩 묶은 조각이 얼마나 겹치는지 (0~1). 낱말 순서가 조금 달라도 비슷하면 높게 나온다.
function similarity(a, b) {
  const grams = (s) => {
    const out = new Map();
    for (let i = 0; i < s.length - 1; i += 1) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) || 0) + 1);
    }
    return out;
  };
  const x = grams(normalizeLine(a));
  const y = grams(normalizeLine(b));
  let common = 0;
  let total = 0;
  x.forEach((n, g) => {
    common += Math.min(n, y.get(g) || 0);
    total += n;
  });
  y.forEach((n) => {
    total += n;
  });
  return total ? (2 * common) / total : 0;
}

// 입력과 가장 비슷한 샘플(같은 카드). 같거나 한쪽이 다른 쪽을 포함하면 바로 그 샘플, 아니면 유사도가 기준 이상인 것 중 가장 높은 것.
// exactOnly: 같은 샘플만 찾는다 (비슷한 샘플은 찾지 않는다)
function findSample(card, input, exactOnly) {
  const target = normalizeLine(input);
  if (target.length < 6) return null;
  const samples = ((typeof SAMPLE_DATA !== "undefined" && SAMPLE_DATA && SAMPLE_DATA.samples) || []).filter((s) => s.cardId === card.id);
  const exact = samples.find((sample) => {
    const line = normalizeLine(sample.oneLine);
    return line === target || line.includes(target) || target.includes(line);
  });
  if (exact || exactOnly) return exact || null;
  let best = null;
  let bestScore = SAMPLE_SIMILARITY;
  samples.forEach((sample) => {
    const score = similarity(input, sample.oneLine);
    if (score >= bestScore) {
      best = sample;
      bestScore = score;
    }
  });
  return best;
}

// ---------- 한 줄을 연결어로 나눠 칸에 배치하기 (샘플·키워드와 맞지 않을 때) ----------

// 말끝을 메모체로: 맞 → 맞음, 되 → 됨, 하 → 함 (받침 없으면 ㅁ 받침을 붙인다)
function toMemo(stem) {
  const s = stem.trim();
  const last = s.slice(-1);
  if (!isHangul(last)) return s;
  return jongOf(last) === 0 ? s.slice(0, -1) + withJong(last, 16) : `${s}음`;
}

// 한 조각의 끝 연결어를 떼고 칸 값 모양(메모체·"~지"형)으로 바꾼다. 바꿀 수 없으면 null.
//   "계산이 안 맞는데" → "계산이 안 맞음" · "검토 중인데" → "검토 중임" · "맞는지" → 그대로 ("~지"형)
function clauseValue(part) {
  const p = part.trim().replace(/[,.]$/, "");
  let m;
  if ((m = p.match(/^(.+?)(?:이)?(?:인데|이고|이지만|이라서|이어서|이라)$/)) && /(?:중|것|상황|상태|기준|문제|때문)$/.test(m[1])) return `${m[1]}임`;
  if ((m = p.match(/^(.+)와서$/))) return `${m[1]}옴`; // 회신이 안 와서 → 회신이 안 옴
  if ((m = p.match(/^(.+)워서$/))) return `${m[1]}움`; // 끝내기 어려워서 → 끝내기 어려움
  if ((m = p.match(/^(.+)봐서$/))) return `${m[1]}봄`; // 확인해 봐서 → 확인해 봄
  if ((m = p.match(/^(.+[^는은])(?:는데|은데|지만)$/))) return toMemo(m[1]);
  if ((m = p.match(/^(.+(?:했|됐|었|았|있|없|겠))(?:는데|지만|어서|어)$/))) return toMemo(m[1]);
  if ((m = p.match(/^(.+)해서$/))) return `${m[1]}함`;
  if ((m = p.match(/^(.+[나가])서$/))) return toMemo(m[1]); // 차이가 나서 → 차이가 남
  if ((m = p.match(/^(.+)(?:아서|어서)$/)) && hasBatchim(m[1])) return toMemo(m[1]); // 안 맞아서 → 안 맞음
  if ((m = p.match(/^(.+(?:했|났|었|았|됐))고$/))) return toMemo(m[1]); // 실사는 끝났고 → 실사는 끝났음
  return p;
}

// 문장 연결어 자리에서 한 줄을 조각으로 나눈다. (연결어는 앞 조각에 남긴다)
const CLAUSE_SPLIT_RE = /(?<=(?:는데|인데|은데|지만|해서|나서|라서|어서|아서|여서|와서|워서|빠서|파서|봐서|돼서|했고|났고|었고|았고|됐고|이고|이라|했어|었어|았어))\s+/;
// 받는 사람에게 묻고 싶다는 꼬리("~ 인차지님께 여쭤보고 싶어요")는 칸 내용이 아니다 → 꼬리만 잘라낸다 (조각을 통째로 지우지 않음 · 2)
const META_TAIL_RE = /\s*(?:(?:선배|인차지|동기|담당자|클라이언트|팀장)(?:님)?(?:한테|에게|께)\s*)?(?:물어보고|여쭤보고|여쭙고|묻고|말씀드리고|확인받고)\s*싶(?:어요|습니다|어)?$/;
const ASK_RE = /\?$|(?:나요|까요|가요|ㄹ지|을지|는지|인지|은지)(?:\s*(?:궁금|모르|고민|확인).*)?$/;
const BLOCK_RE = /안 ?맞|안 ?돼|안 ?됨|못 |모르|막혀|막힘|어렵|헷갈|애매|안 ?와|안 ?옴|없|부족|달라|다름|오류|차이/;
const TRIED_RE = /해 ?봤|해 ?봄|확인했|시도|찾아봤|비교했|검토했|대사했|읽어 ?봤/;
const JUDGE_RE = /것 같|같아|생각|보여|보임|맞는 듯/;
const DONE_RE = /끝났|끝냄|완료|마쳤|정리했|했고|했음|끝$/;
const DOING_RE = /중(?:이에요|입니다|이야|임|인데|이고|이라|이어서)?$|진행 ?중|하고 있/;
const HELP_RE = /부탁|도와|요청|확인해 ?주|봐 ?주|주실 수|줄 수/;
// 부탁 한 장: 요청으로 보는 말 · 이유로 보는 말 · 기한을 요청 문장에서 빼지 않는 일정 변경 요청 (3)
const REQUEST_RE = /싶어요|싶습니다|필요해요|필요합니다|될까요|되나요|될지|되는지|해도|미뤄|연기|변경|받아야|해야|주셨으면/;
const REASON_RE = /해서|어서|아서|워서|와서|인데|는데/;
const RESCHEDULE_RE = /미뤄|미루|연기|변경|늦춰|당겨|앞당|옮겨/;
// 질문 준비실: 조각이 하나뿐이고 이런 말이 있으면 막힌 지점 (7)
const STUCK_RE = /모르|막히|막혀|막힘|안 ?맞/;
// 기한 표현: "내일 오전까지", "금요일 18시까지", "이번 주 중으로", "오늘 중"
// 여러 개면 마지막 것을 기한으로 쓴다 ("오늘 중으로 끝내기 어려워서 내일 오전 10시까지로…" → 내일 오전 10시까지)
const TIME_RE = /(?:오늘|내일|모레|이번 ?주|다음 ?주|금주|차주|[월화수목금토일]요일|\d+일|\d+시)(?:\s?(?:오전|오후|점심|저녁|\d+시|\d+분|[월화수목금토일]요일))*\s?(?:까지|중으로|중|내로|전까지)/g;

// 칸 하나에 조각을 넣는다. 이미 찬 칸이면 버리지 않고 ", "로 이어 붙인다 (입력 유실 방지 · 1)
function put(fields, key, value) {
  if (!(key in fields) || !value) return;
  fields[key] = fields[key] ? `${fields[key]}, ${value}` : value;
}

function splitByRules(card, input) {
  const fields = {};
  card.fields.forEach((field) => {
    fields[field.key] = null;
  });
  const parts = String(input)
    .split(/[.!]\s+|\n/)
    .flatMap((s) => s.split(CLAUSE_SPLIT_RE))
    .map((s) => s.trim().replace(META_TAIL_RE, "").trim())
    .filter(Boolean);
  if (!parts.length) return fields;

  if (card.id === "question" && parts.length === 1 && STUCK_RE.test(parts[0]) && !ASK_RE.test(parts[0])) {
    put(fields, "blocker", clauseValue(parts[0])); // "리스 회계처리 모르겠어요" → 막힌 지점 (7)
  } else if (card.id === "question") {
    parts.forEach((part, i) => {
      const value = clauseValue(part);
      const askPart = part.replace(/\s*(?:궁금해요|궁금합니다|모르겠어요|모르겠습니다|고민돼요|고민입니다|확인하고 싶어요|확인하고 싶습니다)$/, "").trim();
      if (ASK_RE.test(askPart) && i === parts.length - 1) {
        put(fields, "ask", askPart);
      } else if (TRIED_RE.test(part)) put(fields, "tried", value);
      else if (JUDGE_RE.test(part)) put(fields, "judgment", value);
      else if (BLOCK_RE.test(part) && (fields.situation || i > 0)) put(fields, "blocker", value);
      else if (!fields.situation) put(fields, "situation", value);
      else put(fields, "blocker", value);
    });
  } else if (card.id === "request") {
    const times = String(input).match(TIME_RE) || [];
    const deadline = times.length ? times[times.length - 1].trim() : null;
    if (deadline) put(fields, "deadline", deadline);
    parts.forEach((part) => {
      if (HELP_RE.test(part) || REQUEST_RE.test(part)) {
        // "금요일까지 원장을 보내주실 수 있나요" → 기한 칸에 넣은 말은 요청 내용에서 뺀다
        // 단, 일정을 미루거나 바꾸는 요청은 기한이 요청의 내용이므로 그대로 둔다 ("내일 오전 10시까지로 미뤄도 될지")
        const keepTime = !deadline || RESCHEDULE_RE.test(part);
        const request = keepTime ? part : part.replace(deadline, "").replace(/\s{2,}/g, " ").trim();
        put(fields, "request", request || part);
      } else if (/때문에/.test(part)) put(fields, "reason", part.slice(0, part.indexOf("때문에")).trim()); // "회의 때문에 바빠서" → "회의"
      else if (REASON_RE.test(part) && clauseValue(part) !== part.trim()) put(fields, "reason", clauseValue(part)); // 메모체로 바꿀 수 있을 때만
    });
  } else if (card.id === "status") {
    parts.forEach((part) => {
      const value = clauseValue(part);
      if (HELP_RE.test(part)) put(fields, "helpNeeded", part);
      else if (DOING_RE.test(part)) put(fields, "inProgress", value);
      else if (DONE_RE.test(part) || DONE_RE.test(value)) put(fields, "done", value);
      else if (BLOCK_RE.test(part)) put(fields, "blocker", value);
      else if (!fields.done) put(fields, "done", value);
    });
  }
  return fields;
}

// 호출 1 · 구조화
// 입력: card(cards.json의 카드), input(한 줄)
// 출력: { fields: {칸키: 값 또는 null}, followups: {칸키: 되묻는 질문} }
// 한 줄에서 알 수 있는 칸만 채우고 나머지는 null로 둔다. 지어내지 않는다.
// 순서: ① 샘플과 같으면 그 샘플 ② 시연용 키워드 응답(content.js STRUCTURE_PRESETS) ③ 샘플과 비슷하면 그 샘플 ④ 연결어 규칙
// (샘플을 쓸 때는 한 줄로 알 수 있는 칸만 · content.js STRUCTURIZE_FILL)
async function structurize(card, input) {
  await new Promise((resolve) => setTimeout(resolve, ENGINE_DELAY_MS));

  let fields = {};
  card.fields.forEach((field) => {
    fields[field.key] = null;
  });

  // ① 샘플과 같은 한 줄 → ② 시연용 키워드 응답 → ③ 샘플과 비슷한 한 줄 → ④ 연결어 규칙
  const exact = findSample(card, input, true);
  const preset = exact ? null : (STRUCTURE_PRESETS[card.id] || []).find((p) => p.keywords.some((word) => input.includes(word)));
  const sample = exact || (preset ? null : findSample(card, input));

  if (preset) {
    Object.assign(fields, preset.fields);
  } else if (sample) {
    // 샘플과 비슷한 한 줄이면, 한 줄에서 보통 알 수 있는 칸만 샘플 값으로 채운다.
    (STRUCTURIZE_FILL[card.id] || []).forEach((key) => {
      if (sample.fields[key]) fields[key] = sample.fields[key];
    });
  } else {
    fields = splitByRules(card, input);
    // 아무 칸에도 못 넣었으면 입력 전체를 첫 칸에 둔다 (나머지는 되묻기)
    if (!Object.values(fields).some(Boolean)) fields[card.fields[0].key] = String(input).trim();
  }

  // 비어 있는 필수 칸만 되묻는다. (코딩 레퍼런스 2장: 빈 필수 칸만 노란 강조)
  const followups = {};
  card.fields.forEach((field) => {
    if (field.required && !fields[field.key]) followups[field.key] = field.followUp;
  });

  return { fields, followups };
}

// ---------- 문장 다듬기 도우미 ----------
// 끝맺음 번호(form): 0 = 합니다체 · 1 = 해요체 · 2 = 반말(동기)

// 한글 한 글자를 초성·중성·종성 번호로 나누고 다시 합친다. (종성 0 = 받침 없음, 8 = ㄹ, 17 = ㅂ, 20 = ㅆ)
const HANGUL_BASE = 0xac00;
function isHangul(ch) {
  const code = String(ch || "").charCodeAt(0);
  return code >= HANGUL_BASE && code <= 0xd7a3;
}
function splitJamo(ch) {
  const n = ch.charCodeAt(0) - HANGUL_BASE;
  return { cho: Math.floor(n / 588), jung: Math.floor((n % 588) / 28), jong: n % 28 };
}
function joinJamo(cho, jung, jong) {
  return String.fromCharCode(HANGUL_BASE + cho * 588 + jung * 28 + jong);
}
function jongOf(ch) {
  return isHangul(ch) ? splitJamo(ch).jong : -1;
}
function withJong(ch, jong) {
  const j = splitJamo(ch);
  return joinJamo(j.cho, j.jung, jong);
}

// 마지막 글자에 받침이 있는지. 숫자는 읽는 소리 기준(영·일·삼·육·칠·팔은 받침 있음).
function hasBatchim(word) {
  const ch = String(word).trim().slice(-1);
  if (!ch) return false;
  if (isHangul(ch)) return splitJamo(ch).jong !== 0;
  return "013678".includes(ch);
}

function endsWithRieul(word) {
  return jongOf(String(word).trim().slice(-1)) === 8;
}

function resolveParticle(token, word, form) {
  const batchim = hasBatchim(word);
  switch (token) {
    case "은는":
      return batchim ? "은" : "는";
    case "이가":
      return batchim ? "이" : "가";
    case "을를":
      return batchim ? "을" : "를";
    case "으로로":
      return batchim && !endsWithRieul(word) ? "으로" : "로";
    case "입니다":
      return ["입니다", batchim ? "이에요" : "예요", batchim ? "이야" : "야"][form];
    default:
      return "";
  }
}

// 메모처럼 적힌 끝(~함 · ~음 · ~임 · ~됨)을 문장 끝으로 바꾸는 규칙은 content.js의 TONE_TABLE.memo에 있다.
const PREDICATE_RULES = TONE_TABLE.memo;

// 두 글의 같은 앞부분. 의도 체크 근거 구절은 끝맺음을 바꾼 뒤에도 본문에 그대로 남는 이 앞부분을 쓴다.
function commonPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  const prefix = a.slice(0, i).trimEnd();
  return prefix.length >= Math.min(4, a.length) ? prefix : b;
}

// 메모체 규칙 하나가 값에 맞는지 ('~음'은 앞 글자에 받침이 있을 때만: 많음 O / 다음 X)
function memoRuleFor(value) {
  return PREDICATE_RULES.find((rule) => {
    if (!value.endsWith(rule.suffix) || value.length === rule.suffix.length) return false;
    const stem = value.slice(0, -rule.suffix.length);
    if (rule.stemRe && !rule.stemRe.test(stem)) return false;
    return !rule.stem || hasBatchim(stem);
  });
}

// 반환: { text: 문장 끝까지 바뀐 값, evidence: 바뀌고 난 뒤에도 본문에 그대로 남는 앞부분 }
// fact: 사실을 말하는 칸이면 규칙의 fact 형태(있으면)를 쓴다. '내 판단' 칸은 forms(생각 표현).
function toPredicate(value, form, fact) {
  const rule = memoRuleFor(value);
  if (!rule) return { text: value, evidence: value };
  const stem = value.slice(0, -rule.suffix.length);
  let text;
  if (rule.copula) text = stem + resolveParticle("입니다", stem, form);
  else if (rule.bieup) {
    // ㅂ 불규칙: 어려움 → 어렵습니다 / 어려워요 / 어려워
    const last = stem.slice(-1);
    text = form === 0 ? `${stem.slice(0, -1)}${withJong(last, 17)}습니다` : `${stem}워${form === 1 ? "요" : ""}`;
  }
  else if (rule.stem) text = form === 0 ? `${stem}습니다` : convertDeclarative(`${stem}습니다`, form) || `${stem}습니다`;
  else text = stem + (fact && rule.fact ? rule.fact : rule.forms)[form];
  return { text, evidence: commonPrefix(value, text) };
}

const TEMPLATE_TOKEN = /\{(v|p|은는|이가|을를|으로로|입니다)\}/g;

// 문장 틀 하나를 값으로 채운다. evidence는 의도 체크가 본문에서 찾을 구절이다.
function renderTemplate(template, value, form, fact) {
  let last = "";
  let evidence = value;

  const text = template.replace(TEMPLATE_TOKEN, (_, token) => {
    if (token === "v") {
      last = value;
      evidence = value;
      return value;
    }
    if (token === "p") {
      const result = toPredicate(value, form, fact);
      last = result.text;
      evidence = result.evidence;
      return result.text;
    }
    return resolveParticle(token, last, form);
  });

  // 값이 ?/! 로 끝나면 틀의 마침표는 뺀다.
  return { text: text.replace(/([?!])\./g, "$1"), evidence };
}

// 문장 끝 마침표와 공백만 정리한다. (?와 !는 그대로 둔다)
function cleanValue(value) {
  return String(value || "").trim().replace(/[.\s]+$/, "");
}

// '특별히 막힌 점은 없습니다'처럼 값이 있어도 '없음'을 뜻하는 칸 (수정 이유에서 언급하지 않고, 연결어도 붙이지 않는다)
const MEANS_NONE_RE = /^(?:특별히|별다른|딱히|특이 ?사항).*(?:없|않)|^(?:없음|해당 없음|없습니다)\.?$/;

// ---------- 칸 값의 모양 판별 ----------
// question(…?) / sentence(완성 문장) / ji("~지"형) / memo(~함·~음) / noun(명사구)
const SENTENCE_END_RE = /(?:니다|[어아여해세게에네죠래워줘봐돼려]요|겠어|었어|았어|했어|있어|없어|줘)$/;
const JI_END_RE = /(?:는지|은지|인지|한지|할지|을지|일지|던지|될지|된지)$/;

// 물음표가 없어도 질문 끝(~나요 · ~까요 · ~습니까)이면 질문으로 본다 ("어떻게 해야하나요" → 질문)
const QUESTION_END_RE = /(?:나요|까요|가요|니까|는지요|을까|ㄹ까)$/;

function classifyValue(value) {
  const v = String(value).trim();
  if (/\?$/.test(v) || QUESTION_END_RE.test(v.replace(/[.!\s]+$/, ""))) return "question";
  const body = v.replace(/[.!\s]+$/, "");
  if (JI_END_RE.test(body)) return "ji";
  if (/[.!]$/.test(v) || SENTENCE_END_RE.test(body)) return "sentence";
  if (memoRuleFor(body)) return "memo";
  return "noun";
}

// ---------- 끝맺음 맞추기 (메시지 한 통 = 문체 하나) ----------
// 끝맺음 번호(form): 0 = 합니다체 · 1 = 해요체 · 2 = 반말. 변환 표는 content.js의 TONE_TABLE.
// 표에 없는 끝은 아래 기본 규칙(받침으로 바꾸기)으로 바꾸고, 그래도 안 되면 그대로 둔다.

// 이 문장 끝이 이미 정한 문체인지. 합니다체 의문문은 "~ㄹ까요?"도 허용 (팀 결정 10/05)
const BANMAL_END_RE = /(?:어|아|해|돼|야|줘|봐|와|워|려|겨|라|러|게|래|까|나|지|자|네|군)$/;
function toneValid(body, isQuestion, form) {
  if (form === 0) return /(?:니다|니까|십시오)$/.test(body) || (isQuestion && /까요$/.test(body));
  if (form === 1) return /요$/.test(body);
  return BANMAL_END_RE.test(body) && !/요$/.test(body);
}

// 표의 한 칸을 실제 끝 글자 목록으로 ({이에요} → 이에요·예요, {이야} → 이야·야)
function expandEnding(ending) {
  if (ending === "{이에요}") return ["이에요", "예요"];
  if (ending === "{이야}") return ["이야", "야"];
  return [ending];
}
function resolveEnding(ending, stem) {
  if (ending === "{이에요}") return hasBatchim(stem) ? "이에요" : "예요";
  if (ending === "{이야}") return hasBatchim(stem) ? "이야" : "야";
  return ending;
}

// 표에서 가장 긴 끝을 찾아 정한 문체로 바꾼다. 반환: null(표에 없음) 또는 { body, punct, changed }
function tableEnding(body, rows, form) {
  let best = null;
  rows.forEach((row) => {
    const members = [];
    row.forms.forEach((ending, tone) => expandEnding(ending).forEach((e) => members.push({ e, tone, valid: tone === form })));
    (row.also || []).forEach((list, tone) => list.forEach((e) => members.push({ e, tone, valid: tone === form })));
    members.forEach((m) => {
      if (body.endsWith(m.e) && (!best || m.e.length > best.m.e.length)) best = { row, m };
    });
  });
  if (!best) return null;
  if (best.m.valid) return { body, punct: null, changed: false };
  const stem = body.slice(0, body.length - best.m.e.length);
  return { body: stem + resolveEnding(best.row.forms[form], stem), punct: best.row.punct ? best.row.punct[form] : null, changed: true };
}

// 받침 없는 마지막 글자(base)를 해요체 어간으로 (요를 붙이기 전). pre는 그 앞 글자들
function haeyoStem(pre, base) {
  if (base === "하") return `${pre}해`;
  if (base === "되") return `${pre}돼`;
  if (base === "시") return `${pre}세`;
  if (base === "르" && isHangul(pre.slice(-1))) {
    // 르 불규칙: 다르 → 달라, 부르 → 불러
    const p = pre.slice(-1);
    return pre.slice(0, -1) + withJong(p, 8) + ([0, 8].includes(splitJamo(p).jung) ? "라" : "러");
  }
  const { cho, jung } = splitJamo(base);
  const next = { 8: 9, 13: 14, 20: 6, 18: 4, 11: 10 }[jung]; // ㅗ→ㅘ ㅜ→ㅝ ㅣ→ㅕ ㅡ→ㅓ ㅚ→ㅙ
  if (next !== undefined) return pre + joinJamo(cho, next, 0);
  if (jung === 16 || jung === 19) return `${pre}${base}어`; // ㅟ·ㅢ: 바뀌어, 띄어
  return pre + base; // ㅏ ㅓ ㅐ ㅔ ㅕ 등은 그대로 (가요, 서요, 내요)
}

// 합니다체(…니다) → 해요체. 바꿀 수 없으면 null
function toHaeyo(body) {
  if (body.endsWith("습니다")) {
    const stem = body.slice(0, -3);
    const last = stem.slice(-1);
    if (!isHangul(last)) return null;
    const { jung, jong } = splitJamo(last);
    if (jong === 20) return `${stem}어요`; // 했습니다 → 했어요
    if (jong === 17) return `${stem.slice(0, -1)}${withJong(last, 0)}워요`; // 어렵습니다 → 어려워요
    return stem + ([0, 2, 8].includes(jung) ? "아요" : "어요"); // 같습니다 → 같아요, 없습니다 → 없어요
  }
  if (body.endsWith("니다")) {
    const stem = body.slice(0, -2);
    const last = stem.slice(-1);
    if (jongOf(last) !== 17) return null;
    const base = withJong(last, 0);
    const pre = stem.slice(0, -1);
    if (base === "이") return pre + (hasBatchim(pre) ? "이에요" : "예요"); // 중입니다 → 중이에요
    return `${haeyoStem(pre, base)}요`; // 합니다 → 해요, 드립니다 → 드려요, 바뀝니다 → 바뀌어요
  }
  return null;
}

// 해요체(…요) → 합니다체. 바꿀 수 없으면 null
function toHamnida(body) {
  if (/(?:이에요|예요)$/.test(body)) return body.replace(/(?:이에요|예요)$/, "입니다");
  if (body.endsWith("세요")) return `${body.slice(0, -2)}십니다`;
  if (!body.endsWith("요")) return null;
  const core = body.slice(0, -1);
  const last = core.slice(-1);
  const pre = core.slice(0, -1);
  const prev = pre.slice(-1);
  if (last === "어" || last === "아") {
    if (!isHangul(prev)) return null;
    return hasBatchim(prev) ? `${pre}습니다` : `${pre.slice(0, -1)}${withJong(prev, 17)}니다`; // 좋겠어요 → 좋겠습니다, 바뀌어요 → 바뀝니다
  }
  if (last === "해") return `${pre}합니다`;
  if (last === "돼") return `${pre}됩니다`;
  if (last === "게" && jongOf(prev) === 8) return `${pre.slice(0, -1)}${withJong(prev, 0)}겠습니다`; // 드릴게요 → 드리겠습니다
  if (!isHangul(last) || splitJamo(last).jong !== 0) return null;
  const { cho, jung } = splitJamo(last);
  if (cho === 11 && jung === 14 && isHangul(prev)) return `${pre.slice(0, -1)}${withJong(prev, 17)}습니다`; // 어려워요 → 어렵습니다
  const back = { 9: 8, 14: 13, 6: 20, 10: 11 }[jung]; // ㅘ→ㅗ ㅝ→ㅜ ㅕ→ㅣ ㅙ→ㅚ
  if (back === undefined && ![0, 1, 4, 5].includes(jung)) return null;
  return `${pre}${joinJamo(cho, back === undefined ? jung : back, 17)}니다`; // 드려요 → 드립니다, 봐요 → 봅니다
}

// 해요체 → 반말. 바꿀 수 없으면 null
function toBanmal(body) {
  if (body.endsWith("이에요")) return `${body.slice(0, -3)}이야`;
  if (body.endsWith("예요")) return `${body.slice(0, -2)}야`;
  if (body.endsWith("세요")) return null;
  return body.endsWith("요") ? body.slice(0, -1) : null;
}

// 평서문 기본 규칙. 바꿀 수 없으면 null
function convertDeclarative(body, form) {
  let out = null;
  if (body.endsWith("니다")) {
    const haeyo = toHaeyo(body);
    out = form === 0 ? body : haeyo && (form === 1 ? haeyo : toBanmal(haeyo));
  } else if (body.endsWith("요")) {
    out = form === 1 ? body : form === 0 ? toHamnida(body) : toBanmal(body);
  } else if (/(?:어|아|해|돼|줘|봐|와|워|려|겨)$/.test(body)) {
    const haeyo = `${body}요`;
    out = form === 2 ? body : form === 1 ? haeyo : toHamnida(haeyo);
  }
  return out && toneValid(out, false, form) ? out : null;
}

// 어간 + ㄹ까 (되 → 될까, 남기 → 남길까, 있 → 있을까)
function addKka(stem) {
  const last = stem.slice(-1);
  if (!isHangul(last)) return `${stem}까`;
  const jong = splitJamo(last).jong;
  if (jong === 0) return `${stem.slice(0, -1)}${withJong(last, 8)}까`;
  return jong === 8 ? `${stem}까` : `${stem}을까`;
}

// 의문문 기본 규칙. 합니다체·반말은 "~ㄹ까(요)?"로, 해요체는 "~나요?"도 그대로. 바꿀 수 없으면 null
function convertQuestionBody(body, form) {
  let stem = null;
  let m;
  if ((m = body.match(/^(.+)나요$/))) stem = m[1];
  else if ((m = body.match(/^(.+)습니까$/))) stem = m[1];
  else if ((m = body.match(/^(.+)니까$/)) && jongOf(m[1].slice(-1)) === 17) stem = m[1].slice(0, -1) + withJong(m[1].slice(-1), 0);
  let out = null;
  if (stem) out = addKka(stem) + (form === 2 ? "" : "요");
  else if (/까요$/.test(body)) out = form === 2 ? body.slice(0, -1) : body;
  else if (/까$/.test(body)) out = form === 2 ? body : `${body}요`;
  else if (/(?:어|아|해|돼)요$/.test(body)) out = form === 2 ? body.slice(0, -1) : null;
  else if (/(?:어|아|해|돼)$/.test(body)) {
    if (form === 2) out = body;
    else if (form === 1) out = `${body}요`;
    else if (/해$/.test(body)) out = `${body.slice(0, -1)}할까요`;
    else if (/돼$/.test(body)) out = `${body.slice(0, -1)}될까요`;
    else if (isHangul(body.slice(-2, -1)) && hasBatchim(body.slice(-2, -1))) out = `${body.slice(0, -1)}을까요`; // 괜찮아 → 괜찮을까요
  }
  if (out && form === 2) {
    // 반말에서는 높임을 뺀다 (주실 → 줄, 하실 → 할, 부탁드려도 → 부탁해도)
    out = out.replace(/주실/g, "줄").replace(/하실/g, "할").replace(/드려도 /g, "해도 ");
  }
  return out && toneValid(out, true, form) ? out : null;
}

// 문장 하나의 끝맺음을 정한 문체로. 반환: { text, status: changed | same | unknown | skip }
function convertSentence(sentence, form) {
  const m = String(sentence).match(/^([\s\S]*?)([.?!]*)$/);
  const body = m[1].trimEnd();
  const punct = m[2];
  // 한글로 끝나지 않는 줄(괄호 등)과 인사("안녕하세요, 담당자님.")는 문장 끝맺음이 아니라서 그대로 둔다.
  if (!body || !isHangul(body.slice(-1)) || /님$/.test(body)) return { text: sentence, status: "skip" };
  const isQuestion = punct.includes("?");
  const rows = isQuestion ? TONE_TABLE.question : [...TONE_TABLE.request, ...TONE_TABLE.statement];
  const hit = tableEnding(body, rows, form);
  if (hit) return { text: hit.body + (hit.punct || punct || "."), status: hit.changed ? "changed" : "same" };
  if (toneValid(body, isQuestion, form)) return { text: sentence, status: "same" };
  const out = isQuestion ? convertQuestionBody(body, form) : convertDeclarative(body, form);
  if (out) return { text: out + (punct || "."), status: "changed" };
  return { text: sentence, status: "unknown" };
}

// 마지막 단계: 메시지 전체의 모든 문장을 나눠 끝맺음을 정한 문체로 맞춘다.
// 목록 줄("- 기한: …")은 값이 완성 문장·질문일 때만 바꾸고(마침표 없이), 괄호 줄은 그대로 둔다.
function unifyTone(text, form) {
  return polishText(convertTone(text, form), form);
}

// 맞춤법 사전(SPELLING_DICT · 모두)과 구어체 사전(COLLOQUIAL_DICT · 존댓말 받는 사람만)
const dictsFor = (form) => (form === 2 ? SPELLING_DICT : [...SPELLING_DICT, ...COLLOQUIAL_DICT]);

// 사전으로 바뀌는 표현 목록 [[원래, 바뀐 것], …] (수정 이유에 알려 준다 · 9·10)
function dictChanges(text, form) {
  const out = [];
  dictsFor(form).forEach(([re, to]) => {
    const once = new RegExp(re.source, re.flags.replace("g", ""));
    (String(text).match(re) || []).forEach((hit) => {
      const from = hit.trim();
      const changed = hit.replace(once, to).trim();
      if (from !== changed && !out.some(([f]) => f === from)) out.push([from, changed]);
    });
  });
  return out;
}

// 맞춤법·띄어쓰기(content.js SPELLING_FIXES)·맞춤법/구어체 사전과 존댓말 1인칭(나 → 저)을 고친다. 뜻은 바꾸지 않는다.
function polishText(text, form) {
  let out = text;
  dictsFor(form).forEach(([re, to]) => {
    out = out.replace(re, to);
  });
  SPELLING_FIXES.forEach(([re, to]) => {
    out = out.replace(re, to);
  });
  if (form !== 2) {
    FIRST_PERSON_POLITE.forEach(([from, to]) => {
      out = out.replace(new RegExp(`(^|[\\s"'(])${from}(?=[\\s,.?!]|$)`, "g"), `$1${to}`);
    });
    out = out.replace(/(^|[\s"'(])내(?= )/g, "$1제"); // 내 판단 → 제 판단
  }
  return out;
}

function convertTone(text, form) {
  return text
    .split("\n")
    .map((line) => {
      const bullet = line.match(/^(-\s*[^:]+:\s*)(.*)$/);
      if (bullet) {
        if (!["sentence", "question"].includes(classifyValue(bullet[2]))) return line;
        return bullet[1] + convertSentence(bullet[2], form).text.replace(/\.$/, "");
      }
      return (line.match(/[^.?!]+[.?!]*\s*/g) || [line])
        .map((part) => {
          const space = part.match(/\s*$/)[0];
          return convertSentence(part.trim(), form).text + space;
        })
        .join("")
        .trimEnd();
    })
    .join("\n");
}

// 끝맺음을 바꾼 뒤에도 근거 구절이 본문에 글자 그대로 있도록, 본문에 있는 앞부분까지만 남긴다.
// form을 주면 근거 구절에도 본문과 같은 맞춤법·1인칭 다듬기를 먼저 적용한다 (해봄 → 해 봄, 나를 → 저를)
function fitEvidence(evidence, text, form) {
  const out = {};
  Object.entries(evidence).forEach(([key, original]) => {
    const phrase = original && form !== undefined ? polishText(original, form) : original;
    let p = phrase;
    while (p && !text.includes(p)) p = p.slice(0, -1);
    p = p.trimEnd();
    out[key] = p.length >= Math.min(4, phrase.length) ? p : phrase;
  });
  return out;
}

const pickForm = (template, form) => (Array.isArray(template) ? template[form] ?? template[template.length - 1] : template || "");

// 후보 목록이면 조합 번호(variation)에 맞는 후보 하나를 고른다. 후보 목록 = [[합니다체, 해요체, 반말], [ … ], …]
// [다시 만들기]를 누를 때마다 variation이 1씩 커져 인사·연결어·끝인사 조합이 바뀐다. 칸 값은 바꾸지 않는다.
const isChoices = (entry) => Array.isArray(entry) && entry.length > 0 && Array.isArray(entry[0]);
function choose(entry, variation) {
  return isChoices(entry) ? entry[(variation || 0) % entry.length] : entry;
}

// 칸 값이 연결어미로 끝나면 메모체로 바꾼다 ("회신이 안 와서" → "회신이 안 옴" · 4). 바꿀 수 없으면 그대로.
function fixEnding(value) {
  const v = cleanValue(value);
  return CONNECTIVE_END_RE.test(v) ? clauseValue(v) : value;
}
// 화면 2 안내용: 연결어미로 끝나는데 엔진이 메모체로 바꿀 수 없는 값 (노란 칸 + "문장 끝을 정리해 주세요")
function needsEndingFix(value) {
  const v = cleanValue(value);
  return Boolean(v) && CONNECTIVE_END_RE.test(v) && clauseValue(v) === v;
}

// 선택지 정리 (11): 줄바꿈·①②·"또는"·쉼표로 나눈 항목. 항목 끝 마침표는 뺀다.
function optionItems(value) {
  const v = String(value || "").trim();
  let items;
  if (/\n|[①②③④⑤]/.test(v)) items = v.split(/\n|(?=[①②③④⑤])/);
  else if (/\s또는\s/.test(v)) items = v.split(/\s또는\s/);
  else if (/,\s/.test(v)) items = v.split(/,\s*/);
  else items = [v];
  return items.map((s) => s.replace(/^\s*(?:[①②③④⑤]|\d+[.)]|[-•·])\s*/, "").replace(/[.。\s]+$/, "").trim()).filter(Boolean);
}
// 문장용: "① A, ② B 두 가지" · 목록용(더 간결하게): "① A, ② B"
function optionText(value, withCount) {
  const items = optionItems(value);
  if (items.length < 2) return items[0] || String(value || "").trim();
  const list = items.map((item, i) => `${OPTION_MARKS[i] || `${i + 1})`} ${item}`).join(", ");
  return withCount && OPTION_COUNT[items.length] ? `${list} ${OPTION_COUNT[items.length]}` : list;
}

// 질문을 "~지" 꼴로: "대체적 절차로 넘어가야 할까요?" → "대체적 절차로 넘어가야 할지" (바꿀 수 없으면 null · 8·12)
function askToJi(value) {
  const v = cleanValue(value);
  if (classifyValue(v) === "ji") return v.replace(/\?+$/, "");
  const rule = ASK_TO_JI.find(([re]) => re.test(v));
  return rule ? v.replace(rule[0], rule[1]) : null;
}

// 칸 하나를 문장으로. 완성 문장·질문은 그대로 두고(끝맺음은 마지막 단계에서 맞춘다), 나머지는 알맞은 문장 틀에 끼운다.
// noConnector: 본문 첫 문장이라 "다만" 같은 대조 연결어를 붙이지 않을 때
function renderStep(step, raw, form, variation, noConnector) {
  // ", "로 이어 붙인 값(구조화에서 한 칸에 두 조각이 들어간 경우)은 조각마다 문장으로 만든다 (1)
  const parts = String(raw).split(/,\s+/);
  if (parts.length > 1 && parts.every((part) => ["memo", "sentence", "question"].includes(classifyValue(cleanValue(part))))) {
    const first = renderStep(step, parts[0], form, variation, noConnector);
    const rest = parts.slice(1).map((part) => renderStep({ key: step.key, opinion: step.opinion }, part, form, variation, true).text);
    return { text: [first.text, ...rest].join(" "), evidence: first.evidence };
  }
  const shape = classifyValue(raw);
  // "특별히 막힌 점은 없습니다"처럼 '없음'을 말하는 값에는 "다만" 같은 연결어를 붙이지 않는다.
  const connector = noConnector || MEANS_NONE_RE.test(String(raw).trim()) ? "" : pickForm(choose(step.connector, variation), form);
  if (shape === "sentence" || shape === "question") {
    const value = String(raw).trim();
    // 질문은 물음표로, 나머지는 마침표로 끝낸다 (질문 뒤에 "입니다"·요청 틀을 붙이지 않는다)
    const sentence = /[.?!]$/.test(value) ? value : `${value}${shape === "question" ? "?" : "."}`;
    return { text: connector ? `${connector} ${sentence}` : sentence, evidence: value.replace(/[.?!\s]+$/, "") };
  }
  const value = cleanValue(raw);
  let template;
  if (shape === "ji") template = step.ji || JI_DEFAULT; // "~지"형에는 조사를 붙이지 않는다
  else if (shape === "memo") template = step.memo || "{c}{p}.";
  else {
    const alt = (step.nounIf || []).find((a) => a.re.test(value));
    template = alt ? alt.tpl : step.noun;
  }
  // '내 판단'(opinion) 칸이 아니면 메모체를 사실 표현으로 ("~해야함" → "~해야 합니다")
  return renderTemplate(pickForm(template, form).replace("{c}", connector ? `${connector} ` : ""), value, form, !step.opinion);
}

// 더 간결하게의 목록 줄: 값 그대로 (마침표만 뺌 · 끝맺음은 마지막 단계에서 맞춘다)
function renderBullet(raw) {
  let value = cleanValue(raw);
  if (classifyValue(value) === "question" && !/[?!]$/.test(value)) value += "?"; // 물음표 없는 질문
  return { text: value, evidence: value.replace(/[?!]+$/, "") };
}

// 피하고 싶은 표현: 쉼표·줄바꿈으로 나눠 적은 목록
function parseAvoid(text) {
  return String(text || "")
    .split(/[,，、\n]/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function splitSentences(text) {
  return (String(text).match(/[^.?!]+[.?!]*/g) || []).map((s) => s.trim()).filter(Boolean);
}


// 메시지 한 통 = 문체 하나. 먼저 문체를 정한다: 클라이언트 = 합니다체, 동기 = 반말 [확인 필요],
// 선배·인차지 = 내 말투 끝맺음 설정. (CLAUDE.md '반드시 지킬 것') 반환: 0 합니다체 · 1 해요체 · 2 반말
function toneFormFor(recipient, profile) {
  const style = PARTNER_STYLE[recipient.id] || {};
  const ending = style.ending || profile.ending;
  return ending === "banmal" ? 2 : ending === "haeyo" ? 1 : 0;
}

// ---------- 호출 2 · 메시지 생성 ----------

// 입력: { card, fields, recipient, profile, preferred }
//   recipient: cards.json partners 항목 { id, label, honorific }
//   profile: { sentenceLength: short|normal|detailed, requestStyle: direct|soft|careful, ending: hamnida|haeyo, avoidPhrases }
// 출력: { variants: [{ type: mine|concise|soft, text, evidence: {칸키: 근거 구절}, reasons: [...] }], reasons: [...] }
//   맨 바깥 reasons는 '내 말투안'의 수정 이유와 같다. 탭마다 수정 이유가 다르다. (B3)
// options.variation: [다시 만들기] 조합 번호 (0 = 처음 만들 때 · 같은 입력·같은 번호면 항상 같은 문장)
// 확정된 칸의 내용은 빠뜨리거나 바꾸지 않는다. 바꾸는 것은 문장 끝맺음과 앱이 붙이는 인사·연결어·끝인사뿐이다.
async function generateMessages({ card, fields, recipient, profile }, options = {}) {
  await new Promise((resolve) => setTimeout(resolve, ENGINE_DELAY_MS));
  const variation = Math.max(0, Number(options.variation) || 0);

  const flow = MESSAGE_FLOW[card.id];
  const style = PARTNER_STYLE[recipient.id] || { greeting: "{h}," };
  const form = toneFormFor(recipient, profile);
  const requestStyle = style.formal && profile.requestStyle === "direct" ? "soft" : profile.requestStyle;
  const pick = (template) => pickForm(template, form);
  const labelOf = (key) => card.fields.find((field) => field.key === key).label;

  // 피하고 싶은 표현은 앱이 붙이는 문장(인사·첫 문장·끝인사 등)에서만 뺀다.
  // 사용자가 직접 적은 칸 값은 의도를 바꾸지 않도록 그대로 둔다.
  const avoid = parseAvoid(profile.avoidPhrases);
  const removed = new Set();
  // 후보를 차례로 보고, 피하고 싶은 표현이 든 문장을 뺀 결과가 남는 첫 후보를 쓴다.
  const fixed = (...candidates) => {
    for (const candidate of candidates) {
      if (!candidate) continue;
      const kept = splitSentences(pick(choose(candidate, variation))).filter((sentence) => {
        const hit = avoid.find((word) => sentence.includes(word));
        if (hit) removed.add(hit);
        return !hit;
      });
      if (kept.length) return kept.join(" ");
    }
    return "";
  };
  const line = (...parts) => parts.filter(Boolean).join(" ");
  const join = (lines) => lines.filter(Boolean).join("\n");

  // 채워진 칸만 쓴다. 비어 있는 칸은 문장에서도 빠진다. (B1)
  // 연결어미로 끝난 값은 메모체로 바꾸고(4), 선택지는 "① A, ② B 두 가지"로 정리한다(11).
  const raw = {};
  const bulletRaw = {};
  card.fields.forEach((field) => {
    const value = String(fields[field.key] || "").trim();
    if (!value) return;
    if (field.key === "options") {
      raw.options = optionText(value, true);
      bulletRaw.options = optionText(value, false);
    } else {
      raw[field.key] = fixEnding(value);
      bulletRaw[field.key] = raw[field.key];
    }
  });

  // 인차지는 결론 칸을 맨 앞으로
  let steps = flow.steps.filter((step) => raw[step.key]);
  const lead = style.leadFirst ? LEAD_FIELD[card.id] : null;
  if (lead && steps.some((step) => step.key === lead)) {
    steps = [steps.find((step) => step.key === lead), ...steps.filter((step) => step.key !== lead)];
  }
  const tailStep = flow.tail && raw[flow.tail.key] ? flow.tail : null;

  // 본문: 칸마다 한 문장. 본문 첫 문장이 대조 연결어("다만")로 시작하지 않게 한다.
  // softSteps: '더 부드럽게' 탭은 content.js SOFT_STEPS의 틀을 같은 칸 위에 덮어쓴다 (8)
  const softSteps = SOFT_STEPS[card.id] || {};
  const renderBody = (useSoft) => {
    const ev = {};
    const text = steps
      .map((step, i) => {
        const s = useSoft && softSteps[step.key] ? { ...step, ...softSteps[step.key] } : step;
        const r = renderStep(s, raw[step.key], form, variation, i === 0 && step.contrast);
        ev[step.key] = r.evidence;
        return r.text;
      })
      .join(" ");
    return { text, ev };
  };
  const mineBody = renderBody(false);
  const softBody = renderBody(true);
  const body = mineBody.text;
  const evidence = mineBody.ev;
  const softEvidence = softBody.ev;

  // 질문 준비실은 '묻고 싶은 것'을 마지막 문장에 (B2). '더 부드럽게'는 "~할지 여쭤봐도 괜찮을까요?"로 (바꿀 수 있을 때)
  const askJi = tailStep ? askToJi(raw[tailStep.key]) : null;
  let tail = null;
  let softTail = null;
  if (tailStep) {
    const r = renderStep(tailStep, raw[tailStep.key], form, variation);
    evidence[tailStep.key] = r.evidence;
    tail = r.text;
    if (askJi && softSteps.softAsk) {
      softTail = pick(softSteps.softAsk).replace("{j}", askJi);
      softEvidence[tailStep.key] = askJi;
    } else {
      softTail = tail;
      softEvidence[tailStep.key] = r.evidence;
    }
  }

  // 요청 끝인사: 요청을 담은 칸이 명사구로 채워졌을 때만. 급한 기한이면 여유 있는 말을 뺀 끝인사. (B1)
  const closingKey = CLOSING_FIELD[card.id];
  const allowClosing = Boolean(closingKey && raw[closingKey] && !["sentence", "question"].includes(classifyValue(raw[closingKey])));
  const urgent = Object.values(raw).some((value) => URGENT_RE.test(value));
  const closings = urgent ? MESSAGE_CLOSINGS_URGENT : MESSAGE_CLOSINGS;
  const softer = { direct: "soft", soft: "careful", careful: "careful" };
  const closing = (styleKey) => (allowClosing ? fixed(closings[styleKey], closings.direct) : null);
  const extra = profile.sentenceLength === "detailed" && form !== 2 ? fixed(MESSAGE_EXTRA) : null;
  const greeting = recipient.honorific ? fixed(style.greeting.replace("{h}", recipient.honorific)) : "";
  const baseOpener = style.formal ? flow.formalOpener : flow.opener[requestStyle] || flow.opener.soft;
  // 인차지에게 질문 준비실: 첫 줄에 용건("~할지 여쭤볼 게 있습니다")을 먼저 밝힌다. 나머지 순서는 그대로 (12)
  const leadAsk = card.id === "question" && style.leadFirst && askJi ? LEAD_ASK_OPENER.map((tpl) => tpl.replace("{j}", askJi)) : null;
  const opener = leadAsk || baseOpener;

  // 내 말투안: 칸마다 한 문장 → (충분히 설명) → 질문 → 끝인사
  const mine = join([
    line(greeting, fixed(opener)),
    body,
    extra,
    tail,
    profile.sentenceLength === "short" ? null : closing(requestStyle),
  ]);

  // 더 간결하게: 칸 이름과 값만 항목으로 (질문은 마지막 줄)
  const bulletKeys = [...steps.map((step) => step.key), tailStep && tailStep.key].filter(Boolean);
  const conciseEvidence = {};
  const bullets = bulletKeys.map((key) => {
    const r = renderBullet(bulletRaw[key]);
    conciseEvidence[key] = r.evidence;
    return `- ${labelOf(key)}: ${r.text}`;
  });
  const concise = join([
    line(greeting, fixed(style.formal || leadAsk ? opener : flow.concise, opener)),
    ...bullets,
    profile.sentenceLength === "short" ? null : closing("direct"),
  ]);

  // 더 부드럽게: 배려하는 첫 문장 + 한 단계 더 부드러운 끝인사
  // 인차지(결론 먼저)에게는 첫 줄을 한 문장으로: 두 문장짜리 배려 인사는 결론을 뒤로 밀어낸다
  const softOpener = style.leadFirst && isChoices(flow.soft) ? flow.soft.filter((c) => splitSentences(pick(c)).length === 1) : flow.soft;
  const softFirst = leadAsk ? fixed(leadAsk) : fixed(softOpener.length ? softOpener : flow.soft, opener);
  const soft = join([line(greeting, softFirst), softBody.text, extra, softTail, closing(softer[requestStyle])]);

  // 수정 이유: cards.json reasons에서 채워진 칸·탭·받는 사람에 맞는 문구만 골라 최대 3줄 (B3)
  const copy = typeof DATA !== "undefined" && DATA && DATA.reasons;
  const filled = (key) => raw[key] && !MEANS_NONE_RE.test(raw[key]);
  // 사전으로 바꾼 표현이 있으면 "'빡세서'를 '빠듯해서'로 다듬었어요."처럼 한 줄 (9·10 · 칸 줄 대신)
  const changes = dictChanges(Object.values(raw).join("\n"), form);
  const dictLine =
    copy && copy.polished && changes.length
      ? copy.polished.replace(
          "{changes}",
          changes
            .slice(0, 2)
            .map(([from, to]) => `'${from}'${resolveParticle("을를", from, form)} '${to}'${resolveParticle("으로로", to, form)}`)
            .join(", "),
        )
      : null;
  const reasonsFor = (tab, index) => {
    if (!copy) return [];
    const matches = ((copy.byField || {})[card.id] || []).filter((r) => r.requires.every(filled));
    const fieldLine = matches.length ? matches[Math.min(index, matches.length - 1)].text : null;
    const partnerLine = leadAsk && copy.leadIntro ? copy.leadIntro : (copy.byPartner || {})[recipient.id];
    const lastLine = removed.size ? copy.avoid.replace("{words}", [...removed].join(", ")) : partnerLine;
    return [(copy.byTab || {})[tab], dictLine || fieldLine, lastLine].filter(Boolean).slice(0, 3);
  };

  // 마지막 단계: 탭 3종 모두 문장을 나눠 끝맺음을 정한 문체 하나로 맞추고, 근거 구절을 바뀐 본문에 맞춘다.
  const finish = (text, ev) => {
    const unified = unifyTone(text, form);
    return { text: unified, evidence: fitEvidence(ev, unified, form) };
  };
  const variants = [
    { type: "mine", ...finish(mine, evidence), reasons: reasonsFor("mine", 0) },
    { type: "concise", ...finish(concise, conciseEvidence), reasons: reasonsFor("concise", 1) },
    { type: "soft", ...finish(soft, softEvidence), reasons: reasonsFor("soft", 2) },
  ];
  return { variants, reasons: variants[0].reasons };
}
