// 성적 산출 결과(새 UI) 보기 B·C. A(대시보드)는 TeacherGradeAnalyzer.jsx의 기존 지표·등급컷·표를 그대로 씁니다.
// B: 학생 목록 + 오른쪽 상세 / C: 점수 분포 차트(점 하나 = 학생, 세로선 = 등급컷).
import React from "react";

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
  return <section className="kdn-gr-dist">
    <div className="kdn-gr-dist-head">
      <div><span>{combined ? "학기말 환산 점수" : "지필 점수"} 분포</span><b>학생 {points.length}명은 어디에 있을까요?</b><small>점 하나 = 학생 한 명 · 색 = 등급 · 점선 = 등급컷</small></div>
      <div className="kdn-gr-legend">{cutoffs.filter(item => item.count > 0).map(item => <span key={item.grade}><i style={{ background: gradeColor(item.grade) }} />{item.grade}등급 {item.count}</span>)}</div>
    </div>
    <div className="kdn-gr-plot" style={{ height: Math.max(200, maxLevel * (dot + 2) + 64) }}>
      {cutoffs.filter(item => item.grade < cutoffs.length && item.min != null && item.min > low && item.min < high).map(item => <div key={item.grade} className="cut" style={{ left: x(item.min) }}><span>{item.grade}/{item.grade + 1}등급 {fmt(item.min, 1)}</span></div>)}
      {Number.isFinite(stats.average) && <div className="avg" style={{ left: x(stats.average) }}><span>평균 {fmt(stats.average, 1)}</span></div>}
      {placed.map(point => <button key={point.row.sid} type="button" data-kdn-bare aria-label={`${point.row.name || point.row.sid} ${fmt(point.score, 1)}점 ${point.row.grade || "-"}등급`}
        onMouseEnter={() => setHover(point)} onFocus={() => setHover(point)} onClick={() => setHover(point)} className={shown === point ? "is-on" : ""}
        style={{ left: x(point.score), bottom: 30 + (point.level - 1) * (dot + 2), width: dot, height: dot, background: gradeColor(point.row.grade) }} />)}
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
