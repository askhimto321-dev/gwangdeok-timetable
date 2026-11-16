// 반편성 결과 확인: 반편성 결과 엑셀(새 학년 반 배정)을 읽어
// ① 분리희망 쌍이 다른 반으로 나뉘었는지(반영) 같은 반인지(미반영) 확인하고
// ② 새 반 명단을 보며 선생님들이 학생·반에 검토 표시(리더 후보, 조합 우려 등)를 남깁니다.
// 학생은 지금 2학년 학번(예: 20415)으로 맞춥니다. 파일 양식이 학교마다 달라 여러 형식을 읽어요.

export const placementKey = year => `kd_class_placement_v1:${Number(year)}`;
export const placementReviewKey = year => `kd_class_placement_review_v1:${Number(year)}`;

// 학생 표시(검토할 때 쓰는 말)
export const STUDENT_FLAGS = [
  { key: "leader", label: "리더 후보", hint: "반장·부반장을 맡을 만한 학생", tone: "good" },
  { key: "combo", label: "조합 우려", hint: "같은 반이면 서로 영향이 큰 학생", tone: "warn" },
  { key: "care", label: "배려 필요", hint: "적응·관계에서 세심한 배려가 필요한 학생", tone: "info" },
  { key: "guide", label: "생활지도 주의", hint: "생활지도 부담이 큰 학생", tone: "bad" },
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
    else if (/학기/.test(groupOf[i]) && h && i > c.gender) subjCols.push({ i, label: `${(groupOf[i].match(/(\d)학기/) || [])[1] || ""}학기 ${String(rows[headIdx][i]).trim()}` });
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
    students[sid] = { name, gender: c.gender >= 0 ? r[c.gender] : "", cls, orig: cls, no: Number(r[c.no]) || 0, can: can.length ? Array.from(new Set([...can, cls])).sort((a, b) => a - b) : null, ob };
    if (!classOb[cls]) classOb[cls] = ob;
  });
  return { students, classOb, stats: { ...stats, students: Object.keys(students).length, classes: Object.keys(classOb).map(Number).sort((a, b) => a - b), hasCan: canCols.length > 0 } };
}

// 파일 전체 읽기: '학생배정현황' 같은 프로그램 시트가 있으면 그것, 없으면 일반 명단(parsePlacementSheets)
export function parsePlacementFile(sheets = [], roster = {}, opts = {}) {
  const prog = sheets.find(s => /학생배정현황/.test(s.name)) || sheets.find(s => parseAssignmentSheet(s.aoa, opts));
  const parsed = prog ? parseAssignmentSheet(prog.aoa, opts) : null;
  if (parsed && parsed.stats.students) {
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
