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

test("1학년 학급 시간표를 편제표 학점과 맞춰 봄", async () => {
  const { checkClassAgainstCurriculum } = await import("../src/curriculum.js");
  const rep = (label, n) => Array(n).fill(label);
  const ok = [...rep("공국", 4), ...rep("공수", 4), ...rep("공영", 3), ...rep("한국사", 3), ...rep("통사", 4), ...rep("통과", 4), "과탐실", ...rep("체육", 2), ...rep("음악", 2), ...rep("지재", 3), "자율", "진로", "동아리"];
  const good = checkClassAgainstCurriculum(ok, 1, "sem1", 2026);
  assert.deepEqual(good.issues, []);
  assert.equal(good.counts["공통국어1"], 4);
  const bad = checkClassAgainstCurriculum([...ok.slice(1), "기술가정"], 1, "sem1", 2026);
  assert.ok(bad.issues.some(text => text.startsWith("공통국어1 주 3시간")));
  assert.ok(bad.issues.some(text => text.includes("기술가정")));
});

test("2022 개정 과목 구분: 편제표 공통 편성과 별개", async () => {
  const { subjectCategory, curriculumSubjects } = await import("../src/curriculum.js");
  const cases = { "공통국어1": "공통과목", "통합과학2": "공통과목", "과학탐구실험1": "공통과목", "문학": "일반선택", "대수": "일반선택", "미적분Ⅰ": "일반선택", "영어Ⅰ": "일반선택", "체육1": "일반선택", "음악": "일반선택",
    "기하": "진로선택", "미적분Ⅱ": "진로선택", "스포츠 문화": "진로선택", "스포츠 과학": "진로선택", "미술 창작": "진로선택", "음악 연주와 창작": "진로선택", "인간과 심리": "진로선택",
    "수학과제 탐구": "융합선택", "스포츠 생활1": "융합선택", "지식 재산 일반": "융합선택", "아동발달과 부모": "융합선택", "역사로 탐구하는 현대 세계": "융합선택", "인간과 경제활동": "융합선택",
    "진로와 직업": "일반선택", "공중 보건": "전문교과", "프로그래밍": "전문교과" };
  Object.entries(cases).forEach(([name, want]) => assert.equal(subjectCategory(name), want, name));
  const twoTwo = curriculumSubjects(2, "sem1");
  assert.equal(twoTwo.find(item => item.name === "문학").kind, "common");
  assert.equal(twoTwo.find(item => item.name === "문학").category, "일반선택");
});
