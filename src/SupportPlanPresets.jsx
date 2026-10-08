// 수시 지원 구성 프리셋: 현재 6장 구성을 "A안 · 상향 위주"처럼 이름 붙여 여러 개 저장해 두고,
// 상담 중에 다른 안으로 바로 바꿔 비교할 수 있게 합니다. 실제 수시 지원은 6장이라 현재 구성은 6개를 유지합니다.
import React from "react";
import { Bookmark, Download, Trash2 } from "lucide-react";
import { loadSupportPlanPresets, saveSupportPlanPreset, deleteSupportPlanPreset, applySupportPlanPreset, PRESET_LIMIT } from "./supportPlanStore.js";

const dateLabel = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()}`; };
const summary = items => (items || []).map(item => item.university).filter(Boolean).join(" · ");

export default function SupportPlanPresets({ sid, items = [] }) {
  const [presets, setPresets] = React.useState([]);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  React.useEffect(() => {
    let active = true;
    setPresets([]); setMessage("");
    if (!sid) return () => {};
    loadSupportPlanPresets(sid).then(list => { if (active) setPresets(list); }).catch(() => { if (active) setMessage("저장된 프리셋을 불러오지 못했습니다. 연결을 확인한 뒤 새로고침해주세요."); });
    return () => { active = false; };
  }, [sid]);
  if (!sid) return null;

  const run = async (task, done) => {
    setBusy(true); setMessage("");
    const result = await task();
    setBusy(false);
    if (!result.ok) { setMessage(/[가-힣]/.test(result.error || "") ? result.error : "저장하지 못했습니다. 연결을 확인한 뒤 다시 시도해주세요."); return; }
    done(result);
  };
  const save = () => run(() => saveSupportPlanPreset(sid, name || `${String.fromCharCode(65 + Math.min(presets.length, 25))}안`, items), result => {
    setPresets(result.presets); setName(""); setMessage("현재 구성을 프리셋으로 저장했습니다.");
  });
  const apply = preset => {
    if (typeof window !== "undefined" && items.length && !window.confirm(`현재 지원 구성을 '${preset.name}'(${preset.items.length}개)으로 바꿀까요?\n지금 구성을 프리셋으로 저장하지 않았다면 사라집니다.`)) return;
    run(() => applySupportPlanPreset(sid, preset), () => setMessage(`'${preset.name}'을 현재 구성으로 불러왔습니다.`));
  };
  const remove = preset => {
    if (typeof window !== "undefined" && !window.confirm(`프리셋 '${preset.name}'을 삭제할까요?`)) return;
    run(() => deleteSupportPlanPreset(sid, preset.id), result => setPresets(result.presets));
  };

  return (
    <section className="kd-plan-presets no-print" aria-label="지원 구성 프리셋" style={st.wrap}>
      <div style={st.head}>
        <b style={st.title}><Bookmark size={16} aria-hidden="true" /> 지원 구성 프리셋</b>
        <span style={st.hint}>현재 6장 구성을 A안·B안처럼 저장해 두고, 상담 중에 바꿔 가며 비교하세요. (최대 {PRESET_LIMIT}개)</span>
      </div>
      <div style={st.saveRow}>
        <input value={name} onChange={event => setName(event.target.value)} maxLength={20} placeholder={`이름 (예: ${String.fromCharCode(65 + Math.min(presets.length, 25))}안 · 상향 위주)`} aria-label="프리셋 이름" style={st.input} onKeyDown={event => { if (event.key === "Enter" && items.length && !busy) save(); }} />
        <button type="button" onClick={save} disabled={busy || !items.length} style={{ ...st.saveButton, ...(busy || !items.length ? st.disabled : {}) }}>현재 구성 저장 ({items.length}/6)</button>
      </div>
      {presets.length > 0 && (
        <ul style={st.list}>
          {[...presets].reverse().map(preset => (
            <li key={preset.id} style={st.item}>
              <div style={st.itemText}>
                <b style={st.itemName}>{preset.name} <small style={st.itemMeta}>{preset.items.length}개 · {dateLabel(preset.savedAt)}</small></b>
                <span style={st.itemSummary} title={summary(preset.items)}>{summary(preset.items) || "대학 정보 없음"}</span>
              </div>
              <div style={st.itemActions}>
                <button type="button" onClick={() => apply(preset)} disabled={busy} style={st.applyButton}><Download size={14} aria-hidden="true" /> 불러오기</button>
                <button type="button" onClick={() => remove(preset)} disabled={busy} aria-label={`${preset.name} 삭제`} title="삭제" style={st.iconButton}><Trash2 size={14} aria-hidden="true" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {message && <small role="status" style={st.message}>{message}</small>}
    </section>
  );
}

const st = {
  wrap: { display: "grid", gap: 10, margin: "4px 0 12px", padding: "14px 16px", border: "1px solid #dfe2e8", borderRadius: 14, background: "#fbfaf8" },
  head: { display: "flex", alignItems: "baseline", gap: "4px 12px", flexWrap: "wrap" },
  title: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 15, fontWeight: 850, color: "#1f2430" },
  hint: { fontSize: 13, fontWeight: 600, color: "#5d6574" },
  saveRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  input: { flex: "1 1 220px", minWidth: 0, height: 40, padding: "0 12px", border: "1px solid #c3c9d3", borderRadius: 10, background: "#ffffff", color: "#1f2430", fontSize: 14, fontWeight: 650 },
  saveButton: { minHeight: 40, padding: "0 16px", border: "1px solid #cf4a12", borderRadius: 10, background: "#cf4a12", color: "#ffffff", fontSize: 14, fontWeight: 800, cursor: "pointer" },
  disabled: { opacity: 0.45, cursor: "not-allowed" },
  list: { listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 },
  item: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid #dfe2e8", borderRadius: 12, background: "#ffffff", minWidth: 0 },
  itemText: { display: "grid", gap: 3, minWidth: 0, flex: 1 },
  itemName: { fontSize: 14.5, fontWeight: 850, color: "#1f2430" },
  itemMeta: { fontSize: 12.5, fontWeight: 650, color: "#5d6574" },
  itemSummary: { fontSize: 13, fontWeight: 600, color: "#3a4150", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  itemActions: { display: "flex", gap: 6, flex: "none" },
  applyButton: { display: "inline-flex", alignItems: "center", gap: 5, minHeight: 34, padding: "0 12px", border: "1px solid #c3c9d3", borderRadius: 9, background: "#ffffff", color: "#1f2430", fontSize: 13, fontWeight: 800, cursor: "pointer" },
  iconButton: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, border: "1px solid #c3c9d3", borderRadius: 9, background: "#ffffff", color: "#5d6574", cursor: "pointer" },
  message: { fontSize: 13, fontWeight: 700, color: "#3a4150" },
};
