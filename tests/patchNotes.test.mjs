import test from "node:test";
import assert from "node:assert/strict";
import { activePatchNotes } from "../src/patchNotes.js";

const notes = [
  { id: "b", date: "2026-10-27", title: "B", items: [{ audience: "staff", text: "선생님용" }, { audience: "all", text: "모두" }] },
  { id: "a", date: "2026-10-20", title: "A", items: [{ audience: "all", text: "예전" }] },
  { id: "c", date: "2026-10-27", title: "C", items: [{ audience: "staff", text: "선생님만" }] },
];

test("배포일부터 2일 동안만, 대상에 맞는 항목만 보여 준다", () => {
  const at = new Date("2026-10-28T15:00:00");
  assert.deepEqual(activePatchNotes({ notes, now: at, audience: "staff" }).map(n => n.id), ["b", "c"]);
  const student = activePatchNotes({ notes, now: at, audience: "student" });
  assert.deepEqual(student.map(n => n.id), ["b"]);
  assert.equal(student[0].items.length, 1);
  assert.equal(activePatchNotes({ notes, now: new Date("2026-10-29T00:00:01"), audience: "staff" }).length, 0);
});

test("확인한 안내는 다시 보여 주지 않는다", () => {
  assert.deepEqual(activePatchNotes({ notes, now: new Date("2026-10-27T09:00:00"), audience: "staff", seen: ["b"] }).map(n => n.id), ["c"]);
});
