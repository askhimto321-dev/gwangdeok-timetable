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
test("인수인계: 시트 붙여넣기(머리글 있음, 합친 칸 이어받기, 링크)", async () => {
  const { parseSheetRows } = await import("../src/handover.js");
  const steps = parseSheetRows("시기\t업무\t세부 내용\t자료\n3월\t계획 수립\t계획서 작성\thttps://docs.google.com/spreadsheets/d/a\n\t예산 협의\t행정실과 협의\t\n2026.5.15.\t체험 실시\t인솔\t");
  assert.deepEqual(steps.map(s => [s.month, s.title]), [[3, "계획 수립"], [3, "예산 협의"], [5, "체험 실시"]]);
  assert.equal(steps[0].links[0].url, "https://docs.google.com/spreadsheets/d/a");
  assert.equal(steps[2].when, "15일");
});
test("인수인계: 시트 붙여넣기(머리글 없음)", async () => {
  const { parseSheetRows } = await import("../src/handover.js");
  const steps = parseSheetRows("4월\t희망 조사\t구글 설문으로 희망 분야 조사 후 인원 정리\n6월 2주\t사전교육\t안전교육과 학부모 동의서 회수");
  assert.deepEqual(steps.map(s => [s.month, s.title, s.when]), [[4, "희망 조사", ""], [6, "사전교육", "2주"]]);
  assert.ok(steps[0].detail.includes("구글 설문"));
});
test("인수인계: 나눠 맡는 업무 찾기·함께 쓰기 합치기·글로 복사", async () => {
  const { siblingDuties, normalizeHandover, dutyBase, mergeTasks, taskAsText, newStep } = await import("../src/handover.js");
  const v = normalizeHandover(null);
  const one = v.roles.flatMap(r => r.duties).find(d => /따라체험.*1$/.test(d.text));
  const sib = siblingDuties(v, one.id);
  assert.equal(sib.length, 2);
  assert.equal(dutyBase("따라체험(꿈따라 세상 속으로) 2"), "따라체험(꿈따라 세상 속으로)");
  assert.equal(siblingDuties(v, v.roles[0].duties[0].id).length, 0);
  const m = mergeTasks([{ summary: "a", steps: [newStep({ id: "x", title: "s1" })] }, { summary: "b", steps: [newStep({ id: "y", title: "s2" })] }]);
  assert.equal(m.summary, "a\n\nb"); assert.equal(m.steps.length, 2);
  assert.ok(taskAsText({ summary: "요약", steps: [newStep({ month: 3, title: "계획" })] }, "따라체험").includes("3월 계획"));
});
test("인수인계: 단계 담당 고르기(함께 쓰는 나눠 맡은 업무, 함께 고칠 선생님)", async () => {
  const { stepPeople, normalizeHandover, siblingDuties, taskAsText, newStep } = await import("../src/handover.js");
  const v = normalizeHandover(null);
  const one = v.roles.flatMap(r => r.duties).find(d => /따라체험.*1$/.test(d.text));
  const sib = siblingDuties(v, one.id).map(x => ({ ...x, duty: { ...x.duty, group: "g1" } }));
  const role = sib[0].role;
  assert.equal(stepPeople({ duty: { ...one, group: "g1" }, role, siblings: sib }).length, 2);
  assert.equal(stepPeople({ duty: one, role: { ownerId: "t1", ownerName: "가" }, siblings: [] }).length, 0);
  const ppl = stepPeople({ duty: { ...one, editors: [{ id: "t2", name: "나" }] }, role: { ownerId: "t1", ownerName: "가" }, siblings: [] });
  assert.deepEqual(ppl.map(p => p.label), ["가", "나"]);
  assert.ok(taskAsText({ steps: [newStep({ month: 3, title: "섭외", who: "t:t2" })] }, "x", id => (id === "t:t2" ? "나" : "")).includes("[나] 섭외"));
});
test("인수인계: 단계 내용 목록·메모로 나누기", async () => {
  const { formatDetail } = await import("../src/handover.js");
  const f = formatDetail("ⓐ 학생들의 진로 희망, ⓑ 상담 후 진로가 변경된 학생, ⓒ 인원수 분배 등을 고려\n*최대한 학기초에 진행\n- 시트에 정리\n일반 문장");
  assert.deepEqual(f.map(x => [x.type, x.marker || "", x.text]), [["li", "ⓐ", "학생들의 진로 희망"], ["li", "ⓑ", "상담 후 진로가 변경된 학생"], ["li", "ⓒ", "인원수 분배 등을 고려"], ["note", "", "최대한 학기초에 진행"], ["li", "•", "시트에 정리"], ["p", "", "일반 문장"]]);
});
test("인수인계: 부서 선생님(학년부 자동 + 더하기/빼기 + 담당은 늘 포함)", async () => {
  const { deptMembers } = await import("../src/handover.js");
  const t = [{ id: "a", roleGrade: "2" }, { id: "b", homeroomGrade: "2" }, { id: "c", roleGrade: "1" }, { id: "d" }, { id: "e", roleGrade: "2" }];
  const dept = { id: "g2", name: "2학년부", memberAdd: ["d"], memberRemove: ["e", "c"] };
  assert.deepEqual(deptMembers(dept, t, [{ deptId: "g2", ownerId: "c" }]).map(x => x.id), ["a", "b", "c", "d"]);
  assert.deepEqual(deptMembers({ id: "x", name: "교무부", memberAdd: ["c"] }, t, []).map(x => x.id), ["c"]);
});
