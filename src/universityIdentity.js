const normalizeText = value => String(value ?? '').normalize('NFKC').replace(/\s+/g,' ').trim();
const compactText = value => normalizeText(value).replace(/\s+/g,'').toLowerCase();
export const UNIVERSITY_CAMPUS_ALIASES = {
  가천대: { 경기: "글로벌", 성남: "글로벌", 인천: "메디컬", 글로벌: "글로벌", 메디컬: "메디컬" },
  한양대: { 서울: "서울", 경기: "ERICA", 안산: "ERICA", ERICA: "ERICA" },
  경희대: { 서울: "서울", 경기: "국제", 용인: "국제", 수원: "국제", 국제: "국제" },
  단국대: { 경기: "죽전", 용인: "죽전", 죽전: "죽전", 충남: "천안", 천안: "천안" },
  경기대: { 서울: "서울", 경기: "수원", 수원: "수원" },
  명지대: { 서울: "서울", 경기: "용인", 용인: "용인" },
  고려대: { 서울: "서울", 세종: "세종" },
  // 2026 전수조사: NAVI는 '연세대|서울', '연세대|인천'(국제캠), '연세대(미래)|강원'을, 대입 사례는 '연세대학교(서울)'을 씁니다.
  연세대: { 서울: "서울", 신촌: "서울", 인천: "서울", 송도: "서울", 국제: "서울", 강원: "미래", 원주: "미래", 미래: "미래" },
  건국대: { 서울: "서울", 충북: "글로컬", 충주: "글로컬", 글로컬: "글로컬" },
  중앙대: { 서울: "서울", 경기: "다빈치", 안성: "다빈치", 다빈치: "다빈치" },
  홍익대: { 서울: "서울", 세종: "세종" },
  상명대: { 서울: "서울", 충남: "천안", 천안: "천안" },
  한국외대: { 서울: "서울", 경기: "글로벌", 용인: "글로벌", 글로벌: "글로벌" },
  동국대: { 서울: "서울", 경북: "WISE", 경주: "WISE", WISE: "WISE", 와이즈: "WISE" },
};
export function canonicalCampus(base, campus) {
  const raw = normalizeText(campus);
  if (!raw) return "";
  const map = UNIVERSITY_CAMPUS_ALIASES[base] || {};
  if (/^(?:WISE|와이즈|경주)$/i.test(raw)) return "WISE";
  return map[raw] || map[raw.toUpperCase()] || (raw.toUpperCase() === "ERICA" ? "ERICA" : raw);
}
function universityBaseKeyRaw(value) {
  let text = normalizeText(value)
    .replace(/[（]/g, "(").replace(/[）]/g, ")")
    // 대입 사례 원본의 '중부대학교(금산) - 충청캠퍼스', '한서대학교(태안) -항공학부'처럼 하이픈 뒤 설명은 대학명이 아닙니다.
    .replace(/\s+-\s*.*$|\s*-\s+.*$/, "")
    // 대학 식별용 기본키에서는 괄호·슬래시 뒤의 캠퍼스/지역 표기를 모두 제외합니다.
    .replace(/\([^)]*\)/g, "")
    .replace(/\s*[\/|]\s*(?:서울|ERICA|에리카|WISE|와이즈|메디컬|글로벌|글로컬|국제|세종|수원|죽전|천안|안양|성남|인천|안산|안성|미래|다빈치|송도|용인|경주)(?:캠퍼스)?\s*$/gi, "")
    .replace(/(?:서울|ERICA|에리카|WISE|와이즈|메디컬|글로벌|글로컬|국제|세종|수원|죽전|천안|안양|성남|인천|안산|안성|미래|다빈치|송도|용인|경주)\s*(?:캠퍼스|캠)/gi, "")
    .replace(/\s+(?:서울|ERICA|에리카|WISE|와이즈|메디컬|글로벌|글로컬|국제|세종|수원|죽전|천안|안양|성남|인천|안산|안성|미래|다빈치|송도|용인|경주)\s*$/gi, "")
    .replace(/국립/g, "")
    .replace(/여자대학교/g, "여대")
    .replace(/대학교/g, "대")
    .replace(/교육대/g, "교대");
  const aliases = {
    한양대학교: "한양대", 한양: "한양대",
    덕성여자대: "덕성여대", 성신여자대: "성신여대",
    서울여자대: "서울여대", 숙명여자대: "숙명여대",
    서울과기대: "서울과학기술대", 한국외국어대: "한국외대",
    // NAVI 표기와 다른 정식 명칭·통합 전 이름(2026 전수조사)
    부산외국어대: "부산외대", 금오공과대: "금오공대", 안동대: "경국대",
    차의과대: "차의과학대", KENTECH: "한국에너지공과대", 켄텍: "한국에너지공과대",
  };
  text = aliases[text] || text;
  return compactText(text);
}
function universityCampusRaw(value, region = "") {
  const text = normalizeText(value).replace(/[（]/g, "(").replace(/[）]/g, ")");
  const base = universityBaseKey(text);
  // 캠퍼스가 하나인 대학은 '백석대학교(천안)', '수원대학교(수원)'처럼 괄호에 소재지가 붙어 있어도 같은 대학입니다.
  // 여러 캠퍼스를 따로 모집하는 대학(UNIVERSITY_CAMPUS_ALIASES)만 캠퍼스를 구분합니다.
  if (!UNIVERSITY_CAMPUS_ALIASES[base]) return "단일";
  let explicit = "";
  if (/ERICA|에리카/i.test(text)) explicit = "ERICA";
  if (!explicit) {
    explicit = ["WISE", "와이즈", "메디컬", "글로벌", "글로컬", "국제", "서울", "세종", "수원", "죽전", "천안", "안양", "성남", "인천", "안산", "안성", "미래", "다빈치", "송도", "용인", "경주"]
      .find(campus => new RegExp(`(?:\\(|\\s|\\/|^)${campus}(?:캠퍼스)?(?:\\)|\\s|\\/|$)`, "i").test(text)) || "";
  }
  if (/\bWISE\b|와이즈/i.test(text)) explicit = "WISE";
  if (explicit) return canonicalCampus(base, explicit);
  const regionText = normalizeText(region);
  const regionMap = UNIVERSITY_CAMPUS_ALIASES[base] || null;
  if (regionMap) {
    const mapped = regionMap[regionText] || regionMap[regionText.toUpperCase()];
    if (mapped) return mapped;
  }
  // 일반 대학은 지역명을 캠퍼스 식별자로 사용하지 않습니다.
  // 같은 캠퍼스가 '전남/광주'처럼 서로 다른 지역 문자열로 저장돼 중복 카드가 생기는 것을 막습니다.
  return "단일";
}
// NAVI는 수천 개 모집단위를 렌더할 때마다 같은 대학명을 수만 번 정규화합니다. 결과가 입력에만 달려 있으므로
// 캐시해 두고(최대 2만 개, 넘치면 비움) 같은 값은 바로 돌려줍니다.
function memo(fn, max = 20000) {
  const store = new Map();
  return (...args) => {
    const key = args.length === 1 ? String(args[0] ?? "") : args.map(arg => String(arg ?? "")).join("\u0001");
    const hit = store.get(key);
    if (hit !== undefined) return hit;
    const value = fn(...args);
    if (store.size >= max) store.clear();
    store.set(key, value);
    return value;
  };
}
export const universityBaseKey = memo(universityBaseKeyRaw);
export const universityCampus = memo(universityCampusRaw);
export const universityIdentityKey = memo((value, region = "") => `${universityBaseKey(value)}|${universityCampus(value, region)}`);
