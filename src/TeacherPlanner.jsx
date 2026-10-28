// 선생님 ZONE '내 일정': 학교 학사일정 위에 내 일정을 적고, 미리 알림을 받습니다.
// - 내 일정은 선생님마다 따로 저장(다른 선생님에게 안 보임). 링크·파일 첨부, 반복(매주·매월), 중요 표시, 끝냄 체크.
// - 관리자·학년부장·부서 계정은 고른 선생님들에게 일정을 '보내기'(받은 선생님 달력에 들어가고, 끝냄 여부를 보낸 사람이 확인).
// - 알림: 마감 2일 전·1일 전은 팝업, 오늘 할 일은 화면 오른쪽 아래 접히는 [오늘 할 일] 창(PlannerReminders).
// - 구글 캘린더에 하나씩 추가하거나 .ics 파일로 휴대폰·구글·아웃룩 캘린더에 한꺼번에 가져갈 수 있습니다.
import React from "react";
import { Bell, BellRing, Check, ChevronLeft, ChevronRight, Plus, Trash2, X, CalendarDays, Loader2, Link2, Paperclip, Star, Send, Download, List, Repeat, ExternalLink, ChevronDown, ChevronUp, Users } from "lucide-react";
import { readStorage, updateStorage, uploadClassroomAttachment, deleteClassroomAttachment } from "./storage.js";
import { plannerKey, normalizeItem, normalizeItems, normalizeAssign, assignedFor, ASSIGN_KEY, expandOccurrences, plannerAlerts, popupItems, todayItems, toggleDoneIn, dLabel, monthCells, schoolEventsByDate, dateKey, shiftKey, dayNo, REMIND_OPTIONS, REPEAT_OPTIONS, PLANNER_COLORS, googleCalendarUrl, plannerIcs } from "./teacherPlanner.js";

const COLOR_HEX = { orange: "#ea580c", blue: "#2563eb", green: "#16a34a", purple: "#7c3aed", red: "#dc2626" };
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const SHARED_COLOR = "#7c3aed";

// 내 일정 + 받은 일정을 함께 불러옵니다. 다른 화면(오늘 할 일 창)에서 고치면 'kd-planner-changed'로 서로 새로 읽습니다.
export function usePlannerData(owner) {
  const [items, setItems] = React.useState(null);
  const [assigns, setAssigns] = React.useState([]);
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const again = () => setTick(value => value + 1);
    window.addEventListener("kd-planner-changed", again);
    return () => window.removeEventListener("kd-planner-changed", again);
  }, []);
  React.useEffect(() => {
    let on = true;
    if (!owner) { setItems(null); return () => {}; }
    Promise.all([readStorage(plannerKey(owner), { items: [] }).catch(() => ({ items: [] })), readStorage(ASSIGN_KEY, { items: [] }).catch(() => ({ items: [] }))]).then(([mine, shared]) => {
      if (!on) return;
      setItems(normalizeItems(mine?.items));
      setAssigns((shared?.items || []).map(normalizeAssign));
    });
    return () => { on = false; };
  }, [owner, tick]);
  const received = React.useMemo(() => assignedFor(owner, assigns), [owner, assigns]);
  const savePersonal = React.useCallback(async (change, ownerName = "") => {
    const result = await updateStorage(plannerKey(owner), { items: [] }, current => ({ ...(current || {}), owner: ownerName || current?.owner || owner, items: change(normalizeItems(current?.items)), updatedAt: new Date().toISOString() }));
    if (result?.ok === false) return false;
    setItems(normalizeItems(result?.value?.items));
    window.dispatchEvent(new CustomEvent("kd-planner-changed", { detail: { from: "save" } }));
    return true;
  }, [owner]);
  const saveShared = React.useCallback(async change => {
    const result = await updateStorage(ASSIGN_KEY, { items: [] }, current => ({ ...(current || {}), items: change((current?.items || []).map(normalizeAssign)), updatedAt: new Date().toISOString() }));
    if (result?.ok === false) return false;
    setAssigns((result?.value?.items || []).map(normalizeAssign));
    window.dispatchEvent(new CustomEvent("kd-planner-changed", { detail: { from: "save" } }));
    return true;
  }, []);
  // 끝냄 체크: 내 일정은 내 저장소, 받은 일정은 공용 저장소의 내 이름 칸
  const toggleDone = React.useCallback(occ => occ.shared
    ? saveShared(list => list.map(item => { if (item.id !== occ.id) return item; const doneBy = { ...item.doneBy }; if (doneBy[owner]) delete doneBy[owner]; else doneBy[owner] = new Date().toISOString(); return { ...item, doneBy }; }))
    : savePersonal(list => toggleDoneIn(list, occ)), [owner, savePersonal, saveShared]);
  return { items, assigns, received, all: items ? [...items, ...received] : null, savePersonal, saveShared, toggleDone };
}

async function openFile(file) {
  if (file.dataKey) {
    const stored = await readStorage(file.dataKey, null);
    if (!stored?.dataUrl) throw new Error("첨부파일을 찾지 못했습니다.");
    const anchor = document.createElement("a");
    anchor.href = stored.dataUrl; anchor.download = file.fileName || stored.fileName || "첨부파일";
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    return;
  }
  if (file.url) window.open(file.url, "_blank", "noopener,noreferrer");
}
const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
const colorOf = item => (item.shared ? SHARED_COLOR : COLOR_HEX[item.color] || COLOR_HEX.orange);

// 일정 한 줄(오늘 할 일 창·팝업·날짜 목록 공통)
export function ItemRow({ item, onToggle, onOpen, compact = false, showDate = false }) {
  const [busyFile, setBusyFile] = React.useState("");
  return <article className={`kdp-item${item.done ? " done" : ""}${compact ? " compact" : ""}`} style={{ "--c": colorOf(item) }}>
    <button type="button" data-kdn-bare className="chk" aria-pressed={item.done} aria-label={item.done ? "끝냄 취소" : "끝냄으로 표시"} title={item.done ? "끝냄 취소" : "끝냈어요"} onClick={() => onToggle?.(item)}>{item.done && <Check size={14} strokeWidth={3} />}</button>
    <div className="body">
      <b onClick={onOpen ? () => onOpen(item) : undefined} className={onOpen ? "click" : ""}>{item.important && <Star size={13} className="star" fill="currentColor" />}{showDate && <span className="when">{item.date.slice(5).replace("-", "/")}</span>}{item.time && <time>{item.time}</time>}{item.title}</b>
      {(item.shared || item.repeat !== "none" || item.diff != null) && <span className="tags">{item.diff != null && !compact && <em className={item.diff < 0 ? "late" : item.diff === 0 ? "today" : ""}>{dLabel(item.diff)}</em>}{item.shared && <em className="from"><Send size={11} />{item.from?.name || "보낸 일정"}</em>}{item.repeat !== "none" && <em><Repeat size={11} />{item.repeat === "weekly" ? "매주" : "매월"}</em>}</span>}
      {!compact && item.memo && <p>{item.memo}</p>}
      {(item.links?.length > 0 || item.files?.length > 0) && <span className="atts">
        {item.links.map(link => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer"><Link2 size={12} />{link.label || hostOf(link.url)}</a>)}
        {item.files.map(file => <button key={file.dataKey || file.url || file.fileName} type="button" data-kdn-bare disabled={busyFile === file.fileName} onClick={async () => { setBusyFile(file.fileName); try { await openFile(file); } catch (error) { window.alert(error?.message || "파일을 열지 못했어요."); } finally { setBusyFile(""); } }}>{busyFile === file.fileName ? <Loader2 size={12} className="spin" /> : <Paperclip size={12} />}{file.fileName}</button>)}
      </span>}
    </div>
  </article>;
}

// 받는 사람 고르기: 묶음(전체·학년 담임·학년부) + 이름 검색 + 개별 체크
function RecipientPicker({ recipients, value, onChange }) {
  const [query, setQuery] = React.useState("");
  const set = new Set(value);
  const groups = React.useMemo(() => {
    const out = [["전체 선생님", recipients.map(r => r.owner)]];
    ["1", "2", "3"].forEach(g => {
      const homeroom = recipients.filter(r => r.grade === g && r.role === "homeroom").map(r => r.owner);
      const dept = recipients.filter(r => r.grade === g && ["homeroom", "gradeHead"].includes(r.role)).map(r => r.owner);
      if (homeroom.length) out.push([`${g}학년 담임`, homeroom]);
      if (dept.length > homeroom.length) out.push([`${g}학년부 전체`, dept]);
    });
    return out;
  }, [recipients]);
  const toggleGroup = owners => { const all = owners.every(o => set.has(o)); const next = new Set(set); owners.forEach(o => (all ? next.delete(o) : next.add(o))); onChange(Array.from(next)); };
  const q = query.trim();
  const shown = recipients.filter(r => !q || r.name.includes(q) || (r.label || "").includes(q));
  return <div className="kdp-recip">
    <div className="groups">{groups.map(([label, owners]) => <button key={label} type="button" data-kdn-bare aria-pressed={owners.length > 0 && owners.every(o => set.has(o))} onClick={() => toggleGroup(owners)}>{label} <small>{owners.length}</small></button>)}</div>
    <input value={query} placeholder="이름으로 찾기" aria-label="받는 선생님 찾기" onChange={event => setQuery(event.target.value)} />
    <div className="names">{shown.map(r => <label key={r.owner} className={set.has(r.owner) ? "is-on" : ""}><input type="checkbox" checked={set.has(r.owner)} onChange={() => { const next = new Set(set); if (next.has(r.owner)) next.delete(r.owner); else next.add(r.owner); onChange(Array.from(next)); }} />{r.name}{r.label && <small>{r.label}</small>}</label>)}{!shown.length && <small className="none">찾는 선생님이 없어요</small>}</div>
    <small className="cnt">{value.length}명 선택</small>
  </div>;
}

function ItemForm({ form, setForm, isNew, assignMode, recipients, owner, ownerName, busy, onSave, onDelete, onClose }) {
  const [linkDraft, setLinkDraft] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [fileError, setFileError] = React.useState("");
  const addLink = () => { const text = linkDraft.trim(); if (!text) return; setForm({ ...form, links: [...(form.links || []), { url: text, label: "" }].slice(0, 8) }); setLinkDraft(""); };
  const addFiles = async list => {
    setFileError(""); setUploading(true);
    const uploaded = [];
    try { for (const file of Array.from(list || []).slice(0, 5 - (form.files || []).length)) uploaded.push({ ...(await uploadClassroomAttachment(file, { scopeKey: `planner-${owner}`, subject: "내 일정", target: form.date || "일정", teacherName: ownerName || "선생님" })), fileName: file.name, size: file.size }); }
    catch (error) { setFileError(error?.message || "파일을 올리지 못했어요."); }
    finally { setUploading(false); if (uploaded.length) setForm(current => ({ ...current, files: [...(current.files || []), ...uploaded] })); }
  };
  const removeFile = file => { setForm({ ...form, files: form.files.filter(f => f !== file) }); deleteClassroomAttachment(file.path || file.dataKey)?.catch?.(() => {}); };
  return <div className="kdp-modal-bg" role="dialog" aria-modal="true" aria-label={assignMode ? "일정 보내기" : "내 일정"} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="kdp-modal">
      <div className="hd"><b>{assignMode ? (isNew ? "선생님들에게 일정 보내기" : "보낸 일정 고치기") : isNew ? "일정 추가" : "일정 고치기"}</b><button type="button" data-kdn-bare className={`star${form.important ? " on" : ""}`} aria-pressed={!!form.important} title="중요 표시" onClick={() => setForm({ ...form, important: !form.important })}><Star size={16} fill={form.important ? "currentColor" : "none"} /></button><button type="button" data-kdn-bare aria-label="닫기" onClick={onClose}><X size={16} /></button></div>
      <div className="scroll">
        <label>제목<input autoFocus value={form.title} maxLength={80} placeholder={assignMode ? "예: 2학년 협의회 자료 제출" : "예: 학년 협의회, 생기부 마감"} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
        <div className="row"><label>날짜(마감일)<input type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></label><label>시간(선택)<input type="time" value={form.time} onChange={event => setForm({ ...form, time: event.target.value })} /></label></div>
        {assignMode && <label>받는 선생님<RecipientPicker recipients={recipients} value={form.to || []} onChange={to => setForm({ ...form, to })} /></label>}
        {!assignMode && <div className="row"><label>반복<select value={form.repeat || "none"} onChange={event => setForm({ ...form, repeat: event.target.value })}>{REPEAT_OPTIONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>{form.repeat && form.repeat !== "none" ? <label>반복 끝(선택)<input type="date" value={form.repeatUntil || ""} min={form.date} onChange={event => setForm({ ...form, repeatUntil: event.target.value })} /></label> : <span />}</div>}
        <label>미리 알림<div className="seg">{REMIND_OPTIONS.map(([value, text]) => <button key={value} type="button" data-kdn-bare aria-pressed={Number(form.remind) === value} onClick={() => setForm({ ...form, remind: value })}>{text}</button>)}</div><small className="hint">마감 2일 전·1일 전에는 팝업으로, 당일에는 [오늘 할 일] 창으로도 알려 드려요.</small></label>
        {!assignMode && <label>색<div className="colors">{PLANNER_COLORS.map(color => <button key={color} type="button" data-kdn-bare aria-label={color} aria-pressed={form.color === color} style={{ "--c": COLOR_HEX[color] }} onClick={() => setForm({ ...form, color })} />)}</div></label>}
        <label>링크<div className="links">{(form.links || []).map((link, index) => <span key={index} className="chip"><Link2 size={12} />{link.url}<button type="button" data-kdn-bare aria-label="링크 빼기" onClick={() => setForm({ ...form, links: form.links.filter((_, i) => i !== index) })}><X size={12} /></button></span>)}
          {(form.links || []).length < 8 && <span className="add"><input value={linkDraft} placeholder="https:// 구글 드라이브·공문·설문 주소" onChange={event => setLinkDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addLink(); } }} /><button type="button" data-kdn-bare onClick={addLink} disabled={!linkDraft.trim()}>추가</button></span>}</div></label>
        <label>파일 첨부<div className="files">{(form.files || []).map(file => <span key={file.dataKey || file.url || file.fileName} className="chip"><Paperclip size={12} />{file.fileName}<button type="button" data-kdn-bare aria-label="파일 빼기" onClick={() => removeFile(file)}><X size={12} /></button></span>)}
          {(form.files || []).length < 5 && <label className="pick">{uploading ? <Loader2 size={13} className="spin" /> : <Paperclip size={13} />}{uploading ? "올리는 중…" : "파일 고르기"}<input hidden type="file" multiple disabled={uploading} accept=".pdf,.hwp,.hwpx,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,image/*" onChange={event => { addFiles(event.target.files); event.target.value = ""; }} /></label>}
          <small className="hint">개별 30MB 이하 · 최대 5개{fileError ? ` · ${fileError}` : ""}</small></div></label>
        <label>메모(선택)<textarea rows={3} value={form.memo} maxLength={500} onChange={event => setForm({ ...form, memo: event.target.value })} /></label>
      </div>
      <div className="ft">{!isNew && <button type="button" className="kdp-btn del" onClick={onDelete}><Trash2 size={14} />{assignMode ? "보낸 일정 취소" : "지우기"}</button>}<span className="sp" /><button type="button" className="kdp-btn" onClick={onClose}>취소</button><button type="button" className="kdp-btn pri" disabled={busy || uploading || !String(form.title).trim() || !form.date || (assignMode && !(form.to || []).length)} onClick={onSave}>{busy ? <Loader2 size={14} className="spin" /> : assignMode ? <Send size={14} /> : null}{assignMode ? `${(form.to || []).length}명에게 보내기` : "저장"}</button></div>
    </div>
  </div>;
}

// 선생님 ZONE 홈 맨 위: 알릴 일정이 있을 때 띠로 보여 줍니다.
export function PlannerHomeStrip({ owner, onOpen }) {
  const { all } = usePlannerData(owner);
  const alerts = React.useMemo(() => plannerAlerts(all || []), [all]);
  if (!owner || !all) return null;
  return <section className="kdp-strip" aria-label="내 일정 알림">
    <style dangerouslySetInnerHTML={{ __html: CSS }} />
    <span className="ic" aria-hidden="true">{alerts.length ? <BellRing size={20} /> : <CalendarDays size={20} />}</span>
    <div className="tx">
      <b>{alerts.length ? `내 일정 알림 ${alerts.length}건` : "내 일정"}</b>
      {alerts.length ? <span className="list">{alerts.slice(0, 4).map(item => <em key={item.occKey} className={item.overdue ? "late" : item.diff === 0 ? "today" : ""}><i>{dLabel(item.diff)}</i>{item.time ? `${item.time} ` : ""}{item.title}</em>)}{alerts.length > 4 && <em>외 {alerts.length - 4}건</em>}</span>
        : <small>회의·제출 마감 같은 내 일정을 적어 두면, 마감 2일 전엔 팝업으로, 당일엔 [오늘 할 일] 창으로 알려 드려요.</small>}
    </div>
    <button type="button" data-kdn-bare onClick={onOpen}>{alerts.length ? "확인하기" : "일정 적기"}</button>
  </section>;
}

// 사이트 어디서나: 마감 2일·1일 전 팝업(하루 한 번) + 오른쪽 아래 접히는 [오늘 할 일] 창
export function PlannerReminders({ owner, onOpen }) {
  const { all, toggleDone } = usePlannerData(owner);
  const today = dateKey(new Date());
  const seenKey = `kd_planner_popup_${owner}_${today}`;
  const [seen, setSeen] = React.useState(() => { try { return JSON.parse(localStorage.getItem(seenKey) || "[]"); } catch { return []; } });
  const [open, setOpen] = React.useState(() => { try { return localStorage.getItem("kd_planner_dock_open") !== "0"; } catch { return true; } });
  const popups = React.useMemo(() => popupItems(all || []).filter(item => !seen.includes(item.occKey)), [all, seen]);
  const todays = React.useMemo(() => todayItems(all || []), [all]);
  React.useEffect(() => { // 브라우저 알림(허용한 경우): 하루 한 번
    try {
      if (!all || typeof Notification === "undefined" || Notification.permission !== "granted") return;
      const key = `kd_planner_notified_${owner}`;
      const pending = todays.filter(item => !item.done);
      if (!pending.length || localStorage.getItem(key) === today) return;
      localStorage.setItem(key, today);
      new Notification("KDTIME 오늘 할 일", { body: `${pending[0].title}${pending.length > 1 ? ` 외 ${pending.length - 1}건` : ""}`, tag: "kd-planner" });
    } catch { /* 화면 창으로도 보입니다 */ }
  }, [all, owner, today, todays]);
  if (!owner || !all) return null;
  const closePopup = () => { const next = [...seen, ...popups.map(item => item.occKey)]; setSeen(next); try { localStorage.setItem(seenKey, JSON.stringify(next)); } catch { /* ignore */ } };
  const toggleDock = () => setOpen(value => { try { localStorage.setItem("kd_planner_dock_open", value ? "0" : "1"); } catch { /* ignore */ } return !value; });
  const pending = todays.filter(item => !item.done).length;
  return <>
    <style dangerouslySetInnerHTML={{ __html: CSS }} />
    {popups.length > 0 && <div className="kdp-modal-bg" role="dialog" aria-modal="true" aria-label="마감이 다가오는 일정">
      <div className="kdp-modal kdp-pop">
        <div className="hd"><span className="bell"><BellRing size={20} /></span><b>마감이 다가와요</b><button type="button" data-kdn-bare aria-label="닫기" onClick={closePopup}><X size={16} /></button></div>
        <p className="sub">마감 2일 안에 있는 일정이에요. 끝냈으면 체크해 주세요.</p>
        <div className="kdp-list">{popups.map(item => <ItemRow key={item.occKey} item={item} onToggle={toggleDone} />)}</div>
        <div className="ft"><span className="sp" /><button type="button" className="kdp-btn" onClick={() => { closePopup(); onOpen?.(); }}>내 일정 열기</button><button type="button" className="kdp-btn pri" onClick={closePopup}>확인했어요</button></div>
      </div>
    </div>}
    {todays.length > 0 && <aside className={`kdp-dock${open ? " is-open" : ""}`} aria-label="오늘 할 일">
      <button type="button" data-kdn-bare className="kdp-dock-hd" aria-expanded={open} onClick={toggleDock}><CalendarDays size={16} /><b>오늘 할 일</b><em className={pending ? "" : "ok"}>{pending ? `${pending}건 남음` : "모두 끝냄"}</em><span className="sp" />{open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</button>
      {open && <div className="kdp-dock-body">
        <div className="kdp-list">{todays.map(item => <ItemRow key={item.occKey} item={item} compact onToggle={toggleDone} showDate={item.overdue} />)}</div>
        {onOpen && <button type="button" data-kdn-bare className="kdp-dock-go" onClick={onOpen}>내 일정 전체 보기 →</button>}
      </div>}
    </aside>}
  </>;
}

export default function TeacherPlanner({ owner, ownerName = "", calendar, showToast, canAssign = false, recipients = [], initialDraft = null }) {
  const { items, assigns, received, all, savePersonal, saveShared, toggleDone } = usePlannerData(owner);
  const now = new Date();
  const todayKey = dateKey(now);
  const [cursor, setCursor] = React.useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));
  const [selected, setSelected] = React.useState(todayKey);
  const [view, setView] = React.useState(() => { try { return localStorage.getItem("kd_planner_view") || "month"; } catch { return "month"; } });
  const [form, setForm] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [perm, setPerm] = React.useState(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));
  const school = React.useMemo(() => schoolEventsByDate(calendar), [calendar]);
  const cells = monthCells(cursor.y, cursor.m);
  const occ = React.useMemo(() => expandOccurrences(all || [], cells[0].key, cells[41].key), [all, cells[0].key]); // eslint-disable-line react-hooks/exhaustive-deps
  const byDate = React.useMemo(() => occ.reduce((map, item) => { (map[item.date] = map[item.date] || []).push(item); return map; }, {}), [occ]);
  const agenda = React.useMemo(() => expandOccurrences(all || [], shiftKey(todayKey, -14), shiftKey(todayKey, 60)).filter(item => item.date >= todayKey || (!item.done && item.repeat === "none")).map(item => ({ ...item, diff: dayNo(item.date) - dayNo(todayKey) })), [all, todayKey]);
  const sent = React.useMemo(() => assigns.filter(item => item.from.owner === owner).sort((a, b) => b.date.localeCompare(a.date)), [assigns, owner]);
  const nameOf = React.useMemo(() => Object.fromEntries(recipients.map(r => [r.owner, r.name])), [recipients]);
  const switchView = value => { setView(value); try { localStorage.setItem("kd_planner_view", value); } catch { /* ignore */ } };

  // Ctrl+K에서 "11/5 협의회"처럼 적어 들어오면 그 내용으로 추가 창을 바로 엽니다.
  React.useEffect(() => { if (initialDraft?.nonce) { const d = initialDraft; setForm({ date: d.date || todayKey, time: d.time || "", title: d.title || "", memo: "", remind: 1, color: "orange", repeat: "none", links: [], files: [], important: false }); if (d.date) setSelected(d.date); } }, [initialDraft?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const newItem = (date, assign = false) => setForm({ date: date || selected, time: "", title: "", memo: "", remind: 1, color: "orange", repeat: "none", links: [], files: [], important: false, ...(assign ? { assign: true, to: [] } : {}) });
  const editItem = item => {
    if (item.shared) { if (item.from.owner === owner) setForm({ ...assigns.find(a => a.id === item.id), assign: true }); return; }
    const base = (items || []).find(entry => entry.id === item.id);
    if (base) setForm({ ...base });
  };
  const isNew = form && !(form.assign ? assigns.some(a => a.id === form.id) : (items || []).some(entry => entry.id === form.id));
  const save = async () => {
    setBusy(true);
    let ok;
    if (form.assign) {
      const entry = normalizeAssign({ ...form, from: form.from?.owner ? form.from : { owner, name: ownerName }, toLabel: `${(form.to || []).length}명` });
      ok = await saveShared(list => [...list.filter(a => a.id !== entry.id), { ...entry, doneBy: assigns.find(a => a.id === entry.id)?.doneBy || {} }]);
    } else {
      const entry = normalizeItem(form);
      ok = await savePersonal(list => [...list.filter(e => e.id !== entry.id), entry], ownerName);
    }
    setBusy(false);
    if (!ok) { showToast?.("저장하지 못했어요. 다시 시도해 주세요.", "error"); return; }
    showToast?.(form.assign ? `${(form.to || []).length}명에게 일정을 보냈어요.` : "내 일정을 저장했어요.", "success");
    setSelected(form.date); setForm(null);
  };
  const remove = async () => {
    // 내 일정: 바로 지우고 알림의 '되돌리기'로 살립니다. 보낸 일정은 받은 사람 달력에서도 사라지니 한 번 묻습니다.
    if (form.assign && !window.confirm("보낸 일정을 취소할까요? 받은 선생님 달력에서도 사라져요.")) return;
    setBusy(true);
    const removed = form.assign ? null : (items || []).find(e => e.id === form.id);
    const ok = form.assign ? await saveShared(list => list.filter(a => a.id !== form.id)) : await savePersonal(list => list.filter(e => e.id !== form.id));
    setBusy(false);
    if (!ok) return;
    if (form.assign) (form.files || []).forEach(file => deleteClassroomAttachment(file.path || file.dataKey)?.catch?.(() => {}));
    setForm(null);
    showToast?.(form.assign ? "보낸 일정을 취소했어요." : `'${form.title}' 일정을 지웠어요.`, "success", removed ? { label: "되돌리기", onClick: () => savePersonal(list => [...list.filter(e => e.id !== removed.id), removed]) } : null);
  };
  const exportIcs = () => {
    const blob = new Blob([plannerIcs([...(items || []), ...received], `KDTIME ${ownerName || "내"} 일정`)], { type: "text/calendar;charset=utf-8" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob); anchor.download = "KDTIME_내일정.ics";
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(anchor.href), 2000);
  };
  const askPermission = async () => { try { setPerm(await Notification.requestPermission()); } catch { setPerm("denied"); } };
  const move = delta => setCursor(({ y, m }) => { const d = new Date(y, m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const goDate = key => { setSelected(key); setCursor({ y: Number(key.slice(0, 4)), m: Number(key.slice(5, 7)) - 1 }); };
  const dayItems = byDate[selected] || [];
  const daySchool = school[selected] || [];
  const selDate = new Date(`${selected}T00:00:00`);
  const stats = { today: agenda.filter(i => i.diff === 0 && !i.done).length, week: agenda.filter(i => i.diff >= 0 && i.diff <= 7 && !i.done).length, late: agenda.filter(i => i.diff < 0 && !i.done).length, recv: received.filter(i => !i.done).length };

  if (!owner) return <div className="kdp"><style dangerouslySetInnerHTML={{ __html: CSS }} /><div className="kdp-empty">선생님 계정으로 로그인하면 내 일정을 쓸 수 있어요.</div></div>;
  // 목록 보기: 날짜별로 묶기
  const agendaGroups = agenda.reduce((list, item) => { const last = list[list.length - 1]; if (last && last[0] === item.date) last[1].push(item); else list.push([item.date, [item]]); return list; }, []);
  return <div className="kdp">
    <style dangerouslySetInnerHTML={{ __html: CSS }} />
    <section className="kdp-head">
      <div className="t"><b>내 일정</b><small>학사일정 위에 나만의 일정을 적고, 링크·파일도 붙여 두세요. 다른 선생님 화면에는 나오지 않아요(학생 개인정보는 적지 마세요){canAssign ? " · '일정 보내기'로 고른 선생님들 달력에 일정을 넣을 수 있어요" : ""}.</small></div>
      <div className="acts">
        {perm === "default" && <button type="button" className="kdp-btn" onClick={askPermission}><Bell size={15} />브라우저 알림 켜기</button>}
        {perm === "granted" && <span className="kdp-perm"><BellRing size={14} />브라우저 알림 켜짐</span>}
        <button type="button" className="kdp-btn" onClick={exportIcs} title="휴대폰·구글·아웃룩 캘린더로 가져갈 수 있는 .ics 파일"><Download size={15} />캘린더 파일(.ics)</button>
        {canAssign && <button type="button" className="kdp-btn" onClick={() => newItem(selected, true)}><Send size={15} />일정 보내기</button>}
        <button type="button" className="kdp-btn pri" onClick={() => newItem()}><Plus size={15} />일정 추가</button>
      </div>
    </section>
    <section className="kdp-stats">
      <div className={stats.today ? "hot" : ""}><small>오늘 할 일</small><b>{stats.today}</b></div>
      <div><small>7일 안 마감</small><b>{stats.week}</b></div>
      <div className={stats.late ? "late" : ""}><small>지났는데 안 끝냄</small><b>{stats.late}</b></div>
      <div className={stats.recv ? "recv" : ""}><small>받은 일정(남음)</small><b>{stats.recv}</b></div>
    </section>
    <div className="kdp-views" role="tablist" aria-label="보기"><button type="button" data-kdn-bare role="tab" aria-selected={view === "month"} onClick={() => switchView("month")}><CalendarDays size={15} />달력</button><button type="button" data-kdn-bare role="tab" aria-selected={view === "list"} onClick={() => switchView("list")}><List size={15} />할 일 목록</button>{canAssign && <button type="button" data-kdn-bare role="tab" aria-selected={view === "sent"} onClick={() => switchView("sent")}><Send size={15} />보낸 일정 {sent.length > 0 && <small>{sent.length}</small>}</button>}</div>

    {all == null ? <div className="kdp-empty"><Loader2 size={16} className="spin" /> 불러오는 중…</div> : view === "list" ? <section className="kdp-agenda">
      {agendaGroups.length ? agendaGroups.map(([date, list]) => { const d = new Date(`${date}T00:00:00`); const diff = dayNo(date) - dayNo(todayKey); return <div key={date} className={`grp${diff < 0 ? " late" : diff === 0 ? " today" : ""}`}>
        <div className="gh"><b>{d.getMonth() + 1}월 {d.getDate()}일 ({WEEK[d.getDay()]})</b><em>{dLabel(diff)}</em>{(school[date] || []).map((label, i) => <span key={i} className="sch">{label}</span>)}</div>
        <div className="kdp-list">{list.map(item => <ItemRow key={item.occKey} item={item} onToggle={toggleDone} onOpen={editItem} />)}</div>
      </div>; }) : <div className="kdp-empty">앞으로 60일 안에 일정이 없어요. ‘일정 추가’로 적어 보세요.</div>}
    </section> : view === "sent" && canAssign ? <section className="kdp-agenda">
      {sent.length ? sent.map(item => { const doneCount = item.to.filter(o => item.doneBy[o]).length; return <div key={item.id} className="kdp-sent">
        <div className="top"><b>{item.title}</b><em>{item.date.slice(5).replace("-", "/")}{item.time ? ` ${item.time}` : ""} · {dLabel(dayNo(item.date) - dayNo(todayKey))}</em><span className="sp" /><button type="button" className="kdp-btn sm" onClick={() => setForm({ ...item, assign: true })}>고치기</button></div>
        <div className="prog"><span><i style={{ width: `${item.to.length ? (doneCount / item.to.length) * 100 : 0}%` }} /></span><small>끝냄 {doneCount}/{item.to.length}명</small></div>
        <div className="who">{item.to.map(o => <em key={o} className={item.doneBy[o] ? "ok" : ""}>{item.doneBy[o] && <Check size={11} strokeWidth={3} />}{nameOf[o] || o.replace(/^\w+\./, "")}</em>)}</div>
      </div>; }) : <div className="kdp-empty"><Users size={16} /> 아직 보낸 일정이 없어요. ‘일정 보내기’로 협의회·제출 마감을 선생님들 달력에 넣어 보세요.</div>}
    </section> : <div className="kdp-main">
      <section className="kdp-cal">
        <div className="kdp-cal-hd"><button type="button" data-kdn-bare aria-label="이전 달" onClick={() => move(-1)}><ChevronLeft size={18} /></button><b>{cursor.y}년 {cursor.m + 1}월</b><button type="button" data-kdn-bare aria-label="다음 달" onClick={() => move(1)}><ChevronRight size={18} /></button><button type="button" data-kdn-bare className="today" onClick={() => goDate(todayKey)}>오늘</button></div>
        <div className="kdp-grid">{WEEK.map((w, i) => <span key={w} className={`wd w${i}`}>{w}</span>)}
          {cells.map(cell => { const mine = byDate[cell.key] || []; const sch = school[cell.key] || []; const left = mine.filter(i => !i.done).length; return <button key={cell.key} type="button" data-kdn-bare className={`cell w${cell.weekday}${cell.inMonth ? "" : " out"}${cell.key === todayKey ? " is-today" : ""}${cell.key === selected ? " is-sel" : ""}`} onClick={() => setSelected(cell.key)} onDoubleClick={() => newItem(cell.key)}>
            <span className="d">{cell.day}{mine.length > 0 && left === 0 && <Check size={12} strokeWidth={3} className="alldone" />}</span>
            {sch.slice(0, 1).map((label, i) => <span key={i} className="sch">{label}</span>)}
            {mine.slice(0, 2).map(item => <span key={item.occKey} className={`me${item.done ? " done" : ""}`} style={{ "--c": colorOf(item) }}>{item.done ? "✓ " : item.important ? "★ " : ""}{item.title}</span>)}
            {(mine.length > 2 || sch.length > 1) && <span className="more">+{Math.max(0, mine.length - 2) + Math.max(0, sch.length - 1)}</span>}
          </button>; })}
        </div>
        <p className="kdp-legend"><span className="sch">학사일정</span><span className="me" style={{ "--c": COLOR_HEX.orange }}>내 일정</span><span className="me" style={{ "--c": SHARED_COLOR }}>받은 일정</span><span className="me done" style={{ "--c": COLOR_HEX.green }}>✓ 끝냄</span><small>날짜를 두 번 누르면 바로 추가</small></p>
      </section>
      <section className="kdp-day">
        <div className="kdp-day-hd"><b>{selDate.getMonth() + 1}월 {selDate.getDate()}일 {WEEK[selDate.getDay()]}요일</b>{selected === todayKey && <em>오늘</em>}<span className="sp" /><button type="button" className="kdp-btn sm" onClick={() => newItem(selected)}><Plus size={14} />이 날 추가</button></div>
        {daySchool.length > 0 && <div className="kdp-school">{daySchool.map((label, i) => <span key={i}><CalendarDays size={13} />{label}</span>)}</div>}
        {dayItems.length ? <div className="kdp-list">{dayItems.map(item => <div key={item.occKey} className="kdp-day-item"><ItemRow item={item} onToggle={toggleDone} onOpen={editItem} /><a className="gcal" href={googleCalendarUrl(item)} target="_blank" rel="noopener noreferrer" title="구글 캘린더에 추가"><ExternalLink size={12} />구글 캘린더</a></div>)}</div> : <div className="kdp-empty">이 날 일정이 없어요.</div>}
      </section>
    </div>}
    {form && <ItemForm form={form} setForm={setForm} isNew={isNew} assignMode={!!form.assign} recipients={recipients} owner={owner} ownerName={ownerName} busy={busy} onSave={save} onDelete={remove} onClose={() => setForm(null)} />}
  </div>;
}

const CSS = `
.kdp{display:grid;gap:14px;color:var(--kdn-ink,#1f2937)}
.kdp-head{display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px;padding:16px 18px;border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff)}
.kdp-head .t{display:grid;gap:3px;flex:1 1 280px}.kdp-head .t b{font-size:19px;font-weight:800}.kdp-head .t small{font-size:13.5px;line-height:1.5;color:var(--kdn-muted,#64748b)}
.kdp-head .acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.kdp-btn{display:inline-flex;align-items:center;gap:6px;min-height:38px;padding:0 14px;border-radius:10px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#1f2937);font:inherit;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap}
.kdp-btn.pri{background:var(--kdn-accent,#ea580c);border-color:var(--kdn-accent,#ea580c);color:#fff}.kdp-btn.sm{min-height:32px;padding:0 10px;font-size:13px}.kdp-btn.del{color:#b91c1c}.kdp-btn:disabled{opacity:.5;cursor:default}
.kdp-perm{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:99px;background:color-mix(in srgb,#16a34a 13%,transparent);color:#15803d;font-size:12.5px;font-weight:800}
.kdp-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.kdp-stats div{display:grid;gap:2px;padding:12px 16px;border-radius:14px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff);border-left:4px solid var(--kdn-line,#cbd5e1)}
.kdp-stats small{font-size:12.5px;font-weight:800;color:var(--kdn-muted,#64748b)}.kdp-stats b{font-size:24px;font-weight:850;line-height:1.1}
.kdp-stats .hot{border-left-color:#ea580c}.kdp-stats .hot b{color:#ea580c}.kdp-stats .late{border-left-color:#dc2626}.kdp-stats .late b{color:#dc2626}.kdp-stats .recv{border-left-color:#7c3aed}.kdp-stats .recv b{color:#7c3aed}
.kdp-views{display:inline-flex;gap:4px;padding:4px;border-radius:12px;background:var(--kdn-surface-2,#f1f5f9);border:1px solid var(--kdn-line,#e2e8f0);justify-self:start}
.kdp-views button{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 14px;border:0;border-radius:9px;background:transparent;font:inherit;font-size:14px;font-weight:700;color:var(--kdn-muted,#64748b);cursor:pointer}
.kdp-views button[aria-selected="true"]{background:var(--kdn-surface,#fff);color:var(--kdn-ink,#111827);box-shadow:0 1px 4px rgba(15,23,42,.14)}.kdp-views small{padding:0 7px;border-radius:99px;background:var(--kdn-surface-2,#e2e8f0);font-size:12px}
.kdp-main{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,1fr);gap:14px;align-items:start}
.kdp-cal,.kdp-day,.kdp-agenda{display:grid;gap:10px;padding:16px;border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff);min-width:0}
.kdp-cal-hd{display:flex;align-items:center;gap:8px}.kdp-cal-hd b{font-size:17px;font-weight:850;min-width:110px;text-align:center}
.kdp-cal-hd button{display:grid;place-items:center;min-width:34px;height:34px;border-radius:9px;border:1px solid var(--kdn-line,#d5dbe3);background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:13px;font-weight:800}.kdp-cal-hd .today{margin-left:auto;padding:0 12px}
.kdp-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.kdp-grid .wd{text-align:center;font-size:12.5px;font-weight:800;color:var(--kdn-muted,#64748b);padding:2px 0}.kdp-grid .w0{color:#dc2626}.kdp-grid .w6{color:#2563eb}
.kdp-grid .cell{display:flex;flex-direction:column;align-items:stretch;gap:2px;min-height:88px;padding:5px;border-radius:10px;border:1.5px solid transparent;background:var(--kdn-surface-2,#f8fafc);font:inherit;color:inherit;text-align:left;cursor:pointer;min-width:0;overflow:hidden}
.kdp-grid .cell:hover{border-color:var(--kdn-line,#cbd5e1)}.kdp-grid .cell.out{opacity:.42}
.kdp-grid .cell .d{display:flex;align-items:center;gap:3px;font-size:13px;font-weight:800}.kdp-grid .cell.w0 .d{color:#dc2626}.kdp-grid .cell.w6 .d{color:#2563eb}.kdp-grid .alldone{color:#16a34a}
.kdp-grid .cell.is-today .d::before{content:"";display:none}
.kdp-grid .cell.is-today{box-shadow:inset 0 3px 0 var(--kdn-accent,#ea580c)}.kdp-grid .cell.is-today .d{color:var(--kdn-accent,#ea580c)}
.kdp-grid .cell.is-sel{border-color:var(--kdn-accent,#ea580c);background:color-mix(in srgb,var(--kdn-accent,#ea580c) 8%,var(--kdn-surface,#fff))}
.kdp .sch,.kdp .me{display:block;padding:1px 6px;border-radius:5px;font-size:11.5px;font-weight:700;line-height:1.45;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kdp .sch{background:color-mix(in srgb,#64748b 14%,transparent);color:var(--kdn-ink-soft,#334155)}
.kdp .me{background:color-mix(in srgb,var(--c) 16%,transparent);color:var(--c);border-left:3px solid var(--c)}.kdp .me.done{text-decoration:line-through;opacity:.6}
.kdp-grid .more{font-size:11px;font-weight:800;color:var(--kdn-muted,#64748b)}
.kdp-legend{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0}.kdp-legend small{font-size:12px;color:var(--kdn-muted,#64748b)}
.kdp-day-hd{display:flex;align-items:center;gap:8px}.kdp-day-hd b{font-size:16px;font-weight:850}.kdp-day-hd em{font-style:normal;padding:2px 8px;border-radius:99px;background:var(--kdn-accent,#ea580c);color:#fff;font-size:12px;font-weight:800}.kdp-day-hd .sp{flex:1}
.kdp-school{display:flex;flex-wrap:wrap;gap:6px}.kdp-school span{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:99px;background:var(--kdn-surface-2,#f1f5f9);font-size:12.5px;font-weight:700}
.kdp-list{display:grid;gap:8px}
.kdp-day-item{display:grid;gap:4px}.kdp-day-item .gcal{justify-self:end;display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;color:var(--kdn-muted,#64748b);text-decoration:none}
.kdp-item{display:grid;grid-template-columns:26px minmax(0,1fr);gap:10px;align-items:start;padding:11px 13px;border-radius:12px;border:1px solid var(--kdn-line,#e2e8f0);border-left:4px solid var(--c);background:var(--kdn-surface,#fff)}
.kdp-item.compact{padding:8px 10px;gap:8px}
.kdp-item .chk{display:grid;place-items:center;width:24px;height:24px;margin-top:1px;border-radius:7px;border:2px solid var(--c);background:transparent;color:#fff;cursor:pointer}.kdp-item .chk[aria-pressed="true"]{background:var(--c)}
.kdp-item .body{display:grid;gap:4px;min-width:0}
.kdp-item b{display:flex;flex-wrap:wrap;align-items:center;gap:5px;font-size:14.5px;font-weight:800;line-height:1.4}.kdp-item b.click{cursor:pointer}.kdp-item b.click:hover{text-decoration:underline}
.kdp-item .star{color:#f59e0b}.kdp-item time{color:var(--c)}.kdp-item .when{padding:0 6px;border-radius:5px;background:var(--kdn-surface-2,#f1f5f9);font-size:12px;color:var(--kdn-muted,#64748b)}
.kdp-item .tags{display:flex;flex-wrap:wrap;gap:5px}.kdp-item .tags em{display:inline-flex;align-items:center;gap:3px;padding:1px 8px;border-radius:99px;background:var(--kdn-surface-2,#f1f5f9);font-style:normal;font-size:11.5px;font-weight:800;color:var(--kdn-muted,#64748b)}
.kdp-item .tags em.today{background:#ea580c;color:#fff}.kdp-item .tags em.late{background:color-mix(in srgb,#dc2626 14%,transparent);color:#b91c1c}.kdp-item .tags em.from{background:color-mix(in srgb,#7c3aed 13%,transparent);color:#6d28d9}
.kdp-item p{margin:0;font-size:13px;white-space:pre-wrap;color:var(--kdn-ink-soft,#334155)}
.kdp-item .atts{display:flex;flex-wrap:wrap;gap:5px}.kdp-item .atts a,.kdp-item .atts button{display:inline-flex;align-items:center;gap:4px;max-width:100%;padding:3px 9px;border-radius:8px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface-2,#f8fafc);color:var(--kdn-ink,#1f2937);font:inherit;font-size:12.5px;font-weight:700;text-decoration:none;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kdp-item.done b{text-decoration:line-through;color:var(--kdn-muted,#64748b)}.kdp-item.done{opacity:.75}
.kdp-agenda .grp{display:grid;gap:8px;padding-bottom:12px;border-bottom:1px solid var(--kdn-line,#e2e8f0)}.kdp-agenda .grp:last-child{border-bottom:0;padding-bottom:0}
.kdp-agenda .gh{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.kdp-agenda .gh b{font-size:15px;font-weight:850}.kdp-agenda .gh em{font-style:normal;padding:1px 9px;border-radius:99px;background:color-mix(in srgb,#2563eb 13%,transparent);color:#1d4ed8;font-size:12px;font-weight:800}
.kdp-agenda .grp.today .gh em{background:#ea580c;color:#fff}.kdp-agenda .grp.late .gh em{background:color-mix(in srgb,#dc2626 14%,transparent);color:#b91c1c}
.kdp-sent{display:grid;gap:8px;padding:14px 16px;border-radius:14px;border:1px solid var(--kdn-line,#e2e8f0);border-left:4px solid #7c3aed}
.kdp-sent .top{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.kdp-sent .top b{font-size:15px;font-weight:850}.kdp-sent .top em{font-style:normal;font-size:12.5px;color:var(--kdn-muted,#64748b)}.kdp-sent .sp{flex:1}
.kdp-sent .prog{display:flex;align-items:center;gap:10px}.kdp-sent .prog span{flex:1;height:8px;border-radius:99px;background:var(--kdn-surface-2,#eef2f7);overflow:hidden}.kdp-sent .prog i{display:block;height:100%;background:#16a34a;border-radius:99px}.kdp-sent .prog small{font-size:12.5px;font-weight:800}
.kdp-sent .who{display:flex;flex-wrap:wrap;gap:5px}.kdp-sent .who em{display:inline-flex;align-items:center;gap:3px;padding:2px 9px;border-radius:99px;background:var(--kdn-surface-2,#f1f5f9);font-style:normal;font-size:12.5px;font-weight:700;color:var(--kdn-muted,#64748b)}.kdp-sent .who em.ok{background:color-mix(in srgb,#16a34a 14%,transparent);color:#15803d}
.kdp-empty{display:flex;align-items:center;justify-content:center;gap:6px;padding:22px;text-align:center;font-size:13.5px;color:var(--kdn-muted,#64748b)}
.kdp-modal-bg{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:16px;background:rgba(15,23,42,.45)}
.kdp-modal{width:min(500px,100%);max-height:calc(100vh - 32px);display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:12px;padding:20px;border-radius:18px;background:var(--kdn-surface,#fff);color:var(--kdn-ink,#1f2937);box-shadow:0 24px 60px rgba(15,23,42,.3);font-family:inherit}
.kdp-modal .scroll{display:grid;gap:12px;overflow:auto;padding-right:2px}
.kdp-modal .hd{display:flex;align-items:center;gap:6px}.kdp-modal .hd b{flex:1;font-size:17px;font-weight:850}.kdp-modal .hd button{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;border:1px solid var(--kdn-line,#d5dbe3);background:transparent;color:inherit;cursor:pointer}
.kdp-modal .hd .star.on{color:#f59e0b;border-color:#f59e0b}
.kdp-modal label{display:grid;gap:5px;font-size:13px;font-weight:800;color:var(--kdn-ink-soft,#334155)}
.kdp-modal input:not([type=checkbox]),.kdp-modal textarea,.kdp-modal select{min-height:38px;padding:7px 10px;border-radius:9px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#1f2937);font:inherit;font-size:14px;font-weight:500;box-sizing:border-box;width:100%}
.kdp-modal .row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.kdp-modal .hint{font-size:12px;font-weight:600;color:var(--kdn-muted,#64748b)}
.kdp-modal .seg{display:flex;flex-wrap:wrap;gap:5px}.kdp-modal .seg button{min-height:32px;padding:0 11px;border-radius:99px;border:1px solid var(--kdn-line,#d5dbe3);background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:700;cursor:pointer}.kdp-modal .seg button[aria-pressed="true"]{background:var(--kdn-accent,#ea580c);border-color:var(--kdn-accent,#ea580c);color:#fff}
.kdp-modal .colors{display:flex;gap:8px}.kdp-modal .colors button{width:28px;height:28px;border-radius:99px;border:3px solid transparent;background:var(--c);cursor:pointer}.kdp-modal .colors button[aria-pressed="true"]{border-color:var(--kdn-surface,#fff);box-shadow:0 0 0 2px var(--c)}
.kdp-modal .links,.kdp-modal .files{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-weight:600}
.kdp-modal .chip{display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:4px 6px 4px 10px;border-radius:99px;background:var(--kdn-surface-2,#f1f5f9);font-size:12.5px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.kdp-modal .chip button{display:grid;place-items:center;width:20px;height:20px;border:0;border-radius:99px;background:transparent;color:inherit;cursor:pointer}
.kdp-modal .add{display:flex;gap:6px;width:100%}.kdp-modal .add button{min-height:38px;padding:0 12px;border-radius:9px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface-2,#f8fafc);color:inherit;font:inherit;font-size:13px;font-weight:800;cursor:pointer}
.kdp-modal .pick{display:inline-flex;grid-auto-flow:column;align-items:center;gap:6px;min-height:36px;padding:0 12px;border-radius:9px;border:1px dashed var(--kdn-line,#cbd5e1);cursor:pointer;font-size:13px}
.kdp-modal .ft{display:flex;gap:8px;align-items:center}.kdp-modal .ft .sp{flex:1}
.kdp-recip{display:grid;gap:8px;padding:10px;border-radius:12px;background:var(--kdn-surface-2,#f8fafc);font-weight:600}
.kdp-recip .groups{display:flex;flex-wrap:wrap;gap:5px}.kdp-recip .groups button{min-height:30px;padding:0 10px;border-radius:99px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:inherit;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer}.kdp-recip .groups button[aria-pressed="true"]{background:#7c3aed;border-color:#7c3aed;color:#fff}.kdp-recip .groups small{opacity:.7}
.kdp-recip .names{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:4px;max-height:170px;overflow:auto}
.kdp-recip .names label{display:flex;align-items:center;gap:5px;padding:5px 8px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}.kdp-recip .names label.is-on{background:color-mix(in srgb,#7c3aed 12%,transparent)}.kdp-recip .names small{font-size:11px;color:var(--kdn-muted,#64748b);font-weight:600}.kdp-recip .none,.kdp-recip .cnt{font-size:12px;color:var(--kdn-muted,#64748b)}
.kdp-pop{width:min(460px,100%)}.kdp-pop .bell{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:color-mix(in srgb,#ea580c 14%,transparent);color:#ea580c}
.kdp-pop .sub{margin:0;font-size:13px;color:var(--kdn-muted,#64748b)}.kdp-pop .kdp-list{overflow:auto}
.kdp-dock{position:fixed;right:92px;bottom:22px;z-index:70;width:min(340px,calc(100vw - 24px));border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#1f2937);box-shadow:0 14px 40px rgba(15,23,42,.22);overflow:hidden}
.kdp-dock-hd{display:flex;align-items:center;gap:8px;width:100%;min-height:46px;padding:0 14px;border:0;background:linear-gradient(135deg,#ea580c,#f97316);color:#fff;font:inherit;cursor:pointer;text-align:left}
.kdp-dock-hd b{font-size:14.5px;font-weight:850}.kdp-dock-hd em{font-style:normal;padding:1px 8px;border-radius:99px;background:rgba(255,255,255,.22);font-size:12px;font-weight:800}.kdp-dock-hd em.ok{background:rgba(255,255,255,.35)}.kdp-dock-hd .sp{flex:1}
.kdp-dock-body{display:grid;gap:8px;padding:10px;max-height:min(360px,50vh);overflow:auto}
.kdp-dock-go{justify-self:end;border:0;background:none;font:inherit;font-size:13px;font-weight:800;color:var(--kdn-accent,#ea580c);cursor:pointer}
.kdp-strip{display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px;padding:14px 18px;border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff)}
.kdp-strip .ic{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;background:color-mix(in srgb,#2563eb 12%,transparent);color:#1d4ed8}
.kdp-strip .tx{display:grid;gap:5px;flex:1 1 260px;min-width:0}.kdp-strip .tx b{font-size:15.5px;font-weight:850}.kdp-strip .tx small{font-size:13px;color:var(--kdn-muted,#64748b)}
.kdp-strip .list{display:flex;flex-wrap:wrap;gap:6px}.kdp-strip .list em{display:inline-flex;align-items:center;gap:6px;padding:4px 10px 4px 4px;border-radius:99px;background:var(--kdn-surface-2,#f1f5f9);font-style:normal;font-size:13px;font-weight:700}
.kdp-strip .list em i{font-style:normal;padding:2px 8px;border-radius:99px;background:color-mix(in srgb,#2563eb 14%,transparent);color:#1d4ed8;font-size:12px;font-weight:900}
.kdp-strip .list em.today i{background:#ea580c;color:#fff}.kdp-strip .list em.late i{background:color-mix(in srgb,#dc2626 15%,transparent);color:#b91c1c}
.kdp-strip>button{min-height:40px;padding:0 16px;border-radius:11px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#1f2937);font:inherit;font-size:14px;font-weight:800;cursor:pointer}
[data-kd-ui="dark"] .kdp-strip .list em i,[data-kd-ui="dark"] .kdp-strip .ic,[data-kd-ui="dark"] .kdp-agenda .gh em{color:#93c5fd}[data-kd-ui="dark"] .kdp-item .tags em.from{color:#c4b5fd}
@media print{.kdp-dock{display:none!important}}
@media (max-width:900px){.kdp-main{grid-template-columns:minmax(0,1fr)}.kdp-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.kdp-grid .cell{min-height:58px}.kdp-grid .cell .sch,.kdp-grid .cell .me{font-size:10px;padding:0 3px}}
`;
