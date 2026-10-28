// 선생님 ZONE '내 일정': 학교 학사일정 위에 내 일정을 적고, 미리 알림을 받습니다.
// 일정은 선생님마다 따로 저장됩니다(다른 선생님에게 보이지 않는 화면). 알림은 선생님 ZONE 홈 띠와 브라우저 알림으로 보여 줍니다.
import React from "react";
import { Bell, BellRing, Check, ChevronLeft, ChevronRight, Plus, Trash2, X, CalendarDays, Loader2 } from "lucide-react";
import { readStorage, updateStorage } from "./storage.js";
import { plannerKey, normalizeItem, normalizeItems, plannerAlerts, dLabel, monthCells, schoolEventsByDate, dateKey, REMIND_OPTIONS, PLANNER_COLORS } from "./teacherPlanner.js";

const COLOR_HEX = { orange: "#ea580c", blue: "#2563eb", green: "#16a34a", purple: "#7c3aed", red: "#dc2626" };
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export function usePlannerItems(owner) {
  const [items, setItems] = React.useState(null);
  React.useEffect(() => {
    let on = true;
    setItems(null);
    if (!owner) return () => {};
    readStorage(plannerKey(owner), { items: [] }).then(value => { if (on) setItems(normalizeItems(value?.items)); }).catch(() => { if (on) setItems([]); });
    return () => { on = false; };
  }, [owner]);
  return [items, setItems];
}

// 브라우저 알림: 허용했으면 하루 한 번, 알릴 일정이 있을 때만 띄웁니다.
function notifyOnce(owner, alerts) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted" || !alerts.length) return;
    const key = `kd_planner_notified_${owner}`;
    const today = dateKey(new Date());
    if (localStorage.getItem(key) === today) return;
    localStorage.setItem(key, today);
    const first = alerts[0];
    new Notification("KDTIME 내 일정", { body: `${dLabel(first.diff)} · ${first.title}${alerts.length > 1 ? ` 외 ${alerts.length - 1}건` : ""}`, tag: "kd-planner" });
  } catch { /* 알림을 못 띄워도 화면 띠로 보입니다 */ }
}

// 선생님 ZONE 홈 맨 위: 알릴 일정이 있을 때만 띠로 보여 줍니다.
export function PlannerHomeStrip({ owner, onOpen }) {
  const [items] = usePlannerItems(owner);
  const alerts = React.useMemo(() => plannerAlerts(items || []), [items]);
  React.useEffect(() => { notifyOnce(owner, alerts); }, [owner, alerts]);
  if (!owner || !items) return null;
  return <section className="kdp-strip" aria-label="내 일정 알림">
    <style dangerouslySetInnerHTML={{ __html: CSS }} />
    <span className="ic" aria-hidden="true">{alerts.length ? <BellRing size={20} /> : <CalendarDays size={20} />}</span>
    <div className="tx">
      <b>{alerts.length ? `내 일정 알림 ${alerts.length}건` : "내 일정"}</b>
      {alerts.length ? <span className="list">{alerts.slice(0, 4).map(item => <em key={item.id} className={item.overdue ? "late" : item.diff === 0 ? "today" : ""}><i>{dLabel(item.diff)}</i>{item.time ? `${item.time} ` : ""}{item.title}</em>)}{alerts.length > 4 && <em>외 {alerts.length - 4}건</em>}</span>
        : <small>회의·제출 마감 같은 내 일정을 적어 두면, 미리 알림 날짜에 여기와 브라우저 알림으로 알려 드려요.</small>}
    </div>
    <button type="button" data-kdn-bare onClick={onOpen}>{alerts.length ? "확인하기" : "일정 적기"}</button>
  </section>;
}

export default function TeacherPlanner({ owner, ownerName = "", calendar, showToast }) {
  const [items, setItems] = usePlannerItems(owner);
  const now = new Date();
  const [cursor, setCursor] = React.useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));
  const [selected, setSelected] = React.useState(() => dateKey(now));
  const [form, setForm] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [perm, setPerm] = React.useState(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));
  const school = React.useMemo(() => schoolEventsByDate(calendar), [calendar]);
  const list = items || [];
  const byDate = React.useMemo(() => list.reduce((map, item) => { (map[item.date] = map[item.date] || []).push(item); return map; }, {}), [list]);
  const alerts = plannerAlerts(list);
  const todayKey = dateKey(now);
  const cells = monthCells(cursor.y, cursor.m);

  const persist = async next => {
    setBusy(true);
    const result = await updateStorage(plannerKey(owner), { items: [] }, current => ({ ...(current || {}), owner: ownerName || owner, items: next(normalizeItems(current?.items)), updatedAt: new Date().toISOString() }));
    setBusy(false);
    if (result?.ok === false) { showToast?.("일정을 저장하지 못했어요. 다시 시도해 주세요.", "error"); return false; }
    setItems(normalizeItems(result?.value?.items));
    return true;
  };
  const save = async () => {
    const item = normalizeItem(form);
    if (!item.title || !item.date) return;
    if (await persist(current => [...current.filter(entry => entry.id !== item.id), item])) { setForm(null); setSelected(item.date); showToast?.("내 일정을 저장했어요.", "success"); }
  };
  const remove = async id => { if (window.confirm("이 일정을 지울까요?")) { await persist(current => current.filter(entry => entry.id !== id)); setForm(null); } };
  const toggleDone = item => persist(current => current.map(entry => (entry.id === item.id ? { ...entry, done: !entry.done } : entry)));
  const askPermission = async () => { try { setPerm(await Notification.requestPermission()); } catch { setPerm("denied"); } };
  const move = delta => setCursor(({ y, m }) => { const d = new Date(y, m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const newItem = date => setForm({ date: date || selected, time: "", title: "", memo: "", remind: 1, color: "orange" });
  const dayItems = byDate[selected] || [];
  const daySchool = school[selected] || [];
  const selDate = new Date(`${selected}T00:00:00`);

  if (!owner) return <div className="kdp"><style dangerouslySetInnerHTML={{ __html: CSS }} /><div className="kdp-empty">선생님 계정으로 로그인하면 내 일정을 쓸 수 있어요.</div></div>;
  return <div className="kdp">
    <style dangerouslySetInnerHTML={{ __html: CSS }} />
    <section className="kdp-head">
      <div className="t"><b>내 일정</b><small>학교 학사일정 위에 나만의 일정을 적어 두세요. 다른 선생님에게는 보이지 않아요. 미리 알림 날짜가 되면 선생님 ZONE 홈에서 알려 드려요.</small></div>
      <div className="acts">
        {perm === "default" && <button type="button" className="kdp-btn" onClick={askPermission}><Bell size={15} />브라우저 알림 켜기</button>}
        {perm === "granted" && <span className="kdp-perm"><BellRing size={14} />브라우저 알림 켜짐</span>}
        {perm === "denied" && <span className="kdp-perm off" title="브라우저 주소창 왼쪽 자물쇠 → 알림 허용으로 바꿀 수 있어요">브라우저 알림 차단됨</span>}
        <button type="button" className="kdp-btn pri" onClick={() => newItem()}><Plus size={15} />일정 추가</button>
      </div>
    </section>
    {alerts.length > 0 && <section className="kdp-alerts">{alerts.map(item => <button key={item.id} type="button" data-kdn-bare className={item.overdue ? "late" : item.diff === 0 ? "today" : ""} onClick={() => { setSelected(item.date); setCursor({ y: Number(item.date.slice(0, 4)), m: Number(item.date.slice(5, 7)) - 1 }); }}><i>{dLabel(item.diff)}</i><b>{item.title}</b><small>{item.date.slice(5).replace("-", "/")}{item.time ? ` ${item.time}` : ""}</small></button>)}</section>}
    <div className="kdp-main">
      <section className="kdp-cal">
        <div className="kdp-cal-hd"><button type="button" data-kdn-bare aria-label="이전 달" onClick={() => move(-1)}><ChevronLeft size={18} /></button><b>{cursor.y}년 {cursor.m + 1}월</b><button type="button" data-kdn-bare aria-label="다음 달" onClick={() => move(1)}><ChevronRight size={18} /></button><button type="button" data-kdn-bare className="today" onClick={() => { setCursor({ y: now.getFullYear(), m: now.getMonth() }); setSelected(todayKey); }}>오늘</button></div>
        <div className="kdp-grid">{WEEK.map((w, i) => <span key={w} className={`wd w${i}`}>{w}</span>)}
          {cells.map(cell => { const mine = byDate[cell.key] || []; const sch = school[cell.key] || []; return <button key={cell.key} type="button" data-kdn-bare className={`cell w${cell.weekday}${cell.inMonth ? "" : " out"}${cell.key === todayKey ? " is-today" : ""}${cell.key === selected ? " is-sel" : ""}`} onClick={() => setSelected(cell.key)} onDoubleClick={() => newItem(cell.key)}>
            <span className="d">{cell.day}</span>
            {sch.slice(0, 1).map((label, i) => <span key={i} className="sch">{label}</span>)}
            {mine.slice(0, 2).map(item => <span key={item.id} className={`me${item.done ? " done" : ""}`} style={{ "--c": COLOR_HEX[item.color] }}>{item.title}</span>)}
            {(mine.length > 2 || sch.length > 1) && <span className="more">+{Math.max(0, mine.length - 2) + Math.max(0, sch.length - 1)}</span>}
          </button>; })}
        </div>
        <p className="kdp-legend"><span className="sch">학교 학사일정</span><span className="me" style={{ "--c": COLOR_HEX.orange }}>내 일정</span><small>날짜를 두 번 누르면 바로 일정 추가</small></p>
      </section>
      <section className="kdp-day">
        <div className="kdp-day-hd"><b>{selDate.getMonth() + 1}월 {selDate.getDate()}일 {WEEK[selDate.getDay()]}요일</b>{selected === todayKey && <em>오늘</em>}<span className="sp" /><button type="button" className="kdp-btn sm" onClick={() => newItem(selected)}><Plus size={14} />이 날 추가</button></div>
        {items == null ? <div className="kdp-empty"><Loader2 size={16} className="spin" /> 불러오는 중…</div> : <>
          {daySchool.length > 0 && <div className="kdp-school">{daySchool.map((label, i) => <span key={i}><CalendarDays size={13} />{label}</span>)}</div>}
          {dayItems.length ? dayItems.map(item => <article key={item.id} className={`kdp-item${item.done ? " done" : ""}`} style={{ "--c": COLOR_HEX[item.color] }}>
            <button type="button" data-kdn-bare className="chk" aria-pressed={item.done} aria-label={item.done ? "안 끝냄으로" : "끝냄으로"} onClick={() => toggleDone(item)}>{item.done && <Check size={14} />}</button>
            <div className="body" onClick={() => setForm(item)}><b>{item.time && <time>{item.time}</time>}{item.title}</b>{item.memo && <p>{item.memo}</p>}<small>{item.remind >= 0 ? `${REMIND_OPTIONS.find(([v]) => v === item.remind)?.[1]} 알림` : "알림 없음"}</small></div>
          </article>) : <div className="kdp-empty">이 날 내 일정이 없어요.</div>}
        </>}
      </section>
    </div>
    {form && <div className="kdp-modal-bg" role="dialog" aria-modal="true" aria-label="내 일정" onClick={event => { if (event.target === event.currentTarget) setForm(null); }}>
      <div className="kdp-modal">
        <div className="hd"><b>{list.some(item => item.id === form.id) ? "일정 고치기" : "일정 추가"}</b><button type="button" data-kdn-bare aria-label="닫기" onClick={() => setForm(null)}><X size={16} /></button></div>
        <label>제목<input autoFocus value={form.title} maxLength={80} placeholder="예: 학년 협의회, 생기부 마감" onChange={event => setForm({ ...form, title: event.target.value })} onKeyDown={event => { if (event.key === "Enter") save(); }} /></label>
        <div className="row"><label>날짜<input type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></label><label>시간(선택)<input type="time" value={form.time} onChange={event => setForm({ ...form, time: event.target.value })} /></label></div>
        <label>미리 알림<div className="seg">{REMIND_OPTIONS.map(([value, text]) => <button key={value} type="button" data-kdn-bare aria-pressed={Number(form.remind) === value} onClick={() => setForm({ ...form, remind: value })}>{text}</button>)}</div></label>
        <label>색<div className="colors">{PLANNER_COLORS.map(color => <button key={color} type="button" data-kdn-bare aria-label={color} aria-pressed={form.color === color} style={{ "--c": COLOR_HEX[color] }} onClick={() => setForm({ ...form, color })} />)}</div></label>
        <label>메모(선택)<textarea rows={3} value={form.memo} maxLength={500} onChange={event => setForm({ ...form, memo: event.target.value })} /></label>
        <div className="ft">{list.some(item => item.id === form.id) && <button type="button" className="kdp-btn del" onClick={() => remove(form.id)}><Trash2 size={14} />지우기</button>}<span className="sp" /><button type="button" className="kdp-btn" onClick={() => setForm(null)}>취소</button><button type="button" className="kdp-btn pri" disabled={busy || !String(form.title).trim() || !form.date} onClick={save}>{busy ? <Loader2 size={14} className="spin" /> : null}저장</button></div>
      </div>
    </div>}
  </div>;
}

const CSS = `
.kdp{display:grid;gap:14px;color:var(--kdn-ink,#1f2937)}
.kdp-head{display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px;padding:16px 18px;border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff)}
.kdp-head .t{display:grid;gap:3px;flex:1 1 280px}.kdp-head .t b{font-size:19px;font-weight:800}.kdp-head .t small{font-size:13.5px;line-height:1.5;color:var(--kdn-muted,#64748b)}
.kdp-head .acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.kdp-btn{display:inline-flex;align-items:center;gap:6px;min-height:38px;padding:0 14px;border-radius:10px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#1f2937);font:inherit;font-size:14px;font-weight:700;cursor:pointer}
.kdp-btn.pri{background:var(--kdn-accent,#ea580c);border-color:var(--kdn-accent,#ea580c);color:#fff}.kdp-btn.sm{min-height:32px;padding:0 10px;font-size:13px}.kdp-btn.del{color:#b91c1c}.kdp-btn:disabled{opacity:.5;cursor:default}
.kdp-perm{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:99px;background:color-mix(in srgb,#16a34a 13%,transparent);color:#15803d;font-size:12.5px;font-weight:800}.kdp-perm.off{background:var(--kdn-surface-2,#f1f5f9);color:var(--kdn-muted,#64748b)}
.kdp-alerts{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}
.kdp-alerts button{flex:0 0 auto;display:grid;grid-template-columns:auto 1fr;grid-template-areas:"i b" "i s";gap:0 10px;align-items:center;min-width:180px;padding:10px 14px;border-radius:13px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff);font:inherit;color:inherit;text-align:left;cursor:pointer}
.kdp-alerts i{grid-area:i;font-style:normal;padding:4px 9px;border-radius:99px;background:color-mix(in srgb,#2563eb 13%,transparent);color:#1d4ed8;font-size:12.5px;font-weight:900}
.kdp-alerts .today i{background:#ea580c;color:#fff}.kdp-alerts .late i{background:color-mix(in srgb,#dc2626 14%,transparent);color:#b91c1c}
.kdp-alerts b{grid-area:b;font-size:14px;font-weight:800}.kdp-alerts small{grid-area:s;font-size:12px;color:var(--kdn-muted,#64748b)}
.kdp-main{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(260px,1fr);gap:14px;align-items:start}
.kdp-cal,.kdp-day{display:grid;gap:10px;padding:16px;border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff);min-width:0}
.kdp-cal-hd{display:flex;align-items:center;gap:8px}.kdp-cal-hd b{font-size:17px;font-weight:850;min-width:110px;text-align:center}
.kdp-cal-hd button{display:grid;place-items:center;min-width:34px;height:34px;border-radius:9px;border:1px solid var(--kdn-line,#d5dbe3);background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:13px;font-weight:800}.kdp-cal-hd .today{margin-left:auto;padding:0 12px}
.kdp-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.kdp-grid .wd{text-align:center;font-size:12.5px;font-weight:800;color:var(--kdn-muted,#64748b);padding:2px 0}.kdp-grid .w0{color:#dc2626}.kdp-grid .w6{color:#2563eb}
.kdp-grid .cell{display:flex;flex-direction:column;align-items:stretch;gap:2px;min-height:88px;padding:5px;border-radius:10px;border:1.5px solid transparent;background:var(--kdn-surface-2,#f8fafc);font:inherit;color:inherit;text-align:left;cursor:pointer;min-width:0;overflow:hidden}
.kdp-grid .cell:hover{border-color:var(--kdn-line,#cbd5e1)}.kdp-grid .cell.out{opacity:.42}
.kdp-grid .cell .d{font-size:13px;font-weight:800}.kdp-grid .cell.w0 .d{color:#dc2626}.kdp-grid .cell.w6 .d{color:#2563eb}
.kdp-grid .cell.is-today .d{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:99px;background:var(--kdn-accent,#ea580c);color:#fff}
.kdp-grid .cell.is-sel{border-color:var(--kdn-accent,#ea580c);background:color-mix(in srgb,var(--kdn-accent,#ea580c) 8%,var(--kdn-surface,#fff))}
.kdp .sch,.kdp .me{display:block;padding:1px 6px;border-radius:5px;font-size:11.5px;font-weight:700;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kdp .sch{background:color-mix(in srgb,#64748b 14%,transparent);color:var(--kdn-ink-soft,#334155)}
.kdp .me{background:color-mix(in srgb,var(--c) 16%,transparent);color:var(--c);border-left:3px solid var(--c)}.kdp .me.done{text-decoration:line-through;opacity:.6}
.kdp-grid .more{font-size:11px;font-weight:800;color:var(--kdn-muted,#64748b)}
.kdp-legend{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0}.kdp-legend small{font-size:12px;color:var(--kdn-muted,#64748b)}
.kdp-day-hd{display:flex;align-items:center;gap:8px}.kdp-day-hd b{font-size:16px;font-weight:850}.kdp-day-hd em{font-style:normal;padding:2px 8px;border-radius:99px;background:var(--kdn-accent,#ea580c);color:#fff;font-size:12px;font-weight:800}.kdp-day-hd .sp{flex:1}
.kdp-school{display:flex;flex-wrap:wrap;gap:6px}.kdp-school span{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:99px;background:var(--kdn-surface-2,#f1f5f9);font-size:12.5px;font-weight:700}
.kdp-item{display:grid;grid-template-columns:26px minmax(0,1fr);gap:10px;align-items:start;padding:12px 14px;border-radius:12px;border:1px solid var(--kdn-line,#e2e8f0);border-left:4px solid var(--c)}
.kdp-item .chk{display:grid;place-items:center;width:24px;height:24px;margin-top:1px;border-radius:7px;border:2px solid var(--c);background:transparent;color:#fff;cursor:pointer}.kdp-item .chk[aria-pressed="true"]{background:var(--c)}
.kdp-item .body{display:grid;gap:3px;cursor:pointer;min-width:0}.kdp-item b{font-size:14.5px;font-weight:800}.kdp-item time{margin-right:6px;color:var(--c)}.kdp-item p{margin:0;font-size:13px;white-space:pre-wrap;color:var(--kdn-ink-soft,#334155)}.kdp-item small{font-size:12px;color:var(--kdn-muted,#64748b)}
.kdp-item.done b{text-decoration:line-through;color:var(--kdn-muted,#64748b)}
.kdp-empty{padding:22px;text-align:center;font-size:13.5px;color:var(--kdn-muted,#64748b)}
.kdp-modal-bg{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:16px;background:rgba(15,23,42,.45)}
.kdp-modal{width:min(460px,100%);display:grid;gap:12px;padding:20px;border-radius:18px;background:var(--kdn-surface,#fff);color:var(--kdn-ink,#1f2937);box-shadow:0 24px 60px rgba(15,23,42,.3)}
.kdp-modal .hd{display:flex;align-items:center}.kdp-modal .hd b{flex:1;font-size:17px;font-weight:850}.kdp-modal .hd button{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;border:1px solid var(--kdn-line,#d5dbe3);background:transparent;color:inherit;cursor:pointer}
.kdp-modal label{display:grid;gap:5px;font-size:13px;font-weight:800;color:var(--kdn-ink-soft,#334155)}
.kdp-modal input,.kdp-modal textarea{min-height:38px;padding:7px 10px;border-radius:9px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#1f2937);font:inherit;font-size:14px;font-weight:500;box-sizing:border-box;width:100%}
.kdp-modal .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.kdp-modal .seg{display:flex;flex-wrap:wrap;gap:5px}.kdp-modal .seg button{min-height:32px;padding:0 11px;border-radius:99px;border:1px solid var(--kdn-line,#d5dbe3);background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:700;cursor:pointer}.kdp-modal .seg button[aria-pressed="true"]{background:var(--kdn-accent,#ea580c);border-color:var(--kdn-accent,#ea580c);color:#fff}
.kdp-modal .colors{display:flex;gap:8px}.kdp-modal .colors button{width:28px;height:28px;border-radius:99px;border:3px solid transparent;background:var(--c);cursor:pointer}.kdp-modal .colors button[aria-pressed="true"]{border-color:var(--kdn-surface,#fff);box-shadow:0 0 0 2px var(--c)}
.kdp-modal .ft{display:flex;gap:8px;align-items:center}.kdp-modal .ft .sp{flex:1}
.kdp-strip{display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px;padding:14px 18px;border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff)}
.kdp-strip .ic{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;background:color-mix(in srgb,#2563eb 12%,transparent);color:#1d4ed8}
.kdp-strip .tx{display:grid;gap:5px;flex:1 1 260px;min-width:0}.kdp-strip .tx b{font-size:15.5px;font-weight:850}.kdp-strip .tx small{font-size:13px;color:var(--kdn-muted,#64748b)}
.kdp-strip .list{display:flex;flex-wrap:wrap;gap:6px}.kdp-strip .list em{display:inline-flex;align-items:center;gap:6px;padding:4px 10px 4px 4px;border-radius:99px;background:var(--kdn-surface-2,#f1f5f9);font-style:normal;font-size:13px;font-weight:700}
.kdp-strip .list em i{font-style:normal;padding:2px 8px;border-radius:99px;background:color-mix(in srgb,#2563eb 14%,transparent);color:#1d4ed8;font-size:12px;font-weight:900}
.kdp-strip .list em.today i{background:#ea580c;color:#fff}.kdp-strip .list em.late i{background:color-mix(in srgb,#dc2626 15%,transparent);color:#b91c1c}
.kdp-strip>button{min-height:40px;padding:0 16px;border-radius:11px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#1f2937);font:inherit;font-size:14px;font-weight:800;cursor:pointer}
[data-kd-ui="dark"] .kdp-alerts i,[data-kd-ui="dark"] .kdp-strip .list em i,[data-kd-ui="dark"] .kdp-strip .ic{color:#93c5fd}
@media (max-width:900px){.kdp-main{grid-template-columns:minmax(0,1fr)}.kdp-grid .cell{min-height:58px}.kdp-grid .cell .sch,.kdp-grid .cell .me{font-size:10px;padding:0 3px}}
`;
