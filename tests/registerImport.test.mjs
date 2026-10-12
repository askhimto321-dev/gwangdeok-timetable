import test from "node:test";
import assert from "node:assert/strict";
import { parseRegisterSheets } from "../src/registerImport.js";

test("학번 열이 있는 명렬표", () => {
  const out = parseRegisterSheets([{ name: "1학년", rows: [["2026학년도 학생 명렬"], ["학번", "성 명", "반", "번호", "성별"], [10101, "김가나", 1, 1, "남"], [10102, "이다라", 1, 2, "여"], [20101, "박선배", 1, 1, "남"]] }], "1");
  assert.equal(out.count, 2);
  assert.deepEqual(out.roster["10102"], { name: "이다라", class: 1, number: 2, gender: "여" });
  assert.equal(out.otherGrade, 1);
});

test("학번이 없으면 학년·반·번호로 만들고, 전출·자퇴는 뺌", () => {
  const out = parseRegisterSheets([{ name: "명부", rows: [["학년", "반", "번호", "이름", "학적상태"], ["1", "3반", "7", "최마바", "재학"], ["1", "3반", "8", "정사아", "전출"], ["1", "12", "1", "한자차", ""]] }], "1");
  assert.deepEqual(Object.keys(out.roster).sort(), ["10307", "11201"]);
  assert.equal(out.skipped.length, 1);
});

test("머리글이 없는 시트는 건너뜀", () => {
  const out = parseRegisterSheets([{ name: "표지", rows: [["광덕고"], ["안내"]] }], "1");
  assert.equal(out.sheetsUsed, 0);
  assert.equal(out.count, 0);
});
