import test from "node:test";
import assert from "node:assert/strict";
import { buildClassExamCompare } from "../src/classExamCompare.js";

const st = (classNumber, score) => ({ classNumber, score });
const ws = (subject, written, extra = {}) => ({ year: 2026, semester: 2, grade: 2, subject, written, ...extra });

test("1차 정기시험만 저장해도 과목 × 반 평균이 나옴", () => {
  const workspaces = {
    a: ws("국어", [{ title: "1차 정기시험", maxScore: 100, students: { "20101": st(1, 80), "20102": st(1, 60), "20201": st(2, 90) } }]),
    b: ws("수학", [{ title: "1차", maxScore: 100, students: { "20101": st(1, 50), "20201": st(2, 70), "20202": st(2, null) } }]),
  };
  const [exam] = buildClassExamCompare(workspaces, "2", {});
  assert.equal(exam.label, "2학기 1차 정기시험");
  assert.deepEqual(exam.subjects.map(item => item.subject), ["국어", "수학"]);
  const korean = exam.subjects[0];
  assert.equal(korean.classes["1"].mean, 70);
  assert.equal(korean.classes["2"].mean, 90);
  assert.equal(exam.subjects[1].classes["2"].n, 1);
});

test("다른 학년·빈 시험은 빼고, 최근 시험이 먼저", () => {
  const workspaces = {
    a: ws("국어", [{ title: "1차", students: { "20101": st(1, 80) } }, { title: "2차 정기시험", students: { "20101": st(1, 70) } }]),
    b: ws("국어", [{ title: "1차", students: { "30101": st(1, 80) } }], { grade: 3 }),
    c: ws("영어", [{ title: "1차", students: {} }]),
  };
  const exams = buildClassExamCompare(workspaces, "2", {});
  assert.deepEqual(exams.map(exam => exam.title), ["2차", "1차"]);
  assert.equal(exams[1].subjects.length, 1);
});

test("반은 명단(roster) 기준이 우선", () => {
  const workspaces = { a: ws("국어", [{ title: "1차", students: { "20101": st(9, 80) } }]) };
  const [exam] = buildClassExamCompare(workspaces, "2", { "20101": { class: 3 } });
  assert.ok(exam.subjects[0].classes["3"]);
});

test("examSubjectScores: 과목·시험마다 학생 원점수, 다른 학년도·학년 제외", async () => {
  const { examSubjectScores } = await import("../src/classExamCompare.js");
  const ws = {
    a: { grade: 2, year: 2026, semester: 2, subject: "기하", written: [{ title: "중간고사", maxScore: 100, students: { "20101": { score: 80 }, "20102": { score: null, status: "결시" } } }] },
    b: { grade: 2, year: 2025, semester: 2, subject: "기하", written: [{ title: "1차 정기시험", students: { "20101": { score: 50 } } }] },
    c: { grade: 1, year: 2026, semester: 2, subject: "공통수학2", written: [{ title: "1차", students: { "10101": { score: 70 } } }] },
  };
  const list = examSubjectScores(ws, "2", 2026);
  assert.equal(list.length, 1);
  assert.equal(list[0].title, "1차");
  assert.equal(list[0].label, "2학기 1차 정기시험");
  assert.deepEqual(list[0].scores, { "20101": 80 });
});

test("examGrades: 학년 석차로 5등급, 동점 같은 등급", async () => {
  const { examGrades } = await import("../src/classExamCompare.js");
  const scores = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`2010${String(i).padStart(2, "0")}`, 100 - i]));
  const g = examGrades(scores);
  assert.equal(g["201000"], 1); assert.equal(g["201001"], 1); assert.equal(g["201002"], 2);
  assert.equal(g["201019"], 5);
  const tie = examGrades({ a: 90, b: 90, c: 10 });
  assert.equal(tie.a, tie.b);
  assert.ok(tie.c > tie.a);
});
