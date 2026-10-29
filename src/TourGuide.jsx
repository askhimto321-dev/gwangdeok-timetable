// 탭별 처음 사용 안내(스포트라이트 투어).
// driver.js·Intro.js 같은 온보딩 도구처럼: 화면을 어둡게 하고 설명할 부분만 밝게 뚫은 뒤, 옆에 말풍선으로 단계별 설명을 보여 줍니다.
// - 처음 그 탭을 연 사람에게 한 번 자동으로 띄우고(이 브라우저 기준), 탭 머리의 '사용법' 버튼으로 언제든 다시 봅니다.
// - 대상은 [data-tour="이름"] 요소. 화면에 없는 단계는 건너뜁니다.
// - 키보드: ← → 이동, Esc 닫기. 움직임 줄이기 설정이면 애니메이션 없이 보여 줍니다.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";

const seenKey = id => `kd_tour_seen_v1_${id}`;
const wasSeen = id => { try { return localStorage.getItem(seenKey(id)) === "1"; } catch { return true; } };
const markSeen = id => { try { localStorage.setItem(seenKey(id), "1"); } catch { /* 저장 못 해도 이번엔 닫힘 */ } };
const PAD = 8;

function findTarget(step) {
  if (!step?.target) return null;
  const list = Array.from(document.querySelectorAll(`[data-tour="${step.target}"]`));
  // 보이는 요소만(숨은 탭의 같은 이름은 제외)
  return list.find(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) || null;
}

// steps: [{ target, title, body }] · autoStart: 처음이면 자동 시작 · startToken: 바뀌면 다시 시작('사용법' 버튼)
export default function TourGuide({ id, steps = [], autoStart = true, startToken = 0, delay = 700 }) {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [usable, setUsable] = useState([]);
  const cardRef = useRef(null);

  const begin = useCallback(() => {
    if (window.__kdTourActive) return false;
    const available = steps.filter(step => !step.target || findTarget(step));
    // 첫 단계 대상이 보이지 않으면(숨겨진 탭 등) 아직 시작하지 않습니다.
    if (!available.length || (steps[0]?.target && !findTarget(steps[0]))) return false;
    window.__kdTourActive = id;
    setUsable(available);
    setIndex(0);
    setActive(true);
    return true;
  }, [steps, id]);

  // 처음 보는 사람: 탭이 실제로 화면에 보일 때까지 기다렸다가 한 번 시작합니다(숨긴 채로 미리 그려 둔 탭 대비).
  useEffect(() => {
    if (!autoStart || wasSeen(id)) return undefined;
    let timer = window.setTimeout(function tick() {
      if (wasSeen(id) || begin()) return;
      timer = window.setTimeout(tick, 1000);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (window.__kdTourActive === id) window.__kdTourActive = ""; }, [id]);
  useEffect(() => { if (startToken) begin(); }, [startToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = active ? usable[index] : null;
  const measure = useCallback(() => {
    const el = step ? findTarget(step) : null;
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [step]);

  // 단계가 바뀌면 그 부분이 보이게 스크롤하고 위치를 잽니다.
  useLayoutEffect(() => {
    if (!step) return undefined;
    const el = findTarget(step);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 80 || r.bottom > window.innerHeight - 220) el.scrollIntoView({ block: "center", behavior: reduceMotion() ? "auto" : "smooth" });
    }
    measure();
    const timer = window.setTimeout(measure, 380);
    return () => window.clearTimeout(timer);
  }, [step, measure]);
  useEffect(() => {
    if (!active) return undefined;
    const onMove = () => measure();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => { window.removeEventListener("resize", onMove); window.removeEventListener("scroll", onMove, true); };
  }, [active, measure]);

  const close = useCallback(() => { setActive(false); markSeen(id); if (window.__kdTourActive === id) window.__kdTourActive = ""; }, [id]);
  const next = useCallback(() => { if (index + 1 >= usable.length) close(); else setIndex(value => value + 1); }, [index, usable.length, close]);
  const prev = useCallback(() => setIndex(value => Math.max(0, value - 1)), []);
  useEffect(() => {
    if (!active) return undefined;
    const onKey = event => {
      if (event.key === "Escape") close();
      else if (event.key === "ArrowRight") next();
      else if (event.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, close, next, prev]);
  useEffect(() => { if (active) cardRef.current?.focus({ preventScroll: true }); }, [active, index]);

  if (!active || !step) return null;
  // 말풍선 위치: 대상 아래 공간이 넉넉하면 아래, 아니면 위. 대상이 없으면 가운데.
  const vw = window.innerWidth, vh = window.innerHeight;
  const cardW = Math.min(360, vw - 32);
  let cardStyle;
  if (rect) {
    const below = vh - (rect.top + rect.height) > 230;
    const left = Math.max(16, Math.min(vw - cardW - 16, rect.left + rect.width / 2 - cardW / 2));
    cardStyle = below ? { top: rect.top + rect.height + 12, left, width: cardW } : { top: Math.max(16, rect.top - 12), left, width: cardW, transform: "translateY(-100%)" };
  } else cardStyle = { top: "50%", left: "50%", width: cardW, transform: "translate(-50%,-50%)" };
  const last = index + 1 >= usable.length;

  return createPortal(<div className="kd-tour" role="dialog" aria-modal="true" aria-label={`${step.title} (${index + 1}/${usable.length})`}>
    <style>{TOUR_CSS}</style>
    {/* 클릭 막는 투명 막(스포트라이트 밖을 누르면 다음 단계) */}
    <div className="kd-tour-block" onClick={next} />
    {rect ? <div className="kd-tour-spot" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} /> : <div className="kd-tour-dim" />}
    <div ref={cardRef} tabIndex={-1} className="kd-tour-card" style={cardStyle} key={index}>
      <div className="kd-tour-top"><span className="kd-tour-count">{index + 1} / {usable.length}</span><button type="button" data-kdn-bare className="kd-tour-skip" onClick={close}>건너뛰기</button></div>
      <b className="kd-tour-title">{step.title}</b>
      <p className="kd-tour-body">{step.body}</p>
      <div className="kd-tour-foot">
        <span className="kd-tour-dots" aria-hidden="true">{usable.map((_, i) => <i key={i} className={i === index ? "is-on" : i < index ? "is-done" : ""} />)}</span>
        {index > 0 && <button type="button" data-kdn-bare className="kd-tour-prev" onClick={prev}>이전</button>}
        <button type="button" data-kdn-bare className="kd-tour-next" onClick={next}>{last ? "시작하기" : "다음"}</button>
      </div>
    </div>
  </div>, document.body);
}

function reduceMotion() { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } }

// 탭 머리에 두는 '사용법' 버튼: 누를 때마다 투어를 처음부터.
export function TourButton({ onClick, label = "사용법" }) {
  return <button type="button" data-kdn-bare className="kd-tour-help no-print" onClick={onClick} title="이 화면 사용법을 단계별로 다시 보기"><style>{TOUR_BTN_CSS}</style><HelpCircle size={14} aria-hidden="true" />{label}</button>;
}

const TOUR_BTN_CSS = `
.kd-tour-help{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 11px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:99px;background:var(--kdn-surface,#fff);color:var(--kdn-ink-soft,#3a4150);font:inherit;font-size:12.5px;font-weight:800;cursor:pointer}
.kd-tour-help:hover{border-color:#f97316;color:#c2410c}
`;
const TOUR_CSS = `
.kd-tour{position:fixed;inset:0;z-index:120}
.kd-tour-block{position:fixed;inset:0;cursor:pointer}
.kd-tour-dim{position:fixed;inset:0;background:rgba(10,14,22,.58);pointer-events:none}
.kd-tour-spot{position:fixed;border-radius:14px;box-shadow:0 0 0 9999px rgba(10,14,22,.58),0 0 0 3px #f97316;pointer-events:none;transition:top .35s cubic-bezier(.2,.8,.2,1),left .35s cubic-bezier(.2,.8,.2,1),width .35s cubic-bezier(.2,.8,.2,1),height .35s cubic-bezier(.2,.8,.2,1)}
.kd-tour-spot::after{content:"";position:absolute;inset:-3px;border-radius:16px;border:3px solid #f97316;animation:kdTourPulse 1.6s ease-out infinite}
@keyframes kdTourPulse{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(1.06)}}
.kd-tour-card{position:fixed;display:grid;gap:8px;padding:16px 18px;border-radius:16px;background:var(--kdn-surface,#fff);color:var(--kdn-ink,#1f2430);border:1px solid var(--kdn-line,#dfe2e8);box-shadow:0 22px 50px rgba(10,14,22,.32);outline:none;animation:kdTourIn .28s cubic-bezier(.2,.8,.2,1)}
@keyframes kdTourIn{from{opacity:0;translate:0 8px}to{opacity:1;translate:0 0}}
.kd-tour-top{display:flex;align-items:center;justify-content:space-between}
.kd-tour-count{font-size:12px;font-weight:850;color:#ea580c}
.kd-tour-skip{border:0;background:transparent;color:var(--kdn-muted,#5d6574);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.kd-tour-title{font-size:16px;font-weight:900}
.kd-tour-body{margin:0;font-size:14px;line-height:1.55;color:var(--kdn-ink-soft,#3a4150);word-break:keep-all}
.kd-tour-foot{display:flex;align-items:center;gap:8px;margin-top:4px}
.kd-tour-dots{display:flex;gap:5px;margin-right:auto}
.kd-tour-dots i{width:7px;height:7px;border-radius:99px;background:var(--kdn-line,#dfe2e8);transition:width .25s}
.kd-tour-dots i.is-done{background:#fdba74}
.kd-tour-dots i.is-on{width:18px;background:#ea580c}
@media (max-width:760px){.kd-tour-card{left:12px!important;right:12px!important;width:auto!important;max-width:none!important;top:auto!important;bottom:calc(96px + env(safe-area-inset-bottom))!important;border-radius:22px;padding:16px}}
.kd-tour-prev,.kd-tour-next{height:34px;padding:0 14px;border-radius:10px;font:inherit;font-size:13.5px;font-weight:850;cursor:pointer}
.kd-tour-prev{border:1px solid var(--kdn-control-line,#cfd5df);background:transparent;color:var(--kdn-ink,#1f2430)}
.kd-tour-next{border:0;background:#ea580c;color:#fff}
@media (prefers-reduced-motion: reduce){.kd-tour-spot{transition:none}.kd-tour-spot::after,.kd-tour-card{animation:none}}
`;
