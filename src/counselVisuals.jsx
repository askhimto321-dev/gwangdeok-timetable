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

function Stat({ label, value, unit, tone = "blue", onClick, title, progress, icon: Icon }) {
  const Tag = onClick ? "button" : "div";
  const toneStyle = toneTileStyle(tone);
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick} title={title} style={{ ...s.stat, ...toneStyle.tile, ...(onClick ? s.statButton : {}) }}>
      <span style={{ ...s.statLabel, ...toneStyle.label }}>{label}{Icon && <Icon size={17} aria-hidden="true" style={{ ...s.statIcon, ...toneStyle.label }} />}</span>
      <b style={{ ...s.statValue, ...(tone === "accent" ? s.statValueAccent : {}) }}>{value}{unit && <small style={s.statUnit}> {unit}</small>}</b>
      {progress != null && <span style={s.progressTrack} aria-hidden="true"><span style={{ ...s.progressFill, width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} /></span>}
    </Tag>
  );
}

const parseRange = text => { const m = String(text || "").match(/(\d+(?:\.\d+)?)\s*[-~–]\s*(\d+(?:\.\d+)?)/); return m ? [Number(m[1]), Number(m[2])] : null; };

// 상담 요약(시안 A): 왼쪽 프로필, 오른쪽 2×2 지표 카드(숫자 + 막대/칩 시각화).
// naviGrade: NAVI와 같은 방식으로 계산한 9등급 환산 { value, range, raw, method, group }
// 상담 학생 요약은 리포트형(진한 머리 + 9등급 눈금 + 한 줄 지표) 하나로 통일합니다.
export function CounselStudentSummary(props) {
  if (!props.student) return null;
  return <CounselSummaryReport {...props} />;
}

// 시안 B: 진한 리포트 머리 + 9등급 눈금 위 학생 위치 + 아래 한 줄 지표. 색은 uiMode.js의 .kdn-sumb 규칙이 정합니다.
function CounselSummaryReport({ student, identity, favoriteCount = 0, planCount, onOpenPlan, naviGrade }) {
  const groups = student.grade5ByGroup || {};
  const isFiveScale = student.gradeSystem !== 9;
  const total = groups.전교과 ?? student.grade5;
  const grade9 = isFiveScale ? naviGrade?.value : total;
  const range = isFiveScale ? parseRange(naviGrade?.range) : null;
  const legacy = isFiveScale && naviGrade?.method === "statistical" && naviGrade?.raw != null ? 2 * naviGrade.raw - 1 : null;
  const pos = v => `${Math.min(100, Math.max(0, ((Number(v) - 1) / 8) * 100))}%`;
  const ok = v => v != null && Number.isFinite(Number(v));
  const classLine = [identity?.grade && `${identity.grade}학년`, identity?.classNumber && `${identity.classNumber}반`, identity?.number && `${identity.number}번`].filter(Boolean).join(" ");
  const mock = student.latestMockSums;
  const methodText = !isFiveScale ? "9등급제 성적" : naviGrade?.method === "statistical" ? `통계 기반 Beta · ${naviGrade.group || "전교과"}` : "기존 환산 2×내신−1";
  return (
    <section className="kdn-sumb" aria-label="학생 요약">
      <div className="kdn-sumb-top">
        <div className="kdn-sumb-id">
          <span className="kdn-sumb-eyebrow">학생 성적 리포트 · 상담</span>
          <div className="kdn-sumb-name"><b>{student.name || "이름 미등록"}</b>{student.sid && <span>{student.sid}</span>}</div>
          <div className="kdn-sumb-chips">{classLine && <span>{classLine}</span>}{student.latestMockLabel && <span>최근 모의고사 {student.latestMockLabel}</span>}<span className="is-accent">{isFiveScale ? "5등급제" : "9등급제"}</span></div>
        </div>
        <div className="kdn-sumb-actions">{onOpenPlan && <button type="button" className="kdn-sumb-cta" onClick={onOpenPlan}>수시 지원 구성 열기</button>}</div>
      </div>
      <div className="kdn-sumb-scale">
        <div className="kdn-sumb-scale-head"><span>9등급 기준 위치 · {methodText}{range && ` · 예상 ${range[0].toFixed(2)} – ${range[1].toFixed(2)}`}</span>{ok(legacy) && <span>회색 선: 기존 환산 {fmt(legacy)}</span>}</div>
        <div className="kdn-sumb-track" aria-hidden="true">
          <i className="bar" />
          {range && <i className="band" style={{ left: pos(range[0]), width: `calc(${pos(range[1])} - ${pos(range[0])})` }} />}
          {ok(legacy) && <i className="ghost" style={{ left: pos(legacy) }} />}
          {ok(grade9) && <><i className="mark" style={{ left: pos(grade9) }} /><b className="tip" style={{ left: pos(grade9) }}>{fmt(grade9)}</b></>}
        </div>
        <div className="kdn-sumb-axis" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <span key={i}>{i + 1}{i === 8 ? "등급" : ""}</span>)}</div>
      </div>
      <div className="kdn-sumb-stats">
        <div><span>전교과 내신</span><b>{fmt(total)}<small>{isFiveScale ? " 5등급제" : " 등급"}</small></b></div>
        {isFiveScale && <div><span>9등급 환산</span><b>{fmt(naviGrade?.value)}</b></div>}
        <div><span>최근 모의고사 3합</span><b>{mock?.sum3 ?? "-"}</b></div>
        <div><span>관심 대학</span><b>{favoriteCount}<small> 곳</small></b></div>
        <div><span>수시 지원 구성</span><b className="is-accent">{planCount == null ? "-" : planCount}<small> / {PLAN_LIMIT}</small></b></div>
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
  // 시안 A
  profile: { display: "flex", flexDirection: "column", gap: 14, paddingRight: 24, borderRight: "1px solid #eceef2", minWidth: 0 },
  eyebrow: { fontSize: 12.5, fontWeight: 600, color: "#b23e0c", letterSpacing: ".04em" },
  plainChip: { display: "inline-flex", alignItems: "center", minHeight: 26, padding: "0 10px", borderRadius: 999, border: "1px solid #dfe2e8", color: "#3a4150", fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" },
  infoRows: { display: "grid", gap: 6, fontSize: 13.5, color: "#5d6574" },
  infoRow: { display: "flex", justifyContent: "space-between", gap: 10 },
  grid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, minWidth: 0 },
  cell: { display: "flex", flexDirection: "column", gap: 6, padding: "16px 18px", borderRadius: 18, border: "1px solid", minWidth: 0, textAlign: "left", font: "inherit", color: "#1f2430" },
  planCell: { background: "#fff8f3", borderColor: "#fbd9c4", cursor: "pointer" },
  cellHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cellLabel: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 600, color: "#3a4150" },
  cellNote: { fontSize: 12.5, color: "#5d6574", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  methodChip: { fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "#e0f2fe", color: "#075985", whiteSpace: "nowrap" },
  valueRow: { display: "flex", alignItems: "baseline", gap: 8 },
  value: { fontSize: 36, fontWeight: 750, letterSpacing: "-.02em", lineHeight: 1.05, color: "#141821", fontVariantNumeric: "tabular-nums" },
  unit: { fontSize: 13.5, color: "#5d6574", fontWeight: 500 },
  axis: { display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#5d6574" },
  subjectChips: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 },
  subjectChip: { padding: "3px 9px", borderRadius: 8, background: "#ede9fe", color: "#4c1d95", fontSize: 13 },
  openLink: { fontSize: 13, fontWeight: 700, color: "#b23e0c" },
  slots: { display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 6, marginTop: 6 },
  slotOn: { height: 12, borderRadius: 4, background: "#e2531a" },
  slotOff: { height: 12, borderRadius: 4, border: "1.5px dashed #f0a37a", boxSizing: "border-box" },

  // 이름 칸은 내용 너비만, 숫자 칸 5개는 남은 너비를 나눠 한 줄로(좁은 화면에서는 가로로 밀어 보기).
  card: { display: "grid", gridTemplateColumns: "minmax(240px, 300px) minmax(0, 1fr)", gap: 24, padding: 24, borderRadius: 24, background: "#ffffff", border: "1px solid #e1e5eb", boxSizing: "border-box", boxShadow: "0 10px 30px rgba(20,24,33,.06)" },
  identity: { display: "flex", alignItems: "center", gap: 14, flex: "0 1 auto", minWidth: 220 },
  avatar: { width: 60, height: 60, boxShadow: "0 0 0 4px #ffe3d1", borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #ff9a5c, #e2531a)", color: "#ffffff", fontSize: 24, fontWeight: 800, flex: "none" },
  identityText: { display: "grid", gap: 6, minWidth: 0, lineHeight: 1.35 },
  eyebrow: { fontSize: 12.5, fontWeight: 800, color: "#5d6574" },
  name: { fontSize: 30, fontWeight: 800, color: "#141821", letterSpacing: "-.025em", lineHeight: 1.1 },
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
  statIcon: { marginLeft: "auto", opacity: 0.55, flex: "none" },
  statLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 650, lineHeight: 1.3, whiteSpace: "nowrap" },
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
