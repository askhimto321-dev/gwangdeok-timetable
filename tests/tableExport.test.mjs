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

test("change marks are dropped and 'A → B' columns are split", async () => {
  const { cleanCell, splitPairColumns, cellValue } = await import("../src/tableExport.js");
  assert.equal(cleanCell("1.28 → 1.27 ▲ 0.01"), "1.28 → 1.27");
  assert.equal(cleanCell("1.00 시작"), "1.00");
  assert.equal(cleanCell("1.28 ▼0.28"), "1.28");
  assert.equal(cleanCell("3.00 = 0.00"), "3.00");
  assert.equal(cleanCell("1 위"), "1");
  const { header, body } = splitPairColumns(["순위", "직전 → 최근 학기"], [["1", "1.28 → 1.27"], ["2", "1.5 → 1.4"]]);
  assert.deepEqual(header, ["순위", "직전", "최근 학기"]);
  assert.deepEqual(body.map(r => r.map(cellValue)), [[1, 1.28, 1.27], [2, 1.5, 1.4]]);
});

test("column groups and picking columns", async () => {
  const { columnGroups, pickColumns } = await import("../src/tableExport.js");
  const headers = ["순위", "이름", "직전 대비 변화량(+ 상승)", "학기별 전교과 평균 · 1학년 1학기", "학기별 전교과 평균 · 1학년 1학기 변화량(+ 상승)"];
  const groups = columnGroups(headers);
  assert.deepEqual(groups.map(g => [g.name, g.items.map(i => i.label)]), [["기본 항목", ["순위", "이름"]], ["성적 변화량", ["직전 대비", "1학년 1학기"]], ["학기별 전교과 평균", ["1학년 1학기"]]]);
  assert.deepEqual(pickColumns([headers, [1, "가", 0.1, 2.4, ""]], ["이름", "학기별 전교과 평균 · 1학년 1학기"]), [["이름", "학기별 전교과 평균 · 1학년 1학기"], ["가", 2.4]]);
});
