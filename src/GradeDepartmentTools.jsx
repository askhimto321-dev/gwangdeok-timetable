import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Upload, Search, Copy, ExternalLink, UsersRound, BookOpenCheck, ClipboardCheck,
  CalendarDays, Link2, FileSpreadsheet, Check, AlertTriangle, X, GraduationCap,
  ListChecks, Database, Save, RefreshCw, Trash2, Pencil, MessageSquareText,
  FileText, UserRound, Filter, CheckCircle2, CircleDashed, Printer,
} from "lucide-react";

const FONT = '"Pretendard","SUIT","Noto Sans KR","Malgun Gothic",sans-serif';
const IAM_TEACHER_URL = "https://id.iamservice.net/login";
const ACADEMIC_STATUS_OPTIONS = ["재학", "전입", "전출", "자퇴"];
const LEADERSHIP_ROLE_OPTIONS = [
  "없음",
  "1학기 학급자치회장", "1학기 학급자치부회장",
  "2학기 학급자치회장", "2학기 학급자치부회장",
  "학급자치회장", "학급자치부회장",
  "학생자치회장", "학생자치부회장",
];
const LEADERSHIP_ROLE_FILTERS = [
  ["전체", "전체 자치 역할"],
  ["1학기 학급자치회장", "1학기 학급자치회장"],
  ["1학기 학급자치부회장", "1학기 학급자치부회장"],
  ["2학기 학급자치회장", "2학기 학급자치회장"],
  ["2학기 학급자치부회장", "2학기 학급자치부회장"],
  ["학급자치회장", "학기 미지정 학급자치회장"],
  ["학급자치부회장", "학기 미지정 학급자치부회장"],
  ["학생자치회장", "학생자치회장"],
  ["학생자치부회장", "학생자치부회장"],
  ["없음", "자치 역할 없음"],
];

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

function normalizeAcademicStatus(value) {
  const text = cleanText(value);
  if (text.includes("자퇴")) return "자퇴";
  if (text.includes("전출")) return "전출";
  if (text.includes("전입")) return "전입";
  return "재학";
}

function normalizeLeadershipRole(value) {
  const raw = cleanText(value);
  if (!raw || raw === "없음") return "없음";
  const text = raw.replace(/\s/g, "");
  const roles = [];
  const add = role => { if (role && !roles.includes(role)) roles.push(role); };
  if (/1학기.*학급자치.*부회장/.test(text)) add("1학기 학급자치부회장");
  else if (/1학기.*학급자치.*회장/.test(text)) add("1학기 학급자치회장");
  if (/2학기.*학급자치.*부회장/.test(text)) add("2학기 학급자치부회장");
  else if (/2학기.*학급자치.*회장/.test(text)) add("2학기 학급자치회장");
  if (/학생자치.*부회장/.test(text)) add("학생자치부회장");
  else if (/학생자치.*회장/.test(text)) add("학생자치회장");
  if (!roles.length && (/학급자치.*부회장/.test(text) || /학급.*부회장/.test(text))) add("학급자치부회장");
  else if (!roles.length && (/학급자치.*회장/.test(text) || /학급.*회장/.test(text))) add("학급자치회장");
  return roles.length ? roles.join(" · ") : raw;
}

function leadershipRoleOptionLabel(value) {
  return value === "없음" ? "-" : value;
}

function leadershipOptionsFor(value) {
  const normalized = normalizeLeadershipRole(value);
  return normalized !== "없음" && !LEADERSHIP_ROLE_OPTIONS.includes(normalized)
    ? [normalized, ...LEADERSHIP_ROLE_OPTIONS]
    : LEADERSHIP_ROLE_OPTIONS;
}

function leadershipRoleTokens(value) {
  return normalizeLeadershipRole(value).split("·").map(cleanText).filter(Boolean);
}

function leadershipRoleMatches(value, filter) {
  if (!filter || filter === "전체") return true;
  const tokens = leadershipRoleTokens(value);
  return filter === "없음" ? tokens.length === 1 && tokens[0] === "없음" : tokens.includes(filter);
}

function leadershipRoleTone(value) {
  const text = normalizeLeadershipRole(value);
  if (text === "없음") return "none";
  if (/학생자치.*부회장/.test(text)) return "student-vice";
  if (/학생자치.*회장/.test(text)) return "student-chair";
  if (/학급자치.*부회장/.test(text)) return "class-vice";
  if (/학급자치.*회장/.test(text)) return "class-chair";
  return "other";
}

function parseClassAutonomyRoles(rows) {
  const roleBySid = new Map();
  const appendRole = (sid, role) => {
    if (!sid || !role) return;
    const current = roleBySid.get(sid);
    roleBySid.set(sid, current ? normalizeLeadershipRole(`${current} · ${role}`) : normalizeLeadershipRole(role));
  };
  rows.forEach((row, headerIndex) => {
    const labels = row.map(cleanText);
    const chairIndex = labels.findIndex(value => value.includes("학급자치회장"));
    const viceIndex = labels.findIndex(value => value.includes("학급자치부회장"));
    if (chairIndex < 0 && viceIndex < 0) return;
    const classIndex = labels.findIndex(value => value === "반");
    let semester = "";
    for (let index = Math.max(0, headerIndex - 3); index <= headerIndex; index += 1) {
      const title = (rows[index] || []).map(cleanText).join(" ");
      if (/20\d{2}\s*[-.]?\s*1|1학기/.test(title)) semester = "1학기";
      if (/20\d{2}\s*[-.]?\s*2|2학기/.test(title)) semester = "2학기";
    }
    let blankCount = 0;
    for (let rowIndex = headerIndex + 1; rowIndex < Math.min(rows.length, headerIndex + 18); rowIndex += 1) {
      const dataRow = rows[rowIndex] || [];
      const classNumber = classIndex >= 0 ? Number(dataRow[classIndex]) : 0;
      const chairSid = chairIndex >= 0 ? normalizeSid(dataRow[chairIndex]) : "";
      const viceSid = viceIndex >= 0 ? normalizeSid(dataRow[viceIndex]) : "";
      if (!classNumber && !chairSid && !viceSid) {
        blankCount += 1;
        if (blankCount >= 3) break;
        continue;
      }
      blankCount = 0;
      if (chairSid) appendRole(chairSid, `${semester ? `${semester} ` : ""}학급자치회장`);
      if (viceSid) appendRole(viceSid, `${semester ? `${semester} ` : ""}학급자치부회장`);
    }
  });
  return roleBySid;
}

function normalizeContactItem(item) {
  const sid = normalizeSid(item?.sid);
  return {
    ...item,
    sid,
    name: cleanText(item?.name),
    classNumber: Number(item?.classNumber) || Number(sid.slice(1, 3)) || null,
    number: Number(item?.number) || Number(sid.slice(3, 5)) || null,
    studentPhone: normalizePhone(item?.studentPhone),
    guardianPhone: normalizePhone(item?.guardianPhone),
    note: cleanText(item?.note),
    enrollmentStatus: normalizeAcademicStatus(item?.enrollmentStatus),
    leadershipRole: normalizeLeadershipRole(item?.leadershipRole),
  };
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
  const statusIndex = columnIndex(header, ["학적 상태", "학적", "재학 상태"]);
  const roleIndex = columnIndex(header, ["학급/학생 자치", "학생회 역할", "자치회 역할", "역할"]);
  const autonomyRoles = parseClassAutonomyRoles(rows);
  const seen = new Set();
  return rows.slice(headerIndex + 1).map(row => {
    const sid = normalizeSid(row[sidIndex]);
    const name = cleanText(row[nameIndex]);
    if (!sid || !name || seen.has(sid)) return null;
    seen.add(sid);
    return normalizeContactItem({
      sid,
      name,
      classNumber: Number(row[classIndex]) || Number(sid.slice(1, 3)) || null,
      number: Number(row[numberIndex]) || Number(sid.slice(3, 5)) || null,
      studentPhone: row[studentPhoneIndex],
      guardianPhone: row[guardianPhoneIndex],
      note: row[noteIndex],
      enrollmentStatus: statusIndex >= 0 ? row[statusIndex] : "재학",
      leadershipRole: roleIndex >= 0 && cleanText(row[roleIndex]) ? row[roleIndex] : (autonomyRoles.get(sid) || "없음"),
    });
  }).filter(Boolean).sort((a, b) => Number(a.classNumber) - Number(b.classNumber) || Number(a.number) - Number(b.number) || Number(a.sid) - Number(b.sid));
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

function normalizeReflectionItem(item) {
  const sid = normalizeSid(item?.sid);
  const sourceSheet = cleanText(item?.sourceSheet || "");
  const rawActivity = cleanText(item?.activity || "");
  return {
    ...item,
    sid,
    activity: reflectionActivityName(rawActivity || sourceSheet),
    date: cleanText(item?.date) || reflectionDate(sourceSheet) || reflectionDate(rawActivity),
    // Google Forms의 반 응답에는 오입력이 있을 수 있어 학번의 반·번호를 우선 사용합니다.
    classNumber: Number(sid.slice(1, 3)) || Number(item?.classNumber) || null,
    number: Number(sid.slice(3, 5)) || Number(item?.number) || null,
    name: cleanText(item?.name),
    response: cleanMultiline(item?.response),
  };
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function openPrintDocument({ title, subtitle = "", headers, rows, columnWidths = [] }) {
  const popup = window.open("", "_blank", "width=1280,height=900");
  if (!popup) return false;
  const colgroup = columnWidths.length
    ? `<colgroup>${columnWidths.map(width => `<col style="width:${escapeHtml(width)}">`).join("")}</colgroup>`
    : "";
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page{size:A4 landscape;margin:8mm}
    *{box-sizing:border-box}html,body{margin:0;padding:0;color:#23364d;font-family:"Pretendard","SUIT","Noto Sans KR","Malgun Gothic",sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{padding:4mm;background:#fff}.print-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding-bottom:8px;margin-bottom:10px;border-bottom:2px solid #456f9b}.print-head h1{margin:0;font-size:18px}.print-head p{margin:4px 0 0;color:#687b90;font-size:10px;line-height:1.5}.print-head small{color:#7d8b9b;font-size:9px;white-space:nowrap}
    table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#edf4fb;color:#3d5875;font-size:9px;font-weight:900;text-align:center;padding:6px 5px;border:1px solid #cbd8e5}td{font-size:8.8px;line-height:1.45;padding:6px 5px;border:1px solid #d8e1eb;text-align:center;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;white-space:normal}td.text{text-align:left;white-space:pre-wrap}.status{display:inline-block;padding:2px 6px;border-radius:999px;font-weight:900}.submitted{background:#e9f6ee;color:#24704c}.missing{background:#fff0ed;color:#aa493f}
    tr{break-inside:avoid;page-break-inside:avoid}thead{display:table-header-group}
    @media print{body{padding:0}.no-print{display:none!important}}
  </style></head><body><header class="print-head"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div><small>${new Date().toLocaleString("ko-KR")}</small></header><table>${colgroup}<thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td class="${cell?.className || ""}">${cell?.html ?? escapeHtml(cell?.value ?? cell ?? "-")}</td>`).join("")}</tr>`).join("")}</tbody></table><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),180));<\/script></body></html>`);
  popup.document.close();
  return true;
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

function ContactWorkspace({ data, accessRole, homeroomClass, showToast, onUpdateData, actor }) {
  const contacts = useMemo(
    () => (data?.contacts || []).map(normalizeContactItem).filter(item => item.sid && item.name),
    [data?.contacts],
  );
  const canViewAll = ["admin", "department", "gradeHead"].includes(accessRole);
  const lockedClass = !canViewAll ? String(homeroomClass || "") : "";
  const [classFilter, setClassFilter] = useState(lockedClass || "전체");
  const [roleFilter, setRoleFilter] = useState("전체");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [editingSid, setEditingSid] = useState("");
  const [editRow, setEditRow] = useState(null);
  const [bulkLeadershipRole, setBulkLeadershipRole] = useState("없음");
  const roleDraftKey = `kd_contact_role_draft_v25_${actor?.id || actor?.name || "shared"}`;
  const [leadershipDraft, setLeadershipDraft] = useState(() => {
    try { return JSON.parse(localStorage.getItem(roleDraftKey) || "{}"); }
    catch { return {}; }
  });
  useEffect(() => {
    try { setLeadershipDraft(JSON.parse(localStorage.getItem(roleDraftKey) || "{}")); }
    catch { setLeadershipDraft({}); }
  }, [roleDraftKey]);
  const classes = useMemo(() => Array.from(new Set(contacts.map(item=>String(item.classNumber)).filter(Boolean))).sort((a,b)=>Number(a)-Number(b)), [contacts]);
  const roleValue = item => leadershipDraft[item.sid] ?? item.leadershipRole ?? "없음";
  const effectiveClass = lockedClass || classFilter;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter(item =>
      (effectiveClass === "전체" || String(item.classNumber) === String(effectiveClass))
      && leadershipRoleMatches(roleValue(item), roleFilter)
      && (!q || item.sid.includes(q) || item.name.toLowerCase().includes(q) || formatPhone(item.studentPhone).includes(q) || formatPhone(item.guardianPhone).includes(q) || item.enrollmentStatus.includes(q) || roleValue(item).includes(q))
    ).sort((a,b) => Number(a.sid) - Number(b.sid) || Number(a.classNumber) - Number(b.classNumber) || Number(a.number) - Number(b.number));
  }, [contacts, effectiveClass, query, roleFilter, leadershipDraft]);
  const selectedRows = contacts.filter(item => selected.includes(item.sid));
  const toggle = sid => setSelected(prev => prev.includes(sid) ? prev.filter(value=>value!==sid) : [...prev,sid]);
  const copySelectedGuardians = async () => {
    const values = selectedRows.map(item=>formatPhone(item.guardianPhone)).filter(Boolean);
    if (!values.length) return showToast("선택 학생의 보호자 연락처가 없습니다.", "error");
    await copyText(values.join("\n"));
    showToast(`${values.length}개 보호자 연락처를 복사했습니다.`, "success");
  };
  const setRoleValue = (sid, value) => setLeadershipDraft(current => ({ ...current, [sid]: value }));
  const dirtyRoleCount = contacts.filter(item => roleValue(item) !== (item.leadershipRole || "없음")).length;
  const applyRoleToSelected = () => {
    if (!selected.length) return showToast("학급/학생 자치 역할을 적용할 학생을 먼저 선택해주세요.", "error");
    setLeadershipDraft(current => {
      const next = { ...current };
      selected.forEach(sid => { next[sid] = bulkLeadershipRole; });
      return next;
    });
    showToast(`${selected.length}명에게 '${bulkLeadershipRole}' 역할을 화면에 적용했습니다.`, "success");
  };
  const saveRoleDraft = () => {
    try {
      localStorage.setItem(roleDraftKey, JSON.stringify(leadershipDraft));
      showToast(`학급/학생 자치 변경 ${dirtyRoleCount}건을 임시 저장했습니다.`, "success");
    } catch {
      showToast("학급/학생 자치 임시 저장에 실패했습니다.", "error");
    }
  };
  const applyRoleDraft = async () => {
    if (!dirtyRoleCount) return showToast("학교에 반영할 학급/학생 자치 변경사항이 없습니다.", "error");
    const nextContacts = contacts.map(item => normalizeContactItem({ ...item, leadershipRole: roleValue(item) }));
    const ok = await onUpdateData({ ...data, contacts: nextContacts }, `학급/학생 자치 ${dirtyRoleCount}건을 학교 자료에 반영했습니다.`);
    if (ok) {
      try { localStorage.removeItem(roleDraftKey); } catch { /* ignore */ }
      setLeadershipDraft({});
    }
  };
  const printContacts = () => {
    const ok = openPrintDocument({
      title: "2학년 학생 비상연락망",
      subtitle: `${effectiveClass === "전체" ? "전체 학급" : `${effectiveClass}반`} · ${roleFilter === "전체" ? "전체 자치 역할" : (LEADERSHIP_ROLE_FILTERS.find(([value])=>value===roleFilter)?.[1] || roleFilter)} · 조회 ${filtered.length}명`,
      headers: ["반", "번호", "학번", "성명", "학적", "학급/학생 자치", "학생 연락처", "보호자 연락처"],
      columnWidths: ["7%", "7%", "11%", "15%", "9%", "17%", "17%", "17%"],
      rows: filtered.map(item => [
        `${item.classNumber}반`, `${item.number}번`, item.sid, item.name,
        item.enrollmentStatus,
        item.leadershipRole === "없음" ? "-" : item.leadershipRole,
        formatPhone(item.studentPhone) || "미등록",
        formatPhone(item.guardianPhone) || "미등록",
      ]),
    });
    if (!ok) showToast("인쇄 창을 열지 못했습니다. 브라우저의 팝업 차단을 확인해주세요.", "error");
  };
  const emptyRow = () => ({
    sid: "",
    name: "",
    classNumber: lockedClass || (classFilter !== "전체" ? classFilter : ""),
    number: "",
    studentPhone: "",
    guardianPhone: "",
    note: "",
    enrollmentStatus: "전입",
    leadershipRole: "없음",
  });
  const startAdd = () => { setEditingSid("__new__"); setEditRow(emptyRow()); };
  const startEdit = item => { setEditingSid(item.sid); setEditRow({ ...item }); };
  const cancelEdit = () => { setEditingSid(""); setEditRow(null); };
  const saveEdit = async () => {
    const sid = normalizeSid(editRow?.sid);
    if (!sid || !cleanText(editRow?.name)) return showToast("학번과 성명을 확인해주세요.", "error");
    const adding = editingSid === "__new__";
    const duplicate = contacts.some(item => item.sid === sid && (adding || item.sid !== editingSid));
    if (duplicate) return showToast("이미 등록된 학번입니다.", "error");
    const nextContact = normalizeContactItem({
      ...editRow,
      sid,
      name: cleanText(editRow.name),
      classNumber: Number(editRow.classNumber) || Number(sid.slice(1, 3)),
      number: Number(editRow.number) || Number(sid.slice(3, 5)),
      studentPhone: editRow.studentPhone,
      guardianPhone: editRow.guardianPhone,
      note: editRow.note,
      enrollmentStatus: editRow.enrollmentStatus,
      leadershipRole: editRow.leadershipRole,
    });
    const nextContacts = (adding ? [...contacts, nextContact] : contacts.map(item => item.sid === editingSid ? nextContact : item))
      .sort((a,b)=>Number(a.classNumber)-Number(b.classNumber)||Number(a.number)-Number(b.number)||Number(a.sid)-Number(b.sid));
    const ok = await onUpdateData({ ...data, contacts: nextContacts }, adding ? "전입·추가 학생을 등록했습니다." : "학생 비상연락망을 수정했습니다.");
    if (ok) cancelEdit();
  };
  const renderEditorCells = () => <>
    <td><span className="gdt-muted">신규</span></td>
    <td><input className="mini" value={editRow.classNumber ?? ""} onChange={event=>setEditRow({...editRow,classNumber:event.target.value})}/></td>
    <td><input className="mini" value={editRow.number ?? ""} onChange={event=>setEditRow({...editRow,number:event.target.value})}/></td>
    <td><input value={editRow.sid} onChange={event=>setEditRow({...editRow,sid:event.target.value})} placeholder="20101"/></td>
    <td><input value={editRow.name} onChange={event=>setEditRow({...editRow,name:event.target.value})} placeholder="성명"/></td>
    <td><select value={editRow.enrollmentStatus || "재학"} onChange={event=>setEditRow({...editRow,enrollmentStatus:event.target.value})}>{ACADEMIC_STATUS_OPTIONS.map(value=><option key={value}>{value}</option>)}</select></td>
    <td><select value={editRow.leadershipRole || "없음"} onChange={event=>setEditRow({...editRow,leadershipRole:event.target.value})}>{leadershipOptionsFor(editRow.leadershipRole).map(value=><option key={value} value={value}>{leadershipRoleOptionLabel(value)}</option>)}</select></td>
    <td><input value={formatPhone(editRow.studentPhone)} onChange={event=>setEditRow({...editRow,studentPhone:event.target.value})} placeholder="학생 연락처"/></td>
    <td><input value={formatPhone(editRow.guardianPhone)} onChange={event=>setEditRow({...editRow,guardianPhone:event.target.value})} placeholder="보호자 연락처"/></td>
    <td className="gdt-note"><textarea value={editRow.note || ""} onChange={event=>setEditRow({...editRow,note:event.target.value})} placeholder="비고"/></td>
    <td><div className="gdt-edit-actions"><button type="button" onClick={saveEdit}><Save size={12}/>저장</button><button type="button" onClick={cancelEdit}><X size={12}/></button></div></td>
  </>;
  if (!canViewAll && !lockedClass) return <EmptyState title="담임 학급이 지정되지 않았습니다." description="내 정보 수정 또는 관리자 계정관리에서 담당 학급을 먼저 지정해주세요."/>;
  return <div className="gdt-contact-workspace">
    <div className="gdt-section-heading"><div><UserRound size={18}/><span><b>학생 비상연락망</b><small>전입·전출 등 학적과 학급·학생 자치 정보를 함께 관리하고 연락처를 셀별로 복사합니다.</small></span></div><div className="gdt-heading-actions"><button type="button" onClick={startAdd} disabled={Boolean(editingSid)}><UsersRound size={14}/>학생 추가</button><button type="button" onClick={printContacts}><Printer size={14}/>인쇄·PDF</button><a href={IAM_TEACHER_URL} target="_blank" rel="noreferrer"><ExternalLink size={14}/>아이엠티처</a></div></div>
    <div className="gdt-toolbar">
      <div className="gdt-search"><Search size={16}/><span>학생 검색</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="학번·이름·전화번호·학적·자치 역할"/></div>
      {canViewAll && <select value={classFilter} onChange={event=>{setClassFilter(event.target.value);setSelected([])}}><option value="전체">전체 학급</option>{classes.map(value=><option key={value} value={value}>{value}반</option>)}</select>}
      <select className="gdt-role-filter" value={roleFilter} onChange={event=>{setRoleFilter(event.target.value);setSelected([])}} aria-label="학기별 학급·학생 자치 필터">{LEADERSHIP_ROLE_FILTERS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
      <button type="button" className="gdt-secondary" onClick={()=>setSelected(filtered.map(item=>item.sid))}><Check size={14}/>조회 학생 선택</button>
      <button type="button" className="gdt-secondary" onClick={()=>setSelected([])}><X size={14}/>선택 해제</button>
    </div>
    <div className="gdt-contact-actions"><span><b>{filtered.length}명</b> 조회 · <b>{selected.length}명</b> 선택{roleFilter !== "전체" ? <em> · {LEADERSHIP_ROLE_FILTERS.find(([value])=>value===roleFilter)?.[1]}</em> : null}</span><button type="button" onClick={copySelectedGuardians}><Copy size={13}/>선택 보호자 번호 복사</button></div>
    <div className="gdt-role-manager">
      <div><b>학급/학생 자치 일괄 설정</b><small>행에서 직접 바꾸거나 선택 학생에게 같은 자치 역할을 적용한 뒤 임시 저장·학교 반영합니다.</small></div>
      <select value={bulkLeadershipRole} onChange={event=>setBulkLeadershipRole(event.target.value)}>{LEADERSHIP_ROLE_OPTIONS.map(value=><option key={value} value={value}>{leadershipRoleOptionLabel(value)}</option>)}</select>
      <button type="button" className="secondary" onClick={applyRoleToSelected}><Check size={13}/>선택 학생에 적용</button>
      <button type="button" className="secondary" onClick={saveRoleDraft} disabled={!dirtyRoleCount}><Save size={13}/>임시 저장 {dirtyRoleCount ? `(${dirtyRoleCount})` : ""}</button>
      <button type="button" className="primary" onClick={applyRoleDraft} disabled={!dirtyRoleCount}><CheckCircle2 size={13}/>학교 자료 반영</button>
    </div>
    <div className="gdt-table-wrap"><table className="gdt-table contacts"><thead><tr><th>선택</th><th>반</th><th>번호</th><th>학번</th><th>성명</th><th>학적</th><th>학급/학생 자치</th><th>학생 연락처</th><th>보호자 연락처</th><th>비고</th><th>수정</th></tr></thead><tbody>
      {editingSid === "__new__" && editRow && <tr className="editing add-row">{renderEditorCells()}</tr>}
      {filtered.map(item => {
        const editing = editingSid === item.sid && editRow;
        return <tr key={item.sid} className={editing ? "editing" : ""}>
          {editing ? <>
            <td><input type="checkbox" checked={selected.includes(item.sid)} onChange={()=>toggle(item.sid)}/></td>
            <td><input className="mini" value={editRow.classNumber ?? ""} onChange={event=>setEditRow({...editRow,classNumber:event.target.value})}/></td>
            <td><input className="mini" value={editRow.number ?? ""} onChange={event=>setEditRow({...editRow,number:event.target.value})}/></td>
            <td><input value={editRow.sid} onChange={event=>setEditRow({...editRow,sid:event.target.value})}/></td>
            <td><input value={editRow.name} onChange={event=>setEditRow({...editRow,name:event.target.value})}/></td>
            <td><select value={editRow.enrollmentStatus || "재학"} onChange={event=>setEditRow({...editRow,enrollmentStatus:event.target.value})}>{ACADEMIC_STATUS_OPTIONS.map(value=><option key={value}>{value}</option>)}</select></td>
            <td><select value={editRow.leadershipRole || "없음"} onChange={event=>setEditRow({...editRow,leadershipRole:event.target.value})}>{leadershipOptionsFor(editRow.leadershipRole).map(value=><option key={value} value={value}>{leadershipRoleOptionLabel(value)}</option>)}</select></td>
            <td><input value={formatPhone(editRow.studentPhone)} onChange={event=>setEditRow({...editRow,studentPhone:event.target.value})}/></td>
            <td><input value={formatPhone(editRow.guardianPhone)} onChange={event=>setEditRow({...editRow,guardianPhone:event.target.value})}/></td>
            <td className="gdt-note"><textarea value={editRow.note || ""} onChange={event=>setEditRow({...editRow,note:event.target.value})}/></td>
            <td><div className="gdt-edit-actions"><button type="button" onClick={saveEdit}><Save size={12}/>저장</button><button type="button" onClick={cancelEdit}><X size={12}/></button></div></td>
          </> : <>
            <td><input type="checkbox" checked={selected.includes(item.sid)} onChange={()=>toggle(item.sid)}/></td>
            <td><b>{item.classNumber}반</b></td><td><b>{item.number}번</b></td><td>{item.sid}</td><td><strong>{item.name}</strong></td>
            <td><span className={`gdt-academic-status ${item.enrollmentStatus}`}>{item.enrollmentStatus}</span></td>
            <td><select className={`gdt-role-select ${leadershipRoleTone(roleValue(item))}`} value={roleValue(item)} onChange={event=>setRoleValue(item.sid,event.target.value)}>{leadershipOptionsFor(roleValue(item)).map(value=><option key={value} value={value}>{leadershipRoleOptionLabel(value)}</option>)}</select></td>
            <td><ContactCell value={item.studentPhone} label="학생" showToast={showToast}/></td>
            <td><ContactCell value={item.guardianPhone} label="보호자" showToast={showToast}/></td>
            <td className="gdt-note">{item.note || "-"}</td>
            <td><button type="button" className="gdt-icon-button" onClick={()=>startEdit(item)} disabled={Boolean(editingSid)}><Pencil size={13}/></button></td>
          </>}
        </tr>;
      })}
    </tbody></table></div>
  </div>;
}

function ContactCell({ value, label, showToast }) {
  const formatted = formatPhone(value);
  if (!formatted) return <span className="gdt-muted">미등록</span>;
  return <div className="gdt-contact-cell"><span>{formatted}</span><button type="button" title={`${label} 연락처 복사`} onClick={async()=>{await copyText(formatted);showToast(`${label} 연락처를 복사했습니다.`,"success")}}><Copy size={11}/></button></div>;
}

function RecordsWorkspace({ data, showToast, canManage, onUpdateData }) {
  const activities = data?.records?.activities || [];
  const activityLinks = data?.records?.activityLinks || [];
  const assignments = data?.records?.assignments || [];
  const contacts = useMemo(
    () => (data?.contacts || []).map(normalizeContactItem).filter(item => item.sid && item.name),
    [data?.contacts],
  );
  const contactBySid = useMemo(() => new Map(contacts.map(item => [item.sid, item])), [contacts]);
  const reflections = useMemo(() => {
    const deduped = new Map();
    (data?.records?.reflections || []).map(normalizeReflectionItem).forEach(item => {
      if (!item.sid || !item.activity) return;
      const roster = contactBySid.get(item.sid);
      const normalized = {
        ...item,
        name: roster?.name || item.name,
        classNumber: roster?.classNumber || item.classNumber,
        number: roster?.number || item.number,
      };
      const key = `${normalized.activity}::${normalized.sid}`;
      const previous = deduped.get(key);
      if (!previous || normalized.response.length >= previous.response.length) deduped.set(key, normalized);
    });
    return Array.from(deduped.values());
  }, [data?.records?.reflections, contactBySid]);
  const [tab, setTab] = useState("activities");
  const [category, setCategory] = useState("전체");
  const [activityQuery, setActivityQuery] = useState("");
  const [query, setQuery] = useState("");
  const [reflectionQuery, setReflectionQuery] = useState("");
  const [classFilter, setClassFilter] = useState("전체");
  const [reflectionActivity, setReflectionActivity] = useState("전체");
  const [reflectionStatus, setReflectionStatus] = useState("전체");
  const [editingLinkId, setEditingLinkId] = useState("");
  const [linkDraft, setLinkDraft] = useState(null);
  const [editingActivityId, setEditingActivityId] = useState("");
  const [activityLinkDraft, setActivityLinkDraft] = useState(null);
  const categories = useMemo(()=>Array.from(new Set(activities.map(item=>item.category))),[activities]);
  const classes = useMemo(()=>Array.from(new Set([
    ...contacts.map(item=>String(item.classNumber)),
    ...assignments.map(item=>String(item.classNumber)),
    ...reflections.map(item=>String(item.classNumber)),
  ].filter(value => value && value !== "null"))).sort((a,b)=>Number(a)-Number(b)),[contacts,assignments,reflections]);
  const reflectionActivities = useMemo(()=>Array.from(new Set(reflections.map(item=>item.activity))).filter(Boolean).sort(),[reflections]);
  const filteredActivities = activities.filter(item=>(category==="전체"||item.category===category)&&(!activityQuery.trim()||item.record.includes(activityQuery.trim())));
  const filteredAssignments = assignments.filter(item=>(classFilter==="전체"||String(item.classNumber)===classFilter)&&(!query.trim()||item.sid.includes(query.trim())||item.name.includes(query.trim())));

  const reflectionRows = useMemo(() => {
    const q = reflectionQuery.trim().toLowerCase();
    const selectedClass = classFilter === "전체" ? null : Number(classFilter);
    const selectedActivities = reflectionActivity === "전체" ? reflectionActivities : [reflectionActivity];
    const activityMeta = new Map();
    reflections.forEach(item => {
      const previous = activityMeta.get(item.activity);
      if (!previous || (!previous.date && item.date)) activityMeta.set(item.activity, { date: item.date || "" });
    });
    const submittedByKey = new Map(reflections.map(item => [`${item.activity}::${item.sid}`, item]));
    const activeContacts = contacts.filter(item => !["전출", "자퇴"].includes(item.enrollmentStatus));
    const fallbackStudents = Array.from(new Map(reflections.map(item => [item.sid, { sid:item.sid, name:item.name, classNumber:item.classNumber, number:item.number, enrollmentStatus:"재학" }])).values());
    const students = activeContacts.length ? activeContacts : fallbackStudents;
    const rows = [];
    selectedActivities.forEach(activity => {
      students.forEach(student => {
        const submitted = submittedByKey.get(`${activity}::${student.sid}`);
        rows.push(submitted ? { ...submitted, submitted: true } : {
          id: `missing-${activity}-${student.sid}`,
          activity,
          date: activityMeta.get(activity)?.date || "",
          classNumber: student.classNumber,
          number: student.number,
          sid: student.sid,
          name: student.name,
          response: "",
          submitted: false,
        });
      });
    });
    return rows.filter(item => {
      const matchesClass = selectedClass == null || Number(item.classNumber) === selectedClass;
      const matchesQuery = !q || item.sid.includes(q) || item.name.toLowerCase().includes(q) || item.activity.toLowerCase().includes(q) || item.response.toLowerCase().includes(q);
      const matchesStatus = reflectionStatus === "전체" || (reflectionStatus === "제출" ? item.submitted : !item.submitted);
      return matchesClass && matchesQuery && matchesStatus;
    }).sort((a,b)=>Number(a.classNumber)-Number(b.classNumber)||Number(a.number)-Number(b.number)||a.activity.localeCompare(b.activity,"ko"));
  }, [reflections, contacts, reflectionActivities, reflectionActivity, reflectionStatus, classFilter, reflectionQuery]);

  const startLinkEdit = item => { setEditingLinkId(item.id); setLinkDraft({ ...item }); };
  const saveLinkEdit = async () => {
    const nextLinks = activityLinks.map(item => item.id === editingLinkId ? { ...linkDraft, title: cleanText(linkDraft.title), formUrl: cleanText(linkDraft.formUrl), responseUrl: cleanText(linkDraft.responseUrl) } : item);
    const ok = await onUpdateData({ ...data, records: { ...(data.records || {}), activityLinks: nextLinks } }, "진로활동 링크를 수정했습니다.");
    if (ok) { setEditingLinkId(""); setLinkDraft(null); }
  };

  const startActivityLinkEdit = item => {
    setEditingActivityId(item.id);
    setActivityLinkDraft({ id: item.id, record: item.record, formUrl: item.formUrl || "", responseUrl: item.responseUrl || "" });
  };
  const saveActivityLinkEdit = async () => {
    if (!activityLinkDraft || !editingActivityId) return;
    const nextActivities = activities.map(item => item.id === editingActivityId ? {
      ...item,
      formUrl: cleanText(activityLinkDraft.formUrl),
      responseUrl: cleanText(activityLinkDraft.responseUrl),
    } : item);
    const ok = await onUpdateData({ ...data, records: { ...(data.records || {}), activities: nextActivities } }, "활동의 학생용 폼·응답시트 링크를 수정했습니다.");
    if (ok) { setEditingActivityId(""); setActivityLinkDraft(null); }
  };

  const printReflections = () => {
    const activityLabel = reflectionActivity === "전체" ? "전체 활동" : reflectionActivity;
    const classLabel = classFilter === "전체" ? "전체 학급" : `${classFilter}반`;
    const statusLabel = reflectionStatus === "전체" ? "제출·미제출 전체" : reflectionStatus;
    const ok = openPrintDocument({
      title: "2학년 학생 활동 소감문",
      subtitle: `${classLabel} · ${activityLabel} · ${statusLabel} · ${reflectionRows.length}건`,
      headers: ["반", "번호", "학번", "성명", "활동·일자", "상태", "소감문"],
      columnWidths: ["5%", "5%", "8%", "9%", "15%", "7%", "51%"],
      rows: reflectionRows.map(item => [
        `${item.classNumber}반`, `${item.number}번`, item.sid, item.name,
        { html: `<b>${escapeHtml(item.activity)}</b>${item.date ? `<br><small>${escapeHtml(item.date)}</small>` : ""}` },
        { html: `<span class="status ${item.submitted ? "submitted" : "missing"}">${item.submitted ? "제출" : "미제출"}</span>` },
        { value: item.submitted ? item.response : "소감문 미제출", className: "text" },
      ]),
    });
    if (!ok) showToast("인쇄 창을 열지 못했습니다. 브라우저의 팝업 차단을 확인해주세요.", "error");
  };

  return <div className="gdt-records-workspace">
    <div className="gdt-record-metrics">
      <div className="activities"><span className="metric-icon"><CalendarDays/></span><span className="metric-copy"><small>생기부 활동</small><b>활동 일정</b><em>진로·자율·자치 누가기록</em></span><strong>{activities.length}<small>건</small></strong></div>
      <div className="reflections"><span className="metric-icon"><MessageSquareText/></span><span className="metric-copy"><small>학생 응답</small><b>학생 소감문</b><em>활동별 제출 내용 통합</em></span><strong>{reflections.length}<small>건</small></strong></div>
      <div className="assignments"><span className="metric-icon"><UsersRound/></span><span className="metric-copy"><small>학생 활동</small><b>학생별 배정</b><em>동아리·봉사·프로젝트</em></span><strong>{assignments.length}<small>명</small></strong></div>
    </div>
    <div className="gdt-subtabs"><button type="button" className={tab==="activities"?"active":""} onClick={()=>setTab("activities")}><CalendarDays size={15}/>활동·누가기록</button><button type="button" className={tab==="reflections"?"active":""} onClick={()=>setTab("reflections")}><MessageSquareText size={15}/>학생 소감문</button><button type="button" className={tab==="assignments"?"active":""} onClick={()=>setTab("assignments")}><GraduationCap size={15}/>학생별 활동 배정</button><button type="button" className={tab==="guide"?"active":""} onClick={()=>setTab("guide")}><ListChecks size={15}/>활용 안내</button></div>
    {tab === "activities" && <>
      <div className="gdt-toolbar"><select value={category} onChange={event=>setCategory(event.target.value)}><option value="전체">전체 영역</option>{categories.map(value=><option key={value}>{value}</option>)}</select><div className="gdt-search"><Search size={16}/><span>누가기록 검색</span><input value={activityQuery} onChange={event=>setActivityQuery(event.target.value)} placeholder="활동명 입력"/></div></div>
      <div className="gdt-table-wrap"><table className="gdt-table activities"><thead><tr><th>영역</th><th>일자</th><th>교시</th><th>이수시간</th><th>누가기록</th><th>학생용 폼</th><th>응답시트</th><th>링크 관리</th><th>복사</th></tr></thead><tbody>{filteredActivities.map(item=><tr key={item.id}><td><span className="gdt-type-pill">{item.category}</span></td><td>{item.date||"-"}</td><td>{item.period ? `${item.period}교시` : "-"}</td><td><b>{item.hours ? `${item.hours}시간` : "-"}</b></td><td className="record"><strong>{item.record}</strong></td><td>{item.formUrl?<a className="gdt-link-button" href={item.formUrl} target="_blank" rel="noreferrer"><ExternalLink size={12}/>열기</a>:<span className="gdt-unregistered">미등록</span>}</td><td>{item.responseUrl?<a className="gdt-link-button response" href={item.responseUrl} target="_blank" rel="noreferrer"><ExternalLink size={12}/>확인</a>:<span className="gdt-unregistered">미등록</span>}</td><td>{canManage?<button type="button" className="gdt-mini-action" onClick={()=>startActivityLinkEdit(item)}><Pencil size={12}/>{item.formUrl||item.responseUrl?"수정":"등록"}</button>:<span className="gdt-muted">-</span>}</td><td><button type="button" className="gdt-copy-button" title="누가기록 복사" onClick={async()=>{await copyText(item.record);showToast("누가기록을 복사했습니다.","success")}}><Copy size={12}/></button></td></tr>)}</tbody></table></div>
      {editingActivityId && activityLinkDraft && <div className="gdt-activity-link-editor"><div><Link2 size={16}/><span><b>활동 링크 {activityLinkDraft.formUrl || activityLinkDraft.responseUrl ? "수정" : "등록"}</b><small>{activityLinkDraft.record}</small></span></div><label>학생용 폼<input value={activityLinkDraft.formUrl} onChange={event=>setActivityLinkDraft({...activityLinkDraft,formUrl:event.target.value})} placeholder="https://"/></label><label>응답시트<input value={activityLinkDraft.responseUrl} onChange={event=>setActivityLinkDraft({...activityLinkDraft,responseUrl:event.target.value})} placeholder="https://"/></label><div className="gdt-edit-actions"><button type="button" onClick={saveActivityLinkEdit}><Save size={13}/>저장</button><button type="button" onClick={()=>{setEditingActivityId("");setActivityLinkDraft(null)}}><X size={13}/>취소</button></div></div>}
      {activityLinks.length > 0 && <div className="gdt-link-manager"><div className="gdt-section-heading compact"><div><Link2 size={17}/><span><b>진로활동 폼·응답시트</b><small>응답시트 링크가 별도 셀에 있는 항목을 관리합니다.</small></span></div></div>{activityLinks.map(item => {
        const editing = editingLinkId === item.id && linkDraft;
        return <article key={item.id}>{editing ? <><input value={linkDraft.title} onChange={event=>setLinkDraft({...linkDraft,title:event.target.value})}/><label>학생용 폼<input value={linkDraft.formUrl||""} onChange={event=>setLinkDraft({...linkDraft,formUrl:event.target.value})} placeholder="https://"/></label><label>응답시트<input value={linkDraft.responseUrl||""} onChange={event=>setLinkDraft({...linkDraft,responseUrl:event.target.value})} placeholder="https://"/></label><div><button type="button" onClick={saveLinkEdit}><Save size={13}/>저장</button><button type="button" onClick={()=>{setEditingLinkId("");setLinkDraft(null)}}><X size={13}/>취소</button></div></> : <><strong>{item.title}</strong><span>{item.formUrl?<a href={item.formUrl} target="_blank" rel="noreferrer"><ExternalLink size={12}/>학생용 폼</a>:<em>학생용 폼 미등록</em>}</span><span>{item.responseUrl?<a href={item.responseUrl} target="_blank" rel="noreferrer"><ExternalLink size={12}/>응답시트</a>:<em>응답시트 미등록</em>}</span>{canManage&&<button type="button" onClick={()=>startLinkEdit(item)}><Pencil size={13}/>수정</button>}</>}</article>;
      })}</div>}
    </>}
    {tab === "reflections" && <>
      <div className="gdt-toolbar reflection-filters"><div className="gdt-search"><Search size={16}/><span>학생·소감 검색</span><input value={reflectionQuery} onChange={event=>setReflectionQuery(event.target.value)} placeholder="학번·이름·소감문"/></div><select value={classFilter} onChange={event=>setClassFilter(event.target.value)}><option value="전체">전체 학급</option>{classes.map(value=><option key={value} value={value}>{value}반</option>)}</select><select value={reflectionActivity} onChange={event=>setReflectionActivity(event.target.value)}><option value="전체">전체 활동</option>{reflectionActivities.map(value=><option key={value}>{value}</option>)}</select><select value={reflectionStatus} onChange={event=>setReflectionStatus(event.target.value)}><option value="전체">제출·미제출 전체</option><option value="제출">제출</option><option value="미제출">미제출</option></select><button type="button" className="gdt-secondary" onClick={printReflections}><Printer size={14}/>인쇄·PDF</button></div>
      <div className="gdt-reflection-summary"><span className="total"><b>{reflectionRows.length}</b><small>조회</small></span><span className="submitted"><CheckCircle2 size={14}/><b>{reflectionRows.filter(item=>item.submitted).length}</b><small>제출</small></span><span className="missing"><CircleDashed size={14}/><b>{reflectionRows.filter(item=>!item.submitted).length}</b><small>미제출</small></span></div>
      <div className="gdt-table-wrap reflection-wrap"><table className="gdt-table reflections"><thead><tr><th>반</th><th>번호</th><th>학번</th><th>성명</th><th>활동</th><th>상태</th><th>소감문</th><th>복사</th></tr></thead><tbody>{reflectionRows.map(item=><tr key={item.id}><td>{item.classNumber}반</td><td>{item.number}번</td><td>{item.sid}</td><td><b>{item.name}</b></td><td><strong>{item.activity}</strong>{item.date&&<small>{item.date}</small>}</td><td>{item.submitted?<span className="status submitted"><CheckCircle2 size={11}/>제출</span>:<span className="status missing"><CircleDashed size={11}/>미제출</span>}</td><td className="reflection-text">{item.submitted?<details><summary>{item.response.slice(0,110)}{item.response.length>110?"…":""}</summary><p>{item.response}</p></details>:<span className="gdt-muted">소감문 미제출</span>}</td><td>{item.submitted&&<button type="button" className="gdt-copy-button" title="소감문 복사" onClick={async()=>{await copyText(item.response);showToast("학생 소감문을 복사했습니다.","success")}}><Copy size={12}/></button>}</td></tr>)}</tbody></table></div>
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
    {view === "gradeData" ? <DataManagementWorkspace appliedData={appliedData} draft={draft} setDraft={setDraft} canManage={canManage} actor={actor} persist={persist} db={db} showToast={showToast} draftKey={draftKey}/> : !appliedData ? <EmptyState title="2학년부 자료가 아직 학교에 반영되지 않았습니다." description={canManage ? "자료 관리 탭에서 2학년부 업무 파일을 불러온 뒤 '학교 자료에 반영'을 눌러주세요." : "2학년부장 또는 관리자가 자료를 먼저 반영해야 합니다."}/> : view === "contacts" ? <ContactWorkspace data={appliedData} accessRole={accessRole} homeroomClass={homeroomClass} showToast={showToast} onUpdateData={updateAppliedData} actor={actor}/> : <RecordsWorkspace data={appliedData} showToast={showToast} canManage={canManage} onUpdateData={updateAppliedData}/>} 
  </section>;
}

const GRADE_DEPARTMENT_CSS = `
.grade-department-tools{font-family:${FONT};color:#273b55;display:grid;gap:14px}.grade-department-tools *{box-sizing:border-box}.gdt-empty{min-height:280px;display:grid;place-items:center;align-content:center;gap:8px;border:1px dashed #cbd8e6;border-radius:16px;background:#fafcff;color:#7b899b;text-align:center;padding:24px}.gdt-empty b{font-size:14px;color:#52657c}.gdt-empty span{font-size:11px;line-height:1.55;max-width:640px}.gdt-section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid #d6e1ec;border-radius:13px;background:linear-gradient(135deg,#f7fbff,#fbfcff)}.gdt-section-heading>div:first-child{display:flex;align-items:center;gap:9px}.gdt-section-heading span{display:grid;gap:3px}.gdt-section-heading b{font-size:13px}.gdt-section-heading small{font-size:10px;color:#738397}.gdt-heading-actions{display:flex!important;align-items:center;gap:7px}.gdt-heading-actions>a,.gdt-heading-actions>button{display:inline-flex;align-items:center;gap:5px;padding:7px 9px;border:1px solid #cbd8e5;border-radius:8px;background:#fff;color:#426991;text-decoration:none;font:850 10px ${FONT};cursor:pointer;white-space:nowrap}.gdt-section-heading.compact{padding:0;border:0;background:none}.gdt-toolbar{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.gdt-search{flex:1 1 330px;min-width:240px;display:grid;grid-template-columns:auto auto minmax(0,1fr);align-items:center;gap:8px;border:1px solid #ccd8e6;border-radius:11px;background:#fff;padding:5px 7px 5px 10px}.gdt-search>span{font-size:10.5px;font-weight:900;color:#60738a;padding-right:8px;border-right:1px solid #e2e8ef}.gdt-search input{min-width:0;border:0;outline:0;padding:6px 8px;font:750 11px ${FONT};color:#2c4058}.gdt-toolbar select{min-height:39px;border:1px solid #ccd8e6;border-radius:10px;background:#fff;padding:7px 30px 7px 10px;color:#435970;font:850 11px ${FONT}}.gdt-toolbar .gdt-role-filter{min-width:190px;background:#fbfcff;color:#3f5872}.gdt-secondary,.gdt-contact-actions button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid #bfcfe1;border-radius:9px;padding:8px 10px;background:#fff;color:#35628f;font:800 11px ${FONT};cursor:pointer;white-space:nowrap}.gdt-contact-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 11px;border-radius:11px;background:#f3f7fb;color:#6b7b8e;font-size:10.5px}.gdt-contact-actions em{font-style:normal;color:#3b6692;font-weight:900}.gdt-table-wrap{overflow:auto;border:1px solid #d6e0eb;border-radius:13px;background:#fff;max-width:100%}.gdt-table{width:100%;min-width:900px;border-collapse:separate;border-spacing:0;table-layout:fixed}.gdt-table th{position:sticky;top:0;z-index:1;background:#edf4fb;color:#435b74;padding:10px 7px;border-right:1px solid #d6e0ea;border-bottom:1px solid #c8d6e5;font-size:10px;font-weight:950;text-align:center}.gdt-table td{padding:9px 7px;border-right:1px solid #e0e7ef;border-bottom:1px solid #e0e7ef;font-size:10.5px;text-align:center;vertical-align:middle;overflow-wrap:anywhere}.gdt-table tr:last-child td{border-bottom:0}.gdt-table th:last-child,.gdt-table td:last-child{border-right:0}.gdt-table tr.editing td{background:#fffaf0}.gdt-table input,.gdt-table textarea,.gdt-table select,.gdt-link-manager input,.gdt-activity-link-editor input{width:100%;min-width:0;border:1px solid #cbd8e5;border-radius:7px;padding:6px 7px;font:750 10px ${FONT};color:#30465f;background:#fff}.gdt-table input.mini{max-width:52px;text-align:center}.gdt-table textarea{min-height:52px;resize:vertical}.gdt-table td small,.gdt-table.assignments td small{display:block;margin-top:3px;color:#8190a2;font-size:9px;line-height:1.35}.gdt-table .gdt-note{text-align:center;white-space:normal;word-break:break-word;line-height:1.45}.gdt-muted{color:#9aa5b2}.gdt-unregistered{display:inline-block;color:#9aa5b2;font-size:9px}.gdt-icon-button,.gdt-copy-button{display:inline-grid;place-items:center;border:1px solid #cdd9e6;background:#fff;color:#356493;cursor:pointer}.gdt-icon-button{width:28px;height:28px;border-radius:8px}.gdt-copy-button{width:24px;height:24px;border-radius:7px}.gdt-mini-action{display:inline-flex;align-items:center;justify-content:center;gap:3px;padding:5px 6px;border:1px solid #c8d7e6;border-radius:7px;background:#fff;color:#426b94;font:850 9px ${FONT};cursor:pointer;white-space:nowrap}.gdt-edit-actions{display:flex;gap:4px;justify-content:center}.gdt-edit-actions button{display:inline-flex;align-items:center;gap:3px;border:1px solid #cad7e5;border-radius:7px;background:#fff;color:#356493;padding:5px;font:800 9px ${FONT}}.gdt-table.contacts{min-width:950px;table-layout:fixed}.gdt-table.contacts th:nth-child(1){width:34px}.gdt-table.contacts th:nth-child(2),.gdt-table.contacts th:nth-child(3){width:39px}.gdt-table.contacts th:nth-child(4){width:60px}.gdt-table.contacts th:nth-child(5){width:112px}.gdt-table.contacts th:nth-child(6){width:54px}.gdt-table.contacts th:nth-child(7){width:128px}.gdt-table.contacts th:nth-child(8),.gdt-table.contacts th:nth-child(9){width:116px}.gdt-table.contacts th:nth-child(10){width:105px}.gdt-table.contacts th:nth-child(11){width:42px}.gdt-table.contacts td{padding:7px 5px}.gdt-table.contacts td:nth-child(5){font-size:11px}.gdt-table.contacts .gdt-note{font-size:9.4px;text-align:center;white-space:normal;word-break:break-word;overflow-wrap:anywhere;line-height:1.42;padding-left:6px;padding-right:6px}.gdt-contact-cell{display:flex;align-items:center;justify-content:center;gap:4px}.gdt-contact-cell span{white-space:nowrap}.gdt-contact-cell button{display:grid;place-items:center;width:19px;height:19px;border:1px solid #d2dce8;border-radius:5px;background:#fff;color:#47709a;cursor:pointer;flex:0 0 auto}.gdt-academic-status,.gdt-role-pill{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:4px 7px;font-size:9px;font-weight:900;white-space:nowrap}.gdt-academic-status{background:#eef4fa;color:#486782}.gdt-academic-status.전입{background:#e9f6ee;color:#27704c}.gdt-academic-status.전출,.gdt-academic-status.자퇴{background:#fff0ed;color:#aa493f}.gdt-role-pill{background:#fff6df;color:#886414;border:1px solid #eedca8}.gdt-table.contacts tr.add-row td{background:#f5f9fe}.gdt-role-select{width:100%;min-width:0;white-space:normal;border:1px solid #d5dfeb;border-radius:8px;background:#f7f9fc;color:#627389;padding:6px 5px;font:900 9.1px ${FONT};text-align:center}.gdt-role-select.class-chair{background:#fff4e7;border-color:#edc38c;color:#9a5817}.gdt-role-select.class-vice{background:#eef4ff;border-color:#b8cceb;color:#315f9a}.gdt-role-select.student-chair{background:#f4edff;border-color:#d3bce9;color:#714597}.gdt-role-select.student-vice{background:#eaf8f5;border-color:#b9ddd4;color:#277366}.gdt-role-select.none{background:#f6f8fa;color:#7d8997}.gdt-role-manager{display:grid;grid-template-columns:minmax(210px,1fr) minmax(150px,.55fr) auto auto auto;gap:8px;align-items:center;padding:10px 11px;border:1px solid #d8e2ed;border-radius:12px;background:linear-gradient(135deg,#fffaf0,#fbfcff)}.gdt-role-manager>div{display:grid;gap:2px}.gdt-role-manager b{font-size:11.5px;color:#3c5169}.gdt-role-manager small{font-size:9.4px;color:#78889a;line-height:1.4}.gdt-role-manager select{min-height:36px;border:1px solid #ccd8e6;border-radius:9px;background:#fff;padding:7px 28px 7px 9px;color:#4d6076;font:850 10px ${FONT}}.gdt-role-manager button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:36px;border-radius:9px;padding:7px 9px;font:850 9.7px ${FONT};cursor:pointer;white-space:nowrap}.gdt-role-manager button.secondary{border:1px solid #c8d6e5;background:#fff;color:#466b91}.gdt-role-manager button.primary{border:1px solid #3c6d9e;background:#3c6d9e;color:#fff}.gdt-role-manager button:disabled{opacity:.42;cursor:not-allowed}.gdt-heading-actions button:disabled,.gdt-icon-button:disabled{opacity:.45;cursor:not-allowed}.gdt-record-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.gdt-record-metrics>div{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:14px 15px;border:1px solid #d7e1eb;border-radius:14px;background:linear-gradient(135deg,#fff,#f8fbff);box-shadow:0 6px 18px rgba(41,67,96,.055);overflow:hidden}.gdt-record-metrics>div::before{content:"";position:absolute;inset:0 auto 0 0;width:4px;background:#4f79a5}.gdt-record-metrics>div.reflections::before{background:#7b66ad}.gdt-record-metrics>div.assignments::before{background:#3d8a71}.gdt-record-metrics .metric-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:11px;background:#eaf2fb;color:#3f6f9f}.gdt-record-metrics .reflections .metric-icon{background:#f1ecfb;color:#765fa7}.gdt-record-metrics .assignments .metric-icon{background:#e9f5f0;color:#34795f}.gdt-record-metrics .metric-icon svg{width:20px;height:20px}.gdt-record-metrics .metric-copy{display:grid;gap:2px;min-width:0}.gdt-record-metrics .metric-copy small{font-size:8.5px;letter-spacing:.02em;color:#8492a3;font-weight:850}.gdt-record-metrics .metric-copy b{font-size:13px;line-height:1.2;color:#2d435d}.gdt-record-metrics .metric-copy em{font-size:9px;line-height:1.35;color:#748499;font-style:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gdt-record-metrics>div>strong{display:flex;align-items:baseline;gap:2px;font-size:22px;line-height:1;color:#254a73;font-weight:950;letter-spacing:-.03em}.gdt-record-metrics>div>strong small{font-size:10px;color:#718297;font-weight:900}.gdt-subtabs{display:flex;gap:7px;flex-wrap:wrap}.gdt-subtabs button{display:inline-flex;align-items:center;gap:6px;border:1px solid #d1dce8;border-radius:9px;padding:8px 11px;background:#fff;color:#68778a;font:850 11px ${FONT};cursor:pointer}.gdt-subtabs button.active{background:#3d6998;color:#fff;border-color:#3d6998}.gdt-table.activities{min-width:980px}.gdt-table.activities th:nth-child(1){width:76px}.gdt-table.activities th:nth-child(2){width:70px}.gdt-table.activities th:nth-child(3){width:56px}.gdt-table.activities th:nth-child(4){width:66px}.gdt-table.activities th:nth-child(5){width:auto}.gdt-table.activities th:nth-child(6),.gdt-table.activities th:nth-child(7){width:78px}.gdt-table.activities th:nth-child(8){width:70px}.gdt-table.activities th:nth-child(9){width:45px}.gdt-table.activities td.record{text-align:center;line-height:1.55;word-break:keep-all}.gdt-type-pill{display:inline-block;padding:4px 7px;border-radius:999px;background:#eaf2fb;color:#38658f;font-size:9px;font-weight:900;white-space:nowrap}.gdt-link-button{display:inline-flex;align-items:center;gap:4px;padding:5px 7px;border:1px solid #bfd0e2;border-radius:7px;color:#356493;text-decoration:none;font-size:9px;font-weight:900}.gdt-link-button.response{color:#3d765f;border-color:#bfdccb}.gdt-activity-link-editor{display:grid;grid-template-columns:minmax(180px,1.2fr) minmax(180px,1fr) minmax(180px,1fr) auto;gap:9px;align-items:end;padding:12px;border:1px solid #cfddea;border-radius:12px;background:#f8fbff}.gdt-activity-link-editor>div:first-child{display:flex;align-items:flex-start;gap:8px;min-width:0}.gdt-activity-link-editor>div:first-child span{display:grid;gap:3px;min-width:0}.gdt-activity-link-editor b{font-size:11px}.gdt-activity-link-editor small{font-size:9px;color:#738397;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gdt-activity-link-editor label{display:grid;gap:4px;color:#6d7e91;font-size:9px;font-weight:850}.gdt-link-manager{display:grid;gap:8px;padding:13px;border:1px solid #d8e2ed;border-radius:13px;background:#fafcff}.gdt-link-manager article{display:grid;grid-template-columns:minmax(160px,1.2fr) minmax(130px,.8fr) minmax(130px,.8fr) auto;gap:8px;align-items:center;padding:9px 10px;border:1px solid #e0e7ef;border-radius:10px;background:#fff}.gdt-link-manager article>a,.gdt-link-manager article span a{display:inline-flex;align-items:center;gap:4px;color:#416b94;text-decoration:none;font-size:10px;font-weight:850}.gdt-link-manager article em{font-size:9.5px;color:#9aa5b2}.gdt-link-manager article>button,.gdt-link-manager article>div button{display:inline-flex;align-items:center;gap:4px;border:1px solid #cad7e4;border-radius:7px;background:#fff;padding:6px 8px;color:#426991;font:850 9.5px ${FONT}}.gdt-link-manager article label{display:grid;gap:3px;font-size:9px;color:#748397}.reflection-wrap{overflow-x:hidden}.gdt-table.reflections{min-width:0;width:100%}.gdt-table.reflections th:nth-child(1),.gdt-table.reflections th:nth-child(2){width:5%}.gdt-table.reflections th:nth-child(3){width:8%}.gdt-table.reflections th:nth-child(4){width:9%}.gdt-table.reflections th:nth-child(5){width:13%}.gdt-table.reflections th:nth-child(6){width:9%}.gdt-table.reflections th:nth-child(7){width:auto}.gdt-table.reflections th:nth-child(8){width:44px}.gdt-table.reflections td.reflection-text{text-align:left;line-height:1.58;white-space:normal;word-break:break-word;overflow-wrap:anywhere}.gdt-table.reflections details{max-width:100%}.gdt-table.reflections details summary{cursor:pointer;color:#435a72;font-weight:780;white-space:normal;word-break:break-word;overflow-wrap:anywhere;line-height:1.55}.gdt-table.reflections details p{white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;margin:8px 0 0;padding:9px;border-radius:8px;background:#f7f9fc;color:#42566d;max-width:100%}.status{display:inline-flex;align-items:center;justify-content:center;gap:3px;padding:5px 8px;border-radius:999px;font-size:9.5px;font-weight:950;white-space:nowrap;border:1px solid transparent}.status.submitted{background:#e7f6ed;color:#25734d;border-color:#cbe8d6}.status.missing{background:#fff0ed;color:#aa493f;border-color:#f2d0ca}.gdt-reflection-summary{display:flex;align-items:stretch;gap:7px;flex-wrap:wrap;padding:0;background:transparent}.gdt-reflection-summary span{display:grid;grid-template-columns:auto auto;align-items:center;justify-content:start;gap:2px 5px;min-width:92px;padding:8px 10px;border:1px solid #d8e2ed;border-radius:10px;background:#f7f9fc;color:#64768b}.gdt-reflection-summary span svg{grid-row:1/3}.gdt-reflection-summary span b{font-size:14px;line-height:1}.gdt-reflection-summary span small{font-size:9px;font-weight:850}.gdt-reflection-summary .submitted{background:#f0faf4;border-color:#cee8d8;color:#2c7752}.gdt-reflection-summary .missing{background:#fff5f2;border-color:#efd3cd;color:#a64e43}.gdt-table.assignments{min-width:920px}.gdt-table.assignments th:first-child{width:135px}.gdt-table.assignments td{text-align:left;line-height:1.45}.gdt-guide-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.gdt-guide-grid article{display:grid;grid-template-columns:auto 1fr;gap:5px 9px;padding:14px;border:1px solid #d9e2ec;border-radius:12px;background:#fff}.gdt-guide-grid svg{grid-row:1/3;color:#48739f}.gdt-guide-grid b{font-size:12px}.gdt-guide-grid p{margin:0;color:#738297;font-size:10.5px;line-height:1.55}.gdt-contact-workspace,.gdt-records-workspace,.gdt-data-workspace{display:grid;gap:12px}.gdt-data-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.gdt-data-card{display:grid;gap:11px;padding:15px;border:1px solid #d8e2ed;border-radius:14px;background:#fff}.gdt-data-card.applied{background:linear-gradient(135deg,#f6fbf8,#fbfdfc)}.gdt-data-card.draft{background:linear-gradient(135deg,#f7faff,#fbfcff)}.gdt-data-card header{display:flex;align-items:center;gap:9px}.gdt-data-card header div{display:grid;gap:3px}.gdt-data-card header b{font-size:13px}.gdt-data-card header span,.gdt-data-card small{font-size:9.5px;color:#7a899b}.gdt-data-card dl{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0}.gdt-data-card dl div{padding:9px;border-radius:9px;background:rgba(255,255,255,.75);border:1px solid #e0e7ef;text-align:center}.gdt-data-card dt{font-size:9px;color:#7a899b}.gdt-data-card dd{margin:3px 0 0;font-size:17px;font-weight:950}.gdt-upload-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.gdt-upload-grid>button{display:flex;align-items:center;gap:10px;padding:15px;border:1px dashed #b8cbe0;border-radius:13px;background:#f8fbff;color:#356493;text-align:left;cursor:pointer}.gdt-upload-grid button span{display:grid;gap:3px}.gdt-upload-grid button b{font-size:12px}.gdt-upload-grid button small{font-size:9.5px;color:#738397}.gdt-source-list{display:grid;gap:7px;padding:13px;border:1px solid #d8e2ed;border-radius:13px;background:#fff}.gdt-source-list>div{display:grid;gap:3px}.gdt-source-list>div b{font-size:12px}.gdt-source-list>div span{font-size:9.5px;color:#778699}.gdt-source-list article{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;padding:9px;border:1px solid #e0e7ef;border-radius:9px;background:#fafcff}.gdt-source-list article span{display:grid;gap:3px;min-width:0}.gdt-source-list article b{font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gdt-source-list article small{font-size:9px;color:#8190a2}.gdt-source-list article button{display:inline-flex;align-items:center;gap:4px;border:1px solid #efd0cb;border-radius:7px;background:#fff7f5;color:#a05248;padding:5px 7px;font:850 9px ${FONT}}.gdt-source-list em{font-size:10px;color:#98a3b0}.gdt-save-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}.gdt-save-actions button{display:inline-flex;align-items:center;gap:6px;padding:9px 11px;border-radius:9px;font:900 10.5px ${FONT};cursor:pointer}.gdt-save-actions .secondary{border:1px solid #cbd8e5;background:#fff;color:#506b87}.gdt-save-actions .primary{border:1px solid #376a9f;background:#376a9f;color:#fff}.gdt-info{display:flex;align-items:flex-start;gap:8px;padding:11px 12px;border-radius:11px;background:#fff8e9;border:1px solid #edd9ad;color:#7b6331;font-size:10.5px;line-height:1.5}@media(max-width:800px){.gdt-contact-actions{align-items:stretch;flex-direction:column}.gdt-role-manager{grid-template-columns:1fr 1fr}.gdt-role-manager>div{grid-column:1/-1}.gdt-record-metrics,.gdt-guide-grid,.gdt-data-grid,.gdt-upload-grid{grid-template-columns:1fr}.gdt-link-manager article,.gdt-activity-link-editor{grid-template-columns:1fr}.gdt-data-card dl{grid-template-columns:repeat(3,1fr)}.gdt-section-heading{align-items:flex-start;flex-direction:column}.gdt-heading-actions{width:100%;justify-content:flex-end}.gdt-table.reflections{min-width:760px}.reflection-wrap{overflow-x:auto}}
`;
