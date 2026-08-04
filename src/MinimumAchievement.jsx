import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpenCheck,
  Check,
  ChevronDown,
  ChevronUp,
  ListChecks,
  Printer,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";

const FONT='"Pretendard","SUIT","Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
const round=(value,digits=1)=>{const n=Number(value);if(!Number.isFinite(n))return null;const f=10**digits;return Math.round((n+Number.EPSILON)*f)/f};
const num=value=>{if(value==null||value==="")return null;const n=Number(value);return Number.isFinite(n)?n:null};
const txt=value=>String(value??"").trim();
const courseLabel=type=>type==="elective"?"선택과목":"공통과목";
const plannedWritten=workspace=>Array.isArray(workspace?.settings?.plannedWritten)?workspace.settings.plannedWritten:[];
const workspaceWeight=workspace=>{
  const written=(workspace?.written||[]).reduce((sum,item)=>sum+(num(item.weight)||0),0);
  const planned=plannedWritten(workspace).reduce((sum,item)=>sum+(num(item.weight)||0),0);
  const areas=(workspace?.performance?.[0]?.areas||[]).reduce((sum,item)=>sum+(num(item.weight)||0),0);
  return round(written+planned+areas,2)||0;
};
function minimumSettings(workspace,stored={}){
  const embedded=workspace?.settings?.minimumAchievement||{};
  const planned=plannedWritten(workspace)[0];
  const configured=workspaceWeight(workspace);
  return {
    nextExamLabel:stored.nextExamLabel||embedded.nextExamLabel||planned?.title||"다음 정기시험",
    nextExamWeight:num(stored.nextExamWeight)??num(embedded.nextExamWeight)??num(planned?.weight)??Math.max(0,round(100-configured,2)||0),
    nextExamMax:num(stored.nextExamMax)??num(embedded.nextExamMax)??num(planned?.maxScore)??100,
  };
}
function compactMissing(missing=[]){
  const written=missing.filter(value=>/정기|지필|고사|시험/.test(value));
  const performance=missing.filter(value=>!written.includes(value));
  return [...written.slice(0,2),...(written.length>2?[`지필 ${written.length-2}건 추가`]:[]),...(performance.length?[`수행 ${performance.length}개 미입력`]:[])];
}
function analyzeWorkspace(workspace,roster={},storedSettings={},attendance={}){
  const settings=minimumSettings(workspace,storedSettings);
  const courseType=workspace?.settings?.courseType||"common";
  const written=workspace?.written||[];
  const planned=plannedWritten(workspace);
  const performance=workspace?.performance||[];
  const areas=performance[0]?.areas||[];
  const perfMap={};
  performance.forEach(file=>Object.entries(file.students||{}).forEach(([sid,student])=>{perfMap[sid]=student}));
  const ids=new Set();
  written.forEach(item=>Object.keys(item.students||{}).forEach(sid=>ids.add(sid)));
  performance.forEach(item=>Object.keys(item.students||{}).forEach(sid=>ids.add(sid)));
  const configuredWeight=workspaceWeight(workspace);
  return Array.from(ids).map(sid=>{
    const perf=perfMap[sid];
    const info=roster[sid]||{};
    let earned=0,completedWeight=0;
    const currentMissing=[];
    written.forEach(item=>{
      const score=num(item.students?.[sid]?.score),weight=num(item.weight)||0,max=num(item.maxScore)||100;
      if(score==null){currentMissing.push(item.title||"지필평가");return}
      earned+=(score/max)*weight;completedWeight+=weight;
    });
    areas.forEach(area=>{
      const score=num(perf?.scores?.[area.id]),weight=num(area.weight)||0,max=num(area.maxScore)||100;
      if(score==null){currentMissing.push(area.name||"수행평가");return}
      earned+=(score/max)*weight;completedWeight+=weight;
    });
    earned=round(earned,2)||0;completedWeight=round(completedWeight,2)||0;
    const pending=planned.map(item=>`${item.title||"미등록 정기시험"}(미등록)`);
    const complete=currentMissing.length===0&&pending.length===0&&Math.abs(configuredWeight-100)<1e-9;
    const officialScore=complete?Math.round(earned):null;
    const nextWeight=Math.max(0,num(settings.nextExamWeight)||0);
    const nextMax=Math.max(1,num(settings.nextExamMax)||100);
    let needed=null,academicStatus="not-applicable",academicLabel="학업성취율 기준 미적용";
    if(courseType==="common"){
      if(complete){
        academicStatus=officialScore>=40?"reached":"fail";
        academicLabel=officialScore>=40?`학업성취율 도달 · ${officialScore}점`:`학업성취율 미도달 · ${officialScore}점`;
      }else if(currentMissing.length){
        academicStatus="check";academicLabel="현재까지 실시한 평가의 미입력 점수 확인 필요";
      }else if(nextWeight>0){
        needed=round(((40-earned)/nextWeight)*nextMax,1);
        if(needed<=0){academicStatus="reached";academicLabel="현재 입력 점수만으로 40% 도달"}
        else if(needed>nextMax){academicStatus="fail";academicLabel=`${settings.nextExamLabel} 만점으로도 40% 도달 불가`}
        else{academicStatus="risk";academicLabel=`${settings.nextExamLabel} ${needed}점 이상 필요`}
      }else{academicStatus="check";academicLabel="다음 시험 반영비율 또는 미입력 평가 확인 필요"}
    }
    const attend=attendance?.[sid]||{};
    const attendanceStatus=attend.status||"확인필요";
    let overallStatus="check",overall="확인 필요";
    if(attendanceStatus==="미도달"){overallStatus="fail";overall="출결 미도달"}
    else if(courseType==="common"&&academicStatus==="fail"){overallStatus="fail";overall="최소성취수준 미도달"}
    else if(courseType==="common"&&academicStatus==="risk"){overallStatus="risk";overall="최소성취수준 주의 대상자"}
    else if(attendanceStatus==="도달"&&(courseType==="elective"||academicStatus==="reached")){overallStatus="reached";overall="이수 기준 도달"}
    return {
      workspaceId:workspace.id,subject:workspace.subject,courseType,sid,
      name:perf?.name||info.name||"",classNumber:perf?.classNumber||Number(String(sid).slice(1,3))||info.class||null,
      number:perf?.number||Number(String(sid).slice(3,5))||info.number||null,
      earned,completedWeight,officialScore,complete,currentMissing,pending,
      missing:compactMissing([...currentMissing,...pending]),needed,academicStatus,academicLabel,
      attendanceStatus,attendanceNote:attend.note||"",overall,overallStatus,settings,
    };
  }).sort((a,b)=>(a.classNumber||99)-(b.classNumber||99)||(a.number||99)-(b.number||99)||a.sid.localeCompare(b.sid));
}

export default function MinimumAchievement({db={},persist,actor,accessRole="teacher",grade="2",roster={},allRosters={},homeroomClass="",showToast}){
  const mergedRoster=useMemo(()=>{const out={};Object.values(allRosters||{}).forEach(value=>Object.assign(out,value||{}));return Object.keys(out).length?out:roster},[allRosters,roster]);
  const isManager=["admin","department","monitor","gradeHead"].includes(accessRole)||actor?.teacherRole==="gradeHead";
  const isHomeroom=accessRole==="teacher"&&!!homeroomClass;
  const canManageAttendance=isManager||isHomeroom;
  const allWorkspaces=useMemo(()=>Object.values(db.teacherGradeWorkspaces||{})
    .filter(item=>String(item.grade)===String(grade))
    .filter(item=>isManager||isHomeroom||item.ownerId===actor?.id)
    .sort((a,b)=>String(a.subject||"").localeCompare(String(b.subject||""),"ko")),[db.teacherGradeWorkspaces,grade,isManager,isHomeroom,actor?.id]);
  const [subjectFilter,setSubjectFilter]=useState("all");
  const [classFilter,setClassFilter]=useState(isHomeroom?String(homeroomClass):"all");
  const [statusFilter,setStatusFilter]=useState("attention");
  const [query,setQuery]=useState("");
  const [showAllAttention,setShowAllAttention]=useState(false);
  const [saving,setSaving]=useState(false);
  const [attendanceDraft,setAttendanceDraft]=useState(db.minimumAchievementAttendance||{});
  const [bulkClass,setBulkClass]=useState(isHomeroom?String(homeroomClass):"all");
  const [bulkSubjectIds,setBulkSubjectIds]=useState([]);
  const [bulkStudentIds,setBulkStudentIds]=useState([]);
  const [bulkStudentQuery,setBulkStudentQuery]=useState("");
  const [bulkStatus,setBulkStatus]=useState("미도달");
  const [bulkNote,setBulkNote]=useState("");
  useEffect(()=>setAttendanceDraft(db.minimumAchievementAttendance||{}),[db.minimumAchievementAttendance]);
  useEffect(()=>{if(isHomeroom){setClassFilter(String(homeroomClass));setBulkClass(String(homeroomClass))}},[isHomeroom,homeroomClass]);
  useEffect(()=>{if(subjectFilter!=="all"&&!allWorkspaces.some(item=>item.id===subjectFilter))setSubjectFilter("all")},[allWorkspaces,subjectFilter]);

  const allRows=useMemo(()=>allWorkspaces.flatMap(workspace=>analyzeWorkspace(
    workspace,mergedRoster,db.minimumAchievementSettings?.[workspace.id]||{},attendanceDraft?.[workspace.id]||{}
  )),[allWorkspaces,mergedRoster,db.minimumAchievementSettings,attendanceDraft]);
  const classes=useMemo(()=>Array.from(new Set(allRows.map(row=>row.classNumber).filter(Boolean))).sort((a,b)=>a-b),[allRows]);
  const scopedRows=useMemo(()=>allRows.filter(row=>{
    if(isHomeroom&&String(row.classNumber)!==String(homeroomClass))return false;
    if(subjectFilter!=="all"&&row.workspaceId!==subjectFilter)return false;
    if(classFilter!=="all"&&String(row.classNumber)!==String(classFilter))return false;
    const q=txt(query).toLowerCase();if(q&&!`${row.sid} ${row.name} ${row.subject}`.toLowerCase().includes(q))return false;
    return true;
  }),[allRows,isHomeroom,homeroomClass,subjectFilter,classFilter,query]);
  const attentionRows=useMemo(()=>scopedRows.filter(row=>["risk","fail"].includes(row.overallStatus)),[scopedRows]);
  const visibleRows=useMemo(()=>scopedRows.filter(row=>{
    if(statusFilter==="attention")return ["risk","fail"].includes(row.overallStatus);
    return statusFilter==="all"||row.overallStatus===statusFilter;
  }),[scopedRows,statusFilter]);
  const summary={
    reached:scopedRows.filter(row=>row.overallStatus==="reached").length,
    risk:scopedRows.filter(row=>row.overallStatus==="risk").length,
    fail:scopedRows.filter(row=>row.overallStatus==="fail").length,
    check:scopedRows.filter(row=>row.overallStatus==="check").length,
  };
  const canEditRow=row=>isManager||(isHomeroom&&String(row.classNumber)===String(homeroomClass));
  const updateAttendance=(row,patch)=>setAttendanceDraft(current=>({
    ...current,[row.workspaceId]:{...(current?.[row.workspaceId]||{}),[row.sid]:{...(current?.[row.workspaceId]?.[row.sid]||{}),...patch,updatedBy:actor?.name||actor?.id,updatedAt:new Date().toISOString()}}
  }));
  const saveAttendance=async()=>{
    if(!canManageAttendance){showToast?.("학급담임 또는 관리자만 과목별 출결을 저장할 수 있습니다.","error");return}
    setSaving(true);
    const ok=await persist?.({minimumAchievementAttendance:attendanceDraft});
    setSaving(false);
    if(ok!==false)showToast?.("최소성취수준 출결 확인 내용을 저장했습니다.","success");
  };
  const printDashboard=()=>{
    document.body.classList.add("print-minimum-dashboard");
    let cleaned=false;
    const cleanup=()=>{if(cleaned)return;cleaned=true;document.body.classList.remove("print-minimum-dashboard")};
    window.addEventListener("afterprint",cleanup,{once:true});
    window.setTimeout(()=>window.print(),60);
    window.setTimeout(cleanup,4000);
  };
  const previewRows=showAllAttention?attentionRows:attentionRows.slice(0,12);

  const bulkStudents=useMemo(()=>{
    const map=new Map();
    allRows.forEach(row=>{
      if(isHomeroom&&String(row.classNumber)!==String(homeroomClass))return;
      if(bulkClass!=="all"&&String(row.classNumber)!==String(bulkClass))return;
      if(bulkSubjectIds.length&&!bulkSubjectIds.includes(row.workspaceId))return;
      const q=txt(bulkStudentQuery).toLowerCase();
      if(q&&!`${row.sid} ${row.name} ${row.classNumber} ${row.number}`.toLowerCase().includes(q))return;
      if(!map.has(row.sid))map.set(row.sid,{sid:row.sid,name:row.name,classNumber:row.classNumber,number:row.number});
    });
    return Array.from(map.values()).sort((a,b)=>(a.classNumber||99)-(b.classNumber||99)||(a.number||99)-(b.number||99));
  },[allRows,isHomeroom,homeroomClass,bulkClass,bulkSubjectIds,bulkStudentQuery]);
  useEffect(()=>setBulkStudentIds(current=>current.filter(sid=>bulkStudents.some(student=>student.sid===sid))),[bulkStudents]);
  const toggleBulkSubject=id=>setBulkSubjectIds(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);
  const toggleBulkStudent=sid=>setBulkStudentIds(current=>current.includes(sid)?current.filter(value=>value!==sid):[...current,sid]);
  const applyBulkAttendance=()=>{
    if(!canManageAttendance){showToast?.("학급담임 또는 관리자만 출결을 입력할 수 있습니다.","error");return}
    if(!bulkSubjectIds.length||!bulkStudentIds.length){showToast?.("과목과 학생을 각각 한 명 이상 선택해주세요.","error");return}
    const stamp={status:bulkStatus,note:bulkNote,updatedBy:actor?.name||actor?.id,updatedAt:new Date().toISOString()};
    setAttendanceDraft(current=>{
      const next={...current};
      bulkSubjectIds.forEach(workspaceId=>{
        next[workspaceId]={...(next[workspaceId]||{})};
        bulkStudentIds.forEach(sid=>{next[workspaceId][sid]={...(next[workspaceId][sid]||{}),...stamp}});
      });
      return next;
    });
    showToast?.(`${bulkStudentIds.length}명 × ${bulkSubjectIds.length}과목 출결 상태를 화면에 반영했습니다. 저장 버튼을 눌러 확정해주세요.`,"success");
  };

  return <div className="minimum-achievement minimum-dashboard-print-area" style={ui.root}>
    <style>{css}</style>
    <header className="minimum-hero" style={ui.hero}>
      <div style={ui.heroCopy}><span style={ui.eyebrow}>최소성취수준</span><h2>{grade}학년 최성보 현황</h2><p>학급별·과목별 주의 대상과 미도달 학생을 확인합니다.</p></div>
      <div className="minimum-hero-actions" style={ui.heroActions}><button type="button" className="no-minimum-dashboard-print" style={ui.printButton} onClick={printDashboard}><Printer size={15}/>인쇄·PDF</button><button type="button" className="no-minimum-dashboard-print" style={{...ui.saveButton,...((!canManageAttendance||saving)?ui.saveButtonDisabled:{})}} disabled={!canManageAttendance||saving} onClick={saveAttendance}><Save size={15}/>{saving?"저장 중":"출결 확인 저장"}</button></div>
    </header>
    <section className="minimum-rule-grid" style={ui.ruleGrid}>
      <div style={ui.ruleCard}><span style={ui.ruleIcon}><ShieldCheck size={18}/></span><div style={ui.ruleCopy}><span style={ui.commonRuleBadge}>공통과목</span><strong>출석 2/3 이상 + 성취율 40% 이상</strong><small>두 기준을 모두 충족해야 합니다.</small></div></div>
      <div style={ui.ruleCard}><span style={{...ui.ruleIcon,...ui.electiveIcon}}><BookOpenCheck size={18}/></span><div style={ui.ruleCopy}><span style={ui.electiveRuleBadge}>선택과목</span><strong>출석 2/3 이상</strong><small>학업성취율 기준은 적용하지 않습니다.</small></div></div>
    </section>
    {!allWorkspaces.length?<div style={ui.empty}><BookOpenCheck size={34}/><b>학교에 반영된 과목 성적이 없습니다.</b><span>과목 담당 교사가 선생님 ZONE에서 ‘공동 작업 저장’을 눌러야 표시됩니다.</span></div>:<>
      <section className="no-minimum-dashboard-print" style={ui.section}>
        <div style={ui.filterHeader}><div><b>최종 확인 필터</b><span>담임은 본인 학급, 관리자·부서는 전체 학급을 확인합니다.</span></div><span style={ui.roleBadge}>{isHomeroom?`${homeroomClass}반 담임`:"학년 전체 권한"}</span></div>
        <div style={ui.toolbar}>
          <div style={ui.search}><span style={ui.searchIcon}><Search size={15}/></span><div><small>학생·과목 검색</small><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="학번, 이름 또는 과목명"/></div></div>
          <select value={subjectFilter} onChange={event=>setSubjectFilter(event.target.value)}><option value="all">전체 과목</option>{allWorkspaces.map(item=><option key={item.id} value={item.id}>{item.subject} · {courseLabel(item.settings?.courseType)}</option>)}</select>
          {!isHomeroom&&<select value={classFilter} onChange={event=>setClassFilter(event.target.value)}><option value="all">전체 반</option>{classes.map(value=><option key={value} value={String(value)}>{value}반</option>)}</select>}
          <select value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option value="attention">주의+미도달</option><option value="risk">주의 대상자</option><option value="fail">미도달</option><option value="check">확인 필요</option><option value="reached">도달</option><option value="all">전체</option></select>
        </div>
        <div style={ui.metrics}><Metric label="조회" value={`${visibleRows.length}명`}/><Metric label="주의 대상자" value={`${summary.risk}명`} tone="warn"/><Metric label="미도달" value={`${summary.fail}명`} tone="bad"/><Metric label="확인 필요" value={`${summary.check}명`}/><Metric label="도달" value={`${summary.reached}명`} tone="good"/></div>
      </section>

      {canManageAttendance&&<section className="no-minimum-dashboard-print" style={{...ui.section,...ui.bulkSection}}>
        <div style={ui.bulkHeader}><div><span style={ui.bulkIcon}><ListChecks size={18}/></span><div><b>과목별 출결 일괄 입력</b><small>학급·학생·과목을 여러 개 선택한 뒤 출석률 도달 여부를 한 번에 적용합니다.</small></div></div><span style={ui.roleBadge}>{isHomeroom?`${homeroomClass}반만 입력 가능`:"전체 학급 입력 가능"}</span></div>
        <div className="minimum-bulk-grid" style={ui.bulkGrid}>
          <div style={ui.bulkColumn}><b>1. 학급</b><select value={bulkClass} disabled={isHomeroom} onChange={event=>{setBulkClass(event.target.value);setBulkStudentIds([])}}><option value="all">전체 반</option>{classes.map(value=><option key={value} value={String(value)}>{value}반</option>)}</select></div>
          <div style={{...ui.bulkColumn,...ui.bulkSubjectColumn}}><b>2. 과목 다중선택</b><div className="bulk-subject-grid" style={ui.checkGrid}>{allWorkspaces.map(item=><button key={item.id} type="button" className={bulkSubjectIds.includes(item.id)?"is-selected":""} onClick={()=>toggleBulkSubject(item.id)}><span>{bulkSubjectIds.includes(item.id)?<Check size={12}/>:null}</span>{item.subject}<small>{courseLabel(item.settings?.courseType)}</small></button>)}</div></div>
          <div style={{...ui.bulkColumn,...ui.bulkStudentColumn}}><div className="bulk-student-head" style={ui.bulkStudentHead}><b>3. 학생 다중선택</b><div><button type="button" onClick={()=>setBulkStudentIds(bulkStudents.map(item=>item.sid))}>현재 목록 전체</button><button type="button" onClick={()=>setBulkStudentIds([])}>해제</button></div></div><div style={ui.miniSearch}><Search size={13}/><input value={bulkStudentQuery} onChange={event=>setBulkStudentQuery(event.target.value)} placeholder="학번·이름 검색"/></div><div className="bulk-student-grid" style={ui.studentCheckGrid}>{bulkStudents.map(student=><button key={student.sid} type="button" className={bulkStudentIds.includes(student.sid)?"is-selected":""} onClick={()=>toggleBulkStudent(student.sid)}><span>{bulkStudentIds.includes(student.sid)?<Check size={11}/>:null}</span><b>{student.name||student.sid}</b><small>{student.classNumber}반 {student.number}번 · {student.sid}</small></button>)}</div></div>
          <div style={ui.bulkColumn}><b>4. 적용 상태</b><select value={bulkStatus} onChange={event=>setBulkStatus(event.target.value)}><option value="미도달">출결 미도달</option><option value="도달">출결 도달</option><option value="확인필요">확인 필요</option></select><input value={bulkNote} onChange={event=>setBulkNote(event.target.value)} placeholder="사유·메모 (선택)"/><button type="button" style={ui.bulkApplyButton} onClick={applyBulkAttendance}>선택 학생·과목에 적용</button></div>
        </div>
      </section>}

      {!!attentionRows.length&&<section style={ui.attentionPanel}>
        <div style={ui.attentionHead}><div><ShieldAlert size={18}/><span><b>{isHomeroom?`${homeroomClass}반`:"학년 전체"} 주의·미도달 학생</b><small>예방지도 대상과 미도달 확정 학생을 과목별로 먼저 확인하세요.</small></span></div><strong>{attentionRows.length}건</strong></div>
        <div className="minimum-attention-list" style={ui.attentionList}>{previewRows.map(row=><div key={`${row.workspaceId}-${row.sid}`} style={{...ui.attentionChip,...(row.overallStatus==="fail"?ui.attentionChipFail:{})}}><span>{row.classNumber}반 {row.number}번</span><b>{row.name||row.sid}</b><small>{row.subject} · {row.overall}</small></div>)}</div>
        {attentionRows.length>12&&<button type="button" className="no-minimum-dashboard-print" style={ui.moreButton} onClick={()=>setShowAllAttention(value=>!value)}>{showAllAttention?<><ChevronUp size={14}/>접기</>:<><ChevronDown size={14}/>전체보기 ({attentionRows.length}건)</>}</button>}
      </section>}
      <section style={ui.section}>
        <div style={ui.tableTitle}><div><Users size={16}/><b>학생별·과목별 최종 확인</b></div><span>{visibleRows.length}건</span></div>
        <div style={ui.tableWrap}><table><thead><tr><th>학번</th><th>성명</th><th>반·번호</th><th>과목</th><th>과목 유형</th><th>현재 환산</th><th>다음 시험 필요점수</th><th>학업성취율</th><th>과목 출결</th><th>최종 판정</th><th>확인 사항</th></tr></thead><tbody>{visibleRows.map(row=><tr key={`${row.workspaceId}-${row.sid}`} className={`row-${row.overallStatus}`}><td><b>{row.sid}</b></td><td><b>{row.name||"이름 미연결"}</b></td><td>{row.classNumber}반<br/><small>{row.number}번</small></td><td><b>{row.subject}</b></td><td><CourseBadge type={row.courseType}/></td><td><b>{row.earned.toFixed(2)}</b><small>{row.completedWeight}% 입력</small></td><td>{row.courseType==="elective"?<span className="na">적용 안 함</span>:row.needed==null?"-":row.needed<=0?<span className="ok"><Check size={11}/>현재 도달</span>:row.needed>Number(row.settings.nextExamMax)?<span className="bad">미도달 확정</span>:<><b>{row.needed}점 이상</b><small>{row.settings.nextExamLabel}</small></>}</td><td><StatusBadge status={row.academicStatus}>{row.academicLabel}</StatusBadge></td><td>{canEditRow(row)?<div style={ui.attendanceEdit}><select value={attendanceDraft?.[row.workspaceId]?.[row.sid]?.status||"확인필요"} onChange={event=>updateAttendance(row,{status:event.target.value})}><option value="확인필요">확인 필요</option><option value="도달">출결 도달</option><option value="미도달">출결 미도달</option></select><input value={attendanceDraft?.[row.workspaceId]?.[row.sid]?.note||""} onChange={event=>updateAttendance(row,{note:event.target.value})} placeholder="사유·메모"/></div>:<span>{row.attendanceStatus}</span>}</td><td><StatusBadge status={row.overallStatus}>{row.overall}</StatusBadge></td><td>{row.missing.length?<span style={ui.missing}>{row.missing.map(item=><small key={item}><AlertTriangle size={10}/>{item}</small>)}</span>:<span className="ok"><Check size={11}/>입력 완료</span>}</td></tr>)}</tbody></table></div>
        {!visibleRows.length&&<div style={ui.noRows}>선택한 조건에 해당하는 학생이 없습니다.</div>}
      </section>
    </>}
  </div>;
}
function Metric({label,value,tone}){return <div style={{...ui.metric,...(tone?ui[`metric_${tone}`]:{})}}><span>{label}</span><b>{value}</b></div>}
function CourseBadge({type}){return <span className={`course-badge ${type==="elective"?"is-elective":"is-common"}`}>{courseLabel(type)}</span>}
function StatusBadge({status,children}){return <span className={`minimum-status is-${status||"check"}`}>{children}</span>}
const css=`
.minimum-achievement *{box-sizing:border-box}.minimum-achievement{width:100%;max-width:100%;min-width:0;overflow:hidden}.minimum-achievement>*,.minimum-achievement section,.minimum-achievement header{min-width:0;max-width:100%}.minimum-achievement{letter-spacing:-.025em}.minimum-achievement .minimum-hero h2{margin:4px 0 3px;font-size:21px;line-height:1.2;letter-spacing:-.04em}.minimum-achievement .minimum-hero p{margin:0;font-size:11.5px;line-height:1.45;opacity:.9}.minimum-achievement .minimum-rule-grid strong{font-size:12.2px;line-height:1.35}.minimum-achievement .minimum-rule-grid small{font-size:9.8px;line-height:1.35;color:#7b8797}.minimum-achievement h2,.minimum-achievement p,.minimum-achievement b,.minimum-achievement strong,.minimum-achievement small{word-break:keep-all}.minimum-achievement button,.minimum-achievement input,.minimum-achievement select{font-family:${FONT};letter-spacing:-.028em}.minimum-achievement button:disabled{cursor:not-allowed}
.minimum-achievement h2{margin:6px 0 7px;font-size:22px;line-height:1.25;letter-spacing:-.045em}.minimum-achievement header p{margin:0;font-size:12px;line-height:1.5;opacity:.9}.minimum-achievement .minimum-rule-grid strong{display:block;color:#283c56;font-size:12.6px;line-height:1.35;word-break:keep-all}.minimum-achievement .minimum-rule-grid small{display:block;color:#758398;font-size:10.2px;line-height:1.38;word-break:keep-all}
.minimum-achievement table{width:100%;border-collapse:separate;border-spacing:0;min-width:1260px;font-size:11.6px;line-height:1.42}.minimum-achievement th{position:sticky;top:0;z-index:1;background:#edf3f9;color:#344b67;font-weight:950;padding:11px 8px;border-right:1px solid #d6dfe9;border-bottom:1px solid #cbd6e3;white-space:nowrap}.minimum-achievement th:last-child{border-right:0}.minimum-achievement td{padding:10px 8px;border-right:1px solid #e3e9f0;border-bottom:1px solid #e1e7ee;text-align:center;color:#304159;vertical-align:middle;background:#fff}.minimum-achievement td:last-child{border-right:0}.minimum-achievement td small{display:block;margin-top:4px;color:#8190a3;font-size:9.8px;line-height:1.4}.minimum-achievement tbody tr:nth-child(even) td{background:#fbfcfe}.minimum-achievement tbody tr:hover td{background:#f2f7fd}.minimum-achievement tr.row-risk td{background:#fffbf1}.minimum-achievement tr.row-fail td{background:#fff5f3}
.minimum-status{display:inline-flex;max-width:245px;align-items:center;justify-content:center;border-radius:999px;padding:5px 8px;font-size:10.3px;font-weight:900;line-height:1.35;white-space:normal}.minimum-status.is-reached{color:#286842;background:#e8f6ed}.minimum-status.is-risk{color:#8a5d18;background:#fff1cf}.minimum-status.is-fail{color:#a23d35;background:#fde8e6}.minimum-status.is-check{color:#5f6875;background:#edf1f5}.minimum-status.is-not-applicable{color:#41617e;background:#edf3f9}
.minimum-achievement select,.minimum-achievement input{border:1px solid #ccd8e6;border-radius:11px;background:#fff;color:#30445b;padding:9px 10px;min-width:0;font-size:11.5px;font-weight:750}.minimum-achievement .course-badge{display:inline-flex;border-radius:999px;padding:5px 8px;font-size:10.4px;font-weight:950;white-space:nowrap}.minimum-achievement .course-badge.is-common{color:#315d90;background:#e7f1fc}.minimum-achievement .course-badge.is-elective{color:#6a4f87;background:#f1eafa}.minimum-achievement .ok{display:inline-flex;align-items:center;gap:3px;color:#2f7047;font-weight:900}.minimum-achievement .bad{color:#a33d35;font-weight:950}.minimum-achievement .na{color:#667485;background:#eef1f5;border-radius:999px;padding:4px 7px;font-size:10.3px;font-weight:850}
.minimum-achievement .bulk-subject-grid button,.minimum-achievement .bulk-student-grid button{font-family:${FONT};border:1px solid #d3deeb;background:#fff;color:#465a72;border-radius:10px;cursor:pointer;padding:8px 9px;text-align:left}.minimum-achievement .bulk-subject-grid button{display:grid;grid-template-columns:18px 1fr auto;gap:5px;align-items:center;font-weight:900}.minimum-achievement .bulk-subject-grid button small{font-size:9px;color:#8290a2}.minimum-achievement .bulk-student-grid button{display:grid;grid-template-columns:18px 1fr;gap:2px 5px;align-items:center}.minimum-achievement .bulk-student-grid button small{grid-column:2;color:#8290a2;font-size:9px}.minimum-achievement .bulk-subject-grid button.is-selected,.minimum-achievement .bulk-student-grid button.is-selected{border-color:#78a2ce;background:#eaf3fc;color:#285c93;box-shadow:0 3px 9px rgba(44,91,145,.08)}.minimum-achievement .bulk-student-head button{border:1px solid #d1dce9;border-radius:8px;padding:5px 7px;color:#49647f;background:#fff;font-size:9.5px;font-weight:850;cursor:pointer}
@media(max-width:1180px){.minimum-achievement .minimum-bulk-grid{grid-template-columns:minmax(120px,.65fr) minmax(190px,1fr)!important minmax(230px,1.25fr)!important minmax(170px,.8fr)!important}.minimum-achievement .bulk-subject-grid button,.minimum-achievement .bulk-student-grid button{overflow:hidden}.minimum-achievement .bulk-subject-grid button,.minimum-achievement .bulk-student-grid button b,.minimum-achievement .bulk-subject-grid button small,.minimum-achievement .bulk-student-grid button small{min-width:0;overflow:hidden;text-overflow:ellipsis}}
@media(max-width:850px){.minimum-achievement .minimum-rule-grid{grid-template-columns:1fr!important}.minimum-achievement .minimum-hero{grid-template-columns:1fr!important;align-items:flex-start!important}.minimum-achievement .minimum-hero-actions{justify-content:flex-start!important}.minimum-achievement .minimum-bulk-grid{grid-template-columns:1fr!important}}
@media print{body.print-minimum-dashboard *{visibility:hidden!important}body.print-minimum-dashboard .minimum-dashboard-print-area,body.print-minimum-dashboard .minimum-dashboard-print-area *{visibility:visible!important}body.print-minimum-dashboard .minimum-dashboard-print-area{position:absolute;inset:0;width:100%;gap:8px!important}body.print-minimum-dashboard .no-minimum-dashboard-print{display:none!important}body.print-minimum-dashboard .minimum-achievement table{min-width:0!important;font-size:8.5pt}body.print-minimum-dashboard .minimum-achievement th,body.print-minimum-dashboard .minimum-achievement td{padding:5px 4px!important}body.print-minimum-dashboard .minimum-achievement header{padding:14px 16px!important;box-shadow:none!important}body.print-minimum-dashboard .minimum-achievement .minimum-attention-list{grid-template-columns:repeat(4,1fr)!important}}
`;
const ui={
  root:{fontFamily:FONT,display:"grid",gap:14,color:"#253244",width:"100%",maxWidth:"100%",minWidth:0,overflow:"hidden"},hero:{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",alignItems:"center",justifyContent:"space-between",gap:18,padding:"18px 22px",borderRadius:20,color:"#fff",background:"linear-gradient(135deg,#76536f,#8f6076 55%,#9d7169)",boxShadow:"0 14px 32px rgba(112,70,100,.18)"},heroCopy:{minWidth:0,wordBreak:"keep-all"},heroActions:{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"},eyebrow:{fontSize:11.5,fontWeight:950,opacity:.82,letterSpacing:".04em"},saveButton:{display:"inline-flex",alignItems:"center",gap:6,border:"1px solid rgba(255,255,255,.8)",borderRadius:11,padding:"10px 13px",background:"#fff",color:"#315d90",fontWeight:950,cursor:"pointer",whiteSpace:"nowrap",boxShadow:"0 7px 18px rgba(36,61,111,.14)"},printButton:{display:"inline-flex",alignItems:"center",gap:6,border:"1px solid rgba(255,255,255,.42)",borderRadius:11,padding:"10px 13px",background:"rgba(255,255,255,.13)",color:"#fff",fontWeight:950,cursor:"pointer",whiteSpace:"nowrap"},saveButtonDisabled:{opacity:.45},ruleGrid:{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10,minWidth:0},ruleCard:{display:"flex",gap:11,alignItems:"center",padding:"12px 14px",border:"1px solid #d9e3ef",borderRadius:15,background:"linear-gradient(135deg,#fff,#f8fbff)",boxShadow:"0 5px 16px rgba(55,72,110,.04)"},ruleCopy:{display:"grid",gridTemplateColumns:"auto minmax(0,1fr)",gap:"3px 9px",alignItems:"center",minWidth:0},commonRuleBadge:{gridRow:"1 / span 2",display:"inline-flex",alignItems:"center",borderRadius:999,padding:"5px 8px",color:"#315d90",background:"#e8f1fb",fontSize:10.5,fontWeight:950,whiteSpace:"nowrap"},electiveRuleBadge:{gridRow:"1 / span 2",display:"inline-flex",alignItems:"center",borderRadius:999,padding:"5px 8px",color:"#6a4f87",background:"#f1eafa",fontSize:10.5,fontWeight:950,whiteSpace:"nowrap"},ruleIcon:{width:38,height:38,display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:12,color:"#3568a3",background:"#e8f1fb"},electiveIcon:{color:"#6a4f87",background:"#f1eafa"},section:{border:"1px solid #d9e3ee",borderRadius:17,padding:15,background:"#fff",boxShadow:"0 7px 20px rgba(55,72,110,.05)",minWidth:0,maxWidth:"100%",overflow:"hidden"},filterHeader:{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",marginBottom:12},roleBadge:{border:"1px solid #c8d9ea",borderRadius:999,padding:"6px 9px",color:"#315d90",background:"#eef5fc",fontSize:10.5,fontWeight:900},toolbar:{display:"flex",gap:8,alignItems:"stretch",flexWrap:"wrap",marginBottom:12},search:{display:"flex",alignItems:"center",gap:9,flex:"1 1 280px",minHeight:46,border:"1.5px solid #c8d7e8",borderRadius:14,padding:"6px 12px",background:"linear-gradient(180deg,#fff,#f8fbff)"},searchIcon:{width:30,height:30,display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:9,color:"#3568a3",background:"#e9f2fc"},metrics:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(125px,1fr))",gap:8},metric:{display:"grid",gap:3,padding:"11px 12px",border:"1px solid #e0e6ef",borderRadius:12,background:"#fafbfd"},metric_good:{borderColor:"#c5e2cf",background:"#f0f8f3"},metric_warn:{borderColor:"#ecd59d",background:"#fff9ea"},metric_bad:{borderColor:"#ecc6c1",background:"#fff4f2"},bulkSection:{background:"linear-gradient(135deg,#fbfdff,#f7fbff)"},bulkHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:13},bulkIcon:{width:36,height:36,display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:11,color:"#315d90",background:"#e8f1fb"},bulkGrid:{display:"grid",gridTemplateColumns:"minmax(125px,.65fr) minmax(210px,1fr) minmax(260px,1.35fr) minmax(180px,.8fr)",gap:10,alignItems:"start",minWidth:0,maxWidth:"100%"},bulkColumn:{display:"grid",gap:8,minWidth:0},bulkSubjectColumn:{},bulkStudentColumn:{},checkGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(132px,1fr))",gap:6,maxHeight:180,overflowY:"auto",overflowX:"hidden",minWidth:0},bulkStudentHead:{display:"flex",justifyContent:"space-between",gap:8,alignItems:"center"},miniSearch:{display:"flex",alignItems:"center",gap:6,border:"1px solid #d1dce9",borderRadius:10,padding:"0 8px",background:"#fff"},studentCheckGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(132px,1fr))",gap:6,maxHeight:180,overflowY:"auto",overflowX:"hidden",minWidth:0},bulkApplyButton:{border:0,borderRadius:10,padding:"10px 11px",color:"#fff",background:"#3568a3",fontWeight:950,cursor:"pointer"},attentionPanel:{border:"1px solid #edc8c2",borderRadius:16,padding:15,background:"linear-gradient(135deg,#fff8f6,#fffdf9)"},attentionHead:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,color:"#8f453a",flexWrap:"wrap"},attentionList:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:7,marginTop:10},attentionChip:{display:"grid",gap:2,padding:"9px 10px",border:"1px solid #ecd4cf",borderRadius:11,background:"#fff"},attentionChipFail:{borderColor:"#e8b9b2",background:"#fff4f2"},moreButton:{display:"inline-flex",alignItems:"center",gap:5,marginTop:10,border:"1px solid #d8c0bb",borderRadius:9,padding:"7px 10px",color:"#875045",background:"#fff",fontWeight:900,cursor:"pointer"},tableTitle:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:10,color:"#344b67"},tableWrap:{width:"100%",maxWidth:"100%",minWidth:0,overflowX:"auto",border:"1px solid #cfd9e5",borderRadius:14,background:"#fff",boxShadow:"0 5px 16px rgba(47,70,103,.04)"},attendanceEdit:{display:"grid",gridTemplateColumns:"112px minmax(125px,1fr)",gap:5},missing:{display:"grid",gap:3,color:"#9c493b"},noRows:{padding:24,textAlign:"center",color:"#778497",fontWeight:800},empty:{minHeight:240,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,border:"1px dashed #d5deea",borderRadius:15,color:"#738095",background:"#fafbfd"}
};
