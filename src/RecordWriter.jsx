// 생기부 업무: 학급담임(자율·자치 / 진로 / 행발)과 교과담임(반·분반별 과세특, 수행평가 활동별 → 총합본).
// 저장은 학생·칸 하나씩 서버 기록에 합쳐 넣어(동시에 여러 선생님이 써도 서로 덮어쓰지 않게) 하고,
// 저장 전 글은 이 브라우저에도 바로 보관해 새로고침·끊김에도 남게 합니다. 서버는 덮어쓸 때 이전 본을 자동 백업합니다.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookOpen, Check, ChevronLeft, ChevronRight, ClipboardPaste, CloudOff, Copy, Download, Eye, EyeOff, FileSpreadsheet, FileText, HelpCircle, LayoutGrid, Loader2, PanelRightClose, PanelRightOpen, Paperclip, Plus, Printer, RotateCcw, Rows3, Save, Search, Table2, Trash2, Users, Wand2, X } from "lucide-react";
import { readStorage, updateStorage, uploadClassroomAttachment } from "./storage.js";
import { schoolYearOf } from "./curriculum.js";
import { booksForAssignment } from "./lessonStamps.js";
import { neisBytes, charCount, RECORD_AREAS, HOMEROOM_AREAS, mergeActivities, checkRecordText, issueSummary, autoFixRecordText, parsePastedRows, RECORD_GUIDE } from "./recordText.js";

const DRAFT_PREFIX = "kd_rec_pending_v1:";
const VIEW_KEY = "kd_rec_view_v1";
const SAVE_DELAY_MS = 1200;
const hrKey = (year, grade, cls) => `kd_rec_hr_v1:${year}:${grade}-${cls}`;
const sjKey = (year, bookId) => `kd_rec_sj_v1:${year}:${bookId}`;
const emptyDoc = () => ({ students: {}, activities: [] });
const nowIso = () => new Date().toISOString();
const uid = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function readDraft(key) { try { return JSON.parse(localStorage.getItem(DRAFT_PREFIX + key) || "{}") || {}; } catch { return {}; } }
function writeDraft(key, pending) {
  try {
    if (Object.keys(pending).length) localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(pending));
    else localStorage.removeItem(DRAFT_PREFIX + key);
  } catch { /* 저장 공간이 꽉 차도 서버 저장은 계속 */ }
}
// path: "s|학번|칸" (학급담임 칸 또는 교과 활동 id) · "acts" (활동 목록 전체)
function applyPending(doc, pending, by) {
  const next = { ...(doc || emptyDoc()), students: { ...(doc?.students || {}) } };
  Object.entries(pending).forEach(([path, entry]) => {
    // 활동 목록: 내 목록에 없는 서버 쪽 활동(다른 선생님이 방금 추가)은 뒤에 붙여 둡니다. 활동은 지우지 않고 숨기기만 해요.
    if (path === "acts" || path === "files") { const field = path === "acts" ? "activities" : "files"; const ids = new Set(entry.value.map(item => item.id)); next[field] = [...entry.value, ...(doc?.[field] || []).filter(item => !ids.has(item.id))]; return; }
    const [, sid, field] = path.split("|");
    const prev = next.students[sid] || {};
    next.students[sid] = { ...prev, [field]: { t: entry.value, at: entry.at, by } };
  });
  next.updatedAt = nowIso();
  return next;
}

// 문서 하나(반 하나 또는 분반 하나)를 읽고, 고친 칸만 모아 저장합니다.
function useRecordDoc(key, by) {
  const [doc, setDoc] = useState(null);
  const [pending, setPending] = useState({});
  const [status, setStatus] = useState("idle"); // idle | loading | saving | saved | error
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const pendingRef = useRef({});
  const timer = useRef(null);
  const savingRef = useRef(false);
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    let alive = true;
    const flushThisKey = saveRef.current; // 이 반(분반)을 떠날 때 남은 글은 이 반에 저장
    setDoc(null); setStatus(key ? "loading" : "idle"); setError("");
    const draft = key ? readDraft(key) : {};
    pendingRef.current = draft; setPending(draft);
    if (!key) return undefined;
    readStorage(key, emptyDoc()).then(value => {
      if (!alive) return;
      setDoc(value && typeof value === "object" ? value : emptyDoc());
      // 지난번에 저장하지 못한 글이 이 브라우저에 남아 있으면 되살려서 바로 저장합니다.
      if (Object.keys(draft).length) { setStatus("dirty"); setError(""); timer.current = window.setTimeout(() => saveRef.current?.(), 300); }
      else setStatus("idle");
    }).catch(err => { if (!alive) return; setStatus("error"); setError(`불러오지 못했어요. 새로고침해 주세요. (${err?.message || err})`); });
    return () => { alive = false; window.clearTimeout(timer.current); if (Object.keys(pendingRef.current).length) flushThisKey?.(); };
  }, [key]);

  const save = useCallback(async () => {
    if (!key || savingRef.current) return true;
    const snapshot = { ...pendingRef.current };
    if (!Object.keys(snapshot).length) return true;
    savingRef.current = true; setStatus("saving");
    const result = await updateStorage(key, emptyDoc(), current => applyPending(current, snapshot, by));
    savingRef.current = false;
    // 그사이 다른 반으로 옮겼으면: 이 반 브라우저 보관본만 정리하고 화면은 건드리지 않습니다.
    if (keyRef.current !== key) { if (result?.ok) { const rest = readDraft(key); Object.keys(snapshot).forEach(path => { if (rest[path]?.at === snapshot[path].at) delete rest[path]; }); writeDraft(key, rest); } return !!result?.ok; }
    if (!result?.ok) { setStatus("error"); setError(result?.error || "저장하지 못했어요."); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => save(), 10000); return false; }
    // 저장하는 동안 더 고친 칸은 그대로 남겨 둡니다.
    const left = {};
    Object.entries(pendingRef.current).forEach(([path, entry]) => { if (snapshot[path]?.at !== entry.at) left[path] = entry; });
    pendingRef.current = left; setPending(left); writeDraft(key, left);
    setDoc(result.value); setError(""); setSavedAt(nowIso());
    setStatus(Object.keys(left).length ? "saving" : "saved");
    if (Object.keys(left).length) { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => save(), SAVE_DELAY_MS); }
    return true;
  }, [key, by]);

  const saveRef = useRef(null);
  saveRef.current = save;
  const edit = useCallback((path, value) => {
    const next = { ...pendingRef.current, [path]: { value, at: nowIso() } };
    pendingRef.current = next; setPending(next); writeDraft(key, next);
    setStatus("dirty");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => save(), SAVE_DELAY_MS);
  }, [key, save]);

  const textOf = useCallback((sid, field) => {
    const path = `s|${sid}|${field}`;
    if (pending[path]) return pending[path].value;
    return doc?.students?.[sid]?.[field]?.t || "";
  }, [doc, pending]);
  const metaOf = useCallback((sid, field) => doc?.students?.[sid]?.[field] || null, [doc]);
  const activities = pending.acts ? pending.acts.value : (doc?.activities || []);
  const files = pending.files ? pending.files.value : (doc?.files || []);

  // 창을 닫기 전 저장 안 된 글이 있으면 묻습니다.
  useEffect(() => {
    const onLeave = event => { if (Object.keys(pendingRef.current).length) { save(); event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [save]);

  return { doc, loaded: doc != null, pending, status, error, savedAt, save, edit, textOf, metaOf, activities, files };
}

function SaveBadge({ rec }) {
  const count = Object.keys(rec.pending).length;
  if (rec.status === "loading") return <span className="krw-save is-load"><Loader2 size={14} className="spin" /> 불러오는 중</span>;
  if (rec.status === "saving") return <span className="krw-save is-busy"><Loader2 size={14} className="spin" /> 저장 중</span>;
  if (rec.status === "error") return <span className="krw-save is-err" title={rec.error}><CloudOff size={14} /> {count ? `저장 안 됨 ${count}칸` : "저장 확인 필요"}</span>;
  if (count) return <span className="krw-save is-dirty"><Save size={14} /> 곧 저장 ({count}칸)</span>;
  if (rec.savedAt) return <span className="krw-save is-ok"><Check size={14} /> 저장됨 {new Date(rec.savedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>;
  return <span className="krw-save is-ok"><Check size={14} /> 서버와 같음</span>;
}

function ByteMeter({ text, limit }) {
  const bytes = neisBytes(text);
  const over = bytes > limit;
  const pct = Math.min(100, Math.round((bytes / limit) * 100));
  return <span className={`krw-bytes${over ? " is-over" : pct >= 90 ? " is-near" : ""}`}>
    <i style={{ "--p": `${pct}%` }} />
    <b>{bytes.toLocaleString()}</b> / {limit.toLocaleString()} byte · {charCount(text)}자{over ? ` · ${(bytes - limit).toLocaleString()} 넘음` : ""}
  </span>;
}

function IssueList({ text }) {
  const issues = useMemo(() => checkRecordText(text), [text]);
  if (!issues.length) return text ? <p className="krw-ok"><Check size={13} /> 기재요령 점검 통과</p> : null;
  const merged = [];
  issues.forEach(item => { const found = merged.find(x => x.kind === item.kind && x.match === item.match); if (found) found.count += 1; else merged.push({ ...item, count: 1 }); });
  return <ul className="krw-issues">{merged.map((item, index) => <li key={index} className={item.level === "block" ? "is-block" : "is-warn"}>
    <b>{item.level === "block" ? "기재 불가" : "고치기 권장"}</b><span className="k">{item.kind}</span><code>{item.match}</code>{item.count > 1 && <em>×{item.count}</em>}<small>{item.fix}</small>
  </li>)}</ul>;
}
function IssueDot({ text }) {
  const s = issueSummary(checkRecordText(text));
  if (!s.total) return null;
  return <span className={`krw-dot ${s.block ? "is-block" : "is-warn"}`} title={`기재 불가 ${s.block} · 권장 ${s.warn}`}>{s.total}</span>;
}

// ── 인쇄·엑셀 ──────────────────────────────────────────────────────────────
const esc = value => String(value ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
function printRecords({ title, subtitle, blocks }) {
  const win = window.open("", "_blank");
  if (!win) return false;
  const body = blocks.map(block => `<section class="st"><header><b>${esc(block.head)}</b><span>${esc(block.sub || "")}</span></header>${block.parts.map(part => `<div class="part${part.minor ? " minor" : ""}"><div class="ph"><b>${esc(part.label)}</b><span class="${part.bytes > part.limit ? "over" : ""}">${part.bytes.toLocaleString()} / ${part.limit.toLocaleString()} byte</span></div><div class="tx">${part.text ? esc(part.text).replace(/\n/g, "<br>") : '<i class="empty">(아직 비어 있음)</i>'}</div>${part.issues ? `<div class="iss">${esc(part.issues)}</div>` : ""}</div>`).join("")}</section>`).join("");
  win.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  @page{size:A4;margin:14mm 13mm}*{box-sizing:border-box}body{margin:0;font-family:"Pretendard","Noto Sans KR","Malgun Gothic",sans-serif;color:#17181d;font-size:10.5pt;line-height:1.7}
  .top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #17181d;padding-bottom:6px;margin-bottom:12px}.top h1{margin:0;font-size:15pt}.top span{font-size:9pt;color:#5b606b}
  .st{break-inside:avoid;page-break-inside:avoid;border:1px solid #d9d6cf;border-radius:8px;padding:10px 12px;margin:0 0 10px}
  .st header{display:flex;gap:10px;align-items:baseline;border-bottom:1px solid #ece9e3;padding-bottom:5px;margin-bottom:6px}.st header b{font-size:12pt}.st header span{font-size:9pt;color:#5b606b}
  .part{margin:6px 0 8px}.part.minor{margin-left:12px;font-size:9.5pt;color:#3d4048}.ph{display:flex;justify-content:space-between;font-size:9pt;color:#5b606b;margin-bottom:2px}.ph b{color:#c2410c;font-size:9.5pt}.ph .over{color:#b42318;font-weight:700}
  .tx{text-align:justify;word-break:keep-all;overflow-wrap:anywhere}.empty{color:#9aa0ab}.iss{margin-top:3px;font-size:8.5pt;color:#b42318}
  .page-break{break-after:page;page-break-after:always}
  </style></head><body><div class="top"><h1>${esc(title)}</h1><span>${esc(subtitle)} · 출력 ${new Date().toLocaleString("ko-KR")}</span></div>${body}<script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`);
  win.document.close();
  return true;
}
async function exportXlsx(fileName, sheets) {
  const mod = await import("xlsx-js-style");
  const XLSX = mod.default?.utils ? mod.default : mod;
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, header, rows, widths }) => {
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws["!cols"] = widths.map(wch => ({ wch }));
    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
    for (let r = range.s.r; r <= range.e.r; r += 1) for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      cell.s = { alignment: { vertical: "top", wrapText: true, horizontal: r === 0 ? "center" : undefined }, font: r === 0 ? { bold: true } : undefined, fill: r === 0 ? { fgColor: { rgb: "F3F2EF" } } : undefined };
    }
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  });
  const data = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function downloadJson(fileName, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const issueLine = text => { const list = checkRecordText(text); return list.length ? `점검: ${list.slice(0, 6).map(item => `${item.kind} '${item.match}'`).join(", ")}${list.length > 6 ? ` 외 ${list.length - 6}건` : ""}` : ""; };

function PrintMenu({ onPick, scopes, busy }) {
  const [open, setOpen] = useState(false);
  return <div className="krw-menu">
    <button type="button" data-kdn-bare onClick={() => setOpen(value => !value)} disabled={busy}><Printer size={15} /> 인쇄·PDF·엑셀</button>
    {open && <div className="krw-menu-pop" onMouseLeave={() => setOpen(false)}>
      {scopes.map(([key, label]) => <div key={key} className="row"><span>{label}</span><button type="button" data-kdn-bare onClick={() => { setOpen(false); onPick(key, "print"); }}><Printer size={13} /> 인쇄·PDF</button><button type="button" data-kdn-bare onClick={() => { setOpen(false); onPick(key, "xlsx"); }}><FileSpreadsheet size={13} /> 엑셀</button></div>)}
      <small>PDF는 인쇄 창에서 '대상: PDF로 저장'을 고르면 돼요.</small>
    </div>}
  </div>;
}

const AREA_COLOR = { autonomy: "#2563eb", career: "#059669", behavior: "#7c3aed", subject: "#ea580c" };
const ACT_COLORS = ["#ea580c", "#2563eb", "#059669", "#7c3aed", "#db2777", "#0891b2", "#ca8a04", "#4f46e5"];
const actColor = (acts, id) => ACT_COLORS[Math.max(0, acts.findIndex(act => act.id === id)) % ACT_COLORS.length];
const todayLabel = () => { const d = new Date(); return `${d.getMonth() + 1}.${d.getDate()}`; };

function Field({ label, text, limit, onChange, check, rows = 6, readOnly = false, meta, hint = "", color = "#ea580c", tag = "" }) {
  const fixed = autoFixRecordText(text);
  return <div className="krw-field" style={{ "--c": color }}>
    <div className="krw-field-hd">{tag && <span className="krw-chip">{tag}</span>}<b>{label}</b>{meta?.at && <small>{meta.by ? `${meta.by} · ` : ""}{new Date(meta.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small>}
      {!readOnly && fixed !== text && <button type="button" data-kdn-bare className="krw-fix" title="가운데점·둥근 따옴표·물결·대괄호·겹친 띄어쓰기를 기재요령대로 바꿔요" onClick={() => onChange?.(fixed)}><Wand2 size={13} /> 기호 자동 고치기</button>}
      <ByteMeter text={text} limit={limit} /></div>
    <textarea value={text} rows={rows} readOnly={readOnly} spellCheck={false} onChange={event => onChange?.(event.target.value)} placeholder={readOnly ? "" : `${hint || label} 내용을 적어 주세요. 자동으로 저장돼요.`} />
    {check && <IssueList text={text} />}
  </div>;
}

const VIEWS = [["student", "학생별", "명단에서 학생을 골라 한 명씩", Rows3], ["table", "한눈에 표", "반 전체를 표로 보며 바로 고치기", Table2], ["area", "영역별 몰아쓰기", "한 영역을 반 전체 학생 차례로", LayoutGrid]];

// ── 처음 쓰는 분께 ─────────────────────────────────────────────────────────
const GUIDE_KEY = "kd_rec_guide_seen_v1";
function Guide({ onClose }) {
  return <section className="krw-guide">
    <header><b><HelpCircle size={17} /> 생기부 업무 처음 쓰는 방법</b><button type="button" data-kdn-bare onClick={onClose}><X size={15} /> 닫기</button></header>
    <ol className="steps">{RECORD_GUIDE.steps.map(([title, body], index) => <li key={title}><i>{index + 1}</i><b>{title}</b><span>{body}</span></li>)}</ol>
    <div className="cols">
      <div><b>꼭 지킬 기재요령 (2026 연수 자료)</b><ul>{RECORD_GUIDE.rules.map(rule => <li key={rule}>{rule}</li>)}</ul></div>
      <div><b>교사 입장 맺음말 예시</b><div className="ends">{RECORD_GUIDE.endings.map(item => <span key={item}>{item}</span>)}</div></div>
    </div>
    <p className="keys">단축키: <kbd>Alt</kbd>+<kbd>↓</kbd>/<kbd>↑</kbd> 다음·이전 학생 · <kbd>Ctrl</kbd>+<kbd>S</kbd> 바로 저장</p>
  </section>;
}

// ── 자료 칸: 누가기록 · 활동지 ────────────────────────────────────────────
async function fileUrl(file) {
  if (file.url) return file.url;
  if (!file.dataKey) return "";
  const stored = await readStorage(file.dataKey, null);
  if (!stored?.dataUrl) throw new Error("파일을 찾지 못했어요.");
  const blob = await (await fetch(stored.dataUrl)).blob();
  return URL.createObjectURL(blob);
}
function SidePanel({ rec, sid, studentLabel, scopeLabel, by, showToast, onClose }) {
  const [tab, setTab] = useState("memo");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);
  const files = rec.files.filter(file => !file.removed && (!file.sid || file.sid === sid));
  const memo = rec.textOf(sid, "memo");
  const upload = async (list, forStudent) => {
    setUploading(true);
    const added = [];
    for (const file of Array.from(list || [])) {
      try { const saved = await uploadClassroomAttachment(file, { scopeKey: "생기부", subject: scopeLabel, target: forStudent ? sid : "반공용", teacherName: by }); added.push({ id: uid(), name: file.name, contentType: file.type || saved.contentType || "", dataKey: saved.dataKey || "", url: saved.url || "", path: saved.path || "", sid: forStudent ? sid : "", at: nowIso(), by }); }
      catch (error) { showToast?.(`${file.name}: ${error?.message || "올리지 못했어요."}`, "error"); }
    }
    if (added.length) { rec.edit("files", [...rec.files, ...added]); showToast?.(`활동지 ${added.length}개를 올렸어요.`, "success"); }
    setUploading(false);
  };
  const open = async file => {
    try {
      const url = await fileUrl(file);
      const type = String(file.contentType || "");
      if (type.startsWith("image/") || type === "application/pdf" || /\.(pdf|png|jpe?g|gif|webp)$/i.test(file.name)) setPreview({ name: file.name, url, image: type.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(file.name) });
      else { const a = document.createElement("a"); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); }
    } catch (error) { showToast?.(error?.message || "열지 못했어요.", "error"); }
  };
  return <aside className="krw-side">
    <header><div className="krw-side-tabs"><button type="button" data-kdn-bare aria-pressed={tab === "memo"} onClick={() => setTab("memo")}><FileText size={14} /> 누가기록</button><button type="button" data-kdn-bare aria-pressed={tab === "files"} onClick={() => setTab("files")}><Paperclip size={14} /> 활동지 {files.length > 0 && <em>{files.length}</em>}</button></div><button type="button" data-kdn-bare className="x" onClick={onClose} aria-label="자료 칸 닫기"><PanelRightClose size={16} /></button></header>
    {tab === "memo" ? <div className="krw-memo">
      <p className="krw-side-note">{studentLabel} 관찰 메모예요. 생기부에 들어가지 않고 이 반 선생님만 봐요.</p>
      <textarea value={memo} spellCheck={false} placeholder={"예)\n9.12 모둠 토론에서 반대 측 근거를 정리해 발표\n10.3 실험 보고서 오차 원인을 스스로 분석"} onChange={event => rec.edit(`s|${sid}|memo`, event.target.value)} />
      <button type="button" data-kdn-bare className="krw-btn" onClick={() => rec.edit(`s|${sid}|memo`, `${memo}${memo && !memo.endsWith("\n") ? "\n" : ""}${todayLabel()} `)}><Plus size={14} /> 오늘 날짜로 한 줄 추가</button>
    </div> : <div className="krw-files">
      <div className="up"><button type="button" data-kdn-bare className="krw-btn" disabled={uploading} onClick={() => { inputRef.current.dataset.mode = "class"; inputRef.current.click(); }}>{uploading ? <Loader2 size={14} className="spin" /> : <Paperclip size={14} />} 반 공용 활동지 올리기</button><button type="button" data-kdn-bare className="krw-btn" disabled={uploading} onClick={() => { inputRef.current.dataset.mode = "student"; inputRef.current.click(); }}><Paperclip size={14} /> 이 학생 자료</button>
        <input ref={inputRef} type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.hwp,.hwpx,.doc,.docx,.xlsx,.xls,.ppt,.pptx" onChange={event => { upload(event.target.files, event.target.dataset.mode === "student"); event.target.value = ""; }} /></div>
      <p className="krw-side-note">PDF·사진은 여기서 바로 보며 쓸 수 있어요(파일 하나 30MB 이하).</p>
      {files.length ? <ul>{files.map(file => <li key={file.id}><button type="button" data-kdn-bare className="nm" onClick={() => open(file)}><FileText size={14} /> {file.name}</button><small>{file.sid ? "이 학생" : "반 공용"}</small><button type="button" data-kdn-bare className="rm" title="목록에서 빼기" onClick={() => { if (window.confirm(`'${file.name}'을(를) 목록에서 뺄까요?`)) rec.edit("files", rec.files.map(item => item.id === file.id ? { ...item, removed: true } : item)); }}><Trash2 size={13} /></button></li>)}</ul> : <p className="krw-side-empty">아직 올린 활동지가 없어요.</p>}
      {preview && <div className="krw-preview"><header><b>{preview.name}</b><button type="button" data-kdn-bare onClick={() => setPreview(null)}><X size={14} /></button></header>{preview.image ? <img src={preview.url} alt={preview.name} /> : <iframe title={preview.name} src={preview.url} />}</div>}
    </div>}
  </aside>;
}

// ── 엑셀에서 붙여넣기 ─────────────────────────────────────────────────────
function PasteModal({ students, title, onApply, onClose }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parsePastedRows(text, students), [text, students]);
  return <div className="krw-modal" role="dialog" aria-modal="true" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="krw-modal-box">
      <header><b><ClipboardPaste size={17} /> 엑셀에서 한꺼번에 붙여넣기 · {title}</b><button type="button" data-kdn-bare onClick={onClose}><X size={16} /></button></header>
      <p>엑셀에서 <b>번호(또는 학번) | 내용</b> 두 칸(이름 칸이 사이에 있어도 돼요)을 골라 복사한 뒤 아래에 붙여넣어요. 이미 쓴 글은 붙여넣은 글로 바뀌어요.</p>
      <textarea autoFocus value={text} onChange={event => setText(event.target.value)} placeholder={"1\t소설의 갈등 구조를 분석한 보고서를 작성함.\n2\t..."} />
      <div className="ft"><span>맞춘 학생 <b>{parsed.matched.length}</b>명{parsed.missed.length ? ` · 못 맞춘 줄 ${parsed.missed.length}개` : ""}</span><button type="button" data-kdn-bare className="krw-btn" onClick={onClose}>취소</button><button type="button" data-kdn-bare className="krw-btn pri" disabled={!parsed.matched.length} onClick={() => { onApply(parsed.matched); onClose(); }}>{parsed.matched.length}명에게 넣기</button></div>
    </div>
  </div>;
}

function Progress({ done, total, onlyEmpty, setOnlyEmpty }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return <div className="krw-progress"><span>작성 <b>{done}</b> / {total}명</span><i><em style={{ width: `${pct}%` }} /></i><button type="button" data-kdn-bare aria-pressed={onlyEmpty} onClick={() => setOnlyEmpty(value => !value)}>{onlyEmpty ? "모두 보기" : "안 쓴 학생만"}</button></div>;
}

// Alt+↓/↑ 다음·이전 학생, Ctrl+S 저장
function useWriterKeys({ onNext, onPrev, onSave }) {
  useEffect(() => {
    const onKey = event => {
      if (event.altKey && event.key === "ArrowDown") { event.preventDefault(); onNext(); }
      else if (event.altKey && event.key === "ArrowUp") { event.preventDefault(); onPrev(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); onSave(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, onPrev, onSave]);
}

function StudentList({ items, current, onPick, find, setFind, renderRight }) {
  return <nav className="krw-list">
    <label className="krw-find"><Search size={14} /><input value={find} onChange={event => setFind(event.target.value)} placeholder="이름·번호 찾기" /></label>
    {items.map(s => <button key={s.sid} type="button" data-kdn-bare className={s.sid === current ? "is-on" : ""} onClick={() => onPick(s.sid)}>
      <span className="no">{s.label}</span><span className="nm">{s.name}</span>{renderRight(s)}
    </button>)}
    {!items.length && <p className="krw-side-empty">조건에 맞는 학생이 없어요.</p>}
  </nav>;
}

// ── 학급담임 ───────────────────────────────────────────────────────────────
function HomeroomWriter({ year, grade, classOptions, rosterFor, by, view, check, showToast }) {
  const [cls, setCls] = useState(() => classOptions[0] || "");
  useEffect(() => { if (!classOptions.includes(cls)) setCls(classOptions[0] || ""); }, [classOptions.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const students = useMemo(() => Object.entries(rosterFor(grade) || {}).filter(([, info]) => String(info?.class) === String(cls)).map(([sid, info]) => ({ sid, name: info?.name || "", number: Number(info?.number) || Number(String(sid).slice(-2)) })).sort((a, b) => a.number - b.number), [rosterFor, grade, cls]);
  const rec = useRecordDoc(cls ? hrKey(year, grade, cls) : "", by);
  const [sid, setSid] = useState("");
  const [area, setArea] = useState("autonomy");
  const [find, setFind] = useState("");
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [side, setSide] = useState(true);
  const [paste, setPaste] = useState(false);
  useEffect(() => { if (!students.some(s => s.sid === sid)) setSid(students[0]?.sid || ""); }, [students]); // eslint-disable-line react-hooks/exhaustive-deps
  const filled = s => HOMEROOM_AREAS.filter(key => rec.textOf(s.sid, key).trim()).length;
  const shown = students.filter(s => (!find.trim() || s.name.includes(find.trim()) || s.sid.includes(find.trim()) || String(s.number) === find.trim()) && (!onlyEmpty || filled(s) < HOMEROOM_AREAS.length));
  const current = students.find(s => s.sid === sid);
  const order = shown.length ? shown : students;
  const idx = order.findIndex(s => s.sid === sid);
  const go = step => { const next = order[idx + step]; if (next) setSid(next.sid); };
  const saveNow = useCallback(async () => { if (await rec.save()) showToast?.("저장했어요.", "success"); }, [rec, showToast]);
  useWriterKeys({ onNext: () => go(1), onPrev: () => go(-1), onSave: saveNow });

  const blocksFor = list => list.map(s => ({ head: `${cls}반 ${s.number}번 ${s.name}`, sub: s.sid, parts: HOMEROOM_AREAS.map(key => { const text = rec.textOf(s.sid, key); return { label: RECORD_AREAS[key].label, text, bytes: neisBytes(text), limit: RECORD_AREAS[key].limit, issues: issueLine(text) }; }) }));
  const output = (scope, kind) => {
    const list = scope === "student" ? (current ? [current] : []) : students;
    if (!list.length) return showToast?.("출력할 학생이 없어요.", "error");
    const title = `${grade}학년 ${cls}반 학급담임 생기부`;
    if (kind === "print") { if (!printRecords({ title, subtitle: `${year}학년도 · ${scope === "student" ? `${current.number}번 ${current.name}` : `${list.length}명`}`, blocks: blocksFor(list) })) showToast?.("인쇄 창을 열지 못했어요. 팝업 차단을 확인해 주세요.", "error"); return; }
    exportXlsx(`${title}.xlsx`, [{ name: `${cls}반`, header: ["번호", "학번", "이름", ...HOMEROOM_AREAS.flatMap(key => [RECORD_AREAS[key].label, "바이트"])], widths: [6, 9, 10, ...HOMEROOM_AREAS.flatMap(() => [60, 8])],
      rows: list.map(s => [s.number, s.sid, s.name, ...HOMEROOM_AREAS.flatMap(key => { const text = rec.textOf(s.sid, key); return [text, neisBytes(text)]; })]) }]);
  };

  if (!classOptions.length) return <div className="krw-empty"><Users size={20} /><b>담임 반 정보가 없어요.</b><span>내 정보에서 담임 학년·반을 확인해 주세요.</span></div>;
  return <div className="krw-body">
    <div className="krw-bar">
      {classOptions.length > 1 ? <select value={cls} onChange={event => setCls(event.target.value)} aria-label="반">{classOptions.map(c => <option key={c} value={c}>{grade}학년 {c}반</option>)}</select> : <b className="krw-scope">{grade}학년 {cls}반 담임</b>}
      {rec.loaded && students.length > 0 && <Progress done={students.filter(s => filled(s) === HOMEROOM_AREAS.length).length} total={students.length} onlyEmpty={onlyEmpty} setOnlyEmpty={setOnlyEmpty} />}
      <span className="sp" />
      <SaveBadge rec={rec} />
      <button type="button" data-kdn-bare className="krw-btn pri" onClick={saveNow} disabled={!Object.keys(rec.pending).length || rec.status === "saving"}><Save size={15} /> 지금 저장</button>
      <PrintMenu onPick={output} scopes={[["student", "지금 학생"], ["class", `${cls}반 전체`]]} />
      <button type="button" data-kdn-bare className="krw-btn" title="이 반 자료를 파일로 내려받아 따로 보관" onClick={() => downloadJson(`생기부_${grade}-${cls}_${new Date().toISOString().slice(0, 10)}.json`, rec.doc)}><Download size={15} /> 백업 파일</button>
    </div>
    {rec.error && <p className="krw-alert"><AlertTriangle size={15} /> {rec.error}</p>}
    {!rec.loaded ? <div className="krw-empty"><Loader2 size={18} className="spin" /> 불러오는 중이에요.</div>
      : !students.length ? <div className="krw-empty"><Users size={20} /><b>{cls}반 명단이 없어요.</b><span>관리자 화면에서 {grade}학년 명단을 올려 주세요.</span></div>
      : view === "table" ? <div className="krw-table-wrap"><table className="krw-table"><thead><tr><th className="n">번호</th><th className="nm">이름</th>{HOMEROOM_AREAS.map(key => <th key={key} style={{ "--c": AREA_COLOR[key] }}>{RECORD_AREAS[key].label}</th>)}</tr></thead>
        <tbody>{shown.map(s => <tr key={s.sid}><td className="n">{s.number}</td><td className="nm">{s.name}</td>{HOMEROOM_AREAS.map(key => { const text = rec.textOf(s.sid, key); return <td key={key} style={{ "--c": AREA_COLOR[key] }}><textarea rows={5} value={text} spellCheck={false} onChange={event => rec.edit(`s|${s.sid}|${key}`, event.target.value)} /><div className="cellft"><ByteMeter text={text} limit={RECORD_AREAS[key].limit} />{check && <IssueDot text={text} />}</div></td>; })}</tr>)}</tbody></table></div>
      : view === "area" ? <div className="krw-area">
        <div className="krw-seg">{HOMEROOM_AREAS.map(key => <button key={key} type="button" data-kdn-bare aria-pressed={area === key} style={{ "--c": AREA_COLOR[key] }} onClick={() => setArea(key)}>{RECORD_AREAS[key].label}<em>{students.filter(s => rec.textOf(s.sid, key).trim()).length}/{students.length}</em></button>)}<span className="sp" /><button type="button" data-kdn-bare className="krw-btn" onClick={() => setPaste(true)}><ClipboardPaste size={14} /> 엑셀에서 붙여넣기</button></div>
        {shown.map(s => <Field key={s.sid} label={`${s.number}번 ${s.name}`} hint={RECORD_AREAS[area].label} color={AREA_COLOR[area]} text={rec.textOf(s.sid, area)} limit={RECORD_AREAS[area].limit} check={check} rows={4} meta={rec.metaOf(s.sid, area)} onChange={value => rec.edit(`s|${s.sid}|${area}`, value)} />)}
        {paste && <PasteModal students={students} title={RECORD_AREAS[area].label} onClose={() => setPaste(false)} onApply={rows => rows.forEach(row => rec.edit(`s|${row.sid}|${area}`, row.text))} />}
      </div>
      : <div className={`krw-split${side ? " has-side" : ""}`}>
        <StudentList items={shown.map(s => ({ ...s, label: s.number }))} current={sid} onPick={setSid} find={find} setFind={setFind}
          renderRight={s => <><span className="fill">{HOMEROOM_AREAS.map(key => <i key={key} style={{ "--c": AREA_COLOR[key] }} className={rec.textOf(s.sid, key).trim() ? "on" : ""} />)}</span>{check && <IssueDot text={HOMEROOM_AREAS.map(key => rec.textOf(s.sid, key)).join("\n")} />}</>} />
        {current && <section className="krw-pane">
          <header className="krw-pane-hd"><button type="button" data-kdn-bare disabled={idx <= 0} onClick={() => go(-1)} aria-label="이전 학생" title="이전 학생 (Alt+↑)"><ChevronLeft size={18} /></button><div><b>{current.number}번 {current.name}</b><small>{current.sid} · {filled(current)}/3 영역 작성</small></div>{!side && <button type="button" data-kdn-bare className="side" onClick={() => setSide(true)}><PanelRightOpen size={16} /> 자료</button>}<button type="button" data-kdn-bare disabled={idx >= order.length - 1} onClick={() => go(1)} aria-label="다음 학생" title="다음 학생 (Alt+↓)"><ChevronRight size={18} /></button></header>
          {HOMEROOM_AREAS.map(key => <Field key={key} label={RECORD_AREAS[key].label} color={AREA_COLOR[key]} text={rec.textOf(current.sid, key)} limit={RECORD_AREAS[key].limit} check={check} rows={key === "career" ? 8 : 6} meta={rec.metaOf(current.sid, key)} onChange={value => rec.edit(`s|${current.sid}|${key}`, value)} />)}
        </section>}
        {current && side && <SidePanel rec={rec} sid={current.sid} studentLabel={`${current.number}번 ${current.name}`} scopeLabel={`${grade}-${cls} 학급`} by={by} showToast={showToast} onClose={() => setSide(false)} />}
      </div>}
  </div>;
}

// ── 교과담임 ───────────────────────────────────────────────────────────────
function ActivityManager({ activities, onChange, sources = [], onImport, onApplyAll }) {
  const [name, setName] = useState("");
  const live = activities.filter(act => !act.removed);
  const hidden = activities.filter(act => act.removed);
  const add = () => { const value = name.trim(); if (!value) return; onChange([...activities, { id: uid(), name: value }]); setName(""); };
  return <div className="krw-acts">
    <div className="hd"><b>수행평가 영역(활동)</b><small>활동별로 나눠 쓰면 총합본이 줄을 바꿔 합쳐져요</small><span className="sp" />
      {sources.length > 0 && <select value="" onChange={event => { if (event.target.value) onImport(event.target.value); }} aria-label="다른 반 활동 가져오기"><option value="">다른 반 활동 가져오기…</option>{sources.map(src => <option key={src.id} value={src.id}>{src.subject} · {src.label}</option>)}</select>}
      {onApplyAll && live.length > 0 && <button type="button" data-kdn-bare className="krw-btn" onClick={onApplyAll} title="같은 과목 내 다른 반에 이 활동 목록을 똑같이 넣어요(이미 있는 이름은 건너뜀)"><Copy size={13} /> 같은 과목 다른 반에도 적용</button>}
    </div>
    <div className="list">{live.map((act, index) => <span key={act.id} className="chip" style={{ "--c": ACT_COLORS[index % ACT_COLORS.length] }}>
      <i />
      <input value={act.name} aria-label="활동 이름" size={Math.max(4, Array.from(act.name).reduce((n, ch) => n + (ch.charCodeAt(0) > 0x7f ? 2 : 1), 0) + 1)} onChange={event => onChange(activities.map(item => item.id === act.id ? { ...item, name: event.target.value } : item))} />
      <button type="button" data-kdn-bare title="앞으로" disabled={index === 0} onClick={() => { const order = live.map(a => a.id); [order[index - 1], order[index]] = [order[index], order[index - 1]]; onChange([...order.map(id => activities.find(a => a.id === id)), ...hidden]); }}><ChevronLeft size={13} /></button>
      <button type="button" data-kdn-bare title="숨기기(쓴 글은 지워지지 않아요)" onClick={() => onChange(activities.map(item => item.id === act.id ? { ...item, removed: true } : item))}><Trash2 size={12} /></button>
    </span>)}
      <span className="add"><input value={name} placeholder="예: 독서 탐구 보고서" onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") add(); }} /><button type="button" data-kdn-bare onClick={add}><Plus size={13} /> 활동 추가</button></span>
    </div>
    {hidden.length > 0 && <div className="hidden">숨긴 활동: {hidden.map(act => <button key={act.id} type="button" data-kdn-bare onClick={() => onChange(activities.map(item => item.id === act.id ? { ...item, removed: false } : item))}><RotateCcw size={11} /> {act.name}</button>)}</div>}
  </div>;
}

function SubjectWriter({ year, books, by, view, check, showToast }) {
  const [bookId, setBookId] = useState(() => books[0]?.id || "");
  useEffect(() => { if (!books.some(book => book.id === bookId)) setBookId(books[0]?.id || ""); }, [books.map(b => b.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const book = books.find(item => item.id === bookId);
  const rec = useRecordDoc(book ? sjKey(year, book.id) : "", by);
  const acts = rec.activities.filter(act => !act.removed);
  const limit = RECORD_AREAS.subject.limit;
  const students = useMemo(() => (book?.students || []).map(s => ({ ...s, number: Number(s.number) || Number(String(s.sid).slice(-2)) })), [book]);
  const [sid, setSid] = useState("");
  const [actId, setActId] = useState("");
  const [find, setFind] = useState("");
  const [copied, setCopied] = useState(false);
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [side, setSide] = useState(true);
  const [paste, setPaste] = useState(false);
  useEffect(() => { if (!students.some(s => s.sid === sid)) setSid(students[0]?.sid || ""); }, [students]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!acts.some(a => a.id === actId)) setActId(acts[0]?.id || ""); }, [acts.map(a => a.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const texts = s => Object.fromEntries(acts.map(act => [act.id, rec.textOf(s.sid, act.id)]));
  const totalOf = s => mergeActivities(acts, texts(s));
  const doneOf = s => acts.length > 0 && acts.every(act => rec.textOf(s.sid, act.id).trim());
  const shown = students.filter(s => (!find.trim() || s.name.includes(find.trim()) || s.sid.includes(find.trim())) && (!onlyEmpty || !doneOf(s)));
  const current = students.find(s => s.sid === sid);
  const order = shown.length ? shown : students;
  const idx = order.findIndex(s => s.sid === sid);
  const go = step => { const next = order[idx + step]; if (next) setSid(next.sid); };
  const saveNow = useCallback(async () => { if (await rec.save()) showToast?.("저장했어요.", "success"); }, [rec, showToast]);
  useWriterKeys({ onNext: () => go(1), onPrev: () => go(-1), onSave: saveNow });
  const who = s => book?.kind === "common" ? `${s.number}번 ${s.name}` : `${s.class}반 ${s.number}번 ${s.name}`;

  // 활동 가져오기·같은 과목 다른 반에 적용(이름이 같은 활동은 건너뜀, 글은 옮기지 않음)
  const sources = books.filter(b => b.id !== book?.id);
  const importFrom = async srcId => {
    const src = await readStorage(sjKey(year, srcId), emptyDoc()).catch(() => null);
    const names = new Set(rec.activities.filter(a => !a.removed).map(a => a.name.trim()));
    const add = (src?.activities || []).filter(a => !a.removed && a.name.trim() && !names.has(a.name.trim())).map(a => ({ id: uid(), name: a.name }));
    if (!add.length) return showToast?.("가져올 새 활동이 없어요(같은 이름은 건너뛰어요).", "error");
    rec.edit("acts", [...rec.activities, ...add]);
    showToast?.(`활동 ${add.length}개를 가져왔어요.`, "success");
  };
  const applyAll = async () => {
    const targets = books.filter(b => b.id !== book.id && b.subject === book.subject);
    if (!targets.length) return showToast?.("같은 과목의 다른 반이 없어요.", "error");
    if (!window.confirm(`${book.subject} 다른 ${targets.length}개 반에 지금 활동 목록(${acts.length}개)을 넣을까요? 이미 있는 이름은 건너뛰고, 쓴 글은 그대로예요.`)) return;
    let changed = 0;
    for (const target of targets) {
      const result = await updateStorage(sjKey(year, target.id), emptyDoc(), current => {
        const have = new Set((current?.activities || []).filter(a => !a.removed).map(a => a.name.trim()));
        const add = acts.filter(a => !have.has(a.name.trim())).map(a => ({ id: uid(), name: a.name }));
        if (!add.length) return current;
        changed += 1;
        return { ...(current || emptyDoc()), activities: [...(current?.activities || []), ...add], updatedAt: nowIso() };
      });
      if (!result?.ok) { showToast?.(`${target.label}: ${result?.error || "저장하지 못했어요."}`, "error"); return; }
    }
    showToast?.(changed ? `${changed}개 반에 활동 목록을 넣었어요.` : "다른 반에 이미 같은 활동이 있어요.", "success");
  };

  const blocksFor = (list, b, rd) => list.map(s => {
    const actList = (rd.activities || []).filter(act => !act.removed);
    const t = Object.fromEntries(actList.map(act => [act.id, rd.textOf(s.sid, act.id)]));
    const total = mergeActivities(actList, t);
    return { head: `${b.subject} · ${b.label} · ${b.kind === "common" ? `${s.number}번 ${s.name}` : `${s.class}반 ${s.number}번 ${s.name}`}`, sub: s.sid, parts: [{ label: "과세특 총합본", text: total, bytes: neisBytes(total), limit, issues: issueLine(total) }, ...actList.map(act => ({ label: `└ ${act.name}`, text: t[act.id], bytes: neisBytes(t[act.id]), limit, minor: true }))] };
  });
  const [busy, setBusy] = useState(false);
  const output = async (scope, kind) => {
    if (!book) return;
    let targets = [];
    if (scope === "student") targets = current ? [{ b: book, rd: rec, list: [current] }] : [];
    else if (scope === "class") targets = [{ b: book, rd: rec, list: students }];
    else {
      setBusy(true);
      targets = await Promise.all(books.map(async b => {
        if (b.id === book.id) return { b, rd: rec, list: b.students };
        const doc = await readStorage(sjKey(year, b.id), emptyDoc()).catch(() => emptyDoc());
        return { b, rd: { activities: doc?.activities || [], textOf: (s, f) => doc?.students?.[s]?.[f]?.t || "" }, list: b.students };
      }));
      setBusy(false);
    }
    if (!targets.some(t => t.list.length)) return showToast?.("출력할 학생이 없어요.", "error");
    const title = `${book.subject} 과목별 세부능력 및 특기사항`;
    if (kind === "print") { if (!printRecords({ title, subtitle: `${year}학년도 · ${scope === "all" ? "담당 반 전체" : book.label}`, blocks: targets.flatMap(t => blocksFor(t.list.map(s => ({ ...s, number: Number(s.number) || Number(String(s.sid).slice(-2)) })), t.b, t.rd)) })) showToast?.("인쇄 창을 열지 못했어요. 팝업 차단을 확인해 주세요.", "error"); return; }
    exportXlsx(`${title}.xlsx`, targets.map(t => {
      const actList = (t.rd.activities || []).filter(act => !act.removed);
      return { name: t.b.label.replace(/[\\/?*[\]:]/g, " "), header: ["반", "번호", "학번", "이름", "과세특 총합본", "바이트", ...actList.map(act => act.name)], widths: [6, 6, 9, 10, 70, 8, ...actList.map(() => 40)],
        rows: t.list.map(s => { const tx = actList.map(act => t.rd.textOf(s.sid, act.id)); const total = mergeActivities(actList, Object.fromEntries(actList.map((act, i) => [act.id, tx[i]]))); return [s.class, Number(s.number) || Number(String(s.sid).slice(-2)), s.sid, s.name, total, neisBytes(total), ...tx]; }) };
    }));
  };

  if (!books.length) return <div className="krw-empty"><BookOpen size={20} /><b>이 학년·학기 담당 과목이 없어요.</b><span>내 정보에서 담당 과목·반(이동수업은 분반)을 고르면 반별로 과세특을 쓸 수 있어요.</span></div>;
  return <div className="krw-body">
    <div className="krw-bar">
      <select value={bookId} onChange={event => setBookId(event.target.value)} aria-label="과목·반">{books.map(b => <option key={b.id} value={b.id}>{b.subject} · {b.label} ({b.students.length}명)</option>)}</select>
      {book?.kind !== "common" && <small className="krw-tag">이동수업 · 출석부 기준</small>}
      {rec.loaded && acts.length > 0 && <Progress done={students.filter(doneOf).length} total={students.length} onlyEmpty={onlyEmpty} setOnlyEmpty={setOnlyEmpty} />}
      <span className="sp" />
      <SaveBadge rec={rec} />
      <button type="button" data-kdn-bare className="krw-btn pri" onClick={saveNow} disabled={!Object.keys(rec.pending).length || rec.status === "saving"}><Save size={15} /> 지금 저장</button>
      <PrintMenu busy={busy} onPick={output} scopes={[["student", "지금 학생"], ["class", `${book?.label || "이 반"} 전체`], ["all", "담당 반 전체"]]} />
      <button type="button" data-kdn-bare className="krw-btn" title="이 반 자료를 파일로 내려받아 따로 보관" onClick={() => downloadJson(`과세특_${book?.subject}_${book?.target}_${new Date().toISOString().slice(0, 10)}.json`, rec.doc)}><Download size={15} /> 백업 파일</button>
    </div>
    {rec.error && <p className="krw-alert"><AlertTriangle size={15} /> {rec.error}</p>}
    {rec.loaded && <ActivityManager activities={rec.activities} onChange={list => rec.edit("acts", list)} sources={sources} onImport={importFrom} onApplyAll={books.some(b => b.id !== book?.id && b.subject === book?.subject) ? applyAll : null} />}
    {!rec.loaded ? <div className="krw-empty"><Loader2 size={18} className="spin" /> 불러오는 중이에요.</div>
      : !acts.length ? <div className="krw-empty"><b>먼저 수행평가 영역(활동)을 추가해 주세요.</b><span>다른 반에서 만든 목록이 있으면 '다른 반 활동 가져오기'로 복사할 수 있어요.</span></div>
      : view === "table" ? <div className="krw-table-wrap"><table className="krw-table"><thead><tr><th className="nm">학생</th>{acts.map(act => <th key={act.id} style={{ "--c": actColor(acts, act.id) }}>{act.name}</th>)}<th className="tot">총합본</th></tr></thead>
        <tbody>{shown.map(s => { const total = totalOf(s); return <tr key={s.sid}><td className="nm">{who(s)}</td>{acts.map(act => { const text = rec.textOf(s.sid, act.id); return <td key={act.id} style={{ "--c": actColor(acts, act.id) }}><textarea rows={5} value={text} spellCheck={false} onChange={event => rec.edit(`s|${s.sid}|${act.id}`, event.target.value)} /><div className="cellft"><span className="krw-bytes sm"><b>{neisBytes(text).toLocaleString()}</b> byte</span></div></td>; })}
          <td className="tot"><div className="krw-total-sm">{total || <i>비어 있음</i>}</div><div className="cellft"><ByteMeter text={total} limit={limit} />{check && <IssueDot text={total} />}</div></td></tr>; })}</tbody></table></div>
      : view === "area" ? <div className="krw-area">
        <div className="krw-seg">{acts.map(act => <button key={act.id} type="button" data-kdn-bare aria-pressed={actId === act.id} style={{ "--c": actColor(acts, act.id) }} onClick={() => setActId(act.id)}>{act.name}<em>{students.filter(s => rec.textOf(s.sid, act.id).trim()).length}/{students.length}</em></button>)}<span className="sp" /><button type="button" data-kdn-bare className="krw-btn" onClick={() => setPaste(true)}><ClipboardPaste size={14} /> 엑셀에서 붙여넣기</button></div>
        {shown.map(s => { const total = totalOf(s); return <div key={s.sid} className="krw-areacard"><Field label={who(s)} hint={acts.find(a => a.id === actId)?.name || "활동"} color={actColor(acts, actId)} text={rec.textOf(s.sid, actId)} limit={limit} check={check} rows={3} meta={rec.metaOf(s.sid, actId)} onChange={value => rec.edit(`s|${s.sid}|${actId}`, value)} /><p className="krw-total-line">이 학생 총합본 <ByteMeter text={total} limit={limit} /></p></div>; })}
        {paste && <PasteModal students={students} title={acts.find(a => a.id === actId)?.name || "활동"} onClose={() => setPaste(false)} onApply={rows => rows.forEach(row => rec.edit(`s|${row.sid}|${actId}`, row.text))} />}
      </div>
      : <div className={`krw-split${side ? " has-side" : ""}`}>
        <StudentList items={shown.map(s => ({ ...s, label: book.kind === "common" ? s.number : `${s.class}-${s.number}` }))} current={sid} onPick={setSid} find={find} setFind={setFind}
          renderRight={s => { const total = totalOf(s); const b = neisBytes(total); return <><span className="fill">{acts.slice(0, 6).map(act => <i key={act.id} style={{ "--c": actColor(acts, act.id) }} className={rec.textOf(s.sid, act.id).trim() ? "on" : ""} />)}</span><span className={`b${b > limit ? " over" : ""}`}>{b ? b.toLocaleString() : "-"}</span>{check && <IssueDot text={total} />}</>; }} />
        {current && <section className="krw-pane">
          <header className="krw-pane-hd"><button type="button" data-kdn-bare disabled={idx <= 0} onClick={() => go(-1)} aria-label="이전 학생" title="이전 학생 (Alt+↑)"><ChevronLeft size={18} /></button><div><b>{who(current)}</b><small>{current.sid} · {book.subject}</small></div>{!side && <button type="button" data-kdn-bare className="side" onClick={() => setSide(true)}><PanelRightOpen size={16} /> 자료</button>}<button type="button" data-kdn-bare disabled={idx >= order.length - 1} onClick={() => go(1)} aria-label="다음 학생" title="다음 학생 (Alt+↓)"><ChevronRight size={18} /></button></header>
          {acts.map((act, index) => <Field key={act.id} tag={`활동 ${index + 1}`} label={act.name} color={actColor(acts, act.id)} text={rec.textOf(current.sid, act.id)} limit={limit} check={check} rows={4} meta={rec.metaOf(current.sid, act.id)} onChange={value => rec.edit(`s|${current.sid}|${act.id}`, value)} />)}
          {(() => { const total = totalOf(current); return <div className="krw-total">
            <div className="krw-field-hd"><span className="krw-chip">합본</span><b>과세특 총합본</b><small>활동마다 줄을 바꿔 합쳐요 · 나이스에 그대로 붙여넣기</small><ByteMeter text={total} limit={limit} /><button type="button" data-kdn-bare className="krw-copy" onClick={async () => { try { await navigator.clipboard.writeText(total); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { showToast?.("복사하지 못했어요.", "error"); } }}><Copy size={13} /> {copied ? "복사됨" : "복사"}</button></div>
            <div className="krw-total-tx">{total || <i>활동별 글을 쓰면 여기에 합쳐져요.</i>}</div>
            {check && <IssueList text={total} />}
          </div>; })()}
        </section>}
        {current && side && <SidePanel rec={rec} sid={current.sid} studentLabel={who(current)} scopeLabel={`${book.subject} ${book.label}`} by={by} showToast={showToast} onClose={() => setSide(false)} />}
      </div>}
  </div>;
}

// ── 바깥 틀 ─────────────────────────────────────────────────────────────────
export default function RecordWriter({ teacher = null, isAdmin = false, accounts = {}, db = {}, grade = "2", semester = "sem1", actor = null, showToast, legacy = null }) {
  const year = schoolYearOf();
  const by = actor?.name || teacher?.name || "";
  const homeroomGrade = String(teacher?.roleGrade || teacher?.homeroomGrade || grade);
  const rosterFor = useCallback(g => [`${g}-${semester}`, `${g}-sem2`, `${g}-sem1`].map(key => db?.roster?.[key]).find(item => item && Object.keys(item).length) || {}, [db?.roster, semester]);
  const hrGrade = isAdmin ? String(grade) : homeroomGrade;
  const classOptions = useMemo(() => {
    if (isAdmin) return Array.from(new Set(Object.values(rosterFor(hrGrade)).map(info => String(info?.class || "")).filter(Boolean))).sort((a, b) => Number(a) - Number(b));
    return teacher?.homeroomClass ? [String(teacher.homeroomClass)] : [];
  }, [isAdmin, teacher, rosterFor, hrGrade]);
  const teachers = accounts?.teacher || [];
  const [pickedTeacherId, setPickedTeacherId] = useState("");
  const subjectTeacher = isAdmin && !teacher ? teachers.find(t => t.id === pickedTeacherId) || null : teacher;
  const books = useMemo(() => {
    const scope = `${grade}-${semester}`;
    const roster = db?.roster?.[scope] || rosterFor(grade);
    const enrollments = db?.enrollments?.[scope] || {};
    const list = (subjectTeacher?.assignments || []).filter(item => item?.subject && String(item.grade || grade) === String(grade) && String(item.semester || semester) === String(semester));
    const out = [];
    list.forEach(item => booksForAssignment(item, { roster, enrollments, grade, semester }).forEach(book => { if (!out.some(other => other.id === book.id)) out.push(book); }));
    return out;
  }, [subjectTeacher, db?.roster, db?.enrollments, grade, semester, rosterFor]);

  const canHomeroom = isAdmin || !!teacher?.homeroomClass;
  const tabs = [canHomeroom && ["homeroom", "학급담임", "자율·자치 · 진로 · 행발"], ["subject", "교과담임", "반·분반별 과세특"], legacy && ["legacy", "2학년부 자료", "활동 배정 · 소감문"]].filter(Boolean);
  const [tab, setTab] = useState(() => { try { const saved = localStorage.getItem("kd_rec_tab_v1"); return tabs.some(t => t[0] === saved) ? saved : tabs[0][0]; } catch { return tabs[0][0]; } });
  const [view, setView] = useState(() => { try { return VIEWS.some(v => v[0] === localStorage.getItem(VIEW_KEY)) ? localStorage.getItem(VIEW_KEY) : "student"; } catch { return "student"; } });
  const [check, setCheck] = useState(true);
  const [guide, setGuide] = useState(() => { try { return !localStorage.getItem(GUIDE_KEY); } catch { return true; } });
  const closeGuide = () => { setGuide(false); try { localStorage.setItem(GUIDE_KEY, "1"); } catch { /* 안내 숨김 기억은 편의 기능 */ } };
  const pick = (setter, storageKey) => value => { setter(value); try { localStorage.setItem(storageKey, value); } catch { /* 선택 기억은 편의 기능 */ } };

  return <div className="krw">
    <style>{CSS}</style>
    <header className="krw-head">
      <div className="t"><b>생기부 업무</b><small>칸마다 자동 저장 · 나이스 바이트 계산 · 2026 기재요령 점검</small></div>
      <div className="krw-tabs" role="tablist">{tabs.map(([key, label, sub]) => <button key={key} type="button" data-kdn-bare role="tab" aria-selected={tab === key} className={`t-${key}`} onClick={() => pick(setTab, "kd_rec_tab_v1")(key)}><b>{label}</b><small>{sub}</small></button>)}</div>
    </header>
    {guide && tab !== "legacy" && <Guide onClose={closeGuide} />}
    {tab !== "legacy" && <div className="krw-opts">
      <div className="krw-views" role="group" aria-label="보는 형태">{VIEWS.map(([key, label, sub, Icon]) => <button key={key} type="button" data-kdn-bare aria-pressed={view === key} title={sub} onClick={() => pick(setView, VIEW_KEY)(key)}><Icon size={15} /> {label}</button>)}</div>
      <button type="button" data-kdn-bare className={`krw-check${check ? " is-on" : ""}`} aria-pressed={check} onClick={() => setCheck(value => !value)}>{check ? <Eye size={15} /> : <EyeOff size={15} />} 기재요령 점검 {check ? "켜짐" : "꺼짐"}</button>
      {!guide && <button type="button" data-kdn-bare className="krw-btn" onClick={() => setGuide(true)}><HelpCircle size={15} /> 사용법·기재요령</button>}
      {tab === "subject" && isAdmin && !teacher && <select className="krw-teacher" value={pickedTeacherId} onChange={event => setPickedTeacherId(event.target.value)} aria-label="선생님"><option value="">선생님 고르기</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
    </div>}
    {tab === "homeroom" && <HomeroomWriter year={year} grade={hrGrade} classOptions={classOptions} rosterFor={rosterFor} by={by} view={view} check={check} showToast={showToast} />}
    {tab === "subject" && (isAdmin && !teacher && !subjectTeacher ? <div className="krw-empty"><Users size={20} /><b>세특을 볼 선생님을 골라 주세요.</b></div>
      : <SubjectWriter year={year} books={books} by={by} view={view} check={check} showToast={showToast} />)}
    {tab === "legacy" && legacy}
  </div>;
}

const CSS = `
.krw{display:grid;gap:14px;color:var(--kdn-ink,#17181d)}
.krw-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 18px;padding:16px 18px;border-radius:22px;background:linear-gradient(135deg,#1c1d24,#2b2621);color:#fff;position:relative;overflow:hidden}
.krw-head::before{content:"";position:absolute;right:-60px;top:-90px;width:260px;height:260px;border-radius:99px;background:radial-gradient(circle,rgba(255,122,61,.35),rgba(255,122,61,0) 70%);pointer-events:none}
.krw-head>*{position:relative}
.krw-head .t{display:grid;gap:2px}.krw-head .t b{font-size:21px;font-weight:800;letter-spacing:-.02em;color:#fff}.krw-head .t small{font-size:13px;color:#cfccc5}
.krw-tabs{display:flex;gap:4px;padding:4px;border-radius:16px;background:rgba(255,255,255,.08)}
.krw-tabs button{display:grid;gap:1px;justify-items:start;padding:9px 18px;border:0;border-radius:12px;background:transparent;font:inherit;color:#cfccc5;cursor:pointer;text-align:left}
.krw-tabs button b{font-size:15px;font-weight:800}.krw-tabs button small{font-size:11.5px;opacity:.85}
.krw-tabs button[aria-selected="true"]{background:#ff7a3d;color:#1b1006;box-shadow:0 6px 18px rgba(255,122,61,.35)}
.krw-tabs button.t-homeroom[aria-selected="true"]{background:#60a5fa;color:#0b1b33;box-shadow:0 6px 18px rgba(96,165,250,.35)}
.krw-tabs button.t-legacy[aria-selected="true"]{background:#f4f3f0;color:#17181d}
.krw-guide{display:grid;gap:12px;padding:16px 18px;border-radius:20px;background:color-mix(in srgb,#2563eb 6%,var(--kdn-surface,#fff));border:1.5px solid color-mix(in srgb,#2563eb 30%,transparent)}
.krw-guide>header{display:flex;align-items:center;justify-content:space-between}.krw-guide>header b{display:inline-flex;align-items:center;gap:6px;font-size:16px;font-weight:800;color:#1d4ed8}
.krw-guide>header button{display:inline-flex;align-items:center;gap:4px;min-height:32px;padding:0 10px;border:0;border-radius:9px;background:var(--kdn-surface,#fff);font:inherit;font-size:13px;font-weight:700;color:var(--kdn-ink-soft,#5b606b);cursor:pointer}
.krw-guide .steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.krw-guide .steps li{display:grid;gap:4px;padding:12px;border-radius:14px;background:var(--kdn-surface,#fff)}
.krw-guide .steps i{display:grid;place-items:center;width:24px;height:24px;border-radius:99px;background:#2563eb;color:#fff;font-style:normal;font-size:12px;font-weight:800}
.krw-guide .steps b{font-size:14px}.krw-guide .steps span{font-size:12.5px;line-height:1.55;color:var(--kdn-ink-soft,#5b606b)}
.krw-guide .cols{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:10px}
.krw-guide .cols>div{padding:12px 14px;border-radius:14px;background:var(--kdn-surface,#fff)}.krw-guide .cols b{font-size:13.5px;font-weight:800}
.krw-guide ul{margin:6px 0 0;padding-left:18px;display:grid;gap:3px;font-size:12.5px;line-height:1.55;color:var(--kdn-ink-soft,#5b606b)}
.krw-guide .ends{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}.krw-guide .ends span{padding:3px 9px;border-radius:99px;background:color-mix(in srgb,#059669 10%,transparent);color:#047857;font-size:12px;font-weight:700}
.krw-guide .keys{margin:0;font-size:12px;color:var(--kdn-muted,#8a8f99)}.krw-guide kbd{padding:1px 6px;border-radius:5px;border:1px solid var(--kdn-line,#d8d5ce);background:var(--kdn-surface,#fff);font:inherit;font-size:11px}
.krw-opts{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.krw-views{display:flex;gap:2px;padding:3px;border-radius:12px;background:var(--kdn-surface-2,#ecebe7)}
.krw-views button,.krw-check,.krw-btn,.krw-menu>button{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 13px;border:0;border-radius:10px;background:transparent;font:inherit;font-size:13.5px;font-weight:700;color:var(--kdn-ink-soft,#5b606b);cursor:pointer;white-space:nowrap}
.krw-views button[aria-pressed="true"]{background:#ff7a3d;color:#1b1006;box-shadow:0 2px 8px rgba(255,122,61,.3)}
.krw-check{border:1px solid var(--kdn-line,#e7e5e0);background:var(--kdn-surface,#fff)}.krw-check.is-on{border-color:color-mix(in srgb,#16a34a 40%,transparent);color:#15803d;background:color-mix(in srgb,#16a34a 8%,var(--kdn-surface,#fff))}
.krw-teacher,.krw-bar select,.krw-acts select{min-height:38px;padding:0 12px;border-radius:10px;border:1.5px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:inherit;font:inherit;font-size:14px;font-weight:700;max-width:100%}
.krw-body{display:grid;gap:12px}
.krw-bar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;border-radius:16px;background:color-mix(in srgb,var(--kdn-surface,#fff) 94%,transparent);backdrop-filter:blur(8px);border:1px solid var(--kdn-line,#e7e5e0);box-shadow:0 6px 18px rgba(20,24,33,.05)}
.krw-bar .sp,.krw-seg .sp,.krw-acts .sp{flex:1}.krw-scope{font-size:15px;font-weight:800;color:#1d4ed8}
.krw-tag{padding:3px 9px;border-radius:99px;background:color-mix(in srgb,#2563eb 10%,transparent);color:#1d4ed8;font-size:12px;font-weight:700}
.krw-progress{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--kdn-ink-soft,#5b606b)}.krw-progress b{color:var(--kdn-ink,#17181d)}
.krw-progress i{display:block;width:90px;height:6px;border-radius:99px;background:var(--kdn-surface-2,#ecebe7);overflow:hidden}.krw-progress em{display:block;height:100%;background:linear-gradient(90deg,#ff7a3d,#16a34a)}
.krw-progress button{min-height:30px;padding:0 10px;border-radius:99px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);font:inherit;font-size:12px;font-weight:700;color:inherit;cursor:pointer}.krw-progress button[aria-pressed="true"]{background:#fff4ec;border-color:#ff7a3d;color:#c2410c}
.krw-btn{border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff)}.krw-btn.pri{border-color:transparent;background:#ff7a3d;color:#1b1006}.krw-btn:disabled{opacity:.45;cursor:default}
.krw-menu{position:relative}.krw-menu>button{border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff)}
.krw-menu-pop{position:absolute;right:0;top:calc(100% + 6px);z-index:30;display:grid;gap:6px;min-width:300px;padding:12px;border-radius:16px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0);box-shadow:0 18px 40px rgba(20,24,33,.18)}
.krw-menu-pop .row{display:flex;align-items:center;gap:6px}.krw-menu-pop .row span{flex:1;font-size:13.5px;font-weight:700}
.krw-menu-pop .row button{display:inline-flex;align-items:center;gap:4px;min-height:32px;padding:0 10px;border-radius:9px;border:1px solid var(--kdn-line,#e7e5e0);background:var(--kdn-surface-2,#f6f5f3);font:inherit;font-size:12.5px;font-weight:700;color:inherit;cursor:pointer}
.krw-menu-pop small{font-size:11.5px;color:var(--kdn-muted,#8a8f99)}
.krw-save{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:700;white-space:nowrap}
.krw-save.is-ok{color:#15803d}.krw-save.is-busy,.krw-save.is-load{color:var(--kdn-muted,#8a8f99)}.krw-save.is-dirty{color:#b45309}.krw-save.is-err{color:#b42318}
.krw-alert{display:flex;align-items:center;gap:8px;margin:0;padding:10px 14px;border-radius:14px;background:color-mix(in srgb,#dc2626 9%,var(--kdn-surface,#fff));color:#b42318;font-size:13.5px;font-weight:700}
.krw-empty{display:grid;justify-items:center;gap:6px;padding:40px 18px;border-radius:20px;border:1.5px dashed var(--kdn-line,#e2dfd8);color:var(--kdn-muted,#8a8f99);text-align:center}.krw-empty b{color:var(--kdn-ink,#17181d);font-size:15px}.krw-empty span{font-size:13px}
.krw-split{display:grid;grid-template-columns:minmax(200px,240px) minmax(0,1fr);gap:14px;align-items:start}
.krw-split.has-side{grid-template-columns:minmax(200px,230px) minmax(0,1fr) minmax(280px,360px)}
.krw-list{position:sticky;top:70px;display:grid;gap:2px;max-height:calc(100vh - 160px);overflow:auto;padding:8px;border-radius:20px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0)}
.krw-find{display:flex;align-items:center;gap:6px;margin-bottom:4px;padding:0 10px;border-radius:12px;background:var(--kdn-surface-2,#f3f2ef);color:var(--kdn-muted,#8a8f99)}
.krw-find input{flex:1;min-width:0;min-height:36px;border:0;outline:0;background:transparent;font:inherit;font-size:13.5px;color:var(--kdn-ink,#17181d)}
.krw-list>button{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 10px;border:0;border-radius:12px;background:transparent;font:inherit;color:inherit;text-align:left;cursor:pointer}
.krw-list>button:hover{background:var(--kdn-surface-2,#f6f5f3)}.krw-list>button.is-on{background:#fff4ec;box-shadow:inset 3px 0 0 #ff7a3d}
.krw-list .no{width:34px;font-size:12.5px;color:var(--kdn-muted,#8a8f99);font-variant-numeric:tabular-nums}.krw-list>button.is-on .no{color:#c2410c;font-weight:800}
.krw-list .nm{flex:1;min-width:0;font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.krw-list .fill{display:flex;gap:3px}.krw-list .fill i{width:7px;height:7px;border-radius:99px;background:var(--kdn-line,#dcd9d2)}.krw-list .fill i.on{background:var(--c,#ff7a3d)}
.krw-list .b{min-width:34px;text-align:right;font-size:12px;font-weight:700;color:var(--kdn-muted,#8a8f99);font-variant-numeric:tabular-nums}.krw-list .b.over{color:#dc2626}
.krw-dot{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;border-radius:99px;font-size:11px;font-weight:800;font-style:normal}.krw-dot.is-block{background:#dc2626;color:#fff}.krw-dot.is-warn{background:#f59e0b;color:#1b1006}
.krw-pane{display:grid;gap:12px;min-width:0}
.krw-pane-hd{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:18px;background:linear-gradient(135deg,#1c1d24,#2b2621);color:#fff}
.krw-pane-hd div{flex:1;display:grid}.krw-pane-hd b{font-size:18px;font-weight:800}.krw-pane-hd small{font-size:12px;color:#cfccc5}
.krw-pane-hd button{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:38px;height:38px;padding:0 8px;border-radius:12px;border:0;background:rgba(255,255,255,.1);color:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer}.krw-pane-hd button:disabled{opacity:.3}
.krw-field,.krw-total{position:relative;display:grid;gap:8px;padding:14px 16px 14px 20px;border-radius:18px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0);box-shadow:0 1px 2px rgba(20,24,33,.04),0 6px 16px rgba(20,24,33,.04)}
.krw-field::before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:5px;border-radius:0 6px 6px 0;background:var(--c,#ff7a3d)}
.krw-field:focus-within{border-color:color-mix(in srgb,var(--c,#ff7a3d) 55%,transparent);box-shadow:0 0 0 4px color-mix(in srgb,var(--c,#ff7a3d) 14%,transparent)}
.krw-field-hd{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}.krw-field-hd b{font-size:15.5px;font-weight:800;color:color-mix(in srgb,var(--c,#17181d) 70%,var(--kdn-ink,#17181d))}.krw-field-hd small{font-size:12px;color:var(--kdn-muted,#8a8f99)}
.krw-field-hd .krw-bytes{margin-left:auto}
.krw-chip{padding:2px 8px;border-radius:99px;background:color-mix(in srgb,var(--c,#ff7a3d) 14%,transparent);color:color-mix(in srgb,var(--c,#ff7a3d) 80%,#000);font-size:11.5px;font-weight:800}
.krw-fix{display:inline-flex;align-items:center;gap:4px;min-height:28px;padding:0 10px;border-radius:99px;border:1px solid color-mix(in srgb,#7c3aed 35%,transparent);background:color-mix(in srgb,#7c3aed 8%,var(--kdn-surface,#fff));color:#6d28d9;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
.krw-field textarea,.krw-table textarea{width:100%;box-sizing:border-box;resize:vertical;padding:12px 14px;border-radius:12px;border:1.5px solid var(--kdn-line,#dcd9d2);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#17181d);font:inherit;font-size:15px;line-height:1.8;word-break:keep-all}
.krw-field textarea::placeholder,.krw-table textarea::placeholder{color:#a3a7b0}
.krw-field textarea:focus,.krw-table textarea:focus{outline:0;border-color:var(--c,#ff7a3d)}
.krw-bytes{position:relative;display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:99px;background:var(--kdn-surface-2,#f3f2ef);font-size:12px;color:var(--kdn-muted,#8a8f99);font-variant-numeric:tabular-nums;overflow:hidden;white-space:nowrap}
.krw-bytes i{position:absolute;left:0;bottom:0;height:3px;width:var(--p);background:#16a34a}.krw-bytes b{color:var(--kdn-ink,#17181d);font-size:12.5px}
.krw-bytes.is-near i{background:#f59e0b}.krw-bytes.is-near b{color:#b45309}.krw-bytes.is-over{background:color-mix(in srgb,#dc2626 10%,transparent);color:#b42318;font-weight:700}.krw-bytes.is-over i{background:#dc2626}.krw-bytes.is-over b{color:#b42318}
.krw-bytes.sm{padding:2px 8px}
.krw-issues{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.krw-issues li{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;padding:6px 10px;border-radius:10px;font-size:12.5px}
.krw-issues li.is-block{background:color-mix(in srgb,#dc2626 8%,transparent)}.krw-issues li.is-warn{background:color-mix(in srgb,#f59e0b 12%,transparent)}
.krw-issues b{font-size:11px;padding:1px 7px;border-radius:99px;color:#fff}.krw-issues .is-block b{background:#dc2626}.krw-issues .is-warn b{background:#d97706}
.krw-issues .k{font-weight:700}.krw-issues code{padding:0 5px;border-radius:5px;background:var(--kdn-surface,#fff);font-family:inherit;font-weight:800}.krw-issues em{font-style:normal;font-weight:700}.krw-issues small{color:var(--kdn-ink-soft,#5b606b)}
.krw-ok{display:flex;align-items:center;gap:5px;margin:0;font-size:12.5px;font-weight:700;color:#15803d}
.krw-total{border:1.5px solid color-mix(in srgb,#ff7a3d 50%,var(--kdn-line,#e7e5e0));background:color-mix(in srgb,#ff7a3d 5%,var(--kdn-surface,#fff));--c:#ea580c}
.krw-total-tx{white-space:pre-wrap;padding:12px 14px;border-radius:12px;background:var(--kdn-surface,#fff);border:1px dashed color-mix(in srgb,#ff7a3d 40%,transparent);font-size:15px;line-height:1.85;word-break:keep-all}.krw-total-tx i{color:var(--kdn-muted,#8a8f99)}
.krw-copy{display:inline-flex;align-items:center;gap:4px;min-height:30px;padding:0 12px;border-radius:9px;border:0;background:#17181d;color:#fff;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.krw-acts{display:grid;gap:10px;padding:12px 14px;border-radius:18px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0)}
.krw-acts .hd{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}.krw-acts .hd b{font-size:14.5px;font-weight:800}.krw-acts .hd small{font-size:12px;color:var(--kdn-muted,#8a8f99)}
.krw-acts .list{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.krw-acts .chip{display:inline-flex;align-items:center;gap:2px;padding:3px 4px 3px 8px;border-radius:99px;background:color-mix(in srgb,var(--c) 10%,var(--kdn-surface,#fff));border:1.5px solid color-mix(in srgb,var(--c) 40%,transparent)}
.krw-acts .chip>i{width:8px;height:8px;border-radius:99px;background:var(--c);margin-right:4px}
.krw-acts .chip input{min-width:4em;border:0;background:transparent;font:inherit;font-size:13.5px;font-weight:800;color:color-mix(in srgb,var(--c) 75%,var(--kdn-ink,#000));outline:0}
.krw-acts .chip button,.krw-acts .hidden button{display:inline-grid;place-items:center;min-width:26px;height:26px;border:0;border-radius:99px;background:transparent;color:var(--kdn-muted,#8a8f99);font:inherit;cursor:pointer}
.krw-acts .add{display:inline-flex;gap:4px}.krw-acts .add input{min-height:34px;padding:0 12px;border-radius:99px;border:1.5px dashed var(--kdn-line,#d8d5ce);background:transparent;font:inherit;font-size:13px;color:inherit}
.krw-acts .add button{display:inline-flex;align-items:center;gap:3px;min-height:34px;padding:0 14px;border:0;border-radius:99px;background:#ff7a3d;color:#1b1006;font:inherit;font-size:13px;font-weight:800;cursor:pointer}
.krw-acts .hidden{font-size:12px;color:var(--kdn-muted,#8a8f99)}.krw-acts .hidden button{display:inline-flex;gap:3px;width:auto;padding:0 8px;font-size:12px}
.krw-side{position:sticky;top:70px;display:grid;gap:10px;align-content:start;max-height:calc(100vh - 90px);overflow:auto;padding:12px;border-radius:20px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0)}
.krw-side>header{display:flex;align-items:center;gap:6px}.krw-side .x{display:grid;place-items:center;width:32px;height:32px;margin-left:auto;border:0;border-radius:9px;background:var(--kdn-surface-2,#f3f2ef);color:var(--kdn-ink-soft,#5b606b);cursor:pointer}
.krw-side-tabs{display:flex;gap:2px;padding:3px;border-radius:11px;background:var(--kdn-surface-2,#f3f2ef)}
.krw-side-tabs button{display:inline-flex;align-items:center;gap:5px;min-height:32px;padding:0 11px;border:0;border-radius:9px;background:transparent;font:inherit;font-size:13px;font-weight:700;color:var(--kdn-ink-soft,#5b606b);cursor:pointer}
.krw-side-tabs button[aria-pressed="true"]{background:var(--kdn-surface,#fff);color:var(--kdn-ink,#17181d);box-shadow:0 1px 2px rgba(20,24,33,.12)}
.krw-side-tabs em{font-style:normal;padding:0 6px;border-radius:99px;background:#ff7a3d;color:#1b1006;font-size:11px}
.krw-side-note{margin:0;font-size:12px;line-height:1.5;color:var(--kdn-muted,#8a8f99)}.krw-side-empty{margin:6px 4px;font-size:12.5px;color:var(--kdn-muted,#8a8f99)}
.krw-memo{display:grid;gap:8px}.krw-memo textarea{width:100%;min-height:280px;box-sizing:border-box;resize:vertical;padding:12px;border-radius:12px;border:1.5px solid color-mix(in srgb,#ca8a04 35%,transparent);background:#fffbeb;color:#3f2d00;font:inherit;font-size:14px;line-height:1.75}
[data-kd-ui="dark"] .krw-memo textarea{background:#2a2414;color:#f5e7c0}
.krw-files{display:grid;gap:8px}.krw-files .up{display:flex;flex-wrap:wrap;gap:6px}
.krw-files ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}.krw-files li{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:10px;background:var(--kdn-surface-2,#f6f5f3)}
.krw-files li .nm{flex:1;min-width:0;display:inline-flex;align-items:center;gap:5px;border:0;background:transparent;font:inherit;font-size:13px;font-weight:700;color:#1d4ed8;text-align:left;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.krw-files li small{font-size:11px;color:var(--kdn-muted,#8a8f99)}.krw-files li .rm{display:grid;place-items:center;width:26px;height:26px;border:0;border-radius:8px;background:transparent;color:var(--kdn-muted,#8a8f99);cursor:pointer}
.krw-preview{display:grid;gap:6px;border-radius:14px;border:1px solid var(--kdn-line,#e7e5e0);overflow:hidden}
.krw-preview header{display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--kdn-surface-2,#f3f2ef);font-size:12.5px}.krw-preview header b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.krw-preview header button{display:grid;place-items:center;width:26px;height:26px;border:0;border-radius:8px;background:transparent;cursor:pointer;color:inherit}
.krw-preview iframe{width:100%;height:62vh;border:0;background:#fff}.krw-preview img{width:100%;height:auto;display:block}
.krw-table-wrap{overflow:auto;border-radius:18px;border:1px solid var(--kdn-line,#e7e5e0);background:var(--kdn-surface,#fff);max-height:calc(100vh - 220px)}
.krw-table{width:100%;min-width:900px;border-collapse:separate;border-spacing:0}
.krw-table th{position:sticky;top:0;z-index:2;padding:11px 8px;background:var(--kdn-surface,#fff);font-size:13.5px;font-weight:800;text-align:center;border-bottom:3px solid var(--c,var(--kdn-line,#e7e5e0));color:color-mix(in srgb,var(--c,#17181d) 75%,var(--kdn-ink,#000))}
.krw-table td{padding:8px;vertical-align:top;border-bottom:1px solid var(--kdn-line,#eeece7);min-width:240px}
.krw-table tbody tr:nth-child(even) td{background:color-mix(in srgb,var(--kdn-surface-2,#f6f5f3) 55%,var(--kdn-surface,#fff))}
.krw-table tbody tr:nth-child(even) td.nm{background:color-mix(in srgb,var(--kdn-surface-2,#f6f5f3) 55%,var(--kdn-surface,#fff))!important}
.krw-table td.n,.krw-table th.n{min-width:0;width:44px;text-align:center;font-variant-numeric:tabular-nums}
.krw-table td.nm,.krw-table th.nm{position:sticky;left:0;z-index:1;min-width:0;width:110px;background:var(--kdn-surface,#fff)!important;font-weight:800;font-size:13.5px;text-align:center;vertical-align:middle}
.krw-table th.nm{z-index:3}
.krw-table textarea{font-size:13.5px;line-height:1.65;padding:9px 10px}
.krw-table .cellft{display:flex;align-items:center;gap:6px;margin-top:4px}
.krw-table th.tot{--c:#ea580c}.krw-table td.tot{min-width:320px;background:color-mix(in srgb,#ff7a3d 5%,var(--kdn-surface,#fff))!important}
.krw-total-sm{white-space:pre-wrap;font-size:13px;line-height:1.7;max-height:12em;overflow:auto}.krw-total-sm i{color:var(--kdn-muted,#8a8f99)}
.krw-area{display:grid;gap:10px}
.krw-seg{position:sticky;top:64px;z-index:4;display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px;border-radius:16px;background:color-mix(in srgb,var(--kdn-surface,#fff) 94%,transparent);backdrop-filter:blur(8px);border:1px solid var(--kdn-line,#e7e5e0)}
.krw-seg>button:not(.krw-btn){display:inline-flex;align-items:center;gap:6px;min-height:38px;padding:0 14px;border-radius:99px;border:1.5px solid color-mix(in srgb,var(--c,#888) 35%,transparent);background:color-mix(in srgb,var(--c,#888) 7%,var(--kdn-surface,#fff));font:inherit;font-size:13.5px;font-weight:800;color:color-mix(in srgb,var(--c,#555) 80%,#000);cursor:pointer}
.krw-seg>button:not(.krw-btn) em{font-style:normal;font-size:11.5px;font-weight:700;opacity:.75}
.krw-seg>button[aria-pressed="true"]{background:var(--c,#ff7a3d);border-color:var(--c,#ff7a3d);color:#fff}.krw-seg>button[aria-pressed="true"] em{opacity:.9}
.krw-areacard{display:grid;gap:4px}.krw-total-line{display:flex;align-items:center;gap:8px;margin:0 6px;font-size:12.5px;font-weight:700;color:var(--kdn-muted,#8a8f99)}
.krw-modal{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:16px;background:rgba(15,18,26,.45)}
.krw-modal-box{display:grid;gap:10px;width:min(640px,100%);padding:18px;border-radius:20px;background:var(--kdn-surface,#fff);box-shadow:0 24px 60px rgba(15,23,42,.3)}
.krw-modal-box header{display:flex;align-items:center;justify-content:space-between}.krw-modal-box header b{display:inline-flex;align-items:center;gap:6px;font-size:16px;font-weight:800}
.krw-modal-box header button{display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:9px;background:var(--kdn-surface-2,#f3f2ef);cursor:pointer;color:inherit}
.krw-modal-box p{margin:0;font-size:13px;line-height:1.6;color:var(--kdn-ink-soft,#5b606b)}
.krw-modal-box textarea{min-height:220px;padding:12px;border-radius:12px;border:1.5px solid var(--kdn-line,#dcd9d2);font:inherit;font-size:13.5px;line-height:1.6;resize:vertical;background:var(--kdn-surface,#fff);color:inherit}
.krw-modal-box .ft{display:flex;align-items:center;gap:8px}.krw-modal-box .ft span{flex:1;font-size:13px}
[data-kd-ui="dark"] .krw-list>button.is-on{background:color-mix(in srgb,#ff7a3d 18%,transparent)}
[data-kd-ui="dark"] .krw-copy{background:#f4f3f0;color:#17181d}
@media (max-width:1280px){.krw-split.has-side{grid-template-columns:minmax(200px,230px) minmax(0,1fr)}.krw-split.has-side .krw-side{grid-column:1/-1;position:static;max-height:none}}
@media (max-width:980px){.krw-guide .steps{grid-template-columns:repeat(2,minmax(0,1fr))}.krw-guide .cols{grid-template-columns:minmax(0,1fr)}}
@media (max-width:860px){.krw-split,.krw-split.has-side{grid-template-columns:minmax(0,1fr)}.krw-list{position:static;max-height:240px}.krw-side{position:static}.krw-head{padding:14px}.krw-tabs{width:100%}.krw-tabs button{flex:1}.krw-tabs button small{display:none}.krw-bar{position:static}.krw-seg{top:0}.krw-guide .steps{grid-template-columns:minmax(0,1fr)}}
@media print{.krw{display:none}}
`;
