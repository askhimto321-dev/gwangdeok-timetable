// 넓은 화면(가로 1640px 이상)의 좌우 빈 공간: 왼쪽 = 찾기 칸 · 최근 본 학생 · 자주 쓰는 메뉴, 오른쪽 = 오늘 할 일 · 다가오는 일정.
// 화면이 좁으면 CSS로 숨기고, 그때는 오른쪽 아래 [오늘 할 일] 창과 위쪽 찾기 칸을 그대로 씁니다.
import React from "react";
import { Search, CalendarDays, ChevronRight, Clock } from "lucide-react";
import { usePlannerData, ItemRow } from "./TeacherPlanner.jsx";
import { todayItems, expandOccurrences, dateKey, shiftKey, dayNo, dLabel, schoolEventsByDate } from "./teacherPlanner.js";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const openSearch = query => window.dispatchEvent(new CustomEvent("kd:search", { detail: { query } }));

function LeftRail({ recent = [], menus = [], onPickStudent, canSearch }) {
  const [text, setText] = React.useState("");
  return <aside className="kdn-rail is-left no-print" aria-label="찾기와 바로가기">
    {canSearch && <section className="kdn-rail-card">
      <b className="hd">찾기</b>
      <label className="kdn-rail-find"><Search size={16} aria-hidden="true" /><input value={text} placeholder="학생 이름·학번·메뉴" aria-label="학생·메뉴 찾기"
        onChange={event => { const value = event.target.value; setText(""); openSearch(value); }}
        onFocus={event => { if (event.target.value) openSearch(event.target.value); }} /><kbd>Ctrl K</kbd></label>
      <small className="tip">'11/5 협의회'처럼 적으면 내 일정에 바로 추가돼요</small>
    </section>}
    {recent.length > 0 && <section className="kdn-rail-card">
      <b className="hd">최근 본 학생</b>
      <div className="kdn-rail-list">{recent.map(student => <button key={student.sid} type="button" data-kdn-bare onClick={() => onPickStudent?.(student.sid)}><i aria-hidden="true">{String(student.name || "?").charAt(0)}</i><span><b>{student.name}</b><small>{student.sid} · {student.class}반 {student.number}번</small></span></button>)}</div>
    </section>}
    {menus.length > 0 && <section className="kdn-rail-card">
      <b className="hd">자주 쓰는 메뉴</b>
      <div className="kdn-rail-menu">{menus.map(item => <button key={item.key} type="button" data-kdn-bare onClick={item.run}><span>{item.label}</span><ChevronRight size={15} aria-hidden="true" /></button>)}</div>
    </section>}
  </aside>;
}

function RightRail({ owner, calendar, onOpenPlanner }) {
  const { all, toggleDone } = usePlannerData(owner);
  const today = dateKey(new Date());
  const todays = React.useMemo(() => (owner ? todayItems(all || []) : []), [owner, all]);
  const upcoming = React.useMemo(() => (owner ? expandOccurrences(all || [], shiftKey(today, 1), shiftKey(today, 7)).filter(item => !item.done).slice(0, 5) : []), [owner, all, today]);
  const school = React.useMemo(() => {
    const map = schoolEventsByDate(calendar);
    const out = [];
    for (let i = 0; i <= 14 && out.length < 5; i += 1) { const key = shiftKey(today, i); (map[key] || []).forEach(label => { if (!out.some(e => e.label === label)) out.push({ key, label }); }); }
    return out.slice(0, 5);
  }, [calendar, today]);
  const pending = todays.filter(item => !item.done).length;
  return <aside className="kdn-rail is-right no-print" aria-label="오늘 할 일과 다가오는 일정">
    {owner && <section className="kdn-rail-card">
      <div className="hd-row"><b className="hd">오늘 할 일</b><em className={pending ? "" : "ok"}>{all == null ? "…" : pending ? `${pending}건 남음` : "모두 끝냄"}</em></div>
      {todays.length ? <div className="kdp-list">{todays.map(item => <ItemRow key={item.occKey} item={item} compact onToggle={toggleDone} showDate={item.overdue} />)}</div> : <small className="none">오늘 일정이 없어요</small>}
      {upcoming.length > 0 && <>
        <b className="hd sub">7일 안</b>
        <div className="kdn-rail-up">{upcoming.map(item => <span key={item.occKey}><em>{dLabel(dayNo(item.date) - dayNo(today))}</em><b>{item.title}</b></span>)}</div>
      </>}
      {onOpenPlanner && <button type="button" data-kdn-bare className="go" onClick={onOpenPlanner}>내 일정 열기 <ChevronRight size={14} /></button>}
    </section>}
    {school.length > 0 && <section className="kdn-rail-card">
      <b className="hd"><CalendarDays size={15} /> 다가오는 학사일정</b>
      <div className="kdn-rail-up">{school.map(event => { const d = new Date(`${event.key}T00:00:00`); return <span key={`${event.key}-${event.label}`}><em className="day">{d.getMonth() + 1}/{d.getDate()}({WEEK[d.getDay()]})</em><b>{event.label}</b></span>; })}</div>
    </section>}
    {!owner && !school.length && <section className="kdn-rail-card"><small className="none"><Clock size={14} /> 다가오는 일정이 없어요</small></section>}
  </aside>;
}

export default function SideRails({ owner = "", calendar, recent = [], menus = [], onPickStudent, onOpenPlanner, canSearch = false }) {
  return <>
    <LeftRail recent={recent} menus={menus} onPickStudent={onPickStudent} canSearch={canSearch} />
    <RightRail owner={owner} calendar={calendar} onOpenPlanner={onOpenPlanner} />
  </>;
}
