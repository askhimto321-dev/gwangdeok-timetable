import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Search, Upload, FileSpreadsheet, Loader2, Save, FileText, ExternalLink, Trash2, BookOpen, Archive, MapPin, Printer, BarChart3, UsersRound, TrendingUp, GraduationCap, CircleAlert, Star, MessageSquare, Paperclip, Download, X, ArrowLeft } from "lucide-react";
import { readStorage, uploadAdmissionDocument, readAdmissionDocument, deleteAdmissionPdf, diagnoseStorageConnection, diagnoseAdmissionFileBackends, uploadClassroomAttachment, deleteClassroomAttachment } from "./storage.js";
import { extractPdfFilesFromZip } from "./zipReader.js";
import { AdmissionCaseAnalytics, AdmissionCaseAdmin } from "./AdmissionCases.jsx";
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
  const text = [explicit, row?.department, row?.track, row?.note]
    .filter(Boolean).join(" ").replace(/\s+/g, "");
  const tags = [];
  if (/간호/.test(text)) tags.push("간호");
  if (/(인문|사회계열|상경|경영|경제|어문|문과|법학|행정|교육계열)/.test(text)) tags.push("인문");
  if (/(자연|이공|공학|과학계열|수학계열|자연과학|의약|의학|약학|수의|보건계열)/.test(text)) tags.push("자연");
  if (/(공통계열|전계열|계열공통)/.test(text)) tags.push("공통");
  const unique = Array.from(new Set(tags));
  return unique.length ? unique : ["공통"];
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
  const known = (knownUniversities || [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => String(b).length - String(a).length);
  const matchedKnown = known.find(name => normalizedFile.includes(universityKey(name)));
  if (matchedKnown) return matchedKnown;

  const base = cleanGuideBaseName(fileName);
  const formalMatch = base.match(/([가-힣A-Za-z0-9·]+?(?:과학기술원|교육대학교|대학교|대학))/);
  if (formalMatch) return formalMatch[1].trim();

  const token = base.split(/[\s()[\]{}]+/).find(part => part && part.length >= 2);
  return token || "대학명 확인 필요";
}

function inferAdmissionYearFromFileName(fileName, fallbackYear = "") {
  const text = String(fileName || "").normalize("NFKC");
  const explicit = text.match(/(20\d{2})\s*학년도/);
  if (explicit) return explicit[1];
  const anyYear = text.match(/(?:^|[^0-9])(20(?:2[4-9]|3[0-5]))(?:[^0-9]|$)/);
  return anyYear?.[1] || String(fallbackYear || "").trim();
}

function compactUniversityName(value) {
  return String(value || "대학").trim().replace(/대학교(?=($|[（(]))/g, "대");
}

function admissionDocumentDisplayLabel(type, valueYear, universityName) {
  const typeName = type === "reflection" ? "교과 반영표" : "모집요강";
  const yearPart = String(valueYear || "").trim() ? `${String(valueYear).trim()}학년도 ` : "";
  return `${yearPart}${compactUniversityName(universityName)} ${typeName}`.replace(/\s+/g, " ").trim();
}

function inferRegionFromFileName(fileName, knownRegion = "") {
  if (knownRegion && knownRegion !== "미지정") return knownRegion;
  const text = String(fileName || "");
  const found = REGION_KEYWORDS.find(([keyword]) => text.includes(keyword));
  return found ? found[1] : "미지정";
}

export async function loadGradesDB() {
  const [semesterData, mockData, admissionRows, admissionDocs, studentAccounts, cohortSettings, admissionCaseSources, admissionCases, admissionFavorites, admissionCounseling] = await Promise.all([
    readStorage("kd_grades_semesters", {}), readStorage("kd_grades_mocks", {}), readStorage("kd_grades_admission", []),
    readStorage("kd_grades_admission_docs", []), readStorage("kd_grades_students_meta", {}), readStorage("kd_grades_cohorts", DEFAULT_COHORT_SETTINGS),
    readStorage("kd_grades_admission_case_sources", []), readStorage("kd_grades_admission_cases", []), readStorage("kd_grades_admission_favorites", {}), readStorage("kd_grades_admission_counseling", {}),
  ]);
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
  persistGrades,
}) {
  const [tab, setTab] = useState(loggedInStudent ? "grades" : "lookup");
  const [localLookupSid, setLocalLookupSid] = useState(null);
  const [localLookupQuery, setLocalLookupQuery] = useState("");
  const controlledLookup = selectedStudentSid !== undefined;
  const lookupSid = controlledLookup ? selectedStudentSid : localLookupSid;
  const lookupQuery = selectedStudentQuery !== undefined ? selectedStudentQuery : localLookupQuery;
  const setLookupSid = value => controlledLookup ? onSelectedStudentSidChange?.(value) : setLocalLookupSid(value);
  const setLookupQuery = value => selectedStudentQuery !== undefined ? onSelectedStudentQueryChange?.(value) : setLocalLookupQuery(value);
  const teacherHasGradeAccess = !loggedInTeacher || (teacherGradeAccess || []).map(String).includes(String(currentGrade));
  const [linkedUniversity, setLinkedUniversity] = useState("");
  const [linkedDepartment, setLinkedDepartment] = useState("");
  const [linkedAdmissionType, setLinkedAdmissionType] = useState("");
  const [returnToConsultation, setReturnToConsultation] = useState(false);
  const favoriteItemsFor = useCallback(targetSid => (gdb?.admissionFavorites?.[String(targetSid)] || []), [gdb]);
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
  const markConsultationHistory = () => {
    if (typeof window === "undefined" || window.history.state?.kdConsultationLink) return;
    window.history.pushState({ ...(window.history.state || {}), kdConsultationLink: true }, "");
  };
  const openCaseUniversity = (name, fromConsultation = false, department = "", admissionType = "") => {
    setLinkedUniversity(name || "");
    setLinkedDepartment(department || "");
    setLinkedAdmissionType(admissionType || "");
    if (fromConsultation) { setReturnToConsultation(true); markConsultationHistory(); }
    setTab("admissionCases");
  };
  const openAdmissionUniversity = (name, fromConsultation = false) => {
    setLinkedUniversity(name || "");
    setLinkedDepartment("");
    setLinkedAdmissionType("");
    if (fromConsultation) { setReturnToConsultation(true); markConsultationHistory(); }
    setTab(loggedInStudent ? "admission" : "lookupAdmission");
  };
  const finishReturnToConsultation = () => {
    setLinkedUniversity("");
    setLinkedDepartment("");
    setLinkedAdmissionType("");
    setReturnToConsultation(false);
    setTab("consultation");
  };
  const returnToConsultationView = () => {
    if (typeof window !== "undefined" && window.history.state?.kdConsultationLink) window.history.back();
    else finishReturnToConsultation();
  };
  const clearLinkedUniversity = () => { setLinkedUniversity(""); setLinkedDepartment(""); setLinkedAdmissionType(""); };

  useEffect(() => {
    const handlePopState = () => { if (returnToConsultation) finishReturnToConsultation(); };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [returnToConsultation]);

  useEffect(() => {
    if (!["admission", "lookupAdmission", "admissionCases"].includes(tab)) {
      setLinkedUniversity("");
      setLinkedDepartment("");
      setLinkedAdmissionType("");
      setReturnToConsultation(false);
      if (typeof window !== "undefined" && window.history.state?.kdConsultationLink) {
        const next = { ...(window.history.state || {}) };
        delete next.kdConsultationLink;
        window.history.replaceState(next, "");
      }
    }
  }, [tab]);

  useEffect(() => {
    if (loggedInTeacher && !teacherHasGradeAccess && tab !== "class") setTab("lookup");
  }, [loggedInTeacher, teacherHasGradeAccess, tab]);

  useEffect(() => {
    if (!requestedStudentView || loggedInStudent) return;
    if (requestedStudentView === "grades") setTab("lookup");
    if (requestedStudentView === "admission") setTab("lookupAdmission");
    if (requestedStudentView === "consultation") setTab("consultation");
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
          <TabBtn active={tab === "grades"} onClick={() => setTab("grades")} label="내 성적 리포트" />
          <TabBtn active={tab === "admission"} onClick={() => setTab("admission")} label="대학 지원 진단" />
          <TabBtn active={tab === "consultation"} onClick={() => setTab("consultation")} label="상담·관심 대학" />
        </div>}
        {(loggedInAdmin || (loggedInTeacher && teacherHasGradeAccess)) && (
          <div style={staffToolNav.wrap}>
            <div style={staffToolNav.heading}><BarChart3 size={17} /><div style={staffToolNav.headingText}><b>교사용 분석·관리</b><span style={{ fontSize: 10.5, fontWeight: 650, color: "#7a8495" }}>학생 조회와 별도로 분석 도구를 사용할 수 있습니다.</span></div></div>
            <div style={staffToolNav.buttons}>
              <button type="button" onClick={() => setTab("mockAnalysis")} style={{ ...staffToolNav.button, ...(tab === "mockAnalysis" ? staffToolNav.active : {}) }}><BarChart3 size={13} /> 모의고사 성적 분석</button>
              <button type="button" onClick={() => setTab("admissionCases")} style={{ ...staffToolNav.button, ...(tab === "admissionCases" ? staffToolNav.active : {}) }}><GraduationCap size={13} /> 2024–2026 광덕고 대입 결과</button>
              {loggedInTeacher && loggedInTeacher.homeroomClass && <button type="button" onClick={() => setTab("class")} style={{ ...staffToolNav.button, ...(tab === "class" ? staffToolNav.active : {}) }}><UsersRound size={13} /> 담임반 학생 계정</button>}
            </div>
          </div>
        )}

        {tab === "grades" && loggedInStudent && <StudentGradeReport key={loggedInStudent.id} sid={loggedInStudent.id} gdb={gdb} mode="grades" studentInfo={loggedInStudent} />}
        {tab === "admission" && loggedInStudent && <StudentAdmissionView key={loggedInStudent.id} sid={loggedInStudent.id} gdb={gdb} studentInfo={loggedInStudent} favorites={favoriteItemsFor(loggedInStudent.id)} onToggleFavorite={item => toggleFavorite(loggedInStudent.id,item)} onOpenCases={(name,department,admissionType)=>openCaseUniversity(name,false,department,admissionType)} focusUniversity={linkedUniversity} onBackToConsultation={returnToConsultation ? returnToConsultationView : undefined} onClearFocus={clearLinkedUniversity} />}
        {tab === "consultation" && loggedInStudent && <StudentConsultationView sid={loggedInStudent.id} gdb={gdb} studentInfo={loggedInStudent} favorites={favoriteItemsFor(loggedInStudent.id)} onToggleFavorite={item => toggleFavorite(loggedInStudent.id,item)} onOpenAdmission={name => openAdmissionUniversity(name, true)} onOpenCases={(name,department,admissionType) => openCaseUniversity(name, true, department, admissionType)} persistGrades={persistGrades} canEdit={false} authorName={loggedInStudent.name || "학생"} />}

        {loggedInTeacher && !teacherHasGradeAccess && (
          <EmptyBox text={`${currentGrade}학년 학생 성적 조회 권한이 없습니다. 관리자에게 역할 또는 성적 조회 권한을 요청해주세요.`} />
        )}

        {tab === "lookup" && (loggedInAdmin || (loggedInTeacher && teacherHasGradeAccess)) && (
          <StudentLookup
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
        )}
        {tab === "lookupAdmission" && (loggedInAdmin || (loggedInTeacher && teacherHasGradeAccess)) && (
          <StudentLookup
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
        )}
        {tab === "consultation" && (loggedInAdmin || (loggedInTeacher && teacherHasGradeAccess)) && lookupSid && (
          <StudentConsultationView
            sid={lookupSid}
            gdb={gdb}
            studentInfo={roster?.[lookupSid]}
            favorites={favoriteItemsFor(lookupSid)}
            onToggleFavorite={item => toggleFavorite(lookupSid,item)}
            onOpenAdmission={name => openAdmissionUniversity(name, true)}
            onOpenCases={(name,department,admissionType) => openCaseUniversity(name, true, department, admissionType)}
            persistGrades={persistGrades}
            canEdit
            authorName={loggedInAdmin ? "관리자" : (loggedInTeacher?.name || loggedInTeacher?.id || "선생님")}
          />
        )}
        {tab === "consultation" && (loggedInAdmin || (loggedInTeacher && teacherHasGradeAccess)) && !lookupSid && (
          <EmptyBox text="상단 학생 통합 검색에서 상담할 학생을 선택하세요." />
        )}
        {tab === "mockAnalysis" && (loggedInAdmin || (loggedInTeacher && teacherHasGradeAccess)) && (
          <MockAnalysisDashboard gdb={gdb} roster={roster} currentGrade={currentGrade} />
        )}
        {tab === "admissionCases" && (loggedInAdmin || (loggedInTeacher && teacherHasGradeAccess)) && (
          <AdmissionCaseAnalytics gdb={gdb} roster={roster} currentGrade={currentGrade} selectedStudentSid={lookupSid} onSelectedStudentSidChange={setLookupSid} selectedStudentQuery={lookupQuery} onSelectedStudentQueryChange={setLookupQuery} favorites={favoriteItemsFor(lookupSid)} onToggleFavorite={lookupSid ? item => toggleFavorite(lookupSid,item) : undefined} onOpenAdmission={openAdmissionUniversity} focusUniversity={linkedUniversity} focusDepartment={linkedDepartment} focusAdmissionType={linkedAdmissionType} onBackToConsultation={returnToConsultation ? returnToConsultationView : undefined} onClearFocus={clearLinkedUniversity} />
        )}
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
function MockAnalysisDashboard({ gdb, roster, currentGrade }) {
  const entryYear = entryYearForGrade(gdb.cohortSettings, currentGrade);
  // 현재 학년까지의 누적 회차를 모두 보여줍니다. 예: 2학년은 1학년 3·6·9·10월도 함께 조회.
  const available = MOCK_MONTH_KEYS.filter(key => (
    Number(key.split("-")[0]) <= Number(currentGrade)
    && cohortRecord(gdb.mockData, entryYear, key)?.students
  ));
  const [mockKey, setMockKey] = useState(available[available.length - 1] || "");
  const [classFilter, setClassFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("전체");
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
  const gradeCellStyle = grade => grade === 1
    ? { background: "#e3f5e8", color: "#1f6a3a", fontWeight: 950 }
    : grade === 2
      ? { background: "#eaf1ff", color: "#315a9b", fontWeight: 950 }
      : {};
  const subjectGradeBadge = grade => grade === 1
    ? { background: "#dff4e5", color: "#1e6637", border: "1px solid #b9dfc4" }
    : grade === 2
      ? { background: "#e7efff", color: "#315a9b", border: "1px solid #c3d2ef" }
      : { color: "#8a8578" };

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

      <div style={{ ...card, padding: 12, marginTop: 12, borderLeft: "4px solid #496d9b" }}>
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 10, fontWeight: 950, color: "#5f594d", marginRight: 2 }}>조회 조건</div>
          <select value={classFilter} onChange={event => setClassFilter(event.target.value)} style={{ ...btn.input, width: 132 }}><option value="all">전체 반</option>{classes.map(value => <option key={value} value={value}>{value}반</option>)}</select>
          <select value={subjectFilter} onChange={event => setSubjectFilter(event.target.value)} style={{ ...btn.input, width: 132 }}><option>전체</option>{MOCK_SUBJECTS.map(subject => <option key={subject}>{subject}</option>)}</select>
          <select value={gradeFilter} onChange={event => setGradeFilter(event.target.value)} style={{ ...btn.input, width: 132 }}><option value="all">전체 등급</option>{Array.from({ length: 9 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}등급</option>)}</select>
          <span style={{ marginLeft: "auto", borderRadius: 999, background: "#eef3fb", color: "#365d8a", border: "1px solid #cbd9ec", padding: "5px 9px", fontSize: 10.5, fontWeight: 900 }}>{subjectFilter === "전체" && gradeFilter !== "all" ? `전 과목 중 ${gradeFilter}등급 보유 · ${filtered.length}명` : `${filtered.length}명 조회`}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 12, marginBottom: 18 }}>
        {summaryItems.map(item => (
          <div key={item.label} style={{ background: item.bg, border: `1px solid ${item.tone}22`, borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <span style={{ width: 36, height: 36, borderRadius: 11, display: "grid", placeItems: "center", color: item.tone, background: "rgba(255,255,255,.72)", flex: "0 0 auto" }}>{item.icon}</span>
            <div style={{ minWidth: 0 }}><div style={{ fontWeight: 950, fontSize: 18, color: item.tone, lineHeight: 1.1 }}>{item.value}</div><div style={{ color: "#746d61", fontSize: 11.5, marginTop: 4, whiteSpace: "normal" }}>{item.label}</div></div>
          </div>
        ))}
      </div>

      <div style={{ ...card, borderTop: "4px solid #4a7297", overflow: "hidden", marginTop: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 11 }}>
          <div>
            <div style={{ fontWeight: 950 }}>반별 평균 비교</div>
            <div style={{ fontSize: 11, color: "#8a8578", marginTop: 3 }}>결시자는 평균에서 제외하며, 응시·결시 인원을 함께 표시합니다.</div>
          </div>
          <select value={classMetric} onChange={event => setClassMetric(event.target.value)} style={{ ...btn.input, width: 132 }}><option>총점</option>{MOCK_SUBJECTS.map(subject => <option key={subject}>{subject}</option>)}</select>
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

      <div style={{ ...card, borderTop: "4px solid #5969a5", marginTop: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 11 }}><div><div style={{ fontWeight: 950 }}>과목별 평균 및 등급별 인원</div><div style={{ fontSize: 11, color: "#8a8578", marginTop: 3 }}>1·2등급 인원을 강조했습니다. 반 필터를 바꾸면 표도 함께 갱신됩니다.</div></div></div>
        <div style={{ overflowX: "auto" }}><table style={{ ...table.base, tableLayout: "fixed", minWidth: 820 }}><thead><tr><th style={{ ...table.th, width: 96 }}>과목</th><th style={{ ...table.th, width: 92 }}>평균 원점수</th>{Array.from({ length: 9 }, (_, index) => <th key={index} style={{ ...table.th, ...(index < 2 ? gradeCellStyle(index + 1) : {}) }}>{index + 1}등급</th>)}</tr></thead><tbody>{MOCK_SUBJECTS.map(subject => <tr key={subject}><td style={{ ...table.td, fontWeight: 900 }}>{subject}</td><td style={{ ...table.td, fontWeight: 850 }}>{avgFor(classScopedPresentRows, subject) ?? "-"}</td>{gradeCounts[subject].map((count, index) => <td key={index} style={{ ...table.td, ...gradeCellStyle(index + 1) }}>{count}</td>)}</tr>)}</tbody></table></div>
      </div>

      <div style={{ ...card, borderTop: "4px solid #2b2620", marginTop: 16 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}><div><div style={{ fontWeight: 950 }}>학생별 총점 순위</div><div style={{ fontSize: 11, color: "#8a8578", marginTop: 3 }}>상위 24위는 검은 순위 배지로 강조하고 과목별 1·2등급은 색으로 구분합니다.</div></div><span style={{ fontSize: 11, fontWeight: 850, color: "#746d61" }}>{filtered.length}명</span></div><div style={{ maxHeight: 560, overflow: "auto" }}><table style={{ ...table.base, minWidth: 880, tableLayout: "fixed" }}><colgroup><col style={{ width: 58 }} /><col style={{ width: 72 }} /><col style={{ width: 105 }} /><col style={{ width: 72 }} /><col style={{ width: 66 }} />{MOCK_SUBJECTS.map(subject => <col key={subject} style={{ width: 72 }} />)}</colgroup><thead><tr><th style={table.th}>등수</th><th style={table.th}>학번</th><th style={table.th}>이름</th><th style={table.th}>반</th><th style={table.th}>총점</th>{MOCK_SUBJECTS.map(subject => <th key={subject} style={table.th}>{subject}</th>)}</tr></thead><tbody>{filtered.map(row => {
        const isTop24 = row.rank != null && row.rank <= 24;
        return <tr key={row.sid} style={{ background: isTop24 ? "#fffdf5" : "#fff" }}><td style={{ ...table.td, fontWeight: 900 }}><span style={isTop24 ? { display: "inline-grid", placeItems: "center", minWidth: 31, height: 25, padding: "0 5px", borderRadius: 7, background: "#171714", color: "#f2d56b", boxShadow: "0 0 0 2px #f3e6a5" } : {}}>{row.rank ?? "-"}</span></td><td style={table.td}>{row.sid}</td><td style={{ ...table.td, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.name}>{row.name}</td><td style={table.td}>{row.classNumber ? `${row.classNumber}반` : "-"}</td><td style={{ ...table.td, fontWeight: 950, color: isTop24 ? "#6d5311" : "#2b2620" }}>{row.isAbsent ? "결시" : (row.total ?? "-")}</td>{MOCK_SUBJECTS.map(subject => {
          const grade = Number(row.grades?.[subject]);
          return <td key={subject} style={table.td}><div style={{ fontWeight: 750 }}>{row.scores?.[subject] ?? "-"}</div>{grade ? <small style={{ display: "inline-block", marginTop: 2, borderRadius: 999, padding: grade <= 2 ? "2px 6px" : 0, ...subjectGradeBadge(grade) }}>{grade}등급</small> : null}</td>;
        })}</tr>;
      })}</tbody></table></div></div>

      <div style={{ ...card, borderTop: "4px solid #8a641d", padding: 0, overflow: "hidden" }}>
        <button type="button" onClick={() => setShowCutoffs(value => !value)} style={{ width: "100%", border: 0, background: "#fffaf0", padding: "13px 15px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer", color: "#4f493f", textAlign: "left" }}>
          <span><b style={{ display: "block", fontSize: 13 }}>등급컷 상세 보기</b><small style={{ display: "block", marginTop: 3, color: "#8a8578", fontSize: 10.5 }}>업로드된 원점수 중 각 등급의 최저점입니다. 필요할 때만 펼쳐 확인합니다.</small></span>
          <span style={{ borderRadius: 999, background: showCutoffs ? "#8a641d" : "#fff", color: showCutoffs ? "#fff" : "#76551b", border: "1px solid #d9c38d", padding: "5px 9px", fontSize: 10, fontWeight: 900 }}>{showCutoffs ? "접기" : "펼치기"}</span>
        </button>
        {showCutoffs && (
          <div style={{ padding: 14, borderTop: "1px solid #eadfca", overflowX: "auto" }}>
            <table style={{ ...table.base, minWidth: 760 }}><thead><tr><th style={table.th}>과목</th>{Array.from({ length: 9 }, (_, index) => <th key={index} style={{ ...table.th, ...(index < 2 ? gradeCellStyle(index + 1) : {}) }}>{index + 1}등급</th>)}</tr></thead><tbody>{cutRows.map(row => <tr key={row.subject}><td style={{ ...table.td, fontWeight: 850 }}>{row.subject}</td>{row.cuts.map((value, index) => <td key={index} style={{ ...table.td, ...gradeCellStyle(index + 1) }}>{value ?? "-"}</td>)}</tr>)}</tbody></table>
          </div>
        )}
      </div>
    </div>
  );
}
const analysisCard = { background: "#fff", border: "1px solid #e2ded3", borderRadius: 12, padding: 14, display: "flex", alignItems: "center", gap: 10, color: "#3d5c3a" };

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
  const entryYear = initialEntryYear;
  const gradeSystem = entryYear >= 2025 ? 5 : 9;

  const subjectLists = SEMESTER_KEYS.map((key, index) => semesterRecords[index]?.subjects || null);
  const hasAnyGrades = subjectLists.some(subjects => subjects?.length);
  const [requestedGradeScale, setRequestedGradeScale] = useState(null);
  const displayGradeScale = gradeSystem === 9 ? 9 : (requestedGradeScale === 9 ? 9 : 5);
  const groups = useMemo(() => computeAllGroupAverages(subjectLists, gradeSystem), [semesterData, sid, gradeSystem]); // eslint-disable-line

  const displaySemesterKeys = SEMESTER_KEYS.filter(key => Number(key.split("-")[0]) <= inferredGrade);
  const availableSemesters = displaySemesterKeys.filter(key => {
    const index = SEMESTER_KEYS.indexOf(key);
    return subjectLists[index] && subjectLists[index].length;
  });

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
    () => matchUniversities(latestSums, admissionRows || []),
    [latestSums, admissionRows],
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
        groups[selectedCategoryTrend]?.[field]?.[SEMESTER_KEYS.indexOf(key)] ?? null
      )),
      showLabels: true,
    }];
  }, [groups, availableSemesters, displayGradeScale, selectedCategoryTrend]);

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
      <StudentIdentityBanner
        sid={sid}
        name={studentName}
        grade={inferredGrade}
        classNumber={inferredClass}
        number={inferredNumber}
        entryYear={entryYear}
        gradeSystem={gradeSystem}
      />

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
            title={`교과별 평균 (${displayGradeScale}등급${gradeSystem === 5 && displayGradeScale === 9 ? " 환산" : "제"})`}
            description="국어·영어·수학·사회·과학의 학점 가중평균입니다. 전체 평균 열은 별도로 강조했습니다."
          />
          {gradeSystem === 5 && (
            <GradeScaleSelector value={displayGradeScale} onChange={setRequestedGradeScale} />
          )}
          <AverageTable
            names={CATEGORY_GROUP_NAMES}
            groups={groups}
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
            title={`계열별 평균 (${displayGradeScale}등급${gradeSystem === 5 && displayGradeScale === 9 ? " 환산" : "제"})`}
            description="대학 교과전형에서 자주 활용하는 교과 조합별 학점 가중평균입니다."
          />
          <AverageTable
            names={COMBINATION_GROUP_NAMES}
            groups={groups}
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
            description={`선택한 항목 한 개만 그래프로 표시하여 선이 겹치지 않도록 했습니다. 내신은 ${displayGradeScale}등급${gradeSystem === 5 && displayGradeScale === 9 ? " 환산" : "제"} 기준이며, 위쪽의 1등급에 가까울수록 우수합니다.`}
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
    .replace(/대학교/g, "대")
    .replace(/(?:서울|세종|죽전|천안|글로컬|글로벌|메디컬|ERICA|국제)캠퍼스/gi, "")
    .replace(/캠퍼스/g, "")
    .replace(/\s+/g, "")
    .replace(/[()\[\]{}·ㆍ.,_-]/g, "")
    .toLowerCase();
}


const ADMISSION_CAMPUS_ALIASES = ["서울","세종","글로컬","글로벌","메디컬","ERICA","국제","죽전","천안","안성","수원","송도","미래","다빈치","용인"];
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
};
function normalizeAdmissionRegion(value) {
  const text = String(value || "").normalize("NFKC").replace(/특별시|광역시|특별자치시|특별자치도|도$/g, "").trim();
  if (!text || text === "미지정" || text === "공통") return "";
  const aliases = { 경기도:"경기", 충청남도:"충남", 충청북도:"충북", 전라남도:"전남", 전라북도:"전북", 경상남도:"경남", 경상북도:"경북", 제주도:"제주" };
  return aliases[text] || text;
}
function explicitAdmissionCampusLabel(value) {
  const source = String(value || "").normalize("NFKC");
  const bracket = source.match(/[（(\[]\s*([^）)\]]+)\s*[）)\]]/);
  const bracketValue = String(bracket?.[1] || "").replace(/캠퍼스/gi, "").trim();
  if (bracketValue && (ADMISSION_CAMPUS_ALIASES.some(name => bracketValue.toUpperCase() === name.toUpperCase()) || /캠퍼스/i.test(String(bracket?.[1] || "")))) {
    return bracketValue.toUpperCase() === "ERICA" ? "ERICA" : bracketValue;
  }
  const suffix = ADMISSION_CAMPUS_ALIASES.find(name => new RegExp(`${name}\\s*캠퍼스`, "i").test(source));
  return suffix ? (suffix.toUpperCase() === "ERICA" ? "ERICA" : suffix) : "";
}
function admissionCampusLabel(value, region = "") {
  const explicit = explicitAdmissionCampusLabel(value);
  if (explicit) return explicit;
  const base = universityKey(value);
  const regionKey = normalizeAdmissionRegion(region);
  return ADMISSION_MULTI_CAMPUS_BY_REGION[base]?.[regionKey] || "";
}
function universityDocumentKey(value, region = "") {
  return `${universityKey(value)}|${admissionCampusLabel(value, region)}`;
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
  if (rowCampus) return baseItems.filter(item => admissionCampusLabel(item?.university, item?.region) === rowCampus);
  const noCampus = baseItems.filter(item => !admissionCampusLabel(item?.university, item?.region));
  if (noCampus.length) return noCampus;
  const campusGroups = new Set(baseItems.map(item => admissionCampusLabel(item?.university, item?.region)).filter(Boolean));
  return campusGroups.size <= 1 ? baseItems : [];
}
function admissionDocumentMatchesRow(docItem, row) {
  if (universityKey(docItem?.university) !== universityKey(row?.university || row?.name)) return false;
  const docCampus = admissionCampusLabel(docItem?.university, docItem?.region);
  const rowCampus = admissionCampusLabel(row?.university || row?.name, row?.region);
  if (docCampus && rowCampus) return docCampus === rowCampus;
  return !docCampus || !rowCampus;
}
function admissionCaseItemsForRow(caseIndex, row) {
  const baseItems = caseIndex?.get(universityKey(row?.university)) || [];
  if (!baseItems.length) return [];
  const rowCampus = admissionCampusLabel(row?.university, row?.region);
  if (rowCampus) return baseItems.filter(item => admissionCampusLabel(item?.universityNormalized || item?.university, item?.region) === rowCampus);
  const noCampus = baseItems.filter(item => !admissionCampusLabel(item?.universityNormalized || item?.university, item?.region));
  if (noCampus.length) return noCampus;
  const groups = new Set(baseItems.map(item => admissionCampusLabel(item?.universityNormalized || item?.university, item?.region)).filter(Boolean));
  return groups.size <= 1 ? baseItems : [];
}
function admissionCaseFocusUniversity(row) {
  const campus = admissionCampusLabel(row?.university, row?.region);
  if (!campus || explicitAdmissionCampusLabel(row?.university)) return row?.university || "";
  return `${row?.university || ""}(${campus})`;
}
function favoriteSemanticKey(item) {
  const source = item?.source || "admission";
  const scope = item?.favoriteKind === "개별사례" || item?.caseId ? `case:${String(item?.caseId || "")}` : "group";
  return [source, universityDocumentKey(item?.university, item?.region), String(item?.department || "전체").trim(), String(item?.admissionType || "").trim(), scope].join("|");
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
  const [fieldFilter, setFieldFilter] = useState("all");
  const [requirementFilter, setRequirementFilter] = useState("all");
  const [admissionViewMode, setAdmissionViewMode] = useState("mock");
  const [admissionTableView, setAdmissionTableView] = useState("focus");
  useEffect(() => {
    if (focusUniversity) setQuery(String(focusUniversity).replace(/\([^)]*\)|\[[^\]]*\]/g, "").trim());
  }, [focusUniversity]);

  const admissionDocumentIndex = useMemo(() => buildAdmissionDocumentIndex(admissionDocs || []), [admissionDocs]);

  const evaluatedRows = useMemo(() => (admissionRows || []).map((row, index) => {
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
  }), [admissionRows, latestSums, latestMockGrades, admissionDocumentIndex]);

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
  const caseCountForRow = row => admissionCaseItemsForRow(caseIndexByUniversity, row).length;
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
      if (fieldFilter !== "all" && !(row._fieldTags || []).includes(fieldFilter)) return false;
      if (admissionViewMode === "mock") {
        if (requirementFilter === "none" && row.evaluation.status !== "no-minimum") return false;
        if (!["all", "none"].includes(requirementFilter) && Number(row.evaluation.count) !== Number(requirementFilter)) return false;
        if (statusFilter === "satisfied") return row.evaluation.status === "satisfied" || row.evaluation.status === "no-minimum";
        if (statusFilter === "unsatisfied") return row.evaluation.status === "unsatisfied";
        if (statusFilter === "review") return ["manual", "unavailable"].includes(row.evaluation.status);
      }
      return true;
    });
  }, [evaluatedRows, query, statusFilter, regionFilter, fieldFilter, requirementFilter, admissionViewMode]);

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
    ...(admissionDocs || []).map(docItem => docItem.region || "미지정"),
  ])).filter(Boolean).sort((a, b) => a.localeCompare(b, "ko")), [evaluatedRows, admissionDocs]);

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

  const docsWithoutRows = useMemo(() => (admissionDocs || []).filter(docItem => (
    !evaluatedRows.some(row => admissionDocumentMatchesRow(docItem, row))
  )), [admissionDocs, evaluatedRows]);

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
                  <button key={key} onClick={() => setFieldFilter(key)} style={{ ...fieldFilterButton.base, ...(fieldFilter === key ? fieldFilterButton.active : {}) }}>
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

        {admissionViewMode === "school" && admissionRows.length > 0 && curriculumMethodCounts.total === 0 && (
          <div style={curriculumDataWarning}>
            현재 저장된 전형 데이터에는 공통과목·선택과목 반영 방식이 없습니다. 관리자 화면에서 대입 전형표 엑셀을 다시 업로드하면 이 표에 자동 반영됩니다.
          </div>
        )}

        {!admissionRows.length ? (
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
                  return (
                    <tr key={`${row.university}-${row._index}`}>
                      <td style={{ ...admissionTable.td, ...admissionTable.favoriteCell }}>{onToggleFavorite&&<button type="button" style={{...admissionTable.starButton,...(favoriteActive({source:"admission",university:row.university,region:row.region,department:row.department,admissionType:row.track})?admissionTable.starButtonActive:{})}} onClick={()=>onToggleFavorite({source:"admission",favoriteKind:"전형",university:row.university,department:row.department,admissionType:row.track,region:row.region,field:(row._fieldTags||[]).join(", "),label:`${row.university} ${row.department||row.track||""}`})} title="상담·관심 대학에 저장"><Star size={13} fill="currentColor"/></button>}</td>
                      <td style={{ ...admissionTable.td, ...admissionTable.university }}><div style={admissionTable.universityWrap}><span>{row.university}</span>{caseCountForRow(row)>0&&(onOpenCases?<button type="button" style={admissionTable.caseLink} onClick={()=>onOpenCases(admissionCaseFocusUniversity(row),row.department||"",row.track||"")}>사례 {caseCountForRow(row)}건</button>:<span style={admissionTable.caseBadge} title="상담·관심 대학에 저장하면 대학 기준과 광덕고 사례를 함께 볼 수 있습니다.">사례 {caseCountForRow(row)}건</span>)}</div></td>
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
                  return (
                    <tr key={`school-${row.university}-${row._index}`}>
                      <td style={{ ...admissionTable.td, ...admissionTable.favoriteCell }}>{onToggleFavorite&&<button type="button" style={{...admissionTable.starButton,...(favoriteActive({source:"admission",university:row.university,region:row.region,department:row.department,admissionType:row.track})?admissionTable.starButtonActive:{})}} onClick={()=>onToggleFavorite({source:"admission",favoriteKind:"전형",university:row.university,department:row.department,admissionType:row.track,region:row.region,field:(row._fieldTags||[]).join(", "),label:`${row.university} ${row.department||row.track||""}`})} title="상담·관심 대학에 저장"><Star size={13} fill="currentColor"/></button>}</td>
                      <td style={{ ...admissionTable.td, ...admissionTable.university }}><div style={admissionTable.universityWrap}><span>{row.university}</span>{caseCountForRow(row)>0&&(onOpenCases?<button type="button" style={admissionTable.caseLink} onClick={()=>onOpenCases(admissionCaseFocusUniversity(row),row.department||"",row.track||"")}>사례 {caseCountForRow(row)}건</button>:<span style={admissionTable.caseBadge} title="상담·관심 대학에 저장하면 대학 기준과 광덕고 사례를 함께 볼 수 있습니다.">사례 {caseCountForRow(row)}건</span>)}</div></td>
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

      {docsWithoutRows.length > 0 && (
        <div style={card}>
          <SectionHeading title="추가 대학 자료" description="입시전형표에는 아직 없지만 관리자가 등록한 모집요강 또는 교과 반영표입니다." />
          <div style={admissionDocs.tableWrap}>
            <table className="admission-extra-docs-table" style={{...admissionDocs.table,minWidth:0}}>
              <colgroup><col style={{width:"24%"}}/><col style={{width:"12%"}}/><col style={{width:"16%"}}/><col style={{width:"34%"}}/><col style={{width:"14%"}}/></colgroup>
              <thead><tr>{["대학교","지역","자료 유형","표시 이름","자료 열기"].map(label=><th key={label} style={admissionTable.th}>{label}</th>)}</tr></thead>
              <tbody>{docsWithoutRows.map(docItem => <tr key={docItem.id || docItem.url || docItem.dataKey}><td style={admissionTable.td}><b style={admissionDocs.university}>{docItem.university}</b></td><td style={admissionTable.td}><span style={regionBadge}>{docItem.region || "미지정"}</span></td><td style={admissionTable.td}><span style={admissionDocs.typeBadge}>{admissionDocumentType(docItem)==="reflection"?"교과 반영표":"모집요강"}</span></td><td style={admissionTable.td}><div style={admissionDocs.primaryText}>{docItem.label || admissionDocumentDisplayLabel(admissionDocumentType(docItem), docItem.year, docItem.university)}</div></td><td style={admissionTable.td}><PdfLink docItem={docItem} compact /></td></tr>)}</tbody>
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
    <div style={{ ...studentBanner.box, ...(admissionView || favoritesView ? studentBanner.admissionBox : {}) }}>
      <div style={studentBanner.topRow}>
        <div style={studentBanner.main}>
          <div style={{ ...studentBanner.eyebrow, ...(admissionView ? studentBanner.admissionEyebrow : {}) }}>{favoritesView ? "학생 상담·관심 대학" : admissionView ? "학생 대학 지원 진단" : "학생 성적 리포트"}</div>
          <div style={studentBanner.titleRow}>
            <span style={studentBanner.identity}>{sid}{name ? ` ${name}` : ""}</span>
            <span style={{ ...studentBanner.titleTag, ...(admissionView ? studentBanner.admissionTitleTag : {}) }}>{favoritesView ? "상담 기록" : admissionView ? "대학 지원" : "성적 분석"}</span>
          </div>
          <div style={studentBanner.subtitle}>{favoritesView ? "상담 기록과 저장한 대학·학과의 지원 기준·광덕고 사례를 함께 확인합니다." : admissionView ? "현재 성적과 대학별 지원 기준을 비교한 상담용 진단입니다." : "학기별 내신 성적과 성취도 흐름을 확인합니다."}</div>
          <div style={studentBanner.badges}>
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
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: "#2b2620" }}>{title}</div>
      {description && <div style={{ fontSize: 11.8, color: "#8a8578", marginTop: 4, lineHeight: 1.5 }}>{description}</div>}
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

function GradeScaleSelector({ value, onChange }) {
  return (
    <div style={gradeScaleSelector.box}>
      <div>
        <div style={gradeScaleSelector.title}>내신 등급 기준</div>
        <div style={gradeScaleSelector.description}>5등급제 원등급과 9등급 환산값(2n-1)을 분리해서 확인합니다.</div>
      </div>
      <div style={gradeScaleSelector.buttons}>
        <button
          onClick={() => onChange(5)}
          style={{ ...gradeScaleSelector.button, ...(value === 5 ? gradeScaleSelector.active : {}) }}
        >
          5등급제 원등급
        </button>
        <button
          onClick={() => onChange(9)}
          style={{ ...gradeScaleSelector.button, ...(value === 9 ? gradeScaleSelector.active : {}) }}
        >
          9등급 환산
        </button>
      </div>
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
  const width = 920;
  const height = 350;
  const margin = { top: 38, right: 28, bottom: 66, left: 54 };
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

          {labels.map((label, index) => (
            <g key={`${label}-${index}`}>
              <line x1={xAt(index)} y1={margin.top} x2={xAt(index)} y2={margin.top + plotHeight} stroke="#f2efe7" strokeWidth="1" />
              <text x={xAt(index)} y={height - 27} textAnchor="middle" fontSize="10.5" fill="#716b5f">{label}</text>
            </g>
          ))}

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

function formatStoredFileSize(size) {
  const value = Number(size || 0);
  if (!value) return "";
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10}KB`;
  return `${Math.round(value / 1024 / 102.4) / 10}MB`;
}

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

function StudentFavoritesView({ sid, gdb, studentInfo, favorites = [], onToggleFavorite, onOpenAdmission, onOpenCases, hideBanner = false }) {
  const identity = studentViewIdentityMeta({ sid, gdb, studentInfo });
  const [favoriteFilter, setFavoriteFilter] = useState("전체");
  const categoryCounts = useMemo(() => {
    const counts = {전체:(favorites||[]).length,대학:0,학과:0,전형:0};
    (favorites||[]).forEach(item => { const key=favoriteCategory(item); counts[key]=(counts[key]||0)+1; });
    return counts;
  }, [favorites]);
  const visibleFavorites = useMemo(() => favoriteFilter === "전체" ? (favorites || []) : (favorites || []).filter(item => favoriteCategory(item) === favoriteFilter), [favorites, favoriteFilter]);
  const groups = useMemo(() => {
    const map = new Map();
    visibleFavorites.forEach(item => {
      const key = universityKey(item.university);
      if (!key) return;
      if (!map.has(key)) map.set(key, { university: item.university, items: [] });
      map.get(key).items.push(item);
    });
    return Array.from(map.values()).sort((a,b)=>a.university.localeCompare(b.university,"ko"));
  }, [visibleFavorites]);

  const favoriteContent = !(favorites || []).length
    ? <EmptyBox text="아직 저장한 관심 대학·학과가 없습니다. 대학 지원 진단 또는 광덕고 대입 결과의 별 아이콘을 눌러 저장하세요." />
    : <div style={card}>
        <SectionHeading title="관심 대학·학과" description="대학·학과·전형별로 저장한 항목을 분류하고, 지원 진단과 광덕고 사례를 같은 학교 기준으로 연결합니다." />
        <div style={favoriteView.filters}>{["전체","대학","학과","전형"].map(value=><button key={value} type="button" onClick={()=>setFavoriteFilter(value)} style={{...favoriteView.filterButton,...(favoriteFilter===value?favoriteView.filterActive:{})}}>{value}<span>{categoryCounts[value]||0}</span></button>)}</div>
        {!groups.length ? <div style={favoriteView.filteredEmpty}>선택한 분류에 저장된 관심 항목이 없습니다.</div> : <div style={favoriteView.grid}>{groups.map(group=>{
          const admissions=(gdb.admissionRows||[]).filter(row=>universityKey(row.university)===universityKey(group.university));
          const cases=(gdb.admissionCases||[]).filter(row=>universityKey(row.universityNormalized||row.university)===universityKey(group.university));
          const accepted=cases.filter(row=>row.finalResult==="합격");
          const cutValues=accepted.map(row=>asNumber(row.universityGrade??row.overallGrade)).filter(value=>value!=null).sort((a,b)=>a-b);
          const cut50=cutValues.length?(cutValues.length%2?cutValues[(cutValues.length-1)/2]:(cutValues[cutValues.length/2-1]+cutValues[cutValues.length/2])/2):null;
          return <article key={group.university} style={favoriteView.card}>
            <div style={favoriteView.header}><div style={{display:"grid",gap:3,minWidth:0}}><b style={favoriteView.universityTitle}>{group.university}</b><span style={favoriteView.universityCount}>{group.items.length}개 관심 항목</span></div><div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>{onOpenAdmission&&admissions.length>0&&<button type="button" style={favoriteView.link} onClick={()=>onOpenAdmission(group.university)}>지원 진단 <ExternalLink size={12}/></button>}{onOpenCases&&cases.length>0&&<button type="button" style={favoriteView.link} onClick={()=>{const target=group.items.length===1?group.items[0]:null;onOpenCases(group.university,target?.department||"",target?.admissionType||"")}}>{group.items.length===1&&group.items[0]?.department?"저장 학과 사례":"학교 전체 사례"} <ExternalLink size={12}/></button>}</div></div>
            <div style={favoriteView.sourceGrid}>
              <div style={favoriteView.sourceBox}><small style={favoriteView.sourceLabel}>대학 지원 진단</small><b style={favoriteView.sourceValue}>{admissions.length}개 전형</b><span style={favoriteView.sourceDetail}>{admissions.slice(0,3).map(row=>row.department||row.track).filter(Boolean).join(" · ")||"연결 자료 없음"}</span></div>
              <div style={favoriteView.sourceBox}><small style={favoriteView.sourceLabel}>광덕고 대입 사례</small><div style={favoriteView.sourceHeadline}><span>지원 <b>{cases.length}건</b></span><span>합격 <b>{accepted.length}건</b></span></div>{cases.length?<div style={favoriteView.sourceMetrics}><span style={favoriteView.sourceMetric}><small>합격자 50%컷</small><b>{cut50==null?"-":Math.round(cut50*100)/100}</b></span><span style={favoriteView.sourceMetric}><small>합격 사례 비율</small><b>{Math.round(accepted.length/cases.length*1000)/10}%</b></span></div>:<span style={favoriteView.sourceDetail}>연결 사례 없음</span>}</div>
            </div>
            <div style={favoriteView.items}>{group.items.map(item=><div key={item.id} style={favoriteView.item}><Star size={13} fill="#ffd84d" color="#b58a00"/><span style={favoriteView.itemText}><span style={favoriteView.kindBadge}>{item.favoriteKind==="개별사례"?"개별":favoriteCategory(item)}</span><b>{item.department||"대학 전체"}</b>{item.admissionType&&<small>{item.admissionType}</small>}</span><span style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end"}}>{onOpenCases&&<button type="button" style={favoriteView.itemLink} onClick={()=>onOpenCases(group.university,item.department||"",item.admissionType||"")}>광덕고 사례 <ExternalLink size={10}/></button>}<button type="button" style={favoriteView.remove} onClick={()=>onToggleFavorite?.(item)}>삭제</button></span></div>)}</div>
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
    <StudentIdentityBanner sid={sid} name={identity.name} grade={identity.grade} classNumber={identity.classNumber} number={identity.number} entryYear={identity.entryYear} gradeSystem={identity.gradeSystem} viewType="favorites" />
    <div style={consultationView.card}>
      <SectionHeading title="상담 기록" description="담임·관리자가 작성한 진학 상담 내용을 날짜별로 저장합니다. 관심 대학 정보와 함께 유지됩니다." />
      {canEdit && <div style={consultationView.editor}>
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
      {!canEdit && <div style={consultationView.readOnlyNotice}>상담 기록은 담임 선생님 또는 관리자가 작성합니다.</div>}
      <div style={consultationView.notes}>
        {notes.length ? notes.map(note=><article key={note.id} style={consultationView.note}>
          <div style={consultationView.noteHeader}><div style={consultationView.noteMeta}><b>{note.date || "날짜 미입력"}</b><span>{note.author || "작성자 미입력"}</span></div>{canEdit&&<button type="button" onClick={()=>removeNote(note.id)} style={consultationView.deleteButton}>삭제</button>}</div>
          {note.text && <p style={consultationView.noteText}>{note.text}</p>}
          <CounselingAttachmentList attachments={note.attachments || []} />
        </article>) : <div style={consultationView.empty}>저장된 상담 기록이 없습니다.</div>}
      </div>
    </div>
    <StudentFavoritesView sid={sid} gdb={gdb} studentInfo={studentInfo} favorites={favorites} onToggleFavorite={onToggleFavorite} onOpenAdmission={onOpenAdmission} onOpenCases={onOpenCases} hideBanner />
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
      {subtab === "bulk" && <BulkUpload gdb={gdb} persistGrades={persistGrades} showToast={showToast} />}
      {subtab === "semester" && <SemesterUpload gdb={gdb} persistGrades={persistGrades} showToast={showToast} />}
      {subtab === "mock" && <MockUpload gdb={gdb} persistGrades={persistGrades} showToast={showToast} />}
      {subtab === "admission" && <AdmissionUpload gdb={gdb} persistGrades={persistGrades} showToast={showToast} />}
      {subtab === "admissionPdf" && <AdmissionPdfManager gdb={gdb} persistGrades={persistGrades} showToast={showToast} />}
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
  return String(v ?? "").replace(/\s+/g, "").trim();
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
  const explicitDepartmentIndex = findIndex(["계열학과", "모집단위", "학과", "학부"]);
  const genericSeriesIndex = findIndex(["계열"]);
  const admissionFieldIndex = findIndex(["계열구분", "지원계열", "모집계열", "대학계열", "계열유형", "인문자연구분", "인문자연간호구분"])
    >= 0 ? findIndex(["계열구분", "지원계열", "모집계열", "대학계열", "계열유형", "인문자연구분", "인문자연간호구분"])
    : (explicitDepartmentIndex >= 0 ? genericSeriesIndex : -1);
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

  const explicitDepartmentIndex = firstIndex(["계열학과", "모집단위", "학과", "학부"]);
  const genericSeriesIndex = idx["계열"] != null ? idx["계열"] : null;
  const admissionFieldIndex = firstIndex(["계열구분", "지원계열", "모집계열", "대학계열", "계열유형", "인문자연구분", "인문자연간호구분"])
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
function BulkUpload({ gdb, persistGrades, showToast }) {
  const [entryYear, setEntryYear] = useState(entryYearForGrade(gdb.cohortSettings, 2));
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
        newAdmissionRows = workbookAdmissionRows;
        const curriculumCount = workbookAdmissionRows.filter(row => (
          CURRICULUM_METHOD_FIELDS.some(([field]) => normalizeCurriculumMethod(row[field]) !== "미입력")
        )).length;
        found.push(`대입 전형표 — ${workbookAdmissionRows.length}건 (반영비율 ${workbookAdmissionRows.filter(row => admissionReflectionText(row)).length}건 · 내신반영 ${curriculumCount}건)`);
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

function AdmissionUpload({ gdb, persistGrades, showToast }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState(null);
  const [diagnosis, setDiagnosis] = useState(null);

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
      const admissionRows = parseAdmissionWorkbook(wb, XLSX);
      if (!admissionRows) {
        showToast('열 이름을 확인해주세요: "대학교/대학명", "수능최저 반영 과목수/반영 교과수", "수능최저 합/최저합 기준"', "error");
        return;
      }

      setProgress({ step: "데이터 결합", detail: "대입 전형과 교과 반영 방식을 연결하고 있습니다.", percent: 88 });
      await yieldForUploadPaint();

      const reflectionCount = admissionRows.filter(row => admissionReflectionText(row)).length;
      const curriculumCount = admissionRows.filter(row => (
        CURRICULUM_METHOD_FIELDS.some(([field]) => normalizeCurriculumMethod(row[field]) !== "미입력")
      )).length;
      const elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
      const parseMeta = admissionRows._parseMeta || {};
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
    const ok = await persistGrades({ admissionRows: preview });
    const elapsedMs = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
    if (ok) {
      showToast(`저장했습니다. (대입 전형표 ${preview.length}건 · ${(elapsedMs / 1000).toFixed(1)}초)`, "success");
      setPreview(null);
      setProgress(null);
      setDiagnosis(value => value ? { ...value, saveElapsedMs: elapsedMs } : value);
    }
    setApplying(false);
  };

  const removeAll = async () => {
    const ok = await persistGrades({ admissionRows: [] });
    if (ok) showToast("대입 전형표를 삭제했습니다.", "success");
  };

  return (
    <div>
      <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", border: `1.5px dashed #d7dfec`, background: "linear-gradient(135deg,#fbfdff,#faf9ff)" }}>
        <FileSpreadsheet size={22} color="#58739a" />
        <div style={{ fontWeight: 800, marginTop: 8 }}>대입 전형표 업로드</div>
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
          <span>현재 등록: {gdb.admissionRows.length}건</span>
          {gdb.admissionRows.length > 0 && <button style={btn.link} onClick={removeAll}>전체 삭제</button>}
        </div>
        <div style={{ fontSize: 10.5, color: "#8a8578", lineHeight: 1.5 }}>
          파일 선택 후 오래 걸리면 <b>분석 시간·전체 읽은 시트</b>를 확인하세요. 반영하기 후 오래 걸리면 저장 예상량과 학교 네트워크의 Firestore 연결 상태를 확인할 수 있습니다.
        </div>
      </div>
    </div>
  );
}

function AdmissionPdfManager({ gdb, persistGrades, showToast }) {
  const fileRef = useRef(null);
  const zipRef = useRef(null);
  const [documentType, setDocumentType] = useState("guide");
  const [listFilter, setListFilter] = useState("all");
  const [university, setUniversity] = useState("");
  const [region, setRegion] = useState("미지정");
  const [label, setLabel] = useState("");
  const [year, setYear] = useState(String(CURRENT_ACADEMIC_YEAR + 2));
  const [busy, setBusy] = useState(false);
  const [batchPreview, setBatchPreview] = useState(null);
  const [batchProgress, setBatchProgress] = useState("");
  const [batchStats, setBatchStats] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editUniversity, setEditUniversity] = useState("");
  const [editRegion, setEditRegion] = useState("미지정");
  const [editType, setEditType] = useState("guide");
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

  const allDocs = (gdb.admissionDocs || []).slice().sort((a, b) => (
    String(a.region || "미지정").localeCompare(String(b.region || "미지정"), "ko")
    || String(a.university || "").localeCompare(String(b.university || ""), "ko")
    || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
  ));
  const docs = listFilter === "all" ? allDocs : allDocs.filter(item => admissionDocumentType(item) === listFilter);
  const universityOptions = Array.from(new Set([
    ...(gdb.admissionRows || []).map(row => String(row.university || "").trim()),
    ...(gdb.admissionDocs || []).map(docItem => String(docItem.university || "").trim()),
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko"));
  const regionByUniversity = new Map();
  [...(gdb.admissionRows || []), ...(gdb.admissionDocs || [])].forEach(item => {
    if (!item?.university || !item?.region) return;
    regionByUniversity.set(universityDocumentKey(item.university, item.region), item.region);
    if (!regionByUniversity.has(universityKey(item.university))) regionByUniversity.set(universityKey(item.university), item.region);
  });
  const admissionUniversityEntries = Array.from(new Map(
    (gdb.admissionRows || [])
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
  const makeDocumentItem = (uploaded, values) => ({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    university: values.university.trim(),
    region: values.region || "미지정",
    documentType: values.documentType || uploaded.documentType || "guide",
    label: String(values.label || "").trim() || defaultLabel(values.documentType || uploaded.documentType || "guide", String(values.year || "").trim(), values.university),
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

  const handleUpload = async (files, options = {}) => {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return { saved: 0, failed: 0 };
    setBusy(true);
    setBatchErrors([]);
    setBatchProgress("파일 저장 경로를 확인하고 있습니다.");
    setBatchStats({ total: selectedFiles.length, queued: selectedFiles.length, saved: 0, failed: 0, skipped: 0, elapsed: 0, mode: "저장소 확인 중" });
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

      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index];
        const resolvedUniversity = university.trim() || inferUniversityFromFileName(file.name, universityOptions);
        const resolvedYear = inferAdmissionYearFromFileName(file.name, year);
        const resolvedRegion = region !== "미지정" ? region : inferRegionFromFileName(file.name, regionByUniversity.get(universityKey(resolvedUniversity)) || "");
        setBatchProgress(`${file.name} 저장 중 (${index + 1}/${selectedFiles.length})`);
        try {
          const uploaded = await uploadAdmissionDocument(file, resolvedUniversity, documentType, {
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
              setBatchProgress(`${file.name} · ${detail} (${index + 1}/${selectedFiles.length})`);
            },
          });
          const doc = makeDocumentItem(uploaded, {
            university: resolvedUniversity,
            region: resolvedRegion,
            label: selectedFiles.length === 1 ? label : "",
            year: resolvedYear,
            documentType,
          });
          const nextDocs = [...(gdb.admissionDocs || []), ...uploadedItems.map(item => item.doc), doc];
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
        showToast(`${uploadedItems.length}건 저장 · ${errors.length}건 실패. 아래 오류 내용을 확인해주세요.`, "error");
      } else {
        showToast(`${uploadedItems.length}건을 등록했습니다.`, "success");
        setLabel("");
        if (options.resetForm) {
          setUniversity("");
          setRegion("미지정");
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
    return { saved: uploadedItems.length, failed: errors.length };
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
        const inferredUniversity = inferUniversityFromFileName(fileName, universityOptions);
        const inferredYear = inferAdmissionYearFromFileName(fileName, year);
        const knownRegion = regionByUniversity.get(universityKey(inferredUniversity)) || "";
        return {
          id: `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
          file,
          fileName,
          university: inferredUniversity,
          region: inferRegionFromFileName(fileName, knownRegion),
          label: defaultLabel("guide", inferredYear, inferredUniversity),
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
    const existingDocs = [...(gdb.admissionDocs || [])];
    const itemKey = item => `${universityKey(item.university)}|${item.fileName}|${Number(item.size ?? item.file?.size ?? 0)}|${item.year || ""}`;
    const existingKeys = new Set(existingDocs.map(itemKey));
    const skipped = items.filter(item => existingKeys.has(itemKey(item)));
    const queue = items.filter(item => !existingKeys.has(itemKey(item)));
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
          const checkpointDocs = [...persistedDocs, docItem];
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
    setEditingId(docItem.id || docItem.url);
    setEditUniversity(docItem.university || "");
    setEditRegion(docItem.region || "미지정");
    setEditType(admissionDocumentType(docItem));
  };

  const saveEdit = async docItem => {
    if (!editUniversity.trim()) { showToast("대학교명을 입력해주세요.", "error"); return; }
    setBusy(true);
    try {
      const key = docItem.id || docItem.url;
      const updated = (gdb.admissionDocs || []).map(item => (item.id || item.url) === key
        ? { ...item, university: editUniversity.trim(), region: editRegion || "미지정", documentType: editType, updatedAt: new Date().toISOString() }
        : item);
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
      const targetKey = docItem.id || docItem.url;
      const updated = (gdb.admissionDocs || []).filter(item => (item.id || item.url) !== targetKey);
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
        <SectionHeading title="대학별 모집요강·교과 반영표 관리" description="수능 최저 화면에는 모집요강 PDF를, 내신 반영 방식 화면에는 대학별 교과 반영표 PDF·이미지를 연결합니다." />
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
          <button style={{ ...btn.tab, ...(documentType === "guide" ? btn.tabActive : {}) }} onClick={() => { setDocumentType("guide"); setLabel(""); setPendingFiles([]); }}>모집요강 PDF</button>
          <button style={{ ...btn.tab, ...(documentType === "reflection" ? btn.tabActive : {}) }} onClick={() => { setDocumentType("reflection"); setLabel(""); setPendingFiles([]); }}>교과 반영표 PDF·이미지</button>
          <button style={btn.secondary} onClick={runDiagnosis} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} 저장소 연결 진단</button>
        </div>
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
        <div style={pdfAdmin.formGrid}>
          <label style={pdfAdmin.label}><span>대학교</span><input list="admission-university-options" value={university} onChange={event => setUniversity(event.target.value)} placeholder="예: 광덕대학교" style={pdfAdmin.input} /><datalist id="admission-university-options">{universityOptions.map(name => <option key={name} value={name} />)}</datalist></label>
          <label style={pdfAdmin.label}><span>지역</span><select value={region} onChange={event => setRegion(event.target.value)} style={pdfAdmin.input}>{ADMISSION_REGIONS.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
          <label style={pdfAdmin.label}><span>학년도</span><input value={year} onChange={event => setYear(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))} placeholder="2028" style={pdfAdmin.input} /></label>
          <label style={pdfAdmin.label}><span>표시 이름</span><input value={label} onChange={event => setLabel(event.target.value)} placeholder={`비워두면 ‘${defaultLabel(documentType, year, university || "OO대")}’`} style={pdfAdmin.input} /></label>
        </div>
        <input ref={fileRef} tabIndex={-1} aria-hidden="true" type="file" multiple accept={accept} style={pdfAdmin.hiddenFileInput} disabled={busy} onChange={event => {
          const selected = Array.from(event.target.files || []); event.target.value = ""; if (!selected.length) return;
          if (documentType === "reflection") {
            setPendingFiles(selected);
            const first = selected[0];
            const inferredUniversity = inferUniversityFromFileName(first.name, universityOptions) || university.trim();
            const inferredYear = inferAdmissionYearFromFileName(first.name, year);
            if (inferredUniversity) setUniversity(inferredUniversity);
            if (inferredYear) setYear(inferredYear);
            if (region === "미지정" && inferredUniversity) setRegion(inferRegionFromFileName(first.name, regionByUniversity.get(universityKey(inferredUniversity)) || "") || "미지정");
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
          <div style={table.scroll}><table style={{ ...table.base, minWidth: 760 }}><thead><tr><th style={table.th}>파일명</th><th style={table.th}>대학명</th><th style={table.th}>지역</th><th style={table.th}>표시 이름</th><th style={table.th}></th></tr></thead><tbody>
            {batchPreview.map(item => <tr key={item.id}><td style={{ ...table.tdLabel, maxWidth: 220, whiteSpace: "normal", wordBreak: "break-all" }}>{item.fileName}{item.error && <div style={{ color: "#9a4242", fontSize: 10.5, marginTop: 4 }}>{item.error}</div>}</td><td style={table.td}><input value={item.university} onChange={event => { const nextUniversity = event.target.value; updateBatchItem(item.id, { university: nextUniversity, label: admissionDocumentDisplayLabel("guide", item.year, nextUniversity) }); }} style={{ ...pdfAdmin.input, minWidth: 150 }} /></td><td style={table.td}><select value={item.region || "미지정"} onChange={event => updateBatchItem(item.id, { region: event.target.value })} style={{ ...pdfAdmin.input, minWidth: 100 }}>{ADMISSION_REGIONS.map(name => <option key={name} value={name}>{name}</option>)}</select></td><td style={table.td}><input value={item.label || ""} onChange={event => updateBatchItem(item.id, { label: event.target.value })} style={{ ...pdfAdmin.input, minWidth: 140 }} /></td><td style={table.td}><button style={pdfAdmin.deleteButton} onClick={() => removeBatchItem(item.id)} disabled={busy}><Trash2 size={12} /> 제외</button></td></tr>)}
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
              setUniversity(item.name);
              setRegion(item.region || "미지정");
              setLabel("");
              setPendingFiles([]);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}><span style={{display:"grid",gap:2,minWidth:0}}><b>{item.name}</b><small style={{color:"#7c7568"}}>{item.region}</small></span><small style={{ color: "#9a6d16", whiteSpace: "nowrap" }}>{typeLabel(requiredDocumentType)} 등록</small></button>)}
          </div>
          {!visibleMissingDocumentUniversities.length && <div style={chartEmpty}>검색 조건에 해당하는 미업로드 대학이 없습니다.</div>}
        </> : <div style={pdfAdmin.completeNotice}><CheckCircle2 size={16} />대입 전형표에 있는 모든 대학의 {typeLabel(requiredDocumentType)}가 등록되어 있습니다.</div>}
      </div>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <SectionHeading title={`등록된 대학 자료 (${docs.length}/${allDocs.length}건)`} description="한 자료를 한 행으로 표시합니다. 표시 이름과 원본 파일명을 분리해 확인할 수 있습니다." />
          <div style={{ display: "flex", gap: 5 }}>{[["all","전체"],["guide","모집요강"],["reflection","반영표"]].map(([key,name]) => <button key={key} style={{ ...btn.chip, ...(listFilter === key ? btn.chipActive : {}) }} onClick={() => setListFilter(key)}>{name}</button>)}</div>
        </div>
        {!docs.length ? <div style={chartEmpty}>해당 유형의 자료가 없습니다.</div> : <div style={admissionDocs.tableWrap}>
          <table className="admission-docs-table" style={admissionDocs.table}>
            <colgroup><col style={{ width: "17%" }} /><col style={{ width: "8%" }} /><col style={{ width: "11%" }} /><col style={{ width: "25%" }} /><col style={{ width: "21%" }} /><col style={{ width: "18%" }} /></colgroup>
            <thead><tr><th>대학교</th><th>지역</th><th>자료 유형</th><th>표시 이름</th><th>원본 파일·저장 방식</th><th>관리</th></tr></thead>
            <tbody>{docs.map(docItem => {
              const key = docItem.id || docItem.url || docItem.dataKey;
              const editing = editingId === key;
              return <tr key={key}>
                <td>{editing ? <input value={editUniversity} onChange={event => setEditUniversity(event.target.value)} style={pdfAdmin.input} /> : <b style={admissionDocs.university}>{docItem.university}</b>}</td>
                <td>{editing ? <select value={editRegion} onChange={event => setEditRegion(event.target.value)} style={pdfAdmin.input}>{ADMISSION_REGIONS.map(name => <option key={name} value={name}>{name}</option>)}</select> : <span style={regionBadge}>{(docItem.region || "미지정") !== "미지정" && <MapPin size={10} />}{docItem.region || "미지정"}</span>}</td>
                <td>{editing ? <select value={editType} onChange={event => setEditType(event.target.value)} style={pdfAdmin.input}><option value="guide">모집요강</option><option value="reflection">교과 반영표</option></select> : <span style={admissionDocs.typeBadge}>{typeLabel(admissionDocumentType(docItem))}</span>}</td>
                <td><div style={admissionDocs.primaryText}>{docItem.label || admissionDocumentDisplayLabel(admissionDocumentType(docItem), docItem.year, docItem.university)}</div></td>
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
  titleTag: { display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "4px 9px", background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.22)", fontSize: 10.5, fontWeight: 900 },
  subtitle: { marginTop: 7, fontSize: 12, lineHeight: 1.5, color: "rgba(255,255,255,.82)", fontWeight: 650 },
  admissionBox: { background: "linear-gradient(135deg,#315f9c 0%,#5e78b7 50%,#7e68ad 100%)", boxShadow: "0 10px 27px rgba(54,70,126,.22)" },
  admissionEyebrow: { color: "#dbe7ff", opacity: 1 },
  admissionTitleTag: { background: "#ffe071", borderColor: "#ffe071", color: "#28354f" },
  admissionGradeBadge: { background: "#fff", color: "#394c78", borderColor: "#fff" },
  badges: { display: "flex", flexWrap: "wrap", gap: 7, marginTop: 13 },
  badge: { display: "inline-flex", alignItems: "center", background: "rgba(255,255,255,0.13)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 999, padding: "5px 10px", fontSize: 11.5, fontWeight: 700 },
  gradeBadge: { background: "#fff", color: "#315b84", borderColor: "#fff" },
};
const gradeScaleSelector = {
  box: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    border: "1px solid #e3dfd3",
    background: "#faf9f5",
    borderRadius: 12,
    padding: "11px 12px",
    marginBottom: 12,
  },
  title: { fontSize: 12.5, fontWeight: 900, color: "#3d3932" },
  description: { fontSize: 10.8, color: "#8a8578", marginTop: 3 },
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
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 10, marginTop: 14 },
  card: { border: "1px solid #d6e1ee", background: "#f4f8fc", borderRadius: 12, padding: "13px 14px", textAlign: "center" },
  label: { fontSize: 13, fontWeight: 900, color: "#3d6288" },
  value: { fontSize: 30, fontWeight: 900, lineHeight: 1.15, color: "#253d59", margin: "4px 0 2px" },
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
  grid:{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12},
  card:{border:"1px solid #dfe3eb",borderRadius:14,padding:14,background:"linear-gradient(135deg,#fff,#f8faff)",display:"grid",gap:12},
  header:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10},
  link:{display:"inline-flex",alignItems:"center",gap:5,border:"1px solid #cfd9e7",background:"#fff",color:"#315a86",borderRadius:8,padding:"7px 9px",fontSize:11,fontWeight:850,cursor:"pointer"},
  sourceGrid:{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8},
  sourceBox:{display:"grid",gap:4,padding:"10px 11px",borderRadius:10,background:"#f7f9fc",border:"1px solid #e1e6ee",minWidth:0},
  sourceLabel:{fontSize:10.3,fontWeight:900,color:"#687588"},
  sourceValue:{fontSize:13,color:"#263a55",lineHeight:1.25},
  sourceHeadline:{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",fontSize:10.5,color:"#657286"},
  sourceMetrics:{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:6},
  sourceMetric:{display:"grid",gap:2,padding:"7px 8px",borderRadius:8,background:"#fff",border:"1px solid #e4e8ef",fontSize:11,color:"#2f425d"},
  sourceDetail:{fontSize:10.3,color:"#788392",lineHeight:1.35},
  items:{display:"grid",gap:6},
  item:{display:"flex",alignItems:"center",gap:7,padding:"8px 9px",borderRadius:9,background:"#fff",border:"1px solid #ece8df"},
  filters:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",padding:"7px",borderRadius:11,background:"#f4f7fb",border:"1px solid #e0e6ef"},
  filterButton:{display:"inline-flex",alignItems:"center",gap:5,border:"1px solid #d6deea",borderRadius:999,padding:"6px 9px",background:"#fff",color:"#586679",fontSize:10.8,fontWeight:900,cursor:"pointer"},
  filterActive:{background:"#315f95",borderColor:"#315f95",color:"#fff"},
  filteredEmpty:{padding:"16px",borderRadius:10,background:"#fafbfc",border:"1px dashed #dce2eb",color:"#7d8692",textAlign:"center",fontSize:11.5},
  universityTitle:{fontSize:15,color:"#222d3d",lineHeight:1.25},
  universityCount:{fontSize:10.2,color:"#7a8492"},
  kindBadge:{display:"inline-flex",justifySelf:"start",borderRadius:999,padding:"2px 6px",background:"#eef3fa",color:"#315a86",fontSize:8.8,fontWeight:900},
  itemText:{display:"grid",gap:3,flex:1,minWidth:0,fontSize:11.5},
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
