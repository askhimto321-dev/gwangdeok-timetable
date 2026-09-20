import React from 'react';
import { validGrade, supportBandClassName } from './admissionMetrics.js';
import { minimumDisplay } from './naviMinimum.js';
import './supportDecision.css';

const fmt=value=>validGrade(value)==null?'—':Number(value).toFixed(2);
export function RecommendedCourseDetails({progress}) {
  const matched=progress?.matchedCourses || [], missing=progress?.missingCourses || [];
  return <details className="kd-course-details"><summary><span>권장과목 이수 확인</span><strong>{progress?.total ? `${progress.matched}/${progress.total}과목` : '자료 미연결'}</strong></summary>
    {progress?.total ? <><p><b>이수 확인 {matched.length}개</b></p><div className="kd-course-chips">{matched.length ? matched.map(x=><span key={x} className="is-matched">✓ {x}</span>) : <span>저장 성적에서 확인된 과목 없음</span>}</div><p><b>미확인 {missing.length}개</b></p><div className="kd-course-chips">{missing.length ? missing.map(x=><span key={x}>○ {x}</span>) : <span>모든 과목 확인</span>}</div><small>2028 권장과목 자료와 저장된 과목명을 대조합니다. ‘미확인’은 미이수 확정이 아니며, 학교생활기록부와 함께 확인하세요. 권장과목은 필수 지원자격과 다릅니다.</small></> : <p>연결된 권장과목 자료가 없거나 과목 목록이 비어 있습니다.</p>}
  </details>;
}
export default function SupportDecisionCard({item,index,studentGrade,cutoffBasis,student,busy,onRemove,onOpenCases}) {
  const cut=item.admissionItem?.[cutoffBasis==='50'?1:2];
  const ev=item.comparisonEvidence?.minimumEvaluation || item.minimumEvaluation;
  const minimum=minimumDisplay(ev,item.minimumStatus);
  const difference=validGrade(studentGrade)!=null && validGrade(cut)!=null ? Number(studentGrade)-Number(cut) : null;
  return <article className="susi-beta-plan-card kd-decision-card">
    <header><div><h4>{item.stored.university}</h4><p>{item.stored.department}</p><span className="kd-track-chip kd-decision-type-chip">{item.stored.admissionType || '전형 확인'} · {item.stored.track}</span></div><span className="kd-decision-number">{index+1}</span></header>
    <div className="kd-decision-primary">
      <section className="kd-decision-grade"><h5>내신 컷 비교 <span>2026 공개 결과</span></h5><div className="kd-decision-numbers"><div className="is-student"><small>학생 9등급 환산</small><b>{fmt(studentGrade)}</b></div><span aria-hidden="true">↔</span><div><small>{cutoffBasis}%컷</small><b>{fmt(cut)}</b></div></div><p>{item.support?.label ? <span className={supportBandClassName(item.support.label)}>{item.support.label}</span> : <span className={supportBandClassName()}>판정 자료 없음</span>}{difference!=null && <span className="kd-decision-diff">학생 − 컷 {difference>0?'+':''}{difference.toFixed(2)}</span>}</p><small>50% {fmt(item.admissionItem?.[1])} · 70% {fmt(item.admissionItem?.[2])} · 등급은 낮을수록 유리</small></section>
      <section className={`kd-decision-minimum is-${minimum.status}`}><h5>수능최저 <span>2027 참고 기준</span></h5><strong className="kd-decision-verdict">{minimum.label}</strong><p className="kd-decision-rule">{ev?.ruleText || item.comparisonEvidence?.minimumText || '연결 조건 없음'}</p><small>{ev?.subjectsText ? `반영 영역: ${ev.subjectsText} · ` : ''}{student?.latestMockLabel || '판정 기준 모평 미선택'}</small><p>{minimum.reason}</p></section>
    </div>
    {item.trackMissing && <p className="kd-decision-warning">NAVI 전형 미연결 · 다른 전형의 컷을 대신 사용하지 않습니다.</p>}
    <RecommendedCourseDetails progress={item.recommendationProgress}/>
    <details className="kd-decision-evidence"><summary>출처·사례 근거</summary><p>담은 경로: {item.stored.source || '미제공'}</p><p>NAVI 통합 사례: {item.naviCaseCount!=null?`${item.naviCaseCount}건`:'미연결/미제공'} — 대학·전형·계열 기준이며 학과 합격자 수가 아닙니다.</p><p>광덕고 별도 사례: {item.schoolTrend?.total?`지원 ${item.schoolTrend.total} · 합격 ${item.schoolTrend.accepted}`:'연결 없음'}</p><small>공개 컷 2026 · 최저 2027 · NAVI 사례 연도 미제공. 실제 지원연도 모집요강을 우선 확인하세요.</small></details>
    <footer>{onOpenCases && item.stored.source==='광덕고 별도 사례' && <button type="button" onClick={()=>onOpenCases(item.stored.university,item.stored.department,item.stored.track)}>광덕고 사례 보기</button>}<button type="button" disabled={busy} onClick={()=>onRemove(item.stored)} aria-label={`${item.stored.university} ${item.stored.track} 지원 구성에서 삭제`}>삭제</button></footer>
  </article>;
}
