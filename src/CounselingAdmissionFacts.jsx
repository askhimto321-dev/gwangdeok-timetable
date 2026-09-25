import React from 'react';
import {MinimumFacts,RecommendedCourseDetails} from './SupportDecisionCard.jsx';
import {minimumDisplay,minimumYearLabel} from './naviMinimum.js';

export default function CounselingAdmissionFacts({facts,student,status='loading',minimumStatus='ready',recommendationStatus='loading',onRetry}) {
  if(status==='loading')return <div className="kd-counsel-facts" role="status">수능최저·권장과목 연결 중…</div>;
  if(status==='error')return <div className="kd-counsel-facts" role="status">상담 자료 연결 실패 <button className="no-print" onClick={onRetry}>다시 연결</button></div>;
  if(facts?.needsDepartment)return <div className="kd-counsel-facts">학과를 저장하면 전형별 수능최저와 핵심·권장과목을 함께 표시합니다.</div>;
  const grouped=(facts?.minimums||[]).reduce((groups,item)=>{
    const type=item.admissionType||'기타';
    if(!groups.has(type))groups.set(type,[]);
    groups.get(type).push(item);
    return groups;
  },new Map());
  return <div className="kd-counsel-facts">
    <h4>수능최저 <span className="kd-counsel-count">{facts?.minimums?.length||0}개 전형</span></h4>
    <small>{student?.latestMockLabel || '학생 모평 성적 미입력'} 기준 · 교과/종합/논술별로 펼쳐보기</small>
    {grouped.size ? [...grouped].map(([type,items],groupIndex)=><details className="kd-counsel-type" key={type} open={groupIndex===0 || undefined}>
      <summary><b>{type}</b><span>{items.length}개 전형</span><small>{[...new Set(items.map(item=>minimumDisplay(item.evaluation).label))].slice(0,2).join(' · ')}</small></summary>
      <div className="kd-counsel-type-items">{items.map(({admissionType,track,evaluation})=>{
      const display=minimumDisplay(evaluation);
      return <details className="kd-counsel-minimum" key={`${admissionType}-${track}`}>
        <summary><b>{track}</b><span className={`kd-status-pill is-${display.status}`}>{display.label}</span></summary>
        <div className="kd-counsel-print-rule">{minimumYearLabel(evaluation,student)} · {evaluation?.ruleText || evaluation?.reason || display.label}</div>
        <div className="kd-decision-primary"><section className={`kd-decision-minimum is-${display.status}`}>
          <h5>수능최저 <span className={`kd-minimum-year ${evaluation?.yearMismatch?'is-reference':'is-current'}`}>{minimumYearLabel(evaluation,student)}</span></h5>
          <MinimumFacts minimum={display} ev={evaluation} student={student}/>
        </section></div>
      </details>;
      })}</div>
    </details>) : minimumStatus==='loading' ? <p role="status">전형별 최저 자료 연결 중…</p> : minimumStatus==='error' ? <p>최저 추가자료 연결 실패 <button className="no-print" onClick={onRetry}>다시 연결</button></p> : <p>이 학과의 전형별 최저 자료가 연결되지 않았습니다. NAVI에서 학과·전형을 확인하세요.</p>}
    <RecommendedCourseDetails progress={facts?.progress} status={recommendationStatus}/>
    {recommendationStatus==='error' && <button className="no-print" onClick={onRetry}>권장과목 다시 연결</button>}
  </div>;
}
