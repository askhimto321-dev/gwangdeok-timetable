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

// 영역별 한도(바이트). 2026학년도 기재요령 기준 글자 수 × 3.
// 진로활동 700자 → 500자(1,500바이트), 행동특성 및 종합의견 500자 → 300자(900바이트).
// 바뀐 한도는 2026.3.1 고1·고2부터, 고3은 2027.3.1부터 적용 → 2026학년도 3학년은 예전 한도(areaLimit).
export const RECORD_AREAS = {
  autonomy: { key: "autonomy", label: "자율·자치활동", short: "자율·자치", limit: 1500 },
  career: { key: "career", label: "진로활동", short: "진로", limit: 1500 },
  behavior: { key: "behavior", label: "행동특성 및 종합의견", short: "행발", limit: 900 },
  subject: { key: "subject", label: "과목별 세부능력 및 특기사항", short: "과세특", limit: 1500 },
};
export const HOMEROOM_AREAS = ["autonomy", "career", "behavior"];
const LEGACY_LIMITS = { career: 2100, behavior: 1500 };
const schoolYearNow = (date = new Date()) => (date.getMonth() + 1 >= 3 ? date.getFullYear() : date.getFullYear() - 1);
// 학년에 맞는 한도: 3학년은 2027학년도 전까지 예전 한도
export function areaLimit(key, grade = "", year = schoolYearNow()) {
  if (String(grade) === "3" && year < 2027 && LEGACY_LIMITS[key]) return LEGACY_LIMITS[key];
  return RECORD_AREAS[key]?.limit || RECORD_AREAS.subject.limit;
}

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
  ["네이버|NAVER|Naver", "포털사이트"], ["Daum", "포털사이트"],
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
  // 오타 의심: 자음·모음만 있는 글자(ㅇㅇ, ㅏㅇ), 같은 낱말 연달아, 마침표 겹침
  findAll(value, /[\u3131-\u318E]+/g).forEach(hit => add("block", "오타 의심", hit.match, hit.index, "자음·모음만 있는 글자예요. 고치거나 지워 주세요"));
  findAll(value, /(?<![가-힣A-Za-z])([가-힣]{2,})\s+\1(?![가-힣])/g).forEach(hit => add("warn", "오타 의심", hit.match, hit.index, "같은 낱말이 두 번 연달아 있어요"));
  findAll(value, /\.{2,}|,{2,}|\s+[.,](?=\s|$)/g).forEach(hit => add("warn", "오타 의심", hit.match.trim() || hit.match, hit.index, "문장부호를 확인해 주세요"));
  // 문장 끝: 과거·미래형, 학생 입장(셀프 생기부) 표현
  findAll(value, /[가-힣]*(?:했음|하였음|었음|았음|였음|겠음|할 것임|할 예정임)(?=\s*[.\n]|\s*$)/g).forEach(hit => add("warn", "시제", hit.match, hit.index, "현재형 종결어미로(~함, ~임)"));
  findAll(value, /[가-힣]*(?:파악함|이해함|깨달음|다짐함|느낌|배움|고찰함|분석함|알게 됨|알게됨|생각함|결심함|체득함|인식함)(?=\s*[.\n]|\s*$)/g).forEach(hit => add("warn", "학생 입장 표현", hit.match, hit.index, "교사 관찰로(~하는 모습을 보임, ~이 돋보임)"));
  // 소감문을 그대로 옮긴 표현·인물 직함(교사 관찰 기록에 맞지 않음)
  findAll(value, /소감문|(?:서술|진술|기술)함|강사|강연자|연사(?=[의가를는께])/g).forEach(hit => add("warn", "학생 입장 표현", hit.match, hit.index, /소감/.test(hit.match) || /함$/.test(hit.match) ? "학생이 쓴 글을 옮긴 표현이에요. 활동 사실을 교사 관찰로 바꿔 써 주세요" : "강사·강연자 같은 인물은 쓰지 않아요. '~ 교육(특강)에 참여하여'처럼 활동으로 써 주세요"));
  // 영문: 허용 목록 밖의 영어 낱말
  findAll(value, /[A-Za-z][A-Za-z0-9]*/g).forEach(hit => {
    if (ALLOWED_EN.has(hit.match) || issues.some(issue => issue.index <= hit.index && hit.index < issue.index + issue.match.length)) return;
    add("warn", "영문", hit.match, hit.index, "문자는 한글로(부득이한 경우만 영문)");
  });
  // 임원 경력만 적힌 줄(예: '학급자치회 회장(2026.08.13.-2027.02.28.)'): 나이스 임원 칸처럼 이름만 있고 문장이 아니에요.
  String(value).split(/\n/).forEach(line => {
    const t = line.trim();
    if (!t || t.length > 60) return;
    if (/(?:부?회장|부?반장|부?실장|대의원|임원|부?위원장|부?부장|차장|총무|서기|회계|부?대표|기장|조장|팀장)\s*(?:\([^()]*\))?\s*[.。]?$/.test(t) && !/[가-힣](?:함|임|음|됨|봄|짐|김|림|힘|킴|움|줌|춤|름)\s*[.。]?\s*$/.test(t)) {
      add("warn", "임원 문장 완성", t.length > 24 ? `${t.slice(0, 24)}…` : t, value.indexOf(t), "임원 이름·기간만 있어요. '~회장(기간)으로서 ~을 이끎.'처럼 맡은 역할과 활동을 문장으로 완성해 주세요");
    }
  });
  // 줄마다 끝맺음: 마침표로 끝나는지, '~함. ~임. ~음. ~이끎.'처럼 명사형(받침 ㅁ·ㄻ)으로 끝나는지
  // (행사 세특을 줄 바꿔 넣으면 줄마다 한 덩어리라, 마지막 줄만 보면 중간 줄의 끊긴 문장을 놓쳐요)
  let offset = 0;
  const lines = String(value).split("\n").map(line => { const at = offset; offset += line.length + 1; return { line, at }; }).filter(({ line }) => line.trim());
  lines.forEach(({ line, at }, index) => {
    const tail = line.trim();
    const last = index === lines.length - 1;
    const where = last ? "마지막 문장" : `${index + 1}번째 줄`;
    // 끝의 괄호(기간 등)는 떼고 봐요: '회장(2026.08.13.-2027.02.28.)'의 괄호 안 마침표를 문장 끝으로 보지 않게
    const end = tail.replace(/\s*\([^()]*\)\s*$/, "").replace(/["'\]]+$/, "");
    const lastHangul = (end.replace(/[.!?]+$/, "").match(/[가-힣]$/) || [])[0];
    const pos = at + line.length - 1;
    if (!/[.!?]$/.test(end)) add("warn", "문장 끝 확인", tail.slice(-12), pos, `${where}이 마침표로 끝나지 않아요. '~함.', '~임.'처럼 끝내 주세요`);
    // 받침 ㅁ(함·임·음) 또는 ㄻ(이끎·만듦·삶)이면 명사형 종결로 봐요.
    else if (lastHangul && ![16, 10].includes((lastHangul.charCodeAt(0) - 0xAC00) % 28)) add("warn", "문장 끝 확인", tail.slice(-12), pos, `${where}이 '~함. ~임. ~음.' 같은 종결어미로 끝나는지 확인해 주세요(낱말로 끝나면 문장이 끊긴 것일 수 있어요)`);
  });
  // 같은 끝맺음 반복: '~돋보임.'처럼 같은 끝말로 끝나는 문장이 3번 넘게 이어지면 알려요
  const endWords = splitSentences(value).map(sentence => (sentence.replace(/[.!?\s]+$/, "").match(/[가-힣]+$/) || [""])[0].slice(-3)).filter(Boolean);
  const endCount = {}; endWords.forEach(w => { endCount[w] = (endCount[w] || 0) + 1; });
  Object.entries(endCount).filter(([, n]) => n >= 3).forEach(([w, n]) => add("warn", "같은 끝맺음 반복", `~${w}. ×${n}`, Math.max(0, value.lastIndexOf(w)), `'~${w}'로 끝나는 문장이 ${n}개예요. 끝맺음을 다양하게 바꿔 보세요(~함, ~을 보임, ~에 기여함 등)`));
  // 태도 표현 반복: 한 단락(줄)에서 '집중함·경청함·성실히 참여함' 같은 태도 문장이 3번 넘게 나오면 분량 채우기용 반복일 수 있어요
  let lineAt = 0;
  value.split("\n").forEach(line => {
    const hits = splitSentences(line).filter(sentence => ATTITUDE_RE.test(sentence));
    // '~에 참여하여'로 시작한 단락을 '~에 참여함'으로 또 맺으면 같은 말을 두 번 한 셈이에요
    const joinAt = line.search(/참여하여|참여해|참가하여|참가해/);
    const endHit = joinAt >= 0 ? [...line.matchAll(/(?:참여|참가)(?:함|하였음|했음|하는 모습을 보임)/g)].find(m => m.index > joinAt) : null;
    if (endHit) add("warn", "'참여' 겹침", endHit[0], lineAt + endHit.index, "'~에 참여하여'로 시작한 단락을 '참여함'으로 또 맺었어요. 끝은 학생이 한 행동(정리함, 제시함, 실천함 등)으로 바꿔 주세요");
    if (hits.length >= 3) add("warn", "태도 표현 반복", `${(hits[hits.length - 1].match(ATTITUDE_RE) || [""])[0]} 등 ×${hits.length}`, lineAt + Math.max(0, line.lastIndexOf(hits[hits.length - 1])), `한 활동에 '집중함·경청함·성실히 참여함' 같은 태도 문장이 ${hits.length}개예요. 하나만 남기고, 나머지는 학생이 한 구체적인 활동(조사·발표·토의·만든 것)으로 바꿔 주세요`);
    lineAt += line.length + 1;
  });
  repeatedSentences(value).forEach(sentence => add("warn", "같은 문장 반복", sentence.length > 24 ? `${sentence.slice(0, 24)}…` : sentence, value.lastIndexOf(sentence), "같은 문장을 두 번 썼어요. 하나는 지우거나 다른 관찰 내용으로 바꿔 주세요"));
  return issues.sort((a, b) => a.index - b.index);
}
const ATTITUDE_RE = /집중|경청|성실|진지|바른\s*태도|흐트러짐|끝까지|열심히|적극적으로\s*참여|성의\s*있/;
// 한 글 안에서 같은 문장을 두 번 쓴 경우(띄어쓰기·기호 무시, 5자 이상)
function repeatedSentences(text) {
  const seen = new Map(); const out = [];
  splitSentences(text).forEach(sentence => { const key = normSentence(sentence); if (key.length < 5) return; if (seen.has(key) && !out.includes(sentence)) out.push(sentence); else seen.set(key, sentence); });
  return out;
}
export function issueSummary(issues = []) {
  const block = issues.filter(item => item.level === "block").length;
  return { block, warn: issues.length - block, total: issues.length };
}

// 안전한 자동 고치기: 뜻이 바뀌지 않는 기호만 바꿉니다(가운데점→쉼표, 둥근 따옴표→작은따옴표, 물결→하이픈, 대괄호 빼기, 겹친 띄어쓰기 정리).
export function autoFixRecordText(text = "") {
  return String(text || "")
    .replace(/\s*·\s*/g, ", ")
    .replace(/[‘’“”]/g, "'")
    .replace(/\s*[~～∼]\s*/g, "-")
    .replace(/[[\]［］【】]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n");
}

// 엑셀에서 복사한 '번호(또는 학번) ⇥ 내용' 줄을 학생에게 맞춥니다.
export function parsePastedRows(text = "", students = []) {
  const bySid = new Map(students.map(s => [String(s.sid), s]));
  const byNumber = new Map(students.map(s => [String(Number(s.number)), s]));
  const matched = [], missed = [];
  String(text || "").replace(/\r\n?/g, "\n").split("\n").forEach(line => {
    if (!line.trim()) return;
    const cells = line.split("\t");
    if (cells.length < 2) { missed.push(line); return; }
    const head = cells[0].trim().replace(/번$/, "");
    const content = cells.slice(cells.length >= 3 && !/^\d+$/.test(cells[1].trim()) ? 2 : 1).join(" ").trim().replace(/^"|"$/g, "");
    const student = bySid.get(head) || (/^\d{1,2}$/.test(head) ? byNumber.get(String(Number(head))) : null);
    if (student && content) matched.push({ sid: student.sid, text: content });
    else missed.push(line);
  });
  return { matched, missed };
}

export const RECORD_GUIDE = {
  steps: [
    ["반·과목 고르기", "위에서 담임 반 또는 담당 과목·반(이동수업은 분반)을 골라요."],
    ["활동 만들기(교과)", "수행평가 영역을 활동으로 추가해요. 다른 반 목록을 '가져오기'로 복사할 수 있어요."],
    ["쓰기", "학생을 고르고 칸에 쓰면 1초 뒤 자동 저장돼요. 오른쪽 '자료' 칸에 누가기록을 적거나 활동지를 띄워 보며 쓸 수 있어요."],
    ["점검·출력", "빨간 '기재 불가'는 꼭 고치고, 바이트가 한도를 넘지 않는지 봐요. 다 쓰면 인쇄·PDF·엑셀로 뽑아요."],
  ],
  rules: [
    "교사가 관찰한 사실을 교사 입장에서: ~하는 모습을 보임, ~이 돋보임, ~에 대해 발표함",
    "현재형 종결어미: ~함, ~임 (했음·하였음·알 수 있었음 X)",
    "학생 입장 표현 피하기: 깨달음, 다짐함, 느낌, 배움 X",
    "특수기호 금지: 가운데점(·)→쉼표, 둥근 따옴표→작은따옴표('), 대괄호 X, 기간은 물결(~) 대신 하이픈(-)",
    "대학명·기관명·상호명·강사명 X (유튜브→동영상 플랫폼, 챗GPT→대화형 인공지능, 캔바→디자인 제작 플랫폼)",
    "대회·수상·자격증·논문·어학시험·모의고사 성적·해외활동·부모 사회경제적 지위 X",
  ],
  tips: [
    "AI 도우미 ① 요청문 복사 → 쓰시는 AI에 붙여넣기 → ② 받은 답 붙여넣고 점검 → 칸에 넣기. 요청문에는 학생 이름이 빠지지만, 누가기록에 다른 학생 이름을 적지 않도록 해 주세요.",
    "AI가 써 준 세특 초안은 먼저 '누가기록'에 붙여 두고, 학생 활동에 맞게 고친 문장만 골라 '칸에 넣기'로 옮겨 쓰면 편해요.",
    "엑셀로 미리 써 둔 글은 '영역별 몰아쓰기 → 엑셀에서 붙여넣기'로 반 전체를 한 번에 넣을 수 있어요.",
    "특수기호가 섞이면 '기호 자동 고치기' 버튼이 나와요. 자음·모음만 있는 글자(ㅇㅇ), 같은 낱말 반복 같은 오타도 '오타 의심'으로 알려 줘요.",
    "총합본은 활동마다 줄을 바꿔 합쳐져요. '복사'를 눌러 나이스에 그대로 붙여넣으면 돼요.",
    "다른 반 활동 목록은 '다른 반 활동 가져오기'로 복사해요. 쓴 글은 옮겨지지 않아요.",
    "글은 1초 뒤 자동 저장되고, 저장 전 글은 이 브라우저에도 보관돼요. 반 자료를 따로 보관하려면 '백업 파일'을 받아 두세요.",
  ],
  endings: ["~에 대한 활동지를 작성함", "~에 대해 발표함", "~하는 모습을 보임", "~한 모습이 돋보임", "~하는 능력이 뛰어남", "~에 두각을 보임", "~하는 태도를 지님", "~하여 동료들로부터 좋은 평가를 받음", "~을 비판적 시각에서 재구성하는 능력이 뛰어남", "~하겠다는 실천 계획까지 밝힌 점이 돋보임"],
};

// ── 작성 도우미 ───────────────────────────────────────────────────────────
// 문장 나누기: 마침표·물음표·느낌표·줄바꿈 기준(숫자 사이 마침표는 그대로).
export function splitSentences(text = "") {
  const out = [];
  String(text || "").replace(/\r\n?/g, "\n").split("\n").forEach(line => {
    let buf = "";
    const chars = Array.from(line);
    chars.forEach((ch, i) => {
      buf += ch;
      const next = chars[i + 1] || "";
      if (/[.?!]/.test(ch) && !(/\d/.test(chars[i - 1] || "") && /\d/.test(next)) && (!next || /\s/.test(next))) { if (buf.trim()) out.push(buf.trim()); buf = ""; }
    });
    if (buf.trim()) out.push(buf.trim());
  });
  return out;
}
const normSentence = text => String(text || "").replace(/[\s.,'"!?·()\-~…‘’“”]/g, "");
const bigrams = text => { const set = new Set(); for (let i = 0; i < text.length - 1; i += 1) set.add(text.slice(i, i + 2)); return set; };
function similarity(x, y) {
  if (!x.size || !y.size) return 0;
  let both = 0; x.forEach(g => { if (y.has(g)) both += 1; });
  return (2 * both) / (x.size + y.size);
}
export const DUP_MIN_CHARS = 5;
export const DUP_SIMILAR_MIN_CHARS = 15;
export const DUP_SIMILAR_RATIO = 0.8;

// 여러 학생에게 겹친 문장 찾기.
// ① 똑같은 문장: 띄어쓰기·기호를 빼고 5자 이상이면 비교
// ② 거의 같은 문장: 15자 이상 문장끼리 글자 짝(2글자) 80% 이상 겹치면 '비슷한 문장'으로 묶음(조사·어미만 바꾼 경우)
// entries: [{ sid, label, text, area?, areaLabel? }] — 영역(자율·진로 등)마다 따로 넣으면 어느 영역에서 겹쳤는지 알려 줘요.
// ignore: 같은 문장이 여러 학생에게 들어가는 게 정상인 글(예: 부서 행사 특기사항 원문). 이 글의 문장과 같거나 비슷한 문장은 빼요.
export function findDuplicateSentences(entries = [], { ignore = [] } = {}) {
  const ignoreKeys = new Set();
  const ignoreLong = [];
  ignore.forEach(text => splitSentences(text).forEach(sentence => {
    const key = normSentence(sentence);
    if (key.length < DUP_MIN_CHARS || ignoreKeys.has(key)) return;
    ignoreKeys.add(key);
    if (key.length >= DUP_SIMILAR_MIN_CHARS) ignoreLong.push({ key, grams: bigrams(key) });
  }));
  const ignored = new Map();
  const isIgnored = key => {
    if (ignoreKeys.has(key)) return true;
    if (key.length < DUP_SIMILAR_MIN_CHARS || !ignoreLong.length) return false;
    if (ignored.has(key)) return ignored.get(key);
    const grams = bigrams(key);
    const hit = ignoreLong.some(other => Math.min(key.length, other.key.length) / Math.max(key.length, other.key.length) >= DUP_SIMILAR_RATIO && similarity(grams, other.grams) >= DUP_SIMILAR_RATIO);
    ignored.set(key, hit);
    return hit;
  };
  const same = (p, q) => p.sid === q.sid && (p.area || "") === (q.area || "");
  const map = new Map();
  entries.forEach(({ sid, label, text, area = "", areaLabel = "" }) => splitSentences(text).forEach(sentence => {
    const key = normSentence(sentence);
    if (key.length < DUP_MIN_CHARS || isIgnored(key)) return;
    const item = map.get(key) || { key, sentence, people: [], variants: [] };
    const person = { sid, label, area, areaLabel };
    if (!item.people.some(p => same(p, person))) item.people.push(person);
    map.set(key, item);
  }));
  const items = Array.from(map.values());
  // 비슷한 문장 묶기: 긴 문장만, 아직 묶이지 않은 것끼리
  const long = items.filter(item => item.key.length >= DUP_SIMILAR_MIN_CHARS).sort((a, b) => b.people.length - a.people.length);
  const grams = new Map(long.map(item => [item, bigrams(item.key)]));
  const merged = new Set();
  long.forEach((base, i) => {
    if (merged.has(base)) return;
    for (let j = i + 1; j < long.length; j += 1) {
      const other = long[j];
      if (merged.has(other)) continue;
      const ratio = Math.min(base.key.length, other.key.length) / Math.max(base.key.length, other.key.length);
      if (ratio < DUP_SIMILAR_RATIO) continue;
      if (similarity(grams.get(base), grams.get(other)) < DUP_SIMILAR_RATIO) continue;
      merged.add(other);
      base.variants.push(other.sentence);
      other.people.forEach(p => { if (!base.people.some(q => same(q, p))) base.people.push({ ...p, similar: true }); });
    }
  });
  // 여러 학생(또는 한 학생의 여러 영역)에 들어간 것만
  return items.filter(item => !merged.has(item) && item.people.length >= 2)
    .map(({ key, ...item }) => {
      const areas = {};
      item.people.forEach(p => { if (p.areaLabel) areas[p.areaLabel] = (areas[p.areaLabel] || 0) + 1; });
      return { ...item, similar: item.variants.length > 0, count: new Set(item.people.map(p => p.sid)).size, areas };
    })
    .sort((a, b) => b.count - a.count || b.people.length - a.people.length);
}

// AI 요청문: 학생 이름은 빼고, 관찰 기록만 근거로 기재요령·바이트 조건을 담아 만듭니다.
// 규칙은 '꼭 지킬 것' 번호 목록으로 맨 앞에 두고, 마지막에 스스로 점검하게 해요(긴 목록 중간 규칙을 AI가 놓치지 않게).
// notes: [[라벨, 글]] — 소감문은 라벨이 '소감문:'으로 시작해요. activities: 여러 활동일 때 활동 이름(줄 시작 어투를 돌려 쓰게)
// 분량: 한도 대비 채울 비율(%). 기본 = 75-90%
export const AI_FILL = { short: { label: "짧게", lo: 50, hi: 65 }, normal: { label: "보통", lo: 75, hi: 90 }, full: { label: "꽉 채워", lo: 90, hi: 98 } };
export const AI_FILL_DEFAULT = "normal";
export function buildAiPrompt({ area = "", subject = "", activity = "", budget = 1500, notes = [], existing = "", studentName = "", standards = [], example = "", frame = true, hope = "", multi = false, activities = [], fill = AI_FILL_DEFAULT }) {
  // activities: 활동 이름 문자열 또는 { name, date }
  const acts = activities.map(item => (typeof item === "string" ? { name: item, date: "" } : { name: String(item?.name || ""), date: String(item?.date || "") })).filter(item => item.name.trim());
  const actNames = acts.map(item => item.name);
  const hide = text => { let value = String(text || ""); if (studentName && studentName.length >= 2) value = value.split(studentName).join("학생"); return value.trim(); };
  const noteLines = notes.map(([label, text]) => [label, hide(text)]).filter(([, text]) => text);
  const fromReflection = noteLines.some(([label]) => /소감문/.test(label));
  const chars = Math.floor(budget / 3);
  const rules = [
    `분량: 나이스 기준 ${budget.toLocaleString()}바이트 이내(한글 1자 3바이트, 영문·숫자·공백 1바이트, 줄 바꿈 2바이트), 한글로 약 ${chars}자 이내`,
    (() => { const f = AI_FILL[fill] || AI_FILL[AI_FILL_DEFAULT]; const lo = Math.floor((chars * f.lo) / 100), hi = Math.floor((chars * f.hi) / 100); return fill === "short"
      ? `분량은 간결하게: 한글 약 ${lo}-${hi}자로, 활동마다 핵심 행동과 태도를 1-2문장으로 쓰기`
      : `분량 목표: 한글 약 ${lo}-${hi}자. 활동마다 무엇을 했는지(상황·맡은 일), 어떻게 했는지(과정·방법), 어떤 결과가 나왔는지를 자료 속 구체적인 사실(본 사례, 조사·토의·발표한 내용, 만든 것, 맡은 역할)로 채우기. 단, 자료에 없는 사실을 지어내지 않기`; })(),
    "한 단락 안에서 같은 서술어를 되풀이하지 않기: '~에 참여하여'로 시작했다면 그 단락을 '참여함'으로 끝내지 말고, 마지막 문장은 학생이 한 구체적인 행동(정리함, 제시함, 실천함, 공유함 등)으로 맺기",
    "태도 문장으로 분량을 채우지 않기: '집중함', '경청함', '진지하게 임함', '성실히 참여함', '끝까지 흐트러짐 없이' 같은 태도 표현은 활동마다 한 번만 쓰기. 같은 뜻을 말만 바꿔 되풀이하지 않기. 모든 문장에 새로운 사실이 하나씩 들어가야 하며, 자료의 사실이 모자라면 분량 목표보다 짧아도 괜찮음",
    "교사가 관찰한 사실로 쓰기: 학생이 '무엇을 하고 어떻게 행동했는지'만 쓰고, 학생 입장·내면 표현은 쓰지 않기(이해함, 깨달음, 알게 됨, 느낌, 배움, 다짐함, 생각함, 결심함, 인식함, 체득함, 성찰함 등)",
    "문장을 '분석함', '파악함', '고찰함', '이해함'처럼 머릿속 활동으로 끝내지 않기. 눈에 보이는 행동과 결과로 끝내기(예: '~을 분석함' → '~을 분석해 개선 방안을 제시함', '~을 파악함' → '~을 조사해 표로 정리하고 발표함')",
    ...(fromReflection ? ["소감문은 학생이 쓴 글이에요. 결과물에 '소감문', '글', '서술함', '진술함', '기술함', '~라고 밝힘'처럼 글을 썼다는 표현을 쓰지 말고, 소감문에 드러난 활동 사실만 골라 활동 기록으로 바꿔 쓰기(학생의 생각·다짐·느낀 점은 옮기지 않기)"] : []),
    "사람·이름 쓰지 않기: 강사, 강연자, 연사, 멘토, 교수, 직업인 같은 인물과 직함, 이름. 대학·기관·상호명(동영상 플랫폼·대화형 인공지능 등은 일반 명칭), 대회, 수상, 자격증, 논문, 어학시험, 모의고사 성적도 쓰지 않기",
    ...(multi
      ? [
        "활동이 여러 개예요. 활동마다 줄을 바꿔 따로 쓰기(활동 하나 = 한 단락, 빈 줄 없이 줄 바꿈만)",
        "서로 관련 없는 활동을 '~에서는', '~에서도', '또한 ~에서는'처럼 억지로 이어 한 문장·한 문단으로 만들지 않기",
        `단락(활동) 시작 어투를 서로 다르게: '~에 참여하여', '~에서', '~을 통해'를 번갈아 쓰고, 필요하면 '~을 맡아', '~하는 과정에서'도 쓰기(같은 시작 어투를 두 번 연달아 쓰지 않기)${actNames.length > 1 ? ` — 예: ${actNames.slice(0, 3).map((name, k) => `${name}${["에 참여하여", "에서", "을 통해"][k]}`).join(" / ")}` : ""}`,
      ]
      : ["한 문단으로 쓰되, 서로 관련 없는 내용을 '~에서는', '~에서도'처럼 억지로 잇지 않기. 문장 시작 표현은 '~에 참여하여', '~에서', '~을 통해' 등을 번갈아 다양하게"]),
    "문장 끝을 다양하게: '돋보임', '보임' 같은 같은 끝맺음을 이어 쓰지 않기(~함, ~임, ~을 보임, ~이 돋보임, ~을 이끎, ~에 기여함 등을 섞기)",
    "현재형 명사형 종결(~함, ~임, ~하는 모습을 보임)로 끝내기. 과거형(했음, 하였음, 알 수 있었음)은 쓰지 않기",
    "특수기호(가운데점, 둥근 따옴표, 대괄호, 물결표) 쓰지 않기. 문자는 한글로. 학생 이름은 쓰지 않기",
    "자료에 없는 활동이나 성과는 지어내지 않기",
    `활동 이름은 ${actNames.length ? "[활동 목록]에" : "자료에"} 적힌 그대로 쓰기(낱말을 바꾸거나 덧붙이거나 다른 행사와 섞지 않기)`,
    "날짜·기간·시간은 쓰지 않기(예: '(2026.04.17.)', '(3.30.-6.26.)', '(10시간)'처럼 활동 이름 뒤에 괄호로 붙이지 않기)",
    ...(hope ? [`학생의 진로희망을 고려해 쓰기${/자율|자치/.test(area) ? "(자율·자치활동에서도 진로와 이어지는 관심·역량이 드러나는 부분을 살리기)" : ""}. 단, 자료에 있는 내용만 자연스럽게 연결하고 진로와 억지로 엮거나 지어내지 않기`] : []),
    ...(subject && frame ? ["구성: 학생의 성취수준 → 평가 과제에서 관찰한 수행 과정과 결과(근거) → 드러난 교과역량 → 교사 총평 순서를 참고하기"] : []),
  ];
  return [
    `당신은 고등학교 교사의 학교생활기록부 '${area}' 초안을 쓰는 도우미입니다.`,
    "아래 [자료]만 근거로, 교사가 학생을 관찰해 쓴 기록처럼 작성해 주세요.",
    "",
    "[꼭 지킬 것]",
    ...rules.map((rule, k) => `${k + 1}. ${rule}`),
    "",
    `[과목·영역] ${[subject, activity].filter(Boolean).join(" / ") || area}`,
    ...(hope ? [`[학생 진로희망] ${hide(hope)}`] : []),
    ...(acts.length ? [`[활동 목록] ${actNames.join(", ")}`] : []),
    ...(standards.length ? ["[이 활동의 성취기준: 활동이 겨냥한 목표예요. 문장을 그대로 옮기지 말고, 자료 가운데 이 목표와 이어지는 학생의 구체적인 행동·성장을 드러내 주세요]", ...standards.map(line => `- ${line}`)] : []),
    ...(example ? ["[문체·구성 참고 예시: 다른 학생의 기록이에요. 문장 길이와 구성만 참고하고 내용·표현은 따라 쓰지 마세요]", example] : []),
    "",
    "[자료]",
    ...(noteLines.length ? noteLines.map(([label, text]) => `(${label})\n${text}`) : ["(자료가 비어 있어요. 활동 내용을 직접 적어 주세요.)"]),
    ...(hide(existing) ? ["", "[지금까지 쓴 글: 이 글을 위 조건에 맞게 다듬어 주세요]", hide(existing)] : []),
    "",
    `[출력 전 스스로 점검] 위 1~${rules.length}번을 하나씩 확인하고, 어긋난 문장은 고친 뒤 생기부에 바로 붙여 넣을 본문만 출력해 주세요(제목·설명·머리말 없이).`,
  ].join("\n");
}

// 점검 탭: 엑셀 첫 시트(2차원 배열)에서 학생 줄과 글 칸 찾기
const ID_HEADERS = ["번호", "학번", "이름", "반", "성명"];
const limitForHeader = (label, grade = "") => {
  const v = String(label || "").replace(/\s+/g, "");
  if (/자율|자치/.test(v)) return areaLimit("autonomy", grade);
  if (/진로/.test(v)) return areaLimit("career", grade);
  if (/행동|행발|종합의견/.test(v)) return areaLimit("behavior", grade);
  return areaLimit("subject", grade);
};
export function parseCheckSheet(aoa = [], { grade = "" } = {}) {
  const headerRow = aoa.findIndex(row => (row || []).some(cell => /이름|성명|학번/.test(String(cell || ""))));
  if (headerRow < 0) return { error: "첫 줄(머리글)에 '이름' 또는 '학번' 칸이 있어야 해요. 양식을 받아 써 주세요." };
  const header = aoa[headerRow].map(cell => String(cell ?? "").trim());
  const idx = name => header.findIndex(h => h.replace(/\s+/g, "") === name);
  const nameCol = idx("이름") >= 0 ? idx("이름") : idx("성명");
  const sidCol = idx("학번"), noCol = idx("번호");
  const textCols = header.map((label, col) => ({ label, col })).filter(({ label }) => label && !ID_HEADERS.includes(label.replace(/\s+/g, "")) && !/바이트|글자|점검/.test(label));
  if (!textCols.length) return { error: "점검할 글 칸(예: 과세특, 자율·자치활동)을 찾지 못했어요." };
  const rows = aoa.slice(headerRow + 1).map(row => ({
    no: noCol >= 0 ? String(row?.[noCol] ?? "").trim() : "",
    sid: sidCol >= 0 ? String(row?.[sidCol] ?? "").trim() : "",
    name: nameCol >= 0 ? String(row?.[nameCol] ?? "").trim() : "",
    texts: textCols.map(({ col }) => String(row?.[col] ?? "").replace(/\r\n?/g, "\n").trim()),
  })).filter(row => row.name || row.sid || row.texts.some(Boolean));
  // 학년을 모르면 학번 첫 자리로(가장 많은 학년)
  let g = String(grade || "");
  if (!g) { const count = {}; rows.forEach(row => { const d = String(row.sid).charAt(0); if (/[1-3]/.test(d)) count[d] = (count[d] || 0) + 1; }); g = Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] || ""; }
  return { columns: textCols.map(({ label }) => ({ label, limit: limitForHeader(label, g) })), rows };
}


// ── 학교 행사 특기사항 취합 파일(부서별 시트) 읽기 ─────────────────────────
// sheets: [{ name, rows(aoa) }] → { items: [{ sid, area, event, text, eventKey }], skipped: { noArea, otherArea, merged } }
// 머리글 줄에 '학번'과 '특기사항'이 있는 시트만 읽어요(봉사·학적·제출 확인 시트는 건너뜀).
// 생기부 영역: '자율'/'자치' → autonomy, '진로' → career. 그 밖(동아리 등)은 건너뛰어요.
export function eventAreaOf(value) {
  const v = String(value ?? "").replace(/\s+/g, "");
  if (/진로/.test(v)) return "career";
  if (/자율|자치/.test(v)) return "autonomy";
  return "";
}
export const eventKeyOf = (area, event) => `${area}:${String(event ?? "").normalize("NFC").replace(/\s+/g, " ").trim()}`;
const cellText = value => String(value ?? "").replace(/\r/g, "").trim();
const sidOf = value => { const digits = String(value ?? "").replace(/\.0+$/, "").replace(/\D/g, ""); return /^\d{5}$/.test(digits) ? digits : ""; };
// 부서 시트를 학생별로 모아 둔 시트(예: '전체취합본', '학번순' — 머리글에 '자동입력')는 같은 내용이 행사 이름을 합친 채로
// 또 들어 있어서 읽지 않아요. 부서명도 담지 않아요(행사명·영역·특기사항만).
export function parseEventSheets(sheets = []) {
  const merged = sheets.filter(sheet => isMergedEventSheet(sheet)).map(sheet => sheet.name);
  const result = parseEventSheetsOnce(sheets.filter(sheet => !isMergedEventSheet(sheet)));
  return { items: result.items, skipped: { ...result.skipped, merged: merged.join(", ") } };
}
function eventHeaderOf(rows = []) {
  const headerRow = rows.slice(0, 8).findIndex(row => (row || []).some(cell => /학번/.test(cellText(cell))) && (row || []).some(cell => /^특기\s*사항/.test(cellText(cell))));
  return headerRow < 0 ? null : { headerRow, header: rows[headerRow].map(cell => cellText(cell).replace(/\s+/g, " ")) };
}
function isMergedEventSheet({ name = "", rows = [] }) {
  const head = eventHeaderOf(rows);
  if (!head) return false;
  return /취합|학번순/.test(name) || head.header.some(h => /^특기\s*사항/.test(h) && /자동\s*입력/.test(h));
}
function parseEventSheetsOnce(sheets = []) {
  const best = new Map();
  const skipped = { noArea: 0, otherArea: 0 };
  sheets.forEach(({ name = "", rows = [] }) => {
    const headerRow = rows.slice(0, 8).findIndex(row => (row || []).some(cell => /학번/.test(cellText(cell))) && (row || []).some(cell => /^특기\s*사항/.test(cellText(cell))));
    if (headerRow < 0) return;
    const header = rows[headerRow].map(cell => cellText(cell).replace(/\s+/g, " "));
    const find = test => header.findIndex(test);
    const sidCol = find(h => /학번/.test(h));
    const textCol = find(h => /^특기\s*사항/.test(h) && !/점검|바이트|제출|필터/.test(h));
    const areaCol = find(h => /영역/.test(h));
    const eventCol = find(h => /행사명|특강명|활동명/.test(h));
    if (sidCol < 0 || textCol < 0) return;
    rows.slice(headerRow + 1).forEach(row => {
      const sid = sidOf(row?.[sidCol]);
      const text = cellText(row?.[textCol]);
      if (!sid || !text) return;
      const rawArea = areaCol >= 0 ? cellText(row[areaCol]) : "";
      const area = eventAreaOf(rawArea);
      if (!area) { skipped[rawArea ? "otherArea" : "noArea"] += 1; return; }
      const event = (eventCol >= 0 ? cellText(row[eventCol]) : "") || String(name).replace(/특기\s*사항.*$/, "").replace(/[()]/g, " ").trim() || "학교 행사";
      const eventKey = eventKeyOf(area, event);
      const key = `${sid}|${eventKey}`;
      const prev = best.get(key);
      if (!prev || text.length > prev.text.length) best.set(key, { sid, area, event, text, eventKey });
    });
  });
  return { items: Array.from(best.values()), skipped };
}

// ── 나이스에서 내려받은 생기부 엑셀(영역 구분·학년도·학년·반·번호·성명·특기사항) 읽기 ─────────
// 영역 구분: '자율·자치활동_특기사항' → autonomy, '진로활동_특기사항' → career, '행동특성 및 종합의견' → behavior
export function neisAreaOf(value) {
  const v = String(value ?? "").replace(/\s+/g, "");
  if (/행동|종합의견/.test(v)) return "behavior";
  if (/진로/.test(v)) return "career";
  if (/자율|자치/.test(v)) return "autonomy";
  return "";
}
// sheets: [{ name, rows(aoa) }] → { rows: [{ sid, grade, cls, no, area, text }], skipped: { otherArea, noStudent } }
export function parseNeisRecordSheets(sheets = []) {
  const out = []; const skipped = { otherArea: 0, noStudent: 0 };
  sheets.forEach(({ name = "", rows = [] }) => {
    const headerRow = rows.slice(0, 8).findIndex(row => { const cells = (row || []).map(cell => cellText(cell).replace(/\s+/g, "")); return cells.includes("반") && cells.includes("번호") && cells.some(c => /^특기사항$|^종합의견$|특기사항/.test(c)); });
    if (headerRow < 0) return;
    const header = rows[headerRow].map(cell => cellText(cell).replace(/\s+/g, ""));
    const col = test => header.findIndex(test);
    const areaCol = col(h => /영역/.test(h));
    const gradeCol = col(h => h === "학년");
    const classCol = col(h => h === "반");
    const noCol = col(h => h === "번호");
    const textCol = col(h => /특기사항|종합의견/.test(h) && !/영역/.test(h));
    const hopeCol = col(h => /희망분야|진로희망|희망/.test(h));
    if (classCol < 0 || noCol < 0 || textCol < 0) return;
    rows.slice(headerRow + 1).forEach(row => {
      const area = neisAreaOf(areaCol >= 0 ? row?.[areaCol] : name) || neisAreaOf(name);
      if (!area) { if ((row || []).some(cell => cellText(cell))) skipped.otherArea += 1; return; }
      const grade = parseInt(String(gradeCol >= 0 ? row?.[gradeCol] : "").replace(/\D/g, ""), 10);
      const cls = parseInt(String(row?.[classCol] ?? "").replace(/\D/g, ""), 10);
      const no = parseInt(String(row?.[noCol] ?? "").replace(/\.0+$/, "").replace(/\D/g, ""), 10);
      if (!grade || !cls || !no) { if ((row || []).some(cell => cellText(cell))) skipped.noStudent += 1; return; }
      const sid = `${grade}${String(cls).padStart(2, "0")}${String(no).padStart(2, "0")}`;
      out.push({ sid, grade: String(grade), cls: String(cls), no, area, text: cellText(row?.[textCol]).replace(/\r\n?/g, "\n"), hope: hopeCol >= 0 ? cellText(row?.[hopeCol]) : "" });
    });
  });
  return { rows: out, skipped };
}

// 칸 안의 행사 특기사항 원문을 행사마다 한 줄로(앞뒤에 줄 바꿈). 원문이 그대로 들어 있는 경우만 고쳐요.
export function lineBreakEvents(field = "", texts = []) {
  let out = String(field || "");
  Array.from(new Set(texts.map(t => String(t || "").trim()).filter(t => t.length >= 5))).forEach(t => {
    const idx = out.indexOf(t);
    if (idx < 0) return;
    const before = out.slice(0, idx).replace(/[ \t]+$/, "");
    const after = out.slice(idx + t.length).replace(/^[ \t]+/, "");
    out = `${before}${before && !before.endsWith("\n") ? "\n" : ""}${t}${after && !after.startsWith("\n") ? "\n" : ""}${after}`;
  });
  return out;
}

// 칸에 행사 글이 (고쳐 썼더라도) 남아 있는지: 원문 그대로이거나, 원문 문장 중 하나가 거의 그대로 있거나, 글자 조각이 절반 넘게 겹치면 '있음'
export function eventInField(field = "", text = "") {
  const f = String(field || ""); const t = String(text || "").trim();
  if (!t || !f.trim()) return false;
  if (f.includes(t)) return true;
  const nf = normSentence(f);
  if (splitSentences(t).some(sentence => { const k = normSentence(sentence); return k.length >= 10 && nf.includes(k); })) return true;
  const gt = bigrams(normSentence(t)); const gf = bigrams(nf);
  if (!gt.size) return false;
  let hit = 0; gt.forEach(g => { if (gf.has(g)) hit += 1; });
  return hit / gt.size >= 0.5;
}
