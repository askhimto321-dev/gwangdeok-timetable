// NEIS '전과목 성적 일람표 (받은점수기준)' 반별 파일(예: 101.xlsx = 1학년 1반) → 학기 성적 학생 목록.
// 'N-N 성적' 시트(parseSemesterSheet)와 같은 모양으로 돌려줘서 그대로 합쳐 저장할 수 있습니다.
// 과목마다 [정기시험·수행 영역들…, 합계, 원점수, 성취도, 석차등급, 석차(동석차수), 수강자수] 칸이 이어집니다.
import { inferCategory, inferSubjectType, normalizeCategory } from "./gradeEngine.js";

const text = value => String(value ?? "").replace(/\s+/g, " ").trim();
const compact = value => String(value ?? "").replace(/\s+/g, "");
const num = value => {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const FIELDS = { 합계: "raw", 원점수: "score", 성취도: "achievement", 석차등급: "grade", "석차(동석차수)": "rank", 수강자수: "classSize" };

export function isNeisClassReport(rows = []) {
  return rows.slice(0, 8).some(row => (row || []).some(cell => /성적일람표/.test(compact(cell))));
}

// → { grade, classNo, semester, students: { sid: { name, grade, class, number, subjects: [...] } }, subjects: [이름] } | null
export function parseNeisClassReport(rows = []) {
  if (!isNeisClassReport(rows)) return null;
  let grade = null, classNo = null, semester = null;
  rows.slice(0, 8).forEach(row => (row || []).forEach(cell => {
    const t = compact(cell);
    const gc = t.match(/([1-3])학년0*(\d{1,2})반/);
    if (gc) { grade = Number(gc[1]); classNo = Number(gc[2]); }
    const sem = t.match(/제?([12])학기/);
    if (sem && semester == null) semester = Number(sem[1]);
  }));
  // 과목 머리줄: "  공통국어1(4)"처럼 '과목(학점)'이 여러 칸에 있는 줄
  const subjectRowIndex = rows.findIndex(row => (row || []).filter(cell => /^\s*\S.*\(\d+\)\s*$/.test(String(cell ?? "")) && !/%/.test(String(cell))).length >= 2);
  if (subjectRowIndex < 0 || grade == null || classNo == null) return null;
  const blocks = [];
  (rows[subjectRowIndex] || []).forEach((cell, col) => {
    const m = String(cell ?? "").match(/^\s*(.+?)\s*\((\d+)\)\s*$/);
    if (m && !/%/.test(m[0])) blocks.push({ col, subject: text(m[1]), credit: Number(m[2]) });
  });
  const headerRowIndex = rows.findIndex((row, index) => index > subjectRowIndex && (row || []).some(cell => compact(cell) === "원점수"));
  if (headerRowIndex < 0) return null;
  const header = rows[headerRowIndex].map(compact);
  blocks.forEach((block, i) => {
    const end = i + 1 < blocks.length ? blocks[i + 1].col : header.length;
    block.fields = {};
    for (let c = block.col; c < end; c++) if (FIELDS[header[c]]) block.fields[FIELDS[header[c]]] = c;
  });
  const students = {};
  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const number = num(row[0]);
    const name = text(row[1]);
    if (number == null || !name) continue;
    const sid = `${grade}${String(classNo).padStart(2, "0")}${String(number).padStart(2, "0")}`;
    const subjects = [];
    blocks.forEach(({ subject, credit, fields }) => {
      const raw = fields.raw != null ? num(row[fields.raw]) : null;
      const score = fields.score != null ? num(row[fields.score]) : null;
      if (raw == null && score == null) return;
      const gradeValue = fields.grade != null ? num(row[fields.grade]) : null;
      const rank = fields.rank != null ? row[fields.rank] : null;
      const classSize = fields.classSize != null ? row[fields.classSize] : null;
      subjects.push({
        subject,
        credit,
        category: normalizeCategory(inferCategory(subject), subject),
        subjectType: inferSubjectType(subject),
        raw,
        score,
        achievement: fields.achievement != null ? (text(row[fields.achievement]) || null) : null,
        grade: gradeValue,
        grade5: gradeValue,
        rank: rank === "" ? null : rank ?? null,
        classSize: classSize === "" ? null : classSize ?? null,
      });
    });
    students[sid] = { name, grade, class: classNo, number, subjects };
  }
  return { grade, classNo, semester, students, subjects: blocks.map(block => block.subject) };
}
