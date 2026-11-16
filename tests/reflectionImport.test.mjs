import test from "node:test";
import assert from "node:assert/strict";
import { parseReflectionSheets, cleanQuestion, reflectionResponse } from "../src/recordText.js";

const H = ["타임스탬프", "반을 쓰세요.(숫자만) [ 예) 1 (o) / 1반 (x) ]", "학번을 쓰세요. [ 예) 20100 ]", "탐구 질문을 쓰세요. [ 예) 우리나라 고령인구는 얼마나 빠르게 증가하고 있는가? ]", "탐구 질문을 선정한 이유를 쓰세요. [세특에 반영되므로 구체적으로 작성하세요.]", "탐구 내용 및 결과, 결론을 쓰세요. [ 선택한 미적분 개념을 활용한 자료 해석을 반드시 포함하세요.]", "탐구를 하며 느낀점을 쓰세요. [ 탐구를 통해 새롭게 알게 된 점 ]"];

test("구글 설문 응답 시트에서 학번별 소감문을 읽어요", () => {
  const sheets = [
    { name: "학적", rows: [["학번", "이름"], ["20101", "가"], ["20102", "나"]] },
    { name: "점수", rows: [["반", "학번", "이름", "1차시", "총점"], [1, "20101", "가", 4, 4]] },
    { name: "미적분 설문", rows: [H,
      ["2026. 10. 2 오후 1:00:00", "2", "20202", "인구는 얼마나 빨리 늘까?", "통계 자료를 보다가 궁금해졌다", "변화율을 미분으로 구해 비교했다", "미분의 쓰임을 알게 되었다"],
      ["2026. 10. 3 오후 1:00:00", "8반 ", "20817", "짧은 질문입니다", "", "평균변화율로 해석했다", ""],
      ["2026. 10. 4 오후 1:00:00", "2", "20202", "다시 낸 질문입니다", "이유를 고쳐 썼습니다", "결과를 고쳐 썼습니다", "느낀점을 고쳐 썼다"]] },
  ];
  const [s] = parseReflectionSheets(sheets);
  assert.equal(parseReflectionSheets(sheets).length, 1);
  assert.equal(s.name, "미적분 설문");
  assert.deepEqual(s.questions, ["탐구 질문", "탐구 질문을 선정한 이유", "탐구 내용 및 결과, 결론", "탐구를 하며 느낀점"]);
  assert.equal(s.items.length, 2);
  assert.equal(s.dupes, 1);
  const a = s.items.find(x => x.sid === "20202");
  assert.equal(a.answers[0], "다시 낸 질문입니다");
  assert.equal(a.date, "10.4");
  assert.equal(reflectionResponse(s.questions, s.items.find(x => x.sid === "20817").answers), "탐구 질문: 짧은 질문입니다\n탐구 내용 및 결과, 결론: 평균변화율로 해석했다");
});

test("질문 머리글 다듬기", () => {
  assert.equal(cleanQuestion("느낀 점을 적어 주세요 (예) 어려웠던 점)"), "느낀 점");
  assert.equal(cleanQuestion(""), "응답");
});
