// POST /api/auth/login  { id, pw } 또는 { ticket }(카카오 로그인 뒤 1회용 표)
import { checkLoginAll, readToken } from "../lib/authCore.mjs";
import { priorRoles, withImplied } from "../lib/session.mjs";
import { handle, readJson, json, readAccounts, loadPasswordHash, storePasswordHash, checkFailLock, recordFail, clearFail, issueLogin, secret, HttpError, authOptions } from "../lib/kdServer.mjs";
import { findAccount } from "../lib/authCore.mjs";

export default handle(async req => {
  const body = await readJson(req);
  if (body.ticket) {
    const ticket = readToken(body.ticket, secret(), "k");
    if (!ticket) throw new HttpError(401, "로그인 시간이 지났습니다. 다시 시도해주세요.");
    const accounts = await readAccounts();
    if (!findAccount(accounts, ticket.k, ticket.i, authOptions())) throw new HttpError(401, "연결된 계정을 찾을 수 없습니다.");
    return json(await issueLogin(ticket.k, ticket.i, withImplied(ticket.k, ticket.i, priorRoles(body.session, accounts), accounts)));
  }
  const id = String(body.id || "").trim();
  const pw = String(body.pw || "");
  if (!id || !pw) throw new HttpError(400, "아이디와 비밀번호를 입력해주세요.");
  await checkFailLock(id);
  const accounts = await readAccounts();
  // 같은 아이디·비밀번호가 맞는 역할은 모두 켭니다(예: 관리자이면서 선생님).
  const matches = await checkLoginAll(accounts, id, pw, loadPasswordHash, authOptions());
  const match = matches[0];
  if (!match) {
    await recordFail(id).catch(() => null);
    return json({ ok: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." }, 401);
  }
  await clearFail(id);
  // 평문으로 맞았으면 이번에 암호화해 옮깁니다(실패해도 로그인은 진행).
  for (const item of matches) if (item.via === "plain") await storePasswordHash(item.entry?.hashKind || item.kind, id, pw).catch(error => console.warn("hash migrate failed", error?.message || error));
  // 이미 다른 역할로 로그인해 있었으면(올바른 세션) 그 역할도 함께 이어 갑니다.
  const extras = [...matches.slice(1).map(item => ({ kind: item.kind, id })), ...priorRoles(body.session, accounts)];
  return json(await issueLogin(match.kind, id, withImplied(match.kind, id, extras, accounts)));
});

export const config = { path: "/api/auth/login" };
