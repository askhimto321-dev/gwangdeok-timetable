// GET /api/auth/status — 로그인 서버 설정 점검(값은 절대 보여 주지 않고 '있음/없음'만)
export default async () => {
  const key = String(process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n").replace(/^"|"$/g, "");
  const email = String(process.env.FIREBASE_CLIENT_EMAIL || "");
  const body = {
    FIREBASE_CLIENT_EMAIL: !email ? "없음" : /@kwangdeoktimetable\.iam\.gserviceaccount\.com$/.test(email.trim()) ? "있음" : "있음(형식 확인 필요: …@kwangdeoktimetable.iam.gserviceaccount.com)",
    FIREBASE_PRIVATE_KEY: !key ? "없음" : /-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/.test(key) ? "있음" : "있음(형식 확인 필요: -----BEGIN PRIVATE KEY----- 부터 -----END PRIVATE KEY----- 까지)",
    KAKAO_REST_API_KEY: process.env.KAKAO_REST_API_KEY ? "있음" : "없음",
    KAKAO_CLIENT_SECRET: process.env.KAKAO_CLIENT_SECRET ? "있음" : "없음",
    SESSION_SECRET: !process.env.SESSION_SECRET ? "없음" : process.env.SESSION_SECRET.length >= 24 ? "있음" : "있음(24자 이상 필요)",
  };
  return new Response(JSON.stringify(body, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
};
export const config = { path: "/api/auth/status" };
