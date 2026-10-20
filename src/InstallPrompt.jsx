// 휴대폰으로 들어오면 KDTIME을 앱(홈 화면 아이콘)으로 설치하라고 안내하는 팝업.
// - 안드로이드 크롬·삼성 인터넷: 브라우저가 설치 신호를 주면 [앱 설치] 한 번으로 설치
//   신호가 아직 없으면 메뉴에서 설치하는 방법을 보여 주고, 신호가 오면 버튼이 생깁니다.
// - 아이폰·아이패드: 설치 버튼이 없어 '공유 → 홈 화면에 추가' 순서를 보여 줍니다.
// - 카카오톡·네이버 등 앱 안 브라우저: 거기서는 설치가 안 돼서 [크롬/사파리로 열기]를 먼저 안내합니다.
// - 이미 앱으로 연 경우는 띄우지 않고, '나중에'는 7일, '다시 보지 않기'는 1년 동안 숨깁니다.
import React, { useEffect, useState } from "react";
import { Download, Share, X, MoreVertical, PlusSquare, ExternalLink } from "lucide-react";

const HIDE_KEY = "kd_install_hide_until";
const ua = () => (typeof navigator === "undefined" ? "" : navigator.userAgent || "");
const isStandalone = () => { try { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; } catch { return false; } };
const isIos = () => /iphone|ipad|ipod/i.test(ua()) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isAndroid = () => /android/i.test(ua());
const isMobile = () => isIos() || isAndroid() || /mobile/i.test(ua());
const inAppName = () => {
  const u = ua();
  if (/KAKAOTALK/i.test(u)) return "카카오톡";
  if (/NAVER\(inapp|NAVER/i.test(u) && !/whale/i.test(u)) return "네이버 앱";
  if (/Instagram/i.test(u)) return "인스타그램";
  if (/FBAN|FBAV/i.test(u)) return "페이스북";
  if (/Line\//i.test(u)) return "라인";
  if (/BAND\//i.test(u)) return "밴드";
  if (/; wv\)/.test(u)) return "앱 안 브라우저";
  return "";
};
const isSamsung = () => /SamsungBrowser/i.test(ua());
const hidden = () => { try { return Date.now() < Number(localStorage.getItem(HIDE_KEY) || 0); } catch { return false; } };
const hideFor = days => { try { localStorage.setItem(HIDE_KEY, String(Date.now() + days * 86400000)); } catch { /* 이번만 닫힘 */ } };

// 앱 안 브라우저 → 바깥 브라우저로 열기
function openOutside() {
  const url = window.location.href.split("#")[0];
  if (/KAKAOTALK/i.test(ua())) { window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`; return; }
  if (isAndroid()) { window.location.href = `intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`; return; }
  // 아이폰의 다른 앱: 주소 복사 후 사파리에서 열도록 안내
  try { navigator.clipboard?.writeText(url); } catch { /* 무시 */ }
  window.alert("주소를 복사했어요. 사파리를 열고 주소창에 붙여 넣어 주세요.");
}

export default function InstallPrompt() {
  const [prompt, setPrompt] = useState(() => (typeof window !== "undefined" ? window.__kdInstallPrompt || null : null));
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || isStandalone() || hidden() || !isMobile()) return undefined;
    const onReady = () => setPrompt(window.__kdInstallPrompt || null);
    window.addEventListener("kd:installable", onReady);
    // 화면이 뜬 뒤 잠시 있다가(사용법 안내가 떠 있으면 끝날 때까지 기다렸다가) 띄웁니다.
    let timer = window.setTimeout(function tick() {
      if (window.__kdTourActive) { timer = window.setTimeout(tick, 1500); return; }
      setShow(true);
    }, 1800);
    const onInstalled = () => { setShow(false); hideFor(3650); };
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("kd:installable", onReady); window.removeEventListener("appinstalled", onInstalled); window.clearTimeout(timer); };
  }, []);
  const close = days => { setShow(false); hideFor(days); };
  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    let accepted = false;
    try { accepted = (await prompt.userChoice)?.outcome === "accepted"; } catch { /* 취소 */ }
    window.__kdInstallPrompt = null;
    setPrompt(null);
    if (accepted) close(3650);
  };
  if (!show) return null;

  const inApp = inAppName();
  let steps;
  if (inApp) steps = <>
    <p className="kd-ins-lead">{inApp} 안에서는 앱을 설치할 수 없어요. {isIos() ? "사파리로" : "크롬으로"} 연 뒤 설치해 주세요.</p>
    <button type="button" data-kdn-bare className="kd-ins-go" onClick={openOutside}><ExternalLink size={16} />{isIos() ? "사파리로 열기" : "크롬으로 열기"}</button>
    {/KAKAOTALK/i.test(ua()) ? null : <p className="kd-ins-tip">버튼이 안 되면 오른쪽 위 메뉴(⋯)에서 '다른 브라우저로 열기'를 눌러 주세요.</p>}
  </>;
  else if (prompt) steps = <>
    <p className="kd-ins-lead">홈 화면에 KDTIME 아이콘이 생기고, 앱처럼 바로 열려요.</p>
    <button type="button" data-kdn-bare className="kd-ins-go" onClick={install}><Download size={16} />앱 설치</button>
  </>;
  else if (isIos()) steps = <>
    <p className="kd-ins-lead">아이폰은 두 번만 누르면 돼요.</p>
    <ol className="kd-ins-steps">
      <li><span className="n">1</span>화면 {/CriOS/i.test(ua()) ? "오른쪽 위" : "아래"}의 <b className="ic"><Share size={15} aria-label="공유" /> 공유</b> 버튼</li>
      <li><span className="n">2</span><b className="ic"><PlusSquare size={15} aria-hidden="true" /> 홈 화면에 추가</b> → 오른쪽 위 <b>추가</b></li>
    </ol>
  </>;
  else steps = <>
    <p className="kd-ins-lead">홈 화면에 KDTIME 아이콘을 만들어 앱처럼 쓰세요.</p>
    <ol className="kd-ins-steps">
      {isSamsung()
        ? <><li><span className="n">1</span>아래쪽 <b className="ic">☰ 메뉴</b></li><li><span className="n">2</span><b>현재 페이지 추가</b> → <b>홈 화면</b></li></>
        : <><li><span className="n">1</span>오른쪽 위 <b className="ic"><MoreVertical size={15} aria-label="메뉴" /> 메뉴</b></li><li><span className="n">2</span><b>앱 설치</b> 또는 <b>홈 화면에 추가</b></li></>}
    </ol>
  </>;

  return <div className="kd-ins no-print" role="dialog" aria-modal="true" aria-label="KDTIME 앱 설치 안내">
    <style>{INSTALL_CSS}</style>
    <div className="kd-ins-back" onClick={() => close(7)} />
    <div className="kd-ins-sheet">
      <button type="button" data-kdn-bare className="kd-ins-x" onClick={() => close(7)} aria-label="닫기"><X size={18} /></button>
      <div className="kd-ins-head">
        <img src="/icons/icon-192.png" alt="" width="56" height="56" />
        <div><b>KDTIME 앱으로 쓰기</b><span>시간표·공지·성적을 홈 화면에서 바로</span></div>
      </div>
      {steps}
      <div className="kd-ins-foot">
        <button type="button" data-kdn-bare onClick={() => close(7)}>나중에</button>
        <button type="button" data-kdn-bare onClick={() => close(365)}>다시 보지 않기</button>
      </div>
    </div>
  </div>;
}

const INSTALL_CSS = `
.kd-ins{position:fixed;inset:0;z-index:110;display:flex;align-items:flex-end;justify-content:center}
.kd-ins-back{position:absolute;inset:0;background:rgba(10,14,22,.5);animation:kdInsFade .25s ease-out}
.kd-ins-sheet{position:relative;width:100%;max-width:440px;margin:0 10px calc(10px + env(safe-area-inset-bottom));padding:20px 18px 12px;border-radius:22px;background:var(--kdn-surface,#fff);color:var(--kdn-ink,#1f2430);box-shadow:0 24px 60px rgba(10,14,22,.35);display:grid;gap:12px;animation:kdInsUp .32s cubic-bezier(.2,.8,.2,1)}
@keyframes kdInsUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
@keyframes kdInsFade{from{opacity:0}to{opacity:1}}
.kd-ins-x{position:absolute;top:10px;right:10px;width:34px;height:34px;display:grid;place-items:center;border:0;border-radius:10px;background:transparent;color:var(--kdn-muted,#5d6574);cursor:pointer}
.kd-ins-head{display:flex;align-items:center;gap:12px;padding-right:30px}
.kd-ins-head img{border-radius:14px;flex:none;box-shadow:0 4px 12px rgba(234,88,12,.25)}
.kd-ins-head>div{display:grid;gap:3px}
.kd-ins-head b{font-size:17px;font-weight:900}
.kd-ins-head span{font-size:13px;color:var(--kdn-muted,#5d6574)}
.kd-ins-lead{margin:0;font-size:14px;line-height:1.5;color:var(--kdn-ink-soft,#3a4150);word-break:keep-all}
.kd-ins-tip{margin:0;font-size:12.5px;color:var(--kdn-muted,#5d6574);word-break:keep-all}
.kd-ins-go{display:flex;align-items:center;justify-content:center;gap:7px;height:48px;border:0;border-radius:14px;background:#ea580c;color:#fff;font:inherit;font-size:15.5px;font-weight:900;cursor:pointer}
.kd-ins-steps{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.kd-ins-steps li{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:11px 12px;border-radius:13px;background:var(--kdn-surface-2,#f6f8fb);font-size:14px;line-height:1.4}
.kd-ins-steps .n{display:grid;place-items:center;width:24px;height:24px;border-radius:99px;background:#ea580c;color:#fff;font-size:12.5px;font-weight:900;flex:none}
.kd-ins-steps b{font-weight:850}
.kd-ins-steps .ic{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:8px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#dfe2e8)}
.kd-ins-foot{display:flex;justify-content:space-between;gap:8px;padding-top:2px}
.kd-ins-foot button{height:36px;padding:0 10px;border:0;background:transparent;color:var(--kdn-muted,#5d6574);font:inherit;font-size:13px;font-weight:750;cursor:pointer}
@media (prefers-reduced-motion: reduce){.kd-ins-sheet,.kd-ins-back{animation:none}}
`;
