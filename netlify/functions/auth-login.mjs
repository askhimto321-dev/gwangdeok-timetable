// POST /api/auth/login  { id, pw } 또는 { ticket }(카카오 로그인 뒤 1회용 표)
import { checkLogin, readToken } from "../lib/authCore.mjs";
import { handle, readJson, json, readAccounts, loadPasswordHash, storePasswordHash, checkFailLock, recordFail, clearFail, issueLogin, secret, HttpError } from "../lib/kdServer.mjs";
import { findAccount } from "../lib/authCore.mjs";

export default handle(async req => {
  const body = await readJson(req);
  if (body.ticket) {
    const ticket = readToken(body.ticket, secret(), "k");
    if (!ticket) throw new HttpError(401, "로그인 시간이 지났습니다. 다시 시도해주세요.");
    const accounts = await readAccounts();
    if (!findAccount(accounts, ticket.k, ticket.i)) throw new HttpError(401, "연결된 계정을 찾을 수 없습니다.");
    return json(await issueLogin(ticket.k, ticket.i));
  }
  const id = String(body.id || "").trim();
  const pw = String(body.pw || "");
  if (!id || !pw) throw new HttpError(400, "아이디와 비밀번호를 입력해주세요.");
  await checkFailLock(id);
  const accounts = await readAccounts();
  const match = await checkLogin(accounts, id, pw, loadPasswordHash);
  if (!match) {
    await recordFail(id).catch(() => null);
    return json({ ok: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." }, 401);
  }
  await clearFail(id);
  // 평문으로 맞았으면 이번에 암호화해 옮깁니다(실패해도 로그인은 진행).
  if (match.via === "plain") await storePasswordHash(match.kind, id, pw).catch(error => console.warn("hash migrate failed", error?.message || error));
  return json(await issueLogin(match.kind, id));
});

export const config = { path: "/api/auth/login" };
