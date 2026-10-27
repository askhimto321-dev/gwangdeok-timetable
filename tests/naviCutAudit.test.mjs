import test from "node:test";
import assert from "node:assert/strict";
import { pickUnitRecords, collapseCutRows, auditNaviRecords, naviNameKey, cutsInverted } from "../src/naviCutAudit.js";

const rec = (unit2027, unit2026, teaching = [], holistic = []) => ["충청", "충북", "", "청주대", unit2026, unit2027, "인문", teaching, holistic, null];

test("정확히 같은 모집단위가 있으면 부분 일치 학과는 섞지 않는다", () => {
  const records = [rec("관광경영학과", "관광경영학과"), rec("호텔관광경영학과", "호텔관광경영학과")];
  assert.deepEqual(pickUnitRecords(records, "관광경영학과").map(row => row[5]), ["관광경영학과"]);
  assert.equal(pickUnitRecords(records, "관광 경영").length, 2);
  assert.deepEqual(pickUnitRecords(records, "호텔관광경영학과").map(row => row[5]), ["호텔관광경영학과"]);
});

test("합쳐진 2026 모집단위 이름으로도 정확히 찾는다", () => {
  const records = [rec("경영학부", "경영학과 / 회계학과"), rec("글로벌경영학과", "글로벌경영학과")];
  assert.deepEqual(pickUnitRecords(records, "회계학과").map(row => row[5]), ["경영학부"]);
});

test("같은 전형 다른 컷은 가운데값 한 줄로 묶고 원래 컷을 남긴다", () => {
  const rows = collapseCutRows([
    { kind: "교과", name: "교과 일반", cut50: 3.63, cut70: 3.88, department: "관광경영학과" },
    { kind: "교과", name: "교과일반", cut50: 4.5, cut70: 4.63, department: "관광경영학과" },
    { kind: "교과", name: "교과인재", cut50: 4.38, cut70: 4.13, department: "관광경영학과" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].variants.length, 2);
  assert.ok(Math.abs(rows[0].cut50 - 4.065) < 0.01);
  assert.equal(rows[1].inverted, true);
});

test("전수 점검: 컷 다름과 50%>70% 를 모두 찾는다", () => {
  const audit = auditNaviRecords([
    rec("관광경영학과", "관광경영학과 / 항공서비스학과", [["교과일반", 3.63, 3.88, null, null, "관광경영학과"], ["교과일반", 4.5, 4.63, null, null, "항공서비스학과"], ["교과인재", 4.38, 4.13]]),
    rec("국어국문학과", "국어국문학과", [["교과일반", 3, 3.2], ["교과일반", 3, 3.2]]),
  ]);
  assert.equal(audit.conflicts.length, 1);
  assert.equal(audit.conflicts[0].merged, true);
  assert.equal(audit.conflicts[0].variants[1].source, "항공서비스학과");
  assert.equal(audit.inverted.length, 1);
  assert.equal(audit.tracks, 5);
});

test("이름 키는 띄어쓰기·전형 꼬리를 무시한다", () => {
  assert.equal(naviNameKey("교과 일반 전형"), naviNameKey("교과일반"));
  assert.equal(cutsInverted(4.38, 4.13), true);
  assert.equal(cutsInverted(4.13, 4.38), false);
  assert.equal(cutsInverted(null, 4.38), false);
});
