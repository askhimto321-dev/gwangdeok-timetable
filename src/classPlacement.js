// 반편성 결과 확인: 반편성 결과 엑셀(새 학년 반 배정)을 읽어
// ① 분리희망 쌍이 다른 반으로 나뉘었는지(반영) 같은 반인지(미반영) 확인하고
// ② 새 반 명단을 보며 선생님들이 학생·반에 검토 표시(리더 후보, 조합 우려 등)를 남깁니다.
// 학생은 지금 2학년 학번(예: 20415)으로 맞춥니다. 파일 양식이 학교마다 달라 여러 형식을 읽어요.

// 학년(지금 학년)마다 따로 저장: 2학년(→3학년)은 예전 키를 그대로 써요.
export const placementKey = (year, grade = "2") => `kd_class_placement_v1:${Number(year)}${String(grade) === "2" ? "" : `:g${grade}`}`;
export const placementReviewKey = (year, grade = "2") => `kd_class_placement_review_v1:${Number(year)}${String(grade) === "2" ? "" : `:g${grade}`}`;

// 학생 표시(검토할 때 쓰는 말)
export const STUDENT_FLAGS = [
  { key: "leader", label: "리더 후보", hint: "반장·부반장을 맡을 만한 학생", tone: "good" },
  { key: "combo", label: "조합 우려", hint: "같은 반이면 서로 영향이 큰 학생", tone: "warn" },
  { key: "care", label: "배려 필요", hint: "적응·관계에서 세심한 배려가 필요한 학생", tone: "info" },
  { key: "guide", label: "생활지도 주의", hint: "생활지도 부담이 큰 학생", tone: "bad" },
  { key: "move", label: "이동 희망", hint: "다른 반으로 옮기는 게 좋겠다고 보는 학생", tone: "mv" },
];
// 반 점검(새 반 단위)
export const CLASS_CHECKS = [
  { key: "noLeader", label: "리더 후보 부족", hint: "반을 이끌 학생이 없거나 적음" },
  { key: "comboHeavy", label: "조합 우려 쏠림", hint: "서로 영향이 큰 학생이 한 반에 몰림" },
  { key: "gender", label: "성비 불균형", hint: "남녀 수 차이가 큼" },
  { key: "guideHeavy", label: "생활지도 부담 쏠림", hint: "생활지도 주의 학생이 몰림" },
  { key: "levelHeavy", label: "학습 수준 쏠림", hint: "학습 수준이 한쪽으로 치우침" },
];

const norm = value => String(value ?? "").normalize("NFKC").replace(/\s+/g, "").trim();
const pad2 = n => String(Number(n)).padStart(2, "0");

// 이전(지금 2학년) 학번 읽기: 20415 / 2-4-15 / 2학년 4반 15번 / 2.04.15
export function parseOldSid(value, grade = "2") {
  const v = norm(value);
  if (!v) return "";
  if (new RegExp(`^${grade}\\d{4}$`).test(v)) return v;
  const m = v.match(new RegExp(`^${grade}(?:학년)?[-.·/]?(\\d{1,2})(?:반)?[-.·/]?(\\d{1,2})(?:번)?$`));
  if (m && Number(m[1]) >= 1 && Number(m[2]) >= 1) return `${grade}${pad2(m[1])}${pad2(m[2])}`;
  return "";
}
// 새 학년 학번(예: 30215)에서 반
const newClassFromSid = (value, nextGrade) => { const v = norm(value); return new RegExp(`^${nextGrade}\\d{4}$`).test(v) ? Number(v.slice(1, 3)) : 0; };
const classFromText = value => { const m = norm(value).match(/(?:^|[^0-9])?(\d{1,2})반/) || norm(value).match(/^(\d{1,2})$/); return m ? Number(m[1]) : 0; };

// sheets: [{ name, aoa }] (aoa = 2차원 배열), roster: { 학번: { name, gender, class, number } }
// 돌려주는 값: { bySid: { 학번: 새반 }, stats: { rows, bySid, byName, unmatched: [...], ambiguous: [...] } }
export function parsePlacementSheets(sheets = [], roster = {}, { grade = "2" } = {}) {
  const nextGrade = String(Number(grade) + 1);
  const bySid = {};
  const stats = { rows: 0, bySid: 0, byName: 0, unmatched: [], ambiguous: [], classes: new Set() };
  const nameIndex = new Map();
  Object.entries(roster || {}).forEach(([sid, s]) => { const k = norm(s?.name); if (!k) return; if (!nameIndex.has(k)) nameIndex.set(k, []); nameIndex.get(k).push({ sid, gender: norm(s?.gender) }); });

  sheets.forEach(({ name: sheetName, aoa }) => {
    const rows = (aoa || []).map(r => (r || []).map(c => String(c ?? "").trim()));
    if (!rows.length) return;
    const width = Math.max(0, ...rows.map(r => r.length));
    // 머리글 줄: 이름/성명이 있는 첫 10줄 안의 줄
    let head = rows.slice(0, 12).findIndex(r => r.some(c => /^(이름|성명|학생명|학생이름)$/.test(norm(c))));
    const headRow = head >= 0 ? rows[head].map(norm) : [];
    const body = head >= 0 ? rows.slice(head + 1) : rows;
    const colWhere = test => headRow.findIndex(test);
    const nameCol = colWhere(c => /^(이름|성명|학생명|학생이름)$/.test(c));
    const genderCol = colWhere(c => /^(성별|남녀)$/.test(c));
    // 값 모양으로 열 찾기
    const share = (col, fn) => { const vals = body.map(r => r[col]).filter(v => String(v || "").trim()); return vals.length ? vals.filter(fn).length / vals.length : 0; };
    const cols = Array.from({ length: width }, (_, i) => i);
    let oldSidCol = cols.find(i => share(i, v => !!parseOldSid(v, grade)) >= 0.6);
    const newSidCol = cols.find(i => i !== oldSidCol && share(i, v => !!newClassFromSid(v, nextGrade)) >= 0.6);
    // 이전 학년·반·번호가 나뉜 경우(머리글에 이전/구/현/2학년)
    const oldTag = c => /이전|구|기존|현|원|전학년|2학년|작년/.test(c);
    const oldClassCol = colWhere(c => oldTag(c) && /반$/.test(c) && !/학번/.test(c));
    const oldNumCol = colWhere(c => oldTag(c) && /번호$/.test(c));
    // 새 반 열: 머리글에 반(이전 아님)·배정·편성·신·3학년
    let newClassCol = colWhere(c => /반/.test(c) && !oldTag(c) && /(새|신|배정|편성|진급|3학년|학급)/.test(c));
    if (newClassCol < 0) newClassCol = colWhere(c => /^반$/.test(c) && !oldTag(c));
    if (newClassCol === oldClassCol) newClassCol = -1;
    const sheetClass = classFromText(sheetName) || 0;
    let titleClass = 0;
    rows.slice(0, Math.max(1, head)).forEach(r => r.forEach(c => { const m = norm(c).match(new RegExp(`${nextGrade}학년(\\d{1,2})반`)); if (m) titleClass = Number(m[1]); }));

    body.forEach(r => {
      const nameRaw = nameCol >= 0 ? r[nameCol] : "";
      let sid = oldSidCol != null && oldSidCol >= 0 ? parseOldSid(r[oldSidCol], grade) : "";
      if (!sid && oldClassCol >= 0 && oldNumCol >= 0 && Number(r[oldClassCol]) && Number(r[oldNumCol])) sid = `${grade}${pad2(r[oldClassCol])}${pad2(r[oldNumCol])}`;
      if (!sid) { const hit = r.map(c => parseOldSid(c, grade)).find(Boolean); if (hit && oldSidCol == null) sid = hit; }
      let cls = newSidCol != null && newSidCol >= 0 ? newClassFromSid(r[newSidCol], nextGrade) : 0;
      if (!cls && newClassCol >= 0) cls = classFromText(r[newClassCol]);
      if (!cls) cls = titleClass || sheetClass;
      if (!cls || (!sid && !norm(nameRaw))) return;
      if (!sid && !norm(nameRaw)) return;
      stats.rows += 1;
      if (sid && (!roster || roster[sid] || !Object.keys(roster).length)) {
        // 학번이 있으면 이름이 명단과 다를 때만 이름으로 다시 확인
        if (roster?.[sid] && norm(nameRaw) && norm(roster[sid].name) && norm(roster[sid].name) !== norm(nameRaw)) {
          const byName = nameIndex.get(norm(nameRaw)) || [];
          if (byName.length === 1) sid = byName[0].sid;
        }
        bySid[sid] = cls; stats.bySid += 1; stats.classes.add(cls); return;
      }
      const cands = (nameIndex.get(norm(nameRaw)) || []).filter(c => genderCol < 0 || !norm(r[genderCol]) || !c.gender || c.gender === norm(r[genderCol]));
      if (cands.length === 1) { bySid[cands[0].sid] = cls; stats.byName += 1; stats.classes.add(cls); }
      else if (cands.length > 1) stats.ambiguous.push({ name: nameRaw, cls });
      else stats.unmatched.push({ name: nameRaw, sid, cls });
    });
  });
  return { bySid, stats: { ...stats, classes: Array.from(stats.classes).sort((a, b) => a - b) } };
}

// 분리 쌍 결과: ok = 다른 반(반영), same = 같은 반(미반영), unknown = 한쪽 이상 결과에 없음
export function checkPairs(pairs = [], bySid = {}) {
  return pairs.map(p => {
    const ca = Number(bySid[p.a]) || 0, cb = Number(bySid[p.b]) || 0;
    const status = !ca || !cb ? "unknown" : ca === cb ? "same" : "ok";
    return { ...p, ca, cb, status };
  });
}
// 학생별: 그 학생이 들어간 쌍들 → same 하나라도 있으면 미반영, 다 ok면 반영, 그 밖은 확인 필요
export function studentResults(checked = []) {
  const map = new Map();
  checked.forEach(p => [[p.a, p.b, p.ca, p.cb], [p.b, p.a, p.cb, p.ca]].forEach(([me, other, mine, theirs]) => {
    if (!map.has(me)) map.set(me, { sid: me, cls: mine, items: [] });
    map.get(me).items.push({ other, otherCls: theirs, level: p.level, reasons: p.reasons, status: p.status });
  }));
  return Array.from(map.values()).map(s => ({ ...s, status: s.items.some(i => i.status === "same") ? "same" : s.items.every(i => i.status === "ok") ? "ok" : "unknown" }));
}

// ── 학교 반편성 프로그램 파일('학생배정현황' 시트): 구반·구번호·반·번호·이름·성별 + 과목(A~I 그룹 또는 '원반') + 배정가능학급(1~N에 1)
// 돌려주는 값: { students: { 학번: { name, gender, cls, no, orig, can: [반], ob: ["1학기 과목", ...] } }, classOb: { 반: [원반 과목] }, stats }
export function parseAssignmentSheet(aoa = [], { grade = "2" } = {}) {
  const rows = (aoa || []).map(r => (r || []).map(c => String(c ?? "").trim()));
  const headIdx = rows.slice(0, 15).findIndex(r => r.some(c => norm(c) === "구반") && r.some(c => /^(이름|성명)$/.test(norm(c))));
  if (headIdx < 0) return null;
  const head = rows[headIdx].map(norm);
  const groupRow = rows[headIdx - 1] || [];
  const col = name => head.findIndex(c => c === name);
  const c = { oldCls: col("구반"), oldNo: col("구번호"), cls: col("반"), no: col("번호"), name: head.findIndex(x => /^(이름|성명)$/.test(x)), gender: col("성별") };
  // 위 줄(그룹 이름)을 오른쪽으로 이어 붙여 열마다 그룹을 정해요
  let group = ""; const groupOf = [];
  for (let i = 0; i < head.length; i += 1) { if (String(groupRow[i] || "").trim()) group = String(groupRow[i]).trim(); groupOf[i] = group; }
  const canCols = []; const subjCols = [];
  head.forEach((h, i) => {
    if (/배정가능/.test(groupOf[i]) && /^\d{1,2}$/.test(h)) canCols.push({ i, cls: Number(h) });
    else if (/학기/.test(groupOf[i]) && h && i > c.gender) { const sem = (groupOf[i].match(/(\d)학기/) || [])[1] || ""; subjCols.push({ i, sem, name: String(rows[headIdx][i]).trim(), label: `${sem}학기 ${String(rows[headIdx][i]).trim()}` }); }
  });
  const students = {}; const classOb = {}; const stats = { rows: 0, noSid: 0 };
  rows.slice(headIdx + 1).forEach(r => {
    const name = r[c.name]; const cls = Number(r[c.cls]); const oc = Number(r[c.oldCls]); const on = Number(r[c.oldNo]);
    if (!name || !cls) return;
    stats.rows += 1;
    if (!oc || !on) { stats.noSid += 1; return; }
    const sid = `${grade}${pad2(oc)}${pad2(on)}`;
    const ob = subjCols.filter(s => r[s.i] === "원반").map(s => s.label);
    const can = canCols.filter(x => String(r[x.i]).trim() === "1").map(x => x.cls);
    // 학기별 과목과 동시그룹(A~I 또는 '원반')
    const sj = subjCols.filter(s => r[s.i]).map(s => ({ sem: s.sem, n: s.name, g: r[s.i] }));
    students[sid] = { name, gender: c.gender >= 0 ? r[c.gender] : "", cls, orig: cls, no: Number(r[c.no]) || 0, can: can.length ? Array.from(new Set([...can, cls])).sort((a, b) => a - b) : null, ob, sj };
    if (!classOb[cls]) classOb[cls] = ob;
  });
  return { students, classOb, stats: { ...stats, students: Object.keys(students).length, classes: Object.keys(classOb).map(Number).sort((a, b) => a - b), hasCan: canCols.length > 0 } };
}

// ── '강의실배정' 시트: 과목·동시그룹(A~I 또는 원반)마다 반별 인원 ──────────────
// 돌려주는 값: { letters: {학기: [그룹]}, sections: ["학기|과목|그룹"], part: {학기: {그룹: [반]}}, ob: {반: {학기: [원반 과목]}} }
// part = 그 그룹 시간에 수업이 있는 반. 반의 원반 수업은 그 반이 빠지는 그룹 시간에 들어가요.
export function parseRoomSheet(aoa = []) {
  const rows = (aoa || []).map(r => (r || []).map(c => String(c ?? "").trim()));
  const hi = rows.slice(0, 15).findIndex(r => r.includes("과목") && r.some(c => /동시\s*그룹/.test(c)));
  if (hi < 0) return null;
  const h = rows[hi];
  const cSub = h.indexOf("과목"); const cG = h.findIndex(c => /동시\s*그룹/.test(c)); const cSem = h.findIndex(c => /학기/.test(c));
  const clsCols = h.map((x, i) => ({ i, cls: Number(x) })).filter(x => x.i > cG && /^\d{1,2}$/.test(h[x.i]));
  const sections = new Set(); const part = {}; const ob = {}; const letters = {};
  rows.slice(hi + 1).forEach(r => {
    const sub = r[cSub]; const g = r[cG]; const sem = ((cSem >= 0 ? r[cSem] : "").match(/(\d)/) || [])[1];
    if (!sub || !g || !sem) return;
    const classes = clsCols.filter(x => Number(r[x.i]) > 0).map(x => x.cls);
    if (g === "원반") { classes.forEach(c => { const list = ((ob[c] ||= {})[sem] ||= []); if (!list.includes(sub)) list.push(sub); }); return; }
    sections.add(`${sem}|${sub}|${g}`);
    if (!(letters[sem] ||= []).includes(g)) letters[sem].push(g);
    const list = ((part[sem] ||= {})[g] ||= []); classes.forEach(c => { if (!list.includes(c)) list.push(c); });
  });
  if (!sections.size) return null;
  Object.values(letters).forEach(l => l.sort());
  return { letters, sections: Array.from(sections), part, ob };
}

// 시간표 배정용: 지금 반에 그대로 있는 학생들이 듣는 과목·그룹별 반 인원 { "학기|과목|그룹": Map(반 → 인원) }
export function sectionMembers(placement) {
  const m = new Map();
  Object.values(placement?.students || {}).forEach(x => {
    if (Number(x.cls) !== Number(x.orig) || !Array.isArray(x.sj)) return;
    x.sj.forEach(s => { if (s.g === "원반" || s.ox) return; const k = `${s.sem}|${s.n}|${s.g}`; if (!m.has(k)) m.set(k, new Map()); const c = Number(x.cls); m.get(k).set(c, (m.get(k).get(c) || 0) + 1); });
  });
  return m;
}

// 반을 옮겼을 때 시간표: 새 반 원반 과목은 원반으로, 나머지 과목은 그룹(A~E · F~I)마다 하나씩 겹치지 않게.
// 과목·그룹은 그 반에 같은 과목·그룹을 듣는 학생이 있어야 들을 수 있어요(아무도 없으면 수강 불가). 원래 그룹을 먼저 써요.
// 돌려주는 값: null(정보 없음) 또는 { ok, issues: [{ sem, n, kind: "ob" | "none" | "clash" }], plan: [{ sem, n, from, to }], tt: { 학기: { letters, by: {그룹: 과목}, ob: [원반 과목], lost: [못 넣은 과목] } } }
export function courseCheck(placement, sid, to, members = null) {
  const rm = placement?.rooms; const s = placement?.students?.[sid];
  if (!rm?.letters || !Array.isArray(s?.sj) || !s.sj.length) return null;
  const mem = members || sectionMembers(placement);
  // 그 반에 그대로 있는 학생 중 같은 과목·그룹을 듣는 학생 수(옮기는 학생 자신은 다른 반에 있거나 이미 그 반 학생이라 그대로 세요)
  const cnt = (sem, n, l) => mem.get(`${sem}|${n}|${l}`)?.get(Number(to)) || 0;
  const issues = []; const plan = []; const tt = {};
  Object.keys(rm.letters).forEach(sem => {
    const L = rm.letters[sem] || [];
    const mine = s.sj.filter(x => String(x.sem) === String(sem));
    if (!mine.length) return;
    const obc = rm.ob?.[to]?.[sem] || [];
    const names = mine.map(x => x.n);
    const blocked = L.filter(l => !(rm.part?.[sem]?.[l] || []).map(Number).includes(Number(to)));
    // 원반 대신 듣는 과목(ox): 원반 시간(그 반이 빠지는 그룹)에 열리는 다른 반 수업으로 들어요. 그만큼 원반 과목을 안 골라도 돼요.
    const outs = mine.filter(x => x.ox && !obc.includes(x.n));
    const sec = new Set(rm.sections || []);
    const oxBy = {};
    outs.forEach(x => { const l = [x.g, ...blocked.filter(b => b !== x.g)].find(b => blocked.includes(b) && sec.has(`${sem}|${x.n}|${b}`) && !Object.values(oxBy).includes(b)); if (l) { oxBy[x.n] = l; if (l !== x.g) plan.push({ sem, n: x.n, from: x.g, to: l }); } else issues.push({ sem, n: x.n, kind: "noslot", to }); });
    obc.filter(n => !names.includes(n)).slice(outs.length).forEach(n => issues.push({ sem, n, kind: "ob" }));
    const avail = L.filter(l => !blocked.includes(l));
    mine.filter(x => obc.includes(x.n) && x.g !== "원반").forEach(x => plan.push({ sem, n: x.n, from: x.g, to: "원반" }));
    const todo = mine.filter(x => !obc.includes(x.n) && !(x.ox && !obc.includes(x.n)));
    const opts = todo.map(x => { const o = avail.filter(l => cnt(sem, x.n, l) > 0); return o.includes(x.g) ? [x.g, ...o.filter(l => l !== x.g)] : o; });
    // 고를 수 있는 그룹이 적은 과목부터 채워요
    const order = todo.map((x, i) => i).sort((a, b) => opts[a].length - opts[b].length);
    let best = null;
    const go = (k, used, pick) => {
      if (best && best.size === todo.length) return;
      if (k === order.length) { if (!best || pick.size > best.size) best = new Map(pick); return; }
      const i = order[k]; let placed = false;
      for (const l of opts[i]) { if (used.has(l)) continue; placed = true; used.add(l); pick.set(i, l); go(k + 1, used, pick); pick.delete(i); used.delete(l); if (best && best.size === todo.length) return; }
      if (!placed || !best || best.size < todo.length) go(k + 1, used, pick);
    };
    go(0, new Set(), new Map());
    const by = {}; const lost = [];
    todo.forEach((x, i) => { const l = best?.get(i); if (l) { by[l] = x.n; if (l !== x.g) plan.push({ sem, n: x.n, from: x.g, to: l }); } else { lost.push(x.n); issues.push({ sem, n: x.n, kind: opts[i].length ? "clash" : "none", to }); } });
    Object.entries(oxBy).forEach(([n, l]) => { by[l] = n; });
    tt[sem] = { letters: L, blocked, by, ob: obc.filter(n => names.includes(n)), lost };
  });
  return { ok: !issues.length, issues, plan, tt };
}
export const courseIssueText = i => (i.kind === "noslot" ? `${i.sem}학기 '${i.n}': ${i.to ? `${i.to}반 ` : ""}원반 시간에 열리는 수업이 없음` : i.kind === "ob" ? `${i.sem}학기 원반 '${i.n}' 안 고름` : i.kind === "none" ? `${i.sem}학기 '${i.n}': ${i.to ? `${i.to}반에 ` : ""}같은 과목·그룹 듣는 학생 없음` : `${i.sem}학기 '${i.n}': 다른 과목과 시간이 겹침`);

// '시수배당표' 시트: 학기마다 반별 시수 → 반마다 그 학기 공통(반 전체가 듣는) 과목
// selective: 선택 과목 이름(강의실배정의 과목) — 이 과목들은 빼요. 돌려주는 값: { 학기: { 반: [과목] } }
export function parseHoursSheet(aoa = [], selective = new Set()) {
  const rows = (aoa || []).map(r => (r || []).map(c => String(c ?? "").trim()));
  const hi = rows.slice(0, 15).findIndex(r => r.includes("과목") && r.some(c => /^학기$/.test(c)));
  if (hi < 0) return null;
  const h = rows[hi]; const cSem = h.findIndex(c => /^학기$/.test(c)); const cSub = h.indexOf("과목");
  const clsCols = h.map((x, i) => ({ i, cls: Number(x) })).filter(x => x.i > cSub && /^\d{1,2}$/.test(h[x.i]));
  const out = {};
  rows.slice(hi + 1).forEach(r => {
    const m = String(r[cSem] || "").match(/^(\d)학기$/); const sub = r[cSub];
    if (!m || !sub || /합계/.test(sub) || selective.has(sub)) return;
    clsCols.forEach(x => { if (Number(r[x.i]) > 0) { const list = ((out[m[1]] ||= {})[x.cls] ||= []); if (!list.includes(sub)) list.push(sub); } });
  });
  return Object.keys(out).length ? out : null;
}

// 파일 전체 읽기: '학생배정현황' 같은 프로그램 시트가 있으면 그것, 없으면 일반 명단(parsePlacementSheets)
export function parsePlacementFile(sheets = [], roster = {}, opts = {}) {
  const prog = sheets.find(s => /학생배정현황/.test(s.name)) || sheets.find(s => parseAssignmentSheet(s.aoa, opts));
  const parsed = prog ? parseAssignmentSheet(prog.aoa, opts) : null;
  if (parsed && parsed.stats.students) {
    const roomSheet = sheets.find(s => /강의실\s*배정/.test(s.name));
    const rooms = roomSheet ? parseRoomSheet(roomSheet.aoa) : null;
    if (rooms) {
      const hoursSheet = sheets.find(s => /시수\s*배당/.test(s.name));
      const selective = new Set([...rooms.sections.map(k => k.split("|")[1]), ...Object.values(rooms.ob).flatMap(o => Object.values(o).flat())]);
      const common = hoursSheet ? parseHoursSheet(hoursSheet.aoa, selective) : null;
      if (common) rooms.common = common;
      parsed.rooms = rooms;
    }
    const unmatched = Object.keys(parsed.students).filter(sid => Object.keys(roster || {}).length && !roster[sid]);
    return { kind: "program", sheet: prog.name, ...parsed, stats: { ...parsed.stats, unmatched } };
  }
  const generic = parsePlacementSheets(sheets, roster, opts);
  const students = Object.fromEntries(Object.entries(generic.bySid).map(([sid, cls]) => [sid, { name: roster?.[sid]?.name || "", gender: roster?.[sid]?.gender || "", cls, orig: cls, no: 0, can: null, ob: [] }]));
  return { kind: "list", students, classOb: {}, stats: { ...generic.stats, students: Object.keys(students).length, hasCan: false } };
}

// 예전 저장 형식({ bySid })도 읽어요
export function normalizePlacement(raw, roster = {}) {
  if (!raw) return null;
  if (raw.students) return { ...raw, moves: raw.moves || [], classOb: raw.classOb || {} };
  if (raw.bySid) return { ...raw, students: Object.fromEntries(Object.entries(raw.bySid).map(([sid, cls]) => [sid, { name: roster?.[sid]?.name || "", gender: roster?.[sid]?.gender || "", cls: Number(cls), orig: Number(cls), no: 0, can: null, ob: [] }])), moves: [], classOb: {} };
  return null;
}
export const bySidOf = placement => Object.fromEntries(Object.entries(placement?.students || {}).map(([sid, s]) => [sid, Number(s.cls)]));
// 갈 수 있는 반(지금 반 제외). 정보가 없으면 모든 반
export function movableClasses(placement, sid) {
  const s = placement?.students?.[sid]; if (!s) return [];
  const all = Array.from(new Set(Object.values(placement.students).map(x => Number(x.cls)))).sort((a, b) => a - b);
  return (s.can || all).filter(c => c !== Number(s.cls));
}
// 맞바꿀 수 있는 학생: 대상 반 학생 중 우리 반으로 올 수 있는 학생(같은 성별 먼저)
export function swapCandidates(placement, sid, to) {
  const s = placement?.students?.[sid]; if (!s) return [];
  return Object.entries(placement.students).filter(([id, x]) => Number(x.cls) === Number(to) && id !== sid && (!x.can || x.can.includes(Number(s.cls))))
    .map(([id, x]) => ({ sid: id, ...x })).sort((a, b) => (a.gender === s.gender ? 0 : 1) - (b.gender === s.gender ? 0 : 1) || a.sid.localeCompare(b.sid));
}
// 이동 적용(맞바꾸기면 두 학생 모두). 기록은 moves에 쌓여요.
export function applyMove(placement, { sid, to, swap = "", by = "", at = new Date().toISOString() }) {
  const students = { ...placement.students }; const s = students[sid]; if (!s) return placement;
  const from = Number(s.cls); to = Number(to); if (from === to) return placement;
  students[sid] = { ...s, cls: to };
  if (swap && students[swap]) students[swap] = { ...students[swap], cls: from };
  const id = `mv${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  return { ...placement, students, moves: [...(placement.moves || []), { id, sid, from, to, swap: swap || "", by, at }] };
}
// 이동 되돌리기(그 이동만 되돌림: 학생을 원래 반으로, 맞바꾼 학생도)
export function undoMove(placement, moveId) {
  const mv = (placement.moves || []).find(m => m.id === moveId); if (!mv) return placement;
  const students = { ...placement.students };
  if (students[mv.sid]) students[mv.sid] = { ...students[mv.sid], cls: mv.from };
  if (mv.swap && students[mv.swap]) students[mv.swap] = { ...students[mv.swap], cls: mv.to };
  return { ...placement, students, moves: placement.moves.filter(m => m.id !== moveId) };
}
// 반별 요약: 인원·남녀·처음 대비 들어옴/나감
export function classSummary(placement) {
  const out = {};
  Object.values(placement?.students || {}).forEach(s => {
    const c = Number(s.cls), o = Number(s.orig);
    out[c] ||= { cls: c, n: 0, m: 0, f: 0, inn: 0, out: 0, orig: 0 }; out[o] ||= { cls: o, n: 0, m: 0, f: 0, inn: 0, out: 0, orig: 0 };
    out[c].n += 1; if (/남/.test(s.gender)) out[c].m += 1; else if (/여/.test(s.gender)) out[c].f += 1;
    out[o].orig += 1; if (c !== o) { out[c].inn += 1; out[o].out += 1; }
  });
  return Object.values(out).sort((a, b) => a.cls - b.cls);
}

// ── 선택과목 보기·바꾸기 ─────────────────────────────────────────────
// 학기마다 선택과목과 열리는 그룹: { 학기: { 과목: [그룹] } } (강의실배정이 있으면 그것, 없으면 학생들의 과목에서)
export function subjectCatalog(placement) {
  const out = {};
  const add = (sem, n, g) => { const list = ((out[sem] ||= {})[n] ||= []); if (g && !list.includes(g)) list.push(g); };
  if (placement?.rooms?.sections?.length) placement.rooms.sections.forEach(k => { const [sem, n, g] = k.split("|"); add(sem, n, g); });
  else Object.values(placement?.students || {}).forEach(x => (x.sj || []).forEach(s => { if (s.g !== "원반") add(String(s.sem), s.n, s.g); }));
  Object.values(out).forEach(m => Object.values(m).forEach(l => l.sort()));
  return out;
}
// 한 학생의 과목 하나를 바꿨을 때: 그룹을 정하고 그 반에서 시간표가 되는지 확인해요(그 학생은 빼고 센 반 인원 기준).
// 돌려주는 값: { g, check } — check는 courseCheck 결과(정보가 없으면 null)
export function trySubjectChange(placement, sid, sem, from, to) {
  const s = placement?.students?.[sid]; if (!s || !Array.isArray(s.sj)) return null;
  const old = s.sj.find(x => String(x.sem) === String(sem) && x.n === from); if (!old) return null;
  if (old.g === "원반" || old.ox) return tryOutOfHomeroom(placement, sid, sem, from, to);
  const letters = subjectCatalog(placement)[String(sem)]?.[to] || [];
  if (!letters.length) return { g: "", check: null, sj: null };
  const others = s.sj.filter(x => String(x.sem) === String(sem) && x.n !== from && x.g !== "원반").map(x => x.g);
  const g0 = letters.find(l => l === old.g) || letters.find(l => !others.includes(l)) || letters[0];
  const sj = s.sj.map(x => (x === old ? { ...x, n: to, g: g0 } : x));
  return arrangeGroups(placement, sid, sem, sj, to);
}
// 바꾼 과목 목록으로 그 학기 그룹(A~E 등)을 다시 배정해요: 시간표 점검이 찾은 배치대로 과목마다 그룹을 고쳐요.
// 돌려주는 값: { g: 새 과목 그룹, ox, check, sj: 새 과목 목록, moved: [{ n, from, to }] }
function arrangeGroups(placement, sid, sem, sj, to) {
  const s = placement.students[sid];
  const rest = { ...placement, students: Object.fromEntries(Object.entries(placement.students).filter(([id]) => id !== sid)) };
  const check = courseCheck({ ...placement, students: { ...placement.students, [sid]: { ...s, sj } } }, sid, s.cls, sectionMembers(rest));
  const mine = sj.find(x => String(x.sem) === String(sem) && x.n === to);
  if (!check) return { g: mine?.g || "", ox: !!mine?.ox, check: null, sj, moved: [] };
  const by = check.tt?.[sem]?.by || {};
  const letterOf = n => Object.keys(by).find(l => by[l] === n);
  const moved = [];
  const next = sj.map(x => {
    if (String(x.sem) !== String(sem) || x.g === "원반") return x;
    const l = letterOf(x.n); if (!l || l === x.g) return x;
    if (x.n !== to) moved.push({ n: x.n, from: x.g, to: l });
    return { ...x, g: l };
  });
  const now = next.find(x => String(x.sem) === String(sem) && x.n === to);
  return { g: now?.g || "", ox: !!now?.ox, check, sj: next, moved };
}
// 원반 과목을 다른 과목으로: 원반 시간(그 반이 빠지는 그룹)에 열리는 그 과목 수업으로 들어요. 원반 과목으로 되돌리면 다시 원반.
function tryOutOfHomeroom(placement, sid, sem, from, to) {
  const s = placement.students[sid]; const rm = placement.rooms; const cls = Number(s.cls);
  const obc = rm?.ob?.[cls]?.[sem] || [];
  const sjOf = (g, ox) => s.sj.map(x => (String(x.sem) === String(sem) && x.n === from ? (ox ? { sem: x.sem, n: to, g, ox: true } : { sem: x.sem, n: to, g }) : x));
  if (obc.includes(to)) return arrangeGroups(placement, sid, sem, sjOf("원반", false), to);
  if (!rm?.letters) { const g = subjectCatalog(placement)[String(sem)]?.[to]?.[0] || ""; return { g, ox: true, check: null, sj: sjOf(g, true), moved: [] }; }
  const L = rm.letters[sem] || [];
  const blocked = L.filter(l => !(rm.part?.[sem]?.[l] || []).map(Number).includes(cls));
  const sec = new Set(rm.sections || []);
  const g = blocked.find(l => sec.has(`${sem}|${to}|${l}`));
  if (!g) return { g: "", ox: true, check: { ok: false, issues: [{ sem, n: to, kind: "noslot", to: cls }], plan: [], tt: {} }, sj: null, moved: [] };
  return arrangeGroups(placement, sid, sem, sjOf(g, true), to);
}
// 과목 바꾸기 기록(sj0 = 처음 엑셀 과목, subjChanges = 기록)
// sj: 그룹까지 다시 배정한 새 과목 목록(trySubjectChange 결과). 없으면 그 과목만 바꿔요.
export function applySubjectChange(placement, { sid, sem, from, to, g, ox = false, sj: next = null, by = "", at = new Date().toISOString() }) {
  const s = placement?.students?.[sid]; if (!s || !Array.isArray(s.sj)) return placement;
  const old = s.sj.find(x => String(x.sem) === String(sem) && x.n === from); if (!old) return placement;
  const sj = Array.isArray(next) ? next : s.sj.map(x => { if (x !== old) return x; const { ox: _o, ...base } = x; return ox ? { ...base, n: to, g, ox: true } : { ...base, n: to, g }; });
  const id = `sc${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  return { ...placement, students: { ...placement.students, [sid]: { ...s, sj, sj0: s.sj0 || s.sj } }, subjChanges: [...(placement.subjChanges || []), { id, sid, sem: String(sem), from: { n: old.n, g: old.g }, to: { n: to, g, ...(ox ? { ox: true } : {}) }, by, at }] };
}
// 처음 엑셀 과목으로 되돌리기(그 학생 기록도 지워요)
export function resetSubjects(placement, sid) {
  const s = placement?.students?.[sid]; if (!s?.sj0) return placement;
  const { sj0, ...rest } = s;
  return { ...placement, students: { ...placement.students, [sid]: { ...rest, sj: sj0 } }, subjChanges: (placement.subjChanges || []).filter(c => c.sid !== sid) };
}
// 처음과 달라진 과목: [{ sem, from, to }]
export function subjectDiff(student) {
  if (!student?.sj0) return [];
  const key = x => `${x.sem}|${x.n}`;
  const was = new Set(student.sj0.map(key)); const now = new Set((student.sj || []).map(key));
  const out = [];
  ["1", "2"].concat(Array.from(new Set(student.sj0.map(x => String(x.sem))))).filter((v, i, a) => a.indexOf(v) === i).forEach(sem => {
    const gone = student.sj0.filter(x => String(x.sem) === sem && !now.has(key(x))).map(x => x.n);
    const added = (student.sj || []).filter(x => String(x.sem) === sem && !was.has(key(x))).map(x => x.n);
    gone.forEach((n, i) => out.push({ sem, from: n, to: added[i] || "" }));
  });
  return out;
}
