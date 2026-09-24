import React from 'react';
import {MinimumFacts,RecommendedCourseDetails} from './SupportDecisionCard.jsx';
import {minimumDisplay,minimumYearLabel} from './naviMinimum.js';

export default function CounselingAdmissionFacts({facts,student,status='loading',minimumStatus='ready',recommendationStatus='loading',onRetry}) {
  if(status==='loading')return <div className="kd-counsel-facts" role="status">수능최저·권장과목 연결 중…</div>;
  if(status==='error')return <div className="kd-counsel-facts" role="status">상담 자료 연결 실패 <button className="no-print" onClick={onRetry}>다시 연결</button></div>;
  if(facts?.needsDepartment)return <div className="kd-counsel-facts">학과를 저장하면 전형별 수능최저와 핵심·권장과목을 함께 표시합니다.</div>;
  return <div className="kd-counsel-facts">
    <h4>수능최저</h4>
    <small>{student?.latestMockLabel || '학생 모평 성적 미입력'} 기준 · 전형별 판정</small>
    {facts?.minimums?.length ? facts.minimums.map(({admissionType,track,evaluation},index)=>{
      const display=minimumDisplay(evaluation);
      return <details className="kd-counsel-minimum" key={`${admissionType}-${track}`} open={index===0 || undefined}>
        <summary><b>{admissionType} · {track}</b><span className={`kd-status-pill is-${display.status}`}>{display.label}</span></summary>
        <div className="kd-decision-primary"><section className={`kd-decision-minimum is-${display.status}`}>
          <h5>수능최저 <span className={`kd-minimum-year ${evaluation?.yearMismatch?'is-reference':'is-current'}`}>{minimumYearLabel(evaluation,student)}</span></h5>
          <MinimumFacts minimum={display} ev={evaluation} student={student}/>
        </section></div>
      </details>;
    }) : minimumStatus==='loading' ? <p role="status">전형별 최저 자료 연결 중…</p> : minimumStatus==='error' ? <p>최저 추가자료 연결 실패 <button className="no-print" onClick={onRetry}>다시 연결</button></p> : <p>이 학과의 전형별 최저 자료가 연결되지 않았습니다. NAVI에서 학과·전형을 확인하세요.</p>}
    <RecommendedCourseDetails progress={facts?.progress} status={recommendationStatus}/>
    {recommendationStatus==='error' && <button className="no-print" onClick={onRetry}>권장과목 다시 연결</button>}
  </div>;
}
