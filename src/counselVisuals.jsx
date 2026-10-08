// 새 UI 상담 화면 상단: 학생 요약 카드와 수시 지원 구성 6칸 패널.
// 값은 Grades.jsx가 이미 계산한 상담용 학생 정보(susiNaviStudent)와 지원 구성 저장소를 그대로 씁니다.
import React from "react";
import { loadSupportPlan, subscribeSupportPlanChanges } from "./supportPlanStore.js";

const PLAN_LIMIT = 6;

// 숫자 칸마다 다른 색 계열(라이트 기준 값, 다크는 uiMode.js가 자동 변환). 이름표는 계열색,
// 숫자는 가장 진한 글자색이라 다크 모드에서도 핵심 숫자가 가장 밝게 보입니다.
export const TILE_TONES = {
  blue: { bg: "#d6e5ff", label: "#1c4aa8", border: "#bcd2fa" },
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

function Stat({ label, value, unit, tone = "blue", onClick }) {
  const Tag = onClick ? "button" : "div";
  const toneStyle = toneTileStyle(tone);
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} style={{ ...s.stat, ...toneStyle.tile, ...(onClick ? s.statButton : {}) }}>
      <span style={{ ...s.statLabel, ...toneStyle.label }}>{label}</span>
      <b style={{ ...s.statValue, ...(tone === "accent" ? s.statValueAccent : {}) }}>{value}{unit && <small style={s.statUnit}> {unit}</small>}</b>
    </Tag>
  );
}

export function CounselStudentSummary({ student, identity, favoriteCount = 0, planCount, onOpenPlan }) {
  if (!student) return null;
  const groups = student.grade5ByGroup || {};
  const mock = student.latestMockSums;
  const initial = String(student.name || "?").trim().charAt(0) || "?";
  const classLine = [identity?.grade && `${identity.grade}학년`, identity?.classNumber && `${identity.classNumber}반`, identity?.number && `${identity.number}번`].filter(Boolean).join(" ");
  return (
    <section aria-label="학생 요약" style={s.card}>
      <div style={s.identity}>
        <span style={s.avatar} aria-hidden="true">{initial}</span>
        <div style={s.identityText}>
          <b style={s.name}>{student.name || "이름 미등록"}</b>
          <span style={s.meta}>{[classLine, student.sid].filter(Boolean).join(" · ")}</span>
          {student.latestMockLabel && <span style={s.metaSub}>최근 모의고사 · {student.latestMockLabel}</span>}
        </div>
      </div>
      <div style={s.stats}>
        <Stat label="전교과 내신" value={fmt(groups.전교과 ?? student.grade5)} unit={student.gradeSystem === 5 ? "5등급" : ""} tone="blue" />
        <Stat label="국수영과" value={fmt(groups.국수영과)} tone="teal" />
        <Stat label="최근 모의 3합" value={mock?.sum3 ?? "-"} tone="purple" />
        <Stat label="관심 대학" value={favoriteCount} unit="개" tone="amber" />
        <Stat label="지원 구성 ›" value={planCount == null ? "-" : planCount} unit={`/ ${PLAN_LIMIT}`} tone="accent" onClick={onOpenPlan} />
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
  avatar: { width: 48, height: 48, borderRadius: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--kdn-accent-soft, #fff0e6)", color: "var(--kdn-accent-text, #b23e0c)", fontSize: 24, fontWeight: 950, flex: "none" },
  identityText: { display: "grid", gap: 5, minWidth: 0, lineHeight: 1.35 },
  eyebrow: { fontSize: 12.5, fontWeight: 800, color: "#5d6574" },
  name: { fontSize: 22, fontWeight: 800, color: "#141821", letterSpacing: "-.02em" },
  meta: { fontSize: 15.5, fontWeight: 600, color: "#2a3140", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  metaSub: { fontSize: 13.5, fontWeight: 700, color: "#5d6574", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  stats: { flex: "1 1 560px", minWidth: 0, display: "grid", gridTemplateColumns: "repeat(5, minmax(108px, 1fr))", gap: 12, overflowX: "auto" },
  stat: { display: "grid", gap: 8, alignContent: "start", padding: "14px 16px", borderRadius: 16, background: "#f3f5f8", textAlign: "left", font: "inherit", border: 0 },
  statButton: { cursor: "pointer" },
  statAccent: { background: "var(--kdn-accent-soft, #fff0e6)" },
  statLabel: { fontSize: 14, fontWeight: 700, lineHeight: 1.3, whiteSpace: "nowrap" },
  statLabelAccent: { color: "var(--kdn-accent-text, #b23e0c)" },
  statValue: { fontSize: 26, fontWeight: 800, lineHeight: 1.05, color: "#141821", whiteSpace: "nowrap" },
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
