// 반편성 '선택과목' 탭: 학생마다 학기별 선택과목(그룹)을 보고, 바꿀 수 있어요.
// 바꿀 때는 그 학생의 반에서 시간표가 되는지(같은 과목·그룹을 듣는 다른 학생이 있는지, 그룹이 겹치지 않는지) 먼저 보여 줘요.
import React from "react";
import { BookOpen, Check, History, RotateCcw, Search, X } from "lucide-react";
import { SUBJECT_AREAS, subjectArea } from "./curriculum.js";
import { subjectCatalog, sectionMembers, checkManualGroups, arrangeSubjectSet, applySubjectSet, trySubjectChange, applySubjectChange, resetSubjects, subjectDiff, courseIssueText } from "./classPlacement.js";

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
    return <div className="blk">{now.map(s => { const isNew = x.sj0 && !was.has(s.n); return <span key={s.n} data-k={kindOf(s.n)} className={`sn${isNew ? " new" : ""}${subj === `${sem}|${s.n}` ? " hit" : ""}`} title={`${sem}학기 ${g === "원반" ? "원반" : `${g} 그룹`} · ${s.n}${s.ox ? " (원반 대신 듣는 과목)" : ""}${isNew ? " (바꾼 과목)" : ""}`}>{s.n}</span>; })}</div>;
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
      onApplySet={async (sem, sj) => { await commit(p => applySubjectSet(p, { sid: edit, sem, sj, by: me.name }), `${nameOf(edit)} 학생 ${sem}학기 과목을 다시 골랐어요.`); }}
      onApply={async (sem, from, to, g, ox, sj) => { await commit(p => applySubjectChange(p, { sid: edit, sem, from, to, g, ox, sj, by: me.name }), `${nameOf(edit)} 학생 ${sem}학기 '${from}' → '${to}'(으)로 바꿨어요.`); }}
      onReset={async () => { if (!window.confirm(`${nameOf(edit)} 학생 과목을 처음 엑셀대로 되돌릴까요?`)) return; await commit(p => resetSubjects(p, edit), `${nameOf(edit)} 학생 과목을 처음대로 되돌렸어요.`); }} />}
  </section>;
}

function SubjectEditor({ sid, x, name, placement, catalog, sems, canEdit, onClose, onApply, onApplySet, onReset }) {
  const [pick, setPick] = React.useState({}); // { 학기: { from, to } }
  const [reset, setReset] = React.useState({}); // { 학기: [고른 과목] } — 과목 다시 고르기
  const [manual, setManual] = React.useState({}); // { 학기: { letters: {그룹: 과목}, ob: [원반 과목] } } — 그룹 직접 넣기
  const memOthers = React.useMemo(() => sectionMembers({ ...placement, students: Object.fromEntries(Object.entries(placement?.students || {}).filter(([id]) => id !== sid)) }), [placement, sid]);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { setPick({}); setReset({}); setManual({}); }, [sid, x]);
  const diff = subjectDiff(x);
  const rm = placement?.rooms;
  const okOf = r => !r?.check || r.check.ok;
  const lettersOf = sem => { const set = new Set(rm?.letters?.[sem] || []); (x.sj || []).forEach(t => { if (String(t.sem) === sem && t.g !== "원반" && t.g) set.add(t.g); }); return Array.from(set).sort(); };
  const blockedOf = sem => (rm?.letters?.[sem] || []).filter(l => !(rm?.part?.[sem]?.[l] || []).map(Number).includes(Number(x.cls)));
  // 그룹 칸 한 줄: 원반 · A · B …
  const grid = (sem, sj, mark = new Set()) => { const L = lettersOf(sem); const ob = sj.filter(t => String(t.sem) === sem && t.g === "원반"); const blocked = blockedOf(sem);
    return <div className="ggrid">{ob.length > 0 && <div className="gc ob"><i>원반</i>{ob.map(t => <b key={t.n} data-k={subjectArea(t.n)} className={mark.has(t.n) ? "chg" : ""}>{t.n}</b>)}</div>}
      {L.map(l => { const here = sj.filter(t => String(t.sem) === sem && t.g === l); return <div key={l} className={`gc${blocked.includes(l) ? " bl" : ""}`} title={blocked.includes(l) ? `${x.cls}반은 ${l} 시간에 원반 수업` : ""}><i>{l}</i>{here.length ? here.map(t => <b key={t.n} data-k={subjectArea(t.n)} className={mark.has(t.n) ? "chg" : ""}>{t.n}{t.ox ? <small>원반 대신</small> : null}</b>) : <em>{blocked.includes(l) ? "원반 시간" : "-"}</em>}</div>; })}</div>; };
  return <div className="kps-modal" role="dialog" aria-modal="true" aria-label={`${name} 선택과목`} onClick={e => { if (e.target === e.currentTarget) onClose(); }}><style>{CSS}</style><div className="box">
    <header><b>{name}</b><span className="mono">{oldLabel(sid)} → {x.cls}반</span>{diff.length > 0 && <em>바꿈 {diff.length}</em>}<button type="button" data-kdn-bare className="x" onClick={onClose} aria-label="닫기"><X size={16} /></button></header>
    <p className="lead">{canEdit ? `'그룹 직접 넣기'로 A, B, C…마다 과목을 직접 고르거나, '과목 다시 고르기'(그룹 자동 배정), 한 과목씩 바꾸기 중 편한 방법을 써요.` : "선택과목을 볼 수 있어요."}</p>
    {sems.map(sem => { const mine = (x.sj || []).filter(t => String(t.sem) === sem); if (!mine.length) return null;
      const pk = pick[sem] || {}; const from = pk.from || ""; const to = pk.to || "";
      const fromItem = mine.find(t => t.n === from);
      const obc = fromItem && (fromItem.g === "원반" || fromItem.ox) ? (rm?.ob?.[x.cls]?.[sem] || []) : [];
      const taken = new Set(mine.map(t => t.n));
      const cands = from ? Array.from(new Set([...Object.keys(catalog[sem] || {}), ...obc])).filter(n => !taken.has(n)).sort((a, b) => a.localeCompare(b, "ko")).map(n => [n, trySubjectChange(placement, sid, sem, from, n)]) : [];
      const r = to ? cands.find(([n]) => n === to)?.[1] : null;
      const set = v => setPick(p => ({ ...p, [sem]: { ...(p[sem] || {}), ...v } }));
      const rs = reset[sem];
      const mn = manual[sem];
      const mr = mn ? checkManualGroups(placement, sid, sem, mn) : null;
      const setCell = (l, n) => setManual(v => ({ ...v, [sem]: { ...v[sem], letters: { ...v[sem].letters, [l]: n } } }));
      const toggleOb = n => setManual(v => { const ob = v[sem].ob || []; return { ...v, [sem]: { ...v[sem], ob: ob.includes(n) ? ob.filter(k => k !== n) : [...ob, n] } }; });
      const obAll = rm?.ob?.[x.cls]?.[sem] || [];
      const toggle = n => setReset(v => { const cur = v[sem] || []; return { ...v, [sem]: cur.includes(n) ? cur.filter(k => k !== n) : [...cur, n] }; });
      const rr = rs ? arrangeSubjectSet(placement, sid, sem, rs) : null;
      const groupsPick = rs ? [...(obAll.length ? [{ key: "ob", label: `${x.cls}반 원반 과목`, list: obAll }] : []), ...[...SUBJECT_AREAS, { key: "etc", label: "기타" }].map(a => ({ key: a.key, label: a.label, list: Object.keys(catalog[sem] || {}).filter(n => !obAll.includes(n) && subjectArea(n) === a.key).sort((p, q) => p.localeCompare(q, "ko")) })).filter(g => g.list.length)] : [];
      return <div key={sem} className="sem"><h5>{sem}학기 <small>지금</small>{canEdit && !mn && <button type="button" data-kdn-bare className={`rsb${rs ? " on" : ""}`} onClick={() => setReset(v => { const n = { ...v }; if (rs) delete n[sem]; else n[sem] = []; return n; })}>{rs ? "다시 고르기 취소" : "과목 다시 고르기"}</button>}
          {canEdit && !rs && <button type="button" data-kdn-bare className={`rsb${mn ? " on" : ""}${mn ? "" : " sec"}`} onClick={() => setManual(v => { const n = { ...v }; if (mn) delete n[sem]; else n[sem] = { letters: Object.fromEntries(mine.filter(t => t.g !== "원반").map(t => [t.g, t.n])), ob: mine.filter(t => t.g === "원반").map(t => t.n) }; return n; })}>{mn ? "직접 넣기 취소" : "그룹 직접 넣기"}</button>}</h5>
        {!mn && grid(sem, x.sj || [], new Set(diff.filter(d => d.sem === sem).map(d => d.to)))}
        {mn && <div className="manual">
          <p className="rp-h"><b>그룹마다 과목을 직접 골라요</b><span>○ 이 반에서 들을 수 있음 · ✕ 이 반에 그 그룹 듣는 학생 없음</span><button type="button" data-kdn-bare onClick={() => setManual(v => ({ ...v, [sem]: { letters: {}, ob: [] } }))}>모두 비우기</button></p>
          <div className="mgrid">
            {obAll.length > 0 && <div className="mc ob"><i>원반</i>{obAll.map(n => <label key={n} className="obck"><input type="checkbox" checked={(mn.ob || []).includes(n)} onChange={() => toggleOb(n)} /><span data-k={subjectArea(n)}>{n}</span></label>)}</div>}
            {lettersOf(sem).map(l => { const bl = blockedOf(sem).includes(l); const opts = Object.keys(catalog[sem] || {}).filter(n => (catalog[sem][n] || []).includes(l)).sort((a, b) => a.localeCompare(b, "ko")); const cur = mn.letters?.[l] || ""; const cell = mr?.cells?.[l];
              return <div key={l} className={`mc${bl ? " bl" : ""}${cell && !cell.ok ? " bad" : ""}`}><i>{l}{bl && <small>원반 시간</small>}</i>
                <select value={cur} onChange={e => setCell(l, e.target.value)}><option value="">{bl ? "원반 수업" : "비움"}</option>{opts.map(n => { const okN = bl || (memOthers.get(`${sem}|${n}|${l}`)?.get(Number(x.cls)) || 0) > 0; return <option key={n} value={n}>{okN ? "○" : "✕"} {n}</option>; })}</select>
                {cur && <b data-k={subjectArea(cur)}>{cur}{cell?.ox ? <small>원반 대신</small> : null}</b>}
                {cell && !cell.ok && <em>{cell.why}</em>}
              </div>; })}
          </div>
          {mr && <div className={`res ${mr.ok ? "ok" : "bad"}`}><div className="rh"><b>{mr.ok ? `${x.cls}반 시간표에 맞아요` : "확인할 것이 있어요"}</b>{!mr.ok && <span>{mr.issues.join(" · ")}</span>}</div>
            <div className="rf"><button type="button" data-kdn-bare className={mr.ok ? "go" : "go warn"} disabled={busy} onClick={async () => { if (!mr.ok && !window.confirm(`${mr.issues.join("\n")}\n그래도 저장할까요?`)) return; setBusy(true); await onApplySet(sem, mr.sj); setBusy(false); setManual(v => { const n = { ...v }; delete n[sem]; return n; }); }}>{mr.ok ? "이대로 저장" : "그래도 저장"}</button></div></div>}
        </div>}
        {rs && <div className="repick">
          <p className="rp-h"><b>{sem}학기 과목을 처음부터 골라요</b><span>고른 과목 <strong>{rs.length}</strong>개 · 지금 {mine.length}개</span><button type="button" data-kdn-bare onClick={() => setReset(v => ({ ...v, [sem]: mine.map(t => t.n) }))}>지금 과목 불러오기</button><button type="button" data-kdn-bare onClick={() => setReset(v => ({ ...v, [sem]: [] }))}>모두 비우기</button></p>
          {groupsPick.map(g => <div key={g.key} className="rp-g"><small>{g.label}</small><div>{g.list.map(n => <button key={n} type="button" data-kdn-bare data-k={g.key === "ob" ? subjectArea(n) : g.key} aria-pressed={rs.includes(n)} className={rs.includes(n) ? "on" : ""} onClick={() => toggle(n)}>{rs.includes(n) && <Check size={12} />}{n}</button>)}</div></div>)}
          {rs.length > 0 && rr && <div className={`res ${rr.ok ? "ok" : "bad"}`}>
            <div className="rh"><b>{rr.ok ? `고른 과목으로 짠 ${x.cls}반 시간표` : "이대로는 시간표가 맞지 않아요"}</b>{!rr.ok && <span>{rr.issues.map(courseIssueText).join(" · ")}</span>}{rs.length !== mine.length && <span>과목 수가 지금({mine.length}개)과 달라요</span>}</div>
            {grid(sem, rr.sj, new Set(rs.filter(n => !mine.some(t => t.n === n))))}
            <div className="rf"><button type="button" data-kdn-bare className={rr.ok ? "go" : "go warn"} disabled={busy} onClick={async () => { if (!rr.ok && !window.confirm(`${x.cls}반에서 시간표가 맞지 않아요.\n${rr.issues.map(courseIssueText).join("\n")}\n그래도 저장할까요?`)) return; setBusy(true); await onApplySet(sem, rr.sj); setBusy(false); setReset(v => { const n = { ...v }; delete n[sem]; return n; }); }}>{rr.ok ? "이대로 저장" : "그래도 저장"}</button></div>
          </div>}
        </div>}
        {canEdit && !rs && !mn && <div className="chgrow">
          <label><span>빼는 과목</span><select value={from} onChange={e => set({ from: e.target.value, to: "" })}><option value="">고르기</option>{mine.map(t => <option key={t.n} value={t.n}>{t.n} ({t.g === "원반" ? "원반" : t.g})</option>)}</select></label>
          <span className="ar">→</span>
          <label><span>넣는 과목</span><select value={to} disabled={!from} onChange={e => set({ to: e.target.value })}><option value="">{from ? "고르기 (○ 가능 · ✕ 안 됨)" : "빼는 과목부터"}</option>{cands.map(([n, rr]) => <option key={n} value={n}>{okOf(rr) ? "○" : "✕"} {n}</option>)}</select></label>
        </div>}
        {!rs && !mn && fromItem && (fromItem.g === "원반" || fromItem.ox) && !to && <p className="hint">원반 과목은 {x.cls}반 원반 시간({blockedOf(sem).join("·") || "-"} 그룹)에 다른 반에서 열리는 수업으로만 바꿀 수 있어요.</p>}
        {!rs && !mn && r && <div className={`res ${okOf(r) ? "ok" : "bad"}`}>
          <div className="rh"><b>{okOf(r) ? `바꾼 뒤 ${x.cls}반 시간표` : "시간표가 맞지 않아요"}</b>
            <span>{okOf(r) ? <>{to} → {r.g === "원반" ? "원반" : `${r.g} 그룹${r.ox ? " (원반 대신)" : ""}`}{r.moved?.length ? ` · 함께 옮김: ${r.moved.map(m => `${m.n} ${m.from}→${m.to}`).join(", ")}` : ""}</> : r.check.issues.map(courseIssueText).join(" · ")}</span></div>
          {okOf(r) && r.sj && grid(sem, r.sj, new Set([to, ...(r.moved || []).map(m => m.n)]))}
          <div className="rf"><button type="button" data-kdn-bare className={okOf(r) ? "go" : "go warn"} disabled={busy} onClick={async () => { if (!okOf(r) && !window.confirm(`${x.cls}반에서 시간표가 맞지 않아요.\n${r.check.issues.map(courseIssueText).join("\n")}\n그래도 바꿀까요?`)) return; setBusy(true); await onApply(sem, from, to, r.g, !!r.ox, okOf(r) ? r.sj : null); setBusy(false); setPick(p => ({ ...p, [sem]: {} })); }}>{okOf(r) ? "이대로 바꾸기" : "그래도 바꾸기"}</button></div>
        </div>}
      </div>; })}
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
.kps-modal .box{width:min(860px,100%);max-height:88vh;overflow:auto;border-radius:16px;background:var(--kdn-surface,#fff);color:var(--kdn-ink,#111827);box-shadow:0 20px 50px rgba(0,0,0,.25);padding:16px 18px;display:grid;gap:12px}
.kps-modal header{display:flex;align-items:center;gap:10px}.kps-modal header b{font-size:17px}.kps-modal header em{padding:1px 8px;border-radius:99px;background:#ede9fe;color:#5b21b6;font-style:normal;font-size:12px;font-weight:800}
.kps-modal header .x{margin-left:auto;display:grid;place-items:center;width:32px;height:32px;border-radius:9px;border:0;background:transparent;color:var(--kdn-muted,#6b7280);cursor:pointer}
.kps-modal .lead{margin:0;font-size:13px;line-height:1.55;color:var(--kdn-ink-soft,#4b5563)}
.kps-modal .sem{border:1px solid var(--kdn-line,#e5e7eb);border-radius:12px;overflow:hidden}
.kps-modal .sem h5{margin:0;padding:8px 12px;background:var(--kdn-surface-2,#f3f4f6);font-size:13px}
.kps-modal .sem h5 small{margin-left:6px;color:var(--kdn-muted,#6b7280);font-weight:700}
.kps-modal .ggrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(86px,1fr));border-top:1px solid var(--kdn-line,#e5e7eb)}
.kps-modal .gc{display:flex;flex-direction:column;gap:4px;padding:8px 6px;border-left:1px solid var(--kdn-line,#e5e7eb);text-align:center;min-width:0}.kps-modal .gc:first-child{border-left:0}
.kps-modal .gc i{font-style:normal;font-size:11.5px;font-weight:800;color:var(--kdn-muted,#6b7280)}
.kps-modal .gc b{display:block;padding:4px 5px;border-radius:7px;font-size:12px;line-height:1.25;word-break:keep-all;--c:#64748b;background:color-mix(in srgb,var(--c) 15%,var(--kdn-surface,#fff));box-shadow:inset 3px 0 0 var(--c)}
.kps-modal .gc b small{display:block;font-size:10px;color:#b45309}
.kps-modal .gc b.chg{outline:1.5px dashed var(--kdn-ink,#111827);outline-offset:-1px}
.kps-modal .gc em{font-style:normal;font-size:11.5px;color:var(--kdn-muted,#9ca3af);padding:4px 0}
.kps-modal .gc.bl{background:repeating-linear-gradient(135deg,transparent 0 6px,color-mix(in srgb,var(--kdn-ink,#111827) 4%,transparent) 6px 12px)}
.kps-modal .gc b[data-k="kor"]{--c:#ca8a04}.kps-modal .gc b[data-k="math"]{--c:#2563eb}.kps-modal .gc b[data-k="eng"]{--c:#7c3aed}.kps-modal .gc b[data-k="soc"]{--c:#ea580c}.kps-modal .gc b[data-k="sci"]{--c:#16a34a}.kps-modal .gc b[data-k="lang2"]{--c:#db2777}.kps-modal .gc b[data-k="tech"]{--c:#0891b2}.kps-modal .gc b[data-k="artpe"]{--c:#92400e}.kps-modal .gc b[data-k="lib"]{--c:#475569}
.kps-modal .chgrow{display:flex;align-items:flex-end;gap:8px;padding:10px 12px;border-top:1px solid var(--kdn-line,#e5e7eb);background:var(--kdn-surface-2,#f8fafc)}
.kps-modal .chgrow label{flex:1;display:grid;gap:3px;font-size:11.5px;font-weight:800;color:var(--kdn-muted,#6b7280)}.kps-modal .chgrow .ar{padding-bottom:8px;color:var(--kdn-muted,#6b7280);font-weight:800}
.kps-modal .sem select{width:100%;height:34px;border-radius:9px;border:1px solid var(--kdn-line,#d1d5db);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#111827);font:inherit;font-size:13.5px;padding:0 8px}
.kps-modal .hint{margin:0;padding:6px 12px 10px;font-size:12px;color:var(--kdn-muted,#6b7280);background:var(--kdn-surface-2,#f8fafc)}
.kps-modal .res{margin:0 12px 12px;border-radius:10px;overflow:hidden;border:1px solid transparent;font-size:12.5px;line-height:1.5}
.kps-modal .res .rh{display:flex;flex-wrap:wrap;gap:4px 10px;padding:8px 10px}.kps-modal .res .rh b{font-size:13px}
.kps-modal .res.ok{border-color:color-mix(in srgb,#16a34a 35%,transparent)}.kps-modal .res.ok .rh{background:color-mix(in srgb,#16a34a 10%,transparent);color:#166534}
.kps-modal .res.bad{border-color:color-mix(in srgb,#dc2626 35%,transparent)}.kps-modal .res.bad .rh{background:color-mix(in srgb,#dc2626 10%,transparent);color:#991b1b}
.kps-modal .res .rf{display:flex;justify-content:flex-end;padding:8px 10px;border-top:1px solid var(--kdn-line,#e5e7eb)}
.kps-modal .res .go{height:32px;padding:0 16px;border-radius:8px;border:0;background:#16a34a;color:#fff;font:inherit;font-size:13px;font-weight:800;cursor:pointer}.kps-modal .res .go.warn{background:#dc2626}
.kps-modal .sem h5{display:flex;align-items:center;gap:6px}.kps-modal .rsb{margin-left:auto;height:28px;padding:0 12px;border-radius:8px;border:1px solid var(--kdn-line,#d1d5db);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#111827);font:inherit;font-size:12.5px;font-weight:800;cursor:pointer}.kps-modal .rsb.on{color:#b91c1c}
.kps-modal .repick{display:grid;gap:8px;padding:10px 12px 0;border-top:1px solid var(--kdn-line,#e5e7eb);background:var(--kdn-surface-2,#f8fafc)}
.kps-modal .rp-h{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:0;font-size:12.5px;color:var(--kdn-ink-soft,#4b5563)}.kps-modal .rp-h b{font-size:13px;color:var(--kdn-ink,#111827)}.kps-modal .rp-h strong{color:var(--kdn-ink,#111827)}
.kps-modal .rp-h button{height:26px;padding:0 10px;border-radius:7px;border:1px solid var(--kdn-line,#d1d5db);background:var(--kdn-surface,#fff);color:var(--kdn-ink-soft,#374151);font:inherit;font-size:12px;font-weight:700;cursor:pointer}.kps-modal .rp-h button:first-of-type{margin-left:auto}
.kps-modal .rp-g{display:grid;grid-template-columns:96px 1fr;gap:6px;align-items:start}.kps-modal .rp-g small{padding-top:5px;font-size:11.5px;font-weight:800;color:var(--kdn-muted,#6b7280)}
.kps-modal .rp-g>div{display:flex;flex-wrap:wrap;gap:5px}
.kps-modal .rp-g button{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--kdn-line,#d1d5db);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#111827);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;--c:#64748b;box-shadow:inset 3px 0 0 color-mix(in srgb,var(--c) 60%,transparent)}
.kps-modal .rp-g button.on{background:color-mix(in srgb,var(--c) 18%,var(--kdn-surface,#fff));border-color:var(--c);font-weight:800}
.kps-modal .rp-g button[data-k="kor"]{--c:#ca8a04}.kps-modal .rp-g button[data-k="math"]{--c:#2563eb}.kps-modal .rp-g button[data-k="eng"]{--c:#7c3aed}.kps-modal .rp-g button[data-k="soc"]{--c:#ea580c}.kps-modal .rp-g button[data-k="sci"]{--c:#16a34a}.kps-modal .rp-g button[data-k="lang2"]{--c:#db2777}.kps-modal .rp-g button[data-k="tech"]{--c:#0891b2}.kps-modal .rp-g button[data-k="artpe"]{--c:#92400e}.kps-modal .rp-g button[data-k="lib"]{--c:#475569}
.kps-modal .repick .res{margin:0 0 12px}
.kps-modal .rsb+.rsb{margin-left:6px}.kps-modal .rsb.sec{border-color:#93c5fd;color:#1d4ed8}
.kps-modal .manual{display:grid;gap:8px;padding:10px 12px 0;border-top:1px solid var(--kdn-line,#e5e7eb);background:var(--kdn-surface-2,#f8fafc)}
.kps-modal .mgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));border:1px solid var(--kdn-line,#d1d5db);border-radius:10px;overflow:hidden;background:var(--kdn-surface,#fff)}
.kps-modal .mc{display:flex;flex-direction:column;gap:5px;padding:8px 6px;border-left:1px solid var(--kdn-line,#d1d5db);min-width:0}.kps-modal .mc:first-child{border-left:0}
.kps-modal .mc>i{font-style:normal;text-align:center;font-size:12px;font-weight:800;color:var(--kdn-ink-soft,#4b5563)}.kps-modal .mc>i small{display:block;font-size:10px;color:#b45309}
.kps-modal .mc select{height:30px;font-size:12px;padding:0 4px}
.kps-modal .mc>b{display:block;padding:4px 5px;border-radius:7px;font-size:12px;line-height:1.25;text-align:center;word-break:keep-all;--c:#64748b;background:color-mix(in srgb,var(--c) 15%,var(--kdn-surface,#fff));box-shadow:inset 3px 0 0 var(--c)}.kps-modal .mc>b small{display:block;font-size:10px;color:#b45309}
.kps-modal .mc>em{font-style:normal;font-size:11px;line-height:1.35;color:#b91c1c}
.kps-modal .mc.bad{background:color-mix(in srgb,#dc2626 6%,transparent)}
.kps-modal .mc.bl{background:repeating-linear-gradient(135deg,transparent 0 6px,color-mix(in srgb,var(--kdn-ink,#111827) 4%,transparent) 6px 12px)}
.kps-modal .obck{display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer}.kps-modal .obck span{flex:1;padding:3px 5px;border-radius:6px;--c:#64748b;background:color-mix(in srgb,var(--c) 15%,var(--kdn-surface,#fff));box-shadow:inset 3px 0 0 var(--c);word-break:keep-all}
.kps-modal .mc [data-k="kor"]{--c:#ca8a04}.kps-modal .mc [data-k="math"]{--c:#2563eb}.kps-modal .mc [data-k="eng"]{--c:#7c3aed}.kps-modal .mc [data-k="soc"]{--c:#ea580c}.kps-modal .mc [data-k="sci"]{--c:#16a34a}.kps-modal .mc [data-k="lang2"]{--c:#db2777}.kps-modal .mc [data-k="tech"]{--c:#0891b2}.kps-modal .mc [data-k="artpe"]{--c:#92400e}.kps-modal .mc [data-k="lib"]{--c:#475569}
.kps-modal .manual .res{margin:0 0 12px}
.kps-modal footer{display:flex;gap:8px;justify-content:flex-end}
.kps-modal footer button{height:36px;padding:0 14px;border-radius:10px;border:1px solid var(--kdn-line,#d1d5db);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#111827);font:inherit;font-size:13.5px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
.kps-modal footer .rs{margin-right:auto;color:#5b21b6}.kps-modal footer .ok{background:var(--kdn-ink,#111827);color:var(--kdn-surface,#fff);border-color:transparent}
`;
