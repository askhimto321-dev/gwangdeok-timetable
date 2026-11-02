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
  // 코드에 박힌 기본 관리자 비밀번호는 없음: 관리자가 없을 때도 서버 환경변수(12자 이상)로만 첫 관리자 로그인
  assert.equal(await checkLogin({ admin: [] }, "admin", "kd2026", loadHash), null);
  const boot = { bootstrapPw: "first-admin-pass" };
  assert.equal((await checkLogin({ admin: [] }, "admin", "first-admin-pass", loadHash, boot)).kind, "admin");
  assert.equal(await checkLogin({ admin: [] }, "admin", "short", loadHash, { bootstrapPw: "short" }), null);
  assert.equal(await checkLogin(accounts, "admin", "first-admin-pass", loadHash, boot), null);
  assert.ok(findAccount({ admin: [] }, "admin", "admin", boot));
  assert.equal(findAccount({ admin: [] }, "admin", "admin"), null);
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

test("비밀 키 붙여 넣기 실수 바로잡기", async () => {
  const crypto = await import("node:crypto");
  const { normalizePrivateKey, describePrivateKey } = await import("../netlify/lib/authCore.mjs");
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const escaped = privateKey.replace(/\n/g, "\\n");
  const body = privateKey.replace(/-----[A-Z ]+-----/g, "").replace(/\s/g, "");
  const variants = [
    privateKey, escaped, `"${escaped}"`, `"${escaped}",`,
    `"private_key": "${escaped}",`,
    escaped.replace("-----BEGIN", "----BEGIN").replace("KEY-----\\n-----END", "KEY----\\n-----END"),
    escaped.replace(/^-----BEGIN PRIVATE KEY-----\\n/, ""),
    body,
    privateKey.replace(/\n/g, "\r\n"),
  ];
  for (const v of variants) {
    const key = normalizePrivateKey(v);
    assert.doesNotThrow(() => crypto.createPrivateKey(key), v.slice(0, 40));
    assert.equal(describePrivateKey(v), "있음");
  }
  assert.equal(normalizePrivateKey("abc"), "");
  assert.match(describePrivateKey("abc"), /형식 확인 필요/);
  assert.equal(describePrivateKey(""), "없음");
});

test("초기 비밀번호: 계정마다 다른 8자리, 헷갈리는 글자 없음", async () => {
  const { randomInitialPassword } = await import("../src/accountSecret.js");
  const codes = Array.from({ length: 200 }, () => randomInitialPassword());
  assert.equal(new Set(codes).size, 200);
  codes.forEach(code => { assert.equal(code.length, 8); assert.match(code, /^[a-hjkmnp-z2-9]+$/); });
});

test("같은 아이디·비밀번호가 맞는 역할은 모두(관리자이면서 선생님)", async () => {
  const { checkLoginAll, bestRole } = await import("../netlify/lib/authCore.mjs");
  const accounts = { admin: [{ id: "kim", pw: "same" }], teacher: [{ id: "kim", pw: "same" }, { id: "lee", pw: "x" }] };
  const all = await checkLoginAll(accounts, "kim", "same", async () => null);
  assert.deepEqual(all.map(m => m.kind), ["admin", "teacher"]);
  assert.deepEqual((await checkLoginAll({ admin: [{ id: "kim", pw: "a" }], teacher: [{ id: "kim", pw: "b" }] }, "kim", "b", async () => null)).map(m => m.kind), ["teacher"]);
  assert.equal(bestRole([{ kind: "teacher", id: "kim" }, { kind: "admin", id: "kim" }]).kind, "admin");
});

test("관리자 권한이 있는 선생님은 카카오·구글 로그인에도 관리자 역할", async () => {
  const { impliedRoles } = await import("../netlify/lib/authCore.mjs");
  const accounts = { teacher: [{ id: "kim", adminPermissions: [] }, { id: "lee" }] };
  assert.deepEqual(impliedRoles(accounts, "teacher", "kim"), [{ kind: "admin", id: "kim" }]);
  assert.deepEqual(impliedRoles(accounts, "teacher", "lee"), []);
  assert.deepEqual(impliedRoles(accounts, "departments", "kim"), []);
  // 아직 합쳐지지 않은 예전 관리자 계정(같은 아이디)
  const unmerged = { admin: [{ id: "park" }], teacher: [{ id: "park" }, { id: "choi" }] };
  assert.deepEqual(impliedRoles(unmerged, "teacher", "park"), [{ kind: "admin", id: "park" }]);
  assert.deepEqual(impliedRoles(unmerged, "teacher", "choi"), []);
});

test("linkOwner: 관리자 겸 선생님은 선생님 역할에 간편 로그인 연결", async () => {
  const { linkOwner } = await import("../netlify/lib/session.mjs");
  assert.deepEqual(linkOwner({ kind: "admin", id: "K", extras: [{ kind: "teacher", id: "K" }] }), { kind: "teacher", id: "K" });
  assert.deepEqual(linkOwner({ kind: "teacher", id: "K", extras: [{ kind: "admin", id: "K" }] }), { kind: "teacher", id: "K" });
  assert.deepEqual(linkOwner({ kind: "admin", id: "A" }), { kind: "admin", id: "A" });
});
