import test from "node:test";
import assert from "node:assert/strict";
import { plannedSimSubjects, guessCategory, isNonGradedSubject, officialPlannedName } from "../src/gradeSimPlan.js";

const past = [[
  { subject: "문학", category: "국어", credit: 4, grade: 2 },
  { subject: "대수", category: "수학", credit: 4, grade: 3 },
  { subject: "물리학", category: "과학", credit: 3, grade: 1 },
  { subject: "정치", category: "사회", credit: 3, grade: 2 },
]];

test("시간표 약칭을 편제표 이름으로 바꾸고 석차등급 없는 과목은 뺀다", () => {
  const planned = ["법과 사회", "도시의 미래 탐구", "문학 감상과 비평", "미적분 I", "미창22", "독작", "영어II", "일본어", "인문학과 윤리", "스문", "자율"].map(subject => ({ subject }));
  const rows = plannedSimSubjects(planned, past, 5, "2-2");
  const names = rows.map(row => row.subject);
  assert.ok(names.includes("독서와 작문"));
  assert.ok(!names.some(name => /미술|스포츠|자율|미창|스문/.test(name)));
  assert.equal(rows.find(row => row.subject === "독서와 작문").credit, 4);
  assert.equal(rows.find(row => row.subject === "인문학과 윤리").category, "사회");
  assert.equal(rows.find(row => row.subject === "도시의 미래 탐구").category, "사회");
  assert.equal(rows.find(row => row.subject === "독서와 작문").grade, "2");
});

test("약칭 변환과 교과 추정", () => {
  assert.equal(officialPlannedName("미창22", "2-2"), "미술 창작");
  assert.equal(officialPlannedName("스문", "2-2"), "스포츠 문화");
  assert.equal(guessCategory("", "영어 독해와 작문"), "영어");
  assert.equal(guessCategory("", "세계사"), "사회");
  assert.equal(guessCategory("", "물질과 에너지"), "과학");
  assert.ok(isNonGradedSubject("체육2"));
  assert.ok(isNonGradedSubject("인간과 심리"));
  assert.ok(!isNonGradedSubject("공중 보건"));
});

test("지난 성적이 없으면 등급은 비워 둔다", () => {
  const rows = plannedSimSubjects([{ subject: "기하" }], [], 5, "2-2");
  assert.equal(rows[0].grade, "");
  assert.equal(rows[0].credit, 3);
});
