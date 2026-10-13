import test from "node:test";
import assert from "node:assert/strict";
import { parseNeisClassReport } from "../src/neisClassReport.js";

const rows = [
  [null, null, null, null, null, "2026학년도 제1학기"],
  [null, null, null, null, null, null, "전과목 성적 일람표 (받은점수기준)"],
  ["1학년  01반"],
  ["평가방법(반영비율)", null, "  공통국어1(4)", null, null, null, null, null, null, null, "  음악(2)", null, null, null, null, null, null, null],
  [null, null, "정기시험(50.00%)", null, "", "", "", "", "", "", "수행평가(100.00%)", "", "", "", "", "", "", ""],
  ["번호,성명", null, "1차(50%)", "합계", "원점수", "성취도", "석차등급", "석차(동석차수)", "수강자수", "", "영역(100%)", "합계", "원점수", "성취도", "석차등급", "석차(동석차수)", "수강자수", ""],
  [1, "가나다", 50, 54.95, 55, "D", 4, 228, 255, null, 30, 73, 73, "B", "", "", 255, null],
  [2, "라마바", 80, 94.08, 94, "A", 1, "20(2)", 255, null, 35, 100, 100, "A", "", "", 255, null],
  [null, null],
];

test("NEIS 반별 전과목 일람표 → 학기 성적", () => {
  const out = parseNeisClassReport(rows);
  assert.equal(out.grade, 1); assert.equal(out.classNo, 1); assert.equal(out.semester, 1);
  assert.deepEqual(Object.keys(out.students), ["10101", "10102"]);
  const [korean, music] = out.students["10102"].subjects;
  assert.equal(korean.subject, "공통국어1"); assert.equal(korean.credit, 4);
  assert.equal(korean.raw, 94.08); assert.equal(korean.score, 94); assert.equal(korean.grade, 1); assert.equal(korean.rank, "20(2)");
  assert.equal(music.subject, "음악"); assert.equal(music.grade, null); assert.equal(music.achievement, "A");
});

test("일람표가 아니면 null", () => {
  assert.equal(parseNeisClassReport([["학번", "이름"], [10101, "가"]]), null);
});
