// 모의고사 원점수 파일 읽기 + 등급컷으로 등급 매기기 (순수 함수, node 테스트용)
// 지원 형식
//  A) 원점수 원본(교육청 성적 처리 파일): 학년·반·번호·이름 + 국어점수·수학점수·영어점수·한국사점수
//     + [선택과목, 탐구1점수] [선택과목, 탐구2점수] … + 총점·학급석차·석차
//  B) 예전 양식: 학번(또는 신학번) + 과목명(원점수 구간 · 등급 구간)
export const MOCK_SUBJECTS = ["국어", "수학", "영어", "한국사", "통합사회", "통합과학"];
// 회차(학년-월): 고1·2 3·6·9·10·11월, 고3 3·5·6·7·9·10월 — 순서는 시간순(최근 회차 찾기에 씀)
export const MOCK_MONTH_KEYS = ["1-3", "1-6", "1-9", "1-10", "1-11", "2-3", "2-6", "2-9", "2-10", "2-11", "3-3", "3-5", "3-6", "3-7", "3-9", "3-10"];
export const MOCK_MONTH_LABELS = Object.fromEntries(MOCK_MONTH_KEYS.map(key => { const [g, m] = key.split("-"); return [key, `${g}학년 ${m}월`]; }));

// 절대평가 과목 기본 등급컷(1~8등급 최저 점수)
export const ABSOLUTE_CUTS = { 영어: [90, 80, 70, 60, 50, 40, 30, 20], 한국사: [40, 35, 30, 25, 20, 15, 10, 5] };
// 상대평가 9등급 누적 비율(%)
const STANINE = [4, 11, 23, 40, 60, 77, 89, 96];

const clean = value => String(value ?? "").replace(/\s+/g, "").trim();
const numberOf = value => { if (value === null || value === undefined || value === "") return null; const n = Number(String(value).trim()); return Number.isFinite(n) ? n : null; };
// 탐구 선택과목 이름 → KDTIME 과목
function inquirySubject(name) {
  const n = clean(name);
  if (!n) return "";
  if (/^사회탐구$|^통합사회$|^사회$/.test(n)) return "통합사회";
  if (/^과학탐구$|^통합과학$|^과학$/.test(n)) return "통합과학";
  return n;
}

export function detectMockFormat(rows) {
  for (let r = 0; r < Math.min(rows.length, 6); r += 1) {
    const header = (rows[r] || []).map(clean);
    if (header.includes("반") && header.includes("번호") && header.some(h => /^국어(점수|원점수)?$/.test(h))) return { format: "raw", headerRow: r };
    if (header.some(h => /^(신)?학번$/.test(h))) return { format: "legacy", headerRow: r };
  }
  return { format: "", headerRow: 0 };
}

// A) 원점수 원본 → { students: { 학번: { _scores, _total, _rank } }, count, subjects, maxScores }
export function parseRawMock(rows, { grade = "" } = {}) {
  const { headerRow } = detectMockFormat(rows);
  const header = (rows[headerRow] || []).map(clean);
  const col = re => header.findIndex(h => re.test(h));
  const gradeCol = col(/^학년$/), classCol = col(/^반$/), numCol = col(/^번호$/);
  const totalCol = col(/^(총점|합계)$/), rankCol = col(/^석차/);
  const direct = [];
  header.forEach((h, i) => {
    const m = /^(국어|수학|영어|한국사|통합사회|통합과학)(점수|원점수)?$/.exec(h);
    if (m) direct.push([m[1], i]);
  });
  // 탐구: "탐구1점수" 등 점수 칸 바로 앞의 "선택과목" 칸이 과목 이름
  const inquiry = [];
  header.forEach((h, i) => { if (/^탐구\d점수$/.test(h)) inquiry.push({ scoreCol: i, nameCol: header[i - 1] === "선택과목" ? i - 1 : -1 }); });
  const students = {};
  const subjects = new Set();
  const maxScores = {};
  for (let r = headerRow + 1; r < rows.length; r += 1) {
    const row = rows[r] || [];
    const ban = numberOf(row[classCol]), num = numberOf(row[numCol]);
    const g = numberOf(row[gradeCol]) ?? numberOf(grade);
    if (!ban || !num || !g) continue;
    const sid = `${g}${String(ban).padStart(2, "0")}${String(num).padStart(2, "0")}`;
    const scores = {};
    direct.forEach(([subject, i]) => { const v = numberOf(row[i]); if (v != null) scores[subject] = v; });
    inquiry.forEach(({ scoreCol, nameCol }, k) => {
      const v = numberOf(row[scoreCol]);
      if (v == null) return;
      const subject = inquirySubject(nameCol >= 0 ? row[nameCol] : "") || (k === 0 ? "통합사회" : "통합과학");
      scores[subject] = v;
    });
    if (!Object.keys(scores).length) continue; // 결시
    Object.entries(scores).forEach(([subject, v]) => { subjects.add(subject); maxScores[subject] = Math.max(maxScores[subject] || 0, v); });
    const total = numberOf(row[totalCol]);
    const rank = numberOf(row[rankCol]);
    students[sid] = { _scores: scores, _total: total ?? Object.values(scores).reduce((a, b) => a + b, 0), ...(rank != null ? { _rank: rank } : {}) };
  }
  return { students, count: Object.keys(students).length, subjects: MOCK_SUBJECTS.filter(s => subjects.has(s)).concat([...subjects].filter(s => !MOCK_SUBJECTS.includes(s))), maxScores };
}

// 학교 안 점수 분포로 9등급 컷 추정(동점은 위 등급으로)
export function estimateCuts(students, subject) {
  const list = Object.values(students || {}).map(st => st?._scores?.[subject]).filter(v => Number.isFinite(v)).sort((a, b) => b - a);
  if (!list.length) return null;
  return STANINE.map(p => { const idx = Math.min(list.length - 1, Math.max(0, Math.ceil(list.length * p / 100) - 1)); return list[idx]; });
}
// 기본 컷: 영어·한국사 = 절대평가, 나머지 = 학교 분포 추정
export function defaultCuts(students, subjects) {
  const cuts = {}, kinds = {};
  subjects.filter(s => MOCK_SUBJECTS.includes(s)).forEach(subject => {
    if (ABSOLUTE_CUTS[subject]) { cuts[subject] = ABSOLUTE_CUTS[subject].slice(); kinds[subject] = "absolute"; return; }
    const est = estimateCuts(students, subject);
    if (est) { cuts[subject] = est; kinds[subject] = "estimated"; }
  });
  return { cuts, kinds };
}
export function gradeFor(score, cuts) {
  if (!Number.isFinite(score) || !Array.isArray(cuts)) return null;
  for (let i = 0; i < 8; i += 1) { const c = Number(cuts[i]); if (Number.isFinite(c) && score >= c) return i + 1; }
  return 9;
}
// 원점수 + 등급컷 → 학생마다 과목 등급(기존 화면이 읽는 형식: students[학번][과목] = 등급)
export function applyCuts(students, cuts) {
  const out = {};
  Object.entries(students || {}).forEach(([sid, st]) => {
    const next = { ...st };
    MOCK_SUBJECTS.forEach(subject => { delete next[subject]; });
    Object.entries(st?._scores || {}).forEach(([subject, score]) => {
      if (!MOCK_SUBJECTS.includes(subject) || !cuts?.[subject]) return;
      const g = gradeFor(score, cuts[subject]);
      if (g) next[subject] = g;
    });
    out[sid] = next;
  });
  return out;
}
// 과목별 등급 인원
export function gradeCounts(students, cuts, subject) {
  const counts = Array(9).fill(0);
  Object.values(students || {}).forEach(st => { const g = gradeFor(st?._scores?.[subject], cuts?.[subject]); if (g) counts[g - 1] += 1; });
  return counts;
}
