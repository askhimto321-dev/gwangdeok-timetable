import test from "node:test";
import assert from "node:assert/strict";
import { gridFromRows, mergeHeader, cellValue } from "../src/tableExport.js";

test("two-row header with spans flattens into one row", () => {
  const head = gridFromRows([
    [{ text: "순위", rowSpan: 2 }, { text: "이름", rowSpan: 2 }, { text: "학기별 평균", colSpan: 2 }],
    [{ text: "1학년 1학기" }, { text: "1학년 2학기" }],
  ]);
  assert.deepEqual(mergeHeader(head), ["순위", "이름", "학기별 평균 · 1학년 1학기", "학기별 평균 · 1학년 2학기"]);
});

test("numbers become numbers, ids with leading zero and mixed text stay text", () => {
  assert.equal(cellValue(" 1.18 "), 1.18);
  assert.equal(cellValue("20901"), 20901);
  assert.equal(cellValue("01"), "01");
  assert.equal(cellValue("1.28 → 1.27 ▲ 0.01"), "1.28 → 1.27 ▲ 0.01");
  assert.equal(cellValue("1위"), "1위");
});
