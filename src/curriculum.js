// 광덕고 교육과정 편제표(2026학년도 입학생, 2022 개정)와 시간표 약칭 → 정식 과목명 매핑.
// 시간표 칸에는 "미적", "독작", "확통"처럼 줄인 이름이 들어가므로, 같은 학년·학기 편제표 과목 중
// 하나로만 맞아떨어질 때 정식 이름으로 바꿉니다. 애매하면(후보 2개 이상) 원래 이름을 그대로 둡니다.

// [과목명, 학점]. alt = 학급별로 바꿔 듣는 과목(↔)
export const CURRICULUM_2026 = {
  "1-1": {
    common: [["공통국어1", 4], ["공통수학1", 4], ["공통영어1", 3], ["한국사1", 3], ["통합사회1", 4], ["통합과학1", 4], ["과학탐구실험1", 1], ["체육1", 2], ["음악", 2], ["지식 재산 일반", 3], ["아동발달과 부모", 3]],
    electives: [],
  },
  "1-2": {
    common: [["공통국어2", 4], ["공통수학2", 4], ["공통영어2", 3], ["한국사2", 3], ["통합사회2", 4], ["통합과학2", 4], ["과학탐구실험2", 1], ["체육2", 2], ["음악 연주와 창작", 2], ["아동발달과 부모", 3], ["지식 재산 일반", 3]],
    electives: [],
  },
  "2-1": {
    common: [["문학", 4], ["대수", 4], ["영어Ⅰ", 4], ["스포츠 과학", 1], ["미술", 2]],
    electives: [
      { label: "택4", credit: 3, subjects: ["역사로 탐구하는 현대 세계", "사회와 문화", "정치", "세계시민과 지리", "윤리와 사상", "물리학", "화학", "생명과학", "지구과학"] },
      { label: "택1", credit: 3, subjects: ["중국어", "일본어", "정보"] },
    ],
  },
  "2-2": {
    common: [["독서와 작문", 4], ["미적분Ⅰ", 4], ["영어Ⅱ", 4], ["스포츠 문화", 1], ["미술 창작", 2]],
    electives: [
      { label: "택4", credit: 3, subjects: ["세계사", "법과 사회", "경제", "도시의 미래 탐구", "인문학과 윤리", "역학과 에너지", "물질과 에너지", "세포와 물질대사", "행성우주과학", "문학 감상과 비평", "기하", "영미 문학 읽기"] },
      { label: "택1", credit: 3, subjects: ["중국어 회화", "일본어 회화", "프로그래밍", "공중 보건"] },
    ],
  },
  "3-1": {
    common: [["화법과 언어", 4], ["확률과 통계", 3], ["영어 독해와 작문", 3], ["스포츠 생활1", 2], ["음악 감상과 비평", 2], ["미술 감상과 비평", 2]],
    electives: [
      { label: "택4", credit: 3, subjects: ["동아시아 역사 기행", "사회문제 탐구", "한국지리 탐구", "현대사회와 윤리", "전자기와 양자", "화학 반응의 세계", "생물의 유전", "지구시스템과학", "독서 토론과 글쓰기", "미적분Ⅱ", "심화 영어"] },
      { label: "택1", credit: 3, subjects: ["중국 문화", "일본 문화", "인간과 심리", "보건 간호"] },
    ],
  },
  "3-2": {
    common: [["주제 탐구 독서", 3], ["수학과제 탐구", 3], ["실생활 영어 회화", 4], ["스포츠 생활2", 3], ["미술 감상과 비평", 2], ["음악 감상과 비평", 2]],
    electives: [
      { label: "택3", credit: 3, subjects: ["역사로 탐구하는 현대 세계", "사회문제 탐구", "여행지리", "윤리문제 탐구", "기후변화와 환경생태", "과학의 역사와 문화"] },
      { label: "택1", credit: 3, subjects: ["관광 중국어", "관광 일본어", "인간과 철학", "인간과 경제활동"] },
    ],
  },
};

const semesterNo = semester => (String(semester) === "sem2" || String(semester) === "2" ? "2" : "1");
// 3월에 학년도가 바뀝니다.
export const schoolYearOf = (date = new Date()) => (date.getMonth() + 1 >= 3 ? date.getFullYear() : date.getFullYear() - 1);
// 2022 개정 교육과정(2025 입학생부터) 학년만 편제표를 씁니다. 2015 개정 학년(예: 2026년 3학년)은 이름이 달라 매핑하지 않습니다.
export function curriculumApplies(grade, year = schoolYearOf()) {
  const g = Number(grade);
  return g >= 1 && g <= 3 && year - g + 1 >= 2025;
}

export function curriculumColumn(grade, semester) {
  return CURRICULUM_2026[`${Number(grade)}-${semesterNo(semester)}`] || null;
}
// 그 학년·학기에 편성된 과목 목록 [{ name, credit, kind: "common"|"elective", group }]
export function curriculumSubjects(grade, semester) {
  const column = curriculumColumn(grade, semester);
  if (!column) return [];
  const seen = new Set();
  const out = [];
  column.common.forEach(([name, credit]) => { if (!seen.has(name)) { seen.add(name); out.push({ name, credit, kind: "common", group: "공통" }); } });
  column.electives.forEach(block => block.subjects.forEach(name => { if (!seen.has(name)) { seen.add(name); out.push({ name, credit: block.credit, kind: "elective", group: block.label }); } }));
  return out;
}

const ROMAN = { "Ⅰ": "i", "Ⅱ": "ii", "Ⅲ": "iii" };
export const subjectToken = value => String(value || "").normalize("NFC").replace(/[ⅠⅡⅢ]/g, ch => ROMAN[ch]).replace(/[\s·ㆍ:,./\\\-_()[\]]/g, "").toLowerCase();
const initials = name => String(name || "").trim().split(/\s+/).map(word => word.replace(/(과|와)$/, "")).filter(Boolean).map(word => word[0]).join("");
const isSubsequence = (short, long) => { let i = 0; for (const ch of long) { if (i < short.length && ch === short[i]) i += 1; } return i === short.length; };

function matchScore(label, name) {
  // 끝 숫자는 로마 숫자로 맞춤: "영어2" = "영어Ⅱ"
  const tailRoman = text => text.replace(/([1-3])$/, (_, d) => "i".repeat(Number(d)));
  const a = tailRoman(subjectToken(label)), c = tailRoman(subjectToken(name));
  if (!a || !c) return 0;
  if (a === c) return 1000;
  if (c.startsWith(a)) return 600 + a.length;
  // 숫자(1/2, Ⅰ/Ⅱ)는 맞아야 함: "스생1"과 "스포츠 생활2"는 다른 과목
  const numA = a.match(/(i+)$/)?.[1], numC = c.match(/(i+)$/)?.[1];
  if (numA && numC && numA !== numC) return 0;
  const bareA = numA ? a.slice(0, -numA.length) : a;
  if (tailRoman(subjectToken(initials(name))).replace(/i+$/, "") === bareA) return 500;
  if (bareA.length >= 2 && bareA[0] === c[0] && isSubsequence(bareA, c)) return 200 + bareA.length;
  return 0;
}

// 시간표 과목명 → 편제표 정식 과목명(못 찾거나 애매하면 원래 이름)
export function officialSubjectName(label, grade, semester, year = schoolYearOf()) {
  const raw = String(label || "").trim();
  if (!raw || !curriculumApplies(grade, year)) return raw;
  const candidates = curriculumSubjects(grade, semester);
  if (!candidates.length) return raw;
  const scored = candidates.map(item => ({ name: item.name, score: matchScore(raw, item.name) })).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  if (!scored.length) return raw;
  if (scored.length > 1 && scored[1].score === scored[0].score) return raw;
  return scored[0].name;
}

// ↔ 로 학급마다 둘 중 하나를 듣는 과목 묶음(편제표 기준)
export const ALTERNATE_PAIRS = [["지식 재산 일반", "아동발달과 부모"], ["음악 감상과 비평", "미술 감상과 비평"]];
// 창체·자습 등 교과가 아닌 칸
const NON_SUBJECT = /^(자율|자율학습|자율\/자치|자율·자치|자치|진로|진로활동|동아리|동아리활동|창체|창의적체험활동|HR|조회|종례)/;

// 학급 시간표(고정 칸) 한 반을 편제표와 맞춰 봅니다.
// labels: 고정 칸의 과목 이름 목록(칸 수만큼, 이동수업 칸 제외)
// → { counts: {정식이름: 시수}, unknown: [시간표 이름], issues: [문장] }
export function checkClassAgainstCurriculum(labels, grade, semester, year = schoolYearOf()) {
  const column = curriculumColumn(grade, semester);
  const result = { counts: {}, unknown: [], issues: [] };
  if (!column || !curriculumApplies(grade, year)) return result;
  const unknown = new Set();
  labels.forEach(raw => {
    const label = String(raw || "").trim();
    if (!label || NON_SUBJECT.test(label.replace(/\s+/g, ""))) return;
    const official = officialSubjectName(label, grade, semester, year);
    const known = column.common.some(([name]) => name === official);
    if (!known) { unknown.add(label); return; }
    result.counts[official] = (result.counts[official] || 0) + 1;
  });
  result.unknown = Array.from(unknown);
  const credit = Object.fromEntries(column.common.map(([name, value]) => [name, value]));
  const handled = new Set();
  ALTERNATE_PAIRS.forEach(pair => {
    if (!pair.every(name => credit[name] != null)) return;
    pair.forEach(name => handled.add(name));
    const present = pair.filter(name => result.counts[name]);
    if (!present.length) result.issues.push(`${pair.join(" ↔ ")} 중 하나가 시간표에 없습니다.`);
    else if (present.length > 1) result.issues.push(`${pair.join(" ↔ ")}는 학급마다 하나만 듣는데 둘 다 있습니다.`);
    else if (result.counts[present[0]] !== credit[present[0]]) result.issues.push(`${present[0]} 주 ${result.counts[present[0]]}시간 (편제표 ${credit[present[0]]}학점)`);
  });
  column.common.forEach(([name, value]) => {
    if (handled.has(name)) return;
    const count = result.counts[name] || 0;
    if (!count) result.issues.push(`${name} 없음 (편제표 ${value}학점)`);
    else if (count !== value) result.issues.push(`${name} 주 ${count}시간 (편제표 ${value}학점)`);
  });
  if (result.unknown.length) result.issues.push(`편제표에서 찾지 못한 과목명: ${result.unknown.join(", ")}`);
  return result;
}
