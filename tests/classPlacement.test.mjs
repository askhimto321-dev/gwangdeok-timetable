import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOldSid, parsePlacementSheets, checkPairs, studentResults } from "../src/classPlacement.js";

const roster = { "20101": { name: "가나", gender: "남" }, "20102": { name: "다라", gender: "여" }, "20201": { name: "마바", gender: "남" }, "20202": { name: "사아", gender: "여" }, "20203": { name: "가나", gender: "여" } };

test("반편성: 이전 학번 여러 모양", () => {
  assert.equal(parseOldSid("20415"), "20415");
  assert.equal(parseOldSid("2-4-15"), "20415");
  assert.equal(parseOldSid("2학년 4반 15번"), "20415");
  assert.equal(parseOldSid("30415"), "");
});
test("반편성: 반·번호·성명 + 이전학적 열", () => {
  const aoa = [["2027학년도 3학년 반편성"], ["반", "번호", "성명", "성별", "이전학적"], ["1", "1", "가나", "남", "2-1-1"], ["1", "2", "마바", "남", "2-2-1"], ["2", "1", "다라", "여", "2-1-2"]];
  const r = parsePlacementSheets([{ name: "Sheet1", aoa }], roster);
  assert.deepEqual(r.bySid, { "20101": 1, "20201": 1, "20102": 2 });
});
test("반편성: 반마다 시트, 새 학번만 있고 이름으로 맞추기(동명이인은 성별로)", () => {
  const s1 = { name: "1반", aoa: [["번호", "이름", "성별"], ["1", "가나", "여"], ["2", "마바", "남"]] };
  const s2 = { name: "2반", aoa: [["학번", "이름", "성별"], ["30201", "사아", "여"], ["30202", "없는학생", "남"]] };
  const r = parsePlacementSheets([s1, s2], roster);
  assert.deepEqual(r.bySid, { "20203": 1, "20201": 1, "20202": 2 });
  assert.equal(r.stats.unmatched.length, 1);
});
test("반편성: 분리 쌍 반영 확인", () => {
  const checked = checkPairs([{ a: "20101", b: "20201", level: "반드시 분리" }, { a: "20101", b: "20102", level: "참고" }, { a: "20102", b: "20999", level: "참고" }], { "20101": 1, "20201": 1, "20102": 2 });
  assert.deepEqual(checked.map(p => p.status), ["same", "ok", "unknown"]);
  const st = Object.fromEntries(studentResults(checked).map(s => [s.sid, s.status]));
  assert.deepEqual(st, { "20101": "same", "20201": "same", "20102": "unknown", "20999": "unknown" });
});
import { parseAssignmentSheet, parsePlacementFile, movableClasses, swapCandidates, applyMove, undoMove, classSummary, normalizePlacement } from "../src/classPlacement.js";
test("반편성 프로그램 시트: 구반·구번호·원반·배정가능학급", () => {
  const aoa = [[], [], [], ["", "", "", "", "", "", "", "", "", "", "1학기_선택1_택5", "", "배정가능학급", "", "", ""], ["", "연번", "구반", "구번호", "반", "번호", "이름", "성별", "성적", "비고", "윤리", "지리", "합", "1", "2", "3"], [],
    ["", "1", "1", "1", "1", "1", "가나", "남", "", "", "A", "", "2", "1", "", "1"],
    ["", "2", "2", "1", "2", "1", "마바", "남", "", "", "원반", "B", "2", "", "1", "1"],
    ["", "3", "1", "2", "3", "1", "다라", "여", "", "", "B", "", "1", "", "", "1"]];
  const r = parseAssignmentSheet(aoa);
  assert.deepEqual(Object.keys(r.students).sort(), ["20101", "20102", "20201"]);
  assert.deepEqual(r.students["20101"].can, [1, 3]);
  assert.deepEqual(r.students["20201"].ob, ["1학기 윤리"]);
  assert.deepEqual(r.classOb[2], ["1학기 윤리"]);
  const f = parsePlacementFile([{ name: "대시보드", aoa: [["x"]] }, { name: "학생배정현황", aoa }], {});
  assert.equal(f.kind, "program");
  let p = normalizePlacement({ students: f.students });
  assert.deepEqual(movableClasses(p, "20101"), [3]);
  assert.deepEqual(swapCandidates(p, "20101", 3).map(x => x.sid), []); // 3반 학생은 1반으로 못 감
  assert.deepEqual(swapCandidates(p, "20201", 3).map(x => x.sid), []);
  p = applyMove(p, { sid: "20101", to: 3, by: "t" });
  assert.equal(p.students["20101"].cls, 3);
  const s = Object.fromEntries(classSummary(p).map(x => [x.cls, x]));
  assert.equal(s[3].n, 2); assert.equal(s[3].inn, 1); assert.equal(s[1].out, 1);
  p = undoMove(p, p.moves[0].id);
  assert.equal(p.students["20101"].cls, 1); assert.equal(p.moves.length, 0);
});

import { parseRoomSheet, courseCheck } from "../src/classPlacement.js";
test("시간표: 그룹마다 한 과목씩, 새 반에 같은 과목·그룹 듣는 학생이 있어야 수강 가능", () => {
  const room = parseRoomSheet([
    [], ["연번", "선택구분", "운영학기", "과목", "동시그룹", "세부그룹", "1", "2", "합계"],
    [1, "선택1", "1학기", "화학", "A", 1, 5, 5, 10],
    [2, "선택1", "1학기", "물리", "B", 1, 5, 0, 5],
    [3, "선택1", "1학기", "지리", "원반", "", 0, 24, 24],
    [4, "선택1", "1학기", "지리", "A", 1, 3, 0, 3],
    [5, "선택1", "1학기", "물리", "A", 1, 0, 2, 2],
  ]);
  assert.deepEqual(room.letters, { 1: ["A", "B"] });
  assert.deepEqual(room.ob, { 2: { 1: ["지리"] } });
  const placement = { rooms: room, students: {
    s1: { cls: 1, orig: 1, sj: [{ sem: "1", n: "화학", g: "A" }, { sem: "1", n: "물리", g: "B" }] },
    s2: { cls: 1, orig: 1, sj: [{ sem: "1", n: "지리", g: "A" }, { sem: "1", n: "물리", g: "B" }] },
    t1: { cls: 2, orig: 2, sj: [{ sem: "1", n: "지리", g: "원반" }, { sem: "1", n: "화학", g: "A" }] },
    t2: { cls: 2, orig: 2, sj: [{ sem: "1", n: "지리", g: "원반" }, { sem: "1", n: "물리", g: "A" }] },
  } };
  // s1 → 2반: 원반 '지리'를 안 골랐고, 2반은 B가 원반 시간 · 화학 A는 2반 학생이 들으니 가능, 물리는 A에 넣으면 화학과 겹침
  const a = courseCheck(placement, "s1", 2);
  assert.equal(a.ok, false);
  assert.ok(a.issues.some(i => i.kind === "ob"));
  assert.equal(a.tt[1].by.A, "화학");
  // s2 → 2반: 지리는 원반, 물리는 2반 학생이 듣는 A로 옮겨 들어요
  const b = courseCheck(placement, "s2", 2);
  assert.equal(b.ok, true);
  assert.deepEqual(b.tt[1].by, { A: "물리" });
  assert.deepEqual(b.plan.map(x => `${x.n}:${x.from}>${x.to}`).sort(), ["물리:B>A", "지리:A>원반"]);
  // 2반에서 물리 A를 듣던 학생이 다른 반으로 가면, 2반에 물리 A 듣는 학생이 없어 s2는 수강 불가
  placement.students.t2 = { ...placement.students.t2, cls: 1 };
  const c = courseCheck(placement, "s2", 2);
  assert.equal(c.ok, false);
  assert.equal(c.issues[0].kind, "none");
  assert.ok(courseCheck(placement, "s1", 1).ok);
});

import { subjectCatalog, trySubjectChange, applySubjectChange, resetSubjects, subjectDiff } from "../src/classPlacement.js";
test("선택과목 바꾸기: 그 반에 같은 과목·그룹 듣는 다른 학생이 있어야 하고, 기록·되돌리기", () => {
  const room = parseRoomSheet([
    [], ["연번", "선택구분", "운영학기", "과목", "동시그룹", "세부그룹", "1", "2", "합계"],
    [1, "선택1", "1학기", "화학", "A", 1, 5, 5, 10],
    [2, "선택1", "1학기", "물리", "B", 1, 5, 0, 5],
    [3, "선택1", "1학기", "생명", "A", 1, 0, 4, 4],
    [4, "선택1", "1학기", "지구", "B", 1, 3, 0, 3],
  ]);
  const p = { rooms: room, students: {
    s1: { cls: 1, orig: 1, sj: [{ sem: "1", n: "화학", g: "A" }, { sem: "1", n: "물리", g: "B" }] },
    s2: { cls: 1, orig: 1, sj: [{ sem: "1", n: "화학", g: "A" }, { sem: "1", n: "지구", g: "B" }] },
    t1: { cls: 2, orig: 2, sj: [{ sem: "1", n: "생명", g: "A" }] },
  } };
  assert.deepEqual(subjectCatalog(p)[1].지구, ["B"]);
  // s1 물리 → 지구: 1반에 지구 B 듣는 학생(s2)이 있어 가능
  const ok = trySubjectChange(p, "s1", "1", "물리", "지구");
  assert.equal(ok.g, "B"); assert.equal(ok.check.ok, true);
  // s1 화학 → 생명: 생명 A는 1반 학생이 아무도 안 들어 수강 불가
  const bad = trySubjectChange(p, "s1", "1", "화학", "생명");
  assert.equal(bad.check.ok, false);
  // s2 지구 → 물리 후 s1이 지구로 가면: 1반 지구 B 학생이 없어 불가(자기 자신은 세지 않음)
  const q = applySubjectChange(p, { sid: "s2", sem: "1", from: "지구", to: "물리", g: "B", by: "t" });
  assert.equal(trySubjectChange(q, "s1", "1", "물리", "지구").check.ok, false);
  assert.deepEqual(subjectDiff(q.students.s2), [{ sem: "1", from: "지구", to: "물리" }]);
  assert.equal(q.subjChanges.length, 1);
  const r = resetSubjects(q, "s2");
  assert.equal(r.students.s2.sj[1].n, "지구"); assert.equal(r.students.s2.sj0, undefined); assert.equal(r.subjChanges.length, 0);
});

test("선택과목 바꾸기: 원반 과목 대신 원반 시간에 열리는 다른 반 수업 듣기", () => {
  // 2반은 B 그룹 시간에 원반(화학). B 시간에 1반·3반 학생들이 듣는 물리·지구 수업이 열려요.
  const room = parseRoomSheet([
    [], ["연번", "선택구분", "운영학기", "과목", "동시그룹", "세부그룹", "1", "2", "3", "합계"],
    [1, "s", "1학기", "생명", "A", 1, 3, 3, 3, 9],
    [2, "s", "1학기", "물리", "B", 1, 3, 0, 3, 6],
    [3, "s", "1학기", "지구", "B", 1, 3, 0, 0, 3],
    [4, "s", "1학기", "화학", "원반", "", 0, 20, 0, 20],
    [5, "s", "1학기", "정치", "A", 1, 0, 0, 2, 2],
  ]);
  const p = { rooms: room, students: {
    a: { cls: 2, orig: 2, sj: [{ sem: "1", n: "화학", g: "원반" }, { sem: "1", n: "생명", g: "A" }] },
    b: { cls: 2, orig: 2, sj: [{ sem: "1", n: "화학", g: "원반" }, { sem: "1", n: "생명", g: "A" }] },
    c: { cls: 1, orig: 1, sj: [{ sem: "1", n: "생명", g: "A" }, { sem: "1", n: "물리", g: "B" }] },
  } };
  const r = trySubjectChange(p, "a", "1", "화학", "물리");
  assert.equal(r.g, "B"); assert.equal(r.ox, true); assert.equal(r.check.ok, true);
  // 원반 시간(B)에 정치 수업은 없어요
  assert.equal(trySubjectChange(p, "a", "1", "화학", "정치").check.ok, false);
  const q = applySubjectChange(p, { sid: "a", sem: "1", from: "화학", to: "물리", g: r.g, ox: r.ox, by: "t" });
  assert.deepEqual(q.students.a.sj[0], { sem: "1", n: "물리", g: "B", ox: true });
  assert.equal(courseCheck(q, "a", 2).ok, true);
  // 다시 화학(원반)으로
  const back = trySubjectChange(q, "a", "1", "물리", "화학");
  assert.equal(back.g, "원반"); assert.equal(back.check.ok, true);
});

test("선택과목 바꾸기: 새 과목에 맞춰 다른 과목 그룹까지 다시 배정", () => {
  // 1반: 화학은 A·B 둘 다, 물리는 A만 열려요. s1은 화학 A · 지구 B → 지구를 물리로 바꾸면 물리 A, 화학 B로 옮겨요.
  const room = parseRoomSheet([
    [], ["연번", "선택구분", "운영학기", "과목", "동시그룹", "세부그룹", "1", "합계"],
    [1, "s", "1학기", "화학", "A", 1, 5, 5], [2, "s", "1학기", "화학", "B", 1, 5, 5],
    [3, "s", "1학기", "물리", "A", 1, 5, 5], [4, "s", "1학기", "지구", "B", 1, 5, 5],
  ]);
  const p = { rooms: room, students: {
    s1: { cls: 1, orig: 1, sj: [{ sem: "1", n: "화학", g: "A" }, { sem: "1", n: "지구", g: "B" }] },
    a: { cls: 1, orig: 1, sj: [{ sem: "1", n: "화학", g: "B" }, { sem: "1", n: "물리", g: "A" }] },
    b: { cls: 1, orig: 1, sj: [{ sem: "1", n: "화학", g: "A" }, { sem: "1", n: "지구", g: "B" }] },
  } };
  const r = trySubjectChange(p, "s1", "1", "지구", "물리");
  assert.equal(r.check.ok, true);
  assert.equal(r.g, "A");
  assert.deepEqual(r.moved, [{ n: "화학", from: "A", to: "B" }]);
  const q = applySubjectChange(p, { sid: "s1", sem: "1", from: "지구", to: "물리", g: r.g, sj: r.sj, by: "t" });
  assert.deepEqual(q.students.s1.sj.map(x => `${x.n}${x.g}`).sort(), ["물리A", "화학B"]);
});

import { arrangeSubjectSet, applySubjectSet } from "../src/classPlacement.js";
test("선택과목 다시 고르기: 고른 과목으로 그룹 자동 배정, 원반 대신까지", () => {
  const room = parseRoomSheet([
    [], ["연번", "선택구분", "운영학기", "과목", "동시그룹", "세부그룹", "1", "2", "합계"],
    [1, "s", "1학기", "화학", "A", 1, 5, 5, 10], [2, "s", "1학기", "물리", "A", 1, 5, 5, 10],
    [3, "s", "1학기", "지구", "B", 1, 5, 0, 5], [4, "s", "1학기", "생명", "B", 1, 5, 0, 5],
    [5, "s", "1학기", "윤리", "원반", "", 0, 20, 20],
  ]);
  const p = { rooms: room, students: {
    s: { cls: 2, orig: 2, sj: [{ sem: "1", n: "윤리", g: "원반" }, { sem: "1", n: "화학", g: "A" }] },
    a: { cls: 2, orig: 2, sj: [{ sem: "1", n: "윤리", g: "원반" }, { sem: "1", n: "물리", g: "A" }] },
    b: { cls: 1, orig: 1, sj: [{ sem: "1", n: "지구", g: "B" }, { sem: "1", n: "화학", g: "A" }] },
  } };
  // 윤리(원반) 빼고 물리·지구: 물리는 A, 지구는 2반 원반 시간(B)에 1반 수업으로
  const r = arrangeSubjectSet(p, "s", "1", ["물리", "지구"]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.sj.map(x => `${x.n}${x.g}${x.ox ? "*" : ""}`).sort(), ["물리A", "지구B*"]);
  const q = applySubjectSet(p, { sid: "s", sem: "1", sj: r.sj, by: "t" });
  assert.equal(q.subjChanges[0].from.n, "윤리, 화학");
  // 화학·물리 둘 다 A만 열려 겹쳐요
  assert.equal(arrangeSubjectSet(p, "s", "1", ["윤리", "화학", "물리"]).ok, false);
});

import { checkManualGroups } from "../src/classPlacement.js";
test("선택과목 그룹 직접 고르기: 칸마다 확인", () => {
  const room = parseRoomSheet([
    [], ["연번", "선택구분", "운영학기", "과목", "동시그룹", "세부그룹", "1", "2", "합계"],
    [1, "s", "1학기", "화학", "A", 1, 5, 5, 10], [2, "s", "1학기", "물리", "A", 1, 5, 5, 10],
    [3, "s", "1학기", "지구", "B", 1, 5, 0, 5], [4, "s", "1학기", "윤리", "원반", "", 0, 20, 20],
  ]);
  const p = { rooms: room, students: {
    s: { cls: 2, orig: 2, sj: [{ sem: "1", n: "윤리", g: "원반" }, { sem: "1", n: "화학", g: "A" }] },
    a: { cls: 2, orig: 2, sj: [{ sem: "1", n: "윤리", g: "원반" }, { sem: "1", n: "물리", g: "A" }] },
  } };
  const ok = checkManualGroups(p, "s", "1", { letters: { A: "물리", B: "지구" }, ob: [] });
  assert.equal(ok.ok, true); assert.equal(ok.cells.B.ox, true);
  const bad = checkManualGroups(p, "s", "1", { letters: { A: "화학" }, ob: ["윤리"] });
  assert.equal(bad.ok, false); assert.equal(bad.cells.A.ok, false); // 2반에 화학 A 듣는 다른 학생 없음
});
