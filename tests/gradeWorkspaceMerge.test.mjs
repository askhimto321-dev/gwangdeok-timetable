import test from "node:test";
import assert from "node:assert/strict";
import { mergeWorkspacePayload, activeEditors, samePayload } from "../src/gradeWorkspaceMerge.js";

const perf = (cls, at, score = 1) => ({ id: `performance:2026:2:2:대수:${cls}`, classes: cls.split(",").map(Number), uploadedAt: at, students: { [`2${cls}`]: { total: score } } });
const base = { written: [{ id: "w1", title: "1차", weight: 25 }], performance: [], settings: { gradeSystem: 5, courseType: "common" }, tieScores: {}, studentOverrides: {} };

test("두 선생님이 서로 다른 반 수행을 올리면 둘 다 남음", () => {
  const mine = { ...base, performance: [perf("1,2", "2026-10-11T01:00:00Z")] };
  const theirs = { ...base, performance: [perf("5,6", "2026-10-11T01:01:00Z")] };
  const { merged, conflicts } = mergeWorkspacePayload(base, mine, theirs);
  assert.equal(merged.performance.length, 2);
  assert.equal(conflicts.length, 0);
});

test("한쪽만 바꾼 설정은 그쪽 값", () => {
  const mine = { ...base, settings: { ...base.settings, gradeSystem: 9 } };
  const theirs = { ...base, settings: { ...base.settings, courseType: "elective" } };
  const { merged } = mergeWorkspacePayload(base, mine, theirs);
  assert.deepEqual(merged.settings, { gradeSystem: 9, courseType: "elective" });
});

test("상대가 지운 시험은 내가 안 건드렸으면 지워짐", () => {
  const theirs = { ...base, written: [] };
  const { merged } = mergeWorkspacePayload(base, base, theirs);
  assert.equal(merged.written.length, 0);
});

test("같은 항목을 둘 다 바꾸면 더 최근 것", () => {
  const mine = { ...base, written: [{ id: "w1", title: "1차", weight: 30, updatedAt: "2026-10-11T01:00:00Z" }] };
  const theirs = { ...base, written: [{ id: "w1", title: "1차", weight: 40, updatedAt: "2026-10-11T02:00:00Z" }] };
  const { merged, conflicts } = mergeWorkspacePayload(base, mine, theirs);
  assert.equal(merged.written[0].weight, 40);
  assert.deepEqual(conflicts, ["written:w1"]);
});

test("학생별 결시 인정점은 학생 단위로 합침", () => {
  const mine = { ...base, studentOverrides: { "20101": { recognized: { w1: true } } } };
  const theirs = { ...base, studentOverrides: { "20502": { recognized: { w1: true } } } };
  const { merged } = mergeWorkspacePayload(base, mine, theirs);
  assert.deepEqual(Object.keys(merged.studentOverrides).sort(), ["20101", "20502"]);
});

test("처음 합칠 때(공통 기준 없음)는 양쪽 합집합", () => {
  const mine = { ...base, performance: [perf("1", "2026-10-11T01:00:00Z")] };
  const theirs = { ...base, performance: [perf("2", "2026-10-11T01:00:00Z")] };
  const { merged } = mergeWorkspacePayload(null, mine, theirs);
  assert.equal(merged.performance.length, 2);
  assert.equal(merged.written.length, 1);
});

test("samePayload", () => {
  assert.equal(samePayload(base, { ...base, updatedAt: "x" }), true);
  assert.equal(samePayload(base, { ...base, tieScores: { a: 1 } }), false);
});

test("함께 작업 중: 최근 2분, 나 제외", () => {
  const now = Date.parse("2026-10-11T03:00:00Z");
  const presence = { ws: { me: { name: "나", at: "2026-10-11T02:59:30Z" }, t1: { name: "김", at: "2026-10-11T02:59:00Z" }, t2: { name: "이", at: "2026-10-11T02:50:00Z" } } };
  assert.deepEqual(activeEditors(presence, "ws", "me", now).map(item => item.name), ["김"]);
});
