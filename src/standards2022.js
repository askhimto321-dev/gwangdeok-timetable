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
