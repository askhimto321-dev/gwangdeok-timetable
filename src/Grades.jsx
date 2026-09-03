import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Search, Upload, FileSpreadsheet, Loader2, Save, FileText, ExternalLink, Trash2, BookOpen, Archive, MapPin, Printer, BarChart3, UsersRound, TrendingUp, GraduationCap, CircleAlert, CheckCircle2, Star, MessageSquare, Paperclip, Download, X, ArrowLeft } from "lucide-react";
import { readStorage, uploadAdmissionDocument, readAdmissionDocument, deleteAdmissionPdf, diagnoseStorageConnection, diagnoseAdmissionFileBackends, uploadClassroomAttachment, deleteClassroomAttachment } from "./storage.js";
import { extractPdfFilesFromZip } from "./zipReader.js";
import { AdmissionCaseAnalytics, AdmissionCaseAdmin } from "./AdmissionCases.jsx";
import SusiNaviBetaView, { conversionDetails, loadSusiNaviBetaData } from "./SusiNaviBeta.jsx";
import {
  parseSemesterSheet,
  computeAllGroupAverages,
  computeMockExamSums,
  matchUniversities,
  gradeAnalysisComment,
  inferCategory,
  inferSubjectType,
  normalizeCategory,
  getSubjectGrade,
  grade5to9,
  evaluateAdmissionRequirement,
  parseAdmissionSubjectGroups,
} from "./gradeEngine.js";

const SEMESTER_KEYS = ["1-1", "1-2", "2-1", "2-2", "3-1", "3-2"];
const SEMESTER_LABELS = {
  "1-1": "1학년 1학기", "1-2": "1학년 2학기",
  "2-1": "2학년 1학기", "2-2": "2학년 2학기",
  "3-1": "3학년 1학기", "3-2": "3학년 2학기",
};
const MOCK_MONTH_KEYS = ["1-3", "1-6", "1-9", "1-10", "2-3", "2-6", "2-9", "3-3", "3-6", "3-9"];
const MOCK_MONTH_LABELS = {
  "1-3": "1학년 3월", "1-6": "1학년 6월", "1-9": "1학년 9월", "1-10": "1학년 10월",
  "2-3": "2학년 3월", "2-6": "2학년 6월", "2-9": "2학년 9월",
  "3-3": "3학년 3월", "3-6": "3학년 6월", "3-9": "3학년 9월",
};
const MOCK_SUBJECTS = ["국어", "수학", "영어", "한국사", "통합사회", "통합과학"];
const CORE_MOCK_SUBJECTS = ["국어", "수학", "영어", "통합사회", "통합과학"];
const CATEGORY_GROUP_NAMES = ["국어", "영어", "수학", "사회", "과학", "기술가정/정보", "제2외국어/한문"];
const COMBINATION_GROUP_NAMES = ["전과목", "국영수사과", "국영수사", "국영수과", "국영수", "국영사", "국영과", "영수사", "영수과"];
const COMBINATION_META = {
  전과목: { color: "#2f4630", background: "#eaf2e8" },
  국영수사과: { color: "#315a9b", background: "#edf3ff" },
  국영수사: { color: "#76551b", background: "#fff4dc" },
  국영수과: { color: "#356b49", background: "#eaf7ef" },
  국영수: { color: "#5d4898", background: "#f1edff" },
  국영사: { color: "#9a4254", background: "#fff0f3" },
  국영과: { color: "#2f7770", background: "#e8f7f5" },
  영수사: { color: "#8a641d", background: "#fff5df" },
  영수과: { color: "#416a7d", background: "#edf6fa" },
};

const REPORT_BETA_GROUPS = ["전교과", "국수영사과", "국수영과", "국수영사"];
const EMPTY_FAVORITES = Object.freeze([]);

function statisticalGradeValue(betaData, grade5, group) {
  return conversionDetails(betaData, "statistical", group, grade5)?.value ?? null;
}

function statisticalReportGroups(groups, betaData, group) {
  return Object.fromEntries(Object.entries(groups || {}).map(([name, values]) => {
    const perSemester5 = values?.perSemester5 || [];
    return [name, {
      ...values,
      perSemester9: perSemester5.map(value => value == null ? null : statisticalGradeValue(betaData, value, group)),
      avg9: values?.avg5 == null ? null : statisticalGradeValue(betaData, values.avg5, group),
    }];
  }));
}

const CATEGORY_META = {
  국어: { short: "국어", label: "국어", color: "#315a9b", background: "#eef3ff", row: "#f8faff" },
  영어: { short: "영어", label: "영어", color: "#9a4254", background: "#fff0f3", row: "#fff9fa" },
  수학: { short: "수학", label: "수학", color: "#5d4898", background: "#f1edff", row: "#faf8ff" },
  사회: { short: "사회", label: "사회", color: "#8a641d", background: "#fff5df", row: "#fffbf2" },
  // 1등급·성취도 A의 초록색과 겹치지 않도록 과학은 청록-파랑 계열로 구분합니다.
  과학: { short: "과학", label: "과학", color: "#176b87", background: "#e6f5fa", row: "#f3fbfd" },
  "기술가정/정보": { short: "기가/정보", label: "기가/정보", color: "#2f7770", background: "#e8f7f5", row: "#f5fbfa" },
  "제2외국어/한문": { short: "제2외국어/한문", label: "제2외국어/한문", color: "#a35f26", background: "#fff1e4", row: "#fff9f3" },
  기타: { short: "기타", label: "기타", color: "#716b5f", background: "#f1f0ec", row: "#fbfaf7" },
};

const SUBJECT_TYPE_META = {
  // 교과계열 색과 경쟁하지 않도록 채도를 낮춘 회색·청록·자주·갈색 계열을 사용합니다.
  "공통과목": { short: "공통", color: "#48545f", background: "#eef1f3", border: "#c9d0d5" },
  "일반선택": { short: "일반", color: "#3f6862", background: "#eaf2f0", border: "#bfd2ce" },
  "진로선택": { short: "진로", color: "#6d5a70", background: "#f1edf2", border: "#d4c8d5" },
  "융합선택": { short: "융합", color: "#7b604e", background: "#f4eee9", border: "#dccdc2" },
  "기타": { short: "기타", color: "#66645f", background: "#f3f2ef", border: "#d8d5cf" },
};

function subjectTypeMeta(subject) {
  const type = inferSubjectType(subject?.subject, subject?.subjectType);
  return { type, ...(SUBJECT_TYPE_META[type] || SUBJECT_TYPE_META.기타) };
}

const CATEGORY_TREND_OPTIONS = ["국어", "영어", "수학", "사회", "과학", "전과목"];
const MOCK_TREND_OPTIONS = [...MOCK_SUBJECTS, "전과목 평균"];
const ADMISSION_REGIONS = ["미지정", "서울", "경기", "인천", "강원", "대전·세종", "충북", "충남", "광주", "전북", "전남", "대구", "경북", "부산", "울산", "경남", "제주", "기타"];
const ADMISSION_FIELD_FILTERS = ["공통", "인문", "자연", "간호"];
const ADMISSION_FIELD_META = {
  인문: { color: "#76551b", background: "#fff4dc", border: "#ead39d" },
  자연: { color: "#176b87", background: "#e6f5fa", border: "#bcdde8" },
  간호: { color: "#8a3d64", background: "#fff0f6", border: "#edc9dc" },
  공통: { color: "#5f594d", background: "#f4f2ed", border: "#ded9cd" },
};

function admissionFieldTags(row) {
  const explicit = String(row?.admissionField || row?.field || row?.series || "").trim();
  const collectTags = source => {
    const text = String(source || "")
      .replace(/간호(?:학과|학부|대학|계열)?(?:를|을|는|은)?\s*제외(?:한|하고|함)?/g, " ")
      .replace(/제외(?:한|하고|함)?[^,.;\n]{0,18}간호(?:학과|학부|대학|계열)?/g, " ")
      .replace(/\s+/g, "");
    const tags = [];
    if (/간호/.test(text)) tags.push("간호");
    if (/(인문|사회계열|상경|경영|경제|어문|문과|법학|행정|교육계열)/.test(text)) tags.push("인문");
    if (/(자연|이공|공학|과학계열|수학계열|자연과학|의약|의학|약학|수의|보건계열)/.test(text)) tags.push("자연");
    if (/(공통계열|전계열|계열공통)/.test(text)) tags.push("공통");
    return Array.from(new Set(tags));
  };

  // 계열구분 열이 있으면 학과명·비고보다 우선합니다. 예를 들어
  // "인문·자연(간호학과 제외)"를 간호 계열로 잘못 분류하지 않습니다.
  const explicitTags = collectTags(explicit);
  if (explicitTags.length) return explicitTags;

  const rawText = [row?.department, row?.track, row?.note].filter(Boolean).join(" ");
  const text = rawText
    .replace(/간호(?:학과|학부|대학|계열)?(?:를|을|는|은)?\s*제외(?:한|하고|함)?/g, " ")
    .replace(/제외(?:한|하고|함)?[^,.;\n]{0,18}간호(?:학과|학부|대학|계열)?/g, " ")
    .replace(/\s+/g, "");
  const tags = [];
  if (/간호/.test(text)) tags.push("간호");
  if (/(인문|사회계열|상경|경영|경제|어문|문과|법학|행정|교육계열)/.test(text)) tags.push("인문");
  if (/(자연|이공|공학|과학계열|수학계열|자연과학|의약|의학|약학|수의|보건계열)/.test(text)) tags.push("자연");
  if (/(공통계열|전계열|계열공통)/.test(text)) tags.push("공통");
  const unique = Array.from(new Set(tags));
  if (unique.length) return unique;

  // Ver3 이전에 "계열(학과)" 헤더를 읽지 못한 채 저장된 행도 화면에서 복구합니다.
  // 가톨릭대 지역균형은 제공 원본 기준으로 2개 영역 최저가 인문·자연,
  // 3개 영역 최저가 간호학과이므로 기존 저장 데이터도 다시 구분합니다.
  const legacyUniversity = universityKey(row?.university);
  const legacyCount = Number(row?.requiredSubjectCount);
  if (legacyUniversity === "가톨릭대" && /지역균형/.test(String(row?.track || ""))) {
    if (legacyCount >= 3) return ["간호"];
    if (legacyCount === 2) return ["인문", "자연"];
  }
  return ["공통"];
}

function AdmissionFieldBadges({ tags }) {
  const values = tags?.length ? tags : ["공통"];
  return (
    <div style={admissionFieldBadge.wrap}>
      {values.map(value => {
        const meta = ADMISSION_FIELD_META[value] || ADMISSION_FIELD_META.공통;
        return <span key={value} style={{ ...admissionFieldBadge.base, color: meta.color, background: meta.background, borderColor: meta.border }}>{value}</span>;
      })}
    </div>
  );
}

function AdmissionRegionField({ row }) {
  const region = row?.region || "미지정";
  return (
    <div style={admissionTable.regionFieldStack}>
      <span style={{ ...regionBadge, ...admissionTable.regionCompact }}>
        {region !== "미지정" && <MapPin size={8} />}{region}
      </span>
      <AdmissionFieldBadges tags={row?._fieldTags} />
    </div>
  );
}
const REGION_KEYWORDS = [
  ["서울", "서울"], ["경기", "경기"], ["인천", "인천"], ["강원", "강원"],
  ["대전", "대전·세종"], ["세종", "대전·세종"], ["충북", "충북"], ["충남", "충남"],
  ["광주", "광주"], ["전북", "전북"], ["전남", "전남"], ["대구", "대구"],
  ["경북", "경북"], ["부산", "부산"], ["울산", "울산"], ["경남", "경남"], ["제주", "제주"],
];

function getAcademicYear() {
  const now = new Date();
  return now.getMonth() < 2 ? now.getFullYear() - 1 : now.getFullYear();
}
const CURRENT_ACADEMIC_YEAR = getAcademicYear();
const DEFAULT_COHORT_SETTINGS = {
  academicYear: CURRENT_ACADEMIC_YEAR,
  cohorts: [
    { entryYear: CURRENT_ACADEMIC_YEAR - 2, currentGrade: 3, status: "재학" },
    { entryYear: CURRENT_ACADEMIC_YEAR - 1, currentGrade: 2, status: "재학" },
    { entryYear: CURRENT_ACADEMIC_YEAR, currentGrade: 1, status: "재학" },
  ],
};
function normalizeCohortSettings(value) {
  const academicYear = Number(value?.academicYear) || CURRENT_ACADEMIC_YEAR;
  const rows = Array.isArray(value?.cohorts) ? value.cohorts : DEFAULT_COHORT_SETTINGS.cohorts;
  const cohorts = rows.map(row => ({
    entryYear: Number(row?.entryYear),
    currentGrade: Number(row?.currentGrade) || null,
    status: row?.status || (Number(row?.currentGrade) ? "재학" : "졸업"),
  })).filter(row => Number.isFinite(row.entryYear));
  return { academicYear, cohorts: cohorts.length ? cohorts : DEFAULT_COHORT_SETTINGS.cohorts };
}
function cohortDataKey(entryYear, key) { return `${Number(entryYear)}:${key}`; }
function cohortRecord(data, entryYear, key) { return data?.[cohortDataKey(entryYear, key)] || data?.[key] || null; }
function inferEntryYear({ studentInfo, metaRecord, sid, latestSemesterRecord, cohortSettings }) {
  const direct = asNumber(studentInfo?.entryYear ?? metaRecord?.entryYear ?? latestSemesterRecord?.entryYear);
  if (direct) return direct;
  const grade = asNumber(studentInfo?.grade) ?? asNumber(String(sid || "").charAt(0)) ?? asNumber(latestSemesterRecord?.grade ?? metaRecord?.grade) ?? 1;
  const settings = normalizeCohortSettings(cohortSettings);
  const mapped = settings.cohorts.find(item => Number(item.currentGrade) === Number(grade) && item.status !== "졸업");
  return mapped?.entryYear || settings.academicYear - grade + 1;
}
function entryYearForGrade(cohortSettings, grade) {
  const settings = normalizeCohortSettings(cohortSettings);
  return settings.cohorts.find(item => Number(item.currentGrade) === Number(grade) && item.status !== "졸업")?.entryYear || settings.academicYear - Number(grade) + 1;
}
function gradeForEntryYear(cohortSettings, entryYear, fallback = 2) {
  const settings = normalizeCohortSettings(cohortSettings);
  return Number(settings.cohorts.find(item => Number(item.entryYear) === Number(entryYear) && item.status !== "졸업")?.currentGrade) || Number(fallback) || 2;
}
function normalizeAdmissionTargetGrade(value, fallback = 2) {
  const grade = Number(value);
  return [1, 2, 3].includes(grade) ? grade : Number(fallback) || 2;
}
function admissionItemsForGrade(items = [], grade = 2) {
  const target = normalizeAdmissionTargetGrade(grade);
  return (items || []).filter(item => normalizeAdmissionTargetGrade(item?.targetGrade, 2) === target);
}
function mergeScopedAdmissionStorage(legacyItems = [], scopedItems = []) {
  const scoped = (scopedItems || []).flatMap((items, index) => (items || []).map(item => ({ ...item, targetGrade: index + 1 })));
  if (scoped.length) return scoped;
  return (legacyItems || []).map(item => ({ ...item, targetGrade: normalizeAdmissionTargetGrade(item?.targetGrade, 2) }));
}
function admissionYearForGrade(grade) {
  return CURRENT_ACADEMIC_YEAR + (4 - normalizeAdmissionTargetGrade(grade));
}


function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function resolveCategoryKey(category, subject) {
  const normalized = normalizeCategory(category, subject);
  return normalized === "한국사" ? "사회" : (CATEGORY_META[normalized] ? normalized : "기타");
}

function shortCategory(category, subject) {
  const key = resolveCategoryKey(category, subject);
  return CATEGORY_META[key]?.short || CATEGORY_META.기타.short;
}

function categoryMeta(category, subject) {
  const key = resolveCategoryKey(category, subject);
  return { key, ...(CATEGORY_META[key] || CATEGORY_META.기타) };
}

// 평균 등급은 소수 구간으로 구분합니다.
// 1.00~1.99는 초록, 2.00~2.99는 파랑, 그 외는 중립색으로 표시합니다.
function gradeValueStyle(value) {
  const grade = asNumber(value);
  if (grade == null) return {};
  if (grade >= 1 && grade < 2) return { background: "#e7f5ea", color: "#24613a", border: "1px solid #bfe2c8" };
  if (grade >= 2 && grade < 3) return { background: "#edf3ff", color: "#315a9b", border: "1px solid #cad8f3" };
  return { background: "#f4f2ed", color: "#5f594d", border: "1px solid #ded9cd" };
}


function semesterCalendarLabel(key, entryYear, compact = false) {
  const [grade, semester] = key.split("-").map(Number);
  const year = entryYear + grade - 1;
  return compact ? `${year} · ${grade}-${semester}` : `${year}년 ${grade}학년 ${semester}학기`;
}

function mockCalendarLabel(key, entryYear, compact = false) {
  const [grade, month] = key.split("-").map(Number);
  const year = entryYear + grade - 1;
  return compact ? `${year} · ${grade}학년 ${month}월` : `${year}년 ${grade}학년 ${month}월`;
}

let _xlsxModule = null;
async function loadXLSX() {
  if (!_xlsxModule) _xlsxModule = await import("xlsx");
  return _xlsxModule;
}

function yieldForUploadPaint() {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function workbookReadOptions() {
  return {
    type: "array",
    cellDates: false,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    bookVBA: false,
    bookFiles: false,
  };
}

function cleanGuideBaseName(fileName) {
  return String(fileName || "")
    .replace(/^.*[\/]/, "")
    .replace(/\.pdf$/i, "")
    .replace(/[（(]?\s*20\d{2}\s*학년도?\s*[)）]?/g, " ")
    .replace(/수시|정시|모집요강|입학전형|전형계획|시행계획|입시요강|대학입학|최종본?|배포용|확정본?/g, " ")
    .replace(/[_\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferUniversityFromFileName(fileName, knownUniversities = []) {
  const normalizedFile = universityKey(fileName);
  const entries = (knownUniversities || []).filter(Boolean).map(item => (
    typeof item === "string" ? { name: item, region: "미지정" } : { name: item.name || item.university || "", region: item.region || "미지정" }
  )).filter(item => item.name).sort((a, b) => String(b.name).length - String(a.name).length);
  const fileCampus = explicitAdmissionCampusLabel(fileName) || inferCampusAliasFromText(fileName);
  const fileRegion = inferRegionFromFileName(fileName, "");
  const base = cleanGuideBaseName(fileName);
  const formalMatch = base.match(/([가-힣A-Za-z0-9·]+?(?:과학기술원|교육대학교|여자대학교|대학교|대학))/);
  const formalUniversity = formalMatch ? formalMatch[1].trim() : "";
  const candidates = entries.filter(item => normalizedFile.includes(universityKey(item.name)));
  const campusMatched = fileCampus && candidates.find(item => admissionCampusLabel(item.name, item.region) === fileCampus);
  if (campusMatched) return resolveKnownUniversityBaseName(formalUniversity && universityKey(formalUniversity) === universityKey(campusMatched.name) ? formalUniversity : campusMatched.name, entries);
  const regionCampus = fileRegion ? candidates.find(item => {
    const candidateCampus = admissionCampusLabel(item.name, item.region);
    return candidateCampus && candidateCampus === campusFromRegionForUniversity(item.name, fileRegion);
  }) : null;
  if (regionCampus) return resolveKnownUniversityBaseName(formalUniversity && universityKey(formalUniversity) === universityKey(regionCampus.name) ? formalUniversity : regionCampus.name, entries);
  if (candidates.length === 1) return resolveKnownUniversityBaseName(formalUniversity && universityKey(formalUniversity) === universityKey(candidates[0].name) ? formalUniversity : candidates[0].name, entries);
  if (candidates.length > 1) {
    const exactText = candidates.find(item => normalizeUniversitySearchText(fileName).includes(normalizeUniversitySearchText(item.name)));
    if (exactText) return resolveKnownUniversityBaseName(formalUniversity && universityKey(formalUniversity) === universityKey(exactText.name) ? formalUniversity : exactText.name, entries);
  }

  const inferredBase = formalMatch ? formalMatch[1].trim() : (base.split(/[\s()[\]{}]+/).find(part => part && part.length >= 2) || "대학명 확인 필요");
  return fileCampus ? universityNameWithCampus(resolveKnownUniversityBaseName(inferredBase, entries), fileCampus) : resolveKnownUniversityBaseName(inferredBase, entries);
}

function inferAdmissionYearFromFileName(fileName, fallbackYear = "") {
  const text = String(fileName || "").normalize("NFKC");
  const explicit = text.match(/(20\d{2})\s*학년도/);
  if (explicit) return explicit[1];
  const anyYear = text.match(/(?:^|[^0-9])(20(?:2[4-9]|3[0-5]))(?:[^0-9]|$)/);
  return anyYear?.[1] || String(fallbackYear || "").trim();
}

function formalizeUniversityBaseName(value) {
  const base = universityNameWithoutCampus(String(value || "").normalize("NFKC").trim()).replace(/\s+/g, "");
  if (!base) return "";
  if (/(?:대학교|교육대학교|여자대학교|과학기술원|대학)$/.test(base)) return base;
  if (/여자대$/.test(base)) return `${base.slice(0, -3)}여자대학교`;
  if (/교육대$/.test(base)) return `${base.slice(0, -3)}교육대학교`;
  if (/여대$/.test(base)) return `${base.slice(0, -2)}여자대학교`;
  if (/교대$/.test(base)) return `${base.slice(0, -2)}교육대학교`;
  return base;
}

function universityDisplayNamePriority(value) {
  const name = String(value || "");
  if (/여자대학교$/.test(name)) return 500 + name.length;
  if (/교육대학교$/.test(name)) return 480 + name.length;
  if (/대학교$/.test(name)) return 450 + name.length;
  if (/과학기술원$/.test(name)) return 440 + name.length;
  if (/대학$/.test(name)) return 350 + name.length;
  if (/여대$/.test(name)) return 200 + name.length;
  if (/교대$/.test(name)) return 190 + name.length;
  if (/대$/.test(name)) return 180 + name.length;
  return name.length;
}

function canonicalAdmissionUniversityBase(value) {
  return formalizeUniversityBaseName(value);
}

function resolveKnownUniversityBaseName(value, knownEntries = []) {
  const fallback = canonicalAdmissionUniversityBase(value);
  const targetKey = universityKey(fallback || value);
  if (!targetKey) return fallback;
  const candidates = Array.from(new Set((knownEntries || []).map(item => {
    const raw = typeof item === "string" ? item : item?.name || item?.university || "";
    return canonicalAdmissionUniversityBase(raw);
  }).filter(Boolean))).sort((a, b) => universityDisplayNamePriority(b) - universityDisplayNamePriority(a) || a.localeCompare(b, "ko"));
  const exact = candidates.find(name => universityKey(name) === targetKey);
  if (exact) return exact;
  const normalizedTarget = normalizeUniversitySearchText(fallback || value);
  const similar = candidates.filter(name => {
    const normalizedName = normalizeUniversitySearchText(name);
    return normalizedName && normalizedTarget && (normalizedName.includes(normalizedTarget) || normalizedTarget.includes(normalizedName));
  }).sort((a, b) => universityDisplayNamePriority(b) - universityDisplayNamePriority(a) || String(b).length - String(a).length);
  return similar[0] || fallback;
}

function admissionUniversityDisplayName(value) {
  const source = String(value || "대학").trim();
  const campus = explicitAdmissionCampusLabel(source);
  const formal = canonicalAdmissionUniversityBase(source) || "대학";
  return campus ? `${formal}(${campus})` : formal;
}

function normalizeAdmissionDocumentLabel(label, universityName, type, year) {
  const university = admissionUniversityDisplayName(universityName || "대학명 확인 필요");
  const formalBase = canonicalAdmissionUniversityBase(university);
  const raw = String(label || "").normalize("NFKC").trim();
  if (!raw) return admissionDocumentDisplayLabel(type, year, university);
  const normalized = raw.replace(/([가-힣A-Za-z0-9·]+?(?:여자대학교|교육대학교|대학교|과학기술원|여대|교대|대학|대))/g, token => (
    universityKey(token) === universityKey(formalBase) ? formalBase : token
  ));
  return normalized.replace(/\s+/g, " ").trim();
}

function normalizeAdmissionDocumentRecord(item) {
  if (!item || typeof item !== "object") return item;
  const university = admissionUniversityDisplayName(item.university || "대학명 확인 필요");
  const year = String(item.year || inferAdmissionYearFromFileName(`${item.fileName || ""} ${item.label || ""}`, "")).trim();
  const type = admissionDocumentType(item);
  return {
    ...item,
    university,
    year,
    campus: item.campus || admissionCampusLabel(university, item.region) || "",
    label: normalizeAdmissionDocumentLabel(item.label, university, type, year),
  };
}

function admissionDocumentSemanticKey(item, fallbackTargetGrade = 2) {
  const normalized = normalizeAdmissionDocumentRecord(item) || {};
  const year = String(normalized.year || "").trim() || "연도미지정";
  const campus = normalized.campus || admissionCampusLabel(normalized.university, normalized.region) || "";
  return [
    universityDocumentKey(normalized.university, normalized.region, campus),
    admissionDocumentType(normalized),
    year,
  ].join("|");
}

function deduplicateAdmissionDocuments(items = []) {
  const map = new Map();
  (items || []).map(normalizeAdmissionDocumentRecord).filter(Boolean).forEach(item => {
    const key = admissionDocumentSemanticKey(item, item?.targetGrade || 2);
    const current = map.get(key);
    if (!current || String(item.updatedAt || "").localeCompare(String(current.updatedAt || "")) >= 0) map.set(key, item);
  });
  return Array.from(map.values());
}

function admissionDocumentDisplayLabel(type, valueYear, universityName) {
  const typeName = type === "reflection" ? "교과 반영표" : "모집요강";
  const yearPart = String(valueYear || "").trim() ? `${String(valueYear).trim()}학년도 ` : "";
  return `${yearPart}${admissionUniversityDisplayName(universityName)} ${typeName}`.replace(/\s+/g, " ").trim();
}

function inferRegionFromFileName(fileName, knownRegion = "") {
  if (knownRegion && knownRegion !== "미지정") return knownRegion;
  const text = String(fileName || "").normalize("NFKC");
  const tokens = text.replace(/[()（）[\]{}]/g, " ").split(/[\s_\-–—]+/).filter(Boolean);
  const found = REGION_KEYWORDS.find(([keyword]) => (
    tokens.includes(keyword) || text.includes(`${keyword}캠퍼스`) || text.includes(`${keyword}캠`)
  ));
  return found ? found[1] : "미지정";
}

export async function loadGradesDB() {
  const [
    semesterData, mockData,
    legacyAdmissionRows, admissionRows1, admissionRows2, admissionRows3,
    legacyAdmissionDocs, admissionDocs1, admissionDocs2, admissionDocs3,
    studentAccounts, cohortSettings, admissionCaseSources, admissionCases, admissionFavorites, admissionCounseling,
  ] = await Promise.all([
    readStorage("kd_grades_semesters", {}), readStorage("kd_grades_mocks", {}),
    readStorage("kd_grades_admission", []),
    readStorage("kd_grades_admission_grade_1", []), readStorage("kd_grades_admission_grade_2", []), readStorage("kd_grades_admission_grade_3", []),
    readStorage("kd_grades_admission_docs", []),
    readStorage("kd_grades_admission_docs_grade_1", []), readStorage("kd_grades_admission_docs_grade_2", []), readStorage("kd_grades_admission_docs_grade_3", []),
    readStorage("kd_grades_students_meta", {}), readStorage("kd_grades_cohorts", DEFAULT_COHORT_SETTINGS),
    readStorage("kd_grades_admission_case_sources", []), readStorage("kd_grades_admission_cases", []), readStorage("kd_grades_admission_favorites", {}), readStorage("kd_grades_admission_counseling", {}),
  ]);
  const admissionRows = mergeScopedAdmissionStorage(legacyAdmissionRows, [admissionRows1, admissionRows2, admissionRows3]);
  const admissionDocs = deduplicateAdmissionDocuments(mergeScopedAdmissionStorage(legacyAdmissionDocs, [admissionDocs1, admissionDocs2, admissionDocs3]));
  return { semesterData, mockData, admissionRows, admissionDocs, studentAccounts, cohortSettings: normalizeCohortSettings(cohortSettings), admissionCaseSources, admissionCases, admissionFavorites: admissionFavorites || {}, admissionCounseling: admissionCounseling || {} };
}

export default function GradesSection({
  loggedInAdmin,
  loggedInTeacher,
  loggedInStudent,
  roster,
  accounts,
  showToast,
  onLogout,
  gdb,
  currentGrade = "2",
  teacherGradeAccess = [],
  selectedStudentSid,
  onSelectedStudentSidChange,
  selectedStudentQuery,
  onSelectedStudentQueryChange,
  requestedStudentView,
  onWorkspaceViewChange,
  persistGrades,
}) {
  const [tab, setTab] = useState(loggedInStudent ? "grades" : "lookup");
  const [visitedTabs, setVisitedTabs] = useState(() => [loggedInStudent ? "grades" : "lookup"]);
  const [localLookupSid, setLocalLookupSid] = useState(null);
  const [localLookupQuery, setLocalLookupQuery] = useState("");
  const controlledLookup = selectedStudentSid !== undefined;
  const lookupSid = controlledLookup ? selectedStudentSid : localLookupSid;
  const lookupQuery = selectedStudentQuery !== undefined ? selectedStudentQuery : localLookupQuery;
  const setLookupSid = value => controlledLookup ? onSelectedStudentSidChange?.(value) : setLocalLookupSid(value);
  const setLookupQuery = value => selectedStudentQuery !== undefined ? onSelectedStudentQueryChange?.(value) : setLocalLookupQuery(value);
  useEffect(() => {
    setVisitedTabs(previous => previous.includes(tab) ? previous : [...previous, tab]);
  }, [tab]);
  const keepTabMounted = key => tab === key || visitedTabs.includes(key);
  const teacherHasGradeAccess = !loggedInTeacher || (teacherGradeAccess || []).map(String).includes(String(currentGrade));
  const [linkedUniversity, setLinkedUniversity] = useState("");
  const [linkedDepartment, setLinkedDepartment] = useState("");
  const [linkedAdmissionType, setLinkedAdmissionType] = useState("");
  const [returnToConsultation, setReturnToConsultation] = useState(false);
  const favoriteItemsFor = useCallback(targetSid => (gdb?.admissionFavorites?.[String(targetSid)] || EMPTY_FAVORITES), [gdb]);
  const activeStudentSid = String(loggedInStudent?.id || lookupSid || "").trim();
  const susiNaviStudent = useMemo(() => {
    const sid = activeStudentSid;
    if (!sid || !gdb) return null;
    const studentInfo = roster?.[sid] || null;
    const metaRecord = Array.isArray(gdb.studentAccounts)
      ? gdb.studentAccounts.find(student => String(student.id) === sid)
      : gdb.studentAccounts?.[sid];
    const legacyRecords = SEMESTER_KEYS.map(key => gdb.semesterData?.[key]?.students?.[sid] || null);
    const legacyLatest = legacyRecords.slice().reverse().find(Boolean) || null;
    const entryYear = inferEntryYear({ studentInfo, metaRecord, sid, latestSemesterRecord: legacyLatest, cohortSettings: gdb.cohortSettings });
    const semesterRecords = SEMESTER_KEYS.map((key, index) => cohortRecord(gdb.semesterData, entryYear, key)?.students?.[sid] || legacyRecords[index] || null);
    const latest = semesterRecords.slice().reverse().find(Boolean) || legacyLatest;
    const subjectLists = semesterRecords.map(record => record?.subjects || null);
    const gradeSystem = Number(entryYear) >= 2025 ? 5 : 9;
    const groups = computeAllGroupAverages(subjectLists, gradeSystem);
    return {
      sid,
      name: studentInfo?.name || latest?.name || metaRecord?.name || "",
      gradeSystem,
      grade5: gradeSystem === 5 ? groups?.전과목?.avg5 : null,
      grade5ByGroup: gradeSystem === 5 ? {
        전교과: groups?.전과목?.avg5 ?? null,
        국수영사과: groups?.국영수사과?.avg5 ?? null,
        국수영과: groups?.국영수과?.avg5 ?? null,
        국수영사: groups?.국영수사?.avg5 ?? null,
      } : {},
      entryYear,
    };
  }, [activeStudentSid, gdb, roster]);
  const toggleFavorite = useCallback(async (targetSid, item) => {
    if (!targetSid || !persistGrades || !item?.university) return false;
    const source = item.source || "admission";
    const normalizedItem = { ...item, source };
    const key = favoriteSemanticKey(normalizedItem);
    const current = favoriteItemsFor(targetSid);
    const exists = current.some(value => favoriteSemanticKey(value) === key);
    const nextList = exists
      ? current.filter(value => favoriteSemanticKey(value) !== key)
      : [...current, { ...normalizedItem, id: key, addedAt: new Date().toISOString() }];
    const next = { ...(gdb?.admissionFavorites || {}), [String(targetSid)]: nextList };
    return persistGrades({ admissionFavorites: next });
  }, [gdb, persistGrades, favoriteItemsFor]);
  const gradesHistorySessionRef = useRef(`kd-grades-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const gradesHistoryDepthRef = useRef(0);
  const currentGradesViewRef = useRef({ tab, linkedUniversity: "", linkedDepartment: "", linkedAdmissionType: "", returnToConsultation: false });
  const applyGradesView = useCallback(view => {
    setTab(view?.tab || (loggedInStudent ? "grades" : "lookup"));
    setLinkedUniversity(view?.linkedUniversity || "");
    setLinkedDepartment(view?.linkedDepartment || "");
    setLinkedAdmissionType(view?.linkedAdmissionType || "");
    setReturnToConsultation(Boolean(view?.returnToConsultation));
  }, [loggedInStudent]);
  useEffect(() => {
    currentGradesViewRef.current = { tab, linkedUniversity, linkedDepartment, linkedAdmissionType, returnToConsultation };
  }, [tab, linkedUniversity, linkedDepartment, linkedAdmissionType, returnToConsultation]);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const session = gradesHistorySessionRef.current;
    const initial = currentGradesViewRef.current;
    window.history.replaceState({ ...(window.history.state || {}), kdGradesSession: session, kdGradesDepth: 0, kdGradesView: initial }, "");
    gradesHistoryDepthRef.current = 0;
    const handlePopState = event => {
      const state = event.state || {};
      if (state.kdGradesSession !== session || !state.kdGradesView) return;
      gradesHistoryDepthRef.current = Math.max(0, Number(state.kdGradesDepth || 0));
      applyGradesView(state.kdGradesView);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [applyGradesView]);
  const navigateGradeTab = (nextTab, options = {}) => {
    const keepLinked = Boolean(options.keepLinked);
    const next = {
      tab: nextTab,
      linkedUniversity: options.linkedUniversity ?? (keepLinked ? linkedUniversity : ""),
      linkedDepartment: options.linkedDepartment ?? (keepLinked ? linkedDepartment : ""),
      linkedAdmissionType: options.linkedAdmissionType ?? (keepLinked ? linkedAdmissionType : ""),
      returnToConsultation: Boolean(options.returnToConsultation),
    };
    if (JSON.stringify(next) === JSON.stringify(currentGradesViewRef.current)) return;
    const currentDepth = gradesHistoryDepthRef.current;
    const nextDepth = options.replace ? currentDepth : currentDepth + 1;
    if (typeof window !== "undefined") {
      const state = { ...(window.history.state || {}), kdGradesSession: gradesHistorySessionRef.current, kdGradesDepth: nextDepth, kdGradesView: next };
      if (options.replace) window.history.replaceState(state, ""); else window.history.pushState(state, "");
    }
    gradesHistoryDepthRef.current = nextDepth;
    currentGradesViewRef.current = next;
    applyGradesView(next);
    const workspaceView = nextTab === "lookup" || nextTab === "grades"
      ? "grades"
      : nextTab === "lookupAdmission" || nextTab === "admission"
        ? "admission"
        : nextTab === "consultation"
          ? "consultation"
          : nextTab === "susiNaviBeta"
            ? "susiNaviBeta"
            : nextTab === "admissionCases"
              ? "admissionCases"
              : nextTab === "mockAnalysis"
                ? "mockAnalysis"
                : "";
    if (workspaceView) onWorkspaceViewChange?.(workspaceView);
  };
  const openCaseUniversity = (name, fromConsultation = false, department = "", admissionType = "") => navigateGradeTab("admissionCases", { linkedUniversity: name || "", linkedDepartment: department || "", linkedAdmissionType: admissionType || "", returnToConsultation: fromConsultation });
  const openAdmissionUniversity = (name, fromConsultation = false) => navigateGradeTab(loggedInStudent ? "admission" : "lookupAdmission", { linkedUniversity: name || "", returnToConsultation: fromConsultation });
  const openSusiNaviUniversity = (name, fromConsultation = false, department = "") => navigateGradeTab("susiNaviBeta", { linkedUniversity: name || "", linkedDepartment: department || "", returnToConsultation: fromConsultation });
  const returnToConsultationView = () => {
    if (typeof window !== "undefined" && gradesHistoryDepthRef.current > 0) window.history.back();
    else navigateGradeTab("consultation", { replace: true });
  };
  const clearLinkedUniversity = () => {
    const next = { ...currentGradesViewRef.current, linkedUniversity: "", linkedDepartment: "", linkedAdmissionType: "", returnToConsultation: false };
    currentGradesViewRef.current = next;
    applyGradesView(next);
    if (typeof window !== "undefined" && window.history.state?.kdGradesSession === gradesHistorySessionRef.current) window.history.replaceState({ ...window.history.state, kdGradesView: next }, "");
  };

  useEffect(() => {
    if (loggedInTeacher && !teacherHasGradeAccess && tab !== "class") navigateGradeTab("lookup", { replace: true });
  }, [loggedInTeacher, teacherHasGradeAccess, tab]);

  useEffect(() => {
    if (!requestedStudentView || loggedInStudent) return;
    if (requestedStudentView === "grades") navigateGradeTab("lookup", { replace: true });
    if (requestedStudentView === "admission") navigateGradeTab("lookupAdmission", { replace: true });
    if (requestedStudentView === "consultation") navigateGradeTab("consultation", { replace: true });
    if (requestedStudentView === "susiNaviBeta") navigateGradeTab("susiNaviBeta", { replace: true });
    if (requestedStudentView === "admissionCases") navigateGradeTab("admissionCases", { replace: true });
    if (requestedStudentView === "mockAnalysis") navigateGradeTab("mockAnalysis", { replace: true });
  }, [requestedStudentView, loggedInStudent]);

  if (!gdb) return <div style={{ padding: 40, textAlign: "center" }}><Loader2 className="spin" size={20} /></div>;

  return (
    <div>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #e6e1d3", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>성적</div>
          <div style={{ fontSize: 11.5, color: "#8a8578" }}>
            {loggedInStudent && `${loggedInStudent.name} 학생`}
            {loggedInTeacher && (loggedInTeacher.accountType === "department"
              ? `${loggedInTeacher.name || loggedInTeacher.id} 부서 계정`
              : `${loggedInTeacher.name} 선생님`)}
            {loggedInAdmin && "관리자"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn.secondary} onClick={onLogout}>로그아웃</button>
        </div>
      </div>

      <div style={{ padding: 20, maxWidth: 1040, margin: "0 auto" }}>
        {loggedInStudent && <div style={{ display: "flex", gap: 7, marginBottom: 18, flexWrap: "wrap", padding:6, border:"1px solid #dfe5ef", borderRadius:12, background:"linear-gradient(135deg,#f7faff,#fbf9ff)" }}>
          <TabBtn active={tab === "grades"} onClick={() => navigateGradeTab("grades")} label="내 성적 리포트" />
          <TabBtn active={tab === "admission"} onClick={() => navigateGradeTab("admission")} label="대학 지원 진단" />
          <TabBtn active={tab === "consultation"} onClick={() => navigateGradeTab("consultation")} label="상담·관심 대학" />
          <TabBtn active={tab === "susiNaviBeta"} onClick={() => navigateGradeTab("susiNaviBeta")} label="2027 수시NAVI Beta" />
        </div>}
        {(loggedInAdmin || (loggedInTeacher && teacherHasGradeAccess)) && (
          <div style={staffToolNav.wrap}>
            <div style={staffToolNav.heading}><BarChart3 size={17} /><div style={staffToolNav.headingText}><b>교사용 분석·관리</b><span style={{ fontSize: 10.5, fontWeight: 650, color: "#7a8495" }}>학생 조회와 별도로 분석 도구를 사용할 수 있습니다.</span></div></div>
            <div style={staffToolNav.buttons}>
              <button type="button" onClick={() => navigateGradeTab("gradeCompare")} style={{ ...staffToolNav.button, ...(tab === "gradeCompare" ? staffToolNav.active : {}) }}><UsersRound size={13} /> 학생 성적 비교</button>
              <button type="button" onClick={() => navigateGradeTab("mockAnalysis")} style={{ ...staffToolNav.button, ...(tab === "mockAnalysis" ? staffToolNav.active : {}) }}><BarChart3 size={13} /> 모의고사 성적 분석</button>
              <button type="button" onClick={() => navigateGradeTab("admissionCases")} style={{ ...staffToolNav.button, ...(tab === "admissionCases" ? staffToolNav.active : {}) }}><GraduationCap size={13} /> 2024–2026 광덕고 대입 결과</button>
              <button type="button" onClick={() => navigateGradeTab("susiNaviBeta")} style={{ ...staffToolNav.button, ...(tab === "susiNaviBeta" ? staffToolNav.active : {}) }}><BookOpen size={13} /> 2027 수시NAVI <span style={{ fontSize: 9, opacity: .78 }}>Beta</span></button>
              {loggedInTeacher && loggedInTeacher.homeroomClass && <button type="button" onClick={() => navigateGradeTab("class")} style={{ ...staffToolNav.button, ...(tab === "class" ? staffToolNav.active : {}) }}><UsersRound size={13} /> 담임반 학생 계정</button>}
            </div>
          </div>
        )}

        {loggedInStudent && keepTabMounted("grades") && <div style={{ display: tab === "grades" ? "block" : "none" }}><StudentGradeReport key={loggedInStudent.id} sid={loggedInStudent.id} gdb={gdb} mode="grades" studentInfo={loggedInStudent} /></div>}
        {loggedInStudent && keepTabMounted("admission") && <div style={{ display: tab === "admission" ? "block" : "none" }}><StudentAdmissionView key={loggedInStudent.id} sid={loggedInStudent.id} gdb={gdb} studentInfo={loggedInStudent} favorites={favoriteItemsFor(loggedInStudent.id)} onToggleFavorite={item => toggleFavorite(loggedInStudent.id,item)} onOpenCases={(name,department,admissionType)=>openCaseUniversity(name,false,department,admissionType)} focusUniversity={linkedUniversity} onBackToConsultation={returnToConsultation ? returnToConsultationView : undefined} onClearFocus={clearLinkedUniversity} /></div>}
        {loggedInStudent && keepTabMounted("consultation") && <div style={{ display: tab === "consultation" ? "block" : "none" }}><MemoStudentConsultationView sid={loggedInStudent.id} gdb={gdb} studentInfo={loggedInStudent} favorites={favoriteItemsFor(loggedInStudent.id)} onToggleFavorite={item => toggleFavorite(loggedInStudent.id,item)} onOpenAdmission={name => openAdmissionUniversity(name, true)} onOpenCases={(name,department,admissionType) => openCaseUniversity(name, true, department, admissionType)} onOpenSusiNavi={(name,department) => openSusiNaviUniversity(name, true, department)} persistGrades={persistGrades} canEdit={false} authorName={loggedInStudent.name || "학생"} /></div>}

        {loggedInTeacher && !teacherHasGradeAccess && (
          <EmptyBox text={`${currentGrade}학년 학생 성적 조회 권한이 없습니다. 관리자에게 역할 또는 성적 조회 권한을 요청해주세요.`} />
        )}

        {(loggedInAdmin || (loggedInTeacher && teacherHasGradeAccess)) && keepTabMounted("lookup") && <div style={{ display: tab === "lookup" ? "block" : "none" }}>
          <MemoStudentLookup
            roster={roster}
            gdb={gdb}
            isAdmin
            initialView="grades"
            selectedSid={lookupSid}
            onSelectedSidChange={setLookupSid}
            sharedQuery={lookupQuery}
            onSharedQueryChange={setLookupQuery}
            showViewTabs={false}
            hideSearch={true}
            favorites={favoriteItemsFor(lookupSid)}
            onToggleFavorite={item => toggleFavorite(lookupSid,item)}
            focusUniversity={linkedUniversity}
            onOpenCases={(name,department,admissionType)=>openCaseUniversity(name,false,department,admissionType)}
            onBackToConsultation={returnToConsultation ? returnToConsultationView : undefined}
            onClearFocus={clearLinkedUniversity}
          />
        </div>}
        {(loggedInAdmin || (loggedInTeacher && teacherHasGradeAccess)) && keepTabMounted("lookupAdmission") && <div style={{ display: tab === "lookupAdmission" ? "block" : "none" }}>
          <MemoStudentLookup
            roster={roster}
            gdb={gdb}
            isAdmin
            initialView="admission"
            selectedSid={lookupSid}
            onSelectedSidChange={setLookupSid}
            sharedQuery={lookupQuery}
            onSharedQueryChange={setLookupQuery}
            showViewTabs={false}
            hideSearch={true}
            favorites={favoriteItemsFor(lookupSid)}
            onToggleFavorite={item => toggleFavorite(lookupSid,item)}
            focusUniversity={linkedUniversity}
            onOpenCases={(name,department,admissionType)=>openCaseUniversity(name,false,department,admissionType)}
            onBackToConsultation={returnToConsultation ? returnToConsultationView : undefined}
            onClearFocus={clearLinkedUniversity}
          />
        </div>}
        {(loggedInAdmin || (loggedInTeacher && teacherHasGradeAccess)) && keepTabMounted("consultation") && <div style={{ display: tab === "consultation" ? "block" : "none" }}>
          {lookupSid ? <MemoStudentConsultationView
            sid={lookupSid}
            gdb={gdb}
            studentInfo={roster?.[lookupSid]}
            favorites={favoriteItemsFor(lookupSid)}
            onToggleFavorite={item => toggleFavorite(lookupSid,item)}
            onOpenAdmission={name => openAdmissionUniversity(name, true)}
            onOpenCases={(name,department,admissionType) => openCaseUniversity(name, true, department, admissionType)}
            onOpenSusiNavi={(name,department) => openSusiNaviUniversity(name, true, department)}
            persistGrades={persistGrades}
            canEdit
            authorName={loggedInAdmin ? "관리자" : (loggedInTeacher?.name || loggedInTeacher?.id || "선생님")}
          /> : <EmptyBox text="상단 학생 통합 검색에서 상담할 학생을 선택하세요." />}
        </div>}
        {keepTabMounted("gradeCompare") && (loggedInAdmin || (loggedInTeacher && teacherHasGradeAccess)) && <div style={{display:tab === "gradeCompare" ? "block" : "none"}}>
          <StudentGradeComparison gdb={gdb} roster={roster} currentGrade={currentGrade} />
        </div>}
        {tab === "mockAnalysis" && (loggedInAdmin || (loggedInTeacher && teacherHasGradeAccess)) && (
          <MockAnalysisDashboard gdb={gdb} roster={roster} currentGrade={currentGrade} />
        )}
        {keepTabMounted("admissionCases") && (loggedInAdmin || (loggedInTeacher && teacherHasGradeAccess)) && <div style={{ display: tab === "admissionCases" ? "block" : "none" }}>
          <MemoAdmissionCaseAnalytics gdb={gdb} roster={roster} currentGrade={currentGrade} selectedStudentSid={lookupSid} onSelectedStudentSidChange={setLookupSid} selectedStudentQuery={lookupQuery} onSelectedStudentQueryChange={setLookupQuery} favorites={favoriteItemsFor(lookupSid)} onToggleFavorite={lookupSid ? item => toggleFavorite(lookupSid,item) : undefined} onOpenAdmission={openAdmissionUniversity} focusUniversity={linkedUniversity} focusDepartment={linkedDepartment} focusAdmissionType={linkedAdmissionType} onBackToConsultation={returnToConsultation ? returnToConsultationView : undefined} onClearFocus={clearLinkedUniversity} />
        </div>}
        {(loggedInStudent || loggedInAdmin || (loggedInTeacher && teacherHasGradeAccess)) && keepTabMounted("susiNaviBeta") && <div style={{ display: tab === "susiNaviBeta" ? "block" : "none" }}>
          <MemoSusiNaviBetaView
            key={activeStudentSid || "staff"}
            isAdmin={!!loggedInAdmin}
            selectedStudent={susiNaviStudent}
            favorites={favoriteItemsFor(activeStudentSid)}
            onToggleFavorite={activeStudentSid ? item => toggleFavorite(activeStudentSid, item) : undefined}
            onOpenCases={!loggedInStudent ? (name, department, admissionType) => openCaseUniversity(name, false, department, admissionType) : undefined}
            focusUniversity={linkedUniversity}
            focusDepartment={linkedDepartment}
            caseRows={gdb?.admissionCases || []}
          />
        </div>}
        {tab === "class" && loggedInTeacher && teacherHasGradeAccess && (
          <ClassStudentAccounts homeroomClass={loggedInTeacher.homeroomClass} accounts={accounts} roster={roster} />
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, label }) {
  return <button onClick={onClick} style={{ ...btn.tab, ...(active ? btn.tabActive : {}) }}>{label}</button>;
}

/* ============================================================
   학생: 내 성적 상담 화면 (구글시트 "성적(상담용, 등급변환)" 재현)
   ============================================================ */

function mockStudentName(sid, roster, gdb, entryYear) {
  const rosterInfo = roster?.[sid];
  if (rosterInfo?.name) return rosterInfo.name;
  for (const key of SEMESTER_KEYS.slice().reverse()) {
    const record = cohortRecord(gdb.semesterData, entryYear, key)?.students?.[sid];
    if (record?.name) return record.name;
  }
  return "";
}
function buildStudentComparisonRow(sid, studentInfo, gdb) {
  if (!sid || !gdb) return null;
  const legacySemesterRecords = SEMESTER_KEYS.map(key => gdb.semesterData?.[key]?.students?.[sid] || null);
  const legacyLatest = legacySemesterRecords.slice().reverse().find(Boolean) || null;
  const metaRecord = Array.isArray(gdb.studentAccounts)
    ? gdb.studentAccounts.find(student => String(student.id) === String(sid))
    : gdb.studentAccounts?.[sid];
  const entryYear = inferEntryYear({ studentInfo, metaRecord, sid, latestSemesterRecord: legacyLatest, cohortSettings: gdb.cohortSettings });
  const semesterRecords = SEMESTER_KEYS.map((key, index) => cohortRecord(gdb.semesterData, entryYear, key)?.students?.[sid] || legacySemesterRecords[index] || null);
  const latestRecord = semesterRecords.slice().reverse().find(Boolean) || legacyLatest;
  const gradeSystem = Number(entryYear) >= 2025 ? 5 : 9;
  const subjectLists = semesterRecords.map(record => record?.subjects || null);
  const groups = computeAllGroupAverages(subjectLists, gradeSystem);
  const lastIndex = subjectLists.reduce((found, subjects, index) => subjects?.length ? index : found, -1);
  const valueFor = group => ({
    primary: gradeSystem === 5 ? groups?.[group]?.avg5 ?? null : groups?.[group]?.avg9 ?? null,
    converted: gradeSystem === 5 ? groups?.[group]?.avg9 ?? null : null,
  });
  return {
    sid: String(sid),
    name: studentInfo?.name || latestRecord?.name || metaRecord?.name || "이름 미등록",
    classNumber: studentInfo?.class ?? latestRecord?.class ?? metaRecord?.class ?? "-",
    number: studentInfo?.number ?? latestRecord?.number ?? metaRecord?.number ?? "-",
    entryYear,
    gradeSystem,
    overall: valueFor("전과목"),
    coreAll: valueFor("국영수사과"),
    coreScience: valueFor("국영수과"),
    coreSocial: valueFor("국영수사"),
    latestKey: lastIndex >= 0 ? SEMESTER_KEYS[lastIndex] : "",
    latestPrimary: lastIndex >= 0 ? (gradeSystem === 5 ? groups?.전과목?.perSemester5?.[lastIndex] : groups?.전과목?.perSemester9?.[lastIndex]) ?? null : null,
    latestConverted: lastIndex >= 0 && gradeSystem === 5 ? groups?.전과목?.perSemester9?.[lastIndex] ?? null : null,
    trend: SEMESTER_KEYS.map((key, index) => ({ key, value: gradeSystem === 5 ? groups?.전과목?.perSemester5?.[index] ?? null : groups?.전과목?.perSemester9?.[index] ?? null })).filter(item => item.value != null),
  };
}

function StudentGradeComparison({ gdb, roster, currentGrade }) {
  const storageKey = `kd_grade_compare_${currentGrade}`;
  const [selectedSids, setSelectedSids] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || "[]"); return Array.isArray(saved) ? saved.map(String).slice(0, 8) : []; } catch { return []; }
  });
  const [query, setQuery] = useState("");
  const rosterEntries = useMemo(() => Object.entries(roster || {}).map(([sid, info]) => ({ sid: String(sid), ...info })).sort((a,b) => (Number(a.class)-Number(b.class)) || (Number(a.number)-Number(b.number)) || a.sid.localeCompare(b.sid)), [roster]);
  const rosterBySid = useMemo(() => new Map(rosterEntries.map(item => [item.sid, item])), [rosterEntries]);
  useEffect(() => {
    setSelectedSids(prev => {
      const next = prev.filter(sid => rosterBySid.has(String(sid))).slice(0, 8);
      return next.length === prev.length && next.every((sid,index)=>sid===prev[index]) ? prev : next;
    });
  }, [rosterBySid]);
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(selectedSids)); } catch { /* ignore */ } }, [storageKey, selectedSids]);
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const compact = q.replace(/\s/g, "");
    return rosterEntries.filter(item => !selectedSids.includes(item.sid) && (
      item.sid.includes(q) || String(item.name || "").toLowerCase().includes(q) || `${item.class}반${item.number}번`.includes(compact)
    )).slice(0, 8);
  }, [query, rosterEntries, selectedSids]);
  const rows = useMemo(() => selectedSids.map(sid => buildStudentComparisonRow(sid, rosterBySid.get(sid), gdb)).filter(Boolean), [selectedSids, rosterBySid, gdb]);
  const ranked = useMemo(() => {
    const ordered = rows.filter(row => row.overall.primary != null).slice().sort((a,b)=>a.overall.primary-b.overall.primary);
    return new Map(ordered.map((row,index)=>[row.sid,index+1]));
  }, [rows]);
  const addStudent = sid => {
    const value = String(sid || "").trim();
    if (!rosterBySid.has(value) || selectedSids.includes(value)) return;
    setSelectedSids(prev => [...prev, value].slice(0, 8));
    setQuery("");
  };
  const gradeBox = value => {
    if (!value) return <span style={{color:"#a0a9b6"}}>-</span>;
    return <div style={{display:"grid",gap:2,justifyItems:"center"}}><b style={{fontSize:13,color:"#284f7d"}}>{value.primary ?? "-"}</b>{value.converted != null && <small style={{fontSize:9.2,color:"#7a6a91",fontWeight:850}}>9환산 {value.converted}</small>}</div>;
  };
  return <div style={{display:"grid",gap:14}}>
    <section style={{...card,padding:0,overflow:"visible",border:"1px solid #d7e2ee"}}>
      <div style={{padding:"18px 20px",borderRadius:"12px 12px 0 0",background:"linear-gradient(135deg,#315f95,#667bb0)",color:"#fff",display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",flexWrap:"wrap"}}>
        <div><div style={{display:"flex",alignItems:"center",gap:8,fontWeight:950,fontSize:19}}><UsersRound size={20}/>학생 성적 비교</div><div style={{marginTop:4,fontSize:11.5,color:"#e9f0f8"}}>최대 8명의 누적 내신과 교과 조합, 학기별 추이를 한 화면에서 비교합니다.</div></div>
        <span style={{padding:"7px 10px",borderRadius:999,background:"rgba(255,255,255,.16)",fontSize:11,fontWeight:900}}>선택 {rows.length}명 / 8명</span>
      </div>
      <div style={{padding:16,display:"grid",gap:10}}>
        <div style={{position:"relative",maxWidth:520}}>
          <div style={{display:"flex",alignItems:"center",gap:8,border:"1px solid #cad8e8",borderRadius:11,padding:"0 11px",height:42,background:"#fff",boxShadow:"0 2px 8px rgba(43,70,104,.05)"}}><Search size={15} color="#71849a"/><input value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&/^\d{5}$/.test(query.trim()))addStudent(query.trim())}} placeholder="학번 또는 이름으로 비교 학생 추가" style={{border:0,outline:0,width:"100%",fontSize:12.5,fontWeight:750,color:"#243c59",background:"transparent"}}/>{query&&<button type="button" onClick={()=>setQuery("")} style={{border:0,background:"transparent",cursor:"pointer",color:"#8a98a8",padding:3}}><X size={14}/></button>}</div>
          {suggestions.length>0&&<div style={{position:"absolute",zIndex:20,top:46,left:0,right:0,border:"1px solid #d3deea",borderRadius:11,background:"#fff",boxShadow:"0 12px 28px rgba(42,61,83,.16)",overflow:"hidden"}}>{suggestions.map(item=><button key={item.sid} type="button" onClick={()=>addStudent(item.sid)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"9px 11px",border:0,borderBottom:"1px solid #eef2f6",background:"#fff",cursor:"pointer",textAlign:"left"}}><span><b style={{fontSize:12,color:"#213b59"}}>{item.name}</b><small style={{marginLeft:7,color:"#8793a1"}}>{item.sid}</small></span><span style={{fontSize:10.5,color:"#66798e",fontWeight:800}}>{item.class}반 {item.number}번</span></button>)}</div>}
        </div>
        {selectedSids.length>0&&<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{selectedSids.map(sid=>{const info=rosterBySid.get(sid);return <span key={sid} style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 8px",border:"1px solid #cedbea",borderRadius:999,background:"#f6f9fd",color:"#385977",fontSize:10.5,fontWeight:850}}><b>{info?.name||sid}</b><small>{sid}</small><button type="button" onClick={()=>setSelectedSids(prev=>prev.filter(value=>value!==sid))} style={{display:"grid",placeItems:"center",width:17,height:17,padding:0,border:0,borderRadius:99,background:"#e4ebf3",color:"#6d7f91",cursor:"pointer"}}><X size={10}/></button></span>})}<button type="button" onClick={()=>setSelectedSids([])} style={{border:"1px solid #e5c9c6",borderRadius:999,padding:"6px 9px",background:"#fff7f6",color:"#a14f47",fontSize:10.5,fontWeight:900,cursor:"pointer"}}>전체 해제</button></div>}
      </div>
    </section>
    {rows.length===0 ? <EmptyBox text="비교할 학생을 2명 이상 검색해 추가하세요. 한 명부터도 미리 볼 수 있습니다."/> : <section style={{...card,padding:0,overflow:"hidden",borderTop:"4px solid #315f95"}}>
      <div style={{padding:"13px 15px",display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",borderBottom:"1px solid #e3e8ee",background:"#f8fafc"}}><div><b style={{fontSize:13.5,color:"#263f5d"}}>누적 내신 비교</b><div style={{fontSize:10.5,color:"#7b8796",marginTop:3}}>5등급제 학생은 원등급과 기존 9등급 환산을 함께 표시합니다. 숫자가 낮을수록 상위입니다.</div></div><span style={{fontSize:10.5,fontWeight:900,color:"#526a83"}}>{currentGrade}학년 · {rows.length}명</span></div>
      <div style={{overflowX:"auto"}}><table style={{...table.base,minWidth:930,tableLayout:"fixed"}}><colgroup><col style={{width:150}}/><col style={{width:108}}/><col style={{width:118}}/><col style={{width:118}}/><col style={{width:118}}/><col style={{width:126}}/><col/></colgroup><thead><tr><th style={table.th}>학생</th><th style={table.th}>전과목 누적</th><th style={table.th}>국·영·수·사·과</th><th style={table.th}>국·영·수·과</th><th style={table.th}>국·영·수·사</th><th style={table.th}>최근 학기</th><th style={table.th}>학기별 전과목 평균</th></tr></thead><tbody>{rows.map(row=>{const rank=ranked.get(row.sid);return <tr key={row.sid}><td style={{...table.td,textAlign:"left"}}><div style={{display:"flex",alignItems:"center",gap:7}}>{rank&&<span style={{display:"grid",placeItems:"center",width:25,height:25,borderRadius:8,background:rank===1?"#315f95":"#eef3f9",color:rank===1?"#fff":"#4f6780",fontSize:9.5,fontWeight:950}}>{rank}</span>}<div><b style={{display:"block",fontSize:12.5,color:"#253b55"}}>{row.name}</b><small style={{display:"block",marginTop:2,fontSize:9.5,color:"#7d8996"}}>{row.sid} · {row.classNumber}반 {row.number}번</small></div></div></td><td style={table.td}>{gradeBox(row.overall)}</td><td style={table.td}>{gradeBox(row.coreAll)}</td><td style={table.td}>{gradeBox(row.coreScience)}</td><td style={table.td}>{gradeBox(row.coreSocial)}</td><td style={table.td}><div style={{display:"grid",gap:2,justifyItems:"center"}}><small style={{fontSize:9,color:"#7b8997",fontWeight:850}}>{row.latestKey?SEMESTER_LABELS[row.latestKey]:"자료 없음"}</small><b style={{fontSize:12.5,color:"#354f6e"}}>{row.latestPrimary??"-"}</b>{row.latestConverted!=null&&<small style={{fontSize:9,color:"#7a6a91"}}>9환산 {row.latestConverted}</small>}</div></td><td style={{...table.td,textAlign:"left"}}><div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{row.trend.length?row.trend.map(item=><span key={item.key} style={{display:"inline-flex",alignItems:"center",gap:3,padding:"4px 6px",borderRadius:7,background:"#f1f5f9",color:"#526980",fontSize:9.5,fontWeight:850}}><small style={{fontSize:8.5,color:"#8995a3"}}>{item.key}</small>{item.value}</span>):<span style={{color:"#a0a9b6"}}>-</span>}</div></td></tr>})}</tbody></table></div>
    </section>}
  </div>;
}

function MockAnalysisDashboard({ gdb, roster, currentGrade }) {
  const entryYear = entryYearForGrade(gdb.cohortSettings, currentGrade);
  // 현재 학년까지의 누적 회차를 모두 보여줍니다. 예: 2학년은 1학년 3·6·9·10월도 함께 조회.
  const available = MOCK_MONTH_KEYS.filter(key => (
    Number(key.split("-")[0]) <= Number(currentGrade)
    && cohortRecord(gdb.mockData, entryYear, key)?.students
  ));
  const [mockKey, setMockKey] = useState(available[available.length - 1] || "");
  const [analysisView, setAnalysisView] = useState("students");
  const [classFilter, setClassFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("전체");
  const [subjectView, setSubjectView] = useState(MOCK_SUBJECTS[0]);
  const [gradeFilter, setGradeFilter] = useState("all");
  const [classMetric, setClassMetric] = useState("총점");
  const [showCutoffs, setShowCutoffs] = useState(false);

  useEffect(() => {
    if (available.length && !available.includes(mockKey)) setMockKey(available[available.length - 1]);
  }, [available.join("|"), mockKey]); // eslint-disable-line

  const studentsMap = mockKey ? cohortRecord(gdb.mockData, entryYear, mockKey)?.students || {} : {};
  const rows = useMemo(() => Object.entries(studentsMap).map(([sid, result]) => {
    const scores = result?._scores || {};
    const gradeValues = MOCK_SUBJECTS.map(subject => Number(result?.[subject])).filter(Number.isFinite);
    const scoreValues = MOCK_SUBJECTS.map(subject => {
      const raw = scores?.[subject];
      return raw === "" || raw == null ? null : Number(raw);
    });
    // 원점수가 모두 0 또는 비어 있고, 입력된 등급이 모두 9등급이면 결시자로 분리합니다.
    // 결시자는 평균·등수·등급별 인원 계산에서 제외하되 반별 결시 인원에는 포함합니다.
    const allScoresMissingOrZero = scoreValues.every(value => value == null || value === 0);
    const allGradesNine = gradeValues.length > 0 && gradeValues.every(value => value === 9);
    const isAbsent = allScoresMissingOrZero && allGradesNine;
    const computedTotal = Number.isFinite(Number(result?._total))
      ? Number(result._total)
      : (Object.keys(scores).length
        ? Object.values(scores).reduce((sum, value) => sum + Number(value || 0), 0)
        : null);
    const info = roster?.[sid] || {};
    return {
      sid,
      name: mockStudentName(sid, roster, gdb, entryYear),
      classNumber: info.class || Number(String(sid).slice(1, 3)) || "",
      number: info.number || Number(String(sid).slice(3, 5)) || "",
      grades: result || {},
      scores,
      isAbsent,
      total: isAbsent ? null : computedTotal,
    };
  }).sort((a, b) => (b.total ?? -1) - (a.total ?? -1) || a.sid.localeCompare(b.sid)), [studentsMap, roster, gdb.semesterData, entryYear]);

  let previousTotal = null;
  let previousRank = 0;
  rows.forEach((row, index) => {
    if (row.total == null) { row.rank = null; return; }
    if (previousTotal == null || row.total !== previousTotal) previousRank = index + 1;
    row.rank = previousRank;
    previousTotal = row.total;
  });

  const classes = Array.from(new Set(rows.map(row => String(row.classNumber)).filter(Boolean))).sort((a, b) => Number(a) - Number(b));
  const classScopedRows = classFilter === "all" ? rows : rows.filter(row => String(row.classNumber) === classFilter);
  const classScopedPresentRows = classScopedRows.filter(row => !row.isAbsent);
  const filtered = classScopedRows.filter(row => {
    if (gradeFilter === "all") return true;
    const targetGrade = Number(gradeFilter);
    if (subjectFilter === "전체") {
      return MOCK_SUBJECTS.some(subject => Number(row.grades?.[subject]) === targetGrade);
    }
    return Number(row.grades?.[subjectFilter]) === targetGrade;
  });

  const gradeCounts = Object.fromEntries(MOCK_SUBJECTS.map(subject => [
    subject,
    Array.from({ length: 9 }, (_, index) => classScopedPresentRows.filter(row => Number(row.grades?.[subject]) === index + 1).length),
  ]));
  const cutRows = MOCK_SUBJECTS.map(subject => ({
    subject,
    cuts: Array.from({ length: 9 }, (_, index) => {
      const scores = classScopedPresentRows
        .filter(row => Number(row.grades?.[subject]) === index + 1)
        .map(row => Number(row.scores?.[subject]))
        .filter(Number.isFinite);
      return scores.length ? Math.min(...scores) : null;
    }),
  }));
  const avgFor = (sourceRows, subject) => {
    const values = sourceRows.map(row => Number(row.scores?.[subject])).filter(Number.isFinite);
    return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10 : null;
  };
  const totalAverage = sourceRows => {
    const values = sourceRows.map(row => row.total).filter(value => value != null);
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null;
  };

  const classSummaries = classes.map(classNumber => {
    const classRows = rows.filter(row => String(row.classNumber) === String(classNumber));
    const presentRows = classRows.filter(row => !row.isAbsent);
    const absentRows = classRows.filter(row => row.isAbsent);
    return {
      classNumber,
      count: classRows.length,
      presentCount: presentRows.length,
      absentCount: absentRows.length,
      total: totalAverage(presentRows),
      subjects: Object.fromEntries(MOCK_SUBJECTS.map(subject => [subject, avgFor(presentRows, subject)])),
    };
  });
  const classMetricValue = summary => classMetric === "총점" ? summary.total : summary.subjects[classMetric];
  const classMetricMax = Math.max(1, ...classSummaries.map(summary => Number(classMetricValue(summary) || 0)));

  if (!available.length) return <EmptyBox text={`${currentGrade}학년 학생의 누적 모의고사 데이터가 없습니다. 관리자가 해당 입학연도의 모의고사 파일을 업로드하면 분석할 수 있습니다.`} />;

  const presentRows = rows.filter(row => !row.isAbsent);
  const absentRows = rows.filter(row => row.isAbsent);
  const filteredPresentRows = filtered.filter(row => !row.isAbsent);
  const summaryItems = [
    { icon: <UsersRound size={18} />, value: `${presentRows.length}명`, label: "응시 인원", tone: "#315a9b", bg: "#eef3ff" },
    { icon: <CircleAlert size={18} />, value: `${absentRows.length}명`, label: "결시 인원", tone: "#9a493c", bg: "#fff0ed" },
    { icon: <TrendingUp size={18} />, value: totalAverage(filteredPresentRows) ?? "-", label: "조회 학생 평균 총점", tone: "#76551b", bg: "#fff6e6" },
    { icon: <GraduationCap size={18} />, value: presentRows.find(row => row.total != null)?.total ?? "-", label: "최고 총점", tone: "#6c4f8c", bg: "#f4effa" },
  ];

  // 1·2등급만 강조되던 기존 표시를 1~9등급 전체가 식별되도록 확장합니다.
  const gradePalette = {
    1: { background: "#def4e5", color: "#176338", border: "#afd8bd" },
    2: { background: "#e5efff", color: "#285998", border: "#bdd0ef" },
    3: { background: "#e5f5f5", color: "#286b72", border: "#bbdcde" },
    4: { background: "#fff3d9", color: "#815c17", border: "#ead39b" },
    5: { background: "#ffeddf", color: "#8d5423", border: "#ecc9aa" },
    6: { background: "#fde9e4", color: "#994b3c", border: "#edc1b8" },
    7: { background: "#f8e7ed", color: "#8d4960", border: "#e2bbc8" },
    8: { background: "#eee9f7", color: "#63507f", border: "#cec2df" },
    9: { background: "#eceff2", color: "#4f5964", border: "#cbd1d7" },
  };
  const gradeCellStyle = grade => {
    const palette = gradePalette[Number(grade)] || gradePalette[9];
    return { background: palette.background, color: palette.color, fontWeight: 900 };
  };
  const subjectGradeBadge = grade => {
    const palette = gradePalette[Number(grade)] || gradePalette[9];
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: 38,
      padding: "2px 7px",
      borderRadius: 999,
      background: palette.background,
      color: palette.color,
      border: `1px solid ${palette.border}`,
      fontWeight: 900,
      fontSize: 9.8,
      lineHeight: 1.25,
      whiteSpace: "nowrap",
    };
  };

  const selectedSubjectRows = classScopedRows
    .filter(row => gradeFilter === "all" || Number(row.grades?.[subjectView]) === Number(gradeFilter))
    .map(row => ({ ...row, subjectScore: row.isAbsent ? null : Number(row.scores?.[subjectView]) }))
    .sort((a, b) => {
      const aScore = Number.isFinite(a.subjectScore) ? a.subjectScore : -Infinity;
      const bScore = Number.isFinite(b.subjectScore) ? b.subjectScore : -Infinity;
      return bScore - aScore || (b.total ?? -1) - (a.total ?? -1) || a.sid.localeCompare(b.sid);
    });
  let previousSubjectScore = null;
  let previousSubjectRank = 0;
  selectedSubjectRows.forEach((row, index) => {
    if (!Number.isFinite(row.subjectScore)) { row.subjectRank = null; return; }
    if (previousSubjectScore == null || row.subjectScore !== previousSubjectScore) previousSubjectRank = index + 1;
    row.subjectRank = previousSubjectRank;
    previousSubjectScore = row.subjectScore;
  });
  const selectedSubjectPresentRows = classScopedPresentRows.filter(row => Number.isFinite(Number(row.scores?.[subjectView])));
  const selectedSubjectAverage = avgFor(selectedSubjectPresentRows, subjectView);
  const selectedSubjectGradeCounts = gradeCounts[subjectView] || Array(9).fill(0);
  const selectedSubjectCutoffs = cutRows.find(row => row.subject === subjectView)?.cuts || Array(9).fill(null);
  const selectedSubjectBest = selectedSubjectRows.find(row => Number.isFinite(row.subjectScore));

  const viewTabs = [
    { key: "students", label: "학생별 성적", desc: "총점 순위와 학생별 전 과목 성적" },
    { key: "subjects", label: "과목별 성적", desc: "한 과목의 원점수·등급·순위를 집중 조회" },
    { key: "classes", label: "반별 성적 평균", desc: "전체 반의 평균과 응시·결시 현황 비교" },
  ];

  return (
    <div>
      <div style={{ ...card, marginTop: 0, padding: 18, background: "linear-gradient(135deg,#58739a 0%,#6f8fb5 52%,#9485b0 100%)", color: "#fff", overflow: "hidden" }}>
        <div>
          <div style={{ fontWeight: 950, fontSize: 19 }}>모의고사 성적 분석</div>
          <div style={{ fontSize: 11.5, color: "#e8edf6", marginTop: 4 }}>{entryYear}년 입학생 · 1학년부터 {currentGrade}학년까지 누적 회차 분석</div>
        </div>
        <div style={{ marginTop: 14, padding: 8, borderRadius: 12, background: "rgba(255,255,255,.13)", border: "1px solid rgba(255,255,255,.15)", display: "flex", gap: 7, flexWrap: "wrap" }}>
          {available.map(key => (
            <button key={key} style={{ ...btn.chip, minHeight: 32, background: mockKey === key ? "#ffd978" : "rgba(255,255,255,.13)", color: mockKey === key ? "#2e3445" : "#f7f8fc", borderColor: mockKey === key ? "#ffe7a5" : "rgba(255,255,255,.34)", boxShadow: mockKey === key ? "0 3px 10px rgba(0,0,0,.18)" : "none", fontWeight: 900 }} onClick={() => setMockKey(key)}>
              {MOCK_MONTH_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...card, padding: 8, marginTop: 12, display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 7, background: "#f6f8fb", border: "1px solid #dbe3ed" }}>
        {viewTabs.map(item => {
          const active = analysisView === item.key;
          return <button key={item.key} type="button" onClick={() => setAnalysisView(item.key)} style={{ border: `1px solid ${active ? "#5279a7" : "#d9e0e8"}`, borderRadius: 10, padding: "10px 12px", background: active ? "#fff" : "transparent", boxShadow: active ? "0 3px 10px rgba(48,78,112,.10)" : "none", cursor: "pointer", textAlign: "left", minWidth: 0 }}><b style={{ display: "block", fontSize: 12.5, color: active ? "#284f7d" : "#4d5d6f" }}>{item.label}</b><small style={{ display: "block", marginTop: 3, fontSize: 9.8, color: "#7f8b98", whiteSpace: "normal", lineHeight: 1.3 }}>{item.desc}</small></button>;
        })}
      </div>

      {analysisView !== "classes" && <div style={{ ...card, padding: 12, marginTop: 12, borderLeft: "4px solid #496d9b" }}>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 10, fontWeight: 950, color: "#5f594d", marginRight: 2 }}>조회 조건</div>
          <select value={classFilter} onChange={event => setClassFilter(event.target.value)} style={{ ...btn.input, width: 132 }}><option value="all">전체 반</option>{classes.map(value => <option key={value} value={value}>{value}반</option>)}</select>
          {analysisView === "students" ? <select value={subjectFilter} onChange={event => setSubjectFilter(event.target.value)} style={{ ...btn.input, width: 132 }}><option>전체</option>{MOCK_SUBJECTS.map(subject => <option key={subject}>{subject}</option>)}</select> : <select value={subjectView} onChange={event => setSubjectView(event.target.value)} style={{ ...btn.input, width: 132 }}>{MOCK_SUBJECTS.map(subject => <option key={subject}>{subject}</option>)}</select>}
          <select value={gradeFilter} onChange={event => setGradeFilter(event.target.value)} style={{ ...btn.input, width: 132 }}><option value="all">전체 등급</option>{Array.from({ length: 9 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}등급</option>)}</select>
          <span style={{ marginLeft: "auto", borderRadius: 999, background: "#eef3fb", color: "#365d8a", border: "1px solid #cbd9ec", padding: "5px 9px", fontSize: 10.5, fontWeight: 900 }}>{analysisView === "students" ? (subjectFilter === "전체" && gradeFilter !== "all" ? `전 과목 중 ${gradeFilter}등급 보유 · ${filtered.length}명` : `${filtered.length}명 조회`) : `${subjectView} · ${selectedSubjectRows.length}명 조회`}</span>
        </div>
      </div>}

      {analysisView === "students" && <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 12, marginBottom: 16 }}>
          {summaryItems.map(item => (
            <div key={item.label} style={{ background: item.bg, border: `1px solid ${item.tone}22`, borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <span style={{ width: 36, height: 36, borderRadius: 11, display: "grid", placeItems: "center", color: item.tone, background: "rgba(255,255,255,.72)", flex: "0 0 auto" }}>{item.icon}</span>
              <div style={{ minWidth: 0 }}><div style={{ fontWeight: 950, fontSize: 18, color: item.tone, lineHeight: 1.1 }}>{item.value}</div><div style={{ color: "#746d61", fontSize: 11.5, marginTop: 4, whiteSpace: "normal" }}>{item.label}</div></div>
            </div>
          ))}
        </div>

        <div style={{ ...card, borderTop: "4px solid #2b2620", marginTop: 0 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}><div><div style={{ fontWeight: 950 }}>학생별 총점 순위</div><div style={{ fontSize: 11, color: "#8a8578", marginTop: 3 }}>과목별 1~9등급을 모두 색상 배지로 구분했습니다. 숫자와 배지를 함께 보아 등급을 빠르게 확인할 수 있습니다.</div></div><span style={{ fontSize: 11, fontWeight: 850, color: "#746d61" }}>{filtered.length}명</span></div><div style={{ maxHeight: 620, overflow: "auto" }}><table style={{ ...table.base, minWidth: 880, tableLayout: "fixed" }}><colgroup><col style={{ width: 58 }} /><col style={{ width: 72 }} /><col style={{ width: 105 }} /><col style={{ width: 72 }} /><col style={{ width: 66 }} />{MOCK_SUBJECTS.map(subject => <col key={subject} style={{ width: 72 }} />)}</colgroup><thead><tr><th style={table.th}>등수</th><th style={table.th}>학번</th><th style={table.th}>이름</th><th style={table.th}>반</th><th style={table.th}>총점</th>{MOCK_SUBJECTS.map(subject => <th key={subject} style={table.th}>{subject}</th>)}</tr></thead><tbody>{filtered.map(row => {
          const isTop24 = row.rank != null && row.rank <= 24;
          return <tr key={row.sid} style={{ background: isTop24 ? "#fffdf5" : "#fff" }}><td style={{ ...table.td, fontWeight: 900 }}><span style={isTop24 ? { display: "inline-grid", placeItems: "center", minWidth: 31, height: 25, padding: "0 5px", borderRadius: 7, background: "#171714", color: "#f2d56b", boxShadow: "0 0 0 2px #f3e6a5" } : {}}>{row.rank ?? "-"}</span></td><td style={table.td}>{row.sid}</td><td style={{ ...table.td, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.name}>{row.name}</td><td style={table.td}>{row.classNumber ? `${row.classNumber}반` : "-"}</td><td style={{ ...table.td, fontWeight: 950, color: isTop24 ? "#6d5311" : "#2b2620" }}>{row.isAbsent ? "결시" : (row.total ?? "-")}</td>{MOCK_SUBJECTS.map(subject => {
            const grade = Number(row.grades?.[subject]);
            return <td key={subject} style={table.td}><div style={{ fontWeight: 800, color: "#2e3742" }}>{row.scores?.[subject] ?? "-"}</div>{grade ? <small style={{ marginTop: 3, ...subjectGradeBadge(grade) }}>{grade}등급</small> : null}</td>;
          })}</tr>;
        })}</tbody></table></div></div>
      </>}

      {analysisView === "subjects" && <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, marginTop: 12, marginBottom: 14 }}>
          <div style={{ ...card, padding: "13px 14px", borderTop: "3px solid #315a9b" }}><small style={{ color: "#788596", fontWeight: 800 }}>선택 과목</small><b style={{ display: "block", marginTop: 4, fontSize: 17, color: "#284f7d" }}>{subjectView}</b></div>
          <div style={{ ...card, padding: "13px 14px", borderTop: "3px solid #2f7770" }}><small style={{ color: "#788596", fontWeight: 800 }}>평균 원점수</small><b style={{ display: "block", marginTop: 4, fontSize: 17, color: "#2f6e69" }}>{selectedSubjectAverage ?? "-"}</b></div>
          <div style={{ ...card, padding: "13px 14px", borderTop: "3px solid #6c4f8c" }}><small style={{ color: "#788596", fontWeight: 800 }}>최고 원점수</small><b style={{ display: "block", marginTop: 4, fontSize: 17, color: "#664b83" }}>{selectedSubjectBest?.subjectScore ?? "-"}</b></div>
          <div style={{ ...card, padding: "13px 14px", borderTop: "3px solid #76551b" }}><small style={{ color: "#788596", fontWeight: 800 }}>1·2등급 인원</small><b style={{ display: "block", marginTop: 4, fontSize: 17, color: "#76551b" }}>{(selectedSubjectGradeCounts[0] || 0) + (selectedSubjectGradeCounts[1] || 0)}명</b></div>
        </div>

        <div style={{ ...card, borderTop: "4px solid #5969a5", marginTop: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 11, flexWrap: "wrap" }}><div><div style={{ fontWeight: 950 }}>{subjectView} 등급 분포</div><div style={{ fontSize: 11, color: "#8a8578", marginTop: 3 }}>모든 등급을 같은 크기의 색상 배지로 표시해 3~9등급도 빠르게 구분할 수 있습니다.</div></div><span style={{fontSize:10.5,fontWeight:900,color:"#647184"}}>평균 {selectedSubjectAverage ?? "-"}점</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(9,minmax(62px,1fr))", gap: 6, overflowX: "auto", paddingBottom: 2 }}>{selectedSubjectGradeCounts.map((count,index)=><div key={index} style={{...gradeCellStyle(index+1),border:`1px solid ${gradePalette[index+1].border}`,borderRadius:9,padding:"8px 5px",textAlign:"center",minWidth:62}}><b style={{display:"block",fontSize:11}}>{index+1}등급</b><strong style={{display:"block",fontSize:16,marginTop:4}}>{count}</strong><small style={{display:"block",fontSize:8.8,marginTop:2}}>명</small></div>)}</div>
        </div>

        <div style={{ ...card, borderTop: "4px solid #2b2620", marginTop: 14 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}><div><div style={{ fontWeight: 950 }}>{subjectView} 학생별 성적</div><div style={{ fontSize: 11, color: "#8a8578", marginTop: 3 }}>원점수 기준으로 정렬하며 동점자는 같은 과목 순위를 부여합니다. 전체 총점 순위도 함께 확인할 수 있습니다.</div></div><span style={{ fontSize: 11, fontWeight: 850, color: "#746d61" }}>{selectedSubjectRows.length}명</span></div>
          <div style={{ maxHeight: 560, overflow: "auto" }}><table style={{ ...table.base, minWidth: 720, tableLayout: "fixed" }}><colgroup><col style={{width:78}}/><col style={{width:82}}/><col style={{width:120}}/><col style={{width:72}}/><col style={{width:96}}/><col style={{width:88}}/><col style={{width:86}}/><col/></colgroup><thead><tr><th style={table.th}>과목 순위</th><th style={table.th}>학번</th><th style={table.th}>이름</th><th style={table.th}>반</th><th style={table.th}>원점수</th><th style={table.th}>등급</th><th style={table.th}>총점</th><th style={table.th}>전체 순위</th></tr></thead><tbody>{selectedSubjectRows.map(row=>{const grade=Number(row.grades?.[subjectView]);return <tr key={row.sid}><td style={{...table.td,fontWeight:950,color:"#34597f"}}>{row.subjectRank??"-"}</td><td style={table.td}>{row.sid}</td><td style={{...table.td,fontWeight:850,textAlign:"left",paddingLeft:15}}>{row.name}</td><td style={table.td}>{row.classNumber?`${row.classNumber}반`:"-"}</td><td style={{...table.td,fontWeight:950,fontSize:13}}>{Number.isFinite(row.subjectScore)?row.subjectScore:"-"}</td><td style={table.td}>{grade?<span style={subjectGradeBadge(grade)}>{grade}등급</span>:"-"}</td><td style={{...table.td,fontWeight:850}}>{row.total??"-"}</td><td style={table.td}>{row.rank??"-"}</td></tr>})}</tbody></table></div>
        </div>

        <div style={{ ...card, borderTop: "4px solid #8a641d", padding: 0, overflow: "hidden", marginTop: 14 }}>
          <button type="button" onClick={() => setShowCutoffs(value => !value)} style={{ width: "100%", border: 0, background: "#fffaf0", padding: "13px 15px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer", color: "#4f493f", textAlign: "left" }}>
            <span><b style={{ display: "block", fontSize: 13 }}>{subjectView} 등급컷 상세</b><small style={{ display: "block", marginTop: 3, color: "#8a8578", fontSize: 10.5 }}>현재 조회 범위에서 각 등급의 최저 원점수를 표시합니다.</small></span>
            <span style={{ borderRadius: 999, background: showCutoffs ? "#8a641d" : "#fff", color: showCutoffs ? "#fff" : "#76551b", border: "1px solid #d9c38d", padding: "5px 9px", fontSize: 10, fontWeight: 900 }}>{showCutoffs ? "접기" : "펼치기"}</span>
          </button>
          {showCutoffs && <div style={{padding:14,borderTop:"1px solid #eadfca",display:"grid",gridTemplateColumns:"repeat(9,minmax(62px,1fr))",gap:6,overflowX:"auto"}}>{selectedSubjectCutoffs.map((value,index)=><div key={index} style={{...gradeCellStyle(index+1),border:`1px solid ${gradePalette[index+1].border}`,borderRadius:8,padding:"8px 5px",textAlign:"center",minWidth:62}}><b style={{display:"block",fontSize:10.5}}>{index+1}등급</b><strong style={{display:"block",fontSize:14,marginTop:3}}>{value??"-"}</strong></div>)}</div>}
        </div>
      </>}

      {analysisView === "classes" && <>
        <div style={{ ...card, padding: 12, marginTop: 12, borderLeft: "4px solid #4a7297", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div><b style={{fontSize:12.5,color:"#344e6b"}}>반별 평균 비교 기준</b><div style={{fontSize:10.5,color:"#7f8995",marginTop:3}}>개별 반 조회 필터와 분리하여 전체 반을 항상 같은 기준으로 비교합니다.</div></div>
          <select value={classMetric} onChange={event => setClassMetric(event.target.value)} style={{ ...btn.input, width: 148 }}><option>총점</option>{MOCK_SUBJECTS.map(subject => <option key={subject}>{subject}</option>)}</select>
        </div>

        <div style={{ ...card, borderTop: "4px solid #4a7297", overflow: "hidden", marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 11 }}>
            <div><div style={{ fontWeight: 950 }}>반별 성적 평균</div><div style={{ fontSize: 11, color: "#8a8578", marginTop: 3 }}>결시자는 평균에서 제외하며, 응시·결시 인원을 함께 표시합니다.</div></div>
            <span style={{fontSize:10.5,fontWeight:900,color:"#53677f"}}>현재 기준 · {classMetric}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,.68fr) minmax(0,1.55fr)", gap: 28, alignItems: "stretch", minWidth: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 7, minWidth: 0, minHeight: 292, padding: "4px 0" }}>
              {classSummaries.map(summary => {
                const value = classMetricValue(summary);
                const width = value == null ? 0 : Math.max(3, Number(value) / classMetricMax * 100);
                return <div key={summary.classNumber} style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr) 45px", alignItems: "center", gap: 6, fontSize: 10.7 }}>
                  <strong>{summary.classNumber}반</strong>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ height: 10, background: "#eeeae1", borderRadius: 99, overflow: "hidden" }}><div style={{ width: `${width}%`, height: "100%", background: "linear-gradient(90deg,#456b94,#7aa6c7)", borderRadius: 99 }} /></div>
                    {summary.absentCount > 0 && <span style={{ display: "inline-flex", marginTop: 4, borderRadius: 999, background: "#fff0ed", color: "#9a493c", border: "1px solid #f1c9c2", padding: "2px 6px", fontSize: 9.8, fontWeight: 900 }}>결시 {summary.absentCount}</span>}
                  </div>
                  <span style={{ fontWeight: 900, textAlign: "right" }}>{value ?? "-"}</span>
                </div>;
              })}
            </div>
            <div style={{ minWidth: 0, minHeight: 292, overflow: "hidden", border: "1px solid #e4dfd4", borderRadius: 9, display: "flex", alignItems: "stretch" }}>
              <table style={{ ...table.base, width: "100%", minWidth: 0, tableLayout: "fixed", fontSize: 9.8, height: "100%" }}><colgroup><col style={{ width: 38 }} /><col style={{ width: 42 }} /><col style={{ width: 42 }} /><col style={{ width: 58 }} />{MOCK_SUBJECTS.map(subject => <col key={subject} />)}</colgroup>
                <thead><tr><th style={{ ...table.th, padding: "6px 2px" }}>반</th><th style={{ ...table.th, padding: "6px 2px" }}>응시</th><th style={{ ...table.th, padding: "6px 2px" }}>결시</th><th style={{ ...table.th, padding: "6px 2px" }}>총점</th>{MOCK_SUBJECTS.map(subject => <th key={subject} style={{ ...table.th, padding: "6px 2px", lineHeight: 1.15, wordBreak: "keep-all" }}>{subject === "통합사회" ? <>통합<br />사회</> : subject === "통합과학" ? <>통합<br />과학</> : subject}</th>)}</tr></thead>
                <tbody>{classSummaries.map(summary => <tr key={summary.classNumber}><td style={{ ...table.td, padding: "6px 2px", fontWeight: 900 }}>{summary.classNumber}반</td><td style={{ ...table.td, padding: "6px 2px" }}>{summary.presentCount}</td><td style={{ ...table.td, padding: "6px 2px", color: summary.absentCount ? "#a14c40" : "#8a8578", fontWeight: summary.absentCount ? 900 : 600 }}>{summary.absentCount}</td><td style={{ ...table.td, padding: "6px 2px", fontWeight: 900 }}>{summary.total ?? "-"}</td>{MOCK_SUBJECTS.map(subject => <td key={subject} style={{ ...table.td, padding: "6px 2px" }}>{summary.subjects[subject] ?? "-"}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </div>
        </div>

        <div style={{ ...card, borderTop: "4px solid #5969a5", marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 11 }}><div><div style={{ fontWeight: 950 }}>전체 반 과목별 평균</div><div style={{ fontSize: 11, color: "#8a8578", marginTop: 3 }}>각 반의 과목별 평균을 한 표에서 비교합니다.</div></div></div>
          <div style={{ overflowX: "auto" }}><table style={{ ...table.base, minWidth: 760, tableLayout: "fixed" }}><thead><tr><th style={table.th}>반</th><th style={table.th}>총점</th>{MOCK_SUBJECTS.map(subject=><th key={subject} style={table.th}>{subject}</th>)}</tr></thead><tbody>{classSummaries.map(summary=><tr key={summary.classNumber}><td style={{...table.td,fontWeight:950}}>{summary.classNumber}반</td><td style={{...table.td,fontWeight:900}}>{summary.total??"-"}</td>{MOCK_SUBJECTS.map(subject=><td key={subject} style={table.td}>{summary.subjects[subject]??"-"}</td>)}</tr>)}</tbody></table></div>
        </div>
      </>}
    </div>
  );
}

const analysisCard = { background: "#fff", border: "1px solid #e2ded3", borderRadius: 12, padding: 14, display: "flex", alignItems: "center", gap: 10, color: "#3d5c3a" };


function printStudentGradeReport(options = {}) {
  if (typeof document === "undefined") return;
  const source = document.querySelector(".student-grade-print-sheet");
  if (!source) return;
  const className = "print-student-grade-report";
  const paper = String(options.paper || "A4").toUpperCase() === "B4" ? "B4" : "A4";
  const clone = source.cloneNode(true);
  clone.classList.add("student-grade-print-sheet-clone");
  clone.removeAttribute("aria-hidden");
  const normalized = {
    category: options.category !== false,
    trend: options.trend !== false,
    mockChart: options.mockChart !== false,
    mock: options.mock !== false,
  };
  clone.dataset.printCategory = String(normalized.category);
  clone.dataset.printTrend = String(normalized.trend);
  clone.dataset.printMockChart = String(normalized.mockChart);
  clone.dataset.printMock = String(normalized.mock);
  clone.dataset.paper = paper;
  clone.dataset.lowerCount = String([normalized.category, normalized.trend, normalized.mockChart, normalized.mock].filter(Boolean).length);
  const mockRows = clone.querySelectorAll(".mock-table tbody tr").length || 1;
  clone.style.setProperty("--mock-row-count", String(mockRows));
  document.body.appendChild(clone);
  document.body.classList.add(className);
  document.body.classList.toggle("print-grade-paper-b4", paper === "B4");
  let pageStyle = document.getElementById("student-grade-dynamic-page");
  if (!pageStyle) { pageStyle = document.createElement("style"); pageStyle.id = "student-grade-dynamic-page"; document.body.appendChild(pageStyle); }
  pageStyle.textContent = `@page{size:${paper} landscape;margin:${paper === "B4" ? "5mm" : "3.5mm"}}`;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove(className, "print-grade-paper-b4");
    pageStyle?.remove();
    clone.remove();
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(() => window.print(), 80);
  window.setTimeout(cleanup, 5000);
}

const STUDENT_GRADE_PRINT_CSS = `
.student-grade-print-sheet,.student-grade-print-sheet-clone{display:none}
.grade-print-option-overlay{position:fixed;inset:0;z-index:1400;display:grid;place-items:center;padding:20px;background:rgba(25,35,48,.42);backdrop-filter:blur(3px)}
.grade-print-option-modal{width:min(520px,100%);border:1px solid #d5dfea;border-radius:17px;background:#fff;box-shadow:0 22px 60px rgba(25,39,58,.22);overflow:hidden;font-family:"Pretendard","Noto Sans KR","Malgun Gothic",sans-serif}
.grade-print-option-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:17px 18px 13px;border-bottom:1px solid #e2e8ef}.grade-print-option-head b{display:block;font-size:15px;color:#263d59}.grade-print-option-head span{display:block;margin-top:4px;color:#748398;font-size:10.5px;line-height:1.45}.grade-print-option-head button{display:grid;place-items:center;width:31px;height:31px;border:1px solid #d6e0ea;border-radius:9px;background:#fff;color:#61748a;cursor:pointer}
.grade-print-option-body{display:grid;gap:9px;padding:14px 18px;max-height:min(68vh,610px);overflow:auto}.grade-print-option-body label{display:grid;grid-template-columns:auto minmax(0,1fr);gap:9px;align-items:start;padding:10px 11px;border:1px solid #dce4ec;border-radius:11px;background:#fafbfd;cursor:pointer}.grade-print-option-body label input{margin-top:2px}.grade-print-option-body label b{display:block;font-size:11.5px;color:#344d69}.grade-print-option-body label span{display:block;margin-top:3px;font-size:9.8px;line-height:1.45;color:#7b8999}.grade-print-conversion-box{display:grid;gap:10px;padding:12px;border:1px solid #d5dfec;border-radius:12px;background:linear-gradient(135deg,#f6f9fd,#fbf8ff)}
.grade-print-conversion-box>div:first-child>b{display:block;font-size:12px;color:#294462}.grade-print-conversion-box>div:first-child>span{display:block;margin-top:4px;font-size:9.8px;line-height:1.45;color:#748397}
.grade-print-conversion-options{display:grid;grid-template-columns:1fr 1fr;gap:8px}.grade-print-conversion-options button{display:grid;gap:3px;text-align:left;padding:10px 11px;border:1px solid #d5dfeb;border-radius:10px;background:#fff;color:#52657d;cursor:pointer}.grade-print-conversion-options button b{font-size:11px}.grade-print-conversion-options button small{font-size:9px;color:#7d8999}.grade-print-conversion-options button.is-active{border-color:#3568a3;background:#edf4fc;color:#28588e;box-shadow:0 0 0 2px rgba(53,104,163,.10)}.grade-print-conversion-options button.is-active.beta{border-color:#735b9b;background:#f4effb;color:#604588;box-shadow:0 0 0 2px rgba(115,91,155,.10)}
.grade-print-beta-row{display:grid;grid-template-columns:minmax(145px,.55fr) minmax(0,1fr);gap:9px;align-items:end}.grade-print-beta-row label{display:grid!important;grid-template-columns:1fr!important;gap:5px!important;padding:0!important;border:0!important;background:transparent!important}.grade-print-beta-row label>span{font-size:9.5px!important;font-weight:900;color:#61738a}.grade-print-beta-row select{width:100%;height:36px;border:1px solid #cbd7e5;border-radius:9px;background:#fff;padding:0 9px;font:inherit;font-size:10.5px;font-weight:850;color:#344a64}.grade-print-beta-row>small{display:block;padding:8px 9px;border-radius:9px;background:#fff;color:#6d7b8e;font-size:9.3px;line-height:1.4}.grade-print-beta-row>small.warning{background:#fff7e8;color:#806020}
.grade-print-paper-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 11px;border:1px solid #dce4ec;border-radius:11px;background:#fafbfd}.grade-print-paper-row>span>b{display:block;font-size:11.5px;color:#344d69}.grade-print-paper-row>span>small{display:block;margin-top:3px;font-size:9.5px;line-height:1.4;color:#7b8999}.grade-print-paper-row>div{display:flex;gap:5px}.grade-print-paper-row button{min-width:48px;border:1px solid #d1dce8;border-radius:8px;padding:7px 9px;background:#fff;color:#64758a;font-size:10.5px;font-weight:900;cursor:pointer}.grade-print-paper-row button.is-active{background:#315f95;border-color:#315f95;color:#fff}
.grade-print-option-actions{display:flex;justify-content:space-between;gap:9px;padding:13px 18px 17px;border-top:1px solid #edf1f5}.grade-print-option-actions>div{display:flex;gap:7px}.grade-print-option-actions button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid #cdd9e6;border-radius:9px;padding:8px 11px;background:#fff;color:#526980;font-size:11px;font-weight:900;cursor:pointer}.grade-print-option-actions button.primary{background:#3568a3;color:#fff;border-color:#3568a3}
@media(max-width:640px){.grade-print-conversion-options,.grade-print-beta-row{grid-template-columns:1fr}.grade-print-option-actions{align-items:stretch;flex-direction:column}.grade-print-option-actions>div{display:grid;grid-template-columns:1fr 1fr}}
@media print {
  @page{size:A4 landscape;margin:3.5mm}
  html,body{width:100%!important;height:auto!important;margin:0!important;padding:0!important;background:#fff!important}
  body.print-student-grade-report #root{display:none!important}
  body.print-student-grade-report>.student-grade-print-sheet-clone,
  body.print-student-grade-report>.student-grade-print-sheet-clone *{visibility:visible!important}
  body.print-student-grade-report>.student-grade-print-sheet-clone{
    display:block!important;position:relative!important;width:100%!important;height:auto!important;margin:0!important;padding:0!important;
    color:#24364c;background:#fff;font-family:"Pretendard","Noto Sans KR","Malgun Gothic",sans-serif;
    -webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;
  }
  .student-grade-print-sheet-clone *{box-sizing:border-box}
  .student-grade-print-sheet-clone .report-header{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8mm;align-items:end;padding:0 0 2.5mm;border-bottom:1.5px solid #3568a3}
  .student-grade-print-sheet-clone .report-kicker{font-size:8px;font-weight:900;color:#58708e;letter-spacing:.08em}
  .student-grade-print-sheet-clone .report-title{margin-top:1mm;font-size:18px;line-height:1.05;font-weight:950;letter-spacing:-.04em;color:#203b5c}
  .student-grade-print-sheet-clone .report-student{margin-top:1.5mm;font-size:9.2px;font-weight:850;color:#3e536d}
  .student-grade-print-sheet-clone .report-meta{text-align:right;font-size:7.2px;line-height:1.4;color:#65758a;font-weight:750}.student-grade-print-sheet-clone .report-meta b{color:#2e527d;font-weight:950}
  .student-grade-print-sheet-clone .report-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:1.8mm;margin-top:2.2mm}
  .student-grade-print-sheet-clone .report-summary>div{border:1px solid #cfdbe9;border-radius:2mm;background:#f5f9fd;padding:2.2mm 2.5mm;min-height:13mm}
  .student-grade-print-sheet-clone .report-summary small{display:block;font-size:6.8px;color:#6f8093;font-weight:850;white-space:nowrap}
  .student-grade-print-sheet-clone .report-summary b{display:block;margin-top:.8mm;font-size:13px;line-height:1;font-weight:950;color:#244a75}
  .student-grade-print-sheet-clone .report-section-title{display:flex;align-items:center;justify-content:space-between;gap:4mm;margin:2.8mm 0 1.5mm;font-size:8.8px;font-weight:950;color:#263d59}
  .student-grade-print-sheet-clone .report-section-title span{font-size:6.5px;color:#7b8999;font-weight:750}
  .student-grade-print-sheet-clone .semester-grid{display:grid;gap:1.8mm}
  .student-grade-print-sheet-clone[data-semester-count="1"] .semester-grid{grid-template-columns:minmax(0,1fr)}
  .student-grade-print-sheet-clone[data-semester-count="2"] .semester-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .student-grade-print-sheet-clone[data-semester-count="3"] .semester-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
  .student-grade-print-sheet-clone[data-semester-count="4"] .semester-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
  .student-grade-print-sheet-clone[data-semester-count="5"] .semester-grid{grid-template-columns:repeat(5,minmax(0,1fr))}
  .student-grade-print-sheet-clone .semester-card{border:1px solid #cfd9e5;border-radius:1.7mm;overflow:hidden;break-inside:avoid;background:#fff}
  .student-grade-print-sheet-clone .semester-head{display:flex;align-items:center;justify-content:space-between;gap:1.4mm;padding:1.35mm 1.7mm;background:#edf4fb;border-bottom:1px solid #cbd8e6}
  .student-grade-print-sheet-clone .semester-head b{font-size:7.8px;color:#234d7c}
  .student-grade-print-sheet-clone .semester-head span{font-size:6.1px;color:#64778d;font-weight:850;white-space:nowrap}
  .student-grade-print-sheet-clone table{width:100%;border-collapse:collapse;table-layout:fixed}
  .student-grade-print-sheet-clone th{background:#f7f9fc;color:#51647a;font-size:6px;line-height:1.12;font-weight:900;padding:1.05mm .65mm;border-right:1px solid #dde4ec;border-bottom:1px solid #d6dfe9;text-align:center}
  .student-grade-print-sheet-clone td{font-size:6.1px;line-height:1.12;font-weight:720;padding:.92mm .65mm;border-right:1px solid #e3e8ee;border-bottom:1px solid #e3e8ee;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .student-grade-print-sheet-clone td.subject{text-align:left;font-weight:880;color:#273c56;white-space:normal;word-break:keep-all;overflow-wrap:anywhere}
  .student-grade-print-sheet-clone th:last-child,.student-grade-print-sheet-clone td:last-child{border-right:0}
  .student-grade-print-sheet-clone .report-lower-grid{display:grid;gap:1.8mm;align-items:stretch;min-height:0;overflow:hidden}.student-grade-print-sheet-clone[data-lower-count="4"] .report-lower-grid{grid-template-columns:minmax(0,.9fr) minmax(0,1.28fr);grid-template-rows:repeat(2,minmax(0,1fr));height:64mm}.student-grade-print-sheet-clone[data-lower-count="3"] .report-lower-grid{grid-template-columns:minmax(0,.82fr) minmax(0,1fr) minmax(0,1.45fr);grid-template-rows:minmax(0,1fr);height:38mm}.student-grade-print-sheet-clone[data-lower-count="2"] .report-lower-grid{grid-template-columns:minmax(0,.88fr) minmax(0,1.32fr);grid-template-rows:minmax(0,1fr);height:42mm}.student-grade-print-sheet-clone[data-lower-count="1"] .report-lower-grid{grid-template-columns:minmax(0,1fr);height:45mm}.student-grade-print-sheet-clone[data-lower-count="0"] .report-lower-grid,.student-grade-print-sheet-clone[data-lower-count="0"] .report-lower-title{display:none!important}
  .student-grade-print-sheet-clone .report-trend-card,.student-grade-print-sheet-clone .mock-trend-card,.student-grade-print-sheet-clone .mock-table,.student-grade-print-sheet-clone .report-category-card{border:1px solid #cfd9e5;border-radius:1.7mm;overflow:hidden;background:#fff;break-inside:avoid;height:100%}
  .student-grade-print-sheet-clone .report-trend-head{display:flex;align-items:center;justify-content:space-between;gap:2mm;padding:1.2mm 1.7mm;background:#f4f7fb;border-bottom:1px solid #d8e1eb}
  .student-grade-print-sheet-clone .report-trend-head b{font-size:7.4px;color:#2c4c70}.student-grade-print-sheet-clone .report-trend-head span{font-size:5.9px;color:#78899b;font-weight:800}
  .student-grade-print-sheet-clone .report-trend-chart,.student-grade-print-sheet-clone .mock-trend-chart{display:block;width:100%;height:calc(100% - 7mm);min-height:0;padding:.2mm .8mm .4mm;overflow:visible}
  .student-grade-print-sheet-clone .report-category-head{padding:1.2mm 1.7mm;background:#f4f7fb;border-bottom:1px solid #d8e1eb;font-size:7.4px;font-weight:950;color:#2c4c70}.student-grade-print-sheet-clone .report-category-card table{height:calc(100% - 7mm)}.student-grade-print-sheet-clone .report-category-card th{font-size:6px;padding:1mm .5mm;background:#eef3fa}.student-grade-print-sheet-clone .report-category-card td{font-size:6.2px;padding:1mm .5mm}.student-grade-print-sheet-clone .category-average{font-weight:950;color:#315f92;background:#f4f8fd}.student-grade-print-sheet-clone .mock-table th{font-size:6.2px;padding:1.15mm .65mm;background:#eef3fa}
  .student-grade-print-sheet-clone .mock-table table{height:100%}.student-grade-print-sheet-clone .mock-table thead{height:7mm}.student-grade-print-sheet-clone .mock-table tbody tr{height:calc((100% - 7mm)/var(--mock-row-count,6))}.student-grade-print-sheet-clone .mock-table td{font-size:6.2px;padding:.55mm .55mm;vertical-align:middle}
  .student-grade-print-sheet-clone .sum-cell{font-weight:950;color:#315f92;background:#f4f8fd}
.student-grade-print-sheet-clone[data-print-category="false"] .report-category-card{display:none!important}.student-grade-print-sheet-clone[data-print-trend="false"] .report-trend-card{display:none!important}.student-grade-print-sheet-clone[data-print-mock-chart="false"] .mock-trend-card{display:none!important}.student-grade-print-sheet-clone[data-print-mock="false"] .mock-table{display:none!important}
  .student-grade-print-sheet-clone{height:198mm!important;max-height:198mm!important;display:flex!important;flex-direction:column!important;overflow:hidden!important}
  .student-grade-print-sheet-clone[data-semester-count="1"] .report-lower-grid,.student-grade-print-sheet-clone[data-semester-count="2"] .report-lower-grid,.student-grade-print-sheet-clone[data-semester-count="3"] .report-lower-grid{flex:none!important}
  .student-grade-print-sheet-clone[data-semester-count="4"] .report-lower-grid{height:58mm}.student-grade-print-sheet-clone[data-semester-count="5"] .report-lower-grid{height:52mm}
  .student-grade-print-sheet-clone[data-lower-count="4"] .report-category-card{grid-column:1;grid-row:1}.student-grade-print-sheet-clone[data-lower-count="4"] .report-trend-card{grid-column:2;grid-row:1}.student-grade-print-sheet-clone[data-lower-count="4"] .mock-trend-card{grid-column:1;grid-row:2}.student-grade-print-sheet-clone[data-lower-count="4"] .mock-table{grid-column:2;grid-row:2}
  .student-grade-print-sheet-clone .report-footer{display:flex;justify-content:space-between;gap:8mm;margin-top:2mm;padding-top:1.4mm;border-top:1px solid #dbe2ea;font-size:6px;color:#7d8997;font-weight:700}
  .student-grade-print-sheet-clone[data-semester-count="5"] .semester-head{padding:1.05mm 1.4mm}
  .student-grade-print-sheet-clone[data-semester-count="5"] th{font-size:5.4px;padding:.78mm .5mm}
  .student-grade-print-sheet-clone[data-semester-count="5"] td{font-size:5.5px;padding:.68mm .5mm}
  .student-grade-print-sheet-clone[data-semester-count="5"] .report-trend-chart,.student-grade-print-sheet-clone[data-semester-count="5"] .mock-trend-chart{height:calc(100% - 7mm)}
  .student-grade-print-sheet-clone[data-paper="B4"]{height:236mm!important;max-height:236mm!important;padding:2mm 3mm!important}
  .student-grade-print-sheet-clone[data-paper="B4"] .report-title{font-size:21px!important}
  .student-grade-print-sheet-clone[data-paper="B4"] .report-student{font-size:10.2px!important}
  .student-grade-print-sheet-clone[data-paper="B4"] .report-summary b{font-size:14.5px!important}
  .student-grade-print-sheet-clone[data-paper="B4"] .semester-head b{font-size:8.5px!important}
  .student-grade-print-sheet-clone[data-paper="B4"] th{font-size:6.6px!important;padding:1.2mm .75mm!important}
  .student-grade-print-sheet-clone[data-paper="B4"] td{font-size:6.7px!important;padding:1.05mm .75mm!important}
  .student-grade-print-sheet-clone[data-paper="B4"][data-lower-count="4"] .report-lower-grid{height:78mm!important}
  .student-grade-print-sheet-clone[data-paper="B4"][data-lower-count="3"] .report-lower-grid{height:49mm!important}
  .student-grade-print-sheet-clone[data-paper="B4"][data-lower-count="2"] .report-lower-grid{height:53mm!important}
  .student-grade-print-sheet-clone[data-paper="B4"][data-lower-count="1"] .report-lower-grid{height:56mm!important}
}
`


function StudentGradePrintTrend({ semesterKeys = [], groups, gradeSystem, entryYear, grade9Label = "기존 환산 9등급" }) {
  const values = semesterKeys.map(key => {
    const index = SEMESTER_KEYS.indexOf(key);
    return groups?.["전과목"]?.perSemester9?.[index]
      ?? groups?.["전과목"]?.perSemester5?.[index]
      ?? null;
  });
  const width = 360;
  const height = 132;
  const left = 28;
  const right = 12;
  const top = 29;
  const bottom = 24;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const pointX = index => semesterKeys.length <= 1 ? left + innerWidth / 2 : left + (innerWidth * index) / (semesterKeys.length - 1);
  const pointY = value => top + ((Math.max(1, Math.min(9, Number(value))) - 1) / 8) * innerHeight;
  const valid = values.map((value, index) => Number.isFinite(Number(value)) ? { value: Number(value), index } : null).filter(Boolean);
  const linePoints = valid.map(item => `${pointX(item.index)},${pointY(item.value)}`).join(" ");
  return <article className="report-trend-card">
    <div className="report-trend-head"><b>전과목 평균 등급 추이</b><span>{gradeSystem === 5 ? grade9Label : "9등급제 기준"}</span></div>
    <svg className="report-trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="전과목 평균 등급 추이">
      <rect x={left} y={top} width={innerWidth} height={innerHeight * .125} rx="4" fill="#edf7f1" />
      {[1,3,5,7,9].map(gradeValue => {
        const y = pointY(gradeValue);
        return <g key={gradeValue}><line x1={left} x2={width-right} y1={y} y2={y} stroke="#dbe3ec" strokeWidth="1"/><text x={left-9} y={y+3} textAnchor="middle" fontSize="8" fontWeight="800" fill="#68798c">{gradeValue}</text></g>;
      })}
      {semesterKeys.map((key,index) => <line key={key} x1={pointX(index)} x2={pointX(index)} y1={top} y2={top+innerHeight} stroke="#eef2f6" strokeWidth="1"/>)}
      {linePoints && <polyline points={linePoints} fill="none" stroke="#315f92" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>}
      {valid.map(item => <g key={item.index}><circle cx={pointX(item.index)} cy={pointY(item.value)} r="4.5" fill="#fff" stroke="#315f92" strokeWidth="2.5"/><rect x={pointX(item.index)-15} y={pointY(item.value)-22} width="30" height="15" rx="7.5" fill="#274e78"/><text x={pointX(item.index)} y={pointY(item.value)-11.5} textAnchor="middle" fontSize="8.5" fontWeight="900" fill="#fff">{item.value}</text></g>)}
      {semesterKeys.map((key,index) => <text key={`label-${key}`} x={pointX(index)} y={height-8} textAnchor="middle" fontSize="7.3" fontWeight="800" fill="#52667c">{key.replace("-","-")}</text>)}
      {!valid.length && <text x={width/2} y={height/2} textAnchor="middle" fontSize="10" fontWeight="800" fill="#91a0b0">등록된 등급 평균 없음</text>}
    </svg>
  </article>;
}

function StudentGradePrintMockTrend({ mockRows = [], entryYear }) {
  const width = 360;
  const height = 132;
  const left = 30;
  const right = 12;
  const top = 18;
  const bottom = 28;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const series = [
    { key: "sum2", label: "2합", stroke: "#315f92" },
    { key: "sum3", label: "3합", stroke: "#7a61a8" },
    { key: "sum4", label: "4합", stroke: "#c17a35" },
  ];
  const values = mockRows.flatMap(row => series.map(item => Number(row.sums?.[item.key])).filter(Number.isFinite));
  const maxValue = Math.max(12, ...values);
  const minValue = Math.min(2, ...values);
  const span = Math.max(1, maxValue - minValue);
  const pointX = index => mockRows.length <= 1 ? left + innerWidth / 2 : left + (innerWidth * index) / (mockRows.length - 1);
  const pointY = value => top + ((Number(value) - minValue) / span) * innerHeight;
  return <article className="mock-trend-card">
    <div className="report-trend-head"><b>모의고사 최저합 추이</b><span>낮을수록 우수 · 2합/3합/4합</span></div>
    <svg className="mock-trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="모의고사 최저합 추이">
      {[0,.5,1].map((ratio,index) => { const value = Math.round((minValue + span * ratio) * 10) / 10; const y = top + innerHeight * ratio; return <g key={index}><line x1={left} x2={width-right} y1={y} y2={y} stroke="#dbe3ec" strokeWidth="1"/><text x={left-12} y={y+3} textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#68798c">{value}</text></g>; })}
      {series.map((item,seriesIndex) => {
        const valid = mockRows.map((row,index) => Number.isFinite(Number(row.sums?.[item.key])) ? { index, value:Number(row.sums[item.key]) } : null).filter(Boolean);
        const points = valid.map(point => `${pointX(point.index)},${pointY(point.value)}`).join(" ");
        return <g key={item.key}>{points && <polyline points={points} fill="none" stroke={item.stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>}{valid.map(point => <circle key={point.index} cx={pointX(point.index)} cy={pointY(point.value)} r="3" fill="#fff" stroke={item.stroke} strokeWidth="2"/>)}<circle cx={74+seriesIndex*62} cy="8" r="3" fill={item.stroke}/><text x={81+seriesIndex*62} y="11" fontSize="7.5" fontWeight="900" fill="#52667c">{item.label}</text></g>;
      })}
      {mockRows.map((row,index) => <text key={row.key} x={pointX(index)} y={height-8} textAnchor="middle" fontSize="6.7" fontWeight="800" fill="#52667c">{mockCalendarLabel(row.key,entryYear).replace("2025년 ","").replace("2026년 ","")}</text>)}
      {!mockRows.length && <text x={width/2} y={height/2} textAnchor="middle" fontSize="10" fontWeight="800" fill="#91a0b0">등록된 모의고사 성적 없음</text>}
    </svg>
  </article>;
}

function StudentGradePrintCategoryTable({ semesterKeys, groups, gradeSystem, entryYear }) {
  const categories = ["국어", "영어", "수학", "사회", "과학"];
  const field = gradeSystem === 5 ? "perSemester9" : "perSemester9";
  return <article className="report-category-card">
    <div className="report-category-head">교과별 평균 등급</div>
    <table><thead><tr><th>교과</th>{semesterKeys.map(key=><th key={key}>{key}</th>)}<th>평균</th></tr></thead><tbody>{categories.map(category=>{
      const values = semesterKeys.map(key=>groups?.[category]?.[field]?.[SEMESTER_KEYS.indexOf(key)] ?? null);
      const valid = values.filter(value=>value!=null);
      const average = valid.length ? Math.round(valid.reduce((sum,value)=>sum+Number(value),0)/valid.length*100)/100 : null;
      return <tr key={category}><td><b>{category}</b></td>{values.map((value,index)=><td key={semesterKeys[index]}>{value ?? "-"}</td>)}<td className="category-average">{average ?? "-"}</td></tr>;
    })}</tbody></table>
  </article>;
}

function StudentGradePrintSheet({
  sid, studentName, grade, classNumber, number, entryYear, gradeSystem,
  semesterRecords, displaySemesterKeys, mockData, availableMockKeys, groups,
  grade9Method = "legacy", betaGroup = "전교과", betaReady = true,
}) {
  const overall5 = groups?.["전과목"]?.avg5 ?? null;
  const overall9 = groups?.["전과목"]?.avg9 ?? (gradeSystem === 9 ? groups?.["전과목"]?.avg5 : null);
  const latestSemesterIndex = (displaySemesterKeys || []).map(key => SEMESTER_KEYS.indexOf(key)).filter(index => (semesterRecords?.[index]?.subjects || []).length).pop();
  const latestSemesterAverage9 = latestSemesterIndex == null ? null : (groups?.["전과목"]?.perSemester9?.[latestSemesterIndex] ?? groups?.["전과목"]?.perSemester5?.[latestSemesterIndex] ?? null);
  const latestMockKey = availableMockKeys?.[availableMockKeys.length - 1] || null;
  const latestMock = latestMockKey ? cohortRecord(mockData, entryYear, latestMockKey)?.students?.[sid] || {} : {};
  const latestSums = computeMockExamSums(latestMock || {});
  const mockRows = (availableMockKeys || []).map(key => {
    const result = cohortRecord(mockData, entryYear, key)?.students?.[sid] || {};
    return { key, result, sums: computeMockExamSums(result) };
  });
  const printedAt = new Date().toLocaleDateString("ko-KR");
  const location = [grade ? `${grade}학년` : null, classNumber ? `${Number(classNumber)}반` : null, number ? `${Number(number)}번` : null].filter(Boolean).join(" ");
  const grade9Label = gradeSystem === 5
    ? (grade9Method === "statistical" ? `통계 Beta 9등급 · ${betaGroup}` : "기존 환산 9등급")
    : "9등급제";
  const grade9Note = gradeSystem === 5 && grade9Method === "statistical"
    ? (betaReady ? "평균·교과별 표·추이 그래프는 통계 Beta 환산을 적용했습니다." : "통계 Beta 자료를 불러오지 못해 기존 환산값으로 표시했습니다.")
    : "평균·교과별 표·추이 그래프는 기존 2n-1 환산을 적용했습니다.";
  const gradeText = subject => {
    const source = getSubjectGrade(subject);
    if (source == null) return "-";
    return gradeSystem === 5 ? `${source} / ${Math.round(grade5to9(source) * 100) / 100}` : `${source}`;
  };
  return <section className="student-grade-print-sheet" data-semester-count={Math.max(1, Math.min(5, (displaySemesterKeys || []).length))} aria-hidden="true">
    <header className="report-header">
      <div>
        <div className="report-kicker">광덕고등학교 학생 성적 상담표</div>
        <div className="report-title">학기별 내신 및 모의고사 성적</div>
        <div className="report-student">{sid} {studentName} · {location || "학급 정보 미등록"} · {entryYear}학년도 입학생 · {gradeSystem}등급제</div>
      </div>
      <div className="report-meta">출력일 {printedAt}<br/>9등급 평균 기준: <b>{grade9Label}</b><br/>{gradeSystem === 5 ? "과목별 상세 등급은 5등급 / 기존 9등급 환산 순입니다." : "등급 표기는 9등급제 기준입니다."}</div>
    </header>
    <div className="report-summary">
      <div><small>{gradeSystem === 5 ? "전과목 평균 · 5등급" : "전과목 평균 · 9등급"}</small><b>{gradeSystem === 5 ? (overall5 ?? "-") : (overall9 ?? "-")}</b></div>
      <div><small>{gradeSystem === 5 ? `전과목 평균 · ${grade9Method === "statistical" ? "통계 Beta 9등급" : "기존 9등급 환산"}` : "최근 학기 평균 · 9등급"}</small><b>{gradeSystem === 5 ? (overall9 ?? "-") : (latestSemesterAverage9 ?? "-")}</b></div>
      <div><small>최근 모의고사 · 2합</small><b>{latestSums.sum2 ?? "-"}</b></div>
      <div><small>최근 모의고사 · 3합</small><b>{latestSums.sum3 ?? "-"}</b></div>
      <div><small>최근 모의고사 · 4합</small><b>{latestSums.sum4 ?? "-"}</b></div>
    </div>
    <div className="report-section-title">학기별 내신 성적 <span>과목 · 학점 · 원점수 · 성취도 · 석차등급</span></div>
    <div className="semester-grid">
      {(displaySemesterKeys || []).map(key => {
        const index = SEMESTER_KEYS.indexOf(key);
        const subjects = semesterRecords?.[index]?.subjects || [];
        const avg5 = groups?.["전과목"]?.perSemester5?.[index] ?? null;
        const avg9 = groups?.["전과목"]?.perSemester9?.[index] ?? null;
        return <article className="semester-card" key={key}>
          <div className="semester-head"><b>{semesterCalendarLabel(key, entryYear)}</b><span>{gradeSystem === 5 ? `평균 ${avg5 ?? "-"} / 환산 ${avg9 ?? "-"}` : `평균 ${avg9 ?? avg5 ?? "-"}`}</span></div>
          {subjects.length ? <table><colgroup><col style={{width:"41%"}}/><col style={{width:"10%"}}/><col style={{width:"15%"}}/><col style={{width:"14%"}}/><col style={{width:"20%"}}/></colgroup><thead><tr><th>과목</th><th>학점</th><th>원점수</th><th>성취도</th><th>{gradeSystem === 5 ? "등급 5/9" : "등급"}</th></tr></thead><tbody>{subjects.map((subject, subjectIndex) => <tr key={`${key}-${subject.subject}-${subjectIndex}`}><td className="subject">{subject.subject}</td><td>{subject.credit ?? "-"}</td><td>{subject.score ?? "-"}</td><td>{subject.achievement ?? "-"}</td><td>{gradeText(subject)}</td></tr>)}</tbody></table> : <div className="empty-semester">등록된 성적 없음</div>}
        </article>;
      })}
    </div>
    <div className="report-section-title report-lower-title">교과별 평균·성적 추이·모의고사 <span>{grade9Note}</span></div>
    <div className="report-lower-grid">
      <StudentGradePrintCategoryTable semesterKeys={displaySemesterKeys || []} groups={groups} gradeSystem={gradeSystem} entryYear={entryYear} />
      <StudentGradePrintTrend semesterKeys={displaySemesterKeys || []} groups={groups} gradeSystem={gradeSystem} entryYear={entryYear} grade9Label={grade9Label} />
      <StudentGradePrintMockTrend mockRows={mockRows} entryYear={entryYear} />
      <div className="mock-table"><table><colgroup><col style={{width:"15%"}}/>{MOCK_SUBJECTS.map(subject => <col key={subject} style={{width:"9.5%"}}/>)}<col style={{width:"9.3%"}}/><col style={{width:"9.3%"}}/><col style={{width:"9.3%"}}/></colgroup><thead><tr><th>회차</th>{MOCK_SUBJECTS.map(subject => <th key={subject}>{subject}</th>)}<th>2합</th><th>3합</th><th>4합</th></tr></thead><tbody>{mockRows.length ? mockRows.map(({key,result,sums}) => <tr key={key}><td>{mockCalendarLabel(key,entryYear)}</td>{MOCK_SUBJECTS.map(subject => <td key={subject}>{result?.[subject] ?? "-"}</td>)}<td className="sum-cell">{sums.sum2 ?? "-"}</td><td className="sum-cell">{sums.sum3 ?? "-"}</td><td className="sum-cell">{sums.sum4 ?? "-"}</td></tr>) : <tr><td colSpan={10}>등록된 모의고사 성적 없음</td></tr>}</tbody></table></div>
    </div>
    <footer className="report-footer"><span>본 자료는 학생 상담을 위한 참고 자료입니다.</span><span>광덕고등학교 성적·시간표 시스템</span></footer>
  </section>;
}

function StudentGradeReport({ sid, gdb, mode = "both", studentInfo = null }) {
  const { semesterData, mockData, admissionRows, studentAccounts, cohortSettings } = gdb;

  const legacySemesterRecords = SEMESTER_KEYS.map(key => semesterData[key]?.students?.[sid] || null);
  const legacyLatestSemesterRecord = legacySemesterRecords.slice().reverse().find(Boolean) || null;
  const metaRecord = Array.isArray(studentAccounts)
    ? studentAccounts.find(student => String(student.id) === String(sid))
    : studentAccounts?.[sid];
  const initialEntryYear = inferEntryYear({ studentInfo, metaRecord, sid, latestSemesterRecord: legacyLatestSemesterRecord, cohortSettings });
  const semesterRecords = SEMESTER_KEYS.map((key, index) => cohortRecord(semesterData, initialEntryYear, key)?.students?.[sid] || legacySemesterRecords[index] || null);
  const latestSemesterRecord = semesterRecords.slice().reverse().find(Boolean) || legacyLatestSemesterRecord;

  const inferredGrade = asNumber(studentInfo?.grade)
    ?? asNumber(String(sid || "").charAt(0))
    ?? asNumber(latestSemesterRecord?.grade ?? metaRecord?.grade)
    ?? 1;
  const inferredClass = studentInfo?.class ?? latestSemesterRecord?.class ?? metaRecord?.class ?? asNumber(String(sid || "").slice(1, 3));
  const inferredNumber = studentInfo?.number ?? latestSemesterRecord?.number ?? metaRecord?.number ?? asNumber(String(sid || "").slice(3, 5));
  const studentName = studentInfo?.name ?? latestSemesterRecord?.name ?? metaRecord?.name ?? "";
  const scopedAdmissionRows = useMemo(() => admissionItemsForGrade(admissionRows || [], inferredGrade), [admissionRows, inferredGrade]);
  const entryYear = initialEntryYear;
  const gradeSystem = entryYear >= 2025 ? 5 : 9;

  const subjectLists = SEMESTER_KEYS.map((key, index) => semesterRecords[index]?.subjects || null);
  const hasAnyGrades = subjectLists.some(subjects => subjects?.length);
  const [requestedGradeScale, setRequestedGradeScale] = useState(null);
  const [grade9Method, setGrade9Method] = useState("legacy");
  const [reportBetaGroup, setReportBetaGroup] = useState("전교과");
  const [reportBetaData, setReportBetaData] = useState(null);
  const [reportBetaStatus, setReportBetaStatus] = useState("idle");
  const displayGradeScale = gradeSystem === 9 ? 9 : (requestedGradeScale === 9 ? 9 : 5);
  const groups = useMemo(() => computeAllGroupAverages(subjectLists, gradeSystem), [semesterData, sid, gradeSystem]); // eslint-disable-line
  const statisticalReportMode = gradeSystem === 5 && displayGradeScale === 9 && grade9Method === "statistical";

  useEffect(() => {
    if (!statisticalReportMode || reportBetaData) return;
    let active = true;
    setReportBetaStatus("loading");
    loadSusiNaviBetaData().then(value => {
      if (!active) return;
      setReportBetaData(value);
      setReportBetaStatus(value?.conversions?.length ? "ready" : "empty");
    }).catch(() => {
      if (active) setReportBetaStatus("error");
    });
    return () => { active = false; };
  }, [statisticalReportMode, reportBetaData]);

  const displayGroups = useMemo(() => (
    statisticalReportMode
      ? statisticalReportGroups(groups, reportBetaData, reportBetaGroup)
      : groups
  ), [groups, statisticalReportMode, reportBetaData, reportBetaGroup]);
  const gradeDisplayLabel = displayGradeScale === 5
    ? "5등급제 원등급"
    : statisticalReportMode
      ? `통계 Beta 9등급 · ${reportBetaGroup}`
      : "기존 환산 9등급";

  const displaySemesterKeys = SEMESTER_KEYS.filter(key => Number(key.split("-")[0]) <= inferredGrade);
  const availableSemesters = displaySemesterKeys.filter(key => {
    const index = SEMESTER_KEYS.indexOf(key);
    return subjectLists[index] && subjectLists[index].length;
  });
  const [showGradePrintOptions, setShowGradePrintOptions] = useState(false);
  const [gradePrintOptions, setGradePrintOptions] = useState({ category: true, trend: true, mockChart: true, mock: true, grade9Method: "legacy", betaGroup: "전교과", paper: "A4" });
  useEffect(() => {
    setGradePrintOptions(prev => ({
      category: availableSemesters.length <= 3,
      trend: true,
      mockChart: availableSemesters.length <= 3,
      mock: true,
      grade9Method: statisticalReportMode ? "statistical" : "legacy",
      betaGroup: reportBetaGroup,
      paper: prev?.paper === "B4" ? "B4" : "A4",
    }));
  }, [sid, availableSemesters.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const printStatisticalMode = gradeSystem === 5 && gradePrintOptions.grade9Method === "statistical";
  useEffect(() => {
    if (!printStatisticalMode || reportBetaData) return;
    let active = true;
    setReportBetaStatus("loading");
    loadSusiNaviBetaData().then(value => {
      if (!active) return;
      setReportBetaData(value);
      setReportBetaStatus(value?.conversions?.length ? "ready" : "empty");
    }).catch(() => {
      if (active) setReportBetaStatus("error");
    });
    return () => { active = false; };
  }, [printStatisticalMode, reportBetaData]);
  const printGroups = useMemo(() => (
    printStatisticalMode && reportBetaData?.conversions?.length
      ? statisticalReportGroups(groups, reportBetaData, gradePrintOptions.betaGroup)
      : groups
  ), [groups, printStatisticalMode, reportBetaData, gradePrintOptions.betaGroup]);

  const [selSemKey, setSelSemKey] = useState(null);
  const activeSemKey = selSemKey && availableSemesters.includes(selSemKey)
    ? selSemKey
    : availableSemesters[availableSemesters.length - 1];
  const activeSemSubjects = activeSemKey ? subjectLists[SEMESTER_KEYS.indexOf(activeSemKey)] : null;

  const availableMockKeys = MOCK_MONTH_KEYS.filter(key => cohortRecord(mockData, entryYear, key)?.students?.[sid]);
  const [selMockKey, setSelMockKey] = useState(null);
  const activeMockKey = selMockKey && availableMockKeys.includes(selMockKey)
    ? selMockKey
    : availableMockKeys[availableMockKeys.length - 1];
  const mockGrades = activeMockKey ? cohortRecord(mockData, entryYear, activeMockKey)?.students?.[sid] || {} : {};
  const sums = useMemo(() => computeMockExamSums(mockGrades || {}), [mockGrades]);

  const latestMockKey = useMemo(() => {
    const order = MOCK_MONTH_KEYS.slice().reverse();
    return order.find(key => cohortRecord(mockData, entryYear, key)?.students?.[sid]) || null;
  }, [mockData, sid]);
  const latestMockGrades = latestMockKey ? cohortRecord(mockData, entryYear, latestMockKey)?.students?.[sid] || {} : {};
  const latestSums = useMemo(() => computeMockExamSums(latestMockGrades || {}), [latestMockGrades]);

  const overallAverage = gradeSystem === 5
    ? groups["전과목"]?.avg5 ?? null
    : groups["전과목"]?.avg9 ?? null;
  const matchedUniversities = useMemo(
    () => matchUniversities(latestSums, scopedAdmissionRows),
    [latestSums, scopedAdmissionRows],
  );
  const comment = gradeAnalysisComment(overallAverage, latestSums.sum2, latestSums.sum3, latestSums.sum4, gradeSystem);

  const [trendTab, setTrendTab] = useState("category");
  const [selectedCategoryTrend, setSelectedCategoryTrend] = useState("전과목");
  const [selectedMockSubject, setSelectedMockSubject] = useState("전과목 평균");

  const categoryTrendSeries = useMemo(() => {
    const field = displayGradeScale === 9 ? "perSemester9" : "perSemester5";
    const meta = selectedCategoryTrend === "전과목"
      ? { color: "#2b2620", label: "전과목 평균" }
      : CATEGORY_META[selectedCategoryTrend];
    return [{
      name: meta?.label || selectedCategoryTrend,
      color: meta?.color || "#2b2620",
      values: availableSemesters.map(key => (
        displayGroups[selectedCategoryTrend]?.[field]?.[SEMESTER_KEYS.indexOf(key)] ?? null
      )),
      showLabels: true,
    }];
  }, [displayGroups, availableSemesters, displayGradeScale, selectedCategoryTrend]);

  const mockTrendSeries = useMemo(() => {
    const isAverage = selectedMockSubject === "전과목 평균";
    const values = availableMockKeys.map(key => {
      const result = cohortRecord(mockData, entryYear, key)?.students?.[sid] || {};
      if (!isAverage) return asNumber(result[selectedMockSubject]);
      const valid = CORE_MOCK_SUBJECTS.map(subject => asNumber(result[subject])).filter(value => value != null);
      return valid.length ? Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 100) / 100 : null;
    });
    const mockColors = {
      국어: CATEGORY_META.국어.color,
      수학: CATEGORY_META.수학.color,
      영어: CATEGORY_META.영어.color,
      한국사: CATEGORY_META.사회.color,
      통합사회: "#b57b20",
      통합과학: CATEGORY_META.과학.color,
      "전과목 평균": "#2b2620",
    };
    return [{
      name: selectedMockSubject,
      color: mockColors[selectedMockSubject] || "#2b2620",
      values,
      showLabels: true,
    }];
  }, [availableMockKeys, mockData, sid, selectedMockSubject]);

  const showGrades = mode === "grades" || mode === "both";
  const showAdmission = mode === "admission" || mode === "both";
  const hasAnyData = hasAnyGrades || availableMockKeys.length > 0;

  return (
    <div>
      <style>{STUDENT_GRADE_PRINT_CSS}</style>
      <StudentGradePrintSheet
        sid={sid}
        studentName={studentName}
        grade={inferredGrade}
        classNumber={inferredClass}
        number={inferredNumber}
        entryYear={entryYear}
        gradeSystem={gradeSystem}
        semesterRecords={semesterRecords}
        displaySemesterKeys={availableSemesters.slice(0, 5)}
        mockData={mockData}
        availableMockKeys={availableMockKeys}
        groups={printGroups}
        grade9Method={printStatisticalMode && reportBetaData?.conversions?.length ? "statistical" : "legacy"}
        betaGroup={gradePrintOptions.betaGroup}
        betaReady={!printStatisticalMode || Boolean(reportBetaData?.conversions?.length)}
      />
      <StudentIdentityBanner
        sid={sid}
        name={studentName}
        grade={inferredGrade}
        classNumber={inferredClass}
        number={inferredNumber}
        entryYear={entryYear}
        gradeSystem={gradeSystem}
        actions={showGrades ? <button type="button" className="no-print" onClick={()=>setShowGradePrintOptions(true)} style={{display:"inline-flex",alignItems:"center",gap:6,border:"1px solid rgba(255,255,255,.5)",borderRadius:9,padding:"8px 11px",background:"rgba(255,255,255,.13)",color:"#fff",fontSize:11.5,fontWeight:900,cursor:"pointer",whiteSpace:"nowrap"}} title="학기별 내신과 모의고사 성적을 한 장으로 인쇄하거나 PDF로 저장합니다."><Printer size={14}/>성적표 인쇄·PDF</button> : null}
      />
      {showGradePrintOptions && <div className="grade-print-option-overlay no-print" onMouseDown={event=>{if(event.target===event.currentTarget)setShowGradePrintOptions(false)}}>
        <section className="grade-print-option-modal">
          <div className="grade-print-option-head"><div><b>성적표 인쇄 설정</b><span>9등급 환산 방식과 인쇄 항목을 선택하면 A4 한 페이지에 맞춰 자동 배치합니다.</span></div><button type="button" onClick={()=>setShowGradePrintOptions(false)}><X size={16}/></button></div>
          <div className="grade-print-option-body">
            {gradeSystem === 5 && <div className="grade-print-conversion-box">
              <div><b>인쇄용 9등급 환산 방식</b><span>전과목 평균·교과별 평균·내신 추이 그래프에 적용됩니다. 과목별 상세 행은 기존 2n-1 환산을 유지합니다.</span></div>
              <div className="grade-print-conversion-options">
                <button type="button" className={gradePrintOptions.grade9Method === "legacy" ? "is-active" : ""} onClick={() => setGradePrintOptions(prev => ({ ...prev, grade9Method: "legacy" }))}><b>기존 9등급 환산</b><small>2×5등급−1</small></button>
                <button type="button" className={gradePrintOptions.grade9Method === "statistical" ? "is-active beta" : ""} onClick={() => setGradePrintOptions(prev => ({ ...prev, grade9Method: "statistical" }))}><b>통계 Beta 9등급</b><small>일반고 통계 기반 추정</small></button>
              </div>
              {gradePrintOptions.grade9Method === "statistical" && <div className="grade-print-beta-row"><label><span>교과 조합</span><select value={gradePrintOptions.betaGroup} onChange={event => setGradePrintOptions(prev => ({ ...prev, betaGroup: event.target.value }))}>{REPORT_BETA_GROUPS.map(group => <option key={group}>{group}</option>)}</select></label><small className={["empty","error"].includes(reportBetaStatus) ? "warning" : ""}>{reportBetaStatus === "loading" ? "통계 변환표를 불러오는 중입니다." : reportBetaStatus === "empty" ? "통계 변환표가 없어 실제 인쇄 시 기존 환산으로 대체됩니다." : reportBetaStatus === "error" ? "변환표를 불러오지 못해 실제 인쇄 시 기존 환산으로 대체됩니다." : "53,149명 일반고 자료를 이용한 통계적 추정값입니다."}</small></div>}
            </div>}
            <div className="grade-print-paper-row"><span><b>인쇄 용지</b><small>B4를 선택하면 더 넓은 용지에 맞춰 글자와 표 여백을 확대합니다.</small></span><div><button type="button" className={gradePrintOptions.paper !== "B4" ? "is-active" : ""} onClick={()=>setGradePrintOptions(prev=>({...prev,paper:"A4"}))}>A4</button><button type="button" className={gradePrintOptions.paper === "B4" ? "is-active" : ""} onClick={()=>setGradePrintOptions(prev=>({...prev,paper:"B4"}))}>B4</button></div></div>
            <label><input type="checkbox" checked disabled/><span><b>학기별 내신 성적</b><span>등록된 학기만 표시하며 빈 학기는 제외합니다.</span></span></label>
            <label><input type="checkbox" checked={gradePrintOptions.category} onChange={event=>setGradePrintOptions(prev=>({...prev,category:event.target.checked}))}/><span><b>교과별 평균 등급</b><span>국어·영어·수학·사회·과학의 학기별 평균을 표로 표시합니다.</span></span></label>
            <label><input type="checkbox" checked={gradePrintOptions.trend} onChange={event=>setGradePrintOptions(prev=>({...prev,trend:event.target.checked}))}/><span><b>전과목 평균 등급 추이</b><span>등록된 학기의 평균 등급 변화를 선 그래프로 표시합니다.</span></span></label>
            <label><input type="checkbox" checked={gradePrintOptions.mockChart} onChange={event=>setGradePrintOptions(prev=>({...prev,mockChart:event.target.checked}))}/><span><b>모의고사 최저합 그래프</b><span>회차별 2합·3합·4합의 변화를 그래프로 표시합니다.</span></span></label>
            <label><input type="checkbox" checked={gradePrintOptions.mock} onChange={event=>setGradePrintOptions(prev=>({...prev,mock:event.target.checked}))}/><span><b>모의고사 성적표</b><span>회차별 과목 등급과 2합·3합·4합을 표로 표시합니다.</span></span></label>
          </div>
          <div className="grade-print-option-actions"><button type="button" onClick={()=>setGradePrintOptions(prev=>({...prev,category:availableSemesters.length<=3,trend:true,mockChart:availableSemesters.length<=3,mock:true}))}>자동 맞춤</button><div><button type="button" onClick={()=>setShowGradePrintOptions(false)}>취소</button><button type="button" className="primary" onClick={()=>{setShowGradePrintOptions(false);printStudentGradeReport(gradePrintOptions)}}><Printer size={14}/>인쇄·PDF</button></div></div>
        </section>
      </div>}

      {!hasAnyData && (
        <EmptyBox text="아직 등록된 성적 데이터가 없습니다. 관리자가 원본 데이터를 업로드하면 여기에 표시됩니다." />
      )}

      {showGrades && (
        <div style={card}>
          <SectionHeading
            title="내신 성적"
            description={gradeSystem === 5
              ? "과목 계열을 색상으로 구분하고, 5등급제 원등급과 9등급 환산값을 함께 표시합니다."
              : "과목 계열을 색상으로 구분하고, 9등급제 석차등급을 표시합니다."}
          />
          {!availableSemesters.length ? (
            <div style={{ fontSize: 12.5, color: "#a39d8c" }}>등록된 내신 성적이 없습니다.</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                {availableSemesters.map(key => (
                  <button
                    key={key}
                    onClick={() => setSelSemKey(key)}
                    style={{ ...btn.chip, ...(activeSemKey === key ? btn.chipActive : {}) }}
                  >
                    {semesterCalendarLabel(key, entryYear)}
                  </button>
                ))}
              </div>
              <div style={categoryGuide.box}>
                <div style={categoryGuide.group}>
                  <strong style={categoryGuide.title}>교과계열</strong>
                  {Object.entries(CATEGORY_META).filter(([key]) => key !== "기타").map(([key, meta]) => (
                    <span key={key} style={categoryGuide.item}>
                      <span style={{ ...categoryGuide.dot, background: meta.color }} />{meta.label}
                    </span>
                  ))}
                </div>
                <div style={categoryGuide.group}>
                  <strong style={categoryGuide.title}>과목유형</strong>
                  {Object.entries(SUBJECT_TYPE_META).filter(([key]) => key !== "기타").map(([key, meta]) => (
                    <span key={key} style={{ ...courseTypeBadge.base, color: meta.color, background: meta.background, borderColor: meta.border }}>{meta.short}</span>
                  ))}
                </div>
              </div>
              <div style={table.scroll}>
                <table style={{ ...table.base, ...gradeTable.base, minWidth: gradeSystem === 5 ? 785 : 690, tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: 170 }} />
                    <col style={{ width: 82 }} />
                    <col style={{ width: 42 }} />
                    <col style={{ width: 54 }} />
                    <col style={{ width: 56 }} />
                    <col style={{ width: 78 }} />
                    {gradeSystem === 5 && <col style={{ width: 82 }} />}
                    <col style={{ width: 76 }} />
                    <col style={{ width: 62 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th style={{ ...table.th, ...gradeTable.th }}>과목</th>
                      <th style={{ ...table.th, ...gradeTable.th }}>과목계열</th>
                      <th style={{ ...table.th, ...gradeTable.th }}>학점</th>
                      <th style={{ ...table.th, ...gradeTable.th }}>원점수</th>
                      <th style={{ ...table.th, ...gradeTable.th }}>성취도</th>
                      {gradeSystem === 5 ? (
                        <>
                          <th style={{ ...table.th, ...gradeTable.th }}><span>석차등급</span><br /><span style={gradeTable.thSub}>(5등급제)</span></th>
                          <th style={{ ...table.th, ...gradeTable.th }}><span>석차등급</span><br /><span style={gradeTable.thSub}>(9등급 환산)</span></th>
                        </>
                      ) : (
                        <th style={{ ...table.th, ...gradeTable.th }}><span>석차등급</span><br /><span style={gradeTable.thSub}>(9등급제)</span></th>
                      )}
                      <th style={{ ...table.th, ...gradeTable.th }}>석차</th>
                      <th style={{ ...table.th, ...gradeTable.th }}>수강자수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activeSemSubjects || []).map((subject, index) => {
                      const meta = categoryMeta(subject.category, subject.subject);
                      const typeMeta = subjectTypeMeta(subject);
                      const sourceGrade = getSubjectGrade(subject);
                      const convertedGrade = sourceGrade == null ? null : Math.round(grade5to9(sourceGrade) * 100) / 100;
                      const score = asNumber(subject.score);
                      const achievement = String(subject.achievement ?? "");
                      const rank = asNumber(subject.rank);
                      const classSize = asNumber(subject.classSize);
                      const topRate = rank != null && classSize ? Math.round((rank / classSize) * 1000) / 10 : null;
                      return (
                        <tr key={`${subject.subject}-${index}`} style={{ background: "#fff" }}>
                          <td style={{ ...table.tdLabel, ...gradeTable.subjectCell, background: "#fff", borderLeft: `4px solid ${meta.color}`, color: "#2b2620" }}>
                            <div style={gradeTable.subjectWrap}>
                              <span style={gradeTable.subjectName}>{subject.subject}</span>
                              <CourseTypeBadge meta={typeMeta} />
                            </div>
                          </td>
                          <td style={{ ...table.td, ...gradeTable.td }}><CategoryBadge category={meta.key} /></td>
                          <td style={{ ...table.td, ...gradeTable.td }}>{subject.credit}</td>
                          <td style={{ ...table.td, ...gradeTable.td }}>
                            <span style={{ fontWeight: score != null && score >= 90 ? 900 : 600, color: score != null && score >= 90 ? "#24613a" : "inherit" }}>
                              {subject.score ?? "-"}
                            </span>
                          </td>
                          <td style={{ ...table.td, ...gradeTable.td }}>
                            <span style={{ ...achievementPill.base, ...(achievement === "A" ? achievementPill.a : achievement === "B" ? achievementPill.b : achievementPill.default) }}>
                              {subject.achievement ?? "-"}
                            </span>
                          </td>
                          {sourceGrade == null ? (
                            <td style={{ ...table.td, ...gradeTable.td }} colSpan={gradeSystem === 5 ? 2 : 1}>
                              <span style={absoluteGradePill}>절대평가 과목</span>
                            </td>
                          ) : (
                            <>
                              <td style={{ ...table.td, ...gradeTable.td }}>
                                <span style={{ ...metricPill, ...gradeValueStyle(sourceGrade) }}>{sourceGrade}</span>
                              </td>
                              {gradeSystem === 5 && (
                                <td style={{ ...table.td, ...gradeTable.td }}>
                                  <span style={{ ...metricPill, ...gradeValueStyle(convertedGrade) }}>{convertedGrade}</span>
                                </td>
                              )}
                            </>
                          )}
                          <td style={{ ...table.td, ...gradeTable.td }}>
                            <span style={{ fontWeight: topRate != null && topRate <= 10 ? 900 : 600, color: topRate != null && topRate <= 10 ? "#24613a" : "inherit" }}>
                              {subject.rank ?? "-"}
                            </span>
                            {topRate != null && topRate <= 10 && <div style={topBadge}>상위 {topRate}%</div>}
                          </td>
                          <td style={{ ...table.td, ...gradeTable.td }}>{subject.classSize ?? "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {showGrades && hasAnyGrades && (
        <div style={card}>
          <SectionHeading
            title={`교과별 평균 (${gradeDisplayLabel})`}
            description="국어·영어·수학·사회·과학의 학점 가중평균입니다. 전체 평균 열은 별도로 강조했습니다."
          />
          {gradeSystem === 5 && (
            <GradeScaleSelector
              value={displayGradeScale}
              onChange={setRequestedGradeScale}
              method={grade9Method}
              onMethodChange={setGrade9Method}
              betaGroup={reportBetaGroup}
              onBetaGroupChange={setReportBetaGroup}
              betaStatus={reportBetaStatus}
            />
          )}
          <AverageTable
            names={CATEGORY_GROUP_NAMES}
            groups={displayGroups}
            displaySemesterKeys={displaySemesterKeys}
            entryYear={entryYear}
            gradeScale={displayGradeScale}
            categoryRows
          />
        </div>
      )}

      {showGrades && hasAnyGrades && (
        <div style={card}>
          <SectionHeading
            title={`계열별 평균 (${gradeDisplayLabel})`}
            description="대학 교과전형에서 자주 활용하는 교과 조합별 학점 가중평균입니다."
          />
          <AverageTable
            names={COMBINATION_GROUP_NAMES}
            groups={displayGroups}
            displaySemesterKeys={displaySemesterKeys}
            entryYear={entryYear}
            gradeScale={displayGradeScale}
          />
        </div>
      )}

      {showGrades && (
        <div style={card}>
          <SectionHeading
            title="모의고사 성적"
            description="선택한 회차의 과목별 등급과 최적 2합·3합·4합을 확인합니다."
          />
          {!availableMockKeys.length ? (
            <div style={{ fontSize: 12.5, color: "#a39d8c" }}>등록된 모의고사 성적이 없습니다.</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                {availableMockKeys.map(key => (
                  <button
                    key={key}
                    onClick={() => setSelMockKey(key)}
                    style={{ ...btn.chip, ...(activeMockKey === key ? btn.chipActive : {}) }}
                  >
                    {mockCalendarLabel(key, entryYear)}
                  </button>
                ))}
              </div>
              <div style={table.scroll}>
                <table style={table.base}>
                  <thead><tr>{MOCK_SUBJECTS.map(subject => <th key={subject} style={table.th}>{subject}</th>)}</tr></thead>
                  <tbody>
                    <tr>
                      {MOCK_SUBJECTS.map(subject => (
                        <td key={subject} style={table.td}>
                          <span style={{ ...metricPill, ...gradeValueStyle(mockGrades[subject], 9) }}>{mockGrades[subject] ?? "-"}</span>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <MockSumCards sums={sums} />
            </>
          )}
        </div>
      )}


      {showGrades && (hasAnyGrades || availableMockKeys.length > 0) && (
        <div style={card}>
          <SectionHeading
            title="성적 추이 그래프"
            description={`선택한 항목 한 개만 그래프로 표시하여 선이 겹치지 않도록 했습니다. 내신은 ${gradeDisplayLabel} 기준이며, 위쪽의 1등급에 가까울수록 우수합니다.`}
          />
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            <TrendTabButton active={trendTab === "category"} onClick={() => setTrendTab("category")}>교과별 내신</TrendTabButton>
            <TrendTabButton active={trendTab === "mock"} onClick={() => setTrendTab("mock")}>모의고사</TrendTabButton>
          </div>

          {trendTab === "category" && (
            <div>
              <div style={{ ...chartControlRow, alignItems: "flex-start" }}>
                <span style={{ ...chartControlLabel, paddingTop: 7 }}>그래프 선택</span>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {CATEGORY_TREND_OPTIONS.map(name => {
                    const meta = name === "전과목"
                      ? { color: "#2b2620", background: "#f1f0ec", short: "전과목" }
                      : CATEGORY_META[name];
                    const active = selectedCategoryTrend === name;
                    return (
                      <button
                        key={name}
                        onClick={() => setSelectedCategoryTrend(name)}
                        style={{
                          ...btn.chip,
                          borderColor: meta.color,
                          background: active ? meta.color : meta.background,
                          color: active ? "#fff" : meta.color,
                          boxShadow: active ? `0 3px 10px ${meta.color}33` : "none",
                        }}
                      >
                        {meta.short}
                      </button>
                    );
                  })}
                </div>
              </div>
              <GradeTrendChart
                title={`${selectedCategoryTrend === "전과목" ? "전과목 평균" : selectedCategoryTrend} 등급 추이`}
                xLabels={availableSemesters.map(key => semesterCalendarLabel(key, entryYear, true))}
                series={categoryTrendSeries}
                maxGrade={displayGradeScale}
                emptyText="선택한 교과의 내신 성적이 없습니다."
              />
            </div>
          )}

          {trendTab === "mock" && (
            <div>
              <div style={{ ...chartControlRow, alignItems: "flex-start" }}>
                <span style={{ ...chartControlLabel, paddingTop: 7 }}>그래프 선택</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {MOCK_TREND_OPTIONS.map(subject => (
                    <button
                      key={subject}
                      onClick={() => setSelectedMockSubject(subject)}
                      style={{ ...btn.chip, ...(selectedMockSubject === subject ? btn.chipActive : {}) }}
                    >
                      {subject}
                    </button>
                  ))}
                </div>
              </div>
              <GradeTrendChart
                title={`${selectedMockSubject} 등급 추이`}
                xLabels={availableMockKeys.map(key => mockCalendarLabel(key, entryYear, true))}
                series={mockTrendSeries}
                maxGrade={9}
                emptyText="선택한 모의고사 성적이 없습니다."
              />
            </div>
          )}
        </div>
      )}

      {showAdmission && (
        <div style={card}>
          <SectionHeading
            title="수능 최저 도달 대학 (교과전형 기준)"
            description={latestMockKey ? `${mockCalendarLabel(latestMockKey, entryYear)} 모의고사를 기준으로 판정했습니다.` : "등록된 최신 모의고사를 기준으로 판정합니다."}
          />
          <div style={{ fontSize: 13, color: matchedUniversities.length ? "#3d5c3a" : "#8a8578", lineHeight: 1.7 }}>
            {matchedUniversities.length ? matchedUniversities.join(", ") : "도달 대학 없음"}
          </div>
        </div>
      )}

      {showAdmission && (
        <div style={{ ...card, background: "#fff8e6", border: "1px solid #f0dca0" }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: "#8a6d1f" }}>성적 분석</div>
          <div style={{ fontSize: 13, color: "#5c4a12", lineHeight: 1.6 }}>{comment}</div>
        </div>
      )}
    </div>
  );
}


function universityKey(value) {
  return String(value || "")
    .normalize("NFKC")
    // 대학 지원 진단은 캠퍼스를 괄호로 표기하고, 과거 사례는 지역 열로 분리되는 경우가 많습니다.
    // 연결용 키에서는 괄호 속 캠퍼스·지역 표기를 제거하여 같은 학교로 묶습니다.
    .replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, "")
    .replace(/여자대학교/g, "여대")
    .replace(/여자대학/g, "여대")
    .replace(/대학교/g, "대")
    .replace(/\s+(?:서울|세종|죽전|천안|글로컬|글로벌|메디컬|ERICA|WISE|와이즈|국제|경주)(?:캠퍼스|캠)?\s*$/gi, "")
    .replace(/(?:서울|세종|죽전|천안|글로컬|글로벌|메디컬|ERICA|국제|WISE|와이즈)캠퍼스/gi, "")
    .replace(/캠퍼스/g, "")
    .replace(/\s+/g, "")
    .replace(/[()\[\]{}·ㆍ.,_-]/g, "")
    .toLowerCase();
}


const ADMISSION_CAMPUS_ALIASES = ["서울","세종","글로컬","글로벌","메디컬","ERICA","WISE","와이즈","국제","죽전","천안","안성","수원","송도","미래","다빈치","용인","경주"];
const ADMISSION_MULTI_CAMPUS_BY_REGION = {
  건국대: { 서울:"서울", 충북:"글로컬" },
  고려대: { 서울:"서울", 세종:"세종" },
  가천대: { 경기:"글로벌", 인천:"메디컬" },
  경희대: { 서울:"서울", 경기:"국제" },
  단국대: { 경기:"죽전", 충남:"천안" },
  한양대: { 서울:"서울", 경기:"ERICA" },
  홍익대: { 서울:"서울", 세종:"세종" },
  중앙대: { 서울:"서울", 경기:"다빈치" },
  한국외국어대: { 서울:"서울", 경기:"글로벌" },
  연세대: { 서울:"서울", 강원:"미래" },
  성균관대: { 서울:"서울", 경기:"수원" },
  명지대: { 서울:"서울", 경기:"용인" },
  경기대: { 서울:"서울", 경기:"수원" },
  동국대: { 서울:"서울", 경북:"WISE", 경주:"WISE" },
};

const ADMISSION_CAMPUS_LOCATION_ALIASES = {
  가천대: { 성남:"글로벌", 인천:"메디컬", 글로벌:"글로벌", 메디컬:"메디컬" },
  한양대: { 서울:"서울", 안산:"ERICA", ERICA:"ERICA" },
  경희대: { 서울:"서울", 용인:"국제", 수원:"국제", 국제:"국제" },
  단국대: { 용인:"죽전", 죽전:"죽전", 천안:"천안" },
  경기대: { 서울:"서울", 수원:"수원" },
  명지대: { 서울:"서울", 용인:"용인" },
  동국대: { 서울:"서울", 경북:"WISE", 경주:"WISE", WISE:"WISE", 와이즈:"WISE" },
};
function canonicalAdmissionCampus(universityName, campus = "") {
  const raw = String(campus || "").trim();
  if (!raw) return "";
  const aliases = ADMISSION_CAMPUS_LOCATION_ALIASES[universityKey(universityName)] || {};
  if (/^(?:WISE|와이즈|경주)$/i.test(raw)) return "WISE";
  return aliases[raw] || aliases[raw.toUpperCase()] || (raw.toUpperCase() === "ERICA" ? "ERICA" : raw);
}
function normalizeAdmissionRegion(value) {
  const text = String(value || "").normalize("NFKC").replace(/특별시|광역시|특별자치시|특별자치도|도$/g, "").trim();
  if (!text || text === "미지정" || text === "공통") return "";
  const aliases = { 경기도:"경기", 충청남도:"충남", 충청북도:"충북", 전라남도:"전남", 전라북도:"전북", 경상남도:"경남", 경상북도:"경북", 제주도:"제주" };
  return aliases[text] || text;
}
function explicitAdmissionCampusLabel(value) {
  const source = String(value || "").normalize("NFKC");
  const bracket = source.match(/[（(\[]\s*([^）)\]]+)\s*[）)\]]/);
  const bracketValue = String(bracket?.[1] || "").replace(/캠퍼스|캠$/gi, "").trim();
  const mappedBracket = canonicalAdmissionCampus(source, bracketValue);
  if (bracketValue && (mappedBracket !== bracketValue || ADMISSION_CAMPUS_ALIASES.some(name => bracketValue.toUpperCase() === name.toUpperCase()) || /캠퍼스/i.test(String(bracket?.[1] || "")))) {
    return mappedBracket;
  }
  if (/\bWISE\b|와이즈/i.test(source)) return "WISE";
  const suffix = ADMISSION_CAMPUS_ALIASES.find(name => new RegExp(`${name}\\s*(?:캠퍼스|캠)`, "i").test(source));
  return suffix ? canonicalAdmissionCampus(source, suffix) : "";
}
function admissionCampusLabel(value, region = "") {
  const explicit = explicitAdmissionCampusLabel(value);
  if (explicit) return explicit;
  const base = universityKey(value);
  const regionKey = normalizeAdmissionRegion(region);
  const regionMap = ADMISSION_MULTI_CAMPUS_BY_REGION[base] || {};
  if (regionMap[regionKey]) return regionMap[regionKey];
  if (regionKey.includes("세종") && regionMap.세종) return regionMap.세종;
  if (regionKey.includes("대전") && regionMap.대전) return regionMap.대전;
  return "";
}
function normalizeUniversitySearchText(value) {
  return String(value || "").normalize("NFKC").replace(/대학교/g, "대").replace(/\s+/g, "").replace(/[·ㆍ.,_\-–—]/g, "").toLowerCase();
}
function admissionCaseCampusForItem(item) {
  const rawUniversity = String(item?.university || "").trim();
  const normalizedUniversity = String(item?.universityNormalized || "").trim();
  const rawExplicit = explicitAdmissionCampusLabel(rawUniversity);
  if (rawExplicit) return rawExplicit;

  // 원본 대학명에 캠퍼스가 없을 때는 지역 열을 우선합니다.
  // 과거 사례의 보조 대학명(대학2)이 잘못 ERICA로 정규화된 경우에도
  // 서울 지역 사례가 ERICA로 연결되지 않도록 합니다.
  const baseUniversity = universityNameWithoutCampus(rawUniversity || normalizedUniversity);
  const campusFromRegion = admissionCampusLabel(baseUniversity, item?.region);
  if (campusFromRegion) return campusFromRegion;

  const normalizedExplicit = explicitAdmissionCampusLabel(normalizedUniversity);
  if (normalizedExplicit) return normalizedExplicit;
  return admissionCampusLabel(normalizedUniversity || rawUniversity, item?.region);
}

function inferCampusAliasFromText(value) {
  const source = String(value || "").normalize("NFKC");
  const explicit = explicitAdmissionCampusLabel(source);
  if (explicit) return explicit;
  const found = ADMISSION_CAMPUS_ALIASES.find(name => new RegExp(`(?:^|[^가-힣A-Za-z])${name}(?:\\s*(?:캠퍼스|캠))?(?=$|[^가-힣A-Za-z])`, "i").test(source));
  return found ? (found.toUpperCase() === "ERICA" ? "ERICA" : found) : "";
}
function campusFromRegionForUniversity(universityName, region = "") {
  return admissionCampusLabel(universityName, region);
}
function regionForAdmissionCampus(universityName, campus = "", fallback = "미지정") {
  const base = universityKey(universityName);
  const map = ADMISSION_MULTI_CAMPUS_BY_REGION[base] || {};
  const match = Object.entries(map).find(([, value]) => String(value).toUpperCase() === String(campus).toUpperCase());
  if (!match) return fallback || "미지정";
  const region = match[0];
  if (["대전", "세종"].includes(region)) return "대전·세종";
  return region;
}
function singleCampusRegionForUniversity(entries = [], universityName = "") {
  const baseKey = universityKey(universityName);
  if (!baseKey || ADMISSION_MULTI_CAMPUS_BY_REGION[baseKey]) return "";
  const regions = Array.from(new Set((entries || [])
    .filter(item => universityKey(typeof item === "string" ? item : item?.name || item?.university) === baseKey)
    .map(item => normalizeAdmissionRegion(typeof item === "string" ? "" : item?.region))
    .filter(Boolean)));
  if (regions.length !== 1) return "";
  return regions[0];
}
function universityNameWithoutCampus(universityName) {
  return String(universityName || "").replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, "").replace(/\s*(?:서울|세종|글로컬|글로벌|메디컬|ERICA|WISE|와이즈|국제|죽전|천안|안성|수원|송도|미래|다빈치|용인|경주)\s*(?:캠퍼스|캠)$/i, "").trim();
}
function universityNameWithCampus(universityName, campus = "") {
  const name = canonicalAdmissionUniversityBase(universityName);
  if (!name || !campus) return name;
  return `${name}(${campus})`;
}
function resolveAdmissionDocumentIdentity(fileName, knownEntries = [], manualUniversity = "", manualRegion = "미지정") {
  const fileCampus = inferCampusAliasFromText(fileName);
  const inferredUniversity = inferUniversityFromFileName(fileName, knownEntries);
  const inferredEntry = (knownEntries || []).map(item => (
    typeof item === "string" ? { name: item, region: "미지정" } : { name: item?.name || item?.university || "", region: item?.region || "미지정" }
  )).find(item => item.name && universityDocumentKey(item.name,item.region) === universityDocumentKey(inferredUniversity,item.region))
    || (knownEntries || []).map(item => (typeof item === "string" ? { name:item,region:"미지정" } : {name:item?.name||item?.university||"",region:item?.region||"미지정"})).find(item => item.name && universityKey(item.name) === universityKey(inferredUniversity));
  const inferredKnown = Boolean(inferredEntry);
  const baseUniversity = resolveKnownUniversityBaseName((inferredKnown ? inferredUniversity : manualUniversity) || inferredUniversity || "대학명 확인 필요", knownEntries);
  const baseCampus = fileCampus || admissionCampusLabel(inferredUniversity, inferRegionFromFileName(fileName, inferredEntry?.region || "")) || admissionCampusLabel(baseUniversity, manualRegion);
  const university = universityNameWithCampus(baseUniversity, baseCampus);
  const singleCampusRegion = singleCampusRegionForUniversity(knownEntries, baseUniversity);
  const regionFromFile = inferRegionFromFileName(fileName, "");
  const fileHasLocation = Boolean(fileCampus || (regionFromFile && regionFromFile !== "미지정"));
  const region = fileHasLocation
    ? regionForAdmissionCampus(university, baseCampus, regionFromFile || inferredEntry?.region || "미지정")
    : (manualRegion && manualRegion !== "미지정"
      ? manualRegion
      : regionForAdmissionCampus(university, baseCampus, singleCampusRegion || inferredEntry?.region || "미지정"));
  return { university, campus: baseCampus, region: region || "미지정" };
}
function universityDocumentKey(value, region = "", campus = "") {
  return `${universityKey(value)}|${campus || admissionCampusLabel(value, region)}`;
}
function admissionItemCampus(item) {
  const university = item?.university || item?.name || "";
  const campus = item?.campus || admissionCampusLabel(university, item?.region) || "";
  return canonicalAdmissionCampus(university, campus);
}
function buildAdmissionDocumentIndex(documents = []) {
  const base = new Map();
  documents.forEach(item => {
    const baseKey = universityKey(item?.university);
    if (!baseKey) return;
    if (!base.has(baseKey)) base.set(baseKey, []);
    base.get(baseKey).push(item);
  });
  base.forEach(items => items.sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||""))));
  return { base };
}
function admissionDocumentsForRow(index, row) {
  const baseItems = index?.base?.get(universityKey(row?.university || row?.name)) || [];
  if (!baseItems.length) return [];
  const rowUniversity = row?.university || row?.name;
  const rowCampus = admissionCampusLabel(rowUniversity, row?.region);
  if (rowCampus) return baseItems.filter(item => admissionItemCampus(item) === rowCampus);
  const noCampus = baseItems.filter(item => !admissionItemCampus(item));
  if (noCampus.length) return noCampus;
  // 전형표가 대학 단위로 통합되어 있고 자료만 캠퍼스별인 경우(예: 명지대),
  // 캠퍼스 자료를 모두 해당 대학 행에 연결해 추가 대학 자료로 중복 노출하지 않습니다.
  return baseItems;
}
function admissionDocumentMatchesRow(docItem, row) {
  if (universityKey(docItem?.university) !== universityKey(row?.university || row?.name)) return false;
  const docCampus = admissionItemCampus(docItem);
  const rowCampus = admissionCampusLabel(row?.university || row?.name, row?.region);
  if (docCampus && rowCampus) return docCampus === rowCampus;
  return !docCampus || !rowCampus;
}
function admissionCaseItemsForRow(caseIndex, row) {
  const baseItems = caseIndex?.get(universityKey(row?.university)) || [];
  if (!baseItems.length) return [];
  const rowCampus = admissionCampusLabel(row?.university, row?.region);
  if (rowCampus) return baseItems.filter(item => admissionCaseCampusForItem(item) === rowCampus);
  const noCampus = baseItems.filter(item => !admissionCaseCampusForItem(item));
  if (noCampus.length) return noCampus;
  const groups = new Set(baseItems.map(item => admissionCaseCampusForItem(item)).filter(Boolean));
  return groups.size <= 1 ? baseItems : [];
}
function admissionCaseFocusUniversity(row) {
  const campus = admissionCampusLabel(row?.university, row?.region);
  if (!campus || explicitAdmissionCampusLabel(row?.university)) return row?.university || "";
  return `${row?.university || ""}(${campus})`;
}
function normalizeAdmissionCaseDepartment(value) {
  return String(value || "").normalize("NFKC").toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, "")
    .replace(/(?:학과|학부|전공|계열|과정|트랙|6년제)/g, "")
    .replace(/[\s·ㆍ_\-–—/]+/g, "").trim();
}
function admissionCaseDepartmentMatches(value, target) {
  const left = normalizeAdmissionCaseDepartment(value);
  const right = normalizeAdmissionCaseDepartment(target);
  if (!right) return true;
  return Boolean(left) && (left === right || left.includes(right) || right.includes(left));
}
function normalizeAdmissionCaseType(value) {
  return String(value || "").normalize("NFKC").toLowerCase()
    .replace(/학생부|전형|일반|학교장|추천자|추천/g, "")
    .replace(/[\s·ㆍ_\-–—/()[\]{}]+/g, "").trim();
}
function admissionCaseTypeMatches(item, target) {
  const right = normalizeAdmissionCaseType(target);
  if (!right) return true;
  const left = normalizeAdmissionCaseType(`${item?.admissionType || ""} ${item?.detailType || ""}`);
  return Boolean(left) && (left.includes(right) || right.includes(left));
}
function admissionCaseLinkForRow(caseIndex, row) {
  const universityItems = admissionCaseItemsForRow(caseIndex, row);
  if (!universityItems.length) return { count: 0, scope: "none", label: "광덕고 사례", university: admissionCaseFocusUniversity(row), department: "", admissionType: "" };
  const departmentItems = row?.department ? universityItems.filter(item => admissionCaseDepartmentMatches(item?.department, row.department)) : universityItems;
  const exactItems = row?.track ? departmentItems.filter(item => admissionCaseTypeMatches(item, row.track)) : departmentItems;
  if (exactItems.length) return { count: exactItems.length, scope: "exact", label: "광덕고 전형", university: admissionCaseFocusUniversity(row), department: row?.department || "", admissionType: row?.track || "" };
  if (departmentItems.length) return { count: departmentItems.length, scope: "department", label: "광덕고 학과", university: admissionCaseFocusUniversity(row), department: row?.department || "", admissionType: "" };
  return { count: universityItems.length, scope: "university", label: "광덕고 대학", university: admissionCaseFocusUniversity(row), department: "", admissionType: "" };
}
function favoriteCampusForItem(item) {
  const university = String(item?.university || "").trim();
  // 과거 즐겨찾기에 `단일`/`공통`으로 저장된 값은 실제 캠퍼스 정보가 아니므로
  // 대학명 또는 지역에서 다시 판별합니다. (예: 동국대(WISE), 동국대 + 경북)
  const explicit = explicitAdmissionCampusLabel(university);
  if (explicit) return explicit;
  const stored = String(item?.campus || "").trim();
  if (stored && !["단일", "공통", "미지정"].includes(stored)) return canonicalAdmissionCampus(university, stored);
  return admissionCampusLabel(university, item?.region) || "";
}
function favoriteSemanticKey(item) {
  const scope = item?.favoriteKind === "개별사례" || item?.caseId ? `case:${String(item?.caseId || "")}` : "group";
  // 출처가 달라도 같은 대학·캠퍼스·학과는 하나의 관심 대학 묶음으로 관리합니다.
  const admissionType = String(item?.admissionType || "").replace(/수시NAVI\s*Beta/gi, "").trim();
  return [universityDocumentKey(item?.university, item?.region, favoriteCampusForItem(item)), String(item?.department || "전체").trim(), admissionType, scope].join("|");
}


function normalizeReflectionText(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "-") return "";
  return text
    .replace(/[\r\n]+/g, " + ")
    .replace(/[·,;/]+/g, " + ")
    .replace(/\s*\+\s*/g, " + ")
    .replace(/(\d)\s*%/g, "$1%")
    .replace(/\s+/g, " ")
    .replace(/(?:\s*\+\s*){2,}/g, " + ")
    .replace(/^\s*\+|\+\s*$/g, "")
    .trim();
}

function extractReflectionFromNote(note) {
  const text = String(note ?? "");
  if (!text) return "";
  const match = text.match(/(?:학생부\s*)?교과\s*\d+(?:\.\d+)?\s*%(?:\s*(?:\+|,|·|\/|및)\s*(?:출결|면접|서류|학생부|비교과|추천|봉사)\s*\d+(?:\.\d+)?\s*%)*/i);
  return normalizeReflectionText(match?.[0] || "");
}

function admissionReflectionText(row) {
  const explicit = row?.reflection || row?.courseReflection || row?.reflectionRatio || row?.subjectReflection || row?.studentRecordRatio || row?.evaluationRatio || "";
  return normalizeReflectionText(explicit) || extractReflectionFromNote(row?.note);
}


function AdmissionReflectionBadge({ value }) {
  const parts = normalizeReflectionText(value)
    .split(/\s*\+\s*/)
    .map(part => part.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  return (
    <span className="reflection-badge" style={reflectionBadge} title={normalizeReflectionText(value)}>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`} style={reflectionBadgeLine}>
          {index > 0 && <span style={reflectionBadgePlus}>＋</span>}
          <span>{part}</span>
        </span>
      ))}
    </span>
  );
}

function admissionSpecialNote(row, reflection) {
  const note = String(row?.note ?? "").trim();
  if (!note || !reflection || row?.reflection || row?.courseReflection || row?.reflectionRatio || row?.subjectReflection) return note;
  const extracted = extractReflectionFromNote(note);
  if (!extracted) return note;
  return note
    .replace(/(?:학생부\s*)?교과\s*\d+(?:\.\d+)?\s*%(?:\s*(?:\+|,|·|\/|및)\s*(?:출결|면접|서류|학생부|비교과|추천|봉사)\s*\d+(?:\.\d+)?\s*%)*/i, "")
    .replace(/^[\s:·,;+-]+|[\s:·,;+-]+$/g, "")
    .trim();
}

function percentPart(label, value) {
  if (value === null || value === undefined || value === "") return "";
  const raw = String(value).trim();
  if (!raw || raw === "-") return "";
  const numeric = Number(raw.replace(/%/g, ""));
  if (Number.isFinite(numeric)) {
    const percent = numeric > 0 && numeric <= 1 ? numeric * 100 : numeric;
    return `${label} ${Number.isInteger(percent) ? percent : Number(percent.toFixed(1))}%`;
  }
  return `${label} ${raw.includes("%") ? raw : `${raw}%`}`;
}


const ADMISSION_SUBJECT_LABELS = {
  국어: "국",
  수학: "수",
  영어: "영",
  통합사회: "사",
  통합과학: "과",
  한국사: "한",
};

function admissionSubjectGroupLabel(group) {
  const labels = (group?.subjects || []).map(subject => ADMISSION_SUBJECT_LABELS[subject] || subject);
  if (!labels.length) return "";
  if (group.type === "choice") return `${labels.join("/")} 택1`;
  return labels[0];
}

function admissionSubjectRuleText(value) {
  return parseAdmissionSubjectGroups(value)
    .map(admissionSubjectGroupLabel)
    .filter(Boolean)
    .join(" · ");
}

function AdmissionSubjectRule({ value }) {
  const text = admissionSubjectRuleText(value);
  if (!text) return null;
  return (
    <span style={subjectRule.text} title={String(value || "")}>
      {text}
    </span>
  );
}

function splitAdmissionSpecialNote(value) {
  const text = String(value || "").replace(/\r/g, "").trim();
  if (!text) return [];
  return text
    .replace(/\s*(<[^>]+>\s*:)/g, "\n$1")
    .replace(/\s+(?=(?:수능\s*최저|지역균형전형|학교장추천|추천인재|교과우수|진로\/?융합\s*선택|성취도|석차등급)\s*:)/g, "\n")
    .replace(/[;；]\s*/g, "\n")
    .split(/\n+/)
    .map(part => part.trim())
    .filter(Boolean);
}

function AdmissionSpecialNote({ value }) {
  const parts = splitAdmissionSpecialNote(value);
  if (!parts.length) return null;
  return (
    <div style={specialNoteStyle.box} title={String(value || "")}>
      {parts.map((part, index) => {
        const match = part.match(/^([^:：]{1,24})[:：]\s*(.+)$/);
        return (
          <div key={`${part}-${index}`} style={specialNoteStyle.row}>
            <span style={specialNoteStyle.bullet}>•</span>
            <span>
              {match ? <><b style={specialNoteStyle.label}>{match[1].trim()}</b><span>{match[2].trim()}</span></> : part}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function splitAdmissionDetailLabel(value) {
  const text = String(value || "").trim();
  if (!text) return [];

  const manualBreaks = [
    [/학생부교과\s*우수자/g, "학생부교과\n우수자"],
    [/학생부교과\s*전형/g, "학생부교과\n전형"],
    [/학교장추천\s*(전형|자)/g, "학교장추천\n$1"],
    [/지역균형\s*(전형|선발)/g, "지역균형\n$1"],
    [/교과우수\s*(전형|자)/g, "교과우수\n$1"],
  ];

  let formatted = text;
  manualBreaks.forEach(([pattern, replacement]) => {
    formatted = formatted.replace(pattern, replacement);
  });

  if (!formatted.includes("\n") && formatted.length >= 8) {
    const suffixMatch = formatted.match(/^(.{4,}?)(우수자|추천자|전형|선발)$/);
    if (suffixMatch) formatted = `${suffixMatch[1]}\n${suffixMatch[2]}`;
  }

  return formatted.split(/\n+/).map(part => part.trim()).filter(Boolean);
}

function AdmissionDetailText({ department, track }) {
  const departmentText = String(department || "").trim();
  const trackText = String(track || "").trim();
  const primary = departmentText || trackText || "전체 모집단위";
  const secondary = departmentText && trackText && trackText !== departmentText ? trackText : "";
  return (
    <div style={admissionTable.detailStack}>
      <span style={admissionTable.detailLine}>{primary}</span>
      {secondary && <span style={admissionTable.trackLine}>{secondary}</span>}
    </div>
  );
}

const CURRICULUM_METHOD_FIELDS = [
  ["commonSubjectMethod", "공통과목"],
  ["generalElectiveMethod", "일반선택"],
  ["careerElectiveMethod", "진로선택"],
  ["convergenceElectiveMethod", "융합선택"],
];

function normalizeCurriculumMethod(value) {
  const original = String(value ?? "").trim();
  const raw = original.replace(/\s+/g, "").replace(/[·ㆍ]/g, "+");
  if (!raw || raw === "-" || /^(해당없음|없음|미입력)$/.test(raw)) return "미입력";
  if (/미반영|반영안함|반영하지않/.test(raw)) return "미반영";
  if (/정성/.test(raw)) return "정성평가";
  const hasRank = /석차|등급/.test(raw);
  const hasAchievement = /성취/.test(raw);
  if (hasRank && hasAchievement) return "석차등급+성취도";
  if (hasRank) return "석차등급";
  if (hasAchievement) return "성취도";
  return original;
}

function curriculumMethodMeta(value) {
  const normalized = normalizeCurriculumMethod(value);
  if (normalized === "석차등급") return { key: "rank", label: "석차등급", style: curriculumMethodBadge.rank };
  if (normalized === "성취도") return { key: "achievement", label: "성취도", style: curriculumMethodBadge.achievement };
  if (normalized === "석차등급+성취도") return { key: "mixed", label: "석차등급+성취도", style: curriculumMethodBadge.mixed };
  if (normalized === "정성평가") return { key: "qualitative", label: "정성평가", style: curriculumMethodBadge.qualitative };
  if (normalized === "미반영") return { key: "excluded", label: "미반영", style: curriculumMethodBadge.excluded };
  if (normalized === "미입력") return { key: "empty", label: "-", style: curriculumMethodBadge.empty };
  return { key: "other", label: normalized, style: curriculumMethodBadge.other };
}

function CurriculumMethodBadge({ value }) {
  const meta = curriculumMethodMeta(value);
  const lines = meta.key === "mixed" ? ["석차등급", "＋ 성취도"] : [meta.label];
  return (
    <span style={{ ...curriculumMethodBadge.base, ...meta.style }} title={String(value || meta.label)}>
      {lines.map((line, index) => <span key={`${line}-${index}`} style={curriculumMethodBadge.line}>{line}</span>)}
    </span>
  );
}

function admissionMinimumText(result) {
  if (result?.ruleType === "each") return `${result.count}개 각 ${result.threshold}등급`;
  return `${result?.count}합 ${result?.threshold}`;
}

function admissionStudentResultText(result) {
  if (result?.ruleType === "each") {
    const grades = Array.isArray(result.studentGrades) ? result.studentGrades : [];
    return grades.length ? grades.join(" · ") : "";
  }
  return result?.studentSum == null ? "" : `${result.count}합 ${result.studentSum}`;
}

const ACHIEVEMENT_LEVEL = { A: 1, B: 2, C: 3, D: 4, E: 5 };

function achievementLabel(value) {
  const label = String(value || "").trim().toUpperCase();
  return ACHIEVEMENT_LEVEL[label] ? label : null;
}

function buildStudentAchievementAnalysis(semesterRecords, gradeSystem) {
  const entries = (semesterRecords || []).flatMap((record, semesterIndex) => (record?.subjects || []).map(subject => {
    const achievement = achievementLabel(subject.achievement);
    const rankGrade = getSubjectGrade(subject);
    const subjectType = inferSubjectType(subject.subject, subject.subjectType);
    return {
      ...subject,
      semesterKey: SEMESTER_KEYS[semesterIndex],
      achievement,
      achievementLevel: achievement ? ACHIEVEMENT_LEVEL[achievement] : null,
      rankGrade: asNumber(rankGrade),
      subjectType,
    };
  })).filter(item => item.achievement);

  const comparable = Number(gradeSystem) === 5
    ? entries.filter(item => item.rankGrade != null && item.rankGrade >= 1 && item.rankGrade <= 5)
    : [];
  const lowerThanRank = comparable.filter(item => item.achievementLevel > item.rankGrade);
  const higherThanRank = comparable.filter(item => item.achievementLevel < item.rankGrade);
  const aligned = comparable.filter(item => item.achievementLevel === item.rankGrade);
  const absolute = entries.filter(item => item.rankGrade == null);

  const byType = {};
  ["공통과목", "일반선택", "진로선택", "융합선택", "기타"].forEach(type => {
    const items = entries.filter(item => item.subjectType === type);
    byType[type] = {
      items,
      total: items.length,
      a: items.filter(item => item.achievement === "A").length,
      belowB: items.filter(item => ["C", "D", "E"].includes(item.achievement)).length,
    };
  });

  return { entries, comparable, lowerThanRank, higherThanRank, aligned, absolute, byType };
}

function compactSubjectExamples(items, limit = 3) {
  return (items || []).slice(0, limit).map(item => `${item.subject}(${item.rankGrade ?? "-"}등급·${item.achievement})`).join(", ");
}

function AchievementGuidancePanel({ analysis, universityCounts, gradeSystem }) {
  const lower = analysis?.lowerThanRank || [];
  const higher = analysis?.higherThanRank || [];
  const career = analysis?.byType?.["진로선택"] || { total: 0, a: 0, belowB: 0 };
  const convergence = analysis?.byType?.["융합선택"] || { total: 0, a: 0, belowB: 0 };
  const hasAchievement = (analysis?.entries || []).length > 0;

  let headline = "성취도 자료가 입력되면 석차등급과의 균형을 분석합니다.";
  let tone = achievementAdvice.neutral;
  if (hasAchievement && Number(gradeSystem) !== 5) {
    headline = "성취도와 선택과목 유형을 중심으로 관리 상태를 확인하세요.";
  } else if (lower.length) {
    headline = `석차등급보다 성취도가 낮은 과목이 ${lower.length}개 있어 성취도 관리가 필요합니다.`;
    tone = achievementAdvice.warning;
  } else if (higher.length) {
    headline = `석차등급보다 성취도가 높은 과목이 ${higher.length}개 있어 일부 대학 반영 방식에서 유리할 수 있습니다.`;
    tone = achievementAdvice.positive;
  } else if (hasAchievement) {
    headline = "석차등급과 성취도가 전반적으로 균형을 이루고 있습니다.";
    tone = achievementAdvice.positive;
  }

  return (
    <div style={{ ...achievementAdvice.box, ...tone }}>
      <div style={achievementAdvice.header}>
        <div>
          <div style={achievementAdvice.eyebrow}>학생 성취도 분석</div>
          <div style={achievementAdvice.title}>{headline}</div>
        </div>
        <div style={achievementAdvice.countBadge}>성취도 반영 대학 {universityCounts?.achievementUniversities || 0}개</div>
      </div>
      <div style={achievementAdvice.metrics}>
        <span style={achievementAdvice.metric}>등급보다 낮음 <b>{lower.length}</b></span>
        <span style={achievementAdvice.metric}>등급보다 높음 <b>{higher.length}</b></span>
        <span style={achievementAdvice.metric}>진로선택 A <b>{career.a}/{career.total}</b></span>
        <span style={achievementAdvice.metric}>융합선택 A <b>{convergence.a}/{convergence.total}</b></span>
      </div>
      <div style={achievementAdvice.comments}>
        {lower.length > 0 && (
          <div><b>관리 필요:</b> {compactSubjectExamples(lower)}{lower.length > 3 ? ` 외 ${lower.length - 3}개` : ""}. 석차등급과 성취도를 함께 반영하는 대학에서 불리할 수 있으므로 성취도 보완이 필요합니다.</div>
        )}
        {higher.length > 0 && (
          <div><b>강점 활용:</b> {compactSubjectExamples(higher)}{higher.length > 3 ? ` 외 ${higher.length - 3}개` : ""}. 석차등급과 성취도 중 우수한 결과를 활용하는 대학에서 유리할 수 있으나, 선택의 폭을 넓히려면 석차등급 관리도 함께 필요합니다.</div>
        )}
        {career.total > 0 && <div><b>진로선택:</b> A 비율 {Math.round((career.a / career.total) * 100)}%{career.belowB ? ` · C 이하 ${career.belowB}개 과목은 우선 관리하세요.` : " · 현재 성취도 흐름이 양호합니다."}</div>}
        {convergence.total > 0 && <div><b>융합선택:</b> A 비율 {Math.round((convergence.a / convergence.total) * 100)}%{convergence.belowB ? ` · C 이하 ${convergence.belowB}개 과목은 정성평가 대학 지원 시 점검이 필요합니다.` : " · 정성평가 자료로 활용하기 좋습니다."}</div>}
        {!hasAchievement && <div>내신 성적표의 성취도(A~E)를 등록하면 과목 유형별 관리 코멘트가 자동으로 생성됩니다.</div>}
      </div>
    </div>
  );
}

function admissionDocumentType(docItem) {
  return docItem?.documentType === "reflection" ? "reflection" : "guide";
}

function StudentAdmissionView({ sid, gdb, studentInfo = null, favorites = [], onToggleFavorite, onOpenCases, focusUniversity = "", onBackToConsultation, onClearFocus }) {
  const { semesterData, mockData, admissionRows = [], admissionDocs = [], studentAccounts, cohortSettings } = gdb;
  const legacySemesterRecords = SEMESTER_KEYS.map(key => semesterData[key]?.students?.[sid] || null);
  const legacyLatestSemesterRecord = legacySemesterRecords.slice().reverse().find(Boolean) || null;
  const metaRecord = Array.isArray(studentAccounts)
    ? studentAccounts.find(student => String(student.id) === String(sid))
    : studentAccounts?.[sid];
  const initialEntryYear = inferEntryYear({ studentInfo, metaRecord, sid, latestSemesterRecord: legacyLatestSemesterRecord, cohortSettings });
  const semesterRecords = SEMESTER_KEYS.map(key => cohortRecord(semesterData, initialEntryYear, key)?.students?.[sid] || legacySemesterRecords[SEMESTER_KEYS.indexOf(key)] || null);
  const latestSemesterRecord = semesterRecords.slice().reverse().find(Boolean) || legacyLatestSemesterRecord;
  const inferredGrade = asNumber(studentInfo?.grade)
    ?? asNumber(String(sid || "").charAt(0))
    ?? asNumber(latestSemesterRecord?.grade ?? metaRecord?.grade)
    ?? 1;
  const inferredClass = studentInfo?.class ?? latestSemesterRecord?.class ?? metaRecord?.class ?? asNumber(String(sid || "").slice(1, 3));
  const inferredNumber = studentInfo?.number ?? latestSemesterRecord?.number ?? metaRecord?.number ?? asNumber(String(sid || "").slice(3, 5));
  const studentName = studentInfo?.name ?? latestSemesterRecord?.name ?? metaRecord?.name ?? "";
  const scopedAdmissionRows = useMemo(() => admissionItemsForGrade(admissionRows || [], inferredGrade), [admissionRows, inferredGrade]);
  const scopedAdmissionDocs = useMemo(() => admissionItemsForGrade(admissionDocs || [], inferredGrade), [admissionDocs, inferredGrade]);
  const entryYear = initialEntryYear;
  const gradeSystem = entryYear >= 2025 ? 5 : 9;
  const achievementAnalysis = useMemo(
    () => buildStudentAchievementAnalysis(semesterRecords, gradeSystem),
    [semesterData, sid, gradeSystem], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const latestMockKey = MOCK_MONTH_KEYS.slice().reverse().find(key => cohortRecord(mockData, entryYear, key)?.students?.[sid]) || null;
  const latestMockGrades = latestMockKey ? cohortRecord(mockData, entryYear, latestMockKey)?.students?.[sid] || {} : {};
  const latestSums = useMemo(() => computeMockExamSums(latestMockGrades || {}), [latestMockGrades]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [fieldFilters, setFieldFilters] = useState([]);
  const [requirementFilter, setRequirementFilter] = useState("all");
  const [admissionViewMode, setAdmissionViewMode] = useState("mock");
  const [admissionTableView, setAdmissionTableView] = useState("focus");
  useEffect(() => {
    if (focusUniversity) setQuery(String(focusUniversity).replace(/\([^)]*\)|\[[^\]]*\]/g, "").trim());
  }, [focusUniversity]);

  const admissionDocumentIndex = useMemo(() => buildAdmissionDocumentIndex(scopedAdmissionDocs), [scopedAdmissionDocs]);

  const evaluatedRows = useMemo(() => scopedAdmissionRows.map((row, index) => {
    const evaluation = evaluateAdmissionRequirement(row, latestSums, latestMockGrades);
    const rowDocs = admissionDocumentsForRow(admissionDocumentIndex, row);
    return {
      ...row,
      _index: index,
      evaluation,
      docs: rowDocs,
      guideDocs: rowDocs.filter(item => admissionDocumentType(item) === "guide"),
      reflectionDocs: rowDocs.filter(item => admissionDocumentType(item) === "reflection"),
      region: String(row.region || rowDocs[0]?.region || "미지정"),
      _fieldTags: admissionFieldTags(row),
    };
  }), [scopedAdmissionRows, latestSums, latestMockGrades, admissionDocumentIndex]);

  const caseIndexByUniversity = useMemo(() => {
    const map = new Map();
    (gdb.admissionCases || []).forEach(item => {
      const key = universityKey(item.universityNormalized || item.university);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return map;
  }, [gdb.admissionCases]);
  const caseLinkForRow = row => admissionCaseLinkForRow(caseIndexByUniversity, row);
  const favoriteActive = item => (favorites || []).some(value => favoriteSemanticKey(value) === favoriteSemanticKey(item));
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return evaluatedRows.filter(row => {
      const haystack = [
        row.university,
        row.admissionField,
        row.department,
        row.track,
        row.reflection,
        row.note,
        row.requiredSubjects,
        row.commonSubjectMethod,
        row.generalElectiveMethod,
        row.careerElectiveMethod,
        row.convergenceElectiveMethod,
      ].join(" ").toLowerCase();
      if (q && !haystack.includes(q)) return false;
      if (regionFilter !== "all" && String(row.region || "미지정") !== regionFilter) return false;
      if (fieldFilters.length && !fieldFilters.some(field => (row._fieldTags || []).includes(field))) return false;
      if (admissionViewMode === "mock") {
        if (requirementFilter === "none" && row.evaluation.status !== "no-minimum") return false;
        if (!["all", "none"].includes(requirementFilter) && Number(row.evaluation.count) !== Number(requirementFilter)) return false;
        if (statusFilter === "satisfied") return row.evaluation.status === "satisfied" || row.evaluation.status === "no-minimum";
        if (statusFilter === "unsatisfied") return row.evaluation.status === "unsatisfied";
        if (statusFilter === "review") return ["manual", "unavailable"].includes(row.evaluation.status);
      }
      return true;
    });
  }, [evaluatedRows, query, statusFilter, regionFilter, fieldFilters, requirementFilter, admissionViewMode]);

  const displayRows = useMemo(() => {
    const rows = filteredRows.slice();
    rows.sort((a, b) => (
      String(a.university || "").localeCompare(String(b.university || ""), "ko")
      || String(a.department || a.track || "").localeCompare(String(b.department || b.track || ""), "ko")
      || Number(a._index) - Number(b._index)
    ));
    return rows;
  }, [filteredRows]);

  const regionOptions = useMemo(() => Array.from(new Set([
    ...evaluatedRows.map(row => row.region || "미지정"),
    ...scopedAdmissionDocs.map(docItem => docItem.region || "미지정"),
  ])).filter(Boolean).sort((a, b) => a.localeCompare(b, "ko")), [evaluatedRows, scopedAdmissionDocs]);

  const statusCounts = useMemo(() => ({
    satisfied: evaluatedRows.filter(row => ["satisfied", "no-minimum"].includes(row.evaluation.status)).length,
    unsatisfied: evaluatedRows.filter(row => row.evaluation.status === "unsatisfied").length,
    review: evaluatedRows.filter(row => ["manual", "unavailable"].includes(row.evaluation.status)).length,
  }), [evaluatedRows]);

  const requirementCounts = useMemo(() => ({
    all: evaluatedRows.length,
    1: evaluatedRows.filter(row => Number(row.evaluation.count) === 1).length,
    2: evaluatedRows.filter(row => Number(row.evaluation.count) === 2).length,
    3: evaluatedRows.filter(row => Number(row.evaluation.count) === 3).length,
    4: evaluatedRows.filter(row => Number(row.evaluation.count) === 4).length,
    none: evaluatedRows.filter(row => row.evaluation.status === "no-minimum").length,
  }), [evaluatedRows]);

  const fieldCounts = useMemo(() => Object.fromEntries([
    ["all", evaluatedRows.length],
    ...ADMISSION_FIELD_FILTERS.map(field => [field, evaluatedRows.filter(row => (row._fieldTags || []).includes(field)).length]),
  ]), [evaluatedRows]);

  const curriculumMethodCounts = useMemo(() => {
    const uniqueUniversities = predicate => new Set(
      evaluatedRows.filter(predicate).map(row => universityKey(row.university)).filter(Boolean),
    ).size;
    const reflectsAchievement = value => ["achievement", "mixed"].includes(curriculumMethodMeta(value).key);
    const bySubjectType = Object.fromEntries(CURRICULUM_METHOD_FIELDS.map(([field, label]) => {
      const countByMethod = key => uniqueUniversities(row => curriculumMethodMeta(row[field]).key === key);
      return [field, {
        label,
        total: uniqueUniversities(row => normalizeCurriculumMethod(row[field]) !== "미입력"),
        rank: countByMethod("rank"),
        achievement: countByMethod("achievement"),
        mixed: countByMethod("mixed"),
        qualitative: countByMethod("qualitative"),
        excluded: countByMethod("excluded"),
      }];
    }));
    return {
      rank: uniqueUniversities(row => CURRICULUM_METHOD_FIELDS.some(([field]) => curriculumMethodMeta(row[field]).key === "rank")),
      achievementUniversities: uniqueUniversities(row => CURRICULUM_METHOD_FIELDS.some(([field]) => reflectsAchievement(row[field]))),
      careerAchievementUniversities: uniqueUniversities(row => reflectsAchievement(row.careerElectiveMethod)),
      convergenceAchievementUniversities: uniqueUniversities(row => reflectsAchievement(row.convergenceElectiveMethod)),
      mixed: uniqueUniversities(row => CURRICULUM_METHOD_FIELDS.some(([field]) => curriculumMethodMeta(row[field]).key === "mixed")),
      qualitative: uniqueUniversities(row => CURRICULUM_METHOD_FIELDS.some(([field]) => curriculumMethodMeta(row[field]).key === "qualitative")),
      excluded: uniqueUniversities(row => CURRICULUM_METHOD_FIELDS.some(([field]) => curriculumMethodMeta(row[field]).key === "excluded")),
      total: evaluatedRows.filter(row => (
        CURRICULUM_METHOD_FIELDS.some(([field]) => normalizeCurriculumMethod(row[field]) !== "미입력")
      )).length,
      bySubjectType,
    };
  }, [evaluatedRows]);

  const docsWithoutRows = useMemo(() => scopedAdmissionDocs.filter(docItem => {
    if (admissionDocumentType(docItem) === "reflection") return false;
    const key = docItem.id || docItem.url || docItem.dataKey || docItem.storagePath;
    return !evaluatedRows.some(row => (row.docs || []).some(item => (item.id || item.url || item.dataKey || item.storagePath) === key));
  }), [scopedAdmissionDocs, evaluatedRows]);
  const extraDocumentGroups = useMemo(() => {
    const groups = new Map();
    docsWithoutRows.forEach(docItem => {
      const key = universityDocumentKey(docItem?.university, docItem?.region);
      if (!groups.has(key)) groups.set(key, { university: docItem?.university || "", region: docItem?.region || "미지정", docs: [] });
      groups.get(key).docs.push(docItem);
    });
    return Array.from(groups.values()).map(group => ({
      ...group,
      cases: admissionCaseItemsForRow(caseIndexByUniversity, { university: group.university, region: group.region }),
    })).sort((a,b)=>String(a.university).localeCompare(String(b.university),"ko")||String(a.region).localeCompare(String(b.region),"ko"));
  }, [docsWithoutRows, caseIndexByUniversity]);

  return (
    <div className="admission-print-root">
      {(onBackToConsultation || focusUniversity) && <div className="no-print" style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:10,padding:"8px 10px",border:"1px solid #d9e1ed",borderRadius:10,background:"#f7f9fd"}}>
        {onBackToConsultation ? <button type="button" onClick={onBackToConsultation} style={{...btn.secondary,display:"inline-flex",alignItems:"center",gap:6}}><ArrowLeft size={14}/>상담·관심 대학으로</button> : <span/>}
        {focusUniversity && <button type="button" onClick={()=>{setQuery("");onClearFocus?.();}} style={{...btn.secondary,fontSize:10.5}}>연결 필터 해제 · {focusUniversity}</button>}
      </div>}
      <StudentIdentityBanner
        sid={sid}
        name={studentName}
        grade={inferredGrade}
        classNumber={inferredClass}
        number={inferredNumber}
        entryYear={entryYear}
        gradeSystem={gradeSystem}
        viewType="admission"
        actions={(
          <div className="no-print" style={admissionModeSwitch.darkBox} aria-label="입시전형 보기 방식">
            <button
              onClick={() => setAdmissionViewMode("mock")}
              style={{ ...admissionModeSwitch.darkButton, ...(admissionViewMode === "mock" ? admissionModeSwitch.darkActive : {}) }}
            >수능 최저 기준</button>
            <button
              onClick={() => setAdmissionViewMode("school")}
              style={{ ...admissionModeSwitch.darkButton, ...(admissionViewMode === "school" ? admissionModeSwitch.darkActive : {}) }}
            >내신 반영 방식</button>
            <button type="button" onClick={() => window.print()} style={admissionModeSwitch.printButton} title="브라우저 인쇄 창에서 PDF로 저장할 수 있습니다."><Printer size={12} /> 인쇄·PDF</button>
          </div>
        )}
      />

      <div style={{ ...card, ...admissionHero.card }}>
        <div style={admissionHero.headerRow}>
          <div style={admissionHero.heading}>
            <SectionHeading
              title={admissionViewMode === "mock" ? "대학별 수능 최저 확인" : "대학별 내신 반영 방식"}
              description={admissionViewMode === "mock"
                ? (latestMockKey
                  ? `${mockCalendarLabel(latestMockKey, entryYear)} 모의고사의 1합·2합·3합·4합으로 대학별 수능 최저 충족 여부를 판정합니다.`
                  : "모의고사 성적이 등록되면 대학별 수능 최저 충족 여부를 자동으로 판정합니다.")
                : "공통과목·일반선택·진로선택·융합선택을 대학이 석차등급, 성취도, 정성평가 중 어떤 방식으로 반영하는지 비교합니다."}
            />
          </div>
        </div>
        <div style={admissionHero.content}>
          {admissionViewMode === "mock" ? (
            <>
              <MockSumCards sums={latestSums} />
              <div style={admissionSummary.grid}>
                <div style={{ ...admissionSummary.card, ...admissionSummary.success }}><b>{statusCounts.satisfied}</b><span>충족·최저 없음</span></div>
                <div style={{ ...admissionSummary.card, ...admissionSummary.danger }}><b>{statusCounts.unsatisfied}</b><span>미충족</span></div>
                <div style={{ ...admissionSummary.card, ...admissionSummary.neutral }}><b>{statusCounts.review}</b><span>별도 확인</span></div>
              </div>
            </>
          ) : (
            <>
              <div style={curriculumTypeSummary.wrap}>
                <div style={curriculumTypeSummary.headingRow}>
                  <strong style={curriculumTypeSummary.heading}>과목 유형별 반영 대학 수</strong>
                  <span style={curriculumTypeSummary.caption}>같은 대학도 과목 유형에 따라 반영 방식이 다를 수 있습니다.</span>
                </div>
                <div style={curriculumTypeSummary.grid}>
                  {CURRICULUM_METHOD_FIELDS.map(([field, label]) => {
                    const counts = curriculumMethodCounts.bySubjectType?.[field] || {};
                    const meta = CURRICULUM_TYPE_SUMMARY_META[field] || CURRICULUM_TYPE_SUMMARY_META.commonSubjectMethod;
                    return (
                      <div key={field} style={{ ...curriculumTypeSummary.card, borderTopColor: meta.accent, background: meta.background }}>
                        <div style={curriculumTypeSummary.cardHeader}>
                          <span style={{ ...curriculumTypeSummary.typeBadge, color: meta.color, background: meta.badge, borderColor: meta.border }}>{label}</span>
                          <span style={curriculumTypeSummary.total}>반영 {counts.total || 0}개 대학</span>
                        </div>
                        <div style={curriculumTypeSummary.methodRows}>
                          {[
                            [["rank", "석차등급"], ["achievement", "성취도"], ["mixed", "석차＋성취"]],
                            [["qualitative", "정성평가"], ["excluded", "미반영"]],
                          ].map((group, groupIndex) => (
                            <div key={groupIndex} style={{ ...curriculumTypeSummary.methodRow, gridTemplateColumns: `repeat(${group.length}, minmax(0, 1fr))` }}>
                              {group.map(([key, methodLabel]) => (
                                <span key={key} style={curriculumTypeSummary.method}>
                                  <b style={curriculumTypeSummary.methodValue}>{counts[key] || 0}</b>
                                  <span style={curriculumTypeSummary.methodLabel}>{methodLabel}</span>
                                </span>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <AchievementGuidancePanel analysis={achievementAnalysis} universityCounts={curriculumMethodCounts} gradeSystem={gradeSystem} />
            </>
          )}
        </div>
      </div>

      <div style={card}>
        <SectionHeading
          title={admissionViewMode === "mock" ? "대학별 지원 가능성 진단" : "대학별 내신 반영 방식"}
          description={admissionViewMode === "mock"
            ? "최저 유형별로 대학을 나누어 볼 수 있습니다. (사·과)처럼 괄호로 묶인 과목은 두 과목 중 더 높은 등급(숫자가 작은 등급) 1개만 반영합니다."
            : "대학명순으로 정렬되며, 핵심 열 보기와 전체 열 보기를 전환해 비교할 수 있습니다."}
        />
        <div className="no-print" style={admissionToolbar.box}>
          <div style={admissionToolbar.primaryRow}>
            <div style={{ ...searchBox.box, width: 215, minWidth: 185 }}>
              <Search size={15} color="#a39d8c" />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="대학·학과 검색" style={searchBox.input} />
            </div>
            <div style={{ ...admissionToolbar.filterCluster, flex: "1 1 auto" }} aria-label="계열 선택">
              <span style={admissionToolbar.filterLabel}>계열</span>
              <div style={admissionToolbar.filterGroup}>
                {[["all", "전체"], ...ADMISSION_FIELD_FILTERS.map(field => [field, field])].map(([key, label]) => (
                  <button key={key} onClick={() => setFieldFilters(current => {
                    if (key === "all") return [];
                    return current.includes(key) ? current.filter(value => value !== key) : [...current, key];
                  })} style={{ ...fieldFilterButton.base, ...((key === "all" ? fieldFilters.length === 0 : fieldFilters.includes(key)) ? fieldFilterButton.active : {}) }}>
                    {label}<span style={fieldFilterButton.count}>{fieldCounts[key] || 0}</span>
                  </button>
                ))}
              </div>
            </div>
            <div style={admissionToolbar.filterCluster}>
              <span style={admissionToolbar.filterLabel}>지역</span>
              <select value={regionFilter} onChange={event => setRegionFilter(event.target.value)} style={{ ...selectStyle, minWidth: 92, paddingTop: 5, paddingBottom: 5 }} aria-label="지역 선택">
                <option value="all">전체 지역</option>
                {regionOptions.map(regionName => <option key={regionName} value={regionName}>{regionName}</option>)}
              </select>
            </div>
            <div style={admissionToolbar.filterCluster}>
              <span style={admissionToolbar.filterLabel}>표시</span>
              <div style={admissionToolbar.filterGroup}>
                <button type="button" onClick={() => setAdmissionTableView("focus")} style={{ ...btn.chip, ...(admissionTableView === "focus" ? btn.chipActive : {}) }}>핵심 열</button>
                <button type="button" onClick={() => setAdmissionTableView("full")} style={{ ...btn.chip, ...(admissionTableView === "full" ? btn.chipActive : {}) }}>전체 열</button>
              </div>
            </div>
          </div>
          {admissionViewMode === "mock" && (
            <div style={admissionToolbar.secondaryRow}>
              <div style={admissionToolbar.filterCluster}>
                <span style={admissionToolbar.filterLabel}>진단 결과</span>
                <div style={admissionToolbar.filterGroup}>
                  {[
                    ["all", "전체"],
                    ["satisfied", "충족"],
                    ["unsatisfied", "미충족"],
                    ["review", "별도 확인"],
                  ].map(([key, label]) => (
                    <button key={key} onClick={() => setStatusFilter(key)} style={{ ...btn.chip, ...(statusFilter === key ? btn.chipActive : {}) }}>{label}</button>
                  ))}
                </div>
              </div>
              <div style={{ ...admissionToolbar.filterCluster, flex: "1 1 auto" }}>
                <span style={admissionToolbar.filterLabel}>최저 유형</span>
                <div style={admissionToolbar.filterGroup}>
                  {[
                    ["all", "전체"],
                    ["1", "1합"],
                    ["2", "2합"],
                    ["3", "3합"],
                    ["4", "4합"],
                    ["none", "최저 없음"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setRequirementFilter(key)}
                      style={{ ...requirementFilterButton.base, ...(requirementFilter === key ? requirementFilterButton.active : {}) }}
                    >
                      {label}<span style={requirementFilterButton.count}>{requirementCounts[key] || 0}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {admissionViewMode === "school" && scopedAdmissionRows.length > 0 && curriculumMethodCounts.total === 0 && (
          <div style={curriculumDataWarning}>
            현재 저장된 전형 데이터에는 공통과목·선택과목 반영 방식이 없습니다. 관리자 화면에서 대입 전형표 엑셀을 다시 업로드하면 이 표에 자동 반영됩니다.
          </div>
        )}

        {!scopedAdmissionRows.length ? (
          <EmptyBox text="관리자가 대학별 입시전형표를 아직 등록하지 않았습니다." />
        ) : !displayRows.length ? (
          <div style={chartEmpty}>검색 조건에 맞는 전형이 없습니다.</div>
        ) : admissionViewMode === "mock" ? (
          <div style={{ ...table.scroll, overflowX: "visible" }}>
            <table style={{ ...admissionTable.base, width:"100%", tableLayout:"fixed", fontSize: admissionTableView === "full" ? 8.9 : 9.8, minWidth:0 }}>
              <colgroup>
                {admissionTableView === "focus" ? <>
                  <col style={{ width: "4%" }} /><col style={{ width: "12%" }} /><col style={{ width: "6%" }} /><col style={{ width: "6%" }} /><col style={{ width: "20%" }} /><col style={{ width: "12%" }} /><col style={{ width: "10%" }} /><col style={{ width: "10%" }} /><col style={{ width: "12%" }} /><col style={{ width: "8%" }} />
                </> : <>
                  <col style={{ width: "4%" }} /><col style={{ width: "9%" }} /><col style={{ width: "4.5%" }} /><col style={{ width: "4.5%" }} /><col style={{ width: "11%" }} /><col style={{ width: "9%" }} /><col style={{ width: "20%" }} /><col style={{ width: "9%" }} /><col style={{ width: "8%" }} /><col style={{ width: "7%" }} /><col style={{ width: "8%" }} /><col style={{ width: "6%" }} />
                </>}
              </colgroup>
              <thead>
                <tr>
                  <th style={{ ...admissionTable.th, ...admissionTable.favoriteHead }}>★</th>
                  <th style={{ ...admissionTable.th, ...admissionTable.stickyHead }}>대학교</th>
                  {admissionTableView === "focus" && <th style={admissionTable.th}>지역</th>}
                  {admissionTableView === "focus" && <th style={admissionTable.th}>계열</th>}
                  {admissionTableView === "full" && <th style={admissionTable.th}>지역</th>}
                  {admissionTableView === "full" && <th style={admissionTable.th}>계열</th>}
                  <th style={admissionTable.th}>모집단위 · 전형</th>
                  {admissionTableView === "full" && <th style={admissionTable.th}>교과 반영비율<br />반영방법</th>}
                  {admissionTableView === "full" && <th style={admissionTable.th}>전형 특이사항</th>}
                  <th style={admissionTable.th}>반영과목</th>
                  <th style={admissionTable.th}>대학 기준</th>
                  <th style={admissionTable.th}>현재 내 최저</th>
                  <th style={admissionTable.th}>진단 결과</th>
                  <th style={admissionTable.th}>모집요강</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map(row => {
                  const result = row.evaluation;
                  const statusMeta = admissionStatusMeta(result.status);
                  const reflection = admissionReflectionText(row);
                  const specialNote = admissionSpecialNote(row, reflection);
                  const subjectRuleText = admissionSubjectRuleText(row.requiredSubjects);
                  const hasMinimum = result.status !== "no-minimum" && result.count && result.threshold != null;
                  const caseLink = caseLinkForRow(row);
                  return (
                    <tr key={`${row.university}-${row._index}`}>
                      <td style={{ ...admissionTable.td, ...admissionTable.favoriteCell }}>{onToggleFavorite&&<button type="button" style={{...admissionTable.starButton,...(favoriteActive({source:"admission",university:row.university,region:row.region,department:row.department,admissionType:row.track})?admissionTable.starButtonActive:{})}} onClick={()=>onToggleFavorite({source:"admission",favoriteKind:"전형",university:row.university,department:row.department,admissionType:row.track,region:row.region,field:(row._fieldTags||[]).join(", "),label:`${row.university} ${row.department||row.track||""}`})} title="상담·관심 대학에 저장"><Star size={13} fill="currentColor"/></button>}</td>
                      <td style={{ ...admissionTable.td, ...admissionTable.university }}><div style={admissionTable.universityWrap}><span>{row.university}</span>{caseLink.count>0&&(onOpenCases?<button type="button" style={admissionTable.caseLink} title={`${caseLink.label} 사례 ${caseLink.count}건을 엽니다.`} onClick={()=>onOpenCases(caseLink.university,caseLink.department,caseLink.admissionType)}>{caseLink.label} {caseLink.count}건</button>:<span style={admissionTable.caseBadge} title={`${caseLink.label} 사례 ${caseLink.count}건`}>{caseLink.label} {caseLink.count}건</span>)}</div></td>
                      {admissionTableView === "focus" && <td style={{ ...admissionTable.td, ...admissionTable.regionCell }}><span style={regionBadge}>{(row.region || "미지정") !== "미지정" && <MapPin size={9} />}{row.region || "미지정"}</span></td>}
                      {admissionTableView === "focus" && <td style={{ ...admissionTable.td, ...admissionTable.fieldCell }}><AdmissionFieldBadges tags={row._fieldTags} /></td>}
                      {admissionTableView === "full" && <td style={{ ...admissionTable.td, ...admissionTable.regionCell }}><span style={regionBadge}>{(row.region || "미지정") !== "미지정" && <MapPin size={9} />}{row.region || "미지정"}</span></td>}
                      {admissionTableView === "full" && <td style={{ ...admissionTable.td, ...admissionTable.fieldCell }}><AdmissionFieldBadges tags={row._fieldTags} /></td>}
                      <td style={{ ...admissionTable.td, ...admissionTable.department }}><AdmissionDetailText department={row.department} track={row.track} /></td>
                      {admissionTableView === "full" && <td style={{ ...admissionTable.td, ...admissionTable.reflectionCell }}>{reflection ? <AdmissionReflectionBadge value={reflection} /> : <span style={admissionTable.empty}>-</span>}</td>}
                      {admissionTableView === "full" && <td style={{ ...admissionTable.td, ...admissionTable.text, ...admissionTable.noteCell }}>{specialNote ? <AdmissionSpecialNote value={specialNote} /> : <span style={admissionTable.empty}>-</span>}</td>}
                      <td style={{ ...admissionTable.td, ...admissionTable.subjectCell }}>
                        {result.status === "no-minimum" || !subjectRuleText
                          ? <span style={admissionTable.empty}>-</span>
                          : <AdmissionSubjectRule value={row.requiredSubjects} />}
                      </td>
                      <td style={admissionTable.td}>
                        {result.status === "no-minimum" ? (
                          <span style={noMinimumBadge}>최저 없음</span>
                        ) : hasMinimum ? (
                          <span style={{ ...minimumBadge, ...(result.ruleType === "each" ? eachMinimumBadge : {}) }}>{admissionMinimumText(result)}</span>
                        ) : (
                          <span style={admissionTable.empty}>요강 확인</span>
                        )}
                      </td>
                      <td style={admissionTable.td}>
                        {!admissionStudentResultText(result)
                          ? <span style={admissionTable.empty}>-</span>
                          : <span style={{ ...studentSumBadge, ...(result.ruleType === "each" ? eachStudentBadge : {}) }}>{admissionStudentResultText(result)}</span>}
                      </td>
                      <td style={{ ...admissionTable.td, ...admissionTable.statusCell }}><span style={{ ...admissionStatus.base, ...statusMeta.style }}>{statusMeta.label}</span></td>
                      <td style={admissionTable.td}>
                        {row.guideDocs.length ? (
                          <div style={{ display: "flex", justifyContent: "center", gap: 4, flexWrap: "wrap" }}>
                            {row.guideDocs.map(docItem => <PdfLink key={docItem.id || docItem.url} docItem={docItem} compact />)}
                          </div>
                        ) : <span style={admissionTable.empty}>미등록</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ ...table.scroll, overflowX: "visible" }}>
            <table style={{ ...admissionTable.base, width:"100%", tableLayout:"fixed", fontSize: admissionTableView === "full" ? 8.9 : 9.7, minWidth:0 }}>
              <colgroup>
                {admissionTableView === "focus" ? <>
                  <col style={{ width: "4%" }} /><col style={{ width: "12%" }} /><col style={{ width: "5%" }} /><col style={{ width: "5%" }} /><col style={{ width: "16%" }} /><col style={{ width: "9%" }} /><col style={{ width: "9%" }} /><col style={{ width: "9%" }} /><col style={{ width: "9%" }} /><col style={{ width: "16%" }} /><col style={{ width: "6%" }} />
                </> : <>
                  <col style={{ width: "4%" }} /><col style={{ width: "9%" }} /><col style={{ width: "4.5%" }} /><col style={{ width: "4.5%" }} /><col style={{ width: "11%" }} /><col style={{ width: "7%" }} /><col style={{ width: "7%" }} /><col style={{ width: "7%" }} /><col style={{ width: "7%" }} /><col style={{ width: "11%" }} /><col style={{ width: "22%" }} /><col style={{ width: "6%" }} />
                </>}
              </colgroup>
              <thead>
                <tr>
                  <th style={{ ...admissionTable.th, ...admissionTable.favoriteHead }}>★</th>
                  <th style={{ ...admissionTable.th, ...admissionTable.stickyHead }}>대학교</th>
                  {admissionTableView === "focus" && <th style={admissionTable.th}>지역</th>}
                  {admissionTableView === "focus" && <th style={admissionTable.th}>계열</th>}
                  {admissionTableView === "full" && <th style={admissionTable.th}>지역</th>}
                  {admissionTableView === "full" && <th style={admissionTable.th}>계열</th>}
                  <th style={admissionTable.th}>모집단위 · 전형</th>
                  <th style={admissionTable.th}>공통과목</th>
                  <th style={admissionTable.th}>일반선택</th>
                  <th style={admissionTable.th}>진로선택</th>
                  <th style={admissionTable.th}>융합선택</th>
                  <th style={admissionTable.th}>교과 반영비율</th>
                  {admissionTableView === "full" && <th style={admissionTable.th}>전형 특이사항</th>}
                  <th style={admissionTable.th}>반영표 확인</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map(row => {
                  const reflection = admissionReflectionText(row);
                  const specialNote = admissionSpecialNote(row, reflection);
                  const caseLink = caseLinkForRow(row);
                  return (
                    <tr key={`school-${row.university}-${row._index}`}>
                      <td style={{ ...admissionTable.td, ...admissionTable.favoriteCell }}>{onToggleFavorite&&<button type="button" style={{...admissionTable.starButton,...(favoriteActive({source:"admission",university:row.university,region:row.region,department:row.department,admissionType:row.track})?admissionTable.starButtonActive:{})}} onClick={()=>onToggleFavorite({source:"admission",favoriteKind:"전형",university:row.university,department:row.department,admissionType:row.track,region:row.region,field:(row._fieldTags||[]).join(", "),label:`${row.university} ${row.department||row.track||""}`})} title="상담·관심 대학에 저장"><Star size={13} fill="currentColor"/></button>}</td>
                      <td style={{ ...admissionTable.td, ...admissionTable.university }}><div style={admissionTable.universityWrap}><span>{row.university}</span>{caseLink.count>0&&(onOpenCases?<button type="button" style={admissionTable.caseLink} title={`${caseLink.label} 사례 ${caseLink.count}건을 엽니다.`} onClick={()=>onOpenCases(caseLink.university,caseLink.department,caseLink.admissionType)}>{caseLink.label} {caseLink.count}건</button>:<span style={admissionTable.caseBadge} title={`${caseLink.label} 사례 ${caseLink.count}건`}>{caseLink.label} {caseLink.count}건</span>)}</div></td>
                      {admissionTableView === "focus" && <td style={{ ...admissionTable.td, ...admissionTable.regionCell }}><span style={regionBadge}>{(row.region || "미지정") !== "미지정" && <MapPin size={9} />}{row.region || "미지정"}</span></td>}
                      {admissionTableView === "focus" && <td style={{ ...admissionTable.td, ...admissionTable.fieldCell }}><AdmissionFieldBadges tags={row._fieldTags} /></td>}
                      {admissionTableView === "full" && <td style={{ ...admissionTable.td, ...admissionTable.regionCell }}><span style={regionBadge}>{(row.region || "미지정") !== "미지정" && <MapPin size={9} />}{row.region || "미지정"}</span></td>}
                      {admissionTableView === "full" && <td style={{ ...admissionTable.td, ...admissionTable.fieldCell }}><AdmissionFieldBadges tags={row._fieldTags} /></td>}
                      <td style={{ ...admissionTable.td, ...admissionTable.department }}><AdmissionDetailText department={row.department} track={row.track} /></td>
                      <td style={admissionTable.curriculumCell}><CurriculumMethodBadge value={row.commonSubjectMethod} /></td>
                      <td style={admissionTable.curriculumCell}><CurriculumMethodBadge value={row.generalElectiveMethod} /></td>
                      <td style={admissionTable.curriculumCell}><CurriculumMethodBadge value={row.careerElectiveMethod} /></td>
                      <td style={admissionTable.curriculumCell}><CurriculumMethodBadge value={row.convergenceElectiveMethod} /></td>
                      <td style={{ ...admissionTable.td, ...admissionTable.reflectionCell }}>
                        {reflection ? <AdmissionReflectionBadge value={reflection} /> : <span style={admissionTable.empty}>-</span>}
                      </td>
                      {admissionTableView === "full" && <td style={{ ...admissionTable.td, ...admissionTable.text, ...admissionTable.noteCell }}>{specialNote ? <AdmissionSpecialNote value={specialNote} /> : <span style={admissionTable.empty}>-</span>}</td>}
                      <td style={admissionTable.td}>
                        {row.reflectionDocs.length ? (
                          <div style={{ display: "flex", justifyContent: "center", gap: 4, flexWrap: "wrap" }}>
                            {row.reflectionDocs.map(docItem => <PdfLink key={docItem.id || docItem.url} docItem={docItem} compact />)}
                          </div>
                        ) : <span style={admissionTable.empty}>미등록</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {extraDocumentGroups.length > 0 && (
        <div style={card}>
          <SectionHeading title={`추가 대학 자료 · ${inferredGrade}학년`} description="현재 학년 전형표에는 없지만 관리자가 별도로 등록한 자료입니다. 광덕고 과거 사례가 있으면 같은 캠퍼스 기준으로 연결합니다." />
          <div style={admissionDocs.tableWrap}>
            <table className="admission-extra-docs-table" style={{...admissionDocs.table,minWidth:0}}>
              <colgroup><col style={{width:"22%"}}/><col style={{width:"12%"}}/><col style={{width:"28%"}}/><col style={{width:"18%"}}/><col style={{width:"20%"}}/></colgroup>
              <thead><tr>{["대학교","지역·캠퍼스","등록 자료","광덕고 사례","바로가기"].map(label=><th key={label} style={admissionTable.th}>{label}</th>)}</tr></thead>
              <tbody>{extraDocumentGroups.map(group => <tr key={universityDocumentKey(group.university,group.region)}>
                <td style={admissionTable.td}><b style={admissionDocs.university}>{group.university}</b><div style={{fontSize:9.5,color:"#7b8390",marginTop:3}}>{inferredGrade}학년 자료</div></td>
                <td style={admissionTable.td}><span style={regionBadge}>{group.region || "미지정"}</span>{admissionCampusLabel(group.university,group.region) && <div style={{fontSize:9.5,color:"#516b8f",fontWeight:850,marginTop:4}}>{admissionCampusLabel(group.university,group.region)}캠퍼스</div>}</td>
                <td style={admissionTable.td}><div style={{display:"flex",justifyContent:"center",gap:5,flexWrap:"wrap"}}>{group.docs.map(docItem => <PdfLink key={docItem.id || docItem.url || docItem.dataKey} docItem={docItem} compact />)}</div></td>
                <td style={admissionTable.td}>{group.cases.length ? <button type="button" onClick={()=>onOpenCases?.(admissionCaseFocusUniversity({university:group.university,region:group.region}),"","")} style={{...btn.secondary,padding:"6px 9px",fontSize:10.5,color:"#2f5d91",borderColor:"#c8d8ec"}}>사례 {group.cases.length}건</button> : <span style={admissionTable.empty}>사례 없음</span>}</td>
                <td style={admissionTable.td}>{group.cases.length ? <button type="button" onClick={()=>onOpenCases?.(admissionCaseFocusUniversity({university:group.university,region:group.region}),"","")} style={{...btn.link,fontSize:10.5}}>광덕고 사례 연결</button> : <span style={admissionTable.empty}>자료만 등록</span>}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function admissionStatusMeta(status) {
  const map = {
    satisfied: { label: "충족", style: admissionStatus.success },
    unsatisfied: { label: "미충족", style: admissionStatus.danger },
    "no-minimum": { label: "최저 없음", style: admissionStatus.noMinimum },
    manual: { label: "조건 확인", style: admissionStatus.warning },
    unavailable: { label: "성적 미입력", style: admissionStatus.neutral },
  };
  return map[status] || { label: "판정 불가", style: admissionStatus.neutral };
}

function PdfLink({ docItem, compact = false }) {
  const [opening, setOpening] = useState(false);
  const reflection = admissionDocumentType(docItem) === "reflection";
  const fallback = reflection ? "교과 반영표" : "모집요강";
  const label = compact ? (reflection ? "반영표" : "요강") : (docItem.label || docItem.year || `${fallback} 보기`);
  const style = { ...pdfLinkStyle, ...(compact ? pdfLinkCompactStyle : {}), border: 0, cursor: "pointer" };
  const openDocument = async event => {
    event?.preventDefault?.();
    if (opening) return;
    if (docItem.dataKey) {
      setOpening(true);
      try {
        const blob = await readAdmissionDocument(docItem.dataKey);
        const objectUrl = URL.createObjectURL(blob);
        window.open(objectUrl, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(objectUrl), 120000);
      } catch (error) {
        window.alert(`모집요강 파일을 열지 못했습니다. (${error?.message || error})`);
      } finally { setOpening(false); }
      return;
    }
    if (docItem.url) window.open(docItem.url, "_blank", "noopener,noreferrer");
  };
  return (
    <button type="button" onClick={openDocument} style={style} title={docItem.fileName || docItem.label || fallback}>
      {opening ? <Loader2 size={compact ? 11 : 13} className="spin" /> : <FileText size={compact ? 11 : 13} />} {label} <ExternalLink size={compact ? 9 : 11} />
    </button>
  );
}

function StudentIdentityBanner({ sid, name, grade, classNumber, number, entryYear, gradeSystem, viewType = "grades", actions = null }) {
  const location = [
    grade != null ? `${grade}학년` : null,
    classNumber != null ? `${Number(classNumber)}반` : null,
    number != null ? `${Number(number)}번` : null,
  ].filter(Boolean).join(" ");
  const admissionView = viewType === "admission";
  const favoritesView = viewType === "favorites";

  return (
    <div className="student-identity-banner" style={{ ...studentBanner.box, ...(admissionView || favoritesView ? studentBanner.admissionBox : {}) }}>
      <div className="student-identity-top" style={studentBanner.topRow}>
        <div className="student-identity-main" style={studentBanner.main}>
          <div className="student-identity-eyebrow" style={{ ...studentBanner.eyebrow, ...(admissionView ? studentBanner.admissionEyebrow : {}) }}>{favoritesView ? "학생 상담·관심 대학" : admissionView ? "학생 대학 지원 진단" : "학생 성적 리포트"}</div>
          <div className="student-identity-title-row" style={studentBanner.titleRow}>
            <span className="student-identity-name" style={studentBanner.identity}>{sid}{name ? ` ${name}` : ""}</span>
            <span className="student-identity-tag" style={{ ...studentBanner.titleTag, ...(admissionView ? studentBanner.admissionTitleTag : favoritesView ? studentBanner.favoritesTitleTag : studentBanner.gradeTitleTag) }}>{favoritesView ? "상담 기록" : admissionView ? "대학 지원" : "성적 분석"}</span>
          </div>
          <div className="student-identity-subtitle" style={studentBanner.subtitle}>{favoritesView ? "상담 기록과 저장한 대학·학과의 지원 기준·광덕고 사례를 함께 확인합니다." : admissionView ? "현재 성적과 대학별 지원 기준을 비교한 상담용 진단입니다." : "학기별 내신 성적과 성취도 흐름을 확인합니다."}</div>
          <div className="student-identity-badges" style={studentBanner.badges}>
            {location && <span style={studentBanner.badge}>{location}</span>}
            <span style={studentBanner.badge}>{entryYear}학년도 입학생</span>
            <span style={{ ...studentBanner.badge, ...studentBanner.gradeBadge, ...(admissionView ? studentBanner.admissionGradeBadge : {}) }}>{gradeSystem}등급제</span>
          </div>
        </div>
        {actions && <div style={studentBanner.actions}>{actions}</div>}
      </div>
    </div>
  );
}
function SectionHeading({ title, description }) {
  return (
    <div className="section-heading" style={{ marginBottom: 12 }}>
      <div className="section-heading-title" style={{ fontWeight: 800, fontSize: 15, color: "#2b2620" }}>{title}</div>
      {description && <div className="section-heading-description" style={{ fontSize: 11.8, color: "#8a8578", marginTop: 4, lineHeight: 1.5 }}>{description}</div>}
    </div>
  );
}

function AverageTable({ names, groups, displaySemesterKeys, entryYear, gradeScale, categoryRows = false }) {
  const averages = names
    .map(name => gradeScale === 9 ? groups[name]?.avg9 : groups[name]?.avg5)
    .filter(value => asNumber(value) != null);
  const bestAverage = averages.length ? Math.min(...averages) : null;

  return (
    <div style={table.scroll}>
      <table style={table.base}>
        <thead>
          <tr>
            <th style={table.th}>구분</th>
            {displaySemesterKeys.map(key => (
              <th key={key} style={table.th}>{semesterCalendarLabel(key, entryYear)}</th>
            ))}
            <th style={{ ...table.th, ...table.averageTh }}>전체 평균</th>
          </tr>
        </thead>
        <tbody>
          {names.map(name => (
            <GradeAverageRow
              key={name}
              name={name}
              group={groups[name]}
              displaySemesterKeys={displaySemesterKeys}
              gradeScale={gradeScale}
              categoryRow={categoryRows}
              bestAverage={bestAverage}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GradeAverageRow({ name, group, displaySemesterKeys, gradeScale, categoryRow = false, bestAverage = null }) {
  const semesterField = gradeScale === 9 ? "perSemester9" : "perSemester5";
  const averageField = gradeScale === 9 ? "avg9" : "avg5";
  const average = group?.[averageField] ?? null;
  const categoryStyle = categoryRow ? (CATEGORY_META[name] || CATEGORY_META.기타) : null;
  const isBest = average != null && bestAverage != null && average === bestAverage;

  return (
    <tr style={categoryStyle ? { background: categoryStyle.row } : undefined}>
      <td style={{
        ...table.tdLabel,
        textAlign: "center",
        whiteSpace: "normal",
        ...(categoryStyle ? { background: categoryStyle.background, color: categoryStyle.color, borderLeft: `5px solid ${categoryStyle.color}` } : {}),
      }}>
        {categoryStyle ? (
          <CategoryBadge category={name} showLabel />
        ) : (
          <span style={combinationLabel}>{name}</span>
        )}
      </td>
      {displaySemesterKeys.map(key => {
        const value = group?.[semesterField]?.[SEMESTER_KEYS.indexOf(key)] ?? null;
        return (
          <td key={key} style={table.td}>
            {value == null ? "-" : <span style={{ ...metricPill, ...gradeValueStyle(value, gradeScale) }}>{value}</span>}
          </td>
        );
      })}
      <td style={{ ...table.td, ...table.averageTd, ...(isBest ? table.bestAverageTd : {}) }}>
        {average == null ? "-" : (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ ...metricPill, ...gradeValueStyle(average, gradeScale), fontWeight: 900 }}>{average}</span>
            {isBest && <span style={bestBadge}>★ 최우수</span>}
          </div>
        )}
      </td>
    </tr>
  );
}

function GradeScaleSelector({ value, onChange, method = "legacy", onMethodChange, betaGroup = "전교과", onBetaGroupChange, betaStatus = "idle" }) {
  const betaActive = value === 9 && method === "statistical";
  const betaMessage = betaStatus === "loading"
    ? "수시NAVI 통계 변환표를 불러오는 중입니다."
    : betaStatus === "empty"
      ? "관리자에 반영된 수시NAVI 통계 변환표가 없어 값을 표시할 수 없습니다."
      : betaStatus === "error"
        ? "통계 변환표를 불러오지 못했습니다. 기존 환산을 사용하거나 다시 접속해주세요."
        : "53,149명 일반고 통계 기반 추정값이며 대학별 공식 환산등급은 아닙니다.";
  return (
    <div style={gradeScaleSelector.box}>
      <div style={gradeScaleSelector.topRow}>
        <div>
          <div style={gradeScaleSelector.title}>내신 등급 기준</div>
          <div style={gradeScaleSelector.description}>평균표와 내신 추이 그래프에 적용할 기준을 선택합니다. 과목별 성적표의 9등급 환산 열은 기존 2n-1 방식을 유지합니다.</div>
        </div>
        <div style={gradeScaleSelector.buttons}>
          <button
            onClick={() => onChange(5)}
            style={{ ...gradeScaleSelector.button, ...(value === 5 ? gradeScaleSelector.active : {}) }}
          >
            5등급제 원등급
          </button>
          <button
            onClick={() => { onChange(9); onMethodChange?.("legacy"); }}
            style={{ ...gradeScaleSelector.button, ...(value === 9 && method === "legacy" ? gradeScaleSelector.active : {}) }}
          >
            기존 9등급 환산
          </button>
          <button
            onClick={() => { onChange(9); onMethodChange?.("statistical"); }}
            style={{ ...gradeScaleSelector.button, ...gradeScaleSelector.betaButton, ...(betaActive ? gradeScaleSelector.betaActive : {}) }}
          >
            통계 Beta 9등급
          </button>
        </div>
      </div>
      {betaActive && <div style={gradeScaleSelector.betaPanel}>
        <label style={gradeScaleSelector.betaLabel}><span>통계 교과 조합</span><select value={betaGroup} onChange={event => onBetaGroupChange?.(event.target.value)} style={gradeScaleSelector.betaSelect}>{REPORT_BETA_GROUPS.map(group => <option key={group}>{group}</option>)}</select></label>
        <div style={{ ...gradeScaleSelector.betaNotice, ...(["empty", "error"].includes(betaStatus) ? gradeScaleSelector.betaWarning : {}) }}>{betaMessage}</div>
      </div>}
    </div>
  );
}

function CategoryBadge({ category, showLabel = false }) {
  const key = CATEGORY_META[category] ? category : resolveCategoryKey(category, category);
  const meta = CATEGORY_META[key] || CATEGORY_META.기타;
  const label = showLabel ? meta.label : meta.short;
  const parts = String(label).split("/");
  return (
    <span style={{ ...categoryBadgeBase, background: meta.background, color: meta.color, border: `1px solid ${meta.color}33` }}>
      {parts.length > 1 ? <>{parts[0]}/<br />{parts.slice(1).join("/")}</> : label}
    </span>
  );
}

function CourseTypeBadge({ meta }) {
  const resolved = meta || SUBJECT_TYPE_META.기타;
  return (
    <span
      style={{
        ...courseTypeBadge.base,
        color: resolved.color,
        background: resolved.background,
        borderColor: resolved.border,
      }}
      title={resolved.type || "과목유형 미분류"}
    >
      {resolved.short || "기타"}
    </span>
  );
}

function TrendTabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ ...btn.tab, ...(active ? btn.tabActive : {}) }}>
      {children}
    </button>
  );
}

function MockSumCards({ sums }) {
  return (
    <div style={mockSum.grid}>
      {[
        ["2합", sums.sum2],
        ["3합", sums.sum3],
        ["4합", sums.sum4],
      ].map(([label, value]) => (
        <div key={label} style={mockSum.card}>
          <div style={mockSum.label}>{label}</div>
          <div style={mockSum.value}>{value ?? "-"}</div>
          <div style={mockSum.caption}>최적 등급 합</div>
        </div>
      ))}
    </div>
  );
}

function GradeTrendChart({ title, xLabels, series, maxGrade, emptyText }) {
  const width = 960;
  const height = 372;
  const margin = { top: 38, right: 54, bottom: 88, left: 58 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const labels = xLabels || [];
  const usableSeries = (series || []).filter(item => item.values?.some(value => asNumber(value) != null));
  const palette = ["#315a9b", "#9a4254", "#5d4898", "#8a641d", "#356b49", "#2f7770", "#2b2620"];

  if (!labels.length || !usableSeries.length) {
    return <div style={chartEmpty}>{emptyText || "그래프로 표시할 성적이 없습니다."}</div>;
  }

  const xAt = index => labels.length === 1
    ? margin.left + plotWidth / 2
    : margin.left + (plotWidth * index) / (labels.length - 1);
  const yAt = value => margin.top + ((value - 1) / Math.max(1, maxGrade - 1)) * plotHeight;
  const buildPath = values => {
    let path = "";
    let drawing = false;
    values.forEach((rawValue, index) => {
      const value = asNumber(rawValue);
      if (value == null) {
        drawing = false;
        return;
      }
      path += `${drawing ? " L" : "M"} ${xAt(index)} ${yAt(value)}`;
      drawing = true;
    });
    return path;
  };

  return (
    <div style={chart.box}>
      <div style={chart.title}>{title}</div>
      <div style={chart.legend}>
        {usableSeries.map((item, index) => {
          const color = item.color || palette[index % palette.length];
          return (
            <div key={item.name} style={{ ...chart.legendItem, color, fontWeight: 800 }}>
              <span style={{ ...chart.legendLine, background: color }} />
              <span>{item.name}</span>
            </div>
          );
        })}
        <span style={chart.hint}>※ 위쪽(1등급)에 가까울수록 우수</span>
      </div>
      <div style={{ width: "100%", overflowX: "auto" }}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} style={{ width: "100%", minWidth: 620, display: "block" }}>
          {maxGrade >= 2 && (
            <g>
              <rect
                x={margin.left}
                y={yAt(1)}
                width={plotWidth}
                height={Math.max(1, yAt(2) - yAt(1))}
                fill="#f0f8f2"
              />
              <text x={width - margin.right - 8} y={yAt(1) + 14} textAnchor="end" fontSize="10" fill="#568064">우수 구간</text>
            </g>
          )}

          {Array.from({ length: maxGrade }, (_, index) => index + 1).map(grade => {
            const y = yAt(grade);
            return (
              <g key={grade}>
                <line x1={margin.left} y1={y} x2={width - margin.right} y2={y} stroke={grade === 1 ? "#bcd8c4" : "#e9e5da"} strokeWidth={grade === 1 ? "1.5" : "1"} />
                <text x={margin.left - 12} y={y + 4} textAnchor="end" fontSize="11" fontWeight={grade === 1 ? "800" : "500"} fill={grade === 1 ? "#356b49" : "#8a8578"}>{grade}</text>
              </g>
            );
          })}
          <text x="15" y={margin.top + plotHeight / 2} transform={`rotate(-90 15 ${margin.top + plotHeight / 2})`} textAnchor="middle" fontSize="11" fill="#8a8578">등급</text>

          {labels.map((label, index) => {
            const parts=String(label||"").split("·").map(item=>item.trim()).filter(Boolean);
            const anchor=index===0?"start":index===labels.length-1?"end":"middle";
            const x=index===0?xAt(index)-2:index===labels.length-1?xAt(index)+2:xAt(index);
            return (
              <g key={`${label}-${index}`}>
                <line x1={xAt(index)} y1={margin.top} x2={xAt(index)} y2={margin.top + plotHeight} stroke="#f2efe7" strokeWidth="1" />
                <text x={x} y={height - 43} textAnchor={anchor} fontSize="10.5" fill="#716b5f" fontWeight="650">
                  <tspan x={x} dy="0">{parts[0]||label}</tspan>
                  {parts.length>1&&<tspan x={x} dy="15">{parts.slice(1).join(" · ")}</tspan>}
                </text>
              </g>
            );
          })}

          {usableSeries.map((item, seriesIndex) => {
            const color = item.color || palette[seriesIndex % palette.length];
            return (
              <g key={item.name}>
                <path
                  d={buildPath(item.values)}
                  fill="none"
                  stroke={color}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {item.values.map((rawValue, index) => {
                  const value = asNumber(rawValue);
                  if (value == null) return null;
                  const labelY = Math.max(16, yAt(value) - 13);
                  return (
                    <g key={`${item.name}-${index}`}>
                      <circle cx={xAt(index)} cy={yAt(value)} r="5" fill="#fff" stroke={color} strokeWidth="3">
                        <title>{`${item.name} · ${labels[index]} · ${value}등급`}</title>
                      </circle>
                      {item.showLabels && (
                        <g>
                          <rect x={xAt(index) - 18} y={labelY - 12} width="36" height="19" rx="9.5" fill={color} opacity="0.96" />
                          <text x={xAt(index)} y={labelY + 1} textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#fff">{value}</text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}


/* ============================================================
   관리자/선생님: 학생 학번으로 성적 조회
   ============================================================ */
function StudentLookup({
  roster,
  gdb,
  homeroomClass,
  isAdmin,
  initialView = "grades",
  selectedSid,
  onSelectedSidChange,
  sharedQuery,
  onSharedQueryChange,
  showViewTabs = true,
  hideSearch = false,
  favorites = [],
  onToggleFavorite,
  focusUniversity = "",
  onOpenCases,
  onBackToConsultation,
  onClearFocus,
}) {
  const [localQuery, setLocalQuery] = useState("");
  const [localSid, setLocalSid] = useState(null);
  const [view, setView] = useState(initialView);

  const controlledSid = selectedSid !== undefined;
  const controlledQuery = sharedQuery !== undefined;
  const sid = controlledSid ? selectedSid : localSid;
  const query = controlledQuery ? sharedQuery : localQuery;

  const updateSid = value => {
    if (controlledSid) onSelectedSidChange?.(value);
    else setLocalSid(value);
  };
  const updateQuery = value => {
    if (controlledQuery) onSharedQueryChange?.(value);
    else setLocalQuery(value);
  };

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    const exactId = query.trim();
    if (!sid && exactId && roster?.[exactId]) updateSid(exactId);
  }, [query, sid, roster]); // eslint-disable-line

  const candidates = useMemo(() => {
    let entries = Object.entries(roster || {});
    if (!isAdmin && homeroomClass) entries = entries.filter(([, student]) => String(student.class) === String(homeroomClass));
    if (!query.trim()) return [];
    const q = query.trim();
    return entries.filter(([id, student]) => id.includes(q) || (student.name || "").includes(q)).slice(0, 8);
  }, [query, roster, isAdmin, homeroomClass]);

  const chooseStudent = id => {
    updateQuery(id);
    updateSid(id);
    setView(initialView);
  };

  return (
    <div>
      {!isAdmin && homeroomClass && <div style={{ fontSize: 12, color: "#8a8578", marginBottom: 10 }}>담당 반({homeroomClass}반) 학생만 조회할 수 있습니다.</div>}
      {!hideSearch && <div style={searchBox.box}>
        <Search size={16} color="#a39d8c" />
        <input
          value={query}
          onChange={event => {
            const nextValue = event.target.value;
            updateQuery(nextValue);
            const trimmed = nextValue.trim();
            if (!/^\d{5}$/.test(trimmed) && trimmed !== String(sid || "")) updateSid(null);
            setView(initialView);
          }}
          placeholder="학번 또는 이름으로 검색"
          style={searchBox.input}
        />
      </div>}
      {!hideSearch && candidates.length > 0 && !sid && (
        <div style={searchBox.list}>
          {candidates.map(([id, student]) => (
            <button key={id} style={searchBox.item} onClick={() => chooseStudent(id)}>
              <span style={{ fontWeight: 600 }}>{student.name}</span>
              <span style={{ color: "#a39d8c", fontSize: 11.5 }}>{student.class}반 {student.number}번 · {id}</span>
            </button>
          ))}
        </div>
      )}
      {sid && (
        <div style={{ marginTop: 16 }}>
          {showViewTabs && (
            <div style={lookupTabs.box}>
              <button onClick={() => setView("grades")} style={{ ...lookupTabs.button, ...(view === "grades" ? lookupTabs.active : {}) }}>성적 리포트</button>
              <button onClick={() => setView("admission")} style={{ ...lookupTabs.button, ...(view === "admission" ? lookupTabs.active : {}) }}>대학 지원 진단</button>
            </div>
          )}
          {view === "grades"
            ? <StudentGradeReport key={`${sid}-grades`} sid={sid} gdb={gdb} mode="grades" studentInfo={roster?.[sid]} />
             : <StudentAdmissionView key={`${sid}-admission`} sid={sid} gdb={gdb} studentInfo={roster?.[sid]} favorites={favorites} onToggleFavorite={onToggleFavorite} focusUniversity={focusUniversity} onOpenCases={onOpenCases} onBackToConsultation={onBackToConsultation} onClearFocus={onClearFocus} />}
        </div>
      )}
    </div>
  );
}


function studentViewIdentityMeta({ sid, gdb, studentInfo }) {
  const semesterCandidates = SEMESTER_KEYS.map(key => gdb.semesterData?.[key]?.students?.[sid] || null).filter(Boolean);
  const latestSemesterRecord = semesterCandidates.slice().reverse()[0] || null;
  const metaRecord = Array.isArray(gdb.studentAccounts)
    ? gdb.studentAccounts.find(student => String(student.id) === String(sid))
    : gdb.studentAccounts?.[sid];
  const entryYear = inferEntryYear({ studentInfo, metaRecord, sid, latestSemesterRecord, cohortSettings: gdb.cohortSettings });
  const grade = asNumber(studentInfo?.grade) ?? asNumber(String(sid).charAt(0)) ?? 1;
  const gradeSystem = entryYear >= 2025 ? 5 : 9;
  return {
    latestSemesterRecord,
    metaRecord,
    entryYear,
    grade,
    gradeSystem,
    name: studentInfo?.name || latestSemesterRecord?.name || metaRecord?.name || "",
    classNumber: studentInfo?.class ?? latestSemesterRecord?.class ?? metaRecord?.class,
    number: studentInfo?.number ?? latestSemesterRecord?.number ?? metaRecord?.number,
  };
}

function favoriteCategory(item) {
  if (["대학", "학과", "전형"].includes(item?.favoriteKind)) return item.favoriteKind;
  if (item?.source === "admission") return "전형";
  const department = String(item?.department || "").trim();
  const admissionType = String(item?.admissionType || "").trim();
  if (department && !["전체", "대학 전체"].includes(department)) return "학과";
  if (admissionType) return "전형";
  return "대학";
}
function favoriteCaseAdmissionType(item) {
  const value = String(item?.admissionType || "").trim();
  return /수시\s*NAVI|수시나비|Beta/i.test(value) ? "" : value;
}

function favoriteNaviCutRows(betaData, university, region = "", department = "", admissionType = "") {
  const targetUniversity = universityKey(university);
  const targetCampus = admissionCampusLabel(university, region);
  const targetDepartment = normalizeAdmissionLookupKey(department);
  const targetType = normalizeAdmissionLookupKey(favoriteCaseAdmissionType({ admissionType }));
  if (!targetUniversity || !targetDepartment) return [];
  const records = (betaData?.records || []).filter(row => {
    if (universityKey(row?.[3]) !== targetUniversity) return false;
    const rowCampus = admissionCampusLabel(row?.[3], row?.[1]);
    if (targetCampus && rowCampus && targetCampus !== rowCampus) return false;
    const unit = normalizeAdmissionLookupKey(row?.[5] || row?.[4]);
    return Boolean(unit && (unit === targetDepartment || unit.includes(targetDepartment) || targetDepartment.includes(unit)));
  });
  const rows = [];
  records.forEach(row => {
    [["교과", row?.[7] || []], ["종합", row?.[8] || []]].forEach(([kind, items]) => {
      items.forEach(item => {
        const typeName = String(item?.[0] || kind);
        const normalizedType = normalizeAdmissionLookupKey(typeName);
        const cut50 = asNumber(item?.[1]);
        const cut70 = asNumber(item?.[2]);
        if (cut50 == null && cut70 == null) return;
        rows.push({
          kind,
          name: typeName,
          normalizedType,
          cut50,
          cut70,
          department: row?.[5] || department,
        });
      });
    });
  });
  const preferredRows = targetType
    ? rows.filter(item => item.normalizedType && (item.normalizedType.includes(targetType) || targetType.includes(item.normalizedType)))
    : rows;
  const sourceRows = preferredRows.length ? preferredRows : rows;
  const seen = new Set();
  return sourceRows.filter(item => {
    const key = `${item.kind}|${normalizeAdmissionLookupKey(item.name)}|${item.cut50 ?? ""}|${item.cut70 ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function naviCutText(item) {
  if (!item) return "";
  const c50 = item.cut50 == null ? "-" : Math.round(item.cut50 * 100) / 100;
  const c70 = item.cut70 == null ? "-" : Math.round(item.cut70 * 100) / 100;
  return `${item.kind} · 50% ${c50} · 70% ${c70}`;
}


function formatStoredFileSize(size) {
  const value = Number(size || 0);
  if (!value) return "";
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10}KB`;
  return `${Math.round(value / 1024 / 102.4) / 10}MB`;
}

function printCounselingHistory(options = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const includeNotes = options.notes !== false;
  const includeFavorites = Boolean(options.favorites);
  const paper = String(options.paper || "A4").toUpperCase() === "B4" ? "B4" : "A4";
  if (!includeNotes && !includeFavorites) return;
  const source = document.querySelector(".counseling-print-root");
  if (!source) return;

  // 메인 앱 DOM을 숨긴 채 window.print()를 호출하면 브라우저/프린트 미리보기 시점에 따라
  // 복제 노드가 사라져 빈 페이지가 되는 경우가 있었습니다. 인쇄 문서를 전용 iframe에
  // 완전히 격리해 상담 화면의 현재 렌더 상태와 관계없이 안정적으로 출력합니다.
  const clone = source.cloneNode(true);
  clone.classList.add("counseling-print-root-clone");
  clone.querySelectorAll(".no-print,button").forEach(node => node.remove());
  if (!includeNotes) clone.querySelectorAll(".counseling-print-notes").forEach(node => node.remove());
  if (!includeFavorites) clone.querySelectorAll(".counseling-print-favorites").forEach(node => node.remove());

  const frame = document.createElement("iframe");
  frame.setAttribute("title", "상담 기록 인쇄");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = `position:fixed;left:-12000px;top:0;width:${paper === "B4" ? "250mm" : "210mm"};height:${paper === "B4" ? "353mm" : "297mm"};border:0;background:#fff;pointer-events:none;`;
  document.body.appendChild(frame);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try { frame.remove(); } catch { /* already removed */ }
  };
  const printWindow = frame.contentWindow;
  const printDocument = frame.contentDocument || printWindow?.document;
  if (!printWindow || !printDocument) { cleanup(); return; }

  try {
    printDocument.open();
    const counselingPrintCss = COUNSELING_PRINT_CSS.replace("@page{size:A4 portrait;margin:9mm 9mm 10mm}", `@page{size:${paper} portrait;margin:${paper === "B4" ? "11mm 12mm 12mm" : "9mm 9mm 10mm"}}`);
    printDocument.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>상담 기록</title><style>${counselingPrintCss}</style></head><body class="print-counseling-history ${paper === "B4" ? "counseling-paper-b4" : ""}">${clone.outerHTML}</body></html>`);
    printDocument.close();
  } catch { cleanup(); return; }

  printWindow.addEventListener("afterprint", cleanup, { once: true });
  const startPrint = () => {
    if (cleaned) return;
    try {
      printWindow.focus();
      printWindow.print();
    } catch { cleanup(); }
  };
  let printScheduled = false;
  const waitForLayout = () => {
    if (printScheduled || cleaned) return;
    printScheduled = true;
    const fontsReady = printDocument.fonts?.ready || Promise.resolve();
    Promise.resolve(fontsReady).catch(() => null).finally(() => {
      printWindow.requestAnimationFrame(() => printWindow.requestAnimationFrame(() => printWindow.setTimeout(startPrint, 80)));
    });
  };
  frame.addEventListener("load", waitForLayout, { once: true });
  // about:blank → document.write 전환에서 load 이벤트가 매우 빨리 지나가는 브라우저도 있어 타이머를 안전망으로 둡니다.
  window.setTimeout(waitForLayout, 60);

  // 미리보기에서 오래 머무르는 경우에도 문서가 중간에 삭제되지 않도록 여유 있게 정리합니다.
  window.setTimeout(cleanup, 5 * 60 * 1000);
}

const COUNSELING_PRINT_CSS = `
.counseling-print-root-clone{display:none}
.counseling-print-option-overlay{position:fixed;inset:0;z-index:1500;display:grid;place-items:center;padding:20px;background:rgba(24,34,49,.42);backdrop-filter:blur(3px)}
.counseling-print-option-modal{width:min(470px,100%);overflow:hidden;border:1px solid #d6e0ec;border-radius:16px;background:#fff;box-shadow:0 22px 60px rgba(29,43,61,.22);font-family:"Pretendard","Noto Sans KR","Malgun Gothic",sans-serif}
.counseling-print-option-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 17px 12px;border-bottom:1px solid #e6ebf1}.counseling-print-option-head b{display:block;font-size:15px;color:#263b56}.counseling-print-option-head span{display:block;margin-top:4px;font-size:10.5px;line-height:1.5;color:#758397}.counseling-print-option-head button{display:grid;place-items:center;width:30px;height:30px;border:1px solid #d9e1ea;border-radius:8px;background:#fff;color:#64748a;cursor:pointer}
.counseling-print-option-body{display:grid;gap:8px;padding:13px 17px}.counseling-print-option-body label{display:grid;grid-template-columns:auto minmax(0,1fr);gap:9px;align-items:start;padding:11px 12px;border:1px solid #dce4ed;border-radius:11px;background:#fafbfd;cursor:pointer}.counseling-print-option-body label.is-disabled{opacity:.48;cursor:not-allowed}.counseling-print-option-body input{margin-top:2px}.counseling-print-option-body b{display:block;font-size:12px;color:#344c68}.counseling-print-option-body span{display:block;margin-top:3px;font-size:10px;line-height:1.45;color:#7b899a}
.counseling-print-paper-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 11px;border:1px solid #dce4ed;border-radius:11px;background:#f7f9fc}.counseling-print-paper-row>span>b{display:block;font-size:11.5px;color:#344c68}.counseling-print-paper-row>span>small{display:block;margin-top:3px;font-size:9.5px;color:#7b899a}.counseling-print-paper-row>div{display:flex;gap:5px}.counseling-print-paper-row button{min-width:48px;border:1px solid #d1dbe7;border-radius:8px;padding:7px 9px;background:#fff;color:#62748a;font-size:10.5px;font-weight:900;cursor:pointer}.counseling-print-paper-row button.is-active{background:#315f95;border-color:#315f95;color:#fff}
.counseling-print-option-actions{display:flex;justify-content:flex-end;gap:7px;padding:12px 17px 16px;border-top:1px solid #edf1f5}.counseling-print-option-actions button{border:1px solid #cfdae6;border-radius:9px;padding:8px 11px;background:#fff;color:#546a82;font-size:11px;font-weight:900;cursor:pointer}.counseling-print-option-actions button.primary{background:#315f95;border-color:#315f95;color:#fff}.counseling-print-option-actions button:disabled{opacity:.45;cursor:not-allowed}
@media print {
  @page{size:A4 portrait;margin:9mm 9mm 10mm}
  html,body{background:#fff!important}
  body.print-counseling-history #root{display:none!important}
  body.print-counseling-history>.counseling-print-root-clone{
    display:grid!important;gap:3mm!important;width:100%!important;max-width:none!important;margin:0!important;padding:0!important;
    color:#1f2d3d!important;background:#fff!important;
    font-family:"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",Arial,sans-serif!important;
    font-size:9pt!important;line-height:1.42!important;letter-spacing:-.01em!important;
    -webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;
  }
  body.print-counseling-history.counseling-paper-b4>.counseling-print-root-clone{font-size:9.6pt!important;gap:4mm!important}
  body.print-counseling-history.counseling-paper-b4>.counseling-print-root-clone .counseling-print-note{padding:3.5mm!important}
  body.print-counseling-history.counseling-paper-b4>.counseling-print-root-clone .counseling-print-favorites{font-size:9.2pt!important}
  body.print-counseling-history>.counseling-print-root-clone *,
  body.print-counseling-history>.counseling-print-root-clone *::before,
  body.print-counseling-history>.counseling-print-root-clone *::after{box-sizing:border-box!important;font-family:inherit!important}
  body.print-counseling-history>.counseling-print-root-clone .no-print,
  body.print-counseling-history>.counseling-print-root-clone button{display:none!important}
  body.print-counseling-history>.counseling-print-root-clone [style*="box-shadow"]{box-shadow:none!important}

  /* 학생 정보: 웹 배너 대신 문서 헤더처럼 단순화 */
  .counseling-print-root-clone .counseling-print-student-banner{margin:0!important}
  .counseling-print-root-clone .student-identity-banner{padding:0 0 3mm!important;border:0!important;border-bottom:1.4pt solid #315f95!important;border-radius:0!important;background:#fff!important;box-shadow:none!important}
  .counseling-print-root-clone .student-identity-eyebrow{font-size:7.5pt!important;color:#60738b!important;letter-spacing:.03em!important}
  .counseling-print-root-clone .student-identity-title-row{margin-top:.8mm!important;gap:2mm!important}
  .counseling-print-root-clone .student-identity-name{font-size:14pt!important;line-height:1.12!important;color:#173654!important;font-weight:900!important}
  .counseling-print-root-clone .student-identity-tag{font-size:7.5pt!important;padding:1mm 2mm!important;border-radius:99px!important}
  .counseling-print-root-clone .student-identity-subtitle{display:none!important}
  .counseling-print-root-clone .student-identity-badges{margin-top:1.4mm!important;gap:1.4mm!important}
  .counseling-print-root-clone .student-identity-badges>span{font-size:7.2pt!important;padding:.8mm 1.7mm!important;line-height:1.1!important}

  /* 공통 섹션 */
  .counseling-print-root-clone .section-heading{margin:0 0 2mm!important}
  .counseling-print-root-clone .section-heading-title{font-size:10.5pt!important;line-height:1.2!important;color:#243b57!important;font-weight:900!important}
  .counseling-print-root-clone .section-heading-description{margin-top:.8mm!important;font-size:7pt!important;line-height:1.4!important;color:#6f7e90!important}
  .counseling-print-root-clone .counseling-print-notes{padding:3mm!important;border:1px solid #d7e0ea!important;border-radius:2mm!important;background:#fff!important;gap:2mm!important}
  .counseling-print-root-clone .counseling-print-note{padding:2.3mm 2.6mm!important;border:1px solid #dce3eb!important;border-radius:1.5mm!important;background:#fff!important;break-inside:avoid!important;page-break-inside:avoid!important}
  .counseling-print-root-clone .counseling-print-note p{margin:1.2mm 0 0!important}
  .counseling-print-root-clone .counseling-print-note-text{font-size:8.3pt!important;line-height:1.5!important;color:#293a4d!important;white-space:pre-wrap!important}

  /* 관심 대학: 인쇄용 밀도와 줄바꿈을 별도로 최적화 */
  .counseling-print-root-clone .counseling-print-favorites>div{gap:0!important}
  .counseling-print-root-clone .favorite-print-section{padding:3mm!important;border:1px solid #d7e0ea!important;border-radius:2mm!important;background:#fff!important;box-shadow:none!important;gap:2.2mm!important}
  .counseling-print-root-clone .favorite-print-grid{display:grid!important;grid-template-columns:1fr!important;gap:3mm!important}
  .counseling-print-root-clone .favorite-print-card{padding:3mm!important;border:1px solid #cfd9e5!important;border-radius:2mm!important;background:#fff!important;box-shadow:none!important;gap:2mm!important;break-inside:avoid!important;page-break-inside:avoid!important;overflow:visible!important}
  .counseling-print-root-clone .favorite-print-header{display:block!important;margin:0!important}
  .counseling-print-root-clone .favorite-print-university{font-size:11.2pt!important;line-height:1.25!important;color:#1d334e!important;font-weight:900!important;word-break:keep-all!important;overflow-wrap:anywhere!important}
  .counseling-print-root-clone .favorite-print-count{display:block!important;margin-top:.5mm!important;font-size:7pt!important;color:#728096!important}
  .counseling-print-root-clone .favorite-print-source-grid{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:2mm!important;align-items:stretch!important}
  .counseling-print-root-clone .favorite-print-source-box{min-height:0!important;padding:2.3mm!important;border-radius:1.5mm!important;border:1px solid #d9e2ec!important;background:#f8fafc!important;gap:1mm!important;overflow:visible!important}
  .counseling-print-root-clone .favorite-print-source-navi{grid-column:1/-1!important;background:#f3f7fc!important;border-color:#cbd9e8!important}
  .counseling-print-root-clone .favorite-print-source-label{font-size:7pt!important;line-height:1.2!important;font-weight:900!important;color:#5b6d82!important}
  .counseling-print-root-clone .favorite-print-source-box>b{font-size:9pt!important;line-height:1.3!important;color:#22364e!important;word-break:keep-all!important;overflow-wrap:anywhere!important}
  .counseling-print-root-clone .favorite-print-source-box span{font-size:7.4pt!important;line-height:1.35!important}
  .counseling-print-root-clone .favorite-print-source-box small{font-size:6.7pt!important;line-height:1.3!important}
  .counseling-print-root-clone .favorite-print-source-box [style*="grid-template-columns: repeat(2"]{gap:1.2mm!important}
  .counseling-print-root-clone .favorite-print-source-box [style*="background: rgb(255, 255, 255)"],
  .counseling-print-root-clone .favorite-print-source-box [style*="background: #fff"]{padding:1.6mm!important}
  .counseling-print-root-clone .favorite-print-navi-cut-list{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:1.2mm!important}
  .counseling-print-root-clone .favorite-print-navi-cut-pill{padding:1.25mm 1.45mm!important;border-radius:1.2mm!important;background:#fff!important;border:1px solid #d4dfeb!important;gap:.35mm!important;min-width:0!important}
  .counseling-print-root-clone .favorite-print-navi-cut-pill>small{font-size:6.1pt!important;line-height:1.2!important;color:#64758a!important;word-break:keep-all!important;overflow-wrap:anywhere!important}
  .counseling-print-root-clone .favorite-print-navi-cut-pill>b{font-size:6.35pt!important;line-height:1.28!important;color:#244c78!important;font-weight:850!important;word-break:keep-all!important;overflow-wrap:anywhere!important}
  .counseling-print-root-clone .favorite-print-items{display:grid!important;gap:1.2mm!important;padding-top:1.2mm!important;border-top:1px solid #e2e8ef!important}
  .counseling-print-root-clone .favorite-print-item{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:.7mm!important;padding:1.7mm 2mm!important;border-radius:1.3mm!important;background:#fff!important;border:1px solid #e0e6ed!important;break-inside:avoid!important}
  .counseling-print-root-clone .favorite-print-item>svg{display:none!important}
  .counseling-print-root-clone .favorite-print-item-text{display:flex!important;align-items:center!important;gap:1.2mm!important;flex-wrap:wrap!important;font-size:7.7pt!important;line-height:1.35!important;min-width:0!important}
  .counseling-print-root-clone .favorite-print-kind{font-size:6.2pt!important;padding:.7mm 1.2mm!important;flex:0 0 auto!important}
  .counseling-print-root-clone .favorite-print-item-text>b{font-size:8.2pt!important;color:#253950!important;word-break:keep-all!important;overflow-wrap:anywhere!important}
  .counseling-print-root-clone .favorite-print-item-text>small{font-size:6.8pt!important;color:#758296!important}
  .counseling-print-root-clone .favorite-print-item-navi-cuts{display:flex!important;align-items:center!important;gap:1mm!important;flex-wrap:wrap!important;margin:0!important;min-width:0!important}
  .counseling-print-root-clone .favorite-print-item-navi-cuts em{font-size:6pt!important;color:#315f91!important}
  .counseling-print-root-clone .favorite-print-item-navi-cuts small{font-size:5.9pt!important;line-height:1.22!important;padding:.55mm 1mm!important;white-space:normal!important;word-break:keep-all!important}

  /* 페이지 나눔 시 카드가 찢어지지 않도록 */
  .counseling-print-root-clone article,.counseling-print-root-clone .favorite-print-source-box{break-inside:avoid!important;page-break-inside:avoid!important}
}
`;

function CounselingAttachmentList({ attachments = [] }) {
  const [opening, setOpening] = useState("");
  const openAttachment = async (file, index) => {
    const key = file.dataKey || `${file.fileName}-${index}`;
    if (file.dataKey) {
      setOpening(key);
      try {
        const stored = await readStorage(file.dataKey, null);
        if (!stored?.dataUrl) throw new Error("첨부파일을 찾지 못했습니다.");
        const anchor = document.createElement("a");
        anchor.href = stored.dataUrl;
        anchor.download = file.fileName || stored.fileName || "상담첨부";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally { setOpening(""); }
      return;
    }
    if (file.url) window.open(file.url, "_blank", "noopener,noreferrer");
  };
  if (!attachments.length) return null;
  return <div style={consultationView.attachmentList}>{attachments.map((file,index)=>{const key=file.dataKey||file.path||file.url||`${file.fileName}-${index}`;return <button key={key} type="button" onClick={()=>openAttachment(file,index)} style={consultationView.attachmentLink}><span style={{display:"inline-flex",alignItems:"center",gap:5}}>{opening===key?<Loader2 size={12} className="spin"/>:<Download size={12}/>}<b>{file.fileName||"첨부파일"}</b></span><small>{formatStoredFileSize(file.size)}</small></button>})}</div>;
}

function StudentFavoritesView({ sid, gdb, studentInfo, favorites = [], onToggleFavorite, onOpenAdmission, onOpenCases, onOpenSusiNavi, hideBanner = false }) {
  const identity = studentViewIdentityMeta({ sid, gdb, studentInfo });
  const [favoriteFilter, setFavoriteFilter] = useState("전체");
  const [favoriteNaviData, setFavoriteNaviData] = useState(null);
  useEffect(() => {
    let active = true;
    loadSusiNaviBetaData().then(value => { if (active) setFavoriteNaviData(value || null); }).catch(() => { if (active) setFavoriteNaviData(null); });
    return () => { active = false; };
  }, []);
  const categoryCounts = useMemo(() => {
    const counts = {전체:(favorites||[]).length,대학:0,학과:0,전형:0};
    (favorites||[]).forEach(item => { const key=favoriteCategory(item); counts[key]=(counts[key]||0)+1; });
    return counts;
  }, [favorites]);
  const visibleFavorites = useMemo(() => favoriteFilter === "전체" ? (favorites || []) : (favorites || []).filter(item => favoriteCategory(item) === favoriteFilter), [favorites, favoriteFilter]);
  const favoriteCaseIndex = useMemo(() => {
    const map = new Map();
    (gdb.admissionCases || []).forEach(item => {
      const key = universityKey(item.universityNormalized || item.university);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return map;
  }, [gdb.admissionCases]);
  const favoriteAdmissionRows = useMemo(
    () => admissionItemsForGrade(gdb.admissionRows || [], identity.grade),
    [gdb.admissionRows, identity.grade],
  );
  const groups = useMemo(() => {
    const byBase = new Map();
    visibleFavorites.forEach(item => {
      const base = universityKey(item.university);
      if (!base) return;
      if (!byBase.has(base)) byBase.set(base, []);
      byBase.get(base).push(item);
    });
    const groups = [];
    byBase.forEach(items => {
      const knownCampuses = Array.from(new Set(items.map(item => favoriteCampusForItem(item)).filter(Boolean)));
      const map = new Map();
      items.forEach(item => {
        let campus = favoriteCampusForItem(item);
        if (!campus && knownCampuses.length === 1) campus = knownCampuses[0];
        const key = `${universityKey(item.university)}|${campus || "공통"}`;
        if (!map.has(key)) map.set(key, { university: item.university, region: item.region || "미지정", campus, items: [] });
        map.get(key).items.push(item);
      });
      groups.push(...map.values());
    });
    return groups.sort((a,b)=>a.university.localeCompare(b.university,"ko"));
  }, [visibleFavorites]);

  const favoriteContent = !(favorites || []).length
    ? <EmptyBox text="아직 저장한 관심 대학·학과가 없습니다. 대학 지원 진단 또는 광덕고 대입 결과의 별 아이콘을 눌러 저장하세요." />
    : <div className="favorite-print-section" style={card}>
        <SectionHeading title="관심 대학·학과" description="저장한 대학·학과를 대학 지원 진단, 광덕고 대입 사례, 2027 수시NAVI Beta와 같은 대학·캠퍼스 기준으로 연결합니다." />
        <div className="no-print" style={favoriteView.filters}>{["전체","대학","학과","전형"].map(value=><button key={value} type="button" onClick={()=>setFavoriteFilter(value)} style={{...favoriteView.filterButton,...(favoriteFilter===value?favoriteView.filterActive:{})}}>{value}<span>{categoryCounts[value]||0}</span></button>)}</div>
        {!groups.length ? <div style={favoriteView.filteredEmpty}>선택한 분류에 저장된 관심 항목이 없습니다.</div> : <div className="favorite-print-grid" style={favoriteView.grid}>{groups.map(group=>{
          const baseKey = universityKey(group.university);
          const baseAdmissions = favoriteAdmissionRows.filter(row => universityKey(row.university) === baseKey);
          const baseCases = favoriteCaseIndex.get(baseKey) || [];
          const storedCampus = group.campus || admissionCampusLabel(group.university, group.region);
          const favoriteDepartments = group.items.map(item => normalizeAdmissionLookupKey(item.department)).filter(value => value && !["전체","대학전체"].includes(value));
          const favoriteTypes = group.items.map(item => normalizeAdmissionLookupKey(favoriteCaseAdmissionType(item))).filter(Boolean);
          const contextualCases = baseCases.filter(caseRow => {
            const department = normalizeAdmissionLookupKey(caseRow.department);
            const type = normalizeAdmissionLookupKey(`${caseRow.admissionType || ""}${caseRow.detailType || ""}`);
            const departmentMatched = !favoriteDepartments.length || favoriteDepartments.some(value => department.includes(value) || value.includes(department));
            const typeMatched = !favoriteTypes.length || favoriteTypes.some(value => type.includes(value) || value.includes(type));
            return departmentMatched && typeMatched;
          });
          const contextualCampuses = Array.from(new Set(contextualCases.map(admissionCaseCampusForItem).filter(Boolean)));
          const admissionCampuses = Array.from(new Set(baseAdmissions.map(row => admissionCampusLabel(row.university, row.region)).filter(Boolean)));
          const resolvedCampus = storedCampus
            || (contextualCampuses.length === 1 ? contextualCampuses[0] : "")
            || (admissionCampuses.includes("서울") ? "서울" : (admissionCampuses.length === 1 ? admissionCampuses[0] : ""));
          const resolvedUniversity = resolvedCampus ? universityNameWithCampus(group.university, resolvedCampus) : group.university;
          const resolvedRegion = resolvedCampus ? regionForAdmissionCampus(resolvedUniversity, resolvedCampus, group.region || "미지정") : group.region;
          const admissions=favoriteAdmissionRows.filter(row=>universityDocumentKey(row.university,row.region)===universityDocumentKey(resolvedUniversity,resolvedRegion));
          const cases=admissionCaseItemsForRow(favoriteCaseIndex,{university:resolvedUniversity,region:resolvedRegion});
          const accepted=cases.filter(row=>row.finalResult==="합격");
          const cutValues=accepted.map(row=>asNumber(row.universityGrade??row.overallGrade)).filter(value=>value!=null).sort((a,b)=>a-b);
          const cut50=cutValues.length?(cutValues.length%2?cutValues[(cutValues.length-1)/2]:(cutValues[cutValues.length/2-1]+cutValues[cutValues.length/2])/2):null;
          const groupNaviCuts = group.items.flatMap(item => favoriteNaviCutRows(
            favoriteNaviData,
            resolvedUniversity,
            resolvedRegion,
            item.department || "",
            item.admissionType || "",
          ).map(cut => ({ ...cut, favoriteDepartment: item.department || "" })));
          const uniqueGroupNaviCuts = Array.from(new Map(groupNaviCuts.map(item => [`${item.favoriteDepartment}|${item.kind}|${item.name}|${item.cut50}|${item.cut70}`, item])).values());
          return <article className="favorite-print-card" key={`${group.university}-${resolvedCampus || "common"}`} style={favoriteView.card}>
            <div className="favorite-print-header" style={favoriteView.header}><div style={{display:"grid",gap:3,minWidth:0}}><b className="favorite-print-university" style={favoriteView.universityTitle}>{resolvedUniversity}</b><span className="favorite-print-count" style={favoriteView.universityCount}>{group.items.length}개 관심 항목</span></div><div className="no-print" style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>{onOpenAdmission&&<button type="button" style={favoriteView.link} onClick={()=>onOpenAdmission(resolvedUniversity)}>지원 진단 <ExternalLink size={12}/></button>}{onOpenCases&&<button type="button" style={favoriteView.link} onClick={()=>{const target=group.items.length===1?group.items[0]:null;onOpenCases(resolvedUniversity,target?.department||"",favoriteCaseAdmissionType(target))}}>{group.items.length===1&&group.items[0]?.department?"저장 학과 사례":"광덕고 사례"} <ExternalLink size={12}/></button>}{onOpenSusiNavi&&<button type="button" style={favoriteView.link} onClick={()=>{const target=group.items.length===1?group.items[0]:null;onOpenSusiNavi(resolvedUniversity,target?.department||"")}}>수시NAVI Beta <ExternalLink size={12}/></button>}</div></div>
            <div className="favorite-print-source-grid" style={favoriteView.sourceGrid}>
              <div className="favorite-print-source-box favorite-print-source-admission" style={favoriteView.sourceBox}><small className="favorite-print-source-label" style={favoriteView.sourceLabel}>대학 지원 진단</small><b style={favoriteView.sourceValue}>{admissions.length}개 전형</b><span style={favoriteView.sourceDetail}>{admissions.slice(0,3).map(row=>row.department||row.track).filter(Boolean).join(" · ")||"연결 자료 없음"}</span></div>
              <div className="favorite-print-source-box favorite-print-source-cases" style={favoriteView.sourceBox}><small className="favorite-print-source-label" style={favoriteView.sourceLabel}>광덕고 대입 사례</small><div style={favoriteView.sourceHeadline}><span>지원 <b>{cases.length}건</b></span><span>합격 <b>{accepted.length}건</b></span></div>{cases.length?<div style={favoriteView.sourceMetrics}><span style={favoriteView.sourceMetric}><small>합격자 50%컷</small><b>{cut50==null?"-":Math.round(cut50*100)/100}</b></span><span style={favoriteView.sourceMetric}><small>합격 사례 비율</small><b>{Math.round(accepted.length/cases.length*1000)/10}%</b></span></div>:<span style={favoriteView.sourceDetail}>연결 사례 없음</span>}</div>
              <div className="favorite-print-source-box favorite-print-source-navi" style={{...favoriteView.sourceBox,background:"#f4f8fd",borderColor:"#cfdceb"}}><small className="favorite-print-source-label" style={{...favoriteView.sourceLabel,color:"#315f91"}}>2027 수시NAVI Beta</small>{uniqueGroupNaviCuts.length?<><b style={favoriteView.sourceValue}>저장 학과 NAVI 컷 연결</b><div className="favorite-print-navi-cut-list" style={favoriteView.naviCutList}>{uniqueGroupNaviCuts.slice(0,3).map((cut,index)=><span className="favorite-print-navi-cut-pill" key={`${cut.favoriteDepartment}-${cut.kind}-${cut.name}-${index}`} style={favoriteView.naviCutPill}><small>{cut.favoriteDepartment||cut.department}</small><b>{naviCutText(cut)}</b></span>)}</div>{uniqueGroupNaviCuts.length>3&&<span style={favoriteView.sourceDetail}>외 {uniqueGroupNaviCuts.length-3}개 전형 컷은 NAVI에서 확인합니다.</span>}</>:<><b style={favoriteView.sourceValue}>교육청 모집단위 검색</b><span style={favoriteView.sourceDetail}>{group.items.some(item=>item.department)?"저장 학과와 일치하는 2026 공개 50·70%컷을 찾지 못했습니다.":"학과를 즐겨찾기하면 NAVI 50·70%컷을 함께 표시합니다."}</span></>}{onOpenSusiNavi&&<button type="button" className="no-print" style={{...favoriteView.itemLink,justifySelf:"start"}} onClick={()=>{const target=group.items.length===1?group.items[0]:null;onOpenSusiNavi(resolvedUniversity,target?.department||"")}}>NAVI에서 열기 <ExternalLink size={10}/></button>}</div>
            </div>
            <div className="favorite-print-items" style={favoriteView.items}>{group.items.map(item=>{
              const itemNaviCuts = favoriteNaviCutRows(favoriteNaviData,resolvedUniversity,resolvedRegion,item.department||"",item.admissionType||"").slice(0,3);
              return <div className="favorite-print-item" key={item.id} style={favoriteView.item}><Star size={13} fill="#ffd84d" color="#b58a00"/><span className="favorite-print-item-text" style={favoriteView.itemText}><span className="favorite-print-kind" style={favoriteView.kindBadge}>{item.favoriteKind==="개별사례"?"개별":favoriteCategory(item)}</span><b>{item.department||"대학 전체"}</b>{item.admissionType&&<small>{item.admissionType}</small>}{item.department&&<span className="favorite-print-item-navi-cuts" style={favoriteView.itemNaviCuts}>{itemNaviCuts.length?<><em style={{fontStyle:"normal",fontWeight:950,color:"#315f91"}}>NAVI 컷</em>{itemNaviCuts.map((cut,index)=><small key={`${cut.kind}-${cut.name}-${index}`} style={{padding:"2px 6px",borderRadius:999,background:"#edf4fc",color:"#315f91",fontWeight:850}}>{naviCutText(cut)}</small>)}</>:<small style={{color:"#8a94a2"}}>NAVI 공개컷 연결 없음</small>}</span>}</span><span className="no-print" style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end"}}>{onOpenCases&&<button type="button" style={favoriteView.itemLink} onClick={()=>onOpenCases(resolvedUniversity,item.department||"",favoriteCaseAdmissionType(item))}>광덕고 사례 <ExternalLink size={10}/></button>}{onOpenSusiNavi&&<button type="button" style={favoriteView.itemLink} onClick={()=>onOpenSusiNavi(resolvedUniversity,item.department||"")}>NAVI <ExternalLink size={10}/></button>}<button type="button" style={favoriteView.remove} onClick={()=>onToggleFavorite?.(item)}>삭제</button></span></div>;
            })}</div>
          </article>
        })}</div>}
      </div>;

  return <div style={{display:"grid",gap:14}}>
    {!hideBanner && <StudentIdentityBanner sid={sid} name={identity.name} grade={identity.grade} classNumber={identity.classNumber} number={identity.number} entryYear={identity.entryYear} gradeSystem={identity.gradeSystem} viewType="favorites" />}
    {favoriteContent}
  </div>;
}

function StudentConsultationView({
  sid,
  gdb,
  studentInfo,
  favorites = [],
  onToggleFavorite,
  onOpenAdmission,
  onOpenCases,
  onOpenSusiNavi,
  persistGrades,
  canEdit = false,
  authorName = "선생님",
}) {
  const identity = studentViewIdentityMeta({ sid, gdb, studentInfo });
  const [noteText, setNoteText] = useState("");
  const [noteDate, setNoteDate] = useState(() => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date()));
  const [saving, setSaving] = useState(false);
  const [noteFiles, setNoteFiles] = useState([]);
  const [fileError, setFileError] = useState("");
  const [printOptionsOpen, setPrintOptionsOpen] = useState(false);
  const [printNotes, setPrintNotes] = useState(true);
  const [printFavorites, setPrintFavorites] = useState(false);
  const [printPaper, setPrintPaper] = useState("A4");
  const notes = useMemo(
    () => [...(gdb?.admissionCounseling?.[String(sid)] || [])].sort((a,b)=>String(b.date||b.createdAt||"").localeCompare(String(a.date||a.createdAt||""))),
    [gdb?.admissionCounseling, sid],
  );

  const saveNote = async () => {
    const text = noteText.trim();
    if ((!text && !noteFiles.length) || !persistGrades || !sid) return;
    setSaving(true);
    setFileError("");
    const uploaded = [];
    try {
      for (const file of noteFiles) {
        uploaded.push(await uploadClassroomAttachment(file, {
          scopeKey: `counseling-${sid}`, subject: "진학상담", target: noteDate, teacherName: authorName,
        }));
      }
      const current = gdb?.admissionCounseling?.[String(sid)] || [];
      const newNote = {
        id: `consult_${Date.now().toString(36)}`,
        date: noteDate,
        text,
        attachments: uploaded,
        author: authorName,
        createdAt: new Date().toISOString(),
      };
      const ok = await persistGrades({
        admissionCounseling: {
          ...(gdb?.admissionCounseling || {}),
          [String(sid)]: [newNote, ...current],
        },
      });
      if (ok === false) throw new Error("상담 기록 저장에 실패했습니다.");
      setNoteText("");
      setNoteFiles([]);
    } catch (error) {
      await Promise.all(uploaded.map(file => deleteClassroomAttachment(file.path || file.dataKey)).filter(Boolean));
      setFileError(error?.message || "상담 첨부파일 저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const removeNote = async noteId => {
    if (!persistGrades || !sid) return;
    const current = gdb?.admissionCounseling?.[String(sid)] || [];
    const target = current.find(note => note.id === noteId);
    await Promise.all((target?.attachments || []).map(file => deleteClassroomAttachment(file.path || file.dataKey)).filter(Boolean));
    await persistGrades({
      admissionCounseling: {
        ...(gdb?.admissionCounseling || {}),
        [String(sid)]: current.filter(note => note.id !== noteId),
      },
    });
  };

  return <div style={{display:"grid",gap:14}}>
    <style>{COUNSELING_PRINT_CSS}</style>
    <div className="counseling-print-root" style={{display:"grid",gap:14}}>
    <div className="counseling-print-student-banner"><StudentIdentityBanner sid={sid} name={identity.name} grade={identity.grade} classNumber={identity.classNumber} number={identity.number} entryYear={identity.entryYear} gradeSystem={identity.gradeSystem} viewType="favorites" /></div>
    <div className="counseling-print-notes" style={consultationView.card}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}><SectionHeading title="상담 기록" description="담임·관리자가 작성한 진학 상담 내용을 날짜별로 저장합니다. 관심 대학 정보와 함께 유지됩니다." /><button type="button" className="no-print" onClick={()=>setPrintOptionsOpen(true)} style={{...btn.secondary,display:"inline-flex",alignItems:"center",gap:5,flex:"0 0 auto"}} title="상담 기록과 관심 대학·학과의 포함 여부를 선택해 인쇄합니다."><Printer size={13}/>인쇄·PDF</button></div>
      {canEdit && <div className="no-print" style={consultationView.editor}>
        <div style={consultationView.editorTop}>
          <label style={consultationView.dateLabel}>상담일<input type="date" value={noteDate} onChange={event=>setNoteDate(event.target.value)} style={consultationView.dateInput}/></label>
          <span style={consultationView.authorBadge}><MessageSquare size={12}/>{authorName}</span>
        </div>
        <textarea value={noteText} onChange={event=>setNoteText(event.target.value)} placeholder="상담한 대학·전형, 학생의 희망, 다음 상담 전 확인할 내용 등을 기록하세요." style={consultationView.textarea}/>
        <div style={consultationView.fileRow}>
          <label style={consultationView.fileButton}><Paperclip size={13}/>상담 파일 선택<input hidden multiple type="file" accept=".pdf,.hwp,.hwpx,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,image/*" onChange={event=>setNoteFiles(Array.from(event.target.files||[]))}/></label>
          <span style={consultationView.fileHint}>개별 30MB 이하 · PDF/HWP/HWPX/문서/이미지</span>
        </div>
        {!!noteFiles.length && <div style={consultationView.pendingFiles}>{noteFiles.map((file,index)=><span key={`${file.name}-${index}`} style={consultationView.pendingFile}><Paperclip size={11}/><b>{file.name}</b><small>{formatStoredFileSize(file.size)}</small><button type="button" style={consultationView.pendingRemove} onClick={()=>setNoteFiles(list=>list.filter((_,i)=>i!==index))}><X size={11}/></button></span>)}</div>}
        {fileError && <div style={consultationView.fileError}>{fileError}</div>}
        <button type="button" onClick={saveNote} disabled={saving || (!noteText.trim() && !noteFiles.length)} style={consultationView.saveButton}>{saving?<Loader2 size={14} className="spin"/>:<Save size={14}/>}상담 기록 저장</button>
      </div>}
      {!canEdit && <div className="no-print" style={consultationView.readOnlyNotice}>상담 기록은 담임 선생님 또는 관리자가 작성합니다.</div>}
      <div style={consultationView.notes}>
        {notes.length ? notes.map(note=><article className="counseling-print-note" key={note.id} style={consultationView.note}>
          <div style={consultationView.noteHeader}><div style={consultationView.noteMeta}><b>{note.date || "날짜 미입력"}</b><span>{note.author || "작성자 미입력"}</span></div>{canEdit&&<button type="button" className="no-print" onClick={()=>removeNote(note.id)} style={consultationView.deleteButton}>삭제</button>}</div>
          {note.text && <p className="counseling-print-note-text" style={consultationView.noteText}>{note.text}</p>}
          <CounselingAttachmentList attachments={note.attachments || []} />
        </article>) : <div style={consultationView.empty}>저장된 상담 기록이 없습니다.</div>}
      </div>
    </div>
    <div className="counseling-print-favorites"><StudentFavoritesView sid={sid} gdb={gdb} studentInfo={studentInfo} favorites={favorites} onToggleFavorite={onToggleFavorite} onOpenAdmission={onOpenAdmission} onOpenCases={onOpenCases} onOpenSusiNavi={onOpenSusiNavi} hideBanner /></div>
    </div>
    {printOptionsOpen&&<div className="counseling-print-option-overlay no-print" role="dialog" aria-modal="true" aria-label="상담 인쇄 항목 선택">
      <div className="counseling-print-option-modal">
        <div className="counseling-print-option-head"><div><b>상담 인쇄 항목 선택</b><span>상담 기록과 관심 대학·학과 중 PDF에 넣을 항목을 선택하세요.</span></div><button type="button" onClick={()=>setPrintOptionsOpen(false)} aria-label="닫기"><X size={15}/></button></div>
        <div className="counseling-print-option-body">
          <div className="counseling-print-paper-row"><span><b>인쇄 용지</b><small>B4는 넓은 상담 자료를 여유 있게 배치합니다.</small></span><div><button type="button" className={printPaper==="A4"?"is-active":""} onClick={()=>setPrintPaper("A4")}>A4</button><button type="button" className={printPaper==="B4"?"is-active":""} onClick={()=>setPrintPaper("B4")}>B4</button></div></div>
          <label><input type="checkbox" checked={printNotes} onChange={event=>setPrintNotes(event.target.checked)}/><span><b>상담 기록</b><span>상담일·작성자·상담 내용을 인쇄합니다.</span></span></label>
          <label className={!favorites.length?"is-disabled":""}><input type="checkbox" checked={printFavorites} disabled={!favorites.length} onChange={event=>setPrintFavorites(event.target.checked)}/><span><b>관심 대학·학과</b><span>{favorites.length?`저장된 관심 항목 ${favorites.length}개와 대학 지원·광덕고 사례·NAVI 컷 정보를 함께 인쇄합니다.`:"저장된 관심 대학·학과가 없습니다."}</span></span></label>
        </div>
        <div className="counseling-print-option-actions"><button type="button" onClick={()=>setPrintOptionsOpen(false)}>취소</button><button type="button" className="primary" disabled={!printNotes&&!printFavorites} onClick={()=>{setPrintOptionsOpen(false);window.setTimeout(()=>printCounselingHistory({notes:printNotes,favorites:printFavorites,paper:printPaper}),40)}}><Printer size={12}/>선택 항목 인쇄·PDF</button></div>
      </div>
    </div>}
  </div>;
}

/* ============================================================
   학급담임: 우리 반 학생 계정 정보
   ============================================================ */
function ClassStudentAccounts({ homeroomClass, accounts, roster }) {
  if (!homeroomClass) return <EmptyBox text="담당 학급이 지정되어 있지 않습니다." />;
  const students = (accounts.students || []).filter(s => String(s.class) === String(homeroomClass));
  return (
    <div style={card}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>{homeroomClass}반 학생 계정 ({students.length}명)</div>
      {!students.length ? <div style={{ fontSize: 12.5, color: "#a39d8c" }}>아직 등록된 학생 계정이 없습니다. 관리자에게 문의해주세요.</div> : (
        <table style={table.base}>
          <thead><tr><th style={table.th}>학번</th><th style={table.th}>이름</th><th style={table.th}>번호</th></tr></thead>
          <tbody>
            {students.sort((a, b) => a.number - b.number).map(s => (
              <tr key={s.id}><td style={table.td}>{s.id}</td><td style={table.td}>{s.name}</td><td style={table.td}>{s.number}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ============================================================
   관리자: 학생 계정 관리 (엑셀 일괄 발급)
   ============================================================ */
export function AdminStudentAccounts({ accounts, persistAccounts, showToast, roster, db, persist, scopeKey }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const positiveInt = value => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
  };
  const inferredPlacement = sid => ({
    class: positiveInt(String(sid || "").slice(1, 3)),
    number: positiveInt(String(sid || "").slice(3, 5)),
  });

  const downloadStudentAccountTemplate = async () => {
    try {
      const XLSX = await loadXLSX();
      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet([
        ["학번", "이름", "초기비밀번호", "학년", "반", "번호", "입학연도"],
        [20824, "김예환", "kd2026", 2, 8, 24, 2025],
      ]);
      sheet["!cols"] = [12, 14, 16, 9, 9, 9, 12].map(width => ({ wch: width }));
      XLSX.utils.book_append_sheet(workbook, sheet, "학생 계정");
      const guide = XLSX.utils.aoa_to_sheet([
        ["필수 열", "학번, 이름, 초기비밀번호"],
        ["선택 열", "학년, 반, 번호, 입학연도"],
        ["기본 비밀번호", "초기비밀번호가 비어 있으면 kd2026으로 등록됩니다."],
        ["기존 학번", "같은 학번이 이미 있으면 이름·반·번호 등의 정보가 갱신됩니다."],
      ]);
      guide["!cols"] = [{ wch: 18 }, { wch: 62 }];
      XLSX.utils.book_append_sheet(workbook, guide, "작성 안내");
      XLSX.writeFile(workbook, "학생_계정_업로드양식.xlsx");
      showToast("학생 계정 업로드 양식 다운로드를 시작했습니다.", "success");
    } catch (error) {
      showToast(`양식 생성 실패: ${error?.message || error}`, "error");
    }
  };

  const handleExcel = async (file) => {
    setBusy(true);
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
      const hi = rows.findIndex(r => r && r.some(c => ["학번", "이름", "초기비밀번호", "비밀번호"].includes(String(c || "").trim())));
      if (hi === -1) { showToast('첫 행에 "학번","이름","초기비밀번호" 열이 있어야 합니다.', "error"); setBusy(false); return; }
      const idx = {}; rows[hi].forEach((h, i) => { if (h) idx[String(h).trim()] = i; });
      const pwCol = idx["초기비밀번호"] != null ? idx["초기비밀번호"] : idx["비밀번호"];
      if (idx["학번"] == null || idx["이름"] == null || pwCol == null) { showToast("학번/이름/초기비밀번호 열을 찾지 못했습니다.", "error"); setBusy(false); return; }
      const existing = new Map((accounts.students || []).map(student => [student.id, student]));
      let added = 0, updated = 0;
      for (let i = hi + 1; i < rows.length; i++) {
        const row = rows[i]; if (!row) continue;
        const sidRaw = row[idx["학번"]]; if (!sidRaw) continue;
        const sid = String(sidRaw).trim();
        const name = row[idx["이름"]]; if (!name) continue;
        const pw = String(row[pwCol] ?? "").trim() || "kd2026";
        const rosterInfo = roster?.[sid] || {};
        const previous = existing.get(sid) || {};
        const inferred = inferredPlacement(sid);
        const rec = {
          ...previous,
          id: sid,
          pw,
          name: String(name).trim(),
          grade: positiveInt(row[idx["학년"]]) ?? positiveInt(previous.grade),
          entryYear: positiveInt(row[idx["입학연도"]]) ?? positiveInt(previous.entryYear),
          class: positiveInt(row[idx["반"]]) ?? positiveInt(rosterInfo.class) ?? positiveInt(previous.class) ?? inferred.class,
          number: positiveInt(row[idx["번호"]]) ?? positiveInt(rosterInfo.number) ?? positiveInt(previous.number) ?? inferred.number,
        };
        if (existing.has(sid)) updated++; else added++;
        existing.set(sid, rec);
      }
      const ok = await persistAccounts({ ...accounts, students: Array.from(existing.values()) });
      if (ok) showToast(`학생 계정 ${added}명 추가, ${updated}명 갱신했습니다.`, "success");
    } catch (e) {
      showToast(`파일 오류: ${e.message}`, "error");
    }
    setBusy(false);
  };

  const resetPw = async (sid) => {
    const updated = (accounts.students || []).map(student => student.id === sid ? { ...student, pw: "kd2026" } : student);
    const ok = await persistAccounts({ ...accounts, students: updated });
    if (ok) showToast('비밀번호가 "kd2026"으로 초기화되었습니다.', "success");
  };

  const savePlacement = async (student, classValue, numberValue) => {
    const classNumber = positiveInt(classValue);
    const studentNumber = positiveInt(numberValue);
    if (!classNumber || !studentNumber) {
      showToast("반과 번호를 1 이상의 숫자로 입력해주세요.", "error");
      return false;
    }
    if (!db || !persist || !scopeKey) {
      showToast("현재 학기 명단 저장 기능을 불러오지 못했습니다.", "error");
      return false;
    }
    const scopeRoster = db.roster?.[scopeKey] || {};
    const previousRoster = scopeRoster[student.id] || {};
    const nextRoster = {
      ...db.roster,
      [scopeKey]: {
        ...scopeRoster,
        [student.id]: {
          ...previousRoster,
          name: previousRoster.name || student.name,
          class: classNumber,
          number: studentNumber,
        },
      },
    };
    const rosterOk = await persist({ roster: nextRoster });
    if (!rosterOk) return false;

    const nextStudents = (accounts.students || []).map(item => item.id === student.id
      ? { ...item, class: classNumber, number: studentNumber }
      : item);
    const accountOk = await persistAccounts({ ...accounts, students: nextStudents });
    if (!accountOk) {
      showToast("명단은 저장됐지만 학생 계정 정보 저장에 실패했습니다. 다시 저장해주세요.", "error");
      return false;
    }
    showToast(`${student.id} ${student.name} 학생을 ${classNumber}반 ${studentNumber}번으로 저장했습니다.`, "success");
    return true;
  };

  const students = (accounts.students || []).slice().sort((a, b) => {
    const aClass = positiveInt(roster?.[a.id]?.class) ?? positiveInt(a.class) ?? 999;
    const bClass = positiveInt(roster?.[b.id]?.class) ?? positiveInt(b.class) ?? 999;
    const aNumber = positiveInt(roster?.[a.id]?.number) ?? positiveInt(a.number) ?? 999;
    const bNumber = positiveInt(roster?.[b.id]?.number) ?? positiveInt(b.number) ?? 999;
    return (aClass - bClass) || (aNumber - bNumber) || String(a.id).localeCompare(String(b.id));
  });

  return (
    <div>
      <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", border: `1.5px dashed #e6e1d3` }}>
        <FileSpreadsheet size={22} color="#8a8578" />
        <div style={{ fontWeight: 700, marginTop: 8 }}>학생 계정 엑셀 일괄 발급</div>
        <div style={{ fontSize: 12, color: "#8a8578", margin: "6px 0 12px", textAlign: "center" }}>필수 열은 학번·이름·초기비밀번호이며, 학년·반·번호·입학연도도 함께 입력할 수 있습니다.</div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => e.target.files[0] && handleExcel(e.target.files[0])} />
        <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}><button type="button" style={btn.secondary} onClick={downloadStudentAccountTemplate} disabled={busy}><Download size={14}/>양식 다운로드</button><button style={btn.primary} onClick={() => fileRef.current.click()} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} 엑셀 업로드</button></div>
      </div>
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 5 }}>등록된 학생 계정 ({students.length}명)</div>
        <div style={{ fontSize: 11.5, color: "#8a8578", marginBottom: 10 }}>
          반·번호가 비어 있거나 잘못 들어온 학생은 아래에서 직접 수정할 수 있습니다. 현재 선택한 학년·학기의 명단과 학생 계정에 함께 반영됩니다.
        </div>
        {!students.length ? <div style={{ fontSize: 12.5, color: "#a39d8c" }}>등록된 계정이 없습니다.</div> : (
          <div style={{ maxHeight: 520, overflowY: "auto" }}>
            <table style={table.base}>
              <thead><tr><th style={table.th}>학번</th><th style={table.th}>이름</th><th style={{ ...table.th, width: 82 }}>반</th><th style={{ ...table.th, width: 82 }}>번호</th><th style={{ ...table.th, width: 190 }}>관리</th></tr></thead>
              <tbody>
                {students.map(student => (
                  <StudentPlacementRow
                    key={student.id}
                    student={student}
                    rosterInfo={roster?.[student.id]}
                    onSave={savePlacement}
                    onResetPw={resetPw}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StudentPlacementRow({ student, rosterInfo, onSave, onResetPw }) {
  const cleanPlacementValue = value => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? String(number) : "";
  };
  const sourceClass = cleanPlacementValue(rosterInfo?.class ?? student.class) || cleanPlacementValue(String(student.id || "").slice(1, 3));
  const sourceNumber = cleanPlacementValue(rosterInfo?.number ?? student.number) || cleanPlacementValue(String(student.id || "").slice(3, 5));
  const [classValue, setClassValue] = useState(sourceClass);
  const [numberValue, setNumberValue] = useState(sourceNumber);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setClassValue(cleanPlacementValue(rosterInfo?.class ?? student.class) || cleanPlacementValue(String(student.id || "").slice(1, 3)));
    setNumberValue(cleanPlacementValue(rosterInfo?.number ?? student.number) || cleanPlacementValue(String(student.id || "").slice(3, 5)));
  }, [student.class, student.number, rosterInfo?.class, rosterInfo?.number]);

  const save = async () => {
    setSaving(true);
    await onSave(student, classValue, numberValue);
    setSaving(false);
  };

  const invalid = !Number.isInteger(Number(classValue)) || Number(classValue) <= 0 || !Number.isInteger(Number(numberValue)) || Number(numberValue) <= 0;

  return (
    <tr style={invalid ? { background: "#fff8ec" } : undefined}>
      <td style={table.td}>{student.id}</td>
      <td style={table.td}>{student.name}</td>
      <td style={table.td}>
        <input value={classValue} onChange={event => setClassValue(event.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" aria-label={`${student.name} 반`} style={{ ...pdfAdmin.input, width: 56, textAlign: "center", padding: "6px 5px" }} placeholder="반" />
      </td>
      <td style={table.td}>
        <input value={numberValue} onChange={event => setNumberValue(event.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" aria-label={`${student.name} 번호`} style={{ ...pdfAdmin.input, width: 56, textAlign: "center", padding: "6px 5px" }} placeholder="번호" />
      </td>
      <td style={table.td}>
        <div style={{ display: "flex", justifyContent: "center", gap: 5, flexWrap: "wrap" }}>
          <button style={btn.smallPrimary} onClick={save} disabled={saving}>{saving ? <Loader2 size={12} className="spin" /> : <Save size={12} />} 반·번호 저장</button>
          <button style={btn.link} onClick={() => onResetPw(student.id)}>비밀번호 초기화</button>
        </div>
      </td>
    </tr>
  );
}

/* ============================================================
   관리자: 원본 성적 데이터 업로드 (학기별 성적표 / 모의고사 / 대입전형표)
   ============================================================ */
export function AdminGradesUpload({ gdb, persistGrades, showToast, roster = {}, currentGrade = "2" }) {
  const [subtab, setSubtab] = useState("bulk");
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <TabBtn active={subtab === "bulk"} onClick={() => setSubtab("bulk")} label="전체 파일 한번에 업로드" />
        <TabBtn active={subtab === "semester"} onClick={() => setSubtab("semester")} label="학기별 성적표 (개별)" />
        <TabBtn active={subtab === "mock"} onClick={() => setSubtab("mock")} label="모의고사 (개별)" />
        <TabBtn active={subtab === "admission"} onClick={() => setSubtab("admission")} label="대입 전형표 (개별)" />
        <TabBtn active={subtab === "admissionPdf"} onClick={() => setSubtab("admissionPdf")} label="모집요강·반영표 자료" />
        <TabBtn active={subtab === "admissionCases"} onClick={() => setSubtab("admissionCases")} label="2024–2026 대입 사례 데이터" />
        <TabBtn active={subtab === "cohorts"} onClick={() => setSubtab("cohorts")} label="학년·입학연도 관리" />
      </div>
      {subtab === "bulk" && <BulkUpload gdb={gdb} persistGrades={persistGrades} showToast={showToast} currentGrade={currentGrade} />}
      {subtab === "semester" && <SemesterUpload gdb={gdb} persistGrades={persistGrades} showToast={showToast} />}
      {subtab === "mock" && <MockUpload gdb={gdb} persistGrades={persistGrades} showToast={showToast} />}
      {subtab === "admission" && <AdmissionUpload gdb={gdb} persistGrades={persistGrades} showToast={showToast} currentGrade={currentGrade} />}
      {subtab === "admissionPdf" && <AdmissionPdfManager gdb={gdb} persistGrades={persistGrades} showToast={showToast} currentGrade={currentGrade} />}
      {subtab === "admissionCases" && <AdmissionCaseAdmin gdb={gdb} persistGrades={persistGrades} showToast={showToast} roster={roster} currentGrade={currentGrade} />}
      {subtab === "cohorts" && <CohortManager gdb={gdb} persistGrades={persistGrades} showToast={showToast} />}
    </div>
  );
}


function CohortManager({ gdb, persistGrades, showToast }) {
  const initial = normalizeCohortSettings(gdb.cohortSettings);
  const [academicYear, setAcademicYear] = useState(initial.academicYear);
  const [rows, setRows] = useState(initial.cohorts);
  const update = (index, field, value) => setRows(current => current.map((row, i) => i === index ? { ...row, [field]: value } : row));
  const add = () => setRows(current => [...current, { entryYear: academicYear, currentGrade: 1, status: "재학" }]);
  const advance = () => {
    const nextYear = Number(academicYear) + 1;
    setAcademicYear(nextYear);
    setRows(current => {
      const advanced = current.map(row => {
        if (row.status !== "재학" || !row.currentGrade) return row;
        if (Number(row.currentGrade) >= 3) return { ...row, currentGrade: null, status: "졸업" };
        return { ...row, currentGrade: Number(row.currentGrade) + 1 };
      });
      if (!advanced.some(row => Number(row.entryYear) === nextYear)) advanced.push({ entryYear: nextYear, currentGrade: 1, status: "재학" });
      return advanced;
    });
  };
  const save = async () => {
    const value = normalizeCohortSettings({ academicYear, cohorts: rows });
    const ok = await persistGrades({ cohortSettings: value });
    if (ok) showToast("입학연도별 학년 설정을 저장했습니다.", "success");
  };
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #e6e1d3" }}>
        <span style={{ width: 38, height: 38, borderRadius: 12, display: "grid", placeItems: "center", background: "#eaf2e8" }}><GraduationCap size={20} color="#3d5c3a" /></span><div><div style={{ fontWeight: 950, fontSize: 16 }}>입학연도별 학생 데이터 관리</div><div style={{ fontSize: 11.5, color: "#8a8578", marginTop: 5 }}>성적과 모의고사는 입학연도별로 분리 저장되어 신입생·진급·졸업 후에도 이전 자료가 유지됩니다.</div></div>
      </div>
      <label style={{ display: "grid", gap: 7, width: 190, fontSize: 11, fontWeight: 850, color: "#746d61", marginBottom: 18 }}>현재 학년도<input type="number" value={academicYear} onChange={e => setAcademicYear(Number(e.target.value))} style={btn.input} /></label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((row, index) => (
          <div key={`${row.entryYear}-${index}`} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 44px", gap: 12, padding: 14, border: "1px solid #e6e1d3", borderRadius: 11, background: "#fbfaf6", alignItems: "end" }}>
            <label style={{ display: "grid", gap: 7, fontSize: 10.5, fontWeight: 850, color: "#746d61" }}>입학연도<input type="number" value={row.entryYear || ""} onChange={e => update(index, "entryYear", Number(e.target.value))} style={btn.input} /></label>
            <label style={{ display: "grid", gap: 7, fontSize: 10.5, fontWeight: 850, color: "#746d61" }}>현재 학년<select value={row.currentGrade || ""} onChange={e => update(index, "currentGrade", e.target.value ? Number(e.target.value) : null)} style={btn.input}><option value="">졸업/기타</option><option value="1">1학년</option><option value="2">2학년</option><option value="3">3학년</option></select></label>
            <label style={{ display: "grid", gap: 7, fontSize: 10.5, fontWeight: 850, color: "#746d61" }}>상태<select value={row.status || "재학"} onChange={e => update(index, "status", e.target.value)} style={btn.input}><option>재학</option><option>졸업</option><option>휴학/기타</option></select></label>
            <button type="button" style={btn.link} onClick={() => setRows(current => current.filter((_, i) => i !== index))}>삭제</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}><button style={btn.secondary} onClick={add}>+ 입학연도 추가</button><button style={btn.secondary} onClick={advance}>다음 학년도 진급 반영</button><button style={btn.primary} onClick={save}><Save size={14} /> 저장</button></div>
    </div>
  );
}

// 시트 이름을 보고 자동으로 종류를 판별해서 워크북 하나로 성적/모의고사/대입전형을 한번에 반영.
function classifySheetName(name) {
  const trimmed = name.trim();
  let m = trimmed.match(/^([123])\s*-\s*([12])\s*성적$/);
  if (m) return { type: "semester", key: `${m[1]}-${m[2]}` };
  m = trimmed.match(/^([123])\s*학년\s*(\d{1,2})\s*월$/);
  if (m) return { type: "mock", key: `${m[1]}-${m[2]}` };
  if (trimmed.includes("대입") && trimmed.includes("전형")) return { type: "admission" };
  return null;
}

function normalizeHeader(v) {
  return String(v ?? "")
    .normalize("NFKC")
    .replace(/[\s()[\]{}·ㆍ/_\-–—]+/g, "")
    .trim();
}
function normalizeAdmissionLookupKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/20\d{2}학년도?/g, "")
    .replace(/학생부교과/g, "교과")
    .replace(/전형$/g, "")
    .replace(/[\s·ㆍ_\-–—()[\]{}]/g, "")
    .trim();
}

function parseReflectionLookup(rows) {
  if (!Array.isArray(rows)) return new Map();
  const ratioHeaders = [
    "반영비율", "교과반영비율", "학생부교과반영비율", "교과반영방법",
    "교과성적반영방법", "전형요소반영비율", "학생부반영비율", "학생부반영방법",
  ];
  const trackHeaders = ["전형", "전형명", "전형유형", "전형구분"];
  const headerRowIdx = rows.findIndex(row => {
    const headers = (row || []).map(normalizeHeader);
    return headers.some(header => trackHeaders.includes(header))
      && headers.some(header => ratioHeaders.includes(header) || (header.includes("반영비율") && !header.includes("수능")));
  });
  if (headerRowIdx < 0) return new Map();

  const header = rows[headerRowIdx] || [];
  const trackIndex = header.findIndex(value => trackHeaders.includes(normalizeHeader(value)));
  let ratioIndex = header.findIndex(value => ratioHeaders.includes(normalizeHeader(value)));
  if (ratioIndex < 0) {
    ratioIndex = header.findIndex(value => {
      const key = normalizeHeader(value);
      return key.includes("반영비율") && !key.includes("수능") && !key.includes("최저");
    });
  }
  if (trackIndex < 0 || ratioIndex < 0) return new Map();

  const map = new Map();
  const ordered = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const track = String(row[trackIndex] ?? "").trim();
    const ratio = normalizeReflectionText(row[ratioIndex]);
    const key = normalizeAdmissionLookupKey(track);
    if (!key || !ratio) continue;
    map.set(key, ratio);
    ordered.push({ key, track, ratio });
  }
  map.ordered = ordered;
  return map;
}

function findReflectionInLookup(row, lookup) {
  if (!(lookup instanceof Map) || lookup.size === 0) return "";
  const candidates = [row?.track, row?.department, row?.note]
    .map(value => normalizeAdmissionLookupKey(value))
    .filter(Boolean);

  for (const candidate of candidates) {
    if (lookup.has(candidate)) return lookup.get(candidate);
  }

  // 예전에는 행 하나를 찾을 때마다 전체 lookup을 다시 배열화·정렬했습니다.
  // 대입 전형 행이 많을수록 같은 정렬을 반복하게 되어 업로드 분석이 크게 느려졌습니다.
  const entries = Array.isArray(lookup.sortedEntries)
    ? lookup.sortedEntries
    : Array.from(lookup.entries()).sort((a, b) => b[0].length - a[0].length);
  for (const candidate of candidates) {
    for (const [key, ratio] of entries) {
      if (key.length >= 3 && (candidate.includes(key) || key.includes(candidate))) return ratio;
    }
  }
  return "";
}


const CURRICULUM_METHOD_HEADER_ALIASES = {
  commonSubjectMethod: ["공통과목반영여부", "공통과목반영방법", "공통과목평가방법", "공통과목반영기준", "공통과목"],
  generalElectiveMethod: ["일반선택반영여부", "일반선택반영방법", "일반선택평가방법", "일반선택반영기준", "일반선택"],
  careerElectiveMethod: ["진로선택반영여부", "진로선택반영방법", "진로선택평가방법", "진로선택반영기준", "진로선택"],
  convergenceElectiveMethod: ["융합선택반영여부", "융합선택반영방법", "융합선택평가방법", "융합선택반영기준", "융합선택"],
};

function curriculumLookupKey(university, track = "", department = "", admissionField = "") {
  return [
    universityKey(university),
    normalizeAdmissionLookupKey(track),
    normalizeAdmissionLookupKey(department),
    normalizeAdmissionLookupKey(admissionField),
  ].join("|");
}

function parseCurriculumMethodLookup(rows) {
  if (!Array.isArray(rows)) return { map: new Map(), ordered: [] };
  const headerRowIdx = rows.findIndex(row => {
    const headers = (row || []).map(normalizeHeader);
    return Object.values(CURRICULUM_METHOD_HEADER_ALIASES)
      .some(aliases => aliases.some(alias => headers.includes(alias)));
  });
  if (headerRowIdx < 0) return { map: new Map(), ordered: [] };

  const header = rows[headerRowIdx] || [];
  const findIndex = aliases => header.findIndex(value => aliases.includes(normalizeHeader(value)));
  const indexes = Object.fromEntries(
    Object.entries(CURRICULUM_METHOD_HEADER_ALIASES)
      .map(([field, aliases]) => [field, findIndex(aliases)])
  );
  if (!Object.values(indexes).some(index => index >= 0)) return { map: new Map(), ordered: [] };

  const universityIndex = findIndex(["대학교", "대학명", "대학"]);
  const trackIndex = findIndex(["전형명", "전형", "전형유형", "전형구분"]);
  const combinedFieldDepartmentIndex = findIndex(["계열학과", "지원계열학과", "모집계열학과"]);
  const explicitDepartmentIndex = combinedFieldDepartmentIndex >= 0 ? combinedFieldDepartmentIndex : findIndex(["모집단위", "학과", "학부"]);
  const genericSeriesIndex = findIndex(["계열"]);
  const namedAdmissionFieldIndex = findIndex(["계열구분", "지원계열", "모집계열", "대학계열", "계열유형", "인문자연구분", "인문자연간호구분"]);
  const admissionFieldIndex = namedAdmissionFieldIndex >= 0
    ? namedAdmissionFieldIndex
    : (combinedFieldDepartmentIndex >= 0 ? combinedFieldDepartmentIndex : (explicitDepartmentIndex >= 0 ? genericSeriesIndex : -1));
  const departmentIndex = explicitDepartmentIndex >= 0 ? explicitDepartmentIndex : genericSeriesIndex;
  const map = new Map();
  const ordered = [];
  let carriedUniversity = "";
  let carriedTrack = "";
  let carriedDepartment = "";
  let carriedAdmissionField = "";

  for (let rowIndex = headerRowIdx + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] || [];
    if (universityIndex >= 0 && String(row[universityIndex] ?? "").trim()) carriedUniversity = String(row[universityIndex]).trim();
    if (trackIndex >= 0 && String(row[trackIndex] ?? "").trim()) carriedTrack = String(row[trackIndex]).trim();
    if (departmentIndex >= 0 && String(row[departmentIndex] ?? "").trim()) carriedDepartment = String(row[departmentIndex]).trim();
    if (admissionFieldIndex >= 0 && String(row[admissionFieldIndex] ?? "").trim()) carriedAdmissionField = String(row[admissionFieldIndex]).trim();

    const methods = Object.fromEntries(
      Object.entries(indexes).map(([field, index]) => [
        field,
        index >= 0 ? String(row[index] ?? "").trim() : "",
      ])
    );
    if (!Object.values(methods).some(value => normalizeCurriculumMethod(value) !== "미입력")) continue;

    const entry = {
      university: carriedUniversity,
      track: carriedTrack,
      department: carriedDepartment,
      admissionField: carriedAdmissionField,
      methods,
    };
    ordered.push(entry);

    const keys = [
      curriculumLookupKey(entry.university, entry.track, entry.department, entry.admissionField),
      curriculumLookupKey(entry.university, entry.track, entry.department, ""),
      curriculumLookupKey(entry.university, entry.track, "", entry.admissionField),
      curriculumLookupKey(entry.university, entry.track, "", ""),
      curriculumLookupKey(entry.university, "", entry.department, entry.admissionField),
      curriculumLookupKey(entry.university, "", entry.department, ""),
      curriculumLookupKey(entry.university, "", "", entry.admissionField),
      curriculumLookupKey(entry.university, "", "", ""),
    ];
    keys.filter(key => key.replace(/\|/g, "")).forEach(key => {
      if (!map.has(key)) map.set(key, methods);
    });
  }

  return { map, ordered };
}

function findCurriculumMethodsInLookup(row, lookup) {
  if (!lookup?.map || !(lookup.map instanceof Map)) return null;
  const exactKeys = [
    curriculumLookupKey(row?.university, row?.track, row?.department, row?.admissionField),
    curriculumLookupKey(row?.university, row?.track, row?.department, ""),
    curriculumLookupKey(row?.university, row?.track, "", row?.admissionField),
    curriculumLookupKey(row?.university, row?.track, "", ""),
    curriculumLookupKey(row?.university, "", row?.department, row?.admissionField),
    curriculumLookupKey(row?.university, "", row?.department, ""),
    curriculumLookupKey(row?.university, "", "", row?.admissionField),
    curriculumLookupKey(row?.university, "", "", ""),
  ];
  for (const key of exactKeys) {
    if (lookup.map.has(key)) return lookup.map.get(key);
  }

  const university = universityKey(row?.university);
  const track = normalizeAdmissionLookupKey(row?.track);
  const department = normalizeAdmissionLookupKey(row?.department);
  const admissionField = normalizeAdmissionLookupKey(row?.admissionField);

  // 전체 전형 lookup을 매 행마다 전부 순회하지 않고 같은 대학 후보만 확인합니다.
  let candidateEntries = [];
  if (lookup.byUniversity instanceof Map) {
    candidateEntries = lookup.byUniversity.get(university) || [];
    if (!candidateEntries.length && university) {
      for (const [candidateUniversity, entries] of lookup.byUniversity.entries()) {
        if (candidateUniversity
          && (university.includes(candidateUniversity) || candidateUniversity.includes(university))) {
          candidateEntries.push(...entries);
        }
      }
    }
  } else {
    candidateEntries = Array.from(lookup.map.entries());
  }

  for (const [key, methods] of candidateEntries) {
    const [candidateUniversity, candidateTrack, candidateDepartment, candidateAdmissionField] = key.split("|");
    const universityMatches = university && candidateUniversity
      && (university.includes(candidateUniversity) || candidateUniversity.includes(university));
    if (!universityMatches) continue;
    const trackMatches = !track || !candidateTrack || track.includes(candidateTrack) || candidateTrack.includes(track);
    const departmentMatches = !department || !candidateDepartment || department.includes(candidateDepartment) || candidateDepartment.includes(department);
    const fieldMatches = !admissionField || !candidateAdmissionField || admissionField.includes(candidateAdmissionField) || candidateAdmissionField.includes(admissionField);
    if (trackMatches && departmentMatches && fieldMatches) return methods;
  }
  return null;
}

function mergeCurriculumMethods(row, methods) {
  if (!methods) return row;
  const patch = {};
  Object.keys(CURRICULUM_METHOD_HEADER_ALIASES).forEach(field => {
    if (normalizeCurriculumMethod(row?.[field]) === "미입력"
      && normalizeCurriculumMethod(methods?.[field]) !== "미입력") {
      patch[field] = methods[field];
    }
  });
  return Object.keys(patch).length ? { ...row, ...patch } : row;
}

function admissionSheetNamePriority(name) {
  const text = String(name || "").replace(/\s+/g, "");
  let score = 0;
  if (/대입|입시/.test(text)) score += 8;
  if (/전형/.test(text)) score += 6;
  if (/반영비율|반영방법|교과/.test(text)) score += 4;
  if (/선택|성취도|계획|요강/.test(text)) score += 2;
  return score;
}

function sheetPreviewRows(sheet, XLSX, maxRows = 36) {
  if (!sheet || !sheet["!ref"]) return [];
  try {
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    range.e.r = Math.min(range.e.r, Math.max(0, maxRows - 1));
    range.e.c = Math.min(range.e.c, 120);
    return XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      raw: true,
      blankrows: false,
      range,
    });
  } catch {
    return [];
  }
}

function inspectAdmissionSheet(name, sheet, XLSX) {
  const previewRows = sheetPreviewRows(sheet, XLSX);
  const basePreview = parseAdmissionRows(previewRows);
  const reflectionPreview = parseReflectionLookup(previewRows);
  const curriculumPreview = parseCurriculumMethodLookup(previewRows);
  return {
    name,
    namePriority: admissionSheetNamePriority(name),
    hasBase: Boolean(basePreview?.length),
    basePreviewCount: basePreview?.length || 0,
    hasReflection: reflectionPreview.size > 0,
    hasCurriculum: curriculumPreview.map.size > 0 || curriculumPreview.ordered.length > 0,
  };
}

function parseAdmissionWorkbook(workbook, XLSX) {
  const names = workbook?.SheetNames || [];
  if (!names.length) return null;

  // 과거 코드는 모든 시트를 처음부터 끝까지 배열로 변환하고,
  // 각 시트에 대해 대입표·반영비율·선택과목 파서를 모두 실행했습니다.
  // 성적 원본처럼 시트가 많은 파일에서는 실제 대입 시트 1개를 찾기 위해
  // 수십만 셀을 불필요하게 읽는 것이 가장 큰 병목이었습니다.
  const likelyNames = names.filter(name => admissionSheetNamePriority(name) > 0);
  const firstPassNames = likelyNames.length ? likelyNames : names;
  const inspected = new Map();

  firstPassNames.forEach(name => {
    inspected.set(name, inspectAdmissionSheet(name, workbook.Sheets[name], XLSX));
  });

  let baseCandidates = Array.from(inspected.values()).filter(item => item.hasBase);

  // 이름만으로 후보를 찾지 못한 경우에만 나머지 시트의 앞부분을 확인합니다.
  if (!baseCandidates.length && firstPassNames.length < names.length) {
    names.filter(name => !inspected.has(name)).forEach(name => {
      inspected.set(name, inspectAdmissionSheet(name, workbook.Sheets[name], XLSX));
    });
    baseCandidates = Array.from(inspected.values()).filter(item => item.hasBase);
  }
  if (!baseCandidates.length) return null;

  const fullRowsCache = new Map();
  const fullRows = name => {
    if (!fullRowsCache.has(name)) {
      fullRowsCache.set(name, XLSX.utils.sheet_to_json(workbook.Sheets[name], {
        header: 1,
        defval: null,
        raw: true,
        blankrows: false,
      }));
    }
    return fullRowsCache.get(name);
  };

  const parsedCandidates = baseCandidates
    .map(item => ({ ...item, parsed: parseAdmissionRows(fullRows(item.name)) }))
    .filter(item => item.parsed?.length)
    .sort((a, b) => (
      b.parsed.length - a.parsed.length
      || b.namePriority - a.namePriority
      || b.basePreviewCount - a.basePreviewCount
    ));
  if (!parsedCandidates.length) return null;

  const baseItem = parsedCandidates[0];
  const base = baseItem.parsed;
  const reflectionLookup = new Map();
  let orderedReflectionLookup = [];
  const curriculumLookup = { map: new Map(), ordered: [], byUniversity: new Map() };

  // 실제 lookup 후보와 본문 시트만 전체 변환합니다.
  const lookupNames = Array.from(new Set([
    baseItem.name,
    ...Array.from(inspected.values())
      .filter(item => item.hasReflection || item.hasCurriculum || /반영|교과|선택|전형/.test(String(item.name || "")))
      .map(item => item.name),
  ]));

  lookupNames.forEach(name => {
    const rows = fullRows(name);
    const sheetReflectionLookup = parseReflectionLookup(rows);
    sheetReflectionLookup.forEach((ratio, key) => reflectionLookup.set(key, ratio));
    if ((sheetReflectionLookup.ordered || []).length > orderedReflectionLookup.length) {
      orderedReflectionLookup = sheetReflectionLookup.ordered || [];
    }

    const sheetCurriculumLookup = parseCurriculumMethodLookup(rows);
    sheetCurriculumLookup.map.forEach((methods, key) => {
      if (!curriculumLookup.map.has(key)) curriculumLookup.map.set(key, methods);
    });
    if (sheetCurriculumLookup.ordered.length > curriculumLookup.ordered.length) {
      curriculumLookup.ordered = sheetCurriculumLookup.ordered;
    }
  });

  reflectionLookup.sortedEntries = Array.from(reflectionLookup.entries())
    .sort((a, b) => b[0].length - a[0].length);

  curriculumLookup.map.forEach((methods, key) => {
    const university = key.split("|")[0];
    if (!curriculumLookup.byUniversity.has(university)) curriculumLookup.byUniversity.set(university, []);
    curriculumLookup.byUniversity.get(university).push([key, methods]);
  });

  const merged = base.map((baseRow, index) => {
    let row = baseRow;

    if (!admissionReflectionText(row)) {
      const mapped = findReflectionInLookup(row, reflectionLookup);
      if (mapped) row = { ...row, reflection: mapped };
      else if (orderedReflectionLookup.length === base.length && orderedReflectionLookup[index]?.ratio) {
        row = { ...row, reflection: orderedReflectionLookup[index].ratio };
      }
    }

    let methods = findCurriculumMethodsInLookup(row, curriculumLookup);
    if (!methods && curriculumLookup.ordered.length === base.length) {
      methods = curriculumLookup.ordered[index]?.methods || null;
    }
    row = mergeCurriculumMethods(row, methods);
    return row;
  });

  // 진단 UI에서 어떤 시트만 실제로 읽었는지 확인할 수 있도록 비열거 메타데이터를 붙입니다.
  Object.defineProperty(merged, "_parseMeta", {
    value: {
      totalSheets: names.length,
      inspectedSheets: inspected.size,
      fullyReadSheets: fullRowsCache.size,
      baseSheet: baseItem.name,
      lookupSheets: lookupNames,
    },
    enumerable: false,
  });
  return merged;
}

function parseAdmissionRows(rows) {
  const headerRowIdx = rows.findIndex(row => row && row.some(cell => ["대학교", "대학명"].includes(normalizeHeader(cell))));
  if (headerRowIdx === -1) return null;
  const header = rows[headerRowIdx];
  const idx = {};
  header.forEach((value, index) => { if (value != null && value !== "") idx[normalizeHeader(value)] = index; });
  const firstIndex = names => {
    for (const name of names) if (idx[name] != null) return idx[name];
    return null;
  };

  const universityIndex = firstIndex(["대학교", "대학명"]);
  const countIndex = firstIndex(["수능최저반영과목수", "반영교과수", "반영과목수", "수능최저반영교과수"]);
  const sumIndex = firstIndex(["수능최저합", "최저합기준", "최저합", "수능최저등급합"]);
  if (universityIndex == null || countIndex == null || sumIndex == null) return null;

  const combinedFieldDepartmentIndex = firstIndex(["계열학과", "지원계열학과", "모집계열학과"]);
  const explicitDepartmentIndex = combinedFieldDepartmentIndex ?? firstIndex(["모집단위", "학과", "학부"]);
  const genericSeriesIndex = idx["계열"] != null ? idx["계열"] : null;
  const admissionFieldIndex = firstIndex(["계열구분", "지원계열", "모집계열", "대학계열", "계열유형", "인문자연구분", "인문자연간호구분"])
    ?? combinedFieldDepartmentIndex
    ?? (explicitDepartmentIndex != null ? genericSeriesIndex : null);
  const departmentIndex = explicitDepartmentIndex ?? genericSeriesIndex;
  const trackIndex = firstIndex(["전형명", "전형", "전형유형"]);
  const requiredSubjectsIndex = firstIndex(["수능최저반영교과", "수능최저반영과목", "반영영역", "최저반영영역", "반영교과"]);
  let reflectionIndex = firstIndex([
    "교과반영비율", "학생부교과반영비율", "교과반영방법", "교과성적반영방법",
    "교과반영", "반영비율", "반영방법", "반영교과및비율", "교과반영과목",
    "교과비율", "학생부반영비율", "학생부교과비율", "교과출결반영비율",
    "교과출결비율", "전형요소반영비율", "학생부반영방법",
  ]);
  if (reflectionIndex == null) {
    reflectionIndex = header.findIndex(value => {
      const key = normalizeHeader(value);
      return (key.includes("반영비율") || key.includes("반영방법"))
        && !key.includes("수능") && !key.includes("최저") && !key.includes("교과목");
    });
    if (reflectionIndex < 0) reflectionIndex = null;
  }
  const reflectionComponentIndexes = [
    ["교과", firstIndex(["교과비율", "교과반영률", "교과점수비율"])],
    ["출결", firstIndex(["출결비율", "출결반영률"])],
    ["면접", firstIndex(["면접비율", "면접반영률"])],
    ["서류", firstIndex(["서류비율", "서류반영률"])],
    ["추천", firstIndex(["추천비율", "추천반영률"])],
    ["학생부", firstIndex(["학생부비율", "학생부반영률"])],
  ].filter(([, index]) => index != null);
  const commonSubjectMethodIndex = firstIndex([
    "공통과목반영여부", "공통과목반영방법", "공통과목평가방법", "공통과목반영기준",
  ]);
  const generalElectiveMethodIndex = firstIndex([
    "일반선택반영여부", "일반선택반영방법", "일반선택평가방법", "일반선택반영기준",
  ]);
  const careerElectiveMethodIndex = firstIndex([
    "진로선택반영여부", "진로선택반영방법", "진로선택평가방법", "진로선택반영기준",
  ]);
  const convergenceElectiveMethodIndex = firstIndex([
    "융합선택반영여부", "융합선택반영방법", "융합선택평가방법", "융합선택반영기준",
  ]);
  const noteIndex = firstIndex(["전형특이사항", "특이사항", "전형비고", "비고"]);
  const regionIndex = firstIndex(["지역", "지역구분", "소재지", "대학소재지"]);

  const admissionRows = [];
  for (let rowIndex = headerRowIdx + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (!row) continue;
    const university = row[universityIndex];
    if (!university) continue;
    admissionRows.push({
      university: String(university).trim(),
      admissionField: admissionFieldIndex == null ? "" : String(row[admissionFieldIndex] ?? "").trim(),
      department: departmentIndex == null ? "" : String(row[departmentIndex] ?? "").trim(),
      track: trackIndex == null ? "" : String(row[trackIndex] ?? "").trim(),
      requiredSubjects: requiredSubjectsIndex == null ? "" : String(row[requiredSubjectsIndex] ?? "").trim(),
      requiredSubjectCount: row[countIndex],
      requiredSum: row[sumIndex],
      reflection: (() => {
        const direct = reflectionIndex == null ? "" : normalizeReflectionText(row[reflectionIndex]);
        if (direct) return direct;
        return reflectionComponentIndexes
          .map(([label, index]) => percentPart(label, row[index]))
          .filter(Boolean)
          .join(" + ");
      })(),
      commonSubjectMethod: commonSubjectMethodIndex == null ? "" : String(row[commonSubjectMethodIndex] ?? "").trim(),
      generalElectiveMethod: generalElectiveMethodIndex == null ? "" : String(row[generalElectiveMethodIndex] ?? "").trim(),
      careerElectiveMethod: careerElectiveMethodIndex == null ? "" : String(row[careerElectiveMethodIndex] ?? "").trim(),
      convergenceElectiveMethod: convergenceElectiveMethodIndex == null ? "" : String(row[convergenceElectiveMethodIndex] ?? "").trim(),
      note: noteIndex == null ? "" : String(row[noteIndex] ?? "").trim(),
      region: regionIndex == null ? "" : String(row[regionIndex] ?? "").trim(),
    });
  }
  return admissionRows;
}


function CohortSelector({ value, onChange, cohortSettings, label = "대상 입학연도" }) {
  const settings = normalizeCohortSettings(cohortSettings);
  const options = settings.cohorts.slice().sort((a, b) => b.entryYear - a.entryYear);
  return <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "#746d61", fontWeight: 800, marginBottom: 10 }}>{label}<select value={value} onChange={e => onChange(Number(e.target.value))} style={{ ...btn.input, width: 170 }}>{options.map(row => <option key={row.entryYear} value={row.entryYear}>{row.entryYear}년 입학생 · {row.currentGrade ? `${row.currentGrade}학년` : row.status}</option>)}</select></label>;
}
function BulkUpload({ gdb, persistGrades, showToast, currentGrade = "2" }) {
  const [entryYear, setEntryYear] = useState(entryYearForGrade(gdb.cohortSettings, Number(currentGrade) || 2));
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // { newSemesterData, newMockData, newAdmissionRows, found, skipped }
  const [applying, setApplying] = useState(false);

  const handleFile = async (file) => {
    setBusy(true);
    setPreview(null);
    try {
      const XLSX = await loadXLSX();
      const fileBuffer = await file.arrayBuffer();
      await yieldForUploadPaint();
      const wb = XLSX.read(fileBuffer, workbookReadOptions());
      const newSemesterData = { ...gdb.semesterData };
      const newMockData = { ...gdb.mockData };
      let newAdmissionRows = gdb.admissionRows;
      const found = [];
      const skipped = [];

      wb.SheetNames.forEach(name => {
        const cls = classifySheetName(name);
        if (!cls) { skipped.push(name); return; }
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null });
        if (cls.type === "semester") {
          const students = parseSemesterSheet(rows);
          const count = Object.keys(students).length;
          if (count) {
            newSemesterData[cohortDataKey(entryYear, cls.key)] = { students, entryYear, updatedAt: new Date().toISOString() };
            found.push(`${entryYear}년 입학생 · ${SEMESTER_LABELS[cls.key] || cls.key} 성적 — ${count}명`);
          } else skipped.push(`${name} (학생 데이터 인식 실패)`);
        } else if (cls.type === "mock") {
          const students = parseMockSheet(rows);
          const count = Object.keys(students).length;
          if (count) {
            newMockData[cohortDataKey(entryYear, cls.key)] = { students, entryYear, updatedAt: new Date().toISOString() };
            found.push(`${entryYear}년 입학생 · ${MOCK_MONTH_LABELS[cls.key] || cls.key} 모의고사 — ${count}명`);
          } else skipped.push(`${name} (학생 데이터 인식 실패)`);
        } else if (cls.type === "admission") {
          // 전형표와 별도의 "전형-반영비율" 시트를 함께 읽기 위해
          // 실제 대입 데이터 처리는 아래에서 통합 실행합니다.
        }
      });

      const workbookAdmissionRows = parseAdmissionWorkbook(wb, XLSX);
      if (workbookAdmissionRows && workbookAdmissionRows.length) {
        const targetGrade = gradeForEntryYear(gdb.cohortSettings, entryYear, currentGrade);
        const scopedRows = workbookAdmissionRows.map(row => ({ ...row, targetGrade, admissionYear: admissionYearForGrade(targetGrade) }));
        newAdmissionRows = [
          ...(gdb.admissionRows || []).filter(item => normalizeAdmissionTargetGrade(item?.targetGrade, 2) !== targetGrade),
          ...scopedRows,
        ];
        const curriculumCount = scopedRows.filter(row => (
          CURRICULUM_METHOD_FIELDS.some(([field]) => normalizeCurriculumMethod(row[field]) !== "미입력")
        )).length;
        found.push(`${targetGrade}학년 대입 전형표 — ${scopedRows.length}건 (반영비율 ${scopedRows.filter(row => admissionReflectionText(row)).length}건 · 내신반영 ${curriculumCount}건)`);
      }

      if (!found.length) {
        showToast("이 파일에서 인식 가능한 시트를 찾지 못했습니다. 시트 이름이 원본과 같은지 확인해주세요.", "error");
        setBusy(false);
        return;
      }
      setPreview({ newSemesterData, newMockData, newAdmissionRows, found, skipped });
      showToast(`${found.length}개 시트를 인식했습니다. 아래에서 확인 후 "반영하기"를 눌러주세요.`, "success");
    } catch (e) {
      showToast(`파일 오류: ${e.message}`, "error");
    }
    setBusy(false);
  };

  const apply = async () => {
    setApplying(true);
    const { newSemesterData, newMockData, newAdmissionRows } = preview;
    const ok = await persistGrades({ semesterData: newSemesterData, mockData: newMockData, admissionRows: newAdmissionRows });
    if (ok) { showToast(`저장했습니다. (${preview.found.length}개 시트 반영됨)`, "success"); setPreview(null); }
    setApplying(false);
  };

  return (
    <div>
      <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", border: `1.5px dashed #e6e1d3` }}>
        <FileSpreadsheet size={22} color="#8a8578" />
        <div style={{ fontWeight: 700, marginTop: 8 }}>원본 성적 엑셀 파일 통째로 업로드</div>
        <CohortSelector value={entryYear} onChange={setEntryYear} cohortSettings={gdb.cohortSettings} />
        <div style={{ fontSize: 12, color: "#8a8578", margin: "6px 0 12px", textAlign: "center", maxWidth: 480 }}>
          "1-1 성적"부터 "3-2 성적"까지의 학기 성적 시트와 "N학년 N월"(모의고사), "2028 대입 전형" 시트가 들어있는 원본 파일을 그대로 올려주세요.
          시트 이름을 보고 자동으로 종류를 구분해서 한 번에 전부 반영합니다.
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
        <button style={btn.primary} onClick={() => fileRef.current.click()} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} 파일 선택</button>
      </div>
      {preview && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: "#3d5c3a" }}>인식된 시트 ({preview.found.length}개) — 아직 저장되지 않았습니다</div>
          <ul style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 12.5 }}>{preview.found.map((f, i) => <li key={i}>{f}</li>)}</ul>
          {preview.skipped.length > 0 && (
            <>
              <div style={{ fontWeight: 700, marginBottom: 8, color: "#a39d8c" }}>인식하지 못해 건너뜀 ({preview.skipped.length}개)</div>
              <ul style={{ margin: "0 0 14px", paddingLeft: 18, fontSize: 12.5, color: "#a39d8c" }}>{preview.skipped.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn.primary} onClick={apply} disabled={applying}>{applying ? <Loader2 size={14} className="spin" /> : <Save size={14} />} 반영하기</button>
            <button style={btn.secondary} onClick={() => setPreview(null)}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SemesterUpload({ gdb, persistGrades, showToast }) {
  const [semKey, setSemKey] = useState("2-1");
  const [entryYear, setEntryYear] = useState(entryYearForGrade(gdb.cohortSettings, 2));
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // { students, count }
  const [applying, setApplying] = useState(false);

  const handleFile = async (file) => {
    setBusy(true);
    setPreview(null);
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
      const students = parseSemesterSheet(rows);
      const count = Object.keys(students).length;
      if (!count) { showToast("학생 데이터를 인식하지 못했습니다. 시트 형식을 확인해주세요.", "error"); setBusy(false); return; }
      setPreview({ students, count });
      showToast(`${count}명분을 인식했습니다. 아래에서 확인 후 "반영하기"를 눌러주세요.`, "success");
    } catch (e) {
      showToast(`파일 오류: ${e.message}`, "error");
    }
    setBusy(false);
  };

  const apply = async () => {
    setApplying(true);
    const ok = await persistGrades({ semesterData: { ...gdb.semesterData, [cohortDataKey(entryYear, semKey)]: { students: preview.students, entryYear, updatedAt: new Date().toISOString() } } });
    if (ok) { showToast(`저장했습니다. (${SEMESTER_LABELS[semKey]} ${preview.count}명)`, "success"); setPreview(null); }
    setApplying(false);
  };

  const removeSemester = async (k) => {
    const updated = { ...gdb.semesterData };
    delete updated[cohortDataKey(entryYear, k)];
    const ok = await persistGrades({ semesterData: updated });
    if (ok) showToast(`${SEMESTER_LABELS[k]} 데이터를 삭제했습니다.`, "success");
  };

  return (
    <div>
      <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", border: `1.5px dashed #e6e1d3` }}>
        <FileSpreadsheet size={22} color="#8a8578" />
        <div style={{ fontWeight: 700, marginTop: 8 }}>학기별 성적표 업로드</div>
        <CohortSelector value={entryYear} onChange={setEntryYear} cohortSettings={gdb.cohortSettings} />
        <div style={{ fontSize: 12, color: "#8a8578", margin: "6px 0 12px", textAlign: "center" }}>엑셀의 "N-N 성적" 시트를 그대로 올려주세요. (A~E: 학번,학년,학급,번호,이름 / F열부터 과목당 6칸: 합계,원점수,성취도,석차등급,석차,수강자수)</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {SEMESTER_KEYS.map(k => <button key={k} onClick={() => setSemKey(k)} style={{ ...btn.chip, ...(semKey === k ? btn.chipActive : {}) }}>{SEMESTER_LABELS[k]}</button>)}
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
        <button style={btn.primary} onClick={() => fileRef.current.click()} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} {SEMESTER_LABELS[semKey]} 파일 선택</button>
      </div>
      {preview && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: "#3d5c3a" }}>{SEMESTER_LABELS[semKey]} — {preview.count}명 인식됨 (아직 저장되지 않았습니다)</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn.primary} onClick={apply} disabled={applying}>{applying ? <Loader2 size={14} className="spin" /> : <Save size={14} />} 반영하기</button>
            <button style={btn.secondary} onClick={() => setPreview(null)}>취소</button>
          </div>
        </div>
      )}
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>현재 업로드 현황</div>
        {SEMESTER_KEYS.map(k => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #f0eee6" }}>
            <span>{SEMESTER_LABELS[k]}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: cohortRecord(gdb.semesterData, entryYear, k) ? "#3d5c3a" : "#a39d8c" }}>{cohortRecord(gdb.semesterData, entryYear, k) ? `${Object.keys(cohortRecord(gdb.semesterData, entryYear, k).students).length}명 (${new Date(cohortRecord(gdb.semesterData, entryYear, k).updatedAt).toLocaleDateString("ko-KR")})` : "미등록"}</span>
              {cohortRecord(gdb.semesterData, entryYear, k) && <button style={btn.link} onClick={() => removeSemester(k)}>삭제</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// 모의고사 월별 시트 파싱: id열은 "학번" 또는 "신학번".
// 헤더에 "국어"가 원점수 구간과 등급 구간에 각각 한 번씩(총 2번) 나오는데,
// "등급" 문구 자체는 시트마다 위치가 달라 신뢰할 수 없어서(예: 오래된 시트는
// 한참 오른쪽의 "등급컷" 안내문에도 "등급"이 들어있어 오탐 발생) 대신
// "국어"가 두 번째로 나오는 위치를 등급 구간의 시작으로 사용합니다.
function parseMockSheet(rows) {
  const header = rows[0] || [];
  let sidCol = header.findIndex(h => h != null && /^(신)?학번$/.test(String(h).trim()));
  if (sidCol === -1) sidCol = 0;
  const koreanOccurrences = [];
  header.forEach((h, i) => { if (h != null && String(h).trim() === "국어") koreanOccurrences.push(i); });
  const scoreStartCol = koreanOccurrences.length >= 2 ? koreanOccurrences[0] : null;
  // 과목명이 한 번만 나오면 기존 양식의 등급 구간으로 간주하고 원점수로 중복 해석하지 않습니다.
  const gradeStartCol = koreanOccurrences.length >= 2 ? koreanOccurrences[1] : (koreanOccurrences[0] ?? null);
  const totalCol = header.findIndex(h => h != null && /^(총점|합계|총점수)$/.test(String(h).replace(/\s/g, "")));
  const students = {};
  if (gradeStartCol == null && scoreStartCol == null) return students;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (!row) continue;
    const sid = row[sidCol]; if (!sid || isNaN(Number(sid))) continue;
    const result = {};
    const scores = {};
    MOCK_SUBJECTS.forEach((subj, i) => {
      const gradeValue = gradeStartCol == null ? null : row[gradeStartCol + i];
      const scoreValue = scoreStartCol == null ? null : row[scoreStartCol + i];
      if (gradeValue !== null && gradeValue !== undefined && gradeValue !== "" && !isNaN(Number(gradeValue))) result[subj] = Number(gradeValue);
      if (scoreValue !== null && scoreValue !== undefined && scoreValue !== "" && !isNaN(Number(scoreValue))) scores[subj] = Number(scoreValue);
    });
    if (Object.keys(scores).length) result._scores = scores;
    const explicitTotal = totalCol >= 0 && Number.isFinite(Number(row[totalCol])) ? Number(row[totalCol]) : null;
    const computedTotal = Object.values(scores).reduce((sum, value) => sum + Number(value || 0), 0);
    if (explicitTotal != null || Object.keys(scores).length) result._total = explicitTotal ?? computedTotal;
    if (Object.keys(result).length) students[String(sid).trim().replace(/\.0$/, "")] = result;
  }
  return students;
}

function MockUpload({ gdb, persistGrades, showToast }) {
  const [monthKey, setMonthKey] = useState("2-6");
  const [entryYear, setEntryYear] = useState(entryYearForGrade(gdb.cohortSettings, 2));
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [applying, setApplying] = useState(false);

  const handleFile = async (file) => {
    setBusy(true);
    setPreview(null);
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
      const students = parseMockSheet(rows);
      const count = Object.keys(students).length;
      if (!count) { showToast('학생 데이터를 인식하지 못했습니다. "학번"(또는 신학번) 열이 있는지 확인해주세요.', "error"); setBusy(false); return; }
      setPreview({ students, count });
      showToast(`${count}명분을 인식했습니다. 아래에서 확인 후 "반영하기"를 눌러주세요.`, "success");
    } catch (e) {
      showToast(`파일 오류: ${e.message}`, "error");
    }
    setBusy(false);
  };

  const apply = async () => {
    setApplying(true);
    const ok = await persistGrades({ mockData: { ...gdb.mockData, [cohortDataKey(entryYear, monthKey)]: { students: preview.students, entryYear, updatedAt: new Date().toISOString() } } });
    if (ok) { showToast(`저장했습니다. (${MOCK_MONTH_LABELS[monthKey]} ${preview.count}명)`, "success"); setPreview(null); }
    setApplying(false);
  };

  const removeMock = async (k) => {
    const updated = { ...gdb.mockData };
    delete updated[cohortDataKey(entryYear, k)];
    const ok = await persistGrades({ mockData: updated });
    if (ok) showToast(`${MOCK_MONTH_LABELS[k]} 모의고사 데이터를 삭제했습니다.`, "success");
  };

  return (
    <div>
      <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", border: `1.5px dashed #e6e1d3` }}>
        <FileSpreadsheet size={22} color="#8a8578" />
        <div style={{ fontWeight: 700, marginTop: 8 }}>모의고사 성적 업로드</div>
        <CohortSelector value={entryYear} onChange={setEntryYear} cohortSettings={gdb.cohortSettings} />
        <div style={{ fontSize: 12, color: "#8a8578", margin: "6px 0 12px", textAlign: "center" }}>1행에 "학번"과 과목명(국어,수학,영어,한국사,통합사회,통합과학) 헤더가 있는 엑셀을 올려주세요.</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", justifyContent: "center" }}>
          {MOCK_MONTH_KEYS.map(k => <button key={k} onClick={() => setMonthKey(k)} style={{ ...btn.chip, ...(monthKey === k ? btn.chipActive : {}) }}>{MOCK_MONTH_LABELS[k]}</button>)}
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
        <button style={btn.primary} onClick={() => fileRef.current.click()} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} {MOCK_MONTH_LABELS[monthKey]} 파일 선택</button>
      </div>
      {preview && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: "#3d5c3a" }}>{MOCK_MONTH_LABELS[monthKey]} — {preview.count}명 인식됨 (아직 저장되지 않았습니다)</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn.primary} onClick={apply} disabled={applying}>{applying ? <Loader2 size={14} className="spin" /> : <Save size={14} />} 반영하기</button>
            <button style={btn.secondary} onClick={() => setPreview(null)}>취소</button>
          </div>
        </div>
      )}
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>현재 업로드 현황</div>
        {MOCK_MONTH_KEYS.map(k => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #f0eee6" }}>
            <span>{MOCK_MONTH_LABELS[k]}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: cohortRecord(gdb.mockData, entryYear, k) ? "#3d5c3a" : "#a39d8c" }}>{cohortRecord(gdb.mockData, entryYear, k) ? `${Object.keys(cohortRecord(gdb.mockData, entryYear, k).students).length}명` : "미등록"}</span>
              {cohortRecord(gdb.mockData, entryYear, k) && <button style={btn.link} onClick={() => removeMock(k)}>삭제</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdmissionUpload({ gdb, persistGrades, showToast, currentGrade = "2" }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState(null);
  const [diagnosis, setDiagnosis] = useState(null);
  const [targetGrade, setTargetGrade] = useState(normalizeAdmissionTargetGrade(currentGrade, 2));
  const currentGradeRows = useMemo(() => admissionItemsForGrade(gdb.admissionRows || [], targetGrade), [gdb.admissionRows, targetGrade]);

  useEffect(() => {
    // 파일을 고른 뒤 SheetJS 모듈을 처음 내려받느라 기다리는 시간을 줄입니다.
    loadXLSX().catch(() => null);
  }, []);

  const handleFile = async (file) => {
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    setBusy(true);
    setPreview(null);
    setDiagnosis(null);
    setProgress({ step: "파일 준비", detail: `${file.name} · ${(file.size / 1024).toFixed(0)}KB`, percent: 10 });
    try {
      await yieldForUploadPaint();
      const XLSX = await loadXLSX();

      setProgress({ step: "파일 읽기", detail: "브라우저에서 엑셀 파일을 읽고 있습니다.", percent: 28 });
      await yieldForUploadPaint();
      const fileBuffer = await file.arrayBuffer();

      setProgress({ step: "워크북 해석", detail: "시트 구조와 셀 데이터를 확인하고 있습니다.", percent: 48 });
      await yieldForUploadPaint();
      const wb = XLSX.read(fileBuffer, workbookReadOptions());

      setProgress({ step: "관련 시트 선별", detail: `${wb.SheetNames.length}개 시트 중 대입 전형·반영비율 시트만 찾고 있습니다.`, percent: 68 });
      await yieldForUploadPaint();
      const parsedAdmissionRows = parseAdmissionWorkbook(wb, XLSX);
      if (!parsedAdmissionRows) {
        showToast('열 이름을 확인해주세요: "대학교/대학명", "수능최저 반영 과목수/반영 교과수", "수능최저 합/최저합 기준"', "error");
        return;
      }

      setProgress({ step: "데이터 결합", detail: "대입 전형과 교과 반영 방식을 연결하고 있습니다.", percent: 88 });
      await yieldForUploadPaint();

      const admissionRows = parsedAdmissionRows.map(row => ({ ...row, targetGrade, admissionYear: admissionYearForGrade(targetGrade) }));
      const reflectionCount = admissionRows.filter(row => admissionReflectionText(row)).length;
      const curriculumCount = admissionRows.filter(row => (
        CURRICULUM_METHOD_FIELDS.some(([field]) => normalizeCurriculumMethod(row[field]) !== "미입력")
      )).length;
      const elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
      const parseMeta = parsedAdmissionRows._parseMeta || {};
      const serializedBytes = new TextEncoder().encode(JSON.stringify(admissionRows)).length;

      setPreview(admissionRows);
      setDiagnosis({
        fileName: file.name,
        fileSize: file.size,
        elapsedMs,
        totalSheets: parseMeta.totalSheets || wb.SheetNames.length,
        inspectedSheets: parseMeta.inspectedSheets ?? wb.SheetNames.length,
        fullyReadSheets: parseMeta.fullyReadSheets ?? wb.SheetNames.length,
        baseSheet: parseMeta.baseSheet || "-",
        lookupSheets: parseMeta.lookupSheets || [],
        rowCount: admissionRows.length,
        reflectionCount,
        curriculumCount,
        serializedBytes,
      });
      setProgress({ step: "분석 완료", detail: `${admissionRows.length}건을 인식했습니다.`, percent: 100 });
      showToast(`${admissionRows.length}건을 인식했습니다. (반영비율 ${reflectionCount}건 · 내신반영 ${curriculumCount}건 · ${(elapsedMs / 1000).toFixed(1)}초)`, (reflectionCount || curriculumCount) ? "success" : "info");
    } catch (e) {
      showToast(`파일 오류: ${e.message}`, "error");
      setProgress({ step: "분석 실패", detail: e?.message || String(e), percent: 0, error: true });
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setApplying(true);
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const nextRows = [
      ...(gdb.admissionRows || []).filter(item => normalizeAdmissionTargetGrade(item?.targetGrade, 2) !== targetGrade),
      ...(preview || []).map(item => ({ ...item, targetGrade })),
    ];
    const ok = await persistGrades({ admissionRows: nextRows });
    const elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
    if (ok) {
      showToast(`${targetGrade}학년 대입 전형표를 저장했습니다. (${preview.length}건 · ${(elapsedMs / 1000).toFixed(1)}초)`, "success");
      setPreview(null);
      setProgress(null);
      setDiagnosis(value => value ? { ...value, saveElapsedMs: elapsedMs } : value);
    }
    setApplying(false);
  };

  const removeAll = async () => {
    const nextRows = (gdb.admissionRows || []).filter(item => normalizeAdmissionTargetGrade(item?.targetGrade, 2) !== targetGrade);
    const ok = await persistGrades({ admissionRows: nextRows });
    if (ok) showToast(`${targetGrade}학년 대입 전형표를 삭제했습니다.`, "success");
  };

  return (
    <div>
      <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", border: `1.5px dashed #d7dfec`, background: "linear-gradient(135deg,#fbfdff,#faf9ff)" }}>
        <FileSpreadsheet size={22} color="#58739a" />
        <div style={{ fontWeight: 800, marginTop: 8 }}>대입 전형표 업로드</div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, marginBottom: 6 }}>
          {[1,2,3].map(gradeValue => <button key={gradeValue} type="button" onClick={() => { setTargetGrade(gradeValue); setPreview(null); setProgress(null); setDiagnosis(null); }} style={{ ...btn.chip, ...(targetGrade === gradeValue ? btn.chipActive : {}) }}>{gradeValue}학년</button>)}
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: "#536987", marginBottom: 4 }}>{targetGrade}학년 학생용 · {admissionYearForGrade(targetGrade)}학년도 대입 자료</div>
        <div style={{ fontSize: 12, color: "#758095", margin: "6px 0 12px", textAlign: "center", maxWidth: 620, lineHeight: 1.55 }}>
          원본 엑셀 파일에서 대입 전형표와 전형·반영비율 시트만 선별하여 읽습니다. 성적·모의고사 시트는 전형표 분석에서 제외합니다.
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
        <button style={btn.primary} onClick={() => fileRef.current.click()} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} {busy ? "분석 중" : "파일 선택"}</button>
        {progress && (
          <div style={{ width: "min(620px,100%)", marginTop: 13, padding: "10px 12px", border: `1px solid ${progress.error ? "#efc5c2" : "#dbe4f1"}`, borderRadius: 10, background: progress.error ? "#fff6f5" : "#fff" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 11.5 }}>
              <b style={{ color: progress.error ? "#a4433d" : "#3f587d" }}>{progress.step}</b>
              <span style={{ color: "#7a8495", fontWeight: 800 }}>{progress.percent}%</span>
            </div>
            <div style={{ height: 6, marginTop: 7, borderRadius: 999, background: "#edf1f6", overflow: "hidden" }}><div style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%`, height: "100%", background: progress.error ? "#c9625a" : "linear-gradient(90deg,#5578a7,#7465a7)", transition: "width .2s ease" }} /></div>
            <div style={{ marginTop: 6, color: "#758095", fontSize: 10.5, lineHeight: 1.4 }}>{progress.detail}</div>
          </div>
        )}
      </div>

      {preview && (
        <div style={{ ...card, borderTop: "4px solid #58739a" }}>
          <div style={{ fontWeight: 800, marginBottom: 6, color: "#304c75" }}>{preview.length}건 인식됨 · 아직 저장되지 않았습니다</div>
          <div style={{ fontSize: 12, color: diagnosis?.reflectionCount ? "#2f7149" : "#a3402b", marginBottom: 5 }}>
            교과 반영비율 인식: {diagnosis?.reflectionCount ?? preview.filter(row => admissionReflectionText(row)).length}건
          </div>
          <div style={{ fontSize: 12, color: diagnosis?.curriculumCount ? "#2f7149" : "#a3402b", marginBottom: 10 }}>
            공통·일반·진로·융합선택 반영 방식 인식: {diagnosis?.curriculumCount ?? preview.filter(row => CURRICULUM_METHOD_FIELDS.some(([field]) => normalizeCurriculumMethod(row[field]) !== "미입력")).length}건
          </div>
          {diagnosis && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 7, margin: "10px 0 12px" }}>
              {[
                ["분석 시간", `${(diagnosis.elapsedMs / 1000).toFixed(1)}초`],
                ["전체 시트", `${diagnosis.totalSheets}개`],
                ["전체 읽은 시트", `${diagnosis.fullyReadSheets}개`],
                ["저장 예상량", `${(diagnosis.serializedBytes / 1024).toFixed(0)}KB`],
              ].map(([label, value]) => <div key={label} style={{ minWidth: 0, padding: "9px 10px", borderRadius: 9, background: "#f6f8fc", border: "1px solid #e0e6f0" }}><small style={{ display: "block", color: "#7a8495", fontSize: 9.5, fontWeight: 800 }}>{label}</small><b style={{ display: "block", marginTop: 3, color: "#304c75", fontSize: 13 }}>{value}</b></div>)}
              <div style={{ gridColumn: "1 / -1", padding: "8px 10px", borderRadius: 9, background: "#fbfaf7", border: "1px solid #ebe5d8", fontSize: 10.5, color: "#716b5f" }}>
                기준 시트 <b>{diagnosis.baseSheet}</b>
                {diagnosis.lookupSheets?.length ? ` · 결합 시트 ${diagnosis.lookupSheets.join(", ")}` : ""}
              </div>
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn.primary} onClick={apply} disabled={applying}>{applying ? <Loader2 size={14} className="spin" /> : <Save size={14} />} {applying ? "Firestore 저장 중" : "반영하기"}</button>
            <button style={btn.secondary} onClick={() => { setPreview(null); setProgress(null); setDiagnosis(null); }}>취소</button>
          </div>
        </div>
      )}

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{targetGrade}학년 현재 등록: {currentGradeRows.length}건</span>
          {currentGradeRows.length > 0 && <button style={btn.link} onClick={removeAll}>{targetGrade}학년 삭제</button>}
        </div>
        <div style={{ fontSize: 10.5, color: "#8a8578", lineHeight: 1.5 }}>
          파일 선택 후 오래 걸리면 <b>분석 시간·전체 읽은 시트</b>를 확인하세요. 반영하기 후 오래 걸리면 저장 예상량과 학교 네트워크의 Firestore 연결 상태를 확인할 수 있습니다.
        </div>
      </div>
    </div>
  );
}

function AdmissionPdfManager({ gdb, persistGrades, showToast, currentGrade = "2" }) {
  const fileRef = useRef(null);
  const zipRef = useRef(null);
  const [documentType, setDocumentType] = useState("guide");
  const [listFilter, setListFilter] = useState("all");
  const [targetGrade, setTargetGrade] = useState(normalizeAdmissionTargetGrade(currentGrade, 2));
  const [university, setUniversity] = useState("");
  const [campus, setCampus] = useState("");
  const [region, setRegion] = useState("미지정");
  const [label, setLabel] = useState("");
  const [year, setYear] = useState(String(admissionYearForGrade(normalizeAdmissionTargetGrade(currentGrade, 2))));
  const [busy, setBusy] = useState(false);
  const [batchPreview, setBatchPreview] = useState(null);
  const [batchProgress, setBatchProgress] = useState("");
  const [batchStats, setBatchStats] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editUniversity, setEditUniversity] = useState("");
  const [editRegion, setEditRegion] = useState("미지정");
  const [editType, setEditType] = useState("guide");
  const [editLabel, setEditLabel] = useState("");
  const [editTargetGrade, setEditTargetGrade] = useState(normalizeAdmissionTargetGrade(currentGrade, 2));
  const [diagnosis, setDiagnosis] = useState(null);
  const [batchStorageMode, setBatchStorageMode] = useState("");
  const [batchErrors, setBatchErrors] = useState([]);
  const [missingQuery, setMissingQuery] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]);
  const uploadTimerRef = useRef(null);
  const uploadStartedAtRef = useRef(0);

  const stopUploadTimer = useCallback(() => {
    if (uploadTimerRef.current) clearInterval(uploadTimerRef.current);
    uploadTimerRef.current = null;
  }, []);
  const startUploadTimer = useCallback(() => {
    stopUploadTimer();
    uploadStartedAtRef.current = performance.now();
    uploadTimerRef.current = setInterval(() => {
      const elapsed = Math.round(performance.now() - uploadStartedAtRef.current);
      setBatchStats(current => current ? { ...current, elapsed } : current);
    }, 250);
  }, [stopUploadTimer]);
  useEffect(() => () => stopUploadTimer(), [stopUploadTimer]);
  useEffect(() => {
    setYear(String(admissionYearForGrade(targetGrade)));
    setUniversity("");
    setCampus("");
    setRegion("미지정");
    setLabel("");
    setPendingFiles([]);
    setBatchPreview(null);
    setMissingQuery("");
  }, [targetGrade]);

  const selectedAdmissionRows = admissionItemsForGrade(gdb.admissionRows || [], targetGrade);
  const allDocs = admissionItemsForGrade(gdb.admissionDocs || [], targetGrade)
    .map(item => normalizeAdmissionDocumentRecord({
      ...item,
      university: admissionUniversityDisplayName(resolveKnownUniversityBaseName(item?.university || "", selectedAdmissionRows)),
    }))
    .slice().sort((a, b) => (
      String(a.region || "미지정").localeCompare(String(b.region || "미지정"), "ko")
      || String(a.university || "").localeCompare(String(b.university || ""), "ko")
      || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
    ));
  const docs = listFilter === "all" ? allDocs : allDocs.filter(item => admissionDocumentType(item) === listFilter);
  const universityEntryOptions = [...selectedAdmissionRows, ...allDocs]
    .map(item => ({ name: String(item?.university || "").trim(), region: String(item?.region || "미지정") }))
    .filter(item => item.name);
  const universityOptions = Array.from(new Set(universityEntryOptions.map(item => admissionUniversityDisplayName(item.name)))).sort((a, b) => a.localeCompare(b, "ko"));
  const regionByUniversity = new Map();
  [...selectedAdmissionRows, ...allDocs].forEach(item => {
    if (!item?.university || !item?.region) return;
    regionByUniversity.set(universityDocumentKey(item.university, item.region), item.region);
    if (!regionByUniversity.has(universityKey(item.university))) regionByUniversity.set(universityKey(item.university), item.region);
  });
  const admissionUniversityEntries = Array.from(new Map(
    selectedAdmissionRows
      .map(row => ({ name:String(row.university || "").trim(), region:String(row.region || "미지정") }))
      .filter(item => item.name)
      .map(item => [universityDocumentKey(item.name,item.region), item])
  ).values()).sort((a,b)=>a.name.localeCompare(b.name,"ko")||a.region.localeCompare(b.region,"ko"));
  const requiredDocumentType = documentType === "reflection" ? "reflection" : "guide";
  const requiredDocumentIndex = buildAdmissionDocumentIndex(
    allDocs.filter(item => admissionDocumentType(item) === requiredDocumentType),
  );
  const missingDocumentUniversities = admissionUniversityEntries.filter(item => (
    admissionDocumentsForRow(requiredDocumentIndex, { university:item.name, region:item.region }).length === 0
  ));
  const visibleMissingDocumentUniversities = missingDocumentUniversities.filter(item => {
    const query = String(missingQuery || "").trim().toLowerCase();
    return !query || `${item.name} ${item.region}`.toLowerCase().includes(query);
  });

  const openFilePicker = useCallback((inputRef, pickerLabel) => {
    if (busy) return;
    const input = inputRef?.current;
    if (!input) {
      showToast(`${pickerLabel} 입력창을 찾지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.`, "error");
      return;
    }
    try {
      input.value = "";
      if (typeof input.showPicker === "function") input.showPicker();
      else input.click();
    } catch (error) {
      try { input.click(); }
      catch (fallbackError) {
        showToast(`${pickerLabel} 창을 열지 못했습니다. (${fallbackError?.message || error?.message || "브라우저 권한 오류"})`, "error");
      }
    }
  }, [busy, showToast]);

  const typeLabel = type => type === "reflection" ? "교과 반영표" : "모집요강";
  const defaultLabel = (type, valueYear, universityName = university) => admissionDocumentDisplayLabel(type, valueYear, universityName);
  const makeDocumentItem = (uploaded, values) => {
    const normalizedUniversity = admissionUniversityDisplayName(resolveKnownUniversityBaseName(values.university, universityEntryOptions));
    const normalizedRegion = values.region || "미지정";
    const normalizedType = values.documentType || uploaded.documentType || "guide";
    return normalizeAdmissionDocumentRecord({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      university: normalizedUniversity,
      region: normalizedRegion,
      campus: values.campus || admissionCampusLabel(normalizedUniversity, normalizedRegion) || "",
      targetGrade: normalizeAdmissionTargetGrade(values.targetGrade, targetGrade),
      documentType: normalizedType,
      label: normalizeAdmissionDocumentLabel(values.label, normalizedUniversity, normalizedType, String(values.year || "").trim()),
      year: String(values.year || "").trim(),
      fileName: uploaded.fileName,
      size: uploaded.size,
      contentType: uploaded.contentType,
      url: uploaded.url,
      storagePath: uploaded.path,
      dataKey: uploaded.dataKey || "",
      storageMode: uploaded.storageMode || "firebase-storage",
      storageBucket: uploaded.storageBucket || "",
      updatedAt: new Date().toISOString(),
    });
  };

  const handleUpload = async (files, options = {}) => {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return { saved: 0, failed: 0, skipped: 0 };

    const existingKeys = new Set((gdb.admissionDocs || []).map(item => admissionDocumentSemanticKey(item, targetGrade)));
    const seenKeys = new Set(existingKeys);
    const skippedItems = [];
    const queue = [];

    selectedFiles.forEach(file => {
      const identity = resolveAdmissionDocumentIdentity(file.name, universityEntryOptions, universityNameWithCampus(university.trim(), campus), region);
      const resolvedUniversity = admissionUniversityDisplayName(identity.university);
      const resolvedYear = inferAdmissionYearFromFileName(file.name, year);
      const resolvedRegion = identity.region || "미지정";
      const candidate = {
        file,
        identity: { ...identity, university: resolvedUniversity, region: resolvedRegion },
        resolvedUniversity,
        resolvedYear,
        resolvedRegion,
        semanticKey: admissionDocumentSemanticKey({
          university: resolvedUniversity,
          region: resolvedRegion,
          campus: identity.campus,
          targetGrade,
          documentType,
          year: resolvedYear,
        }, targetGrade),
      };
      if (seenKeys.has(candidate.semanticKey)) {
        skippedItems.push(candidate);
      } else {
        seenKeys.add(candidate.semanticKey);
        queue.push(candidate);
      }
    });

    if (!queue.length) {
      setBatchStats({ total: selectedFiles.length, queued: 0, saved: 0, failed: 0, skipped: skippedItems.length, elapsed: 0, mode: "중복 검사 완료" });
      setPendingFiles([]);
      if (fileRef.current) fileRef.current.value = "";
      showToast(`${skippedItems.length}건 모두 이미 등록된 같은 대학·캠퍼스·학년도·자료 유형이어서 중복 제외했습니다. 기존 자료를 교체하려면 목록에서 먼저 삭제해주세요.`, "success");
      return { saved: 0, failed: 0, skipped: skippedItems.length };
    }

    setBusy(true);
    setBatchErrors([]);
    setBatchProgress("중복 검사를 마치고 파일 저장 경로를 확인하고 있습니다.");
    setBatchStats({ total: selectedFiles.length, queued: queue.length, saved: 0, failed: 0, skipped: skippedItems.length, elapsed: 0, mode: "저장소 확인 중" });
    startUploadTimer();
    const uploadedItems = [];
    const errors = [];
    try {
      const backend = await diagnoseAdmissionFileBackends({ storageTimeoutMs: 6000, firestoreTimeoutMs: 12000 });
      setDiagnosis({
        ok: backend.ok,
        bucket: backend.selectedBucket || backend.storage?.bucket || "",
        configuredBucket: backend.storage?.configuredBucket || "",
        authenticated: backend.storage?.authenticated,
        storage: backend.storage,
        firestore: backend.firestore,
        code: backend.storage?.code || backend.firestore?.code || "",
        error: backend.ok ? "" : `Storage: ${backend.storage?.error || "실패"} / Firestore: ${backend.firestore?.error || "실패"}`,
      });
      if (!backend.ok) throw new Error(`파일 저장소를 사용할 수 없습니다. Storage: ${backend.storage?.error || "실패"} / Firestore: ${backend.firestore?.error || "실패"}`);
      const useFirestoreFallback = backend.recommendedMode === "firestore-binary";
      const modeName = useFirestoreFallback ? "Firestore 대체 저장" : `Firebase Storage${backend.selectedBucket ? ` · ${backend.selectedBucket}` : ""}`;
      setBatchStorageMode(modeName);
      setBatchStats(current => ({ ...current, mode: modeName }));

      for (let index = 0; index < queue.length; index += 1) {
        const item = queue[index];
        const { file, identity, resolvedUniversity, resolvedYear, resolvedRegion } = item;
        setBatchProgress(`${file.name} 저장 중 (${index + 1}/${queue.length})`);
        try {
          const uploaded = await uploadAdmissionDocument(file, resolvedUniversity, documentType, {
            targetGrade,
            admissionYear: resolvedYear,
            campus: identity.campus,
            region: resolvedRegion,
            forceFirestoreFallback: useFirestoreFallback,
            allowFirestoreFallback: true,
            storageBucket: backend.selectedBucket,
            storageTimeoutMs: 20000,
            storageWarning: backend.storage?.error || "Storage 진단 실패",
            firestoreConcurrency: 1,
            onProgress: progress => {
              const percent = Number(progress?.percent || 0);
              const detail = progress?.phase === "firestore-binary"
                ? `분할 저장 ${progress.completedChunks || 0}/${progress.totalChunks || 0}`
                : `전송 ${percent}%`;
              setBatchProgress(`${file.name} · ${detail} (${index + 1}/${queue.length})`);
            },
          });
          const doc = makeDocumentItem(uploaded, {
            university: resolvedUniversity,
            region: resolvedRegion,
            campus: identity.campus,
            targetGrade,
            label: selectedFiles.length === 1 ? label : "",
            year: resolvedYear,
            documentType,
          });
          const nextDocs = deduplicateAdmissionDocuments([...(gdb.admissionDocs || []), ...uploadedItems.map(saved => saved.doc), doc]);
          setBatchProgress(`${file.name} 파일 저장 완료 · 목록 저장 중`);
          const ok = await persistGrades({ admissionDocs: nextDocs });
          if (!ok) {
            await deleteAdmissionPdf(uploaded.path || uploaded.dataKey, uploaded.storageBucket).catch(() => null);
            throw new Error("파일은 저장됐지만 대학 자료 목록 저장에 실패했습니다.");
          }
          uploadedItems.push({ uploaded, doc });
          setBatchStats(current => ({ ...current, saved: uploadedItems.length, failed: errors.length }));
        } catch (error) {
          const detail = error?.code || error?.message || String(error);
          errors.push({ fileName: file.name, university: resolvedUniversity, error: detail });
          setBatchErrors([...errors]);
          setBatchStats(current => ({ ...current, saved: uploadedItems.length, failed: errors.length }));
        }
      }
      if (errors.length) {
        showToast(`${uploadedItems.length}건 저장 · ${errors.length}건 실패${skippedItems.length ? ` · ${skippedItems.length}건 중복 제외` : ""}. 아래 오류 내용을 확인해주세요.`, "error");
      } else {
        showToast(`${uploadedItems.length}건을 등록했습니다.${skippedItems.length ? ` ${skippedItems.length}건은 같은 대학·학년도·자료 유형으로 이미 등록되어 제외했습니다.` : ""}`, "success");
        setLabel("");
        if (options.resetForm || selectedFiles.length === 1) {
          setUniversity("");
          setCampus("");
          setRegion("미지정");
          setLabel("");
          setYear(String(admissionYearForGrade(targetGrade)));
          setPendingFiles([]);
        }
      }
    } catch (error) {
      const detail = error?.code || error?.message || String(error);
      errors.push({ fileName: "저장소 진단", university: "", error: detail });
      setBatchErrors(current => [...current, { fileName: "저장소 진단", university: "", error: detail }]);
      showToast(`자료 업로드 실패: ${detail}`, "error");
    } finally {
      stopUploadTimer();
      setBatchStats(current => current ? { ...current, elapsed: Math.round(performance.now() - uploadStartedAtRef.current) } : current);
      setBusy(false);
      setBatchProgress("");
      if (fileRef.current) fileRef.current.value = "";
    }
    return { saved: uploadedItems.length, failed: errors.length, skipped: skippedItems.length };
  };

  const handleZip = async zipFile => {
    setBusy(true);
    setBatchPreview(null);
    setBatchStats(null);
    setBatchProgress("압축파일을 분석하고 있습니다.");
    try {
      if (!/\.zip$/i.test(zipFile.name || "")) throw new Error("ZIP 압축파일만 선택할 수 있습니다.");
      if (zipFile.size > 500 * 1024 * 1024) throw new Error("ZIP 파일은 500MB 이하만 처리할 수 있습니다.");
      const extracted = await extractPdfFilesFromZip(zipFile, {
        maxFiles: 100,
        maxTotalBytes: 500 * 1024 * 1024,
        onProgress: (current, total) => setBatchProgress(`PDF를 읽는 중입니다. (${current}/${total})`),
      });
      const items = extracted.map((entry, index) => {
        const fileName = entry.name;
        const file = new File([entry.blob], fileName, { type: "application/pdf", lastModified: zipFile.lastModified || Date.now() });
        const identity = resolveAdmissionDocumentIdentity(fileName, universityEntryOptions, "", "미지정");
        const inferredYear = inferAdmissionYearFromFileName(fileName, year);
        return {
          id: `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
          file,
          fileName,
          university: admissionUniversityDisplayName(identity.university),
          region: identity.region,
          campus: identity.campus,
          targetGrade,
          label: defaultLabel("guide", inferredYear, identity.university),
          year: inferredYear,
          documentType: "guide",
        };
      });
      setBatchPreview(items);
      setBatchProgress("");
      showToast(`${items.length}개의 모집요강 PDF를 인식했습니다. 대학명과 지역을 확인해주세요.`, "success");
    } catch (error) {
      showToast(`ZIP 분석 실패: ${error?.message || error}`, "error");
      setBatchProgress("");
    } finally {
      setBusy(false);
      if (zipRef.current) zipRef.current.value = "";
    }
  };

  const updateBatchItem = (id, patch) => setBatchPreview(items => (items || []).map(item => item.id === id ? { ...item, ...patch } : item));
  const removeBatchItem = id => setBatchPreview(items => (items || []).filter(item => item.id !== id));

  const uploadBatch = async () => {
    const items = batchPreview || [];
    if (!items.length) return;
    if (items.some(item => !String(item.university || "").trim())) {
      showToast("대학명이 비어 있는 파일이 있습니다.", "error");
      return;
    }
    setBusy(true);
    setBatchErrors([]);
    startUploadTimer();
    const existingDocs = deduplicateAdmissionDocuments(gdb.admissionDocs || []);
    const seenKeys = new Set(existingDocs.map(item => admissionDocumentSemanticKey(item, targetGrade)));
    const skipped = [];
    const queue = [];
    items.forEach(item => {
      const normalizedItem = {
        ...item,
        university: admissionUniversityDisplayName(resolveKnownUniversityBaseName(item.university, universityEntryOptions)),
        region: item.region || "미지정",
        documentType: item.documentType || "guide",
      };
      const key = admissionDocumentSemanticKey(normalizedItem, targetGrade);
      if (seenKeys.has(key)) skipped.push(normalizedItem);
      else {
        seenKeys.add(key);
        queue.push(normalizedItem);
      }
    });
    const failures = [];
    const completedIds = new Set(skipped.map(item => item.id));
    let persistedDocs = existingDocs;
    let savedCount = 0;
    setBatchStats({ total: items.length, queued: queue.length, saved: 0, failed: 0, skipped: skipped.length, elapsed: 0, mode: "저장소 확인 중" });
    setBatchProgress("Firebase Storage와 Firestore 파일 저장 경로를 동시에 진단하고 있습니다.");
    try {
      const backend = await diagnoseAdmissionFileBackends({ storageTimeoutMs: 6000, firestoreTimeoutMs: 12000 });
      setDiagnosis({
        ok: backend.ok,
        bucket: backend.selectedBucket || backend.storage?.bucket || "",
        configuredBucket: backend.storage?.configuredBucket || "",
        authenticated: backend.storage?.authenticated,
        storage: backend.storage,
        firestore: backend.firestore,
        code: backend.storage?.code || backend.firestore?.code || "",
        error: backend.ok ? "" : `Storage: ${backend.storage?.error || "실패"} / Firestore: ${backend.firestore?.error || "실패"}`,
      });
      if (!backend.ok) throw new Error(`두 저장 경로가 모두 실패했습니다. Storage: ${backend.storage?.error || "실패"} / Firestore: ${backend.firestore?.error || "실패"}`);
      const useFirestoreFallback = backend.recommendedMode === "firestore-binary";
      const modeName = useFirestoreFallback ? "Firestore 대체 저장" : `Firebase Storage · ${backend.selectedBucket}`;
      setBatchStorageMode(modeName);
      setBatchStats(current => ({ ...current, mode: modeName }));

      // 부분 저장의 신뢰성을 우선해 파일을 한 개씩 완료하고 즉시 목록에 반영합니다.
      for (let index = 0; index < queue.length; index += 1) {
        const item = queue[index];
        setBatchProgress(`${item.fileName} 저장 준비 (${index + 1}/${queue.length}) · 완료 ${savedCount}건`);
        try {
          const uploaded = await uploadAdmissionDocument(item.file, item.university.trim(), "guide", {
            targetGrade: normalizeAdmissionTargetGrade(item?.targetGrade, targetGrade),
            admissionYear: item.year,
            campus: item.campus || admissionCampusLabel(item.university,item.region),
            region: item.region,
            forceFirestoreFallback: useFirestoreFallback,
            allowFirestoreFallback: true,
            storageBucket: backend.selectedBucket,
            storageTimeoutMs: 20000,
            storageWarning: backend.storage?.error || "Storage 사전 진단 실패",
            firestoreConcurrency: 1,
            onProgress: progress => {
              const percent = Number(progress?.percent || 0);
              const detail = progress?.phase === "firestore-binary"
                ? `분할 저장 ${progress.completedChunks || 0}/${progress.totalChunks || 0}`
                : `전송 ${percent}%`;
              setBatchProgress(`${item.fileName} · ${detail} (${index + 1}/${queue.length}) · 완료 ${savedCount}건`);
            },
          });
          const docItem = makeDocumentItem(uploaded, item);
          const checkpointDocs = deduplicateAdmissionDocuments([...persistedDocs, docItem]);
          setBatchProgress(`${item.fileName} 파일 완료 · 대학 자료 목록 저장 중`);
          const checkpointOk = await persistGrades({ admissionDocs: checkpointDocs });
          if (!checkpointOk) {
            await deleteAdmissionPdf(uploaded.path || uploaded.dataKey, uploaded.storageBucket).catch(() => null);
            throw new Error("파일은 저장됐지만 대학 자료 목록 저장에 실패했습니다.");
          }
          persistedDocs = checkpointDocs;
          completedIds.add(item.id);
          savedCount += 1;
          setBatchPreview(current => (current || []).filter(currentItem => currentItem.id !== item.id));
        } catch (error) {
          const detail = error?.code || error?.message || String(error);
          failures.push({ ...item, error: detail });
          setBatchErrors([...failures.map(failure => ({ fileName: failure.fileName, university: failure.university, error: failure.error }))]);
        }
        setBatchStats(current => ({ ...current, saved: savedCount, failed: failures.length }));
      }
      if (failures.length) {
        setBatchPreview(failures);
        showToast(`${savedCount}건 저장 완료 · ${failures.length}건 실패 · ${skipped.length}건 중복 제외`, "error");
      } else {
        setBatchPreview(null);
        showToast(`${savedCount}건 저장 완료${skipped.length ? ` · ${skipped.length}건 중복 제외` : ""}`, "success");
      }
    } catch (error) {
      const detail = error?.code || error?.message || String(error);
      const remaining = items.filter(item => !completedIds.has(item.id));
      setBatchPreview(remaining);
      setBatchErrors(current => [...current, { fileName: "저장소 진단", university: "", error: detail }]);
      showToast(`일괄 업로드 중단: ${detail}`, "error");
    } finally {
      stopUploadTimer();
      setBatchStats(current => current ? { ...current, saved: savedCount, failed: failures.length, elapsed: Math.round(performance.now() - uploadStartedAtRef.current) } : current);
      setBusy(false);
      setBatchProgress("");
    }
  };

  const runDiagnosis = async () => {
    setBusy(true);
    setDiagnosis(null);
    setBatchProgress("Firebase Storage와 Firestore 파일 경로를 진단하고 있습니다.");
    const result = await diagnoseAdmissionFileBackends({ storageTimeoutMs: 6000, firestoreTimeoutMs: 12000 });
    const normalized = {
      ok: result.ok,
      bucket: result.selectedBucket || result.storage?.bucket || "",
      configuredBucket: result.storage?.configuredBucket || "",
      authenticated: result.storage?.authenticated,
      storage: result.storage,
      firestore: result.firestore,
      code: result.storage?.code || result.firestore?.code || "",
      error: result.ok ? "" : `Storage: ${result.storage?.error || "실패"} / Firestore: ${result.firestore?.error || "실패"}`,
      recommendedMode: result.recommendedMode,
    };
    setDiagnosis(normalized);
    showToast(result.ok ? `파일 저장 진단 완료 · ${result.recommendedMode === "firebase-storage" ? `Storage ${result.selectedBucket}` : "Firestore 대체 저장"}` : `파일 저장 진단 실패: ${normalized.error}`, result.ok ? "success" : "error");
    setBatchProgress("");
    setBusy(false);
  };

  const startEdit = docItem => {
    setEditingId(docItem.id || docItem.url || docItem.dataKey);
    const normalizedUniversity = admissionUniversityDisplayName(resolveKnownUniversityBaseName(docItem.university || "", universityEntryOptions));
    const normalizedType = admissionDocumentType(docItem);
    setEditUniversity(normalizedUniversity);
    setEditRegion(docItem.region || "미지정");
    setEditType(normalizedType);
    setEditLabel(normalizeAdmissionDocumentLabel(docItem.label, normalizedUniversity, normalizedType, docItem.year));
    setEditTargetGrade(normalizeAdmissionTargetGrade(docItem?.targetGrade, targetGrade));
  };

  const saveEdit = async docItem => {
    if (!editUniversity.trim()) { showToast("대학교명을 입력해주세요.", "error"); return; }
    const key = docItem.id || docItem.url || docItem.dataKey;
    const normalizedUniversity = admissionUniversityDisplayName(resolveKnownUniversityBaseName(editUniversity.trim(), universityEntryOptions));
    const candidate = normalizeAdmissionDocumentRecord({
      ...docItem,
      university: normalizedUniversity,
      region: editRegion || "미지정",
      campus: admissionCampusLabel(normalizedUniversity,editRegion),
      targetGrade: editTargetGrade,
      documentType: editType,
      label: normalizeAdmissionDocumentLabel(editLabel, normalizedUniversity, editType, docItem.year),
      updatedAt: new Date().toISOString(),
    });
    const candidateKey = admissionDocumentSemanticKey(candidate, editTargetGrade);
    const duplicate = (gdb.admissionDocs || []).find(item => (item.id || item.url || item.dataKey) !== key && admissionDocumentSemanticKey(item, targetGrade) === candidateKey);
    if (duplicate) {
      showToast("같은 대학·캠퍼스·학년도·자료 유형의 자료가 이미 등록되어 있어 수정할 수 없습니다.", "error");
      return;
    }
    setBusy(true);
    try {
      const updated = deduplicateAdmissionDocuments((gdb.admissionDocs || []).map(item => (item.id || item.url || item.dataKey) === key ? candidate : item));
      const ok = await persistGrades({ admissionDocs: updated });
      if (!ok) throw new Error("자료 정보 저장에 실패했습니다.");
      setEditingId(null);
      showToast("대학 자료 정보를 수정했습니다.", "success");
    } catch (error) {
      showToast(`수정 실패: ${error?.message || error}`, "error");
    } finally { setBusy(false); }
  };

  const removeDoc = async docItem => {
    if (!window.confirm(`${docItem.university}의 “${docItem.label || docItem.fileName}” 자료를 삭제할까요?`)) return;
    setBusy(true);
    try {
      const removed = await deleteAdmissionPdf(docItem.storagePath || docItem.dataKey, docItem.storageBucket || "");
      if (!removed.ok) throw new Error(removed.error || "Storage 파일 삭제 실패");
      const targetKey = docItem.id || docItem.url || docItem.dataKey;
      const updated = (gdb.admissionDocs || []).filter(item => (item.id || item.url || item.dataKey) !== targetKey);
      const ok = await persistGrades({ admissionDocs: updated });
      if (!ok) throw new Error("자료 목록 저장에 실패했습니다.");
      showToast("대학 자료를 삭제했습니다.", "success");
    } catch (error) {
      showToast(`삭제 실패: ${error?.message || error}`, "error");
    } finally { setBusy(false); }
  };

  const accept = documentType === "reflection" ? "application/pdf,.pdf,image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" : "application/pdf,.pdf";
  return (
    <div>
      <style>{`.admission-docs-table th,.admission-extra-docs-table th{padding:8px 6px;background:#f4f7fb;border-bottom:1px solid #dce3ec;color:#455369;font-size:10.5px;font-weight:900;text-align:center}.admission-docs-table td,.admission-extra-docs-table td{padding:8px 6px;border-top:1px solid #e7eaf0;border-right:1px solid #eef0f4;text-align:center;vertical-align:middle}.admission-docs-table td:last-child,.admission-docs-table th:last-child,.admission-extra-docs-table td:last-child,.admission-extra-docs-table th:last-child{border-right:0}.admission-docs-table tbody tr:hover,.admission-extra-docs-table tbody tr:hover{background:#f8fbff}`}</style>
      <div style={{ ...card, border: "1.5px dashed #d7dfd3", background: "#fbfdfb" }}>
        <SectionHeading title="대학별 모집요강·교과 반영표 관리" description="학년별 대입 전형을 분리해 저장합니다. 같은 대학·캠퍼스·학년도·자료 유형은 중복 등록되지 않고 기존 1건만 유지됩니다." />
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",padding:"9px 11px",marginBottom:12,border:"1px solid #dbe4ef",borderRadius:10,background:"#f6f9fd"}}>
          <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}><b style={{fontSize:11.5,color:"#455b7b"}}>대상 학년</b>{[1,2,3].map(gradeValue=><button key={gradeValue} type="button" onClick={()=>setTargetGrade(gradeValue)} style={{...btn.chip,...(targetGrade===gradeValue?btn.chipActive:{})}}>{gradeValue}학년</button>)}</div>
          <span style={{fontSize:10.5,fontWeight:850,color:"#64748b"}}>{targetGrade}학년 학생용 · 기본 {admissionYearForGrade(targetGrade)}학년도</span>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
          <button style={{ ...btn.tab, ...(documentType === "guide" ? btn.tabActive : {}) }} onClick={() => { setDocumentType("guide"); setLabel(""); setPendingFiles([]); }}>모집요강 PDF</button>
          <button style={{ ...btn.tab, ...(documentType === "reflection" ? btn.tabActive : {}) }} onClick={() => { setDocumentType("reflection"); setLabel(""); setPendingFiles([]); }}>교과 반영표 PDF·이미지</button>
          <button style={btn.secondary} onClick={runDiagnosis} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} 저장소 연결 진단</button>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:7,margin:"-5px 0 13px",padding:"8px 10px",border:"1px solid #d8e4d8",borderRadius:9,background:"#f4faf4",color:"#3f6546",fontSize:10.5,fontWeight:800}}><CheckCircle2 size={14}/>중복 방지: 대학·캠퍼스·학년도·자료 유형이 모두 같으면 새 파일은 저장하지 않습니다.</div>
        {diagnosis && (
          <div style={{ ...pdfAdmin.notice, borderColor: diagnosis.ok ? "#bdd8bf" : "#ebc2b8", background: diagnosis.ok ? "#f1f8f0" : "#fff5f2", color: diagnosis.ok ? "#315a35" : "#9a3f2c", display: "grid", gap: 5 }}>
            <strong>{diagnosis.ok ? "파일 저장 경로 사용 가능" : "파일 저장 경로 오류"}</strong>
            <span>설정 버킷: {diagnosis.configuredBucket || "미설정"}</span>
            <span>Firebase Storage: {diagnosis.storage?.ok ? `정상 · ${diagnosis.storage.bucket}` : `실패 · ${diagnosis.storage?.code || diagnosis.storage?.error || "응답 없음"}`}</span>
            <span>Firestore 파일 저장: {diagnosis.firestore?.ok ? "정상" : `실패 · ${diagnosis.firestore?.code || diagnosis.firestore?.error || "응답 없음"}`}</span>
            <span>파일 경로: 모집요강 <code>admission-guides/대학명/파일명</code> · 반영표 <code>reflection-tables/대학명/파일명</code></span>
            {diagnosis.ok && <span>권장 저장 방식: {diagnosis.recommendedMode === "firebase-storage" || diagnosis.storage?.ok ? "Firebase Storage" : "Firestore 대체 저장"}</span>}
          </div>
        )}
        <div style={{...pdfAdmin.formGrid,gridTemplateColumns:"repeat(3,minmax(0,1fr))"}}>
          <label style={pdfAdmin.label}><span>대학교</span><input list="admission-university-options" value={university} onChange={event => {
            const nextUniversity = resolveKnownUniversityBaseName(event.target.value, universityEntryOptions);
            const nextCampus = explicitAdmissionCampusLabel(event.target.value);
            setUniversity(nextUniversity);
            if (nextCampus) {
              setCampus(nextCampus);
              setRegion(regionForAdmissionCampus(nextUniversity, nextCampus, region));
            } else {
              setCampus("");
              const automaticRegion = singleCampusRegionForUniversity(universityEntryOptions, nextUniversity);
              setRegion(automaticRegion || "미지정");
            }
          }} placeholder="예: 건국대학교" style={pdfAdmin.input} /><datalist id="admission-university-options">{universityOptions.map(name => <option key={name} value={name} />)}</datalist></label>
          <label style={pdfAdmin.label}><span>캠퍼스</span><select value={campus} onChange={event => { const next=event.target.value; setCampus(next); if(next && region==="미지정") setRegion(regionForAdmissionCampus(university,next,"미지정")); }} style={pdfAdmin.input}><option value="">단일 캠퍼스/미지정</option>{ADMISSION_CAMPUS_ALIASES.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
          <label style={pdfAdmin.label}><span>지역</span><select value={region} onChange={event => { const next=event.target.value; setRegion(next); const mapped=admissionCampusLabel(university,next); if(mapped)setCampus(mapped); }} style={pdfAdmin.input}>{ADMISSION_REGIONS.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
          <label style={pdfAdmin.label}><span>학년도</span><input value={year} onChange={event => setYear(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))} placeholder={String(admissionYearForGrade(targetGrade))} style={pdfAdmin.input} /></label>
          <label style={{...pdfAdmin.label,gridColumn:"span 2"}}><span>표시 이름</span><input value={label} onChange={event => setLabel(event.target.value)} placeholder={`비워두면 ‘${defaultLabel(documentType, year, universityNameWithCampus(university || "OO대",campus))}’`} style={pdfAdmin.input} /></label>
        </div>
        <div style={{margin:"-3px 0 10px",padding:"8px 10px",borderRadius:9,background:"#f7f9fc",border:"1px solid #e1e6ee",fontSize:10.5,color:"#637083"}}>저장 대상: <b>{targetGrade}학년</b> · 대학 표기: <b>{universityNameWithCampus(university || "대학명 미입력",campus)}</b> · 지역: <b>{region}</b></div>
        <input ref={fileRef} tabIndex={-1} aria-hidden="true" type="file" multiple accept={accept} style={pdfAdmin.hiddenFileInput} disabled={busy} onChange={event => {
          const selected = Array.from(event.target.files || []); event.target.value = ""; if (!selected.length) return;
          if (documentType === "reflection") {
            setPendingFiles(selected);
            const first = selected[0];
            const identity = resolveAdmissionDocumentIdentity(first.name, universityEntryOptions, universityNameWithCampus(university,campus), region);
            const inferredYear = inferAdmissionYearFromFileName(first.name, year);
            if (identity.university) setUniversity(resolveKnownUniversityBaseName(identity.university, universityEntryOptions));
            setCampus(identity.campus || "");
            setRegion(identity.region || "미지정");
            if (inferredYear) setYear(inferredYear);
          } else handleUpload(selected);
        }} />
        <button type="button" onClick={() => openFilePicker(fileRef, `${typeLabel(documentType)} 파일 선택`)} disabled={busy} style={{ ...btn.primary, display: "inline-flex", width: "fit-content", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} {typeLabel(documentType)} 파일 선택
        </button>
        {documentType === "reflection" && pendingFiles.length > 0 && <div style={pdfAdmin.pendingUploadBox}><div style={{display:"grid",gap:3,minWidth:0}}><b>{pendingFiles.length}개 파일 선택됨</b><span>{pendingFiles.map(file=>file.name).join(" · ")}</span></div><div style={{display:"flex",gap:7,flexWrap:"wrap"}}><button type="button" style={btn.primary} disabled={busy} onClick={()=>handleUpload(pendingFiles,{resetForm:true})}><Save size={14}/>교과 반영표 저장</button><button type="button" style={btn.secondary} disabled={busy} onClick={()=>setPendingFiles([])}>선택 취소</button></div></div>}
        {!university.trim() && <div style={{ marginTop: 7, fontSize: 11, color: "#716b5f" }}>대학교명을 입력하지 않아도 파일명에서 대학명과 학년도를 자동으로 추정합니다.</div>}
        {batchProgress && <div style={pdfAdmin.progress}><Loader2 size={13} className="spin" />{batchProgress}</div>}
        {batchStats && <div style={pdfAdmin.batchStatus}><span>저장 방식 <b style={{ color: batchStats.mode?.includes("대체") ? "#855c16" : "#315d8c" }}>{batchStats.mode || batchStorageMode || "확인 중"}</b></span><span>전체 <b>{batchStats.total}</b></span><span>저장 <b style={{ color: "#2f7347" }}>{batchStats.saved}</b></span><span>실패 <b style={{ color: "#a44444" }}>{batchStats.failed}</b></span><span>중복 제외 <b>{batchStats.skipped}</b></span><span>경과 <b>{(Number(batchStats.elapsed || 0) / 1000).toFixed(1)}초</b></span></div>}
        {!!batchErrors.length && <div style={{ ...pdfAdmin.notice, marginTop: 8, borderColor: "#efc7c2", background: "#fff6f5", color: "#8f3838" }}>
          <strong style={{ display: "block", marginBottom: 5 }}>업로드 오류 상세</strong>
          {batchErrors.slice(0, 8).map((item, index) => <div key={`${item.fileName}-${index}`} style={{ marginTop: 3, overflowWrap: "anywhere" }}>{item.fileName}{item.university ? ` · ${item.university}` : ""}: {item.error}</div>)}
          {batchErrors.length > 8 && <div style={{ marginTop: 4 }}>외 {batchErrors.length - 8}건</div>}
        </div>}
        {documentType === "guide" && (
          <>
            <div style={pdfAdmin.divider} />
            <div style={pdfAdmin.sectionTitle}>모집요강 ZIP 일괄 업로드</div>
            <div style={{ fontSize: 11.5, color: "#716b5f", lineHeight: 1.6, marginBottom: 10 }}>ZIP 안의 PDF 파일명에서 대학명을 추정한 뒤 저장 전 확인할 수 있습니다.</div>
            <input ref={zipRef} tabIndex={-1} aria-hidden="true" type="file" accept="application/zip,.zip" style={pdfAdmin.hiddenFileInput} disabled={busy} onChange={event => { const selected = event.target.files?.[0]; event.target.value = ""; if (selected) handleZip(selected); }} />
            <button type="button" onClick={() => openFilePicker(zipRef, "ZIP 파일 선택")} disabled={busy} style={{ ...btn.secondary, display: "inline-flex", alignItems: "center", gap: 6, width: "fit-content", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}><Archive size={14} /> ZIP 파일 선택</button>
          </>
        )}
      </div>

      {batchPreview && (
        <div style={card}>
          <SectionHeading title={`ZIP 업로드 확인 (${batchPreview.length}건)`} description="Storage를 10초 안에 확인한 뒤, 연결되지 않으면 파일별 Firestore 분할 저장으로 자동 전환합니다. 완료된 묶음은 즉시 저장됩니다." />
          <div style={table.scroll}><table style={{ ...table.base, minWidth: 920 }}><thead><tr><th style={table.th}>파일명</th><th style={table.th}>대학명</th><th style={table.th}>캠퍼스</th><th style={table.th}>지역</th><th style={table.th}>표시 이름</th><th style={table.th}></th></tr></thead><tbody>
            {batchPreview.map(item => <tr key={item.id}><td style={{ ...table.tdLabel, maxWidth: 210, whiteSpace: "normal", wordBreak: "break-all" }}>{item.fileName}{item.error && <div style={{ color: "#9a4242", fontSize: 10.5, marginTop: 4 }}>{item.error}</div>}</td><td style={table.td}><input value={resolveKnownUniversityBaseName(item.university, universityEntryOptions)} onChange={event => { const base=resolveKnownUniversityBaseName(event.target.value, universityEntryOptions); const nextUniversity=universityNameWithCampus(base,item.campus); updateBatchItem(item.id, { university: nextUniversity, label: admissionDocumentDisplayLabel("guide", item.year, nextUniversity) }); }} style={{ ...pdfAdmin.input, minWidth: 145 }} /></td><td style={table.td}><select value={item.campus || ""} onChange={event => { const nextCampus=event.target.value; const nextUniversity=universityNameWithCampus(item.university,nextCampus); const nextRegion=nextCampus?regionForAdmissionCampus(nextUniversity,nextCampus,item.region||"미지정"):(item.region||"미지정"); updateBatchItem(item.id,{campus:nextCampus,university:nextUniversity,region:nextRegion,label:admissionDocumentDisplayLabel("guide",item.year,nextUniversity)}); }} style={{ ...pdfAdmin.input, minWidth: 92 }}><option value="">미지정</option>{ADMISSION_CAMPUS_ALIASES.map(name=><option key={name} value={name}>{name}</option>)}</select></td><td style={table.td}><select value={item.region || "미지정"} onChange={event => { const nextRegion=event.target.value; const mapped=admissionCampusLabel(item.university,nextRegion); const nextUniversity=mapped?universityNameWithCampus(item.university,mapped):item.university; updateBatchItem(item.id, { region: nextRegion, campus:mapped||item.campus||"", university:nextUniversity, label:admissionDocumentDisplayLabel("guide",item.year,nextUniversity) }); }} style={{ ...pdfAdmin.input, minWidth: 100 }}>{ADMISSION_REGIONS.map(name => <option key={name} value={name}>{name}</option>)}</select></td><td style={table.td}><input value={item.label || ""} onChange={event => updateBatchItem(item.id, { label: event.target.value })} style={{ ...pdfAdmin.input, minWidth: 165 }} /></td><td style={table.td}><button style={pdfAdmin.deleteButton} onClick={() => removeBatchItem(item.id)} disabled={busy}><Trash2 size={12} /> 제외</button></td></tr>)}
          </tbody></table></div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}><button style={btn.primary} onClick={uploadBatch} disabled={busy || !batchPreview.length}><Upload size={14} /> 확인한 PDF 일괄 업로드</button><button style={btn.secondary} onClick={() => setBatchPreview(null)} disabled={busy}>취소</button></div>
        </div>
      )}

      <div style={{ ...card, borderColor: missingDocumentUniversities.length ? "#e9d49b" : "#d7e5da", background: missingDocumentUniversities.length ? "#fffdf7" : "#f8fcf8" }}>
        <div style={pdfAdmin.missingHeader}>
          <SectionHeading
            title={`${typeLabel(requiredDocumentType)} 미업로드 대학 ${missingDocumentUniversities.length}개`}
            description={`대입 전형표에 등록된 ${admissionUniversityEntries.length}개 대학과 현재 ${typeLabel(requiredDocumentType)} 파일을 캠퍼스까지 비교한 결과입니다.`}
          />
          <div style={pdfAdmin.missingSummary}>
            <span>등록 완료 <b>{Math.max(0, admissionUniversityEntries.length - missingDocumentUniversities.length)}</b></span>
            <span>미업로드 <b style={{ color: missingDocumentUniversities.length ? "#a16a13" : "#2f7347" }}>{missingDocumentUniversities.length}</b></span>
          </div>
        </div>
        {missingDocumentUniversities.length ? <>
          <div style={pdfAdmin.missingSearch}><Search size={14} /><input value={missingQuery} onChange={event => setMissingQuery(event.target.value)} placeholder={`${typeLabel(requiredDocumentType)} 미업로드 대학 검색`} style={{ border: 0, outline: 0, flex: 1, minWidth: 0, fontSize: 11.5 }} /></div>
          <div style={pdfAdmin.missingGrid}>
            {visibleMissingDocumentUniversities.map(item => <button type="button" key={universityDocumentKey(item.name,item.region)} style={pdfAdmin.missingUniversityButton} onClick={() => {
              setDocumentType(requiredDocumentType);
              setUniversity(resolveKnownUniversityBaseName(item.name, universityEntryOptions));
              setCampus(admissionCampusLabel(item.name,item.region));
              setRegion(item.region || "미지정");
              setLabel("");
              setPendingFiles([]);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}><span style={{display:"grid",gap:2,minWidth:0}}><b>{admissionUniversityDisplayName(item.name)}</b><small style={{color:"#7c7568"}}>{item.region}</small></span><small style={{ color: "#9a6d16", whiteSpace: "nowrap" }}>{typeLabel(requiredDocumentType)} 등록</small></button>)}
          </div>
          {!visibleMissingDocumentUniversities.length && <div style={chartEmpty}>검색 조건에 해당하는 미업로드 대학이 없습니다.</div>}
        </> : <div style={pdfAdmin.completeNotice}><CheckCircle2 size={16} />대입 전형표에 있는 모든 대학의 {typeLabel(requiredDocumentType)}가 등록되어 있습니다.</div>}
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <SectionHeading title={`등록된 ${targetGrade}학년 대학 자료 (${docs.length}/${allDocs.length}건)`} description="한 자료를 한 행으로 표시합니다. 표시 이름과 원본 파일명을 분리해 확인할 수 있습니다." />
          <div style={{ display: "flex", gap: 5 }}>{[["all","전체"],["guide","모집요강"],["reflection","반영표"]].map(([key,name]) => <button key={key} style={{ ...btn.chip, ...(listFilter === key ? btn.chipActive : {}) }} onClick={() => setListFilter(key)}>{name}</button>)}</div>
        </div>
        {!docs.length ? <div style={chartEmpty}>해당 유형의 자료가 없습니다.</div> : <div style={admissionDocs.tableWrap}>
          <table className="admission-docs-table" style={admissionDocs.table}>
            <colgroup><col style={{ width: "17%" }} /><col style={{ width: "8%" }} /><col style={{ width: "11%" }} /><col style={{ width: "25%" }} /><col style={{ width: "21%" }} /><col style={{ width: "18%" }} /></colgroup>
            <thead><tr><th>대학교·캠퍼스</th><th>지역</th><th>대상·자료 유형</th><th>표시 이름</th><th>원본 파일·저장 방식</th><th>관리</th></tr></thead>
            <tbody>{docs.map(docItem => {
              const key = docItem.id || docItem.url || docItem.dataKey;
              const editing = editingId === key;
              return <tr key={key}>
                <td>{editing ? <input value={editUniversity} onChange={event => setEditUniversity(event.target.value)} style={pdfAdmin.input} /> : <><b style={admissionDocs.university}>{admissionUniversityDisplayName(docItem.university)}</b>{admissionCampusLabel(docItem.university,docItem.region)&&<div style={{fontSize:9.5,color:"#55739a",fontWeight:850,marginTop:3}}>{admissionCampusLabel(docItem.university,docItem.region)}캠퍼스</div>}</>}</td>
                <td>{editing ? <select value={editRegion} onChange={event => setEditRegion(event.target.value)} style={pdfAdmin.input}>{ADMISSION_REGIONS.map(name => <option key={name} value={name}>{name}</option>)}</select> : <span style={regionBadge}>{(docItem.region || "미지정") !== "미지정" && <MapPin size={10} />}{docItem.region || "미지정"}</span>}</td>
                <td>{editing ? <div style={{display:"grid",gap:5}}><select value={editTargetGrade} onChange={event => setEditTargetGrade(Number(event.target.value))} style={pdfAdmin.input}>{[1,2,3].map(value=><option key={value} value={value}>{value}학년</option>)}</select><select value={editType} onChange={event => setEditType(event.target.value)} style={pdfAdmin.input}><option value="guide">모집요강</option><option value="reflection">교과 반영표</option></select></div> : <div style={{display:"grid",gap:4,justifyItems:"center"}}><span style={{fontSize:9.5,fontWeight:900,color:"#526681"}}>{normalizeAdmissionTargetGrade(docItem?.targetGrade,2)}학년</span><span style={admissionDocs.typeBadge}>{typeLabel(admissionDocumentType(docItem))}</span></div>}</td>
                <td>{editing ? <input value={editLabel} onChange={event=>setEditLabel(event.target.value)} style={pdfAdmin.input}/> : <div style={admissionDocs.primaryText}>{normalizeAdmissionDocumentLabel(docItem.label, docItem.university, admissionDocumentType(docItem), docItem.year)}</div>}</td>
                <td><div title={docItem.fileName} style={admissionDocs.fileName}>{docItem.fileName || "-"}</div><div style={admissionDocs.fileMeta}>{docItem.size ? `${(docItem.size / 1024 / 1024).toFixed(1)}MB` : "용량 미확인"} · {docItem.storageMode === "firestore-binary" ? "Firestore 대체 저장" : "Firebase Storage"}</div></td>
                <td><div style={admissionDocs.actions}>{editing ? <><button style={btn.primary} onClick={() => saveEdit(docItem)} disabled={busy}>저장</button><button style={btn.secondary} onClick={() => setEditingId(null)} disabled={busy}>취소</button></> : <><PdfLink docItem={docItem} compact /><button style={btn.secondary} onClick={() => startEdit(docItem)} disabled={busy}>수정</button><button style={pdfAdmin.deleteButton} onClick={() => removeDoc(docItem)} disabled={busy}><Trash2 size={12} />삭제</button></>}</div></td>
              </tr>;
            })}</tbody>
          </table>
        </div>}
      </div>
    </div>
  );
}

function EmptyBox({ text }) {
  return <div style={{ ...card, textAlign: "center", color: "#a39d8c", fontSize: 13 }}>{text}</div>;
}

/* ---------- 스타일 (기존 시간표 앱의 차분한 톤 유지) ---------- */
const card = {
  background: "#fff",
  border: "1px solid #e6e1d3",
  borderRadius: 14,
  padding: 18,
  marginBottom: 14,
  boxShadow: "0 1px 0 rgba(43,38,32,0.02)",
};

// Patch 55: keep inactive workspace panels mounted without re-rendering them on every tab switch.
// Heavy NAVI/admission calculations now update only when their actual data/filter inputs change.
const MemoStudentLookup = React.memo(StudentLookup, (prev, next) => (
  prev.roster === next.roster
  && prev.gdb === next.gdb
  && prev.homeroomClass === next.homeroomClass
  && prev.isAdmin === next.isAdmin
  && prev.initialView === next.initialView
  && prev.selectedSid === next.selectedSid
  && prev.sharedQuery === next.sharedQuery
  && prev.showViewTabs === next.showViewTabs
  && prev.hideSearch === next.hideSearch
  && prev.favorites === next.favorites
  && prev.focusUniversity === next.focusUniversity
  && Boolean(prev.onBackToConsultation) === Boolean(next.onBackToConsultation)
));
const MemoStudentConsultationView = React.memo(StudentConsultationView, (prev, next) => (
  prev.sid === next.sid
  && prev.gdb === next.gdb
  && prev.studentInfo === next.studentInfo
  && prev.favorites === next.favorites
  && prev.persistGrades === next.persistGrades
  && prev.canEdit === next.canEdit
  && prev.authorName === next.authorName
));
const MemoAdmissionCaseAnalytics = React.memo(AdmissionCaseAnalytics, (prev, next) => (
  prev.gdb === next.gdb
  && prev.roster === next.roster
  && prev.currentGrade === next.currentGrade
  && prev.selectedStudentSid === next.selectedStudentSid
  && prev.selectedStudentQuery === next.selectedStudentQuery
  && prev.favorites === next.favorites
  && prev.focusUniversity === next.focusUniversity
  && prev.focusDepartment === next.focusDepartment
  && prev.focusAdmissionType === next.focusAdmissionType
  && Boolean(prev.onBackToConsultation) === Boolean(next.onBackToConsultation)
));
const MemoSusiNaviBetaView = React.memo(SusiNaviBetaView, (prev, next) => (
  prev.isAdmin === next.isAdmin
  && prev.selectedStudent === next.selectedStudent
  && prev.favorites === next.favorites
  && prev.focusUniversity === next.focusUniversity
  && prev.focusDepartment === next.focusDepartment
  && prev.caseRows === next.caseRows
  && Boolean(prev.onToggleFavorite) === Boolean(next.onToggleFavorite)
  && Boolean(prev.onOpenCases) === Boolean(next.onOpenCases)
));

const btn = {
  input: { boxSizing: "border-box", border: "1px solid #ddd7c9", borderRadius: 8, background: "#fff", padding: "7px 10px", fontSize: 12, color: "#2b2620", outline: "none" },
  primary: { display: "flex", alignItems: "center", gap: 6, border: "none", background: "#3d5c3a", color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 12.5, cursor: "pointer", fontWeight: 700 },
  secondary: { border: "1px solid #e6e1d3", background: "#fff", padding: "7px 13px", borderRadius: 8, fontSize: 12.5, cursor: "pointer", fontWeight: 700 },
  link: { border: "none", background: "transparent", color: "#3d5c3a", fontSize: 11.5, cursor: "pointer", textDecoration: "underline" },
  smallPrimary: { display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid #bfd2bc", background: "#edf5eb", color: "#315a35", padding: "5px 8px", borderRadius: 7, fontSize: 10.8, cursor: "pointer", fontWeight: 800 },
  tab: { border: "1px solid #e6e1d3", background: "#fff", padding: "7px 14px", borderRadius: 8, fontSize: 12.5, cursor: "pointer", fontWeight: 700, color: "#8a8578" },
  tabActive: { background: "#2b2620", color: "#fff", borderColor: "#2b2620" },
  chip: { border: "1px solid #e6e1d3", background: "#fff", padding: "6px 12px", borderRadius: 16, fontSize: 11.5, cursor: "pointer", fontWeight: 700, color: "#8a8578" },
  chipActive: { background: "#3d5c3a", color: "#fff", borderColor: "#3d5c3a" },
};
const lookupTabs = {
  box: { display: "flex", gap: 7, marginBottom: 12, padding: 5, width: "fit-content", borderRadius: 10, background: "#f1eee7", border: "1px solid #e2dccf" },
  button: { border: "none", background: "transparent", color: "#716b5f", borderRadius: 7, padding: "8px 13px", fontSize: 12, fontWeight: 800, cursor: "pointer" },
  active: { background: "#3d5c3a", color: "#fff", boxShadow: "0 1px 3px rgba(43,38,32,0.12)" },
};
const gradeTable = {
  base: { fontSize: 11.2 },
  th: { whiteSpace: "normal", lineHeight: 1.15, padding: "6px 3px", fontSize: 10.2 },
  thSub: { fontSize: 8.9, color: "#716b5f", fontWeight: 700 },
  td: { padding: "6px 3px", fontSize: 10.9 },
  subjectCell: { padding: "6px 7px", whiteSpace: "normal", wordBreak: "keep-all", lineHeight: 1.3, fontSize: 11 },
  subjectWrap: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, minWidth: 0 },
  subjectName: { fontWeight: 850, minWidth: 0, overflowWrap: "anywhere" },
};
const table = {
  scroll: { width: "100%", overflowX: "auto", borderRadius: 8 },
  base: { width: "100%", minWidth: 700, borderCollapse: "collapse", fontSize: 12.5 },
  th: { border: "1px solid #e6e1d3", padding: "8px 8px", background: "#f6f4ee", fontWeight: 800, fontSize: 11.5, whiteSpace: "nowrap" },
  td: { border: "1px solid #e6e1d3", padding: "8px 8px", textAlign: "center", whiteSpace: "nowrap" },
  tdLabel: { border: "1px solid #e6e1d3", padding: "8px 9px", fontWeight: 700, background: "#fbfaf6", whiteSpace: "nowrap" },
  sectionRow: { border: "1px solid #ded8c9", padding: "7px 9px", background: "#eeeae0", color: "#5f594d", fontSize: 11.5, fontWeight: 800, textAlign: "left" },
  averageTh: { background: "#e9f2e7", color: "#315132", borderColor: "#cbdcc8" },
  averageTd: { background: "#f4f9f3", borderColor: "#d7e4d4", fontWeight: 900 },
  bestAverageTd: { background: "#f1eff8", boxShadow: "inset 0 0 0 1px #c9c1df" },
};
const searchBox = {
  box: { display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #e6e1d3", borderRadius: 10, padding: "9px 13px", maxWidth: 420 },
  input: { border: "none", outline: "none", flex: 1, fontSize: 13.5, background: "transparent" },
  list: { marginTop: 8, maxWidth: 420, background: "#fff", border: "1px solid #e6e1d3", borderRadius: 10, overflow: "hidden" },
  item: { display: "flex", flexDirection: "column", alignItems: "flex-start", width: "100%", textAlign: "left", padding: "9px 13px", border: "none", background: "transparent", cursor: "pointer", borderBottom: "1px solid #e6e1d3", fontSize: 13, gap: 2 },
};
const studentBanner = {
  box: {
    background: "linear-gradient(135deg, #2f77b7 0%, #4e88c4 48%, #716ab7 100%)",
    color: "#fff",
    borderRadius: 16,
    padding: "20px 22px",
    marginBottom: 14,
    boxShadow: "0 10px 26px rgba(48,79,135,0.20)",
  },
  topRow: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" },
  main: { flex: "1 1 520px", minWidth: 0 },
  actions: { flex: "0 0 auto", alignSelf: "flex-start" },
  eyebrow: { fontSize: 11.5, opacity: 0.78, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 5 },
  title: { fontSize: 21, fontWeight: 500, lineHeight: 1.35 },
  titleRow: { display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", fontSize: 22, lineHeight: 1.25 },
  identity: { fontWeight: 950, letterSpacing: "-0.03em" },
  titleTag: { display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 999, padding: "5px 11px", background: "#fff", border: "1px solid rgba(255,255,255,.92)", color: "#315f95", fontSize: 11.5, lineHeight: 1.15, fontWeight: 950, letterSpacing: "-0.02em", boxShadow: "0 4px 12px rgba(28,55,93,.18)" },
  gradeTitleTag: { background: "#fff", borderColor: "#fff", color: "#2d6497" },
  favoritesTitleTag: { background: "#ffe480", borderColor: "#ffe480", color: "#2b3853", boxShadow: "0 4px 12px rgba(51,45,91,.20)" },
  subtitle: { marginTop: 8, fontSize: 12, lineHeight: 1.5, color: "rgba(255,255,255,.86)", fontWeight: 700 },
  admissionBox: { background: "linear-gradient(135deg,#315f9c 0%,#5e78b7 50%,#7e68ad 100%)", boxShadow: "0 10px 27px rgba(54,70,126,.22)" },
  admissionEyebrow: { color: "#dbe7ff", opacity: 1 },
  admissionTitleTag: { background: "#ffe071", borderColor: "#ffe071", color: "#28354f", boxShadow: "0 4px 12px rgba(51,45,91,.20)" },
  admissionGradeBadge: { background: "#fff", color: "#394c78", borderColor: "#fff" },
  badges: { display: "flex", flexWrap: "wrap", gap: 7, marginTop: 13 },
  badge: { display: "inline-flex", alignItems: "center", background: "rgba(255,255,255,0.13)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 999, padding: "5px 10px", fontSize: 11.5, fontWeight: 700 },
  gradeBadge: { background: "#fff", color: "#315b84", borderColor: "#fff" },
};
const gradeScaleSelector = {
  box: {
    display: "grid",
    gap: 10,
    border: "1px solid #e3dfd3",
    background: "#faf9f5",
    borderRadius: 12,
    padding: "11px 12px",
    marginBottom: 12,
  },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  title: { fontSize: 12.5, fontWeight: 900, color: "#3d3932" },
  description: { maxWidth: 650, fontSize: 10.8, lineHeight: 1.5, color: "#8a8578", marginTop: 3 },
  buttons: { display: "flex", gap: 6, flexWrap: "wrap" },
  button: {
    border: "1px solid #ddd7c9",
    background: "#fff",
    color: "#716b5f",
    borderRadius: 999,
    padding: "7px 11px",
    fontSize: 11.5,
    fontWeight: 800,
    cursor: "pointer",
  },
  active: { background: "#5d4898", borderColor: "#5d4898", color: "#fff" },
  betaButton: { borderColor: "#cfc3e3", color: "#664e94", background: "#f7f3fc" },
  betaActive: { background: "linear-gradient(135deg,#5d4898,#7a5aa2)", borderColor: "#5d4898", color: "#fff", boxShadow: "0 5px 13px rgba(93,72,152,.22)" },
  betaPanel: { display: "grid", gridTemplateColumns: "minmax(160px,.42fr) minmax(280px,1fr)", gap: 9, alignItems: "end", padding: 10, border: "1px solid #ded4ec", borderRadius: 10, background: "#f8f5fc" },
  betaLabel: { display: "grid", gap: 5, color: "#6f6188", fontSize: 9.8, fontWeight: 900 },
  betaSelect: { width: "100%", height: 36, border: "1px solid #cfc5df", borderRadius: 9, background: "#fff", padding: "0 9px", color: "#504263", fontSize: 11, fontWeight: 800 },
  betaNotice: { minHeight: 36, display: "flex", alignItems: "center", padding: "8px 10px", borderRadius: 9, background: "#eee8f7", color: "#66547f", fontSize: 10.2, lineHeight: 1.45, fontWeight: 750 },
  betaWarning: { background: "#fff3e7", color: "#8b5e23" },
};
const categoryBadgeBase = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  maxWidth: "100%",
  minWidth: 42,
  minHeight: 24,
  padding: "4px 7px",
  borderRadius: 999,
  fontSize: 9.7,
  fontWeight: 900,
  lineHeight: 1.15,
  whiteSpace: "normal",
  wordBreak: "keep-all",
  overflowWrap: "anywhere",
  textAlign: "center",
  boxSizing: "border-box",
};
const combinationLabel = {
  display: "inline-block",
  minWidth: 74,
  padding: "2px 4px",
  color: "#3d3932",
  fontSize: 11.2,
  fontWeight: 900,
  lineHeight: 1.25,
  textAlign: "center",
};
const categoryGuide = {
  box: { display: "flex", flexDirection: "column", gap: 7, margin: "0 0 12px", padding: "9px 11px", background: "#faf9f5", border: "1px solid #ebe7dc", borderRadius: 10 },
  group: { display: "flex", alignItems: "center", gap: "6px 10px", flexWrap: "wrap" },
  title: { fontSize: 10, color: "#514b42", minWidth: 48 },
  item: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "#716b5f", fontWeight: 700 },
  dot: { width: 7, height: 7, borderRadius: 99, display: "inline-block" },
};
const courseTypeBadge = {
  base: { display: "inline-flex", flex: "0 0 auto", alignItems: "center", justifyContent: "center", minWidth: 34, padding: "3px 6px", borderRadius: 999, border: "1px solid", fontSize: 8.8, fontWeight: 900, lineHeight: 1.05, whiteSpace: "nowrap" },
};
const metricPill = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 32, minHeight: 25, padding: "2px 8px", borderRadius: 999, fontWeight: 900, lineHeight: 1,
};
const achievementPill = {
  base: { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 28, minHeight: 24, borderRadius: 999, padding: "2px 7px", fontWeight: 900 },
  a: { background: "#e7f5ea", color: "#24613a", border: "1px solid #bfe2c8" },
  b: { background: "#edf3ff", color: "#315a9b", border: "1px solid #cad8f3" },
  default: { background: "#f4f2ed", color: "#716b5f", border: "1px solid #ded9cd" },
};
const topBadge = { marginTop: 3, fontSize: 9.5, fontWeight: 900, color: "#24613a", background: "#e7f5ea", borderRadius: 999, padding: "2px 5px", display: "inline-block" };
const bestBadge = { fontSize: 9.5, fontWeight: 900, color: "#ffe9a6", background: "#30364d", border: "1px solid #30364d", borderRadius: 999, padding: "3px 7px", boxShadow: "0 1px 2px rgba(48,54,77,0.18)" };
const mockSum = {
  grid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(96px, 1fr))", gap: 8, marginTop: 14, minWidth: 0 },
  card: { border: "1px solid #d6e1ee", background: "#f4f8fc", borderRadius: 12, padding: "11px 8px", textAlign: "center", minWidth: 0, overflow: "hidden" },
  label: { fontSize: 12.2, fontWeight: 900, color: "#3d6288", whiteSpace: "nowrap" },
  value: { fontSize: 27, fontWeight: 900, lineHeight: 1.12, color: "#253d59", margin: "4px 0 2px", whiteSpace: "nowrap" },
  caption: { fontSize: 10.5, color: "#788697" },
};
const absoluteGradePill = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 26,
  padding: "4px 10px",
  borderRadius: 999,
  background: "#f3f1eb",
  color: "#716b5f",
  border: "1px dashed #cfc8b9",
  fontSize: 11,
  fontWeight: 800,
};
const admissionHero = {
  card: {
    background: "linear-gradient(135deg, #f3f8f1 0%, #ffffff 72%)",
    borderColor: "#cfdfca",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 18,
    flexWrap: "wrap",
  },
  heading: { flex: "1 1 430px", minWidth: 0 },
  content: {
    minHeight: 164,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
  },
};

const admissionModeSwitch = {
  box: { display: "inline-flex", gap: 3, padding: 3, borderRadius: 10, background: "#efede7", border: "1px solid #ded9cd" },
  button: { border: "none", background: "transparent", color: "#716b5f", borderRadius: 7, padding: "7px 10px", fontSize: 10.8, fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" },
  active: { background: "#2f4b32", color: "#fff", boxShadow: "0 1px 3px rgba(43,38,32,0.14)" },
  darkBox: { display: "inline-flex", gap: 3, padding: 3, borderRadius: 11, background: "rgba(255,255,255,0.11)", border: "1px solid rgba(255,255,255,0.18)", backdropFilter: "blur(3px)" },
  darkButton: { border: "none", background: "transparent", color: "rgba(255,255,255,0.78)", borderRadius: 8, padding: "8px 11px", fontSize: 10.8, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" },
  darkActive: { background: "#fff", color: "#315132", boxShadow: "0 1px 4px rgba(0,0,0,0.16)" },
  printButton: { display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid rgba(255,255,255,0.38)", borderRadius: 8, background: "transparent", color: "#fff", padding: "8px 9px", fontSize: 9.6, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" },
};
const CURRICULUM_TYPE_SUMMARY_META = {
  commonSubjectMethod: { accent: "#66737d", color: "#48545f", badge: "#eef1f3", border: "#c9d0d5", background: "#f8f9fa" },
  generalElectiveMethod: { accent: "#5f8a84", color: "#3f6862", badge: "#eaf2f0", border: "#bfd2ce", background: "#f7fbfa" },
  careerElectiveMethod: { accent: "#8b758d", color: "#6d5a70", badge: "#f1edf2", border: "#d4c8d5", background: "#faf8fa" },
  convergenceElectiveMethod: { accent: "#9a7963", color: "#7b604e", badge: "#f4eee9", border: "#dccdc2", background: "#fbf9f7" },
};
const curriculumTypeSummary = {
  wrap: { marginTop: 12 },
  headingRow: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 },
  heading: { fontSize: 11.8, color: "#332e27" },
  caption: { fontSize: 9.5, color: "#857d70" },
  grid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 },
  card: { minWidth: 0, border: "1px solid #e3e0d9", borderTop: "3px solid", borderRadius: 10, padding: "9px 9px 8px", boxShadow: "0 1px 0 rgba(60,55,45,0.03)" },
  cardHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 5, marginBottom: 7 },
  typeBadge: { display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid", borderRadius: 7, padding: "3px 7px", fontSize: 9.2, fontWeight: 900, whiteSpace: "nowrap" },
  total: { fontSize: 8.8, color: "#766f63", fontWeight: 800, whiteSpace: "nowrap" },
  methodRows: { display: "grid", gap: 4 },
  methodRow: { display: "grid", gap: 4 },
  method: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 0, minHeight: 31, borderRadius: 7, padding: "3px 2px", background: "rgba(255,255,255,0.72)", border: "1px solid rgba(80,75,65,0.10)", color: "#625c52" },
  methodValue: { fontSize: 10.5, lineHeight: 1.05, color: "#3d3933" },
  methodLabel: { marginTop: 2, fontSize: 7.8, lineHeight: 1.05, fontWeight: 800, whiteSpace: "normal",
    lineHeight: 1.18,
    overflowWrap: "anywhere", letterSpacing: "-0.15px" },
};

const curriculumSummary = {
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(125px, 1fr))", gap: 8, marginTop: 12 },
  card: { display: "flex", alignItems: "baseline", justifyContent: "center", gap: 7, borderRadius: 11, padding: "10px 10px", fontSize: 10.8, fontWeight: 800 },
  rank: { background: "#edf7e6", color: "#3e6b2f", border: "1px solid #cfe3c1" },
  achievement: { background: "#fff4d5", color: "#7a5b19", border: "1px solid #ecd89f" },
  mixed: { background: "#e7f3fb", color: "#2d617c", border: "1px solid #c1ddea" },
  career: { background: "#f1ebfa", color: "#624a8a", border: "1px solid #d8caec" },
  convergence: { background: "#fff0e2", color: "#8e5522", border: "1px solid #efd0b2" },
  qualitative: { background: "#f0ebfb", color: "#5e4c88", border: "1px solid #d7ccef" },
  excluded: { background: "#fdebea", color: "#944845", border: "1px solid #efc9c6" },
};
const achievementAdvice = {
  box: { marginTop: 12, borderRadius: 12, padding: "12px 13px", border: "1px solid #ded9cd", background: "#faf9f5", color: "#514b42" },
  neutral: { background: "#faf9f5", borderColor: "#ded9cd" },
  warning: { background: "#fff7e8", borderColor: "#ead29f" },
  positive: { background: "#eef8f0", borderColor: "#c9e1ce" },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" },
  eyebrow: { fontSize: 9.8, fontWeight: 900, color: "#786f62", letterSpacing: "0.03em" },
  title: { marginTop: 3, fontSize: 12.2, fontWeight: 900, lineHeight: 1.45 },
  countBadge: { display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "5px 9px", background: "#fff", border: "1px solid rgba(80,75,65,0.18)", fontSize: 9.8, fontWeight: 900, whiteSpace: "nowrap" },
  metrics: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 },
  metric: { display: "inline-flex", gap: 4, alignItems: "center", background: "rgba(255,255,255,0.72)", border: "1px solid rgba(80,75,65,0.12)", borderRadius: 999, padding: "4px 8px", fontSize: 9.6, fontWeight: 750 },
  comments: { display: "grid", gap: 5, marginTop: 10, fontSize: 10.3, lineHeight: 1.55, color: "#5f594d" },
};
const curriculumDataWarning = {
  margin: "0 0 12px",
  padding: "9px 11px",
  borderRadius: 10,
  background: "#fff7df",
  border: "1px solid #ead9a2",
  color: "#72591c",
  fontSize: 10.8,
  fontWeight: 750,
  lineHeight: 1.5,
};
const curriculumMethodBadge = {
  base: { display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "auto", minWidth: 48, maxWidth: "96%",
    padding: "3px 5px",
    boxSizing: "border-box", minHeight: 20, padding: "3px 7px", borderRadius: 7, fontSize: 8.3, fontWeight: 900, lineHeight: 1.12, whiteSpace: "normal", wordBreak: "keep-all", letterSpacing: "-0.15px" },
  line: { display: "block", whiteSpace: "nowrap" },
  rank: { background: "#eaf2ee", color: "#416356", border: "1px solid #c8d9d2" },
  achievement: { background: "#f5f0e7", color: "#745f3f", border: "1px solid #dfd2bd" },
  mixed: { background: "#edf1f6", color: "#4d6278", border: "1px solid #cdd7e1" },
  qualitative: { background: "#f1edf3", color: "#695772", border: "1px solid #d6cad8" },
  excluded: { background: "#f5eded", color: "#865453", border: "1px solid #e1cccc" },
  empty: { background: "#f5f4f1", color: "#a09a8f", border: "1px solid #e0ddd6" },
  other: { background: "#eff1f2", color: "#515a61", border: "1px solid #d8dcde" },
};
const admissionSummary = {
  grid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(110px, 1fr))", gap: 8, marginTop: 12 },
  card: { display: "flex", alignItems: "baseline", justifyContent: "center", gap: 7, borderRadius: 11, padding: "10px 12px", fontSize: 11.5, fontWeight: 800 },
  success: { background: "#eaf6ec", color: "#2d6238", border: "1px solid #c8e2cd" },
  danger: { background: "#fff0f0", color: "#963f3f", border: "1px solid #edcccc" },
  neutral: { background: "#f4f2ed", color: "#716b5f", border: "1px solid #ded9cd" },
};
const admissionToolbar = {
  box: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 13 },
  primaryRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  secondaryRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  filterCluster: { display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "nowrap", minHeight: 38, padding: "4px 7px", background: "#faf9f6", border: "1px solid #e6e2da", borderRadius: 9 },
  filterLabel: { fontSize: 9.1, fontWeight: 900, color: "#766f63", whiteSpace: "nowrap", paddingRight: 2 },
  filterGroup: { display: "flex", alignItems: "center", gap: 4, flexWrap: "nowrap" },
};
const staffToolNav = {
  wrap: { marginBottom: 18, padding: "11px 13px", borderRadius: 13, border: "1px solid #dce2ec", background: "linear-gradient(135deg,#f7f9fc,#ffffff)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", boxShadow: "0 4px 14px rgba(58,72,96,.05)" },
  heading: { display: "flex", alignItems: "center", gap: 9, color: "#405575" },
  headingText: { display: "grid", gap: 2, fontSize: 12.5, lineHeight: 1.25 },
  buttons: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  button: { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #d6dce7", borderRadius: 9, background: "#fff", color: "#687386", padding: "7px 10px", fontSize: 11.5, fontWeight: 850, cursor: "pointer" },
  active: { background: "#405b86", color: "#fff", borderColor: "#405b86", boxShadow: "0 4px 10px rgba(64,91,134,.18)" },
};
const admissionFieldBadge = {
  wrap: { display: "flex", alignItems: "center", justifyContent: "center", gap: 3, flexWrap: "wrap" },
  base: { display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid", borderRadius: 999, padding: "3px 6px", fontSize: 8.7, fontWeight: 900, lineHeight: 1, whiteSpace: "nowrap" },
};
const fieldFilterButton = {
  base: { display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid #ded9cd", borderRadius: 999, background: "#fff", color: "#5f594d", padding: "6px 8px", fontSize: 10, fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" },
  active: { background: "#2f4b32", color: "#fff", borderColor: "#2f4b32" },
  count: { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 16, height: 16, borderRadius: 99, background: "rgba(255,255,255,0.25)", fontSize: 8.5, fontWeight: 900 },
};
const requirementFilterButton = {
  base: { display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid #d9d4c8", background: "#fff", color: "#514b42", borderRadius: 999, padding: "4px 8px", fontSize: 10, fontWeight: 850, cursor: "pointer" },
  active: { background: "#2f4b32", color: "#fff", borderColor: "#2f4b32" },
  count: { display: "inline-flex", minWidth: 17, height: 17, alignItems: "center", justifyContent: "center", borderRadius: 999, background: "rgba(128,128,128,0.14)", fontSize: 8.8, fontWeight: 900 },
};
const admissionStatus = {
  base: { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 64, padding: "6px 10px", borderRadius: 999, fontSize: 11, fontWeight: 900, margin: "1px 0" },
  success: { background: "#e7f5ea", color: "#24613a", border: "1px solid #bfe2c8" },
  danger: { background: "#fff0f0", color: "#9a4242", border: "1px solid #efcaca" },
  warning: { background: "#fff6df", color: "#805f1d", border: "1px solid #efddae" },
  noMinimum: { background: "#eef1ff", color: "#4f4a91", border: "1px solid #d3d1f2" },
  neutral: { background: "#f4f2ed", color: "#716b5f", border: "1px solid #ded9cd" },
};
const consultationView = {
  card:{border:"1px solid #dce3ee",borderRadius:15,padding:16,background:"linear-gradient(135deg,#ffffff,#f7f9fd)",display:"grid",gap:13},
  editor:{display:"grid",gap:9,padding:12,borderRadius:12,background:"#f5f8fc",border:"1px solid #dce4ef"},
  editorTop:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"},
  dateLabel:{display:"inline-flex",alignItems:"center",gap:7,fontSize:11,fontWeight:900,color:"#5f6c7e"},
  dateInput:{border:"1px solid #d4dce8",borderRadius:8,padding:"7px 9px",background:"#fff",fontSize:11.5},
  authorBadge:{display:"inline-flex",alignItems:"center",gap:5,borderRadius:999,padding:"5px 9px",background:"#eaf0fa",color:"#345b8b",border:"1px solid #cfdaea",fontSize:10.5,fontWeight:900},
  textarea:{width:"100%",minHeight:96,resize:"vertical",border:"1px solid #d4dce8",borderRadius:10,padding:"10px 11px",fontSize:12.5,lineHeight:1.55,outline:"none",boxSizing:"border-box",background:"#fff"},
  fileRow:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"},
  fileButton:{display:"inline-flex",alignItems:"center",gap:6,border:"1px solid #cfd9e7",borderRadius:9,padding:"7px 10px",background:"#fff",color:"#315a86",fontSize:11,fontWeight:900,cursor:"pointer"},
  fileHint:{fontSize:10.3,color:"#7b8491"},
  pendingFiles:{display:"flex",gap:6,flexWrap:"wrap"},
  pendingFile:{display:"inline-flex",alignItems:"center",gap:5,maxWidth:"100%",border:"1px solid #d8e1ed",borderRadius:8,padding:"5px 7px",background:"#fff",fontSize:10.3,color:"#42536a"},
  pendingRemove:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:19,height:19,border:0,borderRadius:6,background:"#eef1f5",color:"#7b8491",cursor:"pointer"},
  fileError:{padding:"8px 10px",borderRadius:8,background:"#fff0f0",color:"#9a4242",border:"1px solid #efcaca",fontSize:10.8},
  attachmentList:{display:"flex",gap:6,flexWrap:"wrap",marginTop:8},
  attachmentLink:{display:"inline-flex",alignItems:"center",justifyContent:"space-between",gap:9,maxWidth:"100%",border:"1px solid #d8e1ed",borderRadius:8,padding:"6px 8px",background:"#f7faff",color:"#315a86",fontSize:10.5,cursor:"pointer"},
  saveButton:{justifySelf:"end",display:"inline-flex",alignItems:"center",gap:6,border:0,borderRadius:9,padding:"8px 12px",background:"#315f95",color:"#fff",fontSize:11.5,fontWeight:900,cursor:"pointer"},
  readOnlyNotice:{padding:"9px 11px",borderRadius:9,background:"#f4f6f9",color:"#707a88",fontSize:11.5,border:"1px solid #e0e5ec"},
  notes:{display:"grid",gap:8},
  note:{border:"1px solid #e2e6ed",borderRadius:11,padding:"11px 12px",background:"#fff"},
  noteHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:7},
  noteMeta:{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",fontSize:11,color:"#7b8491"},
  noteText:{margin:0,whiteSpace:"pre-wrap",fontSize:12.2,lineHeight:1.6,color:"#354052"},
  deleteButton:{border:0,borderRadius:7,padding:"5px 7px",background:"#f5eeee",color:"#985050",fontSize:10.5,fontWeight:850,cursor:"pointer"},
  empty:{padding:"18px",borderRadius:10,background:"#fafafa",color:"#8a9099",textAlign:"center",fontSize:11.5,border:"1px dashed #dfe3e8"},
};
const favoriteView = {
  grid:{display:"grid",gridTemplateColumns:"1fr",gap:14},
  card:{border:"1px solid #d8e1ed",borderRadius:15,padding:15,background:"linear-gradient(135deg,#fff,#f7f9fd)",display:"grid",gap:13,boxShadow:"0 5px 16px rgba(46,58,78,.045)",minWidth:0},
  header:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,flexWrap:"wrap",minWidth:0},
  link:{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:5,minHeight:34,border:"1px solid #c9d5e4",background:"#fff",color:"#2e5784",borderRadius:9,padding:"0 10px",fontSize:10.5,fontWeight:900,cursor:"pointer",whiteSpace:"nowrap"},
  sourceGrid:{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:9,minWidth:0},
  sourceBox:{display:"grid",alignContent:"start",gap:7,minHeight:112,padding:"12px",borderRadius:11,background:"#f7f9fc",border:"1px solid #dce4ee",minWidth:0,overflow:"hidden"},
  sourceLabel:{fontSize:10.5,fontWeight:950,color:"#5f6e83",lineHeight:1.3},
  sourceValue:{fontSize:14,color:"#243852",lineHeight:1.35,wordBreak:"keep-all",overflowWrap:"anywhere"},
  sourceHeadline:{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",fontSize:11,color:"#5e6d82"},
  sourceMetrics:{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:7,minWidth:0},
  sourceMetric:{minWidth:0,display:"grid",gap:3,padding:"8px",borderRadius:8,background:"#fff",border:"1px solid #e0e6ef",fontSize:11,color:"#2f425d",overflowWrap:"anywhere"},
  sourceDetail:{fontSize:10.5,color:"#748093",lineHeight:1.5,wordBreak:"keep-all",overflowWrap:"anywhere"},
  naviCutList:{display:"grid",gap:5,minWidth:0},
  naviCutPill:{display:"grid",gap:2,padding:"6px 7px",border:"1px solid #d7e2ef",borderRadius:8,background:"#fff",minWidth:0},
  itemNaviCuts:{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",marginTop:2},
  items:{display:"grid",gap:6},
  item:{display:"flex",alignItems:"center",gap:8,padding:"9px 10px",borderRadius:10,background:"#fff",border:"1px solid #e4e8ef",minWidth:0,flexWrap:"wrap"},
  filters:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",padding:"7px",borderRadius:11,background:"#f4f7fb",border:"1px solid #e0e6ef"},
  filterButton:{display:"inline-flex",alignItems:"center",gap:5,border:"1px solid #d6deea",borderRadius:999,padding:"6px 9px",background:"#fff",color:"#586679",fontSize:10.8,fontWeight:900,cursor:"pointer"},
  filterActive:{background:"#315f95",borderColor:"#315f95",color:"#fff"},
  filteredEmpty:{padding:"16px",borderRadius:10,background:"#fafbfc",border:"1px dashed #dce2eb",color:"#7d8692",textAlign:"center",fontSize:11.5},
  universityTitle:{fontSize:16,color:"#202e43",lineHeight:1.3,wordBreak:"keep-all",overflowWrap:"anywhere"},
  universityCount:{fontSize:10.5,color:"#738095"},
  kindBadge:{display:"inline-flex",justifySelf:"start",borderRadius:999,padding:"2px 6px",background:"#eef3fa",color:"#315a86",fontSize:8.8,fontWeight:900},
  itemText:{display:"grid",gap:3,flex:"1 1 220px",minWidth:0,fontSize:11.5,wordBreak:"keep-all",overflowWrap:"anywhere"},
  itemLink:{display:"inline-flex",alignItems:"center",gap:3,border:"1px solid #d5deea",background:"#fff",color:"#315a86",borderRadius:7,padding:"5px 7px",fontSize:9.8,fontWeight:850,cursor:"pointer",whiteSpace:"nowrap"},
  remove:{border:0,background:"#f2f3f5",color:"#777f8a",borderRadius:7,padding:"5px 7px",fontSize:10.5,fontWeight:800,cursor:"pointer"},
};
const admissionTable = {
  favoriteHead:{width:34,padding:"6px 2px",color:"#b58a00",fontSize:12},
  favoriteCell:{padding:"5px 2px",textAlign:"center",background:"#fbfcfe"},
  universityWrap:{display:"grid",justifyItems:"center",gap:4,minWidth:0},
  starButton:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:22,height:22,borderRadius:7,border:"1px solid #dedfe4",background:"#fff",color:"#a0a5ad",cursor:"pointer"},
  starButtonActive:{background:"#0f1a2e",borderColor:"#0f1a2e",color:"#ffd84d"},
  caseLink:{border:0,background:"#eef3fa",color:"#315a86",borderRadius:999,padding:"3px 6px",fontSize:8.1,fontWeight:850,cursor:"pointer",whiteSpace:"nowrap"},
  caseBadge:{display:"inline-flex",alignItems:"center",justifyContent:"center",background:"#eef3fa",color:"#315a86",borderRadius:999,padding:"3px 6px",fontSize:8.1,fontWeight:850,whiteSpace:"nowrap"},
  base: {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
    fontSize: 10.6,
  },
  th: {
    border: "1px solid #e6e1d3",
    padding: "8px 5px",
    background: "#f6f4ee",
    color: "#332e27",
    fontWeight: 900,
    fontSize: 9.0,
    lineHeight: 1.18,
    textAlign: "center",
    whiteSpace: "normal",
    wordBreak: "keep-all",
  },
  td: {
    border: "1px solid #e6e1d3",
    padding: "7px 4px",
    textAlign: "center",
    verticalAlign: "middle",
    whiteSpace: "normal",
    wordBreak: "keep-all",
    overflowWrap: "break-word",
    lineHeight: 1.38,
    fontSize: 9.1,
    overflow: "hidden",
  },
  stickyHead: { position: "sticky", left: 0, zIndex: 4, boxShadow: "3px 0 7px rgba(43,38,32,.06)" },
  university: {
    position: "sticky",
    left: 0,
    zIndex: 2,
    fontWeight: 900,
    textAlign: "center",
    background: "#fbfaf6",
    color: "#2b2620",
    lineHeight: 1.35,
    fontSize: 9.5,
    overflowWrap: "anywhere",
    boxShadow: "3px 0 7px rgba(43,38,32,.045)",
  },
  text: { textAlign: "left", verticalAlign: "top" },
  regionCell: { padding: "7px 3px", overflow: "visible" },
  fieldCell: { padding: "5px 2px" },
  regionFieldCell: { padding: "5px 3px" },
  regionFieldStack: { display: "grid", justifyItems: "center", gap: 5, minWidth: 0 },
  regionCompact: { padding: "3px 5px", fontSize: 8.8 },
  department: { textAlign: "center", verticalAlign: "middle", paddingLeft: 7, paddingRight: 7 },
  reflectionCell: { textAlign: "center", verticalAlign: "middle", padding: "6px 3px" },
  curriculumCell: { border: "1px solid #e6e1d3", padding: "6px 2px", textAlign: "center", verticalAlign: "middle", whiteSpace: "normal", wordBreak: "keep-all" },
  noteCell: { padding: "6px 5px", background: "#fffefa" },
  subjectCell: { padding: "6px 3px", verticalAlign: "middle" },
  statusCell: { padding: "8px 8px" },
  primaryText: { fontWeight: 900, color: "#2b2620", lineHeight: 1.3, textAlign: "center" },
  detailStack: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, width: "100%" },
  detailGroup: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0, maxWidth: "100%" },
  detailLine: { display: "block", maxWidth: "100%", color: "#25211c", fontSize: 11, fontWeight: 900, lineHeight: 1.35, whiteSpace: "normal", wordBreak: "keep-all", overflowWrap: "break-word", letterSpacing: "-0.1px" },
  trackLine: { display: "inline-flex", maxWidth: "100%", padding: "3px 7px", borderRadius: 7, color: "#4f5870", background: "#eef1f7", border: "1px solid #dce1eb", fontSize: 9.7, fontWeight: 800, lineHeight: 1.25, whiteSpace: "normal", wordBreak: "keep-all" },
  secondaryText: { color: "#716b5f", fontSize: 9.7, lineHeight: 1.45 },
  minimumDetail: { color: "#8a8578", fontSize: 9.2, marginTop: 4, lineHeight: 1.3 },
  empty: { color: "#aaa393", fontSize: 9.7, fontWeight: 700 },
};
const reflectionBadge = {
  display: "inline-flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  width: "auto",
  maxWidth: "98%",
  padding: "5px 7px",
  borderRadius: 4,
  background: "#f7f8f8",
  border: "1px solid #e2e5e6",
  borderLeft: "1.5px solid #8d989f",
  color: "#4d565c",
  fontSize: 10.15,
  fontWeight: 880,
  lineHeight: 1.22,
  whiteSpace: "normal",
  wordBreak: "keep-all",
};
const reflectionBadgeLine = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 11,
  whiteSpace: "normal",
};
const reflectionBadgePlus = {
  marginRight: 2,
  color: "#7d7467",
  fontSize: 9.3,
  fontWeight: 900,
};
const specialNoteStyle = {
  box: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "5px 6px",
    borderRadius: 7,
    background: "#faf8f2",
    borderLeft: "3px solid #cdbf9f",
    color: "#514b42",
    fontSize: 9.5,
    lineHeight: 1.5,
    wordBreak: "keep-all",
    overflowWrap: "anywhere",
  },
  row: { display: "grid", gridTemplateColumns: "7px minmax(0, 1fr)", gap: 2, alignItems: "start" },
  bullet: { color: "#9a7b44", fontWeight: 900, lineHeight: 1.45 },
  label: { color: "#332e27", marginRight: 4, fontWeight: 900 },
};
const subjectRule = {
  text: {
    display: "inline-block",
    maxWidth: "94%",
    boxSizing: "border-box",
    padding: "3px 5px",
    borderRadius: 6,
    background: "#f2f6f7",
    border: "1px solid #d6e1e3",
    color: "#36575b",
    fontSize: 9.3,
    fontWeight: 900,
    lineHeight: 1.18,
    whiteSpace: "normal",
    wordBreak: "keep-all",
    overflowWrap: "anywhere",
    letterSpacing: "-0.2px",
  },
};

const minimumBadge = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 48,
  padding: "5px 7px",
  borderRadius: 8,
  background: "#fff5df",
  border: "1px solid #ead39f",
  color: "#76551b",
  fontSize: 10.7,
  fontWeight: 900,
  whiteSpace: "nowrap",
};
const eachMinimumBadge = {
  background: "#eef3ff",
  border: "1px solid #cbd8ef",
  color: "#3f5680",
  whiteSpace: "normal",
  lineHeight: 1.2,
  textAlign: "center",
};

const noMinimumBadge = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "5px 7px",
  borderRadius: 8,
  background: "#eef1ff",
  border: "1px solid #d3d1f2",
  color: "#4f4a91",
  fontSize: 9.8,
  fontWeight: 900,
  whiteSpace: "nowrap",
};
const studentSumBadge = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "5px 6px",
  borderRadius: 8,
  background: "#eef3ff",
  border: "1px solid #c8d5ef",
  color: "#355b8d",
  fontSize: 10.6,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const eachStudentBadge = {
  background: "#f3efff",
  border: "1px solid #d9cff1",
  color: "#604f8a",
  letterSpacing: "0.2px",
};

const regionBadge = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
  maxWidth: "100%",
  boxSizing: "border-box",
  borderRadius: 999,
  padding: "3px 5px",
  background: "#f0f5ee",
  border: "1px solid #d1dfcd",
  color: "#3d5c3a",
  fontSize: 9,
  fontWeight: 850,
  lineHeight: 1.15,
  whiteSpace: "nowrap",
};
const pdfLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  borderRadius: 7,
  padding: "6px 8px",
  background: "#eef3ff",
  border: "1px solid #cad8f3",
  color: "#315a9b",
  fontSize: 10.8,
  fontWeight: 800,
  textDecoration: "none",
  whiteSpace: "nowrap",
};
const pdfLinkCompactStyle = {
  gap: 2,
  padding: "4px 5px",
  borderRadius: 6,
  fontSize: 9.2,
};
const admissionDocs = {
  tableWrap: { width: "100%", overflowX: "auto", border: "1px solid #e2e5eb", borderRadius: 11, background: "#fff" },
  table: { width: "100%", minWidth: 880, borderCollapse: "collapse", tableLayout: "fixed", fontSize: 11.2, color: "#344154" },
  university: { display: "block", fontSize: 12, lineHeight: 1.35, color: "#24354b", wordBreak: "keep-all", overflowWrap: "anywhere" },
  typeBadge: { display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 999, padding: "4px 7px", background: "#eef3fa", border: "1px solid #d4dfed", color: "#315a86", fontSize: 9.8, fontWeight: 900, whiteSpace: "nowrap" },
  primaryText: { fontSize: 11.5, fontWeight: 850, lineHeight: 1.4, color: "#38495f", wordBreak: "keep-all", overflowWrap: "anywhere" },
  fileName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10.8, color: "#5f6876" },
  fileMeta: { marginTop: 3, fontSize: 9.7, color: "#9098a4" },
  actions: { display: "flex", alignItems: "center", justifyContent: "center", gap: 5, flexWrap: "wrap" },
};
const pdfAdmin = {
  formGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(150px, 1fr))", gap: 10, marginBottom: 12 },
  label: { display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, fontWeight: 800, color: "#5f594d" },
  input: { width: "100%", boxSizing: "border-box", border: "1px solid #ddd7c9", borderRadius: 8, background: "#fff", padding: "8px 10px", fontSize: 12.5, color: "#2b2620", outline: "none" },
  notice: { display: "flex", alignItems: "flex-start", gap: 7, marginTop: 12, borderRadius: 9, padding: "9px 10px", background: "#fff8e6", border: "1px solid #f0dca0", color: "#765e1a", fontSize: 10.8, lineHeight: 1.55 },
  deleteButton: { display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid #efcaca", background: "#fff5f5", color: "#9a4242", borderRadius: 7, padding: "6px 8px", fontSize: 10.8, fontWeight: 800, cursor: "pointer" },
  sectionTitle: { fontSize: 12.5, fontWeight: 900, color: "#3d5c3a", marginBottom: 9 },
  divider: { height: 1, background: "#e7e2d6", margin: "18px 0" },
  progress: { display: "flex", alignItems: "center", gap: 7, marginTop: 10, color: "#3d5c3a", fontSize: 11.5, fontWeight: 800 },
  batchStatus: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 9, padding: "8px 10px", borderRadius: 9, background: "#f4f8fc", border: "1px solid #dce5ef", fontSize: 10.5, color: "#5f6d7d" },
  hiddenFileInput: { position: "fixed", left: "-10000px", top: 0, width: 1, height: 1, opacity: 0.01, overflow: "hidden" },
  pendingUploadBox: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#f4f8fc", border: "1px solid #d7e2ef", color: "#40546e", fontSize: 11.2, overflowWrap: "anywhere" },
  missingHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  missingSummary: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 10.8, color: "#6c6a63" },
  missingSearch: { display: "flex", alignItems: "center", gap: 7, maxWidth: 340, padding: "7px 9px", marginBottom: 10, borderRadius: 9, background: "#fff", border: "1px solid #e3dccb", color: "#7a7468" },
  missingGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 7 },
  missingUniversityButton: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minWidth: 0, padding: "8px 10px", border: "1px solid #ead9a9", borderRadius: 9, background: "#fff", color: "#4c463c", cursor: "pointer", textAlign: "left", fontSize: 11.2, fontWeight: 850 },
  completeNotice: { display: "flex", alignItems: "center", gap: 7, padding: "10px 12px", borderRadius: 9, background: "#edf7ef", border: "1px solid #c8e2ce", color: "#2e6840", fontSize: 11.5, fontWeight: 850 },
};
const chartControlRow = { display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" };
const chartControlLabel = { fontSize: 12, color: "#716b5f", fontWeight: 800 };
const selectStyle = { minWidth: 170, border: "1px solid #ddd7c9", borderRadius: 8, background: "#fff", padding: "7px 10px", fontSize: 12.5, color: "#2b2620", outline: "none" };
const chartEmpty = { border: "1px dashed #ddd7c9", borderRadius: 12, padding: "34px 16px", textAlign: "center", color: "#a39d8c", fontSize: 12.5, background: "#fbfaf6" };
const chart = {
  box: { border: "1px solid #ece8dd", borderRadius: 12, padding: "14px 14px 8px", background: "#fff" },
  title: { fontSize: 13.5, fontWeight: 800, color: "#2b2620", marginBottom: 9 },
  legend: { display: "flex", gap: "8px 16px", alignItems: "center", flexWrap: "wrap", marginBottom: 4, fontSize: 10.8, color: "#716b5f" },
  legendItem: { display: "flex", alignItems: "center", gap: 6 },
  legendLine: { display: "inline-block", width: 22, height: 3, borderRadius: 99 },
  hint: { marginLeft: "auto", fontSize: 10.5, color: "#8a8578", fontWeight: 600 },
};
