import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCalendarRows, normalizeCalendarDate, semesterStartsFromEvents } from '../src/academicCalendarImport.js';

test('날짜 형식', () => {
  assert.equal(normalizeCalendarDate('2026-03-03'), '2026-03-03');
  assert.equal(normalizeCalendarDate('2026.4.21'), '2026-04-21');
  assert.equal(normalizeCalendarDate('2026년 10월 12일'), '2026-10-12');
  assert.equal(normalizeCalendarDate(46084), '2026-03-03');
  assert.equal(normalizeCalendarDate('2026-02-30'), '');
});
test('머리글 찾기·종료일·오류 행', () => {
  const { events, errors } = parseCalendarRows([['2026학년도 학사일정'], ['날짜', '종료일', '일정', '구분'], ['2026-04-21', '2026-04-23', '1학기 1차 정기시험', '시험'], ['2026-03-03', '', '입학식/개학식', '행사'], ['', '', '', ''], ['3월', '', '잘못된 행', '']]);
  assert.equal(events.length, 2); assert.equal(events[0].date, '2026-03-03'); assert.equal(events[1].endDate, '2026-04-23'); assert.equal(events[1].kind, '시험');
  assert.equal(errors.length, 1);
});
test('개학일 추정', () => {
  assert.deepEqual(semesterStartsFromEvents([{ date: '2026-03-03', label: '입학식/개학식' }, { date: '2026-08-13', label: '2학기 개학식' }]), { sem1Start: '2026-03-03', sem2Start: '2026-08-13' });
});
test('머리글 없으면 오류', () => { assert.equal(parseCalendarRows([['a', 'b']]).errors.length, 1); });
