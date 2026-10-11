// 같은 대학·모집단위의 수능최저 전형 목록에서 '이름만 다른 같은 전형'을 하나로 합칩니다.
// NAVI(2027)·최저 자료집(2028)·학교 자료가 같은 전형을 다르게 부르는 경우가 많습니다.
//   예) 교과우수자(학교장추천) = 교과우수자, 교과우수자(학교장추천 I/II) = 교과성적우수자,
//       국민프런티어 / 알고리즘우수자 ⊃ 국민프런티어,
//       '네오르네상스' 한 줄에 "(면접형): 미적용 / (서류형): …"이 몰려 있는데 두 전형이 따로 있는 경우.
// 같은 전형유형 + 같은 판정·조건일 때만 합치므로, 조건이 다른 전형은 이름이 비슷해도 그대로 둡니다.

const ROMAN = { "Ⅰ": "I", "Ⅱ": "II", "Ⅲ": "III", "Ⅳ": "IV" };
const norm = value => String(value || "").replace(/[ⅠⅡⅢⅣ]/g, ch => ROMAN[ch]).replace(/\s+/g, "").replace(/전형$/, "").toLowerCase();
const stripParen = value => String(value || "").replace(/\([^)]*\)|\[[^\]]*\]/g, "");
export const trackBase = value => norm(stripParen(value)).replace(/전형$/, "");

// 괄호 밖의 '/'로만 나눔: "국민프런티어 / 알고리즘우수자" → 2개, "교과우수자(학교장추천 I / II)" → 1개
export const trackParts = value => {
  const parts = [];
  let depth = 0, current = "";
  for (const ch of String(value || "")) {
    if (ch === "(" || ch === "[") depth += 1;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "/" && depth === 0) { parts.push(current); current = ""; } else current += ch;
  }
  parts.push(current);
  return parts.map(part => part.trim()).filter(Boolean);
};

// "학생부종합 (가천의약학)" → "가천의약학" 처럼 앞의 일반 명칭을 걷어내고, ※ 메모는 버림
const canonical = value => {
  // "학생부교과우수자"처럼 이름 일부인 경우는 그대로 두고, 괄호나 띄어쓰기로 감싼 경우만 벗김
  let text = norm(String(value || "").replace(/※.*$/, "").trim().replace(/^(학생부교과|학생부종합)(\s*(?=\()|\s+)/, ""));
  const wrapped = text.match(/^\(([^)]*)\)(.*)$/);
  if (wrapped) text = wrapped[1] + wrapped[2];
  return text.replace(/전형$/, "");
};
// 세부 구분(괄호 안, '-' 뒤): 면접형/서류형, 인문/자연, 지역균형/일반 …
const qualifier = text => {
  const inParen = [...text.matchAll(/\(([^)]*)\)/g)].map(match => match[1]).join("");
  const plain = text.replace(/\([^)]*\)/g, "");
  const dash = plain.includes("-") ? plain.slice(plain.indexOf("-") + 1) : "";
  return inParen + dash;
};
const coreName = text => text.replace(/\([^)]*\)/g, "").replace(/-.*$/, "").replace(/전형$/, "");
const NUMERAL = { "1": "i", "2": "ii", "3": "iii", "4": "iv" };
const numerals = text => new Set([...text.matchAll(/(?<=[가-힣)])(iv|iii|ii|i|[1-4])(?![a-z0-9])/g)].map(match => NUMERAL[match[1]] || match[1]));
const TOKEN_GROUPS = [["면접", "서류", "학업"], ["인문", "자연"], ["추천형", "일반형"]];
const sameSet = (a, b) => a.size === b.size && [...a].every(item => b.has(item));
const variantConflict = (a, b) => {
  for (const group of TOKEN_GROUPS) {
    const x = new Set(group.filter(token => a.includes(token)));
    const y = new Set(group.filter(token => b.includes(token)));
    if (x.size && y.size && !sameSet(x, y)) return true;
  }
  const na = numerals(a), nb = numerals(b);
  if (na.size && nb.size && !sameSet(na, nb)) return true;
  const qa = qualifier(a), qb = qualifier(b);
  return !!(qa && qb && !qa.startsWith(qb) && !qb.startsWith(qa));
};

const bigrams = text => { const out = new Set(); for (let i = 0; i < text.length - 1; i++) out.add(text.slice(i, i + 2)); return out; };
const similarity = (a, b) => {
  const x = bigrams(a), y = bigrams(b);
  if (!x.size || !y.size) return 0;
  let common = 0; x.forEach(item => { if (y.has(item)) common += 1; });
  return common / (x.size + y.size - common);
};

const partsRelated = (a, b) => {
  const ca = canonical(a), cb = canonical(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  if (variantConflict(ca, cb)) return false;
  const ba = coreName(ca), bb = coreName(cb);
  if (!ba || !bb) return false;
  if (ba === bb) return true;
  if (Math.min(ba.length, bb.length) >= 3 && (ba.startsWith(bb) || bb.startsWith(ba))) return true;
  return ba.slice(0, 2) === bb.slice(0, 2) && similarity(ba, bb) >= 0.4;
};

// 같은 전형을 다르게 부른 것인지(면접형/서류형, 인문/자연, Ⅰ/Ⅱ처럼 세부 구분이 다르면 다른 전형)
export function tracksRelated(a, b) {
  const pa = trackParts(a), pb = trackParts(b);
  return pa.some(x => pb.some(y => partsRelated(x, y)));
}

const compactRule = text => String(text || "").replace(/\s+/g, "").replace(/이내|등급|영역/g, "").replace(/[.,·]/g, "");
// 판정·조건이 같은지 비교하는 열쇠
export function evaluationSignature(evaluation = {}) {
  const status = evaluation?.status || "";
  if (status === "no-minimum") return "none";
  const numeric = evaluation?.count != null && evaluation?.threshold != null ? `${evaluation.ruleType || ""}${evaluation.count}:${evaluation.threshold}` : "";
  return [status, evaluation?.year || "", numeric || compactRule(evaluation?.ruleText || evaluation?.reason)].join("|");
}

// "A(면접형): 미적용 / A(서류형): 국, 수 …" 처럼 여러 전형을 한 줄에 모은 원문인지
const aggregateNames = evaluation => {
  const text = String(evaluation?.ruleText || "");
  const parts = text.split(/\s+\/\s+/);
  if (parts.length < 2) return [];
  const names = parts.map(part => { const at = part.indexOf(":"); return at > 0 ? part.slice(0, at).trim() : ""; });
  return names.every(Boolean) ? names : [];
};

// items: [{ admissionType, track, evaluation, ... }] → 합친 목록(대표 이름은 더 자세한 쪽, aliases에 나머지 이름)
export function mergeDuplicateTracks(items = []) {
  const list = items.map((item, index) => ({ ...item, __index: index, aliases: [...(item.aliases || [])] }));
  // 1) 하위 전형이 따로 있는 '모음 줄' 빼기
  const dropped = new Set();
  list.forEach(item => {
    const names = aggregateNames(item.evaluation);
    if (!names.length) return;
    const covered = names.filter(name => list.some(other => other !== item && other.admissionType === item.admissionType && (norm(other.track) === norm(name) || trackBase(other.track) === trackBase(name) && norm(other.track) !== norm(item.track))));
    if (covered.length === names.length) dropped.add(item.__index);
  });
  // 2) 같은 유형 · 같은 판정 · 이름이 이어지는 것끼리 합치기
  const kept = [];
  list.filter(item => !dropped.has(item.__index)).forEach(item => {
    const sig = evaluationSignature(item.evaluation);
    const twin = kept.find(other => other.admissionType === item.admissionType && evaluationSignature(other.evaluation) === sig && tracksRelated(other.track, item.track));
    if (!twin) { kept.push(item); return; }
    // 더 자세한(긴) 이름을 대표로
    const [primary, secondary] = norm(item.track).length > norm(twin.track).length ? [item, twin] : [twin, item];
    if (primary !== twin) {
      const at = kept.indexOf(twin);
      kept[at] = { ...primary, aliases: [...new Set([...primary.aliases, ...twin.aliases, twin.track])] };
    } else if (norm(secondary.track) !== norm(primary.track)) {
      twin.aliases = [...new Set([...twin.aliases, secondary.track])];
    }
  });
  return kept;
}
