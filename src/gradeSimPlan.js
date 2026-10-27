// 성적 시뮬레이터 자동 채우기: 시간표에서 읽은 남은 학기 수강 과목을 시뮬레이션 과목 줄로 바꿉니다.
// - 이름: 시간표 약칭(미창22·독작·스문)을 교육과정 편제표의 정식 과목명으로 바꿉니다.
// - 제외: 체육·예술·창체·교양·과학탐구실험처럼 석차등급이 없는 과목은 넣지 않습니다.
// - 학점: 편제표 학점 → 주당 시수 → 지난 학기 같은 과목 학점 → 지난 학기에 가장 흔한 학점 순.
// - 석차등급: 지난 학기 같은 교과 평균(없으면 전체 평균)을 반올림해 '지금 수준 유지'로 채웁니다.
import { normalizeCategory, getSubjectGrade } from "./gradeEngine.js";
import { officialSubjectName, curriculumSubjects } from "./curriculum.js";

const nameKey = value => String(value || "").normalize("NFKC").replace(/[\s·ㆍ()（）]/g, "").replace(/[ⅠI]$/, "1").replace(/[ⅡII]$/, "2").toLowerCase();

// 석차등급을 내지 않는 과목(체육·예술, 과학탐구실험, 창체·자습, 2022 교양 교과)
const NON_GRADED = [
  /체육|스포츠|음악|미술|연극|예술|운동/,
  /과학탐구실험/,
  /^(자율|자습|자치|창체|창의적체험|동아리|진로활동|봉사|HR|조회|종례|스문|스생|스과)/,
  /^(진로와\s?직업|생태와\s?환경|인간과\s?(철학|심리|경제활동)|논리와\s?사고|교육의\s?이해|삶과\s?종교|보건|논술)$/,
];
export const isNonGradedSubject = name => {
  const text = String(name || "").normalize("NFKC").trim();
  return !!text && NON_GRADED.some(pattern => pattern.test(text));
};

// 과목명으로 교과를 추정합니다. 순서가 중요합니다(예: '영어 독해와 작문'은 영어, '인문학과 윤리'는 사회).
const GUESS = [
  ["제2외국어/한문", /일본|중국|한문|독일어|프랑스어|스페인어|러시아어|아랍어|베트남어/],
  ["영어", /영어|영미/],
  ["한국사", /^한국사/],
  ["사회", /윤리|도시|세계사|역사|동아시아|지리|여행|사회|정치|법과|경제|문화/],
  ["수학", /수학|대수|미적|확률|통계|기하/],
  ["과학", /물리|화학|생명|지구|과학|생태|천문|역학|에너지|물질|세포|행성|우주|유전|양자|반응|기후/],
  ["국어", /국어|문학|독서|화법|작문|언어|매체/],
  ["기술가정/정보", /정보|기술|가정|인공지능|프로그래밍|데이터/],
];
export function guessCategory(category, subject) {
  const name = String(subject || "");
  const guessed = GUESS.find(([, pattern]) => pattern.test(name))?.[0];
  if (guessed) return guessed;
  return normalizeCategory(category, subject);
}

// 시간표 약칭 → 편제표 정식 이름. '미창22'처럼 끝에 붙은 두 자리 숫자는 떼고 한 번 더 찾습니다.
export function officialPlannedName(label, semesterKey) {
  const raw = String(label || "").trim();
  const [grade, semester] = String(semesterKey || "").split("-");
  if (!raw || !grade) return raw;
  const first = officialSubjectName(raw, grade, semester);
  if (first !== raw) return first;
  const stripped = raw.replace(/\s*\d{2,}$/, "");
  if (stripped && stripped !== raw) {
    const second = officialSubjectName(stripped, grade, semester);
    return second !== stripped ? second : stripped;
  }
  return raw;
}

function weightedAverage(list) {
  let sum = 0, weight = 0;
  list.forEach(subject => {
    const grade = getSubjectGrade(subject);
    if (grade == null) return;
    const credit = Number(subject?.credit) > 0 ? Number(subject.credit) : 1;
    sum += grade * credit; weight += credit;
  });
  return weight ? sum / weight : null;
}

export function plannedSimSubjects(planned = [], pastLists = [], scale = 5, semesterKey = "") {
  const filled = (pastLists || []).filter(list => Array.isArray(list) && list.length);
  const last = filled[filled.length - 1] || [];
  const allPast = filled.flat();
  const creditCounts = new Map();
  last.forEach(subject => { const c = Number(subject?.credit); if (c > 0) creditCounts.set(c, (creditCounts.get(c) || 0) + 1); });
  const commonCredit = Array.from(creditCounts.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] || 4;
  const overall = weightedAverage(last);
  const clampGrade = value => (value == null ? "" : String(Math.min(scale, Math.max(1, Math.round(value)))));
  const [grade, semester] = String(semesterKey || "").split("-");
  const curriculumCredit = new Map(grade ? curriculumSubjects(grade, semester).map(item => [nameKey(item.name), item.credit]) : []);
  const seen = new Set();
  return (planned || []).map(item => ({ ...item, subject: officialPlannedName(item?.subject, semesterKey) }))
    .filter(item => {
      const key = nameKey(item.subject);
      if (!key || seen.has(key) || isNonGradedSubject(item.subject)) return false;
      seen.add(key);
      return true;
    }).map(item => {
      const category = guessCategory(item.category, item.subject);
      const same = allPast.slice().reverse().find(subject => nameKey(subject?.subject) === nameKey(item.subject));
      const hours = Number(item.weeklyHours);
      const credit = curriculumCredit.get(nameKey(item.subject))
        || (hours > 0 && hours <= 8 ? hours : (Number(same?.credit) > 0 ? Number(same.credit) : commonCredit));
      const categoryAvg = weightedAverage(last.filter(subject => normalizeCategory(subject?.category, subject?.subject) === category));
      return { subject: item.subject, category, credit, grade: clampGrade(categoryAvg ?? overall), fromTimetable: true };
    });
}
