// POST /api/auth/links  { session, action?: "list"|"unlink", provider? } — 내 간편 로그인 연결 보기·끊기
import { handle, readJson, json, readAccountLinks, unlinkProvider, HttpError } from "../lib/kdServer.mjs";
import { requireSession, sessionRoles } from "../lib/session.mjs";

const view = links => Object.fromEntries(["google", "kakao"].map(p => [p, links?.[p]?.uid ? { label: links[p].label || "", at: links[p].at || "" } : null]));

export default handle(async req => {
  const body = await readJson(req);
  // 여러 역할(예: 관리자이면서 선생님)이면 어느 역할에 연결돼 있든 보여 주고, 끊을 때도 모두 끊어요.
  const roles = sessionRoles(await requireSession(body.session));
  if (body.action === "unlink") {
    if (!["google", "kakao"].includes(body.provider)) throw new HttpError(400, "연결 종류가 올바르지 않습니다.");
    for (const r of roles) await unlinkProvider(r.kind, r.id, body.provider);
  }
  const merged = {};
  for (const r of roles) { const links = await readAccountLinks(r.kind, r.id); ["google", "kakao"].forEach(p => { if (!merged[p] && links?.[p]?.uid) merged[p] = links[p]; }); }
  return json({ ok: true, links: view(merged) });
});

export const config = { path: "/api/auth/links" };
