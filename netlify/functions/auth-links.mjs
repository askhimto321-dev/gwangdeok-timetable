// POST /api/auth/links  { session, action?: "list"|"unlink", provider? } — 내 간편 로그인 연결 보기·끊기
import { handle, readJson, json, readAccountLinks, unlinkProvider, HttpError } from "../lib/kdServer.mjs";
import { requireSession } from "../lib/session.mjs";

const view = links => Object.fromEntries(["google", "kakao"].map(p => [p, links?.[p]?.uid ? { label: links[p].label || "", at: links[p].at || "" } : null]));

export default handle(async req => {
  const body = await readJson(req);
  const { kind, id } = await requireSession(body.session);
  if (body.action === "unlink") {
    if (!["google", "kakao"].includes(body.provider)) throw new HttpError(400, "연결 종류가 올바르지 않습니다.");
    await unlinkProvider(kind, id, body.provider);
  }
  return json({ ok: true, links: view(await readAccountLinks(kind, id)) });
});

export const config = { path: "/api/auth/links" };
