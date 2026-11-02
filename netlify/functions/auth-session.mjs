// POST /api/auth/session  { session } — 새로고침 때 화면이 로그인 상태를 되살려도 되는지 서버가 확인합니다.
// 서명이 맞고 기간이 남았고 그 계정이 아직 있으면 { kind, id }를 돌려줍니다.
import { handle, readJson, json, issueLogin } from "../lib/kdServer.mjs";
import { requireSession } from "../lib/session.mjs";

export default handle(async req => {
  const body = await readJson(req);
  const { kind, id, extras } = await requireSession(body.session);
  // Firebase 계정 로그인도 새로 줍니다(자료 보안 규칙이 계정 로그인을 확인). 세션 토큰은 그대로 둡니다.
  const { firebaseToken, roles, tokenKind } = await issueLogin(kind, id, extras);
  return json({ ok: true, kind, id, roles, tokenKind, firebaseToken });
});

export const config = { path: "/api/auth/session" };
