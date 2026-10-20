import { readToken, findAccount } from "./authCore.mjs";
import { secret, readAccounts, HttpError } from "./kdServer.mjs";

// 화면이 보낸 세션(서명 토큰)을 확인하고, 그 계정이 아직 있는지 봅니다.
export async function requireSession(token) {
  const payload = readToken(token, secret(), "s");
  if (!payload) throw new HttpError(401, "로그인이 만료되었습니다. 다시 로그인해주세요.");
  const accounts = await readAccounts();
  const entry = findAccount(accounts, payload.k, payload.i);
  if (!entry) throw new HttpError(401, "계정을 찾을 수 없습니다. 다시 로그인해주세요.");
  return { kind: payload.k, id: payload.i, entry, accounts };
}
