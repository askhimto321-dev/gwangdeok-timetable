// GET /api/auth/status — 로그인 서버 설정 점검(값은 절대 보여 주지 않고 '있음/없음'만)
import { env, envSource } from "../lib/env.mjs";

const where = name => ({ runtime: "있음", build: "있음(빌드 때 넣은 값)" })[envSource(name)] || "없음";
export default async () => {
  const key = env("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n").replace(/^"|"$/g, "");
  const email = env("FIREBASE_CLIENT_EMAIL");
  const body = {
    FIREBASE_CLIENT_EMAIL: !email ? "없음" : /@kwangdeoktimetable\.iam\.gserviceaccount\.com$/.test(email) ? where("FIREBASE_CLIENT_EMAIL") : "있음(형식 확인 필요: …@kwangdeoktimetable.iam.gserviceaccount.com)",
    FIREBASE_PRIVATE_KEY: !key ? "없음" : /-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/.test(key) ? where("FIREBASE_PRIVATE_KEY") : "있음(형식 확인 필요: -----BEGIN PRIVATE KEY----- 부터 -----END PRIVATE KEY----- 까지)",
    KAKAO_REST_API_KEY: where("KAKAO_REST_API_KEY"),
    KAKAO_CLIENT_SECRET: where("KAKAO_CLIENT_SECRET"),
    SESSION_SECRET: !env("SESSION_SECRET") ? "없음" : env("SESSION_SECRET").length >= 24 ? where("SESSION_SECRET") : "있음(24자 이상 필요)",
    // 진단: 비슷한 이름(오타·공백)이 있는지 — 이름만, 값은 안 보임
    비슷한_이름: Object.keys(typeof process !== "undefined" ? process.env : {}).filter(name => /firebase|kakao|session/i.test(name)).sort(),
    배포_환경: (typeof process !== "undefined" && process.env.CONTEXT) || "알 수 없음",
  };
  return new Response(JSON.stringify(body, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
};
export const config = { path: "/api/auth/status" };
