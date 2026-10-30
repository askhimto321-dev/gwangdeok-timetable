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
import { splitSentences, findDuplicateSentences, buildAiPrompt } from "../src/recordText.js";
test("문장 나누기: 소수점은 그대로", () => {
  assert.deepEqual(splitSentences("pH 7.5 용액을 만듦. 결과를 발표함.\n다음 줄임"), ["pH 7.5 용액을 만듦.", "결과를 발표함.", "다음 줄임"]);
});
test("중복 문장: 띄어쓰기 달라도 같은 문장으로", () => {
  const dup = findDuplicateSentences([
    { sid: "1", label: "1번", text: "모둠 활동에 적극적으로 참여하는 모습을 보임. 혼자 쓴 문장임." },
    { sid: "2", label: "2번", text: "모둠 활동에  적극적으로 참여하는 모습을 보임." },
    { sid: "3", label: "3번", text: "다른 문장." },
  ]);
  assert.equal(dup.length, 1);
  assert.deepEqual(dup[0].people.map(p => p.label), ["1번", "2번"]);
});
test("AI 요청문: 학생 이름을 빼고 바이트 조건을 넣음", () => {
  const prompt = buildAiPrompt({ area: "과세특", subject: "국어", activity: "논술", budget: 900, notes: [["논술", "홍길동은 근거를 들어 주장함"]], studentName: "홍길동" });
  assert.ok(!prompt.includes("홍길동"));
  assert.ok(prompt.includes("900바이트"));
  assert.ok(prompt.includes("학생은 근거를 들어 주장함"));
});
test("오타 의심: 자음·모음만, 같은 낱말 반복, 마침표 겹침", () => {
  const issues = checkRecordText("발표를 ㅇㅇ 잘함. ㅏㅇ 활동함. 탐구 탐구 보고서를 씀.. 끝.");
  const typos = issues.filter(item => item.kind === "오타 의심").map(item => item.match);
  assert.ok(typos.includes("ㅇㅇ") && typos.includes("ㅏㅇ"));
  assert.ok(typos.some(m => m.startsWith("탐구 탐구")));
  assert.ok(typos.includes(".."));
  assert.equal(checkRecordText("현대 사회의 다양한 문제를 탐구함.").filter(i => i.kind === "오타 의심").length, 0);
});
test("중복 문장: 짧은 문장(5자 이상)도 같은 문장으로", () => {
  const dup = findDuplicateSentences([
    { sid: "1", label: "1번", text: "도레미파솔라시도." },
    { sid: "2", label: "2번", text: "도레미파솔라시도." },
    { sid: "3", label: "3번", text: "도레미파솔라시도." },
    { sid: "4", label: "4번", text: "성실함." },
    { sid: "5", label: "5번", text: "성실함." },
  ]);
  assert.equal(dup.length, 1);
  assert.equal(dup[0].people.length, 3);
});
test("중복 문장: 조사·어미만 바꾼 문장은 '비슷한 문장'으로 묶음", () => {
  const dup = findDuplicateSentences([
    { sid: "1", label: "1번", text: "소설의 갈등 구조를 분석한 보고서를 논리적으로 작성함." },
    { sid: "2", label: "2번", text: "소설의 갈등 구조를 분석하는 보고서를 논리적으로 작성하였음." },
    { sid: "3", label: "3번", text: "기후 변화가 해양 생태계에 미치는 영향을 조사하여 발표함." },
  ]);
  assert.equal(dup.length, 1);
  assert.equal(dup[0].similar, true);
  assert.deepEqual(dup[0].people.map(p => p.label).sort(), ["1번", "2번"]);
});
test("AI 요청문: 성취기준을 넣으면 목표로 안내", () => {
  const prompt = buildAiPrompt({ area: "과세특", subject: "문학", budget: 1500, notes: [["논술", "근거를 들어 주장함"]], standards: ["[12문학01-02] 문학의 여러 갈래들의 특성과 문학의 맥락에 대해 이해한다."] });
  assert.ok(prompt.includes("[이 활동의 성취기준"));
  assert.ok(prompt.includes("- [12문학01-02]"));
  assert.ok(!buildAiPrompt({ area: "과세특", notes: [] }).includes("성취기준"));
});
