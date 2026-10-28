import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTargets, searchStudents, separationRows, separationHeader, separationKey } from "../src/classSeparation.js";

const roster = { "20101": { name: "가", gender: "여", class: 1 }, "20102": { name: "나", gender: "남", class: 1 }, "20301": { name: "다나", gender: "남", class: 3 } };

test("자기 자신·중복·빈 학번은 빼고 10명까지", () => {
  const list = normalizeTargets([{ sid: "20101" }, { sid: "20102", level: "되도록 분리", reason: " 갈등 " }, { sid: "20102" }, { sid: "" }, { sid: "20301", level: "이상한값" }], "20101");
  assert.deepEqual(list.map(t => t.sid), ["20102", "20301"]);
  assert.equal(list[0].reason, "갈등");
  assert.equal(list[1].level, "반드시 분리");
});

test("학번 앞자리·이름 일부로 찾는다", () => {
  assert.deepEqual(searchStudents(roster, "203").map(s => s.sid), ["20301"]);
  assert.deepEqual(searchStudents(roster, "나", { exclude: ["20102"] }).map(s => s.sid), ["20301"]);
});

test("양식 행: 학번순, 학생마다 10칸 × 4", () => {
  const rows = separationRows([{ entries: { "20301": { targets: [{ sid: "20101", level: "되도록 분리", reason: "r" }] }, "20102": { targets: [] } } }], roster);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].length, 4 + 40);
  assert.deepEqual(rows[0].slice(0, 8), [1, "20301", "다나", "남", "20101", "가", "되도록 분리", "r"]);
  const header = separationHeader();
  assert.equal(header.top.length, 44);
  assert.equal(header.merges.length, 4 + 30);
  assert.equal(separationKey(2026, 2, "03"), "kd_class_separation_v1:2026:2:3");
});
