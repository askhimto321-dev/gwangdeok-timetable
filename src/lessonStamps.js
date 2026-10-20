// 선생님 ZONE '수업 포트폴리오' 계산(수학 도장노트 앱의 규칙을 그대로 옮김) — 순수 함수, node 테스트용.
// 한 '도장부(book)' = 한 선생님 담당 과목의 한 반(학급 고정 수업) 또는 한 이동수업 분반.
// 학생 명단은 KDTIME 학생 명단(roster)·이동수업 출석부(enrollments)에서 바로 만듭니다.

export const MATH_UNITS = {
  "공통수학2": [["Ⅰ. 도형의 방정식", ["평면좌표", "직선의 방정식", "원의 방정식", "도형의 이동"]], ["Ⅱ. 집합과 명제", ["집합", "명제"]], ["Ⅲ. 함수와 그래프", ["함수", "유리함수와 무리함수"]]],
  "미적분Ⅰ": [["Ⅰ. 함수의 극한과 연속", ["함수의 극한", "함수의 연속"]], ["Ⅱ. 미분", ["미분계수와 도함수", "도함수의 활용"]], ["Ⅲ. 적분", ["부정적분과 정적분", "정적분의 활용"]]],
  "기하": [["Ⅰ. 이차곡선", ["포물선", "타원", "쌍곡선", "이차곡선과 직선"]], ["Ⅱ. 공간도형과 공간좌표", ["직선과 평면의 위치 관계", "삼수선의 정리와 정사영", "공간좌표"]], ["Ⅲ. 벡터", ["벡터의 연산", "벡터의 성분과 내적", "벡터를 이용한 도형의 방정식"]]],
};

// 도장 점수: mode "ratio"(도장률 × 만점, 소수 1자리) 또는 "rate"(도장률 구간별 점수)
export function defaultScoring() {
  return { stamp: { enabled: true, name: "도장판", mode: "rate", max: 10, excludeAbsent: true, floor: 5, bands: [{ min: 90, score: 10 }, { min: 80, score: 9 }, { min: 70, score: 8 }, { min: 60, score: 7 }, { min: 50, score: 6 }] }, items: [] };
}
// 포트폴리오 예시: 도장판 8 + 오답노트 1 + 모의고사 풀이 1 + 모의고사 피드백 1 = 11점
export function presetPortfolio() {
  return {
    stamp: { ...defaultScoring().stamp, mode: "ratio", max: 8 },
    items: [
      { id: "p_wrong", name: "오답노트", type: "check", on: 1, late: 0.5, poor: 0.5, off: 0 },
      { id: "p_mock", name: "모의고사 풀이", type: "check", on: 1, late: 0.5, poor: 0.5, off: 0 },
      { id: "p_feedback", name: "모의고사 피드백", type: "check", on: 1, late: 0.5, poor: 0.5, off: 0 },
    ],
  };
}
// 제출 항목 상태: 제출 · 늦게 제출 · 미흡(점수는 항목마다 정함) · 미제출
export const CHECK_STATES = [[true, "제출"], ["late", "늦게"], ["poor", "미흡"]];
export const checkLabel = value => (value === "late" ? "늦게 제출" : value === "poor" ? "미흡" : value ? "제출" : "미제출");
export const ITEM_TEMPLATES = {
  check: { name: "제출 항목", type: "check", on: 1, late: 0.5, poor: 0.5, off: 0 },
  wrong: { name: "중간고사 오답노트", type: "check", on: 5, late: 2.5, poor: 2.5, off: 0 },
  mock: { name: "홈페이지 모의고사 풀이 업로드", type: "level", levels: [{ label: "3회 이상", score: 5 }, { label: "2회", score: 4 }, { label: "1회", score: 3 }, { label: "0회", score: 0 }] },
  feedback: { name: "피드백", type: "level", levels: [{ label: "상", score: 5 }, { label: "중", score: 4 }, { label: "하", score: 3 }] },
  custom: { name: "직접 입력 항목", type: "number", max: 10 },
};

export function emptyBook(meta = {}) {
  return { version: 1, hours: 64, threshold: 40, scoring: defaultScoring(), sessions: {}, marks: {}, items: {}, csb: {}, logs: [], ...meta };
}
export function normalizeBook(book, meta = {}) {
  const base = emptyBook(meta);
  const b = { ...base, ...(book || {}) };
  b.scoring = { ...defaultScoring(), ...(b.scoring || {}) };
  b.scoring.stamp = { ...defaultScoring().stamp, ...(b.scoring.stamp || {}) };
  b.scoring.items = Array.isArray(b.scoring.items) ? b.scoring.items : [];
  ["sessions", "marks", "items", "csb"].forEach(key => { if (!b[key] || typeof b[key] !== "object") b[key] = {}; });
  if (!Array.isArray(b.logs)) b.logs = [];
  return b;
}

// targets: "1,2" (학급 번호) · "A,C" (이동수업 분반) · "" / "전체"(모두)
export function parseTargets(targets) {
  return String(targets || "").split(",").map(value => value.trim()).filter(value => value && value !== "전체");
}
const subjectKey = value => String(value || "").normalize("NFC").replace(/\s+/g, "");
const bySeat = (a, b) => (Number(a.class) || 0) - (Number(b.class) || 0) || (Number(a.number) || 0) - (Number(b.number) || 0) || String(a.sid).localeCompare(String(b.sid));

// 담당 과목 하나 → 도장부 목록(반·분반마다 하나). 학생은 명단·출석부에서.
// assignment: { kind: "common"|"elective", subject, targets }
export function booksForAssignment(assignment, { roster = {}, enrollments = {}, grade = "", semester = "" } = {}) {
  const subject = String(assignment?.subject || "").trim();
  if (!subject) return [];
  const targets = parseTargets(assignment.targets);
  const make = (target, label, students) => ({ id: bookId(grade, semester, subject, target), subject, kind: assignment.kind || "elective", target, label, students: students.sort(bySeat) });
  if (assignment.kind === "common") {
    const classes = targets.length ? targets.map(t => String(Number(t) || t)) : Array.from(new Set(Object.values(roster).map(info => String(info?.class || "")).filter(Boolean))).sort((a, b) => Number(a) - Number(b));
    return classes.map(no => make(no, `${no}반`, Object.entries(roster).filter(([, info]) => String(info?.class) === no).map(([sid, info]) => ({ sid, name: info?.name || "", class: info?.class, number: info?.number }))))
      .filter(book => book.students.length);
  }
  // 이동수업: 출석부(학생 → 수강 목록)에서 이 과목·분반을 듣는 학생
  const groups = {};
  Object.entries(enrollments || {}).forEach(([sid, list]) => (Array.isArray(list) ? list : []).forEach(course => {
    if (subjectKey(course?.subject) !== subjectKey(subject)) return;
    const group = String(course?.group || "").trim() || "-";
    if (targets.length && !targets.includes(group)) return;
    const info = roster?.[sid] || {};
    (groups[group] ||= { host: course?.hostClass, students: [] }).students.push({ sid, name: info.name || "", class: info.class ?? Number(String(sid).slice(1, 3)), number: info.number ?? Number(String(sid).slice(3, 5)) });
  }));
  return Object.keys(groups).sort().map(group => make(group, `${group}분반${groups[group].host ? ` · ${groups[group].host}반 개설` : ""}`, groups[group].students));
}
export function bookId(grade, semester, subject, target) {
  return `${grade}-${semester}-${subjectKey(subject)}-${String(target)}`;
}

// 도장 칸 값: 예전 "stamp"/"absent" 글자 또는 { m, at(찍은 시각), by(찍은 선생님) }
export const markOf = value => (value && typeof value === "object" ? value.m || "" : value || "");
export const markAt = value => (value && typeof value === "object" ? value.at || "" : "");
export const markBy = value => (value && typeof value === "object" ? value.by || "" : "");

// 교시 시간표(광덕고): 쉬는 시간에는 다음 교시로 봅니다.
export const PERIOD_TIMES = [["08:40", "09:30"], ["09:40", "10:30"], ["10:40", "11:30"], ["11:40", "12:30"], ["13:30", "14:20"], ["14:30", "15:20"], ["15:30", "16:20"]];
export function periodAt(date = new Date()) {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const toMin = hm => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
  for (let i = 0; i < PERIOD_TIMES.length; i += 1) if (minutes <= toMin(PERIOD_TIMES[i][1])) return i + 1;
  return "";
}
export const localIso = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// 수업(차시) 순서: 모두 차시 번호가 있으면 번호순, 아니면 날짜 → 교시 → 번호
export function sessionsAsc(book) {
  const list = Object.entries(book?.sessions || {}).map(([id, s]) => ({ id, ...s }));
  const allNumbered = list.length && list.every(s => Number(s.no) > 0);
  const dateKey = s => `${s.date || "9999-99-99"}${String(s.period || 0).padStart(2, "0")}`;
  return list.sort((a, b) => (allNumbered ? Number(a.no) - Number(b.no) : dateKey(a).localeCompare(dateKey(b)) || (Number(a.no) || 0) - (Number(b.no) || 0)) || a.id.localeCompare(b.id));
}
// 이미 한 수업인지: 날짜가 오늘 이전이거나, 날짜가 없어도 도장·결석이 하나라도 있으면
export function sessionHeld(book, session, today = localIso()) {
  if (session.date) return session.date <= today;
  return Object.keys(book?.marks?.[session.id] || {}).length > 0;
}
export function stampStats(book, sid, today = localIso()) {
  const sessions = sessionsAsc(book).filter(s => sessionHeld(book, s, today));
  let stamps = 0, absent = 0;
  sessions.forEach(s => { const mark = markOf(book.marks?.[s.id]?.[sid]); if (mark === "absent") absent += 1; else if (mark === "stamp") stamps += 1; });
  const held = sessions.length;
  const denom = book.scoring?.stamp?.excludeAbsent ? held - absent : held;
  return { held, stamps, absent, missed: held - stamps - absent, rate: denom > 0 ? (stamps / denom) * 100 : 0 };
}
export function stampScore(book, sid) {
  const cfg = book.scoring?.stamp;
  if (!cfg?.enabled) return null;
  const s = stampStats(book, sid);
  if (cfg.mode === "ratio") return Math.round((s.rate / 100) * (Number(cfg.max) || 0) * 10) / 10;
  const value = cfg.mode === "rate" ? s.rate : s.stamps;
  for (const band of [...(cfg.bands || [])].sort((a, b) => Number(b.min) - Number(a.min))) if (value >= Number(band.min)) return Number(band.score);
  return Number(cfg.floor) || 0;
}
export function stampMax(book) {
  const cfg = book.scoring?.stamp;
  if (!cfg?.enabled) return 0;
  if (cfg.mode === "ratio") return Number(cfg.max) || 0;
  return Math.max(Number(cfg.floor) || 0, ...(cfg.bands || []).map(band => Number(band.score) || 0));
}
export function itemMax(item) {
  if (item.type === "check") return Math.max(Number(item.on) || 0, Number(item.off) || 0);
  if (item.type === "level") return Math.max(0, ...(item.levels || []).map(level => Number(level.score) || 0));
  return Number(item.max) || 0;
}
export function itemScore(book, item, sid) {
  const value = book.items?.[item.id]?.[sid];
  if (value == null || value === "") return null;
  if (item.type === "check") {
    // 제출(true) · 늦게 제출("late") · 미흡("poor") · 미제출
    const on = Number(item.on) || 0;
    if (value === "late") return item.late == null || item.late === "" ? on : Number(item.late) || 0;
    if (value === "poor") return item.poor == null || item.poor === "" ? on : Number(item.poor) || 0;
    return value ? on : Number(item.off) || 0;
  }
  if (item.type === "level") return Number(item.levels?.[value]?.score ?? 0);
  return Math.min(Math.max(Number(value) || 0, 0), itemMax(item));
}
export function totalFor(book, sid) {
  let total = stampScore(book, sid) || 0;
  (book.scoring?.items || []).forEach(item => { total += itemScore(book, item, sid) || 0; });
  return Math.round(total * 10) / 10;
}
export function totalMax(book) {
  return stampMax(book) + (book.scoring?.items || []).reduce((sum, item) => sum + itemMax(item), 0);
}

// 최소성취수준 보장지도: 결석 허용 = 총 시수의 1/3, 학업성취율 기준(기본 40%).
// bad = 보충지도 대상, warn = 예방지도 권장, ok = 도달(지도 끝내 '이수 확인'이면 ok)
export function csbStatus(book, sid) {
  const s = stampStats(book, sid);
  const info = { rate: null, done: false, memo: "", ...(book.csb?.[sid] || {}) };
  const threshold = Number(book.threshold) || 40;
  const logs = (book.logs || []).filter(log => log.sid === sid);
  const allow = Math.floor((Number(book.hours) || 0) / 3);
  const left = allow - s.absent;
  const hasRate = info.rate != null && info.rate !== "";
  const reasons = [];
  let level = "ok";
  if (hasRate && Number(info.rate) < threshold) { level = "bad"; reasons.push(`학업성취율 ${info.rate}% (기준 ${threshold}%)`); }
  if (left < 0) { level = "bad"; reasons.push(`결석 ${s.absent}시간, 허용 ${allow}시간 초과`); }
  if (level !== "bad") {
    if (hasRate && Number(info.rate) < threshold + 10) { level = "warn"; reasons.push(`학업성취율 ${info.rate}%로 기준 근접`); }
    if (left <= 3) { level = "warn"; reasons.push(`결석 가능 ${Math.max(left, 0)}시간 남음`); }
    if (s.held >= 5 && s.rate < 50) { level = "warn"; reasons.push(`도장률 ${Math.round(s.rate)}%`); }
  }
  const label = info.done ? "이수 확인" : level === "bad" ? "보충지도 대상" : level === "warn" ? "예방지도 권장" : "도달";
  return { level: info.done ? "ok" : level, label, reasons, allow, left, stats: s, info, logs, guidedHours: logs.reduce((sum, log) => sum + (Number(log.hours) || 0), 0) };
}

// 도장 칸 누르기: 없음 → 도장 → 결석 → 없음
export function nextMark(current) {
  const state = markOf(current);
  return state === "stamp" ? "absent" : state === "absent" ? "" : "stamp";
}

// ── 바꾸기 묶음(op): 저장이 실패해도 기기에 남겨 두었다가 다시 보낼 수 있게 '무엇을 바꿀지'를 데이터로 적습니다.
// 같은 op를 두 번 적용해도 결과가 같습니다(다시 보내도 안전).
export function applyOp(book, op) {
  const b = book;
  switch (op?.t) {
    case "mark": {
      const marks = (b.marks[op.s] ||= {});
      if (!op.v) delete marks[op.sid];
      else marks[op.sid] = { m: op.v, at: op.at, by: op.by || "" };
      if (!Object.keys(marks).length) delete b.marks[op.s];
      return b;
    }
    case "markMany": {
      const marks = (b.marks[op.s] ||= {});
      (op.sids || []).forEach(sid => { if (!markOf(marks[sid])) marks[sid] = { m: op.v, at: op.at, by: op.by || "" }; });
      return b;
    }
    case "session": {
      if (!b.sessions[op.id] && op.create === false) return b;
      b.sessions[op.id] = { ...(b.sessions[op.id] || {}), ...(op.fields || {}) };
      return b;
    }
    case "delSession": delete b.sessions[op.id]; delete b.marks[op.id]; return b;
    case "plan": {
      // 1~count차시를 미리 만듭니다(이미 있는 번호는 그대로)
      // 차시 번호가 없는 예전 수업은 날짜순으로 빈 번호를 먼저 채웁니다.
      const have = new Set(Object.values(b.sessions).map(s => Number(s.no)).filter(Boolean));
      let fill = 1;
      sessionsAsc(b).forEach(s => { if (Number(s.no) > 0) return; while (have.has(fill)) fill += 1; b.sessions[s.id] = { ...b.sessions[s.id], no: fill }; have.add(fill); });
      for (let no = 1; no <= Number(op.count); no += 1) if (!have.has(no)) b.sessions[`n${no}`] = { no, date: "", period: "", unit: "", topic: "", pages: "", at: op.at, by: op.by || "" };
      return b;
    }
    case "meta": Object.assign(b, op.fields || {}); return b;
    case "scoring": b.scoring = op.value; return b;
    case "item": {
      (b.items[op.item] ||= {});
      if (op.v === "" || op.v == null) delete b.items[op.item][op.sid];
      else b.items[op.item][op.sid] = op.v;
      return b;
    }
    case "itemMany": { (b.items[op.item] ||= {}); (op.sids || []).forEach(sid => { b.items[op.item][sid] = op.v; }); return b; }
    case "dropItem": b.scoring.items = (b.scoring.items || []).filter(item => item.id !== op.item); delete b.items[op.item]; return b;
    case "csb": b.csb[op.sid] = { ...(b.csb[op.sid] || {}), ...(op.fields || {}) }; return b;
    case "logAdd": if (!b.logs.some(log => log.id === op.log.id)) b.logs.push(op.log); return b;
    case "logDel": b.logs = b.logs.filter(log => log.id !== op.id); return b;
    default: return b;
  }
}
// 다음 차시: 날짜 없는 미리 만든 차시가 있으면 그것, 없으면 새 번호
export function nextSessionFor(book) {
  const list = sessionsAsc(book);
  const planned = list.find(s => !s.date && !Object.keys(book.marks?.[s.id] || {}).length);
  if (planned) return { id: planned.id, no: Number(planned.no) || 0, existing: true };
  const maxNo = list.reduce((max, s, index) => Math.max(max, Number(s.no) || index + 1), 0);
  return { id: null, no: maxNo + 1, existing: false };
}
