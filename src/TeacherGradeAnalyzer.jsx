import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  CircleAlert,
  Download,
  FileSpreadsheet,
  Database,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Search,
  Trash2,
  PieChart,
  Settings2,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";

const FONT_STACK = '"Pretendard", "SUIT", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const GRADE_CUMULATIVE = {
  5: [10, 34, 66, 90, 100],
  9: [4, 11, 23, 40, 60, 77, 89, 96, 100],
};
const FIXED_COMMON_CUTS = { ab: 90, bc: 80, cd: 70, de: 60, ei: 40 };
const FIXED_ELECTIVE_CUTS = { ab: 90, bc: 80, cd: 70, de: 60, ei: null };

function roundTo(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}
function asNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}
function text(value) { return String(value ?? "").trim(); }
function pad2(value) { return String(Number(value)).padStart(2, "0"); }
function normalizeToken(value) {
  return text(value).toLowerCase().replace(/[^0-9a-z가-힣]+/gi, "");
}
function stripSubject(value) {
  return text(value)
    .replace(/^.*?:/, "")
    .replace(/\(\s*\d+\s*\)\s*$/, "")
    .trim();
}
function parseYearSemesterGrade(rows) {
  const head = rows.slice(0, 9).flat().map(text).filter(Boolean).join(" ");
  const year = Number(head.match(/(20\d{2})\s*학년도/)?.[1]) || null;
  const semester = Number(head.match(/([12])\s*학기/)?.[1]) || null;
  const grade = Number(head.match(/([123])\s*학년/)?.[1]) || null;
  return { year, semester, grade, head };
}
function parseWrittenWorkbook(XLSX, workbook, fileName = "") {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const { year, semester, grade, head } = parseYearSemesterGrade(rows);
  const detail = rows.slice(0, 8).flat().map(text).find(value => /고사\s*:/.test(value) && /교과목\s*:/.test(value)) || head;
  const title = text(detail.match(/고사\s*:\s*(.+?)\s*교과목\s*:/)?.[1]) || text(fileName).replace(/\.xlsx?$/i, "") || "지필평가";
  const subject = stripSubject(detail.match(/교과목\s*:\s*(.+?)\s*만점\s*:/)?.[1] || "");
  const maxScore = asNumber(detail.match(/만점\s*:\s*([\d.]+)/)?.[1]) ?? 100;
  const headerIndex = rows.findIndex(row => row?.some(cell => normalizeToken(cell) === "반번호"));
  if (headerIndex < 0) throw new Error("지필평가의 '반번호' 표를 찾지 못했습니다.");
  const header = rows[headerIndex];
  const classColumns = [];
  for (let column = 1; column < header.length; column += 1) {
    const classNumber = asNumber(header[column]);
    if (classNumber == null) continue;
    classColumns.push({ column, classNumber: Number(classNumber) });
  }
  if (!classColumns.length) throw new Error("지필평가 반 정보를 읽지 못했습니다.");
  const students = {};
  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const number = asNumber(row[0]);
    if (number == null || number < 1 || number > 99) continue;
    classColumns.forEach(({ column, classNumber }) => {
      const raw = row[column];
      if (raw == null || text(raw) === "") return;
      const score = asNumber(raw);
      const status = score == null ? text(raw) : "";
      const sid = grade ? `${grade}${pad2(classNumber)}${pad2(number)}` : `${pad2(classNumber)}${pad2(number)}`;
      students[sid] = {
        sid,
        classNumber,
        number: Number(number),
        score,
        status,
      };
    });
  }
  if (!Object.keys(students).length) throw new Error("지필평가 학생 점수를 읽지 못했습니다.");
  const id = `written:${year || "year"}:${semester || "sem"}:${grade || "grade"}:${normalizeToken(subject)}:${normalizeToken(title)}`;
  return {
    id,
    kind: "written",
    fileName,
    title,
    subject: subject || "과목 미상",
    year,
    semester,
    grade,
    maxScore,
    weight: 25,
    students,
    uploadedAt: new Date().toISOString(),
  };
}
function parsePerformanceAreaHeader(value, index) {
  const raw = text(value);
  const match = raw.match(/^(.*?)\(\s*만점\s*([\d.]+)\s*,\s*([\d.]+)\s*%\s*\)\s*$/);
  if (match) {
    return { id: `area-${index}`, name: text(match[1]) || `수행 영역 ${index + 1}`, maxScore: Number(match[2]), weight: Number(match[3]), order: index };
  }
  return { id: `area-${index}`, name: raw || `수행 영역 ${index + 1}`, maxScore: 100, weight: 0, order: index };
}
function parsePerformanceWorkbook(XLSX, workbook, fileName = "") {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const { year, semester, grade, head } = parseYearSemesterGrade(rows);
  const subjectLine = rows.slice(0, 8).flat().map(text).find(value => /교과목\s*:/.test(value)) || head;
  const subject = stripSubject(subjectLine.match(/교과목\s*:\s*(.+)$/)?.[1] || "");
  const headerIndex = rows.findIndex(row => row?.some(cell => normalizeToken(cell) === "반번호") && row?.some(cell => normalizeToken(cell) === "성명"));
  if (headerIndex < 0) throw new Error("수행평가의 '반/번호·성명' 표를 찾지 못했습니다.");
  const header = rows[headerIndex];
  const totalColumn = header.findIndex(cell => normalizeToken(cell) === "합계");
  if (totalColumn < 4) throw new Error("수행평가 합계 열을 찾지 못했습니다.");
  const areas = [];
  for (let column = 3; column < totalColumn; column += 1) areas.push({ ...parsePerformanceAreaHeader(header[column], areas.length), column });
  const students = {};
  const classSet = new Set();
  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] || [];
    const classNumberText = text(row[0]);
    const match = classNumberText.match(/(\d+)\s*\/\s*(\d+)/);
    if (!match) continue;
    const classNumber = Number(match[1]);
    const number = Number(match[2]);
    classSet.add(classNumber);
    const sid = grade ? `${grade}${pad2(classNumber)}${pad2(number)}` : `${pad2(classNumber)}${pad2(number)}`;
    const scores = {};
    areas.forEach(area => { scores[area.id] = asNumber(row[area.column]); });
    students[sid] = {
      sid,
      classNumber,
      number,
      neisId: text(row[1]),
      name: text(row[2]),
      scores,
      total: asNumber(row[totalColumn]),
      note: text(row[totalColumn + 1]),
    };
  }
  if (!Object.keys(students).length) throw new Error("수행평가 학생 점수를 읽지 못했습니다.");
  const classes = Array.from(classSet).sort((a, b) => a - b);
  const classToken = classes.join("-") || "class";
  const id = `performance:${year || "year"}:${semester || "sem"}:${grade || "grade"}:${normalizeToken(subject)}:${classToken}`;
  return {
    id,
    kind: "performance",
    fileName,
    subject: subject || "과목 미상",
    year,
    semester,
    grade,
    classes,
    areas: areas.map(({ column, ...area }) => area),
    students,
    uploadedAt: new Date().toISOString(),
  };
}
function contextKey(item) {
  return [item?.year, item?.semester, item?.grade, normalizeToken(item?.subject)].join(":");
}
function writtenOrder(item) {
  const title = text(item?.title);
  const direct = Number(title.match(/(\d+)\s*차/)?.[1]);
  if (direct) return direct;
  return 99;
}
function gradeFromPercentile(percentile, system) {
  const thresholds = GRADE_CUMULATIVE[Number(system)] || GRADE_CUMULATIVE[5];
  const index = thresholds.findIndex(limit => percentile <= limit + 1e-9);
  return index < 0 ? thresholds.length : index + 1;
}
function gradeQuotaCumulative(total, system) {
  const thresholds = GRADE_CUMULATIVE[Number(system)] || GRADE_CUMULATIVE[5];
  return thresholds.map(percent => Math.round((Number(total) || 0) * percent / 100));
}
function assignQuotaGrades(rows, system) {
  const quotas = gradeQuotaCumulative(rows.length, system);
  rows.forEach(row => {
    const groupEnd = Number(row.rank || 0) + Math.max(1, Number(row.tieCount || 1)) - 1;
    const index = quotas.findIndex(limit => groupEnd <= limit);
    row.grade = index < 0 ? quotas.length : index + 1;
    row.percentile = rows.length ? (Number(row.midRank || row.rank || 0) / rows.length) * 100 : null;
  });
  return quotas;
}
function achievementFromScore(score, courseType, mode, manualCuts) {
  if (!Number.isFinite(score)) return "-";
  const cuts = mode === "manual"
    ? manualCuts
    : (courseType === "elective" ? FIXED_ELECTIVE_CUTS : FIXED_COMMON_CUTS);
  const ab = asNumber(cuts.ab), bc = asNumber(cuts.bc), cd = asNumber(cuts.cd), de = asNumber(cuts.de), ei = asNumber(cuts.ei);
  if (ab != null && score >= ab) return "A";
  if (bc != null && score >= bc) return "B";
  if (cd != null && score >= cd) return "C";
  if (de != null && score >= de) return "D";
  if (courseType === "common" && ei != null) return score >= ei ? "E" : "미도달";
  return "E";
}
function numberOrLow(value) { return Number.isFinite(Number(value)) ? Number(value) : -Infinity; }
function compareVectors(a, b) {
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const av = numberOrLow(a[index]);
    const bv = numberOrLow(b[index]);
    if (Math.abs(av - bv) > 1e-9) return bv - av;
  }
  return 0;
}
function vectorKey(vector) { return vector.map(value => Number.isFinite(Number(value)) ? Number(value).toFixed(4) : "-").join("|"); }
function assessmentStats(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return { count: 0, average: null, max: null, min: null };
  return {
    count: clean.length,
    average: roundTo(clean.reduce((sum, value) => sum + value, 0) / clean.length, 1),
    max: Math.max(...clean),
    min: Math.min(...clean),
  };
}
function defaultWorkspace() {
  return {
    written: [],
    performance: [],
    settings: {
      gradeSystem: 5,
      courseType: "common",
      achievementMode: "fixed",
      manualCuts: { ...FIXED_COMMON_CUTS },
      tieItemCount: 3,
      plannedWritten: [],
      plannedPerformance: [],
      workspaceMeta: { year: new Date().getFullYear(), semester: 1, grade: null, subject: "" },
    },
    tieScores: {},
    studentOverrides: {},
  };
}
function normalizeWorkspaceSnapshot(parsed = {}) {
  return {
    ...defaultWorkspace(),
    ...parsed,
    settings: {
      ...defaultWorkspace().settings,
      ...(parsed.settings || {}),
      manualCuts: { ...FIXED_COMMON_CUTS, ...(parsed.settings?.manualCuts || {}) },
      plannedWritten: Array.isArray(parsed.settings?.plannedWritten) ? parsed.settings.plannedWritten : [],
      plannedPerformance: Array.isArray(parsed.settings?.plannedPerformance) ? parsed.settings.plannedPerformance : [],
      workspaceMeta: { ...defaultWorkspace().settings.workspaceMeta, ...(parsed.settings?.workspaceMeta || {}) },
    },
    written: Array.isArray(parsed.written) ? parsed.written : [],
    performance: Array.isArray(parsed.performance) ? parsed.performance : [],
    tieScores: parsed.tieScores || {},
    studentOverrides: parsed.studentOverrides || {},
  };
}
function workspaceIdFromContext(item, fallbackGrade = "") {
  if (!item) return "";
  return `${item.year || "year"}-${item.semester || "sem"}-${item.grade || fallbackGrade || "grade"}-${normalizeToken(item.subject || "subject")}`;
}
function safeLoadWorkspaceStore(key, legacyKey, fallbackGrade) {
  const empty = { activeId: "", workspaces: {} };
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      const workspaces = Object.fromEntries(Object.entries(parsed?.workspaces || {}).map(([id, value]) => [id, normalizeWorkspaceSnapshot(value)]));
      const activeId = workspaces[parsed?.activeId] ? parsed.activeId : (Object.keys(workspaces)[0] || "");
      return { activeId, workspaces };
    }
    const legacyRaw = localStorage.getItem(legacyKey);
    if (!legacyRaw) return empty;
    const legacy = normalizeWorkspaceSnapshot(JSON.parse(legacyRaw));
    const context = legacy.written[0] || legacy.performance[0] || null;
    const id = workspaceIdFromContext(context, fallbackGrade);
    if (!id) return empty;
    return { activeId: id, workspaces: { [id]: { ...legacy, id, subject: context?.subject, year: context?.year, semester: context?.semester, grade: context?.grade || Number(fallbackGrade), updatedAt: new Date().toISOString() } } };
  } catch { return empty; }
}
function formatScore(value, digits = 1) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : "-";
}
function ratioLabel(count, total) { return total ? `${count}명 · ${((count / total) * 100).toFixed(1)}%` : "0명"; }
function normalizeSubjectName(value) { return normalizeToken(value).replace(/과목$/g, ""); }
function teacherSubjectAssignments(teacher) {
  const raw = [
    ...(Array.isArray(teacher?.assignments) ? teacher.assignments : []),
    ...(Array.isArray(teacher?.subjects) ? teacher.subjects.map(subject => typeof subject === "string" ? { subject, targets: "전체" } : subject) : []),
    ...(Array.isArray(teacher?.subjectPermissions) ? teacher.subjectPermissions.map(subject => typeof subject === "string" ? { subject, targets: "전체" } : subject) : []),
  ];
  return raw
    .map(item => typeof item === "string" ? { subject: item, targets: "전체" } : item)
    .map(item => ({ ...item, subject: text(item?.subject || item?.name || item?.course), targets: text(item?.targets || item?.classes || "전체") || "전체", token: normalizeSubjectName(item?.subject || item?.name || item?.course) }))
    .filter(item => item.token);
}
function teacherHandlesSubject(teacher, subject) {
  const token = normalizeSubjectName(subject);
  if (!token) return false;
  return teacherSubjectAssignments(teacher).some(item => item.token === token || item.token.includes(token) || token.includes(item.token));
}
function compactMissingLabels(values = []) {
  const list = values.filter(Boolean);
  if (!list.length) return [];
  const written = list.filter(value => /정기|지필|고사|시험/.test(value));
  const performance = list.filter(value => !written.includes(value));
  return [
    ...written.slice(0, 2),
    ...(written.length > 2 ? [`지필 ${written.length - 2}건 추가`] : []),
    ...(performance.length ? [`수행 ${performance.length}개 미입력`] : []),
  ];
}
function defaultMinimumSettings(settings, totalWeight = 0) {
  const stored = settings?.minimumAchievement || {};
  const planned = Array.isArray(settings?.plannedWritten) ? settings.plannedWritten[0] : null;
  return {
    nextExamLabel: stored.nextExamLabel || planned?.title || "다음 정기시험",
    nextExamWeight: asNumber(stored.nextExamWeight) ?? asNumber(planned?.weight) ?? Math.max(0, roundTo(100 - totalWeight, 2) || 0),
    nextExamMax: asNumber(stored.nextExamMax) ?? asNumber(planned?.maxScore) ?? 100,
  };
}

export default function TeacherGradeAnalyzer({ teacher, teacherAccounts = [], roster = {}, grade = "2", semester = "sem1", showToast, db = {}, persist, accessRole = "teacher", homeroomClass = "", canViewAllSubjects = false }) {
  const storageKey = `kd_teacher_grade_workspace_v2_${teacher?.id || "shared"}_${grade}`;
  const legacyStorageKey = `kd_teacher_grade_workspace_v1_${teacher?.id || "shared"}_${grade}`;
  const initialRef = useRef(null);
  if (!initialRef.current) initialRef.current = safeLoadWorkspaceStore(storageKey, legacyStorageKey, grade);
  const initialSnapshot = initialRef.current.workspaces[initialRef.current.activeId] || defaultWorkspace();
  const [localWorkspaces, setLocalWorkspaces] = useState(initialRef.current.workspaces);
  const [selectedLocalId, setSelectedLocalId] = useState(initialRef.current.activeId || "");
  const [written, setWritten] = useState(initialSnapshot.written);
  const [performance, setPerformance] = useState(initialSnapshot.performance);
  const [settings, setSettings] = useState(initialSnapshot.settings);
  const [tieScores, setTieScores] = useState(initialSnapshot.tieScores);
  const [studentOverrides, setStudentOverrides] = useState(initialSnapshot.studentOverrides || {});
  const [studentEditor, setStudentEditor] = useState(null);
  const [activeView, setActiveView] = useState("combined");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState(homeroomClass ? String(homeroomClass) : "all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [minimumFilter, setMinimumFilter] = useState("all");
  const [selectedSharedId, setSelectedSharedId] = useState("");
  const [uploadMessages, setUploadMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [criteriaSaving, setCriteriaSaving] = useState(false);
  const [panelMode, setPanelMode] = useState("analysis");
  const [dataSubjectFilter, setDataSubjectFilter] = useState("all");
  const [dataClassFilter, setDataClassFilter] = useState("all");
  const writtenInputRef = useRef(null);
  const performanceInputRef = useRef(null);

  const assignedSubjects = useMemo(() => teacherSubjectAssignments(teacher), [teacher]);
  const editableSubjectNames = useMemo(() => Array.from(new Set(assignedSubjects.map(item => text(item.subject)).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko")), [assignedSubjects]);
  const allKnownSubjectNames = useMemo(() => Array.from(new Set((teacherAccounts || []).flatMap(account => teacherSubjectAssignments(account).map(item => text(item.subject))).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ko")), [teacherAccounts]);
  const [draftSubject, setDraftSubject] = useState(() => initialSnapshot?.settings?.workspaceMeta?.subject || editableSubjectNames[0] || "");
  useEffect(() => {
    if (accessRole !== "teacher") return;
    if (!editableSubjectNames.length) { setDraftSubject(""); return; }
    if (!editableSubjectNames.some(subject => normalizeSubjectName(subject) === normalizeSubjectName(draftSubject))) setDraftSubject(editableSubjectNames[0]);
  }, [accessRole, editableSubjectNames, draftSubject]);
  const canCreateWorkspace = accessRole === "admin" || (accessRole === "teacher" && editableSubjectNames.length > 0);
  const canStartSelectedSubject = canCreateWorkspace && (accessRole !== "admin" || !!text(draftSubject));
  const canEditSubject = subject => accessRole === "admin" || (accessRole === "teacher" && teacherHandlesSubject(teacher, subject));
  const sharedWorkspaces = useMemo(() => Object.values(db?.teacherGradeWorkspaces || {})
    .filter(item => String(item?.grade || "") === String(grade))
    .filter(item => canViewAllSubjects || item?.ownerId === teacher?.id || teacherHandlesSubject(teacher, item?.subject))
    .sort((a, b) => String(a?.subject || "").localeCompare(String(b?.subject || ""), "ko") || String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || ""))), [db?.teacherGradeWorkspaces, grade, canViewAllSubjects, teacher]);
  const selectedShared = sharedWorkspaces.find(item => item.id === selectedSharedId) || null;

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ activeId: selectedLocalId, workspaces: localWorkspaces })); } catch { /* browser storage unavailable */ }
  }, [storageKey, selectedLocalId, localWorkspaces]);

  useEffect(() => {
    setSettings(current => {
      const nextMeta = {
        ...(current.workspaceMeta || {}),
        year: asNumber(current.workspaceMeta?.year) || new Date().getFullYear(),
        semester: asNumber(current.workspaceMeta?.semester) || (semester === "sem2" ? 2 : 1),
        grade: Number(grade),
        subject: draftSubject || current.workspaceMeta?.subject || "",
      };
      return JSON.stringify(nextMeta) === JSON.stringify(current.workspaceMeta || {}) ? current : { ...current, workspaceMeta: nextMeta };
    });
  }, [draftSubject, grade, semester]);

  useEffect(() => {
    if (!selectedLocalId || !localWorkspaces[selectedLocalId]) return;
    const saveContext = written[0] || performance[0] || (draftSubject ? {
      year: asNumber(settings.workspaceMeta?.year) || new Date().getFullYear(),
      semester: asNumber(settings.workspaceMeta?.semester) || (semester === "sem2" ? 2 : 1),
      grade: asNumber(settings.workspaceMeta?.grade) || Number(grade),
      subject: draftSubject,
    } : null);
    setLocalWorkspaces(current => ({
      ...current,
      [selectedLocalId]: {
        ...current[selectedLocalId],
        id: selectedLocalId,
        subject: saveContext?.subject || current[selectedLocalId]?.subject,
        year: saveContext?.year || current[selectedLocalId]?.year,
        semester: saveContext?.semester || current[selectedLocalId]?.semester,
        grade: saveContext?.grade || current[selectedLocalId]?.grade || Number(grade),
        written,
        performance,
        settings,
        tieScores,
        studentOverrides,
        updatedAt: new Date().toISOString(),
      },
    }));
  }, [selectedLocalId, written, performance, settings, tieScores, studentOverrides, draftSubject, semester, grade]);

  const sortedWritten = useMemo(() => [...written].sort((a, b) => writtenOrder(a) - writtenOrder(b) || text(a.title).localeCompare(text(b.title), "ko")), [written]);
  const uploadedAreas = useMemo(() => performance[0]?.areas || [], [performance]);
  const plannedPerformance = useMemo(() => Array.isArray(settings.plannedPerformance) ? settings.plannedPerformance : [], [settings.plannedPerformance]);
  const canonicalAreas = uploadedAreas.length ? uploadedAreas : plannedPerformance;
  const currentSemesterNumber = semester === "sem2" ? 2 : 1;
  const manualContext = draftSubject ? {
    year: asNumber(settings.workspaceMeta?.year) || new Date().getFullYear(),
    semester: asNumber(settings.workspaceMeta?.semester) || currentSemesterNumber,
    grade: asNumber(settings.workspaceMeta?.grade) || Number(grade),
    subject: draftSubject,
  } : null;
  const context = written[0] || performance[0] || manualContext;
  const workspaceId = workspaceIdFromContext(context, grade);
  const canEditCurrentSubject = context ? canEditSubject(context.subject) : canCreateWorkspace;
  const readOnlyWorkspace = !canEditCurrentSubject;
  const plannedWritten = useMemo(() => Array.isArray(settings.plannedWritten) ? settings.plannedWritten : [], [settings.plannedWritten]);
  const subjectCollaborators = useMemo(() => {
    if (!context?.subject) return [];
    return (teacherAccounts || []).filter(account => teacherHandlesSubject(account, context.subject));
  }, [teacherAccounts, context?.subject]);
  const localWorkspaceList = useMemo(() => Object.values(localWorkspaces || {})
    .sort((a, b) => String(a?.subject || "").localeCompare(String(b?.subject || ""), "ko") || String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || ""))), [localWorkspaces]);
  const workspaceSelection = selectedLocalId ? `local:${selectedLocalId}` : selectedSharedId ? `shared:${selectedSharedId}` : "";
  const currentSnapshot = () => {
    const existing = db?.teacherGradeWorkspaces?.[workspaceId] || selectedShared || null;
    return {
      id: workspaceId,
      ownerId: existing?.ownerId || teacher?.id || accessRole,
      ownerName: existing?.ownerName || teacher?.name || "담당 교사",
      editorIds: subjectCollaborators.map(item => item.id).filter(Boolean),
      editorNames: subjectCollaborators.map(item => item.name).filter(Boolean),
      lastEditedBy: teacher?.id || accessRole,
      lastEditedName: teacher?.name || "담당 교사",
      year: context?.year,
      semester: context?.semester,
      grade: context?.grade || Number(grade),
      subject: context?.subject,
      written,
      performance,
      settings,
      tieScores,
      studentOverrides,
      updatedAt: new Date().toISOString(),
    };
  };
  const saveLocalWorkspace = () => {
    if (!context || !workspaceId) { showToast?.("담당 과목을 먼저 선택해주세요.", "error"); return; }
    if (!canEditCurrentSubject) { showToast?.("이 과목 담당 교사만 성적 산출 자료를 저장할 수 있습니다.", "error"); return; }
    const snapshot = currentSnapshot();
    setLocalWorkspaces(current => ({ ...current, [workspaceId]: snapshot }));
    setSelectedLocalId(workspaceId);
    setSelectedSharedId("");
    showToast?.(`${context.subject} 개인 임시본을 저장했습니다.`, "success");
  };
  const publishWorkspace = async () => {
    if (!context || !workspaceId) { showToast?.("담당 과목을 먼저 선택해주세요.", "error"); return; }
    if (!canEditCurrentSubject) { showToast?.("해당 과목 담당 교사만 학교 공동 작업 화면을 수정·반영할 수 있습니다.", "error"); return; }
    const snapshot = currentSnapshot();
    setLocalWorkspaces(current => ({ ...current, [workspaceId]: snapshot }));
    setSelectedLocalId(workspaceId);
    const next = { ...(db?.teacherGradeWorkspaces || {}), [workspaceId]: snapshot };
    const ok = await persist?.({ teacherGradeWorkspaces: next });
    if (ok !== false) { setSelectedSharedId(workspaceId); setSelectedLocalId(""); showToast?.(`${context.subject} 자료를 학교 공동 저장본으로 반영했습니다.`, "success"); }
  };
  const saveCriteriaSettings = async () => {
    if (!context || !workspaceId) { showToast?.("담당 과목을 먼저 선택해주세요.", "error"); return; }
    if (!canEditCurrentSubject) { showToast?.("이 과목 담당 교사만 산출 기준을 저장할 수 있습니다.", "error"); return; }
    setCriteriaSaving(true);
    try {
      const snapshot = currentSnapshot();
      setLocalWorkspaces(current => ({ ...current, [workspaceId]: snapshot }));
      setSelectedLocalId(workspaceId);
      const alreadyShared = !!(db?.teacherGradeWorkspaces?.[workspaceId] || selectedSharedId);
      if (alreadyShared && persist) {
        const next = { ...(db?.teacherGradeWorkspaces || {}), [workspaceId]: snapshot };
        const ok = await persist({ teacherGradeWorkspaces: next });
        if (ok === false) return;
      }
      showToast?.(`${context.subject} 산출 기준을 저장했습니다.`, "success");
    } finally {
      setCriteriaSaving(false);
    }
  };
  const applyWorkspace = item => {
    const normalized = normalizeWorkspaceSnapshot(item);
    if (item?.subject) setDraftSubject(item.subject);
    setWritten(normalized.written);
    setPerformance(normalized.performance);
    setSettings(normalized.settings);
    setTieScores(normalized.tieScores);
    setStudentOverrides(normalized.studentOverrides || {});
    setStudentEditor(null);
    setActiveView((normalized.written || []).slice().sort((a, b) => writtenOrder(a) - writtenOrder(b))[0]?.id || "combined");
    setClassFilter(homeroomClass ? String(homeroomClass) : "all");
    setGradeFilter("all");
    setMinimumFilter("all");
    setSearch("");
    setUploadMessages([]);
  };
  const loadWorkspaceSelection = value => {
    if (!value) { startNewWorkspace(); return; }
    const [source, ...idParts] = value.split(":");
    const id = idParts.join(":");
    if (source === "local") {
      const item = localWorkspaces[id];
      if (!item) return;
      setSelectedLocalId(id);
      setSelectedSharedId("");
      applyWorkspace(item);
      return;
    }
    const item = sharedWorkspaces.find(entry => entry.id === id);
    if (!item) return;
    setSelectedSharedId(id);
    setSelectedLocalId("");
    applyWorkspace(item);
  };
  const startNewWorkspace = subjectOverride => {
    const fresh = defaultWorkspace();
    const requested = text(subjectOverride);
    const nextSubject = requested || (accessRole === "teacher"
      ? (editableSubjectNames.some(subject => normalizeSubjectName(subject) === normalizeSubjectName(draftSubject)) ? draftSubject : editableSubjectNames[0] || "")
      : draftSubject);
    setDraftSubject(nextSubject);
    fresh.settings.workspaceMeta = {
      year: new Date().getFullYear(),
      semester: semester === "sem2" ? 2 : 1,
      grade: Number(grade),
      subject: nextSubject,
    };
    setSelectedLocalId(""); setSelectedSharedId(""); setWritten([]); setPerformance([]); setSettings(fresh.settings); setTieScores({}); setStudentOverrides({}); setStudentEditor(null);
    setActiveView("combined"); setClassFilter(homeroomClass ? String(homeroomClass) : "all"); setGradeFilter("all"); setMinimumFilter("all"); setSearch(""); setUploadMessages([]);
  };
  const deleteLocalWorkspace = () => {
    if (!selectedLocalId || !localWorkspaces[selectedLocalId]) return;
    const item = localWorkspaces[selectedLocalId];
    if (!window.confirm(`${item.subject || "이 과목"}의 개인 임시본을 삭제할까요? 학교 공동 저장본은 삭제되지 않습니다.`)) return;
    setLocalWorkspaces(current => { const next = { ...current }; delete next[selectedLocalId]; return next; });
    startNewWorkspace();
    showToast?.("개인 임시본을 삭제했습니다.", "success");
  };
  const weightTotal = useMemo(() => {
    const uploadedWritten = sortedWritten.reduce((sum, item) => sum + (asNumber(item.weight) || 0), 0);
    const planned = plannedWritten.reduce((sum, item) => sum + (asNumber(item.weight) || 0), 0);
    const performanceWeight = canonicalAreas.reduce((sum, area) => sum + (asNumber(area.weight) || 0), 0);
    return {
      uploadedWritten: roundTo(uploadedWritten, 2),
      plannedWritten: roundTo(planned, 2),
      written: roundTo(uploadedWritten + planned, 2),
      performance: roundTo(performanceWeight, 2),
      total: roundTo(uploadedWritten + planned + performanceWeight, 2),
    };
  }, [sortedWritten, plannedWritten, canonicalAreas]);

  const updateWrittenWeight = (id, value) => setWritten(current => current.map(item => item.id === id ? { ...item, weight: asNumber(value) ?? 0 } : item));
  const addPlannedWritten = () => setSettings(current => {
    const list = Array.isArray(current.plannedWritten) ? current.plannedWritten : [];
    const usedOrders = new Set([...sortedWritten.map(writtenOrder), ...list.map(item => Number(item.order) || 99)]);
    let order = 1;
    while (usedOrders.has(order)) order += 1;
    const item = { id: `planned-${Date.now()}`, title: `${order}차 정기시험`, order, maxScore: 100, weight: Math.max(0, roundTo(100 - weightTotal.total, 2) || 0) };
    return {
      ...current,
      plannedWritten: [...list, item],
      minimumAchievement: list.length ? current.minimumAchievement : { ...(current.minimumAchievement || {}), nextExamLabel: item.title, nextExamWeight: item.weight, nextExamMax: item.maxScore },
    };
  });
  const updatePlannedWritten = (id, patch) => setSettings(current => {
    const list = (Array.isArray(current.plannedWritten) ? current.plannedWritten : []).map(item => item.id === id ? { ...item, ...patch } : item);
    const first = list[0];
    return {
      ...current,
      plannedWritten: list,
      minimumAchievement: first ? {
        ...(current.minimumAchievement || {}),
        nextExamLabel: first.title,
        nextExamWeight: first.weight,
        nextExamMax: first.maxScore,
      } : current.minimumAchievement,
    };
  });
  const removePlannedWritten = id => setSettings(current => {
    const list = (Array.isArray(current.plannedWritten) ? current.plannedWritten : []).filter(item => item.id !== id);
    const first = list[0];
    return {
      ...current,
      plannedWritten: list,
      minimumAchievement: first ? {
        ...(current.minimumAchievement || {}),
        nextExamLabel: first.title,
        nextExamWeight: first.weight,
        nextExamMax: first.maxScore,
      } : { ...(current.minimumAchievement || {}), nextExamWeight: 0 },
    };
  });
  const updateMinimumPlanning = patch => setSettings(current => {
    const currentMinimum = defaultMinimumSettings(current, weightTotal.total);
    const nextMinimum = { ...currentMinimum, ...patch };
    const planned = Array.isArray(current.plannedWritten) ? [...current.plannedWritten] : [];
    if (planned[0]) planned[0] = {
      ...planned[0],
      ...(Object.prototype.hasOwnProperty.call(patch, "nextExamLabel") ? { title: patch.nextExamLabel } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "nextExamWeight") ? { weight: asNumber(patch.nextExamWeight) ?? 0 } : {}),
      ...(Object.prototype.hasOwnProperty.call(patch, "nextExamMax") ? { maxScore: asNumber(patch.nextExamMax) ?? 100 } : {}),
    };
    return { ...current, plannedWritten: planned, minimumAchievement: nextMinimum };
  });
  const removeWritten = id => { setWritten(current => current.filter(item => item.id !== id)); if (activeView === id) setActiveView("combined"); };
  const removePerformance = id => setPerformance(current => current.filter(item => item.id !== id));
  const addPlannedPerformance = () => setSettings(current => {
    const list = Array.isArray(current.plannedPerformance) ? current.plannedPerformance : [];
    const order = list.length;
    return {
      ...current,
      plannedPerformance: [...list, { id: `planned-area-${Date.now()}`, name: `수행평가 영역 ${order + 1}`, maxScore: 20, weight: 0, order }],
    };
  });
  const updatePlannedPerformance = (id, patch) => setSettings(current => ({
    ...current,
    plannedPerformance: (Array.isArray(current.plannedPerformance) ? current.plannedPerformance : []).map((area, index) => area.id === id ? { ...area, ...patch, order: index } : { ...area, order: index }),
  }));
  const removePlannedPerformance = id => setSettings(current => ({
    ...current,
    plannedPerformance: (Array.isArray(current.plannedPerformance) ? current.plannedPerformance : []).filter(area => area.id !== id).map((area, index) => ({ ...area, order: index })),
  }));
  const updateAreaWeight = (areaId, value) => {
    const next = asNumber(value) ?? 0;
    if (uploadedAreas.length) {
      setPerformance(current => current.map(file => ({ ...file, areas: file.areas.map(area => area.id === areaId ? { ...area, weight: next } : area) })));
    } else {
      updatePlannedPerformance(areaId, { weight: next });
    }
  };

  const addUploadMessage = message => setUploadMessages(current => [message, ...current].slice(0, 10));
  const parseFiles = async (files, kind) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const parsed = [];
      for (const file of Array.from(files)) {
        try {
          const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
          const item = kind === "written" ? parseWrittenWorkbook(XLSX, workbook, file.name) : parsePerformanceWorkbook(XLSX, workbook, file.name);
          parsed.push(item);
        } catch (error) {
          addUploadMessage({ type: "error", text: `${file.name}: ${error.message || error}` });
        }
      }
      if (!parsed.length) return;
      const unauthorized = parsed.find(item => !canEditSubject(item.subject));
      if (unauthorized) {
        addUploadMessage({ type: "error", text: `${unauthorized.subject}: 담당 과목으로 등록된 교사만 성적 파일을 올릴 수 있습니다.` });
        return;
      }
      if (accessRole === "teacher" && draftSubject) {
        const selectedToken = normalizeSubjectName(draftSubject);
        const mismatch = parsed.find(item => normalizeSubjectName(item.subject) !== selectedToken);
        if (mismatch) {
          addUploadMessage({ type: "error", text: `현재 담당과목은 ${draftSubject}입니다. ${mismatch.subject} 파일은 별도 과목 작업에서 올려주세요.` });
          return;
        }
      }
      const baseContext = contextKey(context || parsed[0]);
      const accepted = parsed.filter(item => {
        if (contextKey(item) !== baseContext) {
          addUploadMessage({ type: "error", text: `${item.fileName}: 현재 분석 과목·학년·학기와 다른 파일이라 제외했습니다.` });
          return false;
        }
        return true;
      });
      if (kind === "written") {
        const ids = new Set(written.map(item => item.id));
        const next = [...written];
        const messages = [];
        const matchedPlannedIds = new Set();
        accepted.forEach(item => {
          if (ids.has(item.id)) {
            messages.push({ type: "warn", text: `${item.fileName}: 같은 지필평가가 이미 등록되어 중복 저장하지 않았습니다.` });
            return;
          }
          const order = writtenOrder(item);
          const plannedMatch = plannedWritten.find(plan => !matchedPlannedIds.has(plan.id) && ((Number(plan.order) || 99) === order || normalizeToken(plan.title) === normalizeToken(item.title)));
          const existingCount = next.length;
          next.push({ ...item, weight: asNumber(plannedMatch?.weight) ?? (existingCount < 2 ? 25 : 0) });
          if (plannedMatch) matchedPlannedIds.add(plannedMatch.id);
          ids.add(item.id);
          messages.push({ type: "ok", text: `${item.title} · ${Object.values(item.students).filter(student => student.score != null).length}명 점수를 불러왔습니다.` });
        });
        setWritten(next);
        if (matchedPlannedIds.size) setSettings(current => {
          const remaining = (Array.isArray(current.plannedWritten) ? current.plannedWritten : []).filter(item => !matchedPlannedIds.has(item.id));
          const first = remaining[0];
          return {
            ...current,
            plannedWritten: remaining,
            minimumAchievement: first ? { ...(current.minimumAchievement || {}), nextExamLabel: first.title, nextExamWeight: first.weight, nextExamMax: first.maxScore } : { ...(current.minimumAchievement || {}), nextExamWeight: 0 },
          };
        });
        if (messages.length) setUploadMessages(current => [...messages.reverse(), ...current].slice(0, 10));
      } else {
        const occupiedClasses = new Set(performance.flatMap(item => item.classes.map(classNumber => `${contextKey(item)}:${classNumber}`)));
        const next = [...performance];
        const messages = [];
        let registeredPerformance = false;
        accepted.forEach(item => {
          const duplicateClasses = item.classes.filter(classNumber => occupiedClasses.has(`${contextKey(item)}:${classNumber}`));
          if (duplicateClasses.length) {
            messages.push({ type: "warn", text: `${item.fileName}: ${duplicateClasses.join(", ")}반 수행평가가 이미 등록되어 중복 저장하지 않았습니다.` });
            return;
          }
          if (next.length) {
            const baseAreas = next[0].areas.map(area => `${normalizeToken(area.name)}:${area.maxScore}`).join("|");
            const incomingAreas = item.areas.map(area => `${normalizeToken(area.name)}:${area.maxScore}`).join("|");
            if (baseAreas !== incomingAreas) {
              messages.push({ type: "error", text: `${item.fileName}: 다른 반과 수행평가 영역명 또는 만점이 달라 제외했습니다.` });
              return;
            }
            item.areas = item.areas.map((area, index) => ({ ...area, weight: next[0].areas[index]?.weight ?? area.weight }));
          } else if (plannedPerformance.length) {
            item.areas = item.areas.map((area, index) => ({
              ...area,
              weight: asNumber(plannedPerformance[index]?.weight) ?? area.weight,
            }));
          }
          next.push(item);
          registeredPerformance = true;
          item.classes.forEach(classNumber => occupiedClasses.add(`${contextKey(item)}:${classNumber}`));
          messages.push({ type: "ok", text: `${item.classes.join(", ")}반 수행평가 · ${Object.keys(item.students).length}명을 불러왔습니다.` });
        });
        setPerformance(next);
        if (registeredPerformance && plannedPerformance.length) {
          setSettings(current => ({ ...current, plannedPerformance: [] }));
        }
        if (messages.length) setUploadMessages(current => [...messages.reverse(), ...current].slice(0, 10));
      }
    } finally {
      setBusy(false);
      if (kind === "written" && writtenInputRef.current) writtenInputRef.current.value = "";
      if (kind === "performance" && performanceInputRef.current) performanceInputRef.current.value = "";
    }
  };

  const rosterNames = useMemo(() => {
    const map = {};
    Object.entries(roster || {}).forEach(([sid, info]) => { map[String(sid)] = info; });
    return map;
  }, [roster]);

  const combinedRows = useMemo(() => {
    const studentIds = new Set(Object.keys(studentOverrides || {}));
    sortedWritten.forEach(item => Object.keys(item.students || {}).forEach(sid => studentIds.add(sid)));
    performance.forEach(item => Object.keys(item.students || {}).forEach(sid => studentIds.add(sid)));
    const performanceStudentMap = {};
    performance.forEach(file => Object.entries(file.students || {}).forEach(([sid, student]) => { performanceStudentMap[sid] = student; }));
    const secondExam = sortedWritten.find(item => writtenOrder(item) === 2) || sortedWritten[1] || null;
    const firstExam = sortedWritten.find(item => writtenOrder(item) === 1) || sortedWritten[0] || null;
    const performanceOnly = weightTotal.written === 0 && Math.abs(weightTotal.performance - 100) < 1e-9;
    const hasOverrideValue = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
    const rows = Array.from(studentIds).map(sid => {
      const override = studentOverrides?.[sid] || {};
      const perfStudent = performanceStudentMap[sid];
      const info = rosterNames[sid] || {};
      const enrollmentStatus = override.enrollmentStatus || "active";
      const excluded = ["withdrawn", "transferred"].includes(enrollmentStatus);
      const writtenScores = {};
      let weightedWritten = 0;
      let completedWeight = 0;
      const currentMissing = [];
      sortedWritten.forEach(item => {
        const student = item.students?.[sid];
        const rawScore = hasOverrideValue(override.writtenScores, item.id) ? override.writtenScores[item.id] : student?.score;
        const score = asNumber(rawScore);
        writtenScores[item.id] = score;
        if (score == null) currentMissing.push(`${item.title}${student?.status && student.status !== "미입력" ? `(${student.status})` : ""}`);
        else { const itemWeight=asNumber(item.weight) || 0; weightedWritten += (score / (item.maxScore || 100)) * itemWeight; completedWeight += itemWeight; }
      });
      let weightedPerformance = 0;
      const areaScores = {};
      uploadedAreas.forEach(area => {
        const rawScore = hasOverrideValue(override.areaScores, area.id) ? override.areaScores[area.id] : perfStudent?.scores?.[area.id];
        const score = asNumber(rawScore);
        areaScores[area.id] = score;
        if (score == null) currentMissing.push(area.name);
        else { const areaWeight=asNumber(area.weight) || 0; weightedPerformance += (score / (area.maxScore || 100)) * areaWeight; completedWeight += areaWeight; }
      });
      const pendingAssessments = [
        ...plannedWritten.map(item => `${item.title || "미등록 정기시험"}(미등록)`),
        ...plannedPerformance.map(item => `${item.name || "수행평가 영역"}(미등록)`),
      ];
      const complete = !excluded && currentMissing.length === 0 && pendingAssessments.length === 0 && Math.abs(weightTotal.total - 100) < 1e-9;
      const convertedScore = complete ? roundTo(weightedWritten + weightedPerformance, 2) : null;
      const officialScore = convertedScore == null ? null : Math.round(convertedScore);
      const tie = tieScores[sid] || {};
      const baseVector = [
        convertedScore,
        roundTo(weightedWritten, 2),
        roundTo(weightedPerformance, 2),
        writtenScores[secondExam?.id],
        writtenScores[firstExam?.id],
        ...uploadedAreas.map(area => areaScores[area.id]),
      ];
      const secondTieItems = Array.from({ length: 3 }, (_, index) => asNumber(tie.secondItems?.[index]));
      const firstTieItems = Array.from({ length: 3 }, (_, index) => asNumber(tie.firstItems?.[index]));
      const preManualVector = performanceOnly ? baseVector : [...baseVector, ...secondTieItems, ...firstTieItems];
      const manualPriority = asNumber(tie.manualPriority);
      const fullVector = [...preManualVector, manualPriority == null ? null : 1000 - manualPriority];
      return {
        sid,
        name: override.name || perfStudent?.name || info.name || "",
        classNumber: asNumber(override.classNumber) || perfStudent?.classNumber || Number(sid.slice(1, 3)) || info.class || null,
        number: asNumber(override.number) || perfStudent?.number || Number(sid.slice(3, 5)) || info.number || null,
        neisId: override.neisId || perfStudent?.neisId || "",
        enrollmentStatus,
        excluded,
        writtenScores,
        areaScores,
        weightedWritten: roundTo(weightedWritten, 4),
        weightedPerformance: roundTo(weightedPerformance, 4),
        completedWeight: roundTo(completedWeight, 2),
        progressRate: completedWeight > 0 ? roundTo(((weightedWritten + weightedPerformance) / completedWeight) * 100, 1) : null,
        convertedScore,
        officialScore,
        complete,
        currentMissing,
        pendingAssessments,
        missing: excluded ? [enrollmentStatus === "withdrawn" ? "자퇴 처리" : "전출 처리"] : [...currentMissing, ...pendingAssessments],
        baseVector,
        preManualVector,
        manualPriority,
        fullVector,
      };
    });
    const completeRows = rows.filter(row => row.complete && !row.excluded).sort((a, b) => compareVectors(a.fullVector, b.fullVector) || a.sid.localeCompare(b.sid));
    let previousKey = null;
    let previousRank = 0;
    completeRows.forEach((row, index) => {
      const key = vectorKey(row.fullVector);
      if (key !== previousKey) previousRank = index + 1;
      row.rank = previousRank;
      previousKey = key;
    });
    const tieCounts = completeRows.reduce((map, row) => map.set(vectorKey(row.fullVector), (map.get(vectorKey(row.fullVector)) || 0) + 1), new Map());
    completeRows.forEach(row => {
      row.tieCount = tieCounts.get(vectorKey(row.fullVector)) || 1;
      row.midRank = row.rank + (row.tieCount - 1) / 2;
    });
    assignQuotaGrades(completeRows, settings.gradeSystem);
    completeRows.forEach(row => {
      row.achievement = achievementFromScore(settings.achievementMode === "fixed" ? row.officialScore : row.convertedScore, settings.courseType, settings.achievementMode, settings.manualCuts);
    });
    return [...completeRows, ...rows.filter(row => !row.complete || row.excluded).sort((a, b) => Number(a.excluded) - Number(b.excluded) || a.sid.localeCompare(b.sid))];
  }, [sortedWritten, performance, uploadedAreas, plannedWritten, plannedPerformance, weightTotal, tieScores, studentOverrides, rosterNames, settings.gradeSystem, settings.courseType, settings.achievementMode, settings.manualCuts]);

  const writtenCombinedRows = useMemo(() => {
    const studentIds = new Set(Object.keys(studentOverrides || {}));
    sortedWritten.forEach(item => Object.keys(item.students || {}).forEach(sid => studentIds.add(sid)));
    const secondExam = sortedWritten.find(item => writtenOrder(item) === 2) || sortedWritten[1] || null;
    const firstExam = sortedWritten.find(item => writtenOrder(item) === 1) || sortedWritten[0] || null;
    const hasOverrideValue = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
    const rows = Array.from(studentIds).map(sid => {
      const override = studentOverrides?.[sid] || {};
      const info = rosterNames[sid] || {};
      const enrollmentStatus = override.enrollmentStatus || "active";
      const excluded = ["withdrawn", "transferred"].includes(enrollmentStatus);
      const writtenScores = {};
      const missing = [];
      let converted = 0;
      sortedWritten.forEach(item => {
        const student = item.students?.[sid];
        const rawScore = hasOverrideValue(override.writtenScores, item.id) ? override.writtenScores[item.id] : student?.score;
        const score = asNumber(rawScore);
        writtenScores[item.id] = score;
        if (score == null) missing.push(`${item.title}${student?.status ? `(${student.status})` : ""}`);
        else converted += (score / (item.maxScore || 100)) * (asNumber(item.weight) || 0);
      });
      const complete = !excluded && sortedWritten.length > 0 && missing.length === 0 && weightTotal.written > 0;
      const score = complete ? roundTo((converted / weightTotal.written) * 100, 2) : null;
      const vector = [score, writtenScores[secondExam?.id], writtenScores[firstExam?.id]];
      return {
        sid,
        name: override.name || info.name || "",
        classNumber: asNumber(override.classNumber) || Number(sid.slice(1, 3)) || info.class || null,
        number: asNumber(override.number) || Number(sid.slice(3, 5)) || info.number || null,
        enrollmentStatus, excluded, writtenScores, score, complete,
        missing: excluded ? [enrollmentStatus === "withdrawn" ? "자퇴 처리" : "전출 처리"] : missing,
        vector,
      };
    });
    const completeRows = rows.filter(row => row.complete && !row.excluded).sort((a, b) => compareVectors(a.vector, b.vector) || a.sid.localeCompare(b.sid));
    let prior = null;
    let rank = 0;
    completeRows.forEach((row, index) => {
      const key = vectorKey(row.vector);
      if (key !== prior) rank = index + 1;
      row.rank = rank;
      prior = key;
    });
    const counts = completeRows.reduce((map, row) => map.set(vectorKey(row.vector), (map.get(vectorKey(row.vector)) || 0) + 1), new Map());
    completeRows.forEach(row => {
      row.tieCount = counts.get(vectorKey(row.vector)) || 1;
      row.midRank = row.rank + (row.tieCount - 1) / 2;
    });
    assignQuotaGrades(completeRows, settings.gradeSystem);
    return [...completeRows, ...rows.filter(row => !row.complete || row.excluded).sort((a, b) => Number(a.excluded) - Number(b.excluded) || a.sid.localeCompare(b.sid))];
  }, [sortedWritten, rosterNames, studentOverrides, weightTotal.written, settings.gradeSystem]);

  const writtenRowsById = useMemo(() => {
    const result = {};
    sortedWritten.forEach(item => {
      const ids = new Set([...Object.keys(item.students || {}), ...Object.keys(studentOverrides || {})]);
      const rows = Array.from(ids).map(sid => {
        const student = item.students?.[sid] || {};
        const info = rosterNames[sid] || {};
        const override = studentOverrides?.[sid] || {};
        const enrollmentStatus = override.enrollmentStatus || "active";
        const excluded = ["withdrawn", "transferred"].includes(enrollmentStatus);
        const hasValue = Object.prototype.hasOwnProperty.call(override.writtenScores || {}, item.id);
        const score = asNumber(hasValue ? override.writtenScores[item.id] : student.score);
        return {
          sid,
          name: override.name || info.name || student.name || "",
          classNumber: asNumber(override.classNumber) || student.classNumber || Number(sid.slice(1,3)) || info.class || null,
          number: asNumber(override.number) || student.number || Number(sid.slice(3,5)) || info.number || null,
          score,
          status: excluded ? (enrollmentStatus === "withdrawn" ? "자퇴" : "전출") : student.status,
          enrollmentStatus,
          excluded,
        };
      });
      rows.forEach(row => {
        const priority = asNumber(tieScores[row.sid]?.writtenPriorities?.[item.id]);
        row.manualPriority = priority;
        row.vector = [row.score, priority == null ? null : 1000 - priority];
      });
      const complete = rows.filter(row => Number.isFinite(row.score) && !row.excluded).sort((a, b) => compareVectors(a.vector, b.vector) || a.sid.localeCompare(b.sid));
      let priorKey = null;
      let rank = 0;
      complete.forEach((row, index) => {
        const key = vectorKey(row.vector);
        if (key !== priorKey) rank = index + 1;
        row.rank = rank;
        priorKey = key;
      });
      const counts = complete.reduce((map, row) => map.set(vectorKey(row.vector), (map.get(vectorKey(row.vector)) || 0) + 1), new Map());
      complete.forEach(row => {
        row.tieCount = counts.get(vectorKey(row.vector)) || 1;
        row.midRank = row.rank + (row.tieCount - 1) / 2;
      });
      assignQuotaGrades(complete, settings.gradeSystem);
      result[item.id] = [...complete, ...rows.filter(row => !Number.isFinite(row.score) || row.excluded).sort((a,b)=>Number(a.excluded)-Number(b.excluded)||a.sid.localeCompare(b.sid))];
    });
    return result;
  }, [sortedWritten, rosterNames, studentOverrides, settings.gradeSystem, tieScores]);

  const minimumSettings = useMemo(() => defaultMinimumSettings(settings, weightTotal.total), [settings, weightTotal.total]);
  const minimumRows = useMemo(() => {
    const attendance = db?.minimumAchievementAttendance?.[workspaceId] || {};
    return combinedRows.map(row => {
      if (row.excluded) return { ...row, attendanceStatus: "제외", attendanceNote: "", needed: null, academicStatus: "not-applicable", academicLabel: row.enrollmentStatus === "withdrawn" ? "자퇴 학생 · 학기말 인원 제외" : "전출 학생 · 학기말 인원 제외", minimumStatus: "not-applicable", minimumLabel: "산출 제외", compactMissing: [] };
      const attend = attendance[row.sid] || {};
      const attendanceStatus = attend.status || "확인필요";
      const nextWeight = Math.max(0, asNumber(minimumSettings.nextExamWeight) || 0);
      const nextMax = Math.max(1, asNumber(minimumSettings.nextExamMax) || 100);
      let needed = null;
      let academicStatus = "not-applicable";
      let academicLabel = "선택과목은 학업성취율 40% 기준을 적용하지 않음";
      if (settings.courseType === "common") {
        if (row.complete) {
          academicStatus = Number(row.officialScore) >= 40 ? "reached" : "fail";
          academicLabel = Number(row.officialScore) >= 40 ? `학업성취율 도달 · ${row.officialScore}점` : `학업성취율 미도달 · ${row.officialScore}점`;
        } else if (row.currentMissing?.length) {
          academicStatus = "check";
          academicLabel = "현재까지 실시한 평가의 미입력 점수를 먼저 확인해야 함";
        } else if (nextWeight > 0) {
          needed = roundTo(((40 - Number(row.weightedWritten || 0) - Number(row.weightedPerformance || 0)) / nextWeight) * nextMax, 1);
          if (needed <= 0) { academicStatus = "reached"; academicLabel = "현재 입력 점수만으로 40% 도달"; }
          else if (needed > nextMax) { academicStatus = "fail"; academicLabel = `${minimumSettings.nextExamLabel} 만점으로도 40% 도달 불가`; }
          else { academicStatus = "risk"; academicLabel = `${minimumSettings.nextExamLabel} ${needed}점 이상 필요`; }
        } else {
          academicStatus = "check"; academicLabel = "미입력 평가 또는 다음 시험 반영비율 확인 필요";
        }
      }
      let minimumStatus = "check";
      let minimumLabel = "확인 필요";
      if (attendanceStatus === "미도달") { minimumStatus = "fail"; minimumLabel = "출결 미도달"; }
      else if (settings.courseType === "common" && academicStatus === "fail") { minimumStatus = "fail"; minimumLabel = "최소성취수준 미도달"; }
      else if (settings.courseType === "common" && academicStatus === "risk") { minimumStatus = "risk"; minimumLabel = "최소성취수준 주의 대상자"; }
      else if (attendanceStatus === "도달" && (settings.courseType === "elective" || academicStatus === "reached")) { minimumStatus = "reached"; minimumLabel = "이수 기준 도달"; }
      return { ...row, attendanceStatus, attendanceNote: attend.note || "", needed, academicStatus, academicLabel, minimumStatus, minimumLabel, compactMissing: compactMissingLabels(row.missing) };
    });
  }, [combinedRows, db?.minimumAchievementAttendance, workspaceId, minimumSettings, settings.courseType]);

  const activeRows = activeView === "combined" ? combinedRows : activeView === "minimum" ? minimumRows : (writtenRowsById[activeView] || []);
  const filteredRows = useMemo(() => activeRows.filter(row => {
    if (classFilter !== "all" && String(row.classNumber) !== classFilter) return false;
    if (activeView === "minimum" ? (minimumFilter !== "all" && row.minimumStatus !== minimumFilter) : (gradeFilter !== "all" && String(row.grade || "") !== gradeFilter)) return false;
    const query = normalizeToken(search);
    if (!query) return true;
    return [row.sid, row.name, row.neisId].some(value => normalizeToken(value).includes(query));
  }), [activeRows, activeView, classFilter, gradeFilter, minimumFilter, search]);
  const eligibleActiveRows = activeRows.filter(row => !row.excluded);
  const completeActiveRows = eligibleActiveRows.filter(row => activeView === "combined" ? row.complete : activeView === "minimum" ? true : Number.isFinite(row.score));
  const classes = useMemo(() => Array.from(new Set(activeRows.map(row => row.classNumber).filter(Boolean))).sort((a, b) => a - b), [activeRows]);
  const activeStats = activeView === "combined"
    ? assessmentStats(completeActiveRows.map(row => row.convertedScore))
    : activeView === "minimum"
      ? assessmentStats(completeActiveRows.map(row => row.needed).filter(Number.isFinite))
      : assessmentStats(completeActiveRows.map(row => row.score));

  const gradeDistribution = useMemo(() => {
    const maxGrade = Number(settings.gradeSystem);
    const cumulative = gradeQuotaCumulative(completeActiveRows.length, settings.gradeSystem);
    return Array.from({ length: maxGrade }, (_, index) => {
      const gradeValue = index + 1;
      const rows = activeView === "minimum" ? [] : completeActiveRows.filter(row => row.grade === gradeValue);
      const previousLimit = index > 0 ? cumulative[index - 1] : 0;
      return {
        grade: gradeValue,
        count: rows.length,
        target: Math.max(0, (cumulative[index] || 0) - previousLimit),
        cumulativeTarget: cumulative[index] || 0,
        min: rows.length ? Math.min(...rows.map(row => activeView === "combined" ? row.convertedScore : row.score)) : null,
        max: rows.length ? Math.max(...rows.map(row => activeView === "combined" ? row.convertedScore : row.score)) : null,
      };
    });
  }, [completeActiveRows, settings.gradeSystem, activeView]);
  const achievementDistribution = useMemo(() => {
    const labels = settings.courseType === "common" ? ["A", "B", "C", "D", "E", "미도달"] : ["A", "B", "C", "D", "E"];
    return labels.map(label => ({ label, count: combinedRows.filter(row => row.complete && !row.excluded && row.achievement === label).length }));
  }, [combinedRows, settings.courseType]);
  const minimumSummary = useMemo(() => ({
    risk: minimumRows.filter(row => !row.excluded && row.minimumStatus === "risk").length,
    fail: minimumRows.filter(row => !row.excluded && row.minimumStatus === "fail").length,
    check: minimumRows.filter(row => !row.excluded && row.minimumStatus === "check").length,
    reached: minimumRows.filter(row => !row.excluded && row.minimumStatus === "reached").length,
  }), [minimumRows]);
  const unresolvedTieGroups = useMemo(() => {
    if (activeView !== "combined" || (weightTotal.written === 0 && Math.abs(weightTotal.performance - 100) < 1e-9)) return [];
    const groups = new Map();
    combinedRows.filter(row => row.complete && !row.excluded).forEach(row => {
      const key = vectorKey(row.baseVector);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    return Array.from(groups.values()).filter(rows => rows.length > 1).sort((a, b) => compareVectors(a[0].baseVector, b[0].baseVector));
  }, [combinedRows, activeView, weightTotal]);
  const selectedWrittenForTie = sortedWritten.find(item => item.id === activeView) || null;
  const writtenTieGroups = useMemo(() => {
    if (!selectedWrittenForTie) return [];
    const groups = new Map();
    (writtenRowsById[selectedWrittenForTie.id] || []).filter(row => Number.isFinite(row.score) && !row.excluded).forEach(row => {
      const key = Number(row.score).toFixed(6);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    return Array.from(groups.values()).filter(rows => rows.length > 1).sort((a, b) => Number(b[0].score) - Number(a[0].score));
  }, [selectedWrittenForTie, writtenRowsById]);

  const printMinimum = () => {
    document.body.classList.add("print-teacher-minimum");
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.body.classList.remove("print-teacher-minimum");
    };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(() => window.print(), 60);
    window.setTimeout(cleanup, 4000);
  };

  const resetWorkspace = () => {
    if (!window.confirm("현재 화면의 지필·수행 자료와 설정을 비울까요? 저장된 다른 과목 자료는 유지됩니다.")) return;
    startNewWorkspace();
    showToast?.("현재 성적 산출 화면을 초기화했습니다.", "success");
  };

  const exportWorkbook = async () => {
    if (!activeRows.length) { showToast?.("내보낼 성적 자료가 없습니다.", "error"); return; }
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const headers = activeView === "combined"
      ? ["학번", "성명", "반", "번호", ...sortedWritten.map(item => item.title), ...canonicalAreas.map(area => area.name), "수행 환산", "학기말 환산점수", "원점수", "석차", "동석차", "중간석차", "석차등급", "성취도", "학적 상태", "확인사항"]
      : activeView === "minimum"
        ? ["학번", "성명", "반", "번호", "과목 유형", "현재 환산", "입력 비율", "다음 시험 필요점수", "학업 상태", "과목 출결", "최성보 판정", "학적 상태", "확인사항"]
        : ["학번", "성명", "반", "번호", selectedWritten?.title || "지필 점수", "석차", "동석차", "중간석차", "석차등급", "학적 상태", "상태"];
    const data = activeRows.map(row => activeView === "combined"
      ? [row.sid, row.name, row.classNumber, row.number, ...sortedWritten.map(item => row.writtenScores[item.id]), ...canonicalAreas.map(area => row.areaScores[area.id]), row.weightedPerformance, row.convertedScore, row.officialScore, row.rank, row.tieCount, row.midRank, row.grade, row.achievement, row.enrollmentStatus === "withdrawn" ? "자퇴" : row.enrollmentStatus === "transferred" ? "전출" : "재학", row.missing.join(", ")]
      : activeView === "minimum"
        ? [row.sid, row.name, row.classNumber, row.number, settings.courseType === "common" ? "공통" : "선택", row.convertedScore, row.completedWeight, row.needed, row.academicLabel, row.attendanceStatus, row.minimumLabel, row.enrollmentStatus === "withdrawn" ? "자퇴" : row.enrollmentStatus === "transferred" ? "전출" : "재학", row.compactMissing.join(", ")]
        : [row.sid, row.name, row.classNumber, row.number, row.score, row.rank, row.tieCount, row.midRank, row.grade, row.enrollmentStatus === "withdrawn" ? "자퇴" : row.enrollmentStatus === "transferred" ? "전출" : "재학", row.status]);
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
    XLSX.utils.book_append_sheet(workbook, sheet, activeView === "combined" ? "학기말 성적" : activeView === "minimum" ? "최소성취수준" : "지필평가");
    const settingsSheet = XLSX.utils.aoa_to_sheet([
      ["항목", "설정값"], ["과목", context?.subject || ""], ["학년도", context?.year || ""], ["학기", context?.semester || ""],
      ["등급제", `${settings.gradeSystem}등급제`], ["성취도 방식", settings.achievementMode === "fixed" ? "고정분할" : "수동 분할점수"],
      ["지필 반영비율", `${weightTotal.written}%`], ["수행 반영비율", `${weightTotal.performance}%`], ["합계", `${weightTotal.total}%`],
      ["학기말 산출 인원", `${combinedRows.filter(row=>row.complete&&!row.excluded).length}명`], ["자퇴·전출 제외", `${combinedRows.filter(row=>row.excluded).length}명`],
    ]);
    XLSX.utils.book_append_sheet(workbook, settingsSheet, "산출 설정");
    XLSX.writeFile(workbook, `${context?.subject || "과목"}_${activeView === "combined" ? "학기말성적" : activeView === "minimum" ? "최성보" : "지필결과"}.xlsx`);
  };

  const selectedWritten = sortedWritten.find(item => item.id === activeView) || null;
  const openStudentEditor = (row = null) => {
    const sid = String(row?.sid || "");
    const base = combinedRows.find(item => item.sid === sid) || row || {};
    const existing = studentOverrides?.[sid] || {};
    setStudentEditor({
      originalSid: sid,
      sid,
      name: existing.name || base.name || rosterNames[sid]?.name || "",
      classNumber: existing.classNumber ?? base.classNumber ?? rosterNames[sid]?.class ?? "",
      number: existing.number ?? base.number ?? rosterNames[sid]?.number ?? "",
      enrollmentStatus: existing.enrollmentStatus || base.enrollmentStatus || "active",
      writtenScores: { ...(base.writtenScores || {}), ...(existing.writtenScores || {}) },
      areaScores: { ...(base.areaScores || {}), ...(existing.areaScores || {}) },
    });
  };
  const hydrateStudentEditor = sidValue => {
    const sid = String(sidValue || "").trim();
    const info = rosterNames[sid] || {};
    setStudentEditor(current => current ? ({
      ...current,
      sid,
      name: current.name || info.name || "",
      classNumber: current.classNumber || info.class || Number(sid.slice(1,3)) || "",
      number: current.number || info.number || Number(sid.slice(3,5)) || "",
    }) : current);
  };
  const saveStudentEditor = () => {
    if (!studentEditor) return;
    const sid = String(studentEditor.sid || "").trim();
    if (!/^\d{5}$/.test(sid)) { showToast?.("학번은 5자리 숫자로 입력해주세요.", "error"); return; }
    if (readOnlyWorkspace) { showToast?.("담당 과목 교사 또는 관리자만 학생 성적을 수정할 수 있습니다.", "error"); return; }
    const normalizeScores = values => Object.fromEntries(Object.entries(values || {}).map(([key,value]) => [key, value === "" || value == null ? null : asNumber(value)]));
    setStudentOverrides(current => {
      const next = { ...current };
      if (studentEditor.originalSid && studentEditor.originalSid !== sid) delete next[studentEditor.originalSid];
      next[sid] = {
        name: text(studentEditor.name),
        classNumber: asNumber(studentEditor.classNumber),
        number: asNumber(studentEditor.number),
        enrollmentStatus: studentEditor.enrollmentStatus || "active",
        writtenScores: normalizeScores(studentEditor.writtenScores),
        areaScores: normalizeScores(studentEditor.areaScores),
        updatedBy: teacher?.name || teacher?.id || accessRole,
        updatedAt: new Date().toISOString(),
      };
      return next;
    });
    setStudentEditor(null);
    showToast?.(`${sid} 학생 성적·학적 정보를 화면에 반영했습니다. 저장 버튼을 눌러 확정해주세요.`, "success");
  };
  const clearStudentOverride = sid => {
    if (!studentOverrides?.[sid]) { setStudentEditor(null); return; }
    if (!window.confirm(`${sid} 학생의 수기 수정값을 삭제하고 업로드 원본으로 되돌릴까요?`)) return;
    setStudentOverrides(current => { const next = { ...current }; delete next[sid]; return next; });
    setStudentEditor(null);
  };
  return (
    <div className="teacher-grade-analyzer" style={ui.root}>
      <style>{gradeAnalyzerCss}</style>
      <div className="teacher-grade-hero" style={ui.hero}>
        <div className="teacher-grade-hero-copy">
          <div style={ui.eyebrow}>선생님 ZONE · 성적 산출</div>
          <h2 style={ui.heroTitle}>성적 산출</h2>
          <p style={ui.heroDescription}>지필·수행 성적을 검증하고 학기말 결과를 확인합니다.</p>
        </div>
        <div className="teacher-grade-hero-actions" style={ui.heroActions}>
          <button type="button" style={ui.lightButton} onClick={saveLocalWorkspace} disabled={!canEditCurrentSubject}><Save size={15} /> 개인 임시 저장</button>
          <button type="button" style={ui.publishButton} onClick={publishWorkspace} disabled={!context || !canEditCurrentSubject}><Check size={15} /> 학교 공동 저장</button>
          <button type="button" style={ui.lightButton} onClick={exportWorkbook}><Download size={15} /> 결과 엑셀</button>
          <button type="button" style={ui.lightButton} onClick={resetWorkspace}><RotateCcw size={15} /> 초기화</button>
        </div>
      </div>

      <div className="teacher-grade-module-tabs no-print" style={ui.moduleTabs}>
        <button type="button" onClick={()=>setPanelMode("analysis")} style={{...ui.moduleTab,...(panelMode==="analysis"?ui.moduleTabActive:{})}}><FileSpreadsheet size={14}/> 성적 산출</button>
        <button type="button" onClick={()=>setPanelMode("data")} style={{...ui.moduleTab,...(panelMode==="data"?ui.moduleTabActive:{})}}><Database size={14}/> 데이터 관리</button>
      </div>

      <div style={{display:panelMode==="analysis"?"contents":"none"}}>
      <div className="teacher-grade-workspace-browser" style={ui.workspaceBrowser}>
        <div style={ui.workspaceIntro}><b>과목별 공동 작업</b><span>{accessRole === "admin" ? `${grade}학년 모든 과목을 생성·수정할 수 있습니다.` : canViewAllSubjects ? `${grade}학년 전체 과목을 열람하며, 담당 과목만 수정합니다.` : "같은 과목 담당 교사가 하나의 화면을 함께 사용합니다."}</span></div>
        <div style={ui.saveTypeLegend}><span><i style={ui.localDot}/>개인 임시본</span><span><i style={ui.sharedDot}/>학교 공동본</span></div>
        <select value={workspaceSelection} onChange={event => loadWorkspaceSelection(event.target.value)} style={ui.workspaceSelect}>
          <option value="">저장된 과목 작업 선택</option>
          {!!localWorkspaceList.length && <optgroup label="개인 임시 저장본">{localWorkspaceList.map(item => <option key={`local-${item.id}`} value={`local:${item.id}`}>{item.subject} · {item.year || "-"}학년도 {item.semester || "-"}학기 · 저장본</option>)}</optgroup>}
          {!!sharedWorkspaces.length && <optgroup label="학교 공동 저장본">{sharedWorkspaces.map(item => <option key={`shared-${item.id}`} value={`shared:${item.id}`}>{item.subject} · 마지막 수정 {item.lastEditedName || item.ownerName || item.ownerId} · {new Date(item.updatedAt || 0).toLocaleDateString("ko-KR")}</option>)}</optgroup>}
        </select>
        {accessRole === "teacher" ? <select value={draftSubject} onChange={event => startNewWorkspace(event.target.value)} style={ui.subjectSelect} disabled={!editableSubjectNames.length}><option value="">담당과목 없음</option>{editableSubjectNames.map(subject => <option key={subject} value={subject}>{subject}</option>)}</select> : accessRole === "admin" ? <><input list="teacher-grade-known-subjects" value={draftSubject} onChange={event => setDraftSubject(event.target.value)} style={ui.subjectInput} placeholder="작업할 과목명 입력"/><datalist id="teacher-grade-known-subjects">{allKnownSubjectNames.map(subject => <option key={subject} value={subject}/>)}</datalist></> : <span style={ui.adminEditBadge}>열람 전용</span>}
        <button type="button" style={ui.secondaryButton} onClick={() => startNewWorkspace(draftSubject)} disabled={!canStartSelectedSubject}>{accessRole === "admin" ? "과목 작업 시작" : "담당과목 작업 시작"}</button>
        {selectedLocalId && <button type="button" style={ui.deleteWorkspaceButton} onClick={deleteLocalWorkspace}>임시본 삭제</button>}
        {context && canEditCurrentSubject && <span style={ui.collaborationBadge}>공동 작업 · {subjectCollaborators.map(item => item.name).filter(Boolean).join(" · ") || (accessRole === "admin" ? "관리자" : "담당 교사")}</span>}{context && readOnlyWorkspace && <span style={ui.readOnlyBadge}>열람 전용</span>}
      </div>

      <section style={ui.section}>
        <div style={ui.sectionHeader}>
          <div><span style={ui.stepBadge}>1</span><strong style={ui.sectionTitle}>NEIS 파일 업로드</strong><p style={ui.sectionHint}>지필평가는 전 학급 파일, 수행평가는 반별 파일을 여러 개 선택할 수 있습니다.</p></div>
          {context && <span style={ui.contextBadge}>{context.year}학년도 {context.semester}학기 · {context.grade}학년 · {context.subject}</span>}
        </div>
        <div style={ui.uploadGrid}>
          <UploadCard
            title="지필평가"
            description="1차·2차 정기시험 전 학급 일람표"
            count={written.length}
            detail={sortedWritten.length ? `${sortedWritten.length}개 시험 등록 · ${sortedWritten.map(item => item.title).join(" · ")}` : "등록된 시험 없음"}
            inputRef={writtenInputRef}
            onFiles={files => parseFiles(files, "written")}
            busy={busy}
            readOnly={readOnlyWorkspace}
          />
          <UploadCard
            title="수행평가"
            description="반별 수행평가 강의실 일람표"
            count={performance.reduce((sum, item) => sum + item.classes.length, 0)}
            detail={performance.length ? `${performance.flatMap(item => item.classes).sort((a, b) => a - b).join(", ")}반 등록` : "등록된 반 없음"}
            inputRef={performanceInputRef}
            onFiles={files => parseFiles(files, "performance")}
            busy={busy}
            readOnly={readOnlyWorkspace}
          />
        </div>
        {!!uploadMessages.length && <div style={ui.messageList}>{uploadMessages.map((message, index) => <div key={`${message.text}-${index}`} style={{ ...ui.message, ...(message.type === "error" ? ui.messageError : message.type === "warn" ? ui.messageWarn : ui.messageOk) }}>{message.type === "ok" ? <Check size={13} /> : <AlertTriangle size={13} />}{message.text}</div>)}</div>}
      </section>

      <section style={ui.section}>
        <div style={ui.sectionHeader}><div><span style={ui.stepBadge}>2</span><strong style={ui.sectionTitle}>산출 기준 설정</strong><p style={ui.sectionHint}>반영비율 합계가 100%가 되어야 학기말 석차·등급을 확정합니다.</p></div><div style={ui.settingsHeaderActions}><span style={{ ...ui.totalBadge, ...(Math.abs(weightTotal.total - 100) < 1e-9 ? ui.totalBadgeOk : ui.totalBadgeWarn) }}>반영비율 {weightTotal.total}%</span><button type="button" style={ui.criteriaSaveButton} onClick={saveCriteriaSettings} disabled={readOnlyWorkspace || criteriaSaving}><Save size={14}/>{criteriaSaving ? "저장 중" : "산출 기준 저장"}</button></div></div>
        <div style={ui.settingsGrid}>
          <div style={ui.settingCard}>
            <div style={ui.settingTitleRow}><div><div style={ui.settingTitle}>지필평가 반영비율</div><small className="teacher-grade-setting-caption">성적 파일이 없어도 예정 시험을<br className="setting-caption-break"/> 먼저 등록할 수 있습니다.</small></div>{!readOnlyWorkspace&&<button type="button" style={ui.addAssessmentButton} onClick={addPlannedWritten}><Plus size={13}/> 미등록 시험 추가</button>}</div>
            {sortedWritten.map(item => <div key={item.id} className="teacher-grade-weight-row" style={ui.weightRow}><span><b>{item.title}</b><small>{item.maxScore}점 만점 · 성적 등록 완료</small></span><span style={ui.weightActions}><span style={ui.percentInput}><input type="number" min="0" max="100" step="0.01" value={item.weight ?? 0} disabled={readOnlyWorkspace} onChange={event => updateWrittenWeight(item.id, event.target.value)} />%</span><button type="button" title="이 시험 제거" style={ui.removeFileButton} disabled={readOnlyWorkspace} onClick={() => removeWritten(item.id)}>×</button></span></div>)}
            {plannedWritten.map(item => <div key={item.id} className="teacher-grade-weight-row planned-written-row" style={{...ui.weightRow,...ui.plannedWeightRow}}><span className="planned-written-name"><input type="text" value={item.title||""} disabled={readOnlyWorkspace} onChange={event=>updatePlannedWritten(item.id,{title:event.target.value})}/><small>성적 파일 미등록 · 최성보 필요점수 계산에 사용</small></span><span style={ui.weightActions}><label style={ui.compactScoreInput}><input type="number" min="1" step="1" value={item.maxScore??100} disabled={readOnlyWorkspace} onChange={event=>updatePlannedWritten(item.id,{maxScore:asNumber(event.target.value)??100})}/><small>만점</small></label><span style={ui.percentInput}><input type="number" min="0" max="100" step="0.01" value={item.weight??0} disabled={readOnlyWorkspace} onChange={event=>updatePlannedWritten(item.id,{weight:asNumber(event.target.value)??0})}/>%</span><button type="button" title="예정 시험 제거" style={ui.removeFileButton} disabled={readOnlyWorkspace} onClick={()=>removePlannedWritten(item.id)}>×</button></span></div>)}
            {!sortedWritten.length&&!plannedWritten.length&&<EmptyLine>지필평가 파일을 올리거나 ‘미등록 시험 추가’를 눌러주세요.</EmptyLine>}
            <div className="teacher-grade-subtotal" style={ui.subtotal}><span>지필 합계</span><b>{weightTotal.written}%</b><small>등록 {weightTotal.uploadedWritten}% · 예정 {weightTotal.plannedWritten}%</small></div>
          </div>
          <div style={ui.settingCard}>
            <div style={ui.settingTitleRow}><div><div style={ui.settingTitle}>수행평가 영역 반영비율</div><small className="teacher-grade-setting-caption">파일 업로드 전에도 영역명·만점·반영비율을<br className="setting-caption-break"/> 먼저 등록할 수 있습니다.</small></div>{!readOnlyWorkspace&&!uploadedAreas.length&&<button type="button" style={ui.addAssessmentButton} onClick={addPlannedPerformance}><Plus size={13}/> 수행 영역 추가</button>}</div>
            {!!performance.length && <div style={ui.fileChipRow}>{performance.map(file => <button key={file.id} type="button" disabled={readOnlyWorkspace} onClick={() => removePerformance(file.id)} style={ui.fileChip} title={`${file.fileName} 제거`}>{file.classes.join(", ")}반 <span>×</span></button>)}</div>}
            {uploadedAreas.length ? uploadedAreas.map(area => <label key={area.id} className="teacher-grade-weight-row performance-area-row" style={ui.weightRow}><span className="performance-area-name"><b title={area.name} style={{fontSize: area.name.length > 38 ? 10.4 : area.name.length > 24 ? 11.1 : 12, lineHeight: 1.38}}>{area.name}</b><small>{area.maxScore}점 · 수행 {area.order + 1}</small></span><span style={ui.percentInput}><input type="number" min="0" max="100" step="0.01" value={area.weight ?? 0} disabled={readOnlyWorkspace} onChange={event => updateAreaWeight(area.id, event.target.value)} />%</span></label>) : plannedPerformance.length ? plannedPerformance.map(area => <div key={area.id} className="teacher-grade-weight-row planned-performance-row" style={{...ui.weightRow,...ui.plannedWeightRow}}><span className="planned-performance-name"><textarea className="planned-performance-textarea" rows={2} value={area.name||""} disabled={readOnlyWorkspace} onChange={event=>updatePlannedPerformance(area.id,{name:event.target.value})}/><small>수행 {area.order+1} · 파일 미등록</small></span><span style={ui.weightActions}><label style={ui.compactScoreInput}><input type="number" min="1" step="1" value={area.maxScore??100} disabled={readOnlyWorkspace} onChange={event=>updatePlannedPerformance(area.id,{maxScore:asNumber(event.target.value)??100})}/><small>만점</small></label><span style={ui.percentInput}><input type="number" min="0" max="100" step="0.01" value={area.weight??0} disabled={readOnlyWorkspace} onChange={event=>updatePlannedPerformance(area.id,{weight:asNumber(event.target.value)??0})}/>%</span><button type="button" title="예정 수행 영역 제거" style={ui.removeFileButton} disabled={readOnlyWorkspace} onClick={()=>removePlannedPerformance(area.id)}>×</button></span></div>) : <EmptyLine>수행평가 파일을 올리거나 ‘수행 영역 추가’를 눌러주세요.</EmptyLine>}
            <div className="teacher-grade-subtotal" style={ui.subtotal}><span>수행 합계</span><b>{weightTotal.performance}%</b><small>{uploadedAreas.length?"성적 파일 등록":"예정 영역"}</small></div>
          </div>
          <div style={ui.settingCard}>
            <div style={ui.settingTitle}>등급·성취도 기준</div>
            <div style={ui.choiceGroup}><span>석차등급</span><Toggle disabled={readOnlyWorkspace} value={String(settings.gradeSystem)} options={[{ value: "5", label: "5등급제" }, { value: "9", label: "9등급제" }]} onChange={value => setSettings(current => ({ ...current, gradeSystem: Number(value) }))} /></div>
            <div style={ui.choiceGroup}><span>과목 구분</span><Toggle disabled={readOnlyWorkspace} value={settings.courseType} options={[{ value: "common", label: "공통과목" }, { value: "elective", label: "선택과목" }]} onChange={courseType => setSettings(current => ({ ...current, courseType }))} /></div>
            <div style={ui.choiceGroup}><span>성취도</span><Toggle disabled={readOnlyWorkspace} value={settings.achievementMode} options={[{ value: "fixed", label: "고정분할" }, { value: "manual", label: "추정분할·수동 컷" }]} onChange={achievementMode => setSettings(current => ({ ...current, achievementMode }))} /></div>
            {settings.achievementMode === "manual" && <ManualCutInputs settings={settings} setSettings={setSettings} disabled={readOnlyWorkspace} />}
            {settings.achievementMode === "fixed" && <div style={ui.ruleNote}>{settings.courseType === "common" ? "A 90 · B 80 · C 70 · D 60 · E 40 · 40 미만 미도달" : "A 90 · B 80 · C 70 · D 60 · 60 미만 E"}</div>}<div className="minimum-course-rule" style={ui.minimumCourseRule}><span style={ui.minimumCourseIcon}><ShieldCheck size={13}/></span><div style={ui.minimumCourseCopy}><b>{settings.courseType === "common" ? "공통과목 최성보" : "선택과목 최성보"}</b><span>{settings.courseType === "common" ? "출석률 2/3 이상 · 학업성취율 40% 이상" : "출석률 2/3 이상 · 학업성취율 기준 미적용"}</span></div></div>
          </div>
        </div>
        <div style={ui.tieRuleBox}><b>동점자 처리 순서</b><span>학기말 환산점수가 같은 경우: ① 정기시험 환산 합계 → ② 수행평가 → ③ 2차 지필 → ④ 1차 지필 → ⑤ 수행평가 NEIS 영역 순 → ⑥ 2차 고배점 문항(최대 3개) → ⑦ 1차 고배점 문항(최대 3개)</span><small>수행평가 100% 과목은 수행 영역 순서까지만 적용합니다. 모든 기준이 같은 학생은 동석차로 남기며, 등급 경계 인원에 걸린 동점자는 나누지 않고 모두 다음 등급으로 처리합니다.</small></div>
        <div style={ui.roundingRuleBox}><b>소수점 처리</b><span>영역별 환산점수 합계는 소수 셋째 자리에서 반올림해 둘째 자리까지 석차 산출에 사용합니다.</span><span>공식 원점수는 학기말 환산점수를 소수 첫째 자리에서 반올림한 정수로 표시하며, 평균과 분포 비율은 소수 첫째 자리까지 표시합니다.</span></div>
      </section>

      <section className={activeView === "minimum" ? "minimum-print-area" : ""} style={ui.section}>
        <div style={ui.sectionHeader}><div><span style={ui.stepBadge}>3</span><strong style={ui.sectionTitle}>결과 확인</strong><p style={ui.sectionHint}>지필평가, 학기말 성적과 최소성취수준 예방지도를 한 화면에서 전환합니다.</p></div>{activeView === "minimum"&&<button type="button" className="no-minimum-print" style={ui.printButton} onClick={printMinimum}><Printer size={14}/> 인쇄·PDF</button>}</div>
        <div style={ui.resultTabs}>
          {sortedWritten.map(item => <button key={item.id} type="button" onClick={() => setActiveView(item.id)} style={{ ...ui.resultTab, ...(activeView === item.id ? ui.resultTabActive : {}) }}>{item.title}</button>)}
          <button type="button" onClick={() => setActiveView("combined")} style={{ ...ui.resultTab, ...(activeView === "combined" ? ui.resultTabActive : {}) }}>학기말 성적</button>
          <button type="button" onClick={() => setActiveView("minimum")} style={{ ...ui.resultTab, ...ui.minimumResultTab, ...(activeView === "minimum" ? ui.resultTabActive : {}) }}><ShieldCheck size={14}/> 최성보</button>
        </div>
        {!activeRows.length ? <div style={ui.emptyState}><FileSpreadsheet size={30} /><b>분석할 파일을 업로드해주세요.</b><span>지필평가 파일부터 올리면 전 학급 학생 구조가 자동으로 만들어집니다.</span></div> : <>
          {activeView === "combined" && Math.abs(weightTotal.total - 100) > 1e-9 && <div style={ui.warningBanner}><AlertTriangle size={16} /><span>반영비율 합계가 {weightTotal.total}%입니다. 100%로 맞추기 전 결과는 검토용입니다.</span></div>}
          {activeView === "combined" && (plannedWritten.length > 0 || plannedPerformance.length > 0) && <div style={ui.warningBanner}><AlertTriangle size={16}/><span>{[...plannedWritten.map(item=>item.title),...plannedPerformance.map(item=>item.name)].filter(Boolean).join(", ")} 성적 파일이 아직 등록되지 않았습니다. 예정 반영비율은 최성보 계산과 사전 점검에 먼저 적용됩니다.</span></div>}
          <div style={ui.metricGrid}>
            {activeView === "minimum" ? <>
              <MetricCard label="조회 학생" value={`${activeRows.length}명`} caption={settings.courseType === "common" ? "공통과목 기준" : "선택과목 기준"} />
              <MetricCard label="주의 대상자" value={`${minimumSummary.risk}명`} caption="예방지도·다음 시험 점수 확인" danger={minimumSummary.risk > 0} />
              <MetricCard label="미도달" value={`${minimumSummary.fail}명`} caption="학업성취율 또는 출결 미도달" danger={minimumSummary.fail > 0} />
              <MetricCard label="확인 필요" value={`${minimumSummary.check}명`} caption="출결·미입력 자료 확인" />
            </> : <>
              <MetricCard label="산출 학생" value={`${activeStats.count}명`} caption={`학기말 대상 ${eligibleActiveRows.length}명${activeRows.length>eligibleActiveRows.length?` · 자퇴·전출 ${activeRows.length-eligibleActiveRows.length}명 제외`:""}`} />
              <MetricCard label="평균" value={formatScore(activeStats.average, 1)} caption="소수 첫째 자리" />
              <MetricCard label="최고점" value={formatScore(activeStats.max, 2)} caption="정상 산출 학생" />
              <MetricCard label="최저점" value={formatScore(activeStats.min, 2)} caption="정상 산출 학생" />
              {activeView === "combined" && <MetricCard label="미처리" value={`${eligibleActiveRows.filter(row => !row.complete).length}명`} caption="공란·결시 확인 필요" danger={eligibleActiveRows.some(row => !row.complete)} />}
            </>}
          </div>
          {activeView !== "minimum" && <div style={ui.summaryGrid}>
            <div style={ui.summaryPanel}><div style={ui.summaryTitle}><BarChart3 size={16} /> {settings.gradeSystem}등급제 등급컷</div><GradeCutoffTable rows={gradeDistribution} total={completeActiveRows.length}/><p style={ui.quotaNote}>누적 인원은 수강자수×등급 비율을 반올림하며, 경계에 동점자가 걸리면 해당 동점자 전체를 다음 등급으로 넘깁니다.</p></div>
            {activeView === "combined" && <div style={ui.summaryPanel}><div style={ui.summaryTitle}><PieChart size={16} /> 성취도 분포</div><AchievementDonut rows={achievementDistribution} total={completeActiveRows.length} mode={settings.achievementMode} settings={settings}/></div>}
          </div>}

          {activeView === "minimum" && <div style={ui.minimumControlPanel}>
            <div><span style={ui.courseTypeBadge}>{settings.courseType === "common" ? "공통과목" : "선택과목"}</span><b>{settings.courseType === "common" ? "출석률 2/3 + 학업성취율 40%" : "출석률 2/3 · 학업성취율 기준 미적용"}</b><small>과목 구분에 따라 최소성취수준 판정 기준을 자동 적용합니다.</small></div>
            {settings.courseType === "common" && <div style={ui.minimumInputRow}>
              <label><span>다음 시험명</span><input type="text" value={minimumSettings.nextExamLabel} disabled={readOnlyWorkspace} onChange={event => updateMinimumPlanning({ nextExamLabel: event.target.value })}/></label>
              <label><span>반영비율</span><div><input type="number" min="0" max="100" step="0.01" value={minimumSettings.nextExamWeight} disabled={readOnlyWorkspace} onChange={event => updateMinimumPlanning({ nextExamWeight: event.target.value })}/><b>%</b></div></label>
              <label><span>만점</span><div><input type="number" min="1" step="1" value={minimumSettings.nextExamMax} disabled={readOnlyWorkspace} onChange={event => updateMinimumPlanning({ nextExamMax: event.target.value })}/><b>점</b></div></label>
            </div>}
          </div>}

          {activeView === "combined" && unresolvedTieGroups.length > 0 && <details style={ui.tieDetails} open>
            <summary style={ui.tieSummary}><span><AlertTriangle size={15} /> 추가 동점자 문항 점수 입력</span><b>{unresolvedTieGroups.reduce((sum, rows) => sum + rows.length, 0)}명</b></summary>
            <div style={ui.tieBody}><p>학교 규정의 고배점 문항 점수를 입력할 수 있으며, 모든 기준이 여전히 같을 때는 직접 우선순위를 지정할 수 있습니다. 우선순위가 같거나 비어 있으면 동석차로 남습니다.</p>{unresolvedTieGroups.map((rows, groupIndex) => <div key={vectorKey(rows[0].baseVector)} style={ui.tieGroup}><div style={ui.tieGroupTitle}>동점 그룹 {groupIndex + 1} · 환산 {formatScore(rows[0].convertedScore, 2)}점</div>{rows.map(row => <div key={row.sid} className="teacher-grade-tie-student" style={ui.tieStudent}><span><b>{row.name || row.sid}</b><small>{row.sid} · {row.classNumber}반 {row.number}번</small></span><TieItemInputs label="2차 고배점" values={tieScores[row.sid]?.secondItems || []} disabled={readOnlyWorkspace} onChange={(index, value) => setTieScores(current => { const rowTie = current[row.sid] || {}; const nextItems = [...(rowTie.secondItems || [])]; nextItems[index] = value; return { ...current, [row.sid]: { ...rowTie, secondItems: nextItems } }; })} /><TieItemInputs label="1차 고배점" values={tieScores[row.sid]?.firstItems || []} disabled={readOnlyWorkspace} onChange={(index, value) => setTieScores(current => { const rowTie = current[row.sid] || {}; const nextItems = [...(rowTie.firstItems || [])]; nextItems[index] = value; return { ...current, [row.sid]: { ...rowTie, firstItems: nextItems } }; })} /><label style={ui.tiePriority}><span>직접 우선순위</span><select value={tieScores[row.sid]?.manualPriority ?? ""} disabled={readOnlyWorkspace} onChange={event => setTieScores(current => { const rowTie = current[row.sid] || {}; return { ...current, [row.sid]: { ...rowTie, manualPriority: event.target.value } }; })}><option value="">동석차 유지</option>{rows.map((_, index) => <option key={index + 1} value={index + 1}>{index + 1}순위</option>)}</select><small>모든 앞선 기준이 같을 때만 적용</small></label></div>)}</div>)}</div>
          </details>}
          {selectedWrittenForTie && writtenTieGroups.length > 0 && <details style={ui.tieDetails}>
            <summary style={ui.tieSummary}><span><AlertTriangle size={15} /> {selectedWrittenForTie.title} 동점자 우선순위</span><b>{writtenTieGroups.reduce((sum, rows) => sum + rows.length, 0)}명</b></summary>
            <div style={ui.tieBody}><p>동점 점수의 학생 중 우선순위를 직접 지정할 수 있습니다. 같은 순위를 선택하거나 비워두면 동석차로 유지됩니다.</p>{writtenTieGroups.map((rows, groupIndex) => <div key={`${selectedWrittenForTie.id}-${rows[0].score}`} style={ui.tieGroup}><div style={ui.tieGroupTitle}>동점 그룹 {groupIndex + 1} · {formatScore(rows[0].score, 1)}점</div>{rows.map(row => <div key={row.sid} style={ui.writtenTieStudent}><span><b>{row.name || row.sid}</b><small>{row.sid} · {row.classNumber}반 {row.number}번</small></span><label style={ui.tiePriority}><span>우선순위</span><select value={tieScores[row.sid]?.writtenPriorities?.[selectedWrittenForTie.id] ?? ""} disabled={readOnlyWorkspace} onChange={event => setTieScores(current => { const rowTie = current[row.sid] || {}; return { ...current, [row.sid]: { ...rowTie, writtenPriorities: { ...(rowTie.writtenPriorities || {}), [selectedWrittenForTie.id]: event.target.value } } }; })}><option value="">동석차 유지</option>{rows.map((_, index) => <option key={index + 1} value={index + 1}>{index + 1}순위</option>)}</select></label></div>)}</div>)}</div>
          </details>}

          <div className="teacher-result-toolbar no-minimum-print" style={ui.tableToolbar}>
            <div style={ui.searchBox}><span style={ui.searchIcon}><Search size={15}/></span><div style={ui.searchField}><small style={ui.searchLabel}>학생 검색</small><input className="teacher-grade-analyzer-search-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="학번 또는 이름을 입력하세요" /></div></div>
            <select value={classFilter} onChange={event => setClassFilter(event.target.value)} style={ui.select}><option value="all">전체 반</option>{classes.map(classNumber => <option key={classNumber} value={String(classNumber)}>{classNumber}반</option>)}</select>
            {activeView === "minimum" ? <select value={minimumFilter} onChange={event => setMinimumFilter(event.target.value)} style={ui.select}><option value="all">전체</option><option value="risk">주의 대상자</option><option value="fail">미도달</option><option value="check">확인 필요</option><option value="reached">도달</option></select> : <select value={gradeFilter} onChange={event => setGradeFilter(event.target.value)} style={ui.select}><option value="all">전체 등급</option>{Array.from({length:Number(settings.gradeSystem)},(_,index)=><option key={index+1} value={String(index+1)}>{index+1}등급</option>)}</select>}
            <button type="button" className="student-score-edit-launch" disabled={readOnlyWorkspace} onClick={()=>openStudentEditor()}><Plus size={13}/> 학생 성적 입력·수정</button>
            <span style={ui.resultCount}>{filteredRows.length}명 표시</span>
          </div>
          <div style={ui.tableScroll}>
            {activeView === "combined" ? <CombinedTable rows={filteredRows} written={sortedWritten} areas={canonicalAreas} onEdit={readOnlyWorkspace?null:openStudentEditor} /> : activeView === "minimum" ? <MinimumTable rows={filteredRows} settings={settings} minimumSettings={minimumSettings} onEdit={readOnlyWorkspace?null:openStudentEditor} /> : <WrittenTable rows={filteredRows} assessment={selectedWritten} onEdit={readOnlyWorkspace?null:openStudentEditor} />}
          </div>
        </>}
      </section>
      </div>

      {panelMode==="data" && <section className="teacher-grade-data-management" style={ui.section}>
        <div style={ui.sectionHeader}><div><span style={ui.stepBadge}><Database size={13}/></span><strong style={ui.sectionTitle}>{grade}학년 성적 데이터 관리</strong><p style={ui.sectionHint}>과목·학급별 저장 상태를 확인하고 개인 임시본 또는 학교 공동본을 정리합니다.</p></div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}><button type="button" style={ui.dangerOutlineButton} onClick={clearCurrentGradeLocalData} disabled={!Object.keys(localWorkspaces||{}).length}><Trash2 size={14}/> 개인 임시본 전체 초기화</button>{accessRole==="admin"&&<button type="button" style={ui.dangerOutlineButton} onClick={clearCurrentGradeSharedData} disabled={!sharedWorkspaces.length}><Trash2 size={14}/> 학교 공동본 전체 초기화</button>}</div></div>
        <div style={ui.dataFilterBar}><label>과목<select value={dataSubjectFilter} onChange={event=>setDataSubjectFilter(event.target.value)}><option value="all">전체 과목</option>{dataSubjects.map(subject=><option key={subject} value={subject}>{subject}</option>)}</select></label><label>학급<select value={dataClassFilter} onChange={event=>setDataClassFilter(event.target.value)}><option value="all">전체 학급</option>{dataClasses.map(value=><option key={value} value={String(value)}>{value}반</option>)}</select></label><span>{filteredManagedWorkspaces.length}개 저장본</span></div>
        <div style={ui.dataManagementGrid}>{filteredManagedWorkspaces.map(item=><article key={`${item.source}-${item.id}`} style={ui.dataWorkspaceCard}><div style={ui.dataWorkspaceHead}><div><span style={item.source==="shared"?ui.sharedSourceBadge:ui.localSourceBadge}>{item.sourceLabel}</span><b>{item.subject||"과목 미상"}</b></div><button type="button" style={ui.iconDangerButton} title="삭제" disabled={item.source==="shared"&&!(accessRole==="admin"||canEditSubject(item.subject))} onClick={()=>item.source==="shared"?deleteSharedWorkspace(item):deleteLocalWorkspaceById(item)}><Trash2 size={14}/></button></div><div style={ui.dataWorkspaceMeta}><span>{item.year||"-"}학년도 {item.semester||"-"}학기</span><span>{item.grade||grade}학년</span><span>{(item.classNumbers||[]).length?`${item.classNumbers.join(", ")}반`:"학급 미확인"}</span><span>학생 {item.studentCount||0}명</span></div><small>지필 {(item.written||[]).length}개 · 수행 {(item.performance||[]).length}개 · 마지막 저장 {item.updatedAt?new Date(item.updatedAt).toLocaleString("ko-KR"):"-"}</small></article>)}</div>
        {!filteredManagedWorkspaces.length&&<div style={ui.emptyState}><Database size={30}/><b>조건에 맞는 저장 자료가 없습니다.</b><span>성적 산출 화면에서 개인 임시 저장 또는 학교 공동 저장을 진행해주세요.</span></div>}
      </section>}
      {studentEditor && <div className="student-score-editor-overlay" role="dialog" aria-modal="true" aria-label="학생 성적 입력·수정">
        <div className="student-score-editor">
          <div className="student-score-editor-head"><div><b>학생 성적 입력·수정</b><span>수기 입력값은 업로드 원본보다 우선 적용됩니다.</span></div><button type="button" onClick={()=>setStudentEditor(null)}>×</button></div>
          <div className="student-score-editor-grid identity">
            <label><span>학번</span><input list="teacher-grade-roster-sids" value={studentEditor.sid} onChange={event=>hydrateStudentEditor(event.target.value)} placeholder="5자리 학번"/></label>
            <datalist id="teacher-grade-roster-sids">{Object.entries(rosterNames).map(([sid,info])=><option key={sid} value={sid}>{info?.name||""}</option>)}</datalist>
            <label><span>성명</span><input value={studentEditor.name} onChange={event=>setStudentEditor(current=>({...current,name:event.target.value}))}/></label>
            <label><span>반</span><input type="number" min="1" value={studentEditor.classNumber} onChange={event=>setStudentEditor(current=>({...current,classNumber:event.target.value}))}/></label>
            <label><span>번호</span><input type="number" min="1" value={studentEditor.number} onChange={event=>setStudentEditor(current=>({...current,number:event.target.value}))}/></label>
            <label><span>학적 상태</span><select value={studentEditor.enrollmentStatus} onChange={event=>setStudentEditor(current=>({...current,enrollmentStatus:event.target.value}))}><option value="active">재학</option><option value="withdrawn">자퇴</option><option value="transferred">전출</option></select></label>
          </div>
          <div className="student-score-editor-section"><b>지필평가</b><div className="student-score-editor-grid scores">{sortedWritten.map(item=><label key={item.id}><span>{item.title}<small>{item.maxScore||100}점 만점</small></span><input type="number" min="0" max={item.maxScore||100} step="0.1" value={studentEditor.writtenScores?.[item.id]??""} onChange={event=>setStudentEditor(current=>({...current,writtenScores:{...(current.writtenScores||{}),[item.id]:event.target.value}}))}/></label>)}</div>{!sortedWritten.length&&<small>등록된 지필평가가 없습니다.</small>}</div>
          <div className="student-score-editor-section"><b>수행평가</b><div className="student-score-editor-grid scores">{canonicalAreas.map(area=><label key={area.id}><span>{area.name}<small>{area.maxScore||100}점 만점</small></span><input type="number" min="0" max={area.maxScore||100} step="0.1" value={studentEditor.areaScores?.[area.id]??""} onChange={event=>setStudentEditor(current=>({...current,areaScores:{...(current.areaScores||{}),[area.id]:event.target.value}}))}/></label>)}</div>{!canonicalAreas.length&&<small>등록된 수행평가 영역이 없습니다.</small>}</div>
          <div className="student-score-editor-actions">{studentEditor.originalSid&&studentOverrides?.[studentEditor.originalSid]&&<button type="button" className="reset" onClick={()=>clearStudentOverride(studentEditor.originalSid)}>수기값 삭제</button>}<span/><button type="button" onClick={()=>setStudentEditor(null)}>취소</button><button type="button" className="save" onClick={saveStudentEditor}>화면에 적용</button></div>
          <p className="student-score-editor-note">자퇴·전출 학생은 결과표에는 표시되지만 학기말 수강자수·등급·성취도 산출 인원에서는 제외됩니다.</p>
        </div>
      </div>}
    </div>
  );
}

function GradeCutoffTable({ rows, total }) {
  return <div className="grade-cutoff-table-wrap"><table className="grade-cutoff-table"><thead><tr><th>등급</th><th>기준 인원</th><th>실제 인원</th><th>비율</th><th>등급컷</th></tr></thead><tbody>{rows.map(item=><tr key={item.grade}><td><span style={{...ui.gradePill,...(item.grade===1?ui.gradePillFirst:{})}}>{item.grade}등급</span></td><td>{item.target}명</td><td><b>{item.count}명</b></td><td>{total?((item.count/total)*100).toFixed(1):"0.0"}%</td><td><strong className="grade-cutoff-text">{item.min==null?"-":formatScore(item.min,2)}</strong></td></tr>)}</tbody></table></div>;
}
function AchievementDonut({ rows, total, mode, settings }) {
  const colors=["#3568a3","#6c7fba","#7b69a8","#d59b49","#d87362","#9b4b43"];
  let cursor=0;
  const stops=rows.map((item,index)=>{const start=cursor;const size=total?item.count/total*100:0;cursor+=size;return `${colors[index%colors.length]} ${start}% ${cursor}%`});
  const background=total?`conic-gradient(${stops.join(",")})`:"#edf1f5";
  const cuts=mode==="fixed"
    ? (settings?.courseType==="common" ? [["A","90 이상"],["B","80 이상"],["C","70 이상"],["D","60 이상"],["E","40 이상"],["미도달","40 미만"]] : [["A","90 이상"],["B","80 이상"],["C","70 이상"],["D","60 이상"],["E","60 미만"]])
    : [["A/B",settings?.manualCuts?.ab],["B/C",settings?.manualCuts?.bc],["C/D",settings?.manualCuts?.cd],["D/E",settings?.manualCuts?.de],...(settings?.courseType==="common"?[["E/미도달",settings?.manualCuts?.ei]]:[])].map(([label,value])=>[label,value!==""&&value!=null?`${value}점`:"미입력"]);
  return <div className="achievement-donut-shell">
    <div className="achievement-donut-layout"><div className="achievement-donut" style={{background}}><div><b>{total}명</b><span>{mode==="fixed"?"고정분할":"수동 컷"}</span></div></div><div className="achievement-donut-legend">{rows.map((item,index)=>{const percent=total?item.count/total*100:0;return <div key={item.label}><i style={{background:colors[index%colors.length]}}/><span className="achievement-legend-label">{item.label}</span><b>{item.count}명</b><small>{percent.toFixed(1)}%</small></div>})}</div></div>
    <div className="achievement-cut-guide"><strong>성취도 기준</strong><div>{cuts.map(([label,value])=><span key={label}><b>{label}</b><small>{value}</small></span>)}</div></div>
  </div>;
}

function TieItemInputs({ label, values, onChange, disabled = false }) {
  return <div style={ui.tieItemSet}><b>{label}</b><div>{[0, 1, 2].map(index => <label key={index}><span>{index + 1}</span><input type="number" min="0" step="0.1" value={values[index] ?? ""} disabled={disabled} onChange={event => onChange(index, event.target.value)} /></label>)}</div></div>;
}
function UploadCard({ title, description, count, detail, inputRef, onFiles, busy, readOnly }) {
  return <div className="teacher-grade-analyzer-upload" style={ui.uploadCard}><div style={ui.uploadIcon}><Upload size={19} /></div><div style={{ minWidth: 0, flex: 1 }}><div style={ui.uploadTitle}>{title}<span>{count}개</span></div><p>{description}</p><small title={detail}>{detail}</small></div><input ref={inputRef} type="file" accept=".xlsx,.xls" multiple style={{ display: "none" }} onChange={event => onFiles(event.target.files)} /><button type="button" disabled={busy || readOnly} style={ui.primaryButton} onClick={() => inputRef.current?.click()}><Upload size={14} /> 파일 선택</button></div>;
}
function Toggle({ value, options, onChange, disabled = false }) {
  return <div style={ui.toggle}>{options.map(option => <button key={option.value} type="button" disabled={disabled} onClick={() => onChange(option.value)} style={{ ...ui.toggleButton, ...(value === option.value ? ui.toggleButtonActive : {}) }}>{option.label}</button>)}</div>;
}
function ManualCutInputs({ settings, setSettings, disabled = false }) {
  const fields = [
    ["ab", "A/B"], ["bc", "B/C"], ["cd", "C/D"], ["de", "D/E"], ...(settings.courseType === "common" ? [["ei", "E/미도달"]] : []),
  ];
  return <div><div style={ui.manualCutNote}>추정분할점수는 자동 산출하지 않습니다. NEIS에서 확정된 분할점수를 직접 입력하세요.</div><div style={ui.cutGrid}>{fields.map(([key, label]) => <label key={key}><span>{label}</span><input type="number" step="0.01" value={settings.manualCuts?.[key] ?? ""} disabled={disabled} onChange={event => setSettings(current => ({ ...current, manualCuts: { ...current.manualCuts, [key]: event.target.value } }))} /></label>)}</div></div>;
}
function EmptyLine({ children }) { return <div style={ui.emptyLine}>{children}</div>; }
function MetricCard({ label, value, caption, danger }) { return <div className="teacher-grade-metric-card" style={{ ...ui.metricCard, ...(danger ? ui.metricDanger : {}) }}><span>{label}</span><strong>{value}</strong><small>{caption}</small></div>; }
function StudentIdentityCells({ row }) {
  return <><td className="student-id-cell"><b>{row.sid}</b></td><td className="student-name-cell"><b title={row.name || "이름 미연결"}>{row.name || "이름 미연결"}</b></td><td className="student-class-cell"><b>{row.classNumber}반</b></td><td className="student-number-cell"><b>{row.number}번</b></td></>;
}
function MissingState({ missing = [], complete = false }) {
  if (complete) return <span style={ui.okText}><Check size={12} /> 입력 완료</span>;
  const labels = compactMissingLabels(missing);
  return <span style={ui.missingStack}>{labels.length ? labels.map(label => <small key={label}><CircleAlert size={11}/>{label}</small>) : <small><CircleAlert size={11}/>확인 필요</small>}</span>;
}
function GradeBadge({ grade }) {
  if (!grade) return "-";
  return <span style={grade === 1 ? ui.firstGradeMark : ui.tableGrade}>{grade}등급</span>;
}
function CombinedTable({ rows, written, areas, onEdit }) {
  return <table className="teacher-grade-result-table" style={ui.table}><thead><tr><th className="student-id-head">학번</th><th className="student-name-head">성명</th><th className="student-class-head">반</th><th className="student-number-head">번호</th>{written.map(item => <th className="score-head" key={item.id}>{item.title}</th>)}<th className="performance-score-head">수행</th><th className="score-head">환산점수</th><th className="score-head">원점수</th><th className="rank-head">석차</th><th className="grade-head">등급</th><th className="achievement-head">성취도</th><th className="status-head">입력·학적</th>{onEdit&&<th className="edit-head">수정</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.sid} className={row.excluded?"is-excluded-student":""} style={!row.complete&&!row.excluded ? ui.incompleteRow : undefined}><StudentIdentityCells row={row}/>{written.map(item => <td className="score-cell" key={item.id}>{formatScore(row.writtenScores[item.id], 1)}</td>)}<td className="performance-score-cell"><b>{formatScore(row.weightedPerformance, 2)}</b><small>{areas.length ? areas.map(area => formatScore(row.areaScores[area.id], 1)).join(" / ") : "수행 없음"}</small></td><td className="score-cell"><b>{formatScore(row.convertedScore, 2)}</b></td><td className="score-cell">{row.officialScore ?? "-"}</td><td className="rank-cell">{row.rank ? <><b>{row.rank}</b><small>{row.tieCount > 1 ? `동석차 ${row.tieCount}명 · 중간 ${row.midRank}` : ""}</small></> : "-"}</td><td><GradeBadge grade={row.grade}/></td><td><span style={{ ...ui.achievementBadge, ...(row.achievement === "미도달" ? ui.achievementFail : {}) }}>{row.achievement || "-"}</span></td><td>{row.excluded?<span className="enrollment-status-badge">{row.enrollmentStatus==="withdrawn"?"자퇴":"전출"} · 산출 제외</span>:<MissingState missing={row.missing} complete={row.complete}/>}</td>{onEdit&&<td><button type="button" className="student-row-edit" onClick={()=>onEdit(row)}>수정</button></td>}</tr>)}</tbody></table>;
}

function MinimumTable({ rows, settings, minimumSettings, onEdit }) {
  return <table className="teacher-grade-result-table teacher-grade-minimum-table" style={{...ui.table,minWidth:930}}><thead><tr><th className="student-id-head">학번</th><th className="student-name-head">성명</th><th className="student-class-head">반</th><th className="student-number-head">번호</th><th>과목 유형</th><th className="score-head">현재 환산</th><th>입력 완료</th><th>다음 정기시험 필요점수</th><th>과목 출결</th><th>최성보 판정</th><th>확인 사항</th>{onEdit&&<th className="edit-head">수정</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.sid} style={row.minimumStatus === "fail" ? ui.minimumFailRow : row.minimumStatus === "risk" ? ui.minimumRiskRow : undefined}><StudentIdentityCells row={row}/><td><span style={ui.courseTypeBadge}>{settings.courseType === "common" ? "공통과목" : "선택과목"}</span></td><td className="score-cell"><b>{formatScore(Number(row.weightedWritten || 0)+Number(row.weightedPerformance || 0),2)}</b><small>{row.completedWeight}% 입력</small></td><td>{row.complete ? <span style={ui.okText}><Check size={12}/>완료</span> : <b>{row.completedWeight}%</b>}</td><td>{settings.courseType === "elective" ? <span style={ui.notApplicable}>적용 안 함</span> : row.needed == null ? "-" : row.needed <= 0 ? <span style={ui.okText}><Check size={12}/>현재 도달</span> : row.needed > Number(minimumSettings.nextExamMax) ? <span style={ui.failText}>미도달 확정</span> : <><b>{row.needed}점 이상</b><small>{minimumSettings.nextExamLabel}</small></>}</td><td><span style={row.attendanceStatus === "미도달" ? ui.failPill : row.attendanceStatus === "도달" ? ui.attendanceOk : ui.checkPill}>{row.attendanceStatus === "확인필요" ? "확인 필요" : row.attendanceStatus}</span></td><td><span style={{...ui.minimumStatusBadge,...(row.minimumStatus === "fail" ? ui.minimumStatusFail : row.minimumStatus === "risk" ? ui.minimumStatusRisk : row.minimumStatus === "reached" ? ui.minimumStatusReached : ui.minimumStatusCheck)}}>{row.minimumLabel}</span><small>{row.academicLabel}</small></td><td><MissingState missing={row.missing} complete={!row.missing.length}/></td>{onEdit&&<td><button type="button" className="student-row-edit" onClick={()=>onEdit(row)}>수정</button></td>}</tr>)}</tbody></table>;
}
function WrittenTable({ rows, assessment, onEdit }) {
  return <table className="teacher-grade-result-table" style={ui.table}><thead><tr><th className="student-id-head">학번</th><th className="student-name-head">성명</th><th className="student-class-head">반</th><th className="student-number-head">번호</th><th className="score-head">{assessment?.title || "지필"} 점수</th><th className="rank-head">석차</th><th className="rank-head">중간석차</th><th className="grade-head">등급</th><th className="status-head">상태</th>{onEdit&&<th className="edit-head">수정</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.sid} className={row.excluded?"is-excluded-student":""}><StudentIdentityCells row={row}/><td className="score-cell"><b>{formatScore(row.score, 1)}</b></td><td className="rank-cell">{row.rank || "-"}{row.tieCount > 1 && <small>동석차 {row.tieCount}명</small>}</td><td className="rank-cell">{row.midRank ?? "-"}</td><td><GradeBadge grade={row.grade}/></td><td>{row.excluded?<span className="enrollment-status-badge">{row.enrollmentStatus==="withdrawn"?"자퇴":"전출"} · 산출 제외</span>:row.score == null ? <span style={ui.warnText}>{row.status || "미입력"}</span> : <span style={ui.okText}><Check size={12} /> 정상</span>}</td>{onEdit&&<td><button type="button" className="student-row-edit" onClick={()=>onEdit(row)}>수정</button></td>}</tr>)}</tbody></table>;
}



const gradeAnalyzerCss = `
.teacher-grade-analyzer *{box-sizing:border-box}
.teacher-grade-analyzer{color:#27364a;letter-spacing:-.025em;width:100%;max-width:100%;min-width:0}.teacher-grade-analyzer h2,.teacher-grade-analyzer p,.teacher-grade-analyzer b,.teacher-grade-analyzer span{word-break:keep-all}
.teacher-grade-analyzer button,.teacher-grade-analyzer input,.teacher-grade-analyzer select,.teacher-grade-analyzer textarea{font-family:${FONT_STACK};letter-spacing:-.025em}
.teacher-grade-analyzer button:disabled{opacity:.48;cursor:not-allowed}
.teacher-grade-analyzer section{min-width:0;max-width:100%}
.teacher-grade-analyzer input[type="number"]{width:70px;border:1px solid #cfd9e7;border-radius:9px;padding:7px 8px;text-align:right;color:#263a53;background:#fff;font-weight:850;font-variant-numeric:tabular-nums}
.teacher-grade-analyzer input[type="text"]{outline:none}.teacher-grade-analyzer .planned-performance-textarea{width:100%;min-height:48px;resize:vertical;border:1px solid #cfd9e7;border-radius:9px;padding:7px 8px;color:#263a53;background:#fff;font-size:11px;font-weight:850;line-height:1.35;word-break:keep-all;overflow-wrap:anywhere;outline:none}
.teacher-grade-analyzer label small,.teacher-grade-analyzer td small,.teacher-grade-analyzer .metric-card small{display:block;margin-top:4px;color:#8290a3;font-size:10px;font-weight:650;line-height:1.42}
.teacher-grade-analyzer .teacher-grade-analyzer-upload p{margin:4px 0;font-size:11.5px;font-weight:750;color:#607087}
.teacher-grade-analyzer .teacher-grade-analyzer-upload small{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.teacher-grade-analyzer .teacher-grade-weight-row>span:first-child{min-width:0;flex:1;overflow:hidden}
.teacher-grade-analyzer .teacher-grade-weight-row>span:first-child>b{display:block;color:#263a53;font-weight:900;line-height:1.42}
.teacher-grade-analyzer .teacher-grade-weight-row small{font-size:9.8px!important}
.teacher-grade-analyzer .teacher-grade-subtotal>b{font-size:17px;color:#234567;font-weight:950;font-variant-numeric:tabular-nums}.teacher-grade-analyzer .teacher-grade-subtotal>span{font-weight:900;color:#41566f}.teacher-grade-analyzer .teacher-grade-subtotal>small{grid-column:1/-1;margin-top:1px!important}

.teacher-grade-analyzer .teacher-grade-metric-card>span{font-size:11px;font-weight:850;color:#6c7b8f}
.teacher-grade-analyzer .teacher-grade-metric-card>strong{font-size:19px;line-height:1.12;color:#203b5c;font-weight:950;font-variant-numeric:tabular-nums}
.teacher-grade-analyzer .teacher-grade-metric-card>small{font-size:9.8px!important;margin-top:0!important}
.teacher-grade-analyzer .teacher-grade-distribution-row>b{font-size:12px;color:#253d59;font-weight:950}
.teacher-grade-analyzer .teacher-grade-distribution-row>small{font-size:9.4px!important;margin-top:0!important}
.teacher-grade-analyzer .teacher-grade-result-table th{font-size:10.7px;font-weight:900;color:#344a65;background:#eef3f8;border-right:1px solid #ced9e5;border-bottom:1px solid #c6d2df;padding:9px 7px;white-space:nowrap}
.teacher-grade-analyzer .teacher-grade-result-table td{font-size:11.2px;border-right:1px solid #e0e7ef;border-bottom:1px solid #e0e7ef;padding:9px 7px;text-align:center;vertical-align:middle}
.teacher-grade-analyzer .teacher-grade-result-table th:last-child,.teacher-grade-analyzer .teacher-grade-result-table td:last-child{border-right:0}
.teacher-grade-analyzer .teacher-grade-result-table tbody tr:nth-child(even) td{background:#fbfcfe}
.teacher-grade-analyzer .teacher-grade-result-table tbody tr:hover td{background:#f3f7fc}
.teacher-grade-analyzer .student-id-head,.teacher-grade-analyzer .student-id-cell{width:76px;min-width:76px;max-width:76px}
.teacher-grade-analyzer .student-name-head,.teacher-grade-analyzer .student-name-cell{width:94px;min-width:86px;max-width:102px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.teacher-grade-analyzer .student-class-head,.teacher-grade-analyzer .student-class-cell{width:46px;min-width:46px;max-width:46px}
.teacher-grade-analyzer .student-number-head,.teacher-grade-analyzer .student-number-cell{width:48px;min-width:48px;max-width:48px}
.teacher-grade-analyzer .score-head,.teacher-grade-analyzer .score-cell{width:70px;min-width:64px;max-width:78px;font-variant-numeric:tabular-nums}
.teacher-grade-analyzer .rank-head,.teacher-grade-analyzer .rank-cell{width:70px;min-width:66px;max-width:82px}
.teacher-grade-analyzer .grade-head{width:76px}.teacher-grade-analyzer .achievement-head{width:78px}.teacher-grade-analyzer .status-head{width:108px}
.teacher-grade-analyzer .teacher-grade-weight-row{min-width:0}
.teacher-grade-analyzer .teacher-grade-weight-row .performance-area-name{min-width:0}
.teacher-grade-analyzer .teacher-grade-weight-row .performance-area-name b{display:block;max-width:100%;white-space:normal;word-break:keep-all;overflow-wrap:anywhere}

.teacher-grade-analyzer .performance-area-row{align-items:flex-start!important}
.teacher-grade-analyzer .performance-area-name{padding-right:8px;overflow:visible!important}
.teacher-grade-analyzer .performance-area-name b{max-width:100%!important;overflow:visible!important;text-overflow:clip!important;white-space:normal!important;word-break:keep-all;overflow-wrap:anywhere;line-height:1.38}
.teacher-grade-analyzer .planned-written-row,.teacher-grade-analyzer .planned-performance-row{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:8px!important;border:1px dashed #bcd0e5!important;border-radius:11px;padding:10px!important;margin-top:7px;background:#f4f9fe}
.teacher-grade-analyzer .planned-written-name,.teacher-grade-analyzer .planned-performance-name{display:grid;gap:2px;min-width:0!important;overflow:visible!important}
.teacher-grade-analyzer .planned-written-name input,.teacher-grade-analyzer .planned-performance-name input{width:100%;min-width:0;border:1px solid #c5d5e7;border-radius:8px;background:#fff;padding:7px 9px;color:#315d90;font-size:12px;font-weight:900}
.teacher-grade-analyzer .planned-written-row>span:last-child,.teacher-grade-analyzer .planned-performance-row>span:last-child{width:100%;justify-content:flex-end;flex-wrap:wrap}
.teacher-grade-analyzer .planned-written-row input[type="number"],.teacher-grade-analyzer .planned-performance-row input[type="number"]{width:72px}
.teacher-grade-analyzer .teacher-grade-workspace-browser>div:first-child{display:grid;gap:3px;min-width:210px;flex:1 1 230px}
.teacher-grade-analyzer .teacher-grade-workspace-browser>div:first-child b{font-size:13px;color:#2e435e}
.teacher-grade-analyzer .teacher-grade-workspace-browser>div:first-child span{font-size:10.5px;color:#738196;font-weight:700;line-height:1.4}.teacher-grade-analyzer .minimum-course-rule{white-space:normal}.teacher-grade-analyzer .minimum-course-rule>span:last-child{min-width:0;line-height:1.35}
.teacher-grade-analyzer table{border-collapse:separate!important;border-spacing:0;width:100%;font-family:${FONT_STACK};font-size:11.7px;line-height:1.42}
.teacher-grade-analyzer table th{position:sticky;top:0;z-index:1;padding:11px 9px;border-right:1px solid #d7e0eb;border-bottom:1px solid #cbd6e4;color:#344b67;background:#edf3f9;text-align:center;white-space:nowrap;font-size:11px;font-weight:950}
.teacher-grade-analyzer table th:last-child{border-right:0}
.teacher-grade-analyzer table td{padding:10px 9px;border-right:1px solid #e4eaf1;border-bottom:1px solid #e1e7ef;color:#314157;text-align:center;vertical-align:middle;white-space:nowrap;background:#fff}
.teacher-grade-analyzer table td:last-child{border-right:0}
.teacher-grade-analyzer table tbody tr:nth-child(even) td{background:#fbfcfe}
.teacher-grade-analyzer table tbody tr:hover td{background:#f2f7fd}
.teacher-grade-analyzer .student-id-cell,.teacher-grade-analyzer .student-name-cell,.teacher-grade-analyzer .student-class-cell,.teacher-grade-analyzer .student-number-cell{text-align:center!important}
.teacher-grade-analyzer .student-id-cell b{font-variant-numeric:tabular-nums;color:#315d90}
.teacher-grade-analyzer .student-name-cell b{font-size:12px;color:#24384f}
.teacher-grade-analyzer .teacher-grade-analyzer-search-input{width:100%;min-width:0;border:0;outline:0;color:#27394f;background:transparent;font-size:12.5px;font-weight:750;padding:0}
.teacher-grade-analyzer .teacher-grade-analyzer-search-input::placeholder{color:#9aa6b5;font-weight:650}
.teacher-grade-analyzer .teacher-grade-tie-student>div>div{display:flex;gap:4px}
.teacher-grade-analyzer .teacher-grade-tie-student>div label{display:inline-flex;align-items:center;gap:2px}
.teacher-grade-analyzer .teacher-grade-tie-student>div input[type="number"]{width:47px;padding:5px}
.teacher-grade-analyzer details summary::-webkit-details-marker{display:none}

.teacher-grade-analyzer .grade-cutoff-table-wrap{width:100%;overflow-x:auto;border:1px solid #d9e3ee;border-radius:12px}
.teacher-grade-analyzer .grade-cutoff-table{width:100%;border-collapse:collapse;min-width:430px}
.teacher-grade-analyzer .grade-cutoff-table th{padding:8px 7px;background:#f1f5f9;color:#52657c;font-size:10px;font-weight:900;border-bottom:1px solid #d8e1eb}
.teacher-grade-analyzer .grade-cutoff-table td{padding:8px 7px;text-align:center;font-size:11px;border-bottom:1px solid #e7edf3}
.teacher-grade-analyzer .grade-cutoff-table tr:last-child td{border-bottom:0}
.teacher-grade-analyzer .grade-cutoff-table .grade-cutoff-text{font-size:13px;color:#183f6a;font-weight:950;font-variant-numeric:tabular-nums}
.teacher-grade-analyzer .achievement-donut-layout{display:grid;grid-template-columns:150px minmax(0,1fr);gap:16px;align-items:center}
.teacher-grade-analyzer .achievement-donut{width:138px;height:138px;border-radius:50%;display:grid;place-items:center;box-shadow:inset 0 0 0 1px rgba(44,63,89,.08)}
.teacher-grade-analyzer .achievement-donut>div{width:83px;height:83px;border-radius:50%;display:grid;place-content:center;text-align:center;background:#fff;box-shadow:0 4px 14px rgba(47,70,103,.12)}
.teacher-grade-analyzer .achievement-donut b{font-size:18px;color:#263f5e;font-weight:950}.teacher-grade-analyzer .achievement-donut span{font-size:9px;color:#8090a3;font-weight:800}
.teacher-grade-analyzer .achievement-donut-legend{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
.teacher-grade-analyzer .achievement-donut-legend>div{display:grid;grid-template-columns:10px 32px 1fr;gap:6px;align-items:center;padding:7px 8px;border:1px solid #e1e7ee;border-radius:9px;background:#fafbfd;font-size:10.5px}
.teacher-grade-analyzer .achievement-donut-legend i{width:9px;height:9px;border-radius:50%}.teacher-grade-analyzer .achievement-donut-legend b{text-align:right;font-size:10px;color:#344b67}
.teacher-grade-analyzer .teacher-grade-data-management label{display:grid;gap:5px;color:#65758a;font-size:10px;font-weight:900}.teacher-grade-analyzer .teacher-grade-data-management select{min-height:38px;border:1px solid #d1dce8;border-radius:9px;padding:7px 9px;background:#fff;color:#344a63;font-weight:850}
.teacher-grade-analyzer .teacher-grade-data-management article small{color:#7d8998;font-size:9.8px;line-height:1.45}.teacher-grade-analyzer .teacher-grade-data-management article>div:nth-child(2)>span{padding:4px 7px;border-radius:999px;background:#f1f4f8;color:#5e6f82;font-size:9.5px;font-weight:850}
@media(max-width:760px){.teacher-grade-analyzer .achievement-donut-layout{grid-template-columns:1fr;justify-items:center}.teacher-grade-analyzer .achievement-donut-legend{width:100%}}
@media(max-width:1180px){.teacher-grade-analyzer .teacher-grade-tie-student{grid-template-columns:minmax(150px,1fr) minmax(180px,1fr)!important}.teacher-grade-analyzer .teacher-grade-tie-student>label:last-child{grid-column:1/-1!important}}
@media(max-width:980px){.teacher-grade-analyzer .teacher-grade-hero{grid-template-columns:1fr!important}.teacher-grade-analyzer .teacher-grade-hero-actions{justify-content:flex-start!important;max-width:none!important}.teacher-grade-analyzer .teacher-grade-workspace-browser{align-items:stretch!important}.teacher-grade-analyzer .teacher-grade-workspace-browser>select{flex:1 1 260px!important}}
@media(max-width:720px){.teacher-grade-analyzer .teacher-grade-tie-student{grid-template-columns:1fr 1fr}.teacher-grade-analyzer .teacher-grade-workspace-browser{grid-template-columns:1fr!important}.teacher-grade-analyzer .teacher-grade-weight-row{align-items:flex-start!important;flex-direction:column}.teacher-grade-analyzer .teacher-grade-weight-row>span:last-child{width:100%;justify-content:flex-end}}

.teacher-grade-analyzer .teacher-grade-setting-caption{display:block!important;max-width:205px;margin-top:5px!important;color:#738197!important;font-size:10.2px!important;font-weight:700!important;line-height:1.48!important;white-space:normal!important;word-break:keep-all!important}
.teacher-grade-analyzer .grade-target-count{display:block;color:#7a8797;font-size:9.2px;font-weight:750}
.teacher-grade-analyzer .grade-cutoff-text{display:block;margin-top:2px;color:#173f70;font-size:11.2px;font-weight:950;letter-spacing:-.03em}
.teacher-grade-analyzer .teacher-grade-distribution-row{border-top:3px solid #91a9c3!important}
.teacher-grade-analyzer .teacher-grade-distribution-row:first-child{border-top-color:#292621!important}
.teacher-grade-analyzer .performance-area-name b{font-size:clamp(10px,1.05vw,12px)!important;line-height:1.42!important}
@media(max-width:760px){.teacher-grade-analyzer .setting-caption-break{display:none}}

.teacher-grade-analyzer .student-score-edit-launch{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:38px;border:1px solid #b8cbe0;border-radius:10px;padding:7px 11px;background:#eef5fc;color:#315f92;font-size:11px;font-weight:900;white-space:nowrap;cursor:pointer}
.teacher-grade-analyzer .student-row-edit{border:1px solid #cbd8e7;border-radius:8px;padding:5px 8px;background:#fff;color:#315f92;font-size:10px;font-weight:900;cursor:pointer}
.teacher-grade-analyzer .edit-head{width:58px;min-width:58px}.teacher-grade-analyzer .performance-score-head,.teacher-grade-analyzer .performance-score-cell{width:108px;min-width:100px;max-width:118px}
.teacher-grade-analyzer .performance-score-cell b{display:block}.teacher-grade-analyzer .performance-score-cell small{display:block;max-width:100%;white-space:normal!important;overflow-wrap:anywhere;word-break:break-word;line-height:1.28!important;font-size:9px!important}
.teacher-grade-analyzer .is-excluded-student td{background:#f6f4f1!important;color:#8a8175!important}.teacher-grade-analyzer .enrollment-status-badge{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:5px 8px;background:#eee8df;color:#7a5b42;font-size:9.5px;font-weight:900;white-space:nowrap}
.student-score-editor-overlay{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:18px;background:rgba(25,35,48,.42);backdrop-filter:blur(3px)}
.student-score-editor{width:min(760px,96vw);max-height:90vh;overflow:auto;border-radius:18px;background:#fff;box-shadow:0 24px 70px rgba(28,42,62,.28);padding:18px;font-family:${FONT_STACK};color:#27384d}
.student-score-editor-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding-bottom:12px;border-bottom:1px solid #e1e7ee}.student-score-editor-head>div{display:grid;gap:3px}.student-score-editor-head b{font-size:18px}.student-score-editor-head span{font-size:11px;color:#728196;font-weight:700}.student-score-editor-head>button{width:34px;height:34px;border:1px solid #d7e0ea;border-radius:10px;background:#fff;color:#6f7d8f;font-size:22px;cursor:pointer}
.student-score-editor-grid{display:grid;gap:10px}.student-score-editor-grid.identity{grid-template-columns:1.2fr 1.4fr .7fr .7fr 1fr;margin-top:14px}.student-score-editor-grid.scores{grid-template-columns:repeat(3,minmax(0,1fr));margin-top:9px}.student-score-editor label{display:grid;gap:5px;min-width:0}.student-score-editor label>span{font-size:10.5px;font-weight:900;color:#586b82}.student-score-editor label small{display:block;margin-top:2px;font-size:8.8px;color:#8b97a7}.student-score-editor input,.student-score-editor select{width:100%;min-width:0;min-height:38px;border:1px solid #ced8e5;border-radius:9px;padding:7px 9px;background:#fff;color:#27384d;font-size:11.5px;font-weight:800;outline:none}.student-score-editor-section{margin-top:14px;padding:12px;border:1px solid #e0e7ef;border-radius:12px;background:#f9fbfd}.student-score-editor-section>b{font-size:13px}.student-score-editor-actions{display:flex;align-items:center;gap:8px;margin-top:14px}.student-score-editor-actions>span{flex:1}.student-score-editor-actions button{min-height:38px;border:1px solid #ced9e6;border-radius:10px;padding:8px 13px;background:#fff;color:#536579;font-weight:900;cursor:pointer}.student-score-editor-actions .save{background:#315f92;border-color:#315f92;color:#fff}.student-score-editor-actions .reset{color:#a24a3f;border-color:#efc8c1;background:#fff6f4}.student-score-editor-note{margin:10px 0 0;color:#7a8796;font-size:10px;font-weight:700;line-height:1.45}
.teacher-grade-analyzer .achievement-donut-layout{grid-template-columns:126px minmax(0,1fr)!important;gap:14px!important}.teacher-grade-analyzer .achievement-donut{width:120px!important;height:120px!important}.teacher-grade-analyzer .achievement-donut>div{width:72px!important;height:72px!important}.teacher-grade-analyzer .achievement-donut b{font-size:17px!important}.teacher-grade-analyzer .achievement-donut-legend{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:7px!important;align-content:center}.teacher-grade-analyzer .achievement-donut-legend>div{grid-template-columns:10px 22px 1fr auto!important;gap:6px!important;padding:8px 9px!important;min-width:0}.teacher-grade-analyzer .achievement-donut-legend>div b{text-align:right!important;font-size:11px!important}.teacher-grade-analyzer .achievement-donut-legend>div small{margin:0!important;font-size:9px!important;color:#7c8a9d!important}.teacher-grade-analyzer .achievement-legend-label{font-weight:950;color:#334a65}
@media(max-width:760px){.student-score-editor-grid.identity{grid-template-columns:1fr 1fr}.student-score-editor-grid.scores{grid-template-columns:1fr 1fr}.teacher-grade-analyzer .achievement-donut-legend{grid-template-columns:1fr!important}}

/* Ver16: 결과 요약 및 성취도 시각화 정돈 */
.teacher-grade-analyzer .teacher-grade-metric-card{justify-items:center;text-align:center;padding:13px 12px!important;min-height:88px!important}
.teacher-grade-analyzer .teacher-grade-metric-card>span{font-size:11.3px!important;line-height:1.25;font-weight:900!important}
.teacher-grade-analyzer .teacher-grade-metric-card>strong{font-size:20px!important;line-height:1.05!important}
.teacher-grade-analyzer .teacher-grade-metric-card>small{font-size:10px!important;line-height:1.35!important;text-align:center}
.teacher-grade-analyzer .achievement-donut-shell{display:grid;grid-template-rows:minmax(132px,1fr) auto;gap:12px;min-height:0;height:calc(100% - 28px)}
.teacher-grade-analyzer .achievement-donut-layout{align-items:center!important;min-height:132px}
.teacher-grade-analyzer .achievement-cut-guide{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:center;padding:10px 11px;border-radius:11px;background:#f6f8fb;border:1px solid #e0e6ee}
.teacher-grade-analyzer .achievement-cut-guide>strong{font-size:10.5px;color:#51657e;white-space:nowrap}
.teacher-grade-analyzer .achievement-cut-guide>div{display:flex;gap:6px;flex-wrap:wrap;min-width:0}
.teacher-grade-analyzer .achievement-cut-guide span{display:inline-flex;align-items:center;gap:4px;padding:5px 7px;border-radius:8px;background:#fff;border:1px solid #dde4ec;white-space:nowrap}
.teacher-grade-analyzer .achievement-cut-guide b{font-size:10px;color:#294a70}.teacher-grade-analyzer .achievement-cut-guide small{margin:0!important;font-size:9px!important;color:#748398!important}
.teacher-grade-analyzer .teacher-grade-result-table .student-id-cell,.teacher-grade-analyzer .teacher-grade-result-table .student-name-cell,.teacher-grade-analyzer .teacher-grade-result-table .student-class-cell,.teacher-grade-analyzer .teacher-grade-result-table .student-number-cell{text-align:center!important}
@media(max-width:760px){.teacher-grade-analyzer .achievement-cut-guide{grid-template-columns:1fr}.teacher-grade-analyzer .achievement-cut-guide>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.teacher-grade-analyzer .achievement-cut-guide span{justify-content:space-between}}
@media print{
  body.print-teacher-minimum *{visibility:hidden!important}
  body.print-teacher-minimum .teacher-grade-analyzer .minimum-print-area,body.print-teacher-minimum .teacher-grade-analyzer .minimum-print-area *{visibility:visible!important}
  body.print-teacher-minimum .teacher-grade-analyzer .minimum-print-area{position:absolute;inset:0;width:100%;border:0!important;box-shadow:none!important;padding:0!important}
  body.print-teacher-minimum .teacher-grade-analyzer .no-minimum-print{display:none!important}
  body.print-teacher-minimum .teacher-grade-analyzer table{font-size:9.5pt;min-width:0!important}
  body.print-teacher-minimum .teacher-grade-analyzer table th,body.print-teacher-minimum .teacher-grade-analyzer table td{padding:6px 5px!important}
  body.print-teacher-minimum .teacher-grade-analyzer .teacher-result-toolbar{display:none!important}
}
`;


const ui = {
  root: { fontFamily: FONT_STACK, display: "grid", gap: 16 },
  hero: { display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 18, alignItems: "center", padding: "18px 22px", borderRadius: 20, color: "#fff", background: "linear-gradient(135deg,#6f493f 0%,#8a5b4c 52%,#9d7059 100%)", boxShadow: "0 14px 32px rgba(112,70,57,.20)" },
  eyebrow: { fontSize: 12, fontWeight: 900, letterSpacing: ".04em", opacity: .78 },
  heroTitle: { margin: "4px 0 4px", fontSize: 21, lineHeight: 1.2, letterSpacing: "-.04em", wordBreak: "keep-all" },
  heroDescription: { margin: 0, fontSize: 12.2, lineHeight: 1.45, opacity: .9, wordBreak: "keep-all" },
  heroActions: { display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end", maxWidth: 390 },
  moduleTabs:{display:"flex",gap:7,padding:5,border:"1px solid #ded5cf",borderRadius:13,background:"#fffaf7",width:"fit-content",maxWidth:"100%"},
  moduleTab:{display:"inline-flex",alignItems:"center",gap:6,border:"1px solid transparent",borderRadius:9,padding:"8px 12px",color:"#78675d",background:"transparent",fontFamily:FONT_STACK,fontSize:11.5,fontWeight:900,cursor:"pointer"},
  moduleTabActive:{color:"#fff",background:"#8a5c4b",borderColor:"#8a5c4b",boxShadow:"0 5px 13px rgba(138,92,75,.2)"},
  lightButton: { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid rgba(255,255,255,.35)", borderRadius: 10, padding: "9px 12px", color: "#fff", background: "rgba(255,255,255,.13)", fontFamily: FONT_STACK, fontWeight: 850, cursor: "pointer" },
  publishButton: { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #fff", borderRadius: 10, padding: "9px 12px", color: "#315d90", background: "#fff", fontFamily: FONT_STACK, fontWeight: 900, cursor: "pointer" },
  workspaceBrowser: { display:"flex", flexWrap:"wrap", gap:9, alignItems:"center", padding:"11px 13px", border:"1px solid #dbe4f0", borderRadius:14, background:"#f8fbff", boxShadow:"0 6px 18px rgba(55,72,110,.05)" },
  saveTypeLegend:{display:"flex",gap:8,alignItems:"center",fontSize:9.8,color:"#718096",fontWeight:850},
  localDot:{display:"inline-block",width:8,height:8,borderRadius:"50%",background:"#d58f54",marginRight:4},sharedDot:{display:"inline-block",width:8,height:8,borderRadius:"50%",background:"#4f7fae",marginRight:4},
  workspaceIntro: { display:"grid", gap:3, minWidth:210, flex:"1 1 230px" },
  workspaceSelect: { minWidth:260, flex:"2 1 340px", border:"1px solid #cfdbe9", borderRadius:10, padding:"9px 11px", background:"#fff", color:"#34465d", fontFamily:FONT_STACK, fontWeight:800 },
  subjectSelect: { minWidth:150, flex:"0 1 190px", border:"1px solid #cfdbe9", borderRadius:10, padding:"9px 11px", background:"#fff", color:"#315d90", fontFamily:FONT_STACK, fontWeight:900 },
  subjectInput: { minWidth:170, flex:"0 1 210px", border:"1px solid #cfdbe9", borderRadius:10, padding:"9px 11px", background:"#fff", color:"#315d90", fontFamily:FONT_STACK, fontWeight:900, outline:"none" },
  adminEditBadge: { display:"inline-flex", alignItems:"center", minHeight:38, borderRadius:999, padding:"7px 10px", color:"#315d90", background:"#eaf3fc", border:"1px solid #c4d7eb", fontSize:10.5, fontWeight:950, whiteSpace:"nowrap" },
  secondaryButton: { border:"1px solid #cfdbe9", borderRadius:10, padding:"9px 11px", color:"#42617f", background:"#fff", fontFamily:FONT_STACK, fontWeight:850, cursor:"pointer", whiteSpace:"nowrap" },
  deleteWorkspaceButton: { border:"1px solid #e6c9c5", borderRadius:10, padding:"9px 11px", color:"#9b493f", background:"#fff7f5", fontFamily:FONT_STACK, fontWeight:850, cursor:"pointer", whiteSpace:"nowrap" },
  readOnlyBadge: { borderRadius:999, padding:"6px 9px", color:"#79591e", background:"#fff6df", border:"1px solid #ead2a2", fontSize:10.5, fontWeight:900 },
  collaborationBadge: { borderRadius:999, padding:"6px 9px", color:"#276044", background:"#eaf7ef", border:"1px solid #bfdfcb", fontSize:10.5, fontWeight:900, maxWidth:260, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" },
  section: { border: "1px solid #dde4ef", borderRadius: 18, background: "#fff", padding: 18, boxShadow: "0 8px 24px rgba(55,72,110,.06)" },
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" },
  stepBadge: { width: 26, height: 26, borderRadius: 9, display: "inline-flex", justifyContent: "center", alignItems: "center", marginRight: 9, color: "#fff", background: "#3568a3", fontSize: 12, fontWeight: 900 },
  sectionTitle: { fontSize: 16.5, letterSpacing: "-.025em" },
  sectionHint: { margin: "5px 0 0 35px", color: "#7c8798", fontSize: 11.5 },
  contextBadge: { border: "1px solid #cbd9ec", borderRadius: 999, padding: "7px 11px", color: "#315d90", background: "#f3f7fc", fontSize: 11.5, fontWeight: 850 },
  uploadGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 },
  uploadCard: { display: "flex", alignItems: "center", gap: 12, border: "1px dashed #bfcde0", borderRadius: 14, padding: 14, background: "#f8fbff" },
  uploadIcon: { width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: "#3568a3", background: "#e8f1fb" },
  uploadTitle: { display: "flex", alignItems: "center", gap: 7, fontWeight: 900, fontSize: 14 },
  primaryButton: { display: "inline-flex", alignItems: "center", gap: 5, flex: "0 0 auto", border: 0, borderRadius: 10, padding: "9px 11px", color: "#fff", background: "#3568a3", fontFamily: FONT_STACK, fontWeight: 850, cursor: "pointer" },
  messageList: { display: "grid", gap: 5, marginTop: 12 },
  message: { display: "flex", gap: 7, alignItems: "center", borderRadius: 9, padding: "7px 9px", fontSize: 11.5 },
  messageOk: { color: "#28633f", background: "#eff9f2", border: "1px solid #c8e7d1" },
  messageWarn: { color: "#8a5f14", background: "#fff8e8", border: "1px solid #efd99e" },
  messageError: { color: "#a23a32", background: "#fff1ef", border: "1px solid #efc4c0" },
  settingsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 },
  settingCard: { minWidth: 0, border: "1px solid #dce5ef", borderRadius: 16, padding: 15, background: "linear-gradient(180deg,#fcfdff,#f8fbfe)" },
  settingTitleRow: { display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10, marginBottom:8 },
  settingTitle: { marginBottom: 4, fontSize: 14, fontWeight: 950, color: "#263b55", letterSpacing:"-.035em" },
  addAssessmentButton:{display:"inline-flex",alignItems:"center",gap:4,border:"1px solid #bdd0e5",borderRadius:9,padding:"7px 9px",color:"#315d90",background:"#eef6fd",fontWeight:900,fontSize:10.8,cursor:"pointer",whiteSpace:"nowrap"},
  weightRow: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid #e7edf4" },
  plannedWeightRow:{},
  compactScoreInput:{display:"inline-grid",gap:2,color:"#768396",fontSize:9.5,textAlign:"center"},
  percentInput: { display: "inline-flex", alignItems: "center", gap: 4, color: "#586779", fontWeight: 800 },
  weightActions: { display: "inline-flex", alignItems: "center", gap: 6 },
  removeFileButton: { width: 25, height: 25, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid #e4c9c5", borderRadius: 7, color: "#a74a40", background: "#fff7f5", fontSize: 16, lineHeight: 1, cursor: "pointer" },
  fileChipRow: { display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 7 },
  fileChip: { border: "1px solid #cbd9e8", borderRadius: 999, padding: "4px 8px", color: "#46637f", background: "#f3f7fb", fontSize: 10.5, fontWeight: 850, cursor: "pointer" },
  subtotal: { display: "grid", gridTemplateColumns:"1fr auto", gap:"2px 10px", alignItems:"center", marginTop: 11, paddingTop: 10, color: "#526174", fontSize: 12, borderTop:"1px solid #dfe7ef" },
  settingsHeaderActions:{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:8,flexWrap:"wrap"},
  criteriaSaveButton:{display:"inline-flex",alignItems:"center",gap:6,border:"1px solid #b8cde0",borderRadius:10,padding:"8px 11px",color:"#315d6b",background:"#f3faf7",fontFamily:FONT_STACK,fontSize:11.5,fontWeight:950,cursor:"pointer"},
  totalBadge: { borderRadius: 999, padding: "7px 12px", fontWeight: 900, fontSize: 12 },
  totalBadgeOk: { color: "#28633f", background: "#eaf7ee", border: "1px solid #bddfc8" },
  totalBadgeWarn: { color: "#9a5a1e", background: "#fff5e8", border: "1px solid #efd1a2" },
  choiceGroup: { display: "grid", gap: 6, marginBottom: 10, color: "#59687a", fontSize: 11.5, fontWeight: 800 },
  toggle: { display: "flex", gap: 5, flexWrap: "wrap" },
  toggleButton: { border: "1px solid #d4deeb", borderRadius: 9, padding: "7px 10px", color: "#56677b", background: "#fff", fontFamily: FONT_STACK, fontSize: 11.5, fontWeight: 850, cursor: "pointer" },
  toggleButtonActive: { color: "#fff", background: "#3568a3", borderColor: "#3568a3", boxShadow: "0 5px 13px rgba(53,104,163,.2)" },
  manualCutNote: { marginTop: 5, borderRadius: 8, padding: "7px 8px", color: "#765b24", background: "#fff8e7", fontSize: 10.5, lineHeight: 1.45 },
  cutGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(82px,1fr))", gap: 7, marginTop: 8 },
  ruleNote: { borderRadius: 9, padding: "9px 10px", color: "#6c5a2a", background: "#fff8e8", fontSize: 11.3, lineHeight: 1.5 },
  minimumCourseRule:{display:"grid",gridTemplateColumns:"28px minmax(0,1fr)",gap:8,alignItems:"center",marginTop:9,padding:"10px 11px",border:"1px solid #c8ddec",borderRadius:10,color:"#315d78",background:"#f0f7fc",fontSize:11.2},
  minimumCourseIcon:{width:28,height:28,display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:8,color:"#315d90",background:"#dfeefa",flex:"0 0 auto"},
  minimumCourseCopy:{display:"grid",gap:2,minWidth:0,lineHeight:1.35},
  tieRuleBox: { display: "grid", gap: 4, marginTop: 12, border: "1px solid #d9e2ef", borderRadius: 12, padding: "11px 13px", color: "#526174", background: "#f7f9fc", fontSize: 11.5, lineHeight: 1.55 },
  roundingRuleBox: { display: "grid", gap: 4, marginTop: 8, border: "1px solid #d5e4dd", borderRadius: 12, padding: "10px 13px", color: "#456354", background: "#f3faf6", fontSize: 11.3, lineHeight: 1.5 },
  resultTabs: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 15, padding:"5px", border:"1px solid #e0e7f0", borderRadius:14, background:"#f7f9fc" },
  resultTab: { border: "1px solid transparent", borderRadius: 10, padding: "9px 14px", color: "#54667a", background: "transparent", fontFamily: FONT_STACK, fontSize:12, fontWeight: 900, cursor: "pointer" },
  resultTabActive: { color: "#fff", background: "#3568a3", borderColor: "#3568a3", boxShadow:"0 5px 14px rgba(53,104,163,.22)" },
  minimumResultTab:{display:"inline-flex",alignItems:"center",gap:5},
  minimumControlPanel:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:14,flexWrap:"wrap",marginBottom:12,padding:"12px 14px",border:"1px solid #cdddeb",borderRadius:13,background:"linear-gradient(135deg,#f4f9fd,#f8f7fd)"},
  minimumInputRow:{display:"flex",gap:8,alignItems:"end",flexWrap:"wrap"},
  courseTypeBadge:{display:"inline-flex",width:"fit-content",borderRadius:999,padding:"4px 8px",color:"#315d90",background:"#e9f2fc",fontSize:10.5,fontWeight:950,whiteSpace:"nowrap"},
  emptyState: { minHeight: 190, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "#7a8798", background: "#fafbfd", border: "1px dashed #d4deea", borderRadius: 14 },
  warningBanner: { display: "flex", gap: 8, alignItems: "center", marginBottom: 12, padding: "9px 11px", color: "#8a5d18", background: "#fff7e7", border: "1px solid #ead194", borderRadius: 10, fontSize: 11.8, fontWeight: 750 },
  metricGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(135px,1fr))", gap: 10, marginBottom: 12 },
  metricCard: { display: "grid", gap: 4, alignContent:"center", minHeight:92, border: "1px solid #dbe4ee", borderRadius: 14, padding: "12px 13px", background: "linear-gradient(180deg,#fff,#f8fafc)" },
  metricDanger: { borderColor: "#edc4bd", background: "#fff6f4" },
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(310px,1fr))", gap: 12, marginBottom: 12 },
  summaryPanel: { border: "1px solid #d9e3ee", borderRadius: 15, padding: 14, background: "#fff", boxShadow:"0 4px 14px rgba(47,70,103,.04)" },
  summaryTitle: { display: "flex", gap: 7, alignItems: "center", marginBottom: 10, fontSize: 13.5, fontWeight: 900 },
  distributionList: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(118px,1fr))", gap: 7 },
  distributionRow: { display: "grid", gap: 4, alignContent:"center", minHeight:76, border:"1px solid #e6ebf1", borderRadius: 11, padding: "9px 10px", background: "#f8fafc", fontSize: 11.5 },
  gradePill: { width: "fit-content", borderRadius: 999, padding: "4px 8px", color: "#315d90", background: "#e9f2fc", fontSize: 10.5, fontWeight: 950 },
  gradePillFirst:{color:"#ffd85a",background:"#26231f",border:"1px solid #26231f"},
  quotaNote:{margin:"10px 0 0",color:"#7b8797",fontSize:10.5,lineHeight:1.5},
  failPill: { color: "#a33b35", background: "#fdeceb" },
  riskPanel: { marginBottom:12, border:"1px solid #efc8c3", borderRadius:14, padding:12, background:"linear-gradient(135deg,#fff8f6,#fffdf9)" },
  riskPanelHead: { display:"flex", justifyContent:"space-between", gap:12, alignItems:"center", color:"#8f453a" },
  riskChips: { display:"flex", flexWrap:"wrap", gap:6, marginTop:9 },
  tieDetails: { marginBottom: 12, border: "1px solid #ead49f", borderRadius: 13, background: "#fffbf2", overflow: "hidden" },
  tieSummary: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", cursor: "pointer", color: "#73511c", fontSize: 12.5, fontWeight: 900 },
  tieBody: { padding: "0 12px 12px", color: "#725f3c", fontSize: 11.5 },
  tieGroup: { marginTop: 9, border: "1px solid #eadcbc", borderRadius: 10, padding: 9, background: "#fff" },
  tieGroupTitle: { marginBottom: 7, fontWeight: 900 },
  tieStudent: { display: "grid", gridTemplateColumns: "minmax(145px,.85fr) minmax(185px,1fr) minmax(185px,1fr) minmax(150px,.72fr)", gap: 8, alignItems: "center", padding: "8px 0", borderTop: "1px solid #f0e9dc" },
  tiePriority:{display:"grid",gap:4,color:"#735f3e",fontSize:10.5},
  writtenTieStudent:{display:"grid",gridTemplateColumns:"minmax(180px,1fr) minmax(150px,220px)",gap:10,alignItems:"center",padding:"8px 0",borderTop:"1px solid #f0e9dc"},
  tieItemSet: { display: "grid", gap: 4, color: "#735f3e", fontSize: 10.5 },
  tableToolbar: { display: "flex", gap: 9, alignItems: "stretch", marginBottom: 11, flexWrap: "wrap" },
  searchBox: { flex: "1 1 300px", minHeight:46, display: "flex", gap: 10, alignItems: "center", border: "1.5px solid #c8d7e8", borderRadius: 14, padding: "7px 13px", background: "linear-gradient(180deg,#fff,#f8fbff)", boxShadow:"0 3px 10px rgba(47,75,113,.05)" },
  searchIcon:{width:30,height:30,display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:9,color:"#3568a3",background:"#e9f2fc",flex:"0 0 auto"},
  searchField:{display:"grid",gap:1,flex:1,minWidth:0},
  searchLabel:{fontSize:9.5,color:"#7e8b9c",fontWeight:850},
  select: { minHeight:46, border: "1.5px solid #cfd9e6", borderRadius: 13, padding: "8px 12px", color:"#34485f", fontFamily: FONT_STACK, fontWeight:850, background: "#fff" },
  resultCount: { marginLeft: "auto", color: "#748195", fontSize: 11.5, fontWeight: 800 },
  tableScroll: { overflowX: "auto", border: "1px solid #cfd9e5", borderRadius: 14, background:"#fff", boxShadow:"0 5px 16px rgba(47,70,103,.04)" },
  table: { width: "100%", minWidth: 860, borderCollapse: "separate", borderSpacing:0, fontSize: 11.5, fontFamily: FONT_STACK, tableLayout:"auto" },
  incompleteRow: { background: "#fff8f6" },
  tableGrade: { display: "inline-flex", minWidth: 46, justifyContent: "center", borderRadius: 999, padding: "5px 8px", color: "#315d90", background: "#e8f1fb", border:"1px solid #cbdced", fontWeight: 950, whiteSpace:"nowrap" },
  firstGradeMark: { display:"inline-flex", minWidth:46, alignItems:"center", justifyContent:"center", borderRadius:999, padding:"5px 8px", color:"#ffd85a", background:"#26231f", border:"1px solid #26231f", fontWeight:950, whiteSpace:"nowrap", boxShadow:"0 3px 8px rgba(38,35,31,.14)" },
  achievementBadge: { display: "inline-flex", borderRadius: 999, padding: "4px 7px", color: "#28633f", background: "#eaf7ee", fontWeight: 900 },
  achievementFail: { color: "#a23b34", background: "#fdeceb" },
  okText: { display: "inline-flex", gap: 4, alignItems: "center", color: "#327046", fontWeight: 800 },
  warnText: { color: "#a14935", fontSize: 10.5, fontWeight: 750 },
  failText:{color:"#a33b35",fontWeight:900},
  notApplicable:{color:"#68778a",background:"#eef1f5",borderRadius:999,padding:"4px 7px",fontSize:10.5,fontWeight:850},
  attendanceOk:{color:"#28633f",background:"#eaf7ee",borderRadius:999,padding:"4px 7px",fontSize:10.5,fontWeight:900},
  checkPill:{color:"#5f6875",background:"#eef1f5",borderRadius:999,padding:"4px 7px",fontSize:10.5,fontWeight:900},
  missingStack:{display:"grid",gap:3,whiteSpace:"normal"},
  minimumStatusBadge:{display:"inline-flex",borderRadius:999,padding:"5px 8px",fontSize:10.5,fontWeight:950,whiteSpace:"nowrap"},
  minimumStatusFail:{color:"#a23b34",background:"#fdeceb"},minimumStatusRisk:{color:"#8a5d18",background:"#fff4dc"},minimumStatusReached:{color:"#28633f",background:"#eaf7ee"},minimumStatusCheck:{color:"#5f6875",background:"#eef1f5"},
  minimumFailRow:{background:"#fff5f3"},minimumRiskRow:{background:"#fffbf1"},
  printButton:{display:"inline-flex",alignItems:"center",gap:5,border:"1px solid #bfd0e3",borderRadius:10,padding:"8px 11px",color:"#315d90",background:"#f3f8fd",fontWeight:900,cursor:"pointer"},
  dataFilterBar:{display:"flex",alignItems:"end",gap:9,flexWrap:"wrap",marginBottom:12,padding:"10px 11px",border:"1px solid #e0e6ed",borderRadius:12,background:"#fafbfd"},
  dataManagementGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:10},
  dataWorkspaceCard:{display:"grid",gap:9,padding:"13px",border:"1px solid #dbe3ec",borderRadius:13,background:"linear-gradient(180deg,#fff,#fafbfd)"},
  dataWorkspaceHead:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8},
  dataWorkspaceMeta:{display:"flex",gap:5,flexWrap:"wrap"},
  localSourceBadge:{display:"inline-flex",marginRight:6,padding:"3px 6px",borderRadius:999,color:"#8a5a31",background:"#fff1e5",fontSize:9,fontWeight:950},
  sharedSourceBadge:{display:"inline-flex",marginRight:6,padding:"3px 6px",borderRadius:999,color:"#315d90",background:"#e8f1fb",fontSize:9,fontWeight:950},
  iconDangerButton:{display:"inline-flex",alignItems:"center",justifyContent:"center",width:31,height:31,border:"1px solid #e5c7c0",borderRadius:9,color:"#a34b3f",background:"#fff7f5",cursor:"pointer"},
  dangerOutlineButton:{display:"inline-flex",alignItems:"center",gap:6,border:"1px solid #dfb9b1",borderRadius:10,padding:"8px 10px",color:"#9d463b",background:"#fff8f6",fontFamily:FONT_STACK,fontSize:10.5,fontWeight:900,cursor:"pointer"},
  emptyLine: { color: "#8b98a8", fontSize: 11.5, padding: "16px 2px", lineHeight:1.5 },
};

