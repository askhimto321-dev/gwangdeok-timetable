import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Search, Printer, Settings, AlertTriangle, ArrowRight, Users, Upload, FileSpreadsheet, FileText, Loader2, Check, X, Save, Database, Trash2, Lock, KeyRound, Eye, ClipboardList, Calendar, Paperclip, BookOpen, Download, Bug, MessageSquare, Send, Link2, Sparkles, Bell, BellRing, Megaphone, CheckCheck } from "lucide-react";
import { readStorage, writeStorage, uploadClassroomAttachment, deleteClassroomAttachment, diagnoseStorageConnection } from "./storage.js";
import GradesSection, { loadGradesDB, AdminGradesUpload, AdminStudentAccounts } from "./Grades.jsx";

const COLORS = { ink: "#2b2620", paper: "#faf8f3", line: "#e6e1d3", accent: "#3d5c3a", accentSoft: "#eaf0e8" };

const DAYS = ["월", "화", "수", "목", "금"];
const PERIODS = [1, 2, 3, 4, 5, 6, 7];
const PERIOD_TIME = { 1: "08:40", 2: "09:40", 3: "10:40", 4: "11:40", 5: "13:30", 6: "14:30", 7: "15:30" };
const FIXED_LABELS = { "자율": "자율학습", "진로": "진로활동" };
const GRADES = ["1", "2", "3"];
const DISABLED_GRADES = [];
const RESET_PASSWORD = "kd2026";
const DEFAULT_ADMIN = { id: "admin", pw: "kd2026" };
const SITE_TITLE = "광덕고 성적/시간표";

const TEACHER_ROLE_LABELS = { homeroom: "학급담임", gradeHead: "학년부장", other: "그외" };
function normalizeGradeAccessList(value) {
  const values = Array.isArray(value) ? value : (value ? [value] : []);
  return Array.from(new Set(values.map(String).filter(item => GRADES.includes(item))));
}
function normalizedTeacherRole(teacher) {
  if (teacher?.teacherRole && TEACHER_ROLE_LABELS[teacher.teacherRole]) return teacher.teacherRole;
  return teacher?.homeroomClass ? "homeroom" : "other";
}
function teacherRoleGrade(teacher) {
  const candidate = String(teacher?.roleGrade || teacher?.homeroomGrade || teacher?.gradeHeadGrade || "2");
  return GRADES.includes(candidate) ? candidate : "2";
}
function teacherGradeAccess(teacher) {
  if (!teacher) return [];
  const role = normalizedTeacherRole(teacher);
  if (role === "homeroom" || role === "gradeHead") return [teacherRoleGrade(teacher)];
  return normalizeGradeAccessList(teacher.gradeAccessGrades || teacher.studentGradeAccessGrades);
}
function teacherTimetableAccess(teacher) {
  if (!teacher) return [];
  const role = normalizedTeacherRole(teacher);
  if (role === "homeroom" || role === "gradeHead") return [teacherRoleGrade(teacher)];
  return normalizeGradeAccessList(teacher.timetableAccessGrades || teacher.studentTimetableAccessGrades);
}
function departmentGradeAccess(account) {
  return normalizeGradeAccessList(account?.gradeAccessGrades || account?.studentGradeAccessGrades);
}
function departmentTimetableAccess(account) {
  return normalizeGradeAccessList(account?.timetableAccessGrades || account?.studentTimetableAccessGrades);
}
function applyAutomaticTeacherAccess(teacher, fallbackGrade = "2") {
  const role = normalizedTeacherRole(teacher);
  const roleGrade = GRADES.includes(String(teacher?.roleGrade || "")) ? String(teacher.roleGrade) : String(fallbackGrade);
  const base = {
    ...teacher,
    teacherRole: role,
    roleGrade,
    gradeAccessGrades: normalizeGradeAccessList(teacher?.gradeAccessGrades || teacher?.studentGradeAccessGrades),
    timetableAccessGrades: normalizeGradeAccessList(teacher?.timetableAccessGrades || teacher?.studentTimetableAccessGrades),
  };
  if (role === "homeroom" || role === "gradeHead") {
    base.gradeAccessGrades = [roleGrade];
    base.timetableAccessGrades = [roleGrade];
  }
  if (role !== "homeroom") base.homeroomClass = "";
  return base;
}

/* ---------- helpers ---------- */
function isMoveSlot(cell) { if (!cell) return false; return /^[A-Z](\(\d\))?_[가-힣A-Za-z0-9]+$/.test(cell); }
function moveSlotAbbrev(cell) { const m = cell.match(/^[A-Z](?:\(\d\))?_(.+)$/); return m ? m[1] : null; }
function parseCompositeLabel(raw) {
  const m = raw.match(/^(.+?)\((.+)\)$/);
  if (m) return { subject: m[1].trim(), location: m[2].trim() };
  return { subject: raw };
}
function emptyGrid() { const g = {}; DAYS.forEach(d => { g[d] = Array(7).fill(null); }); return g; }
function subseqScore(abbrev, clean) {
  if (clean.includes(abbrev)) return 100;
  let i = 0; for (const ch of clean) { if (i < abbrev.length && ch === abbrev[i]) i++; }
  return i === abbrev.length ? 50 : 0;
}
function suggestAbbrevMapping(abbrevs, subjects) {
  const out = {};
  abbrevs.forEach(a => {
    let best = null, bestScore = 0;
    subjects.forEach(s => { const sc = subseqScore(a, s.replace(/\s/g, "")); if (sc > bestScore) { bestScore = sc; best = s; } });
    if (best) out[a] = best;
  });
  return out;
}

const IGNORED_COMMON_LABELS = new Set(["자율학습", "진로활동", "자율", "진로"]);
function extractCommonSubjects(db, scopeKey) {
  const s = new Set();
  const classes = (db.timetables || {})[scopeKey] || {};
  Object.values(classes).forEach(grid => {
    DAYS.forEach(day => (grid[day] || []).forEach(cell => {
      if (!cell || isMoveSlot(cell)) return;
      const { subject } = parseCompositeLabel(cell);
      const label = FIXED_LABELS[subject] || subject;
      if (!IGNORED_COMMON_LABELS.has(label)) s.add(subject);
    }));
  });
  return Array.from(s).sort((a, b) => a.localeCompare(b, "ko"));
}
function extractClasses(db, scopeKey) {
  const classes = (db.timetables || {})[scopeKey] || {};
  return Object.keys(classes).sort((a, b) => a - b);
}
function extractElectiveSubjects(db, scopeKey) {
  const s = new Set();
  const sc = (db.enrollments || {})[scopeKey] || {};
  Object.values(sc).forEach(list => list.forEach(c => s.add(c.subject)));
  return Array.from(s).sort((a, b) => a.localeCompare(b, "ko"));
}
function extractElectiveGroups(db, scopeKey, subject) {
  const s = new Set();
  const sc = (db.enrollments || {})[scopeKey] || {};
  Object.values(sc).forEach(list => list.forEach(c => { if (c.subject === subject) s.add(c.group); }));
  return Array.from(s).sort();
}
function targetKeyFor(kind, subject, target) {
  return kind === "common" ? `COMMON_${subject}_${target}` : `${subject}_${target}`;
}
function subjectKeyFor(subject) {
  return `SUBJECT_${String(subject || "").trim()}`;
}
function homeroomKeyFor(classNum) {
  return `HOMEROOM_${classNum}`;
}
// Defensive normalizer: older data was stored as a single {text,...} object per key;
// newer data is an array of such objects. This safely handles both plus missing/null.
function asNoticeArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "object" && v.text) return [v];
  return [];
}
function asMaterialArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "object" && (v.title || v.text || v.attachments)) return [v];
  return [];
}
function getReadIds(sid) {
  try { return new Set(JSON.parse(localStorage.getItem(`kd_read_${sid}`) || "[]")); }
  catch { return new Set(); }
}
function markRead(sid, ids) {
  try {
    const cur = getReadIds(sid);
    ids.forEach(id => cur.add(id));
    localStorage.setItem(`kd_read_${sid}`, JSON.stringify(Array.from(cur)));
    window.dispatchEvent(new CustomEvent("kd-notice-read", { detail: { sid } }));
  } catch { /* localStorage unavailable */ }
}
const NOTICE_CATEGORIES = ["공지", "수업자료", "수행평가", "과제"];
const HOMEROOM_CATEGORIES = ["공지사항", "제출", "신청", "상담"];
const NOTICE_CATEGORY_COLOR = {
  "공지": { bg: "#fff8e6", border: "#f0dca0", text: "#8a6d1f" },
  "수업자료": { bg: "#edf4fb", border: "#c7d9ee", text: "#315f8a" },
  "수행평가": { bg: "#fdeeee", border: "#f0b8b8", text: "#a3402b" },
  "과제": { bg: "#eaf1fb", border: "#b8d0f0", text: "#2b5aa3" },
  "공지사항": { bg: "#f2eefb", border: "#cdb8f0", text: "#5c2ba3" },
  "제출": { bg: "#eafbf0", border: "#b8f0cd", text: "#1f7d43" },
  "신청": { bg: "#fbf3ea", border: "#f0d5b8", text: "#a3641f" },
  "상담": { bg: "#eaf7fb", border: "#b8e5f0", text: "#1f7a9c" },
};

function classroomUploadErrorMessage(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || error || "");
  if (code.includes("storage/unauthorized")) return "첨부파일 업로드 권한이 없습니다. Firebase Authentication의 익명 로그인 제공업체와 Storage 규칙(request.auth != null)을 확인해주세요.";
  if (code.includes("storage/bucket-not-found") || code.includes("storage/unknown") || /bucket/i.test(message)) {
    return "Firebase Storage가 아직 활성화되지 않았거나 저장소 설정이 올바르지 않습니다.";
  }
  if (code.includes("storage/quota-exceeded")) return "Firebase Storage 사용량 한도를 초과했습니다.";
  if (code.includes("storage/retry-limit-exceeded")) return "첨부파일 업로드 연결이 중단되었습니다. 관리자 → 계정 관리 → 양식·연결 진단에서 Storage 연결을 확인해주세요.";
  if (code.includes("auth/operation-not-allowed")) return "Firebase 익명 로그인이 비활성화되어 있습니다. Authentication → 로그인 방법에서 익명 로그인을 활성화해주세요.";
  return message || "첨부파일 업로드 중 오류가 발생했습니다. 관리자 화면의 Storage 연결 진단을 실행해주세요.";
}

function describeNoticeTarget(targetKey, storedLabel = "") {
  if (storedLabel) return storedLabel;
  const key = String(targetKey || "");
  if (key.startsWith("HOMEROOM_")) return `${key.replace("HOMEROOM_", "")}반 학급`;
  if (key.startsWith("STUDENT_")) return `학생 ${key.replace("STUDENT_", "")}`;
  if (key.startsWith("SUBJECT_")) return `${key.replace("SUBJECT_", "")} 전체 수강생`;
  if (key.startsWith("COMMON_")) {
    const body = key.replace("COMMON_", "");
    const lastUnderscore = body.lastIndexOf("_");
    if (lastUnderscore > 0) return `${body.slice(0, lastUnderscore)} · ${body.slice(lastUnderscore + 1)}반`;
  }
  const lastUnderscore = key.lastIndexOf("_");
  if (lastUnderscore > 0) return `${key.slice(0, lastUnderscore)} · ${key.slice(lastUnderscore + 1)}그룹`;
  return key || "대상 미상";
}

function noticeAuthoredBy(notice, teacher) {
  if (!notice || !teacher) return false;
  if (notice.teacherId && teacher.id) return String(notice.teacherId) === String(teacher.id);
  return String(notice.teacherName || "").trim() === String(teacher.name || "").trim();
}

/* ============================================================
   Pure-JS DEFLATE (raw) decoder — no browser API / no external lib.
   Needed because DecompressionStream support/behavior can vary by
   embedding context; this guarantees identical results everywhere.
   ============================================================ */
function inflateRaw(input) {
  let pos = 0, bitBuf = 0, bitCnt = 0;
  const out = [];
  function getBit() { if (bitCnt === 0) { bitBuf = input[pos++]; bitCnt = 8; } const b = bitBuf & 1; bitBuf >>= 1; bitCnt--; return b; }
  function getBits(n) { let v = 0; for (let i = 0; i < n; i++) v |= getBit() << i; return v; }
  function buildTree(lengths) {
    const maxBits = Math.max(0, ...lengths);
    const blCount = new Array(maxBits + 1).fill(0);
    lengths.forEach(l => { if (l > 0) blCount[l]++; });
    const nextCode = new Array(maxBits + 1).fill(0);
    let code = 0;
    for (let bits = 1; bits <= maxBits; bits++) { code = (code + blCount[bits - 1]) << 1; nextCode[bits] = code; }
    const codes = new Array(lengths.length).fill(0);
    for (let n = 0; n < lengths.length; n++) { const len = lengths[n]; if (len > 0) { codes[n] = nextCode[len]; nextCode[len]++; } }
    const map = new Map();
    for (let n = 0; n < lengths.length; n++) { if (lengths[n] > 0) map.set(lengths[n] + ":" + codes[n], n); }
    return { map, maxBits };
  }
  function decodeSymbol(tree) {
    let code = 0, len = 0;
    while (len < tree.maxBits) { code = (code << 1) | getBit(); len++; const sym = tree.map.get(len + ":" + code); if (sym !== undefined) return sym; }
    throw new Error("invalid huffman code");
  }
  const LEN_BASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const LEN_EXTRA = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const DIST_BASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  const DIST_EXTRA = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
  const CLEN_ORDER = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
  function fixedLitTree() {
    const lengths = new Array(288);
    for (let i = 0; i <= 143; i++) lengths[i] = 8;
    for (let i = 144; i <= 255; i++) lengths[i] = 9;
    for (let i = 256; i <= 279; i++) lengths[i] = 7;
    for (let i = 280; i <= 287; i++) lengths[i] = 8;
    return buildTree(lengths);
  }
  function fixedDistTree() { return buildTree(new Array(30).fill(5)); }
  let finalBlock = false;
  while (!finalBlock) {
    finalBlock = getBit() === 1;
    const type = getBits(2);
    if (type === 0) {
      bitCnt = 0;
      const len = input[pos] | (input[pos + 1] << 8); pos += 4;
      for (let i = 0; i < len; i++) out.push(input[pos++]);
    } else {
      let litTree, distTree;
      if (type === 1) { litTree = fixedLitTree(); distTree = fixedDistTree(); }
      else if (type === 2) {
        const hlit = getBits(5) + 257, hdist = getBits(5) + 1, hclen = getBits(4) + 4;
        const clLengths = new Array(19).fill(0);
        for (let i = 0; i < hclen; i++) clLengths[CLEN_ORDER[i]] = getBits(3);
        const clTree = buildTree(clLengths);
        const lengths = [];
        while (lengths.length < hlit + hdist) {
          const sym = decodeSymbol(clTree);
          if (sym < 16) lengths.push(sym);
          else if (sym === 16) { const rep = getBits(2) + 3; const prev = lengths[lengths.length - 1]; for (let i = 0; i < rep; i++) lengths.push(prev); }
          else if (sym === 17) { const rep = getBits(3) + 3; for (let i = 0; i < rep; i++) lengths.push(0); }
          else { const rep = getBits(7) + 11; for (let i = 0; i < rep; i++) lengths.push(0); }
        }
        litTree = buildTree(lengths.slice(0, hlit));
        distTree = buildTree(lengths.slice(hlit));
      } else throw new Error("invalid deflate block type");
      while (true) {
        const sym = decodeSymbol(litTree);
        if (sym < 256) out.push(sym);
        else if (sym === 256) break;
        else {
          const li = sym - 257;
          const length = LEN_BASE[li] + getBits(LEN_EXTRA[li]);
          const dsym = decodeSymbol(distTree);
          const dist = DIST_BASE[dsym] + getBits(DIST_EXTRA[dsym]);
          const start = out.length - dist;
          for (let i = 0; i < length; i++) out.push(out[start + i]);
        }
      }
    }
  }
  return new Uint8Array(out);
}

/* ---------- pure JS OLE/CFB reader (no external deps) ---------- */
function readCFB(buf) {
  const dv = new DataView(buf);
  if (dv.byteLength < 512) throw new Error("파일이 너무 작아 올바른 한글 문서가 아닙니다.");
  const sig = [0, 1, 2, 3, 4, 5, 6, 7].map(i => dv.getUint8(i));
  const expected = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
  if (!sig.every((b, i) => b === expected[i])) throw new Error("올바른 한글(.hwp 5.0) 파일이 아닙니다. (OLE 서명 불일치)");
  const sectorShift = dv.getUint16(30, true);
  const miniSectorShift = dv.getUint16(32, true);
  const sectorSize = 1 << sectorShift;
  const miniSectorSize = 1 << miniSectorShift;
  const firstDirSector = dv.getUint32(48, true);
  const miniCutoff = dv.getUint32(56, true);
  const firstMiniFatSector = dv.getUint32(60, true);
  const firstDifatSector = dv.getUint32(68, true);
  const numDifatSectors = dv.getUint32(72, true);
  const FREESECT = 0xFFFFFFFF, ENDOFCHAIN = 0xFFFFFFFE;

  function sectorOffset(sec) { return 512 + sec * sectorSize; }
  function readSector(sec) { const off = sectorOffset(sec); return buf.slice(off, off + sectorSize); }

  let difat = [];
  for (let i = 0; i < 109; i++) { const v = dv.getUint32(76 + i * 4, true); if (v !== FREESECT) difat.push(v); }
  let difatSec = firstDifatSector;
  for (let i = 0; i < numDifatSectors && difatSec !== ENDOFCHAIN && difatSec !== FREESECT; i++) {
    const s = readSector(difatSec); const sdv = new DataView(s);
    const perSector = sectorSize / 4 - 1;
    for (let j = 0; j < perSector; j++) { const v = sdv.getUint32(j * 4, true); if (v !== FREESECT) difat.push(v); }
    difatSec = sdv.getUint32(sectorSize - 4, true);
  }

  const fat = new Uint32Array(difat.length * (sectorSize / 4));
  let idx = 0;
  difat.forEach(sec => { const s = readSector(sec); const sdv = new DataView(s); for (let j = 0; j < sectorSize / 4; j++) fat[idx++] = sdv.getUint32(j * 4, true); });

  function getChain(startSec) {
    const chain = []; let sec = startSec, guard = 0;
    while (sec !== ENDOFCHAIN && sec !== FREESECT && sec < fat.length && guard < 1000000) { chain.push(sec); sec = fat[sec]; guard++; }
    return chain;
  }
  function readStreamBySectorChain(startSec, size) {
    const chain = getChain(startSec); const out = new Uint8Array(size); let pos = 0;
    for (const sec of chain) { const s = new Uint8Array(readSector(sec)); const take = Math.min(sectorSize, size - pos); out.set(s.subarray(0, take), pos); pos += take; if (pos >= size) break; }
    return out;
  }

  const dirChain = getChain(firstDirSector);
  const entriesPerSector = sectorSize / 128;
  const entries = [];
  dirChain.forEach(sec => {
    const s = readSector(sec); const sdv = new DataView(s);
    for (let i = 0; i < entriesPerSector; i++) {
      const base = i * 128;
      const nameLen = sdv.getUint16(base + 64, true);
      let name = ""; for (let c = 0; c < Math.max(0, (nameLen / 2) - 1); c++) name += String.fromCharCode(sdv.getUint16(base + c * 2, true));
      const type = sdv.getUint8(base + 66);
      const left = sdv.getUint32(base + 68, true), right = sdv.getUint32(base + 72, true), child = sdv.getUint32(base + 76, true);
      const startSec = sdv.getUint32(base + 116, true), sizeLow = sdv.getUint32(base + 120, true);
      entries.push({ name, type, left, right, child, startSec, size: sizeLow });
    }
  });

  const root = entries.find(e => e.type === 5);
  if (!root) throw new Error("루트 디렉터리를 찾지 못했습니다.");
  const miniStreamChain = getChain(root.startSec);
  function readMiniStreamBytes() {
    const out = new Uint8Array(root.size); let pos = 0;
    for (const sec of miniStreamChain) { const s = new Uint8Array(readSector(sec)); const take = Math.min(sectorSize, root.size - pos); out.set(s.subarray(0, take), pos); pos += take; if (pos >= root.size) break; }
    return out;
  }
  const fullMiniStream = root.size > 0 ? readMiniStreamBytes() : new Uint8Array(0);

  const miniFatChain = getChain(firstMiniFatSector);
  const miniFat = new Uint32Array(miniFatChain.length * (sectorSize / 4));
  let midx = 0;
  miniFatChain.forEach(sec => { const s = readSector(sec); const sdv = new DataView(s); for (let j = 0; j < sectorSize / 4; j++) miniFat[midx++] = sdv.getUint32(j * 4, true); });
  function getMiniChain(startSec) { const chain = []; let sec = startSec, guard = 0; while (sec !== ENDOFCHAIN && sec !== FREESECT && sec < miniFat.length && guard < 1000000) { chain.push(sec); sec = miniFat[sec]; guard++; } return chain; }
  function readMiniStreamEntry(entry) {
    const chain = getMiniChain(entry.startSec); const out = new Uint8Array(entry.size); let pos = 0;
    for (const sec of chain) { const off = sec * miniSectorSize; const take = Math.min(miniSectorSize, entry.size - pos); out.set(fullMiniStream.subarray(off, off + take), pos); pos += take; if (pos >= entry.size) break; }
    return out;
  }

  const paths = {};
  function walk(entryIdx, prefix) {
    if (entryIdx === 0xFFFFFFFF || entryIdx === undefined) return;
    const e = entries[entryIdx]; if (!e) return;
    walk(e.left, prefix);
    const fullName = prefix ? prefix + "/" + e.name : e.name;
    if (e.type === 2) paths[fullName] = e;
    if (e.type === 1 && e.child !== 0xFFFFFFFF) walk(e.child, fullName);
    walk(e.right, prefix);
  }
  if (root.child !== 0xFFFFFFFF) walk(root.child, "");

  function getStream(name) {
    let found = null;
    for (const p in paths) { if (p === name || p.endsWith("/" + name)) { found = paths[p]; break; } }
    if (!found) return null;
    if (found.size < miniCutoff) return readMiniStreamEntry(found);
    return readStreamBySectorChain(found.startSec, found.size);
  }
  return { getStream };
}

function parseHwpSection(data, tables) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let i = 0, curTable = null, curCell = null, lastParas = [];
  const paraText = (off, len) => {
    let s = "", j = 0;
    while (j + 1 < len) {
      const code = dv.getUint16(off + j, true);
      if (code < 32) {
        if (code === 10 || code === 13) { s += "\n"; j += 2; }
        else if ([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23].includes(code)) j += 16;
        else j += 2;
      } else { s += String.fromCharCode(code); j += 2; }
    }
    return s;
  };
  while (i < data.length) {
    const hdr = dv.getUint32(i, true);
    const tag = hdr & 0x3FF, lvl = (hdr >> 10) & 0x3FF;
    let size = (hdr >> 20) & 0xFFF;
    i += 4;
    if (size === 0xFFF) { size = dv.getUint32(i, true); i += 4; }
    const off = i; i += size;
    if (tag === 77) {
      const nRows = dv.getUint16(off + 4, true), nCols = dv.getUint16(off + 6, true);
      let title = null;
      for (let k = lastParas.length - 1; k >= 0; k--) { if (lastParas[k].trim()) { title = lastParas[k].trim(); break; } }
      curTable = { rows: nRows, cols: nCols, cells: {}, title };
      tables.push(curTable); curCell = null;
    } else if (tag === 72 && size >= 16 && curTable) {
      const col = dv.getUint16(off + 8, true), row = dv.getUint16(off + 10, true);
      curCell = row + "," + col;
      if (!curTable.cells[curCell]) curTable.cells[curCell] = [];
    } else if (tag === 67) {
      const txt = paraText(off, size).replace(/\n/g, "").trim();
      if (curTable && curCell) curTable.cells[curCell].push(txt);
      else { lastParas.push(txt); if (lastParas.length > 5) lastParas.shift(); }
    } else if (tag === 66 && lvl === 0) curCell = null;
  }
}
function parseHwpTimetables(arrayBuffer) {
  const cfb = readCFB(arrayBuffer);
  const fh = cfb.getStream("FileHeader");
  if (!fh) throw new Error("FileHeader 스트림을 찾지 못했습니다.");
  const compressed = !!(new DataView(fh.buffer, fh.byteOffset, fh.byteLength).getUint32(36, true) & 1);
  const tables = [];
  let secIdx = 0;
  while (true) {
    const s = cfb.getStream("BodyText/Section" + secIdx);
    if (!s) break;
    const data = compressed ? inflateRaw(s) : s;
    parseHwpSection(data, tables);
    secIdx++;
  }
  if (secIdx === 0) throw new Error("본문(BodyText) 영역을 찾지 못했습니다. 한글 5.0 형식으로 저장했는지 확인해주세요.");
  const out = {};
  tables.forEach(t => {
    if (!t.title) return;
    const m = t.title.match(/(\d)\s*학년\s*(\d+)\s*반/);
    if (!m) return;
    const grade = m[1], cls = m[2];
    const grid = emptyGrid();
    for (let r = 1; r < t.rows; r++) {
      for (let c = 1; c < t.cols && c <= 5; c++) {
        const parts = (t.cells[r + "," + c] || []).filter(Boolean);
        if (!parts.length) continue;
        grid[DAYS[c - 1]][r - 1] = parts[1] ? `${parts[0]}(${parts[1]})` : parts[0];
      }
    }
    if (!out[grade]) out[grade] = {};
    out[grade][cls] = grid;
  });
  return out;
}

/* ---------- xlsx timetable parsing ---------- */
function parseTimetableWorkbook(XLSX, wb) {
  const result = {};
  for (const sheetName of wb.SheetNames) {
    const m = sheetName.match(/^\s*(\d+)\s*(?:반)?\s*$/);
    if (!m) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });
    let headerIdx = rows.findIndex(r => r && r.some(c => String(c || "").trim() === "월"));
    if (headerIdx === -1) headerIdx = 0;
    const grid = emptyGrid();
    for (let i = headerIdx + 1; i < rows.length && i <= headerIdx + 7; i++) {
      const row = rows[i]; if (!row) continue;
      const period = i - headerIdx;
      DAYS.forEach((day, di) => { const v = row[di + 1]; if (v != null && String(v).trim() !== "" && String(v).trim() !== "-") grid[day][period - 1] = String(v).trim(); });
    }
    result[m[1]] = grid;
  }
  return result;
}

let _xlsxModule = null;
async function loadXLSX() {
  if (!_xlsxModule) _xlsxModule = await import("xlsx");
  return _xlsxModule;
}

/* ---------- Excel-style clipboard grid parsing (quote-aware TSV + HTML table) ---------- */
function parseTSV(text) {
  // Handles Excel's clipboard TSV with quoted multi-line cells.
  const rows = [];
  let row = [], cell = "", inQuotes = false, i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === '\t') { row.push(cell); cell = ""; i++; continue; }
    if (ch === '\r') { i++; continue; }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ""; i++; continue; }
    cell += ch; i++;
  }
  row.push(cell); rows.push(row);
  return rows.filter(r => r.some(c => c !== ""));
}
function clipboardToGrid(e) {
  const html = e.clipboardData.getData("text/html");
  if (html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const table = doc.querySelector("table");
    if (table) {
      const rows = Array.from(table.querySelectorAll("tr")).map(tr =>
        Array.from(tr.querySelectorAll("td,th")).map(td => {
          const lines = (td.innerText || td.textContent || "").split("\n").map(s => s.trim()).filter(Boolean);
          if (!lines.length) return "";
          return lines[1] ? `${lines[0]}(${lines[1]})` : lines[0];
        })
      );
      if (rows.length) return rows;
    }
  }
  const text = e.clipboardData.getData("text/plain");
  if (text) return parseTSV(text);
  return null;
}

function AppHistoryEdgeControls({ depth = 0, maxDepth = 0 }) {
  const canBack = Number(depth) > 0;
  const canForward = Number(depth) < Number(maxDepth);
  return (
    <>
      <button
        type="button"
        className="kd-history-edge kd-history-edge-left no-print"
        disabled={!canBack}
        onClick={() => canBack && window.history.back()}
        title={canBack ? "홈페이지 안의 이전 화면" : "이전 화면 기록 없음"}
        aria-label="홈페이지 이전 화면"
      >←</button>
      <button
        type="button"
        className="kd-history-edge kd-history-edge-right no-print"
        disabled={!canForward}
        onClick={() => canForward && window.history.forward()}
        title={canForward ? "홈페이지 안의 다음 화면" : "다음 화면 기록 없음"}
        aria-label="홈페이지 다음 화면"
      >→</button>
    </>
  );
}

/* ============================================================ */
export default function App() {
  const [section, setSection] = useState(null); // null = not chosen yet | "grades" | "timetable"
  const [tab, setTab] = useState("student");
  const [loading, setLoading] = useState(true);
  const [grade, setGrade] = useState("2");
  const [semester, setSemester] = useState("sem1");
  const [db, setDb] = useState({ roster: {}, enrollments: {}, timetables: {}, meta: {}, roomNames: {}, announcements: {}, materials: {}, feedback: [], staffNotices: [] });
  const [gdb, setGdb] = useState(null); // 성적 데이터 (lazily loaded when first needed)
  const [abbrevMaps, setAbbrevMaps] = useState({});
  const [accounts, setAccounts] = useState({ admin: [], classView: [], departments: [], teacher: [], teacherPending: [], monitors: [], students: [] });
  const [loggedInAdmin, setLoggedInAdmin] = useState(null);
  const [classAuthed, setClassAuthed] = useState(false);
  const [loggedInTeacher, setLoggedInTeacher] = useState(null);
  const [loggedInDepartment, setLoggedInDepartment] = useState(null);
  const [loggedInMonitor, setLoggedInMonitor] = useState(null);
  const [loggedInStudent, setLoggedInStudent] = useState(null);
  const [viewedTeacher, setViewedTeacher] = useState(null); // admin "view as teacher" (no separate login needed)
  const [selectedStudentSid, setSelectedStudentSid] = useState(null);
  const [selectedStudentQuery, setSelectedStudentQuery] = useState("");
  const [studentWorkspaceView, setStudentWorkspaceView] = useState("grades");
  const sessionRestoredRef = useRef(false);
  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg, type = "info") => { setToast({ msg, type }); setTimeout(() => setToast(null), 4200); }, []);
  const historyApplyingRef = useRef(false);
  const [historyMeta, setHistoryMeta] = useState({ depth: 0, maxDepth: 0 });

  useEffect(() => {
    (async () => {
      const [roster, enrollments, timetables, meta, abbrev1, abbrev2, abbrev3, accts, roomNames, announcements, materials, feedback, staffNotices] = await Promise.all([
        readStorage("kd_roster", {}),
        readStorage("kd_enroll", {}),
        readStorage("kd_tt", {}),
        readStorage("kd_meta", {}),
        readStorage("kd_abbrev_1", {}),
        readStorage("kd_abbrev_2", {}),
        readStorage("kd_abbrev_3", {}),
        readStorage("kd_accounts", { admin: [], classView: [], departments: [], teacher: [], teacherPending: [], monitors: [], students: [] }),
        readStorage("kd_rooms", {}),
        readStorage("kd_notices", {}),
        readStorage("kd_materials", {}),
        readStorage("kd_feedback", []),
        readStorage("kd_staff_notices", []),
      ]);
      setDb({ roster, enrollments, timetables, meta, roomNames, announcements, materials, feedback, staffNotices });
      loadGradesDB().then(setGdb);
      setAbbrevMaps({ "1": abbrev1, "2": abbrev2, "3": abbrev3 });
      const normalizedAccounts = { admin: [], classView: [], departments: [], teacher: [], teacherPending: [], monitors: [], students: [], ...(accts || {}) };
      setAccounts(normalizedAccounts);
      setLoading(false);

      // Restore login session (survives page refresh) — validate saved ids still exist.
      if (!sessionRestoredRef.current) {
        sessionRestoredRef.current = true;
        try {
          const saved = JSON.parse(localStorage.getItem("kd_session") || "{}");
          if (saved.adminId) {
            const acc = (accts.admin || []).find(a => a.id === saved.adminId) || ((accts.admin || []).length === 0 && saved.adminId === DEFAULT_ADMIN.id ? DEFAULT_ADMIN : null);
            if (acc) setLoggedInAdmin(acc); else localStorage.removeItem("kd_session");
          }
          if (saved.classViewId && (accts.classView || []).some(a => a.id === saved.classViewId)) setClassAuthed(true);
          if (saved.teacherId) {
            const t = (accts.teacher || []).find(a => a.id === saved.teacherId);
            if (t) setLoggedInTeacher(t);
          }
          if (saved.departmentId) {
            const d = (accts.departments || []).find(a => a.id === saved.departmentId);
            if (d) setLoggedInDepartment(d);
          }
          if (saved.monitorId) {
            const m = (accts.monitors || []).find(a => a.id === saved.monitorId);
            if (m) setLoggedInMonitor(m);
          }
          if (saved.studentId) {
            const s = (accts.students || []).find(a => a.id === saved.studentId);
            if (s) {
              const studentGrade = String(s.id || "").charAt(0);
              if (GRADES.includes(studentGrade)) setGrade(studentGrade);
              setLoggedInStudent(s);
            }
          }
          if (saved.selectedStudentSid) {
            setSelectedStudentSid(String(saved.selectedStudentSid));
            setSelectedStudentQuery(String(saved.selectedStudentQuery || saved.selectedStudentSid));
            const selectedGrade = String(saved.selectedStudentSid).charAt(0);
            if (GRADES.includes(selectedGrade) && !DISABLED_GRADES.includes(selectedGrade)) setGrade(selectedGrade);
          }
          if (saved.section) setSection(saved.section);
          if (["grades", "admission", "consultation", "timetable"].includes(saved.studentWorkspaceView)) setStudentWorkspaceView(saved.studentWorkspaceView);
        } catch { /* ignore malformed session */ }
      }
    })();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const browserHistory = window.history;
    const originalPushState = browserHistory.pushState.bind(browserHistory);
    const originalReplaceState = browserHistory.replaceState.bind(browserHistory);
    let currentDepth = Number(browserHistory.state?.kdDepth);
    if (!Number.isFinite(currentDepth) || currentDepth < 0) {
      currentDepth = 0;
      originalReplaceState({ ...(browserHistory.state || {}), kdDepth: 0, kdAppInternal: true }, "", window.location.href);
    }
    let maxDepth = currentDepth;
    const syncMeta = () => {
      const depth = Math.max(0, Number(browserHistory.state?.kdDepth || 0));
      setHistoryMeta({ depth, maxDepth });
    };
    browserHistory.pushState = function patchedPushState(state, title, url) {
      const baseDepth = Math.max(0, Number(browserHistory.state?.kdDepth || 0));
      const nextDepth = baseDepth + 1;
      maxDepth = nextDepth;
      originalPushState({ ...(state || {}), kdDepth: nextDepth, kdAppInternal: true }, title, url);
      syncMeta();
    };
    const handlePopState = event => {
      const depth = Math.max(0, Number(event.state?.kdDepth || 0));
      maxDepth = Math.max(maxDepth, depth);
      setHistoryMeta({ depth, maxDepth });
      const route = event.state?.kdAppRoute;
      if (!route) return;
      historyApplyingRef.current = true;
      if (route.section !== undefined) setSection(route.section);
      if (route.tab !== undefined) setTab(route.tab);
      if (route.studentWorkspaceView !== undefined) setStudentWorkspaceView(route.studentWorkspaceView);
      if (route.grade !== undefined && GRADES.includes(String(route.grade))) setGrade(String(route.grade));
      if (route.semester !== undefined) setSemester(route.semester);
      queueMicrotask(() => { historyApplyingRef.current = false; });
    };
    window.addEventListener("popstate", handlePopState);
    syncMeta();
    return () => {
      window.removeEventListener("popstate", handlePopState);
      browserHistory.pushState = originalPushState;
      browserHistory.replaceState = originalReplaceState;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || historyApplyingRef.current || historyMeta.depth !== 0) return;
    const current = window.history.state || {};
    window.history.replaceState({
      ...current,
      kdDepth: 0,
      kdAppInternal: true,
      kdAppRoute: { section, tab, studentWorkspaceView, grade, semester },
    }, "", window.location.href);
  }, [section, tab, studentWorkspaceView, grade, semester, historyMeta.depth]);

  const pushAppRoute = useCallback((patch = {}) => {
    if (typeof window === "undefined" || historyApplyingRef.current) return;
    const route = {
      section: patch.section !== undefined ? patch.section : section,
      tab: patch.tab !== undefined ? patch.tab : tab,
      studentWorkspaceView: patch.studentWorkspaceView !== undefined ? patch.studentWorkspaceView : studentWorkspaceView,
      grade: patch.grade !== undefined ? patch.grade : grade,
      semester: patch.semester !== undefined ? patch.semester : semester,
    };
    const currentRoute = window.history.state?.kdAppRoute;
    if (currentRoute && JSON.stringify(currentRoute) === JSON.stringify(route)) return;
    window.history.pushState({ kdAppRoute: route }, "", window.location.href);
  }, [section, tab, studentWorkspaceView, grade, semester]);

  const saveSession = (patch) => {
    try {
      const current = JSON.parse(localStorage.getItem("kd_session") || "{}");
      localStorage.setItem("kd_session", JSON.stringify({ ...current, ...patch }));
    } catch { /* localStorage unavailable */ }
  };

  // Unified login: one credential check tried against every account type, regardless of
  // which tab's login form triggered it. Whichever role matches gets activated immediately,
  // unlocking every tab that role has access to — no more separate logins per tab.
  const attemptLogin = useCallback((idRaw, pw) => {
    const id = (idRaw || "").trim();
    const adminList = accounts.admin.length ? accounts.admin : [DEFAULT_ADMIN];
    const adminMatch = adminList.find(a => a.id === id && a.pw === pw);
    if (adminMatch) { setLoggedInAdmin(adminMatch); saveSession({ adminId: adminMatch.id }); return "admin"; }
    const teacherMatch = (accounts.teacher || []).find(a => a.id === id && a.pw === pw);
    if (teacherMatch) { setLoggedInTeacher(teacherMatch); saveSession({ teacherId: teacherMatch.id }); return "teacher"; }
    const departmentMatch = (accounts.departments || []).find(a => a.id === id && a.pw === pw);
    if (departmentMatch) { setLoggedInDepartment(departmentMatch); saveSession({ departmentId: departmentMatch.id }); return "department"; }
    const monitorMatch = (accounts.monitors || []).find(a => a.id === id && a.pw === pw);
    if (monitorMatch) { setLoggedInMonitor(monitorMatch); saveSession({ monitorId: monitorMatch.id }); return "monitor"; }
    const classMatch = (accounts.classView || []).find(a => a.id === id && a.pw === pw);
    if (classMatch) { setClassAuthed(true); saveSession({ classViewId: classMatch.id }); return "classView"; }
    const studentMatch = (accounts.students || []).find(a => a.id === id && a.pw === pw);
    if (studentMatch) {
      const studentGrade = String(studentMatch.id || "").charAt(0);
      if (GRADES.includes(studentGrade)) setGrade(studentGrade);
      setLoggedInStudent(studentMatch);
      saveSession({ studentId: studentMatch.id });
      return "student";
    }
    return null;
  }, [accounts]);

  const persist = useCallback(async (patch) => {
    const jobs = [];
    if (patch.roster) jobs.push(writeStorage("kd_roster", patch.roster));
    if (patch.enrollments) jobs.push(writeStorage("kd_enroll", patch.enrollments));
    if (patch.timetables) jobs.push(writeStorage("kd_tt", patch.timetables));
    if (patch.meta) jobs.push(writeStorage("kd_meta", patch.meta));
    if (patch.roomNames) jobs.push(writeStorage("kd_rooms", patch.roomNames));
    if (patch.announcements) jobs.push(writeStorage("kd_notices", patch.announcements));
    if (patch.materials) jobs.push(writeStorage("kd_materials", patch.materials));
    if (patch.feedback) jobs.push(writeStorage("kd_feedback", patch.feedback));
    if (patch.staffNotices) jobs.push(writeStorage("kd_staff_notices", patch.staffNotices));
    const results = await Promise.all(jobs);
    const failed = results.find(r => r && r.ok === false);
    if (failed) { showToast(`실패했습니다. (${failed.error})`, "error"); return false; }
    setDb(d => ({ ...d, ...patch })); // only reflect in the UI once Firestore confirms the write
    return true;
  }, [showToast]);
  const persistAbbrev = useCallback(async (grade, m) => {
    const r = await writeStorage(`kd_abbrev_${grade}`, m);
    if (!r.ok) { showToast(`실패했습니다. (${r.error})`, "error"); return false; }
    setAbbrevMaps(prev => ({ ...prev, [grade]: m }));
    return true;
  }, [showToast]);
  const persistAccounts = useCallback(async (a) => {
    const r = await writeStorage("kd_accounts", a);
    if (!r.ok) { showToast(`실패했습니다. (${r.error})`, "error"); return false; }
    setAccounts(a);
    return true;
  }, [showToast]);

  const persistGrades = useCallback(async (patch) => {
    const jobs = [];
    if (patch.semesterData) jobs.push(writeStorage("kd_grades_semesters", patch.semesterData));
    if (patch.mockData) jobs.push(writeStorage("kd_grades_mocks", patch.mockData));
    if (patch.admissionRows) {
      const normalizedRows = (patch.admissionRows || []).map(item => ({ ...item, targetGrade: [1,2,3].includes(Number(item?.targetGrade)) ? Number(item.targetGrade) : 2 }));
      jobs.push(writeStorage("kd_grades_admission", normalizedRows));
      [1,2,3].forEach(gradeValue => jobs.push(writeStorage(`kd_grades_admission_grade_${gradeValue}`, normalizedRows.filter(item => Number(item.targetGrade) === gradeValue))));
    }
    if (patch.admissionDocs) {
      const normalizedDocs = (patch.admissionDocs || []).map(item => ({ ...item, targetGrade: [1,2,3].includes(Number(item?.targetGrade)) ? Number(item.targetGrade) : 2 }));
      jobs.push(writeStorage("kd_grades_admission_docs", normalizedDocs));
      [1,2,3].forEach(gradeValue => jobs.push(writeStorage(`kd_grades_admission_docs_grade_${gradeValue}`, normalizedDocs.filter(item => Number(item.targetGrade) === gradeValue))));
    }
    if (patch.cohortSettings) jobs.push(writeStorage("kd_grades_cohorts", patch.cohortSettings));
    if (patch.admissionCaseSources) jobs.push(writeStorage("kd_grades_admission_case_sources", patch.admissionCaseSources));
    if (patch.admissionCases) jobs.push(writeStorage("kd_grades_admission_cases", patch.admissionCases));
    if (patch.admissionFavorites) jobs.push(writeStorage("kd_grades_admission_favorites", patch.admissionFavorites));
    if (patch.admissionCounseling) jobs.push(writeStorage("kd_grades_admission_counseling", patch.admissionCounseling));
    const results = await Promise.all(jobs);
    const failed = results.find(result => result && result.ok === false);
    if (failed) {
      showToast(`성적 데이터 저장에 실패했습니다. (${failed.error || "원인 미상"})`, "error");
      return false;
    }
    setGdb(d => ({ ...d, ...patch }));
    return true;
  }, [showToast]);

  const scopeKey = `${grade}-${semester}`;
  const roster = db.roster[scopeKey] || {};
  const enrollments = db.enrollments[scopeKey] || {};
  const timetables = db.timetables[scopeKey] || {};
  const roomNames = db.roomNames[scopeKey] || {};
  const abbrevMap = abbrevMaps[grade] || {};
  const announcements = db.announcements[scopeKey] || {};
  const materials = db.materials[scopeKey] || {};

  const teacherGradeAccessList = useMemo(() => teacherGradeAccess(loggedInTeacher), [loggedInTeacher]);
  const teacherTimetableAccessList = useMemo(() => teacherTimetableAccess(loggedInTeacher), [loggedInTeacher]);
  const departmentGradeAccessList = useMemo(() => departmentGradeAccess(loggedInDepartment), [loggedInDepartment]);
  const departmentTimetableAccessList = useMemo(() => departmentTimetableAccess(loggedInDepartment), [loggedInDepartment]);
  const staffGradeAccessList = loggedInTeacher ? teacherGradeAccessList : departmentGradeAccessList;
  const staffTimetableAccessList = loggedInTeacher ? teacherTimetableAccessList : departmentTimetableAccessList;
  const teacherCanViewTimetable = !loggedInTeacher || teacherTimetableAccessList.includes(String(grade));
  const departmentCanViewTimetable = !loggedInDepartment || departmentTimetableAccessList.includes(String(grade));

  const updateSelectedStudentSid = useCallback((sid) => {
    const value = sid ? String(sid).trim() : null;
    setSelectedStudentSid(value);
    if (value) {
      setSelectedStudentQuery(value);
      const inferredGrade = value.charAt(0);
      if (GRADES.includes(inferredGrade) && !DISABLED_GRADES.includes(inferredGrade)) setGrade(inferredGrade);
      saveSession({ selectedStudentSid: value, selectedStudentQuery: value });
    } else {
      saveSession({ selectedStudentSid: null });
    }
  }, []);

  const updateSelectedStudentQuery = useCallback((queryValue) => {
    const value = String(queryValue ?? "");
    setSelectedStudentQuery(value);
    const exactSid = value.trim();
    const existsInAnyRoster = exactSid && Object.values(db.roster || {}).some(scopeRoster => scopeRoster?.[exactSid]);
    if (existsInAnyRoster) {
      setSelectedStudentSid(exactSid);
      const inferredGrade = exactSid.charAt(0);
      if (GRADES.includes(inferredGrade) && !DISABLED_GRADES.includes(inferredGrade)) setGrade(inferredGrade);
      saveSession({ selectedStudentSid: exactSid, selectedStudentQuery: exactSid });
    } else {
      if (selectedStudentSid && exactSid !== selectedStudentSid) {
        setSelectedStudentSid(null);
        saveSession({ selectedStudentSid: null, selectedStudentQuery: value });
      } else {
        saveSession({ selectedStudentQuery: value });
      }
    }
  }, [db.roster, selectedStudentSid]);

  useEffect(() => {
    if (!loggedInTeacher) return;
    const refreshed = (accounts.teacher || []).find(item => item.id === loggedInTeacher.id);
    if (refreshed && refreshed !== loggedInTeacher) setLoggedInTeacher(refreshed);
  }, [accounts, loggedInTeacher]);

  useEffect(() => {
    if (!loggedInDepartment) return;
    const refreshed = (accounts.departments || []).find(item => item.id === loggedInDepartment.id);
    if (refreshed && refreshed !== loggedInDepartment) setLoggedInDepartment(refreshed);
  }, [accounts, loggedInDepartment]);

  useEffect(() => {
    if (!loggedInTeacher) return;
    const available = Array.from(new Set([...teacherGradeAccessList, ...teacherTimetableAccessList]));
    if (available.length && !available.includes(String(grade))) {
      const next = available.find(item => !DISABLED_GRADES.includes(item)) || available[0];
      if (next && next !== String(grade)) setGrade(next);
    }
  }, [loggedInTeacher, teacherGradeAccessList, teacherTimetableAccessList, grade]);

  useEffect(() => {
    if (!loggedInDepartment) return;
    const available = Array.from(new Set([...departmentGradeAccessList, ...departmentTimetableAccessList]));
    if (available.length && !available.includes(String(grade))) {
      const next = available.find(item => !DISABLED_GRADES.includes(item)) || available[0];
      if (next && next !== String(grade)) setGrade(next);
    }
  }, [loggedInDepartment, departmentGradeAccessList, departmentTimetableAccessList, grade]);

  useEffect(() => {
    if (loggedInTeacher && !teacherCanViewTimetable && tab !== "teacherZone") setTab("teacherZone");
  }, [loggedInTeacher, teacherCanViewTimetable, tab]);

  const buildPersonalTimetable = useCallback((sid) => {
    const info = roster[sid];
    if (!info) return null;
    const homeTT = timetables[String(info.class)];
    const rev = {}; Object.entries(abbrevMap).forEach(([k, v]) => { rev[v] = k; });
    const roomLabel = (cls) => roomNames[String(cls)] || `${cls}반`;
    const grid = emptyGrid();
    if (homeTT) DAYS.forEach(day => (homeTT[day] || []).forEach((c, pi) => { if (c && !isMoveSlot(c)) grid[day][pi] = { type: "pf", raw: c }; }));
    const warnings = [];
    const notices = [];
    const classroomCourseMap = new Map();
    const registerClassroomCourse = (key, subject, label, kind, compatibleKeys = []) => {
      if (!key || classroomCourseMap.has(key)) return;
      const sourceKeys = Array.from(new Set([key, ...compatibleKeys].filter(Boolean)));
      const noticePosts = sourceKeys.flatMap(sourceKey => asNoticeArray(announcements[sourceKey])).map(item => ({
        ...item,
        title: item.title || (item.category === "수업자료" ? "수업자료" : item.category || "공지"),
        sourceType: "notice",
      }));
      const noticeMaterialIds = new Set(noticePosts.map(item => item.materialId).filter(Boolean));
      const legacyMaterialPosts = sourceKeys.flatMap(sourceKey => asMaterialArray(materials[sourceKey]))
        .filter(item => !noticeMaterialIds.has(item.id))
        .map(item => ({ ...item, category: "수업자료", sourceType: "legacy-material" }));
      const seen = new Set();
      const posts = [...noticePosts, ...legacyMaterialPosts]
        .filter(item => { const token = item.id || `${item.title}-${item.updatedAt}`; if (seen.has(token)) return false; seen.add(token); return true; })
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
      classroomCourseMap.set(key, { key, subject, label, kind, posts });
    };

    (enrollments[sid] || []).forEach(course => {
      const ab = rev[course.subject];
      const legacyNoticeKey = targetKeyFor("elective", course.subject, course.group);
      const noticeKey = subjectKeyFor(course.subject);
      registerClassroomCourse(noticeKey, course.subject, course.subject, "elective", [legacyNoticeKey]);
      [...asNoticeArray(announcements[noticeKey]), ...asNoticeArray(announcements[legacyNoticeKey])].forEach(n => notices.push({ subject: course.subject, group: "전체 수강생", ...n }));
      if (!ab) { warnings.push(`"${course.subject}" 과목의 약어 매핑이 없습니다.`); return; }
      const hostTT = timetables[String(course.hostClass)];
      if (!hostTT) { warnings.push(`"${course.subject}"이 개설되는 ${roomLabel(course.hostClass)} 시간표가 없습니다.`); return; }
      let placed = 0;
      DAYS.forEach(day => (hostTT[day] || []).forEach((c, pi) => {
        if (!c) return;
        const bare = parseCompositeLabel(c).subject;
        const match = isMoveSlot(c) ? moveSlotAbbrev(c) === ab : bare === ab;
        if (match) { grid[day][pi] = { type: "move", subject: course.subject, group: course.group, hostClass: course.hostClass, roomLabel: roomLabel(course.hostClass), moved: course.hostClass !== info.class }; placed++; }
      }));
      if (placed === 0) warnings.push(`"${course.subject}(${course.group})"의 시간대를 ${roomLabel(course.hostClass)} 시간표에서 찾지 못했습니다.`);
    });
    DAYS.forEach(day => { grid[day] = grid[day].map(c => { if (c && c.type === "pf") { const { subject, location } = parseCompositeLabel(c.raw); return { type: "fixed", subject: FIXED_LABELS[subject] || subject, location }; } return c; }); });
    const seenCommon = new Set();
    DAYS.forEach(day => grid[day].forEach(c => {
      if (!c || c.type !== "fixed" || IGNORED_COMMON_LABELS.has(c.subject)) return;
      const legacyKey = targetKeyFor("common", c.subject, info.class);
      const key = subjectKeyFor(c.subject);
      if (seenCommon.has(key)) return;
      seenCommon.add(key);
      registerClassroomCourse(key, c.subject, c.subject, "common", [legacyKey]);
      [...asNoticeArray(announcements[key]), ...asNoticeArray(announcements[legacyKey])].forEach(n => notices.push({ subject: c.subject, group: "전체 수강생", ...n }));
    }));
    const personalNotices = asNoticeArray(announcements[`STUDENT_${sid}`]).map(n => ({ ...n, origin: "personal" }));
    const homeroomOnly = asNoticeArray(announcements[homeroomKeyFor(info.class)]).map(n => ({ ...n, origin: "homeroom" }));
    const homeroomNotices = [...homeroomOnly, ...personalNotices];
    const classroomCourses = Array.from(classroomCourseMap.values()).sort((a, b) => a.label.localeCompare(b.label, "ko"));
    return { student: info, grid, warnings, notices, homeroomNotices, classroomCourses, hasTimetable: !!homeTT };
  }, [roster, enrollments, timetables, abbrevMap, roomNames, announcements, materials]);

  const adminAccounts = accounts.admin.length ? accounts.admin : [DEFAULT_ADMIN];
  const hasAnyData = Object.keys(roster).length > 0;
  const anyLoggedIn = !!(loggedInAdmin || loggedInTeacher || loggedInDepartment || loggedInMonitor || classAuthed || loggedInStudent);
  const canViewStudentTimetableTools = !!(loggedInAdmin || classAuthed || loggedInMonitor || (loggedInTeacher && teacherCanViewTimetable) || (loggedInDepartment && departmentCanViewTimetable));
  const feedbackReporter = loggedInAdmin
    ? { role: "관리자", id: "", name: "관리자" }
    : loggedInTeacher
      ? { role: "선생님", id: loggedInTeacher.id, name: loggedInTeacher.name }
      : loggedInDepartment
        ? { role: "부서 계정", id: loggedInDepartment.id, name: loggedInDepartment.name || loggedInDepartment.id }
        : loggedInMonitor
          ? { role: "교과부장", id: loggedInMonitor.id, name: loggedInMonitor.studentName || loggedInMonitor.id }
          : loggedInStudent
            ? { role: "학생", id: loggedInStudent.id, name: loggedInStudent.name }
            : { role: classAuthed ? "공용 조회" : "이용자", id: "", name: "" };

  if (loading) return <div style={styles.loadingScreen}><Loader2 className="spin" size={24} /><div style={styles.loadingText}>로딩 중입니다. 잠시만 기다려주세요.</div></div>;

  const globalLogout = () => {
    setLoggedInAdmin(null); setLoggedInTeacher(null); setLoggedInDepartment(null); setLoggedInMonitor(null); setClassAuthed(false); setLoggedInStudent(null);
    setSection(null);
    try { localStorage.removeItem("kd_session"); } catch { /* ignore */ }
  };
  const activeSection = section || "grades";
  const staffWorkspaceEnabled = !!(loggedInAdmin || loggedInTeacher || loggedInDepartment);
  const workspaceAllowedGrades = loggedInAdmin ? GRADES : Array.from(new Set([...(staffGradeAccessList || []), ...(staffTimetableAccessList || [])]));
  const changeStudentWorkspaceView = (view) => {
    const nextSection = view === "timetable" ? "timetable" : "grades";
    const nextTab = view === "timetable" ? "student" : tab;
    pushAppRoute({ section: nextSection, studentWorkspaceView: view, tab: nextTab });
    setStudentWorkspaceView(view);
    if (view === "timetable") {
      setSection("timetable");
      setTab("student");
    } else {
      setSection("grades");
    }
    saveSession({ section: nextSection, studentWorkspaceView: view, selectedStudentSid, selectedStudentQuery });
  };
  const switchSection = (s) => {
    let nextWorkspaceView = studentWorkspaceView;
    let nextTab = tab;
    if (staffWorkspaceEnabled) {
      if (s === "timetable") nextWorkspaceView = "timetable";
      if (s === "grades" && studentWorkspaceView === "timetable") nextWorkspaceView = "grades";
    }
    if (staffWorkspaceEnabled && selectedStudentSid && s === "timetable") nextTab = "student";
    pushAppRoute({ section: s, studentWorkspaceView: nextWorkspaceView, tab: nextTab });
    if (staffWorkspaceEnabled) setStudentWorkspaceView(nextWorkspaceView);
    if (staffWorkspaceEnabled && selectedStudentSid) {
      const inferredGrade = String(selectedStudentSid).charAt(0);
      if (GRADES.includes(inferredGrade) && !DISABLED_GRADES.includes(inferredGrade)) setGrade(inferredGrade);
      if (s === "timetable") setTab("student");
    }
    setSection(s);
    saveSession({
      section: s,
      selectedStudentSid,
      selectedStudentQuery,
    });
  };

  if (!anyLoggedIn) {
    return (
      <div style={styles.app}>
        <style>{globalCss}</style>
        <div style={{ padding: "40px 20px" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 20 }}>광덕고 성적/시간표 <span style={styles.betaBadge}>Beta</span></div>
            <div style={{ fontSize: 13, color: "#8a8578", marginTop: 6 }}>먼저 로그인해주세요. (학생 / 선생님 / 관리자 계정 모두 아래에서 로그인합니다)</div>
          </div>
          <UnifiedLoginGate label="광덕고 성적/시간표" attemptLogin={attemptLogin} showToast={showToast} satisfies={() => true} hint={null} />
        </div>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <style>{globalCss}</style>
      <AppHistoryEdgeControls depth={historyMeta.depth} maxDepth={historyMeta.maxDepth} />
      <MegaNav active={activeSection} onSwitch={switchSection} onLogout={globalLogout} showAdmin={!!loggedInAdmin} />
      {staffWorkspaceEnabled && activeSection !== "admin" && <StaffStudentWorkspaceBar
        allRosters={db.roster}
        allowedGrades={workspaceAllowedGrades}
        selectedSid={selectedStudentSid}
        query={selectedStudentQuery}
        onQueryChange={updateSelectedStudentQuery}
        onSelect={updateSelectedStudentSid}
        activeView={studentWorkspaceView}
        onViewChange={changeStudentWorkspaceView}
      />}
      {activeSection === "admin" ? (
        <AdminConsole
          db={db} persist={persist} showToast={showToast} grade={grade} setGrade={setGrade} semester={semester} setSemester={setSemester}
          scopeKey={scopeKey} roster={roster} enrollments={enrollments} timetables={timetables} abbrevMap={abbrevMap} persistAbbrev={persistAbbrev}
          accounts={accounts} persistAccounts={persistAccounts} build={buildPersonalTimetable} loggedInAdmin={loggedInAdmin}
          gdb={gdb} persistGrades={persistGrades}
        />
      ) : activeSection === "grades" ? (
        <GradesSection
          loggedInAdmin={loggedInAdmin} loggedInTeacher={loggedInTeacher || (loggedInDepartment ? { ...loggedInDepartment, accountType: "department" } : null)} loggedInStudent={loggedInStudent}
          roster={roster} accounts={accounts} showToast={showToast} onLogout={globalLogout}
          gdb={gdb} currentGrade={grade} teacherGradeAccess={staffGradeAccessList}
          selectedStudentSid={staffWorkspaceEnabled ? selectedStudentSid : undefined}
          onSelectedStudentSidChange={staffWorkspaceEnabled ? updateSelectedStudentSid : undefined}
          selectedStudentQuery={staffWorkspaceEnabled ? selectedStudentQuery : undefined}
          onSelectedStudentQueryChange={staffWorkspaceEnabled ? updateSelectedStudentQuery : undefined}
          requestedStudentView={studentWorkspaceView}
          persistGrades={persistGrades}
        />
      ) : (loggedInStudent && !loggedInAdmin && !loggedInTeacher && !loggedInDepartment && !loggedInMonitor && !classAuthed) ? (
        <div style={styles.body}>
          <h1 style={styles.h1}>{loggedInStudent.name} 학생 시간표</h1>
          <StudentOwnTimetable student={loggedInStudent} build={buildPersonalTimetable} grade={grade} setGrade={setGrade} />
        </div>
      ) : (
        <>
          <TopBar
            tab={tab} setTab={nextTab => { pushAppRoute({ section: "timetable", tab: nextTab }); setTab(nextTab); }} grade={grade} setGrade={setGrade}
            semester={semester} setSemester={setSemester} meta={db.meta[scopeKey]}
            canViewStudentTools={canViewStudentTimetableTools}
            allowedGrades={(loggedInTeacher || loggedInDepartment) ? staffTimetableAccessList : null}
            compact={staffWorkspaceEnabled}
          />
          <div style={styles.body}>
            {tab === "student" && (canViewStudentTimetableTools
              ? <StudentView
                  key={scopeKey}
                  roster={roster}
                  build={buildPersonalTimetable}
                  hasAnyData={hasAnyData}
                  selectedSid={staffWorkspaceEnabled ? selectedStudentSid : undefined}
                  onSelectedSidChange={staffWorkspaceEnabled ? updateSelectedStudentSid : undefined}
                  sharedQuery={staffWorkspaceEnabled ? selectedStudentQuery : undefined}
                  onSharedQueryChange={staffWorkspaceEnabled ? updateSelectedStudentQuery : undefined}
                />
              : <div style={styles.warnBanner}><AlertTriangle size={14} /> {grade}학년 학생 시간표 조회 권한이 없습니다.</div>)}
            {tab === "classPrint" && (canViewStudentTimetableTools
              ? <ClassPrintView key={scopeKey} roster={roster} build={buildPersonalTimetable} hasAnyData={hasAnyData} onLogout={(loggedInAdmin || loggedInTeacher || loggedInDepartment || loggedInMonitor) ? null : () => { setClassAuthed(false); saveSession({ classViewId: null }); }} />
              : <div style={styles.warnBanner}><AlertTriangle size={14} /> {grade}학년 학생 시간표 조회 권한이 없습니다.</div>)}
            {tab === "subjectGroup" && (canViewStudentTimetableTools
              ? <SubjectGroupView key={scopeKey} roster={roster} enrollments={enrollments} hasAnyData={hasAnyData} announcements={announcements} />
              : <div style={styles.warnBanner}><AlertTriangle size={14} /> {grade}학년 학생 시간표 조회 권한이 없습니다.</div>)}
            {tab === "teacherZone" && (
              (loggedInTeacher || loggedInMonitor || viewedTeacher)
                ? (loggedInMonitor
                    ? <MonitorZoneView monitor={loggedInMonitor} db={db} persist={persist} showToast={showToast} scopeKey={scopeKey} onLogout={() => { setLoggedInMonitor(null); saveSession({ monitorId: null }); }} />
                    : <TeacherZoneView key={scopeKey} teacher={viewedTeacher || loggedInTeacher} db={db} persist={persist} showToast={showToast} scopeKey={scopeKey} grade={grade} roster={roster} enrollments={enrollments} accounts={accounts} persistAccounts={persistAccounts} onUpdateTeacher={(t) => { if (loggedInTeacher) setLoggedInTeacher(t); else setViewedTeacher(t); }} viewingAsAdmin={!!viewedTeacher} onLogout={() => { if (viewedTeacher) setViewedTeacher(null); else { setLoggedInTeacher(null); saveSession({ teacherId: null }); } }} />)
                : loggedInAdmin
                  ? <AdminTeacherPicker accounts={accounts} onSelect={(t) => setViewedTeacher(t)} />
                  : <TeacherZoneGate accounts={accounts} persistAccounts={persistAccounts} showToast={showToast} db={db} grade={grade} scopeKey={scopeKey} semester={semester} attemptLogin={attemptLogin} onOk={() => {}} />
            )}
          </div>
        </>
      )}
      {(loggedInTeacher || loggedInDepartment) && <TeacherPersonalAlertDock
        account={loggedInTeacher || { ...loggedInDepartment, accountType: "department" }}
        notices={db.staffNotices || []}
        announcements={db.announcements || {}}
        persist={persist}
        showToast={showToast}
        offsetTop={212}
      />}
      {loggedInStudent && <StudentPersonalAlertDock sid={loggedInStudent.id} result={buildPersonalTimetable(loggedInStudent.id)} offsetTop={88} />}
      <FeedbackLauncher
        feedback={db.feedback || []}
        persist={persist}
        showToast={showToast}
        reporter={feedbackReporter}
        context={{ section: activeSection, tab, grade, semester }}
      />
      {toast && <div style={{ ...styles.toast, background: toast.type === "error" ? "#b3401f" : toast.type === "success" ? "#3d5c3a" : "#2b2620" }}>{toast.msg}</div>}
    </div>
  );
}

function ClassMultiSelect({ value, onChange, classOptions, light, suffix = "반" }) {
  const selected = new Set((value || "").split(",").map(s => s.trim()).filter(Boolean));
  const toggle = (c) => {
    const s = new Set(selected);
    if (s.has(c)) s.delete(c); else s.add(c);
    onChange(Array.from(s).sort((a, b) => (isNaN(a) || isNaN(b)) ? a.localeCompare(b) : a - b).join(","));
  };
  if (!classOptions.length) return <div style={{ fontSize: 11.5, color: "#a39d8c" }}>선택 가능한 항목이 없습니다.</div>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {classOptions.map(c => (
        <button
          key={c} type="button" onClick={() => toggle(c)}
          style={{
            border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: light ? "5px 10px" : "3px 8px",
            fontSize: light ? 12 : 11, fontWeight: 700, cursor: "pointer",
            background: selected.has(c) ? COLORS.accent : "#fff", color: selected.has(c) ? "#fff" : "#8a8578",
          }}
        >{c}{suffix}</button>
      ))}
    </div>
  );
}

function AssignmentsEditor({ assignments, setAssignments, db, scopeKey, semesterLabel }) {
  const electiveSubjects = useMemo(() => extractElectiveSubjects(db, scopeKey), [db, scopeKey]);
  const commonSubjects = useMemo(() => extractCommonSubjects(db, scopeKey), [db, scopeKey]);
  const classOptions = useMemo(() => extractClasses(db, scopeKey), [db, scopeKey]);

  const addBlock = () => setAssignments([...assignments, { kind: "elective", subject: "", targets: "" }]);
  const updateBlock = (i, patch) => setAssignments(assignments.map((a, j) => j === i ? { ...a, ...patch } : a));
  const removeBlock = (i) => setAssignments(assignments.filter((_, j) => j !== i));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {semesterLabel && <div style={{ fontSize: 11, color: "#a39d8c" }}>{semesterLabel} 기준 과목 목록입니다.</div>}
      {assignments.map((a, i) => {
        const groupOptions = a.kind === "elective" && a.subject ? extractElectiveGroups(db, scopeKey, a.subject) : [];
        return (
          <div key={i} style={{ border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: 10, background: "#fff" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
              <select
                value={a.subject ? `${a.kind}::${a.subject}` : ""}
                onChange={e => { const [kind, subject] = e.target.value.split("::"); updateBlock(i, { kind, subject: subject || "", targets: "" }); }}
                style={{ ...styles.cellInput, border: `1px solid ${COLORS.line}`, borderRadius: 6, flex: 1, padding: "7px 8px" }}
              >
                <option value="">과목 선택</option>
                {electiveSubjects.length > 0 && <optgroup label="이동수업 과목">{electiveSubjects.map(s => <option key={"e" + s} value={`elective::${s}`}>{s}</option>)}</optgroup>}
                {commonSubjects.length > 0 && <optgroup label="공통과목">{commonSubjects.map(s => <option key={"c" + s} value={`common::${s}`}>{s}</option>)}</optgroup>}
              </select>
              <button style={styles.iconBtn} onClick={() => removeBlock(i)}><X size={14} /></button>
            </div>
            {a.subject && (
              a.kind === "common"
                ? <ClassMultiSelect value={a.targets} onChange={v => updateBlock(i, { targets: v })} classOptions={classOptions} suffix="반" />
                : <ClassMultiSelect value={a.targets} onChange={v => updateBlock(i, { targets: v })} classOptions={groupOptions} suffix="그룹" />
            )}
          </div>
        );
      })}
      <button style={styles.secondaryBtn} onClick={addBlock}>+ 과목 추가</button>
    </div>
  );
}

const ROLE_LABEL = { admin: "관리자", teacher: "선생님", department: "부서", monitor: "교과부장", classView: "학급별조회" };
function UnifiedLoginGate({ label, attemptLogin, showToast, satisfies, hint }) {
  const [id, setId] = useState(() => { try { return localStorage.getItem("kd_saved_login_id") || ""; } catch { return ""; } });
  const [pw, setPw] = useState(""), [err, setErr] = useState("");
  const [rememberId, setRememberId] = useState(() => { try { return !!localStorage.getItem("kd_saved_login_id"); } catch { return false; } });
  const submit = () => {
    const role = attemptLogin(id.trim(), pw);
    if (!role) { setErr("아이디 또는 비밀번호가 올바르지 않습니다."); return; }
    setErr("");
    try {
      if (rememberId) localStorage.setItem("kd_saved_login_id", id.trim());
      else localStorage.removeItem("kd_saved_login_id");
    } catch { /* localStorage unavailable */ }
    if (satisfies && !satisfies(role)) {
      showToast(`${ROLE_LABEL[role]} 계정으로 로그인되었습니다. 해당 메뉴에서 이용해주세요.`, "info");
    }
  };
  return (
    <div style={styles.loginBox}>
      <Lock size={22} color="#8a8578" />
      <div style={{ fontWeight: 700, marginTop: 10, fontSize: 15 }}>{label} 로그인</div>
      <div style={{ fontSize: 11.5, color: "#a39d8c", margin: "6px 0 0", textAlign: "center" }}>한 번 로그인하면 계정 종류에 맞는 모든 메뉴에 자동으로 접근할 수 있습니다.</div>
      {hint && <div style={{ fontSize: 12, color: "#8a8578", margin: "6px 0 0", textAlign: "center" }}>{hint}</div>}
      <div style={{ height: 14 }} />
      <input value={id} onChange={e => setId(e.target.value)} placeholder="아이디" style={styles.loginInput} onKeyDown={e => e.key === "Enter" && submit()} />
      <input value={pw} onChange={e => setPw(e.target.value)} placeholder="비밀번호" type="password" style={styles.loginInput} onKeyDown={e => e.key === "Enter" && submit()} />
      <label style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", margin: "-2px 0 7px", fontSize: 11.5, color: "#6f6a61", cursor: "pointer" }}>
        <input type="checkbox" checked={rememberId} onChange={e => setRememberId(e.target.checked)} /> 아이디 저장
      </label>
      {err && <div style={{ color: "#b3401f", fontSize: 12, marginBottom: 6 }}>{err}</div>}
      <button style={styles.primaryBtn} onClick={submit}><KeyRound size={14} /> 로그인</button>
    </div>
  );
}

function MonitorZoneView({ monitor, db, persist, showToast, scopeKey, onLogout }) {
  const targetKey = monitor.targetKey;
  const label = `${monitor.subject} (${monitor.group}그룹)`;
  const currentNotices = asNoticeArray((db.announcements[scopeKey] || {})[targetKey]);
  const [category, setCategory] = useState(NOTICE_CATEGORIES[0]);
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingStage, setSavingStage] = useState("");

  const writeNotices = async (updater) => {
    const current = db.announcements[scopeKey] || {};
    const list = asNoticeArray(current[targetKey]);
    const updated = { ...current, [targetKey]: updater(list) };
    return persist({ announcements: { ...db.announcements, [scopeKey]: updated } });
  };

  const addNotice = async () => {
    if (!text.trim()) { showToast("내용을 입력해주세요.", "error"); return; }
    setSaving(true);
    try {
      const newEntry = { id: Date.now() + "_" + Math.random().toString(36).slice(2, 7), category, text: text.trim(), dueDate: dueDate || null, teacherName: `${monitor.studentName} (교과부장)`, updatedAt: new Date().toISOString() };
      const ok = await writeNotices(list => [...list, newEntry]);
      if (ok) { showToast("저장했습니다.", "success"); setText(""); setDueDate(""); }
    } catch (e) {
      showToast(`오류가 발생했습니다: ${e.message}`, "error");
    }
    setSaving(false);
  };
  const deleteNotice = async (id) => {
    const ok = await writeNotices(list => list.filter(n => n.id !== id));
    if (ok) showToast("삭제했습니다.", "success");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div>
          <h1 style={styles.h1}>선생님 ZONE — 교과부장</h1>
          <p style={styles.pMuted}>{monitor.studentName} 학생 · {label}</p>
        </div>
        <button style={styles.secondaryBtn} onClick={onLogout}>로그아웃</button>
      </div>
      <div style={styles.card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>{label} 공지 작성</div>
        <div style={{ fontSize: 12.5, color: "#8a8578", marginBottom: 10 }}>이 항목은 {label}인 학생의 개인 시간표와 "이동수업반별 명단" 페이지에 표시됩니다.</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          {NOTICE_CATEGORIES.map(c => <button key={c} onClick={() => setCategory(c)} style={{ ...styles.classChip, ...(category === c ? styles.classChipActive : {}) }}>{c}</button>)}
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={5} style={styles.textareaInput} placeholder="예: 다음 시간 준비물을 챙겨주세요." />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: "#8a8578" }}>마감기한 (선택)</span>
          <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ ...styles.cellInput, border: `1px solid ${COLORS.line}`, borderRadius: 6, width: 160 }} />
          {dueDate && <button style={styles.iconBtn} onClick={() => setDueDate("")}><X size={13} /></button>}
        </div>
        <button style={{ ...styles.primaryBtn, marginTop: 10 }} onClick={addNotice} disabled={saving}>{saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} 공지 추가</button>
        {currentNotices.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>등록된 공지</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {currentNotices.slice().reverse().map(n => (
                <NoticeCard key={n.id} n={n} labelText={new Date(n.updatedAt).toLocaleString("ko-KR")} onDelete={() => deleteNotice(n.id)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminTeacherPicker({ accounts, onSelect }) {
  const teachers = (accounts.teacher || []).slice().sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return (
    <div style={styles.loginBox}>
      <Users size={22} color="#8a8578" />
      <div style={{ fontWeight: 700, marginTop: 10, fontSize: 15 }}>선생님 화면 보기</div>
      <div style={{ fontSize: 12, color: "#8a8578", margin: "6px 0 14px", textAlign: "center" }}>관리자 권한으로, 비밀번호 없이 선생님 계정 화면을 보고 관리할 수 있습니다.</div>
      {teachers.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "#a39d8c" }}>등록된 선생님 계정이 없습니다.</div>
      ) : (
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
          {teachers.map(t => (
            <button key={t.id} onClick={() => onSelect(t)} style={{ ...styles.matchItem, border: `1px solid ${COLORS.line}`, borderRadius: 8 }}>
              <span style={{ fontWeight: 700 }}>{t.name}</span>
              <span style={styles.matchMeta}>{t.homeroomClass ? `${t.homeroomClass}반 담임` : ""}{t.homeroomClass && (t.assignments || []).length ? " · " : ""}{(t.assignments || []).map(a => a.subject).join(", ")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


function TeacherZoneGate({ accounts, persistAccounts, showToast, db, grade, scopeKey, semester, attemptLogin }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [id, setId] = useState(""), [pw, setPw] = useState(""), [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [assignments, setAssignments] = useState([{ kind: "elective", subject: "", targets: "" }]);
  const [homeroomClass, setHomeroomClass] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submitLogin = () => {
    const role = attemptLogin(id.trim(), pw);
    if (role) { setErr(""); }
    else setErr("아이디 또는 비밀번호가 올바르지 않습니다. (승인 대기 중일 수 있습니다)");
  };

  const submitSignup = async () => {
    const validAssignments = assignments.filter(a => a.subject && a.targets.trim());
    if (!name.trim() || !id.trim() || !pw) { showToast("이름·아이디·비밀번호를 입력해주세요.", "error"); return; }
    if (!homeroomClass && !validAssignments.length) { showToast("학급담임 반 또는 담당 과목을 하나 이상 선택해주세요.", "error"); return; }
    const idTaken = [...(accounts.teacher || []), ...(accounts.teacherPending || [])].some(a => a.id === id.trim());
    if (idTaken) { showToast("이미 사용 중인 아이디입니다.", "error"); return; }
    const req = applyAutomaticTeacherAccess({
      id: id.trim(), pw, name: name.trim(), homeroomClass, assignments: validAssignments,
      teacherRole: homeroomClass ? "homeroom" : "other", roleGrade: grade,
      gradeAccessGrades: [], timetableAccessGrades: [],
    }, grade);
    const ok = await persistAccounts({ ...accounts, teacherPending: [...(accounts.teacherPending || []), req] });
    if (ok) { setSubmitted(true); showToast("가입 신청이 접수되었습니다.", "success"); }
  };

  if (submitted) {
    return (
      <div style={styles.loginBox}>
        <Check size={22} color="#3d5c3a" />
        <div style={{ fontWeight: 700, marginTop: 10, fontSize: 15 }}>가입 신청 완료</div>
        <div style={{ fontSize: 12.5, color: "#8a8578", margin: "8px 0 0", textAlign: "center" }}>관리자 승인 후 로그인하실 수 있습니다.</div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.loginBox, maxWidth: mode === "signup" ? 420 : 320 }}>
      <Lock size={22} color="#8a8578" />
      <div style={{ fontWeight: 700, marginTop: 10, fontSize: 15 }}>선생님 ZONE</div>
      <div style={{ display: "flex", gap: 4, margin: "10px 0" }}>
        <button style={{ ...styles.scopeBtn, ...(mode === "login" ? styles.scopeBtnActive : {}) }} onClick={() => setMode("login")}>로그인</button>
        <button style={{ ...styles.scopeBtn, ...(mode === "signup" ? styles.scopeBtnActive : {}) }} onClick={() => setMode("signup")}>회원가입</button>
      </div>
      {mode === "login" ? (
        <>
          <select
            value={id}
            onChange={e => setId(e.target.value)}
            style={styles.loginInput}
          >
            <option value="">— 이름 선택 —</option>
            {(accounts.teacher || []).slice().sort((a, b) => a.name.localeCompare(b.name, "ko")).map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <input value={pw} onChange={e => setPw(e.target.value)} placeholder="비밀번호" type="password" style={styles.loginInput} onKeyDown={e => e.key === "Enter" && submitLogin()} />
          {err && <div style={{ color: "#b3401f", fontSize: 12, marginBottom: 6 }}>{err}</div>}
          <button style={styles.primaryBtn} onClick={submitLogin}><KeyRound size={14} /> 로그인</button>
        </>
      ) : (
        <div style={{ width: "100%" }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="이름" style={styles.loginInput} />
          <input value={id} onChange={e => setId(e.target.value)} placeholder="사용할 아이디" style={styles.loginInput} />
          <input value={pw} onChange={e => setPw(e.target.value)} placeholder="사용할 비밀번호" type="password" style={styles.loginInput} />
          <div style={{ textAlign: "left", marginTop: 6 }}>
            <div style={{ fontSize: 11.5, color: "#8a8578", margin: "8px 0 6px" }}>학급담임 (담당 반, 해당 시에만 선택)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
              <button type="button" onClick={() => setHomeroomClass("")} style={{ ...styles.classChip, padding: "5px 10px", fontSize: 12, ...(!homeroomClass ? styles.classChipActive : {}) }}>없음</button>
              {extractClasses(db, scopeKey).map(c => (
                <button key={c} type="button" onClick={() => setHomeroomClass(c)} style={{ ...styles.classChip, padding: "5px 10px", fontSize: 12, ...(homeroomClass === c ? styles.classChipActive : {}) }}>{c}반</button>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: "#8a8578", marginBottom: 6 }}>교과담당 과목 (해당 시에만 추가)</div>
            <AssignmentsEditor assignments={assignments} setAssignments={setAssignments} db={db} scopeKey={scopeKey} semesterLabel={`${grade}학년 ${semester === "sem2" ? "2학기" : "1학기"}`} />
          </div>
          <button style={{ ...styles.primaryBtn, marginTop: 12 }} onClick={submitSignup}>가입 신청</button>
        </div>
      )}
    </div>
  );
}

function StaffStudentWorkspaceBar({
  allRosters,
  allowedGrades,
  selectedSid,
  query,
  onQueryChange,
  onSelect,
  activeView,
  onViewChange,
}) {
  const mergedStudents = useMemo(() => {
    const map = new Map();
    Object.entries(allRosters || {}).forEach(([scope, scopeRoster]) => {
      const scopeGrade = String(scope).split("-")[0];
      if (allowedGrades?.length && !allowedGrades.map(String).includes(scopeGrade)) return;
      Object.entries(scopeRoster || {}).forEach(([sid, student]) => {
        if (!map.has(sid)) map.set(sid, { ...student, sid, grade: scopeGrade });
      });
    });
    return Array.from(map.values());
  }, [allRosters, allowedGrades]);
  const matches = useMemo(() => {
    const q = String(query || "").trim().toLowerCase();
    if (!q || selectedSid) return [];
    return mergedStudents.filter(student => (
      student.sid.includes(q)
      || String(student.name || "").toLowerCase().includes(q)
      || `${student.class}반${student.number}번`.includes(q.replace(/\s/g, ""))
    )).slice(0, 8);
  }, [mergedStudents, query, selectedSid]);
  return <div className="no-print" style={styles.workspaceBarWrap}>
    <div style={styles.workspaceBarInner}>
      <div style={styles.workspaceSearchWrap}>
        <Search size={16} color="#788397" />
        <input value={query || ""} onChange={event => onQueryChange(event.target.value)} placeholder="학생 학번·이름 통합 검색" style={styles.workspaceSearchInput} />
        {query && <button type="button" onClick={() => { onQueryChange(""); onSelect(null); }} style={styles.workspaceClearBtn}><X size={14} /></button>}
        {matches.length > 0 && <div style={styles.workspaceMatches}>{matches.map(student => <button key={student.sid} type="button" onClick={() => onSelect(student.sid)} style={styles.workspaceMatchItem}><b>{student.name}</b><span>{student.grade}학년 {student.class}반 {student.number}번 · {student.sid}</span></button>)}</div>}
      </div>
      <div style={styles.workspaceViewTabs}>
        {[['grades','성적 리포트'],['admission','대학 지원 진단'],['consultation','상담·관심 대학'],['timetable','개인 시간표']].map(([key,label]) => <button key={key} type="button" onClick={() => onViewChange(key)} style={{ ...styles.workspaceViewBtn, ...(activeView === key ? styles.workspaceViewBtnActive : {}) }}>{label}</button>)}
      </div>
      <div style={styles.workspaceStudentState}>{selectedSid ? <><span>선택 학생</span><strong>{selectedSid}</strong></> : <span>학생을 검색해 세 화면을 연속 조회하세요.</span>}</div>
    </div>
  </div>;
}

function MegaNav({ active, onSwitch, onLogout, showAdmin }) {
  const items = [
    { key: "grades", label: "성적", icon: "📊" },
    { key: "timetable", label: "시간표", icon: "🗓️" },
    ...(showAdmin ? [{ key: "admin", label: "관리자", icon: "⚙️" }] : []),
  ];
  return (
    <div className="no-print" style={megaNavStyles.wrap}>
      <div style={megaNavStyles.inner}>
        <div style={megaNavStyles.brand}>
          <span style={{ width: 34, height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 11, color: "#fff", background: "linear-gradient(135deg,#2f6fb0,#7167b5)", boxShadow: "0 7px 18px rgba(55,83,150,0.24)" }}><Sparkles size={17} /></span>
          <span style={{ fontWeight: 900, fontSize: 14.5 }}>광덕고 성적/시간표</span>
        </div>
        <div style={megaNavStyles.tabs}>
          {items.map(it => (
            <button
              key={it.key}
              onClick={() => onSwitch(it.key)}
              style={{ ...megaNavStyles.tab, ...(active === it.key ? megaNavStyles.tabActive : {}) }}
            >
              <span style={{ marginRight: 6 }}>{it.icon}</span>{it.label}
            </button>
          ))}
        </div>
        <button style={styles.secondaryBtn} onClick={onLogout}>로그아웃</button>
      </div>
    </div>
  );
}
const megaNavStyles = {
  wrap: { position: "sticky", top: 0, zIndex: 40, background: "linear-gradient(90deg,rgba(255,255,255,.96),rgba(246,249,255,.96),rgba(250,247,255,.96))", backdropFilter: "blur(16px)", borderBottom: "1px solid #dce4f0", boxShadow: "0 8px 28px rgba(55,72,110,0.09)" },
  inner: { maxWidth: 1120, margin: "0 auto", padding: "9px 20px", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" },
  brand: { display: "flex", alignItems: "center", gap: 10, marginRight: 8, fontWeight: 900, letterSpacing: "-0.3px" },
  tabs: { display: "flex", gap: 6, flex: 1, alignItems: "center" },
  tab: { border: "1px solid transparent", background: "transparent", padding: "9px 15px", borderRadius: 11, fontSize: 13.2, fontWeight: 850, color: "#677386", cursor: "pointer", transition: "all 0.16s ease" },
  tabActive: { color: "#244f86", background: "linear-gradient(135deg,#e9f4ff,#f2edff)", borderColor: "#cbdcf2", boxShadow: "0 5px 15px rgba(55,83,150,0.14)" },
};

function TopBar({ tab, setTab, grade, setGrade, semester, setSemester, meta, onBackToSections, canViewStudentTools = true, allowedGrades = null, compact = false }) {
  const navigation = <nav style={{ ...styles.nav, ...(compact ? styles.navCompact : {}) }}>
    {onBackToSections && <NavBtn active={false} onClick={onBackToSections} icon={<ArrowRight size={15} style={{ transform: "rotate(180deg)" }} />} label="메뉴로" />}
    {canViewStudentTools && <NavBtn active={tab === "student"} onClick={() => setTab("student")} icon={<Search size={15} />} label="학생 조회" />}
    {canViewStudentTools && <NavBtn active={tab === "classPrint"} onClick={() => setTab("classPrint")} icon={<Users size={15} />} label="학급별 조회" />}
    {canViewStudentTools && <NavBtn active={tab === "subjectGroup"} onClick={() => setTab("subjectGroup")} icon={<ClipboardList size={15} />} label="이동수업반별 명단" />}
    <NavBtn active={tab === "teacherZone"} onClick={() => setTab("teacherZone")} icon={<Lock size={15} />} label="선생님 ZONE" />
  </nav>;
  const scopes = <>
    <ScopeGroup label="학년">{GRADES.map(g => {
      const permissionDisabled = Array.isArray(allowedGrades) && !allowedGrades.map(String).includes(String(g));
      const disabled = DISABLED_GRADES.includes(g) || permissionDisabled;
      return <ScopeBtn key={g} active={grade === g} disabled={disabled} onClick={() => setGrade(g)}>{g}학년{DISABLED_GRADES.includes(g) ? " (준비중)" : permissionDisabled ? " (권한없음)" : ""}</ScopeBtn>;
    })}</ScopeGroup>
    <ScopeGroup label="학기"><ScopeBtn active={semester === "sem1"} onClick={() => setSemester("sem1")}>1학기</ScopeBtn><ScopeBtn active={semester === "sem2"} onClick={() => setSemester("sem2")}>2학기</ScopeBtn></ScopeGroup>
  </>;
  if (compact) return (
    <div style={{ ...styles.topbar, ...styles.topbarCompact }} className="no-print">
      <div style={styles.compactToolbarSingle}>
        <div style={styles.compactMenuGroup}>{navigation}</div>
        <span style={styles.compactToolbarDivider} />
        <div style={styles.compactScopeGroup}>{scopes}</div>
      </div>
    </div>
  );
  return (
    <div style={styles.topbar} className="no-print">
      <div style={styles.topbarRow}>
        <div style={styles.brand}>
          <span style={{ width: 34, height: 34, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 11, color: "#fff", background: "linear-gradient(135deg,#2f6fb0,#7167b5)", boxShadow: "0 6px 14px rgba(49,91,56,0.20)" }}><Sparkles size={17} /></span>
          <div>
            <div style={{ ...styles.brandTitle, fontWeight: 900 }}>{SITE_TITLE}</div>
            <div style={styles.brandSub}>{meta?.updatedAt ? `최근 업데이트 · ${new Date(meta.updatedAt).toLocaleString("ko-KR")}` : "데이터 없음"}</div>
          </div>
        </div>
        {navigation}
      </div>
      <div style={styles.scopeRow}>{scopes}</div>
    </div>
  );
}
function AdminTemplateDownloads({ showToast }) {
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosis, setDiagnosis] = useState(null);

  const downloadWorkbook = async (type) => {
    try {
      const XLSX = await loadXLSX();
      const workbook = XLSX.utils.book_new();
      const addSheet = (name, rows, widths = []) => {
        const sheet = XLSX.utils.aoa_to_sheet(rows);
        if (widths.length) sheet["!cols"] = widths.map(width => ({ wch: width }));
        XLSX.utils.book_append_sheet(workbook, sheet, name.slice(0, 31));
      };
      let fileName = "광덕고_업로드양식.xlsx";
      if (type === "teacher") {
        fileName = "선생님_계정_업로드양식.xlsx";
        addSheet("선생님 계정", [
          ["이름", "아이디", "비밀번호", "학교역할", "담당학년", "담임반", "성적조회학년", "시간표조회학년", "담당과목", "대상반"],
          ["홍길동", "teacher01", "kd2026", "그외", "2", "", "2", "2", "대수", "1,2,3"],
          ["김담임", "teacher02", "kd2026", "학급담임", "2", "4", "", "", "", ""],
        ], [14, 16, 14, 13, 10, 10, 16, 16, 18, 16]);
        addSheet("작성 안내", [["학교역할", "학급담임 / 학년부장 / 그외 중 하나"], ["권한 학년", "여러 학년은 1,2처럼 쉼표로 구분"], ["담당과목·대상반", "여러 과목은 행을 나누어 등록하거나 홈페이지에서 추가 수정"]], [22, 58]);
      } else if (type === "student") {
        fileName = "학생_계정_업로드양식.xlsx";
        addSheet("학생 계정", [["학번", "이름", "초기비밀번호", "학년", "반", "번호", "입학연도"], [20824, "김예환", "kd2026", 2, 8, 24, 2025]], [12, 14, 16, 9, 9, 9, 12]);
      } else if (type === "roster") {
        fileName = "이동수업_명단_업로드양식.xlsx";
        addSheet("학생 명단", [["학번", "이름", "원소속반", "번호", "과목", "분반", "개설반"], [20824, "김예환", 8, 24, "대수", "A", 4]], [12, 14, 12, 9, 18, 10, 10]);
      } else if (type === "grades") {
        fileName = "성적_통합_업로드양식.xlsx";
        addSheet("1-1 성적", [["학번", "이름", "반", "번호", "과목", "학점", "원점수", "성취도", "석차등급", "석차", "수강자수", "과목유형"], [10801, "학생예시", 8, 1, "공통수학1", 4, 92, "A", 1, 5, 238, "공통과목"]], [12, 14, 8, 8, 20, 8, 10, 10, 12, 9, 11, 13]);
        addSheet("2학년 3월 모의고사", [["학번", "이름", "반", "번호", "국어 등급", "국어 원점수", "수학 등급", "수학 원점수", "영어 등급", "영어 원점수", "한국사 등급", "통합사회 등급", "통합과학 등급"], [20801, "학생예시", 8, 1, 2, 88, 3, 81, 2, 90, 2, 2, 3]], [12, 14, 8, 8, 12, 13, 12, 13, 12, 13, 13, 15, 15]);
        addSheet("업로드 안내", [["시트명", "예: 1-1 성적, 2-1 성적, 2학년 3월 모의고사"], ["대용량 저장", "V20부터 Firestore 문서 제한을 피하도록 자동 분할 저장됩니다."]], [20, 64]);
      } else if (type === "admission") {
        fileName = "대입전형표_업로드양식.xlsx";
        addSheet("대입 전형", [["대학교", "지역", "계열구분", "모집단위", "전형", "교과반영비율", "공통과목 반영여부", "일반선택 반영여부", "진로선택 반영여부", "융합선택 반영여부", "수능최저", "반영과목", "전형특이사항"], ["광덕대학교", "경기", "자연", "전체 모집단위", "지역균형", "교과 90% + 출결 10%", "석차등급", "석차등급", "성취도", "성취도", "2합 6", "국,수,영,(사,과)", "예시 문구"]], [18, 10, 12, 22, 18, 22, 18, 18, 18, 18, 13, 22, 38]);
      }
      XLSX.writeFile(workbook, fileName);
      showToast(`${fileName} 다운로드를 시작했습니다.`, "success");
    } catch (error) {
      showToast(`양식 생성 실패: ${error?.message || error}`, "error");
    }
  };

  const runDiagnosis = async () => {
    setDiagnosing(true);
    setDiagnosis(null);
    const result = await diagnoseStorageConnection();
    setDiagnosis(result);
    showToast(result.ok ? "Firebase Storage 연결이 정상입니다." : `Storage 연결 실패: ${result.code || result.error}`, result.ok ? "success" : "error");
    setDiagnosing(false);
  };

  const items = [
    ["teacher", "선생님 계정", "교직원 계정과 역할·권한 일괄 등록"],
    ["student", "학생 계정", "학번·이름·초기비밀번호·반·번호"],
    ["roster", "이동수업 명단", "과목·분반·개설반 명단"],
    ["grades", "성적·모의고사", "학기 성적과 모의고사 원점수·등급 예시"],
    ["admission", "대입 전형표", "최저·반영과목·선택과목 반영 방식"],
  ];
  return (
    <div>
      <div style={accountConsole.panel}>
        <div style={accountConsole.panelHeader}><div><div style={accountConsole.panelTitle}>엑셀 업로드 양식 다운로드</div><div style={accountConsole.panelDescription}>홈페이지에서 읽을 수 있는 열 이름이 포함된 기본 양식입니다. 예시 행을 삭제한 뒤 실제 자료를 입력하세요.</div></div></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
          {items.map(([key, title, description]) => <button key={key} type="button" onClick={() => downloadWorkbook(key)} style={accountConsole.templateCard}><FileSpreadsheet size={20} color="#3d5c3a" /><span style={{ fontWeight: 900 }}>{title} 양식</span><small>{description}</small><span style={accountConsole.templateAction}><Download size={13} /> XLSX 다운로드</span></button>)}
        </div>
      </div>
      <div style={accountConsole.panel}>
        <div style={accountConsole.panelHeader}><div><div style={accountConsole.panelTitle}>첨부파일 저장소 연결 진단</div><div style={accountConsole.panelDescription}>작은 테스트 파일을 업로드한 뒤 즉시 삭제하여 Firebase Storage·익명 인증·규칙이 실제로 동작하는지 확인합니다.</div></div></div>
        <button style={styles.primaryBtn} onClick={runDiagnosis} disabled={diagnosing}>{diagnosing ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} Storage 연결 테스트</button>
        {diagnosis && <div style={{ ...(diagnosis.ok ? styles.okBanner : styles.warnBanner), marginTop: 12 }}>{diagnosis.ok ? <Check size={14} /> : <AlertTriangle size={14} />}{diagnosis.ok ? `정상 · ${diagnosis.bucket}${diagnosis.authenticated ? " · 익명 인증 연결" : ""}` : `${diagnosis.code || "오류"} · ${diagnosis.error}`}</div>}
      </div>
    </div>
  );
}

function ScopeGroup({ label, children }) { return <div style={styles.scopeGroup}><span style={styles.scopeLabel}>{label}</span><div style={styles.scopeBtnRow}>{children}</div></div>; }
function ScopeBtn({ active, onClick, children, disabled }) { return <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{ ...styles.scopeBtn, ...(active && !disabled ? styles.scopeBtnActive : {}), ...(disabled ? styles.scopeBtnDisabled : {}) }}>{children}</button>; }
function NavBtn({ active, onClick, icon, label }) { return <button onClick={onClick} style={{ ...styles.navBtn, ...(active ? styles.navBtnActive : {}) }}>{icon}<span>{label}</span></button>; }

function EmptyState() { return <div style={styles.emptyBox}><Database size={28} color="#c4bfae" /><div style={{ fontWeight: 700, marginTop: 10 }}>등록된 데이터가 없습니다</div><div style={{ fontSize: 13, color: "#8a8578", marginTop: 4 }}>관리자 탭에서 이동수업 명단(엑셀)과 학급 시간표(한글/엑셀)를 업로드하면 조회가 가능해집니다.</div></div>; }

function StudentOwnTimetable({ student, build, grade, setGrade }) {
  const result = build(student.id);
  return (
    <div>
      {!result ? (
        <div style={{ fontSize: 13, color: "#8a8578" }}>아직 {grade}학년 시간표 데이터가 준비되지 않았습니다. 학년을 바꿔서 확인해보세요.</div>
      ) : (
        <TimetableCard result={result} sid={student.id} />
      )}
      <div style={{ marginTop: 12 }}>
        <ScopeGroup label="학년">{GRADES.map(g => <ScopeBtn key={g} active={grade === g} disabled={DISABLED_GRADES.includes(g)} onClick={() => setGrade(g)}>{g}학년{DISABLED_GRADES.includes(g) ? " (준비중)" : ""}</ScopeBtn>)}</ScopeGroup>
      </div>
    </div>
  );
}

function StudentView({
  roster,
  build,
  hasAnyData,
  selectedSid,
  onSelectedSidChange,
  sharedQuery,
  onSharedQueryChange,
}) {
  const [localQuery, setLocalQuery] = useState("");
  const [localSid, setLocalSid] = useState(null);
  const controlledSid = selectedSid !== undefined;
  const controlledQuery = sharedQuery !== undefined;
  const sid = controlledSid ? selectedSid : localSid;
  const query = controlledQuery ? sharedQuery : localQuery;
  const setSid = value => controlledSid ? onSelectedSidChange?.(value) : setLocalSid(value);
  const setQuery = value => controlledQuery ? onSharedQueryChange?.(value) : setLocalQuery(value);
  useEffect(() => {
    const exactId = query.trim();
    if (!sid && exactId && roster?.[exactId]) setSid(exactId);
  }, [query, sid, roster]); // eslint-disable-line

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim();
    return Object.entries(roster).filter(([id, student]) => (
      id.includes(q)
      || (student.name || "").includes(q)
      || `${student.class}반${student.number}번`.includes(q.replace(/\s/g, ""))
    )).slice(0, 8);
  }, [query, roster]);
  const result = sid ? build(sid) : null;
  if (!hasAnyData) return <EmptyState />;
  return (
    <div>
      <div className="no-print">
        <h1 style={styles.h1}>학생 시간표 조회</h1>
        <p style={styles.pMuted}>학번, 이름, 또는 "3반 12번"처럼 입력해 검색하세요.</p>
        <div style={styles.searchBox}>
          <Search size={16} color="#a39d8c" />
          <input
            value={query}
            onChange={event => {
              const nextValue = event.target.value;
              setQuery(nextValue);
              const trimmed = nextValue.trim();
              if (!/^\d{5}$/.test(trimmed) && trimmed !== String(sid || "")) setSid(null);
            }}
            placeholder="예: 20401, 홍길동"
            style={styles.searchInput}
          />
          {query && <X size={16} color="#a39d8c" style={{ cursor: "pointer" }} onClick={() => { setQuery(""); setSid(null); }} />}
        </div>
        {matches.length > 0 && !sid && (
          <div style={styles.matchList}>
            {matches.map(([id, student]) => (
              <button key={id} style={styles.matchItem} onClick={() => { setSid(id); setQuery(id); }}>
                <span style={{ fontWeight: 600 }}>{student.name}</span>
                <span style={styles.matchMeta}>{student.class}반 {student.number}번 · {id}</span>
              </button>
            ))}
          </div>
        )}
        {query && matches.length === 0 && !sid && <div style={{ fontSize: 12.5, color: "#a39d8c", marginTop: 8 }}>일치하는 학생이 없습니다.</div>}
      </div>
      {sid && !result && <div style={styles.warnBanner}><AlertTriangle size={14} /> 선택한 학생의 현재 학년·학기 시간표 데이터가 없습니다.</div>}
      {result && <TimetableCard result={result} sid={sid} />}
    </div>
  );
}

function ClassPrintView({ roster, build, hasAnyData, onLogout }) {
  const classes = useMemo(() => Array.from(new Set(Object.values(roster).map(r => r.class))).sort((a, b) => a - b), [roster]);
  const [sel, setSel] = useState(null);
  useEffect(() => { if (classes.length && (sel === null || !classes.includes(sel))) setSel(classes[0]); }, [classes]); // eslint-disable-line
  const students = useMemo(() => Object.entries(roster).filter(([, s]) => s.class === sel).sort((a, b) => a[1].number - b[1].number), [roster, sel]);
  if (!hasAnyData) return <EmptyState />;
  return (
    <div>
      <div className="no-print">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={styles.h1}>학급별 일괄 조회</h1>
            <p style={styles.pMuted}>학급을 선택하면 그 반 학생 전체의 시간표를 인쇄할 수 있습니다.</p>
          </div>
          {onLogout && <button style={styles.secondaryBtn} onClick={onLogout}>로그아웃</button>}
        </div>
        <div style={styles.classChips}>{classes.map(c => <button key={c} onClick={() => setSel(c)} style={{ ...styles.classChip, ...(sel === c ? styles.classChipActive : {}) }}>{c}반</button>)}</div>
        {sel != null && <div style={styles.printBar}><div style={{ color: "#8a8578", fontSize: 13 }}>{sel}반 학생 {students.length}명</div><button type="button" style={styles.printBtn} onClick={() => window.print()}><Printer size={14} /> {sel}반 전체 인쇄</button></div>}
      </div>
      <div id="print-area">{sel != null && students.map(([id]) => { const r = build(id); return r ? <div key={id} className="print-page-break"><TimetableCard result={r} sid={id} /></div> : null; })}</div>
    </div>
  );
}

function SubjectGroupView({ roster, enrollments, hasAnyData, announcements }) {
  const bySubject = useMemo(() => {
    const m = {};
    Object.entries(enrollments).forEach(([sid, list]) => {
      list.forEach(c => {
        const key = `${c.subject} (${c.group}) · ${c.hostClass}반개설`;
        if (!m[key]) m[key] = { subject: c.subject, group: c.group, students: [] };
        m[key].students.push({ sid, ...(roster[sid] || {}) });
      });
    });
    Object.values(m).forEach(v => v.students.sort((a, b) => (a.class - b.class) || (a.number - b.number)));
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0], "ko"));
  }, [enrollments, roster]);
  const [sel, setSel] = useState(null);
  useEffect(() => { if (bySubject.length && (sel === null || !bySubject.find(([k]) => k === sel))) setSel(bySubject[0][0]); }, [bySubject]); // eslint-disable-line
  const selected = (bySubject.find(([k]) => k === sel) || [null, null])[1];
  const notices = selected ? (announcements || {})[targetKeyFor("elective", selected.subject, selected.group)] || [] : [];
  if (!hasAnyData) return <EmptyState />;
  return (
    <div>
      <div className="no-print">
        <h1 style={styles.h1}>이동수업반별 명단 확인하기</h1>
        <p style={styles.pMuted}>이동수업 과목·그룹을 선택하면 그 수업을 듣는 학생 명단(원소속반 포함)을 확인하고 인쇄할 수 있습니다.</p>
        <select value={sel || ""} onChange={e => setSel(e.target.value)} style={{ ...styles.loginInput, maxWidth: 420, marginBottom: 12 }}>
          {bySubject.map(([key, v]) => <option key={key} value={key}>{key} — {v.students.length}명</option>)}
        </select>
        {selected && <div style={styles.printBar}><div style={{ color: "#8a8578", fontSize: 13 }}>{sel} · {selected.students.length}명</div><button type="button" style={styles.printBtn} onClick={() => window.print()}><Printer size={14} /> 명단 인쇄</button></div>}
      </div>
      <div id="print-area">
        {selected && (
          <div style={styles.subjectRosterCard}>
            <div style={styles.subjectRosterHeader}><div style={{display:"grid",gap:3}}><span style={{fontSize:10.5,fontWeight:850,opacity:.78,letterSpacing:".04em"}}>이동수업 출석부</span><strong style={{fontSize:18}}>{sel}</strong></div><em style={{fontStyle:"normal",fontSize:13,fontWeight:900,padding:"5px 9px",borderRadius:999,background:"rgba(255,255,255,.16)",border:"1px solid rgba(255,255,255,.22)"}}>{selected.students.length}명</em></div>
            {notices.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                {notices.map((n, i) => {
                  const cat = NOTICE_CATEGORY_COLOR[n.category] || NOTICE_CATEGORY_COLOR["공지"];
                  return (
                    <div key={i} style={{ background: cat.bg, border: `1px solid ${cat.border}`, borderRadius: 8, padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color: cat.text, background: "#fff", border: `1px solid ${cat.border}`, borderRadius: 4, padding: "1px 6px" }}>{n.category || "공지"}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: cat.text }}>{n.teacherName ? `${n.teacherName} 선생님` : "공지"}</span>
                      </div>
                      {n.title && <div style={{ fontSize: 13, fontWeight: 900, color: cat.text, marginBottom: n.text ? 4 : 0 }}>{n.title}</div>}
                      {n.text && <div style={{ fontSize: 12.5, color: cat.text, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{n.text}</div>}
                      <AttachmentLinks attachments={n.attachments} />
                    </div>
                  );
                })}
              </div>
            )}
            <table className="subject-roster-table" style={styles.subjectRosterTable}>
              <thead><tr><th>학번</th><th>이름</th><th>원소속반</th><th>번호</th></tr></thead>
              <tbody>{selected.students.map((student,index) => <tr key={student.sid}><td>{student.sid}</td><td><b>{student.name}</b></td><td><span>{student.class}반</span></td><td>{student.number}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TeacherZoneView({ teacher, db, persist, showToast, scopeKey, grade, onLogout, roster, enrollments, accounts, persistAccounts, onUpdateTeacher, viewingAsAdmin }) {
  const [editingProfile, setEditingProfile] = useState(false);

  const flatTargets = useMemo(() => {
    const out = [];
    if (teacher.homeroomClass) out.push({ kind: "homeroom", target: teacher.homeroomClass, label: `${teacher.homeroomClass}반`, categories: HOMEROOM_CATEGORIES });
    const subjects = new Map();
    (teacher.assignments || []).forEach(assignment => {
      const subject = String(assignment.subject || "").trim();
      if (!subject) return;
      if (!subjects.has(subject)) subjects.set(subject, { kind: "subject", subject, target: "ALL", label: `${subject} 전체 수강생`, categories: NOTICE_CATEGORIES });
    });
    out.push(...Array.from(subjects.values()).sort((a, b) => a.subject.localeCompare(b.subject, "ko")));
    return out;
  }, [teacher]);

  const homeroomTargets = flatTargets.filter(target => target.kind === "homeroom");
  const subjectTargets = flatTargets.filter(target => target.kind === "subject");
  const initialMode = homeroomTargets.length ? "homeroom" : subjectTargets.length ? "subject" : "manage";
  const [zoneMode, setZoneMode] = useState(initialMode);
  const [selectedTargetToken, setSelectedTargetToken] = useState("");
  const activeTargets = zoneMode === "homeroom" ? homeroomTargets : zoneMode === "subject" ? subjectTargets : [];
  const targetTokenFor = target => `${target.kind}::${target.subject || ""}::${target.target}`;

  useEffect(() => {
    if (zoneMode === "homeroom" && !homeroomTargets.length) setZoneMode(subjectTargets.length ? "subject" : "manage");
    if (zoneMode === "subject" && !subjectTargets.length) setZoneMode(homeroomTargets.length ? "homeroom" : "manage");
  }, [zoneMode, homeroomTargets.length, subjectTargets.length]);

  useEffect(() => {
    if (!activeTargets.length) { setSelectedTargetToken(""); return; }
    const selectionIsValid = activeTargets.some(target => targetTokenFor(target) === selectedTargetToken);
    if (selectionIsValid) return;
    // 대상이 하나뿐이면 바로 작성할 수 있게 선택하고, 여러 개이면 사용자가 먼저 대상을 고르게 합니다.
    setSelectedTargetToken(activeTargets.length === 1 ? targetTokenFor(activeTargets[0]) : "");
  }, [zoneMode, flatTargets, selectedTargetToken]); // eslint-disable-line

  const sel = activeTargets.find(target => targetTokenFor(target) === selectedTargetToken) || null;
  const categories = sel?.categories || NOTICE_CATEGORIES;
  const targetKey = sel ? (sel.kind === "homeroom" ? homeroomKeyFor(sel.target) : subjectKeyFor(sel.subject)) : null;
  const currentNotices = targetKey ? asNoticeArray((db.announcements[scopeKey] || {})[targetKey]) : [];
  const currentLegacyMaterials = targetKey ? asMaterialArray((db.materials?.[scopeKey] || {})[targetKey]) : [];

  const [category, setCategory] = useState(categories[0] || "공지");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [noticeFiles, setNoticeFiles] = useState([]);
  const [noticeLinks, setNoticeLinks] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingStage, setSavingStage] = useState("");
  const [attachmentDiagnostic, setAttachmentDiagnostic] = useState(null);
  const [diagnosingAttachment, setDiagnosingAttachment] = useState(false);
  const noticeFileRef = useRef(null);

  useEffect(() => {
    setCategory(categories[0] || "공지");
    setTitle(""); setText(""); setDueDate(""); setNoticeFiles([]); setNoticeLinks("");
    if (noticeFileRef.current) noticeFileRef.current.value = "";
  }, [targetKey]); // eslint-disable-line

  const authoredNotices = useMemo(() => {
    const rows = [];
    Object.entries(db.announcements || {}).forEach(([noticeScopeKey, targetMap]) => {
      Object.entries(targetMap || {}).forEach(([noticeTargetKey, rawList]) => {
        asNoticeArray(rawList).forEach(notice => {
          if (!noticeAuthoredBy(notice, teacher)) return;
          rows.push({
            scopeKey: noticeScopeKey,
            targetKey: noticeTargetKey,
            targetLabel: describeNoticeTarget(noticeTargetKey, notice.targetLabel),
            notice,
          });
        });
      });
    });
    return rows.sort((a, b) => String(b.notice.updatedAt || "").localeCompare(String(a.notice.updatedAt || "")));
  }, [db.announcements, teacher]);

  const removeNoticeAt = async item => {
    const noticeScopeKey = item.scopeKey;
    const noticeTargetKey = item.targetKey;
    const notice = item.notice;
    const scopeAnnouncements = db.announcements?.[noticeScopeKey] || {};
    const nextScope = {
      ...scopeAnnouncements,
      [noticeTargetKey]: asNoticeArray(scopeAnnouncements[noticeTargetKey]).filter(entry => entry.id !== notice.id),
    };
    const nextAnnouncements = { ...db.announcements, [noticeScopeKey]: nextScope };
    const ok = await persist({ announcements: nextAnnouncements });
    if (!ok) return;
    const referencedPaths = new Set();
    Object.values(nextAnnouncements).forEach(targetMap => {
      Object.values(targetMap || {}).forEach(rawList => {
        asNoticeArray(rawList).forEach(entry => (entry.attachments || []).forEach(file => {
          if (file.path || file.dataKey) referencedPaths.add(file.path || file.dataKey);
        }));
      });
    });
    const removableFiles = (notice.attachments || []).filter(file => (file.path || file.dataKey) && !referencedPaths.has(file.path || file.dataKey));
    const deleted = await Promise.all(removableFiles.map(file => deleteClassroomAttachment(file.path || file.dataKey)));
    if (deleted.some(result => !result.ok)) showToast("공지는 삭제했지만 일부 첨부파일 정리에 실패했습니다.", "info");
    else showToast("공지를 삭제했습니다.", "success");
  };

  const addNotice = async () => {
    if (!targetKey || !sel) { showToast("학급 또는 과목을 먼저 선택해주세요.", "error"); return; }
    if (!title.trim() && !text.trim() && !noticeFiles.length && !noticeLinks.trim()) { showToast("제목·내용을 입력하거나 파일 또는 링크를 첨부해주세요.", "error"); return; }
    setSaving(true);
    setSavingStage(noticeFiles.length ? "첨부파일 저장 중" : "게시글 저장 중");
    const uploaded = [];
    try {
      for (let index = 0; index < noticeFiles.length; index += 1) {
        const file = noticeFiles[index];
        setSavingStage(`첨부 ${index + 1}/${noticeFiles.length} 저장 중 · ${formatAttachmentSize(file.size)}`);
        uploaded.push(await uploadClassroomAttachment(file, {
          scopeKey,
          subject: sel.subject || `${sel.target}반`,
          target: sel.target,
          teacherName: teacher.name,
        }));
      }
      const linkAttachments = noticeLinks.split(/\n+/).map(value => value.trim()).filter(Boolean).map((value, index) => {
        const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
        let fileName = `링크 ${index + 1}`;
        try { fileName = new URL(normalized).hostname.replace(/^www\./, "") || fileName; } catch {}
        return { url: normalized, fileName, size: 0, contentType: "text/uri-list", isLink: true };
      });
      const now = new Date().toISOString();
      const entry = {
        id: Date.now() + "_" + Math.random().toString(36).slice(2, 8),
        category,
        title: title.trim(),
        text: text.trim(),
        dueDate: dueDate || null,
        attachments: [...uploaded, ...linkAttachments],
        teacherId: teacher.id || "",
        teacherName: teacher.name,
        targetKey,
        targetLabel: sel.label,
        targetKind: sel.kind,
        updatedAt: now,
      };
      const currentScope = db.announcements[scopeKey] || {};
      const nextAnnouncements = {
        ...db.announcements,
        [scopeKey]: { ...currentScope, [targetKey]: [...asNoticeArray(currentScope[targetKey]), entry] },
      };
      setSavingStage("게시글 저장 중");
      const ok = await persist({ announcements: nextAnnouncements });
      if (!ok) {
        await Promise.all(uploaded.map(file => deleteClassroomAttachment(file.path || file.dataKey)));
        return;
      }
      const fallbackCount = uploaded.filter(file => file.storageMode === "firestore-attachment").length;
      showToast(uploaded.length
        ? (fallbackCount ? `공지와 첨부파일을 등록했습니다. (${fallbackCount}개는 Firestore 대체 저장)` : "공지와 첨부파일을 등록했습니다.")
        : "공지를 등록했습니다.", "success");
      setTitle(""); setText(""); setDueDate(""); setNoticeFiles([]); setNoticeLinks("");
      if (noticeFileRef.current) noticeFileRef.current.value = "";
      // 등록 결과를 바로 확인할 수 있도록 내 공지 관리 화면으로 이동합니다.
      setZoneMode("manage");
    } catch (error) {
      await Promise.all(uploaded.map(file => deleteClassroomAttachment(file.path || file.dataKey)));
      showToast(`등록 오류: ${classroomUploadErrorMessage(error)}`, "error");
    } finally {
      setSaving(false);
      setSavingStage("");
    }
  };

  const runAttachmentDiagnostic = async () => {
    setDiagnosingAttachment(true);
    const result = await diagnoseStorageConnection();
    setAttachmentDiagnostic(result);
    showToast(result.ok ? "첨부파일 저장소 연결이 정상입니다." : `Storage 연결 실패: ${result.code || result.error || "원인 미상"}`, result.ok ? "success" : "error");
    setDiagnosingAttachment(false);
  };

  const deleteLegacyMaterial = async material => {
    const scopeMaterials = db.materials?.[scopeKey] || {};
    const nextMaterialScope = {
      ...scopeMaterials,
      [targetKey]: asMaterialArray(scopeMaterials[targetKey]).filter(item => item.id !== material.id),
    };
    const scopeAnnouncements = db.announcements?.[scopeKey] || {};
    const nextAnnouncementScope = {
      ...scopeAnnouncements,
      [targetKey]: asNoticeArray(scopeAnnouncements[targetKey]).filter(item => item.materialId !== material.id),
    };
    const nextAnnouncements = { ...db.announcements, [scopeKey]: nextAnnouncementScope };
    const ok = await persist({
      materials: { ...(db.materials || {}), [scopeKey]: nextMaterialScope },
      announcements: nextAnnouncements,
    });
    if (!ok) return;
    const referencedPaths = new Set();
    Object.values(nextAnnouncements).forEach(targetMap => {
      Object.values(targetMap || {}).forEach(rawList => {
        asNoticeArray(rawList).forEach(entry => (entry.attachments || []).forEach(file => {
          if (file.path || file.dataKey) referencedPaths.add(file.path || file.dataKey);
        }));
      });
    });
    await Promise.all((material.attachments || []).filter(file => (file.path || file.dataKey) && !referencedPaths.has(file.path || file.dataKey)).map(file => deleteClassroomAttachment(file.path || file.dataKey)));
    showToast("이전 수업자료를 삭제했습니다.", "success");
  };

  if (editingProfile) {
    return (
      <TeacherProfileEditor
        teacher={teacher} db={db} grade={grade} scopeKey={scopeKey}
        accounts={accounts} persistAccounts={persistAccounts} showToast={showToast}
        onDone={(updated) => { setEditingProfile(false); if (updated) onUpdateTeacher(updated); }}
      />
    );
  }

  const modeButton = (mode, label, count) => (
    <button
      type="button"
      onClick={() => {
        if (mode !== zoneMode && (mode === "homeroom" || mode === "subject")) setSelectedTargetToken("");
        setZoneMode(mode);
      }}
      style={{ ...styles.teacherZoneModeBtn, ...(zoneMode === mode ? styles.teacherZoneModeBtnActive : {}) }}
    >
      {label}{count != null && <span style={styles.teacherZoneModeCount}>{count}</span>}
    </button>
  );

  const workflowStep = zoneMode === "manage" ? 3 : (zoneMode === "personal" || sel ? 2 : 1);
  const workflowSteps = [
    [1, "대상 선택", "학급·과목·학생"],
    [2, "공지 작성", "내용·기한·첨부"],
    [3, "등록 확인", "내 공지 관리"],
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={styles.h1}>선생님 ZONE {viewingAsAdmin && <span style={{ fontSize: 12, fontWeight: 700, color: "#8a6d1f", background: "#fff8e6", border: "1px solid #f0dca0", borderRadius: 5, padding: "2px 8px", marginLeft: 6 }}>관리자로 보는 중</span>}</h1>
          <p style={styles.pMuted}>{teacher.name} 선생님{teacher.homeroomClass && ` · ${teacher.homeroomClass}반 담임`}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={styles.secondaryBtn} onClick={() => setEditingProfile(true)}>내 정보 수정</button>
          <button style={styles.secondaryBtn} onClick={onLogout}>{viewingAsAdmin ? "돌아가기" : "로그아웃"}</button>
        </div>
      </div>

      <div style={styles.teacherWorkflow}>
        <div className="teacher-workflow-steps" style={styles.teacherWorkflowSteps}>
          {workflowSteps.map(([step, label, caption]) => (
            <div key={step} style={{ ...styles.teacherWorkflowStep, ...(workflowStep === step ? styles.teacherWorkflowStepActive : {}), ...(workflowStep > step ? styles.teacherWorkflowStepDone : {}) }}>
              <span style={styles.teacherWorkflowNumber}>{workflowStep > step ? "✓" : step}</span>
              <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}><b style={{ fontSize: 11, lineHeight: 1.25 }}>{label}</b><small style={{ marginTop: 2, color: "#9a9385", fontSize: 9, lineHeight: 1.25 }}>{caption}</small></span>
            </div>
          ))}
        </div>
        <div style={styles.teacherZoneNav}>
          <div style={styles.teacherZoneModeRow}>
            {homeroomTargets.length > 0 && modeButton("homeroom", "학급담임 공지", homeroomTargets.length)}
            {subjectTargets.length > 0 && modeButton("subject", "교과 전체 공지", subjectTargets.length)}
            {modeButton("personal", "학생 개별 공지", null)}
            {modeButton("manage", "내 공지 관리", authoredNotices.length)}
          </div>
          {(zoneMode === "homeroom" || zoneMode === "subject") && (
            <div className="teacher-zone-target-row" style={styles.teacherTargetRow}>
              <div>
                <div style={styles.teacherTargetLabel}>{zoneMode === "homeroom" ? "담임 학급 선택" : "담당 과목 선택"}</div>
                <div style={styles.teacherTargetHint}>{activeTargets.length > 1 ? "공지 대상을 먼저 선택하면 작성 화면이 열립니다." : "등록 대상"}</div>
              </div>
              <div style={styles.classChips}>
                {activeTargets.map(target => {
                  const token = targetTokenFor(target);
                  return <button key={token} type="button" onClick={() => setSelectedTargetToken(token)} style={{ ...styles.teacherTargetChoice, ...(token === selectedTargetToken ? styles.teacherTargetChoiceActive : {}) }}><span>{target.label}</span><small>{target.kind === "subject" ? "전체 수강생" : "학급 전체"}</small></button>;
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {!flatTargets.length && zoneMode !== "personal" && zoneMode !== "manage" && (
        <div style={styles.warnBanner}><AlertTriangle size={14} /> 담당 학급/과목이 등록되어 있지 않습니다. "내 정보 수정"에서 직접 설정해주세요.</div>
      )}

      {(zoneMode === "homeroom" || zoneMode === "subject") && activeTargets.length > 1 && !sel && (
        <div style={styles.teacherTargetEmpty}>
          <BookOpen size={22} />
          <div><b>먼저 공지 대상을 선택해주세요.</b><span>대상을 선택하면 공지 작성 화면이 열립니다.</span></div>
        </div>
      )}

      {(zoneMode === "homeroom" || zoneMode === "subject") && sel && (
        <>
          <div style={{ ...styles.card, padding: 0, overflow: "hidden" }}>
            <div style={styles.teacherComposerHeader}>
              <div>
                <span style={styles.teacherComposerEyebrow}>2단계 · 공지 작성</span>
                <div style={styles.teacherComposerTitle}>{sel.label}</div>
                <div style={styles.teacherComposerDescription}>공지·과제·수업자료를 하나의 게시글로 등록합니다.</div>
              </div>
              <span style={styles.teacherComposerTargetBadge}>{sel.kind === "subject" ? "전체 수강생" : "학급 전체"}</span>
            </div>

            <div className="teacher-composer-grid" style={styles.teacherComposerGrid}>
              <section style={styles.teacherComposerMain}>
                <div style={styles.teacherFieldLabel}>공지 종류</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                  {categories.map(item => <button key={item} type="button" onClick={() => setCategory(item)} style={{ ...styles.classChip, ...(category === item ? styles.classChipActive : {}) }}>{item}</button>)}
                </div>
                <label style={styles.teacherFormField}>
                  <span>제목 <small>선택</small></span>
                  <input value={title} onChange={event => setTitle(event.target.value)} placeholder="학생이 바로 이해할 수 있는 제목" style={{ ...styles.loginInput, maxWidth: "none", marginBottom: 0 }} />
                </label>
                <label style={styles.teacherFormField}>
                  <span>내용 <small>선택</small></span>
                  <textarea value={text} onChange={event => setText(event.target.value)} rows={7} style={{ ...styles.textareaInput, minHeight: 170 }} placeholder={sel.kind === "homeroom" ? "학급 공지 내용을 작성하세요." : "수업 안내, 준비물, 과제 또는 자료 설명을 작성하세요."} />
                </label>
              </section>

              <aside className="teacher-composer-aside" style={styles.teacherComposerAside}>
                <div style={styles.teacherAsideSection}>
                  <div style={styles.teacherFieldLabel}>게시 설정</div>
                  <label style={styles.teacherFormField}>
                    <span>마감일자 <small>선택</small></span>
                    <input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} style={{ ...styles.cellInput, border: `1px solid ${COLORS.line}`, borderRadius: 8 }} />
                  </label>
                </div>

                <div style={styles.teacherAsideSection}>
                  <div style={styles.teacherFieldLabel}>첨부파일</div>
                  <input ref={noticeFileRef} type="file" multiple accept=".pdf,.hwp,.hwpx,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,image/*,video/*,audio/*" style={{ display: "none" }} onChange={event => setNoticeFiles(Array.from(event.target.files || []))} />
                  <button type="button" style={{ ...styles.secondaryBtn, width: "100%", justifyContent: "center" }} onClick={() => noticeFileRef.current?.click()}><Paperclip size={14} /> 파일 선택</button>
                  {noticeFiles.length > 0 && (
                    <div style={{ ...styles.selectedFileList, marginTop: 8 }}>
                      {noticeFiles.map(file => <span key={`${file.name}-${file.size}`} style={{ ...styles.selectedFileChip, width: "100%", justifyContent: "flex-start" }}><Paperclip size={11} /><span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span><small style={{ color: "#746d61" }}>{formatAttachmentSize(file.size)}</small></span>)}
                      <button type="button" style={{ ...styles.iconBtn, alignSelf: "flex-end" }} onClick={() => { setNoticeFiles([]); if (noticeFileRef.current) noticeFileRef.current.value = ""; }}><X size={14} /></button>
                    </div>
                  )}
                </div>

                <label style={{ ...styles.teacherFormField, ...styles.teacherAsideSection }}>
                  <span><Link2 size={12} /> 링크 첨부 <small>한 줄에 하나</small></span>
                  <textarea value={noticeLinks} onChange={event => setNoticeLinks(event.target.value)} rows={3} style={{ ...styles.textareaInput, minHeight: 78 }} placeholder="Google Drive, YouTube, 학습자료 링크" />
                </label>

                <div style={styles.teacherUploadGuide}>
                  <div>8MB 이하 파일은 Firestore에 바로 저장합니다. 큰 파일만 Firebase Storage를 사용합니다.</div>
                  {attachmentDiagnostic && <span style={{ color: attachmentDiagnostic.ok ? "#24613a" : "#a13e38", fontWeight: 850 }}>{attachmentDiagnostic.ok ? `Storage 정상 · ${attachmentDiagnostic.bucket || "확인됨"}` : `Storage 실패 · ${attachmentDiagnostic.code || attachmentDiagnostic.error || "원인 미상"}`}</span>}
                  <button type="button" style={{ ...styles.secondaryBtn, width: "100%", justifyContent: "center" }} onClick={runAttachmentDiagnostic} disabled={diagnosingAttachment}>{diagnosingAttachment ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} 첨부 연결 진단</button>
                </div>
              </aside>
            </div>

            <div style={styles.teacherComposerFooter}>
              <div style={styles.teacherComposerFooterText}>제목·내용·기한은 선택 항목입니다. 파일이나 링크만으로도 등록할 수 있습니다.</div>
              <button style={{ ...styles.primaryBtn, minWidth: saving ? 220 : 132, justifyContent: "center" }} onClick={addNotice} disabled={saving}>{saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} {saving ? (savingStage || "저장 중") : "게시글 등록"}</button>
            </div>
          </div>

          <div style={{ ...styles.card, marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
              <div><div style={{ fontWeight: 900, fontSize: 14 }}>이 대상의 최근 게시글</div><div style={{ fontSize: 11, color: "#8a8578", marginTop: 3 }}>최근 3개만 표시합니다. 전체 게시글은 ‘내 공지 관리’에서 확인하세요.</div></div>
              <button type="button" style={styles.secondaryBtn} onClick={() => setZoneMode("manage")}>전체 관리</button>
            </div>
            {currentNotices.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {currentNotices.slice(-3).reverse().map(notice => (
                  <NoticeCard key={notice.id} n={notice} labelText={notice.updatedAt ? new Date(notice.updatedAt).toLocaleString("ko-KR") : teacher.name} onDelete={() => removeNoticeAt({ scopeKey, targetKey, notice })} />
                ))}
              </div>
            ) : <div style={styles.materialEmpty}>아직 등록된 게시글이 없습니다.</div>}
            {currentLegacyMaterials.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 11.5, fontWeight: 850, color: "#746d61" }}>이전 버전 수업자료 {currentLegacyMaterials.length}개</summary>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  {currentLegacyMaterials.slice().reverse().map(material => <MaterialCard key={material.id} material={material} onDelete={() => deleteLegacyMaterial(material)} />)}
                </div>
              </details>
            )}
          </div>

        </>
      )}

      {zoneMode === "personal" && (
        <PersonalNoticeComposer roster={roster} db={db} persist={persist} showToast={showToast} scopeKey={scopeKey} teacher={teacher} />
      )}

      {zoneMode === "manage" && (
        <div style={styles.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 15 }}>내가 올린 모든 공지</div>
              <div style={{ fontSize: 11.5, color: "#8a8578", marginTop: 3 }}>학년·학기와 대상에 관계없이 본인이 작성한 공지를 확인하고 삭제할 수 있습니다.</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={styles.classroomCount}>{authoredNotices.length}개</span>
              <button type="button" style={styles.primaryBtn} onClick={() => setZoneMode(subjectTargets.length ? "subject" : homeroomTargets.length ? "homeroom" : "personal")}><Save size={13} /> 새 공지 작성</button>
            </div>
          </div>
          {authoredNotices.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {authoredNotices.map(item => {
                const [scopeGrade, scopeSemester] = String(item.scopeKey).split("-");
                const scopeLabel = `${scopeGrade || "?"}학년 ${scopeSemester === "sem2" ? "2학기" : "1학기"}`;
                return (
                  <div key={`${item.scopeKey}-${item.targetKey}-${item.notice.id}`} style={styles.teacherNoticeManageRow}>
                    <div style={styles.teacherNoticeManageMeta}>
                      <span>{scopeLabel}</span><span>{item.targetLabel}</span>
                    </div>
                    <NoticeCard n={item.notice} labelText={item.notice.updatedAt ? new Date(item.notice.updatedAt).toLocaleString("ko-KR") : teacher.name} onDelete={() => removeNoticeAt(item)} />
                  </div>
                );
              })}
            </div>
          ) : <div style={styles.materialEmpty}>아직 작성한 공지가 없습니다.</div>}
        </div>
      )}
    </div>
  );
}

function MonitorManager({ targetKey, subject, group, label, roster, enrollments, accounts, persistAccounts, showToast, teacherName }) {
  const [query, setQuery] = useState("");
  const monitors = (accounts.monitors || []).filter(m => m.targetKey === targetKey);

  // Candidates: students actually enrolled in this exact subject+group, not already a monitor here.
  const candidates = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim();
    const already = new Set(monitors.map(m => m.id));
    return Object.entries(enrollments)
      .filter(([sid, list]) => !already.has(sid) && list.some(c => c.subject === subject && c.group === group))
      .map(([sid]) => [sid, roster[sid]])
      .filter(([sid, s]) => s && (sid.includes(q) || s.name.includes(q) || `${s.class}반${s.number}번`.includes(q.replace(/\s/g, ""))))
      .slice(0, 8);
  }, [query, enrollments, roster, subject, group, monitors]);

  const genPw = () => Math.random().toString(36).slice(2, 8);

  const addMonitor = async (sid, s) => {
    if (monitors.length >= 2) { showToast("교과부장은 최대 2명까지 지정할 수 있습니다.", "error"); return; }
    const pw = genPw();
    const idTaken = [...(accounts.admin || []), ...(accounts.teacher || []), ...(accounts.monitors || [])].some(a => a.id === sid);
    if (idTaken) { showToast("이미 사용 중인 아이디(학번)입니다.", "error"); return; }
    const newMonitor = { id: sid, pw, targetKey, subject, group, studentName: s.name, teacherName };
    const ok = await persistAccounts({ ...accounts, monitors: [...(accounts.monitors || []), newMonitor] });
    if (ok) { showToast(`${s.name} 학생을 교과부장으로 지정했습니다. (비밀번호: ${pw})`, "success"); setQuery(""); }
  };

  const removeMonitor = async (id) => {
    const ok = await persistAccounts({ ...accounts, monitors: (accounts.monitors || []).filter(m => m.id !== id) });
    if (ok) showToast("교과부장 지정을 해제했습니다.", "success");
  };

  const resetMonitorPw = async (id) => {
    const pw = genPw();
    const ok = await persistAccounts({ ...accounts, monitors: (accounts.monitors || []).map(m => m.id === id ? { ...m, pw } : m) });
    if (ok) showToast(`비밀번호가 초기화되었습니다: ${pw}`, "success");
  };

  return (
    <div>
      <div style={{ fontWeight: 900, marginBottom: 6, fontSize: 14 }}>교과부장 학생 관리</div>
      <div style={{ fontSize: 11, color: "#6f685d", fontWeight: 800, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: "#8a8578", marginBottom: 10 }}>이 반을 수강하는 학생 중 최대 2명을 교과부장으로 지정하면, 그 학생도 이 반에 공지를 올릴 수 있습니다.</div>
      {monitors.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {monitors.map(m => (
            <div key={m.id} style={styles.issueRow}>
              <span style={{ fontWeight: 700 }}>{m.studentName}</span>
              <span style={{ color: "#8a8578", fontSize: 12 }}>({m.id})</span>
              <span style={{ fontSize: 12, color: "#8a8578" }}>비밀번호: {m.pw}</span>
              <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                <button style={{ ...styles.secondaryBtn, padding: "4px 10px", fontSize: 11.5 }} onClick={() => resetMonitorPw(m.id)}>비밀번호 재발급</button>
                <button style={{ ...styles.dangerBtn, padding: "4px 10px", fontSize: 11.5, marginTop: 0 }} onClick={() => removeMonitor(m.id)}>해제</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {monitors.length < 2 ? (
        <div>
          <div style={styles.searchBox}>
            <Search size={16} color="#a39d8c" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="학번, 이름으로 검색 (이 과목 수강생만 표시)" style={styles.searchInput} />
          </div>
          {candidates.length > 0 && (
            <div style={styles.matchList}>
              {candidates.map(([sid, s]) => (
                <button key={sid} style={styles.matchItem} onClick={() => addMonitor(sid, s)}>
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  <span style={styles.matchMeta}>{s.class}반 {s.number}번 · {sid}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: "#a39d8c" }}>이미 2명이 지정되어 있습니다. 해제 후 새로 지정할 수 있습니다.</div>
      )}
    </div>
  );
}

function TeacherProfileEditor({ teacher, db, grade, scopeKey, accounts, persistAccounts, showToast, onDone }) {
  const [homeroomClass, setHomeroomClass] = useState(teacher.homeroomClass || "");
  const [assignments, setAssignments] = useState(teacher.assignments && teacher.assignments.length ? teacher.assignments : [{ kind: "elective", subject: "", targets: "" }]);
  const [saving, setSaving] = useState(false);
  const role = normalizedTeacherRole(teacher);
  const canEditHomeroom = role === "homeroom";
  const classOptions = useMemo(() => extractClasses(db, scopeKey), [db, scopeKey]);

  const save = async () => {
    setSaving(true);
    try {
      const cleanAssignments = assignments.filter(a => a.subject && a.targets.trim());
      const updatedTeacher = applyAutomaticTeacherAccess({
        ...teacher,
        homeroomClass: canEditHomeroom ? homeroomClass : teacher.homeroomClass,
        assignments: cleanAssignments,
      }, teacherRoleGrade(teacher));
      const newTeacherList = (accounts.teacher || []).map(t => t.id === teacher.id ? updatedTeacher : t);
      const ok = await persistAccounts({ ...accounts, teacher: newTeacherList });
      if (ok) { showToast("저장했습니다.", "success"); onDone(updatedTeacher); }
    } catch (e) {
      showToast(`오류가 발생했습니다: ${e.message}`, "error");
    }
    setSaving(false);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div>
          <h1 style={styles.h1}>내 정보 수정</h1>
          <p style={styles.pMuted}>{teacher.name} 선생님의 담당 반/과목을 직접 설정합니다.</p>
        </div>
        <button style={styles.secondaryBtn} onClick={() => onDone(null)}>취소</button>
      </div>
      <div style={styles.card}>
        <div style={{ ...styles.infoBox, padding: 10, marginBottom: 14 }}>
          <strong style={{ fontSize: 12 }}>관리자 지정 역할: {TEACHER_ROLE_LABELS[role]}</strong>
          <div style={{ fontSize: 11, color: "#8a8578", marginTop: 4 }}>학생 성적·시간표 접근 권한과 역할은 관리자 계정관리에서만 변경할 수 있습니다.</div>
        </div>
        {canEditHomeroom && (
          <>
            <div style={{ fontSize: 11.5, color: "#8a8578", marginBottom: 6 }}>학급담임 반</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 16 }}>
              <button type="button" onClick={() => setHomeroomClass("")} style={{ ...styles.classChip, padding: "5px 10px", fontSize: 12, ...(!homeroomClass ? styles.classChipActive : {}) }}>미지정</button>
              {classOptions.map(c => (
                <button key={c} type="button" onClick={() => setHomeroomClass(c)} style={{ ...styles.classChip, padding: "5px 10px", fontSize: 12, ...(homeroomClass === c ? styles.classChipActive : {}) }}>{c}반</button>
              ))}
            </div>
          </>
        )}
        <div style={{ fontSize: 11.5, color: "#8a8578", marginBottom: 6 }}>교과담당 과목 (해당 시에만 추가)</div>
        <AssignmentsEditor assignments={assignments} setAssignments={setAssignments} db={db} scopeKey={scopeKey} semesterLabel={null} />
        <button style={{ ...styles.primaryBtn, marginTop: 14 }} onClick={save} disabled={saving}>{saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} 저장</button>
      </div>
    </div>
  );
}

function PersonalNoticeComposer({ roster, db, persist, showToast, scopeKey, teacher }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]); // array of {sid, name, class, number}
  const [category, setCategory] = useState("공지");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim();
    return Object.entries(roster)
      .filter(([sid, student]) => !selected.some(item => item.sid === sid) && (
        sid.includes(q)
        || student.name.includes(q)
        || `${student.class}반${student.number}번`.includes(q.replace(/\s/g, ""))
      ))
      .slice(0, 8);
  }, [query, roster, selected]);

  const addStudent = (sid, student) => { setSelected(previous => [...previous, { sid, ...student }]); setQuery(""); };
  const removeStudent = sid => setSelected(previous => previous.filter(student => student.sid !== sid));

  const send = async () => {
    if (!title.trim() && !text.trim() && !files.length) { showToast("제목·내용을 입력하거나 파일을 첨부해주세요.", "error"); return; }
    if (!selected.length) { showToast("학생을 한 명 이상 선택해주세요.", "error"); return; }
    setSaving(true);
    const uploaded = [];
    try {
      for (const file of files) {
        uploaded.push(await uploadClassroomAttachment(file, {
          scopeKey,
          subject: "학생개별공지",
          target: selected.map(student => student.sid).join("_"),
          teacherName: teacher.name,
        }));
      }
      const current = db.announcements[scopeKey] || {};
      const updated = { ...current };
      const noticeId = Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      const newEntry = {
        id: noticeId,
        category,
        title: title.trim(),
        text: text.trim(),
        dueDate: dueDate || null,
        attachments: uploaded,
        teacherId: teacher.id || "",
        teacherName: teacher.name,
        targetKind: "personal",
        targetLabel: `${selected.length}명 개인 공지`,
        updatedAt: new Date().toISOString(),
      };
      selected.forEach(student => {
        const key = `STUDENT_${student.sid}`;
        updated[key] = [...asNoticeArray(current[key]), { ...newEntry, targetKey: key }];
      });
      const ok = await persist({ announcements: { ...db.announcements, [scopeKey]: updated } });
      if (!ok) {
        await Promise.all(uploaded.map(file => deleteClassroomAttachment(file.path || file.dataKey)));
        return;
      }
      showToast(`${selected.length}명에게 전송했습니다.`, "success");
      setTitle(""); setText(""); setDueDate(""); setSelected([]); setFiles([]);
      if (fileRef.current) fileRef.current.value = "";
    } catch (error) {
      await Promise.all(uploaded.map(file => deleteClassroomAttachment(file.path || file.dataKey)));
      showToast(`전송 오류: ${classroomUploadErrorMessage(error)}`, "error");
    }
    setSaving(false);
  };

  return (
    <div style={styles.card}>
      <div style={{ fontWeight: 900, marginBottom: 6, fontSize: 15 }}>학생 개별 공지</div>
      <div style={{ fontSize: 11.5, color: "#8a8578", marginBottom: 12 }}>특정 학생을 지정해 제목·내용·마감일·첨부파일이 있는 공지를 보냅니다.</div>
      <div style={styles.searchBox}>
        <Search size={16} color="#a39d8c" />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="학번, 이름, 또는 '3반 12번'으로 검색" style={styles.searchInput} />
      </div>
      {matches.length > 0 && (
        <div style={styles.matchList}>
          {matches.map(([sid, student]) => (
            <button key={sid} style={styles.matchItem} onClick={() => addStudent(sid, student)}>
              <span style={{ fontWeight: 600 }}>{student.name}</span>
              <span style={styles.matchMeta}>{student.class}반 {student.number}번 · {sid}</span>
            </button>
          ))}
        </div>
      )}
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0" }}>
          {selected.map(student => (
            <span key={student.sid} style={{ display: "flex", alignItems: "center", gap: 4, background: COLORS.accentSoft, color: COLORS.accent, borderRadius: 14, padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>
              {student.name} ({student.class}반 {student.number}번)
              <X size={12} style={{ cursor: "pointer" }} onClick={() => removeStudent(student.sid)} />
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, margin: "10px 0", flexWrap: "wrap" }}>
        {[...NOTICE_CATEGORIES, ...HOMEROOM_CATEGORIES].filter((item, index, array) => array.indexOf(item) === index).map(item => (
          <button key={item} type="button" onClick={() => setCategory(item)} style={{ ...styles.classChip, ...(category === item ? styles.classChipActive : {}) }}>{item}</button>
        ))}
      </div>
      <input value={title} onChange={event => setTitle(event.target.value)} placeholder="제목 (선택)" style={{ ...styles.loginInput, maxWidth: "none", marginBottom: 8 }} />
      <textarea value={text} onChange={event => setText(event.target.value)} rows={4} style={styles.textareaInput} placeholder="예: 지난주 결석에 대한 사유서를 제출해주세요." />
      <div style={styles.noticeOptionGrid}>
        <label style={styles.noticeOptionField}>
          <span>마감일자 (선택)</span>
          <input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} style={{ ...styles.cellInput, border: `1px solid ${COLORS.line}`, borderRadius: 7 }} />
        </label>
        <div style={styles.noticeOptionField}>
          <span>첨부파일 (선택)</span>
          <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={event => setFiles(Array.from(event.target.files || []))} />
          <button type="button" style={styles.secondaryBtn} onClick={() => fileRef.current?.click()}><Paperclip size={14} /> 파일 선택</button>
        </div>
      </div>
      {files.length > 0 && <div style={styles.selectedFileList}>{files.map(file => <span key={`${file.name}-${file.size}`} style={styles.selectedFileChip}><Paperclip size={11} />{file.name}</span>)}</div>}
      <button style={{ ...styles.primaryBtn, marginTop: 10 }} onClick={send} disabled={saving}>{saving ? <Loader2 size={14} className="spin" /> : <Send size={14} />} {selected.length > 0 ? `${selected.length}명에게 전송` : "전송"}</button>
    </div>
  );
}

function TimetableCard({ result, sid }) {
  const { student, grid, warnings, hasTimetable, notices, homeroomNotices, classroomCourses = [] } = result;
  const hasNotices = (notices && notices.length > 0) || (homeroomNotices && homeroomNotices.length > 0);
  const [view, setView] = useState("timetable");
  return (
    <div style={styles.card} className="print-card">
      <div style={styles.printHeader} className="print-header">
        <div><div style={styles.cardTitle}>{student.name} <span style={styles.cardSub}>{student.class}반 {student.number}번</span></div><div style={styles.cardMeta}>학번 {sid}</div></div>
        <button type="button" className="no-print" style={styles.printBtn} onClick={() => window.print()}><Printer size={14} /> 인쇄 / PDF</button>
      </div>
      <div className="no-print" style={styles.studentViewTabs}>
        <button type="button" onClick={() => setView("timetable")} style={{ ...styles.studentViewTab, ...(view === "timetable" ? styles.studentViewTabActive : {}) }}><Calendar size={14} /> 시간표</button>
        <button type="button" onClick={() => setView("classroom")} style={{ ...styles.studentViewTab, ...(view === "classroom" ? styles.studentViewTabActive : {}) }}><BookOpen size={14} /> 내 강의실</button>
      </div>
      {view === "timetable" ? (
        <>
          {!hasTimetable && <div style={styles.warnBanner}><AlertTriangle size={14} /> {student.class}반 시간표 데이터가 없습니다.</div>}
          <GridTable grid={grid} />
          <div style={styles.legend}>
            <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: "#c7d2c4" }} /> 공통수업</span>
            <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: "#e7dfc7" }} /> 이동수업 (이동 없음)</span>
            <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: "#e3c6ae" }} /> 이동수업 (교실 이동)</span>
          </div>
          {hasNotices && <NoticesTabs notices={notices} homeroomNotices={homeroomNotices} className="no-print" sid={sid} />}
          {warnings.length > 0 && <div style={styles.warnBox} className="no-print"><div style={styles.warnBoxTitle}><AlertTriangle size={13} /> 확인 필요 {warnings.length}건</div><ul style={styles.warnUl}>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
        </>
      ) : (
        <ClassroomMaterialsView courses={classroomCourses} />
      )}
    </div>
  );
}

function formatAttachmentSize(size) {
  const value = Number(size || 0);
  if (!value) return "";
  if (value < 1024) return `${value}B`;
  if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10}KB`;
  return `${Math.round(value / 1024 / 102.4) / 10}MB`;
}

function AttachmentLinks({ attachments }) {
  const files = Array.isArray(attachments) ? attachments : [];
  const [openingKey, setOpeningKey] = useState("");
  const [openError, setOpenError] = useState("");
  if (!files.length) return null;

  const openStoredAttachment = async (file, index) => {
    const key = file.dataKey || `${file.fileName}-${index}`;
    setOpeningKey(key);
    setOpenError("");
    try {
      const stored = await readStorage(file.dataKey, null);
      if (!stored?.dataUrl) throw new Error("저장된 첨부파일 데이터를 찾지 못했습니다.");
      const anchor = document.createElement("a");
      anchor.href = stored.dataUrl;
      anchor.download = file.fileName || stored.fileName || "첨부파일";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) {
      setOpenError(error?.message || "첨부파일을 여는 중 오류가 발생했습니다.");
    }
    setOpeningKey("");
  };

  return (
    <div>
      <div style={styles.attachmentList}>
        {files.map((file, index) => {
          const key = `${file.path || file.dataKey || file.url || file.fileName}-${index}`;
          const content = <><>{file.isLink ? <Link2 size={12} /> : (openingKey === (file.dataKey || `${file.fileName}-${index}`) ? <Loader2 size={12} className="spin" /> : <Download size={12} />)}</><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.fileName || (file.isLink ? "링크" : "첨부파일")}</span>{file.size ? <small>{formatAttachmentSize(file.size)}</small> : null}</>;
          if (file.dataKey) {
            return <button key={key} type="button" onClick={() => openStoredAttachment(file, index)} disabled={!!openingKey} style={{ ...styles.attachmentLink, cursor: "pointer" }} title={`${file.fileName || "첨부파일"} · Firestore 대체 저장`}>{content}</button>;
          }
          return <a key={key} href={file.url} target={file.download ? undefined : "_blank"} rel="noreferrer" download={file.download ? (file.fileName || "첨부파일") : undefined} style={styles.attachmentLink} title={file.fileName || "첨부파일"}>{content}</a>;
        })}
      </div>
      {openError && <div style={{ marginTop: 5, fontSize: 10.5, color: "#a13e38" }}>{openError}</div>}
    </div>
  );
}

function MaterialCard({ material, onDelete }) {
  const updatedLabel = material.updatedAt ? new Date(material.updatedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <article style={styles.materialCard}>
      <div style={styles.materialCardHeader}>
        <div style={{ minWidth: 0 }}>
          <div style={styles.materialTitle}>{material.title || "수업자료"}</div>
          <div style={styles.materialMeta}>{material.teacherName ? `${material.teacherName} 선생님` : "담당 선생님"}{updatedLabel ? ` · ${updatedLabel}` : ""}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {material.publishAsNotice && <span style={styles.materialNoticeBadge}>공지 등록</span>}
          {onDelete && <button type="button" style={styles.iconBtn} onClick={onDelete}><Trash2 size={14} /></button>}
        </div>
      </div>
      {material.text && <div style={styles.materialBody}>{material.text}</div>}
      <AttachmentLinks attachments={material.attachments} />
    </article>
  );
}

function ClassroomMaterialsView({ courses }) {
  const availableCourses = Array.isArray(courses) ? courses : [];
  const [selectedKey, setSelectedKey] = useState(availableCourses[0]?.key || "");
  useEffect(() => {
    if (!availableCourses.length) { setSelectedKey(""); return; }
    if (!availableCourses.some(course => course.key === selectedKey)) setSelectedKey(availableCourses[0].key);
  }, [availableCourses, selectedKey]);
  const selected = availableCourses.find(course => course.key === selectedKey) || availableCourses[0];
  const totalPosts = availableCourses.reduce((sum, course) => sum + (course.posts?.length || 0), 0);
  return (
    <section className="no-print" style={styles.classroomPanel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 15 }}>내 강의실</div>
          <div style={{ fontSize: 11.5, color: "#8a8578", marginTop: 3 }}>과목별 공지·과제·수업자료와 첨부파일을 한 곳에서 확인하세요.</div>
        </div>
        <span style={styles.classroomCount}>{totalPosts}개 게시글</span>
      </div>
      {!availableCourses.length ? (
        <div style={styles.materialEmpty}>현재 시간표에서 확인할 수 있는 과목이 없습니다.</div>
      ) : (
        <>
          <div style={styles.classroomCourseTabs}>
            {availableCourses.map(course => (
              <button key={course.key} type="button" onClick={() => setSelectedKey(course.key)} style={{ ...styles.classroomCourseTab, ...(selected?.key === course.key ? styles.classroomCourseTabActive : {}) }}>
                <span>{course.label}</span><small>{course.posts?.length || 0}</small>
              </button>
            ))}
          </div>
          <div style={styles.classroomMaterialsList}>
            {selected?.posts?.length ? selected.posts.map(post => (
              <NoticeCard
                key={post.id || `${post.title}-${post.updatedAt}`}
                n={post}
                labelText={`${post.teacherName ? `${post.teacherName} 선생님` : "담당 선생님"}${post.updatedAt ? ` · ${new Date(post.updatedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}`}
              />
            )) : <div style={styles.materialEmpty}>{selected?.label}에 등록된 게시글이 없습니다.</div>}
          </div>
        </>
      )}
    </section>
  );
}

function NoticeCard({ n, labelText, unread, onDelete }) {
  const cat = NOTICE_CATEGORY_COLOR[n.category] || NOTICE_CATEGORY_COLOR["공지"];
  const dueInfo = n.dueDate ? formatDueDate(n.dueDate) : null;
  return (
    <div style={{ background: cat.bg, border: `1px solid ${cat.border}`, borderRadius: 8, padding: "10px 14px", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: cat.text, background: "#fff", border: `1px solid ${cat.border}`, borderRadius: 4, padding: "1px 6px" }}>{n.category || "공지"}</span>
        {unread && <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: "#b3401f", borderRadius: 4, padding: "1px 6px" }}>안 읽음</span>}
        <span style={{ fontSize: 12, fontWeight: 700, color: cat.text }}>{labelText}</span>
        {onDelete && <button style={{ ...styles.iconBtn, marginLeft: "auto", color: cat.text }} onClick={onDelete}><X size={14} /></button>}
      </div>
      {n.title && <div style={{ fontSize: 13, fontWeight: 900, color: cat.text, marginBottom: n.text ? 4 : 0 }}>{n.title}</div>}
      {n.text && <div style={{ fontSize: 12.5, color: cat.text, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{n.text}</div>}
      <AttachmentLinks attachments={n.attachments} />
      {dueInfo && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, fontSize: 11.5, fontWeight: 700, color: dueInfo.overdue ? "#b3401f" : cat.text }}>
          <Calendar size={12} /> 마감 {dueInfo.label}{dueInfo.overdue ? " (마감됨)" : ""}
        </div>
      )}
    </div>
  );
}
function formatDueDate(dateStr) {
  const due = new Date(dateStr + "T23:59:59");
  const now = new Date();
  const label = due.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
  return { label, overdue: due < now };
}

function homeroomNoticeLabel(student, n) {
  return `${n.origin === "personal" ? "개인 지정 공지" : `${student.class}반 담임`}${n.teacherName ? ` — ${n.teacherName} 선생님` : ""}`;
}
function subjectNoticeLabel(n) {
  return `${n.subject} (${n.group}) — ${n.teacherName ? `${n.teacherName} 선생님` : "공지"}`;
}

// Interactive, on-screen only: tab switcher between "수강 중인 과목 공지사항" and "학급 공지사항"
function NoticesTabs({ notices, homeroomNotices, className, sid }) {
  const hasSubject = notices && notices.length > 0;
  const hasClass = homeroomNotices && homeroomNotices.length > 0;
  const [tab, setTab] = useState(hasClass ? "class" : "subject");
  const [readIds, setReadIds] = useState(() => getReadIds(sid));

  useEffect(() => {
    const allIds = [...(notices || []), ...(homeroomNotices || [])].map(n => n.id).filter(Boolean);
    if (!allIds.length) return;
    const timer = setTimeout(() => { markRead(sid, allIds); setReadIds(getReadIds(sid)); }, 2000);
    return () => clearTimeout(timer);
  }, [sid, notices, homeroomNotices]);

  return (
    <div className={className} style={styles.noticesSection}>
      <div style={styles.noticesTabRow}>
        {hasSubject && <button onClick={() => setTab("subject")} style={{ ...styles.noticesTabBtn, ...(tab === "subject" ? styles.noticesTabBtnActive : {}) }}>수강 중인 과목 공지사항 ({notices.length})</button>}
        {hasClass && <button onClick={() => setTab("class")} style={{ ...styles.noticesTabBtn, ...(tab === "class" ? styles.noticesTabBtnActive : {}) }}>학급 공지사항 ({homeroomNotices.length})</button>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {tab === "subject" && hasSubject && notices.map((n, i) => <NoticeCard key={i} n={n} labelText={subjectNoticeLabel(n)} unread={n.id && !readIds.has(n.id)} />)}
        {tab === "class" && hasClass && homeroomNotices.slice().reverse().map((n, i) => <NoticeCard key={i} n={n} labelText={homeroomNoticeLabelFor(n)} unread={n.id && !readIds.has(n.id)} />)}
      </div>
    </div>
  );
}
function homeroomNoticeLabelFor(n) {
  return `${n.origin === "personal" ? "개인 지정 공지" : "학급 담임"}${n.teacherName ? ` — ${n.teacherName} 선생님` : ""}`;
}


function GridTable({ grid }) {
  return (
    <table style={styles.table}>
      <colgroup><col style={{ width: "13%" }} />{DAYS.map(d => <col key={d} style={{ width: "17.4%" }} />)}</colgroup>
      <thead><tr><th style={styles.thPeriod}>교시</th>{DAYS.map(d => <th key={d} style={styles.th}>{d}</th>)}</tr></thead>
      <tbody>{PERIODS.map((p, pi) => <tr key={p}><td style={styles.tdPeriod}><div>{p}교시</div><div style={styles.tdTime}>{PERIOD_TIME[p]}</div></td>{DAYS.map(day => { const c = grid[day][pi]; return <td key={day} style={{ ...styles.td, ...cellBg(c) }}>{renderCell(c)}</td>; })}</tr>)}</tbody>
    </table>
  );
}
function cellBg(c) { if (!c) return {}; if (c.type === "fixed") return { background: "#f4f6f2" }; if (c.type === "move") return { background: c.moved ? "#fbf0e6" : "#faf6e8" }; return {}; }
function renderCell(c) {
  if (!c) return <span style={{ color: "#d8d3c6" }}>–</span>;
  if (c.type === "move") return <div><div style={styles.cellSubject}>{c.subject}</div><div style={styles.cellRow}><span style={styles.cellTag}>{c.group}</span>{c.moved ? <span style={styles.cellMoveTag}><ArrowRight size={9} /> {c.roomLabel}</span> : <span style={styles.cellStayTag}>{c.roomLabel}</span>}</div></div>;
  if (c.type === "fixed") return <div><div style={styles.cellFixed}>{c.subject}</div>{c.location && <div style={styles.cellLocation}>{c.location}</div>}</div>;
  return null;
}

function FeedbackLauncher({ feedback, persist, showToast, reporter, context }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("버그 신고");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (busy) return;
    setOpen(false);
  };

  const submit = async event => {
    event?.preventDefault?.();
    if (!title.trim()) { showToast("제목을 입력해주세요.", "error"); return; }
    if (!text.trim()) { showToast("내용을 입력해주세요.", "error"); return; }
    setBusy(true);
    const entry = {
      id: `FB_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      title: title.trim(),
      text: text.trim(),
      status: "접수",
      reporter: {
        role: reporter?.role || "이용자",
        id: reporter?.role === "관리자" ? "" : (reporter?.id || ""),
        name: reporter?.role === "관리자" ? "관리자" : (reporter?.name || ""),
      },
      context: {
        section: context?.section || "",
        tab: context?.tab || "",
        grade: context?.grade || "",
        semester: context?.semester || "",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const ok = await persist({ feedback: [...(feedback || []), entry] });
    if (ok) {
      showToast("건의사항이 관리자에게 접수되었습니다.", "success");
      setTitle(""); setText(""); setType("버그 신고"); setOpen(false);
    }
    setBusy(false);
  };

  return (
    <>
      <button type="button" className="no-print" onClick={() => setOpen(true)} style={styles.feedbackFloatingButton}>
        <MessageSquare size={16} />
        <span>건의·버그</span>
      </button>
      {open && (
        <div className="no-print" style={styles.feedbackOverlay} onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
          <form onSubmit={submit} autoComplete="off" style={styles.feedbackModal}>
            <div style={styles.feedbackModalHeader}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 950 }}>건의사항·버그 제보</div>
                <div style={{ fontSize: 11.5, color: "#8a8578", marginTop: 3 }}>불편한 점이나 개선 아이디어를 관리자에게 바로 전달합니다.</div>
              </div>
              <button type="button" style={styles.iconBtn} onClick={close}><X size={17} /></button>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {["버그 신고", "개선 건의", "기타 문의"].map(item => (
                <button key={item} type="button" onClick={() => setType(item)} style={{ ...styles.classChip, ...(type === item ? styles.classChipActive : {}) }}>{item}</button>
              ))}
            </div>
            <label style={styles.feedbackField}>
              <span>제목</span>
              <input name="feedback_title_text" autoComplete="new-password" data-lpignore="true" value={title} onChange={event => setTitle(event.target.value)} maxLength={80} placeholder="예: 학생 시간표가 열리지 않습니다." style={styles.loginInput} />
            </label>
            <label style={styles.feedbackField}>
              <span>내용</span>
              <textarea name="feedback_body_text" autoComplete="new-password" data-lpignore="true" value={text} onChange={event => setText(event.target.value)} rows={7} maxLength={2000} placeholder="발생한 화면, 상황, 기대한 동작을 구체적으로 적어주세요." style={styles.textareaInput} />
            </label>
            <div style={styles.feedbackReporterInfo}>
              <span>{reporter?.role || "이용자"}</span>
              <strong>{reporter?.name || reporter?.id || "이름 미확인"}</strong>
              {reporter?.id && reporter?.role !== "관리자" && <small>{reporter.id}</small>}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 13 }}>
              <button type="button" style={styles.secondaryBtn} onClick={close}>취소</button>
              <button type="submit" style={styles.primaryBtn} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <Send size={14} />} 접수하기</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function FeedbackAdminPanel({ feedback, persist, showToast }) {
  const [statusFilter, setStatusFilter] = useState("전체");
  const [typeFilter, setTypeFilter] = useState("전체");
  const statuses = ["접수", "확인중", "처리완료"];
  const rows = (feedback || [])
    .filter(item => statusFilter === "전체" || item.status === statusFilter)
    .filter(item => typeFilter === "전체" || item.type === typeFilter)
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const updateStatus = async (id, status) => {
    const next = (feedback || []).map(item => item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item);
    const ok = await persist({ feedback: next });
    if (ok) showToast(`처리 상태를 "${status}"로 변경했습니다.`, "success");
  };
  const remove = async id => {
    const next = (feedback || []).filter(item => item.id !== id);
    const ok = await persist({ feedback: next });
    if (ok) showToast("제보를 삭제했습니다.", "success");
  };

  const count = status => (feedback || []).filter(item => status === "전체" || item.status === status).length;

  return (
    <div>
      <div style={styles.feedbackAdminSummary}>
        {["전체", ...statuses].map(status => (
          <button key={status} type="button" onClick={() => setStatusFilter(status)} style={{ ...styles.feedbackSummaryCard, ...(statusFilter === status ? styles.feedbackSummaryCardActive : {}) }}>
            <span>{status}</span><strong>{count(status)}</strong>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 13, flexWrap: "wrap" }}>
        {["전체", "버그 신고", "개선 건의", "기타 문의"].map(type => (
          <button key={type} type="button" onClick={() => setTypeFilter(type)} style={{ ...styles.classChip, ...(typeFilter === type ? styles.classChipActive : {}) }}>{type}</button>
        ))}
      </div>
      {!rows.length ? (
        <div style={styles.emptyBox}><MessageSquare size={24} color="#b5afa2" /><div style={{ marginTop: 8, fontWeight: 800 }}>접수된 내용이 없습니다.</div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map(item => {
            const reporterLabel = [item.reporter?.role, item.reporter?.name, item.reporter?.role === "관리자" ? null : item.reporter?.id].filter(Boolean).join(" · ");
            const contextLabel = [
              item.context?.grade ? `${item.context.grade}학년` : null,
              item.context?.semester === "sem2" ? "2학기" : item.context?.semester === "sem1" ? "1학기" : null,
              item.context?.section,
              item.context?.tab,
            ].filter(Boolean).join(" / ");
            return (
              <article key={item.id} style={styles.feedbackAdminCard}>
                <div style={styles.feedbackAdminCardHeader}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ ...styles.feedbackTypeBadge, ...(item.type === "버그 신고" ? styles.feedbackTypeBug : item.type === "개선 건의" ? styles.feedbackTypeIdea : {}) }}>{item.type}</span>
                      <span style={styles.feedbackStatusBadge}>{item.status || "접수"}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 950, marginTop: 7 }}>{item.title}</div>
                  </div>
                  <button type="button" style={styles.iconBtn} onClick={() => remove(item.id)}><Trash2 size={14} /></button>
                </div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 12.5, lineHeight: 1.65, color: "#4f493f", marginTop: 8 }}>{item.text}</div>
                <div style={styles.feedbackAdminMeta}>
                  <span>{reporterLabel || "작성자 미상"}</span>
                  {contextLabel && <span>{contextLabel}</span>}
                  <span>{item.createdAt ? new Date(item.createdAt).toLocaleString("ko-KR") : ""}</span>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {statuses.map(status => (
                    <button key={status} type="button" onClick={() => updateStatus(item.id, status)} style={{ ...styles.classChip, ...(item.status === status ? styles.classChipActive : {}) }}>{status}</button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}


function staffNoticeAudience(notice, account) {
  if (!notice || !account) return false;
  if (notice.targetType === "all") return true;
  const token = `${account.accountType || "teacher"}:${account.id}`;
  const targets = (notice.targetIds || []).map(String);
  return targets.includes(token) || targets.includes(String(account.id));
}
function AdminStaffNoticePanel({ accounts, notices, persist, showToast }) {
  const staff = [
    ...(accounts.teacher || []).map(item => ({ ...item, accountType: "teacher", displayRole: "선생님" })),
    ...(accounts.departments || []).map(item => ({ ...item, accountType: "department", displayRole: "부서" })),
  ].sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), "ko"));
  const [targetType, setTargetType] = useState("all");
  const [targetId, setTargetId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!title.trim() && !body.trim()) { showToast("제목 또는 내용을 입력해주세요.", "error"); return; }
    if (targetType === "individual" && !targetId) { showToast("공지 대상 교직원을 선택해주세요.", "error"); return; }
    setBusy(true);
    const selected = staff.find(item => `${item.accountType}:${item.id}` === String(targetId));
    const entry = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      targetType,
      targetIds: targetType === "all" ? [] : [targetId],
      targetLabel: targetType === "all" ? "전체 교직원" : `${selected?.name || selected?.id || targetId} 개인`,
      title: title.trim() || "관리자 공지",
      body: body.trim(),
      dueDate: dueDate || null,
      createdAt: new Date().toISOString(),
      readBy: [],
    };
    const ok = await persist({ staffNotices: [entry, ...(notices || [])] });
    setBusy(false);
    if (ok) { setTitle(""); setBody(""); setDueDate(""); showToast("교직원 공지를 등록했습니다.", "success"); }
  };
  const remove = async id => {
    const ok = await persist({ staffNotices: (notices || []).filter(item => item.id !== id) });
    if (ok) showToast("공지를 삭제했습니다.", "success");
  };
  return <div style={{ display: "grid", gap: 14 }}>
    <section style={styles.staffNoticeComposer}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div><div style={{ fontSize: 16, fontWeight: 950 }}>교직원 공지 보내기</div><div style={{ marginTop: 4, color: "#81796d", fontSize: 11 }}>전체 선생님 또는 특정 선생님·부서 계정에 개인 공지를 보냅니다.</div></div>
        <Megaphone size={22} color="#546a9a" />
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setTargetType("all")} style={{ ...styles.classChip, ...(targetType === "all" ? styles.classChipActive : {}) }}>전체 공지</button>
        <button type="button" onClick={() => setTargetType("individual")} style={{ ...styles.classChip, ...(targetType === "individual" ? styles.classChipActive : {}) }}>개인 공지</button>
      </div>
      {targetType === "individual" && <select value={targetId} onChange={event => setTargetId(event.target.value)} style={{ ...styles.loginInput, marginTop: 10 }}><option value="">— 대상 선택 —</option>{staff.map(item => <option key={`${item.accountType}-${item.id}`} value={`${item.accountType}:${item.id}`}>{item.name || item.id} · {item.displayRole}</option>)}</select>}
      <input value={title} onChange={event => setTitle(event.target.value)} placeholder="공지 제목" style={{ ...styles.loginInput, marginTop: 10 }} />
      <textarea value={body} onChange={event => setBody(event.target.value)} rows={5} placeholder="공지 내용을 입력하세요." style={styles.textareaInput} />
      <label style={{ display: "grid", gap: 5, marginTop: 10, maxWidth: 230, fontSize: 11, fontWeight: 850, color: "#6d665c" }}>
        마감일자 <span style={{ fontSize: 9.5, fontWeight: 650, color: "#999184" }}>선택 · 마감 3일 전부터 개인 알림 표시</span>
        <input type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} style={{ ...styles.loginInput, marginTop: 0 }} />
      </label>
      <button type="button" disabled={busy} onClick={submit} style={{ ...styles.primaryBtn, marginTop: 10 }}>{busy ? <Loader2 className="spin" size={14} /> : <Send size={14} />} 공지 보내기</button>
    </section>
    <section style={styles.card}>
      <div style={{ fontSize: 14, fontWeight: 950, marginBottom: 10 }}>등록한 교직원 공지</div>
      {!(notices || []).length ? <div style={styles.materialEmpty}>등록된 교직원 공지가 없습니다.</div> : <div style={{ display: "grid", gap: 8 }}>{(notices || []).map(item => <article key={item.id} style={styles.staffNoticeManageCard}><div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><div><div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><span style={styles.staffNoticeAudienceBadge}>{item.targetLabel || (item.targetType === "all" ? "전체 교직원" : "개인")}</span><b>{item.title}</b></div><div style={{ marginTop: 6, fontSize: 11.5, color: "#625b50", whiteSpace: "pre-wrap" }}>{item.body || "내용 없음"}</div><div style={{ marginTop: 7, fontSize: 9.8, color: "#9a9386" }}>{item.createdAt ? new Date(item.createdAt).toLocaleString("ko-KR") : ""} · 읽음 {(item.readBy || []).length}명{item.dueDate ? ` · 마감 ${item.dueDate}` : ""}</div></div><button type="button" onClick={() => remove(item.id)} style={styles.iconBtn}><Trash2 size={14} /></button></div></article>)}</div>}
    </section>
  </div>;
}
function deadlineAlertMeta(dateStr) {
  if (!dateStr) return null;
  const due = new Date(`${dateStr}T23:59:59`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const days = Math.round((dueDay - today) / 86400000);
  const label = days === 0 ? "오늘 마감" : days === 1 ? "내일 마감" : days > 1 ? `D-${days}` : `마감 ${Math.abs(days)}일 지남`;
  return { days, label, dueSoon: days >= 0 && days <= 3, overdue: days < 0 };
}
function noticeIdentity(item, fallback = "") {
  return String(item?.id || `${item?.title || ""}|${item?.text || item?.body || ""}|${item?.dueDate || ""}|${fallback}`);
}
function alertPreview(item) {
  return String(item?.text || item?.body || "").trim().slice(0, 120) || "내용 없음";
}
function TeacherPersonalAlertDock({ account, notices, announcements, persist, showToast, offsetTop = 210 }) {
  const [open, setOpen] = useState(false);
  const relevantAdmin = (notices || []).filter(item => staffNoticeAudience(item, account));
  const readKey = `${account?.accountType || "teacher"}:${account?.id}`;
  const authoredDue = [];
  Object.entries(announcements || {}).forEach(([noticeScope, targetMap]) => {
    Object.entries(targetMap || {}).forEach(([targetKey, rawList]) => {
      asNoticeArray(rawList).forEach(item => {
        const due = deadlineAlertMeta(item.dueDate);
        if (noticeAuthoredBy(item, account) && due?.dueSoon) authoredDue.push({ ...item, _scope: noticeScope, _targetKey: targetKey, _due: due });
      });
    });
  });
  const alertMap = new Map();
  relevantAdmin.forEach(item => {
    const unread = !(item.readBy || []).includes(readKey);
    const due = deadlineAlertMeta(item.dueDate);
    if (!unread && !due?.dueSoon) return;
    alertMap.set(`admin:${noticeIdentity(item)}`, { kind: "admin", item, unread, due: due?.dueSoon ? due : null });
  });
  authoredDue.forEach(item => alertMap.set(`own:${noticeIdentity(item, item._targetKey)}`, { kind: "own", item, unread: false, due: item._due }));
  const alerts = Array.from(alertMap.values()).sort((a, b) => ((a.due?.days ?? 99) - (b.due?.days ?? 99)) || Number(b.unread) - Number(a.unread));
  if (!alerts.length) return null;
  const unreadAdminCount = alerts.filter(alert => alert.kind === "admin" && alert.unread).length;
  const markOne = async id => {
    const next = (notices || []).map(item => item.id === id ? { ...item, readBy: Array.from(new Set([...(item.readBy || []), readKey])) } : item);
    await persist({ staffNotices: next });
  };
  const markAll = async () => {
    const unreadIds = new Set(relevantAdmin.filter(item => !(item.readBy || []).includes(readKey)).map(item => item.id));
    const next = (notices || []).map(item => unreadIds.has(item.id) ? { ...item, readBy: Array.from(new Set([...(item.readBy || []), readKey])) } : item);
    const ok = await persist({ staffNotices: next });
    if (ok) showToast("관리자 공지를 모두 읽음 처리했습니다.", "success");
  };
  return <div className="staff-notice-dock no-print" style={{ ...styles.staffNoticeDock, top: offsetTop }}>
    <button type="button" onClick={() => setOpen(value => !value)} style={{ ...styles.staffNoticeDockButton, ...styles.personalAlertDockButton }}>
      <BellRing size={17} /><span>개인 알림</span><strong style={styles.staffNoticeCount}>{alerts.length}</strong>
    </button>
    {open && <div style={styles.staffNoticePopup}>
      <div style={styles.staffNoticePopupHeader}>
        <div><b>개인 알림</b><div style={{ fontSize: 10, color: "#8b8390", marginTop: 2 }}>미확인 공지와 마감 임박 알림</div></div>
        {unreadAdminCount > 0 && <button type="button" onClick={markAll} style={styles.iconTextBtn}><CheckCheck size={13} /> 관리자 공지 모두 읽음</button>}
      </div>
      <div style={{ display: "grid", gap: 8, maxHeight: 390, overflowY: "auto" }}>
        {alerts.map((alert, index) => {
          const item = alert.item;
          const title = item.title || (alert.kind === "own" ? "내가 게시한 공지" : "관리자 공지");
          return <article key={`${alert.kind}-${noticeIdentity(item)}-${index}`} style={{ ...styles.personalAlertItem, ...(alert.unread ? styles.personalAlertItemUnread : {}) }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
              <span style={{ ...styles.personalAlertType, ...(alert.kind === "own" ? styles.personalAlertTypeOwn : styles.personalAlertTypeAdmin) }}>{alert.kind === "own" ? "내 공지" : "관리자"}</span>
              {alert.unread && <span style={styles.staffNoticeNew}>NEW</span>}
              {alert.due && <span style={styles.personalAlertDue}><Calendar size={10} /> {alert.due.label}</span>}
            </div>
            <div style={{ marginTop: 7, fontSize: 11.5, fontWeight: 900, color: "#302d35" }}>{title}</div>
            <div style={{ marginTop: 4, color: "#65606a", fontSize: 10.5, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{alertPreview(item)}</div>
            {alert.kind === "admin" && alert.unread && <button type="button" onClick={() => markOne(item.id)} style={styles.personalAlertAction}><Check size={11} /> 읽음 처리</button>}
          </article>;
        })}
      </div>
    </div>}
  </div>;
}
function StudentPersonalAlertDock({ sid, result, offsetTop = 88 }) {
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState(() => getReadIds(sid));
  useEffect(() => {
    setReadIds(getReadIds(sid));
    const refresh = event => { if (!event?.detail?.sid || String(event.detail.sid) === String(sid)) setReadIds(getReadIds(sid)); };
    window.addEventListener("kd-notice-read", refresh);
    return () => window.removeEventListener("kd-notice-read", refresh);
  }, [sid]);
  if (!result) return null;
  const subjectNotices = result.notices || [];
  const allNotices = [...subjectNotices, ...(result.homeroomNotices || [])];
  const alertMap = new Map();
  subjectNotices.forEach(item => {
    if (!item.id || readIds.has(item.id)) return;
    alertMap.set(noticeIdentity(item), { item, unread: true, due: deadlineAlertMeta(item.dueDate), source: item.subject ? `${item.subject} 공지` : "과목 공지" });
  });
  allNotices.forEach(item => {
    const due = deadlineAlertMeta(item.dueDate);
    if (!due?.dueSoon) return;
    const key = noticeIdentity(item);
    const previous = alertMap.get(key);
    alertMap.set(key, { item, unread: previous?.unread || false, due, source: previous?.source || (item.subject ? `${item.subject} 공지` : item.origin === "personal" ? "개인 공지" : "학급 공지") });
  });
  const alerts = Array.from(alertMap.values()).sort((a, b) => ((a.due?.days ?? 99) - (b.due?.days ?? 99)) || Number(b.unread) - Number(a.unread));
  if (!alerts.length) return null;
  const markOne = id => { markRead(sid, [id]); setReadIds(getReadIds(sid)); };
  return <div className="staff-notice-dock no-print" style={{ ...styles.staffNoticeDock, top: offsetTop }}>
    <button type="button" onClick={() => setOpen(value => !value)} style={{ ...styles.staffNoticeDockButton, ...styles.studentAlertDockButton }}>
      <BellRing size={17} /><span>개인 알림</span><strong style={styles.staffNoticeCount}>{alerts.length}</strong>
    </button>
    {open && <div style={styles.staffNoticePopup}>
      <div style={styles.staffNoticePopupHeader}><div><b>개인 알림</b><div style={{ fontSize: 10, color: "#8b8390", marginTop: 2 }}>수강 과목 미확인 공지와 마감 임박 일정</div></div></div>
      <div style={{ display: "grid", gap: 8, maxHeight: 390, overflowY: "auto" }}>
        {alerts.map((alert, index) => <article key={`${noticeIdentity(alert.item)}-${index}`} style={{ ...styles.personalAlertItem, ...(alert.unread ? styles.personalAlertItemUnread : {}) }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <span style={{ ...styles.personalAlertType, ...styles.personalAlertTypeStudent }}>{alert.source}</span>
            {alert.unread && <span style={styles.staffNoticeNew}>NEW</span>}
            {alert.due && <span style={styles.personalAlertDue}><Calendar size={10} /> {alert.due.label}</span>}
          </div>
          <div style={{ marginTop: 7, fontSize: 11.5, fontWeight: 900, color: "#302d35" }}>{alert.item.title || alert.item.category || "공지사항"}</div>
          <div style={{ marginTop: 4, color: "#65606a", fontSize: 10.5, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{alertPreview(alert.item)}</div>
          {alert.unread && <button type="button" onClick={() => markOne(alert.item.id)} style={styles.personalAlertAction}><Check size={11} /> 읽음 처리</button>}
        </article>)}
      </div>
    </div>}
  </div>;
}

/* ============ ADMIN ============ */
const ADMIN_TABS = [
  ["overview", <Database size={14} />, "현황"],
  ["roster", <FileSpreadsheet size={14} />, "이동수업 명단"],
  ["timetable", <FileText size={14} />, "학급 시간표"],
  ["abbrev", <Settings size={14} />, "약어 매핑"],
  ["notices", <ClipboardList size={14} />, "공지 현황"],
  ["verify", <Check size={14} />, "검증"],
];
function AdminConsole(props) {
  const [sub, setSub] = useState("timetable");
  return (
    <div style={styles.body}>
      <h1 style={styles.h1}>통합 관리자</h1>
      <p style={styles.pMuted}>시간표·성적 데이터와 계정·접근 권한을 한 곳에서 관리합니다.</p>
      <div className="admin-scope-sticky" style={styles.adminScopePanel}>
        <div style={styles.adminScopeIdentity}><Calendar size={16} /><div><b style={{ display: "block", fontSize: 11 }}>관리 범위</b><span style={{ display: "block", marginTop: 2, fontSize: 9.5, color: "#8a8578" }}>아래 선택은 모든 관리자 메뉴에 공통 적용됩니다.</span></div></div>
        <ScopeGroup label="학년">{GRADES.map(g => <ScopeBtn key={g} active={props.grade === g} disabled={DISABLED_GRADES.includes(g)} onClick={() => props.setGrade(g)}>{g}학년{DISABLED_GRADES.includes(g) ? " (준비중)" : ""}</ScopeBtn>)}</ScopeGroup>
        <ScopeGroup label="학기"><ScopeBtn active={props.semester === "sem1"} onClick={() => props.setSemester("sem1")}>1학기</ScopeBtn><ScopeBtn active={props.semester === "sem2"} onClick={() => props.setSemester("sem2")}>2학기</ScopeBtn></ScopeGroup>
        <div style={styles.adminScopeCaption}><span>현재</span><strong>{props.grade}학년 · {props.semester === "sem1" ? "1학기" : "2학기"}</strong></div>
      </div>
      <div style={styles.adminTabs}>
        <button onClick={() => setSub("timetable")} style={{ ...styles.adminTabBtn, ...(sub === "timetable" ? styles.adminTabBtnActive : {}) }}><ClipboardList size={14} /> 시간표 관리</button>
        <button onClick={() => setSub("grades")} style={{ ...styles.adminTabBtn, ...(sub === "grades" ? styles.adminTabBtnActive : {}) }}><FileSpreadsheet size={14} /> 성적 데이터</button>
        <button onClick={() => setSub("accounts")} style={{ ...styles.adminTabBtn, ...(sub === "accounts" ? styles.adminTabBtnActive : {}) }}><Lock size={14} /> 계정 관리</button>
        <button onClick={() => setSub("staffNotices")} style={{ ...styles.adminTabBtn, ...(sub === "staffNotices" ? styles.adminTabBtnActive : {}) }}><Megaphone size={14} /> 교직원 공지</button>
        <button onClick={() => setSub("feedback")} style={{ ...styles.adminTabBtn, ...(sub === "feedback" ? styles.adminTabBtnActive : {}) }}><Bug size={14} /> 건의·버그</button>
      </div>
      {sub === "timetable" && <AdminView key={props.scopeKey} {...props} onLogout={null} />}
      {sub === "grades" && (
        props.gdb ? <AdminGradesUpload gdb={props.gdb} persistGrades={props.persistGrades} showToast={props.showToast} roster={props.roster} currentGrade={props.grade} />
          : <div style={{ padding: 20, textAlign: "center" }}><Loader2 className="spin" size={18} /></div>
      )}
      {sub === "accounts" && <AdminAccountConsole {...props} />}
      {sub === "staffNotices" && <AdminStaffNoticePanel accounts={props.accounts} notices={props.db.staffNotices || []} persist={props.persist} showToast={props.showToast} />}
      {sub === "feedback" && <FeedbackAdminPanel feedback={props.db.feedback || []} persist={props.persist} showToast={props.showToast} />}
    </div>
  );
}

function AdminAccountConsole(props) {
  const [sub, setSub] = useState("staff");
  return (
    <div>
      <div style={{ ...styles.adminTabs, marginBottom: 14 }}>
        <button onClick={() => setSub("staff")} style={{ ...styles.adminTabBtn, ...(sub === "staff" ? styles.adminTabBtnActive : {}) }}><Users size={14} /> 교직원 계정·권한</button>
        <button onClick={() => setSub("students")} style={{ ...styles.adminTabBtn, ...(sub === "students" ? styles.adminTabBtnActive : {}) }}><Users size={14} /> 학생 계정</button>
        <button onClick={() => setSub("templates")} style={{ ...styles.adminTabBtn, ...(sub === "templates" ? styles.adminTabBtnActive : {}) }}><Download size={14} /> 양식·연결 진단</button>
      </div>
      {sub === "staff" && <AdminAccounts {...props} />}
      {sub === "students" && (
        <AdminStudentAccounts
          accounts={props.accounts}
          persistAccounts={props.persistAccounts}
          showToast={props.showToast}
          roster={props.roster}
          db={props.db}
          persist={props.persist}
          scopeKey={props.scopeKey}
        />
      )}
      {sub === "templates" && <AdminTemplateDownloads showToast={props.showToast} />}
    </div>
  );
}

function AdminView(props) {
  const perms = props.loggedInAdmin && Array.isArray(props.loggedInAdmin.permissions) ? props.loggedInAdmin.permissions : null; // null = full access
  const visibleTabs = ADMIN_TABS.filter(([k]) => !perms || perms.includes(k));
  const [sub, setSub] = useState(visibleTabs[0] ? visibleTabs[0][0] : "overview");
  useEffect(() => { if (!visibleTabs.find(([k]) => k === sub) && visibleTabs.length) setSub(visibleTabs[0][0]); }, [visibleTabs]); // eslint-disable-line
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={styles.h1}>관리자</h1>
          <p style={styles.pMuted}>{props.grade}학년 {props.semester === "sem1" ? "1학기" : "2학기"} 데이터를 관리합니다. 약어 매핑·계정은 전체 공통입니다.</p>
        </div>
        {props.onLogout && <button style={styles.secondaryBtn} onClick={props.onLogout}>로그아웃</button>}
      </div>
      <div style={styles.adminTabs}>
        {visibleTabs.map(([k, ic, lb]) => (
          <button key={k} onClick={() => setSub(k)} style={{ ...styles.adminTabBtn, ...(sub === k ? styles.adminTabBtnActive : {}) }}>{ic}{lb}</button>
        ))}
      </div>
      {visibleTabs.length === 0 && <div style={styles.warnBanner}><AlertTriangle size={14} /> 접근 가능한 메뉴가 없습니다. 관리자에게 문의해주세요.</div>}
      {sub === "overview" && <AdminOverview {...props} />}
      {sub === "roster" && <AdminRoster {...props} />}
      {sub === "timetable" && <AdminTimetable {...props} />}
      {sub === "abbrev" && <AdminAbbrev {...props} />}
      {sub === "notices" && <AdminNoticesViewer {...props} />}
      {sub === "verify" && <AdminVerify {...props} />}
    </div>
  );
}
function StatCard({ label, value, unit }) { return <div style={styles.statCard}><div style={styles.statValue}>{value}<span style={styles.statUnit}>{unit}</span></div><div style={styles.statLabel}>{label}</div></div>; }

function ReadOnlyGrid({ grid }) {
  if (!grid) return null;
  return (
    <table style={styles.editTable}>
      <colgroup><col style={{ width: "13%" }} />{DAYS.map(d => <col key={d} style={{ width: "17.4%" }} />)}</colgroup>
      <thead><tr><th style={styles.thPeriod}>교시</th>{DAYS.map(d => <th key={d} style={styles.th}>{d}</th>)}</tr></thead>
      <tbody>{PERIODS.map((p, pi) => <tr key={p}><td style={styles.tdPeriod}>{p}교시</td>{DAYS.map(day => <td key={day} style={styles.tdReadonly}>{(grid[day] || [])[pi] || <span style={{ color: "#d8d3c6" }}>–</span>}</td>)}</tr>)}</tbody>
    </table>
  );
}
function CurrentTimetableViewer({ timetables }) {
  const classes = Object.keys(timetables).sort((a, b) => a - b);
  const [view, setView] = useState(null);
  useEffect(() => { if (classes.length && (!view || !classes.includes(view))) setView(classes[0]); }, [classes]); // eslint-disable-line
  if (!classes.length) return <div style={{ fontSize: 12.5, color: "#a39d8c" }}>아직 등록된 시간표가 없습니다.</div>;
  return (
    <div>
      <div style={styles.classChips}>{classes.map(c => <button key={c} onClick={() => setView(c)} style={{ ...styles.classChip, ...(view === c ? styles.classChipActive : {}) }}>{c}반</button>)}</div>
      {view && <ReadOnlyGrid grid={timetables[view]} />}
    </div>
  );
}

function AdminOverview({ roster, enrollments, timetables, scopeKey, db, persist, showToast }) {
  const classes = Object.keys(timetables).sort((a, b) => a - b);
  const clearAll = async () => {
    const ok = await persist({ roster: { ...db.roster, [scopeKey]: {} }, enrollments: { ...db.enrollments, [scopeKey]: {} }, timetables: { ...db.timetables, [scopeKey]: {} } });
    if (ok) showToast("이 학년/학기의 모든 데이터를 삭제했습니다.", "success");
  };
  return (
    <div>
      <div style={styles.statGrid}>
        <StatCard label="등록 학생 수" value={Object.keys(roster).length} unit="명" />
        <StatCard label="선택과목 기록" value={Object.values(enrollments).reduce((a, l) => a + l.length, 0)} unit="건" />
        <StatCard label="시간표 등록 반" value={classes.length} unit="개 반" />
      </div>
      <div style={styles.infoBox}>
        <div style={{ fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><Eye size={15} /> 현재 반영된 학급 시간표</div>
        <CurrentTimetableViewer timetables={timetables} />
      </div>
      {(Object.keys(roster).length > 0 || classes.length > 0) && <button style={styles.dangerBtn} onClick={clearAll}><Trash2 size={14} /> 이 학년/학기 데이터 전체 삭제</button>}
    </div>
  );
}

function AdminRoster({ scopeKey, db, persist, showToast, roster, enrollments, semester }) {
  const fileRef = useRef(null);
  const [parsed, setParsed] = useState(null); // { sheets: [...], letters: [{letter, count}] }
  const [selectedLetters, setSelectedLetters] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const handleFile = async (file) => {
    setBusy(true);
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheets = [];
      for (const sn of wb.SheetNames) {
        const m = sn.match(/^(.+)_(\d+)반_(.+)$/);
        if (!m) continue;
        const [, subject, host, group] = m;
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null });
        const hi = rows.findIndex(r => r && r.includes("학번"));
        if (hi === -1) continue;
        const idx = {}; rows[hi].forEach((h, i) => { if (h) idx[h] = i; });
        const students = [];
        for (let i = hi + 1; i < rows.length; i++) {
          const row = rows[i]; if (!row) continue;
          const sr = row[idx["학번"]]; if (!sr || sr === 0 || sr === "0") continue;
          const name = row[idx["성명"]]; if (!name) continue;
          students.push({ sid: String(sr), name, class: row[idx["반"]], number: row[idx["번호"]], gender: row[idx["성별"]] });
        }
        const letter = (group.trim().match(/^[A-Za-z]/) || [group.trim()[0]])[0];
        sheets.push({ subject: subject.trim(), host: parseInt(host, 10), group: group.trim(), letter, students });
      }
      if (!sheets.length) { showToast("시트 이름 형식(과목명_N반_그룹)을 인식하지 못했습니다.", "error"); setBusy(false); return; }
      const letterCounts = {};
      sheets.forEach(s => { letterCounts[s.letter] = (letterCounts[s.letter] || 0) + 1; });
      const letters = Object.keys(letterCounts).sort().map(l => ({ letter: l, count: letterCounts[l] }));
      // Default selection: A–F for 1학기, G–L for 2학기 (real workbooks bundle both semesters' groups in one file)
      const semGroupRe = semester === "sem2" ? /^[G-L]/ : /^[A-F]/;
      const defaultSelected = new Set(letters.filter(l => semGroupRe.test(l.letter)).map(l => l.letter));
      setParsed({ sheets });
      setSelectedLetters(defaultSelected.size ? defaultSelected : new Set(letters.map(l => l.letter)));
      showToast("파일을 업로드했습니다.", "success");
    } catch (e) { showToast(`실패했습니다. (${e.message})`, "error"); } finally { setBusy(false); }
  };

  const filteredStats = useMemo(() => {
    if (!parsed) return null;
    const nr = {}, ne = {};
    let sheetCount = 0;
    parsed.sheets.forEach(s => {
      if (!selectedLetters.has(s.letter)) return;
      sheetCount++;
      s.students.forEach(st => {
        if (!nr[st.sid]) nr[st.sid] = { name: st.name, class: st.class, number: st.number, gender: st.gender };
        (ne[st.sid] = ne[st.sid] || []).push({ subject: s.subject, group: s.group, hostClass: s.host });
      });
    });
    return { nr, ne, sheetCount };
  }, [parsed, selectedLetters]);

  const toggleLetter = (letter) => setSelectedLetters(prev => { const s = new Set(prev); if (s.has(letter)) s.delete(letter); else s.add(letter); return s; });

  const apply = async () => {
    const ok = await persist({ roster: { ...db.roster, [scopeKey]: filteredStats.nr }, enrollments: { ...db.enrollments, [scopeKey]: filteredStats.ne }, meta: { ...db.meta, [scopeKey]: { updatedAt: new Date().toISOString() } } });
    if (ok) { showToast("저장했습니다.", "success"); setParsed(null); }
  };
  return (
    <div>
      <div style={styles.uploadBox}>
        <FileSpreadsheet size={22} color="#8a8578" />
        <div style={{ fontWeight: 700, marginTop: 8 }}>이동수업 명단(출석부) 엑셀 업로드</div>
        <div style={{ fontSize: 12.5, color: "#8a8578", margin: "4px 0 12px", textAlign: "center" }}>시트 이름 = "과목명_N반_그룹" (예: 사회와 문화_5반_A)<br />N반 = 그 수업이 열리는 개설반<br />업로드 후 아래에서 어떤 그룹(학기)을 포함할지 직접 선택할 수 있습니다.</div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
        <button style={styles.uploadBtn} onClick={() => fileRef.current.click()} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}{busy ? "분석 중…" : "파일 선택"}</button>
      </div>
      {parsed && filteredStats && (
        <div style={styles.previewBox}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>포함할 그룹 선택</div>
          <div style={{ fontSize: 12, color: "#8a8578", marginBottom: 10 }}>파일 안에서 발견된 그룹 알파벳입니다. 지금 선택된 학기({semester === "sem2" ? "2학기" : "1학기"})에 맞는 그룹이 기본으로 체크되어 있습니다 — 필요하면 직접 켜고 꺼주세요.</div>
          <div style={styles.classChips}>
            {Array.from(new Set(parsed.sheets.map(s => s.letter))).sort().map(letter => (
              <button key={letter} onClick={() => toggleLetter(letter)} style={{ ...styles.classChip, ...(selectedLetters.has(letter) ? styles.classChipActive : {}) }}>
                {selectedLetters.has(letter) ? "✓ " : ""}{letter}그룹
              </button>
            ))}
          </div>
          <div style={styles.statGrid}><StatCard label="반영될 시트" value={filteredStats.sheetCount} unit="개" /><StatCard label="학생" value={Object.keys(filteredStats.nr).length} unit="명" /><StatCard label="선택과목" value={Object.values(filteredStats.ne).reduce((a, l) => a + l.length, 0)} unit="건" /></div>
          <div style={{ display: "flex", gap: 8 }}><button style={styles.primaryBtn} onClick={apply} disabled={filteredStats.sheetCount === 0}><Save size={14} /> 반영하기</button><button style={styles.secondaryBtn} onClick={() => setParsed(null)}>취소</button></div>
        </div>
      )}
      {!parsed && Object.keys(roster).length > 0 && <CurrentRosterViewer roster={roster} enrollments={enrollments} />}
      {Object.keys(roster).length > 0 && !parsed && <button style={styles.dangerBtn} onClick={async () => { const ok = await persist({ roster: { ...db.roster, [scopeKey]: {} }, enrollments: { ...db.enrollments, [scopeKey]: {} } }); if (ok) showToast("명단을 삭제했습니다.", "success"); }}><Trash2 size={14} /> 명단 삭제</button>}
    </div>
  );
}

function CurrentRosterViewer({ roster, enrollments }) {
  const [tab, setTab] = useState("class");
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedSubjectKey, setSelectedSubjectKey] = useState(null);

  const byClass = useMemo(() => {
    const m = {};
    Object.entries(roster).forEach(([sid, s]) => { (m[s.class] = m[s.class] || []).push({ sid, ...s }); });
    Object.values(m).forEach(list => list.sort((a, b) => a.number - b.number));
    return Object.entries(m).sort((a, b) => a[0] - b[0]);
  }, [roster]);

  const bySubject = useMemo(() => {
    const m = {};
    Object.entries(enrollments).forEach(([sid, list]) => {
      list.forEach(c => {
        const key = `${c.subject} (${c.group}) · ${c.hostClass}반개설`;
        (m[key] = m[key] || []).push({ sid, ...(roster[sid] || {}) });
      });
    });
    Object.values(m).forEach(list => list.sort((a, b) => (a.class - b.class) || (a.number - b.number)));
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length);
  }, [enrollments, roster]);

  useEffect(() => { if (byClass.length && !selectedClass) setSelectedClass(byClass[0][0]); }, [byClass]); // eslint-disable-line
  useEffect(() => { if (bySubject.length && !selectedSubjectKey) setSelectedSubjectKey(bySubject[0][0]); }, [bySubject]); // eslint-disable-line

  const StudentTable = ({ list }) => (
    <table style={styles.editTable}>
      <thead><tr><th style={styles.th}>학번</th><th style={styles.th}>이름</th><th style={styles.th}>반</th><th style={styles.th}>번호</th></tr></thead>
      <tbody>{list.map(s => <tr key={s.sid}><td style={styles.tdReadonly}>{s.sid}</td><td style={styles.tdReadonly}>{s.name}</td><td style={styles.tdReadonly}>{s.class}반</td><td style={styles.tdReadonly}>{s.number}</td></tr>)}</tbody>
    </table>
  );

  return (
    <div style={styles.infoBox}>
      <div style={{ fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><Eye size={15} /> 현재 저장된 출석부 (실제 반영된 데이터)</div>
      <div style={styles.statGrid}>
        <StatCard label="전체 학생" value={Object.keys(roster).length} unit="명" />
        <StatCard label="반 수" value={byClass.length} unit="개" />
        <StatCard label="개설 과목·그룹" value={bySubject.length} unit="개" />
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button style={{ ...styles.classChip, ...(tab === "class" ? styles.classChipActive : {}) }} onClick={() => setTab("class")}>반별 명단</button>
        <button style={{ ...styles.classChip, ...(tab === "subject" ? styles.classChipActive : {}) }} onClick={() => setTab("subject")}>과목·그룹별 명단</button>
      </div>
      {tab === "class" && (
        <div>
          <div style={styles.classChips}>{byClass.map(([cls, list]) => <button key={cls} onClick={() => setSelectedClass(cls)} style={{ ...styles.classChip, ...(selectedClass === cls ? styles.classChipActive : {}) }}>{cls}반 ({list.length}명)</button>)}</div>
          {selectedClass && <div style={{ maxHeight: 360, overflowY: "auto" }}><StudentTable list={(byClass.find(([c]) => c === selectedClass) || [null, []])[1]} /></div>}
        </div>
      )}
      {tab === "subject" && (
        <div>
          <select value={selectedSubjectKey || ""} onChange={e => setSelectedSubjectKey(e.target.value)} style={{ ...styles.loginInput, marginBottom: 10, width: "100%" }}>
            {bySubject.map(([key, list]) => <option key={key} value={key}>{key} — {list.length}명</option>)}
          </select>
          {selectedSubjectKey && <div style={{ maxHeight: 360, overflowY: "auto" }}><StudentTable list={(bySubject.find(([k]) => k === selectedSubjectKey) || [null, []])[1]} /></div>}
        </div>
      )}
    </div>
  );
}

/* ---------- spreadsheet-style editable grid with native paste ---------- */
function EditableTimetableGrid({ grid, setGrid }) {
  const handlePaste = (e, dayIdx, periodIdx) => {
    const rows = clipboardToGrid(e);
    if (!rows) return; // let default paste happen (single cell text)
    e.preventDefault();
    setGrid(g => {
      const copy = {}; DAYS.forEach(d => { copy[d] = [...g[d]]; });
      rows.forEach((rowCells, ri) => {
        const p = periodIdx + ri;
        if (p > 6) return;
        rowCells.forEach((val, ci) => {
          const d = dayIdx + ci;
          if (d > 4) return;
          const v = (val || "").trim();
          copy[DAYS[d]][p] = v && v !== "-" ? v : null;
        });
      });
      return copy;
    });
  };
  return (
    <table style={styles.editTable}>
      <colgroup><col style={{ width: "13%" }} />{DAYS.map(d => <col key={d} style={{ width: "17.4%" }} />)}</colgroup>
      <thead><tr><th style={styles.thPeriod}>교시</th>{DAYS.map(d => <th key={d} style={styles.th}>{d}</th>)}</tr></thead>
      <tbody>
        {PERIODS.map((p, pi) => (
          <tr key={p}>
            <td style={styles.tdPeriod}>{p}교시</td>
            {DAYS.map((day, di) => (
              <td key={day} style={styles.tdEdit}>
                <input
                  value={grid[day][pi] || ""}
                  onChange={e => setGrid(g => { const c = { ...g, [day]: [...g[day]] }; c[day][pi] = e.target.value || null; return c; })}
                  onPaste={e => handlePaste(e, di, pi)}
                  style={styles.cellInput}
                  placeholder="-"
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AdminTimetable({ scopeKey, db, persist, showToast, timetables, grade, enrollments, abbrevMap, persistAbbrev }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [pasteClass, setPasteClass] = useState("");
  const [pasteGrid, setPasteGrid] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [editing, setEditing] = useState(null);

  const handleFile = async (file) => {
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      let result;
      if (/\.hwp$/i.test(file.name)) {
        const byGrade = parseHwpTimetables(buf);
        result = byGrade[grade] || {};
        if (!Object.keys(result).length) { showToast(`한글 파일에서 ${grade}학년 시간표를 찾지 못했습니다. (파일에 있는 학년: ${Object.keys(byGrade).join(", ") || "없음"})`, "error"); setBusy(false); return; }
      } else {
        const XLSX = await loadXLSX();
        result = parseTimetableWorkbook(XLSX, XLSX.read(buf, { type: "array" }));
        if (!Object.keys(result).length) { showToast("시트 이름이 반 번호(1, 2, 3…)인 시트를 찾지 못했습니다.", "error"); setBusy(false); return; }
      }
      setFilePreview(result); setEditing(Object.keys(result).sort((a, b) => a - b)[0]);
      showToast("파일을 업로드했습니다.", "success");
    } catch (e) { showToast(`실패했습니다. (${e.message})`, "error"); console.error(e); } finally { setBusy(false); }
  };

  const startPasteEntry = () => {
    if (!pasteClass.trim()) { showToast("반 번호를 먼저 입력해주세요.", "error"); return; }
    const existing = timetables[pasteClass.trim()];
    setPasteGrid(existing ? JSON.parse(JSON.stringify(existing)) : emptyGrid());
  };

  const commitAny = async (gridsMap) => {
    const merged = { ...(db.timetables[scopeKey] || {}), ...gridsMap };
    const ok = await persist({ timetables: { ...db.timetables, [scopeKey]: merged }, meta: { ...db.meta, [scopeKey]: { updatedAt: new Date().toISOString() } } });
    if (!ok) return false;
    const used = new Set();
    Object.values(merged).forEach(g => DAYS.forEach(d => (g[d] || []).forEach(c => { if (isMoveSlot(c)) used.add(moveSlotAbbrev(c)); })));
    const subjects = new Set(); Object.values(enrollments).forEach(l => l.forEach(c => subjects.add(c.subject)));
    const missing = Array.from(used).filter(a => !abbrevMap[a]);
    if (missing.length && subjects.size) {
      const sug = suggestAbbrevMapping(missing, Array.from(subjects));
      if (Object.keys(sug).length) { await persistAbbrev(grade, { ...abbrevMap, ...sug }); showToast("저장했습니다.", "success"); return true; }
    }
    showToast("저장했습니다.", "success");
    return true;
  };

  const applyFilePreview = async () => { if (await commitAny(filePreview)) setFilePreview(null); };
  const applyPasteGrid = async () => { if (await commitAny({ [pasteClass.trim()]: pasteGrid })) { setPasteGrid(null); setPasteClass(""); } };

  const updFilePreviewCell = (cls, day, pi, v) => setFilePreview(p => { const c = { ...p }; c[cls] = { ...c[cls], [day]: [...c[cls][day]] }; c[cls][day][pi] = v || null; return c; });

  return (
    <div>
      <div style={styles.uploadBox}>
        <FileText size={22} color="#8a8578" />
        <div style={{ fontWeight: 700, marginTop: 8 }}>학급 시간표 업로드 (한글 .hwp / 엑셀 .xlsx)</div>
        <div style={{ fontSize: 12.5, color: "#8a8578", margin: "4px 0 12px", textAlign: "center" }}>
          <b>한글 파일</b>: "N학년 N반 시간표" 제목과 표가 있는 hwp를 그대로 올리면 자동 인식됩니다.<br />
          <b>엑셀 파일</b>: 시트 이름 = 반 번호, 1행 "교시 월 화 수 목 금", 2~8행에 1~7교시.
        </div>
        <input ref={fileRef} type="file" accept=".hwp,.xlsx,.xls" style={{ display: "none" }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
        <button style={styles.uploadBtn} onClick={() => fileRef.current.click()} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}{busy ? "분석 중…" : "파일 선택"}</button>
      </div>

      {filePreview && (
        <div style={styles.previewBox}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>파일에서 인식된 반: {Object.keys(filePreview).sort((a, b) => a - b).join(", ")}반 (반영 전 미리보기)</div>
          <div style={styles.classChips}>{Object.keys(filePreview).sort((a, b) => a - b).map(c => <button key={c} onClick={() => setEditing(c)} style={{ ...styles.classChip, ...(editing === c ? styles.classChipActive : {}) }}>{c}반</button>)}</div>
          {editing && filePreview[editing] && (
            <table style={styles.editTable}>
              <colgroup><col style={{ width: "13%" }} />{DAYS.map(d => <col key={d} style={{ width: "17.4%" }} />)}</colgroup>
              <thead><tr><th style={styles.thPeriod}>교시</th>{DAYS.map(d => <th key={d} style={styles.th}>{d}</th>)}</tr></thead>
              <tbody>{PERIODS.map((p, pi) => <tr key={p}><td style={styles.tdPeriod}>{p}교시</td>{DAYS.map(day => <td key={day} style={styles.tdEdit}><input value={filePreview[editing][day][pi] || ""} onChange={e => updFilePreviewCell(editing, day, pi, e.target.value)} style={styles.cellInput} placeholder="-" /></td>)}</tr>)}</tbody>
            </table>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}><button style={styles.primaryBtn} onClick={applyFilePreview}><Save size={14} /> 반영하기 (약어 자동매핑 포함)</button><button style={styles.secondaryBtn} onClick={() => setFilePreview(null)}>취소</button></div>
        </div>
      )}

      <div style={styles.pasteBox}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>표 붙여넣기로 등록 (엑셀·한글에서 표를 복사해 아래 표에 그대로 붙여넣기)</div>
        <div style={{ fontSize: 12, color: "#8a8578", marginBottom: 8 }}>반 번호를 입력하고 "시작"을 누르면 빈 시간표 칸이 나타납니다. 첫 칸(월요일 1교시)을 클릭한 뒤, 엑셀·한글에서 복사한 표를 그대로 붙여넣으면(Ctrl+V) 내용이 칸마다 자동으로 채워집니다.</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12.5, color: "#8a8578" }}>반 번호:</span>
          <input value={pasteClass} onChange={e => setPasteClass(e.target.value)} placeholder="예: 4" style={{ ...styles.cellInput, border: `1px solid ${COLORS.line}`, width: 70, borderRadius: 6 }} />
          <button style={styles.secondaryBtn} onClick={startPasteEntry}>{pasteGrid ? "다시 시작" : "시작"}</button>
        </div>
        {pasteGrid && (
          <>
            <EditableTimetableGrid grid={pasteGrid} setGrid={setPasteGrid} />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}><button style={styles.primaryBtn} onClick={applyPasteGrid}><Save size={14} /> {pasteClass}반 시간표 반영</button><button style={styles.secondaryBtn} onClick={() => setPasteGrid(null)}>취소</button></div>
          </>
        )}
      </div>

      {!filePreview && !pasteGrid && (
        <div style={styles.infoBox}>
          <div style={{ fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><Eye size={15} /> 현재 등록된 학급 시간표</div>
          <CurrentTimetableViewer timetables={timetables} />
          {Object.keys(timetables).length > 0 && <button style={styles.dangerBtn} onClick={async () => { const ok = await persist({ timetables: { ...db.timetables, [scopeKey]: {} } }); if (ok) showToast("시간표를 삭제했습니다.", "success"); }}><Trash2 size={14} /> 시간표 삭제</button>}
        </div>
      )}

      {!filePreview && !pasteGrid && Object.keys(timetables).length > 0 && (
        <RoomNameEditor scopeKey={scopeKey} db={db} persist={persist} showToast={showToast} timetables={timetables} />
      )}
    </div>
  );
}

function RoomNameEditor({ scopeKey, db, persist, showToast, timetables }) {
  const classes = Object.keys(timetables).sort((a, b) => a - b);
  const [rows, setRows] = useState(() => classes.map(c => [c, (db.roomNames[scopeKey] || {})[c] || ""]));
  const prevScopeRef = useRef(scopeKey);
  useEffect(() => {
    if (prevScopeRef.current !== scopeKey) {
      prevScopeRef.current = scopeKey;
      setRows(classes.map(c => [c, (db.roomNames[scopeKey] || {})[c] || ""]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  const save = async () => {
    const current = db.roomNames[scopeKey] || {};
    const map = { ...current };
    rows.forEach(([c, label]) => { if (label.trim()) map[c] = label.trim(); else delete map[c]; });
    const ok = await persist({ roomNames: { ...db.roomNames, [scopeKey]: map } });
    if (ok) showToast("저장했습니다.", "success");
  };

  return (
    <div style={styles.infoBox}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>특별실 명칭 지정</div>
      <div style={{ fontSize: 12, color: "#8a8578", marginBottom: 10 }}>실제 학급이 아닌 이동수업 전용실(예: 11반 → 인문사회교과실2)처럼, 시간표에 표시될 이름을 반별로 바꿀 수 있습니다. 비워두면 "N반"으로 표시됩니다.</div>
      <table style={styles.editTable}>
        <thead><tr><th style={styles.th}>반 번호</th><th style={styles.th}>표시될 이름</th></tr></thead>
        <tbody>
          {rows.map(([c, label], i) => (
            <tr key={c}>
              <td style={styles.tdReadonly}>{c}반</td>
              <td style={styles.tdEdit}><input value={label} onChange={e => setRows(rs => { const copy = [...rs]; copy[i] = [c, e.target.value]; return copy; })} style={styles.cellInput} placeholder={`${c}반`} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button style={{ ...styles.primaryBtn, marginTop: 10 }} onClick={save}><Save size={14} /> 저장</button>
    </div>
  );
}

function AdminAbbrev({ abbrevMap, persistAbbrev, showToast, db, grade }) {
  const [rows, setRows] = useState(Object.entries(abbrevMap));
  useEffect(() => { setRows(Object.entries(abbrevMap)); }, [abbrevMap]);
  const used = useMemo(() => {
    const s = new Set();
    Object.entries(db.timetables || {}).forEach(([sk, sc]) => {
      if (!sk.startsWith(grade + "-")) return;
      Object.values(sc).forEach(g => DAYS.forEach(d => (g[d] || []).forEach(c => { if (isMoveSlot(c)) s.add(moveSlotAbbrev(c)); })));
    });
    return s;
  }, [db, grade]);
  const missing = Array.from(used).filter(a => !abbrevMap[a]);
  const autoFill = async () => {
    const subjects = new Set();
    Object.entries(db.enrollments || {}).forEach(([sk, sc]) => { if (sk.startsWith(grade + "-")) Object.values(sc).forEach(l => l.forEach(c => subjects.add(c.subject))); });
    if (!subjects.size) { showToast("먼저 이동수업 명단을 업로드해주세요.", "error"); return; }
    const sug = suggestAbbrevMapping(missing, Array.from(subjects));
    if (!Object.keys(sug).length) { showToast("자동으로 매칭할 수 있는 항목이 없습니다.", "error"); return; }
    const ok = await persistAbbrev(grade, { ...abbrevMap, ...sug });
    if (ok) showToast(`${Object.keys(sug).length}개 약어를 자동 매핑했습니다.`, "success");
  };
  const save = async () => { const m = {}; rows.forEach(([k, v]) => { if (k.trim()) m[k.trim()] = v.trim(); }); const ok = await persistAbbrev(grade, m); if (ok) showToast("저장했습니다.", "success"); };
  return (
    <div>
      <div style={styles.infoBox}><div style={{ fontSize: 12.5, color: "#5c574a" }}>이 매핑은 {grade}학년의 1학기·2학기에 공통 적용됩니다. (다른 학년과는 별도로 관리됩니다)</div></div>
      {missing.length > 0 && (
        <div style={styles.warnBanner}>
          <AlertTriangle size={14} /> 매핑 없는 약어: {missing.join(", ")}
          <button style={{ ...styles.secondaryBtn, padding: "4px 10px", fontSize: 11.5, marginLeft: "auto" }} onClick={autoFill}>자동 매핑</button>
        </div>
      )}
      <table style={styles.editTable}>
        <thead><tr><th style={styles.th}>약어</th><th style={styles.th}>정식 과목명</th><th style={{ ...styles.th, width: 40 }}></th></tr></thead>
        <tbody>{rows.map(([k, v], i) => <tr key={i}><td style={styles.tdEdit}><input value={k} onChange={e => setRows(rs => { const c = [...rs]; c[i] = [e.target.value, v]; return c; })} style={styles.cellInput} /></td><td style={styles.tdEdit}><input value={v} onChange={e => setRows(rs => { const c = [...rs]; c[i] = [k, e.target.value]; return c; })} style={styles.cellInput} /></td><td style={styles.tdEdit}><button style={styles.iconBtn} onClick={() => setRows(rs => rs.filter((_, x) => x !== i))}><X size={14} /></button></td></tr>)}</tbody>
      </table>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}><button style={styles.secondaryBtn} onClick={() => setRows(rs => [...rs, ["", ""]])}>+ 행 추가</button><button style={styles.primaryBtn} onClick={save}><Save size={14} /> 저장</button></div>
    </div>
  );
}

function ImeSafeInput({ value, onValueChange, ...props }) {
  const [draft, setDraft] = useState(String(value ?? ""));
  const composingRef = useRef(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!composingRef.current && document.activeElement !== inputRef.current) setDraft(String(value ?? ""));
  }, [value]);

  return (
    <input
      {...props}
      ref={inputRef}
      value={draft}
      lang="ko"
      onCompositionStart={() => { composingRef.current = true; }}
      onCompositionEnd={event => {
        composingRef.current = false;
        const next = event.currentTarget.value;
        setDraft(next);
        onValueChange(next);
      }}
      onChange={event => {
        const next = event.target.value;
        setDraft(next);
        if (!composingRef.current) onValueChange(next);
      }}
      onBlur={() => onValueChange(draft)}
    />
  );
}

function AdminAccounts({ accounts, persistAccounts, showToast, db, grade, scopeKey, semester }) {
  const normalizeTeachers = list => (list || []).map(teacher => applyAutomaticTeacherAccess(teacher, teacherRoleGrade(teacher) || grade));
  const [admins, setAdmins] = useState(accounts.admin);
  const [departments, setDepartments] = useState(() => (accounts.departments || []).map(item => ({
    ...item,
    gradeAccessGrades: normalizeGradeAccessList(item.gradeAccessGrades),
    timetableAccessGrades: normalizeGradeAccessList(item.timetableAccessGrades),
  })));
  const [teachers, setTeachers] = useState(() => normalizeTeachers(accounts.teacher));
  const [teacherSearch, setTeacherSearch] = useState("");
  const [teacherRoleFilter, setTeacherRoleFilter] = useState("all");
  useEffect(() => {
    setAdmins(accounts.admin);
    setDepartments((accounts.departments || []).map(item => ({
      ...item,
      gradeAccessGrades: normalizeGradeAccessList(item.gradeAccessGrades),
      timetableAccessGrades: normalizeGradeAccessList(item.timetableAccessGrades),
    })));
    setTeachers(normalizeTeachers(accounts.teacher));
  }, [accounts]); // eslint-disable-line

  const save = async () => {
    const cleanAdmins = list => list.filter(item => item.id.trim() && item.pw).map(item => ({ id: item.id.trim(), pw: item.pw, permissions: item.permissions || [] }));
    const cleanDepartments = list => list.filter(item => String(item.id || "").trim() && item.pw).map(item => ({
      name: String(item.name || "").trim() || "부서 계정",
      id: String(item.id || "").trim(),
      pw: item.pw,
      gradeAccessGrades: normalizeGradeAccessList(item.gradeAccessGrades),
      timetableAccessGrades: normalizeGradeAccessList(item.timetableAccessGrades),
    }));
    const cleanTeachers = teachers
      .filter(teacher => teacher.id.trim() && teacher.pw)
      .map(teacher => {
        const normalized = applyAutomaticTeacherAccess(teacher, grade);
        return {
          id: normalized.id.trim(), pw: normalized.pw, name: (normalized.name || "").trim(),
          teacherRole: normalized.teacherRole, roleGrade: normalized.roleGrade,
          homeroomClass: normalized.homeroomClass || "",
          gradeAccessGrades: normalized.gradeAccessGrades,
          timetableAccessGrades: normalized.timetableAccessGrades,
          assignments: (normalized.assignments || []).filter(assignment => assignment.subject && assignment.targets.trim()),
        };
      });
    const ok = await persistAccounts({
      admin: cleanAdmins(admins), classView: accounts.classView || [], departments: cleanDepartments(departments), teacher: cleanTeachers,
      teacherPending: accounts.teacherPending || [], monitors: accounts.monitors || [], students: accounts.students || [],
    });
    if (ok) showToast("저장했습니다.", "success");
  };

  const resetAll = async () => {
    const nextAdmins = admins.map(item => ({ ...item, pw: RESET_PASSWORD }));
    const nextDepartments = departments.map(item => ({ ...item, pw: RESET_PASSWORD }));
    const nextTeachers = teachers.map(item => ({ ...item, pw: RESET_PASSWORD }));
    setAdmins(nextAdmins); setDepartments(nextDepartments); setTeachers(nextTeachers);
    const ok = await persistAccounts({
      admin: nextAdmins, classView: accounts.classView || [], departments: nextDepartments, teacher: nextTeachers,
      teacherPending: accounts.teacherPending || [], monitors: accounts.monitors || [], students: accounts.students || [],
    });
    if (ok) showToast(`모든 비밀번호가 "${RESET_PASSWORD}"로 초기화되었습니다.`, "success");
  };

  const approve = async req => {
    const approved = applyAutomaticTeacherAccess({
      ...req,
      teacherRole: req.teacherRole || (req.homeroomClass ? "homeroom" : "other"),
      roleGrade: req.roleGrade || grade,
    }, grade);
    const newTeachers = [...teachers, approved];
    const newPending = (accounts.teacherPending || []).filter(item => item.id !== req.id);
    const ok = await persistAccounts({
      admin: accounts.admin, classView: accounts.classView, departments: accounts.departments || [], teacher: newTeachers,
      teacherPending: newPending, monitors: accounts.monitors || [], students: accounts.students || [],
    });
    if (ok) showToast(`${req.name} 선생님 계정을 승인했습니다.`, "success");
  };
  const reject = async req => {
    const newPending = (accounts.teacherPending || []).filter(item => item.id !== req.id);
    const ok = await persistAccounts({ ...accounts, teacherPending: newPending });
    if (ok) showToast("가입 신청을 거절했습니다.", "success");
  };

  const addTeacher = () => setTeachers(current => [...current, applyAutomaticTeacherAccess({
    name: "", id: "", pw: "", teacherRole: "other", roleGrade: grade,
    homeroomClass: "", gradeAccessGrades: [], timetableAccessGrades: [],
    assignments: [{ kind: "elective", subject: "", targets: "" }],
  }, grade)]);
  const updateTeacherField = (index, key, value) => setTeachers(current => current.map((teacher, itemIndex) => (
    itemIndex === index ? { ...teacher, [key]: value } : teacher
  )));
  const updateTeacherRole = (index, role) => setTeachers(current => current.map((teacher, itemIndex) => {
    if (itemIndex !== index) return teacher;
    return applyAutomaticTeacherAccess({
      ...teacher, teacherRole: role, roleGrade: teacher.roleGrade || grade,
      homeroomClass: role === "homeroom" ? teacher.homeroomClass : "",
    }, teacher.roleGrade || grade);
  }));
  const toggleTeacherAccess = (index, field, gradeKey) => setTeachers(current => current.map((teacher, itemIndex) => {
    if (itemIndex !== index) return teacher;
    const values = normalizeGradeAccessList(teacher[field]);
    return { ...teacher, [field]: values.includes(gradeKey) ? values.filter(item => item !== gradeKey) : [...values, gradeKey] };
  }));
  const addDepartment = () => setDepartments(current => [...current, {
    name: "", id: "", pw: RESET_PASSWORD, gradeAccessGrades: [], timetableAccessGrades: [],
  }]);
  const updateDepartmentField = (index, field, value) => setDepartments(current => current.map((item, itemIndex) => (
    itemIndex === index ? { ...item, [field]: value } : item
  )));
  const toggleDepartmentAccess = (index, field, gradeKey) => setDepartments(current => current.map((item, itemIndex) => {
    if (itemIndex !== index) return item;
    const values = normalizeGradeAccessList(item[field]);
    return { ...item, [field]: values.includes(gradeKey) ? values.filter(value => value !== gradeKey) : [...values, gradeKey] };
  }));

  const teacherFileRef = useRef(null);
  const [teacherUploadBusy, setTeacherUploadBusy] = useState(false);
  const downloadTeacherAccountTemplate = async () => {
    try {
      const XLSX = await loadXLSX();
      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet([
        ["이름", "아이디", "비밀번호", "학교역할", "담당학년", "담임반", "성적조회학년", "시간표조회학년", "담당과목", "대상반"],
        ["홍길동", "teacher01", "kd2026", "그외", "2", "", "2", "2", "대수", "1,2,3"],
        ["김담임", "teacher02", "kd2026", "학급담임", "2", "4", "", "", "", ""],
      ]);
      sheet["!cols"] = [14,16,14,13,10,10,16,16,18,16].map(width => ({ wch: width }));
      XLSX.utils.book_append_sheet(workbook, sheet, "선생님 계정");
      const guide = XLSX.utils.aoa_to_sheet([
        ["학교역할", "학급담임 / 학년부장 / 그외 중 하나"],
        ["권한 학년", "여러 학년은 1,2처럼 쉼표로 구분"],
        ["담당과목·대상반", "같은 아이디를 여러 행에 입력하면 담당과목을 합쳐 등록"],
      ]);
      guide["!cols"] = [{ wch: 22 }, { wch: 62 }];
      XLSX.utils.book_append_sheet(workbook, guide, "작성 안내");
      XLSX.writeFile(workbook, "선생님_계정_업로드양식.xlsx");
      showToast("선생님 계정 업로드 양식 다운로드를 시작했습니다.", "success");
    } catch (error) {
      showToast(`양식 생성 실패: ${error?.message || error}`, "error");
    }
  };
  const handleTeacherExcel = async file => {
    setTeacherUploadBusy(true);
    try {
      const XLSX = await loadXLSX();
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: null });
      const headerIndex = rows.findIndex(row => row && row.some(cell => ["이름", "아이디", "비밀번호"].includes(String(cell || "").trim())));
      if (headerIndex === -1) { showToast('첫 행에 "이름", "아이디", "비밀번호" 열 헤더가 있어야 합니다.', "error"); setTeacherUploadBusy(false); return; }
      const indexes = {};
      rows[headerIndex].forEach((header, index) => { if (header) indexes[String(header).trim()] = index; });
      if (indexes["이름"] == null || indexes["아이디"] == null || indexes["비밀번호"] == null) {
        showToast('"이름", "아이디", "비밀번호" 열을 모두 찾지 못했습니다.', "error");
        setTeacherUploadBusy(false); return;
      }
      const cellText = (row, ...headers) => {
        const header = headers.find(name => indexes[name] != null);
        return header ? String(row[indexes[header]] ?? "").trim() : "";
      };
      const parseGradeList = value => Array.from(new Set(String(value || "")
        .split(/[,/\s]+/).map(item => item.replace(/학년/g, "").trim()).filter(item => GRADES.includes(item))));
      const parseRole = value => {
        const text = String(value || "").replace(/\s+/g, "");
        if (text.includes("학급담임") || text === "담임") return "homeroom";
        if (text.includes("학년부장") || text.includes("학년부")) return "gradeHead";
        return "other";
      };
      const parseClass = value => String(value || "").replace(/반/g, "").trim();
      const existingIds = new Set(teachers.map(teacher => String(teacher.id || "").trim()));
      const pendingById = new Map();
      for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex]; if (!row) continue;
        const name = cellText(row, "이름", "성명");
        const idString = cellText(row, "아이디", "ID", "계정");
        const pw = cellText(row, "비밀번호", "초기비밀번호", "패스워드");
        if (!name || !idString || !pw || existingIds.has(idString)) continue;
        const role = parseRole(cellText(row, "학교역할", "역할"));
        const roleGrade = parseGradeList(cellText(row, "담당학년", "역할학년", "학년"))[0] || grade;
        const subject = cellText(row, "담당과목", "과목");
        const targets = cellText(row, "대상반", "담당반", "반");
        const assignment = subject ? { kind: "elective", subject, targets: targets || "전체" } : null;
        if (pendingById.has(idString)) {
          const current = pendingById.get(idString);
          if (assignment && !current.assignments.some(item => item.subject === assignment.subject && item.targets === assignment.targets)) {
            current.assignments.push(assignment);
          }
          continue;
        }
        const teacher = applyAutomaticTeacherAccess({
          name, id: idString, pw, teacherRole: role, roleGrade,
          homeroomClass: role === "homeroom" ? parseClass(cellText(row, "담임반", "학급")) : "",
          gradeAccessGrades: parseGradeList(cellText(row, "성적조회학년", "성적권한학년")),
          timetableAccessGrades: parseGradeList(cellText(row, "시간표조회학년", "시간표권한학년")),
          assignments: assignment ? [assignment] : [],
        }, roleGrade);
        pendingById.set(idString, teacher);
      }
      const added = Array.from(pendingById.values());
      if (!added.length) { showToast("추가할 새 계정을 찾지 못했습니다. (아이디 중복 또는 필수값 누락)", "error"); setTeacherUploadBusy(false); return; }
      setTeachers(current => [...current, ...added]);
      showToast(`${added.length}명의 선생님 계정을 추가했습니다. 역할·학년·담당 과목을 확인한 뒤 저장해주세요.`, "success");
    } catch (error) {
      showToast(`파일 오류: ${error.message}`, "error");
    }
    setTeacherUploadBusy(false);
  };

  const visibleTeachers = teachers
    .map((teacher, index) => ({ teacher, index }))
    .filter(({ teacher }) => {
      const query = teacherSearch.trim().toLowerCase();
      const role = normalizedTeacherRole(teacher);
      if (teacherRoleFilter !== "all" && role !== teacherRoleFilter) return false;
      if (!query) return true;
      return [teacher.name, teacher.id, TEACHER_ROLE_LABELS[role], ...(teacher.assignments || []).map(item => item.subject)]
        .filter(Boolean).join(" ").toLowerCase().includes(query);
    });

  return (
    <div>
      {!accounts.admin.length && <div style={styles.warnBanner}><AlertTriangle size={14} /> 관리자 계정이 없어 초기 계정({DEFAULT_ADMIN.id}/{DEFAULT_ADMIN.pw})으로 접속 중입니다. 계정을 등록해주세요.</div>}

      <div style={accountConsole.summaryGrid}>
        {[
          ["관리자", admins.length, "전체 설정"],
          ["부서 계정", departments.length, "성적·시간표 개별 권한"],
          ["선생님", teachers.length, "역할 기반 권한"],
        ].map(([label, count, caption]) => (
          <div key={label} style={accountConsole.summaryCard}>
            <div style={accountConsole.summaryLabel}>{label}</div>
            <div style={accountConsole.summaryValue}>{count}</div>
            <div style={accountConsole.summaryCaption}>{caption}</div>
          </div>
        ))}
      </div>

      <div style={accountConsole.panel}>
        <div style={accountConsole.panelHeader}>
          <div>
            <div style={accountConsole.panelTitle}>관리자 계정</div>
            <div style={accountConsole.panelDescription}>계정별 관리자 메뉴 권한을 지정합니다. 권한을 하나도 선택하지 않으면 전체 메뉴에 접근합니다.</div>
          </div>
          <span style={accountConsole.count}>{admins.length}개</span>
        </div>
        <AdminAccountTable list={admins} setList={setAdmins} />
        <button style={styles.secondaryBtn} onClick={() => setAdmins(current => [...current, { id: "", pw: "", permissions: [] }])}>+ 관리자 추가</button>
      </div>

      <div style={accountConsole.panel}>
        <div style={accountConsole.panelHeader}>
          <div>
            <div style={accountConsole.panelTitle}>부서별 성적·시간표 계정</div>
            <div style={accountConsole.panelDescription}>학년부·교육과정부·진로부 등 부서별 아이디를 만들고, 성적과 학생 시간표 권한을 학년별로 각각 부여합니다.</div>
          </div>
          <span style={accountConsole.count}>{departments.length}개</span>
        </div>
        {!departments.length && <div style={accountConsole.empty}>등록된 부서 계정이 없습니다.</div>}
        <div style={accountConsole.cardGrid}>
          {departments.map((department, index) => (
            <div key={`department-${index}`} style={accountConsole.accountCard}>
              <div style={accountConsole.identityRow}>
                <ImeSafeInput value={department.name || ""} onValueChange={value => updateDepartmentField(index, "name", value)} placeholder="부서명 (예: 2학년부)" style={accountConsole.input} autoComplete="off" spellCheck={false} />
                <button style={styles.iconBtn} onClick={() => setDepartments(current => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></button>
              </div>
              <div style={accountConsole.credentials}>
                <label style={accountConsole.field}><span>아이디</span><ImeSafeInput value={department.id || ""} onValueChange={value => updateDepartmentField(index, "id", value)} placeholder="영문·숫자 또는 한글 아이디" style={accountConsole.input} autoComplete="off" spellCheck={false} /></label>
                <label style={accountConsole.field}><span>비밀번호</span><ImeSafeInput value={department.pw || ""} onValueChange={value => updateDepartmentField(index, "pw", value)} placeholder="비밀번호" style={accountConsole.input} autoComplete="new-password" /></label>
              </div>
              <TeacherAccessMatrix teacher={department} index={index} onToggle={toggleDepartmentAccess} />
            </div>
          ))}
        </div>
        <button style={{ ...styles.secondaryBtn, marginTop: 10 }} onClick={addDepartment}>+ 부서 계정 추가</button>
      </div>

      {(accounts.teacherPending || []).length > 0 && (
        <div style={styles.infoBox}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>선생님 가입 승인 대기 ({accounts.teacherPending.length}건)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {accounts.teacherPending.map((request, index) => (
              <div key={index} style={styles.issueRow}>
                <span style={{ fontWeight: 700 }}>{request.name}</span>
                <span style={{ color: "#8a8578", fontSize: 12 }}>({request.id})</span>
                <span style={{ fontSize: 12 }}>
                  {[
                    request.homeroomClass ? `학급담임(${request.roleGrade || grade}학년 ${request.homeroomClass}반)` : null,
                    (request.assignments || []).length > 0 ? (request.assignments || []).map(assignment => `${assignment.subject}(${assignment.targets})`).join(", ") : null,
                  ].filter(Boolean).join(" · ")}
                </span>
                <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                  <button style={{ ...styles.secondaryBtn, padding: "4px 10px", fontSize: 11.5 }} onClick={() => approve(request)}>승인</button>
                  <button style={{ ...styles.dangerBtn, padding: "4px 10px", fontSize: 11.5, marginTop: 0 }} onClick={() => reject(request)}>거절</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={accountConsole.panel}>
        <div style={accountConsole.panelHeader}>
          <div>
            <div style={accountConsole.panelTitle}>선생님 계정 및 학생정보 접근 권한</div>
            <div style={accountConsole.panelDescription}>학급담임·학년부장은 담당 학년 권한이 자동 부여되고, 그외 선생님은 필요한 권한만 직접 선택합니다.</div>
          </div>
          <span style={accountConsole.count}>{teachers.length}명</span>
        </div>
        <div style={{ fontSize: 12, color: "#8a8578", marginBottom: 10, lineHeight: 1.55 }}>
          학급담임과 학년부장은 지정 학년의 전체 학생 성적과 시간표 권한이 자동으로 부여됩니다. 그외 역할은 관리자가 학년별 성적·시간표 권한을 직접 체크해야 합니다.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: 10, border: `1px dashed ${COLORS.line}`, borderRadius: 8 }}>
          <FileSpreadsheet size={18} color="#8a8578" />
          <div style={{ fontSize: 11.5, color: "#8a8578", flex: 1 }}>엑셀 일괄 등록: 이름·아이디·비밀번호는 필수이며, 학교역할·담당학년·권한학년·담당과목도 함께 읽습니다. 같은 아이디를 여러 행에 입력하면 담당과목을 합쳐 등록합니다.</div>
          <input ref={teacherFileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={event => event.target.files[0] && handleTeacherExcel(event.target.files[0])} />
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}><button type="button" style={styles.secondaryBtn} onClick={downloadTeacherAccountTemplate} disabled={teacherUploadBusy}><Download size={14}/>양식 다운로드</button><button style={styles.secondaryBtn} onClick={() => teacherFileRef.current.click()} disabled={teacherUploadBusy}>{teacherUploadBusy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} 엑셀 업로드</button></div>
        </div>
        <div style={accountConsole.teacherToolbar}>
          <div style={{ ...styles.searchBox, flex: "1 1 280px", marginBottom: 0 }}><Search size={15} color="#9a9589" /><input value={teacherSearch} onChange={event => setTeacherSearch(event.target.value)} placeholder="이름·아이디·담당과목 검색" style={styles.searchInput} /></div>
          <select value={teacherRoleFilter} onChange={event => setTeacherRoleFilter(event.target.value)} style={{ ...styles.cellInput, width: 140, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "8px 10px" }}><option value="all">전체 역할</option><option value="homeroom">학급담임</option><option value="gradeHead">학년부장</option><option value="other">그외</option></select>
          <span style={accountConsole.count}>{visibleTeachers.length}/{teachers.length}명</span>
        </div>
        {!teachers.length && <div style={{ fontSize: 12, color: "#a39d8c", marginBottom: 8 }}>등록된 선생님 계정이 없습니다.</div>}
        {!!teachers.length && !visibleTeachers.length && <div style={accountConsole.empty}>검색 조건에 맞는 선생님이 없습니다.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {visibleTeachers.map(({ teacher, index }) => {
            const role = normalizedTeacherRole(teacher);
            const roleGrade = teacherRoleGrade(teacher);
            const roleScopeKey = `${roleGrade}-${semester}`;
            const classOptions = extractClasses(db, roleScopeKey);
            const automatic = role === "homeroom" || role === "gradeHead";
            return (
              <details key={`teacher-${index}`} style={accountConsole.teacherCard}>
                <summary style={accountConsole.teacherSummary}>
                  <span style={accountConsole.teacherAvatar}>{String(teacher.name || "?").slice(0, 1)}</span>
                  <span style={{ minWidth: 0, flex: 1, display:"grid", gap:3 }}><strong>{teacher.name || "이름 미입력"}</strong><small style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}><span style={accountConsole.idBadge}><b>ID</b><span>{teacher.id || "아이디 미입력"}</span></span><span>{TEACHER_ROLE_LABELS[role]}</span>{automatic && <span style={accountConsole.autoBadge}>{roleGrade}학년 자동 권한</span>}</small></span>
                  <span style={accountConsole.teacherSubjectSummary}>{(teacher.assignments || []).map(item => item.subject).filter(Boolean).slice(0, 3).join(" · ") || "담당과목 미지정"}</span>
                </summary>
                <div style={accountConsole.teacherBody}>
                <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <input value={teacher.name || ""} onChange={event => updateTeacherField(index, "name", event.target.value)} placeholder="이름" style={{ ...styles.cellInput, border: `1px solid ${COLORS.line}`, borderRadius: 6, flex: "1 1 130px" }} />
                  <input value={teacher.id || ""} onChange={event => updateTeacherField(index, "id", event.target.value)} placeholder="아이디" style={{ ...styles.cellInput, border: `1px solid ${COLORS.line}`, borderRadius: 6, flex: "1 1 130px" }} />
                  <input value={teacher.pw || ""} onChange={event => updateTeacherField(index, "pw", event.target.value)} placeholder="비밀번호" style={{ ...styles.cellInput, border: `1px solid ${COLORS.line}`, borderRadius: 6, flex: "1 1 130px" }} />
                  <button style={styles.iconBtn} onClick={() => setTeachers(current => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, 0.8fr) minmax(260px, 1.5fr)", gap: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 11.5, color: "#8a8578", marginBottom: 6 }}>학교 역할</div>
                    <select value={role} onChange={event => updateTeacherRole(index, event.target.value)} style={{ ...styles.cellInput, width: "100%", border: `1px solid ${COLORS.line}`, borderRadius: 6, padding: "7px 8px" }}>
                      <option value="homeroom">학급담임</option>
                      <option value="gradeHead">학년부장</option>
                      <option value="other">그외</option>
                    </select>
                  </div>
                  <div>
                    {automatic ? (
                      <>
                        <div style={{ fontSize: 11.5, color: "#8a8578", marginBottom: 6 }}>담당 학년</div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          {GRADES.map(gradeKey => <button key={gradeKey} type="button" onClick={() => updateTeacherField(index, "roleGrade", gradeKey)} style={{ ...styles.classChip, padding: "5px 11px", fontSize: 11.5, ...(roleGrade === gradeKey ? styles.classChipActive : {}) }}>{gradeKey}학년</button>)}
                        </div>
                        <div style={{ ...styles.okBanner, marginTop: 8, padding: "7px 10px", fontSize: 11.5 }}><Check size={13} /> {roleGrade}학년 전체 학생 성적 + 학생 시간표 자동 권한</div>
                      </>
                    ) : (
                      <TeacherAccessMatrix teacher={teacher} index={index} onToggle={toggleTeacherAccess} />
                    )}
                  </div>
                </div>

                {role === "homeroom" && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11.5, color: "#8a8578", marginBottom: 6 }}>{roleGrade}학년 담임반</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      <button type="button" onClick={() => updateTeacherField(index, "homeroomClass", "")} style={{ ...styles.classChip, padding: "4px 10px", fontSize: 11.5, ...(!teacher.homeroomClass ? styles.classChipActive : {}) }}>미지정</button>
                      {classOptions.map(classNumber => (
                        <button key={classNumber} type="button" onClick={() => updateTeacherField(index, "homeroomClass", classNumber)} style={{ ...styles.classChip, padding: "4px 10px", fontSize: 11.5, ...(String(teacher.homeroomClass) === String(classNumber) ? styles.classChipActive : {}) }}>{classNumber}반</button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ fontSize: 11.5, color: "#8a8578", marginBottom: 6 }}>교과담당 과목 (선택사항, 여러 개 가능)</div>
                  <AssignmentsEditor assignments={teacher.assignments || []} setAssignments={assignments => updateTeacherField(index, "assignments", assignments)} db={db} scopeKey={scopeKey} semesterLabel={`${grade}학년 ${semester === "sem2" ? "2학기" : "1학기"}`} />
                </div>
                </div>
              </details>
            );
          })}
        </div>
        <button style={{ ...styles.secondaryBtn, marginTop: 10 }} onClick={addTeacher}>+ 선생님 계정 추가</button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={styles.primaryBtn} onClick={save}><Save size={14} /> 계정·권한 저장</button>
        <button style={styles.dangerBtn} onClick={resetAll}><KeyRound size={14} /> 전체 비밀번호 초기화 ({RESET_PASSWORD})</button>
      </div>
    </div>
  );
}

function TeacherAccessMatrix({ teacher, index, onToggle }) {
  const gradeAccess = normalizeGradeAccessList(teacher.gradeAccessGrades);
  const timetableAccess = normalizeGradeAccessList(teacher.timetableAccessGrades);
  return (
    <div>
      <div style={{ fontSize: 11.5, color: "#8a8578", marginBottom: 6 }}>학년별 학생정보 접근 권한</div>
      <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: 8, overflow: "hidden", background: "#fff" }}>
        {GRADES.map((gradeKey, rowIndex) => (
          <div key={gradeKey} style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr", alignItems: "center", gap: 6, padding: "7px 9px", borderTop: rowIndex ? `1px solid ${COLORS.line}` : "none" }}>
            <strong style={{ fontSize: 11.5 }}>{gradeKey}학년</strong>
            <button type="button" onClick={() => onToggle(index, "gradeAccessGrades", gradeKey)} style={{ ...styles.classChip, padding: "4px 8px", fontSize: 11, ...(gradeAccess.includes(gradeKey) ? styles.classChipActive : {}) }}>성적 조회</button>
            <button type="button" onClick={() => onToggle(index, "timetableAccessGrades", gradeKey)} style={{ ...styles.classChip, padding: "4px 8px", fontSize: 11, ...(timetableAccess.includes(gradeKey) ? styles.classChipActive : {}) }}>시간표 조회</button>
          </div>
        ))}
      </div>
      {!gradeAccess.length && !timetableAccess.length && <div style={{ fontSize: 10.8, color: "#a3402b", marginTop: 6 }}>별도 권한 없음: 학생 성적과 학생 시간표에 접근할 수 없습니다.</div>}
    </div>
  );
}

function AccountTable({ list, setList }) {
  if (!list.length) return <div style={{ fontSize: 12, color: "#a39d8c", marginBottom: 8 }}>등록된 계정이 없습니다.</div>;
  return (
    <table style={{ ...styles.editTable, marginBottom: 8 }}>
      <thead><tr><th style={styles.th}>아이디</th><th style={styles.th}>비밀번호</th><th style={{ ...styles.th, width: 40 }}></th></tr></thead>
      <tbody>{list.map((a, i) => <tr key={i}><td style={styles.tdEdit}><input value={a.id} onChange={e => setList(l => l.map((x, j) => j === i ? { ...x, id: e.target.value } : x))} style={styles.cellInput} /></td><td style={styles.tdEdit}><input value={a.pw} onChange={e => setList(l => l.map((x, j) => j === i ? { ...x, pw: e.target.value } : x))} style={styles.cellInput} /></td><td style={styles.tdEdit}><button style={styles.iconBtn} onClick={() => setList(l => l.filter((_, j) => j !== i))}><X size={14} /></button></td></tr>)}</tbody>
    </table>
  );
}
function AdminAccountTable({ list, setList }) {
  if (!list.length) return <div style={{ fontSize: 12, color: "#a39d8c", marginBottom: 8 }}>등록된 계정이 없습니다.</div>;
  const togglePerm = (i, key) => setList(l => l.map((x, j) => {
    if (j !== i) return x;
    const perms = x.permissions || [];
    const has = perms.includes(key);
    return { ...x, permissions: has ? perms.filter(p => p !== key) : [...perms, key] };
  }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {list.map((a, i) => (
        <div key={i} style={{ border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: 10, background: "#fff" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
            <input value={a.id} onChange={e => setList(l => l.map((x, j) => j === i ? { ...x, id: e.target.value } : x))} placeholder="아이디" style={{ ...styles.cellInput, border: `1px solid ${COLORS.line}`, borderRadius: 6, flex: 1 }} />
            <input value={a.pw} onChange={e => setList(l => l.map((x, j) => j === i ? { ...x, pw: e.target.value } : x))} placeholder="비밀번호" style={{ ...styles.cellInput, border: `1px solid ${COLORS.line}`, borderRadius: 6, flex: 1 }} />
            <button style={styles.iconBtn} onClick={() => setList(l => l.filter((_, j) => j !== i))}><X size={14} /></button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {ADMIN_TABS.map(([key, , label]) => {
              const active = (a.permissions || []).includes(key);
              return <button key={key} type="button" onClick={() => togglePerm(i, key)} style={{ ...styles.classChip, padding: "4px 10px", fontSize: 11, ...(active ? styles.classChipActive : {}) }}>{label}</button>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminNoticesViewer({ db, persist, showToast, scopeKey, roster, timetables }) {
  const announcements = db.announcements[scopeKey] || {};
  const classes = useMemo(() => Array.from(new Set(Object.values(roster).map(r => r.class))).sort((a, b) => a - b), [roster]);
  const [sel, setSel] = useState(null);
  useEffect(() => { if (classes.length && (sel === null || !classes.includes(sel))) setSel(classes[0]); }, [classes]); // eslint-disable-line

  // For the selected class, gather: (1) homeroom notices, (2) common-subject notices for that class,
  // (3) elective notices for any subject+group any student in that class is enrolled in.
  const items = useMemo(() => {
    if (sel == null) return [];
    const out = [];
    const homeroomKey = homeroomKeyFor(sel);
    asNoticeArray(announcements[homeroomKey]).forEach(n => out.push({ ...n, scopeLabel: `${sel}반 학급 공지`, kind: "homeroom", storageKey: homeroomKey }));
    const classStudentIds = new Set(Object.entries(roster).filter(([, s]) => s.class === sel).map(([sid]) => sid));
    Object.entries(announcements).forEach(([key, rawList]) => {
      const list = asNoticeArray(rawList);
      if (key.startsWith("COMMON_")) {
        const m = key.match(/^COMMON_(.+)_(\d+)$/);
        if (m && m[2] === String(sel)) list.forEach(n => out.push({ ...n, scopeLabel: `${m[1]} (공통과목, ${sel}반)`, kind: "common", storageKey: key }));
      } else if (key.startsWith("STUDENT_")) {
        const sid = key.replace("STUDENT_", "");
        if (classStudentIds.has(sid)) { const s = roster[sid]; list.forEach(n => out.push({ ...n, scopeLabel: `${s.name} (${s.class}반 ${s.number}번) 개인 지정`, kind: "personal", storageKey: key })); }
      } else if (!key.startsWith("HOMEROOM_")) {
        const m = key.match(/^(.+)_([^_]+)$/);
        if (m) list.forEach(n => out.push({ ...n, scopeLabel: `${m[1]} (${m[2]}그룹)`, kind: "elective", storageKey: key }));
      }
    });
    return out.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [announcements, sel, roster]);

  const deleteItem = async (item) => {
    const current = db.announcements[scopeKey] || {};
    const list = asNoticeArray(current[item.storageKey]).filter(n => n.id !== item.id);
    const updated = { ...current, [item.storageKey]: list };
    const ok = await persist({ announcements: { ...db.announcements, [scopeKey]: updated } });
    if (ok) showToast("삭제했습니다.", "success");
  };

  const deleteAllForClass = async () => {
    if (!items.length) return;
    const current = { ...(db.announcements[scopeKey] || {}) };
    // Remove exactly the notice entries currently shown for this class from their respective storage keys.
    const idsByKey = {};
    items.forEach(item => { (idsByKey[item.storageKey] = idsByKey[item.storageKey] || new Set()).add(item.id); });
    Object.entries(idsByKey).forEach(([key, ids]) => {
      current[key] = asNoticeArray(current[key]).filter(n => !ids.has(n.id));
    });
    const ok = await persist({ announcements: { ...db.announcements, [scopeKey]: current } });
    if (ok) showToast(`${sel}반 공지 ${items.length}건을 모두 삭제했습니다.`, "success");
  };

  return (
    <div>
      <div style={{ fontSize: 12.5, color: "#8a8578", marginBottom: 10 }}>반을 선택하면 그 반 학생에게 노출되는 모든 공지(학급 공지 · 공통과목 · 이동수업)를 한눈에 확인하고 삭제할 수 있습니다.</div>
      <div style={styles.classChips}>{classes.map(c => <button key={c} onClick={() => setSel(c)} style={{ ...styles.classChip, ...(sel === c ? styles.classChipActive : {}) }}>{c}반</button>)}</div>
      {items.length > 0 && (
        <button style={{ ...styles.dangerBtn, marginTop: 0, marginBottom: 12 }} onClick={deleteAllForClass}><Trash2 size={14} /> {sel}반 공지 전체 삭제 ({items.length}건)</button>
      )}
      {items.length === 0 ? (
        <div style={{ fontSize: 12.5, color: "#a39d8c" }}>현재 반영된 공지가 없습니다.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((n, i) => {
            const cat = NOTICE_CATEGORY_COLOR[n.category] || NOTICE_CATEGORY_COLOR["공지"];
            const dueInfo = n.dueDate ? formatDueDate(n.dueDate) : null;
            return (
              <div key={i} style={{ background: cat.bg, border: `1px solid ${cat.border}`, borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: cat.text, background: "#fff", border: `1px solid ${cat.border}`, borderRadius: 4, padding: "1px 6px" }}>{n.category}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: cat.text }}>{n.scopeLabel}</span>
                  <span style={{ fontSize: 11, color: "#8a8578" }}>· {n.teacherName ? `${n.teacherName} 선생님` : ""} · {new Date(n.updatedAt).toLocaleString("ko-KR")}</span>
                  <button style={{ ...styles.iconBtn, marginLeft: "auto", color: cat.text }} onClick={() => deleteItem(n)}><Trash2 size={14} /></button>
                </div>
                {n.title && <div style={{ fontSize: 13, fontWeight: 900, color: cat.text, marginBottom: n.text ? 4 : 0 }}>{n.title}</div>}
                {n.text && <div style={{ fontSize: 12.5, color: cat.text, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{n.text}</div>}
                <AttachmentLinks attachments={n.attachments} />
                {dueInfo && <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, fontSize: 11.5, fontWeight: 700, color: dueInfo.overdue ? "#b3401f" : cat.text }}><Calendar size={12} /> 마감 {dueInfo.label}{dueInfo.overdue ? " (마감됨)" : ""}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminVerify({ roster, enrollments, timetables, build, abbrevMap }) {
  const [report, setReport] = useState(null);
  const run = () => {
    const issues = []; let checked = 0;
    const scoped = new Set();
    Object.values(timetables).forEach(g => DAYS.forEach(d => (g[d] || []).forEach(c => { if (isMoveSlot(c)) scoped.add(moveSlotAbbrev(c)); })));
    Array.from(scoped).filter(a => !abbrevMap[a]).forEach(a => issues.push({ sid: "-", name: "(공통)", cls: "-", detail: `이 학기 시간표의 약어 "${a}" 매핑 없음` }));
    Object.keys(roster).forEach(sid => {
      const r = build(sid); checked++;
      if (!r.hasTimetable) issues.push({ sid, name: r.student.name, cls: r.student.class, detail: "학급 시간표 없음" });
      r.warnings.forEach(w => issues.push({ sid, name: r.student.name, cls: r.student.class, detail: w }));
      if (!(enrollments[sid] || []).length) issues.push({ sid, name: r.student.name, cls: r.student.class, detail: "명단에 선택과목 기록 없음" });
    });
    Object.keys(enrollments).forEach(sid => { if (!roster[sid]) issues.push({ sid, name: "(명단 외)", cls: "-", detail: "출석부엔 있으나 학생 명단에 없는 학번" }); });
    setReport({ checked, issues });
  };
  return (
    <div>
      <button style={styles.primaryBtn} onClick={run}><Check size={14} /> 전체 검증 실행</button>
      {report && (
        <div style={{ marginTop: 16 }}>
          <div style={styles.statGrid}><StatCard label="검사 학생" value={report.checked} unit="명" /><StatCard label="문제" value={report.issues.length} unit="건" /></div>
          {report.issues.length === 0
            ? <div style={styles.okBanner}><Check size={14} /> 모든 항목이 정상입니다.</div>
            : <div style={styles.issueList}>{report.issues.map((x, i) => <div key={i} style={styles.issueRow}><span style={styles.issueBadge}>{x.cls}반</span><span style={{ fontWeight: 700 }}>{x.name}</span><span style={{ color: "#8a8578", fontSize: 12 }}>({x.sid})</span><span style={{ color: "#b3401f", fontSize: 12 }}>{x.detail}</span></div>)}</div>}
        </div>
      )}
    </div>
  );
}

/* ============ STYLES ============ */
const globalCss = `
  * { box-sizing: border-box; } body { margin: 0; } input, textarea, button { font-family: inherit; }
  label small { display: block; margin-top: 2px; color: #7d897a; font-weight: 500; line-height: 1.4; }
  .spin { animation: spin 1s linear infinite; }
  .kd-history-edge{position:fixed;top:50%;z-index:120;width:36px;height:58px;transform:translateY(-50%);border:1px solid #cad5e5;background:rgba(255,255,255,.94);color:#315a86;border-radius:12px;box-shadow:0 8px 24px rgba(45,66,96,.15);font-size:20px;font-weight:900;cursor:pointer;backdrop-filter:blur(8px)}
  .kd-history-edge-left{left:8px}.kd-history-edge-right{right:8px}
  .kd-history-edge:hover:not(:disabled){background:#315a86;color:#fff;border-color:#315a86}
  .kd-history-edge:disabled{opacity:.24;cursor:default;box-shadow:none}
.subject-roster-table th{padding:10px 12px;background:#eaf2fb;color:#294f7f;border:1px solid #d4e0ef;font-size:12px;font-weight:900}
.subject-roster-table td{padding:10px 12px;border:1px solid #e0e7f0;text-align:center;color:#33445b}
.subject-roster-table tbody tr:nth-child(even){background:#f8fbff}
.subject-roster-table tbody tr:hover{background:#eef5ff} @keyframes spin { to { transform: rotate(360deg); } }
  .print-only { display: none; }
  @media print {
    .no-print { display: none !important; }
    .print-only { display: block !important; }
    #print-area { display: block !important; }
    .print-page-break { break-after: page; page-break-after: always; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
    @page { size: A4; margin: 6mm 10mm; }
    body { margin: 0; }
    table tr { break-inside: avoid; page-break-inside: avoid; }
    .print-card { padding: 8px 14px !important; margin-top: 0 !important; }
    .print-header { margin-bottom: 4px !important; }
    .admission-print-root { width: 100% !important; max-width: none !important; }
    .admission-print-root table { font-size: 7pt !important; }
    .admission-print-root th, .admission-print-root td { padding: 3px 2px !important; }
    .admission-print-root .reflection-badge { max-width: 68% !important; padding: 0 2px !important; font-size: 5.5pt !important; line-height: 1 !important; border-left-width: 1px !important; }
  }
  @media (max-width: 900px) {
    .teacher-composer-grid { grid-template-columns: 1fr !important; }
  }
  @media (max-width: 900px) {
    .staff-notice-dock { left: 10px !important; top: auto !important; bottom: 74px !important; width: min(300px, calc(100vw - 20px)) !important; }
    .kd-history-edge{top:auto;bottom:12px;transform:none;width:40px;height:40px;border-radius:999px}
    .kd-history-edge-left{left:12px}.kd-history-edge-right{right:12px}
  }
    @media (max-width: 720px) {
    .teacher-zone-target-row { grid-template-columns: 1fr !important; }
    .teacher-workflow-steps { grid-template-columns: 1fr !important; }
    .teacher-composer-aside { border-left: 0 !important; border-top: 1px solid #e6e1d3 !important; }
    .admin-scope-sticky { position: static !important; }
  }
`;
const accountConsole = {
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 },
  summaryCard: { border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: "12px 13px", background: "linear-gradient(135deg, #fff 0%, #f7f5ef 100%)" },
  summaryLabel: { fontSize: 10.5, color: "#746d61", fontWeight: 850 },
  summaryValue: { fontSize: 23, fontWeight: 950, color: "#2f4b32", lineHeight: 1.15, marginTop: 3 },
  summaryCaption: { fontSize: 9.8, color: "#9a9385", marginTop: 2 },
  panel: { border: `1px solid ${COLORS.line}`, borderRadius: 13, padding: 14, background: "#fff", marginBottom: 14, boxShadow: "0 3px 12px rgba(61,55,45,0.035)" },
  panelHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 12 },
  panelTitle: { fontSize: 14, fontWeight: 900, color: "#2f2a24" },
  panelDescription: { marginTop: 3, fontSize: 10.8, color: "#8a8578", lineHeight: 1.5 },
  count: { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 38, borderRadius: 999, padding: "5px 8px", background: "#edf4eb", border: "1px solid #d1dfce", color: "#3d5c3a", fontSize: 10.5, fontWeight: 900 },
  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: 10 },
  accountCard: { border: `1px solid ${COLORS.line}`, borderRadius: 11, padding: 12, background: "#fbfaf6" },
  teacherCard: { border: `1px solid ${COLORS.line}`, borderRadius: 12, background: "#fff", overflow: "hidden" },
  teacherSummary: { display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", cursor: "pointer", listStyle: "none", background: "linear-gradient(135deg,#f7f8f4,#fff)", borderBottom: `1px solid ${COLORS.line}` },
  teacherBody: { padding: 13 },
  teacherAvatar: { width: 30, height: 30, borderRadius: 9, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#eaf0e8", color: "#315a35", fontWeight: 950 },
  idBadge:{display:"inline-flex",alignItems:"center",gap:5,borderRadius:7,padding:"3px 7px",background:"#eef3fa",color:"#40536b",fontWeight:800,border:"1px solid #d9e2ef"},
  autoBadge:{display:"inline-flex",alignItems:"center",borderRadius:999,padding:"2px 7px",background:"#eaf4ec",color:"#356541",fontWeight:850},
  teacherSubjectSummary: { maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#746d61", fontSize: 11.5, fontWeight: 750 },
  teacherToolbar: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: 10, marginBottom: 10, border: `1px solid ${COLORS.line}`, borderRadius: 10, background: "#faf9f5" },
  templateCard: { border: `1px solid ${COLORS.line}`, borderRadius: 12, background: "linear-gradient(145deg,#fff,#f8faf6)", padding: 15, display: "grid", gridTemplateColumns: "26px 1fr", textAlign: "left", gap: "3px 8px", cursor: "pointer", color: COLORS.ink },
  templateAction: { gridColumn: "2", display: "inline-flex", alignItems: "center", gap: 4, color: COLORS.accent, fontSize: 11, fontWeight: 850, marginTop: 6 },
  identityRow: { display: "flex", alignItems: "center", gap: 7, marginBottom: 9 },
  credentials: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 },
  field: { display: "grid", gap: 4, fontSize: 10.2, color: "#746d61", fontWeight: 800 },
  input: { width: "100%", boxSizing: "border-box", border: `1px solid ${COLORS.line}`, borderRadius: 7, padding: "8px 9px", background: "#fff", color: "#2b2620", fontSize: 12, outline: "none" },
  empty: { padding: "12px", border: `1px dashed ${COLORS.line}`, borderRadius: 9, color: "#9a9385", fontSize: 11.5, textAlign: "center" },
};

const styles = {
  subjectRosterCard: { border:"1px solid #c9d9ee", borderRadius:14, background:"#f7faff", overflow:"hidden", boxShadow:"0 7px 20px rgba(45,83,131,.08)" },
  subjectRosterHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, padding:"15px 18px", background:"linear-gradient(135deg,#294f7f,#4e78ad)", color:"#fff" },
  subjectRosterTable: { width:"100%", borderCollapse:"collapse", background:"#fff", fontSize:13 },

  app: { minHeight: "100vh", background: COLORS.paper, color: COLORS.ink, fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif" },
  loadingScreen: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 13.5, color: "#8a8578" },
  loginBox: { textAlign: "center", padding: "36px 20px", background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 12, maxWidth: 320, margin: "20px auto", display: "flex", flexDirection: "column", alignItems: "center" },
  sectionCard: { width: 180, padding: "28px 16px", background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 14, cursor: "pointer", textAlign: "center" },
  loginInput: { width: "100%", border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 8 },
  topbar: { background: "#fff", borderBottom: `1px solid ${COLORS.line}` },
  topbarCompact: { position: "relative", top: "auto", zIndex: 20, margin: "10px auto 0", maxWidth: 1080, border: "1px solid #e2ded3", borderRadius: 14, padding: "9px 12px", background: "linear-gradient(135deg,#fafbfc,#fff)" },
  topbarRowCompact: { justifyContent: "flex-start", gap: 10 },
  navCompact: { flex: "1 1 auto", justifyContent: "flex-start", flexWrap: "nowrap", gap: 4 },
  topbarRow: { maxWidth: 1040, margin: "0 auto", padding: "12px 20px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 },
  scopeRow: { maxWidth: 1040, margin: "0 auto", padding: "0 20px 12px", display: "flex", gap: 20, flexWrap: "wrap" },
  scopeGroup: { display: "flex", alignItems: "center", gap: 8 },
  scopeLabel: { fontSize: 11.5, color: "#a39d8c", fontWeight: 700 },
  scopeBtnRow: { display: "flex", gap: 4 },
  scopeBtn: { border: `1px solid ${COLORS.line}`, background: "#fff", padding: "4px 10px", borderRadius: 14, fontSize: 11.5, cursor: "pointer", fontWeight: 700, color: "#8a8578" },
  scopeBtnActive: { background: COLORS.ink, color: "#fff", borderColor: COLORS.ink },
  scopeBtnDisabled: { opacity: 0.4, cursor: "not-allowed" },
  brand: { display: "flex", alignItems: "center", gap: 10 },
  brandMark: { width: 30, height: 30, borderRadius: 8, background: COLORS.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 },
  brandTitle: { fontWeight: 700, fontSize: 14 },
  betaBadge: { fontSize: 9.5, background: "#eef0ec", color: "#6b6754", padding: "1px 6px", borderRadius: 5, marginLeft: 5, fontWeight: 700 },
  brandSub: { fontSize: 10.5, color: "#a39d8c" },
  nav: { display: "flex", gap: 4 },
  navBtn: { display: "flex", alignItems: "center", gap: 6, border: "none", background: "transparent", padding: "8px 12px", borderRadius: 7, fontSize: 13, cursor: "pointer", color: "#8a8578", fontWeight: 700 },
  navBtnActive: { background: COLORS.accentSoft, color: COLORS.accent },
  compactToolbarSingle: { maxWidth: 1040, margin: "0 auto", width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "0", flexWrap: "nowrap" },
  compactMenuGroup: { display: "flex", alignItems: "center", minWidth: 0, flex: "1 1 auto", padding: 4, border: "1px solid #e1e5ea", borderRadius: 11, background: "#f7f9fb" },
  compactScopeGroup: { display: "flex", alignItems: "center", gap: 14, flex: "0 0 auto", whiteSpace: "nowrap", padding: "6px 10px", border: "1px solid #e2ded3", borderRadius: 11, background: "#fffdf9" },
  compactToolbarDivider: { width: 1, alignSelf: "stretch", minHeight: 38, background: "#d8dde4", flex: "0 0 1px" },
  body: { maxWidth: 1040, margin: "0 auto", padding: "28px 20px 60px" },
  h1: { fontSize: 18, fontWeight: 700, margin: "0 0 4px" },
  pMuted: { fontSize: 13, color: "#8a8578", margin: "0 0 12px" },
  searchBox: { display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "9px 13px", maxWidth: 420 },
  searchInput: { border: "none", outline: "none", flex: 1, fontSize: 13.5, background: "transparent" },
  matchList: { marginTop: 8, maxWidth: 420, background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 10, overflow: "hidden" },
  matchItem: { display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 13px", border: "none", background: "transparent", cursor: "pointer", borderBottom: `1px solid ${COLORS.line}`, fontSize: 13 },
  matchMeta: { color: "#a39d8c", fontSize: 11.5 },
  emptyBox: { textAlign: "center", padding: "48px 20px", background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 12 },
  card: { background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 20, marginTop: 16 },
  printHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  cardTitle: { fontSize: 17, fontWeight: 700 },
  cardSub: { fontSize: 13, color: "#8a8578", fontWeight: 500, marginLeft: 6 },
  cardMeta: { fontSize: 12, color: "#a39d8c", marginTop: 2 },
  printBtn: { display: "flex", alignItems: "center", gap: 6, border: `1px solid ${COLORS.line}`, background: "#fff", padding: "7px 13px", borderRadius: 8, fontSize: 12.5, cursor: "pointer", fontWeight: 700 },
  printBar: { display: "flex", justifyContent: "space-between", alignItems: "center", margin: "12px 0" },
  table: { width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: 12.5, marginTop: 14 },
  editTable: { width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: 12.5, marginTop: 10 },
  th: { border: `1px solid ${COLORS.line}`, padding: "8px 4px", background: "#f6f4ee", fontWeight: 700, fontSize: 12, wordBreak: "keep-all" },
  thPeriod: { border: `1px solid ${COLORS.line}`, padding: "8px 4px", background: "#f6f4ee", fontWeight: 700, fontSize: 12 },
  td: { border: `1px solid ${COLORS.line}`, padding: "8px 4px", textAlign: "center", verticalAlign: "middle", wordBreak: "keep-all", overflowWrap: "break-word" },
  tdEdit: { border: `1px solid ${COLORS.line}`, padding: 2 },
  tdReadonly: { border: `1px solid ${COLORS.line}`, padding: "7px 4px", textAlign: "center", fontSize: 11.5, wordBreak: "keep-all" },
  cellInput: { width: "100%", border: "none", outline: "none", padding: "6px 4px", fontSize: 12, textAlign: "center", background: "transparent" },
  tdPeriod: { border: `1px solid ${COLORS.line}`, padding: "6px 4px", textAlign: "center", background: "#fbfaf6", fontSize: 11 },
  tdTime: { fontSize: 9, color: "#a39d8c" },
  cellSubject: { fontWeight: 700, fontSize: 11.5, lineHeight: 1.3 },
  cellRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 4, flexWrap: "wrap" },
  cellTag: { fontSize: 9, background: "#efece1", color: "#6b6754", padding: "1px 5px", borderRadius: 4, fontWeight: 700 },
  cellMoveTag: { display: "flex", alignItems: "center", gap: 2, fontSize: 9, background: "#f3ded0", color: "#9c4a1f", padding: "1px 5px", borderRadius: 4, fontWeight: 700 },
  cellStayTag: { fontSize: 9, background: COLORS.accentSoft, color: COLORS.accent, padding: "1px 5px", borderRadius: 4, fontWeight: 700 },
  cellFixed: { fontSize: 12, color: "#2b2620", fontWeight: 600, lineHeight: 1.3 },
  cellLocation: { fontSize: 10.5, color: "#5c574a", fontWeight: 600, marginTop: 2 },
  legend: { display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" },
  legendItem: { display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#8a8578" },
  legendDot: { width: 9, height: 9, borderRadius: 3, display: "inline-block" },
  warnBanner: { display: "flex", alignItems: "center", gap: 8, background: "#fdf3e9", border: "1px solid #ecd3b1", color: "#8a4d1f", padding: "8px 12px", borderRadius: 8, fontSize: 12, margin: "10px 0" },
  okBanner: { display: "flex", alignItems: "center", gap: 8, background: "#eef4ec", border: "1px solid #c7d9c2", color: COLORS.accent, padding: "10px 14px", borderRadius: 8, fontSize: 13, marginTop: 12 },
  warnBox: { marginTop: 12, background: "#fdf9ec", border: "1px solid #ecdfa8", borderRadius: 8, padding: "8px 12px" },
  warnBoxTitle: { display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, color: "#7d5f1a" },
  warnUl: { margin: "6px 0 0", paddingLeft: 16, fontSize: 11, color: "#7d5f1a" },
  classChips: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 },
  classChip: { border: `1px solid ${COLORS.line}`, background: "#fff", padding: "7px 13px", borderRadius: 20, fontSize: 12, cursor: "pointer", fontWeight: 700, color: "#8a8578" },
  classChipActive: { background: COLORS.accent, color: "#fff", borderColor: COLORS.accent },
  adminScopePanel: { position: "sticky", top: 66, zIndex: 18, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "10px 12px", margin: "12px 0 14px", border: `1px solid ${COLORS.line}`, borderRadius: 13, background: "rgba(251,250,246,.94)", backdropFilter: "blur(12px)", boxShadow: "0 7px 22px rgba(43,38,32,.08)" },
  adminScopeIdentity: { display: "flex", alignItems: "center", gap: 8, minWidth: 150, color: "#315337" },
  adminScopeCaption: { marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7, fontSize: 10.5, color: "#6f695d", fontWeight: 850, whiteSpace: "nowrap", background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 999, padding: "5px 9px" },
  adminTabs: { display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" },
  adminTabBtn: { display: "flex", alignItems: "center", gap: 6, border: `1px solid ${COLORS.line}`, background: "#fff", padding: "7px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontWeight: 700, color: "#8a8578" },
  adminTabBtnActive: { background: COLORS.ink, color: "#fff", borderColor: COLORS.ink },
  statGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 14 },
  statCard: { background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "12px 14px" },
  statValue: { fontSize: 20, fontWeight: 700, color: COLORS.accent },
  statUnit: { fontSize: 11, fontWeight: 500, color: "#a39d8c", marginLeft: 4 },
  statLabel: { fontSize: 11, color: "#8a8578", marginTop: 2 },
  infoBox: { background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 14, marginBottom: 14 },
  uploadBox: { display: "flex", flexDirection: "column", alignItems: "center", background: "#fff", border: `1.5px dashed ${COLORS.line}`, borderRadius: 12, padding: "28px 18px", marginBottom: 14 },
  uploadBtn: { display: "flex", alignItems: "center", gap: 6, border: "none", background: COLORS.accent, color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 12.5, cursor: "pointer", fontWeight: 700 },
  previewBox: { background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 14, marginBottom: 14 },
  primaryBtn: { display: "flex", alignItems: "center", gap: 6, border: "none", background: COLORS.accent, color: "#fff", padding: "8px 14px", borderRadius: 8, fontSize: 12.5, cursor: "pointer", fontWeight: 700 },
  secondaryBtn: { border: `1px solid ${COLORS.line}`, background: "#fff", color: COLORS.ink, padding: "8px 14px", borderRadius: 8, fontSize: 12.5, cursor: "pointer", fontWeight: 700 },
  dangerBtn: { display: "flex", alignItems: "center", gap: 6, border: "1px solid #e0b0a8", background: "#fdf1ee", color: "#a3402b", padding: "8px 14px", borderRadius: 8, fontSize: 12.5, cursor: "pointer", fontWeight: 700, marginTop: 8 },
  iconBtn: { border: "none", background: "transparent", cursor: "pointer", padding: 4, display: "flex", color: "#a39d8c" },
  pasteBox: { background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 14, marginBottom: 14 },
  noticeBox: { background: "#fff8e6", border: "1px solid #f0dca0", borderRadius: 8, padding: "10px 14px" },
  noticeTitle: { fontSize: 12, fontWeight: 700, color: "#8a6d1f", marginBottom: 4 },
  noticeText: { fontSize: 12.5, color: "#5c4a12", whiteSpace: "pre-wrap", lineHeight: 1.6 },
  textareaInput: { width: "100%", border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: 10, fontSize: 13, resize: "vertical", fontFamily: "inherit" },
  noticesSection: { marginTop: 24, paddingTop: 20, borderTop: `1px solid ${COLORS.line}` },
  noticesTabRow: { display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" },
  noticesTabBtn: { border: `1px solid ${COLORS.line}`, background: "#fff", padding: "7px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer", fontWeight: 700, color: "#8a8578" },
  noticesTabBtnActive: { background: COLORS.ink, color: "#fff", borderColor: COLORS.ink },
  noticesPrintHeading: { fontSize: 13, fontWeight: 700, marginBottom: 8, color: COLORS.ink },
  studentViewTabs: { display: "inline-flex", gap: 4, padding: 4, marginTop: 14, marginBottom: 4, border: `1px solid ${COLORS.line}`, borderRadius: 10, background: "#f7f5ef" },
  studentViewTab: { display: "flex", alignItems: "center", gap: 5, border: "none", background: "transparent", color: "#777064", borderRadius: 7, padding: "7px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer" },
  studentViewTabActive: { background: COLORS.accent, color: "#fff", boxShadow: "0 2px 6px rgba(61,92,58,0.18)" },
  classroomPanel: { marginTop: 14, borderTop: `1px solid ${COLORS.line}`, paddingTop: 16 },
  classroomCount: { border: "1px solid #d3dfd0", background: "#eef4ec", color: COLORS.accent, borderRadius: 999, padding: "5px 9px", fontSize: 10.5, fontWeight: 900, whiteSpace: "nowrap" },
  classroomCourseTabs: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 7, marginBottom: 10 },
  classroomCourseTab: { display: "inline-flex", alignItems: "center", gap: 6, flex: "0 0 auto", border: `1px solid ${COLORS.line}`, background: "#fff", color: "#6f695d", borderRadius: 9, padding: "7px 10px", fontSize: 11.5, fontWeight: 800, cursor: "pointer" },
  classroomCourseTabActive: { background: "#303c31", color: "#fff", borderColor: "#303c31" },
  classroomMaterialsList: { display: "flex", flexDirection: "column", gap: 9 },
  materialComposer: { border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 12, background: "#fbfaf6" },
  selectedFileList: { display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 },
  selectedFileChip: { display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%", padding: "4px 8px", borderRadius: 7, background: "#eef1f3", color: "#4f5961", fontSize: 10.5, fontWeight: 700 },
  noticePublishCheck: { display: "flex", alignItems: "flex-start", gap: 8, marginTop: 12, padding: "9px 10px", border: "1px solid #dbe4d8", borderRadius: 8, background: "#f3f7f2", color: "#3d5c3a", fontSize: 11.5, cursor: "pointer" },
  materialCard: { border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "12px 13px", background: "#fff" },
  materialCardHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  materialTitle: { fontSize: 13.5, fontWeight: 900, color: "#2f2a24", overflowWrap: "anywhere" },
  materialMeta: { marginTop: 3, fontSize: 10.5, color: "#948d80" },
  materialBody: { marginTop: 9, fontSize: 12.2, lineHeight: 1.65, color: "#514b42", whiteSpace: "pre-wrap" },
  materialNoticeBadge: { border: "1px solid #d3dfd0", borderRadius: 999, background: "#eef4ec", color: COLORS.accent, padding: "3px 7px", fontSize: 9.5, fontWeight: 900, whiteSpace: "nowrap" },
  materialEmpty: { border: `1px dashed ${COLORS.line}`, borderRadius: 9, padding: "20px 12px", textAlign: "center", color: "#9b9487", fontSize: 11.5, background: "#fbfaf6" },
  attachmentList: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 },
  attachmentLink: { display: "inline-flex", alignItems: "center", gap: 5, maxWidth: "100%", border: "1px solid #d9dee1", background: "#f7f9fa", color: "#46535b", borderRadius: 7, padding: "5px 8px", textDecoration: "none", fontSize: 10.8, fontWeight: 800 },
  teacherWorkflow: { marginBottom: 14 },
  teacherWorkflowSteps: { display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 7, marginBottom: 8 },
  teacherWorkflowStep: { display: "flex", alignItems: "center", gap: 8, minWidth: 0, padding: "9px 10px", border: `1px solid ${COLORS.line}`, borderRadius: 11, background: "#f6f4ee", color: "#8a8578" },
  teacherWorkflowStepActive: { background: "#eef4ec", color: "#2f5134", borderColor: "#b9cfb8", boxShadow: "0 3px 12px rgba(47,81,52,.08)" },
  teacherWorkflowStepDone: { background: "#f7faf6", color: "#59705b", borderColor: "#d4dfd2" },
  teacherWorkflowNumber: { width: 24, height: 24, flex: "0 0 auto", display: "grid", placeItems: "center", borderRadius: 8, background: "#fff", border: `1px solid ${COLORS.line}`, fontSize: 11, fontWeight: 950 },
  teacherZoneNav: { border: `1px solid ${COLORS.line}`, borderRadius: 12, background: "#fff", padding: 11, marginBottom: 14, boxShadow: "0 2px 10px rgba(43,38,32,0.035)" },
  teacherZoneModeRow: { display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" },
  teacherZoneModeBtn: { display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${COLORS.line}`, background: "#fff", color: "#6f695d", borderRadius: 9, padding: "8px 12px", fontSize: 12, fontWeight: 850, cursor: "pointer" },
  teacherZoneModeBtnActive: { background: "#2f4932", color: "#fff", borderColor: "#2f4932", boxShadow: "0 2px 6px rgba(47,73,50,0.18)" },
  teacherZoneModeCount: { display: "inline-flex", minWidth: 19, height: 19, alignItems: "center", justifyContent: "center", borderRadius: 999, background: "rgba(128,128,128,0.14)", fontSize: 9.5, fontWeight: 900 },
  teacherTargetRow: { display: "grid", gridTemplateColumns: "130px 1fr", alignItems: "start", gap: 12, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COLORS.line}` },
  teacherTargetLabel: { fontSize: 11, color: "#4f493f", fontWeight: 950, paddingTop: 4 },
  teacherTargetHint: { fontSize: 9.8, color: "#9a9385", marginTop: 3, lineHeight: 1.4 },
  teacherTargetChoice: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, minWidth: 130, border: `1px solid ${COLORS.line}`, background: "#fff", borderRadius: 10, padding: "8px 11px", color: "#514b42", fontSize: 12, fontWeight: 900, cursor: "pointer" },
  teacherTargetChoiceActive: { background: "#2f4932", borderColor: "#2f4932", color: "#fff", boxShadow: "0 4px 12px rgba(47,73,50,.18)" },
  teacherTargetEmpty: { minHeight: 150, border: `1px dashed ${COLORS.line}`, borderRadius: 13, background: "#fbfaf6", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, color: "#7f786b", marginBottom: 14 },
  teacherComposerHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "16px 18px", background: "linear-gradient(135deg,#f3f7f1,#fff)", borderBottom: `1px solid ${COLORS.line}` },
  teacherComposerEyebrow: { fontSize: 9.5, fontWeight: 950, color: "#648066", letterSpacing: ".04em" },
  teacherComposerTitle: { fontSize: 17, fontWeight: 950, marginTop: 3, color: "#263b2d" },
  teacherComposerDescription: { fontSize: 11, color: "#7d776b", marginTop: 4 },
  teacherComposerTargetBadge: { display: "inline-flex", alignItems: "center", borderRadius: 999, background: "#2f4932", color: "#fff", padding: "5px 9px", fontSize: 10, fontWeight: 900, whiteSpace: "nowrap" },
  teacherComposerGrid: { display: "grid", gridTemplateColumns: "minmax(0,1.65fr) minmax(260px,.72fr)", alignItems: "stretch" },
  teacherComposerMain: { padding: 18, minWidth: 0 },
  teacherComposerAside: { padding: 16, minWidth: 0, background: "#fbfaf6", borderLeft: `1px solid ${COLORS.line}`, display: "flex", flexDirection: "column", gap: 12 },
  teacherAsideSection: { paddingBottom: 12, borderBottom: `1px solid ${COLORS.line}` },
  teacherFieldLabel: { fontSize: 10.5, color: "#645e53", fontWeight: 950, marginBottom: 7 },
  teacherFormField: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 12, fontSize: 10.5, color: "#645e53", fontWeight: 900 },
  teacherUploadGuide: { display: "flex", flexDirection: "column", gap: 7, padding: "9px 10px", borderRadius: 9, background: "#f3f1eb", color: "#746d61", fontSize: 9.7, lineHeight: 1.45 },
  teacherComposerFooter: { position: "sticky", bottom: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "11px 16px", background: "rgba(255,255,255,.96)", borderTop: `1px solid ${COLORS.line}`, backdropFilter: "blur(10px)" },
  teacherComposerFooterText: { fontSize: 10.5, color: "#8a8578", lineHeight: 1.45 },
  noticeOptionGrid: { display: "grid", gridTemplateColumns: "minmax(160px, 220px) minmax(180px, 1fr)", gap: 10, alignItems: "end", marginTop: 10 },
  noticeOptionField: { display: "grid", gap: 5, fontSize: 11, color: "#766f63", fontWeight: 800 },
  teacherNoticeManageRow: { border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 9, background: "#fbfaf6" },
  teacherNoticeManageMeta: { display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 6, fontSize: 10.5, color: "#756e62", fontWeight: 800 },
  feedbackFloatingButton: { position: "fixed", right: 18, bottom: 24, zIndex: 45, display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid #29442d", background: "#365b3b", color: "#fff", borderRadius: 999, padding: "10px 14px", fontSize: 12, fontWeight: 900, cursor: "pointer", boxShadow: "0 7px 20px rgba(35,57,38,0.28)" },
  feedbackOverlay: { position: "fixed", inset: 0, zIndex: 80, background: "rgba(30,28,24,0.38)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 },
  feedbackModal: { width: "min(560px, 100%)", maxHeight: "calc(100vh - 36px)", overflowY: "auto", borderRadius: 14, background: "#fff", border: `1px solid ${COLORS.line}`, boxShadow: "0 18px 55px rgba(0,0,0,0.23)", padding: 18 },
  feedbackModalHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 13 },
  feedbackField: { display: "grid", gap: 5, marginBottom: 10, fontSize: 11.5, color: "#6f685d", fontWeight: 850 },
  feedbackReporterInfo: { display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", borderRadius: 8, padding: "8px 10px", background: "#f5f3ed", border: `1px solid ${COLORS.line}`, fontSize: 11, color: "#716b5f" },
  feedbackAdminSummary: { display: "grid", gridTemplateColumns: "repeat(4, minmax(100px, 1fr))", gap: 8, marginBottom: 12 },
  feedbackSummaryCard: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "10px 12px", background: "#fff", color: "#6f695d", cursor: "pointer", fontSize: 11.5, fontWeight: 800 },
  feedbackSummaryCardActive: { background: "#edf4eb", borderColor: "#bdd1b9", color: "#315a35" },
  feedbackAdminCard: { border: `1px solid ${COLORS.line}`, borderRadius: 11, padding: 13, background: "#fff" },
  feedbackAdminCardHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  feedbackTypeBadge: { display: "inline-flex", padding: "3px 7px", borderRadius: 999, background: "#f2f0ea", color: "#655f55", border: `1px solid ${COLORS.line}`, fontSize: 9.8, fontWeight: 900 },
  feedbackTypeBug: { background: "#fff0f0", color: "#994242", borderColor: "#edcaca" },
  feedbackTypeIdea: { background: "#edf4fb", color: "#38658c", borderColor: "#c9daea" },
  feedbackStatusBadge: { display: "inline-flex", padding: "3px 7px", borderRadius: 999, background: "#edf4eb", color: "#315a35", border: "1px solid #cadbc7", fontSize: 9.8, fontWeight: 900 },
  feedbackAdminMeta: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, paddingTop: 8, borderTop: `1px solid ${COLORS.line}`, color: "#918a7d", fontSize: 10.5 },
  issueList: { marginTop: 10, display: "flex", flexDirection: "column", gap: 4, maxHeight: 400, overflowY: "auto" },
  issueRow: { display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "7px 10px", fontSize: 12, flexWrap: "wrap" },
  issueBadge: { background: "#f3f1e9", padding: "2px 8px", borderRadius: 6, fontSize: 10.5, fontWeight: 700, color: "#8a8578" },
  staffNoticeComposer: { border: "1px solid #d9dfec", borderRadius: 14, background: "linear-gradient(135deg,#f6f8fd,#ffffff)", padding: 17, boxShadow: "0 4px 18px rgba(68,84,120,.06)" },
  staffNoticeManageCard: { border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 12, background: "#fff" },
  staffNoticeAudienceBadge: { display: "inline-flex", borderRadius: 999, padding: "3px 7px", background: "#edf1fa", color: "#4c628f", border: "1px solid #ced8eb", fontSize: 9.5, fontWeight: 900 },
  workspaceBarWrap: { position: "sticky", top: 55, zIndex: 35, background: "rgba(248,251,255,.95)", backdropFilter: "blur(13px)", borderBottom: "1px solid #dbe4ef", boxShadow:"0 5px 18px rgba(55,74,104,.05)" },
  workspaceBarInner: { maxWidth: 1120, margin: "0 auto", padding: "9px 20px", display: "grid", gridTemplateColumns: "minmax(250px,1fr) auto minmax(150px,.45fr)", gap: 10, alignItems: "center" },
  workspaceSearchWrap: { position: "relative", minWidth: 0, height: 38, borderRadius: 12, border: "1px solid #d8dfe8", background: "#fff", display: "flex", alignItems: "center", gap: 8, padding: "0 11px", boxShadow: "0 3px 12px rgba(55,70,90,.05)" },
  workspaceSearchInput: { flex: 1, minWidth: 0, border: 0, outline: 0, fontSize: 12.5, fontWeight: 750, background: "transparent" },
  workspaceClearBtn: { border: 0, background: "transparent", color: "#8a909a", cursor: "pointer", padding: 3, display: "grid", placeItems: "center" },
  workspaceMatches: { position: "absolute", left: 0, right: 0, top: 43, zIndex: 70, background: "#fff", border: "1px solid #dce2ea", borderRadius: 12, padding: 6, boxShadow: "0 14px 32px rgba(46,56,72,.16)", display: "grid", gap: 3 },
  workspaceMatchItem: { border: 0, borderRadius: 8, background: "transparent", padding: "8px 10px", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11.5, color: "#6b7280" },
  workspaceViewTabs: { display: "flex", gap: 4, padding: 4, borderRadius: 13, background: "linear-gradient(135deg,#eaf1f9,#f0edf8)", border:"1px solid #dde4ee" },
  workspaceViewBtn: { border: 0, borderRadius: 9, background: "transparent", color: "#667085", padding: "7px 10px", fontSize: 11.5, fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" },
  workspaceViewBtnActive: { background: "#fff", color: "#244f86", boxShadow: "0 3px 9px rgba(48,65,90,.13)", border:"1px solid #d6e1ef" },
  workspaceStudentState: { minWidth: 0, fontSize: 10.5, color: "#8a8578", textAlign: "right", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 },
  staffNoticeDock: { position: "fixed", left: 18, top: 212, zIndex: 44, width: 300 },
  staffNoticeDockButton: { display: "inline-flex", alignItems: "center", gap: 7, borderRadius: 999, padding: "9px 12px", border: "1px solid #d2d5df", background: "#fff", color: "#526079", fontSize: 11.5, fontWeight: 900, cursor: "pointer", boxShadow: "0 7px 22px rgba(40,46,60,.12)" },
  staffNoticeDockUnread: { background: "#2f3e62", color: "#fff", borderColor: "#2f3e62" },
  personalAlertDockButton: { background: "linear-gradient(135deg,#314d7a,#5f6f9b)", color: "#fff", borderColor: "#314d7a", fontSize: 12.2, padding: "10px 14px" },
  studentAlertDockButton: { background: "linear-gradient(135deg,#315d62,#4f8790)", color: "#fff", borderColor: "#315d62", fontSize: 12.2, padding: "10px 14px" },
  personalAlertItem: { border: "1px solid #e5e1da", borderRadius: 11, padding: 10, background: "#fbfaf7" },
  personalAlertItemUnread: { borderColor: "#c7d3eb", background: "#f3f6fc", boxShadow: "inset 3px 0 #5471a5" },
  personalAlertType: { display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "2px 6px", fontSize: 8.8, fontWeight: 950, border: "1px solid" },
  personalAlertTypeAdmin: { color: "#485c89", background: "#edf1fa", borderColor: "#ced8eb" },
  personalAlertTypeOwn: { color: "#7c5624", background: "#fff5e6", borderColor: "#ecd6ad" },
  personalAlertTypeStudent: { color: "#315f64", background: "#eaf4f4", borderColor: "#c9dddd" },
  personalAlertDue: { display: "inline-flex", alignItems: "center", gap: 3, borderRadius: 999, padding: "2px 6px", fontSize: 8.8, fontWeight: 950, color: "#9a453d", background: "#fff0ee", border: "1px solid #ecc7c2" },
  personalAlertAction: { marginTop: 8, display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid #ccd4e4", borderRadius: 7, background: "#fff", color: "#53698f", padding: "4px 7px", fontSize: 9.5, fontWeight: 900, cursor: "pointer" },
  staffNoticeCount: { minWidth: 20, height: 20, display: "inline-grid", placeItems: "center", borderRadius: 999, background: "#ffd978", color: "#25314d", fontSize: 10 },
  staffNoticePopup: { marginTop: 8, width: "100%", borderRadius: 13, background: "#fff", border: "1px solid #d9dbe3", boxShadow: "0 14px 40px rgba(34,38,50,.2)", padding: 11 },
  staffNoticePopupHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "2px 2px 9px", borderBottom: "1px solid #ece9e2", marginBottom: 8 },
  iconTextBtn: { display: "inline-flex", alignItems: "center", gap: 4, border: 0, background: "transparent", color: "#546a9a", fontSize: 9.5, fontWeight: 900, cursor: "pointer" },
  staffNoticeItem: { width: "100%", textAlign: "left", border: "1px solid #e6e1d8", borderRadius: 9, padding: 9, background: "#faf9f6", color: "#343039", fontSize: 10.5, cursor: "pointer" },
  staffNoticeItemUnread: { background: "#f2f5fc", borderColor: "#cbd5eb", boxShadow: "inset 3px 0 #5b70a4" },
  staffNoticeNew: { borderRadius: 999, background: "#f4c95d", color: "#2f3545", padding: "2px 5px", fontSize: 8, fontWeight: 950 },
  toast: { position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "10px 18px", borderRadius: 8, fontSize: 13, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", zIndex: 50 },
};
