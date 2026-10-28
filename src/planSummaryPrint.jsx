import React from 'react';
import { supportBandValue, SUPPORT_BAND_META, validGrade } from './admissionMetrics.js';

// 인쇄 마지막 장: 수시 지원 구성을 한눈에 보는 요약(구간 분포 막대 + 컷 위치 그래프).
// 상담 인쇄와 수시 지원 구성 인쇄가 같은 화면을 씁니다.

export const PLAN_BAND_ORDER = ['상향', '소신', '적정', '안정', '하향'];
const MIN_LABEL = { satisfied: '충족', unsatisfied: '미충족', 'no-minimum': '없음', manual: '원문 확인', unavailable: '모평 필요' };
const fmt = value => (validGrade(value) == null ? '—' : Number(value).toFixed(2));

// rows: [{ no, university, department, kind, track, cut, minimum }]
export function planSummaryRows(rows = [], studentGrade) {
  return rows.map(row => {
    const band = supportBandValue(studentGrade, row.cut);
    return { ...row, cut: validGrade(row.cut), band: band?.label || '', diff: band?.diff ?? null };
  });
}

// 지원 구성 화면의 카드 자료(SusiNaviBeta)를 요약 줄로 바꿉니다.
export function rowsFromDecisionItems(items = [], cutoffBasis = '70') {
  const cutIndex = cutoffBasis === '50' ? 1 : 2;
  return items.map((item, index) => item && ({
    no: index + 1,
    university: item.stored?.university || '',
    department: item.stored?.department || '',
    kind: item.stored?.admissionType || '',
    track: item.stored?.track || '',
    cut: item.admissionItem?.[cutIndex],
    minimum: item.minimumEvaluation?.status || item.minimumStatus || '',
  })).filter(Boolean);
}

function axisRange(grade, cuts) {
  const values = [grade, ...cuts].filter(value => value != null);
  if (!values.length) return [1, 5];
  let lo = Math.floor((Math.min(...values) - 0.3) * 2) / 2;
  let hi = Math.ceil((Math.max(...values) + 0.3) * 2) / 2;
  if (grade != null) { lo = Math.min(lo, Math.floor((grade - 0.8) * 2) / 2); hi = Math.max(hi, Math.ceil((grade + 0.8) * 2) / 2); }
  lo = Math.max(1, lo); hi = Math.min(9, Math.max(hi, lo + 1));
  return [lo, hi];
}

export function PlanSummaryPage({ rows = [], studentGrade, cutoffBasis = '70', studentLabel = '', className = '' }) {
  const grade = validGrade(studentGrade);
  const list = planSummaryRows(rows, grade);
  const counts = PLAN_BAND_ORDER.map(label => [label, list.filter(row => row.band === label).length]);
  const judged = counts.reduce((sum, [, n]) => sum + n, 0);
  const noCut = list.length - judged;
  const [lo, hi] = axisRange(grade, list.map(row => row.cut));
  const pos = value => `${Math.max(0, Math.min(100, ((value - lo) / (hi - lo)) * 100))}%`;
  // 학생 등급 기준 구간(컷이 이 구간에 있으면 그 판정). 왼쪽일수록 컷이 높음(상향).
  const zones = grade == null ? [] : [
    ['상향', lo, grade - 0.5], ['소신', grade - 0.5, grade - 0.2], ['적정', grade - 0.2, grade + 0.2], ['안정', grade + 0.2, grade + 0.5], ['하향', grade + 0.5, hi],
  ].map(([label, a, b]) => [label, Math.max(lo, a), Math.min(hi, b)]).filter(([, a, b]) => b > a);
  const ticks = [];
  for (let t = Math.ceil(lo * 2) / 2; t <= hi + 1e-9; t += 0.5) if (grade == null || Math.abs(t - grade) > 0.22) ticks.push(Math.round(t * 10) / 10);
  const reachCount = counts.filter(([label]) => label === '상향' || label === '소신').reduce((s, [, n]) => s + n, 0);
  const safeCount = counts.filter(([label]) => label === '안정' || label === '하향').reduce((s, [, n]) => s + n, 0);
  const balance = !judged ? '컷 자료가 연결된 전형이 없어 구간을 나누지 못했습니다.'
    : reachCount && !safeCount ? '상향·소신 위주 구성이에요. 안정 지원을 1~2개 함께 검토해 보세요.'
      : safeCount && !reachCount ? '안정 위주 구성이에요. 소신 지원 여지가 있는지 함께 검토해 보세요.'
        : `상향·소신 ${reachCount}개 · 적정 ${counts[2][1]}개 · 안정·하향 ${safeCount}개로 나뉘어 있어요.`;
  return <section className={`kd-plan-summary ${className}`.trim()}>
    <header className="kps-head">
      <div><small>수시 지원 현황 한눈에 보기</small><h2>지원 구성 요약</h2>{studentLabel && <p>{studentLabel}</p>}</div>
      <div className="kps-me"><small>내 환산등급</small><b>{fmt(grade)}</b><em>{cutoffBasis}%컷 기준 판정</em></div>
    </header>
    <div className="kps-dist">
      <div className="kps-dist-top"><b>구간 분포</b><span>전체 {list.length}개 전형{noCut ? ` · 컷 미연결 ${noCut}개` : ''}</span></div>
      <div className="kps-stack" role="img" aria-label={counts.map(([l, n]) => `${l} ${n}`).join(', ')}>
        {judged ? counts.filter(([, n]) => n).map(([label, n]) => <span key={label} className={`is-${SUPPORT_BAND_META[label].key}`} style={{ flexGrow: n }}><b>{label}</b> {n}</span>) : <span className="is-none" style={{ flexGrow: 1 }}>판정 자료 없음</span>}
      </div>
      <div className="kps-legend">{counts.map(([label, n]) => <span key={label} className={`is-${SUPPORT_BAND_META[label].key}${n ? '' : ' is-zero'}`}><i />{label} <b>{n}</b><small>{SUPPORT_BAND_META[label].detail}</small></span>)}</div>
      <p className="kps-note">{balance}</p>
    </div>
    <div className="kps-chart">
      <div className="kps-chart-top"><b>전형별 컷 위치</b><span>점선 = 내 등급 · 점 = {cutoffBasis}%컷 · 왼쪽일수록 컷이 높아요(어려움)</span></div>
      <div className="kps-row kps-axis-row">
        <span className="kps-label" />
        <span className="kps-track kps-zones">
          {zones.map(([label, a, b]) => <span key={label} className={`kps-zone is-${SUPPORT_BAND_META[label].key}`} style={{ left: pos(a), width: `calc(${pos(b)} - ${pos(a)})` }}>{label}</span>)}
        </span>
        <span className="kps-val">판정</span>
      </div>
      {list.map(row => <div key={row.no} className="kps-row">
        <span className="kps-label"><i>{row.no}</i><span><b>{row.university || '대학 미지정'}</b><small>{[row.department, [row.kind, row.track].filter(Boolean).join(' · ')].filter(Boolean).join(' · ')}</small></span></span>
        <span className="kps-track">
          {zones.map(([label, a, b]) => <span key={label} className={`kps-bg is-${SUPPORT_BAND_META[label].key}`} style={{ left: pos(a), width: `calc(${pos(b)} - ${pos(a)})` }} />)}
          {grade != null && <span className="kps-me-line" style={{ left: pos(grade) }} />}
          {row.cut != null ? <span className={`kps-dot is-${SUPPORT_BAND_META[row.band]?.key || 'none'}`} style={{ left: pos(row.cut) }}><em>{fmt(row.cut)}</em></span> : <span className="kps-nocut">컷 자료 없음</span>}
        </span>
        <span className="kps-val">
          {row.band ? <b className={`kps-pill is-${SUPPORT_BAND_META[row.band].key}`}>{row.band}</b> : <b className="kps-pill is-none">—</b>}
          <small>{row.diff == null ? '' : `차이 ${row.diff > 0 ? '+' : ''}${row.diff.toFixed(2)}`}{row.minimum && MIN_LABEL[row.minimum] ? `${row.diff == null ? '' : ' · '}최저 ${MIN_LABEL[row.minimum]}` : ''}</small>
        </span>
      </div>)}
      <div className="kps-row kps-ticks-row">
        <span className="kps-label" />
        <span className="kps-track kps-ticks">{ticks.map(t => <span key={t} style={{ left: pos(t) }}>{t.toFixed(1)}</span>)}{grade != null && <span className="kps-me-tick" style={{ left: pos(grade) }}>나 {fmt(grade)}</span>}</span>
        <span className="kps-val" />
      </div>
    </div>
    <footer className="kps-foot">판정 기준: 내 등급 − 컷 · 상향 +0.5 초과 / 소신 +0.2~+0.5 / 적정 ±0.2 / 안정 −0.2~−0.5 / 하향 −0.5 미만. 공개 컷(2026) 기준 참고 자료이며 합격을 보장하지 않습니다.</footer>
  </section>;
}

export const PLAN_SUMMARY_CSS = `
.kd-plan-summary{--kps-ink:#1f2430;--kps-muted:#6b7280;--kps-line:#e3e6ec;--kps-bg:#f6f7fa;display:grid;gap:4mm;color:var(--kps-ink);font-family:Pretendard,"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;break-before:page;page-break-before:always;break-inside:avoid}
.kd-plan-summary *{box-sizing:border-box}
.kd-plan-summary .is-up{--b:#b3413a;--bs:#fdeceb;--bl:#eeb9b3}
.kd-plan-summary .is-reach{--b:#9c5a1d;--bs:#fff1de;--bl:#eecb96}
.kd-plan-summary .is-fit{--b:#7a6412;--bs:#fdf3bd;--bl:#e3cd63}
.kd-plan-summary .is-safe{--b:#236b45;--bs:#e7f7ee;--bl:#aedcc0}
.kd-plan-summary .is-down{--b:#2b5588;--bs:#e7f0fb;--bl:#b7cfe9}
.kd-plan-summary .is-none{--b:#5a6b7d;--bs:#eef1f5;--bl:#d7dee6}
.kps-head{display:flex;align-items:flex-end;justify-content:space-between;gap:6mm;padding-bottom:3mm;border-bottom:.6mm solid var(--kps-ink)}
.kps-head small{display:block;font-size:8.5pt;font-weight:700;color:var(--kps-muted)}
.kps-head h2{margin:.5mm 0 0;font-size:17pt;font-weight:900;line-height:1.2}
.kps-head p{margin:.8mm 0 0;font-size:9pt;color:var(--kps-muted)}
.kps-me{display:grid;justify-items:end;gap:.3mm;padding:2mm 4mm;border-radius:2.5mm;background:var(--kps-bg)}
.kps-me b{font-size:20pt;font-weight:900;line-height:1;color:#d4521b}
.kps-me em{font-style:normal;font-size:8pt;color:var(--kps-muted)}
.kps-dist,.kps-chart{display:grid;gap:2.2mm;padding:3.5mm 4mm;border:.3mm solid var(--kps-line);border-radius:3mm;break-inside:avoid}
.kps-dist-top,.kps-chart-top{display:flex;align-items:baseline;justify-content:space-between;gap:4mm}
.kps-dist-top b,.kps-chart-top b{font-size:11.5pt;font-weight:900}
.kps-dist-top span,.kps-chart-top span{font-size:8.5pt;color:var(--kps-muted)}
.kps-stack{display:flex;height:10mm;border-radius:2mm;overflow:hidden;gap:.6mm}
.kps-stack>span{display:flex;align-items:center;justify-content:center;gap:1mm;min-width:12mm;background:var(--b);color:#fff;font-size:10pt;font-weight:800;white-space:nowrap}
.kps-stack>span.is-none{background:var(--bs);color:var(--b)}
.kps-legend{display:flex;flex-wrap:wrap;gap:1.5mm 5mm}
.kps-legend span{display:inline-flex;align-items:center;gap:1.2mm;font-size:9pt;font-weight:700;color:var(--b)}
.kps-legend span.is-zero{opacity:.45}
.kps-legend i{width:3mm;height:3mm;border-radius:.8mm;background:var(--b)}
.kps-legend b{font-size:10pt}
.kps-legend small{font-size:7.5pt;font-weight:600;color:var(--kps-muted)}
.kps-note{margin:0;padding:2mm 3mm;border-radius:2mm;background:var(--kps-bg);font-size:9.5pt;font-weight:700;color:#3d4555}
.kps-row{display:grid;grid-template-columns:52mm minmax(0,1fr) 30mm;align-items:center;gap:3mm;min-height:10.5mm;border-top:.25mm solid var(--kps-line)}
.kps-axis-row,.kps-ticks-row{border-top:0;min-height:6mm}
.kps-label{display:flex;align-items:center;gap:2mm;min-width:0}
.kps-label i{flex:0 0 5mm;height:5mm;display:grid;place-items:center;border-radius:50%;background:var(--kps-ink);color:#fff;font-style:normal;font-size:8pt;font-weight:800}
.kps-label>span{display:grid;min-width:0}
.kps-label b{font-size:10pt;font-weight:900;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kps-label small{font-size:7.8pt;color:var(--kps-muted);line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kps-track{position:relative;height:8mm}
.kps-bg{position:absolute;top:0;bottom:0;background:var(--bs)}
.kps-zones{height:6mm}
.kps-zone{position:absolute;top:0;bottom:0;display:flex;align-items:center;justify-content:center;background:var(--bs);border-bottom:.6mm solid var(--b);color:var(--b);font-size:8pt;font-weight:900;overflow:hidden;white-space:nowrap}
.kps-me-line{position:absolute;top:-1.6mm;bottom:-1.6mm;width:0;border-left:.6mm dashed #1f2430;z-index:1;transform:translateX(-50%)}
.kps-dot{position:absolute;z-index:2;top:50%;width:4.2mm;height:4.2mm;border-radius:50%;background:var(--b);border:.6mm solid #fff;box-shadow:0 0 0 .3mm var(--b);transform:translate(-50%,-50%)}
.kps-dot em{position:absolute;left:50%;bottom:100%;transform:translate(-50%,-.6mm);font-style:normal;font-size:7.8pt;font-weight:900;color:var(--b);white-space:nowrap}
.kps-nocut{position:absolute;left:0;top:50%;transform:translateY(-50%);font-size:8pt;color:var(--kps-muted)}
.kps-val{display:grid;justify-items:start;gap:.4mm;font-size:8pt;color:var(--kps-muted)}
.kps-axis-row .kps-val{font-weight:800}
.kps-pill{display:inline-flex;padding:.5mm 2.4mm;border:.3mm solid var(--bl);border-radius:99px;background:var(--bs);color:var(--b);font-size:9.5pt;font-weight:900}
.kps-val small{font-size:7.6pt;white-space:nowrap}
.kps-ticks{height:5mm}
.kps-ticks span{position:absolute;top:0;transform:translateX(-50%);font-size:7.5pt;color:var(--kps-muted)}
.kps-ticks .kps-me-tick{top:auto;bottom:-1.2mm;padding:0 1.2mm;border-radius:99px;background:#1f2430;color:#fff;font-weight:800}
.kps-foot{font-size:7.6pt;color:var(--kps-muted);line-height:1.5}
`;
