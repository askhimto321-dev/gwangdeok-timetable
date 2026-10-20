// 선생님 ZONE › 수업 포트폴리오 (수학 도장노트 기능을 KDTIME으로 옮기고 넓힘) — 휴대폰에서 쓰기 좋게 세로형
// - 반·분반 명단은 KDTIME 학생 명단(학급 고정 수업)·이동수업 출석부(이동수업)에서 바로 가져옵니다(따로 입력하지 않음).
// - 탭 3개: 도장(◀ 수업 ▶ 고르기 · 명단에서 한 명씩 / 표로 바꾸면 학생 × 차시 도장판) · 채점 · 현황(학생별 + 최성보)
// - 설정(차시 미리 만들기 · 채점 기준 · 최성보 기준 · 내보내기), 수업 정보, 학생 상세는 팝업으로 엽니다.
// - 날짜는 오늘, 교시는 지금 시각으로 자동. 도장마다 '찍은 날짜·시각·선생님'을 남깁니다(결석 후 다음 날 찍은 도장 확인).
// - 저장: 바꾸기마다 기기에 먼저 적어 두고(저장 대기) 서버에 보냅니다. 연결이 끊겨도 기기에 남아 있다가 자동으로 다시 보냅니다.
//   서버는 도장부마다 kd_stamps__{학년-학기-과목-반}(같은 반 선생님끼리 함께 씀), 덮어쓸 때마다 자동 백업.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stamp, Plus, Trash2, Copy, Check, Download, CloudOff, Cloud, Loader2, Settings2, Sparkles, ChevronLeft, ChevronRight, X, List, Grid3x3, PencilLine } from "lucide-react";
import { readStorage, updateStorage } from "./storage.js";
import { CHECK_STATES, checkLabel, booksForAssignment, emptyBook, normalizeBook, sessionsAsc, sessionHeld, stampStats, stampScore, stampMax, itemScore, itemMax, totalFor, totalMax, csbStatus, nextMark, markOf, markAt, markBy, applyOp, nextSessionFor, periodAt, localIso, presetPortfolio, PERIOD_TIMES, MATH_UNITS, ITEM_TEMPLATES } from "./lessonStamps.js";

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

// 큰 화면(PC)인지: PC는 표, 휴대폰은 세로 카드
function useWide(query = "(min-width: 900px)") {
  const get = () => { try { return window.matchMedia(query).matches; } catch { return true; } };
  const [wide, setWide] = useState(get);
  useEffect(() => { let mq; try { mq = window.matchMedia(query); } catch { return undefined; } const on = () => setWide(mq.matches); mq.addEventListener?.("change", on); return () => mq.removeEventListener?.("change", on); }, [query]);
  return wide;
}
const subjectKeyOf = value => String(value || "").normalize("NFC").replace(/\s+/g, "");

export default function LessonStamps({ teacher, accounts = {}, db = {}, grade = "2", semester = "sem1", showToast }) {
  const wide = useWide();
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
  // 다른 선생님 담당: 같은 반·분반을 함께 맡은 선생님(공동 작업) · 같은 과목 다른 반(조회 전용)
  const { coTeachers, viewBooks } = useMemo(() => {
    const co = {};
    const others = [];
    const mySubjects = new Set(books.map(book => subjectKeyOf(book.subject)));
    (accounts?.teacher || []).forEach(other => {
      if (!other || other.id === teacher?.id) return;
      (other.assignments || []).filter(item => item?.subject && String(item.grade || grade) === String(grade) && String(item.semester || semester) === String(semester))
        .forEach(item => booksForAssignment(item, { roster, enrollments, grade, semester }).forEach(book => {
          if (books.some(mine => mine.id === book.id)) { (co[book.id] ||= []).includes(other.name) || co[book.id].push(other.name || other.id); return; }
          if (!mySubjects.has(subjectKeyOf(book.subject))) return;
          const found = others.find(x => x.id === book.id);
          if (found) { if (!found.owners.includes(other.name)) found.owners.push(other.name || other.id); }
          else others.push({ ...book, owners: [other.name || other.id], readOnly: true });
        }));
    });
    return { coTeachers: co, viewBooks: others.sort((a, b) => a.subject.localeCompare(b.subject, "ko") || String(a.target).localeCompare(String(b.target), "ko", { numeric: true })) };
  }, [accounts, teacher, books, roster, enrollments, grade, semester]);
  const [pickedId, setPickedId] = useState(() => { try { return localStorage.getItem(`kd_stamps_last_${teacher?.id || "t"}`) || ""; } catch { return ""; } });
  const meta = books.find(book => book.id === pickedId) || viewBooks.find(book => book.id === pickedId) || books[0] || null;
  const readOnly = !!meta?.readOnly;
  useEffect(() => { if (meta) try { localStorage.setItem(`kd_stamps_last_${teacher?.id || "t"}`, meta.id); } catch { /* 기억 못 해도 됨 */ } }, [meta?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // 탭 3개: 도장(오늘 수업·도장판) · 채점 · 현황(학생·최성보)
  const [tab, setTab] = useState(() => { try { const saved = localStorage.getItem("kd_stamps_tab2"); return ["stamp", "score", "status"].includes(saved) ? saved : "stamp"; } catch { return "stamp"; } });
  useEffect(() => { try { localStorage.setItem("kd_stamps_tab2", tab); } catch { /* 무시 */ } }, [tab]);
  const [sessionId, setSessionId] = useState("");
  const [sheet, setSheet] = useState(null); // { type: "settings"|"session"|"student", id?, section? }
  useEffect(() => { setSessionId(""); setSheet(null); }, [meta?.id]);

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
    if (readOnly) { showToast?.("조회 전용이에요. 함께 기록하려면 내 정보에서 이 반을 담당 과목에 넣어 주세요.", "info"); return; }
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
  const saveTone = waiting ? (save.state === "error" ? "error" : "saving") : save.offline ? "error" : "ok";
  const openSettings = section => setSheet({ type: "settings", section });
  return <div className="ls">
    <style>{LS_CSS}</style>
    <div className="ls-head">
      <div className="ls-books" role="tablist" aria-label="반·분반">{books.map(item => <button key={item.id} type="button" data-kdn-bare role="tab" aria-selected={item.id === meta.id} className={item.id === meta.id ? "is-on" : ""} onClick={() => setPickedId(item.id)}><b>{item.subject} <span>{item.label.split(" · ")[0]}</span></b><small>{item.students.length}명{coTeachers[item.id]?.length ? ` · 공동 ${coTeachers[item.id].join("·")}` : ""}</small></button>)}
        {viewBooks.length > 0 && <select className={`ls-viewpick ${readOnly ? "is-on" : ""}`} value={readOnly ? meta.id : ""} onChange={e => e.target.value && setPickedId(e.target.value)} aria-label="같은 과목 다른 반 보기">
          <option value="">같은 과목 다른 반 보기…</option>
          {viewBooks.map(item => <option key={item.id} value={item.id}>{item.subject} {item.label.split(" · ")[0]} · {item.owners.join("·")} 선생님</option>)}
        </select>}
      </div>
      <button type="button" data-kdn-bare className="ls-gear" onClick={() => openSettings("")} aria-label="설정"><Settings2 size={17} /><span>설정</span></button>
    </div>
    {readOnly && <div className="ls-note is-info"><b>조회 전용</b> · {meta.subject} {meta.label.split(" · ")[0]} ({meta.owners.join("·")} 선생님 담당). 함께 기록하려면 내 정보에서 이 반을 담당 과목에 넣으면 같은 도장부를 함께 써요. <button type="button" data-kdn-bare onClick={() => setPickedId(books[0]?.id || "")}>내 반으로</button></div>}
    {!readOnly && coTeachers[meta.id]?.length > 0 && <div className="ls-note">이 반은 <b>{coTeachers[meta.id].join("·")} 선생님</b>과 함께 쓰는 도장부예요. 누가 찍든 같은 기록에 모이고, 도장마다 찍은 선생님이 남아요.</div>}
    <div className="ls-nav">
      <div className="ls-tabs3" role="tablist">{[["stamp", "도장 찍기", <Stamp size={16} key="i" />], ["score", "채점", <Sparkles size={16} key="i" />], ["status", "현황·최성보", <List size={16} key="i" />]].map(([key, label, icon]) => <button key={key} type="button" data-kdn-bare role="tab" aria-selected={tab === key} className={tab === key ? "is-on" : ""} onClick={() => setTab(key)}>{icon}<span>{label}</span></button>)}</div>
      <div className={`ls-save is-${saveTone}`} role="status" title={save.error || ""}>
        {waiting ? (save.state === "error"
          ? <><CloudOff size={14} /><span>저장 대기 {waiting}건</span><button type="button" data-kdn-bare onClick={() => flush()}>다시</button></>
          : <><Loader2 size={14} className="spin" /><span>저장 중</span></>)
          : save.offline ? <><CloudOff size={14} /><span>오프라인 사본</span></>
          : <><Cloud size={14} /><span>{save.at ? `저장됨 ${stampTime(save.at).split(" ")[1]}` : "자동 저장"}</span></>}
      </div>
    </div>
    {waiting > 0 && save.state === "error" && <div className="ls-note is-warn">연결이 안 돼서 이 기기에 {waiting}건을 보관 중이에요. 연결되면 자동으로 저장돼요(창을 닫아도 다음에 열면 이어서 저장).</div>}
    {!book ? <div className="ls-note">불러오는 중…</div>
      : tab === "stamp" ? <StampTab wide={wide} readOnly={readOnly} book={book} meta={meta} act={act} who={who} sessionId={sessionId} setSessionId={setSessionId} onEditSession={id => setSheet({ type: "session", id })} onOpenSettings={openSettings} />
      : tab === "score" ? <ScoreTab wide={wide} book={book} meta={meta} act={act} onOpenSettings={() => openSettings("score")} onOpenStudent={sid => setSheet({ type: "student", id: sid })} />
      : <StatusTab wide={wide} book={book} meta={meta} onOpenStudent={sid => setSheet({ type: "student", id: sid })} />}
    {book && sheet?.type === "settings" && <Sheet title="설정" onClose={() => setSheet(null)}><SettingsBody book={book} meta={meta} act={act} who={who} section={sheet.section} showToast={showToast} onDownload={downloadBackup} /></Sheet>}
    {book && sheet?.type === "session" && book.sessions[sheet.id] && <Sheet title="수업 정보" onClose={() => setSheet(null)}><SessionBody book={book} meta={meta} act={act} id={sheet.id} onDeleted={() => { setSheet(null); setSessionId(""); }} /></Sheet>}
    {book && sheet?.type === "student" && <Sheet title="학생" onClose={() => setSheet(null)}><StudentBody book={book} meta={meta} act={act} who={who} sid={sheet.id} /></Sheet>}
  </div>;
}

// ── 공통 ──
// 글자·숫자 입력은 칸을 벗어날 때(또는 Enter) 한 번만 저장합니다(글자마다 저장하지 않게).
function BlurInput({ value, onCommit, ...rest }) {
  const shown = value ?? "";
  return <input key={String(shown)} defaultValue={shown} {...rest}
    onBlur={e => { if (String(e.target.value) !== String(shown)) onCommit(e.target.value); }}
    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}
const num = value => (value === "" || value == null ? "" : Number(value));
// 팝업: 휴대폰은 아래에서 올라오는 시트, 큰 화면은 가운데 창
function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return <div className="ls-sheet" role="dialog" aria-modal="true" aria-label={title}>
    <div className="ls-sheet-back" onClick={onClose} />
    <div className="ls-sheet-box">
      <div className="ls-sheet-head"><b>{title}</b><button type="button" data-kdn-bare onClick={onClose} aria-label="닫기"><X size={20} /></button></div>
      <div className="ls-sheet-body">{children}</div>
    </div>
  </div>;
}
const markTitle = (st, session, value, index) => {
  const state = markOf(value);
  const base = `${st.name} · ${session ? sessionName(session, index) : ""}${session?.date ? ` (${dayLabel(session.date)})` : ""}`;
  if (!state) return `${base} · 비어 있음`;
  return `${base} · ${state === "stamp" ? "도장" : "결석"}${markAt(value) ? ` · 찍은 때 ${stampTime(markAt(value))}` : ""}${markBy(value) ? ` · ${markBy(value)}` : ""}`;
};
function ItemInput({ it, value, onChange, label }) {
  // 제출 · 늦게 · 미흡 중 하나를 누르고, 같은 걸 다시 누르면 미제출
  if (it.type === "check") { const cur = value === true || value === "on" ? true : value || ""; return <div className="ls-states" role="group" aria-label={label}>{CHECK_STATES.map(([v, text]) => <button key={String(v)} type="button" data-kdn-bare className={cur === v ? `is-on s-${v === true ? "ok" : v}` : ""} aria-pressed={cur === v} onClick={() => onChange(cur === v ? "" : v)}>{text}</button>)}</div>; }
  if (it.type === "level") return <select className="ls-select" value={value ?? ""} onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))} aria-label={label}><option value="">-</option>{(it.levels || []).map((l, i) => <option key={i} value={i}>{l.label} ({l.score})</option>)}</select>;
  return <BlurInput className="ls-num" type="number" inputMode="decimal" min="0" max={itemMax(it)} step="0.5" value={value ?? ""} onCommit={v => onChange(num(v))} aria-label={label} />;
}

// ── 도장: 수업을 고르고(◀ ▶) 명단에서 한 명씩 누르기 · '표'로 바꾸면 학생 × 차시 도장판 ──
function StampTab({ wide, readOnly, book, meta, act, who, sessionId, setSessionId, onEditSession, onOpenSettings }) {
  const asc = sessionsAsc(book);
  const indexOf = id => asc.findIndex(s => s.id === id);
  const started = asc.filter(s => s.date || Object.keys(book.marks?.[s.id] || {}).length);
  const today = localIso();
  const current = asc.find(s => s.id === sessionId) || started.filter(s => !s.date || s.date <= today).pop() || started[started.length - 1] || null;
  const pos = current ? started.findIndex(s => s.id === current.id) : -1;
  const [view, setView] = useState(() => { try { return localStorage.getItem("kd_stamps_view") || "list"; } catch { return "list"; } });
  useEffect(() => { try { localStorage.setItem("kd_stamps_view", view); } catch { /* 무시 */ } }, [view]);
  const nowPeriod = periodAt(new Date());
  const startToday = () => {
    const now = new Date();
    const next = nextSessionFor(book);
    const id = next.id || uid("s");
    act({ t: "session", id, fields: { ...(next.existing ? {} : { no: next.no, unit: current?.unit || "", topic: "", pages: "", memo: "", at: now.toISOString(), by: who }), date: localIso(now), period: periodAt(now) } });
    setSessionId(id);
    setView("list");
  };
  const todays = started.filter(s => s.date === today);
  const startButton = !readOnly && <button type="button" data-kdn-bare className="ls-primary" onClick={startToday}><Plus size={16} />{todays.length ? "오늘 수업 하나 더" : "오늘 수업 시작"}{nowPeriod ? ` · ${nowPeriod}교시` : ""}</button>;
  const viewToggle = <div className="ls-view" role="tablist" aria-label="보기">
    <button type="button" data-kdn-bare className={view === "list" ? "is-on" : ""} onClick={() => setView("list")} title="명단으로 보기"><List size={16} />{wide && <span>명단</span>}</button>
    <button type="button" data-kdn-bare className={view === "board" ? "is-on" : ""} onClick={() => setView("board")} title="학생 × 차시 도장판"><Grid3x3 size={16} />{wide && <span>도장판 표</span>}</button>
  </div>;
  const curTitle = current ? <button type="button" data-kdn-bare className="ls-cur" onClick={() => onEditSession(current.id)} disabled={readOnly}>
    <b>{sessionName(current, indexOf(current.id))}{!readOnly && <PencilLine size={13} />}</b>
    <small>{current.date ? dayLabel(current.date) : "날짜 없음"}{current.period ? ` · ${current.period}교시` : ""}{current.topic ? ` · ${current.topic}` : ""}</small>
  </button> : <div className="ls-cur"><b>수업 없음</b><small>{readOnly ? "아직 기록이 없어요" : "‘오늘 수업 시작’을 눌러 주세요"}</small></div>;
  const body = view === "board" ? <BoardView book={book} meta={meta} act={act} who={who} current={current} onPick={id => { setSessionId(id); setView("list"); }} onOpenSettings={onOpenSettings} />
    : current ? <RollView wide={wide} book={book} meta={meta} act={act} who={who} session={current} index={indexOf(current.id)} readOnly={readOnly} />
    : <div className="ls-card"><div className="ls-note">{readOnly ? "아직 이 반의 수업 기록이 없어요." : "‘오늘 수업 시작’을 누르면 날짜는 오늘, 교시는 지금 시각으로 들어가고 바로 도장을 찍을 수 있어요."}</div></div>;

  if (wide) return <div className="ls-pc">
    <aside className="ls-card ls-side">
      {startButton}
      <div className="ls-side-title">수업 기록 <small>{started.length}회</small></div>
      {!started.length && <p className="ls-mini">아직 수업 기록이 없어요.</p>}
      <ul>{started.slice().reverse().map(s => { const m = book.marks?.[s.id] || {}; const stamped = Object.values(m).filter(v => markOf(v) === "stamp").length; return <li key={s.id}><button type="button" data-kdn-bare className={current?.id === s.id && view === "list" ? "is-on" : ""} onClick={() => { setSessionId(s.id); setView("list"); }}>
        <b>{sessionName(s, indexOf(s.id))}</b><small>{s.date ? dayLabel(s.date) : "날짜 없음"}{s.period ? ` ${s.period}교시` : ""}</small><em>{stamped}/{meta.students.length}</em>
      </button></li>; })}</ul>
    </aside>
    <section className="ls-main">
      <div className="ls-card ls-mainhead">
        <button type="button" data-kdn-bare className="ls-arrow" disabled={pos <= 0} onClick={() => setSessionId(started[pos - 1].id)} aria-label="이전 수업"><ChevronLeft size={18} /></button>
        {curTitle}
        <button type="button" data-kdn-bare className="ls-arrow" disabled={pos < 0 || pos >= started.length - 1} onClick={() => setSessionId(started[pos + 1].id)} aria-label="다음 수업"><ChevronRight size={18} /></button>
        {viewToggle}
      </div>
      {body}
    </section>
  </div>;

  return <div className="ls-stamp">
    <div className="ls-card ls-picker">
      <div className="ls-picker-row">
        <button type="button" data-kdn-bare className="ls-arrow" disabled={pos <= 0} onClick={() => setSessionId(started[pos - 1].id)} aria-label="이전 수업"><ChevronLeft size={20} /></button>
        {curTitle}
        <button type="button" data-kdn-bare className="ls-arrow" disabled={pos < 0 || pos >= started.length - 1} onClick={() => setSessionId(started[pos + 1].id)} aria-label="다음 수업"><ChevronRight size={20} /></button>
      </div>
      <div className="ls-picker-row">{startButton}{viewToggle}</div>
    </div>
    {body}
  </div>;
}
// 명단: 한 줄에 한 명, 줄 어디를 눌러도 도장 → 결석 → 비움
function RollView({ wide, book, meta, act, who, session, index, readOnly }) {
  const marks = book.marks?.[session.id] || {};
  const count = state => meta.students.filter(st => markOf(marks[st.sid]) === state).length;
  const tap = sid => act({ t: "mark", s: session.id, sid, v: nextMark(marks[sid]), at: new Date().toISOString(), by: who });
  const stampAll = () => { if (window.confirm("아직 비어 있는 학생 모두에게 도장을 찍을까요?")) act({ t: "markMany", s: session.id, sids: meta.students.map(st => st.sid), v: "stamp", at: new Date().toISOString(), by: who }); };
  const left = meta.students.length - count("stamp") - count("absent");
  return <div className="ls-card ls-roll">
    <div className="ls-count"><span><b className="c-stamp">{count("stamp")}</b>도장</span><span><b>{count("absent")}</b>결석</span><span><b>{left}</b>남음</span>
      {left > 0 && !readOnly && <button type="button" data-kdn-bare onClick={stampAll}><Check size={14} />남은 학생 모두 도장</button>}</div>
    <ul className={`ls-rows ${wide ? "is-wide" : ""}`}>{meta.students.map(st => { const value = marks[st.sid]; const state = markOf(value); const late = isLate(session, value); return <li key={st.sid}>
      <button type="button" data-kdn-bare className={`ls-row ${state ? `is-${state}` : ""}`} onClick={() => tap(st.sid)} aria-label={markTitle(st, session, value, index)}>
        <span className="no">{meta.kind === "common" ? st.number : `${st.class}-${st.number}`}</span>
        <span className="nm"><b>{st.name || st.sid}</b>{state && markAt(value) ? <small className={late ? "is-late" : ""}>{late ? "늦게 · " : ""}{stampTime(markAt(value))}</small> : null}</span>
        <span className="mk">{state === "stamp" ? <i className="ls-seal">도장</i> : state === "absent" ? <i className="ls-abs">결석</i> : <i className="ls-empty-dot" />}</span>
      </button></li>; })}</ul>
    <p className="ls-foot">누를 때마다 도장 → 결석 → 비움 · 찍은 날짜·시각이 남아요(수업 날짜 뒤에 찍으면 ‘늦게’)</p>
  </div>;
}
// 표(도장판): 학생 × 차시
function BoardView({ book, meta, act, who, current, onPick, onOpenSettings }) {
  const sessions = sessionsAsc(book);
  const [showTime, setShowTime] = useState(false);
  const tap = (s, sid) => act({ t: "mark", s: s.id, sid, v: nextMark(book.marks?.[s.id]?.[sid]), at: new Date().toISOString(), by: who });
  const today = localIso();
  if (!sessions.length) return <div className="ls-card"><div className="ls-note">아직 차시가 없어요. ‘오늘 수업 시작’을 누르거나, 설정에서 전체 차시를 미리 만들 수 있어요.</div><button type="button" data-kdn-bare className="ls-chip" onClick={() => onOpenSettings("plan")}><Settings2 size={14} />전체 차시 미리 만들기</button></div>;
  return <div className="ls-card">
    <div className="ls-bar"><label className="ls-check"><input type="checkbox" checked={showTime} onChange={e => setShowTime(e.target.checked)} />찍은 날짜 보기</label>
      <span className="ls-legend"><i className="is-stamp" />도장 <i className="is-absent" />결석 <i className="is-late" />늦게</span></div>
    <div className="ls-table-wrap ls-board-wrap"><table className="ls-table ls-board">
      <thead><tr><th className="sticky c1">이름</th>
        {sessions.map((s, i) => <th key={s.id} className={`${s.date === today ? "is-today" : ""} ${current?.id === s.id ? "is-cur" : ""}`}><button type="button" data-kdn-bare onClick={() => onPick(s.id)} title="이 차시로 명단 보기">{Number(s.no) || i + 1}<small>{s.date ? shortDay(s.date) : "—"}</small></button></th>)}
        <th>도장률</th></tr></thead>
      <tbody>{meta.students.map(st => { const stat = stampStats(book, st.sid); return <tr key={st.sid}>
        <td className="sticky c1"><b>{st.name}</b><small>{seatOf(meta, st)}</small></td>
        {sessions.map((s, i) => { const value = book.marks?.[s.id]?.[st.sid]; const state = markOf(value); const late = isLate(s, value); return <td key={s.id} className="ls-bcell">
          <button type="button" data-kdn-bare className={`${state ? `is-${state}` : ""} ${late ? "is-late" : ""}`} onClick={() => tap(s, st.sid)} title={markTitle(st, s, value, i)} aria-label={markTitle(st, s, value, i)}>
            {state === "stamp" ? "●" : state === "absent" ? "결" : ""}{showTime && state && markAt(value) ? <small>{shortDay(stampDay(markAt(value)))}</small> : null}
          </button></td>; })}
        <td className="rate">{stat.held ? `${Math.round(stat.rate)}%` : "-"}</td>
      </tr>; })}</tbody></table></div>
    <p className="ls-foot">위쪽 차시 번호를 누르면 그 차시 명단으로 · 칸을 누를 때마다 도장(●) → 결석 → 비움</p>
  </div>;
}

// ── 채점: 기준 요약 + 학생별 입력(휴대폰은 카드, 큰 화면은 표) ──
function ScoreTab({ wide, book, meta, act, onOpenSettings, onOpenStudent }) {
  const cfg = book.scoring.stamp;
  const items = book.scoring.items;
  const max = totalMax(book);
  const setValue = (itemId, sid, value) => act({ t: "item", item: itemId, sid, v: value });
  const allOn = it => { if (window.confirm(`'${it.name}'을(를) 모든 학생 제출로 할까요?`)) act({ t: "itemMany", item: it.id, sids: meta.students.map(st => st.sid), v: true }); };
  const usePreset = () => { const preset = presetPortfolio(); act({ t: "scoring", value: { ...preset, stamp: { ...preset.stamp, excludeAbsent: cfg.excludeAbsent } } }); };
  return <div className="ls-score">
    <div className="ls-card ls-summary">
      <div><b>만점 {max}점</b><span>{[cfg.enabled ? `${cfg.name || "도장판"} ${stampMax(book)}` : null, ...items.map(it => `${it.name} ${itemMax(it)}`)].filter(Boolean).join(" + ") || "채점 항목이 없어요"}</span></div>
      <button type="button" data-kdn-bare className="ls-chip" onClick={onOpenSettings}><Settings2 size={14} />채점 기준</button>
    </div>
    {!items.length && <div className="ls-card ls-hint"><span>도장판 외에 오답노트·모의고사 같은 항목을 더하려면</span><button type="button" data-kdn-bare className="ls-chip" onClick={usePreset}><Sparkles size={14} />예시로 시작: 도장판 8 + 3항목 1점씩</button></div>}
    {items.filter(it => it.type === "check").length > 0 && <div className="ls-allrow">{items.filter(it => it.type === "check").map(it => <button key={it.id} type="button" data-kdn-bare className="ls-chip" onClick={() => allOn(it)}><Check size={13} />{it.name} 모두 제출</button>)}</div>}
    {wide ? <div className="ls-card ls-tcard"><div className="ls-table-wrap"><table className="ls-table ls-ptable">
      <thead><tr><th>번호</th><th className="l">이름</th>{cfg.enabled && <th>{cfg.name || "도장판"}<small>/{stampMax(book)}</small></th>}{items.map(it => <th key={it.id}>{it.name}<small>/{itemMax(it)}</small></th>)}<th>합계<small>/{max}</small></th></tr></thead>
      <tbody>{meta.students.map(st => <tr key={st.sid}>
        <td className="dim">{seatOf(meta, st)}</td>
        <td className="l"><button type="button" data-kdn-bare className="ls-namebtn" onClick={() => onOpenStudent(st.sid)}>{st.name}</button></td>
        {cfg.enabled && <td><b>{stampScore(book, st.sid)}</b><small> ({Math.round(stampStats(book, st.sid).rate)}%)</small></td>}
        {items.map(it => <td key={it.id}><ItemInput it={it} value={book.items?.[it.id]?.[st.sid]} onChange={v => setValue(it.id, st.sid, v)} label={`${st.name} ${it.name}`} /></td>)}
        <td className="tot">{totalFor(book, st.sid)}</td>
      </tr>)}</tbody></table></div></div>
    : <ul className="ls-scards">{meta.students.map(st => <li key={st.sid} className="ls-card">
      <button type="button" data-kdn-bare className="ls-scard-head" onClick={() => onOpenStudent(st.sid)}><span className="no">{seatOf(meta, st)}</span><b>{st.name}</b><em>{totalFor(book, st.sid)}<small>/{max}</small></em></button>
      <div className="ls-scard-items">
        {cfg.enabled && <div className="ls-sitem"><span>{cfg.name || "도장판"}</span><b>{stampScore(book, st.sid)}<small> /{stampMax(book)} · {Math.round(stampStats(book, st.sid).rate)}%</small></b></div>}
        {items.map(it => <div key={it.id} className="ls-sitem"><span>{it.name}<small> /{itemMax(it)}</small></span><ItemInput it={it} value={book.items?.[it.id]?.[st.sid]} onChange={v => setValue(it.id, st.sid, v)} label={`${st.name} ${it.name}`} /></div>)}
      </div>
    </li>)}</ul>}
  </div>;
}

// ── 현황: 학생별 도장률·점수·최성보 → 누르면 학생 팝업 ──
function StatusTab({ wide, book, meta, onOpenStudent }) {
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("seat");
  const rows = meta.students.map(st => ({ ...st, s: stampStats(book, st.sid), total: totalFor(book, st.sid), csb: csbStatus(book, st.sid) }));
  const counts = { bad: rows.filter(r => r.csb.level === "bad").length, warn: rows.filter(r => r.csb.level === "warn").length };
  const shown = rows.filter(r => filter === "all" || r.csb.level === filter).sort((a, b) => sort === "rate" ? a.s.rate - b.s.rate : sort === "score" ? b.total - a.total : 0);
  const max = totalMax(book);
  const held = sessionsAsc(book).filter(s => sessionHeld(book, s)).length;
  return <div className="ls-status">
    <div className="ls-card ls-filters">
      <div className="ls-seg">{[["all", `전체 ${rows.length}`], ["bad", `보충지도 ${counts.bad}`], ["warn", `예방지도 ${counts.warn}`]].map(([key, label]) => <button key={key} type="button" data-kdn-bare className={filter === key ? "is-on" : ""} onClick={() => setFilter(key)}>{label}</button>)}</div>
      <select className="ls-select" value={sort} onChange={e => setSort(e.target.value)} aria-label="정렬"><option value="seat">번호순</option><option value="rate">도장률 낮은 순</option><option value="score">점수 높은 순</option></select>
      <span className="ls-mini">수업 {held}회 · 만점 {max}점</span>
    </div>
    {wide ? <div className="ls-card ls-tcard"><div className="ls-table-wrap"><table className="ls-table ls-ptable">
      <thead><tr><th>번호</th><th>학번</th><th className="l">이름</th><th>도장</th><th>결석</th><th>미도장</th><th>도장률</th><th>점수</th><th>학업성취율</th><th>최성보</th><th>지도 기록</th></tr></thead>
      <tbody>{shown.map(r => <tr key={r.sid} className="clickable" onClick={() => onOpenStudent(r.sid)}>
        <td className="dim">{seatOf(meta, r)}</td><td className="dim">{r.sid}</td><td className="l"><b>{r.name}</b></td>
        <td>{r.s.stamps}</td><td>{r.s.absent || ""}</td><td>{r.s.missed || ""}</td>
        <td><span className="ls-rate inline"><i style={{ width: `${Math.min(100, r.s.rate)}%` }} /></span>{Math.round(r.s.rate)}%</td>
        <td className="tot">{r.total}<small>/{max}</small></td>
        <td>{r.csb.info.rate ?? "-"}{r.csb.info.rate != null && r.csb.info.rate !== "" ? "%" : ""}</td>
        <td><span className={`ls-pill is-${r.csb.level}`}>{r.csb.label}</span></td>
        <td>{r.csb.logs.length ? `${r.csb.logs.length}건 · ${r.csb.guidedHours}시간` : ""}</td>
      </tr>)}</tbody></table></div></div>
    : <ul className="ls-srows">{shown.map(r => <li key={r.sid}><button type="button" data-kdn-bare className="ls-srow" onClick={() => onOpenStudent(r.sid)}>
      <span className="no">{seatOf(meta, r)}</span>
      <span className="nm"><b>{r.name}</b><small>도장 {r.s.stamps} · 결석 {r.s.absent}{r.s.missed ? ` · 미도장 ${r.s.missed}` : ""}</small></span>
      <span className="rt"><span className="ls-rate"><i style={{ width: `${Math.min(100, r.s.rate)}%` }} /></span><small>{Math.round(r.s.rate)}%</small></span>
      <span className="sc"><b>{r.total}</b><small>/{max}</small></span>
      <span className={`ls-pill is-${r.csb.level}`}>{r.csb.label}</span>
    </button></li>)}</ul>}
    <p className="ls-foot">학생을 누르면 차시별 도장(찍은 때)·점수·최성보 기록을 보고 고칠 수 있어요. 엑셀 내보내기는 ⚙ 설정에 있어요.</p>
  </div>;
}

// ── 팝업: 학생 한 명 ──
function StudentBody({ book, meta, act, who, sid }) {
  const st = meta.students.find(x => x.sid === sid);
  const [form, setForm] = useState({ date: localIso(), kind: "예방지도", hours: 1, content: "", result: "진행 중" });
  if (!st) return null;
  const s = stampStats(book, sid);
  const c = csbStatus(book, sid);
  const sessions = sessionsAsc(book);
  const items = book.scoring.items;
  const cfg = book.scoring.stamp;
  return <div className="ls-stu">
    <div className="ls-stu-head"><b>{st.name}</b><small>{seatOf(meta, st)} · {sid}</small><span className={`ls-pill is-${c.level}`}>{c.label}</span></div>
    <div className="ls-kpis"><div><b>{s.stamps}</b><small>도장</small></div><div><b>{s.absent}</b><small>결석</small></div><div><b>{Math.round(s.rate)}%</b><small>도장률</small></div><div><b>{totalFor(book, sid)}</b><small>/{totalMax(book)}점</small></div></div>
    <h4>점수</h4>
    <div className="ls-scard-items">
      {cfg.enabled && <div className="ls-sitem"><span>{cfg.name || "도장판"}</span><b>{stampScore(book, sid)}<small> /{stampMax(book)}</small></b></div>}
      {items.map(it => <div key={it.id} className="ls-sitem"><span>{it.name}<small> /{itemMax(it)}</small></span><ItemInput it={it} value={book.items?.[it.id]?.[sid]} onChange={v => act({ t: "item", item: it.id, sid, v })} label={it.name} /></div>)}
    </div>
    <h4>차시별 도장</h4>
    <ul className="ls-hist">{sessions.filter(x => sessionHeld(book, x) || book.marks?.[x.id]?.[sid]).map(x => { const v = book.marks?.[x.id]?.[sid]; const m = markOf(v); const late = isLate(x, v); return <li key={x.id} className={`${m ? `is-${m}` : ""}`}>
      <span>{sessionName(x, sessions.indexOf(x))}<small>{x.date ? ` ${dayLabel(x.date)}` : ""}</small></span>
      <b>{m === "stamp" ? "도장" : m === "absent" ? "결석" : "—"}</b>
      <small className={late ? "is-late" : ""}>{markAt(v) ? `${late ? "늦게 " : ""}${stampTime(markAt(v))}${markBy(v) ? ` · ${markBy(v)}` : ""}` : ""}</small>
    </li>; })}</ul>
    <h4>최소성취수준 보장지도</h4>
    <div className="ls-form">
      <label>결석 / 허용<span className={c.left < 0 ? "is-bad" : ""}>{s.absent} / {c.allow}시간 (남음 {Math.max(c.left, 0)})</span></label>
      <label>학업성취율 (%)<BlurInput className="ls-num" type="number" inputMode="decimal" min="0" max="100" value={c.info.rate ?? ""} onCommit={value => act({ t: "csb", sid, fields: { rate: value === "" ? null : Number(value) } })} /></label>
      <label className="ls-toggle"><input type="checkbox" checked={!!c.info.done} onChange={e => act({ t: "csb", sid, fields: { done: e.target.checked } })} /><span>지도 끝 · 이수 확인</span></label>
    </div>
    {c.reasons.length > 0 && <p className="ls-mini">{c.reasons.join(" · ")}</p>}
    <ul className="ls-logs">{c.logs.map(l => <li key={l.id}><b>{dayLabel(l.date)} · {l.kind} {l.hours}시간 · {l.result}</b><span>{l.content}</span><button type="button" data-kdn-bare onClick={() => { if (window.confirm("이 지도 기록을 지울까요?")) act({ t: "logDel", id: l.id }); }} aria-label="지도 기록 지우기"><Trash2 size={14} /></button></li>)}</ul>
    <div className="ls-form ls-logform">
      <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} aria-label="날짜" />
      <select className="ls-select" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}><option>예방지도</option><option>보충지도</option></select>
      <input className="ls-num" type="number" inputMode="decimal" min="0.5" step="0.5" value={form.hours} onChange={e => setForm({ ...form, hours: Number(e.target.value) })} aria-label="시간" />
      <select className="ls-select" value={form.result} onChange={e => setForm({ ...form, result: e.target.value })}><option>진행 중</option><option>도달</option><option>미도달</option></select>
      <input className="wide" placeholder="지도 내용" value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} />
      <button type="button" data-kdn-bare className="ls-primary" disabled={!form.content.trim()} onClick={() => { act({ t: "logAdd", log: { id: uid("l"), sid, by: who, at: new Date().toISOString(), ...form } }); setForm({ ...form, content: "" }); }}><Plus size={14} />지도 기록 추가</button>
    </div>
  </div>;
}

// ── 팝업: 수업 정보 ──
function SessionBody({ book, meta, act, id, onDeleted }) {
  const s = book.sessions[id];
  const index = sessionsAsc(book).findIndex(x => x.id === id);
  const units = MATH_UNITS[meta.subject] || null;
  const patch = fields => act({ t: "session", id, fields });
  const marked = Object.keys(book.marks?.[id] || {}).length;
  return <div className="ls-form ls-sessionform">
    <label>차시<BlurInput className="ls-num" type="number" inputMode="numeric" min="1" value={s.no || index + 1} onCommit={value => patch({ no: Number(value) || "" })} /></label>
    <label>날짜<input type="date" value={s.date || ""} onChange={e => patch({ date: e.target.value })} /></label>
    <label>교시<select className="ls-select" value={s.period || ""} onChange={e => patch({ period: e.target.value ? Number(e.target.value) : "" })}><option value="">-</option>{PERIOD_TIMES.map(([from, to], i) => <option key={i} value={i + 1}>{i + 1}교시 ({from}~{to})</option>)}</select></label>
    {units && <label className="wide">단원<select className="ls-select" value={s.unit || ""} onChange={e => patch({ unit: e.target.value })}><option value="">단원 선택</option>{units.map(([big, smalls]) => <optgroup key={big} label={big}>{smalls.map(small => <option key={small} value={`${big} · ${small}`}>{small}</option>)}</optgroup>)}</select></label>}
    <label className="wide">주제<BlurInput value={s.topic} placeholder="오늘 배운 내용" onCommit={value => patch({ topic: value })} /></label>
    <label className="wide">교재 쪽<BlurInput value={s.pages} placeholder="예: 32-35" onCommit={value => patch({ pages: value })} /></label>
    <button type="button" data-kdn-bare className="ls-danger" onClick={() => { if (!window.confirm(`${sessionName(s, index)}을(를) 지울까요?${marked ? ` 도장·결석 ${marked}건도 함께 지워져요.` : ""} (관리자 백업에서 되돌릴 수 있어요)`)) return; act({ t: "delSession", id }); onDeleted(); }}><Trash2 size={14} />이 수업 지우기</button>
  </div>;
}

// ── 팝업: 설정(차시 · 채점 기준 · 최성보 기준 · 내보내기) ──
const parseLevels = text => String(text || "").split(/[,\n]/).map(part => { const [label, score] = part.split(":").map(x => x.trim()); return label ? { label, score: Number(score) || 0 } : null; }).filter(Boolean);
function SettingsBody({ book, meta, act, who, section, showToast, onDownload }) {
  const scoring = book.scoring;
  const cfg = scoring.stamp;
  const items = scoring.items;
  const scoreRef = useRef(null);
  const planRef = useRef(null);
  useEffect(() => { const el = section === "score" ? scoreRef.current : section === "plan" ? planRef.current : null; el?.scrollIntoView({ block: "start" }); }, [section]);
  const setScoring = fn => { const next = clone(scoring); fn(next); act({ t: "scoring", value: next }); };
  const setStamp = fields => setScoring(next => { next.stamp = { ...next.stamp, ...fields }; });
  const setBand = (i, fields) => setScoring(next => { next.stamp.bands[i] = { ...next.stamp.bands[i], ...fields }; });
  const setItem = (id, fields) => setScoring(next => { const it = next.items.find(x => x.id === id); if (it) Object.assign(it, fields); });
  const addItem = key => setScoring(next => { next.items.push({ id: uid("i"), ...clone(ITEM_TEMPLATES[key]) }); });
  const removeItem = it => { if (window.confirm(`'${it.name}' 항목과 입력한 점수를 지울까요?`)) act({ t: "dropItem", item: it.id }); };
  const usePreset = () => { if (items.length && !window.confirm("채점 기준을 예시(도장판 8 + 오답노트·모의고사 풀이·모의고사 피드백 1점씩)로 바꿀까요?")) return; const preset = presetPortfolio(); act({ t: "scoring", value: { ...preset, stamp: { ...preset.stamp, excludeAbsent: cfg.excludeAbsent } } }); };
  const sessions = sessionsAsc(book);
  const [count, setCount] = useState(() => String(Number(book.planCount) || Math.max(sessions.length, Number(book.hours) || 0) || 34));
  const makePlan = () => { const n = Math.min(200, Math.max(1, Number(count) || 0)); act({ t: "plan", count: n, at: new Date().toISOString(), by: who }); act({ t: "meta", fields: { planCount: n } }); showToast?.(`${n}차시까지 만들었어요. 도장 탭의 표에서 볼 수 있어요.`, "success"); };
  const max = totalMax(book);
  const rows = meta.students.map(st => ({ ...st, s: stampStats(book, st.sid), total: totalFor(book, st.sid), csb: csbStatus(book, st.sid) }));
  const exports = {
    status: () => [["번호", "학번", "이름", "도장", "결석", "미도장", "도장률", `점수(/${max})`, "최성보"].join("\t"), ...rows.map(r => [r.number, r.sid, r.name, r.s.stamps, r.s.absent, r.s.missed, `${Math.round(r.s.rate)}%`, r.total, r.csb.label].join("\t"))].join("\n"),
    score: () => [["번호", "학번", "이름", ...(cfg.enabled ? [`${cfg.name || "도장판"}(/${stampMax(book)})`] : []), ...items.map(it => `${it.name}(/${itemMax(it)})`), `합계(/${max})`].join("\t"), ...meta.students.map(st => [st.number, st.sid, st.name, ...(cfg.enabled ? [stampScore(book, st.sid)] : []), ...items.map(it => { const v = book.items?.[it.id]?.[st.sid]; const sc = itemScore(book, it, st.sid); return it.type === "check" ? `${sc ?? 0}${v === "late" || v === "poor" ? `(${checkLabel(v)})` : ""}` : sc ?? ""; }), totalFor(book, st.sid)].join("\t"))].join("\n"),
    stamps: () => [["차시", "수업 날짜", "교시", "학번", "이름", "기록", "찍은 때", "찍은 선생님"].join("\t"), ...sessions.flatMap((s, i) => meta.students.map(st => { const v = book.marks?.[s.id]?.[st.sid]; const m = markOf(v); return m ? [sessionName(s, i), s.date || "", s.period || "", st.sid, st.name, m === "stamp" ? "도장" : "결석", stampTime(markAt(v)), markBy(v)].join("\t") : null; }).filter(Boolean))].join("\n"),
    csb: () => [["번호", "학번", "이름", "결석", "허용", "학업성취율", "판정", "사유", "지도 시간"].join("\t"), ...rows.map(r => [r.number, r.sid, r.name, r.csb.stats.absent, r.csb.allow, r.csb.info.rate ?? "", r.csb.label, r.csb.reasons.join(" / "), r.csb.guidedHours].join("\t"))].join("\n"),
  };
  return <div className="ls-settings">
    <section ref={planRef}><h4>차시</h4>
      <div className="ls-line"><span>전체</span><input className="ls-num" type="number" inputMode="numeric" min="1" max="200" value={count} onChange={e => setCount(e.target.value)} aria-label="전체 차시 수" /><span>차시</span><button type="button" data-kdn-bare className="ls-chip" onClick={makePlan}><Plus size={14} />미리 만들기</button></div>
      <p className="ls-mini">지금 {sessions.length}차시 · 이미 있는 차시는 그대로 두고 빈 번호만 만들어요. 날짜 없는 차시는 도장을 찍기 전엔 도장률에 넣지 않아요.</p>
    </section>
    <section ref={scoreRef}><h4>채점 기준 <small>만점 {max}점</small></h4>
      <div className="ls-it is-stamp">
        <div className="ls-it-top"><label className="ls-toggle"><input type="checkbox" checked={!!cfg.enabled} onChange={e => setStamp({ enabled: e.target.checked })} /><span>사용</span></label><BlurInput className="ls-name" value={cfg.name || "도장판"} onCommit={value => setStamp({ name: value || "도장판" })} aria-label="도장 항목 이름" /></div>
        <div className="ls-it-row">
          <div className="ls-seg">{[["ratio", "도장률 비례"], ["rate", "구간별"]].map(([key, label]) => <button key={key} type="button" data-kdn-bare className={(cfg.mode === "ratio" ? "ratio" : "rate") === key ? "is-on" : ""} onClick={() => setStamp({ mode: key })}>{label}</button>)}</div>
          {cfg.mode === "ratio" && <label className="ls-line">만점<BlurInput className="ls-num" type="number" inputMode="decimal" min="0" step="0.5" value={cfg.max ?? 10} onCommit={value => setStamp({ max: Number(value) || 0 })} />점</label>}
        </div>
        {cfg.mode === "ratio" ? <p className="ls-mini">점수 = 도장률 × 만점 (예: 도장률 75%, 만점 8 → 6점)</p>
          : <table className="ls-bands"><thead><tr><th>도장률</th><th>점수</th></tr></thead><tbody>
            {cfg.bands.map((band, i) => <tr key={i}><td><BlurInput className="ls-num" type="number" inputMode="numeric" value={band.min} onCommit={value => setBand(i, { min: Number(value) || 0 })} />% 이상</td><td><BlurInput className="ls-num" type="number" inputMode="decimal" step="0.5" value={band.score} onCommit={value => setBand(i, { score: Number(value) || 0 })} />점</td></tr>)}
            <tr><td>그 밖</td><td><BlurInput className="ls-num" type="number" inputMode="decimal" step="0.5" value={cfg.floor} onCommit={value => setStamp({ floor: Number(value) || 0 })} />점</td></tr></tbody></table>}
        <label className="ls-toggle"><input type="checkbox" checked={!!cfg.excludeAbsent} onChange={e => setStamp({ excludeAbsent: e.target.checked })} /><span>결석한 수업은 도장률에서 빼기</span></label>
      </div>
      {items.map(it => <div key={it.id} className="ls-it">
        <div className="ls-it-top"><BlurInput className="ls-name" value={it.name} onCommit={value => setItem(it.id, { name: value || "항목" })} aria-label="항목 이름" /><button type="button" data-kdn-bare className="ls-x" onClick={() => removeItem(it)} aria-label="항목 지우기"><Trash2 size={15} /></button></div>
        <div className="ls-it-row">
          <select className="ls-select" value={it.type} onChange={e => { const type = e.target.value; setItem(it.id, type === "check" ? { type, on: itemMax(it) || 1, off: 0 } : type === "level" ? { type, levels: it.levels || [{ label: "상", score: itemMax(it) || 1 }, { label: "중", score: (itemMax(it) || 1) / 2 }, { label: "하", score: 0 }] } : { type, max: itemMax(it) || 1 }); }} aria-label="채점 방식">
            <option value="check">제출하면 점수</option><option value="level">등급(상·중·하)</option><option value="number">점수 직접 입력</option></select>
          {it.type === "check" ? <div className="ls-pts">
              <label>제출<BlurInput className="ls-num" type="number" inputMode="decimal" min="0" step="0.5" value={it.on} onCommit={value => setItem(it.id, { on: Number(value) || 0 })} /></label>
              <label>늦게<BlurInput className="ls-num" type="number" inputMode="decimal" min="0" step="0.5" value={it.late ?? it.on} onCommit={value => setItem(it.id, { late: Number(value) || 0 })} /></label>
              <label>미흡<BlurInput className="ls-num" type="number" inputMode="decimal" min="0" step="0.5" value={it.poor ?? it.on} onCommit={value => setItem(it.id, { poor: Number(value) || 0 })} /></label>
              <span className="ls-mini">점 · 미제출 0점</span></div>
            : it.type === "number" ? <label className="ls-line">만점<BlurInput className="ls-num" type="number" inputMode="decimal" min="0" step="0.5" value={it.max} onCommit={value => setItem(it.id, { max: Number(value) || 0 })} />점</label> : null}
        </div>
        {it.type === "level" && <label className="ls-line wide">등급:점수<BlurInput value={(it.levels || []).map(l => `${l.label}:${l.score}`).join(", ")} onCommit={value => setItem(it.id, { levels: parseLevels(value) })} placeholder="상:1, 중:0.5, 하:0" /></label>}
      </div>)}
      <div className="ls-adds"><span className="ls-mini">항목 더하기</span>{Object.entries({ check: "제출 항목", wrong: "오답노트", mock: "모의고사 업로드", feedback: "피드백(상중하)", custom: "점수 직접" }).map(([key, label]) => <button key={key} type="button" data-kdn-bare className="ls-chip" onClick={() => addItem(key)}><Plus size={13} />{label}</button>)}</div>
      <button type="button" data-kdn-bare className="ls-chip" onClick={usePreset}><Sparkles size={14} />예시로 바꾸기: 도장판 8 + 오답노트·모의고사 풀이·피드백 1점씩</button>
    </section>
    <section><h4>최성보 기준</h4>
      <div className="ls-line"><span>총 시수</span><BlurInput className="ls-num" type="number" inputMode="numeric" value={book.hours} onCommit={value => act({ t: "meta", fields: { hours: Number(value) || 0 } })} /><span>시간 → 결석 허용 {Math.floor((Number(book.hours) || 0) / 3)}시간</span></div>
      <div className="ls-line"><span>학업성취율 기준</span><BlurInput className="ls-num" type="number" inputMode="numeric" value={book.threshold} onCommit={value => act({ t: "meta", fields: { threshold: Number(value) || 0 } })} /><span>%</span></div>
    </section>
    <section><h4>내보내기 · 백업</h4>
      <div className="ls-adds">
        <button type="button" data-kdn-bare className="ls-chip" onClick={() => copyText(exports.status(), showToast)}><Copy size={13} />현황 복사</button>
        <button type="button" data-kdn-bare className="ls-chip" onClick={() => copyText(exports.score(), showToast)}><Copy size={13} />채점표 복사</button>
        <button type="button" data-kdn-bare className="ls-chip" onClick={() => copyText(exports.stamps(), showToast)}><Copy size={13} />도장 기록(찍은 때) 복사</button>
        <button type="button" data-kdn-bare className="ls-chip" onClick={() => copyText(exports.csb(), showToast)}><Copy size={13} />최성보 복사</button>
        <button type="button" data-kdn-bare className="ls-chip" onClick={onDownload}><Download size={13} />백업 파일 받기</button>
      </div>
      <p className="ls-mini">복사한 표는 엑셀에 바로 붙여 넣을 수 있어요. 서버에도 바꿀 때마다 자동 백업이 남아요(관리자 › 백업·복원).</p>
    </section>
  </div>;
}

const LS_CSS = `
.ls{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;color:var(--kdn-ink,#1f2430);max-width:1280px}
.ls *{box-sizing:border-box}
.ls-empty{display:grid;justify-items:center;gap:6px;padding:40px 20px;text-align:center;border:1px dashed var(--kdn-line,#dfe2e8);border-radius:18px;color:var(--kdn-muted,#5d6574)}
.ls-empty b{font-size:16px;color:var(--kdn-ink,#1f2430)}
.ls-card{display:grid;gap:10px;padding:12px;border:1px solid var(--kdn-line,#dfe2e8);border-radius:16px;background:var(--kdn-surface,#fff);min-width:0}
.ls-note{padding:12px 14px;border-radius:12px;background:var(--kdn-surface-2,#f6f8fb);font-size:13.5px;color:var(--kdn-muted,#5d6574);line-height:1.5}
.ls-note.is-warn{background:color-mix(in srgb,#dc2626 9%,var(--kdn-surface,#fff));color:#b42318}
.ls-mini{margin:0;font-size:12.5px;color:var(--kdn-muted,#5d6574);line-height:1.5}
.ls-foot{margin:0;font-size:12px;color:var(--kdn-muted,#5d6574);line-height:1.5}
/* 머리: 반 고르기 + 설정 */
.ls-head{display:flex;align-items:flex-start;gap:8px;min-width:0}
.ls-books{display:flex;gap:6px;flex:1;min-width:0;flex-wrap:wrap}
.ls-books button{flex:none;display:grid;gap:1px;padding:7px 12px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:12px;background:var(--kdn-surface,#fff);text-align:left;font:inherit;cursor:pointer;color:inherit}
.ls-books b{font-size:14px;font-weight:900}.ls-books b span{font-weight:700;color:var(--kdn-ink-soft,#3a4150)}.ls-books small{font-size:11.5px;color:var(--kdn-muted,#5d6574)}
.ls-books button.is-on{border-color:var(--kdn-accent,#cf4a12);background:var(--kdn-accent-soft,#fff0e6);box-shadow:inset 0 0 0 1px var(--kdn-accent,#cf4a12)}
.ls-books button.is-on b span{color:var(--kdn-accent-text,#b23e0c)}
.ls-viewpick{height:44px;max-width:240px;padding:0 10px;border:1px dashed var(--kdn-control-line,#cfd5df);border-radius:12px;background:var(--kdn-surface,#fff);color:var(--kdn-muted,#5d6574);font:inherit;font-size:13px;font-weight:700}
.ls-viewpick.is-on{border-style:solid;border-color:#2563eb;color:#1d4ed8}
.ls-gear{flex:none;display:inline-flex;align-items:center;gap:5px;height:40px;padding:0 13px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:12px;background:var(--kdn-surface,#fff);font:inherit;font-size:13.5px;font-weight:800;color:inherit;cursor:pointer}
.ls-note.is-info{background:color-mix(in srgb,#2563eb 9%,var(--kdn-surface,#fff));color:var(--kdn-ink,#1f2430)}
.ls-note button{margin-left:6px;height:28px;padding:0 10px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:8px;background:var(--kdn-surface,#fff);font:inherit;font-size:12.5px;font-weight:800;color:inherit;cursor:pointer}
/* 탭 3개(선택된 탭은 사이트 강조색 채움) + 저장 상태 */
.ls-nav{display:flex;align-items:center;gap:12px;padding-bottom:2px;border-bottom:1px solid var(--kdn-line,#dfe2e8)}
.ls-tabs3{display:flex;gap:4px}
.ls-tabs3 button{display:inline-flex;align-items:center;gap:7px;height:44px;padding:0 18px;border:0;border-bottom:3px solid transparent;border-radius:12px 12px 0 0;background:transparent;font:inherit;font-size:15px;font-weight:850;color:var(--kdn-muted,#5d6574);cursor:pointer;margin-bottom:-3px}
.ls-tabs3 button:hover{color:var(--kdn-ink,#1f2430);background:var(--kdn-surface-2,#f0f1f5)}
.ls-tabs3 button.is-on{color:var(--kdn-accent-text,#b23e0c);border-bottom-color:var(--kdn-accent,#cf4a12);background:var(--kdn-accent-soft,#fff0e6)}
.ls-save{margin-left:auto;flex:none;display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:750;color:var(--kdn-muted,#5d6574);white-space:nowrap}
.ls-save.is-ok svg{color:#16a34a}.ls-save.is-saving{color:#b45309}.ls-save.is-error{color:#b42318}
.ls-save button{height:26px;padding:0 8px;border:1px solid currentColor;border-radius:8px;background:transparent;font:inherit;font-size:12px;font-weight:800;color:inherit;cursor:pointer}
/* PC: 왼쪽 수업 목록 + 오른쪽 명단 */
.ls-pc{display:grid;grid-template-columns:250px minmax(0,1fr);gap:12px;align-items:start}
.ls-side{position:sticky;top:12px;gap:8px;max-height:calc(100vh - 40px);overflow:auto}
.ls-side .ls-primary{width:100%}
.ls-side-title{font-size:13px;font-weight:900;color:var(--kdn-muted,#5d6574);padding:4px 2px 0}.ls-side-title small{font-weight:700}
.ls-side ul{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.ls-side li button{width:100%;display:grid;grid-template-columns:1fr auto;gap:0 6px;padding:8px 10px;border:0;border-radius:10px;background:transparent;text-align:left;font:inherit;color:inherit;cursor:pointer}
.ls-side li button:hover{background:var(--kdn-surface-2,#f0f1f5)}
.ls-side li button.is-on{background:var(--kdn-accent-soft,#fff0e6);box-shadow:inset 3px 0 0 var(--kdn-accent,#cf4a12)}
.ls-side li b{font-size:14px;font-weight:850}.ls-side li small{grid-column:1;font-size:12px;color:var(--kdn-muted,#5d6574)}
.ls-side li em{grid-row:1/3;grid-column:2;align-self:center;font-style:normal;font-size:12.5px;font-weight:850;color:var(--kdn-accent-text,#b23e0c)}
.ls-main{display:grid;gap:12px;min-width:0}
.ls-mainhead{display:flex;align-items:center;gap:8px;padding:8px}
.ls-mainhead .ls-arrow{height:44px;width:40px}
.ls-mainhead .ls-cur{justify-items:start;text-align:left;background:transparent}
.ls-mainhead .ls-view button{width:auto;display:inline-flex;align-items:center;gap:5px;padding:0 12px;white-space:nowrap}.ls-view button span{font-size:13px;font-weight:800}
.ls-rows.is-wide{grid-template-columns:repeat(auto-fill,minmax(190px,1fr))}
/* PC 표 */
.ls-tcard{padding:0;overflow:hidden}.ls-tcard .ls-table-wrap{border:0;border-radius:0;max-height:72vh}
.ls-ptable th{position:sticky;top:0;z-index:1;padding:10px 12px;background:var(--kdn-surface-2,#f6f8fb);font-size:12.5px;font-weight:850;color:var(--kdn-muted,#5d6574)}
.ls-ptable th small{margin-left:2px;font-weight:700}
.ls-ptable td{padding:7px 12px;font-size:14px}
.ls-ptable td small{font-size:11.5px;color:var(--kdn-muted,#5d6574)}
.ls-ptable .l{text-align:left}.ls-ptable td.dim{color:var(--kdn-muted,#5d6574);font-size:13px}
.ls-ptable td.tot{font-size:16px;font-weight:900;color:var(--kdn-accent-text,#b23e0c)}
.ls-ptable tbody tr:hover td{background:var(--kdn-surface-2,#f8f9fb)}
.ls-ptable tr.clickable{cursor:pointer}
.ls-namebtn{border:0;background:transparent;padding:0;font:inherit;font-size:14.5px;font-weight:850;color:inherit;cursor:pointer;text-decoration:underline;text-decoration-color:transparent}
.ls-namebtn:hover{text-decoration-color:currentColor}
.ls-rate.inline{display:inline-block;width:56px;margin-right:6px;vertical-align:middle}
.ls-ptable .ls-states button{min-width:40px;height:30px;font-size:12.5px}
/* 공통 컨트롤 */
.ls-chip{display:inline-flex;align-items:center;gap:5px;min-height:36px;padding:0 12px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:10px;background:var(--kdn-surface,#fff);font:inherit;font-size:13px;font-weight:800;color:inherit;cursor:pointer;justify-self:start}
.ls-primary{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 16px;border:0;border-radius:12px;background:#ea580c;color:#fff;font:inherit;font-size:15px;font-weight:900;cursor:pointer}
.ls-primary:disabled{opacity:.45;cursor:not-allowed}
.ls-danger{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:40px;padding:0 14px;border:1px solid #f3b8a0;border-radius:10px;background:transparent;color:#b4410f;font:inherit;font-size:13.5px;font-weight:800;cursor:pointer}
.ls-seg{display:inline-flex;gap:2px;padding:3px;border-radius:10px;background:var(--kdn-surface-2,#f1f3f6);flex-wrap:wrap}
.ls-seg button{min-height:32px;padding:0 11px;border:0;border-radius:8px;background:transparent;font:inherit;font-size:13px;font-weight:800;color:var(--kdn-ink-soft,#3a4150);cursor:pointer}
.ls-seg button.is-on{background:var(--kdn-surface,#fff);box-shadow:0 1px 3px rgba(0,0,0,.12);color:var(--kdn-ink,#1f2430)}
.ls-num{width:72px;height:38px;padding:0 8px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:9px;background:var(--kdn-surface,#fff);color:inherit;font:inherit;font-size:15px;text-align:right}
.ls-select{height:38px;padding:0 8px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:9px;background:var(--kdn-surface,#fff);color:inherit;font:inherit;font-size:14px}
.ls-toggle{display:inline-flex;align-items:center;gap:7px;min-height:36px;font-size:14px;font-weight:700;cursor:pointer}
.ls-toggle input{width:20px;height:20px;accent-color:#ea580c}
.ls-check{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700}
.ls-check input{accent-color:#ea580c}
.ls-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
/* 도장 탭 */
.ls-stamp{display:grid;gap:10px}
.ls-picker{gap:10px}
.ls-picker-row{display:flex;align-items:center;gap:8px}
.ls-arrow{flex:none;width:44px;height:52px;display:grid;place-items:center;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:12px;background:var(--kdn-surface,#fff);color:inherit;cursor:pointer}
.ls-arrow:disabled{opacity:.3;cursor:default}
.ls-cur{flex:1;min-width:0;display:grid;gap:2px;justify-items:center;padding:6px 8px;border:0;border-radius:12px;background:var(--kdn-surface-2,#f6f8fb);font:inherit;color:inherit;cursor:pointer;text-align:center}
.ls-cur b{display:inline-flex;align-items:center;gap:5px;font-size:18px;font-weight:900}.ls-cur b svg{color:var(--kdn-muted,#5d6574)}
.ls-cur small{font-size:13px;color:var(--kdn-muted,#5d6574);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ls-picker-row .ls-primary{flex:1}
.ls-view{flex:none;display:flex;gap:2px;padding:3px;border-radius:12px;background:var(--kdn-surface-2,#f1f3f6)}
.ls-view button{width:42px;height:38px;display:grid;place-items:center;border:0;border-radius:9px;background:transparent;color:var(--kdn-ink-soft,#3a4150);cursor:pointer}
.ls-view button.is-on{background:var(--kdn-surface,#fff);color:#ea580c;box-shadow:0 1px 3px rgba(0,0,0,.12)}
.ls-count{display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--kdn-muted,#5d6574)}
.ls-count b{margin-right:3px;font-size:20px;font-weight:900;color:var(--kdn-ink,#1f2430)}.ls-count b.c-stamp{color:#ea580c}
.ls-count button{margin-left:auto;display:inline-flex;align-items:center;gap:5px;min-height:36px;padding:0 12px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:10px;background:var(--kdn-surface,#fff);font:inherit;font-size:13px;font-weight:800;color:inherit;cursor:pointer}
.ls-rows{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px}
.ls-row{width:100%;display:flex;align-items:center;gap:10px;min-height:56px;padding:8px 12px;border:1.5px solid var(--kdn-line,#dfe2e8);border-radius:14px;background:var(--kdn-surface,#fff);font:inherit;color:inherit;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .08s}
.ls-row:active{transform:scale(.98)}
.ls-row .no{flex:none;width:30px;font-size:13px;font-weight:800;color:var(--kdn-muted,#5d6574)}
.ls-row .nm{flex:1;min-width:0;display:grid;gap:1px}.ls-row .nm b{font-size:16px;font-weight:850}
.ls-row .nm small{font-size:11.5px;color:var(--kdn-muted,#5d6574)}.ls-row .nm small.is-late{color:#c2410c;font-weight:850}
.ls-row .mk{flex:none}
.ls-row.is-stamp{border-color:#ea580c;background:color-mix(in srgb,#ea580c 7%,var(--kdn-surface,#fff))}
.ls-row.is-absent{border-style:dashed;background:var(--kdn-surface-2,#f6f8fb)}
.ls-seal{display:inline-block;padding:4px 9px;border:2px solid #dc2626;border-radius:9px;color:#dc2626;font-style:normal;font-size:13px;font-weight:900;transform:rotate(-6deg);animation:lsSeal .22s ease-out}
@keyframes lsSeal{from{transform:rotate(-6deg) scale(1.6);opacity:0}to{transform:rotate(-6deg) scale(1);opacity:1}}
.ls-abs{font-style:normal;font-size:13px;font-weight:850;color:var(--kdn-muted,#5d6574)}
.ls-empty-dot{display:inline-block;width:26px;height:26px;border:2px dashed var(--kdn-control-line,#cfd5df);border-radius:99px}
/* 도장판 표 */
.ls-legend{display:inline-flex;align-items:center;gap:6px;margin-left:auto;font-size:12px;color:var(--kdn-muted,#5d6574)}
.ls-legend i{display:inline-block;width:12px;height:12px;border-radius:4px;border:1.5px solid var(--kdn-control-line,#cfd5df)}
.ls-legend i.is-stamp{background:#ea580c;border-color:#ea580c}.ls-legend i.is-absent{background:var(--kdn-surface-2,#eef1f4)}.ls-legend i.is-late{border-color:#c2410c;border-style:dashed}
.ls-table-wrap{overflow:auto;border-radius:12px;border:1px solid var(--kdn-line,#dfe2e8);-webkit-overflow-scrolling:touch}
.ls-board-wrap{max-height:72vh}
.ls-table{width:100%;border-collapse:separate;border-spacing:0;font-size:14px}
.ls-table th,.ls-table td{border-bottom:1px solid var(--kdn-line,#dfe2e8);text-align:center;white-space:nowrap}
.ls-board th{position:sticky;top:0;z-index:2;padding:4px 2px;background:var(--kdn-surface-2,#f6f8fb);font-size:12px;color:var(--kdn-muted,#5d6574)}
.ls-board th button{display:grid;gap:0;width:100%;min-width:40px;border:0;background:transparent;font:inherit;font-size:13px;font-weight:900;color:var(--kdn-ink,#1f2430);cursor:pointer}
.ls-board th button small{font-size:10px;font-weight:700;color:var(--kdn-muted,#5d6574)}
.ls-board th.is-today{background:color-mix(in srgb,#ea580c 14%,var(--kdn-surface-2,#f6f8fb))}
.ls-board th.is-cur button{color:#ea580c}
.ls-board .sticky{position:sticky;left:0;z-index:1;background:var(--kdn-surface,#fff);text-align:left;padding:4px 10px;box-shadow:1px 0 0 var(--kdn-line,#dfe2e8)}
.ls-board th.sticky{z-index:3;background:var(--kdn-surface-2,#f6f8fb)}
.ls-board td.sticky b{display:block;font-size:14px}.ls-board td.sticky small{font-size:11px;color:var(--kdn-muted,#5d6574)}
.ls-board td.rate{padding:0 8px;font-size:13px;font-weight:800}
.ls-bcell{padding:3px 2px}
.ls-bcell button{display:grid;place-items:center;width:38px;height:38px;margin:auto;border:1.5px solid var(--kdn-line,#dfe2e8);border-radius:10px;background:var(--kdn-surface,#fff);font:inherit;font-size:15px;font-weight:900;color:#ea580c;cursor:pointer;line-height:1;-webkit-tap-highlight-color:transparent}
.ls-bcell button small{font-size:9px;font-weight:700;color:var(--kdn-muted,#5d6574)}
.ls-bcell button.is-stamp{border-color:#ea580c;background:color-mix(in srgb,#ea580c 12%,var(--kdn-surface,#fff))}
.ls-bcell button.is-absent{color:var(--kdn-muted,#5d6574);font-size:12px;background:var(--kdn-surface-2,#eef1f4)}
.ls-bcell button.is-late{border-style:dashed;border-color:#c2410c}
/* 채점 탭 */
.ls-score{display:grid;gap:10px}
.ls-summary{display:flex;align-items:center;gap:10px}
.ls-summary>div{flex:1;min-width:0;display:grid;gap:2px}.ls-summary b{font-size:16px;font-weight:900}.ls-summary span{font-size:13px;color:var(--kdn-muted,#5d6574)}
.ls-hint{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--kdn-muted,#5d6574)}
.ls-allrow{display:flex;gap:6px;flex-wrap:wrap}
.ls-scards{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px}
.ls-scards>li{gap:6px;padding:10px 12px}
.ls-scard-head{display:flex;align-items:center;gap:8px;width:100%;padding:0;border:0;background:transparent;font:inherit;color:inherit;cursor:pointer;text-align:left}
.ls-scard-head .no{font-size:12.5px;font-weight:800;color:var(--kdn-muted,#5d6574);min-width:26px}
.ls-scard-head b{flex:1;font-size:16px;font-weight:900}
.ls-scard-head em{font-style:normal;font-size:18px;font-weight:900;color:#ea580c}.ls-scard-head em small{font-size:12px;color:var(--kdn-muted,#5d6574)}
.ls-scard-items{display:grid;gap:4px}
.ls-sitem{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:40px;padding:2px 0;border-top:1px dashed var(--kdn-line,#e6e8ec)}
.ls-sitem>span{font-size:14px;font-weight:700}.ls-sitem small{font-size:12px;color:var(--kdn-muted,#5d6574);font-weight:600}
.ls-sitem>b{font-size:15px;font-weight:900}
/* 현황 탭 */
.ls-status{display:grid;gap:10px}
.ls-filters{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ls-srows{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.ls-srow{width:100%;display:grid;grid-template-columns:34px minmax(0,1fr) 90px 54px auto;align-items:center;gap:10px;min-height:58px;padding:8px 12px;border:1px solid var(--kdn-line,#dfe2e8);border-radius:14px;background:var(--kdn-surface,#fff);font:inherit;color:inherit;text-align:left;cursor:pointer}
.ls-srow .no{font-size:13px;font-weight:800;color:var(--kdn-muted,#5d6574)}
.ls-srow .nm{display:grid;gap:1px;min-width:0}.ls-srow .nm b{font-size:15.5px;font-weight:850}.ls-srow .nm small{font-size:12px;color:var(--kdn-muted,#5d6574);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ls-srow .rt{display:grid;gap:2px}.ls-srow .rt small{font-size:12px;font-weight:800}
.ls-srow .sc{text-align:right}.ls-srow .sc b{font-size:17px;font-weight:900}.ls-srow .sc small{font-size:11.5px;color:var(--kdn-muted,#5d6574)}
.ls-rate{display:block;width:100%;height:6px;border-radius:99px;background:var(--kdn-surface-2,#eef1f4);overflow:hidden}.ls-rate i{display:block;height:100%;background:#ea580c}
.ls-pill{display:inline-block;padding:4px 9px;border-radius:99px;font-size:12px;font-weight:850;white-space:nowrap}
.ls-pill.is-ok{background:color-mix(in srgb,#16a34a 14%,transparent);color:#15803d}.ls-pill.is-warn{background:color-mix(in srgb,#d97706 16%,transparent);color:#b45309}.ls-pill.is-bad{background:color-mix(in srgb,#dc2626 14%,transparent);color:#b42318}
/* 팝업 */
.ls-sheet{position:fixed;inset:0;z-index:130;display:flex;align-items:center;justify-content:center}
.ls-sheet-back{position:absolute;inset:0;background:rgba(10,14,22,.5);animation:lsFade .2s ease-out}
.ls-sheet-box{position:relative;display:flex;flex-direction:column;width:min(560px,calc(100vw - 32px));max-height:min(86vh,820px);border-radius:20px;background:var(--kdn-surface,#fff);color:var(--kdn-ink,#1f2430);box-shadow:0 24px 60px rgba(10,14,22,.35);animation:lsPop .22s cubic-bezier(.2,.8,.2,1)}
.ls-sheet-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 10px;border-bottom:1px solid var(--kdn-line,#e6e8ec)}
.ls-sheet-head b{font-size:17px;font-weight:900}
.ls-sheet-head button{width:38px;height:38px;display:grid;place-items:center;border:0;border-radius:10px;background:var(--kdn-surface-2,#f1f3f6);color:inherit;cursor:pointer}
.ls-sheet-body{overflow:auto;padding:14px 16px calc(18px + env(safe-area-inset-bottom));-webkit-overflow-scrolling:touch}
@keyframes lsFade{from{opacity:0}to{opacity:1}}
@keyframes lsPop{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.ls-settings{display:grid;gap:18px}
.ls-settings section{display:grid;gap:8px}
.ls-settings h4,.ls-stu h4{margin:0;font-size:14.5px;font-weight:900}.ls-settings h4 small{font-size:12.5px;color:#ea580c;margin-left:4px}
.ls-line{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:14px;font-weight:700}
.ls-line.wide input{flex:1;min-width:160px;height:38px;padding:0 10px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:9px;background:var(--kdn-surface,#fff);color:inherit;font:inherit}
.ls-it{display:grid;gap:8px;padding:10px 12px;border:1px solid var(--kdn-line,#dfe2e8);border-radius:14px}
.ls-it.is-stamp{background:var(--kdn-surface-2,#f8f9fb)}
.ls-it-top{display:flex;align-items:center;gap:8px}
.ls-name{flex:1;min-width:0;height:40px;padding:0 10px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:10px;background:var(--kdn-surface,#fff);color:inherit;font:inherit;font-size:15px;font-weight:850}
.ls-x{flex:none;width:40px;height:40px;display:grid;place-items:center;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:10px;background:transparent;color:var(--kdn-muted,#5d6574);cursor:pointer}
.ls-it-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ls-bands{border-collapse:collapse;font-size:14px}.ls-bands th{font-size:12px;color:var(--kdn-muted,#5d6574);text-align:left;padding:2px 12px 4px 0}.ls-bands td{padding:3px 12px 3px 0}
.ls-adds{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.ls-stu{display:grid;gap:12px}
.ls-stu-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.ls-stu-head b{font-size:20px;font-weight:900}.ls-stu-head small{font-size:13px;color:var(--kdn-muted,#5d6574)}.ls-stu-head .ls-pill{margin-left:auto}
.ls-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.ls-kpis div{display:grid;justify-items:center;padding:8px 4px;border-radius:12px;background:var(--kdn-surface-2,#f6f8fb)}
.ls-kpis b{font-size:18px;font-weight:900}.ls-kpis small{font-size:11.5px;color:var(--kdn-muted,#5d6574)}
.ls-hist{list-style:none;margin:0;padding:0;display:grid;gap:3px;max-height:260px;overflow:auto}
.ls-hist li{display:grid;grid-template-columns:minmax(0,1fr) 44px minmax(0,1fr);gap:8px;align-items:center;padding:6px 8px;border-radius:9px;font-size:13px}
.ls-hist li:nth-child(odd){background:var(--kdn-surface-2,#f8f9fb)}
.ls-hist li span small{color:var(--kdn-muted,#5d6574)}.ls-hist li b{text-align:center;font-weight:850;color:var(--kdn-muted,#5d6574)}.ls-hist li.is-stamp b{color:#ea580c}
.ls-hist li>small{font-size:11.5px;color:var(--kdn-muted,#5d6574);text-align:right}.ls-hist li>small.is-late{color:#c2410c;font-weight:850}
.ls-form{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
.ls-form>label{display:grid;gap:4px;font-size:12px;font-weight:800;color:var(--kdn-muted,#5d6574)}
.ls-form>label>span{font-size:15px;color:var(--kdn-ink,#1f2430);font-weight:800}.ls-form .is-bad{color:#b42318}
.ls-form>label.ls-toggle{display:inline-flex;color:var(--kdn-ink,#1f2430)}
.ls-form input[type=date],.ls-form .wide input,.ls-form input.wide{height:38px;padding:0 9px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:9px;background:var(--kdn-surface,#fff);color:inherit;font:inherit;font-size:14px}
.ls-form .wide{flex:1 1 100%}
.ls-form input.wide{flex:1 1 100%}
.ls-sessionform>label{flex:1 1 140px}.ls-sessionform>label.wide{flex-basis:100%}
.ls-sessionform input:not([type=date]):not(.ls-num){height:38px;padding:0 9px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:9px;background:var(--kdn-surface,#fff);color:inherit;font:inherit;font-size:14px;width:100%}
.ls-sessionform .ls-select{width:100%}
.ls-logs{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.ls-logs li{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 8px;border-radius:9px;background:var(--kdn-surface-2,#f8f9fb);font-size:13px}
.ls-logs li span{flex:1 1 160px}.ls-logs li button{border:0;background:transparent;color:var(--kdn-muted,#5d6574);cursor:pointer}
.ls-logform .ls-primary{flex:1 1 100%}
.ls-states{display:inline-flex;gap:3px;padding:3px;border-radius:10px;background:var(--kdn-surface-2,#f1f3f6)}
.ls-states button{min-width:44px;height:34px;padding:0 9px;border:0;border-radius:8px;background:transparent;font:inherit;font-size:13px;font-weight:800;color:var(--kdn-muted,#5d6574);cursor:pointer}
.ls-states button.is-on{color:#fff}.ls-states button.s-ok{background:#16a34a}.ls-states button.s-late{background:#d97706}.ls-states button.s-poor{background:#9333ea}
.ls-pts{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.ls-pts label{display:inline-flex;align-items:center;gap:5px;font-size:13.5px;font-weight:800}.ls-pts .ls-num{width:60px}
/* 휴대폰 */
@media (max-width:640px){
  .ls-nav{flex-wrap:wrap;border-bottom:0;padding:0}.ls-save{order:-1;margin-left:auto}
  .ls-tabs3{flex-basis:100%;display:grid;grid-template-columns:repeat(3,1fr);gap:3px;padding:4px;border-radius:14px;background:var(--kdn-surface-2,#f0f1f5)}
  .ls-tabs3 button{justify-content:center;height:42px;padding:0 6px;margin:0;border:0;border-radius:10px;font-size:14px}
  .ls-tabs3 button svg{display:none}
  .ls-tabs3 button.is-on{background:var(--kdn-panel,#2a3040);color:#fff}
  .ls-books{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.ls-books::-webkit-scrollbar{display:none}
  .ls-viewpick{max-width:180px}
  .ls-gear span{display:none}.ls-gear{width:44px;justify-content:center;padding:0}
  .ls-rows{grid-template-columns:1fr}
  .ls-scards{grid-template-columns:1fr}
  .ls-srow{grid-template-columns:28px minmax(0,1fr) 46px auto;gap:8px}.ls-srow .rt{display:none}
  .ls-sheet{align-items:flex-end}
  .ls-sheet-box{width:100vw;max-height:90vh;border-radius:20px 20px 0 0;animation:lsUp .26s cubic-bezier(.2,.8,.2,1)}
  @keyframes lsUp{from{transform:translateY(100%)}to{transform:none}}
  .ls-legend{margin-left:0}
}
@media (prefers-reduced-motion: reduce){.ls-seal,.ls-sheet-box,.ls-sheet-back{animation:none}}
`;
