import test from "node:test";
import assert from "node:assert/strict";
import { pruneBackups } from "../src/backupPolicy.js";

test("백업 보관: 최근 20개 + 30일간 하루 1개, 그보다 오래된 건 정리", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  const list = [];
  // 오늘 30개(30분 간격) + 지난 40일 하루 2개씩
  for (let i = 0; i < 30; i++) list.push({ id: `t${i}`, at: new Date(now - i * 30 * 60000).toISOString() });
  for (let d = 1; d <= 40; d++) for (const h of [3, 9]) list.push({ id: `d${d}-${h}`, at: new Date(now - d * 86400000 - h * 3600000).toISOString() });
  const { kept, removed } = pruneBackups(list, now);
  assert.ok(kept.some(item => item.id === "t0"));
  // 최근 20개는 모두 남고(그 뒤 것은 날짜별 대표만)
  for (let i = 0; i < 20; i++) assert.ok(kept.some(item => item.id === `t${i}`));
  assert.ok(kept.filter(item => item.id.startsWith("t")).length <= 22);
  // 30일 안 날짜는 하루 1개씩 남음(그 날 가장 늦은 것)
  assert.ok(kept.some(item => item.id === "d5-3"));
  assert.ok(!kept.some(item => item.id === "d5-9"));
  // 30일 넘은 건 정리
  assert.ok(!kept.some(item => item.id === "d35-3"));
  assert.equal(kept.length + removed.length, list.length);
});
