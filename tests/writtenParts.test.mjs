import test from "node:test";
import assert from "node:assert/strict";
import { splitWritten, unsplitWritten, setWrittenPart, removeWrittenPart, pickWrittenPart, defaultWrittenSplit, countOverMax } from "../src/writtenParts.js";

const student = (sid, score, status = "") => ({ sid, classNumber: 1, number: Number(sid.slice(-2)), score, status });
const exam = {
  id: "written:2026:2:2:국어:1차", title: "1차 정기시험", maxScore: 90, weight: 25, fileName: "mc.xlsx",
  students: { "20101": student("20101", 80), "20102": student("20102", null, "결시"), "20103": student("20103", 60) },
};
const essayFile = { fileName: "essay.xlsx", maxScore: 10, students: { "20101": student("20101", 9), "20103": student("20103", null, "미응시") } };

test("기본 배점: 파일 만점이 90이면 객관식 90 + 논술형 10", () => {
  assert.deepEqual(defaultWrittenSplit(90), { mcMax: 90, essayMax: 10 });
  assert.deepEqual(defaultWrittenSplit(100), { mcMax: 90, essayMax: 10 });
  assert.deepEqual(defaultWrittenSplit(80), { mcMax: 80, essayMax: 20 });
});

test("객관식만 있으면 객관식 점수로 임시 계산", () => {
  const split = splitWritten(exam, { mcMax: 90, essayMax: 10 });
  assert.equal(split.maxScore, 100);
  assert.equal(split.essayPending, true);
  assert.equal(split.students["20101"].score, 80);
  assert.equal(split.students["20102"].score, null);
  assert.equal(split.students["20102"].status, "결시");
  assert.equal(split.weight, 25);
});

test("논술형 파일을 나중에 넣으면 합계로 다시 계산", () => {
  const split = setWrittenPart(splitWritten(exam, { mcMax: 90, essayMax: 10 }), "essay", essayFile);
  assert.equal(split.essayPending, false);
  assert.equal(split.students["20101"].score, 89);
  assert.deepEqual(split.students["20101"].parts, { mc: 80, essay: 9 });
  assert.equal(split.students["20103"].score, null);
  assert.equal(split.students["20103"].status, "미응시");
  assert.equal(split.fileName, "mc.xlsx + essay.xlsx");
});

test("논술형 파일 바꾸기·빼기", () => {
  let split = setWrittenPart(splitWritten(exam, { mcMax: 90, essayMax: 10 }), "essay", essayFile);
  split = setWrittenPart(split, "essay", { fileName: "essay2.xlsx", maxScore: 10, students: { "20101": student("20101", 5), "20103": student("20103", 7) } });
  assert.equal(split.students["20101"].score, 85);
  assert.equal(split.students["20103"].score, 67);
  split = removeWrittenPart(split, "essay");
  assert.equal(split.essayPending, true);
  assert.equal(split.students["20101"].score, 80);
});

test("나누기 해제하면 원래 파일 점수로 돌아감", () => {
  const back = unsplitWritten(setWrittenPart(splitWritten(exam), "essay", essayFile));
  assert.equal(back.maxScore, 90);
  assert.equal(back.students["20101"].score, 80);
  assert.equal(back.split, undefined);
  assert.equal(back.parts, undefined);
});

test("파일 만점으로 파트 고르기", () => {
  const split = splitWritten(exam, { mcMax: 80, essayMax: 20 });
  assert.equal(pickWrittenPart(split, 20), "essay");
  assert.equal(pickWrittenPart(split, 80), "mc");
  assert.equal(pickWrittenPart(split, 100), null);
  assert.equal(pickWrittenPart(exam, 20), null);
});

test("배점 초과 학생 수", () => {
  assert.equal(countOverMax(essayFile, 5), 1);
  assert.equal(countOverMax(essayFile, 10), 0);
});
