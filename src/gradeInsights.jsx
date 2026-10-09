// 학생 성적 리포트(새 UI): 시안 C 인사이트형 + 과목×학기 히트맵.
// 값은 Grades.jsx가 이미 계산한 교과군별 학기 평균(displayGroups)과 학기별 과목 목록(subjectLists)을 그대로 씁니다.
import React from "react";
import { getSubjectGrade, normalizeCategory } from "./gradeEngine.js";

const CATEGORIES = [
  ["국어", "#2563eb"],
  ["수학", "#16a34a"],
  ["영어", "#9333ea"],
  ["사회", "#c2410c"],
  ["과학", "#0891b2"],
];
// 값이 모인 구간만 확대해서 그립니다(1~5 전체 눈금이면 1.3~1.5 차이가 거의 평평하게 보임). 최소 0.6 폭.
function domainOf(values, scale) {
  const valid = values.filter(value => value != null).map(Number);
  if (!valid.length) return [1, scale];
  let lo = Math.max(1, Math.floor((Math.min(...valid) - 0.15) * 10) / 10);
  let hi = Math.min(scale, Math.ceil((Math.max(...valid) + 0.15) * 10) / 10);
  if (hi - lo < 0.6) { const mid = (hi + lo) / 2; lo = Math.max(1, mid - 0.3); hi = Math.min(scale, lo + 0.6); lo = Math.max(1, hi - 0.6); }
  return [lo, hi];
}
const fmt = value => (value == null || !Number.isFinite(Number(value)) ? "-" : Number(value).toFixed(2));

function seriesFor(groups, name, field, keys, allKeys) {
  return keys.map(key => groups?.[name]?.[field]?.[allKeys.indexOf(key)] ?? null);
}

// 끝에서부터 몇 학기 연속 좋아졌는지(등급 숫자가 작아진 횟수).
function improvingStreak(values) {
  const valid = values.filter(value => value != null);
  let streak = 0;
  for (let index = valid.length - 1; index > 0; index -= 1) {
    if (valid[index] < valid[index - 1]) streak += 1; else break;
  }
  return streak;
}

// 큰 선 그래프 한 개(교과 하나). 점마다 값을 직접 써서 축을 읽지 않아도 되게 합니다.
function SubjectTrendCard({ name, color, values, labels, scale }) {
  const width = 300, height = 150, padX = 34, top = 26, bottom = 30;
  const valid = values.filter(value => value != null);
  const x = index => (values.length <= 1 ? width / 2 : padX + (index * (width - padX * 2)) / (values.length - 1));
  const [lo, hi] = domainOf(values, scale);
  const y = value => top + ((Number(value) - lo) / Math.max(0.01, hi - lo)) * (height - top - bottom);
  const points = values.map((value, index) => (value == null ? null : [x(index), y(value), value])).filter(Boolean);
  const first = valid[0], last = valid[valid.length - 1];
  const delta = valid.length > 1 ? first - last : null;
  return <div className="kdn-gi-sub" style={{ "--c": color }}>
    <div className="kdn-gi-sub-head"><b>{name}</b>{delta != null && Math.abs(delta) >= 0.01 && <span className={delta > 0 ? "is-up" : "is-down"}>{delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(2)}</span>}</div>
    <div className="kdn-gi-sub-value">{fmt(last)}<small>최근 학기</small></div>
    {points.length ? <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${name} 학기별 등급: ${values.map((value, index) => `${labels[index]} ${fmt(value)}`).join(", ")}`}>
      {[lo, (lo + hi) / 2, hi].map(level => <g key={level}><line x1={padX - 6} x2={width - padX + 6} y1={y(level)} y2={y(level)} className="grid" /><text x={0} y={y(level) + 4} className="axis">{level.toFixed(1)}</text></g>)}
      {points.length > 1 && <polyline points={points.map(([px, py]) => `${px},${py}`).join(" ")} className="line" />}
      {points.map(([px, py, value], index) => <g key={index}><circle cx={px} cy={py} r={index === points.length - 1 ? 6 : 4.5} className={index === points.length - 1 ? "dot is-last" : "dot"} /><text x={px} y={py - 11} textAnchor="middle" className="val">{fmt(value)}</text></g>)}
      {labels.map((label, index) => <text key={label} x={x(index)} y={height - 8} textAnchor="middle" className="sem">{String(label).split(" · ").pop()}</text>)}
    </svg> : <div className="kdn-gi-empty">성적 없음</div>}
  </div>;
}

function heatLevel(grade, scale) {
  if (grade == null) return 0;
  const g = Math.round(Number(grade));
  if (scale === 9) return g <= 2 ? 1 : g <= 4 ? 2 : g <= 6 ? 3 : 4;
  return g <= 1 ? 1 : g === 2 ? 2 : g === 3 ? 3 : 4;
}

export function GradeHeatmap({ subjectLists = [], semesterKeys = [], allKeys = [], labels = [], gradeSystem = 5, groups, groupField }) {
  const scale = Number(gradeSystem) === 9 ? 9 : 5;
  const rows = React.useMemo(() => {
    const map = new Map();
    semesterKeys.forEach((key, column) => {
      (subjectLists[allKeys.indexOf(key)] || []).forEach(subject => {
        const grade = getSubjectGrade(subject);
        if (grade == null || !subject?.subject) return;
        const name = String(subject.subject).trim();
        const category = normalizeCategory(subject.category, subject.subject);
        if (!map.has(name)) map.set(name, { name, category, credit: Number(subject.credit) || 0, cells: semesterKeys.map(() => null) });
        map.get(name).cells[column] = grade;
      });
    });
    const order = ["국어", "수학", "영어", "한국사", "사회", "과학"];
    return [...map.values()].sort((a, b) => {
      const ai = order.indexOf(a.category), bi = order.indexOf(b.category);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.cells.findIndex(v => v != null) - b.cells.findIndex(v => v != null);
    });
  }, [subjectLists, semesterKeys, allKeys]);
  const counts = {};
  rows.forEach(row => row.cells.forEach(value => { if (value != null) { const g = Math.round(value); counts[g] = (counts[g] || 0) + 1; } }));
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const overall = seriesFor(groups, "전과목", groupField, semesterKeys, allKeys);
  if (!rows.length) return <div className="kdn-gi-empty">등록된 과목 성적이 없습니다.</div>;
  return <div className="kdn-gi-heat-wrap">
    <div className="kdn-gi-heat-head">
      <div><b>과목 × 학기 성취 지도</b><span>진할수록 좋은 등급 · {scale}등급제 원등급 · 빗금은 미이수</span></div>
      <div className="kdn-gi-legend">{[1, 2, 3, 4].map(level => <span key={level}><i className={`kdn-gi-cell l${level}`} />{scale === 9 ? ["1–2", "3–4", "5–6", "7–9"][level - 1] : ["1", "2", "3", "4–5"][level - 1]}</span>)}<span><i className="kdn-gi-cell l0" />미이수</span></div>
    </div>
    <div className="kdn-gi-heat" style={{ gridTemplateColumns: `minmax(130px,190px) repeat(${semesterKeys.length}, minmax(64px,1fr))` }}>
      <span />{labels.map(label => <span key={label} className="kdn-gi-col">{label}</span>)}
      {rows.map(row => <React.Fragment key={row.name}>
        <span className="kdn-gi-name"><b>{row.name}</b><small>{row.category}{row.credit ? ` · ${row.credit}단위` : ""}</small></span>
        {row.cells.map((value, index) => <span key={index} className={`kdn-gi-cell l${heatLevel(value, scale)}`}>{value != null ? <b>{Number.isInteger(Number(value)) ? value : fmt(value)}</b> : "—"}</span>)}
      </React.Fragment>)}
      <span className="kdn-gi-name is-total"><b>전과목 평균</b><small>단위수 가중</small></span>
      {overall.map((value, index) => <span key={index} className="kdn-gi-cell is-total"><b>{fmt(value)}</b></span>)}
    </div>
    {total > 0 && <div className="kdn-gi-dist">
      <span>등급 분포 · {total}개 성적</span>
      <div className="kdn-gi-dist-bar">{Object.keys(counts).sort((a, b) => a - b).map(grade => <i key={grade} className={`kdn-gi-cell l${heatLevel(Number(grade), scale)}`} style={{ flex: counts[grade] }} title={`${grade}등급 ${counts[grade]}개`}>{counts[grade] / total > 0.07 ? `${grade}등급 ${counts[grade]}` : ""}</i>)}</div>
    </div>}
  </div>;
}

export function GradeInsights({ groups, groupField, semesterKeys = [], allKeys = [], labels = [], scale = 5, gradeLabel = "", studentName = "", overallAverage }) {
  const overall = seriesFor(groups, "전과목", groupField, semesterKeys, allKeys);
  const valid = overall.filter(value => value != null);
  const last = valid[valid.length - 1];
  const streak = improvingStreak(overall);
  const subjects = CATEGORIES.map(([name, color]) => {
    const values = seriesFor(groups, name, groupField, semesterKeys, allKeys);
    const v = values.filter(value => value != null);
    return { name, color, values, avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, delta: v.length > 1 ? v[0] - v[v.length - 1] : null, last: v[v.length - 1] };
  });
  const withAvg = subjects.filter(item => item.avg != null);
  const best = withAvg.length ? withAvg.reduce((a, b) => (b.avg < a.avg ? b : a)) : null;
  const worst = withAvg.length > 1 ? withAvg.reduce((a, b) => (b.avg > a.avg ? b : a)) : null;
  const grown = subjects.filter(item => item.delta != null && item.delta > 0.005).sort((a, b) => b.delta - a.delta)[0] || null;
  const prev = valid[valid.length - 2];
  const tone = valid.length < 2 ? "first" : last < prev ? "up" : last === prev ? "flat" : "down";
  const headline = { first: "첫 학기 성적이 등록되었어요", up: streak >= 2 ? `${streak}학기 연속 오르며` : "직전 학기보다 오르며", flat: "직전 학기와 같은 수준", down: "직전 학기보다 조금 내려갔어요" }[tone];
  const suffix = { first: "", up: "까지 왔어요", flat: " 유지 중", down: " · 다음 학기 회복이 필요해요" }[tone];
  const w = 320, h = 120;
  const sx = index => (overall.length <= 1 ? w / 2 : 14 + (index * (w - 28)) / (overall.length - 1));
  const [slo, shi] = domainOf(overall, scale);
  const sy = value => 14 + ((Number(value) - slo) / Math.max(0.01, shi - slo)) * (h - 40);
  const pts = overall.map((value, index) => (value == null ? null : [sx(index), sy(value), value])).filter(Boolean);
  return <div className="kdn-gi">
    <section className="kdn-gi-hero">
      <div className="kdn-gi-hero-copy">
        <span>{studentName ? `${studentName} · ` : ""}{labels[labels.length - 1] ? `${labels[labels.length - 1]}까지 한눈에` : "학기별 성적"}</span>
        <b>{headline}<br />전과목 <em>{fmt(last ?? overallAverage)}</em>{suffix}</b>
        <small>{gradeLabel}{overallAverage != null ? ` · 누적 평균 ${fmt(overallAverage)}` : ""}</small>
      </div>
      {pts.length > 0 && <svg viewBox={`0 0 ${w} ${h}`} className="kdn-gi-spark" role="img" aria-label={`전과목 평균 추이: ${overall.map((value, index) => `${labels[index]} ${fmt(value)}`).join(", ")}`}>
        {pts.length > 1 && <path d={`M${pts.map(([x, y]) => `${x},${y}`).join(" L")} L${pts[pts.length - 1][0]},${h - 20} L${pts[0][0]},${h - 20} Z`} className="area" />}
        {pts.length > 1 && <polyline points={pts.map(([x, y]) => `${x},${y}`).join(" ")} className="line" />}
        {pts.map(([x, y, value], index) => <g key={index}><circle cx={x} cy={y} r={index === pts.length - 1 ? 7 : 5} className={index === pts.length - 1 ? "dot is-last" : "dot"} /><text x={x} y={h - 4} textAnchor="middle" className={index === pts.length - 1 ? "val is-last" : "val"}>{fmt(value)}</text></g>)}
      </svg>}
    </section>
    <div className="kdn-gi-cards">
      <div className="kdn-gi-card is-good"><span className="tag">▲ 강점</span><b>{best ? `${best.name} 평균 ${fmt(best.avg)}` : "자료 부족"}</b><p>{best ? `등록된 학기 중 가장 좋은 교과입니다. 최근 학기 ${fmt(best.last)}.` : "학기 성적이 더 쌓이면 강점 교과를 보여줍니다."}</p></div>
      <div className="kdn-gi-card is-grow"><span className="tag">↗ 성장</span><b>{grown ? `${grown.name} ${fmt(grown.values.find(v => v != null))} → ${fmt(grown.last)}` : "큰 변화 없음"}</b><p>{grown ? `첫 학기보다 ${grown.delta.toFixed(2)} 올랐습니다. 성장 과정을 세특·상담 기록에 남겨두면 좋습니다.` : "교과별 등급이 학기마다 비슷하게 유지되고 있습니다."}</p></div>
      <div className="kdn-gi-card is-care"><span className="tag">! 관리</span><b>{worst && worst !== best ? `${worst.name} 평균 ${fmt(worst.avg)}` : "고르게 유지"}</b><p>{worst && worst !== best ? "다른 교과보다 평균이 낮습니다. 이 교과를 반영하는 대학을 지원하려면 다음 학기 관리가 필요합니다." : "교과 사이 차이가 크지 않습니다."}</p></div>
    </div>
    <div className="kdn-gi-subs">{subjects.map(item => <SubjectTrendCard key={item.name} name={item.name} color={item.color} values={item.values} labels={labels} scale={scale} />)}</div>
  </div>;
}
