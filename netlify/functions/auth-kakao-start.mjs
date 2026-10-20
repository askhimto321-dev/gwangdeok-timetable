// POST /api/auth/kakao/start  { mode: "login"|"link", session? } → { url } (카카오 로그인 화면 주소)
import { signToken } from "../lib/authCore.mjs";
import { handle, readJson, json, secret, siteOrigin, randomId, HttpError } from "../lib/kdServer.mjs";
import { requireSession } from "../lib/session.mjs";

export default handle(async req => {
  const body = await readJson(req);
  const clientId = process.env.KAKAO_REST_API_KEY;
  if (!clientId) throw new HttpError(503, "카카오 로그인 설정이 아직 끝나지 않았습니다.");
  const nonce = randomId();
  const state = { t: "st", m: body.mode === "link" ? "link" : "login", n: nonce, exp: Date.now() + 10 * 60000 };
  if (state.m === "link") { const { kind, id } = await requireSession(body.session); state.k = kind; state.i = id; }
  const url = new URL("https://kauth.kakao.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${siteOrigin(req)}/api/auth/kakao/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", signToken(state, secret()));
  // 같은 브라우저에서 돌아왔는지 확인하는 쿠키(10분)
  return json({ ok: true, url: url.toString() }, 200, { "set-cookie": `kd_ks=${nonce}; Path=/api/auth/kakao; Max-Age=600; HttpOnly; Secure; SameSite=Lax` });
});

export const config = { path: "/api/auth/kakao/start" };
