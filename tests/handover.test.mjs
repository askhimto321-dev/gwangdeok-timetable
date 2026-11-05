import { test } from "node:test";
import assert from "node:assert/strict";
import { seedHandover, normalizeHandover, normalizeTask, groupSteps, linkKind, safeUrl, stepTemplate, taskProgress, newStep } from "../src/handover.js";

test("인수인계: 2학년부 기본 틀(담당 11, 이름 없음)", () => {
  const v = normalizeHandover(null);
  assert.equal(v.depts[0].name, "2학년부");
  assert.equal(v.roles.length, 11);
  assert.ok(v.roles.every(r => !r.ownerName));
  assert.ok(v.roles.some(r => r.duties.some(d => /따라체험/.test(d.text))));
  assert.equal(new Set(v.roles.flatMap(r => r.duties.map(d => d.id))).size, v.roles.reduce((n, r) => n + r.duties.length, 0));
  assert.deepEqual(normalizeHandover(seedHandover()).roles.length, 11);
});
test("인수인계: 타임라인은 3월→2월, 시기 미정은 맨 뒤", () => {
  const g = groupSteps([newStep({ month: 1, title: "a" }), newStep({ month: 0, title: "b" }), newStep({ month: 4, title: "c" }), newStep({ month: 12, title: "d" })]);
  assert.deepEqual(g.map(x => x.label), ["4월", "12월", "1월", "시기 미정"]);
});
test("인수인계: 링크 종류·주소 정리", () => {
  assert.equal(linkKind("https://docs.google.com/spreadsheets/d/x/edit").kind, "sheet");
  assert.equal(linkKind("https://drive.google.com/drive/folders/x").kind, "drive");
  assert.equal(safeUrl("docs.google.com/a"), "https://docs.google.com/a");
  assert.equal(safeUrl("javascript:alert(1)"), "");
});
test("인수인계: 따라체험 예시 틀에 팜플렛 제작", () => {
  assert.ok(stepTemplate("따라체험(꿈따라 세상 속으로) 1").some(s => /팜플렛/.test(s.title)));
  assert.equal(stepTemplate("학년 기획").length, 4);
});
test("인수인계: 진행 정도", () => {
  const p = taskProgress(normalizeTask({ summary: "x", steps: [{ title: "a", done: true, links: [{ url: "https://a.b" }] }, { title: "b" }], links: [{ url: "https://c.d" }], comments: [{ text: "q" }] }));
  assert.deepEqual([p.steps, p.done, p.files, p.comments], [2, 1, 2, 1]);
});
