import test from "node:test";
import assert from "node:assert/strict";
import { detectMockFormat, parseRawMock, defaultCuts, applyCuts, gradeFor, gradeCounts, estimateCuts, MOCK_MONTH_KEYS } from "../src/mockImport.js";

const header = ["학년", "반", "번호", "이름", "국어점수", "수학점수", "영어점수", "한국사점수", "탐구영역", "선택과목", "탐구1점수", "선택과목", "탐구2점수", "선택과목", "제2외국어점수", "총점", "학급석차", "석차 (218)"];
const row = (ban, num, k, m, e, h, s1, s2, total) => [2, ban, num, "학생", k, m, e, h, "탐구", "사회탐구", s1, "과학탐구", s2, "", "", total, 1, 1];

test("원점수 원본 형식: 반·번호로 학번, 탐구는 선택과목 이름으로", () => {
  const rows = [header, row(1, 1, 13, 25, 21, 6, 5, 13.5, 77.5), row("01", "02", 62, 29, 66, 31, 38.5, 26.5, 222), [2, "03", "05", "결시", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]];
  assert.equal(detectMockFormat(rows).format, "raw");
  const out = parseRawMock(rows);
  assert.equal(out.count, 2);
  assert.deepEqual(out.absent, ["20305"]);
  assert.deepEqual(Object.keys(out.students), ["20101", "20102"]);
  assert.deepEqual(out.students["20102"]._scores, { 국어: 62, 수학: 29, 영어: 66, 한국사: 31, 통합사회: 38.5, 통합과학: 26.5 });
  assert.equal(out.students["20102"]._total, 222);
  assert.deepEqual(out.subjects, ["국어", "수학", "영어", "한국사", "통합사회", "통합과학"]);
  assert.equal(detectMockFormat([["학번", "국어"]]).format, "legacy");
});

test("등급컷: 영어·한국사 절대평가, 나머지 학교 분포 추정 → 등급 매기기·컷 수정 반영", () => {
  const students = {};
  for (let i = 0; i < 100; i += 1) students[`2${String(i).padStart(4, "0")}`] = { _scores: { 국어: 100 - i, 영어: 100 - i, 한국사: 50 - (i % 50) } };
  const { cuts, kinds } = defaultCuts(students, ["국어", "영어", "한국사"]);
  assert.equal(kinds.영어, "absolute"); assert.equal(kinds.국어, "estimated");
  assert.deepEqual(cuts.국어, [97, 90, 78, 61, 41, 24, 12, 5]);
  assert.deepEqual(gradeCounts(students, cuts, "국어"), [4, 7, 12, 17, 20, 17, 12, 7, 4]);
  assert.equal(gradeFor(89, cuts.영어), 2);
  assert.equal(gradeFor(19, cuts.영어), 9);
  const graded = applyCuts(students, cuts);
  assert.equal(graded["20000"].국어, 1);
  assert.equal(graded["20000"].영어, 1);
  // 공식 등급컷으로 고치면 다시 계산
  const official = { ...cuts, 국어: [95, 88, 80, 70, 60, 50, 40, 30] };
  assert.equal(applyCuts(students, official)["20004"].국어, 1);
  assert.equal(applyCuts(students, official)["20006"].국어, 2);
  assert.equal(estimateCuts({}, "국어"), null);
});

test("회차: 2학년 10월 포함, 시간순", () => {
  assert.ok(MOCK_MONTH_KEYS.includes("2-10"));
  assert.ok(MOCK_MONTH_KEYS.indexOf("2-9") < MOCK_MONTH_KEYS.indexOf("2-10"));
});

test("bandCounts groups nine grades into four bands", async () => {
  const { bandCounts } = await import("../src/mockImport.js");
  assert.deepEqual(bandCounts([1, 2, 3, 4, 5, 6, 7, 8, 9]), [3, 7, 11, 24]);
  assert.deepEqual(bandCounts([]), [0, 0, 0, 0]);
});

test("latestMockUpload finds the newest recent round with students", async () => {
  const { latestMockUpload } = await import("../src/mockImport.js");
  const now = Date.parse("2026-10-21T00:00:00Z");
  const data = {
    "2025:2-9": { entryYear: 2025, updatedAt: "2026-10-18T00:00:00Z", students: { "20101": {} } },
    "2025:2-10": { entryYear: 2025, updatedAt: "2026-10-20T00:00:00Z", students: { "20101": {}, "20102": {} } },
    "2024:3-10": { entryYear: 2024, updatedAt: "2026-10-01T00:00:00Z", students: { "30101": {} } },
    "2025:2-6": { entryYear: 2025, updatedAt: "2026-10-20T12:00:00Z", students: {} },
  };
  const latest = latestMockUpload(data, now);
  assert.equal(latest.key, "2-10");
  assert.equal(latest.count, 2);
  assert.equal(latest.label, "2학년 10월");
  assert.equal(latestMockUpload({ "2024:3-10": data["2024:3-10"] }, now), null);
});
