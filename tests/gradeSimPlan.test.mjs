import test from "node:test";
import assert from "node:assert/strict";
import { plannedSimSubjects } from "../src/gradeSimPlan.js";

const past = [[
  { subject: "공통국어1", category: "국어", credit: 4, grade: 2 },
  { subject: "공통수학1", category: "수학", credit: 4, grade: 3 },
  { subject: "통합과학1", category: "과학", credit: 3, grade: 1 },
  { subject: "정보", category: "정보", credit: 2, grade: 2 },
]];

test("시간표 과목을 학점·예상 등급과 함께 채운다", () => {
  const rows = plannedSimSubjects([
    { subject: "공통국어2", category: "", weeklyHours: 4 },
    { subject: "대수", category: "", weeklyHours: null },
    { subject: "물리학", category: "", weeklyHours: 3 },
    { subject: "대수", category: "" },
  ], past, 5);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].credit, 4);
  assert.equal(rows[0].grade, "2");
  assert.equal(rows[1].credit, 4);
  assert.equal(rows[1].grade, "3");
  assert.equal(rows[2].grade, "1");
});

test("지난 성적이 없으면 등급은 비워 둔다", () => {
  const rows = plannedSimSubjects([{ subject: "공통영어1" }], [], 5);
  assert.equal(rows[0].grade, "");
  assert.equal(rows[0].credit, 4);
});

test("과목명으로 교과를 추정한다", async () => {
  const { guessCategory } = await import("../src/gradeSimPlan.js");
  assert.equal(guessCategory("", "세계사"), "사회");
  assert.equal(guessCategory("", "물리학"), "과학");
  assert.equal(guessCategory("", "체육"), "기타");
});
