import test from "node:test";
import assert from "node:assert/strict";
import { parseCounselSurvey, mergeCounselSurveys, splitChoice } from "../src/counselSurvey.js";

const header = ["타임스탬프", "1. 학번", "2. 이름", "3. 현재 진로·진학 목표는 어느 정도 정해졌나요?", "4. 관심 있는 학과·전공·직업을 적어주세요.", "6. 현재 가장 관심 있는 대학과 학과를 적어주세요.", "9. 대학·학과를 선택할 때 중요하게 생각하는 조건을 최대 3개 골라주세요.", "10. 진학을 고려할 수 있는 지역을 모두 골라주세요.", "22. 상담 때 꼭 물어보고 싶은 질문을 적어주세요."];

test("구글 폼 응답: 머리글로 열을 찾고 학번별로 저장", () => {
  const rows = [header,
    ["2026. 10. 19 오후 3:05:12", "20101", "가나다", "희망 학과·분야는 있지만 대학은 고민 중이다.", "간호학과", "가천대 / 메디컬 / 간호학과", "취업·진로 전망, 합격 가능성", "서울, 경기·인천", "수시 몇 개?"],
    ["2026. 10. 19 오후 4:00:00", "20101", "가나다", "희망 학과와 대학이 어느 정도 정해져 있다.", "간호학과", "가천대 / 간호학과", "", "서울", "최저 맞출 수 있나요?"],
    ["2026. 10. 19 오전 9:00:00", "1-1-2", "x", "", "", "", "", "", ""],
    ["2026. 10. 19 오전 9:00:00", "30105", "다른학년", "", "", "", "", "", ""],
  ];
  const result = parseCounselSurvey(rows, { grade: "2" });
  assert.equal(result.count, 1);
  assert.equal(result.responses["20101"].answers.readiness, "희망 학과와 대학이 어느 정도 정해져 있다.");
  assert.equal(result.responses["20101"].answers.questions, "최저 맞출 수 있나요?");
  assert.equal(result.skipped.length, 2);
  assert.ok(result.missing.includes("관심 이유"));
  assert.ok(result.responses["20101"].submittedAt.startsWith("2026-10-19"));
});

test("학번 열이 없으면 알려 줌", () => {
  assert.throws(() => parseCounselSurvey([["이름"], ["가"]]), /학번/);
});

test("합치기: 더 늦게 낸 응답만 남김", () => {
  const merged = mergeCounselSurveys({ "20101": { sid: "20101", submittedAt: "2026-10-20T00:00:00.000Z", answers: { questions: "새" } } }, { "20101": { sid: "20101", submittedAt: "2026-10-19T00:00:00.000Z", answers: { questions: "옛" } }, "20102": { sid: "20102", submittedAt: "", answers: {} } });
  assert.equal(merged["20101"].answers.questions, "새");
  assert.ok(merged["20102"]);
});

test("희망 대학 답 나누기", () => {
  assert.deepEqual(splitChoice("가천대 / 메디컬 / 간호학과"), { university: "가천대", department: "간호학과" });
  assert.deepEqual(splitChoice("간호학과"), { university: "", department: "간호학과" });
  assert.equal(splitChoice("미정"), null);
});
