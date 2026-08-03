import React, { useState, useMemo, useRef, useEffect } from "react";
import { Search, Upload, FileSpreadsheet, Loader2, Save, FileText, ExternalLink, Trash2, BookOpen, Archive, MapPin } from "lucide-react";
import { readStorage, uploadAdmissionPdf, deleteAdmissionPdf } from "./storage.js";
import { extractPdfFilesFromZip } from "./zipReader.js";
import {
  parseSemesterSheet,
  computeAllGroupAverages,
  computeMockExamSums,
  matchUniversities,
  gradeAnalysisComment,
  inferCategory,
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
  국어: { short: "국", label: "국어", color: "#315a9b", background: "#eef3ff", row: "#f8faff" },
  영어: { short: "영", label: "영어", color: "#9a4254", background: "#fff0f3", row: "#fff9fa" },
  수학: { short: "수", label: "수학", color: "#5d4898", background: "#f1edff", row: "#faf8ff" },
  사회: { short: "사", label: "사회", color: "#8a641d", background: "#fff5df", row: "#fffbf2" },
  // 1등급·성취도 A의 초록색과 겹치지 않도록 과학은 청록-파랑 계열로 구분합니다.
  과학: { short: "과", label: "과학", color: "#176b87", background: "#e6f5fa", row: "#f3fbfd" },
  "기술가정/정보": { short: "기가·정보", label: "기가/정보", color: "#2f7770", background: "#e8f7f5", row: "#f5fbfa" },
  "제2외국어/한문": { short: "제2외·한문", label: "제2외국어/한문", color: "#a35f26", background: "#fff1e4", row: "#fff9f3" },
  기타: { short: "기타", label: "기타", color: "#716b5f", background: "#f1f0ec", row: "#fbfaf7" },
};

const CATEGORY_TREND_OPTIONS = ["국어", "영어", "수학", "사회", "과학", "전과목"];
const MOCK_TREND_OPTIONS = [...MOCK_SUBJECTS, "전과목 평균"];
const ADMISSION_REGIONS = ["미지정", "서울", "경기", "인천", "강원", "대전·세종", "충북", "충남", "광주", "전북", "전남", "대구", "경북", "부산", "울산", "경남", "제주", "기타"];
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

function inferRegionFromFileName(fileName, knownRegion = "") {
  if (knownRegion && knownRegion !== "미지정") return knownRegion;
  const text = String(fileName || "");
  const found = REGION_KEYWORDS.find(([keyword]) => text.includes(keyword));
  return found ? found[1] : "미지정";
}

export async function loadGradesDB() {
  const [semesterData, mockData, admissionRows, admissionDocs, studentAccounts] = await Promise.all([
    readStorage("kd_grades_semesters", {}),
    readStorage("kd_grades_mocks", {}),
    readStorage("kd_grades_admission", []),
    readStorage("kd_grades_admission_docs", []),
    readStorage("kd_grades_students_meta", {}),
  ]);
  return { semesterData, mockData, admissionRows, admissionDocs, studentAccounts };
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

  useEffect(() => {
    if (loggedInTeacher && !teacherHasGradeAccess && tab !== "class") setTab("lookup");
  }, [loggedInTeacher, teacherHasGradeAccess, tab]);

  if (!gdb) return <div style={{ padding: 40, textAlign: "center" }}><Loader2 className="spin" size={20} /></div>;

  return (
    <div>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #e6e1d3", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>성적</div>
          <div style={{ fontSize: 11.5, color: "#8a8578" }}>
            {loggedInStudent && `${loggedInStudent.name} 학생`}
            {loggedInTeacher && `${loggedInTeacher.name} 선생님`}
            {loggedInAdmin && "관리자"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={btn.secondary} onClick={onLogout}>로그아웃</button>
        </div>
      </div>

      <div style={{ padding: 20, maxWidth: 1040, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
          {loggedInStudent && <TabBtn active={tab === "grades"} onClick={() => setTab("grades")} label="성적 조회" />}
          {loggedInStudent && <TabBtn active={tab === "admission"} onClick={() => setTab("admission")} label="대학별 입시전형 확인" />}
          {loggedInTeacher && teacherHasGradeAccess && <TabBtn active={tab === "lookup"} onClick={() => setTab("lookup")} label={`${currentGrade}학년 학생 성적 조회`} />}
          {loggedInTeacher && loggedInTeacher.homeroomClass && teacherHasGradeAccess && <TabBtn active={tab === "class"} onClick={() => setTab("class")} label="담임반 학생 계정" />}
          {loggedInAdmin && <TabBtn active={tab === "lookup"} onClick={() => setTab("lookup")} label="학생 성적 조회" />}
          {loggedInAdmin && <TabBtn active={tab === "lookupAdmission"} onClick={() => setTab("lookupAdmission")} label="학생별 입시전형 확인" />}
        </div>

        {tab === "grades" && loggedInStudent && <StudentGradeReport key={loggedInStudent.id} sid={loggedInStudent.id} gdb={gdb} mode="grades" studentInfo={loggedInStudent} />}
        {tab === "admission" && loggedInStudent && <StudentAdmissionView key={loggedInStudent.id} sid={loggedInStudent.id} gdb={gdb} studentInfo={loggedInStudent} />}

        {loggedInTeacher && !teacherHasGradeAccess && (
          <EmptyBox text={`${currentGrade}학년 학생 성적 조회 권한이 없습니다. 관리자에게 역할 또는 성적 조회 권한을 요청해주세요.`} />
        )}

        {tab === "lookup" && (loggedInAdmin || (loggedInTeacher && teacherHasGradeAccess)) && (
          <StudentLookup
            roster={roster}
            gdb={gdb}
            isAdmin
            initialView="grades"
            selectedSid={loggedInAdmin ? lookupSid : undefined}
            onSelectedSidChange={loggedInAdmin ? setLookupSid : undefined}
            sharedQuery={loggedInAdmin ? lookupQuery : undefined}
            onSharedQueryChange={loggedInAdmin ? setLookupQuery : undefined}
            showViewTabs={false}
          />
        )}
        {tab === "lookupAdmission" && loggedInAdmin && (
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
          />
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
function StudentGradeReport({ sid, gdb, mode = "both", studentInfo = null }) {
  const { semesterData, mockData, admissionRows, studentAccounts } = gdb;

  const semesterRecords = SEMESTER_KEYS.map(key => semesterData[key]?.students?.[sid] || null);
  const latestSemesterRecord = semesterRecords.slice().reverse().find(Boolean) || null;
  const metaRecord = Array.isArray(studentAccounts)
    ? studentAccounts.find(student => String(student.id) === String(sid))
    : studentAccounts?.[sid];

  const inferredGrade = asNumber(studentInfo?.grade)
    ?? asNumber(String(sid || "").charAt(0))
    ?? asNumber(latestSemesterRecord?.grade ?? metaRecord?.grade)
    ?? 1;
  const inferredClass = studentInfo?.class ?? latestSemesterRecord?.class ?? metaRecord?.class ?? asNumber(String(sid || "").slice(1, 3));
  const inferredNumber = studentInfo?.number ?? latestSemesterRecord?.number ?? metaRecord?.number ?? asNumber(String(sid || "").slice(3, 5));
  const studentName = studentInfo?.name ?? latestSemesterRecord?.name ?? metaRecord?.name ?? "";
  const entryYear = CURRENT_ACADEMIC_YEAR - inferredGrade + 1;
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

  const availableMockKeys = MOCK_MONTH_KEYS.filter(key => mockData[key]?.students?.[sid]);
  const [selMockKey, setSelMockKey] = useState(null);
  const activeMockKey = selMockKey && availableMockKeys.includes(selMockKey)
    ? selMockKey
    : availableMockKeys[availableMockKeys.length - 1];
  const mockGrades = activeMockKey ? mockData[activeMockKey].students[sid] : {};
  const sums = useMemo(() => computeMockExamSums(mockGrades || {}), [mockGrades]);

  const latestMockKey = useMemo(() => {
    const order = MOCK_MONTH_KEYS.slice().reverse();
    return order.find(key => mockData[key]?.students?.[sid]) || null;
  }, [mockData, sid]);
  const latestMockGrades = latestMockKey ? mockData[latestMockKey].students[sid] : {};
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
      const result = mockData[key]?.students?.[sid] || {};
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
                {Object.entries(CATEGORY_META).filter(([key]) => key !== "기타").map(([key, meta]) => (
                  <span key={key} style={categoryGuide.item}>
                    <span style={{ ...categoryGuide.dot, background: meta.color }} />{meta.label}
                  </span>
                ))}
              </div>
              <div style={table.scroll}>
                <table style={{ ...table.base, ...gradeTable.base, minWidth: gradeSystem === 5 ? 790 : 700, tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: 145 }} />
                    <col style={{ width: 98 }} />
                    <col style={{ width: 46 }} />
                    <col style={{ width: 58 }} />
                    <col style={{ width: 62 }} />
                    <col style={{ width: 86 }} />
                    {gradeSystem === 5 && <col style={{ width: 100 }} />}
                    <col style={{ width: 86 }} />
                    <col style={{ width: 68 }} />
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
                            <span style={{ fontWeight: 800 }}>{subject.subject}</span>
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
  return String(value || "").replace(/\s+/g, "").replace(/[()\[\]·.,]/g, "").toLowerCase();
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
  const values = [department, track].map(value => String(value || "").trim()).filter(Boolean);
  if (!values.length) values.push("전체 모집단위");

  return (
    <div style={admissionTable.detailStack}>
      {values.map((value, valueIndex) => (
        <div key={`${value}-${valueIndex}`} style={admissionTable.detailGroup}>
          {splitAdmissionDetailLabel(value).map((line, lineIndex) => (
            <span key={`${line}-${lineIndex}`} style={admissionTable.detailLine}>{line}</span>
          ))}
        </div>
      ))}
    </div>
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

function StudentAdmissionView({ sid, gdb, studentInfo = null }) {
  const { semesterData, mockData, admissionRows = [], admissionDocs = [], studentAccounts } = gdb;
  const semesterRecords = SEMESTER_KEYS.map(key => semesterData[key]?.students?.[sid] || null);
  const latestSemesterRecord = semesterRecords.slice().reverse().find(Boolean) || null;
  const metaRecord = Array.isArray(studentAccounts)
    ? studentAccounts.find(student => String(student.id) === String(sid))
    : studentAccounts?.[sid];
  const inferredGrade = asNumber(studentInfo?.grade)
    ?? asNumber(String(sid || "").charAt(0))
    ?? asNumber(latestSemesterRecord?.grade ?? metaRecord?.grade)
    ?? 1;
  const inferredClass = studentInfo?.class ?? latestSemesterRecord?.class ?? metaRecord?.class ?? asNumber(String(sid || "").slice(1, 3));
  const inferredNumber = studentInfo?.number ?? latestSemesterRecord?.number ?? metaRecord?.number ?? asNumber(String(sid || "").slice(3, 5));
  const studentName = studentInfo?.name ?? latestSemesterRecord?.name ?? metaRecord?.name ?? "";
  const entryYear = CURRENT_ACADEMIC_YEAR - inferredGrade + 1;
  const gradeSystem = entryYear >= 2025 ? 5 : 9;

  const latestMockKey = MOCK_MONTH_KEYS.slice().reverse().find(key => mockData[key]?.students?.[sid]) || null;
  const latestMockGrades = latestMockKey ? mockData[latestMockKey].students[sid] : {};
  const latestSums = useMemo(() => computeMockExamSums(latestMockGrades || {}), [latestMockGrades]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [requirementFilter, setRequirementFilter] = useState("all");
  const [sortMode, setSortMode] = useState("default");

  const docsByUniversity = useMemo(() => {
    const map = new Map();
    (admissionDocs || []).forEach(docItem => {
      const key = universityKey(docItem.university);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(docItem);
    });
    map.forEach(items => items.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))));
    return map;
  }, [admissionDocs]);

  const evaluatedRows = useMemo(() => (admissionRows || []).map((row, index) => {
    const evaluation = evaluateAdmissionRequirement(row, latestSums, latestMockGrades);
    return {
      ...row,
      _index: index,
      evaluation,
      docs: docsByUniversity.get(universityKey(row.university)) || [],
      region: String(row.region || (docsByUniversity.get(universityKey(row.university)) || [])[0]?.region || "미지정"),
    };
  }), [admissionRows, latestSums, latestMockGrades, docsByUniversity]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return evaluatedRows.filter(row => {
      const haystack = [row.university, row.department, row.track, row.reflection, row.note, row.requiredSubjects].join(" ").toLowerCase();
      if (q && !haystack.includes(q)) return false;
      if (regionFilter !== "all" && String(row.region || "미지정") !== regionFilter) return false;
      if (requirementFilter === "none" && row.evaluation.status !== "no-minimum") return false;
      if (!["all", "none"].includes(requirementFilter) && Number(row.evaluation.count) !== Number(requirementFilter)) return false;
      if (statusFilter === "satisfied") return row.evaluation.status === "satisfied" || row.evaluation.status === "no-minimum";
      if (statusFilter === "unsatisfied") return row.evaluation.status === "unsatisfied";
      if (statusFilter === "review") return ["manual", "unavailable"].includes(row.evaluation.status);
      return true;
    });
  }, [evaluatedRows, query, statusFilter, regionFilter, requirementFilter]);

  const displayRows = useMemo(() => {
    const rows = filteredRows.slice();
    if (sortMode === "name") {
      rows.sort((a, b) => (
        String(a.university || "").localeCompare(String(b.university || ""), "ko")
        || String(a.department || a.track || "").localeCompare(String(b.department || b.track || ""), "ko")
        || Number(a._index) - Number(b._index)
      ));
    } else if (sortMode === "region") {
      const regionRank = value => {
        const region = String(value || "미지정");
        if (region === "미지정") return 999;
        const index = ADMISSION_REGIONS.indexOf(region);
        return index >= 0 ? index : 900;
      };
      rows.sort((a, b) => (
        regionRank(a.region) - regionRank(b.region)
        || String(a.region || "미지정").localeCompare(String(b.region || "미지정"), "ko")
        || String(a.university || "").localeCompare(String(b.university || ""), "ko")
        || Number(a._index) - Number(b._index)
      ));
    }
    return rows;
  }, [filteredRows, sortMode]);

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

  const docsWithoutRows = useMemo(() => (admissionDocs || []).filter(docItem => (
    !evaluatedRows.some(row => universityKey(row.university) === universityKey(docItem.university))
  )), [admissionDocs, evaluatedRows]);

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
        viewType="admission"
      />

      <div style={{ ...card, background: "linear-gradient(135deg, #f3f8f1 0%, #ffffff 72%)", borderColor: "#cfdfca" }}>
        <SectionHeading
          title="대학별 입시전형 확인"
          description={latestMockKey
            ? `${mockCalendarLabel(latestMockKey, entryYear)} 모의고사의 1합·2합·3합·4합으로 대학별 수능 최저 충족 여부를 판정합니다.`
            : "모의고사 성적이 등록되면 대학별 수능 최저 충족 여부를 자동으로 판정합니다."}
        />
        <MockSumCards sums={latestSums} />
        <div style={admissionSummary.grid}>
          <div style={{ ...admissionSummary.card, ...admissionSummary.success }}><b>{statusCounts.satisfied}</b><span>충족·최저 없음</span></div>
          <div style={{ ...admissionSummary.card, ...admissionSummary.danger }}><b>{statusCounts.unsatisfied}</b><span>미충족</span></div>
          <div style={{ ...admissionSummary.card, ...admissionSummary.neutral }}><b>{statusCounts.review}</b><span>별도 확인</span></div>
        </div>
      </div>

      <div style={card}>
        <SectionHeading
          title="대학별 전형 판정"
          description="최저 유형별로 대학을 나누어 볼 수 있습니다. (사·과)처럼 괄호로 묶인 과목은 두 과목 중 더 높은 등급(숫자가 작은 등급) 1개만 반영합니다."
        />
        <div style={admissionToolbar.box}>
          <div style={admissionToolbar.mainRow}>
            <div style={{ ...searchBox.box, maxWidth: "none", flex: 1, minWidth: 210 }}>
              <Search size={16} color="#a39d8c" />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="대학·학과·전형 검색" style={searchBox.input} />
            </div>
            <select value={regionFilter} onChange={event => setRegionFilter(event.target.value)} style={{ ...selectStyle, minWidth: 105 }} aria-label="지역 선택">
              <option value="all">전체 지역</option>
              {regionOptions.map(regionName => <option key={regionName} value={regionName}>{regionName}</option>)}
            </select>
            <select value={sortMode} onChange={event => setSortMode(event.target.value)} style={{ ...selectStyle, minWidth: 112 }} aria-label="대학 정렬">
              <option value="default">기본 순서</option>
              <option value="name">대학명순</option>
              <option value="region">지역순</option>
            </select>
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
          <div style={admissionToolbar.requirementRow}>
            <span style={admissionToolbar.requirementLabel}>최저 유형</span>
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

        {!admissionRows.length ? (
          <EmptyBox text="관리자가 대학별 입시전형표를 아직 등록하지 않았습니다." />
        ) : !displayRows.length ? (
          <div style={chartEmpty}>검색 조건에 맞는 전형이 없습니다.</div>
        ) : (
          <div style={{ ...table.scroll, overflowX: "visible" }}>
            <table style={admissionTable.base}>
              <colgroup>
                <col style={{ width: "10.5%" }} />
                <col style={{ width: "6.5%" }} />
                <col style={{ width: "7.5%" }} />
                <col style={{ width: "8.5%" }} />
                <col style={{ width: "24%" }} />
                <col style={{ width: "7.5%" }} />
                <col style={{ width: "10.5%" }} />
                <col style={{ width: "6.5%" }} />
                <col style={{ width: "8%" }} />
                <col style={{ width: "10.5%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={admissionTable.th}>대학교</th>
                  <th style={admissionTable.th}>지역</th>
                  <th style={admissionTable.th}>모집단위<br />전형</th>
                  <th style={admissionTable.th}>교과 반영비율<br />반영방법</th>
                  <th style={admissionTable.th}>전형 특이사항</th>
                  <th style={admissionTable.th}>수능 최저</th>
                  <th style={admissionTable.th}>（반영과목）</th>
                  <th style={admissionTable.th}>내 등급</th>
                  <th style={admissionTable.th}>판정</th>
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
                      <td style={{ ...admissionTable.td, ...admissionTable.university }}>{row.university}</td>
                      <td style={{ ...admissionTable.td, ...admissionTable.regionCell }}>
                        <span style={regionBadge}>
                          {(row.region || "미지정") !== "미지정" && <MapPin size={9} />}
                          {row.region || "미지정"}
                        </span>
                      </td>
                      <td style={{ ...admissionTable.td, ...admissionTable.department }}>
                        <AdmissionDetailText department={row.department} track={row.track} />
                      </td>
                      <td style={{ ...admissionTable.td, ...admissionTable.reflectionCell }}>
                        {reflection ? <span style={reflectionBadge}>{reflection}</span> : <span style={admissionTable.empty}>-</span>}
                      </td>
                      <td style={{ ...admissionTable.td, ...admissionTable.text, ...admissionTable.noteCell }}>
                        {specialNote ? <AdmissionSpecialNote value={specialNote} /> : <span style={admissionTable.empty}>-</span>}
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
                      <td style={{ ...admissionTable.td, ...admissionTable.subjectCell }}>
                        {result.status === "no-minimum" || !subjectRuleText
                          ? <span style={admissionTable.empty}>-</span>
                          : <AdmissionSubjectRule value={row.requiredSubjects} />}
                      </td>
                      <td style={admissionTable.td}>
                        {!admissionStudentResultText(result)
                          ? <span style={admissionTable.empty}>-</span>
                          : <span style={{ ...studentSumBadge, ...(result.ruleType === "each" ? eachStudentBadge : {}) }}>{admissionStudentResultText(result)}</span>}
                      </td>
                      <td style={{ ...admissionTable.td, ...admissionTable.statusCell }}><span style={{ ...admissionStatus.base, ...statusMeta.style }}>{statusMeta.label}</span></td>
                      <td style={admissionTable.td}>
                        {row.docs.length ? (
                          <div style={{ display: "flex", justifyContent: "center", gap: 4, flexWrap: "wrap" }}>
                            {row.docs.map(docItem => <PdfLink key={docItem.id || docItem.url} docItem={docItem} compact />)}
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
          <SectionHeading title="추가 모집요강" description="입시전형표에는 아직 없지만 관리자가 등록한 대학별 모집요강입니다." />
          <div style={admissionDocs.grid}>
            {docsWithoutRows.map(docItem => (
              <div key={docItem.id || docItem.url} style={admissionDocs.card}>
                <div>
                  <div style={{ fontWeight: 900 }}>{docItem.university}</div>
                  <div style={{ marginTop: 4 }}><span style={regionBadge}><MapPin size={10} />{docItem.region || "미지정"}</span></div>
                  <div style={{ fontSize: 11, color: "#8a8578", marginTop: 4 }}>{docItem.label || docItem.fileName}</div>
                </div>
                <PdfLink docItem={docItem} />
              </div>
            ))}
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
  return (
    <a
      href={docItem.url}
      target="_blank"
      rel="noreferrer"
      style={{ ...pdfLinkStyle, ...(compact ? pdfLinkCompactStyle : {}) }}
      title={docItem.fileName || docItem.label || "모집요강 PDF"}
    >
      <FileText size={compact ? 11 : 13} /> {compact ? "보기" : (docItem.label || docItem.year || "PDF 보기")} <ExternalLink size={compact ? 9 : 11} />
    </a>
  );
}

function StudentIdentityBanner({ sid, name, grade, classNumber, number, entryYear, gradeSystem, viewType = "grades" }) {
  const location = [
    grade != null ? `${grade}학년` : null,
    classNumber != null ? `${Number(classNumber)}반` : null,
    number != null ? `${Number(number)}번` : null,
  ].filter(Boolean).join(" ");

  return (
    <div style={studentBanner.box}>
      <div style={studentBanner.eyebrow}>{viewType === "admission" ? "학생 입시전형 확인" : "학생 성적 조회"}</div>
      <div style={studentBanner.title}>
        <span style={studentBanner.identity}>{sid}{name ? ` ${name}` : ""}</span> {viewType === "admission" ? "학생의 대학별 입시전형" : "학생의 성적"}
      </div>
      <div style={studentBanner.badges}>
        {location && <span style={studentBanner.badge}>{location}</span>}
        <span style={studentBanner.badge}>{entryYear}학년도 입학생</span>
        <span style={{ ...studentBanner.badge, ...studentBanner.gradeBadge }}>{gradeSystem}등급제</span>
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
            {isBest && <span style={bestBadge}>최우수</span>}
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
  return (
    <span style={{ ...categoryBadgeBase, background: meta.background, color: meta.color, border: `1px solid ${meta.color}33` }}>
      {showLabel ? meta.label : meta.short}
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
    updateSid(id);
    setView(initialView);
  };

  return (
    <div>
      {!isAdmin && homeroomClass && <div style={{ fontSize: 12, color: "#8a8578", marginBottom: 10 }}>담당 반({homeroomClass}반) 학생만 조회할 수 있습니다.</div>}
      <div style={searchBox.box}>
        <Search size={16} color="#a39d8c" />
        <input
          value={query}
          onChange={event => {
            updateQuery(event.target.value);
            updateSid(null);
            setView(initialView);
          }}
          placeholder="학번 또는 이름으로 검색"
          style={searchBox.input}
        />
      </div>
      {candidates.length > 0 && !sid && (
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
              <button onClick={() => setView("grades")} style={{ ...lookupTabs.button, ...(view === "grades" ? lookupTabs.active : {}) }}>성적 조회</button>
              <button onClick={() => setView("admission")} style={{ ...lookupTabs.button, ...(view === "admission" ? lookupTabs.active : {}) }}>대학별 입시전형 확인</button>
            </div>
          )}
          {view === "grades"
            ? <StudentGradeReport key={`${sid}-grades`} sid={sid} gdb={gdb} mode="grades" studentInfo={roster?.[sid]} />
            : <StudentAdmissionView key={`${sid}-admission`} sid={sid} gdb={gdb} studentInfo={roster?.[sid]} />}
        </div>
      )}
    </div>
  );
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
export function AdminStudentAccounts({ accounts, persistAccounts, showToast, roster }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

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
      const existing = new Map((accounts.students || []).map(s => [s.id, s]));
      let added = 0, updated = 0;
      for (let i = hi + 1; i < rows.length; i++) {
        const row = rows[i]; if (!row) continue;
        const sidRaw = row[idx["학번"]]; if (!sidRaw) continue;
        const sid = String(sidRaw).trim();
        const name = row[idx["이름"]]; if (!name) continue;
        const pw = String(row[pwCol] ?? "").trim() || "kd2026";
        const rosterInfo = roster[sid];
        const rec = { id: sid, pw, name: String(name).trim(), class: rosterInfo ? rosterInfo.class : Number(sid.slice(1, 3)), number: rosterInfo ? rosterInfo.number : Number(sid.slice(3, 5)) };
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
    const updated = (accounts.students || []).map(s => s.id === sid ? { ...s, pw: "kd2026" } : s);
    const ok = await persistAccounts({ ...accounts, students: updated });
    if (ok) showToast('비밀번호가 "kd2026"으로 초기화되었습니다.', "success");
  };

  const students = (accounts.students || []).slice().sort((a, b) => (a.class - b.class) || (a.number - b.number));

  return (
    <div>
      <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", border: `1.5px dashed #e6e1d3` }}>
        <FileSpreadsheet size={22} color="#8a8578" />
        <div style={{ fontWeight: 700, marginTop: 8 }}>학생 계정 엑셀 일괄 발급</div>
        <div style={{ fontSize: 12, color: "#8a8578", margin: "6px 0 12px", textAlign: "center" }}>첫 행에 "학번","이름","초기비밀번호" 열이 있는 엑셀을 올려주세요. 이미 있는 학번은 정보가 갱신됩니다.</div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => e.target.files[0] && handleExcel(e.target.files[0])} />
        <button style={btn.primary} onClick={() => fileRef.current.click()} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} 엑셀 업로드</button>
      </div>
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>등록된 학생 계정 ({students.length}명)</div>
        {!students.length ? <div style={{ fontSize: 12.5, color: "#a39d8c" }}>등록된 계정이 없습니다.</div> : (
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            <table style={table.base}>
              <thead><tr><th style={table.th}>학번</th><th style={table.th}>이름</th><th style={table.th}>반</th><th style={table.th}>번호</th><th style={table.th}></th></tr></thead>
              <tbody>
                {students.map(s => (
                  <tr key={s.id}>
                    <td style={table.td}>{s.id}</td><td style={table.td}>{s.name}</td><td style={table.td}>{s.class}</td><td style={table.td}>{s.number}</td>
                    <td style={table.td}><button style={btn.link} onClick={() => resetPw(s.id)}>비밀번호 초기화</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   관리자: 원본 성적 데이터 업로드 (학기별 성적표 / 모의고사 / 대입전형표)
   ============================================================ */
export function AdminGradesUpload({ gdb, persistGrades, showToast }) {
  const [subtab, setSubtab] = useState("bulk");
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
        <TabBtn active={subtab === "bulk"} onClick={() => setSubtab("bulk")} label="전체 파일 한번에 업로드" />
        <TabBtn active={subtab === "semester"} onClick={() => setSubtab("semester")} label="학기별 성적표 (개별)" />
        <TabBtn active={subtab === "mock"} onClick={() => setSubtab("mock")} label="모의고사 (개별)" />
        <TabBtn active={subtab === "admission"} onClick={() => setSubtab("admission")} label="대입 전형표 (개별)" />
        <TabBtn active={subtab === "admissionPdf"} onClick={() => setSubtab("admissionPdf")} label="대학별 모집요강 PDF" />
      </div>
      {subtab === "bulk" && <BulkUpload gdb={gdb} persistGrades={persistGrades} showToast={showToast} />}
      {subtab === "semester" && <SemesterUpload gdb={gdb} persistGrades={persistGrades} showToast={showToast} />}
      {subtab === "mock" && <MockUpload gdb={gdb} persistGrades={persistGrades} showToast={showToast} />}
      {subtab === "admission" && <AdmissionUpload gdb={gdb} persistGrades={persistGrades} showToast={showToast} />}
      {subtab === "admissionPdf" && <AdmissionPdfManager gdb={gdb} persistGrades={persistGrades} showToast={showToast} />}
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
  const entries = Array.from(lookup.entries()).sort((a, b) => b[0].length - a[0].length);
  for (const candidate of candidates) {
    for (const [key, ratio] of entries) {
      if (key.length >= 3 && (candidate.includes(key) || key.includes(candidate))) return ratio;
    }
  }
  return "";
}

function parseAdmissionWorkbook(workbook, XLSX) {
  const sheetRows = (workbook?.SheetNames || []).map(name => ({
    name,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: null }),
  }));
  const parsedCandidates = sheetRows
    .map(item => ({ ...item, parsed: parseAdmissionRows(item.rows) }))
    .filter(item => item.parsed && item.parsed.length);
  if (!parsedCandidates.length) return null;

  // 전형표 본문은 가장 많은 대학 전형 행을 가진 시트를 기준으로 사용합니다.
  const base = parsedCandidates.sort((a, b) => b.parsed.length - a.parsed.length)[0].parsed;
  const lookup = new Map();
  let orderedLookup = [];
  sheetRows.forEach(item => {
    const sheetLookup = parseReflectionLookup(item.rows);
    sheetLookup.forEach((ratio, key) => lookup.set(key, ratio));
    if ((sheetLookup.ordered || []).length > orderedLookup.length) orderedLookup = sheetLookup.ordered || [];
  });

  return base.map((row, index) => {
    if (admissionReflectionText(row)) return row;
    const mapped = findReflectionInLookup(row, lookup);
    if (mapped) return { ...row, reflection: mapped };
    // 전형표 본문과 전형-반영비율 표의 행 수가 정확히 같으면 행 순서도 보조 기준으로 사용합니다.
    if (orderedLookup.length === base.length && orderedLookup[index]?.ratio) {
      return { ...row, reflection: orderedLookup[index].ratio };
    }
    return row;
  });
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

  const departmentIndex = firstIndex(["계열학과", "모집단위", "학과", "계열", "학부"]);
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
      note: noteIndex == null ? "" : String(row[noteIndex] ?? "").trim(),
      region: regionIndex == null ? "" : String(row[regionIndex] ?? "").trim(),
    });
  }
  return admissionRows;
}

function BulkUpload({ gdb, persistGrades, showToast }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // { newSemesterData, newMockData, newAdmissionRows, found, skipped }
  const [applying, setApplying] = useState(false);

  const handleFile = async (file) => {
    setBusy(true);
    setPreview(null);
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
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
            newSemesterData[cls.key] = { students, updatedAt: new Date().toISOString() };
            found.push(`${SEMESTER_LABELS[cls.key] || cls.key} 성적 — ${count}명`);
          } else skipped.push(`${name} (학생 데이터 인식 실패)`);
        } else if (cls.type === "mock") {
          const students = parseMockSheet(rows);
          const count = Object.keys(students).length;
          if (count) {
            newMockData[cls.key] = { students, updatedAt: new Date().toISOString() };
            found.push(`${MOCK_MONTH_LABELS[cls.key] || cls.key} 모의고사 — ${count}명`);
          } else skipped.push(`${name} (학생 데이터 인식 실패)`);
        } else if (cls.type === "admission") {
          // 전형표와 별도의 "전형-반영비율" 시트를 함께 읽기 위해
          // 실제 대입 데이터 처리는 아래에서 통합 실행합니다.
        }
      });

      const workbookAdmissionRows = parseAdmissionWorkbook(wb, XLSX);
      if (workbookAdmissionRows && workbookAdmissionRows.length) {
        newAdmissionRows = workbookAdmissionRows;
        found.push(`대입 전형표 — ${workbookAdmissionRows.length}건 (반영비율 ${workbookAdmissionRows.filter(row => admissionReflectionText(row)).length}건)`);
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
    const ok = await persistGrades({ semesterData: { ...gdb.semesterData, [semKey]: { students: preview.students, updatedAt: new Date().toISOString() } } });
    if (ok) { showToast(`저장했습니다. (${SEMESTER_LABELS[semKey]} ${preview.count}명)`, "success"); setPreview(null); }
    setApplying(false);
  };

  const removeSemester = async (k) => {
    const updated = { ...gdb.semesterData };
    delete updated[k];
    const ok = await persistGrades({ semesterData: updated });
    if (ok) showToast(`${SEMESTER_LABELS[k]} 데이터를 삭제했습니다.`, "success");
  };

  return (
    <div>
      <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", border: `1.5px dashed #e6e1d3` }}>
        <FileSpreadsheet size={22} color="#8a8578" />
        <div style={{ fontWeight: 700, marginTop: 8 }}>학기별 성적표 업로드</div>
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
              <span style={{ color: gdb.semesterData[k] ? "#3d5c3a" : "#a39d8c" }}>{gdb.semesterData[k] ? `${Object.keys(gdb.semesterData[k].students).length}명 (${new Date(gdb.semesterData[k].updatedAt).toLocaleDateString("ko-KR")})` : "미등록"}</span>
              {gdb.semesterData[k] && <button style={btn.link} onClick={() => removeSemester(k)}>삭제</button>}
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
  const gradeStartCol = koreanOccurrences.length >= 2 ? koreanOccurrences[1] : (koreanOccurrences[0] ?? null);
  const students = {};
  if (gradeStartCol == null) return students;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]; if (!row) continue;
    const sid = row[sidCol]; if (!sid || isNaN(Number(sid))) continue;
    const grades = {};
    MOCK_SUBJECTS.forEach((subj, i) => {
      const v = row[gradeStartCol + i];
      if (v !== null && v !== undefined && v !== "" && !isNaN(Number(v))) grades[subj] = Number(v);
    });
    if (Object.keys(grades).length) students[String(sid).trim().replace(/\.0$/, "")] = grades;
  }
  return students;
}

function MockUpload({ gdb, persistGrades, showToast }) {
  const [monthKey, setMonthKey] = useState("2-6");
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
    const ok = await persistGrades({ mockData: { ...gdb.mockData, [monthKey]: { students: preview.students, updatedAt: new Date().toISOString() } } });
    if (ok) { showToast(`저장했습니다. (${MOCK_MONTH_LABELS[monthKey]} ${preview.count}명)`, "success"); setPreview(null); }
    setApplying(false);
  };

  const removeMock = async (k) => {
    const updated = { ...gdb.mockData };
    delete updated[k];
    const ok = await persistGrades({ mockData: updated });
    if (ok) showToast(`${MOCK_MONTH_LABELS[k]} 모의고사 데이터를 삭제했습니다.`, "success");
  };

  return (
    <div>
      <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", border: `1.5px dashed #e6e1d3` }}>
        <FileSpreadsheet size={22} color="#8a8578" />
        <div style={{ fontWeight: 700, marginTop: 8 }}>모의고사 성적 업로드</div>
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
              <span style={{ color: gdb.mockData[k] ? "#3d5c3a" : "#a39d8c" }}>{gdb.mockData[k] ? `${Object.keys(gdb.mockData[k].students).length}명` : "미등록"}</span>
              {gdb.mockData[k] && <button style={btn.link} onClick={() => removeMock(k)}>삭제</button>}
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

  const handleFile = async (file) => {
    setBusy(true);
    setPreview(null);
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const admissionRows = parseAdmissionWorkbook(wb, XLSX);
      if (!admissionRows) { showToast('열 이름을 확인해주세요: "대학교/대학명", "수능최저 반영 과목수/반영 교과수", "수능최저 합/최저합 기준"', "error"); setBusy(false); return; }
      setPreview(admissionRows);
      const reflectionCount = admissionRows.filter(row => admissionReflectionText(row)).length;
      showToast(`${admissionRows.length}건을 인식했습니다. (반영비율 ${reflectionCount}건)`, reflectionCount ? "success" : "info");
    } catch (e) {
      showToast(`파일 오류: ${e.message}`, "error");
    }
    setBusy(false);
  };

  const apply = async () => {
    setApplying(true);
    const ok = await persistGrades({ admissionRows: preview });
    if (ok) { showToast(`저장했습니다. (대입 전형표 ${preview.length}건)`, "success"); setPreview(null); }
    setApplying(false);
  };

  const removeAll = async () => {
    const ok = await persistGrades({ admissionRows: [] });
    if (ok) showToast("대입 전형표를 삭제했습니다.", "success");
  };

  return (
    <div>
      <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", border: `1.5px dashed #e6e1d3` }}>
        <FileSpreadsheet size={22} color="#8a8578" />
        <div style={{ fontWeight: 700, marginTop: 8 }}>대입 전형표 업로드</div>
        <div style={{ fontSize: 12, color: "#8a8578", margin: "6px 0 12px", textAlign: "center", maxWidth: 560, lineHeight: 1.55 }}>
          원본 엑셀 파일을 그대로 올려주세요. 대학 전형표 시트뿐 아니라 별도의 "전형 / 반영비율" 시트도 함께 검색하여 전형명에 맞는 반영비율을 자동 결합합니다.
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
        <button style={btn.primary} onClick={() => fileRef.current.click()} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} 파일 선택</button>
      </div>
      {preview && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: "#3d5c3a" }}>{preview.length}건 인식됨 (아직 저장되지 않았습니다)</div>
          <div style={{ fontSize: 12, color: preview.some(row => admissionReflectionText(row)) ? "#3d5c3a" : "#a3402b", marginBottom: 10 }}>
            교과 반영비율 인식: {preview.filter(row => admissionReflectionText(row)).length}건
            {!preview.some(row => admissionReflectionText(row)) && " · 전형/반영비율 시트의 열 이름과 전형명을 확인해주세요."}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn.primary} onClick={apply} disabled={applying}>{applying ? <Loader2 size={14} className="spin" /> : <Save size={14} />} 반영하기</button>
            <button style={btn.secondary} onClick={() => setPreview(null)}>취소</button>
          </div>
        </div>
      )}
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>현재 등록: {gdb.admissionRows.length}건</span>
          {gdb.admissionRows.length > 0 && <button style={btn.link} onClick={removeAll}>전체 삭제</button>}
        </div>
      </div>
    </div>
  );
}


function AdmissionPdfManager({ gdb, persistGrades, showToast }) {
  const fileRef = useRef(null);
  const zipRef = useRef(null);
  const [university, setUniversity] = useState("");
  const [region, setRegion] = useState("미지정");
  const [label, setLabel] = useState("");
  const [year, setYear] = useState(String(CURRENT_ACADEMIC_YEAR + 2));
  const [busy, setBusy] = useState(false);
  const [batchPreview, setBatchPreview] = useState(null);
  const [batchProgress, setBatchProgress] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editUniversity, setEditUniversity] = useState("");
  const [editRegion, setEditRegion] = useState("미지정");

  const docs = (gdb.admissionDocs || []).slice().sort((a, b) => (
    String(a.region || "미지정").localeCompare(String(b.region || "미지정"), "ko")
    || String(a.university || "").localeCompare(String(b.university || ""), "ko")
    || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
  ));
  const universityOptions = Array.from(new Set([
    ...(gdb.admissionRows || []).map(row => String(row.university || "").trim()),
    ...(gdb.admissionDocs || []).map(docItem => String(docItem.university || "").trim()),
  ].filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko"));
  const regionByUniversity = new Map();
  [...(gdb.admissionRows || []), ...(gdb.admissionDocs || [])].forEach(item => {
    if (item?.university && item?.region) regionByUniversity.set(universityKey(item.university), item.region);
  });

  const makeDocumentItem = (uploaded, values) => ({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    university: values.university.trim(),
    region: values.region || "미지정",
    label: values.label.trim() || `${values.year ? `${values.year}학년도 ` : ""}모집요강`,
    year: values.year.trim(),
    fileName: uploaded.fileName,
    size: uploaded.size,
    url: uploaded.url,
    storagePath: uploaded.path,
    updatedAt: new Date().toISOString(),
  });

  const handleUpload = async file => {
    if (!university.trim()) {
      showToast("대학교명을 먼저 입력해주세요.", "error");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setBusy(true);
    let uploaded = null;
    try {
      uploaded = await uploadAdmissionPdf(file, university.trim());
      const item = makeDocumentItem(uploaded, { university, region, label, year });
      const ok = await persistGrades({ admissionDocs: [...(gdb.admissionDocs || []), item] });
      if (!ok) {
        await deleteAdmissionPdf(uploaded.path);
        throw new Error("PDF 정보 저장에 실패했습니다.");
      }
      showToast(`${item.university} 모집요강 PDF를 등록했습니다.`, "success");
      setLabel("");
    } catch (error) {
      const detail = error?.code || error?.message || String(error);
      const guide = /storage\/(unauthorized|unknown|bucket-not-found|object-not-found)/.test(detail)
        ? " Firebase Console에서 Storage 활성화 및 규칙을 확인해주세요."
        : "";
      showToast(`PDF 업로드 실패: ${detail}.${guide}`, "error");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleZip = async zipFile => {
    setBusy(true);
    setBatchPreview(null);
    setBatchProgress("압축파일을 분석하고 있습니다.");
    try {
      if (!/\.zip$/i.test(zipFile.name || "")) throw new Error("ZIP 압축파일만 선택할 수 있습니다.");
      if (zipFile.size > 500 * 1024 * 1024) throw new Error("ZIP 파일은 500MB 이하만 처리할 수 있습니다.");
      const extracted = await extractPdfFilesFromZip(zipFile, {
        maxFiles: 100,
        maxTotalBytes: 500 * 1024 * 1024,
        onProgress: (current, total) => setBatchProgress(`PDF를 읽는 중입니다. (${current}/${total})`),
      });

      const items = [];
      for (let index = 0; index < extracted.length; index += 1) {
        const entry = extracted[index];
        const fileName = entry.name;
        const file = new File([entry.blob], fileName, { type: "application/pdf", lastModified: zipFile.lastModified || Date.now() });
        const inferredUniversity = inferUniversityFromFileName(fileName, universityOptions);
        const knownRegion = regionByUniversity.get(universityKey(inferredUniversity)) || "";
        items.push({
          id: `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
          file,
          fileName,
          university: inferredUniversity,
          region: inferRegionFromFileName(fileName, knownRegion),
          label: `${year ? `${year}학년도 ` : ""}모집요강`,
          year,
        });
      }
      setBatchPreview(items);
      setBatchProgress("");
      showToast(`${items.length}개의 PDF를 인식했습니다. 대학명과 지역을 확인한 뒤 일괄 업로드해주세요.`, "success");
    } catch (error) {
      showToast(`ZIP 분석 실패: ${error?.message || error}`, "error");
      setBatchProgress("");
    } finally {
      setBusy(false);
      if (zipRef.current) zipRef.current.value = "";
    }
  };

  const updateBatchItem = (id, patch) => {
    setBatchPreview(items => (items || []).map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const removeBatchItem = id => {
    setBatchPreview(items => (items || []).filter(item => item.id !== id));
  };

  const uploadBatch = async () => {
    const items = batchPreview || [];
    if (!items.length) return;
    if (items.some(item => !String(item.university || "").trim())) {
      showToast("대학명이 비어 있는 파일이 있습니다.", "error");
      return;
    }
    setBusy(true);
    const uploadedItems = [];
    const failures = [];
    try {
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        setBatchProgress(`${item.fileName} 업로드 중 (${index + 1}/${items.length})`);
        try {
          const uploaded = await uploadAdmissionPdf(item.file, item.university.trim());
          uploadedItems.push({ uploaded, doc: makeDocumentItem(uploaded, item) });
        } catch (error) {
          failures.push({ ...item, error: error?.message || String(error) });
        }
      }

      if (uploadedItems.length) {
        const ok = await persistGrades({
          admissionDocs: [...(gdb.admissionDocs || []), ...uploadedItems.map(item => item.doc)],
        });
        if (!ok) {
          await Promise.all(uploadedItems.map(item => deleteAdmissionPdf(item.uploaded.path)));
          throw new Error("업로드된 PDF 목록을 저장하지 못했습니다.");
        }
      }

      if (failures.length) {
        setBatchPreview(failures);
        showToast(`${uploadedItems.length}건 등록, ${failures.length}건 실패했습니다. 실패 항목을 확인해주세요.`, "error");
      } else {
        setBatchPreview(null);
        showToast(`${uploadedItems.length}개의 모집요강 PDF를 일괄 등록했습니다.`, "success");
      }
    } catch (error) {
      showToast(`일괄 업로드 실패: ${error?.message || error}`, "error");
    } finally {
      setBusy(false);
      setBatchProgress("");
    }
  };

  const startEdit = docItem => {
    setEditingId(docItem.id || docItem.url);
    setEditUniversity(docItem.university || "");
    setEditRegion(docItem.region || "미지정");
  };

  const saveEdit = async docItem => {
    if (!editUniversity.trim()) {
      showToast("대학교명을 입력해주세요.", "error");
      return;
    }
    setBusy(true);
    try {
      const key = docItem.id || docItem.url;
      const updated = (gdb.admissionDocs || []).map(item => (item.id || item.url) === key
        ? { ...item, university: editUniversity.trim(), region: editRegion || "미지정", updatedAt: new Date().toISOString() }
        : item);
      const ok = await persistGrades({ admissionDocs: updated });
      if (!ok) throw new Error("PDF 정보 저장에 실패했습니다.");
      setEditingId(null);
      showToast("대학명과 지역을 수정했습니다.", "success");
    } catch (error) {
      showToast(`수정 실패: ${error?.message || error}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const removeDoc = async docItem => {
    if (!window.confirm(`${docItem.university}의 “${docItem.label || docItem.fileName}” PDF를 삭제할까요?`)) return;
    setBusy(true);
    try {
      const removed = await deleteAdmissionPdf(docItem.storagePath);
      if (!removed.ok) throw new Error(removed.error || "Storage 파일 삭제 실패");
      const targetKey = docItem.id || docItem.url;
      const updated = (gdb.admissionDocs || []).filter(item => (item.id || item.url) !== targetKey);
      const ok = await persistGrades({ admissionDocs: updated });
      if (!ok) throw new Error("PDF 목록 저장에 실패했습니다.");
      showToast("모집요강 PDF를 삭제했습니다.", "success");
    } catch (error) {
      showToast(`삭제 실패: ${error?.message || error}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={{ ...card, border: "1.5px dashed #d7dfd3", background: "#fbfdfb" }}>
        <SectionHeading
          title="대학별 모집요강 PDF 등록"
          description="개별 PDF 또는 여러 PDF가 들어 있는 ZIP 파일을 등록할 수 있습니다. ZIP의 파일명에서 대학명을 우선 추정하며, 저장 전에 대학명과 지역을 직접 확인·수정합니다."
        />

        <div style={pdfAdmin.sectionTitle}>개별 PDF 업로드</div>
        <div style={pdfAdmin.formGrid}>
          <label style={pdfAdmin.label}>
            <span>대학교</span>
            <input list="admission-university-options" value={university} onChange={event => setUniversity(event.target.value)} placeholder="예: 광덕대학교" style={pdfAdmin.input} />
            <datalist id="admission-university-options">{universityOptions.map(name => <option key={name} value={name} />)}</datalist>
          </label>
          <label style={pdfAdmin.label}>
            <span>지역</span>
            <select value={region} onChange={event => setRegion(event.target.value)} style={pdfAdmin.input}>
              {ADMISSION_REGIONS.map(regionName => <option key={regionName} value={regionName}>{regionName}</option>)}
            </select>
          </label>
          <label style={pdfAdmin.label}>
            <span>학년도</span>
            <input value={year} onChange={event => setYear(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))} placeholder="2028" style={pdfAdmin.input} />
          </label>
          <label style={pdfAdmin.label}>
            <span>표시 이름</span>
            <input value={label} onChange={event => setLabel(event.target.value)} placeholder="비워두면 ‘2028학년도 모집요강’" style={pdfAdmin.input} />
          </label>
        </div>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" style={{ display: "none" }} onChange={event => event.target.files?.[0] && handleUpload(event.target.files[0])} />
        <button style={btn.primary} onClick={() => fileRef.current?.click()} disabled={busy || !university.trim()}>
          {busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} PDF 선택 및 업로드
        </button>

        <div style={pdfAdmin.divider} />
        <div style={pdfAdmin.sectionTitle}>ZIP 일괄 업로드</div>
        <div style={{ fontSize: 11.5, color: "#716b5f", lineHeight: 1.6, marginBottom: 10 }}>
          ZIP 안의 PDF 파일명을 분석해 대학명을 자동 입력합니다. 자동 인식 결과는 바로 저장되지 않으며, 아래 미리보기에서 대학명과 지역을 수정한 후 업로드합니다.
        </div>
        <input ref={zipRef} type="file" accept="application/zip,.zip" style={{ display: "none" }} onChange={event => event.target.files?.[0] && handleZip(event.target.files[0])} />
        <button style={btn.secondary} onClick={() => zipRef.current?.click()} disabled={busy}>
          <Archive size={14} /> ZIP 파일 선택
        </button>
        {batchProgress && <div style={pdfAdmin.progress}><Loader2 size={13} className="spin" />{batchProgress}</div>}

        <div style={pdfAdmin.notice}>
          <BookOpen size={14} /> Firebase Storage가 아직 활성화되지 않았거나 쓰기 규칙이 막혀 있으면 업로드가 실패합니다. 현재 앱의 자체 로그인은 Firebase Storage 규칙에서 관리자 여부를 확인할 수 없으므로, 실제 운영 시에는 Firebase Authentication 연동이 가장 안전합니다.
        </div>
      </div>

      {batchPreview && (
        <div style={card}>
          <SectionHeading title={`ZIP 업로드 확인 (${batchPreview.length}건)`} description="대학명과 지역을 최종 확인하세요. 잘못 인식된 항목은 직접 수정하거나 목록에서 제외할 수 있습니다." />
          <div style={table.scroll}>
            <table style={{ ...table.base, minWidth: 860 }}>
              <thead>
                <tr><th style={table.th}>파일명</th><th style={table.th}>대학명</th><th style={table.th}>지역</th><th style={table.th}>표시 이름</th><th style={table.th}></th></tr>
              </thead>
              <tbody>
                {batchPreview.map(item => (
                  <tr key={item.id}>
                    <td style={{ ...table.tdLabel, maxWidth: 220, whiteSpace: "normal", wordBreak: "break-all" }}>
                      {item.fileName}
                      {item.error && <div style={{ color: "#9a4242", fontSize: 10.5, marginTop: 4 }}>{item.error}</div>}
                    </td>
                    <td style={table.td}><input value={item.university} onChange={event => updateBatchItem(item.id, { university: event.target.value })} style={{ ...pdfAdmin.input, minWidth: 160 }} /></td>
                    <td style={table.td}>
                      <select value={item.region || "미지정"} onChange={event => updateBatchItem(item.id, { region: event.target.value })} style={{ ...pdfAdmin.input, minWidth: 105 }}>
                        {ADMISSION_REGIONS.map(regionName => <option key={regionName} value={regionName}>{regionName}</option>)}
                      </select>
                    </td>
                    <td style={table.td}><input value={item.label || ""} onChange={event => updateBatchItem(item.id, { label: event.target.value })} style={{ ...pdfAdmin.input, minWidth: 150 }} /></td>
                    <td style={table.td}><button style={pdfAdmin.deleteButton} onClick={() => removeBatchItem(item.id)} disabled={busy}><Trash2 size={12} /> 제외</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button style={btn.primary} onClick={uploadBatch} disabled={busy || !batchPreview.length}>{busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} 확인한 PDF 일괄 업로드</button>
            <button style={btn.secondary} onClick={() => setBatchPreview(null)} disabled={busy}>취소</button>
          </div>
        </div>
      )}

      <div style={card}>
        <SectionHeading title={`등록된 모집요강 (${docs.length}건)`} description="등록 후에도 대학명과 지역을 수정할 수 있습니다." />
        {!docs.length ? (
          <div style={chartEmpty}>등록된 모집요강 PDF가 없습니다.</div>
        ) : (
          <div style={admissionDocs.grid}>
            {docs.map(docItem => {
              const key = docItem.id || docItem.url;
              const editing = editingId === key;
              return (
                <div key={key} style={admissionDocs.card}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {editing ? (
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, 1fr) 110px", gap: 7 }}>
                        <input value={editUniversity} onChange={event => setEditUniversity(event.target.value)} style={pdfAdmin.input} />
                        <select value={editRegion} onChange={event => setEditRegion(event.target.value)} style={pdfAdmin.input}>
                          {ADMISSION_REGIONS.map(regionName => <option key={regionName} value={regionName}>{regionName}</option>)}
                        </select>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 900, color: "#2b2620" }}>{docItem.university}</div>
                          <span style={regionBadge}><MapPin size={10} />{docItem.region || "미지정"}</span>
                        </div>
                        <div style={{ fontSize: 11.5, color: "#716b5f", marginTop: 3 }}>{docItem.label || docItem.fileName}</div>
                        <div style={{ fontSize: 10.5, color: "#a39d8c", marginTop: 3 }}>
                          {docItem.fileName}{docItem.size ? ` · ${(docItem.size / 1024 / 1024).toFixed(1)}MB` : ""}
                        </div>
                      </>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {editing ? (
                      <>
                        <button style={btn.primary} onClick={() => saveEdit(docItem)} disabled={busy}>저장</button>
                        <button style={btn.secondary} onClick={() => setEditingId(null)} disabled={busy}>취소</button>
                      </>
                    ) : (
                      <>
                        <PdfLink docItem={docItem} />
                        <button style={btn.secondary} onClick={() => startEdit(docItem)} disabled={busy}>정보 수정</button>
                        <button style={pdfAdmin.deleteButton} onClick={() => removeDoc(docItem)} disabled={busy}><Trash2 size={13} /> 삭제</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
  primary: { display: "flex", alignItems: "center", gap: 6, border: "none", background: "#3d5c3a", color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 12.5, cursor: "pointer", fontWeight: 700 },
  secondary: { border: "1px solid #e6e1d3", background: "#fff", padding: "7px 13px", borderRadius: 8, fontSize: 12.5, cursor: "pointer", fontWeight: 700 },
  link: { border: "none", background: "transparent", color: "#3d5c3a", fontSize: 11.5, cursor: "pointer", textDecoration: "underline" },
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
  th: { whiteSpace: "normal", lineHeight: 1.15, padding: "6px 4px", fontSize: 10.4 },
  thSub: { fontSize: 9.3, color: "#716b5f", fontWeight: 700 },
  td: { padding: "6px 4px", fontSize: 11.1 },
  subjectCell: { padding: "6px 7px", whiteSpace: "normal", wordBreak: "keep-all", lineHeight: 1.35, fontSize: 11.2 },
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
  bestAverageTd: { background: "#e8f6ea", boxShadow: "inset 0 0 0 1px #b8dcbc" },
};
const searchBox = {
  box: { display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #e6e1d3", borderRadius: 10, padding: "9px 13px", maxWidth: 420 },
  input: { border: "none", outline: "none", flex: 1, fontSize: 13.5, background: "transparent" },
  list: { marginTop: 8, maxWidth: 420, background: "#fff", border: "1px solid #e6e1d3", borderRadius: 10, overflow: "hidden" },
  item: { display: "flex", flexDirection: "column", alignItems: "flex-start", width: "100%", textAlign: "left", padding: "9px 13px", border: "none", background: "transparent", cursor: "pointer", borderBottom: "1px solid #e6e1d3", fontSize: 13, gap: 2 },
};
const studentBanner = {
  box: {
    background: "linear-gradient(135deg, #2f4630 0%, #466a43 100%)",
    color: "#fff",
    borderRadius: 16,
    padding: "20px 22px",
    marginBottom: 14,
    boxShadow: "0 8px 22px rgba(47,70,48,0.16)",
  },
  eyebrow: { fontSize: 11.5, opacity: 0.78, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 5 },
  title: { fontSize: 21, fontWeight: 500, lineHeight: 1.35 },
  identity: { fontWeight: 900 },
  badges: { display: "flex", flexWrap: "wrap", gap: 7, marginTop: 13 },
  badge: { display: "inline-flex", alignItems: "center", background: "rgba(255,255,255,0.13)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 999, padding: "5px 10px", fontSize: 11.5, fontWeight: 700 },
  gradeBadge: { background: "#fff", color: "#315132", borderColor: "#fff" },
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
  minWidth: 30,
  minHeight: 24,
  padding: "4px 8px",
  borderRadius: 999,
  fontSize: 11.2,
  fontWeight: 900,
  lineHeight: 1.1,
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
  box: { display: "flex", gap: "7px 13px", flexWrap: "wrap", margin: "0 0 12px", padding: "9px 11px", background: "#faf9f5", border: "1px solid #ebe7dc", borderRadius: 10 },
  item: { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.8, color: "#716b5f", fontWeight: 700 },
  dot: { width: 8, height: 8, borderRadius: 99, display: "inline-block" },
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
const bestBadge = { fontSize: 9.5, fontWeight: 900, color: "#24613a", background: "#dff1e3", border: "1px solid #b9ddc1", borderRadius: 999, padding: "3px 6px" };
const mockSum = {
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 10, marginTop: 14 },
  card: { border: "1px solid #dfe7dc", background: "#f5faf4", borderRadius: 12, padding: "13px 14px", textAlign: "center" },
  label: { fontSize: 13, fontWeight: 900, color: "#3d5c3a" },
  value: { fontSize: 30, fontWeight: 900, lineHeight: 1.15, color: "#233523", margin: "4px 0 2px" },
  caption: { fontSize: 10.5, color: "#7d897a" },
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
const admissionSummary = {
  grid: { display: "grid", gridTemplateColumns: "repeat(3, minmax(110px, 1fr))", gap: 8, marginTop: 12 },
  card: { display: "flex", alignItems: "baseline", justifyContent: "center", gap: 7, borderRadius: 11, padding: "10px 12px", fontSize: 11.5, fontWeight: 800 },
  success: { background: "#eaf6ec", color: "#2d6238", border: "1px solid #c8e2cd" },
  danger: { background: "#fff0f0", color: "#963f3f", border: "1px solid #edcccc" },
  neutral: { background: "#f4f2ed", color: "#716b5f", border: "1px solid #ded9cd" },
};
const admissionToolbar = {
  box: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 13 },
  mainRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  filterGroup: { display: "flex", gap: 5, flexWrap: "wrap" },
  requirementRow: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "7px 9px", background: "#f8f7f3", border: "1px solid #e5e0d4", borderRadius: 10 },
  requirementLabel: { fontSize: 10, fontWeight: 900, color: "#6f685d", marginRight: 2 },
};
const requirementFilterButton = {
  base: { display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid #d9d4c8", background: "#fff", color: "#514b42", borderRadius: 999, padding: "4px 8px", fontSize: 10, fontWeight: 850, cursor: "pointer" },
  active: { background: "#2f4b32", color: "#fff", borderColor: "#2f4b32" },
  count: { display: "inline-flex", minWidth: 17, height: 17, alignItems: "center", justifyContent: "center", borderRadius: 999, background: "rgba(128,128,128,0.14)", fontSize: 8.8, fontWeight: 900 },
};
const admissionStatus = {
  base: { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 62, padding: "5px 10px", borderRadius: 999, fontSize: 10.8, fontWeight: 900, margin: "1px 0" },
  success: { background: "#e7f5ea", color: "#24613a", border: "1px solid #bfe2c8" },
  danger: { background: "#fff0f0", color: "#9a4242", border: "1px solid #efcaca" },
  warning: { background: "#fff6df", color: "#805f1d", border: "1px solid #efddae" },
  noMinimum: { background: "#eef1ff", color: "#4f4a91", border: "1px solid #d3d1f2" },
  neutral: { background: "#f4f2ed", color: "#716b5f", border: "1px solid #ded9cd" },
};
const admissionTable = {
  base: {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
    fontSize: 9.4,
  },
  th: {
    border: "1px solid #e6e1d3",
    padding: "6px 3px",
    background: "#f6f4ee",
    color: "#332e27",
    fontWeight: 900,
    fontSize: 9.1,
    lineHeight: 1.25,
    textAlign: "center",
    whiteSpace: "normal",
    wordBreak: "keep-all",
  },
  td: {
    border: "1px solid #e6e1d3",
    padding: "6px 4px",
    textAlign: "center",
    verticalAlign: "middle",
    whiteSpace: "normal",
    wordBreak: "keep-all",
    overflowWrap: "anywhere",
    lineHeight: 1.35,
  },
  university: {
    fontWeight: 900,
    textAlign: "left",
    background: "#fbfaf6",
    color: "#2b2620",
  },
  text: { textAlign: "left", verticalAlign: "top" },
  regionCell: { padding: "8px 4px", overflow: "visible" },
  department: { textAlign: "center", verticalAlign: "middle", paddingLeft: 4, paddingRight: 4 },
  reflectionCell: { textAlign: "center", verticalAlign: "middle", padding: "7px 4px" },
  noteCell: { padding: "7px 6px", background: "#fffefa" },
  subjectCell: { padding: "6px 3px", verticalAlign: "middle" },
  statusCell: { padding: "8px 8px" },
  primaryText: { fontWeight: 900, color: "#2b2620", lineHeight: 1.3, textAlign: "center" },
  detailStack: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, width: "100%" },
  detailGroup: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0, maxWidth: "100%" },
  detailLine: { display: "block", maxWidth: "100%", color: "#2b2620", fontSize: 9.1, fontWeight: 900, lineHeight: 1.25, whiteSpace: "nowrap", letterSpacing: "-0.2px" },
  secondaryText: { color: "#716b5f", fontSize: 9.7, lineHeight: 1.45 },
  minimumDetail: { color: "#8a8578", fontSize: 9.2, marginTop: 4, lineHeight: 1.3 },
  empty: { color: "#aaa393", fontSize: 9.7, fontWeight: 700 },
};
const reflectionBadge = {
  display: "inline-block",
  maxWidth: "100%",
  padding: "4px 8px",
  borderRadius: 999,
  background: "linear-gradient(180deg, #ffffff 0%, #eef0f2 100%)",
  border: "1px solid #d8dadd",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)",
  color: "#3f454b",
  fontSize: 9.5,
  fontWeight: 900,
  lineHeight: 1.25,
  whiteSpace: "normal",
  wordBreak: "keep-all",
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
    maxWidth: "100%",
    padding: "4px 6px",
    borderRadius: 7,
    background: "#f2f6f7",
    border: "1px solid #d6e1e3",
    color: "#36575b",
    fontSize: 8.8,
    fontWeight: 900,
    lineHeight: 1.25,
    whiteSpace: "nowrap",
    letterSpacing: "-0.15px",
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
  fontSize: 10.2,
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
  background: "#edf7f0",
  border: "1px solid #c8e0cd",
  color: "#2d6238",
  fontSize: 10.1,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const eachStudentBadge = {
  background: "#f1f4fb",
  border: "1px solid #d2daea",
  color: "#415270",
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
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 9 },
  card: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, border: "1px solid #e6e1d3", borderRadius: 11, background: "#fbfaf7", padding: "12px 13px" },
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
