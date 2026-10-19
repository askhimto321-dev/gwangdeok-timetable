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

test("실제 폼 머리글(줄인 질문 문장)도 23문항 모두 찾음", () => {
  const header = ["타임스탬프", "1. 학번 (5자리, 예: 20101)", "2. 이름", "3. 현재 진로·진학 목표는 어느 정도 정해졌나요?", "4. 관심 있는 학과·전공·직업을 적어주세요. (미정이면 좋아하는 과목·활동)", "5. 그 분야에 관심을 갖게 된 이유는 무엇인가요?", "6. 가장 관심 있는 대학 / 캠퍼스 / 학과를 적어주세요. (미정 가능)", "7. 추가로 알아보고 싶은 대학 / 캠퍼스 / 학과를 적어주세요. (한 줄에 하나, 최대 5개)", "8. 대학과 학과 중 무엇을 더 중요하게 생각하나요?", "9. 대학·학과 선택 시 중요한 조건을 골라주세요. (최대 3개)", "10. 진학을 고려할 수 있는 지역을 모두 골라주세요. (지역 제한 없음·미정은 단독 선택)", "11. 통학·거주와 관련해 고려해야 할 조건이 있나요?", "12. 현재 생각하는 대입 준비 방향은 무엇인가요?", "13. 관심 있거나 상담받고 싶은 전형을 모두 골라주세요.", "14. 현재 생각하는 지원 성향과 가장 가까운 것은 무엇인가요?", "15. 지원 범위에 관해 추가로 상담할 내용이 있나요? (전문대 포함 여부 등)", "16. 자신 있거나 좋아하는 과목은 무엇인가요? (최대 3개)", "17. 도움이 필요한 과목은 무엇인가요? (최대 3개, 없다면 없음)", "18. 수능최저학력기준에 대해 현재 어느 정도 알고 있나요?", "19. 소개하고 싶은 진로 관련 활동이 있나요? (수업·탐구·동아리 등 1~2개와 본인이 한 일)", "20. 선택과목·학과별 권장과목에 관해 궁금한 점이 있나요?", "21. 이번 상담에서 우선 다루고 싶은 내용을 골라주세요. (최대 3개)", "22. 상담 때 꼭 물어보고 싶은 질문을 적어주세요. (없으면 함께 정하고 싶습니다)", "23. 선생님이 상담 전에 알면 좋을 사항이 있나요? (필요한 내용만 적고, 상담 때 직접 말씀드려도 됩니다)"];
  const row = ["2026. 10. 20 오전 9:10:00", "20203", "예시", "아직 관심 분야를 찾는 중이다.", "생명", "", "", "", "아직 판단하기 어렵다.", "전공에 대한 흥미와 적성, 취업·진로 전망", "서울, 경기·인천", "기숙사 생활이 가능하다면 다른 지역도 고려한다.", "수시 중심", "학생부교과, 학생부종합", "아직 결정하기 어렵다.", "", "생명과학", "수학", "수능최저가 있다는 것은 알지만 정확한 기준은 모른다.", "", "", "나에게 맞는 학과·진로 찾기, 수시 지원 대학 구성", "함께 정하고 싶습니다", ""];
  const empty = parseCounselSurvey([header]);
  assert.deepEqual(empty.missing, []);
  assert.equal(empty.count, 0);
  const result = parseCounselSurvey([header, row]);
  const a = result.responses["20203"].answers;
  assert.equal(a.criteria, "전공에 대한 흥미와 적성, 취업·진로 전망");
  assert.equal(a.topics, "나에게 맞는 학과·진로 찾기, 수시 지원 대학 구성");
  assert.equal(a.minimum, "수능최저가 있다는 것은 알지만 정확한 기준은 모른다.");
  assert.equal(a.needSubjects, "수학");
});
