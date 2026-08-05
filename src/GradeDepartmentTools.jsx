import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Upload, Search, Copy, ExternalLink, UsersRound, BookOpenCheck, ClipboardCheck,
  CalendarDays, Link2, FileSpreadsheet, Check, AlertTriangle, X, GraduationCap,
  ListChecks, Database, Save, RefreshCw, Trash2, Pencil, MessageSquareText,
  FileText, UserRound, Filter, CheckCircle2, CircleDashed,
} from "lucide-react";

const FONT = '"Pretendard","SUIT","Noto Sans KR","Malgun Gothic",sans-serif';
const IAM_TEACHER_URL = "https://id.iamservice.net/login";

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanMultiline(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizePhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 && digits.startsWith("10")) digits = `0${digits}`;
  if (digits.length === 9 && !digits.startsWith("0")) digits = `0${digits}`;
  return digits;
}

function formatPhone(value) {
  const digits = normalizePhone(value);
  if (/^010\d{8}$/.test(digits)) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (/^0\d{9,10}$/.test(digits)) {
    if (digits.startsWith("02")) return `${digits.slice(0, 2)}-${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 4)}-${digits.slice(-4)}`;
  }
  return digits;
}

function workbookRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
}

function sheetCell(workbook, sheetName, rowIndex, colIndex) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet || rowIndex < 0 || colIndex < 0) return null;
  return sheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })] || null;
}

function displayCell(workbook, sheetName, rowIndex, colIndex) {
  const cell = sheetCell(workbook, sheetName, rowIndex, colIndex);
  return cleanText(cell?.w ?? cell?.v ?? "");
}

function cellUrl(workbook, sheetName, rowIndex, colIndex) {
  const cell = sheetCell(workbook, sheetName, rowIndex, colIndex);
  const target = cleanText(cell?.l?.Target || "");
  if (target) return target;
  const raw = cleanText(cell?.v || "");
  return /^https?:\/\//i.test(raw) ? raw : "";
}

function findHeaderRow(rows, required) {
  return rows.findIndex(row => required.every(label => row.some(cell => cleanText(cell).includes(label))));
}

function columnIndex(header, candidates) {
  return header.findIndex(cell => candidates.some(candidate => cleanText(cell).replace(/\s/g, "").includes(candidate.replace(/\s/g, ""))));
}

function normalizeSid(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^\d{5}$/.test(digits) ? digits : "";
}

function parseContacts(workbook) {
  const sheetName = workbook.SheetNames.find(name => cleanText(name) === "2학년명렬") || workbook.SheetNames.find(name => /2학년.*명렬/.test(name));
  if (!sheetName) return [];
  const rows = workbookRows(workbook, sheetName);
  const headerIndex = findHeaderRow(rows, ["학번", "이름"]);
  if (headerIndex < 0) return [];
  const header = rows[headerIndex];
  const sidIndex = columnIndex(header, ["학번"]);
  const nameIndex = columnIndex(header, ["이름"]);
  const classIndex = columnIndex(header, ["반"]);
  const numberIndex = columnIndex(header, ["번호"]);
  const studentPhoneIndex = columnIndex(header, ["휴대폰(학생)", "학생휴대폰", "학생전화"]);
  const guardianPhoneIndex = columnIndex(header, ["휴대폰(학부모)", "학부모휴대폰", "보호자휴대폰", "보호자전화"]);
  const noteIndex = columnIndex(header, ["비고(특이사항)", "특이사항", "비고"]);
  const seen = new Set();
  return rows.slice(headerIndex + 1).map(row => {
    const sid = normalizeSid(row[sidIndex]);
    const name = cleanText(row[nameIndex]);
    if (!sid || !name || seen.has(sid)) return null;
    seen.add(sid);
    return {
      sid,
      name,
      classNumber: Number(row[classIndex]) || Number(sid.slice(1, 3)) || null,
      number: Number(row[numberIndex]) || Number(sid.slice(3, 5)) || null,
      studentPhone: normalizePhone(row[studentPhoneIndex]),
      guardianPhone: normalizePhone(row[guardianPhoneIndex]),
      note: cleanText(row[noteIndex]),
    };
  }).filter(Boolean).sort((a, b) => Number(a.sid) - Number(b.sid));
}

function parseActivitySheet(workbook, sheetName, category) {
  const rows = workbookRows(workbook, sheetName);
  if (!rows.length) return [];
  const headerIndex = findHeaderRow(rows, ["일자", "누가기록"]);
  if (headerIndex < 0) return [];
  const header = rows[headerIndex];
  const dateIndex = columnIndex(header, ["일자"]);
  const periodIndex = columnIndex(header, ["교시"]);
  const recordIndex = columnIndex(header, ["누가기록"]);
  const hoursIndex = header.findIndex(cell => cleanText(cell) === "이수시간");
  const formIndex = columnIndex(header, ["구글 폼 링크", "학급 공유용"]);
  const responseIndex = columnIndex(header, ["구글 답변 링크", "선생님 확인용"]);
  const separateLinkHeader = rows.findIndex((row, index) => index > headerIndex && row.some(cell => cleanText(cell).includes("구글 폼 링크")) && row.some(cell => cleanText(cell).includes("구글 답변 링크")));
  return rows.slice(headerIndex + 1).map((row, offset) => {
    const rowIndex = headerIndex + 1 + offset;
    if (separateLinkHeader >= 0 && rowIndex >= separateLinkHeader) return null;
    const record = cleanText(row[recordIndex]);
    const date = displayCell(workbook, sheetName, rowIndex, dateIndex);
    if (!record || /구글\s*폼\s*링크|구글\s*답변\s*링크/.test(record) || (!date && !row[periodIndex] && !row[hoursIndex])) return null;
    return {
      id: `${category}-${sheetName}-${rowIndex}`,
      category,
      date,
      period: displayCell(workbook, sheetName, rowIndex, periodIndex),
      record,
      hours: displayCell(workbook, sheetName, rowIndex, hoursIndex),
      formUrl: formIndex >= 0 ? cellUrl(workbook, sheetName, rowIndex, formIndex) : "",
      responseUrl: responseIndex >= 0 ? cellUrl(workbook, sheetName, rowIndex, responseIndex) : "",
    };
  }).filter(Boolean);
}

function parseCareerLessons(workbook) {
  const sheetName = workbook.SheetNames.find(name => cleanText(name) === "생기부(진로-수업)");
  if (!sheetName) return [];
  const rows = workbookRows(workbook, sheetName);
  const headerIndex = findHeaderRow(rows, ["누가기록", "진로 특기"]);
  if (headerIndex < 0) return [];
  const header = rows[headerIndex];
  const lessonIndex = columnIndex(header, ["일자"]);
  const recordIndex = columnIndex(header, ["누가기록"]);
  const hoursIndex = header.findIndex(cell => cleanText(cell) === "이수시간");
  return rows.slice(headerIndex + 1).map((row, offset) => {
    const rowIndex = headerIndex + 1 + offset;
    const record = cleanText(row[recordIndex]);
    if (!record) return null;
    return {
      id: `진로수업-${rowIndex}`,
      category: "진로 수업",
      date: displayCell(workbook, sheetName, rowIndex, lessonIndex),
      period: "",
      record,
      hours: displayCell(workbook, sheetName, rowIndex, hoursIndex),
      formUrl: "",
      responseUrl: "",
    };
  }).filter(Boolean);
}

function parseCareerActivityLinks(workbook) {
  const sheetName = workbook.SheetNames.find(name => cleanText(name) === "생기부(진로-활동)");
  if (!sheetName) return [];
  const rows = workbookRows(workbook, sheetName);
  const headerIndex = rows.findIndex(row => row.some(cell => cleanText(cell).includes("구글 폼 링크")) && row.some(cell => cleanText(cell).includes("구글 답변 링크")));
  if (headerIndex < 0) return [];
  const header = rows[headerIndex];
  const formIndex = columnIndex(header, ["구글 폼 링크", "학급 공유용"]);
  const responseIndex = columnIndex(header, ["구글 답변 링크", "선생님 확인용"]);
  const output = [];
  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const title = cleanText(rows[rowIndex]?.[0]);
    const formLabel = displayCell(workbook, sheetName, rowIndex, formIndex);
    const responseLabel = displayCell(workbook, sheetName, rowIndex, responseIndex);
    const formUrl = cellUrl(workbook, sheetName, rowIndex, formIndex);
    const responseUrl = cellUrl(workbook, sheetName, rowIndex, responseIndex);
    if (!title || (!formLabel && !responseLabel && !formUrl && !responseUrl)) continue;
    output.push({
      id: `진로활동링크-${rowIndex}`,
      category: "진로 활동",
      title,
      formLabel,
      responseLabel,
      formUrl,
      responseUrl,
    });
  }
  return output;
}

function parseAssignments(workbook) {
  const sheetName = workbook.SheetNames.find(name => /생기부\(동아리/.test(name));
  if (!sheetName) return [];
  const rows = workbookRows(workbook, sheetName);
  const headerIndex = findHeaderRow(rows, ["학번", "이름", "동아리"]);
  if (headerIndex < 0) return [];
  const header = rows[headerIndex];
  const classIndex = columnIndex(header, ["반"]);
  const sidIndex = columnIndex(header, ["학번"]);
  const nameIndex = columnIndex(header, ["이름"]);
  const clubIndex = header.findIndex((cell, index) => index < 10 && cleanText(cell) === "동아리");
  const serviceIndex = header.findIndex((cell, index) => index < 10 && cleanText(cell).includes("프로젝트 봉사활동"));
  const studentProjectIndex = header.findIndex((cell, index) => index < 10 && cleanText(cell).includes("학생주도 프로젝트"));
  return rows.slice(headerIndex + 1).map(row => {
    const sid = normalizeSid(row[sidIndex]);
    if (!sid || !sid.startsWith("2")) return null;
    return {
      sid,
      name: cleanText(row[nameIndex]),
      classNumber: Number(row[classIndex]) || Number(sid.slice(1, 3)) || null,
      number: Number(sid.slice(3, 5)) || null,
      club: cleanText(row[clubIndex]),
      clubTeacher: cleanText(row[clubIndex + 1]),
      service: cleanText(row[serviceIndex]),
      serviceTeacher: cleanText(row[serviceIndex + 1]),
      studentProject: cleanText(row[studentProjectIndex]),
      studentProjectTeacher: cleanText(row[studentProjectIndex + 1]),
    };
  }).filter(Boolean);
}

function parseGradeDepartmentWorkbook(arrayBuffer, fileName) {
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: false, cellStyles: true });
  const contacts = parseContacts(workbook);
  const activities = [
    ...parseActivitySheet(workbook, "생기부(자율)", "자율/자치"),
    ...parseActivitySheet(workbook, "생기부(진로-활동)", "진로 활동"),
    ...parseCareerLessons(workbook),
  ];
  const assignments = parseAssignments(workbook);
  const activityLinks = parseCareerActivityLinks(workbook);
  const checklistSheet = workbook.SheetNames.find(name => cleanText(name) === "생기부 점검");
  const checklistRows = checklistSheet ? workbookRows(workbook, checklistSheet) : [];
  const checklistTitle = cleanText(checklistRows?.[0]?.[0]);
  return {
    contacts,
    records: {
      activities,
      activityLinks,
      assignments,
      reflections: [],
      reflectionSources: [],
      checklistAvailable: /2학년/.test(checklistTitle),
      checklistTitle,
    },
    sourceName: fileName,
    importedAt: new Date().toISOString(),
  };
}

function reflectionActivityName(sheetName) {
  return cleanText(sheetName).replace(/\((\d{3,4})\)$/, "").replace(/[_-]+/g, " ").trim();
}

function reflectionDate(sheetName) {
  const match = cleanText(sheetName).match(/\((\d{3,4})\)$/);
  if (!match) return "";
  const digits = match[1];
  return digits.length === 3 ? `${digits[0]}/${digits.slice(1)}` : `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function parseReflectionWorkbook(arrayBuffer, fileName) {
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: false });
  const sourceId = `reflection-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const reflections = [];
  workbook.SheetNames.forEach(sheetName => {
    if (/학적|학생별\s*소감문\s*확인/.test(cleanText(sheetName))) return;
    const rows = workbookRows(workbook, sheetName);
    const headerIndex = rows.slice(0, 12).findIndex(row => row.some(cell => cleanText(cell).includes("학번")) && row.some(cell => cleanText(cell).includes("이름")));
    if (headerIndex < 0) return;
    const header = rows[headerIndex];
    const classIndex = columnIndex(header, ["반?", "반", "학급"]);
    const sidIndex = columnIndex(header, ["학번?", "학번"]);
    const nameIndex = columnIndex(header, ["이름?", "이름"]);
    const excluded = new Set([classIndex, sidIndex, nameIndex]);
    let responseIndex = header.findIndex((cell, index) => !excluded.has(index) && /소감|느낀점|작성하세요|응답|의견/.test(cleanText(cell)));
    if (responseIndex < 0) {
      responseIndex = header.reduce((best, cell, index) => (!excluded.has(index) && cleanText(cell).length > cleanText(header[best] || "").length ? index : best), -1);
    }
    if (responseIndex < 0) return;
    rows.slice(headerIndex + 1).forEach(row => {
      const sid = normalizeSid(row[sidIndex]);
      const name = cleanText(row[nameIndex]);
      const response = cleanMultiline(row[responseIndex]);
      if (!sid || !name || !response) return;
      reflections.push({
        id: `${sourceId}-${sheetName}-${sid}`,
        sourceId,
        sourceName: fileName,
        sourceSheet: sheetName,
        activity: reflectionActivityName(sheetName),
        date: reflectionDate(sheetName),
        classNumber: Number(row[classIndex]) || Number(sid.slice(1, 3)) || null,
        number: Number(sid.slice(3, 5)) || null,
        sid,
        name,
        response,
      });
    });
  });
  return {
    source: { id: sourceId, name: fileName, importedAt: new Date().toISOString(), count: reflections.length },
    reflections,
  };
}

async function copyText(text) {
  const value = String(text || "");
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  }
}

function EmptyState({ title, description }) {
  return <div className="gdt-empty"><FileSpreadsheet size={34}/><b>{title}</b><span>{description}</span></div>;
}

function countSummary(data) {
  return {
    contacts: data?.contacts?.length || 0,
    activities: data?.records?.activities?.length || 0,
    links: data?.records?.activityLinks?.length || 0,
    assignments: data?.records?.assignments?.length || 0,
    reflections: data?.records?.reflections?.length || 0,
    reflectionFiles: data?.records?.reflectionSources?.length || 0,
  };
}

function DataManagementWorkspace({ appliedData, draft, setDraft, canManage, actor, persist, db, showToast, draftKey }) {
  const mainFileRef = useRef(null);
  const reflectionFileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const appliedSummary = countSummary(appliedData);
  const draftSummary = countSummary(draft);

  const importMain = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const parsed = parseGradeDepartmentWorkbook(await file.arrayBuffer(), file.name);
      if (!parsed.contacts.length) throw new Error("'2학년명렬' 시트에서 학생 비상연락망을 찾지 못했습니다.");
      const previousRecords = draft?.records || appliedData?.records || {};
      parsed.records.reflections = previousRecords.reflections || [];
      parsed.records.reflectionSources = previousRecords.reflectionSources || [];
      parsed.updatedBy = actor?.name || actor?.id || "관리자";
      setDraft(parsed);
      showToast(`2학년부 파일을 임시 작업본으로 불러왔습니다. 연락망 ${parsed.contacts.length}명 · 활동 ${parsed.records.activities.length}건`, "success");
    } catch (error) {
      showToast(`파일을 불러오지 못했습니다. ${error.message}`, "error");
    } finally { setBusy(false); }
  };

  const importReflections = async event => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    setBusy(true);
    try {
      let working = draft || appliedData || { contacts: [], records: { activities: [], activityLinks: [], assignments: [], reflections: [], reflectionSources: [] } };
      const existingSources = [...(working.records?.reflectionSources || [])];
      const existingReflections = [...(working.records?.reflections || [])];
      let importedCount = 0;
      for (const file of files) {
        const parsed = parseReflectionWorkbook(await file.arrayBuffer(), file.name);
        if (!parsed.reflections.length) continue;
        const oldSourceIds = existingSources.filter(source => source.name === file.name).map(source => source.id);
        const cleanReflections = existingReflections.filter(item => !oldSourceIds.includes(item.sourceId));
        existingReflections.splice(0, existingReflections.length, ...cleanReflections, ...parsed.reflections);
        const cleanSources = existingSources.filter(source => source.name !== file.name);
        existingSources.splice(0, existingSources.length, ...cleanSources, parsed.source);
        importedCount += parsed.reflections.length;
      }
      working = {
        ...working,
        records: { ...(working.records || {}), reflections: existingReflections, reflectionSources: existingSources },
        updatedBy: actor?.name || actor?.id || "관리자",
      };
      setDraft(working);
      showToast(`소감문 ${importedCount}건을 임시 작업본에 불러왔습니다.`, importedCount ? "success" : "error");
    } catch (error) {
      showToast(`소감문 파일을 불러오지 못했습니다. ${error.message}`, "error");
    } finally { setBusy(false); }
  };

  const saveDraft = () => {
    if (!draft) return showToast("저장할 임시 작업본이 없습니다.", "error");
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
      showToast("업로드 자료를 현재 브라우저 임시본으로 저장했습니다.", "success");
    } catch {
      showToast("임시 저장 공간이 부족합니다. 소감문 파일 수를 줄이거나 학교 자료에 바로 반영해주세요.", "error");
    }
  };

  const applyDraft = async () => {
    if (!draft) return showToast("반영할 임시 작업본이 없습니다.", "error");
    setBusy(true);
    const applied = { ...draft, appliedAt: new Date().toISOString(), updatedBy: actor?.name || actor?.id || "관리자" };
    const next = { ...(db.gradeDepartmentData || {}), "2": applied };
    const ok = await persist({ gradeDepartmentData: next });
    if (ok) {
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      setDraft(applied);
      showToast("2학년부 자료를 학교 공용 화면에 반영했습니다.", "success");
    }
    setBusy(false);
  };

  const clearDraft = () => {
    if (!window.confirm("현재 브라우저의 임시 작업본을 초기화할까요? 학교 반영본은 삭제되지 않습니다.")) return;
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
    setDraft(appliedData || null);
    showToast("임시 작업본을 초기화했습니다.", "success");
  };

  const removeReflectionSource = sourceId => {
    if (!draft) return;
    setDraft({
      ...draft,
      records: {
        ...(draft.records || {}),
        reflectionSources: (draft.records?.reflectionSources || []).filter(source => source.id !== sourceId),
        reflections: (draft.records?.reflections || []).filter(item => item.sourceId !== sourceId),
      },
    });
  };

  return <div className="gdt-data-workspace">
    <div className="gdt-data-grid">
      <article className="gdt-data-card applied"><header><Database size={17}/><div><b>학교 반영본</b><span>담임과 2학년부 교사가 실제로 조회하는 자료</span></div></header><dl><div><dt>비상연락망</dt><dd>{appliedSummary.contacts}명</dd></div><div><dt>생기부 활동</dt><dd>{appliedSummary.activities}건</dd></div><div><dt>소감문</dt><dd>{appliedSummary.reflections}건</dd></div></dl><small>{appliedData?.sourceName || "반영된 파일 없음"}{appliedData?.appliedAt ? ` · ${new Date(appliedData.appliedAt).toLocaleString("ko-KR")}` : ""}</small></article>
      <article className="gdt-data-card draft"><header><FileSpreadsheet size={17}/><div><b>현재 임시 작업본</b><span>파일을 확인한 뒤 학교 자료에 반영할 수 있습니다.</span></div></header><dl><div><dt>비상연락망</dt><dd>{draftSummary.contacts}명</dd></div><div><dt>생기부 활동</dt><dd>{draftSummary.activities}건</dd></div><div><dt>소감문</dt><dd>{draftSummary.reflections}건</dd></div></dl><small>{draft?.sourceName || "불러온 파일 없음"}</small></article>
    </div>
    {!canManage ? <div className="gdt-info"><AlertTriangle size={15}/><span>자료 등록·교체는 2학년부장, 부서 계정 또는 관리자만 할 수 있습니다.</span></div> : <>
      <div className="gdt-upload-grid">
        <button type="button" onClick={()=>mainFileRef.current?.click()} disabled={busy}><Upload size={18}/><span><b>2학년부 업무 파일</b><small>명렬·자율/진로·활동 배정 자료</small></span></button>
        <button type="button" onClick={()=>reflectionFileRef.current?.click()} disabled={busy}><MessageSquareText size={18}/><span><b>학생 소감문 파일</b><small>현재 양식과 향후 Google Forms 응답 XLSX 복수 선택</small></span></button>
        <input ref={mainFileRef} hidden type="file" accept=".xlsx,.xls" onChange={importMain}/>
        <input ref={reflectionFileRef} hidden multiple type="file" accept=".xlsx,.xls" onChange={importReflections}/>
      </div>
      <div className="gdt-source-list">
        <div><b>업로드 파일 관리</b><span>같은 이름의 소감문 파일을 다시 올리면 해당 파일 자료를 교체합니다.</span></div>
        {draft?.sourceName && <article><FileSpreadsheet size={15}/><span><b>{draft.sourceName}</b><small>2학년부 기본 업무 파일</small></span></article>}
        {(draft?.records?.reflectionSources || []).map(source=><article key={source.id}><FileText size={15}/><span><b>{source.name}</b><small>소감문 {source.count}건 · {new Date(source.importedAt).toLocaleString("ko-KR")}</small></span><button type="button" onClick={()=>removeReflectionSource(source.id)}><Trash2 size={14}/>삭제</button></article>)}
        {!draft?.sourceName && !(draft?.records?.reflectionSources || []).length && <em>등록된 임시 파일이 없습니다.</em>}
      </div>
      <div className="gdt-save-actions"><button type="button" className="secondary" onClick={clearDraft}><RefreshCw size={15}/>임시본 초기화</button><button type="button" className="secondary" onClick={saveDraft}><Save size={15}/>임시 저장</button><button type="button" className="primary" onClick={applyDraft} disabled={busy}><CheckCircle2 size={15}/>학교 자료에 반영</button></div>
    </>}
  </div>;
}

function ContactWorkspace({ data, accessRole, homeroomClass, showToast, onUpdateData }) {
  const contacts = data?.contacts || [];
  const canViewAll = ["admin", "department", "gradeHead"].includes(accessRole);
  const lockedClass = !canViewAll ? String(homeroomClass || "") : "";
  const [classFilter, setClassFilter] = useState(lockedClass || "전체");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [editingSid, setEditingSid] = useState("");
  const [editRow, setEditRow] = useState(null);
  const classes = useMemo(() => Array.from(new Set(contacts.map(item=>String(item.classNumber)).filter(Boolean))).sort((a,b)=>Number(a)-Number(b)), [contacts]);
  const effectiveClass = lockedClass || classFilter;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter(item => (effectiveClass === "전체" || String(item.classNumber) === String(effectiveClass)) && (!q || item.sid.includes(q) || item.name.toLowerCase().includes(q) || formatPhone(item.studentPhone).includes(q) || formatPhone(item.guardianPhone).includes(q)));
  }, [contacts, effectiveClass, query]);
  const selectedRows = contacts.filter(item => selected.includes(item.sid));
  const toggle = sid => setSelected(prev => prev.includes(sid) ? prev.filter(value=>value!==sid) : [...prev,sid]);
  const copySelectedGuardians = async () => {
    const values = selectedRows.map(item=>formatPhone(item.guardianPhone)).filter(Boolean);
    if (!values.length) return showToast("선택 학생의 보호자 연락처가 없습니다.", "error");
    await copyText(values.join("\n"));
    showToast(`${values.length}개 보호자 연락처를 복사했습니다.`, "success");
  };
  const startEdit = item => { setEditingSid(item.sid); setEditRow({ ...item }); };
  const cancelEdit = () => { setEditingSid(""); setEditRow(null); };
  const saveEdit = async () => {
    const sid = normalizeSid(editRow?.sid);
    if (!sid || !cleanText(editRow?.name)) return showToast("학번과 성명을 확인해주세요.", "error");
    const duplicate = contacts.some(item => item.sid === sid && item.sid !== editingSid);
    if (duplicate) return showToast("이미 등록된 학번입니다.", "error");
    const nextContact = {
      ...editRow,
      sid,
      name: cleanText(editRow.name),
      classNumber: Number(editRow.classNumber) || Number(sid.slice(1, 3)),
      number: Number(editRow.number) || Number(sid.slice(3, 5)),
      studentPhone: normalizePhone(editRow.studentPhone),
      guardianPhone: normalizePhone(editRow.guardianPhone),
      note: cleanText(editRow.note),
    };
    const nextContacts = contacts.map(item => item.sid === editingSid ? nextContact : item).sort((a,b)=>Number(a.sid)-Number(b.sid));
    const ok = await onUpdateData({ ...data, contacts: nextContacts }, "학생 비상연락망을 수정했습니다.");
    if (ok) cancelEdit();
  };
  if (!canViewAll && !lockedClass) return <EmptyState title="담임 학급이 지정되지 않았습니다." description="내 정보 수정 또는 관리자 계정관리에서 담당 학급을 먼저 지정해주세요."/>;
  return <div className="gdt-contact-workspace">
    <div className="gdt-section-heading"><div><UserRound size={18}/><span><b>학생 비상연락망</b><small>학생·보호자 연락처를 확인하고 필요한 셀을 바로 복사합니다.</small></span></div><a href={IAM_TEACHER_URL} target="_blank" rel="noreferrer"><ExternalLink size={14}/>아이엠티처</a></div>
    <div className="gdt-toolbar">
      <div className="gdt-search"><Search size={16}/><span>학생 검색</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="학번·이름·전화번호"/></div>
      {canViewAll && <select value={classFilter} onChange={event=>{setClassFilter(event.target.value);setSelected([])}}><option value="전체">전체 학급</option>{classes.map(value=><option key={value} value={value}>{value}반</option>)}</select>}
      <button type="button" className="gdt-secondary" onClick={()=>setSelected(filtered.map(item=>item.sid))}><Check size={14}/>조회 학생 선택</button>
      <button type="button" className="gdt-secondary" onClick={()=>setSelected([])}><X size={14}/>선택 해제</button>
    </div>
    <div className="gdt-contact-actions"><span><b>{filtered.length}명</b> 조회 · <b>{selected.length}명</b> 선택</span><button type="button" onClick={copySelectedGuardians}><Copy size={14}/>선택 보호자 번호 복사</button></div>
    <div className="gdt-table-wrap"><table className="gdt-table contacts"><thead><tr><th>선택</th><th>반</th><th>번호</th><th>학번</th><th>성명</th><th>학생 연락처</th><th>보호자 연락처</th><th>비고</th><th>수정</th></tr></thead><tbody>{filtered.map(item => {
      const editing = editingSid === item.sid && editRow;
      return <tr key={item.sid} className={editing ? "editing" : ""}>
        <td><input type="checkbox" checked={selected.includes(item.sid)} onChange={()=>toggle(item.sid)}/></td>
        <td>{editing ? <input className="mini" value={editRow.classNumber ?? ""} onChange={event=>setEditRow({...editRow,classNumber:event.target.value})}/> : <b>{item.classNumber}반</b>}</td>
        <td>{editing ? <input className="mini" value={editRow.number ?? ""} onChange={event=>setEditRow({...editRow,number:event.target.value})}/> : <b>{item.number}번</b>}</td>
        <td>{editing ? <input value={editRow.sid} onChange={event=>setEditRow({...editRow,sid:event.target.value})}/> : item.sid}</td>
        <td>{editing ? <input value={editRow.name} onChange={event=>setEditRow({...editRow,name:event.target.value})}/> : <strong>{item.name}</strong>}</td>
        <td>{editing ? <input value={formatPhone(editRow.studentPhone)} onChange={event=>setEditRow({...editRow,studentPhone:event.target.value})}/> : <ContactCell value={item.studentPhone} label="학생" showToast={showToast}/>}</td>
        <td>{editing ? <input value={formatPhone(editRow.guardianPhone)} onChange={event=>setEditRow({...editRow,guardianPhone:event.target.value})}/> : <ContactCell value={item.guardianPhone} label="보호자" showToast={showToast}/>}</td>
        <td className="gdt-note">{editing ? <textarea value={editRow.note || ""} onChange={event=>setEditRow({...editRow,note:event.target.value})}/> : (item.note || "-")}</td>
        <td>{editing ? <div className="gdt-edit-actions"><button type="button" onClick={saveEdit}><Save size={13}/>저장</button><button type="button" onClick={cancelEdit}><X size={13}/></button></div> : <button type="button" className="gdt-icon-button" onClick={()=>startEdit(item)}><Pencil size={14}/></button>}</td>
      </tr>;
    })}</tbody></table></div>
  </div>;
}

function ContactCell({ value, label, showToast }) {
  const formatted = formatPhone(value);
  if (!formatted) return <span className="gdt-muted">미등록</span>;
  return <div className="gdt-contact-cell"><span>{formatted}</span><button type="button" title={`${label} 연락처 복사`} onClick={async()=>{await copyText(formatted);showToast(`${label} 연락처를 복사했습니다.`,"success")}}><Copy size={13}/></button></div>;
}

function RecordsWorkspace({ data, showToast, canManage, onUpdateData }) {
  const activities = data?.records?.activities || [];
  const activityLinks = data?.records?.activityLinks || [];
  const assignments = data?.records?.assignments || [];
  const reflections = data?.records?.reflections || [];
  const contacts = data?.contacts || [];
  const [tab, setTab] = useState("activities");
  const [category, setCategory] = useState("전체");
  const [activityQuery, setActivityQuery] = useState("");
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("전체");
  const [reflectionActivity, setReflectionActivity] = useState("전체");
  const [reflectionStatus, setReflectionStatus] = useState("전체");
  const [editingLinkId, setEditingLinkId] = useState("");
  const [linkDraft, setLinkDraft] = useState(null);
  const categories = useMemo(()=>Array.from(new Set(activities.map(item=>item.category))),[activities]);
  const classes = useMemo(()=>Array.from(new Set([...contacts.map(item=>String(item.classNumber)),...assignments.map(item=>String(item.classNumber))].filter(Boolean))).sort((a,b)=>Number(a)-Number(b)),[contacts,assignments]);
  const reflectionActivities = useMemo(()=>Array.from(new Set(reflections.map(item=>item.activity))).filter(Boolean).sort(),[reflections]);
  const filteredActivities = activities.filter(item=>(category==="전체"||item.category===category)&&(!activityQuery.trim()||item.record.includes(activityQuery.trim())));
  const filteredAssignments = assignments.filter(item=>(classFilter==="전체"||String(item.classNumber)===classFilter)&&(!query.trim()||item.sid.includes(query.trim())||item.name.includes(query.trim())));

  const reflectionRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (reflectionActivity === "전체") {
      return reflections.filter(item => (classFilter === "전체" || String(item.classNumber) === classFilter) && (!q || item.sid.includes(q) || item.name.toLowerCase().includes(q) || item.response.toLowerCase().includes(q)) && reflectionStatus !== "미제출").map(item=>({...item,submitted:true}));
    }
    const bySid = new Map(reflections.filter(item=>item.activity===reflectionActivity).map(item=>[item.sid,item]));
    const base = contacts.length ? contacts : reflections.filter(item=>item.activity===reflectionActivity);
    return base.map(student => {
      const item = bySid.get(student.sid);
      return item ? { ...item, submitted: true } : { id:`missing-${reflectionActivity}-${student.sid}`,activity:reflectionActivity,date:"",classNumber:student.classNumber,number:student.number,sid:student.sid,name:student.name,response:"",submitted:false };
    }).filter(item => (classFilter === "전체" || String(item.classNumber) === classFilter) && (!q || item.sid.includes(q) || item.name.toLowerCase().includes(q) || item.response.toLowerCase().includes(q)) && (reflectionStatus === "전체" || (reflectionStatus === "제출" ? item.submitted : !item.submitted)));
  }, [reflections, contacts, reflectionActivity, reflectionStatus, classFilter, query]);

  const startLinkEdit = item => { setEditingLinkId(item.id); setLinkDraft({ ...item }); };
  const saveLinkEdit = async () => {
    const nextLinks = activityLinks.map(item => item.id === editingLinkId ? { ...linkDraft, title: cleanText(linkDraft.title), formUrl: cleanText(linkDraft.formUrl), responseUrl: cleanText(linkDraft.responseUrl) } : item);
    const ok = await onUpdateData({ ...data, records: { ...(data.records || {}), activityLinks: nextLinks } }, "진로활동 링크를 수정했습니다.");
    if (ok) { setEditingLinkId(""); setLinkDraft(null); }
  };

  return <div className="gdt-records-workspace">
    <div className="gdt-record-metrics"><div><CalendarDays/><span>활동 일정</span><b>{activities.length}건</b></div><div><MessageSquareText/><span>학생 소감문</span><b>{reflections.length}건</b></div><div><UsersRound/><span>학생별 배정</span><b>{assignments.length}명</b></div></div>
    <div className="gdt-subtabs"><button type="button" className={tab==="activities"?"active":""} onClick={()=>setTab("activities")}><CalendarDays size={15}/>활동·누가기록</button><button type="button" className={tab==="reflections"?"active":""} onClick={()=>setTab("reflections")}><MessageSquareText size={15}/>학생 소감문</button><button type="button" className={tab==="assignments"?"active":""} onClick={()=>setTab("assignments")}><GraduationCap size={15}/>학생별 활동 배정</button><button type="button" className={tab==="guide"?"active":""} onClick={()=>setTab("guide")}><ListChecks size={15}/>활용 안내</button></div>
    {tab === "activities" && <>
      <div className="gdt-toolbar"><select value={category} onChange={event=>setCategory(event.target.value)}><option value="전체">전체 영역</option>{categories.map(value=><option key={value}>{value}</option>)}</select><div className="gdt-search"><Search size={16}/><span>누가기록 검색</span><input value={activityQuery} onChange={event=>setActivityQuery(event.target.value)} placeholder="활동명 입력"/></div></div>
      <div className="gdt-table-wrap"><table className="gdt-table activities"><thead><tr><th>영역</th><th>일자</th><th>교시</th><th>이수시간</th><th>누가기록</th><th>학생용 폼</th><th>응답시트</th><th>복사</th></tr></thead><tbody>{filteredActivities.map(item=><tr key={item.id}><td><span className="gdt-type-pill">{item.category}</span></td><td>{item.date||"-"}</td><td>{item.period ? `${item.period}교시` : "-"}</td><td><b>{item.hours ? `${item.hours}시간` : "-"}</b></td><td className="record"><strong>{item.record}</strong></td><td>{item.formUrl?<a className="gdt-link-button" href={item.formUrl} target="_blank" rel="noreferrer"><ExternalLink size={12}/>열기</a>:<span className="gdt-muted">-</span>}</td><td>{item.responseUrl?<a className="gdt-link-button response" href={item.responseUrl} target="_blank" rel="noreferrer"><ExternalLink size={12}/>확인</a>:<span className="gdt-muted">-</span>}</td><td><button type="button" className="gdt-icon-button" onClick={async()=>{await copyText(item.record);showToast("누가기록을 복사했습니다.","success")}}><Copy size={14}/></button></td></tr>)}</tbody></table></div>
      {activityLinks.length > 0 && <div className="gdt-link-manager"><div className="gdt-section-heading compact"><div><Link2 size={17}/><span><b>진로활동 폼·응답시트</b><small>응답시트 링크가 별도 셀에 있는 항목을 관리합니다.</small></span></div></div>{activityLinks.map(item => {
        const editing = editingLinkId === item.id && linkDraft;
        return <article key={item.id}>{editing ? <><input value={linkDraft.title} onChange={event=>setLinkDraft({...linkDraft,title:event.target.value})}/><label>학생용 폼<input value={linkDraft.formUrl||""} onChange={event=>setLinkDraft({...linkDraft,formUrl:event.target.value})} placeholder="https://"/></label><label>응답시트<input value={linkDraft.responseUrl||""} onChange={event=>setLinkDraft({...linkDraft,responseUrl:event.target.value})} placeholder="https://"/></label><div><button type="button" onClick={saveLinkEdit}><Save size={13}/>저장</button><button type="button" onClick={()=>{setEditingLinkId("");setLinkDraft(null)}}><X size={13}/>취소</button></div></> : <><strong>{item.title}</strong><span>{item.formUrl?<a href={item.formUrl} target="_blank" rel="noreferrer"><ExternalLink size={12}/>학생용 폼</a>:<em>학생용 폼 미등록</em>}</span><span>{item.responseUrl?<a href={item.responseUrl} target="_blank" rel="noreferrer"><ExternalLink size={12}/>응답시트</a>:<em>응답시트 미등록</em>}</span>{canManage&&<button type="button" onClick={()=>startLinkEdit(item)}><Pencil size={13}/>수정</button>}</>}</article>;
      })}</div>}
    </>}
    {tab === "reflections" && <>
      <div className="gdt-toolbar reflection-filters"><div className="gdt-search"><Search size={16}/><span>학생·소감 검색</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="학번·이름·소감문"/></div><select value={classFilter} onChange={event=>setClassFilter(event.target.value)}><option value="전체">전체 학급</option>{classes.map(value=><option key={value} value={value}>{value}반</option>)}</select><select value={reflectionActivity} onChange={event=>setReflectionActivity(event.target.value)}><option value="전체">전체 활동</option>{reflectionActivities.map(value=><option key={value}>{value}</option>)}</select><select value={reflectionStatus} onChange={event=>setReflectionStatus(event.target.value)} disabled={reflectionActivity==="전체"}><option value="전체">제출 전체</option><option value="제출">제출</option><option value="미제출">미제출</option></select></div>
      <div className="gdt-reflection-summary"><span><b>{reflectionRows.length}건</b> 조회</span><span className="submitted"><CheckCircle2 size={13}/>제출 {reflectionRows.filter(item=>item.submitted).length}</span>{reflectionActivity!=="전체"&&<span className="missing"><CircleDashed size={13}/>미제출 {reflectionRows.filter(item=>!item.submitted).length}</span>}</div>
      <div className="gdt-table-wrap"><table className="gdt-table reflections"><thead><tr><th>반</th><th>번호</th><th>학번</th><th>성명</th><th>활동</th><th>상태</th><th>소감문</th><th>복사</th></tr></thead><tbody>{reflectionRows.map(item=><tr key={item.id}><td>{item.classNumber}반</td><td>{item.number}번</td><td>{item.sid}</td><td><b>{item.name}</b></td><td><strong>{item.activity}</strong>{item.date&&<small>{item.date}</small>}</td><td>{item.submitted?<span className="status submitted">제출</span>:<span className="status missing">미제출</span>}</td><td className="reflection-text">{item.submitted?<details><summary>{item.response.slice(0,90)}{item.response.length>90?"…":""}</summary><p>{item.response}</p></details>:<span className="gdt-muted">소감문 미제출</span>}</td><td>{item.submitted&&<button type="button" className="gdt-icon-button" onClick={async()=>{await copyText(item.response);showToast("학생 소감문을 복사했습니다.","success")}}><Copy size={14}/></button>}</td></tr>)}</tbody></table></div>
    </>}
    {tab === "assignments" && <><div className="gdt-toolbar"><div className="gdt-search"><Search size={16}/><span>학생 검색</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="학번 또는 이름"/></div><select value={classFilter} onChange={event=>setClassFilter(event.target.value)}><option value="전체">전체 학급</option>{classes.map(value=><option key={value} value={value}>{value}반</option>)}</select></div><div className="gdt-table-wrap"><table className="gdt-table assignments"><thead><tr><th>학생</th><th>동아리</th><th>프로젝트 봉사활동</th><th>학생주도 프로젝트</th></tr></thead><tbody>{filteredAssignments.map(item=><tr key={item.sid}><td><b>{item.name}</b><small>{item.classNumber}반 {item.number}번 · {item.sid}</small></td><td><strong>{item.club||"-"}</strong><small>{item.clubTeacher||""}</small></td><td><strong>{item.service||"-"}</strong><small>{item.serviceTeacher||""}</small></td><td><strong>{item.studentProject||"-"}</strong><small>{item.studentProjectTeacher||""}</small></td></tr>)}</tbody></table></div></>}
    {tab === "guide" && <div className="gdt-guide-grid"><article><BookOpenCheck/><b>누가기록 중심</b><p>불필요한 문장 서두는 제외하고 일자·교시·현재 이수시간과 누가기록만 확인·복사합니다.</p></article><article><MessageSquareText/><b>소감문 통합</b><p>현재 소감문 양식과 향후 Google Forms 응답 XLSX를 함께 올려 활동별·학생별로 검색합니다.</p></article><article><UsersRound/><b>학생별 배정 확인</b><p>학생의 동아리·프로젝트 봉사·학생주도 프로젝트와 담당 교사를 학급별로 검색합니다.</p></article><article><Database/><b>파일 관리</b><p>자료 관리 탭에서 임시 저장 후 학교 공용 자료로 반영하며, 업로드한 소감문 파일을 개별 삭제할 수 있습니다.</p></article></div>}
  </div>;
}

export default function GradeDepartmentTools({ view, db, persist, showToast, actor, accessRole, homeroomClass }) {
  const appliedData = db?.gradeDepartmentData?.["2"] || null;
  const canManage = ["admin", "department", "gradeHead"].includes(accessRole);
  const draftKey = `kd_grade_department_draft_v22_${actor?.id || actor?.name || "shared"}`;
  const [draft, setDraft] = useState(() => {
    try { return JSON.parse(localStorage.getItem(draftKey) || "null") || appliedData; }
    catch { return appliedData; }
  });
  useEffect(() => {
    try { setDraft(JSON.parse(localStorage.getItem(draftKey) || "null") || appliedData || null); }
    catch { setDraft(appliedData || null); }
  }, [draftKey]);
  useEffect(() => {
    if (!draft && appliedData) setDraft(appliedData);
  }, [appliedData, draft]);

  const updateAppliedData = async (nextData, successMessage) => {
    const next = { ...(db.gradeDepartmentData || {}), "2": { ...nextData, updatedBy: actor?.name || actor?.id || "교사", appliedAt: new Date().toISOString() } };
    const ok = await persist({ gradeDepartmentData: next });
    if (ok) showToast(successMessage, "success");
    return ok;
  };

  return <section className="grade-department-tools">
    <style>{GRADE_DEPARTMENT_CSS}</style>
    {view === "gradeData" ? <DataManagementWorkspace appliedData={appliedData} draft={draft} setDraft={setDraft} canManage={canManage} actor={actor} persist={persist} db={db} showToast={showToast} draftKey={draftKey}/> : !appliedData ? <EmptyState title="2학년부 자료가 아직 학교에 반영되지 않았습니다." description={canManage ? "자료 관리 탭에서 2학년부 업무 파일을 불러온 뒤 '학교 자료에 반영'을 눌러주세요." : "2학년부장 또는 관리자가 자료를 먼저 반영해야 합니다."}/> : view === "contacts" ? <ContactWorkspace data={appliedData} accessRole={accessRole} homeroomClass={homeroomClass} showToast={showToast} onUpdateData={updateAppliedData}/> : <RecordsWorkspace data={appliedData} showToast={showToast} canManage={canManage} onUpdateData={updateAppliedData}/>} 
  </section>;
}

const GRADE_DEPARTMENT_CSS = `
.grade-department-tools{font-family:${FONT};color:#273b55;display:grid;gap:14px}.grade-department-tools *{box-sizing:border-box}.gdt-empty{min-height:280px;display:grid;place-items:center;align-content:center;gap:8px;border:1px dashed #cbd8e6;border-radius:16px;background:#fafcff;color:#7b899b;text-align:center;padding:24px}.gdt-empty b{font-size:14px;color:#52657c}.gdt-empty span{font-size:11px;line-height:1.55;max-width:640px}.gdt-section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid #d6e1ec;border-radius:13px;background:linear-gradient(135deg,#f7fbff,#fbfcff)}.gdt-section-heading>div{display:flex;align-items:center;gap:9px}.gdt-section-heading span{display:grid;gap:3px}.gdt-section-heading b{font-size:13px}.gdt-section-heading small{font-size:10px;color:#738397}.gdt-section-heading>a{display:inline-flex;align-items:center;gap:5px;padding:7px 9px;border:1px solid #cbd8e5;border-radius:8px;color:#426991;text-decoration:none;font-size:10px;font-weight:850}.gdt-section-heading.compact{padding:0;border:0;background:none}.gdt-toolbar{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.gdt-search{flex:1 1 330px;min-width:240px;display:grid;grid-template-columns:auto auto minmax(0,1fr);align-items:center;gap:8px;border:1px solid #ccd8e6;border-radius:11px;background:#fff;padding:5px 7px 5px 10px}.gdt-search>span{font-size:10.5px;font-weight:900;color:#60738a;padding-right:8px;border-right:1px solid #e2e8ef}.gdt-search input{min-width:0;border:0;outline:0;padding:6px 8px;font:750 11px ${FONT};color:#2c4058}.gdt-toolbar select{min-height:39px;border:1px solid #ccd8e6;border-radius:10px;background:#fff;padding:7px 30px 7px 10px;color:#435970;font:850 11px ${FONT}}.gdt-secondary,.gdt-contact-actions button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid #bfcfe1;border-radius:9px;padding:8px 10px;background:#fff;color:#35628f;font:800 11px ${FONT};cursor:pointer;white-space:nowrap}.gdt-contact-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:11px;background:#f3f7fb;color:#6b7b8e;font-size:11px}.gdt-table-wrap{overflow:auto;border:1px solid #d6e0eb;border-radius:13px;background:#fff}.gdt-table{width:100%;min-width:900px;border-collapse:separate;border-spacing:0;table-layout:fixed}.gdt-table th{position:sticky;top:0;z-index:1;background:#edf4fb;color:#435b74;padding:10px 7px;border-right:1px solid #d6e0ea;border-bottom:1px solid #c8d6e5;font-size:10px;font-weight:950;text-align:center}.gdt-table td{padding:9px 7px;border-right:1px solid #e0e7ef;border-bottom:1px solid #e0e7ef;font-size:10.5px;text-align:center;vertical-align:middle}.gdt-table tr:last-child td{border-bottom:0}.gdt-table th:last-child,.gdt-table td:last-child{border-right:0}.gdt-table tr.editing td{background:#fffaf0}.gdt-table input,.gdt-table textarea,.gdt-link-manager input{width:100%;min-width:0;border:1px solid #cbd8e5;border-radius:7px;padding:6px 7px;font:750 10.5px ${FONT};color:#30465f}.gdt-table input.mini{max-width:52px;text-align:center}.gdt-table textarea{min-height:52px;resize:vertical}.gdt-table td small,.gdt-table.assignments td small{display:block;margin-top:3px;color:#8190a2;font-size:9px;line-height:1.35}.gdt-table .gdt-note{text-align:left;white-space:normal;word-break:keep-all;line-height:1.45}.gdt-muted{color:#9aa5b2}.gdt-icon-button{display:inline-grid;place-items:center;width:29px;height:29px;border:1px solid #cdd9e6;border-radius:8px;background:#fff;color:#356493;cursor:pointer}.gdt-edit-actions{display:flex;gap:4px;justify-content:center}.gdt-edit-actions button{display:inline-flex;align-items:center;gap:3px;border:1px solid #cad7e5;border-radius:7px;background:#fff;color:#356493;padding:5px;font:800 9px ${FONT}}.gdt-table.contacts{min-width:970px}.gdt-table.contacts th:nth-child(1){width:43px}.gdt-table.contacts th:nth-child(2){width:53px}.gdt-table.contacts th:nth-child(3){width:53px}.gdt-table.contacts th:nth-child(4){width:72px}.gdt-table.contacts th:nth-child(5){width:78px}.gdt-table.contacts th:nth-child(6),.gdt-table.contacts th:nth-child(7){width:142px}.gdt-table.contacts th:nth-child(8){width:auto}.gdt-table.contacts th:nth-child(9){width:58px}.gdt-contact-cell{display:flex;align-items:center;justify-content:center;gap:6px}.gdt-contact-cell span{white-space:nowrap}.gdt-contact-cell button{display:grid;place-items:center;width:24px;height:24px;border:1px solid #d2dce8;border-radius:7px;background:#fff;color:#47709a;cursor:pointer}.gdt-record-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.gdt-record-metrics>div{display:grid;grid-template-columns:auto 1fr;gap:3px 8px;align-items:center;padding:12px;border:1px solid #d9e2ec;border-radius:12px;background:#fff}.gdt-record-metrics svg{grid-row:1/3;color:#47739d}.gdt-record-metrics span{font-size:10px;color:#75869a;font-weight:850}.gdt-record-metrics b{font-size:18px}.gdt-subtabs{display:flex;gap:7px;flex-wrap:wrap}.gdt-subtabs button{display:inline-flex;align-items:center;gap:6px;border:1px solid #d1dce8;border-radius:9px;padding:8px 11px;background:#fff;color:#68778a;font:850 11px ${FONT};cursor:pointer}.gdt-subtabs button.active{background:#3d6998;color:#fff;border-color:#3d6998}.gdt-table.activities{min-width:940px}.gdt-table.activities th:nth-child(1){width:82px}.gdt-table.activities th:nth-child(2){width:76px}.gdt-table.activities th:nth-child(3){width:62px}.gdt-table.activities th:nth-child(4){width:72px}.gdt-table.activities th:nth-child(5){width:auto}.gdt-table.activities th:nth-child(6),.gdt-table.activities th:nth-child(7){width:85px}.gdt-table.activities th:nth-child(8){width:52px}.gdt-table.activities td.record{text-align:left;line-height:1.45;word-break:keep-all}.gdt-type-pill{display:inline-block;padding:4px 7px;border-radius:999px;background:#eaf2fb;color:#38658f;font-size:9px;font-weight:900;white-space:nowrap}.gdt-link-button{display:inline-flex;align-items:center;gap:4px;padding:5px 7px;border:1px solid #bfd0e2;border-radius:7px;color:#356493;text-decoration:none;font-size:9px;font-weight:900}.gdt-link-button.response{color:#3d765f;border-color:#bfdccb}.gdt-link-manager{display:grid;gap:8px;padding:13px;border:1px solid #d8e2ed;border-radius:13px;background:#fafcff}.gdt-link-manager article{display:grid;grid-template-columns:minmax(160px,1.2fr) minmax(130px,.8fr) minmax(130px,.8fr) auto;gap:8px;align-items:center;padding:9px 10px;border:1px solid #e0e7ef;border-radius:10px;background:#fff}.gdt-link-manager article>a,.gdt-link-manager article span a{display:inline-flex;align-items:center;gap:4px;color:#416b94;text-decoration:none;font-size:10px;font-weight:850}.gdt-link-manager article em{font-size:9.5px;color:#9aa5b2}.gdt-link-manager article>button,.gdt-link-manager article>div button{display:inline-flex;align-items:center;gap:4px;border:1px solid #cad7e4;border-radius:7px;background:#fff;padding:6px 8px;color:#426991;font:850 9.5px ${FONT}}.gdt-link-manager article label{display:grid;gap:3px;font-size:9px;color:#748397}.gdt-table.reflections{min-width:1060px}.gdt-table.reflections th:nth-child(1),.gdt-table.reflections th:nth-child(2){width:50px}.gdt-table.reflections th:nth-child(3){width:68px}.gdt-table.reflections th:nth-child(4){width:76px}.gdt-table.reflections th:nth-child(5){width:130px}.gdt-table.reflections th:nth-child(6){width:68px}.gdt-table.reflections th:nth-child(7){width:auto}.gdt-table.reflections th:nth-child(8){width:52px}.gdt-table.reflections td.reflection-text{text-align:left;line-height:1.55}.gdt-table.reflections details summary{cursor:pointer;color:#4d6076;font-weight:750}.gdt-table.reflections details p{white-space:pre-wrap;margin:8px 0 0;padding:9px;border-radius:8px;background:#f7f9fc;color:#42566d}.status{display:inline-block;padding:4px 7px;border-radius:999px;font-size:9px;font-weight:900}.status.submitted{background:#e8f6ed;color:#2f7752}.status.missing{background:#fff0ed;color:#a34d42}.gdt-reflection-summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 11px;border-radius:10px;background:#f4f7fb;font-size:10px;color:#63758b}.gdt-reflection-summary span{display:inline-flex;align-items:center;gap:4px}.gdt-reflection-summary .submitted{color:#307454}.gdt-reflection-summary .missing{color:#a45045}.gdt-table.assignments{min-width:920px}.gdt-table.assignments th:first-child{width:135px}.gdt-table.assignments td{text-align:left;line-height:1.45}.gdt-guide-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.gdt-guide-grid article{display:grid;grid-template-columns:auto 1fr;gap:5px 9px;padding:14px;border:1px solid #d9e2ec;border-radius:12px;background:#fff}.gdt-guide-grid svg{grid-row:1/3;color:#48739f}.gdt-guide-grid b{font-size:12px}.gdt-guide-grid p{margin:0;color:#738297;font-size:10.5px;line-height:1.55}.gdt-contact-workspace,.gdt-records-workspace,.gdt-data-workspace{display:grid;gap:12px}.gdt-data-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.gdt-data-card{display:grid;gap:11px;padding:15px;border:1px solid #d8e2ed;border-radius:14px;background:#fff}.gdt-data-card.applied{background:linear-gradient(135deg,#f6fbf8,#fbfdfc)}.gdt-data-card.draft{background:linear-gradient(135deg,#f7faff,#fbfcff)}.gdt-data-card header{display:flex;align-items:center;gap:9px}.gdt-data-card header div{display:grid;gap:3px}.gdt-data-card header b{font-size:13px}.gdt-data-card header span,.gdt-data-card small{font-size:9.5px;color:#7a899b}.gdt-data-card dl{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0}.gdt-data-card dl div{padding:9px;border-radius:9px;background:rgba(255,255,255,.75);border:1px solid #e0e7ef;text-align:center}.gdt-data-card dt{font-size:9px;color:#7a899b}.gdt-data-card dd{margin:3px 0 0;font-size:17px;font-weight:950}.gdt-upload-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.gdt-upload-grid>button{display:flex;align-items:center;gap:10px;padding:15px;border:1px dashed #b8cbe0;border-radius:13px;background:#f8fbff;color:#356493;text-align:left;cursor:pointer}.gdt-upload-grid button span{display:grid;gap:3px}.gdt-upload-grid button b{font-size:12px}.gdt-upload-grid button small{font-size:9.5px;color:#738397}.gdt-source-list{display:grid;gap:7px;padding:13px;border:1px solid #d8e2ed;border-radius:13px;background:#fff}.gdt-source-list>div{display:grid;gap:3px}.gdt-source-list>div b{font-size:12px}.gdt-source-list>div span{font-size:9.5px;color:#778699}.gdt-source-list article{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:9px;border:1px solid #e0e7ef;border-radius:9px;background:#fafcff}.gdt-source-list article span{display:grid;gap:3px;min-width:0}.gdt-source-list article b{font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gdt-source-list article small{font-size:9px;color:#8190a2}.gdt-source-list article button{display:inline-flex;align-items:center;gap:4px;border:1px solid #efd0cb;border-radius:7px;background:#fff7f5;color:#a05248;padding:5px 7px;font:850 9px ${FONT}}.gdt-source-list em{font-size:10px;color:#98a3b0}.gdt-save-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}.gdt-save-actions button{display:inline-flex;align-items:center;gap:6px;padding:9px 11px;border-radius:9px;font:900 10.5px ${FONT};cursor:pointer}.gdt-save-actions .secondary{border:1px solid #cbd8e5;background:#fff;color:#506b87}.gdt-save-actions .primary{border:1px solid #376a9f;background:#376a9f;color:#fff}.gdt-info{display:flex;align-items:flex-start;gap:8px;padding:11px 12px;border-radius:11px;background:#fff8e9;border:1px solid #edd9ad;color:#7b6331;font-size:10.5px;line-height:1.5}@media(max-width:800px){.gdt-contact-actions{align-items:stretch;flex-direction:column}.gdt-record-metrics,.gdt-guide-grid,.gdt-data-grid,.gdt-upload-grid{grid-template-columns:1fr}.gdt-link-manager article{grid-template-columns:1fr}.gdt-data-card dl{grid-template-columns:repeat(3,1fr)}}
`;
