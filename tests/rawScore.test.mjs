import test from "node:test";
import assert from "node:assert/strict";
import { formatRawScore, subjectRawScore } from "../src/gradeEngine.js";

test("원점수는 소수점 있는 합계를 우선", () => {
  assert.equal(formatRawScore({ raw: 72.85, score: 73 }), "72.85");
  assert.equal(formatRawScore({ raw: 72.849999999, score: 73 }), "72.85");
  assert.equal(formatRawScore({ raw: 70.5, score: 71 }), "70.5");
  assert.equal(formatRawScore({ raw: null, score: 73 }), "73");
  assert.equal(formatRawScore({}), "-");
  assert.equal(subjectRawScore({ raw: "68.4", score: 68 }), 68.4);
});
