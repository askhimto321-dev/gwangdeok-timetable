// 로그인 서버(Netlify Functions) 공통: Firebase 관리자 연결·계정 읽기/쓰기·응답 도우미
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import crypto from "node:crypto";
import { idKey, markHashed, hashPassword } from "./authCore.mjs";

const PROJECT_ID = "kwangdeoktimetable";
const KV = "kd_timetable_kv";
// 서버만 읽고 쓰는 곳(비밀번호 암호·간편 로그인 연결·로그인 실패 횟수). 보안 규칙으로 브라우저 접근을 막습니다.
const AUTH = "kd_auth";

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function config() {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || "";
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n").replace(/^"|"$/g, "");
  const secret = process.env.SESSION_SECRET || "";
  if (!clientEmail || !privateKey.includes("PRIVATE KEY") || secret.length < 24) throw new HttpError(503, "로그인 서버 설정이 아직 끝나지 않았습니다.");
  return { clientEmail, privateKey, secret };
}

let cached = null;
export function admin() {
  if (cached) return cached;
  const { clientEmail, privateKey } = config();
  const app = getApps()[0] || initializeApp({ credential: cert({ projectId: PROJECT_ID, clientEmail, privateKey }), projectId: PROJECT_ID });
  cached = { db: getFirestore(app), auth: getAuth(app) };
  return cached;
}
export const secret = () => config().secret;

// ── 응답 ──
export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}
export function redirect(location, headers = {}) {
  return new Response(null, { status: 302, headers: { location, "cache-control": "no-store", ...headers } });
}
export async function readJson(req) {
  if (req.method !== "POST") throw new HttpError(405, "POST만 받습니다.");
  try { return await req.json(); } catch { throw new HttpError(400, "요청 형식이 올바르지 않습니다."); }
}
export function handle(fn) {
  return async (req, context) => {
    try { return await fn(req, context); }
    catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (!(error instanceof HttpError)) console.error("auth function error", error);
      return json({ ok: false, error: error instanceof HttpError ? error.message : "서버 오류가 났습니다. 잠시 뒤 다시 시도해주세요." }, status);
    }
  };
}
export function siteOrigin(req) {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

// ── 계정 목록(kd_accounts) — 화면과 같은 저장 형식(직접 저장 또는 분할 저장) ──
export async function readAccounts() {
  const { db } = admin();
  const snap = await db.collection(KV).doc("kd_accounts").get();
  if (!snap.exists) return {};
  const data = snap.data();
  if (!data.chunked) return JSON.parse(data.value || "{}");
  const parts = await Promise.all(Array.from({ length: Number(data.chunks) || 0 }, (_, index) => db.collection(KV).doc(`kd_accounts__chunk__${data.batchId}__${String(index).padStart(4, "0")}`).get()));
  return JSON.parse(Buffer.concat(parts.map(part => Buffer.from(part.data()?.data || "", "base64"))).toString("utf8"));
}

// 비밀번호를 암호화해 서버 전용 저장소에 두고, 공개 목록의 평문은 '암호화됨' 표시로 바꿉니다.
export async function storePasswordHash(kind, id, plain, { replaceVisible = true } = {}) {
  const { db } = admin();
  await db.collection(AUTH).doc(`pw__${kind}__${idKey(id)}`).set({ hash: hashPassword(plain), kind, at: new Date().toISOString() });
  if (!replaceVisible) return;
  const ref = db.collection(KV).doc("kd_accounts");
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data();
    if (data.chunked || typeof data.value !== "string") return; // 분할 저장된 큰 목록은 건드리지 않음
    const next = markHashed(JSON.parse(data.value), kind, id, plain);
    if (!next) return;
    const value = JSON.stringify(next);
    tx.set(ref, { value, chunked: false, byteLength: Buffer.byteLength(value), updatedAt: new Date().toISOString() });
  });
}
export async function loadPasswordHash(kind, id) {
  const snap = await admin().db.collection(AUTH).doc(`pw__${kind}__${idKey(id)}`).get();
  return snap.exists ? snap.data().hash : null;
}

// ── 로그인 실패 제한: 같은 아이디 15분에 10번 틀리면 15분 잠금 ──
const FAIL_WINDOW = 15 * 60 * 1000, FAIL_LIMIT = 10;
export async function checkFailLock(id) {
  const snap = await admin().db.collection(AUTH).doc(`fail__${idKey(id)}`).get();
  const data = snap.exists ? snap.data() : null;
  if (data && data.count >= FAIL_LIMIT && Date.now() - data.first < FAIL_WINDOW) throw new HttpError(429, "비밀번호를 여러 번 틀려 15분 동안 로그인할 수 없습니다.");
}
export async function recordFail(id) {
  const { db } = admin();
  const ref = db.collection(AUTH).doc(`fail__${idKey(id)}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    const fresh = !data || Date.now() - data.first >= FAIL_WINDOW;
    tx.set(ref, fresh ? { count: 1, first: Date.now() } : { count: (data.count || 0) + 1, first: data.first });
  });
}
export async function clearFail(id) {
  await admin().db.collection(AUTH).doc(`fail__${idKey(id)}`).delete().catch(() => null);
}

// ── 간편 로그인 연결(구글·카카오) ──
const linkDoc = (provider, uid) => `link__${provider}__${idKey(uid)}`;
const acctDoc = (kind, id) => `acct__${kind}__${idKey(id)}`;
export async function readLinkFor(provider, uid) {
  const snap = await admin().db.collection(AUTH).doc(linkDoc(provider, uid)).get();
  return snap.exists ? snap.data() : null;
}
export async function readAccountLinks(kind, id) {
  const snap = await admin().db.collection(AUTH).doc(acctDoc(kind, id)).get();
  return snap.exists ? snap.data() : {};
}
export async function linkProvider(kind, id, provider, uid, label) {
  const { db } = admin();
  const at = new Date().toISOString();
  await db.runTransaction(async tx => {
    const accRef = db.collection(AUTH).doc(acctDoc(kind, id));
    const linkRef = db.collection(AUTH).doc(linkDoc(provider, uid));
    const [accSnap, linkSnap] = await Promise.all([tx.get(accRef), tx.get(linkRef)]);
    const existing = linkSnap.exists ? linkSnap.data() : null;
    if (existing && (existing.kind !== kind || existing.id !== id)) throw new HttpError(409, "이 계정은 이미 다른 KDTIME 아이디에 연결되어 있습니다.");
    const old = accSnap.exists ? accSnap.data()?.[provider] : null;
    if (old?.uid && old.uid !== uid) tx.delete(db.collection(AUTH).doc(linkDoc(provider, old.uid)));
    tx.set(linkRef, { kind, id, provider, at });
    tx.set(accRef, { [provider]: { uid, label: label || "", at } }, { merge: true });
  });
}
export async function unlinkProvider(kind, id, provider) {
  const { db } = admin();
  const { FieldValue } = await import("firebase-admin/firestore");
  await db.runTransaction(async tx => {
    const accRef = db.collection(AUTH).doc(acctDoc(kind, id));
    const accSnap = await tx.get(accRef);
    const old = accSnap.exists ? accSnap.data()?.[provider] : null;
    if (old?.uid) tx.delete(db.collection(AUTH).doc(linkDoc(provider, old.uid)));
    if (accSnap.exists) tx.update(accRef, { [provider]: FieldValue.delete() });
  });
}

// 로그인 성공 → 세션(이 사이트 서명)·Firebase 로그인 토큰
export async function issueLogin(kind, id) {
  const { signToken } = await import("./authCore.mjs");
  const session = signToken({ t: "s", k: kind, i: String(id), exp: Date.now() + 90 * 86400000 }, secret());
  let firebaseToken = null;
  try { firebaseToken = await admin().auth.createCustomToken(`${kind}.${idKey(id)}`.slice(0, 128), { kdk: kind, kdi: String(id) }); }
  catch (error) { console.warn("custom token unavailable", error?.message || error); }
  return { ok: true, kind, id: String(id), session, firebaseToken };
}
export const randomId = () => crypto.randomBytes(16).toString("base64url");
