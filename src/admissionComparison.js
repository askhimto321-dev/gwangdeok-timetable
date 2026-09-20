import { finiteNumber, validGrade, supportBandValue } from './admissionMetrics.js';

const text = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const key = value => text(value).replace(/\s+/g, '').toLowerCase();
export const comparisonTrackKey = value => {
  const name=text(value);
  const wrapped=name.match(/^(?:학생부)?(?:교과|종합)\s*\((.+)\)$/);
  return key(wrapped?wrapped[1]:name.replace(/^(?:학생부)?(?:교과|종합)\s*[·:：]\s*/, ''));
};
export function comparisonType(value) {
  const label = key(value);
  return /종합|학종/.test(label) ? '종합' : /교과/.test(label) ? '교과' : label;
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
      const naviMinimums = (data.minimums || []).filter(value => sameCampus(value[1], value[0]) && sameType(value[2]) && sameTrack(value[3]) && minimumScopeRank(value[5], department, row[6])>=0);
      const storedMinimums = (minimumContext?.minimumRows || []).filter(value => {
        const type=comparisonType(value.admissionType || value.track);
        const typeMatches=['교과','종합'].includes(type)?type===admissionType:tracks.filter(x=>sameTrack(x.item[0])).length===1;
        return sameCampus(value.university,value.region) && sameTrack(value.track) && typeMatches && minimumScopeRank(value.department,department,row[6])>=0 && (!value.admissionYear || Number(value.admissionYear)===Number(minimumContext.admissionYear));
      });
      // Student-year diagnosis data has priority. Never silently combine different years.
      const pool=storedMinimums.length?storedMinimums:naviMinimums;
      const rank=value=>minimumScopeRank(Array.isArray(value)?value[5]:value.department,department,row[6]);
      const bestRank=Math.max(-1,...pool.map(rank));
      const minimums=pool.filter(value=>rank(value)===bestRank);
      const minimum = minimums.length === 1 ? minimums[0] : null;
      const minimumEvaluation = minimum ? evaluateMinimum(minimum) : null;
      const minimumStatus = minimumEvaluation?.status || (minimums.length ? 'manual' : 'unlinked');
      const stats = (data.caseStats || []).filter(value => sameCampus(value[5] || value[1], value[0]) && sameType(value[2]) && sameTrack(value[6] || value[3]) && key(value[4]) === key(row[6]) && key(row[6]));
      const groupIndex = { 전교과: 8, 국수영사과: 9, 국수영사: 10, 국수영과: 11 }[conversionGroup] ?? 8;
      const naviCount = stats.length === 1 ? sampleCount(stats[0]?.[groupIndex]?.[0]) : null;
      const schoolRows = caseRows.filter(value => sameCampus(value.university || value.universityNormalized, value.region) && key(value.department) === key(department) && sameType(value.admissionType) && sameTrack(value.detailType || value.admissionType));
      const cut50 = validGrade(item[1]), cut70 = validGrade(item[2]);
      result.push({
        id: JSON.stringify([university, region, department, id]), stored, university, region, department, previousDepartment: row[4], admissionType, track,
        planItem: { university, region, department, field: row[6], admissionType, track, source: 'NAVI 전형 비교' },
        cut50, cut70, support: supportBandValue(convertedGrade, cutoffBasis === '50' ? cut50 : cut70),
        course: rules.length === 1 ? [rules[0][6], rules[0][7], rules[0][8], rules[0][17]].map(text).filter(Boolean).join(' · ') || '반영 내용 미제공' : rules.length ? '복수 조건 연결 · 원문 확인' : '교과 반영 자료 미연결',
        minimumStatus, minimumEvaluation, minimumText: minimum ? text(Array.isArray(minimum)?minimum[8]:minimum.requiredSum) || '조건 원문 미제공' : minimums.length ? '복수 조건 연결 · 원문 확인' : '일치하는 전형·모집단위 자료 없음',
        naviCount, naviReason: stats.length > 1 ? '동일 범위 통계 복수 · 임의 합산 안 함' : stats.length === 1 ? '표본 수 미제공' : '대학·캠퍼스·전형·계열 일치 자료 없음',
        school: schoolEvidence(schoolRows),
        recommendationProgress: entry?.recommendationProgress,
      });
    }
  }
  return result;
}
