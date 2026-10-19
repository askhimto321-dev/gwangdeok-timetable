import { rankAndGrade } from "./gradeQuota.js";
// 반 비교 '정기시험' 보기: 선생님 ZONE 성적 산출에 저장된(학교 공동본) 지필 시험 점수로
// 과목 × 반 평균을 만듭니다. 학기 성적이 아직 없어도 1차 정기시험 하나만 저장하면 바로 보입니다.

const examTitleKey = title => {
  const text = String(title || "").replace(/\s+/g, "");
  const order = text.match(/([1-9])차/);
  if (order) return `${order[1]}차`;
  if (/중간/.test(text)) return "1차";
  if (/기말/.test(text)) return "2차";
  return text || "시험";
};

export function examLabel(exam) {
  const title = /^[1-9]차$/.test(exam.title) ? `${exam.title} 정기시험` : exam.title;
  return `${exam.semester}학기 ${title}`;
}

const finite = value => {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

// workspaces: db.teacherGradeWorkspaces, grade: "2", roster: { sid: { class } }
export function buildClassExamCompare(workspaces = {}, grade = "", roster = {}) {
  const exams = new Map();
  Object.values(workspaces || {}).forEach(ws => {
    if (!ws || String(ws.grade || "") !== String(grade)) return;
    const subject = String(ws.subject || "").trim();
    if (!subject) return;
    (Array.isArray(ws.written) ? ws.written : []).forEach(item => {
      const title = examTitleKey(item?.title);
      const key = `${ws.year || ""}-${ws.semester || ""}-${title}`;
      if (!exams.has(key)) exams.set(key, { key, year: ws.year, semester: ws.semester, title, subjects: new Map() });
      const exam = exams.get(key);
      const classes = {};
      const all = [];
      Object.entries(item?.students || {}).forEach(([sid, student]) => {
        const score = finite(student?.score);
        if (score == null) return;
        const no = String(roster?.[sid]?.class || student?.classNumber || "").trim();
        if (!no) return;
        (classes[no] = classes[no] || []).push(score);
        all.push(score);
      });
      if (!all.length) return;
      const mean = list => list.reduce((sum, value) => sum + value, 0) / list.length;
      exam.subjects.set(subject, {
        subject,
        maxScore: finite(item?.maxScore) || 100,
        n: all.length,
        mean: mean(all),
        pending: !!item?.essayPending,
        classes: Object.fromEntries(Object.entries(classes).map(([no, list]) => [no, { n: list.length, mean: mean(list) }])),
      });
    });
  });
  return Array.from(exams.values())
    .map(exam => ({ ...exam, label: examLabel(exam), subjects: Array.from(exam.subjects.values()).sort((a, b) => a.subject.localeCompare(b.subject, "ko")) }))
    .filter(exam => exam.subjects.length)
    // 최근 시험 먼저: 연도 → 학기 → 차수
    .sort((a, b) => String(b.year).localeCompare(String(a.year)) || String(b.semester).localeCompare(String(a.semester)) || b.title.localeCompare(a.title, "ko"));
}

// 반 성적 '과목별 보기'용: 시험 × 과목마다 학생별 원점수를 그대로 돌려줍니다.
// → [{ id, key, year, semester, title, label, subject, maxScore, pending, scores: { sid: 점수 } }]
export function examSubjectScores(workspaces = {}, grade = "", year = null) {
  const out = [];
  Object.values(workspaces || {}).forEach(ws => {
    if (!ws || String(ws.grade || "") !== String(grade)) return;
    if (year != null && ws.year && Number(ws.year) !== Number(year)) return;
    const subject = String(ws.subject || "").trim();
    if (!subject) return;
    (Array.isArray(ws.written) ? ws.written : []).forEach(item => {
      const scores = {};
      Object.entries(item?.students || {}).forEach(([sid, student]) => { const score = finite(student?.score); if (score != null) scores[sid] = score; });
      if (!Object.keys(scores).length) return;
      const title = examTitleKey(item?.title);
      const key = `${ws.year || ""}-${ws.semester || ""}-${title}`;
      out.push({ id: `${key}|${subject}`, key, year: ws.year, semester: ws.semester, title, label: examLabel({ semester: ws.semester, title }), subject, maxScore: finite(item?.maxScore) || 100, pending: !!item?.essayPending, scores });
    });
  });
  return out.sort((a, b) => String(a.semester).localeCompare(String(b.semester)) || a.title.localeCompare(b.title, "ko") || a.subject.localeCompare(b.subject, "ko"));
}

// 한 과목 시험 원점수 { sid: 점수 } → { sid: 등급 }. 학년 전체 석차로 5등급(누적 10·34·66·90%, 동점은 같은 등급).
export function examGrades(scores = {}, system = 5) {
  const list = Object.entries(scores || {}).filter(([, score]) => Number.isFinite(Number(score))).map(([sid, score]) => ({ sid, score: Number(score) }));
  rankAndGrade(list, { vectorOf: row => [row.score], isEligible: () => true, system });
  return Object.fromEntries(list.map(row => [row.sid, row.grade]));
}
