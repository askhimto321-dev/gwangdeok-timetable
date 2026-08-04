import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  Download,
  FileSpreadsheet,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Star,
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
    },
    tieScores: {},
  };
}
function normalizeWorkspaceSnapshot(parsed = {}) {
  return {
    ...defaultWorkspace(),
    ...parsed,
    settings: { ...defaultWorkspace().settings, ...(parsed.settings || {}), manualCuts: { ...FIXED_COMMON_CUTS, ...(parsed.settings?.manualCuts || {}) } },
    written: Array.isArray(parsed.written) ? parsed.written : [],
    performance: Array.isArray(parsed.performance) ? parsed.performance : [],
    tieScores: parsed.tieScores || {},
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

export default function TeacherGradeAnalyzer({ teacher, roster = {}, grade = "2", showToast, db = {}, persist, accessRole = "teacher", homeroomClass = "", canViewAllSubjects = false }) {
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
  const [activeView, setActiveView] = useState("combined");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState(homeroomClass ? String(homeroomClass) : "all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [selectedSharedId, setSelectedSharedId] = useState("");
  const [uploadMessages, setUploadMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const writtenInputRef = useRef(null);
  const performanceInputRef = useRef(null);

  const sharedWorkspaces = useMemo(() => Object.values(db?.teacherGradeWorkspaces || {})
    .filter(item => String(item?.grade || "") === String(grade))
    .filter(item => canViewAllSubjects || item?.ownerId === teacher?.id)
    .sort((a, b) => String(a?.subject || "").localeCompare(String(b?.subject || ""), "ko") || String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || ""))), [db?.teacherGradeWorkspaces, grade, canViewAllSubjects, teacher?.id]);
  const selectedShared = sharedWorkspaces.find(item => item.id === selectedSharedId) || null;
  const readOnlyShared = !!selectedShared && selectedShared.ownerId !== teacher?.id && !["admin", "department", "monitor"].includes(accessRole);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ activeId: selectedLocalId, workspaces: localWorkspaces })); } catch { /* browser storage unavailable */ }
  }, [storageKey, selectedLocalId, localWorkspaces]);

  useEffect(() => {
    if (!selectedLocalId || !localWorkspaces[selectedLocalId]) return;
    const context = written[0] || performance[0] || null;
    setLocalWorkspaces(current => ({
      ...current,
      [selectedLocalId]: {
        ...current[selectedLocalId],
        id: selectedLocalId,
        subject: context?.subject || current[selectedLocalId]?.subject,
        year: context?.year || current[selectedLocalId]?.year,
        semester: context?.semester || current[selectedLocalId]?.semester,
        grade: context?.grade || current[selectedLocalId]?.grade || Number(grade),
        written,
        performance,
        settings,
        tieScores,
        updatedAt: new Date().toISOString(),
      },
    }));
  }, [selectedLocalId, written, performance, settings, tieScores]);

  const sortedWritten = useMemo(() => [...written].sort((a, b) => writtenOrder(a) - writtenOrder(b) || text(a.title).localeCompare(text(b.title), "ko")), [written]);
  const canonicalAreas = useMemo(() => performance[0]?.areas || [], [performance]);
  const context = written[0] || performance[0] || null;
  const workspaceId = workspaceIdFromContext(context, grade);
  const localWorkspaceList = useMemo(() => Object.values(localWorkspaces || {})
    .sort((a, b) => String(a?.subject || "").localeCompare(String(b?.subject || ""), "ko") || String(b?.updatedAt || "").localeCompare(String(a?.updatedAt || ""))), [localWorkspaces]);
  const workspaceSelection = selectedLocalId ? `local:${selectedLocalId}` : selectedSharedId ? `shared:${selectedSharedId}` : "";
  const currentSnapshot = () => ({
    id: workspaceId,
    ownerId: teacher?.id || accessRole,
    ownerName: teacher?.name || "관리자",
    year: context?.year,
    semester: context?.semester,
    grade: context?.grade || Number(grade),
    subject: context?.subject,
    written,
    performance,
    settings,
    tieScores,
    updatedAt: new Date().toISOString(),
  });
  const saveLocalWorkspace = () => {
    if (!context || !workspaceId) { showToast?.("먼저 지필 또는 수행평가 파일을 업로드해주세요.", "error"); return; }
    const snapshot = currentSnapshot();
    setLocalWorkspaces(current => ({ ...current, [workspaceId]: snapshot }));
    setSelectedLocalId(workspaceId);
    setSelectedSharedId("");
    showToast?.(`${context.subject} 성적 작업을 과목별로 저장했습니다.`, "success");
  };
  const publishWorkspace = async () => {
    if (!context || !workspaceId) { showToast?.("먼저 지필 또는 수행평가 파일을 업로드해주세요.", "error"); return; }
    if (readOnlyShared) { showToast?.("다른 교사가 반영한 과목은 열람만 가능합니다.", "error"); return; }
    const snapshot = currentSnapshot();
    setLocalWorkspaces(current => ({ ...current, [workspaceId]: snapshot }));
    setSelectedLocalId(workspaceId);
    const next = { ...(db?.teacherGradeWorkspaces || {}), [workspaceId]: snapshot };
    const ok = await persist?.({ teacherGradeWorkspaces: next });
    if (ok !== false) { setSelectedSharedId(workspaceId); setSelectedLocalId(""); showToast?.(`${context.subject} 성적 자료를 학교 공용 자료에 반영했습니다.`, "success"); }
  };
  const applyWorkspace = item => {
    const normalized = normalizeWorkspaceSnapshot(item);
    setWritten(normalized.written);
    setPerformance(normalized.performance);
    setSettings(normalized.settings);
    setTieScores(normalized.tieScores);
    setActiveView((normalized.written || []).slice().sort((a, b) => writtenOrder(a) - writtenOrder(b))[0]?.id || "combined");
    setClassFilter(homeroomClass ? String(homeroomClass) : "all");
    setGradeFilter("all");
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
  const startNewWorkspace = () => {
    const fresh = defaultWorkspace();
    setSelectedLocalId(""); setSelectedSharedId(""); setWritten([]); setPerformance([]); setSettings(fresh.settings); setTieScores({});
    setActiveView("combined"); setClassFilter(homeroomClass ? String(homeroomClass) : "all"); setGradeFilter("all"); setSearch(""); setUploadMessages([]);
  };
  const deleteLocalWorkspace = () => {
    if (!selectedLocalId || !localWorkspaces[selectedLocalId]) return;
    const item = localWorkspaces[selectedLocalId];
    if (!window.confirm(`${item.subject || "이 과목"}의 브라우저 저장 자료를 삭제할까요? 학교에 반영된 자료는 삭제되지 않습니다.`)) return;
    setLocalWorkspaces(current => { const next = { ...current }; delete next[selectedLocalId]; return next; });
    startNewWorkspace();
    showToast?.("과목별 브라우저 저장 자료를 삭제했습니다.", "success");
  };
  const weightTotal = useMemo(() => {
    const writtenWeight = sortedWritten.reduce((sum, item) => sum + (asNumber(item.weight) || 0), 0);
    const performanceWeight = canonicalAreas.reduce((sum, area) => sum + (asNumber(area.weight) || 0), 0);
    return { written: roundTo(writtenWeight, 2), performance: roundTo(performanceWeight, 2), total: roundTo(writtenWeight + performanceWeight, 2) };
  }, [sortedWritten, canonicalAreas]);

  const updateWrittenWeight = (id, value) => setWritten(current => current.map(item => item.id === id ? { ...item, weight: asNumber(value) ?? 0 } : item));
  const removeWritten = id => { setWritten(current => current.filter(item => item.id !== id)); if (activeView === id) setActiveView("combined"); };
  const removePerformance = id => setPerformance(current => current.filter(item => item.id !== id));
  const updateAreaWeight = (areaId, value) => {
    const next = asNumber(value) ?? 0;
    setPerformance(current => current.map(file => ({ ...file, areas: file.areas.map(area => area.id === areaId ? { ...area, weight: next } : area) })));
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
        accepted.forEach(item => {
          if (ids.has(item.id)) {
            messages.push({ type: "warn", text: `${item.fileName}: 같은 지필평가가 이미 등록되어 중복 저장하지 않았습니다.` });
            return;
          }
          const existingCount = next.length;
          next.push({ ...item, weight: existingCount < 2 ? 25 : 0 });
          ids.add(item.id);
          messages.push({ type: "ok", text: `${item.title} · ${Object.values(item.students).filter(student => student.score != null).length}명 점수를 불러왔습니다.` });
        });
        setWritten(next);
        if (messages.length) setUploadMessages(current => [...messages.reverse(), ...current].slice(0, 10));
      } else {
        const occupiedClasses = new Set(performance.flatMap(item => item.classes.map(classNumber => `${contextKey(item)}:${classNumber}`)));
        const next = [...performance];
        const messages = [];
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
          }
          next.push(item);
          item.classes.forEach(classNumber => occupiedClasses.add(`${contextKey(item)}:${classNumber}`));
          messages.push({ type: "ok", text: `${item.classes.join(", ")}반 수행평가 · ${Object.keys(item.students).length}명을 불러왔습니다.` });
        });
        setPerformance(next);
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
    const studentIds = new Set();
    sortedWritten.forEach(item => Object.keys(item.students || {}).forEach(sid => studentIds.add(sid)));
    performance.forEach(item => Object.keys(item.students || {}).forEach(sid => studentIds.add(sid)));
    const performanceStudentMap = {};
    performance.forEach(file => Object.entries(file.students || {}).forEach(([sid, student]) => { performanceStudentMap[sid] = student; }));
    const secondExam = sortedWritten.find(item => writtenOrder(item) === 2) || sortedWritten[1] || null;
    const firstExam = sortedWritten.find(item => writtenOrder(item) === 1) || sortedWritten[0] || null;
    const performanceOnly = weightTotal.written === 0 && Math.abs(weightTotal.performance - 100) < 1e-9;
    const rows = Array.from(studentIds).map(sid => {
      const perfStudent = performanceStudentMap[sid];
      const info = rosterNames[sid] || {};
      const writtenScores = {};
      let weightedWritten = 0;
      let completedWeight = 0;
      const missing = [];
      sortedWritten.forEach(item => {
        const student = item.students?.[sid];
        writtenScores[item.id] = student?.score ?? null;
        if (student?.score == null) missing.push(`${item.title}${student?.status && student.status !== "미입력" ? `(${student.status})` : ""}`);
        else { const itemWeight=asNumber(item.weight) || 0; weightedWritten += (student.score / (item.maxScore || 100)) * itemWeight; completedWeight += itemWeight; }
      });
      let weightedPerformance = 0;
      const areaScores = {};
      canonicalAreas.forEach(area => {
        const score = perfStudent?.scores?.[area.id] ?? null;
        areaScores[area.id] = score;
        if (score == null) missing.push(area.name);
        else { const areaWeight=asNumber(area.weight) || 0; weightedPerformance += (score / (area.maxScore || 100)) * areaWeight; completedWeight += areaWeight; }
      });
      const complete = missing.length === 0 && weightTotal.total > 0;
      const convertedScore = complete ? roundTo(weightedWritten + weightedPerformance, 2) : null;
      const officialScore = convertedScore == null ? null : Math.round(convertedScore);
      const tie = tieScores[sid] || {};
      const baseVector = [
        convertedScore,
        roundTo(weightedWritten, 2),
        roundTo(weightedPerformance, 2),
        secondExam?.students?.[sid]?.score,
        firstExam?.students?.[sid]?.score,
        ...canonicalAreas.map(area => areaScores[area.id]),
      ];
      const secondTieItems = Array.from({ length: 3 }, (_, index) => asNumber(tie.secondItems?.[index]));
      const firstTieItems = Array.from({ length: 3 }, (_, index) => asNumber(tie.firstItems?.[index]));
      const fullVector = performanceOnly ? baseVector : [...baseVector, ...secondTieItems, ...firstTieItems];
      return {
        sid,
        name: perfStudent?.name || info.name || "",
        classNumber: perfStudent?.classNumber || Number(sid.slice(1, 3)) || info.class || null,
        number: perfStudent?.number || Number(sid.slice(3, 5)) || info.number || null,
        neisId: perfStudent?.neisId || "",
        writtenScores,
        areaScores,
        weightedWritten: roundTo(weightedWritten, 4),
        weightedPerformance: roundTo(weightedPerformance, 4),
        completedWeight: roundTo(completedWeight, 2),
        progressRate: completedWeight > 0 ? roundTo(((weightedWritten + weightedPerformance) / completedWeight) * 100, 1) : null,
        convertedScore,
        officialScore,
        complete,
        missing,
        baseVector,
        fullVector,
      };
    });
    const completeRows = rows.filter(row => row.complete).sort((a, b) => compareVectors(a.fullVector, b.fullVector) || a.sid.localeCompare(b.sid));
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
      row.percentile = (row.midRank / completeRows.length) * 100;
      row.grade = gradeFromPercentile(row.percentile, settings.gradeSystem);
      row.achievement = achievementFromScore(settings.achievementMode === "fixed" ? row.officialScore : row.convertedScore, settings.courseType, settings.achievementMode, settings.manualCuts);
    });
    return [...completeRows, ...rows.filter(row => !row.complete).sort((a, b) => a.sid.localeCompare(b.sid))];
  }, [sortedWritten, performance, canonicalAreas, weightTotal, tieScores, rosterNames, settings.gradeSystem, settings.courseType, settings.achievementMode, settings.manualCuts]);

  const writtenCombinedRows = useMemo(() => {
    const studentIds = new Set();
    sortedWritten.forEach(item => Object.keys(item.students || {}).forEach(sid => studentIds.add(sid)));
    const secondExam = sortedWritten.find(item => writtenOrder(item) === 2) || sortedWritten[1] || null;
    const firstExam = sortedWritten.find(item => writtenOrder(item) === 1) || sortedWritten[0] || null;
    const rows = Array.from(studentIds).map(sid => {
      const info = rosterNames[sid] || {};
      const writtenScores = {};
      const missing = [];
      let converted = 0;
      sortedWritten.forEach(item => {
        const student = item.students?.[sid];
        writtenScores[item.id] = student?.score ?? null;
        if (student?.score == null) missing.push(`${item.title}${student?.status ? `(${student.status})` : ""}`);
        else converted += (student.score / (item.maxScore || 100)) * (asNumber(item.weight) || 0);
      });
      const complete = sortedWritten.length > 0 && missing.length === 0 && weightTotal.written > 0;
      const score = complete ? roundTo((converted / weightTotal.written) * 100, 2) : null;
      const vector = [score, secondExam?.students?.[sid]?.score, firstExam?.students?.[sid]?.score];
      return {
        sid,
        name: info.name || "",
        classNumber: Number(sid.slice(1, 3)) || info.class || null,
        number: Number(sid.slice(3, 5)) || info.number || null,
        writtenScores,
        score,
        complete,
        missing,
        vector,
      };
    });
    const completeRows = rows.filter(row => row.complete).sort((a, b) => compareVectors(a.vector, b.vector) || a.sid.localeCompare(b.sid));
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
      row.percentile = (row.midRank / completeRows.length) * 100;
      row.grade = gradeFromPercentile(row.percentile, settings.gradeSystem);
    });
    return [...completeRows, ...rows.filter(row => !row.complete).sort((a, b) => a.sid.localeCompare(b.sid))];
  }, [sortedWritten, rosterNames, weightTotal.written, settings.gradeSystem]);

  const writtenRowsById = useMemo(() => {
    const result = {};
    sortedWritten.forEach(item => {
      const rows = Object.values(item.students || {}).map(student => {
        const info = rosterNames[student.sid] || {};
        return {
          sid: student.sid,
          name: info.name || "",
          classNumber: student.classNumber,
          number: student.number,
          score: student.score,
          status: student.status,
        };
      });
      const complete = rows.filter(row => Number.isFinite(row.score)).sort((a, b) => b.score - a.score || a.sid.localeCompare(b.sid));
      let priorScore = null;
      let rank = 0;
      complete.forEach((row, index) => {
        if (row.score !== priorScore) rank = index + 1;
        row.rank = rank;
        priorScore = row.score;
      });
      const counts = complete.reduce((map, row) => map.set(row.score, (map.get(row.score) || 0) + 1), new Map());
      complete.forEach(row => {
        row.tieCount = counts.get(row.score) || 1;
        row.midRank = row.rank + (row.tieCount - 1) / 2;
        row.percentile = (row.midRank / complete.length) * 100;
        row.grade = gradeFromPercentile(row.percentile, settings.gradeSystem);
      });
      result[item.id] = [...complete, ...rows.filter(row => !Number.isFinite(row.score))];
    });
    return result;
  }, [sortedWritten, rosterNames, settings.gradeSystem]);

  const activeRows = activeView === "combined" ? combinedRows : activeView === "writtenCombined" ? writtenCombinedRows : (writtenRowsById[activeView] || []);
  const filteredRows = useMemo(() => activeRows.filter(row => {
    if (classFilter !== "all" && String(row.classNumber) !== classFilter) return false;
    if (gradeFilter !== "all" && String(row.grade || "") !== gradeFilter) return false;
    const query = normalizeToken(search);
    if (!query) return true;
    return [row.sid, row.name, row.neisId].some(value => normalizeToken(value).includes(query));
  }), [activeRows, classFilter, gradeFilter, search]);
  const completeActiveRows = activeRows.filter(row => activeView === "combined" ? row.complete : Number.isFinite(row.score));
  const classes = useMemo(() => Array.from(new Set(activeRows.map(row => row.classNumber).filter(Boolean))).sort((a, b) => a - b), [activeRows]);
  const activeStats = activeView === "combined"
    ? assessmentStats(completeActiveRows.map(row => row.convertedScore))
    : assessmentStats(completeActiveRows.map(row => row.score));

  const gradeDistribution = useMemo(() => {
    const maxGrade = Number(settings.gradeSystem);
    return Array.from({ length: maxGrade }, (_, index) => {
      const gradeValue = index + 1;
      const rows = completeActiveRows.filter(row => row.grade === gradeValue);
      return {
        grade: gradeValue,
        count: rows.length,
        min: rows.length ? Math.min(...rows.map(row => activeView === "combined" ? row.convertedScore : row.score)) : null,
        max: rows.length ? Math.max(...rows.map(row => activeView === "combined" ? row.convertedScore : row.score)) : null,
      };
    });
  }, [completeActiveRows, settings.gradeSystem, activeView]);
  const achievementDistribution = useMemo(() => {
    const labels = settings.courseType === "common" ? ["A", "B", "C", "D", "E", "미도달"] : ["A", "B", "C", "D", "E"];
    return labels.map(label => ({ label, count: combinedRows.filter(row => row.complete && row.achievement === label).length }));
  }, [combinedRows, settings.courseType]);
  const minimumRiskRows = useMemo(() => settings.courseType !== "common" ? [] : combinedRows.filter(row => {
    if (row.complete) return Number(row.officialScore) < 40;
    return row.progressRate != null && row.progressRate < 40;
  }), [combinedRows, settings.courseType]);
  const unresolvedTieGroups = useMemo(() => {
    if (activeView !== "combined" || (weightTotal.written === 0 && Math.abs(weightTotal.performance - 100) < 1e-9)) return [];
    const groups = new Map();
    combinedRows.filter(row => row.complete).forEach(row => {
      const key = vectorKey(row.baseVector);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    return Array.from(groups.values()).filter(rows => rows.length > 1).sort((a, b) => compareVectors(a[0].baseVector, b[0].baseVector));
  }, [combinedRows, activeView, weightTotal]);

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
      ? ["학번", "성명", "반", "번호", ...sortedWritten.map(item => item.title), ...canonicalAreas.map(area => area.name), "수행 환산", "학기말 환산점수", "원점수", "석차", "동석차", "중간석차", "석차등급", "성취도", "확인사항"]
      : activeView === "writtenCombined"
        ? ["학번", "성명", "반", "번호", ...sortedWritten.map(item => item.title), "지필 환산(100점)", "석차", "동석차", "중간석차", "석차등급", "확인사항"]
        : ["학번", "성명", "반", "번호", "점수", "석차", "동석차", "중간석차", "석차등급", "상태"];
    const rows = activeRows.map(row => activeView === "combined"
      ? [row.sid, row.name, row.classNumber, row.number, ...sortedWritten.map(item => row.writtenScores[item.id]), ...canonicalAreas.map(area => row.areaScores[area.id]), row.weightedPerformance, row.convertedScore, row.officialScore, row.rank, row.tieCount, row.midRank, row.grade, row.achievement, row.missing.join(", ")]
      : activeView === "writtenCombined"
        ? [row.sid, row.name, row.classNumber, row.number, ...sortedWritten.map(item => row.writtenScores[item.id]), row.score, row.rank, row.tieCount, row.midRank, row.grade, row.missing.join(", ")]
        : [row.sid, row.name, row.classNumber, row.number, row.score, row.rank, row.tieCount, row.midRank, row.grade, row.status]);
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    sheet["!cols"] = headers.map((header, index) => ({ wch: index < 2 ? 14 : Math.min(28, Math.max(9, text(header).length + 3)) }));
    XLSX.utils.book_append_sheet(workbook, sheet, activeView === "combined" ? "지필+수행 합본" : activeView === "writtenCombined" ? "지필 종합" : "지필평가");
    const summary = [
      ["과목", context?.subject || ""], ["학년도", context?.year || ""], ["학기", context?.semester || ""], ["학년", context?.grade || grade],
      ["등급제", `${settings.gradeSystem}등급제`], ["성취도 방식", settings.achievementMode === "fixed" ? "고정분할" : "수동 분할점수"],
      ["지필 반영비율", `${weightTotal.written}%`], ["수행 반영비율", `${weightTotal.performance}%`], ["합계", `${weightTotal.total}%`],
      [], ["등급", "인원", "비율", "최저점"], ...gradeDistribution.map(item => [item.grade, item.count, completeActiveRows.length ? item.count / completeActiveRows.length : 0, item.min]),
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summary);
    summarySheet["!cols"] = [{ wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(workbook, summarySheet, "요약");
    XLSX.writeFile(workbook, `${context?.year || "성적"}_${context?.subject || "과목"}_${activeView === "combined" ? "학기말" : activeView === "writtenCombined" ? "지필종합" : "지필"}_산출결과.xlsx`);
  };

  const selectedWritten = sortedWritten.find(item => item.id === activeView) || null;
  return (
    <div className="teacher-grade-analyzer" style={ui.root}>
      <style>{gradeAnalyzerCss}</style>
      <div style={ui.hero}>
        <div>
          <div style={ui.eyebrow}>선생님 ZONE · 성적 산출</div>
          <h2 style={ui.heroTitle}>NEIS 파일을 그대로 불러와 지필·수행 성적을 검증합니다.</h2>
          <p style={ui.heroDescription}>석차는 환산점수 소수 둘째 자리와 학교 동점자 처리 순서를 적용하고, 원점수·석차등급·성취도 분포를 따로 보여줍니다.</p>
        </div>
        <div style={ui.heroActions}>
          <button type="button" style={ui.lightButton} onClick={saveLocalWorkspace}><Save size={15} /> 과목별 저장</button>
          <button type="button" style={ui.publishButton} onClick={publishWorkspace} disabled={!context || readOnlyShared}><Check size={15} /> 학교 자료에 반영</button>
          <button type="button" style={ui.lightButton} onClick={exportWorkbook}><Download size={15} /> 결과 엑셀</button>
          <button type="button" style={ui.lightButton} onClick={resetWorkspace}><RotateCcw size={15} /> 초기화</button>
        </div>
      </div>

      <div className="teacher-grade-workspace-browser" style={ui.workspaceBrowser}>
        <div><b>과목별 성적 작업</b><span>{canViewAllSubjects ? `${grade}학년 전체 과목을 열람할 수 있습니다.` : "과목마다 업로드 파일·반영비율·산출 결과가 따로 저장됩니다."}</span></div>
        <select value={workspaceSelection} onChange={event => loadWorkspaceSelection(event.target.value)} style={ui.workspaceSelect}>
          <option value="">현재 작업 / 새 과목</option>
          {!!localWorkspaceList.length && <optgroup label="내 브라우저 저장 과목">{localWorkspaceList.map(item => <option key={`local-${item.id}`} value={`local:${item.id}`}>{item.subject} · {item.year || "-"}학년도 {item.semester || "-"}학기 · 저장본</option>)}</optgroup>}
          {!!sharedWorkspaces.length && <optgroup label="학교에 반영된 과목">{sharedWorkspaces.map(item => <option key={`shared-${item.id}`} value={`shared:${item.id}`}>{item.subject} · {item.ownerName || item.ownerId} · {new Date(item.updatedAt || 0).toLocaleDateString("ko-KR")}</option>)}</optgroup>}
        </select>
        <button type="button" style={ui.secondaryButton} onClick={startNewWorkspace}>새 과목 작업</button>
        {selectedLocalId && <button type="button" style={ui.deleteWorkspaceButton} onClick={deleteLocalWorkspace}>저장본 삭제</button>}
        {readOnlyShared && <span style={ui.readOnlyBadge}>열람 전용</span>}
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
            detail={sortedWritten.map(item => item.title).join(" · ") || "등록된 시험 없음"}
            inputRef={writtenInputRef}
            onFiles={files => parseFiles(files, "written")}
            busy={busy}
            readOnly={readOnlyShared}
          />
          <UploadCard
            title="수행평가"
            description="반별 수행평가 강의실 일람표"
            count={performance.reduce((sum, item) => sum + item.classes.length, 0)}
            detail={performance.length ? `${performance.flatMap(item => item.classes).sort((a, b) => a - b).join(", ")}반 등록` : "등록된 반 없음"}
            inputRef={performanceInputRef}
            onFiles={files => parseFiles(files, "performance")}
            busy={busy}
            readOnly={readOnlyShared}
          />
        </div>
        {!!uploadMessages.length && <div style={ui.messageList}>{uploadMessages.map((message, index) => <div key={`${message.text}-${index}`} style={{ ...ui.message, ...(message.type === "error" ? ui.messageError : message.type === "warn" ? ui.messageWarn : ui.messageOk) }}>{message.type === "ok" ? <Check size={13} /> : <AlertTriangle size={13} />}{message.text}</div>)}</div>}
      </section>

      <section style={ui.section}>
        <div style={ui.sectionHeader}><div><span style={ui.stepBadge}>2</span><strong style={ui.sectionTitle}>산출 기준 설정</strong><p style={ui.sectionHint}>반영비율 합계가 100%가 되어야 학기말 석차·등급을 확정합니다.</p></div><span style={{ ...ui.totalBadge, ...(Math.abs(weightTotal.total - 100) < 1e-9 ? ui.totalBadgeOk : ui.totalBadgeWarn) }}>반영비율 {weightTotal.total}%</span></div>
        <div style={ui.settingsGrid}>
          <div style={ui.settingCard}>
            <div style={ui.settingTitle}>지필평가 반영비율</div>
            {sortedWritten.length ? sortedWritten.map(item => <div key={item.id} className="teacher-grade-weight-row" style={ui.weightRow}><span><b>{item.title}</b><small>{item.maxScore}점 만점 · {item.fileName}</small></span><span style={ui.weightActions}><span style={ui.percentInput}><input type="number" min="0" max="100" step="0.01" value={item.weight ?? 0} disabled={readOnlyShared} onChange={event => updateWrittenWeight(item.id, event.target.value)} />%</span><button type="button" title="이 시험 제거" style={ui.removeFileButton} disabled={readOnlyShared} onClick={() => removeWritten(item.id)}>×</button></span></div>) : <EmptyLine>지필평가 파일을 올려주세요.</EmptyLine>}
            <div style={ui.subtotal}>지필 합계 <b>{weightTotal.written}%</b></div>
          </div>
          <div style={ui.settingCard}>
            <div style={ui.settingTitle}>수행평가 영역 반영비율</div>
            {!!performance.length && <div style={ui.fileChipRow}>{performance.map(file => <button key={file.id} type="button" disabled={readOnlyShared} onClick={() => removePerformance(file.id)} style={ui.fileChip} title={`${file.fileName} 제거`}>{file.classes.join(", ")}반 <span>×</span></button>)}</div>}
            {canonicalAreas.length ? canonicalAreas.map(area => <label key={area.id} className="teacher-grade-weight-row" style={ui.weightRow}><span><b>{area.name}</b><small>{area.maxScore}점 만점 · NEIS 영역 순서 {area.order + 1}</small></span><span style={ui.percentInput}><input type="number" min="0" max="100" step="0.01" value={area.weight ?? 0} disabled={readOnlyShared} onChange={event => updateAreaWeight(area.id, event.target.value)} />%</span></label>) : <EmptyLine>수행평가 파일을 올려주세요.</EmptyLine>}
            <div style={ui.subtotal}>수행 합계 <b>{weightTotal.performance}%</b></div>
          </div>
          <div style={ui.settingCard}>
            <div style={ui.settingTitle}>등급·성취도 기준</div>
            <div style={ui.choiceGroup}><span>석차등급</span><Toggle disabled={readOnlyShared} value={String(settings.gradeSystem)} options={[{ value: "5", label: "5등급제" }, { value: "9", label: "9등급제" }]} onChange={value => setSettings(current => ({ ...current, gradeSystem: Number(value) }))} /></div>
            <div style={ui.choiceGroup}><span>과목 구분</span><Toggle disabled={readOnlyShared} value={settings.courseType} options={[{ value: "common", label: "공통과목" }, { value: "elective", label: "선택과목" }]} onChange={courseType => setSettings(current => ({ ...current, courseType }))} /></div>
            <div style={ui.choiceGroup}><span>성취도</span><Toggle disabled={readOnlyShared} value={settings.achievementMode} options={[{ value: "fixed", label: "고정분할" }, { value: "manual", label: "추정분할·수동 컷" }]} onChange={achievementMode => setSettings(current => ({ ...current, achievementMode }))} /></div>
            {settings.achievementMode === "manual" && <ManualCutInputs settings={settings} setSettings={setSettings} disabled={readOnlyShared} />}
            {settings.achievementMode === "fixed" && <div style={ui.ruleNote}>{settings.courseType === "common" ? "A 90 · B 80 · C 70 · D 60 · E 40 · 40 미만 미도달" : "A 90 · B 80 · C 70 · D 60 · 60 미만 E"}</div>}
          </div>
        </div>
        <div style={ui.tieRuleBox}><b>동점자 처리 순서</b><span>학기말 환산점수가 같은 경우: ① 정기시험 환산 합계 → ② 수행평가 → ③ 2차 지필 → ④ 1차 지필 → ⑤ 수행평가 NEIS 영역 순 → ⑥ 2차 고배점 문항(최대 3개) → ⑦ 1차 고배점 문항(최대 3개)</span><small>수행평가 100% 과목은 수행 영역 순서까지만 적용합니다. 모든 기준이 같으면 동석차로 남겨 중간석차백분율을 적용합니다.</small></div>
        <div style={ui.roundingRuleBox}><b>소수점 처리</b><span>영역별 환산점수 합계는 소수 셋째 자리에서 반올림해 둘째 자리까지 석차 산출에 사용합니다.</span><span>공식 원점수는 학기말 환산점수를 소수 첫째 자리에서 반올림한 정수로 표시하며, 평균과 분포 비율은 소수 첫째 자리까지 표시합니다.</span></div>
      </section>

      <section style={ui.section}>
        <div style={ui.sectionHeader}><div><span style={ui.stepBadge}>3</span><strong style={ui.sectionTitle}>결과 확인</strong><p style={ui.sectionHint}>지필만 따로 보거나 지필+수행 합본을 전환할 수 있습니다.</p></div></div>
        <div style={ui.resultTabs}>
          {sortedWritten.map(item => <button key={item.id} type="button" onClick={() => setActiveView(item.id)} style={{ ...ui.resultTab, ...(activeView === item.id ? ui.resultTabActive : {}) }}>{item.title}</button>)}
          <button type="button" onClick={() => setActiveView("combined")} style={{ ...ui.resultTab, ...(activeView === "combined" ? ui.resultTabActive : {}) }}>지필+수행 합본</button>
          <button type="button" onClick={() => setActiveView("writtenCombined")} style={{ ...ui.resultTab, ...(activeView === "writtenCombined" ? ui.resultTabActive : {}) }}>지필 종합</button>
        </div>
        {!activeRows.length ? <div style={ui.emptyState}><FileSpreadsheet size={30} /><b>분석할 파일을 업로드해주세요.</b><span>지필평가 파일부터 올리면 전 학급 학생 구조가 자동으로 만들어집니다.</span></div> : <>
          {activeView === "combined" && Math.abs(weightTotal.total - 100) > 1e-9 && <div style={ui.warningBanner}><AlertTriangle size={16} /><span>반영비율 합계가 {weightTotal.total}%입니다. 100%로 맞추기 전 결과는 검토용입니다.</span></div>}
          <div style={ui.metricGrid}>
            <MetricCard label="산출 학생" value={`${activeStats.count}명`} caption={`전체 ${activeRows.length}명`} />
            <MetricCard label="평균" value={formatScore(activeStats.average, 1)} caption="소수 첫째 자리" />
            <MetricCard label="최고점" value={formatScore(activeStats.max, 2)} caption="정상 산출 학생" />
            <MetricCard label="최저점" value={formatScore(activeStats.min, 2)} caption="정상 산출 학생" />
            {activeView === "combined" && <MetricCard label="미처리" value={`${activeRows.filter(row => !row.complete).length}명`} caption="공란·결시 확인 필요" danger={activeRows.some(row => !row.complete)} />}
          </div>
          <div style={ui.summaryGrid}>
            <div style={ui.summaryPanel}><div style={ui.summaryTitle}><BarChart3 size={16} /> {settings.gradeSystem}등급제 분포·등급컷</div><div style={ui.distributionList}>{gradeDistribution.map(item => <div key={item.grade} style={ui.distributionRow}><span style={ui.gradePill}>{item.grade}등급</span><b>{ratioLabel(item.count, completeActiveRows.length)}</b><small>{item.min == null ? "-" : `최저 ${formatScore(item.min, 2)}`}</small></div>)}</div></div>
            {activeView === "combined" && <div style={ui.summaryPanel}><div style={ui.summaryTitle}><Users size={16} /> 성취도 분포</div><div style={ui.distributionList}>{achievementDistribution.map(item => <div key={item.label} style={ui.distributionRow}><span style={{ ...ui.gradePill, ...(item.label === "미도달" ? ui.failPill : {}) }}>{item.label}</span><b>{ratioLabel(item.count, completeActiveRows.length)}</b><small>{settings.achievementMode === "fixed" ? "고정분할" : "수동 컷"}</small></div>)}</div></div>}
          </div>

          {settings.courseType === "common" && minimumRiskRows.length > 0 && <div style={ui.riskPanel}>
            <div style={ui.riskPanelHead}><div><b>최소 성취수준 주의 대상</b><span>현재까지 입력된 평가의 환산 성취율이 40% 미만이거나 학기말 원점수가 40점 미만인 학생입니다.</span></div><strong>{minimumRiskRows.length}명</strong></div>
            <div className="teacher-grade-risk-chips" style={ui.riskChips}>{minimumRiskRows.slice(0,24).map(row => <span key={row.sid}><b>{row.classNumber}반 {row.number}번 {row.name || row.sid}</b><small>{row.complete ? `학기말 ${row.officialScore}점` : `진행 성취율 ${formatScore(row.progressRate,1)}%`}</small></span>)}</div>
          </div>}

          {activeView === "combined" && unresolvedTieGroups.length > 0 && <details style={ui.tieDetails} open>
            <summary style={ui.tieSummary}><span><AlertTriangle size={15} /> 추가 동점자 문항 점수 입력</span><b>{unresolvedTieGroups.reduce((sum, rows) => sum + rows.length, 0)}명</b></summary>
            <div style={ui.tieBody}><p>정기시험 환산 합계부터 수행 영역 순서까지 같은 학생만 표시됩니다. 2차와 1차 정기시험의 고배점 문항을 배점이 높은 순서대로 최대 3개까지 입력하세요. 미입력 상태에서 모든 기준이 같으면 동석차로 처리합니다.</p>{unresolvedTieGroups.map((rows, groupIndex) => <div key={vectorKey(rows[0].baseVector)} style={ui.tieGroup}><div style={ui.tieGroupTitle}>동점 그룹 {groupIndex + 1} · 환산 {formatScore(rows[0].convertedScore, 2)}점</div>{rows.map(row => <div key={row.sid} className="teacher-grade-tie-student" style={ui.tieStudent}><span><b>{row.name || row.sid}</b><small>{row.sid} · {row.classNumber}반 {row.number}번</small></span><TieItemInputs label="2차 고배점" values={tieScores[row.sid]?.secondItems || []} disabled={readOnlyShared} onChange={(index, value) => setTieScores(current => { const rowTie = current[row.sid] || {}; const nextItems = [...(rowTie.secondItems || [])]; nextItems[index] = value; return { ...current, [row.sid]: { ...rowTie, secondItems: nextItems } }; })} /><TieItemInputs label="1차 고배점" values={tieScores[row.sid]?.firstItems || []} disabled={readOnlyShared} onChange={(index, value) => setTieScores(current => { const rowTie = current[row.sid] || {}; const nextItems = [...(rowTie.firstItems || [])]; nextItems[index] = value; return { ...current, [row.sid]: { ...rowTie, firstItems: nextItems } }; })} /></div>)}</div>)}</div>
          </details>}

          <div style={ui.tableToolbar}>
            <div style={ui.searchBox}><Search size={15} /><input className="teacher-grade-analyzer-search-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="학번·이름 검색" /></div>
            <select value={classFilter} onChange={event => setClassFilter(event.target.value)} style={ui.select}><option value="all">전체 반</option>{classes.map(classNumber => <option key={classNumber} value={String(classNumber)}>{classNumber}반</option>)}</select>
            <select value={gradeFilter} onChange={event => setGradeFilter(event.target.value)} style={ui.select}><option value="all">전체 등급</option>{Array.from({length:Number(settings.gradeSystem)},(_,index)=><option key={index+1} value={String(index+1)}>{index+1}등급</option>)}</select>
            <span style={ui.resultCount}>{filteredRows.length}명 표시</span>
          </div>
          <div style={ui.tableScroll}>
            {activeView === "combined" ? <CombinedTable rows={filteredRows} written={sortedWritten} areas={canonicalAreas} /> : activeView === "writtenCombined" ? <WrittenCombinedTable rows={filteredRows} written={sortedWritten} /> : <WrittenTable rows={filteredRows} assessment={selectedWritten} />}
          </div>
        </>}
      </section>
    </div>
  );
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
function MetricCard({ label, value, caption, danger }) { return <div style={{ ...ui.metricCard, ...(danger ? ui.metricDanger : {}) }}><span>{label}</span><strong>{value}</strong><small>{caption}</small></div>; }
function CombinedTable({ rows, written, areas }) {
  return <table style={ui.table}><thead><tr><th>학번·성명</th><th>반</th>{written.map(item => <th key={item.id}>{item.title}</th>)}<th>수행</th><th>환산점수</th><th>원점수</th><th>석차</th><th>등급</th><th>성취도</th><th>확인</th></tr></thead><tbody>{rows.map(row => <tr key={row.sid} style={!row.complete ? ui.incompleteRow : undefined}><td><b>{row.name || "이름 미연결"}</b><small>{row.sid}</small></td><td>{row.classNumber}반 {row.number}번</td>{written.map(item => <td key={item.id}>{formatScore(row.writtenScores[item.id], 1)}</td>)}<td><b>{formatScore(row.weightedPerformance, 2)}</b><small>{areas.map(area => formatScore(row.areaScores[area.id], 1)).join(" / ")}</small></td><td><b>{formatScore(row.convertedScore, 2)}</b></td><td>{row.officialScore ?? "-"}</td><td>{row.rank ? <><b>{row.rank}</b><small>{row.tieCount > 1 ? `동석차 ${row.tieCount}명 · 중간 ${row.midRank}` : ""}</small></> : "-"}</td><td>{row.grade ? (row.grade===1?<span style={ui.firstGradeMark}><Star size={11} fill="currentColor"/>1등급</span>:<span style={ui.tableGrade}>{row.grade}</span>) : "-"}</td><td><span style={{ ...ui.achievementBadge, ...(row.achievement === "미도달" ? ui.achievementFail : {}) }}>{row.achievement || "-"}</span></td><td>{row.complete ? <span style={ui.okText}><Check size={12} /> 정상</span> : <span style={ui.warnText}>{row.missing.join(", ")}</span>}</td></tr>)}</tbody></table>;
}
function WrittenCombinedTable({ rows, written }) {
  return <table style={ui.table}><thead><tr><th>학번·성명</th><th>반</th>{written.map(item => <th key={item.id}>{item.title}</th>)}<th>지필 환산</th><th>석차</th><th>중간석차</th><th>등급</th><th>상태</th></tr></thead><tbody>{rows.map(row => <tr key={row.sid} style={!row.complete ? ui.incompleteRow : undefined}><td><b>{row.name || "이름 미연결"}</b><small>{row.sid}</small></td><td>{row.classNumber}반 {row.number}번</td>{written.map(item => <td key={item.id}>{formatScore(row.writtenScores[item.id], 1)}</td>)}<td><b>{formatScore(row.score, 2)}</b><small>100점 환산</small></td><td>{row.rank || "-"}{row.tieCount > 1 && <small>동석차 {row.tieCount}명</small>}</td><td>{row.midRank ?? "-"}</td><td>{row.grade ? (row.grade===1?<span style={ui.firstGradeMark}><Star size={11} fill="currentColor"/>1등급</span>:<span style={ui.tableGrade}>{row.grade}</span>) : "-"}</td><td>{row.complete ? <span style={ui.okText}><Check size={12} /> 정상</span> : <span style={ui.warnText}>{row.missing.join(", ")}</span>}</td></tr>)}</tbody></table>;
}
function WrittenTable({ rows, assessment }) {
  return <table style={ui.table}><thead><tr><th>학번·성명</th><th>반</th><th>{assessment?.title || "지필"} 점수</th><th>석차</th><th>중간석차</th><th>등급</th><th>상태</th></tr></thead><tbody>{rows.map(row => <tr key={row.sid}><td><b>{row.name || "이름 미연결"}</b><small>{row.sid}</small></td><td>{row.classNumber}반 {row.number}번</td><td><b>{formatScore(row.score, 1)}</b></td><td>{row.rank || "-"}{row.tieCount > 1 && <small>동석차 {row.tieCount}명</small>}</td><td>{row.midRank ?? "-"}</td><td>{row.grade ? (row.grade===1?<span style={ui.firstGradeMark}><Star size={11} fill="currentColor"/>1등급</span>:<span style={ui.tableGrade}>{row.grade}</span>) : "-"}</td><td>{row.score == null ? <span style={ui.warnText}>{row.status || "미입력"}</span> : <span style={ui.okText}><Check size={12} /> 정상</span>}</td></tr>)}</tbody></table>;
}


const gradeAnalyzerCss = `
.teacher-grade-analyzer * { box-sizing: border-box; }
.teacher-grade-analyzer button, .teacher-grade-analyzer input, .teacher-grade-analyzer select { font-family: ${FONT_STACK}; }
.teacher-grade-analyzer input[type="number"] { width: 70px; border: 1px solid #d5deea; border-radius: 8px; padding: 6px 7px; text-align: right; color: #27384e; background: #fff; font-weight: 800; }
.teacher-grade-analyzer input[type="text"], .teacher-grade-analyzer .teacher-grade-search { outline: none; }
.teacher-grade-analyzer label small, .teacher-grade-analyzer td small, .teacher-grade-analyzer .metric-card small { display: block; margin-top: 3px; color: #8b96a5; font-size: 9.8px; font-weight: 650; line-height: 1.35; }
.teacher-grade-analyzer .teacher-grade-analyzer-upload p { margin: 3px 0; font-weight:750; color:#607087; }
.teacher-grade-analyzer .teacher-grade-analyzer-upload small{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.teacher-grade-analyzer [style*="weightRow"] small{max-width:330px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.teacher-grade-analyzer .teacher-grade-weight-row>span:first-child{min-width:0;flex:1;overflow:hidden}.teacher-grade-analyzer .teacher-grade-weight-row small{display:block;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.teacher-grade-analyzer .teacher-grade-workspace-browser>div:first-child{display:grid;gap:3px;min-width:0}.teacher-grade-analyzer .teacher-grade-workspace-browser>div:first-child b{font-size:13px;color:#2e435e}.teacher-grade-analyzer .teacher-grade-workspace-browser>div:first-child span{font-size:10.5px;color:#738196;font-weight:700;line-height:1.35}
.teacher-grade-analyzer .teacher-grade-risk-chips>span{display:grid;gap:2px;padding:6px 8px;border:1px solid #eed6d1;border-radius:9px;background:#fff;color:#6f473f}.teacher-grade-analyzer .teacher-grade-risk-chips>span b{font-size:10.5px}.teacher-grade-analyzer .teacher-grade-risk-chips>span small{font-size:9.3px;color:#97736c}
.teacher-grade-analyzer button{letter-spacing:-.025em}
.teacher-grade-analyzer section{min-width:0}
.teacher-grade-analyzer table th { position: sticky; top: 0; z-index: 1; padding: 10px 9px; border-bottom: 1px solid #d8e0eb; color: #40516a; background: #f2f6fb; text-align: center; white-space: nowrap; font-size: 10.8px; font-weight: 900; }
.teacher-grade-analyzer table td { padding: 9px; border-bottom: 1px solid #edf0f4; color: #344256; text-align: center; vertical-align: middle; white-space: nowrap; }
.teacher-grade-analyzer table td:first-child { min-width: 130px; text-align: left; }
.teacher-grade-analyzer table tbody tr:hover { background: #f8fbff; }
.teacher-grade-analyzer .teacher-grade-analyzer-search-input { width: 100%; min-width: 0; border: 0; outline: 0; color: #334258; background: transparent; font-size: 12px; }
.teacher-grade-analyzer .teacher-grade-tie-student > div > div { display: flex; gap: 4px; }
.teacher-grade-analyzer .teacher-grade-tie-student > div label { display: inline-flex; align-items: center; gap: 2px; }
.teacher-grade-analyzer .teacher-grade-tie-student > div input[type="number"] { width: 47px; padding: 5px; }
.teacher-grade-analyzer details summary::-webkit-details-marker { display: none; }
@media (max-width: 980px) {
  .teacher-grade-analyzer .teacher-grade-workspace-browser { grid-template-columns:1fr 1fr!important; }
  .teacher-grade-analyzer .teacher-grade-workspace-browser>div:first-child { grid-column:1/-1; }
}
@media (max-width: 720px) {
  .teacher-grade-analyzer .teacher-grade-tie-student { grid-template-columns: 1fr 1fr; }
  .teacher-grade-analyzer .teacher-grade-workspace-browser { grid-template-columns:1fr!important; }
}
`;

const ui = {
  root: { fontFamily: FONT_STACK, display: "grid", gap: 16 },
  hero: { display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center", padding: "22px 24px", borderRadius: 20, color: "#fff", background: "linear-gradient(135deg,#285f9d 0%,#456fa9 50%,#7067b1 100%)", boxShadow: "0 16px 36px rgba(44,77,135,.18)" },
  eyebrow: { fontSize: 12, fontWeight: 900, letterSpacing: ".04em", opacity: .78 },
  heroTitle: { margin: "5px 0 7px", fontSize: 22, lineHeight: 1.35, letterSpacing: "-.04em" },
  heroDescription: { margin: 0, fontSize: 12.5, lineHeight: 1.65, opacity: .86 },
  heroActions: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" },
  lightButton: { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid rgba(255,255,255,.35)", borderRadius: 10, padding: "9px 12px", color: "#fff", background: "rgba(255,255,255,.13)", fontFamily: FONT_STACK, fontWeight: 850, cursor: "pointer" },
  publishButton: { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid #fff", borderRadius: 10, padding: "9px 12px", color: "#315d90", background: "#fff", fontFamily: FONT_STACK, fontWeight: 900, cursor: "pointer" },
  workspaceBrowser: { display:"grid", gridTemplateColumns:"minmax(220px,auto) minmax(280px,1fr) auto auto auto", gap:10, alignItems:"center", padding:"12px 14px", border:"1px solid #dbe4f0", borderRadius:14, background:"#f8fbff", boxShadow:"0 6px 18px rgba(55,72,110,.05)" },
  workspaceSelect: { width:"100%", minWidth:0, border:"1px solid #cfdbe9", borderRadius:10, padding:"9px 11px", background:"#fff", color:"#34465d", fontFamily:FONT_STACK, fontWeight:800 },
  secondaryButton: { border:"1px solid #cfdbe9", borderRadius:10, padding:"9px 11px", color:"#42617f", background:"#fff", fontFamily:FONT_STACK, fontWeight:850, cursor:"pointer", whiteSpace:"nowrap" },
  deleteWorkspaceButton: { border:"1px solid #e6c9c5", borderRadius:10, padding:"9px 11px", color:"#9b493f", background:"#fff7f5", fontFamily:FONT_STACK, fontWeight:850, cursor:"pointer", whiteSpace:"nowrap" },
  readOnlyBadge: { borderRadius:999, padding:"6px 9px", color:"#79591e", background:"#fff6df", border:"1px solid #ead2a2", fontSize:10.5, fontWeight:900 },
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
  settingCard: { border: "1px solid #e0e6ef", borderRadius: 14, padding: 14, background: "#fbfcfe" },
  settingTitle: { marginBottom: 10, fontSize: 13.5, fontWeight: 900, color: "#2c3f58" },
  weightRow: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid #edf0f4" },
  percentInput: { display: "inline-flex", alignItems: "center", gap: 4, color: "#586779", fontWeight: 800 },
  weightActions: { display: "inline-flex", alignItems: "center", gap: 6 },
  removeFileButton: { width: 25, height: 25, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px solid #e4c9c5", borderRadius: 7, color: "#a74a40", background: "#fff7f5", fontSize: 16, lineHeight: 1, cursor: "pointer" },
  fileChipRow: { display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 7 },
  fileChip: { border: "1px solid #cbd9e8", borderRadius: 999, padding: "4px 8px", color: "#46637f", background: "#f3f7fb", fontSize: 10.5, fontWeight: 850, cursor: "pointer" },
  subtotal: { display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 8, color: "#526174", fontSize: 12 },
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
  tieRuleBox: { display: "grid", gap: 4, marginTop: 12, border: "1px solid #d9e2ef", borderRadius: 12, padding: "11px 13px", color: "#526174", background: "#f7f9fc", fontSize: 11.5, lineHeight: 1.55 },
  roundingRuleBox: { display: "grid", gap: 4, marginTop: 8, border: "1px solid #d5e4dd", borderRadius: 12, padding: "10px 13px", color: "#456354", background: "#f3faf6", fontSize: 11.3, lineHeight: 1.5 },
  resultTabs: { display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 },
  resultTab: { border: "1px solid #d6dfeb", borderRadius: 999, padding: "8px 13px", color: "#59697b", background: "#fff", fontFamily: FONT_STACK, fontWeight: 850, cursor: "pointer" },
  resultTabActive: { color: "#fff", background: "#3568a3", borderColor: "#3568a3" },
  emptyState: { minHeight: 190, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "#7a8798", background: "#fafbfd", border: "1px dashed #d4deea", borderRadius: 14 },
  warningBanner: { display: "flex", gap: 8, alignItems: "center", marginBottom: 12, padding: "9px 11px", color: "#8a5d18", background: "#fff7e7", border: "1px solid #ead194", borderRadius: 10, fontSize: 11.8, fontWeight: 750 },
  metricGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(135px,1fr))", gap: 10, marginBottom: 12 },
  metricCard: { display: "grid", gap: 4, border: "1px solid #e0e6ef", borderRadius: 13, padding: 12, background: "#fbfcfe" },
  metricDanger: { borderColor: "#edc4bd", background: "#fff6f4" },
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(310px,1fr))", gap: 12, marginBottom: 12 },
  summaryPanel: { border: "1px solid #e0e6ef", borderRadius: 14, padding: 13, background: "#fff" },
  summaryTitle: { display: "flex", gap: 7, alignItems: "center", marginBottom: 10, fontSize: 13.5, fontWeight: 900 },
  distributionList: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(118px,1fr))", gap: 7 },
  distributionRow: { display: "grid", gap: 3, borderRadius: 10, padding: "8px 9px", background: "#f7f9fc", fontSize: 11.5 },
  gradePill: { width: "fit-content", borderRadius: 999, padding: "3px 7px", color: "#315d90", background: "#e9f2fc", fontSize: 10.5, fontWeight: 900 },
  failPill: { color: "#a33b35", background: "#fdeceb" },
  riskPanel: { marginBottom:12, border:"1px solid #efc8c3", borderRadius:14, padding:12, background:"linear-gradient(135deg,#fff8f6,#fffdf9)" },
  riskPanelHead: { display:"flex", justifyContent:"space-between", gap:12, alignItems:"center", color:"#8f453a" },
  riskChips: { display:"flex", flexWrap:"wrap", gap:6, marginTop:9 },
  tieDetails: { marginBottom: 12, border: "1px solid #ead49f", borderRadius: 13, background: "#fffbf2", overflow: "hidden" },
  tieSummary: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", cursor: "pointer", color: "#73511c", fontSize: 12.5, fontWeight: 900 },
  tieBody: { padding: "0 12px 12px", color: "#725f3c", fontSize: 11.5 },
  tieGroup: { marginTop: 9, border: "1px solid #eadcbc", borderRadius: 10, padding: 9, background: "#fff" },
  tieGroupTitle: { marginBottom: 7, fontWeight: 900 },
  tieStudent: { display: "grid", gridTemplateColumns: "minmax(150px,1fr) minmax(205px,auto) minmax(205px,auto)", gap: 8, alignItems: "center", padding: "7px 0", borderTop: "1px solid #f0e9dc" },
  tieItemSet: { display: "grid", gap: 4, color: "#735f3e", fontSize: 10.5 },
  tableToolbar: { display: "flex", gap: 8, alignItems: "center", marginBottom: 9, flexWrap: "wrap" },
  searchBox: { flex: "1 1 240px", display: "flex", gap: 7, alignItems: "center", border: "1px solid #d6dfeb", borderRadius: 10, padding: "8px 10px", background: "#fff" },
  select: { border: "1px solid #d6dfeb", borderRadius: 10, padding: "8px 10px", fontFamily: FONT_STACK, background: "#fff" },
  resultCount: { marginLeft: "auto", color: "#748195", fontSize: 11.5, fontWeight: 800 },
  tableScroll: { overflowX: "auto", border: "1px solid #dfe5ee", borderRadius: 12 },
  table: { width: "100%", minWidth: 940, borderCollapse: "collapse", fontSize: 11.5, fontFamily: FONT_STACK },
  incompleteRow: { background: "#fff8f6" },
  tableGrade: { display: "inline-flex", minWidth: 25, justifyContent: "center", borderRadius: 8, padding: "4px 6px", color: "#fff", background: "#3568a3", fontWeight: 900 },
  firstGradeMark: { display:"inline-flex", alignItems:"center", justifyContent:"center", gap:3, borderRadius:999, padding:"4px 7px", color:"#7a5700", background:"linear-gradient(135deg,#fff5bd,#ffd95a)", border:"1px solid #e8bd35", fontWeight:950, whiteSpace:"nowrap" },
  achievementBadge: { display: "inline-flex", borderRadius: 999, padding: "4px 7px", color: "#28633f", background: "#eaf7ee", fontWeight: 900 },
  achievementFail: { color: "#a23b34", background: "#fdeceb" },
  okText: { display: "inline-flex", gap: 4, alignItems: "center", color: "#327046", fontWeight: 800 },
  warnText: { color: "#a14935", fontSize: 10.5, fontWeight: 750 },
  emptyLine: { color: "#98a2af", fontSize: 11.5, padding: "14px 0" },
};

