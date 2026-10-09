// 학생 성적 시뮬레이터: 남은 학기의 과목·학점·석차등급·성취도를 넣어 예상 내신을 확인하고,
// 프리셋으로 저장해 NAVI·대입상담에서 다시 씁니다. 계산은 실제 성적표와 같은 computeAllGroupAverages를 씁니다.
import React from "react";
import { Plus, Trash2, Copy, Save, RotateCcw } from "lucide-react";
import { normalizeCategory, getSubjectGrade } from "./gradeEngine.js";
import { conversionDetails, loadSusiNaviBetaData } from "./susiNaviData.js";
import { simulatedGroupAverages, saveGradeSimPreset, deleteGradeSimPreset, useGradeSimPresets } from "./gradeSimStore.js";

const CATEGORIES = ["국어", "수학", "영어", "사회", "한국사", "과학", "기술가정/정보", "제2외국어/한문", "기타"];
const ACHIEVEMENTS = ["", "A", "B", "C", "D", "E"];
const GROUPS = ["전교과", "국수영사과", "국수영과", "국수영사"];
const fmt = value => (value == null || !Number.isFinite(Number(value)) ? "-" : Number(value).toFixed(2));
let rowSeq = 0;
const newRow = (patch = {}) => ({ id: `r${Date.now()}-${rowSeq++}`, subject: "", category: "국어", credit: "4", grade: "", achievement: "", ...patch });

function rowsFromSubjects(list = []) {
  return list.map(subject => newRow({
    subject: subject?.subject || "",
    category: normalizeCategory(subject?.category, subject?.subject),
    credit: String(subject?.credit ?? ""),
    grade: getSubjectGrade(subject) != null ? String(getSubjectGrade(subject)) : "",
    achievement: subject?.achievement || subject?.achievementLevel || "",
  }));
}
function rowsToSubjects(rows = []) {
  return rows.filter(row => row.subject.trim() || row.grade !== "").map(row => ({
    subject: row.subject.trim() || row.category,
    category: row.category,
    credit: Number(row.credit) || 0,
    grade: row.grade === "" ? null : Number(row.grade),
    achievement: row.achievement || "",
  }));
}

export default function GradeSimulator({ sid, studentName = "", gradeSystem = 5, subjectLists = [], semesterKeys = [], labelOf = key => key }) {
  const scale = Number(gradeSystem) === 9 ? 9 : 5;
  const lastFilled = subjectLists.reduce((last, list, index) => (list?.length ? index : last), -1);
  const remaining = semesterKeys.filter((_, index) => index > lastFilled);
  const [sims, setSims] = React.useState({});
  const [active, setActive] = React.useState(remaining[0] || "");
  const [excludeLast, setExcludeLast] = React.useState(true);
  const [presetName, setPresetName] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [beta, setBeta] = React.useState(null);
  const { presets, status } = useGradeSimPresets(sid);

  React.useEffect(() => { setSims({}); setActive(remaining[0] || ""); setMessage(""); }, [sid]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    if (scale !== 5) return;
    let alive = true;
    loadSusiNaviBetaData().then(data => { if (alive) setBeta(data?.conversions?.length ? data : null); }).catch(() => {});
    return () => { alive = false; };
  }, [scale]);

  const rows = sims[active] || [];
  const setRows = next => setSims(current => ({ ...current, [active]: typeof next === "function" ? next(current[active] || []) : next }));
  const update = (id, patch) => setRows(list => list.map(row => (row.id === id ? { ...row, ...patch } : row)));

  const augmented = React.useMemo(() => semesterKeys.map((key, index) => {
    if (subjectLists[index]?.length) return subjectLists[index];
    if (excludeLast && key === "3-2") return null;
    const list = rowsToSubjects(sims[key] || []);
    return list.length ? list : null;
  }), [semesterKeys, subjectLists, sims, excludeLast]);
  const current = React.useMemo(() => simulatedGroupAverages(subjectLists, scale), [subjectLists, scale]);
  const predicted = React.useMemo(() => simulatedGroupAverages(augmented, scale), [augmented, scale]);
  const simCount = remaining.filter(key => rowsToSubjects(sims[key] || []).length).length;
  const grade9 = value => {
    if (value == null || scale !== 5) return { value: scale === 9 ? value : null, label: scale === 9 ? "9등급제" : "" };
    const stat = beta ? conversionDetails(beta, "statistical", "전교과", value) : null;
    return stat?.value != null ? { value: stat.value, label: "통계 Beta" } : { value: Math.round((2 * value - 1) * 100) / 100, label: "기존 환산" };
  };
  const now9 = grade9(current.전교과), next9 = grade9(predicted.전교과);
  const delta = current.전교과 != null && predicted.전교과 != null ? current.전교과 - predicted.전교과 : null;

  const copyLast = () => {
    const source = subjectLists[lastFilled];
    if (!source?.length) { setMessage("복사할 지난 학기 성적이 없습니다."); return; }
    setRows(rowsFromSubjects(source));
    setMessage(`${labelOf(semesterKeys[lastFilled])} 과목을 불러왔습니다. 등급을 바꿔 보세요.`);
  };
  const setAll = grade => setRows(list => list.map(row => ({ ...row, grade: String(grade) })));
  const save = async () => {
    setBusy(true); setMessage("");
    const result = await saveGradeSimPreset(sid, {
      name: presetName,
      gradeSystem: scale,
      excludeLast,
      semesters: Object.fromEntries(remaining.map(key => [key, rowsToSubjects(sims[key] || [])]).filter(([, list]) => list.length)),
      result: { 전교과: predicted.전교과, 국수영사과: predicted.국수영사과, 국수영과: predicted.국수영과, 국수영사: predicted.국수영사, grade9: next9.value, grade9Method: next9.label },
    });
    setBusy(false);
    setMessage(result.ok ? `“${presetName.trim()}” 프리셋을 저장했습니다. NAVI 기준 설정과 대입상담에서 불러올 수 있습니다.` : (result.error || "저장하지 못했습니다."));
    if (result.ok) setPresetName("");
  };
  const apply = preset => {
    const next = {};
    Object.entries(preset.semesters || {}).forEach(([key, list]) => { next[key] = rowsFromSubjects(list); });
    setSims(next);
    setExcludeLast(preset.excludeLast !== false);
    setActive(Object.keys(next)[0] || remaining[0] || "");
    setPresetName(preset.name);
    setMessage(`“${preset.name}” 프리셋을 불러왔습니다.`);
  };
  const remove = async preset => {
    const result = await deleteGradeSimPreset(sid, preset.id);
    setMessage(result.ok ? `“${preset.name}” 프리셋을 삭제했습니다.` : (result.error || "삭제하지 못했습니다."));
  };

  if (!remaining.length) return <div className="kdn-sim-empty">모든 학기 성적이 등록되어 있어 시뮬레이션할 남은 학기가 없습니다.</div>;

  // 학기별 전교과 흐름(실제 = 실선, 시뮬레이션 = 점선)
  const perSem = predicted.perSemester || [];
  const pts = semesterKeys.map((key, index) => ({ key, value: perSem[index], simulated: !subjectLists[index]?.length })).filter(point => point.value != null);
  const vals = pts.map(point => point.value);
  const lo = vals.length ? Math.max(1, Math.floor((Math.min(...vals) - 0.2) * 10) / 10) : 1;
  const hi = vals.length ? Math.min(scale, Math.max(lo + 0.6, Math.ceil((Math.max(...vals) + 0.2) * 10) / 10)) : scale;
  const W = 340, H = 130, x = index => 20 + (index * (W - 40)) / Math.max(1, semesterKeys.length - 1), y = value => 18 + ((value - lo) / Math.max(0.01, hi - lo)) * (H - 46);

  return <div className="kdn-sim">
    <section className="kdn-sim-hero">
      <div className="kdn-sim-hero-copy">
        <span>{studentName ? `${studentName} · ` : ""}성적 시뮬레이터</span>
        <b>남은 학기를 이렇게 받으면<br />전교과 <em>{fmt(predicted.전교과)}</em>{delta != null && simCount > 0 && <small className={delta > 0.004 ? "is-up" : delta < -0.004 ? "is-down" : ""}>{delta > 0.004 ? `▲ ${delta.toFixed(2)} 상승` : delta < -0.004 ? `▼ ${Math.abs(delta).toFixed(2)} 하락` : "변화 없음"}</small>}</b>
        <p>지금 {fmt(current.전교과)} → 예상 {fmt(predicted.전교과)}{scale === 5 && next9.value != null && <> · 9등급 환산 {fmt(now9.value)} → <strong>{fmt(next9.value)}</strong> ({next9.label})</>}</p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="kdn-sim-spark" role="img" aria-label="학기별 전교과 흐름(점선은 시뮬레이션)">
        {pts.slice(1).map((point, index) => { const prev = pts[index]; const ia = semesterKeys.indexOf(prev.key), ib = semesterKeys.indexOf(point.key); return <line key={point.key} x1={x(ia)} y1={y(prev.value)} x2={x(ib)} y2={y(point.value)} className={point.simulated ? "line is-sim" : "line"} />; })}
        {pts.map(point => { const index = semesterKeys.indexOf(point.key); return <g key={point.key}><circle cx={x(index)} cy={y(point.value)} r={point.simulated ? 5 : 6} className={point.simulated ? "dot is-sim" : "dot"} /><text x={x(index)} y={y(point.value) - 10} textAnchor="middle" className="val">{fmt(point.value)}</text></g>; })}
        {semesterKeys.map((key, index) => <text key={key} x={x(index)} y={H - 6} textAnchor="middle" className="sem">{key}</text>)}
      </svg>
    </section>

    <div className="kdn-sim-body">
      <section className="kdn-sim-editor">
        <div className="kdn-sim-tabs" role="tablist" aria-label="시뮬레이션할 학기">
          {remaining.map(key => { const count = rowsToSubjects(sims[key] || []).length; const off = excludeLast && key === "3-2"; return <button key={key} type="button" role="tab" data-kdn-bare aria-selected={active === key} className={active === key ? "is-on" : ""} onClick={() => setActive(key)}><b>{labelOf(key)}</b><small>{off ? "수시 미반영" : count ? `${count}과목 입력` : "비어 있음"}</small></button>; })}
        </div>
        <div className="kdn-sim-tools">
          <button type="button" onClick={copyLast}><Copy size={15} />지난 학기 과목 복사</button>
          <label>모든 과목 등급 <select value="" onChange={event => event.target.value && setAll(event.target.value)} disabled={!rows.length}><option value="">일괄 선택</option>{Array.from({ length: scale }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}등급</option>)}</select></label>
          {remaining.includes("3-2") && <label className="kdn-sim-check"><input type="checkbox" checked={excludeLast} onChange={event => setExcludeLast(event.target.checked)} />3학년 2학기는 수시 계산에서 제외</label>}
          <button type="button" onClick={() => setRows([])} disabled={!rows.length}><RotateCcw size={15} />이 학기 비우기</button>
        </div>
        <div className="kdn-sim-table" role="table" aria-label={`${labelOf(active)} 시뮬레이션 과목`}>
          <div className="kdn-sim-row is-head" role="row"><span>과목명</span><span>교과</span><span>학점</span><span>석차등급</span><span>성취도</span><span /></div>
          {rows.map(row => <div key={row.id} className="kdn-sim-row" role="row">
            <input aria-label="과목명" value={row.subject} placeholder="예: 미적분Ⅱ" onChange={event => update(row.id, { subject: event.target.value })} />
            <select aria-label="교과" value={row.category} onChange={event => update(row.id, { category: event.target.value })}>{CATEGORIES.map(value => <option key={value}>{value}</option>)}</select>
            <input aria-label="학점" type="number" min="1" max="8" value={row.credit} onChange={event => update(row.id, { credit: event.target.value })} />
            <div className="kdn-sim-grades" role="group" aria-label="석차등급">{Array.from({ length: scale }, (_, i) => String(i + 1)).map(value => <button key={value} type="button" data-kdn-bare aria-pressed={row.grade === value} className={row.grade === value ? `is-on g${value}` : ""} onClick={() => update(row.id, { grade: row.grade === value ? "" : value })}>{value}</button>)}<span className={row.grade === "" ? "is-none" : ""}>{row.grade === "" ? "성취도만" : ""}</span></div>
            <select aria-label="성취도" value={row.achievement} onChange={event => update(row.id, { achievement: event.target.value })}>{ACHIEVEMENTS.map(value => <option key={value} value={value}>{value || "-"}</option>)}</select>
            <button type="button" className="kdn-sim-del" aria-label={`${row.subject || "과목"} 삭제`} onClick={() => setRows(list => list.filter(item => item.id !== row.id))}><Trash2 size={15} /></button>
          </div>)}
          {!rows.length && <div className="kdn-sim-blank">아직 과목이 없습니다. <b>지난 학기 과목 복사</b>로 시작하거나 아래에서 과목을 추가하세요.</div>}
          <button type="button" className="kdn-sim-add" onClick={() => setRows(list => [...list, newRow()])}><Plus size={15} />과목 추가</button>
        </div>
        <p className="kdn-sim-note">석차등급을 비워 두면 성취도만 있는 과목(진로선택 등)으로 보고 평균에서 뺍니다. 계산은 성적 리포트와 같은 방식(학기별 학점 가중 평균의 평균)입니다.</p>
      </section>

      <aside className="kdn-sim-side">
        <div className="kdn-sim-groups">
          <div className="kdn-sim-groups-head"><b>교과 조합별 예상</b><span>지금 → 예상</span></div>
          {GROUPS.map(group => { const a = current[group], b = predicted[group]; const d = a != null && b != null ? a - b : null; return <div key={group} className="kdn-sim-group"><span>{group}</span><em>{fmt(a)}</em><b>{fmt(b)}</b><small className={d > 0.004 ? "is-up" : d < -0.004 ? "is-down" : ""}>{d == null || Math.abs(d) < 0.005 ? "–" : `${d > 0 ? "▲" : "▼"}${Math.abs(d).toFixed(2)}`}</small></div>; })}
        </div>
        <div className="kdn-sim-save">
          <b>프리셋으로 저장</b>
          <div><input value={presetName} maxLength={30} placeholder="예: 목표안, 현상 유지" onChange={event => setPresetName(event.target.value)} /><button type="button" onClick={save} disabled={busy || !sid || !presetName.trim() || !simCount}><Save size={15} />저장</button></div>
          {!simCount && <small>남은 학기에 과목을 하나 이상 넣으면 저장할 수 있습니다.</small>}
          {message && <small role="status" className="kdn-sim-msg">{message}</small>}
        </div>
        <div className="kdn-sim-presets">
          <b>저장된 프리셋 {presets.length ? `${presets.length}개` : ""}</b>
          {status === "loading" && <small>불러오는 중…</small>}
          {status === "error" && <small>프리셋을 불러오지 못했습니다.</small>}
          {status === "ready" && !presets.length && <small>아직 저장한 프리셋이 없습니다.</small>}
          {presets.map(preset => <div key={preset.id} className="kdn-sim-preset">
            <button type="button" data-kdn-bare onClick={() => apply(preset)}><b>{preset.name}</b><small>전교과 {fmt(preset.result?.전교과)}{preset.result?.grade9 != null && Number(preset.gradeSystem) === 5 ? ` · 9등급 ${fmt(preset.result.grade9)}` : ""}</small></button>
            <button type="button" className="kdn-sim-del" aria-label={`${preset.name} 삭제`} onClick={() => remove(preset)}><Trash2 size={14} /></button>
          </div>)}
        </div>
      </aside>
    </div>
  </div>;
}

// NAVI·대입상담에서 쓰는 프리셋 칩 줄: 누르면 그 프리셋의 예상 내신을 적용합니다.
export function GradeSimPresetChips({ sid, group = "전교과", activeValue, onPick, compact = false }) {
  const { presets } = useGradeSimPresets(sid);
  if (!sid || !presets.length) return null;
  return <div className={compact ? "kdn-sim-chips is-compact" : "kdn-sim-chips"}>
    <span>성적 시뮬레이션</span>
    {presets.map(preset => { const value = preset.result?.[group] ?? preset.result?.전교과; const on = activeValue != null && value != null && Math.abs(Number(activeValue) - value) < 0.005; return onPick
      ? <button key={preset.id} type="button" data-kdn-bare aria-pressed={on} className={on ? "is-on" : ""} onClick={() => onPick(preset, value)}><b>{preset.name}</b><small>{fmt(value)}</small></button>
      : <span key={preset.id} className="kdn-sim-chip"><b>{preset.name}</b><small>{group} {fmt(value)}{preset.result?.grade9 != null && Number(preset.gradeSystem) === 5 ? ` · 9등급 ${fmt(preset.result.grade9)}` : ""}</small></span>; })}
  </div>;
}
