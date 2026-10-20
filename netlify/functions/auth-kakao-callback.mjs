// GET /api/auth/kakao/callback?code&state — 카카오가 돌려보내는 주소(카카오 개발자 콘솔에 등록한 Redirect URI)
import { env } from "../lib/env.mjs";
import { readToken, signToken, findAccount } from "../lib/authCore.mjs";
import { handle, redirect, secret, siteOrigin, readAccounts, readLinkFor, linkProvider, HttpError } from "../lib/kdServer.mjs";

const back = (req, params) => redirect(`${siteOrigin(req)}/#${new URLSearchParams(params).toString()}`, { "set-cookie": "kd_ks=; Path=/api/auth/kakao; Max-Age=0; HttpOnly; Secure; SameSite=Lax" });

export default handle(async req => {
  const url = new URL(req.url);
  if (url.searchParams.get("error")) return back(req, { kdauth_error: "kakao-cancel" });
  const state = readToken(url.searchParams.get("state"), secret(), "st");
  const cookie = /(?:^|;\s*)kd_ks=([^;]+)/.exec(req.headers.get("cookie") || "")?.[1];
  if (!state || !cookie || cookie !== state.n) return back(req, { kdauth_error: "kakao-expired" });
  const code = url.searchParams.get("code");
  if (!code) return back(req, { kdauth_error: "kakao-cancel" });

  // 1) 받은 code로 카카오 토큰 받기
  const form = new URLSearchParams({ grant_type: "authorization_code", client_id: env("KAKAO_REST_API_KEY"), redirect_uri: `${siteOrigin(req)}/api/auth/kakao/callback`, code });
  if (env("KAKAO_CLIENT_SECRET")) form.set("client_secret", env("KAKAO_CLIENT_SECRET"));
  const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" }, body: form });
  const tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenJson.access_token) { console.warn("kakao token failed", tokenRes.status, tokenJson.error_code || tokenJson.error); return back(req, { kdauth_error: "kakao-failed" }); }
  // 2) 카카오 회원번호·닉네임
  const meRes = await fetch("https://kapi.kakao.com/v2/user/me", { headers: { authorization: `Bearer ${tokenJson.access_token}` } });
  const me = await meRes.json().catch(() => ({}));
  if (!meRes.ok || !me.id) return back(req, { kdauth_error: "kakao-failed" });
  const uid = String(me.id);
  const label = me.kakao_account?.profile?.nickname || me.properties?.nickname || "카카오 계정";
  // 다 쓴 카카오 토큰은 바로 끊습니다(우리 서버에 남기지 않음).
  fetch("https://kapi.kakao.com/v1/user/logout", { method: "POST", headers: { authorization: `Bearer ${tokenJson.access_token}` } }).catch(() => null);

  if (state.m === "link") {
    try { await linkProvider(state.k, state.i, "kakao", uid, label); }
    catch (error) { if (error instanceof HttpError && error.status === 409) return back(req, { kdauth_error: "kakao-taken" }); throw error; }
    return back(req, { kdauth_linked: "kakao" });
  }
  const link = await readLinkFor("kakao", uid);
  if (!link || !findAccount(await readAccounts(), link.kind, link.id)) return back(req, { kdauth_error: "kakao-unlinked" });
  // 화면이 이 1회용 표로 /api/auth/login 에서 로그인합니다(2분).
  return back(req, { kdauth_ticket: signToken({ t: "k", k: link.kind, i: link.id, exp: Date.now() + 120000 }, secret()) });
});

export const config = { path: "/api/auth/kakao/callback" };
