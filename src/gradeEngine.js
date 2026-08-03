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

// ---------- 2022 개정 교육과정 과목 유형 자동 추론 ----------
// 현재 성적 원본에는 과목 유형 열이 없으므로 과목명을 기준으로 공통과목,
// 일반선택, 진로선택, 융합선택을 판별합니다. 이전 교육과정 명칭도 함께 지원합니다.
const SUBJECT_TYPE_RULES = [
  ["공통과목", /^(공통국어[12]?|공통수학[12]?|공통영어[12]?|한국사[12]?|통합사회[12]?|통합과학[12]?|과학탐구실험[12]?)$/],
  ["융합선택", /(독서토론과글쓰기|매체의사소통|언어생활탐구|수학과문화|실용통계|수학과제탐구|실생활영어회화|미디어영어|세계문화와영어|여행지리|역사로탐구하는현대세계|사회문제탐구|금융과경제생활|윤리문제탐구|기후변화와지속가능한세계|과학의역사와문화|기후변화와환경생태|융합과학탐구|스포츠생활[12]?|스포츠와문화|음악과미디어|미술과매체|창의공학설계|지식재산일반|생명과학실험|아동발달과부모|소프트웨어와생활|독일어권문화|프랑스어권문화|스페인어권문화|중국문화|일본문화|러시아문화|아랍문화|베트남문화|언어생활과한자|인간과경제활동|논술)$/],
  ["진로선택", /(주제탐구독서|문학과영상|직무의사소통|기하|미적분Ⅱ|미적분2|경제수학|인공지능수학|직무수학|영미문학읽기|영어발표와토론|심화영어|심화영어독해와작문|직무영어|한국지리탐구|도시의미래탐구|동아시아역사기행|정치|법과사회|경제|윤리와사상|인문학과윤리|국제관계의이해|역학과에너지|전자기와양자|물질과에너지|화학반응의세계|세포와물질대사|생물의유전|지구시스템과학|행성우주과학|운동과건강|음악연주와창작|음악감상과비평|미술창작|미술감상과비평|로봇과공학세계|생활과학탐구|인공지능기초|데이터과학|독일어회화|프랑스어회화|스페인어회화|중국어회화|일본어회화|러시아어회화|아랍어회화|베트남어회화|한문고전읽기|인간과철학|논리와사고|인간과심리|교육의이해|삶과종교|보건|생태와환경|진로와직업)$/],
  ["일반선택", /(화법과언어|독서와작문|문학|대수|미적분Ⅰ|미적분1|확률과통계|영어Ⅰ|영어1|영어Ⅱ|영어2|영어독해와작문|세계시민과지리|세계사|사회와문화|현대사회와윤리|물리학|화학|생명과학|지구과학|체육[12]?|스포츠문화|스포츠과학|음악|미술|연극|기술.?가정|정보|독일어|프랑스어|스페인어|중국어|일본어|러시아어|아랍어|베트남어|한문|철학|논리학|심리학|교육학|종교학|진로와직업|생태와환경)$/],
];

export function inferSubjectType(subjectName, explicitType = "") {
  const explicit = String(explicitType || "").replace(/\s/g, "");
  if (/공통/.test(explicit)) return "공통과목";
  if (/일반/.test(explicit)) return "일반선택";
  if (/진로/.test(explicit)) return "진로선택";
  if (/융합/.test(explicit)) return "융합선택";

  const compact = String(subjectName || "")
    .replace(/[·ㆍ\s_-]/g, "")
    .replace(/I{1,3}$/i, match => ({ I: "Ⅰ", II: "Ⅱ", III: "Ⅲ" }[match.toUpperCase()] || match));
  for (const [type, pattern] of SUBJECT_TYPE_RULES) {
    if (pattern.test(compact)) return type;
  }
  return "기타";
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
        subjectType: inferSubjectType(subject),
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
  return {
    sum1, sum2, sum3, sum4,
    subjectGrades: {
      국어: toNumberOrNull(국어),
      수학: toNumberOrNull(수학),
      영어: toNumberOrNull(영어),
      통합사회: toNumberOrNull(통합사회),
      통합과학: toNumberOrNull(통합과학),
    },
  };
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


const ADMISSION_SUBJECT_ALIASES = {
  "국": "국어", "국어": "국어",
  "수": "수학", "수학": "수학",
  "영": "영어", "영어": "영어",
  "사": "통합사회", "사회": "통합사회", "통합사회": "통합사회",
  "과": "통합과학", "과학": "통합과학", "통합과학": "통합과학",
  "한": "한국사", "한국사": "한국사",
};

function normalizeAdmissionSubjectToken(token) {
  const raw = String(token || "")
    .replace(/\s+/g, "")
    .replace(/영역|과목|등급|반영/g, "")
    .trim();
  if (!raw) return null;
  if (/^(탐|탐구|사회과학|사과)$/.test(raw)) return "탐구";
  return ADMISSION_SUBJECT_ALIASES[raw] || null;
}

function extractAdmissionSubjectTokens(text) {
  const compact = String(text || "").replace(/\s+/g, "");
  if (!compact) return [];
  const matches = compact.match(/통합사회|통합과학|한국사|국어|수학|영어|사회|과학|탐구|[국수영사과한탐]/g) || [];
  return matches.map(normalizeAdmissionSubjectToken).filter(Boolean);
}

// 수능 최저 반영과목 문구를 계산 가능한 그룹으로 바꿉니다.
// 예: "국,수,영,(사,과)" → 국어 / 수학 / 영어 / 사회·과학 중 우수 1개
export function parseAdmissionSubjectGroups(value) {
  const original = String(value || "").trim();
  if (!original || original === "-") return [];

  const groups = [];
  const placeholders = [];
  const withoutParentheses = original.replace(/\(([^)]+)\)/g, (_all, inner) => {
    const tokens = Array.from(new Set(extractAdmissionSubjectTokens(inner)));
    if (tokens.length) {
      const index = placeholders.length;
      placeholders.push(tokens);
      return ` __CHOICE_${index}__ `;
    }
    return " ";
  });

  const chunks = withoutParentheses
    .split(/(__CHOICE_\d+__)/)
    .map(chunk => chunk.trim())
    .filter(Boolean);

  chunks.forEach(chunk => {
    const choiceMatch = chunk.match(/^__CHOICE_(\d+)__$/);
    if (choiceMatch) {
      const subjects = placeholders[Number(choiceMatch[1])] || [];
      if (subjects.length === 1) groups.push({ type: "single", subjects });
      else if (subjects.length > 1) groups.push({ type: "choice", subjects });
      return;
    }
    extractAdmissionSubjectTokens(chunk).forEach(subject => {
      if (subject === "탐구") {
        groups.push({ type: "choice", subjects: ["통합사회", "통합과학"] });
      } else {
        groups.push({ type: "single", subjects: [subject] });
      }
    });
  });

  const seen = new Set();
  return groups.filter(group => {
    const key = `${group.type}:${group.subjects.join("|")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function adjustedAdmissionGrade(subject, value, row) {
  const grade = toNumberOrNull(value);
  if (grade == null) return null;
  const ruleText = `${String(row?.requiredSum ?? "")} ${String(row?.note ?? "")}`
    .replace(/\s+/g, " ")
    .trim();

  // 경기대 등 일부 대학은 영어 1·2등급을 모두 1등급으로 환산합니다.
  // 이 문구를 "2개 과목 각 1등급" 조건으로 오해하지 않고 영어 환산에만 적용합니다.
  const englishOneTwoAsOne = /영어[^.\n]{0,35}(?:1\s*[,·/\-]?\s*2|1\s*~\s*2)\s*등급[^.\n]{0,35}(?:모두|동일|각각)?[^.\n]{0,15}1\s*등급(?:으로)?\s*(?:반영|환산|처리)/.test(ruleText)
    || /영어\s*1\s*등급과?\s*2\s*등급[^.\n]{0,25}1\s*등급/.test(ruleText);
  if (subject === "영어" && englishOneTwoAsOne && grade <= 2) return 1;
  return grade;
}

function admissionSubjectValue(group, mockGrades, row) {
  const values = (group?.subjects || [])
    .map(subject => adjustedAdmissionGrade(subject, mockGrades?.[subject], row))
    .filter(value => value != null);
  if (!values.length) return null;
  return group.type === "choice" ? Math.min(...values) : values[0];
}

function computeAdmissionStudentGrades(row, mockGrades, count) {
  const groups = parseAdmissionSubjectGroups(row?.requiredSubjects);
  if (!groups.length || !mockGrades || !count) return null;

  const values = groups
    .map(group => admissionSubjectValue(group, mockGrades, row))
    .filter(value => value != null)
    .sort((a, b) => a - b);

  if (values.length < count) return null;
  return values.slice(0, count);
}

function extractAdmissionEachRule(row) {
  const text = `${String(row?.requiredSum ?? "")} ${String(row?.note ?? "")}`
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;

  // "3개 과목 각 3등급 이내"처럼 과목/영역 수가 명시된 경우만 개별 과목 기준으로 봅니다.
  // "영어 1,2등급은 모두 1등급으로 반영" 같은 환산 문구는 개별 2개 과목 조건이 아닙니다.
  const countMatch = text.match(/(?:각\s*)?(\d+)\s*개\s*(?:과목|영역)/)
    || text.match(/(?:과목|영역)\s*(\d+)\s*개/);
  if (!countMatch) return null;

  const thresholdMatch = text.match(/각(?:각)?\s*(\d+(?:\.\d+)?)\s*등급(?:\s*이내)?/)
    || text.match(/모두\s*(\d+(?:\.\d+)?)\s*등급(?:\s*이내)?/)
    || text.match(/각(?:각)?[^0-9]{0,12}(\d+(?:\.\d+)?)\s*등급(?:\s*이내)?/);
  if (!thresholdMatch) return null;

  const count = Number(countMatch[1]);
  const threshold = Number(thresholdMatch[1]);
  if (!count || !Number.isFinite(threshold)) return null;
  return { count, threshold };
}

function computeAdmissionStudentSum(row, sums, mockGrades) {
  const count = extractAdmissionCount(row?.requiredSubjectCount, row?.requiredSum);
  if (!count) return null;

  const grades = computeAdmissionStudentGrades(row, mockGrades, count);
  if (grades) return grades.reduce((total, value) => total + value, 0);

  return ({ 1: sums?.sum1, 2: sums?.sum2, 3: sums?.sum3, 4: sums?.sum4 }[Number(count)] ?? null);
}

// ---------- 수능 최저 도달 대학 매칭 ----------
export function matchUniversities(sums, admissionRows) {
  const matched = new Set();

  (admissionRows || []).forEach(row => {
    if (!row.university) return;
    const result = evaluateAdmissionRequirement(row, sums, sums?.subjectGrades);
    if (result.status === "satisfied") matched.add(row.university);
  });
  return Array.from(matched);
}

// ---------- 대학별 수능 최저 개별 판정 ----------
export function evaluateAdmissionRequirement(row, sums, mockGrades = null) {
  const university = String(row?.university || "").trim();
  const eachRule = extractAdmissionEachRule(row);
  const count = eachRule?.count ?? extractAdmissionCount(row?.requiredSubjectCount, row?.requiredSum);
  const threshold = eachRule?.threshold ?? extractAdmissionThreshold(row?.requiredSum, count);
  const studentGrades = eachRule ? computeAdmissionStudentGrades(row, mockGrades, count) : null;
  const studentSum = eachRule
    ? (studentGrades ? studentGrades.reduce((total, value) => total + value, 0) : null)
    : (count == null ? null : computeAdmissionStudentSum(row, sums, mockGrades));
  const note = String(row?.note || "");

  if (!university) return { status: "invalid", satisfied: null, studentSum, studentGrades, threshold, count, ruleType: eachRule ? "each" : "sum" };
  if (!count || threshold == null) return { status: "no-minimum", satisfied: true, studentSum, studentGrades, threshold, count, ruleType: eachRule ? "each" : "sum" };

  if (eachRule) {
    if (!studentGrades) {
      return { status: "unavailable", satisfied: null, studentSum, studentGrades, threshold, count, ruleType: "each" };
    }
    const satisfied = studentGrades.every(value => value <= threshold);
    return {
      status: satisfied ? "satisfied" : "unsatisfied",
      satisfied,
      studentSum,
      studentGrades,
      threshold,
      count,
      ruleType: "each",
    };
  }

  // 단순 환산 문구의 "각각"을 수동 판정 조건으로 오해하지 않습니다.
  // 명시적인 "N개 과목/영역 각 M등급" 형식은 위 extractAdmissionEachRule에서 이미 처리됩니다.
  if (/(?:\d+\s*개\s*(?:과목|영역))[^.\n]{0,25}각/.test(note)) {
    return { status: "manual", satisfied: null, studentSum, studentGrades, threshold, count, ruleType: "sum" };
  }
  if (studentSum == null) return { status: "unavailable", satisfied: null, studentSum, studentGrades, threshold, count, ruleType: "sum" };
  return {
    status: studentSum <= threshold ? "satisfied" : "unsatisfied",
    satisfied: studentSum <= threshold,
    studentSum,
    studentGrades,
    threshold,
    count,
    ruleType: "sum",
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
