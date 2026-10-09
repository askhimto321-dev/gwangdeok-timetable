// 학생 성적 비교(교사용) 시각화와 인쇄. 값은 Grades.jsx의 buildStudentComparisonRow 결과를 그대로 씁니다.
import React from "react";

export const COMPARE_COLORS = ["#e2531a", "#2563eb", "#16a34a", "#9333ea", "#0891b2", "#ca8a04", "#db2777", "#475569"];
const SEMS = ["1-1", "1-2", "2-1", "2-2", "3-1", "3-2"];
const fmt = value => (value == null || !Number.isFinite(Number(value)) ? "-" : Number(value).toFixed(2));
const esc = value => String(value ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

function rowScale(rows) { return rows.some(row => row.gradeSystem === 9) ? 9 : 5; }

// 학기별 전과목 평균을 학생마다 다른 색 선으로 겹쳐 그립니다(세로축은 값이 있는 구간만 확대).
function trendSvg(rows, { width = 560, height = 230 } = {}) {
  const used = SEMS.filter(key => rows.some(row => row.trend.some(item => item.key === key)));
  const values = rows.flatMap(row => row.trend.map(item => Number(item.value))).filter(Number.isFinite);
  if (!used.length || !values.length) return null;
  const lo = Math.max(1, Math.floor((Math.min(...values) - 0.2) * 10) / 10);
  const hi = Math.max(lo + 0.6, Math.ceil((Math.max(...values) + 0.2) * 10) / 10);
  const padL = 38, padR = 16, top = 16, bottom = 30;
  const x = key => (used.length === 1 ? (padL + width - padR) / 2 : padL + (used.indexOf(key) * (width - padL - padR)) / (used.length - 1));
  const y = value => top + ((value - lo) / (hi - lo)) * (height - top - bottom);
  const ticks = [lo, (lo + hi) / 2, hi];
  return { width, height, used, x, y, ticks };
}

export function CompareOverview({ rows = [], ranked }) {
  const scale = rowScale(rows);
  const ordered = rows.slice().sort((a, b) => (ranked.get(a.sid) || 99) - (ranked.get(b.sid) || 99));
  const chart = trendSvg(rows);
  return <div className="kdn-cmp">
    <section className="kdn-cmp-card">
      <div className="kdn-cmp-head"><b>누적 내신 순위</b><span>전과목 · 막대가 길수록 좋은 성적</span></div>
      <div className="kdn-cmp-bars">{ordered.map(row => {
        const color = COMPARE_COLORS[rows.indexOf(row) % COMPARE_COLORS.length];
        const value = row.overall?.primary;
        const ratio = value == null ? 0 : Math.max(0.04, Math.min(1, (scale + 0.5 - value) / (scale - 0.5)));
        return <div key={row.sid} className="kdn-cmp-bar">
          <span className="rk">{ranked.get(row.sid) || "-"}</span>
          <span className="nm"><i style={{ background: color }} />{row.name}<small>{row.classNumber}반 {row.number}번</small></span>
          <span className="tr"><i style={{ width: `${ratio * 100}%`, background: color }} /></span>
          <span className="vl"><b>{fmt(value)}</b>{row.overall?.converted != null && <small>9환산 {fmt(row.overall.converted)}</small>}</span>
        </div>;
      })}</div>
    </section>
    {chart && <section className="kdn-cmp-card">
      <div className="kdn-cmp-head"><b>학기별 전과목 평균</b><span>위로 갈수록 좋은 성적</span></div>
      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="kdn-cmp-svg" role="img" aria-label="학생별 학기 전과목 평균 추이">
        {chart.ticks.map(tick => <g key={tick}><line x1={36} x2={chart.width - 12} y1={chart.y(tick)} y2={chart.y(tick)} className="grid" /><text x={2} y={chart.y(tick) + 4} className="axis">{tick.toFixed(1)}</text></g>)}
        {chart.used.map((key, i) => <text key={key} x={chart.x(key)} y={chart.height - 8} textAnchor={chart.used.length > 1 && i === 0 ? "start" : chart.used.length > 1 && i === chart.used.length - 1 ? "end" : "middle"} className="sem">{key.replace("-", "학년 ")}학기</text>)}
        {rows.map((row, index) => {
          const color = COMPARE_COLORS[index % COMPARE_COLORS.length];
          const pts = row.trend.filter(item => chart.used.includes(item.key)).map(item => [chart.x(item.key), chart.y(Number(item.value))]);
          return <g key={row.sid}>
            {pts.length > 1 && <polyline points={pts.map(p => p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
            {pts.map(([px, py], i) => <circle key={i} cx={px} cy={py} r="4.5" fill={color} stroke="var(--kdn-surface, #fff)" strokeWidth="2"><title>{`${row.name} ${row.trend.filter(item => chart.used.includes(item.key))[i]?.key} ${fmt(row.trend.filter(item => chart.used.includes(item.key))[i]?.value)}`}</title></circle>)}
            {rows.length <= 3 && pts.map(([px, py], i) => <text key={`t${i}`} x={px} y={py - 9} textAnchor={i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"} fontSize="11.5" fontWeight="800" fill={color}>{fmt(row.trend.filter(item => chart.used.includes(item.key))[i]?.value)}</text>)}
          </g>;
        })}
      </svg>
      <div className="kdn-cmp-legend">{rows.map((row, index) => <span key={row.sid}><i style={{ background: COMPARE_COLORS[index % COMPARE_COLORS.length] }} />{row.name}</span>)}</div>
    </section>}
  </div>;
}

// 학기별 평균 칩: 학기 이름(작은 회색)과 등급(굵은 숫자)을 칸으로 나눠 한눈에 구분합니다.
export function SemesterChips({ trend = [] }) {
  if (!trend.length) return <span style={{ color: "#a0a9b6" }}>-</span>;
  // 클래식 화면에는 새 UI 스타일시트가 없으므로 인라인 스타일(변수 + 기본값)로 그립니다.
  return <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{trend.map(item => <span key={item.key} style={{ display: "inline-flex", alignItems: "stretch", borderRadius: 8, overflow: "hidden", border: "1px solid var(--kdn-line, #dfe5ec)" }}>
    <small style={{ display: "flex", alignItems: "center", padding: "4px 7px", background: "var(--kdn-surface-2, #f1f5f9)", fontSize: 11.5, fontWeight: 600, color: "var(--kdn-muted, #64748b)" }}>{item.key.replace("-", "학년 ")}학기</small>
    <b style={{ display: "flex", alignItems: "center", padding: "4px 8px", fontSize: 14, fontWeight: 800, color: "var(--kdn-ink, #1f2430)", fontVariantNumeric: "tabular-nums" }}>{fmt(item.value)}</b>
  </span>)}</div>;
}

export function printGradeComparison(rows = [], ranked = new Map(), currentGrade = "") {
  if (typeof document === "undefined" || !rows.length) return;
  const chart = trendSvg(rows, { width: 700, height: 230 });
  const svg = chart ? `<svg viewBox="0 0 ${chart.width} ${chart.height}" width="100%" style="max-height:62mm">${chart.ticks.map(t => `<line x1="36" x2="${chart.width - 12}" y1="${chart.y(t)}" y2="${chart.y(t)}" stroke="#dde3ea"/><text x="2" y="${chart.y(t) + 4}" font-size="11" fill="#64748b">${t.toFixed(1)}</text>`).join("")}${chart.used.map(k => `<text x="${chart.x(k)}" y="${chart.height - 8}" font-size="11" text-anchor="middle" fill="#475569">${k}</text>`).join("")}${rows.map((row, i) => { const c = COMPARE_COLORS[i % COMPARE_COLORS.length]; const pts = row.trend.filter(it => chart.used.includes(it.key)).map(it => [chart.x(it.key), chart.y(Number(it.value))]); return (pts.length > 1 ? `<polyline points="${pts.map(p => p.join(",")).join(" ")}" fill="none" stroke="${c}" stroke-width="2.5"/>` : "") + pts.map(([px, py]) => `<circle cx="${px}" cy="${py}" r="3.5" fill="${c}"/>`).join(""); }).join("")}</svg>` : "";
  const cell = value => (value ? `<b>${fmt(value.primary)}</b>${value.converted != null ? `<br><small>9환산 ${fmt(value.converted)}</small>` : ""}` : "-");
  const body = rows.slice().sort((a, b) => (ranked.get(a.sid) || 99) - (ranked.get(b.sid) || 99)).map(row => `<tr><td class="c">${ranked.get(row.sid) || "-"}</td><td><span class="dot" style="background:${COMPARE_COLORS[rows.indexOf(row) % COMPARE_COLORS.length]}"></span><b>${esc(row.name)}</b><br><small>${esc(row.sid)} · ${esc(row.classNumber)}반 ${esc(row.number)}번</small></td><td class="c">${cell(row.overall)}</td><td class="c">${cell(row.coreAll)}</td><td class="c">${cell(row.coreScience)}</td><td class="c">${cell(row.coreSocial)}</td><td>${row.trend.map(it => `<span class="chip"><small>${it.key}</small> <b>${fmt(it.value)}</b></span>`).join(" ")}</td></tr>`).join("");
  const css = `@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{margin:0;font:9.5pt/1.4 Pretendard,"Malgun Gothic",sans-serif;color:#1f2430;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1f2430;padding-bottom:6px;margin-bottom:8px}h1{margin:0;font-size:15pt}header span{font-size:8.5pt;color:#64748b}
    table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #cbd5e1;padding:5px 6px;vertical-align:middle}th{background:#f1f5f9;font-size:8.5pt}td.c{text-align:center}small{color:#64748b;font-size:7.5pt}
    .dot{display:inline-block;width:8px;height:8px;border-radius:99px;margin-right:5px}.chip{display:inline-block;border:1px solid #e2e8f0;border-radius:5px;padding:1px 5px;margin:1px;font-size:8pt}`;
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>학생 성적 비교</title><style>${css}</style></head><body><header><h1>학생 성적 비교 · ${esc(currentGrade)}학년 ${rows.length}명</h1><span>숫자가 낮을수록 상위 · 출력 ${new Date().toLocaleDateString("ko-KR")}</span></header>${svg}<table><thead><tr><th>순위</th><th>학생</th><th>전과목 누적</th><th>국·영·수·사·과</th><th>국·영·수·과</th><th>국·영·수·사</th><th>학기별 전과목 평균</th></tr></thead><tbody>${body}</tbody></table></body></html>`;
  const frame = document.createElement("iframe");
  frame.title = "학생 성적 비교 인쇄";
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1100px;height:760px;border:0";
  frame.onload = () => { try { frame.contentWindow?.focus(); frame.contentWindow?.print(); } catch { frame.remove(); } };
  frame.srcdoc = html;
  document.body.appendChild(frame);
  window.setTimeout(() => frame.remove(), 300000);
}
