// 로그인 서버(/api/auth/*)와 이야기하는 화면 쪽 도우미.
// - 아이디·비밀번호는 서버에서 확인합니다(비밀번호는 서버에서 암호화해 보관).
// - 구글·카카오 계정을 KDTIME 아이디에 연결해 두면 버튼 하나로 로그인합니다.
// - 서버가 아직 없거나 응답하지 않으면(개발 화면·장애) status "unavailable"을 돌려줘 예전 방식으로 확인하게 합니다.
import { getFirebaseAuth, resetAnonymousAuth } from "./storage.js";

const SESSION_KEY = "kd_auth_session";
export const getAuthSession = () => { try { return localStorage.getItem(SESSION_KEY) || ""; } catch { return ""; } };
const setAuthSession = token => { try { if (token) localStorage.setItem(SESSION_KEY, token); else localStorage.removeItem(SESSION_KEY); } catch { /* 저장 못 해도 이번 로그인은 유지 */ } };

async function call(path, body) {
  let res;
  try {
    res = await fetch(`/api/auth/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}), credentials: "same-origin" });
  } catch { return { status: "unavailable" }; }
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;
  // 함수가 없음(404 HTML)·설정 전(503)·게이트웨이 오류 → 서버 없음으로 봅니다.
  if (!data || res.status === 503 || res.status === 502 || res.status === 504) return { status: "unavailable", error: data?.error };
  if (!res.ok || data.ok === false) return { status: "fail", error: data.error || "요청을 처리하지 못했습니다.", code: data.code, http: res.status };
  return { status: "ok", data };
}

async function useFirebaseToken(token) {
  if (!token) return;
  try {
    const { signInWithCustomToken } = await import("firebase/auth");
    await signInWithCustomToken(getFirebaseAuth(), token);
  } catch (error) { console.warn("account sign-in skipped", error?.code || error?.message || error); }
}
async function finish(result) {
  if (result.status === "ok" && result.data?.session) {
    setAuthSession(result.data.session);
    await useFirebaseToken(result.data.firebaseToken);
  }
  return result;
}

export const serverLogin = (id, pw) => call("login", { id, pw }).then(finish);
export const exchangeTicket = ticket => call("login", { ticket }).then(finish);

// 로그아웃: 세션 지우고 Firebase도 익명 상태로 되돌립니다.
export async function signOutAccount() {
  setAuthSession("");
  try {
    const auth = getFirebaseAuth();
    if (auth.currentUser && !auth.currentUser.isAnonymous) {
      const { signOut } = await import("firebase/auth");
      await signOut(auth);
      resetAnonymousAuth();
    }
  } catch { /* 무시 */ }
}

// 구글: 팝업으로 구글 로그인 → 서버가 확인. mode "login" | "link"
export async function googleAuth(mode) {
  let idToken;
  try {
    const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const result = await signInWithPopup(getFirebaseAuth(), provider);
    idToken = await result.user.getIdToken();
  } catch (error) {
    const code = error?.code || "";
    if (/popup-closed|cancelled-popup/.test(code)) return { status: "cancel" };
    if (/popup-blocked/.test(code)) return { status: "fail", error: "팝업이 막혔어요. 브라우저에서 이 사이트의 팝업을 허용해주세요." };
    if (/unauthorized-domain|operation-not-allowed/.test(code)) return { status: "fail", error: "구글 로그인 설정이 아직 끝나지 않았습니다." };
    return { status: "fail", error: "구글 로그인을 하지 못했어요. 앱 안 브라우저라면 크롬·사파리에서 열어주세요." };
  }
  const result = await call("google", { idToken, mode, session: mode === "link" ? getAuthSession() : undefined });
  if (mode === "login") return finish(result);
  // 연결만 했으면 Firebase 로그인 상태를 원래 계정으로 되돌립니다.
  return result;
}

// 카카오: 서버에서 카카오 로그인 주소를 받아 그리로 이동합니다(돌아오면 주소 # 뒤에 결과).
export async function kakaoAuth(mode) {
  const result = await call("kakao/start", { mode, session: mode === "link" ? getAuthSession() : undefined });
  if (result.status !== "ok") return result;
  window.location.assign(result.data.url);
  return { status: "redirect" };
}

export const fetchLinks = () => call("links", { session: getAuthSession() });
export const unlinkProvider = provider => call("links", { session: getAuthSession(), action: "unlink", provider });
export const changePassword = (current, next) => call("password", { session: getAuthSession(), current, next });

// 카카오에서 돌아온 결과(주소 # 뒤)를 읽고 주소에서 지웁니다.
export function takeAuthReturn() {
  try {
    const hash = window.location.hash.replace(/^#/, "");
    if (!/kdauth_/.test(hash)) return null;
    const params = new URLSearchParams(hash);
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    return { ticket: params.get("kdauth_ticket"), error: params.get("kdauth_error"), linked: params.get("kdauth_linked") };
  } catch { return null; }
}
export const KAKAO_ERRORS = {
  "kakao-cancel": "카카오 로그인을 취소했어요.",
  "kakao-expired": "카카오 로그인 시간이 지났어요. 다시 시도해주세요.",
  "kakao-failed": "카카오 로그인을 하지 못했어요. 잠시 뒤 다시 시도해주세요.",
  "kakao-unlinked": "이 카카오 계정은 아직 KDTIME 아이디에 연결되지 않았어요. 아이디로 로그인한 뒤 '내 정보'에서 연결해주세요.",
  "kakao-taken": "이 카카오 계정은 이미 다른 KDTIME 아이디에 연결되어 있어요.",
};
