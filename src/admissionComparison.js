import { finiteNumber, validGrade, supportBandValue, admissionEligibilityInfo } from './admissionMetrics.js';
import {resolveCatalogMinimum} from './minimumCatalog.js';

const text = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const key = value => text(value).replace(/\s+/g, '').toLowerCase();
export const comparisonTrackKey = value => {
  const name=text(value);
  const wrapped=name.match(/^(?:학생부)?(?:교과|종합)\s*\((.+)\)$/);
  return key(wrapped?wrapped[1]:name.replace(/^(?:학생부)?(?:교과|종합)\s*[·:：]\s*/, ''));
};
export function comparisonType(value) {
  const label = key(value);
  return /종합|학종/.test(label) ? '종합' : /교과/.test(label) ? '교과' : /논술/.test(label) ? '논술' : /실기|실적|특기/.test(label) ? '실기' : label;
}
export function comparisonUnitMatches(source, target) {
  const unit = key(source);
  return Boolean(unit && key(target)) && (unit === key(target) || ['전체', '전체모집단위', '전모집단위', '전계열'].includes(unit));
}
export function comparisonTracks(row = []) {
  return [['교과', 7], ['종합', 8]].flatMap(([admissionType, index]) =>
    (row[index] || []).map((item, position) => ({ admissionType, item, id: `${admissionType}:${position}` })));
}
export function sampleCount(value) {
  const count = finiteNumber(value);
  return count != null && Number.isInteger(count) && count >= 0 ? count : null;
}
export function schoolEvidence(rows = []) {
  const years = [...new Set(rows.map(row => text(row.admissionYear)).filter(year => /^20\d{2}$/.test(year)))].sort();
  return {
    total: rows.length,
    accepted: rows.filter(row => {
      const result = text(`${row.finalResult || ''} ${row.finalResultDetail || ''}`);
      return /합격/.test(result) && !/불합격|탈락/.test(result);
    }).length,
    years: years.join('·') || '연도 미제공',
    yearUnknown: rows.filter(row => !/^20\d{2}$/.test(text(row.admissionYear))).length,
  };
}

// These years describe schema v1's fixed parser, not a guessed year from upload time.
export const COMPARISON_YEARS = { result: 2026, recruitment: 2027, minimum: 2027, course: 2027 };
export function minimumScopeRank(source, department, field) {
  if(key(source) && key(source)===key(department))return 3;
  const units=text(source).split(/[,;\n]/).map(key).filter(Boolean);
  if(units.length>1 && units.includes(key(department)) && !/제외|한정|일부/.test(text(source)))return 2;
  if(['인문','자연','예체능','인문계열','자연계열','예체능계열'].includes(key(source)) && key(source).replace(/계열$/,'')===key(field).replace(/계열$/,''))return 1;
  return comparisonUnitMatches(source,department)?0:-1;
}
// Match minimum requirements independently of NAVI cutoff availability.
export function resolveMinimumLink({target, data = {}, student, identity, evaluateMinimum, ambiguousType = false}) {
  // NAVI cutoff tracks describe 2026 results. Match only the 2026 minimum
  // rows and the 2026 unit; identical names in later years are not evidence.
  if(Number(target?.trackYear) === COMPARISON_YEARS.result) {
    const source=(data.historicalMinimums2026||[]).filter(row=>Number(row?.[12])===2026);
    const campus=identity(target.university,target.region);
    const candidates=source.filter(row=>identity(row[1],row[0])===campus
      && comparisonType(row[2])===comparisonType(target.admissionType)
      && comparisonTrackKey(row[3])===comparisonTrackKey(target.track))
      .map(row=>({row,rank:minimumScopeRank(row[5],target.historicalDepartment||target.department,target.field)}))
      .filter(item=>item.rank>=0);
    const best=Math.max(-1,...candidates.map(item=>item.rank));
    const matches=candidates.filter(item=>item.rank===best);
    if(matches.length===1)return {minimum:matches[0].row,evaluation:evaluateMinimum(matches[0].row)};
    if(matches.length>1)return {minimum:null,evaluation:{status:'manual',year:2026,reason:'2026 전형의 최저 원문이 같은 범위에 복수로 있습니다.'}};
    const loaded=source.length>0||data.historicalMinimumsLoaded===true;
    return {minimum:null,evaluation:{status:loaded?'not-listed':'source-pending',year:2026,
      reason:loaded?'NAVI 2026 수능최저 시트에 이 전형의 행이 없습니다. 최저 없음 여부는 모집요강을 확인하세요.':'저장된 NAVI 자료에 2026 최저가 없습니다. 원본을 다시 분석·저장하세요.'}};
  }
  const catalog = resolveCatalogMinimum({target,student,identity});
  if (catalog && catalog.evaluation.status!=='unlinked') return catalog;
  const normalize = value => Array.isArray(value)
    ? {raw:value, university:value[1], region:value[0], type:value[2], track:value[3], department:value[5], year:2027, stored:false}
    : {raw:value, university:value.university, region:value.region, type:value.admissionType || value.track, track:value.track, department:value.department, year:Number(value.admissionYear) || null, stored:true};
  const all = [...(student?.minimumRows || []), ...(data.minimums || [])].map(normalize);
  const campus = identity(target.university, target.region);
  const byCampus = all.filter(x => identity(x.university, x.region) === campus);
  const byTrack = byCampus.filter(x => comparisonTrackKey(x.track) && comparisonTrackKey(x.track) === comparisonTrackKey(target.track)
    && (['교과','종합','논술','실기'].includes(comparisonType(x.type)) ? comparisonType(x.type) === comparisonType(target.admissionType) : !ambiguousType));
  const byScope = byTrack.filter(x => minimumScopeRank(x.department, target.department, target.field) >= 0);
  const current = byScope.filter(x => x.stored && (!x.year || x.year === Number(student?.admissionYear)));
  const newest = byScope.filter(x => Number(x.year) === 2028);
  const yearPool = newest.length ? newest : current.length ? current : byScope;
  const availableYears = [...new Set(yearPool.map(x => Number(x.year)).filter(Boolean))]
    .sort((a,b)=>Math.abs(a-Number(student?.admissionYear||a))-Math.abs(b-Number(student?.admissionYear||b))||b-a);
  const preferredYear = newest.length ? 2028 : current.length ? Number(student?.admissionYear) : availableYears[0];
  const pool = preferredYear ? yearPool.filter(x => !x.year || Number(x.year)===preferredYear) : yearPool;
  const rank = x => minimumScopeRank(x.department, target.department, target.field);
  const best = Math.max(-1, ...pool.map(rank));
  const matches = pool.filter(x => rank(x) === best);
  if (matches.length === 1) return {minimum:matches[0].raw, evaluation:evaluateMinimum(matches[0].raw)};
  if (matches.length > 1) return {minimum:null, evaluation:{status:'manual', linkCode:'ambiguous', year:matches[0].year,
    ruleText:matches.map(x => text(Array.isArray(x.raw) ? x.raw[8] : x.raw.requiredSum)).join(' / '),
    reason:`같은 적용 범위의 최저 자료가 ${matches.length}개입니다. 중복 또는 별도 조건인지 확인하세요.`}};
  if(catalog)return catalog;
  const [linkCode, reason] = !all.length ? ['no_data','등록된 최저 자료 없음 · 대학 지원 진단 또는 NAVI 자료를 확인하세요.']
    : !byCampus.length ? ['campus','대학·캠퍼스 불일치 · 대학명과 지역 표기를 확인하세요.']
    : !byTrack.length ? ['track',`전형 불일치 · ${target.admissionType || ''} ${target.track || ''}의 전형명·유형을 확인하세요.`]
    : !byScope.length ? ['scope',`모집단위 미연결 · ${target.department}의 적용 범위·제외 조건을 확인하세요.`]
    : ['year',`판정 가능한 최저 규칙 없음 · 학생 ${student?.admissionYear || '미확인'} / 자료 ${[...new Set(byScope.map(x => x.year || '미확인'))].join('·')}`];
  return {minimum:null, evaluation:{status:'unlinked', linkCode, reason, year:null, source:'최저 자료 연결 점검'}};
}
export function buildComparisonRows({ compareItems = [], data = {}, caseRows = [], convertedGrade, cutoffBasis = '70', conversionGroup = '전교과', identity, evaluateMinimum, minimumContext }) {
  const result = [];
  for (const { stored, entry } of compareItems) {
    const row = entry?.row;
    const tracks = row ? comparisonTracks(row) : [];
    if (!tracks.length) {
      result.push({ stored, id: JSON.stringify([stored.university, stored.region, stored.department, 'missing']), missing: true,
        reason: row ? '교과·종합 전형 자료 없음 · 논술/실기 등은 원자료를 확인하세요.' : '대학·캠퍼스·모집단위의 단일 일치 자료 없음 · 표기 또는 자료 버전을 확인하세요.' });
      continue;
    }
    for (const { admissionType, item, id } of tracks) {
      const university = row[3], region = row[1], department = row[5], track = text(item[0]);
      const campus = identity(university, region);
      const sameCampus = (name, area) => identity(name, area) === campus;
      const sameTrack = value => Boolean(comparisonTrackKey(track)) && comparisonTrackKey(value) === comparisonTrackKey(track);
      const sameType = value => comparisonType(value) === admissionType;
      const rules = (data.courseRules || []).filter(value => sameCampus(value[1], value[0]) && sameType(value[2]) && sameTrack(value[3]) && comparisonUnitMatches(value[5], department));
      const {minimum, evaluation:minimumEvaluation} = resolveMinimumLink({target:{university,region,department,field:row[6],historicalDepartment:row[4],trackYear:2026,admissionType,track},data,student:minimumContext,identity,evaluateMinimum,ambiguousType:tracks.filter(x=>sameTrack(x.item[0])).length>1});
      const minimumStatus = minimumEvaluation.status;
      const stats = (data.caseStats || []).filter(value => sameCampus(value[5] || value[1], value[0]) && sameType(value[2]) && sameTrack(value[6] || value[3]) && key(value[4]) === key(row[6]) && key(row[6]));
      const groupIndex = { 전교과: 8, 국수영사과: 9, 국수영사: 10, 국수영과: 11 }[conversionGroup] ?? 8;
      const naviCount = stats.length === 1 ? sampleCount(stats[0]?.[groupIndex]?.[0]) : null;
      const schoolRows = caseRows.filter(value => sameCampus(value.university || value.universityNormalized, value.region) && key(value.department) === key(department) && sameType(value.admissionType) && sameTrack(value.detailType || value.admissionType));
      const cut50 = validGrade(item[1]), cut70 = validGrade(item[2]);
      // 7번 요청: 내신컷 위치(support)·최저충족(minimumStatus)과 분리된 세 번째 판정입니다.
      // 학교 자체 진단 자료(minimum이 배열이 아닌 객체 형태)에만 비고 원문이 있어 그 경우에만
      // 판단하고, NAVI 참고자료뿐이거나 자료가 없으면 "확인 불가"로 정직하게 남깁니다.
      const eligibility = minimum && !Array.isArray(minimum)
        ? admissionEligibilityInfo(minimum.note)
        : { status: 'unavailable', label: '학교 자료 미연결 · 원문에서 직접 확인' };
      result.push({
        id: JSON.stringify([university, region, department, id]), stored, university, region, department, previousDepartment: row[4], admissionType, track,
        planItem: { university, region, department, field: row[6], admissionType, track, trackYear:2026, source: 'NAVI 전형 비교' },
        cut50, cut70, support: supportBandValue(convertedGrade, cutoffBasis === '50' ? cut50 : cut70), eligibility,
        course: rules.length === 1 ? [rules[0][6], rules[0][7], rules[0][8], rules[0][17]].map(text).filter(Boolean).join(' · ') || '반영 내용 미제공' : rules.length ? '복수 조건 연결 · 원문 확인' : '교과 반영 자료 미연결',
        minimumStatus, minimumEvaluation, minimumText: minimum ? text(Array.isArray(minimum)?minimum[8]:(minimum.ruleText || minimum.requiredSum)) || '조건 원문 미제공' : minimumEvaluation.ruleText || minimumEvaluation.reason,
        naviCount, naviReason: stats.length > 1 ? '동일 범위 통계 복수 · 임의 합산 안 함' : stats.length === 1 ? '표본 수 미제공' : '대학·캠퍼스·전형·계열 일치 자료 없음',
        school: schoolEvidence(schoolRows),
        recommendationProgress: entry?.recommendationProgress,
      });
    }
  }
  return result;
}
