import React, { useMemo, useState } from 'react';
import { validGrade, SUPPORT_BAND_META, trackAccentKey } from './admissionMetrics.js';
import { minimumDisplay, minimumYearLabel, shortSubjectName } from './naviMinimum.js';
import { MinimumFacts, RecommendedCourseDetails } from './SupportDecisionCard.jsx';

// 새 UI 수시 지원 구성의 판정 카드 보기 3종(A 컴팩트 카드 · B 한 줄 표 · C 목록+상세).
// 예전 큰 카드(SupportDecisionCard)는 한 장이 화면 반을 차지해 6장을 훑기 어려웠습니다.
// 세 보기 모두 같은 요약 값(planFacts)과 같은 상세(PlanDetail)를 써서 숫자가 어긋나지 않게 합니다.

const fmt = value => validGrade(value) == null ? '—' : Number(value).toFixed(2);
const signed = value => value == null ? '' : `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(2)}`;
const keyOf = item => [item.stored.university, item.stored.department, item.stored.admissionType, item.stored.track].join('|');

export const PLAN_VIEWS = [['compact', '컴팩트'], ['table', '한 줄 표'], ['split', '목록+상세'], ['card', '큰 카드']];

function minimumShort(ev, minimum) {
  const rule = ev?.count && ev?.threshold != null ? (ev.ruleType === 'each' ? `${ev.count}개 각 ${ev.threshold}` : `${ev.count}합 ${ev.threshold}`) : '';
  if (minimum.status === 'satisfied') return { tone: 'ok', text: rule ? `충족 · ${rule}` : '충족' };
  if (minimum.status === 'unsatisfied') return { tone: 'ng', text: rule ? `미도달 · ${rule}` : '미도달' };
  if (minimum.status === 'no-minimum') return { tone: 'none', text: '최저 없음' };
  if (minimum.status === 'unavailable') return { tone: 'warn', text: '모평 성적 필요' };
  if (minimum.status === 'manual') return { tone: 'warn', text: '원문 확인' };
  return { tone: 'none', text: minimum.label };
}

function courseShort(progress, status) {
  if (progress?.total) return `${progress.matched}/${progress.total}${progress.estimated ? ' (추정)' : ''}`;
  if (status === 'idle' || status === 'loading') return '연결 중';
  return '자료 없음';
}

export function planFacts(item, studentGrade, cutoffBasis) {
  const cutIndex = cutoffBasis === '50' ? 1 : 2, altIndex = cutoffBasis === '50' ? 2 : 1;
  const cut = item.admissionItem?.[cutIndex];
  const altCut = item.admissionItem?.[altIndex];
  const ev = item.comparisonEvidence?.minimumEvaluation || item.minimumEvaluation;
  const minimum = minimumDisplay(ev, item.minimumStatus);
  const diff = validGrade(studentGrade) != null && validGrade(cut) != null ? Number(studentGrade) - Number(cut) : null;
  const band = item.support?.label || '';
  const studentMin = (minimum.status === 'satisfied' || minimum.status === 'unsatisfied') && ev?.studentSum != null && ev?.ruleType !== 'each'
    ? `학생 ${ev.count}합 ${ev.studentSum}${(ev.selectedSubjects || []).length ? ` (${ev.selectedSubjects.map(x => `${shortSubjectName(x.name)}${x.grade}`).join(' ')})` : ''}` : '';
  return {
    cut, altCut, altLabel: altIndex === 1 ? '50' : '70', diff, band, bandKey: SUPPORT_BAND_META[band]?.key || 'none',
    ev, minimum, min: minimumShort(ev, minimum), studentMin, course: courseShort(item.recommendationProgress, item.recommendationStatus),
  };
}

function Track({ stored }) {
  return <span className={`kdn-pv-track is-${trackAccentKey(stored.admissionType)}`}>{stored.admissionType || '전형 확인'}{stored.track ? ` · ${stored.track}` : ''}</span>;
}
function Band({ facts, withDiff = true }) {
  return <span className={`kdn-pv-band is-${facts.bandKey}`}>{facts.band || '판정 없음'}{withDiff && facts.diff != null ? ` ${signed(facts.diff)}` : ''}</span>;
}
function MinChip({ facts }) {
  return <span className={`kdn-pv-min is-${facts.min.tone}`}>{facts.min.text}</span>;
}
function Actions({ item, busy, onRemove, onOpenCases, extra = null }) {
  return <span className="kdn-pv-acts">{extra}
    {onOpenCases && (item.stored.source === '광덕고 별도 사례' || item.schoolMatch?.total > 0) && <button type="button" data-kdn-bare onClick={() => onOpenCases(item.stored.university, item.stored.department, item.stored.track)}>광덕고 사례</button>}
    <button type="button" data-kdn-bare disabled={busy} onClick={() => onRemove(item.stored)} aria-label={`${item.stored.university} ${item.stored.track || ''} 지원 구성에서 삭제`}>삭제</button>
  </span>;
}

// 세 보기가 함께 쓰는 상세: 수능최저(판정 근거) · 권장과목(열 때 자동으로 펼침) · 출처·사례 근거.
export function PlanDetail({ item, facts, student, studentGrade, cutoffBasis = '70' }) {
  const { ev, minimum } = facts;
  const school = item.schoolMatch || (item.schoolTrend?.total ? { tier: null, label: '광덕고 별도 사례', total: item.schoolTrend.total, accepted: item.schoolTrend.accepted } : null);
  return <div className="kdn-pv-detail">
    <section className={`kdn-pv-dbox kd-decision-minimum is-${minimum.status}`}>
      <h5>수능최저 <span className="kdn-pv-year">{minimumYearLabel(ev, student)}</span></h5>
      <MinimumFacts minimum={minimum} ev={ev} student={student} />
    </section>
    <section className="kdn-pv-dbox"><RecommendedCourseDetails progress={item.recommendationProgress} status={item.recommendationStatus} defaultOpen /></section>
    <section className="kdn-pv-dbox kdn-pv-evidence">
      <h5>출처·사례 근거 <span className="kdn-pv-year">담은 경로 · {item.stored.source || '미제공'}</span></h5>
      {/* 같은 전형을 기준으로 NAVI(전국 공개 결과)와 광덕고(우리 학교 지원 사례)를 나란히 놓습니다. */}
      <div className="kdn-pv-ev2">
        <div className="col is-navi"><b>NAVI · 2026 공개 결과</b>
          <p><span>전형</span>{item.stored.admissionType || '-'} · {item.stored.track || '-'}</p>
          <p><span>{cutoffBasis}%컷</span>{fmt(facts.cut)}<em>{facts.altLabel}%컷 {fmt(facts.altCut)}</em></p>
          <p><span>통합 사례</span>{item.naviCaseCount != null ? `${item.naviCaseCount}건` : (item.comparisonEvidence?.naviReason || '미연결')}</p>
        </div>
        <div className={`col is-school${school?.tier ? ` tier-${school.tier}` : ' is-none'}`}><b>광덕고 대입결과 {school?.tier && <i className="tier">{school.tier}</i>}</b>
          <p className="lv">{school?.label || '연결 자료 없음'}</p>
          {school?.total > 0 && <p><span>지원·합격</span>지원 {school.total} · 합격 {school.accepted}{school.years ? <em>{school.years}</em> : null}</p>}
          {school?.acceptedGrade && <p><span>합격자 전교과</span>평균 {fmt(school.acceptedGrade.avg)}<em>{fmt(school.acceptedGrade.min)}~{fmt(school.acceptedGrade.max)} · {school.acceptedGrade.n}명</em></p>}
          {school?.acceptedGrade && validGrade(studentGrade) != null && <p className="me"><span>내 환산과 비교</span>{fmt(studentGrade)} vs {fmt(school.acceptedGrade.avg)} <em>{signed(Number(studentGrade) - school.acceptedGrade.avg)}</em></p>}
          {school?.tier && school.tier !== 'A' && school.units?.length > 0 && <p><span>사례 모집단위</span>{school.units.join(', ')}</p>}
        </div>
      </div>
      <small>NAVI 사례는 대학·전형·계열 기준이며 학과 합격자 수가 아닙니다. 광덕고 사례는 A(같은 모집단위·전형)에 가까울수록 직접 비교에 적합합니다. 최저 {ev?.year || '연도 확인'} · 실제 지원연도 모집요강을 우선 확인하세요.</small>
    </section>
    {item.trackMissing && <p className="kdn-pv-warn">NAVI 전형 미연결 · 다른 전형의 컷을 대신 사용하지 않습니다.</p>}
  </div>;
}

// A · 컴팩트 카드: 3열 그리드, 카드 한 장에 비교·최저·권장과목을 한 줄씩.
function CompactView({ entries, studentGrade, cutoffBasis, student, busy, onRemove, onOpenCases }) {
  const [open, setOpen] = useState(() => new Set());
  const toggle = key => setOpen(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  return <div className="kdn-pv-grid">{entries.map(({ item, index }) => {
    const facts = planFacts(item, studentGrade, cutoffBasis), key = keyOf(item), expanded = open.has(key);
    return <article key={key} className={`kdn-pv-tile is-${facts.bandKey}${expanded ? ' is-open' : ''}`}>
      <span className="kdn-pv-no">{index + 1}</span>
      <div className="kdn-pv-name"><b>{item.stored.university}</b><small>{item.stored.department}</small></div>
      <div><Track stored={item.stored} /></div>
      <div className="kdn-pv-cmp">
        <span className="v me"><small>내 환산</small><b>{fmt(studentGrade)}</b></span><i>vs</i>
        <span className="v"><small>{cutoffBasis}%컷</small><b>{fmt(facts.cut)}</b></span>
        <span className="r"><Band facts={facts} /><small>{facts.altLabel}%컷 {fmt(facts.altCut)}</small></span>
      </div>
      <div className="kdn-pv-line"><MinChip facts={facts} />{facts.studentMin && <small>{facts.studentMin}</small>}</div>
      <div className="kdn-pv-foot"><span>권장과목 <b>{facts.course}</b></span><Actions item={item} busy={busy} onRemove={onRemove} onOpenCases={onOpenCases} extra={<button type="button" data-kdn-bare aria-expanded={expanded} onClick={() => toggle(key)}>{expanded ? '접기 ▴' : '근거 ▾'}</button>} /></div>
      {expanded && <PlanDetail item={item} facts={facts} student={student} studentGrade={studentGrade} cutoffBasis={cutoffBasis} />}
    </article>;
  })}</div>;
}

// B · 한 줄 표: 컷 위치 막대(● 내 환산 · | 컷)로 6개 전형을 한 번에 비교, 행을 펼치면 상세.
function TableView({ entries, studentGrade, cutoffBasis, student, busy, onRemove, onOpenCases }) {
  const [openKey, setOpenKey] = useState('');
  const rows = entries.map(entry => ({ ...entry, facts: planFacts(entry.item, studentGrade, cutoffBasis) }));
  const values = [studentGrade, ...rows.map(row => row.facts.cut)].filter(value => validGrade(value) != null).map(Number);
  const lo = values.length ? Math.max(1, Math.floor(Math.min(...values) - 0.3)) : 1;
  const hi = values.length ? Math.ceil(Math.max(...values) + 0.3) : 5;
  const pos = value => `${Math.max(0, Math.min(100, ((Number(value) - lo) / Math.max(0.5, hi - lo)) * 100))}%`;
  return <div className="kdn-pv-tablewrap"><table className="kdn-pv-table">
    <thead><tr><th className="c">#</th><th>대학 · 모집단위</th><th>전형</th><th className="n">내 환산 / {cutoffBasis}%컷</th><th>컷 위치 <small>({lo} ← 등급 → {hi})</small></th><th>구간</th><th>수능최저</th><th>권장과목</th><th /></tr></thead>
    <tbody>{rows.map(({ item, index, facts }) => {
      const key = keyOf(item), open = openKey === key;
      return <React.Fragment key={key}>
        <tr className={open ? 'is-open' : ''}>
          <td className="c"><span className={`kdn-pv-no is-${facts.bandKey}`}>{index + 1}</span></td>
          <td><b className="u">{item.stored.university}</b><small className="d">{item.stored.department}</small></td>
          <td><Track stored={item.stored} /></td>
          <td className="n"><b className="me">{fmt(studentGrade)}</b> <span className="sl">/</span> <b>{fmt(facts.cut)}</b><small className="d">{facts.altLabel}%컷 {fmt(facts.altCut)}</small></td>
          <td><div className="kdn-pv-scale" title={`내 환산 ${fmt(studentGrade)} · ${cutoffBasis}%컷 ${fmt(facts.cut)}`}><span className="ln" />{validGrade(facts.cut) != null && <span className="cut" style={{ left: pos(facts.cut) }} />}{validGrade(studentGrade) != null && <span className="me" style={{ left: pos(studentGrade) }} />}</div></td>
          <td className="nw"><Band facts={facts} withDiff={false} />{facts.diff != null && <small className="df">{signed(facts.diff)}</small>}</td>
          <td><MinChip facts={facts} /></td>
          <td className="nw">{facts.course}</td>
          <td className="nw"><button type="button" data-kdn-bare className="kdn-pv-more" aria-expanded={open} onClick={() => setOpenKey(open ? '' : key)}>{open ? '접기 ▴' : '자세히 ▾'}</button></td>
        </tr>
        {open && <tr className="kdn-pv-detailrow"><td colSpan={9}><PlanDetail item={item} facts={facts} student={student} studentGrade={studentGrade} cutoffBasis={cutoffBasis} /><div className="kdn-pv-rowacts"><Actions item={item} busy={busy} onRemove={onRemove} onOpenCases={onOpenCases} /></div></td></tr>}
      </React.Fragment>;
    })}</tbody>
  </table></div>;
}

// C · 목록 + 상세: 왼쪽에서 6장을 짧게 훑고, 고른 전형 하나만 오른쪽에 크게.
function SplitView({ entries, studentGrade, cutoffBasis, student, busy, onRemove, onOpenCases }) {
  const [selected, setSelected] = useState('');
  const active = entries.find(entry => keyOf(entry.item) === selected) || entries[0];
  const facts = active ? planFacts(active.item, studentGrade, cutoffBasis) : null;
  return <div className="kdn-pv-split">
    <div className="kdn-pv-list" role="listbox" aria-label="지원 구성 목록">{entries.map(({ item, index }) => {
      const f = planFacts(item, studentGrade, cutoffBasis), key = keyOf(item), on = active && keyOf(active.item) === key;
      return <button key={key} type="button" data-kdn-bare role="option" aria-selected={on} className={`kdn-pv-item${on ? ' is-on' : ''}`} onClick={() => setSelected(key)}>
        <span className={`kdn-pv-no is-${f.bandKey}`}>{index + 1}</span>
        <span className="t"><b>{item.stored.university}</b><small>{item.stored.department} · {item.stored.admissionType || '전형 확인'}</small></span>
        <span className="r"><Band facts={f} withDiff={false} /><span className={`kdn-pv-min is-${f.min.tone}`}>{f.min.text.split(' · ')[0]}</span></span>
      </button>;
    })}</div>
    {active && <section className={`kdn-pv-pane is-${facts.bandKey}`}>
      <div className="kdn-pv-panehead"><div><h3>{active.item.stored.university} · {active.item.stored.department}</h3><div className="sub"><Track stored={active.item.stored} /> <span>2026 공개 결과 기준</span></div></div><Actions item={active.item} busy={busy} onRemove={onRemove} onOpenCases={onOpenCases} /></div>
      <div className="kdn-pv-kpis">
        <span className="me"><small>내 환산</small><b>{fmt(studentGrade)}</b></span>
        <span><small>{cutoffBasis}%컷</small><b>{fmt(facts.cut)}</b></span>
        <span><small>{facts.altLabel}%컷</small><b>{fmt(facts.altCut)}</b></span>
        <span className={`band is-${facts.bandKey}`}><small>지원 구간</small><b>{facts.band || '판정 없음'}{facts.diff != null ? ` ${signed(facts.diff)}` : ''}</b></span>
      </div>
      <PlanDetail item={active.item} facts={facts} student={student} studentGrade={studentGrade} cutoffBasis={cutoffBasis} />
    </section>}
  </div>;
}

export default function SupportPlanViews({ view, planItems = [], studentGrade, cutoffBasis, student, busy, onRemove, onOpenCases }) {
  const entries = useMemo(() => planItems.map((item, index) => item ? { item, index } : null).filter(Boolean), [planItems]);
  if (!entries.length) return <div className="kdn-pv-empty">아직 담은 전형이 없습니다. NAVI 대학 상세나 광덕고 대입결과에서 ‘수시지원 추가’를 눌러 담으세요.</div>;
  const props = { entries, studentGrade, cutoffBasis, student, busy, onRemove, onOpenCases };
  if (view === 'table') return <TableView {...props} />;
  if (view === 'split') return <SplitView {...props} />;
  return <CompactView {...props} />;
}
