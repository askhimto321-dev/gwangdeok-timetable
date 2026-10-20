// 로그인 서버 함수(Netlify Functions)를 가짜 Firestore·가짜 카카오로 실제처럼 돌려 봅니다.
// node --experimental-test-module-mocks 필요(npm test에 들어 있음)
import test, { mock } from "node:test";
import assert from "node:assert/strict";

const store = new Map(); // "collection/doc" → data
const DELETE = Symbol("delete");
const ref = (col, id) => ({
  path: `${col}/${id}`,
  async get() { const data = store.get(this.path); return { exists: data !== undefined, data: () => data && structuredClone(data) }; },
  async set(data, opt) { store.set(this.path, opt?.merge ? { ...(store.get(this.path) || {}), ...data } : data); },
  async delete() { store.delete(this.path); },
});
const applyUpdate = (path, patch) => { const next = { ...(store.get(path) || {}) }; Object.entries(patch).forEach(([k, v]) => { if (v === DELETE) delete next[k]; else next[k] = v; }); store.set(path, next); };
const fakeDb = {
  collection: col => ({ doc: id => ref(col, id) }),
  async runTransaction(fn) {
    const ops = [];
    const tx = { get: r => r.get(), set: (r, d, o) => ops.push(() => r.set(d, o)), update: (r, d) => ops.push(() => applyUpdate(r.path, d)), delete: r => ops.push(() => r.delete()) };
    const out = await fn(tx);
    for (const op of ops) await op();
    return out;
  },
};
const idTokens = new Map();
mock.module("firebase-admin/app", { namedExports: { initializeApp: () => ({}), getApps: () => [], cert: x => x } });
mock.module("firebase-admin/firestore", { namedExports: { getFirestore: () => fakeDb, FieldValue: { delete: () => DELETE } } });
mock.module("firebase-admin/auth", { namedExports: { getAuth: () => ({ createCustomToken: async uid => `custom:${uid}`, verifyIdToken: async t => { if (!idTokens.has(t)) throw new Error("bad"); return idTokens.get(t); } }) } });

process.env.FIREBASE_CLIENT_EMAIL = "svc@test";
{
  const { generateKeyPairSync } = await import("node:crypto");
  process.env.FIREBASE_PRIVATE_KEY = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } }).privateKey.replace(/\n/g, "\\n");
}
process.env.SESSION_SECRET = "s".repeat(48);
process.env.KAKAO_REST_API_KEY = "rest-key";
process.env.KAKAO_CLIENT_SECRET = "kakao-secret";

const { HASHED_PW } = await import("../src/accountSecret.js");
const login = (await import("../netlify/functions/auth-login.mjs")).default;
const password = (await import("../netlify/functions/auth-password.mjs")).default;
const google = (await import("../netlify/functions/auth-google.mjs")).default;
const links = (await import("../netlify/functions/auth-links.mjs")).default;
const kakaoStart = (await import("../netlify/functions/auth-kakao-start.mjs")).default;
const kakaoCallback = (await import("../netlify/functions/auth-kakao-callback.mjs")).default;

const ORIGIN = "https://kdtime.netlify.app";
const post = (fn, path, body) => fn(new Request(`${ORIGIN}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
const accounts = () => JSON.parse(store.get("kd_timetable_kv/kd_accounts").value);
function seed() {
  store.clear();
  const value = JSON.stringify({ admin: [{ id: "boss", pw: "a1" }], teacher: [{ id: "kim", pw: "pw1", name: "김" }, { id: "lee", pw: "pw2" }], students: [{ id: "20101", pw: "kd2026" }] });
  store.set("kd_timetable_kv/kd_accounts", { value, chunked: false });
}

test("아이디 로그인 → 평문은 암호화로 옮기고, 다음부터 암호로 확인", async () => {
  seed();
  let res = await post(login, "/api/auth/login", { id: "kim", pw: "pw1" });
  let data = await res.json();
  assert.equal(res.status, 200); assert.equal(data.kind, "teacher"); assert.ok(data.session); assert.equal(data.firebaseToken.startsWith("custom:"), true);
  assert.equal(accounts().teacher[0].pw, HASHED_PW);
  assert.equal(accounts().teacher[0].name, "김");
  assert.equal(accounts().teacher[1].pw, "pw2");
  const saved = [...store.entries()].find(([k]) => k.startsWith("kd_auth/pw__teacher__"));
  assert.ok(saved && !JSON.stringify(saved).includes("pw1"));
  res = await post(login, "/api/auth/login", { id: "kim", pw: "pw1" });
  assert.equal(res.status, 200);
  res = await post(login, "/api/auth/login", { id: "kim", pw: HASHED_PW });
  assert.equal(res.status, 401);
  res = await post(login, "/api/auth/login", { id: "kim", pw: "nope" });
  assert.equal(res.status, 401);
});

test("10번 틀리면 잠금", async () => {
  seed();
  for (let i = 0; i < 10; i++) await post(login, "/api/auth/login", { id: "lee", pw: "x" });
  const res = await post(login, "/api/auth/login", { id: "lee", pw: "pw2" });
  assert.equal(res.status, 429);
});

test("비밀번호 바꾸기: 현재 비밀번호 확인 · 공개 목록엔 평문 없음", async () => {
  seed();
  const { session } = await (await post(login, "/api/auth/login", { id: "lee", pw: "pw2" })).json();
  assert.equal((await post(password, "/api/auth/password", { session, current: "bad", next: "newpw" })).status, 401);
  assert.equal((await post(password, "/api/auth/password", { session, current: "pw2", next: "newpw" })).status, 200);
  assert.equal(accounts().teacher[1].pw, HASHED_PW);
  assert.equal((await post(login, "/api/auth/login", { id: "lee", pw: "pw2" })).status, 401);
  assert.equal((await post(login, "/api/auth/login", { id: "lee", pw: "newpw" })).status, 200);
  assert.equal((await post(password, "/api/auth/password", { session: "forged.sig", current: "newpw", next: "x1234" })).status, 401);
  // 관리자가 평문으로 새 비밀번호를 넣으면 그 값이 이깁니다
  const acc = accounts(); acc.teacher[1].pw = "reset1";
  store.set("kd_timetable_kv/kd_accounts", { value: JSON.stringify(acc), chunked: false });
  assert.equal((await post(login, "/api/auth/login", { id: "lee", pw: "reset1" })).status, 200);
  assert.equal((await post(login, "/api/auth/login", { id: "lee", pw: "newpw" })).status, 401);
});

test("구글: 연결 전엔 로그인 안 됨 → 연결 → 구글로 로그인 → 끊기", async () => {
  seed();
  idTokens.set("g1", { uid: "guid1", email: "kim@school.kr", firebase: { sign_in_provider: "google.com" } });
  idTokens.set("anon", { uid: "a", firebase: { sign_in_provider: "anonymous" } });
  let res = await post(google, "/api/auth/google", { idToken: "g1", mode: "login" });
  assert.equal(res.status, 404);
  assert.equal((await post(google, "/api/auth/google", { idToken: "anon", mode: "login" })).status, 400);
  assert.equal((await post(google, "/api/auth/google", { idToken: "zzz", mode: "login" })).status, 401);
  const { session } = await (await post(login, "/api/auth/login", { id: "kim", pw: "pw1" })).json();
  assert.equal((await post(google, "/api/auth/google", { idToken: "g1", mode: "link" })).status, 401); // 세션 없이 연결 불가
  res = await post(google, "/api/auth/google", { idToken: "g1", mode: "link", session });
  assert.equal(res.status, 200);
  res = await post(google, "/api/auth/google", { idToken: "g1", mode: "login" });
  const data = await res.json();
  assert.equal(data.kind, "teacher"); assert.equal(data.id, "kim");
  // 다른 계정이 같은 구글 계정을 연결하려 하면 거절
  const other = (await (await post(login, "/api/auth/login", { id: "lee", pw: "pw2" })).json()).session;
  assert.equal((await post(google, "/api/auth/google", { idToken: "g1", mode: "link", session: other })).status, 409);
  let view = await (await post(links, "/api/auth/links", { session })).json();
  assert.equal(view.links.google.label, "kim@school.kr"); assert.equal(view.links.kakao, null);
  view = await (await post(links, "/api/auth/links", { session, action: "unlink", provider: "google" })).json();
  assert.equal(view.links.google, null);
  assert.equal((await post(google, "/api/auth/google", { idToken: "g1", mode: "login" })).status, 404);
});

test("카카오: 연결 → 카카오로 로그인(1회용 표) · 다른 브라우저 쿠키면 거절", async () => {
  seed();
  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push(String(url));
    if (String(url).startsWith("https://kauth.kakao.com/oauth/token")) {
      const form = new URLSearchParams(init.body);
      assert.equal(form.get("client_secret"), "kakao-secret");
      assert.equal(form.get("redirect_uri"), `${ORIGIN}/api/auth/kakao/callback`);
      return Response.json(form.get("code") === "good" ? { access_token: "at" } : { error: "invalid_grant" }, { status: form.get("code") === "good" ? 200 : 400 });
    }
    if (String(url).startsWith("https://kapi.kakao.com/v2/user/me")) return Response.json({ id: 777, kakao_account: { profile: { nickname: "김쌤" } } });
    if (String(url).startsWith("https://kapi.kakao.com/v1/user/logout")) return Response.json({ id: 777 });
    throw new Error(`unexpected ${url}`);
  };
  try {
    const { session } = await (await post(login, "/api/auth/login", { id: "kim", pw: "pw1" })).json();
    const start = async (mode, extra = {}) => {
      const res = await post(kakaoStart, "/api/auth/kakao/start", { mode, ...extra });
      const data = await res.json();
      const cookie = /kd_ks=([^;]+)/.exec(res.headers.get("set-cookie"))[1];
      const url = new URL(data.url);
      assert.equal(url.searchParams.get("client_id"), "rest-key");
      return { state: url.searchParams.get("state"), cookie };
    };
    const callback = (state, cookie, code = "good") => kakaoCallback(new Request(`${ORIGIN}/api/auth/kakao/callback?code=${code}&state=${encodeURIComponent(state)}`, { headers: { cookie: `kd_ks=${cookie}` } }));
    const hashOf = res => new URLSearchParams(new URL(res.headers.get("location")).hash.slice(1));

    let s = await start("login");
    let back = hashOf(await callback(s.state, s.cookie));
    assert.equal(back.get("kdauth_error"), "kakao-unlinked");

    s = await start("link", { session });
    assert.equal(hashOf(await callback(s.state, "other-browser")).get("kdauth_error"), "kakao-expired");
    assert.equal(hashOf(await callback(s.state, s.cookie, "bad")).get("kdauth_error"), "kakao-failed");
    back = hashOf(await callback(s.state, s.cookie));
    assert.equal(back.get("kdauth_linked"), "kakao");

    s = await start("login");
    back = hashOf(await callback(s.state, s.cookie));
    const ticket = back.get("kdauth_ticket");
    assert.ok(ticket);
    const data = await (await post(login, "/api/auth/login", { ticket })).json();
    assert.equal(data.kind, "teacher"); assert.equal(data.id, "kim");
    assert.equal((await post(login, "/api/auth/login", { ticket: ticket + "x" })).status, 401);
    assert.ok(seen.some(url => url.includes("/v1/user/logout")));
  } finally { globalThis.fetch = realFetch; }
});

test("서버 설정이 없으면 503(화면은 예전 방식으로)", async () => {
  const keep = process.env.SESSION_SECRET;
  delete process.env.SESSION_SECRET;
  // 이미 연결된 상태여도 설정 확인은 매번 합니다
  const res = await post(links, "/api/auth/links", { session: "x" });
  assert.equal(res.status, 503);
  process.env.SESSION_SECRET = keep;
});

test("설정 점검: 값은 보여 주지 않고 있음/없음만", async () => {
  const status = (await import("../netlify/functions/auth-status.mjs")).default;
  const text = await (await status()).text();
  const body = JSON.parse(text);
  assert.equal(body.KAKAO_REST_API_KEY, "있음");
  assert.equal(body.SESSION_SECRET, "있음");
  assert.ok(!text.includes("rest-key") && !text.includes("kakao-secret") && !text.includes("ssss"));
});
