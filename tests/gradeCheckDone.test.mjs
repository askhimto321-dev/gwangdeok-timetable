import test from "node:test";
import assert from "node:assert/strict";
import { gradeCheckDone } from "../src/examPeriod.js";

test("담당 과목을 모두 시험 뒤에 저장했으면 산출 끝으로 본다", () => {
  const ws = [{ subject: "미적분Ⅰ", updatedAt: "2026-10-25T03:00:00Z" }, { subject: "대수", updatedAt: "2026-10-10T03:00:00Z" }];
  assert.equal(gradeCheckDone(["미적분 I"], ws, "2026-10-20"), true);
  assert.equal(gradeCheckDone(["미적분 I", "대수"], ws, "2026-10-20"), false);
  assert.equal(gradeCheckDone([], ws, "2026-10-20"), false);
});
