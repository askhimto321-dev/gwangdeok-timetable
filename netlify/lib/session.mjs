import { readToken, findAccount } from "./authCore.mjs";
import { secret, readAccounts, HttpError, authOptions, assertKindAllowed } from "./kdServer.mjs";

// 화면이 보낸 세션(서명 토큰)을 확인하고, 그 계정이 아직 있는지 봅니다.
export async function requireSession(token) {
  const payload = readToken(token, secret(), "s");
  if (!payload) throw new HttpError(401, "로그인이 만료되었습니다. 다시 로그인해주세요.");
  assertKindAllowed(payload.k);
  const accounts = await readAccounts();
  const entry = findAccount(accounts, payload.k, payload.i, authOptions());
  if (!entry) throw new HttpError(401, "계정을 찾을 수 없습니다. 다시 로그인해주세요.");
  return { kind: payload.k, id: payload.i, entry, accounts, extras: sessionExtras(payload, accounts) };
}
// 세션에 함께 담긴 다른 역할 중 아직 있는 계정만
function sessionExtras(payload, accounts) {
  return (Array.isArray(payload?.x) ? payload.x : [])
    .map(([kind, id]) => ({ kind: String(kind), id: String(id) }))
    .filter(r => findAccount(accounts, r.kind, r.id, authOptions()));
}
// 로그인할 때 이미 로그인해 있던 역할(올바른 세션일 때만)을 이어 붙입니다.
export function priorRoles(token, accounts) {
  const payload = readToken(token, secret(), "s");
  if (!payload) return [];
  const own = findAccount(accounts, payload.k, payload.i, authOptions()) ? [{ kind: payload.k, id: String(payload.i) }] : [];
  return [...own, ...sessionExtras(payload, accounts)];
}
