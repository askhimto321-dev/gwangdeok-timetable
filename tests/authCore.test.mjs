import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, signToken, readToken, checkLogin, markHashed, HASHED_PW, findAccount } from "../netlify/lib/authCore.mjs";
import { mergeAccountList } from "../src/accountsMerge.js";

test("비밀번호 암호화: 맞는 비밀번호만 통과, 매번 다른 소금", () => {
  const a = hashPassword("kd2026"), b = hashPassword("kd2026");
  assert.notEqual(a, b);
  assert.ok(!a.includes("kd2026"));
  assert.equal(verifyPassword("kd2026", a), true);
  assert.equal(verifyPassword("kd2027", a), false);
  assert.equal(verifyPassword("kd2026", "garbage"), false);
});

test("서명 토큰: 위조·만료·종류 다르면 거절", () => {
  const secret = "x".repeat(32);
  const token = signToken({ t: "s", k: "teacher", i: "kim", exp: Date.now() + 1000 }, secret);
  assert.equal(readToken(token, secret, "s").i, "kim");
  assert.equal(readToken(token, secret, "k"), null);
  assert.equal(readToken(token, "y".repeat(32), "s"), null);
  const [body, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ t: "s", k: "admin", i: "admin", exp: Date.now() + 1000 })).toString("base64url");
  assert.equal(readToken(`${forged}.${sig}`, secret, "s"), null);
  assert.equal(readToken(signToken({ t: "s", exp: Date.now() - 1 }, secret), secret, "s"), null);
  assert.ok(body);
});

test("로그인 확인: 예전 순서(관리자→교사→…) · 평문/암호 · 암호화 표시는 평문으로 안 맞음", async () => {
  const hash = hashPassword("secret1");
  const accounts = {
    admin: [{ id: "boss", pw: "a1" }],
    teacher: [{ id: "kim", pw: HASHED_PW }, { id: "lee", pw: "pw2" }],
    students: [{ id: "20101", pw: "kd2026" }],
  };
  const loadHash = async (kind, id) => (kind === "teacher" && id === "kim" ? hash : null);
  assert.deepEqual((await checkLogin(accounts, "kim", "secret1", loadHash)).via, "hash");
  assert.equal(await checkLogin(accounts, "kim", HASHED_PW, loadHash), null);
  assert.equal(await checkLogin(accounts, "kim", "wrong", loadHash), null);
  const lee = await checkLogin(accounts, " lee ", "pw2", loadHash);
  assert.equal(lee.kind, "teacher"); assert.equal(lee.via, "plain");
  assert.equal((await checkLogin(accounts, "20101", "kd2026", loadHash)).kind, "students");
  // 관리자가 없으면 초기 관리자 계정
  assert.equal((await checkLogin({ admin: [] }, "admin", "kd2026", loadHash)).kind, "admin");
  assert.equal((await checkLogin(accounts, "admin", "kd2026", loadHash)), null);
  assert.ok(findAccount(accounts, "teacher", "lee"));
});

test("공개 목록의 평문을 암호화 표시로: 그사이 비밀번호가 바뀌었으면 손대지 않음", () => {
  const accounts = { teacher: [{ id: "lee", pw: "pw2", name: "이" }, { id: "kim", pw: "x" }] };
  const next = markHashed(accounts, "teacher", "lee", "pw2");
  assert.equal(next.teacher[0].pw, HASHED_PW);
  assert.equal(next.teacher[0].name, "이");
  assert.equal(next.teacher[1].pw, "x");
  assert.equal(markHashed(accounts, "teacher", "lee", "other"), null);
});

test("계정 저장 합치기: 내가 비밀번호를 안 바꿨으면 서버가 바꾼 암호화 표시 유지", () => {
  const base = [{ id: "lee", pw: "pw2", subject: "수학" }];
  const mine = [{ id: "lee", pw: "pw2", subject: "물리" }];
  const theirs = [{ id: "lee", pw: HASHED_PW, subject: "수학" }];
  assert.deepEqual(mergeAccountList(base, mine, theirs), [{ id: "lee", pw: HASHED_PW, subject: "물리" }]);
  // 관리자가 새 비밀번호를 적으면 그 값
  const reset = [{ id: "lee", pw: "new1", subject: "수학" }];
  assert.deepEqual(mergeAccountList(base, reset, theirs), [{ id: "lee", pw: "new1", subject: "수학" }]);
});
