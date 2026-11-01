import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { exampleGroupFor, examplesFor, EXAMPLE_GROUPS } from "../src/sehtukExamples.js";

const data = JSON.parse(readFileSync(new URL("../src/data/sehtukExamples2015.json", import.meta.url), "utf8"));

test("기재 예시 자료: 고등학교 15개 교과 68개", () => {
  assert.equal(data.items.length, 68);
  assert.deepEqual([...new Set(data.items.map(item => item.g))].sort(), [...EXAMPLE_GROUPS].sort());
  data.items.forEach(item => { assert.ok(item.t.length > 150, item.s); assert.ok(item.c.length >= 1, item.s); assert.ok(item.task.length >= 1, item.s); assert.ok(!item.t.includes("(…)")); });
});
test("과목 → 교과 맞추기와 같은 과목 먼저", () => {
  assert.equal(exampleGroupFor("미적분Ⅰ"), "수학");
  assert.equal(exampleGroupFor("물리학"), "과학");
  assert.equal(exampleGroupFor("독서와 작문"), "국어");
  assert.equal(exampleGroupFor("윤리와 사상"), "사회");
  assert.equal(exampleGroupFor("프로그래밍"), "정보");
  assert.equal(examplesFor("미적분Ⅰ", data.items)[0].s, "미적분");
  assert.equal(examplesFor("문학", data.items)[0].s, "문학");
});
