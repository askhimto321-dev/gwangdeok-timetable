// 성적 산출 결과(새 UI) 보기 B·C. A(대시보드)는 TeacherGradeAnalyzer.jsx의 기존 지표·등급컷·표를 그대로 씁니다.
// B: 학생 목록 + 오른쪽 상세 / C: 점수 분포 차트(점 하나 = 학생, 세로선 = 등급컷).
import React from "react";
import { rawColors } from "./uiMode.js";

const fmt = (value, digits = 1) => (value == null || !Number.isFinite(Number(value)) ? "-" : Number(value).toFixed(digits));
const GRADE_COLORS = ["#e2531a", "#f08a4b", "#f6b26b", "#94a3b8", "#64748b", "#475569", "#334155", "#1e293b", "#0f172a"];
const gradeColor = grade => GRADE_COLORS[Math.max(0, Math.min(GRADE_COLORS.length - 1, (Number(grade) || 9) - 1))];

export function ResultListDetail({ rows = [], scoreOf, maxScore = 100, written = [], areas = [], combined = false, total = 0, onEdit }) {
  const sorted = React.useMemo(() => [...rows].sort((a, b) => (a.rank || 9999) - (b.rank || 9999) || (scoreOf(b) ?? -1) - (scoreOf(a) ?? -1)), [rows, scoreOf]);
  const [selectedSid, setSelectedSid] = React.useState("");
  const selected = sorted.find(row => row.sid === selectedSid) || sorted[0] || null;
  const onKey = event => {
    if (!selected || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    const index = sorted.indexOf(selected);
    const next = sorted[Math.max(0, Math.min(sorted.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))];
    if (next) setSelectedSid(next.sid);
  };
  if (!sorted.length) return <div className="kdn-gr-empty">조건에 맞는 학생이 없습니다.</div>;
  const score = selected ? scoreOf(selected) : null;
  const percentile = selected?.rank && total ? Math.max(1, Math.round((selected.rank / total) * 100)) : null;
  const parts = combined ? [
    ...written.map(item => ({ label: item.title, value: selected?.writtenScores?.[item.id], max: Number(item.maxScore) || 100 })),
    ...areas.map(area => ({ label: area.name, value: selected?.areaScores?.[area.id], max: Number(area.maxScore) || 100 })),
  ] : [];
  return <div className="kdn-gr-split">
    <div className="kdn-gr-list" role="listbox" tabIndex={0} aria-label="학생 목록 (위·아래 화살표로 이동)" onKeyDown={onKey}>
      <div className="kdn-gr-list-head"><b>학생 {sorted.length}명</b><span>석차 순 · ↑↓로 이동</span></div>
      {sorted.map(row => <button key={row.sid} type="button" data-kdn-bare role="option" aria-selected={row === selected} className={row === selected ? "is-on" : ""} onClick={() => setSelectedSid(row.sid)}>
        <span className="no">{row.rank || "-"}</span>
        <span className="who"><b>{row.name || row.sid}</b><small>{row.classNumber ? `${row.classNumber}반 ${row.number || ""}번` : row.sid}</small></span>
        <span className="sc">{fmt(scoreOf(row), combined ? 2 : 1)}</span>
        {row.grade ? <span className="gr" style={{ background: gradeColor(row.grade) }}>{row.grade}</span> : <span className="gr is-none">-</span>}
      </button>)}
    </div>
    {selected && <section className="kdn-gr-detail">
      <div className="kdn-gr-detail-head">
        <span className="kdn-gr-avatar">{String(selected.name || "?").charAt(0)}</span>
        <div><b>{selected.name || "이름 없음"}</b><small>{selected.sid} · {selected.classNumber || "-"}반 {selected.number || "-"}번{selected.excluded ? " · 산출 제외" : ""}</small></div>
        {onEdit && <button type="button" onClick={() => onEdit(selected)}>성적 수정</button>}
      </div>
      <div className="kdn-gr-kpis">
        <div className="is-dark"><span>{combined ? "환산 점수" : "점수"}</span><b>{fmt(score, combined ? 2 : 1)}</b><small>{maxScore}점 만점</small></div>
        <div><span>석차</span><b>{selected.rank || "-"}<small> / {total}</small></b><small>{selected.tieCount > 1 ? `동석차 ${selected.tieCount}명` : percentile ? `상위 ${percentile}%` : ""}</small></div>
        <div className="is-accent"><span>등급</span><b>{selected.grade || "-"}</b><small>{selected.grade ? "등급" : "산출 전"}</small></div>
        {combined && <div><span>성취도</span><b>{selected.achievement || "-"}</b><small>{selected.officialScore != null ? `원점수 ${selected.officialScore}` : ""}</small></div>}
      </div>
      {parts.length > 0 && <div className="kdn-gr-parts">
        <div className="kdn-gr-parts-head"><b>평가별 점수</b><span>막대 = 만점 대비 비율</span></div>
        {parts.map(part => { const ratio = part.value == null ? 0 : Math.max(0, Math.min(1, Number(part.value) / part.max)); return <div key={part.label} className="kdn-gr-part"><span>{part.label}</span><div className="bar"><i style={{ width: `${ratio * 100}%` }} /></div><b>{fmt(part.value, 1)}<small> / {part.max}</small></b></div>; })}
      </div>}
      {selected.rank && total > 0 && <div className="kdn-gr-pos">
        <div className="kdn-gr-parts-head"><b>학년 내 위치</b><span>왼쪽일수록 높은 석차</span></div>
        <div className="track"><i style={{ left: `${Math.min(100, ((selected.rank - 1) / Math.max(1, total - 1)) * 100)}%` }} /></div>
        <div className="axis"><span>1등</span><span>{Math.round(total / 2)}등</span><span>{total}등</span></div>
      </div>}
    </section>}
  </div>;
}

export function ResultDistribution({ rows = [], scoreOf, maxScore = 100, cutoffs = [], stats = {}, combined = false, total = 0 }) {
  const points = React.useMemo(() => rows.map(row => ({ row, score: scoreOf(row) })).filter(point => Number.isFinite(point.score)), [rows, scoreOf]);
  const [hover, setHover] = React.useState(null);
  if (!points.length) return <div className="kdn-gr-empty">점수가 있는 학생이 없습니다.</div>;
  const low = Math.max(0, Math.floor(Math.min(...points.map(p => p.score)) / 10) * 10);
  const high = Math.min(Number(maxScore) || 100, Math.ceil(Math.max(...points.map(p => p.score)) / 10) * 10) || 100;
  const span = Math.max(10, high - low);
  const x = value => `${((value - low) / span) * 100}%`;
  // 같은 2점 구간에 모인 학생은 위로 쌓아(beeswarm) 겹치지 않게 합니다.
  const stacks = {};
  const placed = [...points].sort((a, b) => a.score - b.score).map(point => {
    const bin = Math.round(point.score / (span / 50));
    const level = stacks[bin] = (stacks[bin] || 0) + 1;
    return { ...point, level };
  });
  const maxLevel = Math.max(...placed.map(p => p.level));
  const dot = Math.max(7, Math.min(16, 220 / maxLevel));
  const ticks = Array.from({ length: Math.floor(span / 10) + 1 }, (_, index) => low + index * 10);
  const shown = hover || placed[placed.length - 1];
  const ordered = cutoffs.filter(item => item.min != null).slice().sort((a, b) => a.grade - b.grade);
  const zones = ordered.map((item, index) => {
    const hi = index === 0 ? high : ordered[index - 1].min;
    const lo = index === ordered.length - 1 ? low : item.min;
    return { grade: item.grade, lo: Math.max(low, Math.min(high, lo)), hi: Math.max(low, Math.min(high, hi)) };
  }).filter(zone => zone.hi - zone.lo > 0.01);
  return <section className="kdn-gr-dist">
    <div className="kdn-gr-dist-head">
      <div><span>{combined ? "학기말 환산 점수" : "지필 점수"} 분포</span><b>학생 {points.length}명은 어디에 있을까요?</b><small>점 하나 = 학생 한 명 · 색 띠 = 등급 구간 · 흰 선 = 등급컷</small></div>
      <div className="kdn-gr-legend">{cutoffs.filter(item => item.count > 0).map(item => <span key={item.grade}><i style={{ background: gradeColor(item.grade) }} />{item.grade}등급 {item.count}</span>)}</div>
    </div>
    <div className="kdn-gr-plot" style={{ height: Math.max(230, maxLevel * (dot + 2) + 96) }}>
      {/* 등급 구간을 옅은 등급색 띠로 깔고, 띠 아래에 등급 이름을 붙여 경계가 한눈에 보이게 합니다. */}
      {zones.map(zone => <div key={`z${zone.grade}`} className="zone" style={{ left: x(zone.lo), width: `${((zone.hi - zone.lo) / span) * 100}%`, "--zc": gradeColor(zone.grade) }}><em>{zone.grade}등급</em></div>)}
      {cutoffs.filter(item => item.grade < cutoffs.length && item.min != null && item.min > low && item.min < high).map((item, index) => <div key={item.grade} className={`cut${index % 2 ? " alt" : ""}`} style={{ left: x(item.min) }}><span>{item.grade}|{item.grade + 1}등급 <b>{fmt(item.min, 1)}</b></span></div>)}
      {Number.isFinite(stats.average) && <div className="avg" style={{ left: x(stats.average) }}><span>평균 {fmt(stats.average, 1)}</span></div>}
      {placed.map(point => <button key={point.row.sid} type="button" data-kdn-bare aria-label={`${point.row.name || point.row.sid} ${fmt(point.score, 1)}점 ${point.row.grade || "-"}등급`}
        onMouseEnter={() => setHover(point)} onFocus={() => setHover(point)} onClick={() => setHover(point)} className={shown === point ? "is-on" : ""}
        style={{ left: x(point.score), bottom: 52 + (point.level - 1) * (dot + 2), width: dot, height: dot, background: gradeColor(point.row.grade) }} />)}
      <div className="axis">{ticks.map(tick => <span key={tick} style={{ left: x(tick) }}>{tick}</span>)}</div>
    </div>
    <div className="kdn-gr-dist-foot">
      {shown && <div className="tip"><b>{shown.row.name || shown.row.sid}</b><span>{shown.row.classNumber ? `${shown.row.classNumber}반 ${shown.row.number || ""}번 · ` : ""}{fmt(shown.score, combined ? 2 : 1)}점 · {shown.row.grade || "-"}등급 · 석차 {shown.row.rank || "-"}</span></div>}
      <div className="stat"><span>평균</span><b>{fmt(stats.average, 1)}</b></div>
      <div className="stat"><span>최고</span><b>{fmt(stats.max, 1)}</b></div>
      <div className="stat"><span>최저</span><b>{fmt(stats.min, 1)}</b></div>
      <div className="stat"><span>산출 인원</span><b>{total}</b></div>
    </div>
  </section>;
}

// D: 반별 비교. 같은 시험(또는 학기말 환산)을 반끼리 비교합니다.
// - 평균 막대(0점 기준)와 전체 평균 점선
// - 등급 띠: 반 안의 등급 인원
// - 학기말 보기에서는 정기시험(1차·2차 …)별 반 평균과 변화를 표로 함께 보여줍니다.
const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};
function classStatsOf(rows, scoreOf, gradeSystem) {
  const groups = new Map();
  rows.forEach(row => {
    if (row.excluded) return;
    const score = scoreOf(row);
    if (!Number.isFinite(score)) return;
    const key = String(row.classNumber || "?");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });
  return Array.from(groups.entries()).map(([classNo, list]) => {
    const scores = list.map(scoreOf).sort((a, b) => a - b);
    const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
    const sd = Math.sqrt(scores.reduce((sum, value) => sum + (value - mean) ** 2, 0) / scores.length);
    const grades = Array.from({ length: gradeSystem }, (_, index) => list.filter(row => Number(row.grade) === index + 1).length);
    return { classNo, rows: list, n: scores.length, mean, sd, min: scores[0], max: scores[scores.length - 1], median: quantile(scores, 0.5), q1: quantile(scores, 0.25), q3: quantile(scores, 0.75), grades };
  }).sort((a, b) => b.mean - a.mean);
}
export function ResultClassCompare({ rows = [], scoreOf, maxScore = 100, gradeSystem = 5, written = [], combined = false, title = "" }) {
  const [sortKey, setSortKey] = React.useState("mean");
  const stats = React.useMemo(() => classStatsOf(rows, scoreOf, gradeSystem), [rows, scoreOf, gradeSystem]);
  if (stats.length < 2) return <div className="kdn-gr-empty">반이 2개 이상일 때 반별 비교를 볼 수 있습니다.</div>;
  const all = stats.flatMap(stat => stat.rows.map(scoreOf));
  const overall = all.reduce((sum, value) => sum + value, 0) / all.length;
  const sorters = { mean: (a, b) => b.mean - a.mean, median: (a, b) => b.median - a.median, top: (a, b) => (b.grades[0] / b.n) - (a.grades[0] / a.n), sd: (a, b) => a.sd - b.sd, classNo: (a, b) => Number(a.classNo) - Number(b.classNo) };
  const ordered = stats.slice().sort(sorters[sortKey] || sorters.mean);
  const rankOf = new Map(stats.map((stat, index) => [stat.classNo, index + 1]));
  const barMax = Math.min(Number(maxScore) || 100, Math.ceil((Math.max(...stats.map(stat => stat.mean)) + 8) / 10) * 10) || 100;
  // 학기말 보기: 정기시험별 반 평균(득점) 표
  const examRows = combined ? stats.slice().sort((a, b) => Number(a.classNo) - Number(b.classNo)).map(stat => ({
    classNo: stat.classNo,
    exams: written.map(item => { const values = stat.rows.map(row => Number(row.writtenScores?.[item.id])).filter(Number.isFinite); return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null; }),
  })) : [];
  const examOverall = written.map(item => { const values = stats.flatMap(stat => stat.rows.map(row => Number(row.writtenScores?.[item.id]))).filter(Number.isFinite); return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null; });
  return <section className="kdn-gr-cls">
    <div className="kdn-gr-cls-head">
      <div><span>{title || (combined ? "학기말 환산 점수" : "지필 점수")} · 반별 비교</span><b>{stats.length}개 반 · 전체 평균 {fmt(overall, 1)}점</b><small>막대 = 반 평균 · 점선 = 전체 평균 · 오른쪽 = 반 안의 등급 인원. 중앙값·최고·최저는 아래 표에 있습니다.</small></div>
      <div className="kdn-gr-cls-sort" role="group" aria-label="반 정렬 기준"><span>정렬</span>{[["mean", "평균"], ["median", "중앙값"], ["top", "1등급 비율"], ["sd", "고른 정도"], ["classNo", "반 순서"]].map(([key, label]) => <button key={key} type="button" data-kdn-bare aria-pressed={sortKey === key} onClick={() => setSortKey(key)}>{label}</button>)}</div>
    </div>
    {/* 반별 평균 막대(0점 기준, 값은 막대 끝에) + 등급 구성 100% 막대. 세부 통계는 아래 표에서 봅니다. */}
    <div className="kdn-gr-cls-chart">
      <div className="kdn-gr-cls-colhead"><span /><span>평균 점수 <small>(점선 = 전체 평균 {fmt(overall, 1)})</small></span><span>전체 대비</span><span>등급 구성 <small>(명)</small></span></div>
      {ordered.map(stat => { const rank = rankOf.get(stat.classNo); const gap = stat.mean - overall; return <div key={stat.classNo} className={`kdn-gr-cls-row${rank <= 3 ? " is-top" : ""}`}>
        <div className="lbl"><span className={`rk${rank <= 3 ? " top" : ""}`}>{rank}</span><b>{stat.classNo}반</b><small>{stat.n}명</small></div>
        <div className="bartrack"><i className="avgline" style={{ left: `${(overall / barMax) * 100}%` }} /><span className="bar" style={{ width: `${Math.max(2, (stat.mean / barMax) * 100)}%` }}><b>{fmt(stat.mean, 1)}</b></span></div>
        <div className={`gap ${gap >= 0 ? "up" : "down"}`}>{gap >= 0 ? "▲" : "▼"} {fmt(Math.abs(gap), 1)}</div>
        <div className="grades" title={stat.grades.map((count, index) => `${index + 1}등급 ${count}명`).join(" · ")}>{rawColors(() => stat.grades.map((count, index) => count ? <span key={index} style={{ flex: count, background: gradeColor(index + 1), color: "#ffffff" }}>{count / stat.n >= 0.08 ? count : ""}</span> : null))}</div>
      </div>; })}
      <div className="legend"><span><i className="bar" />반 평균</span><span><i className="avgline" />전체 평균</span>{rawColors(() => Array.from({ length: Math.min(gradeSystem, 5) }, (_, index) => <span key={index}><i style={{ background: gradeColor(index + 1) }} />{index + 1}등급</span>))}{gradeSystem > 5 && <span>…</span>}</div>
    </div>
    <div className="kdn-gr-cls-tablewrap"><table className="kdn-gr-cls-table">
      <thead><tr><th>순위</th><th>반</th><th>인원</th><th>평균</th><th>전체 대비</th><th>중앙값</th><th>최고</th><th>최저</th><th>표준편차</th><th>1등급</th></tr></thead>
      <tbody>{ordered.map(stat => <tr key={stat.classNo}><td><span className={`rk${rankOf.get(stat.classNo) <= 3 ? " top" : ""}`}>{rankOf.get(stat.classNo)}</span></td><td><b>{stat.classNo}반</b></td><td>{stat.n}명</td><td><b>{fmt(stat.mean, 1)}</b></td><td><span className={stat.mean - overall >= 0 ? "up" : "down"}>{stat.mean - overall >= 0 ? "▲" : "▼"} {fmt(Math.abs(stat.mean - overall), 1)}</span></td><td>{fmt(stat.median, 1)}</td><td>{fmt(stat.max, 1)}</td><td>{fmt(stat.min, 1)}</td><td>{fmt(stat.sd, 1)}</td><td>{stat.grades[0]}명 <small>({fmt(stat.grades[0] / stat.n * 100, 0)}%)</small></td></tr>)}</tbody>
    </table></div>
    {combined && written.length > 0 && <div className="kdn-gr-cls-tablewrap"><table className="kdn-gr-cls-table">
      <caption>정기시험별 반 평균 (원점수)</caption>
      <thead><tr><th>반</th>{written.map(item => <th key={item.id}>{item.title}<small> / {item.maxScore || 100}</small></th>)}{written.length >= 2 && <th>{written[0].title} → {written[written.length - 1].title}</th>}</tr></thead>
      <tbody>{examRows.map(row => { const first = row.exams[0], last = row.exams[row.exams.length - 1]; const d = first != null && last != null ? last - first : null; return <tr key={row.classNo}><td><b>{row.classNo}반</b></td>{row.exams.map((value, index) => <td key={written[index].id}>{fmt(value, 1)}{value != null && examOverall[index] != null && <small className={value - examOverall[index] >= 0 ? "up" : "down"}> {value - examOverall[index] >= 0 ? "+" : "−"}{fmt(Math.abs(value - examOverall[index]), 1)}</small>}</td>)}{written.length >= 2 && <td>{d == null ? "-" : <span className={d >= 0 ? "up" : "down"}>{d >= 0 ? "▲" : "▼"} {fmt(Math.abs(d), 1)}</span>}</td>}</tr>; })}
        <tr className="total"><td><b>전체</b></td>{examOverall.map((value, index) => <td key={written[index].id}><b>{fmt(value, 1)}</b></td>)}{written.length >= 2 && <td>{examOverall[0] != null && examOverall[examOverall.length - 1] != null ? fmt(examOverall[examOverall.length - 1] - examOverall[0], 1) : "-"}</td>}</tr></tbody>
    </table></div>}
  </section>;
}
