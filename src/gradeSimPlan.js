// 성적 시뮬레이터 자동 채우기: 시간표에서 읽은 남은 학기 수강 과목을 시뮬레이션 과목 줄로 바꿉니다.
// 학점은 주당 시수(시간표 고정 칸) → 지난 학기 같은 과목 학점 → 지난 학기에 가장 흔한 학점 순으로,
// 석차등급은 지난 학기 같은 교과 평균(없으면 전체 평균)을 반올림해 '지금 수준 유지'로 채웁니다.
import { normalizeCategory, getSubjectGrade } from "./gradeEngine.js";

const nameKey = value => String(value || "").normalize("NFKC").replace(/[\s·ㆍ()（）]/g, "").replace(/[ⅠI]$/, "1").replace(/[ⅡII]$/, "2").toLowerCase();

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

// 시간표 과목명만 있을 때 교과를 추정합니다(성적 엔진이 '기타'로 둔 경우의 보완).
const GUESS = [
  ["국어", /국어|문학|독서|화법|작문|언어|매체/],
  ["수학", /수학|대수|미적|확률|통계|기하/],
  ["영어", /영어|영미/],
  ["한국사", /^한국사/],
  ["과학", /물리|화학|생명|지구|과학|생태|천문/],
  ["사회", /사회|지리|역사|세계사|동아시아|윤리|정치|경제|법|문화|철학/],
  ["기술가정/정보", /정보|기술|가정|인공지능|프로그래밍|데이터/],
  ["제2외국어/한문", /일본어|중국어|한문|독일어|프랑스어|스페인어|러시아어|아랍어|베트남어/],
];
export function guessCategory(category, subject) {
  const normalized = normalizeCategory(category, subject);
  if (normalized !== "기타") return normalized;
  const name = String(subject || "");
  return GUESS.find(([, pattern]) => pattern.test(name))?.[0] || normalized;
}

export function plannedSimSubjects(planned = [], pastLists = [], scale = 5) {
  const filled = (pastLists || []).filter(list => Array.isArray(list) && list.length);
  const last = filled[filled.length - 1] || [];
  const allPast = filled.flat();
  const creditCounts = new Map();
  last.forEach(subject => { const c = Number(subject?.credit); if (c > 0) creditCounts.set(c, (creditCounts.get(c) || 0) + 1); });
  const commonCredit = Array.from(creditCounts.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] || 4;
  const overall = weightedAverage(last);
  const clampGrade = value => (value == null ? "" : String(Math.min(scale, Math.max(1, Math.round(value)))));
  const seen = new Set();
  return (planned || []).filter(item => {
    const key = nameKey(item?.subject);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(item => {
    const category = guessCategory(item.category, item.subject);
    const same = allPast.slice().reverse().find(subject => nameKey(subject?.subject) === nameKey(item.subject));
    const hours = Number(item.weeklyHours);
    const credit = hours > 0 && hours <= 8 ? hours : (Number(same?.credit) > 0 ? Number(same.credit) : commonCredit);
    const categoryAvg = weightedAverage(last.filter(subject => normalizeCategory(subject?.category, subject?.subject) === category));
    return { subject: item.subject, category, credit, grade: clampGrade(categoryAvg ?? overall), fromTimetable: true };
  });
}
