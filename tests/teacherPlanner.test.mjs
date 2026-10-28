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
