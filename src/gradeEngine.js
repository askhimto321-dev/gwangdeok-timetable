// ============================================================
// 성적 계산 엔진 (Grade Computation Engine)
// 구글시트 성적 자료의 계산 로직을 화면과 분리해 둔 순수 함수 모음입니다.
// 2025학년도 입학생부터 적용되는 5등급제와 그 이전 9등급제를
// 입학연도에 따라 구분합니다. 5등급제 학생은 원등급과 별도의
// 9등급 환산값을 함께 제공하고, 9등급제 학생은 원자료를 그대로 사용합니다.
// ============================================================

// ---------- 교과(계열) 자동 추론 ----------
// 일부 시트는 "교과" 칸이 비어 있거나 예전 명칭으로 저장되어 있으므로
// 과목명과 원본 교과명을 함께 보고 표준 교과명으로 정규화합니다.
const CATEGORY_KEYWORDS = [
  ["한국사", /한국사/],
  // "중국어"에 "국어"가 포함되므로 제2외국어/한문을 국어보다 먼저 판별합니다.
  ["제2외국어/한문", /제2\s*외국어|일본어|중국어|독일어|프랑스어|스페인어|러시아어|아랍어|베트남어|한문/],
  // "정보과학"처럼 과학이 포함된 과목이 과학으로 잘못 분류되지 않도록 먼저 판별합니다.
  ["기술가정/정보", /기술[·\s/]*가정|가정\s*과학|정보|인공지능|프로그래밍|데이터\s*과학|지식\s*재산|아동\s*발달/],
  ["국어", /국어|문학|독서|화법|작문|언어와\s*매체|매체|고전\s*읽기/],
  ["수학", /수학|대수|미적분|기하|확률과\s*통계/],
  ["영어", /영어/],
  ["과학", /과학|물리|화학|생명|지구과학/],
  ["사회", /사회|정치|법과|경제|역사|지리|윤리|세계시민|여행지리|현대\s*세계/],
];

export function inferCategory(subjectName) {
  const name = String(subjectName || "");
  for (const [cat, re] of CATEGORY_KEYWORDS) {
    if (re.test(name)) return cat;
  }
  return null;
}

export function normalizeCategory(category, subjectName = "") {
  const raw = String(category || "").replace(/\s/g, "");
  if (/^한국사$/.test(raw)) return "한국사";
  if (/제2외국어|일본어|중국어|한문|독일어|프랑스어|스페인어|러시아어|아랍어|베트남어/.test(raw)) return "제2외국어/한문";
  if (/기술.?가정|가정|정보|인공지능|프로그래밍|데이터과학|지식재산|아동발달/.test(raw)) return "기술가정/정보";
  if (/국어|문학|독서|화법|작문|언어/.test(raw)) return "국어";
  if (/영어/.test(raw)) return "영어";
  if (/수학|대수|미적분|기하|확률/.test(raw)) return "수학";
  if (/사회|한국사|역사|지리|윤리|정치|경제/.test(raw)) return raw === "한국사" ? "한국사" : "사회";
  if (/과학|물리|화학|생명|지구/.test(raw)) return "과학";
  return inferCategory(subjectName) || "기타";
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// 기존 Firebase 데이터는 grade5라는 이름으로 저장되어 있으므로 호환해서 읽습니다.
// 새로 업로드되는 데이터에는 grade와 grade5를 함께 기록합니다.
export function getSubjectGrade(subject) {
  if (!subject) return null;
  return toNumberOrNull(subject.grade ?? subject.grade5);
}

// ---------- 원본 데이터 파싱 (엑셀 '학기 성적' 시트 형식) ----------
// 시트 레이아웃: A~E = 학번,학년,학급,번호,이름
// F열부터 6칸씩 반복: 합계,원점수,성취도,석차등급,석차(동석차수),수강자수
// row1 = "과목N"/"학점수" 라벨, row2 = [과목명, 학점수, 교과, ,, ], row3 = 컬럼명, row4+ = 데이터
export function parseSemesterSheet(rows) {
  const students = {};
  const blocks = [];
  const headerRow = rows[1] || [];
  let c = 5; // F열, 0-indexed

  while (c < headerRow.length) {
    const subj = headerRow[c];
    if (subj == null || subj === "") {
      c += 1;
      continue;
    }
    const credit = headerRow[c + 1];
    const category = headerRow[c + 2] || inferCategory(subj);
    blocks.push({ col: c, subject: String(subj).trim(), credit: Number(credit) || 0, category });
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
      const grade = toNumberOrNull(row[col + 3]);
      subjects.push({
        subject,
        credit,
        category: normalizeCategory(category, subject),
        raw: toNumberOrNull(raw),
        score: toNumberOrNull(row[col + 1]),
        achievement: row[col + 2] ?? null,
        grade,
        grade5: grade, // 기존 화면/저장 데이터와의 하위 호환
        rank: row[col + 4] ?? null,
        classSize: row[col + 5] ?? null,
      });
    });

    students[String(sid).trim().replace(/\.0$/, "")] = {
      name: row[4],
      grade: toNumberOrNull(row[1]) ?? row[1],
      class: toNumberOrNull(row[2]) ?? row[2],
      number: toNumberOrNull(row[3]) ?? row[3],
      subjects,
    };
  }
  return students;
}

// ---------- 5등급 → 9등급 참고 변환 ----------
// 기존 코드와의 호환을 위해 남겨두되, 화면 평균 계산에는 사용하지 않습니다.
export function grade5to9(g5) {
  const n = toNumberOrNull(g5);
  return n == null ? null : 2 * n - 1;
}

// ---------- 교과·계열별 평균 등급 (학점 가중평균) ----------
// 개인 교과 5개를 먼저 제시하고, 기존 조합별 평균을 이어서 계산합니다.
export const SUBJECT_GROUPS = {
  국어: /^국어$/,
  영어: /^영어$/,
  수학: /^수학$/,
  사회: /^(사회|한국사)$/,
  과학: /^과학$/,
  "기술가정/정보": /^기술가정\/정보$/,
  "제2외국어/한문": /^제2외국어\/한문$/,
  전과목: /국어|수학|영어|사회|한국사|과학|기술가정\/정보|제2외국어\/한문/,
  국영수사과: /국어|수학|영어|사회|한국사|과학/,
  국영수사: /국어|영어|수학|사회|한국사/,
  국영수과: /국어|영어|수학|과학/,
  국영수: /국어|영어|수학/,
  국영사: /국어|영어|사회|한국사/,
  국영과: /국어|영어|과학/,
  영수사: /영어|수학|사회|한국사/,
  영수과: /영어|수학|과학/,
};

export function weightedAverageGrade(subjects, categoryRegex) {
  const matched = (subjects || []).filter(subject => {
    const grade = getSubjectGrade(subject);
    return grade != null && categoryRegex.test(normalizeCategory(subject.category, subject.subject));
  });
  if (!matched.length) return null;

  const numerator = matched.reduce((sum, subject) => sum + (Number(subject.credit) || 0) * getSubjectGrade(subject), 0);
  const denominator = matched.reduce((sum, subject) => sum + (Number(subject.credit) || 0), 0);
  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
}

export function weightedAverageAllGrades(subjects) {
  const matched = (subjects || []).filter(subject => getSubjectGrade(subject) != null);
  if (!matched.length) return null;

  const credits = matched.map(subject => Number(subject.credit) || 0);
  const hasCredits = credits.some(credit => credit > 0);
  const numerator = matched.reduce((sum, subject, index) => {
    const weight = hasCredits ? credits[index] : 1;
    return sum + weight * getSubjectGrade(subject);
  }, 0);
  const denominator = matched.reduce((sum, _subject, index) => sum + (hasCredits ? credits[index] : 1), 0);
  return denominator ? Math.round((numerator / denominator) * 100) / 100 : null;
}

// semesterSubjectLists: [1-1 subjects, 1-2 subjects, ...]
// gradeSystem=5인 학생은 원 5등급과 9등급 환산값을 함께 계산합니다.
// gradeSystem=9인 학생은 원 9등급만 사용하며 5등급으로 역환산하지 않습니다.
export function computeAllGroupAverages(semesterSubjectLists, gradeSystem = 5) {
  const result = {};
  const average = values => {
    const valid = values.filter(value => value != null);
    return valid.length
      ? Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 100) / 100
      : null;
  };

  Object.entries(SUBJECT_GROUPS).forEach(([name, regex]) => {
    const sourcePerSemester = semesterSubjectLists.map(subjects => (subjects ? weightedAverageGrade(subjects, regex) : null));
    const sourceAverage = average(sourcePerSemester);

    const perSemester5 = Number(gradeSystem) === 5 ? sourcePerSemester : sourcePerSemester.map(() => null);
    const perSemester9 = Number(gradeSystem) === 5
      ? sourcePerSemester.map(value => (value == null ? null : Math.round(grade5to9(value) * 100) / 100))
      : sourcePerSemester;

    result[name] = {
      perSemester: sourcePerSemester,
      avg: sourceAverage,
      perSemester5,
      avg5: Number(gradeSystem) === 5 ? average(perSemester5) : null,
      perSemester9,
      avg9: average(perSemester9),
    };
  });
  return result;
}

// ---------- 모의고사 2합/3합/4합 (한국사 제외, 최적 조합 자동 선택) ----------
function combinations(arr, k) {
  const results = [];
  const combo = (start, chosen) => {
    if (chosen.length === k) {
      results.push([...chosen]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      chosen.push(arr[i]);
      combo(i + 1, chosen);
      chosen.pop();
    }
  };
  combo(0, []);
  return results;
}

export function computeMockExamSums(mockGrades) {
  const { 국어, 수학, 영어, 통합사회, 통합과학 } = mockGrades || {};
  const candidates = [
    ["국어", 국어],
    ["수학", 수학],
    ["영어", 영어],
    ["통합사회", 통합사회],
    ["통합과학", 통합과학],
  ].map(([name, value]) => [name, toNumberOrNull(value)]).filter(([, value]) => value != null);

  const sumOf = pairsList => {
    if (!pairsList.length) return null;
    return Math.min(...pairsList.map(combo => combo.reduce((sum, [, value]) => sum + value, 0)));
  };

  // 일부 대학은 1개 영역 등급만 요구하므로 1합도 함께 계산합니다.
  const sum1 = candidates.length ? Math.min(...candidates.map(([, value]) => value)) : null;
  const sum2 = candidates.length >= 2 ? sumOf(combinations(candidates, 2)) : null;
  const sum3 = candidates.length >= 3 ? sumOf(combinations(candidates, 3)) : null;

  let sum4 = null;
  const korean = toNumberOrNull(국어);
  const math = toNumberOrNull(수학);
  const english = toNumberOrNull(영어);
  if (korean != null && math != null && english != null) {
    const inquiry = [toNumberOrNull(통합사회), toNumberOrNull(통합과학)].filter(value => value != null);
    if (inquiry.length) sum4 = korean + math + english + Math.min(...inquiry);
  }
  return { sum1, sum2, sum3, sum4 };
}

function extractAdmissionCount(value, requiredSum = "") {
  const direct = toNumberOrNull(value);
  if (direct != null) return direct;
  const text = `${String(value ?? "")} ${String(requiredSum ?? "")}`;
  const match = text.match(/([1-4])\s*(?:개\s*영역\s*)?합/);
  if (match) return Number(match[1]);
  const firstNumber = text.match(/\b([1-4])\b/);
  return firstNumber ? Number(firstNumber[1]) : null;
}

function extractAdmissionThreshold(value, count) {
  const text = String(value ?? "");
  if (count != null) {
    const specific = text.match(new RegExp(`${Number(count)}\\s*합\\s*([0-9]+(?:\\.[0-9]+)?)`));
    if (specific) return Number(specific[1]);
  }
  const nums = text.match(/\d+(?:\.\d+)?/g);
  if (!nums?.length) return null;
  // "2합 4"처럼 영역 수가 문자열에 함께 적힌 경우 첫 숫자는 영역 수이므로 마지막 값을 사용합니다.
  return Number(nums[nums.length - 1]);
}

// ---------- 수능 최저 도달 대학 매칭 ----------
export function matchUniversities(sums, admissionRows) {
  const { sum1, sum2, sum3, sum4 } = sums;
  const matched = new Set();

  (admissionRows || []).forEach(row => {
    if (!row.university) return;
    const count = extractAdmissionCount(row.requiredSubjectCount, row.requiredSum);
    if (!count || row.requiredSum == null || row.requiredSum === "") return;
    if (String(row.note || "").includes("각")) return;

    const studentSum = { 1: sum1, 2: sum2, 3: sum3, 4: sum4 }[count];
    if (studentSum == null) return;
    const threshold = extractAdmissionThreshold(row.requiredSum, count);
    if (threshold == null) return;
    if (studentSum <= threshold) matched.add(row.university);
  });
  return Array.from(matched);
}

// ---------- 대학별 수능 최저 개별 판정 ----------
export function evaluateAdmissionRequirement(row, sums) {
  const university = String(row?.university || "").trim();
  const count = extractAdmissionCount(row?.requiredSubjectCount, row?.requiredSum);
  const threshold = extractAdmissionThreshold(row?.requiredSum, count);
  const studentSum = count == null ? null : ({ 1: sums?.sum1, 2: sums?.sum2, 3: sums?.sum3, 4: sums?.sum4 }[Number(count)] ?? null);
  const note = String(row?.note || "");

  if (!university) return { status: "invalid", satisfied: null, studentSum, threshold, count };
  if (!count || threshold == null) return { status: "no-minimum", satisfied: true, studentSum, threshold, count };
  if (note.includes("각")) return { status: "manual", satisfied: null, studentSum, threshold, count };
  if (studentSum == null) return { status: "unavailable", satisfied: null, studentSum, threshold, count };
  return {
    status: studentSum <= threshold ? "satisfied" : "unsatisfied",
    satisfied: studentSum <= threshold,
    studentSum,
    threshold,
    count,
  };
}

// ---------- 성적 분석 코멘트 자동 생성 ----------
// 기존 상담 기준은 5등급제 기준입니다. 9등급제 학생은 화면에서 명확히 분리하되,
// 상담 문구 계산 시에만 대략적인 5등급 대응값으로 정규화해 기존 기준을 유지합니다.
export function gradeAnalysisComment(overallAverage, sum2, sum3, sum4, gradeSystem = 5) {
  if (overallAverage == null) return "내신 성적을 입력해 주세요.";
  const normalizedAverage = Number(gradeSystem) === 9 ? (overallAverage + 1) / 2 : overallAverage;

  if (normalizedAverage > 3) return "내신 성적을 보고 내신 성적 관리를 더 해주세요.";
  const needMock =
    sum2 == null || sum2 === 0 ||
    (normalizedAverage <= 1.7 && (sum3 == null || sum3 === 0)) ||
    (normalizedAverage <= 1.3 && (sum4 == null || sum4 === 0));
  if (needMock) return "모의고사 성적을 입력해 주세요.";

  let adequate = false;
  if (normalizedAverage >= 1 && normalizedAverage <= 1.3) adequate = sum2 <= 4 && sum3 <= 6 && sum4 <= 9;
  else if (normalizedAverage <= 1.5) adequate = sum2 <= 5 && sum3 <= 7;
  else if (normalizedAverage <= 1.7) adequate = sum2 <= 6 && sum3 <= 8;
  else if (normalizedAverage <= 2) adequate = sum2 <= 6;
  else if (normalizedAverage <= 3) adequate = sum2 <= 7;

  return adequate
    ? "내신과 수능 최저가 적정한 상황입니다. 고3 및 실제 수능에는 N수생에 의해 현재 등급보다 더 낮아질 수 있으므로 꾸준히 모의고사 성적을 유지하시기 바랍니다."
    : "내신에 비해 수능 최저가 미흡한 상황입니다. 수능 최저를 맞추지 못한다면 본인 내신 성적에 비해 입결이 낮은 학교를 지원해야 하는 상황이 올 수도 있으므로 모의고사 성적을 신경 쓰기 바랍니다.";
}
