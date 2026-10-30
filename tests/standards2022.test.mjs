import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchStandardSubject, findStandards, standardToken } from "../src/standards2022.js";

const data = JSON.parse(readFileSync(new URL("../src/data/standards2022High.json", import.meta.url), "utf8"));
const subjects = data.subjects;

test("성취기준 자료: 고등학교 과목·성취기준이 모두 들어 있음", () => {
  assert.ok(subjects.length >= 200);
  const total = subjects.reduce((n, s) => n + s.d.reduce((m, [, items]) => m + items.length, 0), 0);
  assert.ok(total >= 3000);
  subjects.forEach(s => s.d.forEach(([domain, items]) => { assert.ok(domain && domain.length <= 20, `${s.n} 영역 이름`); items.forEach(([code, text]) => { assert.match(code, /^\[[^\]]+\]$/); assert.ok(text.length > 5); }); }));
});
test("과목 이름 맞추기: 띄어쓰기·로마숫자·분반 표시가 달라도", () => {
  assert.equal(matchStandardSubject("확률과통계", subjects)?.n, "확률과 통계");
  assert.equal(matchStandardSubject("공통국어Ⅰ", subjects)?.n, "공통국어1");
  assert.equal(matchStandardSubject("물리학 A반", subjects)?.n, "물리학");
  assert.equal(matchStandardSubject("없는과목", subjects), null);
  assert.equal(standardToken("기술⋅가정"), standardToken("기술·가정"));
});
test("코드로 성취기준 찾기", () => {
  const found = findStandards(["[12확통01-01]"], subjects, "확률과 통계");
  assert.equal(found.length, 1);
  assert.equal(found[0].domain, "경우의 수");
});
test("학교 약칭을 편제표로 맞춰 성취기준 과목 찾기", async () => {
  const { resolveStandardSubject } = await import("../src/standards2022.js");
  assert.equal(resolveStandardSubject("미적", "2", "sem2", subjects).subject?.n, "미적분Ⅰ");
  assert.equal(resolveStandardSubject("미적", "2", "sem1", subjects).subject?.n, "미적분Ⅰ");
  assert.equal(resolveStandardSubject("독작", "2", "sem2", subjects).subject?.n, "독서와 작문");
  assert.equal(resolveStandardSubject("문학", "2", "sem1", subjects).via, "");
});
