// 넓은 화면의 좌우 빈 공간: 왼쪽 = 찾기 칸, 오른쪽 = 오늘 할 일 · 다가오는 일정.
// 화면이 좁으면 CSS로 숨기고, 그때는 오른쪽 아래 [오늘 할 일] 창과 위쪽 찾기 칸을 그대로 씁니다.
import React from "react";
import { Search, CalendarDays, ChevronRight, Clock } from "lucide-react";
import { usePlannerData, ItemRow } from "./TeacherPlanner.jsx";
import { todayItems, expandOccurrences, dateKey, shiftKey, dayNo, dLabel, schoolEventsByDate } from "./teacherPlanner.js";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const openSearch = query => window.dispatchEvent(new CustomEvent("kd:search", { detail: { query } }));

// 왼쪽은 찾기 칸 하나만 둡니다. 최근 본 학생은 Ctrl+K 찾기에서, 메뉴는 위쪽 메뉴에서 바로 보이므로 겹쳐 두지 않습니다.
function LeftRail({ canSearch }) {
  const [text, setText] = React.useState("");
  return <aside className="kdn-rail is-left no-print" aria-label="찾기">
    {canSearch && <section className="kdn-rail-card">
      <b className="hd">찾기</b>
      <label className="kdn-rail-find"><Search size={16} aria-hidden="true" /><input value={text} placeholder="학생·메뉴·할 일" title="'11/5 협의회'처럼 적으면 내 일정에 바로 추가돼요" aria-label="학생·메뉴 찾기"
        onChange={event => { const value = event.target.value; setText(""); openSearch(value); }}
        onFocus={event => { if (event.target.value) openSearch(event.target.value); }} /><kbd>Ctrl K</kbd></label>
      <small className="tip">최근 본 학생은 찾기 창을 열면 맨 위에 보여요</small>
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

// 패널을 켤지(남는 폭이 충분할 때만)와 위쪽 메뉴 높이를 재서 html에 표시합니다.
// 켜지면 CSS가 가운데 내용을 좌우로 비켜 놓아(패딩) 패널과 겹치지 않게 하고, 패널은 메뉴 바로 아래에서 시작합니다.
const RAIL_MIN_WIDTH = 1860;
function useRailLayout() {
  React.useEffect(() => {
    const root = document.documentElement;
    const zoomOf = () => ({ large: 1.08, xlarge: 1.16 })[root.dataset.kdFont] || 1;
    const update = () => {
      const zoom = zoomOf();
      const on = window.innerWidth / zoom >= RAIL_MIN_WIDTH;
      root.dataset.kdRails = on ? "on" : "off";
      const nav = document.querySelector(".kdn-top-nav");
      const navBottom = nav ? nav.getBoundingClientRect().height / zoom : 68;
      root.style.setProperty("--kdn-rail-top", `${Math.round(navBottom + 16)}px`);
    };
    update();
    window.addEventListener("resize", update);
    const nav = document.querySelector(".kdn-top-nav");
    const resize = typeof ResizeObserver !== "undefined" && nav ? new ResizeObserver(update) : null;
    resize?.observe(nav);
    const attrs = new MutationObserver(update);
    attrs.observe(root, { attributes: true, attributeFilter: ["data-kd-font"] });
    return () => { window.removeEventListener("resize", update); resize?.disconnect(); attrs.disconnect(); delete root.dataset.kdRails; };
  }, []);
}

export default function SideRails({ owner = "", calendar, onOpenPlanner, canSearch = false }) {
  useRailLayout();
  return <>
    <LeftRail canSearch={canSearch} />
    <RightRail owner={owner} calendar={calendar} onOpenPlanner={onOpenPlanner} />
  </>;
}
