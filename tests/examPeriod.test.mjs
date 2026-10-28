import test from 'node:test';
import assert from 'node:assert/strict';
import { examPeriodFromCalendar } from '../src/examPeriod.js';

const now = new Date(2026, 9, 11);
const cal = events => ({ events });

test('정기시험 7일 전부터 강조', () => {
  assert.equal(examPeriodFromCalendar(cal([{ date: '2026-10-18', label: '2학기 중간고사' }]), now)?.dLabel, 'D-7');
  assert.equal(examPeriodFromCalendar(cal([{ date: '2026-10-19', label: '2학기 중간고사' }]), now), null);
});
test('시험 후 6일까지만 성적 처리 기간', () => {
  const r = examPeriodFromCalendar(cal([{ date: '2026-10-05', label: '1차 지필' }]), now);
  assert.equal(r.phase, 'after'); assert.equal(r.dLabel, 'D+6');
  assert.equal(examPeriodFromCalendar(cal([{ date: '2026-10-04', label: '1차 지필' }]), now), null);
});
test('시험이 아닌 일정은 무시, 가장 가까운 시험 선택', () => {
  assert.equal(examPeriodFromCalendar(cal([{ date: '2026-10-11', label: '수능' }]), now), null);
  const r = examPeriodFromCalendar(cal([{ date: '2026-10-06', label: '중간고사 1일차' }, { date: '2026-10-11', label: '기말고사' }]), now);
  assert.equal(r.label, '기말고사'); assert.equal(r.phase, 'today');
});
test('여러 날 시험: 시험 중엔 D-day, 끝난 뒤엔 마지막 날 기준', () => {
  assert.equal(examPeriodFromCalendar(cal([{ date: '2026-10-10', endDate: '2026-10-13', label: '1차 정기시험' }]), now).phase, 'today');
  assert.equal(examPeriodFromCalendar(cal([{ date: '2026-10-01', endDate: '2026-10-05', label: '1차 정기시험' }]), now).dLabel, 'D+6');
});

test('시험 뒤 일정(성적 확인·이의신청·학기말)은 시험으로 보지 않는다', () => {
  const now = new Date(2026, 9, 28);
  const events = [
    { date: '2026-10-13', endDate: '2026-10-16', label: '2학기 중간고사' },
    { date: '2026-10-26', label: '중간고사 성적 확인' },
    { date: '2026-10-27', label: '지필평가 이의신청' },
    { date: '2026-10-28', label: '학기말 업무 협의' },
  ];
  assert.equal(examPeriodFromCalendar({ events }, now), null);
});

test('시험 날마다 따로 적은 일정은 한 시험으로 묶는다', () => {
  const now = new Date(2026, 9, 21);
  const events = ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].map((date, i) => ({ date, label: `2학기 중간고사 ${i + 1}일차` }));
  const exam = examPeriodFromCalendar({ events }, now);
  assert.equal(exam?.dLabel, 'D+5');
  assert.equal(exam?.label, '2학기 중간고사');
  assert.equal(exam?.endDate, '2026-10-16');
});
