// 반편성 결과 알림 팝업: 반편성 결과가 올라와 있으면 2학년 담임·부장·부서·관리자에게 로그인 뒤 한 번 띄워요.
// '오늘 그만 보기'(오늘만) · '이 결과는 그만 보기'(새 파일·이동이 생기면 다시 떠요)
import React from "react";
import { createPortal } from "react-dom";
import { LayoutGrid, X } from "lucide-react";
import { readStorage } from "./storage.js";
import { schoolYearOf } from "./curriculum.js";
import { placementKey } from "./classPlacement.js";

const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
export default function PlacementNotice({ userKey = "", grades = ["2"], onOpen }) {
  const [info, setInfo] = React.useState(null);
  const year = schoolYearOf();
  // 학년마다 따로 기억해요(2학년은 예전 키 그대로)
  const kOf = g => (String(g) === "2" ? "" : `_g${g}`);
  const kDay = `kd_placement_notice_day_${userKey}`;
  React.useEffect(() => {
    let on = true;
    (async () => {
      try { if (localStorage.getItem(kDay) === today()) return; } catch { /* 기억 못 해도 띄워요 */ }
      for (const g of grades) {
        const p = await readStorage(placementKey(year, g), null).catch(() => null);
        if (!on) return;
        if (!p || !(p.students || p.bySid)) continue;
        const stamp = `${p.at || ""}|${(p.moves || []).length}`;
        const kSeen = `kd_placement_notice_seen_${userKey}${kOf(g)}`;
        try { if (localStorage.getItem(kSeen) === stamp) continue; } catch { /* 기억 못 해도 띄워요 */ }
        const students = p.students ? Object.values(p.students) : Object.values(p.bySid);
        const classes = new Set(students.map(s => Number(s?.cls ?? s))).size;
        setInfo({ grade: String(g), kSeen, stamp, n: students.length, classes, moves: (p.moves || []).length, file: p.fileName || "", at: p.at || "" });
        return;
      }
    })();
    return () => { on = false; };
  }, [userKey, grades.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!info) return null;
  const close = mode => { try { if (mode === "day") localStorage.setItem(kDay, today()); if (mode === "seen") localStorage.setItem(info.kSeen, info.stamp); } catch { /* 편의 기능 */ } setInfo(null); };
  const d = new Date(info.at);
  return createPortal(<div className="kpn" role="dialog" aria-modal="true" aria-label="반편성 알림" onClick={e => e.target === e.currentTarget && close("")}><style>{CSS}</style>
    <div className="box">
      <button type="button" data-kdn-bare className="x" onClick={() => close("")} aria-label="닫기"><X size={16} /></button>
      <span className="ico"><LayoutGrid size={22} /></span>
      <small className="eye">반편성 확인 요청</small>
      <h3>{year + 1}학년도 {Number(info.grade) + 1}학년 반편성 결과가 올라왔어요</h3>
      <div className="nums"><span><b>{info.classes}</b>개 반</span><span><b>{info.n}</b>명</span>{info.moves ? <span><b>{info.moves}</b>건 이동</span> : null}</div>
      <p>새 반 명단을 보고 <em>분리희망이 반영됐는지</em> 확인해 주세요. 학생에게 <em>리더 후보 · 조합 우려 · 배려 필요 · 생활지도 주의</em>를, 반에는 <em>리더 후보 부족 · 성비 불균형</em> 같은 점검을 표시할 수 있어요.</p>
      {!Number.isNaN(d.getTime()) && <small className="meta">{d.getMonth() + 1}월 {d.getDate()}일 반영{info.file ? ` · ${info.file}` : ""}</small>}
      <button type="button" data-kdn-bare className="go" onClick={() => { close("seen"); onOpen?.(info.grade); }}>반편성 열기</button>
      <div className="later"><button type="button" data-kdn-bare onClick={() => close("day")}>오늘 그만 보기</button><button type="button" data-kdn-bare onClick={() => close("seen")}>이 결과는 그만 보기</button></div>
    </div>
  </div>, document.body);
}

const CSS = `
.kpn{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:16px;background:rgba(15,18,25,.5);animation:kpn-in .18s ease-out}
@keyframes kpn-in{from{opacity:0}to{opacity:1}}
.kpn .box{position:relative;width:min(440px,100%);display:grid;gap:10px;justify-items:start;padding:26px 24px 20px;border-radius:22px;background:var(--kdn-surface,#fff);color:var(--kdn-ink,#111827);box-shadow:0 24px 60px rgba(15,18,25,.35);border-top:6px solid #2563eb}
.kpn .x{position:absolute;top:12px;right:12px;display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:9px;background:transparent;color:var(--kdn-muted,#64748b);cursor:pointer}
.kpn .ico{display:grid;place-items:center;width:46px;height:46px;border-radius:14px;background:#dbeafe;color:#1d4ed8}
.kpn .eye{font-size:12.5px;font-weight:800;color:#1d4ed8;letter-spacing:.02em}
.kpn h3{margin:0;font-size:20px;line-height:1.35;word-break:keep-all}
.kpn .nums{display:flex;flex-wrap:wrap;gap:6px}.kpn .nums span{padding:4px 12px;border-radius:99px;background:var(--kdn-surface-2,#f1f5f9);font-size:13px;font-weight:700}.kpn .nums b{font-size:15px;margin-right:2px}
.kpn p{margin:0;font-size:14px;line-height:1.65;color:var(--kdn-ink-soft,#334155);word-break:keep-all}.kpn p em{font-style:normal;font-weight:800;color:var(--kdn-ink,#111827)}
.kpn .meta{font-size:12px;color:var(--kdn-muted,#64748b)}
.kpn .go{justify-self:stretch;height:48px;margin-top:4px;border:0;border-radius:14px;background:#2563eb;color:#fff;font:inherit;font-size:16px;font-weight:800;cursor:pointer}
.kpn .later{justify-self:stretch;display:flex;justify-content:space-between}.kpn .later button{border:0;background:none;padding:4px 2px;font:inherit;font-size:13px;color:var(--kdn-muted,#64748b);cursor:pointer}
`;
