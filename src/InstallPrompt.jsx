// 휴대폰·PC에서 KDTIME을 앱처럼 설치하도록 안내하는 작은 띠.
// - 안드로이드·크롬·엣지: 브라우저가 '설치 가능' 신호를 주면 [앱 설치] 버튼 → 바로 설치 창
// - 아이폰·아이패드(사파리): 설치 버튼이 없어 '공유 → 홈 화면에 추가'를 그림으로 안내
// - 이미 앱으로 연 경우·닫은 경우(30일)는 다시 띄우지 않습니다.
import React, { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

const HIDE_KEY = "kd_install_hide_until";
const isStandalone = () => { try { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; } catch { return false; } };
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isMobile = () => /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const hidden = () => { try { return Date.now() < Number(localStorage.getItem(HIDE_KEY) || 0); } catch { return false; } };

export default function InstallPrompt() {
  const [prompt, setPrompt] = useState(() => (typeof window !== "undefined" ? window.__kdInstallPrompt || null : null));
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (isStandalone() || hidden()) return undefined;
    const onReady = () => { setPrompt(window.__kdInstallPrompt || null); if (isMobile()) setShow(true); };
    window.addEventListener("kd:installable", onReady);
    // 아이폰은 설치 신호가 없어서, 모바일 사파리면 잠시 뒤 안내
    const timer = window.setTimeout(() => { if (isIos() && isMobile()) setShow(true); else if (window.__kdInstallPrompt && isMobile()) onReady(); }, 4000);
    return () => { window.removeEventListener("kd:installable", onReady); window.clearTimeout(timer); };
  }, []);
  const close = () => { setShow(false); try { localStorage.setItem(HIDE_KEY, String(Date.now() + 30 * 86400000)); } catch { /* 이번만 닫힘 */ } };
  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    try { await prompt.userChoice; } catch { /* 취소 */ }
    window.__kdInstallPrompt = null;
    setPrompt(null);
    close();
  };
  if (!show) return null;
  return <div className="kd-install no-print" role="dialog" aria-label="KDTIME 앱 설치 안내">
    <style>{INSTALL_CSS}</style>
    <img src="/icons/icon-192.png" alt="" width="40" height="40" />
    <div><b>KDTIME을 앱으로 쓰기</b>{prompt ? <span>홈 화면에 추가하면 앱처럼 바로 열려요.</span> : <span>사파리 아래 <Share size={13} aria-label="공유" /> 공유 → <b>홈 화면에 추가</b>를 눌러 주세요.</span>}</div>
    {prompt && <button type="button" data-kdn-bare className="go" onClick={install}><Download size={14} />앱 설치</button>}
    <button type="button" data-kdn-bare className="x" onClick={close} aria-label="닫기"><X size={16} /></button>
  </div>;
}

const INSTALL_CSS = `
.kd-install{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:95;display:flex;align-items:center;gap:10px;max-width:520px;margin:0 auto;padding:10px 10px 10px 12px;border-radius:16px;background:var(--kdn-surface,#fff);color:var(--kdn-ink,#1f2430);border:1px solid var(--kdn-line,#dfe2e8);box-shadow:0 14px 36px rgba(10,14,22,.24);animation:kdInstallIn .3s ease-out}
@keyframes kdInstallIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.kd-install img{border-radius:10px;flex:none}
.kd-install>div{display:grid;gap:2px;flex:1;min-width:0}
.kd-install>div>b{font-size:14px;font-weight:900}
.kd-install>div>span{font-size:12.5px;color:var(--kdn-muted,#5d6574);line-height:1.45}
.kd-install>div>span svg{vertical-align:-2px}
.kd-install .go{display:inline-flex;align-items:center;gap:5px;height:36px;padding:0 13px;border:0;border-radius:10px;background:#ea580c;color:#fff;font:inherit;font-size:13px;font-weight:850;cursor:pointer;flex:none}
.kd-install .x{width:32px;height:32px;display:grid;place-items:center;border:0;border-radius:9px;background:transparent;color:var(--kdn-muted,#5d6574);cursor:pointer;flex:none}
@media (prefers-reduced-motion: reduce){.kd-install{animation:none}}
`;
