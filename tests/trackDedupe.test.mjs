import test from "node:test";
import assert from "node:assert/strict";
import { mergeDuplicateTracks, tracksRelated } from "../src/trackDedupe.js";

const sum = (count, threshold, extra = {}) => ({ status: "satisfied", year: 2028, ruleType: "sum", count, threshold, ruleText: `${count}합 ${threshold}`, ...extra });
const none = { status: "no-minimum", year: 2028, ruleText: "미적용" };
const names = list => list.map(item => item.track);

test("괄호 설명만 다른 같은 전형은 하나로(숭실 교과우수자)", () => {
  const out = mergeDuplicateTracks([
    { admissionType: "교과", track: "교과우수자 (학교장추천)", evaluation: sum(2, 6, { ruleText: "국, 수, 영, 사/과(1) 중 2개 영역 등급 합 6" }) },
    { admissionType: "교과", track: "교과우수자", evaluation: sum(2, 6, { ruleText: "국,수,영,사/과(1) 중 2개 영역 등급 합 6 이내" }) },
    { admissionType: "교과", track: "학생부우수자", evaluation: sum(2, 6) },
  ]);
  assert.deepEqual(names(out), ["교과우수자 (학교장추천)", "학생부우수자"]);
  assert.deepEqual(out[0].aliases, ["교과우수자"]);
});

test("이름이 바뀐 전형(국민 교과성적우수자 ↔ 교과우수자(학교장추천 I/II))", () => {
  const out = mergeDuplicateTracks([
    { admissionType: "교과", track: "교과우수자(학교장추천 I / II )", evaluation: sum(2, 6) },
    { admissionType: "교과", track: "교과성적우수자", evaluation: sum(2, 6) },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].track, "교과우수자(학교장추천 I / II )");
});

test("'A / B' 묶음 이름과 그 일부(국민프런티어)", () => {
  const out = mergeDuplicateTracks([
    { admissionType: "종합", track: "국민프런티어 / 알고리즘우수자", evaluation: none },
    { admissionType: "종합", track: "국민프런티어", evaluation: none },
  ]);
  assert.deepEqual(names(out), ["국민프런티어 / 알고리즘우수자"]);
});

test("하위 전형이 따로 있으면 모음 줄은 뺌(경희 네오르네상스)", () => {
  const out = mergeDuplicateTracks([
    { admissionType: "종합", track: "네오르네상스(면접형)", evaluation: none },
    { admissionType: "종합", track: "네오르네상스(서류형)", evaluation: sum(2, 5) },
    { admissionType: "종합", track: "네오르네상스", evaluation: { status: "manual", year: 2028, ruleText: "네오르네상스(면접형): 미적용 / 네오르네상스(서류형): 국, 수, 영, 사/과(1) 중 2개 영역 등급 합 5" } },
  ]);
  assert.deepEqual(names(out), ["네오르네상스(면접형)", "네오르네상스(서류형)"]);
});

test("조건이 다르거나 유형이 다르면 합치지 않음", () => {
  const out = mergeDuplicateTracks([
    { admissionType: "교과", track: "지역균형", evaluation: sum(2, 5) },
    { admissionType: "교과", track: "지역균형", evaluation: sum(3, 4) },
    { admissionType: "논술", track: "논술우수자", evaluation: sum(2, 5) },
    { admissionType: "교과", track: "논술우수자", evaluation: sum(2, 5) },
  ]);
  assert.equal(out.length, 4);
});

test("관련 이름 판단", () => {
  assert.equal(tracksRelated("학생부우수자", "교과우수자"), false);
  assert.equal(tracksRelated("SSU미래인재(면접형)/AI우수자", "AI우수자"), true);
});

test("세부 구분이 다르면 조건이 같아도 다른 전형", () => {
  const pairs = [
    ["세종인재(면접형)", "세종인재(서류형)"],
    ["SSU미래인재(면접형)/AI우수자", "SSU미래인재(서류형)"],
    ["CHA세대인재면접", "CHA세대인재서류"],
    ["일반전형-면접형", "일반전형-서류형"],
    ["학생부교과 (지역균형-인문)", "학생부교과 (지역균형-자연)"],
    ["학생부종합 (지역균형)", "학생부종합 (일반)"],
    ["융합인재Ⅱ", "융합인재Ⅰ"],
    ["학교생활우수자2", "학교생활우수자Ⅰ"],
    ["교과우수자일반형 (의예과만 해당)", "교과우수자추천형 (의예과만 해당)"],
    ["학생부교과(제약학과)", "학생부교과(약학과)"],
    ["학생부교과(지균)", "CHA학생부교과"],
  ];
  pairs.forEach(([a, b]) => assert.equal(tracksRelated(a, b), false, `${a} ↔ ${b}`));
});

test("앞의 일반 명칭·메모만 다른 경우는 같은 전형", () => {
  assert.equal(tracksRelated("학생부교과 (학생부우수자)", "학생부우수자"), true);
  assert.equal(tracksRelated("학생부교과(추천형) ※ 졸업예정자", "학생부교과(추천형)"), true);
  assert.equal(tracksRelated("교과우수자(학교장추천 I / II )", "교과우수자 (학교장추천)"), true);
});
