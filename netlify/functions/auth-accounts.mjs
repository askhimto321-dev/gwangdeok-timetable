// POST /api/auth/accounts
//  { op: "save", session, accounts } — 계정 목록 저장(역할에 맞는 변경만 반영, 비밀번호는 암호로 보관)
//  { op: "sync" } — 공개용 목록(비밀번호 칸 없음)을 다시 만들고, 남아 있던 평문 비밀번호를 암호로 옮깁니다
// 원본(kd_accounts)은 서버만 쓰고, 화면은 공개용(kd_accounts_public)만 읽습니다.
import { handle, readJson, json, storePasswordHash, HttpError } from "../lib/kdServer.mjs";
import { requireSession } from "../lib/session.mjs";
import { readKv, writeKv } from "../lib/kv.mjs";
import { applyAccountChange, publicAccounts, AccountChangeError } from "../lib/accountsCore.mjs";

async function commit(who, stored, submitted) {
  let result;
  try { result = applyAccountChange(who, stored, submitted, { limit: SEAL_LIMIT }); }
  catch (error) { if (error instanceof AccountChangeError) throw new HttpError(error.status, error.message); throw error; }
  // 암호를 먼저 보관한 뒤 목록에 '암호화됨' 표시를 씁니다(그 사이 로그인이 끊기지 않게).
  for (let i = 0; i < result.plain.length; i += 10) {
    await Promise.all(result.plain.slice(i, i + 10).map(({ kind, id, pw }) => storePasswordHash(kind, id, pw, { replaceVisible: false })));
  }
  await writeKv("kd_accounts", result.next);
  const shown = publicAccounts(result.next);
  await writeKv("kd_accounts_public", shown);
  return { accounts: shown, deferred: result.deferred };
}
// 한 번에 암호화할 비밀번호 수(서버 함수 시간 제한 안에서). 남은 건 화면이 'sync'로 이어서 요청합니다.
const SEAL_LIMIT = 50;

export default handle(async req => {
  const body = await readJson(req);
  const stored = (await readKv("kd_accounts", {})) || {};
  if (body.op === "sync") return json({ ok: true, ...(await commit({ kind: "admin" }, stored, stored)) });
  if (body.op === "save") {
    const { kind, id } = await requireSession(body.session);
    if (!body.accounts || typeof body.accounts !== "object") throw new HttpError(400, "저장할 계정 목록이 없어요.");
    return json({ ok: true, ...(await commit({ kind, id }, stored, body.accounts)) });
  }
  throw new HttpError(400, "요청 종류가 올바르지 않아요.");
});

export const config = { path: "/api/auth/accounts" };
