import test from "node:test";
import assert from "node:assert/strict";
import { mergeAccounts } from "../src/accountsMerge.js";

const t = (id, extra = {}) => ({ id, pw: "x", name: id, teacherRole: "other", gradeAccessGrades: [], ...extra });

test("다른 화면의 옛 계정으로 저장해도 관리자가 준 성적 권한이 남음", () => {
  const base = { teacher: [t("baek"), t("kim")], students: [] };
  const theirs = { teacher: [t("baek", { gradeAccessGrades: ["2"] }), t("kim")], students: [] };
  // 김 선생님이 '내 정보'에서 담당 과목만 바꿔 저장
  const mine = { teacher: [t("baek"), t("kim", { assignments: [{ subject: "대수" }] })], students: [] };
  const out = mergeAccounts(base, mine, theirs);
  assert.deepEqual(out.teacher.find(x => x.id === "baek").gradeAccessGrades, ["2"]);
  assert.equal(out.teacher.find(x => x.id === "kim").assignments[0].subject, "대수");
});

test("학생 계정만 바꾼 저장은 교사 목록을 건드리지 않음", () => {
  const base = { teacher: [t("baek")], students: [{ id: "20101" }] };
  const theirs = { teacher: [t("baek", { gradeAccessGrades: ["2"] }), t("new")], students: [{ id: "20101" }] };
  const mine = { teacher: [t("baek")], students: [{ id: "20101" }, { id: "20102" }] };
  const out = mergeAccounts(base, mine, theirs);
  assert.deepEqual(out.teacher.map(x => x.id), ["baek", "new"]);
  assert.deepEqual(out.teacher[0].gradeAccessGrades, ["2"]);
  assert.deepEqual(out.students.map(x => x.id), ["20101", "20102"]);
});

test("추가·삭제는 내 변경대로, 승인 대기 처리도 반영", () => {
  const base = { teacher: [t("a"), t("b")], teacherPending: [t("p")] };
  const theirs = { teacher: [t("a"), t("b"), t("c")], teacherPending: [t("p"), t("q")] };
  const mine = { teacher: [t("a"), t("p")], teacherPending: [] };
  const out = mergeAccounts(base, mine, theirs);
  assert.deepEqual(out.teacher.map(x => x.id), ["a", "c", "p"]);
  assert.deepEqual(out.teacherPending.map(x => x.id), ["q"]);
});
