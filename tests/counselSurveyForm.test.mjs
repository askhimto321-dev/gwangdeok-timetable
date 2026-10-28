import test from "node:test";
import assert from "node:assert/strict";
import { SURVEY_FORM_QUESTIONS, formCopyUrl, surveyFormScript } from "../src/counselSurveyForm.js";
import { parseCounselSurvey, SURVEY_FIELDS } from "../src/counselSurvey.js";

test("구글폼 질문으로 만든 응답 시트를 상담 화면이 모두 읽는다", () => {
  const header = ["타임스탬프", ...SURVEY_FORM_QUESTIONS.map(([q]) => q)];
  const row = ["2026. 10. 1 오전 9:00:00", "20301", "테스트", ...SURVEY_FORM_QUESTIONS.slice(2).map((_, i) => `답${i}`)];
  const result = parseCounselSurvey([header, row]);
  assert.deepEqual(result.missing, []);
  assert.equal(result.count, 1);
  const answers = result.responses["20301"].answers;
  // 질문 순서대로 열이 맞게 잡혔는지(키 순서 = 질문 순서)
  SURVEY_FIELDS.slice(2).forEach(([key], i) => assert.equal(answers[key], `답${i}`, key));
});

test("사본 주소: 편집 주소만 받는다", () => {
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
  assert.equal(formCopyUrl(`https://docs.google.com/forms/d/${id}/edit`).url, `https://docs.google.com/forms/d/${id}/copy`);
  assert.equal(formCopyUrl(`https://docs.google.com/forms/u/0/d/${id}/edit#responses`).id, id);
  assert.equal(formCopyUrl("https://forms.gle/abc").ok, false);
  assert.equal(formCopyUrl(`https://docs.google.com/forms/d/e/${id}/viewform`).ok, false);
  assert.equal(formCopyUrl("").ok, false);
});

test("Apps Script 코드에 모든 질문이 들어간다", () => {
  const code = surveyFormScript();
  SURVEY_FORM_QUESTIONS.forEach(([q]) => assert.ok(code.includes(JSON.stringify(q)), q));
  assert.ok(code.includes("function makeSurvey"));
});
