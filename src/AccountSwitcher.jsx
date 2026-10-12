import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, Eye, Search, Undo2 } from "lucide-react";

// 관리자 전용 계정 전환: 비밀번호 없이 다른 계정 화면으로 바로 들어가 봅니다.
// 전환 상태는 메모리에만 두고(새로고침하면 관리자 화면으로 돌아옴) 로그인 기록(kd_session)에는 남기지 않습니다.
const ROLE_LABEL = { homeroom: "학급담임", gradeHead: "학년부장", other: "교과담임" };
const KIND_LABEL = { teacher: "선생님", department: "부서", monitor: "모니터", student: "학생" };

export function accountLabel(kind, account) {
  if (!account) return "";
  if (kind === "teacher") {
    const role = account.teacherRole && ROLE_LABEL[account.teacherRole] ? ROLE_LABEL[account.teacherRole] : (account.homeroomClass ? "학급담임" : "교과담임");
    return `${account.name || account.id} 선생님 · ${role}${account.homeroomClass ? ` ${account.homeroomClass}반` : ""}`;
  }
  if (kind === "department") return `${account.name || account.id} · 부서`;
  if (kind === "monitor") return `${account.name || account.id} · 모니터`;
  if (kind === "student") return `${account.name || ""} ${account.id} · 학생`.trim();
  return account.id;
}

function useOutside(ref, open, close) {
  useEffect(() => {
    if (!open) return undefined;
    const onDown = event => { if (ref.current && !ref.current.contains(event.target)) close(); };
    const onKey = event => { if (event.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [ref, open, close]);
}

export default function AccountSwitcher({ accounts = {}, onPick, current = null, buttonLabel = "계정 전환", compact = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  useOutside(boxRef, open, () => setOpen(false));
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0); }, [open]);

  const q = query.trim().toLowerCase();
  const hit = account => !q || `${account.name || ""} ${account.id || ""}`.toLowerCase().includes(q);
  const groups = useMemo(() => {
    const staff = [
      ["teacher", (accounts.teacher || []).slice().sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), "ko"))],
      ["department", accounts.departments || []],
      ["monitor", accounts.monitors || []],
    ];
    // 학생은 수가 많아 검색할 때만 보여 줍니다.
    const students = q ? (accounts.students || []) : [];
    return [...staff, ["student", students]].map(([kind, list]) => [kind, list.filter(hit).slice(0, kind === "student" ? 20 : 200)]).filter(([, list]) => list.length);
  }, [accounts, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (kind, account) => { onPick?.(kind, account); setOpen(false); setQuery(""); };
  const isCurrent = (kind, account) => current && current.kind === kind && String(current.id) === String(account.id);

  return <div className="kd-as" ref={boxRef}>
    <style>{AS_CSS}</style>
    <button type="button" data-kdn-bare className={`kd-as-btn${compact ? " is-compact" : ""}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(on => !on)}><ArrowLeftRight size={14} aria-hidden="true" />{buttonLabel}</button>
    {open && <div className="kd-as-panel" role="listbox" aria-label="전환할 계정">
      <label className="kd-as-search"><Search size={13} aria-hidden="true" /><input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="이름·아이디 검색 (학생은 학번·이름)" /></label>
      {groups.map(([kind, list]) => <section key={kind}>
        <h4>{KIND_LABEL[kind]} <small>{list.length}</small></h4>
        <ul>{list.map(account => <li key={`${kind}-${account.id}`}>
          <button type="button" data-kdn-bare role="option" aria-selected={isCurrent(kind, account)} className={isCurrent(kind, account) ? "is-on" : ""} onClick={() => pick(kind, account)}>
            <Eye size={13} aria-hidden="true" /><span>{accountLabel(kind, account)}</span><em>{account.id}</em>
          </button>
        </li>)}</ul>
      </section>)}
      {!groups.length && <p className="kd-as-empty">{q ? "맞는 계정이 없어요." : "전환할 계정이 없어요."}</p>}
      {!q && <p className="kd-as-note">학생 계정은 학번·이름으로 검색하세요.</p>}
    </div>}
  </div>;
}

// 다른 계정으로 보는 중일 때 맨 위에 붙는 띠
export function ImpersonationBar({ kind, account, adminId, accounts, onPick, onReturn }) {
  return <div className="kd-imp no-print" role="status">
    <style>{AS_CSS}</style>
    <Eye size={15} aria-hidden="true" />
    <b>관리자 보기 모드</b>
    <span>{accountLabel(kind, account)} 화면</span>
    <small title={`새로고침해도 관리자(${adminId})로 돌아가요`}>저장하면 이 계정 이름으로 기록돼요</small>
    <span style={{ flex: 1 }} />
    <AccountSwitcher accounts={accounts} onPick={onPick} current={{ kind, id: account?.id }} buttonLabel="다른 계정" compact />
    <button type="button" data-kdn-bare className="kd-imp-back" onClick={onReturn}><Undo2 size={14} aria-hidden="true" />관리자로 돌아가기</button>
  </div>;
}

const AS_CSS = `
.kd-as{position:relative;display:inline-flex}
.kd-as-btn{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 12px;border-radius:10px;border:1px solid var(--kdn-control-line,#cfd6e2);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#25324a);font:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap}
.kd-as-btn:hover{border-color:var(--kdn-accent,#3b6fb0)}
.kd-as-btn.is-compact{height:32px;font-size:12.5px}
.kd-as-panel{position:absolute;z-index:60;top:calc(100% + 6px);right:0;width:min(380px,calc(100vw - 32px));max-height:min(480px,70vh);overflow:auto;padding:10px;border:1px solid var(--kdn-line,#dde4ee);border-radius:14px;background:var(--kdn-surface,#fff);box-shadow:0 16px 40px rgba(20,32,56,.18);display:grid;gap:8px;text-align:left}
.kd-as-search{display:flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid var(--kdn-control-line,#cfd6e2);border-radius:9px;background:var(--kdn-surface-2,#f6f8fb);color:var(--kdn-muted,#7b8797)}
.kd-as-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--kdn-ink,#25324a);font:inherit;font-size:13px}
.kd-as-panel h4{margin:2px 4px;font-size:11px;font-weight:800;color:var(--kdn-muted,#7b8797)}
.kd-as-panel h4 small{font-weight:600;margin-left:3px}
.kd-as-panel ul{list-style:none;margin:0;padding:0;display:grid;gap:1px}
.kd-as-panel li button{width:100%;display:grid;grid-template-columns:16px 1fr auto;align-items:center;gap:7px;padding:7px 8px;border:0;border-radius:8px;background:transparent;color:var(--kdn-ink,#25324a);font:inherit;font-size:13px;font-weight:650;cursor:pointer;text-align:left}
.kd-as-panel li button:hover{background:var(--kdn-surface-2,#f3f6fa)}
.kd-as-panel li button.is-on{background:var(--kdn-accent-soft,#eaf1fb)}
.kd-as-panel li button svg{color:var(--kdn-muted,#7b8797)}
.kd-as-panel li button em{font-style:normal;font-size:11px;color:var(--kdn-muted,#7b8797)}
.kd-as-empty,.kd-as-note{margin:0;padding:2px 4px;font-size:12px;color:var(--kdn-muted,#7b8797)}
.kd-imp{position:sticky;top:0;z-index:70;display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;padding:8px 16px;background:#4c1d95;color:#fff;font-size:13px}
.kd-imp>b{font-weight:800}
.kd-imp>small{opacity:.8;font-size:11.5px}
.kd-imp .kd-as-btn{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.35);color:#fff}
.kd-imp-back{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:9px;border:0;background:#fff;color:#4c1d95;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer}
`;
