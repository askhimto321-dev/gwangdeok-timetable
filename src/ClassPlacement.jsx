// 선생님 ZONE '반편성': 반편성 프로그램 결과(엑셀)를 올려 새 반 명단을 보고,
// ① 배정가능학급(원반 과목 기준) 안에서 학생을 옮기거나 맞바꾸고 ② 분리희망이 반영됐는지 확인하고
// ③ 선생님들이 학생·반에 검토 표시를 남기고 ④ 이동 결과를 한눈에 보고 엑셀로 받아요.
// 보기·검토 표시·이동: 반편성 탭을 볼 수 있는 교직원(이동은 기록되고 되돌릴 수 있음) / 파일 올리기·지우기: 관리자·부서·학년부장
import React from "react";
import { AlertTriangle, Check, Printer, Tag, ArrowLeftRight, Users, Plus, ArrowRight, CheckCircle2, CircleHelp, Download, FileSpreadsheet, Loader2, MessageSquare, RotateCcw, Search, Trash2, Upload, X } from "lucide-react";
import { readStorage, updateStorage, writeStorage } from "./storage.js";
import { schoolYearOf } from "./curriculum.js";
import { LEVEL_INFO, SEPARATION_LEVELS, separationKey, separationPairs } from "./classSeparation.js";
import { printPlacement } from "./placementPrint.js";
import { placementKey, placementReviewKey, parsePlacementFile, normalizePlacement, bySidOf, movableClasses, swapCandidates, applyMove, undoMove, classSummary, checkPairs, studentResults, STUDENT_FLAGS, CLASS_CHECKS } from "./classPlacement.js";

const STATUS = { same: { label: "같은 반", tone: "bad", Icon: AlertTriangle }, ok: { label: "다른 반", tone: "good", Icon: CheckCircle2 }, unknown: { label: "확인 필요", tone: "mute", Icon: CircleHelp } };
const fmt = iso => { const d = new Date(iso || ""); return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const oldLabel = sid => `${Number(String(sid).slice(1, 3))}-${Number(String(sid).slice(3, 5))}`;
const ORDER = ["same", "unknown", "ok"];

export default function ClassPlacement({ roster = {}, actor = null, canManage = false, canMove = true, showToast = () => {}, separation = null, initialView = "", viewRequest = 0 }) {
  const year = schoolYearOf();
  const nextGrade = 3;
  const [placement, setPlacement] = React.useState(undefined);
  const [review, setReview] = React.useState({ students: {}, classes: {}, groups: [] });
  const [groupEdit, setGroupEdit] = React.useState(null); // { id?, name, memo, members: [] }
  const [groupAlert, setGroupAlert] = React.useState(null); // { cls, groups }
  const [alertSeen, setAlertSeen] = React.useState({});
  const [sepData, setSepData] = React.useState({});
  const [view, setView] = React.useState(initialView || "");
  React.useEffect(() => { if (initialView) setView(initialView); }, [viewRequest]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = React.useState(0);
  const [filter, setFilter] = React.useState("");
  const [by, setBy] = React.useState("student");
  const [busy, setBusy] = React.useState(false);
  const [preview, setPreview] = React.useState(null);
  const [openSid, setOpenSid] = React.useState("");
  const [openKind, setOpenKind] = React.useState("memo"); // memo: 메모만 · combo: 조합 상대 고르기
  const openPanel = (sid, kind, toggle = true) => { setOpenSid(v => (toggle && v === sid && openKind === kind ? "" : sid)); setOpenKind(kind); };
  const [moveSid, setMoveSid] = React.useState("");
  const [moveTo, setMoveTo] = React.useState(0);
  const [find, setFind] = React.useState("");
  // 필터 여러 개: 같은 줄(묶음) 안에서는 '하나라도', 다른 줄끼리는 '모두' 맞는 학생. 이 브라우저에 기억해요.
  const [rowFilter, setRowFilterRaw] = React.useState(() => { try { const v = JSON.parse(localStorage.getItem("kd_kpl_filter_v1") || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } });
  const setRowFilter = next => setRowFilterRaw(prev => { const v = typeof next === "function" ? next(prev) : next; try { localStorage.setItem("kd_kpl_filter_v1", JSON.stringify(v)); } catch { /* 저장 못 해도 화면은 그대로 */ } return v; });
  const toggleFilter = key => setRowFilter(v => (v.includes(key) ? v.filter(k => k !== key) : [...v, key]));
  const [toFilter, setToFilter] = React.useState(0);
  const [printOpen, setPrintOpen] = React.useState(false);
  const [printOpt, setPrintOpt] = React.useState({ scope: "all", overview: true, roster: true, memos: true }); // 이 반으로 옮길 수 있는 학생만
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
      setReview({ students: r?.students || {}, classes: r?.classes || {}, groups: r?.groups || [] });
      setSepData(Object.fromEntries(seps));
    });
    return () => { on = false; };
  }, [year, oldClasses.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  // 분리희망 입력에서 고친 내용이 확인 화면에 바로 반영되게 다시 읽어요
  React.useEffect(() => {
    if (view === "sep" || !oldClasses.length) return;
    let on = true;
    Promise.all(oldClasses.map(async c => [c, await readStorage(separationKey(year, "2", c), { entries: {} }).catch(() => ({ entries: {} }))])).then(seps => on && setSepData(Object.fromEntries(seps)));
    return () => { on = false; };
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // 조합 그룹: 함께 고른 학생들(서로 모두 조합 우려). 한 반에 2명 이상이면 경고
  const groupsIn = cls => (review.groups || []).map(g => ({ ...g, here: g.members.filter(m => Number(placement?.students?.[m]?.cls) === Number(cls)) })).filter(g => g.here.length >= 2);
  const openClassAlert = cls => { const gs = groupsIn(cls); const sig = `${cls}:${gs.map(g => `${g.id}${g.here.join("")}`).join("|")}`; if (gs.length && !alertSeen[sig]) setGroupAlert({ cls, groups: gs, sig }); };
  const saveGroup = async g => {
    const members = Array.from(new Set(g.members)); if (members.length < 2) { showToast("학생을 2명 이상 골라 주세요.", "error"); return; }
    const id = g.id || `grp${Date.now().toString(36)}`;
    const ok = await saveReview(v => { const list = v.groups.filter(x => x.id !== id); list.push({ id, name: (g.name || "").trim() || `조합 그룹 ${list.length + 1}`, memo: (g.memo || "").trim(), members, by: me.name, byId: me.id, at: new Date().toISOString() }); v.groups = list; return v; });
    if (ok) { setGroupEdit(null); showToast("조합 그룹을 저장했어요.", "success"); }
  };
  const removeGroup = async id => { if (!window.confirm("이 조합 그룹을 지울까요?")) return; const ok = await saveReview(v => { v.groups = v.groups.filter(x => x.id !== id); return v; }); if (ok) setGroupEdit(null); };
  const doMove = async (sid, to, swap = "") => {
    const name = placement.students[sid]?.name || roster[sid]?.name || sid;
    // 옮겨 갈 반에 같은 조합 그룹 학생이 있으면 먼저 물어봐요
    const clashes = [];
    const nm = id => placement.students[id]?.name || roster[id]?.name || id;
    (review.groups || []).forEach(g => {
      if (g.members.includes(sid)) { const there = g.members.filter(m => m !== sid && m !== swap && Number(placement.students[m]?.cls) === Number(to)); if (there.length) clashes.push(`'${g.name}': ${nm(sid)} → ${to}반 (${there.map(nm).join(", ")} 있음)`); }
      if (swap && g.members.includes(swap)) { const from = placement.students[sid]?.cls; const there = g.members.filter(m => m !== swap && m !== sid && Number(placement.students[m]?.cls) === Number(from)); if (there.length) clashes.push(`'${g.name}': ${nm(swap)} → ${from}반 (${there.map(nm).join(", ")} 있음)`); }
    });
    if (clashes.length && !window.confirm(`조합 우려 그룹 학생과 같은 반이 돼요.\n\n${clashes.join("\n")}\n\n그래도 옮길까요?`)) return;
    const ok = await commit(p => applyMove(p, { sid, to, swap, by: me.name }), swap ? `${name} ↔ ${placement.students[swap]?.name || ""} 맞바꿨어요.` : `${name} 학생을 ${to}반으로 옮겼어요.`);
    if (ok) { setMoveSid(""); setMoveTo(0); }
  };
  const doUndo = id => commit(p => undoMove(p, id), "되돌렸어요.");

  const saveReview = async change => {
    const result = await updateStorage(placementReviewKey(year), { students: {}, classes: {}, groups: [] }, cur => change({ students: { ...(cur?.students || {}) }, classes: { ...(cur?.classes || {}) }, groups: [...(cur?.groups || [])] }));
    if (result?.ok === false) { showToast("저장하지 못했어요.", "error"); return false; }
    setReview({ students: result?.value?.students || {}, classes: result?.value?.classes || {}, groups: result?.value?.groups || [] }); return true;
  };
  const toggleMark = (bucket, id, key) => saveReview(v => {
    const item = { ...(v[bucket][id] || {}) }; const marks = { ...(item.marks || {}) }; const list = marks[key] || [];
    const turningOff = list.some(m => m.byId === me.id);
    marks[key] = turningOff ? list.filter(m => m.byId !== me.id) : [...list, { byId: me.id, by: me.name, at: new Date().toISOString() }];
    if (!marks[key].length) delete marks[key];
    v[bucket][id] = { ...item, marks };
    // 조합 우려를 풀면 내가 지정한 상대(양쪽 기록)도 함께 지워요
    if (bucket === "students" && key === "combo" && turningOff) {
      const partners = new Set((item.combos || []).filter(c => c.byId === me.id).map(c => c.with));
      Object.entries(v.students).forEach(([other, it]) => { if ((it.combos || []).some(c => c.with === id && c.byId === me.id)) partners.add(other); });
      v.students[id] = { ...v.students[id], combos: (v.students[id].combos || []).filter(c => c.byId !== me.id) };
      partners.forEach(o => { if (v.students[o]) v.students[o] = { ...v.students[o], combos: (v.students[o].combos || []).filter(c => !(c.with === id && c.byId === me.id)) }; });
    }
    return v;
  });
  const addMemo = (bucket, id, text) => saveReview(v => { const item = { ...(v[bucket][id] || {}) }; item.memos = [...(item.memos || []), { byId: me.id, by: me.name, at: new Date().toISOString(), text: text.trim() }]; v[bucket][id] = item; return v; });
  const removeMemo = (bucket, id, at) => saveReview(v => { const item = { ...(v[bucket][id] || {}) }; item.memos = (item.memos || []).filter(m => !(m.at === at && m.byId === me.id)); v[bucket][id] = item; return v; });

  const downloadXlsx = async () => {
    const mod = await import("xlsx"); const XLSX = mod.default?.utils ? mod.default : mod;
    const list = Object.entries(placement.students).sort((a, b) => a[1].cls - b[1].cls || (a[1].no || 99) - (b[1].no || 99) || a[0].localeCompare(b[0]));
    const rows = [["새 반", "원래 배정 반", "이동", "구반", "구번호", "이름", "성별", "원반 과목", "검토 표시", "조합 상대", "메모"]];
    const rv = { students: review?.students || {} };
    const nm = id => placement.students[id]?.name || roster[id]?.name || id;
    list.forEach(([sid, s]) => { const it = rv.students[sid] || {}; const flags = STUDENT_FLAGS.filter(f => (it.marks?.[f.key] || []).length).map(f => f.label).join(", "); const partners = Array.from(new Set((it.combos || []).map(c => c.with))).map(o => `${nm(o)}(${placement.students[o]?.cls || "?"}반)`).join(", "); const memos = (it.memos || []).map(m => `${m.by}: ${m.text}`).join(" / ");
      rows.push([s.cls, s.orig, s.cls !== s.orig ? `${s.orig}반 → ${s.cls}반` : "", Number(sid.slice(1, 3)), Number(sid.slice(3, 5)), s.name || roster[sid]?.name || "", s.gender || roster[sid]?.gender || "", (placement.classOb?.[s.cls] || []).join(", "), flags, partners, memos]); });
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
      {placement && <button type="button" className="kpl-btn" onClick={() => setPrintOpen(true)}><Printer size={15} /> 인쇄·PDF</button>}
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
  const sepPairsN = separationPairs(sepData).length;
  const curView = view || (placement ? "roster" : "sep");
  if (!placement) return <div className="kpl"><style>{CSS}</style>{head}{previewBox}
    <div className="kpl-views four" role="tablist">{[["sep", "분리희망 입력", `${sepPairsN}쌍`], ["roster", "반별 명단", "결과 전"], ["moves", "이동 결과", "결과 전"], ["check", "분리희망 확인", "결과 전"]].map(([k, l, sub]) => <button key={k} type="button" data-kdn-bare role="tab" aria-selected={curView === k} className={curView === k ? "on" : ""} onClick={() => setView(k)}><b>{l}</b><span>{sub}</span></button>)}</div>
    {curView === "sep" ? separation : <p className="kpl-empty">{canManage ? "반편성 결과 파일을 올리면 새 반 명단 · 이동 · 분리희망 확인을 할 수 있어요." : "관리자·학년부장이 반편성 결과를 올리면 볼 수 있어요. 그 전까지는 분리희망 입력을 해 주세요."}</p>}
  </div>;

  const bySid = bySidOf(placement);
  const pairs = separationPairs(sepData);
  const checked = checkPairs(pairs, bySid);
  const results = studentResults(checked);
  const missSet = new Set(results.filter(s => s.status === "same").map(s => s.sid));
  // 조합 우려 상대: 내가 적은 상대 + 상대가 나를 적은 것(서로 보이게). 같은 새 반이면 경고
  const comboPairs = (() => { const m = new Map(); const put = (x, y, by, group = "") => { const [a, b] = [x, y].sort(); const k = `${a}|${b}`; if (!m.has(k)) m.set(k, { a, b, by: [], groups: [] }); m.get(k).by.push(by); if (group) m.get(k).groups.push(group); };
    Object.entries(review.students || {}).forEach(([sid, it]) => (it.combos || []).forEach(c => put(sid, c.with, c.by)));
    (review.groups || []).forEach(g => g.members.forEach((x, i) => g.members.slice(i + 1).forEach(y => put(x, y, `그룹 ${g.name}`, g.name))));
    return Array.from(m.values()); })();
  const groupsOf = sid => (review.groups || []).filter(g => g.members.includes(sid));
  // 지목(학생마다 고른 상대)만: 조합 그룹으로만 묶인 쌍은 '그룹'으로 따로 보여요
  const pickedPairs = comboPairs.filter(p => p.by.some(b => !String(b).startsWith("그룹 ")));
  const combosOf = sid => pickedPairs.filter(p => p.a === sid || p.b === sid).map(p => ({ other: p.a === sid ? p.b : p.a, by: p.by.filter(b => !String(b).startsWith("그룹 ")) }));
  const comboSame = sid => combosOf(sid).filter(c => Number(placement.students[c.other]?.cls) === Number(placement.students[sid]?.cls));
  const groupSame = sid => (review.groups || []).some(g => g.members.includes(sid) && g.members.some(m => m !== sid && Number(placement.students[m]?.cls) === Number(placement.students[sid]?.cls)));
  const addCombo = (sid, other) => saveReview(v => { const item = { ...(v.students[sid] || {}) }; const list = item.combos || []; if (list.some(c => c.with === other && c.byId === me.id)) return v; item.combos = [...list, { with: other, byId: me.id, by: me.name, at: new Date().toISOString() }]; const marks = { ...(item.marks || {}) }; if (!(marks.combo || []).some(m => m.byId === me.id)) marks.combo = [...(marks.combo || []), { byId: me.id, by: me.name, at: new Date().toISOString() }]; item.marks = marks; v.students[sid] = item; return v; });
  const removeCombo = (sid, other) => saveReview(v => { [sid, other].forEach(a => { const b = a === sid ? other : sid; const item = { ...(v.students[a] || {}) }; item.combos = (item.combos || []).filter(c => !(c.with === b && c.byId === me.id)); v.students[a] = item; }); return v; });
  const resultOf = sid => results.find(x => x.sid === sid);
  // 이동 기록으로 학생마다 마지막 이동(어디서 왔는지 · 누구와 맞바꿨는지)
  const moveInfo = (() => { const m = new Map(); (placement?.moves || []).forEach(mv => {
    m.set(mv.sid, { from: mv.from, to: mv.to, partner: mv.swap || "", by: mv.by, at: mv.at });
    if (mv.swap) m.set(mv.swap, { from: mv.to, to: mv.from, partner: mv.sid, by: mv.by, at: mv.at }); }); return m; })();
  const count = s => checked.filter(p => p.status === s).length;
  const mustMiss = checked.filter(p => p.status === "same" && p.level === SEPARATION_LEVELS[0]).length;
  const nameOf = sid => placement.students[sid]?.name || roster?.[sid]?.name || sid;
  const genderOf = sid => placement.students[sid]?.gender || roster?.[sid]?.gender || "";
  const summary = classSummary(placement);
  const classes = summary.map(s => s.cls);
  const allView = tab === "all";
  // 인쇄·PDF: 반별 현황표 + 반마다 한 장(학생 명단·표시·메모)
  const doPrint = () => {
    const marksOf = (sid, key) => (review.students[sid]?.marks?.[key] || []).length > 0;
    const inCls = c => Object.entries(placement.students).filter(([, x]) => Number(x.cls) === c);
    const classRows = summary.map(x => { const ids = inCls(x.cls).map(([sid]) => sid); const cls = review.classes[x.cls] || {};
      return { cls: x.cls, n: x.n, m: x.m, f: x.f, inn: x.inn || 0, out: x.out || 0,
        flags: Object.fromEntries(STUDENT_FLAGS.map(f => [f.key, ids.filter(sid => marksOf(sid, f.key)).length])),
        miss: ids.filter(sid => missSet.has(sid)).length,
        combo: pickedPairs.filter(p => Number(placement.students[p.a]?.cls) === x.cls && Number(placement.students[p.b]?.cls) === x.cls).length,
        group: groupsIn(x.cls).length, checks: CLASS_CHECKS.filter(c => (cls.marks?.[c.key] || []).length).map(c => c.label) }; });
    const pick = printOpt.scope === "all" ? summary : summary.filter(x => x.cls === curTab);
    const classesOut = pick.map(x => ({ cls: x.cls, notes: ((review.classes[x.cls] || {}).memos || []).map(m => `${m.text} (${m.by})`),
      students: inCls(x.cls).sort((a, b) => (a[1].no || 99) - (b[1].no || 99) || a[0].localeCompare(b[0])).map(([sid, v]) => { const r = resultOf(sid); const cs = combosOf(sid); const notes = [];
        const mi = moveInfo.get(sid); const moved = Number(v.cls) !== Number(v.orig) || !!mi;
        if (cs.length) notes.push(`조합 상대: ${cs.map(c => `${nameOf(c.other)}(${placement.students[c.other]?.cls || "?"}반)`).join(", ")}`);
        groupsOf(sid).forEach(g => notes.push(`그룹 ${g.name}`));
        return { no: v.no || "", old: oldLabel(sid), name: nameOf(sid), gender: genderOf(sid), flags: STUDENT_FLAGS.filter(f => marksOf(sid, f.key)).map(f => f.key),
          sep: r ? (r.status === "same" ? "미반영" : r.status === "ok" ? "반영" : "확인") : "",
          move: moved ? { from: mi && Number(mi.to) === Number(v.cls) ? mi.from : v.orig, partner: mi?.partner ? nameOf(mi.partner) : "" } : null, alert: missSet.has(sid) || comboSame(sid).length > 0, notes,
          memos: (review.students[sid]?.memos || []).map(m => `${m.text} (${m.by})`) }; }) }));
    const ok = printPlacement({ title: `${year + 1}학년도 ${nextGrade}학년 반편성`, subtitle: `${placement.fileName || "반편성 결과"} · ${fmt(placement.at)} ${placement.by} 반영`,
      flags: STUDENT_FLAGS.map(f => ({ key: f.key, label: f.label, tone: f.tone })), classRows,
      moves: placement.moves.map(m => ({ from: m.from, to: m.to, name: nameOf(m.sid), old: oldLabel(m.sid), swap: m.swap ? nameOf(m.swap) : "", swapOld: m.swap ? oldLabel(m.swap) : "", by: m.by || "", at: fmt(m.at) })),
      classes: classesOut }, { overview: printOpt.overview && printOpt.scope === "all", roster: printOpt.roster || printOpt.scope !== "all", memos: printOpt.memos });
    if (!ok) showToast?.("인쇄 창을 열지 못했어요. 팝업 차단을 풀어 주세요.", "error");
    else setPrintOpen(false);
  };
  const curTab = classes.includes(tab) ? tab : classes[0];

  return <div className="kpl"><style>{CSS}</style>
    {head}{previewBox}
    {groupEdit && <GroupModal group={groupEdit} placement={placement} nameOf={nameOf} curTab={curTab} onSave={saveGroup} onRemove={groupEdit.id ? () => removeGroup(groupEdit.id) : null} onClose={() => setGroupEdit(null)} />}
    {printOpen && <div className="kpl-modal" role="dialog" aria-modal="true" aria-label="인쇄·PDF" onClick={e => e.target === e.currentTarget && setPrintOpen(false)}><div className="box prn">
      <b className="t"><Printer size={18} /> 반편성 현황 인쇄·PDF</b>
      <div className="opt"><small>범위</small><div className="seg">{[["all", "전체 반"], ["cur", `지금 반(${curTab}반)`]].map(([k, l]) => <button key={k} type="button" data-kdn-bare className={printOpt.scope === k ? "on" : ""} onClick={() => setPrintOpt(o => ({ ...o, scope: k }))}>{l}</button>)}</div></div>
      <div className="opt"><small>넣을 것</small><div className="cks">
        {printOpt.scope === "all" && <label><input type="checkbox" checked={printOpt.overview} onChange={e => setPrintOpt(o => ({ ...o, overview: e.target.checked }))} /> 반별 현황표 · 이동 내역 (1쪽)</label>}
        {printOpt.scope === "all" && <label><input type="checkbox" checked={printOpt.roster} onChange={e => setPrintOpt(o => ({ ...o, roster: e.target.checked }))} /> 반별 학생 명단 (반마다 한 장)</label>}
        <label><input type="checkbox" checked={printOpt.memos} onChange={e => setPrintOpt(o => ({ ...o, memos: e.target.checked }))} /> 선생님 메모·반 의견</label>
      </div></div>
      <p>인쇄 창에서 '대상'을 <b>PDF로 저장</b>으로 바꾸면 PDF 파일로 받을 수 있어요. 학생 정보가 담겨 있으니 보관에 주의해 주세요.</p>
      <div className="ft"><button type="button" className="kpl-btn" onClick={() => setPrintOpen(false)}>닫기</button><button type="button" className="kpl-btn pri" disabled={printOpt.scope === "all" && !printOpt.overview && !printOpt.roster} onClick={doPrint}><Printer size={15} /> 인쇄 미리보기</button></div>
    </div></div>}
    {groupAlert && <div className="kpl-modal" role="alertdialog" aria-modal="true" onClick={e => e.target === e.currentTarget && setGroupAlert(null)}><div className="box alert">
      <span className="ico"><AlertTriangle size={22} /></span>
      <b className="t">{groupAlert.cls}반에 같은 조합 그룹 학생이 함께 있어요</b>
      {groupAlert.groups.map(g => <div key={g.id} className="ga"><b><Users size={13} /> {g.name}</b><span>{g.here.map(nameOf).join(", ")}</span>{g.memo && <small>{g.memo}</small>}</div>)}
      <p>반별 명단에서 '이동'으로 다른 반으로 옮기거나, 괜찮다면 그대로 두세요.</p>
      <div className="ft"><button type="button" className="kpl-btn" onClick={() => { setAlertSeen(v => ({ ...v, [groupAlert.sig]: true })); setGroupAlert(null); }}>이 반은 그만 알리기</button><button type="button" className="kpl-btn pri" onClick={() => setGroupAlert(null)}>확인</button></div>
    </div></div>}
    <div className="kpl-views four" role="tablist">
      {[["sep", "분리희망 입력", `${pairs.length}쌍`], ["roster", "반별 명단", `${classes.length}개 반`], ["moves", "이동 결과", `${placement.moves.length}건`], ["check", "분리희망 확인", count("same") ? `미반영 ${count("same")}` : "모두 반영"]].map(([k, l, sub]) => <button key={k} type="button" data-kdn-bare role="tab" aria-selected={curView === k} className={`${curView === k ? "on" : ""}${k === "check" && count("same") ? " alert" : ""}`} onClick={() => { setView(k); if (k === "roster" && !allView) openClassAlert(curTab); }}><b>{l}</b><span>{sub}</span></button>)}
    </div>

    {curView === "sep" && separation}
    {curView === "roster" && (() => {
      const q = find.trim();
      const wide = !!q || allView; // 검색·전체 보기: 모든 반 학생을 한 표로
      const base = Object.entries(placement.students).filter(([sid, s]) => (q ? String(s.name || "").includes(q) || oldLabel(sid).includes(q) : allView || Number(s.cls) === curTab));
      const markedAny = sid => STUDENT_FLAGS.some(f => (review.students[sid]?.marks?.[f.key] || []).length > 0);
      const FILTERS = [{ key: "marked", group: "mark", label: "표시한 학생 전체", tone: "mute", test: ([sid]) => markedAny(sid) }, ...STUDENT_FLAGS.map(f => ({ key: f.key, group: "mark", label: f.label, tone: f.tone, test: ([sid]) => (review.students[sid]?.marks?.[f.key] || []).length > 0 })),
        { key: "miss", group: "check", label: "분리희망 미반영", tone: "bad", test: ([sid]) => missSet.has(sid) }, { key: "comboSame", group: "check", label: "조합 우려 같은 반", tone: "warn", test: ([sid]) => comboSame(sid).length > 0 || groupSame(sid) },
        { key: "moved", group: "check", label: "받은 학생", tone: "info", test: ([, x]) => Number(x.cls) !== Number(x.orig) }, { key: "memo", group: "check", label: "메모 있음", tone: "info", test: ([sid]) => (review.students[sid]?.memos || []).length > 0 },
        { key: "m", group: "gender", label: "남학생", tone: "mute", test: ([sid]) => /남/.test(genderOf(sid)) }, { key: "f", group: "gender", label: "여학생", tone: "mute", test: ([sid]) => /여/.test(genderOf(sid)) }];
      const FGROUPS = [["mark", "학생 표시"], ["check", "배정 점검"], ["gender", "성별"]];
      const picked = FILTERS.filter(f => rowFilter.includes(f.key));
      // 묶음마다: 고른 것 중 하나라도 맞으면 통과. except: 그 묶음은 빼고(칩 옆 숫자 = 다른 조건과 함께 골랐을 때 인원)
      const passes = (e, except = "") => FGROUPS.every(([g]) => { if (g === except) return true; const fs = picked.filter(f => f.group === g); return !fs.length || fs.some(f => f.test(e)); });
      const activeF = picked.length ? { label: picked.map(f => f.label).join(" · ") } : null;
      const canGo = (sid, c) => movableClasses(placement, sid).includes(Number(c));
      const toF = allView && !q ? toFilter || 0 : toFilter && toFilter !== curTab && !wide ? toFilter : 0;
      const list = base.filter(e => passes(e)).filter(([sid, x]) => !toF || (canGo(sid, toF) && Number(x.cls) !== toF)).sort((a, b) => (wide ? a[1].cls - b[1].cls : 0) || (a[1].no || 99) - (b[1].no || 99) || a[0].localeCompare(b[0]));
      const sm = summary.find(s => s.cls === curTab) || {};
      const cls = review.classes[curTab] || {};
      const flagCount = key => base.filter(([sid]) => (review.students[sid]?.marks?.[key] || []).length).length;
      const missN = base.filter(([sid]) => missSet.has(sid)).length;
      const groupN = groupsIn(curTab).length;
      const comboN = pickedPairs.filter(p => Number(placement.students[p.a]?.cls) === curTab && Number(placement.students[p.b]?.cls) === curTab).length;
      const ob = placement.classOb?.[curTab] || [];
      const cols = wide ? 11 : 10;
      const total = summary.reduce((t, x) => ({ n: t.n + (x.n || 0), m: t.m + (x.m || 0), f: t.f + (x.f || 0) }), { n: 0, m: 0, f: 0 });
      const totalMiss = Object.keys(placement.students).filter(id => missSet.has(id)).length;
      const goClass = c => { setTab(Number(c)); setFind(""); setOpenSid(""); setMoveSid(""); openClassAlert(Number(c)); };
      const mPct = sm.n ? Math.round((sm.m / sm.n) * 100) : 0;
      const Stat = ({ icon = "", label, n, unit = "", tone = "", hint = "" }) => <div className={`st-row ${tone}`} title={hint}><i className={`ic-${icon}`} /><span>{label}</span><b>{n}<small>{unit}</small></b></div>;
      return <>
        <div className="kpl-ctabs2" role="tablist" aria-label="새 반" style={{ "--n": summary.length + 1 }}>
          <button type="button" role="tab" aria-selected={allView && !q} data-kdn-bare className={`all${allView && !q ? " on" : ""}`} onClick={() => { setTab("all"); setFind(""); setOpenSid(""); setMoveSid(""); setToFilter(0); }}>
            {totalMiss ? <i className="dot" title={`분리 미반영 ${totalMiss}명`}>{totalMiss}</i> : null}
            <b>전체</b><span className="n">{total.n}명</span><span className="gbar"><i style={{ width: `${total.n ? Math.round((total.m / total.n) * 100) : 0}%` }} /></span><small>남 {total.m} · 여 {total.f}</small></button>
          {summary.map(s => { const ids = Object.entries(placement.students).filter(([, x]) => Number(x.cls) === s.cls).map(([id]) => id); const miss = ids.filter(id => missSet.has(id)).length; const pct = s.n ? Math.round((s.m / s.n) * 100) : 0; return <button key={s.cls} type="button" role="tab" aria-selected={s.cls === curTab && !q && !allView} data-kdn-bare className={s.cls === curTab && !q && !allView ? "on" : ""} onClick={() => goClass(s.cls)}>
          {miss ? <i className="dot" title={`분리 미반영 ${miss}명`}>{miss}</i> : null}
          <b>{s.cls}반</b><span className="n">{s.n}명</span><span className="gbar"><i style={{ width: `${pct}%` }} /></span><small>남 {s.m} · 여 {s.f}</small></button>; })}</div>
        <div className={`kpl-split2${wide ? " searching" : ""}`}>
          {!wide && <aside className="kpl-side2">
            <header><b>{nextGrade}학년 {curTab}반</b><span>{sm.n}명</span></header>
            <div className="gender"><span className="m">남 {sm.m}</span><span className="bar"><i style={{ width: `${mPct}%` }} /></span><span className="f">여 {sm.f}</span></div>
            <div className="stat-list">
              <h6>학생 표시</h6>
              <Stat icon="good" label="리더 후보" n={flagCount("leader")} unit="명" tone={flagCount("leader") ? "" : "warn"} hint="선생님들이 리더 후보로 표시한 학생" />
              <Stat icon="info" label="배려 필요" n={flagCount("care")} unit="명" />
              <Stat icon="bad" label="생활지도 주의" n={flagCount("guide")} unit="명" />
              <Stat icon="mv" label="이동 희망" n={flagCount("move")} unit="명" hint="다른 반으로 옮기는 게 좋겠다고 표시한 학생" />
              <h6>배정 점검</h6>
              <Stat icon="bad" label="분리희망 미반영" n={missN} unit="명" tone={missN ? "bad" : ""} />
              <Stat icon="warn" label="조합 우려 같은 반" n={comboN} unit="쌍" tone={comboN ? "bad" : ""} hint="학생마다 지목한 조합 상대가 같은 반인 쌍" />
              <Stat icon="warn" label="조합 그룹 같은 반" n={groupN} unit="그룹" tone={groupN ? "bad" : ""} hint="같은 조합 그룹 학생이 이 반에 2명 이상인 그룹" />
              <Stat icon="mv" label="받은 학생" n={sm.inn || 0} unit="명" hint="이동으로 이 반에 온 학생" />
              <Stat icon="mv" label="보낸 학생" n={sm.out || 0} unit="명" hint="이동으로 다른 반에 간 학생" />
            </div>
            {placement.kind === "program" && <div className="blk"><h5>원반 과목</h5>{ob.length ? <div className="ob">{ob.map(x => <span key={x}>{x}</span>)}</div> : <p className="nil">없음 (원반 과목 제한 없음)</p>}</div>}
            <div className="blk"><h5>반 점검 <small>해당되면 체크</small></h5><ul className="chk">{CLASS_CHECKS.map(c => { const marks = cls.marks?.[c.key] || []; const mine = marks.some(m => m.byId === me.id); return <li key={c.key}><button type="button" data-kdn-bare className={`${marks.length ? "on" : ""}${mine ? " mine" : ""}`} title={c.hint} onClick={() => toggleMark("classes", curTab, c.key)}><i>{mine ? "✓" : ""}</i><span>{c.label}</span>{marks.length ? <small>{marks.map(m => m.by).join(", ")}</small> : null}</button></li>; })}</ul></div>
            <div className="blk"><h5>반 의견</h5><Memos item={cls} me={me} onAdd={t => addMemo("classes", curTab, t)} onRemove={at => removeMemo("classes", curTab, at)} placeholder="예: 리더 후보가 없어 교환 검토" /></div>
          </aside>}
          <section className="kpl-tbl">
            <div className="tools"><label className="kpl-find"><Search size={14} /><input value={find} onChange={e => setFind(e.target.value)} placeholder="이름·구반-번호로 전체에서 찾기(예: 4-15)" /></label>
              <button type="button" data-kdn-bare className="kpl-btn grp-add" onClick={() => setGroupEdit({ name: "", memo: "", members: [] })}><Users size={15} /> 조합 그룹 만들기</button></div>
            {(() => { const related = (review.groups || []).filter(g => wide || g.members.some(m => Number(placement.students[m]?.cls) === curTab)); return related.length > 0 && <div className="kpl-groups"><small>조합 그룹</small>{related.map(g => { const here = g.members.filter(m => Number(placement.students[m]?.cls) === curTab); return <button key={g.id} type="button" data-kdn-bare className={here.length >= 2 ? "hot" : ""} onClick={() => setGroupEdit({ ...g })} title={g.members.map(m => `${nameOf(m)}(${placement.students[m]?.cls || "?"}반)`).join("\n")}><Users size={13} /><b>{g.name}</b><span>{here.length >= 2 ? `이 반에 ${here.length}명` : `${g.members.length}명`}</span></button>; })}</div>; })()}
            {!wide && (() => { const mv = (placement.moves || []).filter(m => Number(m.from) === curTab || Number(m.to) === curTab).slice().reverse(); return mv.length > 0 && <details className="kpl-mvlog" open={mv.length <= 4}>
              <summary><ArrowLeftRight size={14} /><b>{curTab}반 이동 기록 {mv.length}건</b><small>받은 학생 {mv.filter(m => Number(m.to) === curTab).length + mv.filter(m => m.swap && Number(m.from) === curTab).length} · 보낸 학생 {mv.filter(m => Number(m.from) === curTab).length + mv.filter(m => m.swap && Number(m.to) === curTab).length}</small></summary>
              <ul>{mv.map(m => { const outMe = Number(m.from) === curTab; const a = outMe ? m.sid : m.swap; const b = outMe ? m.swap : m.sid; return <li key={m.id}>
                {m.swap ? <><span className="out">보냄 <b>{nameOf(a)}</b> → {outMe ? m.to : m.from}반</span><span className="ar"><ArrowLeftRight size={13} /></span><span className="in">받음 <b>{nameOf(b)}</b> ← {outMe ? m.to : m.from}반</span><em>맞바꿈</em></>
                  : outMe ? <><span className="out">보냄 <b>{nameOf(m.sid)}</b> → {m.to}반</span><em className="one">옮기기만</em></> : <><span className="in">받음 <b>{nameOf(m.sid)}</b> ← {m.from}반</span><em className="one">옮기기만</em></>}
                <small>{m.by} · {fmt(m.at)}</small></li>; })}</ul>
            </details>; })()}
            {allView && !q && <div className="kpl-sres all"><Users size={15} /><b>{toF ? `${toF}반으로 옮길 수 있는 학생 ${list.length}명` : `전체 학생 ${list.length}명`}{activeF ? ` · '${activeF.label}'` : ""}</b><small>모든 반을 한 번에 봐요. 새 반을 누르면 그 반으로 가요.</small></div>}
            {q && <div className="kpl-sres"><Search size={15} /><b>'{q}' 검색 결과 {list.length}명</b><small>모든 반에서 찾았어요. 새 반을 누르면 그 반으로 가요.</small><button type="button" data-kdn-bare onClick={() => setFind("")}><X size={13} /> 검색 지우기</button></div>}
            <div className="kpl-filter multi" role="group" aria-label="학생 필터">
              <div className="fhd"><b>필터</b><small>여러 개 고를 수 있어요 · 같은 줄은 하나라도, 다른 줄끼리는 모두 맞는 학생</small>
                {picked.length > 0 ? <><span className="cnt">{list.length}명</span><button type="button" data-kdn-bare className="reset" onClick={() => setRowFilter([])}><X size={12} /> 필터 지우기</button></> : <span className="cnt mute">전체 {base.length}명</span>}</div>
              {FGROUPS.map(([g, gl]) => <div key={g} className="frow"><small>{gl}</small>{FILTERS.filter(f => f.group === g).map(f => { const on = rowFilter.includes(f.key); const n = base.filter(e => passes(e, g) && f.test(e)).length; return <button key={f.key} type="button" data-kdn-bare aria-pressed={on} disabled={!n && !on} className={`t-${f.tone}${on ? " on" : ""}`} onClick={() => toggleFilter(f.key)}>{on && <Check size={12} />}{f.label} <b>{n}</b></button>; })}</div>)}
            </div>
            {wide && activeF && <div className="kpl-dist" aria-label="반별 인원"><small>반별</small>{classes.map(c => { const n = list.filter(([, x]) => Number(x.cls) === c).length; return <button key={c} type="button" data-kdn-bare className={n ? "has" : ""} onClick={() => goClass(c)} title={`${c}반 명단으로`}>{c}반 <b>{n}</b></button>; })}</div>}
            {(!wide || (allView && !q)) && (placement.kind === "program" || Object.values(placement.students).some(x => x.can)) ? <div className="kpl-filter kpl-to" role="group" aria-label="옮길 수 있는 반으로 거르기"><small>{allView ? <>옮길 반 <em>그 반으로 옮길 수 있는 다른 반 학생</em></> : `${curTab}반 → 옮길 반`}</small>
              <button type="button" data-kdn-bare className={`all${!toF ? " on" : ""}`} onClick={() => setToFilter(0)}>전체</button>
              {allView && classes.map(c => { const n = base.filter(([sid, x]) => Number(x.cls) !== c && canGo(sid, c)).length; return <button key={c} type="button" data-kdn-bare disabled={!n && toF !== c} className={`t-info${toF === c ? " on" : ""}`} title={`다른 반에서 ${c}반으로 옮길 수 있는 학생 ${n}명`} onClick={() => { setToFilter(v => (v === c ? 0 : c)); setOpenSid(""); }}>→ {c}반 <i>{n}</i></button>; })}
              {!allView && classes.filter(c => c !== curTab).map(c => { const n = base.filter(([sid]) => canGo(sid, c)).length; const back = Object.entries(placement.students).filter(([id, x]) => Number(x.cls) === c && movableClasses(placement, id).includes(curTab)).length; return <button key={c} type="button" data-kdn-bare disabled={!n && toF !== c} className={`t-info${toF === c ? " on" : ""}`} title={`${curTab}반 → ${c}반으로 갈 수 있는 학생 ${n}명 · ${c}반 → ${curTab}반으로 올 수 있는 학생 ${back}명`} onClick={() => { setToFilter(v => (v === c ? 0 : c)); setOpenSid(""); }}>{c}반</button>; })}
            </div> : null}
            <div className="scroll"><table className="kpl-grid">
              <thead><tr>{wide && <th className="c">새 반</th>}<th className="c">구반-번호</th><th>이름</th><th className="c">분리희망</th>{STUDENT_FLAGS.map(f => <th key={f.key} className={`c fh t-${f.tone}`} title={f.hint}>{f.label}<small>{flagCount(f.key)}</small></th>)}<th className="c">메모</th><th className="c">이동</th></tr></thead>
              <tbody>{list.map(([sid, s]) => { const item = review.students[sid] || {}; const memoN = (item.memos || []).length; const r = resultOf(sid); const moved = Number(s.cls) !== Number(s.orig); const targets = movableClasses(placement, sid); const g = genderOf(sid); const cs = combosOf(sid); const same = comboSame(sid); return <React.Fragment key={sid}>
                <tr className={`${missSet.has(sid) ? "miss" : ""}${moved ? " moved" : ""}${moveSid === sid || openSid === sid ? " active" : ""}`}>
                  {wide && <td className="c"><button type="button" data-kdn-bare className="go-cls" onClick={() => goClass(s.cls)} title={`${s.cls}반 명단으로`}>{s.cls}반</button></td>}
                  <td className="c no">{oldLabel(sid)}</td>
                  <td className="nm"><button type="button" data-kdn-bare className={`nmb${openSid === sid && openKind === "sep" ? " on" : ""}`} onClick={() => { openPanel(sid, "sep"); setMoveSid(""); }} title="눌러서 분리희망·조합 상대 보기">{s.name || roster[sid]?.name || sid}</button>{g && <i className={`g ${/남/.test(g) ? "m" : "f"}`}>{g}</i>}{(() => { const mi = moveInfo.get(sid); if (!moved && !mi) return null; const from = mi && Number(mi.to) === Number(s.cls) ? mi.from : s.orig;
                    return <span className={`mvbadge${mi?.partner ? " sw" : ""}`} title={mi ? `${mi.from}반 → ${mi.to}반${mi.partner ? ` · 맞바꾼 학생: ${nameOf(mi.partner)}` : ""} · ${mi.by || ""} ${fmt(mi.at)}` : ""}><ArrowLeftRight size={11} />{from}반에서 옴{mi?.partner ? <> · 맞바꾼 학생 <b>{nameOf(mi.partner)}</b></> : ""}</span>; })()}</td>
                  <td className="c">{r ? <button type="button" data-kdn-bare className={`st ${STATUS[r.status].tone}`} onClick={() => { openPanel(sid, "sep"); setMoveSid(""); }} title={r.items.map(i => `${nameOf(i.other)}(${i.level}) ${STATUS[i.status].label}`).join("\n")}>{r.status === "same" ? "미반영" : r.status === "ok" ? "반영" : "확인"} {r.items.length}</button> : <span className="dash">-</span>}</td>
                  {STUDENT_FLAGS.map(f => { const marks = item.marks?.[f.key] || []; const mine = marks.some(m => m.byId === me.id); const isCombo = f.key === "combo"; return <td key={f.key} className="c fc">
                    <button type="button" data-kdn-bare className={`ck t-${f.tone}${marks.length ? " on" : ""}${mine ? " mine" : ""}`} title={`${f.label}: ${f.hint}${marks.length ? `\n표시: ${marks.map(m => m.by).join(", ")}` : "\n눌러서 표시"}`} onClick={() => { toggleMark("students", sid, f.key); if (isCombo && !mine) { openPanel(sid, "combo", false); setMoveSid(""); } }}>{marks.length ? (marks.length > 1 ? marks.length : "✓") : ""}</button>
                    {isCombo && groupsOf(sid).length > 0 && <span className={`gtag${groupsOf(sid).some(g => g.members.some(m => m !== sid && Number(placement.students[m]?.cls) === Number(s.cls))) ? " hot" : ""}`} title={groupsOf(sid).map(g => g.name).join(", ")}>그룹</span>}
                    {isCombo && (marks.length > 0 || cs.length > 0) && <button type="button" data-kdn-bare className={`cmb${same.length ? " hot" : ""}`} onClick={() => { openPanel(sid, "combo"); setMoveSid(""); }} title={cs.length ? cs.map(c => `${nameOf(c.other)}(${placement.students[c.other]?.cls || "?"}반)`).join("\n") : "상대 학생 지정"}>{cs.length ? `상대 ${cs.length}${same.length ? " · 같은 반" : ""}` : "상대 지정"}</button>}
                  </td>; })}
                  <td className="c"><button type="button" data-kdn-bare className={`ic${memoN ? " has" : ""}${openSid === sid && openKind === "memo" ? " on" : ""}`} onClick={() => { openPanel(sid, "memo"); setMoveSid(""); }} title="메모"><MessageSquare size={14} />{memoN ? <small>{memoN}</small> : null}</button></td>
                  <td className="c">{canMove && <button type="button" data-kdn-bare className={`mvb${moveSid === sid ? " on" : ""}`} disabled={!targets.length} title={targets.length ? `갈 수 있는 반: ${targets.join(", ")}반` : "원반 과목 때문에 갈 수 있는 다른 반이 없어요"} onClick={() => { setMoveSid(v => (v === sid ? "" : sid)); setMoveTo(toF && targets.includes(toF) ? toF : 0); setOpenSid(""); }}><ArrowLeftRight size={13} /> 이동</button>}</td>
                </tr>
                {openSid === sid && openKind === "sep" && <tr className="sub"><td colSpan={cols}><div className="panel2 sepp">
                  <div className="ph"><b>{s.name || nameOf(sid)}</b><small>{oldLabel(sid)} · 지금 {s.cls}반</small><button type="button" data-kdn-bare className="x" onClick={() => setOpenSid("")} aria-label="닫기"><X size={14} /></button></div>
                  <div className="sec"><h6>분리희망 <small>{r ? `${r.items.length}명 · 같은 반이면 빨강` : ""}</small></h6>
                    {r ? <table className="sept"><thead><tr><th>학생</th><th className="c">구반-번호</th><th className="c">지금 반</th><th className="c">정도</th><th className="c">결과</th><th>사유</th></tr></thead><tbody>
                      {r.items.map(i => { const oc = placement.students[i.other]?.cls; return <tr key={i.other} className={i.status}><td><b>{nameOf(i.other)}</b></td><td className="c">{oldLabel(i.other)}</td><td className="c"><button type="button" data-kdn-bare className="go-cls" onClick={() => { setTab(Number(oc)); setFind(""); setOpenSid(""); }} title={`${oc}반 명단으로`}>{oc || "?"}반</button></td><td className="c"><span className="lv">{i.level}</span></td><td className="c"><span className={`st ${STATUS[i.status].tone}`}>{STATUS[i.status].label}</span></td><td className="rs">{(i.reasons || []).join(", ") || <span className="dash">-</span>}</td></tr>; })}
                    </tbody></table> : <p className="kpl-nil">이 학생은 분리희망이 없어요.</p>}</div>
                  {(cs.length > 0 || groupsOf(sid).length > 0) && <div className="sec"><h6>조합 우려</h6><div className="chips">{cs.map(c => { const oc = placement.students[c.other]?.cls; return <span key={c.other} className={Number(oc) === Number(s.cls) ? "hot" : ""}>{nameOf(c.other)} · {oc || "?"}반</span>; })}{groupsOf(sid).map(g => <span key={g.id} className="grp"><Users size={12} /> 그룹 {g.name}</span>)}</div></div>}
                  {canMove && targets.length > 0 && <div className="act"><button type="button" data-kdn-bare className="mvb" onClick={() => { setMoveSid(sid); setMoveTo(toF && targets.includes(toF) ? toF : 0); setOpenSid(""); }}><ArrowLeftRight size={13} /> 이 학생 옮기기</button></div>}
                </div></td></tr>}
                {openSid === sid && openKind === "memo" && <tr className="sub"><td colSpan={cols}><div className="panel2 memo">
                  <div className="ph"><b>메모</b><small>{(item.memos || []).length ? `${(item.memos || []).length}개` : "아직 없어요"}</small>
                    {cs.length > 0 && <button type="button" data-kdn-bare className={`cmb${same.length ? " hot" : ""}`} onClick={() => openPanel(sid, "combo", false)} title={cs.map(c => `${nameOf(c.other)}(${placement.students[c.other]?.cls || "?"}반)`).join("\n")}>조합 상대 {cs.length}{same.length ? " · 같은 반" : ""}</button>}</div>
                  <Memos item={item} me={me} onAdd={t => addMemo("students", sid, t)} onRemove={at => removeMemo("students", sid, at)} placeholder={`${s.name || ""} 학생에 대한 의견`} />
                </div></td></tr>}
                {openSid === sid && openKind === "combo" && <tr className="sub"><td colSpan={cols}><div className="panel2">
                  <ComboPicker sid={sid} placement={placement} combos={cs} mine={(item.combos || []).filter(c => c.byId === me.id).map(c => c.with)} theirsMine={cs.map(c => c.other).filter(o => (review.students[o]?.combos || []).some(c => c.with === sid && c.byId === me.id))} nameOf={nameOf} onAdd={o => addCombo(sid, o)} onRemove={o => removeCombo(sid, o)} />
                </div></td></tr>}
                {moveSid === sid && <tr className="sub"><td colSpan={cols}><MovePanel placement={placement} sid={sid} to={moveTo} setTo={setMoveTo} summary={summary} nameOf={nameOf} genderOf={genderOf} missSet={missSet} pairs={[...checked, ...comboPairs]} flagsOf={x => STUDENT_FLAGS.filter(f => (review.students[x]?.marks?.[f.key] || []).length)} onMove={doMove} onClose={() => setMoveSid("")} /></td></tr>}
              </React.Fragment>; })}</tbody>
            </table></div>
            {!list.length && <p className="kpl-nil">{toF ? (allView ? `${toF}반으로 옮길 수 있는 학생이 없어요.` : `${curTab}반에서 ${toF}반으로 옮길 수 있는 학생이 없어요.`) : activeF ? "고른 필터에 맞는 학생이 없어요."  : "찾는 학생이 없어요."}</p>}
          </section>
        </div>
      </>;
    })()}
    {curView === "check" && <>
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
            {canMove && s.cls && s.status === "same" && <button type="button" data-kdn-bare className="go" onClick={() => { setView("roster"); setTab(s.cls); setFind(""); setMoveSid(s.sid); setMoveTo(0); }}>옮기러 가기 <ArrowRight size={12} /></button>}</header>
          <ul>{[...s.items].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)).map(i => <li key={i.other} className={i.status}><span className={`lv t-${LEVEL_INFO[i.level]?.tone || "low"}`}>{i.level}</span><b>{nameOf(i.other)}</b><small>{oldLabel(i.other)}{i.otherCls ? ` → ${i.otherCls}반` : ""}</small><em>{STATUS[i.status].label}</em></li>)}</ul>
        </article>; })}</div>
        : <table className="kpl-pairs"><thead><tr><th>분리 등급</th><th>학생</th><th>학생</th><th>결과</th></tr></thead><tbody>{checked.filter(p => !filter || p.status === filter).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status)).map(p => <tr key={`${p.a}|${p.b}`} className={p.status}>
          <td><span className={`lv t-${LEVEL_INFO[p.level]?.tone || "low"}`}>{p.level}</span></td>
          <td><b>{nameOf(p.a)}</b> <small>{oldLabel(p.a)} → {p.ca ? `${p.ca}반` : "?"}</small></td>
          <td><b>{nameOf(p.b)}</b> <small>{oldLabel(p.b)} → {p.cb ? `${p.cb}반` : "?"}</small></td>
          <td><span className={`st ${STATUS[p.status].tone}`}>{STATUS[p.status].label}</span></td></tr>)}</tbody></table>}
      {!checked.length && <p className="kpl-nil">입력된 분리희망이 없어요. 분리희망학생 탭에서 입력해요.</p>}
    </>}

    {curView === "moves" && <>
      <div className="kpl-sum">
        <div><small>이동</small><b>{placement.moves.length}</b></div>
        <div><small>옮긴 학생</small><b>{Object.values(placement.students).filter(s => s.cls !== s.orig).length}</b></div>
        <div className={count("same") ? "bad" : "good"}><small>분리 미반영</small><b>{count("same")}</b></div>
        <div><small>반 인원</small><b className="sm">{Math.min(...summary.map(s => s.n))}~{Math.max(...summary.map(s => s.n))}명</b></div>
      </div>
      <table className="kpl-pairs kpl-csum"><thead><tr><th>반</th><th>처음</th><th>지금</th><th>남</th><th>여</th><th>받은 학생</th><th>보낸 학생</th><th>분리 미반영</th><th>원반 과목</th></tr></thead><tbody>{summary.map(s => { const miss = Object.entries(placement.students).filter(([id, x]) => x.cls === s.cls && missSet.has(id)).length; return <tr key={s.cls}>
        <td className="c"><button type="button" data-kdn-bare className="lnk" onClick={() => { setView("roster"); setTab(s.cls); setFind(""); }}>{s.cls}반</button></td><td className="c">{s.orig}</td><td className={`c${s.n !== s.orig ? " chg" : ""}`}><b>{s.n}</b>{s.n !== s.orig ? <small> ({s.n > s.orig ? "+" : ""}{s.n - s.orig})</small> : null}</td><td className="c">{s.m}</td><td className="c">{s.f}</td><td className="c">{s.inn || ""}</td><td className="c">{s.out || ""}</td><td className="c">{miss ? <span className="st bad">{miss}</span> : ""}</td><td className="ob">{(placement.classOb?.[s.cls] || []).join(", ")}</td></tr>; })}</tbody></table>
      <h4 className="kpl-h">이동 내역</h4>
      {placement.moves.length ? <table className="kpl-pairs kpl-mvt"><thead><tr><th>시각</th><th>학생</th><th>옮김</th><th>맞바꾼 학생</th><th>옮긴 사람</th><th /></tr></thead><tbody>{[...placement.moves].reverse().map(m => <tr key={m.id}>
        <td className="c">{fmt(m.at)}</td><td><b>{nameOf(m.sid)}</b> <small>{oldLabel(m.sid)}</small></td><td className="c"><b>{m.from}반 → {m.to}반</b></td><td>{m.swap ? <><b>{nameOf(m.swap)}</b> <small>{m.to}반 → {m.from}반</small></> : <small>-</small>}</td><td className="c">{m.by}</td>
        <td className="c">{(canManage || m.by === me.name) && <button type="button" data-kdn-bare className="undo" onClick={() => window.confirm("이 이동을 되돌릴까요?") && doUndo(m.id)}><RotateCcw size={13} /> 되돌리기</button>}</td></tr>)}</tbody></table> : <p className="kpl-nil">아직 옮긴 학생이 없어요. 반별 명단에서 '이동'으로 옮겨요.</p>}
    </>}
  </div>;
}

// 조합 우려 상대 고르기: 이름·구반-번호로 찾아 추가, 같은 새 반이면 경고
function ComboPicker({ sid, placement, combos, mine, theirsMine = [], nameOf, onAdd, onRemove }) {
  const [q, setQ] = React.useState("");
  const me = placement.students[sid];
  const myCls = Number(me?.cls);
  const partnerIds = new Set(combos.map(c => c.other));
  const removable = id => mine.includes(id) || theirsMine.includes(id);
  const sameClass = Object.entries(placement.students).filter(([id, x]) => id !== sid && Number(x.cls) === myCls).sort((a, b) => (a[1].no || 99) - (b[1].no || 99) || a[0].localeCompare(b[0]));
  const others = combos.filter(c => Number(placement.students[c.other]?.cls) !== myCls);
  const hits = q.trim() ? Object.entries(placement.students).filter(([id, x]) => id !== sid && Number(x.cls) !== myCls && !partnerIds.has(id) && (String(x.name || nameOf(id)).includes(q.trim()) || oldLabel(id).includes(q.trim()))).slice(0, 10) : [];
  const toggle = id => { if (partnerIds.has(id)) { if (removable(id)) onRemove(id); } else onAdd(id); };
  return <div className="kpl-combo">
    <div className="ch"><b>조합 우려 상대</b><small>같은 반이 되면 서로 영향이 큰 학생을 골라요. 같은 반이면 빨갛게 표시돼요.</small></div>
    <div className="part"><h6>우리 반({myCls}반) 학생에서 고르기 <small>눌러서 선택 · 다시 누르면 빼기</small></h6>
      <div className="pick">{sameClass.map(([id, x]) => { const on = partnerIds.has(id); return <button key={id} type="button" data-kdn-bare className={on ? "on" : ""} disabled={on && !removable(id)} title={on && !removable(id) ? "다른 선생님이 지정한 상대예요" : ""} onClick={() => toggle(id)}><b>{x.name || nameOf(id)}</b><small>{oldLabel(id)}</small></button>; })}</div></div>
    <div className="part"><h6>다른 반 학생 찾기 <small>이름 또는 구반-번호</small></h6>
      {others.length > 0 && <div className="list">{others.map(c => { const o = placement.students[c.other] || {}; return <span key={c.other} title={`표시: ${c.by.join(", ")}`}><b>{nameOf(c.other)}</b><small>{oldLabel(c.other)} · 지금 {o.cls || "?"}반</small>{removable(c.other) && <button type="button" data-kdn-bare onClick={() => onRemove(c.other)} aria-label="빼기"><X size={11} /></button>}</span>; })}</div>}
      <label className="find"><Search size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="예: 김○○, 4-15" /></label>
      {q.trim() && <div className="hits">{hits.length ? hits.map(([id, x]) => <button key={id} type="button" data-kdn-bare onClick={() => { onAdd(id); setQ(""); }}><b>{x.name || nameOf(id)}</b><small>{oldLabel(id)} · 지금 {x.cls}반</small></button>) : <p className="nil">다른 반에서 찾는 학생이 없어요.</p>}</div>}
    </div>
  </div>;
}

// 조합 그룹 만들기·고치기: 이름 · 메모 · 학생(우리 반 체크 + 다른 반 검색)
function GroupModal({ group, placement, nameOf, curTab, onSave, onRemove, onClose }) {
  const [g, setG] = React.useState({ name: group.name || "", memo: group.memo || "", members: group.members || [], id: group.id });
  const [q, setQ] = React.useState("");
  const has = id => g.members.includes(id);
  const toggle = id => setG(v => ({ ...v, members: has(id) ? v.members.filter(x => x !== id) : [...v.members, id] }));
  const mine = Object.entries(placement.students).filter(([, x]) => Number(x.cls) === Number(curTab)).sort((a, b) => (a[1].no || 99) - (b[1].no || 99) || a[0].localeCompare(b[0]));
  const hits = q.trim() ? Object.entries(placement.students).filter(([id, x]) => Number(x.cls) !== Number(curTab) && !has(id) && (String(x.name || nameOf(id)).includes(q.trim()) || oldLabel(id).includes(q.trim()))).slice(0, 10) : [];
  return <div className="kpl-modal" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && onClose()}><div className="box grp">
    <header><b><Users size={17} /> {group.id ? "조합 그룹 고치기" : "조합 그룹 만들기"}</b><button type="button" data-kdn-bare className="x" onClick={onClose} aria-label="닫기"><X size={16} /></button></header>
    <p className="lead">같은 반이 되면 서로 영향이 큰 학생들을 한 묶음으로 골라요. 그룹 학생이 한 반에 2명 이상이면 자동으로 알림이 떠요.</p>
    <label className="fld"><span>그룹 이름</span><input value={g.name} onChange={e => setG(v => ({ ...v, name: e.target.value }))} placeholder="예: 쉬는 시간 다툼 그룹" /></label>
    <label className="fld"><span>메모 <small>(선택)</small></span><input value={g.memo} onChange={e => setG(v => ({ ...v, memo: e.target.value }))} placeholder="예: 같은 반이면 수업 방해가 잦음" /></label>
    <div className="sel"><span>고른 학생 <b>{g.members.length}</b>명</span><div className="chips">{g.members.length ? g.members.map(id => <span key={id}>{nameOf(id)}<small>{placement.students[id]?.cls}반</small><button type="button" data-kdn-bare onClick={() => toggle(id)} aria-label="빼기"><X size={11} /></button></span>) : <em>아래에서 학생을 골라 주세요</em>}</div></div>
    <div className="part"><h6>{curTab}반 학생에서 고르기</h6><div className="pick">{mine.map(([id, x]) => <button key={id} type="button" data-kdn-bare className={has(id) ? "on" : ""} onClick={() => toggle(id)}><b>{x.name || nameOf(id)}</b><small>{oldLabel(id)}</small></button>)}</div></div>
    <div className="part"><h6>다른 반 학생 찾기</h6><label className="find"><Search size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="이름 또는 구반-번호" /></label>
      {q.trim() && <div className="pick">{hits.length ? hits.map(([id, x]) => <button key={id} type="button" data-kdn-bare onClick={() => { toggle(id); setQ(""); }}><b>{x.name || nameOf(id)}</b><small>{oldLabel(id)} · {x.cls}반</small></button>) : <p className="nil">찾는 학생이 없어요.</p>}</div>}</div>
    <footer>{onRemove && <button type="button" className="kpl-btn del" onClick={onRemove}><Trash2 size={14} /> 그룹 지우기</button>}<span className="sp" /><button type="button" className="kpl-btn" onClick={onClose}>취소</button><button type="button" className="kpl-btn pri" disabled={g.members.length < 2} onClick={() => onSave(g)}><Plus size={14} /> 저장</button></footer>
  </div></div>;
}

// 이동 패널: 갈 수 있는 반(인원 변화) → 그냥 옮기기 또는 맞바꿀 학생 고르기
function MovePanel({ placement, sid, to, setTo, summary, nameOf, genderOf, missSet, pairs, onMove, onClose, flagsOf = () => [] }) {
  const [q, setQ] = React.useState("");
  const [sameG, setSameG] = React.useState(false);
  const [safe, setSafe] = React.useState(false);
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
      {(() => {
        const myG = genderOf(sid);
        const rows = cands.map(x => { const bad = clash(x.sid, s.cls); const same = !!myG && genderOf(x.sid) === myG; return { ...x, bad, same, miss: missSet.has(x.sid), flags: flagsOf(x.sid), rec: same && !bad && !missSet.has(x.sid) }; })
          .sort((a, b) => (b.rec - a.rec) || (a.bad - b.bad) || (b.same - a.same) || a.sid.localeCompare(b.sid));
        const shown = rows.filter(x => (!sameG || x.same) && (!safe || !x.bad) && (!q.trim() || String(x.name || nameOf(x.sid)).includes(q.trim()) || oldLabel(x.sid).includes(q.trim())));
        return <>
          <div className="sh2"><b>맞바꾸기</b><small>{to}반에서 {s.cls}반으로 올 수 있는 학생 {cands.length}명 · <em>추천</em> = 같은 성별이고 걸리는 것 없음</small></div>
          {cands.length > 0 && <div className="stools"><label className="sq"><Search size={13} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="이름·구반-번호" /></label>
            <button type="button" data-kdn-bare aria-pressed={sameG} className={sameG ? "on" : ""} onClick={() => setSameG(v => !v)}>{sameG && <Check size={12} />}같은 성별({myG || "-"})만</button>
            <button type="button" data-kdn-bare aria-pressed={safe} className={safe ? "on" : ""} onClick={() => setSafe(v => !v)}>{safe && <Check size={12} />}분리·조합 걸리는 학생 빼기</button>
            <span className="n">{shown.length}명</span></div>}
          {cands.length ? (shown.length ? <div className="stbl"><table><thead><tr><th>이름</th><th className="c">구반-번호</th><th className="c">성별</th><th>학생 표시</th><th>주의</th><th className="c">맞바꾸기</th></tr></thead><tbody>
            {shown.map(x => <tr key={x.sid} className={x.bad ? "clash" : x.rec ? "rec" : ""}>
              <td className="nm"><b title={x.name || nameOf(x.sid)}>{x.name || nameOf(x.sid)}</b>{x.rec && <span className="rec">추천</span>}</td>
              <td className="c no">{oldLabel(x.sid)}</td>
              <td className="c"><i className={`g ${/남/.test(genderOf(x.sid)) ? "m" : "f"}`}>{genderOf(x.sid)}</i></td>
              <td className="flg">{x.flags.length ? x.flags.map(f => <span key={f.key} className={`tg t-${f.tone}`}>{f.label}</span>) : <span className="dash">-</span>}</td>
              <td className="wr">{x.bad || x.miss ? <>{x.bad && <em>{s.cls}반에 분리·조합 학생</em>}{x.miss && <em>분리희망 미반영</em>}</> : <span className="dash">-</span>}</td>
              <td className="c"><button type="button" data-kdn-bare className="swp" onClick={() => onMove(sid, to, x.sid)}><ArrowLeftRight size={13} /> 맞바꾸기</button></td>
            </tr>)}</tbody></table></div> : <p className="kpl-nil">조건에 맞는 학생이 없어요.</p>) : <p className="kpl-nil">원반 과목 때문에 {to}반에서 {s.cls}반으로 올 수 있는 학생이 없어요.</p>}
        </>;
      })()}
    </div> : <p className="kpl-nil">옮길 반을 골라 주세요.</p>}
  </div>;
}

function Memos({ item = {}, me, onAdd, onRemove, placeholder }) {
  const [text, setText] = React.useState("");
  const list = item.memos || [];
  const send = () => { if (!text.trim()) return; onAdd(text); setText(""); };
  return <div className="kpl-memos">
    {list.length > 0 && <ul>{list.map(m => <li key={`${m.byId}-${m.at}`}><b>{m.by}</b><small>{fmt(m.at)}</small>{m.byId === me.id && <button type="button" data-kdn-bare onClick={() => onRemove(m.at)} title="지우기"><X size={12} /></button>}<span>{m.text}</span></li>)}</ul>}
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
/* 필터 */
.kpl .fl.t-mv.on,.kpl-legend .fl.t-mv{border-color:#7c3aed;color:#6d28d9;background:#f5f3ff}.kpl .fl.mine.t-mv{background:#7c3aed;color:#fff}
.kpl-filter button.t-mv{color:#6d28d9;border-color:#ddd6fe}.kpl-filter button.t-mv.on{background:#7c3aed}
.kpl-grid th.fh.t-mv{color:#6d28d9}.kpl-grid .ck.on.t-mv{border-color:#7c3aed;background:#ede9fe;color:#6d28d9}.kpl-grid .ck.mine.t-mv{background:#7c3aed;color:#fff}
.kpl-students article.t-mv{border-left-color:#7c3aed}

.kpl-filter{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 10px;border-radius:12px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e5e9f0)}
.kpl-modal .box.prn{display:grid;gap:12px;width:min(460px,100%)}.kpl-modal .box.prn .t{display:flex;align-items:center;gap:8px;font-size:17px}
.kpl-modal .box.prn .opt{display:grid;gap:6px}.kpl-modal .box.prn .opt>small{font-size:12.5px;font-weight:800;color:var(--kdn-muted,#64748b)}
.kpl-modal .box.prn .seg{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:3px;border-radius:11px;background:var(--kdn-surface-2,#eef2f7)}.kpl-modal .box.prn .seg button{min-height:36px;border-radius:9px;border:0;background:transparent;font:inherit;font-weight:700;color:var(--kdn-muted,#64748b);cursor:pointer}.kpl-modal .box.prn .seg button.on{background:var(--kdn-surface,#fff);color:var(--kdn-ink,#111827);box-shadow:0 1px 3px rgba(15,23,42,.12)}
.kpl-modal .box.prn .cks{display:grid;gap:6px}.kpl-modal .box.prn .cks label{display:flex;align-items:center;gap:8px;font-size:14px}.kpl-modal .box.prn .cks input{width:16px;height:16px;accent-color:#2563eb}
.kpl-modal .box.prn p{margin:0;font-size:13px;color:var(--kdn-muted,#64748b)}.kpl-modal .box.prn .ft{display:flex;justify-content:flex-end;gap:8px}
.kpl-filter.multi{display:grid;gap:6px;padding:10px 12px}
.kpl-filter.multi .fhd{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px}.kpl-filter.multi .fhd b{font-size:14px}.kpl-filter.multi .fhd small{font-size:12px;color:var(--kdn-muted,#64748b)}
.kpl-filter.multi .fhd .cnt{margin-left:auto;padding:2px 10px;border-radius:99px;background:#2563eb;color:#fff;font-size:12.5px;font-weight:800}.kpl-filter.multi .fhd .cnt.mute{background:var(--kdn-surface-2,#eef2f7);color:var(--kdn-ink-soft,#334155)}
.kpl-filter.multi .fhd .reset{height:28px;padding:0 10px;font-size:12.5px;font-weight:800;color:#b91c1c;border-color:#fecaca}
.kpl-filter.multi .frow{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding-top:6px;border-top:1px dashed var(--kdn-line,#e5e9f0)}
.kpl-filter.multi .frow>small{flex:0 0 64px;font-size:12px;font-weight:800;color:var(--kdn-muted,#64748b)}
@media (max-width:560px){.kpl-filter.multi .frow>small{flex-basis:100%}}
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

/* ── 반별 명단 v3: 같은 크기 반 탭 · 현황 목록 · 표시 열 표 ── */
.kpl-ctabs2{display:grid;grid-template-columns:repeat(var(--n,10),minmax(0,1fr));gap:8px}
@media (max-width:1100px){.kpl-ctabs2{grid-template-columns:repeat(5,minmax(0,1fr))}}
@media (max-width:560px){.kpl-ctabs2{grid-template-columns:repeat(3,minmax(0,1fr))}}
.kpl-ctabs2 button{position:relative;display:grid;justify-items:center;align-content:start;gap:4px;min-width:0;padding:10px 6px 9px;border-radius:12px;border:1.5px solid var(--kdn-line,#d9dee7);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#111827);font:inherit;cursor:pointer}
.kpl-ctabs2 button b{font-size:16px;line-height:1.1}
.kpl-ctabs2 .n{font-size:13px;font-weight:800;color:var(--kdn-ink-soft,#334155);white-space:nowrap}
.kpl-ctabs2 .gbar{display:block;width:100%;max-width:72px;height:5px;border-radius:99px;background:#f9a8d4;overflow:hidden}.kpl-ctabs2 .gbar i{display:block;height:100%;background:#60a5fa}
.kpl-ctabs2 small{font-size:11.5px;color:var(--kdn-muted,#64748b);white-space:nowrap}
.kpl-ctabs2 .dot{position:absolute;top:-7px;right:-5px;display:grid;place-items:center;min-width:20px;height:20px;padding:0 5px;border-radius:99px;background:#dc2626;color:#fff;font-style:normal;font-size:11px;font-weight:800;box-shadow:0 0 0 2px var(--kdn-surface,#fff)}
.kpl-ctabs2 button.on{border-color:var(--kdn-accent,#2563eb);background:color-mix(in srgb,var(--kdn-accent,#2563eb) 8%,var(--kdn-surface,#fff));box-shadow:0 0 0 3px color-mix(in srgb,var(--kdn-accent,#2563eb) 16%,transparent)}
.kpl-split2{display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px;align-items:start}
@media (max-width:1000px){.kpl-split2{grid-template-columns:1fr}}
.kpl-side2{position:sticky;top:76px;display:grid;border-radius:16px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff);overflow:hidden}
@media (max-width:1000px){.kpl-side2{position:static}}
.kpl-side2>header{display:flex;align-items:baseline;justify-content:space-between;padding:14px 16px 10px}.kpl-side2>header b{font-size:19px}.kpl-side2>header span{font-size:15px;font-weight:800;color:var(--kdn-ink-soft,#334155)}
.kpl-side2 .gender{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px;padding:0 16px 12px;font-size:12.5px;font-weight:800}
.kpl-side2 .gender .m{color:#1d4ed8}.kpl-side2 .gender .f{color:#be185d}
.kpl-side2 .gender .bar{height:8px;border-radius:99px;background:#f9a8d4;overflow:hidden}.kpl-side2 .gender .bar i{display:block;height:100%;background:#60a5fa}
.kpl-side2 .stat-list{border-top:1px solid var(--kdn-line,#eef1f5)}
.kpl-side2 .st-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 16px;border-bottom:1px solid var(--kdn-line,#eef1f5);font-size:13.5px}
.kpl-side2 .st-row span{color:var(--kdn-ink-soft,#334155)}.kpl-side2 .st-row b{font-size:14.5px;font-variant-numeric:tabular-nums;white-space:nowrap}
.kpl-side2 .st-row.warn{background:#fffbeb}.kpl-side2 .st-row.warn b{color:#b45309}
.kpl-side2 .st-row.bad{background:#fef2f2}.kpl-side2 .st-row.bad b{color:#b91c1c}
.kpl-side2 .st-row.info b{color:#1d4ed8}
.kpl-side2 .blk{display:grid;gap:8px;padding:12px 16px;border-bottom:1px solid var(--kdn-line,#eef1f5)}.kpl-side2 .blk:last-child{border-bottom:0}
.kpl-side2 h5{margin:0;font-size:12.5px;font-weight:800;color:var(--kdn-muted,#64748b)}.kpl-side2 h5 small{font-weight:600;margin-left:4px}
.kpl-side2 .ob{display:flex;flex-wrap:wrap;gap:4px}.kpl-side2 .ob span{padding:3px 10px;border-radius:99px;background:#ede9fe;color:#6d28d9;font-size:12.5px;font-weight:700}
.kpl-side2 .nil{margin:0;font-size:13px;color:var(--kdn-muted,#64748b)}
.kpl-side2 .chk{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.kpl-side2 .chk button{display:grid;grid-template-columns:20px minmax(0,1fr);column-gap:8px;align-items:center;width:100%;padding:6px 8px;border:0;border-radius:8px;background:transparent;text-align:left;font:inherit;font-size:13.5px;color:var(--kdn-ink,#111827);cursor:pointer}
.kpl-side2 .chk button:hover{background:var(--kdn-surface-2,#f4f6fa)}
.kpl-side2 .chk i{display:grid;place-items:center;width:18px;height:18px;border-radius:5px;border:1.5px solid #cbd5e1;font-style:normal;font-size:12px;font-weight:900;color:#fff}
.kpl-side2 .chk button.on i{border-color:#d97706}.kpl-side2 .chk button.mine i{background:#d97706;border-color:#d97706}
.kpl-side2 .chk button.on span{font-weight:800;color:#b45309}
.kpl-side2 .chk small{grid-column:2;font-size:11.5px;color:var(--kdn-muted,#64748b)}
.kpl-side2 .kpl-memos .new{flex-direction:column}.kpl-side2 .kpl-memos .new input{flex:none;height:38px}.kpl-side2 .kpl-memos .new .kpl-btn{align-self:flex-end;min-height:32px}
.kpl-tbl{display:grid;gap:10px;min-width:0}
.kpl-tbl .kpl-find{max-width:none}
.kpl-tbl .scroll{overflow-x:auto;border-radius:14px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff)}
.kpl-grid{width:100%;border-collapse:collapse;font-size:14px;min-width:820px}
.kpl-grid th{position:sticky;top:0;z-index:1;padding:9px 8px;background:var(--kdn-surface-2,#f6f8fb);border-bottom:1px solid var(--kdn-line,#e2e8f0);font-size:12.5px;font-weight:800;color:var(--kdn-ink-soft,#334155);text-align:left;white-space:nowrap}
.kpl-grid th.fh{width:84px}.kpl-grid th.fh small{display:inline-block;margin-left:4px;padding:0 6px;border-radius:99px;background:var(--kdn-surface,#fff);font-size:11px}
.kpl-grid th.fh.t-good{color:#15803d}.kpl-grid th.fh.t-warn{color:#b45309}.kpl-grid th.fh.t-info{color:#1d4ed8}.kpl-grid th.fh.t-bad{color:#b91c1c}
.kpl-grid td{padding:7px 8px;border-bottom:1px solid var(--kdn-line,#eef1f5);vertical-align:middle;height:46px}
.kpl-grid tbody tr:hover>td{background:color-mix(in srgb,var(--kdn-accent,#2563eb) 3%,var(--kdn-surface,#fff))}
.kpl-grid tr.miss>td{background:#fef2f2}.kpl-grid tr.active>td{background:color-mix(in srgb,var(--kdn-accent,#2563eb) 7%,var(--kdn-surface,#fff))}
.kpl-grid .c{text-align:center}.kpl-grid td.no{font-size:13px;font-weight:700;color:var(--kdn-muted,#64748b);font-variant-numeric:tabular-nums;width:76px}
.kpl-grid td.nm{white-space:nowrap}.kpl-grid td.nm b{font-size:14.5px}
.kpl-grid .g{font-style:normal;display:inline-grid;place-items:center;width:20px;height:20px;margin-left:6px;border-radius:6px;font-size:11px;font-weight:800;vertical-align:1px}.kpl-grid .g.m{background:#dbeafe;color:#1d4ed8}.kpl-grid .g.f{background:#fce7f3;color:#be185d}
.kpl-grid td.nm .nmb{border:0;background:transparent;padding:0;font:inherit;font-size:14.5px;font-weight:800;color:var(--kdn-ink,#111827);cursor:pointer;text-decoration:underline dotted #94a3b8;text-underline-offset:4px}.kpl-grid td.nm .nmb:hover,.kpl-grid td.nm .nmb.on{color:#1d4ed8;text-decoration-color:#1d4ed8}
.kpl-grid td button.st{border:0;cursor:pointer;font:inherit}
.kpl-grid .panel2.sepp{padding:12px 14px;border-radius:12px;border:1.5px solid #f59e0b;background:#fffdf5;text-align:left}
.kpl-grid .panel2.sepp .ph{display:flex;align-items:baseline;gap:8px}.kpl-grid .panel2.sepp .ph b{font-size:15.5px}.kpl-grid .panel2.sepp .ph small{font-size:12.5px;color:var(--kdn-muted,#64748b)}.kpl-grid .panel2.sepp .ph .x{margin-left:auto;border:0;background:transparent;cursor:pointer;color:var(--kdn-muted,#64748b)}
.kpl-grid .panel2.sepp .sec{display:grid;gap:6px}.kpl-grid .panel2.sepp h6{margin:0;font-size:13.5px;font-weight:800}.kpl-grid .panel2.sepp h6 small{font-weight:600;color:var(--kdn-muted,#64748b);margin-left:6px}
.kpl-grid .sept{width:100%;border-collapse:collapse;background:var(--kdn-surface,#fff);border:1px solid #cbd5e1!important;border-radius:10px;overflow:hidden;font-size:14px}
.kpl-grid .sept th{position:static;padding:7px 10px!important;background:#f1f5f9;font-size:12.5px;border-bottom:1.5px solid #94a3b8!important}.kpl-grid .sept td{height:auto!important;padding:7px 10px!important}.kpl-grid .sept th+th,.kpl-grid .sept td+td{border-left:1px solid #e2e8f0!important}
.kpl-grid .sept tr.same td{background:#fef2f2}.kpl-grid .sept td.rs{font-size:13px;color:var(--kdn-ink-soft,#334155);white-space:normal}
.kpl-grid .sept .lv{padding:1px 8px;border-radius:6px;background:#fef3c7;color:#92400e;font-size:12px;font-weight:800;white-space:nowrap}
.kpl-grid .panel2.sepp .chips{display:flex;flex-wrap:wrap;gap:6px}.kpl-grid .panel2.sepp .chips span{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:99px;border:1px solid #fde68a;background:#fffbeb;color:#92400e;font-size:13px;font-weight:700}.kpl-grid .panel2.sepp .chips span.hot{border-color:#fca5a5;background:#fee2e2;color:#b91c1c}.kpl-grid .panel2.sepp .chips span.grp{border-color:#ddd6fe;background:#f5f3ff;color:#6d28d9}
.kpl-grid .panel2.sepp .act{display:flex;justify-content:flex-end}.kpl-grid .panel2.sepp .act .mvb{display:inline-flex;align-items:center;gap:4px;height:34px;padding:0 14px;border-radius:9px;border:1px solid #93c5fd;background:var(--kdn-surface,#fff);color:#1d4ed8;font:inherit;font-weight:800;cursor:pointer}
.kpl-grid .mvbadge{display:inline-flex;align-items:center;gap:4px;margin-left:8px;padding:2px 9px;border-radius:7px;background:#dbeafe;color:#1d4ed8;font-size:12px;font-weight:800;white-space:nowrap}.kpl-grid .mvbadge.sw{background:#ede9fe;color:#6d28d9}.kpl-grid .mvbadge b{font-weight:900;text-decoration:underline;text-underline-offset:2px}
.kpl-grid tr.moved td{background:#f5f3ff}.kpl-grid tr.moved td.nm{box-shadow:inset 4px 0 0 #7c3aed}
.kpl-mvlog{border:1.5px solid #c4b5fd;border-radius:12px;background:#faf8ff;overflow:hidden}
.kpl-mvlog summary{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:10px 14px;cursor:pointer;color:#5b21b6;list-style:none}.kpl-mvlog summary::-webkit-details-marker{display:none}.kpl-mvlog summary b{font-size:14.5px}.kpl-mvlog summary small{font-size:12.5px;color:#6b7280}
.kpl-mvlog ul{list-style:none;margin:0;padding:0;border-top:1px solid #ddd6fe}
.kpl-mvlog li{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:9px 14px;border-top:1px solid #ede9fe;font-size:13.5px;background:var(--kdn-surface,#fff)}.kpl-mvlog li:first-child{border-top:0}
.kpl-mvlog li .out{color:#b91c1c}.kpl-mvlog li .in{color:#15803d}.kpl-mvlog li b{color:var(--kdn-ink,#111827);font-weight:800;margin:0 2px}
.kpl-mvlog li .ar{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:99px;background:#ede9fe;color:#6d28d9}
.kpl-mvlog li em{font-style:normal;padding:1px 8px;border-radius:6px;background:#ede9fe;color:#6d28d9;font-size:11.5px;font-weight:800}.kpl-mvlog li em.one{background:#e0f2fe;color:#0369a1}
.kpl-mvlog li small{margin-left:auto;font-size:12px;color:#6b7280}
.kpl-grid .mvtag{margin-left:6px;padding:1px 7px;border-radius:99px;background:#dbeafe;color:#1d4ed8;font-size:11px;font-weight:800}
.kpl-grid .dash{color:#cbd5e1}
.kpl-grid td.fc{width:84px}
.kpl-grid .ck{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:8px;border:1.5px solid #d6dce5;background:var(--kdn-surface,#fff);color:#fff;font:inherit;font-size:13px;font-weight:900;cursor:pointer;vertical-align:middle}
.kpl-grid .ck:hover{border-color:#94a3b8}
.kpl-grid .ck.on.t-good{border-color:#16a34a;background:#dcfce7;color:#15803d}.kpl-grid .ck.on.t-warn{border-color:#d97706;background:#fef3c7;color:#b45309}.kpl-grid .ck.on.t-info{border-color:#2563eb;background:#dbeafe;color:#1d4ed8}.kpl-grid .ck.on.t-bad{border-color:#dc2626;background:#fee2e2;color:#b91c1c}
.kpl-grid .ck.mine.t-good{background:#16a34a;color:#fff}.kpl-grid .ck.mine.t-warn{background:#d97706;color:#fff}.kpl-grid .ck.mine.t-info{background:#2563eb;color:#fff}.kpl-grid .ck.mine.t-bad{background:#dc2626;color:#fff}
.kpl-grid .cmb{display:block;margin:3px auto 0;padding:0 6px;border:0;border-radius:6px;background:transparent;color:#b45309;font:inherit;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap}.kpl-grid .cmb.hot{background:#dc2626;color:#fff}
.kpl-grid .ic{display:inline-flex;align-items:center;gap:3px;height:28px;padding:0 8px;border-radius:8px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-muted,#64748b);cursor:pointer}.kpl-grid .ic.has{color:#1d4ed8;border-color:#93c5fd}.kpl-grid .ic.on{background:var(--kdn-ink,#111827);color:#fff;border-color:var(--kdn-ink,#111827)}.kpl-grid .ic small{font-size:11px;font-weight:800}
.kpl-grid .mvb{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 10px;border-radius:8px;border:1px solid #93c5fd;background:var(--kdn-surface,#fff);color:#1d4ed8;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;white-space:nowrap}.kpl-grid .mvb.on{background:#2563eb;color:#fff}.kpl-grid .mvb:disabled{opacity:.35;cursor:not-allowed}
.kpl-grid tr.sub>td{height:auto;padding:12px 14px;background:var(--kdn-surface-2,#f8fafc)}
.kpl-grid .panel2{display:grid;gap:10px;text-align:left}
.kpl-grid .panel2.memo{padding:12px 14px;border-radius:12px;border:1.5px solid var(--kdn-accent,#2563eb);background:color-mix(in srgb,var(--kdn-accent,#2563eb) 4%,var(--kdn-surface,#fff))}
.kpl-grid .panel2.memo .ph{display:flex;align-items:center;gap:8px}.kpl-grid .panel2.memo .ph b{font-size:15px;font-weight:800}.kpl-grid .panel2.memo .ph small{font-size:12.5px;color:var(--kdn-muted,#64748b)}.kpl-grid .panel2.memo .ph .cmb{margin:0 0 0 auto!important}
.kpl-grid .panel2.memo .kpl-memos li{font-size:14.5px;padding:8px 12px}

/* 맞바꾸기 후보: 이름 크게, 정보·경고 줄 나눔 */
.kpl-move .sh2{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px}.kpl-move .sh2 b{font-size:14.5px}.kpl-move .sh2 small{font-size:12.5px;color:var(--kdn-muted,#64748b)}.kpl-move .sh2 em{font-style:normal;padding:0 6px;border-radius:5px;background:#dcfce7;color:#15803d;font-weight:800}
.kpl-move .stools{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.kpl-move .stools .sq{display:flex;align-items:center;gap:6px;height:32px;padding:0 10px;border-radius:9px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-muted,#64748b)}.kpl-move .stools .sq input{width:130px;border:0;outline:0;background:transparent;font:inherit;font-size:13.5px;color:var(--kdn-ink,#111827)}
.kpl-move .stools button{display:inline-flex;align-items:center;gap:4px;height:32px;padding:0 12px;border-radius:99px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-ink-soft,#334155);font:inherit;font-size:13px;font-weight:700;cursor:pointer}.kpl-move .stools button.on{background:var(--kdn-ink,#111827);border-color:transparent;color:#fff}
.kpl-move .stools .n{margin-left:auto;font-size:12.5px;font-weight:800;color:var(--kdn-muted,#64748b)}
.kpl-move .stbl{max-height:400px;overflow:auto;border:1px solid #cbd5e1!important;border-radius:12px;background:var(--kdn-surface,#fff)}
.kpl-move .stbl table{width:100%;border-collapse:collapse;font-size:14px}
.kpl-move .stbl th{position:sticky;top:0;z-index:1;padding:8px 10px;background:#f1f5f9;border-bottom:1.5px solid #94a3b8!important;font-size:12.5px;font-weight:800;color:#334155;text-align:left;white-space:nowrap}
.kpl-move .stbl td{padding:8px 10px;border-bottom:1px solid #e2e8f0!important;vertical-align:middle}
.kpl-move .stbl th+th,.kpl-move .stbl td+td{border-left:1px solid #e2e8f0!important}
.kpl-move .stbl .c{text-align:center}.kpl-move .stbl td{height:auto!important;padding:7px 10px!important}.kpl-move .stbl th{padding:8px 10px!important}.kpl-move .stbl tbody tr:last-child td{border-bottom:0!important}.kpl-move .stbl tbody tr:hover td{background:#f8fafc}
.kpl-move .stbl td.nm{min-width:120px}.kpl-move .stbl td.nm b{font-size:14.5px;font-weight:800;color:var(--kdn-ink,#111827)}.kpl-move .stbl td.nm .rec{margin-left:6px;padding:1px 7px;border-radius:6px;background:#dcfce7;color:#15803d;font-size:11.5px;font-weight:800;white-space:nowrap}
.kpl-move .stbl td.no{font-variant-numeric:tabular-nums;font-weight:700;color:#475569;white-space:nowrap}
.kpl-move .stbl .g{font-style:normal;display:inline-grid;place-items:center;width:22px;height:22px;border-radius:6px;font-size:12px;font-weight:800}.kpl-move .stbl .g.m{background:#dbeafe;color:#1d4ed8}.kpl-move .stbl .g.f{background:#fce7f3;color:#be185d}
.kpl-move .stbl .tg{display:inline-block;margin:1px 4px 1px 0;padding:1px 7px;border-radius:6px;font-size:11.5px;font-weight:800;white-space:nowrap;background:#f1f5f9;color:#334155}
.kpl-move .stbl .tg.t-good{background:#dcfce7;color:#15803d}.kpl-move .stbl .tg.t-warn{background:#fef3c7;color:#b45309}.kpl-move .stbl .tg.t-info{background:#dbeafe;color:#1d4ed8}.kpl-move .stbl .tg.t-bad{background:#fee2e2;color:#b91c1c}.kpl-move .stbl .tg.t-mv{background:#ede9fe;color:#6d28d9}
.kpl-move .stbl td.wr em{display:inline-block;margin:1px 4px 1px 0;padding:1px 8px;border-radius:6px;background:#fee2e2;color:#b91c1c;font-style:normal;font-size:12px;font-weight:800;white-space:nowrap}
.kpl-move .stbl .dash{color:#cbd5e1}
.kpl-move .stbl tr.clash td{background:#fff5f5}.kpl-move .stbl tr.rec td.nm{box-shadow:inset 3px 0 0 #16a34a}
.kpl-move .stbl .swp{display:inline-flex;align-items:center;gap:4px;height:32px;padding:0 12px;border-radius:9px;border:1px solid #93c5fd;background:var(--kdn-surface,#fff);color:#1d4ed8;font:inherit;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap}.kpl-move .stbl .swp:hover{background:#2563eb;border-color:#2563eb;color:#fff}
.kpl-move .stbl tr.clash .swp{border-color:#fca5a5;color:#b91c1c}.kpl-move .stbl tr.clash .swp:hover{background:#dc2626;border-color:#dc2626;color:#fff}
.kpl-move ul{grid-template-columns:repeat(auto-fill,minmax(240px,1fr))!important;gap:8px!important;max-height:360px!important}
.kpl-move li{align-items:center!important;padding:10px 10px 10px 14px!important;border-radius:12px!important;min-height:62px}
.kpl-move li .who{display:grid;gap:3px;min-width:0}
.kpl-move li .who>b{font-size:15px;font-weight:800;line-height:1.3;color:var(--kdn-ink,#111827);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kpl-move li .meta{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--kdn-muted,#64748b);font-variant-numeric:tabular-nums}
.kpl-move li .g{font-style:normal;display:inline-grid;place-items:center;width:20px;height:20px;border-radius:6px;font-size:11px;font-weight:800}.kpl-move li .g.m{background:#dbeafe;color:#1d4ed8}.kpl-move li .g.f{background:#fce7f3;color:#be185d}
.kpl-move li .warns{display:flex;flex-wrap:wrap;gap:4px}.kpl-move li .warns em{font-style:normal;padding:1px 8px;border-radius:99px;background:#fee2e2;color:#b91c1c;font-size:11.5px;font-weight:800}
.kpl-move li .swp{flex:none;display:inline-flex;align-items:center;gap:4px;height:32px;padding:0 12px;border-radius:9px;border:1px solid #93c5fd;background:var(--kdn-surface,#fff);color:#1d4ed8;font:inherit;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap}
.kpl-move li .swp:hover{background:#2563eb;border-color:#2563eb;color:#fff}
.kpl-move li.clash .swp{border-color:#fca5a5;color:#b91c1c}.kpl-move li.clash .swp:hover{background:#dc2626;border-color:#dc2626;color:#fff}

/* ── 표 구분선(사이트 공통 스타일보다 우선) ── */
.kpl-grid{border-collapse:separate!important;border-spacing:0!important}
.kpl-grid th,.kpl-grid td{border-bottom:1px solid #e3e7ee!important}
.kpl-grid tbody tr:last-child>td{border-bottom:0!important}
.kpl-grid th:not(:last-child),.kpl-grid td:not(:last-child){border-right:1px solid #f0f2f6!important}
.kpl-grid th.fh,.kpl-grid td.fc{background-clip:padding-box}
.kpl-grid thead th{border-bottom:2px solid #d5dbe5!important}
.kpl-grid tr.sub>td{border-right:0!important}
.kpl-grid tbody tr:nth-child(even):not(.sub):not(.miss):not(.active)>td{background:#fbfcfe}
/* ── 반 현황 ── */
.kpl-side2 .stat-list{padding:4px 0}
.kpl-side2 .stat-list h6{margin:8px 16px 2px;font-size:11.5px;font-weight:800;letter-spacing:.02em;color:var(--kdn-muted,#64748b)}
.kpl-side2 .st-row{display:grid!important;grid-template-columns:10px minmax(0,1fr) auto;gap:10px!important;padding:8px 16px!important;border-bottom:0!important;border-radius:0}
.kpl-side2 .st-row+.st-row{box-shadow:inset 0 1px 0 #f1f3f7}
.kpl-side2 .st-row>i{width:8px;height:8px;border-radius:50%;background:#cbd5e1}
.kpl-side2 .st-row>i.ic-good{background:#16a34a}.kpl-side2 .st-row>i.ic-info{background:#2563eb}.kpl-side2 .st-row>i.ic-bad{background:#dc2626}.kpl-side2 .st-row>i.ic-warn{background:#d97706}.kpl-side2 .st-row>i.ic-mv{background:#7c3aed}
.kpl-side2 .st-row span{font-size:13.5px}
.kpl-side2 .st-row b{font-size:17px!important;font-weight:800;text-align:right;min-width:42px}.kpl-side2 .st-row b small{font-size:12px;font-weight:700;margin-left:2px;color:var(--kdn-muted,#64748b)}
.kpl-side2 .st-row.warn{background:#fffbeb!important}.kpl-side2 .st-row.bad{background:#fef2f2!important}
.kpl-side2 .stat-list{border-bottom:1px solid var(--kdn-line,#eef1f5)}
/* ── 조합 우려 상대 고르기 ── */
.kpl-combo{gap:12px!important;padding:14px 16px!important;justify-items:stretch;text-align:left}
.kpl-combo .ch{display:grid;gap:2px}.kpl-combo .ch b{font-size:14.5px;color:#92400e}.kpl-combo .ch small{font-size:12.5px;color:#a16207}
.kpl-combo .part{display:grid;gap:8px;padding:10px 12px;border-radius:12px;background:var(--kdn-surface,#fff);border:1px solid #fde68a}
.kpl-combo h6{margin:0;font-size:13px;font-weight:800;color:var(--kdn-ink,#111827)}.kpl-combo h6 small{margin-left:6px;font-weight:600;color:var(--kdn-muted,#64748b)}
.kpl-combo .pick{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:6px}
.kpl-combo .pick button{display:grid;gap:1px;padding:7px 10px;border-radius:10px;border:1px solid var(--kdn-line,#dfe4ec);background:var(--kdn-surface,#fff);text-align:left;font:inherit;cursor:pointer}
.kpl-combo .pick button b{font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kpl-combo .pick button small{font-size:11.5px;color:var(--kdn-muted,#64748b)}
.kpl-combo .pick button:hover{border-color:#f59e0b}
.kpl-combo .pick button.on{background:#dc2626;border-color:#dc2626;color:#fff}.kpl-combo .pick button.on small{color:#fee2e2}
.kpl-combo .pick button:disabled{cursor:not-allowed;opacity:.85}
.kpl-combo .list>span{border-color:#e5e7eb!important}
.kpl-combo .find{height:38px!important;border-color:var(--kdn-line,#dfe4ec)!important;color:var(--kdn-muted,#64748b)!important}
.kpl-combo .hits .nil{margin:0;font-size:13px;color:var(--kdn-muted,#64748b)}

.kpl-views.four{grid-template-columns:repeat(4,minmax(0,1fr))}
@media (max-width:760px){.kpl-views.four{grid-template-columns:repeat(2,minmax(0,1fr))}}
.kpl-empty{margin:0;padding:28px;border-radius:16px;border:1px dashed var(--kdn-line,#cbd5e1);text-align:center;font-size:14px;color:var(--kdn-muted,#64748b)}

/* 조합 그룹 */
.kpl-tbl .tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.kpl-tbl .tools .kpl-find{flex:1 1 280px}
.kpl-btn.grp-add{border-color:#fcd34d;color:#b45309}.kpl-btn.grp-add:hover{background:#fffbeb}
.kpl-groups{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.kpl-groups>small{font-size:12px;font-weight:800;color:var(--kdn-muted,#64748b);margin-right:2px}
.kpl-groups button{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:99px;border:1px solid #fcd34d;background:#fffbeb;color:#92400e;font:inherit;font-size:13px;cursor:pointer}
.kpl-groups button span{font-size:12px;font-weight:700;color:#a16207}
.kpl-groups button.hot{border-color:#dc2626;background:#fef2f2;color:#b91c1c}.kpl-groups button.hot span{color:#b91c1c;font-weight:800}
.kpl-grid .gtag{display:inline-block;margin-left:4px;padding:0 5px;border-radius:5px;background:#fef3c7;color:#92400e;font-size:10.5px;font-weight:800;vertical-align:middle}.kpl-grid .gtag.hot{background:#dc2626;color:#fff}
.kpl-modal{position:fixed;inset:0;z-index:1100;display:grid;place-items:center;padding:16px;background:rgba(15,18,25,.48)}
.kpl-modal .box{width:min(620px,100%);max-height:calc(100vh - 32px);overflow:auto;display:grid;gap:12px;padding:20px 22px;border-radius:18px;background:var(--kdn-surface,#fff);color:var(--kdn-ink,#111827);box-shadow:0 24px 60px rgba(15,18,25,.3)}
.kpl-modal header{display:flex;align-items:center}.kpl-modal header b{flex:1;display:flex;align-items:center;gap:6px;font-size:17px}
.kpl-modal .x{display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:var(--kdn-muted,#64748b);cursor:pointer}
.kpl-modal .lead{margin:0;font-size:13.5px;color:var(--kdn-ink-soft,#334155);line-height:1.6}
.kpl-modal .fld{display:grid;gap:4px}.kpl-modal .fld span{font-size:12.5px;font-weight:800;color:var(--kdn-muted,#64748b)}.kpl-modal .fld input{height:40px;padding:0 12px;border-radius:10px;border:1px solid var(--kdn-line,#d5dbe3);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#111827);font:inherit;font-size:14px}
.kpl-modal .sel{display:grid;gap:6px;padding:10px 12px;border-radius:12px;background:#fffbeb;border:1px solid #fde68a}.kpl-modal .sel>span{font-size:13px;font-weight:700;color:#92400e}
.kpl-modal .sel .chips{display:flex;flex-wrap:wrap;gap:6px}.kpl-modal .sel .chips>span{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 6px 0 12px;border-radius:99px;background:var(--kdn-surface,#fff);border:1px solid #fde68a;font-size:13px;font-weight:700}
.kpl-modal .sel .chips small{font-size:11.5px;color:var(--kdn-muted,#64748b);font-weight:600}.kpl-modal .sel .chips button{display:grid;place-items:center;width:20px;height:20px;border:0;border-radius:50%;background:transparent;color:var(--kdn-muted,#64748b);cursor:pointer}
.kpl-modal .sel em{font-style:normal;font-size:13px;color:#a16207}
.kpl-modal .part{display:grid;gap:8px}.kpl-modal h6{margin:0;font-size:13px;font-weight:800}
.kpl-modal .pick{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px}
.kpl-modal .pick button{display:grid;gap:1px;padding:7px 10px;border-radius:10px;border:1px solid var(--kdn-line,#dfe4ec);background:var(--kdn-surface,#fff);text-align:left;font:inherit;cursor:pointer}
.kpl-modal .pick button b{font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kpl-modal .pick button small{font-size:11.5px;color:var(--kdn-muted,#64748b)}
.kpl-modal .pick button.on{background:#d97706;border-color:#d97706;color:#fff}.kpl-modal .pick button.on small{color:#fef3c7}
.kpl-modal .find{display:flex;align-items:center;gap:6px;height:38px;padding:0 10px;border-radius:10px;border:1px solid var(--kdn-line,#d5dbe3);color:var(--kdn-muted,#64748b)}.kpl-modal .find input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:14px;color:var(--kdn-ink,#111827)}
.kpl-modal .nil{margin:0;font-size:13px;color:var(--kdn-muted,#64748b)}
.kpl-modal footer{display:flex;gap:8px;align-items:center}.kpl-modal footer .sp{flex:1}.kpl-modal .kpl-btn.del{color:#b91c1c;border-color:#fecaca}
.kpl-modal .box.alert{width:min(440px,100%);justify-items:start;border-top:6px solid #dc2626}
.kpl-modal .box.alert .ico{display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:#fee2e2;color:#b91c1c}
.kpl-modal .box.alert .t{font-size:18px;line-height:1.4}
.kpl-modal .ga{justify-self:stretch;display:grid;gap:3px;padding:10px 12px;border-radius:12px;background:#fef2f2;border:1px solid #fecaca}.kpl-modal .ga b{display:flex;align-items:center;gap:5px;font-size:14px;color:#b91c1c}.kpl-modal .ga span{font-size:14px;font-weight:700}.kpl-modal .ga small{font-size:12.5px;color:var(--kdn-muted,#64748b)}
.kpl-modal .box.alert p{margin:0;font-size:13.5px;color:var(--kdn-ink-soft,#334155)}
.kpl-modal .box.alert .ft{justify-self:stretch;display:flex;justify-content:flex-end;gap:8px}

.kpl-filter.kpl-to{background:color-mix(in srgb,#2563eb 4%,var(--kdn-surface,#fff));border-color:#dbeafe}
.kpl-filter.kpl-to>small{color:#1d4ed8}
.kpl-filter.kpl-to button i{font-style:normal;font-size:10.5px;font-weight:700;color:var(--kdn-muted,#64748b);margin-left:1px}
.kpl-filter.kpl-to button.on i{color:#dbeafe}
.kpl-filter.kpl-to>small em{font-style:normal;font-weight:600;color:var(--kdn-muted,#64748b);margin-left:6px}

.kpl-split2.searching{grid-template-columns:1fr!important}
.kpl-ctabs2 button.all b{color:var(--kdn-accent,#2563eb)}
.kpl-sres.all{color:var(--kdn-ink,#111827);background:var(--kdn-surface-2,#f1f5f9);border-color:var(--kdn-line,#e2e8f0)}
.kpl-dist{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.kpl-dist small{font-size:12.5px;font-weight:800;color:var(--kdn-muted,#64748b);margin-right:2px}
.kpl-dist button{height:30px;padding:0 10px;border-radius:99px;border:1px solid var(--kdn-line,#e2e8f0);background:var(--kdn-surface,#fff);color:var(--kdn-muted,#64748b);font:inherit;font-size:12.5px;cursor:pointer}
.kpl-dist button b{margin-left:3px;font-variant-numeric:tabular-nums}.kpl-dist button.has{color:var(--kdn-ink,#111827);border-color:#93c5fd}.kpl-dist button.has b{color:#1d4ed8}
.kpl-sres{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:10px 14px;border-radius:12px;background:color-mix(in srgb,#2563eb 7%,var(--kdn-surface,#fff));border:1px solid #bfdbfe;color:#1d4ed8}
.kpl-sres b{font-size:14.5px}.kpl-sres small{font-size:12.5px;color:var(--kdn-ink-soft,#334155)}
.kpl-sres button{margin-left:auto;display:inline-flex;align-items:center;gap:4px;height:30px;padding:0 12px;border-radius:9px;border:1px solid #93c5fd;background:var(--kdn-surface,#fff);color:#1d4ed8;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer}
.kpl-grid .go-cls{display:inline-flex;align-items:center;height:28px;padding:0 10px;border-radius:99px;border:0;background:#2563eb;color:#fff;font:inherit;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap}
.kpl-filter.kpl-to button{min-width:52px;justify-content:center;font-size:13.5px;font-weight:800}
`;
