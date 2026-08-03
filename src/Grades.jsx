import React, { useState, useEffect, useMemo, useRef } from "react";
import { Search, Upload, FileSpreadsheet, Loader2, Save, X, ArrowRight, Users } from "lucide-react";
import { readStorage, writeStorage } from "./storage.js";
import {
  parseSemesterSheet,
  computeAllGroupAverages,
  computeMockExamSums,
  matchUniversities,
  gradeAnalysisComment,
} from "./gradeEngine.js";

const SEMESTER_KEYS = ["1-1", "1-2", "2-1", "2-2"];
const SEMESTER_LABELS = { "1-1": "1학년 1학기", "1-2": "1학년 2학기", "2-1": "2학년 1학기", "2-2": "2학년 2학기" };
const MOCK_MONTH_KEYS = ["1-3", "1-6", "1-9", "1-10", "2-3", "2-6", "2-9", "3-3", "3-6", "3-9"];
const MOCK_MONTH_LABELS = {
  "1-3": "1학년 3월", "1-6": "1학년 6월", "1-9": "1학년 9월", "1-10": "1학년 10월",
  "2-3": "2학년 3월", "2-6": "2학년 6월", "2-9": "2학년 9월",
  "3-3": "3학년 3월", "3-6": "3학년 6월", "3-9": "3학년 9월",
};
const MOCK_SUBJECTS = ["국어", "수학", "영어", "한국사", "통합사회", "통합과학"];

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

        {tab === "grades" && loggedInStudent && <StudentGradeReport sid={loggedInStudent.id} gdb={gdb} mode="grades" />}
        {tab === "admission" && loggedInStudent && <StudentGradeReport sid={loggedInStudent.id} gdb={gdb} mode="admission" />}
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
function StudentGradeReport({ sid, gdb, mode = "both" }) {
  const { semesterData, mockData, admissionRows } = gdb;

  const subjectLists = SEMESTER_KEYS.map(k => {
    const sem = semesterData[k];
    if (!sem || !sem.students || !sem.students[sid]) return null;
    return sem.students[sid].subjects;
  });
  const hasAnyGrades = subjectLists.some(l => l);

  const groups = useMemo(() => computeAllGroupAverages(subjectLists), [semesterData, sid]); // eslint-disable-line

  // 학기별 상세 성적표에서 선택된 학기 (데이터가 있는 가장 최근 학기가 기본값)
  const availableSemesters = SEMESTER_KEYS.filter((k, i) => subjectLists[i]);
  const [selSemKey, setSelSemKey] = useState(null);
  const activeSemKey = selSemKey && availableSemesters.includes(selSemKey) ? selSemKey : availableSemesters[availableSemesters.length - 1];
  const activeSemSubjects = activeSemKey ? subjectLists[SEMESTER_KEYS.indexOf(activeSemKey)] : null;

  // 모의고사 회차 선택 (데이터가 있는 가장 최근 회차가 기본값)
  const availableMockKeys = MOCK_MONTH_KEYS.filter(k => mockData[k] && mockData[k].students && mockData[k].students[sid]);
  const [selMockKey, setSelMockKey] = useState(null);
  const activeMockKey = selMockKey && availableMockKeys.includes(selMockKey) ? selMockKey : availableMockKeys[availableMockKeys.length - 1];
  const mockGrades = activeMockKey ? mockData[activeMockKey].students[sid] : {};
  const sums = useMemo(() => computeMockExamSums(mockGrades || {}), [mockGrades]);

  // 대입전형 판정은 항상 가장 최신 모의고사를 기준으로 합니다.
  const latestMockKey = useMemo(() => {
    const order = MOCK_MONTH_KEYS.slice().reverse();
    return order.find(k => mockData[k] && mockData[k].students && mockData[k].students[sid]) || null;
  }, [mockData, sid]);
  const latestMockGrades = latestMockKey ? mockData[latestMockKey].students[sid] : {};
  const latestSums = useMemo(() => computeMockExamSums(latestMockGrades || {}), [latestMockGrades]);

  const overallAvg5 = groups["전과목"] ? groups["전과목"].avg5 : null;
  const matchedUniversities = useMemo(() => matchUniversities(latestSums, admissionRows || []), [latestSums, admissionRows]);
  const comment = gradeAnalysisComment(overallAvg5, latestSums.sum2, latestSums.sum3, latestSums.sum4);

  if (!hasAnyGrades) {
    return <EmptyBox text="아직 등록된 성적 데이터가 없습니다. 관리자가 원본 데이터를 업로드하면 여기에 표시됩니다." />;
  }

  const showGrades = mode === "grades" || mode === "both";
  const showAdmission = mode === "admission" || mode === "both";

  return (
    <div>
      {showGrades && (
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>계열별 평균 등급 (학점 가중평균)</div>
        <table style={table.base}>
          <thead>
            <tr>
              <th style={table.th}>구분</th>
              {SEMESTER_KEYS.map(k => <th key={k} style={table.th}>{SEMESTER_LABELS[k]}</th>)}
              <th style={table.th}>전체 평균</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(groups).map(([name, g]) => (
              <tr key={name}>
                <td style={table.tdLabel}>{name}</td>
                {g.perSemester5.map((v, i) => <td key={i} style={table.td}>{v ?? "-"}</td>)}
                <td style={{ ...table.td, fontWeight: 700 }}>{g.avg5 ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {showGrades && (
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>내신 성적 학기별 확인하기</div>
        {!availableSemesters.length ? <div style={{ fontSize: 12.5, color: "#a39d8c" }}>등록된 내신 성적이 없습니다.</div> : (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {availableSemesters.map(k => <button key={k} onClick={() => setSelSemKey(k)} style={{ ...btn.chip, ...(activeSemKey === k ? btn.chipActive : {}) }}>{SEMESTER_LABELS[k]}</button>)}
            </div>
            <table style={table.base}>
              <thead><tr><th style={table.th}>과목</th><th style={table.th}>학점</th><th style={table.th}>원점수</th><th style={table.th}>성취도</th><th style={table.th}>석차등급</th><th style={table.th}>석차</th><th style={table.th}>수강자수</th></tr></thead>
              <tbody>
                {(activeSemSubjects || []).map((s, i) => (
                  <tr key={i}><td style={table.tdLabel}>{s.subject}</td><td style={table.td}>{s.credit}</td><td style={table.td}>{s.score ?? "-"}</td><td style={table.td}>{s.achievement ?? "-"}</td><td style={table.td}>{s.grade5 ?? "-"}</td><td style={table.td}>{s.rank ?? "-"}</td><td style={table.td}>{s.classSize ?? "-"}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
      )}

      {showGrades && (
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>모의고사 성적 회차별 확인하기</div>
        {!availableMockKeys.length ? <div style={{ fontSize: 12.5, color: "#a39d8c" }}>등록된 모의고사 성적이 없습니다.</div> : (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {availableMockKeys.map(k => <button key={k} onClick={() => setSelMockKey(k)} style={{ ...btn.chip, ...(activeMockKey === k ? btn.chipActive : {}) }}>{MOCK_MONTH_LABELS[k]}</button>)}
            </div>
            <table style={table.base}>
              <thead><tr>{MOCK_SUBJECTS.map(s => <th key={s} style={table.th}>{s}</th>)}</tr></thead>
              <tbody><tr>{MOCK_SUBJECTS.map(s => <td key={s} style={table.td}>{mockGrades[s] ?? "-"}</td>)}</tr></tbody>
            </table>
            <div style={{ display: "flex", gap: 20, marginTop: 12, fontSize: 13 }}>
              <div><b>2합</b> {sums.sum2 ?? "-"}</div>
              <div><b>3합</b> {sums.sum3 ?? "-"}</div>
              <div><b>4합</b> {sums.sum4 ?? "-"}</div>
            </div>
          </>
        )}
      </div>
      )}

      {showAdmission && (
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>수능 최저 도달 대학 (교과전형 기준)</div>
        <div style={{ fontSize: 13, color: matchedUniversities.length ? "#3d5c3a" : "#8a8578" }}>
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
      {sid && <div style={{ marginTop: 16 }}><StudentGradeReport sid={sid} gdb={gdb} /></div>}
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
          "1-1 성적", "1-2 성적", "2-1 성적", "2-2 성적"과 "N학년 N월"(모의고사), "2028 대입 전형" 시트가 들어있는 원본 파일을 그대로 올려주세요.
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

/* ---------- 스타일 (기존 시간표 앱 스타일과 어울리게 최소 구성) ---------- */
const card = { background: "#fff", border: "1px solid #e6e1d3", borderRadius: 12, padding: 18, marginBottom: 14 };
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
  base: { width: "100%", borderCollapse: "collapse", fontSize: 12.5 },
  th: { border: "1px solid #e6e1d3", padding: "6px 8px", background: "#f6f4ee", fontWeight: 700, fontSize: 11.5 },
  td: { border: "1px solid #e6e1d3", padding: "6px 8px", textAlign: "center" },
  tdLabel: { border: "1px solid #e6e1d3", padding: "6px 8px", fontWeight: 700, background: "#fbfaf6" },
};
const searchBox = {
  box: { display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #e6e1d3", borderRadius: 10, padding: "9px 13px", maxWidth: 420 },
  input: { border: "none", outline: "none", flex: 1, fontSize: 13.5, background: "transparent" },
  list: { marginTop: 8, maxWidth: 420, background: "#fff", border: "1px solid #e6e1d3", borderRadius: 10, overflow: "hidden" },
  item: { display: "flex", flexDirection: "column", alignItems: "flex-start", width: "100%", textAlign: "left", padding: "9px 13px", border: "none", background: "transparent", cursor: "pointer", borderBottom: "1px solid #e6e1d3", fontSize: 13, gap: 2 },
};
