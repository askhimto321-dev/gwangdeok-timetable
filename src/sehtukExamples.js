// 교과세특 기재 예시(교육부·시도교육청 연수 자료, 2015 개정 기준). 처음 볼 때만 따로 불러옵니다(약 36KB).
// 자료 모양: { source, note, items: [{ g: 교과, s: 과목, t: 예시 글, c: [성취기준 코드], task: [평가 과제], k: 관련 역량 }] }
let cache = null;
export function loadExamples() {
  if (!cache) cache = import("./data/sehtukExamples2015.json").then(mod => mod.default || mod).catch(error => { cache = null; throw error; });
  return cache;
}

export const EXAMPLE_GROUPS = ["국어", "수학", "영어", "사회", "과학", "체육", "음악", "미술", "기술·가정", "정보", "인공지능기초", "일본어", "중국어", "한문", "진로와 직업"];
// 과목 이름 → 교과(2022 과목 이름도 낱말로 맞춤)
const GROUP_WORDS = [
  ["인공지능기초", ["인공지능"]],
  ["정보", ["정보", "프로그래밍", "데이터 과학", "소프트웨어"]],
  ["진로와 직업", ["진로와 직업"]],
  ["기술·가정", ["기술", "가정", "아동발달", "공학", "지식 재산", "보건", "간호"]],
  ["일본어", ["일본"]],
  ["중국어", ["중국"]],
  ["한문", ["한문", "한자"]],
  ["음악", ["음악"]],
  ["미술", ["미술", "드로잉"]],
  ["체육", ["체육", "스포츠", "운동"]],
  ["영어", ["영어", "영미"]],
  ["수학", ["수학", "미적", "대수", "기하", "확률", "통계"]],
  ["과학", ["과학", "물리", "화학", "생명", "지구", "역학", "물질", "세포", "행성", "전자기", "생물", "기후변화와 환경"]],
  ["국어", ["국어", "문학", "독서", "화법", "작문", "언어", "매체", "논술"]],
  ["사회", ["사회", "역사", "한국사", "세계사", "지리", "윤리", "정치", "경제", "법", "세계시민", "도시", "인문학", "철학", "심리", "여행"]],
];
export function exampleGroupFor(name = "") {
  const value = String(name || "");
  const hit = GROUP_WORDS.find(([, words]) => words.some(word => value.includes(word)));
  return hit ? hit[0] : "";
}
const bare = value => String(value || "").replace(/[\sⅠⅡⅢ12·]/g, "");
// 같은 과목 예시를 앞에, 그다음 같은 교과
export function examplesFor(name, items = [], group = exampleGroupFor(name)) {
  const key = bare(name);
  return items.filter(item => item.g === group).sort((a, b) => (bare(b.s) === key || key.startsWith(bare(b.s))) - (bare(a.s) === key || key.startsWith(bare(a.s))));
}
