// 생기부 업무: 학급담임(자율·자치 / 진로 / 행발)과 교과담임(반·분반별 과세특, 수행평가 활동별 → 총합본).
// 저장은 학생·칸 하나씩 서버 기록에 합쳐 넣어(동시에 여러 선생님이 써도 서로 덮어쓰지 않게) 하고,
// 저장 전 글은 이 브라우저에도 바로 보관해 새로고침·끊김에도 남게 합니다. 서버는 덮어쓸 때 이전 본을 자동 백업합니다.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookOpen, Check, ChevronLeft, ChevronRight, CloudOff, Copy, Download, Eye, EyeOff, FileSpreadsheet, LayoutGrid, Loader2, Plus, Printer, RotateCcw, Rows3, Save, Search, Table2, Trash2, Users } from "lucide-react";
import { readStorage, updateStorage } from "./storage.js";
import { schoolYearOf } from "./curriculum.js";
import { booksForAssignment } from "./lessonStamps.js";
import { neisBytes, charCount, RECORD_AREAS, HOMEROOM_AREAS, mergeActivities, checkRecordText, issueSummary } from "./recordText.js";

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
    if (path === "acts") { const ids = new Set(entry.value.map(act => act.id)); next.activities = [...entry.value, ...(doc?.activities || []).filter(act => !ids.has(act.id))]; return; }
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

  // 창을 닫기 전 저장 안 된 글이 있으면 묻습니다.
  useEffect(() => {
    const onLeave = event => { if (Object.keys(pendingRef.current).length) { save(); event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [save]);

  return { doc, loaded: doc != null, pending, status, error, savedAt, save, edit, textOf, metaOf, activities };
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

function Field({ label, text, limit, onChange, check, rows = 6, readOnly = false, meta, hint = "" }) {
  return <div className="krw-field">
    <div className="krw-field-hd"><b>{label}</b>{meta?.at && <small>{meta.by ? `${meta.by} · ` : ""}{new Date(meta.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small>}<ByteMeter text={text} limit={limit} /></div>
    <textarea value={text} rows={rows} readOnly={readOnly} spellCheck={false} onChange={event => onChange?.(event.target.value)} placeholder={readOnly ? "" : `${hint || label} 내용을 적어 주세요. 자동으로 저장돼요.`} />
    {check && <IssueList text={text} />}
  </div>;
}

const VIEWS = [["student", "학생별", "명단에서 학생을 골라 한 명씩", Rows3], ["table", "한눈에 표", "반 전체를 표로 보며 바로 고치기", Table2], ["area", "영역별 몰아쓰기", "한 영역을 반 전체 학생 차례로", LayoutGrid]];

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

// ── 학급담임 ───────────────────────────────────────────────────────────────
function HomeroomWriter({ year, grade, classOptions, rosterFor, by, view, check, showToast }) {
  const [cls, setCls] = useState(() => classOptions[0] || "");
  useEffect(() => { if (!classOptions.includes(cls)) setCls(classOptions[0] || ""); }, [classOptions.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const students = useMemo(() => Object.entries(rosterFor(grade) || {}).filter(([, info]) => String(info?.class) === String(cls)).map(([sid, info]) => ({ sid, name: info?.name || "", number: Number(info?.number) || Number(String(sid).slice(-2)) })).sort((a, b) => a.number - b.number), [rosterFor, grade, cls]);
  const rec = useRecordDoc(cls ? hrKey(year, grade, cls) : "", by);
  const [sid, setSid] = useState("");
  const [area, setArea] = useState("autonomy");
  const [find, setFind] = useState("");
  useEffect(() => { if (!students.some(s => s.sid === sid)) setSid(students[0]?.sid || ""); }, [students]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = students.find(s => s.sid === sid);
  const idx = students.findIndex(s => s.sid === sid);
  const shown = students.filter(s => !find.trim() || s.name.includes(find.trim()) || s.sid.includes(find.trim()) || String(s.number) === find.trim());
  const filled = s => HOMEROOM_AREAS.filter(key => rec.textOf(s.sid, key).trim()).length;

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
      <span className="sp" />
      <SaveBadge rec={rec} />
      <button type="button" data-kdn-bare className="krw-btn pri" onClick={async () => { if (await rec.save()) showToast?.("저장했어요.", "success"); }} disabled={!Object.keys(rec.pending).length || rec.status === "saving"}><Save size={15} /> 지금 저장</button>
      <PrintMenu onPick={output} scopes={[["student", "지금 학생"], ["class", `${cls}반 전체`]]} />
      <button type="button" data-kdn-bare className="krw-btn" title="이 반 자료를 파일로 내려받아 따로 보관" onClick={() => downloadJson(`생기부_${grade}-${cls}_${new Date().toISOString().slice(0, 10)}.json`, rec.doc)}><Download size={15} /> 백업 파일</button>
    </div>
    {rec.error && <p className="krw-alert"><AlertTriangle size={15} /> {rec.error}</p>}
    {!rec.loaded ? <div className="krw-empty"><Loader2 size={18} className="spin" /> 불러오는 중이에요.</div>
      : !students.length ? <div className="krw-empty"><Users size={20} /><b>{cls}반 명단이 없어요.</b><span>관리자 화면에서 {grade}학년 명단을 올려 주세요.</span></div>
      : view === "table" ? <div className="krw-table-wrap"><table className="krw-table"><thead><tr><th className="n">번호</th><th className="nm">이름</th>{HOMEROOM_AREAS.map(key => <th key={key}>{RECORD_AREAS[key].label}</th>)}</tr></thead>
        <tbody>{students.map(s => <tr key={s.sid}><td className="n">{s.number}</td><td className="nm">{s.name}</td>{HOMEROOM_AREAS.map(key => { const text = rec.textOf(s.sid, key); return <td key={key}><textarea rows={4} value={text} spellCheck={false} onChange={event => rec.edit(`s|${s.sid}|${key}`, event.target.value)} /><div className="cellft"><ByteMeter text={text} limit={RECORD_AREAS[key].limit} />{check && <IssueDot text={text} />}</div></td>; })}</tr>)}</tbody></table></div>
      : view === "area" ? <div className="krw-area">
        <div className="krw-seg">{HOMEROOM_AREAS.map(key => <button key={key} type="button" data-kdn-bare aria-pressed={area === key} onClick={() => setArea(key)}>{RECORD_AREAS[key].label}</button>)}</div>
        {students.map(s => <Field key={s.sid} label={`${s.number}번 ${s.name}`} hint={RECORD_AREAS[area].label} text={rec.textOf(s.sid, area)} limit={RECORD_AREAS[area].limit} check={check} rows={4} meta={rec.metaOf(s.sid, area)} onChange={value => rec.edit(`s|${s.sid}|${area}`, value)} />)}
      </div>
      : <div className="krw-split">
        <nav className="krw-list">
          <label className="krw-find"><Search size={14} /><input value={find} onChange={event => setFind(event.target.value)} placeholder="이름·번호 찾기" /></label>
          {shown.map(s => <button key={s.sid} type="button" data-kdn-bare className={s.sid === sid ? "is-on" : ""} onClick={() => setSid(s.sid)}>
            <span className="no">{s.number}</span><span className="nm">{s.name}</span><span className="fill">{[0, 1, 2].map(i => <i key={i} className={i < filled(s) ? "on" : ""} />)}</span>
            {check && <IssueDot text={HOMEROOM_AREAS.map(key => rec.textOf(s.sid, key)).join("\n")} />}
          </button>)}
        </nav>
        {current && <section className="krw-pane">
          <header className="krw-pane-hd"><button type="button" data-kdn-bare disabled={idx <= 0} onClick={() => setSid(students[idx - 1]?.sid)} aria-label="이전 학생"><ChevronLeft size={18} /></button><div><b>{current.number}번 {current.name}</b><small>{current.sid}</small></div><button type="button" data-kdn-bare disabled={idx >= students.length - 1} onClick={() => setSid(students[idx + 1]?.sid)} aria-label="다음 학생"><ChevronRight size={18} /></button></header>
          {HOMEROOM_AREAS.map(key => <Field key={key} label={RECORD_AREAS[key].label} text={rec.textOf(current.sid, key)} limit={RECORD_AREAS[key].limit} check={check} rows={key === "career" ? 8 : 6} meta={rec.metaOf(current.sid, key)} onChange={value => rec.edit(`s|${current.sid}|${key}`, value)} />)}
        </section>}
      </div>}
  </div>;
}

// ── 교과담임 ───────────────────────────────────────────────────────────────
function ActivityManager({ activities, onChange }) {
  const [name, setName] = useState("");
  const live = activities.filter(act => !act.removed);
  const hidden = activities.filter(act => act.removed);
  const add = () => { const value = name.trim(); if (!value) return; onChange([...activities, { id: uid(), name: value }]); setName(""); };
  return <div className="krw-acts">
    <b>수행평가 영역(활동)</b>
    <div className="list">{live.map((act, index) => <span key={act.id} className="chip">
      <input value={act.name} aria-label="활동 이름" onChange={event => onChange(activities.map(item => item.id === act.id ? { ...item, name: event.target.value } : item))} />
      <button type="button" data-kdn-bare title="앞으로" disabled={index === 0} onClick={() => { const order = live.map(a => a.id); [order[index - 1], order[index]] = [order[index], order[index - 1]]; onChange([...order.map(id => activities.find(a => a.id === id)), ...hidden]); }}>‹</button>
      <button type="button" data-kdn-bare title="숨기기(글은 지워지지 않아요)" onClick={() => onChange(activities.map(item => item.id === act.id ? { ...item, removed: true } : item))}><Trash2 size={12} /></button>
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
  useEffect(() => { if (!students.some(s => s.sid === sid)) setSid(students[0]?.sid || ""); }, [students]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!acts.some(a => a.id === actId)) setActId(acts[0]?.id || ""); }, [acts.map(a => a.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const texts = s => Object.fromEntries(acts.map(act => [act.id, rec.textOf(s.sid, act.id)]));
  const totalOf = s => mergeActivities(acts, texts(s));
  const current = students.find(s => s.sid === sid);
  const idx = students.findIndex(s => s.sid === sid);
  const shown = students.filter(s => !find.trim() || s.name.includes(find.trim()) || s.sid.includes(find.trim()));
  const who = s => book?.kind === "common" ? `${s.number}번 ${s.name}` : `${s.class}반 ${s.number}번 ${s.name}`;

  const blocksFor = (list, b, rd) => list.map(s => {
    const actList = (rd.activities || []).filter(act => !act.removed);
    const t = Object.fromEntries(actList.map(act => [act.id, rd.textOf(s.sid, act.id)]));
    const total = mergeActivities(actList, t);
    return { head: `${b.subject} · ${b.label} · ${who(s)}`, sub: s.sid, parts: [{ label: "과세특 총합본", text: total, bytes: neisBytes(total), limit, issues: issueLine(total) }, ...actList.map(act => ({ label: `└ ${act.name}`, text: t[act.id], bytes: neisBytes(t[act.id]), limit, minor: true }))] };
  });
  const [busy, setBusy] = useState(false);
  const output = async (scope, kind) => {
    if (!book) return;
    let targets = [];
    if (scope === "student") targets = current ? [{ b: book, rd: rec, list: [current] }] : [];
    else if (scope === "class") targets = [{ b: book, rd: rec, list: students }];
    else {
      // 담당 반·분반 전체: 다른 반 자료는 서버에서 읽어 옵니다.
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
      <span className="sp" />
      <SaveBadge rec={rec} />
      <button type="button" data-kdn-bare className="krw-btn pri" onClick={async () => { if (await rec.save()) showToast?.("저장했어요.", "success"); }} disabled={!Object.keys(rec.pending).length || rec.status === "saving"}><Save size={15} /> 지금 저장</button>
      <PrintMenu busy={busy} onPick={output} scopes={[["student", "지금 학생"], ["class", `${book?.label || "이 반"} 전체`], ["all", "담당 반 전체"]]} />
      <button type="button" data-kdn-bare className="krw-btn" title="이 반 자료를 파일로 내려받아 따로 보관" onClick={() => downloadJson(`과세특_${book?.subject}_${book?.target}_${new Date().toISOString().slice(0, 10)}.json`, rec.doc)}><Download size={15} /> 백업 파일</button>
    </div>
    {rec.error && <p className="krw-alert"><AlertTriangle size={15} /> {rec.error}</p>}
    {rec.loaded && <ActivityManager activities={rec.activities} onChange={list => rec.edit("acts", list)} />}
    {!rec.loaded ? <div className="krw-empty"><Loader2 size={18} className="spin" /> 불러오는 중이에요.</div>
      : !acts.length ? <div className="krw-empty"><b>먼저 수행평가 영역(활동)을 추가해 주세요.</b><span>활동별로 나눠 쓰면 총합본이 줄을 바꿔 자동으로 합쳐져요.</span></div>
      : view === "table" ? <div className="krw-table-wrap"><table className="krw-table"><thead><tr><th className="nm">학생</th>{acts.map(act => <th key={act.id}>{act.name}</th>)}<th className="tot">총합본</th></tr></thead>
        <tbody>{students.map(s => { const total = totalOf(s); return <tr key={s.sid}><td className="nm">{who(s)}</td>{acts.map(act => { const text = rec.textOf(s.sid, act.id); return <td key={act.id}><textarea rows={4} value={text} spellCheck={false} onChange={event => rec.edit(`s|${s.sid}|${act.id}`, event.target.value)} /><div className="cellft"><span className="krw-bytes sm"><b>{neisBytes(text).toLocaleString()}</b> byte</span></div></td>; })}
          <td className="tot"><div className="krw-total-sm">{total || <i>비어 있음</i>}</div><div className="cellft"><ByteMeter text={total} limit={limit} />{check && <IssueDot text={total} />}</div></td></tr>; })}</tbody></table></div>
      : view === "area" ? <div className="krw-area">
        <div className="krw-seg">{acts.map(act => <button key={act.id} type="button" data-kdn-bare aria-pressed={actId === act.id} onClick={() => setActId(act.id)}>{act.name}</button>)}</div>
        {students.map(s => { const total = totalOf(s); return <div key={s.sid} className="krw-areacard"><Field label={who(s)} hint={acts.find(a => a.id === actId)?.name || "활동"} text={rec.textOf(s.sid, actId)} limit={limit} check={check} rows={3} meta={rec.metaOf(s.sid, actId)} onChange={value => rec.edit(`s|${s.sid}|${actId}`, value)} /><p className="krw-total-line">총합본 <ByteMeter text={total} limit={limit} /></p></div>; })}
      </div>
      : <div className="krw-split">
        <nav className="krw-list">
          <label className="krw-find"><Search size={14} /><input value={find} onChange={event => setFind(event.target.value)} placeholder="이름·학번 찾기" /></label>
          {shown.map(s => { const total = totalOf(s); return <button key={s.sid} type="button" data-kdn-bare className={s.sid === sid ? "is-on" : ""} onClick={() => setSid(s.sid)}>
            <span className="no">{book.kind === "common" ? s.number : `${s.class}-${s.number}`}</span><span className="nm">{s.name}</span><span className={`b${neisBytes(total) > limit ? " over" : ""}`}>{neisBytes(total) ? neisBytes(total).toLocaleString() : "-"}</span>
            {check && <IssueDot text={total} />}
          </button>; })}
        </nav>
        {current && <section className="krw-pane">
          <header className="krw-pane-hd"><button type="button" data-kdn-bare disabled={idx <= 0} onClick={() => setSid(students[idx - 1]?.sid)} aria-label="이전 학생"><ChevronLeft size={18} /></button><div><b>{who(current)}</b><small>{current.sid} · {book.subject}</small></div><button type="button" data-kdn-bare disabled={idx >= students.length - 1} onClick={() => setSid(students[idx + 1]?.sid)} aria-label="다음 학생"><ChevronRight size={18} /></button></header>
          {acts.map(act => <Field key={act.id} label={act.name} text={rec.textOf(current.sid, act.id)} limit={limit} check={check} rows={4} meta={rec.metaOf(current.sid, act.id)} onChange={value => rec.edit(`s|${current.sid}|${act.id}`, value)} />)}
          {(() => { const total = totalOf(current); return <div className="krw-total">
            <div className="krw-field-hd"><b>과세특 총합본</b><small>활동마다 줄을 바꿔 합쳐요</small><ByteMeter text={total} limit={limit} /><button type="button" data-kdn-bare className="krw-copy" onClick={async () => { try { await navigator.clipboard.writeText(total); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { showToast?.("복사하지 못했어요.", "error"); } }}><Copy size={13} /> {copied ? "복사됨" : "복사"}</button></div>
            <div className="krw-total-tx">{total || <i>활동별 글을 쓰면 여기에 합쳐져요.</i>}</div>
            {check && <IssueList text={total} />}
          </div>; })()}
        </section>}
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
  // 관리자는 볼 선생님을 골라 교과 세특을 확인합니다.
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
  const pick = (setter, storageKey) => value => { setter(value); try { localStorage.setItem(storageKey, value); } catch { /* 선택 기억은 편의 기능 */ } };

  return <div className="krw">
    <style>{CSS}</style>
    <header className="krw-head">
      <div className="t"><b>생기부 업무</b><small>칸마다 자동 저장 · 나이스 바이트 계산 · 2026 기재요령 점검</small></div>
      <div className="krw-tabs" role="tablist">{tabs.map(([key, label, sub]) => <button key={key} type="button" data-kdn-bare role="tab" aria-selected={tab === key} onClick={() => pick(setTab, "kd_rec_tab_v1")(key)}><b>{label}</b><small>{sub}</small></button>)}</div>
    </header>
    {tab !== "legacy" && <div className="krw-opts">
      <div className="krw-views" role="group" aria-label="보는 형태">{VIEWS.map(([key, label, sub, Icon]) => <button key={key} type="button" data-kdn-bare aria-pressed={view === key} title={sub} onClick={() => pick(setView, VIEW_KEY)(key)}><Icon size={15} /> {label}</button>)}</div>
      <button type="button" data-kdn-bare className={`krw-check${check ? " is-on" : ""}`} aria-pressed={check} onClick={() => setCheck(value => !value)}>{check ? <Eye size={15} /> : <EyeOff size={15} />} 기재요령 점검 {check ? "켜짐" : "꺼짐"}</button>
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
.krw-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 18px;padding:16px 18px;border-radius:22px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0)}
.krw-head .t{display:grid;gap:2px}.krw-head .t b{font-size:20px;font-weight:800;letter-spacing:-.02em}.krw-head .t small{font-size:13px;color:var(--kdn-muted,#8a8f99)}
.krw-tabs{display:flex;gap:4px;padding:4px;border-radius:16px;background:var(--kdn-surface-2,#f3f2ef)}
.krw-tabs button{display:grid;gap:1px;justify-items:start;padding:8px 16px;border:0;border-radius:12px;background:transparent;font:inherit;color:var(--kdn-ink-soft,#5b606b);cursor:pointer;text-align:left}
.krw-tabs button b{font-size:14.5px;font-weight:800}.krw-tabs button small{font-size:11.5px;color:var(--kdn-muted,#8a8f99)}
.krw-tabs button[aria-selected="true"]{background:var(--kdn-surface,#fff);color:var(--kdn-ink,#17181d);box-shadow:0 1px 3px rgba(20,24,33,.12)}
.krw-tabs button[aria-selected="true"] b{color:var(--kdn-accent-text,#c2410c)}
.krw-opts{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.krw-views{display:flex;gap:2px;padding:3px;border-radius:12px;background:var(--kdn-surface-2,#f3f2ef)}
.krw-views button,.krw-check,.krw-btn,.krw-menu>button{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 13px;border:0;border-radius:10px;background:transparent;font:inherit;font-size:13.5px;font-weight:700;color:var(--kdn-ink-soft,#5b606b);cursor:pointer;white-space:nowrap}
.krw-views button[aria-pressed="true"]{background:var(--kdn-surface,#fff);color:var(--kdn-ink,#17181d);box-shadow:0 1px 2px rgba(20,24,33,.12)}
.krw-check{border:1px solid var(--kdn-line,#e7e5e0);background:var(--kdn-surface,#fff)}.krw-check.is-on{border-color:color-mix(in srgb,#16a34a 40%,transparent);color:#15803d;background:color-mix(in srgb,#16a34a 8%,var(--kdn-surface,#fff))}
.krw-teacher,.krw-bar select{min-height:38px;padding:0 12px;border-radius:10px;border:1px solid var(--kdn-line,#e7e5e0);background:var(--kdn-surface,#fff);color:inherit;font:inherit;font-size:14px;font-weight:700;max-width:100%}
.krw-body{display:grid;gap:12px}
.krw-bar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;border-radius:16px;background:color-mix(in srgb,var(--kdn-surface,#fff) 92%,transparent);backdrop-filter:blur(8px);border:1px solid var(--kdn-line,#e7e5e0)}
.krw-bar .sp{flex:1}.krw-scope{font-size:15px;font-weight:800}
.krw-tag{padding:3px 9px;border-radius:99px;background:color-mix(in srgb,#2563eb 10%,transparent);color:#1d4ed8;font-size:12px;font-weight:700}
.krw-btn{border:1px solid var(--kdn-line,#e7e5e0);background:var(--kdn-surface,#fff)}.krw-btn.pri{border-color:transparent;background:#17181d;color:#fff}.krw-btn:disabled{opacity:.45;cursor:default}
.krw-menu{position:relative}.krw-menu>button{border:1px solid var(--kdn-line,#e7e5e0);background:var(--kdn-surface,#fff)}
.krw-menu-pop{position:absolute;right:0;top:calc(100% + 6px);z-index:30;display:grid;gap:6px;min-width:300px;padding:12px;border-radius:16px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0);box-shadow:0 18px 40px rgba(20,24,33,.18)}
.krw-menu-pop .row{display:flex;align-items:center;gap:6px}.krw-menu-pop .row span{flex:1;font-size:13.5px;font-weight:700}
.krw-menu-pop .row button{display:inline-flex;align-items:center;gap:4px;min-height:32px;padding:0 10px;border-radius:9px;border:1px solid var(--kdn-line,#e7e5e0);background:var(--kdn-surface-2,#f6f5f3);font:inherit;font-size:12.5px;font-weight:700;color:inherit;cursor:pointer}
.krw-menu-pop small{font-size:11.5px;color:var(--kdn-muted,#8a8f99)}
.krw-save{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:700;white-space:nowrap}
.krw-save.is-ok{color:#15803d}.krw-save.is-busy,.krw-save.is-load{color:var(--kdn-muted,#8a8f99)}.krw-save.is-dirty{color:#b45309}.krw-save.is-err{color:#b42318}
.krw-alert{display:flex;align-items:center;gap:8px;margin:0;padding:10px 14px;border-radius:14px;background:color-mix(in srgb,#dc2626 9%,var(--kdn-surface,#fff));color:#b42318;font-size:13.5px;font-weight:700}
.krw-empty{display:grid;justify-items:center;gap:6px;padding:40px 18px;border-radius:20px;border:1.5px dashed var(--kdn-line,#e2dfd8);color:var(--kdn-muted,#8a8f99);text-align:center}.krw-empty b{color:var(--kdn-ink,#17181d);font-size:15px}.krw-empty span{font-size:13px}
.krw-split{display:grid;grid-template-columns:minmax(220px,260px) minmax(0,1fr);gap:14px;align-items:start}
.krw-list{position:sticky;top:64px;display:grid;gap:2px;max-height:calc(100vh - 160px);overflow:auto;padding:8px;border-radius:20px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0)}
.krw-find{display:flex;align-items:center;gap:6px;margin-bottom:4px;padding:0 10px;border-radius:12px;background:var(--kdn-surface-2,#f3f2ef);color:var(--kdn-muted,#8a8f99)}
.krw-find input{flex:1;min-width:0;min-height:36px;border:0;outline:0;background:transparent;font:inherit;font-size:13.5px;color:var(--kdn-ink,#17181d)}
.krw-list>button{display:flex;align-items:center;gap:8px;min-height:42px;padding:0 10px;border:0;border-radius:12px;background:transparent;font:inherit;color:inherit;text-align:left;cursor:pointer}
.krw-list>button:hover{background:var(--kdn-surface-2,#f6f5f3)}.krw-list>button.is-on{background:#17181d;color:#fff}
.krw-list .no{width:34px;font-size:12.5px;color:var(--kdn-muted,#8a8f99);font-variant-numeric:tabular-nums}.krw-list>button.is-on .no{color:#ffb089}
.krw-list .nm{flex:1;min-width:0;font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.krw-list .fill{display:flex;gap:3px}.krw-list .fill i{width:7px;height:7px;border-radius:99px;background:var(--kdn-line,#dcd9d2)}.krw-list .fill i.on{background:#ff7a3d}
.krw-list .b{font-size:12px;font-weight:700;color:var(--kdn-muted,#8a8f99);font-variant-numeric:tabular-nums}.krw-list .b.over{color:#dc2626}
.krw-dot{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;border-radius:99px;font-size:11px;font-weight:800;font-style:normal}.krw-dot.is-block{background:#dc2626;color:#fff}.krw-dot.is-warn{background:#f59e0b;color:#1b1006}
.krw-pane{display:grid;gap:12px;min-width:0}
.krw-pane-hd{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:18px;background:linear-gradient(135deg,#1c1d24,#2b2621);color:#fff}
.krw-pane-hd div{flex:1;display:grid}.krw-pane-hd b{font-size:18px;font-weight:800}.krw-pane-hd small{font-size:12px;color:#cfccc5}
.krw-pane-hd button{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;border:0;background:rgba(255,255,255,.1);color:#fff;cursor:pointer}.krw-pane-hd button:disabled{opacity:.3}
.krw-field,.krw-total{display:grid;gap:6px;padding:14px 16px;border-radius:18px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0)}
.krw-field-hd{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}.krw-field-hd b{font-size:15px;font-weight:800}.krw-field-hd small{font-size:12px;color:var(--kdn-muted,#8a8f99)}
.krw-field-hd .krw-bytes{margin-left:auto}
.krw-field textarea,.krw-table textarea{width:100%;box-sizing:border-box;resize:vertical;padding:10px 12px;border-radius:12px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface-2,#fbfaf8);color:var(--kdn-ink,#17181d);font:inherit;font-size:14.5px;line-height:1.75;word-break:keep-all}
.krw-field textarea:focus,.krw-table textarea:focus{outline:2px solid color-mix(in srgb,#ff7a3d 55%,transparent);outline-offset:1px;background:var(--kdn-surface,#fff)}
.krw-bytes{position:relative;display:inline-flex;align-items:center;gap:4px;padding:3px 10px 3px 10px;border-radius:99px;background:var(--kdn-surface-2,#f3f2ef);font-size:12px;color:var(--kdn-muted,#8a8f99);font-variant-numeric:tabular-nums;overflow:hidden;white-space:nowrap}
.krw-bytes i{position:absolute;left:0;bottom:0;height:2px;width:var(--p);background:#16a34a}.krw-bytes b{color:var(--kdn-ink,#17181d);font-size:12.5px}
.krw-bytes.is-near i{background:#f59e0b}.krw-bytes.is-near b{color:#b45309}.krw-bytes.is-over{background:color-mix(in srgb,#dc2626 10%,transparent);color:#b42318;font-weight:700}.krw-bytes.is-over i{background:#dc2626}.krw-bytes.is-over b{color:#b42318}
.krw-bytes.sm{padding:2px 8px}
.krw-issues{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.krw-issues li{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;padding:6px 10px;border-radius:10px;font-size:12.5px}
.krw-issues li.is-block{background:color-mix(in srgb,#dc2626 8%,transparent)}.krw-issues li.is-warn{background:color-mix(in srgb,#f59e0b 12%,transparent)}
.krw-issues b{font-size:11px;padding:1px 7px;border-radius:99px;color:#fff}.krw-issues .is-block b{background:#dc2626}.krw-issues .is-warn b{background:#d97706}
.krw-issues .k{font-weight:700}.krw-issues code{padding:0 5px;border-radius:5px;background:var(--kdn-surface,#fff);font-family:inherit;font-weight:800}.krw-issues em{font-style:normal;font-weight:700}.krw-issues small{color:var(--kdn-ink-soft,#5b606b)}
.krw-ok{display:flex;align-items:center;gap:5px;margin:0;font-size:12.5px;font-weight:700;color:#15803d}
.krw-total{border:1.5px solid color-mix(in srgb,#ff7a3d 45%,var(--kdn-line,#e7e5e0));background:color-mix(in srgb,#ff7a3d 5%,var(--kdn-surface,#fff))}
.krw-total-tx{white-space:pre-wrap;font-size:14.5px;line-height:1.8;word-break:keep-all}.krw-total-tx i{color:var(--kdn-muted,#8a8f99)}
.krw-copy{display:inline-flex;align-items:center;gap:4px;min-height:30px;padding:0 10px;border-radius:9px;border:1px solid var(--kdn-line,#e7e5e0);background:var(--kdn-surface,#fff);font:inherit;font-size:12.5px;font-weight:700;color:inherit;cursor:pointer}
.krw-acts{display:grid;gap:8px;padding:12px 14px;border-radius:18px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0)}
.krw-acts>b{font-size:14px;font-weight:800}.krw-acts .list{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.krw-acts .chip{display:inline-flex;align-items:center;gap:2px;padding:2px 4px 2px 10px;border-radius:99px;background:var(--kdn-surface-2,#f3f2ef)}
.krw-acts .chip input{width:9em;min-width:4em;border:0;background:transparent;font:inherit;font-size:13.5px;font-weight:700;color:inherit;outline:0}
.krw-acts .chip button,.krw-acts .hidden button{display:inline-grid;place-items:center;min-width:26px;height:26px;border:0;border-radius:99px;background:transparent;color:var(--kdn-muted,#8a8f99);font:inherit;cursor:pointer}
.krw-acts .add{display:inline-flex;gap:4px}.krw-acts .add input{min-height:32px;padding:0 10px;border-radius:99px;border:1px dashed var(--kdn-line,#d8d5ce);background:transparent;font:inherit;font-size:13px;color:inherit}
.krw-acts .add button{display:inline-flex;align-items:center;gap:3px;min-height:32px;padding:0 12px;border:0;border-radius:99px;background:#17181d;color:#fff;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.krw-acts .hidden{font-size:12px;color:var(--kdn-muted,#8a8f99)}.krw-acts .hidden button{display:inline-flex;gap:3px;width:auto;padding:0 8px;font-size:12px}
.krw-table-wrap{overflow:auto;border-radius:18px;border:1px solid var(--kdn-line,#e7e5e0);background:var(--kdn-surface,#fff);max-height:calc(100vh - 220px)}
.krw-table{width:100%;min-width:900px;border-collapse:separate;border-spacing:0}
.krw-table th{position:sticky;top:0;z-index:2;padding:10px 8px;background:var(--kdn-surface-2,#f3f2ef);font-size:13px;font-weight:800;text-align:center;border-bottom:1px solid var(--kdn-line,#e7e5e0)}
.krw-table td{padding:8px;vertical-align:top;border-bottom:1px solid var(--kdn-line-soft,#f0eee9);min-width:240px}
.krw-table td.n,.krw-table th.n{min-width:0;width:44px;text-align:center;font-variant-numeric:tabular-nums}
.krw-table td.nm,.krw-table th.nm{position:sticky;left:0;z-index:1;min-width:0;width:110px;background:var(--kdn-surface,#fff);font-weight:800;font-size:13.5px}
.krw-table th.nm{z-index:3;background:var(--kdn-surface-2,#f3f2ef)}
.krw-table textarea{font-size:13.5px;line-height:1.65}
.krw-table .cellft{display:flex;align-items:center;gap:6px;margin-top:4px}
.krw-table td.tot{min-width:320px;background:color-mix(in srgb,#ff7a3d 4%,var(--kdn-surface,#fff))}
.krw-total-sm{white-space:pre-wrap;font-size:13px;line-height:1.7;max-height:12em;overflow:auto}.krw-total-sm i{color:var(--kdn-muted,#8a8f99)}
.krw-area{display:grid;gap:10px}
.krw-seg{position:sticky;top:64px;z-index:4;display:flex;flex-wrap:wrap;gap:6px;padding:6px;border-radius:14px;background:color-mix(in srgb,var(--kdn-surface,#fff) 92%,transparent);backdrop-filter:blur(8px)}
.krw-seg button{min-height:36px;padding:0 14px;border:0;border-radius:99px;background:var(--kdn-surface-2,#f3f2ef);font:inherit;font-size:13.5px;font-weight:700;color:var(--kdn-ink-soft,#5b606b);cursor:pointer}
.krw-seg button[aria-pressed="true"]{background:#17181d;color:#fff}
.krw-areacard{display:grid;gap:4px}.krw-total-line{display:flex;align-items:center;gap:8px;margin:0 6px;font-size:12.5px;font-weight:700;color:var(--kdn-muted,#8a8f99)}
[data-kd-ui="dark"] .krw-btn.pri,[data-kd-ui="dark"] .krw-list>button.is-on,[data-kd-ui="dark"] .krw-seg button[aria-pressed="true"],[data-kd-ui="dark"] .krw-acts .add button{background:#f4f3f0;color:#17181d}
@media (max-width:860px){.krw-split{grid-template-columns:minmax(0,1fr)}.krw-list{position:static;max-height:240px}.krw-head{padding:14px}.krw-tabs{width:100%}.krw-tabs button{flex:1}.krw-tabs button small{display:none}.krw-bar{position:static}.krw-seg{top:0}}
@media print{.krw{display:none}}
`;
