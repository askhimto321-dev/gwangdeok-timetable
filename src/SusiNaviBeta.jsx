import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Database,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Upload,
  X,
} from "lucide-react";
import { readStorage, writeStorage } from "./storage.js";

const STORAGE_KEY = "kd_susi_navi_beta_v1";
const SCHEMA_VERSION = 1;
const PAGE_SIZE = 12;
const CONVERSION_GROUPS = ["전교과", "국수영사과", "국수영과", "국수영사"];

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

function universityBaseKey(value) {
  let text = normalizeText(value)
    .replace(/[（]/g, "(").replace(/[）]/g, ")")
    .replace(/\((?:서울|ERICA|에리카|메디컬|국제|수원|죽전|천안|안양|성남|본교|제\d캠퍼스|캠퍼스)[^)]*\)/gi, "")
    .replace(/(?:서울|ERICA|에리카|메디컬|국제|수원|죽전|천안|안양|성남)\s*캠퍼스/gi, "")
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
  if (/ERICA|에리카/i.test(text)) return "ERICA";
  for (const campus of ["메디컬", "국제", "서울", "수원", "죽전", "천안", "안양", "성남"]) {
    if (new RegExp(`(?:\\(|\\s|^)${campus}(?:캠퍼스)?(?:\\)|\\s|$)`).test(text)) return campus;
  }
  const base = universityBaseKey(text);
  const regionText = normalizeText(region);
  if (base === "한양대") return /경기|안산/.test(regionText) ? "ERICA" : "서울";
  if (base === "가천대") return /인천/.test(regionText) ? "메디컬" : "글로벌";
  return regionText || "단일";
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
  return compactText(value).replace(/학부|학과|전공|계열/g, "");
}
function unitSimilar(a, b) {
  const left = compactUnit(a);
  const right = compactUnit(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
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
function conversionDetails(data, method, group, grade5) {
  const input = clampGrade(grade5);
  if (input == null) return null;
  if (method === "legacy") return { input, value: legacyConvert(input), range: "", cumulative: "", sourceGrade: input };
  const row = nearestConversion(data?.conversions, input);
  if (!row) return null;
  const groupIndex = { 전교과: 2, 국수영사과: 4, 국수영과: 6, 국수영사: 8 }[group] ?? 2;
  return { input, value: row[groupIndex + 1], range: row[groupIndex], cumulative: row[1], sourceGrade: row[0] };
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
  const sameUniversity = universityIdentityKey(item.university, item.region || item.campus) === universityIdentityKey(row[3], row[1]);
  const department = compactText(item.department);
  return sameUniversity && (!department || department === compactText(row[5]));
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
  focusUniversity = "",
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [grade5, setGrade5] = useState("1.80");
  const [conversionMethod, setConversionMethod] = useState("legacy");
  const [conversionGroup, setConversionGroup] = useState("전교과");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("전체");
  const [field, setField] = useState("전체");
  const [admissionType, setAdmissionType] = useState("전체");
  const [minimumFilter, setMinimumFilter] = useState("전체");
  const [supportFilter, setSupportFilter] = useState("전체");
  const [cutoffBasis, setCutoffBasis] = useState("50");
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    loadBetaData().then(value => { if (active) { setData(value); setLoading(false); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (focusUniversity) setQuery(normalizeUniversityAliasText(focusUniversity));
  }, [focusUniversity]);

  useEffect(() => {
    const value = Number(selectedStudent?.grade5);
    if (Number.isFinite(value) && value >= 1 && value <= 5) {
      setGrade5(value.toFixed(2));
    } else if (selectedStudent?.sid) {
      // 9등급제 학생이거나 내신 자료가 없는 학생으로 바뀌면
      // 이전 학생의 5등급 입력값이 남지 않도록 비웁니다.
      setGrade5("");
    }
    if (!selectedStudent?.sid) setFavoriteOnly(false);
  }, [selectedStudent?.sid, selectedStudent?.grade5]);

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

  const filtered = useMemo(() => enriched.filter(({ row, minimums }) => {
    if (region !== "전체" && row[1] !== region) return false;
    if (field !== "전체" && row[6] !== field) return false;
    if (admissionType === "교과" && !row[7]?.length) return false;
    if (admissionType === "종합" && !row[8]?.length) return false;
    if (admissionType === "정시" && !row[9]) return false;
    if (minimumFilter === "있음" && !minimums.length) return false;
    if (minimumFilter === "없음" && minimums.length) return false;
    if (supportFilter !== "전체") {
      const supportItems = admissionType === "교과"
        ? (row[7] || [])
        : admissionType === "종합"
          ? (row[8] || [])
          : [...(row[7] || []), ...(row[8] || [])];
      const labels = unique(supportItems
        .map(item => supportBand(conversion?.value, cutoffValue(item, cutoffBasis))?.label)
        .filter(Boolean));
      if (!labels.includes(supportFilter)) return false;
    }
    if (favoriteOnly && !favorites.some(item => favoriteMatches(item, row))) return false;
    if (!queryMatchesRow(row, query)) return false;
    return true;
  }), [enriched, query, region, field, admissionType, minimumFilter, supportFilter, cutoffBasis, favoriteOnly, favorites, conversion?.value]);

  useEffect(() => { setPage(1); }, [query, region, field, admissionType, minimumFilter, supportFilter, cutoffBasis, favoriteOnly]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const changePage = nextPage => setPage(Math.min(pageCount, Math.max(1, Number(nextPage) || 1)));


  if (loading) return <div style={ui.loading}><Loader2 className="spin" size={22} /> 수시NAVI Beta 자료를 불러오는 중입니다.</div>;

  return (
    <section style={ui.root}>
      <style>{betaCss}</style>
      <div style={ui.hero}>
        <div><div style={ui.heroEyebrow}><Sparkles size={14} /> 경기도교육청 교사용 자료 기반 · 독립 시험 운영</div><h2 style={ui.heroTitle}>2027 수시NAVI <span>Beta</span></h2><p style={ui.heroText}>광덕고 대입 결과와 분리하여 대학·모집단위와 전년도 입시결과를 조회합니다.</p></div>
        {data && <div style={ui.heroStats}><b>{data.stats?.universities?.toLocaleString()}개 대학</b><span>{data.stats?.records?.toLocaleString()}개 모집단위</span><small>자료 기준 {data.source?.sourceDate || "확인 필요"}</small></div>}
      </div>
      <div style={ui.betaNotice}><AlertTriangle size={15} /><span><b>시험 운영 기능입니다.</b> 2027 모집단위와 2026 입시결과를 연결한 참고자료이며, 기존 광덕고 사례검색·지원구간 판정에는 영향을 주지 않습니다.{data && !data.caseStats?.length && <><br/><strong>Ver33의 합격사례 분포·2028 변화 자료를 사용하려면 관리자에서 원본 파일을 다시 분석·반영해주세요.</strong></>}</span></div>

      {!data ? <EmptyData isAdmin={isAdmin} /> : <>
        <div style={ui.converterPanel}>
          <div style={ui.sectionHeading}><div style={ui.step}>1</div><div><b style={ui.sectionTitle}>5·9등급 환산 기준</b><span style={ui.sectionSub}>현재 방식과 통계 기반 방식을 비교해서 사용할 수 있습니다.</span></div></div>
          {selectedStudent?.sid && <div className="susi-beta-student-auto" style={ui.studentAutoBar}>
            <div style={ui.studentAutoIdentity}><span>선택 학생 자동 반영</span><b>{selectedStudent.sid} {selectedStudent.name || "학생"}</b></div>
            <div style={ui.studentAutoGrade}><small>5등급제 전과목 내신</small><b>{selectedStudent.grade5 != null ? Number(selectedStudent.grade5).toFixed(2) : "자료 없음"}</b></div>
            <p>{selectedStudent.grade5 != null ? "학생 성적표의 등록 학기 전과목 평균을 불러왔습니다. 아래 입력값은 필요할 때 직접 수정할 수 있습니다." : "선택 학생에게 5등급제 내신 자료가 없어 수동 입력을 사용합니다."}</p>
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
            <FilterSelect label="지역" value={region} onChange={setRegion} options={["전체", ...regions]} />
            <FilterSelect label="계열" value={field} onChange={setField} options={["전체", ...fields]} />
            <FilterSelect label="전형" value={admissionType} onChange={setAdmissionType} options={["전체", "교과", "종합", "정시"]} />
            <FilterSelect label="수능최저" value={minimumFilter} onChange={setMinimumFilter} options={["전체", "있음", "없음"]} />
          </div>
          <div style={ui.searchSummaryRow}>
            <div style={ui.resultCount}><b>{filtered.length.toLocaleString()}건</b><span>현재 조건에 해당하는 모집단위</span></div>
            <div style={ui.favoriteFilterWrap}>
              <span style={ui.favoriteFilterLabel}>관심 모집단위</span>
              <button type="button" disabled={!selectedStudent?.sid} onClick={() => setFavoriteOnly(value => !value)} style={{ ...ui.favoriteFilterBtn, ...(favoriteOnly ? ui.favoriteFilterActive : {}), ...(!selectedStudent?.sid ? ui.favoriteBtnDisabled : {}) }}><Star size={14} fill={favoriteOnly ? "currentColor" : "none"}/>{favoriteOnly ? "즐겨찾기만 보는 중" : "즐겨찾기만"}</button>
            </div>
          </div>
          <div className="susi-beta-support-filter" style={ui.supportFilterRow}>
            <div style={ui.supportFilterHeading}>
              <span style={ui.supportFilterEyebrow}>지원 구간 필터</span>
              <b>학생 9등급 환산 내신과 <em>{cutoffBasis}%컷</em>의 차이</b>
              <small>비교 기준 컷을 바꾸면 상향·소신·적정·안정·하향 판정도 함께 다시 계산됩니다.</small>
            </div>
            <div style={ui.supportFilterControls}>
              <div style={ui.cutoffBasisToggle} aria-label="지원 구간 비교 기준">
                <button type="button" onClick={() => setCutoffBasis("50")} style={{ ...ui.cutoffBasisBtn, ...(cutoffBasis === "50" ? ui.cutoffBasisActive : {}) }}>50%컷 기준</button>
                <button type="button" onClick={() => setCutoffBasis("70")} style={{ ...ui.cutoffBasisBtn, ...(cutoffBasis === "70" ? ui.cutoffBasisActive : {}) }}>70%컷 기준</button>
              </div>
              <div style={ui.supportLegend}>
                <button type="button" onClick={() => setSupportFilter("전체")} style={{ ...ui.supportFilterBtn, ...(supportFilter === "전체" ? ui.supportFilterBtnActive : {}) }}>전체</button>
                {Object.entries(SUPPORT_META).map(([label, meta]) => <button type="button" key={label} onClick={() => setSupportFilter(label)} style={{ ...ui.supportLegendItem, ...(supportFilter === label ? ui.supportSelected : {}), color: meta.color, background: meta.background, borderColor: meta.border }}><b>{label}</b><small>{meta.detail}</small></button>)}
              </div>
            </div>
          </div>
        </div>

        <div style={ui.resultList}>
          {visible.length ? visible.map(({ row, minimums, courseRules, changes2028, schedules, caseStats }, index) => <ResultCard
            key={`${row[3]}-${row[5]}-${(page - 1) * PAGE_SIZE + index}`}
            row={row}
            minimums={minimums}
            courseRules={courseRules}
            changes2028={changes2028}
            schedules={schedules}
            caseStats={caseStats}
            conversionGroup={conversionGroup}
            convertedGrade={conversion?.value}
            cutoffBasis={cutoffBasis}
            favorite={favorites.some(item => favoriteMatches(item, row))}
            favoriteEnabled={Boolean(selectedStudent?.sid && onToggleFavorite)}
            onToggleFavorite={onToggleFavorite}
          />) : <div style={ui.noResult}>조건에 맞는 결과가 없습니다.</div>}
        </div>
        {pageCount > 1 && <Pagination page={page} pageCount={pageCount} onChange={changePage} />}
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

function ResultCard({ row, minimums, courseRules = [], changes2028 = [], schedules = [], caseStats = [], conversionGroup, convertedGrade, cutoffBasis = "50", favorite, favoriteEnabled, onToggleFavorite }) {
  const [regionGroup, region, detailRegion, university, unit2026, unit2027, field, teaching, holistic, regular] = row;
  const favoriteItem = {
    source: "susiNaviBeta",
    university,
    universityKey: universityIdentityKey(university, region),
    campus: universityCampus(university, region),
    department: unit2027,
    admissionType: "수시NAVI Beta",
    region,
    field,
    note: "2027 수시NAVI Beta 모집단위",
  };
  return (
    <article className="susi-beta-result-card" style={ui.resultCard}>
      <div style={ui.resultIdentity}>
        <div style={ui.universityLine}>
          <h3 style={ui.universityName}>{university}</h3><span style={ui.fieldBadge}>{field}</span>
          <button
            type="button"
            title={favoriteEnabled ? (favorite ? "즐겨찾기 해제" : "즐겨찾기 추가") : "학생을 먼저 선택하세요"}
            disabled={!favoriteEnabled}
            onClick={() => onToggleFavorite?.(favoriteItem)}
            style={{ ...ui.favoriteBtn, ...(favorite ? ui.favoriteBtnActive : {}), ...(!favoriteEnabled ? ui.favoriteBtnDisabled : {}) }}
          ><Star size={15} fill={favorite ? "currentColor" : "none"}/></button>
        </div>
        <b style={ui.unitTitle}>{unit2027}</b>
        <div style={ui.location}>{[regionGroup, region, detailRegion].filter(Boolean).join(" · ")}</div>
        {unit2026 && unit2026 !== unit2027 && <div style={ui.previousUnit}><span>2026 모집단위</span>{unit2026}</div>}
        <RelatedInfo courseRules={courseRules} changes2028={changes2028} schedules={schedules} />
      </div>
      <div className="susi-beta-admission-columns" style={ui.admissionColumns}>
        <AdmissionGroup title="교과전형" year="2026 입시결과" admissionType="교과" items={teaching} convertedGrade={convertedGrade} cutoffBasis={cutoffBasis} tone="teaching" university={university} region={region} caseStats={caseStats} conversionGroup={conversionGroup} />
        <AdmissionGroup title="종합전형" year="2026 입시결과" admissionType="종합" items={holistic} convertedGrade={convertedGrade} cutoffBasis={cutoffBasis} tone="holistic" university={university} region={region} caseStats={caseStats} conversionGroup={conversionGroup} />
        <RegularGroup info={regular} />
        <MinimumGroup rows={minimums} />
      </div>
    </article>
  );
}
function SectionTitle({ tone, title, year }) {
  const toneStyle = tone === "teaching" ? ui.sectionTeaching
    : tone === "holistic" ? ui.sectionHolistic
      : tone === "regular" ? ui.sectionRegular
        : ui.sectionMinimum;
  return <div style={ui.resultSectionTitle}><span style={{ ...ui.sectionTypeBadge, ...toneStyle }}>{title}</span><b>{year}</b></div>;
}
function AdmissionGroup({ title, year, admissionType, items = [], convertedGrade, cutoffBasis, tone, university, region, caseStats, conversionGroup }) {
  return <div style={ui.resultSection}><SectionTitle tone={tone} title={title} year={year}/>{items.length ? <div style={ui.admissionItems}>{items.map((item, index) => {
    const selectedCutoff = cutoffValue(item, cutoffBasis);
    const diff = differenceLabel(convertedGrade, selectedCutoff);
    const support = supportBand(convertedGrade, selectedCutoff);
    const stat = bestCaseStat(caseStats, university, region, item[0], admissionType, conversionGroup);
    const cuts = caseCutForGroup(stat, conversionGroup);
    return <div key={`${item[0]}-${index}`} style={{ ...ui.admissionItem, ...(tone === "teaching" ? ui.teachingItem : ui.holisticItem) }}>
      <div style={ui.admissionItemHead}><b style={ui.admissionName}>{item[0]}</b>{support && <span style={{ ...ui.supportBadge, color: support.color, background: support.background, borderColor: support.border }}>{support.label}</span>}</div>
      <div style={ui.cutoffGrid}>
        <div style={{ ...ui.cutoffBox, ...(cutoffBasis === "50" ? ui.cutoffBoxActive : {}) }}><span>50%컷</span><b>{item[1] ?? "-"}</b></div>
        <div style={{ ...ui.cutoffBox, ...(cutoffBasis === "70" ? ui.cutoffBoxActive : {}) }}><span>70%컷</span><b>{item[2] ?? "-"}</b></div>
      </div>
      {diff && <small style={{ ...ui.studentDifference, color: diff.favorable ? "#287348" : "#b05244" }}>학생 환산 − {cutoffBasis}%컷 <b>{diff.text}</b></small>}
      {cuts?.[0] ? <CaseDistribution cuts={cuts} /> : <small style={ui.caseNone}>협력고교 분포 자료 없음</small>}
    </div>;
  })}</div> : <span style={ui.none}>자료 없음</span>}</div>;
}
function CaseDistribution({ cuts }) {
  const [open, setOpen] = useState(false);
  const [count, p30, p50, p70] = cuts || [];
  if (![p30, p50, p70].some(value => Number.isFinite(Number(value)))) return null;
  return <div style={ui.caseDisclosure}>
    <button type="button" onClick={() => setOpen(value => !value)} style={ui.caseToggleBtn}>
      <span>협력고교 합격사례 <b>{Number(count || 0).toLocaleString()}건</b></span>
      <small>{open ? "컷 닫기" : "30·50·70%컷 보기"}</small>
    </button>
    {open && <div style={ui.caseCutGrid}>
      {[['30%', p30, ui.case30], ['50%', p50, ui.case50], ['70%', p70, ui.case70]].map(([label, value, toneStyle]) => <div key={label} style={{ ...ui.caseCutCard, ...toneStyle }}><span>{label} 컷</span><b>{Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "-"}</b></div>)}
    </div>}
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
  root: { display: "grid", gap: 14, fontFamily: "Pretendard, 'Noto Sans KR', system-ui, sans-serif", color: "#222a3a" },
  loading: { minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#647086", fontWeight: 750 },
  hero: { padding: "23px 25px", borderRadius: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 18, color: "#fff", background: "linear-gradient(135deg,#63558e,#8a5d82)", boxShadow: "0 14px 34px rgba(86,67,119,.18)" },
  heroEyebrow: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, opacity: .82 },
  heroTitle: { margin: "6px 0 4px", fontSize: 25, lineHeight: 1.15, letterSpacing: "-.03em" },
  heroText: { margin: 0, fontSize: 12.5, lineHeight: 1.55, opacity: .88 },
  heroStats: { minWidth: 170, display: "grid", gap: 4, textAlign: "right" },
  betaBadge: { display: "inline-flex", padding: "3px 7px", borderRadius: 999, background: "#eee8ff", color: "#6b55a0", fontSize: 10, fontWeight: 900, verticalAlign: "middle" },
  betaNotice: { display: "flex", gap: 9, alignItems: "flex-start", padding: "11px 14px", border: "1px solid #e5d9b7", borderRadius: 12, background: "#fff9e9", color: "#6e5923", fontSize: 11.5, lineHeight: 1.55 },
  empty: { minHeight: 280, padding: 32, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, border: "1px dashed #cfd5df", borderRadius: 16, background: "#fafbfc", color: "#667085", textAlign: "center" },
  converterPanel: { padding: 18, border: "1px solid #dce2ec", borderRadius: 16, background: "#fff" },
  searchPanel: { padding: 18, border: "1px solid #dce2ec", borderRadius: 16, background: "#fff" },
  sectionHeading: { display: "flex", gap: 10, alignItems: "center", marginBottom: 14 },
  sectionTitle: { display: "block", fontSize: 14, lineHeight: 1.25, color: "#2b3445" },
  sectionSub: { display: "block", marginTop: 3, fontSize: 10.5, lineHeight: 1.45, color: "#7a8495" },
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
  resultCount: { display: "flex", alignItems: "baseline", gap: 7, color: "#687386", fontSize: 11.5 },
  searchSummaryRow: { marginTop: 16, paddingTop: 14, borderTop: "1px solid #edf0f5", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" },
  searchSummaryTools: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" },
  favoriteFilterWrap: { display: "flex", alignItems: "center", gap: 9, padding: "5px 6px 5px 10px", border: "1px solid #e3e7ee", borderRadius: 11, background: "#fafbfc" },
  favoriteFilterLabel: { fontSize: 9.5, fontWeight: 850, color: "#8490a2" },
  favoriteFilterBtn: { minHeight: 32, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 11px", border: "1px solid #d5ddea", borderRadius: 9, background: "#fff", color: "#667085", fontSize: 10.5, fontWeight: 850, cursor: "pointer" },
  favoriteFilterActive: { borderColor: "#e1c36d", background: "#fff7d9", color: "#9a660d", boxShadow: "0 3px 9px rgba(181,126,18,.11)" },
  supportFilterRow: { marginTop: 15, padding: "14px 15px", border: "1px solid #e0e5ef", borderRadius: 13, background: "linear-gradient(135deg,#fafbff,#f8f7fc)", display: "grid", gridTemplateColumns: "minmax(255px,.82fr) minmax(420px,1.8fr)", alignItems: "center", gap: 18 },
  supportFilterHeading: { display: "grid", gap: 4, fontSize: 11.5, lineHeight: 1.45, color: "#344055" },
  supportFilterEyebrow: { fontSize: 9.5, fontWeight: 900, color: "#735e9a", letterSpacing: ".02em" },
  supportFilterControls: { minWidth: 0, display: "grid", gap: 10, justifyItems: "end" },
  cutoffBasisToggle: { display: "inline-grid", gridTemplateColumns: "1fr 1fr", gap: 3, padding: 3, borderRadius: 10, background: "#e9edf4" },
  cutoffBasisBtn: { minHeight: 29, padding: "0 10px", border: 0, borderRadius: 8, background: "transparent", color: "#707b8c", fontSize: 10, fontWeight: 850, cursor: "pointer" },
  cutoffBasisActive: { background: "#fff", color: "#5b4787", boxShadow: "0 2px 7px rgba(64,69,85,.13)" },
  supportLegend: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 7, flexWrap: "wrap" },
  supportFilterBtn: { minHeight: 30, padding: "0 11px", border: "1px solid #d7deea", borderRadius: 999, background: "#fff", color: "#657085", fontSize: 10, fontWeight: 850, cursor: "pointer" },
  supportFilterBtnActive: { background: "#5e5188", borderColor: "#5e5188", color: "#fff", boxShadow: "0 4px 10px rgba(94,81,136,.18)" },
  supportLegendItem: { minHeight: 30, display: "inline-flex", alignItems: "center", gap: 5, padding: "0 10px", border: "1px solid", borderRadius: 999, fontSize: 9.5, fontWeight: 800, cursor: "pointer" },
  supportSelected: { boxShadow: "0 0 0 2px rgba(74,85,115,.17)", transform: "translateY(-1px)" },
  resultList: { display: "grid", gap: 12 },
  resultCard: { display: "grid", gridTemplateColumns: "220px 1fr", gap: 14, padding: 14, border: "1px solid #dbe2ec", borderRadius: 16, background: "#fff", boxShadow: "0 5px 16px rgba(52,62,78,.045)" },
  resultIdentity: { minWidth: 0, display: "grid", alignContent: "start", gap: 6, padding: 12, borderRadius: 12, background: "linear-gradient(180deg,#f8f9fc,#f5f7fa)" },
  universityLine: { display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" },
  universityName: { margin: 0, fontSize: 16.5, lineHeight: 1.2, letterSpacing: "-.025em", color: "#222f45" },
  fieldBadge: { display: "inline-flex", padding: "3px 7px", borderRadius: 999, background: "#e9edf5", color: "#526078", fontSize: 9.5, fontWeight: 850 },
  favoriteBtn: { marginLeft: "auto", width: 32, height: 32, borderRadius: 9, border: "1px solid #d2dbe8", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#7b8799", background: "#fff", cursor: "pointer" },
  favoriteBtnActive: { color: "#b47b12", background: "#fff8df", borderColor: "#e6ca83" },
  favoriteBtnDisabled: { opacity: .42, cursor: "not-allowed" },
  unitTitle: { fontSize: 14, lineHeight: 1.38, color: "#2d3a50", wordBreak: "keep-all" },
  location: { fontSize: 10.5, color: "#7c8596" },
  previousUnit: { marginTop: 5, display: "grid", gap: 2, paddingTop: 8, borderTop: "1px solid #e1e5ec", fontSize: 10.5, lineHeight: 1.4, color: "#697386" },
  admissionColumns: { minWidth: 0, display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10 },
  resultSection: { minWidth: 0, display: "grid", alignContent: "start", gap: 7 },
  resultSectionTitle: { minHeight: 26, display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 850, color: "#697487" },
  sectionTypeBadge: { display: "inline-flex", alignItems: "center", padding: "4px 7px", borderRadius: 7, fontSize: 10.5, fontWeight: 900 },
  sectionTeaching: { color: "#315f9a", background: "#eaf2ff" },
  sectionHolistic: { color: "#76518f", background: "#f3eafb" },
  sectionRegular: { color: "#27715b", background: "#e9f7f1" },
  sectionMinimum: { color: "#9a6419", background: "#fff3d8" },
  admissionItems: { display: "grid", gap: 7 },
  admissionItem: { minWidth: 0, display: "grid", gap: 6, padding: "10px", borderRadius: 11, border: "1px solid #dce3ed", background: "#fbfcfd", fontSize: 10.5, lineHeight: 1.4 },
  admissionItemHead: { minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 },
  admissionName: { minWidth: 0, color: "#29374b", lineHeight: 1.35, wordBreak: "keep-all" },
  supportBadge: { flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 38, padding: "3px 7px", border: "1px solid", borderRadius: 999, fontSize: 9.5, fontWeight: 900 },
  cutoffGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 },
  cutoffBox: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 5, padding: "6px 7px", border: "1px solid #e0e5ed", borderRadius: 8, background: "rgba(255,255,255,.72)", color: "#717b8b" },
  cutoffBoxActive: { borderColor: "#9eb3d6", background: "#fff", color: "#315f99", boxShadow: "0 2px 6px rgba(57,88,132,.08)" },
  studentDifference: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, fontSize: 9.5, fontWeight: 750 },
  caseNone: { color: "#9aa2af", fontSize: 9 },
  caseDisclosure: { paddingTop: 6, borderTop: "1px dashed #d9e0e9", display: "grid", gap: 6 },
  caseToggleBtn: { minHeight: 29, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7, padding: "0 8px", border: "1px solid #dce3ed", borderRadius: 8, background: "#fff", color: "#5b687c", fontSize: 9.5, fontWeight: 750, cursor: "pointer" },
  caseCutGrid: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 5 },
  caseCutCard: { display: "grid", gap: 2, padding: "7px 5px", borderRadius: 8, border: "1px solid", textAlign: "center" },
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
  minimumCriteria: { padding: "6px 7px", borderRadius: 7, background: "#fff2cc", color: "#7a5718", lineHeight: 1.4, wordBreak: "keep-all" },
  minimumNote: { color: "#786e5e", lineHeight: 1.45, wordBreak: "keep-all" },
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
  muted: { margin: "7px 0 0", fontSize: 11.5, lineHeight: 1.55, color: "#737d8e", fontWeight: 650 },
  compareGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  summaryCard: { padding: 16, borderRadius: 15, border: "1px solid", display: "grid", gap: 12, minWidth: 0 },
  summarySchool: { background: "#f3faf6", borderColor: "#c9dfd1" },
  summaryDraft: { background: "#f5f8ff", borderColor: "#ccd8ec" },
  summaryTop: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" },
  summaryHeading: { display: "grid", gap: 3, minWidth: 0 },
  summaryEyebrow: { fontSize: 9.5, color: "#778398", fontWeight: 850 },
  summaryTitle: { fontSize: 15.5, lineHeight: 1.25, color: "#29374c", letterSpacing: "-.015em" },
  summaryDescription: { fontSize: 10.5, lineHeight: 1.45, color: "#738094" },
  statePill: { padding: "4px 8px", borderRadius: 999, fontSize: 9.5, fontWeight: 900 },
  stateSchool: { color: "#287348", background: "#e1f3e8" },
  stateDraft: { color: "#315a9b", background: "#e7efff" },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 7 },
  miniStat: { display: "grid", gap: 3, padding: "10px 8px", borderRadius: 10, background: "rgba(255,255,255,.82)", textAlign: "center", border: "1px solid rgba(210,219,233,.62)" },
  miniStatLabel: { fontSize: 9.5, color: "#718095", fontWeight: 800 },
  miniStatValue: { fontSize: 19, lineHeight: 1.1, color: "#243d64", fontWeight: 900 },
  sourceMeta: { display: "grid", gap: 4, paddingTop: 2, fontSize: 10.5, lineHeight: 1.45, color: "#6f7888", minWidth: 0 },
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
.susi-beta-filter-grid input{min-width:0;flex:1;border:0;outline:0;background:transparent;font:inherit;font-size:12px;color:#263244}
.susi-beta-filter-grid select{width:100%;height:38px;border:1px solid #cdd7e6;border-radius:10px;background:#fff;padding:0 9px;font:inherit;font-size:11px;font-weight:750;color:#344054;outline:0}
.susi-beta-filter-grid label>span{padding-left:2px}
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
.susi-beta-result-card button small{font-size:8.5px;color:inherit}
nav[aria-label="검색 결과 페이지 이동"] button:disabled{opacity:.38;cursor:not-allowed;box-shadow:none}
@media(max-width:900px){
  .susi-beta-filter-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .susi-beta-support-filter{grid-template-columns:1fr!important}
  .susi-beta-support-filter>div:last-child{justify-items:start!important}
  .susi-beta-query{grid-column:1/-1}
  .susi-beta-result-card{grid-template-columns:1fr!important}
  .susi-beta-admission-columns{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .susi-beta-converter-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .susi-beta-upload-panel{grid-template-columns:auto 1fr!important}
  .susi-beta-compare-grid{grid-template-columns:1fr!important}
  .susi-beta-student-auto{grid-template-columns:1fr 140px!important}
  .susi-beta-student-auto p{grid-column:1/-1}
}
@media(max-width:720px){
  .susi-beta-filter-grid{grid-template-columns:1fr!important}
  .susi-beta-query{grid-column:auto}
  .susi-beta-admission-columns,.susi-beta-converter-grid{grid-template-columns:1fr!important}
  .susi-beta-upload-panel{grid-template-columns:1fr!important}
  .susi-beta-student-auto{grid-template-columns:1fr!important}
  .susi-beta-student-auto p{grid-column:auto}
}
`;
