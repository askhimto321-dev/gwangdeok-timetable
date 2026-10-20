// 선생님 ZONE › 수업 포트폴리오 (수학 도장노트 기능을 KDTIME으로 옮기고 넓힘)
// - 반·분반 명단은 KDTIME 학생 명단(학급 고정 수업)·이동수업 출석부(이동수업)에서 바로 가져옵니다(따로 입력하지 않음).
// - 오늘 수업: 날짜·교시(시각으로 자동)·차시로 수업을 열고 학생 칸을 눌러 도장 → 결석 → 비움
// - 도장판: 학생 × 차시 표에서 바로 찍기(전체 차시를 미리 만들 수 있음)
// - 도장마다 '찍은 날짜·시각·선생님'을 남깁니다(결석 후 다음 날 찍은 도장 확인).
// - 포트폴리오 채점: 도장판(도장률 비례·구간) + 오답노트·모의고사 풀이·피드백 등 여러 항목
// - 저장: 바꾸기마다 기기에 먼저 적어 두고(저장 대기) 서버에 보냅니다. 연결이 끊겨도 기기에 남아 있다가 자동으로 다시 보냅니다.
//   서버는 도장부마다 kd_stamps__{학년-학기-과목-반}(같은 반 선생님끼리 함께 씀), 덮어쓸 때마다 자동 백업.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stamp, Plus, Trash2, Copy, Users, Award, ShieldCheck, CalendarDays, Check, Grid3x3, Download, CloudOff, Cloud, Loader2, Settings2, Sparkles } from "lucide-react";
import { readStorage, updateStorage } from "./storage.js";
import { booksForAssignment, emptyBook, normalizeBook, sessionsAsc, sessionHeld, stampStats, stampScore, stampMax, itemScore, itemMax, totalFor, totalMax, csbStatus, nextMark, markOf, markAt, markBy, applyOp, nextSessionFor, periodAt, localIso, presetPortfolio, PERIOD_TIMES, MATH_UNITS, ITEM_TEMPLATES } from "./lessonStamps.js";

const storeKey = id => `kd_stamps__${id}`;
const queueKey = id => `kd_stamps_q__${id}`;
const copyKey = id => `kd_stamps_copy__${id}`;
const readLocal = (key, fallback) => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } };
const writeLocal = (key, value) => { try { if (value == null || (Array.isArray(value) && !value.length)) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* 기기 저장 공간 부족 등 */ } };
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const dayLabel = iso => { if (!iso) return ""; const [y, m, d] = iso.split("-").map(Number); return `${m}.${d} (${WD[new Date(y, m - 1, d).getDay()]})`; };
const shortDay = iso => { if (!iso) return ""; const [, m, d] = iso.split("-").map(Number); return `${m}.${d}`; };
const stampTime = iso => { if (!iso) return ""; const d = new Date(iso); if (Number.isNaN(d.getTime())) return ""; return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const stampDay = iso => { if (!iso) return ""; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : localIso(d); };
// 수업 날짜보다 뒤에 찍은 도장(결석 후 다음 날 등)
const isLate = (session, value) => markOf(value) === "stamp" && !!markAt(value) && !!session?.date && stampDay(markAt(value)) > session.date;
const uid = prefix => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const clone = value => JSON.parse(JSON.stringify(value));
const copyText = async (text, showToast) => { try { await navigator.clipboard.writeText(text); showToast?.("복사했어요. 엑셀에 붙여 넣으세요.", "success"); } catch { showToast?.("복사하지 못했어요.", "error"); } };
const withTimeout = (promise, ms) => Promise.race([promise, new Promise(resolve => setTimeout(() => resolve({ ok: false, error: "응답 없음(연결 확인)" }), ms))]);
const sessionName = (s, index) => `${Number(s.no) || index + 1}차시`;
const seatOf = (meta, st) => (meta.kind === "common" ? `${st.number}` : `${st.class}-${st.number}`);

export default function LessonStamps({ teacher, db = {}, grade = "2", semester = "sem1", showToast }) {
  const scope = `${grade}-${semester}`;
  const roster = db?.roster?.[scope] || {};
  const enrollments = db?.enrollments?.[scope] || {};
  // 이 학년·학기 담당 과목 → 반·분반별 도장부
  const books = useMemo(() => {
    const list = (teacher?.assignments || []).filter(item => item?.subject && String(item.grade || grade) === String(grade) && String(item.semester || semester) === String(semester));
    const out = [];
    list.forEach(item => booksForAssignment(item, { roster, enrollments, grade, semester }).forEach(book => { if (!out.some(other => other.id === book.id)) out.push(book); }));
    return out;
  }, [teacher, roster, enrollments, grade, semester]);
  const [pickedId, setPickedId] = useState(() => { try { return localStorage.getItem(`kd_stamps_last_${teacher?.id || "t"}`) || ""; } catch { return ""; } });
  const meta = books.find(book => book.id === pickedId) || books[0] || null;
  useEffect(() => { if (meta) try { localStorage.setItem(`kd_stamps_last_${teacher?.id || "t"}`, meta.id); } catch { /* 기억 못 해도 됨 */ } }, [meta?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState(() => { try { return localStorage.getItem("kd_stamps_tab") || "lesson"; } catch { return "lesson"; } });
  useEffect(() => { try { localStorage.setItem("kd_stamps_tab", tab); } catch { /* 무시 */ } }, [tab]);
  const [focusSession, setFocusSession] = useState("");

  const info = meta ? { id: meta.id, subject: meta.subject, target: meta.target, grade, semester } : null;
  const [serverBook, setServerBook] = useState(null);
  const [pending, setPending] = useState([]);
  const [save, setSave] = useState({ state: "idle", at: "", error: "", offline: false });
  const flushing = useRef(false);
  const again = useRef(false);
  const retryTimer = useRef(0);
  const idRef = useRef("");
  idRef.current = meta?.id || "";

  // 서버 저장: 기기에 적어 둔 바꾸기 묶음을 서버 최신본에 적용해 한 번에 저장(트랜잭션)
  const flush = useCallback(async () => {
    const id = idRef.current;
    if (!id || !info) return;
    if (flushing.current) { again.current = true; return; }
    const batch = readLocal(queueKey(id), []);
    if (!batch.length) return;
    flushing.current = true;
    setSave(current => ({ ...current, state: "saving" }));
    const result = await withTimeout(updateStorage(storeKey(id), emptyBook(info), current => batch.reduce((book, op) => applyOp(book, op), clone(normalizeBook(current, info)))), 20000);
    flushing.current = false;
    if (idRef.current !== id) return;
    if (result.ok) {
      const rest = readLocal(queueKey(id), []).slice(batch.length);
      writeLocal(queueKey(id), rest);
      setPending(rest);
      const value = normalizeBook(result.value, info);
      setServerBook(value);
      writeLocal(copyKey(id), value);
      setSave({ state: rest.length ? "saving" : "saved", at: new Date().toISOString(), error: "", offline: false });
      if (rest.length || again.current) { again.current = false; flush(); }
    } else {
      setSave(current => ({ ...current, state: "error", error: result.error || "저장 실패" }));
      window.clearTimeout(retryTimer.current);
      retryTimer.current = window.setTimeout(() => flush(), 8000);
    }
  }, [info?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 도장부 불러오기(+ 기기에 남은 저장 대기분 다시 보내기) · 20초마다 다른 선생님 변경 반영
  useEffect(() => {
    if (!meta) return undefined;
    let alive = true;
    const id = meta.id;
    setServerBook(null);
    setPending(readLocal(queueKey(id), []));
    setSave({ state: "idle", at: "", error: "", offline: false });
    const load = () => readStorage(storeKey(id), null, { throwOnError: true })
      .then(value => { if (!alive) return; const book = normalizeBook(value, info); setServerBook(book); writeLocal(copyKey(id), book); setSave(current => ({ ...current, offline: false })); if (readLocal(queueKey(id), []).length) flush(); })
      .catch(() => { if (!alive) return; const copy = readLocal(copyKey(id), null); setServerBook(current => current || normalizeBook(copy, info)); setSave(current => ({ ...current, offline: true })); if (readLocal(queueKey(id), []).length) flush(); });
    load();
    const timer = window.setInterval(() => { if (!document.hidden) load(); }, 20000);
    const onOnline = () => { load(); flush(); };
    window.addEventListener("online", onOnline);
    return () => { alive = false; window.clearInterval(timer); window.clearTimeout(retryTimer.current); window.removeEventListener("online", onOnline); };
  }, [meta?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 다른 반·분반에 남은 저장 대기분도 열 때 바로 보냅니다(그 반을 다시 열지 않아도 저장되게).
  useEffect(() => {
    let keys = [];
    try { keys = Object.keys(localStorage).filter(key => key.startsWith("kd_stamps_q__")); } catch { keys = []; }
    keys.forEach(async key => {
      const id = key.slice("kd_stamps_q__".length);
      if (id === idRef.current) return;
      const batch = readLocal(key, []);
      if (!batch.length) return;
      const result = await withTimeout(updateStorage(storeKey(id), emptyBook({ id }), current => batch.reduce((acc, op) => applyOp(acc, op), clone(normalizeBook(current, { id })))), 20000);
      if (result.ok) writeLocal(key, readLocal(key, []).slice(batch.length));
    });
  }, []);

  // 페이지를 닫으려는데 저장 대기분이 있으면 한 번 묻습니다(기기에는 남아 있어 다음에 열면 다시 보냄).
  useEffect(() => {
    const onLeave = event => { if (readLocal(queueKey(idRef.current), []).length) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, []);

  const book = useMemo(() => (serverBook ? pending.reduce((acc, op) => applyOp(acc, op), clone(serverBook)) : null), [serverBook, pending]);
  const act = op => {
    if (!meta) return;
    const next = [...readLocal(queueKey(meta.id), []), op];
    writeLocal(queueKey(meta.id), next);
    setPending(next);
    flush();
  };
  const who = teacher?.name || teacher?.id || "";
  const downloadBackup = () => {
    if (!book) return;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), key: storeKey(meta.id), subject: meta.subject, target: meta.label, students: meta.students.map(st => ({ sid: st.sid, name: st.name })), book }, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `수업포트폴리오-${meta.subject}-${meta.target}-${localIso()}.json`; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  if (!books.length) return <div className="ls"><style>{LS_CSS}</style><div className="ls-empty"><Stamp size={22} /><b>{grade}학년 {semester === "sem2" ? "2" : "1"}학기 담당 과목이 없어요</b><span>내 정보에서 담당 과목과 반(분반)을 고르면, 학생 명단·이동수업 출석부로 수업 포트폴리오가 자동으로 만들어져요.</span></div></div>;

  const waiting = pending.length;
  return <div className="ls">
    <style>{LS_CSS}</style>
    <div className="ls-books" role="tablist" aria-label="반·분반">
      {books.map(item => <button key={item.id} type="button" data-kdn-bare role="tab" aria-selected={item.id === meta.id} className={item.id === meta.id ? "is-on" : ""} onClick={() => setPickedId(item.id)}>
        <b>{item.subject}</b><small>{item.label} · {item.students.length}명</small>
      </button>)}
    </div>
    <div className="ls-top">
      <div className="ls-tabs" role="tablist">
        {[["lesson", "오늘 수업", <CalendarDays size={14} key="i" />], ["board", "도장판", <Grid3x3 size={14} key="i" />], ["list", "학생 현황", <Users size={14} key="i" />], ["score", "포트폴리오 채점", <Award size={14} key="i" />], ["csb", "최성보", <ShieldCheck size={14} key="i" />]].map(([key, label, icon]) => <button key={key} type="button" data-kdn-bare role="tab" aria-selected={tab === key} className={tab === key ? "is-on" : ""} onClick={() => setTab(key)}>{icon}{label}</button>)}
      </div>
      <div className={`ls-save is-${waiting ? (save.state === "error" ? "error" : "saving") : save.offline ? "error" : "ok"}`} role="status">
        {waiting ? (save.state === "error"
          ? <><CloudOff size={14} />저장 대기 {waiting}건 · 기기에 보관 중, 연결되면 자동 저장<button type="button" data-kdn-bare onClick={() => flush()}>지금 다시</button></>
          : <><Loader2 size={14} className="spin" />저장 중…</>)
          : save.offline ? <><CloudOff size={14} />연결 끊김 · 마지막 사본을 보여 주는 중</>
          : <><Cloud size={14} />{save.at ? `저장됨 ${stampTime(save.at).split(" ")[1]}` : "자동 저장"}</>}
        <button type="button" data-kdn-bare className="ls-dl" onClick={downloadBackup} disabled={!book} title="지금 내용을 파일로 따로 보관"><Download size={14} />백업 파일</button>
      </div>
    </div>
    {!book ? <div className="ls-note">불러오는 중…</div>
      : tab === "lesson" ? <LessonTab book={book} meta={meta} act={act} who={who} focus={focusSession} />
      : tab === "board" ? <BoardTab book={book} meta={meta} act={act} who={who} onOpenSession={id => { setFocusSession(id); setTab("lesson"); }} />
      : tab === "list" ? <ListTab book={book} meta={meta} showToast={showToast} />
      : tab === "score" ? <ScoreTab book={book} meta={meta} act={act} showToast={showToast} />
      : <CsbTab book={book} meta={meta} act={act} showToast={showToast} who={who} />}
  </div>;
}

// 글자 입력은 칸을 벗어날 때(또는 Enter) 한 번만 저장합니다(글자마다 저장하지 않게).
function BlurInput({ value, onCommit, ...rest }) {
  const shown = value ?? "";
  return <input key={String(shown)} defaultValue={shown} {...rest}
    onBlur={e => { if (String(e.target.value) !== String(shown)) onCommit(e.target.value); }}
    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}
const markTitle = (st, session, value, index) => {
  const state = markOf(value);
  const base = `${st.name} · ${session ? sessionName(session, index) : ""}${session?.date ? ` (${dayLabel(session.date)})` : ""}`;
  if (!state) return `${base} · 비어 있음`;
  return `${base} · ${state === "stamp" ? "도장" : "결석"}${markAt(value) ? ` · 찍은 때 ${stampTime(markAt(value))}` : ""}${markBy(value) ? ` · ${markBy(value)}` : ""}`;
};

// ── 오늘 수업: 날짜·교시·차시로 수업을 열고 학생 칸을 눌러 도장 ──
function LessonTab({ book, meta, act, who, focus }) {
  const asc = sessionsAsc(book);
  const indexOf = id => asc.findIndex(s => s.id === id);
  const sessions = asc.slice().reverse().filter(s => s.date || Object.keys(book.marks?.[s.id] || {}).length);
  const [openId, setOpenId] = useState(focus || sessions[0]?.id || "");
  useEffect(() => { if (focus) setOpenId(focus); }, [focus]);
  const open = asc.find(s => s.id === openId) || sessions[0] || null;
  const units = MATH_UNITS[meta.subject] || null;
  const startToday = () => {
    const now = new Date();
    const next = nextSessionFor(book);
    const lastUnit = sessions[0]?.unit || "";
    const id = next.id || uid("s");
    act({ t: "session", id, fields: { ...(next.existing ? {} : { no: next.no, unit: lastUnit, topic: "", pages: "", memo: "", at: now.toISOString(), by: who }), date: localIso(now), period: periodAt(now) } });
    setOpenId(id);
  };
  const patch = (id, fields) => act({ t: "session", id, fields });
  const remove = id => { if (!window.confirm("이 수업 기록(도장 포함)을 지울까요? 지운 뒤에도 관리자 백업에서 되돌릴 수 있어요.")) return; act({ t: "delSession", id }); setOpenId(""); };
  const tap = sid => act({ t: "mark", s: open.id, sid, v: nextMark(book.marks?.[open.id]?.[sid]), at: new Date().toISOString(), by: who });
  const stampAll = () => act({ t: "markMany", s: open.id, sids: meta.students.map(st => st.sid), v: "stamp", at: new Date().toISOString(), by: who });
  const marks = open ? book.marks?.[open.id] || {} : {};
  const count = state => meta.students.filter(st => markOf(marks[st.sid]) === state).length;
  const nowPeriod = periodAt(new Date());

  return <div className="ls-lesson">
    <aside className="ls-sessions">
      <button type="button" data-kdn-bare className="ls-add" onClick={startToday}><Plus size={15} />오늘 수업 시작{nowPeriod ? ` (${nowPeriod}교시)` : ""}</button>
      <p className="ls-mini">날짜는 오늘, 교시는 지금 시각으로 자동으로 들어가요. 미리 만든 차시가 있으면 다음 차시로 이어져요.</p>
      {!sessions.length && <p className="ls-mini">아직 수업 기록이 없어요.</p>}
      <ul>{sessions.map(s => { const m = book.marks?.[s.id] || {}; const stamped = Object.values(m).filter(v => markOf(v) === "stamp").length; return <li key={s.id}><button type="button" data-kdn-bare className={open?.id === s.id ? "is-on" : ""} onClick={() => setOpenId(s.id)}>
        <b>{sessionName(s, indexOf(s.id))} · {s.date ? dayLabel(s.date) : "날짜 없음"}{s.period ? ` ${s.period}교시` : ""}</b><small>{s.topic || (s.unit ? s.unit.split(" · ").pop() : "") || "주제 없음"}</small><em>{stamped}/{meta.students.length}</em>
      </button></li>; })}</ul>
    </aside>
    {open ? <section className="ls-session">
      <div className="ls-session-form">
        <label>차시<BlurInput type="number" min="1" value={open.no || indexOf(open.id) + 1} onCommit={value => patch(open.id, { no: Number(value) || "" })} style={{ width: 70 }} /></label>
        <label>날짜<input type="date" value={open.date || ""} onChange={e => patch(open.id, { date: e.target.value })} /></label>
        <label>교시<select value={open.period || ""} onChange={e => patch(open.id, { period: e.target.value ? Number(e.target.value) : "" })}><option value="">-</option>{PERIOD_TIMES.map(([from, to], i) => <option key={i} value={i + 1}>{i + 1}교시 ({from}~{to})</option>)}</select></label>
        {units ? <label className="wide">단원<select value={open.unit || ""} onChange={e => patch(open.id, { unit: e.target.value })}><option value="">단원 선택</option>{units.map(([big, smalls]) => <optgroup key={big} label={big}>{smalls.map(small => <option key={small} value={`${big} · ${small}`}>{small}</option>)}</optgroup>)}</select></label> : null}
        <label className="wide">주제<BlurInput value={open.topic} placeholder="오늘 배운 내용" onCommit={value => patch(open.id, { topic: value })} /></label>
        <label>교재 쪽<BlurInput value={open.pages} placeholder="예: 32-35" onCommit={value => patch(open.id, { pages: value })} /></label>
        <button type="button" data-kdn-bare className="ls-del" onClick={() => remove(open.id)} title="이 수업 기록 지우기"><Trash2 size={14} /></button>
      </div>
      <div className="ls-stamp-head"><b>도장 {count("stamp")} · 결석 {count("absent")} · 남음 {meta.students.length - count("stamp") - count("absent")}</b><span>칸을 누를 때마다 도장 → 결석 → 비움 · 찍은 날짜·시각이 함께 남아요</span><button type="button" data-kdn-bare onClick={stampAll}><Check size={14} />남은 학생 모두 도장</button></div>
      <div className="ls-grid">{meta.students.map(st => { const value = marks[st.sid]; const state = markOf(value); const late = isLate(open, value); return <button key={st.sid} type="button" data-kdn-bare className={`ls-cell ${state ? `is-${state}` : ""}`} onClick={() => tap(st.sid)} title={markTitle(st, open, value, indexOf(open.id))} aria-label={markTitle(st, open, value, indexOf(open.id))}>
        <small>{meta.kind === "common" ? `${st.number}번` : `${st.class}반 ${st.number}번`}</small><b>{st.name || st.sid}</b>
        {state && markAt(value) && <span className={`ls-when ${late ? "is-late" : ""}`}>{late ? "늦게 " : ""}{stampTime(markAt(value))}</span>}
        {state === "stamp" && <i className="ls-seal" style={{ rotate: `${(st.sid.charCodeAt(4) % 15) - 7}deg` }}>{open.pages ? `p.${open.pages}` : sessionName(open, indexOf(open.id))}</i>}
        {state === "absent" && <i className="ls-absent">결석</i>}
      </button>; })}</div>
    </section> : <section className="ls-session"><div className="ls-note">‘오늘 수업 시작’을 누르면 도장을 찍을 수 있어요.</div></section>}
  </div>;
}

// ── 도장판: 학생 × 차시 표에서 바로 찍기 ──
function BoardTab({ book, meta, act, who, onOpenSession }) {
  const sessions = sessionsAsc(book);
  const [count, setCount] = useState(() => String(Number(book.planCount) || Math.max(sessions.length, Number(book.hours) || 0) || 34));
  const [showTime, setShowTime] = useState(false);
  const makePlan = () => {
    const n = Math.min(200, Math.max(1, Number(count) || 0));
    if (!n) return;
    act({ t: "plan", count: n, at: new Date().toISOString(), by: who });
    act({ t: "meta", fields: { planCount: n } });
  };
  const tap = (s, sid) => act({ t: "mark", s: s.id, sid, v: nextMark(book.marks?.[s.id]?.[sid]), at: new Date().toISOString(), by: who });
  const today = localIso();
  return <div className="ls-card">
    <div className="ls-bar"><b>도장판 · {meta.subject} {meta.label}</b>
      <label className="ls-inline">전체 <input type="number" min="1" max="200" value={count} onChange={e => setCount(e.target.value)} />차시</label>
      <button type="button" data-kdn-bare className="ls-chip" onClick={makePlan}><Plus size={13} />차시 미리 만들기</button>
      <label className="ls-check"><input type="checkbox" checked={showTime} onChange={e => setShowTime(e.target.checked)} />찍은 날짜 보기</label>
      <span className="ls-legend"><i className="is-stamp" />도장 <i className="is-absent" />결석 <i className="is-late" />수업 날짜 뒤에 찍음</span>
    </div>
    {!sessions.length ? <div className="ls-note">전체 차시 수를 넣고 ‘차시 미리 만들기’를 누르면 학생 × 차시 도장판이 만들어져요. 이미 있는 차시는 그대로 둡니다.</div>
      : <div className="ls-table-wrap ls-board-wrap"><table className="ls-table ls-board">
        <thead><tr><th className="sticky c1">번호</th><th className="sticky c2">이름</th>
          {sessions.map((s, i) => <th key={s.id} className={s.date === today ? "is-today" : ""}><button type="button" data-kdn-bare onClick={() => onOpenSession(s.id)} title="이 차시 자세히(날짜·교시·주제)">{sessionName(s, i)}<small>{s.date ? shortDay(s.date) : "—"}{s.period ? ` ${s.period}교시` : ""}</small></button></th>)}
          <th>도장</th><th>결석</th><th>도장률</th></tr></thead>
        <tbody>{meta.students.map(st => { const stat = stampStats(book, st.sid); return <tr key={st.sid}>
          <td className="sticky c1">{seatOf(meta, st)}</td><td className="sticky c2"><b>{st.name}</b></td>
          {sessions.map((s, i) => { const value = book.marks?.[s.id]?.[st.sid]; const state = markOf(value); const late = isLate(s, value); return <td key={s.id} className="ls-bcell">
            <button type="button" data-kdn-bare className={`${state ? `is-${state}` : ""} ${late ? "is-late" : ""}`} onClick={() => tap(s, st.sid)} title={markTitle(st, s, value, i)} aria-label={markTitle(st, s, value, i)}>
              {state === "stamp" ? "●" : state === "absent" ? "결" : ""}{showTime && state && markAt(value) ? <small>{shortDay(stampDay(markAt(value)))}</small> : null}
            </button></td>; })}
          <td><b>{stat.stamps}</b></td><td>{stat.absent || ""}</td><td>{stat.held ? `${Math.round(stat.rate)}%` : "-"}</td>
        </tr>; })}</tbody></table></div>}
    <div className="ls-foot">칸을 누를 때마다 도장(●) → 결석 → 비움 · 칸에 마우스를 올리면(휴대폰은 ‘찍은 날짜 보기’) 찍은 날짜·시각·선생님이 보여요 · 날짜가 지난 차시와 도장이 있는 차시만 도장률에 들어가요</div>
  </div>;
}

// ── 학생 현황: 도장·결석·도장률·점수·최성보 + 차시별 찍은 때 ──
function ListTab({ book, meta, showToast }) {
  const [sort, setSort] = useState("seat");
  const [openSid, setOpenSid] = useState("");
  const sessions = sessionsAsc(book);
  const heldCount = sessions.filter(s => sessionHeld(book, s)).length;
  const rows = meta.students.map(st => ({ ...st, s: stampStats(book, st.sid), total: totalFor(book, st.sid), csb: csbStatus(book, st.sid) }));
  const ordered = rows.slice().sort((a, b) => sort === "rate" ? a.s.rate - b.s.rate : sort === "score" ? b.total - a.total : sort === "csb" ? ({ bad: 0, warn: 1, ok: 2 }[a.csb.level] - { bad: 0, warn: 1, ok: 2 }[b.csb.level]) : 0);
  const max = totalMax(book);
  const tsv = () => [["번호", "학번", "이름", "도장", "결석", "미도장", "도장률", `점수(/${max})`, "최성보"].join("\t"), ...rows.map(r => [r.number, r.sid, r.name, r.s.stamps, r.s.absent, r.s.missed, `${Math.round(r.s.rate)}%`, r.total, r.csb.label].join("\t"))].join("\n");
  const stampLog = () => [["차시", "수업 날짜", "교시", "학번", "이름", "기록", "찍은 때", "찍은 선생님"].join("\t"), ...sessions.flatMap((s, i) => meta.students.map(st => { const v = book.marks?.[s.id]?.[st.sid]; const m = markOf(v); return m ? [sessionName(s, i), s.date || "", s.period || "", st.sid, st.name, m === "stamp" ? "도장" : "결석", stampTime(markAt(v)), markBy(v)].join("\t") : null; }).filter(Boolean))].join("\n");
  return <div className="ls-card">
    <div className="ls-bar"><b>{meta.subject} {meta.label} · {rows.length}명 · 수업 {heldCount}회</b><span>정렬</span>
      <div className="ls-seg">{[["seat", "번호순"], ["rate", "도장률 낮은 순"], ["score", "점수순"], ["csb", "최성보 먼저"]].map(([key, label]) => <button key={key} type="button" data-kdn-bare className={sort === key ? "is-on" : ""} onClick={() => setSort(key)}>{label}</button>)}</div>
      <button type="button" data-kdn-bare className="ls-copy" onClick={() => copyText(tsv(), showToast)}><Copy size={14} />엑셀용 복사</button>
      <button type="button" data-kdn-bare className="ls-chip" onClick={() => copyText(stampLog(), showToast)}><Copy size={14} />도장 기록(찍은 때) 복사</button></div>
    <div className="ls-table-wrap"><table className="ls-table">
      <thead><tr><th>번호</th><th>학번</th><th>이름</th><th>도장</th><th>결석</th><th>미도장</th><th>도장률</th><th>점수</th><th>최성보</th></tr></thead>
      <tbody>{ordered.map(r => <React.Fragment key={r.sid}><tr className={openSid === r.sid ? "is-open" : ""} onClick={() => setOpenSid(openSid === r.sid ? "" : r.sid)} style={{ cursor: "pointer" }}>
        <td>{seatOf(meta, r)}</td><td className="dim">{r.sid}</td><td><b>{r.name}</b></td><td>{r.s.stamps}</td><td>{r.s.absent || ""}</td><td>{r.s.missed || ""}</td>
        <td><span className="ls-rate"><i style={{ width: `${Math.min(100, r.s.rate)}%` }} /></span><small>{Math.round(r.s.rate)}%</small></td>
        <td><b>{r.total}</b><small>/{max}</small></td><td><span className={`ls-pill is-${r.csb.level}`}>{r.csb.label}</span></td></tr>
        {openSid === r.sid && <tr className="ls-detail"><td colSpan={9}><div className="ls-dots">{sessions.map((s, i) => { const v = book.marks?.[s.id]?.[r.sid]; const m = markOf(v); const late = isLate(s, v); return <span key={s.id} title={markTitle(r, s, v, i)} className={`${m ? `is-${m}` : ""} ${late ? "is-late" : ""}`}>{sessionName(s, i)}{s.date ? ` ${shortDay(s.date)}` : ""}{m ? ` · ${m === "stamp" ? "도장" : "결석"}${markAt(v) ? ` ${stampTime(markAt(v))}` : ""}` : ""}</span>; })}</div></td></tr>}
      </React.Fragment>)}</tbody></table></div>
    <div className="ls-foot">줄을 누르면 차시마다 도장과 찍은 때가 보여요(주황 테두리 = 수업 날짜 뒤에 찍음) · 도장률은 {book.scoring?.stamp?.excludeAbsent ? "결석한 수업을 빼고" : "모든 수업 기준으로"} 계산</div>
  </div>;
}

// ── 포트폴리오 채점: 도장판(비례·구간) + 여러 항목 ──
const parseLevels = text => String(text || "").split(/[,\n]/).map(part => { const [label, score] = part.split(":").map(x => x.trim()); return label ? { label, score: Number(score) || 0 } : null; }).filter(Boolean);
function ScoreTab({ book, meta, act, showToast }) {
  const scoring = book.scoring;
  const cfg = scoring.stamp;
  const items = scoring.items;
  const [editing, setEditing] = useState(() => !items.length);
  const setScoring = fn => { const next = clone(scoring); fn(next); act({ t: "scoring", value: next }); };
  const setStamp = fields => setScoring(next => { next.stamp = { ...next.stamp, ...fields }; });
  const setBand = (i, fields) => setScoring(next => { next.stamp.bands[i] = { ...next.stamp.bands[i], ...fields }; });
  const setItem = (id, fields) => setScoring(next => { const it = next.items.find(x => x.id === id); if (it) Object.assign(it, fields); });
  const addItem = key => setScoring(next => { next.items.push({ id: uid("i"), ...clone(ITEM_TEMPLATES[key]) }); });
  const removeItem = id => { if (!window.confirm("이 항목과 입력한 점수를 지울까요?")) return; act({ t: "dropItem", item: id }); };
  const usePreset = () => { if (items.length && !window.confirm("지금 채점 기준을 예시(도장판 8 + 오답노트·모의고사 풀이·모의고사 피드백 각 1점)로 바꿀까요? 입력한 항목 점수는 사라질 수 있어요.")) return; const preset = presetPortfolio(); act({ t: "scoring", value: { ...preset, stamp: { ...preset.stamp, excludeAbsent: cfg.excludeAbsent } } }); };
  const setValue = (itemId, sid, value) => act({ t: "item", item: itemId, sid, v: value });
  const allOn = it => act({ t: "itemMany", item: it.id, sids: meta.students.map(st => st.sid), v: true });
  const max = totalMax(book);
  const tsv = () => [["번호", "학번", "이름", ...(cfg.enabled ? [`${cfg.name || "도장판"}(/${stampMax(book)})`] : []), ...items.map(it => `${it.name}(/${itemMax(it)})`), `합계(/${max})`].join("\t"),
    ...meta.students.map(st => [st.number, st.sid, st.name, ...(cfg.enabled ? [stampScore(book, st.sid)] : []), ...items.map(it => itemScore(book, it, st.sid) ?? ""), totalFor(book, st.sid)].join("\t"))].join("\n");
  return <div className="ls-score">
    <div className="ls-card">
      <div className="ls-bar"><b>채점 기준 · 만점 {max}점</b>
        <span className="ls-formula">{[cfg.enabled ? `${cfg.name || "도장판"} ${stampMax(book)}` : null, ...items.map(it => `${it.name} ${itemMax(it)}`)].filter(Boolean).join(" + ") || "항목 없음"}</span>
        <button type="button" data-kdn-bare className="ls-chip" onClick={() => setEditing(!editing)}><Settings2 size={13} />{editing ? "기준 접기" : "기준 바꾸기"}</button>
        <button type="button" data-kdn-bare className="ls-chip" onClick={usePreset}><Sparkles size={13} />예시: 도장판 8 + 3항목 1점씩</button>
      </div>
      {editing && <div className="ls-config">
        <div className="ls-item is-stamp">
          <label className="ls-check"><input type="checkbox" checked={!!cfg.enabled} onChange={e => setStamp({ enabled: e.target.checked })} />사용</label>
          <BlurInput value={cfg.name || "도장판"} onCommit={value => setStamp({ name: value || "도장판" })} aria-label="도장 항목 이름" />
          <select value={cfg.mode === "ratio" ? "ratio" : "rate"} onChange={e => setStamp({ mode: e.target.value })}><option value="ratio">도장률 비례</option><option value="rate">도장률 구간</option></select>
          {cfg.mode === "ratio" ? <label className="ls-inline">만점 <input type="number" min="0" step="0.5" value={cfg.max ?? 10} onChange={e => setStamp({ max: Number(e.target.value) })} />점 <small>(도장률 × 만점)</small></label> : null}
          <label className="ls-check"><input type="checkbox" checked={!!cfg.excludeAbsent} onChange={e => setStamp({ excludeAbsent: e.target.checked })} />결석 수업은 도장률에서 빼기</label>
        </div>
        {cfg.mode !== "ratio" && <div className="ls-bands">{cfg.bands.map((band, i) => <label key={i}>도장률 <input type="number" value={band.min} onChange={e => setBand(i, { min: Number(e.target.value) })} />% 이상 → <input type="number" step="0.5" value={band.score} onChange={e => setBand(i, { score: Number(e.target.value) })} />점</label>)}<label>그 밖 <input type="number" step="0.5" value={cfg.floor} onChange={e => setStamp({ floor: Number(e.target.value) })} />점</label></div>}
        {items.map(it => <div key={it.id} className="ls-item">
          <BlurInput value={it.name} onCommit={value => setItem(it.id, { name: value })} aria-label="항목 이름" />
          <select value={it.type} onChange={e => { const type = e.target.value; setItem(it.id, type === "check" ? { type, on: itemMax(it) || 1, off: 0 } : type === "level" ? { type, levels: it.levels || [{ label: "상", score: itemMax(it) || 1 }, { label: "중", score: (itemMax(it) || 1) / 2 }, { label: "하", score: 0 }] } : { type, max: itemMax(it) || 1 }); }}>
            <option value="check">제출하면 점수</option><option value="level">등급(상·중·하 등)</option><option value="number">점수 직접 입력</option></select>
          {it.type === "check" ? <label className="ls-inline">제출 <input type="number" min="0" step="0.5" value={it.on} onChange={e => setItem(it.id, { on: Number(e.target.value) })} />점</label>
            : it.type === "level" ? <label className="ls-inline wide">등급:점수 <BlurInput value={(it.levels || []).map(l => `${l.label}:${l.score}`).join(", ")} onCommit={value => setItem(it.id, { levels: parseLevels(value) })} placeholder="상:1, 중:0.5, 하:0" /></label>
            : <label className="ls-inline">만점 <input type="number" min="0" step="0.5" value={it.max} onChange={e => setItem(it.id, { max: Number(e.target.value) })} />점</label>}
          <button type="button" data-kdn-bare onClick={() => removeItem(it.id)} aria-label="항목 지우기" title="항목 지우기"><Trash2 size={14} /></button>
        </div>)}
        <div className="ls-bar"><span>항목 추가</span>{Object.entries({ check: "제출 항목", wrong: "오답노트", mock: "모의고사 업로드", feedback: "피드백(상중하)", custom: "점수 직접" }).map(([key, label]) => <button key={key} type="button" data-kdn-bare className="ls-chip" onClick={() => addItem(key)}><Plus size={13} />{label}</button>)}</div>
      </div>}
    </div>
    <div className="ls-card">
      <div className="ls-bar"><b>채점표</b><span>제출 항목은 머리글의 ‘모두 ✓’로 한 번에 체크</span><button type="button" data-kdn-bare className="ls-copy" onClick={() => copyText(tsv(), showToast)}><Copy size={14} />엑셀용 복사</button></div>
      <div className="ls-table-wrap"><table className="ls-table">
        <thead><tr><th>번호</th><th>이름</th>{cfg.enabled && <th>{cfg.name || "도장판"}<small> /{stampMax(book)}</small></th>}{items.map(it => <th key={it.id}>{it.name}<small> /{itemMax(it)}</small>{it.type === "check" && <button type="button" data-kdn-bare className="ls-all" onClick={() => allOn(it)}>모두 ✓</button>}</th>)}<th>합계<small> /{max}</small></th></tr></thead>
        <tbody>{meta.students.map(st => { const value = id => book.items?.[id]?.[st.sid]; return <tr key={st.sid}><td>{seatOf(meta, st)}</td><td><b>{st.name}</b></td>
          {cfg.enabled && <td>{stampScore(book, st.sid)}<small> ({Math.round(stampStats(book, st.sid).rate)}%)</small></td>}
          {items.map(it => <td key={it.id}>{it.type === "check" ? <input type="checkbox" checked={!!value(it.id)} onChange={e => setValue(it.id, st.sid, e.target.checked ? true : "")} aria-label={`${st.name} ${it.name}`} />
            : it.type === "level" ? <select value={value(it.id) ?? ""} onChange={e => setValue(it.id, st.sid, e.target.value === "" ? "" : Number(e.target.value))} aria-label={`${st.name} ${it.name}`}><option value="">-</option>{(it.levels || []).map((l, i) => <option key={i} value={i}>{l.label} ({l.score})</option>)}</select>
            : <BlurInput type="number" min="0" max={itemMax(it)} step="0.5" value={value(it.id) ?? ""} onCommit={v => setValue(it.id, st.sid, v === "" ? "" : Number(v))} aria-label={`${st.name} ${it.name}`} />}</td>)}
          <td><b>{totalFor(book, st.sid)}</b></td></tr>; })}</tbody></table></div>
    </div>
  </div>;
}

// ── 최성보: 결석 허용(총 시수 1/3) · 학업성취율 · 예방/보충 지도 기록 ──
function CsbTab({ book, meta, act, showToast, who }) {
  const [filter, setFilter] = useState("all");
  const [logSid, setLogSid] = useState("");
  const rows = meta.students.map(st => ({ ...st, c: csbStatus(book, st.sid) }));
  const shown = rows.filter(r => filter === "all" || r.c.level === filter);
  const setCsb = (sid, fields) => act({ t: "csb", sid, fields });
  const counts = { bad: rows.filter(r => r.c.level === "bad").length, warn: rows.filter(r => r.c.level === "warn").length };
  const tsv = () => [["번호", "학번", "이름", "결석", "허용", "학업성취율", "판정", "사유", "지도 시간"].join("\t"), ...rows.map(r => [r.number, r.sid, r.name, r.c.stats.absent, r.c.allow, r.c.info.rate ?? "", r.c.label, r.c.reasons.join(" / "), r.c.guidedHours].join("\t"))].join("\n");
  return <div className="ls-card">
    <div className="ls-bar"><b>최소성취수준 보장지도</b>
      <label className="ls-inline">총 시수 <BlurInput type="number" value={book.hours} onCommit={value => act({ t: "meta", fields: { hours: Number(value) || 0 } })} />시간 (결석 허용 {Math.floor((Number(book.hours) || 0) / 3)}시간)</label>
      <label className="ls-inline">학업성취율 기준 <BlurInput type="number" value={book.threshold} onCommit={value => act({ t: "meta", fields: { threshold: Number(value) || 0 } })} />%</label>
      <div className="ls-seg">{[["all", `전체 ${rows.length}`], ["bad", `보충지도 ${counts.bad}`], ["warn", `예방지도 ${counts.warn}`]].map(([key, label]) => <button key={key} type="button" data-kdn-bare className={filter === key ? "is-on" : ""} onClick={() => setFilter(key)}>{label}</button>)}</div>
      <button type="button" data-kdn-bare className="ls-copy" onClick={() => copyText(tsv(), showToast)}><Copy size={14} />엑셀용 복사</button></div>
    <div className="ls-table-wrap"><table className="ls-table">
      <thead><tr><th>번호</th><th>이름</th><th>결석 / 허용</th><th>도장률</th><th>학업성취율</th><th>판정</th><th>지도 기록</th><th>이수 확인</th></tr></thead>
      <tbody>{shown.map(r => <React.Fragment key={r.sid}><tr>
        <td>{seatOf(meta, r)}</td><td><b>{r.name}</b></td>
        <td className={r.c.left < 0 ? "is-bad" : r.c.left <= 3 ? "is-warn" : ""}>{r.c.stats.absent} / {r.c.allow}<small> (남음 {Math.max(r.c.left, 0)})</small></td>
        <td>{Math.round(r.c.stats.rate)}%</td>
        <td><BlurInput type="number" min="0" max="100" value={r.c.info.rate ?? ""} onCommit={value => setCsb(r.sid, { rate: value === "" ? null : Number(value) })} aria-label={`${r.name} 학업성취율`} />%</td>
        <td><span className={`ls-pill is-${r.c.level}`}>{r.c.label}</span>{r.c.reasons.length > 0 && <small className="ls-reason">{r.c.reasons.join(" · ")}</small>}</td>
        <td><button type="button" data-kdn-bare className="ls-chip" onClick={() => setLogSid(logSid === r.sid ? "" : r.sid)}>{r.c.logs.length ? `${r.c.logs.length}건 · ${r.c.guidedHours}시간` : "+ 기록"}</button></td>
        <td><input type="checkbox" checked={!!r.c.info.done} onChange={e => setCsb(r.sid, { done: e.target.checked })} aria-label={`${r.name} 이수 확인`} /></td></tr>
        {logSid === r.sid && <tr className="ls-detail"><td colSpan={8}><CsbLogs logs={r.c.logs} onAdd={log => act({ t: "logAdd", log: { id: uid("l"), sid: r.sid, by: who, at: new Date().toISOString(), ...log } })} onRemove={id => act({ t: "logDel", id })} /></td></tr>}
      </React.Fragment>)}</tbody></table></div>
    <div className="ls-foot">결석 허용 = 총 시수의 1/3 · 학업성취율이 기준 미만이거나 결석이 허용을 넘으면 보충지도, 기준+10% 미만·결석 3시간 이내 남음·도장률 50% 미만이면 예방지도 권장</div>
  </div>;
}
function CsbLogs({ logs, onAdd, onRemove }) {
  const [form, setForm] = useState({ date: localIso(), kind: "예방지도", hours: 1, content: "", result: "진행 중" });
  return <div className="ls-logs">
    {logs.map(l => <div key={l.id} className="ls-log"><b>{dayLabel(l.date)} · {l.kind} {l.hours}시간</b><span>{l.content}</span><em>{l.result}</em><button type="button" data-kdn-bare onClick={() => onRemove(l.id)} aria-label="지도 기록 지우기"><Trash2 size={13} /></button></div>)}
    <div className="ls-log-form">
      <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
      <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}><option>예방지도</option><option>보충지도</option></select>
      <input type="number" min="0.5" step="0.5" value={form.hours} onChange={e => setForm({ ...form, hours: Number(e.target.value) })} aria-label="시간" />
      <input className="wide" placeholder="지도 내용" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} />
      <select value={form.result} onChange={e => setForm({ ...form, result: e.target.value })}><option>진행 중</option><option>도달</option><option>미도달</option></select>
      <button type="button" data-kdn-bare className="ls-add" disabled={!form.content.trim()} onClick={() => { onAdd(form); setForm({ ...form, content: "" }); }}><Plus size={14} />기록 추가</button>
    </div>
  </div>;
}

const LS_CSS = `
.ls{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;color:var(--kdn-ink,#1f2430)}
.ls-lesson>*,.ls-top>*{min-width:0}
.ls-empty{display:grid;justify-items:center;gap:6px;padding:40px 20px;text-align:center;border:1px dashed var(--kdn-line,#dfe2e8);border-radius:18px;color:var(--kdn-muted,#5d6574)}
.ls-empty b{font-size:16px;color:var(--kdn-ink,#1f2430)}
.ls-books{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}
.ls-books button{flex:none;display:grid;gap:2px;padding:9px 14px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:14px;background:var(--kdn-surface,#fff);text-align:left;font:inherit;cursor:pointer;color:inherit}
.ls-books button b{font-size:14px;font-weight:900}.ls-books button small{font-size:12px;color:var(--kdn-muted,#5d6574)}
.ls-books button.is-on{border-color:#ea580c;box-shadow:0 0 0 2px rgba(234,88,12,.18);background:var(--kdn-accent-soft,#fff4ec)}
.ls-tabs{display:flex;gap:4px;padding:4px;border-radius:14px;background:var(--kdn-surface-2,#f1f3f6);width:max-content;max-width:100%;overflow-x:auto}
.ls-tabs button{display:inline-flex;align-items:center;gap:5px;height:36px;padding:0 14px;border:0;border-radius:10px;background:transparent;font:inherit;font-size:14px;font-weight:800;color:var(--kdn-ink-soft,#3a4150);cursor:pointer;white-space:nowrap}
.ls-tabs button.is-on{background:var(--kdn-ink,#1f2430);color:var(--kdn-surface,#fff)}
.ls-note{padding:14px;border-radius:12px;background:var(--kdn-surface-2,#f6f8fb);font-size:13.5px;color:var(--kdn-muted,#5d6574)}.ls-note.is-error{color:#b42318}
.ls-lesson{display:grid;grid-template-columns:240px 1fr;gap:12px;align-items:start}
.ls-sessions{display:grid;gap:8px;padding:10px;border:1px solid var(--kdn-line,#dfe2e8);border-radius:16px;background:var(--kdn-surface,#fff);max-height:70vh;overflow:auto}
.ls-sessions ul{list-style:none;margin:0;padding:0;display:grid;gap:3px}
.ls-sessions li button{width:100%;display:grid;grid-template-columns:1fr auto;gap:1px 6px;padding:8px 10px;border:0;border-radius:10px;background:transparent;text-align:left;font:inherit;color:inherit;cursor:pointer}
.ls-sessions li button.is-on{background:var(--kdn-accent-soft,#fff4ec)}
.ls-sessions li b{font-size:13.5px;font-weight:850}.ls-sessions li small{grid-column:1;font-size:12px;color:var(--kdn-muted,#5d6574);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ls-sessions li em{grid-row:1/3;grid-column:2;align-self:center;font-style:normal;font-size:12px;font-weight:850;color:#ea580c}
.ls-add{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:38px;padding:0 14px;border:0;border-radius:11px;background:#ea580c;color:#fff;font:inherit;font-size:13.5px;font-weight:850;cursor:pointer}
.ls-add:disabled{opacity:.45;cursor:not-allowed}
.ls-mini{margin:0;font-size:12.5px;color:var(--kdn-muted,#5d6574)}
.ls-session{display:grid;gap:10px;padding:12px;border:1px solid var(--kdn-line,#dfe2e8);border-radius:16px;background:var(--kdn-surface,#fff)}
.ls-session-form{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
.ls-session-form label{display:grid;gap:3px;font-size:11.5px;font-weight:800;color:var(--kdn-muted,#5d6574)}
.ls-session-form label.wide{flex:1 1 200px}
.ls-session-form input,.ls-session-form select,.ls-log-form input,.ls-log-form select{height:36px;padding:0 9px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:9px;background:var(--kdn-surface,#fff);color:var(--kdn-ink,#1f2430);font:inherit;font-size:13.5px}
.ls-del{width:36px;height:36px;display:grid;place-items:center;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:9px;background:transparent;color:var(--kdn-muted,#5d6574);cursor:pointer}
.ls-stamp-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ls-stamp-head b{font-size:14px;font-weight:900}.ls-stamp-head span{font-size:12px;color:var(--kdn-muted,#5d6574)}
.ls-stamp-head button{margin-left:auto;display:inline-flex;align-items:center;gap:5px;height:34px;padding:0 12px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:10px;background:var(--kdn-surface-2,#f6f8fb);font:inherit;font-size:13px;font-weight:800;color:inherit;cursor:pointer}
.ls-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px}
.ls-cell{position:relative;display:grid;gap:2px;min-height:74px;padding:10px;border:1.5px solid var(--kdn-control-line,#cfd5df);border-radius:14px;background:var(--kdn-surface,#fff);text-align:left;font:inherit;color:inherit;cursor:pointer;overflow:hidden;-webkit-tap-highlight-color:transparent;transition:transform .08s}
.ls-cell:active{transform:scale(.97)}
.ls-cell small{font-size:11.5px;color:var(--kdn-muted,#5d6574)}.ls-cell b{font-size:15px;font-weight:850}
.ls-cell.is-stamp{border-color:#ea580c;background:color-mix(in srgb,#ea580c 8%,var(--kdn-surface,#fff))}
.ls-cell.is-absent{border-style:dashed;opacity:.6}
.ls-seal{position:absolute;right:6px;bottom:6px;padding:3px 7px;border:2px solid #dc2626;border-radius:8px;color:#dc2626;font-style:normal;font-size:11px;font-weight:900;animation:lsSeal .22s ease-out}
@keyframes lsSeal{from{transform:scale(1.6);opacity:0}to{transform:scale(1);opacity:1}}
.ls-absent{position:absolute;right:8px;bottom:8px;font-style:normal;font-size:11.5px;font-weight:850;color:var(--kdn-muted,#5d6574)}
.ls-card{display:grid;gap:10px;padding:12px;border:1px solid var(--kdn-line,#dfe2e8);border-radius:16px;background:var(--kdn-surface,#fff)}
.ls-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ls-bar>b{font-size:14.5px;font-weight:900;margin-right:6px}.ls-bar>span{font-size:12px;color:var(--kdn-muted,#5d6574)}
.ls-seg{display:inline-flex;gap:2px;padding:3px;border-radius:10px;background:var(--kdn-surface-2,#f1f3f6)}
.ls-seg button{height:30px;padding:0 10px;border:0;border-radius:8px;background:transparent;font:inherit;font-size:12.5px;font-weight:800;color:var(--kdn-ink-soft,#3a4150);cursor:pointer}
.ls-seg button.is-on{background:var(--kdn-surface,#fff);box-shadow:0 1px 3px rgba(0,0,0,.12);color:var(--kdn-ink,#1f2430)}
.ls-copy,.ls-chip{display:inline-flex;align-items:center;gap:4px;height:32px;padding:0 11px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:9px;background:var(--kdn-surface,#fff);font:inherit;font-size:12.5px;font-weight:800;color:inherit;cursor:pointer}
.ls-copy{margin-left:auto}
.ls-table-wrap{overflow:auto;border-radius:12px;border:1px solid var(--kdn-line,#dfe2e8)}
.ls-table{width:100%;border-collapse:collapse;font-size:14px}
.ls-table th,.ls-table td{padding:9px 10px;border-bottom:1px solid var(--kdn-line,#dfe2e8);text-align:center;white-space:nowrap}
.ls-table th{font-size:12.5px;color:var(--kdn-muted,#5d6574);background:var(--kdn-surface-2,#f6f8fb);position:sticky;top:0}
.ls-table td.dim{color:var(--kdn-muted,#5d6574);font-size:13px}
.ls-table td small{font-size:11.5px;color:var(--kdn-muted,#5d6574)}
.ls-table tbody tr{cursor:default}.ls-table tbody tr.is-open td{background:var(--kdn-accent-soft,#fff4ec)}
.ls-table input[type=number]{width:64px;height:30px;padding:0 6px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:7px;background:var(--kdn-surface,#fff);color:inherit;font:inherit;text-align:right}
.ls-table select{height:30px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:7px;background:var(--kdn-surface,#fff);color:inherit;font:inherit}
.ls-rate{display:inline-block;width:60px;height:6px;margin-right:6px;border-radius:99px;background:var(--kdn-surface-2,#eef1f4);vertical-align:middle;overflow:hidden}.ls-rate i{display:block;height:100%;background:#ea580c}
.ls-pill{display:inline-block;padding:3px 9px;border-radius:99px;font-size:12px;font-weight:850}
.ls-pill.is-ok{background:color-mix(in srgb,#16a34a 14%,transparent);color:#15803d}.ls-pill.is-warn{background:color-mix(in srgb,#d97706 16%,transparent);color:#b45309}.ls-pill.is-bad{background:color-mix(in srgb,#dc2626 14%,transparent);color:#b42318}
.ls-table td.is-bad{color:#b42318;font-weight:850}.ls-table td.is-warn{color:#b45309;font-weight:800}
.ls-reason{display:block;margin-top:3px;white-space:normal;max-width:260px}
.ls-detail td{background:var(--kdn-surface-2,#f6f8fb);text-align:left}
.ls-dots{display:flex;flex-wrap:wrap;gap:4px}.ls-dots span{padding:2px 6px;border-radius:6px;font-size:11px;border:1px solid var(--kdn-line,#dfe2e8);color:var(--kdn-muted,#5d6574)}
.ls-dots span.is-stamp{border-color:#ea580c;color:#c2410c;font-weight:800}.ls-dots span.is-absent{text-decoration:line-through}
.ls-foot{font-size:12px;color:var(--kdn-muted,#5d6574)}
.ls-check,.ls-inline{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:700}
.ls-inline input{width:64px;height:30px;padding:0 6px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:7px;background:var(--kdn-surface,#fff);color:inherit;font:inherit}
.ls-score{display:grid;gap:12px}
.ls-bands{display:flex;flex-wrap:wrap;gap:8px}
.ls-bands label{display:inline-flex;align-items:center;gap:4px;padding:6px 9px;border-radius:10px;background:var(--kdn-surface-2,#f6f8fb);font-size:12.5px;font-weight:700}
.ls-bands input{width:52px;height:28px;padding:0 5px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:7px;background:var(--kdn-surface,#fff);color:inherit;font:inherit;text-align:right}
.ls-item{display:flex;align-items:center;gap:8px}.ls-item>input{flex:0 1 220px;min-width:120px;height:32px;padding:0 9px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:8px;background:var(--kdn-surface,#fff);color:inherit;font:inherit;font-weight:800}
.ls-item label{white-space:nowrap}.ls-item small{white-space:nowrap}.ls-check input{width:auto;height:auto}
.ls-item small{font-size:12px;color:var(--kdn-muted,#5d6574)}.ls-item button{border:0;background:transparent;color:var(--kdn-muted,#5d6574);cursor:pointer}
.ls-sub{margin-left:4px}
.ls-logs{display:grid;gap:6px}
.ls-log{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px}.ls-log span{flex:1 1 200px;white-space:normal}.ls-log em{font-style:normal;color:var(--kdn-muted,#5d6574)}
.ls-log button{border:0;background:transparent;color:var(--kdn-muted,#5d6574);cursor:pointer}
.ls-log-form{display:flex;flex-wrap:wrap;gap:6px}.ls-log-form .wide{flex:1 1 220px}.ls-log-form input[type=number]{width:70px}
.ls-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:space-between}
.ls-save{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:750;color:var(--kdn-muted,#5d6574)}
.ls-save.is-ok svg{color:#16a34a}.ls-save.is-saving{color:#b45309}.ls-save.is-error{color:#b42318}
.ls-save button{height:28px;padding:0 9px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:8px;background:var(--kdn-surface,#fff);font:inherit;font-size:12px;font-weight:800;color:inherit;cursor:pointer}
.ls-save .ls-dl{display:inline-flex;align-items:center;gap:4px;color:var(--kdn-ink-soft,#3a4150)}
.ls-when{position:absolute;left:10px;bottom:6px;font-size:10.5px;color:var(--kdn-muted,#5d6574)}.ls-when.is-late{color:#c2410c;font-weight:850}
.ls-cell{padding-bottom:20px}
.ls-legend{display:inline-flex;align-items:center;gap:6px;margin-left:auto;font-size:12px;color:var(--kdn-muted,#5d6574)}
.ls-legend i{display:inline-block;width:12px;height:12px;border-radius:4px;border:1.5px solid var(--kdn-control-line,#cfd5df)}
.ls-legend i.is-stamp{background:#ea580c;border-color:#ea580c}.ls-legend i.is-absent{background:var(--kdn-surface-2,#eef1f4)}.ls-legend i.is-late{border-color:#c2410c;border-style:dashed}
.ls-board-wrap{max-height:70vh}
.ls-board th,.ls-board td{padding:0}
.ls-board th{padding:6px 4px;min-width:46px}
.ls-board th button{display:grid;gap:1px;width:100%;border:0;background:transparent;font:inherit;font-size:12px;font-weight:850;color:var(--kdn-ink,#1f2430);cursor:pointer}
.ls-board th button small{font-size:10.5px;font-weight:700;color:var(--kdn-muted,#5d6574)}
.ls-board th.is-today{background:color-mix(in srgb,#ea580c 14%,var(--kdn-surface-2,#f6f8fb))}
.ls-board td{padding:6px 8px}
.ls-board .sticky{position:sticky;background:var(--kdn-surface,#fff);z-index:2}.ls-board th.sticky{z-index:3;background:var(--kdn-surface-2,#f6f8fb)}
.ls-board .c1{left:0;min-width:48px}.ls-board .c2{left:48px;min-width:70px;box-shadow:1px 0 0 var(--kdn-line,#dfe2e8)}
.ls-board td.ls-bcell{padding:2px}
.ls-bcell button{display:grid;place-items:center;width:40px;height:34px;margin:auto;border:1.5px solid var(--kdn-line,#dfe2e8);border-radius:9px;background:var(--kdn-surface,#fff);font:inherit;font-size:14px;font-weight:900;color:#ea580c;cursor:pointer;line-height:1;-webkit-tap-highlight-color:transparent}
.ls-bcell button small{font-size:9.5px;font-weight:700;color:var(--kdn-muted,#5d6574)}
.ls-bcell button.is-stamp{border-color:#ea580c;background:color-mix(in srgb,#ea580c 12%,var(--kdn-surface,#fff))}
.ls-bcell button.is-absent{color:var(--kdn-muted,#5d6574);font-size:12px;background:var(--kdn-surface-2,#eef1f4)}
.ls-bcell button.is-late{border-style:dashed;border-color:#c2410c}
.ls-dots span.is-late{border-style:dashed;border-color:#c2410c}
.ls-formula{font-size:13px;font-weight:800;color:var(--kdn-ink-soft,#3a4150)}
.ls-config{display:grid;gap:8px}
.ls-item{flex-wrap:wrap}.ls-item select{height:32px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:8px;background:var(--kdn-surface,#fff);color:inherit;font:inherit;font-size:13px}
.ls-item.is-stamp{padding:8px;border-radius:10px;background:var(--kdn-surface-2,#f6f8fb)}
.ls-inline.wide input{width:200px}
.ls-all{display:block;margin:3px auto 0;height:22px;padding:0 7px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:6px;background:var(--kdn-surface,#fff);font:inherit;font-size:11px;font-weight:800;color:inherit;cursor:pointer}
@media (max-width:760px){.ls-lesson{grid-template-columns:1fr}.ls-sessions{max-height:none}.ls-sessions ul{display:flex;overflow-x:auto;gap:6px}.ls-sessions li button{min-width:150px;border:1px solid var(--kdn-line,#dfe2e8)}.ls-grid{grid-template-columns:repeat(auto-fill,minmax(96px,1fr))}}
@media (prefers-reduced-motion: reduce){.ls-seal{animation:none}}
`;
