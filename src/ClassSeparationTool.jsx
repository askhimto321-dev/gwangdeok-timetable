// 2027 반편성 '분리희망학생' 입력 (2학년 학급담임 전용).
// 담임: 자기 반 학생마다 함께 반이 되면 안 되는 학생(최대 10명)·분리 등급·사유를 적고 저장합니다.
// 관리자·2학년부: 모든 반 자료를 한 표로 보고, 학교 양식(분리희망학생(2학년부)) 그대로 엑셀로 받습니다.
import React from "react";
import { Download, Plus, Save, Trash2, Users, X, Loader2, Search } from "lucide-react";
import { readStorage, updateStorage } from "./storage.js";
import { schoolYearOf } from "./curriculum.js";
import { MAX_TARGETS, SEPARATION_LEVELS, SHEET_TITLE, SEPARATION_COL_WIDTHS, separationKey, normalizeTargets, searchStudents, separationRows, separationHeader } from "./classSeparation.js";

const GRADE = "2";
const emptyData = () => ({ entries: {} });
const classOf = student => Number(student?.class) || 0;
const label = (sid, roster) => { const s = roster?.[sid]; return s ? `${sid} ${s.name || ""}` : sid; };

const CSS = `
.kcs{display:grid;gap:14px;color:var(--kdn-ink,#1f2937)}
.kcs-head{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;padding:16px 18px;border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff)}
.kcs-head .t{display:grid;gap:3px;flex:1 1 280px}.kcs-head .t b{font-size:18px;font-weight:800}.kcs-head .t small{font-size:13px;color:var(--kdn-muted,#64748b);line-height:1.5}
.kcs-head .acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.kcs-btn{display:inline-flex;align-items:center;gap:6px;min-height:38px;padding:0 14px;border-radius:10px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#1f2937);font:inherit;font-size:14px;font-weight:700;cursor:pointer}
.kcs-btn.pri{background:var(--kdn-accent,#2563eb);border-color:var(--kdn-accent,#2563eb);color:#fff}.kcs-btn:disabled{opacity:.5;cursor:default}
.kcs-btn.ghost{background:transparent}.kcs-btn.danger{color:#b91c1c}
.kcs-classes{display:flex;flex-wrap:wrap;gap:6px}.kcs-classes button{min-height:34px;padding:0 12px;border-radius:999px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface-2,#f8fafc);font:inherit;font-size:13.5px;font-weight:700;color:var(--kdn-ink-soft,#334155);cursor:pointer}
.kcs-classes button.is-on{background:var(--kdn-accent,#2563eb);border-color:var(--kdn-accent,#2563eb);color:#fff}.kcs-classes button em{font-style:normal;font-size:12px;opacity:.8;margin-left:4px}
.kcs-split{display:grid;grid-template-columns:minmax(220px,300px) minmax(0,1fr);gap:14px;align-items:start}
.kcs-list{display:grid;gap:4px;max-height:640px;overflow:auto;padding:8px;border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff)}
.kcs-list button{display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:8px;min-height:40px;padding:0 10px;border-radius:10px;border:1px solid transparent;background:transparent;font:inherit;font-size:14px;color:var(--kdn-ink,#1f2937);text-align:left;cursor:pointer}
.kcs-list button:hover{background:var(--kdn-surface-2,#f1f5f9)}.kcs-list button.is-on{border-color:var(--kdn-accent,#2563eb);background:color-mix(in srgb,var(--kdn-accent,#2563eb) 10%,transparent)}
.kcs-list .no{font-size:12.5px;color:var(--kdn-muted,#64748b);font-variant-numeric:tabular-nums}.kcs-list .nm{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kcs-list .nm small{font-weight:600;color:var(--kdn-muted,#64748b);margin-left:4px}
.kcs-badge{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:22px;padding:0 7px;border-radius:999px;font-size:12px;font-weight:800;background:color-mix(in srgb,#ea580c 16%,transparent);color:#c2410c}
.kcs-badge.must{background:color-mix(in srgb,#dc2626 16%,transparent);color:#b91c1c}
.kcs-pane{display:grid;gap:12px;padding:16px 18px;border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff)}
.kcs-pane-hd{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px}.kcs-pane-hd b{font-size:17px;font-weight:800}.kcs-pane-hd small{font-size:13px;color:var(--kdn-muted,#64748b)}
.kcs-rows{display:grid;gap:10px}
.kcs-row{display:grid;grid-template-columns:28px minmax(200px,1.1fr) auto minmax(180px,1.4fr) 38px;gap:8px;align-items:center;padding:10px;border-radius:12px;background:var(--kdn-surface-2,#f8fafc)}
.kcs-row .i{font-size:13px;font-weight:800;color:var(--kdn-muted,#64748b);text-align:center}
.kcs-pick{position:relative}.kcs-pick input,.kcs-row input.reason{width:100%;min-height:38px;padding:0 10px;border-radius:9px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#1f2937);font:inherit;font-size:14px;box-sizing:border-box}
.kcs-chosen{display:flex;align-items:center;gap:6px;min-height:38px;padding:0 6px 0 10px;border-radius:9px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);font-size:14px;font-weight:700}
.kcs-chosen small{font-weight:600;color:var(--kdn-muted,#64748b)}.kcs-chosen button{margin-left:auto;display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:7px;background:transparent;color:var(--kdn-muted,#64748b);cursor:pointer}
.kcs-results{position:absolute;z-index:20;top:calc(100% + 4px);left:0;right:0;display:grid;padding:4px;border-radius:10px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);box-shadow:0 10px 26px rgba(15,23,42,.16)}
.kcs-results button{display:flex;gap:8px;align-items:center;min-height:36px;padding:0 10px;border:0;border-radius:8px;background:transparent;font:inherit;font-size:14px;color:var(--kdn-ink,#1f2937);text-align:left;cursor:pointer}.kcs-results button:hover{background:var(--kdn-surface-2,#f1f5f9)}.kcs-results small{color:var(--kdn-muted,#64748b)}
.kcs-level{display:flex;gap:4px}.kcs-level button{min-height:36px;padding:0 10px;border-radius:9px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);font:inherit;font-size:13px;font-weight:700;color:var(--kdn-ink-soft,#334155);cursor:pointer;white-space:nowrap}
.kcs-level button.is-on.must{background:#dc2626;border-color:#dc2626;color:#fff}.kcs-level button.is-on.soft{background:#ea580c;border-color:#ea580c;color:#fff}
.kcs-del{display:grid;place-items:center;width:36px;height:36px;border-radius:9px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:#b91c1c;cursor:pointer}
.kcs-foot{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.kcs-foot .sp{flex:1}
.kcs-note{margin:0;font-size:13px;line-height:1.55;color:var(--kdn-muted,#64748b)}
.kcs-back{padding:10px 12px;border-radius:12px;background:color-mix(in srgb,#ea580c 10%,transparent);font-size:13.5px;line-height:1.6}
.kcs-empty{padding:28px;text-align:center;color:var(--kdn-muted,#64748b);font-size:14px}
.kcs-table-wrap{overflow:auto;border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff)}
.kcs-table{width:100%;min-width:760px;border-collapse:collapse;font-size:13.5px}.kcs-table th{position:sticky;top:0;background:var(--kdn-surface-2,#f1f5f9);padding:9px 10px;font-weight:800;color:var(--kdn-muted,#475569);text-align:center;white-space:nowrap}
.kcs-table td{padding:8px 10px;border-top:1px solid var(--kdn-line,#e2e8f0);vertical-align:top}.kcs-table td.c{text-align:center;white-space:nowrap}
.kcs-chips{display:flex;flex-wrap:wrap;gap:6px}.kcs-chip{display:inline-flex;gap:6px;align-items:center;padding:3px 9px;border-radius:999px;font-size:12.5px;font-weight:700;background:color-mix(in srgb,#ea580c 14%,transparent);color:#9a3412}.kcs-chip.must{background:color-mix(in srgb,#dc2626 14%,transparent);color:#991b1b}
[data-kd-ui="dark"] .kcs-chip{color:#fdba74}[data-kd-ui="dark"] .kcs-chip.must{color:#fca5a5}
@media (max-width:860px){.kcs-split{grid-template-columns:minmax(0,1fr)}.kcs-list{max-height:260px}.kcs-row{grid-template-columns:24px minmax(0,1fr) 38px}.kcs-row .kcs-level,.kcs-row input.reason{grid-column:2/3}}
`;

function TargetPicker({ value, roster, exclude, onChange }) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const results = searchStudents(roster, query, { exclude });
  if (value) {
    const s = roster?.[value];
    return <div className="kcs-chosen"><span>{value} {s?.name || "(명단에 없음)"}</span>{s && <small>{classOf(s)}반 {s.gender || ""}</small>}<button type="button" data-kdn-bare aria-label="학생 다시 고르기" onClick={() => onChange("")}><X size={15} /></button></div>;
  }
  return <div className="kcs-pick">
    <input value={query} placeholder="학번 또는 이름으로 찾기" aria-label="분리희망학생 찾기" onChange={event => { setQuery(event.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
    {open && results.length > 0 && <div className="kcs-results">{results.map(item => <button key={item.sid} type="button" data-kdn-bare onMouseDown={event => event.preventDefault()} onClick={() => { onChange(item.sid); setQuery(""); setOpen(false); }}><b>{item.sid}</b>{item.name}<small>{item.class}반 {item.gender}</small></button>)}</div>}
  </div>;
}

export default function ClassSeparationTool({ roster = {}, homeroomClass = "", canViewAll = false, canEditAll = false, actor = null, showToast }) {
  const year = schoolYearOf();
  const ownClass = Number(homeroomClass) || 0;
  const classes = React.useMemo(() => Array.from(new Set(Object.values(roster || {}).map(classOf).filter(Boolean))).sort((a, b) => a - b), [roster]);
  const readable = canViewAll ? classes : classes.filter(c => c === ownClass);
  const [viewClass, setViewClass] = React.useState(() => ownClass || readable[0] || 0);
  const [data, setData] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [mode, setMode] = React.useState("edit");
  const [sid, setSid] = React.useState("");
  const [draft, setDraft] = React.useState([]);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const pairs = await Promise.all(readable.map(async c => [c, await readStorage(separationKey(year, GRADE, c), emptyData())]));
    setData(Object.fromEntries(pairs.map(([c, value]) => [c, value && typeof value === "object" ? value : emptyData()])));
    setLoading(false);
  }, [readable.join(","), year]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { if (!viewClass && readable[0]) setViewClass(readable[0]); }, [readable.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const canEdit = viewClass && (canEditAll || viewClass === ownClass);
  const students = Object.entries(roster || {}).filter(([, s]) => classOf(s) === viewClass).sort((a, b) => (Number(a[1]?.number) || 0) - (Number(b[1]?.number) || 0) || a[0].localeCompare(b[0]));
  const entries = data[viewClass]?.entries || {};
  const countOf = id => normalizeTargets(entries[id]?.targets, id).length;
  const mustOf = id => normalizeTargets(entries[id]?.targets, id).some(t => t.level === SEPARATION_LEVELS[0]);
  const filledCount = students.filter(([id]) => countOf(id)).length;

  const pick = id => {
    if (dirty && !window.confirm("저장하지 않은 내용이 있습니다. 버리고 다른 학생으로 갈까요?")) return;
    setSid(id);
    const saved = normalizeTargets(entries[id]?.targets, id);
    setDraft(saved.length ? saved : (canEdit ? [{ sid: "", level: SEPARATION_LEVELS[0], reason: "" }] : []));
    setDirty(false);
  };
  const changeClass = c => { if (dirty && !window.confirm("저장하지 않은 내용이 있습니다. 버리고 반을 바꿀까요?")) return; setViewClass(c); setSid(""); setDraft([]); setDirty(false); };
  const edit = (index, patch) => { setDraft(list => list.map((item, i) => (i === index ? { ...item, ...patch } : item))); setDirty(true); };

  // 다른 학생이 이 학생을 분리 희망으로 적은 경우(불러온 반 안에서)
  const reverse = sid ? Object.values(data).flatMap(classData => Object.entries(classData?.entries || {}).filter(([other, entry]) => other !== sid && normalizeTargets(entry?.targets, other).some(t => t.sid === sid)).map(([other, entry]) => ({ other, level: normalizeTargets(entry?.targets, other).find(t => t.sid === sid)?.level }))) : [];

  const save = async () => {
    if (!sid || !canEdit) return;
    const targets = normalizeTargets(draft, sid);
    const unknown = targets.filter(t => !roster?.[t.sid]);
    if (unknown.length && !window.confirm(`명단에 없는 학번이 있습니다(${unknown.map(t => t.sid).join(", ")}). 그래도 저장할까요?`)) return;
    setBusy(true);
    const result = await updateStorage(separationKey(year, GRADE, viewClass), emptyData(), current => {
      const next = { ...(current || emptyData()), entries: { ...(current?.entries || {}) } };
      if (targets.length) next.entries[sid] = { targets, updatedAt: new Date().toISOString(), by: actor?.name || actor?.id || "" };
      else delete next.entries[sid];
      return { ...next, updatedAt: new Date().toISOString() };
    });
    setBusy(false);
    if (!result?.ok) { showToast?.(`저장하지 못했습니다: ${result?.error || "다시 시도해 주세요."}`, "error"); return; }
    setData(current => ({ ...current, [viewClass]: result.value }));
    setDraft(targets.length ? targets : [{ sid: "", level: SEPARATION_LEVELS[0], reason: "" }]);
    setDirty(false);
    showToast?.(`${label(sid, roster)} 분리희망학생 ${targets.length}명을 저장했습니다.`, "success");
  };

  const exportXlsx = async (scope) => {
    const mod = await import("xlsx-js-style");
    const XLSX = mod.default?.utils ? mod.default : mod;
    const classList = scope === "all" ? readable : [viewClass];
    const rows = separationRows(classList.map(c => data[c]), roster);
    const { top, sub, merges } = separationHeader();
    const ws = XLSX.utils.aoa_to_sheet([top, sub, ...rows]);
    ws["!merges"] = merges;
    ws["!cols"] = SEPARATION_COL_WIDTHS.map(wch => ({ wch }));
    ws["!rows"] = [{ hpt: 48 }, { hpt: 20 }];
    const border = { style: "thin", color: { rgb: "B8C2CF" } };
    const range = XLSX.utils.decode_range(ws["!ref"]);
    for (let r = range.s.r; r <= range.e.r; r += 1) for (let c = range.s.c; c <= range.e.c; c += 1) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      const head = r < 2;
      ws[ref].s = {
        font: { name: "맑은 고딕", sz: head ? 10 : 10, bold: head },
        alignment: { horizontal: head || (c - 4) % 4 !== 3 ? "center" : "left", vertical: "center", wrapText: true },
        border: { top: border, bottom: border, left: border, right: border },
        ...(head ? { fill: { patternType: "solid", fgColor: { rgb: "DCE6F1" } } } : {}),
      };
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, SHEET_TITLE);
    const rosterRows = Object.entries(roster || {}).sort((a, b) => a[0].localeCompare(b[0])).map(([id, s]) => [id, s?.name || "", s?.gender || ""]);
    const ws2 = XLSX.utils.aoa_to_sheet([["학번", "이름", "성별"], ...rosterRows]);
    ws2["!cols"] = [{ wch: 9 }, { wch: 12 }, { wch: 6 }];
    XLSX.utils.book_append_sheet(wb, ws2, "학적");
    const suffix = scope === "all" ? "" : `_${viewClass}반`;
    XLSX.writeFile(wb, `${year + 1} 3학년 반편성 분리희망학생(2학년부)${suffix}.xlsx`);
  };

  if (!readable.length) return <div className="kcs"><style dangerouslySetInnerHTML={{ __html: CSS }} /><div className="kcs-empty">2학년 명단이 없거나, 담임 반 정보가 없습니다. 내 정보에서 담임 반을 확인해 주세요.</div></div>;

  const totalFilled = readable.reduce((sum, c) => sum + Object.keys(data[c]?.entries || {}).length, 0);
  const summaryClasses = mode === "all" ? readable : [viewClass];
  const summary = summaryClasses.flatMap(c => Object.entries(data[c]?.entries || {}).map(([id, entry]) => ({ id, c, targets: normalizeTargets(entry?.targets, id), updatedAt: entry?.updatedAt, by: entry?.by }))).filter(row => row.targets.length).sort((a, b) => a.id.localeCompare(b.id));

  return <div className="kcs">
    <style dangerouslySetInnerHTML={{ __html: CSS }} />
    <section className="kcs-head">
      <div className="t"><b>{year + 1} 반편성 · 분리희망학생</b><small>{canViewAll ? `2학년 전체 ${readable.length}개 반 · 등록 ${totalFilled}명` : `${ownClass}반 담임 · 등록 ${filledCount}명`} · 같은 반이 되면 안 되는 학생을 학생마다 최대 {MAX_TARGETS}명까지 적습니다.</small></div>
      <div className="acts">
        <button type="button" className={`kcs-btn${mode === "edit" ? " pri" : ""}`} onClick={() => setMode("edit")}>학생별 입력</button>
        <button type="button" className={`kcs-btn${mode !== "edit" ? " pri" : ""}`} onClick={() => setMode(canViewAll ? "all" : "class")}>{canViewAll ? "전체 현황" : "우리 반 현황"}</button>
        <button type="button" className="kcs-btn" onClick={() => exportXlsx("class")} disabled={loading || !viewClass}><Download size={15} />{viewClass}반 엑셀</button>
        {canViewAll && <button type="button" className="kcs-btn" onClick={() => exportXlsx("all")} disabled={loading}><Download size={15} />전체 엑셀(학교 양식)</button>}
      </div>
    </section>
    {readable.length > 1 && mode !== "all" && <div className="kcs-classes" role="tablist" aria-label="반 선택">{readable.map(c => <button key={c} type="button" data-kdn-bare role="tab" aria-selected={c === viewClass} className={c === viewClass ? "is-on" : ""} onClick={() => changeClass(c)}>{c}반<em>{Object.keys(data[c]?.entries || {}).length || ""}</em></button>)}</div>}
    {loading ? <div className="kcs-empty"><Loader2 size={16} className="spin" /> 불러오는 중입니다.</div> : mode === "edit" ? <div className="kcs-split">
      <nav className="kcs-list" aria-label={`${viewClass}반 학생`}>
        {students.map(([id, s]) => <button key={id} type="button" data-kdn-bare className={id === sid ? "is-on" : ""} onClick={() => pick(id)}>
          <span className="no">{s?.number || id.slice(-2)}</span><span className="nm">{s?.name || id}<small>{s?.gender || ""}</small></span>{countOf(id) ? <span className={`kcs-badge${mustOf(id) ? " must" : ""}`}>{countOf(id)}</span> : <span />}
        </button>)}
        {!students.length && <div className="kcs-empty">{viewClass}반 명단이 없습니다.</div>}
      </nav>
      <section className="kcs-pane">
        {!sid ? <div className="kcs-empty"><Users size={18} /> 왼쪽에서 학생을 고르세요. 숫자는 등록한 분리희망학생 수(빨강 = 반드시 분리 포함)입니다.</div> : <>
          <div className="kcs-pane-hd"><b>{label(sid, roster)}</b><small>{roster?.[sid]?.gender || ""} · 분리희망학생 {normalizeTargets(draft, sid).length}/{MAX_TARGETS}명{entries[sid]?.updatedAt ? ` · 마지막 저장 ${new Date(entries[sid].updatedAt).toLocaleString("ko-KR")}` : ""}</small></div>
          {reverse.length > 0 && <div className="kcs-back">이 학생을 분리 희망으로 적은 학생: {reverse.map(item => `${label(item.other, roster)}(${item.level})`).join(", ")}</div>}
          <div className="kcs-rows">{draft.map((item, index) => <div key={index} className="kcs-row">
            <span className="i">{index + 1}</span>
            {canEdit ? <TargetPicker value={item.sid} roster={roster} exclude={[sid, ...draft.map(t => t.sid).filter(Boolean)]} onChange={value => edit(index, { sid: value })} /> : <div className="kcs-chosen">{label(item.sid, roster)}</div>}
            <div className="kcs-level" role="group" aria-label="분리 등급">{SEPARATION_LEVELS.map((level, li) => <button key={level} type="button" data-kdn-bare disabled={!canEdit} aria-pressed={item.level === level} className={`${item.level === level ? "is-on" : ""} ${li === 0 ? "must" : "soft"}`} onClick={() => edit(index, { level })}>{level}</button>)}</div>
            <input className="reason" value={item.reason} disabled={!canEdit} placeholder="사유 (예: 학교폭력 관련, 갈등 등)" aria-label="사유" maxLength={200} onChange={event => edit(index, { reason: event.target.value })} />
            {canEdit ? <button type="button" className="kcs-del" aria-label={`${index + 1}번째 학생 지우기`} onClick={() => { setDraft(list => list.filter((_, i) => i !== index)); setDirty(true); }}><Trash2 size={15} /></button> : <span />}
          </div>)}</div>
          {!draft.length && <p className="kcs-note">등록된 분리희망학생이 없습니다.</p>}
          {canEdit && <div className="kcs-foot">
            <button type="button" className="kcs-btn ghost" disabled={draft.length >= MAX_TARGETS} onClick={() => { setDraft(list => [...list, { sid: "", level: SEPARATION_LEVELS[0], reason: "" }]); }}><Plus size={15} />학생 추가 ({draft.length}/{MAX_TARGETS})</button>
            <span className="sp" />
            {dirty && <small className="kcs-note">저장하지 않은 변경이 있어요</small>}
            <button type="button" className="kcs-btn pri" disabled={busy || !dirty} onClick={save}>{busy ? <Loader2 size={15} className="spin" /> : <Save size={15} />}저장</button>
          </div>}
          {!canEdit && <p className="kcs-note">이 반은 보기만 할 수 있습니다. 입력은 해당 반 담임 선생님이 합니다.</p>}
          <p className="kcs-note">반드시 분리: 같은 반이 되면 안 되는 경우 · 되도록 분리: 가능하면 나누는 경우. 이 화면은 2학년 담임·2학년부·관리자만 열 수 있습니다.</p>
        </>}
      </section>
    </div> : <div className="kcs-table-wrap">
      {summary.length ? <table className="kcs-table"><thead><tr><th>반</th><th>학번</th><th>이름</th><th>성별</th><th>분리희망학생</th><th>저장</th></tr></thead>
        <tbody>{summary.map(row => <tr key={row.id}><td className="c">{row.c}</td><td className="c">{row.id}</td><td className="c">{roster?.[row.id]?.name || ""}</td><td className="c">{roster?.[row.id]?.gender || ""}</td>
          <td><div className="kcs-chips">{row.targets.map(t => <span key={t.sid} className={`kcs-chip${t.level === SEPARATION_LEVELS[0] ? " must" : ""}`} title={t.reason || ""}>{label(t.sid, roster)} · {roster?.[t.sid] ? `${classOf(roster[t.sid])}반 · ` : ""}{t.level}{t.reason ? ` · ${t.reason}` : ""}</span>)}</div></td>
          <td className="c"><small>{row.updatedAt ? new Date(row.updatedAt).toLocaleDateString("ko-KR") : ""}{row.by ? ` · ${row.by}` : ""}</small></td></tr>)}</tbody></table>
        : <div className="kcs-empty"><Search size={16} /> 아직 등록된 분리희망학생이 없습니다.</div>}
    </div>}
  </div>;
}
