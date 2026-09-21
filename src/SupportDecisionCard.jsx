import React from 'react';
import { validGrade, supportBandClassName, trackChipClassName, trackAccentKey } from './admissionMetrics.js';
import { minimumDisplay, studentMockChips } from './naviMinimum.js';
import './supportDecision.css';

const fmt=value=>validGrade(value)==null?'—':Number(value).toFixed(2);
export function RecommendedCourseDetails({progress, printMode=false}) {
  const matched=progress?.matchedCourses || [], missing=progress?.missingCourses || [];
  // 3번 요청: 인쇄본에는 클릭할 수 없으니 <details>를 항상 펼친 채로 찍습니다.
  return <details className="kd-course-details" open={printMode || undefined}><summary><span>권장과목 이수 확인{progress?.estimated ? ' (추정)' : ''}</span><strong>{progress?.total ? `${progress.matched}/${progress.total}과목` : '자료 미연결'}</strong></summary>
    {/* 5번 요청: 이 대학 공식 자료가 아니라 다른 대학 자료로 만든 추정치일 때는 맨 위에 항상 밝힙니다. */}
    {progress?.estimated && <p><small>{progress.estimatedFrom?.length ? progress.estimatedFrom.join(', ') : '같은 학과·계열의 다른 대학'} 자료를 참고한 추정치이며, 이 대학이 직접 발표한 자료가 아닙니다.</small></p>}
    {progress?.total ? <><p><b>이수 확인 {matched.length}개</b></p><div className="kd-course-chips">{matched.length ? matched.map(x=><span key={x} className="is-matched">✓ {x}</span>) : <span>저장 성적에서 확인된 과목 없음</span>}</div><p><b>미확인 {missing.length}개</b></p><div className="kd-course-chips">{missing.length ? missing.map(x=><span key={x}>○ {x}</span>) : <span>모든 과목 확인</span>}</div><small>2028 권장과목 자료와 저장된 과목명을 대조합니다. ‘미확인’은 미이수 확정이 아니며, 학교생활기록부와 함께 확인하세요. 권장과목은 필수 지원자격과 다릅니다.</small></> : <p>연결된 권장과목 자료가 없거나 과목 목록이 비어 있습니다.</p>}
  </details>;
}

// 카드 안 '수능최저' 상자: 예전에는 판정 문구·반영 영역·모평 라벨·안내문 4줄이 항상 다 보여서
// 글자만 줄줄이 나열된 느낌이었습니다. 이제는 핵심 한두 줄만 기본으로 보이고 나머지는
// <details>로 접습니다. 매칭된 대학 자료(ev)가 있으면 그 판정 근거를, 없으면(=최저 자료 미연결)
// 학생 본인의 최근 모의고사 등급 칩을 대신 보여줘 "대학 정보 없어도 내 최저는 보고 싶다"는
// 요청에 대응합니다.
function MinimumFacts({ minimum, ev, student, printMode=false }) {
  const hasEvidence = !!ev;
  const chips = !hasEvidence ? studentMockChips(student) : null;
  return <>
    <strong className="kd-decision-verdict">{minimum.label}</strong>
    {hasEvidence ? <>
      <p className="kd-decision-rule">{ev.ruleText || '연결 조건 없음'}</p>
      {ev.studentSum!=null && <small className="kd-decision-reason">{ev.ruleType==='each' ? `선택 ${ev.count}개 영역 각각 ${ev.threshold}등급 이내` : `학생 ${ev.studentSum} / 기준 ${ev.threshold} 이내`}</small>}
    </> : chips ? <div className="kd-mock-chips">
      {student?.latestMockLabel && <span className="kd-mock-chips-label">{student.latestMockLabel}</span>}
      {chips.map(([label, value]) => <span key={label} className="kd-mock-chip">{label} {value}</span>)}
    </div> : <small className="kd-decision-reason">{minimum.reason}</small>}
    <details className="kd-decision-min-detail" open={printMode || undefined}><summary>자세히</summary>
      {hasEvidence && <small className="kd-decision-reason">{minimum.reason}</small>}
      {hasEvidence && ev.subjectsText && <small className="kd-decision-reason">반영 영역 {ev.subjectsText}</small>}
      {ev?.note && <small className="kd-decision-reason">비고: {ev.note}</small>}
      {hasEvidence && <small className="kd-decision-reason">{ev.source || 'NAVI 수능최저 자료'}</small>}
      <small className="kd-decision-reason">{student?.latestMockLabel ? `${student.latestMockLabel} 기준 판정` : '판정 기준 모평 미선택'}</small>
      {!hasEvidence && <small className="kd-decision-reason">연도·캠퍼스·모집단위·전형이 일치하는 원자료를 확인하세요.</small>}
    </details>
  </>;
}

// 3번 요청: 인쇄 카드가 화면의 SupportDecisionCard와 동일한 UI로 보이게, 이 컴포넌트를
// 그대로 재사용합니다. printMode=true면 (1) 접힌 <details>를 전부 펼쳐서 종이에서도 안 눌러도
// 다 보이게 하고, (2) 삭제/사례보기처럼 화면에서만 의미 있는 버튼은 찍지 않습니다.
export default function SupportDecisionCard({item,index,studentGrade,cutoffBasis,student,busy,onRemove,onOpenCases,printMode=false}) {
  const cutIndex=cutoffBasis==='50'?1:2, altIndex=cutoffBasis==='50'?2:1;
  const cut=item.admissionItem?.[cutIndex];
  const altCut=item.admissionItem?.[altIndex];
  const ev=item.comparisonEvidence?.minimumEvaluation || item.minimumEvaluation;
  const minimum=minimumDisplay(ev,item.minimumStatus);
  const difference=validGrade(studentGrade)!=null && validGrade(cut)!=null ? Number(studentGrade)-Number(cut) : null;
  return <article className="susi-beta-plan-card kd-decision-card">
    <header><div><h4>{item.stored.university}</h4><p>{item.stored.department}</p><span className={trackChipClassName(item.stored.admissionType)}>{item.stored.admissionType || '전형 확인'} · {item.stored.track}</span></div><span className={`kd-decision-number is-${trackAccentKey(item.stored.admissionType)}`}>{index+1}</span></header>
    <div className="kd-decision-primary">
      {/* 학생 등급과 컷을 각각 색이 다른 상자로 분리해, 두 숫자를 문장처럼 줄줄이 읽지 않고
          한눈에 비교할 수 있게 했습니다. 아래 참고 줄도 이미 위에서 보여준 컷을 다시 적지 않고
          '다른 쪽 컷' 하나만 보조로 붙입니다(예전에는 50%·70%를 위아래로 중복 표시했습니다). */}
      <section className="kd-decision-grade"><h5>내신 컷 비교 <span>2026 공개 결과</span></h5><div className="kd-decision-numbers"><div className="kd-decision-num-box is-student"><small>내 환산등급</small><b>{fmt(studentGrade)}</b></div><span aria-hidden="true">↔</span><div className="kd-decision-num-box"><small>{cutoffBasis}%컷</small><b>{fmt(cut)}</b></div></div><div className="kd-decision-band-row">{item.support?.label ? <span className={supportBandClassName(item.support.label)}>{item.support.label}</span> : <span className={supportBandClassName()}>판정 자료 없음</span>}{difference!=null && <span className="kd-decision-diff">차이 {difference>0?'+':''}{difference.toFixed(2)}</span>}</div><small className="kd-decision-subref">{altIndex===1?'50':'70'}%컷 참고 {fmt(altCut)}</small></section>
      <section className={`kd-decision-minimum is-${minimum.status}`}><h5>수능최저 <span>{ev ? (ev.year || '연도 미확인') : '연도 확인'} 참고 기준</span></h5><MinimumFacts minimum={minimum} ev={ev} student={student} printMode={printMode}/></section>
    </div>
    {item.trackMissing && <p className="kd-decision-warning">NAVI 전형 미연결 · 다른 전형의 컷을 대신 사용하지 않습니다.</p>}
    <RecommendedCourseDetails progress={item.recommendationProgress} printMode={printMode}/>
    <details className="kd-decision-evidence" open={printMode || undefined}><summary>출처·사례 근거</summary>
      <div className="kd-evidence-row"><b>담은 경로</b><span>{item.stored.source || '미제공'}</span></div>
      <div className="kd-evidence-row"><b>NAVI 통합 사례</b><span>{item.naviCaseCount!=null?`${item.naviCaseCount}건`:'미연결/미제공'}</span></div>
      <div className="kd-evidence-row"><b>광덕고 별도 사례</b><span>{item.schoolTrend?.total?`지원 ${item.schoolTrend.total} · 합격 ${item.schoolTrend.accepted}`:'연결 없음'}</span></div>
      <small>NAVI 사례는 대학·전형·계열 기준이며 학과 합격자 수가 아닙니다. 공개 컷 2026 · 최저 {ev?.year || '연도 확인'} · 사례 연도 미제공. 실제 지원연도 모집요강을 우선 확인하세요.</small>
    </details>
    {!printMode && <footer>{onOpenCases && item.stored.source==='광덕고 별도 사례' && <button type="button" onClick={()=>onOpenCases(item.stored.university,item.stored.department,item.stored.track)}>광덕고 사례 보기</button>}<button type="button" disabled={busy} onClick={()=>onRemove(item.stored)} aria-label={`${item.stored.university} ${item.stored.track} 지원 구성에서 삭제`}>삭제</button></footer>}
  </article>;
}
