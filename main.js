// 화면 문구·카드·칸·받는 사람·말투 옵션은 data/cards.json에서 읽는다. (콘텐츠팀 기준 · 문구는 cards.json에서 고친다)
// 샘플 30건(data/malgyeol_sample_data.json)은 문장 정리 엔진의 구조화(engine.js)가 참고한다.
const DATA_URL = "data/cards.json";
const SAMPLE_URL = "data/malgyeol_sample_data.json";

let DATA = null; // cards.json
let SAMPLE_DATA = null; // 샘플 데이터 (engine.js가 읽는다)

// 말투 저장 형식: 코딩 레퍼런스 2장 8절
// malgyeol.profile = { sentenceLength, requestStyle, ending, avoidPhrases, preferredExamples, onboarded }
const STORAGE_KEY = "malgyeol.profile";
// 예전 형식에서 따로 저장하던 값 (새 형식으로 옮긴 뒤 지운다)
const LEGACY_KEYS = { preferred: "malgyeol.preferred", bannerSkipped: "malgyeol.bannerSkipped" };
const PROFILE_KEYS = ["sentenceLength", "requestStyle", "ending"];
const MAX_PREFERRED = 5;

// 화면 사이에 넘겨줄 상태
const state = {
  variation: 0, // [다시 만들기] 조합 번호
  cardId: null,
  input: "",
  recipient: null, // 받는 사람 id (cards.json partners)
  fields: {},
  followups: {},
  variants: [],
  reasons: [],
  activeVariant: 0,
};

const $ = (id) => document.getElementById(id);

// "uiCopy.buttons.copy" 같은 경로로 cards.json 값을 꺼낸다.
function getPath(path) {
  return path.split(".").reduce((value, key) => (value == null ? undefined : value[key]), DATA);
}

// ---------- 말투 저장 ----------

function defaultProfile() {
  return { ...DATA.profileOptions.defaults, avoidPhrases: "", preferredExamples: [], onboarded: false };
}

// 저장된 말투를 읽는다. 선택지에 없는 값이나 잘못된 값이 있어도 기본값으로 바꿔 읽는다.
function loadProfile() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch (error) {
    saved = {};
  }
  const profile = defaultProfile();
  PROFILE_KEYS.forEach((key) => {
    if ((DATA.profileOptions[key] || []).some((option) => option.id === saved[key])) profile[key] = saved[key];
  });
  if (typeof saved.avoidPhrases === "string") profile.avoidPhrases = saved.avoidPhrases;
  if (Array.isArray(saved.preferredExamples)) {
    profile.preferredExamples = saved.preferredExamples
      .filter((text) => typeof text === "string" && text.trim())
      .slice(0, MAX_PREFERRED);
  }
  profile.onboarded = saved.onboarded === true;
  return profile;
}

function saveProfile(profile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    $("profile-banner").hidden = profile.onboarded;
    return true;
  } catch (error) {
    return false;
  }
}

// 바꿀 값만 넘기면 저장된 말투에 합쳐 저장한다.
function updateProfile(changes) {
  return saveProfile({ ...loadProfile(), ...changes });
}

// 예전 형식(한글 값의 length / request / ending / avoid, 따로 저장한 preferred · bannerSkipped)을 새 형식으로 옮긴다.
function migrateProfile() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch (error) {
    saved = null;
  }
  const oldProfile = saved && !("sentenceLength" in saved) && ("length" in saved || "request" in saved || "avoid" in saved);
  const oldPreferred = localStorage.getItem(LEGACY_KEYS.preferred);
  const oldSkipped = localStorage.getItem(LEGACY_KEYS.bannerSkipped);
  if (!oldProfile && oldPreferred === null && oldSkipped === null) return;

  // 한글 이름(예: "매우 조심스럽게") → id(예: "careful")
  const idOf = (key, label) => ((DATA.profileOptions[key] || []).find((option) => option.label === label) || {}).id;
  const next = saved && !oldProfile ? { ...saved } : {};
  if (oldProfile) {
    next.sentenceLength = idOf("sentenceLength", saved.length);
    next.requestStyle = idOf("requestStyle", saved.request);
    next.ending = idOf("ending", saved.ending);
    next.avoidPhrases = typeof saved.avoid === "string" ? saved.avoid : "";
    next.onboarded = true; // 예전에 말투를 저장했다면 설정을 마친 것으로 본다
  }
  try {
    const list = JSON.parse(oldPreferred);
    if (Array.isArray(list)) next.preferredExamples = [...(next.preferredExamples || []), ...list];
  } catch (error) {
    // 읽을 수 없는 예전 값은 버린다
  }
  if (oldSkipped) next.onboarded = true;

  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  const cleaned = loadProfile(); // 잘못된 값은 여기서 기본값으로 바뀐다
  if (saveProfile(cleaned)) {
    localStorage.removeItem(LEGACY_KEYS.preferred);
    localStorage.removeItem(LEGACY_KEYS.bannerSkipped);
  }
}

// ---------- 화면 공통 ----------

// data-copy / data-copy-placeholder가 붙은 요소에 cards.json 문구를 넣는다.
function applyCopy() {
  document.querySelectorAll("[data-copy]").forEach((el) => {
    const text = getPath(el.dataset.copy);
    if (typeof text !== "string") return;
    // "* 표시는 …"처럼 *로 시작하면 *만 빨간색으로 보이게 한다.
    if (text.startsWith("*")) {
      const star = document.createElement("span");
      star.className = "required";
      star.textContent = "*";
      el.replaceChildren(star, text.slice(1));
    } else {
      el.textContent = text;
    }
  });
  document.querySelectorAll("[data-copy-placeholder]").forEach((el) => {
    const text = getPath(el.dataset.copyPlaceholder);
    if (typeof text === "string") el.placeholder = text;
  });
}

function showScreen(name) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.hidden = screen.id !== `screen-${name}`;
  });
  if (name === "profile") renderProfile();
  window.scrollTo(0, 0);
}

function sortedCards() {
  return [...DATA.cards].sort((a, b) => a.order - b.order);
}

function currentCard() {
  return DATA.cards.find((c) => c.id === state.cardId);
}

function currentPartner() {
  return DATA.partners.find((p) => p.id === state.recipient);
}

// ---------- 화면 1 · 홈 ----------

function renderCards() {
  const list = $("card-list");
  list.innerHTML = "";

  sortedCards().forEach((card) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "card";
    button.dataset.cardId = card.id;
    button.setAttribute("aria-pressed", "false");
    const title = document.createElement("span");
    title.className = "card-title";
    title.textContent = card.name;
    const desc = document.createElement("span");
    desc.className = "card-desc";
    desc.textContent = card.subtitle;
    button.append(title, desc);
    button.addEventListener("click", () => selectCard(card.id, { focus: true }));
    list.appendChild(button);
  });
}

// 카드를 고르면 입력창 예시도 그 카드의 homePlaceholder로 바뀐다.
function selectCard(cardId, { focus = false } = {}) {
  state.cardId = cardId;
  const card = currentCard();

  document.querySelectorAll(".card").forEach((el) => {
    const selected = el.dataset.cardId === cardId;
    el.classList.toggle("selected", selected);
    el.setAttribute("aria-pressed", String(selected));
  });

  const input = $("home-input");
  input.placeholder = card.homePlaceholder;
  if (focus) input.focus();
  updateSubmitButton();
}

function updateSubmitButton() {
  state.input = $("home-input").value.trim();
  $("home-submit").disabled = !(state.cardId && state.input);
}

async function submitHome() {
  if (!state.cardId || !state.input) return;

  const card = currentCard();
  const button = $("home-submit");
  const label = button.textContent;
  button.disabled = true;
  button.textContent = UI_TEXT.loadingStructure;

  try {
    const result = await structurize(card, state.input);
    state.fields = result.fields;
    state.followups = result.followups;
    state.recipient = null;
    state.variants = []; // 새로 정리하면 이전 결과로 돌아가지 않게 비운다
    renderStructure();
    showScreen("structure");
  } catch (error) {
    alert(UI_TEXT.errorStructure);
  } finally {
    button.textContent = label;
    updateSubmitButton();
  }
}

// ---------- 화면 2 · 구조화 확인 ----------

function isFilled(field) {
  return Boolean(state.fields[field.key] && String(state.fields[field.key]).trim());
}

function renderStructure() {
  const card = currentCard();
  $("structure-card").textContent = card.name;
  $("structure-input").textContent = state.input;

  renderRecipients();

  const list = $("field-list");
  list.innerHTML = "";

  card.fields.forEach((field) => {
    const wrap = document.createElement("div");
    wrap.className = "field";
    wrap.dataset.key = field.key;

    const label = document.createElement("label");
    label.className = "field-label";
    label.htmlFor = `field-${field.key}`;
    label.textContent = field.label;
    if (field.required) {
      const star = document.createElement("span");
      star.className = "required";
      star.textContent = " *";
      label.appendChild(star);
    }

    const textarea = document.createElement("textarea");
    textarea.id = `field-${field.key}`;
    textarea.rows = 2;
    textarea.placeholder = field.placeholder || "";
    textarea.value = state.fields[field.key] || "";
    textarea.addEventListener("input", () => {
      state.fields[field.key] = textarea.value;
      updateFieldState(field);
      updateMakeButton();
    });

    const hint = document.createElement("p");
    hint.className = "field-hint";
    hint.id = `hint-${field.key}`;

    wrap.append(label, textarea, hint);
    list.appendChild(wrap);
    updateFieldState(field);
  });

  updateMakeButton();
}

function renderRecipients() {
  const group = $("recipient-list");
  group.innerHTML = "";

  DATA.partners.forEach((partner) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = partner.label;
    button.setAttribute("aria-pressed", String(state.recipient === partner.id));
    button.classList.toggle("selected", state.recipient === partner.id);
    button.addEventListener("click", () => {
      state.recipient = partner.id;
      renderRecipients();
      updateMakeButton();
    });
    group.appendChild(button);
  });
}

// 비어 있는 필수 칸만 노란색 + 되묻는 질문(followUp)으로 표시한다.
// 값이 연결어미("~와서", "~하고")로 끝나 엔진이 정리할 수 없으면 노란색 + "문장 끝을 정리해 주세요" (막지는 않음)
function updateFieldState(field) {
  const wrap = document.querySelector(`.field[data-key="${field.key}"]`);
  const hint = $(`hint-${field.key}`);
  const missing = field.required && !isFilled(field);
  const endingFix = !missing && isFilled(field) && needsEndingFix(state.fields[field.key]);

  wrap.classList.toggle("missing", missing || endingFix);
  hint.textContent = missing ? state.followups[field.key] || field.followUp : endingFix ? getPath("uiCopy.endingFixHint") : "";
}

function updateMakeButton() {
  const card = currentCard();
  const allFilled = card.fields.every((field) => !field.required || isFilled(field));
  $("make-message").disabled = !(state.recipient && allFilled);
}

// 호출 2(메시지 생성)를 부르고 결과 상태를 채운다.
// variation: [다시 만들기] 조합 번호. 처음 만들 때 0, 다시 만들 때마다 1씩 커져 인사·연결어·끝인사가 바뀐다.
async function buildResult(variation = 0) {
  const profile = loadProfile();
  const result = await generateMessages(
    {
      card: currentCard(),
      fields: state.fields,
      recipient: currentPartner(),
      profile,
      preferred: profile.preferredExamples,
    },
    { variation },
  );
  state.variation = variation;
  state.variants = result.variants;
  state.reasons = result.reasons;
  state.activeVariant = 0;
  renderResult();
}

async function makeMessage() {
  const button = $("make-message");
  const label = button.textContent;
  button.disabled = true;
  button.textContent = UI_TEXT.loadingMessage;

  try {
    await buildResult();
    showScreen("result");
  } catch (error) {
    alert(UI_TEXT.errorMessage);
  } finally {
    button.textContent = label;
    updateMakeButton();
  }
}

// ---------- 화면 3 · 결과 ----------

function renderResult() {
  $("result-card").textContent = currentCard().name;
  $("result-recipient").textContent = currentPartner().label;

  renderVariantTabs();
  showVariant();
}

// 수정 이유는 탭마다 다르다. (탭에 수정 이유가 없으면 전체 수정 이유를 쓴다)
function renderReasons() {
  const variant = state.variants[state.activeVariant];
  const reasons = $("reason-list");
  reasons.innerHTML = "";
  (variant.reasons || state.reasons).forEach((reason) => {
    const item = document.createElement("li");
    item.textContent = reason;
    reasons.appendChild(item);
  });
}

// 탭 순서와 이름은 cards.json versions를 따른다.
function renderVariantTabs() {
  const tabs = $("variant-tabs");
  tabs.innerHTML = "";

  DATA.versions.forEach((version) => {
    const index = state.variants.findIndex((variant) => variant.type === version.id);
    if (index === -1) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tab";
    button.setAttribute("role", "tab");
    button.textContent = version.label;
    button.classList.toggle("selected", index === state.activeVariant);
    button.setAttribute("aria-selected", String(index === state.activeVariant));
    button.addEventListener("click", () => {
      state.activeVariant = index;
      renderVariantTabs();
      showVariant();
    });
    tabs.appendChild(button);
  });
}

function showVariant() {
  const box = $("message-text");
  box.value = state.variants[state.activeVariant].text;
  requestAnimationFrame(() => autoGrow(box)); // 화면이 보인 뒤 글 길이에 맞춰 높이를 늘린다
  renderIntentCheck();
  renderReasons();
}

// 본문이 길어지면 상자 높이를 늘린다. (상자 안 스크롤 없이 전체가 보이게)
function autoGrow(textarea) {
  textarea.style.height = "auto";
  const border = textarea.offsetHeight - textarea.clientHeight;
  textarea.style.height = `${textarea.scrollHeight + border}px`;
}

// 의도 체크: 사용자가 확정한 칸마다 AI가 준 근거 구절이 본문에 실제로 있는지 문자열로 확인한다. (✓ / △)
function renderIntentCheck() {
  const variant = state.variants[state.activeVariant];
  const text = $("message-text").value;
  const list = $("intent-list");
  list.innerHTML = "";

  currentCard().fields.forEach((field) => {
    if (!isFilled(field)) return;

    const phrase = variant.evidence[field.key];
    const included = Boolean(phrase) && text.includes(phrase);

    const item = document.createElement("li");
    item.className = included ? "check-ok" : "check-warn";
    item.textContent = `${included ? "✓" : "△"} ${field.label} — ${included ? DATA.uiCopy.intentOk : DATA.uiCopy.intentWarn}`;
    list.appendChild(item);
  });
}

let toastTimer = null;

function showToast(message, targetId = "result-toast") {
  const clearAll = () => document.querySelectorAll(".toast").forEach((el) => (el.textContent = ""));
  clearAll();
  $(targetId).textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(clearAll, 2500);
}

// B5: 복사하면 [복사] 버튼이 2초간 "✓ 복사됐어요"로 바뀌었다가 돌아온다.
let copyTimer = null;
function showCopied() {
  const button = $("copy-message");
  button.textContent = getPath("uiCopy.buttons.copied") || UI_TEXT.copied;
  button.classList.add("done");
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    button.textContent = getPath("uiCopy.buttons.copy");
    button.classList.remove("done");
  }, 2000);
}

async function copyMessage() {
  const textarea = $("message-text");
  try {
    await navigator.clipboard.writeText(textarea.value);
    showCopied();
  } catch (error) {
    textarea.select();
    const copied = document.execCommand("copy");
    if (copied) showCopied();
    else showToast(UI_TEXT.copyFailed);
  }
}

async function regenerate() {
  const button = $("regenerate");
  const label = button.textContent;
  button.disabled = true;
  button.textContent = UI_TEXT.loadingMessage;

  try {
    await buildResult((state.variation || 0) + 1); // 같은 내용, 다른 인사·연결어·끝인사 조합
    showToast(UI_TEXT.regenerated);
  } catch (error) {
    showToast(UI_TEXT.errorRegenerate);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

// 지금 보는 문장을 선호 예문으로 저장한다. 최근 5개만 남기고 같은 문장은 중복 저장하지 않는다.
function savePreferred() {
  const text = $("message-text").value.trim();
  if (!text) return;

  const list = [text, ...loadProfile().preferredExamples.filter((saved) => saved !== text)].slice(0, MAX_PREFERRED);
  showToast(updateProfile({ preferredExamples: list }) ? UI_TEXT.preferredSaved : UI_TEXT.errorSave);
}

// ---------- 화면 4 · 내 말투 ----------

const onboardingAnswers = {};

function renderProfile() {
  $("onboarding").hidden = loadProfile().onboarded;
  $("profile-back-result").hidden = state.variants.length === 0; // 결과를 만든 뒤에만 보인다

  renderOnboarding();
  renderSettings();
  renderPreferred();
}

function renderOnboarding() {
  const wrap = $("onboarding-questions");
  wrap.innerHTML = "";
  const questions = DATA.onboarding.questions;

  questions.forEach((question) => {
    const block = document.createElement("div");
    block.className = "question";

    const title = document.createElement("h3");
    title.className = "question-title";
    title.textContent = question.q;
    block.appendChild(title);

    [
      ["A", question.a],
      ["B", question.b],
    ].forEach(([mark, option]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      const selected = onboardingAnswers[question.key] === option.sets;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));

      const strong = document.createElement("strong");
      strong.textContent = mark;
      button.append(strong, ` ${option.text}`);

      button.addEventListener("click", () => {
        onboardingAnswers[question.key] = option.sets;
        renderOnboarding();
      });
      block.appendChild(button);
    });

    wrap.appendChild(block);
  });

  $("onboarding-apply").disabled = !questions.every((q) => onboardingAnswers[q.key]);
}

function applyOnboarding() {
  if (!updateProfile({ ...onboardingAnswers, onboarded: true })) {
    showToast(UI_TEXT.errorSave, "profile-toast");
    return;
  }
  DATA.onboarding.questions.forEach((q) => delete onboardingAnswers[q.key]);
  renderProfile();
  showToast(UI_TEXT.onboardingApplied, "profile-toast");
}

function skipOnboarding() {
  updateProfile({ onboarded: true });
  $("onboarding").hidden = true;
}

function reopenOnboarding() {
  DATA.onboarding.questions.forEach((q) => delete onboardingAnswers[q.key]);
  renderOnboarding();
  $("onboarding").hidden = false;
  $("onboarding").scrollIntoView({ behavior: "smooth" });
}

// 말투 항목 이름(문장 길이 · 요청 방식 · 끝맺음)은 온보딩 질문 "문장 길이 · 어느 쪽이 나답나요?"의 앞부분을 쓴다.
function settingLabel(key) {
  const question = DATA.onboarding.questions.find((q) => q.key === key);
  return question ? question.q.split(" · ")[0] : key;
}

function renderSettings() {
  const profile = loadProfile();
  const wrap = $("profile-settings");
  wrap.innerHTML = "";

  PROFILE_KEYS.forEach((key) => {
    const group = document.createElement("div");
    group.className = "setting";

    const title = document.createElement("span");
    title.className = "field-label";
    title.textContent = settingLabel(key);
    group.appendChild(title);

    const chips = document.createElement("div");
    chips.className = "chips";
    DATA.profileOptions[key].forEach((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip";
      button.textContent = option.label;
      const selected = profile[key] === option.id;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
      button.addEventListener("click", () => {
        // 바꾸면 바로 저장한다 (코딩 레퍼런스 2장 ④)
        if (updateProfile({ [key]: option.id, onboarded: true })) {
          renderSettings();
          showToast(UI_TEXT.settingSaved, "profile-toast");
        } else {
          showToast(UI_TEXT.errorSave, "profile-toast");
        }
      });
      chips.appendChild(button);
    });
    group.appendChild(chips);
    wrap.appendChild(group);
  });

  $("profile-avoid").value = profile.avoidPhrases;
}

function renderPreferred() {
  const list = $("preferred-list");
  list.innerHTML = "";
  const preferred = loadProfile().preferredExamples;

  if (preferred.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = UI_TEXT.preferredEmpty;
    list.appendChild(empty);
    return;
  }

  preferred.forEach((text, index) => {
    const item = document.createElement("li");
    item.className = "preferred-item";

    const body = document.createElement("p");
    body.textContent = text;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary small";
    remove.textContent = UI_TEXT.deleteButton;
    remove.addEventListener("click", () => {
      const next = loadProfile().preferredExamples.filter((_, i) => i !== index);
      if (!updateProfile({ preferredExamples: next })) {
        showToast(UI_TEXT.errorDelete, "profile-toast");
        return;
      }
      renderPreferred();
    });

    item.append(body, remove);
    list.appendChild(item);
  });
}

function initBanner() {
  $("profile-banner").hidden = loadProfile().onboarded;

  $("banner-setup").addEventListener("click", () => showScreen("profile"));
  $("banner-skip").addEventListener("click", () => {
    updateProfile({ onboarded: true });
    $("profile-banner").hidden = true;
  });
}

// ---------- cards.json · content.js 검사 ----------
// 서로 연결된 이름이 어긋나면 콘솔에 알려 준다. (화면 동작에는 영향 없음)

function validateData() {
  const dataProblems = []; // cards.json · 샘플 데이터 문제
  const contentProblems = []; // content.js(엔진 문장 틀) 문제

  const cardIds = DATA.cards.map((c) => c.id);
  if (new Set(cardIds).size !== cardIds.length) dataProblems.push("cards: 카드 id가 겹쳐요.");

  DATA.cards.forEach((card) => {
    const keys = card.fields.map((f) => f.key);
    if (new Set(keys).size !== keys.length) dataProblems.push(`cards(${card.id}): 칸 key가 겹쳐요.`);
    ["name", "subtitle", "homePlaceholder"].forEach((prop) => {
      if (!card[prop]) dataProblems.push(`cards(${card.id}): ${prop}가 비어 있어요.`);
    });
    card.fields.forEach((field) => {
      if (!field.label) dataProblems.push(`cards(${card.id}): "${field.key}" 칸의 label이 비어 있어요.`);
      if (field.required && !field.followUp) dataProblems.push(`cards(${card.id}): 필수 칸 "${field.key}"에 followUp이 없어요.`);
    });

    const flow = MESSAGE_FLOW[card.id];
    if (!flow) {
      contentProblems.push(`MESSAGE_FLOW에 카드 "${card.id}"가 없어요.`);
    } else {
      const used = [...flow.steps.map((step) => step.key), flow.tail && flow.tail.key].filter(Boolean);
      used.forEach((key) => {
        if (!keys.includes(key)) contentProblems.push(`MESSAGE_FLOW(${card.id}): "${key}" 칸이 cards.json에 없어요.`);
      });
      keys.forEach((key) => {
        if (!used.includes(key)) contentProblems.push(`MESSAGE_FLOW(${card.id}): "${key}" 칸이 빠져 있어서 메시지에 안 들어가요.`);
      });
      (DATA.profileOptions.requestStyle || []).forEach((option) => {
        if (!flow.opener || !flow.opener[option.id]) contentProblems.push(`MESSAGE_FLOW(${card.id}): 요청 방식 "${option.id}"의 opener가 없어요.`);
      });
    }
    if (LEAD_FIELD[card.id] && !keys.includes(LEAD_FIELD[card.id])) contentProblems.push(`LEAD_FIELD(${card.id}): "${LEAD_FIELD[card.id]}" 칸이 cards.json에 없어요.`);
    if (CLOSING_FIELD[card.id] && !keys.includes(CLOSING_FIELD[card.id])) contentProblems.push(`CLOSING_FIELD(${card.id}): "${CLOSING_FIELD[card.id]}" 칸이 cards.json에 없어요.`);
    (STRUCTURE_PRESETS[card.id] || []).forEach((preset) => {
      Object.keys(preset.fields).forEach((key) => {
        if (!keys.includes(key)) contentProblems.push(`STRUCTURE_PRESETS(${card.id}): "${key}" 칸이 cards.json에 없어요.`);
      });
    });
    (STRUCTURIZE_FILL[card.id] || []).forEach((key) => {
      if (!keys.includes(key)) contentProblems.push(`STRUCTURIZE_FILL(${card.id}): "${key}" 칸이 cards.json에 없어요.`);
    });
    // 수정 이유 문구 (cards.json reasons.byField)
    ((DATA.reasons && DATA.reasons.byField && DATA.reasons.byField[card.id]) || []).forEach((reason) => {
      (reason.requires || []).forEach((key) => {
        if (!keys.includes(key)) dataProblems.push(`reasons.byField(${card.id}): "${key}" 칸이 카드에 없어요.`);
      });
      if (!reason.text) dataProblems.push(`reasons.byField(${card.id}): text가 비어 있어요.`);
    });
  });

  if (!DATA.reasons) dataProblems.push("reasons(수정 이유 문구)가 없어요.");
  else {
    ["mine", "concise", "soft"].forEach((id) => {
      if (!(DATA.reasons.byTab || {})[id]) dataProblems.push(`reasons.byTab에 "${id}"가 없어요.`);
    });
    DATA.partners.forEach((partner) => {
      if (!(DATA.reasons.byPartner || {})[partner.id]) dataProblems.push(`reasons.byPartner에 "${partner.id}"가 없어요.`);
    });
    if (!String(DATA.reasons.avoid || "").includes("{words}")) dataProblems.push("reasons.avoid에 {words} 자리가 없어요.");
  }

  DATA.partners.forEach((partner) => {
    if (!partner.label) dataProblems.push(`partners(${partner.id}): label이 비어 있어요.`);
    if (!PARTNER_STYLE[partner.id]) contentProblems.push(`PARTNER_STYLE에 받는 사람 "${partner.id}"가 없어요.`);
  });

  // 엔진이 만드는 표현 종류(mine · concise · soft)와 탭이 맞는지
  ["mine", "concise", "soft"].forEach((id) => {
    if (!DATA.versions.some((v) => v.id === id)) dataProblems.push(`versions에 "${id}" 탭이 없어요.`);
  });

  PROFILE_KEYS.forEach((key) => {
    const ids = (DATA.profileOptions[key] || []).map((o) => o.id);
    if (ids.length === 0) dataProblems.push(`profileOptions에 "${key}"가 없어요.`);
    if (!ids.includes(DATA.profileOptions.defaults[key])) {
      dataProblems.push(`profileOptions.defaults: ${key} 값 "${DATA.profileOptions.defaults[key]}"가 선택지에 없어요.`);
    }
  });
  DATA.onboarding.questions.forEach((question) => {
    const ids = (DATA.profileOptions[question.key] || []).map((o) => o.id);
    [question.a, question.b].forEach((option) => {
      if (!ids.includes(option.sets)) dataProblems.push(`onboarding(${question.key}): sets "${option.sets}"가 profileOptions에 없어요.`);
    });
  });
  (DATA.profileOptions.requestStyle || []).forEach((option) => {
    if (!MESSAGE_CLOSINGS[option.id]) contentProblems.push(`MESSAGE_CLOSINGS에 요청 방식 "${option.id}"가 없어요.`);
    if (!MESSAGE_CLOSINGS_URGENT[option.id]) contentProblems.push(`MESSAGE_CLOSINGS_URGENT에 요청 방식 "${option.id}"가 없어요.`);
  });

  // 화면에서 쓰는 문구 경로가 cards.json에 있는지
  document.querySelectorAll("[data-copy], [data-copy-placeholder]").forEach((el) => {
    const path = el.dataset.copy || el.dataset.copyPlaceholder;
    if (typeof getPath(path) !== "string") dataProblems.push(`화면 문구 "${path}"가 cards.json에 없어요.`);
  });
  ["intentOk", "intentWarn"].forEach((key) => {
    if (!DATA.uiCopy[key]) dataProblems.push(`uiCopy.${key}가 없어요.`);
  });

  const demoCard = DATA.cards.find((c) => c.id === DATA.demo.cardId);
  if (!demoCard) dataProblems.push(`demo.cardId "${DATA.demo.cardId}"가 cards에 없어요.`);
  else if (!demoCard.fields.some((f) => f.key === DATA.demo.expectEmptyField)) {
    dataProblems.push(`demo.expectEmptyField "${DATA.demo.expectEmptyField}"가 ${demoCard.id} 카드에 없어요.`);
  }

  if (SAMPLE_DATA) {
    const partnerLabels = DATA.partners.map((p) => p.label);
    SAMPLE_DATA.samples.forEach((sample) => {
      const card = DATA.cards.find((c) => c.id === sample.cardId);
      if (!card) {
        dataProblems.push(`샘플 ${sample.id}: 카드 "${sample.cardId}"가 cards.json에 없어요.`);
        return;
      }
      const keys = card.fields.map((f) => f.key);
      Object.keys(sample.fields).forEach((key) => {
        if (!keys.includes(key)) dataProblems.push(`샘플 ${sample.id}: "${key}" 칸이 ${card.id} 카드에 없어요.`);
      });
      if (!partnerLabels.includes(sample.partner)) dataProblems.push(`샘플 ${sample.id}: 받는 사람 "${sample.partner}"가 partners에 없어요.`);
    });
  }

  dataProblems.forEach((message) => console.error(`[cards.json] ${message}`));
  contentProblems.forEach((message) => console.error(`[content.js] ${message}`));
}

// ---------- 시작 ----------

async function loadData() {
  const response = await fetch(DATA_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${DATA_URL} ${response.status}`);
  DATA = await response.json();

  // 샘플은 없어도 앱은 동작한다 (엔진이 키워드 응답·연결어 규칙만 쓴다)
  try {
    const sampleResponse = await fetch(SAMPLE_URL, { cache: "no-cache" });
    if (sampleResponse.ok) SAMPLE_DATA = await sampleResponse.json();
  } catch (error) {
    SAMPLE_DATA = null;
  }
  if (!SAMPLE_DATA) console.warn(`[cards.json] ${SAMPLE_URL}을 읽지 못해 샘플 없이 동작해요.`);
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadData();
  } catch (error) {
    // 파일을 더블클릭해서 열면(file://) 브라우저가 json 읽기를 막는다.
    console.error(`[cards.json] ${DATA_URL}을 불러오지 못했어요.`, error);
    $("load-error").hidden = false;
    return;
  }

  migrateProfile();
  applyCopy();
  validateData();
  renderCards();
  selectCard(sortedCards()[0].id); // 질문 준비실(order 1)이 기본 선택된 상태로 시작
  initBanner();
  showScreen("home");
  if (typeof initReviewBar === "function") initReviewBar(); // review.js가 있을 때만

  $("home-input").addEventListener("input", updateSubmitButton);
  $("home-submit").addEventListener("click", submitHome);
  $("make-message").addEventListener("click", makeMessage);

  $("message-text").addEventListener("input", () => {
    state.variants[state.activeVariant].text = $("message-text").value;
    autoGrow($("message-text"));
    renderIntentCheck();
  });
  $("copy-message").addEventListener("click", copyMessage);
  $("regenerate").addEventListener("click", regenerate);
  $("save-preferred").addEventListener("click", savePreferred);

  $("onboarding-apply").addEventListener("click", applyOnboarding);
  $("onboarding-skip").addEventListener("click", skipOnboarding);
  $("onboarding-reopen").addEventListener("click", reopenOnboarding);
  $("profile-avoid").addEventListener("input", () => {
    updateProfile({ avoidPhrases: $("profile-avoid").value, onboarded: true });
  });

  $("go-home").addEventListener("click", () => showScreen("home"));
  $("go-profile").addEventListener("click", () => showScreen("profile"));
  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => showScreen(button.dataset.go));
  });
});
