import test from "node:test";
import assert from "node:assert/strict";
import { neisBytes, mergeActivities, checkRecordText, issueSummary } from "../src/recordText.js";

test("나이스 바이트: 한글 3, 영문·숫자·공백 1, 엔터 2", () => {
  assert.equal(neisBytes("가나다"), 9);
  assert.equal(neisBytes("AI 3개"), 1 + 1 + 1 + 1 + 3);
  assert.equal(neisBytes("가\n나"), 3 + 2 + 3);
  assert.equal(neisBytes("가\r\n나"), 8);
  assert.equal(neisBytes(""), 0);
});
test("활동별 세특 합치기: 빈 활동 빼고 줄바꿈", () => {
  const acts = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(mergeActivities(acts, { a: " 첫째 활동 ", b: "", c: "셋째" }), "첫째 활동\n셋째");
});
test("기재요령 점검: 특수문자·대학명·상호명·용어는 기재 불가", () => {
  const issues = checkRecordText("서울대학교 탐방 후 유튜브에 영상을 올림. 2025.03~05 활동 · 발표함. 교내 대회에서 수상함.");
  const kinds = issues.map(item => item.kind);
  assert.ok(kinds.includes("대학명"));
  assert.ok(kinds.includes("상호명"));
  assert.ok(kinds.some(k => k.startsWith("특수문자")));
  assert.ok(kinds.includes("입력 불가 용어"));
  assert.ok(issueSummary(issues).block >= 5);
});
test("기재요령 점검: 시제·학생 입장 표현은 권장(warn)", () => {
  const issues = checkRecordText("실험 결과를 분석하였음. 협력의 중요성을 깨달음.");
  assert.deepEqual(issues.map(item => item.level), ["warn", "warn"]);
});
test("기재요령 점검: 허용 영문(AI, SNS)과 일반 낱말은 통과", () => {
  assert.equal(checkRecordText("AI 윤리에 대해 SNS 사례를 조사하여 발표함.").length, 0);
  assert.equal(checkRecordText("현대 사회의 기대와 반대 의견을 비교함.").length, 0);
});
import { autoFixRecordText, parsePastedRows } from "../src/recordText.js";
test("자동 고치기: 기호만 바꾸고 뜻은 그대로", () => {
  assert.equal(autoFixRecordText("국어·수학 ‘탐구’ 3~5월 [보고서]  발표함."), "국어, 수학 '탐구' 3-5월 보고서 발표함.");
});
test("엑셀 붙여넣기: 번호·학번으로 학생 맞추기", () => {
  const students = [{ sid: "20101", number: 1 }, { sid: "20102", number: 2 }];
  const { matched, missed } = parsePastedRows("1\t첫째 글\n20102\t홍길동\t둘째 글\n9\t없는 학생", students);
  assert.deepEqual(matched, [{ sid: "20101", text: "첫째 글" }, { sid: "20102", text: "둘째 글" }]);
  assert.equal(missed.length, 1);
});
