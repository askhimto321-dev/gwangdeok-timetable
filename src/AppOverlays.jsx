import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Link2, MessageSquare, ArrowLeft, ArrowRight, Calendar, Search, X, Trash2, User, LayoutGrid } from "lucide-react";
import { readStorage, writeStorage } from "./storage.js";

// 새 UI 전용 화면 위 요소 세 가지
// 1) FabHub: 오른쪽 아래 둥근 버튼 하나 → 업무 바로가기 · 학사일정 · 검색 · 건의·버그 · 이전/다음 화면
// 2) CommandPalette: 어디서나 Ctrl+K(⌘K) → 학생 · 메뉴를 한 칸에서 찾아 이동
// 3) AcademicCalendarModal: 학사일정 달력(학교 공용 + 내 일정) · 다가오는 일정

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const pad = value => String(value).padStart(2, "0");
const ymd = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseDay = value => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "")); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; };
const mdw = date => `${date.getMonth() + 1}.${date.getDate()}(${WEEK[date.getDay()]})`;

export const fireOverlay = name => window.dispatchEvent(new CustomEvent(name));

export function FabHub({ depth = 0, maxDepth = 0, hasQuickLinks = false, hasSearch = false }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = event => { if (!event.target.closest?.(".kdn-fab")) setOpen(false); };
    const onKey = event => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const run = action => { setOpen(false); action(); };
  const mac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || "");
  const items = [
    hasQuickLinks && { key: "links", icon: <Link2 size={17} />, title: "업무 바로가기", sub: "나이스 · 에듀파인 · 내 바로가기", action: () => fireOverlay("kd:quicklinks") },
    { key: "cal", icon: <Calendar size={17} />, title: "학사일정", sub: "달력 · 내 일정", action: () => fireOverlay("kd:calendar") },
    hasSearch && { key: "search", icon: <Search size={17} />, title: "검색", sub: `학생 · 메뉴 · ${mac ? "⌘" : "Ctrl"}+K`, action: () => fireOverlay("kd:search") },
    { key: "fb", icon: <MessageSquare size={17} />, title: "건의 · 버그 보내기", sub: "화면 캡처 붙여넣기 가능", action: () => fireOverlay("kd:feedback") },
  ].filter(Boolean);
  return <div className="kdn-fab no-print">
    {open && <div className="kdn-fab-menu" role="menu">
      {items.map(item => <button key={item.key} type="button" role="menuitem" data-kdn-bare onClick={() => run(item.action)}><i>{item.icon}</i><span><b>{item.title}</b><small>{item.sub}</small></span></button>)}
      <div className="kdn-fab-nav">
        <button type="button" data-kdn-bare disabled={!(depth > 0)} onClick={() => run(() => window.history.back())}><ArrowLeft size={15} /> 이전 화면</button>
        <button type="button" data-kdn-bare disabled={!(depth < maxDepth)} onClick={() => run(() => window.history.forward())}>다음 화면 <ArrowRight size={15} /></button>
      </div>
    </div>}
    <button type="button" data-kdn-bare className={`kdn-fab-btn${open ? " is-open" : ""}`} aria-expanded={open} aria-label="빠른 메뉴" title="빠른 메뉴" onClick={() => setOpen(value => !value)}><Plus size={24} /></button>
  </div>;
}

// students: [{ sid, name, class, number }], menus: [{ key, label, sub, group, run }]
export function CommandPalette({ students = [], menus = [], onPickStudent }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  useEffect(() => {
    const onKey = event => {
      if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === "k") { event.preventDefault(); setOpen(value => !value); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("kd:search", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("kd:search", onOpen); };
  }, []);
  useEffect(() => { if (open) { setQuery(""); setCursor(0); window.setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);
  const results = useMemo(() => {
    const q = query.trim().replace(/\s+/g, "");
    const studentHits = !q ? [] : students.filter(student => {
      const classNo = `${student.class}-${student.number}`;
      return String(student.name || "").replace(/\s+/g, "").includes(q) || String(student.sid || "").startsWith(q) || classNo === q || `${student.class}반${student.number}번` === q;
    }).slice(0, 6).map(student => ({ type: "student", key: `s-${student.sid}`, title: student.name || "이름 없음", sub: `${student.sid} · ${student.class}반 ${student.number}번`, student }));
    const menuHits = menus.filter(item => !q || `${item.label}${item.sub || ""}${item.group || ""}`.replace(/\s+/g, "").includes(q)).slice(0, q ? 8 : 10).map(item => ({ type: "menu", key: `m-${item.key}`, title: item.label, sub: item.sub, item }));
    return [...studentHits, ...menuHits];
  }, [query, students, menus]);
  useEffect(() => { setCursor(0); }, [query]);
  if (!open) return null;
  const choose = entry => {
    if (!entry) return;
    setOpen(false);
    if (entry.type === "student") onPickStudent?.(entry.student.sid);
    else entry.item.run?.();
  };
  const onKeyDown = event => {
    if (event.key === "Escape") { setOpen(false); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); setCursor(value => Math.min(results.length - 1, value + 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setCursor(value => Math.max(0, value - 1)); }
    if (event.key === "Enter") { event.preventDefault(); choose(results[cursor]); }
  };
  let lastType = "";
  return <div className="kdn-cmdk-overlay no-print" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
    <div className="kdn-cmdk" role="dialog" aria-label="검색">
      <label className="kdn-cmdk-input"><Search size={19} /><input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={onKeyDown} placeholder="학생 이름 · 학번 · 반-번호 · 메뉴 이름" /><kbd>Esc</kbd></label>
      <div className="kdn-cmdk-list">
        {!results.length && <p className="kdn-cmdk-empty">찾는 결과가 없어요.</p>}
        {results.map((entry, index) => {
          const head = entry.type !== lastType ? (entry.type === "student" ? "학생" : query ? "메뉴" : "자주 쓰는 메뉴") : null;
          lastType = entry.type;
          return <React.Fragment key={entry.key}>
            {head && <small className="kdn-cmdk-group">{head}</small>}
            <button type="button" data-kdn-bare className={index === cursor ? "is-on" : ""} onMouseEnter={() => setCursor(index)} onClick={() => choose(entry)}>
              <i>{entry.type === "student" ? <User size={16} /> : <LayoutGrid size={16} />}</i>
              <span><b>{entry.title}</b>{entry.sub && <small>{entry.sub}</small>}</span>
              {index === cursor && <em>{entry.type === "student" ? "성적 리포트 ↵" : "열기 ↵"}</em>}
            </button>
          </React.Fragment>;
        })}
      </div>
      <div className="kdn-cmdk-foot"><span>↑↓ 이동</span><span>↵ 열기</span><span>Esc 닫기</span></div>
    </div>
  </div>;
}

// 개인 일정 저장 키: 계정마다 따로(학교 일정은 관리자가 관리자 › 학사일정에서 입력 → 모두에게 보임)
export const personalEventsKey = userKey => `kd_personal_events_u_${String(userKey || "guest").replace(/[^0-9A-Za-z가-힣_-]/g, "_").slice(0, 80)}`;

const eventTone = label => /시험|고사|평가/.test(label) ? "exam" : /휴|방학|공휴|개교|한글날|추석|설/.test(label) ? "off" : /수능|모의/.test(label) ? "csat" : "etc";

export function AcademicCalendarModal({ calendar = {}, userKey = "", canEditSchool = false, onOpenSchoolEditor }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [mine, setMine] = useState(null);
  const [draft, setDraft] = useState({ date: ymd(new Date()), endDate: "", label: "" });
  const [saving, setSaving] = useState(false);
  const key = personalEventsKey(userKey);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("kd:calendar", onOpen);
    return () => window.removeEventListener("kd:calendar", onOpen);
  }, []);
  useEffect(() => {
    if (!open || !userKey) return undefined;
    let alive = true;
    readStorage(key, []).then(value => { if (alive) setMine(Array.isArray(value) ? value : []); }).catch(() => alive && setMine([]));
    return () => { alive = false; };
  }, [open, key, userKey]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  const events = useMemo(() => {
    const school = (calendar?.events || []).filter(event => event?.label && parseDay(event.date)).map(event => ({ ...event, scope: "school", tone: eventTone(event.label) }));
    const personal = (mine || []).filter(event => event?.label && parseDay(event.date)).map(event => ({ ...event, scope: "mine", tone: "mine" }));
    return [...school, ...personal].map(event => { const start = parseDay(event.date); const end = parseDay(event.endDate) || start; return { ...event, start, end: end < start ? start : end }; }).sort((a, b) => a.start - b.start);
  }, [calendar, mine]);
  if (!open) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(first); gridStart.setDate(1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => { const date = new Date(gridStart); date.setDate(gridStart.getDate() + index); return date; });
  const lastRow = days.slice(35).every(date => date.getMonth() !== month.getMonth()) ? 35 : 42;
  const eventsOn = date => events.filter(event => event.start <= date && date <= event.end);
  const upcoming = events.filter(event => event.end >= today).slice(0, 8);
  const persistMine = async next => {
    setSaving(true);
    const result = await writeStorage(key, next).catch(() => ({ ok: false }));
    setSaving(false);
    if (result?.ok) setMine(next);
    else window.alert(result?.error || "내 일정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  };
  const add = async event => {
    event.preventDefault();
    const label = draft.label.trim();
    if (!label || !parseDay(draft.date)) return;
    const item = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, date: draft.date, endDate: draft.endDate && draft.endDate > draft.date ? draft.endDate : "", label: label.slice(0, 60) };
    await persistMine([...(mine || []), item]);
    setDraft(current => ({ ...current, label: "", endDate: "" }));
  };
  const remove = id => persistMine((mine || []).filter(item => item.id !== id));
  return <div className="kdn-cal-overlay no-print" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
    <section className="kdn-cal" role="dialog" aria-label="학사일정">
      <header className="kdn-cal-head">
        <b>학사일정</b>
        <span className="lg"><i className="exam" />시험 <i className="off" />휴일·방학 <i className="csat" />수능·모의 <i className="etc" />행사 <i className="mine" />내 일정</span>
        <button type="button" data-kdn-bare className="x" aria-label="닫기" onClick={() => setOpen(false)}><X size={18} /></button>
      </header>
      <div className="kdn-cal-body">
        <div className="kdn-cal-month">
          <div className="nav">
            <b>{month.getFullYear()}년 {month.getMonth() + 1}월</b>
            <span><button type="button" data-kdn-bare onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹ 이전</button><button type="button" data-kdn-bare onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>오늘</button><button type="button" data-kdn-bare onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>다음 ›</button></span>
          </div>
          <div className="grid">
            {WEEK.map((label, index) => <small key={label} className={`wd${index === 0 ? " sun" : index === 6 ? " sat" : ""}`}>{label}</small>)}
            {days.slice(0, lastRow).map(date => {
              const list = eventsOn(date);
              const out = date.getMonth() !== month.getMonth();
              return <div key={ymd(date)} className={`d${out ? " out" : ""}${date.getTime() === today.getTime() ? " today" : ""}`} onClick={() => setDraft(current => ({ ...current, date: ymd(date) }))} title="눌러서 내 일정 날짜로">
                <span className={`n${date.getDay() === 0 ? " sun" : date.getDay() === 6 ? " sat" : ""}`}>{date.getDate()}</span>
                {list.slice(0, 2).map(event => { const multi = event.end > event.start; const nth = Math.round((date - event.start) / 86400000) + 1; const short = String(event.label).split(/\s+/).slice(-1)[0]; return <em key={`${event.scope}-${event.id || event.label}-${event.date}`} className={event.tone} title={event.label}>{multi ? `${short} ${nth}일` : event.label}</em>; })}
                {list.length > 2 && <small className="more">+{list.length - 2}</small>}
              </div>;
            })}
          </div>
        </div>
        <aside className="kdn-cal-side">
          <h4>다가오는 일정</h4>
          {!upcoming.length ? <p className="empty">예정된 일정이 없어요.</p> : <ul className="up">{upcoming.map(event => {
            const days = Math.round((event.start - today) / 86400000);
            const ongoing = event.start <= today && today <= event.end;
            return <li key={`${event.scope}-${event.id || event.label}-${event.date}`} className={event.tone}>
              <span><b>{event.label}</b><small>{mdw(event.start)}{event.end > event.start ? ` ~ ${mdw(event.end)}` : ""}{event.scope === "mine" ? " · 내 일정" : ""}</small></span>
              <em className={ongoing ? "now" : days <= 7 ? "soon" : ""}>{ongoing ? "진행 중" : days === 0 ? "D-DAY" : `D-${days}`}</em>
              {event.scope === "mine" && <button type="button" data-kdn-bare aria-label={`${event.label} 지우기`} onClick={() => remove(event.id)}><Trash2 size={14} /></button>}
            </li>;
          })}</ul>}
          {userKey ? <form className="add" onSubmit={add}>
            <h4>내 일정 추가 <small>나만 보여요</small></h4>
            <div className="row"><input type="date" value={draft.date} onChange={event => setDraft(current => ({ ...current, date: event.target.value }))} aria-label="날짜" /><span>~</span><input type="date" value={draft.endDate} min={draft.date} onChange={event => setDraft(current => ({ ...current, endDate: event.target.value }))} aria-label="끝나는 날(선택)" /></div>
            <div className="row"><input value={draft.label} onChange={event => setDraft(current => ({ ...current, label: event.target.value }))} placeholder="예: 3반 상담 주간" maxLength={60} aria-label="일정 이름" /><button type="submit" disabled={saving || !draft.label.trim()}>{saving ? "저장 중" : "추가"}</button></div>
          </form> : <p className="empty">로그인하면 내 일정을 적을 수 있어요.</p>}
          <p className="note">학교 일정은 관리자가 학사일정에 일괄 입력하면 모든 사람에게 보여요.{canEditSchool && onOpenSchoolEditor && <> <button type="button" data-kdn-bare className="link" onClick={() => { setOpen(false); onOpenSchoolEditor(); }}>학교 일정 관리 ›</button></>}</p>
        </aside>
      </div>
    </section>
  </div>;
}
