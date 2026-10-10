// 새 UI(다크·라이트)에서 NAVI 결과와 상담 관심대학 카드가 함께 쓰는 시각 요소입니다.
// - CutStrip: 전형별 컷 비교 표(50%·70% 컷, 학생과의 차이, 지원 구간 배지)
// - SupportBandTiles: 지원 구간(상향~하향)별 개수 타일(누르면 해당 구간만 보기)
// 색은 admissionMetrics.js의 SUPPORT_BAND_META(라이트 기준 값)를 그대로 쓰고,
// 다크 모드 변환은 uiMode.js가 렌더 시점에 일괄 처리합니다.
import React from "react";
import { SUPPORT_BAND_META, supportBandValue, validGrade } from "./admissionMetrics.js";

// 위치 막대 눈금 범위(9등급 환산 기준). 대부분의 수시 컷이 1~6 사이라 이 범위로 고정해
// 카드끼리 막대 위치를 바로 비교할 수 있게 합니다. 범위를 벗어난 값은 양 끝에 붙습니다.
const SCALE_MIN = 1;
const SCALE_MAX = 6;
const percent = grade => {
  const clamped = Math.min(SCALE_MAX, Math.max(SCALE_MIN, grade));
  return ((clamped - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;
};
const fmt = value => (validGrade(value) == null ? "-" : Number(value).toFixed(2));

export function supportBandFor(studentGrade, cutoff) {
  const result = supportBandValue(studentGrade, cutoff);
  return result ? { ...result, ...SUPPORT_BAND_META[result.label] } : null;
}

export function BandPill({ band, size = "md" }) {
  if (!band) return <span style={{ ...pill.base, ...pill[size], color: "#5a6b7d", background: "#eef1f5", borderColor: "#d7dee6" }}>판정 불가</span>;
  return <span style={{ ...pill.base, ...pill[size], color: band.color, background: band.background, borderColor: band.border }}>{band.label}</span>;
}

function TrackChip({ kind }) {
  const holistic = /종합/.test(kind || "");
  return <span style={{ ...chip.base, ...(holistic ? chip.holistic : chip.teaching) }}>{holistic ? "종합" : "교과"}</span>;
}

export function CutPositionBar({ student, cut50, cut70, band }) {
  const c50 = validGrade(cut50), c70 = validGrade(cut70), s = validGrade(student);
  const lo = c50 != null && c70 != null ? Math.min(c50, c70) : (c50 ?? c70);
  const hi = c50 != null && c70 != null ? Math.max(c50, c70) : (c50 ?? c70);
  const label = `50%컷 ${fmt(cut50)}, 70%컷 ${fmt(cut70)}${s != null ? `, 학생 ${fmt(s)}` : ""}`;
  return (
    <span role="img" aria-label={label} title={label} style={bar.track}>
      <span style={bar.line} />
      {lo != null && <span style={{ ...bar.range, left: `${percent(lo)}%`, width: `${Math.max(2.5, percent(hi) - percent(lo))}%`, background: band?.color || "#7d8796" }} />}
      {s != null && <span style={{ ...bar.student, left: `calc(${percent(s)}% - 2px)` }} />}
    </span>
  );
}

// 컷 차이 막대(가운데 = 컷): 학생 성적이 컷보다 좋으면 오른쪽 초록, 부족하면 왼쪽 빨강으로 뻗습니다.
function MarginBar({ margin }) {
  if (margin == null) return <span style={cut.marginTrack} />;
  const width = `${Math.min(1, Math.abs(margin) / 1.5) * 50}%`;
  const good = margin >= 0;
  return <span style={cut.marginTrack} aria-hidden="true">
    <span style={cut.marginCenter} />
    <span style={{ ...cut.marginFill, ...(good ? { left: "50%", background: "#16a34a" } : { right: "50%", background: "#dc2626" }), width }} />
  </span>;
}

// items: [{ kind: "교과"|"종합", name, cut50, cut70 }]
// 전형별 컷 비교 표: 수직선 대신 숫자(50%·70% 컷)와 "컷보다 얼마나 여유/부족한지"를 크게 보여줍니다.
export function CutStrip({ items = [], studentGrade, cutoffBasis = "70", limit = 4, onMore, compact = false }) {
  const rows = items.filter(item => validGrade(item.cut50) != null || validGrade(item.cut70) != null);
  if (!rows.length) return null;
  const shown = rows.slice(0, limit);
  const hasStudent = validGrade(studentGrade) != null;
  return (
    <div style={{ ...strip.wrap, ...(compact ? strip.wrapCompact : {}) }}>
      <div style={strip.head}>
        <span>전형별 컷 비교 <small style={strip.headHint}>{hasStudent ? `학생 9등급 ${fmt(studentGrade)} · ${cutoffBasis}% 컷 기준 판정` : `${cutoffBasis}% 컷 기준`}</small></span>
        {hasStudent && <span style={strip.legend}><span style={strip.legendItem}><i style={{ ...cut.legendDot, background: "#16a34a" }} />컷보다 여유</span><span style={strip.legendItem}><i style={{ ...cut.legendDot, background: "#dc2626" }} />컷보다 부족</span></span>}
      </div>
      <div className="kdn-cutstrip-head" style={cut.headRow}><span>전형</span><span style={cut.num}>50% 컷</span><span style={cut.num}>70% 컷</span>{hasStudent && <span style={{ textAlign: "center" }}>내 성적과 차이</span>}<span style={{ textAlign: "right" }}>판정</span></div>
      {shown.map((item, index) => {
        const basisCut = cutoffBasis === "50" ? item.cut50 : item.cut70;
        const band = hasStudent ? supportBandFor(studentGrade, basisCut) : null;
        const margin = band ? -band.diff : null;
        return (
          <div key={`${item.kind}-${item.name}-${index}`} className="kdn-cutstrip-row" style={{ ...cut.row, ...(index % 2 ? cut.rowAlt : {}) }}>
            <span style={strip.name}><TrackChip kind={item.kind} /><b style={strip.nameText} title={item.name}>{item.name || item.kind}</b></span>
            <span style={{ ...cut.num, ...(cutoffBasis === "50" ? cut.numOn : {}) }}>{fmt(item.cut50)}</span>
            <span style={{ ...cut.num, ...(cutoffBasis !== "50" ? cut.numOn : {}) }}>{fmt(item.cut70)}</span>
            {hasStudent && <span style={cut.diffCell}>
              <b style={{ ...cut.diff, color: margin == null ? "#5a6b7d" : margin >= 0 ? "#15803d" : "#b91c1c" }}>{margin == null ? "-" : `${Math.abs(margin).toFixed(2)} ${margin >= 0 ? "여유" : "부족"}`}</b>
              <MarginBar margin={margin} />
            </span>}
            <span style={{ textAlign: "right" }}>{hasStudent ? <BandPill band={band} size="sm" /> : <small style={strip.noStudent}>학생 내신 없음</small>}</span>
          </div>
        );
      })}
      {rows.length > shown.length && (onMore
        ? <button type="button" onClick={onMore} style={strip.more}>외 {rows.length - shown.length}개 전형 더 보기</button>
        : <small style={strip.moreText}>외 {rows.length - shown.length}개 전형</small>)}
    </div>
  );
}

const cut = {
  headRow: { display: "grid", gridTemplateColumns: "minmax(140px,1.6fr) 70px 70px minmax(150px,1.2fr) 70px", gap: 10, padding: "0 10px 6px", fontSize: 12, fontWeight: 700, color: "#5d6574", borderBottom: "1px solid #e3e6ec" },
  row: { display: "grid", gridTemplateColumns: "minmax(140px,1.6fr) 70px 70px minmax(150px,1.2fr) 70px", gap: 10, alignItems: "center", padding: "9px 10px", borderRadius: 10 },
  rowAlt: { background: "rgba(100,116,139,.06)" },
  num: { textAlign: "right", fontSize: 14.5, fontWeight: 600, color: "#5d6574", fontVariantNumeric: "tabular-nums" },
  numOn: { fontSize: 16, fontWeight: 800, color: "#1f2430" },
  diffCell: { display: "grid", gap: 4, justifyItems: "center" },
  diff: { fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  marginTrack: { position: "relative", display: "block", width: "100%", maxWidth: 160, height: 8, borderRadius: 999, background: "#eef0f4" },
  marginCenter: { position: "absolute", left: "50%", top: -3, width: 2, height: 14, marginLeft: -1, borderRadius: 1, background: "#64748b" },
  marginFill: { position: "absolute", top: 0, height: 8, borderRadius: 999 },
  legendDot: { display: "inline-block", width: 9, height: 9, borderRadius: 99 },
};

// counts: { 상향: n, ... }, active: ["상향", ...]
export function SupportBandTiles({ counts = {}, active = [], disabled = false, onToggle, onReset }) {
  return (
    <div style={tiles.wrap}>
      <div style={tiles.head}><b>지원 구간 분포</b><span>{disabled ? "학생 내신을 입력하면 구간별로 나뉩니다." : "누르면 해당 구간만 봅니다. 여러 개를 함께 고를 수 있습니다."}</span>{active.length > 0 && <button type="button" onClick={onReset} style={tiles.reset}>전체 보기</button>}</div>
      <div style={tiles.grid}>
        {Object.entries(SUPPORT_BAND_META).map(([label, meta]) => {
          const on = active.includes(label);
          return (
            <button key={label} type="button" aria-pressed={on} disabled={disabled} onClick={() => onToggle?.(label)} style={{ ...tiles.tile, borderColor: on ? meta.color : `${meta.color} #e1e5eb #e1e5eb`, ...(on ? { background: meta.background } : {}), opacity: disabled ? 0.5 : 1 }}>
              <span style={tiles.tileHead}><b style={{ ...tiles.label, color: meta.color }}>{label}</b><small style={tiles.detail}>{meta.detail}</small></span>
              <span style={tiles.count}>{disabled ? "-" : (counts[label] || 0).toLocaleString()}<small style={tiles.unit}> 개 전형</small></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const pill = {
  base: { display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 999, border: "1px solid", fontWeight: 900, whiteSpace: "nowrap", letterSpacing: "-.01em" },
  md: { padding: "4px 11px", fontSize: 13 },
  sm: { padding: "3px 9px", fontSize: 12 },
};
const chip = {
  base: { display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 999, fontSize: 11.5, fontWeight: 900, flex: "none" },
  teaching: { color: "#1f6b65", background: "#e3f4f1" },
  holistic: { color: "#6a3fa0", background: "#f1eafb" },
};
const bar = {
  track: { position: "relative", display: "block", height: 18, minWidth: 120 },
  line: { position: "absolute", left: 0, right: 0, top: 8, height: 2, borderRadius: 2, background: "#d9dee6" },
  range: { position: "absolute", top: 4, height: 10, borderRadius: 999, opacity: 0.9 },
  student: { position: "absolute", top: 0, width: 4, height: 18, borderRadius: 2, background: "var(--kdn-accent, #cf4a12)" },
};
const strip = {
  wrap: { display: "grid", gap: 8, padding: "12px 14px", borderRadius: 14, background: "#f6f7fa", border: "1px solid #e3e6ec" },
  wrapCompact: { padding: "10px 12px", gap: 6 },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, fontWeight: 900, color: "#2a3140" },
  headHint: { fontSize: 11.5, fontWeight: 700, color: "#5d6574" },
  legend: { display: "flex", gap: 12, fontSize: 12, fontWeight: 700, color: "#4a5262" },
  legendItem: { display: "inline-flex", alignItems: "center", gap: 5 },
  legendRange: { width: 18, height: 7, borderRadius: 999, background: "#8a93a3" },
  legendStudent: { width: 4, height: 13, borderRadius: 2, background: "var(--kdn-accent, #cf4a12)" },
  row: { display: "grid", gridTemplateColumns: "minmax(120px, 1.1fr) minmax(150px, 2fr) auto", alignItems: "center", gap: 12 },
  name: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 },
  nameText: { fontSize: 13.5, fontWeight: 900, color: "#1f2430", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  barCell: { display: "grid", gap: 2, minWidth: 0 },
  numbers: { fontSize: 11.5, fontWeight: 700, color: "#4a5262" },
  band: { display: "flex", justifyContent: "flex-end" },
  noStudent: { fontSize: 11.5, fontWeight: 700, color: "#5d6574" },
  more: { justifySelf: "start", border: 0, background: "none", padding: "2px 0", fontSize: 12.5, fontWeight: 900, color: "var(--kdn-accent-text, #b23e0c)", cursor: "pointer" },
  moreText: { fontSize: 12, fontWeight: 700, color: "#5d6574" },
};
const tiles = {
  wrap: { display: "grid", gap: 10 },
  head: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", fontSize: 13, color: "#4a5262" },
  reset: { marginLeft: "auto", border: "1px solid #d5dae2", background: "#fff", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 900, color: "#2a3140", cursor: "pointer" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 },
  tile: { display: "grid", gap: 8, textAlign: "left", padding: "12px 14px", borderRadius: 16, background: "#fff", borderWidth: "4px 1px 1px", borderStyle: "solid", cursor: "pointer", font: "inherit", color: "#1f2430" },
  tileHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 },
  label: { fontSize: 15, fontWeight: 950 },
  detail: { fontSize: 11, fontWeight: 700, color: "#5d6574" },
  count: { fontSize: 26, fontWeight: 950, lineHeight: 1 },
  unit: { fontSize: 12, fontWeight: 700, color: "#5d6574" },
};
