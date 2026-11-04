// 생기부 업무: 학급담임(자율·자치 / 진로 / 행발)과 교과담임(반·분반별 과세특, 수행평가 활동별 → 총합본).
// 저장은 학생·칸 하나씩 서버 기록에 합쳐 넣어(동시에 여러 선생님이 써도 서로 덮어쓰지 않게) 하고,
// 저장 전 글은 이 브라우저에도 바로 보관해 새로고침·끊김에도 남게 합니다. 서버는 덮어쓸 때 이전 본을 자동 백업합니다.
import { createPortal } from "react-dom";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
// 조회 전용(부서 공용 계정): 글을 보기만 하고 저장하지 않습니다.
const ReadOnlyContext = createContext(false);
import { CalendarCheck, MessageSquareText, AlertTriangle, BookOpen, Check, ChevronLeft, ChevronRight, ClipboardPaste, CloudOff, Copy, Download, ExternalLink, Eye, EyeOff, FileSpreadsheet, FileText, HelpCircle, LayoutGrid, ListChecks, Loader2, Sparkles, PanelRightClose, PanelRightOpen, Paperclip, Plus, Printer, RotateCcw, Rows3, Save, Search, Table2, Trash2, Users, Wand2, X } from "lucide-react";
import { readStorage, updateStorage, uploadClassroomAttachment } from "./storage.js";
import { schoolYearOf } from "./curriculum.js";
import { booksForAssignment } from "./lessonStamps.js";
import { loadExamples, exampleGroupFor, examplesFor, EXAMPLE_GROUPS } from "./sehtukExamples.js";
import { loadStandards, matchStandardSubject, resolveStandardSubject, findStandards, standardLine } from "./standards2022.js";
import TourGuide from "./TourGuide.jsx";
import { neisBytes, charCount, RECORD_AREAS, HOMEROOM_AREAS, mergeActivities, checkRecordText, issueSummary, autoFixRecordText, parsePastedRows, parseCheckSheet, parseEventSheets, parseNeisRecordSheets, lineBreakEvents, areaLimit, RECORD_GUIDE, splitSentences, findDuplicateSentences, buildAiPrompt } from "./recordText.js";

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
  const readOnly = useContext(ReadOnlyContext);
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
    if (readOnly) return;
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
// 점검용 인쇄: 학생마다 한 줄(표), 확인 칸 · 번호·이름 · 글 · 바이트. 빈 칸은 '미작성' 한 줄, 점검 결과는 걸릴 때만.
// blocks: [{ group, no, name, sub, parts: [{ label, text, bytes, limit, issues, lines?: [{ tag, text }] }] }]
// 인쇄: 첫 장은 반 전체 요약표, 이어서 학생마다 한 장(영역별 글 · 바이트 막대 · 점검 내용 · 확인란)
function printRecords({ title, subtitle, blocks }) {
  const win = window.open("", "_blank");
  if (!win) return false;
  const has = part => !!String(part.text || "").trim();
  const filled = blk => blk.parts.some(has);
  const sum = {
    total: blocks.length,
    done: blocks.filter(blk => blk.parts.every(has)).length,
    empty: blocks.filter(blk => !filled(blk)).length,
    over: blocks.filter(blk => blk.parts.some(part => part.bytes > part.limit)).length,
    issue: blocks.filter(blk => blk.parts.some(part => part.issues)).length,
  };
  const printedAt = new Date().toLocaleString("ko-KR");
  const bar = part => { const pct = Math.min(100, Math.round((part.bytes / Math.max(1, part.limit)) * 100)); const over = part.bytes > part.limit; return `<div class="meter${over ? " over" : ""}"><i style="width:${pct}%"></i></div><span class="bn${over ? " over" : ""}"><b>${part.bytes.toLocaleString()}</b> / ${part.limit.toLocaleString()} byte${over ? ` · <em>${(part.bytes - part.limit).toLocaleString()} 넘음</em>` : ""}</span>`; };
  const body = part => {
    if (!has(part)) return `<p class="empty">미작성</p>`;
    if (part.lines?.length > 1) return part.lines.map(line => `<p><span class="tag">${esc(line.tag)}</span>${esc(line.text)}</p>`).join("");
    return String(part.text).trim().split(/\n+/).map(line => `<p>${esc(line)}</p>`).join("");
  };
  const issues = part => part.issues ? `<ul class="iss"><li class="h">기재요령 점검</li>${String(part.issues).replace(/^점검:\s*/, "").split(/,\s+(?=[가-힣 ]+ ')/).map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : "";
  const statusOf = blk => !filled(blk) ? ["미작성", "s-empty"] : blk.parts.some(p => p.bytes > p.limit) ? ["한도 넘음", "s-over"] : blk.parts.some(p => p.issues) ? ["점검 필요", "s-warn"] : blk.parts.every(has) ? ["다 씀", "s-ok"] : ["덜 씀", "s-part"];
  const many = blocks.length > 1;
  const labels = Array.from(new Set(blocks.flatMap(blk => blk.parts.map(p => p.label))));
  const summary = many ? `<section class="page cover">
    <header class="top"><h1>${esc(title)}</h1><span>${esc(subtitle)}<br>출력 ${esc(printedAt)}</span></header>
    <div class="sum"><span>학생 <b>${sum.total}</b>명</span><span>다 씀 <b>${sum.done}</b></span><span>미작성 <b>${sum.empty}</b></span><span class="${sum.over ? "warn" : ""}">한도 넘음 <b>${sum.over}</b></span><span class="${sum.issue ? "warn" : ""}">점검 필요 <b>${sum.issue}</b></span></div>
    <table class="ov"><thead><tr><th class="c">확인</th><th>학생</th>${labels.map(l => `<th class="c">${esc(l)}</th>`).join("")}<th class="c">상태</th><th class="c">쪽</th></tr></thead><tbody>
    ${blocks.map((blk, n) => { const [st, cls] = statusOf(blk); return `<tr><td class="c"><span class="box"></span></td><td><b>${esc(blk.no)}</b> ${esc(blk.name)}${blk.group && labels.length === 1 ? `<small> ${esc(blk.group)}</small>` : ""}</td>${labels.map(l => { const part = blk.parts.find(p => p.label === l); if (!part) return `<td class="c">-</td>`; return `<td class="c ${!has(part) ? "dim" : part.bytes > part.limit ? "bad" : part.issues ? "warn" : ""}">${has(part) ? `${part.bytes.toLocaleString()}${part.issues ? " ⚠" : ""}` : "·"}</td>`; }).join("")}<td class="c"><span class="st ${cls}">${st}</span></td><td class="c">${n + 2}</td></tr>`; }).join("")}
    </tbody></table>
    <p class="legend">숫자는 나이스 바이트예요. 빨강 = 한도 넘음, 주황 ⚠ = 기재요령 점검 필요, · = 미작성. 다음 쪽부터 학생마다 한 장씩이에요.</p>
  </section>` : "";
  const pages = blocks.map((blk, n) => { const [st, cls] = statusOf(blk); return `<section class="page">
    <header class="top sm"><span>${esc(title)}${blk.group ? ` · ${esc(blk.group)}` : ""}</span><span>${many ? `${n + 1} / ${blocks.length}` : esc(printedAt)}</span></header>
    <div class="who"><div><strong><em>${esc(blk.no)}</em> ${esc(blk.name)}</strong><small>${esc(blk.sub || "")}</small></div><span class="st ${cls}">${st}</span><div class="sign"><span class="box"></span> 확인 <i></i></div></div>
    ${blk.parts.map(part => `<article class="area${has(part) ? "" : " is-empty"}${part.bytes > part.limit ? " is-over" : ""}">
      <div class="ah"><h3>${esc(part.label)}</h3>${has(part) ? bar(part) : ""}</div>
      <div class="tx">${body(part)}</div>${issues(part)}
    </article>`).join("")}
    <div class="memo"><span>메모</span></div>
  </section>`; }).join("");
  win.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  @page{size:A4;margin:13mm 13mm 14mm}*{box-sizing:border-box}body{margin:0;font-family:"Pretendard","Noto Sans KR","Malgun Gothic",sans-serif;color:#17181d;font-size:10.5pt;line-height:1.7}
  .page{break-after:page;page-break-after:always;display:flex;flex-direction:column;gap:10px;min-height:calc(297mm - 27mm)}.page:last-child{break-after:auto;page-break-after:auto}
  .top{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding-bottom:6px;border-bottom:2px solid #17181d}.top h1{margin:0;font-size:15pt}.top span{font-size:8.5pt;color:#5b606b;text-align:right}
  .top.sm{border-bottom:1px solid #c9c5bd;padding-bottom:4px}.top.sm span{font-size:8.5pt;text-align:left}.top.sm span:last-child{text-align:right}
  .sum{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:9.5pt;color:#3d4048}.sum b{font-size:11pt;color:#17181d}.sum .warn b{color:#b42318}
  table.ov{width:100%;border-collapse:collapse;font-size:9.5pt}table.ov th{padding:5px 6px;border-top:1.5px solid #17181d;border-bottom:1px solid #17181d;font-size:8.5pt;text-align:left;color:#3d4048}table.ov td{padding:5px 6px;border-bottom:1px solid #e1ded7}table.ov tr{break-inside:avoid}
  table.ov .c{text-align:center}table.ov td.bad{color:#b42318;font-weight:800}table.ov td.warn{color:#b45309;font-weight:700}table.ov td.dim{color:#b5b9c1}table.ov small{color:#8a8f99;font-size:8pt}
  .box{display:inline-block;width:4.2mm;height:4.2mm;border:1px solid #5b606b;border-radius:1mm;vertical-align:-1mm}
  .st{display:inline-block;padding:1px 8px;border-radius:99px;font-size:8.5pt;font-weight:800;white-space:nowrap}.s-ok{background:#e7f6ec;color:#15803d}.s-part{background:#eef2f7;color:#475569}.s-empty{background:#f1f1f1;color:#6b7280}.s-over{background:#fdecea;color:#b42318}.s-warn{background:#fff4e0;color:#b45309}
  .legend{margin:0;font-size:8.5pt;color:#6b7280}
  .who{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;background:#f4f3f0}.who>div:first-child{flex:1}.who strong{display:block;font-size:15pt;line-height:1.3}.who strong em{font-style:normal;color:#c2410c;margin-right:4px}.who small{font-size:8.5pt;color:#6b7280}
  .sign{display:flex;align-items:center;gap:6px;font-size:9pt;color:#3d4048}.sign i{display:inline-block;width:26mm;border-bottom:1px solid #9a968e;height:5mm}
  .area{border:1px solid #d9d6cf;border-radius:10px;padding:10px 14px 12px;break-inside:avoid}.area.is-over{border-color:#e8a29b}
  .ah{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;padding-bottom:6px;margin-bottom:6px;border-bottom:1px solid #ece9e3}.ah h3{margin:0;font-size:11pt;color:#c2410c}
  .meter{flex:1;min-width:30mm;height:2.2mm;border-radius:2mm;background:#ece9e3;overflow:hidden}.meter i{display:block;height:100%;background:#4f8a6b}.meter.over i{background:#b42318}
  .bn{font-size:8.5pt;color:#5b606b;font-variant-numeric:tabular-nums;white-space:nowrap}.bn b{color:#17181d;font-size:10pt}.bn.over b,.bn em{color:#b42318;font-style:normal;font-weight:800}
  .tx p{margin:0 0 4px;text-align:justify;word-break:keep-all;overflow-wrap:anywhere}.tx p:last-child{margin-bottom:0}.tx .tag{display:inline-block;margin-right:6px;padding:0 5px;border:1px solid #d9d6cf;border-radius:3px;font-size:8pt;color:#5b606b;vertical-align:1px}
  .tx .empty{color:#9aa0ab}
  ul.iss li.h{list-style:none;margin-left:-14px;font-weight:800}ul.iss{margin:8px 0 0;padding:6px 10px 6px 24px;border-radius:6px;background:#fdf3f1;border-left:3px solid #b42318;font-size:8.5pt;color:#912018}ul.iss li{margin:1px 0}
  .memo{flex:1;min-height:22mm;border:1px dashed #c9c5bd;border-radius:10px;padding:6px 12px;font-size:8.5pt;color:#9aa0ab}
  @media screen{body{background:#e9e7e2}.page{width:210mm;min-height:297mm;margin:10mm auto;padding:13mm;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.12)}}
  </style></head><body>${summary}${pages}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
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
    <button type="button" data-kdn-bare onClick={() => setOpen(value => !value)} disabled={busy} title="인쇄 · PDF · 엑셀로 뽑기" className="sec"><Printer size={15} /><span className="lb">인쇄·엑셀</span></button>
    {open && <div className="krw-menu-pop" onMouseLeave={() => setOpen(false)}>
      {scopes.map(([key, label]) => <div key={key} className="row"><span>{label}</span><button type="button" data-kdn-bare onClick={() => { setOpen(false); onPick(key, "print"); }}><Printer size={13} /> 인쇄·PDF</button><button type="button" data-kdn-bare onClick={() => { setOpen(false); onPick(key, "xlsx"); }}><FileSpreadsheet size={13} /> 엑셀</button></div>)}
      <small>PDF는 인쇄 창에서 '대상: PDF로 저장'을 고르면 돼요.</small>
    </div>}
  </div>;
}

const AREA_COLOR = { autonomy: "#4a6fa5", career: "#4f8a6b", behavior: "#8a6aa8", subject: "#d0612a" };
const ACT_COLORS = ["#d0612a", "#4a6fa5", "#4f8a6b", "#8a6aa8", "#b3794b", "#4d8a94", "#a08a3c", "#6b6fa8"];
const actColor = (acts, id) => ACT_COLORS[Math.max(0, acts.findIndex(act => act.id === id)) % ACT_COLORS.length];
const todayLabel = () => { const d = new Date(); return `${d.getMonth() + 1}.${d.getDate()}`; };

function CopyBtn({ text, label = "복사" }) {
  const [done, setDone] = useState(false);
  return <button type="button" data-kdn-bare className="krw-mini" disabled={!String(text || "").trim()} title="이 칸 글 복사" onClick={async () => { try { await navigator.clipboard.writeText(String(text || "").trim()); setDone(true); window.setTimeout(() => setDone(false), 1400); } catch { /* 복사 권한이 없으면 무시 */ } }}>{done ? <Check size={12} /> : <Copy size={12} />} {done ? "복사됨" : label}</button>;
}

function Field({ label, text, limit, onChange, check, rows = 6, readOnly = false, meta, hint = "", color = "#ea580c", tag = "", share = null }) {
  const fixed = autoFixRecordText(text);
  return <div className="krw-field" style={{ "--c": color }}>
    <div className="krw-field-hd">{tag && <span className="krw-chip">{tag}</span>}<b>{label}</b>{meta?.at && <small>{meta.by ? `${meta.by} · ` : ""}{new Date(meta.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small>}
      {text.trim() && <CopyBtn text={text} />}
      {!readOnly && fixed !== text && <button type="button" data-kdn-bare className="krw-fix" title="가운데점·둥근 따옴표·물결·대괄호·겹친 띄어쓰기를 기재요령대로 바꿔요" onClick={() => onChange?.(fixed)}><Wand2 size={13} /> 기호 자동 고치기</button>}
      {share ? <span className="krw-part" title="이 활동 바이트 (한도는 총합본 기준)"><b>{neisBytes(text).toLocaleString()}</b> byte{share.total ? ` · 합계의 ${Math.round((neisBytes(text) / share.total) * 100)}%` : ""}</span> : <ByteMeter text={text} limit={limit} />}</div>
    <textarea value={text} rows={rows} readOnly={readOnly} spellCheck={false} onChange={event => onChange?.(event.target.value)} placeholder={readOnly ? "" : `${hint || label} 내용을 적어 주세요. 자동으로 저장돼요.`} />
    {check && <IssueList text={text} />}
  </div>;
}

// 과세특 합계 바이트: 활동별로 써도 한도는 총합본(줄바꿈 포함) 하나라서, 남은 바이트를 크게 보여 줍니다.
function TotalBudget({ acts, texts, limit, compact = false }) {
  const total = neisBytes(mergeActivities(acts, texts));
  const left = limit - total;
  const parts = acts.map(act => ({ id: act.id, name: act.name, bytes: neisBytes(String(texts[act.id] || "").trim()), color: actColor(acts, act.id) })).filter(part => part.bytes);
  const breaks = Math.max(0, parts.length - 1) * 2;
  const tone = left < 0 ? "is-over" : left <= limit * 0.1 ? "is-near" : "";
  return <div className={`krw-budget ${tone}${compact ? " is-compact" : ""}`}>
    <div className="nums"><span className="lab">과세특 합계</span><b>{total.toLocaleString()}</b><span className="of">/ {limit.toLocaleString()} byte</span>
      <span className="left">{left >= 0 ? <>남은 <b>{left.toLocaleString()}</b></> : <><b>{(-left).toLocaleString()}</b> 넘음</>}</span></div>
    <div className="bar" role="img" aria-label={`합계 ${total}바이트, 한도 ${limit}바이트`}>
      {parts.map(part => <i key={part.id} title={`${part.name} ${part.bytes.toLocaleString()} byte`} style={{ width: `${Math.min(100, (part.bytes / limit) * 100)}%`, background: part.color }} />)}
      {breaks > 0 && <i className="br" title={`활동 사이 줄바꿈 ${breaks} byte`} style={{ width: `${(breaks / limit) * 100}%` }} />}
    </div>
    {!compact && parts.length > 0 && <div className="legend">{parts.map(part => <span key={part.id}><i style={{ background: part.color }} />{part.name} {part.bytes.toLocaleString()}</span>)}{breaks > 0 && <span className="muted">줄바꿈 {breaks}</span>}</div>}
  </div>;
}

const VIEWS = [["student", "학생별", "명단에서 학생을 골라 한 명씩", Rows3], ["table", "한눈에 표", "반 전체를 표로 보며 바로 고치기", Table2], ["area", "영역별 몰아쓰기", "한 영역을 반 전체 학생 차례로", LayoutGrid]];

// ── 사용법: 처음엔 단계별 스포트라이트 안내(모의고사 분석과 같은 방식), '?'를 누르면 가이드라인 창 ──
const TOUR_STEPS = [
  { target: "rw-tabs", title: "탭 4개", body: "학급담임(자율·자치 · 진로 · 행발) · 교과담임(반·분반별 과세특) · 점검(엑셀 올려 한 번에 점검) · 학년 자료(부서 행사 세특 파일 · 2학년부 활동·소감문)예요." },
  { target: "rw-views", title: "보는 형태 고르기", body: "학생별(한 명씩) · 한눈에 표(반 전체) · 영역별 몰아쓰기(한 영역을 반 전체 차례로) 중 편한 방식으로 써요. 고른 방식은 기억돼요." },
  { target: "rw-bar", title: "거르기 · 저장 · 도구", body: "덜 쓴 학생 · 한도 넘음 · 점검 필요 · 행사 미확인 학생만 골라 볼 수 있어요(0명인 칩은 숨겨요). 오른쪽은 지금 저장 · 인쇄·엑셀 · 같은 문장 점검 · 백업이에요." },
  { target: "rw-evbtn", title: "부서 행사 세특 · 반 전체 한 번에", body: "부서에서 보낸 행사 특기사항을 고르면 우리 반 학생 모두의 자율·자치 / 진로 칸에 한 번에 들어가요. 행사별로 몇 명을 확인했는지도 여기서 봐요." },
  { target: "rw-neis", title: "나이스 파일 반영", body: "나이스에서 바이트를 줄이는 등 고친 글을, 나이스에서 내려받은 엑셀(영역별)로 다시 맞춰요. 달라진 칸만 비교해 골라 바꾸고, 바꾸기 전에 백업 파일을 받아요." },
  { target: "rw-clear", title: "특기사항 일괄 지우기", body: "지금 학생 또는 반 전체의 칸을 영역(교과는 활동)별로 골라 한 번에 지워요. 지우기 전에 반 자료 백업 파일을 받아 두고, 누가기록·소감문은 지우지 않아요." },
  { target: "rw-sjx", title: "과세특 엑셀(교과)", body: "활동마다 칸이 나뉜 엑셀 양식을 받고, 이미 엑셀로 쓴 글을 올려 활동 칸에 한 번에 채워요. 엑셀 칸 이름이 활동 이름과 같으면 그 활동에, 없으면 새 활동으로 넣어요." },
  { target: "rw-acts", title: "수행평가 활동 만들기(교과)", body: "활동을 추가해 활동별로 나눠 쓰면 총합본이 줄을 바꿔 자동으로 합쳐져요. 다른 반 목록은 '가져오기'로 복사하고, 활동마다 2022 성취기준을 연결할 수 있어요." },
  { target: "rw-focus", title: "영역 탭", body: "자율·자치 / 진로 / 행발 중 하나만 크게 보며 써요. 탭마다 바이트와 확인 안 한 행사 수가 보이고, 오른쪽 자료 칸도 그 영역으로 맞춰져요. '모두 보기'는 세 칸을 한 화면에." },
  { target: "rw-events", title: "이 학생의 행사 특기사항", body: "행사마다 '칸에 넣기'(넣고 반영함 표시) 또는 '빼기'(이 학생은 안 씀)를 눌러 확인해요. 표시는 '되돌리기'로 지울 수 있고, 확인 안 한 행사는 학생 목록에 보라 숫자로 남아요." },
  { target: "rw-pane", title: "쓰기 · 자동 저장", body: "칸에 쓰면 1초 뒤 저장돼요. 칸마다 나이스 바이트가 보이고, 넘으면 빨갛게 바뀌어요. Alt+↓/↑로 다음·이전 학생으로 가요." },
  { target: "rw-side", title: "누가기록 · AI 도우미 · 소감문 · 활동지", body: "누가기록은 공통 · 수업 태도 · 영역(활동)별로 따로 적어요. AI 도우미는 '고르기'로 넣을 자료를 골라 요청문을 만들고(학생 이름 빠짐) Claude·ChatGPT로 바로 열어요. 소감문은 학생·반 전체를 누가기록에 한 번에 담을 수 있어요." },
  { target: "rw-total", title: "총합본 · 복사", body: "활동별 글이 줄을 바꿔 합쳐진 최종본이에요. '복사'를 눌러 나이스에 그대로 붙여넣어요." },
  { target: "rw-check", title: "기재요령 점검", body: "빨간 '기재 불가'(특수기호·대학명·상호명·대회 등)는 꼭 고치고, 주황 '고치기 권장'(과거형·학생 입장 표현·문장 끝)도 살펴요." },
  { target: "rw-help", title: "가이드라인은 언제든 '?'에서", body: "기재요령 요약, 교사 입장 맺음말 예시, 쓰기 팁, 이 안내를 다시 볼 수 있어요." },
];
function HelpDialog({ onClose, onTour }) {
  useEffect(() => { const onKey = event => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);
  return <div className="krw-modal" role="dialog" aria-modal="true" aria-label="생기부 작성 가이드라인" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="krw-modal-box krw-help">
      <header><b><HelpCircle size={18} /> 생기부 작성 가이드라인</b><div className="acts"><button type="button" data-kdn-bare className="krw-btn" onClick={onTour}>단계별 안내 다시 보기</button><button type="button" data-kdn-bare className="x" onClick={onClose} aria-label="닫기"><X size={18} /></button></div></header>
      <section><h4>이렇게 쓰면 빨라요 <small>담임 기준 순서</small></h4><ol className="tips">
        <li><b>행사 세특 한 번에</b> — 위쪽 '행사' 버튼에서 부서 행사를 골라 반 전체 칸에 넣고, 학생마다 고쳐 써요(확인 안 한 행사는 보라 숫자).</li>
        <li><b>소감문 담기</b> — 자료 칸 '소감문'에서 '반 전체 담기'로 학생 글을 영역별 누가기록에 모아 둬요.</li>
        <li><b>영역 탭으로 하나씩</b> — 자율·자치 / 진로 / 행발 탭을 골라 한 영역씩 써요. 누가기록·AI 도우미도 그 영역으로 맞춰져요.</li>
        <li><b>AI 도우미</b> — '고르기'로 누가기록·소감문·성취기준을 골라 요청문을 만들고, 받은 답은 '답 점검'에서 바이트·기재요령을 확인해요.</li>
        <li><b>나이스와 맞추기</b> — 나이스에서 고친 글은 '나이스 반영'에 나이스 엑셀을 올려 달라진 칸만 골라 다시 가져와요.</li>
        <li><b>마무리 점검</b> — '점검 필요' · '한도 넘음' 거르기와 '같은 문장'으로 반 전체를 훑고, '점검' 탭에서 엑셀로 한 번 더 봐요.</li>
      </ol></section>
      <section><h4>꼭 지킬 기재요령 <small>2026.05.08 광덕고 연수 자료</small></h4><ul>{RECORD_GUIDE.rules.map(rule => <li key={rule}>{rule}</li>)}</ul></section>
      <section><h4>교사 입장 맺음말 예시 <small>눌러서 복사</small></h4><div className="ends">{RECORD_GUIDE.endings.map(item => <button key={item} type="button" data-kdn-bare onClick={() => navigator.clipboard?.writeText(item.replace(/^~/, ""))}>{item}</button>)}</div></section>
      <section><h4>교과세특 쓰는 틀 <small>교육부·시도교육청 교과세특 연수 자료(2022.12)</small></h4><ul className="tips">
        <li><b>학생의 성취수준</b> — 성취기준에 비추어 학생이 도달한 수준을 포괄적으로</li>
        <li><b>수행 과정 및 결과</b> — 평가 과제에서 관찰한 구체적인 과정과 결과(성취수준 판단의 근거)</li>
        <li><b>교과역량</b> — 수업·평가에서 드러난 역량</li>
        <li><b>교사 총평</b> — 특정 성취기준에 국한되지 않고 수업 중 꾸준히 관찰한 학생 특성</li>
        <li>과목별 예시는 AI 도우미 '④ 기재 예시'에서 볼 수 있어요(2015 개정 기준, 평가 과제 하나에 대한 기록 예시).</li>
      </ul></section>
      <section><h4>쓰기 팁</h4><ul className="tips">{RECORD_GUIDE.tips.map(tip => <li key={tip}>{tip}</li>)}</ul></section>
      <p className="keys">단축키 <kbd>Alt</kbd>+<kbd>↓</kbd>/<kbd>↑</kbd> 다음·이전 학생 · <kbd>Ctrl</kbd>+<kbd>S</kbd> 바로 저장 · <kbd>Esc</kbd> 창 닫기</p>
    </div>
  </div>;
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
// 누가기록 갈래: 공통 · 수업 태도 · 활동(영역)별. 예전 '누가기록'은 공통(memo)으로 그대로 보여요.
// ── 2022 개정 교육과정 성취기준 ─────────────────────────────────────────────
function useStandards(enabled = true) {
  const [state, setState] = useState({ data: null, error: "" });
  useEffect(() => {
    if (!enabled || state.data) return undefined;
    let alive = true;
    loadStandards().then(data => { if (alive) setState({ data, error: "" }); }).catch(error => { if (alive) setState({ data: null, error: error?.message || "불러오지 못했어요." }); });
    return () => { alive = false; };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

// 성취기준 찾아보기·고르기 창: picked가 있으면 체크해서 활동에 연결, 없으면 찾아보기만
function StandardsModal({ subjectName = "", grade = "", semester = "", picked = null, title = "", chosen = false, onSave, onClose }) {
  const { data, error } = useStandards(true);
  const subjects = data?.subjects || [];
  const resolved = useMemo(() => resolveStandardSubject(subjectName, grade, semester, subjects), [subjectName, grade, semester, subjects]);
  const matched = resolved.subject;
  const [subj, setSubj] = useState("");
  const [domain, setDomain] = useState("__all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(() => new Set(picked || []));
  useEffect(() => { if (!subj && matched) setSubj(matched.n); }, [matched]); // eslint-disable-line react-hooks/exhaustive-deps
  const subject = subjects.find(item => item.n === subj);
  const query = q.trim().replace(/\s+/g, "");
  const hit = (code, text) => !query || `${code}${text}`.replace(/\s+/g, "").includes(query);
  const groups = subject ? subject.d.filter(([name]) => domain === "__all" || name === domain).map(([name, items]) => [name, items.filter(([code, text]) => hit(code, text))]).filter(([, items]) => items.length) : [];
  const toggle = code => setSel(prev => { const next = new Set(prev); if (next.has(code)) next.delete(code); else next.add(code); return next; });
  const pickMode = !!onSave;
  return <div className="krw-modal" role="dialog" aria-modal="true" aria-label="2022 개정 교육과정 성취기준" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="krw-modal-box krw-std">
      <header><b><ListChecks size={18} /> {pickMode ? `성취기준 고르기 · ${title}` : "2022 개정 교육과정 성취기준"}</b><button type="button" data-kdn-bare className="x" onClick={onClose} aria-label="닫기"><X size={18} /></button></header>
      <p className="krw-std-note">성취기준은 수업이 겨냥한 <b>목표</b>예요. 문장을 그대로 세특에 옮기지 말고, 이 목표와 이어지는 학생의 구체적인 행동을 써 주세요.{pickMode ? " 고른 성취기준은 이 활동의 누가기록·AI 요청문에서 바로 쓸 수 있어요." : ""}</p>
      {error ? <p className="krw-alert"><AlertTriangle size={15} /> 성취기준 자료를 불러오지 못했어요. ({error})</p>
        : !data ? <div className="krw-empty"><Loader2 size={18} className="spin" /> 성취기준을 불러오는 중이에요.</div>
        : <>
          <div className="krw-std-bar">
            <select value={subj} onChange={event => { setSubj(event.target.value); setDomain("__all"); }} aria-label="과목">
              <option value="">과목 고르기 ({subjects.length}과목)</option>
              {subjects.map(item => <option key={item.n} value={item.n}>{item.n}{matched?.n === item.n ? " · 내 과목" : ""}</option>)}
            </select>
            <label className="krw-find is-inline"><Search size={14} /><input value={q} onChange={event => setQ(event.target.value)} placeholder="낱말·코드로 찾기" />{q && <button type="button" data-kdn-bare onClick={() => setQ("")} aria-label="지우기"><X size={13} /></button>}</label>
          </div>
          {subjectName && !matched && <p className="krw-side-note">'{subjectName}'과 맞는 과목을 편제표에서 찾지 못했어요. 위에서 과목을 골라 주세요.</p>}
          {matched && <p className="krw-std-auto">{chosen ? <>이 활동은 <b>{matched.n}</b>(으)로 정해 두었어요.</> : resolved.via ? <>담당 과목 '<b>{subjectName}</b>'을 우리 학교 편제표의 <b>{matched.n}</b>(으)로 맞췄어요.</> : <>담당 과목 <b>{matched.n}</b>(으)로 열었어요.</>} 다른 과목이면 위에서 바꿔 주세요{onSave ? "(이 활동에만 적용)" : ""}.</p>}
          {subject && subject.d.length > 1 && <div className="krw-std-doms" role="group" aria-label="영역"><button type="button" data-kdn-bare aria-pressed={domain === "__all"} onClick={() => setDomain("__all")}>전체</button>{subject.d.map(([name, items]) => <button key={name} type="button" data-kdn-bare aria-pressed={domain === name} onClick={() => setDomain(name)}>{name}<em>{items.filter(([code]) => sel.has(code)).length || ""}</em></button>)}</div>}
          <div className="krw-std-list">
            {!subject ? <p className="krw-side-empty">과목을 고르면 영역별 성취기준이 보여요.</p>
              : !groups.length ? <p className="krw-side-empty">찾는 성취기준이 없어요.</p>
              : groups.map(([name, items]) => <section key={name}><h4>{name}</h4><ul>{items.map(([code, text]) => <li key={code} className={sel.has(code) ? "is-on" : ""}>
                {pickMode ? <label><input type="checkbox" checked={sel.has(code)} onChange={() => toggle(code)} /><code>{code}</code><span>{text}</span></label> : <div className="ro"><code>{code}</code><span>{text}</span></div>}
                <CopyBtn text={`${code} ${text}`} />
              </li>)}</ul></section>)}
          </div>
          <footer className="krw-std-ft"><small>{data.source} PDF에서 옮긴 자료라 띄어쓰기가 어색한 곳이 있을 수 있어요.</small>
            {pickMode && <><span className="n">{sel.size}개 고름</span>{sel.size > 0 && <button type="button" data-kdn-bare className="krw-btn ghost" onClick={() => setSel(new Set())}>모두 풀기</button>}<button type="button" data-kdn-bare className="krw-btn pri" onClick={() => onSave(Array.from(sel), subj)}><Check size={15} /> 이 활동에 연결</button></>}
          </footer>
        </>}
    </div>
  </div>;
}

// 자료 칸 '성취기준' 탭: 이 활동에 연결한 성취기준을 누가기록에 넣거나 복사
function StandardsTab({ targets, targetKey, setTarget, standardsFor, onPick, addToMemo }) {
  const list = standardsFor(targetKey);
  return <div className="krw-stdtab">
    <label className="krw-ai-target">활동<select value={targetKey} onChange={event => setTarget(event.target.value)}>{targets.map(t => <option key={t.key} value={t.key}>{t.label} ({standardsFor(t.key).length})</option>)}</select></label>
    <p className="krw-side-note">활동에 연결한 성취기준이에요. <b>AI 요청문에는 자동으로 들어가요.</b> '누가기록에 넣기'를 누르면 이 학생의 활동 누가기록에 붙어요.</p>
    {list.length ? <ul>{list.map(item => <li key={item.code}><div><code>{item.code}</code><small>{item.domain}</small></div><p>{item.text}</p><div className="acts"><button type="button" data-kdn-bare className="krw-mini" onClick={() => addToMemo(item)}><Plus size={12} /> 누가기록에 넣기</button><CopyBtn text={standardLine(item)} /></div></li>)}</ul>
      : <p className="krw-side-empty">이 활동에 연결한 성취기준이 없어요.</p>}
    <button type="button" data-kdn-bare className="krw-btn" onClick={() => onPick(targetKey)}><ListChecks size={14} /> {list.length ? "성취기준 바꾸기" : "성취기준 고르기"}</button>
  </div>;
}

const sidKey = value => String(value ?? "").replace(/\D/g, "");
const memoCats = targets => [{ key: "memo", label: "공통" }, { key: "memo_att", label: "수업 태도" }, ...targets.map(t => ({ key: `memo_${t.key}`, label: t.label, target: t.key }))];

function SidePanel({ rec, sid, studentLabel, studentName = "", scopeLabel, by, showToast, onClose, targets = [], budgetFor = () => 1500, aiContext = {}, standardsFor = null, onPickStandards = null, reflections = null, focus = "", onBulkReflections = null }) {
  const [tab, setTab] = useState("memo");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);
  const memoRef = useRef(null);
  const cats = memoCats(targets);
  const [catKey, setCatKey] = useState("memo");
  const showAll = catKey === "__all";
  const cat = cats.find(item => item.key === catKey) || cats[0];
  const [target, setTarget] = useState("");
  // 학급담임에서 영역 탭(자율·진로·행발)을 고르면 누가기록 갈래·AI 쓸 칸·소감문도 그 영역으로 맞춰요.
  useEffect(() => { if (focus && targets.some(t => t.key === focus)) { setCatKey(`memo_${focus}`); setTarget(focus); } }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  const targetKey = targets.some(t => t.key === target) ? target : cat.target || targets[0]?.key || "";
  useEffect(() => { if (cat.target) setTarget(cat.target); }, [cat.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const memo = rec.textOf(sid, cat.key);
  const putText = (text, mode = "append", key = targetKey) => {
    const value = String(text || "").trim();
    if (!value || !key) return false;
    const before = rec.textOf(sid, key).trim();
    rec.edit(`s|${sid}|${key}`, mode === "replace" || !before ? value : `${before} ${value}`);
    showToast?.(`'${targets.find(t => t.key === key)?.label}' 칸에 ${mode === "replace" ? "바꿔 " : ""}넣었어요.`, "success");
    return true;
  };
  const putIntoField = () => {
    const el = memoRef.current;
    const picked = el && el.selectionEnd > el.selectionStart ? el.value.slice(el.selectionStart, el.selectionEnd) : (el?.value || "");
    if (!putText(picked)) showToast?.("누가기록에서 넣을 글을 먼저 골라(드래그) 주세요.", "error");
  };
  const files = rec.files.filter(file => !file.removed && (!file.sid || file.sid === sid));
  const readOnlyView = useContext(ReadOnlyContext);
  const upload = async (list, forStudent) => {
    if (readOnlyView) { showToast?.("조회 전용 계정은 활동지를 올릴 수 없어요.", "error"); return; }
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
  return <aside className="krw-side" data-tour="rw-side">
    <header><div className="krw-side-tabs">
      <button type="button" data-kdn-bare aria-pressed={tab === "memo"} onClick={() => setTab("memo")}><FileText size={14} /> 누가기록</button>
      <button type="button" data-kdn-bare aria-pressed={tab === "ai"} onClick={() => setTab("ai")}><Sparkles size={14} /> AI 도우미</button>
      {standardsFor && <button type="button" data-kdn-bare aria-pressed={tab === "std"} onClick={() => setTab("std")}><ListChecks size={14} /> 성취기준</button>}
      {reflections && <button type="button" data-kdn-bare aria-pressed={tab === "refl"} onClick={() => setTab("refl")}><MessageSquareText size={14} /> 소감문 {reflections.length > 0 && <em>{reflections.length}</em>}</button>}
      <button type="button" data-kdn-bare aria-pressed={tab === "files"} onClick={() => setTab("files")}><Paperclip size={14} /> 활동지 {files.length > 0 && <em>{files.length}</em>}</button>
    </div><button type="button" data-kdn-bare className="x" onClick={onClose} aria-label="자료 칸 닫기"><PanelRightClose size={16} /></button></header>
    {tab === "memo" ? <div className="krw-memo">
      <div className="krw-memo-cats" role="group" aria-label="누가기록 갈래"><button type="button" data-kdn-bare className="all" aria-pressed={catKey === "__all"} onClick={() => setCatKey("__all")}>전체 보기</button>{cats.map(item => <button key={item.key} type="button" data-kdn-bare aria-pressed={!showAll && item.key === cat.key} onClick={() => setCatKey(item.key)}>{item.label}{rec.textOf(sid, item.key).trim() && <i />}</button>)}</div>
      {showAll ? <div className="krw-memo-all">{cats.filter(item => rec.textOf(sid, item.key).trim()).length ? cats.filter(item => rec.textOf(sid, item.key).trim()).map(item => <section key={item.key}>
        <header><b>{item.label}</b><button type="button" data-kdn-bare className="krw-mini" onClick={() => setCatKey(item.key)}>고치기</button><CopyBtn text={rec.textOf(sid, item.key)} />{item.target && <button type="button" data-kdn-bare className="krw-mini" onClick={() => putText(rec.textOf(sid, item.key), "append", item.target)}><ChevronLeft size={12} /> 칸에 넣기</button>}</header>
        <p>{rec.textOf(sid, item.key)}</p>
      </section>) : <p className="krw-side-empty">{studentLabel} 누가기록이 아직 없어요.</p>}</div> : <>
      <p className="krw-side-note">{studentLabel} · <b>{cat.label}</b> 기록이에요. 생기부에 들어가지 않아요. 문장을 드래그하고 '칸에 넣기'를 누르면 그 칸 끝에 붙어요.</p>
      <textarea ref={memoRef} value={memo} spellCheck={false} placeholder={cat.key === "memo_att" ? "예)\n9.5 발표 때 친구 의견을 메모하며 경청\n9.19 모둠 과제에서 자료 정리를 먼저 맡음\n10.2 질문을 자주 하며 개념을 확인" : cat.target ? `'${cat.label}' 활동 관찰을 날짜별로 적어요.\n예)\n9.12 주제 선정 이유를 구체적으로 설명\n10.3 자료 출처를 비교하며 근거 보완\n\n(AI가 써 준 초안을 붙여 두고 고쳐 써도 좋아요)` : "예)\n9.12 모둠 토론에서 반대 측 근거를 정리해 발표\n10.3 실험 보고서 오차 원인을 스스로 분석\n\n(AI가 써 준 초안을 붙여 두고 고쳐 써도 좋아요)"} onChange={event => rec.edit(`s|${sid}|${cat.key}`, event.target.value)} />
      <div className="krw-put">{targets.length > 0 && <><select value={targetKey} onChange={event => setTarget(event.target.value)} aria-label="넣을 칸">{targets.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select><button type="button" data-kdn-bare className="krw-btn pri" onClick={putIntoField} title="드래그한 글(없으면 전체)을 고른 칸 끝에 붙여요"><ChevronLeft size={14} /> 칸에 넣기</button></>}</div>
      <button type="button" data-kdn-bare className="krw-btn ghost" onClick={() => rec.edit(`s|${sid}|${cat.key}`, `${memo}${memo && !memo.endsWith("\n") ? "\n" : ""}${todayLabel()} `)}><Plus size={14} /> 오늘 날짜로 한 줄 추가</button></>}
    </div> : tab === "std" && standardsFor ? <StandardsTab targets={targets} targetKey={targetKey} setTarget={setTarget} standardsFor={standardsFor} onPick={onPickStandards}
      addToMemo={item => { const key = `memo_${targetKey}`; const prev = rec.textOf(sid, key); rec.edit(`s|${sid}|${key}`, `${prev}${prev && !prev.endsWith("\n") ? "\n" : ""}[성취기준] ${standardLine(item)}\n`); showToast?.(`'${targets.find(t => t.key === targetKey)?.label}' 누가기록에 넣었어요.`, "success"); }} />
    : tab === "refl" ? <ReflectionPane onBulk={onBulkReflections} focus={focus} items={reflections || []} studentLabel={studentLabel} targets={targets} rec={rec} sid={sid} putText={putText} showToast={showToast} />
    : tab === "ai" ? <AiHelper rec={rec} sid={sid} studentName={studentName} targets={targets} targetKey={targetKey} setTarget={setTarget} budgetFor={budgetFor} aiContext={aiContext} cats={cats} putText={putText} showToast={showToast} reflections={reflections} />
    : <div className="krw-files">
      <div className="up"><button type="button" data-kdn-bare className="krw-btn" disabled={uploading} onClick={() => { inputRef.current.dataset.mode = "class"; inputRef.current.click(); }}>{uploading ? <Loader2 size={14} className="spin" /> : <Paperclip size={14} />} 반 공용 활동지 올리기</button><button type="button" data-kdn-bare className="krw-btn" disabled={uploading} onClick={() => { inputRef.current.dataset.mode = "student"; inputRef.current.click(); }}><Paperclip size={14} /> 이 학생 자료</button>
        <input ref={inputRef} type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.hwp,.hwpx,.doc,.docx,.xlsx,.xls,.ppt,.pptx" onChange={event => { upload(event.target.files, event.target.dataset.mode === "student"); event.target.value = ""; }} /></div>
      <p className="krw-side-note">PDF·사진은 여기서 바로 보며 쓸 수 있어요(파일 하나 30MB 이하).</p>
      {files.length ? <ul>{files.map(file => <li key={file.id}><button type="button" data-kdn-bare className="nm" onClick={() => open(file)}><FileText size={14} /> {file.name}</button><small>{file.sid ? "이 학생" : "반 공용"}</small><button type="button" data-kdn-bare className="rm" title="목록에서 빼기" onClick={() => { if (window.confirm(`'${file.name}'을(를) 목록에서 뺄까요?`)) rec.edit("files", rec.files.map(item => item.id === file.id ? { ...item, removed: true } : item)); }}><Trash2 size={13} /></button></li>)}</ul> : <p className="krw-side-empty">아직 올린 활동지가 없어요.</p>}
      {preview && <div className="krw-preview"><header><b>{preview.name}</b><button type="button" data-kdn-bare onClick={() => setPreview(null)}><X size={14} /></button></header>{preview.image ? <img src={preview.url} alt={preview.name} /> : <iframe title={preview.name} src={preview.url} />}</div>}
    </div>}
  </aside>;
}

// AI 도우미: ① 요청문 만들기(학생 이름 빼고 복사) ② AI 답 붙여넣고 점검 → 칸에 넣기 ③ 한도 넘을 때 문장별로 덜어내기
// 교과세특 기재 예시(교육부·시도교육청 연수 자료): 같은 과목 → 같은 교과 순서로 보여 주고, 하나를 요청문에 문체 참고로 넣을 수 있어요.
function ExamplesPane({ subject, picked, onPick }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [group, setGroup] = useState(() => exampleGroupFor(subject) || "국어");
  useEffect(() => { let alive = true; loadExamples().then(value => { if (alive) setData(value); }).catch(err => { if (alive) setError(err?.message || "불러오지 못했어요."); }); return () => { alive = false; }; }, []);
  useEffect(() => { const g = exampleGroupFor(subject); if (g) setGroup(g); }, [subject]);
  if (error) return <p className="krw-alert"><AlertTriangle size={15} /> 예시를 불러오지 못했어요. ({error})</p>;
  if (!data) return <div className="krw-empty"><Loader2 size={16} className="spin" /> 예시를 불러오는 중이에요.</div>;
  const list = examplesFor(subject, data.items, group);
  return <div className="krw-ai-body krw-ex">
    <p className="krw-side-note"><b>공식 기재 예시</b>예요. {data.note} 문장을 따라 쓰지 말고 <b>구성(성취수준 → 수행 과정·결과 → 역량 → 교사 총평)</b>과 구체성을 참고해 주세요.</p>
    <label className="krw-ai-target">교과<select value={group} onChange={event => setGroup(event.target.value)}>{EXAMPLE_GROUPS.map(g => <option key={g} value={g}>{g} ({data.items.filter(item => item.g === g).length})</option>)}</select></label>
    <ul>{list.map((item, index) => <li key={index} className={picked?.t === item.t ? "is-on" : ""}>
      <header><b>{item.s}</b><small>{item.t.length}자 · {item.k}</small></header>
      <p>{item.t}</p>
      <div className="meta"><span>평가 과제</span>{item.task.map(task => <em key={task}>{task}</em>)}<span>성취기준</span><em>{item.c.join(" ")}</em></div>
      <div className="acts">{picked?.t === item.t ? <button type="button" data-kdn-bare className="krw-mini" onClick={() => onPick(null)}>요청문에서 빼기</button> : <button type="button" data-kdn-bare className="krw-mini" onClick={() => onPick(item)}><Plus size={12} /> 요청문에 문체 참고로 넣기</button>}<CopyBtn text={item.t} /></div>
    </li>)}</ul>
    <p className="krw-ex-src">출처: {data.source}</p>
  </div>;
}

const AI_URL_MAX = 6000; // 주소가 너무 길면 일부 브라우저·사이트에서 잘려서, 그보다 길면 빈 창만 열고 붙여넣기로 안내
// 학생 소감문(2학년부 자료에서 불러옴): 활동 이름에 '진로'가 있으면 진로활동, 아니면 자율·자치활동 칸으로 안내해요.
const reflArea = activity => (/진로|따라\s*체험|직업|학과|전공|대학\s*탐방|멘토/.test(activity || "") ? "career" : "autonomy");
// 활동 이름으로 짐작한 영역을 반에서 바꿔 둘 수 있어요(반 생기부 자료 '__cfg' 칸에 저장, 반 학생 모두에게 적용).
const reflAreaKey = activity => `ra:${String(activity || "").trim()}`;
const reflAreaOf = (rec, activity) => { const v = rec.textOf("__cfg", reflAreaKey(activity)); return v === "career" || v === "autonomy" ? v : reflArea(activity); };
const reflTag = item => `[소감문 · ${item.activity}${item.date ? ` ${item.date}` : ""}]`;
// 한 학생의 소감문을 영역별 누가기록 끝에 담기(이미 담긴 건 건너뜀). 돌려주는 값: 담은 개수
function reflectionsToMemo(rec, sid, list) {
  const byArea = {};
  list.forEach(item => { const key = reflAreaOf(rec, item.activity); if (rec.textOf(sid, `memo_${key}`).includes(reflTag(item))) return; (byArea[key] ||= []).push(`${reflTag(item)}\n${item.response.trim()}`); });
  let count = 0;
  Object.entries(byArea).forEach(([key, parts]) => { const prev = rec.textOf(sid, `memo_${key}`); rec.edit(`s|${sid}|memo_${key}`, `${prev}${prev.trim() ? "\n\n" : ""}${parts.join("\n\n")}`); count += parts.length; });
  return count;
}
function ReflectionPane({ items, studentLabel, targets, rec, sid, putText, showToast, focus = "", onBulk = null }) {
  const readOnlyView = useContext(ReadOnlyContext);
  const counts = { autonomy: 0, career: 0 };
  items.forEach(item => { counts[reflAreaOf(rec, item.activity)] += 1; });
  const pickDefault = () => (focus === "autonomy" || focus === "career") && counts[focus] ? focus : "all";
  const [area, setArea] = useState(pickDefault);
  useEffect(() => { setArea(pickDefault()); }, [focus, sid]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = items.filter(item => area === "all" || reflAreaOf(rec, item.activity) === area);
  const inMemo = item => rec.textOf(sid, `memo_${reflAreaOf(rec, item.activity)}`).includes(reflTag(item));
  const toMemo = list => { const n = reflectionsToMemo(rec, sid, list); showToast?.(n ? `소감문 ${n}개를 누가기록에 담았어요. AI 도우미 요청문에도 넣을 수 있어요.` : "이미 누가기록에 담겨 있어요.", "success"); };
  const flip = item => { const next = reflAreaOf(rec, item.activity) === "career" ? "autonomy" : "career"; rec.edit(`s|__cfg|${reflAreaKey(item.activity)}`, next); showToast?.(`'${item.activity}'을(를) 이 반에서는 ${RECORD_AREAS[next].short}(으)로 볼게요.`, "success"); };
  if (!items.length) return <div className="krw-refl">
    <p className="krw-side-empty">{studentLabel} 소감문이 없어요. 2학년부 자료에 소감문 파일을 올리면 여기서 불러와요.</p>
    {onBulk && !readOnlyView && <button type="button" data-kdn-bare className="krw-btn" onClick={onBulk}><Users size={14} /> 반 전체 소감문 누가기록에 담기</button>}
  </div>;
  const left = items.filter(item => !inMemo(item));
  return <div className="krw-refl">
    <p className="krw-side-note">{studentLabel} <b>소감문</b>이에요(2학년부 자료). 학생 글이라 <b>누가기록에 담아</b> 관찰 사실과 함께 다듬어 쓰는 걸 권해요. 영역 표시는 활동 이름으로 짐작한 거라, 틀리면 눌러서 바꿔요.</p>
    <div className="krw-refl-seg" role="tablist" aria-label="영역">{[["all", "전체", items.length], ["autonomy", "자율·자치", counts.autonomy], ["career", "진로", counts.career]].map(([key, text, n]) => <button key={key} type="button" data-kdn-bare role="tab" aria-selected={area === key} onClick={() => setArea(key)}>{text}<em>{n}</em></button>)}</div>
    {!shown.length && <p className="krw-side-empty">{RECORD_AREAS[area]?.short || ""}(으)로 나뉜 소감문이 없어요. <button type="button" data-kdn-bare className="krw-linkbtn" onClick={() => setArea("all")}>전체 보기</button></p>}
    {!readOnlyView && <div className="krw-refl-bar">
      <button type="button" data-kdn-bare className="krw-btn" disabled={!left.length} onClick={() => toMemo(items)}><ClipboardPaste size={14} /> 이 학생 모두 담기{left.length ? ` (${left.length})` : ""}</button>
      {onBulk && <button type="button" data-kdn-bare className="krw-btn" onClick={onBulk} title="반 학생 모두의 소감문을 영역별 누가기록에 한 번에 담아요(이미 담긴 건 건너뜀)"><Users size={14} /> 반 전체 담기</button>}
    </div>}
    {shown.map(item => { const key = reflAreaOf(rec, item.activity); const done = inMemo(item); return <article key={item.id || `${item.activity}-${item.date}`}>
      <header><b>{item.activity}</b>{item.date && <small>{item.date}</small>}<button type="button" data-kdn-bare className={`krw-refl-tag is-${key}`} disabled={readOnlyView} onClick={() => flip(item)} title="눌러서 영역 바꾸기(이 반 모든 학생에게 적용)">{RECORD_AREAS[key].short} ⇄</button></header>
      <p>{item.response}</p>
      {!readOnlyView && <div className="acts"><button type="button" data-kdn-bare className="krw-mini" disabled={done} onClick={() => toMemo([item])}>{done ? <><Check size={12} /> 누가기록에 있음</> : <><ClipboardPaste size={12} /> 누가기록에 담기</>}</button><button type="button" data-kdn-bare className="krw-mini" onClick={() => putText(item.response, "append", key)}><ChevronLeft size={12} /> {RECORD_AREAS[key].short} 칸에 넣기</button><CopyBtn text={item.response} /></div>}
    </article>; })}
  </div>;
}
const clip = (text, n) => { const t = String(text || "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
function AiHelper({ rec, sid, studentName, targets, targetKey, setTarget, budgetFor, aiContext, cats, putText, showToast, reflections = [] }) {
  const [step, setStep] = useState("prompt");
  const [refine, setRefine] = useState(true);
  const [answer, setAnswer] = useState("");
  const [drop, setDrop] = useState({});
  const target = targets.find(t => t.key === targetKey);
  const budget = Math.max(0, budgetFor(targetKey));
  const current = rec.textOf(sid, targetKey);
  const filledCats = cats.filter(c => rec.textOf(sid, c.key).trim());
  const [picked, setPicked] = useState(null); // null = 기본(이 칸 활동 · 수업 태도 · 공통)
  useEffect(() => { setPicked(null); }, [targetKey, sid]);
  const isPicked = c => picked ? picked.includes(c.key) : (c.target === targetKey || c.key === "memo_att" || c.key === "memo");
  const notes = filledCats.filter(isPicked).sort((a, b) => (b.target === targetKey) - (a.target === targetKey)).map(c => [c.target ? `${c.label} 관찰` : c.label, rec.textOf(sid, c.key)]);
  const togglePick = key => setPicked(list => { const base = list || filledCats.filter(isPicked).map(c => c.key); return base.includes(key) ? base.filter(k => k !== key) : [...base, key]; });
  const [loadKey, setLoadKey] = useState("");
  const defaultLoad = filledCats.find(c => c.target === targetKey)?.key || filledCats[0]?.key || "";
  useEffect(() => { setLoadKey(""); }, [targetKey, sid]);
  const stdList = aiContext.standardsFor ? aiContext.standardsFor(targetKey) : [];
  const [useStd, setUseStd] = useState(true);
  const [exPick, setExPick] = useState(null); // 요청문에 넣을 기재 예시(문체 참고)
  const [useEx, setUseEx] = useState(true);
  const [useFrame, setUseFrame] = useState(true);
  const [pickOpen, setPickOpen] = useState(false);
  const refls = (reflections || []).map((item, i) => ({ ...item, key: item.id || `${item.activity}-${i}` }));
  const [reflPick, setReflPick] = useState({});
  useEffect(() => { setReflPick({}); }, [sid]);
  const reflNotes = refls.filter(item => reflPick[item.key]).map(item => [`학생 소감문(학생이 쓴 글, ${item.activity})`, item.response]);
  const hope = String(aiContext.hope || "").trim();
  const [useHope, setUseHope] = useState(true);
  // 활동마다 줄 바꾸기: 담임 자율·진로는 기본으로 켜고(여러 행사·활동), 소감문을 2개 이상 넣으면 켜요.
  const [multiPick, setMultiPick] = useState(null);
  useEffect(() => { setMultiPick(null); }, [targetKey, sid]);
  const multi = multiPick ?? ((!aiContext.subject && targetKey !== "behavior") || reflNotes.length >= 2);
  const incSummary = [
    notes.length && `누가기록 ${notes.length}`,
    reflNotes.length && `소감문 ${reflNotes.length}`,
    useStd && stdList.length && `성취기준 ${stdList.length}`,
    aiContext.subject && useFrame && "구성 틀",
    useHope && hope && "진로희망",
    multi && "활동마다 줄 바꿈",
    aiContext.subject && useEx && exPick && "기재 예시",
    refine && current.trim() && "지금 쓴 글",
  ].filter(Boolean);
  const prompt = buildAiPrompt({ area: aiContext.area || target?.label || "", subject: aiContext.subject || "", activity: aiContext.subject ? target?.label : "", budget, notes: [...notes, ...reflNotes], existing: refine ? current : "", studentName, standards: useStd ? stdList.map(standardLine) : [], example: useEx && exPick ? exPick.t : "", frame: useFrame, hope: useHope ? hope : "", multi });
  const copy = async () => { try { await navigator.clipboard.writeText(prompt); showToast?.("요청문을 복사했어요. 쓰시는 AI 대화창에 붙여넣어 주세요.", "success"); setStep("answer"); } catch { showToast?.("복사하지 못했어요. 아래 글을 직접 복사해 주세요.", "error"); } };
  // 바로 열기: 팝업 차단을 피하려고 창부터 열고, 요청문은 주소(?q=)에 담고 클립보드에도 복사해 둡니다.
  const openAi = async site => {
    const base = site === "claude" ? "https://claude.ai/new" : "https://chatgpt.com/";
    const q = encodeURIComponent(prompt);
    const url = q.length <= AI_URL_MAX ? `${base}?q=${q}` : base;
    window.open(url, "_blank", "noopener");
    let copied = false;
    try { await navigator.clipboard.writeText(prompt); copied = true; } catch { /* 복사 권한이 없어도 창은 열림 */ }
    const name = site === "claude" ? "Claude" : "ChatGPT";
    showToast?.(url === base ? `${name}를 열었어요. 요청문이 길어서 자동으로 못 넣었어요. 붙여넣기(Ctrl+V) 해 주세요.` : `${name}를 열었어요. 요청문이 안 들어가 있으면 붙여넣기(Ctrl+V) 해 주세요.${copied ? "" : " (복사는 못 했어요)"}`, "success");
    setStep("answer");
  };
  const sentences = splitSentences(current);
  const kept = sentences.filter((_, i) => !drop[i]).join(" ");
  useEffect(() => { setDrop({}); }, [targetKey, sid]);
  return <div className="krw-ai">
    <div className="krw-ai-head"><label className="krw-ai-target">쓸 칸<select value={targetKey} onChange={event => setTarget(event.target.value)}>{targets.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label><span className="krw-ai-budget" title="이 칸에 쓸 수 있는 바이트">{budget.toLocaleString()}<small>byte</small></span></div>
    <div className="krw-ai-steps" role="tablist">{[["prompt", "1", "요청문", "요청문 만들기"], ["answer", "2", "답 점검", "AI 답 붙여넣어 점검"], ["trim", "3", "줄이기", "문장 빼서 바이트 맞추기"], ...(aiContext.subject ? [["examples", "4", "예시", "공식 기재 예시"]] : [])].map(([key, no, label, tip]) => <button key={key} type="button" data-kdn-bare role="tab" title={tip} aria-selected={step === key} onClick={() => setStep(key)}><i>{no}</i>{label}</button>)}</div>
    {step === "prompt" && <div className="krw-ai-body">
      <p className="krw-ai-lead">누가기록·기재요령·남은 바이트를 담은 요청문이에요. <b>학생 이름은 빠져요.</b></p>
      <div className={`krw-ai-sum${notes.length + reflNotes.length ? "" : " is-empty"}`}>
        <div className="hd"><ListChecks size={16} /><b>① 요청문에 넣을 것</b><span>{notes.length + reflNotes.length ? "이 자료로 요청문을 만들어요" : "아직 누가기록·소감문을 고르지 않았어요"}</span></div>
        <div className="chips">{incSummary.length ? incSummary.map(text => <i key={text}>{text}</i>) : <em>기재요령과 바이트 조건만 들어가요</em>}</div>
        <button type="button" data-kdn-bare className="krw-btn pri" onClick={() => setPickOpen(true)}><ListChecks size={14} /> 넣을 자료 고르기 · 확인</button>
      </div>
      {pickOpen && createPortal(<div className="krw krw-modal" role="dialog" aria-modal="true" aria-label="요청문에 넣을 것 고르기" onClick={event => { if (event.target === event.currentTarget) setPickOpen(false); }}><div className="krw-modal-box krw-pick">
        <header><b><ListChecks size={17} /> 요청문에 넣을 것</b><button type="button" data-kdn-bare onClick={() => setPickOpen(false)} aria-label="닫기"><X size={16} /></button></header>
        <p>'{target?.label}' 칸 요청문에 함께 보낼 자료를 골라요. 학생 이름은 들어가지 않아요.</p>
        <div className="krw-pick-body">
          <section><h4>누가기록 <small>선생님 관찰 기록</small></h4>{filledCats.length ? filledCats.map(c => <label key={c.key} className="opt"><input type="checkbox" checked={isPicked(c)} onChange={() => togglePick(c.key)} /><span><b>{c.label}</b><em>{clip(rec.textOf(sid, c.key), 90)}</em></span></label>) : <p className="none">이 학생 누가기록이 아직 없어요.</p>}</section>
          {refls.length > 0 && <section><h4>학생 소감문 <small>학생이 쓴 글 · 사실 확인용</small></h4>{refls.map(item => <label key={item.key} className="opt"><input type="checkbox" checked={!!reflPick[item.key]} onChange={() => setReflPick(v => ({ ...v, [item.key]: !v[item.key] }))} /><span><b>{item.activity}{item.date ? ` · ${item.date}` : ""}</b><em>{clip(item.response, 90)}</em></span></label>)}</section>}
          {aiContext.standardsFor && <section><h4>성취기준</h4>{stdList.length ? <label className="opt"><input type="checkbox" checked={useStd} onChange={event => setUseStd(event.target.checked)} /><span><b>이 활동 성취기준 {stdList.length}개</b><em>{stdList.map(item => item.code).join(" ")}</em></span></label> : <p className="none">연결한 성취기준이 없어요. '성취기준' 탭에서 연결해요.</p>}</section>}
          {aiContext.subject && <section><h4>쓰는 방식</h4>
            <label className="opt"><input type="checkbox" checked={useFrame} onChange={event => setUseFrame(event.target.checked)} /><span><b>교과세특 구성 틀</b><em>성취수준 → 수행 과정·결과 → 역량 → 교사 총평</em></span></label>
            {exPick ? <label className="opt"><input type="checkbox" checked={useEx} onChange={event => setUseEx(event.target.checked)} /><span><b>기재 예시: {exPick.s}</b><em>문체 참고용 · <button type="button" data-kdn-bare className="krw-linkbtn" onClick={() => { setPickOpen(false); setStep("examples"); }}>바꾸기</button></em></span></label>
              : <p className="none">기재 예시는 넣지 않아요. <button type="button" data-kdn-bare className="krw-linkbtn" onClick={() => { setPickOpen(false); setStep("examples"); }}>예시 고르기</button></p>}
          </section>}
          <section><h4>학생 진로희망</h4>{hope ? <label className="opt"><input type="checkbox" checked={useHope} onChange={event => setUseHope(event.target.checked)} /><span><b>{hope}</b><em>관찰 기록에 있는 내용만 진로와 이어 쓰도록 알려요</em></span></label> : <p className="none">{aiContext.subject ? "교과 화면에는 진로희망이 없어요." : "학생 화면 위 '진로희망' 칸에 적으면 요청문에 넣을 수 있어요."}</p>}</section>
          <section><h4>여러 활동 쓰는 법</h4><label className="opt"><input type="checkbox" checked={multi} onChange={event => setMultiPick(event.target.checked)} /><span><b>활동마다 줄 바꿔 따로 쓰기</b><em>관련 없는 활동을 '~에서는', '~에서도'로 억지로 이어 한 문단으로 만들지 않게 해요</em></span></label></section>
          <section><h4>지금 칸에 쓴 글</h4><label className="opt"><input type="checkbox" checked={refine} onChange={event => setRefine(event.target.checked)} /><span><b>함께 보내 다듬어 달라고 하기</b><em>{current.trim() ? clip(current, 90) : "아직 비어 있어요"}</em></span></label></section>
        </div>
        <div className="ft"><span>{incSummary.length ? incSummary.join(" · ") : "기재요령과 바이트만 들어가요"}</span><button type="button" data-kdn-bare className="krw-btn pri" onClick={() => setPickOpen(false)}>다 골랐어요</button></div>
      </div></div>, document.body)}
      <details className="krw-ai-preview"><summary>요청문 미리 보기 <small>{prompt.length.toLocaleString()}자</small></summary><pre className="krw-ai-prompt">{prompt}</pre></details>
      <div className="krw-ai-go">
        <button type="button" data-kdn-bare className="krw-btn pri copy" onClick={copy}><Copy size={14} /> 요청문 복사</button>
        <button type="button" data-kdn-bare className="krw-btn ai-claude" onClick={() => openAi("claude")} title="요청문을 담아 Claude 새 창 열기"><ExternalLink size={14} /> Claude</button>
        <button type="button" data-kdn-bare className="krw-btn ai-gpt" onClick={() => openAi("chatgpt")} title="요청문을 담아 ChatGPT 새 창 열기"><ExternalLink size={14} /> ChatGPT</button>
      </div>
      <p className="krw-ai-tip">학교 방침에 맞는 AI를 써 주세요. 받은 답은 <button type="button" data-kdn-bare className="krw-linkbtn" onClick={() => setStep("answer")}>2 답 점검</button>에 붙여넣어 확인해요.</p>
    </div>}
    {step === "answer" && <div className="krw-ai-body">
      <p className="krw-ai-lead">AI 답을 붙여넣으면 바이트와 기재요령을 바로 점검해요. <b>관찰하지 않은 내용</b>이 없는지 꼭 읽어 보세요.</p>
      {filledCats.length > 0 && <div className="krw-ai-load"><select value={loadKey || defaultLoad} onChange={event => setLoadKey(event.target.value)} aria-label="가져올 누가기록">{filledCats.map(c => <option key={c.key} value={c.key}>{c.label} 누가기록</option>)}</select><button type="button" data-kdn-bare className="krw-btn" onClick={() => { const text = rec.textOf(sid, loadKey || defaultLoad); setAnswer(value => value.trim() ? `${value.trim()}\n${text}` : text); }}><ClipboardPaste size={14} /> 누가기록 가져오기</button></div>}
      <textarea value={answer} spellCheck={false} onChange={event => setAnswer(event.target.value)} placeholder="AI 답을 붙여넣거나, 위에서 누가기록(보관해 둔 AI 초안 등)을 가져와 다듬어요" />
      <div className="krw-ai-meter"><ByteMeter text={answer} limit={budget || 1} />{autoFixRecordText(answer) !== answer && <button type="button" data-kdn-bare className="krw-fix" onClick={() => setAnswer(autoFixRecordText(answer))}><Wand2 size={13} /> 기호 자동 고치기</button>}</div>
      {answer && <IssueList text={answer} />}
      <div className="krw-ai-acts"><button type="button" data-kdn-bare className="krw-btn pri" disabled={!answer.trim()} onClick={() => { if (!current.trim() || window.confirm(`'${target?.label}' 칸의 지금 글을 이 글로 바꿀까요?`)) putText(answer, "replace"); }}>칸을 이 글로 바꾸기</button><button type="button" data-kdn-bare className="krw-btn" disabled={!answer.trim()} onClick={() => putText(answer, "append")}>칸 끝에 덧붙이기</button><button type="button" data-kdn-bare className="krw-btn ghost" disabled={!answer.trim()} onClick={() => { const key = cats.find(c => c.target === targetKey)?.key || "memo"; const prev = rec.textOf(sid, key); rec.edit(`s|${sid}|${key}`, `${prev}${prev ? "\n\n" : ""}[AI 초안 ${todayLabel()}]\n${answer.trim()}`); showToast?.("누가기록에 보관했어요.", "success"); }}>누가기록에 보관</button></div>
    </div>}
    {step === "examples" && <ExamplesPane subject={aiContext.subject || ""} picked={exPick} onPick={item => { setExPick(item); setUseEx(true); if (item) { setStep("prompt"); showToast?.(`'${item.s}' 예시를 요청문에 문체 참고로 넣었어요.`, "success"); } }} />}
    {step === "trim" && <div className="krw-ai-body">
      <p className="krw-ai-lead">'{target?.label}' 칸의 문장별 바이트예요. 뺄 문장의 체크를 풀면 남는 글이 한도 안인지 바로 보여요.</p>
      {sentences.length ? <ul className="krw-trim">{sentences.map((sentence, i) => <li key={i} className={drop[i] ? "is-off" : ""}><label><input type="checkbox" checked={!drop[i]} onChange={() => setDrop(value => ({ ...value, [i]: !value[i] }))} /><span>{sentence}</span></label><em>{neisBytes(sentence)}</em></li>)}</ul> : <p className="krw-side-empty">칸에 쓴 글이 없어요.</p>}
      {sentences.length > 0 && <><div className="krw-ai-meter"><span>남길 글</span><ByteMeter text={kept} limit={budget || 1} /></div>
        <button type="button" data-kdn-bare className="krw-btn pri" disabled={!Object.values(drop).some(Boolean)} onClick={() => { putText(kept, "replace"); setDrop({}); }}>고른 문장만 남기기</button></>}
    </div>}
  </div>;
}

// 반 전체 중복 문장 찾기(복붙 세특 점검)
// 같은 문장 경고: 반 전체(위쪽 띠)와 지금 학생(학생 칸 위)
function DupBanner({ dups, onOpen }) {
  if (!dups.length) return null;
  const same = dups.filter(item => !item.similar).length;
  const similar = dups.length - same;
  const people = new Set(dups.flatMap(item => item.people.map(p => p.sid))).size;
  return <div className="krw-dupbar" role="alert">
    <AlertTriangle size={20} />
    <div><b>여러 학생에게 같은 문장이 들어가 있어요</b><span>{[same && `같은 문장 ${same}개`, similar && `비슷한 문장 ${similar}개`].filter(Boolean).join(" · ")} · 학생 {people}명 — 학생마다 다른 관찰 내용으로 바꿔 주세요.</span></div>
    <button type="button" data-kdn-bare onClick={onOpen}>어떤 문장인지 보기</button>
  </div>;
}
function DupStudentNote({ dups, sid, onPick }) {
  const mine = dups.filter(item => item.people.some(p => p.sid === sid));
  if (!mine.length) return null;
  const myAreas = item => Array.from(new Set(item.people.filter(p => p.sid === sid && p.areaLabel).map(p => p.areaLabel)));
  const others = item => { const seen = new Set(); return item.people.filter(p => p.sid !== sid && !seen.has(p.sid) && seen.add(p.sid)); };
  return <div className="krw-dupnote" role="alert">
    <b><AlertTriangle size={15} /> 이 학생 글의 문장 {mine.length}개가 다른 학생(또는 다른 영역)과 {mine.every(item => item.similar) ? "비슷해요" : "같아요"}</b>
    <ul>{mine.slice(0, 3).map((item, index) => <li key={index}>{myAreas(item).map(label => <span key={label} className="krw-dup-area">{label}</span>)}<q>{item.sentence}</q><span>{others(item).map(p => <button key={p.sid} type="button" data-kdn-bare onClick={() => onPick(p.sid, p.area)}>{p.label}</button>)}</span></li>)}{mine.length > 3 && <li className="more">외 {mine.length - 3}개 · 위쪽 '어떤 문장인지 보기'에서 모두 봐요</li>}</ul>
  </div>;
}

function DuplicateModal({ entries, dups: given = null, title, onClose, onPick }) {
  const dups = useMemo(() => given || findDuplicateSentences(entries), [given, entries]);
  return <div className="krw-modal" role="dialog" aria-modal="true" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="krw-modal-box krw-dup">
      <header><b><Search size={17} /> 같은 문장 점검 · {title}</b><button type="button" data-kdn-bare onClick={onClose}><X size={16} /></button></header>
      <p>여러 학생에게 <b>똑같이</b> 들어간 문장(띄어쓰기·기호 무시, 5자 이상)과, 조사·어미만 바꾼 <b>거의 같은</b> 문장(15자 이상)을 찾아요. 학생마다 다른 관찰 내용으로 바꾸면 좋아요. 학생을 누르면 그 학생으로 가요.</p>
      {dups.length ? <ul>{dups.map((item, index) => <li key={index} className={item.similar ? "is-similar" : ""}><div className="q"><span className="tag">{item.similar ? "비슷한 문장" : "같은 문장"}</span><q>{item.sentence}</q>{item.variants?.map((v, i) => <q key={i} className="v">{v}</q>)}</div><em>{item.count ?? item.people.length}명{Object.keys(item.areas || {}).length > 0 && <span className="areas">{Object.entries(item.areas).map(([label, n]) => <i key={label}>{label} {n}</i>)}</span>}</em><div className="who">{item.people.map(p => <button key={`${p.sid}|${p.area || ""}`} type="button" data-kdn-bare className={p.similar ? "is-sim" : ""} title={p.similar ? "비슷한 문장" : "같은 문장"} onClick={() => { onPick(p.sid, p.area); onClose(); }}>{p.label}{p.areaLabel && <small>{p.areaLabel}</small>}</button>)}</div></li>)}</ul> : <p className="krw-side-empty">겹치는 문장이 없어요.</p>}
    </div>
  </div>;
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

// 거름: 전체 · 덜 쓴 학생 · 한도 넘음 · 점검 필요 (건수가 0인 거름은 흐리게)
function Progress({ done, total, filter, setFilter, counts = {} }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const chips = [["all", "전체", total], ["empty", "덜 쓴 학생", counts.empty], ["over", "한도 넘음", counts.over], ["issue", "점검 필요", counts.issue], ["event", "행사 미확인", counts.event]].filter(([key, , n]) => n !== undefined && (key === "all" || n > 0 || filter === key)); // 0명인 거르기는 숨겨 한 줄에
  return <div className="krw-progress"><span>작성 <b>{done}</b> / {total}명</span><i><em style={{ width: `${pct}%` }} /></i>
    <span className="krw-filter" role="group" aria-label="학생 거르기">{chips.map(([key, label, n]) => <button key={key} type="button" data-kdn-bare aria-pressed={filter === key} className={`${key !== "all" && !n ? "is-zero" : ""} f-${key}`} onClick={() => setFilter(filter === key ? "all" : key)}>{label}{key !== "all" && <span className="n">{n}</span>}</button>)}</span></div>;
}
const overLimit = (text, limit) => neisBytes(text) > limit;
const hasIssue = text => !!String(text || "").trim() && checkRecordText(text).length > 0;
function FindBox({ find, setFind }) {
  return <label className="krw-find is-inline"><Search size={14} /><input value={find} onChange={event => setFind(event.target.value)} placeholder="이름·번호 찾기" />{find && <button type="button" data-kdn-bare onClick={() => setFind("")} aria-label="지우기"><X size={13} /></button>}</label>;
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

// 학생 목록(한 줄에 한 명). meter(s) → { tip, over }: 마우스를 올리면 바이트, 한도를 넘으면 빨간 이름
function StudentList({ items, current, onPick, find, setFind, renderRight, meter }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.querySelector("button.is-on")?.scrollIntoView({ block: "nearest" }); }, [current]);
  return <nav className="krw-list" ref={ref}>
    <label className="krw-find"><Search size={14} /><input value={find} onChange={event => setFind(event.target.value)} placeholder="이름·번호 찾기" /></label>
    {items.map(s => { const m = meter ? meter(s) : null; return <button key={s.sid} type="button" data-kdn-bare className={`${s.sid === current ? "is-on" : ""}${m?.over ? " is-over" : ""}`} title={m?.tip || ""} onClick={() => onPick(s.sid)}>
      <span className="no">{s.label}</span><span className="nm">{s.name}</span>{renderRight(s)}
    </button>; })}
    {!items.length && <p className="krw-side-empty">조건에 맞는 학생이 없어요.</p>}
  </nav>;
}

// 한눈에 표의 학생 칸: 번호·이름만 크게, 다 쓰면 초록 번호. '자세히'는 줄에 마우스를 올리거나 쓰는 중일 때만 보여요.
function StudentCell({ no, name, done, total, onOpen }) {
  const full = total > 0 && done === total;
  return <th className="nm" scope="row">
    <div className="nm-in">
      <span className="top"><span className={`no${full ? " is-full" : ""}`} title={`${done}/${total}칸 작성`}>{full ? <Check size={12} /> : null}{no}</span>
        {onOpen && <button type="button" data-kdn-bare className="open" onClick={onOpen} aria-label={`${name} 학생별 보기로 열기`} title="학생별 보기에서 이 학생 열기(자료·AI 도우미)"><ChevronRight size={14} /></button>}</span>
      <b>{name}</b>
    </div>
  </th>;
}

// 한눈에 표의 글 칸: 비어 있으면 입력칸만, 글이 있으면 바이트·복사, 점검에 걸리면 무엇이 걸렸는지 바로 아래에 적어요.
function GridCell({ color, text, check, label, placeholder, onChange, meter }) {
  const issues = useMemo(() => (check && text.trim() ? checkRecordText(text) : []), [check, text]);
  const tone = issues.some(item => item.level === "block") ? "has-block" : issues.length ? "has-warn" : "";
  return <td style={{ "--c": color }}>
    <textarea rows={2} value={text} spellCheck={false} aria-label={label} placeholder={placeholder} className={tone} onChange={event => onChange(event.target.value)} />
    {text.trim() && <div className="cellft">{meter}<CopyBtn text={text} /></div>}
    {issues.length > 0 && <IssueMini issues={issues} />}
  </td>;
}
function IssueMini({ issues }) {
  const merged = [];
  issues.forEach(item => { const found = merged.find(x => x.kind === item.kind && x.match === item.match); if (found) found.count += 1; else merged.push({ ...item, count: 1 }); });
  merged.sort((a, b) => (a.level === "block" ? 0 : 1) - (b.level === "block" ? 0 : 1));
  const head = merged.slice(0, 3);
  const rest = merged.slice(3);
  return <ul className="krw-iss-mini">{head.map((item, index) => <li key={index} className={item.level === "block" ? "is-block" : "is-warn"} title={item.fix}>
    <b>{item.level === "block" ? "불가" : "권장"}</b><span>{item.kind}</span><code>{item.match}</code>{item.count > 1 && <em>×{item.count}</em>}
  </li>)}{rest.length > 0 && <li className="more" title={rest.map(item => `${item.kind}: ${item.match}`).join("\n")}>외 {rest.length}건</li>}</ul>;
}

// ── 학급담임 ───────────────────────────────────────────────────────────────
// ── 학교 행사 특기사항(부서별 취합 파일) ───────────────────────────────────
// 학년마다 한 곳에 모아 두고(kd_rec_events_v1_연도_학년), 담임은 학생별로 자율·진로 칸 아래에서 골라 넣어요.
// 학생별 확인 상태는 반 생기부 자료에 's|학번|ev:행사키' = "in"(반영함) · "out"(뺌)으로 저장해요.
const eventDocKey = (year, grade) => `kd_rec_events_v1_${year}_${grade}`;
function useEventDoc(year, grade) {
  const key = eventDocKey(year, grade);
  const [doc, setDoc] = useState({ files: [], items: [] });
  useEffect(() => { let alive = true; readStorage(key, { files: [], items: [] }).then(value => { if (alive && value && typeof value === "object") setDoc({ files: value.files || [], items: value.items || [] }); }).catch(() => null); return () => { alive = false; }; }, [key]);
  const update = async updater => { const result = await updateStorage(key, { files: [], items: [] }, current => updater({ files: current?.files || [], items: current?.items || [] })); if (result?.ok && result.value) setDoc(result.value); return result; };
  const bySid = useMemo(() => { const map = new Map(); (doc.items || []).forEach(item => { if (!map.has(item.sid)) map.set(item.sid, []); map.get(item.sid).push(item); }); return map; }, [doc.items]);
  return { doc, update, bySid };
}
const evStatusKey = item => `ev:${item.eventKey}`;
// 넣을 차례인 행사: 확인 안 함, 또는 '반영함'인데 칸에서 글을 지운 경우(다시 넣기)
const evNeeds = (rec, item) => { const st = rec.textOf(item.sid, evStatusKey(item)); return !st || (st === "in" && !rec.textOf(item.sid, item.area).includes(item.text.trim())); };
// 행사 세특 파일 올리기·빼기(관리자·부서 공용·학년부장)
// 한 파일에 여러 학년이 들어 있으면 학년마다 따로 저장해요(지금 학년은 화면에도 바로 반영).
function useEventUpload(ev, grade, by, showToast, canManage, year) {
  const [busy, setBusy] = useState(false);
  const upload = async list => {
    if (!canManage) { showToast?.("행사 세특 파일은 관리자·부서·학년부장 계정이 올려요.", "error"); return; }
    setBusy(true);
    try {
      const mod = await import("xlsx-js-style"); const XLSX = mod.default?.utils ? mod.default : mod;
      for (const file of Array.from(list || [])) {
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const { items, skipped } = parseEventSheets(wb.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: true }) })));
        const byGrade = {};
        items.forEach(item => { const g = String(item.sid).charAt(0); if (/[1-3]/.test(g)) (byGrade[g] ||= []).push(item); });
        const grades = Object.keys(byGrade).sort();
        if (!grades.length) { showToast?.(`${file.name}: 자율·진로 특기사항을 찾지 못했어요. '학번'·'생기부 영역'·'특기사항' 칸이 있는지 확인해 주세요.`, "error"); continue; }
        const fileId = `f_${file.name}`;
        const apply = list => current => ({ files: [...(current.files || []).filter(f => f.id !== fileId), { id: fileId, name: file.name, at: nowIso(), by, count: list.length }], items: [...(current.items || []).filter(item => item.fileId !== fileId), ...list.map(item => ({ ...item, fileId }))] });
        const done = []; const failed = [];
        for (const g of grades) {
          const result = String(g) === String(grade) ? await ev.update(apply(byGrade[g])) : await updateStorage(eventDocKey(year, g), { files: [], items: [] }, current => apply(byGrade[g])({ files: current?.files || [], items: current?.items || [] }));
          (result?.ok ? done : failed).push(`${g}학년 ${byGrade[g].length}건`);
        }
        const extra = [skipped.otherArea && `자율·진로가 아닌 ${skipped.otherArea}건(동아리 등)`, skipped.merged && `학생별로 합쳐 둔 시트(${skipped.merged})`].filter(Boolean).join(", ");
        if (done.length) showToast?.(`${file.name}: ${done.join(" · ")}을 불러왔어요${extra ? ` · ${extra}는 뺐어요` : ""}.`, "success");
        if (failed.length) showToast?.(`${file.name}: ${failed.join(" · ")}을 저장하지 못했어요. 다시 올려 주세요.`, "error");
      }
    } catch (error) { showToast?.(`파일을 읽지 못했어요. (${error?.message || error})`, "error"); }
    setBusy(false);
  };
  const remove = async file => { if (!window.confirm(`'${file.name}'에서 불러온 특기사항을 모두 뺄까요? (담임이 이미 칸에 넣은 글은 그대로예요)`)) return; await ev.update(current => ({ files: current.files.filter(f => f.id !== file.id), items: current.items.filter(item => item.fileId !== file.id) })); };
  return { busy, upload, remove };
}
// 위쪽 '행사 세특' 탭: 학년 단위로 파일을 모아 관리하고, 반별 확인 현황을 한눈에
function EventAdmin({ year, grade, rosterFor, by, showToast, canManage }) {
  const ev = useEventDoc(year, grade);
  const { busy, upload, remove } = useEventUpload(ev, grade, by, showToast, canManage, year);
  const inputRef = useRef(null);
  const roster = rosterFor(grade) || {};
  const classes = useMemo(() => Array.from(new Set(Object.values(roster).map(info => String(info?.class || "")).filter(Boolean))).sort((a, b) => Number(a) - Number(b)), [roster]);
  const classOf = sid => String(roster?.[sid]?.class || Number(String(sid).slice(1, 3)) || "");
  const [docs, setDocs] = useState({});
  const [loading, setLoading] = useState(false);
  const loadDocs = useCallback(async () => {
    setLoading(true);
    const pairs = await Promise.all(classes.map(async c => [c, await readStorage(hrKey(year, grade, c), emptyDoc()).catch(() => emptyDoc())]));
    setDocs(Object.fromEntries(pairs)); setLoading(false);
  }, [classes.join(","), year, grade]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadDocs(); }, [loadDocs]);
  const events = useMemo(() => {
    const map = new Map();
    (ev.doc.items || []).forEach(item => {
      const row = map.get(item.eventKey) || { item, total: 0, done: 0, byClass: {} };
      const c = classOf(item.sid); const cell = row.byClass[c] || (row.byClass[c] = { total: 0, done: 0 });
      const st = docs[c]?.students?.[item.sid]?.[`ev:${item.eventKey}`]?.t || "";
      row.total += 1; cell.total += 1; if (st) { row.done += 1; cell.done += 1; }
      map.set(item.eventKey, row);
    });
    return Array.from(map.values()).sort((a, b) => a.item.area.localeCompare(b.item.area) || a.item.event.localeCompare(b.item.event));
  }, [ev.doc.items, docs]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="krw-body krw-evadmin">
    <div className="krw-bar"><b className="krw-scope">{grade}학년 행사 특기사항</b><span className="sp" />
      <button type="button" data-kdn-bare className="krw-btn" onClick={loadDocs} disabled={loading}>{loading ? <Loader2 size={14} className="spin" /> : <RotateCcw size={14} />} 확인 현황 새로 보기</button>
      {canManage && <><button type="button" data-kdn-bare className="krw-btn pri" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? <Loader2 size={14} className="spin" /> : <FileSpreadsheet size={14} />} 취합 파일 올리기</button><input ref={inputRef} type="file" hidden multiple accept=".xlsx,.xls" onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ""; upload(files); }} /></>}
    </div>
    <p className="krw-evadmin-note">부서별로 모은 <b>행사 특기사항 취합 파일(xlsx)</b>을 여기서 한 번에 올려요. 한 파일에 여러 학년이 있으면 학년마다 나눠 저장해요. 시트마다 '학번 · 생기부 영역 · 행사명 · 특기사항' 칸을 읽어, 담임 화면의 학생별 <b>자율·자치 / 진로</b> 칸 위에 띄워요. 같은 이름의 파일을 다시 올리면 새 내용으로 바뀌어요.{!canManage && <> 파일은 관리자·부서·학년부장 계정이 올려요.</>}</p>
    <section className="krw-card"><h4>올린 파일</h4>
      {(ev.doc.files || []).length ? <ul className="krw-evf-files">{ev.doc.files.map(file => <li key={file.id}><FileSpreadsheet size={14} /><span><b>{file.name}</b><small>{file.count}건 · {file.by ? `${file.by} · ` : ""}{new Date(file.at).toLocaleDateString("ko-KR")}</small></span>{canManage && <button type="button" data-kdn-bare onClick={() => remove(file)} aria-label="빼기" title="이 파일에서 불러온 특기사항 빼기"><Trash2 size={13} /></button>}</li>)}</ul> : <p className="none">아직 올린 파일이 없어요.</p>}
    </section>
    <section className="krw-card"><h4>반별 확인 현황 <small>담임이 '반영함' 또는 '뺌'으로 확인한 학생 수 / 대상 학생 수</small></h4>
      {events.length ? <div className="krw-table-wrap"><table className="krw-evf-tbl is-wide"><thead><tr><th>행사</th><th>영역</th>{classes.map(c => <th key={c}>{c}반</th>)}<th>합계</th></tr></thead>
        <tbody>{events.map(({ item, total, done, byClass }) => <tr key={item.eventKey}><td><b>{item.event}</b></td><td><span className={`krw-refl-tag is-${item.area}`}>{RECORD_AREAS[item.area].short}</span></td>
          {classes.map(c => { const cell = byClass[c]; return <td key={c} className={!cell ? "na" : cell.done < cell.total ? "is-left" : "is-done"}>{cell ? `${cell.done}/${cell.total}` : "·"}</td>; })}
          <td className={done < total ? "is-left" : "is-done"}><b>{done}/{total}</b></td></tr>)}</tbody></table></div> : <p className="none">불러온 행사 특기사항이 없어요.</p>}
    </section>
  </div>;
}
// 특기사항 일괄 지우기: 지울 칸(영역·활동)과 범위(지금 학생 / 반 전체)를 고르고, 지우기 전에 반 자료를 백업 파일로 받아 둬요.
function ClearModal({ fields, students, current, rec, title, backupName, extra = null, showToast, onClose }) {
  const [scope, setScope] = useState(current ? "student" : "class");
  const [pick, setPick] = useState(() => Object.fromEntries(fields.map(f => [f.key, false])));
  const [withExtra, setWithExtra] = useState(false);
  const [backup, setBackup] = useState(true);
  const list = scope === "student" && current ? [current] : students;
  const keys = fields.filter(f => pick[f.key]).map(f => f.key);
  const targets = []; list.forEach(st => keys.forEach(key => { if (rec.textOf(st.sid, key).trim()) targets.push([st.sid, key]); }));
  const people = new Set(targets.map(([sid]) => sid)).size;
  const run = async () => {
    if (!targets.length && !(withExtra && extra)) return;
    const who = scope === "student" ? `${current.number}번 학생` : `${title} 학생 ${people}명`;
    if (!window.confirm(`${who}의 ${fields.filter(f => pick[f.key]).map(f => f.label).join(" · ")} 칸 ${targets.length}개를 지울까요?\n지운 글은 되돌리기 어려워요.${backup ? " 지우기 전에 반 자료 백업 파일을 내려받아요." : ""}`)) return;
    if (backup) { await rec.save(); downloadJson(`${backupName}_지우기전_${new Date().toISOString().slice(0, 10)}.json`, rec.doc); }
    targets.forEach(([sid, key]) => rec.edit(`s|${sid}|${key}`, ""));
    if (withExtra && extra) extra.run(list);
    showToast?.(`${targets.length}칸을 지웠어요.`, "success");
    onClose();
  };
  return createPortal(<div className="krw krw-modal" role="dialog" aria-modal="true" aria-label="특기사항 일괄 지우기" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="krw-modal-box krw-clear">
    <header><b><Trash2 size={17} /> 특기사항 일괄 지우기</b><button type="button" data-kdn-bare onClick={onClose} aria-label="닫기"><X size={16} /></button></header>
    <p>지울 칸과 범위를 골라요. 누가기록·소감문·활동 목록은 지우지 않아요.</p>
    <div className="row"><span className="k">범위</span><div className="v">{current && <label className={`chip${scope === "student" ? " on" : ""}`}><input type="radio" name="clr-scope" checked={scope === "student"} onChange={() => setScope("student")} />지금 학생({current.number}번)</label>}<label className={`chip${scope === "class" ? " on" : ""}`}><input type="radio" name="clr-scope" checked={scope === "class"} onChange={() => setScope("class")} />{title} 전체({students.length}명)</label></div></div>
    <div className="row"><span className="k">지울 칸</span><div className="v">{fields.map(f => { const n = list.filter(st => rec.textOf(st.sid, f.key).trim()).length; return <label key={f.key} className={`chip${pick[f.key] ? " on" : ""}`}><input type="checkbox" checked={!!pick[f.key]} onChange={() => setPick(v => ({ ...v, [f.key]: !v[f.key] }))} />{f.label}<em>{n}</em></label>; })}</div></div>
    {extra && <div className="row"><span className="k">함께</span><div className="v"><label className={`chip${withExtra ? " on" : ""}`}><input type="checkbox" checked={withExtra} onChange={event => setWithExtra(event.target.checked)} />{extra.label}</label></div></div>}
    <div className="row"><span className="k">안전</span><div className="v"><label className={`chip${backup ? " on" : ""}`}><input type="checkbox" checked={backup} onChange={event => setBackup(event.target.checked)} />지우기 전에 백업 파일 받기(권장)</label></div></div>
    <div className="ft"><span>{targets.length ? `${people}명 · ${targets.length}칸을 지워요` : "지울 칸을 골라 주세요"}</span><button type="button" data-kdn-bare className="krw-btn danger" disabled={!targets.length && !(withExtra && extra)} onClick={run}><Trash2 size={14} /> 지우기</button></div>
  </div></div>, document.body);
}
// 나이스 파일 반영: 나이스에서 내려받은 엑셀(영역별)을 올리면 우리 반 글과 비교해, 고른 칸만 나이스 글로 바꿔요.
// 선생님이 나이스에서 바이트를 줄이는 등 고친 글을 다시 가져올 때 써요.
const normText = text => String(text || "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
function NeisImportModal({ students, rec, grade, cls, backupName, limitOf, showToast, onClose }) {
  const [rows, setRows] = useState(null);
  const [pick, setPick] = useState({});
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState({});
  const [note, setNote] = useState("");
  const [hopes, setHopes] = useState({}); // 나이스 '희망분야' → 우리 쪽 진로희망이 비어 있는 학생만
  const [fillHope, setFillHope] = useState(true);
  const inputRef = useRef(null);
  const bySid = new Map(students.map(st => [st.sid, st]));
  const read = async list => {
    setBusy(true);
    try {
      const mod = await import("xlsx-js-style"); const XLSX = mod.default?.utils ? mod.default : mod;
      const found = []; let other = 0; let outside = 0; let files = 0;
      for (const file of list) {
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const parsed = parseNeisRecordSheets(wb.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: true }) })));
        if (parsed.rows.length) files += 1;
        other += parsed.skipped.otherArea;
        parsed.rows.forEach(row => { if (String(row.grade) !== String(grade) || String(row.cls) !== String(Number(cls))) { outside += 1; return; } found.push(row); });
      }
      if (!found.length) { showToast?.(outside ? `${grade}학년 ${cls}반 학생이 없는 파일이에요(다른 반 ${outside}줄).` : "나이스 생기부 파일을 찾지 못했어요. '반·번호·특기사항' 칸이 있는 나이스 엑셀인지 확인해 주세요.", "error"); setBusy(false); return; }
      const merged = new Map(); found.forEach(row => merged.set(`${row.sid}|${row.area}`, row));
      const list2 = Array.from(merged.values()).map(row => {
        const cur = normText(rec.textOf(row.sid, row.area)); const neis = normText(row.text);
        const state = !bySid.has(row.sid) ? "none" : cur === neis ? "same" : !neis ? "empty" : !cur ? "new" : "diff";
        return { ...row, text: neis, cur, state };
      }).sort((a, b) => a.sid.localeCompare(b.sid) || HOMEROOM_AREAS.indexOf(a.area) - HOMEROOM_AREAS.indexOf(b.area));
      setRows(list2);
      setHopes(found.filter(row => row.hope && bySid.has(row.sid) && !rec.textOf(row.sid, "hope").trim()).reduce((m, row) => ({ ...m, [row.sid]: row.hope }), {}));
      setPick(Object.fromEntries(list2.filter(r => r.state === "diff" || r.state === "new").map(r => [`${r.sid}|${r.area}`, true])));
      setNote([files > 1 && `파일 ${files}개`, other && `다른 영역 ${other}줄`, outside && `다른 반 ${outside}줄`].filter(Boolean).join(" · "));
    } catch (error) { showToast?.(`파일을 읽지 못했어요. (${error?.message || error})`, "error"); }
    setBusy(false);
  };
  const count = state => (rows || []).filter(r => r.state === state).length;
  const picked = (rows || []).filter(r => pick[`${r.sid}|${r.area}`]);
  const hopeCount = fillHope ? Object.keys(hopes).length : 0;
  const apply = async () => {
    if (!picked.length && !hopeCount) return;
    if (!window.confirm(`${picked.length ? `고른 ${picked.length}칸을 나이스 글로 바꿀까요?` : ""}${hopeCount ? `${picked.length ? "\n" : ""}진로희망 ${hopeCount}명을 나이스 '희망분야'로 채울까요?` : ""}\n바꾸기 전에 반 자료 백업 파일을 내려받아요.`)) return;
    await rec.save(); downloadJson(`${backupName}_나이스반영전_${new Date().toISOString().slice(0, 10)}.json`, rec.doc);
    picked.forEach(r => rec.edit(`s|${r.sid}|${r.area}`, r.text));
    if (hopeCount) Object.entries(hopes).forEach(([sid, hope]) => rec.edit(`s|${sid}|hope`, hope));
    showToast?.(`나이스 글 ${picked.length}칸${hopeCount ? ` · 진로희망 ${hopeCount}명` : ""}을 반영했어요.`, "success");
    onClose();
  };
  const label = { same: "같음", diff: "바뀜", new: "새 글", empty: "나이스 빈칸", none: "명단에 없음" };
  return createPortal(<div className="krw krw-modal" role="dialog" aria-modal="true" aria-label="나이스 파일 반영" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="krw-modal-box krw-neis">
    <header><b><FileSpreadsheet size={17} /> 나이스 파일 반영 · {grade}학년 {cls}반</b><button type="button" data-kdn-bare onClick={onClose} aria-label="닫기"><X size={16} /></button></header>
    <p>나이스에서 내려받은 <b>자율·자치 / 진로 / 행발 엑셀</b>(영역별 파일 여러 개 가능)을 올리면, 우리 반 글과 비교해 <b>달라진 칸만</b> 골라 나이스 글로 바꿔요. 나이스에서 바이트를 줄이는 등 고친 글을 다시 맞출 때 써요.</p>
    <div className="up"><button type="button" data-kdn-bare className="krw-btn pri" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? <Loader2 size={14} className="spin" /> : <FileSpreadsheet size={14} />} 나이스 엑셀 고르기</button><input ref={inputRef} type="file" hidden multiple accept=".xlsx,.xls" onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ""; if (files.length) read(files); }} />{note && <small>{note}</small>}</div>
    {rows && <>
      <div className="sum">{["diff", "new", "same", "empty", "none"].filter(state => count(state)).map(state => <span key={state} className={`is-${state}`}>{label[state]} <b>{count(state)}</b></span>)}</div>
      <div className="krw-table-wrap"><table className="krw-neis-tbl"><thead><tr><th className="ck" /><th>학생</th><th>영역</th><th>지금</th><th>나이스</th><th>상태</th></tr></thead>
        <tbody>{rows.filter(r => r.state !== "same").map(r => { const k = `${r.sid}|${r.area}`; const st = bySid.get(r.sid); const lim = limitOf(r.area); const nb = neisBytes(r.text); const can = r.state === "diff" || r.state === "new" || r.state === "empty"; return <React.Fragment key={k}>
          <tr className={`is-${r.state}`}><td className="ck"><input type="checkbox" disabled={!can} checked={!!pick[k]} onChange={() => setPick(v => ({ ...v, [k]: !v[k] }))} aria-label="반영할 칸 고르기" /></td>
            <td className="who"><button type="button" data-kdn-bare onClick={() => setOpen(v => ({ ...v, [k]: !v[k] }))}>{st ? `${st.number} ${st.name}` : r.sid}</button></td><td>{RECORD_AREAS[r.area].short}</td>
            <td className="b">{neisBytes(r.cur).toLocaleString()}</td><td className={`b${nb > lim ? " over" : ""}`}>{nb.toLocaleString()}</td><td><span className={`tag is-${r.state}`}>{label[r.state]}</span></td></tr>
          {open[k] && <tr className="detail"><td /><td colSpan={5}><div><small>지금</small><p>{r.cur || "(비어 있음)"}</p></div><div><small>나이스</small><p>{r.text || "(비어 있음)"}</p></div></td></tr>}
        </React.Fragment>; })}</tbody></table></div>
      {Object.keys(hopes).length > 0 && <label className="krw-ai-chk"><input type="checkbox" checked={fillHope} onChange={event => setFillHope(event.target.checked)} /> 나이스 '희망분야'로 진로희망 {Object.keys(hopes).length}명 채우기 <small>(비어 있는 학생만)</small></label>}
      {count("same") > 0 && <p className="same">같은 칸 {count("same")}개는 목록에서 뺐어요. 학생을 누르면 두 글을 비교해 볼 수 있어요.</p>}
      <div className="ft"><span>{picked.length ? `${picked.length}칸을 나이스 글로 바꿔요` : "바꿀 칸을 골라 주세요"}{count("empty") ? " · '나이스 빈칸'은 고르면 우리 쪽 글이 지워져요" : ""}</span><button type="button" data-kdn-bare className="krw-btn pri" disabled={!picked.length && !hopeCount} onClick={apply}><Check size={14} /> 고른 칸 반영</button></div>
    </>}
  </div></div>, document.body);
}
// 교과담임 엑셀 양식·올리기: 활동(수행평가 영역)마다 칸을 나눈 엑셀을 받고, 이미 쓴 엑셀을 올려 활동 칸에 채워요.
// 엑셀 머리글이 활동 이름과 같으면 그 활동에, 없는 이름은 새 활동으로 만들 수 있어요. '총합본' 칸은 읽지 않아요.
function SubjectExcelModal({ acts, students, rec, book, fileLabel, showToast, onClose }) {
  const [withText, setWithText] = useState(true);
  const [plan, setPlan] = useState(null); // { cols: [{ label, actId|null, use }], rows: [{ st, texts }], unmatched }
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const download = async () => {
    if (!acts.length) { showToast?.("먼저 수행평가 활동을 추가해 주세요. 활동 이름이 엑셀 칸 이름이 돼요.", "error"); return; }
    await exportXlsx(`과세특_양식_${fileLabel}.xlsx`, [{ name: "과세특", header: ["번호", "학번", "이름", ...acts.map(act => act.name)], widths: [6, 9, 10, ...acts.map(() => 50)],
      rows: students.map(st => [st.number, st.sid, st.name, ...acts.map(act => (withText ? rec.textOf(st.sid, act.id) : ""))]) }]);
  };
  const read = async file => {
    setBusy(true);
    try {
      const mod = await import("xlsx-js-style"); const XLSX = mod.default?.utils ? mod.default : mod;
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const parsed = parseCheckSheet(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false }));
      if (parsed.error) { showToast?.(parsed.error, "error"); setBusy(false); return; }
      const key = v => String(v || "").replace(/\s+/g, "");
      const cols = parsed.columns.map(col => { const total = /총합|합계/.test(col.label); const act = acts.find(a => key(a.name) === key(col.label)); return { label: col.label, actId: act?.id || null, use: !total, total }; });
      const bySid = new Map(students.map(st => [String(st.sid), st]));
      const byName = new Map(); students.forEach(st => { byName.set(st.name, byName.has(st.name) ? null : st); });
      const byNo = new Map(students.map(st => [String(st.number), st]));
      let unmatched = 0;
      const rows = parsed.rows.map(row => {
        const sid = String(row.sid || "").replace(/\.0+$/, "").replace(/\D/g, "");
        const st = (sid && bySid.get(sid)) || (row.name && byName.get(row.name)) || (book?.kind === "common" && row.no && byNo.get(String(Number(row.no)))) || null;
        if (!st) unmatched += 1;
        return { st, texts: row.texts };
      }).filter(row => row.st && row.texts.some(Boolean));
      setPlan({ cols, rows, unmatched });
    } catch (error) { showToast?.(`파일을 읽지 못했어요. (${error?.message || error})`, "error"); }
    setBusy(false);
  };
  const changes = plan ? plan.rows.reduce((n, row) => n + plan.cols.filter((col, i) => col.use && row.texts[i] && (!col.actId || normText(rec.textOf(row.st.sid, col.actId)) !== normText(row.texts[i]))).length, 0) : 0;
  const apply = async () => {
    const newActs = []; const ids = plan.cols.map(col => { if (!col.use) return null; if (col.actId) return col.actId; const id = uid(); newActs.push({ id, name: col.label }); return id; });
    if (!window.confirm(`엑셀 글 ${changes}칸을 활동 칸에 넣을까요?${newActs.length ? `\n새 활동 ${newActs.length}개(${newActs.map(a => a.name).join(", ")})를 만들어요.` : ""}\n바꾸기 전에 반 자료 백업 파일을 내려받아요.`)) return;
    await rec.save(); downloadJson(`과세특_${fileLabel}_엑셀반영전_${new Date().toISOString().slice(0, 10)}.json`, rec.doc);
    if (newActs.length) rec.edit("acts", [...rec.activities, ...newActs]);
    plan.rows.forEach(row => plan.cols.forEach((col, i) => { const id = ids[i]; const text = String(row.texts[i] || "").trim(); if (id && text) rec.edit(`s|${row.st.sid}|${id}`, text); }));
    showToast?.(`엑셀 글을 반영했어요(${plan.rows.length}명).`, "success");
    onClose();
  };
  return createPortal(<div className="krw krw-modal" role="dialog" aria-modal="true" aria-label="과세특 엑셀" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="krw-modal-box krw-sjx">
    <header><b><FileSpreadsheet size={17} /> 과세특 엑셀 · {book?.subject} {book?.label}</b><button type="button" data-kdn-bare onClick={onClose} aria-label="닫기"><X size={16} /></button></header>
    <section><h4>① 양식 받기</h4><p>수행평가 활동마다 칸이 나뉜 엑셀이에요(번호 · 학번 · 이름 · 활동…). 엑셀에서 써서 ②로 올리면 돼요.</p>
      <div className="row"><label className="krw-ai-chk"><input type="checkbox" checked={withText} onChange={event => setWithText(event.target.checked)} /> 지금 쓴 글 채워서 받기</label><button type="button" data-kdn-bare className="krw-btn" onClick={download}><Download size={14} /> 양식 받기 ({acts.length}개 활동)</button></div></section>
    <section><h4>② 이미 쓴 엑셀 올리기</h4><p>첫 줄(머리글)에 <b>학번 또는 이름</b>과 활동 칸이 있으면 돼요. 머리글이 활동 이름과 같으면 그 활동에, 없는 이름은 새 활동으로 넣어요. '총합본'·'바이트' 칸은 읽지 않아요.</p>
      <div className="row"><button type="button" data-kdn-bare className="krw-btn pri" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? <Loader2 size={14} className="spin" /> : <FileSpreadsheet size={14} />} 엑셀 고르기</button><input ref={inputRef} type="file" hidden accept=".xlsx,.xls,.csv" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) read(file); }} /></div>
      {plan && <>
        <ul className="cols">{plan.cols.map((col, i) => <li key={i} className={col.use ? "" : "off"}><label><input type="checkbox" checked={col.use} onChange={() => setPlan(v => ({ ...v, cols: v.cols.map((c, j) => j === i ? { ...c, use: !c.use } : c) }))} /><b>{col.label}</b></label><span>{col.total ? "총합본(읽지 않음)" : col.actId ? "→ 같은 이름 활동" : "→ 새 활동으로"}</span></li>)}</ul>
        <p className="sum">학생 {plan.rows.length}명 · 바뀌는 칸 {changes}개{plan.unmatched ? ` · 명단에서 못 찾은 줄 ${plan.unmatched}개(빼고 넣어요)` : ""}</p>
        <div className="ft"><span>같은 글인 칸은 그대로 두고, 엑셀에 빈칸이면 지우지 않아요.</span><button type="button" data-kdn-bare className="krw-btn pri" disabled={!changes} onClick={apply}><Check size={14} /> 활동 칸에 넣기</button></div>
      </>}
    </section>
  </div></div>, document.body);
}
// '학년 자료' 탭: 학년 단위로 모아 쓰는 자료(행사 세특 취합 파일 · 2학년부 활동 배정·소감문)를 한곳에서
function GradeDataTab({ legacy, events }) {
  const [part, setPart] = useState(() => { try { return localStorage.getItem("kd_rec_grade_part") === "legacy" && legacy ? "legacy" : "events"; } catch { return "events"; } });
  const pick = value => { setPart(value); try { localStorage.setItem("kd_rec_grade_part", value); } catch { /* 편의 기능 */ } };
  return <div className="krw-body">
    {legacy && <div className="krw-gdseg" role="tablist">
      <button type="button" data-kdn-bare role="tab" aria-selected={part === "events"} onClick={() => pick("events")}><CalendarCheck size={15} /><span><b>행사 세특</b><small>부서 취합 파일 올리기 · 반별 확인 현황</small></span></button>
      <button type="button" data-kdn-bare role="tab" aria-selected={part === "legacy"} onClick={() => pick("legacy")}><Users size={15} /><span><b>2학년부 활동·소감문</b><small>활동 배정 · 학생 소감문 파일</small></span></button>
    </div>}
    {part === "legacy" && legacy ? legacy : events}
  </div>;
}
// 학급담임 '행사' 창: 우리 반 행사별 확인 현황 + 고른 행사를 반 전체 학생 칸에 한 번에 넣기
function EventFilesModal({ ev, students, rec, showToast, onClose, onPick = null }) {
  const readOnlyView = useContext(ReadOnlyContext);
  const [mode, setMode] = useState("events"); // events: 행사별 일괄 · students: 학생별 현황
  const sids = new Set(students.map(s => s.sid));
  const mine = (ev.doc.items || []).filter(item => sids.has(item.sid));
  const events = new Map();
  mine.forEach(item => { const st = evNeeds(rec, item) ? "" : rec.textOf(item.sid, evStatusKey(item)); const row = events.get(item.eventKey) || { item, total: 0, done: 0, left: 0 }; row.total += 1; if (st) row.done += 1; else row.left += 1; events.set(item.eventKey, row); });
  const rows = Array.from(events.values());
  const [pick, setPick] = useState(() => Object.fromEntries(rows.filter(row => row.left).map(row => [row.item.eventKey, true])));
  const picked = rows.filter(row => pick[row.item.eventKey]);
  // 학생·영역마다 넣을 글을 모아 한 번에(같은 칸을 여러 번 고치면 앞의 글이 덮이므로)
  const applyBulk = () => {
    const keys = new Set(picked.map(row => row.item.eventKey));
    const plan = new Map(); // `${sid}|${area}` → [items]
    mine.filter(item => keys.has(item.eventKey) && evNeeds(rec, item)).forEach(item => { const k = `${item.sid}|${item.area}`; if (!plan.has(k)) plan.set(k, []); plan.get(k).push(item); });
    if (!plan.size) { showToast?.("넣을 학생이 없어요. 이미 모두 확인했어요.", "success"); return; }
    const people = new Set(Array.from(plan.keys()).map(k => k.split("|")[0])).size;
    if (!window.confirm(`고른 행사 ${picked.length}개를 우리 반 ${people}명의 칸 끝에 넣고 '반영함'으로 표시할까요?\n('빼기'·'반영함'으로 이미 확인한 학생은 건너뛰어요. 넣은 뒤에도 학생마다 고쳐 쓸 수 있어요.)`)) return;
    let added = 0;
    plan.forEach((list, k) => {
      const [sid, area] = k.split("|");
      const field = rec.textOf(sid, area);
      const add = list.map(item => item.text.trim()).filter(text => !field.includes(text)).join("\n"); // 행사마다 줄 바꿈
      if (add) { rec.edit(`s|${sid}|${area}`, field.trim() ? `${field.trim()}\n${add}` : add); added += 1; }
      list.forEach(item => rec.edit(`s|${sid}|${evStatusKey(item)}`, "in"));
    });
    showToast?.(`${people}명의 칸에 행사 특기사항을 넣었어요. 바이트 한도를 넘은 학생은 '한도 넘음'으로 확인해 주세요.`, "success");
    setPick({});
  };
  // 이미 넣은 행사 글을 행사마다 한 줄로(예전에 띄어쓰기로 붙여 넣은 칸 정리)
  const fixLines = () => {
    const plan = new Map();
    mine.forEach(item => { const k = `${item.sid}|${item.area}`; if (!plan.has(k)) plan.set(k, []); plan.get(k).push(item.text); });
    let changed = 0;
    plan.forEach((texts, k) => { const [sid, area] = k.split("|"); const field = rec.textOf(sid, area); const next = lineBreakEvents(field, texts); if (next !== field) { rec.edit(`s|${sid}|${area}`, next); changed += 1; } });
    showToast?.(changed ? `${changed}칸의 행사 글을 행사마다 줄 바꿨어요.` : "줄 바꿀 칸이 없어요. 이미 행사마다 줄이 바뀌어 있어요.", "success");
  };
  return createPortal(<div className="krw krw-modal" role="dialog" aria-modal="true" aria-label="행사 특기사항" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div className="krw-modal-box krw-evf">
    <header><b><CalendarCheck size={17} /> 행사 특기사항 · 우리 반</b><button type="button" data-kdn-bare onClick={onClose} aria-label="닫기"><X size={16} /></button></header>
    <div className="krw-refl-seg" role="tablist"><button type="button" data-kdn-bare role="tab" aria-selected={mode === "events"} onClick={() => setMode("events")}>행사별 · 반 전체 넣기</button><button type="button" data-kdn-bare role="tab" aria-selected={mode === "students"} onClick={() => setMode("students")}>학생별 현황</button></div>
    {mode === "students" ? <StudentEventGrid students={students} rows={rows} mine={mine} rec={rec} onPick={onPick ? (sid, area) => { onPick(sid, area); onClose(); } : null} /> : <>
    <p>부서에서 보낸 행사 특기사항을 <b>반 전체 학생 칸에 한 번에</b> 넣을 수 있어요. 넣을 행사를 고르고 아래 버튼을 눌러요. 파일은 <b>'학년 자료 → 행사 세특'</b>에서 올려요.</p>
    {rows.length ? <table className="krw-evf-tbl"><thead><tr>{!readOnlyView && <th className="ck" />}<th>행사</th><th>영역</th><th>대상</th><th>확인</th></tr></thead><tbody>{rows.map(({ item, total, done, left }) => <tr key={item.eventKey} className={left ? "is-left" : ""}>
      {!readOnlyView && <td className="ck"><input type="checkbox" aria-label={`${item.event} 고르기`} disabled={!left} checked={!!pick[item.eventKey]} onChange={() => setPick(v => ({ ...v, [item.eventKey]: !v[item.eventKey] }))} /></td>}
      <td><b>{item.event}</b></td><td>{RECORD_AREAS[item.area].short}</td><td>{total}명</td><td>{done}/{total}</td></tr>)}</tbody></table> : <p className="none">우리 반 학생의 행사 특기사항이 아직 없어요.</p>}
    {!readOnlyView && rows.length > 0 && <div className="ft"><span>{picked.length ? `고른 행사 ${picked.length}개 · 확인 안 한 학생 ${picked.reduce((sum, row) => sum + row.left, 0)}명분` : "넣을 행사를 골라 주세요"}</span><button type="button" data-kdn-bare className="krw-btn pri" disabled={!picked.length} onClick={applyBulk}><Users size={14} /> 반 전체 칸에 넣기</button></div>}
    {!readOnlyView && rows.length > 0 && <p className="krw-evf-fix"><button type="button" data-kdn-bare className="krw-linkbtn" onClick={fixLines}>이미 넣은 행사 글 줄 바꾸기(반 전체)</button> — 예전에 띄어 쓰기로 붙여 넣은 칸을 행사마다 한 줄로 정리해요.</p>}
    </>}
  </div></div>, document.body);
}
// 학생 × 행사 표: ✓ 반영함 · 뺌 · ● 확인 안 함 · 빈칸은 대상 아님
function StudentEventGrid({ students, rows, mine, rec, onPick }) {
  if (!rows.length) return <p className="none">우리 반 학생의 행사 특기사항이 아직 없어요.</p>;
  const has = new Map(mine.map(item => [`${item.sid}|${item.eventKey}`, item]));
  return <div className="krw-table-wrap krw-evgrid"><table><thead><tr><th className="nm">학생</th>{rows.map(({ item }) => <th key={item.eventKey} title={item.event}><span className={`krw-refl-tag is-${item.area}`}>{RECORD_AREAS[item.area].short}</span><b>{item.event}</b></th>)}<th>남음</th></tr></thead>
    <tbody>{students.map(st => { let left = 0; const cells = rows.map(({ item }) => { const it = has.get(`${st.sid}|${item.eventKey}`); if (!it) return <td key={item.eventKey} className="na" />; const v = evNeeds(rec, it) ? "" : rec.textOf(st.sid, evStatusKey(it)); if (!v) left += 1; return <td key={item.eventKey} className={v ? `is-${v}` : "is-left"} title={v === "in" ? "반영함" : v === "out" ? "뺌" : "확인 안 함"}>{v === "in" ? "✓" : v === "out" ? "뺌" : "●"}</td>; });
      return <tr key={st.sid} className={left ? "has-left" : ""}><th className="nm">{onPick ? <button type="button" data-kdn-bare onClick={() => onPick(st.sid, rows.find(({ item }) => has.has(`${st.sid}|${item.eventKey}`) && !rec.textOf(st.sid, evStatusKey(item)))?.item.area)}>{st.number} {st.name}</button> : <>{st.number} {st.name}</>}</th>{cells}<td className="left">{left || ""}</td></tr>; })}</tbody></table>
    <p className="legend">✓ 반영함 · 뺌 · <b>●</b> 확인 안 함 · 빈칸은 대상 아님{onPick ? " · 학생을 누르면 그 학생으로 가요" : ""}</p></div>;
}
// 학생 화면 위: 이 학생의 행사 한 줄(영역·확인 상태). 누르면 그 영역 탭으로
function EventStrip({ items, rec, sid, onFocus }) {
  if (!items.length) return null;
  return <div className="krw-evstrip"><span className="lb"><CalendarCheck size={13} /> 행사 {items.length}</span>{items.map(item => { const v = evNeeds(rec, item) ? "" : rec.textOf(sid, evStatusKey(item)); return <button key={item.eventKey} type="button" data-kdn-bare className={`chip is-${v || "left"}`} title={`${RECORD_AREAS[item.area].label} · ${v === "in" ? "반영함" : v === "out" ? "뺌" : "확인 안 함"}`} onClick={() => onFocus?.(item.area)}><i className={`a is-${item.area}`}>{RECORD_AREAS[item.area].short}</i>{item.event}<em>{v === "in" ? "✓" : v === "out" ? "뺌" : "●"}</em></button>; })}</div>;
}
// 학생 한 명의 행사 특기사항: 하나씩 '칸에 넣기'(넣고 반영 표시) 또는 '빼기'(이 학생은 안 씀). 표시는 되돌릴 수 있어요.
function EventBox({ items, rec, sid, area }) {
  const readOnlyView = useContext(ReadOnlyContext);
  const [open, setOpen] = useState({});
  useEffect(() => { setOpen({}); }, [sid]);
  if (!items.length) return null;
  const status = item => rec.textOf(sid, evStatusKey(item));
  const mark = (item, value) => rec.edit(`s|${sid}|${evStatusKey(item)}`, value);
  const field = rec.textOf(sid, area);
  const insert = list => {
    const add = list.map(item => item.text.trim()).filter(text => !field.includes(text)).join("\n"); // 행사마다 줄 바꿈
    if (add) rec.edit(`s|${sid}|${area}`, field.trim() ? `${field.trim()}\n${add}` : add);
    list.forEach(item => mark(item, "in"));
  };
  const needs = item => !status(item) || (status(item) === "in" && !field.includes(item.text.trim()));
  const left = items.filter(needs);
  const label = RECORD_AREAS[area]?.short || "";
  return <div className={`krw-evbox${left.length ? " has-left" : ""}`} data-tour="rw-events">
    <div className="hd"><CalendarCheck size={14} /><b>행사 특기사항</b><span>{left.length ? <em>넣을 행사 {left.length}개</em> : <i><Check size={12} /> 모두 확인했어요</i>}</span>
      {left.length > 1 && !readOnlyView && <button type="button" data-kdn-bare className="krw-mini" onClick={() => insert(left)}>남은 {left.length}개 모두 넣기</button>}</div>
    <ul>{items.map(item => { const st = status(item); const inField = field.includes(item.text.trim()); return <li key={item.eventKey} className={st ? `is-${st}` : ""}>
      <div className="body"><button type="button" data-kdn-bare className="ttl" onClick={() => setOpen(v => ({ ...v, [item.eventKey]: !v[item.eventKey] }))} title="눌러서 전체 글 보기"><b>{item.event}</b><small>{neisBytes(item.text).toLocaleString()} byte</small></button>
        <p className={open[item.eventKey] ? "is-open" : ""}>{item.text}</p></div>
      <div className="act">{readOnlyView ? null : !st ? <>
          <button type="button" data-kdn-bare className="go" onClick={() => insert([item])} title={`${label} 칸 끝에 이 글을 넣고 '반영함'으로 표시`}><ChevronLeft size={13} style={{ transform: "rotate(-90deg)" }} /> 칸에 넣기</button>
          <button type="button" data-kdn-bare className="skip" onClick={() => mark(item, "out")} title="이 학생은 이 행사를 쓰지 않아요">빼기</button></>
        : <><span className={`tag is-${st}`}>{st === "in" ? <><Check size={12} /> 반영함</> : "뺌"}</span>{st === "in" && !inField && <button type="button" data-kdn-bare className="go" onClick={() => insert([item])} title="칸에서 이 글이 지워졌어요. 다시 넣어요">다시 넣기</button>}{false && <small className="warn" title="표시는 '반영함'인데 칸에 이 글이 없어요(고쳐 썼다면 괜찮아요)">칸에 원문 없음</small>}
          <button type="button" data-kdn-bare className="undo" onClick={() => mark(item, "")} title="확인 표시만 지워요(칸의 글은 그대로)">되돌리기</button></>}</div>
    </li>; })}</ul>
  </div>;
}

function HomeroomWriter({ year, grade, classOptions, rosterFor, by, view, setView, check, showToast, onScope, reflectionsBySid = null }) {
  const readOnlyView = useContext(ReadOnlyContext);
  const lim = key => areaLimit(key, grade); // 2026학년도 3학년은 예전 한도
  const [cls, setCls] = useState(() => classOptions[0] || "");
  useEffect(() => { if (!classOptions.includes(cls)) setCls(classOptions[0] || ""); }, [classOptions.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (cls) onScope?.(`hr:${cls}`); }, [cls]); // eslint-disable-line react-hooks/exhaustive-deps
  const students = useMemo(() => Object.entries(rosterFor(grade) || {}).filter(([, info]) => String(info?.class) === String(cls)).map(([sid, info]) => ({ sid, name: info?.name || "", number: Number(info?.number) || Number(String(sid).slice(-2)) })).sort((a, b) => a.number - b.number), [rosterFor, grade, cls]);
  const rec = useRecordDoc(cls ? hrKey(year, grade, cls) : "", by);
  const [sid, setSid] = useState("");
  const [area, setArea] = useState("autonomy");
  const [find, setFind] = useState("");
  const [filter, setFilter] = useState("all");
  const [side, setSide] = useState(true);
  const [paste, setPaste] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [evOpen, setEvOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [neisOpen, setNeisOpen] = useState(false);
  // 소감문 일괄: 반 학생 모두의 소감문을 영역별 누가기록에 담기(이미 담긴 건 건너뜀)
  const bulkReflections = reflectionsBySid ? () => {
    const plan = students.map(s => [s, reflectionsBySid.get(sidKey(s.sid)) || []]).filter(([, list]) => list.length);
    if (!plan.length) { showToast?.("이 반 학생의 소감문이 없어요.", "error"); return; }
    if (!window.confirm(`${cls}반 학생 ${plan.length}명의 소감문을 영역별 누가기록 끝에 담을까요? (이미 담긴 건 건너뛰고, 생기부 칸에는 넣지 않아요)`)) return;
    const total = plan.reduce((sum, [s, list]) => sum + reflectionsToMemo(rec, s.sid, list), 0);
    showToast?.(total ? `소감문 ${total}개를 ${plan.length}명의 누가기록에 담았어요.` : "이미 모두 누가기록에 담겨 있어요.", "success");
  } : null;
  // 학생별 보기에서 한 번에 한 영역만(자율·자치 / 진로 / 행발). '모두'는 예전처럼 세 칸을 한 화면에.
  const [focus, setFocusRaw] = useState(() => { try { const v = localStorage.getItem("kd_rec_hr_focus"); return ["autonomy", "career", "behavior", "all"].includes(v) ? v : "autonomy"; } catch { return "autonomy"; } });
  const setFocus = value => { setFocusRaw(value); try { localStorage.setItem("kd_rec_hr_focus", value); } catch { /* 편의 기능 */ } };
  const ev = useEventDoc(year, grade);
  const eventsOf = (s, area) => (ev.bySid.get(s.sid) || []).filter(item => !area || item.area === area);
  const eventLeft = s => eventsOf(s).filter(item => evNeeds(rec, item)).length;
  const classEvents = students.reduce((sum, s) => sum + eventsOf(s).length, 0);
  useEffect(() => { if (!students.some(s => s.sid === sid)) setSid(students[0]?.sid || ""); }, [students]); // eslint-disable-line react-hooks/exhaustive-deps
  const filled = s => HOMEROOM_AREAS.filter(key => rec.textOf(s.sid, key).trim()).length;
  const isOver = s => HOMEROOM_AREAS.some(key => overLimit(rec.textOf(s.sid, key), lim(key)));
  const isIssue = s => HOMEROOM_AREAS.some(key => hasIssue(rec.textOf(s.sid, key)));
  const test = { all: () => true, empty: s => filled(s) < HOMEROOM_AREAS.length, over: isOver, issue: isIssue, event: s => eventLeft(s) > 0 };
  const counts = { empty: students.filter(test.empty).length, over: students.filter(isOver).length, ...(check ? { issue: students.filter(isIssue).length } : {}), ...(classEvents ? { event: students.filter(test.event).length } : {}) };
  const shown = students.filter(s => (!find.trim() || s.name.includes(find.trim()) || s.sid.includes(find.trim()) || String(s.number) === find.trim()) && (test[filter] || test.all)(s));
  const openStudent = id => { setSid(id); setView?.("student"); };
  // 영역마다 따로 비교하고(어느 영역에서 겹쳤는지), 부서 행사 특기사항 원문에서 온 문장은 같은 문장으로 보지 않아요.
  // 겹친 문장에서 학생을 누르면 그 학생 · 그 영역으로
  const pickDup = (id, area) => { setSid(id); if (area && focus !== "all") setFocus(area); setView?.("student"); };
  const eventTexts = useMemo(() => Array.from(new Set((ev.doc.items || []).map(item => item.text))), [ev.doc.items]);
  const dups = useMemo(() => findDuplicateSentences(students.flatMap(s => HOMEROOM_AREAS.map(key => ({ sid: s.sid, label: `${s.number}번`, area: key, areaLabel: RECORD_AREAS[key].short, text: rec.textOf(s.sid, key) }))), { ignore: eventTexts }), [students, rec.textOf, eventTexts]);
  const current = students.find(s => s.sid === sid);
  const order = shown.length ? shown : students;
  const idx = order.findIndex(s => s.sid === sid);
  const go = step => { const next = order[idx + step]; if (next) setSid(next.sid); };
  const saveNow = useCallback(async () => { if (await rec.save()) showToast?.("저장했어요.", "success"); }, [rec, showToast]);
  useWriterKeys({ onNext: () => go(1), onPrev: () => go(-1), onSave: saveNow });

  const blocksFor = list => list.map(s => ({ no: `${s.number}번`, name: s.name, sub: s.sid, parts: HOMEROOM_AREAS.map(key => { const text = rec.textOf(s.sid, key); return { label: RECORD_AREAS[key].label, text, bytes: neisBytes(text), limit: lim(key), issues: issueLine(text) }; }) }));
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
    <div className="krw-bar" data-tour="rw-bar">
      {classOptions.length > 1 ? <select value={cls} onChange={event => setCls(event.target.value)} aria-label="반">{classOptions.map(c => <option key={c} value={c}>{grade}학년 {c}반</option>)}</select> : <b className="krw-scope">{grade}학년 {cls}반 담임</b>}
      {rec.loaded && students.length > 0 && <Progress done={students.filter(s => filled(s) === HOMEROOM_AREAS.length).length} total={students.length} filter={filter} setFilter={setFilter} counts={counts} />}
      {view !== "student" && <FindBox find={find} setFind={setFind} />}
      <span className="sp" />
      <SaveBadge rec={rec} />
      <button type="button" data-kdn-bare className="krw-btn pri" onClick={saveNow} disabled={!Object.keys(rec.pending).length || rec.status === "saving"}><Save size={15} /> 지금 저장</button>
      <PrintMenu onPick={output} scopes={[["student", "지금 학생"], ["class", `${cls}반 전체`]]} />
      <button type="button" data-kdn-bare className="krw-btn" data-tour="rw-evbtn" onClick={() => setEvOpen(true)} title="부서별 행사 특기사항 취합 파일 올리기 · 반 확인 현황"><CalendarCheck size={15} /> 행사{classEvents > 0 && <em className="krw-cnt">{students.filter(test.event).length || "✓"}</em>}</button>
      <button type="button" data-kdn-bare className="krw-btn sec" onClick={() => setDupOpen(true)} title="같은 문장 점검: 여러 학생에게 똑같이 들어간 문장 찾기"><Search size={15} /><span className="lb">같은 문장</span></button>
      <button type="button" data-kdn-bare className="krw-btn sec" title="백업: 이 반 자료를 파일로 내려받아 따로 보관" onClick={() => downloadJson(`생기부_${grade}-${cls}_${new Date().toISOString().slice(0, 10)}.json`, rec.doc)}><Download size={15} /><span className="lb">백업</span></button>
      {!readOnlyView && <button type="button" data-kdn-bare className="krw-btn sec" data-tour="rw-neis" title="나이스 파일 반영: 나이스에서 내려받은 엑셀로 고친 글 다시 맞추기" onClick={() => setNeisOpen(true)}><FileSpreadsheet size={15} /><span className="lb">나이스 반영</span></button>}
      {!readOnlyView && <button type="button" data-kdn-bare className="krw-btn sec" data-tour="rw-clear" title="특기사항 일괄 지우기(지금 학생 또는 반 전체)" onClick={() => setClearOpen(true)}><Trash2 size={15} /><span className="lb">지우기</span></button>}
    </div>
    {rec.error && <p className="krw-alert"><AlertTriangle size={15} /> {rec.error}</p>}
    {rec.loaded && <DupBanner dups={dups} onOpen={() => setDupOpen(true)} />}
    {dupOpen && <DuplicateModal title={`${cls}반`} dups={dups} onPick={pickDup} onClose={() => setDupOpen(false)} />}
    {neisOpen && <NeisImportModal students={students} rec={rec} grade={grade} cls={cls} backupName={`생기부_${grade}-${cls}`} limitOf={lim} showToast={showToast} onClose={() => setNeisOpen(false)} />}
    {clearOpen && <ClearModal fields={HOMEROOM_AREAS.map(key => ({ key, label: RECORD_AREAS[key].short }))} students={students} current={view === "student" ? current : null} rec={rec} title={`${cls}반`} backupName={`생기부_${grade}-${cls}`} showToast={showToast} onClose={() => setClearOpen(false)}
      extra={{ label: "행사 확인 표시(반영함·뺌)도 지우기", run: list => list.forEach(st => (ev.bySid.get(st.sid) || []).forEach(item => { if (rec.textOf(st.sid, evStatusKey(item))) rec.edit(`s|${st.sid}|${evStatusKey(item)}`, ""); })) }} />}
    {evOpen && <EventFilesModal ev={ev} students={students} rec={rec} showToast={showToast} onPick={pickDup} onClose={() => setEvOpen(false)} />}
    {!rec.loaded ? <div className="krw-empty"><Loader2 size={18} className="spin" /> 불러오는 중이에요.</div>
      : !students.length ? <div className="krw-empty"><Users size={20} /><b>{cls}반 명단이 없어요.</b><span>관리자 화면에서 {grade}학년 명단을 올려 주세요.</span></div>
      : view === "table" ? <div className="krw-table-wrap"><table className="krw-table krw-grid"><colgroup><col className="c-nm" />{HOMEROOM_AREAS.map(key => <col key={key} />)}</colgroup>
        <thead><tr><th className="nm">학생</th>{HOMEROOM_AREAS.map(key => <th key={key} style={{ "--c": AREA_COLOR[key] }}><span className="h"><i />{RECORD_AREAS[key].label}<small>{students.filter(s => rec.textOf(s.sid, key).trim()).length}/{students.length}명 · 한도 {lim(key).toLocaleString()}</small></span></th>)}</tr></thead>
        <tbody>{shown.map((s, i) => <tr key={s.sid} className={`${i % 2 ? "is-alt" : ""}${isOver(s) ? " is-over" : ""}`}><StudentCell no={s.number} name={s.name} done={filled(s)} total={HOMEROOM_AREAS.length} onOpen={() => openStudent(s.sid)} />{HOMEROOM_AREAS.map(key => { const text = rec.textOf(s.sid, key); return <GridCell key={key} color={AREA_COLOR[key]} text={text} check={check} label={`${s.number}번 ${RECORD_AREAS[key].label}`} placeholder={`${RECORD_AREAS[key].short} 쓰기`} onChange={value => rec.edit(`s|${s.sid}|${key}`, value)} meter={<ByteMeter text={text} limit={lim(key)} />} />; })}</tr>)}</tbody></table>{!shown.length && <p className="krw-side-empty">조건에 맞는 학생이 없어요.</p>}</div>
      : view === "area" ? <div className="krw-area">
        <div className="krw-seg">{HOMEROOM_AREAS.map(key => <button key={key} type="button" data-kdn-bare aria-pressed={area === key} style={{ "--c": AREA_COLOR[key] }} onClick={() => setArea(key)}>{RECORD_AREAS[key].label}<em>{students.filter(s => rec.textOf(s.sid, key).trim()).length}/{students.length}</em></button>)}<span className="sp" /><button type="button" data-kdn-bare className="krw-btn" onClick={() => setPaste(true)}><ClipboardPaste size={14} /> 엑셀에서 붙여넣기</button></div>
        {shown.map(s => <Field key={s.sid} label={`${s.number}번 ${s.name}`} hint={RECORD_AREAS[area].label} color={AREA_COLOR[area]} text={rec.textOf(s.sid, area)} limit={lim(area)} check={check} rows={4} meta={rec.metaOf(s.sid, area)} onChange={value => rec.edit(`s|${s.sid}|${area}`, value)} />)}
        {paste && <PasteModal students={students} title={RECORD_AREAS[area].label} onClose={() => setPaste(false)} onApply={rows => rows.forEach(row => rec.edit(`s|${row.sid}|${area}`, row.text))} />}
      </div>
      : <div className={`krw-split${side ? " has-side" : ""}`}>
        <StudentList items={shown.map(s => ({ ...s, label: s.number }))} current={sid} onPick={setSid} find={find} setFind={setFind}
          meter={s => { const parts = HOMEROOM_AREAS.map(key => [{ ...RECORD_AREAS[key], limit: lim(key) }, neisBytes(rec.textOf(s.sid, key))]); const used = parts.reduce((sum, [, b]) => sum + b, 0); const cap = parts.reduce((sum, [area]) => sum + area.limit, 0); return { bar: false, p: cap ? used / cap : 0, over: parts.some(([area, b]) => b > area.limit), tip: parts.map(([area, b]) => `${area.short || area.label} ${b.toLocaleString()}/${area.limit.toLocaleString()}`).join(" · ") }; }}
          renderRight={s => <><span className="fill">{HOMEROOM_AREAS.map(key => <i key={key} style={{ "--c": AREA_COLOR[key] }} className={rec.textOf(s.sid, key).trim() ? "on" : ""} />)}</span>{check && <IssueDot text={HOMEROOM_AREAS.map(key => rec.textOf(s.sid, key)).join("\n")} />}{eventLeft(s) > 0 && <span className="krw-evdot" title={`행사 특기사항 확인 안 함 ${eventLeft(s)}개`}>{eventLeft(s)}</span>}</>} />
        {current && <section className="krw-pane" data-tour="rw-pane">
          <header className="krw-pane-hd"><button type="button" data-kdn-bare disabled={idx <= 0} onClick={() => go(-1)} aria-label="이전 학생" title="이전 학생 (Alt+↑)"><ChevronLeft size={18} /></button><div><b>{current.number}번 {current.name}</b><small>{current.sid} · {filled(current)}/3 영역 작성</small></div>{!side && <button type="button" data-kdn-bare className="side" onClick={() => setSide(true)}><PanelRightOpen size={16} /> 자료</button>}<button type="button" data-kdn-bare disabled={idx >= order.length - 1} onClick={() => go(1)} aria-label="다음 학생" title="다음 학생 (Alt+↓)"><ChevronRight size={18} /></button></header>
          <label className="krw-hope"><span>진로희망</span><input value={rec.textOf(current.sid, "hope")} readOnly={readOnlyView} placeholder="예: 건축가, 간호 계열 (AI 요청문에 넣을 수 있어요)" onChange={event => rec.edit(`s|${current.sid}|hope`, event.target.value)} /></label>
          <EventStrip items={eventsOf(current)} rec={rec} sid={current.sid} onFocus={area => { if (focus !== "all") setFocus(area); }} />
          <DupStudentNote dups={dups} sid={current.sid} onPick={pickDup} />
          <div className="krw-focus" role="tablist" aria-label="영역" data-tour="rw-focus">{[...HOMEROOM_AREAS, "all"].map(key => { const text = key === "all" ? "" : rec.textOf(current.sid, key); const left = key === "all" ? 0 : eventsOf(current, key).filter(item => evNeeds(rec, item)).length; const over = key !== "all" && neisBytes(text) > lim(key);
            return <button key={key} type="button" data-kdn-bare role="tab" aria-selected={focus === key} style={{ "--c": key === "all" ? "#5b606b" : AREA_COLOR[key] }} onClick={() => setFocus(key)}>
              <b>{key === "all" ? "모두 보기" : RECORD_AREAS[key].label}</b>
              {key !== "all" && <small className={over ? "over" : text.trim() ? "on" : ""}>{neisBytes(text).toLocaleString()} / {lim(key).toLocaleString()}</small>}
              {left > 0 && <em title={`확인 안 한 행사 특기사항 ${left}개`}>행사 {left}</em>}
            </button>; })}</div>
          {HOMEROOM_AREAS.filter(key => focus === "all" || focus === key).map(key => <React.Fragment key={key}><EventBox items={eventsOf(current, key)} rec={rec} sid={current.sid} area={key} /><Field label={RECORD_AREAS[key].label} color={AREA_COLOR[key]} text={rec.textOf(current.sid, key)} limit={lim(key)} check={check} rows={focus === "all" ? (key === "career" ? 8 : 6) : 12} meta={rec.metaOf(current.sid, key)} onChange={value => rec.edit(`s|${current.sid}|${key}`, value)} />
            </React.Fragment>)}
        </section>}
        {current && side && <SidePanel aiContext={{ hope: rec.textOf(current.sid, "hope") }} targets={HOMEROOM_AREAS.map(key => ({ key, label: RECORD_AREAS[key].label }))} budgetFor={key => lim(key)} focus={focus === "all" ? "" : focus} onBulkReflections={bulkReflections} studentName={current.name} reflections={reflectionsBySid ? reflectionsBySid.get(sidKey(current.sid)) || [] : null} rec={rec} sid={current.sid} studentLabel={`${current.number}번 ${current.name}`} scopeLabel={`${grade}-${cls} 학급`} by={by} showToast={showToast} onClose={() => setSide(false)} />}
      </div>}
  </div>;
}

// ── 교과담임 ───────────────────────────────────────────────────────────────
function ActivityManager({ activities, onChange, sources = [], onImport, onApplyAll, onStandards = null, standardsCount = () => 0 }) {
  const [name, setName] = useState("");
  const live = activities.filter(act => !act.removed);
  const hidden = activities.filter(act => act.removed);
  const add = () => { const value = name.trim(); if (!value) return; onChange([...activities, { id: uid(), name: value }]); setName(""); };
  return <div className="krw-acts" data-tour="rw-acts">
    <div className="hd"><b>수행평가 영역(활동)</b><small>활동별로 나눠 쓰면 총합본이 줄을 바꿔 합쳐져요</small><span className="sp" />
      {sources.length > 0 && <select value="" onChange={event => { if (event.target.value) onImport(event.target.value); }} aria-label="다른 반 활동 가져오기"><option value="">다른 반 활동 가져오기…</option>{sources.map(src => <option key={src.id} value={src.id}>{src.subject} · {src.label}</option>)}</select>}
      {onApplyAll && live.length > 0 && <button type="button" data-kdn-bare className="krw-btn" onClick={onApplyAll} title="같은 과목 내 다른 반에 이 활동 목록을 똑같이 넣어요(이미 있는 이름은 건너뜀)"><Copy size={13} /> 같은 과목 다른 반에도 적용</button>}
    </div>
    <div className="list">{live.map((act, index) => <span key={act.id} className="chip" style={{ "--c": ACT_COLORS[index % ACT_COLORS.length] }}>
      <i />
      <input value={act.name} aria-label="활동 이름" size={Math.max(4, Array.from(act.name).reduce((n, ch) => n + (ch.charCodeAt(0) > 0x7f ? 2 : 1), 0) + 1)} onChange={event => onChange(activities.map(item => item.id === act.id ? { ...item, name: event.target.value } : item))} />
      {onStandards && <button type="button" data-kdn-bare className={`std${standardsCount(act) ? " has" : ""}`} title="이 활동의 성취기준 고르기" onClick={() => onStandards(act.id)}><ListChecks size={12} />{standardsCount(act) ? standardsCount(act) : ""}</button>}
      <button type="button" data-kdn-bare title="앞으로" disabled={index === 0} onClick={() => { const order = live.map(a => a.id); [order[index - 1], order[index]] = [order[index], order[index - 1]]; onChange([...order.map(id => activities.find(a => a.id === id)), ...hidden]); }}><ChevronLeft size={13} /></button>
      <button type="button" data-kdn-bare title="숨기기(쓴 글은 지워지지 않아요)" onClick={() => onChange(activities.map(item => item.id === act.id ? { ...item, removed: true } : item))}><Trash2 size={12} /></button>
    </span>)}
      <span className="add"><input value={name} placeholder="예: 독서 탐구 보고서" onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") add(); }} /><button type="button" data-kdn-bare onClick={add}><Plus size={13} /> 활동 추가</button></span>
    </div>
    {hidden.length > 0 && <div className="hidden">숨긴 활동: {hidden.map(act => <button key={act.id} type="button" data-kdn-bare onClick={() => onChange(activities.map(item => item.id === act.id ? { ...item, removed: false } : item))}><RotateCcw size={11} /> {act.name}</button>)}</div>}
  </div>;
}

function SubjectWriter({ year, books, by, view, setView, check, showToast, grade = "", semester = "", onScope }) {
  const readOnlyView = useContext(ReadOnlyContext);
  const [clearOpen, setClearOpen] = useState(false);
  const [xlOpen, setXlOpen] = useState(false);
  const [bookId, setBookId] = useState(() => books[0]?.id || "");
  useEffect(() => { if (!books.some(book => book.id === bookId)) setBookId(books[0]?.id || ""); }, [books.map(b => b.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const book = books.find(item => item.id === bookId);
  useEffect(() => { if (bookId) onScope?.(`sj:${bookId}`); }, [bookId]); // eslint-disable-line react-hooks/exhaustive-deps
  const rec = useRecordDoc(book ? sjKey(year, book.id) : "", by);
  const acts = rec.activities.filter(act => !act.removed);
  const limit = RECORD_AREAS.subject.limit;
  const students = useMemo(() => (book?.students || []).map(s => ({ ...s, number: Number(s.number) || Number(String(s.sid).slice(-2)) })), [book]);
  const [sid, setSid] = useState("");
  const [actId, setActId] = useState("");
  const [find, setFind] = useState("");
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState("all");
  const [side, setSide] = useState(true);
  const [paste, setPaste] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [stdFor, setStdFor] = useState(null); // 성취기준 고르는 활동 id
  const std = useStandards(!!book);
  const stdSubjects = std.data?.subjects || [];
  const stdMatched = useMemo(() => resolveStandardSubject(book?.subject, grade, semester, stdSubjects).subject, [book?.subject, grade, semester, stdSubjects]);
  const standardsFor = useCallback(actKey => { const act = acts.find(a => a.id === actKey); return act?.std?.length ? findStandards(act.std, stdSubjects, act.stdSub || stdMatched?.n) : []; }, [acts, stdSubjects, stdMatched]);
  const saveStandards = (codes, subjectName) => { rec.edit("acts", rec.activities.map(a => a.id === stdFor ? { ...a, std: codes, stdSub: subjectName } : a)); showToast?.(codes.length ? `성취기준 ${codes.length}개를 연결했어요.` : "성취기준 연결을 풀었어요.", "success"); setStdFor(null); };
  useEffect(() => { if (!students.some(s => s.sid === sid)) setSid(students[0]?.sid || ""); }, [students]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!acts.some(a => a.id === actId)) setActId(acts[0]?.id || ""); }, [acts.map(a => a.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const texts = s => Object.fromEntries(acts.map(act => [act.id, rec.textOf(s.sid, act.id)]));
  const totalOf = s => mergeActivities(acts, texts(s));
  const doneOf = s => acts.length > 0 && acts.every(act => rec.textOf(s.sid, act.id).trim());
  const isOver = s => overLimit(totalOf(s), limit);
  const isIssue = s => hasIssue(totalOf(s));
  const test = { all: () => true, empty: s => !doneOf(s), over: isOver, issue: isIssue };
  const counts = { empty: students.filter(test.empty).length, over: students.filter(isOver).length, ...(check ? { issue: students.filter(isIssue).length } : {}) };
  const shown = students.filter(s => (!find.trim() || s.name.includes(find.trim()) || s.sid.includes(find.trim()) || String(s.number) === find.trim()) && (test[filter] || test.all)(s));
  const openStudent = id => { setSid(id); setView?.("student"); };
  const dups = useMemo(() => findDuplicateSentences(students.map(s => ({ sid: s.sid, label: book?.kind === "common" ? `${s.number}번` : `${s.class}-${s.number}`, text: totalOf(s) }))), [students, rec.textOf, rec.activities, book?.kind]); // eslint-disable-line react-hooks/exhaustive-deps
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
    const add = (src?.activities || []).filter(a => !a.removed && a.name.trim() && !names.has(a.name.trim())).map(a => ({ id: uid(), name: a.name, ...(a.std?.length ? { std: a.std, stdSub: a.stdSub || "" } : {}) }));
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
        const add = acts.filter(a => !have.has(a.name.trim())).map(a => ({ id: uid(), name: a.name, ...(a.std?.length ? { std: a.std, stdSub: a.stdSub || "" } : {}) }));
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
    return { group: `${b.subject} · ${b.label}`, no: b.kind === "common" ? `${s.number}번` : `${s.class}반 ${s.number}번`, name: s.name, sub: s.sid, parts: [{ label: "과세특", text: total, bytes: neisBytes(total), limit, issues: issueLine(total), lines: actList.filter(act => String(t[act.id] || "").trim()).map(act => ({ tag: act.name, text: String(t[act.id]).trim() })) }] };
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
    <div className="krw-bar" data-tour="rw-bar">
      <select value={bookId} onChange={event => setBookId(event.target.value)} aria-label="과목·반">{books.map(b => <option key={b.id} value={b.id}>{b.subject} · {b.label} ({b.students.length}명)</option>)}</select>
      {book?.kind !== "common" && <small className="krw-tag" title="이동수업 학생은 출석부(수강 목록) 기준이에요">이동수업</small>}
      {rec.loaded && acts.length > 0 && <Progress done={students.filter(doneOf).length} total={students.length} filter={filter} setFilter={setFilter} counts={counts} />}
      {view !== "student" && <FindBox find={find} setFind={setFind} />}
      <span className="sp" />
      <SaveBadge rec={rec} />
      <button type="button" data-kdn-bare className="krw-btn pri" onClick={saveNow} disabled={!Object.keys(rec.pending).length || rec.status === "saving"}><Save size={15} /> 지금 저장</button>
      <PrintMenu busy={busy} onPick={output} scopes={[["student", "지금 학생"], ["class", `${book?.label || "이 반"} 전체`], ["all", "담당 반 전체"]]} />
      <button type="button" data-kdn-bare className="krw-btn sec" onClick={() => setDupOpen(true)} title="같은 문장 점검: 여러 학생에게 똑같이 들어간 문장 찾기"><Search size={15} /><span className="lb">같은 문장</span></button>
      <button type="button" data-kdn-bare className="krw-btn sec" title="백업: 이 반 자료를 파일로 내려받아 따로 보관" onClick={() => downloadJson(`과세특_${book?.subject}_${book?.target}_${new Date().toISOString().slice(0, 10)}.json`, rec.doc)}><Download size={15} /><span className="lb">백업</span></button>
      {!readOnlyView && <button type="button" data-kdn-bare className="krw-btn sec" data-tour="rw-sjx" title="엑셀: 활동별 양식 받기 · 이미 쓴 엑셀 올리기" onClick={() => setXlOpen(true)}><FileSpreadsheet size={15} /><span className="lb">엑셀</span></button>}
      {xlOpen && <SubjectExcelModal acts={acts} students={students} rec={rec} book={book} fileLabel={`${book?.subject}_${book?.target}`} showToast={showToast} onClose={() => setXlOpen(false)} />}
      {!readOnlyView && acts.length > 0 && <button type="button" data-kdn-bare className="krw-btn sec" data-tour="rw-clear" title="과세특 일괄 지우기(활동별 · 지금 학생 또는 반 전체)" onClick={() => setClearOpen(true)}><Trash2 size={15} /><span className="lb">지우기</span></button>}
      {clearOpen && <ClearModal fields={acts.map(act => ({ key: act.id, label: act.name }))} students={students} current={view === "student" ? current : null} rec={rec} title={book?.label || "이 반"} backupName={`과세특_${book?.subject}_${book?.target}`} showToast={showToast} onClose={() => setClearOpen(false)} />}
    </div>
    {rec.error && <p className="krw-alert"><AlertTriangle size={15} /> {rec.error}</p>}
    {rec.loaded && <DupBanner dups={dups} onOpen={() => setDupOpen(true)} />}
    {dupOpen && <DuplicateModal title={`${book?.subject} ${book?.label}`} dups={dups} onPick={setSid} onClose={() => setDupOpen(false)} />}
    {rec.loaded && <ActivityManager activities={rec.activities} onChange={list => rec.edit("acts", list)} sources={sources} onImport={importFrom} onApplyAll={books.some(b => b.id !== book?.id && b.subject === book?.subject) ? applyAll : null} onStandards={setStdFor} standardsCount={act => act.std?.length || 0} />}
    {stdFor && <StandardsModal chosen={!!acts.find(a => a.id === stdFor)?.stdSub} grade={grade} semester={semester} subjectName={acts.find(a => a.id === stdFor)?.stdSub || book?.subject || ""} picked={acts.find(a => a.id === stdFor)?.std || []} title={acts.find(a => a.id === stdFor)?.name || "활동"} onSave={saveStandards} onClose={() => setStdFor(null)} />}
    {!rec.loaded ? <div className="krw-empty"><Loader2 size={18} className="spin" /> 불러오는 중이에요.</div>
      : !acts.length ? <div className="krw-empty"><b>먼저 수행평가 영역(활동)을 추가해 주세요.</b><span>다른 반에서 만든 목록이 있으면 '다른 반 활동 가져오기'로 복사할 수 있어요.</span></div>
      : view === "table" ? <div className="krw-table-wrap"><table className="krw-table krw-grid"><colgroup><col className="c-nm" />{acts.map(act => <col key={act.id} />)}<col className="c-tot" /></colgroup>
        <thead><tr><th className="nm">학생</th>{acts.map(act => <th key={act.id} style={{ "--c": actColor(acts, act.id) }}><span className="h"><i />{act.name}<small>{students.filter(s => rec.textOf(s.sid, act.id).trim()).length}/{students.length}명 작성</small></span></th>)}<th className="tot"><span className="h">과세특 총합본<small>활동 순서대로 줄바꿈 · 한도 {limit.toLocaleString()}</small></span></th></tr></thead>
        <tbody>{shown.map((s, i) => { const total = totalOf(s); const tb = neisBytes(total); return <tr key={s.sid} className={`${i % 2 ? "is-alt" : ""}${tb > limit ? " is-over" : ""}`}><StudentCell no={book.kind === "common" ? s.number : `${s.class}-${s.number}`} name={s.name} done={acts.filter(act => rec.textOf(s.sid, act.id).trim()).length} total={acts.length} onOpen={() => openStudent(s.sid)} />{acts.map(act => { const text = rec.textOf(s.sid, act.id); return <GridCell key={act.id} color={actColor(acts, act.id)} text={text} check={check} label={act.name} placeholder={`${act.name} 쓰기`} onChange={value => rec.edit(`s|${s.sid}|${act.id}`, value)} meter={<span className="krw-bytes sm"><b>{neisBytes(text).toLocaleString()}</b> byte</span>} />; })}
          <td className="tot"><TotalBudget acts={acts} texts={texts(s)} limit={limit} compact />{total && <><div className="krw-total-sm">{total}</div><div className="cellft"><CopyBtn text={total} label="총합본 복사" /></div></>}</td></tr>; })}</tbody></table>{!shown.length && <p className="krw-side-empty">조건에 맞는 학생이 없어요.</p>}</div>
      : view === "area" ? <div className="krw-area">
        <div className="krw-seg">{acts.map(act => <button key={act.id} type="button" data-kdn-bare aria-pressed={actId === act.id} style={{ "--c": actColor(acts, act.id) }} onClick={() => setActId(act.id)}>{act.name}<em>{students.filter(s => rec.textOf(s.sid, act.id).trim()).length}/{students.length}</em></button>)}<span className="sp" /><button type="button" data-kdn-bare className="krw-btn" onClick={() => setPaste(true)}><ClipboardPaste size={14} /> 엑셀에서 붙여넣기</button></div>
        {shown.map(s => { const total = totalOf(s); return <div key={s.sid} className="krw-areacard"><Field label={who(s)} hint={acts.find(a => a.id === actId)?.name || "활동"} color={actColor(acts, actId)} text={rec.textOf(s.sid, actId)} limit={limit} share={{ total: neisBytes(total) }} check={check} rows={3} meta={rec.metaOf(s.sid, actId)} onChange={value => rec.edit(`s|${s.sid}|${actId}`, value)} /><TotalBudget acts={acts} texts={texts(s)} limit={limit} compact /></div>; })}
        {paste && <PasteModal students={students} title={acts.find(a => a.id === actId)?.name || "활동"} onClose={() => setPaste(false)} onApply={rows => rows.forEach(row => rec.edit(`s|${row.sid}|${actId}`, row.text))} />}
      </div>
      : <div className={`krw-split${side ? " has-side" : ""}`}>
        <StudentList items={shown.map(s => ({ ...s, label: book.kind === "common" ? s.number : `${s.class}-${s.number}` }))} current={sid} onPick={setSid} find={find} setFind={setFind}
          meter={s => { const b = neisBytes(totalOf(s)); return { p: limit ? b / limit : 0, over: b > limit, tip: `${b.toLocaleString()} / ${limit.toLocaleString()} byte · ${acts.filter(act => rec.textOf(s.sid, act.id).trim()).length}/${acts.length}개 활동 작성` }; }}
          renderRight={s => { const total = totalOf(s); const b = neisBytes(total); return <><span className={`b${b > limit ? " over" : ""}`}>{b ? b.toLocaleString() : ""}</span>{check && <IssueDot text={total} />}</>; }} />
        {current && <section className="krw-pane" data-tour="rw-pane">
          <header className="krw-pane-hd"><button type="button" data-kdn-bare disabled={idx <= 0} onClick={() => go(-1)} aria-label="이전 학생" title="이전 학생 (Alt+↑)"><ChevronLeft size={18} /></button><div><b>{who(current)}</b><small>{current.sid} · {book.subject}</small></div>{!side && <button type="button" data-kdn-bare className="side" onClick={() => setSide(true)}><PanelRightOpen size={16} /> 자료</button>}<button type="button" data-kdn-bare disabled={idx >= order.length - 1} onClick={() => go(1)} aria-label="다음 학생" title="다음 학생 (Alt+↓)"><ChevronRight size={18} /></button></header>
          <DupStudentNote dups={dups} sid={current.sid} onPick={setSid} />
          <div className="krw-budget-sticky"><TotalBudget acts={acts} texts={texts(current)} limit={limit} /></div>
          {acts.map((act, index) => <Field key={act.id} tag={`활동 ${index + 1}`} label={act.name} color={actColor(acts, act.id)} text={rec.textOf(current.sid, act.id)} limit={limit} share={{ total: neisBytes(totalOf(current)) }} check={check} rows={4} meta={rec.metaOf(current.sid, act.id)} onChange={value => rec.edit(`s|${current.sid}|${act.id}`, value)} />)}
          {(() => { const total = totalOf(current); return <div className="krw-total" data-tour="rw-total">
            <div className="krw-total-hd"><div><b>과세특 총합본</b><small>활동마다 줄을 바꿔 자동으로 합쳐요</small></div><ByteMeter text={total} limit={limit} /><button type="button" data-kdn-bare className="krw-copy" disabled={!total} onClick={async () => { try { await navigator.clipboard.writeText(total); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { showToast?.("복사하지 못했어요.", "error"); } }}><Copy size={14} /> {copied ? "복사됨" : "나이스용 복사"}</button></div>
            <div className={`krw-total-tx${total ? "" : " is-empty"}`}>{total || "위 활동 칸에 글을 쓰면 여기에 합쳐져요."}</div>
            {check && <IssueList text={total} />}
          </div>; })()}
        </section>}
        {current && side && <SidePanel targets={acts.map(act => ({ key: act.id, label: act.name }))} budgetFor={key => { const others = acts.filter(a => a.id !== key && rec.textOf(current.sid, a.id).trim()); return limit - neisBytes(mergeActivities(others, texts(current))) - (others.length ? 2 : 0); }} aiContext={{ area: "과목별 세부능력 및 특기사항", subject: stdMatched?.n || book.subject, standardsFor }} standardsFor={standardsFor} onPickStandards={setStdFor} studentName={current.name} rec={rec} sid={current.sid} studentLabel={who(current)} scopeLabel={`${book.subject} ${book.label}`} by={by} showToast={showToast} onClose={() => setSide(false)} />}
      </div>}
  </div>;
}

// ── 점검(엑셀 양식 받기 · 올려서 한 번에 점검) ─────────────────────────────
// 올린 파일은 이 브라우저 안에서만 읽고 저장하지 않아요.
function CheckWriter({ year, scopes, initialKey, showToast }) {
  const [key, setKey] = useState(() => (scopes.some(sc => sc.key === initialKey) ? initialKey : scopes[0]?.key || ""));
  const scope = scopes.find(sc => sc.key === key);
  const [withText, setWithText] = useState(false);
  const [result, setResult] = useState(null); // { fileName, columns, rows }
  const [only, setOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const download = async () => {
    if (!scope) return;
    setBusy(true);
    try {
      let textsOf = () => scope.columns.map(() => "");
      if (withText) {
        const doc = await readStorage(scope.storageKey, emptyDoc()).catch(() => emptyDoc());
        textsOf = s => scope.columns.map(col => {
          if (col.key !== "subject") return doc?.students?.[s.sid]?.[col.key]?.t || "";
          const acts = (doc?.activities || []).filter(act => !act.removed);
          return mergeActivities(acts, Object.fromEntries(acts.map(act => [act.id, doc?.students?.[s.sid]?.[act.id]?.t || ""])));
        });
      }
      await exportXlsx(`점검양식_${scope.fileLabel}.xlsx`, [{ name: "점검", header: ["번호", "학번", "이름", ...scope.columns.map(col => col.label)], widths: [6, 9, 10, ...scope.columns.map(() => 70)], rows: scope.students.map(s => [s.number, s.sid, s.name, ...textsOf(s)]) }]);
    } finally { setBusy(false); }
  };
  const upload = async file => {
    if (!file) return;
    setBusy(true);
    try {
      const mod = await import("xlsx-js-style");
      const XLSX = mod.default?.read ? mod.default : mod;
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const parsed = parseCheckSheet(XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false }), { grade: scope?.grade || "" });
      if (parsed.error) { showToast?.(parsed.error, "error"); return; }
      setResult({ fileName: file.name, ...parsed });
      showToast?.(`${parsed.rows.length}명 · ${parsed.columns.length}칸을 점검했어요.`, "success");
    } catch (error) { showToast?.(`파일을 읽지 못했어요. (${error?.message || error})`, "error"); }
    finally { setBusy(false); }
  };

  const checked = useMemo(() => {
    if (!result) return null;
    const rows = result.rows.map(row => ({ ...row, cells: row.texts.map((text, i) => { const issues = checkRecordText(text); const bytes = neisBytes(text); return { text, bytes, limit: result.columns[i].limit, issues, over: bytes > result.columns[i].limit, block: issues.some(it => it.level === "block") }; }) }));
    const short = label => { const v = String(label || "").replace(/\s+/g, ""); return /자율|자치/.test(v) ? "자율·자치" : /진로/.test(v) ? "진로" : /행동|행발|종합의견/.test(v) ? "행발" : result.columns.length > 1 ? String(label).slice(0, 8) : ""; };
    const dups = findDuplicateSentences(rows.flatMap((row, i) => row.texts.map((text, c) => ({ sid: row.sid || `r${i}`, label: row.no ? `${row.no}번` : row.name || `${i + 1}행`, area: String(c), areaLabel: short(result.columns[c]?.label), text }))));
    rows.forEach((row, i) => { const id = row.sid || `r${i}`; row.id = id; row.dups = dups.filter(item => item.people.some(p => p.sid === id)); row.problem = row.cells.some(c => c.over || c.issues.length) || row.dups.length > 0; row.empty = row.cells.every(c => !c.text); });
    return { rows, dups, sum: { total: rows.length, empty: rows.filter(r => r.empty).length, over: rows.filter(r => r.cells.some(c => c.over)).length, block: rows.filter(r => r.cells.some(c => c.block)).length, warn: rows.filter(r => r.cells.some(c => c.issues.length && !c.block)).length, dup: rows.filter(r => r.dups.length).length, ok: rows.filter(r => !r.problem && !r.empty).length } };
  }, [result]);

  const exportResult = () => {
    if (!checked) return;
    exportXlsx(`점검결과_${result.fileName.replace(/\.xlsx?$/i, "")}.xlsx`, [{ name: "점검 결과", header: ["번호", "학번", "이름", ...result.columns.flatMap(col => [col.label, "바이트", "점검"]), "같은 문장"], widths: [6, 9, 10, ...result.columns.flatMap(() => [60, 10, 40]), 30],
      rows: checked.rows.map(row => [row.no, row.sid, row.name, ...row.cells.flatMap(c => [c.text, `${c.bytes}/${c.limit}${c.over ? ` (${c.bytes - c.limit} 넘음)` : ""}`, c.issues.map(it => `${it.level === "block" ? "[불가]" : "[권장]"} ${it.kind} '${it.match}'`).join("\n")]), row.dups.map(d => `${d.similar ? "비슷" : "같음"}: ${d.sentence}`).join("\n")]) }]);
  };

  if (!scopes.length) return <div className="krw-empty"><Users size={20} /><b>점검할 반이 없어요.</b><span>담임 반이나 담당 과목·반이 있어야 양식을 만들 수 있어요. 그래도 아래에서 아무 엑셀이나 올려 점검할 수 있어요.</span></div>;
  const shown = checked ? checked.rows.filter(row => !only || row.problem) : [];
  return <div className="krw-body krw-chk">
    <section className="krw-chk-steps">
      <div className="step"><span className="n">1</span><div><b>양식 받기</b><small>반 명단이 들어간 엑셀이에요. 칸에 글을 붙여 넣어 주세요.</small>
        <div className="row"><select value={key} onChange={event => { setKey(event.target.value); }} aria-label="반">{scopes.map(sc => <option key={sc.key} value={sc.key}>{sc.label}</option>)}</select>
          <label className="krw-ai-chk"><input type="checkbox" checked={withText} onChange={event => setWithText(event.target.checked)} /> 지금 쓴 글 채워서 받기</label>
          <button type="button" data-kdn-bare className="krw-btn" disabled={busy || !scope} onClick={download}><Download size={15} /> 양식 받기</button></div></div></div>
      <div className="step"><span className="n">2</span><div><b>올려서 점검</b><small>바이트 한도 · 기재 불가 · 고치기 권장 · 같은 문장을 한 번에 봐요. 올린 파일은 저장하지 않아요.</small>
        <div className="row"><button type="button" data-kdn-bare className="krw-btn pri" disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? <Loader2 size={15} className="spin" /> : <ClipboardPaste size={15} />} 엑셀 올리기</button>
          <input ref={inputRef} type="file" hidden accept=".xlsx,.xls,.csv" onChange={event => { upload(event.target.files?.[0]); event.target.value = ""; }} />
          {result && <span className="file">{result.fileName}</span>}</div></div></div>
    </section>
    {checked && <>
      <div className="krw-chk-sum">
        <span>학생 <b>{checked.sum.total}</b>명</span><span className="ok">문제 없음 <b>{checked.sum.ok}</b></span><span>미작성 <b>{checked.sum.empty}</b></span>
        <span className={checked.sum.over ? "bad" : ""}>한도 넘음 <b>{checked.sum.over}</b></span><span className={checked.sum.block ? "bad" : ""}>기재 불가 <b>{checked.sum.block}</b></span>
        <span className={checked.sum.warn ? "warn" : ""}>고치기 권장 <b>{checked.sum.warn}</b></span><span className={checked.sum.dup ? "warn" : ""}>같은 문장 <b>{checked.sum.dup}</b></span>
        <span className="sp" />
        <label className="krw-ai-chk"><input type="checkbox" checked={only} onChange={event => setOnly(event.target.checked)} /> 문제 있는 학생만</label>
        <button type="button" data-kdn-bare className="krw-btn" onClick={exportResult}><FileSpreadsheet size={15} /> 점검 결과 엑셀</button>
      </div>
      <div className="krw-table-wrap"><table className="krw-table krw-chk-table"><colgroup><col className="c-nm" />{result.columns.map(col => <col key={col.label} />)}</colgroup>
        <thead><tr><th className="nm">학생</th>{result.columns.map(col => <th key={col.label}>{col.label}<small>한도 {col.limit.toLocaleString()}</small></th>)}</tr></thead>
        <tbody>{shown.map(row => <tr key={row.id} className={row.problem ? "is-problem" : ""}>
          <th className="nm" scope="row"><b>{row.no ? `${row.no}번 ` : ""}{row.name}</b><small>{row.sid}</small>{row.dups.length > 0 && <em className="dup">같은 문장 {row.dups.length}</em>}</th>
          {row.cells.map((c, i) => <td key={i}>{c.text ? <><p>{c.text}</p><div className="cellft"><span className={`krw-bytes sm${c.over ? " is-over" : ""}`}><b>{c.bytes.toLocaleString()}</b> / {c.limit.toLocaleString()}{c.over ? ` · ${(c.bytes - c.limit).toLocaleString()} 넘음` : ""}</span>{!c.issues.length && !c.over && <span className="okmark"><Check size={12} /> 통과</span>}</div>{c.issues.length > 0 && <IssueMini issues={c.issues} />}</> : <span className="empty">미작성</span>}</td>)}
        </tr>)}</tbody></table>{!shown.length && <p className="krw-side-empty">문제 있는 학생이 없어요.</p>}</div>
      {checked.dups.length > 0 && <div className="krw-chk-dups"><b><AlertTriangle size={15} /> 여러 학생에게 겹친 문장</b><ul>{checked.dups.map((d, i) => <li key={i}><span className="tag">{d.similar ? "비슷" : "같음"}</span><q>{d.sentence}</q><em>{d.people.map(p => p.label).join(", ")}</em></li>)}</ul></div>}
    </>}
  </div>;
}

// ── 바깥 틀 ─────────────────────────────────────────────────────────────────
export default function RecordWriter({ readOnly = false, teacher = null, isAdmin = false, accounts = {}, db = {}, grade = "2", semester = "sem1", actor = null, showToast, legacy = null }) {
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
  const tabs = [canHomeroom && ["homeroom", "학급담임", "자율·자치 · 진로 · 행발"], ["subject", "교과담임", "반·분반별 과세특"], ["check", "점검", "엑셀 올려 한 번에 점검"], ["grade", "학년 자료", legacy ? "행사 세특 · 활동 배정 · 소감문" : "행사 세특 · 반별 확인"]].filter(Boolean);
  const [tab, setTab] = useState(() => { try { const raw = localStorage.getItem("kd_rec_tab_v1"); const saved = raw === "events" || raw === "legacy" ? "grade" : raw; return tabs.some(t => t[0] === saved) ? saved : tabs[0][0]; } catch { return tabs[0][0]; } });
  const [view, setView] = useState("student"); // 들어올 때는 늘 학생별 보기로 시작
  const [lastScope, setLastScope] = useState(""); // 점검 탭 기본 반: 마지막으로 연 담임 반 또는 과목·반
  const checkScopes = useMemo(() => [
    ...classOptions.map(c => ({ grade: hrGrade, key: `hr:${c}`, label: `${hrGrade}학년 ${c}반 담임 (자율·진로·행발)`, fileLabel: `${hrGrade}-${c}_담임`, storageKey: hrKey(year, hrGrade, c), columns: HOMEROOM_AREAS.map(k => ({ key: k, label: RECORD_AREAS[k].label })), students: Object.entries(rosterFor(hrGrade) || {}).filter(([, info]) => String(info?.class) === String(c)).map(([sid, info]) => ({ sid, name: info?.name || "", number: Number(info?.number) || Number(String(sid).slice(-2)) })).sort((a, b) => a.number - b.number) })),
    ...books.map(b => ({ grade, key: `sj:${b.id}`, label: `${b.subject} · ${b.label} (과세특)`, fileLabel: `${b.subject}_${b.target}`, storageKey: sjKey(year, b.id), columns: [{ key: "subject", label: "과목별 세부능력 및 특기사항" }], students: b.students.map(s => ({ ...s, number: Number(s.number) || Number(String(s.sid).slice(-2)) })) })),
  ], [classOptions, hrGrade, rosterFor, books, year]);
  // 학생 소감문(2학년부 자료): 학번별로 묶기. 같은 활동은 긴 응답 하나만.
  const reflectionsBySid = useMemo(() => {
    const list = db?.gradeDepartmentData?.[hrGrade]?.records?.reflections;
    if (!Array.isArray(list)) return null;
    const best = new Map();
    list.forEach(item => {
      const sid = sidKey(item?.sid); const response = String(item?.response || "").trim(); const activity = String(item?.activity || item?.sourceSheet || "").replace(/\((\d{3,4})\)$/, "").replace(/[_-]+/g, " ").trim();
      if (!sid || !response || !activity) return;
      // 행사 특기사항 취합 파일이 소감문으로 잘못 올라간 경우(시트 이름에 '특기사항', 응답이 '진로' 같은 영역 이름뿐) 빼요.
      if (/특기\s*사항|학적|봉사/.test(`${item?.sourceSheet || ""} ${activity}`) || response.replace(/\s+/g, "").length < 10) return;
      const key = `${sid}::${activity}`;
      if (!best.has(key) || response.length > best.get(key).response.length) best.set(key, { id: item.id || key, activity, date: String(item?.date || "").trim(), response });
    });
    const out = new Map();
    best.forEach((value, key) => { const sid = key.split("::")[0]; if (!out.has(sid)) out.set(sid, []); out.get(sid).push(value); });
    return out;
  }, [db?.gradeDepartmentData, hrGrade]);
  const [check, setCheck] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [stdOpen, setStdOpen] = useState(false);
  const [tourToken, setTourToken] = useState(0);
  const pick = (setter, storageKey) => value => { setter(value); try { localStorage.setItem(storageKey, value); } catch { /* 선택 기억은 편의 기능 */ } };

  return <ReadOnlyContext.Provider value={readOnly}><div className={`krw${readOnly ? " is-readonly" : ""}`}>
    <style>{CSS}</style>
    {readOnly && <p className="krw-alert" style={{ background: "#f2f6fc", color: "#2f4b7c", borderColor: "#c9d6ea" }}><Eye size={15} /> 부서 공용 계정은 생기부를 <b>조회만</b> 할 수 있어요. 고친 내용은 저장되지 않아요.</p>}
    <header className="krw-head">
      <div className="t"><b>생기부 업무 <span className="krw-scope-pill">{grade}학년 · {semester === "sem2" ? "2학기" : "1학기"}</span></b><small>칸마다 자동 저장 · 나이스 바이트 계산 · 2026 기재요령 점검 · 학년·학기는 위쪽에서 바꿔요</small></div>
      <div className="krw-tabs" role="tablist" data-tour="rw-tabs">{tabs.map(([key, label, sub]) => <button key={key} type="button" data-kdn-bare role="tab" aria-selected={tab === key} className={`t-${key}`} onClick={() => pick(setTab, "kd_rec_tab_v1")(key)}><b>{label}</b><small>{sub}</small></button>)}</div>
    </header>
    {tab !== "grade" && <TourGuide id="records-v6" steps={TOUR_STEPS} startToken={tourToken} />}
    {stdOpen && <StandardsModal grade={grade} semester={semester} subjectName={tab === "subject" ? (books[0]?.subject || "") : ""} onClose={() => setStdOpen(false)} />}
    {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} onTour={() => { setHelpOpen(false); setTourToken(value => value + 1); }} />}
    {tab !== "grade" && tab !== "check" && <div className="krw-opts">
      <div className="krw-views" role="group" aria-label="보는 형태" data-tour="rw-views">{VIEWS.map(([key, label, sub, Icon]) => <button key={key} type="button" data-kdn-bare aria-pressed={view === key} title={sub} onClick={() => setView(key)}><Icon size={15} /> {label}</button>)}</div>
      <button type="button" data-kdn-bare data-tour="rw-check" className={`krw-check${check ? " is-on" : ""}`} aria-pressed={check} onClick={() => setCheck(value => !value)}>{check ? <Eye size={15} /> : <EyeOff size={15} />} 기재요령 점검 {check ? "켜짐" : "꺼짐"}</button>
      <button type="button" data-kdn-bare className="krw-std-btn" onClick={() => setStdOpen(true)} title="2022 개정 교육과정 과목별 성취기준 찾아보기"><ListChecks size={16} /><span>2022 성취기준</span></button>
      <button type="button" data-kdn-bare data-tour="rw-help" className="krw-help-btn" onClick={() => setHelpOpen(true)} title="생기부 작성 가이드라인 · 단계별 안내" aria-label="가이드라인"><HelpCircle size={18} /><span>가이드라인</span></button>
      {tab === "subject" && isAdmin && !teacher && <select className="krw-teacher" value={pickedTeacherId} onChange={event => setPickedTeacherId(event.target.value)} aria-label="선생님"><option value="">선생님 고르기</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
    </div>}
    {tab === "grade" && <GradeDataTab legacy={legacy} events={<EventAdmin year={year} grade={hrGrade} rosterFor={rosterFor} by={by} showToast={showToast} canManage={isAdmin || ["gradeHead", "admin"].includes(String(teacher?.teacherRole || ""))} />} />}
    {tab === "check" && <CheckWriter year={year} scopes={checkScopes} initialKey={lastScope} showToast={showToast} />}
    {tab === "homeroom" && <HomeroomWriter reflectionsBySid={reflectionsBySid} onScope={setLastScope} year={year} grade={hrGrade} classOptions={classOptions} rosterFor={rosterFor} by={by} view={view} setView={setView} check={check} showToast={showToast} />}
    {tab === "subject" && (isAdmin && !teacher && !subjectTeacher ? <div className="krw-empty"><Users size={20} /><b>세특을 볼 선생님을 골라 주세요.</b></div>
      : <SubjectWriter onScope={setLastScope} year={year} books={books} by={by} view={view} setView={setView} check={check} showToast={showToast} grade={grade} semester={semester} />)}

  </div></ReadOnlyContext.Provider>;
}

const CSS = `
.krw{display:grid;gap:14px;color:var(--kdn-ink,#17181d)}
.krw-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 18px;padding:16px 18px;border-radius:22px;background:linear-gradient(135deg,#1c1d24,#2b2621);color:#fff;position:relative;overflow:hidden}
.krw-head::before{content:"";position:absolute;right:-60px;top:-90px;width:260px;height:260px;border-radius:99px;background:radial-gradient(circle,rgba(255,122,61,.35),rgba(255,122,61,0) 70%);pointer-events:none}
.krw-head>*{position:relative}
.krw-head .t{display:grid;gap:2px}.krw-head .t b{font-size:21px;font-weight:800;letter-spacing:-.02em;color:#fff}.krw-head .t small{font-size:13px;color:#cfccc5}
.krw-scope-pill{display:inline-block;margin-left:8px;padding:2px 10px;border-radius:99px;background:rgba(255,255,255,.14);color:#ffd8bf;font-size:12.5px;font-weight:800;vertical-align:3px}
.krw-tabs{display:flex;gap:4px;padding:4px;border-radius:16px;background:rgba(255,255,255,.08)}
.krw-tabs button{display:grid;gap:1px;justify-items:start;padding:9px 18px;border:0;border-radius:12px;background:transparent;font:inherit;color:#cfccc5;cursor:pointer;text-align:left}
.krw-tabs button b{font-size:15px;font-weight:800}.krw-tabs button small{font-size:11.5px;opacity:.85}
.krw-tabs button[aria-selected="true"]{background:#fff;color:#17181d;box-shadow:0 4px 14px rgba(0,0,0,.25)}
.krw-tabs button[aria-selected="true"] b{color:#c2410c}.krw-tabs button[aria-selected="true"] small{color:#5b606b;opacity:1}
.krw-tabs button:not([aria-selected="true"]):hover{background:rgba(255,255,255,.08);color:#fff}
.krw-opts{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.krw-help-btn{display:inline-flex;align-items:center;gap:6px;min-height:38px;margin-left:auto;padding:0 14px 0 10px;border-radius:99px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);font:inherit;font-size:13.5px;font-weight:800;color:#3d4048;cursor:pointer}
.krw-help-btn svg{color:#d0612a}.krw-help-btn:hover{border-color:#d0612a;color:#c2410c}
.krw-help{width:min(760px,100%);max-height:calc(100vh - 40px);overflow:auto;gap:14px}
.krw-help header .acts{display:flex;gap:6px;align-items:center;flex:none}.krw-help header .acts .krw-btn{white-space:nowrap}.krw-help header .x{display:grid;place-items:center;width:36px;height:36px;border:0;border-radius:10px;background:var(--kdn-surface-2,#f3f2ef);cursor:pointer;color:inherit}
.krw-help section{display:grid;gap:6px;padding:14px 16px;border-radius:16px;background:var(--kdn-surface-2,#f6f5f3)}
.krw-help h4{margin:0;font-size:14.5px;font-weight:800}.krw-help h4 small{margin-left:6px;font-size:12px;font-weight:600;color:var(--kdn-muted,#8a8f99)}
.krw-help ul,.krw-help ol{margin:0;padding-left:18px;display:grid;gap:4px;font-size:13.5px;line-height:1.6;color:#3d4048}
.krw-help .ends{display:flex;flex-wrap:wrap;gap:6px}.krw-help .ends button{padding:5px 11px;border-radius:99px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);font:inherit;font-size:13px;font-weight:600;color:var(--kdn-ink,#17181d);cursor:pointer}.krw-help .ends button:hover{border-color:#d0612a}
.krw-help .keys{margin:0;font-size:12.5px;color:var(--kdn-muted,#8a8f99)}.krw-help kbd{padding:1px 6px;border-radius:5px;border:1px solid var(--kdn-line,#d8d5ce);background:var(--kdn-surface,#fff);font:inherit;font-size:11.5px}
.krw-views{display:flex;gap:2px;padding:4px;border-radius:14px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e2dfd8);box-shadow:0 1px 2px rgba(20,24,33,.04)}
.krw-views button,.krw-check,.krw-btn,.krw-menu>button{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 13px;border:0;border-radius:10px;background:transparent;font:inherit;font-size:13.5px;font-weight:700;color:var(--kdn-ink-soft,#5b606b);cursor:pointer;white-space:nowrap}
.krw-views button{color:#3d4048}.krw-views button:hover{background:var(--kdn-surface-2,#f3f2ef)}.krw-views button[aria-pressed="true"]{background:#17181d;color:#fff;box-shadow:0 2px 8px rgba(20,24,33,.2)}
.krw-check{border:1px solid var(--kdn-line,#e7e5e0);background:var(--kdn-surface,#fff)}.krw-check.is-on{border-color:color-mix(in srgb,#16a34a 40%,transparent);color:#15803d;background:color-mix(in srgb,#16a34a 8%,var(--kdn-surface,#fff))}
.krw-teacher,.krw-bar select,.krw-acts select{min-height:38px;padding:0 12px;border-radius:10px;border:1.5px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:inherit;font:inherit;font-size:14px;font-weight:700;max-width:100%}
.krw-body{display:grid;gap:12px}
.krw-bar{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;border-radius:16px;background:color-mix(in srgb,var(--kdn-surface,#fff) 94%,transparent);backdrop-filter:blur(8px);border:1px solid var(--kdn-line,#e7e5e0);box-shadow:0 6px 18px rgba(20,24,33,.05)}
.krw-bar .sp,.krw-seg .sp,.krw-acts .sp{flex:1}.krw-scope{font-size:15px;font-weight:800}
.krw-tag{padding:3px 9px;border-radius:99px;background:color-mix(in srgb,#2563eb 10%,transparent);color:#1d4ed8;font-size:12px;font-weight:700}
.krw-progress{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--kdn-ink-soft,#5b606b)}.krw-progress b{color:var(--kdn-ink,#17181d)}
.krw-progress i{display:block;width:90px;height:6px;border-radius:99px;background:var(--kdn-surface-2,#ecebe7);overflow:hidden}.krw-progress em{display:block;height:100%;background:#4f8a6b}
.krw-progress button{min-height:30px;padding:0 10px;border-radius:99px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);font:inherit;font-size:12px;font-weight:700;color:inherit;cursor:pointer}.krw-progress button[aria-pressed="true"]{background:#17181d;border-color:#17181d;color:#fff}
.krw-btn{border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff)}.krw-btn.pri{border-color:transparent;background:#17181d;color:#fff}.krw-btn:disabled{opacity:.4;cursor:default}
.krw-menu{position:relative}.krw-menu>button{border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff)}
.krw-menu-pop{position:absolute;right:0;top:calc(100% + 6px);z-index:30;display:grid;gap:6px;min-width:300px;padding:12px;border-radius:16px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0);box-shadow:0 18px 40px rgba(20,24,33,.18)}
.krw-menu-pop .row{display:flex;align-items:center;gap:6px}.krw-menu-pop .row span{flex:1;font-size:13.5px;font-weight:700}
.krw-menu-pop .row button{display:inline-flex;align-items:center;gap:4px;min-height:32px;padding:0 10px;border-radius:9px;border:1px solid var(--kdn-line,#e7e5e0);background:var(--kdn-surface-2,#f6f5f3);font:inherit;font-size:12.5px;font-weight:700;color:inherit;cursor:pointer}
.krw-menu-pop small{font-size:11.5px;color:var(--kdn-muted,#8a8f99)}
.krw-save{display:inline-flex;align-items:center;gap:5px;font-size:13px;font-weight:700;white-space:nowrap}
.krw-save.is-ok{color:#15803d}.krw-save.is-busy,.krw-save.is-load{color:var(--kdn-muted,#8a8f99)}.krw-save.is-dirty{color:#b45309}.krw-save.is-err{color:#b42318}
.krw-alert{display:flex;align-items:center;gap:8px;margin:0;padding:10px 14px;border-radius:14px;background:color-mix(in srgb,#dc2626 9%,var(--kdn-surface,#fff));color:#b42318;font-size:13.5px;font-weight:700}
.krw-empty{display:grid;justify-items:center;gap:6px;padding:40px 18px;border-radius:20px;border:1.5px dashed var(--kdn-line,#e2dfd8);color:var(--kdn-muted,#8a8f99);text-align:center}.krw-empty b{color:var(--kdn-ink,#17181d);font-size:15px}.krw-empty span{font-size:13px}
.krw-split{display:grid;grid-template-columns:minmax(220px,250px) minmax(0,1fr);gap:14px;align-items:start}
.krw-split.has-side{grid-template-columns:minmax(220px,240px) minmax(0,1fr) minmax(290px,360px)}
.krw-list>*{min-width:0}.krw-list .krw-find input{width:100%}
.krw-list{grid-template-columns:minmax(0,1fr);align-content:start;scrollbar-width:none;position:sticky;top:70px;display:grid;gap:1px;max-height:calc(100vh - 110px);overflow:auto;overscroll-behavior:contain;padding:8px;border-radius:20px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0)}
.krw-list::-webkit-scrollbar{width:0;height:0}.krw-list:hover{scrollbar-width:thin;scrollbar-color:var(--kdn-line,#d6d3cc) transparent}.krw-list:hover::-webkit-scrollbar{width:6px}.krw-list:hover::-webkit-scrollbar-thumb{background:var(--kdn-line,#d6d3cc);border-radius:9px}
.krw-list>.krw-find,.krw-list>.krw-side-empty{grid-column:1/-1}
.krw-find{display:flex;align-items:center;gap:6px;margin-bottom:4px;padding:0 10px;border-radius:12px;background:var(--kdn-surface-2,#f3f2ef);color:var(--kdn-muted,#8a8f99)}
.krw-find input{flex:1;min-width:0;min-height:36px;border:0;outline:0;background:transparent;font:inherit;font-size:13.5px;color:var(--kdn-ink,#17181d)}
.krw-list>button{position:relative;box-sizing:border-box;width:100%;overflow:hidden;display:flex;align-items:center;gap:6px;min-width:0;min-height:30px;padding:0 6px 0 8px;border:0;border-radius:9px;background:transparent;font:inherit;color:inherit;text-align:left;cursor:pointer}
.krw-list .pg{position:absolute;left:6px;right:6px;bottom:3px;height:3px;border-radius:9px;background:var(--kdn-line,#e4e1da);overflow:hidden}.krw-list .pg em{display:block;height:100%;border-radius:9px;background:#4f8a6b}
.krw-list>button.is-over .pg em{background:#dc2626}.krw-list>button.is-over:not(.is-on) .nm{color:#dc2626}.krw-list>button.is-on .pg{background:rgba(255,255,255,.22)}.krw-list>button.is-on .pg em{background:#ffb089}.krw-list>button.is-on.is-over .pg em{background:#ff8a8a}
.krw-list>button:hover{background:var(--kdn-surface-2,#f6f5f3)}.krw-list>button.is-on{background:#17181d;color:#fff}.krw-list>button.is-on .fill i:not(.on){background:rgba(255,255,255,.25)}
.krw-list .no{flex:none;min-width:22px;font-size:12px;color:var(--kdn-muted,#8a8f99);font-variant-numeric:tabular-nums}.krw-list>button.is-on .no,.krw-list>button.is-on .b{color:#ffb089;font-weight:800}
.krw-list .nm{flex:1;min-width:0;font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.krw-list .fill{flex:none;display:flex;gap:3px}.krw-list .fill i{width:7px;height:7px;border-radius:99px;background:var(--kdn-line,#dcd9d2)}.krw-list .fill i.on{background:var(--c,#ff7a3d)}
.krw-list .b{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:clip;white-space:nowrap;text-align:right;font-size:11px;font-weight:700;color:var(--kdn-muted,#8a8f99);font-variant-numeric:tabular-nums}.krw-list .b.over{color:#dc2626}
.krw-list .krw-dot{flex:none;min-width:15px;height:15px;padding:0 3px;font-size:10px}.krw-list .fill{gap:2px}.krw-list .fill i{width:6px;height:6px}
.krw-list>button:hover{background:var(--kdn-surface-3,#eeece7)}
.krw-dot{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;border-radius:99px;font-size:11px;font-weight:800;font-style:normal}.krw-dot.is-block{background:#dc2626;color:#fff}.krw-dot.is-warn{background:#f59e0b;color:#1b1006}
.krw-pane{display:grid;gap:12px;min-width:0}
.krw-pane-hd{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:18px;background:linear-gradient(135deg,#1c1d24,#2b2621);color:#fff}
.krw-pane-hd div{flex:1;display:grid}.krw-pane-hd b{font-size:18px;font-weight:800}.krw-pane-hd small{font-size:12px;color:#cfccc5}
.krw-pane-hd button{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:38px;height:38px;padding:0 8px;border-radius:12px;border:0;background:rgba(255,255,255,.1);color:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer}.krw-pane-hd button:disabled{opacity:.3}
.krw-field,.krw-total{position:relative;display:grid;gap:8px;padding:14px 16px 14px 20px;border-radius:18px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0);box-shadow:0 1px 2px rgba(20,24,33,.04),0 6px 16px rgba(20,24,33,.04)}
.krw-field::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:3px;border-radius:0 3px 3px 0;background:var(--c,#d0612a)}
.krw-field:focus-within{border-color:color-mix(in srgb,var(--c,#ff7a3d) 55%,transparent);box-shadow:0 0 0 4px color-mix(in srgb,var(--c,#ff7a3d) 14%,transparent)}
.krw-field-hd{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}.krw-field-hd b{font-size:15.5px;font-weight:800;color:var(--kdn-ink,#17181d)}.krw-field-hd small{font-size:12px;color:var(--kdn-muted,#8a8f99)}
.krw-field-hd .krw-bytes{margin-left:auto}
.krw-chip{padding:2px 8px;border-radius:6px;background:color-mix(in srgb,var(--c,#d0612a) 12%,transparent);color:color-mix(in srgb,var(--c,#d0612a) 85%,#000);font-size:11.5px;font-weight:800}
.krw-fix{display:inline-flex;align-items:center;gap:4px;min-height:28px;padding:0 10px;border-radius:99px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:#3d4048;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
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
.krw-total{border:1px solid var(--kdn-line,#e7e5e0);background:var(--kdn-surface,#fff);--c:#d0612a;padding:16px 18px}
.krw-budget-sticky{position:sticky;top:64px;z-index:4}
.krw-budget{display:grid;gap:8px;padding:12px 16px;border-radius:16px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e2dfd8);box-shadow:0 8px 22px rgba(20,24,33,.08)}
.krw-budget .nums{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px}
.krw-budget .lab{font-size:13px;font-weight:800;color:var(--kdn-ink-soft,#5b606b);margin-right:4px}
.krw-budget .nums>b{font-size:26px;font-weight:800;line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:var(--kdn-ink,#17181d)}
.krw-budget .of{font-size:13px;color:var(--kdn-muted,#8a8f99)}
.krw-budget .left{margin-left:auto;padding:4px 12px;border-radius:99px;background:color-mix(in srgb,#4f8a6b 12%,transparent);color:#2f6b4c;font-size:13px;font-weight:700}
.krw-budget .left b{font-size:17px;font-variant-numeric:tabular-nums}
.krw-budget.is-near .left{background:color-mix(in srgb,#d97706 14%,transparent);color:#b45309}
.krw-budget.is-over{border-color:color-mix(in srgb,#dc2626 45%,transparent)}.krw-budget.is-over .nums>b{color:#b42318}.krw-budget.is-over .left{background:#dc2626;color:#fff}
.krw-budget .bar{display:flex;height:10px;border-radius:99px;background:var(--kdn-surface-2,#eeece7);overflow:hidden}
.krw-budget .bar i{display:block;height:100%}.krw-budget .bar i.br{background:repeating-linear-gradient(90deg,#b8b4ab 0 2px,transparent 2px 4px)}
.krw-budget.is-over .bar{box-shadow:inset 0 0 0 2px #dc2626}
.krw-budget .legend{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12px;color:var(--kdn-ink-soft,#5b606b);font-variant-numeric:tabular-nums}
.krw-budget .legend span{display:inline-flex;align-items:center;gap:5px}.krw-budget .legend i{width:8px;height:8px;border-radius:99px}.krw-budget .legend .muted{color:var(--kdn-muted,#8a8f99)}
.krw-budget.is-compact{padding:8px 12px;box-shadow:none;gap:6px}.krw-budget.is-compact .nums>b{font-size:18px}.krw-budget.is-compact .left b{font-size:14px}.krw-budget.is-compact .left{padding:2px 10px}
.krw-table .cellhd .krw-budget{flex:1;border:0;padding:0;background:transparent}
.krw-part{margin-left:auto;padding:3px 10px;border-radius:99px;background:var(--kdn-surface-2,#f3f2ef);font-size:12px;color:var(--kdn-muted,#8a8f99);font-variant-numeric:tabular-nums;white-space:nowrap}.krw-part b{color:var(--kdn-ink,#17181d)}
.krw-total-hd{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;padding-bottom:10px;border-bottom:1px solid var(--kdn-line,#eeece7)}.krw-total-hd>div{flex:1;min-width:160px;display:grid;gap:1px}.krw-total-hd b{font-size:16px;font-weight:800}.krw-total-hd small{font-size:12px;color:var(--kdn-muted,#8a8f99)}
.krw-total-tx{white-space:pre-wrap;min-height:5.5em;padding:4px 2px 0;font-size:15px;line-height:1.9;word-break:keep-all;color:var(--kdn-ink,#17181d)}.krw-total-tx.is-empty{color:var(--kdn-muted,#a3a7b0);font-size:14px}
.krw-copy{display:inline-flex;align-items:center;gap:5px;min-height:34px;padding:0 14px;border-radius:10px;border:0;background:#17181d;color:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer}.krw-copy:disabled{opacity:.35;cursor:default}
.krw-acts{display:grid;gap:10px;padding:12px 14px;border-radius:18px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0)}
.krw-acts .hd{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}.krw-acts .hd b{font-size:14.5px;font-weight:800}.krw-acts .hd small{font-size:12px;color:var(--kdn-muted,#8a8f99)}
.krw-acts .list{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.krw-acts .chip{display:inline-flex;align-items:center;gap:2px;padding:3px 4px 3px 10px;border-radius:99px;background:var(--kdn-surface-2,#f3f2ef);border:1px solid var(--kdn-line,#e2dfd8)}
.krw-acts .chip>i{width:8px;height:8px;border-radius:99px;background:var(--c);margin-right:4px}
.krw-acts .chip input{min-width:4em;border:0;background:transparent;font:inherit;font-size:13.5px;font-weight:700;color:var(--kdn-ink,#17181d);outline:0}
.krw-acts .chip button,.krw-acts .hidden button{display:inline-grid;place-items:center;min-width:26px;height:26px;border:0;border-radius:99px;background:transparent;color:var(--kdn-muted,#8a8f99);font:inherit;cursor:pointer}
.krw-acts .add{display:inline-flex;gap:4px}.krw-acts .add input{min-height:34px;padding:0 12px;border-radius:99px;border:1.5px dashed var(--kdn-line,#d8d5ce);background:transparent;font:inherit;font-size:13px;color:inherit}
.krw-acts .add button{display:inline-flex;align-items:center;gap:3px;min-height:34px;padding:0 14px;border:0;border-radius:99px;background:#17181d;color:#fff;font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.krw-acts .hidden{font-size:12px;color:var(--kdn-muted,#8a8f99)}.krw-acts .hidden button{display:inline-flex;gap:3px;width:auto;padding:0 8px;font-size:12px}
.krw-side{position:sticky;top:70px;display:grid;gap:10px;align-content:start;max-height:calc(100vh - 90px);overflow:auto;padding:12px;border-radius:20px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0)}
.krw-side>header{display:flex;align-items:center;gap:6px}.krw-side .x{display:grid;place-items:center;width:32px;height:32px;margin-left:auto;border:0;border-radius:9px;background:var(--kdn-surface-2,#f3f2ef);color:var(--kdn-ink-soft,#5b606b);cursor:pointer}
.krw-side-tabs{display:flex;gap:2px;padding:3px;border-radius:11px;background:var(--kdn-surface-2,#f3f2ef)}
.krw-side-tabs button{display:inline-flex;align-items:center;gap:5px;min-height:32px;padding:0 11px;border:0;border-radius:9px;background:transparent;font:inherit;font-size:13px;font-weight:700;color:var(--kdn-ink-soft,#5b606b);cursor:pointer}
.krw-side-tabs button[aria-pressed="true"]{background:var(--kdn-surface,#fff);color:var(--kdn-ink,#17181d);box-shadow:0 1px 2px rgba(20,24,33,.12)}
.krw-side-tabs em{font-style:normal;padding:0 6px;border-radius:99px;background:#ff7a3d;color:#1b1006;font-size:11px}
.krw-side-note{margin:0;font-size:12px;line-height:1.5;color:var(--kdn-muted,#8a8f99)}.krw-side-empty{margin:6px 4px;font-size:12.5px;color:var(--kdn-muted,#8a8f99)}
.krw-memo{display:grid;gap:8px}.krw-memo textarea{width:100%;min-height:300px;box-sizing:border-box;resize:vertical;padding:12px;border-radius:12px;border:1px solid var(--kdn-line,#dcd9d2);background:#fbfaf7;color:var(--kdn-ink,#17181d);font:inherit;font-size:14px;line-height:1.75}
.krw-put{display:flex;gap:6px}.krw-put select{flex:1;min-width:0;min-height:36px;padding:0 10px;border-radius:10px;border:1px solid var(--kdn-line,#dcd9d2);background:var(--kdn-surface,#fff);font:inherit;font-size:13px;font-weight:700;color:inherit}
.krw-btn.ghost{border-style:dashed}
[data-kd-ui="dark"] .krw-memo textarea{background:var(--kdn-surface-2,#22232a)}
.krw-memo-cats{display:flex;flex-wrap:wrap;gap:4px}
.krw-memo-cats button.all{border-style:dashed}
.krw-mini{display:inline-flex;align-items:center;gap:3px;min-height:26px;padding:0 9px;border-radius:99px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);font:inherit;font-size:11.5px;font-weight:700;color:#3d4048;cursor:pointer;white-space:nowrap}
.krw-mini:hover{border-color:#d0612a;color:#c2410c}
.krw-memo-all{display:grid;gap:8px;max-height:560px;overflow:auto}
.krw-memo-all section{display:grid;gap:4px;padding:10px 12px;border-radius:12px;background:#fbfaf7;border:1px solid var(--kdn-line,#e7e5e0)}
[data-kd-ui="dark"] .krw-memo-all section{background:var(--kdn-surface-2,#22232a)}
.krw-memo-all header{display:flex;flex-wrap:wrap;align-items:center;gap:4px}.krw-memo-all header b{flex:1;font-size:13px;font-weight:800}
.krw-memo-all p{margin:0;white-space:pre-wrap;font-size:13px;line-height:1.65;color:var(--kdn-ink,#17181d)}
.krw-ai-notes{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;padding:8px 10px;border-radius:10px;background:var(--kdn-surface-2,#f6f5f3);font-size:12.5px}
.krw-ai-notes span{width:100%;font-weight:800}.krw-ai-notes label{display:inline-flex;align-items:center;gap:4px;font-weight:600;cursor:pointer}.krw-ai-notes em{font-style:normal;color:var(--kdn-muted,#8a8f99)}
.krw-ai-load{display:flex;gap:6px}.krw-ai-load select{flex:1;min-width:0;min-height:36px;padding:0 10px;border-radius:10px;border:1px solid var(--kdn-line,#dcd9d2);background:var(--kdn-surface,#fff);font:inherit;font-size:13px;font-weight:700;color:inherit}
.krw-memo-cats button{position:relative;min-height:30px;padding:0 11px;border-radius:99px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);font:inherit;font-size:12.5px;font-weight:700;color:#3d4048;cursor:pointer}
.krw-memo-cats button[aria-pressed="true"]{background:#17181d;border-color:#17181d;color:#fff}
.krw-memo-cats button i{position:absolute;top:3px;right:4px;width:6px;height:6px;border-radius:99px;background:#d0612a}
.krw-side-tabs button{padding:0 9px}
.krw-ai{display:grid;gap:10px}
.krw-ai-head{display:flex;align-items:center;gap:8px}.krw-ai-head .krw-ai-target{flex:1;min-width:0}
.krw-ai-budget{flex:none;display:inline-flex;align-items:baseline;gap:3px;padding:5px 10px;border-radius:99px;background:color-mix(in srgb,#4f8a6b 12%,var(--kdn-surface,#fff));color:#2f6b4f;font-size:13.5px;font-weight:800;font-variant-numeric:tabular-nums}.krw-ai-budget small{font-size:10.5px;font-weight:700;opacity:.8}
.krw-ai-target{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--kdn-ink-soft,#5b606b);white-space:nowrap}
.krw-ai-target select{flex:1;min-width:0;min-height:34px;padding:0 10px;border-radius:10px;border:1px solid var(--kdn-line,#dcd9d2);background:var(--kdn-surface,#fff);font:inherit;font-size:13px;font-weight:700;color:inherit}
.krw-ai-target span{width:100%;font-weight:600}.krw-ai-target b{color:var(--kdn-ink,#17181d)}
.krw-ai-steps{display:flex;gap:2px;padding:3px;border-radius:11px;background:var(--kdn-surface-2,#f3f2ef)}
.krw-ai-steps button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:0;min-height:32px;padding:0 4px;border:0;border-radius:9px;background:transparent;font:inherit;font-size:12.5px;font-weight:700;color:#3d4048;cursor:pointer;white-space:nowrap}
.krw-ai-steps button i{display:grid;place-items:center;flex:none;width:16px;height:16px;border-radius:99px;background:var(--kdn-line,#dcd9d2);font-style:normal;font-size:10px;font-weight:800;color:#3d4048}.krw-ai-steps button[aria-selected="true"] i{background:#ff7a3d;color:#fff}
.krw-ai-steps button[aria-selected="true"]{background:#17181d;color:#fff}
.krw-ai-body{display:grid;gap:8px}
.krw-ai-chk{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600}
.krw-ai-lead{margin:0;font-size:12.5px;line-height:1.55;color:var(--kdn-ink-soft,#5b606b)}.krw-ai-lead b{color:var(--kdn-ink,#17181d)}
.krw-focus{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:4px;padding:4px;border-radius:14px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0)}
.krw-focus button{position:relative;display:grid;justify-items:start;gap:1px;min-width:0;padding:8px 12px;border:0;border-radius:10px;background:transparent;font:inherit;color:var(--kdn-ink-soft,#5b606b);text-align:left;cursor:pointer}
.krw-focus button::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:9px;background:var(--c);opacity:.35}
.krw-focus button:hover{background:var(--kdn-surface-2,#f6f5f3)}.krw-focus button[aria-selected="true"]{background:color-mix(in srgb,var(--c) 11%,var(--kdn-surface,#fff));color:var(--kdn-ink,#17181d)}.krw-focus button[aria-selected="true"]::before{opacity:1}
.krw-focus b{font-size:14px;font-weight:800;white-space:nowrap}.krw-focus small{font-size:11.5px;font-weight:700;color:var(--kdn-muted,#8a8f99);font-variant-numeric:tabular-nums}.krw-focus small.on{color:#15803d}.krw-focus small.over{color:#dc2626}
.krw-focus em{position:absolute;top:6px;right:8px;padding:1px 6px;border-radius:99px;background:color-mix(in srgb,#7c3aed 14%,transparent);color:#6d28d9;font-style:normal;font-size:10.5px;font-weight:800}
.krw-focus button:last-child{justify-items:center;align-content:center}
@media (max-width:760px){.krw-focus{grid-template-columns:repeat(2,minmax(0,1fr))}}
.krw-cnt{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;border-radius:99px;background:#f59e0b;color:#fff;font-style:normal;font-size:11px;font-weight:800}
.krw-evdot{flex:none;display:inline-grid;place-items:center;min-width:16px;height:16px;padding:0 4px;border-radius:99px;background:color-mix(in srgb,#7c3aed 14%,transparent);color:#6d28d9;font-size:10.5px;font-weight:800}
.krw-evbox{display:grid;gap:6px;margin:0;padding:10px 12px;border-radius:14px;border:1px solid color-mix(in srgb,#7c3aed 22%,var(--kdn-line,#e7e5e0));background:color-mix(in srgb,#7c3aed 4%,var(--kdn-surface,#fff))}
.krw-evbox .hd{display:flex;align-items:center;gap:6px;color:#6d28d9;font-size:13px}.krw-evbox .hd b{font-weight:800}.krw-evbox .hd span{margin-left:auto;font-size:12px}.krw-evbox .hd em{font-style:normal;font-weight:800;color:#b45309}.krw-evbox .hd i{display:inline-flex;align-items:center;gap:3px;font-style:normal;font-weight:700;color:#15803d}
.krw-evbox ul{display:grid;gap:4px;margin:0;padding:0;list-style:none}
.krw-evbox li{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:start;gap:10px;padding:9px 12px;border-radius:10px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#ece9e3)}
.krw-evbox li.is-in{border-color:color-mix(in srgb,#16a34a 35%,transparent);background:color-mix(in srgb,#16a34a 4%,var(--kdn-surface,#fff))}.krw-evbox li.is-out{opacity:.62}
.krw-evbox .hd .krw-mini{margin-left:6px}
.krw-evbox .body{display:grid;gap:3px;min-width:0}.krw-evbox .ttl{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;padding:0;border:0;background:transparent;font:inherit;color:inherit;text-align:left;cursor:pointer}.krw-evbox .ttl b{font-size:13.5px}.krw-evbox .ttl small{font-size:11.5px;color:var(--kdn-muted,#8a8f99)}
.krw-evbox .body p{margin:0;font-size:12.5px;line-height:1.6;color:var(--kdn-ink-soft,#5b606b);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.krw-evbox .body p.is-open{display:block}
.krw-evbox .act{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:4px;max-width:200px}
.krw-evbox .act button{display:inline-flex;align-items:center;gap:3px;min-height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--kdn-line,#dcd9d2);background:var(--kdn-surface,#fff);font:inherit;font-size:12px;font-weight:700;color:var(--kdn-ink-soft,#5b606b);cursor:pointer;white-space:nowrap}
.krw-evbox .act .go{border-color:transparent;background:#7c3aed;color:#fff}.krw-evbox .act .go:hover{background:#6d28d9}.krw-evbox .act .undo{border:0;background:transparent;text-decoration:underline;padding:0 4px}
.krw-evbox .act .tag{display:inline-flex;align-items:center;gap:3px;padding:3px 9px;border-radius:99px;font-size:12px;font-weight:800}.krw-evbox .act .tag.is-in{background:#dcfce7;color:#15803d}.krw-evbox .act .tag.is-out{background:#ececec;color:#6b7280}
.krw-evbox .act .warn{font-size:11px;color:#b45309}
.krw-evf{width:min(640px,100%);max-height:calc(100vh - 32px);overflow:auto}.krw-evf h4{margin:4px 0 0;font-size:14px}.krw-evf .none{margin:0;font-size:13px;color:var(--kdn-muted,#8a8f99)}
.krw-evf-files{display:grid;gap:4px;margin:0;padding:0;list-style:none}.krw-evf-files li{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;border:1px solid var(--kdn-line,#e7e5e0)}.krw-evf-files span{flex:1;display:grid;min-width:0}.krw-evf-files b{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.krw-evf-files small{font-size:11.5px;color:var(--kdn-muted,#8a8f99)}.krw-evf-files button{display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:8px;background:var(--kdn-surface-2,#f3f2ef);color:inherit;cursor:pointer}
.krw-modal-box.krw-neis{width:min(820px,100%);max-height:calc(100vh - 32px);overflow:auto}
.krw-neis .up{display:flex;align-items:center;gap:10px}.krw-neis .up small{font-size:12px;color:var(--kdn-muted,#8a8f99)}
.krw-neis .sum{display:flex;flex-wrap:wrap;gap:6px}.krw-neis .sum span{padding:3px 10px;border-radius:99px;background:var(--kdn-surface-2,#f3f2ef);font-size:12.5px;font-weight:700}.krw-neis .sum .is-diff{background:#fef3c7;color:#92400e}.krw-neis .sum .is-new{background:#dbeafe;color:#1d4ed8}.krw-neis .sum .is-same{background:#dcfce7;color:#15803d}.krw-neis .sum .is-empty,.krw-neis .sum .is-none{background:#f3f4f6;color:#6b7280}
.krw-neis-tbl{width:100%;border-collapse:collapse;font-size:13px}.krw-neis-tbl th,.krw-neis-tbl td{padding:7px 8px;border-bottom:1px solid var(--kdn-line,#efede8);text-align:center}.krw-neis-tbl th{font-size:12px;color:var(--kdn-muted,#8a8f99)}
.krw-neis-tbl td.ck{width:30px}.krw-neis-tbl td.ck input{width:16px;height:16px;accent-color:#ea580c}.krw-neis-tbl td.who{text-align:left}.krw-neis-tbl td.who button{border:0;background:transparent;font:inherit;font-weight:700;color:inherit;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.krw-neis-tbl td.b{font-variant-numeric:tabular-nums}.krw-neis-tbl td.b.over{color:#dc2626;font-weight:800}
.krw-neis-tbl .tag{padding:2px 8px;border-radius:99px;font-size:11.5px;font-weight:800;background:#f3f4f6;color:#6b7280}.krw-neis-tbl .tag.is-diff{background:#fef3c7;color:#92400e}.krw-neis-tbl .tag.is-new{background:#dbeafe;color:#1d4ed8}
.krw-neis-tbl tr.detail td{background:var(--kdn-surface-2,#f8f7f4);text-align:left}.krw-neis-tbl tr.detail td>div{display:grid;gap:2px;margin-bottom:6px}.krw-neis-tbl tr.detail small{font-weight:800;color:var(--kdn-muted,#8a8f99)}.krw-neis-tbl tr.detail p{margin:0;white-space:pre-wrap;line-height:1.6}
.krw-neis .same{margin:0;font-size:12px;color:var(--kdn-muted,#8a8f99)}
.krw-modal-box.krw-sjx{width:min(640px,100%);max-height:calc(100vh - 32px);overflow:auto}.krw-sjx section{display:grid;gap:8px;padding-top:10px;border-top:1px solid var(--kdn-line,#efede8)}.krw-sjx h4{margin:0;font-size:14.5px}
.krw-sjx .row{display:flex;flex-wrap:wrap;align-items:center;gap:10px}.krw-sjx .cols{display:grid;gap:4px;margin:0;padding:0;list-style:none}.krw-sjx .cols li{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:10px;background:var(--kdn-surface-2,#f6f5f3);font-size:13px}.krw-sjx .cols li.off{opacity:.55}.krw-sjx .cols label{display:flex;align-items:center;gap:6px;flex:1;min-width:0}.krw-sjx .cols span{font-size:12px;color:var(--kdn-muted,#8a8f99)}
.krw-sjx .sum{font-weight:700;color:var(--kdn-ink,#17181d)!important}
.krw-hope{display:flex;align-items:center;gap:8px;padding:6px 8px 6px 12px;border-radius:14px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0)}.krw-hope span{flex:none;font-size:12.5px;font-weight:800;color:#15803d}.krw-hope input{flex:1;min-width:0;min-height:30px;border:0;outline:0;background:transparent;font:inherit;font-size:13.5px;color:var(--kdn-ink,#17181d)}
.krw-clear{width:min(560px,100%)}.krw-clear .row{display:grid;grid-template-columns:64px minmax(0,1fr);align-items:start;gap:10px;padding:8px 0;border-top:1px solid var(--kdn-line,#efede8)}.krw-clear .k{padding-top:5px;font-size:12.5px;font-weight:800;color:var(--kdn-muted,#8a8f99)}.krw-clear .v{display:flex;flex-wrap:wrap;gap:6px}
.krw-clear .chip{display:inline-flex;align-items:center;gap:5px;min-height:30px;padding:0 11px 0 8px;border-radius:99px;border:1px solid var(--kdn-line,#dcd9d2);font-size:13px;font-weight:700;cursor:pointer}.krw-clear .chip input{margin:0;accent-color:#dc2626}.krw-clear .chip.on{border-color:#fca5a5;background:#fef2f2;color:#b91c1c}.krw-clear .chip em{font-style:normal;font-size:11px;color:var(--kdn-muted,#8a8f99)}
.krw-btn.danger{border-color:transparent;background:#dc2626;color:#fff}.krw-btn.danger:disabled{opacity:.4}
.krw-gdseg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:5px;border-radius:16px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0)}
.krw-gdseg button{display:flex;align-items:center;gap:10px;min-width:0;padding:10px 14px;border:0;border-radius:12px;background:transparent;font:inherit;color:var(--kdn-ink-soft,#5b606b);text-align:left;cursor:pointer}.krw-gdseg button span{display:grid;min-width:0}.krw-gdseg b{font-size:14px;font-weight:800}.krw-gdseg small{font-size:12px;color:var(--kdn-muted,#8a8f99);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.krw-gdseg button[aria-selected="true"]{background:#17181d;color:#fff}.krw-gdseg button[aria-selected="true"] small{color:rgba(255,255,255,.7)}
@media (max-width:1560px){.krw-bar .sec .lb{display:none}.krw-bar .sec,.krw-bar .krw-menu>button.sec{padding:0 10px}.krw-progress i{width:60px}}
.krw-bar .sec{gap:6px}
.krw-evadmin-note{margin:0;padding:10px 14px;border-radius:14px;background:color-mix(in srgb,#7c3aed 6%,var(--kdn-surface,#fff));font-size:13px;line-height:1.6;color:var(--kdn-ink-soft,#5b606b)}
.krw-evadmin .krw-card{display:grid;gap:8px;padding:14px 16px;border-radius:18px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0)}.krw-evadmin h4{margin:0;font-size:15px}.krw-evadmin h4 small{margin-left:8px;font-size:12px;font-weight:600;color:var(--kdn-muted,#8a8f99)}.krw-evadmin .none{margin:0;font-size:13px;color:var(--kdn-muted,#8a8f99)}
.krw-evf-tbl.is-wide td.is-left{color:#b45309;font-weight:800;background:color-mix(in srgb,#f59e0b 8%,transparent)}.krw-evf-tbl.is-wide td.is-done{color:#15803d;font-weight:700}.krw-evf-tbl.is-wide td.na{color:var(--kdn-line,#d6d3cc)}.krw-evf-tbl.is-wide th{white-space:nowrap;font-size:12px}
.krw-modal-box.krw-evf{width:min(760px,100%)}
.krw-evgrid{max-height:min(60vh,520px);overflow:auto;border:1px solid var(--kdn-line,#e7e5e0);border-radius:12px}.krw-evgrid table{width:100%;border-collapse:collapse;font-size:12.5px}
.krw-evgrid th,.krw-evgrid td{padding:6px 8px;border-bottom:1px solid var(--kdn-line,#efede8);text-align:center;white-space:nowrap}.krw-evgrid thead th{position:sticky;top:0;z-index:1;background:var(--kdn-surface,#fff);vertical-align:bottom}
.krw-evgrid thead th b{display:block;max-width:96px;margin:3px auto 0;overflow:hidden;text-overflow:ellipsis;font-size:12px}.krw-evgrid th.nm{position:sticky;left:0;background:var(--kdn-surface,#fff);text-align:left;font-weight:700}.krw-evgrid th.nm button{border:0;background:transparent;font:inherit;color:inherit;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.krw-evgrid td.is-in{color:#15803d;font-weight:800}.krw-evgrid td.is-out{color:#8a8f99}.krw-evgrid td.is-left{color:#b45309;background:color-mix(in srgb,#f59e0b 9%,transparent)}.krw-evgrid td.left{font-weight:800;color:#b45309}.krw-evgrid tr.has-left th.nm{color:#b45309}
.krw-evgrid .legend{margin:0;padding:8px 10px;font-size:12px;color:var(--kdn-muted,#8a8f99)}
.krw-evstrip{display:flex;flex-wrap:wrap;align-items:center;gap:5px;padding:8px 12px;border-radius:14px;background:color-mix(in srgb,#7c3aed 5%,var(--kdn-surface,#fff));border:1px solid color-mix(in srgb,#7c3aed 18%,var(--kdn-line,#e7e5e0))}
.krw-evstrip .lb{display:inline-flex;align-items:center;gap:4px;margin-right:2px;font-size:12.5px;font-weight:800;color:#6d28d9}
.krw-evstrip .chip{display:inline-flex;align-items:center;gap:5px;min-height:26px;padding:0 9px 0 4px;border-radius:99px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);font:inherit;font-size:12px;font-weight:700;color:var(--kdn-ink,#17181d);cursor:pointer}
.krw-evstrip .chip .a{padding:1px 6px;border-radius:99px;font-style:normal;font-size:10.5px;background:color-mix(in srgb,#2563eb 10%,transparent);color:#1d4ed8}.krw-evstrip .chip .a.is-career{background:color-mix(in srgb,#16a34a 12%,transparent);color:#15803d}
.krw-evstrip .chip em{font-style:normal;font-size:11px}.krw-evstrip .chip.is-in em{color:#15803d}.krw-evstrip .chip.is-out{opacity:.6}.krw-evstrip .chip.is-left{border-color:color-mix(in srgb,#f59e0b 45%,transparent)}.krw-evstrip .chip.is-left em{color:#b45309}
.krw-evf-fix{margin:0;font-size:12.5px;color:var(--kdn-muted,#8a8f99)}.krw-evf-fix .krw-linkbtn{font-size:12.5px}
.krw-evf-tbl td.ck,.krw-evf-tbl th.ck{width:30px;text-align:center}.krw-evf-tbl th.ck+th,.krw-evf-tbl td.ck+td{text-align:left}.krw-evf-tbl td.ck input{width:16px;height:16px;accent-color:#7c3aed}
.krw-evf-tbl{width:100%;border-collapse:collapse;font-size:13px}.krw-evf-tbl th,.krw-evf-tbl td{padding:7px 8px;border-bottom:1px solid var(--kdn-line,#ece9e3);text-align:center}.krw-evf-tbl td:first-child,.krw-evf-tbl th:first-child{text-align:left}.krw-evf-tbl td b{display:block}.krw-evf-tbl td small{font-size:11.5px;color:var(--kdn-muted,#8a8f99)}.krw-evf-tbl tr.is-left td:last-child{color:#b45309;font-weight:800}
.krw-ai-sum{display:grid;gap:8px;padding:12px 14px;border-radius:14px;border:2px solid color-mix(in srgb,#ff7a3d 55%,transparent);background:color-mix(in srgb,#ff7a3d 6%,var(--kdn-surface,#fff));box-shadow:0 4px 14px rgba(255,122,61,.12)}
.krw-ai-sum .hd{display:flex;flex-wrap:wrap;align-items:center;gap:6px;color:#c2410c}.krw-ai-sum .hd b{font-size:14px;font-weight:800}.krw-ai-sum .hd span{font-size:12px;font-weight:600;color:var(--kdn-ink-soft,#5b606b)}
.krw-ai-sum .chips{display:flex;flex-wrap:wrap;gap:4px}.krw-ai-sum .chips i{padding:3px 9px;border-radius:99px;background:var(--kdn-surface,#fff);border:1px solid color-mix(in srgb,#ff7a3d 35%,transparent);font-style:normal;font-size:12px;font-weight:700;color:#9a3412}.krw-ai-sum .chips em{font-style:normal;font-size:12px;color:var(--kdn-muted,#8a8f99)}
.krw-ai-sum .krw-btn{justify-content:center;min-height:36px}
.krw-ai-sum.is-empty{animation:krwPulse 1.6s ease-in-out 3}.krw-ai-sum.is-empty .hd span{color:#b45309;font-weight:800}
@keyframes krwPulse{0%,100%{box-shadow:0 4px 14px rgba(255,122,61,.12)}50%{box-shadow:0 0 0 6px rgba(255,122,61,.22)}}
@media (prefers-reduced-motion:reduce){.krw-ai-sum.is-empty{animation:none}}
.krw-pick{width:min(560px,100%);max-height:calc(100vh - 32px);grid-template-rows:auto auto minmax(0,1fr) auto}
.krw-pick-body{display:grid;gap:14px;overflow:auto;padding-right:2px}
.krw-pick-body section{display:grid;gap:6px}.krw-pick-body h4{margin:0;font-size:14px;font-weight:800}.krw-pick-body h4 small{margin-left:6px;font-size:12px;font-weight:600;color:var(--kdn-muted,#8a8f99)}
.krw-pick-body .opt{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:12px;border:1px solid var(--kdn-line,#e7e5e0);cursor:pointer}.krw-pick-body .opt:has(input:checked){border-color:color-mix(in srgb,#ff7a3d 50%,transparent);background:color-mix(in srgb,#ff7a3d 6%,var(--kdn-surface,#fff))}
.krw-pick-body .opt input{flex:none;margin:2px 0 0;width:16px;height:16px;accent-color:#ff7a3d}.krw-pick-body .opt span{display:grid;gap:3px;min-width:0}.krw-pick-body .opt b{font-size:14px;font-weight:700}.krw-pick-body .opt em{font-style:normal;font-size:12.5px;line-height:1.5;color:var(--kdn-ink-soft,#5b606b);overflow-wrap:anywhere}
.krw-pick-body .none{margin:0;font-size:13px;color:var(--kdn-muted,#8a8f99)}
.krw-refl{display:grid;gap:10px}
.krw-refl-seg{display:flex;gap:2px;padding:3px;border-radius:11px;background:var(--kdn-surface-2,#f3f2ef)}.krw-refl-seg button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:30px;border:0;border-radius:8px;background:transparent;font:inherit;font-size:12.5px;font-weight:700;color:#3d4048;cursor:pointer}.krw-refl-seg button em{font-style:normal;font-size:11px;color:var(--kdn-muted,#8a8f99)}.krw-refl-seg button[aria-selected="true"]{background:#17181d;color:#fff}.krw-refl-seg button[aria-selected="true"] em{color:#ffb089}
button.krw-refl-tag{border:0;font-family:inherit;cursor:pointer}button.krw-refl-tag:disabled{cursor:default}.krw-refl-bar{display:flex;gap:6px}.krw-refl-bar select{min-height:34px;padding:0 8px;border-radius:10px;border:1px solid var(--kdn-line,#dcd9d2);background:var(--kdn-surface,#fff);font:inherit;font-size:12.5px;font-weight:700;color:inherit}.krw-refl-bar .krw-btn{flex:1;min-height:34px;justify-content:center;font-size:12.5px}
.krw-refl article{display:grid;gap:6px;padding:10px 12px;border-radius:12px;border:1px solid var(--kdn-line,#e7e5e0)}.krw-refl header{display:flex;align-items:center;gap:6px}.krw-refl header b{font-size:13.5px}.krw-refl header small{font-size:12px;color:var(--kdn-muted,#8a8f99)}
.krw-refl-tag{margin-left:auto;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:800;background:color-mix(in srgb,#2563eb 10%,transparent);color:#1d4ed8}.krw-refl-tag.is-career{background:color-mix(in srgb,#16a34a 12%,transparent);color:#15803d}
.krw-refl article p{margin:0;font-size:13px;line-height:1.65;white-space:pre-wrap;color:var(--kdn-ink,#17181d)}.krw-refl .acts{display:flex;flex-wrap:wrap;gap:4px}
.krw-ai-inc{display:grid;border-radius:12px;border:1px solid var(--kdn-line,#e7e5e0);overflow:hidden}
.krw-ai-inc .hd{padding:7px 10px;background:var(--kdn-surface-2,#f6f5f3);font-size:12px;font-weight:800;color:var(--kdn-ink-soft,#5b606b)}
.krw-ai-inc .row{display:grid;grid-template-columns:62px minmax(0,1fr);align-items:center;gap:8px;padding:6px 10px;border-top:1px solid var(--kdn-line,#efede8)}
.krw-ai-inc .krw-linkbtn{font-size:12px}.krw-ai-inc .k{font-size:12px;font-weight:700;color:var(--kdn-muted,#8a8f99)}.krw-ai-inc .v{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;min-width:0}.krw-ai-inc em{font-style:normal;font-size:12px;color:var(--kdn-muted,#8a8f99)}
.krw-ai-inc .chip{display:inline-flex;align-items:center;gap:4px;max-width:100%;min-height:26px;padding:0 9px 0 6px;border-radius:99px;border:1px solid var(--kdn-line,#dcd9d2);background:var(--kdn-surface,#fff);font-size:12px;font-weight:700;color:var(--kdn-ink-soft,#5b606b);cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.krw-ai-inc .chip input{margin:0;width:13px;height:13px;accent-color:#ff7a3d}.krw-ai-inc .chip.on{border-color:color-mix(in srgb,#ff7a3d 45%,transparent);background:color-mix(in srgb,#ff7a3d 9%,var(--kdn-surface,#fff));color:#b4441a}
.krw-ai-preview{border-radius:12px;border:1px solid var(--kdn-line,#e7e5e0)}.krw-ai-preview summary{padding:8px 10px;font-size:12.5px;font-weight:700;cursor:pointer;color:var(--kdn-ink-soft,#5b606b)}.krw-ai-preview summary small{margin-left:4px;font-weight:600;color:var(--kdn-muted,#8a8f99)}.krw-ai-preview .krw-ai-prompt{border:0;border-top:1px solid var(--kdn-line,#e7e5e0);border-radius:0 0 12px 12px}
.krw-ai-prompt{margin:0;max-height:240px;overflow:auto;padding:10px 12px;border-radius:12px;background:var(--kdn-surface-2,#f6f5f3);border:1px solid var(--kdn-line,#e7e5e0);font:inherit;font-size:12px;line-height:1.6;white-space:pre-wrap;color:#3d4048}
.krw-ai-body textarea{min-height:180px;padding:10px 12px;border-radius:12px;border:1px solid var(--kdn-line,#dcd9d2);background:var(--kdn-surface,#fff);font:inherit;font-size:13.5px;line-height:1.7;resize:vertical;color:inherit}
.krw-ai-meter{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:12.5px;font-weight:700}
.krw-ai-acts{display:flex;flex-wrap:wrap;gap:6px}
.krw-ai-go{position:sticky;bottom:-12px;z-index:2;display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0 -12px;padding:8px 12px 12px;background:linear-gradient(to bottom,transparent,var(--kdn-surface,#fff) 30%)}.krw-ai-go .krw-btn{justify-content:center;min-width:0}.krw-ai-go .copy{grid-column:1/-1}
.krw-ai-go .ai-claude{border-color:#d9a58a;color:#9a4a26;background:#fdf4ee}.krw-ai-go .ai-claude:hover{background:#fae6da}
.krw-ai-go .ai-gpt{border-color:#9fc7b6;color:#1f6b4f;background:#effaf5}.krw-ai-go .ai-gpt:hover{background:#dff3ea}
.krw-ai-tip{margin:0;font-size:11.5px;line-height:1.55;color:var(--kdn-muted,#8a8f99)}
[data-kd-ui="dark"] .krw-ai-go .ai-claude{background:rgba(217,119,87,.12);border-color:rgba(217,119,87,.4);color:#f0b79c}[data-kd-ui="dark"] .krw-ai-go .ai-gpt{background:rgba(16,163,127,.12);border-color:rgba(16,163,127,.4);color:#8fdcc3}
.krw-trim{list-style:none;margin:0;padding:0;display:grid;gap:4px;max-height:320px;overflow:auto}
.krw-trim li{display:flex;align-items:flex-start;gap:6px;padding:6px 8px;border-radius:10px;background:var(--kdn-surface-2,#f6f5f3);font-size:13px;line-height:1.55}
.krw-trim li label{flex:1;display:flex;gap:6px;cursor:pointer}.krw-trim li em{font-style:normal;font-size:11.5px;color:var(--kdn-muted,#8a8f99);font-variant-numeric:tabular-nums;white-space:nowrap}
.krw-trim li.is-off{opacity:.45;text-decoration:line-through}
.krw-dup{width:min(720px,100%);max-height:calc(100vh - 40px);overflow:auto}
.krw-dup ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.krw-dup li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 10px;padding:10px 12px;border-radius:12px;background:var(--kdn-surface-2,#f6f5f3)}
.krw-dup q{font-size:13.5px;line-height:1.6}.krw-dup li em{font-style:normal;font-size:12px;font-weight:800;color:#b45309;align-self:start}
.krw-dup li .q{display:grid;gap:4px;min-width:0}.krw-dup li .tag{justify-self:start;padding:1px 8px;border-radius:99px;background:#17181d;color:#fff;font-size:11px;font-weight:800}.krw-dup li.is-similar .tag{background:#b45309}.krw-dup q.v{color:var(--kdn-ink-soft,#5b606b);font-size:12.5px}.krw-dup q.v::before{content:"≈ "}.krw-dup li .who button.is-sim{border-style:dashed}
.krw-dup li em .areas{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:3px;margin-top:4px}.krw-dup li em .areas i{padding:1px 7px;border-radius:99px;background:color-mix(in srgb,#2563eb 10%,transparent);color:#1d4ed8;font-style:normal;font-size:11px;font-weight:800}
.krw-dup li div.who button small{margin-left:4px;font-size:10.5px;font-weight:800;color:#1d4ed8}
.krw-dup-area{display:inline-block;margin-right:6px;padding:1px 7px;border-radius:99px;background:color-mix(in srgb,#2563eb 10%,transparent);color:#1d4ed8;font-size:11px;font-weight:800;vertical-align:1px}
.krw-dup li div.who{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:4px}.krw-dup li div button{padding:2px 9px;border-radius:99px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);font:inherit;font-size:12px;font-weight:700;cursor:pointer;color:inherit}
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
.krw-table th{position:sticky;top:0;z-index:2;padding:11px 8px;background:var(--kdn-surface,#fff);font-size:13.5px;font-weight:800;text-align:center;border-bottom:2px solid var(--c,var(--kdn-line,#e2dfd8));color:var(--kdn-ink,#17181d)}
.krw-table td{padding:8px;vertical-align:top!important;text-align:left;border-bottom:1px solid var(--kdn-line,#eeece7);min-width:240px}
.krw-table tbody tr:nth-child(even) td{background:color-mix(in srgb,var(--kdn-surface-2,#f6f5f3) 55%,var(--kdn-surface,#fff))}
.krw-table tbody tr:nth-child(even) td.nm{background:color-mix(in srgb,var(--kdn-surface-2,#f6f5f3) 55%,var(--kdn-surface,#fff))!important}
.krw-table td.n,.krw-table th.n{min-width:0;width:44px;text-align:center;font-variant-numeric:tabular-nums}
.krw-table td.nm,.krw-table th.nm{position:sticky;left:0;z-index:1;min-width:0;width:110px;background:var(--kdn-surface,#fff)!important;font-weight:800;font-size:13.5px;text-align:center;vertical-align:middle}
.krw-table th.nm{z-index:3}
.krw-table textarea{font-size:13.5px;line-height:1.65;padding:9px 10px}
.krw-table .cellft{display:flex;align-items:center;gap:6px;margin-top:4px}
.krw-table th.tot{--c:#d0612a}.krw-table td.tot{min-width:320px;background:var(--kdn-surface,#fff)!important;border-left:1px solid var(--kdn-line,#e7e5e0)}
.krw-grid{table-layout:fixed;min-width:960px}
.krw-grid col.c-nm{width:118px}.krw-grid col.c-tot{width:34%}
.krw-grid thead th{padding:10px 10px 9px;text-align:left!important;vertical-align:bottom;border-bottom:2px solid var(--kdn-line,#e2dfd8)!important}
.krw-grid thead th .h{display:block;font-size:14px;font-weight:800;line-height:1.4;color:var(--kdn-ink,#17181d)}
.krw-grid thead th .h i{display:inline-block;width:9px;height:9px;margin-right:6px;border-radius:99px;background:var(--c,#d0612a);vertical-align:middle}
.krw-grid thead th .h small{display:block;margin-top:2px;font-size:11.5px;font-weight:600;color:var(--kdn-muted,#8a8f99)}
.krw-grid thead th.nm{vertical-align:middle;text-align:center!important}
.krw-grid tbody th.nm{position:sticky;left:0;z-index:1;padding:12px 10px;vertical-align:top;text-align:left;background:var(--kdn-surface,#fff);border-bottom:1px solid var(--kdn-line,#eeece7);border-right:1px solid var(--kdn-line,#eeece7)}
.krw-grid tbody th.nm .no{display:inline-grid;place-items:center;min-width:26px;height:22px;padding:0 6px;margin-bottom:4px;border-radius:7px;background:var(--kdn-surface-2,#f1efea);font-size:12px;font-weight:800;color:#3d4048;font-variant-numeric:tabular-nums}
.krw-grid tbody th.nm b{display:block;font-size:14.5px;font-weight:800;color:var(--kdn-ink,#17181d);word-break:keep-all}
.krw-grid tbody td{padding:10px;border-bottom:1px solid var(--kdn-line,#eeece7);border-right:1px solid color-mix(in srgb,var(--kdn-line,#eeece7) 60%,transparent);background:var(--kdn-surface,#fff)!important}
.krw-grid tbody tr:nth-child(even) td,.krw-grid tbody tr:nth-child(even) th.nm{background:var(--kdn-surface,#fff)!important}
.krw-grid tbody tr:hover td,.krw-grid tbody tr:hover th.nm{background:#fcfbf9!important}
.krw-grid tbody tr:focus-within td,.krw-grid tbody tr:focus-within th.nm{background:#fff8f3!important}
.krw-grid tbody tr:focus-within th.nm{box-shadow:inset 3px 0 0 #d0612a}
.krw-grid textarea{display:block;width:100%;min-height:3.6em;max-height:22em;field-sizing:content;resize:vertical;padding:9px 11px;border-radius:10px;border:1px solid transparent;background:var(--kdn-surface-2,#f7f6f3);font-size:14px;line-height:1.7;color:var(--kdn-ink,#17181d)}
.krw-grid textarea::placeholder{color:#b3b6bd;font-size:13px}
.krw-grid textarea:hover{border-color:var(--kdn-line,#e2dfd8)}
.krw-grid textarea:focus{background:var(--kdn-surface,#fff);border-color:var(--c,#d0612a);box-shadow:0 0 0 3px color-mix(in srgb,var(--c,#d0612a) 15%,transparent)}
.krw-grid .cellft{display:flex;align-items:center;gap:6px;margin-top:6px}.krw-grid .cellft .krw-mini{margin-left:auto}
.krw-grid td.tot{background:#fffdfb!important;border-left:2px solid color-mix(in srgb,#d0612a 25%,transparent)}
.krw-grid td.tot .krw-budget{padding:0;border:0;background:transparent}
.krw-grid td.tot .krw-total-sm{margin-top:8px;padding:10px 12px;max-height:22em;border-radius:10px;background:var(--kdn-surface,#fff);border:1px dashed var(--kdn-line,#e2dfd8);font-size:13.5px;line-height:1.75}
.krw-mini:disabled{opacity:.35;cursor:default;border-color:var(--kdn-line,#e2dfd8)!important;color:#8a8f99!important}
/* 한눈에 표: 학생 구분 강화 */
.krw-grid tbody tr>*{border-bottom:2px solid var(--kdn-line,#e4e1da)!important}
.krw-grid tbody tr.is-alt td,.krw-grid tbody tr.is-alt th.nm{background:#f7f5f1!important}
.krw-grid tbody tr.is-alt textarea{background:#fff;border-color:#ebe8e2}
.krw-grid tbody tr.is-alt td.tot{background:#f9f6f1!important}
.krw-grid tbody tr:hover td,.krw-grid tbody tr:hover th.nm{background:#fdf6f0!important}
.krw-grid tbody tr:focus-within td,.krw-grid tbody tr:focus-within th.nm{background:#fff3ea!important}
.krw-grid tbody tr:focus-within th.nm{box-shadow:inset 4px 0 0 #d0612a}
.krw-grid tbody tr.is-over th.nm{box-shadow:inset 4px 0 0 #c2410c}
.krw-grid textarea:focus{min-height:6.2em}
.krw-grid tbody th.nm .nm-in{display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center}
.krw-grid tbody th.nm{vertical-align:middle;text-align:center!important}
.krw-grid tbody th.nm .no{display:inline-flex;align-items:center;justify-content:center;gap:3px;margin:0;min-width:30px;height:24px;font-size:12.5px;background:#17181d;color:#fff}
.krw-grid tbody th.nm .no.is-full{background:#4f8a6b}
.krw-grid tbody th.nm b{font-size:15.5px;line-height:1.3}
.krw-grid tbody th.nm .top{position:relative;display:inline-flex;align-items:center}
.krw-grid tbody th.nm .open{position:absolute;left:calc(100% + 4px);top:50%;transform:translateY(-50%);display:grid;place-items:center;width:24px;height:24px;padding:0;border-radius:99px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:var(--kdn-ink-soft,#5b606b);cursor:pointer;transition:opacity .15s}
.krw-grid tbody th.nm .open:hover{border-color:#d0612a;color:#c2410c}
@media (hover:hover){.krw-grid tbody th.nm .open{opacity:0}.krw-grid tbody tr:hover th.nm .open,.krw-grid tbody tr:focus-within th.nm .open{opacity:1}}
.krw-grid textarea.has-block{border-color:#ef4444;box-shadow:inset 3px 0 0 #ef4444}
.krw-grid textarea.has-warn{border-color:#f59e0b;box-shadow:inset 3px 0 0 #f59e0b}
.krw-iss-mini{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:3px}
.krw-iss-mini li{display:flex;align-items:center;gap:6px;min-width:0;padding:4px 8px;border-radius:8px;font-size:12px;line-height:1.35}
.krw-iss-mini li.is-block{background:#fef2f2;color:#991b1b}.krw-iss-mini li.is-warn{background:#fffbeb;color:#92400e}
.krw-iss-mini li b{flex:none;padding:1px 6px;border-radius:5px;font-size:11px;font-weight:800;color:#fff;background:#dc2626}.krw-iss-mini li.is-warn b{background:#d97706}
.krw-iss-mini li span{flex:none;font-weight:700}
.krw-iss-mini li code{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 5px;border-radius:4px;background:rgba(255,255,255,.75);font-family:inherit;font-weight:800;color:inherit}
.krw-iss-mini li em{flex:none;font-style:normal;font-weight:800}
.krw-iss-mini li.more{padding:2px 8px;color:var(--kdn-muted,#8a8f99);font-weight:700}
[data-kd-ui="dark"] .krw-iss-mini li.is-block{background:rgba(239,68,68,.14);color:#fca5a5}[data-kd-ui="dark"] .krw-iss-mini li.is-warn{background:rgba(245,158,11,.14);color:#fcd34d}[data-kd-ui="dark"] .krw-iss-mini li code{background:rgba(0,0,0,.25)}
.krw-filter{display:inline-flex;flex-wrap:wrap;gap:4px}
.krw-progress .krw-filter button{display:inline-flex;align-items:center;gap:5px}
.krw-filter button .n{line-height:18px;font-size:11px;font-weight:800;padding:0 6px;border-radius:99px;background:var(--kdn-surface-2,#f1efea);color:#3d4048}
.krw-filter button.f-over:not(.is-zero) .n{background:#fde4d6;color:#c2410c}.krw-filter button.f-issue:not(.is-zero) .n{background:#fdecc8;color:#92400e}
.krw-filter button[aria-pressed="true"] .n{background:rgba(255,255,255,.2);color:#fff}
.krw-filter button.is-zero{opacity:.5}
.krw-find.is-inline{margin:0;min-width:170px;max-width:220px;border:1.5px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff)}
.krw-find.is-inline button{display:grid;place-items:center;width:22px;height:22px;border:0;border-radius:99px;background:var(--kdn-surface-2,#f1efea);color:inherit;cursor:pointer}
[data-kd-ui="dark"] .krw-grid tbody tr.is-alt td,[data-kd-ui="dark"] .krw-grid tbody tr.is-alt th.nm,[data-kd-ui="dark"] .krw-grid tbody tr.is-alt td.tot{background:color-mix(in srgb,#fff 4%,var(--kdn-surface,#1b1c22))!important}
[data-kd-ui="dark"] .krw-grid tbody tr.is-alt textarea{background:var(--kdn-surface-2,#24252c);border-color:transparent}
[data-kd-ui="dark"] .krw-grid tbody th.nm .no{background:#f1efea;color:#17181d}
[data-kd-ui="dark"] .krw-grid tbody tr:hover td,[data-kd-ui="dark"] .krw-grid tbody tr:hover th.nm,[data-kd-ui="dark"] .krw-grid td.tot{background:var(--kdn-surface,#1b1c22)!important}
[data-kd-ui="dark"] .krw-grid tbody tr:focus-within td,[data-kd-ui="dark"] .krw-grid tbody tr:focus-within th.nm{background:color-mix(in srgb,#d0612a 8%,var(--kdn-surface,#1b1c22))!important}
.krw-total-sm{text-align:left!important;white-space:pre-wrap;font-size:13px;line-height:1.75;max-height:14em;overflow:auto;padding-top:6px}.krw-total-sm.is-empty{color:var(--kdn-muted,#a3a7b0);font-size:12.5px}
.krw-table .cellhd{display:flex;align-items:center;gap:6px;padding-bottom:6px;border-bottom:1px dashed var(--kdn-line,#e2dfd8)}
.krw-area{display:grid;gap:10px}
.krw-seg{position:sticky;top:64px;z-index:4;display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px;border-radius:16px;background:color-mix(in srgb,var(--kdn-surface,#fff) 94%,transparent);backdrop-filter:blur(8px);border:1px solid var(--kdn-line,#e7e5e0)}
.krw-seg>button:not(.krw-btn){display:inline-flex;align-items:center;gap:7px;min-height:38px;padding:0 14px;border-radius:99px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);font:inherit;font-size:13.5px;font-weight:700;color:#3d4048;cursor:pointer}.krw-seg>button:not(.krw-btn)::before{content:"";width:8px;height:8px;border-radius:99px;background:var(--c,#999)}
.krw-seg>button:not(.krw-btn) em{font-style:normal;font-size:11.5px;font-weight:700;opacity:.75}
.krw-seg>button[aria-pressed="true"]{background:#17181d;border-color:#17181d;color:#fff}.krw-seg>button[aria-pressed="true"] em{opacity:.8}
.krw-areacard{display:grid;gap:4px}.krw-total-line{display:flex;align-items:center;gap:8px;margin:0 6px;font-size:12.5px;font-weight:700;color:var(--kdn-muted,#8a8f99)}
.krw-modal{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:16px;background:rgba(15,18,26,.45)}
.krw-modal-box{display:grid;gap:10px;width:min(640px,100%);padding:18px;border-radius:20px;background:var(--kdn-surface,#fff);box-shadow:0 24px 60px rgba(15,23,42,.3)}
/* 점검 탭 */
.krw-chk-steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
.krw-chk-steps .step{display:flex;gap:12px;padding:16px;border-radius:18px;border:1px solid var(--kdn-line,#e7e5e0);background:var(--kdn-surface,#fff)}
.krw-chk-steps .n{flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:99px;background:#17181d;color:#fff;font-weight:800}
.krw-chk-steps .step>div{flex:1;display:grid;gap:4px;min-width:0}.krw-chk-steps b{font-size:15px}.krw-chk-steps small{font-size:12.5px;color:var(--kdn-ink-soft,#5b606b)}
.krw-chk-steps .row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:6px}
.krw-chk-steps select{flex:1 1 220px;min-height:38px;padding:0 10px;border-radius:10px;border:1.5px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:inherit;font:inherit;font-size:13.5px;font-weight:700}
.krw-chk-steps .file{font-size:12.5px;font-weight:700;color:var(--kdn-ink-soft,#5b606b)}
.krw-chk-sum{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;padding:12px 16px;border-radius:16px;border:1px solid var(--kdn-line,#e7e5e0);background:var(--kdn-surface,#fff);font-size:13px;color:var(--kdn-ink-soft,#5b606b)}
.krw-chk-sum b{font-size:16px;color:var(--kdn-ink,#17181d)}.krw-chk-sum .ok b{color:#2f7a52}.krw-chk-sum .bad b{color:#c2410c}.krw-chk-sum .warn b{color:#b45309}.krw-chk-sum .sp{flex:1}
.krw-chk-table{table-layout:fixed;min-width:760px}.krw-chk-table col.c-nm{width:130px}
.krw-chk-table th{text-align:left!important;padding:10px!important}.krw-chk-table thead th small{display:block;font-size:11.5px;font-weight:600;color:var(--kdn-muted,#8a8f99)}
.krw-chk-table td{padding:10px!important;vertical-align:top;text-align:left!important}
.krw-chk-table td p,.krw-chk-table td .empty,.krw-chk-table th.nm{text-align:left!important}
.krw-chk-table td p{margin:0;white-space:pre-wrap;font-size:13.5px;line-height:1.7}
.krw-chk-table td .empty{font-size:12.5px;color:var(--kdn-muted,#a3a7b0)}
.krw-chk-table th.nm b{display:block;font-size:14px}.krw-chk-table th.nm small{display:block;font-size:11.5px;color:var(--kdn-muted,#8a8f99)}
.krw-chk-table th.nm .dup{display:inline-block;margin-top:4px;padding:1px 8px;border-radius:99px;background:#fff1df;color:#9a3412;font-style:normal;font-size:11.5px;font-weight:800}
.krw-chk-table tr.is-problem th.nm{box-shadow:inset 4px 0 0 #d97706}
.krw-chk-table .cellft{display:flex;align-items:center;gap:6px;margin-top:6px}
.krw-chk-table .okmark{display:inline-flex;align-items:center;gap:3px;font-size:12px;font-weight:800;color:#2f7a52}
.krw-chk-dups{display:grid;gap:6px;padding:12px 16px;border-radius:16px;border:1.5px solid #f2b56b;background:#fff7ed;color:#7c2d12}
.krw-chk-dups b{display:flex;align-items:center;gap:6px}.krw-chk-dups ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.krw-chk-dups li{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline;font-size:13px}.krw-chk-dups .tag{padding:0 7px;border-radius:99px;background:#c2410c;color:#fff;font-size:11px;font-weight:800}.krw-chk-dups em{font-style:normal;font-weight:700;color:#9a3412}
[data-kd-ui="dark"] .krw-chk-dups{background:rgba(217,119,6,.12);color:#fcd9a8}
/* 기재 예시 */

.krw-ex ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.krw-ex li{display:grid;gap:6px;padding:10px 12px;border-radius:12px;border:1px solid var(--kdn-line,#eceae5);background:var(--kdn-surface,#fff)}
.krw-ex li.is-on{border-color:#4f8a6b;background:#f1f8f4}
.krw-ex li header{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px}.krw-ex li header b{font-size:13.5px}.krw-ex li header small{font-size:11.5px;color:var(--kdn-muted,#8a8f99)}
.krw-ex li p{margin:0;font-size:13px;line-height:1.7;color:var(--kdn-ink,#17181d)}
.krw-ex .meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px;font-size:11.5px;color:var(--kdn-ink-soft,#5b606b)}
.krw-ex .meta span{font-weight:800;color:var(--kdn-muted,#8a8f99)}.krw-ex .meta span+span,.krw-ex .meta em+span{margin-left:6px}
.krw-ex .meta em{font-style:normal;padding:1px 7px;border-radius:6px;background:var(--kdn-surface-2,#f3f2ef)}
.krw-ex .acts{display:flex;gap:6px;justify-content:flex-end}
.krw-ex-src{margin:0;font-size:11px;line-height:1.5;color:var(--kdn-muted,#8a8f99)}
.krw-ai-opts{display:grid;gap:4px;padding:8px 10px;border-radius:10px;background:var(--kdn-surface-2,#f6f5f3)}.krw-linkbtn{padding:0;border:0;background:transparent;font:inherit;font-weight:800;color:#c2410c;cursor:pointer;text-decoration:underline}
.krw-ai-expick{margin:0;padding:6px 10px;border-radius:10px;background:#f1f8f4;font-size:12.5px;color:#2f5d46}.krw-ai-expick button{margin-left:6px;border:0;background:transparent;font:inherit;font-weight:800;color:#c2410c;cursor:pointer}
[data-kd-ui="dark"] .krw-ex li.is-on,[data-kd-ui="dark"] .krw-ai-expick{background:rgba(79,138,107,.16);color:#bfe3cf}
/* 같은 문장 경고 */
.krw-dupbar{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:16px;border:1.5px solid #f2b56b;background:linear-gradient(135deg,#fff6e8,#fff1df);color:#7c3d06;box-shadow:0 6px 18px rgba(217,119,6,.12)}
.krw-dupbar>svg{flex:none;color:#d97706}
.krw-dupbar>div{flex:1;display:grid;gap:2px;min-width:0}.krw-dupbar b{font-size:15.5px;font-weight:800;color:#7c2d12}.krw-dupbar span{font-size:13px;line-height:1.5}
.krw-dupbar button{flex:none;min-height:38px;padding:0 14px;border-radius:12px;border:0;background:#c2410c;color:#fff;font:inherit;font-size:13.5px;font-weight:800;cursor:pointer}
.krw-dupbar button:hover{background:#9a3412}
.krw-dupnote{display:grid;gap:6px;padding:10px 14px;border-radius:14px;border:1.5px solid #f2b56b;background:#fff7ed;color:#7c2d12}
.krw-dupnote b{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:800}.krw-dupnote b svg{color:#d97706}
.krw-dupnote ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.krw-dupnote li{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:13px;line-height:1.5}
.krw-dupnote q{flex:1 1 240px;min-width:0;color:#3d2a1a}
.krw-dupnote li span{display:flex;flex-wrap:wrap;gap:4px}
.krw-dupnote li button{padding:1px 9px;border-radius:99px;border:1px solid #f2b56b;background:#fff;font:inherit;font-size:12px;font-weight:700;color:#9a3412;cursor:pointer}
.krw-dupnote li.more{font-weight:700;color:#9a6b4a}
[data-kd-ui="dark"] .krw-dupbar,[data-kd-ui="dark"] .krw-dupnote{background:rgba(217,119,6,.12);border-color:rgba(242,181,107,.45);color:#fcd9a8;box-shadow:none}
[data-kd-ui="dark"] .krw-dupbar b,[data-kd-ui="dark"] .krw-dupnote b,[data-kd-ui="dark"] .krw-dupnote q{color:#fde7c7}
[data-kd-ui="dark"] .krw-dupnote li button{background:transparent;color:#fcd9a8}
@media (max-width:760px){.krw-dupbar{flex-wrap:wrap}.krw-dupbar button{width:100%}}
/* 2022 성취기준 */
.krw-std-btn{display:inline-flex;align-items:center;gap:6px;min-height:38px;margin-left:auto;padding:0 14px 0 11px;border-radius:99px;border:1px solid #c9d6ea;background:#f2f6fc;font:inherit;font-size:13.5px;font-weight:800;color:#2f4b7c;cursor:pointer}
.krw-std-btn:hover{border-color:#5b7fbd;background:#e7eefa}
.krw-std-btn+.krw-help-btn{margin-left:0}
.krw-std{display:flex;flex-direction:column;width:min(860px,100%);max-height:calc(100vh - 32px);overflow:hidden}.krw-std>*{flex:none}
.krw-std>header{display:flex;align-items:center;gap:8px}.krw-std>header b{display:inline-flex;align-items:center;gap:7px;font-size:16px}.krw-std>header .x{margin-left:auto;display:grid;place-items:center;width:34px;height:34px;border:0;border-radius:10px;background:var(--kdn-surface-2,#f3f2ef);color:inherit;cursor:pointer}
.krw-std-note{margin:0;padding:9px 12px;border-radius:12px;background:#f2f6fc;color:#2f4b7c;font-size:12.5px;line-height:1.6}
.krw-std-auto{margin:0;font-size:12.5px;color:var(--kdn-ink-soft,#5b606b)}.krw-std-auto b{color:#2f4b7c}
.krw-std-bar{display:flex;flex-wrap:wrap;gap:8px}.krw-std-bar select{flex:1 1 240px;min-height:40px;padding:0 12px;border-radius:12px;border:1.5px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:inherit;font:inherit;font-size:14px;font-weight:700}
.krw-std-bar .krw-find.is-inline{flex:1 1 200px;max-width:none;min-height:40px}
.krw-std-doms{display:flex;flex-wrap:wrap;gap:5px}
.krw-std-doms button{display:inline-flex;align-items:center;gap:5px;min-height:30px;padding:0 11px;border-radius:99px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);font:inherit;font-size:12.5px;font-weight:700;color:#3d4048;cursor:pointer}
.krw-std-doms button[aria-pressed="true"]{background:#2f4b7c;border-color:#2f4b7c;color:#fff}
.krw-std-doms button em{font-style:normal;font-size:11px;font-weight:800;color:#c2410c}.krw-std-doms button[aria-pressed="true"] em{color:#ffd8bf}
.krw-std>.krw-std-list{flex:1 1 auto;min-height:120px;overflow:auto;padding-right:2px}
.krw-std-list section+section{margin-top:12px}
.krw-std-list h4{position:sticky;top:0;z-index:1;margin:0 0 6px;padding:6px 2px;background:var(--kdn-surface,#fff);font-size:13px;font-weight:800;color:#2f4b7c}
.krw-std-list ul{list-style:none;margin:0;padding:0;display:grid;gap:5px}
.krw-std-list li{display:flex;align-items:flex-start;gap:8px;padding:9px 10px;border-radius:12px;border:1px solid var(--kdn-line,#eceae5);background:var(--kdn-surface,#fff)}
.krw-std-list li.is-on{border-color:#5b7fbd;background:#f2f6fc}
.krw-std-list li label,.krw-std-list li .ro{flex:1;display:flex;align-items:flex-start;gap:8px;min-width:0;cursor:pointer;text-align:left}
.krw-std-list li .ro{cursor:default}
.krw-std-list li input{margin-top:3px;width:16px;height:16px;flex:none;accent-color:#2f4b7c}
.krw-std-list code,.krw-stdtab code{flex:none;padding:1px 7px;border-radius:6px;background:#e7eefa;color:#2f4b7c;font-family:inherit;font-size:12px;font-weight:800;white-space:nowrap}
.krw-std-list li span{font-size:13.5px;line-height:1.6;color:var(--kdn-ink,#17181d)}
.krw-std-ft{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding-top:8px;border-top:1px solid var(--kdn-line,#eceae5)}
.krw-std-ft small{flex:1 1 260px;font-size:11px;line-height:1.5;color:var(--kdn-muted,#8a8f99)}.krw-std-ft .n{font-size:13px;font-weight:800;color:#2f4b7c}
.krw-acts .chip button.std{min-width:auto;padding:0 7px;gap:3px;display:inline-flex;align-items:center;font-size:11.5px;font-weight:800}
.krw-acts .chip button.std.has{background:#e7eefa;color:#2f4b7c}
.krw-acts .chip button.std:hover{color:#2f4b7c}
.krw-side-tabs{flex:1;display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:2px}.krw-side-tabs button{flex-direction:column;justify-content:center;gap:2px;min-height:44px;padding:4px 2px!important;font-size:12px;line-height:1.2;white-space:nowrap}.krw-side-tabs button em{position:absolute;top:3px;right:6px}.krw-side-tabs button{position:relative}
.krw-stdtab{display:grid;gap:10px}
.krw-stdtab ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.krw-stdtab li{display:grid;gap:6px;padding:10px 12px;border-radius:12px;border:1px solid var(--kdn-line,#eceae5);background:var(--kdn-surface,#fff)}
.krw-stdtab li>div:first-child{display:flex;align-items:center;gap:6px}.krw-stdtab li small{font-size:11.5px;font-weight:700;color:var(--kdn-muted,#8a8f99)}
.krw-stdtab li p{margin:0;font-size:13px;line-height:1.6}
.krw-stdtab li .acts{display:flex;gap:6px;justify-content:flex-end}
.krw-ai-chk small{font-weight:600;color:var(--kdn-muted,#8a8f99)}
[data-kd-ui="dark"] .krw-std-btn,[data-kd-ui="dark"] .krw-std-note{background:rgba(91,127,189,.14);border-color:rgba(91,127,189,.4);color:#b9cbec}
[data-kd-ui="dark"] .krw-std-list li.is-on{background:rgba(91,127,189,.14)}
[data-kd-ui="dark"] .krw-std-list code,[data-kd-ui="dark"] .krw-stdtab code,[data-kd-ui="dark"] .krw-acts .chip button.std.has{background:rgba(91,127,189,.22);color:#c8d7f2}
[data-kd-ui="dark"] .krw-std-list h4,[data-kd-ui="dark"] .krw-std-ft .n{color:#b9cbec}
@media (max-width:760px){.krw-std-btn span{display:none}.krw-std-btn{padding:0 10px}.krw-std{padding:14px}}
.krw-modal-box header{display:flex;align-items:center;justify-content:space-between}.krw-modal-box header b{display:inline-flex;align-items:center;gap:6px;font-size:16px;font-weight:800}
.krw-modal-box header>button{display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:9px;background:var(--kdn-surface-2,#f3f2ef);cursor:pointer;color:inherit}
.krw-modal-box p{margin:0;font-size:13px;line-height:1.6;color:var(--kdn-ink-soft,#5b606b)}
.krw-modal-box textarea{min-height:220px;padding:12px;border-radius:12px;border:1.5px solid var(--kdn-line,#dcd9d2);font:inherit;font-size:13.5px;line-height:1.6;resize:vertical;background:var(--kdn-surface,#fff);color:inherit}
.krw-modal-box .ft{display:flex;align-items:center;gap:8px}.krw-modal-box .ft span{flex:1;font-size:13px}
[data-kd-ui="dark"] .krw-list>button.is-on{background:color-mix(in srgb,#ff7a3d 18%,transparent)}
[data-kd-ui="dark"] .krw-copy{background:#f4f3f0;color:#17181d}
@media (max-width:1280px){.krw-split.has-side{grid-template-columns:minmax(200px,230px) minmax(0,1fr)}.krw-split.has-side .krw-side{grid-column:2;position:static;max-height:none}}
@media (max-width:860px){.krw-split,.krw-split.has-side{grid-template-columns:minmax(0,1fr)}.krw-split.has-side .krw-side{grid-column:auto}.krw-list{position:static;max-height:240px}.krw-side{position:static}.krw-head{padding:14px}.krw-tabs{width:100%}.krw-tabs button{flex:1}.krw-tabs button small{display:none}.krw-bar{position:static}.krw-seg{top:0}}
@media print{.krw{display:none}}
`;
