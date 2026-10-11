import React from "react";

// 최저 계산 줄
//  1줄 "내 등급": 모의고사 전 영역 등급, 이번 판정에 반영된 영역만 진하게(나머지는 흐리게).
//  2줄 "판정": 대학 기준(강조) ↔ 내 합, 기준선이 있는 막대로 얼마나 부족/여유인지.
//  3줄: 미충족이면 어떤 과목을 몇 등급 올리면 되는지.
const MOCK_AREAS = [
  { name: "국어", short: "국" },
  { name: "수학", short: "수" },
  { name: "영어", short: "영" },
  { name: "한국사", short: "한" },
  { name: "통합사회", short: "사" },
  { name: "통합과학", short: "과" },
];
const shortName = name => MOCK_AREAS.find(area => area.name === name)?.short || (/평균/.test(String(name)) ? "탐" : String(name || "").replace(/\s+/g, "").slice(0, 2));
const gradeOf = value => { const number = Number(value); return Number.isFinite(number) && number >= 1 && number <= 9 ? number : null; };
const fmt = value => (Number.isInteger(Number(value)) ? Number(value) : Number(value).toFixed(1));

// '사·과 평균'처럼 두 영역 평균이 반영되면 두 영역을 모두 반영으로 표시합니다.
function countedNames(subjects) {
  const set = new Set();
  subjects.forEach(item => {
    if (/평균/.test(String(item.name))) { set.add("통합사회"); set.add("통합과학"); }
    else set.add(item.name);
  });
  return set;
}

function MyGrades({ grades, subjects, threshold, each }) {
  const counted = countedNames(subjects);
  const list = MOCK_AREAS.map(area => ({ ...area, grade: gradeOf(grades?.[area.name]) })).filter(area => area.grade != null || counted.has(area.name));
  // 전 영역 성적이 없으면(다른 화면 등) 반영 영역만 보여 줍니다.
  const items = list.length ? list : subjects.map(item => ({ name: item.name, short: shortName(item.name), grade: item.grade }));
  return <span className="mc-mine">{items.map(area => {
    const on = counted.has(area.name);
    const bad = each && on && area.grade != null && area.grade > threshold;
    return <span key={area.name} className={`mc-g${on ? " on" : ""}${bad ? " no" : ""}${each && on && !bad ? " ok" : ""}`} title={on ? `${area.name} · 반영` : `${area.name} · 미반영`}>
      <small>{area.name}</small><b>{area.grade == null ? "–" : fmt(area.grade)}</b>
    </span>;
  })}</span>;
}

export default function MinimumCalcStrip({ result, advice, grades = null, className = "" }) {
  const subjects = (result?.selectedSubjects || []).filter(item => item && item.grade != null);
  if (!subjects.length || result.threshold == null) return null;
  const threshold = Number(result.threshold);
  const each = result.ruleType === "each";
  const tip = advice ? (advice.possible
    ? <span className="mc-tip">{advice.options.slice(0, 2).map(option => <b key={option.name}>{option.name} {option.from}→{option.to}</b>)}<small>{advice.options.length > 1 ? "중 하나면 충족" : "이면 충족"}</small></span>
    : <span className="mc-tip hard"><small>한 과목만 올려서는 부족 · 두 과목 이상 올려야 해요</small></span>) : null;
  const ruleBadge = <span className="mc-need"><small>대학 기준</small><b>{each ? `${result.count}개 각 ${threshold}등급` : `${result.count}합 ${threshold}`}</b></span>;

  if (each) {
    const bad = subjects.filter(item => Number(item.grade) > threshold);
    return <div className={`kdn-mcalc each ${bad.length ? "is-over" : "is-ok"} ${className}`}>
      <span className="mc-lb">내 등급</span>
      <MyGrades grades={grades} subjects={subjects} threshold={threshold} each />
      <span className="mc-lb">판정</span>
      <span className="mc-judge">{ruleBadge}<span className={`mc-sum ${bad.length ? "no" : "ok"}`}><small>반영 영역</small><b>{bad.length ? `${bad.map(item => shortName(item.name)).join("·")} 초과` : "모두 이내"}</b></span></span>
      {tip && <><span className="mc-lb" />{tip}</>}
    </div>;
  }

  const sum = subjects.reduce((total, item) => total + Number(item.grade), 0);
  const scale = Math.max(sum, threshold) * 1.08;
  const pct = value => `${(value / scale) * 100}%`;
  const over = sum > threshold;
  let offset = 0;
  return <div className={`kdn-mcalc ${over ? "is-over" : "is-ok"} ${className}`}>
    <span className="mc-lb">내 등급</span>
    <MyGrades grades={grades} subjects={subjects} threshold={threshold} />
    <span className="mc-lb">판정</span>
    <span className="mc-judge">
      {ruleBadge}
      <span className={`mc-sum ${over ? "no" : "ok"}`}><small>내 합</small><b>{fmt(sum)}</b></span>
      <span className="mc-bar" role="img" aria-label={`반영 ${subjects.map(item => `${item.name} ${item.grade}`).join(", ")}, 합 ${fmt(sum)}, 기준 ${threshold} 이내`}>
        {subjects.map((item, index) => { const left = offset; offset += Number(item.grade); return <i key={index} className="mc-seg" style={{ left: pct(left), width: pct(Number(item.grade)) }}><em>{shortName(item.name)}{fmt(item.grade)}</em></i>; })}
        {over ? <i className="mc-gap no" style={{ left: pct(threshold), width: pct(sum - threshold) }} /> : sum < threshold && <i className="mc-gap ok" style={{ left: pct(sum), width: pct(threshold - sum) }} />}
        <i className="mc-cut" style={{ left: pct(threshold) }}><em>기준 {threshold}</em></i>
      </span>
    </span>
    {tip && <><span className="mc-lb" />{tip}</>}
  </div>;
}
