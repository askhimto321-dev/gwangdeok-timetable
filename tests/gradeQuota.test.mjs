import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeQuotaCumulative, rankAndGrade } from '../src/gradeQuota.js';

const makeRows = scores => scores.map((score, index) => ({ sid: `2${String(index + 1).padStart(4, '0')}`, score, complete: true, excluded: false, vector: [score] }));
const run = (rows, system = 5) => rankAndGrade(rows, { vectorOf: row => row.vector, isEligible: row => row.complete && !row.excluded, system });
const countBy = rows => rows.reduce((map, row) => ({ ...map, [row.grade]: (map[row.grade] || 0) + 1 }), {});

test('선택과목: 학년 전체(240명)가 아니라 수강자 37명으로 5등급 누적 인원을 계산한다', () => {
  // 성적 산출 화면은 업로드한 파일에 있는 학생만 행으로 만듭니다 → 선택과목은 수강자 37명만 들어옵니다.
  const rows = makeRows(Array.from({ length: 37 }, (_, i) => 100 - i));
  const graded = run(rows);
  assert.equal(graded.length, 37);
  assert.deepEqual(gradeQuotaCumulative(37, 5), [4, 13, 24, 33, 37]);
  assert.deepEqual(countBy(graded), { 1: 4, 2: 9, 3: 11, 4: 9, 5: 4 });
  // 학년 전체 인원으로 잘못 계산했다면 1등급이 24명이 됐을 것(240 × 10%).
  assert.notDeepEqual(gradeQuotaCumulative(240, 5).slice(0, 1), [4]);
});

test('자퇴·전출과 성적 미완성 학생은 수강자 수(분모)에서 빠진다', () => {
  const rows = makeRows(Array.from({ length: 22 }, (_, i) => 90 - i));
  rows[3].excluded = true;
  rows[5].complete = false;
  const graded = run(rows);
  assert.equal(graded.length, 20);
  assert.deepEqual(gradeQuotaCumulative(20, 5), [2, 7, 13, 18, 20]);
  assert.deepEqual(countBy(graded), { 1: 2, 2: 5, 3: 6, 4: 5, 5: 2 });
  assert.ok(!graded.includes(rows[3]) && !graded.includes(rows[5]));
});

test('등급 경계에 걸친 동점자는 나누지 않고 함께 다음 등급으로 간다', () => {
  // 20명 → 1등급 누적 2명. 2·3등이 동점이면 둘 다 2등급.
  const scores = [99, 95, 95, ...Array.from({ length: 17 }, (_, i) => 80 - i)];
  const graded = run(makeRows(scores));
  const tied = graded.filter(row => row.score === 95);
  assert.deepEqual(tied.map(row => [row.rank, row.tieCount, row.midRank, row.grade]), [[2, 2, 2.5, 2], [2, 2, 2.5, 2]]);
  assert.equal(graded.filter(row => row.grade === 1).length, 1);
});

test('9등급제 누적 비율(4·11·23·40·60·77·89·96·100%)', () => {
  assert.deepEqual(gradeQuotaCumulative(100, 9), [4, 11, 23, 40, 60, 77, 89, 96, 100]);
  const graded = run(makeRows(Array.from({ length: 100 }, (_, i) => 100 - i)), 9);
  assert.deepEqual(countBy(graded), { 1: 4, 2: 7, 3: 12, 4: 17, 5: 20, 6: 17, 7: 12, 8: 7, 9: 4 });
});
