// 선생님 ZONE › 수업 도장 (수학 도장노트 기능을 KDTIME으로 옮김)
// - 반·분반 명단은 KDTIME 학생 명단(학급 고정 수업)·이동수업 출석부(이동수업)에서 바로 가져옵니다(따로 입력하지 않음).
// - 수업마다 학생 칸을 눌러 도장 → 결석 → 비움. 포트폴리오 점수(도장률 구간 + 추가 항목)와 최성보(결석 허용 1/3 · 학업성취율) 판정.
// - 자료는 도장부마다 kd_stamps__{학년-학기-과목-반}에 저장(같은 반을 맡은 선생님끼리 함께 씀, 저장 시 자동 백업).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Stamp, Plus, Trash2, Copy, Users, Award, ShieldCheck, CalendarDays, Check } from "lucide-react";
import { readStorage, updateStorage } from "./storage.js";
import { booksForAssignment, emptyBook, normalizeBook, sessionsAsc, stampStats, stampScore, stampMax, itemScore, itemMax, totalFor, totalMax, csbStatus, nextMark, MATH_UNITS, ITEM_TEMPLATES } from "./lessonStamps.js";

const storeKey = id => `kd_stamps__${id}`;
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const dayLabel = iso => { if (!iso) return ""; const [y, m, d] = iso.split("-").map(Number); return `${m}.${d} (${WD[new Date(y, m - 1, d).getDay()]})`; };
const uid = prefix => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const clone = value => JSON.parse(JSON.stringify(value));
const copyText = async (text, showToast) => { try { await navigator.clipboard.writeText(text); showToast?.("복사했어요. 엑셀에 붙여 넣으세요.", "success"); } catch { showToast?.("복사하지 못했어요.", "error"); } };

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
  const [book, setBook] = useState(null);
  const [tab, setTab] = useState("lesson");
  const [loadError, setLoadError] = useState("");

  // 도장부 불러오기 + 20초마다 다른 선생님 변경 반영
  useEffect(() => {
    if (!meta) return undefined;
    let alive = true;
    const info = { id: meta.id, subject: meta.subject, target: meta.target, grade, semester };
    const load = () => readStorage(storeKey(meta.id), null, { throwOnError: true }).then(value => { if (alive) { setBook(normalizeBook(value, info)); setLoadError(""); } }).catch(() => alive && setLoadError("도장부를 불러오지 못했어요. 연결을 확인해 주세요."));
    setBook(null);
    load();
    const timer = window.setInterval(() => { if (!document.hidden) load(); }, 20000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [meta?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // 고치기: 화면에 먼저 반영하고, 저장소에는 최신본에 같은 변경을 적용해 저장(다른 선생님 변경과 안 부딪히게)
  const mutate = async fn => {
    if (!meta) return;
    const info = { id: meta.id, subject: meta.subject, target: meta.target, grade, semester };
    setBook(current => fn(clone(normalizeBook(current, info))));
    const result = await updateStorage(storeKey(meta.id), emptyBook(info), current => fn(clone(normalizeBook(current, info))));
    if (result.ok) setBook(normalizeBook(result.value, info));
    else showToast?.(`저장하지 못했어요. (${result.error})`, "error");
  };

  if (!books.length) return <div className="ls"><style>{LS_CSS}</style><div className="ls-empty"><Stamp size={22} /><b>{grade}학년 {semester === "sem2" ? "2" : "1"}학기 담당 과목이 없어요</b><span>내 정보에서 담당 과목과 반(분반)을 고르면, 학생 명단·이동수업 출석부로 도장부가 자동으로 만들어져요.</span></div></div>;

  return <div className="ls">
    <style>{LS_CSS}</style>
    <div className="ls-books" role="tablist" aria-label="도장부">
      {books.map(item => <button key={item.id} type="button" data-kdn-bare role="tab" aria-selected={item.id === meta.id} className={item.id === meta.id ? "is-on" : ""} onClick={() => setPickedId(item.id)}>
        <b>{item.subject}</b><small>{item.label} · {item.students.length}명</small>
      </button>)}
    </div>
    <div className="ls-tabs" role="tablist">
      {[["lesson", "수업", <CalendarDays size={14} key="i" />], ["list", "학생 목록", <Users size={14} key="i" />], ["score", "점수", <Award size={14} key="i" />], ["csb", "최성보", <ShieldCheck size={14} key="i" />]].map(([key, label, icon]) => <button key={key} type="button" data-kdn-bare role="tab" aria-selected={tab === key} className={tab === key ? "is-on" : ""} onClick={() => setTab(key)}>{icon}{label}</button>)}
    </div>
    {loadError && <div className="ls-note is-error">{loadError}</div>}
    {!book ? <div className="ls-note">불러오는 중…</div>
      : tab === "lesson" ? <LessonTab book={book} meta={meta} mutate={mutate} teacher={teacher} />
      : tab === "list" ? <ListTab book={book} meta={meta} showToast={showToast} />
      : tab === "score" ? <ScoreTab book={book} meta={meta} mutate={mutate} />
      : <CsbTab book={book} meta={meta} mutate={mutate} showToast={showToast} teacher={teacher} />}
  </div>;
}

// 글자 입력은 칸을 벗어날 때(또는 Enter) 한 번만 저장합니다(글자마다 저장하지 않게).
function BlurInput({ value, onCommit, ...rest }) {
  const shown = value ?? "";
  return <input key={String(shown)} defaultValue={shown} {...rest}
    onBlur={e => { if (String(e.target.value) !== String(shown)) onCommit(e.target.value); }}
    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}

// ── 수업: 수업 목록 + 학생 칸 눌러 도장 ──
function LessonTab({ book, meta, mutate, teacher }) {
  const sessions = sessionsAsc(book).reverse();
  const [openId, setOpenId] = useState(sessions[0]?.id || "");
  const open = sessions.find(s => s.id === openId) || sessions[0] || null;
  const units = MATH_UNITS[meta.subject] || null;
  const addSession = () => {
    const id = uid("s");
    const lastUnit = sessions[0]?.unit || "";
    mutate(b => { b.sessions[id] = { date: todayIso(), period: "", unit: lastUnit, topic: "", pages: "", memo: "", by: teacher?.name || "", at: new Date().toISOString() }; return b; });
    setOpenId(id);
  };
  const patch = (id, fields) => mutate(b => { b.sessions[id] = { ...b.sessions[id], ...fields }; return b; });
  const remove = id => { if (!window.confirm("이 수업 기록(도장 포함)을 지울까요?")) return; mutate(b => { delete b.sessions[id]; delete b.marks[id]; return b; }); setOpenId(""); };
  const tap = sid => mutate(b => { const marks = (b.marks[open.id] ||= {}); const next = nextMark(marks[sid]); if (next) marks[sid] = next; else delete marks[sid]; return b; });
  const stampAll = () => mutate(b => { const marks = (b.marks[open.id] ||= {}); meta.students.forEach(st => { if (!marks[st.sid]) marks[st.sid] = "stamp"; }); return b; });
  const marks = open ? book.marks?.[open.id] || {} : {};
  const count = state => meta.students.filter(st => marks[st.sid] === state).length;

  return <div className="ls-lesson">
    <aside className="ls-sessions">
      <button type="button" data-kdn-bare className="ls-add" onClick={addSession}><Plus size={15} />오늘 수업 추가</button>
      {!sessions.length && <p className="ls-mini">아직 수업 기록이 없어요.</p>}
      <ul>{sessions.map(s => { const m = book.marks?.[s.id] || {}; const stamped = Object.values(m).filter(v => v === "stamp").length; return <li key={s.id}><button type="button" data-kdn-bare className={open?.id === s.id ? "is-on" : ""} onClick={() => setOpenId(s.id)}>
        <b>{dayLabel(s.date)}{s.period ? ` · ${s.period}교시` : ""}</b><small>{s.topic || (s.unit ? s.unit.split(" · ").pop() : "") || "주제 없음"}</small><em>{stamped}/{meta.students.length}</em>
      </button></li>; })}</ul>
    </aside>
    {open ? <section className="ls-session">
      <div className="ls-session-form">
        <label>날짜<input type="date" value={open.date || ""} onChange={e => patch(open.id, { date: e.target.value })} /></label>
        <label>교시<select value={open.period || ""} onChange={e => patch(open.id, { period: e.target.value })}><option value="">-</option>{[1, 2, 3, 4, 5, 6, 7].map(p => <option key={p} value={p}>{p}교시</option>)}</select></label>
        {units ? <label className="wide">단원<select value={open.unit || ""} onChange={e => patch(open.id, { unit: e.target.value })}><option value="">단원 선택</option>{units.map(([big, smalls]) => <optgroup key={big} label={big}>{smalls.map(small => <option key={small} value={`${big} · ${small}`}>{small}</option>)}</optgroup>)}</select></label> : null}
        <label className="wide">주제<BlurInput value={open.topic} placeholder="오늘 배운 내용" onCommit={value => patch(open.id, { topic: value })} /></label>
        <label>교재 쪽<BlurInput value={open.pages} placeholder="예: 32-35" onCommit={value => patch(open.id, { pages: value })} /></label>
        <button type="button" data-kdn-bare className="ls-del" onClick={() => remove(open.id)} title="이 수업 기록 지우기"><Trash2 size={14} /></button>
      </div>
      <div className="ls-stamp-head"><b>도장 {count("stamp")} · 결석 {count("absent")} · 남음 {meta.students.length - count("stamp") - count("absent")}</b><span>칸을 누를 때마다 도장 → 결석 → 비움</span><button type="button" data-kdn-bare onClick={stampAll}><Check size={14} />남은 학생 모두 도장</button></div>
      <div className="ls-grid">{meta.students.map(st => { const state = marks[st.sid] || ""; return <button key={st.sid} type="button" data-kdn-bare className={`ls-cell ${state ? `is-${state}` : ""}`} onClick={() => tap(st.sid)} aria-label={`${st.name} ${state === "stamp" ? "도장" : state === "absent" ? "결석" : "비어 있음"}`}>
        <small>{meta.kind === "common" ? `${st.number}번` : `${st.class}반 ${st.number}번`}</small><b>{st.name || st.sid}</b>
        {state === "stamp" && <i className="ls-seal" style={{ rotate: `${(st.sid.charCodeAt(4) % 15) - 7}deg` }}>{open.pages ? `p.${open.pages}` : dayLabel(open.date).split(" ")[0]}</i>}
        {state === "absent" && <i className="ls-absent">결석</i>}
      </button>; })}</div>
    </section> : <section className="ls-session"><div className="ls-note">‘오늘 수업 추가’를 누르면 도장을 찍을 수 있어요.</div></section>}
  </div>;
}

// ── 학생 목록: 도장·결석·도장률·점수·최성보를 한 표에 ──
function ListTab({ book, meta, showToast }) {
  const [sort, setSort] = useState("seat");
  const [openSid, setOpenSid] = useState("");
  const sessions = sessionsAsc(book);
  const rows = meta.students.map(st => ({ ...st, s: stampStats(book, st.sid), total: totalFor(book, st.sid), csb: csbStatus(book, st.sid) }));
  const ordered = rows.slice().sort((a, b) => sort === "rate" ? a.s.rate - b.s.rate : sort === "score" ? b.total - a.total : sort === "csb" ? ({ bad: 0, warn: 1, ok: 2 }[a.csb.level] - { bad: 0, warn: 1, ok: 2 }[b.csb.level]) : 0);
  const max = totalMax(book);
  const tsv = () => [["번호", "학번", "이름", "도장", "결석", "미도장", "도장률", `점수(/${max})`, "최성보"].join("\t"), ...rows.map(r => [r.number, r.sid, r.name, r.s.stamps, r.s.absent, r.s.missed, `${Math.round(r.s.rate)}%`, r.total, r.csb.label].join("\t"))].join("\n");
  return <div className="ls-card">
    <div className="ls-bar"><b>{meta.subject} {meta.label} · {rows.length}명 · 수업 {sessions.length}회</b><span>정렬</span>
      <div className="ls-seg">{[["seat", "번호순"], ["rate", "도장률 낮은 순"], ["score", "점수순"], ["csb", "최성보 먼저"]].map(([key, label]) => <button key={key} type="button" data-kdn-bare className={sort === key ? "is-on" : ""} onClick={() => setSort(key)}>{label}</button>)}</div>
      <button type="button" data-kdn-bare className="ls-copy" onClick={() => copyText(tsv(), showToast)}><Copy size={14} />엑셀용 복사</button></div>
    <div className="ls-table-wrap"><table className="ls-table">
      <thead><tr><th>번호</th><th>학번</th><th>이름</th><th>도장</th><th>결석</th><th>미도장</th><th>도장률</th><th>점수</th><th>최성보</th></tr></thead>
      <tbody>{ordered.map(r => <React.Fragment key={r.sid}><tr className={openSid === r.sid ? "is-open" : ""} onClick={() => setOpenSid(openSid === r.sid ? "" : r.sid)}>
        <td>{meta.kind === "common" ? r.number : `${r.class}-${r.number}`}</td><td className="dim">{r.sid}</td><td><b>{r.name}</b></td><td>{r.s.stamps}</td><td>{r.s.absent || ""}</td><td>{r.s.missed || ""}</td>
        <td><span className="ls-rate"><i style={{ width: `${Math.min(100, r.s.rate)}%` }} /></span><small>{Math.round(r.s.rate)}%</small></td>
        <td><b>{r.total}</b><small>/{max}</small></td><td><span className={`ls-pill is-${r.csb.level}`}>{r.csb.label}</span></td></tr>
        {openSid === r.sid && <tr className="ls-detail"><td colSpan={9}><div className="ls-dots">{sessions.map(s => { const m = book.marks?.[s.id]?.[r.sid]; return <span key={s.id} title={`${dayLabel(s.date)} ${m === "stamp" ? "도장" : m === "absent" ? "결석" : "미도장"}`} className={m ? `is-${m}` : ""}>{dayLabel(s.date).split(" ")[0]}</span>; })}</div></td></tr>}
      </React.Fragment>)}</tbody></table></div>
    <div className="ls-foot">줄을 누르면 수업마다 도장 기록이 보여요 · 도장률은 {book.scoring?.stamp?.excludeAbsent ? "결석한 수업을 빼고" : "모든 수업 기준으로"} 계산</div>
  </div>;
}

// ── 점수: 도장률 구간 + 추가 항목(오답노트·모의고사 업로드·피드백·직접) ──
function ScoreTab({ book, meta, mutate }) {
  const cfg = book.scoring.stamp;
  const items = book.scoring.items;
  const setStamp = fields => mutate(b => { b.scoring.stamp = { ...b.scoring.stamp, ...fields }; return b; });
  const setBand = (i, fields) => mutate(b => { b.scoring.stamp.bands[i] = { ...b.scoring.stamp.bands[i], ...fields }; return b; });
  const addItem = key => mutate(b => { b.scoring.items.push({ id: uid("i"), ...clone(ITEM_TEMPLATES[key]) }); return b; });
  const removeItem = id => { if (!window.confirm("이 항목과 입력한 점수를 지울까요?")) return; mutate(b => { b.scoring.items = b.scoring.items.filter(it => it.id !== id); delete b.items[id]; return b; }); };
  const renameItem = (id, name) => mutate(b => { const it = b.scoring.items.find(x => x.id === id); if (it) it.name = name; return b; });
  const setValue = (itemId, sid, value) => mutate(b => { (b.items[itemId] ||= {}); if (value === "" || value == null) delete b.items[itemId][sid]; else b.items[itemId][sid] = value; return b; });
  return <div className="ls-score">
    <div className="ls-card ls-config">
      <div className="ls-bar"><b>도장 점수</b><label className="ls-check"><input type="checkbox" checked={!!cfg.enabled} onChange={e => setStamp({ enabled: e.target.checked })} />사용</label><label className="ls-check"><input type="checkbox" checked={!!cfg.excludeAbsent} onChange={e => setStamp({ excludeAbsent: e.target.checked })} />결석 수업은 도장률에서 빼기</label></div>
      <div className="ls-bands">{cfg.bands.map((band, i) => <label key={i}>도장률 <input type="number" value={band.min} onChange={e => setBand(i, { min: Number(e.target.value) })} />% 이상 → <input type="number" value={band.score} onChange={e => setBand(i, { score: Number(e.target.value) })} />점</label>)}<label>그 밖 <input type="number" value={cfg.floor} onChange={e => setStamp({ floor: Number(e.target.value) })} />점</label></div>
      <div className="ls-bar"><b>추가 항목</b><span>항목 추가</span>{Object.entries({ wrong: "오답노트", mock: "모의고사 업로드", feedback: "피드백", custom: "직접 입력" }).map(([key, label]) => <button key={key} type="button" data-kdn-bare className="ls-chip" onClick={() => addItem(key)}><Plus size={13} />{label}</button>)}</div>
      {items.map(it => <div key={it.id} className="ls-item"><BlurInput value={it.name} onCommit={value => renameItem(it.id, value)} aria-label="항목 이름" /><small>{it.type === "check" ? `제출 ${it.on}점 · 미제출 ${it.off}점` : it.type === "level" ? it.levels.map(l => `${l.label} ${l.score}`).join(" · ") : `직접 입력 · 만점 ${it.max}`}</small><button type="button" data-kdn-bare onClick={() => removeItem(it.id)} aria-label="항목 지우기"><Trash2 size={13} /></button></div>)}
    </div>
    <div className="ls-card"><div className="ls-table-wrap"><table className="ls-table">
      <thead><tr><th>번호</th><th>이름</th>{cfg.enabled && <th>도장<small> /{stampMax(book)}</small></th>}{items.map(it => <th key={it.id}>{it.name}<small> /{itemMax(it)}</small></th>)}<th>합계<small> /{totalMax(book)}</small></th></tr></thead>
      <tbody>{meta.students.map(st => { const value = id => book.items?.[id]?.[st.sid]; return <tr key={st.sid}><td>{meta.kind === "common" ? st.number : `${st.class}-${st.number}`}</td><td><b>{st.name}</b></td>
        {cfg.enabled && <td>{stampScore(book, st.sid)}<small> ({Math.round(stampStats(book, st.sid).rate)}%)</small></td>}
        {items.map(it => <td key={it.id}>{it.type === "check" ? <input type="checkbox" checked={!!value(it.id)} onChange={e => setValue(it.id, st.sid, e.target.checked ? true : "")} aria-label={`${st.name} ${it.name}`} />
          : it.type === "level" ? <select value={value(it.id) ?? ""} onChange={e => setValue(it.id, st.sid, e.target.value === "" ? "" : Number(e.target.value))}><option value="">-</option>{it.levels.map((l, i) => <option key={i} value={i}>{l.label}</option>)}</select>
          : <input type="number" min="0" max={itemMax(it)} value={value(it.id) ?? ""} onChange={e => setValue(it.id, st.sid, e.target.value)} />}<small className="ls-sub">{itemScore(book, it, st.sid) ?? ""}</small></td>)}
        <td><b>{totalFor(book, st.sid)}</b></td></tr>; })}</tbody></table></div></div>
  </div>;
}

// ── 최성보: 결석 허용(총 시수 1/3) · 학업성취율 · 예방/보충 지도 기록 ──
function CsbTab({ book, meta, mutate, showToast, teacher }) {
  const [filter, setFilter] = useState("all");
  const [logSid, setLogSid] = useState("");
  const rows = meta.students.map(st => ({ ...st, c: csbStatus(book, st.sid) }));
  const shown = rows.filter(r => filter === "all" || r.c.level === filter);
  const setCsb = (sid, fields) => mutate(b => { b.csb[sid] = { ...(b.csb[sid] || {}), ...fields }; return b; });
  const counts = { bad: rows.filter(r => r.c.level === "bad").length, warn: rows.filter(r => r.c.level === "warn").length };
  const tsv = () => [["번호", "학번", "이름", "결석", "허용", "학업성취율", "판정", "사유", "지도 시간"].join("\t"), ...rows.map(r => [r.number, r.sid, r.name, r.c.stats.absent, r.c.allow, r.c.info.rate ?? "", r.c.label, r.c.reasons.join(" / "), r.c.guidedHours].join("\t"))].join("\n");
  return <div className="ls-card">
    <div className="ls-bar"><b>최소성취수준 보장지도</b>
      <label className="ls-inline">총 시수 <input type="number" value={book.hours} onChange={e => mutate(b => { b.hours = Number(e.target.value) || 0; return b; })} />시간 (결석 허용 {Math.floor((Number(book.hours) || 0) / 3)}시간)</label>
      <label className="ls-inline">학업성취율 기준 <input type="number" value={book.threshold} onChange={e => mutate(b => { b.threshold = Number(e.target.value) || 0; return b; })} />%</label>
      <div className="ls-seg">{[["all", `전체 ${rows.length}`], ["bad", `보충지도 ${counts.bad}`], ["warn", `예방지도 ${counts.warn}`]].map(([key, label]) => <button key={key} type="button" data-kdn-bare className={filter === key ? "is-on" : ""} onClick={() => setFilter(key)}>{label}</button>)}</div>
      <button type="button" data-kdn-bare className="ls-copy" onClick={() => copyText(tsv(), showToast)}><Copy size={14} />엑셀용 복사</button></div>
    <div className="ls-table-wrap"><table className="ls-table">
      <thead><tr><th>번호</th><th>이름</th><th>결석 / 허용</th><th>도장률</th><th>학업성취율</th><th>판정</th><th>지도 기록</th><th>이수 확인</th></tr></thead>
      <tbody>{shown.map(r => <React.Fragment key={r.sid}><tr>
        <td>{meta.kind === "common" ? r.number : `${r.class}-${r.number}`}</td><td><b>{r.name}</b></td>
        <td className={r.c.left < 0 ? "is-bad" : r.c.left <= 3 ? "is-warn" : ""}>{r.c.stats.absent} / {r.c.allow}<small> (남음 {Math.max(r.c.left, 0)})</small></td>
        <td>{Math.round(r.c.stats.rate)}%</td>
        <td><BlurInput type="number" min="0" max="100" value={r.c.info.rate ?? ""} onCommit={value => setCsb(r.sid, { rate: value === "" ? null : Number(value) })} aria-label={`${r.name} 학업성취율`} />%</td>
        <td><span className={`ls-pill is-${r.c.level}`}>{r.c.label}</span>{r.c.reasons.length > 0 && <small className="ls-reason">{r.c.reasons.join(" · ")}</small>}</td>
        <td><button type="button" data-kdn-bare className="ls-chip" onClick={() => setLogSid(logSid === r.sid ? "" : r.sid)}>{r.c.logs.length ? `${r.c.logs.length}건 · ${r.c.guidedHours}시간` : "+ 기록"}</button></td>
        <td><input type="checkbox" checked={!!r.c.info.done} onChange={e => setCsb(r.sid, { done: e.target.checked })} aria-label={`${r.name} 이수 확인`} /></td></tr>
        {logSid === r.sid && <tr className="ls-detail"><td colSpan={8}><CsbLogs logs={r.c.logs} onAdd={log => mutate(b => { b.logs.push({ id: uid("l"), sid: r.sid, by: teacher?.name || "", ...log }); return b; })} onRemove={id => mutate(b => { b.logs = b.logs.filter(l => l.id !== id); return b; })} /></td></tr>}
      </React.Fragment>)}</tbody></table></div>
    <div className="ls-foot">결석 허용 = 총 시수의 1/3 · 학업성취율이 기준 미만이거나 결석이 허용을 넘으면 보충지도, 기준+10% 미만·결석 3시간 이내 남음·도장률 50% 미만이면 예방지도 권장</div>
  </div>;
}
function CsbLogs({ logs, onAdd, onRemove }) {
  const [form, setForm] = useState({ date: todayIso(), kind: "예방지도", hours: 1, content: "", result: "진행 중" });
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
.ls{display:grid;gap:12px;color:var(--kdn-ink,#1f2430)}
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
.ls-item{display:flex;align-items:center;gap:8px}.ls-item input{flex:0 1 240px;height:32px;padding:0 9px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:8px;background:var(--kdn-surface,#fff);color:inherit;font:inherit;font-weight:800}
.ls-item small{font-size:12px;color:var(--kdn-muted,#5d6574)}.ls-item button{border:0;background:transparent;color:var(--kdn-muted,#5d6574);cursor:pointer}
.ls-sub{margin-left:4px}
.ls-logs{display:grid;gap:6px}
.ls-log{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px}.ls-log span{flex:1 1 200px;white-space:normal}.ls-log em{font-style:normal;color:var(--kdn-muted,#5d6574)}
.ls-log button{border:0;background:transparent;color:var(--kdn-muted,#5d6574);cursor:pointer}
.ls-log-form{display:flex;flex-wrap:wrap;gap:6px}.ls-log-form .wide{flex:1 1 220px}.ls-log-form input[type=number]{width:70px}
@media (max-width:760px){.ls-lesson{grid-template-columns:1fr}.ls-sessions{max-height:none}.ls-sessions ul{display:flex;overflow-x:auto;gap:6px}.ls-sessions li button{min-width:150px;border:1px solid var(--kdn-line,#dfe2e8)}.ls-grid{grid-template-columns:repeat(auto-fill,minmax(96px,1fr))}}
@media (prefers-reduced-motion: reduce){.ls-seal{animation:none}}
`;
