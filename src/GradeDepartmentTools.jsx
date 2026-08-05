import React, { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  Upload, Search, Phone, MessageSquareText, Copy, ExternalLink, UsersRound,
  BookOpenCheck, ClipboardCheck, CalendarDays, Link2, FileSpreadsheet, Check,
  AlertTriangle, X, UserRound, GraduationCap, ListChecks,
} from "lucide-react";

const FONT = '"Pretendard","SUIT","Noto Sans KR","Malgun Gothic",sans-serif';
const IAM_TEACHER_URL = "https://id.iamservice.net/login";

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
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

function cellLink(workbook, sheetName, rowIndex, colIndex) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return "";
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
  return cleanText(sheet[address]?.l?.Target || "");
}

function findHeaderRow(rows, required) {
  return rows.findIndex(row => required.every(label => row.some(cell => cleanText(cell).includes(label))));
}

function columnIndex(header, candidates) {
  return header.findIndex(cell => candidates.some(candidate => cleanText(cell).replace(/\s/g, "").includes(candidate.replace(/\s/g, ""))));
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
  const studentPhoneIndex = columnIndex(header, ["휴대폰(학생)", "학생휴대폰", "학생전화"]);
  const guardianPhoneIndex = columnIndex(header, ["휴대폰(학부모)", "학부모휴대폰", "보호자휴대폰", "보호자전화"]);
  const noteIndex = columnIndex(header, ["비고(특이사항)", "특이사항", "비고"]);
  const seen = new Set();
  return rows.slice(headerIndex + 1).map(row => {
    const sid = cleanText(row[sidIndex]);
    const name = cleanText(row[nameIndex]);
    if (!/^2\d{4}$/.test(sid) || !name || seen.has(sid)) return null;
    seen.add(sid);
    return {
      sid,
      name,
      classNumber: Number(sid.slice(1, 3)) || Number(row[0]) || null,
      number: Number(sid.slice(3, 5)) || null,
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
  const hoursIndex = columnIndex(header, ["이수시간"]);
  const cumulativeIndex = header.findIndex(cell => cleanText(cell).includes("누계"));
  const formIndex = columnIndex(header, ["구글 폼 링크", "학급 공유용"]);
  const responseIndex = columnIndex(header, ["구글 답변 링크", "선생님 확인용"]);
  const templateIndexes = header.map((cell, index) => /특기 사항|특기사항/.test(cleanText(cell)) ? index : -1).filter(index => index >= 0);
  return rows.slice(headerIndex + 1).map((row, offset) => {
    const rowIndex = headerIndex + 1 + offset;
    const record = cleanText(row[recordIndex]);
    if (!record) return null;
    return {
      id: `${category}-${rowIndex}`,
      category,
      date: cleanText(row[dateIndex]),
      period: cleanText(row[periodIndex]),
      record,
      hours: cleanText(row[hoursIndex]),
      cumulative: cleanText(row[cumulativeIndex]),
      formUrl: formIndex >= 0 ? cellLink(workbook, sheetName, rowIndex, formIndex) : "",
      responseUrl: responseIndex >= 0 ? cellLink(workbook, sheetName, rowIndex, responseIndex) : "",
      templates: templateIndexes.map(index => cleanText(row[index])).filter(Boolean),
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
  const templateIndex = columnIndex(header, ["진로 특기 사항", "진로특기사항"]);
  const hoursIndex = columnIndex(header, ["이수시간"]);
  const cumulativeIndex = header.findIndex(cell => cleanText(cell).includes("누계"));
  return rows.slice(headerIndex + 1).map((row, offset) => {
    const record = cleanText(row[recordIndex]);
    const template = cleanText(row[templateIndex]);
    if (!record && !template) return null;
    return {
      id: `진로수업-${headerIndex + 1 + offset}`,
      category: "진로 수업",
      date: cleanText(row[lessonIndex]),
      period: "",
      record,
      hours: cleanText(row[hoursIndex]),
      cumulative: cleanText(row[cumulativeIndex]),
      formUrl: "",
      responseUrl: "",
      templates: template ? [template] : [],
    };
  }).filter(Boolean);
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
  const clubTeacherIndex = clubIndex >= 0 ? clubIndex + 1 : -1;
  const serviceIndex = header.findIndex((cell, index) => index < 10 && cleanText(cell).includes("프로젝트 봉사활동"));
  const serviceTeacherIndex = serviceIndex >= 0 ? serviceIndex + 1 : -1;
  const studentProjectIndex = header.findIndex((cell, index) => index < 10 && cleanText(cell).includes("학생주도 프로젝트"));
  const studentProjectTeacherIndex = studentProjectIndex >= 0 ? studentProjectIndex + 1 : -1;
  return rows.slice(headerIndex + 1).map(row => {
    const sid = cleanText(row[sidIndex]);
    if (!/^2\d{4}$/.test(sid)) return null;
    return {
      sid,
      name: cleanText(row[nameIndex]),
      classNumber: Number(row[classIndex]) || Number(sid.slice(1, 3)) || null,
      number: Number(sid.slice(3, 5)) || null,
      club: cleanText(row[clubIndex]),
      clubTeacher: cleanText(row[clubTeacherIndex]),
      service: cleanText(row[serviceIndex]),
      serviceTeacher: cleanText(row[serviceTeacherIndex]),
      studentProject: cleanText(row[studentProjectIndex]),
      studentProjectTeacher: cleanText(row[studentProjectTeacherIndex]),
    };
  }).filter(Boolean);
}

function parseGradeDepartmentWorkbook(arrayBuffer, fileName) {
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: false });
  const contacts = parseContacts(workbook);
  const activities = [
    ...parseActivitySheet(workbook, "생기부(자율)", "자율/자치"),
    ...parseActivitySheet(workbook, "생기부(진로-활동)", "진로 활동"),
    ...parseCareerLessons(workbook),
  ];
  const assignments = parseAssignments(workbook);
  const checklistSheet = workbook.SheetNames.find(name => cleanText(name) === "생기부 점검");
  const checklistRows = checklistSheet ? workbookRows(workbook, checklistSheet) : [];
  const checklistTitle = cleanText(checklistRows?.[0]?.[0]);
  return {
    contacts,
    records: {
      activities,
      assignments,
      checklistAvailable: /2학년/.test(checklistTitle),
      checklistTitle,
    },
    sourceName: fileName,
    importedAt: new Date().toISOString(),
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

function ImportBar({ data, canImport, onImport, importing, fileRef }) {
  return <div className="gdt-import-bar">
    <div><b>2학년부 엑셀 연동</b><span>{data?.sourceName ? `${data.sourceName} · ${new Date(data.importedAt).toLocaleString("ko-KR")}` : "2학년 명렬과 생기부 업무 시트를 한 번에 불러옵니다."}</span></div>
    {canImport && <><input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={onImport}/><button type="button" onClick={()=>fileRef.current?.click()} disabled={importing}><Upload size={15}/>{importing ? "불러오는 중" : data ? "자료 다시 불러오기" : "엑셀 불러오기"}</button></>}
  </div>;
}

function ContactWorkspace({ data, actor, accessRole, homeroomClass, showToast }) {
  const contacts = data?.contacts || [];
  const canViewAll = ["admin", "department", "gradeHead"].includes(accessRole);
  const lockedClass = !canViewAll ? String(homeroomClass || "") : "";
  const [classFilter, setClassFilter] = useState(lockedClass || "전체");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
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
  if (!canViewAll && !lockedClass) return <EmptyState title="담임 학급이 지정되지 않았습니다." description="내 정보 수정 또는 관리자 계정관리에서 담당 학급을 먼저 지정해주세요."/>;
  return <div className="gdt-contact-workspace">
    <div className="gdt-toolbar">
      <div className="gdt-search"><Search size={16}/><span>학생 검색</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="학번·이름·전화번호"/></div>
      {canViewAll && <select value={classFilter} onChange={event=>{setClassFilter(event.target.value);setSelected([])}}><option value="전체">전체 학급</option>{classes.map(value=><option key={value} value={value}>{value}반</option>)}</select>}
      <button type="button" className="gdt-secondary" onClick={()=>setSelected(filtered.map(item=>item.sid))}><Check size={14}/>조회 학생 전체 선택</button>
      <button type="button" className="gdt-secondary" onClick={()=>setSelected([])}><X size={14}/>선택 해제</button>
    </div>
    <div className="gdt-contact-actions"><span><b>{filtered.length}명</b> 조회 · <b>{selected.length}명</b> 선택</span><div><button type="button" onClick={copySelectedGuardians}><Copy size={14}/>보호자 번호 복사</button><a href={IAM_TEACHER_URL} target="_blank" rel="noreferrer"><ExternalLink size={14}/>아이엠티처 열기</a></div></div>
    <div className="gdt-table-wrap"><table className="gdt-table"><thead><tr><th>선택</th><th>반·번호</th><th>성명</th><th>학생 연락처</th><th>보호자 연락처</th><th>비고</th><th>바로 실행</th></tr></thead><tbody>{filtered.map(item=><tr key={item.sid}><td><input type="checkbox" checked={selected.includes(item.sid)} onChange={()=>toggle(item.sid)}/></td><td><b>{item.classNumber}반 {item.number}번</b><small>{item.sid}</small></td><td><strong>{item.name}</strong></td><td>{item.studentPhone ? formatPhone(item.studentPhone) : <span className="gdt-muted">미등록</span>}</td><td>{item.guardianPhone ? formatPhone(item.guardianPhone) : <span className="gdt-muted">미등록</span>}</td><td className="gdt-note">{item.note || "-"}</td><td><div className="gdt-row-actions">{item.guardianPhone && <><a href={`tel:${item.guardianPhone}`} title="보호자에게 전화"><Phone size={14}/></a><a href={`sms:${item.guardianPhone}`} title="보호자 문자 앱 열기"><MessageSquareText size={14}/></a><button type="button" onClick={async()=>{await copyText(formatPhone(item.guardianPhone));showToast("보호자 연락처를 복사했습니다.","success")}} title="보호자 번호 복사"><Copy size={14}/></button></>}</div></td></tr>)}</tbody></table></div>
    <div className="gdt-info"><AlertTriangle size={15}/><span><b>문자 앱 열기</b>는 휴대전화·문자 연결 프로그램이 있는 기기에서 작동합니다. 홈페이지에서 문자를 자동 발송하려면 아이엠티처 또는 별도 SMS 업체의 API와 서버 연동이 필요합니다.</span></div>
  </div>;
}

function RecordsWorkspace({ data, showToast }) {
  const activities = data?.records?.activities || [];
  const assignments = data?.records?.assignments || [];
  const [tab, setTab] = useState("activities");
  const [category, setCategory] = useState("전체");
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("전체");
  const categories = useMemo(()=>Array.from(new Set(activities.map(item=>item.category))),[activities]);
  const classes = useMemo(()=>Array.from(new Set(assignments.map(item=>String(item.classNumber)).filter(Boolean))).sort((a,b)=>Number(a)-Number(b)),[assignments]);
  const filteredActivities = activities.filter(item=>category==="전체"||item.category===category);
  const filteredAssignments = assignments.filter(item=>(classFilter==="전체"||String(item.classNumber)===classFilter)&&(!query.trim()||item.sid.includes(query.trim())||item.name.includes(query.trim())));
  return <div className="gdt-records-workspace">
    <div className="gdt-record-metrics"><div><CalendarDays/><span>활동 일정</span><b>{activities.length}건</b></div><div><UsersRound/><span>학생별 배정</span><b>{assignments.length}명</b></div><div><ClipboardCheck/><span>2학년 점검표</span><b>{data?.records?.checklistAvailable ? "연동" : "미연동"}</b></div></div>
    <div className="gdt-subtabs"><button type="button" className={tab==="activities"?"active":""} onClick={()=>setTab("activities")}><CalendarDays size={15}/>활동·문장 자료</button><button type="button" className={tab==="assignments"?"active":""} onClick={()=>setTab("assignments")}><GraduationCap size={15}/>학생별 활동 배정</button><button type="button" className={tab==="guide"?"active":""} onClick={()=>setTab("guide")}><ListChecks size={15}/>활용 안내</button></div>
    {tab === "activities" && <><div className="gdt-toolbar"><select value={category} onChange={event=>setCategory(event.target.value)}><option value="전체">전체 영역</option>{categories.map(value=><option key={value}>{value}</option>)}</select></div><div className="gdt-activity-list">{filteredActivities.map(item=><article key={item.id}><header><span>{item.category}</span><b>{item.record}</b><small>{[item.date,item.period&&`${item.period}교시`,item.hours&&`${item.hours}시간`,item.cumulative&&`누계 ${item.cumulative}`].filter(Boolean).join(" · ")}</small></header><div className="gdt-activity-actions">{item.formUrl&&<a href={item.formUrl} target="_blank" rel="noreferrer"><Link2 size={13}/>학생용 폼</a>}{item.responseUrl&&<a href={item.responseUrl} target="_blank" rel="noreferrer"><Link2 size={13}/>응답 확인</a>}</div>{item.templates.length>0&&<div className="gdt-template-list">{item.templates.map((text,index)=><button key={index} type="button" onClick={async()=>{await copyText(text);showToast("특기사항 문장을 복사했습니다.","success")}}><Copy size={13}/><span>{text}</span></button>)}</div>}</article>)}</div></>}
    {tab === "assignments" && <><div className="gdt-toolbar"><div className="gdt-search"><Search size={16}/><span>학생 검색</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="학번 또는 이름"/></div><select value={classFilter} onChange={event=>setClassFilter(event.target.value)}><option value="전체">전체 학급</option>{classes.map(value=><option key={value} value={value}>{value}반</option>)}</select></div><div className="gdt-table-wrap"><table className="gdt-table assignments"><thead><tr><th>학생</th><th>동아리</th><th>프로젝트 봉사활동</th><th>학생주도 프로젝트</th></tr></thead><tbody>{filteredAssignments.map(item=><tr key={item.sid}><td><b>{item.name}</b><small>{item.classNumber}반 {item.number}번 · {item.sid}</small></td><td><strong>{item.club||"-"}</strong><small>{item.clubTeacher||""}</small></td><td><strong>{item.service||"-"}</strong><small>{item.serviceTeacher||""}</small></td><td><strong>{item.studentProject||"-"}</strong><small>{item.studentProjectTeacher||""}</small></td></tr>)}</tbody></table></div></>}
    {tab === "guide" && <div className="gdt-guide-grid"><article><BookOpenCheck/><b>활동 일정 통합</b><p>자율/자치·진로 활동·진로 수업의 날짜, 누가기록, 이수시간을 한 화면에서 확인합니다.</p></article><article><Copy/><b>특기사항 문장 복사</b><p>엑셀에 등록된 특기사항 문장 서두와 예시 문장을 바로 복사해 NEIS 작성에 활용합니다.</p></article><article><UsersRound/><b>학생별 배정 확인</b><p>학생의 동아리·프로젝트 봉사·학생주도 프로젝트와 담당 교사를 학급별로 검색합니다.</p></article><article><ClipboardCheck/><b>점검 기능 확장</b><p>현재 파일의 2학년 점검표가 연동되면 반별 완료 현황을 표시할 수 있습니다. 현재 파일에는 2학년 점검표가 없어 미연동으로 표시됩니다.</p></article></div>}
  </div>;
}

export default function GradeDepartmentTools({ view, db, persist, showToast, actor, accessRole, homeroomClass }) {
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);
  const data = db?.gradeDepartmentData?.["2"] || null;
  const canImport = ["admin", "department", "gradeHead"].includes(accessRole);
  const onImport = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const parsed = parseGradeDepartmentWorkbook(await file.arrayBuffer(), file.name);
      if (!parsed.contacts.length) throw new Error("'2학년명렬' 시트에서 학생 연락처를 찾지 못했습니다.");
      parsed.updatedBy = actor?.name || actor?.id || "관리자";
      const next = { ...(db.gradeDepartmentData || {}), "2": parsed };
      const ok = await persist({ gradeDepartmentData: next });
      if (ok) showToast(`2학년부 자료를 불러왔습니다. 연락처 ${parsed.contacts.length}명 · 생기부 활동 ${parsed.records.activities.length}건`, "success");
    } catch (error) {
      showToast(`엑셀을 불러오지 못했습니다. ${error.message}`, "error");
    } finally {
      setImporting(false);
    }
  };
  return <section className="grade-department-tools">
    <style>{GRADE_DEPARTMENT_CSS}</style>
    <ImportBar data={data} canImport={canImport} onImport={onImport} importing={importing} fileRef={fileRef}/>
    {!data ? <EmptyState title="2학년부 자료가 아직 연동되지 않았습니다." description={canImport ? "첨부하신 '2026 광덕고 2학년부.xlsx' 형식의 파일을 불러오면 연락처와 생기부 업무 자료를 사용할 수 있습니다." : "학년부장 또는 관리자가 2학년부 엑셀을 먼저 불러와야 합니다."}/> : view === "contacts" ? <ContactWorkspace data={data} actor={actor} accessRole={accessRole} homeroomClass={homeroomClass} showToast={showToast}/> : <RecordsWorkspace data={data} showToast={showToast}/>} 
  </section>;
}

const GRADE_DEPARTMENT_CSS = `
.grade-department-tools{font-family:${FONT};color:#273b55;display:grid;gap:14px}.grade-department-tools *{box-sizing:border-box}.gdt-import-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;border:1px solid #d8e2ed;border-radius:14px;background:linear-gradient(135deg,#f8fbff,#f7faf8)}.gdt-import-bar>div{display:grid;gap:4px;min-width:0}.gdt-import-bar b{font-size:13px}.gdt-import-bar span{font-size:10.5px;color:#76859a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gdt-import-bar button,.gdt-contact-actions button,.gdt-contact-actions a,.gdt-secondary{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid #bfcfe1;border-radius:9px;padding:8px 10px;background:#fff;color:#35628f;font:800 11px ${FONT};text-decoration:none;cursor:pointer;white-space:nowrap}.gdt-import-bar button{background:#3568a3;color:#fff;border-color:#3568a3}.gdt-empty{min-height:280px;display:grid;place-items:center;align-content:center;gap:8px;border:1px dashed #cbd8e6;border-radius:16px;background:#fafcff;color:#7b899b;text-align:center;padding:24px}.gdt-empty b{font-size:14px;color:#52657c}.gdt-empty span{font-size:11px;line-height:1.55;max-width:600px}.gdt-toolbar{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.gdt-search{flex:1 1 330px;min-width:240px;display:grid;grid-template-columns:auto auto minmax(0,1fr);align-items:center;gap:8px;border:1px solid #ccd8e6;border-radius:11px;background:#fff;padding:5px 7px 5px 10px}.gdt-search>span{font-size:10.5px;font-weight:900;color:#60738a;padding-right:8px;border-right:1px solid #e2e8ef}.gdt-search input{min-width:0;border:0;outline:0;padding:6px 8px;font:750 11px ${FONT};color:#2c4058}.gdt-toolbar select{min-height:39px;border:1px solid #ccd8e6;border-radius:10px;background:#fff;padding:7px 30px 7px 10px;color:#435970;font:850 11px ${FONT}}.gdt-contact-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:11px;background:#f3f7fb;color:#6b7b8e;font-size:11px}.gdt-contact-actions>div{display:flex;gap:7px;flex-wrap:wrap}.gdt-table-wrap{overflow:auto;border:1px solid #d6e0eb;border-radius:13px;background:#fff}.gdt-table{width:100%;min-width:880px;border-collapse:separate;border-spacing:0;table-layout:fixed}.gdt-table th{position:sticky;top:0;z-index:1;background:#edf4fb;color:#435b74;padding:10px 8px;border-right:1px solid #d6e0ea;border-bottom:1px solid #c8d6e5;font-size:10px;font-weight:950;text-align:center}.gdt-table td{padding:9px 8px;border-right:1px solid #e0e7ef;border-bottom:1px solid #e0e7ef;font-size:10.5px;text-align:center;vertical-align:middle}.gdt-table tr:last-child td{border-bottom:0}.gdt-table th:last-child,.gdt-table td:last-child{border-right:0}.gdt-table th:nth-child(1){width:46px}.gdt-table th:nth-child(2){width:92px}.gdt-table th:nth-child(3){width:88px}.gdt-table th:nth-child(4),.gdt-table th:nth-child(5){width:132px}.gdt-table th:nth-child(6){width:auto}.gdt-table th:nth-child(7){width:112px}.gdt-table td small,.gdt-table.assignments td small{display:block;margin-top:3px;color:#8190a2;font-size:9px;line-height:1.35}.gdt-table .gdt-note{text-align:left;white-space:normal;word-break:keep-all;line-height:1.45}.gdt-muted{color:#9aa5b2}.gdt-row-actions{display:flex;align-items:center;justify-content:center;gap:5px}.gdt-row-actions a,.gdt-row-actions button{display:grid;place-items:center;width:29px;height:29px;border:1px solid #cdd9e6;border-radius:8px;background:#fff;color:#356493;cursor:pointer}.gdt-info{display:flex;align-items:flex-start;gap:8px;padding:11px 12px;border-radius:11px;background:#fff8e9;border:1px solid #edd9ad;color:#7b6331;font-size:10.5px;line-height:1.5}.gdt-record-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.gdt-record-metrics>div{display:grid;grid-template-columns:auto 1fr;gap:3px 8px;align-items:center;padding:12px;border:1px solid #d9e2ec;border-radius:12px;background:#fff}.gdt-record-metrics svg{grid-row:1/3;color:#47739d}.gdt-record-metrics span{font-size:10px;color:#75869a;font-weight:850}.gdt-record-metrics b{font-size:18px}.gdt-subtabs{display:flex;gap:7px;flex-wrap:wrap}.gdt-subtabs button{display:inline-flex;align-items:center;gap:6px;border:1px solid #d1dce8;border-radius:9px;padding:8px 11px;background:#fff;color:#68778a;font:850 11px ${FONT};cursor:pointer}.gdt-subtabs button.active{background:#3d6998;color:#fff;border-color:#3d6998}.gdt-activity-list{display:grid;gap:9px}.gdt-activity-list article{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:9px 12px;padding:12px 13px;border:1px solid #d9e2ec;border-radius:12px;background:#fff}.gdt-activity-list header{display:grid;grid-template-columns:auto minmax(0,1fr);gap:3px 8px;align-items:center;min-width:0}.gdt-activity-list header>span{padding:4px 7px;border-radius:999px;background:#edf4fb;color:#35628f;font-size:9px;font-weight:900}.gdt-activity-list header>b{font-size:12px;min-width:0}.gdt-activity-list header>small{grid-column:2;color:#7c8999;font-size:9.5px}.gdt-activity-actions{display:flex;gap:6px;align-items:flex-start}.gdt-activity-actions a{display:inline-flex;align-items:center;gap:4px;padding:6px 8px;border:1px solid #d1dce8;border-radius:8px;color:#426991;text-decoration:none;font-size:9.5px;font-weight:850;white-space:nowrap}.gdt-template-list{grid-column:1/-1;display:grid;gap:6px}.gdt-template-list button{display:flex;align-items:flex-start;gap:7px;width:100%;border:1px solid #e1e6ec;border-radius:9px;padding:8px 9px;background:#fafbfd;color:#596a7e;text-align:left;font:750 10px/1.5 ${FONT};cursor:pointer}.gdt-table.assignments{min-width:920px}.gdt-table.assignments th:first-child{width:135px}.gdt-table.assignments td{text-align:left;line-height:1.45}.gdt-guide-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.gdt-guide-grid article{display:grid;grid-template-columns:auto 1fr;gap:5px 9px;padding:14px;border:1px solid #d9e2ec;border-radius:12px;background:#fff}.gdt-guide-grid svg{grid-row:1/3;color:#48739f}.gdt-guide-grid b{font-size:12px}.gdt-guide-grid p{margin:0;color:#738297;font-size:10.5px;line-height:1.55}.gdt-contact-workspace,.gdt-records-workspace{display:grid;gap:12px}@media(max-width:760px){.gdt-import-bar,.gdt-contact-actions{align-items:stretch;flex-direction:column}.gdt-contact-actions>div{display:grid;grid-template-columns:1fr 1fr}.gdt-record-metrics,.gdt-guide-grid{grid-template-columns:1fr}.gdt-activity-list article{grid-template-columns:1fr}.gdt-activity-actions{grid-row:2}.gdt-activity-list header{grid-template-columns:1fr}.gdt-activity-list header>small{grid-column:1}}
`;
