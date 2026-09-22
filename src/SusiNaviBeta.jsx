import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  LayoutGrid,
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
import { evaluateAdmissionRequirement } from "./gradeEngine.js";
import { validGrade, supportBandValue, cutoffRange, SUPPORT_BAND_META, trackAccentKey } from "./admissionMetrics.js";
import { loadSupportPlan, loadCompareTray, mutateWorkspaceList, subscribeSupportPlanChanges } from "./supportPlanStore.js";
import SupportPlanButton from "./SupportPlanButton.jsx";
import AdmissionComparison from "./AdmissionComparison.jsx";
import { buildComparisonRows, minimumScopeRank, comparisonType, resolveMinimumLink } from "./admissionComparison.js";
import {catalogRowsForTarget,resolveCatalogMinimum,minimumTrackKey} from './minimumCatalog.js';
import SupportDecisionCard from "./SupportDecisionCard.jsx";
import SupportPlanPrint from "./SupportPlanPrint.jsx";
import { evaluateNaviMinimumSafe, minimumDisplay, minimumYearLabel, minimumHistorySummary, minimumImprovementAdvice, improvementAdviceText } from "./naviMinimum.js";
import { conversionDetails, loadSusiNaviBetaData, loadSusiNaviBetaDataReliable, updateSusiNaviBetaCache } from "./susiNaviData.js";
import { recommendedCourseDisplayName } from "./recommendationPresentation.js";

export { conversionDetails, loadSusiNaviBetaData } from "./susiNaviData.js";

const STORAGE_KEY = "kd_susi_navi_beta_v1";
const SCHEMA_VERSION = 1;
const PAGE_SIZE = 12;
const CONVERSION_GROUPS = ["전교과", "국수영사과", "국수영과", "국수영사"];

// Patch (print-overlap fix): 대학 상세 인쇄용 표와 지원 구성 인쇄용 표가 항상 함께 DOM에 있어서,
// 어느 버튼을 눌러도 두 표가 겹쳐서 인쇄되는 문제가 있었습니다. 인쇄 버튼을 누르는 순간에만
// body에 표시용 클래스를 붙였다가 인쇄가 끝나면(afterprint) 지워서, 누른 버튼에 맞는 표 하나만 보이게 합니다.
function triggerSectionPrint(targetClass) {
  if (typeof document === "undefined") return;
  document.body.classList.remove("kd-print-target-result", "kd-print-target-plan");
  document.body.classList.add(targetClass);
  const cleanup = () => {
    document.body.classList.remove("kd-print-target-result", "kd-print-target-plan");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}
const CONVERSION_PREF_KEY = "kd_susi_navi_conversion_pref_v1";
const CUTOFF_PREF_KEY = "kd_susi_navi_cutoff_pref_v1";
const CONNECTION_PAGE_SIZE = 12;
const RECOMMENDED_SUBJECT_STORAGE_KEY = "kd_2028_recommended_subjects_v1";
const OFFICIAL_RECOMMENDED_SOURCE_URL = "https://www.adiga.kr/uct/ces/archiveView.do?menuId=PCUCTCES1000&prtlBbsId=26634";
const NAVI_VIEW_STATE_PREFIX = "kd_susi_navi_view_state_patch64";

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

let recommendedSubjectCache = null;
let recommendedSubjectCachePromise = null;

export async function loadSusiSupportPlanExternal(studentSid = "") {
  return loadSupportPlan(studentSid);
}

export async function addSusiSupportPlanExternal(studentSid = "", item = {}) {
  const sid = String(studentSid || "").trim();
  if (!sid) return { ok: false, error: "학생을 먼저 선택해주세요." };
  const university = normalizeText(item?.university);
  const department = normalizeText(item?.department);
  const admissionTypeRaw = normalizeText(item?.admissionType);
  const admissionType = /종합/.test(admissionTypeRaw) ? "종합" : /교과/.test(admissionTypeRaw) ? "교과" : admissionTypeRaw;
  const track = normalizeText(item?.track || item?.detailType || item?.admissionType);
  if (!university || !department) return { ok: false, error: "대학과 모집단위 정보가 필요합니다." };
  const normalizedItem = {
    university,
    region: normalizeText(item?.region),
    department,
    field: normalizeText(item?.field),
    admissionType,
    track: track || admissionType || "전형 미지정",
    source: normalizeText(item?.source) || "외부 상담 화면",
    sourceCaseId: normalizeText(item?.sourceCaseId),
  };
  return mutateWorkspaceList(sid, "plan", "add", normalizedItem, supportPlanItemKey);
}

function normalizeCourseNumerals(value) {
  return normalizeText(value)
    // NFKC 정규화 뒤에는 Ⅰ·Ⅱ·Ⅲ도 I·II·III가 됩니다. 과목명 끝의 로마 숫자만
    // 아라비아 숫자로 통일해 미적분II·미적분Ⅱ·미적분 2를 같은 과목으로 봅니다.
    .replace(/([가-힣])\s*(III|II|I)(?=$|[^A-Za-z])/gi, (_, prefix, numeral) => `${prefix}${({ I: "1", II: "2", III: "3" })[numeral.toUpperCase()]}`)
    .replace(/([가-힣])\s*([123])(?=$|[^0-9])/g, "$1$2");
}
export function courseMatchKey(value) {
  const compact = normalizeCourseNumerals(value)
    .replace(/[()（）\[\]{}·ㆍ,./\\\-_:：]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
  // 이동수업 엑셀 시트명에는 '미적분Ⅱ(진로선택)', '기하 A반'처럼 과목 성격이나
  // 그룹 문자가 붙기도 합니다. 핵심 과목명이 확실한 경우에만 장식 꼬리를 제거합니다.
  const decoratedCore = compact.match(/^(미적분[12]|기하)(?:(?:일반|진로|융합)?선택|공통과목|선택과목|과목|수강|이수|[123]학년|[12]학기|[a-z](?:반|그룹)?)*$/i);
  return decoratedCore?.[1] || compact;
}
export function splitCourseNames(value) {
  const raw = normalizeText(value);
  if (!raw) return [];
  const expanded = raw
    .replace(/기술\s*[·.]\s*가정/g, "기술가정")
    .replace(/한국사\s*[（(]\s*[IVXⅠⅡⅢ,\s]+\s*[）)]/gi, "한국사")
    .replace(/(국어|수학|영어|사회|과학|정보|제2외국어|한문)\s*[（(]\s*([^()（）]+?)\s*[）)]/gi, (_, subject, inner) => {
      // 과학(3과목), 지구과학(행성우주과학 불요), 과학(진로·융합)은
      // 괄호 안을 과목으로 바꾸지 않고 바깥 교과명을 유지합니다.
      if (/불요|제외|^\s*\d+\s*과목|^(?:진로|융합|일반|공통|선택)(?:\s*[,/·]\s*(?:진로|융합|일반|공통|선택))*$/i.test(inner)) return subject;
      return inner.replace(/^\s*특히\s*/, "");
    })
    .replace(/화학\s*미적분\s*(II|Ⅱ|2)/gi, "화학, 미적분$1")
    .replace(/그\s*외는\s*희망\s*진로에\s*(?:따라|따른)\s*(?:상이\s*)?(?:과목\s*이수\s*)?[（(]?/g, "")
    // 영남대 자료처럼 한 셀 안에 '일반선택'과 '진로선택' 목록이 연달아 있으면
    // 두 번째 머리말 앞에도 구분자를 넣어 개별 과목으로 분리합니다.
    .replace(/\s+-\s*(?:일반|진로|융합|공통)\s*선택\s*[:：]\s*/g, ", ")
    .replace(/(?:제2외국어\s*)?관련\s*과목\s*[:：]\s*/g, ", ");
  return Array.from(new Set(expanded
    .replace(/[\[\]{}]/g, "")
    .replace(/[•●○]/g, "·")
    .split(/[\n,;；|]+|\s*[·ㆍ]\s*|\s*\/\s*|\s+(?:또는|혹은|및)\s+/)
    .map(item => item
      .replace(/^\s*[-–—]\s*/, "")
      .replace(/^(?:일반|진로|융합|공통)\s*선택\s*[:：]\s*/i, "")
      .replace(/^(?:권장|반영|핵심|필수|선택|교과군|교과)\s*(?:과목)?\s*[:：]?\s*/i, "")
      .replace(/^(?:국어|수학|영어|사회|과학|정보|제2외국어|한문)\s*[:：]\s*/i, "")
      .replace(/^특히\s+/, "")
      .replace(/^제2외국어(?:\s*관련)?\s*과목$/i, "제2외국어")
      .replace(/\s*교과\s*[（(]\s*군\s*[）)]\s*$/i, "")
      .replace(/^(.+?)\s+전\s*과목$/i, "$1")
      .replace(/\s*(?:교과(?:\s*영역)?\s*(?:적극\s*)?이수\s*권장|교과\s*적극\s*이수|포함\s*교과\s*적극\s*이수|진로선택\s*과목\s*\d+\s*과목\s*이상)\s*$/i, "")
      .replace(/\s*(?:중\s*)?(?:택\s*\d+|\d+\s*(?:개|과목)(?:\s*(?:선택|이상|이수))?|선택)\s*$/i, "")
      .replace(/\s+(?:포함|등)\s*[）)]?\s*$/i, "")
      .replace(/[（(]\s*$/, "")
      .trim())
    .filter(item => item && item !== "-" && !/^(?:없음|미지정|해당없음|자율선택)$/i.test(item))));
}
function uniqueCourseNames(values = []) {
  const map = new Map();
  values.flat(Infinity).filter(Boolean).forEach(value => {
    const key = courseMatchKey(value);
    if (key && !map.has(key)) map.set(key, normalizeText(value));
  });
  return Array.from(map.values());
}
const GENERIC_GUIDANCE_COURSES = new Set(["국어", "수학", "영어", "사회", "과학", "정보", "제2외국어", "한문"].map(courseMatchKey));
function specificRecommendationCourses(values = []) {
  // 개별 과목 목록에서는 '정보'도 컴퓨터계열의 유효한 권장과목입니다.
  // 국·수·영·사·과 같은 포괄 안내인지 여부는 아래 record 단위 판정에서만 처리합니다.
  return uniqueCourseNames(values);
}
export function isRecommendationGuidanceText(value = "") {
  const text = normalizeText(value);
  if (!text) return false;
  // 일부 대학은 핵심/권장과목 칸에 과목 목록이 아니라 선택 원칙을 문장으로 적습니다.
  // 이 문장을 하나의 과목으로 저장하면 대학 공통과목 집계까지 오염되므로 별도 안내문으로
  // 옮깁니다. 문장 안에 실제 과목명이 명시된 경우는 비고란 파서가 다시 추출합니다.
  return /(?:진로.{0,12}적성|적성.{0,12}진로|교과목\s*선택\s*이수|과목\s*선택(?:하여)?\s*이수|자율적으로\s*선택|학과별\s*특성에\s*맞는|집단지성\s*기반\s*학습|지식활용)/.test(text);
}
export function isGenericRecommendationRecord(item = {}) {
  const all = uniqueCourseNames([
    item.reflected || [], item.core || item.required || [], item.recommended || [], item.noteRecommended || [],
  ]);
  if (!all.length) return true;
  const onlyBroadAreas = all.every(course => GENERIC_GUIDANCE_COURSES.has(courseMatchKey(course)));
  const genericNote = (item.notes || []).some(note => isRecommendationGuidanceText(note)
    || /일반선택\s*과목\s*이수\s*후|자유롭게\s*이수|교과를\s*제시하지\s*않은/.test(normalizeText(note)));
  return onlyBroadAreas && (all.length >= 3 || genericNote);
}
export function uniqueStudentSubjects(values = []) {
  const map = new Map();
  (values || []).flat(Infinity).filter(Boolean).forEach(value => {
    const subjectName = typeof value === "string" ? value : value?.subject;
    const key = courseMatchKey(subjectName);
    if (!key || map.has(key)) return;
    map.set(key, typeof value === "string" ? { subject: normalizeText(value), category: "", subjectType: "", semesterKey: "" } : {
      subject: normalizeText(value?.subject),
      category: normalizeText(value?.category),
      subjectType: normalizeText(value?.subjectType),
      semesterKey: normalizeText(value?.semesterKey),
      source: normalizeText(value?.source),
      enrollmentStatus: normalizeText(value?.enrollmentStatus),
    });
  });
  return Array.from(map.values());
}
function broadCourseGroup(value) {
  const key = courseMatchKey(value);
  const direct = {
    국어: "국어", 수학: "수학", 영어: "영어", 사회: "사회", 과학: "과학",
    정보: "기술가정/정보", 기술가정: "기술가정/정보", 제2외국어: "제2외국어/한문", 한문: "제2외국어/한문",
  };
  return direct[key] || "";
}
export function matchedStudentCourse(studentCourses = [], course = "") {
  const target = courseMatchKey(course);
  if (!target) return null;
  const targetGroup = broadCourseGroup(course);
  return (studentCourses || []).find(subject => {
    const subjectName = typeof subject === "string" ? subject : subject?.subject;
    const key = courseMatchKey(subjectName);
    if (!key) return false;
    if (key === target) return true;
    if (targetGroup && normalizeText(subject?.category) === targetGroup) return true;
    // Similar course names (e.g. 미적분 I / II) are not interchangeable.
    return false;
  }) || null;
}
function studentCourseMatch(studentCourses = [], course = "") {
  return Boolean(matchedStudentCourse(studentCourses, course));
}
function recommendationIdentityKey(item = {}) {
  return `${universityIdentityKey(item.university, item.region || "")}|${compactText(item.department || "전체")}|${compactText(item.field || "")}`;
}

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
  return ["메디컬", "글로벌", "글로컬", "국제", "서울", "세종", "수원", "죽전", "천안", "안양", "성남", "안성", "미래", "다빈치", "송도", "용인", "안산", "인천"]
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
function canonicalCampus(base, campus) {
  const raw = normalizeText(campus);
  if (!raw) return "";
  const map = UNIVERSITY_CAMPUS_ALIASES[base] || {};
  if (/^(?:WISE|와이즈|경주)$/i.test(raw)) return "WISE";
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
function universityCampus(value, region = "") {
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
function universityIdentityKey(value, region = "") {
  return `${universityBaseKey(value)}|${universityCampus(value, region)}`;
}
function sameUniversityCampus(left, leftRegion = "", right, rightRegion = "") {
  const leftBase = universityBaseKey(left);
  const rightBase = universityBaseKey(right);
  if (!leftBase || leftBase !== rightBase) return false;
  const leftCampus = universityCampus(left, leftRegion);
  const rightCampus = universityCampus(right, rightRegion);
  if (leftCampus === rightCampus) return true;
  // 캠퍼스가 여러 개인 대학은 캠퍼스 정보가 다르면 같은 대학으로 느슨하게 합치지 않습니다.
  // 동국대 서울/WISE처럼 본교·분교가 섞이는 문제를 막기 위한 핵심 규칙입니다.
  if (UNIVERSITY_CAMPUS_ALIASES[leftBase]) return false;
  return leftCampus === "단일" || rightCampus === "단일";
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
    // 학과/학부의 '학'까지 지우면 화학과→화, 컴퓨터공학과→컴퓨터공이 되어
    // 화학전공·컴퓨터공학전공과 서로 다른 키가 됩니다. 끝 접미사만 정규화합니다.
    .replace(/학(?:과|부)$/g, "학")
    .replace(/전공$/g, "")
    .replace(/계열|모집단위|전공자율선택제|자율전공/g, " "));
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
function unitIdentityKey(value) {
  return compactText(normalizeText(value)
    .replace(/[（]/g, "(").replace(/[）]/g, ")")
    .replace(/[()\[\]{}·,/|\-]+/g, " "));
}
function admissionIdentityKey(item = []) {
  return [compactText(item?.[0]), ...[1, 2, 3, 4].map(index => Number.isFinite(Number(item?.[index])) ? Number(item[index]).toFixed(4) : "")].join("|");
}
function mergeAdmissionEntries(...groups) {
  const merged = new Map();
  groups.flat().filter(Boolean).forEach(item => {
    const key = admissionIdentityKey(item);
    if (!merged.has(key)) merged.set(key, item);
  });
  return Array.from(merged.values());
}
function regularInfoScore(info) {
  if (!Array.isArray(info)) return 0;
  return info.reduce((score, value) => score + ((value !== null && value !== undefined && value !== "" && value !== "-") ? 1 : 0), 0);
}
function merge2026Units(a, b) {
  const values = [...String(a || "").split(/\s+\/\s+/), ...String(b || "").split(/\s+\/\s+/)]
    .map(normalizeText).filter(Boolean);
  return Array.from(new Set(values)).join(" / ");
}
function fieldValuesOf(row) {
  const stored = Array.isArray(row?.[10]) ? row[10].filter(Boolean) : [];
  if (stored.length) return unique(stored);
  return unique([normalizeText(row?.[6])].filter(Boolean));
}
function mergeFieldLabels(base, next) {
  return unique([...fieldValuesOf(base), ...fieldValuesOf(next)]);
}
function displayMergedFields(values) {
  const list = unique(values || []);
  return list.length ? list.join(" · ") : "공통";
}
function mergeNaviRecord(base, next) {
  const merged = [...base];
  const fields = mergeFieldLabels(base, next);
  merged[4] = merge2026Units(base?.[4], next?.[4]);
  merged[6] = displayMergedFields(fields);
  merged[7] = mergeAdmissionEntries(base?.[7] || [], next?.[7] || []);
  merged[8] = mergeAdmissionEntries(base?.[8] || [], next?.[8] || []);
  if (regularInfoScore(next?.[9]) > regularInfoScore(base?.[9])) merged[9] = next?.[9] ? [...next[9]] : null;
  merged[10] = fields;
  const baseName = normalizeText(base?.[3]);
  const nextName = normalizeText(next?.[3]);
  if (!explicitCampusToken(baseName) && explicitCampusToken(nextName)) merged[3] = next?.[3];
  return merged;
}
function coalesceNaviRecords(records = []) {
  const map = new Map();
  records.forEach(row => {
    if (!Array.isArray(row)) return;
    const universityKey = universityIdentityKey(row?.[3], row?.[1]);
    const unitKey = unitIdentityKey(row?.[5]);
    // 대학·캠퍼스·2027 모집단위가 같으면 계열 표기가 달라도 한 카드로 통합합니다.
    // 원래 계열 값은 row[10]에 보존해 지역/계열 다중필터가 정확히 작동하도록 합니다.
    const key = `${universityKey}|${unitKey}`;
    if (!map.has(key)) {
      const fields = unique([normalizeText(row?.[6])].filter(Boolean));
      map.set(key, [
        row?.[0], row?.[1], row?.[2], row?.[3], row?.[4], row?.[5], displayMergedFields(fields),
        [...(row?.[7] || [])], [...(row?.[8] || [])], row?.[9] ? [...row[9]] : null, fields,
      ]);
      return;
    }
    map.set(key, mergeNaviRecord(map.get(key), row));
  });
  return Array.from(map.values());
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
  return coalesceNaviRecords(result);
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


export function recommendationHeaderSpec(rows = []) {
  const maxRows = Math.min(30, rows.length);
  let best = null;
  const scoreHeaders = headers => {
    const joined = headers.join(" ");
    let score = 0;
    if (/대학명|대학교|(^|\s)대학($|\s)/.test(joined)) score += 5;
    // 공식 파일은 1행 병합 제목(반영과목) 아래에 핵심과목·권장과목이 나뉩니다.
    // 1행만 읽은 후보보다 두 하위 열까지 읽은 2단 헤더를 확실히 우선합니다.
    if (/반영/.test(joined)) score += 2;
    if (/핵심/.test(joined)) score += 3;
    if (/권장|추천/.test(joined)) score += 3;
    if (/과목/.test(joined)) score += 2;
    if (/모집단위|학과|전공|계열/.test(joined)) score += 2;
    if (/권역|지역/.test(joined)) score += 1;
    // 설명문·문서 제목을 헤더에 섞은 후보는 제외에 가깝게 감점합니다.
    // 공식 파일의 실제 열 이름은 모두 짧고, 설명문은 한 셀이 수십 자입니다.
    score -= headers.filter(value => value.length > 45).length * 8;
    return score;
  };
  for (let start = 0; start < maxRows; start += 1) {
    for (let depth = 1; depth <= 3 && start + depth <= maxRows; depth += 1) {
      const width = Math.max(0, ...rows.slice(start, start + depth).map(row => row?.length || 0));
      const headers = Array.from({ length: width }, (_, column) => {
        const parts = [];
        for (let offset = 0; offset < depth; offset += 1) {
          const value = normalizeText(rows[start + offset]?.[column]);
          if (value && !parts.includes(value)) parts.push(value);
        }
        return parts.join(" ");
      });
      const score = scoreHeaders(headers);
      if (!best || score > best.score || (score === best.score && depth < best.depth)) {
        best = { start, end: start + depth - 1, depth, headers, score };
      }
    }
  }
  return best && best.score >= 7 ? best : null;
}
export function recommendationRowsWithMergedHeaders(rows = [], merges = []) {
  const result = rows.map((row, index) => index < 30 ? [...(row || [])] : row);
  (merges || []).forEach(range => {
    if (!range?.s || !range?.e || range.s.r >= 30) return;
    const source = result[range.s.r]?.[range.s.c];
    const sourceText = normalizeText(source);
    // 제목과 설명문도 A:H로 병합돼 있지만 헤더는 아닙니다. 제목의
    // '권장과목(반영과목)'을 전 열에 복사하면 모든 열을 과목 열로 오인하므로,
    // 셀 전체가 실제 열 이름인 병합 셀만 전파합니다.
    if (!/^(?:권역|지역|소재지|대학명|대학교|대학|모집단위(?:\s*\([^)]*\))?|모집학과|학과|전공|계열|분야|단과대|반영과목|반영교과|핵심과목|권장과목|추천과목|비고|참고|안내|유의사항|특이사항)$/i.test(sourceText)) return;
    for (let row = range.s.r; row <= Math.min(range.e.r, 29); row += 1) {
      if (!result[row]) result[row] = [];
      for (let column = range.s.c; column <= range.e.c; column += 1) {
        if (!normalizeText(result[row][column])) result[row][column] = source;
      }
    }
  });
  return result;
}
export function recommendationColumnIndices(headers = []) {
  const normalized = headers.map(value => normalizeText(value));
  const first = regex => normalized.findIndex(value => regex.test(value));
  const all = regex => normalized.map((value, index) => regex.test(value) ? index : -1).filter(index => index >= 0);
  const last = regex => all(regex).at(-1) ?? -1;
  const university = first(/대학명|대학교|^대학$/);
  // '권역/지역'이 함께 있으면 캠퍼스 판정에 필요한 실제 지역 열을 우선합니다.
  const specificRegion = first(/(^|\s)지역($|\s)|소재지/);
  const region = specificRegion >= 0 ? specificRegion : first(/권역/);
  // 공식 파일은 '모집단위'가 계열(왼쪽)·실제 학과(오른쪽) 두 열에 병합돼 있습니다.
  // 가장 오른쪽 열을 학과로, 가장 왼쪽 계열/단과대 열을 학과군 정보로 사용합니다.
  const departmentColumns = all(/모집단위|모집학과|학과|전공/);
  const department = departmentColumns.at(-1) ?? -1;
  const explicitField = first(/계열|분야|단과대/);
  // 병합된 '모집단위'가 두 열(D:E)에 걸친 공식 파일에서는 왼쪽이 계열·단과대,
  // 오른쪽이 실제 학과입니다. 왼쪽 열을 학과군 정보로 보존합니다.
  const field = explicitField >= 0 ? explicitField : departmentColumns.length > 1 ? departmentColumns[0] : -1;
  const core = all(/핵심.*과목|핵심권장|필수.*과목|필수이수/);
  const recommended = all(/권장.*과목|권장교과|추천.*과목/).filter(index => !core.includes(index));
  // '반영과목 핵심과목'처럼 상·하위 헤더가 합쳐진 열은 핵심과목 한 종류로만
  // 분류합니다. 그렇지 않으면 같은 과목이 반영과목에도 중복 저장됩니다.
  const reflected = all(/반영.*과목|반영교과|반영.*교과/)
    .filter(index => !core.includes(index) && !recommended.includes(index));
  const notes = all(/비고|참고|안내|유의|특이사항/);
  const occupied = new Set([...reflected, ...core, ...recommended, ...notes, university, region, department, field].filter(index => index >= 0));
  const genericCourse = all(/과목/).filter(index => !occupied.has(index));
  return {
    university,
    region,
    department,
    field,
    reflected,
    core,
    recommended: recommended.length ? recommended : genericCourse,
    notes,
  };
}
function cellCourseNames(row = [], indices = []) {
  return uniqueCourseNames(indices.flatMap(index => isRecommendationGuidanceText(row[index]) ? [] : splitCourseNames(row[index])));
}
function recommendationCourseVocabulary(rows = [], indices = []) {
  // 비고란 문장 탐색용 어휘에는 국어·수학·과학 같은 넓은 교과명은 넣지 않습니다.
  return specificRecommendationCourses(rows.flatMap(row => indices.flatMap(index => isRecommendationGuidanceText(row?.[index]) ? [] : splitCourseNames(row?.[index]))))
    .filter(course => !GENERIC_GUIDANCE_COURSES.has(courseMatchKey(course)))
    // 일부 대학은 핵심/권장 셀 자체에 '진로와 적성에 맞게 선택' 같은 안내문을
    // 적습니다. 안내문 조각을 과목명 어휘로 수집하면 비고란에서 '진로', '융합',
    // '과학 교과'가 가짜 과목으로 잡히므로 문장성 표현은 어휘에서 제외합니다.
    .filter(course => !/(?:권장|이수|선택|고려|적성|교과|영역|계열|구분|과목|포함|자신|필요|진로선택|융합선택)/.test(normalizeText(course)))
    .filter(course => !/^(?:진로|융합|일반|공통)$/.test(normalizeText(course)))
    .sort((left, right) => courseMatchKey(right).length - courseMatchKey(left).length);
}
function noteContextMatches(label = "", field = "", department = "") {
  const context = compactText(`${field} ${department}`);
  const key = compactText(label);
  if (/공과대학|공학계열|공학/.test(key)) return /공과대학|공학|공대/.test(context);
  if (/자연계열|자연과학/.test(key)) return /자연|과학|공학|의학|약학|간호|보건/.test(context);
  if (/인문계열|인문사회/.test(key)) return /인문|사회|경영|경제|법|교육/.test(context);
  return context.includes(key);
}
function applicableRecommendationNote(note = "", field = "", department = "") {
  let text = normalizeText(note);
  const conditional = /(공과대학|공학계열|자연계열|자연과학계열|인문계열|인문사회계열)(?:의)?\s*경우\s*([^.!?]+[.!?]?)/g;
  text = text.replace(conditional, (_, label, body) => noteContextMatches(label, field, department) ? body : " ");
  return text;
}
export function recommendedCoursesFromNotes(notes = [], vocabulary = [], { field = "", department = "" } = {}) {
  const text = (notes || [])
    // '전 모집단위'에 예시로 든 국어교육과 과목을 모든 학과의 권장과목으로
    // 오해하지 않습니다. 특정 과목을 직접 '포함'·'이수 권장'한 문장은 유지합니다.
    .filter(note => !(/학과별\s*특성/.test(normalizeText(note)) && /예\s*[-:：]/.test(normalizeText(note))))
    .map(note => applicableRecommendationNote(note, field, department))
    .filter(note => /권장|이수|필수|핵심/.test(note))
    .join(" ");
  if (!text) return [];
  // 과목 목록과 비고 문장 양쪽 모두 Ⅰ/Ⅱ/I/II를 1/2로 통일해야
  // 비고의 '미적분Ⅰ'이 어휘 목록의 '미적분I'과 정확히 연결됩니다.
  const compact = compactText(normalizeCourseNumerals(text));
  const occupied = [];
  const result = [];
  (vocabulary || []).forEach(course => {
    const key = courseMatchKey(course);
    if (!key || GENERIC_GUIDANCE_COURSES.has(key)) return;
    let position = compact.indexOf(key);
    let found = false;
    while (position >= 0) {
      const end = position + key.length;
      if (!occupied.some(([left, right]) => position >= left && end <= right)) {
        occupied.push([position, end]);
        found = true;
      }
      position = compact.indexOf(key, position + 1);
    }
    if (found) result.push(course);
  });
  return uniqueCourseNames(result);
}
function coalesceRecommendationRecords(records = []) {
  const map = new Map();
  records.forEach(record => {
    const key = recommendationIdentityKey(record);
    if (!key) return;
    if (!map.has(key)) {
      map.set(key, {
        ...record,
        reflected: [...(record.reflected || [])],
        core: [...(record.core || [])],
        recommended: [...(record.recommended || [])],
        noteRecommended: [...(record.noteRecommended || [])],
        notes: [...(record.notes || [])],
        sheets: [...(record.sheets || [])],
      });
      return;
    }
    const current = map.get(key);
    current.reflected = uniqueCourseNames([current.reflected, record.reflected]);
    current.core = uniqueCourseNames([current.core, record.core]);
    current.recommended = uniqueCourseNames([current.recommended, record.recommended]);
    current.noteRecommended = uniqueCourseNames([current.noteRecommended, record.noteRecommended]);
    current.notes = Array.from(new Set([...(current.notes || []), ...(record.notes || [])].filter(Boolean)));
    current.sheets = Array.from(new Set([...(current.sheets || []), ...(record.sheets || [])].filter(Boolean)));
    if (!current.region) current.region = record.region || "";
    if (!current.field) current.field = record.field || "";
  });
  return Array.from(map.values());
}
export async function parseRecommendedSubjectsWorkbook(file, onProgress = () => {}) {
  onProgress("대교협·어디가 권장과목 자료를 읽는 중입니다.");
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false, dense: true });
  const records = [];
  const skippedSheets = [];
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;
    // 병합 범위의 행 좌표와 배열 인덱스를 일치시키기 위해 빈 행도 유지합니다.
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true, blankrows: true });
    const headerRows = recommendationRowsWithMergedHeaders(rows, sheet["!merges"] || []);
    const header = recommendationHeaderSpec(headerRows);
    if (!header) {
      skippedSheets.push(sheetName);
      return;
    }
    const columns = recommendationColumnIndices(header.headers);
    const courseColumns = [...columns.reflected, ...columns.core, ...columns.recommended];
    if (columns.university < 0 || !courseColumns.length) {
      skippedSheets.push(sheetName);
      return;
    }
    const courseVocabulary = recommendationCourseVocabulary(rows.slice(header.end + 1), courseColumns);
    let lastUniversity = "";
    let lastRegion = "";
    let lastField = "";
    for (let index = header.end + 1; index < rows.length; index += 1) {
      const row = rows[index] || [];
      const explicitUniversity = cleanCell(row[columns.university]);
      if (explicitUniversity) lastUniversity = explicitUniversity;
      if (columns.region >= 0 && cleanCell(row[columns.region])) lastRegion = cleanCell(row[columns.region]);
      if (columns.field >= 0 && cleanCell(row[columns.field])) lastField = cleanCell(row[columns.field]);
      const university = explicitUniversity || lastUniversity;
      if (!university || /대학명|합계|총계|^계$/.test(university)) continue;
      // 데이터 행 자체가 D:E로 병합된 경우 오른쪽 학과 열은 비어 있습니다.
      // 이때는 왼쪽 모집단위 값을 학과명으로 사용하고, D/E가 분리된 행은 E를 우선합니다.
      const department = columns.department >= 0
        ? (cleanCell(row[columns.department]) || (columns.field >= 0 ? cleanCell(row[columns.field]) : ""))
        : "";
      const field = columns.field >= 0 ? (cleanCell(row[columns.field]) || lastField) : lastField;
      const reflected = cellCourseNames(row, columns.reflected);
      const core = cellCourseNames(row, columns.core);
      const recommended = cellCourseNames(row, columns.recommended);
      const courseGuidanceNotes = courseColumns.map(column => cleanCell(row[column])).filter(isRecommendationGuidanceText);
      const notes = Array.from(new Set([
        ...columns.notes.map(column => cleanCell(row[column])).filter(Boolean),
        ...courseGuidanceNotes,
      ]));
      const noteRecommended = recommendedCoursesFromNotes(notes, courseVocabulary, { field, department });
      if (!reflected.length && !core.length && !recommended.length && !noteRecommended.length && !notes.length) continue;
      records.push({
        region: columns.region >= 0 ? (cleanCell(row[columns.region]) || lastRegion) : lastRegion,
        university,
        department,
        field,
        reflected,
        core,
        recommended,
        noteRecommended,
        notes,
        sheets: [sheetName],
      });
    }
  });
  const merged = coalesceRecommendationRecords(records);
  if (!merged.length) throw new Error("권장과목 자료를 읽지 못했습니다. 어디가의 ‘2028학년도 권역별 대학별 권장과목(반영과목)’ XLSX 파일인지 확인해주세요.");
  onProgress(`권장과목 ${merged.length.toLocaleString()}개 대학·모집단위 연결 정보를 정리했습니다.`);
  return {
    schemaVersion: 4,
    source: {
      fileName: file.name,
      fileSize: file.size,
      parsedAt: new Date().toISOString(),
      reference: "대입정보포털 어디가 · 2028학년도 권역별 대학별 권장과목(반영과목)",
      referenceDate: "2025-09-30 대학 발표자료 탑재 기준",
      publishedDate: "2026-02-20",
      url: OFFICIAL_RECOMMENDED_SOURCE_URL,
    },
    stats: {
      records: merged.length,
      universities: unique(merged.map(item => universityIdentityKey(item.university, item.region || ""))).length,
      sheets: workbook.SheetNames.length,
      skippedSheets,
    },
    records: merged,
  };
}
export async function loadRecommendedSubjectData(force = false) {
  if (!force && recommendedSubjectCache) return recommendedSubjectCache;
  if (!force && recommendedSubjectCachePromise) return recommendedSubjectCachePromise;
  recommendedSubjectCachePromise = readStorage(RECOMMENDED_SUBJECT_STORAGE_KEY, null, { throwOnError: true }).then(value => {
    // v1·v2는 병합 헤더의 실제 학과/지역과 비고란 과목을 잃었고, v3는 선택 안내문을
    // 과목명으로 저장했습니다. 잘못 연결된 캐시 대신 수정 파서로 원본을 다시 반영합니다.
    recommendedSubjectCache = value && Number(value.schemaVersion) === 4 ? value : null;
    recommendedSubjectCachePromise = null;
    return recommendedSubjectCache;
  }).catch(error => {
    recommendedSubjectCachePromise = null;
    throw error;
  });
  return recommendedSubjectCachePromise;
}
function updateRecommendedSubjectCache(value) {
  recommendedSubjectCache = value;
  recommendedSubjectCachePromise = null;
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent("kd-recommended-subjects-updated", { detail: value || null }));
    } catch {
      // CustomEvent를 사용할 수 없는 오래된 환경에서는 다음 화면 진입 시 다시 읽습니다.
    }
  }
}
export function recommendationForUnit(recommendationData, university, region = "", department = "", indexes = null, targetField = "") {
  const records = recommendationData?.records || [];
  const universityKey = universityIdentityKey(university, region);
  const sameUniversity = indexes?.byUniversity?.get(universityKey)
    || records.filter(item => universityIdentityKey(item.university, item.region || "") === universityKey);
  const officialCandidates = sourceRows => {
    const targetFamily = recommendationDepartmentFamily(department);
    const exactDepartment = department
      ? sourceRows.filter(item => item.department && sameRecommendationDepartment(item.department, department))
      : [];
    const exactKeys = new Set(exactDepartment.map(item => recommendationIdentityKey(item)));
    const similarDepartment = department
      ? sourceRows.filter(item => {
        if (!item.department || exactKeys.has(recommendationIdentityKey(item)) || !unitSimilar(item.department, department)) return false;
        // '화학과'와 '화학공학과'처럼 글자는 겹치지만 학과군이 다른 모집단위를
        // 같은 대학 공식자료로 오연결하지 않습니다.
        const itemFamily = recommendationDepartmentFamily(item.department, item.field);
        // 목표 학과 자체의 학과군을 확정하지 못했을 때는 단어 일부가 겹친다는 이유만으로
        // 임의의 공식 학과 한 곳을 직접 연결하지 않습니다. 아래의 동일 대학·공식 계열
        // 과반 규칙으로 넘기는 편이 근거와 표시 모두 더 정확합니다.
        return !!targetFamily.key && itemFamily.key === targetFamily.key;
      })
      : [];
    const commonDepartment = sourceRows.filter(item => !item.department || ["전체","전모집단위","공통","대학전체","전학과"].includes(compactText(item.department)));
    const sameFamily = targetFamily.key
      ? sourceRows.filter(item => item.department && recommendationDepartmentFamily(item.department, item.field).key === targetFamily.key)
      : [];
    const familyDepartmentCount = new Set(sameFamily.map(item => recommendationDepartmentKey(item.department))).size;
    const unambiguousFamily = familyDepartmentCount === 1 ? sameFamily : [];
    return [
      ["모집단위 기준", exactDepartment],
      ["대학 발표 유사 모집단위 기준", similarDepartment],
      ["대학 공통 기준", commonDepartment],
      ["대학 발표 동일 학과군 기준", unambiguousFamily],
    ].map(([scope, rows]) => [scope, rows.filter(item => !isGenericRecommendationRecord(item))]);
  };
  let selected = officialCandidates(sameUniversity).find(([, rows]) => rows.length);
  // 대학명은 같지만 NAVI와 권장과목 파일의 지역·캠퍼스 문자열이 다를 수 있습니다.
  // 같은 대학 전체에서 '동일 학과' 공식 행이 한 캠퍼스로 유일하게 확정되는 경우에만
  // 지역을 넘어 복구합니다. 유사학과나 학과군으로는 캠퍼스를 넘지 않습니다.
  if (!selected && department) {
    const universityBase = universityBaseKey(university);
    const sameBaseUniversity = indexes?.byUniversityBase?.get(universityBase)
      || records.filter(item => universityBaseKey(item.university) === universityBase);
    const baseExact = sameBaseUniversity.filter(item => item.department
      && sameRecommendationDepartment(item.department, department)
      && !isGenericRecommendationRecord(item));
    const campuses = new Set(baseExact.map(item => universityIdentityKey(item.university, item.region || "")));
    if (baseExact.length && campuses.size === 1) selected = ["대학 동일 모집단위 공식자료 기준", baseExact];
  }
  // 주거환경학과처럼 XLSX에 학과 행은 없지만, 해당 대학이 공식 분류한 계열 행들이
  // 충분히 있는 경우가 있습니다. 이때 다른 대학 자료로 바로 넘어가지 않고 같은 대학의
  // 공식 계열에서 '과반 반복'된 과목만 보완 정보로 연결합니다. 한 행의 특이 과목이나
  // 서로 다른 공학/자연 계열을 단순 합집합으로 섞지는 않습니다.
  if (!selected) {
    const fieldHint = recommendationOfficialFieldHint(department, targetField);
    const fieldRows = fieldHint
      ? sameUniversity.filter(item => compactText(item.field).includes(compactText(fieldHint.token)) && !isGenericRecommendationRecord(item))
      : [];
    const consensus = recommendationDepartmentConsensus(fieldRows, { ratio: .5, minDepartments: 3, minMentions: 2 });
    if (consensus) {
      return {
        university,
        department,
        matchedDepartment: "",
        scope: `해당 대학 ${fieldHint.label} 계열 공식자료 공통 기준`,
        reflected: [],
        core: consensus.coreCourses,
        recommended: consensus.recommendedCourses,
        noteRecommended: [],
        commonCourses: consensus.commonCourses,
        referenceCount: consensus.departmentCount,
        consensusThreshold: consensus.threshold,
        strongConsensusThreshold: consensus.strongThreshold,
        consensusRatio: consensus.ratio,
        mentionCounts: consensus.mentionCounts,
        coreMentionCounts: consensus.coreMentionCounts,
        recommendedMentionCounts: consensus.recommendedMentionCounts,
        notes: [],
        source: recommendationData?.source || null,
        estimated: true,
        estimateKind: "university-field",
        officialFieldLabel: fieldHint.label,
        estimatedFrom: consensus.departments.slice(0, 4),
      };
    }
  }
  const connectedSource = selected?.[1] || [];
  // 특정 모집단위 연결에 실패했다고 다른 학과 권장과목을 합쳐 보여주지 않습니다.
  if (!connectedSource.length) return null;
  const reflected = uniqueCourseNames(connectedSource.flatMap(item => item.reflected || []));
  const core = uniqueCourseNames(connectedSource.flatMap(item => item.core || item.required || []));
  const recommended = uniqueCourseNames(connectedSource.flatMap(item => item.recommended || []));
  const noteRecommended = uniqueCourseNames(connectedSource.flatMap(item => item.noteRecommended || []));
  if (!reflected.length && !core.length && !recommended.length && !noteRecommended.length) return null;
  return {
    university,
    department,
    matchedDepartment: connectedSource[0]?.department || "",
    scope: selected[0],
    reflected,
    core,
    recommended,
    noteRecommended,
    notes: Array.from(new Set(connectedSource.flatMap(item => item.notes || []).filter(Boolean))).slice(0, 4),
    source: recommendationData?.source || null,
  };
}
const RECOMMENDATION_DEPARTMENT_FAMILIES = [
  ["computing", "컴퓨터·소프트웨어·AI", /컴퓨터|컴퓨팅|소프트웨어|전산|인공지능|데이터사이언|데이터과학|빅데이터|정보보호|정보보안|산업보안|사이버보안|스마트보안|클라우드|게임공|가상현실|디지털융합정보|정보융합|ict|it융합|ai학|ai소프트웨어|ai컴퓨터|ai데이터|ai융합|ai공|첨단컴퓨팅|지능형소프트웨어/],
  ["electrical", "전기·전자·반도체·통신", /전기|전자|반도체|디스플레이|정보통신|통신공|차세대통신|네트워크융합|제어계측|제어공|로봇|임베디드|iot/],
  ["mechanical", "기계·모빌리티·항공", /기계|자동차|미래차|모빌리티|항공우주|항공공|항공기계|항공운항|조선|해양공학|메카트로닉스|철도.*공|냉동공조/],
  ["chemical", "화학·신소재·에너지", /화공|화학.*공|신소재|재료|첨단소재|소재부품|에너지.*공|미래에너지|에너지융합|에너지시스템|에너지소재|에너지자원|고분자|나노.*공|나노소재|나노재료|배터리|이차전지|자원공|원자력|세라믹|금속.*재료|섬유.*공/],
  ["industrial", "산업·시스템공학", /산업.*공|시스템경영|경영공학|기술경영|품질경영|스마트팩토리/],
  ["architecture", "건축·도시·토목·환경공학", /건축|도시|토목|환경공|사회기반|건설|교통공|스마트시티|조경|안전공|소방안전|소방방재|재난관리|방재공/],
  ["agriculture", "농생명·식품·산림", /농업|농학|농생명|원예|산림|식품|축산|동물자원|동물산업|동물응용|반려동물|식물자원|식물생산|응용식물|생물자원|생명자원|스마트그린자원|스마트팜|수산|해양생명/],
  ["bio", "생명·바이오·의공학", /생명|바이오|의생명|생물|유전|미생물|생화학|분자의약|약과학|의공|의료공|바이오메디컬|제약.*공/],
  ["medical", "의·치·한·약·수의학", /의예|의학|치의|한의|약학|수의/],
  ["nursing", "간호", /간호/],
  ["health", "보건·재활", /물리치료|작업치료|방사선|임상병리|보건|응급구조|치위생|안경광학|재활|언어치료|의료경영|운동처방|운동건강|건강관리/],
  ["math", "수학·통계", /수학|통계|금융수학|경제수학|응용수리|수리과학/],
  ["physics", "물리·천문", /물리학|응용물리|전자물리|나노물리|물리교육|물리과학|^물리$|천문|우주과학/],
  // 화학공학·화학생명공학은 위 chemical에서 먼저 분류됩니다. 여기서는 화학과,
  // 응용·나노·의약·환경화학처럼 학교마다 이름이 다른 순수/응용화학 계열을 함께 묶습니다.
  ["chemistry", "화학", /화학/],
  ["earth", "지구·환경과학", /지구|지질|대기|해양학|환경과학|지구환경|기상/],
  ["engineering", "공학 일반", /공학|공과대|융합공|스마트.*공/],
  ["economics", "경제·금융·통상", /경제|금융|국제통상|글로벌통상|무역경제/],
  ["business", "경영·회계·물류", /경영|비즈니스|비지니스|회계|세무|무역|유통|물류|보험|부동산/],
  ["law_public", "법·행정·정치", /법학|법무|행정|정치외교|국제관계|경찰|소방행정|국가안보|밀리터리|군사|국방/],
  ["social", "사회·복지·심리", /사회복지|생활복지|사회학|심리|상담|아동|청소년|가족|노인|문화인류|인류학|국제개발|고용서비스|휴먼서비스/],
  ["media", "미디어·언론·콘텐츠", /미디어|언론|신문방송|광고홍보|콘텐츠|커뮤니케이션|영상제작/],
  ["humanities", "언어·문학·역사·철학", /국어국문|한국어문|영어영문|영어산업|영미학|영어과|중어중문|중국학|중국어|일어일문|일본학|일본어|독어독문|독일|불어불문|프랑스|노어노문|러시아|유라시아|서어서문|스페인|통번역|외국어|문예창작|국어교육|영어교육|사학|역사|철학|종교|신학|불교|문헌정보|고고|언어학|문화유산/],
  ["tourism", "관광·호텔·항공서비스", /관광|호텔|외식|항공서비스/],
  ["education", "교육·교직", /교육|교직|초등|유아교육|특수교육/],
  ["design", "디자인·미술·패션", /디자인|미술|조형|패션/],
  ["sports", "체육·스포츠", /체육|스포츠|레저|태권도|경기지도|골프/],
  ["arts", "음악·공연·예술", /음악|무용|연극|영화|공연|예술/],
];

export function recommendationDepartmentKey(department = "") {
  return compactUnit(department);
}

export function recommendationDepartmentKeys(department = "") {
  const text = normalizeText(department)
    .replace(/[（]/g, "(").replace(/[）]/g, ")")
    .replace(/\([^)]*\)/g, " ")
    .replace(/계열|모집단위|전공자율선택제|자율전공/g, " ");
  // '화학과→화학', '영어산업학과→영어산업', '컴퓨터공학과→컴퓨터공학'처럼
  // 어근에 포함된 '학' 때문에 한 가지 접미사 규칙만으로는 학과/학부/전공 변형을
  // 모두 맞출 수 없습니다. 보수적인 후보키들의 교집합으로 동일 학과를 판정합니다.
  return unique([
    recommendationDepartmentKey(department),
    compactText(text.replace(/(?:학과|학부|전공)$/g, "")),
    compactText(text.replace(/(?:과|부|전공)$/g, "")),
  ].filter(Boolean));
}

function sameRecommendationDepartment(left = "", right = "") {
  const rightKeys = new Set(recommendationDepartmentKeys(right));
  return recommendationDepartmentKeys(left).some(key => rightKeys.has(key));
}

export function recommendationDepartmentFamily(department = "", field = "") {
  const key = compactText(department);
  const matched = RECOMMENDATION_DEPARTMENT_FAMILIES.find(([, , pattern]) => pattern.test(key));
  if (matched) return { key: matched[0], label: matched[1] };
  const normalizedField = compactText(field);
  return { key: "", label: normalizedField || "동일 계열" };
}

export function recommendationOfficialFieldHint(department = "", field = "") {
  const text = compactText(`${department} ${field}`);
  // 현재는 공식 XLSX의 대분류가 명확하고 학과 의미가 안정적인 생활과학 계열만
  // 보수적으로 보완합니다. '인문/자연' 같은 NAVI 대계열만으로는 연결하지 않습니다.
  if (/주거환경|주거학|생활과학|의류|의상|소비자|아동가족/.test(text)) {
    return { token: "생활과학", label: "생활과학" };
  }
  return null;
}

function recommendationCoursePriority(courseKey = "") {
  if (/^미적분/.test(courseKey)) return 0;
  if (courseKey === "기하") return 1;
  if (/확률.*통계/.test(courseKey)) return 2;
  if (/물리/.test(courseKey)) return 3;
  if (/화학/.test(courseKey)) return 4;
  if (/생명|생물/.test(courseKey)) return 5;
  if (/지구/.test(courseKey)) return 6;
  if (/정보|인공지능|데이터/.test(courseKey)) return 7;
  return 20;
}

export function recommendationConsensus(pool = [], targetUniversityKey = "", { ratio = .25, minUniversities = 4, minMentions = 2, maxCourses = Infinity } = {}) {
  const universityCourses = new Map();
  const universityCourseRoles = new Map();
  const courseNames = new Map();
  const universityNames = new Map();
  const broadExcluded = new Set(["국어", "수학", "영어", "사회", "과학", "제2외국어", "한문"].map(courseMatchKey));
  pool.forEach(item => {
    const universityKey = universityIdentityKey(item.university, item.region || "");
    if (!universityKey || universityKey === targetUniversityKey) return;
    if (isGenericRecommendationRecord(item)) return;
    const coreCourses = specificRecommendationCourses(item.core || item.required || [])
      .filter(course => !broadExcluded.has(courseMatchKey(course)));
    const recommendedCourses = specificRecommendationCourses([item.reflected || [], item.recommended || [], item.noteRecommended || []])
      .filter(course => !broadExcluded.has(courseMatchKey(course)));
    const courses = uniqueCourseNames([coreCourses, recommendedCourses]);
    // 과목을 발표하지 않은 빈 행은 '권장하지 않은 대학'이 아닙니다. 실제로 과목을
    // 제시한 대학들만 분모에 넣어야 '자료 제시 대학 중 과반'이 정확히 계산됩니다.
    if (!courses.length) return;
    if (!universityCourses.has(universityKey)) universityCourses.set(universityKey, new Set());
    if (!universityCourseRoles.has(universityKey)) universityCourseRoles.set(universityKey, new Map());
    universityNames.set(universityKey, item.university);
    const roles = universityCourseRoles.get(universityKey);
    coreCourses.forEach(course => roles.set(courseMatchKey(course), "core"));
    recommendedCourses.forEach(course => {
      const key = courseMatchKey(course);
      if (!roles.has(key)) roles.set(key, "recommended");
    });
    courses.forEach(course => {
      const courseKey = courseMatchKey(course);
      if (!courseKey) return;
      universityCourses.get(universityKey).add(courseKey);
      if (!courseNames.has(courseKey)) courseNames.set(courseKey, course);
    });
  });
  const universityCount = universityCourses.size;
  if (universityCount < minUniversities) return null;
  const counts = new Map();
  universityCourses.forEach(courses => courses.forEach(courseKey => counts.set(courseKey, (counts.get(courseKey) || 0) + 1)));
  const coreCounts = new Map();
  const recommendedCounts = new Map();
  universityCourseRoles.forEach(roles => roles.forEach((role, courseKey) => {
    const map = role === "core" ? coreCounts : recommendedCounts;
    map.set(courseKey, (map.get(courseKey) || 0) + 1);
  }));
  // 과반만 남기던 기존 기준은 학과별 과목 수 차이가 지나치게 컸습니다.
  // 4개 이상 대학을 표본으로 하고, 최소 2개 대학이면서 표본의 25% 이상이 반복
  // 제시한 과목을 보완 자료로 채택합니다. 단 1개 대학만의 특이 과목은 제외합니다.
  const threshold = Math.max(minMentions, Math.ceil(universityCount * ratio));
  const strongThreshold = Math.max(3, Math.ceil(universityCount * .5));
  const courses = Array.from(counts.entries())
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1] || recommendationCoursePriority(a[0]) - recommendationCoursePriority(b[0]) || String(courseNames.get(a[0])).localeCompare(String(courseNames.get(b[0])), "ko"))
    .slice(0, Number.isFinite(maxCourses) ? maxCourses : undefined)
    .map(([courseKey]) => courseNames.get(courseKey));
  if (!courses.length) return null;
  return {
    courses,
    universityCount,
    threshold,
    strongThreshold,
    ratio,
    coreCourses: courses.filter(course => (coreCounts.get(courseMatchKey(course)) || 0) > (recommendedCounts.get(courseMatchKey(course)) || 0)),
    recommendedCourses: courses.filter(course => (coreCounts.get(courseMatchKey(course)) || 0) <= (recommendedCounts.get(courseMatchKey(course)) || 0)),
    commonCourses: courses.filter(course => (counts.get(courseMatchKey(course)) || 0) >= strongThreshold),
    mentionCounts: Object.fromEntries(Array.from(counts.entries()).map(([courseKey, count]) => [courseNames.get(courseKey), count])),
    coreMentionCounts: Object.fromEntries(Array.from(coreCounts.entries()).map(([courseKey, count]) => [courseNames.get(courseKey), count])),
    recommendedMentionCounts: Object.fromEntries(Array.from(recommendedCounts.entries()).map(([courseKey, count]) => [courseNames.get(courseKey), count])),
    universities: Array.from(universityNames.values()),
  };
}

export function recommendationDepartmentConsensus(pool = [], { ratio = .5, minDepartments = 3, minMentions = 2, maxCourses = Infinity } = {}) {
  const departmentCourses = new Map();
  const departmentCourseRoles = new Map();
  const courseNames = new Map();
  const departmentNames = new Map();
  const broadExcluded = new Set(["국어", "수학", "영어", "사회", "과학", "제2외국어", "한문"].map(courseMatchKey));
  pool.forEach(item => {
    const departmentKey = recommendationIdentityKey(item);
    if (!departmentKey || isGenericRecommendationRecord(item)) return;
    const coreCourses = specificRecommendationCourses(item.core || item.required || [])
      .filter(course => !broadExcluded.has(courseMatchKey(course)));
    const recommendedCourses = specificRecommendationCourses([item.reflected || [], item.recommended || [], item.noteRecommended || []])
      .filter(course => !broadExcluded.has(courseMatchKey(course)));
    const courses = uniqueCourseNames([coreCourses, recommendedCourses]);
    if (!courses.length) return;
    if (!departmentCourses.has(departmentKey)) departmentCourses.set(departmentKey, new Set());
    if (!departmentCourseRoles.has(departmentKey)) departmentCourseRoles.set(departmentKey, new Map());
    departmentNames.set(departmentKey, item.department || item.field || "모집단위");
    const roles = departmentCourseRoles.get(departmentKey);
    coreCourses.forEach(course => roles.set(courseMatchKey(course), "core"));
    recommendedCourses.forEach(course => {
      const key = courseMatchKey(course);
      if (!roles.has(key)) roles.set(key, "recommended");
    });
    courses.forEach(course => {
      const key = courseMatchKey(course);
      if (!key) return;
      departmentCourses.get(departmentKey).add(key);
      if (!courseNames.has(key)) courseNames.set(key, course);
    });
  });
  const departmentCount = departmentCourses.size;
  if (departmentCount < minDepartments) return null;
  const counts = new Map();
  departmentCourses.forEach(courses => courses.forEach(key => counts.set(key, (counts.get(key) || 0) + 1)));
  const coreCounts = new Map();
  const recommendedCounts = new Map();
  departmentCourseRoles.forEach(roles => roles.forEach((role, key) => {
    const target = role === "core" ? coreCounts : recommendedCounts;
    target.set(key, (target.get(key) || 0) + 1);
  }));
  const threshold = Math.max(minMentions, Math.ceil(departmentCount * ratio));
  const strongThreshold = threshold;
  const courses = Array.from(counts.entries())
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1] || recommendationCoursePriority(a[0]) - recommendationCoursePriority(b[0]) || String(courseNames.get(a[0])).localeCompare(String(courseNames.get(b[0])), "ko"))
    .slice(0, Number.isFinite(maxCourses) ? maxCourses : undefined)
    .map(([key]) => courseNames.get(key));
  if (!courses.length) return null;
  return {
    courses,
    departmentCount,
    threshold,
    strongThreshold,
    ratio,
    coreCourses: courses.filter(course => (coreCounts.get(courseMatchKey(course)) || 0) >= (recommendedCounts.get(courseMatchKey(course)) || 0)),
    recommendedCourses: courses.filter(course => (coreCounts.get(courseMatchKey(course)) || 0) < (recommendedCounts.get(courseMatchKey(course)) || 0)),
    commonCourses: [...courses],
    mentionCounts: Object.fromEntries(courses.map(course => [course, counts.get(courseMatchKey(course)) || 0])),
    coreMentionCounts: Object.fromEntries(courses.map(course => [course, coreCounts.get(courseMatchKey(course)) || 0])),
    recommendedMentionCounts: Object.fromEntries(courses.map(course => [course, recommendedCounts.get(courseMatchKey(course)) || 0])),
    departments: Array.from(departmentNames.values()),
  };
}

// 성능 개선(전반적인 렉): 위 estimateRecommendationForUnit()을 처음 추가했을 때는 호출될 때마다
// recommendationData.records 전체(수천 건 가능)를 여러 번 filter()해서 훑었습니다. 이 함수는
// enriched useMemo 안에서 전체 모집단위(6,373건)마다 호출되므로, "6,373 × 자료 전체 스캔"이
// 되어 버벅임의 새로운 원인이 됐습니다. 학과명·계열 자료를 한 번만 Map으로 미리 묶어두고
// (recommendedData가 바뀔 때만 다시 계산), 각 모집단위에서는 그 Map에서 바로 꺼내 쓰게 바꿨습니다.
export function buildRecommendationEstimateIndexes(recommendationData) {
  const records = recommendationData?.records || [];
  const byUniversity = new Map();
  const byUniversityBase = new Map();
  const byDepartment = new Map();
  const byFamily = new Map();
  const byField = new Map();
  records.forEach(item => {
    const universityKey = universityIdentityKey(item.university, item.region || "");
    if (universityKey) {
      if (!byUniversity.has(universityKey)) byUniversity.set(universityKey, []);
      byUniversity.get(universityKey).push(item);
    }
    const universityBase = universityBaseKey(item.university);
    if (universityBase) {
      if (!byUniversityBase.has(universityBase)) byUniversityBase.set(universityBase, []);
      byUniversityBase.get(universityBase).push(item);
    }
    recommendationDepartmentKeys(item.department).forEach(deptKey => {
      if (!byDepartment.has(deptKey)) byDepartment.set(deptKey, []);
      byDepartment.get(deptKey).push(item);
    });
    const family = recommendationDepartmentFamily(item.department, item.field);
    if (family.key) {
      if (!byFamily.has(family.key)) byFamily.set(family.key, []);
      byFamily.get(family.key).push(item);
    }
    const fieldKey = compactText(item.field);
    if (fieldKey) {
      if (!byField.has(fieldKey)) byField.set(fieldKey, []);
      byField.get(fieldKey).push(item);
    }
  });
  return { byUniversity, byUniversityBase, byDepartment, byFamily, byField, source: recommendationData?.source || null };
}
export function estimateRecommendationForUnit(indexes, university, region = "", department = "", field = "") {
  if (!indexes || (!indexes.byDepartment.size && !indexes.byFamily.size && !indexes.byField.size)) return null;
  const targetKey = universityIdentityKey(university, region);
  const deptKeys = recommendationDepartmentKeys(department);
  const fieldKey = compactText(field);
  const family = recommendationDepartmentFamily(department, field);
  const candidates = [
    { pool: Array.from(new Set(deptKeys.flatMap(deptKey => indexes.byDepartment.get(deptKey) || []))), matchedBy: "department", ratio: .25, minUniversities: 4, minMentions: 2, maxCourses: Infinity },
    { pool: family.key ? (indexes.byFamily.get(family.key) || []) : [], matchedBy: "family", ratio: .25, minUniversities: 4, minMentions: 2, maxCourses: Infinity },
    { pool: fieldKey ? (indexes.byField.get(fieldKey) || []) : [], matchedBy: "field", ratio: .35, minUniversities: 12, minMentions: 5, maxCourses: Infinity },
  ];
  let selected = null;
  for (const candidate of candidates) {
    const consensus = recommendationConsensus(candidate.pool, targetKey, candidate);
    if (consensus) { selected = { ...candidate, consensus }; break; }
  }
  if (!selected) return null;
  const { consensus, matchedBy } = selected;
  const scope = matchedBy === "department"
    ? "동일 학과 여러 대학 공통 권장과목"
    : matchedBy === "family"
      ? `${family.label} 학과군 여러 대학 공통 권장과목`
      : "동일 계열 여러 대학 공통 권장과목";
  return {
    university,
    department,
    matchedDepartment: matchedBy === "department" ? department : "",
    scope,
    reflected: [],
    core: consensus.coreCourses,
    recommended: consensus.recommendedCourses,
    noteRecommended: [],
    commonCourses: consensus.commonCourses,
    referenceCount: consensus.universityCount,
    consensusThreshold: consensus.threshold,
    strongConsensusThreshold: consensus.strongThreshold,
    consensusRatio: consensus.ratio,
    mentionCounts: consensus.mentionCounts,
    coreMentionCounts: consensus.coreMentionCounts,
    recommendedMentionCounts: consensus.recommendedMentionCounts,
    notes: [],
    source: indexes.source,
    estimated: true,
    estimatedFrom: consensus.universities.slice(0, 3),
  };
}
export function recommendationProgress(recommendation, studentSubjects = []) {
  if (!recommendation) return null;
  const normalizedStudentSubjects = uniqueStudentSubjects(studentSubjects);
  const core = uniqueCourseNames(recommendation.core?.length ? recommendation.core : recommendation.required || []);
  const coreKeys = new Set(core.map(courseMatchKey));
  const recommended = uniqueCourseNames(recommendation.recommended || []).filter(course => !coreKeys.has(courseMatchKey(course)));
  const recommendedKeys = new Set([...coreKeys, ...recommended.map(courseMatchKey)]);
  const noteRecommended = uniqueCourseNames(recommendation.noteRecommended || []).filter(course => !recommendedKeys.has(courseMatchKey(course)));
  const occupied = new Set([...recommendedKeys, ...noteRecommended.map(courseMatchKey)]);
  const reflected = uniqueCourseNames(recommendation.reflected || []).filter(course => !occupied.has(courseMatchKey(course)));
  const universityFieldEstimate = recommendation.estimateKind === "university-field";
  const courseGroups = universityFieldEstimate
    ? [["동일 대학·계열 공통 핵심과목", core], ["동일 대학·계열 공통 권장과목", recommended]]
    : recommendation.estimated
    ? [["여러 대학 공통 핵심과목", core], ["여러 대학 공통 권장과목", recommended]]
    : [["핵심과목", core], ["권장과목", recommended], ["비고란 이수 권장", noteRecommended], ["반영과목", reflected]];
  const targets = uniqueCourseNames(courseGroups.flatMap(([, courses]) => courses));
  const matched = targets.filter(course => studentCourseMatch(normalizedStudentSubjects, course));
  return {
    total: targets.length,
    matched: matched.length,
    studentCourseCount: normalizedStudentSubjects.length,
    matchedCourses: matched,
    missingCourses: targets.filter(course => !matched.includes(course)),
    courseGroups: courseGroups.filter(([, courses]) => courses.length),
    ratio: targets.length ? matched.length / targets.length : null,
    estimated: !!recommendation.estimated,
    estimateKind: recommendation.estimateKind || "",
    officialFieldLabel: recommendation.officialFieldLabel || "",
    estimatedFrom: recommendation.estimatedFrom || [],
    commonCourses: recommendation.commonCourses || [],
    referenceCount: recommendation.referenceCount || 0,
    consensusThreshold: recommendation.consensusThreshold || 0,
    strongConsensusThreshold: recommendation.strongConsensusThreshold || 0,
    mentionCounts: recommendation.mentionCounts || {},
  };
}
function findEnrichedWorkspaceEntry(enriched = [], item = {}) {
  const identity = universityIdentityKey(item.university, item.region || "");
  const department = compactText(item.department);
  if (!department) return null;
  const matches = enriched.filter(({ row }) => universityIdentityKey(row?.[3], row?.[1]) === identity
    && [row?.[4], row?.[5]].some(value => compactText(value) === department));
  return matches.length === 1 ? matches[0] : null;
}
export function buildEnrichedWorkspaceIndex(enriched = []) {
  const index = new Map();
  (enriched || []).forEach(entry => {
    const row = entry?.row;
    const identity = universityIdentityKey(row?.[3], row?.[1]);
    unique([row?.[4], row?.[5]].map(compactText).filter(Boolean)).forEach(department => {
      const key = `${identity}|${department}`;
      if (!index.has(key)) index.set(key, entry);
      else index.set(key, null); // 중복이면 잘못된 항목을 임의 선택하지 않습니다.
    });
  });
  return index;
}
function indexedEnrichedWorkspaceEntry(index, item = {}) {
  const identity = universityIdentityKey(item.university, item.region || "");
  const department = compactText(item.department);
  return department ? (index?.get(`${identity}|${department}`) || null) : null;
}
function trackIdentity(value) {
  return compactText(normalizeText(value).replace(/^(?:학생부)?(?:교과|종합)\s*[·:：]\s*/, ""));
}
export function supportOptionsForFavorite(data, favorite = {}) {
  const entry = findEnrichedWorkspaceEntry(coalesceNaviRecords(data?.records || []).map(row=>({row})), favorite);
  if (!entry) return [];
  const row=entry.row;
  return [["교과",7],["종합",8]].flatMap(([admissionType,index])=>(row[index]||[]).filter(value=>value?.[0]).map(value=>({university:row[3],region:row[1],department:row[5],field:row[6],admissionType,track:value[0],source:"즐겨찾기 전형 선택"})));
}

// Shared counseling lookup: index once for all favorites, reuse NAVI's exact rules.
export function buildCounselingFactIndex(data, recommendedData) {
  return { workspace:buildEnrichedWorkspaceIndex(coalesceNaviRecords(data?.records || []).map(row=>({row}))), recommendations:buildRecommendationEstimateIndexes(recommendedData) };
}
export function counselingFactsForFavorite({favorite,data={},student={},recommendedData,indexes}) {
  if(!favorite.department || /^(전체|대학 전체)$/.test(favorite.department))return {needsDepartment:true,minimums:[],progress:null};
  const entry=indexedEnrichedWorkspaceEntry(indexes.workspace,favorite);
  const target={...favorite,field:favorite.field || entry?.row?.[6] || ''};
  const recommendation=recommendationForUnit(recommendedData,target.university,target.region,target.department,indexes.recommendations,target.field)
    || estimateRecommendationForUnit(indexes.recommendations,target.university,target.region,target.department,target.field);
  const category=comparisonType(favorite.admissionType || '');
  const type=['교과','종합','논술','실기'].includes(category)?category:'';
  const rawType=String(favorite.admissionType || '');
  const specificTrack=favorite.track || favorite.detailType || ((favorite.favoriteKind==='전형'||favorite.source==='admission'||/^(?:학생부)?(?:교과|종합)\s*\(.+\)$/.test(rawType))&&!/^(?:학생부)?(?:교과|종합)$/.test(rawType)?minimumTrackKey(rawType):'');
  let candidates=entry ? [['교과',7],['종합',8]].flatMap(([admissionType,i])=>(entry.row[i]||[]).map(item=>({admissionType,track:item[0]}))) : [];
  candidates.push(...catalogRowsForTarget(student.minimumCatalogRows||[],target,student.admissionYear,universityIdentityKey).map(row=>({admissionType:row.admissionType,track:row.track})));
  candidates.push(...(student.minimumRows||[]).filter(row=>universityIdentityKey(row.university,row.region)===universityIdentityKey(target.university,target.region)&&minimumScopeRank(row.department,target.department,target.field)>=0).map(row=>({admissionType:comparisonType(row.admissionType||row.track),track:row.track})));
  candidates.push(...(data.minimums||[]).filter(row=>universityIdentityKey(row[1],row[0])===universityIdentityKey(target.university,target.region)&&minimumScopeRank(row[5],target.department,target.field)>=0).map(row=>({admissionType:comparisonType(row[2]),track:row[3]})));
  if(specificTrack){
    const matches=candidates.filter(row=>minimumTrackKey(row.track)===minimumTrackKey(specificTrack));
    candidates=matches.length?matches:[{admissionType:type,track:specificTrack}];
  }
  const seen=new Set();
  const minimums=candidates.filter(row=>{
    const key=`${comparisonType(row.admissionType)}|${minimumTrackKey(row.track)}`;
    if(!row.track || (type&&comparisonType(row.admissionType)!==type) || seen.has(key))return false;
    seen.add(key);return true;
  }).map(row=>({...row,evaluation:resolveMinimumLink({target:{...target,...row},data,student,identity:universityIdentityKey,evaluateMinimum:r=>evaluateNaviMinimumSafe(r,student),ambiguousType:true}).evaluation}));
  return {minimums,progress:recommendationProgress(recommendation,student.subjects||[])};
}

function supportPlanItemKey(item = {}) {
  return `${universityIdentityKey(item.university, item.region || "")}|${compactText(item.department)}|${compactText(item.admissionType)}|${compactText(item.track)}`;
}
function compareItemKey(item = {}) {
  return `${universityIdentityKey(item.university, item.region || "")}|${compactText(item.department)}`;
}
function matchingMinimumStatus(minimums = [], evaluations = [], admissionType = "", track = "") {
  const key = trackIdentity(track);
  if (!key) return "unlinked";
  const matches = minimums.map((row, index) => ({ row, evaluation: evaluations[index] }))
    .filter(({ row }) => minimumAppliesToAdmission(row, admissionType) && (trackIdentity(row?.[3]) === key || (row.catalogRule?.trackAliases || '').split('|').some(name=>trackIdentity(name)===key)));
  if (!matches.length) return "unlinked";
  const statuses = matches.map(({ evaluation }) => evaluation?.status || "manual");
  if (statuses.includes("unsatisfied")) return "unsatisfied";
  if (statuses.some(status => !["satisfied", "no-minimum", "unavailable"].includes(status))) return "manual";
  if (statuses.includes("unavailable")) return "unavailable";
  return statuses.every(status => status === "no-minimum") ? "no-minimum" : "satisfied";
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

const loadBetaData = loadSusiNaviBetaData;
const updateBetaCache = updateSusiNaviBetaCache;
function differenceLabel(student, cutoff) {
  const band = supportBandValue(student, cutoff);
  if (!band) return null;
  const diff = band.diff;
  return { value: diff, text: `${diff > 0 ? "+" : ""}${diff.toFixed(2)}`, favorable: diff <= 0 };
}

// Colors now come from admissionMetrics.js (SUPPORT_BAND_META) so this list, the 전형 비교표,
// and the 지원 구성 카드 all show the exact same 상향/소신/적정/안정/하향 palette.
const SUPPORT_META = SUPPORT_BAND_META;
// 1번 요청: 전형 구성 요약 배지 색상. trackAccentKey()가 반환하는 academic/general/essay/talent/other
// 각각에 색을 지정해, 표(AdmissionComparison)·카드(SupportDecisionCard)와 톤을 맞춥니다.
const ADMISSION_TYPE_CHIP_META = {
  academic: { color: "#1f5f9e", background: "#eaf3fc", borderColor: "#b9d7f0" },
  general: { color: "#6a3fa0", background: "#f3edfb", borderColor: "#d7c3ee" },
  essay: { color: "#a3631b", background: "#fdf1e2", borderColor: "#eecfa0" },
  talent: { color: "#1c7a63", background: "#e8f7f1", borderColor: "#b7e2d1" },
  other: { color: "#5c6577", background: "#f0f2f6", borderColor: "#d4d9e2" },
};
const RESULT_SORT_LABELS = {
  default: "기본 정렬",
  cut50: "50%컷 낮은순",
  cut70: "70%컷 낮은순",
  supportUp: "상향 → 하향",
  supportDown: "하향 → 상향",
};

function supportBand(student, cutoff) {
  const result = supportBandValue(student, cutoff);
  return result ? { ...result, ...SUPPORT_META[result.label] } : null;
}

function favoriteMatches(item, row) {
  if (!item || !row) return false;
  const itemRegion = item.region || (item.campus && item.campus !== "단일" ? item.campus : "");
  const sameUniversity = sameUniversityCampus(item.university, itemRegion, row[3], row[1]);
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
function naviMinimumAdmissionRow(row) {
  if (!row) return null;
  return {
    university: row[1] || "",
    track: row[3] || row[2] || "",
    department: row[5] || "",
    requiredSubjects: row[6] || "",
    requiredSubjectCount: row[7] ?? null,
    requiredSum: row[8] || "",
    note: [row[10], row[11], row[9] != null ? `평균등급 ${row[9]}` : ""].filter(Boolean).join(" · "),
  };
}
// 1순위(최저 자료 통합): 검색 결과 카드가 NAVI 최저 자료만 보고, 학교 자체 "대입 전형" 진단
// 자료(학생별 minimumRows)는 전형별 비교표(admissionComparison.js)에서만 반영되던 문제를
// 고칩니다. 같은 minimumScopeRank 기준(학생 지원연도 → 대학·캠퍼스 → 전형 → 모집단위)으로
// 학교 자료를 먼저 찾고, 있으면 그걸로 판정합니다(학교 자료가 NAVI보다 우선). evaluateNaviMinimumSafe는
// 이미 배열(NAVI 행)과 객체(학교 자료 행)를 모두 처리하므로 판정 함수 자체는 바꾸지 않습니다.
function findStoredMinimumForUnit(student, { university, region, department, field, admissionType, track }) {
  const rows = student?.minimumRows;
  if (!rows?.length) return null;
  const trackKey = trackIdentity(track);
  const candidates = rows.filter(value => {
    if (!sameUniversityCampus(value.university, value.region, university, region)) return false;
    const type = comparisonType(value.admissionType || value.track);
    if (["교과", "종합"].includes(type) && admissionType && type !== comparisonType(admissionType)) return false;
    if (trackKey && value.track && trackIdentity(value.track) !== trackKey) return false;
    return minimumScopeRank(value.department, department, field) >= 0;
  });
  if (!candidates.length) return null;
  const rank = value => minimumScopeRank(value.department, department, field);
  const bestRank = Math.max(...candidates.map(rank));
  const best = candidates.filter(value => rank(value) === bestRank);
  return best.length === 1 ? best[0] : null;
}
function evaluateNaviMinimum(row, selectedStudent, unit) {
  if(unit)return resolveMinimumLink({target:unit,student:selectedStudent,data:{minimums:row&&!row.catalogRule?[row]:[]},identity:universityIdentityKey,evaluateMinimum:value=>evaluateNaviMinimumSafe(value,selectedStudent)}).evaluation;
  return evaluateNaviMinimumSafe(row, selectedStudent);
}
function minimumAppliesToAdmission(row, admissionType = "") {
  if(row?.catalogRule)return !admissionType || row.catalogRule.admissionType===admissionType;
  const type = compactText(admissionType);
  if (!type || !row) return true;
  const rowType = compactText(`${row[2] || ""} ${row[3] || ""}`);
  if (!rowType) return true;
  if (type.includes("교과")) return /교과|지역균형|추천|학교장/.test(rowType);
  if (type.includes("종합")) return /종합|학종|서류/.test(rowType);
  return true;
}

function minimumEvaluationSummary(evaluations = []) {
  const valid = evaluations.filter(Boolean);
  return {
    total: valid.length,
    unsatisfied: valid.filter(item => item.status === "unsatisfied").length,
    satisfied: valid.filter(item => item.status === "satisfied").length,
    unavailable: valid.filter(item => item.status === "unavailable").length,
    manual: valid.filter(item => item.status === "manual").length,
    noMinimum: valid.filter(item => item.status === "no-minimum").length,
  };
}
function naviMinimumStatusMeta(status) {
  if (status === "unsatisfied") return { label: "최저 미도달", style: ui.minimumStatusDanger };
  if (status === "satisfied") return { label: "최저 충족", style: ui.minimumStatusSuccess };
  if (status === "unavailable") return { label: "성적 미입력", style: ui.minimumStatusNeutral };
  if (status === "manual") return { label: "조건 확인", style: ui.minimumStatusWarning };
  if (status === "no-minimum") return { label: "최저 없음", style: ui.minimumStatusNeutral };
  if (status === "unlinked") return { label: "최저 자료 미연결", style: ui.minimumStatusWarning };
  return null;
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
function schoolCaseTrend(caseRows, university, region = "", department = "", admissionType = "", strict = false) {
  const identity = universityIdentityKey(university, region);
  const base = universityBaseKey(university);
  const universityRows = (caseRows || []).filter(row => {
    const rowUniversity = row?.university || row?.universityNormalized;
    if (!rowUniversity) return false;
    return universityIdentityKey(rowUniversity, row?.region) === identity;
  });
  const departmentRows = department
    ? universityRows.filter(row => strict ? compactText(row?.department) === compactText(department) : unitSimilar(row?.department, department))
    : [];
  let scopedRows = strict && department ? departmentRows : departmentRows.length ? departmentRows : universityRows;
  if (admissionType) {
    const typeKey = compactText(admissionType);
    const typeRows = scopedRows.filter(row => {
      if (strict) return trackIdentity(row?.detailType || row?.admissionType) === trackIdentity(admissionType);
      const rowType = compactText(`${row?.admissionType || ""} ${row?.detailType || ""}`);
      if (/교과/.test(typeKey)) return /교과/.test(rowType);
      if (/종합/.test(typeKey)) return /종합|학종|서류/.test(rowType);
      return rowType.includes(typeKey) || typeKey.includes(rowType);
    });
    if (strict || typeRows.length) scopedRows = typeRows;
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
    rejected: scopedRows.filter(row => /불합격|탈락/.test(normalizeText(row?.finalResult))).length,
    rate: total ? Math.round(accepted / total * 1000) / 10 : null,
    detailTypes,
    scope: departmentRows.length ? "모집단위 기준" : (universityRows.length ? "대학 전체 기준" : "연결 자료 없음"),
    departmentMatched: departmentRows.length > 0,
  };
}

function supportConnectionEntries(enrichedRows, cutoffBasis, conversionGroup) {
  const entries = [];
  (enrichedRows || []).forEach(({ row, caseStats = [], minimums = [], minimumEvaluations = [] }) => {
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
        minimumSummary: minimumEvaluationSummary(minimumEvaluations.filter((_, evaluationIndex) => minimumAppliesToAdmission(minimums[evaluationIndex], admissionType))),
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
  const favoriteRegion = favorite.region || (favorite.campus && favorite.campus !== "단일" ? favorite.campus : "");
  const sameUniversity = sameUniversityCampus(favorite.university, favoriteRegion, entry.university, entry.region);
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
  const [recommendedData, setRecommendedData] = useState(null);
  const [recommendedDraft, setRecommendedDraft] = useState(null);
  const [recommendedFile, setRecommendedFile] = useState(null);
  const recommendedInputRef = useRef(null);

  useEffect(() => {
    loadBetaData().then(setSchoolData).catch(() => setSchoolData(null));
    loadRecommendedSubjectData().then(setRecommendedData).catch(() => setRecommendedData(null));
  }, []);

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
  const parseRecommendedFile = async () => {
    if (!recommendedFile) return showToast?.("어디가 권장과목 XLSX 파일을 선택해주세요.", "warning");
    setBusy(true);
    try {
      const parsed = await parseRecommendedSubjectsWorkbook(recommendedFile, setStatus);
      setRecommendedDraft(parsed);
      showToast?.(`${parsed.stats.records.toLocaleString()}개 권장과목 연결 정보를 확인했습니다.`, "success");
    } catch (error) {
      console.error(error);
      showToast?.(error?.message || "권장과목 파일을 분석하지 못했습니다.", "error");
    } finally {
      setBusy(false);
    }
  };
  const saveRecommended = async () => {
    if (!recommendedDraft) return showToast?.("먼저 권장과목 파일을 분석해주세요.", "warning");
    setBusy(true);
    setStatus("대학별 권장과목 자료를 학교 공용 데이터에 저장하는 중입니다.");
    try {
      const saved = { ...recommendedDraft, source: { ...recommendedDraft.source, savedAt: new Date().toISOString() } };
      const result = await writeStorage(RECOMMENDED_SUBJECT_STORAGE_KEY, saved);
      if (!result?.ok) throw new Error(result?.error || "저장 실패");
      updateRecommendedSubjectCache(saved);
      setRecommendedData(saved);
      showToast?.("2028 대학별 권장과목 자료를 반영했습니다.", "success");
    } catch (error) {
      showToast?.(`권장과목 자료를 저장하지 못했습니다: ${error?.message || error}`, "error");
    } finally {
      setBusy(false);
    }
  };
  const clearRecommended = async () => {
    if (!window.confirm("2028 대학별 권장과목 학교 공용 자료를 초기화할까요?")) return;
    setBusy(true);
    try {
      const result = await writeStorage(RECOMMENDED_SUBJECT_STORAGE_KEY, null);
      if (!result?.ok) throw new Error(result?.error || "초기화 실패");
      updateRecommendedSubjectCache(null);
      setRecommendedData(null);
      setRecommendedDraft(null);
      showToast?.("권장과목 자료를 초기화했습니다.", "success");
    } catch (error) {
      showToast?.(`권장과목 자료를 초기화하지 못했습니다: ${error?.message || error}`, "error");
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

      <div style={ui.recommendAdminPanel}>
        <div style={ui.recommendAdminHead}>
          <div><span style={ui.recommendSourceBadge}>공식 자료</span><b>2028 대학별 권장과목 · 반영과목</b><p>대입정보포털 어디가의 「2028학년도 권역별 대학별 권장과목(반영과목)」 XLSX를 업로드합니다. 학생에게는 ‘필수 요건’이 아니라 대학 발표 기반 참고자료로 표시합니다.</p><a href={OFFICIAL_RECOMMENDED_SOURCE_URL} target="_blank" rel="noreferrer" style={ui.recommendOfficialLink}>어디가 공식 게시물 열기 ↗</a></div>
          {recommendedData && <button type="button" style={ui.dangerGhost} onClick={clearRecommended} disabled={busy}><X size={14}/>권장과목 자료 초기화</button>}
        </div>
        <div style={ui.recommendDataGrid}>
          <article style={ui.recommendDataCard}><small>현재 학교 반영본</small><b>{recommendedData ? `${Number(recommendedData.stats?.universities || 0).toLocaleString()}개 대학` : "자료 없음"}</b><span>{recommendedData ? `${Number(recommendedData.stats?.records || 0).toLocaleString()}개 대학·모집단위 연결 · ${recommendedData.source?.referenceDate || ""}` : "어디가 공식 XLSX를 반영해주세요."}</span></article>
          <article style={ui.recommendDataCard}><small>업로드 미리보기</small><b>{recommendedDraft ? `${Number(recommendedDraft.stats?.universities || 0).toLocaleString()}개 대학` : "미분석"}</b><span>{recommendedDraft ? `${Number(recommendedDraft.stats?.records || 0).toLocaleString()}개 연결 정보${recommendedDraft.stats?.skippedSheets?.length ? ` · 미인식 시트 ${recommendedDraft.stats.skippedSheets.length}개` : ""}` : "파일 선택 후 분석합니다."}</span></article>
        </div>
        <div style={ui.recommendUploadRow}>
          <input ref={recommendedInputRef} type="file" accept=".xlsx,.xlsm,.xls" style={{display:"none"}} onChange={event => { setRecommendedFile(event.target.files?.[0] || null); setRecommendedDraft(null); }} />
          <button type="button" style={ui.secondaryBtn} onClick={() => recommendedInputRef.current?.click()} disabled={busy}><FileSpreadsheet size={15}/>권장과목 XLSX 선택</button>
          <div style={ui.fileName}>{recommendedFile ? <><b>{recommendedFile.name}</b><span>{humanBytes(recommendedFile.size)}</span></> : <span>어디가 ‘2028학년도 권역별 대학별 권장과목(반영과목).xlsx’</span>}</div>
          <button type="button" style={ui.secondaryBtn} onClick={parseRecommendedFile} disabled={!recommendedFile || busy}>{busy ? <Loader2 size={15} className="spin"/> : <RefreshCw size={15}/>}분석</button>
          <button type="button" style={ui.primaryBtn} onClick={saveRecommended} disabled={!recommendedDraft || busy}><Upload size={15}/>학교 자료에 반영</button>
        </div>
        <div style={ui.recommendOfficialNote}><Database size={14}/><span><b>자료 기준:</b> 한국대학교육협의회 대입정보포털 어디가의 공식 XLSX입니다. 해당 파일은 2025.9.30 어디가에 탑재된 각 대학의 2028학년도 모집단위별 반영·권장과목 발표를 요약한 자료이며, 대학 발표가 바뀔 수 있으므로 실제 지원 전에는 대학 입학처 공지를 최종 확인합니다.</span></div>
      </div>
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
  onOpenConsultation,
  caseRows = [],
  focusUniversity = "",
  focusDepartment = "",
  workspaceRequest = null,
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dataLoadError, setDataLoadError] = useState("");
  const [dataReload, setDataReload] = useState(0);
  const [recommendedData, setRecommendedData] = useState(null);
  const [recommendedStatus, setRecommendedStatus] = useState("idle");
  const [recommendedReload, setRecommendedReload] = useState(0);
  const [supportPlan, setSupportPlan] = useState([]);
  const [compareTray, setCompareTray] = useState([]);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceLoadError, setWorkspaceLoadError] = useState("");
  const [workspaceReload, setWorkspaceReload] = useState(0);
  const activeSidRef = useRef(selectedStudent?.sid);
  activeSidRef.current = selectedStudent?.sid;
  const mutationBusyRef = useRef(false);
  const [workspaceMessage, setWorkspaceMessage] = useState("");
  const conversionPreference = useMemo(() => readConversionPreference(), []);
  const restoredViewState = useMemo(() => readNaviViewState(selectedStudent?.sid), []);
  const restoredSupportFilters = Array.isArray(restoredViewState?.supportFilters)
    ? restoredViewState.supportFilters.filter(label => SUPPORT_META[label])
    : (restoredViewState?.supportFilter && restoredViewState.supportFilter !== "전체" && SUPPORT_META[restoredViewState.supportFilter] ? [restoredViewState.supportFilter] : []);
  const [grade5, setGrade5] = useState("1.80");
  const deferredGrade5 = useDeferredValue(grade5);
  const [conversionMethod, setConversionMethod] = useState(restoredViewState?.conversionMethod === "statistical" ? "statistical" : conversionPreference.method);
  const [conversionGroup, setConversionGroup] = useState(CONVERSION_GROUPS.includes(restoredViewState?.conversionGroup) ? restoredViewState.conversionGroup : conversionPreference.group);
  const [query, setQuery] = useState(restoredViewState?.query || "");
  const deferredQuery = useDeferredValue(query);
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
  const [viewTab, setViewTab] = useState(["search", "results", "connection", "workspace"].includes(restoredViewState?.viewTab) ? restoredViewState.viewTab : "search");
  const [connectionFocus, setConnectionFocus] = useState(restoredViewState?.connectionFocus || null);
  const [page, setPage] = useState(Math.max(1, Number(restoredViewState?.page || 1)));
  // 3순위(모평 선택·시뮬레이션): 최저 판정에 사용할 모의고사 회차를 학생이 직접 고를 수 있게 합니다.
  // null이면 최신 회차를 그대로 씁니다.
  const [selectedMockKey, setSelectedMockKey] = useState(null);
  const [viewPending, startViewTransition] = useTransition();
  const naviHistorySessionRef = useRef(`kd-susi-navi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const naviHistoryDepthRef = useRef(0);

  const navigateViewTab = (nextTab, { replace = false } = {}) => {
    if (!["search", "results", "connection", "workspace"].includes(nextTab)) return;
    if (nextTab === "workspace" && String(selectedStudent?.sid || "").trim()) setWorkspaceLoading(true);
    startViewTransition(() => setViewTab(nextTab));
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
      if (!["search", "results", "connection", "workspace"].includes(state.kdSusiNaviTab)) return;
      naviHistoryDepthRef.current = Math.max(0, Number(state.kdSusiNaviDepth || 0));
      setViewTab(state.kdSusiNaviTab);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setDataLoadError("");
    loadSusiNaviBetaDataReliable(dataReload > 0, 2).then(value => {
      if (!active) return;
      setData(value);
      setLoading(false);
    }).catch(error => {
      if (!active) return;
      setDataLoadError(error?.message || "수시 NAVI 기본 자료를 불러오지 못했습니다.");
      setLoading(false);
    });
    const handleRecommendedUpdate = event => {
      const value = event?.detail || null;
      setRecommendedData(value);
      setRecommendedStatus(value ? "ready" : "empty");
    };
    if (typeof window !== "undefined") window.addEventListener("kd-recommended-subjects-updated", handleRecommendedUpdate);
    return () => {
      active = false;
      if (typeof window !== "undefined") window.removeEventListener("kd-recommended-subjects-updated", handleRecommendedUpdate);
    };
  }, [dataReload]);

  // 대학·전형 기본 자료를 먼저 표시하고, 큰 권장과목 자료는 브라우저가 한가할 때 별도로 읽습니다.
  // 두 분할 문서를 동시에 요청해 학교 네트워크에서 시간 초과가 나던 경로를 차단합니다.
  const recommendationViewActive = viewTab === "results" || viewTab === "workspace";
  const recommendationLoadReady = viewTab === "results" || (viewTab === "workspace" && !workspaceLoading);
  const recommendationDisplayStatus = recommendationViewActive && recommendedStatus === "idle" ? "loading" : recommendedStatus;
  useEffect(() => {
    // 검색 조건을 정하는 첫 화면에서는 큰 권장과목 문서를 읽지 않습니다. 실제 카드나
    // 지원 구성을 열 때만 지연 로드하여 NAVI 첫 진입의 네트워크·파싱 부하를 줄입니다.
    if (!recommendationLoadReady || loading || dataLoadError || recommendedData) return undefined;
    let active = true;
    let timer = null;
    let idleId = null;
    const load = () => {
      if (!active) return;
      setRecommendedStatus("loading");
      loadRecommendedSubjectData(recommendedReload > 0).then(value => {
        if (!active) return;
        startViewTransition(() => setRecommendedData(value));
        setRecommendedStatus(value ? "ready" : "empty");
      }).catch(() => {
        if (active) setRecommendedStatus("error");
      });
    };
    if (typeof window !== "undefined" && "requestIdleCallback" in window) idleId = window.requestIdleCallback(load, { timeout: 1200 });
    else timer = setTimeout(load, 250);
    return () => {
      active = false;
      if (idleId != null && typeof window !== "undefined" && "cancelIdleCallback" in window) window.cancelIdleCallback(idleId);
      if (timer != null) clearTimeout(timer);
    };
  }, [recommendationLoadReady, loading, dataLoadError, recommendedData, recommendedReload]);

  useEffect(() => {
    setSupportPlan([]); setCompareTray([]); setWorkspaceLoading(false);
  }, [selectedStudent?.sid]);

  useEffect(() => {
    let active = true, request = 0;
    const sid = String(selectedStudent?.sid || "").trim();
    // 지원 구성/비교 저장소 구독은 실제 탭을 열 때만 시작합니다. NAVI 진입 때마다
    // 원격 목록 두 개를 자동 요청하던 동작이 초기 렉과 간헐적 로드 오류의 원인이었습니다.
    if (loading || viewTab !== "workspace") {
      setWorkspaceLoading(false);
      return () => { active = false; };
    }
    setWorkspaceMessage(""); setWorkspaceLoadError("");
    const reload = async () => {
      const token = ++request;
      setWorkspaceLoading(true);
      try {
        const [plan, compare] = await Promise.all([loadSupportPlan(sid), loadCompareTray(sid)]);
        if (!active || token !== request) return;
        setSupportPlan(plan); setCompareTray(compare); setWorkspaceLoadError("");
      } catch {
        if (active && token === request) setWorkspaceLoadError("지원 목록을 불러오지 못했습니다. 기존 저장 자료를 확인한 뒤 다시 시도해주세요.");
      } finally {
        if (active && token === request) setWorkspaceLoading(false);
      }
    };
    if (sid) reload(); else { setSupportPlan([]); setCompareTray([]); setWorkspaceLoading(false); }
    const unsubscribe = sid ? subscribeSupportPlanChanges(sid, reload) : () => {};
    return () => { active = false; unsubscribe(); };
  }, [selectedStudent?.sid, workspaceReload, loading, viewTab]);

  useEffect(() => {
    if (workspaceRequest?.id && String(workspaceRequest.sid) === String(selectedStudent?.sid)) navigateViewTab("workspace");
  }, [workspaceRequest?.id, selectedStudent?.sid]);

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

  // 학생이 바뀌면 이전 학생의 회차 선택이 남아있지 않도록 초기화합니다(다시 "최신 회차"로).
  useEffect(() => { setSelectedMockKey(null); }, [selectedStudent?.sid]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CONVERSION_PREF_KEY, JSON.stringify({ method: conversionMethod, group: conversionGroup }));
  }, [conversionMethod, conversionGroup]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CUTOFF_PREF_KEY, cutoffBasis);
  }, [cutoffBasis]);

  useEffect(() => {
    const state = {
      version: 64,
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
    };
    // 검색 입력마다 sessionStorage 직렬화를 같은 프레임에서 실행하지 않습니다.
    const timer = window.setTimeout(() => writeNaviViewState(selectedStudent?.sid, state), 240);
    return () => window.clearTimeout(timer);
  }, [
    selectedStudent?.sid, viewTab, query, regionFilters, fieldFilters, admissionFilters, minimumFilters,
    supportFilters, resultSort, cutoffBasis, conversionMethod, conversionGroup, connectionMode,
    connectionRange, connectionUniversity, favoriteOnly, connectionFocus, focusUniversity, focusDepartment, page,
  ]);

  const conversion = useMemo(() => conversionDetails(data, conversionMethod, conversionGroup, deferredGrade5), [data, conversionMethod, conversionGroup, deferredGrade5]);
  const studentSubjects = useMemo(() => uniqueStudentSubjects(selectedStudent?.subjects || []), [selectedStudent?.subjects]);
  // 3순위(모평 선택·시뮬레이션): 선택한 회차가 있으면 그 회차 성적으로, 없으면 기존처럼 최신 회차로
  // 최저를 판정합니다. sid·내신·minimumRows 등 다른 필드는 그대로 두고 모의고사 관련 필드만 바꿔치기하므로,
  // 아래에서 selectedStudent 대신 effectiveStudent를 쓰는 곳은 모두 100% 호환됩니다.
  const effectiveStudent = useMemo(() => {
    if (!selectedStudent) return selectedStudent;
    const exam = selectedMockKey ? (selectedStudent.availableMockExams || []).find(item => item.key === selectedMockKey) : null;
    if (!exam) return selectedStudent;
    return { ...selectedStudent, latestMockKey: exam.key, latestMockGrades: exam.grades, latestMockSums: exam.sums, latestMockLabel: exam.label };
  }, [selectedStudent, selectedMockKey]);

  const mutateWorkspace = async (kind, action, item) => {
    const sid = String(selectedStudent?.sid || "").trim();
    if (!sid) return setWorkspaceMessage("학생을 먼저 선택해주세요.");
    if (workspaceLoading || workspaceLoadError) return setWorkspaceMessage("목록을 정상적으로 불러온 뒤 다시 시도해주세요.");
    if (mutationBusyRef.current) return;
    mutationBusyRef.current = true;
    setWorkspaceBusy(true); setWorkspaceMessage("");
    try {
      const result = await mutateWorkspaceList(sid, kind, action, item, kind === "plan" ? supportPlanItemKey : compareItemKey);
      if (String(activeSidRef.current) !== sid) return;
      if (!result.ok) { setWorkspaceMessage(result.error || "저장에 실패했습니다."); return; }
      if (kind === "plan") setSupportPlan(result.items); else setCompareTray(result.items);
      setWorkspaceMessage(result.duplicate ? "이미 저장된 항목입니다." : `${kind === "plan" ? "수시 지원 구성" : "대학 비교"}을 저장했습니다. (${result.items.length}/${kind === "plan" ? 6 : 5})`);
    } finally {
      mutationBusyRef.current = false; setWorkspaceBusy(false);
    }
  };
  const addSupportPlanItem = item => mutateWorkspace("plan", "add", item);
  const removeSupportPlanItem = item => mutateWorkspace("plan", "remove", item);
  const addCompareItem = item => mutateWorkspace("compare", "add", item);
  const removeCompareItem = item => mutateWorkspace("compare", "remove", item);

  const canonicalRecords = useMemo(() => coalesceNaviRecords(data?.records || []), [data?.records]);
  const regions = useMemo(() => unique(canonicalRecords.map(row => row[1])), [canonicalRecords]);
  const fields = useMemo(() => unique(canonicalRecords.flatMap(row => fieldValuesOf(row))), [canonicalRecords]);
  const minimumIndex = useMemo(() => buildUniversityIndex(data?.minimums || [], 1, 0), [data]);
  const courseRuleIndex = useMemo(() => buildUniversityIndex(data?.courseRules || [], 1, 0), [data]);
  const changeIndex = useMemo(() => buildUniversityIndex(data?.changes2028 || [], 1, 0), [data]);
  const scheduleIndex = useMemo(() => buildUniversityIndex(data?.schedules || [], 1, 0), [data]);
  const caseStatIndex = useMemo(() => buildUniversityIndex(data?.caseStats || [], 5, 0), [data]);
  // 성능 개선(렉): recommendedData가 바뀔 때만 한 번 학과명·계열별 Map을 만들어 두고,
  // 아래 enriched에서는 모집단위마다 이 Map에서 바로 찾아 씁니다(전체 자료를 매번 훑지 않음).
  const recommendationEstimateIndexes = useMemo(() => buildRecommendationEstimateIndexes(recommendedData), [recommendedData]);
  const recommendationForRow = useCallback(row => recommendationForUnit(recommendedData, row?.[3], row?.[1], row?.[5], recommendationEstimateIndexes, row?.[6])
    || estimateRecommendationForUnit(recommendationEstimateIndexes, row?.[3], row?.[1], row?.[5], row?.[6]), [recommendedData, recommendationEstimateIndexes]);

  const enriched = useMemo(() => canonicalRecords.map(row => {
    const target={university:row[3],region:row[1],department:row[5],field:row[6]};
    const catalogRows=catalogRowsForTarget(effectiveStudent?.minimumCatalogRows||[],target,effectiveStudent?.admissionYear,universityIdentityKey);
    const minimums = indexedUniversityRows(minimumIndex, row[3], row[1]).filter(item => matchesUnit(item[5], row[5]));
    // Supply rows even when NAVI has no minimum entry. Keep original NAVI data intact.
    for(const value of catalogRows){
      if(minimums.some(item=>(item.catalogRule?.admissionYear||2027)===value.admissionYear&&item[2]===value.admissionType&&minimumTrackKey(item[3])===minimumTrackKey(value.track)))continue;
      const synthetic=['',value.campus?`${value.university}(${value.campus})`:value.university,value.admissionType,value.track,'',row[5],value.subjects,value.count,value.ruleText,null,value.note,`${value.source} ${value.page}쪽`];
      synthetic.catalogRule=value;minimums.push(synthetic);
    }
    const courseRules = indexedUniversityRows(courseRuleIndex, row[3], row[1]).filter(item => matchesUnit(item[5], row[5]) || unitSimilar(item[5], row[5])).slice(0, 4);
    const changes2028 = indexedUniversityRows(changeIndex, row[3], row[1]).filter(item => !item[6] || /O|변경|신설/.test(item[6])).slice(0, 5);
    const schedules = indexedUniversityRows(scheduleIndex, row[3], row[1]).filter(item => !item[5] || matchesUnit(item[5], row[5]) || unitSimilar(item[5], row[5])).slice(0, 5);
    const caseStats = indexedUniversityRows(caseStatIndex, row[3], row[1]);
    const unit = { university: row[3], region: row[1], department: row[5], field: row[6] };
    const minimumEvaluations = minimums.map(item => evaluateNaviMinimumSafe(item, effectiveStudent));
    // 성능 개선: 회차별 이력(minimumHistories)·등급개선 시뮬레이션(minimumImprovements)은 계산 비용이
    // 커서(회차 수·과목 수만큼 반복 재판정), 전체 모집단위(수천 건)가 아니라 실제로 화면에 보이는
    // 12건(visible)에 대해서만 아래에서 따로 계산합니다. 예전에는 여기서 전체에 대해 계산해
    // 검색/필터를 바꿀 때마다 불필요하게 느려졌습니다.
    return {
      row,
      minimums,
      minimumEvaluations,
      courseRules,
      changes2028,
      schedules,
      caseStats,
    };
  }), [canonicalRecords, minimumIndex, courseRuleIndex, changeIndex, scheduleIndex, caseStatIndex, effectiveStudent?.sid, effectiveStudent?.latestMockKey, effectiveStudent?.latestMockGrades, effectiveStudent?.latestMockSums, effectiveStudent?.minimumRows, effectiveStudent?.minimumCatalogRows, effectiveStudent?.admissionYear]);

  const connectionFocusDepartmentMatched = useMemo(() => {
    if (!connectionFocus?.university || !connectionFocus?.department) return false;
    return enriched.some(({ row }) => {
      const sameUniversity = universityIdentityKey(row[3], row[1]) === universityIdentityKey(connectionFocus.university, connectionFocus.region || "")
        || universityBaseKey(row[3]) === universityBaseKey(connectionFocus.university);
      return sameUniversity && unitSimilar(row[5], connectionFocus.department);
    });
  }, [enriched, connectionFocus]);

  const filtered = useMemo(() => {
    const matches = enriched.flatMap(entry => {
      const { row, minimums } = entry;
      if (connectionFocus?.university) {
        const sameUniversity = universityIdentityKey(row[3], row[1]) === universityIdentityKey(connectionFocus.university, connectionFocus.region || "")
          || universityBaseKey(row[3]) === universityBaseKey(connectionFocus.university);
        if (!sameUniversity) return [];
        if (connectionFocus.department && connectionFocusDepartmentMatched && !unitSimilar(row[5], connectionFocus.department)) return [];
      }
      if (regionFilters.length && !regionFilters.includes(row[1])) return [];
      if (fieldFilters.length && !fieldFilters.some(field => fieldValuesOf(row).includes(field))) return [];
      if (minimumFilters.length === 1) {
        const states=(entry.minimumEvaluations||[]).filter((_,i)=>!admissionFilters.length||admissionFilters.some(type=>minimumAppliesToAdmission(minimums[i],type))).map(x=>x?.status);
        if (minimumFilters[0] === "있음" && !states.some(s=>['satisfied','unsatisfied','unavailable'].includes(s))) return [];
        if (minimumFilters[0] === "없음" && !states.includes('no-minimum')) return [];
      }
      if (favoriteOnly && !favorites.some(item => favoriteMatches(item, row))) return [];

      const useTeaching = !admissionFilters.length || admissionFilters.includes("교과");
      const useHolistic = !admissionFilters.length || admissionFilters.includes("종합");
      const useRegular = !admissionFilters.length || admissionFilters.includes("정시");
      const matchSupport = item => !supportFilters.length || conversion?.value == null
        || supportFilters.includes(supportBand(conversion.value, cutoffValue(item, cutoffBasis))?.label);
      const teaching = useTeaching ? (row[7] || []).filter(matchSupport) : [];
      const holistic = useHolistic ? (row[8] || []).filter(matchSupport) : [];
      const regular = useRegular ? row[9] : null;

      // 지원구간 필터가 활성화되면 카드 내부의 전형도 선택한 구간만 남깁니다.
      // 이전에는 '한 전형만 조건에 맞아도' 카드의 다른 상향/하향 전형까지 같이 보여 필터가 안 먹는 것처럼 보였습니다.
      if (supportFilters.length && conversion?.value != null && !teaching.length && !holistic.length) return [];
      if (admissionFilters.length && !teaching.length && !holistic.length && !regular) return [];

      const visibleRow = [...row];
      visibleRow[7] = teaching;
      visibleRow[8] = holistic;
      visibleRow[9] = regular;
      if (!queryMatchesRow(visibleRow, deferredQuery)) return [];
      return [{ ...entry, row: visibleRow }];
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
  }, [enriched, connectionFocus, connectionFocusDepartmentMatched, deferredQuery, regionFilters, fieldFilters, admissionFilters, minimumFilters, supportFilters, cutoffBasis, favoriteOnly, favorites, conversion?.value, resultSort]);

  const connectionEntryCacheRef = useRef({ source: null, cutoffBasis: "", conversionGroup: "", entries: [] });
  const connectionEntries = useMemo(() => {
    const cached = connectionEntryCacheRef.current;
    if (cached.source === enriched && cached.cutoffBasis === cutoffBasis && cached.conversionGroup === conversionGroup) return cached.entries;
    // 지원 연결용 후보 전개는 대학 상세·검색 화면에서는 쓰이지 않습니다. 해당 탭을 처음
    // 열 때만 계산하고 이후에는 입력 자료가 바뀔 때까지 재사용합니다.
    if (viewTab !== "connection") return [];
    const entries = supportConnectionEntries(enriched, cutoffBasis, conversionGroup);
    connectionEntryCacheRef.current = { source: enriched, cutoffBasis, conversionGroup, entries };
    return entries;
  }, [viewTab, enriched, cutoffBasis, conversionGroup]);
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
    if (viewTab !== "connection") return;
    if (!connectionUniversity) return;
    const matched = connectionUniversities.find(name => universityIdentityKey(name) === universityIdentityKey(connectionUniversity)
      || universityBaseKey(name) === universityBaseKey(connectionUniversity));
    if (!matched) setConnectionUniversity("");
    else if (matched !== connectionUniversity) setConnectionUniversity(matched);
  }, [viewTab, connectionUniversities, connectionUniversity]);
  const connectionResults = useMemo(() => (
    connectionMode === "university"
      ? linkedUniversityResults(connectionEntries, connectionUniversity, connectionRange)
      : linkedSupportResults(connectionEntries, conversion?.value, connectionRange)
  ), [connectionMode, connectionEntries, connectionUniversity, connectionRange, conversion?.value]);

  const enrichedWorkspaceIndex = useMemo(() => buildEnrichedWorkspaceIndex(enriched), [enriched]);
  const resolvedSupportPlan = useMemo(() => {
    if (viewTab !== "workspace") return [];
    const sourceEntries = supportPlan.map(item => ({ stored: item, entry: indexedEnrichedWorkspaceEntry(enrichedWorkspaceIndex, item) }));
    // 전형 비교 근거를 항목마다 다시 계산하지 않고, 현재 지원 구성 전체를 한 번에 계산합니다.
    const evidenceRows = buildComparisonRows({ compareItems: sourceEntries, data: data || {}, caseRows, convertedGrade: conversion?.value, cutoffBasis, conversionGroup, identity: universityIdentityKey, minimumContext: effectiveStudent, evaluateMinimum: row => evaluateNaviMinimum(row, effectiveStudent) });
    return sourceEntries.map(({ stored: item, entry }) => {
    const sourceItems = item.admissionType === "종합" ? (entry?.row[8] || []) : item.admissionType === "교과" ? (entry?.row[7] || []) : [];
    const matchingItems = sourceItems.filter(value => trackIdentity(value?.[0]) === trackIdentity(item.track));
    const admissionItem = matchingItems.length === 1 ? matchingItems[0] : null;
    const cut = admissionItem ? cutoffValue(admissionItem, cutoffBasis) : null;
    const evidence = admissionItem ? evidenceRows.find(value => universityIdentityKey(value.university, value.region || "") === universityIdentityKey(item.university, item.region || "") && compactText(value.department) === compactText(item.department) && value.admissionType === item.admissionType && trackIdentity(value.track) === trackIdentity(item.track)) : null;
    const minimumEvaluation = evidence?.minimumEvaluation || resolveMinimumLink({target:item,data:data || {},student:effectiveStudent,identity:universityIdentityKey,evaluateMinimum:row=>evaluateNaviMinimum(row,effectiveStudent),ambiguousType:true}).evaluation;
    const recommendation = entry?.row ? recommendationForRow(entry.row) : null;
    return {
      stored: item, entry, admissionItem,
      missing: !entry, trackMissing: !admissionItem,
      support: supportBand(conversion?.value, cut),
      minimumEvaluation,
      minimumStatus: minimumEvaluation.status,
      recommendation,
      recommendationProgress: recommendationProgress(recommendation, studentSubjects),
      recommendationStatus: recommendationDisplayStatus,
      naviCaseCount: evidence?.naviCount ?? null,
      comparisonEvidence: evidence,
      schoolTrend: evidence?.school || schoolCaseTrend(caseRows, item.university, item.region, item.department, item.track || item.admissionType, true),
    };
  });
  }, [viewTab, supportPlan, enrichedWorkspaceIndex, cutoffBasis, conversion?.value, conversionGroup, caseRows, data, effectiveStudent, studentSubjects, recommendationDisplayStatus, recommendationForRow]);
  const resolvedCompareTray = useMemo(() => viewTab === "workspace" ? compareTray.map(item => {
    const entry = indexedEnrichedWorkspaceEntry(enrichedWorkspaceIndex, item);
    return { stored: item, entry: entry || null };
  }) : [], [viewTab, compareTray, enrichedWorkspaceIndex]);

  useEffect(() => { setPage(1); }, [connectionFocus, deferredQuery, regionFilters, fieldFilters, admissionFilters, minimumFilters, supportFilters, cutoffBasis, favoriteOnly, resultSort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const changePage = nextPage => setPage(Math.min(pageCount, Math.max(1, Number(nextPage) || 1)));
  // 성능 개선: 회차 이력·등급개선 시뮬레이션은 화면에 실제로 보이는 이 페이지의 12건에 대해서만
  // 계산합니다(전체 결과에 대해 계산하면 검색·필터를 바꿀 때마다 수천 건을 다시 계산해 느려집니다).
  const visibleWithSimulation = useMemo(() => visible.map(entry => {
    const { row, minimums, minimumEvaluations } = entry;
    const recommendation = recommendationForRow(row);
    const minimumHistories = minimums.map(item => {
      if (!(selectedStudent?.availableMockExams?.length > 1)) return null;
      return minimumHistorySummary(item, effectiveStudent, selectedStudent.availableMockExams);
    });
    const minimumImprovements = minimums.map((item, idx) => {
      if (minimumEvaluations[idx]?.status !== "unsatisfied") return null;
      return minimumImprovementAdvice(item, effectiveStudent);
    });
    return { ...entry, recommendation, minimumHistories, minimumImprovements, recommendationProgress: recommendationProgress(recommendation, studentSubjects) };
  }), [visible, effectiveStudent, selectedStudent?.availableMockExams, studentSubjects, recommendationForRow]);
  const visibleResultRows = useMemo(() => visibleWithSimulation.map(entry => ({
    ...entry,
    schoolTrend: schoolCaseTrend(caseRows, entry.row[3], entry.row[1], entry.row[5]),
  })), [visibleWithSimulation, caseRows]);
  const activeFilterLabels = [
    connectionFocus?.university ? `${connectionFocus.source || "연결"}: ${connectionFocus.university}${connectionFocus.department ? ` · ${connectionFocus.department}${connectionFocusDepartmentMatched ? "" : " (학과명 불일치 → 대학 전체)"}` : ""}` : "",
    deferredQuery ? `검색: ${deferredQuery}` : "",
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


  if (loading) return <div style={ui.loading}><Loader2 className="spin" size={22} /> 수시NAVI 기본 자료를 불러오는 중입니다.</div>;
  if (dataLoadError) return <div style={{...ui.loading,flexDirection:"column",textAlign:"center"}}><AlertTriangle size={24} color="#a94b42"/><b>수시 NAVI 자료 연결이 지연되고 있습니다.</b><small>{dataLoadError}</small><button type="button" style={ui.retryButton} onClick={()=>setDataReload(value=>value+1)}>다시 불러오기</button></div>;

  return (
    <section style={ui.root} aria-busy={viewPending}>
      <style>{betaCss}</style>
      {/* 2번 요청: 왼쪽 소개 글이 자기 내용만큼만 폭을 차지하고 늘어나지 않아서, space-between이
          가운데에 큰 빈 공간을 만들고 있었습니다. 왼쪽 블록에 flex:1을 줘서 남는 폭을 항상 채우게
          하고, 오른쪽 버튼·통계 묶음은 줄바꿈 없이 한 덩어리로 붙어 다니게 고정합니다. */}
      <div style={ui.hero}>
        <div style={ui.heroIntro}><div style={ui.heroEyebrow}><Sparkles size={14} /> 경기도교육청 교사용 자료 기반 · 독립 시험 운영</div><h2 style={ui.heroTitle}>2027 수시NAVI <span>Beta</span></h2><p style={ui.heroText}>경기도교육청 통합 자료를 기반으로 대학·모집단위, 전년도 입시결과와 NAVI 통합 사례를 조회합니다.</p></div>
        <div className="kd-support-plan-entry-actions" style={ui.heroActions}><SupportPlanButton onClick={() => navigateViewTab("workspace")} count={workspaceLoadError ? null : supportPlan.length}/>{data && <div style={ui.heroStats}><b>{data.stats?.universities?.toLocaleString()}개 대학</b><span>{data.stats?.records?.toLocaleString()}개 모집단위</span><small>자료 기준 {data.source?.sourceDate || "확인 필요"}</small></div>}</div>
      </div>
      <div className="susi-beta-beta-notice" style={ui.betaNotice}><AlertTriangle size={15} /><div><b>시험 운영 기능입니다.</b><span>2027 모집단위와 2026 입시결과를 연결한 참고자료입니다.<br/>2024–2026 광덕고 대입 결과 탭과는 별도의 데이터베이스이며, 광덕고 사례에는 영향을 주지 않습니다.</span>{data && !data.caseStats?.length && <strong>NAVI 통합 사례 분포·2028 변화 자료를 사용하려면 관리자에서 최신 원본 파일을 다시 분석·반영해주세요.</strong>}</div></div>
      {recommendationDisplayStatus === "loading" && <div style={ui.optionalLoadNotice}><Loader2 className="spin" size={13}/>대학별 권장과목은 백그라운드에서 추가 연결 중입니다. 대학 검색과 최저 판정은 바로 사용할 수 있습니다.</div>}
      {recommendationDisplayStatus === "error" && <div style={{...ui.optionalLoadNotice,...ui.optionalLoadError}}><AlertTriangle size={13}/>권장과목 추가자료만 불러오지 못했습니다. 다른 NAVI 기능은 정상적으로 사용할 수 있습니다.<button type="button" onClick={()=>setRecommendedReload(value=>value+1)}>권장과목 다시 연결</button></div>}

      {!data && viewTab !== "workspace" ? <><SupportPlanButton onClick={() => navigateViewTab("workspace")} count={supportPlan.length}/><EmptyData isAdmin={isAdmin} /></> : <>
        <div className="susi-beta-view-toolbar" style={ui.viewToolbar}>
          <div className="susi-beta-view-tabs" style={ui.viewTabs} role="tablist" aria-label="수시NAVI 화면 구분">
            <button type="button" role="tab" aria-selected={viewTab === "search"} onClick={() => navigateViewTab("search")} style={{ ...ui.viewTab, ...(viewTab === "search" ? ui.viewTabActive : {}) }}><span>1</span><b>기준 설정</b><small>환산·검색 조건</small></button>
            <button type="button" role="tab" aria-selected={viewTab === "results"} onClick={() => navigateViewTab("results")} style={{ ...ui.viewTab, ...(viewTab === "results" ? ui.viewTabActive : {}) }}><span>2</span><b>대학 상세</b><small>{filtered.length.toLocaleString()}개 모집단위</small></button>
            <button type="button" role="tab" aria-selected={viewTab === "connection"} onClick={() => navigateViewTab("connection")} style={{ ...ui.viewTab, ...(viewTab === "connection" ? ui.viewTabActive : {}) }}><span>3</span><b>지원 연결</b><small>유사 대학 탐색</small></button>
            <button type="button" className="kd-support-plan-tab" role="tab" aria-selected={viewTab === "workspace"} onClick={() => navigateViewTab("workspace")} style={{ ...ui.viewTab, background: viewTab === "workspace" ? "#9a3412" : "#fff4e9", color: viewTab === "workspace" ? "#fff" : "#8a2e0e", borderColor: "#c36e3e" }}><span>4</span><b>수시 지원 구성</b><small>지원 {supportPlan.length}/6 · 비교 {compareTray.length}/5</small></button>
          </div>
          <div className="susi-beta-view-actions" style={ui.viewToolbarActions}>
            <span style={ui.cutoffStatusChip}><small>현재 지원 판정 기준</small><b>{cutoffBasis}%컷</b></span>
            <button type="button" style={ui.printButton} onClick={() => { navigateViewTab("results", { replace: true }); window.setTimeout(() => triggerSectionPrint("kd-print-target-result"), 90); }}><Printer size={16}/>대학 상세 인쇄·PDF</button>
          </div>
        </div>

        {workspaceLoadError && <div className="kd-plan-error" role="alert">{workspaceLoadError}<button type="button" onClick={() => setWorkspaceReload(value => value + 1)}>다시 불러오기</button></div>}
        {workspaceMessage && viewTab !== "workspace" && <div role="status" style={ui.workspaceMessage}>{workspaceMessage}</div>}
        <div className="susi-beta-consult-linkbar" style={ui.consultLinkBar}>
          <div style={ui.consultLinkCopy}><span style={ui.consultLinkEyebrow}>상담 연계</span><b>관심 대학 → NAVI 분석 → 지원 구성 → 상담 기록</b><small>저장한 관심 대학과 NAVI 분석 결과를 같은 학생 상담 흐름에서 이어서 확인합니다.</small></div>
          <div style={ui.consultLinkStats}><span><small>관심 대학</small><b>{favorites.length}</b></span><span><small>지원 구성</small><b>{supportPlan.length}/6</b></span><span><small>대학 비교</small><b>{compareTray.length}/5</b></span></div>
          <div style={ui.consultLinkActions}>{onOpenConsultation && <button type="button" style={ui.consultReturnButton} onClick={onOpenConsultation}>관심대학·상담으로</button>}</div>
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
            {/* 3순위(모평 선택·시뮬레이션): 수능최저 판정에 쓸 모의고사 회차를 직접 고를 수 있습니다.
                회차마다 그 회차 성적만 통째로 사용하고, 서로 다른 회차의 과목별 최고 등급을 섞어 쓰지 않습니다. */}
            {selectedStudent?.sid && (selectedStudent.availableMockExams?.length > 1) && (
              <div style={{ marginBottom: 12, padding: "11px 13px", border: "1px solid #d4deed", borderRadius: 12, background: "linear-gradient(135deg,#f7faff,#fbfcff)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                  <span style={{ fontSize: 9.5, color: "#728097", fontWeight: 800 }}>수능최저 판정 기준 회차</span>
                  <b style={{ fontSize: 13, color: "#2b3f60" }}>{effectiveStudent?.latestMockLabel || "회차 선택"}</b>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  {selectedStudent.availableMockExams.map(exam => (
                    <button
                      key={exam.key}
                      type="button"
                      onClick={() => setSelectedMockKey(exam.key)}
                      style={{ ...ui.segmentBtn, ...(effectiveStudent?.latestMockKey === exam.key ? ui.segmentActive : {}) }}
                    >{exam.label}</button>
                  ))}
                </div>
                <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.5, color: "#6d7889" }}>여러 회차 중 하나를 고르면 아래 대학 상세 결과의 수능최저 판정이 그 회차 성적만으로 다시 계산됩니다.</p>
              </div>
            )}
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
            {/* 2순위 핵심 발견: 대학별 실제 반영교과·학년별 비율·진로선택 처리 방식을 계산하는 엔진은
                아직 없습니다. "기존 환산"도 모든 대학에 똑같이 적용하는 공통 참고값이라는 점을
                통계 기반 방식과 똑같이 분명히 밝혀, 대학별 공식 값으로 오인하지 않게 합니다. */}
            {conversionMethod === "legacy" && <div style={ui.statDisclaimer}>모든 대학에 동일하게 적용하는 공통 참고 환산값입니다. 대학마다 실제 반영교과·학년별 비율·진로선택 처리 방식이 달라 이 값과 다를 수 있으니, 최종 지원 전 대학별 모집요강을 확인하세요.</div>}
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
          {data?.caseStats?.length > 0 && <div style={ui.caseStatsGuide}><AlertTriangle size={14}/><span><b>‘NAVI 통합 지원사례 244건’은 해당 학과의 합격자 244명이 아닙니다.</b> 경기도교육청 원본은 여러 학교의 사례를 <strong>대학·전형·계열 단위</strong>로 통합하며, 일부 통계는 학과를 별도로 구분하지 않습니다. 대학 공개 모집단위 컷이 없는 경우에는 화면에 ‘계열 통합’으로 구분해 표시합니다.</span></div>}
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
          <div className="susi-beta-result-context" style={ui.resultContextGuide}>
            <div style={ui.resultContextMain}>
              <div className="susi-beta-result-headline" style={ui.resultHeadlineRow}>
                <div style={ui.resultCountHero}>
                  <span style={ui.resultMetricLabel}>대학 상세 결과</span>
                  <b style={ui.resultMetricValue}>{filtered.length.toLocaleString()}<em style={ui.resultCountUnit}>건</em></b>
                </div>
                <div className="susi-beta-current-grade" style={ui.currentGradeHero}>
                  <span style={ui.currentGradeLabel}>현재 학생 내신</span>
                  <b style={ui.currentGradeValue}>{conversion?.value != null ? Number(conversion.value).toFixed(2) : "-"}</b>
                  <small style={ui.currentGradeHelp}>9등급 환산 · 원등급 {grade5 || "-"} · {conversionMethod === "statistical" ? `통계 Beta · ${conversionGroup}` : "기존 환산"} · {cutoffBasis}%컷 판정</small>
                </div>
              </div>
              <div className="susi-beta-result-description" style={ui.resultContextOneLine}>현재 검색·필터 조건에 맞는 2027 모집단위입니다. 자료 출처는 아래 <strong>‘자료 기준 안내’</strong>에서 확인할 수 있습니다.</div>
            </div>
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
            {visibleResultRows.length ? visibleResultRows.map(({ row, minimums, minimumEvaluations, minimumHistories, minimumImprovements, courseRules, changes2028, schedules, caseStats, recommendation, recommendationProgress, schoolTrend }, index) => <ResultCard
              key={`${universityIdentityKey(row[3], row[1])}-${unitIdentityKey(row[5])}-${compactText(row[6] || "공통")}`}
              row={row}
              minimums={minimums}
              minimumEvaluations={minimumEvaluations}
              minimumHistories={minimumHistories}
              minimumImprovements={minimumImprovements}
              latestMockLabel={effectiveStudent?.latestMockLabel || ""}
              courseRules={courseRules}
              changes2028={changes2028}
              schedules={schedules}
              caseStats={caseStats}
              recommendation={recommendation}
              recommendationStatus={recommendationDisplayStatus}
              recommendationProgress={recommendationProgress}
              studentSubjects={studentSubjects}
              schoolTrend={schoolTrend}
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
              onAddSupportPlan={addSupportPlanItem}
              supportPlan={supportPlan}
              onAddCompare={addCompareItem}
              compareTray={compareTray}
              onOpenWorkspace={() => navigateViewTab("workspace")}
            />) : <div style={ui.noResult}>조건에 맞는 결과가 없습니다. 위의 ‘현재 적용 조건’을 확인하고 연결 조건이나 검색 필터를 해제해주세요.</div>}
          </div>
          {pageCount > 1 && <Pagination page={page} pageCount={pageCount} onChange={changePage} />}
          <div style={ui.resultWorkflowFooter}>
            <div style={ui.guideCopy}><b>대학 정보를 확인했나요?</b><span>현재 성적 전체 후보를 조회하거나, 각 대학 카드의 버튼으로 특정 대학과 비슷한 대학을 찾을 수 있습니다.</span></div>
            <button type="button" style={ui.resultConnectPrimary} onClick={() => { setConnectionMode("grade"); setConnectionUniversity(""); navigateViewTab("connection"); }}>다음: 지원 연결 탐색 ›</button>
          </div>
        </div>}

        {viewTab === "workspace" && <SupportDecisionWorkspace
          selectedStudent={effectiveStudent}
          convertedGrade={conversion?.value}
          conversionMethod={conversionMethod}
          conversionGroup={conversionGroup}
          cutoffBasis={cutoffBasis}
          planItems={resolvedSupportPlan}
          compareItems={resolvedCompareTray}
          favoriteCount={favorites.length}
          onOpenCases={onOpenCases}
          onRemovePlan={removeSupportPlanItem}
          onRemoveCompare={removeCompareItem}
          onAddPlan={addSupportPlanItem}
          onGoResults={() => navigateViewTab("results")}
          onGoConnection={() => navigateViewTab("connection")}
          onOpenConsultation={onOpenConsultation}
          workspaceBusy={workspaceBusy || workspaceLoading || Boolean(workspaceLoadError)}
          workspaceLoading={workspaceLoading}
          workspaceLoadError={workspaceLoadError}
          data={data}
          workspaceMessage={workspaceMessage}
          recommendedData={recommendedData}
          caseRows={caseRows}
        />}

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
  const gradeReady = validGrade(convertedGrade) != null;
  const rawResults = resultSet?.allItems || resultSet?.items || [];
  const [displayMode, setDisplayMode] = useState("all");
  const [resultPage, setResultPage] = useState(1);
  const [selectedKey, setSelectedKey] = useState("");
  const [candidateQuery, setCandidateQuery] = useState("");
  const deferredCandidateQuery = useDeferredValue(candidateQuery);
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
  const connectionStats = useMemo(() => {
    let exact = 0, filteredOfficial = 0;
    const cuts = new Set();
    allResults.forEach(item => {
      if (Math.abs(Number(item.difference ?? item.linkDifference ?? 99)) < .005) exact += 1;
      if (item.officialCut != null) filteredOfficial += 1;
      cuts.add(Number(item.referenceCut).toFixed(2));
    });
    return { exact, distinctCuts: cuts.size, filteredOfficial, filteredIntegrated: allResults.length - filteredOfficial };
  }, [allResults]);
  const { exact, distinctCuts, filteredOfficial, filteredIntegrated } = connectionStats;

  useEffect(() => {
    setResultPage(1);
    setSelectedKey("");
    setCandidateQuery("");
  }, [mode, range, university, cutoffBasis, conversionMethod, conversionGroup]);
  useEffect(() => { setResultPage(1); setSelectedKey(""); }, [connectionBandFilters]);
  useEffect(() => { if (!gradeReady && connectionBandFilters.length) setConnectionBandFilters([]); }, [gradeReady, connectionBandFilters.length]);

  const searchedResults = useMemo(() => {
    const needle = compactText(deferredCandidateQuery);
    if (!needle) return allResults;
    return allResults.filter(item => compactText(`${item.university} ${item.department} ${item.originalDepartment || ""} ${item.field} ${item.track} ${item.admissionType}`).includes(needle));
  }, [allResults, deferredCandidateQuery]);
  const resultPageCount = Math.max(1, Math.ceil(searchedResults.length / CONNECTION_PAGE_SIZE));
  const compactResults = useMemo(() => representativeConnectionResults(searchedResults, CONNECTION_PAGE_SIZE, mode), [searchedResults, mode]);
  const summaryBandCounts = useMemo(() => compactResults.reduce((acc, item) => { const label = connectionSupportBand(item); acc[label] = (acc[label] || 0) + 1; return acc; }, {}), [compactResults]);
  const results = useMemo(() => displayMode === "all"
    ? searchedResults.slice((resultPage - 1) * CONNECTION_PAGE_SIZE, resultPage * CONNECTION_PAGE_SIZE)
    : compactResults, [displayMode, searchedResults, resultPage, compactResults]);
  const renderedResults = useMemo(() => results.map(item => ({
    item,
    trend: schoolCaseTrend(caseRows, item.university, item.region, item.integratedScope ? "" : (item.originalDepartment || item.department), item.admissionType),
  })), [results, caseRows]);
  const selectedItem = useMemo(() => searchedResults.find(item => item.key === selectedKey) || allResults.find(item => item.key === selectedKey) || null, [searchedResults, allResults, selectedKey]);
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

    {!results.length ? <div style={ui.connectionEmpty}>{mode === "grade" && !gradeReady ? "5등급 내신을 입력하거나 학생을 선택하면 성적대 연결 결과가 표시됩니다." : mode === "university" && !university ? "위의 ‘특정 대학과 비슷한 대학 찾기’를 선택한 뒤 기준 대학을 골라주세요." : connectionBandFilters.length ? "선택한 지원구간에 해당하는 후보가 없습니다. 우측 상단 지원구간 필터를 조정해보세요." : candidateQuery ? "검색어에 맞는 후보가 없습니다. 대학명이나 학과명을 줄여서 검색해보세요." : "선택한 범위에 연결되는 후보가 없습니다. 범위를 넓히거나 비교 기준을 바꿔주세요."}</div> : <div style={ui.connectionGrid}>{renderedResults.map(({ item, trend }) => {
      const difference = Math.abs(Number(mode === "grade" ? item.difference : item.linkDifference));
      const support = mode === "grade" ? supportBand(convertedGrade, item.referenceCut) : null;
      const favoriteItem = connectionFavoriteItem(item);
      const favorite = favorites.some(value => favoriteMatchesConnection(value, item));
      const selected = selectedKey === item.key;
      return <article key={`${mode}-${item.key}`} onClick={() => setSelectedKey(item.key)} style={{ ...ui.connectionCard, ...(selected ? ui.connectionCardSelected : {}) }}>
        <div style={ui.connectionCardHead}>
          <div style={ui.connectionUniversityWrap}><small style={ui.connectionEntityLabel}>대학</small><b style={ui.connectionUniversityName}>{item.university}</b><span>{item.admissionType}</span>{item.minimumSummary?.unsatisfied > 0 && <em style={ui.connectionMinimumDanger}>최저 미도달</em>}</div>
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

function ResultCard({ row, minimums, minimumEvaluations = [], minimumHistories = [], minimumImprovements = [], latestMockLabel = "", courseRules = [], changes2028 = [], schedules = [], caseStats = [], recommendation = null, recommendationStatus = "ready", recommendationProgress: recommendationProgressData = null, studentSubjects = [], schoolTrend = null, conversionGroup, convertedGrade, cutoffBasis = "70", favorite, favoriteEnabled, onToggleFavorite, onOpenCases, onConnectUniversity, onAddSupportPlan, supportPlan = [], onAddCompare, compareTray = [], onOpenWorkspace }) {
  const [open, setOpen] = useState(false);
  const [detailTab, setDetailTab] = useState("all");
  const [regionGroup, region, detailRegion, university, unit2026, unit2027, field, teaching, holistic, regular] = row;
  const minimumSummary = minimumEvaluationSummary(minimumEvaluations);
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
  const compareItem = { university, region, department: unit2027, field };
  const compareActive = compareTray.some(item => compareItemKey(item) === compareItemKey(compareItem));
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
          {minimumSummary.unsatisfied > 0 && <span style={ui.minimumAlertBadge}><AlertTriangle size={12}/>{minimumSummary.unsatisfied === minimumSummary.total ? "수능최저 미도달" : `수능최저 일부 미도달 ${minimumSummary.unsatisfied}건`}</span>}
        </div>
        <div style={ui.resultQuickStats}>
          <span><small>교과전형</small><b>{teaching?.length || 0}개</b></span>
          <span><small>종합전형</small><b>{holistic?.length || 0}개</b></span>
          <span><small>수능최저</small><b>{minimums?.length || 0}건</b></span>
        </div>
        <div style={ui.resultActions}>
          <button type="button" title={favoriteEnabled ? (favorite ? "즐겨찾기 해제" : "즐겨찾기 추가") : "학생을 먼저 선택하세요"} disabled={!favoriteEnabled} onClick={() => onToggleFavorite?.(favoriteItem)} style={{ ...ui.favoriteBtn, ...(favorite ? ui.favoriteBtnActive : {}), ...(!favoriteEnabled ? ui.favoriteBtnDisabled : {}) }}><Star size={16} fill={favorite ? "currentColor" : "none"}/></button>
          <button type="button" onClick={() => compareActive ? onOpenWorkspace?.() : onAddCompare?.(compareItem)} style={{ ...ui.compareAddButton, ...(compareActive ? ui.compareAddButtonActive : {}) }}>{compareActive ? "대학 비교 보기" : "대학 비교에 담기"}</button>
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
          <RecommendedSubjectPanel recommendation={recommendation} status={recommendationStatus} progress={recommendationProgressData} studentSubjects={studentSubjects} />
          <RelatedInfo courseRules={courseRules} changes2028={changes2028} schedules={schedules} />
        </div>
        <div style={ui.resultDetailArea}>
          <div className="susi-beta-detail-tabs" style={ui.detailTabs} role="tablist" aria-label={`${university} ${unit2027} 상세 정보`}>
            {tabs.map(([key, label]) => <button type="button" key={key} role="tab" aria-selected={detailTab === key} onClick={() => setDetailTab(key)} style={{ ...ui.detailTabButton, ...(detailTab === key ? ui.detailTabActive : {}) }}>{label}</button>)}
          </div>
          <div className="susi-beta-admission-columns" style={{ ...ui.admissionColumns, ...(detailTab !== "all" ? ui.admissionColumnsSingle : {}) }}>
            {(detailTab === "all" || detailTab === "teaching") && <AdmissionGroup title="교과전형" year="2026 입시결과" admissionType="교과" items={teaching} convertedGrade={convertedGrade} cutoffBasis={cutoffBasis} tone="teaching" university={university} region={region} department={unit2027} field={field} caseStats={caseStats} conversionGroup={conversionGroup} minimums={minimums} minimumEvaluations={minimumEvaluations} onAddSupportPlan={onAddSupportPlan} supportPlan={supportPlan} onOpenWorkspace={onOpenWorkspace} />}
            {(detailTab === "all" || detailTab === "holistic") && <AdmissionGroup title="종합전형" year="2026 입시결과" admissionType="종합" items={holistic} convertedGrade={convertedGrade} cutoffBasis={cutoffBasis} tone="holistic" university={university} region={region} department={unit2027} field={field} caseStats={caseStats} conversionGroup={conversionGroup} minimums={minimums} minimumEvaluations={minimumEvaluations} onAddSupportPlan={onAddSupportPlan} supportPlan={supportPlan} onOpenWorkspace={onOpenWorkspace} />}
            {(detailTab === "all" || detailTab === "regularMinimum") && <RegularGroup info={regular} />}
            {(detailTab === "all" || detailTab === "regularMinimum") && <MinimumGroup rows={minimums} evaluations={minimumEvaluations} histories={minimumHistories} improvements={minimumImprovements} latestMockLabel={latestMockLabel} />}
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
    <div className="print-criteria"><span>학생 9등급 환산 <b>{validGrade(convertedGrade) != null ? Number(convertedGrade).toFixed(2) : "-"}</b></span><span>환산 <b>{conversionMethod === "statistical" ? `통계 Beta · ${conversionGroup}` : "기존 환산"}</b></span><span>판정 <b>{cutoffBasis}%컷</b></span><span>검색 <b>{query || "전체"}</b></span><span>필터 <b>{[region, field, admissionType, minimumFilter].join(" · ")}</b></span></div>
    <table><thead><tr><th>대학</th><th>2027 모집단위</th><th>지역·계열</th><th>교과전형</th><th>종합전형</th><th>정시 참고</th><th>수능최저 · 자료연도 확인</th></tr></thead><tbody>{rows.map(({ row, minimums, minimumEvaluations = [] }, index) => <tr key={`${row[3]}-${row[5]}-${index}`}><td><b>{row[3]}</b></td><td>{row[5]}</td><td>{[row[1], row[6]].filter(Boolean).join(" · ")}</td><td>{printAdmissionSummary(row[7], cutoffBasis)}</td><td>{printAdmissionSummary(row[8], cutoffBasis)}</td><td>{row[9] ? `${row[9][0] || "일반"} · 70% ${row[9][2] ?? "-"}` : "-"}</td><td>{minimums?.slice(0, 2).map((item, i) => `${minimumEvaluations[i]?.year || "연도 확인"} ${item[3] || item[2] || "전형"}: ${minimumEvaluations[i]?.ruleText || item[8] || "확인"}`).join(" / ") || "-"}</td></tr>)}</tbody></table>
    <footer>※ 대학 공식 모집요강을 반드시 최종 확인하세요. 화면의 ‘현재 결과 인쇄·PDF’는 현재 페이지 최대 12개 모집단위를 A4 가로 1페이지로 정리합니다.</footer>
  </section>;
}

// '수시카드' 인쇄·PDF 버튼: 기존에 이 화면(지원 구성 워크스페이스)에는 인쇄 기능이 아예 없어서
// 눌러도 아무 반응이 없었습니다. PrintResultSheet와 같은 방식으로, 화면에는 보이지 않다가
// window.print() 시에만 나타나는 전용 인쇄용 표를 추가했습니다.
function PrintPlanSheet({ items = [], convertedGrade, cutoffBasis, student }) {
  const rows = items.filter(Boolean);
  const studentText = validGrade(convertedGrade) != null ? Number(convertedGrade).toFixed(2) : "-";
  return <section className="susi-beta-plan-print-sheet">
    <header><div><h1>수시 지원 구성</h1><p>2026 공개 컷 · 수능최저 연도는 전형별 표시</p></div><div><b>{student?.name ? `${student.sid || ''} ${student.name} 학생` : "학생 미선택"}</b><span>내신 9등급 환산 {studentText} · {cutoffBasis}%컷 판정</span></div></header>
    {rows.length ? <table><thead><tr><th>#</th><th>대학·학과</th><th>전형</th><th>학생 ↔ 컷</th><th>지원 구간</th><th>수능최저</th></tr></thead><tbody>{rows.map((item, index) => {
      const cut = item.admissionItem?.[cutoffBasis === "50" ? 1 : 2];
      const cutText = validGrade(cut) != null ? Number(cut).toFixed(2) : "-";
      const minimum = minimumDisplay(item.comparisonEvidence?.minimumEvaluation || item.minimumEvaluation, item.minimumStatus);
      return <tr key={supportPlanItemKey(item.stored)}>
        <td>{index + 1}</td>
        <td><b>{item.stored.university}</b><span>{item.stored.department}</span></td>
        <td>{item.stored.admissionType || "-"} · {item.stored.track || "-"}</td>
        <td>{studentText} ↔ {cutText}</td>
        <td>{item.support?.label || "판정 자료 없음"}</td>
        <td>{minimum.label}<span>{(item.comparisonEvidence?.minimumEvaluation || item.minimumEvaluation)?.year || '연도 확인'} · {item.comparisonEvidence?.minimumText || item.minimumEvaluation?.ruleText || minimum.reason}</span></td>
      </tr>;
    })}</tbody></table> : <p>담긴 지원 구성이 없습니다.</p>}
    <footer>※ 지원 구간·수능최저 판정은 참고용입니다. 대학 공식 모집요강을 반드시 최종 확인하세요.</footer>
  </section>;
}

function SectionTitle({ tone, title, year }) {
  const toneStyle = tone === "teaching" ? ui.sectionTeaching
    : tone === "holistic" ? ui.sectionHolistic
      : tone === "regular" ? ui.sectionRegular
        : ui.sectionMinimum;
  return <div style={ui.resultSectionTitle}><span style={{ ...ui.sectionTypeBadge, ...toneStyle }}>{title}</span><b>{year}</b></div>;
}
function AdmissionGroup({ title, year, admissionType, items = [], convertedGrade, cutoffBasis, tone, university, region, department = "", field = "", caseStats, conversionGroup, minimums = [], minimumEvaluations = [], onAddSupportPlan, supportPlan = [], onOpenWorkspace }) {
  return <div style={ui.resultSection}><SectionTitle tone={tone} title={title} year={year}/>{items.length ? <div style={{ ...ui.admissionItems, ...(items.length >= 4 ? ui.admissionItemsDense : {}) }}>{items.map((item, index) => {
    const selectedCutoff = cutoffValue(item, cutoffBasis);
    const diff = differenceLabel(convertedGrade, selectedCutoff);
    const support = supportBand(convertedGrade, selectedCutoff);
    const stat = bestCaseStat(caseStats, university, region, item[0], admissionType, conversionGroup);
    const cuts = caseCutForGroup(stat, conversionGroup);
    const planItem = { university, region, department, field, admissionType, track: item[0] || admissionType, source: "NAVI 통합 기준" };
    const inPlan = supportPlan.some(value => supportPlanItemKey(value) === supportPlanItemKey(planItem));
    const minimumStatus = matchingMinimumStatus(minimums, minimumEvaluations, admissionType, item[0]);
    const minimumMeta = naviMinimumStatusMeta(minimumStatus);
    return <div key={`${item[0]}-${index}`} style={{ ...ui.admissionItem, ...(tone === "teaching" ? ui.teachingItem : ui.holisticItem) }}>
      <div style={ui.admissionItemHead}><b style={ui.admissionName}>{item[0]}</b><span style={ui.admissionHeadBadges}>{support && <span style={{ ...ui.supportBadge, color: support.color, background: support.background, borderColor: support.border }}>{support.label}</span>}{minimumMeta && <span style={{ ...ui.minimumStatusBadge, ...minimumMeta.style }}>{minimumMeta.label}</span>}</span></div>
      <small style={ui.officialCutLabel}><span>대학 공개 2026 입시결과</span><b style={ui.officialCutBasisTag}>{cutoffBasis}%컷 기준 판정</b></small>
      <div style={ui.cutoffGrid}>
        <div style={{ ...ui.cutoffBox, ...(cutoffBasis === "50" ? ui.cutoffBoxActive : {}) }}><span style={ui.cutoffBoxLabel}>50%컷</span><b style={ui.cutoffBoxValue}>{item[1] ?? "-"}</b></div>
        <div style={{ ...ui.cutoffBox, ...(cutoffBasis === "70" ? ui.cutoffBoxActive : {}) }}><span style={ui.cutoffBoxLabel}>70%컷</span><b style={ui.cutoffBoxValue}>{item[2] ?? "-"}</b></div>
      </div>
      {diff && <small style={{ ...ui.studentDifference, color: diff.favorable ? "#287348" : "#b05244" }}>학생 환산 − {cutoffBasis}%컷 <b>{diff.text}</b></small>}
      <SupportPlanButton compact active={inPlan} onClick={() => inPlan ? onOpenWorkspace?.() : onAddSupportPlan?.(planItem)}>{inPlan ? "저장됨 · 지원 구성 보기" : "수시지원 추가"}</SupportPlanButton>
      {cuts?.[0] ? <CaseDistribution cuts={cuts} cutoffBasis={cutoffBasis} /> : <small style={ui.caseNone}>NAVI 통합 사례 분포 없음</small>}
    </div>;
  })}</div> : <span style={ui.none}>자료 없음</span>}</div>;
}
function CaseDistribution({ cuts, cutoffBasis = "70" }) {
  const [open, setOpen] = useState(false);
  const [count, p30, p50, p70] = cuts || [];
  if (![p30, p50, p70].some(value => validGrade(value) != null)) return null;
  return <div style={ui.caseDisclosure}>
    <button type="button" onClick={() => setOpen(value => !value)} style={ui.caseToggleBtn}>
      <span style={ui.caseToggleIdentity}><small>NAVI 통합 사례</small><b>대학 · 전형 · 계열 통합</b></span>
      <span style={ui.caseToggleCount}><strong>{Number(count || 0).toLocaleString()}</strong><small>지원사례</small></span>
      <span style={ui.caseToggleAction}>{open ? "컷 닫기" : "30·50·70%컷 보기"}</span>
    </button>
    {open && <><div style={ui.caseCutGrid}>
      {[["30%", p30, ui.case30], ["50%", p50, ui.case50], ["70%", p70, ui.case70]].map(([label, value, toneStyle]) => {
        const selected = label.replace("%", "") === cutoffBasis;
        return <div key={label} style={{ ...ui.caseCutCard, ...toneStyle, ...(selected ? ui.caseCutSelected : {}) }}><span style={ui.caseCutLabel}>{label} 컷{selected ? " · 현재 기준" : ""}</span><b style={ui.caseCutValue}>{validGrade(value) != null ? Number(value).toFixed(2) : "-"}</b></div>;
      })}
    </div><small style={ui.caseScopeNote}><b>선택한 교과 조합 기준</b><span>경기도교육청 NAVI 사례를 학과 구분 없이 대학·전형·계열 단위로 통합한 통계입니다.</span></small></>}
  </div>;
}


export function RecommendedSubjectPanel({ recommendation, status = "ready", progress, studentSubjects = [] }) {
  if (!recommendation && ["idle", "loading"].includes(status)) return <div role="status" aria-live="polite" style={ui.recommendEmpty}><span>2028 권장과목</span><b><Loader2 className="spin" size={14}/> 권장과목 자료 연결 중</b><small>대학별 공식 자료와 여러 대학 공통 권장과목을 확인하고 있습니다.</small></div>;
  if (!recommendation && status === "error") return <div role="status" style={ui.recommendEmpty}><span>2028 권장과목</span><b>권장과목 자료 연결 실패</b><small>화면 위의 ‘권장과목 다시 연결’을 눌러주세요. 연결 전에는 자료 없음으로 판정하지 않습니다.</small></div>;
  if (!recommendation && status === "empty") return <div style={ui.recommendEmpty}><span>2028 권장과목</span><b>학교 공용 권장과목 자료 미등록</b><small>관리자가 어디가 공식 XLSX를 반영하면 대학 발표 자료와 여러 대학 공통 과목을 연결합니다.</small></div>;
  if (!recommendation) return <div style={ui.recommendEmpty}><span>2028 권장과목</span><b>공식·유사학과 반복 자료 없음</b><small>해당 대학 공식 자료가 없고, 4개 이상 대학의 동일·유사학과에서도 2개 대학·25% 이상 반복된 과목이 확인되지 않았습니다.</small></div>;
  const core = uniqueCourseNames(recommendation.core?.length ? recommendation.core : recommendation.required || []);
  const coreKeys = new Set(core.map(courseMatchKey));
  const recommended = uniqueCourseNames(recommendation.recommended || []).filter(course => !coreKeys.has(courseMatchKey(course)));
  const recommendedKeys = new Set([...coreKeys, ...recommended.map(courseMatchKey)]);
  const noteRecommended = uniqueCourseNames(recommendation.noteRecommended || []).filter(course => !recommendedKeys.has(courseMatchKey(course)));
  const occupied = new Set([...recommendedKeys, ...noteRecommended.map(courseMatchKey)]);
  const reflected = uniqueCourseNames(recommendation.reflected || []).filter(course => !occupied.has(courseMatchKey(course)));
  const universityFieldEstimate = recommendation.estimateKind === 'university-field';
  const groups = (universityFieldEstimate
    ? [['동일 대학·계열 공통 핵심과목', core], ['동일 대학·계열 공통 권장과목', recommended]]
    : recommendation.estimated
    ? [['여러 대학 공통 핵심과목', core], ['여러 대학 공통 권장과목', recommended]]
    : [['핵심과목', core], ['권장과목', recommended], ['비고란 이수 권장', noteRecommended], ['반영과목', reflected]])
    .filter(([, courses]) => courses.length);
  const allCourses = uniqueCourseNames(groups.flatMap(([, courses]) => courses));
  const confirmed = allCourses.filter(course => studentCourseMatch(studentSubjects, course)).length;
  const enrolledOnly = allCourses.filter(course => matchedStudentCourse(studentSubjects, course)?.source === 'timetable').length;
  // 3번 요청: 추정치일 때 참고한 여러 대학 중 2곳 이상에서 겹치는 과목은 ★로 표시해,
  // 한 대학만의 특이한 과목과 구분되게 합니다.
  const isCommon = course => recommendation.estimated && recommendation.commonCourses?.includes(course);
  const renderCourse = (course, tone) => {
    const evidence = matchedStudentCourse(studentSubjects, course);
    const matched = Boolean(evidence);
    const timetableOnly = evidence?.source === 'timetable';
    const evidenceSubject = normalizeText(evidence?.subject);
    const common = isCommon(course);
    const evidenceLabel = timetableOnly
      ? `${evidence?.semesterKey || '현재'} 시간표·선택과목 명단에서 ${evidenceSubject || course} 수강 중으로 확인`
      : matched
        ? `저장된 학생 성적 과목 ${evidenceSubject || course}에서 확인`
        : "성적·시간표·선택과목 명단에서 확인되지 않음";
    const evidenceCount = recommendation.mentionCounts?.[course] || 0;
    const evidenceScope = universityFieldEstimate ? '모집단위' : '대학';
    return <span key={`${tone}-${course}`} title={`${evidenceLabel}${recommendation.estimated ? ` · 표본 ${recommendation.referenceCount || 0}개 ${evidenceScope} 중 ${evidenceCount}개 ${evidenceScope} 제시` : ""}`} style={{ ...ui.recommendCourseChip, ...(timetableOnly ? ui.recommendCourseEnrolled : matched ? ui.recommendCourseMatched : ui.recommendCourseMissing) }}><b>{timetableOnly ? "◇" : matched ? "✓" : "○"}</b>{common ? "★ " : ""}{recommendedCourseDisplayName(course)}{recommendation.estimated && evidenceCount ? <small>{evidenceCount}/{recommendation.referenceCount}</small> : null}</span>;
  };
  return <div className="susi-beta-recommend-panel" style={ui.recommendPanel}>
    <div className="kd-recommend-heading">
      <strong>{universityFieldEstimate ? '해당 대학 동일 계열 공통과목' : recommendation.estimated ? '여러 대학 반복 이수과목' : '핵심·권장과목'}</strong>
      {allCourses.length > 0 && <span className="kd-recommend-count">이수·수강 확인 <b>{confirmed}/{allCourses.length}</b>{enrolledOnly > 0 && <em> · 수강 중 {enrolledOnly}</em>}</span>}
    </div>
    <small className={`kd-recommend-source${recommendation.estimated ? ' is-estimated' : ''}`}>{universityFieldEstimate ? `해당 학과 직접 자료 없음 · ${recommendation.officialFieldLabel || '동일 계열'} ${recommendation.referenceCount || 0}개 모집단위 중 ${recommendation.consensusThreshold || 0}개 이상 반복` : recommendation.estimated ? `해당 대학 공식 과목자료 없음 · ${recommendation.referenceCount || 0}개 대학 중 ${recommendation.consensusThreshold || 0}개 이상 반복` : '2028 해당 대학 발표 자료'}</small>
    {groups.map(([label, courses]) => <div key={label} style={ui.recommendCourseGroup}>
      <strong>{label} <small>{courses.length}개</small></strong>
      <div className="kd-recommend-courses">{courses.map(course => renderCourse(course, label))}</div>
    </div>)}
    <small className="kd-recommend-legend">✓ 이수 완료 · ◇ 시간표상 수강 중 · ○ 미이수</small>
    <details className="kd-recommend-more"><summary>판정 기준·출처</summary>
      <p>{recommendation.scope}{recommendation.matchedDepartment ? ` · ${recommendation.matchedDepartment}` : ''}</p>
      {universityFieldEstimate ? <p>{recommendation.estimatedFrom?.join(', ') || '같은 대학의 동일 계열 모집단위'} 등 이 대학이 발표한 {recommendation.referenceCount || 0}개 ‘{recommendation.officialFieldLabel || '동일 계열'}’ 모집단위를 비교했습니다. 그중 과반인 {recommendation.consensusThreshold || 0}개 이상에서 반복된 과목만 표시합니다. 같은 대학의 공식 계열 자료를 활용한 참고값이지만, 해당 학과가 직접 발표한 필수 기준은 아닙니다.</p>
        : recommendation.estimated && <p>{recommendation.estimatedFrom?.join(', ') || '동일 학과군의 다른 대학'} 등을 포함한 {recommendation.referenceCount || 0}개 대학을 비교했습니다. 최소 {recommendation.consensusThreshold || 0}개 대학(표본의 25% 이상)이 반복 제시한 과목을 표시하고, {recommendation.strongConsensusThreshold || 0}개 대학(50% 이상)이 제시한 강한 공통과목은 ★로 표시합니다. 한 대학만 제시한 특이 과목은 제외하며 해당 대학의 공식 기준은 아닙니다.</p>}
      {!!recommendation.notes?.length && <div style={ui.recommendNotes}><strong>대학 안내</strong>{recommendation.notes.map((note, index) => <span key={`${note}-${index}`}>{note}</span>)}</div>}
      <p>시간표상 수강 중은 성적이 아직 없는 과목을 포함합니다. 미이수는 현재 저장된 성적·시간표 기준이며, 자료 누락 가능성이 있으면 학교생활기록부와 함께 확인하세요. 권장과목은 필수 지원자격과 다릅니다.</p>
      {(!recommendation.estimated || universityFieldEstimate) && <a href={recommendation.source?.url || OFFICIAL_RECOMMENDED_SOURCE_URL} target="_blank" rel="noreferrer">어디가 공식 자료 ↗</a>}
    </details>
  </div>;
}

function compactCutSummary(items = []) {
  return { cut50: cutoffRange(items, 1), cut70: cutoffRange(items, 2) };
}
function minimumWorkspaceMeta(status) {
  if (status === "unsatisfied") return { label: "최저 미도달", style: ui.workspaceMinimumDanger };
  if (status === "satisfied") return { label: "최저 충족", style: ui.workspaceMinimumSuccess };
  if (status === "manual") return { label: "최저 조건 확인", style: ui.workspaceMinimumWarning };
  if (status === "unavailable") return { label: "모평 미입력", style: ui.workspaceMinimumNeutral };
  if (status === "no-minimum") return { label: "최저 없음", style: ui.workspaceMinimumNeutral };
  // "자료가 아직 연결되지 않음"은 경고가 아니라 중립 상태이므로, 진짜 확인이 필요한
  // manual과는 다른 회색 배지로 표시합니다(주의색 남용 방지).
  return { label: "최저 자료 미연결", style: ui.workspaceMinimumNeutral };
}
function SupportDecisionWorkspace({
  selectedStudent,
  convertedGrade,
  conversionMethod,
  conversionGroup,
  cutoffBasis,
  planItems = [],
  compareItems = [],
  favoriteCount = 0,
  onRemovePlan,
  onRemoveCompare,
  onAddPlan,
  onGoResults,
  onGoConnection,
  onOpenConsultation,
  onOpenCases,
  workspaceBusy,
  workspaceLoading,
  workspaceLoadError,
  data,
  workspaceMessage,
  recommendedData,
  caseRows = [],
}) {
  const supportCounts = planItems.reduce((acc, item) => {
    const label = item.support?.label || "판정없음";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const admissionCounts = planItems.reduce((acc, item) => {
    const label = item.stored?.admissionType || "미정";
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
  const minimumCounts = planItems.reduce((acc, item) => {
    const key = item.minimumStatus || "none";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const uniqueUniversityCount = new Set(planItems.map(item => universityIdentityKey(item?.stored?.university, item?.stored?.region || "")).filter(Boolean)).size;
  const slots = Array.from({ length: 6 }, (_, index) => planItems[index] || null);
  const comparisonRows = useMemo(() => buildComparisonRows({ compareItems, data: data || {}, caseRows, convertedGrade, cutoffBasis, conversionGroup, identity: universityIdentityKey, minimumContext:selectedStudent, evaluateMinimum: row => evaluateNaviMinimum(row, selectedStudent) }), [compareItems, data, caseRows, convertedGrade, cutoffBasis, conversionGroup, selectedStudent]);
  const planSectionRef = useRef(null);
  const comparisonSectionRef = useRef(null);
  const [planFocused, setPlanFocused] = useState(false);
  const goToSection = ref => { ref.current?.scrollIntoView({ behavior: "auto", block: "start" }); ref.current?.focus({ preventScroll: true }); };
  // 15번 요청: 전체 카드를 인쇄할지, 상담 중인 일부 전형만 인쇄할지 고를 수 있게 합니다.
  // 기본값은 "전체"이며, 지원 구성이 바뀌면(학생 전환 등) 선택 상태를 안전하게 초기화합니다.
  const [printAll, setPrintAll] = useState(true);
  const [printSelection, setPrintSelection] = useState(() => new Set());
  useEffect(() => { setPrintAll(true); setPrintSelection(new Set()); }, [selectedStudent?.sid]);
  // 카드 번호(1~6)가 실제 지원 구성 순서와 어긋나지 않도록, 선택 인쇄에서도 배열 안 위치는
  // 그대로 두고 선택되지 않은 자리만 비웁니다(예: 3번·5번만 골라도 인쇄물에 3번·5번으로 나옵니다).
  const printItems = printAll ? planItems : planItems.map(item => printSelection.has(supportPlanItemKey(item.stored)) ? item : null);
  const togglePrintSelection = itemKey => setPrintSelection(current => {
    const next = new Set(current);
    if (next.has(itemKey)) next.delete(itemKey); else next.add(itemKey);
    return next;
  });

  return <div className={`susi-beta-tab-panel susi-beta-workspace${planFocused ? ' is-plan-focused' : ''}`} style={ui.tabPanel}>
    <div className="susi-beta-workspace-hero" style={ui.workspaceHero}>
      <div><span style={ui.workspaceEyebrow}>상담 전략 · Patch94</span><h3>전형 비교와 수시 지원 구성</h3><p>관심 대학의 전형별 근거를 비교하고, 상담할 지원 후보를 최대 6개로 정리하세요.</p></div>
      <div style={ui.workspaceStudent}><small>현재 학생</small><b>{selectedStudent?.sid ? `${selectedStudent.sid} ${selectedStudent.name || ""}` : "학생 미선택"}</b><span>내신 9등급 환산 {validGrade(convertedGrade) != null ? Number(convertedGrade).toFixed(2) : "-"} · {conversionMethod === "statistical" ? `통계 Beta ${conversionGroup}` : "기존 환산"} · {cutoffBasis}%컷 판정</span></div>
    </div>

    <div className="susi-beta-counsel-flow" style={ui.workspaceFlow}>
      <div style={ui.workspaceFlowCopy}><b>상담 흐름</b><span>관심 대학 저장 → NAVI 기준 확인 → 지원 구성/비교 → 상담 기록으로 이어집니다.</span></div>
      <div style={ui.workspaceFlowStats}><span><small>관심 대학</small><b>{favoriteCount}개</b></span><span><small>지원 구성</small><b>{planItems.length}/6</b></span><span><small>대학 비교</small><b>{compareItems.length}/5</b></span></div>
      {onOpenConsultation && <button type="button" style={ui.workspaceConsultButton} onClick={onOpenConsultation}><Star size={14}/>관심대학·상담으로</button>}
    </div>

    <nav className="kd-workspace-jumps" aria-label="상담 작업 바로가기"><button type="button" onClick={onGoResults}>1. 대학 상세에서 담기</button><button type="button" onClick={() => goToSection(comparisonSectionRef)}>2. 전형 비교 {compareItems.length}/5</button><button type="button" onClick={() => goToSection(planSectionRef)}>3. 지원 구성 {planItems.length}/6</button>{onOpenConsultation && <button type="button" onClick={onOpenConsultation}>4. 상담 기록</button>}</nav>
    <p className="kd-comparison-note">성적 기준: 5등급 내신을 9등급으로 환산한 참고값입니다. 9등급제 학생의 원내신 자동 적용은 아직 지원하지 않습니다. 대학별 실제 환산점수와 구분해 확인하세요.</p>
    {workspaceLoading && <p role="status">지원 구성·비교 목록을 불러오는 중입니다.</p>}
    {workspaceMessage && <div role="status" style={ui.workspaceMessage}>{workspaceBusy && <Loader2 size={13} className="spin"/>}{workspaceMessage}</div>}

    <section className="kd-plan-section" ref={planSectionRef} tabIndex={-1} aria-label="수시 지원 구성" style={{...ui.workspaceSection,scrollMarginTop:12}}>
      <div style={ui.workspaceSectionHead}><div><b>수시 지원 구성</b><span>교과·종합·논술·실기 등 상담에서 검토할 전형을 최대 6개까지 정리합니다.</span></div><span style={ui.workspaceCount}>{planItems.length}/6</span></div>
      <div className="kd-plan-tools is-primary"><button type="button" className="kd-plan-action is-focus" aria-pressed={planFocused} onClick={()=>{setPlanFocused(value=>!value);requestAnimationFrame(()=>goToSection(planSectionRef));}}><LayoutGrid size={15}/>{planFocused ? '전체 작업 화면' : '6장 모아보기'}</button><SupportPlanPrint items={printItems} student={selectedStudent} studentGrade={convertedGrade} cutoffBasis={cutoffBasis} disabled={workspaceBusy || workspaceLoading || Boolean(workspaceLoadError) || !selectedStudent?.sid || !printItems.filter(Boolean).length}/><small className="kd-plan-student-context">{selectedStudent?.sid} {selectedStudent?.name} · {selectedStudent?.latestMockLabel || '모평 미선택'}</small></div>
      {/* 15번 요청: 카드 전체를 인쇄할지 상담 중인 일부 전형만 인쇄할지 선택합니다. */}
      {planItems.length > 0 && <div className="kd-plan-tools" style={{ flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 11.5, color: "#6b7688", fontWeight: 700 }}>인쇄 대상</span>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}><input type="radio" checked={printAll} onChange={() => setPrintAll(true)} />전체 {planItems.length}개</label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}><input type="radio" checked={!printAll} onChange={() => setPrintAll(false)} />선택한 전형만 ({printSelection.size}개)</label>
        {!printAll && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", width: "100%" }}>
          {planItems.map(item => {
            const itemKey = supportPlanItemKey(item.stored);
            return <label key={itemKey} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, border: "1px solid #d7e1ea", borderRadius: 8, padding: "3px 8px" }}>
              <input type="checkbox" checked={printSelection.has(itemKey)} onChange={() => togglePrintSelection(itemKey)} />
              {item.stored.university} {item.stored.department}
            </label>;
          })}
        </div>}
      </div>}
      <div className="kd-plan-tools is-summary"><button type="button" className="kd-plan-action is-summary-print" disabled={!planItems.length || workspaceBusy || workspaceLoading || Boolean(workspaceLoadError)} onClick={()=>triggerSectionPrint('kd-print-target-plan')}><Printer size={14}/>간단 요약표 인쇄</button></div>
      <PrintPlanSheet items={slots} convertedGrade={convertedGrade} cutoffBasis={cutoffBasis} student={selectedStudent}/>
      {/* 1번 요청: 긴 문장 하나를 그대로 넣으면 좁은 칸에서 단어 중간이 아니라 " · " 뒤에서
          꺾여 마지막 항목만 혼자 남는 문제가 있었습니다. 항목마다 색이 있는 배지로 나누면
          몇 개가 남든 배지 단위로만 줄바꿈되어 항상 자연스럽습니다. */}
      <div className="susi-beta-workspace-summary" style={ui.workspaceSummaryGrid}>
        <div><small>지원 구간</small><div style={ui.summaryChipRow}>
          {["상향","소신","적정","안정","하향"].filter(label => supportCounts[label]).map(label => {
            const meta = SUPPORT_META[label];
            return <span key={label} style={{ ...ui.summaryChip, color: meta.color, background: meta.background, borderColor: meta.border }}>{label} {supportCounts[label]}</span>;
          })}
          {!Object.keys(supportCounts).length && <span style={ui.summaryChipEmpty}>판정 자료 없음</span>}
        </div></div>
        <div><small>전형 구성</small><div style={ui.summaryChipRow}>
          {Object.entries(admissionCounts).map(([label,count]) => {
            const accent = ADMISSION_TYPE_CHIP_META[trackAccentKey(label)] || ADMISSION_TYPE_CHIP_META.other;
            return <span key={label} style={{ ...ui.summaryChip, ...accent }}>{label} {count}</span>;
          })}
          {!Object.keys(admissionCounts).length && <span style={ui.summaryChipEmpty}>-</span>}
        </div></div>
        <div><small>수능최저</small><div style={ui.summaryChipRow}>
          {[["satisfied","충족"],["unsatisfied","미도달"],["no-minimum","최저 없음"],["manual","확인 필요"],["unavailable","성적 없음"]].map(([key,label]) => {
            const count = key === "manual" ? (minimumCounts.manual || 0) + (minimumCounts.unlinked || 0) : (minimumCounts[key] || 0);
            if (!count) return null;
            const meta = naviMinimumStatusMeta(key === "manual" ? "manual" : key)?.style || ui.minimumStatusNeutral;
            return <span key={key} style={{ ...ui.summaryChip, color: meta.color, background: meta.background, borderColor: (meta.border||"").replace("1px solid ","") }}>{label} {count}</span>;
          })}
          {!planItems.length && <span style={ui.summaryChipEmpty}>판정 자료 없음</span>}
        </div></div>
        <div><small>대학 분산</small><b>{planItems.length ? `${uniqueUniversityCount}개 대학 · ${planItems.length}개 전형` : "지원 후보 없음"}</b></div>
      </div>
      <div className="susi-beta-plan-grid" style={ui.planGrid}>{slots.map((item, index) => {
        if (!item) return <article className="susi-beta-plan-empty" key={`empty-${index}`} style={ui.planEmpty}><span>{index + 1}</span><b>비어 있음</b><small>아래 전형 비교, NAVI 대학 상세 또는 광덕고 대입결과에서 ‘수시지원 추가’를 눌러 담으세요.</small></article>;
        return <SupportDecisionCard key={supportPlanItemKey(item.stored)} item={item} index={index} studentGrade={convertedGrade} cutoffBasis={cutoffBasis} student={selectedStudent} busy={workspaceBusy} onRemove={onRemovePlan} onOpenCases={onOpenCases}/>;
      })}</div>
      <div className="kd-plan-footer" style={ui.workspaceFooter}><span>지원 구간은 현재 학생 환산등급과 선택한 {cutoffBasis}%컷을 기준으로 다시 계산됩니다.</span><button type="button" style={ui.workspaceSecondary} onClick={onGoResults}>대학 상세에서 추가</button></div>
    </section>

    <div ref={comparisonSectionRef} tabIndex={-1} aria-label="전형별 비교 영역" style={{minWidth:0,scrollMarginTop:100}}>
      <AdmissionComparison rows={comparisonRows} compareItems={compareItems} planItems={planItems} source={data?.source} cutoffBasis={cutoffBasis} convertedGrade={convertedGrade} student={selectedStudent} busy={workspaceBusy} loading={workspaceLoading} error={workspaceLoadError} studentSid={selectedStudent?.sid} onAddPlan={onAddPlan} onRemoveCompare={onRemoveCompare} onGoResults={onGoResults} planKey={supportPlanItemKey}/>
    </div>
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
function MinimumGroup({ rows = [], evaluations = [], histories = [], improvements = [], latestMockLabel = "" }) {
  const [expanded,setExpanded]=useState(false);
  return <div style={ui.resultSection}><SectionTitle tone="minimum" title="수능최저" year="자료 학년도 표시"/>{rows.length>2&&<button type="button" style={ui.caseToggleBtn} onClick={()=>setExpanded(v=>!v)}>{expanded?'접기':`전형 ${rows.length}개 전체 보기`}</button>}{rows.length ? <div style={ui.minimumList}>{(expanded?rows:rows.slice(0, 2)).map((row, index) => {
    const evaluation = evaluations[index];
    const meta = naviMinimumStatusMeta(evaluation?.status);
    const history = histories[index];
    const improvement = improvements[index];
    // 4번 요청: "조건 확인 필요" 상태에서 원문 조각(예: 그냥 숫자 "5")만 뚝 떨어져 나오면
    // 무슨 뜻인지 알기 어렵습니다. 자동 판정이 안 되는 상태(manual)에서는 원문 대신 왜
    // 확인이 필요한지 이유를 보여줍니다.
    const isManual = evaluation?.status === "manual";
    return <div key={`${row[3]}-${index}`} style={{ ...ui.minimumItem, ...(evaluation?.status === "unsatisfied" ? ui.minimumItemDanger : {}) }}>
      <div style={ui.minimumHead}><b>{row[3] || row[2] || "전형"}</b><span style={{...ui.minimumYearBadge,...(evaluation?.yearMismatch?ui.minimumYearBadgeReference:{})}}>{minimumYearLabel(evaluation)} · {row[2] || "수시"}</span></div>
      <div style={ui.minimumCriteriaRow}>{isManual ? <small style={ui.minimumNote}>{evaluation.reason}</small> : <strong style={ui.minimumCriteria}>{evaluation?.ruleText || row[8] || "기준 원문 확인"}</strong>}{meta && <span style={{ ...ui.minimumStatusBadge, ...meta.style }}>{meta.label}</span>}</div>
      {evaluation?.source&&<small style={ui.minimumEvaluationNote}>{evaluation.source}</small>}
      {!isManual && <small style={ui.minimumNote}>{[(evaluation?.subjectsText || row[6]) && `반영영역 ${evaluation?.subjectsText || row[6]}`, (evaluation?.note ?? row[10]) || ''].filter(Boolean).join(" · ")}</small>}
      {meta && latestMockLabel && <small style={ui.minimumEvaluationNote}>{latestMockLabel} 기준 판정</small>}
      {/* 3번 요청: 여러 회차를 응시했다면 "최근 N회 중 M회 충족"을 함께 보여줍니다. */}
      {history && history.decidedCount > 0 && <small style={ui.minimumEvaluationNote}>최근 {history.decidedCount}회 중 {history.satisfiedCount}회 충족</small>}
      {/* 4번 요청: 미충족일 때 어느 과목을 몇 등급 올리면 충족되는지 미리 계산해 보여줍니다. */}
      {evaluation?.status === "unsatisfied" && improvement && <small style={{ ...ui.minimumEvaluationNote, color: "#8a6d1f" }}>{improvementAdviceText(improvement)}</small>}
    </div>;
  })}</div> : <span style={ui.none}>해당 모집단위 수능최저 자료 없음</span>}</div>;
}

const ui = {
  root: { display: "grid", gap: 15, fontFamily: "KDRound,Pretendard, 'Noto Sans KR', system-ui, sans-serif", color: "#222a3a", fontSize: 14, lineHeight: 1.55 },
  loading: { minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#647086", fontWeight: 750 },
  retryButton: { minHeight: 36, padding: "0 14px", border: "1px solid #c7d3e3", borderRadius: 9, background: "#fff", color: "#35557f", fontWeight: 850, cursor: "pointer" },
  optionalLoadNotice: { display: "flex", alignItems: "center", gap: 7, padding: "8px 11px", border: "1px solid #d7e2ef", borderRadius: 10, background: "#f5f9fd", color: "#58708f", fontSize: 11.5, fontWeight: 750 },
  optionalLoadError: { borderColor: "#ebcfbf", background: "#fff8f2", color: "#8a5134" },
  // 배너·인쇄 버튼처럼 클릭을 유도하거나 브랜드를 나타내는 요소는 "수시 지원 구성" 탭의
  // 강조색(#9a3412, --kd-brand)과 같은 계열로 통일했습니다(예전엔 배너는 보라, 인쇄 버튼은
  // 남색으로 서로 달랐습니다). NAVI 대학찾기 화면의 보라/파랑 배지·활성탭 색은 그 화면 안에서
  // 이미 서로 다른 의미(활성 탭, NAVI 자료, 광덕고 자료 등)를 구분하고 있어 그대로 두었습니다.
  hero: { padding: "23px 25px", borderRadius: 18, display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 18, color: "#fff", background: "linear-gradient(135deg,var(--kd-brand),#c2622f)", boxShadow: "0 14px 34px rgba(154,52,18,.22)" },
  heroIntro: { flex: "1 1 320px", minWidth: 0 },
  heroActions: { flex: "0 0 auto", flexWrap: "nowrap" },
  heroEyebrow: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 850, opacity: .86, wordBreak: "keep-all" },
  heroTitle: { margin: "6px 0 4px", fontSize: 25, lineHeight: 1.15, letterSpacing: "-.03em", wordBreak: "keep-all" },
  // 2번 요청: "조회합니다"처럼 한 단어 중간이 다음 줄로 잘려 나가는 문제 — 폭을 좁게 제한(maxWidth)해둔
  // 상태에서 word-break 지정이 없어 한글이 어절 단위가 아니라 글자 단위로 끊기고 있었습니다.
  // 폭 제한을 없애 한 줄에 다 들어가게 하고, 혹시 더 좁은 화면에서 줄바꿈이 필요해지더라도
  // keep-all로 어절 단위로만 꺾이게 합니다.
  heroText: { margin: 0, fontSize: 13.5, lineHeight: 1.6, opacity: .9, wordBreak: "keep-all" },
  heroStats: { minWidth: 170, display: "grid", gap: 4, textAlign: "right", whiteSpace: "nowrap" },
  betaBadge: { display: "inline-flex", padding: "3px 7px", borderRadius: 999, background: "#eee8ff", color: "#6b55a0", fontSize: 11, fontWeight: 900, verticalAlign: "middle" },
  betaNotice: { display: "flex", gap: 9, alignItems: "flex-start", padding: "11px 14px", border: "1px solid #e5d9b7", borderRadius: 12, background: "#fff9e9", color: "#6e5923", fontSize: 13.5, lineHeight: 1.6 },
  viewToolbar: { position: "sticky", top: 6, zIndex: 12, display: "grid", gridTemplateColumns: "minmax(680px,860px) auto", justifyContent: "center", alignItems: "stretch", gap: 12, padding: 8, border: "1px solid #d8deea", borderRadius: 16, background: "rgba(255,255,255,.97)", boxShadow: "0 8px 22px rgba(44,53,69,.09)", backdropFilter: "blur(8px)" },
  viewTabs: { minWidth: 0, display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 6 },
  viewTab: { minWidth: 0, minHeight: 56, display: "grid", gridTemplateColumns: "28px minmax(0,1fr)", gridTemplateRows: "auto auto", columnGap: 9, alignContent: "center", textAlign: "left", padding: "8px 12px", borderWidth: 1, borderStyle: "solid", borderColor: "transparent", borderRadius: 12, background: "transparent", color: "#5e6a7d", cursor: "pointer" },
  viewTabActive: { borderColor: "#d6cbea", background: "linear-gradient(135deg,#f4f0fb,#fff)", color: "#594681", boxShadow: "0 3px 10px rgba(86,69,126,.12)" },
  viewToolbarActions: { display: "grid", gridTemplateColumns: "auto auto", alignItems: "stretch", gap: 7 },
  cutoffStatusChip: { minWidth: 132, display: "grid", placeItems: "center", alignContent: "center", gap: 1, padding: "6px 11px", border: "1px solid #d7cbea", borderRadius: 12, background: "linear-gradient(135deg,#f4effb,#fff)", color: "#5a4584", textAlign: "center", boxShadow: "0 4px 10px rgba(86,69,126,.08)" },
  printButton: { minWidth: 176, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, border: "1px solid var(--kd-brand)", borderRadius: 12, background: "var(--kd-brand)", color: "#fff", fontSize: 13, fontWeight: 900, cursor: "pointer", boxShadow: "0 5px 12px rgba(154,52,18,.22)" },
  tabPanel: { display: "grid", gap: 13 },
  tabGuide: { display: "grid", gridTemplateColumns: "180px minmax(0,1fr)", gap: 14, alignItems: "center", padding: "14px 16px", border: "1px solid #dce3ed", borderRadius: 14, background: "linear-gradient(135deg,#f7f9fd,#fff)", color: "#536176", fontSize: 13.5, lineHeight: 1.6 },
  goResultButton: { minHeight: 43, padding: "0 16px", border: "1px solid #5f4e87", borderRadius: 11, background: "#66558e", color: "#fff", fontSize: 13, fontWeight: 900, cursor: "pointer", boxShadow: "0 6px 14px rgba(86,69,126,.20)" },
  directResultButton: { minHeight: 43, padding: "0 14px", border: "1px solid #ccd7e5", borderRadius: 11, background: "#fff", color: "#52627a", fontSize: 12.5, fontWeight: 850, cursor: "pointer" },
  searchWorkflowFooter: { marginTop: 13, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "13px 15px", border: "1px solid #d8d0e8", borderRadius: 12, background: "linear-gradient(135deg,#f8f5fd,#fff)", color: "#606b7d", fontSize: 12.5, lineHeight: 1.55 },
  workflowCopy: { minWidth: 0, display: "grid", gap: 4 },
  workflowNextButton: { minHeight: 40, flex: "0 0 auto", padding: "0 15px", border: 0, borderRadius: 10, background: "#5f4d88", color: "#fff", fontSize: 12.5, fontWeight: 900, cursor: "pointer" },
  resultContextGuide: { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 18, padding: "16px 18px", border: "1px solid #d9e2ef", borderRadius: 14, background: "linear-gradient(135deg,#f5f8fd,#fff)", color: "#526075" },
  resultContextMain: { minWidth: 0, display: "grid", gap: 9 },
  resultHeadlineRow: { minWidth: 0, display: "flex", alignItems: "stretch", gap: 10, flexWrap: "wrap" },
  resultCountHero: { minWidth: 150, display: "grid", alignContent: "center", gap: 2, padding: "10px 13px", border: "1px solid #cfdae9", borderRadius: 11, background: "#fff", color: "#52627a" },
  resultMetricLabel: { fontSize: 11.5, fontWeight: 900, color: "#6d798b" },
  resultMetricValue: { fontSize: 25, lineHeight: 1.05, fontWeight: 950, letterSpacing: "-.03em", color: "#263c62" },
  resultCountUnit: { marginLeft: 3, fontStyle: "normal", fontSize: 12, fontWeight: 900, color: "#6d7b8d" },
  currentGradeHero: { minWidth: 310, display: "grid", gridTemplateColumns: "auto auto minmax(0,1fr)", alignItems: "center", gap: 9, padding: "10px 13px", border: "1px solid #c9d8ee", borderRadius: 11, background: "linear-gradient(135deg,#eaf3ff,#f8fbff)", color: "#315a91" },
  currentGradeLabel: { fontSize: 11.5, fontWeight: 950, color: "#58708f", whiteSpace: "nowrap" },
  currentGradeValue: { fontSize: 24, lineHeight: 1, fontWeight: 950, letterSpacing: "-.03em", color: "#244f86" },
  currentGradeHelp: { minWidth: 0, fontSize: 11.5, lineHeight: 1.35, fontWeight: 800, color: "#60799a", whiteSpace: "nowrap" },
  resultContextOneLine: { minWidth: 0, color: "#617087", fontSize: 12.2, lineHeight: 1.45, whiteSpace: "nowrap" },
  guideCopy: { minWidth: 0, display: "grid", gap: 6 },
  resultContextActions: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" },
  sourceGuideDetails: { border: "1px solid #dce3ec", borderRadius: 13, background: "#fbfcfe", overflow: "hidden" },
  sourceGuideSummary: { minHeight: 45, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "0 14px", cursor: "pointer", color: "#536176", listStyle: "none" },
  resultControlPanel: { display: "grid", gap: 10, padding: "14px", border: "1px solid #c9d8e8", borderRadius: 14, background: "linear-gradient(145deg,#f5f9fe,#ffffff)", boxShadow: "0 4px 14px rgba(48,73,104,.05)" },
  resultControlHeading: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", paddingBottom: 9, borderBottom: "1px solid #e5ebf2", color: "#354c68" },
  resultControlGrid: { display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 8, alignItems: "stretch" },
  resultSortControl: { position: "relative", minWidth: 0, minHeight: 42, display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", alignItems: "center", gap: 7, padding: "0 10px", border: "1px solid #ced8e5", borderRadius: 10, background: "#fff", color: "#59687c", boxSizing: "border-box", cursor: "pointer", overflow: "hidden" },
  resultSortNative: { position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" },
  resultSupportQuick: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "8px 9px", border: "1px solid #e1e7ef", borderRadius: 10, background: "rgba(255,255,255,.82)", color: "#5c6d82", fontSize: 11.5, fontWeight: 900 },
  resultSupportQuickBtn: { minHeight: 30, padding: "0 10px", border: "1px solid", borderRadius: 999, fontSize: 11.5, fontWeight: 950, cursor: "pointer" },
  resultSupportReset: { minHeight: 28, padding: "0 10px", border: "1px solid #d7dfe9", borderRadius: 999, background: "#fff", color: "#69768a", fontSize: 11.5, fontWeight: 900, cursor: "pointer" },
  dataSourceLegend: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  naviSourceCard: { minWidth: 0, display: "grid", gap: 4, padding: "12px 14px", border: "1px solid #d8d1e8", borderRadius: 12, background: "linear-gradient(135deg,#f6f2fb,#fff)", color: "#5f5277", fontSize: 11.5, lineHeight: 1.5 },
  schoolSourceCard: { minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", columnGap: 10, rowGap: 4, alignItems: "center", padding: "12px 14px", border: "1px solid #e4c3ca", borderRadius: 12, background: "linear-gradient(135deg,#fff3f5,#fffafb)", color: "#724650", fontSize: 11.5, lineHeight: 1.5 },
  sourceCardCopy: { minWidth: 0, display: "grid", gap: 3 },
  sourceLegendLink: { minHeight: 36, padding: "0 11px", border: "1px solid #ddb5bd", borderRadius: 9, background: "#fff", color: "#8a4050", fontSize: 12, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" },
  resultConnectPrimary: { minHeight: 40, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 14px", border: "1px solid #58447f", borderRadius: 10, background: "#604c89", color: "#fff", fontSize: 12.5, fontWeight: 950, cursor: "pointer", boxShadow: "0 5px 12px rgba(86,69,126,.18)" },
  resultWorkflowFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "16px 17px", border: "1px solid #d8d0e8", borderRadius: 13, background: "linear-gradient(135deg,#f7f3fc,#fff)", color: "#566276", fontSize: 12.5, lineHeight: 1.55 },
  detailSearchPanel: { display: "grid", gridTemplateColumns: "minmax(230px,.75fr) minmax(310px,1.15fr) minmax(260px,.9fr)", gap: 13, alignItems: "end", padding: "17px 18px", border: "1px solid #d9e2ef", borderRadius: 14, background: "linear-gradient(135deg,#f7faff,#fbf9ff)" },
  detailSearchHeading: { display: "grid", gap: 4, color: "#26384f" },
  detailSearchBox: { minWidth: 0, minHeight: 48, display: "flex", alignItems: "center", gap: 9, padding: "0 12px", border: "1px solid #c8d5e5", borderRadius: 11, background: "#fff", color: "#52657f", boxShadow: "0 3px 10px rgba(48,65,88,.05)" },
  detailUniversitySelect: { display: "grid", gap: 6, color: "#59687c", fontSize: 12, fontWeight: 900 },
  backToSearchButton: { flex: "0 0 auto", minHeight: 39, padding: "0 13px", border: "1px solid #cfd8e5", borderRadius: 10, background: "#fff", color: "#40516a", fontSize: 12.2, fontWeight: 850, cursor: "pointer" },
  resultFilterBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", border: "1px solid #e0e5ed", borderRadius: 12, background: "#fbfcfe", flexWrap: "wrap" },
  activeFilterWrap: { minWidth: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  activeFilterLabel: { color: "#7b8797", fontSize: 10.5, fontWeight: 900 },
  activeFilterChip: { display: "inline-flex", alignItems: "center", minHeight: 26, padding: "0 8px", borderRadius: 999, background: "#edf2f8", color: "#445875", border: "1px solid #d6e0ec", fontSize: 12, fontWeight: 850 },
  activeFilterEmpty: { color: "#9aa2ae", fontSize: 10.5 },
  clearFilterButton: { minHeight: 34, padding: "0 12px", border: "1px solid #e59a9a", borderRadius: 9, background: "#fff0f0", color: "#c83232", fontSize: 13, fontWeight: 950, cursor: "pointer", boxShadow: "0 3px 8px rgba(190,48,48,.08)" },
  resultCutoffControl: { display: "inline-flex", alignItems: "center", gap: 5, padding: 5, border: "1px solid #ddd5ea", borderRadius: 11, background: "#f2eef8", color: "#706480", fontSize: 11.5, fontWeight: 900 },
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
  fieldLabel: { display: "grid", gap: 6, minWidth: 0, fontSize: 12, fontWeight: 800, color: "#5d6678" },
  labelText: { fontSize: 12, fontWeight: 800, color: "#5d6678" },
  input: { width: "100%", boxSizing: "border-box", height: 42, border: "1px solid #ced7e5", borderRadius: 10, padding: "0 12px", fontSize: 16, fontWeight: 900, color: "#263c62", outline: "none" },
  select: { width: "100%", height: 42, border: "1px solid #ced7e5", borderRadius: 10, padding: "0 10px", background: "#fff", fontWeight: 750, color: "#344054" },
  methodBox: { display: "grid", gap: 6 },
  segmented: { display: "grid", gridTemplateColumns: "1fr 1fr", padding: 4, borderRadius: 11, background: "#eef1f6" },
  segmentBtn: { minHeight: 34, border: 0, borderRadius: 8, background: "transparent", color: "#657085", fontWeight: 800, cursor: "pointer" },
  segmentActive: { background: "#fff", color: "#5c4a89", boxShadow: "0 3px 8px rgba(57,65,83,.12)" },
  conversionResult: { display: "grid", alignContent: "center", gap: 2, padding: "9px 13px", borderRadius: 12, background: "linear-gradient(135deg,#f5f1ff,#faf8ff)", border: "1px solid #dcd2f0" },
  conversionLabel: { fontSize: 11, fontWeight: 850, color: "#73658d" },
  conversionValue: { fontSize: 21, lineHeight: 1.1, color: "#543f82" },
  conversionHelp: { fontSize: 10.5, color: "#817795" },
  statDisclaimer: { marginTop: 10, padding: "9px 11px", borderRadius: 10, background: "#f7f5fb", color: "#6d6381", fontSize: 11.5, lineHeight: 1.5 },
  studentAutoBar: { marginBottom: 12, display: "grid", gridTemplateColumns: "minmax(180px,.8fr) minmax(130px,.45fr) minmax(260px,1.4fr)", alignItems: "center", gap: 12, padding: "11px 13px", border: "1px solid #d4deed", borderRadius: 12, background: "linear-gradient(135deg,#f7faff,#fbfcff)" },
  studentAutoIdentity: { display: "grid", gap: 3, minWidth: 0 },
  studentAutoGrade: { display: "grid", gap: 2, padding: "7px 10px", borderRadius: 9, background: "#edf4ff", color: "#315a91" },
  filterGrid: { display: "grid", gridTemplateColumns: "minmax(260px,2fr) repeat(4,minmax(120px,.65fr))", gap: 11, alignItems: "end" },
  searchBox: { minHeight: 46, display: "flex", alignItems: "center", gap: 9, padding: "0 13px", border: "1px solid #cdd7e6", borderRadius: 12, background: "#fff", boxShadow: "0 2px 7px rgba(50,65,90,.025)" },
  filterLabel: { display: "grid", gridTemplateRows: "auto 1fr", gap: 5, fontSize: 11, fontWeight: 850, color: "#68758a" },
  multiFilter: { position: "relative", minWidth: 0, alignSelf: "stretch" },
  multiFilterCompact: { minHeight: 42 },
  multiFilterSummary: { minHeight: 42, display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", alignItems: "center", gap: 7, padding: "0 10px", border: "1px solid #ced8e5", borderRadius: 10, background: "#fff", color: "#59687c", cursor: "pointer", listStyle: "none", boxSizing: "border-box" },
  multiFilterMenu: { position: "absolute", top: "calc(100% + 5px)", left: 0, zIndex: 40, minWidth: "100%", width: "max-content", maxWidth: 280, maxHeight: 300, overflowY: "auto", display: "grid", gap: 3, padding: 6, border: "1px solid #d6dee9", borderRadius: 11, background: "#fff", boxShadow: "0 14px 32px rgba(40,54,75,.16)" },
  multiFilterOption: { minWidth: 145, minHeight: 31, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "0 9px", border: 0, borderRadius: 7, background: "transparent", color: "#526177", fontSize: 11.5, fontWeight: 850, textAlign: "left", cursor: "pointer" },
  multiFilterOptionActive: { background: "#eaf2fb", color: "#285b8d" },
  multiFilterClear: { minHeight: 30, marginTop: 3, border: "1px solid #efc2c2", borderRadius: 7, background: "#fff5f5", color: "#bd3e3e", fontSize: 12, fontWeight: 900, cursor: "pointer" },
  resultCount: { display: "flex", alignItems: "baseline", gap: 7, color: "#687386", fontSize: 11.5 },
  searchSummaryRow: { marginTop: 16, paddingTop: 14, borderTop: "1px solid #edf0f5", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" },
  searchSummaryTools: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" },
  favoriteFilterWrap: { display: "flex", alignItems: "center", gap: 9, padding: "5px 6px 5px 10px", border: "1px solid #e3e7ee", borderRadius: 11, background: "#fafbfc" },
  favoriteFilterLabel: { fontSize: 10.5, fontWeight: 850, color: "#8490a2" },
  favoriteFilterBtn: { minHeight: 32, display: "inline-flex", alignItems: "center", gap: 6, padding: "0 11px", border: "1px solid #d5ddea", borderRadius: 9, background: "#fff", color: "#667085", fontSize: 11.5, fontWeight: 850, cursor: "pointer" },
  favoriteFilterActive: { borderColor: "#e1c36d", background: "#fff7d9", color: "#9a660d", boxShadow: "0 3px 9px rgba(181,126,18,.11)" },
  supportFilterRow: { marginTop: 15, padding: "14px 15px", border: "1px solid #e0e5ef", borderRadius: 13, background: "linear-gradient(135deg,#fafbff,#f8f7fc)", display: "grid", gap: 12 },
  supportFilterTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" },
  supportFilterHeading: { minWidth: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, lineHeight: 1.4, color: "#344055", flexWrap: "wrap" },
  supportFilterEyebrow: { fontSize: 10.5, fontWeight: 900, color: "#735e9a", letterSpacing: ".02em", whiteSpace: "nowrap" },
  supportFilterOneLine: { minWidth: 0, display: "grid", gap: 2, fontSize: 11.4, color: "#4e596d", fontWeight: 780, lineHeight: 1.4 },
  globalConversionControls: { display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" },
  globalConversionBtn: { minHeight: 29, padding: "0 9px", border: "1px solid #d9dfea", borderRadius: 8, background: "#fff", color: "#6b7587", fontSize: 10.5, fontWeight: 850, cursor: "pointer" },
  globalConversionActive: { color: "#fff", background: "#66558e", borderColor: "#66558e", boxShadow: "0 3px 8px rgba(86,69,126,.16)" },
  globalConversionSelect: { height: 29, border: "1px solid #d4dce8", borderRadius: 8, background: "#fff", padding: "0 7px", color: "#4f5b70", fontSize: 10.5, fontWeight: 800 },
  supportFilterControls: { minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
  cutoffBasisToggle: { display: "inline-grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: 5, borderRadius: 13, background: "#e8ecf3", border: "1px solid #d9dfeb" },
  cutoffBasisBtn: { minWidth: 122, minHeight: 48, display: "grid", placeItems: "center", gap: 2, padding: "7px 12px", border: "1px solid transparent", borderRadius: 10, background: "transparent", color: "#727d8e", cursor: "pointer" },
  cutoffBasisActive: { background: "linear-gradient(135deg,#66558e,#7d6195)", color: "#fff", borderColor: "#5f4e87", boxShadow: "0 7px 16px rgba(86,69,126,.24)", transform: "translateY(-1px)" },
  supportLegend: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 7, flexWrap: "wrap" },
  supportFilterBtn: { minHeight: 30, padding: "0 11px", border: "1px solid #d7deea", borderRadius: 999, background: "#fff", color: "#657085", fontSize: 11, fontWeight: 850, cursor: "pointer" },
  supportFilterBtnActive: { background: "#5e5188", borderColor: "#5e5188", color: "#fff", boxShadow: "0 4px 10px rgba(94,81,136,.18)" },
  supportLegendItem: { minHeight: 30, display: "inline-flex", alignItems: "center", gap: 5, padding: "0 10px", border: "1px solid", borderRadius: 999, fontSize: 10.5, fontWeight: 800, cursor: "pointer" },
  supportSelected: { boxShadow: "0 0 0 2px rgba(74,85,115,.17)", transform: "translateY(-1px)" },
  caseStatsGuide: { display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", border: "1px solid #d9e1ee", borderRadius: 11, background: "#f7f9fd", color: "#5c687c", fontSize: 11.5, lineHeight: 1.5 },
  connectionPanel: { display: "grid", gap: 18, padding: 21, border: "1px solid #cbd8e7", borderRadius: 18, background: "linear-gradient(145deg,#ffffff,#f5f8fb)", boxShadow: "0 10px 26px rgba(44,62,86,.07)" },
  connectionHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  connectionHeadActions: { marginLeft: "auto", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" },
  connectionBandFilterTop: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5, flexWrap: "wrap", padding: "5px 7px", border: "1px solid #d8e0e9", borderRadius: 11, background: "#f7f9fc" },
  connectionBandLabel: { fontSize: 11.5, fontWeight: 950, color: "#66758a", marginRight: 2, whiteSpace: "nowrap" },
  connectionBandBtn: { minHeight: 28, padding: "0 8px", border: "1px solid", borderRadius: 999, fontSize: 11.2, fontWeight: 950, cursor: "pointer", whiteSpace: "nowrap" },
  connectionTitleWrap: { display: "flex", alignItems: "center", gap: 11, minWidth: 0 },
  connectionIcon: { width: 40, height: 40, flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 12, color: "#285d87", background: "#e8f1f8" },
  connectionTitle: { display: "block", fontSize: 20, lineHeight: 1.25, color: "#21324a" },
  connectionSub: { display: "block", maxWidth: 720, marginTop: 5, fontSize: 13, lineHeight: 1.6, color: "#69768a", wordBreak: "break-word", overflowWrap: "anywhere" },
  connectionModeToggle: { display: "inline-grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 4, borderRadius: 11, background: "#e9edf4" },
  connectionModeBtn: { minHeight: 34, padding: "0 13px", border: 0, borderRadius: 8, background: "transparent", color: "#687488", fontSize: 11.5, fontWeight: 900, cursor: "pointer" },
  connectionModeActive: { color: "#fff", background: "#5f4f88", boxShadow: "0 3px 9px rgba(86,69,126,.2)" },
  connectionModeChooser: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 },
  connectionModeCard: { minWidth: 0, display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", gridTemplateRows: "auto auto", columnGap: 12, rowGap: 5, alignItems: "center", padding: "15px 16px", border: "1px solid #d4deea", borderRadius: 14, background: "#fff", color: "#526075", textAlign: "left", cursor: "pointer" },
  connectionModeCardActive: { borderColor: "#315f88", background: "linear-gradient(135deg,#edf5fb,#fff)", color: "#234d73", boxShadow: "0 0 0 2px rgba(49,95,136,.11),0 7px 16px rgba(43,79,112,.10)" },
  connectionUniversitySelector: { minHeight: 78, padding: "9px 10px", border: "1px solid #d9e1ec", borderRadius: 12, background: "#f8fafd" },
  connectionControls: { display: "grid", gridTemplateColumns: "minmax(0,1.65fr) minmax(185px,.55fr) minmax(155px,.42fr)", gap: 12, alignItems: "stretch" },
  connectionCriterion: { minHeight: 112, minWidth: 0, display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8, padding: 9, border: "1px solid #cfdae7", borderRadius: 15, background: "#eef3f7", overflow: "hidden" },
  connectionCriteriaHeading: { gridColumn: "1/-1", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "4px 5px 2px", color: "#566579", fontSize: 11.5, lineHeight: 1.4, flexWrap: "wrap" },
  criterionItem: { minWidth: 0, display: "grid", alignContent: "center", justifyItems: "center", gap: 6, padding: "12px 10px", borderRadius: 11, background: "#fff", color: "#405069", border: "1px solid #dbe3ec", textAlign: "center", boxShadow: "0 2px 7px rgba(51,70,94,.035)" },
  criterionLabel: { display: "block", fontSize: 11.5, lineHeight: 1.3, fontWeight: 850, color: "#758196" },
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
  resultCountLabel: { display: "block", fontSize: 11.8, lineHeight: 1.3, fontWeight: 900, color: "#58728b" },
  resultCountValue: { display: "block", fontSize: 22, lineHeight: 1.05, fontWeight: 950, color: "#1e4f79" },
  resultCountMeta: { display: "block", fontSize: 11.8, lineHeight: 1.4, color: "#60788e" },
  connectionStats: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 9 },
  connectionStatCard: { minWidth: 0, minHeight: 70, display: "grid", alignContent: "center", justifyItems: "center", gap: 5, padding: "10px 9px", border: "1px solid #dfe5ee", borderRadius: 12, background: "#f8fafc", textAlign: "center" },
  connectionStatExact: { background: "#edf5fb", borderColor: "#c8dce9" },
  connectionStatDistinct: { background: "#f3f5f8", borderColor: "#d9dfe7" },
  connectionStatOfficial: { background: "#eef8f3", borderColor: "#c9e1d5" },
  connectionStatIntegrated: { background: "#fff6e8", borderColor: "#ead2aa" },
  connectionStatLabel: { display: "block", fontSize: 11.5, lineHeight: 1.35, fontWeight: 850, color: "#748196", wordBreak: "keep-all" },
  connectionStatValue: { display: "block", fontSize: 15.5, lineHeight: 1.15, fontWeight: 950, color: "#2f435e" },
  connectionNotice: { minWidth: 0, display: "flex", alignItems: "center", gap: 9, padding: "10px 13px", border: "1px solid #ead39b", borderRadius: 11, background: "#fff8e7", color: "#66501d", fontSize: 11.8, lineHeight: 1.45, whiteSpace: "normal", overflowWrap: "anywhere" },
  sameCutNotice: { flex: "0 0 auto", marginLeft: "auto", padding: "3px 8px", borderRadius: 999, background: "#f4e4b9", color: "#73571d", fontStyle: "normal", fontSize: 11.5, fontWeight: 900 },
  connectionEmpty: { padding: 21, border: "1px dashed #cfd9e6", borderRadius: 11, background: "#fafbfc", color: "#7f8998", fontSize: 12.5, textAlign: "center" },
  connectionDisplayBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", border: "1px solid #dce3ed", borderRadius: 11, background: "#fafbfe", color: "#657186", fontSize: 11.5, lineHeight: 1.5, flexWrap: "wrap" },
  connectionSummaryGuide: { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 12, padding: "12px 14px", border: "1px solid #cdd9e7", borderRadius: 12, background: "linear-gradient(135deg,#f4f8fc,#fff)", color: "#536278" },
  connectionSummaryCopy: { minWidth: 0, display: "grid", gap: 3, fontSize: 11.5, lineHeight: 1.55 },
  connectionSummaryChips: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, flexWrap: "wrap" },
  connectionSummaryChip: { display: "inline-grid", gridTemplateColumns: "auto auto", alignItems: "center", gap: 5, minHeight: 30, padding: "0 9px", border: "1px solid #d5deea", borderRadius: 999, background: "#fff", color: "#4d5f76", fontSize: 11.5, fontWeight: 900, whiteSpace: "nowrap" },
  connectionDisplayToggle: { display: "inline-grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 4, borderRadius: 10, background: "#e9edf4" },
  connectionDisplayButton: { minHeight: 31, padding: "0 10px", border: "1px solid transparent", borderRadius: 7, background: "transparent", color: "#68758a", fontSize: 12, fontWeight: 900, cursor: "pointer" },
  connectionDisplayActive: { background: "#315f88", color: "#fff", borderColor: "#315f88", boxShadow: "0 4px 10px rgba(49,95,136,.18)" },
  connectionCandidateSearch: { minHeight: 46, display: "flex", alignItems: "center", gap: 9, padding: "0 12px", border: "1px solid #cbd7e6", borderRadius: 11, background: "#fff", color: "#52657e", boxShadow: "0 3px 10px rgba(48,65,88,.04)" },
  connectionGrid: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 },
  connectionCard: { minWidth: 0, display: "grid", alignContent: "start", gap: 9, padding: 14, border: "1px solid #d5e0ed", borderRadius: 14, background: "#fff", color: "#303e54", textAlign: "left", boxShadow: "0 4px 12px rgba(48,60,80,.045)", cursor: "pointer", transition: "border-color .15s,box-shadow .15s,transform .15s" },
  connectionCardSelected: { borderColor: "#315f88", boxShadow: "0 0 0 2px rgba(49,95,136,.14),0 8px 18px rgba(43,79,112,.12)", transform: "translateY(-1px)" },
  connectionCardHead: { minWidth: 0, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 7, fontSize: 12 },
  connectionUniversityWrap: { minWidth: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  connectionEntityLabel: { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 20, padding: "0 6px", borderRadius: 6, background: "#e8eef7", color: "#536785", fontSize: 11.5, fontWeight: 950 },
  connectionUniversityName: { minWidth: 0, fontSize: 16, lineHeight: 1.3, color: "#173a68", fontWeight: 950, overflowWrap: "anywhere" },
  connectionMinimumDanger: { display: "inline-flex", width: "fit-content", padding: "3px 6px", borderRadius: 999, border: "1px solid #efb6b6", background: "#fff0f0", color: "#b22f2f", fontSize: 10.2, fontWeight: 950, fontStyle: "normal", lineHeight: 1 },
  connectionDepartmentWrap: { display: "grid", gap: 4, padding: "9px 10px", border: "1px solid #d7e2ed", borderRadius: 9, background: "linear-gradient(135deg,#f4f8fc,#fff)" },
  connectionFavoriteBtn: { flex: "0 0 auto", width: 29, height: 29, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid #d4dce7", borderRadius: 8, background: "#fff", color: "#8b95a3", cursor: "pointer" },
  connectionDepartment: { minHeight: 0, fontSize: 16, lineHeight: 1.45, color: "#244f75", fontWeight: 900, wordBreak: "keep-all", overflowWrap: "anywhere" },
  connectionMeta: { minHeight: 21, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", color: "#6f7c90", fontSize: 12 },
  integratedBadge: { padding: "3px 6px", borderRadius: 999, background: "#fff3d9", color: "#86601c", fontWeight: 900 },
  officialBadge: { padding: "3px 6px", borderRadius: 999, background: "#e9f5ef", color: "#2e7358", fontWeight: 900 },
  connectionDataCompare: { minWidth: 0, display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 8 },
  connectionNaviBlock: { minWidth: 0, display: "grid", alignContent: "start", gap: 8, padding: 10, border: "1px solid #cbdbea", borderRadius: 11, background: "linear-gradient(135deg,#f2f7fb,#fff)", color: "#35536f" },
  connectionSchoolBlock: { minWidth: 0, display: "grid", alignContent: "start", gap: 8, padding: 10, border: "1px solid #e6c2c8", borderRadius: 11, background: "linear-gradient(135deg,#fff3f5,#fffafb)", color: "#713f49" },
  connectionDataHeading: { minWidth: 0, display: "grid", gap: 3 },
  connectionNaviBadge: { width: "fit-content", display: "inline-flex", alignItems: "center", minHeight: 21, padding: "0 7px", borderRadius: 7, background: "#dfeaf4", color: "#315f88", fontSize: 10.5, fontWeight: 950 },
  connectionSchoolBadge: { width: "fit-content", display: "inline-flex", alignItems: "center", minHeight: 21, padding: "0 7px", borderRadius: 7, background: "#f3dce1", color: "#8a4050", fontSize: 10.5, fontWeight: 950 },
  connectionNaviMetrics: { minWidth: 0, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 5 },
  connectionSchoolMetrics: { minWidth: 0, display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 5 },
  connectionCutBasisMetric: { borderColor: "#e2bd78", background: "#fff2d8" },
  connectionSchoolBlockFoot: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7, flexWrap: "wrap", color: "#86656c", fontSize: 10.5 },
  connectionSchoolLink: { minHeight: 35, padding: "0 9px", border: "1px solid #dfb7bf", borderRadius: 8, background: "#fff", color: "#8a4050", fontSize: 11.5, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" },
  connectionSource: { display: "grid", gap: 2, padding: "7px 8px", borderRadius: 8, background: "rgba(255,255,255,.72)", color: "#6e6680", fontSize: 11.2, lineHeight: 1.45 },
  connectionCardFoot: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 8, borderTop: "1px dashed #dce3ec", fontSize: 11.5, flexWrap: "wrap" },
  connectionFooterNav: { display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", alignItems: "center", gap: 10, paddingTop: 11, borderTop: "1px solid #e1e6ee" },
  connectionBackButton: { minHeight: 40, padding: "0 13px", border: "1px solid #cbd6e5", borderRadius: 10, background: "#fff", color: "#465873", fontSize: 12.5, fontWeight: 900, cursor: "pointer" },
  connectionSelectionStatus: { minWidth: 0, display: "grid", justifyItems: "center", gap: 3, color: "#707c8f", fontSize: 11.5, textAlign: "center" },
  connectionNextButton: { minHeight: 42, padding: "0 15px", border: 0, borderRadius: 10, background: "#315f88", color: "#fff", fontSize: 12.5, fontWeight: 950, cursor: "pointer", boxShadow: "0 5px 12px rgba(49,95,136,.18)" },
  focusFallbackNotice: { display: "flex", alignItems: "flex-start", gap: 7, padding: "9px 11px", border: "1px solid #edd2a8", borderRadius: 10, background: "#fff8ea", color: "#7a5b25", fontSize: 10.8, lineHeight: 1.5 },
  resultList: { display: "grid", gap: 10 },
  resultCard: { display: "grid", gap: 0, border: "1px solid #d6e0ec", borderRadius: 15, background: "#fff", overflow: "hidden", boxShadow: "0 5px 15px rgba(52,62,78,.04)" },
  resultSummary: { minWidth: 0, display: "grid", gridTemplateColumns: "minmax(300px,1fr) auto auto", alignItems: "center", gap: 14, padding: "17px 18px", background: "linear-gradient(135deg,#fff,#f8fafe)" },
  resultSummaryIdentity: { minWidth: 0, display: "grid", gap: 5 },
  resultEntityLabel: { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 22, padding: "0 7px", borderRadius: 7, background: "#e7edf6", color: "#48617f", fontSize: 11.5, fontWeight: 950, whiteSpace: "nowrap" },
  resultDepartmentLine: { minWidth: 0, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" },
  resultQuickStats: { display: "grid", gridTemplateColumns: "repeat(3,74px)", gap: 5 },
  resultActions: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 7, flexWrap: "wrap" },
  resultToggle: { minHeight: 38, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "0 12px", border: "1px solid #cbd6e4", borderRadius: 10, background: "#fff", color: "#354b68", fontSize: 12.5, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" },
  resultConnectButton: { minHeight: 38, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "0 11px", border: "1px solid #d7cbea", borderRadius: 10, background: "#f7f2fc", color: "#5b4385", fontSize: 12, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" },
  schoolTrendPanel: { display: "grid", gridTemplateColumns: "minmax(180px,.72fr) minmax(245px,.92fr) minmax(300px,1.55fr) auto", alignItems: "center", gap: 12, padding: "13px 15px", borderTop: "1px solid #e5c4ca", borderBottom: "1px solid #e5c4ca", background: "linear-gradient(135deg,#fff3f5,#fffafb)", color: "#6e4650" },
  schoolTrendCompact: { paddingTop: 11, paddingBottom: 11 },
  schoolTrendExpanded: { marginTop: 14, borderTop: "1px solid #dfb6be", boxShadow: "inset 0 5px 0 rgba(181,86,105,.08)" },
  schoolTrendHeading: { minWidth: 0, display: "grid", gap: 5 },
  schoolTrendSeparation: { display: "grid", gap: 1, fontSize: 11, lineHeight: 1.4, color: "#87676e" },
  schoolSourceBadge: { width: "fit-content", display: "inline-flex", alignItems: "center", minHeight: 21, padding: "0 7px", borderRadius: 7, background: "#f3dce1", color: "#8a4050", fontSize: 10.5, fontWeight: 950 },
  schoolTrendMetrics: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 5 },
  schoolTrendTypes: { minWidth: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", alignItems: "stretch", gap: 7 },
  schoolTrendTypeMetrics: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 4 },
  schoolTrendMore: { gridColumn: "1/-1", padding: "4px 2px", fontSize: 10.5, color: "#8b6f75" },
  schoolTrendAction: { minWidth: 150, display: "grid", justifyItems: "end", gap: 5, color: "#86656c", fontSize: 11, lineHeight: 1.45 },
  schoolTrendOpenButton: { minHeight: 38, padding: "0 11px", border: "1px solid #dfb7bf", borderRadius: 9, background: "#fff", color: "#8a4050", fontSize: 11.5, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" },
  resultCardBody: { minWidth: 0, display: "grid", gridTemplateColumns: "minmax(245px,285px) minmax(0,1fr)", gap: 16, padding: "18px", borderTop: "1px solid #e1e7ef", background: "#fff" },
  resultIdentity: { minWidth: 0, display: "grid", alignContent: "start", gap: 10, padding: 14, borderRadius: 12, background: "linear-gradient(180deg,#f5f8fc,#fafbfd)", border: "1px solid #e3e8f0", overflow: "visible", wordBreak: "keep-all", overflowWrap: "anywhere" },
  identityLabel: { fontSize: 11.5, color: "#5c6d84", fontWeight: 950 },
  identitySourceNote: { display: "block", minWidth: 0, fontSize: 11.5, lineHeight: 1.55, color: "#768398", wordBreak: "keep-all", overflowWrap: "anywhere" },
  detailTabGuide: { display: "grid", gap: 3, padding: "9px", borderRadius: 8, border: "1px solid #e0e5ed", background: "#fff", color: "#6c788a", fontSize: 10.3, lineHeight: 1.4 },
  sameUnitNote: { minWidth: 0, padding: "9px", borderRadius: 8, background: "#eef3f8", color: "#667488", fontSize: 12.5, lineHeight: 1.55, wordBreak: "keep-all", overflowWrap: "anywhere" },
  universityLine: { minWidth: 0, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" },
  universityName: { margin: 0, fontFamily: "KDRound,Pretendard, 'Noto Sans KR', system-ui, sans-serif", fontSize: 17.5, lineHeight: 1.3, fontWeight: 850, letterSpacing: "-.015em", color: "#18304f" },
  fieldBadge: { display: "inline-flex", padding: "3px 7px", borderRadius: 999, background: "#e8edf5", color: "#506078", fontSize: 10.3, fontWeight: 900 },
  naviInlineBadge: { display: "inline-flex", alignItems: "center", minHeight: 21, padding: "0 7px", borderRadius: 7, background: "#eee9f8", color: "#66518e", fontSize: 10.2, fontWeight: 950 },
  favoriteBtn: { flex: "0 0 auto", width: 34, height: 34, borderRadius: 9, border: "1px solid #d2dbe8", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#7b8799", background: "#fff", cursor: "pointer" },
  favoriteBtnActive: { color: "#a96f08", background: "#fff7d8", borderColor: "#dec06a" },
  favoriteBtnDisabled: { opacity: .42, cursor: "not-allowed" },
  unitTitle: { minWidth: 0, fontFamily: "KDRound,Pretendard, 'Noto Sans KR', system-ui, sans-serif", fontSize: 14.5, lineHeight: 1.5, fontWeight: 850, color: "#2b3d55", wordBreak: "keep-all", overflowWrap: "anywhere" },
  location: { fontSize: 12.3, color: "#6f7d91" },
  previousUnit: { minWidth: 0, display: "grid", gap: 7, padding: "12px", border: "1px solid #dce4ef", borderRadius: 10, background: "#fff", fontSize: 11.5, lineHeight: 1.55, color: "#657286", wordBreak: "keep-all", overflowWrap: "anywhere" },
  resultDetailArea: { minWidth: 0, display: "grid", alignContent: "start", gap: 10 },
  detailTabs: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 5, padding: 5, border: "1px solid #dce3ed", borderRadius: 11, background: "#edf1f6" },
  detailTabButton: { minHeight: 38, border: "1px solid transparent", borderRadius: 9, background: "transparent", color: "#5f6d82", fontSize: 12, fontWeight: 900, cursor: "pointer" },
  detailTabActive: { background: "#fff", borderColor: "#d4dce8", color: "#56417f", boxShadow: "0 3px 8px rgba(70,55,105,.12)" },
  admissionColumns: { minWidth: 0, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 },
  admissionColumnsSingle: { gridTemplateColumns: "minmax(0,1fr)" },
  resultSection: { minWidth: 0, display: "grid", alignContent: "start", gap: 7 },
  resultSectionTitle: { minHeight: 26, display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 850, color: "#697487" },
  sectionTypeBadge: { display: "inline-flex", alignItems: "center", padding: "4px 7px", borderRadius: 7, fontSize: 11.5, fontWeight: 900 },
  sectionTeaching: { color: "#315f9a", background: "#eaf2ff" },
  sectionHolistic: { color: "#76518f", background: "#f3eafb" },
  sectionRegular: { color: "#27715b", background: "#e9f7f1" },
  sectionMinimum: { color: "#9a6419", background: "#fff3d8" },
  admissionItems: { display: "grid", gap: 9 },
  admissionItemsDense: { gridTemplateColumns: "repeat(auto-fit,minmax(215px,1fr))", alignItems: "stretch" },
  admissionItem: { minWidth: 0, display: "grid", alignContent: "start", gap: 8, padding: "12px", borderRadius: 11, border: "1px solid #dce3ed", background: "#fbfcfd", fontSize: 12.5, lineHeight: 1.5 },
  admissionItemHead: { minWidth: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 },
  admissionName: { minWidth: 0, color: "#26384f", fontSize: 13.5, fontWeight: 900, lineHeight: 1.45, wordBreak: "keep-all", overflowWrap: "anywhere" },
  officialCutLabel: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7, paddingTop: 2, color: "#728096", fontSize: 10.5, fontWeight: 900 },
  officialCutBasisTag: { flex: "0 0 auto", display: "inline-flex", alignItems: "center", minHeight: 20, padding: "0 6px", borderRadius: 999, background: "#ebe5f6", color: "#5b4387", fontSize: 10, fontWeight: 950 },
  supportBadge: { flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 38, padding: "3px 7px", border: "1px solid", borderRadius: 999, fontSize: 10.5, fontWeight: 900 },
  cutoffGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 },
  cutoffBox: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7, minHeight: 39, padding: "7px 9px", border: "1px solid #e0e5ed", borderRadius: 9, background: "rgba(255,255,255,.78)", color: "#677387", fontFamily: "KDRound,Pretendard, 'Noto Sans KR', 'Apple SD Gothic Neo', system-ui, sans-serif" },
  cutoffBoxActive: { borderColor: "#66558e", background: "linear-gradient(135deg,#f3effb,#fff)", color: "#5b4787", boxShadow: "0 0 0 2px rgba(102,85,142,.12),0 4px 10px rgba(86,69,126,.10)" },
  cutoffBoxLabel: { fontSize: 11.5, lineHeight: 1.2, fontWeight: 900, letterSpacing: "-.01em" },
  cutoffBoxValue: { fontSize: 15, lineHeight: 1.1, fontWeight: 950, letterSpacing: "-.02em" },
  studentDifference: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, fontSize: 10.5, fontWeight: 750 },
  caseNone: { color: "#9aa2af", fontSize: 10 },
  caseDisclosure: { marginTop: 2, padding: "8px", border: "1px solid #ded5ec", borderRadius: 10, background: "#faf7fe", display: "grid", gap: 7 },
  caseToggleBtn: { minHeight: 54, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", alignItems: "center", gap: 9, padding: "7px 9px", border: "1px solid #d6deea", borderRadius: 10, background: "linear-gradient(135deg,#fff,#f8f9fc)", color: "#526078", cursor: "pointer", textAlign: "left" },
  caseToggleIdentity: { minWidth: 0, display: "grid", gap: 2 },
  caseToggleCount: { minWidth: 56, display: "grid", justifyItems: "center", gap: 0, padding: "4px 7px", borderRadius: 8, background: "#eee9f8", color: "#614d88" },
  caseToggleAction: { whiteSpace: "nowrap", fontSize: 9.8, fontWeight: 850, color: "#697589" },
  caseCutGrid: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 5 },
  caseScopeNote: { display: "grid", gap: 2, color: "#7d8797", fontSize: 9.7, lineHeight: 1.4, textAlign: "center" },
  caseCutCard: { display: "grid", gap: 2, padding: "7px 5px", borderRadius: 8, border: "1px solid", textAlign: "center" },
  caseCutSelected: { boxShadow: "0 0 0 2px rgba(91,67,136,.17),0 4px 10px rgba(91,67,136,.10)", transform: "translateY(-1px)" },
  caseCutLabel: { fontFamily: "KDRound,Pretendard, 'Noto Sans KR', 'Apple SD Gothic Neo', system-ui, sans-serif", fontSize: 11.5, fontWeight: 900, letterSpacing: "-.01em" },
  caseCutValue: { fontFamily: "KDRound,Pretendard, 'Noto Sans KR', 'Apple SD Gothic Neo', system-ui, sans-serif", fontSize: 14, lineHeight: 1.1, fontWeight: 950, letterSpacing: "-.02em" },
  case30: { color: "#39638d", background: "#eef5fd", borderColor: "#cbdced" },
  case50: { color: "#64518e", background: "#f4effb", borderColor: "#d9cdea" },
  case70: { color: "#8b5f22", background: "#fff6e6", borderColor: "#ead3aa" },
  relatedDetails: { marginTop: 8, borderTop: "1px solid #e0e5ed", paddingTop: 8 },
  relatedSummary: { cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, fontWeight: 850, color: "#526078" },
  relatedBody: { marginTop: 7, display: "grid", gap: 8, fontSize: 10.5 },
  teachingItem: { borderColor: "#d3dff0", background: "#f5f8ff" },
  holisticItem: { borderColor: "#e1d8ea", background: "#fbf7fe" },
  regularItem: { borderColor: "#cee2da", background: "#f3faf7" },
  regularHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 7 },
  regularPercentile: { flex: "0 0 auto", padding: "4px 7px", borderRadius: 8, background: "#dff1e9", color: "#276e57", fontSize: 10.5, fontWeight: 800 },
  regularMeta: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, color: "#647386" },
  regularSubjects: { margin: 0, paddingTop: 5, borderTop: "1px dashed #d7e4df", color: "#4f625c", fontSize: 10.5, lineHeight: 1.45, wordBreak: "keep-all" },
  none: { padding: "11px 8px", borderRadius: 9, background: "#f5f6f8", color: "#9aa1ad", fontSize: 11.5, lineHeight: 1.4, textAlign: "center" },
  minimumAlertBadge: { display: "inline-flex", alignItems: "center", gap: 4, width: "fit-content", marginTop: 6, padding: "5px 8px", borderRadius: 999, border: "1px solid #efb6b6", background: "#fff0f0", color: "#b12f2f", fontSize: 11.5, fontWeight: 950, lineHeight: 1 },
  minimumList: { display: "grid", gap: 7 },
  minimumItem: { display: "grid", gap: 5, padding: "10px", borderRadius: 10, border: "1px solid #ead6a5", background: "#fffaf0", fontSize: 11.5 },
  minimumItemDanger: { border: "1.5px solid #e7a5a5", background: "#fff7f7" },
  minimumHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7 },
  minimumYearBadge: { flex: "0 0 auto", display: "inline-flex", alignItems: "center", padding: "3px 6px", border: "1px solid #b8d1ea", borderRadius: 999, background: "#eaf3fc", color: "#245985", fontSize: 10.2, fontWeight: 900, lineHeight: 1.2 },
  minimumYearBadgeReference: { borderColor: "#e3c88d", background: "#fff4d9", color: "#805b14" },
  minimumCriteriaRow: { display: "flex", alignItems: "center", gap: 7, minWidth: 0 },
  minimumCriteria: { flex: 1, minWidth: 0, padding: "6px 7px", borderRadius: 7, background: "#fff2cc", color: "#7a5718", lineHeight: 1.48, wordBreak: "keep-all", overflowWrap: "anywhere" },
  minimumStatusBadge: { flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "5px 7px", borderRadius: 999, fontSize: 10.5, fontWeight: 950, lineHeight: 1, whiteSpace: "nowrap" },
  minimumStatusDanger: { border: "1px solid #efb2b2", background: "#ffeded", color: "#b32424" },
  minimumStatusSuccess: { border: "1px solid #b9ddc4", background: "#edf8f1", color: "#276443" },
  minimumStatusWarning: { border: "1px solid #e6cf9a", background: "#fff8e6", color: "#89631b" },
  minimumStatusNeutral: { border: "1px solid #d8dce4", background: "#f4f6f8", color: "#687384" },
  minimumNote: { color: "#786e5e", lineHeight: 1.5, wordBreak: "keep-all", overflowWrap: "anywhere" },
  minimumEvaluationNote: { color: "#8a7d6a", fontSize: 10.2, fontWeight: 800 },
  noResult: { padding: 42, borderRadius: 15, border: "1px dashed #d5dae2", background: "#fafbfc", textAlign: "center", color: "#838b99" },
  pagination: { display: "flex", justifyContent: "center", alignItems: "center", gap: 7, padding: "14px 8px 5px", flexWrap: "wrap" },
  pageNavBtn: { minHeight: 34, display: "inline-flex", alignItems: "center", gap: 3, padding: "0 11px", border: "1px solid #d4dce8", borderRadius: 9, background: "#fff", color: "#536075", fontSize: 11.5, fontWeight: 850, cursor: "pointer" },
  pageIconBtn: { width: 34, height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid #d4dce8", borderRadius: 9, background: "#fff", color: "#697588", cursor: "pointer" },
  pageNumbers: { display: "flex", gap: 4 },
  pageNumberBtn: { width: 32, height: 32, border: "1px solid #d9e0ea", borderRadius: 8, background: "#fff", color: "#637084", fontSize: 11.5, fontWeight: 800, cursor: "pointer" },
  pageNumberActive: { color: "#fff", background: "#65548f", borderColor: "#65548f", boxShadow: "0 4px 10px rgba(77,62,116,.18)" },
  pageStatus: { minWidth: 60, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "0 8px", height: 32, borderRadius: 8, background: "#f1f3f7", color: "#707b8d", fontSize: 11.5 },
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
  summaryEyebrow: { fontSize: 10.5, color: "#778398", fontWeight: 850 },
  summaryTitle: { fontSize: 15.5, lineHeight: 1.25, color: "#29374c", letterSpacing: "-.015em" },
  summaryDescription: { fontSize: 12, lineHeight: 1.5, color: "#738094" },
  statePill: { padding: "4px 8px", borderRadius: 999, fontSize: 10.5, fontWeight: 900 },
  stateSchool: { color: "#287348", background: "#e1f3e8" },
  stateDraft: { color: "#315a9b", background: "#e7efff" },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 7 },
  miniStat: { display: "grid", gap: 3, padding: "10px 8px", borderRadius: 10, background: "rgba(255,255,255,.82)", textAlign: "center", border: "1px solid rgba(210,219,233,.62)" },
  miniStatLabel: { fontSize: 10.5, color: "#718095", fontWeight: 800 },
  miniStatValue: { fontSize: 19, lineHeight: 1.1, color: "#243d64", fontWeight: 900 },
  sourceMeta: { display: "grid", gap: 4, paddingTop: 2, fontSize: 12, lineHeight: 1.5, color: "#6f7888", minWidth: 0 },
  summaryEmpty: { padding: 22, textAlign: "center", color: "#9299a6", fontSize: 12 },
  uploadPanel: { display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 9, alignItems: "center", padding: 12, borderRadius: 13, border: "1px solid #e2e6ee", background: "#f7f8fb" },
  fileName: { minWidth: 0, display: "grid", gap: 2, fontSize: 12, color: "#737c8c", overflow: "hidden" },
  statusLine: { display: "flex", alignItems: "center", gap: 7, padding: "8px 10px", borderRadius: 9, background: "#f1f3f7", color: "#667085", fontSize: 11.5 },
  notice: { display: "flex", gap: 7, padding: 10, borderRadius: 10, background: "#fff8e7", color: "#725d26", fontSize: 11.5, lineHeight: 1.5 },
  primaryBtn: { minHeight: 38, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 13px", border: 0, borderRadius: 10, color: "#fff", background: "#66558e", fontWeight: 850, cursor: "pointer" },
  secondaryBtn: { minHeight: 38, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 12px", border: "1px solid #cbd5e3", borderRadius: 10, color: "#455166", background: "#fff", fontWeight: 800, cursor: "pointer" },
  dangerGhost: { minHeight: 34, display: "inline-flex", alignItems: "center", gap: 5, padding: "0 10px", border: "1px solid #ebc7c2", borderRadius: 9, color: "#ae4c42", background: "#fff8f7", fontWeight: 800, cursor: "pointer" },
  recommendAdminPanel: { display: "grid", gap: 12, padding: 15, border: "1px solid #cfe0d8", borderRadius: 15, background: "linear-gradient(135deg,#f5fbf8,#fff)" },
  recommendAdminHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  recommendDataGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 },
  recommendDataCard: { minWidth: 0, display: "grid", gap: 4, padding: 11, border: "1px solid #d7e5de", borderRadius: 10, background: "#fff", color: "#596b63" },
  recommendUploadRow: { display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto auto", gap: 8, alignItems: "center" },
  recommendOfficialNote: { display: "flex", alignItems: "flex-start", gap: 7, padding: "9px 10px", borderRadius: 9, background: "#eef7f2", color: "#4d665a", fontSize: 11.5, lineHeight: 1.5 },
  recommendOfficialLink: { width: "fit-content", display: "inline-flex", marginTop: 5, color: "#315f88", fontSize: 11.5, fontWeight: 900, textDecoration: "none" },
  recommendSourceBadge: { width: "fit-content", display: "inline-flex", alignItems: "center", minHeight: 21, padding: "0 7px", borderRadius: 7, background: "#e2f2e8", color: "#2e6a49", fontSize: 10.3, fontWeight: 950 },
  // 5번 요청: "공식 자료"(초록)와 "다른 대학 기반 추정"(주황)이 색으로도 바로 구분되게 합니다.
  recommendSourceBadgeEstimate: { width: "fit-content", display: "inline-flex", alignItems: "center", minHeight: 21, padding: "0 7px", borderRadius: 7, background: "#fff3d9", color: "#8a5a12", fontSize: 10.3, fontWeight: 950 },
  recommendEstimateNotice: { margin: "0 0 8px", padding: "7px 9px", borderRadius: 8, border: "1px solid #eecd8a", background: "#fff8e6", color: "#7a5718", fontSize: 11, lineHeight: 1.5, wordBreak: "keep-all", overflowWrap: "anywhere" },
  compareAddButton: { minHeight: 38, padding: "0 10px", border: "1px solid #c9d9d1", borderRadius: 10, background: "#f5faf7", color: "#3f6c57", fontSize: 12, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" },
  compareAddButtonActive: { borderColor: "#6d927f", background: "#e7f3ec", color: "#285c43" },
  admissionHeadBadges: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5, flexWrap: "wrap" },
  planAddButton: { minHeight: 32, border: "1px solid #cbd8e8", borderRadius: 8, background: "#fff", color: "#3d5879", fontSize: 11.3, fontWeight: 900, cursor: "pointer" },
  planAddButtonActive: { borderColor: "#7d6aa5", background: "#f1edf8", color: "#5a4783" },
  recommendEmpty: { display: "grid", gap: 3, padding: 10, border: "1px dashed #d5dfda", borderRadius: 9, background: "#fbfdfc", color: "#75837c", fontSize: 10.5, lineHeight: 1.45 },
  recommendPanel: { display: "grid", gap: 9, padding: 11, border: "1px solid #cfe0d8", borderRadius: 10, background: "linear-gradient(135deg,#f4fbf7,#fff)" },
  recommendPanelHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  recommendProgress: { flex: "0 0 auto", minWidth: 70, display: "grid", justifyItems: "center", gap: 2, padding: "7px 8px", borderRadius: 9, background: "#e5f4eb", color: "#2f694b" },
  recommendCourseGroup: { display: "grid", gap: 5, fontSize: 10.5, color: "#51665b" },
  recommendCourseChip: { display: "inline-flex", alignItems: "center", gap: 4, margin: "2px 4px 2px 0", padding: "4px 6px", border: "1px solid", borderRadius: 999, fontSize: 10.2, fontWeight: 850 },
  recommendCourseMatched: { color: "#2d6b49", background: "#eaf7ef", borderColor: "#bddfc9" },
  recommendCourseEnrolled: { color: "#315f9a", background: "#eaf2ff", borderColor: "#bfd2ec" },
  recommendCourseMissing: { color: "#7a6650", background: "#fff8ed", borderColor: "#e8d6b9" },
  recommendNotes: { display: "grid", gap: 3, padding: "7px 8px", borderRadius: 8, background: "#f7faf8", color: "#617268", fontSize: 10.2, lineHeight: 1.45 },
  recommendDisclaimer: { margin: 0, paddingTop: 6, borderTop: "1px dashed #d9e5de", color: "#718078", fontSize: 9.9, lineHeight: 1.45 },
  recommendSourceLink: { color: "#315f88", fontSize: 10.2, fontWeight: 900, textDecoration: "none" },
  consultLinkBar: { display: "grid", gridTemplateColumns: "minmax(0,1.45fr) minmax(270px,.8fr) auto", gap: 12, alignItems: "center", padding: "13px 15px", border: "1px solid #d4dfeb", borderRadius: 14, background: "linear-gradient(135deg,#f8fbff,#f7faf8)", boxShadow: "0 4px 14px rgba(42,63,88,.035)" },
  consultLinkCopy: { minWidth: 0, display: "grid", gap: 3 },
  consultLinkEyebrow: { width: "fit-content", display: "inline-flex", padding: "3px 7px", borderRadius: 999, background: "#e7f1fb", color: "#315f91", fontSize: 10.5, fontWeight: 950 },
  consultLinkStats: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 6 },
  consultLinkActions: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 7, flexWrap: "wrap" },
  consultStrategyButton: { minHeight: 36, padding: "0 11px", border: "1px solid #315f91", borderRadius: 9, background: "#315f91", color: "#fff", fontSize: 11.8, fontWeight: 950, cursor: "pointer", whiteSpace: "nowrap" },
  consultReturnButton: { minHeight: 36, padding: "0 11px", border: "1px solid #c7d5e3", borderRadius: 9, background: "#fff", color: "#435e79", fontSize: 11.8, fontWeight: 950, cursor: "pointer", whiteSpace: "nowrap" },
  workspaceHero: { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 16, alignItems: "center", padding: "18px 19px", border: "1px solid #d3ddea", borderRadius: 16, background: "linear-gradient(135deg,#f8fafc,#f4f8fb)" },
  workspaceEyebrow: { fontSize: 11, fontWeight: 950, color: "#315f91" },
  workspaceFlow: { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto", gap: 12, alignItems: "center", padding: "11px 13px", border: "1px solid #dce5ed", borderRadius: 12, background: "#fbfcfd" },
  workspaceFlowCopy: { minWidth: 0, display: "grid", gap: 2, color: "#647287" },
  workspaceFlowStats: { display: "grid", gridTemplateColumns: "repeat(3,minmax(72px,1fr))", gap: 5 },
  workspaceConsultButton: { minHeight: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "0 10px", border: "1px solid var(--kd-brand-border)", borderRadius: 9, background: "#fff", color: "var(--kd-brand)", fontSize: 11.3, fontWeight: 950, cursor: "pointer", whiteSpace: "nowrap" },
  workspaceStudent: { minWidth: 250, display: "grid", gap: 3, padding: "11px 13px", border: "1px solid #d6deea", borderRadius: 12, background: "#fff", color: "#617086" },
  workspaceMessage: { display: "flex", alignItems: "center", gap: 7, padding: "9px 11px", border: "1px solid #d8dfeb", borderRadius: 10, background: "#f7f9fc", color: "#53627a", fontSize: 11.5, fontWeight: 800 },
  workspaceSection: { display: "grid", gap: 12, padding: 16, border: "1px solid #d8e0ea", borderRadius: 15, background: "#fff" },
  workspaceSectionHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  workspaceCount: { minWidth: 48, minHeight: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 999, background: "#edf1f7", color: "#50617a", fontSize: 12, fontWeight: 950 },
  planPrintButton: { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--kd-brand-border)", borderRadius: 10, padding: "8px 12px", background: "#fff", color: "var(--kd-brand)", fontSize: 12, fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" },
  workspaceSummaryGrid: { display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8 },
  summaryChipRow: { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 3 },
  summaryChip: { display: "inline-flex", alignItems: "center", padding: "3px 7px", borderRadius: 999, border: "1px solid", fontSize: 11.8, fontWeight: 850, whiteSpace: "nowrap" },
  summaryChipEmpty: { fontSize: 11.5, color: "#9aa3b1", fontWeight: 700 },
  planGrid: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 9 },
  planEmpty: { minHeight: 150, display: "grid", placeItems: "center", alignContent: "center", gap: 5, padding: 12, border: "1px dashed #d6dde8", borderRadius: 12, background: "#fafbfc", color: "#9aa3b1", textAlign: "center" },
  planCard: { position: "relative", minWidth: 0, minHeight: 150, display: "grid", alignContent: "start", gap: 9, padding: "13px", border: "1px solid #d6dfeb", borderRadius: 12, background: "#fbfcfe" },
  planNumber: { position: "absolute", top: 9, right: 9, width: 25, height: 25, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 999, background: "#5e5188", color: "#fff", fontSize: 11, fontWeight: 950 },
  planIdentity: { minWidth: 0, display: "grid", gap: 3, paddingRight: 32 },
  planBadges: { display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" },
  planSupportBadge: { display: "inline-flex", alignItems: "center", padding: "4px 7px", borderRadius: 999, border: "1px solid", fontSize: 10.5, fontWeight: 950 },
  planMinimumBadge: { display: "inline-flex", alignItems: "center", padding: "4px 7px", borderRadius: 999, border: "1px solid", fontSize: 10.2, fontWeight: 900 },
  workspaceMinimumDanger: { color: "#a92d2d", background: "#fff0f0", borderColor: "#efbcbc" },
  workspaceMinimumSuccess: { color: "#2c7048", background: "#edf8f1", borderColor: "#bedfc9" },
  workspaceMinimumWarning: { color: "#8a641e", background: "#fff8e7", borderColor: "#e6cf9a" },
  workspaceMinimumNeutral: { color: "#667385", background: "#f2f4f7", borderColor: "#d8dde5" },
  planMetrics: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 5 },
  planEvidence: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 },
  planMissing: { color: "#a45b4b", fontSize: 11, fontWeight: 850 },
  workspaceRemove: { minHeight: 27, padding: "0 8px", border: "1px solid #e2c1bd", borderRadius: 7, background: "#fff8f7", color: "#a74b40", fontSize: 10.5, fontWeight: 900, cursor: "pointer" },
  workspaceFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, paddingTop: 3, color: "#728095", fontSize: 11.5, flexWrap: "wrap" },
  workspaceSecondary: { minHeight: 34, padding: "0 11px", border: "1px solid #ccd7e5", borderRadius: 9, background: "#fff", color: "#50617a", fontSize: 11.5, fontWeight: 900, cursor: "pointer" },
  workspacePrimary: { minHeight: 34, padding: "0 11px", border: "1px solid #5f4f88", borderRadius: 9, background: "#66558e", color: "#fff", fontSize: 11.5, fontWeight: 900, cursor: "pointer" },
  workspaceEmpty: { display: "grid", gap: 4, padding: 24, border: "1px dashed #d5dce6", borderRadius: 11, background: "#fafbfc", color: "#7e8898", textAlign: "center" },
  compareCardGrid: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 9 },
  compareCard: { minWidth: 0, display: "grid", gap: 9, padding: 12, border: "1px solid #d8e1eb", borderRadius: 12, background: "linear-gradient(135deg,#fff,#f9fbfd)" },
  compareCardHead: { minWidth: 0, display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", gap: 8, alignItems: "start" },
  compareIndex: { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 24, padding: "0 7px", borderRadius: 999, background: "#e7eef7", color: "#3d5b7c", fontSize: 10, fontWeight: 950, whiteSpace: "nowrap" },
  compareStatusRow: { display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" },
  compareSupportChip: { display: "inline-flex", alignItems: "center", minHeight: 23, padding: "0 7px", borderRadius: 999, border: "1px solid", fontSize: 10.2, fontWeight: 950 },
  compareNeutralChip: { display: "inline-flex", alignItems: "center", minHeight: 23, padding: "0 7px", borderRadius: 999, border: "1px solid #d9dfe7", background: "#f4f6f8", color: "#6c7786", fontSize: 10.2, fontWeight: 900 },
  compareMinimumDanger: { display: "inline-flex", alignItems: "center", minHeight: 23, padding: "0 7px", borderRadius: 999, border: "1px solid #efc3c3", background: "#fff1f1", color: "#b84444", fontSize: 10.2, fontWeight: 950 },
  compareMinimumSuccess: { display: "inline-flex", alignItems: "center", minHeight: 23, padding: "0 7px", borderRadius: 999, border: "1px solid #c3dfcd", background: "#eef8f1", color: "#2c7048", fontSize: 10.2, fontWeight: 950 },
  compareMetricGrid: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 6 },
  compareMissing: { padding: 12, borderRadius: 9, background: "#faf6f5", color: "#9b5d54", fontSize: 11.5, fontWeight: 850, textAlign: "center" },
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
.susi-beta-result-card h3,.susi-beta-result-card b{font-family:KDRound,Pretendard,"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif}
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
.susi-beta-result-card [style*="대학 공개 2026"]{font-family:KDRound,Pretendard,"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif}
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
.susi-beta-print-sheet,.susi-beta-plan-print-sheet{display:none}
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
@media(max-width:1080px){
  .susi-beta-result-context{grid-template-columns:1fr!important}
  .susi-beta-result-context>div:last-child{justify-content:flex-start!important}
}
@media(max-width:760px){
  .susi-beta-result-headline{display:grid!important;grid-template-columns:1fr!important}
  .susi-beta-current-grade{grid-template-columns:auto auto!important;min-width:0!important}
  .susi-beta-current-grade>small{grid-column:1/-1;white-space:normal!important}
  .susi-beta-result-description{white-space:normal!important}
}
@media(max-width:900px){
  .susi-beta-view-toolbar [role="tab"]{min-width:0!important}
  .susi-beta-view-toolbar>div:first-child{grid-template-columns:repeat(2,minmax(0,1fr))!important}
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
  /* Patch (print-overlap fix): 대학 상세 인쇄와 지원 구성 인쇄, 두 인쇄용 표가 항상 DOM에 함께 있어서
     예전에는 어느 버튼을 눌러도 둘 다 강제로 보이며 서로 겹쳐 찍혔습니다. 이제는 버튼을 누를 때
     body에 표시용 클래스를 붙이고, 그 클래스가 있을 때만 해당 표를 보이게 해서 하나만 인쇄됩니다. */
  body.kd-print-target-result .susi-beta-print-sheet,body.kd-print-target-result .susi-beta-print-sheet *,
  body.kd-print-target-plan .susi-beta-plan-print-sheet,body.kd-print-target-plan .susi-beta-plan-print-sheet *{visibility:visible!important}
  body.kd-print-target-result .susi-beta-print-sheet,body.kd-print-target-plan .susi-beta-plan-print-sheet{display:block!important;position:absolute!important;left:0!important;top:0!important;width:100%!important;color:#111!important;font-family:"Noto Sans KR",Arial,sans-serif!important}
  .susi-beta-print-sheet header,.susi-beta-plan-print-sheet header{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;padding-bottom:5px;border-bottom:2px solid #27364c}
  .susi-beta-print-sheet h1,.susi-beta-plan-print-sheet h1{margin:0;font-size:15pt;line-height:1.1}
  .susi-beta-print-sheet header p,.susi-beta-plan-print-sheet header p{margin:2px 0 0;font-size:7.5pt;color:#596579}
  .susi-beta-print-sheet header>div:last-child,.susi-beta-plan-print-sheet header>div:last-child{display:grid;gap:1px;text-align:right;font-size:7.5pt}
  .susi-beta-print-sheet .print-criteria{display:flex;gap:4px;flex-wrap:wrap;padding:5px 0}
  .susi-beta-print-sheet .print-criteria span{padding:3px 5px;border:1px solid #cbd3df;border-radius:4px;font-size:6.8pt;line-height:1.2}
  .susi-beta-print-sheet table,.susi-beta-plan-print-sheet table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:6.4pt;line-height:1.25}
  .susi-beta-print-sheet th,.susi-beta-print-sheet td,.susi-beta-plan-print-sheet th,.susi-beta-plan-print-sheet td{border:1px solid #aeb8c6;padding:3px 4px;vertical-align:middle;word-break:keep-all;overflow-wrap:anywhere}
  .susi-beta-print-sheet th,.susi-beta-plan-print-sheet th{background:#e9edf3;font-weight:900;text-align:center}
  .susi-beta-print-sheet th:nth-child(1){width:10%}.susi-beta-print-sheet th:nth-child(2){width:14%}.susi-beta-print-sheet th:nth-child(3){width:9%}.susi-beta-print-sheet th:nth-child(4),.susi-beta-print-sheet th:nth-child(5){width:17%}.susi-beta-print-sheet th:nth-child(6){width:13%}.susi-beta-print-sheet th:nth-child(7){width:20%}
  .susi-beta-plan-print-sheet th:nth-child(1){width:5%}.susi-beta-plan-print-sheet th:nth-child(2){width:26%}.susi-beta-plan-print-sheet th:nth-child(3){width:22%}.susi-beta-plan-print-sheet th:nth-child(4){width:17%}.susi-beta-plan-print-sheet th:nth-child(5){width:15%}.susi-beta-plan-print-sheet th:nth-child(6){width:15%}
  .susi-beta-plan-print-sheet td>span{display:block;color:#596579;font-size:6pt;margin-top:1px}
  .susi-beta-print-sheet tr,.susi-beta-plan-print-sheet tr{break-inside:avoid;height:10.5mm}
  .susi-beta-print-sheet footer,.susi-beta-plan-print-sheet footer{margin-top:4px;font-size:6.3pt;color:#555f70}
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

/* Patch 64: 상담 의사결정 보드 · 공식 권장과목 연결 */
@media(max-width:1180px) and (min-width:901px){
  .susi-beta-view-toolbar{grid-template-columns:minmax(0,1fr) auto!important}
  .susi-beta-view-toolbar>div:first-child{grid-template-columns:repeat(4,minmax(0,1fr))!important}
  .susi-beta-view-toolbar [role="tab"]{padding-left:8px!important;padding-right:8px!important}
}
.susi-beta-workspace{gap:14px!important}
.susi-beta-workspace h3{margin:3px 0 5px;font-size:18px;line-height:1.25;color:#26364f;letter-spacing:-.025em}
.susi-beta-workspace p{margin:0;color:#6b778a;font-size:11.5px;line-height:1.55;word-break:keep-all}
.susi-beta-workspace-summary>div{min-width:0;display:grid;gap:4px;padding:10px 11px;border:1px solid #dbe2eb;border-radius:10px;background:#f8fafc}
.susi-beta-workspace-summary small{font-size:12px;font-weight:750;color:#52667a}
.susi-beta-workspace-summary b{font-size:13px;line-height:1.55;color:#34475f;word-break:keep-all}
.susi-beta-plan-card,.susi-beta-plan-empty{box-sizing:border-box;min-width:0}
.susi-beta-plan-card b,.susi-beta-plan-card span,.susi-beta-plan-card small{min-width:0;overflow-wrap:anywhere;word-break:keep-all}
.susi-beta-plan-card>div:nth-child(2)>b{font-size:15px;color:#273b56}.susi-beta-plan-card>div:nth-child(2)>span{font-size:13px;font-weight:800;color:#3f526c}.susi-beta-plan-card>div:nth-child(2)>small{font-size:12px;color:#52667a}
.susi-beta-plan-metrics>span,.susi-beta-plan-evidence>span{display:grid;gap:2px;align-content:center;min-height:48px;padding:7px;border:1px solid #dfe5ed;border-radius:8px;background:#fff;text-align:center}
.susi-beta-plan-metrics small,.susi-beta-plan-evidence small{font-size:12px;color:#52667a;font-weight:750}
.susi-beta-plan-metrics b,.susi-beta-plan-evidence b{font-size:14px;color:#354a65;font-weight:850}
.susi-beta-plan-evidence>span:first-child{background:#f4f8fc;border-color:#d6e2ee}.susi-beta-plan-evidence>span:last-child{background:#fff6f7;border-color:#ead3d8}
.susi-beta-workspace-table th,.susi-beta-workspace-table td{padding:9px 8px;border-bottom:1px solid #e1e6ed;text-align:center;vertical-align:middle;word-break:keep-all;overflow-wrap:anywhere}
.susi-beta-workspace-table th{position:sticky;top:0;background:#f0f3f7;color:#58677b;font-size:9.5px;font-weight:950;white-space:nowrap}
.susi-beta-workspace-table td{color:#46566d;background:#fff}.susi-beta-workspace-table tbody tr:last-child td{border-bottom:0}
.susi-beta-workspace-table td:first-child{text-align:left;min-width:185px}.susi-beta-workspace-table td:first-child b,.susi-beta-workspace-table td:first-child small{display:block}.susi-beta-workspace-table td:first-child b{font-size:11.5px;color:#263c58}.susi-beta-workspace-table td:first-child small{margin-top:2px;color:#788497;font-size:9.5px}
.susi-beta-workspace-table tbody tr:hover td{background:#fbfcfe}
.susi-beta-recommend-panel a:focus-visible{outline:2px solid #5984ab;outline-offset:2px}
@media(max-width:1100px){
  .susi-beta-workspace-summary{grid-template-columns:1fr 1fr!important}
  .susi-beta-plan-grid{grid-template-columns:1fr 1fr!important}
}
@media(max-width:760px){
  .susi-beta-workspace>div:first-child{grid-template-columns:1fr!important}
  .susi-beta-workspace-summary,.susi-beta-plan-grid{grid-template-columns:1fr!important}
}

/* Patch 65: 상담 흐름·비교 UI 재구성 */
.susi-beta-consult-linkbar b{font-size:12.5px;line-height:1.35;color:#2e435d;word-break:keep-all}
.susi-beta-consult-linkbar small{font-size:9.8px;line-height:1.45;color:#7a8798;word-break:keep-all}
.susi-beta-consult-linkbar>div:nth-child(2)>span,.susi-beta-counsel-flow>div:nth-child(2)>span{display:grid;justify-items:center;gap:2px;min-width:0;padding:7px 6px;border:1px solid #dce5ed;border-radius:9px;background:#fff}
.susi-beta-consult-linkbar>div:nth-child(2) small,.susi-beta-counsel-flow>div:nth-child(2) small{font-size:8.7px;color:#8793a2;font-weight:850}
.susi-beta-consult-linkbar>div:nth-child(2) b,.susi-beta-counsel-flow>div:nth-child(2) b{font-size:11.5px;color:#31526f;font-weight:950}
.susi-beta-counsel-flow>div:first-child b{font-size:11.5px;color:#304862}.susi-beta-counsel-flow>div:first-child span{font-size:9.8px;line-height:1.45;word-break:keep-all}
.susi-beta-compare-card>div:first-child>div{min-width:0;display:grid;gap:2px}.susi-beta-compare-card>div:first-child>div>b{font-size:13px;line-height:1.3;color:#243a55;word-break:keep-all;overflow-wrap:anywhere}.susi-beta-compare-card>div:first-child>div>small{font-size:10.5px;line-height:1.4;color:#748196;word-break:keep-all;overflow-wrap:anywhere}
.susi-beta-compare-metrics>span{min-width:0;display:grid;gap:3px;padding:8px 9px;border:1px solid #dfe6ee;border-radius:9px;background:#fff}
.susi-beta-compare-metrics>span small{font-size:8.8px;color:#8792a1;font-weight:850}.susi-beta-compare-metrics>span b{font-size:11px;line-height:1.35;color:#344a65;font-weight:950;word-break:keep-all;overflow-wrap:anywhere}
.susi-beta-compare-metrics>span:nth-child(3){background:#f4f8fc;border-color:#d5e2ef}.susi-beta-compare-metrics>span:nth-child(4){background:#fff6f7;border-color:#ead3d8}.susi-beta-compare-metrics>span:nth-child(5){grid-column:1/-1;background:#f5faf7;border-color:#d4e5db}
@media(max-width:1100px){
  .susi-beta-consult-linkbar{grid-template-columns:1fr 1fr!important}.susi-beta-consult-linkbar>div:last-child{grid-column:1/-1;justify-content:flex-end!important}
  .susi-beta-counsel-flow{grid-template-columns:1fr auto!important}.susi-beta-counsel-flow>button{grid-column:1/-1;justify-self:end}
}
@media(max-width:900px){
  .susi-beta-compare-card-grid{grid-template-columns:1fr!important}
}
@media(max-width:720px){
  .susi-beta-consult-linkbar,.susi-beta-counsel-flow{grid-template-columns:1fr!important}
  .susi-beta-consult-linkbar>div:last-child,.susi-beta-counsel-flow>button{grid-column:auto!important;justify-self:stretch!important}
  .susi-beta-consult-linkbar>div:last-child button{flex:1 1 auto}
  .susi-beta-compare-metrics{grid-template-columns:1fr!important}.susi-beta-compare-metrics>span:nth-child(5){grid-column:auto!important}
}
`;
