// 생기부 글 도우미: 나이스 바이트 수, 영역별 기본 한도, 기재요령 점검, 활동별 세특 합치기.
// 기재요령 근거: 광덕고 "한눈으로 파악하는 학교생활기록부 기재 요령 연수"(2026.05.08.) 9~10쪽.

// 나이스 바이트: 한글 등 2바이트 넘는 글자 3, 영문·숫자·공백·기본 기호 1, 줄바꿈(엔터) 2.
export function neisBytes(text = "") {
  let bytes = 0;
  for (const ch of String(text || "").replace(/\r\n?/g, "\n")) {
    if (ch === "\n") bytes += 2;
    else bytes += ch.codePointAt(0) <= 0x7f ? 1 : 3;
  }
  return bytes;
}
export function charCount(text = "") {
  return Array.from(String(text || "").replace(/\r\n?/g, "\n")).length;
}

// 영역별 한도(바이트). 2026 기재요령 기준 글자 수 × 3.
export const RECORD_AREAS = {
  autonomy: { key: "autonomy", label: "자율·자치활동", short: "자율·자치", limit: 1500 },
  career: { key: "career", label: "진로활동", short: "진로", limit: 2100 },
  behavior: { key: "behavior", label: "행동특성 및 종합의견", short: "행발", limit: 900 },
  subject: { key: "subject", label: "과목별 세부능력 및 특기사항", short: "과세특", limit: 1500 },
};
export const HOMEROOM_AREAS = ["autonomy", "career", "behavior"];

// 활동별 세특을 한 덩어리로: 비어 있는 활동은 빼고 활동마다 줄을 바꿉니다.
export function mergeActivities(activities = [], texts = {}) {
  return activities.map(act => String(texts?.[act.id] || "").trim()).filter(Boolean).join("\n");
}

// ── 기재요령 점검 ─────────────────────────────────────────────────────────
// level: "block" = 기재 불가(꼭 고치기) · "warn" = 고치기 권장
const SPECIAL = [
  [/·/g, "가운데점(·)", "쉼표(,)나 '및', '또는'으로"],
  [/[‘’“”]/g, "둥근 따옴표", "작은따옴표(')로"],
  [/[[\]［］【】]/g, "꺽쇠 괄호([ ])", "빼기"],
  [/[~～∼]/g, "물결(~)", "기간은 하이픈(-)으로"],
  [/[★☆●○◎◇◆□■△▲▽▼→←↑↓↔※『』「」《》〈〉♥♡♪◀▶►◁▷…]/g, "특수기호", "한글 문자표 특수기호는 쓰지 않기"],
];
const BRANDS = [
  ["구글 클래스룸|Google Classroom", "학습 플랫폼"], ["구글 문서|Google Docs", "온라인 문서 편집기"], ["구글|Google", "포털사이트"],
  ["네이버|NAVER|Naver", "포털사이트"], ["다음(?=\\s|$|에서|을|를)|Daum", "포털사이트"],
  ["유튜버|YouTuber", "동영상 크리에이터"], ["유튜브|YouTube|Youtube", "동영상 플랫폼"], ["넷플릭스|Netflix", "동영상 플랫폼"], ["티빙|TVING", "동영상 플랫폼"], ["왓챠|watcha", "동영상 플랫폼"],
  ["틱톡|TikTok", "엔터테인먼트 플랫폼"], ["인스타그램|Instagram", "소셜네트워크서비스"], ["트위터|Twitter", "소셜네트워크서비스"], ["페이스북|Facebook", "소셜네트워크서비스"],
  ["카카오톡|KakaoTalk", "메신저"], ["카카오|Kakao", "기업명 대신 일반 표현"], ["라인|LINE", "메신저"], ["삼성|Samsung", "기업명 대신 일반 표현"],
  ["줌(?=\\s|$|으로|을|를)|Zoom", "화상 회의"], ["EBS 온라인클래스", "온라인 클래스"],
  ["미리캔버스", "디자인 제작 플랫폼"], ["망고보드", "디자인 제작 플랫폼"], ["캔바|Canva", "디자인 제작 플랫폼"],
  ["챗\\s?GPT|챗지피티|Chat\\s?GPT", "대화형 인공지능"], ["제미나이|Gemini", "대화형 인공지능"], ["뤼튼|wrtn", "대화형 인공지능"],
  ["블로|Vllo", "영상 편집 프로그램"], ["프리미어 ?프로|Premiere Pro", "영상 편집 프로그램"], ["파이널 ?컷|Final Cut Pro", "영상 편집 프로그램"],
  ["아이패드|iPad", "태블릿PC"], ["갤럭시 ?탭|Galaxy Tab", "태블릿PC"], ["크롬북|Chromebook", "휴대용 컴퓨터"],
  ["TED", "온라인 강연회"], ["패들렛|Padlet", "협업 플랫폼"], ["띵커벨|ThinkerBell", "협업 플랫폼"],
  ["커리어넷|careernet", "진로정보망"], ["메이저맵|majormap", "진로 정보 사이트"], ["홀랜드|Holland", "직업선호도 검사"], ["MBTI", "성격유형 검사"],
  ["비트코인|Bitcoin", "가상화폐"], ["알트코인|Altcoin", "가상화폐"], ["ESG", "지속 가능 경영"],
];
const AGENCIES = [["유네스코|UNESCO", "국제기구"], ["WTO|OECD|IMF|IAEA|NATO|WHO", "국제기구"], ["UN(?![A-Za-z])|EU(?![A-Za-z])", "국제기구"], ["통계청", "국가 통계 기관"], ["금융감독원", "금융 관리 기관"]];
const BANNED_TERMS = [
  ["대회", "교내외 대회 이름·결과는 쓰지 않기(경기·활동 등으로)"], ["수상", "수상 실적은 쓰지 않기"], ["자격증", "자격증은 쓰지 않기"],
  ["소논문|논문", "'학술자료' 등으로"], ["어학\\s?시험|인증\\s?시험|토익|토플|TOEIC|TOEFL|TEPS|HSK|JLPT", "어학·인증시험은 쓰지 않기"],
  ["모의고사|전국연합\\s?학력평가|학력평가", "모의고사·전국연합평가 성적은 쓰지 않기"],
  ["해외\\s?(연수|봉사|활동)|어학연수", "해외 활동은 쓰지 않기"], ["도서\\s?출간|출판", "도서 출간은 쓰지 않기"], ["특허", "특허 등록은 쓰지 않기"],
  ["장학생|장학금", "장학 관련 내용은 쓰지 않기"], ["부모|아버지|어머니|친인척", "부모·친인척의 사회·경제적 지위는 쓰지 않기"],
  ["재단", "재단명은 쓰지 않기"], ["축제", "학교 축제명은 쓰지 않기"],
];
const ALLOWED_EN = new Set(["CEO", "PD", "UCC", "IT", "POP", "CF", "TV", "PAPS", "SNS", "PPT", "AI", "km", "m", "kg", "cm", "mm", "g", "mg", "ml", "L", "DNA", "RNA", "PC", "IoT", "VR", "AR", "CO2", "pH"]);

function findAll(text, re) {
  const out = [];
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m;
  while ((m = g.exec(text))) { if (!m[0]) { g.lastIndex += 1; continue; } out.push({ index: m.index, match: m[0] }); }
  return out;
}

export function checkRecordText(text = "") {
  const value = String(text || "");
  const issues = [];
  const add = (level, kind, match, index, fix) => issues.push({ level, kind, match, index, fix });
  SPECIAL.forEach(([re, name, fix]) => findAll(value, re).forEach(hit => add("block", `특수문자 · ${name}`, hit.match, hit.index, fix)));
  findAll(value, /[가-힣A-Za-z]+대학교|[가-힣]{2,}대(?=에|의|를|을|로|와|과|\s|$|\.|,)(?<!(?:시대|세대|상대|반대|기대|확대|최대|최소대|현대|고대|근대|교대|강대|군대|무대|연대|대대|절대|접대|위대|거대|광대|관대|온대|열대|한대|토대|지대|부대|해대|극대|증대|단대|침대|의대|공대|법대|약대|치대))/g)
    .forEach(hit => add("block", "대학명", hit.match, hit.index, "특정 대학명은 쓰지 않기"));
  BRANDS.forEach(([pattern, fix]) => findAll(value, new RegExp(`(?<![A-Za-z가-힣])(?:${pattern})(?![A-Za-z])`, "g")).forEach(hit => add("block", "상호명", hit.match, hit.index, `'${fix}' 등으로`)));
  AGENCIES.forEach(([pattern, fix]) => findAll(value, new RegExp(`(?<![A-Za-z가-힣])(?:${pattern})`, "g")).forEach(hit => add("block", "기관명", hit.match, hit.index, `'${fix}' 등으로`)));
  BANNED_TERMS.forEach(([pattern, fix]) => findAll(value, new RegExp(pattern, "g")).forEach(hit => add("block", "입력 불가 용어", hit.match, hit.index, fix)));
  // 문장 끝: 과거·미래형, 학생 입장(셀프 생기부) 표현
  findAll(value, /[가-힣]*(?:했음|하였음|었음|았음|였음|겠음|할 것임|할 예정임)(?=\s*[.\n]|\s*$)/g).forEach(hit => add("warn", "시제", hit.match, hit.index, "현재형 종결어미로(~함, ~임)"));
  findAll(value, /[가-힣]*(?:파악함|이해함|깨달음|다짐함|느낌|배움|고찰함|분석함)(?=\s*[.\n]|\s*$)/g).forEach(hit => add("warn", "학생 입장 표현", hit.match, hit.index, "교사 관찰로(~하는 모습을 보임, ~이 돋보임)"));
  // 영문: 허용 목록 밖의 영어 낱말
  findAll(value, /[A-Za-z][A-Za-z0-9]*/g).forEach(hit => {
    if (ALLOWED_EN.has(hit.match) || issues.some(issue => issue.index <= hit.index && hit.index < issue.index + issue.match.length)) return;
    add("warn", "영문", hit.match, hit.index, "문자는 한글로(부득이한 경우만 영문)");
  });
  return issues.sort((a, b) => a.index - b.index);
}
export function issueSummary(issues = []) {
  const block = issues.filter(item => item.level === "block").length;
  return { block, warn: issues.length - block, total: issues.length };
}
