// 반편성 '선택과목' 탭: 학생마다 학기별 선택과목(그룹)을 보고, 바꿀 수 있어요.
// 바꿀 때는 그 학생의 반에서 시간표가 되는지(같은 과목·그룹을 듣는 다른 학생이 있는지, 그룹이 겹치지 않는지) 먼저 보여 줘요.
import React from "react";
import { BookOpen, Check, History, RotateCcw, Search, X } from "lucide-react";
import { SUBJECT_AREAS, subjectArea } from "./curriculum.js";
import { subjectCatalog, trySubjectChange, applySubjectChange, resetSubjects, subjectDiff, courseIssueText } from "./classPlacement.js";

// 과목 색: 2022 개정 교육과정 교과(군)별(curriculum.js subjectArea)
const kindOf = name => subjectArea(name);
const oldLabel = sid => `${Number(String(sid).slice(1, 3))}-${Number(String(sid).slice(3, 5))}`;
const fmt = iso => { const d = new Date(iso || ""); return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export default function PlacementSubjects({ placement, roster = {}, canEdit = false, commit, me, homeroomClass = "" }) {
  const [q, setQ] = React.useState("");
  const [cls, setCls] = React.useState(0);
  const [old, setOld] = React.useState(0);
  const [subj, setSubj] = React.useState("");
  const [onlyChanged, setOnlyChanged] = React.useState(false);
  const [edit, setEdit] = React.useState("");
  const students = placement?.students || {};
  const catalog = React.useMemo(() => subjectCatalog(placement), [placement]);
  const sems = Object.keys(catalog).sort();
  const nameOf = sid => students[sid]?.name || roster[sid]?.name || sid;
  const classes = Array.from(new Set(Object.values(students).map(x => Number(x.cls)))).sort((a, b) => a - b);
  const olds = Array.from(new Set(Object.keys(students).map(sid => Number(sid.slice(1, 3))))).filter(Boolean).sort((a, b) => a - b);
  const hasSj = Object.values(students).some(x => Array.isArray(x.sj) && x.sj.length);
  const changedIds = Object.keys(students).filter(sid => students[sid].sj0 && subjectDiff(students[sid]).length);
  const logs = placement?.subjChanges || [];

  if (!hasSj) return <section className="kps"><style>{CSS}</style><p className="kps-nil"><BookOpen size={16} /> 이 반편성 파일에는 학생별 과목 정보가 없어요. 과목 열이 있는 반편성 프로그램 파일('학생배정현황' 시트)을 '다시 올리기'로 올려 주세요.</p></section>;

  const [subjSem, subjName] = subj ? subj.split("|") : ["", ""];
  const list = Object.entries(students).filter(([sid, x]) => {
    if (q && !(String(x.name || "").includes(q) || oldLabel(sid).includes(q))) return false;
    if (cls && Number(x.cls) !== cls) return false;
    if (old && Number(sid.slice(1, 3)) !== old) return false;
    if (subj && !(x.sj || []).some(s => String(s.sem) === subjSem && s.n === subjName)) return false;
    if (onlyChanged && !changedIds.includes(sid)) return false;
    return true;
  }).sort((a, b) => (old ? a[0].localeCompare(b[0]) : 0) || a[1].cls - b[1].cls || (a[1].no || 99) - (b[1].no || 99) || a[0].localeCompare(b[0]));

  // 과목별 인원(학기·과목·그룹)
  const counts = {};
  Object.values(students).forEach(x => (x.sj || []).forEach(s => { const k = `${s.sem}|${s.n}`; counts[k] ||= { n: 0, g: {} }; counts[k].n += 1; counts[k].g[s.g] = (counts[k].g[s.g] || 0) + 1; }));
  const subjOptions = sems.flatMap(sem => Object.keys(counts).filter(k => k.startsWith(`${sem}|`)).sort((a, b) => a.localeCompare(b, "ko")));

  // 학기마다 그룹 열(A~E · F~J 등)과 원반 열: 같은 그룹 과목이 같은 칸에 줄 맞춰 보이게
  const cols = sems.map(sem => {
    const set = new Set(Object.values(catalog[sem] || {}).flat()); let ob = false;
    Object.values(students).forEach(x => (x.sj || []).forEach(s => { if (String(s.sem) !== sem) return; if (s.g === "원반") ob = true; else if (s.g) set.add(s.g); }));
    return { sem, letters: Array.from(set).sort(), ob };
  });
  const cell = (x, sem, g) => {
    const now = (x.sj || []).filter(s => String(s.sem) === sem && s.g === g);
    if (!now.length) return <span className="none">-</span>;
    const was = new Set((x.sj0 || x.sj || []).filter(s => String(s.sem) === sem).map(s => s.n));
    return <div className="blk">{now.map(s => { const isNew = x.sj0 && !was.has(s.n); return <span key={s.n} data-k={kindOf(s.n)} className={`sn${isNew ? " new" : ""}${subj === `${sem}|${s.n}` ? " hit" : ""}`} title={`${sem}학기 ${g === "원반" ? "원반" : `${g} 그룹`} · ${s.n}${isNew ? " (바꾼 과목)" : ""}`}>{s.n}</span>; })}</div>;
  };

  const cur = edit ? students[edit] : null;
  return <section className="kps"><style>{CSS}</style>
    <div className="kps-tools">
      <label className="find"><Search size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="이름·구반-번호" /></label>
      <label className="sel"><span>새 반</span><select value={cls} onChange={e => setCls(Number(e.target.value))}><option value={0}>전체</option>{classes.map(c => <option key={c} value={c}>{c}반</option>)}</select></label>
      <label className="sel"><span>구반</span><select value={old} onChange={e => setOld(Number(e.target.value))}><option value={0}>전체</option>{olds.map(c => <option key={c} value={c}>{c}반{Number(homeroomClass) === c ? " (우리 반)" : ""}</option>)}</select></label>
      <label className="sel wide"><span>과목</span><select value={subj} onChange={e => setSubj(e.target.value)}><option value="">전체</option>{subjOptions.map(k => { const [sem, n] = k.split("|"); return <option key={k} value={k}>{sem}학기 {n} ({counts[k].n}명)</option>; })}</select></label>
      <button type="button" data-kdn-bare className={`tg${onlyChanged ? " on" : ""}`} aria-pressed={onlyChanged} onClick={() => setOnlyChanged(v => !v)}>{onlyChanged && <Check size={13} />}바꾼 학생 <b>{changedIds.length}</b></button>
      {(q || cls || old || subj || onlyChanged) ? <button type="button" data-kdn-bare className="clr" onClick={() => { setQ(""); setCls(0); setOld(0); setSubj(""); setOnlyChanged(false); }}>모두 지우기</button> : null}
    </div>
    <p className="kps-sum"><b>{list.length}명</b>{subj ? ` · ${subjSem}학기 ${subjName} 그룹별 ${Object.entries(counts[subj]?.g || {}).map(([g, n]) => `${g} ${n}`).join(", ")}` : ""}{canEdit ? <small>과목을 바꾸려면 학생 줄의 '바꾸기'를 눌러요. 그 반에서 시간표가 되는지 먼저 알려 줘요.</small> : <small>보기만 할 수 있어요.</small>}</p>
    {(() => { const used = new Map(); Object.values(students).forEach(x => (x.sj || []).forEach(t => { const k = kindOf(t.n); used.set(k, (used.get(k) || new Set()).add(t.n)); })); const list2 = [...SUBJECT_AREAS, { key: "etc", label: "기타" }].filter(k => used.has(k.key)); return list2.length > 0 && <div className="kps-legend" aria-label="과목 묶음 색">{list2.map(k => <span key={k.key} data-k={k.key} title={Array.from(used.get(k.key)).join(", ")}><i />{k.label}<small>{used.get(k.key).size}과목</small></span>)}<span className="nw"><i style={{ background: "transparent", boxShadow: "none", border: "1.5px dashed currentColor" }} />바꾼 과목</span></div>; })()}
    <div className="kps-scroll"><table className="kps-grid">
      <colgroup><col style={{ width: 54 }} /><col style={{ width: 62 }} /><col style={{ width: 104 }} />{cols.flatMap(c => [...(c.ob ? [<col key={`${c.sem}ob`} />] : []), ...c.letters.map(l => <col key={`${c.sem}${l}`} />)])}<col style={{ width: 74 }} /></colgroup>
      <thead>
        <tr className="h1"><th rowSpan={2} className="c">새 반</th><th rowSpan={2} className="c">구반-번호</th><th rowSpan={2}>이름</th>{cols.map(c => <th key={c.sem} colSpan={c.letters.length + (c.ob ? 1 : 0)} className={`sem s${c.sem}`}>{c.sem}학기</th>)}<th rowSpan={2} className="c">{canEdit ? "바꾸기" : "보기"}</th></tr>
        <tr className="h2">{cols.map(c => <React.Fragment key={c.sem}>{c.ob && <th className={`g ob first s${c.sem}`}>원반</th>}{c.letters.map((l, k) => <th key={l} className={`g s${c.sem}${!c.ob && !k ? " first" : ""}`}>{l}</th>)}</React.Fragment>)}</tr>
      </thead>
      <tbody>{list.map(([sid, x], idx) => { const diff = changedIds.includes(sid); const newCls = idx > 0 && Number(list[idx - 1][1].cls) !== Number(x.cls) && !old; return <tr key={sid} className={`${diff ? "chg" : ""}${newCls ? " brk" : ""}`}>
        <td className="c"><span className="cls">{x.cls}반</span></td><td className="c mono">{oldLabel(sid)}</td>
        <td className="nm"><b>{nameOf(sid)}</b>{diff && <em>바꿈</em>}</td>
        {cols.map(c => <React.Fragment key={c.sem}>{c.ob && <td className={`g ob first s${c.sem}`}>{cell(x, c.sem, "원반")}</td>}{c.letters.map((l, k) => <td key={l} className={`g s${c.sem}${!c.ob && !k ? " first" : ""}`}>{cell(x, c.sem, l)}</td>)}</React.Fragment>)}
        <td className="c"><button type="button" data-kdn-bare className="eb" onClick={() => setEdit(sid)}>{canEdit ? "바꾸기" : "보기"}</button></td>
      </tr>; })}</tbody>
    </table>{!list.length && <p className="kps-nil">조건에 맞는 학생이 없어요.</p>}</div>
    <details className="kps-fold"><summary><History size={14} /><b>바꾼 기록 {logs.length}건</b><small>{changedIds.length ? `${changedIds.length}명` : "아직 없어요"}</small></summary>
      <ul>{logs.slice().reverse().map(l => <li key={l.id}><b>{nameOf(l.sid)}</b><span className="mono">{oldLabel(l.sid)} · {students[l.sid]?.cls}반</span><span>{l.sem}학기 {l.from.n}({l.from.g}) → <strong>{l.to.n}({l.to.g})</strong></span><small>{l.by} · {fmt(l.at)}</small></li>)}</ul>
    </details>
    {cur && <SubjectEditor sid={edit} x={cur} name={nameOf(edit)} placement={placement} catalog={catalog} sems={sems} canEdit={canEdit} onClose={() => setEdit("")}
      onApply={async (sem, from, to, g) => { await commit(p => applySubjectChange(p, { sid: edit, sem, from, to, g, by: me.name }), `${nameOf(edit)} 학생 ${sem}학기 '${from}' → '${to}'(으)로 바꿨어요.`); }}
      onReset={async () => { if (!window.confirm(`${nameOf(edit)} 학생 과목을 처음 엑셀대로 되돌릴까요?`)) return; await commit(p => resetSubjects(p, edit), `${nameOf(edit)} 학생 과목을 처음대로 되돌렸어요.`); }} />}
  </section>;
}

function SubjectEditor({ sid, x, name, placement, catalog, sems, canEdit, onClose, onApply, onReset }) {
  const [pick, setPick] = React.useState({}); // { "학기|원래과목": 새 과목 }
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { setPick({}); }, [sid]);
  const diff = subjectDiff(x);
  const results = React.useMemo(() => {
    const out = {};
    sems.forEach(sem => (x.sj || []).filter(s => String(s.sem) === sem && s.g !== "원반").forEach(s => {
      const taken = new Set((x.sj || []).filter(y => String(y.sem) === sem).map(y => y.n));
      Object.keys(catalog[sem] || {}).filter(n => !taken.has(n)).sort((a, b) => a.localeCompare(b, "ko")).forEach(n => { out[`${sem}|${s.n}|${n}`] = trySubjectChange(placement, sid, sem, s.n, n); });
    }));
    return out;
  }, [placement, sid, x, catalog, sems]);
  const okOf = r => !r?.check || r.check.ok;
  return <div className="kps-modal" role="dialog" aria-modal="true" aria-label={`${name} 선택과목`} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><style>{CSS}</style><div className="box">
    <header><b>{name}</b><span className="mono">{oldLabel(sid)} → {x.cls}반</span>{diff.length > 0 && <em>바꿈 {diff.length}</em>}<button type="button" data-kdn-bare className="x" onClick={onClose} aria-label="닫기"><X size={16} /></button></header>
    <p className="lead">{canEdit ? `과목을 고르면 ${x.cls}반에서 그 과목·그룹을 듣는 다른 학생이 있는지, 다른 과목과 그룹이 겹치지 않는지 바로 알려 줘요.` : "선택과목을 볼 수 있어요."}</p>
    {sems.map(sem => <div key={sem} className="sem"><h5>{sem}학기</h5>
      <table><tbody>{(x.sj || []).filter(s => String(s.sem) === sem).map(s => { const k = `${sem}|${s.n}`; const to = pick[k] || ""; const r = to ? results[`${sem}|${s.n}|${to}`] : null; const orig = diff.find(d => d.sem === sem && d.to === s.n) ? { n: diff.find(d => d.sem === sem && d.to === s.n).from } : null;
        return <tr key={s.n}>
          <td className="g"><i className={s.g === "원반" ? "ob" : ""}>{s.g === "원반" ? "원반" : s.g}</i></td>
          <td className="n"><b>{s.n}</b>{orig && <small>처음: {orig.n}</small>}</td>
          <td className="to">{s.g === "원반" ? <small className="lock">원반 과목은 반 전체가 함께 들어 바꿀 수 없어요</small> : canEdit && <>
            <select value={to} onChange={e => setPick(v => ({ ...v, [k]: e.target.value }))}><option value="">바꿀 과목 고르기</option>
              {Object.keys(catalog[sem] || {}).filter(n => results[`${sem}|${s.n}|${n}`] !== undefined).map(n => { const rr = results[`${sem}|${s.n}|${n}`]; return <option key={n} value={n}>{okOf(rr) ? "○" : "✕"} {n}{rr?.g ? ` (${rr.g})` : ""}</option>; })}
            </select>
            {r && <div className={`res ${okOf(r) ? "ok" : "bad"}`}>{okOf(r) ? <>{x.cls}반에서 들을 수 있어요 · {r.g} 그룹{r.check?.plan?.length ? ` · 다른 과목 그룹 조정: ${r.check.plan.map(p => `${p.n} ${p.from}→${p.to}`).join(", ")}` : ""}</> : <>{r.check.issues.map(courseIssueText).join(" · ")}</>}
              <button type="button" data-kdn-bare className={okOf(r) ? "go" : "go warn"} disabled={busy} onClick={async () => { if (!okOf(r) && !window.confirm(`${x.cls}반에서 시간표가 맞지 않아요.\n${r.check.issues.map(courseIssueText).join("\n")}\n그래도 바꿀까요?`)) return; setBusy(true); await onApply(sem, s.n, to, r.g); setBusy(false); setPick(v => { const n = { ...v }; delete n[k]; return n; }); }}>{okOf(r) ? "바꾸기" : "그래도 바꾸기"}</button></div>}
          </>}</td>
        </tr>; })}</tbody></table></div>)}
    <footer>{canEdit && x.sj0 && <button type="button" data-kdn-bare className="rs" onClick={onReset}><RotateCcw size={13} /> 처음 엑셀대로 되돌리기</button>}<button type="button" data-kdn-bare className="ok" onClick={onClose}>닫기</button></footer>
  </div></div>;
}

const CSS = `
.kps{display:grid;gap:12px}
.kps-nil{display:flex;align-items:center;gap:8px;margin:0;padding:18px;border-radius:12px;background:var(--kdn-surface-2,#f3f4f6);color:var(--kdn-ink-soft,#4b5563);font-size:14px}
.kps-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.kps-tools .find{display:flex;align-items:center;gap:6px;height:38px;padding:0 12px;border-radius:10px;border:1px solid var(--kdn-line,#d1d5db);background:var(--kdn-surface,#fff);color:var(--kdn-muted,#6b7280);flex:0 1 220px}
.kps-tools .find input{border:0!important;outline:0;background:transparent!important;font:inherit;font-size:14px;width:100%;color:var(--kdn-ink,#111827);box-shadow:none!important;padding:0!important;min-height:0!important}
.kps-tools .sel{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 4px 0 12px;border-radius:10px;border:1px solid var(--kdn-line,#d1d5db);background:var(--kdn-surface,#fff);font-size:13px;font-weight:700;color:var(--kdn-muted,#6b7280)}
.kps-tools .sel select{height:32px;border:0!important;background:transparent!important;font:inherit;font-size:13.5px;font-weight:800;color:var(--kdn-ink,#111827);cursor:pointer;max-width:240px;box-shadow:none!important}
.kps-tools .tg{display:inline-flex;align-items:center;gap:5px;height:38px;padding:0 12px;border-radius:10px;border:1px solid var(--kdn-line,#d1d5db);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#111827);font:inherit;font-size:13.5px;font-weight:800;cursor:pointer}
.kps-tools .tg b{min-width:18px;padding:0 6px;border-radius:99px;background:var(--kdn-surface-2,#f3f4f6);font-size:12px;text-align:center}
.kps-tools .tg.on{border-color:#c4b5fd;background:color-mix(in srgb,#8b5cf6 10%,var(--kdn-surface,#fff))}
.kps-tools .clr{border:0;background:transparent;color:var(--kdn-muted,#6b7280);font:inherit;font-size:13px;text-decoration:underline;cursor:pointer}
.kps-sum{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin:0;font-size:13.5px;color:var(--kdn-ink-soft,#374151)}.kps-sum b{font-size:15px;color:var(--kdn-ink,#111827)}.kps-sum small{margin-left:auto;color:var(--kdn-muted,#6b7280);font-size:12.5px}
.kps-scroll{overflow:auto;max-height:70vh;border:1px solid var(--kdn-line,#e5e7eb);border-radius:14px;background:var(--kdn-surface,#fff)}
.kps-grid{width:100%;min-width:980px;border-collapse:separate;border-spacing:0;font-size:13px;table-layout:fixed}
.kps-grid th{position:sticky;z-index:1;background:var(--kdn-surface-2,#f3f4f6);color:var(--kdn-ink-soft,#374151);font-size:12.5px;font-weight:800;text-align:left;padding:8px 10px;border-bottom:1px solid var(--kdn-line,#e5e7eb);white-space:nowrap}
.kps-grid tr.h1 th{top:0;height:36px}.kps-grid tr.h2 th{top:36px;padding:5px 8px;font-size:12px;text-align:center}
.kps-grid th.sem{text-align:center;border-left:2px solid var(--kdn-line,#d1d5db)}
.kps-grid th.sem.s1{background:color-mix(in srgb,#3b82f6 9%,var(--kdn-surface-2,#f3f4f6));color:#1d4ed8}.kps-grid th.sem.s2{background:color-mix(in srgb,#10a37f 9%,var(--kdn-surface-2,#f3f4f6));color:#047857}
.kps-grid th.g.s1{background:color-mix(in srgb,#3b82f6 5%,var(--kdn-surface-2,#f3f4f6))}.kps-grid th.g.s2{background:color-mix(in srgb,#10a37f 5%,var(--kdn-surface-2,#f3f4f6))}
.kps-grid{--ln:color-mix(in srgb,var(--kdn-ink,#111827) 13%,transparent);--ln2:color-mix(in srgb,var(--kdn-ink,#111827) 30%,transparent)}
.kps-grid th{border-bottom:1px solid var(--ln)!important}.kps-grid tr.h2 th{border-bottom:2px solid var(--ln2)!important}
.kps-grid td{padding:7px 8px;border-bottom:1px solid var(--ln);vertical-align:middle}
.kps-grid td.g,.kps-grid th.g{border-left:1px solid var(--ln);text-align:center}
.kps-grid td.first,.kps-grid th.first,.kps-grid th.sem{border-left:2px solid var(--ln2)}
.kps-grid td.g{padding:5px 5px}
.kps-grid tbody tr:hover td{background:color-mix(in srgb,#3b82f6 5%,transparent)}
.kps-grid tr.brk td{border-top:2px solid var(--ln2)}
.kps-grid .blk{display:flex;flex-direction:column;gap:3px}
.kps-grid .sn{display:flex;align-items:center;justify-content:center;min-height:26px;padding:3px 6px;border-radius:7px;border:1px solid transparent;font-size:12px;line-height:1.25;letter-spacing:-.02em;font-weight:700;color:var(--kdn-ink,#111827);word-break:keep-all;text-align:center;--c:#64748b;background:color-mix(in srgb,var(--c) 15%,var(--kdn-surface,#fff));box-shadow:inset 4px 0 0 var(--c)}
.kps-grid .sn[data-k="kor"],.kps-legend [data-k="kor"]{--c:#ca8a04}.kps-grid .sn[data-k="math"],.kps-legend [data-k="math"]{--c:#2563eb}.kps-grid .sn[data-k="eng"],.kps-legend [data-k="eng"]{--c:#7c3aed}.kps-grid .sn[data-k="soc"],.kps-legend [data-k="soc"]{--c:#ea580c}.kps-grid .sn[data-k="sci"],.kps-legend [data-k="sci"]{--c:#16a34a}.kps-grid .sn[data-k="lang2"],.kps-legend [data-k="lang2"]{--c:#db2777}.kps-grid .sn[data-k="tech"],.kps-legend [data-k="tech"]{--c:#0891b2}.kps-grid .sn[data-k="artpe"],.kps-legend [data-k="artpe"]{--c:#92400e}.kps-grid .sn[data-k="lib"],.kps-legend [data-k="lib"]{--c:#475569}.kps-grid .sn[data-k="etc"],.kps-legend [data-k="etc"]{--c:#9ca3af}
.kps-legend{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;font-size:12.5px;color:var(--kdn-ink-soft,#4b5563)}.kps-legend span{display:inline-flex;align-items:center;gap:6px;font-weight:700}.kps-legend i{width:14px;height:14px;border-radius:4px;background:color-mix(in srgb,var(--c) 18%,var(--kdn-surface,#fff));box-shadow:inset 3px 0 0 var(--c)}.kps-legend small{color:var(--kdn-muted,#9ca3af);font-weight:600}
.kps-grid td.ob .sn{font-weight:600}
.kps-grid .sn.new{border:1.5px dashed var(--kdn-ink,#111827)}
.kps-grid .sn.hit{border-color:var(--kdn-ink,#111827);box-shadow:inset 4px 0 0 var(--c),0 0 0 2px color-mix(in srgb,var(--kdn-ink,#111827) 25%,transparent)}
.kps-grid .none{color:var(--kdn-muted,#c0c4cc)}
.kps-grid .c{text-align:center}.kps .mono{font-variant-numeric:tabular-nums;color:var(--kdn-ink-soft,#4b5563)}
.kps-grid tr.chg td.nm{box-shadow:inset 3px 0 0 #8b5cf6}
.kps-grid .cls{display:inline-block;min-width:38px;padding:2px 8px;border-radius:99px;background:var(--kdn-surface-2,#f3f4f6);font-weight:800;font-size:12.5px}
.kps-grid .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kps-grid .nm em{display:block;width:max-content;margin-top:2px;padding:1px 7px;border-radius:99px;background:#ede9fe;color:#5b21b6;font-style:normal;font-size:11.5px;font-weight:800}
.kps .chips{display:flex;flex-wrap:wrap;gap:4px}
.kps .sj{display:inline-flex;align-items:center;gap:5px;padding:2px 8px 2px 3px;border-radius:8px;border:1px solid var(--kdn-line,#e5e7eb);background:var(--kdn-surface,#fff);font-size:12.5px;font-weight:700;color:var(--kdn-ink,#111827);white-space:nowrap}
.kps .sj i{font-style:normal;min-width:18px;padding:0 4px;border-radius:5px;background:var(--kdn-surface-2,#f3f4f6);color:var(--kdn-ink-soft,#4b5563);font-size:11px;font-weight:800;text-align:center}
.kps .sj.ob{background:var(--kdn-surface-2,#f3f4f6);color:var(--kdn-ink-soft,#4b5563)}.kps .sj.ob i{background:transparent}
.kps .sj.new{border-color:#a78bfa;background:#f5f3ff;color:#5b21b6}.kps .sj.new i{background:#ddd6fe;color:#5b21b6}
.kps .sj.hit{box-shadow:0 0 0 2px #93c5fd}
.kps-grid .eb{height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--kdn-line,#d1d5db);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#111827);font:inherit;font-size:12.5px;font-weight:800;cursor:pointer}
.kps-grid .eb:hover{border-color:#a78bfa;color:#5b21b6}
.kps-fold{border:1px solid var(--kdn-line,#e5e7eb);border-radius:12px;background:var(--kdn-surface,#fff);padding:0 14px}
.kps-fold summary{display:flex;align-items:center;gap:8px;padding:11px 0;cursor:pointer;font-size:13.5px}.kps-fold summary small{color:var(--kdn-muted,#6b7280)}
.kps-fold ul{list-style:none;margin:0 0 12px;padding:0;display:grid;gap:6px}
.kps-fold li{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;padding:7px 10px;border-radius:9px;background:var(--kdn-surface-2,#f6f7f9);font-size:13px}.kps-fold li small{margin-left:auto;color:var(--kdn-muted,#6b7280)}
.kps-modal{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:16px;background:rgba(15,18,26,.45)}
.kps-modal .box{width:min(640px,100%);max-height:88vh;overflow:auto;border-radius:16px;background:var(--kdn-surface,#fff);color:var(--kdn-ink,#111827);box-shadow:0 20px 50px rgba(0,0,0,.25);padding:16px 18px;display:grid;gap:12px}
.kps-modal header{display:flex;align-items:center;gap:10px}.kps-modal header b{font-size:17px}.kps-modal header em{padding:1px 8px;border-radius:99px;background:#ede9fe;color:#5b21b6;font-style:normal;font-size:12px;font-weight:800}
.kps-modal header .x{margin-left:auto;display:grid;place-items:center;width:32px;height:32px;border-radius:9px;border:0;background:transparent;color:var(--kdn-muted,#6b7280);cursor:pointer}
.kps-modal .lead{margin:0;font-size:13px;line-height:1.55;color:var(--kdn-ink-soft,#4b5563)}
.kps-modal .sem{border:1px solid var(--kdn-line,#e5e7eb);border-radius:12px;overflow:hidden}
.kps-modal .sem h5{margin:0;padding:8px 12px;background:var(--kdn-surface-2,#f3f4f6);font-size:13px}
.kps-modal .sem table{width:100%;border-collapse:collapse}
.kps-modal .sem td{padding:8px 10px;border-top:1px solid var(--kdn-line,#eef0f3);vertical-align:top;font-size:13.5px}
.kps-modal .sem td.g{width:44px;text-align:center}.kps-modal .sem td.g i{display:inline-block;min-width:24px;padding:2px 5px;border-radius:6px;background:var(--kdn-surface-2,#f3f4f6);font-style:normal;font-weight:800;font-size:12px}.kps-modal .sem td.g i.ob{font-size:11px}
.kps-modal .sem td.n{width:34%}.kps-modal .sem td.n small{display:block;color:#7c3aed;font-size:11.5px}
.kps-modal .sem select{width:100%;height:34px;border-radius:9px;border:1px solid var(--kdn-line,#d1d5db);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#111827);font:inherit;font-size:13.5px;padding:0 8px}
.kps-modal .lock{color:var(--kdn-muted,#6b7280);font-size:12px}
.kps-modal .res{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-top:6px;padding:7px 10px;border-radius:9px;font-size:12.5px;line-height:1.5}
.kps-modal .res.ok{background:color-mix(in srgb,#16a34a 10%,transparent);color:#166534}.kps-modal .res.bad{background:color-mix(in srgb,#dc2626 10%,transparent);color:#991b1b}
.kps-modal .res .go{margin-left:auto;height:30px;padding:0 14px;border-radius:8px;border:0;background:#16a34a;color:#fff;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer}.kps-modal .res .go.warn{background:#dc2626}
.kps-modal footer{display:flex;gap:8px;justify-content:flex-end}
.kps-modal footer button{height:36px;padding:0 14px;border-radius:10px;border:1px solid var(--kdn-line,#d1d5db);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#111827);font:inherit;font-size:13.5px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
.kps-modal footer .rs{margin-right:auto;color:#5b21b6}.kps-modal footer .ok{background:var(--kdn-ink,#111827);color:var(--kdn-surface,#fff);border-color:transparent}
`;
