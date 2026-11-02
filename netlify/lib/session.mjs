import { readToken, findAccount, impliedRoles } from "./authCore.mjs";
import { secret, readAccounts, HttpError, authOptions, assertKindAllowed } from "./kdServer.mjs";

// 화면이 보낸 세션(서명 토큰)을 확인하고, 그 계정이 아직 있는지 봅니다.
export async function requireSession(token) {
  const payload = readToken(token, secret(), "s");
  if (!payload) throw new HttpError(401, "로그인이 만료되었습니다. 다시 로그인해주세요.");
  assertKindAllowed(payload.k);
  const accounts = await readAccounts();
  const entry = findAccount(accounts, payload.k, payload.i, authOptions());
  if (!entry) throw new HttpError(401, "계정을 찾을 수 없습니다. 다시 로그인해주세요.");
  return { kind: payload.k, id: payload.i, entry, accounts, extras: withImplied(payload.k, payload.i, sessionExtras(payload, accounts), accounts) };
}
// 세션에 함께 담긴 다른 역할 중 아직 있는 계정만
function sessionExtras(payload, accounts) {
  return (Array.isArray(payload?.x) ? payload.x : [])
    .map(([kind, id]) => ({ kind: String(kind), id: String(id) }))
    .filter(r => findAccount(accounts, r.kind, r.id, authOptions()));
}
// 관리자 권한이 있는 선생님이면 관리자 역할을 더합니다(세션에 없어도 — 나중에 권한을 받은 경우 포함).
export function withImplied(kind, id, extras, accounts) {
  const out = [...extras];
  [{ kind, id }, ...extras].forEach(r => impliedRoles(accounts, r.kind, r.id).forEach(add => { if (!(add.kind === kind && add.id === String(id)) && !out.some(x => x.kind === add.kind && x.id === add.id)) out.push(add); }));
  return out;
}
// 로그인할 때 이미 로그인해 있던 역할(올바른 세션일 때만)을 이어 붙입니다.
export function priorRoles(token, accounts) {
  const payload = readToken(token, secret(), "s");
  if (!payload) return [];
  const own = findAccount(accounts, payload.k, payload.i, authOptions()) ? [{ kind: payload.k, id: String(payload.i) }] : [];
  return [...own, ...sessionExtras(payload, accounts)];
}

// 간편 로그인 연결은 사람(아이디) 단위예요. 여러 역할이면 연결을 둘 역할: 선생님 → 부서 → 그 밖 → 관리자 순서
// (관리자 계정은 같은 아이디의 선생님 계정에 합쳐지기 때문에 선생님 쪽에 둬요)
const LINK_RANK = ["teacher", "departments", "classView", "monitors", "students", "admin"];
export function sessionRoles({ kind, id, extras = [] }) {
  const out = [{ kind, id: String(id) }];
  extras.forEach(r => { if (!out.some(x => x.kind === r.kind && x.id === String(r.id))) out.push({ kind: r.kind, id: String(r.id) }); });
  return out;
}
export function linkOwner(who) {
  const roles = sessionRoles(who).filter(r => r.id === String(who.id));
  return roles.sort((a, b) => LINK_RANK.indexOf(a.kind) - LINK_RANK.indexOf(b.kind))[0] || { kind: who.kind, id: String(who.id) };
}
