import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { renderToStaticMarkup } from "react-dom/server";

const server = await createServer({ logLevel: "silent", server: { middlewareMode: true }, appType: "custom" });
const app = await server.ssrLoadModule("/src/App.jsx");
const navi = await server.ssrLoadModule("/src/SusiNaviBeta.jsx");
const minimum = await server.ssrLoadModule("/src/minimumCatalog.js");
const naviMinimum = await server.ssrLoadModule("/src/naviMinimum.js");
const supportCard = await server.ssrLoadModule("/src/SupportDecisionCard.jsx");
const supportPrint = await server.ssrLoadModule("/src/SupportPlanPrint.jsx");
const recommendationPresentation = await server.ssrLoadModule("/src/recommendationPresentation.js");
after(async () => { await server.close(); });

test("2학기 이동수업 명단을 성적 없는 수강 과목으로 병합한다", () => {
  const result = app.collectEnrolledSubjectsByStudent({
    "2-sem1": { "20101": [{ subject: "미적분", group: "A" }] },
    "2-sem2": { "20101": [{ subject: "정보과학", group: "B" }, { subject: "정보과학", group: "B" }] },
  });
  assert.deepEqual(result["20101"].map(({ subject, semesterKey, source, enrollmentStatus }) => ({ subject, semesterKey, source, enrollmentStatus })), [
    { subject: "미적분", semesterKey: "2-1", source: "timetable", enrollmentStatus: "enrolled" },
    { subject: "정보과학", semesterKey: "2-2", source: "timetable", enrollmentStatus: "enrolled" },
  ]);
});

test("엑셀형 학번과 학기 키를 정규화해 2학기 미적분I 수강을 인식한다", () => {
  const result = app.collectEnrolledSubjectsByStudent({
    "2학년2학기": { " 20101.0 ": ["미적분Ⅰ"] },
  });
  assert.equal(result["20101"]?.[0]?.semesterKey, "2-2");
  assert.equal(navi.matchedStudentCourse(navi.uniqueStudentSubjects(result["20101"]), "미적분I")?.subject, "미적분I");
});

test("학년별 시간표 약어 매핑을 적용해 미적을 미적분I 수강으로 인식한다", () => {
  const result = app.collectEnrolledSubjectsByStudent({
    "2-sem2": { "20101": [{ subject: "미적", group: "A" }] },
  }, {
    "2": { "미적": "미적분Ⅰ" },
    "3": { "미적": "미적분Ⅱ" },
  });
  assert.equal(result["20101"]?.[0]?.subject, "미적분I");
  assert.equal(result["20101"]?.[0]?.sourceSubject, "미적");
  assert.equal(navi.matchedStudentCourse(navi.uniqueStudentSubjects(result["20101"]), "미적분I")?.subject, "미적분I");
  assert.equal(navi.matchedStudentCourse(navi.uniqueStudentSubjects(result["20101"]), "미적분II"), null);
});

test("출석부에 없는 학급 시간표 약어도 미적분I 수강으로 인식한다", () => {
  const result = app.collectEnrolledSubjectsByStudent({}, {
    "2": { "미적": "미적분Ⅰ" },
  }, {
    "2-sem2": { "20101": { name: "검증학생", class: 1 } },
  }, {
    "2-sem2": { "1": { 월: ["미적", null, null, null, null, null, null] } },
  });
  assert.equal(result["20101"]?.[0]?.subject, "미적분I");
  assert.equal(result["20101"]?.[0]?.sourceSubject, "미적");
  assert.equal(result["20101"]?.[0]?.semesterKey, "2-2");
  assert.equal(navi.matchedStudentCourse(navi.uniqueStudentSubjects(result["20101"]), "미적분I")?.subject, "미적분I");
});

test("넓은 교과는 세부 증거 과목 대신 수학·사회·과학 계열명으로 표시한다", () => {
  assert.equal(recommendationPresentation.recommendedCourseDisplayName("공통수학1"), "수학");
  assert.equal(recommendationPresentation.recommendedCourseDisplayName("통사"), "사회");
  assert.equal(recommendationPresentation.recommendedCourseDisplayName("통합과학"), "과학");
  assert.equal(recommendationPresentation.recommendedCourseDisplayName("미적분Ⅱ"), "미적분II");
  const panel = navi.RecommendedSubjectPanel({
    recommendation: { core: ["수학", "사회", "과학"] },
    studentSubjects: [
      { subject: "공통수학1", category: "수학", source: "grades" },
      { subject: "통합사회", category: "사회", source: "grades" },
      { subject: "통합과학", category: "과학", source: "grades" },
    ],
  });
  const rendered = JSON.stringify(panel);
  assert.doesNotMatch(rendered, /수학 \(공통수학1\)|사회 \(통합사회\)|과학 \(통합과학\)/);
});

test("새 접속에서는 무거운 NAVI 작업을 자동 복원하지 않는다", () => {
  assert.equal(app.safeRestoredWorkspaceView("susiNaviBeta", "grades"), "grades");
  assert.equal(app.safeRestoredWorkspaceView("admissionCases", "grades"), "grades");
  assert.equal(app.safeRestoredWorkspaceView("timetable", "timetable"), "timetable");
});

test("시간표 근거와 성적 근거를 구분하고 성적 근거를 우선한다", () => {
  const grade = { subject: "미적분", category: "수학", source: "grades" };
  const timetable = { subject: "미적분", category: "수학", source: "timetable" };
  assert.equal(navi.matchedStudentCourse([grade, timetable], "미적분"), grade);
  assert.equal(navi.matchedStudentCourse([timetable], "미적분"), timetable);
});

test("미적분II 표기 변형은 같은 과목으로 보되 기하·미적분I과 합치지 않는다", () => {
  const calculus2 = { subject: "미적분Ⅱ", category: "수학", source: "timetable" };
  const geometry = { subject: "기하", category: "수학", source: "timetable" };
  const courses = navi.uniqueStudentSubjects([calculus2, geometry]);
  assert.equal(courses.length, 2);
  assert.equal(navi.courseMatchKey("미적분II"), navi.courseMatchKey("미적분 2"));
  assert.equal(navi.courseMatchKey("미적분Ⅱ"), navi.courseMatchKey("미적분2"));
  assert.equal(navi.matchedStudentCourse(courses, "미적분II")?.subject, "미적분II");
  assert.equal(navi.matchedStudentCourse(courses, "미적분I"), null);
  assert.equal(navi.matchedStudentCourse(courses, "기하")?.subject, "기하");
});

test("시간표 과목명에 선택유형·그룹 문자가 붙어도 미적분II와 기하를 인식한다", () => {
  const collected = app.collectEnrolledSubjectsByStudent({
    "2-sem2": { "20101": [
      { subject: "미적분Ⅱ(진로선택)", group: "G" },
      { subject: "기하 A반", group: "A" },
    ] },
  });
  const courses = navi.uniqueStudentSubjects(collected["20101"]);
  assert.equal(navi.matchedStudentCourse(courses, "미적분2")?.subject, "미적분II(진로선택)");
  assert.equal(navi.matchedStudentCourse(courses, "기하")?.subject, "기하 A반");
  assert.equal(navi.matchedStudentCourse(courses, "미적분I"), null);
});

test("수학 괄호 안에 함께 적힌 권장과목을 개별 과목으로 분리한다", () => {
  assert.deepEqual(navi.splitCourseNames("수학(미적분II, 기하)"), ["미적분II", "기하"]);
  assert.deepEqual(navi.splitCourseNames("미적분Ⅱ 또는 기하 중 택1"), ["미적분II", "기하"]);
});

test("공식 권장과목 XLSX의 병합 헤더·실제 학과·핵심/권장·비고란을 모두 읽는다", async () => {
  const XLSX = await import("xlsx");
  const rows = [
    ["2028학년도 대학별 권장과목"],
    [],
    ["권역", "지역", "대학명", "모집단위", "", "반영과목", "", "비고"],
    ["", "", "", "", "", "핵심과목", "권장과목", ""],
    ["수도권", "서울", "경희대", "재료/화공·고분자·에너지", "화학공학과", "대수, 미적분Ⅰ, 확률과 통계, 물리학, 화학, 미적분Ⅱ, 물질과 에너지, 화학 반응의 세계", "기하, 전자기와 양자, 역학과 에너지", "-"],
    ["수도권", "인천", "인하대", "공과대학", "항공우주공학과", "물리학", "화학, 지구과학", "수학 교과: 대수, 미적분Ⅰ, 확률과 통계 교과목 이수를 권장하며, 공과대학의 경우 기하 교과목도 포함하여 이수할 것을 권장함."],
    ["수도권", "경기", "단국대", "자연계열", "공과대학", "국어, 수학, 영어, 과학", "", "일반선택 과목 이수 후 진로와 적성에 맞게 진로선택 과목을 이수할 것"],
    ["수도권", "서울", "가톨릭대", "사회과학대학", "사회복지학과", "인문사회계열 진로 및 적성을 고려하여 교과목 선택 이수[수학(확률과 통계) 포함]", "", "-"],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!merges"] = [
    { s: { r: 2, c: 3 }, e: { r: 2, c: 4 } },
    { s: { r: 2, c: 5 }, e: { r: 2, c: 6 } },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const buffer = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const parsed = await navi.parseRecommendedSubjectsWorkbook({ name: "권장과목.xlsx", size: bytes.byteLength, arrayBuffer: async () => buffer });
  assert.equal(parsed.schemaVersion, 4);
  const kyunghee = parsed.records.find(item => item.university === "경희대");
  assert.equal(kyunghee.region, "서울");
  assert.equal(kyunghee.department, "화학공학과");
  assert.equal(kyunghee.field, "재료/화공·고분자·에너지");
  assert.equal(kyunghee.core.length, 8);
  assert.equal(kyunghee.recommended.length, 3);
  const official = navi.recommendationForUnit(parsed, "경희대", "서울", "화학공학과");
  assert.equal(official.scope, "모집단위 기준");
  assert.equal(official.core.length, 8);
  assert.equal(official.recommended.length, 3);
  assert.equal(official.core.length + official.recommended.length, 11);
  const inha = parsed.records.find(item => item.university === "인하대");
  assert.deepEqual([...inha.noteRecommended].sort(), ["미적분I", "확률과 통계", "기하", "대수"].sort());
  const dankook = parsed.records.find(item => item.university === "단국대");
  assert.equal(navi.isGenericRecommendationRecord(dankook), true);
  assert.equal(navi.recommendationForUnit(parsed, "단국대", "경기", "공과대학"), null);
  const catholic = parsed.records.find(item => item.university === "가톨릭대");
  assert.deepEqual(catholic.core, []);
  assert.deepEqual(catholic.noteRecommended, ["확률과 통계"]);
  assert.equal(courseValuesIn(catholic).some(course => /적성을 고려/.test(course)), false);
});

function courseValuesIn(item = {}) {
  return [...(item.reflected || []), ...(item.core || []), ...(item.recommended || []), ...(item.noteRecommended || [])];
}

test("공식 자료가 없는 컴퓨터공학과에는 25% 이상 반복된 과목만 추정한다", () => {
  const records = [
    ...["가","나","다","라","마","바"].map(name => ({ university: `${name}대`, region: "서울", department: "컴퓨터공학과", field: "자연", recommended: ["미적분", "정보"] })),
    { university: "사대", region: "경기", department: "컴퓨터공학과", field: "자연", recommended: ["미적분", "화학"] },
    { university: "아대", region: "경기", department: "컴퓨터공학과", field: "자연", recommended: ["정보", "생명과학"] },
    { university: "자대", region: "인천", department: "컴퓨터공학과", field: "자연", recommended: ["확률과 통계"] },
    { university: "차대", region: "충청", department: "컴퓨터공학과", field: "자연", recommended: ["물리학"] },
  ];
  const indexes = navi.buildRecommendationEstimateIndexes({ records, source: { name: "검증 자료" } });
  const result = navi.estimateRecommendationForUnit(indexes, "대상대", "서울", "컴퓨터공학과", "자연");
  assert.equal(result.referenceCount, 10);
  assert.equal(result.consensusThreshold, 3);
  assert.equal(result.strongConsensusThreshold, 5);
  assert.deepEqual(result.recommended, ["미적분", "정보"]);
  assert.equal(result.recommended.includes("화학"), false);
  assert.equal(result.recommended.includes("생명과학"), false);
});

test("화학공학 학과군은 충분한 대학 표본에서 반복 권장과목을 산출한다", () => {
  const departments = ["화학공학과", "화공생명공학부", "화학생명공학과", "신소재공학과", "재료공학부", "에너지공학과", "고분자공학과", "나노공학과", "첨단신소재공학과", "에너지화학공학과"];
  const records = departments.map((department, index) => ({
    university: `검증${index + 1}대`, region: index < 5 ? "서울" : "경기", department, field: "자연",
    recommended: index < 6 ? ["미적분Ⅱ", "기하"] : index === 6 ? ["미적분2"] : index === 7 ? ["기하"] : index === 8 ? ["화학"] : ["물리학"],
  }));
  const indexes = navi.buildRecommendationEstimateIndexes({ records, source: { name: "검증 자료" } });
  const result = navi.estimateRecommendationForUnit(indexes, "대상대", "서울", "화학공학과", "자연");
  assert.equal(result.scope, "화학·신소재·에너지 학과군 여러 대학 공통 권장과목");
  assert.equal(result.referenceCount, 10);
  assert.equal(result.consensusThreshold, 3);
  assert.equal(result.strongConsensusThreshold, 5);
  assert.deepEqual(result.recommended, ["미적분II", "기하"]);
});

test("공식 자료가 없는 화학과는 유사 화학계열의 반복 자료로 보완한다", () => {
  const valid = ["화학과", "응용화학과", "나노화학과", "의약화학과", "에너지환경화학과"].map((department, index) => ({
    university: `화학표본${index + 1}대`, region: "서울", department, field: "자연",
    recommended: index < 4 ? ["미적분II", "화학II"] : ["생명과학II"],
  }));
  const empty = Array.from({ length: 7 }, (_, index) => ({
    university: `미발표${index + 1}대`, region: "경기", department: "화학과", field: "자연", recommended: [],
  }));
  const indexes = navi.buildRecommendationEstimateIndexes({ records: [...valid, ...empty] });
  const result = navi.estimateRecommendationForUnit(indexes, "가천대", "경기", "화학과", "자연");
  assert.equal(result.scope, "화학 학과군 여러 대학 공통 권장과목");
  assert.equal(result.referenceCount, 5);
  assert.equal(result.consensusThreshold, 2);
  assert.equal(result.strongConsensusThreshold, 3);
  assert.deepEqual(result.recommended, ["미적분II", "화학II"]);
});

test("1~2개 대학 자료만으로는 유사학과 권장과목을 일반화하지 않는다", () => {
  const indexes = navi.buildRecommendationEstimateIndexes({ records: [
    { university: "가대", region: "서울", department: "응용화학과", field: "자연", recommended: ["화학II"] },
    { university: "나대", region: "경기", department: "나노화학과", field: "자연", recommended: ["화학II"] },
  ] });
  assert.equal(navi.estimateRecommendationForUnit(indexes, "대상대", "서울", "화학과", "자연"), null);
});

test("학과·학부·전공 표기 차이를 동일 학과 표본으로 통합한다", () => {
  const aliases = ["컴퓨터공학과", "컴퓨터공학부", "컴퓨터공학전공"];
  assert.equal(navi.recommendationDepartmentKey(aliases[0]), navi.recommendationDepartmentKey(aliases[1]));
  assert.equal(navi.recommendationDepartmentKey(aliases[1]), navi.recommendationDepartmentKey(aliases[2]));
  const records = Array.from({ length: 8 }, (_, index) => ({
    university: `표본${index + 1}대`, region: "서울", department: aliases[index % aliases.length], field: "자연",
    recommended: ["미적분II", "정보"],
  }));
  const indexes = navi.buildRecommendationEstimateIndexes({ records });
  const result = navi.estimateRecommendationForUnit(indexes, "대상대", "서울", "컴퓨터공학과", "자연");
  assert.equal(result.scope, "동일 학과 여러 대학 공통 권장과목");
  assert.equal(result.referenceCount, 8);
  assert.equal(result.consensusThreshold, 2);
  assert.equal(result.strongConsensusThreshold, 4);
  assert.deepEqual(result.recommended, ["미적분II", "정보"]);
});

test("주요 복합 학과명을 서로 겹치지 않는 학과군으로 분류한다", () => {
  const cases = [
    ["AI소프트웨어융합학부", "computing"],
    ["정보통신공학과", "electrical"],
    ["메카트로닉스공학과", "mechanical"],
    ["화공생명공학부", "chemical"],
    ["화학과", "chemistry"],
    ["산업경영공학과", "industrial"],
    ["건설환경공학부", "architecture"],
    ["식품생명공학과", "agriculture"],
    ["의생명공학과", "bio"],
    ["물리치료학과", "health"],
    ["응용물리학과", "physics"],
    ["지구환경과학과", "earth"],
    ["경제학과", "economics"],
    ["경영학과", "business"],
    ["정치외교학과", "law_public"],
    ["미디어커뮤니케이션학과", "media"],
    ["호텔관광학과", "tourism"],
    ["산업디자인학과", "design"],
    ["중어중문학과", "humanities"],
    ["AI정보보안학과", "computing"],
    ["미래에너지융합학과", "chemical"],
    ["약과학과", "bio"],
    ["운동처방학과", "health"],
    ["국제관계학과", "law_public"],
    ["글로벌통상학과", "economics"],
  ];
  cases.forEach(([department, expected]) => assert.equal(navi.recommendationDepartmentFamily(department).key, expected, department));
});

test("권장과목 연결 중에는 자료 없음 대신 로딩 상태를 표시한다", () => {
  const loadingPanel = navi.RecommendedSubjectPanel({ recommendation: null, status: "loading" });
  const emptyPanel = navi.RecommendedSubjectPanel({ recommendation: null, status: "empty" });
  const loadingCard = supportCard.RecommendedCourseDetails({ progress: null, status: "loading" });
  assert.match(JSON.stringify(loadingPanel), /권장과목 자료 연결 중/);
  assert.doesNotMatch(JSON.stringify(loadingPanel), /공식 자료 없음/);
  assert.match(JSON.stringify(emptyPanel), /학교 공용 권장과목 자료 미등록/);
  assert.match(JSON.stringify(loadingCard), /자료 연결 중/);
  assert.doesNotMatch(JSON.stringify(loadingCard), /권장과목 자료 없음/);
});

test("해당 대학 공식 학과 자료는 추정 규칙보다 우선해 그대로 반환한다", () => {
  const official = navi.recommendationForUnit({ records: [{
    university: "대상대학교", region: "서울", department: "컴퓨터공학과", field: "자연",
    core: ["미적분"], recommended: ["정보"], notes: ["대학 공식 안내"],
  }], source: { name: "대학 발표 자료" } }, "대상대", "서울", "컴퓨터공학과");
  assert.deepEqual(official.core, ["미적분"]);
  assert.deepEqual(official.recommended, ["정보"]);
  assert.equal(official.estimated, undefined);
});

test("NAVI 지역 문자열이 달라도 같은 대학의 유일한 정확 학과 공식자료를 복구한다", () => {
  const data = { records: [{
    university: "경희대학교", region: "서울", department: "화학공학과", field: "공과대학",
    core: ["대수", "미적분Ⅰ", "미적분Ⅱ", "화학"], recommended: ["기하", "물리학"],
  }] };
  const indexes = navi.buildRecommendationEstimateIndexes(data);
  const official = navi.recommendationForUnit(data, "경희대", "수도권", "화학공학과", indexes);
  assert.equal(official.estimated, undefined);
  assert.equal(official.scope, "대학 동일 모집단위 공식자료 기준");
  assert.deepEqual(official.core, ["대수", "미적분I", "미적분II", "화학"]);
});

test("같은 대학의 학과 명칭이 달라도 동일 학과군 공식 자료가 하나면 우선 연결한다", () => {
  const official = navi.recommendationForUnit({ records: [{
    university: "대상대학교", region: "서울", department: "화공생명공학부", field: "자연",
    core: ["미적분Ⅱ", "기하"], recommended: ["화학"],
  }] }, "대상대", "서울", "화학공학과");
  assert.equal(official.estimated, undefined);
  assert.deepEqual(official.core, ["미적분II", "기하"]);
  assert.equal(official.scope, "대학 발표 동일 학과군 기준");
});

test("같은 대학이어도 화학과와 화학공학과 공식자료를 서로 오연결하지 않는다", () => {
  const data = { records: [{
    university: "대상대학교", region: "서울", department: "화학공학과", field: "공과대학",
    core: ["미적분II"], recommended: ["기하", "화학"],
  }] };
  assert.equal(navi.recommendationForUnit(data, "대상대", "서울", "화학과"), null);
});

test("공식 학과 행이 없는 주거환경학과는 같은 대학 생활과학 계열의 과반 공통과목만 연결한다", () => {
  const common = { university: "경희대", region: "서울", field: "생명과학·환경/생활과학/농림" };
  const data = { source: { url: "https://example.test/official" }, records: [
    { ...common, department: "식품영양학과", core: ["대수", "미적분I", "생활과 윤리"], recommended: ["생명과학"] },
    { ...common, department: "식품생명공학과", core: ["대수", "미적분I", "생활과 윤리"], recommended: ["생명과학"] },
    { ...common, department: "생물학과", core: ["대수", "미적분I"], recommended: ["생명과학", "물리학"] },
    { ...common, department: "스마트팜과학과", core: ["대수", "미적분I"], recommended: ["생명과학"] },
  ] };
  const indexes = navi.buildRecommendationEstimateIndexes(data);
  const linked = navi.recommendationForUnit(data, "경희대", "서울", "주거환경학과", indexes, "인문");
  assert.equal(linked.estimateKind, "university-field");
  assert.equal(linked.officialFieldLabel, "생활과학");
  assert.equal(linked.referenceCount, 4);
  assert.equal(linked.consensusThreshold, 2);
  assert.ok(linked.core.includes("대수"));
  assert.ok(linked.core.includes("미적분I"));
  assert.ok(linked.recommended.includes("생명과학"));
  assert.ok(![...linked.core, ...linked.recommended].includes("물리학"));
});

test("2027 최저도 2028 지원 학생에게 자료연도를 표시하며 참고 판정한다", () => {
  const row = ["서울", "검증대", "교과", "학교추천", "자연", "컴퓨터공학과", "국수영탐", 2, "2합5", "", "", ""];
  const result = naviMinimum.evaluateNaviMinimumSafe(row, {
    admissionYear: 2028,
    latestMockGrades: { 국어: 3, 수학: 2, 영어: 4, 통합사회: 2, 통합과학: 5 },
  });
  assert.equal(result.year, 2027);
  assert.equal(result.status, "satisfied");
  assert.equal(result.yearMapped, true);
});

test("2027 구형 표의 '2개 합 7등급'도 원문 조건으로 남기지 않고 판정한다", () => {
  // row[9]의 3.5는 별도 조건이 아니라 NAVI 원본이 7÷2로 저장한 파생 평균값입니다.
  const row = ["서울", "검증대", "교과", "학교추천", "자연", "컴퓨터공학과", "국수영탐", 2, "2개 합 7등급", 3.5, "", ""];
  const result = naviMinimum.evaluateNaviMinimumSafe(row, {
    admissionYear: 2028,
    latestMockGrades: { 국어: 5, 수학: 4, 영어: 3, 통합사회: 3, 통합과학: 4, 한국사: 2 },
  });
  assert.equal(result.status, "satisfied");
  assert.equal(result.studentSum, 6);
  assert.deepEqual(result.selectedSubjects.map(item => item.name), ["영어", "통합사회"]);
});

test("최저 합에서 계산한 평균과 원자료 평균이 다를 때만 수동 확인으로 남긴다", () => {
  const row = ["서울", "검증대", "교과", "학교추천", "자연", "컴퓨터공학과", "국수영탐", 2, "2개 합 7등급", 4, "", ""];
  const result = naviMinimum.evaluateNaviMinimumSafe(row, {
    admissionYear: 2028,
    latestMockGrades: { 국어: 5, 수학: 4, 영어: 3, 통합사회: 3, 통합과학: 4 },
  });
  assert.equal(result.status, "manual");
  assert.match(result.reason, /평균등급 값이 일치하지 않습니다/);
});

test("선택 카드 인쇄는 빈 슬롯을 제거하고 원래 카드 번호를 유지한다", () => {
  const item = {
    stored: { university: "서울과기대", department: "환경공학과", admissionType: "교과", track: "학교장추천", source: "NAVI" },
    admissionItem: ["학교장추천", 1.96, 2.0], support: { label: "적정" }, minimumStatus: "satisfied",
    minimumEvaluation: { status: "satisfied", year: 2027, yearMismatch: true, count: 2, threshold: 7, studentSum: 6, ruleType: "sum", selectedSubjects: [{ name: "영어", grade: 3 }, { name: "통합사회", grade: 3 }] },
    recommendationProgress: { total: 0 }, recommendationStatus: "empty",
  };
  const markup = renderToStaticMarkup(supportPrint.SupportPlanReport({ items: [null, null, item, null, null, null], student: { sid: "20610", name: "문가연" }, studentGrade: 2.03, cutoffBasis: "70" }));
  assert.match(markup, /is-count-1/);
  assert.match(markup, />3<\/span>/);
  assert.doesNotMatch(markup, /비어 있음/);
  assert.match(supportPrint.supportPlanPrintCss, /grid-template-columns:repeat\(3/);
  assert.match(supportPrint.supportPlanPrintCss, /height:198mm/);
});

test("기존 최저 행의 일반 비고는 판정을 막지 않고 별도조건은 구조화한다", () => {
  const student = { admissionYear: 2028, latestMockGrades: { 국어: 2, 수학: 3, 영어: 4, 통합사회: 3, 통합과학: 5, 한국사: 4 } };
  const benign = naviMinimum.evaluateStoredMinimum({
    admissionYear: 2028, university: "검증대", track: "학교추천", requiredSubjects: "국,수,영,(사,과)", requiredSubjectCount: 2, requiredSum: "2합5", note: "지원 연결 탐색 통합 기준",
  }, student);
  assert.equal(benign.status, "satisfied");
  assert.doesNotMatch(benign.reason, /비고의 별도 조건|조건을 생략/);
  const structured = naviMinimum.evaluateStoredMinimum({
    admissionYear: 2028, university: "검증대", track: "학교추천", requiredSubjects: "국,수,영,사/과", requiredSubjectCount: 3, requiredSum: "3합8", note: "한국사 4등급 이내",
  }, student);
  assert.equal(structured.status, "satisfied");
  assert.match(structured.reason, /한국사 4 \/ 4 이내/);
});

test("2개합 7등급과 탐구 약식 표기를 학생 모평으로 자동 판정한다", () => {
  const result = naviMinimum.evaluateStoredMinimum({
    admissionYear: 2027, university: "검증대", track: "학교추천",
    requiredSubjects: "국, 수, 영, 탐구", requiredSubjectCount: 2, requiredSum: "2개합 7등급", note: "",
  }, { admissionYear: 2028, latestMockGrades: { 국어: 4, 수학: 3, 영어: 3, 통합사회: 5, 통합과학: 6 } });
  assert.equal(result.status, "satisfied");
  assert.equal(result.studentSum, 6);
  assert.equal(result.count, 2);
  assert.equal(result.threshold, 7);
  assert.deepEqual(result.selectedSubjects.map(item => item.name), ["수학", "영어"]);
});

test("반영영역이 비고 숫자만 남은 구형 행은 학년도 공통영역으로 참고 판정한다", () => {
  const result = naviMinimum.evaluateStoredMinimum({
    admissionYear: 2028, university: "검증대", track: "학교추천",
    requiredSubjects: "", requiredSubjectCount: 3, requiredSum: "8", note: "",
  }, { admissionYear: 2028, latestMockGrades: { 국어: 4, 수학: 3, 영어: 3, 통합사회: 2, 통합과학: 5 } });
  assert.equal(result.status, "satisfied");
  assert.equal(result.studentSum, 8);
  assert.equal(result.inferredSubjectPool, true);
  assert.match(result.ruleText, /국,수,영,사,과 중 3합 8/);
});

test("캠퍼스가 빈 건국대 본교 최저를 서울 대상에 연결하고 본문 (1)을 우선 판정한다", () => {
  const row = {
    schema: "KD_MINIMUM_V1", id: "konkuk-2028", sourceId: "source", admissionYear: 2028, season: "수시",
    university: "건국대", campus: "", admissionType: "교과", track: "KU지역균형", trackAliases: "",
    scopeType: "전체", department: "전체", excluded: "수의예과", reviewStatus: "검토필요",
    ruleType: "", subjects: "", count: null, threshold: null, mandatory: "", englishMax: null, historyMax: null,
    inquiryMode: "해당없음", rounding: "없음", englishConversion: "없음",
    ruleText: "국, 수, 영, 사/과(1), 한국사 중 3개 영역 등급 합 8", note: "탐구영역 : 2과목 평균",
    reviewReason: "탐구 반영 확인: 조건의 (1) 표기와 비고의 2과목 평균 적용 범위 확인 · 복합 문장·추가조건 또는 생략된 반영영역을 원문과 대조해야 함",
    source: "2028 프리뷰.pdf", page: "3",
  };
  const rows = minimum.normalizeMinimumCatalog([row]);
  assert.equal(rows[0].reviewStatus, "계산가능");
  assert.equal(rows[0].subjects, "국|수|영|사/과|한");
  const identity = (university, region = "") => `${university.replace(/\([^)]*\)/g, "")}|${region || "단일"}`;
  const linked = minimum.resolveCatalogMinimum({
    target: { university: "건국대", region: "서울", department: "화학공학과", field: "자연", admissionType: "교과", track: "KU지역균형" },
    student: { admissionYear: 2028, minimumCatalogRows: rows, latestMockGrades: { 국어: 2, 수학: 2, 영어: 2, 통합사회: 4, 통합과학: 5 } }, identity,
  });
  assert.equal(linked.evaluation.status, "satisfied");
  assert.equal(linked.evaluation.studentSum, 6);
  assert.match(linked.evaluation.ruleText, /3개 영역 등급 합 8/);
});

test("혼합 범위의 2028 한양대 수학 포함 각 3등급 조건을 학과별로 판정한다", () => {
  const common = {
    schema: "KD_MINIMUM_V1", sourceId: "hanyang-source", admissionYear: 2028, season: "수시",
    university: "한양대", campus: "", admissionType: "교과", track: "학생부교과 (추천형)", trackAliases: "",
    excluded: "", englishMax: null, historyMax: null, inquiryMode: "통합개별", rounding: "없음", englishConversion: "없음",
    note: "", source: "2028 프리뷰.pdf", page: "14",
  };
  const rows = minimum.normalizeMinimumCatalog([
    { ...common, id: "natural", scopeType: "혼합", department: "자연|상경|한양인터칼리지학부", reviewStatus: "검토필요", reviewReason: "다른 예외 모집단위의 제외범위 확정 필요", ruleType: "각", subjects: "국|수|영|사/과", count: 3, threshold: 3, mandatory: "수", ruleText: "국, 수, 영, 사/과(1) 중 3개 영역(수학포함) 각 3등급 이내" },
    { ...common, id: "humanities", scopeType: "혼합", department: "인문|의류학과|실내건축디자인학과", reviewStatus: "계산가능", reviewReason: "", ruleType: "각", subjects: "국|수|영|사/과", count: 3, threshold: 3, mandatory: "", ruleText: "국, 수, 영, 사/과(1) 중 3개 영역 각 3등급 이내" },
  ]);
  assert.equal(rows[0].reviewStatus, "계산가능");
  assert.match(rows[0].excluded, /의류학과/);
  const identity = (university, region = "") => `${university.replace(/\([^)]*\)/g, "")}|${region || "단일"}`;
  const student = { admissionYear: 2028, minimumCatalogRows: rows, latestMockGrades: { 국어: 5, 수학: 3, 영어: 3, 통합사회: 3, 통합과학: 4 } };
  const natural = minimum.resolveCatalogMinimum({ target: { university: "한양대", region: "서울", department: "컴퓨터공학과", field: "자연", admissionType: "교과", track: "학생부교과 (추천형)" }, student, identity });
  assert.equal(natural.evaluation.status, "satisfied");
  assert.equal(natural.minimum.mandatory, "수");
  const exception = minimum.resolveCatalogMinimum({ target: { university: "한양대", region: "서울", department: "의류학과", field: "자연", admissionType: "교과", track: "학생부교과 (추천형)" }, student, identity });
  assert.equal(exception.evaluation.status, "satisfied");
  assert.equal(exception.minimum.mandatory, "");
});

test("직탐이 없는 탐(사/과)(1) 표기는 사·과 선택영역으로 구조화한다", () => {
  const [row] = minimum.normalizeMinimumCatalog([{
    schema: "KD_MINIMUM_V1", id: "hongik", sourceId: "source", admissionYear: 2028, season: "수시",
    university: "홍익대", campus: "", admissionType: "교과", track: "학교장추천자", trackAliases: "",
    scopeType: "전체", department: "전체", excluded: "", reviewStatus: "검토필요",
    ruleType: "", subjects: "", count: null, threshold: null, mandatory: "", englishMax: null, historyMax: null,
    inquiryMode: "해당없음", rounding: "없음", englishConversion: "없음",
    ruleText: "국, 수, 영, 탐(사/과)(1) 중 2개 영역 등급 합 5, 한국사 4등급 이내", note: "",
    reviewReason: "탐구·직탐 선택 방식 확인 필요", source: "2028 프리뷰.pdf", page: "9",
  }]);
  assert.equal(row.reviewStatus, "계산가능");
  assert.equal(row.subjects, "국|수|영|사/과");
  assert.equal(row.historyMax, 4);
});

test("최저 기준연도는 같은 연도 기준과 다른 연도 참고 기준을 구분한다", () => {
  assert.equal(naviMinimum.minimumYearLabel({ year: 2028, yearMismatch: false }, { admissionYear: 2028 }), "2028학년도 기준");
  assert.equal(naviMinimum.minimumYearLabel({ year: 2027, yearMismatch: true }, { admissionYear: 2028 }), "2027학년도 참고 기준");
});

test("수동 검토 상태는 경고문 대신 원문 조건으로 표시한다", () => {
  const display = naviMinimum.minimumDisplay({ status: "manual", ruleText: "국·수·영 중 2합 5", reason: "원문 상충" });
  assert.equal(display.label, "원문 조건");
  assert.doesNotMatch(display.label, /조건 확인 필요/);
});

test("대상 대학의 2027·2028 최저 연결정보를 모두 반환한다", () => {
  const common = { season: "수시", university: "검증대", campus: "", admissionType: "교과", track: "학교추천", trackAliases: "", scopeType: "학과", department: "컴퓨터공학과", excluded: "", reviewStatus: "계산가능" };
  const rows = [{ ...common, id: "2027", admissionYear: 2027 }, { ...common, id: "2028", admissionYear: 2028 }];
  const result = minimum.catalogRowsForTarget(rows, { university: "검증대", region: "서울", department: "컴퓨터공학과", season: "수시" }, 2028, university => university);
  assert.deepEqual(result.map(row => row.admissionYear), [2028, 2027]);
});
