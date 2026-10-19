// 진학상담 사전 설문(구글 폼 → 스프레드시트) 응답 읽기.
// 구글 시트에서 '파일 → 다운로드 → Microsoft Excel(.xlsx) 또는 CSV'로 받은 파일을 그대로 올립니다.
// 머리글(질문 문장)에서 열을 찾으므로 질문 순서가 바뀌거나 번호가 붙어 있어도 됩니다.

// [키, 짧은 이름, 머리글에서 찾을 말(정규식), 상담 화면 묶음, 질문 번호]
// 질문 문장이 조금 달라도 찾도록 넓게 잡고, 그래도 못 찾으면 머리글 앞 번호("9. …")로 찾습니다.
export const SURVEY_FIELDS = [
  ["sid", "학번", /학번/, "기본", 1],
  ["name", "이름", /^(\d+\.\s*)?(이름|성명)/, "기본", 2],
  ["readiness", "진로 목표", /진로.*진학 목표|목표는 어느 정도/, "기본", 3],
  ["interests", "관심 학과·직업", /관심 있는 학과|전공·직업|전공.*직업/, "희망", 4],
  ["reason", "관심 이유", /관심을 갖게 된 이유/, "희망", 5],
  ["topChoice", "가장 관심 대학·학과", /가장 관심 있는 대학/, "희망", 6],
  ["moreChoices", "더 알아볼 대학·학과", /추가로 알아보고 싶은/, "희망", 7],
  ["priority", "대학 vs 학과", /무엇을 더 중요하게/, "희망", 8],
  ["criteria", "선택 조건", /중요(하게 생각하는|한) 조건|선택 시 중요/, "희망", 9],
  ["regions", "지역", /지역을 모두|고려할 수 있는 지역/, "지원", 10],
  ["commute", "통학·거주", /통학.*거주|거주와 관련/, "지원", 11],
  ["direction", "준비 방향", /대입 준비 방향/, "지원", 12],
  ["tracks", "관심 전형", /관심 있거나 상담받고 싶은 전형|전형을 모두/, "지원", 13],
  ["tendency", "지원 성향", /지원 성향/, "지원", 14],
  ["scopeNote", "지원 범위 추가", /지원 범위에 관해/, "지원", 15],
  ["strongSubjects", "자신 있는 과목", /자신 있거나 좋아하는 과목/, "학습", 16],
  ["needSubjects", "도움 필요 과목", /도움이 필요한 과목/, "학습", 17],
  ["minimum", "수능최저 이해", /수능최저학력기준|수능최저/, "학습", 18],
  ["activities", "소개할 활동", /소개하고 싶은.*활동|활동이 있나요/, "학습", 19],
  ["electives", "선택과목 질문", /선택과목|권장과목/, "학습", 20],
  ["topics", "우선 상담 내용", /우선(적으로)? 다루고 싶은/, "상담", 21],
  ["questions", "꼭 묻고 싶은 질문", /꼭 물어보고 싶은 질문/, "상담", 22],
  ["notice", "미리 알면 좋을 점", /상담 전에 알(고 있으)?면/, "상담", 23],
];
export const SURVEY_GROUPS = ["기본", "희망", "지원", "학습", "상담"];

const clean = value => String(value ?? "").replace(/\r\n?/g, "\n").trim();
const compact = value => clean(value).replace(/\s+/g, " ");

function timeOf(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    // 엑셀 날짜 일련번호
    const ms = Math.round((value - 25569) * 86400000);
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  const text = clean(value);
  // 구글 시트 한국어 형식: 2026. 10. 19 오후 3:05:12
  const k = text.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*(오전|오후)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (k) {
    let hour = Number(k[5]);
    if (k[4] === "오후" && hour < 12) hour += 12;
    if (k[4] === "오전" && hour === 12) hour = 0;
    const date = new Date(Number(k[1]), Number(k[2]) - 1, Number(k[3]), hour, Number(k[6]), Number(k[7] || 0));
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

// rows: 시트 2차원 배열(첫 줄이 머리글). grade가 있으면 그 학년 학번만 받습니다.
// → { responses: { sid: { sid, name, submittedAt, answers: {key: 글} } }, count, skipped: [문장], missing: [못 찾은 질문] }
export function parseCounselSurvey(rows = [], { grade = "" } = {}) {
  const headerIndex = rows.findIndex(row => (row || []).some(cell => /학번/.test(clean(cell))));
  if (headerIndex < 0) throw new Error("머리글에서 '학번' 열을 찾지 못했어요. 구글 시트 응답 탭을 그대로 내려받아 올려 주세요.");
  const header = (rows[headerIndex] || []).map(compact);
  const column = {};
  SURVEY_FIELDS.forEach(([key, , pattern]) => {
    const index = header.findIndex((label, i) => pattern.test(label) && !Object.values(column).includes(i));
    if (index >= 0) column[key] = index;
  });
  SURVEY_FIELDS.forEach(([key, , , , number]) => {
    if (column[key] != null || !number) return;
    const index = header.findIndex((label, i) => new RegExp(`^${number}\\s*[.)]`).test(label) && !Object.values(column).includes(i));
    if (index >= 0) column[key] = index;
  });
  const stampIndex = header.findIndex(label => /타임스탬프|timestamp|제출 시간|응답 시간/i.test(label));
  const missing = SURVEY_FIELDS.filter(([key]) => column[key] == null).map(([, label]) => label);
  const responses = {};
  const skipped = [];
  let otherGrade = 0;
  for (let r = headerIndex + 1; r < rows.length; r += 1) {
    const row = rows[r] || [];
    if (!row.some(cell => clean(cell))) continue;
    const sid = (clean(row[column.sid]).match(/\d{5}/) || [""])[0];
    if (!sid) { skipped.push(`${r + 1}번째 줄: 학번 5자리가 없어요`); continue; }
    if (grade && sid.charAt(0) !== String(grade)) { otherGrade += 1; continue; }
    const answers = {};
    SURVEY_FIELDS.forEach(([key]) => { if (key !== "sid" && key !== "name" && column[key] != null) { const value = clean(row[column[key]]); if (value) answers[key] = value; } });
    const submittedAt = stampIndex >= 0 ? timeOf(row[stampIndex]) : "";
    const entry = { sid, name: clean(row[column.name]), submittedAt, answers };
    // 같은 학생이 여러 번 내면 가장 늦게 낸 응답(시간이 없으면 아래쪽 줄)을 씁니다.
    const prev = responses[sid];
    if (!prev || !prev.submittedAt || !submittedAt || submittedAt >= prev.submittedAt) responses[sid] = entry;
  }
  if (otherGrade) skipped.push(`다른 학년 학번 ${otherGrade}개는 건너뛰었어요`);
  return { responses, count: Object.keys(responses).length, skipped, missing };
}

// 이미 저장된 응답과 합치기: 학생마다 더 늦게 낸 응답을 남깁니다.
export function mergeCounselSurveys(current = {}, incoming = {}) {
  const out = { ...(current || {}) };
  Object.entries(incoming || {}).forEach(([sid, entry]) => {
    const prev = out[sid];
    if (!prev || !prev.submittedAt || !entry.submittedAt || entry.submittedAt >= prev.submittedAt) out[sid] = { ...entry, importedAt: new Date().toISOString() };
  });
  return out;
}

// '대학명 / 캠퍼스 / 학과명' 답을 나눕니다. 미정이면 null.
export function splitChoice(text = "") {
  const value = clean(text).split("\n")[0];
  if (!value || /^미정$/.test(value)) return null;
  const parts = value.split(/\s*[\/|,]\s*/).filter(Boolean);
  if (parts.length === 1) return /대학|대$/.test(parts[0]) ? { university: parts[0], department: "" } : { university: "", department: parts[0] };
  return { university: parts[0], department: parts[parts.length - 1] };
}
