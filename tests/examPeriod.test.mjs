import test from 'node:test';
import assert from 'node:assert/strict';
import { examPeriodFromCalendar } from '../src/examPeriod.js';

const now = new Date(2026, 9, 11);
const cal = events => ({ events });

test('정기시험 7일 전부터 강조', () => {
  assert.equal(examPeriodFromCalendar(cal([{ date: '2026-10-18', label: '2학기 중간고사' }]), now)?.dLabel, 'D-7');
  assert.equal(examPeriodFromCalendar(cal([{ date: '2026-10-19', label: '2학기 중간고사' }]), now), null);
});
test('시험 후 21일까지 성적 처리 기간', () => {
  const r = examPeriodFromCalendar(cal([{ date: '2026-09-20', label: '1차 지필' }]), now);
  assert.equal(r.phase, 'after'); assert.equal(r.dLabel, 'D+21');
  assert.equal(examPeriodFromCalendar(cal([{ date: '2026-09-19', label: '1차 지필' }]), now), null);
});
test('시험이 아닌 일정은 무시, 가장 가까운 시험 선택', () => {
  assert.equal(examPeriodFromCalendar(cal([{ date: '2026-10-11', label: '수능' }]), now), null);
  const r = examPeriodFromCalendar(cal([{ date: '2026-10-01', label: '중간고사 1일차' }, { date: '2026-10-11', label: '기말고사' }]), now);
  assert.equal(r.label, '기말고사'); assert.equal(r.phase, 'today');
});
test('여러 날 시험: 시험 중엔 D-day, 끝난 뒤엔 마지막 날 기준', () => {
  assert.equal(examPeriodFromCalendar(cal([{ date: '2026-10-10', endDate: '2026-10-13', label: '1차 정기시험' }]), now).phase, 'today');
  assert.equal(examPeriodFromCalendar(cal([{ date: '2026-09-15', endDate: '2026-09-20', label: '1차 정기시험' }]), now).dLabel, 'D+21');
});
