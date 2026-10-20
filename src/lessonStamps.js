// 선생님 ZONE '수업 도장' 계산(수학 도장노트 앱의 규칙을 그대로 옮김) — 순수 함수, node 테스트용.
// 한 '도장부(book)' = 한 선생님 담당 과목의 한 반(학급 고정 수업) 또는 한 이동수업 분반.
// 학생 명단은 KDTIME 학생 명단(roster)·이동수업 출석부(enrollments)에서 바로 만듭니다.

export const MATH_UNITS = {
  "공통수학2": [["Ⅰ. 도형의 방정식", ["평면좌표", "직선의 방정식", "원의 방정식", "도형의 이동"]], ["Ⅱ. 집합과 명제", ["집합", "명제"]], ["Ⅲ. 함수와 그래프", ["함수", "유리함수와 무리함수"]]],
  "미적분Ⅰ": [["Ⅰ. 함수의 극한과 연속", ["함수의 극한", "함수의 연속"]], ["Ⅱ. 미분", ["미분계수와 도함수", "도함수의 활용"]], ["Ⅲ. 적분", ["부정적분과 정적분", "정적분의 활용"]]],
  "기하": [["Ⅰ. 이차곡선", ["포물선", "타원", "쌍곡선", "이차곡선과 직선"]], ["Ⅱ. 공간도형과 공간좌표", ["직선과 평면의 위치 관계", "삼수선의 정리와 정사영", "공간좌표"]], ["Ⅲ. 벡터", ["벡터의 연산", "벡터의 성분과 내적", "벡터를 이용한 도형의 방정식"]]],
};

export function defaultScoring() {
  return { stamp: { enabled: true, mode: "rate", excludeAbsent: true, floor: 5, bands: [{ min: 90, score: 10 }, { min: 80, score: 9 }, { min: 70, score: 8 }, { min: 60, score: 7 }, { min: 50, score: 6 }] }, items: [] };
}
export const ITEM_TEMPLATES = {
  wrong: { name: "중간고사 오답노트", type: "check", on: 5, off: 0 },
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

// 수업 순서(날짜 → 교시)
export function sessionsAsc(book) {
  return Object.entries(book?.sessions || {}).map(([id, s]) => ({ id, ...s })).sort((a, b) => `${a.date}${String(a.period || 0).padStart(2, "0")}`.localeCompare(`${b.date}${String(b.period || 0).padStart(2, "0")}`) || a.id.localeCompare(b.id));
}
export function stampStats(book, sid) {
  const sessions = sessionsAsc(book);
  let stamps = 0, absent = 0;
  sessions.forEach(s => { const mark = book.marks?.[s.id]?.[sid]; if (mark === "absent") absent += 1; else if (mark === "stamp") stamps += 1; });
  const held = sessions.length;
  const denom = book.scoring?.stamp?.excludeAbsent ? held - absent : held;
  return { held, stamps, absent, missed: held - stamps - absent, rate: denom > 0 ? (stamps / denom) * 100 : 0 };
}
export function stampScore(book, sid) {
  const cfg = book.scoring?.stamp;
  if (!cfg?.enabled) return null;
  const s = stampStats(book, sid);
  const value = cfg.mode === "rate" ? s.rate : s.stamps;
  for (const band of [...(cfg.bands || [])].sort((a, b) => Number(b.min) - Number(a.min))) if (value >= Number(band.min)) return Number(band.score);
  return Number(cfg.floor) || 0;
}
export function stampMax(book) {
  const cfg = book.scoring?.stamp;
  if (!cfg?.enabled) return 0;
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
  if (item.type === "check") return value ? Number(item.on) || 0 : Number(item.off) || 0;
  if (item.type === "level") return Number(item.levels?.[value]?.score ?? 0);
  return Math.min(Math.max(Number(value) || 0, 0), itemMax(item));
}
export function totalFor(book, sid) {
  let total = stampScore(book, sid) || 0;
  (book.scoring?.items || []).forEach(item => { total += itemScore(book, item, sid) || 0; });
  return total;
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
  return current === "stamp" ? "absent" : current === "absent" ? "" : "stamp";
}
