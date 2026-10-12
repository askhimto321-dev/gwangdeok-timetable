import test from "node:test";
import assert from "node:assert/strict";
import { officialSubjectName, curriculumApplies, curriculumSubjects } from "../src/curriculum.js";

const Y = 2026;
test("시간표 약칭 → 편제표 정식 과목명", () => {
  const cases = [
    [2, "sem2", "미적", "미적분Ⅰ"], [2, "sem2", "독작", "독서와 작문"], [2, "sem2", "영어Ⅱ", "영어Ⅱ"], [2, "sem2", "영어2", "영어Ⅱ"],
    [2, "sem2", "스문", "스포츠 문화"], [2, "sem2", "미창", "미술 창작"], [2, "sem2", "법사", "법과 사회"], [2, "sem2", "기하", "기하"],
    [2, "sem2", "인윤", "인문학과 윤리"], [2, "sem2", "세물대", "세포와 물질대사"], [2, "sem2", "프로", "프로그래밍"], [2, "sem2", "중회", "중국어 회화"],
    [2, "sem1", "사문", "사회와 문화"], [2, "sem1", "윤사", "윤리와 사상"], [2, "sem1", "세지", "세계시민과 지리"], [2, "sem1", "물리", "물리학"],
    [2, "sem1", "생과", "생명과학"], [2, "sem1", "지과", "지구과학"], [2, "sem1", "영어1", "영어Ⅰ"], [2, "sem1", "스과", "스포츠 과학"],
    [1, "sem1", "통사", "통합사회1"], [1, "sem1", "공수", "공통수학1"], [1, "sem2", "과탐실", "과학탐구실험2"], [1, "sem2", "음연창", "음악 연주와 창작"],
  ];
  cases.forEach(([grade, sem, label, want]) => assert.equal(officialSubjectName(label, grade, sem, Y), want, `${grade}-${sem} ${label}`));
});

test("애매하거나 없는 이름은 그대로", () => {
  assert.equal(officialSubjectName("자율", 2, "sem2", Y), "자율");
  assert.equal(officialSubjectName("", 2, "sem2", Y), "");
});

test("2015 개정 학년(2026년 3학년)은 매핑하지 않음", () => {
  assert.equal(curriculumApplies(3, 2026), false);
  assert.equal(officialSubjectName("미적", 3, "sem1", 2026), "미적");
  assert.equal(curriculumApplies(3, 2027), true);
  assert.equal(officialSubjectName("확통", 3, "sem1", 2027), "확률과 통계");
});

test("학년·학기 과목 목록", () => {
  const list = curriculumSubjects(2, "sem2");
  assert.equal(list.filter(item => item.kind === "common").length, 5);
  assert.ok(list.some(item => item.name === "공중 보건" && item.group === "택1"));
});
