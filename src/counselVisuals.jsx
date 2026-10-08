// 새 UI 상담 화면 상단: 학생 요약 카드와 수시 지원 구성 6칸 패널.
// 값은 Grades.jsx가 이미 계산한 상담용 학생 정보(susiNaviStudent)와 지원 구성 저장소를 그대로 씁니다.
import React from "react";
import { loadSupportPlan, subscribeSupportPlanChanges } from "./supportPlanStore.js";

const PLAN_LIMIT = 6;
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

function Stat({ label, value, unit, tone, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} style={{ ...s.stat, ...(tone === "accent" ? s.statAccent : {}), ...(onClick ? s.statButton : {}) }}>
      <span style={{ ...s.statLabel, ...(tone === "accent" ? s.statLabelAccent : {}) }}>{label}</span>
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
          <span style={s.eyebrow}>학생 상담 흐름</span>
          <b style={s.name}>{student.name || "이름 미등록"}</b>
          <span style={s.meta}>{[classLine, student.sid].filter(Boolean).join(" · ")}</span>
          {student.latestMockLabel && <span style={s.metaSub}>최근 모의고사 · {student.latestMockLabel}</span>}
        </div>
      </div>
      <div style={s.stats}>
        <Stat label="전교과 내신" value={fmt(groups.전교과 ?? student.grade5)} unit={student.gradeSystem === 5 ? "5등급" : ""} />
        <Stat label="국수영과" value={fmt(groups.국수영과)} />
        <Stat label="최근 모의 3합" value={mock?.sum3 ?? "-"} />
        <Stat label="관심 대학" value={favoriteCount} unit="개" />
        <Stat label="수시 지원 구성 ›" value={planCount == null ? "-" : planCount} unit={`/ ${PLAN_LIMIT}`} tone="accent" onClick={onOpenPlan} />
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
              <span style={s.slotText}>
                <b style={s.slotTitle}>{[item.university, item.department].filter(Boolean).join(" · ") || "저장한 전형"}</b>
                <small style={s.slotSub}>{[item.admissionType, item.track && item.track !== item.admissionType ? item.track : ""].filter(Boolean).join(" · ") || item.source || ""}</small>
              </span>
            ) : <span style={s.slotEmptyText}>빈 자리 · 관심 대학이나 NAVI에서 담을 수 있어요</span>}
          </li>
        ))}
      </ol>
      {onOpen && <button type="button" onClick={onOpen} style={s.planButton}>지원 구성 자세히 보기 · 인쇄</button>}
    </section>
  );
}

const s = {
  card: { display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center", padding: "20px 22px", borderRadius: 22, background: "#ffffff", border: "1px solid #e1e5eb", height: "100%", boxSizing: "border-box" },
  identity: { display: "flex", alignItems: "center", gap: 14, flex: "1 1 320px", minWidth: 0 },
  avatar: { width: 58, height: 58, borderRadius: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--kdn-accent-soft, #fff0e6)", color: "var(--kdn-accent-text, #b23e0c)", fontSize: 24, fontWeight: 950, flex: "none" },
  identityText: { display: "grid", gap: 3, minWidth: 0 },
  eyebrow: { fontSize: 12.5, fontWeight: 800, color: "#5d6574" },
  name: { fontSize: 24, fontWeight: 950, color: "#1f2430", letterSpacing: "-.02em" },
  meta: { fontSize: 15, fontWeight: 700, color: "#3a4150", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  metaSub: { fontSize: 13.5, fontWeight: 700, color: "#5d6574", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  stats: { flex: "999 1 520px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 10 },
  stat: { display: "grid", gap: 6, alignContent: "start", padding: "14px 16px", borderRadius: 16, background: "#f3f5f8", textAlign: "left", font: "inherit", border: 0 },
  statButton: { cursor: "pointer" },
  statAccent: { background: "var(--kdn-accent-soft, #fff0e6)" },
  statLabel: { fontSize: 14, fontWeight: 800, color: "#3a4150", whiteSpace: "nowrap" },
  statLabelAccent: { color: "var(--kdn-accent-text, #b23e0c)" },
  statValue: { fontSize: 26, fontWeight: 950, lineHeight: 1, color: "#1f2430" },
  statValueAccent: { color: "var(--kdn-accent-text, #b23e0c)" },
  statUnit: { fontSize: 13, fontWeight: 700, color: "#5d6574" },
  plan: { display: "grid", gap: 10, padding: "16px 18px", borderRadius: 20, background: "#ffffff", border: "1px solid #e1e5eb" },
  planHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  planTitle: { fontSize: 17, fontWeight: 950, color: "#1f2430" },
  planCount: { fontSize: 14, fontWeight: 900, color: "var(--kdn-accent-text, #b23e0c)" },
  planList: { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 7 },
  slot: { display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 13, background: "#f3f5f8", minWidth: 0 },
  slotEmpty: { display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 13, border: "1px dashed #c9ced8", minWidth: 0 },
  slotNo: { width: 18, fontSize: 14, fontWeight: 950, color: "#5d6574", flex: "none" },
  slotText: { display: "grid", gap: 2, minWidth: 0 },
  slotTitle: { fontSize: 14.5, fontWeight: 900, color: "#1f2430", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  slotSub: { fontSize: 12.5, fontWeight: 700, color: "#4a5262" },
  slotEmptyText: { fontSize: 12.5, fontWeight: 700, color: "#5d6574" },
  planButton: { minHeight: 42, borderRadius: 13, border: "1px solid #d5dae2", background: "transparent", color: "#1f2430", fontSize: 14, fontWeight: 900, cursor: "pointer" },
};
