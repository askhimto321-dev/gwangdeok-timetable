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
export function universityBaseKey(value) {
  let text = normalizeText(value)
    .replace(/[（]/g, "(").replace(/[）]/g, ")")
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
  };
  text = aliases[text] || text;
  return compactText(text);
}
export function universityCampus(value, region = "") {
  const text = normalizeText(value).replace(/[（]/g, "(").replace(/[）]/g, ")");
  const base = universityBaseKey(text);
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
export function universityIdentityKey(value, region = "") {
  return `${universityBaseKey(value)}|${universityCampus(value, region)}`;
}
