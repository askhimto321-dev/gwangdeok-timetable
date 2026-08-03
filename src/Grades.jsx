import React, { useState, useMemo, useRef } from "react";
import { Search, Upload, FileSpreadsheet, Loader2, Save } from "lucide-react";
import { readStorage } from "./storage.js";
import {
  parseSemesterSheet,
  computeAllGroupAverages,
  computeMockExamSums,
  matchUniversities,
  gradeAnalysisComment,
  inferCategory,
  getSubjectGrade,
  grade5to9,
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
const CATEGORY_GROUP_NAMES = ["국어", "영어", "수학", "사회", "과학"];
const COMBINATION_GROUP_NAMES = ["전과목", "국영수사과", "국영수사", "국영수과", "국영수", "국영사", "국영과", "영수사", "영수과"];

const CATEGORY_META = {
  국어: { short: "국", label: "국어", color: "#315a9b", background: "#eef3ff", row: "#f8faff" },
  영어: { short: "영", label: "영어", color: "#9a4254", background: "#fff0f3", row: "#fff9fa" },
  수학: { short: "수", label: "수학", color: "#5d4898", background: "#f1edff", row: "#faf8ff" },
  사회: { short: "사", label: "사회", color: "#8a641d", background: "#fff5df", row: "#fffbf2" },
  과학: { short: "과", label: "과학", color: "#356b49", background: "#eaf7ef", row: "#f6fbf8" },
  "기술가정/정보": { short: "기정·정보", label: "기술가정/정보", color: "#2f7770", background: "#e8f7f5", row: "#f5fbfa" },
  제2외국어: { short: "제2외", label: "제2외국어", color: "#a35f26", background: "#fff1e4", row: "#fff9f3" },
  기타: { short: "기타", label: "기타", color: "#716b5f", background: "#f1f0ec", row: "#fbfaf7" },
};

const CATEGORY_TREND_OPTIONS = ["국어", "영어", "수학", "사회", "과학", "전과목"];
const MOCK_TREND_OPTIONS = [...MOCK_SUBJECTS, "전과목 평균"];

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
  const raw = String(category || inferCategory(subject) || "").replace(/\s/g, "");
  if (/국어|문학|독서|화법|작문|언어/.test(raw)) return "국어";
  if (/영어/.test(raw)) return "영어";
  if (/수학|대수|미적분|기하|확률/.test(raw)) return "수학";
  if (/사회|한국사|역사|지리|윤리|정치|경제/.test(raw)) return "사회";
  if (/기술.?가정|가정|정보|인공지능|프로그래밍|데이터과학/.test(raw)) return "기술가정/정보";
  if (/제2외국어|일본어|중국어|한문|독일어|프랑스어|스페인어|러시아어|아랍어|베트남어/.test(raw)) return "제2외국어";
  if (/과학|물리|화학|생명|지구/.test(raw)) return "과학";
  return "기타";
}

function shortCategory(category, subject) {
  const key = resolveCategoryKey(category, subject);
  return CATEGORY_META[key]?.short || CATEGORY_META.기타.short;
}

function categoryMeta(category, subject) {
  const key = resolveCategoryKey(category, subject);
  return { key, ...(CATEGORY_META[key] || CATEGORY_META.기타) };
}

function gradeValueStyle(value, maxGrade = 9) {
  const grade = asNumber(value);
  if (grade == null) return {};
  if (grade <= 1) return { background: "#e7f5ea", color: "#24613a", border: "1px solid #bfe2c8" };
  if (grade <= 2) return { background: "#edf3ff", color: "#315a9b", border: "1px solid #cad8f3" };
  const middle = maxGrade === 5 ? 3 : 4;
  if (grade <= middle) return { background: "#fff6df", color: "#805f1d", border: "1px solid #efddae" };
  return { background: "#fff0f0", color: "#9a4242", border: "1px solid #efcaca" };
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

export async function loadGradesDB() {
  const [semesterData, mockData, admissionRows, studentAccounts] = await Promise.all([
    readStorage("kd_grades_semesters", {}),
    readStorage("kd_grades_mocks", {}),
    readStorage("kd_grades_admission", []),
    readStorage("kd_grades_students_meta", {}),
  ]);
  return { semesterData, mockData, admissionRows, studentAccounts };
}

export default function GradesSection({ loggedInAdmin, loggedInTeacher, loggedInStudent, roster, accounts, showToast, onLogout, gdb }) {
  const [tab, setTab] = useState(loggedInStudent ? "grades" : "lookup");

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
          {loggedInStudent && <TabBtn active={tab === "admission"} onClick={() => setTab("admission")} label="대입전형 확인" />}
          {(loggedInTeacher) && <TabBtn active={tab === "class"} onClick={() => setTab("class")} label="우리 반 학생 조회" />}
          {(loggedInAdmin || loggedInTeacher) && <TabBtn active={tab === "lookup"} onClick={() => setTab("lookup")} label="학생 성적 조회" />}
        </div>

        {tab === "grades" && loggedInStudent && <StudentGradeReport key={loggedInStudent.id} sid={loggedInStudent.id} gdb={gdb} mode="grades" studentInfo={loggedInStudent} />}
        {tab === "admission" && loggedInStudent && <StudentGradeReport key={loggedInStudent.id} sid={loggedInStudent.id} gdb={gdb} mode="admission" studentInfo={loggedInStudent} />}
        {tab === "lookup" && (loggedInAdmin || loggedInTeacher) && (
          <StudentLookup roster={roster} gdb={gdb} homeroomClass={loggedInTeacher ? loggedInTeacher.homeroomClass : null} isAdmin={!!loggedInAdmin} />
        )}
        {tab === "class" && loggedInTeacher && (
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
                <table style={table.base}>
                  <thead>
                    <tr>
                      <th style={table.th}>과목</th>
                      <th style={table.th}>과목계열</th>
                      <th style={table.th}>학점</th>
                      <th style={table.th}>원점수</th>
                      <th style={table.th}>성취도</th>
                      {gradeSystem === 5 ? (
                        <>
                          <th style={table.th}>석차등급 (5등급제)</th>
                          <th style={table.th}>9등급 환산</th>
                        </>
                      ) : (
                        <th style={table.th}>석차등급 (9등급제)</th>
                      )}
                      <th style={table.th}>석차</th>
                      <th style={table.th}>수강자수</th>
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
                        <tr key={`${subject.subject}-${index}`} style={{ background: meta.row }}>
                          <td style={{ ...table.tdLabel, background: meta.background, borderLeft: `5px solid ${meta.color}`, color: meta.color }}>
                            {subject.subject}
                          </td>
                          <td style={table.td}><CategoryBadge category={meta.key} /></td>
                          <td style={table.td}>{subject.credit}</td>
                          <td style={table.td}>
                            <span style={{ fontWeight: score != null && score >= 90 ? 900 : 600, color: score != null && score >= 90 ? "#24613a" : "inherit" }}>
                              {subject.score ?? "-"}
                            </span>
                          </td>
                          <td style={table.td}>
                            <span style={{ ...achievementPill.base, ...(achievement === "A" ? achievementPill.a : achievement === "B" ? achievementPill.b : achievementPill.default) }}>
                              {subject.achievement ?? "-"}
                            </span>
                          </td>
                          <td style={table.td}>
                            <span style={{ ...metricPill, ...gradeValueStyle(sourceGrade, gradeSystem) }}>{sourceGrade ?? "-"}</span>
                          </td>
                          {gradeSystem === 5 && (
                            <td style={table.td}>
                              <span style={{ ...metricPill, ...gradeValueStyle(convertedGrade, 9) }}>{convertedGrade ?? "-"}</span>
                            </td>
                          )}
                          <td style={table.td}>
                            <span style={{ fontWeight: topRate != null && topRate <= 10 ? 900 : 600, color: topRate != null && topRate <= 10 ? "#24613a" : "inherit" }}>
                              {subject.rank ?? "-"}
                            </span>
                            {topRate != null && topRate <= 10 && <div style={topBadge}>상위 {topRate}%</div>}
                          </td>
                          <td style={table.td}>{subject.classSize ?? "-"}</td>
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

function StudentIdentityBanner({ sid, name, grade, classNumber, number, entryYear, gradeSystem }) {
  const location = [
    grade != null ? `${grade}학년` : null,
    classNumber != null ? `${Number(classNumber)}반` : null,
    number != null ? `${Number(number)}번` : null,
  ].filter(Boolean).join(" ");

  return (
    <div style={studentBanner.box}>
      <div style={studentBanner.eyebrow}>학생 성적 조회</div>
      <div style={studentBanner.title}>
        <span style={studentBanner.identity}>{sid}{name ? ` ${name}` : ""}</span> 학생의 성적
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
  const meta = categoryRow ? (CATEGORY_META[name] || CATEGORY_META.기타) : null;
  const isBest = average != null && bestAverage != null && average === bestAverage;

  return (
    <tr style={meta ? { background: meta.row } : undefined}>
      <td style={{
        ...table.tdLabel,
        ...(meta ? { background: meta.background, color: meta.color, borderLeft: `5px solid ${meta.color}` } : {}),
        ...(name === "전과목" ? { background: "#efeee9", fontWeight: 900 } : {}),
      }}>
        {meta ? <CategoryBadge category={name} showLabel /> : name}
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
function StudentLookup({ roster, gdb, homeroomClass, isAdmin }) {
  const [query, setQuery] = useState("");
  const [sid, setSid] = useState(null);

  const candidates = useMemo(() => {
    let entries = Object.entries(roster || {});
    if (!isAdmin && homeroomClass) entries = entries.filter(([, s]) => String(s.class) === String(homeroomClass));
    if (!query.trim()) return [];
    const q = query.trim();
    return entries.filter(([id, s]) => id.includes(q) || (s.name || "").includes(q)).slice(0, 8);
  }, [query, roster, isAdmin, homeroomClass]);

  return (
    <div>
      {!isAdmin && homeroomClass && <div style={{ fontSize: 12, color: "#8a8578", marginBottom: 10 }}>담당 반({homeroomClass}반) 학생만 조회할 수 있습니다.</div>}
      <div style={searchBox.box}>
        <Search size={16} color="#a39d8c" />
        <input value={query} onChange={e => { setQuery(e.target.value); setSid(null); }} placeholder="학번 또는 이름으로 검색" style={searchBox.input} />
      </div>
      {candidates.length > 0 && !sid && (
        <div style={searchBox.list}>
          {candidates.map(([id, s]) => (
            <button key={id} style={searchBox.item} onClick={() => setSid(id)}>
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              <span style={{ color: "#a39d8c", fontSize: 11.5 }}>{s.class}반 {s.number}번 · {id}</span>
            </button>
          ))}
        </div>
      )}
      {sid && <div style={{ marginTop: 16 }}><StudentGradeReport key={sid} sid={sid} gdb={gdb} studentInfo={roster?.[sid]} /></div>}
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
      </div>
      {subtab === "bulk" && <BulkUpload gdb={gdb} persistGrades={persistGrades} showToast={showToast} />}
      {subtab === "semester" && <SemesterUpload gdb={gdb} persistGrades={persistGrades} showToast={showToast} />}
      {subtab === "mock" && <MockUpload gdb={gdb} persistGrades={persistGrades} showToast={showToast} />}
      {subtab === "admission" && <AdmissionUpload gdb={gdb} persistGrades={persistGrades} showToast={showToast} />}
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
function parseAdmissionRows(rows) {
  const need = ["대학교", "수능최저반영과목수", "수능최저합"];
  let headerRowIdx = rows.findIndex(r => r && r.some(c => normalizeHeader(c) === "대학교"));
  if (headerRowIdx === -1) return null;
  const header = rows[headerRowIdx];
  const idx = {}; header.forEach((h, i) => { if (h != null && h !== "") idx[normalizeHeader(h)] = i; });
  if (need.some(n => idx[n] == null)) return null;
  const admissionRows = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r]; if (!row) continue;
    const university = row[idx["대학교"]];
    if (!university) continue;
    admissionRows.push({
      university: String(university).trim(),
      requiredSubjectCount: row[idx["수능최저반영과목수"]],
      requiredSum: row[idx["수능최저합"]],
      note: row[idx["전형특이사항"]] ?? "",
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
          const admissionRows = parseAdmissionRows(rows);
          if (admissionRows && admissionRows.length) {
            newAdmissionRows = admissionRows;
            found.push(`대입 전형표 — ${admissionRows.length}건`);
          } else skipped.push(`${name} (열 이름 인식 실패)`);
        }
      });

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
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
      const admissionRows = parseAdmissionRows(rows);
      if (!admissionRows) { showToast('열 이름을 확인해주세요: "대학교", "수능최저 반영 과목수", "수능최저 합"', "error"); setBusy(false); return; }
      setPreview(admissionRows);
      showToast(`${admissionRows.length}건을 인식했습니다. 아래에서 확인 후 "반영하기"를 눌러주세요.`, "success");
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
        <div style={{ fontSize: 12, color: "#8a8578", margin: "6px 0 12px", textAlign: "center" }}>"2028 대입 전형" 시트를 그대로 올려주세요. 열 이름 중 "대학교","수능최저 반영 과목수","수능최저 합"이 필요합니다.</div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
        <button style={btn.primary} onClick={() => fileRef.current.click()} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} 파일 선택</button>
      </div>
      {preview && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: "#3d5c3a" }}>{preview.length}건 인식됨 (아직 저장되지 않았습니다)</div>
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
