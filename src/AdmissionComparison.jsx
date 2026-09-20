import React, { useState } from 'react';
import SupportPlanButton from './SupportPlanButton.jsx';
import { COMPARISON_YEARS } from './admissionComparison.js';
import './admissionComparison.css';

const minimumLabels = { satisfied: '최저 충족', unsatisfied: '최저 미도달', 'no-minimum': '최저 없음', unavailable: '모평 성적 없음', manual: '조건 확인 필요', unlinked: '최저 자료 미연결' };
const grade = value => value == null ? '—' : value.toFixed(2);

export default function AdmissionComparison({ rows = [], compareItems = [], planItems = [], source, cutoffBasis, busy, studentSid, loading, error, onAddPlan, onRemoveCompare, onGoResults, planKey }) {
  const [type, setType] = useState('전체');
  const visible = rows.filter(row => row.missing || type === '전체' || row.admissionType === type);
  const tracks = visible.filter(row => !row.missing);
  const saved = new Set(planItems.map(row => planKey(row.stored)));
  return <section className="kd-track-comparison" aria-labelledby="kd-comparison-title" aria-busy={loading || busy || undefined}>
    <header className="kd-comparison-heading"><div><h3 id="kd-comparison-title">전형별 비교</h3><p>최대 5개 모집단위를 담고, 각 전형의 컷·반영 교과·최저를 한 행에서 비교하세요.</p></div><strong>{loading ? '조회 중' : `${compareItems.length}/5 모집단위`}</strong></header>
    <div className="kd-comparison-note">입시결과 {COMPARISON_YEARS.result} · 모집단위/교과 반영/최저 {COMPARISON_YEARS.recruitment}. 연도가 다른 참고자료이며, 최종 지원 조건은 해당 연도 모집요강을 확인하세요.</div>
    <details className="kd-comparison-source"><summary>출처와 집계 범위 확인</summary><p>출처: 경기도교육청 NAVI 업로드 자료. 현재 파서(schema v1)는 2026 입시결과와 2027 전형 정보를 연결합니다.</p><p>원본 파일: {source?.fileName || source?.name || '파일명 미제공'}<br/>파일 기준일: {source?.sourceDate || '미제공'} · 저장일: {source?.savedAt?.slice(0,10) || '미제공'}</p><p>공개 컷의 표본 수와 NAVI 통합 사례의 연도는 현재 저장 자료에 없습니다. NAVI 건수는 대학·전형·계열 단위로, 해당 학과의 합격자 수가 아닙니다. 광덕고 사례와 합산하지 않습니다.</p></details>
    {!studentSid && <p className="kd-comparison-note">학생을 선택하면 비교 목록과 지원 구성을 저장할 수 있습니다.</p>}
    {loading && <p role="status">저장된 목록을 확인하고 있습니다. 조회 완료 전에는 목록을 수정할 수 없습니다.</p>}
    {error && <p role="status">목록 확인 실패 · 표시된 자료는 이전 조회 결과일 수 있습니다. 다시 불러온 뒤 수정하세요.</p>}
    {compareItems.length > 0 && <>
      <ul className="kd-comparison-selection" aria-label="비교할 모집단위">{compareItems.map(item => <li key={JSON.stringify(item.stored)}><span><b>{item.stored.university}</b> · {item.stored.department}</span><button type="button" disabled={busy} aria-label={`${item.stored.university} ${item.stored.department} 비교에서 제거`} onClick={() => onRemoveCompare(item.stored)}>제거</button></li>)}</ul>
      <div className="kd-comparison-toolbar"><div role="group" aria-label="비교 전형 유형">{['전체', '교과', '종합'].map(value => <button key={value} type="button" aria-pressed={type === value} onClick={() => setType(value)}>{value}</button>)}</div><span role="status">표시 {tracks.length}개 전형 · {cutoffBasis}%컷 기준</span></div>
      {visible.length ? <div className="kd-comparison-scroll" tabIndex={0} role="region" aria-label="전형별 비교표. 좁은 화면에서는 가로로 스크롤하세요."><table className="kd-comparison-table"><caption>전형별 비교 — 대학 공개 컷은 9등급 기준, 서로 다른 대학의 산출 방식은 다를 수 있습니다.</caption><thead><tr>{['대학·모집단위 / 전형','2026 공개 컷 / 지원 구간','2027 교과 반영','2027 수능최저','사례 근거 / 표본','지원 구성'].map(title => <th key={title} scope="col">{title}</th>)}</tr></thead><tbody>{visible.map(row => row.missing ? <tr key={row.id}><th scope="row">{row.stored.university}<small>{row.stored.department}</small></th><td colSpan={5}>{row.reason}</td></tr> : <tr key={row.id}>
        <th scope="row"><b>{row.university}</b><small>{row.region || '지역 미제공'} · {row.department}</small><strong className="kd-track-name">{row.admissionType} · {row.track || '전형명 미제공'}</strong>{row.previousDepartment !== row.department && <small>2026: {row.previousDepartment || '미제공'}</small>}</th>
        <td><div className="kd-comparison-cuts"><span className={cutoffBasis === '50' ? 'is-current' : ''}>50% <b>{grade(row.cut50)}</b></span><span className={cutoffBasis === '70' ? 'is-current' : ''}>70% <b>{grade(row.cut70)}</b></span></div><strong className="kd-comparison-band">{row.support?.label || '판정 자료 없음'}</strong><small>공개 컷 표본 수: 미제공</small></td>
        <td>{row.course}<small>2028 권장과목 이수 확인: {row.recommendationProgress?.total ? `${row.recommendationProgress.matched}/${row.recommendationProgress.total}` : '자료 없음'}</small></td>
        <td><strong className={`kd-minimum-status is-${row.minimumStatus}`}>{minimumLabels[row.minimumStatus] || '조건 확인 필요'}</strong><small>{row.minimumText}</small></td>
        <td><b>NAVI 통합 사례</b><span>{row.naviCount == null ? '미연결/미제공' : `${row.naviCount}건`}</span><small>{row.naviCount == null ? row.naviReason : '대학·전형·계열 기준 · 연도 미제공'}</small><b>광덕고 별도 사례</b><span>{row.school.total ? `지원 ${row.school.total} · 합격 ${row.school.accepted}` : '일치 사례 없음'}</span><small>{row.school.total ? `${row.school.years}${row.school.yearUnknown ? ` · 연도 미입력 ${row.school.yearUnknown}건` : ''}` : '대학·캠퍼스·학과·전형 정확 일치 기준'}</small></td>
        <td><SupportPlanButton compact active={saved.has(planKey(row.planItem))} disabled={busy || !studentSid || !row.track || saved.has(planKey(row.planItem)) || planItems.length >= 6} onClick={() => onAddPlan(row.planItem)}>{saved.has(planKey(row.planItem)) ? '지원 구성에 담김' : planItems.length >= 6 ? '6개 구성 완료' : '지원 구성에 추가'}</SupportPlanButton></td>
      </tr>)}</tbody></table></div> : <p className="kd-comparison-empty">선택한 유형의 전형이 없습니다. ‘전체’를 선택하거나 다른 모집단위를 담아주세요.</p>}
    </>}
    {!compareItems.length && !loading && !error && <div className="kd-comparison-empty"><b>아직 비교할 모집단위가 없습니다.</b><p>대학 상세에서 ‘대학 비교에 담기’를 누르면 이곳에 전형별로 펼쳐집니다.</p></div>}
    <footer><span>지원 구간은 참고용입니다. 대학별 환산점수나 합격 확률이 아닙니다.</span><button type="button" onClick={onGoResults}>대학 상세에서 비교 대상 추가</button></footer>
  </section>;
}
