// 로그인 서버 공통 계산(파이어베이스 없이 동작 — node 테스트용)
import crypto from "node:crypto";
import { HASHED_PW } from "../../src/accountSecret.js";

export { HASHED_PW };
// 로그인 확인 순서(예전 화면 로그인과 같음)
export const LOGIN_KINDS = ["admin", "teacher", "departments", "monitors", "classView", "students"];
export const DEFAULT_ADMIN = { id: "admin", pw: "kd2026" };

export const idKey = id => Buffer.from(String(id), "utf8").toString("base64url");

// ── 비밀번호 암호화(scrypt) ──
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}
export function verifyPassword(pw, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64url");
  const got = crypto.scryptSync(String(pw), Buffer.from(salt, "base64url"), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}
export function sameText(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// ── 서명 토큰(세션·카카오 state·1회용 로그인 표) ──
export function signToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}
export function readToken(token, secret, type, now = Date.now()) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig || !secret) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (!sameText(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (type && payload.t !== type) return null;
    if (!payload.exp || payload.exp < now) return null;
    return payload;
  } catch { return null; }
}

// 계정 목록에서 아이디가 같은 계정들(확인 순서대로)
export function candidates(accounts, id) {
  const list = [];
  LOGIN_KINDS.forEach(kind => {
    let entries = Array.isArray(accounts?.[kind]) ? accounts[kind] : [];
    if (kind === "admin" && !entries.length) entries = [DEFAULT_ADMIN];
    entries.forEach(entry => { if (entry && String(entry.id ?? "") === id) list.push({ kind, entry }); });
  });
  return list;
}
export function findAccount(accounts, kind, id) {
  const entries = Array.isArray(accounts?.[kind]) ? accounts[kind] : [];
  const list = kind === "admin" && !entries.length ? [DEFAULT_ADMIN] : entries;
  return list.find(entry => String(entry?.id ?? "") === String(id)) || null;
}

// 아이디·비밀번호 확인. loadHash(kind, id) → 저장된 암호 문자열.
// 결과 { kind, entry, via: "plain"|"hash" } 또는 null
export async function checkLogin(accounts, idRaw, pw, loadHash) {
  const id = String(idRaw || "").trim();
  if (!id || !pw) return null;
  for (const { kind, entry } of candidates(accounts, id)) {
    if (entry.pw === HASHED_PW) {
      const stored = await loadHash(kind, id);
      if (stored && verifyPassword(pw, stored)) return { kind, entry, via: "hash" };
    } else if (typeof entry.pw === "string" && entry.pw && sameText(entry.pw, pw)) {
      return { kind, entry, via: "plain" };
    }
  }
  return null;
}

// 공개 계정 목록에서 그 계정 비밀번호를 '암호화됨' 표시로 바꿉니다(평문이 그대로일 때만).
export function markHashed(accounts, kind, id, plain) {
  const entries = Array.isArray(accounts?.[kind]) ? accounts[kind] : null;
  if (!entries) return null;
  let changed = false;
  const next = entries.map(entry => {
    if (String(entry?.id ?? "") !== String(id) || entry.pw !== plain) return entry;
    changed = true;
    return { ...entry, pw: HASHED_PW };
  });
  return changed ? { ...accounts, [kind]: next } : null;
}
