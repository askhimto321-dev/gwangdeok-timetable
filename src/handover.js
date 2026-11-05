// 업무 인수인계: 부서 → 담당(자리) → 세부 업무. 세부 업무마다 타임라인 · 자료(시트·파일 링크) · 코멘트를 남겨
// 다음 해 담당 선생님이 그대로 이어받게 합니다.
// 저장: 구조(부서·담당·세부 업무) = HANDOVER_KEY 한 곳, 세부 업무 내용 = handoverTaskKey(업무 id)마다 따로
// (여러 선생님이 동시에 자기 업무를 적어도 서로 덮어쓰지 않게).

export const HANDOVER_KEY = "kd_handover_v1";
export const handoverTaskKey = id => `kd_handover_task_v1_${id}`;

const uid = (prefix = "h") => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// 학교 한 해: 3월부터 다음 해 2월까지
export const SCHOOL_MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
export const monthRank = month => { const i = SCHOOL_MONTHS.indexOf(Number(month)); return i < 0 ? 99 : i; };

// 2026학년도 업무분장(2학년부) 기본 틀. 담당 선생님 이름은 넣지 않고, 선생님마다 '내 담당으로'를 눌러 정해요.
const SEED_2 = [
  ["부장", ["학년운영 총괄(운영계획 및 추진)", "학생 생활교육", "타부서 업무 협조 및 조율", "학년협의회 운영", "학부모 상담", "학년 분리수거 지도"]],
  ["", ["지필평가 업무(학년 답안지 점검 및 리딩)", "교수부 지원(전국연합학력평가 협조, 평가 일람표)", "UNIV 운영 및 자료 관리"]],
  ["", ["따라체험(꿈따라 세상 속으로) 1", "교육과정부 지원(진급학급 편성 조정)"]],
  ["", ["출결총괄(짝수반)", "급식지도 계획 및 운영", "교수부 지원(최성보 운영 지원, 과목별 출결마감 확인 협조)"]],
  ["", ["출결(홀수반)", "자기주도학습 계획 및 운영"]],
  ["", ["따라체험(꿈따라 세상 속으로) 2", "보건실 업무 지원 및 물품 관리", "어울림한마당 및 동아리발표회 운영 협조"]],
  ["", ["학년 기획", "회계 및 특근매식비 관리", "학년 프로젝트 봉사활동 운영", "사정안 및 학생비상연락망", "교무실 비품 및 소모품(청소도구, 복사용품) 신청 및 관리"]],
  ["", ["교육안전부 지원(학년생활교육협의회 업무 및 확인서 관리)", "선도학생 지도 협조", "엘리베이터 탑승카드 관리"]],
  ["", ["교육안전부 지원(학생생활교육위원회 업무 및 선도학생 지도 총괄)", "학년생활교육협의회 업무 협조", "학생회 조직 및 안전 관리"]],
  ["", ["교무부 지원(학교생활기록부 점검, 장학 및 포상)", "진로진학 업무 협조(진로진학컨설팅)"]],
  ["", ["교육과정부 지원(봉사활동, 학교자율시간)", "교수부 지원(기초학력 및 학습코칭 운영: 개설 가수요조사, 개설 강좌 확정, 희망 학생 가통 배부 및 수합, 강좌 종료 후 출석부와 사진 제출)", "학습지원대상학생 지원협의회 참석(학기당 1회)"]],
];
export function seedHandover() {
  let n = 0;
  const id = () => `seed2_${++n}`;
  return {
    depts: [{ id: "dept_g2", name: "2학년부", order: 0, common: "학생지도(생활, 학습, 진로진학), 학생과 학부모 상담, 교무실과 학급 관리" }],
    roles: SEED_2.map(([title, duties], index) => ({ id: `role_g2_${index + 1}`, deptId: "dept_g2", title, ownerId: "", ownerName: "", order: index, duties: duties.map(text => ({ id: id(), text })) })),
    year: "2026",
  };
}
export function normalizeHandover(raw) {
  const v = raw && typeof raw === "object" && Array.isArray(raw.depts) ? raw : seedHandover();
  return {
    ...v,
    depts: v.depts.map((d, i) => ({ id: String(d.id || uid("dept_")), name: String(d.name || "부서"), order: Number.isFinite(d.order) ? d.order : i, common: String(d.common || ""), memberAdd: (d.memberAdd || []).map(String), memberRemove: (d.memberRemove || []).map(String) })).sort((a, b) => a.order - b.order),
    roles: (v.roles || []).map((r, i) => ({ id: String(r.id || uid("role_")), deptId: String(r.deptId || ""), title: String(r.title || ""), ownerId: String(r.ownerId || ""), ownerName: String(r.ownerName || ""), order: Number.isFinite(r.order) ? r.order : i, duties: (r.duties || []).map(d => ({ id: String(d.id || uid("duty_")), text: String(d.text || ""), part: String(d.part || ""), group: String(d.group || ""), editors: (Array.isArray(d.editors) ? d.editors : []).map(e => ({ id: String(e?.id || ""), name: String(e?.name || "") })).filter(e => e.id) })) })).sort((a, b) => a.order - b.order),
  };
}

// 세부 업무 한 건의 인수인계 내용
export const emptyTask = () => ({ summary: "", must: "", changes: "", steps: [], links: [], files: [], comments: [], updatedAt: "", updatedBy: "" });
export function normalizeTask(raw) {
  const t = { ...emptyTask(), ...(raw && typeof raw === "object" ? raw : {}) };
  return {
    ...t,
    steps: (t.steps || []).map(s => ({ who: String(s.who || ""), id: String(s.id || uid("st_")), month: s.month ? Number(s.month) : 0, when: String(s.when || ""), title: String(s.title || ""), detail: String(s.detail || ""), done: !!s.done, links: (s.links || []).map(normLink).filter(l => l.url), files: Array.isArray(s.files) ? s.files : [] })),
    links: (t.links || []).map(normLink).filter(l => l.url),
    files: Array.isArray(t.files) ? t.files : [],
    comments: (t.comments || []).map(c => ({ id: String(c.id || uid("cm_")), by: String(c.by || ""), byId: String(c.byId || ""), at: String(c.at || ""), text: String(c.text || "") })).filter(c => c.text),
  };
}
const normLink = l => ({ id: String(l?.id || uid("ln_")), label: String(l?.label || ""), url: String(l?.url || "").trim() });
export const newStep = (patch = {}) => ({ id: uid("st_"), who: "", month: 0, when: "", title: "", detail: "", done: false, links: [], files: [], ...patch });
export const newLink = (label = "", url = "") => ({ id: uid("ln_"), label, url: url.trim() });
export const newComment = (text, actor) => ({ id: uid("cm_"), text: String(text || "").trim(), by: String(actor?.name || "선생님"), byId: String(actor?.id || ""), at: new Date().toISOString() });

// 타임라인: 학교 달(3월→2월) 순서, 같은 달은 적은 순서대로. 시기를 안 정한 건 맨 뒤 '시기 미정'.
export function groupSteps(steps = []) {
  const groups = new Map();
  steps.forEach((step, index) => { const key = step.month || 0; if (!groups.has(key)) groups.set(key, []); groups.get(key).push({ ...step, index }); });
  return Array.from(groups.entries()).sort(([a], [b]) => (a ? monthRank(a) : 100) - (b ? monthRank(b) : 100)).map(([month, list]) => ({ month, label: month ? `${month}월` : "시기 미정", steps: list }));
}

// 링크 종류(아이콘·이름 표시용)
export function linkKind(url = "") {
  const u = String(url);
  if (/docs\.google\.com\/spreadsheets/.test(u)) return { kind: "sheet", label: "구글 시트" };
  if (/docs\.google\.com\/document/.test(u)) return { kind: "doc", label: "구글 문서" };
  if (/docs\.google\.com\/presentation/.test(u)) return { kind: "slide", label: "구글 프레젠테이션" };
  if (/docs\.google\.com\/forms|forms\.gle/.test(u)) return { kind: "form", label: "구글 설문" };
  if (/drive\.google\.com/.test(u)) return { kind: "drive", label: "구글 드라이브" };
  if (/canva\.com|miricanvas\.com/.test(u)) return { kind: "design", label: "디자인" };
  if (/youtu\.?be/.test(u)) return { kind: "video", label: "영상" };
  return { kind: "web", label: "링크" };
}
export const safeUrl = url => { const v = String(url || "").trim(); if (!v) return ""; if (/^https?:\/\//i.test(v)) return v; if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v)) return `https://${v}`; return ""; };

// 업무 이름으로 맞는 예시 타임라인(선생님이 고쳐 쓰는 초안)
export function stepTemplate(dutyText = "") {
  if (/따라\s*체험/.test(dutyText)) return [
    newStep({ title: "운영 계획 수립", detail: "작년 운영 결과와 개선점 확인, 계획서와 예산안 작성, 학년협의회 협의" }),
    newStep({ title: "학생 희망 분야 조사", detail: "희망 진로 분야 조사(설문), 분야별 인원 정리" }),
    newStep({ title: "체험처 섭외 및 협조", detail: "체험처 연락과 일정 조율, 협조 공문, 체험처 목록 정리" }),
    newStep({ title: "사전 준비", detail: "학생 배정과 명단, 가정통신문(학부모 동의), 사전교육과 안전교육, 보험과 이동 계획" }),
    newStep({ title: "체험 실시", detail: "당일 인솔과 출결 확인, 비상 연락 체계" }),
    newStep({ title: "사후 활동", detail: "소감문 수합, 결과물 정리" }),
    newStep({ title: "결과 공유(팜플렛 제작)", detail: "평가회 영상 대신 분야별 팜플렛을 제작해 공유" }),
    newStep({ title: "생기부 기재 자료 정리", detail: "진로활동 특기사항 자료(행사 세특 파일) 작성과 담임 배부" }),
    newStep({ title: "결과 보고 및 정산", detail: "결과 보고서 작성, 예산 정산" }),
  ];
  return [
    newStep({ title: "계획 수립", detail: "" }),
    newStep({ title: "준비", detail: "" }),
    newStep({ title: "실시", detail: "" }),
    newStep({ title: "마무리(결과 보고·정리)", detail: "" }),
  ];
}

// 한 업무가 얼마나 채워졌는지(목록 표시용)
export function taskProgress(task) {
  const t = normalizeTask(task);
  const filled = [t.summary.trim(), t.must.trim(), t.steps.length, t.links.length + t.files.length].filter(Boolean).length;
  return { filled, total: 4, steps: t.steps.length, done: t.steps.filter(s => s.done).length, files: t.links.length + t.files.length + t.steps.reduce((n, s) => n + s.links.length + s.files.length, 0), comments: t.comments.length };
}

// 시트에서 복사해 붙여 넣은 표(탭으로 나뉜 줄)를 타임라인 단계로 바꿔요.
// 머리글(월·시기 / 업무·할 일 / 내용·세부 / 링크·자료)이 있으면 그 칸을 쓰고, 없으면 칸 모양으로 짐작해요.
// 합친 칸(같은 달이 이어지는 줄)은 위 줄의 달을 이어받아요.
export function parseMonthCell(cell = "") {
  const v = String(cell || "").trim();
  if (!v) return { month: 0, when: "" };
  let m = v.match(/(?:\d{4}\s*[.\-/]\s*)?(\d{1,2})\s*[.\-/]\s*(\d{1,2})(?!\d)/) || v.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12 && Number(m[2]) >= 1 && Number(m[2]) <= 31) return { month: Number(m[1]), when: `${Number(m[2])}일` };
  m = v.match(/(\d{1,2})\s*월/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return { month: Number(m[1]), when: v.replace(m[0], "").replace(/^[\s,·~-]+/, "").trim() };
  if (/^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 12) return { month: Number(v), when: "" };
  return { month: 0, when: "" };
}
const URL_RE = /https?:\/\/[^\s"'<>]+/g;
export function parseSheetRows(text = "") {
  const rows = String(text || "").replace(/\r/g, "").split("\n").map(line => line.split("\t").map(cell => cell.trim())).filter(row => row.some(Boolean));
  if (!rows.length) return [];
  const width = Math.max(...rows.map(r => r.length));
  const head = rows[0].map(c => c.replace(/\s+/g, ""));
  const find = re => head.findIndex(c => re.test(c));
  let col = { month: find(/^(월|시기|일정|날짜|기간|일시|때)/), title: find(/업무|할일|항목|추진|단계|내용$|활동|행사/), detail: find(/세부|방법|비고|메모|참고|설명|상세|내용/), link: find(/링크|URL|주소|자료|파일/i) };
  if (col.detail === col.title) col.detail = head.findIndex((c, i) => i !== col.title && /세부|방법|비고|메모|참고|설명|상세/.test(c));
  const hasHead = col.month >= 0 || col.title >= 0;
  const body = hasHead ? rows.slice(1) : rows;
  if (!hasHead) {
    // 머리글이 없으면: 달처럼 보이는 칸 = 시기, 가장 긴 칸 = 내용, 남은 첫 칸 = 할 일
    const monthish = Array.from({ length: width }, (_, i) => body.filter(r => parseMonthCell(r[i]).month).length);
    const avgLen = Array.from({ length: width }, (_, i) => body.reduce((n, r) => n + (r[i] || "").length, 0) / body.length);
    const mi = monthish.indexOf(Math.max(...monthish));
    col.month = monthish[mi] >= Math.ceil(body.length / 3) ? mi : -1;
    const rest = Array.from({ length: width }, (_, i) => i).filter(i => i !== col.month);
    col.detail = rest.length > 1 ? rest.reduce((a, b) => (avgLen[b] > avgLen[a] ? b : a)) : -1;
    col.title = rest.find(i => i !== col.detail) ?? col.detail;
    if (col.title === col.detail) col.detail = -1;
  }
  let lastMonth = 0;
  return body.map(r => {
    const at = i => (i >= 0 ? r[i] || "" : "");
    const parsed = parseMonthCell(at(col.month));
    const month = parsed.month || (at(col.month) ? 0 : lastMonth);
    if (parsed.month) lastMonth = parsed.month;
    const links = Array.from(new Set(r.join(" ").match(URL_RE) || [])).map(url => newLink(linkKind(url).label, url));
    const strip = v => v.replace(URL_RE, "").trim();
    let title = strip(at(col.title)); let detail = strip(at(col.detail));
    const extra = r.map((c, i) => (![col.month, col.title, col.detail, col.link].includes(i) ? strip(c) : "")).filter(Boolean).join(" / ");
    if (extra) detail = [detail, extra].filter(Boolean).join("\n");
    if (!title && detail) { title = detail.split("\n")[0].slice(0, 40); detail = detail.includes("\n") ? detail.split("\n").slice(1).join("\n") : (detail.length > 40 ? detail : ""); }
    return newStep({ month, when: parsed.when || (!parsed.month && at(col.month) ? at(col.month) : ""), title, detail, links });
  }).filter(step => step.title || step.detail || step.links.length);
}

// 나눠 맡는 업무: '따라체험(...) 1'과 '따라체험(...) 2'처럼 끝 번호만 다른 업무
export const dutyBase = text => String(text || "").replace(/\s*(?:[①②③④⑤]|\(\d\)|\d)\s*$/, "").trim();
export const dutyPartNo = text => { const m = String(text || "").match(/(?:([①②③④⑤])|\((\d)\)|(\d))\s*$/); if (!m) return ""; return m[1] ? String("①②③④⑤".indexOf(m[1]) + 1) : (m[2] || m[3]); };
export function siblingDuties(structure, dutyId) {
  const all = (structure?.roles || []).flatMap(role => role.duties.map(duty => ({ duty, role })));
  const me = all.find(x => x.duty.id === dutyId);
  if (!me || !dutyPartNo(me.duty.text)) return [];
  const base = dutyBase(me.duty.text);
  return all.filter(x => x.role.deptId === me.role.deptId && dutyPartNo(x.duty.text) && dutyBase(x.duty.text) === base).sort((a, b) => Number(dutyPartNo(a.duty.text)) - Number(dutyPartNo(b.duty.text)));
}
// '함께 쓰기'를 켠 업무들은 한 저장소(타임라인·자료·코멘트)를 같이 써요
export const taskStoreKey = duty => (duty?.group ? handoverTaskKey(`grp_${duty.group}`) : handoverTaskKey(duty?.id));
// 두 업무 내용을 하나로(함께 쓰기를 켤 때)
export function mergeTasks(list = []) {
  const ts = list.map(normalizeTask);
  const join = key => ts.map(t => t[key].trim()).filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join("\n\n");
  const seen = new Set();
  const uniq = arr => arr.filter(x => { const k = x.id || x.url || x.dataKey || JSON.stringify(x); if (seen.has(k)) return false; seen.add(k); return true; });
  return { ...emptyTask(), summary: join("summary"), must: join("must"), changes: join("changes"), steps: uniq(ts.flatMap(t => t.steps)), links: uniq(ts.flatMap(t => t.links)), files: uniq(ts.flatMap(t => t.files)), comments: uniq(ts.flatMap(t => t.comments)).sort((a, b) => String(a.at).localeCompare(String(b.at))) };
}
// 메신저에 붙여 넣을 글
export function taskAsText(task, title = "", whoLabel = () => "") {
  const t = normalizeTask(task);
  const lines = [`[업무 인수인계] ${title}`];
  if (t.summary.trim()) lines.push("", `요약: ${t.summary.trim()}`);
  if (t.must.trim()) lines.push(`꼭 알아둘 것: ${t.must.trim()}`);
  if (t.changes.trim()) lines.push(`달라진 점: ${t.changes.trim()}`);
  if (t.steps.length) { lines.push("", "■ 타임라인"); groupSteps(t.steps).forEach(g => g.steps.forEach(s => lines.push(`${g.label}${s.when ? ` ${s.when}` : ""} ${s.done ? "✓ " : ""}${whoLabel(s.who) ? `[${whoLabel(s.who)}] ` : ""}${s.title}${s.detail ? ` - ${s.detail.replace(/\n+/g, " ")}` : ""}${s.links.length ? ` (${s.links.map(l => l.url).join(", ")})` : ""}`))); }
  if (t.links.length) { lines.push("", "■ 자료"); t.links.forEach(l => lines.push(`- ${l.label || linkKind(l.url).label}: ${l.url}`)); }
  return lines.join("\n");
}

// 단계 담당 고르기: 함께 쓰는 나눠 맡은 업무면 1번·2번 담당, 아니면 담당 선생님 + 함께 고칠 선생님. 2명 이상일 때만 써요.
export function stepPeople({ duty, role, siblings = [], roleLabel = r => r?.title || "담당" }) {
  if (duty?.group && siblings.length > 1) return siblings.filter(x => x.duty.group === duty.group).map((x, i) => ({ id: x.duty.id, short: dutyPartNo(x.duty.text) || String(i + 1), label: `${dutyPartNo(x.duty.text) || i + 1}번 ${x.role.ownerName || roleLabel(x.role)}`, tone: i % 4 }));
  const list = [];
  if (role?.ownerId) list.push({ id: `t:${role.ownerId}`, short: (role.ownerName || "담당").slice(0, 3), label: role.ownerName || "담당 선생님", tone: 0 });
  (duty?.editors || []).forEach(e => { if (!list.some(p => p.id === `t:${e.id}`)) list.push({ id: `t:${e.id}`, short: e.name.slice(0, 3), label: e.name, tone: list.length % 4 }); });
  return list.length > 1 ? list : [];
}

// 단계 내용 보기 좋게: ⓐⓑⓒ·①②·'- '·'• '·'1) ' 같은 항목은 한 줄씩 목록으로, '*'로 시작하는 줄은 참고 메모로 나눠요.
const ENUM_CHARS = "ⓐ-ⓩ①-⑳㉠-㉭㉮-㉻";
export function formatDetail(text = "") {
  const out = [];
  String(text || "").replace(/\r/g, "").split("\n").forEach(raw => {
    const line = raw.trim();
    if (!line) return;
    if (/^[*※]/.test(line)) { out.push({ type: "note", text: line.replace(/^[*※]\s*/, "") }); return; }
    // 한 줄 안의 ⓐ ⓑ ⓒ 를 나눠요(앞의 쉼표·공백은 지움)
    const parts = line.split(new RegExp(`\\s*,?\\s*(?=[${ENUM_CHARS}])`)).map(p => p.trim()).filter(Boolean);
    parts.forEach(part => {
      let m = part.match(new RegExp(`^([${ENUM_CHARS}])\\s*(.*)$`));
      if (m) { out.push({ type: "li", marker: m[1], text: m[2].replace(/[,，]\s*$/, "") }); return; }
      m = part.match(/^(\d{1,2}[).]|[-•·▪◦])\s+(.*)$/);
      if (m) { out.push({ type: "li", marker: /^[-•·▪◦]$/.test(m[1]) ? "•" : m[1], text: m[2] }); return; }
      out.push({ type: "p", text: part });
    });
  });
  return out;
}

// 부서 선생님: 'N학년부'는 학년이 N으로 지정된 선생님(학년·담임 학년·학년부장 학년) 자동 포함,
// 담당자 배정 화면에서 더한 선생님(memberAdd)은 넣고 뺀 선생님(memberRemove)은 빼요. 이미 담당인 선생님은 늘 포함.
export const teacherGradeOf = t => String(t?.roleGrade || t?.homeroomGrade || t?.gradeHeadGrade || "").trim();
export function deptMembers(dept, teachers = [], roles = []) {
  const grade = (String(dept?.name || "").match(/([1-3])\s*학년/) || [])[1] || "";
  const add = new Set((dept?.memberAdd || []).map(String));
  const remove = new Set((dept?.memberRemove || []).map(String));
  const owners = new Set(roles.filter(r => r.deptId === dept?.id && r.ownerId).map(r => String(r.ownerId)));
  return teachers.filter(t => { const id = String(t.id); if (owners.has(id)) return true; if (remove.has(id)) return false; return add.has(id) || (!!grade && teacherGradeOf(t) === grade); });
}
