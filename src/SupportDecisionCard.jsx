import React from 'react';
import { validGrade, supportBandClassName, trackChipClassName, trackAccentKey } from './admissionMetrics.js';
import { minimumDisplay, minimumYearLabel, studentMockChips, shortSubjectName } from './naviMinimum.js';
import { recommendedCourseDisplayName } from './recommendationPresentation.js';
import './supportDecision.css';

const fmt=value=>validGrade(value)==null?'—':Number(value).toFixed(2);
export function RecommendedCourseDetails({progress, status='ready', printMode=false, compactPrint=false}) {
  const matched=progress?.matchedCourses || [], missing=progress?.missingCourses || [];
  const matchedKeys=new Set(matched);
  const groups=progress?.courseGroups || [];
  const loading=!progress?.total && (status==='idle' || status==='loading');
  const loadFailed=!progress?.total && status==='error';
  const unregistered=!progress?.total && status==='empty';
  const statusLabel=loading?'자료 연결 중':loadFailed?'자료 연결 실패':unregistered?'공용 자료 미등록':!progress?.total?'권장과목 자료 없음':!progress?.studentCourseCount?'학생 과목자료 없음':`${progress.matched}/${progress.total}과목`;
  // 3번 요청: 인쇄본에는 클릭할 수 없으니 <details>를 항상 펼친 채로 찍습니다.
  const universityFieldEstimate=progress?.estimateKind==='university-field';
  return <details className="kd-course-details" open={printMode || undefined}><summary><span>{universityFieldEstimate?'핵심·권장과목 이수 확인 (동일 대학 계열 참고)':progress?.estimated ? '권장과목 이수 확인 (추정)' : '핵심·권장과목 이수 확인'}</span><strong>{statusLabel}</strong></summary>
    {/* 동일 대학·동일 계열의 공식 행으로 보완한 경우와 타 대학 통계 추정을 분명히 나눕니다. */}
    {universityFieldEstimate ? <p className="kd-course-source-note"><small>해당 학과의 직접 발표 행은 없지만, 이 대학이 발표한 ‘{progress.officialFieldLabel || '동일 계열'}’ {progress.referenceCount || 0}개 모집단위에서 과반 반복된 과목입니다. 해당 학과의 필수 기준으로 단정하지 않습니다.</small></p>
      : progress?.estimated && <p className="kd-course-source-note"><small>{progress.estimatedFrom?.length ? progress.estimatedFrom.join(', ') : '같은 학과·계열의 다른 대학'} 등 {progress.referenceCount || progress.estimatedFrom?.length || ''}개 대학 자료 중 최소 {progress.consensusThreshold || 2}개 대학·25% 이상 반복된 과목입니다. 이 대학이 직접 발표한 자료가 아닙니다.</small></p>}
    {progress?.total ? <>{groups.map(([label,courses])=><React.Fragment key={label}><p className="kd-course-group-title"><b>{label} {courses.filter(course=>matchedKeys.has(course)).length}/{courses.length}</b></p><div className="kd-course-chips">{(compactPrint?courses.slice(0,6):courses).map(course=><span key={course} className={matchedKeys.has(course)?'is-matched':''}>{matchedKeys.has(course)?'✓':'○'} {progress.commonCourses?.includes(course)?'★ ':''}{recommendedCourseDisplayName(course)}</span>)}{compactPrint&&courses.length>6&&<span className="kd-course-overflow">외 {courses.length-6}과목</span>}</div></React.Fragment>)}{!matched.length && <small>{progress.studentCourseCount ? '현재 저장된 성적·시간표에서 일치 과목이 없습니다.' : '학생 성적·시간표 과목자료가 연결되지 않았습니다.'}</small>}{!missing.length && <small>표시된 모든 과목의 이수·수강이 확인되었습니다.</small>}{progress?.estimated && !!progress.commonCourses?.length && <small>★ 표시는 {universityFieldEstimate ? '같은 대학·계열 모집단위' : '표본 대학'}의 과반이 공통으로 제시한 과목입니다.</small>}<small>2028 권장과목 자료와 저장된 성적·시간표 과목명을 대조합니다. ‘미이수’는 현재 저장 자료 기준이며, 누락 가능성이 있으면 학교생활기록부와 함께 확인하세요. 권장과목은 필수 지원자격과 다릅니다.</small></> : loading ? <p>대학별 권장과목 자료를 연결하고 있습니다. 연결이 끝난 뒤 이수 여부를 표시합니다.</p> : loadFailed ? <p>권장과목 자료 연결에 실패했습니다. NAVI 화면에서 다시 연결해주세요.</p> : unregistered ? <p>학교 공용 권장과목 자료가 아직 등록되지 않았습니다.</p> : <p>해당 대학·모집단위에 연결된 권장과목 자료가 없거나 과목 목록이 비어 있습니다.</p>}
  </details>;
}

// 카드 안 '수능최저' 상자: 예전에는 판정 문구·반영 영역·모평 라벨·안내문 4~5줄이 항상 다 보여서
// 글자만 줄줄이 나열된 느낌이었고, "조건 확인 필요" 상태에서는 원문 조각(예: 그냥 숫자 "5")만
// 뚝 떨어져 나와서 오히려 더 헷갈렸습니다. 이제는:
// - 충족/미충족처럼 실제로 계산된 경우, 문장 대신 학생의 최근 모평 등급을 칩(표)으로 보여주고
//   "N합M"(예: 2합5) + 도달/미도달 배지로 한눈에 보이게 합니다.
// - "조건 확인 필요" 상태는 원문 조각을 그대로 노출하지 않고, 왜 확인이 필요한지 이유 한 줄만
//   기본으로 보여줍니다. 반영 영역·비고처럼 실제 내용이 있을 때만 "자세히"를 둡니다.
export function MinimumFacts({ minimum, ev, student, printMode=false }) {
  const hasEvidence = !!ev && !['unlinked','not-listed','source-pending'].includes(minimum.status);
  const isManual = minimum.status === 'manual';
  const needsScore = minimum.status === 'unavailable';
  const decided = hasEvidence && ev.studentSum != null && (minimum.status === 'satisfied' || minimum.status === 'unsatisfied');
  const chips = (!hasEvidence || isManual || needsScore) ? studentMockChips(student) : null;
  const hasDetail = !isManual || ev?.subjectsText || ev?.note || ev?.reason || ev?.source;
  return <>
    <strong className="kd-decision-verdict">{minimum.label}</strong>
    {ev?.typeGrouped && <small className="kd-decision-reason">{ev.year}학년도 {ev.admissionType || '같은 유형'} 전형의 공통 기준 참고</small>}
    {['manual','unlinked','not-listed','source-pending'].includes(minimum.status) && <small className="kd-decision-reason">{minimum.reason}</small>}
    {ev?.historyInSum && <span className="kd-history-policy">한국사 합산 허용 · 해당 전형 기준</span>}
    {ev?.historyMax != null && <span className="kd-history-policy">한국사 별도 {ev.historyMax}등급 이내 · 학생 {ev.historyGrade ?? '미입력'}{ev.historyInSum ? '' : ' · 합산 제외'}</span>}
    {decided ? <>
      <div className="kd-minimum-grade-block"><small>반영 과목 등급</small><div className="kd-mock-chips">{(ev.selectedSubjects || []).map(x => <span key={x.name} className="kd-mock-chip">{shortSubjectName(x.name)} <b>{x.grade}</b></span>)}</div></div>
      <div className="kd-minimum-rule-grid">
        <div className="kd-minimum-fact is-result"><small>학생 판정값</small><b>{ev.ruleType === 'each' ? '과목별 판정' : `${ev.count}합 ${ev.studentSum}`}</b></div>
        <div className="kd-minimum-fact is-target"><small>대학 기준</small><b>{ev.ruleType === 'each' ? `${ev.count}개 각각 ${ev.threshold}등급 이내` : `${ev.count}합 ${ev.threshold} 이내`}</b></div>
      </div>
      <span className={`kd-status-pill kd-minimum-status is-${minimum.status}`}>{minimum.status === 'satisfied' ? '기준 도달' : '기준 미도달'}</span>
    </> : hasEvidence && needsScore ? <>
      {chips && <div className="kd-minimum-grade-block"><small>입력된 학생 모평 등급</small><div className="kd-mock-chips">{chips.map(([label, value]) => <span key={label} className="kd-mock-chip">{label} <b>{value}</b></span>)}</div></div>}
      {ev?.count && ev?.threshold != null && <div className="kd-minimum-rule-grid is-single"><div className="kd-minimum-fact is-target"><small>대학 기준</small><b>{ev.ruleType === 'each' ? `${ev.count}개 각각 ${ev.threshold}등급 이내` : `${ev.count}합 ${ev.threshold} 이내`}</b></div></div>}
      <p className="kd-decision-rule">{ev.ruleText || '연결 조건 없음'}</p>
    </> : hasEvidence && !isManual ? <>
      <p className="kd-decision-rule">{ev.ruleText || '연결 조건 없음'}</p>
    </> : hasEvidence && isManual ? <><div className="kd-minimum-source-rule"><small>확인할 원문 기준</small><b>{ev?.ruleText || '연결된 원문 조건'}</b></div>{chips && <div className="kd-minimum-grade-block"><small>학생 모평 등급</small><div className="kd-mock-chips">{chips.map(([label, value]) => <span key={label} className="kd-mock-chip">{label} <b>{value}</b></span>)}</div></div>}</>
    : chips ? <div className="kd-mock-chips">
      {student?.latestMockLabel && <span className="kd-mock-chips-label">{student.latestMockLabel}</span>}
      {chips.map(([label, value]) => <span key={label} className="kd-mock-chip">{label} {value}</span>)}
    </div> : <small className="kd-decision-reason">{minimum.reason}</small>}
    {hasDetail && <details className="kd-decision-min-detail" open={printMode || undefined}><summary>자세히</summary>
      {hasEvidence && <small className="kd-decision-reason">{minimum.reason}</small>}
      {hasEvidence && ev.subjectsText && <small className="kd-decision-reason">반영 영역 {ev.subjectsText}</small>}
      {ev?.note && <small className="kd-decision-reason">비고: {ev.note}</small>}
      {!isManual && hasEvidence && <small className="kd-decision-reason">{ev.source || 'NAVI 수능최저 자료'}</small>}
      {!isManual && <small className="kd-decision-reason">{student?.latestMockLabel ? `${student.latestMockLabel} 기준 판정` : '판정 기준 모평 미선택'}</small>}
      {!hasEvidence && <small className="kd-decision-reason">{minimum.reason}</small>}
    </details>}
  </>;
}

// 3번 요청: 인쇄 카드가 화면의 SupportDecisionCard와 동일한 UI로 보이게, 이 컴포넌트를
// 그대로 재사용합니다. printMode=true면 (1) 접힌 <details>를 전부 펼쳐서 종이에서도 안 눌러도
// 다 보이게 하고, (2) 삭제/사례보기처럼 화면에서만 의미 있는 버튼은 찍지 않습니다.
export default function SupportDecisionCard({item,index,studentGrade,cutoffBasis,student,busy,onRemove,onOpenCases,printMode=false,compactPrint=false}) {
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
      <section className={`kd-decision-minimum is-${minimum.status}`}><h5>수능최저 <span className={`kd-minimum-year ${ev?.yearMismatch||(student?.admissionYear&&ev?.year&&Number(student.admissionYear)!==Number(ev.year))?'is-reference':'is-current'}`}>{minimumYearLabel(ev,student)}</span></h5><MinimumFacts minimum={minimum} ev={ev} student={student} printMode={printMode}/></section>
    </div>
    {item.trackMissing && <p className="kd-decision-warning">NAVI 전형 미연결 · 다른 전형의 컷을 대신 사용하지 않습니다.</p>}
    <RecommendedCourseDetails progress={item.recommendationProgress} status={item.recommendationStatus} printMode={printMode} compactPrint={compactPrint}/>
    <details className="kd-decision-evidence" open={printMode || undefined}><summary>출처·사례 근거</summary>
      <div className="kd-evidence-row"><b>담은 경로</b><span>{item.stored.source || '미제공'}</span></div>
      <div className="kd-evidence-row"><b>NAVI 통합 사례</b><span>{item.naviCaseCount!=null?`${item.naviCaseCount}건`:'미연결/미제공'}</span></div>
      <div className="kd-evidence-row"><b>광덕고 별도 사례</b><span>{item.schoolTrend?.total?`지원 ${item.schoolTrend.total} · 합격 ${item.schoolTrend.accepted}`:'연결 없음'}</span></div>
      <small>NAVI 사례는 대학·전형·계열 기준이며 학과 합격자 수가 아닙니다. 공개 컷 2026 · 최저 {ev?.year || '연도 확인'} · 사례 연도 미제공. 실제 지원연도 모집요강을 우선 확인하세요.</small>
    </details>
    {!printMode && <footer>{onOpenCases && item.stored.source==='광덕고 별도 사례' && <button type="button" onClick={()=>onOpenCases(item.stored.university,item.stored.department,item.stored.track)}>광덕고 사례 보기</button>}<button type="button" disabled={busy} onClick={()=>onRemove(item.stored)} aria-label={`${item.stored.university} ${item.stored.track} 지원 구성에서 삭제`}>삭제</button></footer>}
  </article>;
}
