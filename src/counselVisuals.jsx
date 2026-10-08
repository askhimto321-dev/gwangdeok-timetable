// 새 UI 상담 화면 상단: 학생 요약 카드와 수시 지원 구성 6칸 패널.
// 값은 Grades.jsx가 이미 계산한 상담용 학생 정보(susiNaviStudent)와 지원 구성 저장소를 그대로 씁니다.
import React from "react";
import { loadSupportPlan, subscribeSupportPlanChanges } from "./supportPlanStore.js";

const PLAN_LIMIT = 6;

// 숫자 칸마다 다른 색 계열(라이트 기준 값, 다크는 uiMode.js가 자동 변환). 이름표는 계열색,
// 숫자는 가장 진한 글자색이라 다크 모드에서도 핵심 숫자가 가장 밝게 보입니다.
export const TILE_TONES = {
  blue: { bg: "#d6e5ff", label: "#1c4aa8", border: "#bcd2fa" },
  sky: { bg: "#d9f0fb", label: "#0b5c80", border: "#b5e0f3" },
  teal: { bg: "#ccefe5", label: "#09645a", border: "#a9e1d2" },
  purple: { bg: "#ebe3fb", label: "#5a32a6", border: "#d8c9f5" },
  amber: { bg: "#ffefc9", label: "#855405", border: "#f1d99a" },
  accent: { bg: "#ffe6d6", label: "#ad3b0a", border: "#f6cbb0" },
};
export function toneTileStyle(tone = "blue") {
  const t = TILE_TONES[tone] || TILE_TONES.blue;
  return { tile: { background: t.bg, border: `1px solid ${t.border}` }, label: { color: t.label } };
}
const fmt = value => (value == null || !Number.isFinite(Number(value)) ? "-" : Number(value).toFixed(2));

export function useSupportPlanItems(sid) {
  const [items, setItems] = React.useState(null);
  React.useEffect(() => {
    let active = true, request = 0;
    setItems(null);
    if (!sid) return () => {};
    const refresh = async () => {
      const token = ++request;
      try {
        const next = await loadSupportPlan(sid);
        if (active && token === request) setItems(next);
      } catch { if (active && token === request) setItems(null); }
    };
    refresh();
    const unsubscribe = subscribeSupportPlanChanges(sid, refresh);
    return () => { active = false; unsubscribe(); };
  }, [sid]);
  return items;
}

function Stat({ label, value, unit, tone = "blue", onClick, title, progress }) {
  const Tag = onClick ? "button" : "div";
  const toneStyle = toneTileStyle(tone);
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} title={title} style={{ ...s.stat, ...toneStyle.tile, ...(onClick ? s.statButton : {}) }}>
      <span style={{ ...s.statLabel, ...toneStyle.label }}>{label}</span>
      <b style={{ ...s.statValue, ...(tone === "accent" ? s.statValueAccent : {}) }}>{value}{unit && <small style={s.statUnit}> {unit}</small>}</b>
      {progress != null && <span style={s.progressTrack} aria-hidden="true"><span style={{ ...s.progressFill, width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} /></span>}
    </Tag>
  );
}

// naviGrade: NAVI와 같은 방식(기존 환산 2×내신−1 또는 통계 기반)으로 계산한 9등급 환산값 { value, method, group }
export function CounselStudentSummary({ student, identity, favoriteCount = 0, planCount, onOpenPlan, naviGrade }) {
  if (!student) return null;
  const groups = student.grade5ByGroup || {};
  const mock = student.latestMockSums;
  const initial = String(student.name || "?").trim().charAt(0) || "?";
  const classLine = [identity?.grade && `${identity.grade}학년`, identity?.classNumber && `${identity.classNumber}반`, identity?.number && `${identity.number}번`].filter(Boolean).join(" ");
  const isFiveScale = student.gradeSystem !== 9;
  const methodLabel = naviGrade?.method === "statistical" ? "통계" : "기존";
  return (
    <section aria-label="학생 요약" style={s.card}>
      <div style={s.identity}>
        <span style={s.avatar} aria-hidden="true">{initial}</span>
        <div style={s.identityText}>
          <b style={s.name}>{student.name || "이름 미등록"}</b>
          <span style={s.chips}>
            {classLine && <span style={s.classChip}>{classLine}</span>}
            {student.sid && <span style={s.sidChip}>{student.sid}</span>}
          </span>
          {student.latestMockLabel && <span style={s.metaSub}><span style={s.dot} aria-hidden="true" />최근 모의고사 {student.latestMockLabel}</span>}
        </div>
      </div>
      <div style={{ ...s.stats, gridTemplateColumns: `repeat(${isFiveScale ? 5 : 4}, minmax(108px, 1fr))` }}>
        <Stat label="전교과 내신" value={fmt(groups.전교과 ?? student.grade5)} unit={student.gradeSystem === 5 ? "5등급" : ""} tone="blue" />
        {isFiveScale && <Stat label="9등급 환산" value={fmt(naviGrade?.value)} unit={naviGrade?.value != null ? methodLabel : ""} tone="sky" title={naviGrade?.method === "statistical" ? `통계 기반 Beta · ${naviGrade.group || "전교과"} (NAVI와 같은 방식)` : "기존 환산 2×내신−1 (NAVI와 같은 방식)"} />}
        <Stat label="최근 모의고사 3합" value={mock?.sum3 ?? "-"} tone="purple" />
        <Stat label="관심 대학" value={favoriteCount} unit="개" tone="amber" />
        <Stat label="지원 구성 ›" value={planCount == null ? "-" : planCount} unit={`/ ${PLAN_LIMIT}`} tone="accent" onClick={onOpenPlan} progress={planCount == null ? null : planCount / PLAN_LIMIT} />
      </div>
    </section>
  );
}

export function SupportPlanSlots({ items, onOpen }) {
  const list = items || [];
  const slots = Array.from({ length: PLAN_LIMIT }, (_, index) => list[index] || null);
  return (
    <section aria-label="수시 지원 구성" style={s.plan}>
      <div style={s.planHead}>
        <b style={s.planTitle}>수시 지원 구성</b>
        <span style={s.planCount}>{items == null ? "불러오는 중" : `${list.length} / ${PLAN_LIMIT}장`}</span>
      </div>
      <ol style={s.planList}>
        {slots.map((item, index) => (
          <li key={index} style={item ? s.slot : s.slotEmpty}>
            <span style={s.slotNo}>{index + 1}</span>
            {item ? (
              <span style={s.slotText} title={[item.university, item.department, item.admissionType].filter(Boolean).join(" · ")}>
                <b style={s.slotTitle}>{item.university || "저장한 전형"}</b>
                <small style={s.slotSub}>{[item.department, item.admissionType].filter(Boolean).join(" · ") || item.track || item.source || ""}</small>
              </span>
            ) : <span style={s.slotEmptyText}>빈 자리</span>}
          </li>
        ))}
      </ol>
      {onOpen && <button type="button" onClick={onOpen} style={s.planButton}>자세히 · 인쇄</button>}
    </section>
  );
}

const s = {
  // 이름 칸은 내용 너비만, 숫자 칸 5개는 남은 너비를 나눠 한 줄로(좁은 화면에서는 가로로 밀어 보기).
  card: { display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center", padding: "18px 22px", borderRadius: 20, background: "#ffffff", border: "1px solid #e1e5eb", boxSizing: "border-box" },
  identity: { display: "flex", alignItems: "center", gap: 14, flex: "0 1 auto", minWidth: 220 },
  avatar: { width: 52, height: 52, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #ffd9c2, #ffeadd)", color: "#ad3b0a", fontSize: 22, fontWeight: 800, flex: "none" },
  identityText: { display: "grid", gap: 6, minWidth: 0, lineHeight: 1.35 },
  eyebrow: { fontSize: 12.5, fontWeight: 800, color: "#5d6574" },
  name: { fontSize: 26, fontWeight: 800, color: "#141821", letterSpacing: "-.025em", lineHeight: 1.15 },
  chips: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  classChip: { display: "inline-flex", alignItems: "center", minHeight: 24, padding: "0 10px", borderRadius: 999, background: "#fff0e6", color: "#ad3b0a", fontSize: 13, fontWeight: 700 },
  sidChip: { display: "inline-flex", alignItems: "center", minHeight: 24, padding: "0 9px", borderRadius: 999, border: "1px solid #dfe2e8", color: "#3a4150", fontSize: 12.5, fontWeight: 600, fontVariantNumeric: "tabular-nums", letterSpacing: ".03em" },
  dot: { display: "inline-block", width: 6, height: 6, borderRadius: 999, background: "#8b5cf6", marginRight: 6, verticalAlign: "middle" },
  meta: { fontSize: 14.5, fontWeight: 500, color: "#3a4150", letterSpacing: ".01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  metaSub: { fontSize: 13, fontWeight: 500, color: "#5d6574", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  stats: { flex: "1 1 620px", minWidth: 0, display: "grid", gap: 12, overflowX: "auto" },
  stat: { display: "grid", gap: 8, alignContent: "start", padding: "14px 16px", borderRadius: 16, background: "#f3f5f8", textAlign: "left", font: "inherit", border: 0 },
  statButton: { cursor: "pointer" },
  progressTrack: { display: "block", height: 4, borderRadius: 999, background: "rgba(173,59,10,.16)", overflow: "hidden" },
  progressFill: { display: "block", height: "100%", borderRadius: 999, background: "var(--kdn-accent, #cf4a12)" },
  statAccent: { background: "var(--kdn-accent-soft, #fff0e6)" },
  statLabel: { fontSize: 13.5, fontWeight: 650, lineHeight: 1.3, whiteSpace: "nowrap" },
  statLabelAccent: { color: "var(--kdn-accent-text, #b23e0c)" },
  statValue: { fontSize: 27, fontWeight: 750, letterSpacing: "-.01em", lineHeight: 1.05, color: "#141821", whiteSpace: "nowrap" },
  statValueAccent: { color: "var(--kdn-accent-text, #b23e0c)" },
  statUnit: { fontSize: 13, fontWeight: 700, color: "#5d6574" },
  plan: { display: "flex", alignItems: "center", gap: 16, padding: "14px 20px", borderRadius: 20, background: "#ffffff", border: "1px solid #e1e5eb", flexWrap: "wrap" },
  planHead: { display: "grid", gap: 2, flex: "0 0 auto", minWidth: 110 },
  planTitle: { fontSize: 17, fontWeight: 950, color: "#1f2430" },
  planCount: { fontSize: 14, fontWeight: 900, color: "var(--kdn-accent-text, #b23e0c)" },
  planList: { listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10, flex: "1 1 520px", minWidth: 0 },
  slot: { display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 12, background: "#f3f5f8", minWidth: 0 },
  slotEmpty: { display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 12, border: "1px dashed #c9ced8", minWidth: 0 },
  slotNo: { width: 14, fontSize: 13.5, fontWeight: 950, color: "#5d6574", flex: "none" },
  slotText: { display: "grid", gap: 2, minWidth: 0 },
  slotTitle: { fontSize: 14.5, fontWeight: 900, color: "#1f2430", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  slotSub: { fontSize: 12.5, fontWeight: 700, color: "#4a5262", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  slotEmptyText: { fontSize: 12.5, fontWeight: 700, color: "#5d6574" },
  planButton: { flex: "0 0 auto", minHeight: 42, padding: "0 14px", borderRadius: 13, border: "1px solid #d5dae2", background: "transparent", color: "#1f2430", fontSize: 14, fontWeight: 900, cursor: "pointer" },
};
