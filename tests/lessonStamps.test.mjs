import test from "node:test";
import assert from "node:assert/strict";
import { booksForAssignment, emptyBook, stampStats, stampScore, totalFor, totalMax, csbStatus, nextMark, parseTargets } from "../src/lessonStamps.js";

const roster = { "20101": { name: "가", class: 1, number: 1 }, "20102": { name: "나", class: 1, number: 2 }, "20201": { name: "다", class: 2, number: 1 } };
const enrollments = { "20101": [{ subject: "기하", group: "A", hostClass: 3 }], "20201": [{ subject: "기하", group: "B", hostClass: 4 }, { subject: "물리학", group: "A" }], "20102": [{ subject: "기하", group: "A", hostClass: 3 }] };

test("담당 과목 → 반·분반별 도장부(명단·출석부에서)", () => {
  assert.deepEqual(parseTargets("A, C"), ["A", "C"]);
  assert.deepEqual(parseTargets("전체"), []);
  const common = booksForAssignment({ kind: "common", subject: "문학", targets: "1" }, { roster, grade: "2", semester: "sem2" });
  assert.equal(common.length, 1);
  assert.deepEqual(common[0].students.map(s => s.sid), ["20101", "20102"]);
  const allCommon = booksForAssignment({ kind: "common", subject: "문학", targets: "전체" }, { roster });
  assert.equal(allCommon.length, 2);
  const elective = booksForAssignment({ kind: "elective", subject: "기하", targets: "A" }, { roster, enrollments, grade: "2", semester: "sem2" });
  assert.equal(elective.length, 1);
  assert.equal(elective[0].target, "A");
  assert.deepEqual(elective[0].students.map(s => s.sid), ["20101", "20102"]);
  assert.equal(booksForAssignment({ kind: "elective", subject: "기하", targets: "" }, { roster, enrollments }).length, 2);
});

test("도장률·점수: 결석은 분모에서 빼고 구간 점수", () => {
  const book = emptyBook();
  for (let i = 1; i <= 10; i++) book.sessions[`s${i}`] = { date: `2026-10-${String(i).padStart(2, "0")}`, period: 1 };
  for (let i = 1; i <= 8; i++) (book.marks[`s${i}`] ||= {})["20101"] = "stamp";
  (book.marks.s9 ||= {})["20101"] = "absent";
  const st = stampStats(book, "20101");
  assert.equal(st.stamps, 8); assert.equal(st.absent, 1); assert.equal(Math.round(st.rate), 89);
  assert.equal(stampScore(book, "20101"), 9);
  assert.equal(stampScore(book, "20102"), 5);
  book.scoring.items.push({ id: "w", name: "오답노트", type: "check", on: 5, off: 0 });
  book.items.w = { "20101": true };
  assert.equal(totalFor(book, "20101"), 14);
  assert.equal(totalMax(book), 15);
});

test("최성보: 결석 허용 1/3 초과·성취율 기준 미만은 보충지도, 근접은 예방지도", () => {
  const book = emptyBook({ hours: 30 });
  for (let i = 1; i <= 11; i++) { book.sessions[`s${i}`] = { date: "2026-10-01", period: i }; (book.marks[`s${i}`] ||= {})["20101"] = "absent"; }
  assert.equal(csbStatus(book, "20101").label, "보충지도 대상");
  book.csb["20102"] = { rate: 45 };
  assert.equal(csbStatus(book, "20102").label, "예방지도 권장");
  book.csb["20102"] = { rate: 35 };
  assert.equal(csbStatus(book, "20102").label, "보충지도 대상");
  book.csb["20102"] = { rate: 35, done: true };
  assert.equal(csbStatus(book, "20102").label, "이수 확인");
  assert.equal(nextMark(""), "stamp"); assert.equal(nextMark("stamp"), "absent"); assert.equal(nextMark("absent"), "");
});

test("교시 자동: 쉬는 시간은 다음 교시, 방과 후는 비움", async () => {
  const { periodAt } = await import("../src/lessonStamps.js");
  const at = (h, m) => new Date(2026, 9, 21, h, m);
  assert.equal(periodAt(at(8, 0)), 1);
  assert.equal(periodAt(at(9, 30)), 1);
  assert.equal(periodAt(at(9, 35)), 2);
  assert.equal(periodAt(at(12, 50)), 5);
  assert.equal(periodAt(at(16, 20)), 7);
  assert.equal(periodAt(at(16, 21)), "");
});

test("차시 미리 만들기 · 도장 시각 기록 · 같은 바꾸기를 두 번 해도 같은 결과", async () => {
  const { applyOp, markOf, markAt, nextSessionFor, stampStats, sessionsAsc } = await import("../src/lessonStamps.js");
  let book = emptyBook();
  const plan = { t: "plan", count: 5, at: "2026-10-01T00:00:00Z", by: "김" };
  book = applyOp(applyOp(book, plan), plan);
  assert.equal(Object.keys(book.sessions).length, 5);
  assert.deepEqual(sessionsAsc(book).map(s => s.no), [1, 2, 3, 4, 5]);
  // 날짜 없는 미리 만든 차시는 도장 찍기 전엔 '한 수업'에 안 들어감
  assert.equal(stampStats(book, "20101").held, 0);
  const mark = { t: "mark", s: "n1", sid: "20101", v: "stamp", at: "2026-10-21T09:12:00Z", by: "김" };
  book = applyOp(applyOp(book, mark), mark);
  assert.equal(markOf(book.marks.n1["20101"]), "stamp");
  assert.equal(markAt(book.marks.n1["20101"]), "2026-10-21T09:12:00Z");
  assert.equal(stampStats(book, "20101").held, 1);
  assert.equal(stampStats(book, "20101").stamps, 1);
  // 예전 글자 형식도 그대로 읽힘
  book.marks.n2 = { "20101": "absent" };
  assert.equal(stampStats(book, "20101").absent, 1);
  // 다음 수업 = 아직 안 쓴 3차시
  assert.deepEqual(nextSessionFor(book), { id: "n3", no: 3, existing: true });
  // 남은 학생만 도장(이미 결석인 학생은 그대로)
  book = applyOp(book, { t: "markMany", s: "n2", sids: ["20101", "20102"], v: "stamp", at: "x" });
  assert.equal(markOf(book.marks.n2["20101"]), "absent");
  assert.equal(markOf(book.marks.n2["20102"]), "stamp");
  book = applyOp(book, { t: "mark", s: "n1", sid: "20101", v: "" });
  assert.equal(book.marks.n1, undefined);
  const log = { t: "logAdd", log: { id: "l1", sid: "20101" } };
  book = applyOp(applyOp(book, log), log);
  assert.equal(book.logs.length, 1);
});

test("포트폴리오: 도장판 8(도장률 비례) + 제출 항목 1점씩", async () => {
  const { presetPortfolio, applyOp, totalFor, totalMax, stampScore } = await import("../src/lessonStamps.js");
  let book = emptyBook();
  book = applyOp(book, { t: "scoring", value: presetPortfolio() });
  for (let i = 1; i <= 4; i++) book.sessions[`s${i}`] = { date: "2026-10-01", period: i };
  for (let i = 1; i <= 3; i++) book = applyOp(book, { t: "mark", s: `s${i}`, sid: "20101", v: "stamp", at: "x" });
  assert.equal(stampScore(book, "20101"), 6);
  book = applyOp(book, { t: "itemMany", item: "p_wrong", sids: ["20101", "20102"], v: true });
  book = applyOp(book, { t: "item", item: "p_mock", sid: "20101", v: true });
  assert.equal(totalFor(book, "20101"), 8);
  assert.equal(totalMax(book), 11);
  book = applyOp(book, { t: "dropItem", item: "p_mock" });
  assert.equal(totalMax(book), 10);
  assert.equal(totalFor(book, "20101"), 7);
});

test("예전 날짜 수업이 있을 때 차시 미리 만들기: 날짜순으로 번호를 먼저 채움", async () => {
  const { applyOp, sessionsAsc } = await import("../src/lessonStamps.js");
  let book = emptyBook();
  book.sessions.a = { date: "2026-09-02", period: 2 };
  book.sessions.b = { date: "2026-09-01", period: 1 };
  book = applyOp(book, { t: "plan", count: 4, at: "x" });
  assert.deepEqual(sessionsAsc(book).map(s => [s.id, s.no]), [["b", 1], ["a", 2], ["n3", 3], ["n4", 4]]);
});

test("제출 항목: 제출 · 늦게 제출 · 미흡 점수 따로", async () => {
  const { itemScore, presetPortfolio, emptyBook: eb } = await import("../src/lessonStamps.js");
  const book = eb(); book.scoring = presetPortfolio();
  const it = book.scoring.items[0];
  book.items[it.id] = { a: true, b: "late", c: "poor", d: "" };
  assert.equal(itemScore(book, it, "a"), 1);
  assert.equal(itemScore(book, it, "b"), 0.5);
  assert.equal(itemScore(book, it, "c"), 0.5);
  assert.equal(itemScore(book, it, "d"), null);
  assert.equal(itemScore(book, { ...it, late: undefined }, "b"), 1);
});

test("단원별 도장 칸: 추가·순서 바꾸기·이름·단원 묶음", async () => {
  const { applyOp, sessionsAsc, slotName, slotGroups } = await import("../src/lessonStamps.js");
  let book = emptyBook();
  book = applyOp(book, { t: "addSlots", slots: [1, 2, 3].map(i => ({ id: `q${i}`, label: `이차곡선${i}`, unit: "이차곡선" })), at: "x" });
  book = applyOp(book, { t: "addSlots", slots: [{ id: "v1", label: "벡터1", unit: "벡터" }, { id: "q1", label: "중복" }], at: "x" });
  const asc = sessionsAsc(book);
  assert.deepEqual(asc.map(s => slotName(s)), ["이차곡선1", "이차곡선2", "이차곡선3", "벡터1"]);
  assert.deepEqual(slotGroups(asc).map(g => [g.unit, g.items.length]), [["이차곡선", 3], ["벡터", 1]]);
  book = applyOp(book, { t: "order", ids: ["v1", "q1"] });
  assert.deepEqual(sessionsAsc(book).map(s => s.id), ["v1", "q1", "q2", "q3"]);
  assert.equal(slotName({ no: 5 }), "5차시");
});

test("parseSlotLines makes unit slots and named slots", async () => {
  const { parseSlotLines } = await import("../src/lessonStamps.js");
  const slots = parseSlotLines("이차곡선 3\n벡터 x2\n형성평가\n\n공간도형 2칸", [{ unit: "이차곡선" }]);
  assert.deepEqual(slots.map(s => s.label), ["이차곡선2", "이차곡선3", "이차곡선4", "벡터1", "벡터2", "형성평가", "공간도형1", "공간도형2"]);
  assert.equal(slots[0].unit, "이차곡선");
  assert.equal(slots[5].unit, "");
  assert.deepEqual(parseSlotLines("12").map(s => s.label), ["12"]);
});

test("addSlots reuse fills the unused 1차시 first and is safe to re-apply", async () => {
  const { emptyBook, applyOp, sessionsAsc, slotName } = await import("../src/lessonStamps.js");
  let b = emptyBook({ id: "x" });
  b = applyOp(b, { t: "session", id: "s1", fields: { no: 1, date: "2026-10-21", period: 1 } });
  const op = { t: "addSlots", reuse: true, slots: [1, 2, 3].map(k => ({ id: `u${k}`, label: `이차곡선${k}`, unit: "이차곡선" })) };
  b = applyOp(b, op);
  b = applyOp(b, JSON.parse(JSON.stringify(op)));
  const list = sessionsAsc(b);
  assert.deepEqual(list.map((s, i) => slotName(s, i)), ["이차곡선1", "이차곡선2", "이차곡선3"]);
  assert.equal(list[0].date, "2026-10-21");
});

test("template copies slot names, order and scoring without touching marks", async () => {
  const { emptyBook, applyOp, sessionsAsc, slotName, templateOp } = await import("../src/lessonStamps.js");
  let src = emptyBook({ id: "a" });
  src = applyOp(src, { t: "addSlots", slots: [{ id: "u1", label: "쌍곡선", unit: "" }, { id: "u2", label: "이차곡선1", unit: "이차곡선" }, { id: "u3", label: "이차곡선2", unit: "이차곡선" }] });
  src.scoring = { ...src.scoring, stamp: { ...src.scoring.stamp, max: 8 } };
  let dst = emptyBook({ id: "b" });
  dst = applyOp(dst, { t: "session", id: "s1", fields: { no: 1, date: "2026-10-20" } });
  dst = applyOp(dst, { t: "mark", s: "s1", sid: "20301", v: "stamp", at: "t" });
  dst = applyOp(dst, { t: "session", id: "s2", fields: { no: 2 } });
  const op = templateOp(src);
  dst = applyOp(dst, op);
  dst = applyOp(dst, JSON.parse(JSON.stringify(op)));
  const names = sessionsAsc(dst).map((s, i) => slotName(s, i));
  assert.deepEqual(names.slice(0, 3), ["쌍곡선", "이차곡선1", "이차곡선2"]);
  assert.equal(dst.scoring.stamp.max, 8);
  assert.equal(Object.keys(dst.marks).length, 1);
  assert.equal(dst.sessions.s1.label, "쌍곡선");
  assert.equal(dst.marks.s1["20301"].m, "stamp");
});

test("small units group under their big unit and swapped names are detected", async () => {
  const { unitGroup, slotGroups, slotName, looksSwapped } = await import("../src/lessonStamps.js");
  assert.equal(unitGroup("포물선"), "이차곡선");
  assert.equal(unitGroup("Ⅰ. 이차곡선 · 타원"), "이차곡선");
  assert.equal(unitGroup("형성평가"), "형성평가");
  const slots = [{ id: "a", no: 1, label: "이차곡선", unit: "포물선" }, { id: "b", no: 2, label: "이차곡선", unit: "타원" }, { id: "c", no: 3, label: "공간도형", unit: "위치관계" }];
  assert.deepEqual(slotGroups(slots).map(g => [g.unit, g.items.length]), [["이차곡선", 2], ["위치관계", 1]]);
  assert.equal(slotName(slots[0]), "포물선");
  assert.equal(slotName({ label: "포물선1", unit: "포물선" }), "포물선1");
  assert.equal(slotName({ no: 3 }), "3차시");
  assert.equal(looksSwapped(slots), true);
  assert.equal(looksSwapped([{ label: "포물선1", unit: "포물선" }, { label: "포물선2", unit: "포물선" }]), false);
});
