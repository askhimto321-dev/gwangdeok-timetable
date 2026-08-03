import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Search, Printer, Settings, AlertTriangle, ArrowRight, Users, Upload, FileSpreadsheet, FileText, Loader2, Check, X, Save, Database, Trash2, Lock, KeyRound, Eye, ClipboardList, Calendar } from "lucide-react";
import { readStorage, writeStorage } from "./storage.js";
import GradesSection, { loadGradesDB, AdminGradesUpload, AdminStudentAccounts } from "./Grades.jsx";

const COLORS = { ink: "#2b2620", paper: "#faf8f3", line: "#e6e1d3", accent: "#3d5c3a", accentSoft: "#eaf0e8" };

const DAYS = ["월", "화", "수", "목", "금"];
const PERIODS = [1, 2, 3, 4, 5, 6, 7];
const PERIOD_TIME = { 1: "08:40", 2: "09:40", 3: "10:40", 4: "11:40", 5: "13:30", 6: "14:30", 7: "15:30" };
const FIXED_LABELS = { "자율": "자율학습", "진로": "진로활동" };
const GRADES = ["1", "2", "3"];
const DISABLED_GRADES = ["1"];
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
function getReadIds(sid) {
  try { return new Set(JSON.parse(localStorage.getItem(`kd_read_${sid}`) || "[]")); }
  catch { return new Set(); }
}
function markRead(sid, ids) {
  try {
    const cur = getReadIds(sid);
    ids.forEach(id => cur.add(id));
    localStorage.setItem(`kd_read_${sid}`, JSON.stringify(Array.from(cur)));
  } catch { /* localStorage unavailable */ }
}
const NOTICE_CATEGORIES = ["공지", "수행평가", "과제"];
const HOMEROOM_CATEGORIES = ["공지사항", "제출", "신청", "상담"];
const NOTICE_CATEGORY_COLOR = {
  "공지": { bg: "#fff8e6", border: "#f0dca0", text: "#8a6d1f" },
  "수행평가": { bg: "#fdeeee", border: "#f0b8b8", text: "#a3402b" },
  "과제": { bg: "#eaf1fb", border: "#b8d0f0", text: "#2b5aa3" },
  "공지사항": { bg: "#f2eefb", border: "#cdb8f0", text: "#5c2ba3" },
  "제출": { bg: "#eafbf0", border: "#b8f0cd", text: "#1f7d43" },
  "신청": { bg: "#fbf3ea", border: "#f0d5b8", text: "#a3641f" },
  "상담": { bg: "#eaf7fb", border: "#b8e5f0", text: "#1f7a9c" },
};

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

/* ============================================================ */
export default function App() {
  const [section, setSection] = useState(null); // null = not chosen yet | "grades" | "timetable"
  const [tab, setTab] = useState("student");
  const [loading, setLoading] = useState(true);
  const [grade, setGrade] = useState("2");
  const [semester, setSemester] = useState("sem1");
  const [db, setDb] = useState({ roster: {}, enrollments: {}, timetables: {}, meta: {}, roomNames: {}, announcements: {} });
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
  const sessionRestoredRef = useRef(false);
  const [toast, setToast] = useState(null);
  const showToast = useCallback((msg, type = "info") => { setToast({ msg, type }); setTimeout(() => setToast(null), 4200); }, []);

  useEffect(() => {
    (async () => {
      const [roster, enrollments, timetables, meta, abbrev1, abbrev2, abbrev3, accts, roomNames, announcements] = await Promise.all([
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
      ]);
      setDb({ roster, enrollments, timetables, meta, roomNames, announcements });
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
            if (s) setLoggedInStudent(s);
          }
          if (saved.selectedStudentSid) {
            setSelectedStudentSid(String(saved.selectedStudentSid));
            setSelectedStudentQuery(String(saved.selectedStudentQuery || saved.selectedStudentSid));
            const selectedGrade = String(saved.selectedStudentSid).charAt(0);
            if (GRADES.includes(selectedGrade) && !DISABLED_GRADES.includes(selectedGrade)) setGrade(selectedGrade);
          }
          if (saved.section) setSection(saved.section);
        } catch { /* ignore malformed session */ }
      }
    })();
  }, []);

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
    if (studentMatch) { setLoggedInStudent(studentMatch); saveSession({ studentId: studentMatch.id }); return "student"; }
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
    if (patch.admissionRows) jobs.push(writeStorage("kd_grades_admission", patch.admissionRows));
    if (patch.admissionDocs) jobs.push(writeStorage("kd_grades_admission_docs", patch.admissionDocs));
    const results = await Promise.all(jobs);
    if (results.some(r => r && r.ok === false)) { showToast("저장에 실패했습니다.", "error"); return false; }
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
    (enrollments[sid] || []).forEach(course => {
      const ab = rev[course.subject];
      const noticeKey = targetKeyFor("elective", course.subject, course.group);
      asNoticeArray(announcements[noticeKey]).forEach(n => notices.push({ subject: course.subject, group: `${course.group}그룹`, ...n }));
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
      if (!c || c.type !== "fixed") return;
      const key = targetKeyFor("common", c.subject, info.class);
      if (seenCommon.has(key)) return;
      seenCommon.add(key);
      asNoticeArray(announcements[key]).forEach(n => notices.push({ subject: c.subject, group: `${info.class}반`, ...n }));
    }));
    const personalNotices = asNoticeArray(announcements[`STUDENT_${sid}`]).map(n => ({ ...n, origin: "personal" }));
    const homeroomOnly = asNoticeArray(announcements[homeroomKeyFor(info.class)]).map(n => ({ ...n, origin: "homeroom" }));
    const homeroomNotices = [...homeroomOnly, ...personalNotices];
    return { student: info, grid, warnings, notices, homeroomNotices, hasTimetable: !!homeTT };
  }, [roster, enrollments, timetables, abbrevMap, roomNames, announcements]);

  const adminAccounts = accounts.admin.length ? accounts.admin : [DEFAULT_ADMIN];
  const hasAnyData = Object.keys(roster).length > 0;
  const anyLoggedIn = !!(loggedInAdmin || loggedInTeacher || loggedInDepartment || loggedInMonitor || classAuthed || loggedInStudent);
  const canViewStudentTimetableTools = !!(loggedInAdmin || classAuthed || loggedInMonitor || (loggedInTeacher && teacherCanViewTimetable) || (loggedInDepartment && departmentCanViewTimetable));

  if (loading) return <div style={styles.loadingScreen}><Loader2 className="spin" size={24} /><div style={styles.loadingText}>로딩 중입니다. 잠시만 기다려주세요.</div></div>;

  const globalLogout = () => {
    setLoggedInAdmin(null); setLoggedInTeacher(null); setLoggedInDepartment(null); setLoggedInMonitor(null); setClassAuthed(false); setLoggedInStudent(null);
    setSection(null);
    try { localStorage.removeItem("kd_session"); } catch { /* ignore */ }
  };
  const activeSection = section || "grades";
  const switchSection = (s) => {
    if (loggedInAdmin && selectedStudentSid) {
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
      <MegaNav active={activeSection} onSwitch={switchSection} onLogout={globalLogout} showAdmin={!!loggedInAdmin} />
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
          selectedStudentSid={loggedInAdmin ? selectedStudentSid : undefined}
          onSelectedStudentSidChange={loggedInAdmin ? updateSelectedStudentSid : undefined}
          selectedStudentQuery={loggedInAdmin ? selectedStudentQuery : undefined}
          onSelectedStudentQueryChange={loggedInAdmin ? updateSelectedStudentQuery : undefined}
        />
      ) : (loggedInStudent && !loggedInAdmin && !loggedInTeacher && !loggedInDepartment && !loggedInMonitor && !classAuthed) ? (
        <div style={styles.body}>
          <h1 style={styles.h1}>{loggedInStudent.name} 학생 시간표</h1>
          <StudentOwnTimetable student={loggedInStudent} build={buildPersonalTimetable} grade={grade} setGrade={setGrade} />
        </div>
      ) : (
        <>
          <TopBar
            tab={tab} setTab={setTab} grade={grade} setGrade={setGrade}
            semester={semester} setSemester={setSemester} meta={db.meta[scopeKey]}
            canViewStudentTools={canViewStudentTimetableTools}
            allowedGrades={(loggedInTeacher || loggedInDepartment) ? staffTimetableAccessList : null}
          />
          <div style={styles.body}>
            {tab === "student" && (canViewStudentTimetableTools
              ? <StudentView
                  key={scopeKey}
                  roster={roster}
                  build={buildPersonalTimetable}
                  hasAnyData={hasAnyData}
                  selectedSid={loggedInAdmin ? selectedStudentSid : undefined}
                  onSelectedSidChange={loggedInAdmin ? updateSelectedStudentSid : undefined}
                  sharedQuery={loggedInAdmin ? selectedStudentQuery : undefined}
                  onSharedQueryChange={loggedInAdmin ? updateSelectedStudentQuery : undefined}
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
  const [id, setId] = useState(""), [pw, setPw] = useState(""), [err, setErr] = useState("");
  const submit = () => {
    const role = attemptLogin(id.trim(), pw);
    if (!role) { setErr("아이디 또는 비밀번호가 올바르지 않습니다."); return; }
    setErr("");
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
          <div style={styles.brandMark}>移</div>
          <span style={{ fontWeight: 700, fontSize: 14 }}>광덕고 성적/시간표</span>
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
  wrap: { background: "#fff", borderBottom: `1px solid ${COLORS.line}` },
  inner: { maxWidth: 1040, margin: "0 auto", padding: "10px 20px", display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" },
  brand: { display: "flex", alignItems: "center", gap: 8, marginRight: 8 },
  tabs: { display: "flex", gap: 4, flex: 1 },
  tab: { border: "none", background: "transparent", padding: "10px 18px", borderRadius: 8, fontSize: 14.5, fontWeight: 700, color: "#a39d8c", cursor: "pointer", transition: "background 0.15s, color 0.15s" },
  tabActive: { color: COLORS.ink, background: COLORS.accentSoft },
};

function TopBar({ tab, setTab, grade, setGrade, semester, setSemester, meta, onBackToSections, canViewStudentTools = true, allowedGrades = null }) {
  return (
    <div style={styles.topbar} className="no-print">
      <div style={styles.topbarRow}>
        <div style={styles.brand}>
          <div style={styles.brandMark}>移</div>
          <div>
            <div style={styles.brandTitle}>{SITE_TITLE} <span style={styles.betaBadge}>Beta</span></div>
            <div style={styles.brandSub}>{meta?.updatedAt ? `최근 업데이트 · ${new Date(meta.updatedAt).toLocaleString("ko-KR")}` : "데이터 없음"}</div>
          </div>
        </div>
        <nav style={styles.nav}>
          {onBackToSections && <NavBtn active={false} onClick={onBackToSections} icon={<ArrowRight size={15} style={{ transform: "rotate(180deg)" }} />} label="메뉴로" />}
          {canViewStudentTools && <NavBtn active={tab === "student"} onClick={() => setTab("student")} icon={<Search size={15} />} label="학생 조회" />}
          {canViewStudentTools && <NavBtn active={tab === "classPrint"} onClick={() => setTab("classPrint")} icon={<Users size={15} />} label="학급별 조회" />}
          {canViewStudentTools && <NavBtn active={tab === "subjectGroup"} onClick={() => setTab("subjectGroup")} icon={<ClipboardList size={15} />} label="이동수업반별 명단" />}
          <NavBtn active={tab === "teacherZone"} onClick={() => setTab("teacherZone")} icon={<Lock size={15} />} label="선생님 ZONE" />
        </nav>
      </div>
      <div style={styles.scopeRow}>
        <ScopeGroup label="학년">{GRADES.map(g => {
          const permissionDisabled = Array.isArray(allowedGrades) && !allowedGrades.map(String).includes(String(g));
          const disabled = DISABLED_GRADES.includes(g) || permissionDisabled;
          return <ScopeBtn key={g} active={grade === g} disabled={disabled} onClick={() => setGrade(g)}>{g}학년{DISABLED_GRADES.includes(g) ? " (준비중)" : permissionDisabled ? " (권한없음)" : ""}</ScopeBtn>;
        })}</ScopeGroup>
        <ScopeGroup label="학기"><ScopeBtn active={semester === "sem1"} onClick={() => setSemester("sem1")}>1학기</ScopeBtn><ScopeBtn active={semester === "sem2"} onClick={() => setSemester("sem2")}>2학기</ScopeBtn></ScopeGroup>
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
          <div style={styles.card}>
            <div style={styles.cardTitle}>{sel}</div>
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
                      <div style={{ fontSize: 12.5, color: cat.text, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{n.text}</div>
                    </div>
                  );
                })}
              </div>
            )}
            <table style={{ ...styles.editTable, marginTop: 14 }}>
              <thead><tr><th style={styles.th}>학번</th><th style={styles.th}>이름</th><th style={styles.th}>원소속반</th><th style={styles.th}>번호</th></tr></thead>
              <tbody>{selected.students.map(s => <tr key={s.sid}><td style={styles.tdReadonly}>{s.sid}</td><td style={styles.tdReadonly}>{s.name}</td><td style={styles.tdReadonly}>{s.class}반</td><td style={styles.tdReadonly}>{s.number}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function TeacherZoneView({ teacher, db, persist, showToast, scopeKey, grade, onLogout, roster, enrollments, accounts, persistAccounts, onUpdateTeacher, viewingAsAdmin }) {
  const [editingProfile, setEditingProfile] = useState(false);

  // Combine homeroom (if any) and all subject assignments into one flat list of selectable targets.
  const flatTargets = useMemo(() => {
    const out = [];
    if (teacher.homeroomClass) out.push({ kind: "homeroom", target: teacher.homeroomClass, label: `${teacher.homeroomClass}반 학급 공지`, categories: HOMEROOM_CATEGORIES });
    (teacher.assignments || []).forEach(a => {
      (a.targets || "").split(",").map(s => s.trim()).filter(Boolean).forEach(t => {
        out.push({ kind: a.kind, subject: a.subject, target: t, label: a.kind === "common" ? `${a.subject} — ${t}반` : `${a.subject} — ${t}그룹`, categories: NOTICE_CATEGORIES });
      });
    });
    return out;
  }, [teacher]);

  const [selIdx, setSelIdx] = useState(0);
  const sel = flatTargets[selIdx];
  const categories = sel ? sel.categories : NOTICE_CATEGORIES;
  const targetKey = sel ? (sel.kind === "homeroom" ? homeroomKeyFor(sel.target) : targetKeyFor(sel.kind, sel.subject, sel.target)) : null;
  const currentNotices = asNoticeArray((db.announcements[scopeKey] || {})[targetKey]);

  const [category, setCategory] = useState(categories[0]);
  useEffect(() => { setCategory((sel ? sel.categories : NOTICE_CATEGORIES)[0]); }, [selIdx]); // eslint-disable-line
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const writeNotices = async (key, updater) => {
    const current = db.announcements[scopeKey] || {};
    const list = asNoticeArray(current[key]);
    const updated = { ...current, [key]: updater(list) };
    return persist({ announcements: { ...db.announcements, [scopeKey]: updated } });
  };

  const addNotice = async () => {
    if (!text.trim()) { showToast("내용을 입력해주세요.", "error"); return; }
    if (!targetKey) { showToast("대상을 먼저 선택해주세요.", "error"); return; }
    setSaving(true);
    try {
      const newEntry = { id: Date.now() + "_" + Math.random().toString(36).slice(2, 7), category, text: text.trim(), dueDate: dueDate || null, teacherName: teacher.name, updatedAt: new Date().toISOString() };
      const ok = await writeNotices(targetKey, list => [...list, newEntry]);
      if (ok) { showToast("저장했습니다.", "success"); setText(""); setDueDate(""); }
    } catch (e) {
      showToast(`오류가 발생했습니다: ${e.message}`, "error");
    }
    setSaving(false);
  };

  const deleteNotice = async (id) => {
    try {
      const ok = await writeNotices(targetKey, list => list.filter(n => n.id !== id));
      if (ok) showToast("삭제했습니다.", "success");
    } catch (e) {
      showToast(`오류가 발생했습니다: ${e.message}`, "error");
    }
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

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div>
          <h1 style={styles.h1}>선생님 ZONE {viewingAsAdmin && <span style={{ fontSize: 12, fontWeight: 700, color: "#8a6d1f", background: "#fff8e6", border: "1px solid #f0dca0", borderRadius: 5, padding: "2px 8px", marginLeft: 6 }}>관리자로 보는 중</span>}</h1>
          <p style={styles.pMuted}>{teacher.name} 선생님{teacher.homeroomClass && ` · ${teacher.homeroomClass}반 담임`}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={styles.secondaryBtn} onClick={() => setEditingProfile(true)}>내 정보 수정</button>
          <button style={styles.secondaryBtn} onClick={onLogout}>{viewingAsAdmin ? "돌아가기" : "로그아웃"}</button>
        </div>
      </div>

      {flatTargets.length === 0 && (
        <div style={styles.warnBanner}><AlertTriangle size={14} /> 담당 반/과목이 등록되어 있지 않습니다. "내 정보 수정"에서 직접 설정해주세요.</div>
      )}

      {flatTargets.length > 0 && (
        <>
          <div className="no-print" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, color: "#8a8578", marginBottom: 6 }}>공지를 작성할 대상을 선택하세요</div>
            <div style={styles.classChips}>
              {flatTargets.map((t, i) => <button key={i} onClick={() => setSelIdx(i)} style={{ ...styles.classChip, ...(selIdx === i ? styles.classChipActive : {}) }}>{t.label}</button>)}
            </div>
          </div>

          <div style={styles.card}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{sel.label} 작성</div>
            <div style={{ fontSize: 12.5, color: "#8a8578", marginBottom: 10 }}>
              {sel.kind === "homeroom" ? `이 내용은 ${sel.target}반 학생의 개인 시간표 상단에 표시됩니다.` : `이 항목은 ${sel.label}인 학생의 개인 시간표${sel.kind === "elective" ? ' · "이동수업반별 명단" 페이지' : ""}에 표시됩니다.`}
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              {categories.map(c => <button key={c} onClick={() => setCategory(c)} style={{ ...styles.classChip, ...(category === c ? styles.classChipActive : {}) }}>{c}</button>)}
            </div>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={5} style={{ ...styles.textareaInput }} placeholder={sel.kind === "homeroom" ? "예: 다음 주 화요일까지 진로 희망서를 제출해주세요." : "예: 다음 시간에는 3층 과학실습실로 이동합니다. 준비물: 실험복."} />
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

            {sel.kind !== "homeroom" && (
              <MonitorManager
                targetKey={targetKey} subject={sel.subject} group={sel.target} label={sel.label}
                roster={roster} enrollments={enrollments} accounts={accounts} persistAccounts={persistAccounts}
                showToast={showToast} teacherName={teacher.name}
              />
            )}
          </div>
        </>
      )}

      <PersonalNoticeComposer roster={roster} db={db} persist={persist} showToast={showToast} scopeKey={scopeKey} teacher={teacher} />
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
    <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${COLORS.line}` }}>
      <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>교과부장 학생 관리 ({label})</div>
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
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim();
    return Object.entries(roster)
      .filter(([sid, s]) => !selected.some(sel => sel.sid === sid) && (sid.includes(q) || s.name.includes(q) || `${s.class}반${s.number}번`.includes(q.replace(/\s/g, ""))))
      .slice(0, 8);
  }, [query, roster, selected]);

  const addStudent = (sid, s) => { setSelected(prev => [...prev, { sid, ...s }]); setQuery(""); };
  const removeStudent = (sid) => setSelected(prev => prev.filter(s => s.sid !== sid));

  const send = async () => {
    if (!text.trim()) { showToast("내용을 입력해주세요.", "error"); return; }
    if (!selected.length) { showToast("학생을 한 명 이상 선택해주세요.", "error"); return; }
    setSaving(true);
    try {
      const current = db.announcements[scopeKey] || {};
      const updated = { ...current };
      const newEntry = { id: Date.now() + "_" + Math.random().toString(36).slice(2, 7), category, text: text.trim(), dueDate: dueDate || null, teacherName: teacher.name, updatedAt: new Date().toISOString() };
      selected.forEach(s => {
        const key = `STUDENT_${s.sid}`;
        updated[key] = [...asNoticeArray(current[key]), newEntry];
      });
      const ok = await persist({ announcements: { ...db.announcements, [scopeKey]: updated } });
      if (ok) { showToast(`${selected.length}명에게 전송했습니다.`, "success"); setText(""); setDueDate(""); setSelected([]); }
    } catch (e) {
      showToast(`오류가 발생했습니다: ${e.message}`, "error");
    }
    setSaving(false);
  };

  return (
    <div style={{ ...styles.card, marginTop: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>학생 지정 공지</div>
      <div style={{ fontSize: 12.5, color: "#8a8578", marginBottom: 10 }}>특정 학생을 지정해서 개인 공지를 보낼 수 있습니다. 선택한 학생의 개인 시간표 상단에 표시됩니다.</div>
      <div style={styles.searchBox}>
        <Search size={16} color="#a39d8c" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="학번, 이름, 또는 '3반 12번'으로 검색" style={styles.searchInput} />
      </div>
      {matches.length > 0 && (
        <div style={styles.matchList}>
          {matches.map(([sid, s]) => (
            <button key={sid} style={styles.matchItem} onClick={() => addStudent(sid, s)}>
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              <span style={styles.matchMeta}>{s.class}반 {s.number}번 · {sid}</span>
            </button>
          ))}
        </div>
      )}
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0" }}>
          {selected.map(s => (
            <span key={s.sid} style={{ display: "flex", alignItems: "center", gap: 4, background: COLORS.accentSoft, color: COLORS.accent, borderRadius: 14, padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>
              {s.name} ({s.class}반 {s.number}번)
              <X size={12} style={{ cursor: "pointer" }} onClick={() => removeStudent(s.sid)} />
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, margin: "10px 0", flexWrap: "wrap" }}>
        {[...NOTICE_CATEGORIES, ...HOMEROOM_CATEGORIES].filter((c, i, arr) => arr.indexOf(c) === i).map(c => (
          <button key={c} onClick={() => setCategory(c)} style={{ ...styles.classChip, ...(category === c ? styles.classChipActive : {}) }}>{c}</button>
        ))}
      </div>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={4} style={styles.textareaInput} placeholder="예: 지난주 결석에 대한 사유서를 제출해주세요." />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
        <span style={{ fontSize: 12, color: "#8a8578" }}>마감기한 (선택)</span>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ ...styles.cellInput, border: `1px solid ${COLORS.line}`, borderRadius: 6, width: 160 }} />
        {dueDate && <button style={styles.iconBtn} onClick={() => setDueDate("")}><X size={13} /></button>}
      </div>
      <button style={{ ...styles.primaryBtn, marginTop: 10 }} onClick={send} disabled={saving}>{saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} {selected.length > 0 ? `${selected.length}명에게 전송` : "전송"}</button>
    </div>
  );
}

function TimetableCard({ result, sid }) {
  const { student, grid, warnings, hasTimetable, notices, homeroomNotices } = result;
  const hasNotices = (notices && notices.length > 0) || (homeroomNotices && homeroomNotices.length > 0);
  return (
    <div style={styles.card} className="print-card">
      <div style={styles.printHeader} className="print-header">
        <div><div style={styles.cardTitle}>{student.name} <span style={styles.cardSub}>{student.class}반 {student.number}번</span></div><div style={styles.cardMeta}>학번 {sid}</div></div>
        <button type="button" className="no-print" style={styles.printBtn} onClick={() => window.print()}><Printer size={14} /> 인쇄 / PDF</button>
      </div>
      {!hasTimetable && <div style={styles.warnBanner}><AlertTriangle size={14} /> {student.class}반 시간표 데이터가 없습니다.</div>}
      <GridTable grid={grid} />
      <div style={styles.legend}>
        <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: "#c7d2c4" }} /> 공통수업</span>
        <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: "#e7dfc7" }} /> 이동수업 (이동 없음)</span>
        <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: "#e3c6ae" }} /> 이동수업 (교실 이동)</span>
      </div>
      {hasNotices && (
        <NoticesTabs notices={notices} homeroomNotices={homeroomNotices} className="no-print" sid={sid} />
      )}
      {warnings.length > 0 && <div style={styles.warnBox} className="no-print"><div style={styles.warnBoxTitle}><AlertTriangle size={13} /> 확인 필요 {warnings.length}건</div><ul style={styles.warnUl}>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
    </div>
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
      <div style={{ fontSize: 12.5, color: cat.text, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{n.text}</div>
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
      <div style={styles.adminScopePanel}>
        <ScopeGroup label="학년">{GRADES.map(g => <ScopeBtn key={g} active={props.grade === g} disabled={DISABLED_GRADES.includes(g)} onClick={() => props.setGrade(g)}>{g}학년{DISABLED_GRADES.includes(g) ? " (준비중)" : ""}</ScopeBtn>)}</ScopeGroup>
        <ScopeGroup label="학기"><ScopeBtn active={props.semester === "sem1"} onClick={() => props.setSemester("sem1")}>1학기</ScopeBtn><ScopeBtn active={props.semester === "sem2"} onClick={() => props.setSemester("sem2")}>2학기</ScopeBtn></ScopeGroup>
        <div style={styles.adminScopeCaption}>현재 관리 범위 · {props.grade}학년 {props.semester === "sem1" ? "1학기" : "2학기"}</div>
      </div>
      <div style={styles.adminTabs}>
        <button onClick={() => setSub("timetable")} style={{ ...styles.adminTabBtn, ...(sub === "timetable" ? styles.adminTabBtnActive : {}) }}><ClipboardList size={14} /> 시간표 관리</button>
        <button onClick={() => setSub("grades")} style={{ ...styles.adminTabBtn, ...(sub === "grades" ? styles.adminTabBtnActive : {}) }}><FileSpreadsheet size={14} /> 성적 데이터</button>
        <button onClick={() => setSub("accounts")} style={{ ...styles.adminTabBtn, ...(sub === "accounts" ? styles.adminTabBtnActive : {}) }}><Lock size={14} /> 계정 관리</button>
      </div>
      {sub === "timetable" && <AdminView key={props.scopeKey} {...props} onLogout={null} />}
      {sub === "grades" && (
        props.gdb ? <AdminGradesUpload gdb={props.gdb} persistGrades={props.persistGrades} showToast={props.showToast} />
          : <div style={{ padding: 20, textAlign: "center" }}><Loader2 className="spin" size={18} /></div>
      )}
      {sub === "accounts" && <AdminAccountConsole {...props} />}
    </div>
  );
}

function AdminAccountConsole(props) {
  const [sub, setSub] = useState("staff");
  return (
    <div>
      <div style={{ ...styles.adminTabs, marginBottom: 14 }}>
        <button onClick={() => setSub("staff")} style={{ ...styles.adminTabBtn, ...(sub === "staff" ? styles.adminTabBtnActive : {}) }}><Users size={14} /> 선생님·관리자 계정</button>
        <button onClick={() => setSub("students")} style={{ ...styles.adminTabBtn, ...(sub === "students" ? styles.adminTabBtnActive : {}) }}><Users size={14} /> 학생 계정</button>
      </div>
      {sub === "staff" && <AdminAccounts {...props} />}
      {sub === "students" && <AdminStudentAccounts accounts={props.accounts} persistAccounts={props.persistAccounts} showToast={props.showToast} roster={props.roster} />}
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

function AdminAccounts({ accounts, persistAccounts, showToast, db, grade, scopeKey, semester }) {
  const normalizeTeachers = list => (list || []).map(teacher => applyAutomaticTeacherAccess(teacher, teacherRoleGrade(teacher) || grade));
  const [admins, setAdmins] = useState(accounts.admin);
  const [cvs, setCvs] = useState(accounts.classView);
  const [departments, setDepartments] = useState(() => (accounts.departments || []).map(item => ({
    ...item,
    gradeAccessGrades: normalizeGradeAccessList(item.gradeAccessGrades),
    timetableAccessGrades: normalizeGradeAccessList(item.timetableAccessGrades),
  })));
  const [teachers, setTeachers] = useState(() => normalizeTeachers(accounts.teacher));
  useEffect(() => {
    setAdmins(accounts.admin);
    setCvs(accounts.classView);
    setDepartments((accounts.departments || []).map(item => ({
      ...item,
      gradeAccessGrades: normalizeGradeAccessList(item.gradeAccessGrades),
      timetableAccessGrades: normalizeGradeAccessList(item.timetableAccessGrades),
    })));
    setTeachers(normalizeTeachers(accounts.teacher));
  }, [accounts]); // eslint-disable-line

  const save = async () => {
    const cleanGeneric = list => list.filter(item => item.id.trim() && item.pw).map(item => ({ id: item.id.trim(), pw: item.pw }));
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
      admin: cleanAdmins(admins), classView: cleanGeneric(cvs), departments: cleanDepartments(departments), teacher: cleanTeachers,
      teacherPending: accounts.teacherPending || [], monitors: accounts.monitors || [], students: accounts.students || [],
    });
    if (ok) showToast("저장했습니다.", "success");
  };

  const resetAll = async () => {
    const nextAdmins = admins.map(item => ({ ...item, pw: RESET_PASSWORD }));
    const nextClassViews = cvs.map(item => ({ ...item, pw: RESET_PASSWORD }));
    const nextDepartments = departments.map(item => ({ ...item, pw: RESET_PASSWORD }));
    const nextTeachers = teachers.map(item => ({ ...item, pw: RESET_PASSWORD }));
    setAdmins(nextAdmins); setCvs(nextClassViews); setDepartments(nextDepartments); setTeachers(nextTeachers);
    const ok = await persistAccounts({
      admin: nextAdmins, classView: nextClassViews, departments: nextDepartments, teacher: nextTeachers,
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
      const existingIds = new Set(teachers.map(teacher => teacher.id));
      const added = [];
      for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex]; if (!row) continue;
        const name = row[indexes["이름"]], id = row[indexes["아이디"]], pw = row[indexes["비밀번호"]];
        if (!name || !id || !pw) continue;
        const idString = String(id).trim();
        if (existingIds.has(idString)) continue;
        existingIds.add(idString);
        added.push(applyAutomaticTeacherAccess({
          name: String(name).trim(), id: idString, pw: String(pw).trim(), teacherRole: "other", roleGrade: grade,
          homeroomClass: "", gradeAccessGrades: [], timetableAccessGrades: [], assignments: [],
        }, grade));
      }
      if (!added.length) { showToast("추가할 새 계정을 찾지 못했습니다. (아이디 중복 또는 빈 값)", "error"); setTeacherUploadBusy(false); return; }
      setTeachers(current => [...current, ...added]);
      showToast(`${added.length}명의 선생님 계정을 추가했습니다. 역할과 접근 권한을 확인한 뒤 저장해주세요.`, "success");
    } catch (error) {
      showToast(`파일 오류: ${error.message}`, "error");
    }
    setTeacherUploadBusy(false);
  };

  return (
    <div>
      {!accounts.admin.length && <div style={styles.warnBanner}><AlertTriangle size={14} /> 관리자 계정이 없어 초기 계정({DEFAULT_ADMIN.id}/{DEFAULT_ADMIN.pw})으로 접속 중입니다. 계정을 등록해주세요.</div>}

      <div style={accountConsole.summaryGrid}>
        {[
          ["관리자", admins.length, "전체 설정"],
          ["부서 계정", departments.length, "성적·시간표 개별 권한"],
          ["선생님", teachers.length, "역할 기반 권한"],
          ["반별조회", cvs.length, "시간표·명단 전용"],
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
            <div key={department.id || index} style={accountConsole.accountCard}>
              <div style={accountConsole.identityRow}>
                <input value={department.name || ""} onChange={event => updateDepartmentField(index, "name", event.target.value)} placeholder="부서명 (예: 2학년부)" style={accountConsole.input} />
                <button style={styles.iconBtn} onClick={() => setDepartments(current => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></button>
              </div>
              <div style={accountConsole.credentials}>
                <label style={accountConsole.field}><span>아이디</span><input value={department.id || ""} onChange={event => updateDepartmentField(index, "id", event.target.value)} placeholder="아이디" style={accountConsole.input} /></label>
                <label style={accountConsole.field}><span>비밀번호</span><input value={department.pw || ""} onChange={event => updateDepartmentField(index, "pw", event.target.value)} placeholder="비밀번호" style={accountConsole.input} /></label>
              </div>
              <TeacherAccessMatrix teacher={department} index={index} onToggle={toggleDepartmentAccess} />
            </div>
          ))}
        </div>
        <button style={{ ...styles.secondaryBtn, marginTop: 10 }} onClick={addDepartment}>+ 부서 계정 추가</button>
      </div>

      <div style={accountConsole.panel}>
        <div style={accountConsole.panelHeader}>
          <div>
            <div style={accountConsole.panelTitle}>학급별 조회 / 이동수업반별 명단 계정</div>
            <div style={accountConsole.panelDescription}>성적 조회 없이 학급 시간표와 이동수업 명단만 확인하는 공용 계정입니다.</div>
          </div>
          <span style={accountConsole.count}>{cvs.length}개</span>
        </div>
        <AccountTable list={cvs} setList={setCvs} />
        <button style={styles.secondaryBtn} onClick={() => setCvs(current => [...current, { id: "", pw: "" }])}>+ 반별조회 계정 추가</button>
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
          <div style={{ fontSize: 11.5, color: "#8a8578", flex: 1 }}>엑셀 일괄 등록: 첫 행에 "이름", "아이디", "비밀번호" 열이 있는 파일을 올려주세요. 신규 계정은 기본적으로 학생정보 접근 권한이 없는 "그외" 역할로 등록됩니다.</div>
          <input ref={teacherFileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={event => event.target.files[0] && handleTeacherExcel(event.target.files[0])} />
          <button style={styles.secondaryBtn} onClick={() => teacherFileRef.current.click()} disabled={teacherUploadBusy}>{teacherUploadBusy ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} 엑셀 업로드</button>
        </div>
        {!teachers.length && <div style={{ fontSize: 12, color: "#a39d8c", marginBottom: 8 }}>등록된 선생님 계정이 없습니다.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {teachers.map((teacher, index) => {
            const role = normalizedTeacherRole(teacher);
            const roleGrade = teacherRoleGrade(teacher);
            const roleScopeKey = `${roleGrade}-${semester}`;
            const classOptions = extractClasses(db, roleScopeKey);
            const automatic = role === "homeroom" || role === "gradeHead";
            return (
              <div key={teacher.id || index} style={accountConsole.teacherCard}>
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
                <div style={{ fontSize: 12.5, color: cat.text, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{n.text}</div>
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
  .spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
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
  teacherCard: { border: `1px solid ${COLORS.line}`, borderRadius: 11, padding: 13, background: "linear-gradient(180deg, #fbfaf6 0%, #fff 100%)" },
  identityRow: { display: "flex", alignItems: "center", gap: 7, marginBottom: 9 },
  credentials: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 },
  field: { display: "grid", gap: 4, fontSize: 10.2, color: "#746d61", fontWeight: 800 },
  input: { width: "100%", boxSizing: "border-box", border: `1px solid ${COLORS.line}`, borderRadius: 7, padding: "8px 9px", background: "#fff", color: "#2b2620", fontSize: 12, outline: "none" },
  empty: { padding: "12px", border: `1px dashed ${COLORS.line}`, borderRadius: 9, color: "#9a9385", fontSize: 11.5, textAlign: "center" },
};

const styles = {
  app: { minHeight: "100vh", background: COLORS.paper, color: COLORS.ink, fontFamily: "'Pretendard','Apple SD Gothic Neo',sans-serif" },
  loadingScreen: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 13.5, color: "#8a8578" },
  loginBox: { textAlign: "center", padding: "36px 20px", background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 12, maxWidth: 320, margin: "20px auto", display: "flex", flexDirection: "column", alignItems: "center" },
  sectionCard: { width: 180, padding: "28px 16px", background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 14, cursor: "pointer", textAlign: "center" },
  loginInput: { width: "100%", border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 8 },
  topbar: { background: "#fff", borderBottom: `1px solid ${COLORS.line}` },
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
  adminScopePanel: { display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", padding: "12px 14px", margin: "12px 0 14px", border: `1px solid ${COLORS.line}`, borderRadius: 12, background: "#fbfaf6" },
  adminScopeCaption: { marginLeft: "auto", fontSize: 11.5, color: "#6f695d", fontWeight: 850, whiteSpace: "nowrap" },
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
  issueList: { marginTop: 10, display: "flex", flexDirection: "column", gap: 4, maxHeight: 400, overflowY: "auto" },
  issueRow: { display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "7px 10px", fontSize: 12, flexWrap: "wrap" },
  issueBadge: { background: "#f3f1e9", padding: "2px 8px", borderRadius: 6, fontSize: 10.5, fontWeight: 700, color: "#8a8578" },
  toast: { position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "10px 18px", borderRadius: 8, fontSize: 13, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", zIndex: 50 },
};
