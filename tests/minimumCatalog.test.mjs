import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCatalogMinimum, normalizeMinimumCatalog, validateMinimumRow } from '../src/minimumCatalog.js';
import fs from 'node:fs';

const base = {
  schema: 'KD_MINIMUM_V1', id: 'T-1', sourceId: 'T', admissionYear: 2028, season: '수시',
  university: '테스트대', campus: '', admissionType: '학생부교과', track: '지역균형',
  trackAliases: '', scopeType: '전체', department: '전체', excluded: '', reviewStatus: '계산가능',
  ruleType: '합', subjects: '국|수|영|사/과', count: 2, threshold: 6, mandatory: '',
  englishMax: null, historyMax: null, inquiryMode: '통합개별', rounding: '없음', englishConversion: '없음',
  ruleText: '', note: '', reviewReason: '', source: 'test.pdf', page: '1',
};
const row = patch => ({ ...base, ...patch });
const student = grades => ({ admissionYear: 2028, latestMockGrades: grades });
const g = { 국어: 2, 수학: 3, 영어: 2, 통합사회: 2, 통합과학: 3, 한국사: 2 };

test('합 기준: 가장 좋은 조합으로 충족', () => {
  const r = evaluateCatalogMinimum(row({}), student(g));
  assert.equal(r.status, 'satisfied');
  assert.equal(r.studentSum, 4);
});

test('합 기준: 3합5 국수영과는 미충족', () => {
  const r = evaluateCatalogMinimum(row({ subjects: '국|수|영|과', count: 3, threshold: 5 }), student(g));
  assert.equal(r.status, 'unsatisfied');
  assert.equal(r.studentSum, 7);
});

test('각 기준: 모든 선택 영역이 기준 이내여야 함', () => {
  assert.equal(evaluateCatalogMinimum(row({ ruleType: '각', count: 2, threshold: 1 }), student(g)).status, 'unsatisfied');
  assert.equal(evaluateCatalogMinimum(row({ ruleType: '각', count: 2, threshold: 2 }), student(g)).status, 'satisfied');
});

test('사/과 택1은 더 좋은 탐구를 고름', () => {
  const r = evaluateCatalogMinimum(row({ subjects: '국|사/과', count: 2, threshold: 4 }), student(g));
  assert.equal(r.status, 'satisfied');
  assert.deepEqual(r.selectedSubjects.map(x => x.code), ['국', '사']);
});

test('필수영역(수학)이 조합에 반드시 포함됨', () => {
  const r = evaluateCatalogMinimum(row({ mandatory: '수', threshold: 4 }), student(g));
  assert.equal(r.status, 'unsatisfied');
  assert.ok(r.selectedSubjects.some(x => x.code === '수'));
});

test('영어·한국사 별도 상한', () => {
  assert.equal(evaluateCatalogMinimum(row({ englishMax: 1 }), student(g)).status, 'unsatisfied');
  assert.equal(evaluateCatalogMinimum(row({ englishMax: 2 }), student(g)).status, 'satisfied');
  assert.equal(evaluateCatalogMinimum(row({ historyMax: 1 }), student(g)).status, 'unsatisfied');
  assert.equal(evaluateCatalogMinimum(row({ historyMax: 4 }), student(g)).status, 'satisfied');
});

test('영어 2등급까지 1등급 환산', () => {
  const r = evaluateCatalogMinimum(row({ subjects: '국|영', count: 2, threshold: 3, englishConversion: '2등급까지1' }), student(g));
  assert.equal(r.status, 'satisfied');
  assert.equal(r.studentSum, 3);
});

test('과목 상향(subjectBoosts) 반영', () => {
  const r = evaluateCatalogMinimum(row({ subjects: '국|수', count: 2, threshold: 4, subjectBoosts: { 국: 1, 수: 1 } }), student(g));
  assert.equal(r.status, 'satisfied');
  assert.equal(r.studentSum, 3);
});

test('최저 없음 행은 no-minimum', () => {
  const r = evaluateCatalogMinimum(row({ ruleType: '없음', subjects: '', count: null, threshold: null, inquiryMode: '해당없음' }), student(g));
  assert.equal(r.status, 'no-minimum');
});

test('검토필요 행은 계산하지 않고 manual', () => {
  const r = evaluateCatalogMinimum(row({ reviewStatus: '검토필요', reviewReason: '원문 확인' }), student(g));
  assert.equal(r.status, 'manual');
});

test('미입력 성적: 결과가 갈리면 unavailable, 이미 확정되면 그대로 판정', () => {
  const partial = { 국어: 2, 영어: 3 };
  assert.equal(evaluateCatalogMinimum(row({ subjects: '국|수', count: 2, threshold: 5 }), student(partial)).status, 'unavailable');
  assert.equal(evaluateCatalogMinimum(row({ subjects: '국|수', count: 2, threshold: 2 }), student(partial)).status, 'unsatisfied');
  assert.equal(evaluateCatalogMinimum(row({ subjects: '국|영|수', count: 2, threshold: 5 }), student(partial)).status, 'satisfied');
});

test('학년도 불일치는 사유에 표시', () => {
  const r = evaluateCatalogMinimum(row({}), { ...student(g), admissionYear: 2029 });
  assert.equal(r.yearMismatch, true);
  assert.match(r.reason, /자료 2028/);
});

test('시드 카탈로그: 계산가능 행은 모두 검증 통과', () => {
  const seed = JSON.parse(fs.readFileSync(new URL('../src/minimumCatalogSeed.json', import.meta.url), 'utf8'));
  const rows = normalizeMinimumCatalog(seed);
  const ready = rows.filter(r => r.reviewStatus === '계산가능');
  assert.ok(ready.length > 100);
  const bad = ready.filter(r => validateMinimumRow(r).length);
  assert.equal(bad.length, 0, bad.slice(0, 3).map(r => `${r.university} ${r.track}: ${validateMinimumRow(r)}`).join('\n'));
  for (const r of ready) {
    const ev = evaluateCatalogMinimum(r, student(g));
    assert.ok(['satisfied', 'unsatisfied', 'no-minimum', 'unavailable', 'manual'].includes(ev.status));
  }
});
