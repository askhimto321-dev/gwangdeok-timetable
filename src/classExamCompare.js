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
