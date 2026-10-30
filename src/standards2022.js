import { officialSubjectName } from "./curriculum.js";

// 2022 개정 교육과정 고등학교 성취기준: 자료(약 460KB)는 처음 쓸 때만 따로 불러옵니다.
// 자료 모양: { v, source, subjects: [{ n: 과목명, d: [[영역, [[코드, 성취기준 문장], ...]], ...] }] }

let cache = null;
export function loadStandards() {
  if (!cache) cache = import("./data/standards2022High.json").then(mod => mod.default || mod).catch(error => { cache = null; throw error; });
  return cache;
}

const ROMAN = { "Ⅰ": "1", "Ⅱ": "2", "Ⅲ": "3", "Ⅳ": "4" };
export const standardToken = value => String(value || "").normalize("NFC").replace(/[ⅠⅡⅢⅣ]/g, ch => ROMAN[ch]).replace(/[\s·⋅ㆍ:,./\\\-_()[\]]/g, "").toLowerCase();

// 선생님이 정한 과목 이름으로 성취기준 과목 찾기: 같은 이름 → 앞부분이 같은 이름(예: '물리학 (분반)') 순서
export function matchStandardSubject(name, subjects = []) {
  const key = standardToken(name);
  if (!key) return null;
  const exact = subjects.find(item => standardToken(item.n) === key);
  if (exact) return exact;
  const prefix = subjects.filter(item => key.startsWith(standardToken(item.n))).sort((a, b) => b.n.length - a.n.length)[0];
  return prefix || null;
}

// 학교 과목명(시간표 약칭 포함, 예: '미적')을 성취기준 과목으로: 그대로 → 우리 학교 편제표 정식 이름(그 학년 이 학기 → 다른 학기 → 다른 학년) 순서
export function resolveStandardSubject(label, grade, semester, subjects = []) {
  const direct = matchStandardSubject(label, subjects);
  if (direct) return { subject: direct, via: "" };
  const other = String(semester) === "sem2" || String(semester) === "2" ? "sem1" : "sem2";
  const tries = [[grade, semester], [grade, other], ...[1, 2, 3].filter(g => String(g) !== String(grade)).flatMap(g => [[g, "sem1"], [g, "sem2"]])];
  for (const [g, sem] of tries) {
    const official = officialSubjectName(label, g, sem);
    if (official && official !== String(label || "").trim()) {
      const found = matchStandardSubject(official, subjects);
      if (found) return { subject: found, via: official };
    }
  }
  return { subject: null, via: "" };
}

// 코드로 성취기준 찾기(과목을 알면 그 과목 안에서 먼저)
export function findStandards(codes = [], subjects = [], subjectName = "") {
  const want = new Set(codes);
  const out = [];
  const scan = list => list.forEach(subject => subject.d.forEach(([domain, items]) => items.forEach(([code, text]) => {
    if (want.has(code) && !out.some(item => item.code === code)) out.push({ code, text, domain, subject: subject.n });
  })));
  const own = subjects.find(item => item.n === subjectName);
  if (own) scan([own]);
  if (out.length < want.size) scan(subjects);
  return codes.map(code => out.find(item => item.code === code)).filter(Boolean);
}

export const standardLine = item => `${item.code} ${item.text}`;
