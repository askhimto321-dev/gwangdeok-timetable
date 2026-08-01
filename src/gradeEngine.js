// ============================================================
// 성적 계산 엔진 (Grade Computation Engine)
// 구글시트 "2026 광덕고 2학년 성적" 의 수식 로직을 그대로 재현합니다.
// 모든 함수는 순수 함수(pure function)로, 어떤 화면 프레임워크와도
// 독립적으로 동작하며 그대로 테스트할 수 있습니다.
// ============================================================

// ---------- 원본 데이터 파싱 (엑셀 '학기 성적' 시트 형식) ----------
// 시트 레이아웃: A~E = 학번,학년,학급,번호,이름
// F열부터 6칸씩 반복: 합계,원점수,성취도,석차등급,석차(동석차수),수강자수
// row1 = "과목N"/"학점수" 라벨, row2 = [과목명, 학점수, 교과, ,, ], row3 = 컬럼명, row4+ = 데이터
export function parseSemesterSheet(rows) {
  // rows: 2차원 배열 (엑셀 sheet_to_json header:1 형식), 0-indexed
  const students = {};
  const blocks = [];
  const headerRow = rows[1]; // row2 in 1-indexed = index 1
  let c = 5; // F = index 5 (0-indexed)
  while (c < headerRow.length) {
    const subj = headerRow[c];
    if (subj == null || subj === "") { c += 1; continue; }
    const credit = headerRow[c + 1];
    const category = headerRow[c + 2];
    blocks.push({ col: c, subject: subj, credit: Number(credit) || 0, category });
    c += 6;
  }
  for (let r = 3; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const sid = row[0];
    if (!sid) continue;
    const subjects = [];
    blocks.forEach(({ col, subject, credit, category }) => {
      const raw = row[col];
      if (raw === null || raw === undefined || raw === "") return;
      subjects.push({
        subject, credit, category,
        raw: Number(raw),
        score: row[col + 1] != null ? Number(row[col + 1]) : null,
        achievement: row[col + 2] ?? null,
        grade5: row[col + 3],
        rank: row[col + 4] ?? null,
        classSize: row[col + 5] ?? null,
      });
    });
    students[String(sid).trim()] = {
      name: row[4], grade: row[1], class: row[2], number: row[3], subjects,
    };
  }
  return students;
}

// ---------- 5등급 → 9등급 변환 ----------
// 5등급제(n) → 9등급제(2n-1): 1→1, 2→3, 3→5, 4→7, 5→9
export function grade5to9(g5) {
  if (typeof g5 !== "number" || isNaN(g5)) return null;
  return 2 * g5 - 1;
}

// ---------- 계열별 평균 등급 (학점 가중평균) ----------
// categoryRegex 예: /국어|수학|영어|사회|과학|기술가정\/정보|제2외국어/  (전과목)
//                    /국어|영어|수학/ (국영수) 등
const SUBJECT_GROUPS = {
  전과목: /국어|수학|영어|사회|과학|기술가정\/정보|제2외국어/,
  국영수사과: /국어|수학|영어|사회|과학/,
  국영수사: /국어|영어|수학|사회/,
  국영수과: /국어|영어|수학|과학/,
  국영수: /국어|영어|수학/,
  국영사: /국어|영어|사회/,
  국영과: /국어|영어|과학/,
  영수사: /영어|수학|사회/,
  영수과: /영어|수학|과학/,
};

export function weightedAverageGrade(subjects, categoryRegex) {
  const matched = subjects.filter(s => categoryRegex.test(s.category) && typeof s.grade5 === "number");
  if (!matched.length) return null;
  const num = matched.reduce((sum, s) => sum + s.credit * s.grade5, 0);
  const den = matched.reduce((sum, s) => sum + s.credit, 0);
  if (den === 0) return null;
  return Math.round((num / den) * 100) / 100;
}

// studentSemesters: array of subjects-arrays (e.g. [1학기 subjects, 2학기 subjects, ...])
// returns { [groupName]: { perSemester5: [...], avg5, perSemester9: [...], avg9 } }
export function computeAllGroupAverages(semesterSubjectLists) {
  const result = {};
  Object.entries(SUBJECT_GROUPS).forEach(([name, regex]) => {
    const per5 = semesterSubjectLists.map(subs => (subs ? weightedAverageGrade(subs, regex) : null));
    const per9 = per5.map(g => (g == null ? null : Math.round(grade5to9(g) * 100) / 100));
    const valid5 = per5.filter(v => v != null);
    const valid9 = per9.filter(v => v != null);
    result[name] = {
      perSemester5: per5,
      avg5: valid5.length ? Math.round((valid5.reduce((a, b) => a + b, 0) / valid5.length) * 100) / 100 : null,
      perSemester9: per9,
      avg9: valid9.length ? Math.round((valid9.reduce((a, b) => a + b, 0) / valid9.length) * 100) / 100 : null,
    };
  });
  return result;
}

// ---------- 모의고사 2합/3합/4합 (한국사 제외, 최적 조합 자동 선택) ----------
// mockGrades: { 국어, 수학, 영어, 한국사, 통합사회, 통합과학 } (등급 숫자, 없으면 null/undefined)
function combinations(arr, k) {
  const results = [];
  const combo = (start, chosen) => {
    if (chosen.length === k) { results.push([...chosen]); return; }
    for (let i = start; i < arr.length; i++) { chosen.push(arr[i]); combo(i + 1, chosen); chosen.pop(); }
  };
  combo(0, []);
  return results;
}

export function computeMockExamSums(mockGrades) {
  const { 국어, 수학, 영어, 통합사회, 통합과학 } = mockGrades;
  const candidates = [
    ["국어", 국어], ["수학", 수학], ["영어", 영어], ["통합사회", 통합사회], ["통합과학", 통합과학],
  ].filter(([, v]) => typeof v === "number");

  const sumOf = (pairsList) => {
    if (!pairsList.length) return null;
    return Math.min(...pairsList.map(combo => combo.reduce((s, [, v]) => s + v, 0)));
  };

  const sum2 = candidates.length >= 2 ? sumOf(combinations(candidates, 2)) : null;
  const sum3 = candidates.length >= 3 ? sumOf(combinations(candidates, 3)) : null;
  // 4합: 국+수+영 고정 + 탐구(사회/과학) 중 더 좋은(작은) 값 1개
  let sum4 = null;
  if (typeof 국어 === "number" && typeof 수학 === "number" && typeof 영어 === "number") {
    const tamgu = [통합사회, 통합과학].filter(v => typeof v === "number");
    if (tamgu.length) sum4 = 국어 + 수학 + 영어 + Math.min(...tamgu);
  }
  return { sum2, sum3, sum4 };
}

// ---------- 수능 최저 도달 대학 매칭 ----------
// admissionRows: [{ university, requiredSubjectCount: 2|3|4, requiredSum: number|string, note }]
//   requiredSum이 "5~6" 같은 범위 텍스트면 그 중 최댓값을 기준으로 판정 (관대한 쪽)
//   requiredSubjectCount가 없거나(최저없음) note에 "각"이 포함되면(각 과목 개별 기준) 제외
export function matchUniversities(sums, admissionRows) {
  const { sum2, sum3, sum4 } = sums;
  const matched = new Set();
  admissionRows.forEach(row => {
    if (!row.university) return;
    if (!row.requiredSubjectCount || row.requiredSubjectCount === "" || row.requiredSum == null || row.requiredSum === "") return;
    if (String(row.note || "").includes("각")) return; // "각 3등급 이내" 같은 개별-과목 기준은 합산 매칭 대상 아님
    const studentSum = { 2: sum2, 3: sum3, 4: sum4 }[Number(row.requiredSubjectCount)];
    if (studentSum == null) return;
    const nums = String(row.requiredSum).match(/\d+(\.\d+)?/g);
    if (!nums) return;
    const threshold = Math.max(...nums.map(Number));
    if (studentSum <= threshold) matched.add(row.university);
  });
  return Array.from(matched);
}

// ---------- 성적 분석 코멘트 자동 생성 ----------
export function gradeAnalysisComment(overallAvg5, sum2, sum3, sum4) {
  if (overallAvg5 == null) return "내신 성적을 입력해 주세요.";
  if (overallAvg5 > 3) return "내신 성적을 보고 내신 성적 관리를 더 해주세요.";
  const needMock =
    sum2 == null || sum2 === 0 ||
    (overallAvg5 <= 1.7 && (sum3 == null || sum3 === 0)) ||
    (overallAvg5 <= 1.3 && (sum4 == null || sum4 === 0));
  if (needMock) return "모의고사 성적을 입력해 주세요.";

  let adequate = false;
  if (overallAvg5 >= 1 && overallAvg5 <= 1.3) adequate = sum2 <= 4 && sum3 <= 6 && sum4 <= 9;
  else if (overallAvg5 <= 1.5) adequate = sum2 <= 5 && sum3 <= 7;
  else if (overallAvg5 <= 1.7) adequate = sum2 <= 6 && sum3 <= 8;
  else if (overallAvg5 <= 2) adequate = sum2 <= 6;
  else if (overallAvg5 <= 3) adequate = sum2 <= 7;

  return adequate
    ? "내신과 수능 최저가 적정한 상황입니다. 고3 및 실제 수능에는 N수생에 의해 현재 등급보다 더 낮아질 수 있으므로 꾸준히 모의고사 성적을 유지하시기 바랍니다."
    : "내신에 비해 수능 최저가 미흡한 상황입니다. 수능 최저를 맞추지 못한다면 본인 내신 성적에 비해 입결이 낮은 학교를 지원해야 하는 상황이 올 수도 있으므로 모의고사 성적을 신경 쓰기 바랍니다.";
}
