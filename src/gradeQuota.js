// 석차·석차등급 산출(교과교사 성적 산출 화면 공용). 순수 함수로 분리해 node 테스트로 검증합니다.
// 산출 인원(분모)은 넘겨받은 rows 중 isEligible을 통과한 학생뿐입니다. 성적 산출 화면은 업로드한
// 지필·수행 파일에 실제로 있는 학생만 rows로 만들기 때문에, 선택과목은 그 과목 수강자만 세어집니다.
export const GRADE_CUMULATIVE = {
  5: [10, 34, 66, 90, 100],
  9: [4, 11, 23, 40, 60, 77, 89, 96, 100],
};
export function gradeQuotaCumulative(total, system) {
  const thresholds = GRADE_CUMULATIVE[Number(system)] || GRADE_CUMULATIVE[5];
  return thresholds.map(percent => Math.round((Number(total) || 0) * percent / 100));
}
export function assignQuotaGrades(rows, system) {
  const quotas = gradeQuotaCumulative(rows.length, system);
  rows.forEach(row => {
    const groupEnd = Number(row.rank || 0) + Math.max(1, Number(row.tieCount || 1)) - 1;
    const index = quotas.findIndex(limit => groupEnd <= limit);
    row.grade = index < 0 ? quotas.length : index + 1;
    row.percentile = rows.length ? (Number(row.midRank || row.rank || 0) / rows.length) * 100 : null;
  });
  return quotas;
}
export function numberOrLow(value) { return Number.isFinite(Number(value)) ? Number(value) : -Infinity; }
export function compareVectors(a, b) {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const av = numberOrLow(a[index]);
    const bv = numberOrLow(b[index]);
    if (Math.abs(av - bv) > 1e-9) return bv - av;
  }
  return 0;
}
export function vectorKey(vector) { return vector.map(value => Number.isFinite(Number(value)) ? Number(value).toFixed(4) : "-").join("|"); }
// 산출 대상만 골라 정렬 → 석차(동점은 같은 석차) → 동석차 수·중간석차 → 누적 비율 등급. 대상 행 배열을 돌려줍니다.
export function rankAndGrade(rows, { vectorOf, isEligible, system }) {
  const eligible = rows.filter(isEligible).sort((a, b) => compareVectors(vectorOf(a), vectorOf(b)) || String(a.sid).localeCompare(String(b.sid)));
  let priorKey = null;
  let rank = 0;
  eligible.forEach((row, index) => {
    const key = vectorKey(vectorOf(row));
    if (key !== priorKey) rank = index + 1;
    row.rank = rank;
    priorKey = key;
  });
  const counts = eligible.reduce((map, row) => map.set(vectorKey(vectorOf(row)), (map.get(vectorKey(vectorOf(row))) || 0) + 1), new Map());
  eligible.forEach(row => {
    row.tieCount = counts.get(vectorKey(vectorOf(row))) || 1;
    row.midRank = row.rank + (row.tieCount - 1) / 2;
  });
  assignQuotaGrades(eligible, system);
  return eligible;
}
