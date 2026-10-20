// 구글·카카오 간편 로그인 버튼과 '내 정보'의 연결 카드
import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchLinks, unlinkProvider, googleAuth, kakaoAuth, getAuthSession } from "./authClient.js";

const GoogleMark = () => <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>;
const KakaoMark = () => <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#191919" d="M12 3C6.5 3 2 6.5 2 10.8c0 2.8 1.9 5.2 4.7 6.6l-1 3.6c-.1.3.3.6.6.4l4.2-2.8c.5.1 1 .1 1.5.1 5.5 0 10-3.5 10-7.9S17.5 3 12 3z"/></svg>;

// 로그인 화면 아래: 연결해 둔 계정으로 바로 로그인
export function SocialLoginButtons({ onPick, disabled }) {
  return <div className="kd-social">
    <style>{SOCIAL_CSS}</style>
    <div className="kd-social-or"><span>또는</span></div>
    <div className="kd-social-row">
      <button type="button" data-kdn-bare className="kd-social-btn google" onClick={() => onPick("google")} disabled={disabled}><GoogleMark />구글로 로그인</button>
      <button type="button" data-kdn-bare className="kd-social-btn kakao" onClick={() => onPick("kakao")} disabled={disabled}><KakaoMark />카카오로 로그인</button>
    </div>
    <p className="kd-social-note">처음에는 아이디로 로그인한 뒤 '내 정보'에서 연결해 주세요.</p>
  </div>;
}

const NAMES = { google: "구글", kakao: "카카오" };
const when = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ko-KR", { year: "2-digit", month: "numeric", day: "numeric" }); };

// '내 정보': 구글·카카오 연결 상태 보기·연결·끊기
export function SocialLinkCard({ showToast }) {
  const [state, setState] = useState({ loading: true, links: null, note: "" });
  const [busy, setBusy] = useState("");
  const hasSession = !!getAuthSession();
  const load = async () => {
    if (!hasSession) { setState({ loading: false, links: null, note: "relogin" }); return; }
    const result = await fetchLinks();
    if (result.status === "ok") setState({ loading: false, links: result.data.links, note: "" });
    else if (result.status === "unavailable") setState({ loading: false, links: null, note: "server" });
    else setState({ loading: false, links: null, note: result.http === 401 ? "relogin" : result.error });
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const link = async provider => {
    setBusy(provider);
    try {
      if (provider === "kakao") {
        const result = await kakaoAuth("link");
        if (result.status !== "redirect") showToast?.(result.error || "카카오 연결을 시작하지 못했어요.", "error");
        return;
      }
      const result = await googleAuth("link");
      if (result.status === "cancel") return;
      if (result.status !== "ok") { showToast?.(result.error || "구글 계정을 연결하지 못했어요.", "error"); return; }
      showToast?.(`구글 계정(${result.data.label})을 연결했어요. 다음부터 구글로 로그인할 수 있어요.`, "success");
      await load();
    } finally { setBusy(""); }
  };
  const unlink = async provider => {
    if (!window.confirm(`${NAMES[provider]} 연결을 끊을까요? 아이디·비밀번호 로그인은 그대로 됩니다.`)) return;
    setBusy(provider);
    try {
      const result = await unlinkProvider(provider);
      if (result.status === "ok") { setState({ loading: false, links: result.data.links, note: "" }); showToast?.(`${NAMES[provider]} 연결을 끊었어요.`, "success"); }
      else showToast?.(result.error || "연결을 끊지 못했어요.", "error");
    } finally { setBusy(""); }
  };

  return <div className="kd-link-card">
    <style>{SOCIAL_CSS}</style>
    <div className="kd-link-head"><b>간편 로그인 연결</b><span>구글·카카오 계정을 이 아이디에 연결하면 다음부터 버튼 하나로 로그인해요.</span></div>
    {state.loading ? <p className="kd-link-note"><Loader2 size={14} className="spin" /> 확인하는 중…</p>
      : state.note === "relogin" ? <p className="kd-link-note">연결하려면 로그아웃한 뒤 아이디·비밀번호로 한 번 다시 로그인해 주세요.</p>
      : state.note === "server" ? <p className="kd-link-note">간편 로그인 서버를 준비하는 중이에요. 잠시 뒤 다시 열어 주세요.</p>
      : state.note ? <p className="kd-link-note">{state.note}</p>
      : <ul className="kd-link-list">{["google", "kakao"].map(provider => {
        const info = state.links?.[provider];
        return <li key={provider}>
          <span className={`kd-link-mark ${provider}`}>{provider === "google" ? <GoogleMark /> : <KakaoMark />}</span>
          <span className="kd-link-name"><b>{NAMES[provider]}</b><small>{info ? `${info.label || "연결됨"}${info.at ? ` · ${when(info.at)} 연결` : ""}` : "연결 안 됨"}</small></span>
          {info
            ? <button type="button" data-kdn-bare className="kd-link-btn" onClick={() => unlink(provider)} disabled={!!busy}>{busy === provider ? <Loader2 size={13} className="spin" /> : null}끊기</button>
            : <button type="button" data-kdn-bare className={`kd-link-btn on ${provider}`} onClick={() => link(provider)} disabled={!!busy}>{busy === provider ? <Loader2 size={13} className="spin" /> : null}연결하기</button>}
        </li>;
      })}</ul>}
  </div>;
}

const SOCIAL_CSS = `
.kd-social{width:100%;display:grid;gap:8px;margin-top:12px}
.kd-social-or{display:flex;align-items:center;gap:8px;color:var(--kdn-muted,#8a8578);font-size:11.5px}
.kd-social-or::before,.kd-social-or::after{content:"";flex:1;height:1px;background:var(--kdn-line,#e4e1d8)}
.kd-social-row{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.kd-social-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:38px;padding:0 8px;border-radius:10px;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;white-space:nowrap}
.kd-social-btn.google{border:1px solid #dadce0;background:#fff;color:#1f1f1f}
.kd-social-btn.kakao{border:0;background:#FEE500;color:#191919}
.kd-social-btn:disabled{opacity:.6;cursor:default}
.kd-social-note{margin:0;font-size:11px;color:var(--kdn-muted,#8a8578);text-align:center;word-break:keep-all}
.kd-link-card{display:grid;gap:10px;margin-top:16px;padding:14px;border:1px solid var(--kdn-line,#d9e2ed);border-radius:13px;background:var(--kdn-surface-2,#f8fafc)}
.kd-link-head{display:grid;gap:3px}.kd-link-head b{font-size:14px;color:var(--kdn-ink,#2c4058)}.kd-link-head span{font-size:11.5px;color:var(--kdn-muted,#7a8797)}
.kd-link-note{display:flex;align-items:center;gap:6px;margin:0;font-size:12.5px;color:var(--kdn-muted,#7a8797)}
.kd-link-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.kd-link-list li{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--kdn-line,#e1e7ef);border-radius:10px;background:var(--kdn-surface,#fff)}
.kd-link-mark{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:8px;border:1px solid #e3e3e3;background:#fff}.kd-link-mark.kakao{border:0;background:#FEE500}
.kd-link-name{display:grid;gap:1px;flex:1;min-width:0}.kd-link-name b{font-size:13px;color:var(--kdn-ink,#2c4058)}.kd-link-name small{font-size:11.5px;color:var(--kdn-muted,#7a8797);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kd-link-btn{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 12px;border:1px solid var(--kdn-control-line,#cfd9e5);border-radius:9px;background:transparent;color:var(--kdn-ink,#2c4058);font:inherit;font-size:12.5px;font-weight:800;cursor:pointer}
.kd-link-btn.on.google{background:#fff;border-color:#dadce0;color:#1f1f1f}.kd-link-btn.on.kakao{background:#FEE500;border-color:#FEE500;color:#191919}
`;
