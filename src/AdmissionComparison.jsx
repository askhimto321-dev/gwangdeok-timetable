import React, { useState } from 'react';
import SupportPlanButton from './SupportPlanButton.jsx';
import { COMPARISON_YEARS } from './admissionComparison.js';
import './admissionComparison.css';
import { RecommendedCourseDetails } from './SupportDecisionCard.jsx';
import { supportBandClassName, trackChipClassName } from './admissionMetrics.js';
import { minimumDisplay, minimumYearLabel, studentMockChips } from './naviMinimum.js';
import { isNewUi } from './uiMode.js';

const grade = value => value == null ? '—' : value.toFixed(2);

export default function AdmissionComparison({ rows = [], compareItems = [], planItems = [], source, cutoffBasis, convertedGrade, student, busy, studentSid, loading, error, onAddPlan, onRemoveCompare, onGoResults, planKey }) {
  if (isNewUi()) return <AdmissionComparisonCards rows={rows} compareItems={compareItems} planItems={planItems} source={source} cutoffBasis={cutoffBasis} convertedGrade={convertedGrade} student={student} busy={busy} studentSid={studentSid} loading={loading} error={error} onAddPlan={onAddPlan} onRemoveCompare={onRemoveCompare} onGoResults={onGoResults} planKey={planKey} />;
  return <ClassicAdmissionComparison rows={rows} compareItems={compareItems} planItems={planItems} source={source} cutoffBasis={cutoffBasis} convertedGrade={convertedGrade} student={student} busy={busy} studentSid={studentSid} loading={loading} error={error} onAddPlan={onAddPlan} onRemoveCompare={onRemoveCompare} onGoResults={onGoResults} planKey={planKey} />;
}

function ClassicAdmissionComparison({ rows = [], compareItems = [], planItems = [], source, cutoffBasis, convertedGrade, student, busy, studentSid, loading, error, onAddPlan, onRemoveCompare, onGoResults, planKey }) {
  const [type, setType] = useState('전체');
  const visible = rows.filter(row => row.missing || type === '전체' || row.admissionType === type);
  const tracks = visible.filter(row => !row.missing);
  const saved = new Set(planItems.map(row => planKey(row.stored)));
  return <section className="kd-track-comparison" aria-labelledby="kd-comparison-title" aria-busy={loading || busy || undefined}>
    <header className="kd-comparison-heading"><div><h3 id="kd-comparison-title">전형별 비교</h3><p>최대 5개 모집단위를 담고, 각 전형의 컷·반영 교과·최저를 한 행에서 비교하세요.</p></div><strong>{loading ? '조회 중' : `${compareItems.length}/5 모집단위`}</strong></header>
    <div className="kd-comparison-note">입시결과와 전형명은 {COMPARISON_YEARS.result}학년도입니다. 이 표의 최저는 같은 {COMPARISON_YEARS.result}학년도 원문과만 연결합니다. {COMPARISON_YEARS.minimum}·2028 최저는 별도 전형 자료이며 실제 지원 조건은 해당 연도 모집요강을 확인하세요.<br/>위 &apos;학생&apos; 내신은 모든 대학에 동일하게 적용하는 공통 참고 환산값입니다. 대학별 실제 반영교과·학년별 비율·진로선택 처리 방식은 이 값과 다를 수 있습니다.</div>
    <details className="kd-comparison-source"><summary>출처와 집계 범위 확인</summary><p>출처: 경기도교육청 NAVI 업로드 자료. 현재 파서(schema v1)는 2026 입시결과와 2027 전형 정보를 연결합니다.</p><p>원본 파일: {source?.fileName || source?.name || '파일명 미제공'}<br/>파일 기준일: {source?.sourceDate || '미제공'} · 저장일: {source?.savedAt?.slice(0,10) || '미제공'}</p><p>공개 컷의 표본 수와 NAVI 통합 사례의 연도는 현재 저장 자료에 없습니다. NAVI 건수는 대학·전형·계열 단위로, 해당 학과의 합격자 수가 아닙니다. 광덕고 사례와 합산하지 않습니다.</p></details>
    {!studentSid && <p className="kd-comparison-note">학생을 선택하면 비교 목록과 지원 구성을 저장할 수 있습니다.</p>}
    {loading && <p role="status">저장된 목록을 확인하고 있습니다. 조회 완료 전에는 목록을 수정할 수 없습니다.</p>}
    {error && <p role="status">목록 확인 실패 · 표시된 자료는 이전 조회 결과일 수 있습니다. 다시 불러온 뒤 수정하세요.</p>}
    {compareItems.length > 0 && <>
      <ul className="kd-comparison-selection" aria-label="비교할 모집단위">{compareItems.map(item => <li key={JSON.stringify(item.stored)}><span><b>{item.stored.university}</b> · {item.stored.department}</span><button type="button" disabled={busy} aria-label={`${item.stored.university} ${item.stored.department} 비교에서 제거`} onClick={() => onRemoveCompare(item.stored)}>제거</button></li>)}</ul>
      <div className="kd-comparison-toolbar"><div role="group" aria-label="비교 전형 유형">{['전체', '교과', '종합'].map(value => <button key={value} type="button" aria-pressed={type === value} onClick={() => setType(value)}>{value}</button>)}</div><span role="status">표시 {tracks.length}개 전형 · {cutoffBasis}%컷 기준</span></div>
      {/* 예전에는 대학·컷비교·교과반영·수능최저·사례근거·지원구성 6개 열이 한 화면에 다 있어서
          1000px 넘게 필요해 항상 가로 스크롤이 생겼습니다. 지금 바로 봐야 할 4가지(대학/컷비교/
          수능최저/지원)만 열로 남기고, 교과 반영·NAVI·광덕고 사례처럼 상담 중 필요할 때만 보는
          정보는 마지막 열의 '자세히'로 접어서 한 페이지 안에 들어오게 했습니다. */}
      {visible.length ? <div className="kd-comparison-scroll" tabIndex={0} role="region" aria-label="전형별 비교표. 좁은 화면에서는 가로로 스크롤하세요."><table className="kd-comparison-table"><caption>전형별 비교 — 대학 공개 컷은 9등급 기준, 서로 다른 대학의 산출 방식은 다를 수 있습니다.</caption><thead><tr>{['대학·모집단위 / 전형','내신 컷 비교','수능최저','상세 · 지원 구성'].map(title => <th key={title} scope="col">{title}</th>)}</tr></thead><tbody>{visible.map(row => {
        if (row.missing) return <tr key={row.id}><th scope="row">{row.stored.university}<small>{row.stored.department}</small></th><td colSpan={3}>{row.reason}</td></tr>;
        const minimum = minimumDisplay(row.minimumEvaluation, row.minimumStatus);
        const hasEvidence = !!row.minimumEvaluation && !['unlinked','not-listed','source-pending'].includes(minimum.status);
        const chips = !hasEvidence ? studentMockChips(student) : null;
        const disabled = busy || !studentSid || !row.track || saved.has(planKey(row.planItem)) || planItems.length >= 6;
        return <tr key={row.id}>
        {/* 전형(교과/종합·전형명)을 배지로 올려 표 안에서 가장 먼저 눈에 들어오게 합니다. 유형별로 배지 색을 다르게 해 구분도 쉽게 했습니다. */}
        <th scope="row"><b>{row.university}</b><small>{row.region || '지역 미제공'} · {row.department}</small><span className={trackChipClassName(row.admissionType)}>{row.admissionType} · {row.track || '전형명 미제공'}</span>{row.previousDepartment !== row.department && <small>2026: {row.previousDepartment || '미제공'}</small>}
          {/* 7번 요청: 내신컷 위치·최저충족과 별도로 지원자격을 세 번째 판정으로 분리해 보여줍니다. */}
          <small className={`kd-eligibility-note is-${row.eligibility?.status || 'unavailable'}`}>지원자격 · {row.eligibility?.label || '확인 불가'}</small>
        </th>
        {/* 상담에서 가장 먼저 비교하는 두 숫자(학생 현재 내신 vs 공개 컷)를 한 줄로 강조합니다.
            아래 참고 줄은 위에서 이미 보여준 컷을 또 적지 않고, '다른 쪽 컷' 하나만 보조로 붙입니다. */}
        <td><div className="kd-comparison-headline">
            <div className="kd-key-fact is-student"><small>학생</small><b>{grade(convertedGrade)}</b></div>
            <span className="kd-comparison-arrow" aria-hidden="true">↔</span>
            <div className="kd-key-fact"><small>{cutoffBasis}%컷</small><b>{grade(cutoffBasis === '50' ? row.cut50 : row.cut70)}</b></div>
            <span className={supportBandClassName(row.support?.label)}>{row.support?.label || '판정 자료 없음'}{row.support?.diff != null && <em>{row.support.diff > 0 ? '+' : ''}{row.support.diff.toFixed(2)}</em>}</span>
          </div>
          <small>{cutoffBasis === '50' ? '70' : '50'}%컷 참고 {grade(cutoffBasis === '50' ? row.cut70 : row.cut50)}</small></td>
        {/* 최저충족여부는 표 안에서 유일하게 '합격 가능성'에 직접 관계된 정보라 배지로 강조합니다.
            일치하는 대학 자료가 없으면(unlinked) 안내 문구 대신 학생 본인의 최근 모의고사 등급을 보여줍니다. */}
        <td><div className="kd-comparison-minimum-head"><span className={`kd-status-pill is-${minimum.status}`}>{minimum.label}</span><span className={`kd-comparison-minimum-year ${row.minimumEvaluation?.yearMismatch||(student?.admissionYear&&row.minimumEvaluation?.year&&Number(student.admissionYear)!==Number(row.minimumEvaluation.year))?'is-reference':''}`}>{minimumYearLabel(row.minimumEvaluation,student)}</span></div>
          {hasEvidence ? <><small className="kd-comparison-rule">{row.minimumText}</small><small>{minimum.reason}</small></> : chips ? <div className="kd-mock-chips">
            {student?.latestMockLabel && <span className="kd-mock-chips-label">{student.latestMockLabel}</span>}
            {chips.map(([label, value]) => <span key={label} className="kd-mock-chip">{label} {value}</span>)}
          </div> : <small>{minimum.reason}</small>}
          {!hasEvidence && chips && <details><summary>연결 확인</summary><small>{minimum.reason}</small></details>}
        </td>
        {/* 기본값은 지원 구성 버튼만 바로 보이게 하고, 교과 반영·최저 연도/출처·NAVI/광덕고 근거는
            접어서(details) 표 너비와 셀 안 줄 수를 줄였습니다(예전에는 최저 칸에 3줄이 항상 떠 있었습니다). */}
        <td className="kd-comparison-detail-cell">
          <SupportPlanButton compact active={saved.has(planKey(row.planItem))} disabled={disabled} onClick={() => onAddPlan(row.planItem)}>{saved.has(planKey(row.planItem)) ? '지원 구성에 담김' : planItems.length >= 6 ? '6개 구성 완료' : '수시지원 추가'}</SupportPlanButton>
          <details className="kd-evidence-more"><summary>교과반영·근거 자세히</summary>
            <p className="kd-comparison-detail-course">{row.course}</p>
            <RecommendedCourseDetails progress={row.recommendationProgress}/>
            {hasEvidence && <div className="kd-evidence-row"><b>최저 연도·출처</b><span>{row.minimumEvaluation.year || '연도 확인'} · {row.minimumEvaluation.source || 'NAVI 최저 참고자료'}</span></div>}
            <div className="kd-evidence-row"><b>NAVI</b><span>{row.naviCount == null ? '미연결/미제공' : `${row.naviCount}건`}</span></div>
            <div className="kd-evidence-row"><b>광덕고</b><span>{row.school.total ? `지원 ${row.school.total} · 합격 ${row.school.accepted}` : '일치 사례 없음'}</span></div>
            <small>{row.naviCount == null ? row.naviReason : '대학·전형·계열 기준 · 연도 미제공'}</small>
            <small>{row.school.total ? `${row.school.years}${row.school.yearUnknown ? ` · 연도 미입력 ${row.school.yearUnknown}건` : ''}` : '대학·캠퍼스·학과·전형 정확 일치 기준'}</small>
          </details>
        </td>
      </tr>;
      })}</tbody></table></div> : <p className="kd-comparison-empty">선택한 유형의 전형이 없습니다. ‘전체’를 선택하거나 다른 모집단위를 담아주세요.</p>}
    </>}
    {!compareItems.length && !loading && !error && <div className="kd-comparison-empty"><b>아직 비교할 모집단위가 없습니다.</b><p>대학 상세에서 ‘대학 비교에 담기’를 누르면 이곳에 전형별로 펼쳐집니다.</p></div>}
    <footer><span>지원 구간은 참고용입니다. 대학별 환산점수나 합격 확률이 아닙니다.</span><button type="button" onClick={onGoResults}>대학 상세에서 비교 대상 추가</button></footer>
  </section>;
}

// 새 UI 전형별 비교: 모집단위마다 카드 하나, 카드 안에서 전형을 한 줄씩 나란히 놓습니다.
// 한 줄 = 전형 · 컷 위치 막대(나 ● / 컷 |) · 구간 · 수능최저 · 담기. 교과 반영·근거는 '자세히'로 접습니다.
function AdmissionComparisonCards({ rows = [], compareItems = [], planItems = [], source, cutoffBasis, convertedGrade, student, busy, studentSid, loading, error, onAddPlan, onRemoveCompare, onGoResults, planKey }) {
  const [type, setType] = useState('전체');
  const [openId, setOpenId] = useState('');
  const visible = rows.filter(row => row.missing || type === '전체' || row.admissionType === type);
  const tracks = visible.filter(row => !row.missing);
  const saved = new Set(planItems.map(row => planKey(row.stored)));
  const cutOf = row => cutoffBasis === '50' ? row.cut50 : row.cut70;
  const values = [convertedGrade, ...tracks.map(cutOf)].filter(value => Number.isFinite(value));
  const lo = values.length ? Math.max(1, Math.floor(Math.min(...values) - 0.3)) : 1;
  const hi = values.length ? Math.ceil(Math.max(...values) + 0.3) : 5;
  const pos = value => Math.max(0, Math.min(100, ((value - lo) / Math.max(0.5, hi - lo)) * 100));
  const groups = [];
  for (const row of visible) {
    const key = JSON.stringify([row.stored?.university, row.stored?.region, row.stored?.department]);
    let group = groups.find(item => item.key === key);
    if (!group) { group = { key, stored: row.stored, first: row, rows: [] }; groups.push(group); }
    group.rows.push(row);
  }
  return <section className="kdn-tcmp" aria-labelledby="kd-comparison-title" aria-busy={loading || busy || undefined}>
    <header className="kdn-tcmp-head">
      <div><h3 id="kd-comparison-title">전형별 비교</h3><p>담은 모집단위의 전형을 한 줄씩 비교합니다. 막대에서 <i className="me" />가 내 환산, <i className="cut" />가 {cutoffBasis}%컷입니다.</p></div>
      <div className="kdn-tcmp-me"><small>내 환산 (공통 참고)</small><b>{grade(convertedGrade)}</b></div>
      <strong className="kdn-tcmp-count">{loading ? '조회 중' : `${compareItems.length}/5 모집단위`}</strong>
    </header>
    <details className="kdn-tcmp-info"><summary>비교 기준·출처 안내</summary>
      <p>입시결과와 전형명은 {COMPARISON_YEARS.result}학년도입니다. 최저는 같은 {COMPARISON_YEARS.result}학년도 원문과 연결하며, {COMPARISON_YEARS.minimum}·2028 최저는 해당 연도 모집요강을 확인하세요.</p>
      <p>내 환산은 모든 대학에 같은 방식으로 적용한 참고값입니다. 대학별 반영교과·학년 비율·진로선택 처리 방식은 다를 수 있습니다.</p>
      <p>출처: 경기도교육청 NAVI 업로드 자료 · 원본 {source?.fileName || source?.name || '파일명 미제공'} · 기준일 {source?.sourceDate || '미제공'} · 저장일 {source?.savedAt?.slice(0,10) || '미제공'}. NAVI 건수는 대학·전형·계열 단위이며 광덕고 사례와 합산하지 않습니다.</p>
    </details>
    {!studentSid && <p className="kdn-tcmp-warn">학생을 선택하면 비교 목록과 지원 구성을 저장할 수 있습니다.</p>}
    {loading && <p className="kdn-tcmp-warn" role="status">저장된 목록을 확인하고 있습니다. 조회 완료 전에는 목록을 수정할 수 없습니다.</p>}
    {error && <p className="kdn-tcmp-warn" role="status">목록 확인 실패 · 표시된 자료는 이전 조회 결과일 수 있습니다.</p>}
    {compareItems.length > 0 && <div className="kdn-tcmp-bar">
      <div className="kdn-seg sm" role="group" aria-label="비교 전형 유형">{['전체', '교과', '종합'].map(value => <button key={value} type="button" aria-pressed={type === value} onClick={() => setType(value)}>{value}</button>)}</div>
      <span role="status">{tracks.length}개 전형 · {cutoffBasis}%컷 기준 · 막대 범위 {lo}~{hi}등급</span>
    </div>}
    {compareItems.length > 0 && (groups.length ? <div className="kdn-tcmp-groups">{groups.map(group => {
      const head = group.rows.find(row => !row.missing) || group.first;
      return <article key={group.key} className="kdn-tcmp-group">
        <header><div><b>{group.stored?.university || head.university}</b><span>{group.stored?.department || head.department}</span>{(head.region || group.stored?.region) && <small>{head.region || group.stored?.region}</small>}</div>
          <button type="button" data-kdn-bare className="rm" disabled={busy} aria-label={`${group.stored?.university} ${group.stored?.department} 비교에서 제거`} onClick={() => onRemoveCompare(group.stored)}>제거</button></header>
        {group.rows.map(row => {
          if (row.missing) return <div key={row.id} className="kdn-tcmp-row is-missing"><span>{row.reason}</span></div>;
          const minimum = minimumDisplay(row.minimumEvaluation, row.minimumStatus);
          const hasEvidence = !!row.minimumEvaluation && !['unlinked','not-listed','source-pending'].includes(minimum.status);
          const inPlan = saved.has(planKey(row.planItem));
          const disabled = busy || !studentSid || !row.track || inPlan || planItems.length >= 6;
          const cut = cutOf(row), me = convertedGrade;
          const hasMe = Number.isFinite(me), hasCut = Number.isFinite(cut);
          const ok = hasMe && hasCut && me <= cut;
          const open = openId === row.id;
          const yearRef = row.minimumEvaluation?.yearMismatch || (student?.admissionYear && row.minimumEvaluation?.year && Number(student.admissionYear) !== Number(row.minimumEvaluation.year));
          return <div key={row.id} className={`kdn-tcmp-row${open ? ' is-open' : ''}`}>
            <div className="line">
              <div className="tr"><span className={trackChipClassName(row.admissionType)}>{row.admissionType} · {row.track || '전형명 미제공'}</span><small className={`el is-${row.eligibility?.status || 'unavailable'}`}>지원자격 {row.eligibility?.label || '확인 불가'}</small>{row.previousDepartment && row.previousDepartment !== row.department && <small className="prev">2026: {row.previousDepartment}</small>}</div>
              <div className="cutbox">
                <div className="nums"><b className="me">{grade(me)}</b><span>vs</span><b>{grade(cut)}</b><small>{cutoffBasis === '50' ? '70' : '50'}%컷 {grade(cutoffBasis === '50' ? row.cut70 : row.cut50)}</small></div>
                <div className="scale" title={`내 환산 ${grade(me)} · ${cutoffBasis}%컷 ${grade(cut)}`}><i className="ln" />{hasMe && hasCut && <i className={`gap ${ok ? 'ok' : 'bad'}`} style={{ left: `${Math.min(pos(me), pos(cut))}%`, width: `${Math.abs(pos(me) - pos(cut))}%` }} />}{hasCut && <i className="cut" style={{ left: `${pos(cut)}%` }} />}{hasMe && <i className="me" style={{ left: `${pos(me)}%` }} />}</div>
              </div>
              <div className="band"><span className={supportBandClassName(row.support?.label)}>{row.support?.label || '판정 없음'}</span>{row.support?.diff != null && <em className={row.support.diff <= 0 ? 'ok' : 'bad'}>{row.support.diff > 0 ? '+' : ''}{row.support.diff.toFixed(2)}</em>}</div>
              <div className="min"><span className={`kd-status-pill is-${minimum.status}`}>{minimum.label}</span>{hasEvidence ? <small title={row.minimumText}>{row.minimumText}</small> : <small>{minimum.status === 'no-minimum' ? '최저 없음' : '요강 확인'}</small>}<small className={`yr${yearRef ? ' is-ref' : ''}`}>{minimumYearLabel(row.minimumEvaluation, student)}</small></div>
              <div className="act"><SupportPlanButton compact active={inPlan} disabled={disabled} onClick={() => onAddPlan(row.planItem)}>{inPlan ? '담김' : planItems.length >= 6 ? '6개 완료' : '지원 추가'}</SupportPlanButton><button type="button" data-kdn-bare className="more" aria-expanded={open} onClick={() => setOpenId(open ? '' : row.id)}>{open ? '접기' : '자세히'}</button></div>
            </div>
            {open && <div className="detail">
              {hasEvidence ? <p><b>수능최저 판정</b> {minimum.reason}</p> : <p><b>수능최저</b> {minimum.reason}{(() => { const chips = studentMockChips(student); return chips?.length ? <span className="mock">{student?.latestMockLabel ? `${student.latestMockLabel} · ` : ''}{chips.map(([label, value]) => `${label} ${value}`).join(' · ')}</span> : null; })()}</p>}
              <p><b>교과 반영</b> {row.course}</p>
              <RecommendedCourseDetails progress={row.recommendationProgress}/>
              <p className="ev"><span><b>NAVI</b> {row.naviCount == null ? (row.naviReason || '미연결') : `${row.naviCount}건 · 대학·전형·계열 기준`}</span><span><b>광덕고</b> {row.school.total ? `지원 ${row.school.total} · 합격 ${row.school.accepted}${row.school.years ? ` · ${row.school.years}` : ''}` : '일치 사례 없음'}</span>{hasEvidence && <span><b>최저 출처</b> {row.minimumEvaluation.year || '연도 확인'} · {row.minimumEvaluation.source || 'NAVI 최저 참고자료'}</span>}</p>
            </div>}
          </div>;
        })}
      </article>;
    })}</div> : <p className="kdn-tcmp-warn">선택한 유형의 전형이 없습니다. ‘전체’를 선택하거나 다른 모집단위를 담아주세요.</p>)}
    {!compareItems.length && !loading && !error && <div className="kdn-tcmp-empty"><b>아직 비교할 모집단위가 없습니다.</b><p>대학 상세에서 ‘대학 비교에 담기’를 누르면 이곳에 전형별로 펼쳐집니다.</p></div>}
    <footer className="kdn-tcmp-foot"><span>지원 구간은 참고용입니다. 대학별 환산점수나 합격 확률이 아닙니다.</span><button type="button" onClick={onGoResults}>대학 상세에서 비교 대상 추가</button></footer>
  </section>;
}
