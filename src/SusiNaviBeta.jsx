import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ChevronUp,
  Database,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Network,
  Printer,
  Upload,
  X,
} from "lucide-react";
import { readStorage, writeStorage } from "./storage.js";

const STORAGE_KEY = "kd_susi_navi_beta_v1";
const SCHEMA_VERSION = 1;
const PAGE_SIZE = 12;
const CONVERSION_GROUPS = ["전교과", "국수영사과", "국수영과", "국수영사"];
const CONVERSION_PREF_KEY = "kd_susi_navi_conversion_pref_v1";
const CUTOFF_PREF_KEY = "kd_susi_navi_cutoff_pref_v1";
const CONNECTION_PAGE_SIZE = 12;
const NAVI_VIEW_STATE_PREFIX = "kd_susi_navi_view_state_patch51";

function naviViewStateKey(studentSid = "") {
  return `${NAVI_VIEW_STATE_PREFIX}:${String(studentSid || "staff")}`;
}
function readNaviViewState(studentSid = "") {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(naviViewStateKey(studentSid)) || "null");
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}
function writeNaviViewState(studentSid = "", value = {}) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(naviViewStateKey(studentSid), JSON.stringify(value));
  } catch {
    // sessionStorage가 차단된 환경에서는 화면 상태만 유지합니다.
  }
}

// records compact schema
// [권역, 지역, 세부지역, 대학, 2026모집단위, 2027모집단위, 계열, 교과전형[], 종합전형[], 정시정보]
// 전형: [전형명, 50%, 70%, 50%(5등급), 70%(5등급)]
// 정시정보: [전형명, 모집단위, 70%백분위, 영어/한국사, 반영영역]
// minimums compact schema
// [지역, 대학, 전형유형, 전형명, 계열, 모집단위, 반영영역, 반영영역수, 등급기준, 평균등급, 비고, 변경]
// conversions compact schema
// [5등급, 누적비, 전교과범위, 전교과값, 국수영사과범위, 값, 국수영과범위, 값, 국수영사범위, 값]

let betaCache = null;
let betaCachePromise = null;

function normalizeText(value) {
  return String(value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}
function compactText(value) {
  return normalizeText(value).replace(/\s+/g, "").toLowerCase();
}
function normalizeUniversityAliasText(value) {
  return normalizeText(value)
    .replace(/[（]/g, "(").replace(/[）]/g, ")")
    .replace(/에리카/gi, "ERICA")
    .replace(/국립/g, "")
    .replace(/여자대학교/g, "여대")
    .replace(/여자대/g, "여대")
    .replace(/대학교/g, "대")
    .replace(/교육대/g, "교대")
    .replace(/\s*캠퍼스/gi, "")
    .replace(/[()\[\]{}\/|·,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function explicitCampusToken(value) {
  const text = normalizeText(value);
  if (/ERICA|에리카/i.test(text)) return "ERICA";
  return ["메디컬", "글로벌", "국제", "서울", "수원", "죽전", "천안", "안양", "성남"]
    .find(campus => new RegExp(`(?:\\(|\\s|\\/|^)${campus}(?:캠퍼스)?(?:\\)|\\s|\\/|$)`, "i").test(text)) || "";
}
function cleanCell(value) {
  const text = normalizeText(value);
  return text === "-" || text === "*" || /^#(?:N\/A|REF!|VALUE!|DIV\/0!|NUM!)$/.test(text) ? "" : text;
}
function numberOrNull(value) {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
}
function clampGrade(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.min(5, Math.max(1, Math.round(num * 100) / 100));
}
function legacyConvert(value) {
  const num = clampGrade(value);
  return num == null ? null : Math.round((2 * num - 1) * 100) / 100;
}
function sourceDateFromName(name) {
  const match = String(name || "").match(/(?:^|\D)(\d{2})(\d{2})(\d{2})(?:\D|$)/);
  if (!match) return "";
  return `20${match[1]}-${match[2]}-${match[3]}`;
}
function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function humanBytes(bytes) {
  const num = Number(bytes || 0);
  if (num < 1024) return `${num} B`;
  if (num < 1024 ** 2) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / 1024 ** 2).toFixed(1)} MB`;
}
function admissionEntry(row, start) {
  const track = cleanCell(row[start]);
  if (!track) return null;
  return [track, numberOrNull(row[start + 1]), numberOrNull(row[start + 2]), numberOrNull(row[start + 3]), numberOrNull(row[start + 4])];
}
function hasRegular(info) {
  return Array.isArray(info) && info.some(item => cleanCell(item));
}
function unique(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko"));
}
const UNIVERSITY_CAMPUS_ALIASES = {
  가천대: { 성남: "글로벌", 인천: "메디컬", 글로벌: "글로벌", 메디컬: "메디컬" },
  한양대: { 서울: "서울", 안산: "ERICA", ERICA: "ERICA" },
  경희대: { 서울: "서울", 용인: "국제", 수원: "국제", 국제: "국제" },
  단국대: { 용인: "죽전", 죽전: "죽전", 천안: "천안" },
  경기대: { 서울: "서울", 수원: "수원" },
  명지대: { 서울: "서울", 용인: "용인" },
};
function canonicalCampus(base, campus) {
  const raw = normalizeText(campus);
  if (!raw) return "";
  const map = UNIVERSITY_CAMPUS_ALIASES[base] || {};
  return map[raw] || map[raw.toUpperCase()] || (raw.toUpperCase() === "ERICA" ? "ERICA" : raw);
}
function readConversionPreference() {
  if (typeof window === "undefined") return { method: "legacy", group: "전교과" };
  try {
    const value = JSON.parse(window.localStorage.getItem(CONVERSION_PREF_KEY) || "null");
    return {
      method: value?.method === "statistical" ? "statistical" : "legacy",
      group: CONVERSION_GROUPS.includes(value?.group) ? value.group : "전교과",
    };
  } catch {
    return { method: "legacy", group: "전교과" };
  }
}
function readCutoffPreference() {
  if (typeof window === "undefined") return "70";
  const value = window.localStorage.getItem(CUTOFF_PREF_KEY);
  return value === "50" ? "50" : "70";
}

function universityBaseKey(value) {
  let text = normalizeText(value)
    .replace(/[（]/g, "(").replace(/[）]/g, ")")
    // 대학 식별용 기본키에서는 괄호·슬래시 뒤의 캠퍼스/지역 표기를 모두 제외합니다.
    .replace(/\([^)]*\)/g, "")
    .replace(/\s*[\/|]\s*(?:서울|ERICA|에리카|메디컬|글로벌|국제|수원|죽전|천안|안양|성남|인천|안산|용인)(?:캠퍼스)?\s*$/gi, "")
    .replace(/(?:서울|ERICA|에리카|메디컬|글로벌|국제|수원|죽전|천안|안양|성남|인천|안산|용인)\s*캠퍼스/gi, "")
    .replace(/국립/g, "")
    .replace(/여자대학교/g, "여대")
    .replace(/대학교/g, "대")
    .replace(/교육대/g, "교대");
  const aliases = {
    한양대학교: "한양대", 한양: "한양대",
    덕성여자대: "덕성여대", 성신여자대: "성신여대",
    서울여자대: "서울여대", 숙명여자대: "숙명여대",
  };
  text = aliases[text] || text;
  return compactText(text);
}
function universityCampus(value, region = "") {
  const text = normalizeText(value).replace(/[（]/g, "(").replace(/[）]/g, ")");
  const base = universityBaseKey(text);
  let explicit = "";
  if (/ERICA|에리카/i.test(text)) explicit = "ERICA";
  if (!explicit) {
    explicit = ["메디컬", "글로벌", "국제", "서울", "수원", "죽전", "천안", "안양", "성남", "인천", "안산", "용인"]
      .find(campus => new RegExp(`(?:\\(|\\s|\\/|^)${campus}(?:캠퍼스)?(?:\\)|\\s|\\/|$)`, "i").test(text)) || "";
  }
  if (explicit) return canonicalCampus(base, explicit);
  const regionText = normalizeText(region);
  if (base === "한양대") return /경기|안산/.test(regionText) ? "ERICA" : "서울";
  if (base === "가천대") return /인천/.test(regionText) ? "메디컬" : "글로벌";
  return canonicalCampus(base, regionText) || "단일";
}
function universityIdentityKey(value, region = "") {
  return `${universityBaseKey(value)}|${universityCampus(value, region)}`;
}
function universitySearchText(value, region = "") {
  const campus = universityCampus(value, region);
  const aliases = [
    value,
    normalizeUniversityAliasText(value),
    universityBaseKey(value),
    campus,
    `${normalizeUniversityAliasText(value)} ${campus}`,
    `${universityBaseKey(value)} ${campus}`,
    region,
  ];
  return compactText(aliases.join(" "));
}
function queryMatchesRow(row, query) {
  const normalized = normalizeUniversityAliasText(query);
  if (!normalized) return true;
  const tokens = normalized.split(/\s+/).map(compactText).filter(Boolean);
  const haystack = compactText([
    universitySearchText(row?.[3], row?.[1]),
    row?.[0], row?.[1], row?.[2], row?.[4], row?.[5], row?.[6],
    ...(row?.[7] || []).flat(), ...(row?.[8] || []).flat(), ...(row?.[9] || []),
  ].join(" "));
  return tokens.every(token => haystack.includes(token));
}
function addIndexed(map, key, item) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(item);
}
function buildUniversityIndex(rows = [], universityIndex = 1, regionIndex = 0) {
  const exact = new Map();
  const base = new Map();
  rows.forEach(item => {
    const university = item?.[universityIndex];
    if (!university) return;
    addIndexed(exact, universityIdentityKey(university, item?.[regionIndex]), item);
    addIndexed(base, universityBaseKey(university), item);
  });
  return { exact, base };
}
function indexedUniversityRows(index, university, region = "") {
  const exactRows = index?.exact?.get(universityIdentityKey(university, region));
  if (exactRows?.length) return exactRows;
  return index?.base?.get(universityBaseKey(university)) || [];
}
function cutoffValue(item, cutoffBasis = "50") {
  return item?.[cutoffBasis === "70" ? 2 : 1] ?? null;
}
function rowSupportLabels(row, convertedGrade, cutoffBasis = "50") {
  return unique([...(row?.[7] || []), ...(row?.[8] || [])]
    .map(item => supportBand(convertedGrade, cutoffValue(item, cutoffBasis))?.label)
    .filter(Boolean));
}
function compactUnit(value) {
  return compactText(normalizeText(value)
    .replace(/[（]/g, "(").replace(/[）]/g, ")")
    .replace(/\([^)]*\)/g, " ")
    .replace(/학부|학과|전공|계열|모집단위|전공자율선택제|자율전공/g, " "));
}
function unitTokens(value) {
  return unique(normalizeText(value)
    .replace(/[（]/g, "(").replace(/[）]/g, ")")
    .replace(/학부|학과|전공|계열|모집단위|전공자율선택제/g, " ")
    .split(/[\s·,/()\[\]\-]+/)
    .map(compactText)
    .filter(token => token.length >= 2));
}
function unitSimilar(a, b) {
  const left = compactUnit(a);
  const right = compactUnit(b);
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  const leftTokens = unitTokens(a);
  const rightTokens = unitTokens(b);
  return leftTokens.some(token => rightTokens.some(other => token === other || (Math.min(token.length, other.length) >= 3 && (token.includes(other) || other.includes(token)))));
}

function parseDataRows(rows) {
  const result = [];
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const university = cleanCell(row[3]);
    const targetUnit = cleanCell(row[7]);
    if (!university || !targetUnit) continue;
    const teaching = [admissionEntry(row, 11), admissionEntry(row, 17), admissionEntry(row, 23)].filter(Boolean);
    const holistic = [admissionEntry(row, 29), admissionEntry(row, 35)].filter(Boolean);
    const regular = [cleanCell(row[5]), cleanCell(row[6]), numberOrNull(row[42]), cleanCell(row[43]), cleanCell(row[45])];
    result.push([
      cleanCell(row[0]), cleanCell(row[1]), cleanCell(row[2]), university,
      cleanCell(row[4]), targetUnit, cleanCell(row[8]) || "공통",
      teaching, holistic, hasRegular(regular) ? regular : null,
    ]);
  }
  return result;
}

function parseConversionRows(rows) {
  const result = [];
  for (let index = 3; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const grade5 = numberOrNull(row[6]);
    if (grade5 == null || grade5 < 1 || grade5 > 5) continue;
    result.push([
      grade5,
      cleanCell(row[7]),
      cleanCell(row[8]), numberOrNull(row[9]),
      cleanCell(row[10]), numberOrNull(row[11]),
      cleanCell(row[12]), numberOrNull(row[13]),
      cleanCell(row[14]), numberOrNull(row[15]),
    ]);
  }
  return result.sort((a, b) => a[0] - b[0]);
}

function parseMinimumRows(rows) {
  const result = [];
  for (let index = 15; index < rows.length; index += 1) {
    const row = rows[index] || [];
    if (Number(row[1]) !== 2027) continue;
    const university = cleanCell(row[3]);
    if (!university) continue;
    result.push([
      cleanCell(row[2]), university, cleanCell(row[5]), cleanCell(row[6]),
      cleanCell(row[9]), cleanCell(row[10]), cleanCell(row[13]), numberOrNull(row[16]),
      cleanCell(row[17]), numberOrNull(row[19]), cleanCell(row[20]), cleanCell(row[23]),
    ]);
  }
  return result;
}

function cutSet(row, start) {
  return [numberOrNull(row[start]), numberOrNull(row[start + 1]), numberOrNull(row[start + 2]), numberOrNull(row[start + 3])];
}
function parseCaseStatRows(rows) {
  const result = [];
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const university = cleanCell(row[20]) || cleanCell(row[24]) || cleanCell(row[0]);
    const displayUniversity = cleanCell(row[24]) || university;
    const track = cleanCell(row[25]) || cleanCell(row[3]);
    if (!university || !track) continue;
    const groups = [cutSet(row, 27), cutSet(row, 31), cutSet(row, 35), cutSet(row, 39), cutSet(row, 43)];
    if (!groups.some(group => group.some(value => value != null))) continue;
    result.push([
      cleanCell(row[19]), university, cleanCell(row[21]), cleanCell(row[22]) || track, cleanCell(row[23]),
      displayUniversity, track, ...groups,
    ]);
  }
  return result;
}
function parseChanges2028Rows(rows) {
  const result = [];
  for (let index = 8; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const university = cleanCell(row[2]);
    if (!university) continue;
    result.push([cleanCell(row[1]), university, cleanCell(row[3]), cleanCell(row[4]), cleanCell(row[5]), cleanCell(row[6]), cleanCell(row[7]), cleanCell(row[8]), cleanCell(row[9])]);
  }
  return result;
}
function parseCourseRuleRows(rows) {
  const result = [];
  for (let index = 7; index < rows.length; index += 1) {
    const row = rows[index] || [];
    if (Number(row[1]) !== 2027) continue;
    const university = cleanCell(row[3]);
    if (!university) continue;
    result.push([cleanCell(row[2]), university, cleanCell(row[4]), cleanCell(row[5]), cleanCell(row[6]), cleanCell(row[7]), cleanCell(row[8]), cleanCell(row[9]), cleanCell(row[10]), cleanCell(row[11]), cleanCell(row[12]), cleanCell(row[14]), cleanCell(row[15]), cleanCell(row[16]), cleanCell(row[17]), cleanCell(row[18]), cleanCell(row[19]), cleanCell(row[20]), cleanCell(row[21])]);
  }
  return result;
}
function parseScheduleRows(rows) {
  const result = [];
  for (let index = 6; index < rows.length; index += 1) {
    const row = rows[index] || [];
    const university = cleanCell(row[2]);
    if (!university) continue;
    result.push([cleanCell(row[1]), university, cleanCell(row[3]), cleanCell(row[4]), cleanCell(row[5]), cleanCell(row[6]), cleanCell(row[7])]);
  }
  return result;
}

export async function parseSusiNaviWorkbook(file, onProgress = () => {}) {
  onProgress("엑셀 파일을 읽는 중입니다.");
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, dense: true });
  const dataSheet = workbook.Sheets.data;
  const conversionSheet = workbook.Sheets["기타"];
  const minimumSheet = workbook.Sheets["수능최저"];
  const caseSheet = workbook.Sheets["지원데이터"];
  const changeSheet = workbook.Sheets["2028대입"];
  const courseRuleSheet = workbook.Sheets["교과반영"];
  const scheduleSheet = workbook.Sheets["전형일정"];
  if (!dataSheet) throw new Error("필수 시트 'data'를 찾지 못했습니다.");
  if (!conversionSheet) throw new Error("필수 시트 '기타'를 찾지 못했습니다.");

  onProgress("2027 대학·모집단위 자료를 정리하는 중입니다.");
  const dataRows = XLSX.utils.sheet_to_json(dataSheet, { header: 1, defval: "", raw: true, blankrows: false });
  const records = parseDataRows(dataRows);

  onProgress("5·9등급 통계 변환표를 정리하는 중입니다.");
  const conversionRows = XLSX.utils.sheet_to_json(conversionSheet, { header: 1, defval: "", raw: true, blankrows: false });
  const conversions = parseConversionRows(conversionRows);

  onProgress("2027 수능최저 자료를 정리하는 중입니다.");
  const minimumRows = minimumSheet
    ? XLSX.utils.sheet_to_json(minimumSheet, { header: 1, defval: "", raw: true, blankrows: false })
    : [];
  const minimums = parseMinimumRows(minimumRows);

  onProgress("합격사례 분포와 추가 전형자료를 정리하는 중입니다.");
  const sheetRows = sheet => sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true, blankrows: false }) : [];
  const caseStats = parseCaseStatRows(sheetRows(caseSheet));
  const changes2028 = parseChanges2028Rows(sheetRows(changeSheet));
  const courseRules = parseCourseRuleRows(sheetRows(courseRuleSheet));
  const schedules = parseScheduleRows(sheetRows(scheduleSheet));

  if (!records.length) throw new Error("대학·모집단위 자료를 읽지 못했습니다. 파일 버전을 확인해주세요.");
  if (!conversions.length) throw new Error("통계 변환표를 읽지 못했습니다. 파일 버전을 확인해주세요.");

  const payload = {
    schemaVersion: SCHEMA_VERSION,
    source: {
      fileName: file.name,
      fileSize: file.size,
      sourceDate: sourceDateFromName(file.name),
      parsedAt: new Date().toISOString(),
    },
    stats: {
      records: records.length,
      universities: unique(records.map(row => row[3])).length,
      regions: unique(records.map(row => row[1])).length,
      conversions: conversions.length,
      minimums: minimums.length,
      caseStats: caseStats.length,
      changes2028: changes2028.length,
      courseRules: courseRules.length,
      schedules: schedules.length,
    },
    records,
    conversions,
    minimums,
    caseStats,
    changes2028,
    courseRules,
    schedules,
  };
  onProgress("자료 정리가 완료되었습니다.");
  return payload;
}

async function loadBetaData(force = false) {
  if (!force && betaCache) return betaCache;
  if (!force && betaCachePromise) return betaCachePromise;
  betaCachePromise = readStorage(STORAGE_KEY, null).then(value => {
    betaCache = value?.schemaVersion === SCHEMA_VERSION ? value : null;
    betaCachePromise = null;
    return betaCache;
  });
  return betaCachePromise;
}
function updateBetaCache(value) {
  betaCache = value;
  betaCachePromise = null;
}

function nearestConversion(conversions, grade5) {
  const target = clampGrade(grade5);
  if (target == null || !conversions?.length) return null;
  let low = 0;
  let high = conversions.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = conversions[mid][0];
    if (value === target) return conversions[mid];
    if (value < target) low = mid + 1;
    else high = mid - 1;
  }
  const left = conversions[Math.max(0, high)];
  const right = conversions[Math.min(conversions.length - 1, low)];
  return Math.abs((left?.[0] ?? 99) - target) <= Math.abs((right?.[0] ?? 99) - target) ? left : right;
}
export function conversionDetails(data, method, group, grade5) {
  const input = clampGrade(grade5);
  if (input == null) return null;
  if (method === "legacy") return { input, value: legacyConvert(input), range: "", cumulative: "", sourceGrade: input };
  const row = nearestConversion(data?.conversions, input);
  if (!row) return null;
  const groupIndex = { 전교과: 2, 국수영사과: 4, 국수영과: 6, 국수영사: 8 }[group] ?? 2;
  return { input, value: row[groupIndex + 1], range: row[groupIndex], cumulative: row[1], sourceGrade: row[0] };
}

export async function loadSusiNaviBetaData(force = false) {
  return loadBetaData(force);
}
function differenceLabel(student, cutoff) {
  if (student == null || cutoff == null) return null;
  const diff = Math.round((student - cutoff) * 100) / 100;
  return { value: diff, text: `${diff > 0 ? "+" : ""}${diff.toFixed(2)}`, favorable: diff <= 0 };
}

const SUPPORT_META = {
  상향: { color: "#b84444", background: "#fff0f0", border: "#efc0c0", detail: "+0.5 초과" },
  소신: { color: "#a75b18", background: "#fff6e8", border: "#efd3aa", detail: "+0.2~+0.5" },
  적정: { color: "#7a6412", background: "#fff9db", border: "#eadb92", detail: "-0.2~+0.2" },
  안정: { color: "#2c7048", background: "#edf8f1", border: "#bedfc9", detail: "-0.5~-0.2" },
  하향: { color: "#315f91", background: "#eef5ff", border: "#bfd2e9", detail: "-0.5 미만" },
};
const RESULT_SORT_LABELS = {
  default: "기본 정렬",
  cut50: "50%컷 낮은순",
  cut70: "70%컷 낮은순",
  supportUp: "상향 → 하향",
  supportDown: "하향 → 상향",
};

function supportBand(student, cutoff) {
  if (student == null || cutoff == null) return null;
  const diff = Math.round((Number(student) - Number(cutoff)) * 100) / 100;
  let label = "적정";
  if (diff > 0.5) label = "상향";
  else if (diff > 0.2) label = "소신";
  else if (diff < -0.5) label = "하향";
  else if (diff < -0.2) label = "안정";
  return { label, diff, ...SUPPORT_META[label] };
}

function favoriteMatches(item, row) {
  if (!item || !row) return false;
  const sameUniversity = universityIdentityKey(item.university, item.region || item.campus) === universityIdentityKey(row[3], row[1])
    || universityBaseKey(item.university) === universityBaseKey(row[3]);
  const department = normalizeText(item.department);
  return sameUniversity && (!department || unitSimilar(department, row[5]));
}
function matchesUnit(minimumUnit, recordUnit) {
  const a = compactText(minimumUnit);
  const b = compactText(recordUnit);
  if (!a || !b) return false;
  if (/전체|전모집|전계열/.test(a)) return true;
  return a === b || a.includes(b) || b.includes(a);
}
function caseCutForGroup(stat, group) {
  const index = { 전교과: 8, 국수영사과: 9, 국수영사: 10, 국수영과: 11 }[group] ?? 8;
  return stat?.[index] || null;
}
function bestCaseStat(stats, university, region, track, admissionType, group) {
  const identity = universityIdentityKey(university, region);
  const candidates = (stats || []).filter(stat => {
    const sameUniversity = universityIdentityKey(stat[5] || stat[1], stat[0]) === identity
      || universityBaseKey(stat[5] || stat[1]) === universityBaseKey(university);
    const sameType = !admissionType || compactText(stat[2]).includes(compactText(admissionType));
    return sameUniversity && sameType && unitSimilar(stat[6] || stat[3], track);
  });
  return candidates.sort((a, b) => Number(caseCutForGroup(b, group)?.[0] || 0) - Number(caseCutForGroup(a, group)?.[0] || 0))[0] || null;
}
function relatedUniversityRows(rows, university, region, universityIndex = 1, regionIndex = 0) {
  const identity = universityIdentityKey(university, region);
  const base = universityBaseKey(university);
  return (rows || []).filter(item => universityIdentityKey(item[universityIndex], item[regionIndex]) === identity || universityBaseKey(item[universityIndex]) === base);
}

function schoolCaseAccepted(row) {
  const text = normalizeText([row?.finalResult, row?.finalResultDetail].filter(Boolean).join(" "));
  return /합격/.test(text) && !/불합격|탈락/.test(text);
}
function schoolCaseAdmissionLabel(row) {
  return normalizeText(row?.detailType || row?.admissionType || "세부전형 미입력");
}
function schoolCaseTrend(caseRows, university, region = "", department = "", admissionType = "") {
  const identity = universityIdentityKey(university, region);
  const base = universityBaseKey(university);
  const universityRows = (caseRows || []).filter(row => {
    const rowUniversity = row?.university || row?.universityNormalized;
    if (!rowUniversity) return false;
    return universityIdentityKey(rowUniversity, row?.region) === identity || universityBaseKey(rowUniversity) === base;
  });
  const departmentRows = department
    ? universityRows.filter(row => unitSimilar(row?.department, department))
    : [];
  let scopedRows = departmentRows.length ? departmentRows : universityRows;
  if (admissionType) {
    const typeKey = compactText(admissionType);
    const typeRows = scopedRows.filter(row => {
      const rowType = compactText(`${row?.admissionType || ""} ${row?.detailType || ""}`);
      if (/교과/.test(typeKey)) return /교과/.test(rowType);
      if (/종합/.test(typeKey)) return /종합|학종|서류/.test(rowType);
      return rowType.includes(typeKey) || typeKey.includes(rowType);
    });
    if (typeRows.length) scopedRows = typeRows;
  }
  const total = scopedRows.length;
  const accepted = scopedRows.filter(schoolCaseAccepted).length;
  const typeMap = new Map();
  scopedRows.forEach(row => {
    const label = schoolCaseAdmissionLabel(row);
    if (!typeMap.has(label)) typeMap.set(label, { label, total: 0, accepted: 0 });
    const stat = typeMap.get(label);
    stat.total += 1;
    if (schoolCaseAccepted(row)) stat.accepted += 1;
  });
  const detailTypes = Array.from(typeMap.values())
    .map(item => ({ ...item, rate: item.total ? Math.round(item.accepted / item.total * 1000) / 10 : null }))
    .sort((a, b) => b.total - a.total || b.accepted - a.accepted || a.label.localeCompare(b.label, "ko"));
  return {
    total,
    accepted,
    rejected: Math.max(0, total - accepted),
    rate: total ? Math.round(accepted / total * 1000) / 10 : null,
    detailTypes,
    scope: departmentRows.length ? "모집단위 기준" : (universityRows.length ? "대학 전체 기준" : "연결 자료 없음"),
    departmentMatched: departmentRows.length > 0,
  };
}

function supportConnectionEntries(enrichedRows, cutoffBasis, conversionGroup) {
  const entries = [];
  (enrichedRows || []).forEach(({ row, caseStats = [] }) => {
    const [regionGroup, region, detailRegion, university, , department, field, teaching = [], holistic = []] = row || [];
    const append = (items, admissionType) => items.forEach(item => {
      const stat = bestCaseStat(caseStats, university, region, item?.[0], admissionType, conversionGroup);
      const cuts = caseCutForGroup(stat, conversionGroup);
      const officialCut = numberOrNull(cutoffValue(item, cutoffBasis));
      const linkedCut = numberOrNull(cuts?.[cutoffBasis === "70" ? 3 : 2]);
      const referenceCut = officialCut ?? linkedCut;
      if (referenceCut == null) return;
      const official = officialCut != null;
      const displayDepartment = official ? department : `${field || "공통"} 계열 통합`;
      const scopeKey = official ? compactText(department) : `integrated-${compactText(field)}`;
      entries.push({
        key: `${universityIdentityKey(university, region)}|${scopeKey}|${compactText(admissionType)}|${compactText(item?.[0])}`,
        university,
        region,
        location: [regionGroup, region, detailRegion].filter(Boolean).join(" · "),
        department: displayDepartment,
        originalDepartment: department,
        field: field || "공통",
        admissionType,
        track: item?.[0] || admissionType,
        referenceCut,
        officialCut,
        linkedCut,
        referenceSource: official ? "대학 공개 모집단위 컷" : "NAVI 통합 사례 · 대학·전형·계열 통합컷",
        integratedScope: !official,
        caseCount: Number(cuts?.[0] || 0),
      });
    });
    append(teaching, "교과");
    append(holistic, "종합");
  });
  return Array.from(new Map(entries.map(entry => [entry.key, entry])).values());
}

function connectionSupportBand(item) {
  const diff = Number(item?.difference);
  if (!Number.isFinite(diff)) return "유사";
  if (diff > .5) return "상향";
  if (diff > .2) return "소신";
  if (diff < -.5) return "하향";
  if (diff < -.2) return "안정";
  return "적정";
}

function representativeConnectionResults(sorted, limit = 12, mode = "grade") {
  if (!sorted.length) return [];
  const source = [...sorted];
  const selected = [];
  const selectedKeys = new Set();
  const universityCounts = new Map();
  const fieldCounts = new Map();
  const typeCounts = new Map();
  const universityKeyOf = item => universityIdentityKey(item.university, item.region);
  const similarityScore = item => {
    const base = mode === "university"
      ? Number(item.linkScore ?? item.linkDifference ?? 99)
      : Math.abs(Number(item.difference ?? 99));
    const officialPenalty = item.officialCut == null ? .035 : 0;
    const evidenceBonus = Math.min(Math.log10(Number(item.caseCount || 0) + 1) * .014, .045);
    const fieldPenalty = (fieldCounts.get(item.field || "공통") || 0) * .035;
    const typePenalty = (typeCounts.get(item.admissionType || "기타") || 0) * .025;
    return base + officialPenalty + fieldPenalty + typePenalty - evidenceBonus;
  };
  const chooseBest = (pool, maxPerUniversity) => {
    const candidates = pool.filter(item => !selectedKeys.has(item.key) && (universityCounts.get(universityKeyOf(item)) || 0) < maxPerUniversity);
    return candidates.sort((a, b) => similarityScore(a) - similarityScore(b)
      || Number(b.caseCount || 0) - Number(a.caseCount || 0)
      || a.university.localeCompare(b.university, "ko"))[0] || null;
  };
  const add = item => {
    if (!item || selectedKeys.has(item.key) || selected.length >= limit) return false;
    const universityKey = universityKeyOf(item);
    selected.push(item);
    selectedKeys.add(item.key);
    universityCounts.set(universityKey, (universityCounts.get(universityKey) || 0) + 1);
    fieldCounts.set(item.field || "공통", (fieldCounts.get(item.field || "공통") || 0) + 1);
    typeCounts.set(item.admissionType || "기타", (typeCounts.get(item.admissionType || "기타") || 0) + 1);
    return true;
  };

  if (mode === "grade") {
    const bandOrder = ["적정", "소신", "안정", "상향", "하향"];
    const buckets = new Map(bandOrder.map(label => [label, source.filter(item => connectionSupportBand(item) === label)]));
    for (const maxPerUniversity of [1, 2, Number.POSITIVE_INFINITY]) {
      let progressed = true;
      while (selected.length < limit && progressed) {
        progressed = false;
        for (const label of bandOrder) {
          const candidate = chooseBest(buckets.get(label) || [], maxPerUniversity);
          if (add(candidate)) progressed = true;
          if (selected.length >= limit) break;
        }
      }
      if (selected.length >= limit) break;
    }
  } else {
    for (const maxPerUniversity of [1, 2, Number.POSITIVE_INFINITY]) {
      while (selected.length < limit) {
        const candidate = chooseBest(source, maxPerUniversity);
        if (!add(candidate)) break;
      }
      if (selected.length >= limit) break;
    }
  }

  if (selected.length < limit) source.forEach(item => add(item));
  return selected.slice(0, limit);
}

function connectionResultSet(matches, range, mode = "grade") {
  const sorted = [...matches].sort((a, b) => {
    const aDiff = mode === "university" ? Number(a.linkScore ?? a.linkDifference ?? 99) : Math.abs(Number(a.difference ?? 99));
    const bDiff = mode === "university" ? Number(b.linkScore ?? b.linkDifference ?? 99) : Math.abs(Number(b.difference ?? 99));
    return aDiff - bDiff || Number(b.officialCut != null) - Number(a.officialCut != null) || b.caseCount - a.caseCount || a.university.localeCompare(b.university, "ko");
  });
  const exact = sorted.filter(item => Math.abs(Number(item.difference ?? item.linkDifference ?? 99)) < .005).length;
  const distinctCuts = new Set(sorted.map(item => Number(item.referenceCut).toFixed(2))).size;
  const distinctDifferences = new Set(sorted.map(item => Math.abs(Number(item.difference ?? item.linkDifference ?? 99)).toFixed(2))).size;
  const official = sorted.filter(item => item.officialCut != null).length;
  return {
    items: representativeConnectionResults(sorted, CONNECTION_PAGE_SIZE, mode),
    allItems: sorted,
    total: sorted.length,
    exact,
    distinctCuts,
    distinctDifferences,
    official,
    integrated: sorted.length - official,
    range: Number(range) || 0,
    mode,
  };
}

function linkedSupportResults(entries, convertedGrade, range) {
  const grade = Number(convertedGrade);
  const width = Number(range);
  if (!Number.isFinite(grade) || !Number.isFinite(width)) return connectionResultSet([], width, "grade");
  const matches = entries
    .map(entry => ({ ...entry, difference: Math.round((grade - entry.referenceCut) * 100) / 100 }))
    .filter(entry => Math.abs(entry.difference) <= width + .0001);
  return connectionResultSet(matches, width, "grade");
}

function linkedUniversityResults(entries, selectedUniversity, range) {
  const width = Number(range);
  if (!selectedUniversity || !Number.isFinite(width)) return connectionResultSet([], width, "university");
  const targets = entries.filter(entry => universityBaseKey(entry.university) === universityBaseKey(selectedUniversity));
  if (!targets.length) return connectionResultSet([], width, "university");
  const matches = entries
    .filter(entry => universityBaseKey(entry.university) !== universityBaseKey(selectedUniversity))
    .map(entry => {
      const best = targets
        .map(target => ({
          target,
          difference: Math.abs(entry.referenceCut - target.referenceCut),
          fieldPenalty: entry.field === target.field ? 0 : .18,
          typePenalty: entry.admissionType === target.admissionType ? 0 : .12,
        }))
        .sort((a, b) => (a.difference + a.fieldPenalty + a.typePenalty) - (b.difference + b.fieldPenalty + b.typePenalty))[0];
      return {
        ...entry,
        linkedTarget: best?.target,
        linkDifference: Math.round((best?.difference ?? 99) * 100) / 100,
        linkScore: (best?.difference ?? 99) + (best?.fieldPenalty ?? 0) + (best?.typePenalty ?? 0),
      };
    })
    .filter(entry => entry.linkDifference <= width + .0001);
  return connectionResultSet(matches, width, "university");
}

function connectionFavoriteItem(item) {
  return {
    source: "susiNaviBeta",
    university: item.university,
    universityKey: universityIdentityKey(item.university, item.region),
    campus: universityCampus(item.university, item.region),
    department: item.integratedScope ? "" : (item.originalDepartment || item.department),
    admissionType: item.track || item.admissionType || "",
    sourceLabel: "수시NAVI Beta",
    region: item.region,
    field: item.field,
    note: item.integratedScope ? "지원 연결 탐색 통합 기준" : "지원 연결 탐색 모집단위",
  };
}

function favoriteMatchesConnection(favorite, entry) {
  if (!favorite || !entry) return false;
  const sameUniversity = universityIdentityKey(favorite.university, favorite.region || favorite.campus) === universityIdentityKey(entry.university, entry.region)
    || universityBaseKey(favorite.university) === universityBaseKey(entry.university);
  if (!sameUniversity) return false;
  const favoriteDepartment = compactText(favorite.department);
  const entryDepartment = compactText(entry.originalDepartment || entry.department);
  const favoriteType = compactText(favorite.admissionType);
  const entryType = compactText(entry.track || entry.admissionType);
  return (!favoriteDepartment || favoriteDepartment === entryDepartment)
    && (!favoriteType || favoriteType === entryType || entryType.includes(favoriteType) || favoriteType.includes(entryType));
}

function EmptyData({ isAdmin }) {
  return (
    <div style={ui.empty}>
      <Database size={34} color="#8a91a2" />
      <strong>아직 반영된 수시NAVI 자료가 없습니다.</strong>
      <span>{isAdmin ? "아래 관리자 자료 관리에서 경기도교육청 수시NAVI 교사용 파일을 업로드해주세요." : "관리자가 수시NAVI 교사용 파일을 반영한 뒤 이용할 수 있습니다."}</span>
    </div>
  );
}

export function SusiNaviBetaAdmin({ showToast }) {
  const [schoolData, setSchoolData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { loadBetaData().then(setSchoolData); }, []);

  const parseFile = async () => {
    if (!file) return showToast?.("수시NAVI 엑셀 파일을 선택해주세요.", "warning");
    setBusy(true);
    try {
      const parsed = await parseSusiNaviWorkbook(file, setStatus);
      setDraft(parsed);
      showToast?.(`${parsed.stats.records.toLocaleString()}개 모집단위를 확인했습니다.`, "success");
    } catch (error) {
      console.error(error);
      showToast?.(error?.message || "파일을 분석하지 못했습니다.", "error");
    } finally {
      setBusy(false);
    }
  };
  const saveSchool = async () => {
    if (!draft) return showToast?.("먼저 파일을 분석해주세요.", "warning");
    setBusy(true);
    setStatus("학교 공용 자료에 저장하는 중입니다.");
    try {
      const result = await writeStorage(STORAGE_KEY, { ...draft, source: { ...draft.source, savedAt: new Date().toISOString() } });
      if (!result?.ok) throw new Error(result?.error || "저장 실패");
      const saved = { ...draft, source: { ...draft.source, savedAt: new Date().toISOString() } };
      updateBetaCache(saved);
      setSchoolData(saved);
      showToast?.("수시NAVI Beta 자료를 학교 공용 자료에 반영했습니다.", "success");
    } catch (error) {
      showToast?.(`저장하지 못했습니다: ${error?.message || error}`, "error");
    } finally {
      setBusy(false);
    }
  };
  const clearSchool = async () => {
    if (!window.confirm("수시NAVI Beta 학교 공용 자료를 초기화할까요? 기존 광덕고 대입 결과에는 영향을 주지 않습니다.")) return;
    setBusy(true);
    try {
      const result = await writeStorage(STORAGE_KEY, null);
      if (!result?.ok) throw new Error(result?.error || "초기화 실패");
      updateBetaCache(null);
      setSchoolData(null);
      setDraft(null);
      showToast?.("수시NAVI Beta 자료를 초기화했습니다.", "success");
    } catch (error) {
      showToast?.(`초기화하지 못했습니다: ${error?.message || error}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={ui.adminWrap}>
      <style>{betaCss}</style>
      <div style={ui.adminHead}>
        <div style={ui.adminHeadingText}><div><span style={ui.betaBadge}>Beta</span><h2 style={ui.adminTitle}>수시NAVI 자료 관리</h2></div><p style={ui.muted}>교육청 원본에서 Beta 검색에 필요한 항목만 추출하여, 기존 광덕고 대입 결과와 분리해 관리합니다.</p></div>
        {schoolData && <button type="button" style={ui.dangerGhost} onClick={clearSchool} disabled={busy}><X size={14} /> 공용 자료 초기화</button>}
      </div>
      <div className="susi-beta-compare-grid" style={ui.compareGrid}>
        <DataSummary title="학교 반영본" tone="school" data={schoolData} />
        <DataSummary title="현재 업로드 미리보기" tone="draft" data={draft} />
      </div>
      <div className="susi-beta-upload-panel" style={ui.uploadPanel}>
        <input ref={inputRef} type="file" accept=".xlsx,.xlsm" style={{ display: "none" }} onChange={event => { setFile(event.target.files?.[0] || null); setDraft(null); }} />
        <button type="button" style={ui.secondaryBtn} onClick={() => inputRef.current?.click()} disabled={busy}><FileSpreadsheet size={15} /> 파일 선택</button>
        <div style={ui.fileName}>{file ? <><b>{file.name}</b><span>{humanBytes(file.size)}</span></> : <span>경기도교육청 수시NAVI 교사용 XLSX 파일을 선택하세요.</span>}</div>
        <button type="button" style={ui.secondaryBtn} onClick={parseFile} disabled={!file || busy}>{busy ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} 파일 분석</button>
        <button type="button" style={ui.primaryBtn} onClick={saveSchool} disabled={!draft || busy}><Upload size={15} /> 학교 자료에 반영</button>
      </div>
      {status && <div style={ui.statusLine}>{busy && <Loader2 size={13} className="spin" />}{status}</div>}
      <div style={ui.notice}><AlertTriangle size={15} /><span>원본 엑셀 전체를 저장하지 않고, Beta 검색에 필요한 대학·모집단위·입시결과·수능최저·통계 변환·합격사례 분포·2028 변화·교과반영·일정 자료만 추출해 저장합니다.</span></div>
    </section>
  );
}

function DataSummary({ title, tone, data }) {
  const school = tone === "school";
  return (
    <article style={{ ...ui.summaryCard, ...(school ? ui.summarySchool : ui.summaryDraft) }}>
      <div style={ui.summaryTop}><div style={ui.summaryHeading}><span style={ui.summaryEyebrow}>{school ? "학교 공용 자료" : "업로드 확인 자료"}</span><b style={ui.summaryTitle}>{title}</b><span style={ui.summaryDescription}>{school ? "교사들이 실제 조회하는 최종 자료입니다." : "학교 반영 전 구조와 건수를 확인합니다."}</span></div><span style={{ ...ui.statePill, ...(school ? ui.stateSchool : ui.stateDraft) }}>{data ? (school ? "반영 완료" : "분석 완료") : "자료 없음"}</span></div>
      {data ? <>
        <div style={ui.statGrid}>
          <MiniStat label="대학" value={data.stats?.universities} />
          <MiniStat label="모집단위" value={data.stats?.records} />
          <MiniStat label="수능최저" value={data.stats?.minimums} />
          <MiniStat label="변환표" value={data.stats?.conversions} />
          <MiniStat label="합격사례 분포" value={data.stats?.caseStats} />
          <MiniStat label="2028 변화" value={data.stats?.changes2028} />
          <MiniStat label="교과반영" value={data.stats?.courseRules} />
          <MiniStat label="전형일정" value={data.stats?.schedules} />
        </div>
        <div style={ui.sourceMeta}><b>{data.source?.fileName}</b><span>자료 기준 {data.source?.sourceDate || "확인 필요"} · {school ? `반영 ${formatDate(data.source?.savedAt || data.source?.parsedAt)}` : `분석 ${formatDate(data.source?.parsedAt)}`}</span></div>
      </> : <div style={ui.summaryEmpty}>등록된 자료가 없습니다.</div>}
    </article>
  );
}
function MiniStat({ label, value }) {
  return <div style={ui.miniStat}><span style={ui.miniStatLabel}>{label}</span><b style={ui.miniStatValue}>{Number(value || 0).toLocaleString()}</b></div>;
}

export default function SusiNaviBetaView({
  isAdmin = false,
  selectedStudent = null,
  favorites = [],
  onToggleFavorite,
  onOpenCases,
  caseRows = [],
  focusUniversity = "",
  focusDepartment = "",
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const conversionPreference = useMemo(() => readConversionPreference(), []);
  const restoredViewState = useMemo(() => readNaviViewState(selectedStudent?.sid), []);
  const restoredSupportFilters = Array.isArray(restoredViewState?.supportFilters)
    ? restoredViewState.supportFilters.filter(label => SUPPORT_META[label])
    : (restoredViewState?.supportFilter && restoredViewState.supportFilter !== "전체" && SUPPORT_META[restoredViewState.supportFilter] ? [restoredViewState.supportFilter] : []);
  const [grade5, setGrade5] = useState("1.80");
  const [conversionMethod, setConversionMethod] = useState(restoredViewState?.conversionMethod === "statistical" ? "statistical" : conversionPreference.method);
  const [conversionGroup, setConversionGroup] = useState(CONVERSION_GROUPS.includes(restoredViewState?.conversionGroup) ? restoredViewState.conversionGroup : conversionPreference.group);
  const [query, setQuery] = useState(restoredViewState?.query || "");
  const [regionFilters, setRegionFilters] = useState(() => Array.isArray(restoredViewState?.regionFilters)
    ? restoredViewState.regionFilters.filter(Boolean)
    : (restoredViewState?.region && restoredViewState.region !== "전체" ? [restoredViewState.region] : []));
  const [fieldFilters, setFieldFilters] = useState(() => Array.isArray(restoredViewState?.fieldFilters)
    ? restoredViewState.fieldFilters.filter(Boolean)
    : (restoredViewState?.field && restoredViewState.field !== "전체" ? [restoredViewState.field] : []));
  const [admissionFilters, setAdmissionFilters] = useState(() => Array.isArray(restoredViewState?.admissionFilters)
    ? restoredViewState.admissionFilters.filter(Boolean)
    : (restoredViewState?.admissionType && restoredViewState.admissionType !== "전체" ? [restoredViewState.admissionType] : []));
  const [minimumFilters, setMinimumFilters] = useState(() => Array.isArray(restoredViewState?.minimumFilters)
    ? restoredViewState.minimumFilters.filter(Boolean)
    : (restoredViewState?.minimumFilter && restoredViewState.minimumFilter !== "전체" ? [restoredViewState.minimumFilter] : []));
  const [supportFilters, setSupportFilters] = useState(restoredSupportFilters);
  const [resultSort, setResultSort] = useState(restoredViewState?.resultSort || "default");
  const [cutoffBasis, setCutoffBasis] = useState(restoredViewState?.cutoffBasis === "50" ? "50" : (restoredViewState?.cutoffBasis === "70" ? "70" : readCutoffPreference()));
  const [connectionMode, setConnectionMode] = useState(restoredViewState?.connectionMode === "university" ? "university" : "grade");
  const [connectionRange, setConnectionRange] = useState(restoredViewState?.connectionRange || "0.30");
  const [connectionUniversity, setConnectionUniversity] = useState(restoredViewState?.connectionUniversity || "");
  const [favoriteOnly, setFavoriteOnly] = useState(Boolean(restoredViewState?.favoriteOnly));
  const [viewTab, setViewTab] = useState(["search", "results", "connection"].includes(restoredViewState?.viewTab) ? restoredViewState.viewTab : "search");
  const [connectionFocus, setConnectionFocus] = useState(restoredViewState?.connectionFocus || null);
  const [page, setPage] = useState(Math.max(1, Number(restoredViewState?.page || 1)));
  const naviHistorySessionRef = useRef(`kd-susi-navi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const naviHistoryDepthRef = useRef(0);

  const navigateViewTab = (nextTab, { replace = false } = {}) => {
    if (!["search", "results", "connection"].includes(nextTab)) return;
    setViewTab(nextTab);
    if (typeof window === "undefined") return;
    const session = naviHistorySessionRef.current;
    const currentDepth = window.history.state?.kdSusiNaviSession === session
      ? Number(window.history.state?.kdSusiNaviDepth || 0)
      : naviHistoryDepthRef.current;
    const sameEntry = window.history.state?.kdSusiNaviSession === session
      && window.history.state?.kdSusiNaviTab === nextTab;
    const nextDepth = replace || sameEntry ? currentDepth : currentDepth + 1;
    const nextState = {
      ...(window.history.state || {}),
      kdSusiNaviSession: session,
      kdSusiNaviTab: nextTab,
      kdSusiNaviDepth: nextDepth,
    };
    if (replace || sameEntry) {
      window.history.replaceState(nextState, "");
      naviHistoryDepthRef.current = nextDepth;
      return;
    }
    window.history.pushState(nextState, "");
    naviHistoryDepthRef.current = nextDepth;
  };

  const goBackWithinNavi = fallbackTab => {
    if (typeof window !== "undefined" && naviHistoryDepthRef.current > 0) {
      window.history.back();
      return;
    }
    navigateViewTab(fallbackTab, { replace: true });
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const session = naviHistorySessionRef.current;
    window.history.replaceState({
      ...(window.history.state || {}),
      kdSusiNaviSession: session,
      kdSusiNaviTab: viewTab,
      kdSusiNaviDepth: 0,
    }, "");
    const handlePopState = event => {
      const state = event.state || {};
      if (state.kdSusiNaviSession !== session) return;
      if (!["search", "results", "connection"].includes(state.kdSusiNaviTab)) return;
      naviHistoryDepthRef.current = Math.max(0, Number(state.kdSusiNaviDepth || 0));
      setViewTab(state.kdSusiNaviTab);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    let active = true;
    loadBetaData().then(value => { if (active) { setData(value); setLoading(false); } });
    return () => { active = false; };
  }, []);

  const handledExternalFocusRef = useRef("");
  useEffect(() => {
    if (!focusUniversity) {
      handledExternalFocusRef.current = "";
      return;
    }
    const focusKey = `${universityBaseKey(focusUniversity)}|${compactText(focusDepartment)}`;
    if (handledExternalFocusRef.current === focusKey) return;
    handledExternalFocusRef.current = focusKey;
    const restoredMatches = restoredViewState?.externalFocusKey === focusKey || (connectionFocus?.university
      && universityBaseKey(connectionFocus.university) === universityBaseKey(focusUniversity)
      && (!focusDepartment || !connectionFocus?.department || unitSimilar(connectionFocus.department, focusDepartment)));
    setConnectionUniversity(focusUniversity);
    if (restoredMatches) return;
    setConnectionFocus({
      university: focusUniversity,
      department: focusDepartment || "",
      admissionType: "",
      source: "즐겨찾기 연결",
    });
    setQuery("");
    setRegionFilters([]);
    setFieldFilters([]);
    setAdmissionFilters([]);
    setMinimumFilters([]);
    setSupportFilters([]);
    setFavoriteOnly(false);
    setCutoffBasis("70");
    navigateViewTab("results");
    setPage(1);
  }, [focusUniversity, focusDepartment]);

  useEffect(() => {
    const groupValue = conversionMethod === "statistical"
      ? selectedStudent?.grade5ByGroup?.[conversionGroup]
      : selectedStudent?.grade5;
    const fallbackValue = selectedStudent?.grade5;
    const value = Number(groupValue ?? fallbackValue);
    if (Number.isFinite(value) && value >= 1 && value <= 5) {
      setGrade5(value.toFixed(2));
    } else if (selectedStudent?.sid) {
      setGrade5("");
    }
    if (!selectedStudent?.sid) setFavoriteOnly(false);
  }, [selectedStudent?.sid, selectedStudent?.grade5, selectedStudent?.grade5ByGroup, conversionMethod, conversionGroup]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CONVERSION_PREF_KEY, JSON.stringify({ method: conversionMethod, group: conversionGroup }));
  }, [conversionMethod, conversionGroup]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CUTOFF_PREF_KEY, cutoffBasis);
  }, [cutoffBasis]);

  useEffect(() => {
    writeNaviViewState(selectedStudent?.sid, {
      version: 54,
      viewTab,
      query,
      regionFilters,
      fieldFilters,
      admissionFilters,
      minimumFilters,
      supportFilters,
      resultSort,
      cutoffBasis,
      conversionMethod,
      conversionGroup,
      connectionMode,
      connectionRange,
      connectionUniversity,
      favoriteOnly,
      connectionFocus,
      externalFocusKey: focusUniversity ? `${universityBaseKey(focusUniversity)}|${compactText(focusDepartment)}` : "",
      page,
      savedAt: Date.now(),
    });
  }, [
    selectedStudent?.sid, viewTab, query, regionFilters, fieldFilters, admissionFilters, minimumFilters,
    supportFilters, resultSort, cutoffBasis, conversionMethod, conversionGroup, connectionMode,
    connectionRange, connectionUniversity, favoriteOnly, connectionFocus, focusUniversity, focusDepartment, page,
  ]);

  const conversion = useMemo(() => conversionDetails(data, conversionMethod, conversionGroup, grade5), [data, conversionMethod, conversionGroup, grade5]);
  const regions = useMemo(() => unique((data?.records || []).map(row => row[1])), [data]);
  const fields = useMemo(() => unique((data?.records || []).map(row => row[6])), [data]);
  const minimumIndex = useMemo(() => buildUniversityIndex(data?.minimums || [], 1, 0), [data]);
  const courseRuleIndex = useMemo(() => buildUniversityIndex(data?.courseRules || [], 1, 0), [data]);
  const changeIndex = useMemo(() => buildUniversityIndex(data?.changes2028 || [], 1, 0), [data]);
  const scheduleIndex = useMemo(() => buildUniversityIndex(data?.schedules || [], 1, 0), [data]);
  const caseStatIndex = useMemo(() => buildUniversityIndex(data?.caseStats || [], 5, 0), [data]);

  const enriched = useMemo(() => (data?.records || []).map(row => {
    const minimums = indexedUniversityRows(minimumIndex, row[3], row[1]).filter(item => matchesUnit(item[5], row[5]));
    const courseRules = indexedUniversityRows(courseRuleIndex, row[3], row[1]).filter(item => matchesUnit(item[5], row[5]) || unitSimilar(item[5], row[5])).slice(0, 4);
    const changes2028 = indexedUniversityRows(changeIndex, row[3], row[1]).filter(item => !item[6] || /O|변경|신설/.test(item[6])).slice(0, 5);
    const schedules = indexedUniversityRows(scheduleIndex, row[3], row[1]).filter(item => !item[5] || matchesUnit(item[5], row[5]) || unitSimilar(item[5], row[5])).slice(0, 5);
    const caseStats = indexedUniversityRows(caseStatIndex, row[3], row[1]);
    return {
      row,
      minimums,
      courseRules,
      changes2028,
      schedules,
      caseStats,
    };
  }), [data, minimumIndex, courseRuleIndex, changeIndex, scheduleIndex, caseStatIndex]);

  const connectionFocusDepartmentMatched = useMemo(() => {
    if (!connectionFocus?.university || !connectionFocus?.department) return false;
    return enriched.some(({ row }) => {
      const sameUniversity = universityIdentityKey(row[3], row[1]) === universityIdentityKey(connectionFocus.university, connectionFocus.region || "")
        || universityBaseKey(row[3]) === universityBaseKey(connectionFocus.university);
      return sameUniversity && unitSimilar(row[5], connectionFocus.department);
    });
  }, [enriched, connectionFocus]);

  const filtered = useMemo(() => {
    const matches = enriched.filter(({ row, minimums }) => {
      if (connectionFocus?.university) {
        const sameUniversity = universityIdentityKey(row[3], row[1]) === universityIdentityKey(connectionFocus.university, connectionFocus.region || "")
          || universityBaseKey(row[3]) === universityBaseKey(connectionFocus.university);
        if (!sameUniversity) return false;
        if (connectionFocus.department && connectionFocusDepartmentMatched && !unitSimilar(row[5], connectionFocus.department)) return false;
      }
      if (regionFilters.length && !regionFilters.includes(row[1])) return false;
      if (fieldFilters.length && !fieldFilters.includes(row[6])) return false;
      if (admissionFilters.length) {
        const admissionMatch = admissionFilters.some(type => (
          (type === "교과" && row[7]?.length)
          || (type === "종합" && row[8]?.length)
          || (type === "정시" && row[9])
        ));
        if (!admissionMatch) return false;
      }
      if (minimumFilters.length === 1) {
        if (minimumFilters[0] === "있음" && !minimums.length) return false;
        if (minimumFilters[0] === "없음" && minimums.length) return false;
      }
      if (supportFilters.length && conversion?.value != null) {
        const useTeaching = !admissionFilters.length || admissionFilters.includes("교과");
        const useHolistic = !admissionFilters.length || admissionFilters.includes("종합");
        const supportItems = [
          ...(useTeaching ? (row[7] || []) : []),
          ...(useHolistic ? (row[8] || []) : []),
        ];
        const labels = unique(supportItems
          .map(item => supportBand(conversion.value, cutoffValue(item, cutoffBasis))?.label)
          .filter(Boolean));
        if (!labels.some(label => supportFilters.includes(label))) return false;
      }
      if (favoriteOnly && !favorites.some(item => favoriteMatches(item, row))) return false;
      if (!queryMatchesRow(row, query)) return false;
      return true;
    });
    const cutForRow = (entry, basis) => {
      const row = entry.row;
      const values = [...(row?.[7] || []), ...(row?.[8] || [])]
        .map(item => Number(cutoffValue(item, basis)))
        .filter(Number.isFinite);
      return values.length ? Math.min(...values) : Number.POSITIVE_INFINITY;
    };
    const supportOrder = { 상향: 0, 소신: 1, 적정: 2, 안정: 3, 하향: 4 };
    const supportRank = entry => {
      const labels = rowSupportLabels(entry.row, conversion?.value, cutoffBasis);
      return labels.length ? Math.min(...labels.map(label => supportOrder[label] ?? 9)) : 9;
    };
    const sorted = [...matches];
    if (resultSort === "cut50") sorted.sort((a, b) => cutForRow(a, "50") - cutForRow(b, "50") || a.row[3].localeCompare(b.row[3], "ko"));
    if (resultSort === "cut70") sorted.sort((a, b) => cutForRow(a, "70") - cutForRow(b, "70") || a.row[3].localeCompare(b.row[3], "ko"));
    if (resultSort === "supportUp") sorted.sort((a, b) => supportRank(a) - supportRank(b) || cutForRow(a, cutoffBasis) - cutForRow(b, cutoffBasis));
    if (resultSort === "supportDown") sorted.sort((a, b) => supportRank(b) - supportRank(a) || cutForRow(a, cutoffBasis) - cutForRow(b, cutoffBasis));
    return sorted;
  }, [enriched, connectionFocus, connectionFocusDepartmentMatched, query, regionFilters, fieldFilters, admissionFilters, minimumFilters, supportFilters, cutoffBasis, favoriteOnly, favorites, conversion?.value, resultSort]);

  const connectionEntries = useMemo(
    () => supportConnectionEntries(enriched, cutoffBasis, conversionGroup),
    [enriched, cutoffBasis, conversionGroup],
  );
  const connectionUniversities = useMemo(
    () => unique(connectionEntries.map(entry => entry.university)).sort((a, b) => a.localeCompare(b, "ko")),
    [connectionEntries],
  );
  const detailUniversities = useMemo(
    () => unique(enriched.map(({ row }) => row[3])).sort((a, b) => a.localeCompare(b, "ko")),
    [enriched],
  );
  const detailSelectedUniversity = useMemo(() => {
    if (!connectionFocus?.university) return "";
    return detailUniversities.find(name => universityIdentityKey(name) === universityIdentityKey(connectionFocus.university)
      || universityBaseKey(name) === universityBaseKey(connectionFocus.university)) || "";
  }, [detailUniversities, connectionFocus?.university]);
  useEffect(() => {
    if (!connectionUniversity) return;
    const matched = connectionUniversities.find(name => universityIdentityKey(name) === universityIdentityKey(connectionUniversity)
      || universityBaseKey(name) === universityBaseKey(connectionUniversity));
    if (!matched) setConnectionUniversity("");
    else if (matched !== connectionUniversity) setConnectionUniversity(matched);
  }, [connectionUniversities, connectionUniversity]);
  const connectionResults = useMemo(() => (
    connectionMode === "university"
      ? linkedUniversityResults(connectionEntries, connectionUniversity, connectionRange)
      : linkedSupportResults(connectionEntries, conversion?.value, connectionRange)
  ), [connectionMode, connectionEntries, connectionUniversity, connectionRange, conversion?.value]);

  useEffect(() => { setPage(1); }, [connectionFocus, query, regionFilters, fieldFilters, admissionFilters, minimumFilters, supportFilters, cutoffBasis, favoriteOnly, resultSort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const changePage = nextPage => setPage(Math.min(pageCount, Math.max(1, Number(nextPage) || 1)));
  const activeFilterLabels = [
    connectionFocus?.university ? `${connectionFocus.source || "연결"}: ${connectionFocus.university}${connectionFocus.department ? ` · ${connectionFocus.department}${connectionFocusDepartmentMatched ? "" : " (학과명 불일치 → 대학 전체)"}` : ""}` : "",
    query ? `검색: ${query}` : "",
    regionFilters.length ? `지역: ${regionFilters.join(" · ")}` : "",
    fieldFilters.length ? `계열: ${fieldFilters.join(" · ")}` : "",
    admissionFilters.length ? `전형: ${admissionFilters.join(" · ")}` : "",
    minimumFilters.length ? `수능최저: ${minimumFilters.join(" · ")}` : "",
    favoriteOnly ? "즐겨찾기만" : "",
  ].filter(Boolean);
  const supportFilterDisabled = (admissionFilters.length === 1 && admissionFilters[0] === "정시") || conversion?.value == null;

  useEffect(() => {
    if (((admissionFilters.length === 1 && admissionFilters[0] === "정시") || conversion?.value == null) && supportFilters.length) {
      setSupportFilters([]);
    }
  }, [admissionFilters, conversion?.value, supportFilters.length]);


  if (loading) return <div style={ui.loading}><Loader2 className="spin" size={22} /> 수시NAVI Beta 자료를 불러오는 중입니다.</div>;

  return (
    <section style={ui.root}>
      <style>{betaCss}</style>
      <div style={ui.hero}>
        <div><div style={ui.heroEyebrow}><Sparkles size={14} /> 경기도교육청 교사용 자료 기반 · 독립 시험 운영</div><h2 style={ui.heroTitle}>2027 수시NAVI <span>Beta</span></h2><p style={ui.heroText}>경기도교육청 통합 자료를 기반으로 대학·모집단위, 전년도 입시결과와 NAVI 통합 사례를 조회합니다.</p></div>
        {data && <div style={ui.heroStats}><b>{data.stats?.universities?.toLocaleString()}개 대학</b><span>{data.stats?.records?.toLocaleString()}개 모집단위</span><small>자료 기준 {data.source?.sourceDate || "확인 필요"}</small></div>}
      </div>
      <div className="susi-beta-beta-notice" style={ui.betaNotice}><AlertTriangle size={15} /><div><b>시험 운영 기능입니다.</b><span>2027 모집단위와 2026 입시결과를 연결한 참고자료입니다.<br/>2024–2026 광덕고 대입 결과 탭과는 별도의 데이터베이스이며, 광덕고 사례에는 영향을 주지 않습니다.</span>{data && !data.caseStats?.length && <strong>NAVI 통합 사례 분포·2028 변화 자료를 사용하려면 관리자에서 최신 원본 파일을 다시 분석·반영해주세요.</strong>}</div></div>

      {!data ? <EmptyData isAdmin={isAdmin} /> : <>
        <div className="susi-beta-view-toolbar" style={ui.viewToolbar}>
          <div style={ui.viewTabs} role="tablist" aria-label="수시NAVI 화면 구분">
            <button type="button" role="tab" aria-selected={viewTab === "search"} onClick={() => navigateViewTab("search")} style={{ ...ui.viewTab, ...(viewTab === "search" ? ui.viewTabActive : {}) }}><span>1</span><b>기준 설정</b><small>환산·검색 조건</small></button>
            <button type="button" role="tab" aria-selected={viewTab === "results"} onClick={() => navigateViewTab("results")} style={{ ...ui.viewTab, ...(viewTab === "results" ? ui.viewTabActive : {}) }}><span>2</span><b>대학 상세</b><small>{filtered.length.toLocaleString()}개 모집단위</small></button>
            <button type="button" role="tab" aria-selected={viewTab === "connection"} onClick={() => navigateViewTab("connection")} style={{ ...ui.viewTab, ...(viewTab === "connection" ? ui.viewTabActive : {}) }}><span>3</span><b>지원 연결</b><small>유사 대학 탐색</small></button>
          </div>
          <div className="susi-beta-view-actions" style={ui.viewToolbarActions}>
            <span style={ui.cutoffStatusChip}><small>현재 지원 판정 기준</small><b>{cutoffBasis}%컷</b></span>
            <button type="button" style={ui.printButton} onClick={() => { navigateViewTab("results", { replace: true }); window.setTimeout(() => window.print(), 90); }}><Printer size={16}/>대학 상세 인쇄·PDF</button>
          </div>
        </div>

        {viewTab === "search" && <div className="susi-beta-tab-panel" style={ui.tabPanel}>
          <div className="susi-beta-criteria-guide" style={ui.tabGuide}><b>1단계 · 기준 설정</b><span><strong>학생의 5등급 내신을 9등급 기준으로 환산</strong>하고, 대학·지역·계열·전형 조건을 설정합니다.<br/><em>다음 단계에서 대학 상세 결과를 먼저 확인한 뒤 지원 연결 탐색으로 이어집니다.</em></span></div>
          <div style={ui.converterPanel}>
            <div style={ui.sectionHeading}><div style={ui.step}>1</div><div><b style={ui.sectionTitle}>5·9등급 환산 기준</b><span style={ui.sectionSub}>현재 방식과 통계 기반 방식을 비교해서 사용할 수 있습니다.</span></div></div>
            {selectedStudent?.sid && <div className="susi-beta-student-auto" style={ui.studentAutoBar}>
              <div style={ui.studentAutoIdentity}><span>선택 학생 자동 반영</span><b>{selectedStudent.sid} {selectedStudent.name || "학생"}</b></div>
              <div style={ui.studentAutoGrade}><small>5등급제 {conversionMethod === "statistical" ? conversionGroup : "전교과"} 내신</small><b>{grade5 ? Number(grade5).toFixed(2) : "자료 없음"}</b></div>
              <p>{grade5 ? `학생 성적표의 등록 학기 ${conversionMethod === "statistical" ? conversionGroup : "전교과"} 평균을 불러왔습니다. 아래 입력값은 필요할 때 직접 수정할 수 있습니다.` : "선택 학생에게 해당 5등급제 내신 자료가 없어 수동 입력을 사용합니다."}</p>
            </div>}
            <div className="susi-beta-converter-grid" style={ui.converterGrid}>
              <label style={ui.fieldLabel}><span>5등급제 내신</span><input type="number" min="1" max="5" step="0.01" value={grade5} onChange={event => setGrade5(event.target.value)} style={ui.input} /></label>
              <div style={ui.methodBox}><span style={ui.labelText}>환산 방식</span><div style={ui.segmented}>
                <button type="button" onClick={() => setConversionMethod("legacy")} style={{ ...ui.segmentBtn, ...(conversionMethod === "legacy" ? ui.segmentActive : {}) }}>기존 환산</button>
                <button type="button" onClick={() => setConversionMethod("statistical")} style={{ ...ui.segmentBtn, ...(conversionMethod === "statistical" ? ui.segmentActive : {}) }}>통계 기반 <small>Beta</small></button>
              </div></div>
              <label style={{ ...ui.fieldLabel, opacity: conversionMethod === "statistical" ? 1 : .5 }}><span>교과 조합</span><select value={conversionGroup} onChange={event => setConversionGroup(event.target.value)} disabled={conversionMethod !== "statistical"} style={ui.select}>{CONVERSION_GROUPS.map(value => <option key={value}>{value}</option>)}</select></label>
              <div style={ui.conversionResult}>
                <span style={ui.conversionLabel}>{conversionMethod === "legacy" ? "기존 9등급 환산" : "통계 환산 추정값"}</span>
                <b style={ui.conversionValue}>{conversion?.value != null ? Number(conversion.value).toFixed(2) : "-"}</b>
                <small style={ui.conversionHelp}>{conversionMethod === "statistical" ? `예상 범위 ${conversion?.range || "-"}` : "계산식 2×내신−1"}</small>
              </div>
            </div>
            {conversionMethod === "statistical" && <div style={ui.statDisclaimer}>53,149명 일반고 학생 자료를 활용한 통계적 추정값입니다. 대학별 공식 환산등급이 아니며, 예상 범위와 함께 참고해야 합니다.</div>}
          </div>

          <div style={ui.searchPanel}>
            <div style={ui.sectionHeading}><div style={ui.step}>2</div><div><b style={ui.sectionTitle}>대학·모집단위 검색</b><span style={ui.sectionSub}>검색 결과는 2027 모집단위와 2026 입시결과를 명확히 구분해 표시합니다.</span></div></div>
            <div className="susi-beta-filter-grid" style={ui.filterGrid}>
              <label className="susi-beta-query" style={ui.searchBox}><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="대학명·모집단위·전형명 검색" /></label>
              <MultiFilterSelect label="지역" values={regionFilters} onChange={setRegionFilters} options={regions} />
              <MultiFilterSelect label="계열" values={fieldFilters} onChange={setFieldFilters} options={fields} />
              <MultiFilterSelect label="전형" values={admissionFilters} onChange={setAdmissionFilters} options={["교과", "종합", "정시"]} />
              <MultiFilterSelect label="수능최저" values={minimumFilters} onChange={setMinimumFilters} options={["있음", "없음"]} />
            </div>
            <div style={ui.searchSummaryRow}>
              <div style={ui.resultCount}><b>{filtered.length.toLocaleString()}건</b><span>현재 조건에 해당하는 모집단위</span></div>
              <div style={ui.searchSummaryTools}>
                <div style={ui.favoriteFilterWrap}>
                  <span style={ui.favoriteFilterLabel}>관심 모집단위</span>
                  <button type="button" disabled={!selectedStudent?.sid} onClick={() => setFavoriteOnly(value => !value)} style={{ ...ui.favoriteFilterBtn, ...(favoriteOnly ? ui.favoriteFilterActive : {}), ...(!selectedStudent?.sid ? ui.favoriteBtnDisabled : {}) }}><Star size={14} fill={favoriteOnly ? "currentColor" : "none"}/>{favoriteOnly ? "즐겨찾기만 보는 중" : "즐겨찾기만"}</button>
                </div>
                <button type="button" style={ui.goResultButton} onClick={() => { setConnectionFocus(null); setPage(1); navigateViewTab("results"); }}>다음: 대학 상세 {filtered.length.toLocaleString()}건 보기 ›</button>
                <button type="button" style={ui.directResultButton} onClick={() => { setConnectionMode("grade"); navigateViewTab("connection"); }}>지원 연결 바로가기</button>
              </div>
            </div>
            <div className="susi-beta-support-filter" style={ui.supportFilterRow}>
              <div style={ui.supportFilterTop}>
                <div style={ui.supportFilterHeading}>
                  <span style={ui.supportFilterEyebrow}>지원 구간 다중 필터</span>
                  <b style={ui.supportFilterOneLine}>
                    <span>비교 기준: <em>{conversionMethod === "legacy" ? "기존 환산" : `통계 기반 Beta · ${conversionGroup}`}</em> {conversion?.value != null ? Number(conversion.value).toFixed(2) : "-"}</span>
                    <span>{admissionFilters.length === 1 && admissionFilters[0] === "정시" ? <em>정시만 선택 중 · 지원구간 필터는 수시 교과·종합 전형에만 적용됩니다.</em> : conversion?.value == null ? <em>학생 환산등급을 입력하면 지원구간 필터를 사용할 수 있습니다.</em> : <><em>합격자 {cutoffBasis}%컷</em> 기준 · 여러 구간을 동시에 선택하면 합집합으로 조회합니다.</>}</span>
                  </b>
                </div>
                <div style={ui.globalConversionControls} aria-label="검색 전체 환산 방식">
                  <button type="button" onClick={() => setConversionMethod("legacy")} style={{ ...ui.globalConversionBtn, ...(conversionMethod === "legacy" ? ui.globalConversionActive : {}) }}>기존 환산</button>
                  <button type="button" onClick={() => setConversionMethod("statistical")} style={{ ...ui.globalConversionBtn, ...(conversionMethod === "statistical" ? ui.globalConversionActive : {}) }}>통계 기반 Beta</button>
                  {conversionMethod === "statistical" && <select value={conversionGroup} onChange={event => setConversionGroup(event.target.value)} style={ui.globalConversionSelect}>{CONVERSION_GROUPS.map(value => <option key={value}>{value}</option>)}</select>}
                </div>
              </div>
              <div style={ui.supportFilterControls}>
                <div style={ui.cutoffBasisToggle} aria-label="지원 구간 비교 기준">
                  <button type="button" aria-pressed={cutoffBasis === "50"} onClick={() => setCutoffBasis("50")} style={{ ...ui.cutoffBasisBtn, ...(cutoffBasis === "50" ? ui.cutoffBasisActive : {}) }}><b>50%컷</b><small>{cutoffBasis === "50" ? "✓ 현재 판정 기준" : "판정 기준으로 선택"}</small></button>
                  <button type="button" aria-pressed={cutoffBasis === "70"} onClick={() => setCutoffBasis("70")} style={{ ...ui.cutoffBasisBtn, ...(cutoffBasis === "70" ? ui.cutoffBasisActive : {}) }}><b>70%컷</b><small>{cutoffBasis === "70" ? "✓ 현재 판정 기준" : "판정 기준으로 선택"}</small></button>
                </div>
                <div style={ui.supportLegend}>
                  <button type="button" aria-pressed={!supportFilters.length} onClick={() => setSupportFilters([])} style={{ ...ui.supportFilterBtn, ...(!supportFilters.length ? ui.supportFilterBtnActive : {}) }}>전체</button>
                  {Object.entries(SUPPORT_META).map(([label, meta]) => {
                    const active = supportFilters.includes(label);
                    return <button
                      type="button"
                      key={label}
                      aria-pressed={active}
                      disabled={supportFilterDisabled}
                      onClick={() => setSupportFilters(current => current.includes(label) ? current.filter(value => value !== label) : [...current, label])}
                      style={{
                        ...ui.supportLegendItem,
                        ...(active ? ui.supportSelected : {}),
                        ...(supportFilterDisabled ? { opacity: .42, cursor: "not-allowed" } : {}),
                        color: active ? "#fff" : meta.color,
                        background: active ? meta.color : meta.background,
                        borderColor: active ? meta.color : meta.border,
                        boxShadow: active ? `0 4px 11px ${meta.color}33` : "none",
                      }}
                    ><b>{label}</b><small>{meta.detail}</small></button>;
                  })}
                </div>
              </div>
            </div>
            <div style={ui.searchWorkflowFooter}>
              <span style={ui.workflowCopy}><b>다음 단계</b><em>먼저 대학별 모집단위와 전형 정보를 확인한 뒤, 필요한 대학을 기준으로 유사 지원군을 탐색할 수 있습니다.</em></span>
              <button type="button" style={ui.workflowNextButton} onClick={() => { setConnectionFocus(null); setPage(1); navigateViewTab("results"); }}>대학 상세 결과 보기 ›</button>
            </div>
          </div>
        </div>}

        {viewTab === "connection" && <div className="susi-beta-tab-panel" style={ui.tabPanel}>
          <div style={ui.tabGuide}><b>대학 상세 다음 단계</b><span>대학 상세에서 확인한 모집단위를 바탕으로 <strong>내 성적대 전체 후보</strong> 또는 <strong>선택 대학과 비슷한 대학</strong>을 찾습니다. 실제 동일 학생의 복수지원 기록이 아니라 대학 공개 컷과 NAVI 통합 사례 통계를 연결한 탐색 결과입니다.</span></div>
          {data.caseStats?.length > 0 && <div style={ui.caseStatsGuide}><AlertTriangle size={14}/><span><b>‘NAVI 통합 지원사례 244건’은 해당 학과의 합격자 244명이 아닙니다.</b> 경기도교육청 원본은 여러 학교의 사례를 <strong>대학·전형·계열 단위</strong>로 통합하며, 일부 통계는 학과를 별도로 구분하지 않습니다. 대학 공개 모집단위 컷이 없는 경우에는 화면에 ‘계열 통합’으로 구분해 표시합니다.</span></div>}
          <SupportConnectionExplorer
            mode={connectionMode}
            onModeChange={setConnectionMode}
            range={connectionRange}
            onRangeChange={setConnectionRange}
            university={connectionUniversity}
            onUniversityChange={setConnectionUniversity}
            universities={connectionUniversities}
            resultSet={connectionResults}
            convertedGrade={conversion?.value}
            cutoffBasis={cutoffBasis}
            conversionGroup={conversionGroup}
            conversionMethod={conversionMethod}
            favorites={favorites}
            caseRows={caseRows}
            favoriteEnabled={Boolean(selectedStudent?.sid && onToggleFavorite)}
            onToggleFavorite={onToggleFavorite}
            onOpenCases={onOpenCases}
            onBack={() => goBackWithinNavi("results")}
            onOpenUniversity={item => {
              setConnectionFocus({
                university: item.university,
                region: item.region || "",
                department: item.integratedScope ? "" : (item.originalDepartment || item.department),
                admissionType: item.admissionType || "",
                source: "지원 연결 탐색",
              });
              setQuery("");
              setRegionFilters([]);
              setFieldFilters([]);
              setAdmissionFilters([]);
              setMinimumFilters([]);
              setSupportFilters([]);
              setFavoriteOnly(false);
              setPage(1);
              navigateViewTab("results");
            }}
          />
        </div>}

        {viewTab === "results" && <div className="susi-beta-tab-panel" style={ui.tabPanel}>
          <div style={ui.resultContextGuide}>
            <div style={ui.guideCopy}><b>대학 상세 결과 {filtered.length.toLocaleString()}건</b><span>현재 검색·필터 조건에 맞는 2027 모집단위를 보여줍니다. 자료 출처 설명은 아래 <strong>‘자료 기준 안내’</strong>에서 필요할 때 펼쳐볼 수 있습니다.</span></div>
            <div style={ui.resultContextActions}>
              <button type="button" style={ui.backToSearchButton} onClick={() => goBackWithinNavi("search")}>‹ 기준 설정 수정</button>
              <button type="button" style={ui.resultConnectPrimary} onClick={() => { setConnectionMode("grade"); setConnectionUniversity(""); navigateViewTab("connection"); }}>현재 성적으로 지원 연결 찾기 ›</button>
            </div>
          </div>
          <details className="susi-beta-source-guide" style={ui.sourceGuideDetails}>
            <summary style={ui.sourceGuideSummary}><span><Database size={15}/><b>자료 기준 안내</b><small>NAVI 통합 데이터와 광덕고 별도 사례의 차이</small></span><ChevronDown size={16}/></summary>
            <div className="susi-beta-source-legend" style={ui.dataSourceLegend}>
              <div style={ui.naviSourceCard}><div style={ui.sourceCardCopy}><small>NAVI 통합 데이터</small><b>경기도교육청 제공 통합 자료</b><span>2027 모집단위, 2026 입시결과, NAVI 통합 지원사례 분포와 통합컷을 표시합니다.</span></div></div>
              <div style={ui.schoolSourceCard}><div style={ui.sourceCardCopy}><small>광덕고 별도 사례</small><b>2024–2026 우리 학교 실제 지원 결과</b><span>지원·합격·합격률과 세부전형별 현황을 별도로 표시합니다.</span></div>{onOpenCases && <button type="button" style={ui.sourceLegendLink} onClick={() => onOpenCases("", "", "")}>광덕고 대입 결과 탭 열기 ›</button>}</div>
            </div>
          </details>
          <div className="susi-beta-result-controls" style={ui.resultControlPanel}>
            <div style={ui.resultControlHeading}><b>결과 필터·정렬</b><span>이 화면에서도 조건을 바로 조정할 수 있습니다. 복수 선택 필터는 같은 항목 안에서 OR로 적용됩니다.</span></div>
            <div style={ui.resultControlGrid}>
              <MultiFilterSelect compact label="지역" values={regionFilters} onChange={setRegionFilters} options={regions}/>
              <MultiFilterSelect compact label="계열" values={fieldFilters} onChange={setFieldFilters} options={fields}/>
              <MultiFilterSelect compact label="전형" values={admissionFilters} onChange={setAdmissionFilters} options={["교과", "종합", "정시"]}/>
              <MultiFilterSelect compact label="수능최저" values={minimumFilters} onChange={setMinimumFilters} options={["있음", "없음"]}/>
              <label className="susi-beta-sort-control" style={ui.resultSortControl}><span>정렬</span><b>{RESULT_SORT_LABELS[resultSort] || "기본 정렬"}</b><ChevronDown size={14}/><select aria-label="대학 상세 결과 정렬" value={resultSort} onChange={event => setResultSort(event.target.value)} style={ui.resultSortNative}><option value="default">기본 정렬</option><option value="cut50">50%컷 낮은순</option><option value="cut70">70%컷 낮은순</option><option value="supportUp">상향 → 하향</option><option value="supportDown">하향 → 상향</option></select></label>
            </div>
            <div style={ui.resultSupportQuick}><span>지원 구간</span>{Object.entries(SUPPORT_META).map(([label, meta]) => {
              const active = supportFilters.includes(label);
              return <button type="button" key={label} disabled={supportFilterDisabled} onClick={() => setSupportFilters(current => current.includes(label) ? current.filter(value => value !== label) : [...current, label])} style={{ ...ui.resultSupportQuickBtn, color: active ? "#fff" : meta.color, background: active ? meta.color : meta.background, borderColor: active ? meta.color : meta.border, opacity: supportFilterDisabled ? .42 : 1 }}>{label}</button>;
            })}<button type="button" onClick={() => setSupportFilters([])} style={ui.resultSupportReset}>전체</button></div>
          </div>
          <div style={ui.resultFilterBar}>
            <div style={ui.activeFilterWrap}>
              <span style={ui.activeFilterLabel}>현재 적용 조건</span>
              {activeFilterLabels.map(label => <b key={label} style={ui.activeFilterChip}>{label}</b>)}
              {supportFilters.map(label => {
                const meta = SUPPORT_META[label];
                return <b key={`support-${label}`} style={{ ...ui.activeFilterChip, color: meta.color, background: meta.background, borderColor: meta.border }}>지원구간: {label}</b>;
              })}
              {!activeFilterLabels.length && !supportFilters.length && <b style={ui.activeFilterEmpty}>추가 필터 없음</b>}
              {(activeFilterLabels.length > 0 || supportFilters.length > 0) && <button type="button" style={ui.clearFilterButton} onClick={() => {
                setConnectionFocus(null);
                setQuery("");
                setRegionFilters([]);
                setFieldFilters([]);
                setAdmissionFilters([]);
                setMinimumFilters([]);
                setSupportFilters([]);
                setFavoriteOnly(false);
              }}>필터 전체 해제</button>}
            </div>
            <div style={ui.resultCutoffControl}>
              <span>판정 컷</span>
              <button type="button" aria-pressed={cutoffBasis === "50"} onClick={() => setCutoffBasis("50")} style={{ ...ui.resultCutoffButton, ...(cutoffBasis === "50" ? ui.resultCutoffActive : {}) }}>50%컷</button>
              <button type="button" aria-pressed={cutoffBasis === "70"} onClick={() => setCutoffBasis("70")} style={{ ...ui.resultCutoffButton, ...(cutoffBasis === "70" ? ui.resultCutoffActive : {}) }}>70%컷</button>
            </div>
          </div>
          <div className="susi-beta-detail-search" style={ui.detailSearchPanel}>
            <div style={ui.detailSearchHeading}><b>대학별 상세 조회</b><span>대학명·모집단위·전형명을 검색하거나 대학을 직접 선택하세요. 결과 수와 페이지가 즉시 갱신됩니다.</span></div>
            <label style={ui.detailSearchBox}><Search size={18}/><input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="예: 중앙대, 간호학과, 학생부교과" />{query && <button type="button" onClick={() => { setQuery(""); setPage(1); }} aria-label="검색어 지우기"><X size={15}/></button>}<strong>{filtered.length.toLocaleString()}건</strong></label>
            <label style={ui.detailUniversitySelect}><span>대학 직접 선택</span><select value={detailSelectedUniversity} onChange={event => {
              const name = event.target.value;
              setConnectionFocus(name ? { university: name, department: "", admissionType: "", source: "대학 직접 선택" } : null);
              setQuery("");
              setPage(1);
            }}><option value="">전체 대학</option>{detailUniversities.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
          </div>
          {connectionFocus?.department && !connectionFocusDepartmentMatched && <div style={ui.focusFallbackNotice}><AlertTriangle size={14}/><span>연결된 학과명 <b>{connectionFocus.department}</b>과 2027 모집단위명이 정확히 일치하지 않아, <strong>{connectionFocus.university} 대학 전체 모집단위</strong>를 표시합니다. 아래 목록에서 해당 학과를 다시 선택할 수 있습니다.</span></div>}
          <div style={ui.resultList}>
            {visible.length ? visible.map(({ row, minimums, courseRules, changes2028, schedules, caseStats }, index) => <ResultCard
              key={`${row[3]}-${row[5]}-${(page - 1) * PAGE_SIZE + index}`}
              row={row}
              minimums={minimums}
              courseRules={courseRules}
              changes2028={changes2028}
              schedules={schedules}
              caseStats={caseStats}
              schoolTrend={schoolCaseTrend(caseRows, row[3], row[1], row[5])}
              conversionGroup={conversionGroup}
              convertedGrade={conversion?.value}
              cutoffBasis={cutoffBasis}
              favorite={favorites.some(item => favoriteMatches(item, row))}
              favoriteEnabled={Boolean(selectedStudent?.sid && onToggleFavorite)}
              onToggleFavorite={onToggleFavorite}
              onOpenCases={onOpenCases}
              onConnectUniversity={() => {
                setConnectionMode("university");
                setConnectionUniversity(row[3]);
                navigateViewTab("connection");
              }}
            />) : <div style={ui.noResult}>조건에 맞는 결과가 없습니다. 위의 ‘현재 적용 조건’을 확인하고 연결 조건이나 검색 필터를 해제해주세요.</div>}
          </div>
          {pageCount > 1 && <Pagination page={page} pageCount={pageCount} onChange={changePage} />}
          <div style={ui.resultWorkflowFooter}>
            <div style={ui.guideCopy}><b>대학 정보를 확인했나요?</b><span>현재 성적 전체 후보를 조회하거나, 각 대학 카드의 버튼으로 특정 대학과 비슷한 대학을 찾을 수 있습니다.</span></div>
            <button type="button" style={ui.resultConnectPrimary} onClick={() => { setConnectionMode("grade"); setConnectionUniversity(""); navigateViewTab("connection"); }}>다음: 지원 연결 탐색 ›</button>
          </div>
        </div>}

        <PrintResultSheet
          rows={visible}
          page={page}
          total={filtered.length}
          conversionMethod={conversionMethod}
          conversionGroup={conversionGroup}
          convertedGrade={conversion?.value}
          cutoffBasis={cutoffBasis}
          query={query}
          region={regionFilters.length ? regionFilters.join("·") : "전체"}
          field={fieldFilters.length ? fieldFilters.join("·") : "전체"}
          admissionType={admissionFilters.length ? admissionFilters.join("·") : "전체"}
          minimumFilter={minimumFilters.length ? minimumFilters.join("·") : "전체"}
        />
      </>}
    </section>
  );
}

function Pagination({ page, pageCount, onChange }) {
  const start = Math.max(1, Math.min(page - 2, pageCount - 4));
  const pages = Array.from({ length: Math.min(5, pageCount) }, (_, index) => start + index);
  return <nav style={ui.pagination} aria-label="검색 결과 페이지 이동">
    <button type="button" style={ui.pageIconBtn} disabled={page <= 1} onClick={() => onChange(1)} title="첫 페이지"><ChevronsLeft size={15}/></button>
    <button type="button" style={ui.pageNavBtn} disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={15}/>이전</button>
    <div style={ui.pageNumbers}>
      {pages.map(value => <button type="button" key={value} onClick={() => onChange(value)} style={{ ...ui.pageNumberBtn, ...(value === page ? ui.pageNumberActive : {}) }}>{value}</button>)}
    </div>
    <span style={ui.pageStatus}><b>{page}</b><i>/</i>{pageCount}</span>
    <button type="button" style={ui.pageNavBtn} disabled={page >= pageCount} onClick={() => onChange(page + 1)}>다음<ChevronRight size={15}/></button>
    <button type="button" style={ui.pageIconBtn} disabled={page >= pageCount} onClick={() => onChange(pageCount)} title="마지막 페이지"><ChevronsRight size={15}/></button>
  </nav>;
}

function FilterSelect({ label, value, onChange, options }) {
  return <label style={ui.filterLabel}><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select></label>;
}

function MultiFilterSelect({ label, values = [], onChange, options = [], compact = false }) {
  const selected = Array.isArray(values) ? values : [];
  const toggle = option => onChange(selected.includes(option) ? selected.filter(value => value !== option) : [...selected, option]);
  const summary = selected.length ? (selected.length <= 2 ? selected.join(" · ") : `${selected.slice(0, 2).join(" · ")} 외 ${selected.length - 2}`) : "전체";
  return <details className="susi-beta-multi-filter" style={{ ...ui.multiFilter, ...(compact ? ui.multiFilterCompact : {}) }}>
    <summary style={ui.multiFilterSummary}><span>{label}</span><b title={selected.join(", ")}>{summary}</b><ChevronDown size={14}/></summary>
    <div style={ui.multiFilterMenu}>
      <button type="button" onClick={() => onChange([])} style={{ ...ui.multiFilterOption, ...(!selected.length ? ui.multiFilterOptionActive : {}) }}><span>전체</span>{!selected.length && <b>✓</b>}</button>
      {options.map(option => {
        const active = selected.includes(option);
        return <button type="button" key={option} onClick={() => toggle(option)} style={{ ...ui.multiFilterOption, ...(active ? ui.multiFilterOptionActive : {}) }}><span>{option}</span>{active && <b>✓</b>}</button>;
      })}
      {!!selected.length && <button type="button" onClick={() => onChange([])} style={ui.multiFilterClear}>선택 초기화</button>}
    </div>
  </details>;
}

function SupportConnectionExplorer({
  mode,
  onModeChange,
  range,
  onRangeChange,
  university,
  onUniversityChange,
  universities,
  resultSet,
  convertedGrade,
  cutoffBasis,
  conversionGroup,
  conversionMethod,
  favorites = [],
  caseRows = [],
  favoriteEnabled,
  onToggleFavorite,
  onOpenCases,
  onOpenUniversity,
  onBack,
}) {
  const gradeReady = Number.isFinite(Number(convertedGrade));
  const rawResults = resultSet?.allItems || resultSet?.items || [];
  const [displayMode, setDisplayMode] = useState("all");
  const [resultPage, setResultPage] = useState(1);
  const [selectedKey, setSelectedKey] = useState("");
  const [candidateQuery, setCandidateQuery] = useState("");
  const [connectionBandFilters, setConnectionBandFilters] = useState([]);

  const rawBandCounts = useMemo(() => rawResults.reduce((acc, item) => {
    const label = gradeReady ? supportBand(convertedGrade, item.referenceCut)?.label : null;
    if (label) acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {}), [rawResults, gradeReady, convertedGrade]);
  const allResults = useMemo(() => {
    if (!connectionBandFilters.length || !gradeReady) return rawResults;
    return rawResults.filter(item => connectionBandFilters.includes(supportBand(convertedGrade, item.referenceCut)?.label));
  }, [rawResults, connectionBandFilters, gradeReady, convertedGrade]);
  const total = allResults.length;
  const exact = allResults.filter(item => Math.abs(Number(item.difference ?? item.linkDifference ?? 99)) < .005).length;
  const distinctCuts = new Set(allResults.map(item => Number(item.referenceCut).toFixed(2))).size;
  const filteredOfficial = allResults.filter(item => item.officialCut != null).length;
  const filteredIntegrated = total - filteredOfficial;

  useEffect(() => {
    setResultPage(1);
    setSelectedKey("");
    setCandidateQuery("");
  }, [mode, range, university, cutoffBasis, conversionMethod, conversionGroup]);
  useEffect(() => { setResultPage(1); setSelectedKey(""); }, [connectionBandFilters]);
  useEffect(() => { if (!gradeReady && connectionBandFilters.length) setConnectionBandFilters([]); }, [gradeReady, connectionBandFilters.length]);

  const searchedResults = useMemo(() => {
    const needle = compactText(candidateQuery);
    if (!needle) return allResults;
    return allResults.filter(item => compactText(`${item.university} ${item.department} ${item.originalDepartment || ""} ${item.field} ${item.track} ${item.admissionType}`).includes(needle));
  }, [allResults, candidateQuery]);
  const resultPageCount = Math.max(1, Math.ceil(searchedResults.length / CONNECTION_PAGE_SIZE));
  const compactResults = representativeConnectionResults(searchedResults, CONNECTION_PAGE_SIZE, mode);
  const summaryBandCounts = useMemo(() => compactResults.reduce((acc, item) => { const label = connectionSupportBand(item); acc[label] = (acc[label] || 0) + 1; return acc; }, {}), [compactResults]);
  const results = displayMode === "all"
    ? searchedResults.slice((resultPage - 1) * CONNECTION_PAGE_SIZE, resultPage * CONNECTION_PAGE_SIZE)
    : compactResults;
  const selectedItem = searchedResults.find(item => item.key === selectedKey) || allResults.find(item => item.key === selectedKey) || null;
  const setMode = next => {
    setDisplayMode(next);
    setResultPage(1);
  };

  return <section className="susi-beta-connection-panel" style={ui.connectionPanel}>
    <div style={ui.connectionHead}>
      <div style={ui.connectionTitleWrap}>
        <span style={ui.connectionIcon}><Network size={20}/></span>
        <div><b style={ui.connectionTitle}>지원 연결 탐색</b><span style={ui.connectionSub}>대학 상세를 확인한 뒤 사용하는 비교 화면입니다. 기본값은 <strong>전체 후보</strong>이며, 균형 요약은 대학 중복·입결 차이·데이터 유사도를 함께 반영합니다.</span></div>
      </div>
      <div style={ui.connectionHeadActions}>
        <div style={ui.connectionBandFilterTop} aria-label="지원 구간 필터">
          <span style={ui.connectionBandLabel}>지원구간</span>
          {Object.entries(SUPPORT_META).map(([label, meta]) => {
            const active = connectionBandFilters.includes(label);
            return <button type="button" key={label} disabled={!gradeReady} aria-pressed={active} onClick={() => setConnectionBandFilters(current => current.includes(label) ? current.filter(value => value !== label) : [...current, label])} style={{ ...ui.connectionBandBtn, color: active ? "#fff" : meta.color, background: active ? meta.color : meta.background, borderColor: active ? meta.color : meta.border, opacity: gradeReady ? 1 : .42 }}>{label}<small style={{ marginLeft: 4 }}>{Number(rawBandCounts[label] || 0)}</small></button>;
          })}
          {!!connectionBandFilters.length && <button type="button" onClick={() => setConnectionBandFilters([])} style={{ ...ui.connectionBandBtn, color: "#667085", background: "#fff", borderColor: "#d6dee8" }}>전체</button>}
        </div>
        <button type="button" style={ui.connectionBackButton} onClick={onBack}>‹ 대학 상세로</button>
      </div>
    </div>

    <div style={ui.connectionModeChooser} role="tablist" aria-label="지원 연결 탐색 방식">
      <button type="button" role="tab" aria-selected={mode === "grade"} onClick={() => onModeChange("grade")} style={{ ...ui.connectionModeCard, ...(mode === "grade" ? ui.connectionModeCardActive : {}) }}>
        <span>방법 1</span><b>내 성적대로 전체 후보 찾기</b><small>학생 환산등급과 선택한 50·70%컷의 차이가 범위 안인 모든 모집단위를 찾습니다.</small>
      </button>
      <button type="button" role="tab" aria-selected={mode === "university"} onClick={() => onModeChange("university")} style={{ ...ui.connectionModeCard, ...(mode === "university" ? ui.connectionModeCardActive : {}) }}>
        <span>방법 2</span><b>특정 대학과 비슷한 대학 찾기</b><small>기준 대학을 고르면 계열·전형·컷이 가까운 다른 대학과 모집단위를 연결합니다.</small>
      </button>
    </div>

    <div style={ui.connectionControls}>
      {mode === "grade" ? <div className="susi-beta-connection-criteria" style={ui.connectionCriterion}>
        <div style={ui.connectionCriteriaHeading}><b>현재 적용 중인 비교 기준</b><span>환산 방식과 교과 조합을 확인한 뒤, 학생 등급과 선택 컷을 기준으로 후보를 계산합니다.</span></div>
        <div style={{ ...ui.criterionItem, ...ui.criterionMethod }}><small style={ui.criterionLabel}>환산 방식</small><b style={ui.criterionValue}>{conversionMethod === "statistical" ? "통계 기반 Beta" : "기존 2×내신−1"}</b></div>
        <div style={{ ...ui.criterionItem, ...ui.criterionGroup }}><small style={ui.criterionLabel}>교과 조합</small><b style={ui.criterionValue}>{conversionMethod === "statistical" ? conversionGroup : "전교과"}</b></div>
        <div style={{ ...ui.criterionItem, ...ui.criterionGrade }}><small style={ui.criterionLabel}>학생 9등급 환산</small><b style={ui.criterionValueStrong}>{gradeReady ? Number(convertedGrade).toFixed(2) : "입력 필요"}</b></div>
        <div style={{ ...ui.criterionItem, ...ui.criterionCut }}><small style={ui.criterionLabel}>지원 컷 기준</small><b style={ui.criterionValueStrong}>{cutoffBasis}%컷</b></div>
      </div> : <label style={{ ...ui.connectionSelectLabel, ...ui.connectionUniversitySelector }}><span>① 기준 대학을 선택하세요</span><select value={university} onChange={event => onUniversityChange(event.target.value)} style={ui.connectionSelect}><option value="">대학을 선택하면 결과가 표시됩니다</option>{universities.map(name => <option key={name} value={name}>{name}</option>)}</select>{university && <small><b>{university}</b>의 공개 컷과 계열·전형이 가까운 다른 대학을 찾는 중입니다.</small>}</label>}
      <label style={{ ...ui.connectionSelectLabel, ...ui.connectionRangeCard }}><span>{mode === "university" ? "② " : ""}허용할 컷 차이</span><select value={range} onChange={event => onRangeChange(event.target.value)} style={ui.connectionSelect}><option value="0.20">±0.20 이내</option><option value="0.30">±0.30 이내</option><option value="0.50">±0.50 이내</option><option value="0.80">±0.80 이내</option></select><small>범위를 넓히면 더 많은 대학·모집단위가 포함됩니다.</small></label>
      <div style={ui.connectionResultCount}><small style={ui.resultCountLabel}>검색된 전체 후보</small><b style={ui.resultCountValue}>{total.toLocaleString()}건</b><span style={ui.resultCountMeta}>{displayMode === "all" ? `전체 보기 · ${resultPage}/${resultPageCount}페이지` : `균형 요약 ${compactResults.length}건`}</span></div>
    </div>

    <div style={ui.connectionStats}>
      <span style={{ ...ui.connectionStatCard, ...ui.connectionStatExact }}><small style={ui.connectionStatLabel}>컷 차이 0.00</small><b style={ui.connectionStatValue}>{exact.toLocaleString()}건</b></span>
      <span style={{ ...ui.connectionStatCard, ...ui.connectionStatDistinct }}><small style={ui.connectionStatLabel}>서로 다른 기준컷</small><b style={ui.connectionStatValue}>{distinctCuts.toLocaleString()}개</b></span>
      <span style={{ ...ui.connectionStatCard, ...ui.connectionStatOfficial }}><small style={ui.connectionStatLabel}>대학 공개 모집단위 컷</small><b style={ui.connectionStatValue}>{filteredOfficial.toLocaleString()}건</b></span>
      <span style={{ ...ui.connectionStatCard, ...ui.connectionStatIntegrated }}><small style={ui.connectionStatLabel}>NAVI 계열 통합 컷</small><b style={ui.connectionStatValue}>{filteredIntegrated.toLocaleString()}건</b></span>
    </div>

    <div className="susi-beta-connection-notice" style={ui.connectionNotice}><AlertTriangle size={16}/><span><b>차이 0.00</b>은 동일 학생이 아니라 비교 컷이 같다는 뜻이며, 대학 공개컷이 없으면 NAVI 대학·전형·계열 통합컷을 사용합니다.</span>{total > 0 && distinctCuts === 1 ? <em style={ui.sameCutNotice}>현재 기준컷 {Number(allResults[0]?.referenceCut || 0).toFixed(2)}</em> : null}</div>

    {!!total && <>
      <div style={ui.connectionDisplayBar}>
        <div><b>{displayMode === "all" ? "전체 후보를 조회하고 있습니다." : "대학과 지원 구간을 고르게 뽑은 균형 요약입니다."}</b><span>{displayMode === "all" ? "모든 결과를 12개씩 페이지로 확인하고 대학·학과 검색으로 빠르게 좁힐 수 있습니다." : mode === "grade" ? "대학별 1건을 우선하고, 입결 차이·공개컷 여부·NAVI 사례 수를 반영한 뒤 상향부터 하향까지 가능한 범위에서 고르게 구성합니다." : "대학별 1건을 우선하고, 기준 대학과의 컷 차이·계열·전형 유사도와 NAVI 사례 수를 함께 반영합니다."}</span></div>
        <div style={ui.connectionDisplayToggle}>
          <button type="button" aria-pressed={displayMode === "all"} onClick={() => setMode("all")} style={{ ...ui.connectionDisplayButton, ...(displayMode === "all" ? ui.connectionDisplayActive : {}) }}>전체 후보 {total.toLocaleString()}건</button>
          <button type="button" aria-pressed={displayMode === "representative"} onClick={() => setMode("representative")} style={{ ...ui.connectionDisplayButton, ...(displayMode === "representative" ? ui.connectionDisplayActive : {}) }}>균형 요약 12건</button>
        </div>
      </div>
      {displayMode === "representative" && <div style={ui.connectionSummaryGuide}>
        <div style={ui.connectionSummaryCopy}><b>균형 요약 산출 기준</b><span>{mode === "grade" ? "대학 중복 최소화 → 입결 차이 → 대학 공개컷 우선 → NAVI 사례 수 → 지원 구간 분산 순으로 12건을 선정합니다." : "대학 중복 최소화 → 컷 차이 → 계열·전형 유사도 → 대학 공개컷과 NAVI 사례 수 순으로 12건을 선정합니다."}</span></div>
        <div style={ui.connectionSummaryChips}>{mode === "grade" ? ["상향", "소신", "적정", "안정", "하향"].map(label => <span key={label} style={{ ...ui.connectionSummaryChip, color: SUPPORT_META[label].color, borderColor: SUPPORT_META[label].border, background: SUPPORT_META[label].background }}><b>{label}</b><small>{Number(summaryBandCounts[label] || 0)}건</small></span>) : <><span style={ui.connectionSummaryChip}><b>대학별</b><small>1건 우선</small></span><span style={ui.connectionSummaryChip}><b>입결</b><small>차이 최소</small></span><span style={ui.connectionSummaryChip}><b>계열·전형</b><small>유사도 반영</small></span></>}</div>
      </div>}
      <label style={ui.connectionCandidateSearch}><Search size={17}/><input value={candidateQuery} onChange={event => { setCandidateQuery(event.target.value); setResultPage(1); }} placeholder="전체 후보 안에서 대학명·학과·전형 검색" />{candidateQuery && <button type="button" onClick={() => { setCandidateQuery(""); setResultPage(1); }} aria-label="후보 검색어 지우기"><X size={14}/></button>}<strong>{searchedResults.length.toLocaleString()}건</strong></label>
    </>}

    {!results.length ? <div style={ui.connectionEmpty}>{mode === "grade" && !gradeReady ? "5등급 내신을 입력하거나 학생을 선택하면 성적대 연결 결과가 표시됩니다." : mode === "university" && !university ? "위의 ‘특정 대학과 비슷한 대학 찾기’를 선택한 뒤 기준 대학을 골라주세요." : connectionBandFilters.length ? "선택한 지원구간에 해당하는 후보가 없습니다. 우측 상단 지원구간 필터를 조정해보세요." : candidateQuery ? "검색어에 맞는 후보가 없습니다. 대학명이나 학과명을 줄여서 검색해보세요." : "선택한 범위에 연결되는 후보가 없습니다. 범위를 넓히거나 비교 기준을 바꿔주세요."}</div> : <div style={ui.connectionGrid}>{results.map(item => {
      const difference = Math.abs(Number(mode === "grade" ? item.difference : item.linkDifference));
      const support = mode === "grade" ? supportBand(convertedGrade, item.referenceCut) : null;
      const favoriteItem = connectionFavoriteItem(item);
      const favorite = favorites.some(value => favoriteMatchesConnection(value, item));
      const trend = schoolCaseTrend(caseRows, item.university, item.region, item.integratedScope ? "" : (item.originalDepartment || item.department), item.admissionType);
      const selected = selectedKey === item.key;
      return <article key={`${mode}-${item.key}`} onClick={() => setSelectedKey(item.key)} style={{ ...ui.connectionCard, ...(selected ? ui.connectionCardSelected : {}) }}>
        <div style={ui.connectionCardHead}>
          <div style={ui.connectionUniversityWrap}><small style={ui.connectionEntityLabel}>대학</small><b style={ui.connectionUniversityName}>{item.university}</b><span>{item.admissionType}</span></div>
          <button type="button" aria-label={favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"} disabled={!favoriteEnabled} onClick={event => { event.stopPropagation(); onToggleFavorite?.(favoriteItem); }} style={{ ...ui.connectionFavoriteBtn, ...(favorite ? ui.favoriteBtnActive : {}), ...(!favoriteEnabled ? ui.favoriteBtnDisabled : {}) }}><Star size={16} fill={favorite ? "currentColor" : "none"}/></button>
        </div>
        <div style={ui.connectionDepartmentWrap}><small style={ui.connectionEntityLabel}>모집단위</small><strong style={ui.connectionDepartment}>{item.department}</strong></div>
        <div style={ui.connectionMeta}><span>{item.field}</span><span>{item.track}</span><span style={item.integratedScope ? ui.integratedBadge : ui.officialBadge}>{item.integratedScope ? "계열 통합" : "학과 공개컷"}</span></div>
        <div className="susi-beta-connection-compare" style={ui.connectionDataCompare}>
          <section style={ui.connectionNaviBlock}>
            <div style={ui.connectionDataHeading}>
              <span style={ui.connectionNaviBadge}>NAVI 통합 기준</span>
              <b>{item.integratedScope ? "대학·전형·계열 통합컷" : "대학 공개 모집단위 컷"}</b>
            </div>
            <div className="susi-beta-connection-navi-metrics" style={ui.connectionNaviMetrics}>
              <span style={ui.connectionCutBasisMetric}><small>현재 판정 기준</small><b>{cutoffBasis}%컷</b></span>
              <span><small>기준 컷</small><b>{Number(item.referenceCut).toFixed(2)}</b></span>
              <span><small>{mode === "grade" ? "학생과 차이" : "기준대학과 차이"}</small><b>{difference.toFixed(2)}</b></span>
              <span><small>NAVI 통합 지원사례</small><b>{item.caseCount ? `${item.caseCount.toLocaleString()}건` : "자료 없음"}</b></span>
            </div>
            <small style={ui.connectionSource}><b>기준 출처</b><span>{item.referenceSource}</span>{item.caseCount ? <em>지원사례 수는 학과 개인별 기록이 아니라 대학·전형·계열 단위 통합 건수입니다.</em> : null}</small>
          </section>
          <section style={ui.connectionSchoolBlock}>
            <div style={ui.connectionDataHeading}>
              <span style={ui.connectionSchoolBadge}>광덕고 별도 사례</span>
              <b>2024–2026 실제 지원 결과</b>
            </div>
            <div className="susi-beta-connection-school-metrics" style={ui.connectionSchoolMetrics}>
              <span><small>지원 사례</small><b>{trend.total ? `${trend.total.toLocaleString()}건` : "0건"}</b></span>
              <span><small>합격 사례</small><b>{trend.accepted ? `${trend.accepted.toLocaleString()}건` : "0건"}</b></span>
              <span><small>합격률</small><b>{trend.rate == null ? "-" : `${trend.rate}%`}</b></span>
            </div>
            <div style={ui.connectionSchoolBlockFoot}>
              <small>NAVI 통합 사례와 별도로 집계합니다.</small>
              {onOpenCases && <button type="button" style={ui.connectionSchoolLink} onClick={event => { event.stopPropagation(); onOpenCases(item.university, item.integratedScope ? "" : (item.originalDepartment || item.department), item.admissionType || ""); }}>광덕고 사례 보기 ›</button>}
            </div>
          </section>
        </div>
        <div style={ui.connectionCardFoot}>{support ? <span style={{ color: support.color, background: support.background, borderColor: support.border }}>{support.label}</span> : <span>{item.linkedTarget ? `${item.linkedTarget.university} · ${item.linkedTarget.department} 기준` : "유사 지원군"}</span>}<button type="button" onClick={event => { event.stopPropagation(); onOpenUniversity?.(item); }}>대학 상세 보기 ›</button></div>
      </article>;
    })}</div>}

    {displayMode === "all" && resultPageCount > 1 && <Pagination page={resultPage} pageCount={resultPageCount} onChange={setResultPage}/>} 
    <div style={ui.connectionFooterNav}>
      <button type="button" style={ui.connectionBackButton} onClick={onBack}>‹ 대학 상세로</button>
      <div style={ui.connectionSelectionStatus}>{selectedItem ? <><small>선택한 결과</small><b>{selectedItem.university} · {selectedItem.department}</b></> : <span>카드를 선택하면 해당 대학의 상세 화면으로 돌아갈 수 있습니다.</span>}</div>
      <button type="button" disabled={!selectedItem} style={{ ...ui.connectionNextButton, ...(!selectedItem ? ui.favoriteBtnDisabled : {}) }} onClick={() => selectedItem && onOpenUniversity?.(selectedItem)}>선택 대학 상세 보기 ›</button>
    </div>
  </section>;
}

function SupportTrendPanel({ trend, compact = false, university = "", department = "", onOpenCases }) {
  const value = trend || { total: 0, accepted: 0, rate: null, detailTypes: [], scope: "연결 자료 없음" };
  const visibleTypes = value.detailTypes?.slice(0, compact ? 4 : 8) || [];
  const hiddenCount = Math.max(0, Number(value.detailTypes?.length || 0) - visibleTypes.length);
  return <div className={`susi-beta-school-trend ${compact ? "is-compact" : "is-expanded"}`} style={{ ...ui.schoolTrendPanel, ...(compact ? ui.schoolTrendCompact : ui.schoolTrendExpanded) }}>
    <div className="susi-beta-school-trend-heading" style={ui.schoolTrendHeading}>
      <div><small style={ui.schoolSourceBadge}>광덕고 별도 사례</small><b>{value.scope}</b></div>
      <span style={ui.schoolTrendSeparation}>
        <strong>{value.total ? "2024–2026 광덕고 별도 사례" : "2024–2026 광덕고 연결 사례 없음"}</strong>
        <em>NAVI 통합 사례와 별개</em>
      </span>
    </div>
    <div className="susi-beta-school-trend-metrics" style={ui.schoolTrendMetrics}>
      <span><small>지원 사례</small><b>{Number(value.total || 0).toLocaleString()}건</b></span>
      <span><small>합격 사례</small><b>{Number(value.accepted || 0).toLocaleString()}건</b></span>
      <span><small>합격률</small><b>{value.rate == null ? "-" : `${value.rate}%`}</b></span>
    </div>
    <div className="susi-beta-school-trend-types" style={ui.schoolTrendTypes}>
      {visibleTypes.length ? visibleTypes.map(item => <span key={item.label}>
        <b>{item.label}</b>
        <span style={ui.schoolTrendTypeMetrics}>
          <small><em>지원</em><strong>{item.total}건</strong></small>
          <small><em>합격</em><strong>{item.accepted}건</strong></small>
          <small><em>합격률</em><strong>{item.rate == null ? "-" : `${item.rate}%`}</strong></small>
        </span>
      </span>) : <em>광덕고 세부전형별 연결 자료가 없습니다.</em>}
      {hiddenCount > 0 && <em style={ui.schoolTrendMore}>외 {hiddenCount}개 세부전형은 광덕고 대입 결과 탭에서 확인할 수 있습니다.</em>}
    </div>
    <div style={ui.schoolTrendAction}>
      {onOpenCases ? <button type="button" style={ui.schoolTrendOpenButton} onClick={() => onOpenCases(university, department, "")}>광덕고 대입 결과에서 전체 보기 ›</button> : <span>교사용 ‘2024–2026 광덕고 대입 결과’ 탭에서 전체 사례를 확인합니다.</span>}
    </div>
  </div>;
}

function ResultCard({ row, minimums, courseRules = [], changes2028 = [], schedules = [], caseStats = [], schoolTrend = null, conversionGroup, convertedGrade, cutoffBasis = "70", favorite, favoriteEnabled, onToggleFavorite, onOpenCases, onConnectUniversity }) {
  const [open, setOpen] = useState(false);
  const [detailTab, setDetailTab] = useState("all");
  const [regionGroup, region, detailRegion, university, unit2026, unit2027, field, teaching, holistic, regular] = row;
  const favoriteItem = {
    source: "susiNaviBeta",
    university,
    universityKey: universityIdentityKey(university, region),
    campus: universityCampus(university, region),
    department: unit2027,
    admissionType: "",
    sourceLabel: "수시NAVI Beta",
    region,
    field,
    note: "2027 수시NAVI Beta 모집단위",
  };
  const tabs = [
    ["all", "전체"],
    ["teaching", `교과 ${teaching?.length || 0}`],
    ["holistic", `종합 ${holistic?.length || 0}`],
    ["regularMinimum", `정시·최저 ${(regular ? 1 : 0) + (minimums?.length || 0)}`],
  ];
  return (
    <article className="susi-beta-result-card" style={ui.resultCard}>
      <div style={ui.resultSummary}>
        <div style={ui.resultSummaryIdentity}>
          <div style={ui.universityLine}><span style={ui.resultEntityLabel}>대학</span><h3 style={ui.universityName}>{university}</h3><span style={ui.fieldBadge}>{field}</span><span style={ui.naviInlineBadge}>NAVI 통합 데이터</span></div>
          <div style={ui.resultDepartmentLine}><span style={ui.resultEntityLabel}>2027 모집단위</span><b style={ui.unitTitle}>{unit2027}</b></div>
          <span style={ui.location}>{[regionGroup, region, detailRegion].filter(Boolean).join(" · ")}</span>
        </div>
        <div style={ui.resultQuickStats}>
          <span><small>교과전형</small><b>{teaching?.length || 0}개</b></span>
          <span><small>종합전형</small><b>{holistic?.length || 0}개</b></span>
          <span><small>수능최저</small><b>{minimums?.length || 0}건</b></span>
        </div>
        <div style={ui.resultActions}>
          <button type="button" title={favoriteEnabled ? (favorite ? "즐겨찾기 해제" : "즐겨찾기 추가") : "학생을 먼저 선택하세요"} disabled={!favoriteEnabled} onClick={() => onToggleFavorite?.(favoriteItem)} style={{ ...ui.favoriteBtn, ...(favorite ? ui.favoriteBtnActive : {}), ...(!favoriteEnabled ? ui.favoriteBtnDisabled : {}) }}><Star size={16} fill={favorite ? "currentColor" : "none"}/></button>
          <button type="button" onClick={onConnectUniversity} style={ui.resultConnectButton}><Network size={15}/>이 대학과 비슷한 대학 찾기</button>
          <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} style={ui.resultToggle}>{open ? <ChevronUp size={16}/> : <ChevronDown size={16}/>} {open ? "상세 접기" : "상세 펼치기"}</button>
        </div>
      </div>
      {open && <div style={ui.resultCardBody}>
        <div className="susi-beta-result-identity" style={ui.resultIdentity}>
          <b style={ui.identityLabel}>NAVI 모집단위 연결 정보</b>
          <span style={ui.identitySourceNote}>경기도교육청 제공 2027 모집단위와<br/>대학 공개 2026 입시결과를 연결한 정보입니다.</span>
          {unit2026 && unit2026 !== unit2027 ? <div style={ui.previousUnit}><span>2026 모집단위</span><b>{unit2026}</b><span>2027 모집단위 <strong>{unit2027}</strong>(으)로 연결됩니다.</span></div> : <div style={ui.sameUnitNote}>2026·2027 모집단위명이 동일합니다.</div>}
          <div style={ui.detailTabGuide}><b>정보 항목</b><span>교과·종합·정시·수능최저 중 필요한 항목만 선택해 넓게 볼 수 있습니다.</span></div>
          <RelatedInfo courseRules={courseRules} changes2028={changes2028} schedules={schedules} />
        </div>
        <div style={ui.resultDetailArea}>
          <div className="susi-beta-detail-tabs" style={ui.detailTabs} role="tablist" aria-label={`${university} ${unit2027} 상세 정보`}>
            {tabs.map(([key, label]) => <button type="button" key={key} role="tab" aria-selected={detailTab === key} onClick={() => setDetailTab(key)} style={{ ...ui.detailTabButton, ...(detailTab === key ? ui.detailTabActive : {}) }}>{label}</button>)}
          </div>
          <div className="susi-beta-admission-columns" style={{ ...ui.admissionColumns, ...(detailTab !== "all" ? ui.admissionColumnsSingle : {}) }}>
            {(detailTab === "all" || detailTab === "teaching") && <AdmissionGroup title="교과전형" year="2026 입시결과" admissionType="교과" items={teaching} convertedGrade={convertedGrade} cutoffBasis={cutoffBasis} tone="teaching" university={university} region={region} caseStats={caseStats} conversionGroup={conversionGroup} />}
            {(detailTab === "all" || detailTab === "holistic") && <AdmissionGroup title="종합전형" year="2026 입시결과" admissionType="종합" items={holistic} convertedGrade={convertedGrade} cutoffBasis={cutoffBasis} tone="holistic" university={university} region={region} caseStats={caseStats} conversionGroup={conversionGroup} />}
            {(detailTab === "all" || detailTab === "regularMinimum") && <RegularGroup info={regular} />}
            {(detailTab === "all" || detailTab === "regularMinimum") && <MinimumGroup rows={minimums} />}
          </div>
        </div>
      </div>}
      <SupportTrendPanel trend={schoolTrend} compact={!open} university={university} department={unit2027} onOpenCases={onOpenCases}/>
    </article>
  );
}

function printAdmissionSummary(items = [], cutoffBasis = "50") {
  if (!items.length) return "-";
  return items.slice(0, 2).map(item => `${item[0] || "전형"} ${cutoffBasis}% ${cutoffValue(item, cutoffBasis) ?? "-"}`).join(" / ");
}
function PrintResultSheet({ rows = [], page, total, conversionMethod, conversionGroup, convertedGrade, cutoffBasis, query, region, field, admissionType, minimumFilter }) {
  return <section className="susi-beta-print-sheet">
    <header><div><h1>2027 수시NAVI Beta 검색 결과</h1><p>2027 모집단위 · 2026 입시결과 연결 자료</p></div><div><b>현재 페이지 {page}</b><span>전체 검색 결과 {Number(total || 0).toLocaleString()}건</span></div></header>
    <div className="print-criteria"><span>학생 9등급 환산 <b>{Number.isFinite(Number(convertedGrade)) ? Number(convertedGrade).toFixed(2) : "-"}</b></span><span>환산 <b>{conversionMethod === "statistical" ? `통계 Beta · ${conversionGroup}` : "기존 환산"}</b></span><span>판정 <b>{cutoffBasis}%컷</b></span><span>검색 <b>{query || "전체"}</b></span><span>필터 <b>{[region, field, admissionType, minimumFilter].join(" · ")}</b></span></div>
    <table><thead><tr><th>대학</th><th>2027 모집단위</th><th>지역·계열</th><th>교과전형</th><th>종합전형</th><th>정시 참고</th><th>2027 수능최저</th></tr></thead><tbody>{rows.map(({ row, minimums }, index) => <tr key={`${row[3]}-${row[5]}-${index}`}><td><b>{row[3]}</b></td><td>{row[5]}</td><td>{[row[1], row[6]].filter(Boolean).join(" · ")}</td><td>{printAdmissionSummary(row[7], cutoffBasis)}</td><td>{printAdmissionSummary(row[8], cutoffBasis)}</td><td>{row[9] ? `${row[9][0] || "일반"} · 70% ${row[9][2] ?? "-"}` : "-"}</td><td>{minimums?.slice(0, 2).map(item => `${item[3] || item[2] || "전형"}: ${item[8] || "확인"}`).join(" / ") || "-"}</td></tr>)}</tbody></table>
    <footer>※ 대학 공식 모집요강을 반드시 최종 확인하세요. 화면의 ‘현재 결과 인쇄·PDF’는 현재 페이지 최대 12개 모집단위를 A4 가로 1페이지로 정리합니다.</footer>
  </section>;
}

function SectionTitle({ tone, title, year }) {
  const toneStyle = tone === "teaching" ? ui.sectionTeaching
    : tone === "holistic" ? ui.sectionHolistic
      : tone === "regular" ? ui.sectionRegular
        : ui.sectionMinimum;
  return <div style={ui.resultSectionTitle}><span style={{ ...ui.sectionTypeBadge, ...toneStyle }}>{title}</span><b>{year}</b></div>;
}
function AdmissionGroup({ title, year, admissionType, items = [], convertedGrade, cutoffBasis, tone, university, region, caseStats, conversionGroup }) {
  return <div style={ui.resultSection}><SectionTitle tone={tone} title={title} year={year}/>{items.length ? <div style={{ ...ui.admissionItems, ...(items.length >= 4 ? ui.admissionItemsDense : {}) }}>{items.map((item, index) => {
    const selectedCutoff = cutoffValue(item, cutoffBasis);
    const diff = differenceLabel(convertedGrade, selectedCutoff);
    const support = supportBand(convertedGrade, selectedCutoff);
    const stat = bestCaseStat(caseStats, university, region, item[0], admissionType, conversionGroup);
    const cuts = caseCutForGroup(stat, conversionGroup);
    return <div key={`${item[0]}-${index}`} style={{ ...ui.admissionItem, ...(tone === "teaching" ? ui.teachingItem : ui.holisticItem) }}>
      <div style={ui.admissionItemHead}><b style={ui.admissionName}>{item[0]}</b>{support && <span style={{ ...ui.supportBadge, color: support.color, background: support.background, borderColor: support.border }}>{support.label}</span>}</div>
      <small style={ui.officialCutLabel}><span>대학 공개 2026 입시결과</span><b style={ui.officialCutBasisTag}>{cutoffBasis}%컷 기준 판정</b></small>
      <div style={ui.cutoffGrid}>
        <div style={{ ...ui.cutoffBox, ...(cutoffBasis === "50" ? ui.cutoffBoxActive : {}) }}><span style={ui.cutoffBoxLabel}>50%컷</span><b style={ui.cutoffBoxValue}>{item[1] ?? "-"}</b></div>
        <div style={{ ...ui.cutoffBox, ...(cutoffBasis === "70" ? ui.cutoffBoxActive : {}) }}><span style={ui.cutoffBoxLabel}>70%컷</span><b style={ui.cutoffBoxValue}>{item[2] ?? "-"}</b></div>
      </div>
      {diff && <small style={{ ...ui.studentDifference, color: diff.favorable ? "#287348" : "#b05244" }}>학생 환산 − {cutoffBasis}%컷 <b>{diff.text}</b></small>}
      {cuts?.[0] ? <CaseDistribution cuts={cuts} cutoffBasis={cutoffBasis} /> : <small style={ui.caseNone}>NAVI 통합 사례 분포 없음</small>}
    </div>;
  })}</div> : <span style={ui.none}>자료 없음</span>}</div>;
}
function CaseDistribution({ cuts, cutoffBasis = "70" }) {
  const [open, setOpen] = useState(false);
  const [count, p30, p50, p70] = cuts || [];
  if (![p30, p50, p70].some(value => Number.isFinite(Number(value)))) return null;
  return <div style={ui.caseDisclosure}>
    <button type="button" onClick={() => setOpen(value => !value)} style={ui.caseToggleBtn}>
      <span style={ui.caseToggleIdentity}><small>NAVI 통합 사례</small><b>대학 · 전형 · 계열 통합</b></span>
      <span style={ui.caseToggleCount}><strong>{Number(count || 0).toLocaleString()}</strong><small>지원사례</small></span>
      <span style={ui.caseToggleAction}>{open ? "컷 닫기" : "30·50·70%컷 보기"}</span>
    </button>
    {open && <><div style={ui.caseCutGrid}>
      {[["30%", p30, ui.case30], ["50%", p50, ui.case50], ["70%", p70, ui.case70]].map(([label, value, toneStyle]) => {
        const selected = label.replace("%", "") === cutoffBasis;
        return <div key={label} style={{ ...ui.caseCutCard, ...toneStyle, ...(selected ? ui.caseCutSelected : {}) }}><span style={ui.caseCutLabel}>{label} 컷{selected ? " · 현재 기준" : ""}</span><b style={ui.caseCutValue}>{Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "-"}</b></div>;
      })}
    </div><small style={ui.caseScopeNote}><b>선택한 교과 조합 기준</b><span>경기도교육청 NAVI 사례를 학과 구분 없이 대학·전형·계열 단위로 통합한 통계입니다.</span></small></>}
  </div>;
}

function RelatedInfo({ courseRules = [], changes2028 = [], schedules = [] }) {
  const total = courseRules.length + changes2028.length + schedules.length;
  if (!total) return null;
  return <details style={ui.relatedDetails}>
    <summary style={ui.relatedSummary}>전형 상세자료 <span>{total}건</span></summary>
    <div style={ui.relatedBody}>
      {!!courseRules.length && <section><b>2027 교과 반영</b>{courseRules.slice(0, 2).map((item, index) => <p key={index}><strong>{item[3] || "교과전형"}</strong><span>{[item[6], item[7], item[8], item[17]].filter(Boolean).join(" · ")}</span></p>)}</section>}
      {!!changes2028.length && <section><b>2028 변경사항</b>{changes2028.slice(0, 2).map((item, index) => <p key={index}><strong>{item[3] || item[2] || "변경"}</strong><span>{item[8] || item[5] || "세부 내용 확인"}</span></p>)}</section>}
      {!!schedules.length && <section><b>전형 일정</b>{schedules.slice(0, 3).map((item, index) => <p key={index}><strong>{item[0] || "일정"}</strong><span>{[item[3], item[4], item[5]].filter(Boolean).join(" · ")}</span></p>)}</section>}
    </div>
  </details>;
}
function RegularGroup({ info }) {
  return <div style={ui.resultSection}><SectionTitle tone="regular" title="정시" year="2026 참고"/>{info ? <div style={{ ...ui.admissionItem, ...ui.regularItem }}>
    <div style={ui.regularHead}><b style={ui.admissionName}>{info[0] || "일반전형"}</b><span style={ui.regularPercentile}>70% 백분위 <strong>{info[2] ?? "-"}</strong></span></div>
    <div style={ui.regularMeta}><span>영어·한국사</span><b>{info[3] || "확인 필요"}</b></div>
    <p style={ui.regularSubjects}>{info[4] || info[1] || "대학별 반영영역 확인 필요"}</p>
  </div> : <span style={ui.none}>정시 참고 자료 없음</span>}</div>;
}
function MinimumGroup({ rows = [] }) {
  return <div style={ui.resultSection}><SectionTitle tone="minimum" title="수능최저" year="2027 기준"/>{rows.length ? <div style={ui.minimumList}>{rows.slice(0, 2).map((row, index) => <div key={`${row[3]}-${index}`} style={ui.minimumItem}>
    <div style={ui.minimumHead}><b>{row[3] || row[2] || "전형"}</b><span>{row[2] || "수시"}</span></div>
    <strong style={ui.minimumCriteria}>{row[8] || "기준 원문 확인"}</strong>
    <small style={ui.minimumNote}>{[row[6] && `반영영역 ${row[6]}`, row[10] && row[10] !== "-" ? row[10] : ""].filter(Boolean).join(" · ")}</small>
  </div>)}</div> : <span style={ui.none}>해당 모집단위 수능최저 자료 없음</span>}</div>;
}

const ui = {
  root: { display: "grid", gap: 15, fontFamily: "Pretendard, 'Noto Sans KR', system-ui, sans-serif", color: "#222a3a", fontSize: 14, lineHeight: 1.55 },
  loading: { minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#647086", fontWeight: 750 },
  hero: { padding: "23px 25px", borderRadius: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, color: "#fff", background: "linear-gradient(135deg,#63558e,#8a5d82)", boxShadow: "0 14px 34px rgba(86,67,119,.18)" },
  heroEyebrow: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 850, opacity: .86 },
  heroTitle: { margin: "6px 0 4px", fontSize: 25, lineHeight: 1.15, letterSpacing: "-.03em" },
  heroText: { margin: 0, fontSize: 13.5, lineHeight: 1.6, opacity: .9 },
  heroStats: { minWidth: 170, display: "grid", gap: 4, textAlign: "right" },
  betaBadge: { display: "inline-flex", padding: "3px 7px", borderRadius: 999, background: "#eee8ff", color: "#6b55a0", fontSize: 10, fontWeight: 900, verticalAlign: "middle" },
  betaNotice: { display: "flex", gap: 9, alignItems: "flex-start", padding: "11px 14px", border: "1px solid #e5d9b7", borderRadius: 12, background: "#fff9e9", color: "#6e5923", fontSize: 13.5, lineHeight: 1.6 },
  viewToolbar: { position: "sticky", top: 6, zIndex: 12, display: "grid", gridTemplateColumns: "minmax(520px,720px) auto", justifyContent: "center", alignItems: "stretch", gap: 12, padding: 8, border: "1px solid #d8deea", borderRadius: 16, background: "rgba(255,255,255,.97)", boxShadow: "0 8px 22px rgba(44,53,69,.09)", backdropFilter: "blur(8px)" },
  viewTabs: { minWidth: 0, display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 6 },
  viewTab: { minWidth: 0, minHeight: 56, display: "grid", gridTemplateColumns: "28px minmax(0,1fr)", gridTemplateRows: "auto auto", columnGap: 9, alignContent: "center", textAlign: "left", padding: "8px 12px", border: "1px solid transparent", borderRadius: 12, background: "transparent", color: "#5e6a7d", cursor: "pointer" },
  viewTabActive: { borderColor: "#d6cbea", background: "linear-gradient(135deg,#f4f0fb,#fff)", color: "#594681", boxShadow: "0 3px 10px rgba(86,69,126,.12)" },
  viewToolbarActions: { display: "grid", gridTemplateColumns: "auto auto", alignItems: "stretch", gap: 7 },
  cutoffStatusChip: { minWidth: 132, display: "grid", placeItems: "center", alignContent: "center", gap: 1, padding: "6px 11px", border: "1px solid #d7cbea", borderRadius: 12, background: "linear-gradient(135deg,#f4effb,#fff)", color: "#5a4584", textAlign: "center", boxShadow: "0 4px 10px rgba(86,69,126,.08)" },
  printButton: { minWidth: 176, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, border: "1px solid #263c61", borderRadius: 12, background: "#263c61", color: "#fff", fontSize: 13, fontWeight: 900, cursor: "pointer", boxShadow: "0 5px 12px rgba(38,60,97,.18)" },
  tabPanel: { display: "grid", gap: 13 },
  tabGuide: { display: "grid", gridTemplateColumns: "180px minmax(0,1fr)", gap: 14, alignItems: "center", padding: "14px 16px", border: "1px solid #dce3ed", borderRadius: 14, background: "linear-gradient(135deg,#f7f9fd,#fff)", color: "#536176", fontSize: 13.5, lineHeight: 1.6 },
  goResultButton: { minHeight: 43, padding: "0 16px", border: "1px solid #5f4e87", borderRadius: 11, background: "#66558e", color: "#fff", fontSize: 13, fontWeight: 900, cursor: "pointer", boxShadow: "0 6px 14px rgba(86,69,126,.20)" },
  directResultButton: { minHeight: 43, padding: "0 14px", border: "1px solid #ccd7e5", borderRadius: 11, background: "#fff", color: "#52627a", fontSize: 12.5, fontWeight: 850, cursor: "pointer" },
  searchWorkflowFooter: { marginTop: 13, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "13px 15px", border: "1px solid #d8d0e8", borderRadius: 12, background: "linear-gradient(135deg,#f8f5fd,#fff)", color: "#606b7d", fontSize: 12.5, lineHeight: 1.55 },
  workflowCopy: { minWidth: 0, display: "grid", gap: 4 },
  workflowNextButton: { minHeight: 40, flex: "0 0 auto", padding: "0 15px", border: 0, borderRadius: 10, background: "#5f4d88", color: "#fff", fontSize: 12.5, fontWeight: 900, cursor: "pointer" },
  resultContextGuide: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, padding: "17px 19px", border: "1px solid #d9e2ef", borderRadius: 14, background: "linear-gradient(135deg,#f5f8fd,#fff)", color: "#526075", fontSize: 13.2, lineHeight: 1.62 },
  guideCopy: { minWidth: 0, display: "grid", gap: 6 },
  resultContextActions: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" },
  sourceGuideDetails: { border: "1px solid #dce3ec", borderRadius: 13, background: "#fbfcfe", overflow: "hidden" },
  sourceGuideSummary: { minHeight: 45, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "0 14px", cursor: "pointer", color: "#536176", listStyle: "none" },
  resultControlPanel: { display: "grid", gap: 10, padding: "14px", border: "1px solid #c9d8e8", borderRadius: 14, background: "linear-gradient(145deg,#f5f9fe,#ffffff)", boxShadow: "0 4px 14px rgba(48,73,104,.05)" },
  resultControlHeading: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", paddingBottom: 9, borderBottom: "1px solid #e5ebf2", color: "#354c68" },
  resultControlGrid: { display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 8, alignItems: "stretch" },
  resultSortControl: { position: "relative", minWidth: 0, minHeight: 42, display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", alignItems: "center", gap: 7, padding: "0 10px", border: "1px solid #ced8e5", borderRadius: 10, background: "#fff", color: "#59687c", boxSizing: "border-box", cursor: "pointer", overflow: "hidden" },
  resultSortNative: { position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" },
  resultSupportQuick: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "8px 9px", border: "1px solid #e1e7ef", borderRadius: 10, background: "rgba(255,255,255,.82)", color: "#5c6d82", fontSize: 10.5, fontWeight: 900 },
  resultSupportQuickBtn: { minHeight: 30, padding: "0 10px", border: "1px solid", borderRadius: 999, fontSize: 10.5, fontWeight: 950, cursor: "pointer" },
  resultSupportReset: { minHeight: 28, padding: "0 10px", border: "1px solid #d7dfe9", borderRadius: 999, background: "#fff", color: "#69768a", fontSize: 10.5, fontWeight: 900, cursor: "pointer" },
  dataSourceLegend: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  naviSourceCard: { minWidth: 0, display: "grid", gap: 4, padding: "12px 14px", border: "1px solid #d8d1e8", borderRadius: 12, background: "linear-gradient(135deg,#f6f2fb,#fff)", color: "#5f5277", fontSize: 11.5, lineHeight: 1.5 },
  schoolSourceCard: { minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", columnGap: 10, rowGap: 4, alignItems: "center", padding: "12px 14px", border: "1px solid #e4c3ca", borderRadius: 12, background: "linear-gradient(135deg,#fff3f5,#fffafb)", color: "#724650", fontSize: 11.5, lineHeight: 1.5 },
  sourceCardCopy: { minWidth: 0, display: "grid", gap: 3 },
  sourceLegendLink: { minHeight: 36, padding: "0 11px", border: "1px solid #ddb5bd", borderRadius: 9, background: "#fff", color: "#8a4050", fontSize: 11, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" },
  resultConnectPrimary: { minHeight: 40, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 14px", border: "1px solid #58447f", borderRadius: 10, background: "#604c89", color: "#fff", fontSize: 12.5, fontWeight: 950, cursor: "pointer", boxShadow: "0 5px 12px rgba(86,69,126,.18)" },
  resultWorkflowFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "16px 17px", border: "1px solid #d8d0e8", borderRadius: 13, background: "linear-gradient(135deg,#f7f3fc,#fff)", color: "#566276", fontSize: 12.5, lineHeight: 1.55 },
  detailSearchPanel: { display: "grid", gridTemplateColumns: "minmax(230px,.75fr) minmax(310px,1.15fr) minmax(260px,.9fr)", gap: 13, alignItems: "end", padding: "17px 18px", border: "1px solid #d9e2ef", borderRadius: 14, background: "linear-gradient(135deg,#f7faff,#fbf9ff)" },
  detailSearchHeading: { display: "grid", gap: 4, color: "#26384f" },
  detailSearchBox: { minWidth: 0, minHeight: 48, display: "flex", alignItems: "center", gap: 9, padding: "0 12px", border: "1px solid #c8d5e5", borderRadius: 11, background: "#fff", color: "#52657f", boxShadow: "0 3px 10px rgba(48,65,88,.05)" },
  detailUniversitySelect: { display: "grid", gap: 6, color: "#59687c", fontSize: 11, fontWeight: 900 },
  backToSearchButton: { flex: "0 0 auto", minHeight: 39, padding: "0 13px", border: "1px solid #cfd8e5", borderRadius: 10, background: "#fff", color: "#40516a", fontSize: 11.2, fontWeight: 850, cursor: "pointer" },
  resultFilterBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", border: "1px solid #e0e5ed", borderRadius: 12, background: "#fbfcfe", flexWrap: "wrap" },
  activeFilterWrap: { minWidth: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  activeFilterLabel: { color: "#7b8797", fontSize: 9.5, fontWeight: 900 },
  activeFilterChip: { display: "inline-flex", alignItems: "center", minHeight: 26, padding: "0 8px", borderRadius: 999, background: "#edf2f8", color: "#445875", border: "1px solid #d6e0ec", fontSize: 11, fontWeight: 850 },
  activeFilterEmpty: { color: "#9aa2ae", fontSize: 9.5 },
  clearFilterButton: { minHeight: 34, padding: "0 12px", border: "1px solid #e59a9a", borderRadius: 9, background: "#fff0f0", color: "#c83232", fontSize: 13, fontWeight: 950, cursor: "pointer", boxShadow: "0 3px 8px rgba(190,48,48,.08)" },
  resultCutoffControl: { display: "inline-flex", alignItems: "center", gap: 5, padding: 5, border: "1px solid #ddd5ea", borderRadius: 11, background: "#f2eef8", color: "#706480", fontSize: 10.5, fontWeight: 900 },
  resultCutoffButton: { minWidth: 63, height: 33, border: "1px solid transparent", borderRadius: 8, background: "transparent", color: "#786f85", fontSize: 11.5, fontWeight: 950, cursor: "pointer" },
  resultCutoffActive: { background: "#65518d", color: "#fff", borderColor: "#5a477e", boxShadow: "0 3px 8px rgba(86,69,126,.18)" },
  empty: { minHeight: 280, padding: 32, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, border: "1px dashed #cfd5df", borderRadius: 16, background: "#fafbfc", color: "#667085", textAlign: "center" },
  converterPanel: { padding: 18, border: "1px solid #dce2ec", borderRadius: 16, background: "#fff" },
  searchPanel: { padding: 18, border: "1px solid #dce2ec", borderRadius: 16, background: "#fff" },
  sectionHeading: { display: "flex", gap: 10, alignItems: "center", marginBottom: 14 },
  sectionTitle: { display: "block", fontSize: 14, lineHeight: 1.25, color: "#2b3445" },
  sectionSub: { display: "block", marginTop: 3, fontSize: 12.5, lineHeight: 1.55, color: "#707c8f" },
  step: { width: 26, height: 26, borderRadius: 9, background: "#665690", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 12 },
  converterGrid: { display: "grid", gridTemplateColumns: "150px minmax(270px,1.4fr) minmax(160px,.8fr) minmax(190px,.9fr)", gap: 10, alignItems: "stretch" },
  fieldLabel: { display: "grid", gap: 6, minWidth: 0, fontSize: 11, fontWeight: 800, color: "#5d6678" },
  labelText: { fontSize: 11, fontWeight: 800, color: "#5d6678" },
  input: { width: "100%", boxSizing: "border-box", height: 42, border: "1px solid #ced7e5", borderRadius: 10, padding: "0 12px", fontSize: 16, fontWeight: 900, color: "#263c62", outline: "none" },
  select: { width: "100%", height: 42, border: "1px solid #ced7e5", borderRadius: 10, padding: "0 10px", background: "#fff", fontWeight: 750, color: "#344054" },
  methodBox: { display: "grid", gap: 6 },
  segmented: { display: "grid", gridTemplateColumns: "1fr 1fr", padding: 4, borderRadius: 11, background: "#eef1f6" },
  segmentBtn: { minHeight: 34, border: 0, borderRadius: 8, background: "transparent", color: "#657085", fontWeight: 800, cursor: "pointer" },
  segmentActive: { background: "#fff", color: "#5c4a89", boxShadow: "0 3px 8px rgba(57,65,83,.12)" },
  conversionResult: { display: "grid", alignContent: "center", gap: 2, padding: "9px 13px", borderRadius: 12, background: "linear-gradient(135deg,#f5f1ff,#faf8ff)", border: "1px solid #dcd2f0" },
  conversionLabel: { fontSize: 10, fontWeight: 850, color: "#73658d" },
  conversionValue: { fontSize: 21, lineHeight: 1.1, color: "#543f82" },
  conversionHelp: { fontSize: 9.5, color: "#817795" },
  statDisclaimer: { marginTop: 10, padding: "9px 11px", borderRadius: 10, background: "#f7f5fb", color: "#6d6381", fontSize: 10.5, lineHeight: 1.5 },
  studentAutoBar: { marginBottom: 12, display: "grid", gridTemplateColumns: "minmax(180px,.8fr) minmax(130px,.45fr) minmax(260px,1.4fr)", alignItems: "center", gap: 12, padding: "11px 13px", border: "1px solid #d4deed", borderRadius: 12, background: "linear-gradient(135deg,#f7faff,#fbfcff)" },
  studentAutoIdentity: { display: "grid", gap: 3, minWidth: 0 },
  studentAutoGrade: { display: "grid", gap: 2, padding: "7px 10px", borderRadius: 9, background: "#edf4ff", color: "#315a91" },
  filterGrid: { display: "grid", gridTemplateColumns: "minmax(260px,2fr) repeat(4,minmax(120px,.65fr))", gap: 11, alignItems: "end" },
  searchBox: { minHeight: 46, display: "flex", alignItems: "center", gap: 9, padding: "0 13px", border: "1px solid #cdd7e6", borderRadius: 12, background: "#fff", boxShadow: "0 2px 7px rgba(50,65,90,.025)" },
  filterLabel: { display: "grid", gridTemplateRows: "auto 1fr", gap: 5, fontSize: 10, fontWeight: 850, color: "#68758a" },
  multiFilter: { position: "relative", minWidth: 0, alignSelf: "stretch" },
  multiFilterCompact: { minHeight: 42 },
  multiFilterSummary: { minHeight: 42, display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", alignItems: "center", gap: 7, padding: "0 10px", border: "1px solid #ced8e5", borderRadius: 10, background: "#fff", color: "#59687c", cursor: "pointer", listStyle: "none", boxSizing: "border-box" },
  multiFilterMenu: { position: "absolute", top: "calc(100% + 5px)", left: 0, zIndex: 40, minWidth: "100%", width: "max-content", maxWidth: 280, maxHeight: 300, overflowY: "auto", display: "grid", gap: 3, padding: 6, border: "1px solid #d6dee9", borderRadius: 11, background: "#fff", boxShadow: "0 14px 32px rgba(40,54,75,.16)" },
  multiFilterOption: { minWidth: 145, minHeight: 31, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "0 9px", border: 0, borderRadius: 7, background: "transparent", color: "#526177", fontSize: 11.5, fontWeight: 850, textAlign: "left", cursor: "pointer" },
  multiFilterOptionActive: { background: "#eaf2fb", color: "#285b8d" },
  multiFilterClear: { minHeight: 30, marginTop: 3, border: "1px solid #efc2c2", borderRadius: 7, background: "#fff5f5", color: "#bd3e3e", fontSize: 11, fontWeight: 900, cursor: "pointer" },
  resultCount: { display: "flex", alignItems: "baseline", gap: 7, color: "#687386", fontSize: 11.5 },
  searchSummaryRow: { marginTop: 16, paddingTop: 14, borderTop: "1px solid #edf0f5", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" },
  searchSummaryTools: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" },
  favoriteFilterWrap: { display: "flex", alignItems: "center", gap: 9, padding: "5px 6px 5px 10px", border: "1px solid #e3e7ee", borderRadius: 11, background: "#fafbfc" },
  favoriteFilterLabel: { fontSize: 9.5, fontWeight: 850, color: "#8490a2" },
  favoriteFilterBtn: { minHeight: 32, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 11px", border: "1px solid #d5ddea", borderRadius: 9, background: "#fff", color: "#667085", fontSize: 10.5, fontWeight: 850, cursor: "pointer" },
  favoriteFilterActive: { borderColor: "#e1c36d", background: "#fff7d9", color: "#9a660d", boxShadow: "0 3px 9px rgba(181,126,18,.11)" },
  supportFilterRow: { marginTop: 15, padding: "14px 15px", border: "1px solid #e0e5ef", borderRadius: 13, background: "linear-gradient(135deg,#fafbff,#f8f7fc)", display: "grid", gap: 12 },
  supportFilterTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" },
  supportFilterHeading: { minWidth: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, lineHeight: 1.4, color: "#344055", flexWrap: "wrap" },
  supportFilterEyebrow: { fontSize: 9.5, fontWeight: 900, color: "#735e9a", letterSpacing: ".02em", whiteSpace: "nowrap" },
  supportFilterOneLine: { minWidth: 0, display: "grid", gap: 2, fontSize: 10.4, color: "#4e596d", fontWeight: 780, lineHeight: 1.4 },
  globalConversionControls: { display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" },
  globalConversionBtn: { minHeight: 29, padding: "0 9px", border: "1px solid #d9dfea", borderRadius: 8, background: "#fff", color: "#6b7587", fontSize: 9.5, fontWeight: 850, cursor: "pointer" },
  globalConversionActive: { color: "#fff", background: "#66558e", borderColor: "#66558e", boxShadow: "0 3px 8px rgba(86,69,126,.16)" },
  globalConversionSelect: { height: 29, border: "1px solid #d4dce8", borderRadius: 8, background: "#fff", padding: "0 7px", color: "#4f5b70", fontSize: 9.5, fontWeight: 800 },
  supportFilterControls: { minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
  cutoffBasisToggle: { display: "inline-grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: 5, borderRadius: 13, background: "#e8ecf3", border: "1px solid #d9dfeb" },
  cutoffBasisBtn: { minWidth: 122, minHeight: 48, display: "grid", placeItems: "center", gap: 2, padding: "7px 12px", border: "1px solid transparent", borderRadius: 10, background: "transparent", color: "#727d8e", cursor: "pointer" },
  cutoffBasisActive: { background: "linear-gradient(135deg,#66558e,#7d6195)", color: "#fff", borderColor: "#5f4e87", boxShadow: "0 7px 16px rgba(86,69,126,.24)", transform: "translateY(-1px)" },
  supportLegend: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 7, flexWrap: "wrap" },
  supportFilterBtn: { minHeight: 30, padding: "0 11px", border: "1px solid #d7deea", borderRadius: 999, background: "#fff", color: "#657085", fontSize: 10, fontWeight: 850, cursor: "pointer" },
  supportFilterBtnActive: { background: "#5e5188", borderColor: "#5e5188", color: "#fff", boxShadow: "0 4px 10px rgba(94,81,136,.18)" },
  supportLegendItem: { minHeight: 30, display: "inline-flex", alignItems: "center", gap: 5, padding: "0 10px", border: "1px solid", borderRadius: 999, fontSize: 9.5, fontWeight: 800, cursor: "pointer" },
  supportSelected: { boxShadow: "0 0 0 2px rgba(74,85,115,.17)", transform: "translateY(-1px)" },
  caseStatsGuide: { display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", border: "1px solid #d9e1ee", borderRadius: 11, background: "#f7f9fd", color: "#5c687c", fontSize: 10.5, lineHeight: 1.5 },
  connectionPanel: { display: "grid", gap: 18, padding: 21, border: "1px solid #cbd8e7", borderRadius: 18, background: "linear-gradient(145deg,#ffffff,#f5f8fb)", boxShadow: "0 10px 26px rgba(44,62,86,.07)" },
  connectionHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  connectionHeadActions: { marginLeft: "auto", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" },
  connectionBandFilterTop: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5, flexWrap: "wrap", padding: "5px 7px", border: "1px solid #d8e0e9", borderRadius: 11, background: "#f7f9fc" },
  connectionBandLabel: { fontSize: 10.5, fontWeight: 950, color: "#66758a", marginRight: 2, whiteSpace: "nowrap" },
  connectionBandBtn: { minHeight: 28, padding: "0 8px", border: "1px solid", borderRadius: 999, fontSize: 10.2, fontWeight: 950, cursor: "pointer", whiteSpace: "nowrap" },
  connectionTitleWrap: { display: "flex", alignItems: "center", gap: 11, minWidth: 0 },
  connectionIcon: { width: 40, height: 40, flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 12, color: "#285d87", background: "#e8f1f8" },
  connectionTitle: { display: "block", fontSize: 20, lineHeight: 1.25, color: "#21324a" },
  connectionSub: { display: "block", maxWidth: 720, marginTop: 5, fontSize: 13, lineHeight: 1.6, color: "#69768a", wordBreak: "break-word", overflowWrap: "anywhere" },
  connectionModeToggle: { display: "inline-grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 4, borderRadius: 11, background: "#e9edf4" },
  connectionModeBtn: { minHeight: 34, padding: "0 13px", border: 0, borderRadius: 8, background: "transparent", color: "#687488", fontSize: 10.5, fontWeight: 900, cursor: "pointer" },
  connectionModeActive: { color: "#fff", background: "#5f4f88", boxShadow: "0 3px 9px rgba(86,69,126,.2)" },
  connectionModeChooser: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 },
  connectionModeCard: { minWidth: 0, display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gridTemplateRows: "auto auto", columnGap: 12, rowGap: 5, alignItems: "center", padding: "15px 16px", border: "1px solid #d4deea", borderRadius: 14, background: "#fff", color: "#526075", textAlign: "left", cursor: "pointer" },
  connectionModeCardActive: { borderColor: "#315f88", background: "linear-gradient(135deg,#edf5fb,#fff)", color: "#234d73", boxShadow: "0 0 0 2px rgba(49,95,136,.11),0 7px 16px rgba(43,79,112,.10)" },
  connectionUniversitySelector: { minHeight: 78, padding: "9px 10px", border: "1px solid #d9e1ec", borderRadius: 12, background: "#f8fafd" },
  connectionControls: { display: "grid", gridTemplateColumns: "minmax(0,1.65fr) minmax(185px,.55fr) minmax(155px,.42fr)", gap: 12, alignItems: "stretch" },
  connectionCriterion: { minHeight: 112, minWidth: 0, display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8, padding: 9, border: "1px solid #cfdae7", borderRadius: 15, background: "#eef3f7", overflow: "hidden" },
  connectionCriteriaHeading: { gridColumn: "1/-1", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "4px 5px 2px", color: "#566579", fontSize: 10.5, lineHeight: 1.4, flexWrap: "wrap" },
  criterionItem: { minWidth: 0, display: "grid", alignContent: "center", justifyItems: "center", gap: 6, padding: "12px 10px", borderRadius: 11, background: "#fff", color: "#405069", border: "1px solid #dbe3ec", textAlign: "center", boxShadow: "0 2px 7px rgba(51,70,94,.035)" },
  criterionLabel: { display: "block", fontSize: 10.5, lineHeight: 1.3, fontWeight: 850, color: "#758196" },
  criterionValue: { display: "block", maxWidth: "100%", fontSize: 14, lineHeight: 1.3, fontWeight: 900, color: "#35475f", wordBreak: "break-word", overflowWrap: "anywhere" },
  criterionValueStrong: { display: "block", fontSize: 18, lineHeight: 1.15, fontWeight: 950, color: "inherit" },
  criterionMethod: { background: "#f9fbfd", color: "#344b64", border: "1px solid #d7e1eb" },
  criterionGroup: { background: "#eef8f4", color: "#2f6654", border: "1px solid #c8e0d7" },
  criterionGrade: { background: "#eaf3ff", color: "#224f88", border: "1px solid #bfd4ef" },
  criterionCut: { background: "#fff4df", color: "#7b551d", border: "1px solid #e8cc98" },
  connectionSelectLabel: { display: "grid", alignContent: "center", gap: 7, fontSize: 12.5, fontWeight: 900, color: "#526177" },
  connectionRangeCard: { padding: "12px 13px", border: "1px solid #d6e0ea", borderRadius: 14, background: "#fbfcfe" },
  connectionSelect: { width: "100%", height: 48, border: "1px solid #b9c8dc", borderRadius: 11, background: "#fff", padding: "0 12px", color: "#25354c", fontSize: 13.5, fontWeight: 800, outline: "none" },
  connectionResultCount: { minHeight: 112, display: "grid", alignContent: "center", justifyItems: "center", gap: 6, padding: "12px 9px", border: "1px solid #bfd1e2", borderRadius: 14, background: "linear-gradient(135deg,#eaf3fa,#f8fbfd)", color: "#244f75", textAlign: "center" },
  resultCountLabel: { display: "block", fontSize: 10.8, lineHeight: 1.3, fontWeight: 900, color: "#58728b" },
  resultCountValue: { display: "block", fontSize: 22, lineHeight: 1.05, fontWeight: 950, color: "#1e4f79" },
  resultCountMeta: { display: "block", fontSize: 10.8, lineHeight: 1.4, color: "#60788e" },
  connectionStats: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 9 },
  connectionStatCard: { minWidth: 0, minHeight: 70, display: "grid", alignContent: "center", justifyItems: "center", gap: 5, padding: "10px 9px", border: "1px solid #dfe5ee", borderRadius: 12, background: "#f8fafc", textAlign: "center" },
  connectionStatExact: { background: "#edf5fb", borderColor: "#c8dce9" },
  connectionStatDistinct: { background: "#f3f5f8", borderColor: "#d9dfe7" },
  connectionStatOfficial: { background: "#eef8f3", borderColor: "#c9e1d5" },
  connectionStatIntegrated: { background: "#fff6e8", borderColor: "#ead2aa" },
  connectionStatLabel: { display: "block", fontSize: 10.5, lineHeight: 1.35, fontWeight: 850, color: "#748196", wordBreak: "keep-all" },
  connectionStatValue: { display: "block", fontSize: 15.5, lineHeight: 1.15, fontWeight: 950, color: "#2f435e" },
  connectionNotice: { minWidth: 0, display: "flex", alignItems: "center", gap: 9, padding: "10px 13px", border: "1px solid #ead39b", borderRadius: 11, background: "#fff8e7", color: "#66501d", fontSize: 11.8, lineHeight: 1.45, whiteSpace: "normal", overflowWrap: "anywhere" },
  sameCutNotice: { flex: "0 0 auto", marginLeft: "auto", padding: "3px 8px", borderRadius: 999, background: "#f4e4b9", color: "#73571d", fontStyle: "normal", fontSize: 10.5, fontWeight: 900 },
  connectionEmpty: { padding: 21, border: "1px dashed #cfd9e6", borderRadius: 11, background: "#fafbfc", color: "#7f8998", fontSize: 12.5, textAlign: "center" },
  connectionDisplayBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", border: "1px solid #dce3ed", borderRadius: 11, background: "#fafbfe", color: "#657186", fontSize: 11.5, lineHeight: 1.5, flexWrap: "wrap" },
  connectionSummaryGuide: { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 12, padding: "12px 14px", border: "1px solid #cdd9e7", borderRadius: 12, background: "linear-gradient(135deg,#f4f8fc,#fff)", color: "#536278" },
  connectionSummaryCopy: { minWidth: 0, display: "grid", gap: 3, fontSize: 11.5, lineHeight: 1.55 },
  connectionSummaryChips: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, flexWrap: "wrap" },
  connectionSummaryChip: { display: "inline-grid", gridTemplateColumns: "auto auto", alignItems: "center", gap: 5, minHeight: 30, padding: "0 9px", border: "1px solid #d5deea", borderRadius: 999, background: "#fff", color: "#4d5f76", fontSize: 10.5, fontWeight: 900, whiteSpace: "nowrap" },
  connectionDisplayToggle: { display: "inline-grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 4, borderRadius: 10, background: "#e9edf4" },
  connectionDisplayButton: { minHeight: 31, padding: "0 10px", border: "1px solid transparent", borderRadius: 7, background: "transparent", color: "#68758a", fontSize: 11, fontWeight: 900, cursor: "pointer" },
  connectionDisplayActive: { background: "#315f88", color: "#fff", borderColor: "#315f88", boxShadow: "0 4px 10px rgba(49,95,136,.18)" },
  connectionCandidateSearch: { minHeight: 46, display: "flex", alignItems: "center", gap: 9, padding: "0 12px", border: "1px solid #cbd7e6", borderRadius: 11, background: "#fff", color: "#52657e", boxShadow: "0 3px 10px rgba(48,65,88,.04)" },
  connectionGrid: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 },
  connectionCard: { minWidth: 0, display: "grid", alignContent: "start", gap: 9, padding: 14, border: "1px solid #d5e0ed", borderRadius: 14, background: "#fff", color: "#303e54", textAlign: "left", boxShadow: "0 4px 12px rgba(48,60,80,.045)", cursor: "pointer", transition: "border-color .15s,box-shadow .15s,transform .15s" },
  connectionCardSelected: { borderColor: "#315f88", boxShadow: "0 0 0 2px rgba(49,95,136,.14),0 8px 18px rgba(43,79,112,.12)", transform: "translateY(-1px)" },
  connectionCardHead: { minWidth: 0, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 7, fontSize: 11 },
  connectionUniversityWrap: { minWidth: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  connectionEntityLabel: { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 20, padding: "0 6px", borderRadius: 6, background: "#e8eef7", color: "#536785", fontSize: 10.5, fontWeight: 950 },
  connectionUniversityName: { minWidth: 0, fontSize: 16, lineHeight: 1.3, color: "#173a68", fontWeight: 950, overflowWrap: "anywhere" },
  connectionDepartmentWrap: { display: "grid", gap: 4, padding: "9px 10px", border: "1px solid #d7e2ed", borderRadius: 9, background: "linear-gradient(135deg,#f4f8fc,#fff)" },
  connectionFavoriteBtn: { flex: "0 0 auto", width: 29, height: 29, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid #d4dce7", borderRadius: 8, background: "#fff", color: "#8b95a3", cursor: "pointer" },
  connectionDepartment: { minHeight: 0, fontSize: 16, lineHeight: 1.45, color: "#244f75", fontWeight: 900, wordBreak: "keep-all", overflowWrap: "anywhere" },
  connectionMeta: { minHeight: 21, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", color: "#6f7c90", fontSize: 11 },
  integratedBadge: { padding: "3px 6px", borderRadius: 999, background: "#fff3d9", color: "#86601c", fontWeight: 900 },
  officialBadge: { padding: "3px 6px", borderRadius: 999, background: "#e9f5ef", color: "#2e7358", fontWeight: 900 },
  connectionDataCompare: { minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 8 },
  connectionNaviBlock: { minWidth: 0, display: "grid", alignContent: "start", gap: 8, padding: 10, border: "1px solid #cbdbea", borderRadius: 11, background: "linear-gradient(135deg,#f2f7fb,#fff)", color: "#35536f" },
  connectionSchoolBlock: { minWidth: 0, display: "grid", alignContent: "start", gap: 8, padding: 10, border: "1px solid #e6c2c8", borderRadius: 11, background: "linear-gradient(135deg,#fff3f5,#fffafb)", color: "#713f49" },
  connectionDataHeading: { minWidth: 0, display: "grid", gap: 3 },
  connectionNaviBadge: { width: "fit-content", display: "inline-flex", alignItems: "center", minHeight: 21, padding: "0 7px", borderRadius: 7, background: "#dfeaf4", color: "#315f88", fontSize: 9.5, fontWeight: 950 },
  connectionSchoolBadge: { width: "fit-content", display: "inline-flex", alignItems: "center", minHeight: 21, padding: "0 7px", borderRadius: 7, background: "#f3dce1", color: "#8a4050", fontSize: 9.5, fontWeight: 950 },
  connectionNaviMetrics: { minWidth: 0, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 5 },
  connectionSchoolMetrics: { minWidth: 0, display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 5 },
  connectionCutBasisMetric: { borderColor: "#e2bd78", background: "#fff2d8" },
  connectionSchoolBlockFoot: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7, flexWrap: "wrap", color: "#86656c", fontSize: 9.5 },
  connectionSchoolLink: { minHeight: 35, padding: "0 9px", border: "1px solid #dfb7bf", borderRadius: 8, background: "#fff", color: "#8a4050", fontSize: 10.5, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" },
  connectionSource: { display: "grid", gap: 2, padding: "7px 8px", borderRadius: 8, background: "rgba(255,255,255,.72)", color: "#6e6680", fontSize: 10.2, lineHeight: 1.45 },
  connectionCardFoot: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 8, borderTop: "1px dashed #dce3ec", fontSize: 11.5, flexWrap: "wrap" },
  connectionFooterNav: { display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", alignItems: "center", gap: 10, paddingTop: 11, borderTop: "1px solid #e1e6ee" },
  connectionBackButton: { minHeight: 40, padding: "0 13px", border: "1px solid #cbd6e5", borderRadius: 10, background: "#fff", color: "#465873", fontSize: 12.5, fontWeight: 900, cursor: "pointer" },
  connectionSelectionStatus: { minWidth: 0, display: "grid", justifyItems: "center", gap: 3, color: "#707c8f", fontSize: 11.5, textAlign: "center" },
  connectionNextButton: { minHeight: 42, padding: "0 15px", border: 0, borderRadius: 10, background: "#315f88", color: "#fff", fontSize: 12.5, fontWeight: 950, cursor: "pointer", boxShadow: "0 5px 12px rgba(49,95,136,.18)" },
  focusFallbackNotice: { display: "flex", alignItems: "flex-start", gap: 7, padding: "9px 11px", border: "1px solid #edd2a8", borderRadius: 10, background: "#fff8ea", color: "#7a5b25", fontSize: 9.8, lineHeight: 1.5 },
  resultList: { display: "grid", gap: 10 },
  resultCard: { display: "grid", gap: 0, border: "1px solid #d6e0ec", borderRadius: 15, background: "#fff", overflow: "hidden", boxShadow: "0 5px 15px rgba(52,62,78,.04)" },
  resultSummary: { minWidth: 0, display: "grid", gridTemplateColumns: "minmax(300px,1fr) auto auto", alignItems: "center", gap: 14, padding: "17px 18px", background: "linear-gradient(135deg,#fff,#f8fafe)" },
  resultSummaryIdentity: { minWidth: 0, display: "grid", gap: 5 },
  resultEntityLabel: { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 22, padding: "0 7px", borderRadius: 7, background: "#e7edf6", color: "#48617f", fontSize: 10.5, fontWeight: 950, whiteSpace: "nowrap" },
  resultDepartmentLine: { minWidth: 0, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" },
  resultQuickStats: { display: "grid", gridTemplateColumns: "repeat(3,74px)", gap: 5 },
  resultActions: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 7, flexWrap: "wrap" },
  resultToggle: { minHeight: 38, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "0 12px", border: "1px solid #cbd6e4", borderRadius: 10, background: "#fff", color: "#354b68", fontSize: 12.5, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" },
  resultConnectButton: { minHeight: 38, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "0 11px", border: "1px solid #d7cbea", borderRadius: 10, background: "#f7f2fc", color: "#5b4385", fontSize: 12, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" },
  schoolTrendPanel: { display: "grid", gridTemplateColumns: "minmax(180px,.72fr) minmax(245px,.92fr) minmax(300px,1.55fr) auto", alignItems: "center", gap: 12, padding: "13px 15px", borderTop: "1px solid #e5c4ca", borderBottom: "1px solid #e5c4ca", background: "linear-gradient(135deg,#fff3f5,#fffafb)", color: "#6e4650" },
  schoolTrendCompact: { paddingTop: 11, paddingBottom: 11 },
  schoolTrendExpanded: { marginTop: 14, borderTop: "1px solid #dfb6be", boxShadow: "inset 0 5px 0 rgba(181,86,105,.08)" },
  schoolTrendHeading: { minWidth: 0, display: "grid", gap: 5 },
  schoolTrendSeparation: { display: "grid", gap: 1, fontSize: 10, lineHeight: 1.4, color: "#87676e" },
  schoolSourceBadge: { width: "fit-content", display: "inline-flex", alignItems: "center", minHeight: 21, padding: "0 7px", borderRadius: 7, background: "#f3dce1", color: "#8a4050", fontSize: 9.5, fontWeight: 950 },
  schoolTrendMetrics: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 5 },
  schoolTrendTypes: { minWidth: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", alignItems: "stretch", gap: 7 },
  schoolTrendTypeMetrics: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 4 },
  schoolTrendMore: { gridColumn: "1/-1", padding: "4px 2px", fontSize: 9.5, color: "#8b6f75" },
  schoolTrendAction: { minWidth: 150, display: "grid", justifyItems: "end", gap: 5, color: "#86656c", fontSize: 10, lineHeight: 1.45 },
  schoolTrendOpenButton: { minHeight: 38, padding: "0 11px", border: "1px solid #dfb7bf", borderRadius: 9, background: "#fff", color: "#8a4050", fontSize: 10.5, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" },
  resultCardBody: { minWidth: 0, display: "grid", gridTemplateColumns: "minmax(245px,285px) minmax(0,1fr)", gap: 16, padding: "18px", borderTop: "1px solid #e1e7ef", background: "#fff" },
  resultIdentity: { minWidth: 0, display: "grid", alignContent: "start", gap: 10, padding: 14, borderRadius: 12, background: "linear-gradient(180deg,#f5f8fc,#fafbfd)", border: "1px solid #e3e8f0", overflow: "visible", wordBreak: "keep-all", overflowWrap: "anywhere" },
  identityLabel: { fontSize: 10.5, color: "#5c6d84", fontWeight: 950 },
  identitySourceNote: { display: "block", minWidth: 0, fontSize: 10.5, lineHeight: 1.55, color: "#768398", wordBreak: "keep-all", overflowWrap: "anywhere" },
  detailTabGuide: { display: "grid", gap: 3, padding: "9px", borderRadius: 8, border: "1px solid #e0e5ed", background: "#fff", color: "#6c788a", fontSize: 9.3, lineHeight: 1.4 },
  sameUnitNote: { minWidth: 0, padding: "9px", borderRadius: 8, background: "#eef3f8", color: "#667488", fontSize: 12.5, lineHeight: 1.55, wordBreak: "keep-all", overflowWrap: "anywhere" },
  universityLine: { minWidth: 0, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" },
  universityName: { margin: 0, fontFamily: "Pretendard, 'Noto Sans KR', system-ui, sans-serif", fontSize: 17.5, lineHeight: 1.3, fontWeight: 850, letterSpacing: "-.015em", color: "#18304f" },
  fieldBadge: { display: "inline-flex", padding: "3px 7px", borderRadius: 999, background: "#e8edf5", color: "#506078", fontSize: 9.3, fontWeight: 900 },
  naviInlineBadge: { display: "inline-flex", alignItems: "center", minHeight: 21, padding: "0 7px", borderRadius: 7, background: "#eee9f8", color: "#66518e", fontSize: 9.2, fontWeight: 950 },
  favoriteBtn: { flex: "0 0 auto", width: 34, height: 34, borderRadius: 9, border: "1px solid #d2dbe8", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#7b8799", background: "#fff", cursor: "pointer" },
  favoriteBtnActive: { color: "#a96f08", background: "#fff7d8", borderColor: "#dec06a" },
  favoriteBtnDisabled: { opacity: .42, cursor: "not-allowed" },
  unitTitle: { minWidth: 0, fontFamily: "Pretendard, 'Noto Sans KR', system-ui, sans-serif", fontSize: 14.5, lineHeight: 1.5, fontWeight: 850, color: "#2b3d55", wordBreak: "keep-all", overflowWrap: "anywhere" },
  location: { fontSize: 11.3, color: "#6f7d91" },
  previousUnit: { minWidth: 0, display: "grid", gap: 7, padding: "12px", border: "1px solid #dce4ef", borderRadius: 10, background: "#fff", fontSize: 11.5, lineHeight: 1.55, color: "#657286", wordBreak: "keep-all", overflowWrap: "anywhere" },
  resultDetailArea: { minWidth: 0, display: "grid", alignContent: "start", gap: 10 },
  detailTabs: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 5, padding: 5, border: "1px solid #dce3ed", borderRadius: 11, background: "#edf1f6" },
  detailTabButton: { minHeight: 38, border: "1px solid transparent", borderRadius: 9, background: "transparent", color: "#5f6d82", fontSize: 11, fontWeight: 900, cursor: "pointer" },
  detailTabActive: { background: "#fff", borderColor: "#d4dce8", color: "#56417f", boxShadow: "0 3px 8px rgba(70,55,105,.12)" },
  admissionColumns: { minWidth: 0, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 },
  admissionColumnsSingle: { gridTemplateColumns: "minmax(0,1fr)" },
  resultSection: { minWidth: 0, display: "grid", alignContent: "start", gap: 7 },
  resultSectionTitle: { minHeight: 26, display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 850, color: "#697487" },
  sectionTypeBadge: { display: "inline-flex", alignItems: "center", padding: "4px 7px", borderRadius: 7, fontSize: 10.5, fontWeight: 900 },
  sectionTeaching: { color: "#315f9a", background: "#eaf2ff" },
  sectionHolistic: { color: "#76518f", background: "#f3eafb" },
  sectionRegular: { color: "#27715b", background: "#e9f7f1" },
  sectionMinimum: { color: "#9a6419", background: "#fff3d8" },
  admissionItems: { display: "grid", gap: 9 },
  admissionItemsDense: { gridTemplateColumns: "repeat(auto-fit,minmax(215px,1fr))", alignItems: "stretch" },
  admissionItem: { minWidth: 0, display: "grid", alignContent: "start", gap: 8, padding: "12px", borderRadius: 11, border: "1px solid #dce3ed", background: "#fbfcfd", fontSize: 12.5, lineHeight: 1.5 },
  admissionItemHead: { minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 },
  admissionName: { minWidth: 0, color: "#26384f", fontSize: 13.5, fontWeight: 900, lineHeight: 1.45, wordBreak: "keep-all", overflowWrap: "anywhere" },
  officialCutLabel: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7, paddingTop: 2, color: "#728096", fontSize: 9.5, fontWeight: 900 },
  officialCutBasisTag: { flex: "0 0 auto", display: "inline-flex", alignItems: "center", minHeight: 20, padding: "0 6px", borderRadius: 999, background: "#ebe5f6", color: "#5b4387", fontSize: 9, fontWeight: 950 },
  supportBadge: { flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 38, padding: "3px 7px", border: "1px solid", borderRadius: 999, fontSize: 9.5, fontWeight: 900 },
  cutoffGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 },
  cutoffBox: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7, minHeight: 39, padding: "7px 9px", border: "1px solid #e0e5ed", borderRadius: 9, background: "rgba(255,255,255,.78)", color: "#677387", fontFamily: "Pretendard, 'Noto Sans KR', 'Apple SD Gothic Neo', system-ui, sans-serif" },
  cutoffBoxActive: { borderColor: "#66558e", background: "linear-gradient(135deg,#f3effb,#fff)", color: "#5b4787", boxShadow: "0 0 0 2px rgba(102,85,142,.12),0 4px 10px rgba(86,69,126,.10)" },
  cutoffBoxLabel: { fontSize: 11.5, lineHeight: 1.2, fontWeight: 900, letterSpacing: "-.01em" },
  cutoffBoxValue: { fontSize: 15, lineHeight: 1.1, fontWeight: 950, letterSpacing: "-.02em" },
  studentDifference: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, fontSize: 9.5, fontWeight: 750 },
  caseNone: { color: "#9aa2af", fontSize: 9 },
  caseDisclosure: { marginTop: 2, padding: "8px", border: "1px solid #ded5ec", borderRadius: 10, background: "#faf7fe", display: "grid", gap: 7 },
  caseToggleBtn: { minHeight: 54, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", alignItems: "center", gap: 9, padding: "7px 9px", border: "1px solid #d6deea", borderRadius: 10, background: "linear-gradient(135deg,#fff,#f8f9fc)", color: "#526078", cursor: "pointer", textAlign: "left" },
  caseToggleIdentity: { minWidth: 0, display: "grid", gap: 2 },
  caseToggleCount: { minWidth: 56, display: "grid", justifyItems: "center", gap: 0, padding: "4px 7px", borderRadius: 8, background: "#eee9f8", color: "#614d88" },
  caseToggleAction: { whiteSpace: "nowrap", fontSize: 8.8, fontWeight: 850, color: "#697589" },
  caseCutGrid: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 5 },
  caseScopeNote: { display: "grid", gap: 2, color: "#7d8797", fontSize: 8.7, lineHeight: 1.4, textAlign: "center" },
  caseCutCard: { display: "grid", gap: 2, padding: "7px 5px", borderRadius: 8, border: "1px solid", textAlign: "center" },
  caseCutSelected: { boxShadow: "0 0 0 2px rgba(91,67,136,.17),0 4px 10px rgba(91,67,136,.10)", transform: "translateY(-1px)" },
  caseCutLabel: { fontFamily: "Pretendard, 'Noto Sans KR', 'Apple SD Gothic Neo', system-ui, sans-serif", fontSize: 10.5, fontWeight: 900, letterSpacing: "-.01em" },
  caseCutValue: { fontFamily: "Pretendard, 'Noto Sans KR', 'Apple SD Gothic Neo', system-ui, sans-serif", fontSize: 14, lineHeight: 1.1, fontWeight: 950, letterSpacing: "-.02em" },
  case30: { color: "#39638d", background: "#eef5fd", borderColor: "#cbdced" },
  case50: { color: "#64518e", background: "#f4effb", borderColor: "#d9cdea" },
  case70: { color: "#8b5f22", background: "#fff6e6", borderColor: "#ead3aa" },
  relatedDetails: { marginTop: 8, borderTop: "1px solid #e0e5ed", paddingTop: 8 },
  relatedSummary: { cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10, fontWeight: 850, color: "#526078" },
  relatedBody: { marginTop: 7, display: "grid", gap: 8, fontSize: 9.5 },
  teachingItem: { borderColor: "#d3dff0", background: "#f5f8ff" },
  holisticItem: { borderColor: "#e1d8ea", background: "#fbf7fe" },
  regularItem: { borderColor: "#cee2da", background: "#f3faf7" },
  regularHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 7 },
  regularPercentile: { flex: "0 0 auto", padding: "4px 7px", borderRadius: 8, background: "#dff1e9", color: "#276e57", fontSize: 9.5, fontWeight: 800 },
  regularMeta: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, color: "#647386" },
  regularSubjects: { margin: 0, paddingTop: 5, borderTop: "1px dashed #d7e4df", color: "#4f625c", fontSize: 9.5, lineHeight: 1.45, wordBreak: "keep-all" },
  none: { padding: "11px 8px", borderRadius: 9, background: "#f5f6f8", color: "#9aa1ad", fontSize: 10.5, lineHeight: 1.4, textAlign: "center" },
  minimumList: { display: "grid", gap: 7 },
  minimumItem: { display: "grid", gap: 5, padding: "10px", borderRadius: 10, border: "1px solid #ead6a5", background: "#fffaf0", fontSize: 10.5 },
  minimumHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7 },
  minimumCriteria: { padding: "6px 7px", borderRadius: 7, background: "#fff2cc", color: "#7a5718", lineHeight: 1.48, wordBreak: "keep-all", overflowWrap: "anywhere" },
  minimumNote: { color: "#786e5e", lineHeight: 1.5, wordBreak: "keep-all", overflowWrap: "anywhere" },
  noResult: { padding: 42, borderRadius: 15, border: "1px dashed #d5dae2", background: "#fafbfc", textAlign: "center", color: "#838b99" },
  pagination: { display: "flex", justifyContent: "center", alignItems: "center", gap: 7, padding: "14px 8px 5px", flexWrap: "wrap" },
  pageNavBtn: { minHeight: 34, display: "inline-flex", alignItems: "center", gap: 3, padding: "0 11px", border: "1px solid #d4dce8", borderRadius: 9, background: "#fff", color: "#536075", fontSize: 10.5, fontWeight: 850, cursor: "pointer" },
  pageIconBtn: { width: 34, height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid #d4dce8", borderRadius: 9, background: "#fff", color: "#697588", cursor: "pointer" },
  pageNumbers: { display: "flex", gap: 4 },
  pageNumberBtn: { width: 32, height: 32, border: "1px solid #d9e0ea", borderRadius: 8, background: "#fff", color: "#637084", fontSize: 10.5, fontWeight: 800, cursor: "pointer" },
  pageNumberActive: { color: "#fff", background: "#65548f", borderColor: "#65548f", boxShadow: "0 4px 10px rgba(77,62,116,.18)" },
  pageStatus: { minWidth: 60, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "0 8px", height: 32, borderRadius: 8, background: "#f1f3f7", color: "#707b8d", fontSize: 10.5 },
  adminWrap: { display: "grid", gap: 16, padding: 18, border: "1px solid #d9dfeb", borderRadius: 18, background: "linear-gradient(180deg,#fff,#fcfcfe)", boxShadow: "0 8px 24px rgba(52,62,78,.05)" },
  adminHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  adminHeadingText: { display: "grid", gap: 1, minWidth: 0 },
  adminTitle: { display: "inline", margin: "0 0 0 8px", fontSize: 20, lineHeight: 1.2, letterSpacing: "-.025em", color: "#283247" },
  muted: { margin: "7px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "#737d8e", fontWeight: 650 },
  compareGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  summaryCard: { padding: 16, borderRadius: 15, border: "1px solid", display: "grid", gap: 12, minWidth: 0 },
  summarySchool: { background: "#f3faf6", borderColor: "#c9dfd1" },
  summaryDraft: { background: "#f5f8ff", borderColor: "#ccd8ec" },
  summaryTop: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" },
  summaryHeading: { display: "grid", gap: 3, minWidth: 0 },
  summaryEyebrow: { fontSize: 9.5, color: "#778398", fontWeight: 850 },
  summaryTitle: { fontSize: 15.5, lineHeight: 1.25, color: "#29374c", letterSpacing: "-.015em" },
  summaryDescription: { fontSize: 12, lineHeight: 1.5, color: "#738094" },
  statePill: { padding: "4px 8px", borderRadius: 999, fontSize: 9.5, fontWeight: 900 },
  stateSchool: { color: "#287348", background: "#e1f3e8" },
  stateDraft: { color: "#315a9b", background: "#e7efff" },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 7 },
  miniStat: { display: "grid", gap: 3, padding: "10px 8px", borderRadius: 10, background: "rgba(255,255,255,.82)", textAlign: "center", border: "1px solid rgba(210,219,233,.62)" },
  miniStatLabel: { fontSize: 9.5, color: "#718095", fontWeight: 800 },
  miniStatValue: { fontSize: 19, lineHeight: 1.1, color: "#243d64", fontWeight: 900 },
  sourceMeta: { display: "grid", gap: 4, paddingTop: 2, fontSize: 12, lineHeight: 1.5, color: "#6f7888", minWidth: 0 },
  summaryEmpty: { padding: 22, textAlign: "center", color: "#9299a6", fontSize: 11 },
  uploadPanel: { display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 9, alignItems: "center", padding: 12, borderRadius: 13, border: "1px solid #e2e6ee", background: "#f7f8fb" },
  fileName: { minWidth: 0, display: "grid", gap: 2, fontSize: 11, color: "#737c8c", overflow: "hidden" },
  statusLine: { display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", borderRadius: 9, background: "#f1f3f7", color: "#667085", fontSize: 10.5 },
  notice: { display: "flex", gap: 7, padding: 10, borderRadius: 10, background: "#fff8e7", color: "#725d26", fontSize: 10.5, lineHeight: 1.5 },
  primaryBtn: { minHeight: 38, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 13px", border: 0, borderRadius: 10, color: "#fff", background: "#66558e", fontWeight: 850, cursor: "pointer" },
  secondaryBtn: { minHeight: 38, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 12px", border: "1px solid #cbd5e3", borderRadius: 10, color: "#455166", background: "#fff", fontWeight: 800, cursor: "pointer" },
  dangerGhost: { minHeight: 34, display: "inline-flex", alignItems: "center", gap: 5, padding: "0 10px", border: "1px solid #ebc7c2", borderRadius: 9, color: "#ae4c42", background: "#fff8f7", fontWeight: 800, cursor: "pointer" },
};

const betaCss = `
.susi-beta-tab-panel{font-size:13px}
.susi-beta-filter-grid input{min-width:0;flex:1;border:0;outline:0;background:transparent;font:inherit;font-size:13px;font-weight:650;color:#263244}
.susi-beta-filter-grid select{width:100%;height:42px;border:1px solid #cdd7e6;border-radius:10px;background:#fff;padding:0 10px;font:inherit;font-size:12px;font-weight:800;color:#2f3e53;outline:0}
.susi-beta-filter-grid label>span{padding-left:2px;font-size:11px!important}
.susi-beta-detail-search input,.susi-beta-connection-panel input{min-width:0;flex:1;border:0;outline:0;background:transparent;font:inherit;font-size:13px;font-weight:700;color:#26364d}
.susi-beta-detail-search input::placeholder,.susi-beta-connection-panel input::placeholder{color:#929cab;font-weight:600}
.susi-beta-detail-search label>button,.susi-beta-connection-panel label>button{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:0;border-radius:8px;background:#eef2f7;color:#65738a;cursor:pointer}
.susi-beta-detail-search label>strong,.susi-beta-connection-panel label>strong{flex:0 0 auto;padding:4px 8px;border-radius:999px;background:#edf2f8;color:#3e5676;font-size:10.5px;font-weight:950;white-space:nowrap}
.susi-beta-detail-search select{width:100%;height:48px;border:1px solid #c8d5e5;border-radius:11px;background:#fff;padding:0 12px;font:inherit;font-size:12.5px;font-weight:800;color:#26364d;outline:none}
.susi-beta-detail-search select:focus,.susi-beta-connection-panel select:focus{border-color:#735f9b;box-shadow:0 0 0 3px rgba(102,81,143,.12)}
.susi-beta-detail-search>div>b{font-size:16px;line-height:1.25}.susi-beta-detail-search>div>span{font-size:11.5px;line-height:1.5;color:#6d798b;word-break:keep-all}
.susi-beta-connection-panel [role="tab"]>span{grid-row:1/3;align-self:start;display:inline-flex;align-items:center;justify-content:center;min-width:48px;min-height:26px;padding:0 8px;border-radius:999px;background:#edf1f6;color:#637086;font-size:10px;font-weight:950}
.susi-beta-connection-panel [role="tab"]>b{font-size:13.5px;line-height:1.3;color:inherit}.susi-beta-connection-panel [role="tab"]>small{font-size:10.5px!important;line-height:1.45;color:#748095}
.susi-beta-connection-panel [role="tab"][aria-selected="true"]>span{background:#315f88;color:#fff}.susi-beta-connection-panel [role="tab"][aria-selected="true"]>small{color:#48657e}
.susi-beta-result-card b,.susi-beta-result-card strong{letter-spacing:-.015em}
.susi-beta-result-card em{font-style:normal;color:#7a8495}
.susi-beta-result-card details summary::-webkit-details-marker{display:none}
.susi-beta-result-card details section{display:grid;gap:4px;padding:7px;border-radius:8px;background:#fff}
.susi-beta-result-card details section>b{font-size:9.5px;color:#55647a}
.susi-beta-result-card details p{margin:0;display:grid;gap:1px;line-height:1.35;color:#6b7688}
.susi-beta-result-card details p strong{font-size:9px;color:#3f4d62}
.susi-beta-result-card details p span{word-break:keep-all}
.susi-beta-converter-grid button small{font-size:9px}
.susi-beta-student-auto span{font-size:9.5px;color:#728097;font-weight:800}
.susi-beta-student-auto b{font-size:13px;line-height:1.25;color:#2b3f60}
.susi-beta-student-auto small{font-size:9px;color:#6a7c96;font-weight:800}
.susi-beta-student-auto p{margin:0;font-size:10.5px;line-height:1.5;color:#6d7889}
.susi-beta-compare-grid article header>div{display:grid;gap:3px;min-width:0}
.susi-beta-compare-grid article header>div>b{font-size:15px;line-height:1.25;color:#28354a}
.susi-beta-compare-grid article header>div>span{font-size:10.5px;line-height:1.45;color:#738094}
.susi-beta-compare-grid article dl span,.susi-beta-compare-grid article dl dt{font-size:10px;color:#718095;font-weight:750}
.susi-beta-compare-grid article dl b,.susi-beta-compare-grid article dl dd{margin:0;font-size:19px;line-height:1.1;color:#243d64;font-weight:900}
.susi-beta-compare-grid article footer b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#455166}
.susi-beta-compare-grid article footer span{line-height:1.45}
.susi-beta-upload-panel button:disabled{opacity:.48;cursor:not-allowed}
.susi-beta-support-filter em{font-style:normal;color:#6a4d99;font-weight:950}
.susi-beta-support-filter small{font-size:9.5px;line-height:1.45;color:#7b8595}
.susi-beta-support-filter button[aria-pressed="true"] small{color:rgba(255,255,255,.84)}
.susi-beta-support-filter button[aria-pressed="false"] small{color:#8b94a3}
.susi-beta-support-filter button b{font-size:11px;line-height:1.1}
.susi-beta-connection-panel button{font:inherit}
.susi-beta-connection-panel button:hover{border-color:#b9c5d7;box-shadow:0 5px 13px rgba(52,62,78,.08)}
.susi-beta-connection-panel button[aria-pressed="true"]{box-shadow:0 3px 9px rgba(86,69,126,.18)}
.susi-beta-connection-panel button small,.susi-beta-connection-panel label span{font-size:9px}
.susi-beta-connection-panel button>div:first-child>span{padding:2px 6px;border-radius:999px;background:#edf1f6;color:#627084;font-size:8.5px;font-weight:850}
.susi-beta-connection-panel button>div:nth-child(3)>span{padding:2px 6px;border-radius:999px;background:#f1f3f7}
.susi-beta-connection-panel button>div:nth-child(4)>span{display:grid;gap:1px;padding:5px 4px;border-radius:7px;background:#f7f8fa;text-align:center}
.susi-beta-connection-panel button>div:nth-child(4) small{font-size:7.8px;color:#8791a0}
.susi-beta-connection-panel button>div:nth-child(4) b{font-size:10px;color:#39495f}
.susi-beta-connection-panel button>div:last-child span{display:inline-flex;padding:3px 6px;border:1px solid #d9e0e9;border-radius:999px;font-weight:850}
.susi-beta-connection-panel button>div:last-child em{font-style:normal;color:#6b5a92;font-weight:850;white-space:nowrap}
.susi-beta-result-card button span small{font-size:8px}
.susi-beta-result-card button span strong{font-size:15px;line-height:1}
.susi-beta-result-card button small{font-size:8.5px;color:inherit}
nav[aria-label="검색 결과 페이지 이동"] button:disabled{opacity:.38;cursor:not-allowed;box-shadow:none}
.susi-beta-view-toolbar [role="tab"]>span{grid-row:1/3;width:27px;height:27px;display:inline-flex;align-items:center;justify-content:center;border-radius:9px;background:#e9edf4;color:#657286;font-size:11px;font-weight:950}
.susi-beta-view-toolbar [role="tab"]>b{min-width:0;font-size:12.5px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.susi-beta-view-toolbar [role="tab"]>small{min-width:0;font-size:10px;line-height:1.25;color:#7e899a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.susi-beta-view-toolbar [role="tab"][aria-selected="true"]>span{background:#66558e;color:#fff}
.susi-beta-tab-panel strong{letter-spacing:-.01em}
.susi-beta-connection-panel button{font:inherit}
.susi-beta-connection-panel button:hover:not(:disabled){border-color:#aebcd0;box-shadow:0 4px 11px rgba(52,62,78,.08)}
.susi-beta-connection-panel button[aria-pressed="true"]{box-shadow:0 3px 9px rgba(86,69,126,.18)}
.susi-beta-connection-panel small{font-size:10.2px;line-height:1.4}
.susi-beta-connection-panel label>span{font-size:11px}
.susi-beta-connection-panel article>div:first-child>div{min-width:0;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.susi-beta-connection-panel article>div:first-child>div>b{font-size:14px;color:#1f3b63;overflow-wrap:anywhere}
.susi-beta-connection-panel article>div:first-child>div>span{padding:3px 7px;border-radius:999px;background:#edf1f6;color:#5b6c83;font-size:9.6px;font-weight:900}
.susi-beta-connection-panel article>div:nth-child(3)>span:not([style]){padding:3px 6px;border-radius:999px;background:#f1f3f7}
.susi-beta-connection-panel article>div:nth-child(4)>span,.susi-beta-connection-panel>div:nth-child(3)>span{min-width:0;display:grid;gap:2px;padding:6px;border:1px solid #e5e9ef;border-radius:8px;background:#f8f9fb;text-align:center}
.susi-beta-connection-panel article>div:nth-child(4) small,.susi-beta-connection-panel>div:nth-child(3) small{font-size:9.5px;color:#748195}
.susi-beta-connection-panel article>div:nth-child(4) b,.susi-beta-connection-panel>div:nth-child(3) b{font-size:12px;color:#2b405d;overflow-wrap:anywhere}
.susi-beta-connection-panel article>div:last-child>span{display:inline-flex;padding:3px 7px;border:1px solid #d9e0e9;border-radius:999px;font-weight:900;white-space:nowrap}
.susi-beta-connection-panel article>div:last-child>button{border:0;background:transparent;color:#285d87;font-size:10.5px;font-weight:950;cursor:pointer;white-space:nowrap;padding:4px}
.susi-beta-result-card [style*="repeat(3, 74px)"] span{display:grid;gap:2px;padding:6px 7px;border:1px solid #e1e6ee;border-radius:8px;background:#fff;text-align:center}
.susi-beta-result-card [style*="repeat(3, 74px)"] small{font-size:8px;color:#7c8798}
.susi-beta-result-card [style*="repeat(3, 74px)"] b{font-size:10.5px;color:#34475f}
.susi-beta-result-card button span small{font-size:8px}
.susi-beta-result-card button span strong{font-size:15px;line-height:1}
.susi-beta-result-card button small{font-size:8.5px;color:inherit}
.susi-beta-result-card p,.susi-beta-result-card span,.susi-beta-result-card b,.susi-beta-result-card strong{overflow-wrap:anywhere}
.susi-beta-school-trend>div{min-width:0}
.susi-beta-school-trend-heading>div{display:grid;gap:2px}.susi-beta-school-trend-heading>div>small{color:#62806e;font-weight:950}.susi-beta-school-trend-heading>div>b{font-size:12.5px;color:#294c3b}.susi-beta-school-trend-heading>span{font-size:10px;color:#6d8176}
.susi-beta-school-trend-metrics>span,.susi-beta-connection-trend>span,.susi-beta-connection-metrics>span{min-width:0;display:grid;gap:2px;padding:6px 7px;border:1px solid #dfe7e2;border-radius:8px;background:rgba(255,255,255,.82);text-align:center}.susi-beta-school-trend-metrics small,.susi-beta-connection-trend small,.susi-beta-connection-metrics small{font-size:9.5px;color:#718078}.susi-beta-school-trend-metrics b,.susi-beta-connection-trend b,.susi-beta-connection-metrics b{font-size:12px;color:#2b5542;overflow-wrap:anywhere}
.susi-beta-school-trend-types>span{min-width:105px;display:grid;gap:2px;padding:6px 8px;border:1px solid #dce8e0;border-radius:8px;background:#fff}.susi-beta-school-trend-types>span>b{font-size:10.5px;color:#315844}.susi-beta-school-trend-types>span>small{font-size:9.4px;color:#71857a}.susi-beta-school-trend-types>em{font-style:normal;font-size:8.8px;color:#8b9890}
.susi-beta-school-trend small{font-size:10px;line-height:1.4}
.susi-beta-school-trend b,.susi-beta-school-trend strong{overflow-wrap:anywhere}
.susi-beta-connection-panel article{transition:border-color .16s ease,box-shadow .16s ease,transform .16s ease}
.susi-beta-connection-panel article:hover{transform:translateY(-1px)}
.susi-beta-connection-panel article button{font:inherit}
/* Patch 40 source separation and spacing overrides */
.susi-beta-tab-panel [style*="display: grid"]>b+span{margin-top:0}
.susi-beta-result-card h3,.susi-beta-result-card b{font-family:Pretendard,"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif}
.susi-beta-school-trend-heading>div>small{font-size:9.5px!important;line-height:1.25}
.susi-beta-school-trend-heading>div>b{font-size:12px!important;line-height:1.4}.susi-beta-school-trend-heading>span{font-size:10px!important;line-height:1.5;word-break:keep-all}
.susi-beta-school-trend-types>span{min-width:0!important;display:grid!important;gap:6px!important;padding:8px 9px!important}
.susi-beta-school-trend-types>span>b{font-size:10.5px!important;line-height:1.35;color:#315844}
.susi-beta-school-trend-types>span>span{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}
.susi-beta-school-trend-types>span>span>small{min-width:0;display:grid;gap:2px;padding:4px;border-radius:6px;background:#fff5f6;text-align:center}
.susi-beta-school-trend-types>span>span>small>em{font-style:normal;font-size:8px;line-height:1.2;color:#7b8a82}
.susi-beta-school-trend-types>span>span>small>strong{font-size:9.5px;line-height:1.2;color:#315844}
.susi-beta-school-trend>div:last-child button:hover,.susi-beta-result-card button[style*="#8a4050"]:hover{border-color:#d49da8!important;background:#fff5f6!important;box-shadow:0 4px 10px rgba(138,64,80,.10)!important}
.susi-beta-connection-panel>div:nth-of-type(4)>span{display:grid!important;align-content:center!important;justify-items:center!important;gap:5px!important}
.susi-beta-connection-panel>div:nth-of-type(4)>span small,.susi-beta-connection-panel>div:nth-of-type(4)>span b{display:block!important;margin:0!important}
.susi-beta-connection-panel article small b{font-weight:950;color:#59677a}
.susi-beta-connection-panel article>div:nth-child(5) button{font-size:10.5px}
.susi-beta-detail-search input{letter-spacing:-.01em}
/* Patch 41 NAVI/광덕고 비교, 판정컷, 뒤로가기 가독성 */
.susi-beta-view-actions>span small{font-size:9.5px;line-height:1.2;font-weight:850;color:#81749a;white-space:nowrap}
.susi-beta-view-actions>span b{font-size:15px;line-height:1.15;font-weight:950;color:#5b4388;white-space:nowrap}
.susi-beta-connection-notice>svg{flex:0 0 auto}
.susi-beta-connection-notice>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.susi-beta-connection-compare section>div:first-child>b{font-size:11.5px;line-height:1.35;color:inherit;word-break:keep-all}
.susi-beta-connection-navi-metrics>span,.susi-beta-connection-school-metrics>span{min-width:0;display:grid;align-content:center;justify-items:center;gap:2px;padding:7px 5px;border:1px solid rgba(94,81,136,.14);border-radius:8px;background:rgba(255,255,255,.86);text-align:center}
.susi-beta-connection-school-metrics>span{border-color:rgba(138,64,80,.16)}
.susi-beta-connection-navi-metrics small,.susi-beta-connection-school-metrics small{font-size:9.5px!important;line-height:1.25;color:#7b8494}
.susi-beta-connection-navi-metrics b,.susi-beta-connection-school-metrics b{font-size:12.5px!important;line-height:1.2;font-weight:950;color:#3d4c63}
.susi-beta-connection-navi-metrics>span:first-child b{color:#8a5d17;font-size:14px!important}
.susi-beta-connection-compare section>small>b{font-size:9.5px!important;color:#49637d}.susi-beta-connection-compare section>small>span{font-size:9.8px;line-height:1.4}.susi-beta-connection-compare section>small>em{font-size:8.8px;line-height:1.4;font-style:normal;color:#847b90}
.susi-beta-school-trend-heading>span strong{font-size:10.5px;line-height:1.35;color:#456855}.susi-beta-school-trend-heading>span em{font-size:9.5px;line-height:1.35;font-style:normal;color:#788a80}
.susi-beta-result-card [style*="대학 공개 2026"]{font-family:Pretendard,"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif}
.susi-beta-result-card [style*="justify-content: space-between"]>span+ b{white-space:nowrap}
@media(max-width:1050px){
  .susi-beta-view-toolbar{grid-template-columns:minmax(0,1fr) auto!important}
  .susi-beta-view-toolbar>div{grid-column:1!important}
  .susi-beta-view-toolbar>.susi-beta-view-actions{grid-column:2!important}
  .susi-beta-school-trend{grid-template-columns:1fr 1fr!important}
  .susi-beta-school-trend-types,.susi-beta-school-trend>div:last-child{grid-column:1/-1!important}
  .susi-beta-school-trend>div:last-child{justify-items:start!important}
}
/* Patch 42: 광덕고 별도 사례를 정시 영역과 명확히 구분 */
.susi-beta-school-trend.is-expanded{margin-top:14px!important;border-top:1px solid #ddb3bc!important}
.susi-beta-school-trend-heading>div>small{color:#8a4050!important}
.susi-beta-school-trend-heading>div>b{color:#713f49!important}
.susi-beta-school-trend-heading>span strong{color:#7a4853!important}.susi-beta-school-trend-heading>span em{color:#92767c!important}
.susi-beta-school-trend-metrics>span,.susi-beta-school-trend-types>span{border-color:#e6cbd0!important;background:rgba(255,255,255,.92)!important}
.susi-beta-school-trend-metrics small,.susi-beta-school-trend-types>span>span>small>em{color:#927b81!important}
.susi-beta-school-trend-metrics b,.susi-beta-school-trend-types>span>b,.susi-beta-school-trend-types>span>span>small>strong{color:#713f49!important}
.susi-beta-connection-school-metrics>span{border-color:#e6cbd0!important;background:rgba(255,255,255,.92)!important}
.susi-beta-connection-school-metrics b{color:#713f49!important}
.susi-beta-print-sheet{display:none}
/* Patch 39 readability overrides */
.susi-beta-view-toolbar [role="tab"]>b{font-size:14px}.susi-beta-view-toolbar [role="tab"]>small{font-size:11.5px}
.susi-beta-detail-search input,.susi-beta-connection-panel input{font-size:14.5px;font-weight:800}
.susi-beta-detail-search label>strong,.susi-beta-connection-panel label>strong{font-size:11.5px}
.susi-beta-detail-search select{font-size:14px}
.susi-beta-detail-search>div>b{font-size:18px}.susi-beta-detail-search>div>span{font-size:12.5px}
.susi-beta-connection-panel [role="tab"]>span{font-size:11px}.susi-beta-connection-panel [role="tab"]>b{font-size:15px}.susi-beta-connection-panel [role="tab"]>small{font-size:12px!important}
.susi-beta-connection-panel small{font-size:11.5px;line-height:1.45}.susi-beta-connection-panel label>span{font-size:12.5px}
.susi-beta-connection-panel article>div:first-child>div>b{font-size:16px}.susi-beta-connection-panel article>div:first-child>div>span{font-size:10.8px}
.susi-beta-connection-panel article>div:nth-child(4) small,.susi-beta-connection-panel>div:nth-child(3) small{font-size:10.5px}
.susi-beta-connection-panel article>div:nth-child(4) b,.susi-beta-connection-panel>div:nth-child(3) b{font-size:13.5px}
.susi-beta-connection-panel article>div:last-child>button{font-size:12px}
.susi-beta-school-trend-metrics small,.susi-beta-connection-trend small,.susi-beta-connection-metrics small{font-size:10.5px}.susi-beta-school-trend-metrics b,.susi-beta-connection-trend b,.susi-beta-connection-metrics b{font-size:13.5px}
.susi-beta-result-card button{font-size:12.5px}.susi-beta-result-card small{line-height:1.45}
@media(max-width:1100px){
  .susi-beta-detail-search{grid-template-columns:1fr 1fr!important}.susi-beta-detail-search>div:first-child{grid-column:1/-1}
  .susi-beta-connection-panel>div:nth-of-type(3){grid-template-columns:1fr 1fr!important}.susi-beta-connection-panel>div:nth-of-type(3)>div:first-child{grid-column:1/-1}
}
@media(max-width:900px){
  .susi-beta-connection-panel [style*="connectionSummaryGuide"]{grid-template-columns:1fr!important}
  .susi-beta-connection-criteria{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .susi-beta-connection-criteria>div:first-child{grid-column:1/-1!important}
  .susi-beta-view-toolbar{position:static!important;display:grid!important;grid-template-columns:1fr!important}
  .susi-beta-view-toolbar>div{grid-column:1!important}.susi-beta-view-toolbar>.susi-beta-view-actions{grid-template-columns:1fr 1fr!important}.susi-beta-view-toolbar>.susi-beta-view-actions button{min-height:38px}
  .susi-beta-filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .susi-beta-detail-search{grid-template-columns:1fr!important}.susi-beta-detail-search>div:first-child{grid-column:auto}
  .susi-beta-support-filter{grid-template-columns:1fr!important}
  .susi-beta-support-filter>div:last-child{justify-items:start!important}
  .susi-beta-query{grid-column:1/-1}
  .susi-beta-result-card{grid-template-columns:1fr!important}
  .susi-beta-result-card>div:first-child{grid-template-columns:minmax(0,1fr) auto!important}
  .susi-beta-result-card>div:first-child>div:nth-child(2){display:none!important}
  .susi-beta-result-card>div:nth-child(2){grid-template-columns:1fr!important}
  .susi-beta-admission-columns{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .susi-beta-converter-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .susi-beta-connection-panel>div:nth-of-type(2){grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .susi-beta-connection-panel>div:last-child{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .susi-beta-connection-compare{grid-template-columns:1fr!important}
  .susi-beta-connection-notice{white-space:normal!important;align-items:flex-start!important}.susi-beta-connection-notice>span{white-space:normal!important;overflow:visible!important}.susi-beta-connection-notice>em{margin-left:0!important}
  .susi-beta-upload-panel{grid-template-columns:auto 1fr!important}
  .susi-beta-compare-grid{grid-template-columns:1fr!important}
  .susi-beta-student-auto{grid-template-columns:1fr 140px!important}
  .susi-beta-student-auto p{grid-column:1/-1}
}
@media(max-width:800px){
  .susi-beta-school-trend>div:last-child{justify-items:start!important}
}
@media(max-width:720px){
  .susi-beta-connection-criteria{grid-template-columns:1fr!important}
  .susi-beta-connection-criteria>div:first-child{grid-column:auto!important}
  .susi-beta-view-toolbar [role="tab"]{grid-template-columns:22px minmax(0,1fr)!important;padding:6px!important}
  .susi-beta-view-toolbar [role="tab"]>small{display:none}
  .susi-beta-tab-panel>div:first-child{grid-template-columns:1fr!important}
  .susi-beta-filter-grid{grid-template-columns:1fr!important}
  .susi-beta-query{grid-column:auto}
  .susi-beta-admission-columns,.susi-beta-converter-grid{grid-template-columns:1fr!important}
  .susi-beta-result-card>div:first-child{grid-template-columns:1fr!important}
  .susi-beta-result-card>div:first-child>div:last-child{justify-content:flex-end!important}
  .susi-beta-connection-panel>div:nth-of-type(2),.susi-beta-connection-panel>div:nth-of-type(3),.susi-beta-connection-panel>div:last-child{grid-template-columns:1fr!important}
  .susi-beta-upload-panel{grid-template-columns:1fr!important}
  .susi-beta-student-auto{grid-template-columns:1fr!important}
  .susi-beta-student-auto p{grid-column:auto}
  .susi-beta-school-trend{grid-template-columns:1fr!important}
  .susi-beta-school-trend>div:last-child{grid-column:auto!important}
  .susi-beta-view-toolbar>.susi-beta-view-actions{grid-template-columns:1fr!important}
  .susi-beta-connection-navi-metrics,.susi-beta-connection-school-metrics{grid-template-columns:1fr 1fr!important}
 }
@media print{
  @page{size:A4 landscape;margin:7mm}
  html,body{background:#fff!important}
  body *{visibility:hidden!important}
  .susi-beta-print-sheet,.susi-beta-print-sheet *{visibility:visible!important}
  .susi-beta-print-sheet{display:block!important;position:absolute!important;left:0!important;top:0!important;width:100%!important;color:#111!important;font-family:"Noto Sans KR",Arial,sans-serif!important}
  .susi-beta-print-sheet header{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;padding-bottom:5px;border-bottom:2px solid #27364c}
  .susi-beta-print-sheet h1{margin:0;font-size:15pt;line-height:1.1}
  .susi-beta-print-sheet header p{margin:2px 0 0;font-size:7.5pt;color:#596579}
  .susi-beta-print-sheet header>div:last-child{display:grid;gap:1px;text-align:right;font-size:7.5pt}
  .susi-beta-print-sheet .print-criteria{display:flex;gap:4px;flex-wrap:wrap;padding:5px 0}
  .susi-beta-print-sheet .print-criteria span{padding:3px 5px;border:1px solid #cbd3df;border-radius:4px;font-size:6.8pt;line-height:1.2}
  .susi-beta-print-sheet table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:6.4pt;line-height:1.25}
  .susi-beta-print-sheet th,.susi-beta-print-sheet td{border:1px solid #aeb8c6;padding:3px 4px;vertical-align:middle;word-break:keep-all;overflow-wrap:anywhere}
  .susi-beta-print-sheet th{background:#e9edf3;font-weight:900;text-align:center}
  .susi-beta-print-sheet th:nth-child(1){width:10%}.susi-beta-print-sheet th:nth-child(2){width:14%}.susi-beta-print-sheet th:nth-child(3){width:9%}.susi-beta-print-sheet th:nth-child(4),.susi-beta-print-sheet th:nth-child(5){width:17%}.susi-beta-print-sheet th:nth-child(6){width:13%}.susi-beta-print-sheet th:nth-child(7){width:20%}
  .susi-beta-print-sheet tr{break-inside:avoid;height:10.5mm}
  .susi-beta-print-sheet footer{margin-top:4px;font-size:6.3pt;color:#555f70}
}

/* Patch 43: 상세 카드 여백·기준 설정 안내·탭 가독성 */
.susi-beta-beta-notice{align-items:flex-start!important}
.susi-beta-beta-notice>div{min-width:0;display:grid;gap:4px;line-height:1.55}
.susi-beta-beta-notice>div>b{display:block;color:#73541d;font-size:12.5px;font-weight:950}
.susi-beta-beta-notice>div>span{display:block;color:#756543;font-size:11.5px;word-break:keep-all}
.susi-beta-beta-notice>div>strong{display:block;margin-top:2px;color:#8b5b1e;font-size:11px;line-height:1.5}
.susi-beta-criteria-guide>b{color:#314f7d!important;font-size:14.5px!important;font-weight:950!important}
.susi-beta-criteria-guide>span{color:#55657b!important;font-size:13.5px!important;line-height:1.65!important;word-break:keep-all}
.susi-beta-criteria-guide>span>strong{color:#315f99;font-weight:950}
.susi-beta-criteria-guide>span>em{color:#665187;font-style:normal;font-weight:850}
.susi-beta-result-identity>span:nth-child(2){font-size:11px!important;line-height:1.6!important;word-break:keep-all}
.susi-beta-result-identity>div:nth-child(3){white-space:nowrap!important;font-size:11.5px!important;line-height:1.3!important;padding:9px 8px!important;letter-spacing:-.025em}
.susi-beta-detail-tabs [role="tab"]{font-size:13px!important;font-weight:950!important;letter-spacing:-.015em}
.susi-beta-school-trend.is-expanded{grid-template-columns:minmax(185px,.72fr) minmax(220px,.82fr) minmax(0,1.75fr)!important;gap:14px!important;padding:17px 18px!important;margin-top:18px!important;border-top:2px solid #dcaeb8!important}
.susi-beta-school-trend.is-expanded>div:last-child{grid-column:1/-1!important;display:flex!important;align-items:center!important;justify-content:flex-end!important;padding-top:2px}
.susi-beta-school-trend.is-expanded .susi-beta-school-trend-types{grid-template-columns:repeat(auto-fit,minmax(185px,1fr))!important;gap:9px!important}
.susi-beta-school-trend.is-expanded .susi-beta-school-trend-types>span{padding:10px!important}
.susi-beta-school-trend.is-expanded .susi-beta-school-trend-metrics>span{min-height:58px!important}
@media(max-width:1050px){
  .susi-beta-school-trend.is-expanded{grid-template-columns:1fr 1fr!important}
  .susi-beta-school-trend.is-expanded .susi-beta-school-trend-types,.susi-beta-school-trend.is-expanded>div:last-child{grid-column:1/-1!important}
}

/* Patch 51: 긴 모집단위/전형명 잘림 방지 + 지원구간 다중선택 */
.susi-beta-result-card,.susi-beta-result-card *{min-width:0}
.susi-beta-result-card h3,.susi-beta-result-card b,.susi-beta-result-card span,.susi-beta-result-card p,.susi-beta-result-card small{text-overflow:clip}
.susi-beta-result-card h3,.susi-beta-result-card b,.susi-beta-result-card p{overflow-wrap:anywhere;word-break:keep-all}
.susi-beta-result-identity>div,.susi-beta-result-identity>span,.susi-beta-result-identity>b{max-width:100%;white-space:normal}
.susi-beta-result-identity>div:nth-child(3){white-space:normal!important;overflow:visible!important;height:auto!important;min-height:0!important;line-height:1.55!important;overflow-wrap:anywhere!important;word-break:keep-all!important}
.susi-beta-result-card [style*="overflow: hidden"],.susi-beta-result-card [style*="overflow:hidden"]{text-overflow:clip}
.susi-beta-support-filter button[aria-pressed="true"] b{font-weight:950}
.susi-beta-support-filter button[aria-pressed="true"] small{color:rgba(255,255,255,.9)!important}
@media(max-width:1180px){
  .susi-beta-result-card>div:first-child{grid-template-columns:minmax(260px,1fr) auto!important}
  .susi-beta-result-card>div:first-child>div:nth-child(2){grid-column:2;grid-row:1}
  .susi-beta-result-card>div:first-child>div:last-child{grid-column:1/-1;justify-content:flex-end!important}
}

/* Patch 54: 다중필터·상세 정렬·지원연결 가독성 */
.susi-beta-multi-filter summary::-webkit-details-marker,.susi-beta-source-guide summary::-webkit-details-marker{display:none}
.susi-beta-multi-filter summary>b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#2f435d;text-align:right}
.susi-beta-multi-filter summary>span{font-size:10.5px;font-weight:900;color:#758297;white-space:nowrap}
.susi-beta-sort-control>span{font-size:10.5px;font-weight:900;color:#758297;white-space:nowrap}.susi-beta-sort-control>b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#2f435d;text-align:right}.susi-beta-sort-control:focus-within{border-color:#87a8ca!important;box-shadow:0 0 0 2px rgba(70,112,155,.10)}
.susi-beta-multi-filter[open] summary{border-color:#87a8ca!important;box-shadow:0 0 0 2px rgba(70,112,155,.10)}
.susi-beta-source-guide[open]>summary{border-bottom:1px solid #e1e7ef;background:#f7f9fc}
.susi-beta-source-guide>summary>span{display:flex;align-items:center;gap:7px;min-width:0}
.susi-beta-source-guide>summary b{font-size:12px;color:#3f536d}.susi-beta-source-guide>summary small{font-size:10.5px;color:#8490a0}
.susi-beta-source-guide .susi-beta-source-legend{padding:10px}
.susi-beta-result-controls select{width:100%;height:42px;box-sizing:border-box;border:1px solid #ced8e5;border-radius:10px;background:#fff;padding:0 10px;color:#33475f;font-size:12px;font-weight:850;outline:none}
.susi-beta-connection-panel,.susi-beta-connection-panel *{box-sizing:border-box;min-width:0}
.susi-beta-connection-panel b,.susi-beta-connection-panel strong,.susi-beta-connection-panel span,.susi-beta-connection-panel small{max-width:100%;overflow-wrap:anywhere}
.susi-beta-connection-panel .susi-beta-connection-notice>span{white-space:normal!important;overflow:visible!important;text-overflow:clip!important}
.susi-beta-connection-panel article{overflow:hidden}
.susi-beta-connection-panel article button{max-width:100%;white-space:normal;line-height:1.3}
@media(max-width:1100px){
  .susi-beta-result-controls>div:nth-child(2){grid-template-columns:repeat(3,minmax(0,1fr))!important}
  .susi-beta-connection-panel>div:first-child{align-items:flex-start!important}
}
@media(max-width:760px){
  .susi-beta-result-controls>div:nth-child(2){grid-template-columns:1fr 1fr!important}
  .susi-beta-source-guide .susi-beta-source-legend{grid-template-columns:1fr!important}
  .susi-beta-connection-panel>div:first-child>div:last-child{width:100%;justify-content:flex-start!important}
}
`;
