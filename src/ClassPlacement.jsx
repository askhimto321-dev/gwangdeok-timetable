// 선생님 ZONE '반편성': 반편성 프로그램 결과(엑셀)를 올려 새 반 명단을 보고,
// ① 배정가능학급(원반 과목 기준) 안에서 학생을 옮기거나 맞바꾸고 ② 분리희망이 반영됐는지 확인하고
// ③ 선생님들이 학생·반에 검토 표시를 남기고 ④ 이동 결과를 한눈에 보고 엑셀로 받아요.
// 보기·검토 표시: 반편성 탭을 볼 수 있는 교직원 / 파일 올리기·이동: 관리자·부서·학년부장
import React from "react";
import { AlertTriangle, Tag, ArrowLeftRight, ArrowRight, CheckCircle2, CircleHelp, Download, FileSpreadsheet, Loader2, MessageSquare, RotateCcw, Search, Trash2, Upload, X } from "lucide-react";
import { readStorage, updateStorage, writeStorage } from "./storage.js";
import { schoolYearOf } from "./curriculum.js";
import { LEVEL_INFO, SEPARATION_LEVELS, separationKey, separationPairs } from "./classSeparation.js";
import { placementKey, placementReviewKey, parsePlacementFile, normalizePlacement, bySidOf, movableClasses, swapCandidates, applyMove, undoMove, classSummary, checkPairs, studentResults, STUDENT_FLAGS, CLASS_CHECKS } from "./classPlacement.js";

const STATUS = { same: { label: "같은 반", tone: "bad", Icon: AlertTriangle }, ok: { label: "다른 반", tone: "good", Icon: CheckCircle2 }, unknown: { label: "확인 필요", tone: "mute", Icon: CircleHelp } };
const fmt = iso => { const d = new Date(iso || ""); return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const oldLabel = sid => `${Number(String(sid).slice(1, 3))}-${Number(String(sid).slice(3, 5))}`;
const ORDER = ["same", "unknown", "ok"];

export default function ClassPlacement({ roster = {}, actor = null, canManage = false, showToast = () => {} }) {
  const year = schoolYearOf();
  const nextGrade = 3;
  const [placement, setPlacement] = React.useState(undefined);
  const [review, setReview] = React.useState({ students: {}, classes: {} });
  const [sepData, setSepData] = React.useState({});
  const [view, setView] = React.useState("roster");
  const [tab, setTab] = React.useState(0);
  const [filter, setFilter] = React.useState("");
  const [by, setBy] = React.useState("student");
  const [busy, setBusy] = React.useState(false);
  const [preview, setPreview] = React.useState(null);
  const [openSid, setOpenSid] = React.useState("");
  const [moveSid, setMoveSid] = React.useState("");
  const [moveTo, setMoveTo] = React.useState(0);
  const [find, setFind] = React.useState("");
  const [rowFilter, setRowFilter] = React.useState("");
  const input = React.useRef(null);
  const me = { id: String(actor?.id || actor?.name || "me"), name: String(actor?.name || "선생님") };
  const oldClasses = React.useMemo(() => Array.from(new Set(Object.values(roster || {}).map(s => Number(s?.class)).filter(Boolean))).sort((a, b) => a - b), [roster]);

  React.useEffect(() => {
    let on = true;
    Promise.all([
      readStorage(placementKey(year), null).catch(() => null),
      readStorage(placementReviewKey(year), null).catch(() => null),
      Promise.all(oldClasses.map(async c => [c, await readStorage(separationKey(year, "2", c), { entries: {} }).catch(() => ({ entries: {} }))])),
    ]).then(([p, r, seps]) => {
      if (!on) return;
      setPlacement(normalizePlacement(p, roster));
      setReview({ students: r?.students || {}, classes: r?.classes || {} });
      setSepData(Object.fromEntries(seps));
    });
    return () => { on = false; };
  }, [year, oldClasses.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const readFile = async file => {
    if (!file) return;
    setBusy(true);
    try {
      const mod = await import("xlsx"); const XLSX = mod.default?.utils ? mod.default : mod;
      let wb;
      try { wb = XLSX.read(await file.arrayBuffer(), { type: "array" }); }
      catch (error) { if (/password/i.test(String(error?.message))) throw new Error("암호가 걸린 파일이에요. 엑셀에서 암호를 지우고(파일 › 정보 › 통합 문서 보호 › 암호) 다시 올려 주세요."); throw error; }
      const sheets = wb.SheetNames.map(name => ({ name, aoa: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: false }) }));
      const result = parsePlacementFile(sheets, roster, { grade: "2" });
      if (!result.stats.students) throw new Error("학생과 새 반을 찾지 못했어요. '학생배정현황' 시트(구반·구번호·반·이름) 또는 이름·반·이전 학번 열이 있는지 확인해 주세요.");
      setPreview({ ...result, fileName: file.name });
    } catch (error) { showToast(error?.message || "파일을 읽지 못했어요.", "error"); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!preview) return;
    if (placement?.moves?.length && !window.confirm(`지금까지 옮긴 ${placement.moves.length}건이 있어요. 새 파일로 바꾸면 이동 기록이 지워져요. 바꿀까요?`)) return;
    const value = { students: preview.students, classOb: preview.classOb || {}, moves: [], fileName: preview.fileName, kind: preview.kind, at: new Date().toISOString(), by: me.name, stats: { students: preview.stats.students, hasCan: !!preview.stats.hasCan, unmatched: (preview.stats.unmatched || []).slice(0, 60) } };
    const result = await writeStorage(placementKey(year), value);
    if (result?.ok === false) { showToast("저장하지 못했어요.", "error"); return; }
    setPlacement(value); setPreview(null); setTab(0);
    showToast(`반편성 결과를 반영했어요. 학생 ${preview.stats.students}명`, "success");
  };
  const clear = async () => { if (!window.confirm("올린 반편성 결과와 이동 기록을 지울까요? 선생님들이 남긴 검토 표시는 남아요.")) return; await writeStorage(placementKey(year), null); setPlacement(null); };
  // 이동: 저장된 최신 자료 위에 적용(다른 선생님이 동시에 옮겨도 덮어쓰지 않게)
  const commit = async (fn, okMsg) => {
    const result = await updateStorage(placementKey(year), null, cur => { const base = normalizePlacement(cur, roster); return base ? fn(base) : cur; });
    if (result?.ok === false) { showToast("저장하지 못했어요.", "error"); return false; }
    setPlacement(normalizePlacement(result?.value, roster)); if (okMsg) showToast(okMsg, "success"); return true;
  };
  const doMove = async (sid, to, swap = "") => {
    const name = placement.students[sid]?.name || roster[sid]?.name || sid;
    const ok = await commit(p => applyMove(p, { sid, to, swap, by: me.name }), swap ? `${name} ↔ ${placement.students[swap]?.name || ""} 맞바꿨어요.` : `${name} 학생을 ${to}반으로 옮겼어요.`);
    if (ok) { setMoveSid(""); setMoveTo(0); }
  };
  const doUndo = id => commit(p => undoMove(p, id), "되돌렸어요.");

  const saveReview = async change => {
    const result = await updateStorage(placementReviewKey(year), { students: {}, classes: {} }, cur => change({ students: { ...(cur?.students || {}) }, classes: { ...(cur?.classes || {}) } }));
    if (result?.ok === false) { showToast("저장하지 못했어요.", "error"); return; }
    setReview({ students: result?.value?.students || {}, classes: result?.value?.classes || {} });
  };
  const toggleMark = (bucket, id, key) => saveReview(v => {
    const item = { ...(v[bucket][id] || {}) }; const marks = { ...(item.marks || {}) }; const list = marks[key] || [];
    marks[key] = list.some(m => m.byId === me.id) ? list.filter(m => m.byId !== me.id) : [...list, { byId: me.id, by: me.name, at: new Date().toISOString() }];
    if (!marks[key].length) delete marks[key];
    v[bucket][id] = { ...item, marks }; return v;
  });
  const addMemo = (bucket, id, text) => saveReview(v => { const item = { ...(v[bucket][id] || {}) }; item.memos = [...(item.memos || []), { byId: me.id, by: me.name, at: new Date().toISOString(), text: text.trim() }]; v[bucket][id] = item; return v; });
  const removeMemo = (bucket, id, at) => saveReview(v => { const item = { ...(v[bucket][id] || {}) }; item.memos = (item.memos || []).filter(m => !(m.at === at && m.byId === me.id)); v[bucket][id] = item; return v; });

  const downloadXlsx = async () => {
    const mod = await import("xlsx"); const XLSX = mod.default?.utils ? mod.default : mod;
    const list = Object.entries(placement.students).sort((a, b) => a[1].cls - b[1].cls || (a[1].no || 99) - (b[1].no || 99) || a[0].localeCompare(b[0]));
    const rows = [["새 반", "원래 배정 반", "이동", "구반", "구번호", "이름", "성별", "원반 과목"]];
    list.forEach(([sid, s]) => rows.push([s.cls, s.orig, s.cls !== s.orig ? `${s.orig}반 → ${s.cls}반` : "", Number(sid.slice(1, 3)), Number(sid.slice(3, 5)), s.name || roster[sid]?.name || "", s.gender || roster[sid]?.gender || "", (placement.classOb?.[s.cls] || []).join(", ")]));
    const moves = [["시각", "학생", "구반-번호", "옮긴 반", "맞바꾼 학생", "옮긴 사람"], ...placement.moves.map(m => [new Date(m.at).toLocaleString("ko-KR"), placement.students[m.sid]?.name || m.sid, oldLabel(m.sid), `${m.from}반 → ${m.to}반`, m.swap ? `${placement.students[m.swap]?.name || m.swap} (${m.to}반 → ${m.from}반)` : "", m.by])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "반편성 결과");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(moves), "이동 내역");
    const blob = new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `${year + 1}학년도 ${nextGrade}학년 반편성(이동 반영).xlsx`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  if (placement === undefined) return <div className="kpl"><style>{CSS}</style><p className="kpl-nil"><Loader2 size={15} className="spin" /> 불러오는 중이에요.</p></div>;

  const head = <section className="kpl-head">
    <div className="t"><b>{year + 1}학년도 {nextGrade}학년 반편성</b><small>{placement ? `${placement.fileName || "반편성 결과"} · ${fmt(placement.at)} ${placement.by} 반영 · 학생 ${Object.keys(placement.students).length}명${placement.moves?.length ? ` · 이동 ${placement.moves.length}건` : ""}` : canManage ? "반편성 프로그램 결과 엑셀(학생배정현황 시트)을 올리면 새 반 명단·이동·분리희망 확인을 할 수 있어요." : "관리자·학년부장이 반편성 결과를 올리면 여기서 볼 수 있어요."}</small></div>
    <div className="acts">
      {placement && <button type="button" className="kpl-btn" onClick={downloadXlsx}><Download size={15} /> 결과 엑셀</button>}
      {canManage && <button type="button" className="kpl-btn pri" disabled={busy} onClick={() => input.current?.click()}>{busy ? <Loader2 size={15} className="spin" /> : <Upload size={15} />} {placement ? "다시 올리기" : "반편성 결과 올리기"}</button>}
      {canManage && placement && <button type="button" className="kpl-btn" onClick={clear} title="결과 지우기"><Trash2 size={14} /></button>}
      <input ref={input} type="file" accept=".xlsx,.xls,.xlsm,.csv" hidden onChange={e => { const f = e.target.files?.[0]; if (!f) return; e.target.value = ""; readFile(f); }} />
    </div>
  </section>;
  const previewBox = preview && <section className="kpl-preview">
    <b><FileSpreadsheet size={16} /> {preview.fileName} 읽기 결과</b>
    <ul>
      <li>{preview.kind === "program" ? `'${preview.sheet}' 시트` : "명단"}에서 학생 <em>{preview.stats.students}</em>명, 새 반 <em>{(preview.stats.classes || []).length}</em>개</li>
      <li>{preview.stats.hasCan ? "배정가능학급(원반 과목 기준)이 있어 학생마다 갈 수 있는 반으로만 옮길 수 있어요." : "배정가능학급 정보가 없어 어느 반으로든 옮길 수 있어요."}</li>
      {(preview.stats.unmatched || []).length > 0 && <li className="warn">지금 2학년 명단에 없는 학번 {preview.stats.unmatched.length}개(전입·전출 등): {preview.stats.unmatched.slice(0, 10).map(x => (typeof x === "string" ? oldLabel(x) : x.name)).join(", ")}</li>}
    </ul>
    <div className="ft"><button type="button" className="kpl-btn" onClick={() => setPreview(null)}>취소</button><button type="button" className="kpl-btn pri" onClick={save}>이대로 반영</button></div>
  </section>;
  if (!placement) return <div className="kpl"><style>{CSS}</style>{head}{previewBox}</div>;

  const bySid = bySidOf(placement);
  const pairs = separationPairs(sepData);
  const checked = checkPairs(pairs, bySid);
  const results = studentResults(checked);
  const missSet = new Set(results.filter(s => s.status === "same").map(s => s.sid));
  // 조합 우려 상대: 내가 적은 상대 + 상대가 나를 적은 것(서로 보이게). 같은 새 반이면 경고
  const comboPairs = (() => { const m = new Map(); Object.entries(review.students || {}).forEach(([sid, it]) => (it.combos || []).forEach(c => { const [a, b] = [sid, c.with].sort(); const k = `${a}|${b}`; if (!m.has(k)) m.set(k, { a, b, by: [] }); m.get(k).by.push(c.by); })); return Array.from(m.values()); })();
  const combosOf = sid => comboPairs.filter(p => p.a === sid || p.b === sid).map(p => ({ other: p.a === sid ? p.b : p.a, by: p.by }));
  const comboSame = sid => combosOf(sid).filter(c => Number(placement.students[c.other]?.cls) === Number(placement.students[sid]?.cls));
  const addCombo = (sid, other) => saveReview(v => { const item = { ...(v.students[sid] || {}) }; const list = item.combos || []; if (list.some(c => c.with === other && c.byId === me.id)) return v; item.combos = [...list, { with: other, byId: me.id, by: me.name, at: new Date().toISOString() }]; const marks = { ...(item.marks || {}) }; if (!(marks.combo || []).some(m => m.byId === me.id)) marks.combo = [...(marks.combo || []), { byId: me.id, by: me.name, at: new Date().toISOString() }]; item.marks = marks; v.students[sid] = item; return v; });
  const removeCombo = (sid, other) => saveReview(v => { [sid, other].forEach(a => { const b = a === sid ? other : sid; const item = { ...(v.students[a] || {}) }; item.combos = (item.combos || []).filter(c => !(c.with === b && c.byId === me.id)); v.students[a] = item; }); return v; });
  const resultOf = sid => results.find(x => x.sid === sid);
  const count = s => checked.filter(p => p.status === s).length;
  const mustMiss = checked.filter(p => p.status === "same" && p.level === SEPARATION_LEVELS[0]).length;
  const nameOf = sid => placement.students[sid]?.name || roster?.[sid]?.name || sid;
  const genderOf = sid => placement.students[sid]?.gender || roster?.[sid]?.gender || "";
  const summary = classSummary(placement);
  const classes = summary.map(s => s.cls);
  const curTab = classes.includes(tab) ? tab : classes[0];

  return <div className="kpl"><style>{CSS}</style>
    {head}{previewBox}
    <div className="kpl-views" role="tablist">
      {[["roster", "반별 명단", `${classes.length}개 반`], ["check", "분리희망 확인", count("same") ? `미반영 ${count("same")}` : "모두 반영"], ["moves", "이동 결과", `${placement.moves.length}건`]].map(([k, l, sub]) => <button key={k} type="button" data-kdn-bare role="tab" aria-selected={view === k} className={`${view === k ? "on" : ""}${k === "check" && count("same") ? " alert" : ""}`} onClick={() => setView(k)}><b>{l}</b><span>{sub}</span></button>)}
    </div>

    {view === "roster" && (() => {
      const q = find.trim();
      const base = Object.entries(placement.students).filter(([sid, s]) => (q ? String(s.name || "").includes(q) || oldLabel(sid).includes(q) : Number(s.cls) === curTab));
      const FILTERS = [...STUDENT_FLAGS.map(f => ({ key: f.key, label: f.label, tone: f.tone, test: ([sid]) => (review.students[sid]?.marks?.[f.key] || []).length > 0 })),
        { key: "miss", label: "분리 미반영", tone: "bad", test: ([sid]) => missSet.has(sid) }, { key: "comboSame", label: "조합 같은 반", tone: "warn", test: ([sid]) => comboSame(sid).length > 0 }, { key: "moved", label: "옮겨 온 학생", tone: "info", test: ([, x]) => Number(x.cls) !== Number(x.orig) },
        { key: "memo", label: "메모 있음", tone: "info", test: ([sid]) => (review.students[sid]?.memos || []).length > 0 }, { key: "m", label: "남", tone: "mute", test: ([sid]) => /남/.test(genderOf(sid)) }, { key: "f", label: "여", tone: "mute", test: ([sid]) => /여/.test(genderOf(sid)) }];
      const activeF = FILTERS.find(f => f.key === rowFilter);
      const list = base.filter(e => !activeF || activeF.test(e)).sort((a, b) => (q ? a[1].cls - b[1].cls : 0) || (a[1].no || 99) - (b[1].no || 99) || a[0].localeCompare(b[0]));
      const sm = summary.find(s => s.cls === curTab) || {};
      const cls = review.classes[curTab] || {};
      const flagCount = key => base.filter(([sid]) => (review.students[sid]?.marks?.[key] || []).length).length;
      const missN = base.filter(([sid]) => missSet.has(sid)).length;
      const ob = placement.classOb?.[curTab] || [];
      return <>
        <div className="kpl-ctabs" role="tablist" aria-label="새 반">{summary.map(s => { const ids = Object.entries(placement.students).filter(([, x]) => Number(x.cls) === s.cls).map(([id]) => id); const miss = ids.filter(id => missSet.has(id)).length; const checks = Object.keys(review.classes[s.cls]?.marks || {}).length; const mPct = s.n ? Math.round((s.m / s.n) * 100) : 0; return <button key={s.cls} type="button" role="tab" aria-selected={s.cls === curTab && !q} data-kdn-bare className={s.cls === curTab && !q ? "on" : ""} onClick={() => { setTab(s.cls); setFind(""); setOpenSid(""); setMoveSid(""); }}>
          <span className="top"><b>{s.cls}반</b>{miss ? <em className="bad" title={`분리 미반영 ${miss}명`}>분리 {miss}</em> : checks ? <em className="warn" title={`반 점검 ${checks}개`}>점검 {checks}</em> : s.inn || s.out ? <em className="mv" title={`들어옴 ${s.inn} · 나감 ${s.out}`}>이동 {s.inn + s.out}</em> : null}</span>
          <span className="gbar" title={`남 ${s.m} · 여 ${s.f}`}><i style={{ width: `${mPct}%` }} /></span>
          <span className="sub">{s.n}명 <small>남{s.m}·여{s.f}</small></span></button>; })}</div>
        <div className="kpl-split">
          {!q && <aside className="kpl-cside">
            <div className="hd"><b>{nextGrade}학년 {curTab}반</b><span>{sm.n}명</span></div>
            <div className="stats">
              <div><small>남 · 여</small><b>{sm.m} · {sm.f}</b></div>
              <div className={flagCount("leader") ? "" : "warn"}><small>리더 후보</small><b>{flagCount("leader")}명</b></div>
              <div className={missN ? "bad" : ""}><small>분리 미반영</small><b>{missN}명</b></div>
              <div className={base.some(([sid]) => comboSame(sid).length) ? "warn" : ""}><small>조합 같은 반</small><b>{comboPairs.filter(p => Number(placement.students[p.a]?.cls) === curTab && Number(placement.students[p.b]?.cls) === curTab).length}쌍</b></div>
              <div><small>들어옴 · 나감</small><b>{sm.inn || 0} · {sm.out || 0}</b></div>
            </div>
            {placement.kind === "program" && <div className="sec"><small>원반 과목</small><p className="ob">{ob.length ? ob.map(x => <span key={x}>{x}</span>) : <span className="nil">없음 · 원반 과목 제한 없음</span>}</p></div>}
            <div className="sec"><small>반 점검 <em>해당되면 눌러요</em></small><div className="checks">{CLASS_CHECKS.map(c => { const marks = cls.marks?.[c.key] || []; const mine = marks.some(m => m.byId === me.id); return <button key={c.key} type="button" data-kdn-bare className={`${marks.length ? "on" : ""}${mine ? " mine" : ""}`} title={`${c.hint}${marks.length ? `\n표시: ${marks.map(m => m.by).join(", ")}` : ""}`} onClick={() => toggleMark("classes", curTab, c.key)}>{mine ? <CheckCircle2 size={13} /> : null}{c.label}{marks.length ? <small>{marks.length}</small> : null}</button>; })}</div></div>
            <div className="sec"><small>반 의견</small><Memos item={cls} me={me} onAdd={t => addMemo("classes", curTab, t)} onRemove={at => removeMemo("classes", curTab, at)} placeholder="예: 리더 후보가 없어 교환 검토" /></div>
          </aside>}
          <section className="kpl-slist">
            <div className="tools"><label className="kpl-find"><Search size={14} /><input value={find} onChange={e => setFind(e.target.value)} placeholder="이름·구반-번호로 전체에서 찾기(예: 4-15)" /></label>
</div>
            <div className="kpl-filter" role="group" aria-label="학생 거르기"><small>거르기</small>
              <button type="button" data-kdn-bare className={`all${!rowFilter ? " on" : ""}`} onClick={() => setRowFilter("")}>전체 <b>{base.length}</b></button>
              {FILTERS.map(f => { const n = base.filter(f.test).length; return <button key={f.key} type="button" data-kdn-bare disabled={!n && rowFilter !== f.key} className={`t-${f.tone}${rowFilter === f.key ? " on" : ""}`} onClick={() => setRowFilter(v => (v === f.key ? "" : f.key))}>{f.label} <b>{n}</b></button>; })}
            </div>
            <ul className="rows">{list.map(([sid, s]) => { const item = review.students[sid] || {}; const memoN = (item.memos || []).length; const r = resultOf(sid); const moved = Number(s.cls) !== Number(s.orig); const targets = movableClasses(placement, sid); const marked = STUDENT_FLAGS.filter(f => (item.marks?.[f.key] || []).length); const g = genderOf(sid); const open = openSid === sid; return <li key={sid} className={`${missSet.has(sid) ? "miss" : ""}${moved ? " moved" : ""}${moveSid === sid || open ? " active" : ""}`}>
              <div className="row">
                {q && <span className="ncls">{s.cls}반</span>}
                <span className="no">{oldLabel(sid)}</span>
                <span className="nm"><b>{s.name || roster[sid]?.name || sid}</b>{g && <i className={`g ${/남/.test(g) ? "m" : "f"}`}>{g}</i>}{moved && <span className="mvtag">{s.orig}반에서 옴</span>}</span>
                <span className="tags">{r && <span className={`st ${STATUS[r.status].tone}`} title={r.items.map(i => `${nameOf(i.other)}(${i.level}) ${STATUS[i.status].label}`).join("\n")}>{r.status === "same" ? "분리 미반영" : r.status === "ok" ? "분리 반영" : "분리 확인"}</span>}
                  {marked.filter(f => f.key !== "combo").map(f => <span key={f.key} className={`fl t-${f.tone} on`} title={`표시: ${(item.marks[f.key] || []).map(m => m.by).join(", ")}`}>{f.label}{item.marks[f.key].length > 1 ? <small>{item.marks[f.key].length}</small> : null}</span>)}
                  {(marked.some(f => f.key === "combo") || combosOf(sid).length > 0) && (() => { const cs = combosOf(sid); const same = comboSame(sid); return <span className={`fl t-warn on${same.length ? " hot" : ""}`} title={cs.length ? cs.map(c => `${nameOf(c.other)}(${placement.students[c.other]?.cls || "?"}반)${Number(placement.students[c.other]?.cls) === Number(s.cls) ? " · 같은 반" : ""}`).join("\n") : "상대 학생 미지정"}>조합 우려{cs.length ? `: ${cs.slice(0, 2).map(c => nameOf(c.other)).join(", ")}${cs.length > 2 ? ` 외 ${cs.length - 2}` : ""}` : ""}{same.length ? <em>같은 반 {same.length}</em> : null}</span>; })()}
                  {memoN ? <span className="memo-n" title="메모"><MessageSquare size={12} />{memoN}</span> : null}</span>
                <span className="acts"><button type="button" data-kdn-bare className={`act${open ? " on" : ""}`} onClick={() => { setOpenSid(v => (v === sid ? "" : sid)); setMoveSid(""); }}><Tag size={13} /> 표시</button>
                  {canManage && <button type="button" data-kdn-bare className={`act mv${moveSid === sid ? " on" : ""}`} disabled={!targets.length} title={targets.length ? `갈 수 있는 반: ${targets.join(", ")}반` : "원반 과목 때문에 갈 수 있는 다른 반이 없어요"} onClick={() => { setMoveSid(v => (v === sid ? "" : sid)); setMoveTo(0); setOpenSid(""); }}><ArrowLeftRight size={13} /> 이동</button>}</span>
              </div>
              {open && <div className="panel">
                <div className="flags">{STUDENT_FLAGS.map(f => { const marks = item.marks?.[f.key] || []; const mine = marks.some(m => m.byId === me.id); return <button key={f.key} type="button" data-kdn-bare className={`fl big t-${f.tone}${marks.length ? " on" : ""}${mine ? " mine" : ""}`} onClick={() => toggleMark("students", sid, f.key)}><span><b>{mine ? "✓ " : ""}{f.label}</b><small>{marks.length ? marks.map(m => m.by).join(", ") : f.hint}</small></span></button>; })}</div>
                <ComboPicker sid={sid} placement={placement} combos={combosOf(sid)} mine={(item.combos || []).filter(c => c.byId === me.id).map(c => c.with)} theirsMine={comboPairs.filter(p => (p.a === sid || p.b === sid)).map(p => (p.a === sid ? p.b : p.a)).filter(o => (review.students[o]?.combos || []).some(c => c.with === sid && c.byId === me.id))} nameOf={nameOf} onAdd={o => addCombo(sid, o)} onRemove={o => removeCombo(sid, o)} />
                <Memos item={item} me={me} onAdd={t => addMemo("students", sid, t)} onRemove={at => removeMemo("students", sid, at)} placeholder={`${s.name || ""} 학생에 대한 의견`} />
              </div>}
              {moveSid === sid && <div className="panel"><MovePanel placement={placement} sid={sid} to={moveTo} setTo={setMoveTo} summary={summary} nameOf={nameOf} genderOf={genderOf} missSet={missSet} pairs={[...checked, ...comboPairs]} onMove={doMove} onClose={() => setMoveSid("")} /></div>}
            </li>; })}</ul>
            {!list.length && <p className="kpl-nil">{activeF ? `'${activeF.label}' 학생이 없어요.` : "찾는 학생이 없어요."}</p>}
          </section>
        </div>
      </>;
    })()}
    {view === "check" && <>
      <div className="kpl-sum">
        <div><small>분리희망 쌍</small><b>{checked.length}</b></div>
        <div className="good"><small>반영 (다른 반)</small><b>{count("ok")}</b></div>
        <div className="bad"><small>미반영 (같은 반)</small><b>{count("same")}</b></div>
        <div className="mute"><small>확인 필요</small><b>{count("unknown")}</b></div>
      </div>
      {mustMiss > 0 && <p className="kpl-alert"><AlertTriangle size={16} /> '반드시 분리' 쌍 {mustMiss}개가 같은 반이에요. 반별 명단에서 '이동'으로 옮겨 주세요.</p>}
      <div className="kpl-bar">
        <div className="chips">{[["", "전체", checked.length], ["same", "미반영", count("same")], ["unknown", "확인 필요", count("unknown")], ["ok", "반영", count("ok")]].map(([k, l, n]) => <button key={k} type="button" data-kdn-bare className={`${k || "all"}${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{l} <small>{n}</small></button>)}</div>
        <div className="seg"><button type="button" data-kdn-bare className={by === "student" ? "on" : ""} onClick={() => setBy("student")}>학생별</button><button type="button" data-kdn-bare className={by === "pair" ? "on" : ""} onClick={() => setBy("pair")}>쌍별</button></div>
      </div>
      {by === "student" ? <div className="kpl-students">{results.filter(s => !filter || s.status === filter).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.sid.localeCompare(b.sid)).map(s => { const st = STATUS[s.status]; return <article key={s.sid} className={`t-${st.tone}`}>
          <header><b>{nameOf(s.sid)}</b><small>{oldLabel(s.sid)}</small><span className="to">{s.cls ? `→ ${s.cls}반` : "→ 결과 없음"}</span><span className={`st ${st.tone}`}><st.Icon size={13} /> {s.status === "same" ? "미반영 있음" : s.status === "ok" ? "모두 반영" : "확인 필요"}</span>
            {canManage && s.cls && s.status === "same" && <button type="button" data-kdn-bare className="go" onClick={() => { setView("roster"); setTab(s.cls); setFind(""); setMoveSid(s.sid); setMoveTo(0); }}>옮기러 가기 <ArrowRight size={12} /></button>}</header>
          <ul>{[...s.items].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)).map(i => <li key={i.other} className={i.status}><span className={`lv t-${LEVEL_INFO[i.level]?.tone || "low"}`}>{i.level}</span><b>{nameOf(i.other)}</b><small>{oldLabel(i.other)}{i.otherCls ? ` → ${i.otherCls}반` : ""}</small><em>{STATUS[i.status].label}</em></li>)}</ul>
        </article>; })}</div>
        : <table className="kpl-pairs"><thead><tr><th>분리 등급</th><th>학생</th><th>학생</th><th>결과</th></tr></thead><tbody>{checked.filter(p => !filter || p.status === filter).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)).map(p => <tr key={`${p.a}|${p.b}`} className={p.status}>
          <td><span className={`lv t-${LEVEL_INFO[p.level]?.tone || "low"}`}>{p.level}</span></td>
          <td><b>{nameOf(p.a)}</b> <small>{oldLabel(p.a)} → {p.ca ? `${p.ca}반` : "?"}</small></td>
          <td><b>{nameOf(p.b)}</b> <small>{oldLabel(p.b)} → {p.cb ? `${p.cb}반` : "?"}</small></td>
          <td><span className={`st ${STATUS[p.status].tone}`}>{STATUS[p.status].label}</span></td></tr>)}</tbody></table>}
      {!checked.length && <p className="kpl-nil">입력된 분리희망이 없어요. 분리희망학생 탭에서 입력해요.</p>}
    </>}

    {view === "moves" && <>
      <div className="kpl-sum">
        <div><small>이동</small><b>{placement.moves.length}</b></div>
        <div><small>옮긴 학생</small><b>{Object.values(placement.students).filter(s => s.cls !== s.orig).length}</b></div>
        <div className={count("same") ? "bad" : "good"}><small>분리 미반영</small><b>{count("same")}</b></div>
        <div><small>반 인원</small><b className="sm">{Math.min(...summary.map(s => s.n))}~{Math.max(...summary.map(s => s.n))}명</b></div>
      </div>
      <table className="kpl-pairs kpl-csum"><thead><tr><th>반</th><th>처음</th><th>지금</th><th>남</th><th>여</th><th>들어옴</th><th>나감</th><th>분리 미반영</th><th>원반 과목</th></tr></thead><tbody>{summary.map(s => { const miss = Object.entries(placement.students).filter(([id, x]) => x.cls === s.cls && missSet.has(id)).length; return <tr key={s.cls}>
        <td className="c"><button type="button" data-kdn-bare className="lnk" onClick={() => { setView("roster"); setTab(s.cls); setFind(""); }}>{s.cls}반</button></td><td className="c">{s.orig}</td><td className={`c${s.n !== s.orig ? " chg" : ""}`}><b>{s.n}</b>{s.n !== s.orig ? <small> ({s.n > s.orig ? "+" : ""}{s.n - s.orig})</small> : null}</td><td className="c">{s.m}</td><td className="c">{s.f}</td><td className="c">{s.inn || ""}</td><td className="c">{s.out || ""}</td><td className="c">{miss ? <span className="st bad">{miss}</span> : ""}</td><td className="ob">{(placement.classOb?.[s.cls] || []).join(", ")}</td></tr>; })}</tbody></table>
      <h4 className="kpl-h">이동 내역</h4>
      {placement.moves.length ? <table className="kpl-pairs kpl-mvt"><thead><tr><th>시각</th><th>학생</th><th>옮김</th><th>맞바꾼 학생</th><th>옮긴 사람</th><th /></tr></thead><tbody>{[...placement.moves].reverse().map(m => <tr key={m.id}>
        <td className="c">{fmt(m.at)}</td><td><b>{nameOf(m.sid)}</b> <small>{oldLabel(m.sid)}</small></td><td className="c"><b>{m.from}반 → {m.to}반</b></td><td>{m.swap ? <><b>{nameOf(m.swap)}</b> <small>{m.to}반 → {m.from}반</small></> : <small>-</small>}</td><td className="c">{m.by}</td>
        <td className="c">{canManage && <button type="button" data-kdn-bare className="undo" onClick={() => window.confirm("이 이동을 되돌릴까요?") && doUndo(m.id)}><RotateCcw size={13} /> 되돌리기</button>}</td></tr>)}</tbody></table> : <p className="kpl-nil">아직 옮긴 학생이 없어요. 반별 명단에서 '이동'으로 옮겨요.</p>}
    </>}
  </div>;
}

// 조합 우려 상대 고르기: 이름·구반-번호로 찾아 추가, 같은 새 반이면 경고
function ComboPicker({ sid, placement, combos, mine, theirsMine = [], nameOf, onAdd, onRemove }) {
  const [q, setQ] = React.useState("");
  const me = placement.students[sid];
  const taken = new Set([sid, ...combos.map(c => c.other)]);
  const hits = q.trim() ? Object.entries(placement.students).filter(([id, x]) => !taken.has(id) && (String(x.name || nameOf(id)).includes(q.trim()) || oldLabel(id).includes(q.trim()))).slice(0, 8) : [];
  return <div className="kpl-combo">
    <b>조합 우려 상대 <small>같은 반이면 서로 영향이 큰 학생</small></b>
    {combos.length > 0 && <div className="list">{combos.map(c => { const o = placement.students[c.other] || {}; const same = Number(o.cls) === Number(me?.cls); const removable = mine.includes(c.other) || theirsMine.includes(c.other); return <span key={c.other} className={same ? "same" : ""} title={`표시: ${c.by.join(", ")}`}><b>{nameOf(c.other)}</b><small>{oldLabel(c.other)} → {o.cls || "?"}반</small>{same ? <em>같은 반</em> : <i>다른 반</i>}{removable && <button type="button" data-kdn-bare onClick={() => onRemove(c.other)} aria-label="빼기"><X size={11} /></button>}</span>; })}</div>}
    <label className="find"><Search size={13} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="상대 학생 이름 또는 구반-번호로 찾기" /></label>
    {hits.length > 0 && <div className="hits">{hits.map(([id, x]) => <button key={id} type="button" data-kdn-bare onClick={() => { onAdd(id); setQ(""); }}><b>{x.name || nameOf(id)}</b><small>{oldLabel(id)} · {x.cls}반{Number(x.cls) === Number(me?.cls) ? " · 같은 반" : ""}</small></button>)}</div>}
  </div>;
}

// 이동 패널: 갈 수 있는 반(인원 변화) → 그냥 옮기기 또는 맞바꿀 학생 고르기
function MovePanel({ placement, sid, to, setTo, summary, nameOf, genderOf, missSet, pairs, onMove, onClose }) {
  const s = placement.students[sid];
  const targets = movableClasses(placement, sid);
  const size = c => summary.find(x => x.cls === c)?.n || 0;
  const clash = (a, cls) => pairs.filter(p => (p.a === a || p.b === a)).some(p => { const other = p.a === a ? p.b : p.a; return Number(placement.students[other]?.cls) === Number(cls) && other !== a; });
  const cands = to ? swapCandidates(placement, sid, to) : [];
  return <div className="kpl-move">
    <div className="hd"><b>{nameOf(sid)}</b><span>{s.cls}반 → 어디로?</span><small>원반 과목 기준 갈 수 있는 반만 보여요</small><button type="button" data-kdn-bare className="x" onClick={onClose} aria-label="닫기"><X size={14} /></button></div>
    <div className="tgts">{targets.map(c => <button key={c} type="button" data-kdn-bare className={`${to === c ? "on" : ""}${clash(sid, c) ? " clash" : ""}`} onClick={() => setTo(c)} title={clash(sid, c) ? "이 반에 분리희망 또는 조합 우려 학생이 있어요" : ""}><b>{c}반</b><small>{size(c)}명</small>{clash(sid, c) && <em>분리·조합 학생 있음</em>}</button>)}</div>
    {to ? <div className="swap">
      <div className="opt"><button type="button" className="kpl-btn" onClick={() => onMove(sid, to)}>그냥 옮기기</button><small>{s.cls}반 {size(s.cls) - 1}명 · {to}반 {size(to) + 1}명이 돼요</small></div>
      <b className="sh">맞바꾸기 <small>{to}반에서 {s.cls}반으로 올 수 있는 학생 {cands.length}명 (같은 성별 먼저)</small></b>
      {cands.length ? <ul>{cands.map(x => { const bad = clash(x.sid, s.cls); return <li key={x.sid} className={bad ? "clash" : ""}><span><b>{x.name || nameOf(x.sid)}</b> <small>{oldLabel(x.sid)} · {genderOf(x.sid)}{missSet.has(x.sid) ? " · 분리 미반영" : ""}{bad ? ` · ${s.cls}반에 분리·조합 학생 있음` : ""}</small></span><button type="button" className="kpl-btn pri sm" onClick={() => onMove(sid, to, x.sid)}><ArrowLeftRight size={13} /> 맞바꾸기</button></li>; })}</ul> : <p className="kpl-nil">원반 과목 때문에 {to}반에서 {s.cls}반으로 올 수 있는 학생이 없어요.</p>}
    </div> : <p className="kpl-nil">옮길 반을 골라 주세요.</p>}
  </div>;
}

function Memos({ item = {}, me, onAdd, onRemove, placeholder }) {
  const [text, setText] = React.useState("");
  const list = item.memos || [];
  const send = () => { if (!text.trim()) return; onAdd(text); setText(""); };
  return <div className="kpl-memos">
    {list.length > 0 && <ul>{list.map(m => <li key={`${m.byId}-${m.at}`}><b>{m.by}</b><small>{fmt(m.at)}</small><span>{m.text}</span>{m.byId === me.id && <button type="button" data-kdn-bare onClick={() => onRemove(m.at)} title="지우기"><X size={12} /></button>}</li>)}</ul>}
    <div className="new"><input value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) send(); }} /><button type="button" className="kpl-btn" disabled={!text.trim()} onClick={send}>남기기</button></div>
  </div>;
}

const CSS = `
.kpl{display:grid;gap:14px;color:var(--kdn-ink,#1f2937);line-height:1.5}
.kpl .spin{animation:kpl-spin 1s linear infinite}@keyframes kpl-spin{to{transform:rotate(360deg)}}
.kpl-nil{margin:0;display:flex;gap:6px;align-items:center;font-size:14px;color:var(--kdn-muted,#64748b)}
.kpl-btn{display:inline-flex;align-items:center;gap:6px;min-height:38px;padding:0 14px;border-radius:10px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#1f2937);font:inherit;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap}
.kpl-btn.pri{background:var(--kdn-accent,#2563eb);border-color:var(--kdn-accent,#2563eb);color:#fff}.kpl-btn:disabled{opacity:.5;cursor:default}.kpl-btn.sm{min-height:32px;padding:0 11px;font-size:13px}
.kpl-head{display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px;padding:16px 18px;border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff)}
.kpl-head .t{display:grid;gap:3px;flex:1 1 300px}.kpl-head .t b{font-size:19px;font-weight:800}.kpl-head .t small{font-size:13.5px;color:var(--kdn-muted,#64748b)}
.kpl-head .acts{display:flex;flex-wrap:wrap;gap:8px}
.kpl-preview{display:grid;gap:8px;padding:14px 18px;border-radius:16px;border:1.5px solid #2563eb;background:color-mix(in srgb,#2563eb 5%,var(--kdn-surface,#fff))}
.kpl-preview>b{display:flex;gap:6px;align-items:center}.kpl-preview ul{margin:0;padding-left:18px;display:grid;gap:3px;font-size:14px}.kpl-preview em{font-style:normal;font-weight:800}.kpl-preview li.warn{color:#b45309}
.kpl-preview .ft{display:flex;justify-content:flex-end;gap:8px}
.kpl-views{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.kpl-views button{display:flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:6px 8px;border-radius:14px;border:1.5px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff);color:var(--kdn-muted,#64748b);font:inherit;cursor:pointer}
.kpl-views button b{font-size:15px}.kpl-views button span{padding:1px 9px;border-radius:99px;background:var(--kdn-surface-2,#eef2f7);font-size:12.5px;font-weight:800;white-space:nowrap}
.kpl-views button.alert span{background:#dc2626;color:#fff}
.kpl-views button.on{border-color:var(--kdn-accent,#2563eb);color:var(--kdn-ink,#111827);box-shadow:inset 0 -3px 0 var(--kdn-accent,#2563eb)}
@media (max-width:560px){.kpl-views button{flex-direction:column;gap:2px}}
.kpl-sum{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.kpl-sum>div{display:grid;gap:2px;padding:14px 16px;border-radius:14px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff);border-top:4px solid #94a3b8}
.kpl-sum small{font-size:12.5px;font-weight:700;color:var(--kdn-muted,#64748b)}.kpl-sum b{font-size:26px;font-weight:800;font-variant-numeric:tabular-nums}.kpl-sum b.sm{font-size:20px}
.kpl-sum .good{border-top-color:#16a34a}.kpl-sum .good b{color:#15803d}.kpl-sum .bad{border-top-color:#dc2626}.kpl-sum .bad b{color:#b91c1c}.kpl-sum .mute{border-top-color:#cbd5e1}
@media (max-width:640px){.kpl-sum{grid-template-columns:1fr 1fr}}
.kpl-alert{margin:0;display:flex;gap:8px;align-items:center;padding:10px 14px;border-radius:12px;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;font-size:14px;font-weight:700}
.kpl-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
.kpl-bar .chips{display:flex;flex-wrap:wrap;gap:6px}
.kpl-bar .chips button{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 13px;border-radius:99px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-ink-soft,#334155);font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}
.kpl-bar .chips button small{font-size:12px;font-weight:800;color:var(--kdn-muted,#64748b)}
.kpl-bar .chips button.on{background:var(--kdn-ink,#111827);border-color:var(--kdn-ink,#111827);color:var(--kdn-surface,#fff)}.kpl-bar .chips button.on small{color:inherit}
.kpl-bar .chips button.same.on{background:#dc2626;border-color:#dc2626}.kpl-bar .chips button.ok.on{background:#16a34a;border-color:#16a34a}
.kpl-bar .seg{display:inline-flex;padding:3px;border-radius:10px;background:var(--kdn-surface-2,#f1f5f9);border:1px solid var(--kdn-line,#e2e8f0)}
.kpl-bar .seg button{height:30px;padding:0 14px;border:0;border-radius:8px;background:transparent;color:var(--kdn-muted,#64748b);font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}.kpl-bar .seg button.on{background:var(--kdn-surface,#fff);color:var(--kdn-ink,#111827);box-shadow:0 1px 3px rgba(15,23,42,.12)}
.kpl-students{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px}
.kpl-students article{display:grid;gap:8px;padding:12px 14px;border-radius:14px;border:1px solid var(--kdn-line,#e2e8f0);border-left:5px solid #94a3b8;background:var(--kdn-surface,#fff)}
.kpl-students article.t-bad{border-left-color:#dc2626;background:color-mix(in srgb,#dc2626 4%,var(--kdn-surface,#fff))}.kpl-students article.t-good{border-left-color:#16a34a}
.kpl-students header{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px}.kpl-students header b{font-size:15.5px}.kpl-students header small{font-size:12.5px;color:var(--kdn-muted,#64748b)}
.kpl-students header .to{font-size:13px;font-weight:800;color:var(--kdn-ink-soft,#334155)}.kpl-students header .st{margin-left:auto}
.kpl-students header .go{display:inline-flex;align-items:center;gap:3px;border:0;background:none;padding:0;color:#b91c1c;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer}
.kpl-students ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.kpl-students li{display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;align-items:center;gap:8px;padding:6px 8px;border-radius:9px;background:var(--kdn-surface-2,#f8fafc);font-size:13.5px}
.kpl-students li small{font-size:12px;color:var(--kdn-muted,#64748b)}.kpl-students li em{font-style:normal;font-size:12px;font-weight:800}
.kpl-students li.same{background:#fef2f2}.kpl-students li.same em{color:#b91c1c}.kpl-students li.ok em{color:#15803d}.kpl-students li.unknown em{color:#64748b}
.kpl .st{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:99px;font-size:12px;font-weight:800;white-space:nowrap}
.kpl .st.bad{background:#fee2e2;color:#b91c1c}.kpl .st.good{background:#dcfce7;color:#15803d}.kpl .st.mute{background:#f1f5f9;color:#64748b}
.kpl .lv{display:inline-flex;padding:1px 8px;border-radius:99px;font-size:11.5px;font-weight:800;white-space:nowrap}
.kpl .lv.t-must{background:color-mix(in srgb,#dc2626 16%,transparent);color:#b91c1c}.kpl .lv.t-high{background:color-mix(in srgb,#ea580c 16%,transparent);color:#c2410c}.kpl .lv.t-mid{background:color-mix(in srgb,#ca8a04 18%,transparent);color:#a16207}.kpl .lv.t-low{background:color-mix(in srgb,#64748b 16%,transparent);color:#475569}
.kpl-pairs,.kpl-roster{width:100%;border-collapse:collapse;background:var(--kdn-surface,#fff);border-radius:14px;overflow:hidden;border:1px solid var(--kdn-line,#e2e8f0);font-size:14px}
.kpl-pairs th,.kpl-roster th{padding:10px 12px;background:var(--kdn-surface-2,#f8fafc);font-size:12.5px;color:var(--kdn-muted,#64748b);text-align:left;border-bottom:1px solid var(--kdn-line,#e2e8f0);white-space:nowrap}
.kpl-pairs td,.kpl-roster td{padding:9px 12px;border-bottom:1px solid var(--kdn-line,#eef2f7);vertical-align:middle}
.kpl-pairs td small,.kpl-roster td small{color:var(--kdn-muted,#64748b);font-size:12.5px}.kpl-pairs tr.same{background:#fef2f2}
.kpl .c{text-align:center;white-space:nowrap}.kpl-roster th:not(:nth-last-child(-n+2)){text-align:center}.kpl-roster th:nth-child(2):not(:first-child),.kpl-roster th:nth-last-child(2){text-align:left}
.kpl-csum td.chg b{color:#1d4ed8}.kpl-csum td.ob{font-size:12.5px;color:var(--kdn-ink-soft,#334155)}
.kpl-csum .lnk{border:0;background:none;padding:0;font:inherit;font-weight:800;color:var(--kdn-accent,#2563eb);cursor:pointer}
.kpl .undo{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-ink-soft,#334155);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.kpl-h{margin:4px 0 0;font-size:15px}
.kpl-roster tr.miss{background:#fef2f2}.kpl-roster tr.moved td:first-child{box-shadow:inset 3px 0 0 #2563eb}.kpl-roster tr.moving{background:color-mix(in srgb,#2563eb 8%,var(--kdn-surface,#fff))}
.kpl-roster .mvtag{margin-left:8px;padding:1px 7px;border-radius:99px;background:#dbeafe;color:#1d4ed8;font-size:11.5px;font-weight:800;white-space:nowrap}
.kpl-roster td.acts{white-space:nowrap}.kpl-roster td.acts>button+button{margin-left:4px}
.kpl-roster .mvbtn{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 10px;border-radius:8px;border:1px solid #93c5fd;background:var(--kdn-surface,#fff);color:#1d4ed8;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;white-space:nowrap}
.kpl-roster .mvbtn.on{background:#2563eb;color:#fff}.kpl-roster .mvbtn:disabled{opacity:.4;cursor:not-allowed}
.kpl-ctabs{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:6px}
.kpl-ctabs button{display:grid;justify-items:center;gap:1px;padding:8px 6px;border-radius:12px;border:1.5px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#111827);font:inherit;cursor:pointer}
.kpl-ctabs button b{font-size:15.5px}.kpl-ctabs button small{font-size:11.5px;color:var(--kdn-muted,#64748b)}
.kpl-ctabs .dots{display:flex;gap:3px;min-height:16px}.kpl-ctabs .dots i{display:grid;place-items:center;min-width:16px;height:16px;padding:0 4px;border-radius:99px;font-style:normal;font-size:10px;font-weight:800;color:#fff}
.kpl-ctabs .dots i.bad{background:#dc2626}.kpl-ctabs .dots i.warn{background:#d97706}.kpl-ctabs .dots i.mv{background:#2563eb}
.kpl-ctabs button.on{border-color:var(--kdn-accent,#2563eb);background:color-mix(in srgb,var(--kdn-accent,#2563eb) 9%,var(--kdn-surface,#fff))}
.kpl-find{display:flex;align-items:center;gap:8px;max-width:420px;height:38px;padding:0 12px;border-radius:10px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-muted,#64748b)}
.kpl-find input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:14px;color:var(--kdn-ink,#111827)}
.kpl-class{display:grid;gap:10px;padding:14px 18px;border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff)}
.kpl-class .hd{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px}.kpl-class .hd b{font-size:18px}.kpl-class .hd span{font-size:13.5px;color:var(--kdn-ink-soft,#334155)}
.kpl-class .ob{margin:0;display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:13px}.kpl-class .ob b{font-size:12.5px;color:var(--kdn-muted,#64748b);margin-right:2px}
.kpl-class .ob span{padding:2px 10px;border-radius:99px;background:#ede9fe;color:#6d28d9;font-weight:700}.kpl-class .ob span.nil{background:var(--kdn-surface-2,#f1f5f9);color:var(--kdn-muted,#64748b)}
.kpl-class .checks{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.kpl-class .checks>small{font-size:12.5px;font-weight:800;color:var(--kdn-muted,#64748b);margin-right:4px}
.kpl-class .checks button{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 12px;border-radius:99px;border:1px dashed var(--kdn-line,#cbd5e1);background:transparent;color:var(--kdn-ink-soft,#334155);font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.kpl-class .checks button.on{border-style:solid;border-color:#d97706;background:#fffbeb;color:#b45309}.kpl-class .checks button.mine{background:#d97706;color:#fff}
.kpl-class .checks button small{font-size:11px;font-weight:800}
.kpl-legend{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.kpl-legend small{font-size:12.5px;color:var(--kdn-muted,#64748b);margin-left:4px}
.kpl .fl{display:inline-flex;align-items:center;gap:3px;height:28px;padding:0 10px;border-radius:99px;border:1px dashed var(--kdn-line,#cbd5e1);background:transparent;color:var(--kdn-muted,#64748b);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap}
.kpl-legend .fl{cursor:default;border-style:solid}.kpl .fl.on{border-style:solid}.kpl .fl small{font-size:10.5px;font-weight:800}
.kpl .fl.t-good.on,.kpl-legend .fl.t-good{border-color:#16a34a;color:#15803d;background:#f0fdf4}.kpl .fl.t-warn.on,.kpl-legend .fl.t-warn{border-color:#d97706;color:#b45309;background:#fffbeb}
.kpl .fl.t-info.on,.kpl-legend .fl.t-info{border-color:#2563eb;color:#1d4ed8;background:#eff6ff}.kpl .fl.t-bad.on,.kpl-legend .fl.t-bad{border-color:#dc2626;color:#b91c1c;background:#fef2f2}
.kpl .fl.mine.t-good{background:#16a34a;color:#fff}.kpl .fl.mine.t-warn{background:#d97706;color:#fff}.kpl .fl.mine.t-info{background:#2563eb;color:#fff}.kpl .fl.mine.t-bad{background:#dc2626;color:#fff}
.kpl-roster .flags{display:flex;flex-wrap:wrap;gap:4px}
.kpl-roster .memo{display:inline-flex;align-items:center;gap:3px;height:28px;padding:0 8px;border-radius:8px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-muted,#64748b);cursor:pointer}.kpl-roster .memo.has{color:#1d4ed8;border-color:#93c5fd}.kpl-roster .memo small{font-size:11px;font-weight:800}
.kpl-roster tr.sub-row>td{background:var(--kdn-surface-2,#f8fafc)}
.kpl-move{display:grid;gap:10px;padding:4px 2px}
.kpl-move .hd{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px}.kpl-move .hd b{font-size:15px}.kpl-move .hd span{font-weight:800;color:#1d4ed8}.kpl-move .hd small{font-size:12.5px;color:var(--kdn-muted,#64748b)}
.kpl-move .hd .x{margin-left:auto;border:0;background:transparent;color:var(--kdn-muted,#64748b);cursor:pointer}
.kpl-move .tgts{display:flex;flex-wrap:wrap;gap:6px}
.kpl-move .tgts button{display:grid;justify-items:center;gap:1px;min-width:74px;padding:7px 10px;border-radius:11px;border:1.5px solid #93c5fd;background:var(--kdn-surface,#fff);color:var(--kdn-ink,#111827);font:inherit;cursor:pointer}
.kpl-move .tgts button b{font-size:15px}.kpl-move .tgts button small{font-size:11.5px;color:var(--kdn-muted,#64748b)}.kpl-move .tgts button em{font-style:normal;font-size:10.5px;font-weight:800;color:#b91c1c}
.kpl-move .tgts button.on{background:#2563eb;border-color:#2563eb;color:#fff}.kpl-move .tgts button.on small,.kpl-move .tgts button.on em{color:#fff}.kpl-move .tgts button.clash:not(.on){border-color:#fca5a5}
.kpl-move .swap{display:grid;gap:8px}.kpl-move .opt{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.kpl-move .opt small{font-size:12.5px;color:var(--kdn-muted,#64748b)}
.kpl-move .sh{font-size:13.5px}.kpl-move .sh small{font-weight:600;color:var(--kdn-muted,#64748b);margin-left:6px}
.kpl-move ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:6px;max-height:280px;overflow:auto}
.kpl-move li{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px 6px 12px;border-radius:10px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e2e8f0)}
.kpl-move li.clash{border-color:#fca5a5;background:#fff7f7}.kpl-move li small{font-size:12px;color:var(--kdn-muted,#64748b)}
.kpl-memos{display:grid;gap:6px}.kpl-memos ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.kpl-memos li{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;padding:6px 10px;border-radius:9px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e2e8f0);font-size:13.5px}
.kpl-memos li small{font-size:11.5px;color:var(--kdn-muted,#64748b)}.kpl-memos li span{flex:1 1 100%}.kpl-memos li button{margin-left:auto;border:0;background:transparent;color:var(--kdn-muted,#64748b);cursor:pointer}
.kpl-memos .new{display:flex;gap:6px}.kpl-memos .new input{flex:1;min-width:0;height:36px;padding:0 10px;border-radius:9px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#111827);font:inherit;font-size:13.5px}
@media (max-width:760px){.kpl-roster th:nth-child(4),.kpl-roster td:nth-child(4){display:none}.kpl-students{grid-template-columns:1fr}.kpl-roster{font-size:13px}.kpl-roster td,.kpl-roster th{padding:8px 6px}}
.kpl-csum th{text-align:center!important}.kpl-csum th:last-child{text-align:left!important}
.kpl-mvt th{text-align:center!important}.kpl-mvt th:nth-child(2),.kpl-mvt th:nth-child(4){text-align:left!important}

/* ── 반별 명단 새 디자인 ── */
.kpl-ctabs{grid-template-columns:repeat(auto-fill,minmax(104px,1fr))!important;gap:8px!important}
.kpl-ctabs button{justify-items:stretch!important;gap:6px!important;padding:10px 12px!important;text-align:left;border-radius:14px!important}
.kpl-ctabs .top{display:flex;align-items:center;justify-content:space-between;gap:4px}.kpl-ctabs .top b{font-size:17px}
.kpl-ctabs .top em{font-style:normal;padding:1px 7px;border-radius:99px;font-size:10.5px;font-weight:800;color:#fff;white-space:nowrap}
.kpl-ctabs .top em.bad{background:#dc2626}.kpl-ctabs .top em.warn{background:#d97706}.kpl-ctabs .top em.mv{background:#2563eb}
.kpl-ctabs .gbar{display:block;height:6px;border-radius:99px;background:#f9a8d4;overflow:hidden}.kpl-ctabs .gbar i{display:block;height:100%;background:#60a5fa}
.kpl-ctabs .sub{font-size:12.5px;font-weight:800;color:var(--kdn-ink-soft,#334155)}.kpl-ctabs .sub small{font-weight:600;color:var(--kdn-muted,#64748b);margin-left:2px}
.kpl-ctabs button.on{box-shadow:0 0 0 3px color-mix(in srgb,var(--kdn-accent,#2563eb) 18%,transparent)}
.kpl-split{display:grid;grid-template-columns:minmax(260px,300px) minmax(0,1fr);gap:16px;align-items:start}
@media (max-width:980px){.kpl-split{grid-template-columns:1fr}}
.kpl-cside{position:sticky;top:76px;display:grid;gap:14px;padding:16px;border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff)}
@media (max-width:980px){.kpl-cside{position:static}}
.kpl-cside .hd{display:flex;align-items:baseline;justify-content:space-between}.kpl-cside .hd b{font-size:20px}.kpl-cside .hd span{font-size:14px;font-weight:800;color:var(--kdn-muted,#64748b)}
.kpl-cside .stats{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.kpl-cside .stats>div{display:grid;gap:1px;padding:9px 11px;border-radius:11px;background:var(--kdn-surface-2,#f4f6fa)}
.kpl-cside .stats small{font-size:11.5px;font-weight:700;color:var(--kdn-muted,#64748b)}.kpl-cside .stats b{font-size:16px;font-variant-numeric:tabular-nums}
.kpl-cside .stats .warn{background:#fffbeb}.kpl-cside .stats .warn b{color:#b45309}.kpl-cside .stats .bad{background:#fef2f2}.kpl-cside .stats .bad b{color:#b91c1c}
.kpl-cside .sec{display:grid;gap:6px}.kpl-cside .sec>small{font-size:12px;font-weight:800;color:var(--kdn-muted,#64748b)}.kpl-cside .sec>small em{font-style:normal;font-weight:600;margin-left:4px}
.kpl-cside .ob{margin:0;display:flex;flex-wrap:wrap;gap:4px}.kpl-cside .ob span{padding:3px 10px;border-radius:99px;background:#ede9fe;color:#6d28d9;font-size:12.5px;font-weight:700}.kpl-cside .ob span.nil{background:var(--kdn-surface-2,#f1f5f9);color:var(--kdn-muted,#64748b)}
.kpl-cside .checks{display:flex;flex-wrap:wrap;gap:5px}
.kpl-cside .checks button{display:inline-flex;align-items:center;gap:4px;height:30px;padding:0 10px;border-radius:99px;border:1px dashed var(--kdn-line,#cbd5e1);background:transparent;color:var(--kdn-ink-soft,#334155);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.kpl-cside .checks button.on{border-style:solid;border-color:#d97706;background:#fffbeb;color:#b45309}.kpl-cside .checks button.mine{background:#d97706;border-color:#d97706;color:#fff}
.kpl-cside .checks button small{font-size:10.5px;font-weight:800}
.kpl-cside .kpl-memos .new{flex-direction:column}.kpl-cside .kpl-memos .new .kpl-btn{align-self:flex-end;min-height:32px}
.kpl-slist{display:grid;gap:10px;min-width:0}
.kpl-slist .tools{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;justify-content:space-between}.kpl-slist .kpl-find{flex:1 1 260px;max-width:none}
.kpl-slist .legend{display:flex;flex-wrap:wrap;gap:4px}.kpl-slist .legend .fl{cursor:default;height:26px;font-size:12px}
.kpl-slist .rows{list-style:none;margin:0;padding:0;display:grid;border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff);overflow:hidden}
.kpl-slist .rows>li{border-bottom:1px solid var(--kdn-line,#eef2f7)}.kpl-slist .rows>li:last-child{border-bottom:0}
.kpl-slist .row{display:grid;grid-template-columns:auto 56px minmax(120px,190px) minmax(0,1fr) auto;align-items:center;gap:10px;min-height:50px;padding:6px 14px}
.kpl-slist .row:not(:has(.ncls)){grid-template-columns:56px minmax(120px,190px) minmax(0,1fr) auto}
.kpl-slist .ncls{font-weight:800;color:var(--kdn-accent,#2563eb);font-size:13.5px}
.kpl-slist .no{font-size:13px;font-weight:700;color:var(--kdn-muted,#64748b);font-variant-numeric:tabular-nums}
.kpl-slist .nm{display:flex;align-items:center;gap:6px;min-width:0}.kpl-slist .nm b{font-size:15px;white-space:nowrap}
.kpl-slist .g{font-style:normal;display:inline-grid;place-items:center;width:20px;height:20px;border-radius:6px;font-size:11px;font-weight:800}.kpl-slist .g.m{background:#dbeafe;color:#1d4ed8}.kpl-slist .g.f{background:#fce7f3;color:#be185d}
.kpl-slist .tags{display:flex;flex-wrap:wrap;gap:4px;min-width:0}
.kpl-slist .memo-n{display:inline-flex;align-items:center;gap:3px;height:24px;padding:0 8px;border-radius:99px;background:#eff6ff;color:#1d4ed8;font-size:11.5px;font-weight:800}
.kpl-slist .tags .fl{height:24px;font-size:11.5px;cursor:default}
.kpl-slist .acts{display:flex;gap:4px;white-space:nowrap}
.kpl-slist .act{display:inline-flex;align-items:center;gap:4px;height:30px;padding:0 10px;border-radius:9px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-ink-soft,#334155);font:inherit;font-size:12.5px;font-weight:800;cursor:pointer}
.kpl-slist .act.on{background:var(--kdn-ink,#111827);border-color:var(--kdn-ink,#111827);color:var(--kdn-surface,#fff)}
.kpl-slist .act.mv{border-color:#93c5fd;color:#1d4ed8}.kpl-slist .act.mv.on{background:#2563eb;border-color:#2563eb;color:#fff}.kpl-slist .act:disabled{opacity:.35;cursor:not-allowed}
.kpl-slist li.miss .row{background:#fef2f2}.kpl-slist li.moved .row{box-shadow:inset 4px 0 0 #2563eb}.kpl-slist li.active .row{background:color-mix(in srgb,var(--kdn-accent,#2563eb) 7%,var(--kdn-surface,#fff))}
.kpl-slist .panel{display:grid;gap:10px;padding:12px 14px 14px;background:var(--kdn-surface-2,#f8fafc);border-top:1px dashed var(--kdn-line,#e2e8f0)}
.kpl-slist .panel .flags{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px}
.kpl .fl.big{height:auto;padding:8px 12px;border-radius:12px;justify-content:flex-start;text-align:left;white-space:normal;background:var(--kdn-surface,#fff)}
.kpl .fl.big span{display:grid;gap:1px}.kpl .fl.big b{font-size:13.5px}.kpl .fl.big small{font-size:11.5px;font-weight:600;opacity:.85}
@media (max-width:760px){.kpl-slist .row,.kpl-slist .row:not(:has(.ncls)){grid-template-columns:44px minmax(0,1fr) auto;row-gap:4px}.kpl-slist .tags{grid-column:2/4;grid-row:2}.kpl-slist .ncls{display:none}}

/* 구분선 대신 카드형 줄 */
.kpl-slist .rows{gap:6px;border:0!important;background:transparent!important;overflow:visible!important;border-radius:0!important}
.kpl-slist .rows>li{border:1px solid var(--kdn-line,#e5e9f0)!important;border-radius:12px;background:var(--kdn-surface,#fff);overflow:hidden;transition:border-color .12s,box-shadow .12s}
.kpl-slist .rows>li:hover{border-color:color-mix(in srgb,var(--kdn-accent,#2563eb) 35%,var(--kdn-line,#e5e9f0))}
.kpl-slist .rows>li.active{border-color:var(--kdn-accent,#2563eb)!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--kdn-accent,#2563eb) 14%,transparent)}
.kpl-slist .rows>li.miss{border-color:#fca5a5!important}
.kpl-slist .rows>li.moved{box-shadow:inset 4px 0 0 #2563eb}.kpl-slist li.moved .row{box-shadow:none!important}
.kpl-slist .panel{border-top:1px solid var(--kdn-line,#eef2f7)!important}
/* 거르기 */
.kpl-filter{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 10px;border-radius:12px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e5e9f0)}
.kpl-filter>small{font-size:12px;font-weight:800;color:var(--kdn-muted,#64748b);margin-right:2px}
.kpl-filter button{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 11px;border-radius:99px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-ink-soft,#334155);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.kpl-filter button b{font-size:11.5px;font-weight:800;color:var(--kdn-muted,#64748b)}
.kpl-filter button:disabled{opacity:.4;cursor:default}
.kpl-filter button.t-good{color:#15803d;border-color:#bbf7d0}.kpl-filter button.t-warn{color:#b45309;border-color:#fde68a}.kpl-filter button.t-info{color:#1d4ed8;border-color:#bfdbfe}.kpl-filter button.t-bad{color:#b91c1c;border-color:#fecaca}
.kpl-filter button.on{color:#fff!important;border-color:transparent}.kpl-filter button.on b{color:#fff}
.kpl-filter button.all.on,.kpl-filter button.t-mute.on{background:var(--kdn-ink,#111827)}.kpl-filter button.t-good.on{background:#16a34a}.kpl-filter button.t-warn.on{background:#d97706}.kpl-filter button.t-info.on{background:#2563eb}.kpl-filter button.t-bad.on{background:#dc2626}

/* 조합 우려 상대 */
.kpl .fl.hot{border-color:#dc2626!important;background:#fef2f2!important;color:#b91c1c!important}
.kpl .fl em{font-style:normal;margin-left:4px;padding:0 6px;border-radius:99px;background:#dc2626;color:#fff;font-size:10.5px;font-weight:800}
.kpl-combo{display:grid;gap:6px;padding:10px 12px;border-radius:12px;background:#fffbeb;border:1px solid #fde68a}
.kpl-combo>b{font-size:13.5px;color:#92400e}.kpl-combo>b small{margin-left:6px;font-weight:600;color:#a16207}
.kpl-combo .list{display:flex;flex-wrap:wrap;gap:6px}
.kpl-combo .list>span{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 6px 0 12px;border-radius:99px;background:var(--kdn-surface,#fff);border:1px solid #fde68a;font-size:13px}
.kpl-combo .list>span small{font-size:11.5px;color:var(--kdn-muted,#64748b)}.kpl-combo .list>span i{font-style:normal;font-size:11px;font-weight:800;color:#15803d}
.kpl-combo .list>span em{font-style:normal;font-size:11px;font-weight:800;padding:1px 7px;border-radius:99px;background:#dc2626;color:#fff}
.kpl-combo .list>span.same{border-color:#fca5a5;background:#fef2f2}
.kpl-combo .list button{display:grid;place-items:center;width:20px;height:20px;border:0;border-radius:50%;background:transparent;color:var(--kdn-muted,#64748b);cursor:pointer}
.kpl-combo .find{display:flex;align-items:center;gap:6px;height:34px;padding:0 10px;border-radius:9px;border:1px solid #fde68a;background:var(--kdn-surface,#fff);color:#a16207}
.kpl-combo .find input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:13.5px;color:var(--kdn-ink,#111827)}
.kpl-combo .hits{display:flex;flex-wrap:wrap;gap:6px}
.kpl-combo .hits button{display:grid;gap:0;padding:6px 10px;border-radius:10px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff);text-align:left;font:inherit;cursor:pointer}
.kpl-combo .hits button b{font-size:13px}.kpl-combo .hits button small{font-size:11.5px;color:var(--kdn-muted,#64748b)}.kpl-combo .hits button:hover{border-color:#d97706}
.kpl-cside .kpl-memos .new input{flex:none;height:38px}
`;
