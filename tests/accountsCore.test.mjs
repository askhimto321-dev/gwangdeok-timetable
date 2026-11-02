import test from "node:test";
import assert from "node:assert/strict";
import { applyAccountChange, publicAccounts } from "../netlify/lib/accountsCore.mjs";
import { HASHED_PW } from "../netlify/lib/authCore.mjs";

const stored = {
  admin: [{ id: "boss", pw: HASHED_PW }],
  teacher: [{ id: "kim", pw: "old-plain", teacherRole: "homeroom", homeroomClass: "3", assignments: [], gradeAccessGrades: ["2"] }, { id: "lee", pw: HASHED_PW, teacherRole: "other", assignments: [] }],
  students: [{ id: "20101", pw: HASHED_PW, name: "가" }],
  monitors: [],
};

test("공개용 목록에는 비밀번호가 없음", () => {
  const shown = publicAccounts(stored);
  assert.equal(shown.teacher[0].pw, HASHED_PW);
  assert.ok(!JSON.stringify(shown).includes("old-plain"));
});

test("관리자: 새 비밀번호는 암호화 목록으로 빼고, 빈칸·암호화 표시는 기존 값 유지", () => {
  const submitted = { ...stored, students: [{ id: "20101", pw: HASHED_PW, name: "가" }, { id: "20102", pw: "newcode1", name: "나" }], teacher: stored.teacher.map(t => ({ ...t, pw: t.id === "lee" ? "" : HASHED_PW })) };
  const { next, plain } = applyAccountChange({ kind: "admin", id: "boss" }, stored, submitted);
  assert.equal(next.students[1].pw, HASHED_PW);
  assert.ok(plain.some(p => p.kind === "students" && p.id === "20102" && p.pw === "newcode1"));
  // 저장돼 있던 평문(kim)도 함께 암호화
  assert.ok(plain.some(p => p.kind === "teacher" && p.id === "kim" && p.pw === "old-plain"));
  assert.ok(!JSON.stringify(next).includes("old-plain"));
  assert.equal(next.teacher.find(t => t.id === "lee").pw, HASHED_PW);
});

test("관리자: 관리자 계정을 모두 지울 수는 없음", () => {
  assert.throws(() => applyAccountChange({ kind: "admin", id: "boss" }, stored, { ...stored, admin: [] }));
});

test("선생님: 자기 담당 과목·담임 반만 바뀌고 다른 계정·권한은 그대로", () => {
  const submitted = {
    ...stored,
    admin: [{ id: "boss", pw: "hacked" }, { id: "evil", pw: "x" }],
    teacher: [{ ...stored.teacher[0], assignments: [{ subject: "문학" }], homeroomClass: "5", gradeAccessGrades: ["1", "2", "3"], teacherRole: "gradeHead" }, { ...stored.teacher[1], assignments: [{ subject: "x" }] }],
    students: [],
  };
  const { next } = applyAccountChange({ kind: "teacher", id: "kim" }, stored, submitted);
  assert.equal(next.admin.length, 1);
  assert.equal(next.admin[0].pw, HASHED_PW);
  assert.equal(next.students.length, 1);
  const kim = next.teacher.find(t => t.id === "kim");
  assert.deepEqual(kim.assignments, [{ subject: "문학" }]);
  assert.equal(kim.homeroomClass, "5");
  assert.deepEqual(kim.gradeAccessGrades, ["2"]);
  assert.equal(kim.teacherRole, "homeroom");
  assert.deepEqual(next.teacher.find(t => t.id === "lee").assignments, []);
});

test("선생님: 교과부장 지정은 반영되고 비밀번호는 암호화", () => {
  const { next, plain } = applyAccountChange({ kind: "teacher", id: "lee" }, stored, { ...stored, monitors: [{ id: "20101", pw: "mon123", subject: "대수" }] });
  assert.equal(next.monitors[0].pw, HASHED_PW);
  assert.ok(plain.some(p => p.kind === "monitors" && p.pw === "mon123"));
});

test("학생·부서 계정은 계정 목록을 바꿀 수 없음", () => {
  assert.throws(() => applyAccountChange({ kind: "students", id: "20101" }, stored, stored));
});

test("한 번에 암호화하는 수 제한: 넘는 건 평문으로 남겨 다음에", () => {
  const many = { admin: [{ id: "boss", pw: HASHED_PW }], students: Array.from({ length: 7 }, (_, i) => ({ id: `2010${i}`, pw: `code${i}` })) };
  const { next, plain, deferred } = applyAccountChange({ kind: "admin", id: "boss" }, many, many, { limit: 3 });
  assert.equal(plain.length, 3); assert.equal(deferred, 4);
  assert.equal(next.students.filter(s => s.pw === HASHED_PW).length, 3);
  const round2 = applyAccountChange({ kind: "admin", id: "boss" }, next, next, { limit: 3 });
  assert.equal(round2.plain.length, 3); assert.equal(round2.deferred, 1);
});

test("관리자 계정과 아이디가 같은 선생님 계정은 '관리자 권한'으로 합침", async () => {
  const { checkLoginAll, findAccount } = await import("../netlify/lib/authCore.mjs");
  const before = { admin: [{ id: "kim", pw: HASHED_PW, permissions: ["accounts"] }, { id: "boss", pw: HASHED_PW, permissions: [] }], teacher: [{ id: "kim", pw: "tpw", name: "김" }] };
  const { next } = applyAccountChange({ kind: "admin", id: "boss" }, before, before);
  assert.deepEqual(next.admin.map(a => a.id), ["boss"]);
  assert.deepEqual(next.teacher[0].adminPermissions, ["accounts"]);
  // 선생님 비밀번호 하나로 관리자·선생님 두 역할(암호는 선생님 쪽)
  const hashes = { "teacher|kim": null };
  const accounts = { ...next, teacher: [{ ...next.teacher[0], pw: "tpw" }] };
  const roles = await checkLoginAll(accounts, "kim", "tpw", async (kind, id) => hashes[`${kind}|${id}`]);
  assert.deepEqual(roles.map(r => r.kind), ["admin", "teacher"]);
  assert.ok(findAccount(accounts, "admin", "kim"));
});
