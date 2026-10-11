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
