import React from "react";

// 최저 계산 줄: 반영된 과목 칩(등급) → 합, 기준선이 있는 막대로 얼마나 부족/여유인지 보여 줍니다.
const minimumShortName = name => ({ 국어: "국", 수학: "수", 영어: "영", 한국사: "한", 통합사회: "사", 통합과학: "과", 탐구: "탐" }[name] || String(name || "").replace(/\s+/g, ""));
export default function MinimumCalcStrip({ result, advice, className = "" }) {
  const subjects = (result?.selectedSubjects || []).filter(item => item && item.grade != null);
  if (!subjects.length || result.threshold == null) return null;
  const threshold = Number(result.threshold);
  const fmt = value => (Number.isInteger(value) ? value : Number(value).toFixed(1));
  const adviceNode = advice ? (advice.possible
    ? <span className="tip">{advice.options.slice(0, 2).map(option => <b key={option.name}>{option.name} {option.from}→{option.to}</b>)}<small>{advice.options.length > 1 ? "중 하나면 충족" : "이면 충족"}</small></span>
    : <span className="tip hard"><small>한 과목만 올려서는 부족 · 두 과목 이상 올려야 해요</small></span>) : null;
  if (result.ruleType === "each") {
    return <div className={`kdn-mcalc each ${className}`}>
      <span className="lb">반영</span>
      <span className="chips">{subjects.map((item, index) => { const ok = Number(item.grade) <= threshold; return <span key={`${item.name}-${index}`} className={`chip ${ok ? "ok" : "no"}`} title={item.name}><small>{item.name}</small><b>{fmt(item.grade)}</b><i>{ok ? "✓" : `${fmt(Number(item.grade) - threshold)} 부족`}</i></span>; })}</span>
      <span className="rule-note">각 {threshold}등급 이내</span>
      {adviceNode}
    </div>;
  }
  const sum = subjects.reduce((total, item) => total + Number(item.grade), 0);
  const scale = Math.max(sum, threshold) * 1.08;
  const pct = value => `${(value / scale) * 100}%`;
  let offset = 0;
  const over = sum > threshold;
  return <div className={`kdn-mcalc ${over ? "is-over" : "is-ok"} ${className}`}>
    <span className="lb">반영</span>
    <span className="chips">{subjects.map((item, index) => <React.Fragment key={`${item.name}-${index}`}>{index > 0 && <i className="op">+</i>}<span className="chip" title={item.name}><small>{item.name}</small><b>{fmt(item.grade)}</b></span></React.Fragment>)}<i className="op">=</i><span className={`sum ${over ? "no" : "ok"}`}><small>합</small><b>{fmt(sum)}</b></span></span>
    <span className="bar" role="img" aria-label={`합 ${fmt(sum)}, 기준 ${threshold} 이내`}>
      {subjects.map((item, index) => { const left = offset; offset += Number(item.grade); return <i key={index} className="seg" style={{ left: pct(left), width: pct(Number(item.grade)) }}><em>{minimumShortName(item.name)}</em></i>; })}
      {over ? <i className="gap no" style={{ left: pct(threshold), width: pct(sum - threshold) }} /> : sum < threshold && <i className="gap ok" style={{ left: pct(sum), width: pct(threshold - sum) }} />}
      <i className="cut" style={{ left: pct(threshold) }}><em>기준 {threshold}</em></i>
    </span>
    {adviceNode}
  </div>;
}
