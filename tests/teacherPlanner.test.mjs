import test from "node:test";
import assert from "node:assert/strict";
import { plannerAlerts, upcomingItems, monthCells, schoolEventsByDate, normalizeItems, dLabel, plannerKey } from "../src/teacherPlanner.js";

const now = new Date(2026, 9, 28, 10, 0); // 2026-10-28

test("미리 알림 날짜가 된 일정과 지난 미완료 일정만 알린다", () => {
  const items = [
    { id: "a", date: "2026-10-28", title: "오늘 회의", remind: 0 },
    { id: "b", date: "2026-10-29", title: "내일 제출", remind: 1 },
    { id: "c", date: "2026-10-31", title: "3일 뒤", remind: 1 },
    { id: "d", date: "2026-10-31", title: "3일 뒤(3일 전 알림)", remind: 3 },
    { id: "e", date: "2026-10-25", title: "지난 일", remind: 0 },
    { id: "f", date: "2026-10-25", title: "지난 일(완료)", remind: 0, done: true },
    { id: "g", date: "2026-10-28", title: "알림 없음", remind: -1 },
    { id: "h", date: "2026-09-01", title: "오래 전", remind: 0 },
  ];
  const ids = plannerAlerts(items, now).map(item => item.id);
  assert.deepEqual(ids, ["e", "a", "b", "d"]);
  assert.equal(dLabel(0), "오늘");
  assert.equal(dLabel(1), "내일");
  assert.equal(dLabel(3), "D-3");
  assert.equal(dLabel(-3), "3일 지남");
});

test("다가오는 일정과 정리", () => {
  const items = normalizeItems([{ date: "2026-11-02", title: "B", time: "14:00" }, { date: "2026-11-02", title: "A", time: "09:00" }, { date: "bad", title: "x" }, { date: "2026-10-01", title: "past" }]);
  assert.deepEqual(items.map(i => i.title), ["past", "A", "B"]);
  assert.deepEqual(upcomingItems(items, now).map(i => i.title), ["A", "B"]);
  assert.equal(plannerKey(" t1 "), "kd_teacher_planner_v1:t1");
});

test("달력 칸과 여러 날 학사일정", () => {
  const cells = monthCells(2026, 9); // 2026년 10월: 1일이 목요일
  assert.equal(cells.length, 42);
  assert.equal(cells[0].key, "2026-09-27");
  assert.equal(cells[4].key, "2026-10-01");
  const map = schoolEventsByDate({ events: [{ date: "2026-10-30", endDate: "2026-11-02", label: "2학기 중간고사" }, { date: "2026-10-09", label: "한글날" }] });
  assert.deepEqual(Object.keys(map).sort(), ["2026-10-09", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
});

import { expandOccurrences, popupItems, todayItems, toggleDoneIn, assignedFor, normalizeItem, googleCalendarUrl, plannerIcs } from "../src/teacherPlanner.js";

test("반복 일정: 매주·매월 펼치기, 날짜별 끝냄", () => {
  const items = [{ id: "w", date: "2026-10-26", title: "주간회의", repeat: "weekly" }, { id: "m", date: "2026-01-31", title: "월말", repeat: "monthly" }];
  const occ = expandOccurrences(items, "2026-10-20", "2026-11-30");
  assert.deepEqual(occ.filter(o => o.id === "w").map(o => o.date), ["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"]);
  assert.deepEqual(occ.filter(o => o.id === "m").map(o => o.date), ["2026-10-31"]); // 11월 31일은 없음
  const toggled = toggleDoneIn(items.map(normalizeItem), occ.find(o => o.date === "2026-11-02"));
  const after = expandOccurrences(toggled, "2026-10-20", "2026-11-10").filter(o => o.id === "w");
  assert.deepEqual(after.map(o => o.done), [false, true, false]);
});

test("팝업은 마감 1~2일 전, 오늘 할 일은 오늘+지난 미완료", () => {
  const items = [
    { id: "a", date: "2026-10-30", title: "2일 뒤" }, { id: "b", date: "2026-10-29", title: "1일 뒤" }, { id: "c", date: "2026-10-31", title: "3일 뒤" },
    { id: "d", date: "2026-10-30", title: "알림 없음", remind: -1 }, { id: "e", date: "2026-10-28", title: "오늘" }, { id: "f", date: "2026-10-27", title: "어제(미완료)" },
    { id: "g", date: "2026-10-27", title: "어제(끝냄)", done: true },
  ];
  assert.deepEqual(popupItems(items, now).map(i => i.id).sort(), ["a", "b"]);
  assert.deepEqual(todayItems(items, now).map(i => i.id), ["f", "e"]);
});

test("받은 일정은 받는 사람에게만, 끝냄은 사람마다", () => {
  const assigns = [{ id: "s1", date: "2026-11-01", title: "협의회 자료", to: ["teacher.a", "teacher.b"], doneBy: { "teacher.a": "x" }, from: { owner: "admin.1", name: "관리자" } }];
  assert.equal(assignedFor("teacher.a", assigns)[0].done, true);
  assert.equal(assignedFor("teacher.b", assigns)[0].done, false);
  assert.equal(assignedFor("teacher.c", assigns).length, 0);
});

test("링크 정리와 외부 캘린더", () => {
  const item = normalizeItem({ id: "z", date: "2026-11-02", time: "15:00", title: "회의", links: ["drive.google.com/x", "javascript:alert(1)", { url: "https://a.kr", label: "공문" }] });
  assert.deepEqual(item.links.map(l => l.url), ["https://drive.google.com/x", "https://a.kr"]);
  assert.match(googleCalendarUrl(item), /dates=20261102T150000%2F20261102T160000/);
  assert.match(plannerIcs([item]), /DTSTART;TZID=Asia\/Seoul:20261102T150000/);
});

test("반복 일정의 지난 날짜는 '지남'으로 쌓지 않는다", () => {
  const items = [{ id: "w", date: "2026-10-15", title: "주간회의(목)", repeat: "weekly", remind: 0 }];
  assert.deepEqual(plannerAlerts(items, now).map(i => i.date), []);
  assert.deepEqual(todayItems(items, now).map(i => i.date), []);
  assert.deepEqual(todayItems(items, new Date(2026, 9, 22)).map(i => i.date), ["2026-10-22"]);
});

import { parseQuickTodo } from "../src/teacherPlanner.js";
test("빠른 입력에서 날짜·시간·제목 찾기", () => {
  assert.deepEqual(parseQuickTodo("11/5 협의회", now), { date: "2026-11-05", time: "", title: "협의회" });
  assert.deepEqual(parseQuickTodo("11월 5일(수) 오후 3시 30분 학부모 상담", now), { date: "2026-11-05", time: "15:30", title: "학부모 상담" });
  assert.deepEqual(parseQuickTodo("내일 15:00 출결 확인", now), { date: "2026-10-29", time: "15:00", title: "출결 확인" });
  assert.equal(parseQuickTodo("1/5 방학식", now).date, "2027-01-05");
  assert.equal(parseQuickTodo("김선아", now), null);
  assert.equal(parseQuickTodo("11/5", now), null);
});
