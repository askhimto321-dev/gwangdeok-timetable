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
