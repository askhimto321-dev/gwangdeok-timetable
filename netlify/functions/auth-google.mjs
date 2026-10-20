// POST /api/auth/google  { idToken, mode: "login"|"link", session? }
import { handle, readJson, json, admin, readAccounts, readLinkFor, linkProvider, issueLogin, HttpError } from "../lib/kdServer.mjs";
import { findAccount } from "../lib/authCore.mjs";
import { requireSession } from "../lib/session.mjs";

export default handle(async req => {
  const body = await readJson(req);
  let decoded;
  try { decoded = await admin().auth.verifyIdToken(String(body.idToken || "")); }
  catch { throw new HttpError(401, "구글 로그인을 확인하지 못했습니다. 다시 시도해주세요."); }
  if (decoded.firebase?.sign_in_provider !== "google.com") throw new HttpError(400, "구글 계정 로그인이 아닙니다.");
  const uid = decoded.uid;
  const label = decoded.email || decoded.name || "구글 계정";
  if (body.mode === "link") {
    const { kind, id } = await requireSession(body.session);
    await linkProvider(kind, id, "google", uid, label);
    return json({ ok: true, linked: "google", label });
  }
  const link = await readLinkFor("google", uid);
  if (!link) return json({ ok: false, error: "이 구글 계정은 아직 KDTIME 아이디에 연결되지 않았습니다. 아이디로 로그인한 뒤 '내 정보'에서 연결해주세요.", code: "unlinked" }, 404);
  if (!findAccount(await readAccounts(), link.kind, link.id)) throw new HttpError(404, "연결된 KDTIME 계정이 없어졌습니다. 아이디로 로그인해주세요.");
  return json(await issueLogin(link.kind, link.id));
});

export const config = { path: "/api/auth/google" };
