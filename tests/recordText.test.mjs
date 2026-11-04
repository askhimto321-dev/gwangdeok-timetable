import test from "node:test";
import assert from "node:assert/strict";
import { neisBytes, mergeActivities, checkRecordText, issueSummary } from "../src/recordText.js";

test("나이스 바이트: 한글 3, 영문·숫자·공백 1, 엔터 2", () => {
  assert.equal(neisBytes("가나다"), 9);
  assert.equal(neisBytes("AI 3개"), 1 + 1 + 1 + 1 + 3);
  assert.equal(neisBytes("가\n나"), 3 + 2 + 3);
  assert.equal(neisBytes("가\r\n나"), 8);
  assert.equal(neisBytes(""), 0);
});
test("활동별 세특 합치기: 빈 활동 빼고 줄바꿈", () => {
  const acts = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(mergeActivities(acts, { a: " 첫째 활동 ", b: "", c: "셋째" }), "첫째 활동\n셋째");
});
test("기재요령 점검: 특수문자·대학명·상호명·용어는 기재 불가", () => {
  const issues = checkRecordText("서울대학교 탐방 후 유튜브에 영상을 올림. 2025.03~05 활동 · 발표함. 교내 대회에서 수상함.");
  const kinds = issues.map(item => item.kind);
  assert.ok(kinds.includes("대학명"));
  assert.ok(kinds.includes("상호명"));
  assert.ok(kinds.some(k => k.startsWith("특수문자")));
  assert.ok(kinds.includes("입력 불가 용어"));
  assert.ok(issueSummary(issues).block >= 5);
});
test("기재요령 점검: 시제·학생 입장 표현은 권장(warn)", () => {
  const issues = checkRecordText("실험 결과를 분석하였음. 협력의 중요성을 깨달음.");
  assert.deepEqual(issues.map(item => item.level), ["warn", "warn"]);
});
test("기재요령 점검: 허용 영문(AI, SNS)과 일반 낱말은 통과", () => {
  assert.equal(checkRecordText("AI 윤리에 대해 SNS 사례를 조사하여 발표함.").length, 0);
  assert.equal(checkRecordText("현대 사회의 기대와 반대 의견을 비교함.").length, 0);
});
import { autoFixRecordText, parsePastedRows } from "../src/recordText.js";
test("자동 고치기: 기호만 바꾸고 뜻은 그대로", () => {
  assert.equal(autoFixRecordText("국어·수학 ‘탐구’ 3~5월 [보고서]  발표함."), "국어, 수학 '탐구' 3-5월 보고서 발표함.");
});
test("엑셀 붙여넣기: 번호·학번으로 학생 맞추기", () => {
  const students = [{ sid: "20101", number: 1 }, { sid: "20102", number: 2 }];
  const { matched, missed } = parsePastedRows("1\t첫째 글\n20102\t홍길동\t둘째 글\n9\t없는 학생", students);
  assert.deepEqual(matched, [{ sid: "20101", text: "첫째 글" }, { sid: "20102", text: "둘째 글" }]);
  assert.equal(missed.length, 1);
});
import { splitSentences, findDuplicateSentences, buildAiPrompt } from "../src/recordText.js";
test("문장 나누기: 소수점은 그대로", () => {
  assert.deepEqual(splitSentences("pH 7.5 용액을 만듦. 결과를 발표함.\n다음 줄임"), ["pH 7.5 용액을 만듦.", "결과를 발표함.", "다음 줄임"]);
});
test("중복 문장: 띄어쓰기 달라도 같은 문장으로", () => {
  const dup = findDuplicateSentences([
    { sid: "1", label: "1번", text: "모둠 활동에 적극적으로 참여하는 모습을 보임. 혼자 쓴 문장임." },
    { sid: "2", label: "2번", text: "모둠 활동에  적극적으로 참여하는 모습을 보임." },
    { sid: "3", label: "3번", text: "다른 문장." },
  ]);
  assert.equal(dup.length, 1);
  assert.deepEqual(dup[0].people.map(p => p.label), ["1번", "2번"]);
});
test("AI 요청문: 학생 이름을 빼고 바이트 조건을 넣음", () => {
  const prompt = buildAiPrompt({ area: "과세특", subject: "국어", activity: "논술", budget: 900, notes: [["논술", "홍길동은 근거를 들어 주장함"]], studentName: "홍길동" });
  assert.ok(!prompt.includes("홍길동"));
  assert.ok(prompt.includes("900바이트"));
  assert.ok(prompt.includes("학생은 근거를 들어 주장함"));
});
test("오타 의심: 자음·모음만, 같은 낱말 반복, 마침표 겹침", () => {
  const issues = checkRecordText("발표를 ㅇㅇ 잘함. ㅏㅇ 활동함. 탐구 탐구 보고서를 씀.. 끝.");
  const typos = issues.filter(item => item.kind === "오타 의심").map(item => item.match);
  assert.ok(typos.includes("ㅇㅇ") && typos.includes("ㅏㅇ"));
  assert.ok(typos.some(m => m.startsWith("탐구 탐구")));
  assert.ok(typos.includes(".."));
  assert.equal(checkRecordText("현대 사회의 다양한 문제를 탐구함.").filter(i => i.kind === "오타 의심").length, 0);
});
test("중복 문장: 짧은 문장(5자 이상)도 같은 문장으로", () => {
  const dup = findDuplicateSentences([
    { sid: "1", label: "1번", text: "도레미파솔라시도." },
    { sid: "2", label: "2번", text: "도레미파솔라시도." },
    { sid: "3", label: "3번", text: "도레미파솔라시도." },
    { sid: "4", label: "4번", text: "성실함." },
    { sid: "5", label: "5번", text: "성실함." },
  ]);
  assert.equal(dup.length, 1);
  assert.equal(dup[0].people.length, 3);
});
test("중복 문장: 조사·어미만 바꾼 문장은 '비슷한 문장'으로 묶음", () => {
  const dup = findDuplicateSentences([
    { sid: "1", label: "1번", text: "소설의 갈등 구조를 분석한 보고서를 논리적으로 작성함." },
    { sid: "2", label: "2번", text: "소설의 갈등 구조를 분석하는 보고서를 논리적으로 작성하였음." },
    { sid: "3", label: "3번", text: "기후 변화가 해양 생태계에 미치는 영향을 조사하여 발표함." },
  ]);
  assert.equal(dup.length, 1);
  assert.equal(dup[0].similar, true);
  assert.deepEqual(dup[0].people.map(p => p.label).sort(), ["1번", "2번"]);
});
test("AI 요청문: 성취기준을 넣으면 목표로 안내", () => {
  const prompt = buildAiPrompt({ area: "과세특", subject: "문학", budget: 1500, notes: [["논술", "근거를 들어 주장함"]], standards: ["[12문학01-02] 문학의 여러 갈래들의 특성과 문학의 맥락에 대해 이해한다."] });
  assert.ok(prompt.includes("[이 활동의 성취기준"));
  assert.ok(prompt.includes("- [12문학01-02]"));
  assert.ok(!buildAiPrompt({ area: "과세특", notes: [] }).includes("성취기준"));
});
test("점검: 한 글 안에서 같은 문장 반복", () => {
  const issues = checkRecordText("실험 결과를 정리함. 발표를 잘함. 실험 결과를 정리함.");
  assert.ok(issues.some(item => item.kind === "같은 문장 반복"));
  assert.ok(!checkRecordText("실험 결과를 정리함. 발표를 잘함.").some(item => item.kind === "같은 문장 반복"));
});
test("점검: 마지막 문장 끝(마침표·종결어미)", () => {
  const kinds = text => checkRecordText(text).filter(item => item.kind === "문장 끝 확인").length;
  assert.equal(kinds("실험 결과를 정리함."), 0);
  assert.equal(kinds("발표 능력이 돋보임."), 0);
  assert.equal(kinds("실험 결과를 정리함"), 1);
  assert.equal(kinds("소논문 발췌독 대회."), 1);
  assert.equal(kinds(""), 0);
});
test("AI 요청문: 교과 4요소 구성·참고 예시", () => {
  const prompt = buildAiPrompt({ area: "과세특", subject: "문학", notes: [["논술", "근거를 들어 주장함"]], example: "예시 문장임." });
  assert.ok(prompt.includes("성취수준"));
  assert.ok(prompt.includes("[문체·구성 참고 예시"));
  assert.ok(!buildAiPrompt({ area: "행동특성 및 종합의견", notes: [] }).includes("성취수준"));
});
test("AI 요청문: 구성 틀은 끌 수 있음", () => {
  assert.ok(!buildAiPrompt({ area: "과세특", subject: "문학", notes: [], frame: false }).includes("성취수준"));
});
test("점검 엑셀 읽기: 머리글·글 칸·한도", async () => {
  const { parseCheckSheet } = await import("../src/recordText.js");
  const parsed = parseCheckSheet([["2학년 3반"], ["번호", "학번", "이름", "자율·자치활동", "진로활동", "행동특성 및 종합의견"], [1, "20301", "가", "글", "", "행발 글"], ["", "", "", "", "", ""]]);
  assert.equal(parsed.rows.length, 1);
  assert.deepEqual(parsed.columns.map(c => c.limit), [1500, 1500, 900]); // 2026학년도 2학년: 진로 500자·행발 300자
  const third = parseCheckSheet([["번호", "학번", "이름", "진로활동", "행동특성 및 종합의견"], [1, "30101", "가", "글", "글"]]);
  assert.deepEqual(third.columns.map(c => c.limit), [2100, 1500]); // 3학년은 2027.3.1부터 새 한도
  assert.equal(parsed.rows[0].texts[2], "행발 글");
  assert.ok(parseCheckSheet([["a", "b"]]).error);
  const sj = parseCheckSheet([["번호", "이름", "과목별 세부능력 및 특기사항", "바이트"], [1, "가", "세특 글", 9]]);
  assert.equal(sj.columns.length, 1);
  assert.equal(sj.columns[0].limit, 1500);
});

test("parseEventSheets: 부서 시트·중복 시트 합치기, 영역 나누기", async () => {
  const { parseEventSheets, eventAreaOf } = await import("../src/recordText.js");
  const dept = { name: "교무기획부", rows: [["< 입력 >"], ["연번", "주관부서", "생기부 영역", "행사명", "학급", "학번\n(예 : 10101)", "이름", "특기사항", "비고"],
    [1, "교무기획부", "자율", "학급 자치 회의", 201, 20101, "가", "회의를 이끎.", ""],
    [2, "교무기획부", "동아리", "축제", 201, 20102, "나", "공연함.", ""],
    [3, "교무기획부", "진로", "진로 특강", 201, "20101.0", "가", "특강을 들음.", ""]] };
  const groupSheet = { name: "따라체험 특기사항(조별)", rows: [["제목"], ["연번", "생기부 영역", "행사명", "학급", "학번", "이름", "특기사항", "조", "담당교사"], [1, "진로", "따라체험", 201, 20102, "나", "짧은 글.", 3, "교사"]] };
  const sorted = { name: "따라체험 (학번순)", rows: [["제목"], ["연번", "생기부 영역", "학번 (자동입력)", "학급", "이름", "조", "담당교사", "행사명 (자동입력)", "특기사항 (자동입력)", "바이트수", "특기사항 자체 점검 필터"], [1, "진로", 20102, 201, "나", 3, "교사", "따라체험", "조금 더 긴 같은 활동 글.", 30, ""]] };
  const service = { name: "봉사", rows: [["제목"], ["연번", "학번", "활동내용"], [1, 20101, "봉사"]] };
  const { items, skipped } = parseEventSheets([dept, groupSheet, sorted, service]);
  assert.equal(items.length, 3);
  assert.equal(skipped.otherArea, 1);
  const tr = items.find(i => i.sid === "20102");
  assert.equal(tr.area, "career"); assert.equal(tr.text, "짧은 글."); // 학번순(자동입력) 취합 시트는 읽지 않음
  assert.equal(tr.dept, undefined); // 부서명은 담지 않음
  assert.equal(items.filter(i => i.sid === "20101").map(i => i.area).sort().join(","), "autonomy,career");
  assert.equal(eventAreaOf("자율·자치활동"), "autonomy");
});

test("상호명 점검: '다음'은 상호명으로 보지 않음, Daum은 봄", async () => {
  const { checkRecordText } = await import("../src/recordText.js");
  const brand = text => checkRecordText(text).some(item => /포털/.test(item.message || item.label || JSON.stringify(item)));
  assert.equal(brand("다음 시간에 발표를 이어 가기로 함. 다음을 준비함."), false);
  assert.equal(brand("Daum 카페에서 자료를 찾음."), true);
});
test("영역 한도: 학년별", async () => {
  const { areaLimit } = await import("../src/recordText.js");
  assert.equal(areaLimit("career", "2", 2026), 1500);
  assert.equal(areaLimit("career", "3", 2026), 2100);
  assert.equal(areaLimit("behavior", "3", 2026), 1500);
  assert.equal(areaLimit("career", "3", 2027), 1500);
  assert.equal(areaLimit("autonomy", "3", 2026), 1500);
});
test("문장 끝 확인: 겹받침 ㄻ 명사형(이끎·만듦)은 통과, 마침표 없음은 알림", async () => {
  const { checkRecordText } = await import("../src/recordText.js");
  const endIssue = text => checkRecordText(text).some(item => item.label === "문장 끝 확인" || item.type === "문장 끝 확인" || JSON.stringify(item).includes("문장 끝 확인"));
  assert.equal(endIssue("모둠 활동이 원활히 이루어질 수 있도록 주도적으로 이끎."), false);
  assert.equal(endIssue("실험 도구를 직접 만듦."), false);
  assert.equal(endIssue("탐구 태도가 돋보임."), false);
  assert.equal(endIssue("심화 학습을 지속하겠다고 밝힘"), true);
  assert.equal(endIssue("관련 도서를 읽고 보고서를 작성."), true);
});
test("같은 문장: 행사 원문 문장은 빼고, 영역을 알려 줌", async () => {
  const { findDuplicateSentences } = await import("../src/recordText.js");
  const ev = "희망 진로를 심층적으로 탐색하고 관련 체험을 계획하고 실행하는 따라체험 활동에 참여함.";
  const entries = [
    { sid: "1", label: "1번", area: "career", areaLabel: "진로", text: `${ev} 개인 관찰 하나를 적음.` },
    { sid: "2", label: "2번", area: "career", areaLabel: "진로", text: `${ev.replace("탐색하고", "연구하고")} 개인 관찰 둘을 적음.` },
    { sid: "1", label: "1번", area: "autonomy", areaLabel: "자율·자치", text: "학급 회의에서 의견을 모아 정리하는 역할을 성실히 수행함." },
    { sid: "2", label: "2번", area: "behavior", areaLabel: "행발", text: "학급 회의에서 의견을 모아 정리하는 역할을 성실히 수행함." },
  ];
  assert.equal(findDuplicateSentences(entries).length, 2); // 행사 문장(비슷한 문장) + 회의 문장
  const dups = findDuplicateSentences(entries, { ignore: [ev] });
  assert.equal(dups.length, 1);
  assert.deepEqual(dups[0].areas, { "자율·자치": 1, "행발": 1 });
  assert.equal(dups[0].count, 2);
});
test("임원 기록만 있으면 문장 완성 알림", async () => {
  const { checkRecordText } = await import("../src/recordText.js");
  const has = (text, name) => checkRecordText(text).some(item => JSON.stringify(item).includes(name));
  assert.equal(has("학급자치회 회장(2026.08.13.-2027.02.28.)", "임원 문장 완성"), true);
  assert.equal(has("학급자치회 부회장(2026.03.02.-2026.08.12.)", "임원 문장 완성"), true);
  assert.equal(has("학급자치회 회장(2026.08.13.-2027.02.28.)", "문장 끝 확인"), true);
  assert.equal(has("학급자치회 회장(2026.08.13.-2027.02.28.)으로서 학급 회의를 이끌며 의견을 조율함.", "임원 문장 완성"), false);
  assert.equal(has("학급자치회 회장(2026.08.13.-2027.02.28.)으로서 학급 회의를 이끌며 의견을 조율함.", "문장 끝 확인"), false);
  assert.equal(has("모둠 활동에서 의견을 정리함(2026.05.).", "문장 끝 확인"), false);
});
test("나이스 생기부 엑셀 읽기: 영역·학번 맞추기", async () => {
  const { parseNeisRecordSheets } = await import("../src/recordText.js");
  const auto = { name: "자율·자치활동관리 특기사항 ", rows: [["영역 구분", "학년도", "학년", "반", "번호", "학생개인번호", "성명", "특기사항"], ["자율·자치활동_특기사항", 2026, 2, "04", "1", "x", "가", "자율 글."], ["자율·자치활동_특기사항", 2026, 2, "04", 2, "x", "나", ""]] };
  const career = { name: "진로활동관리 특기사항 ", rows: [["영역 구분", "학년도", "학년", "반", "번호", "학생개인번호", "성명", "특기사항", "희망분야"], ["진로활동_특기사항", 2026, 2, "04", 1.0, "x", "가", "진로 글.", "진로탐색 중임."]] };
  const { rows } = parseNeisRecordSheets([auto, career]);
  assert.deepEqual(rows.map(r => [r.sid, r.area, r.text]), [["20401", "autonomy", "자율 글."], ["20402", "autonomy", ""], ["20401", "career", "진로 글."]]);
});
test("줄마다 끝맺음 점검: 중간 줄의 임원 기록도 알림", async () => {
  const { checkRecordText } = await import("../src/recordText.js");
  const issues = checkRecordText("학급자치회 부회장(2026.08.13.-2027.02.28.)\n대토론회에서 학급 대표를 맡아 토론회를 이끎.\n교내 콘서트에서 연주함.");
  const ends = issues.filter(item => JSON.stringify(item).includes("문장 끝 확인"));
  assert.equal(ends.length, 1);
  assert.ok(issues.some(item => JSON.stringify(item).includes("임원 문장 완성")));
  assert.equal(checkRecordText("토론회를 이끎.\n콘서트에서 연주함.").filter(item => JSON.stringify(item).includes("문장 끝 확인")).length, 0);
});
test("행사 원문 줄 바꾸기", async () => {
  const { lineBreakEvents } = await import("../src/recordText.js");
  const a = "학급자치회 부회장(2026.08.13.-2027.02.28.)"; const b = "대토론회에서 학급 대표를 맡아 토론회를 이끎."; const c = "교내 콘서트에서 연주함.";
  assert.equal(lineBreakEvents(`${a} ${b} ${c}`, [a, b, c]), `${a}\n${b}\n${c}`);
  assert.equal(lineBreakEvents(`${a}\n${b}`, [a, b]), `${a}\n${b}`);
  assert.equal(lineBreakEvents(`직접 쓴 글. ${b} 덧붙인 글.`, [b]), `직접 쓴 글.\n${b}\n덧붙인 글.`);
});
test("AI 요청문: 여러 활동이면 줄 바꿈·억지 연결 금지, 진로희망 반영", async () => {
  const { buildAiPrompt } = await import("../src/recordText.js");
  const multi = buildAiPrompt({ area: "자율·자치활동", notes: [["a", "x"], ["b", "y"]], multi: true, hope: "건축가" });
  assert.ok(multi.includes("활동마다 줄을 바꿔"));
  assert.ok(multi.includes("'~에서는'"));
  assert.ok(multi.includes("[학생 진로희망] 건축가"));
  const one = buildAiPrompt({ area: "행동특성 및 종합의견", notes: [["a", "x"]] });
  assert.ok(!one.includes("활동마다 줄을 바꿔"));
  assert.ok(!one.includes("진로희망"));
});
test("같은 끝맺음 반복 알림, 요청문 다양성 규칙", async () => {
  const { checkRecordText, buildAiPrompt } = await import("../src/recordText.js");
  const has = t => checkRecordText(t).some(i => JSON.stringify(i).includes("같은 끝맺음 반복"));
  assert.equal(has("회의를 이끄는 모습이 돋보임. 자료를 정리하는 능력이 돋보임. 협력하는 태도가 돋보임."), true);
  assert.equal(has("회의를 이끎. 자료를 정리하는 능력이 돋보임. 협력하는 태도를 보임."), false);
  const pr = buildAiPrompt({ area: "자율·자치활동", notes: [["a", "x"]], hope: "건축가" });
  assert.ok(pr.includes("이해함")); assert.ok(pr.includes("문장 끝을 다양하게")); assert.ok(pr.includes("'~에 참여하여'")); assert.ok(pr.includes("자율·자치활동에서도 진로"));
});
