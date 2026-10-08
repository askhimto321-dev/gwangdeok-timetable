// 성적 산출 '산출 기준' 프리셋: 등급·성취도 설정과 지필/수행 반영비율을 이름 붙여 저장해 두고,
// 다른 과목·다음 학기에도 바로 불러옵니다. 선생님 계정별로 학교 저장소에 보관되어 어느 컴퓨터에서나 같습니다.
import React from "react";
import { Bookmark, Download, Trash2 } from "lucide-react";
import { readStorage, updateStorage } from "./storage.js";

const LIMIT = 12;
const keyFor = teacher => `kd_grade_criteria_presets_v1:${String(teacher?.id || teacher?.name || "shared")}`;
const listOf = value => (value && Array.isArray(value.presets) ? value.presets : []);
const summary = preset => [
  `${preset.settings?.gradeSystem || 5}등급제`,
  preset.settings?.courseType === "elective" ? "선택과목" : "공통과목",
  preset.written?.length ? `지필 ${preset.written.map(item => `${item.title} ${item.weight}%`).join(" · ")}` : "",
  preset.areas?.length ? `수행 ${preset.areas.length}개 영역 ${preset.areas.reduce((sum, area) => sum + (Number(area.weight) || 0), 0)}%` : "",
].filter(Boolean).join(" · ");

export default function CriteriaPresets({ teacher, disabled = false, capture, apply }) {
  const [presets, setPresets] = React.useState([]);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const storageKey = keyFor(teacher);
  React.useEffect(() => {
    let active = true;
    readStorage(storageKey, { presets: [] }).then(value => { if (active) setPresets(listOf(value)); }).catch(() => {});
    return () => { active = false; };
  }, [storageKey]);

  const save = async () => {
    const label = (name.trim() || `기준 ${presets.length + 1}`).slice(0, 24);
    setBusy(true); setMessage("");
    const preset = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: label, savedAt: new Date().toISOString(), ...capture() };
    const result = await updateStorage(storageKey, { presets: [] }, stored => {
      const others = listOf(stored).filter(item => item.name !== label);
      if (others.length >= LIMIT) throw new Error(`산출 기준 프리셋은 ${LIMIT}개까지 저장할 수 있습니다. 먼저 하나를 삭제해주세요.`);
      return { ...(stored || {}), presets: [...others, preset], updatedAt: preset.savedAt };
    });
    setBusy(false);
    if (!result.ok) { setMessage(/[가-힣]/.test(result.error || "") ? result.error : "저장하지 못했습니다. 연결을 확인한 뒤 다시 시도해주세요."); return; }
    setPresets(listOf(result.value)); setName(""); setMessage(`'${label}' 기준을 저장했습니다.`);
  };
  const load = preset => {
    if (typeof window !== "undefined" && !window.confirm(`'${preset.name}' 기준을 불러올까요?\n등급·성취도 설정과 반영비율이 바뀝니다. 이름이 같은 시험·영역에 비율을 채우고, 아직 파일이 없는 항목은 '예정'으로 추가합니다.`)) return;
    apply(preset); setMessage(`'${preset.name}' 기준을 불러왔습니다. 확인 후 '산출 기준 저장'을 눌러 주세요.`);
  };
  const remove = async preset => {
    if (typeof window !== "undefined" && !window.confirm(`프리셋 '${preset.name}'을 삭제할까요?`)) return;
    setBusy(true);
    const result = await updateStorage(storageKey, { presets: [] }, stored => ({ ...(stored || {}), presets: listOf(stored).filter(item => item.id !== preset.id) }));
    setBusy(false);
    if (result.ok) setPresets(listOf(result.value));
  };

  return (
    <section className="kd-criteria-presets no-print" aria-label="산출 기준 프리셋" style={st.wrap}>
      <div style={st.head}>
        <b style={st.title}><Bookmark size={16} aria-hidden="true" /> 산출 기준 프리셋</b>
        <span style={st.hint}>지금 설정을 저장해 두고 다른 과목·다음 학기에 불러오세요.</span>
      </div>
      <div style={st.row}>
        <input value={name} onChange={event => setName(event.target.value)} maxLength={24} placeholder="이름 (예: 공통과목 지필 60 · 수행 40)" aria-label="프리셋 이름" style={st.input} onKeyDown={event => { if (event.key === "Enter" && !busy) save(); }} />
        <button type="button" onClick={save} disabled={busy} style={{ ...st.save, ...(busy ? st.off : {}) }}>현재 기준 저장</button>
      </div>
      {presets.length > 0 && <ul style={st.list}>
        {[...presets].reverse().map(preset => <li key={preset.id} style={st.item}>
          <div style={st.itemText}><b style={st.itemName}>{preset.name}</b><span style={st.itemSummary} title={summary(preset)}>{summary(preset)}</span></div>
          <button type="button" onClick={() => load(preset)} disabled={busy || disabled} style={{ ...st.load, ...(disabled ? st.off : {}) }}><Download size={14} aria-hidden="true" /> 불러오기</button>
          <button type="button" onClick={() => remove(preset)} disabled={busy} aria-label={`${preset.name} 삭제`} title="삭제" style={st.icon}><Trash2 size={14} aria-hidden="true" /></button>
        </li>)}
      </ul>}
      {message && <small role="status" style={st.message}>{message}</small>}
    </section>
  );
}

const st = {
  wrap: { display: "grid", gap: 10, marginTop: 14, padding: "14px 16px", border: "1px solid #dfe2e8", borderRadius: 14, background: "#fbfaf8" },
  head: { display: "flex", alignItems: "baseline", gap: "4px 12px", flexWrap: "wrap" },
  title: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 850, color: "#1f2430" },
  hint: { fontSize: 13, fontWeight: 500, color: "#5d6574" },
  row: { display: "flex", gap: 8, flexWrap: "wrap" },
  input: { flex: "1 1 240px", minWidth: 0, height: 40, padding: "0 12px", border: "1px solid #c3c9d3", borderRadius: 10, background: "#ffffff", color: "#1f2430", fontSize: 14, fontWeight: 600 },
  save: { minHeight: 40, padding: "0 16px", border: "1px solid #cf4a12", borderRadius: 10, background: "#cf4a12", color: "#ffffff", fontSize: 14, fontWeight: 800, cursor: "pointer" },
  off: { opacity: 0.45, cursor: "not-allowed" },
  list: { listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 8 },
  item: { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", border: "1px solid #dfe2e8", borderRadius: 12, background: "#ffffff", minWidth: 0 },
  itemText: { display: "grid", gap: 3, minWidth: 0, flex: 1 },
  itemName: { fontSize: 14.5, fontWeight: 850, color: "#1f2430" },
  itemSummary: { fontSize: 12.5, fontWeight: 500, color: "#3a4150", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  load: { display: "inline-flex", alignItems: "center", gap: 5, minHeight: 34, padding: "0 12px", border: "1px solid #c3c9d3", borderRadius: 9, background: "#ffffff", color: "#1f2430", fontSize: 13, fontWeight: 800, cursor: "pointer", flex: "none" },
  icon: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, border: "1px solid #c3c9d3", borderRadius: 9, background: "#ffffff", color: "#5d6574", cursor: "pointer", flex: "none" },
  message: { fontSize: 13, fontWeight: 600, color: "#3a4150" },
};
