import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpenCheck, Check, ChevronDown, ChevronUp, Save, Search, ShieldAlert, ShieldCheck, Users } from "lucide-react";

const FONT='"Pretendard","SUIT","Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
const round=(value,digits=1)=>{const n=Number(value);if(!Number.isFinite(n))return null;const f=10**digits;return Math.round((n+Number.EPSILON)*f)/f};
const num=value=>{if(value==null||value==="")return null;const n=Number(value);return Number.isFinite(n)?n:null};
const txt=value=>String(value??"").trim();
const courseLabel=type=>type==="elective"?"선택과목":"공통과목";
const workspaceWeight=workspace=>{
  const written=(workspace?.written||[]).reduce((sum,item)=>sum+(num(item.weight)||0),0);
  const areas=(workspace?.performance?.[0]?.areas||[]).reduce((sum,item)=>sum+(num(item.weight)||0),0);
  return round(written+areas,2)||0;
};
function minimumSettings(workspace,stored={}){
  const embedded=workspace?.settings?.minimumAchievement||{};
  const configured=workspaceWeight(workspace);
  return {
    nextExamLabel:stored.nextExamLabel||embedded.nextExamLabel||"다음 정기시험",
    nextExamWeight:num(stored.nextExamWeight)??num(embedded.nextExamWeight)??Math.max(0,round(100-configured,2)||0),
    nextExamMax:num(stored.nextExamMax)??num(embedded.nextExamMax)??100,
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
    const missing=[];
    written.forEach(item=>{
      const score=num(item.students?.[sid]?.score),weight=num(item.weight)||0,max=num(item.maxScore)||100;
      if(score==null){missing.push(item.title||"지필평가");return}
      earned+=(score/max)*weight;completedWeight+=weight;
    });
    areas.forEach(area=>{
      const score=num(perf?.scores?.[area.id]),weight=num(area.weight)||0,max=num(area.maxScore)||100;
      if(score==null){missing.push(area.name||"수행평가");return}
      earned+=(score/max)*weight;completedWeight+=weight;
    });
    earned=round(earned,2)||0;completedWeight=round(completedWeight,2)||0;
    const complete=missing.length===0&&Math.abs(configuredWeight-100)<1e-9;
    const officialScore=complete?Math.round(earned):null;
    const nextWeight=Math.max(0,num(settings.nextExamWeight)||0);
    const nextMax=Math.max(1,num(settings.nextExamMax)||100);
    let needed=null,academicStatus="not-applicable",academicLabel="학업성취율 기준 미적용";
    if(courseType==="common"){
      if(complete){
        academicStatus=officialScore>=40?"reached":"fail";
        academicLabel=officialScore>=40?`학업성취율 도달 · ${officialScore}점`:`학업성취율 미도달 · ${officialScore}점`;
      }else if(missing.length){
        academicStatus="check";academicLabel="현재 평가의 미입력 점수를 먼저 확인해야 함";
      }else if(nextWeight>0){
        needed=round(((40-earned)/nextWeight)*nextMax,1);
        if(needed<=0){academicStatus="reached";academicLabel="현재 입력 점수만으로 40% 도달"}
        else if(needed>nextMax){academicStatus="risk";academicLabel=`${settings.nextExamLabel} 만점으로도 도달 어려움`}
        else{academicStatus="risk";academicLabel=`${settings.nextExamLabel} ${needed}점 이상 필요`}
      }else{academicStatus="check";academicLabel="미입력 평가 또는 다음 시험 기준 확인 필요"}
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
      earned,completedWeight,officialScore,complete,missing:compactMissing(missing),needed,academicStatus,academicLabel,
      attendanceStatus,attendanceNote:attend.note||"",overall,overallStatus,settings,
    };
  }).sort((a,b)=>(a.classNumber||99)-(b.classNumber||99)||(a.number||99)-(b.number||99)||a.sid.localeCompare(b.sid));
}

export default function MinimumAchievement({db={},persist,actor,accessRole="teacher",grade="2",roster={},allRosters={},homeroomClass="",showToast}){
  const mergedRoster=useMemo(()=>{const out={};Object.values(allRosters||{}).forEach(value=>Object.assign(out,value||{}));return Object.keys(out).length?out:roster},[allRosters,roster]);
  const isManager=["admin","department","monitor","gradeHead"].includes(accessRole)||actor?.teacherRole==="gradeHead";
  const isHomeroom=accessRole==="teacher"&&!!homeroomClass;
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
  useEffect(()=>setAttendanceDraft(db.minimumAchievementAttendance||{}),[db.minimumAchievementAttendance]);
  useEffect(()=>{if(isHomeroom)setClassFilter(String(homeroomClass))},[isHomeroom,homeroomClass]);
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
    if(!allWorkspaces.length){showToast?.("저장할 과목 자료가 없습니다.","error");return}
    setSaving(true);
    const ok=await persist?.({minimumAchievementAttendance:attendanceDraft});
    setSaving(false);
    if(ok!==false)showToast?.("최소성취수준 출결 확인 내용을 저장했습니다.","success");
  };
  const previewRows=showAllAttention?attentionRows:attentionRows.slice(0,12);

  return <div className="minimum-achievement" style={ui.root}>
    <style>{css}</style>
    <header style={ui.hero}>
      <div><span style={ui.eyebrow}>담임·관리자 최종 확인</span><h2>{grade}학년 최소성취수준 현황</h2><p>과목 담당 교사가 반영한 성적을 기준으로 학급별·과목별 주의 대상과 최종 미도달을 확인합니다.</p></div>
      <button type="button" style={{...ui.saveButton,...((!allWorkspaces.length||saving)?ui.saveButtonDisabled:{})}} disabled={!allWorkspaces.length||saving} onClick={saveAttendance}><Save size={15}/>{saving?"저장 중":"출결 확인 저장"}</button>
    </header>
    <section style={ui.ruleGrid}>
      <div style={ui.ruleCard}><span style={ui.ruleIcon}><ShieldCheck size={18}/></span><div><b>공통과목</b><strong>출석률 2/3 이상 + 학업성취율 40% 이상</strong><small>두 기준을 모두 충족해야 이수 기준에 도달합니다.</small></div></div>
      <div style={ui.ruleCard}><span style={ui.ruleIcon}><BookOpenCheck size={18}/></span><div><b>선택과목</b><strong>출석률 2/3 이상</strong><small>학업성취율 40% 기준은 최소성취수준 판정에 적용하지 않습니다.</small></div></div>
    </section>
    {!allWorkspaces.length?<div style={ui.empty}><BookOpenCheck size={34}/><b>학교에 반영된 과목 성적이 없습니다.</b><span>과목 담당 교사가 선생님 ZONE에서 ‘공동 작업 저장’을 눌러야 표시됩니다.</span></div>:<>
      <section style={ui.section}>
        <div style={ui.filterHeader}><div><b>최종 확인 필터</b><span>담임은 본인 학급, 관리자·부서는 전체 학급을 확인합니다.</span></div><span style={ui.roleBadge}>{isHomeroom?`${homeroomClass}반 담임`:"학년 전체 권한"}</span></div>
        <div style={ui.toolbar}>
          <div style={ui.search}><Search size={15}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="학번·이름·과목 검색"/></div>
          <select value={subjectFilter} onChange={event=>setSubjectFilter(event.target.value)}><option value="all">전체 과목</option>{allWorkspaces.map(item=><option key={item.id} value={item.id}>{item.subject} · {courseLabel(item.settings?.courseType)}</option>)}</select>
          {!isHomeroom&&<select value={classFilter} onChange={event=>setClassFilter(event.target.value)}><option value="all">전체 반</option>{classes.map(value=><option key={value} value={String(value)}>{value}반</option>)}</select>}
          <select value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option value="attention">주의+미도달</option><option value="risk">주의 대상자</option><option value="fail">미도달</option><option value="check">확인 필요</option><option value="reached">도달</option><option value="all">전체 상태</option></select>
        </div>
        <div style={ui.metrics}><Metric label="조회" value={`${visibleRows.length}명`}/><Metric label="주의 대상자" value={`${summary.risk}명`} tone="warn"/><Metric label="미도달" value={`${summary.fail}명`} tone="bad"/><Metric label="확인 필요" value={`${summary.check}명`}/><Metric label="도달" value={`${summary.reached}명`} tone="good"/></div>
      </section>
      {!!attentionRows.length&&<section style={ui.attentionPanel}>
        <div style={ui.attentionHead}><div><ShieldAlert size={18}/><span><b>{isHomeroom?`${homeroomClass}반`:"학년 전체"} 주의·미도달 학생</b><small>과목별 판정 상태를 먼저 확인하세요.</small></span></div><strong>{attentionRows.length}건</strong></div>
        <div style={ui.attentionList}>{previewRows.map(row=><div key={`${row.workspaceId}-${row.sid}`} style={ui.attentionChip}><span>{row.classNumber}반 {row.number}번</span><b>{row.name||row.sid}</b><small>{row.subject} · {row.overall}</small></div>)}</div>
        {attentionRows.length>12&&<button type="button" style={ui.moreButton} onClick={()=>setShowAllAttention(value=>!value)}>{showAllAttention?<><ChevronUp size={14}/>접기</>:<><ChevronDown size={14}/>전체보기 ({attentionRows.length}건)</>}</button>}
      </section>}
      <section style={ui.section}>
        <div style={ui.tableWrap}><table><thead><tr><th>학번</th><th>성명</th><th>반·번호</th><th>과목</th><th>과목 유형</th><th>현재 환산</th><th>다음 시험 필요점수</th><th>학업성취율</th><th>과목 출결</th><th>최종 판정</th><th>확인 사항</th></tr></thead><tbody>{visibleRows.map(row=><tr key={`${row.workspaceId}-${row.sid}`} className={`row-${row.overallStatus}`}><td><b>{row.sid}</b></td><td><b>{row.name||"이름 미연결"}</b></td><td>{row.classNumber}반<br/><small>{row.number}번</small></td><td><b>{row.subject}</b></td><td><CourseBadge type={row.courseType}/></td><td><b>{row.earned.toFixed(2)}</b><small>{row.completedWeight}% 입력</small></td><td>{row.courseType==="elective"?<span className="na">적용 안 함</span>:row.needed==null?"-":row.needed<=0?<span className="ok"><Check size={11}/>현재 도달</span>:row.needed>Number(row.settings.nextExamMax)?<span className="bad">만점 초과 필요</span>:<><b>{row.needed}점 이상</b><small>{row.settings.nextExamLabel}</small></>}</td><td><StatusBadge status={row.academicStatus}>{row.academicLabel}</StatusBadge></td><td>{canEditRow(row)?<div style={ui.attendanceEdit}><select value={attendanceDraft?.[row.workspaceId]?.[row.sid]?.status||"확인필요"} onChange={event=>updateAttendance(row,{status:event.target.value})}><option value="확인필요">확인 필요</option><option value="도달">출결 도달</option><option value="미도달">출결 미도달</option></select><input value={attendanceDraft?.[row.workspaceId]?.[row.sid]?.note||""} onChange={event=>updateAttendance(row,{note:event.target.value})} placeholder="사유·메모"/></div>:<span>{row.attendanceStatus}</span>}</td><td><StatusBadge status={row.overallStatus}>{row.overall}</StatusBadge></td><td>{row.missing.length?<span style={ui.missing}>{row.missing.map(item=><small key={item}><AlertTriangle size={10}/>{item}</small>)}</span>:<span className="ok"><Check size={11}/>입력 완료</span>}</td></tr>)}</tbody></table></div>
        {!visibleRows.length&&<div style={ui.noRows}>선택한 조건에 해당하는 학생이 없습니다.</div>}
      </section>
    </>}
  </div>
}
function Metric({label,value,tone}){return <div style={{...ui.metric,...(tone?ui[`metric_${tone}`]:{})}}><span>{label}</span><b>{value}</b></div>}
function CourseBadge({type}){return <span className={`course-badge ${type==="elective"?"is-elective":"is-common"}`}>{courseLabel(type)}</span>}
function StatusBadge({status,children}){return <span className={`minimum-status is-${status||"check"}`}>{children}</span>}
const css=`
.minimum-achievement *{box-sizing:border-box}.minimum-achievement button,.minimum-achievement input,.minimum-achievement select{font-family:${FONT};letter-spacing:-.025em}.minimum-achievement button:disabled{cursor:not-allowed}
.minimum-achievement table{width:100%;border-collapse:collapse;min-width:1240px;font-size:11.5px}.minimum-achievement th{position:sticky;top:0;z-index:1;background:#f0f5fb;color:#3d5069;font-weight:950;padding:11px 8px;border-bottom:1px solid #d5dfeb;white-space:nowrap}.minimum-achievement td{padding:10px 8px;border-bottom:1px solid #e9eef4;text-align:center;color:#34445a;vertical-align:middle}.minimum-achievement td small{display:block;margin-top:3px;color:#8592a3;font-size:9.7px;line-height:1.35}.minimum-achievement tbody tr:hover{background:#f8fbff}.minimum-achievement tr.row-risk{background:#fffbf1}.minimum-achievement tr.row-fail{background:#fff5f3}
.minimum-status{display:inline-flex;max-width:240px;align-items:center;justify-content:center;border-radius:999px;padding:5px 8px;font-size:10.3px;font-weight:900;line-height:1.35;white-space:normal}.minimum-status.is-reached{color:#286842;background:#e8f6ed}.minimum-status.is-risk{color:#8a5d18;background:#fff1cf}.minimum-status.is-fail{color:#a23d35;background:#fde8e6}.minimum-status.is-check{color:#5f6875;background:#edf1f5}.minimum-status.is-not-applicable{color:#41617e;background:#edf3f9}
.minimum-achievement select,.minimum-achievement input{border:1px solid #d0dbe8;border-radius:10px;background:#fff;color:#33445a;padding:8px 10px;min-width:0}.minimum-achievement .course-badge{display:inline-flex;border-radius:999px;padding:5px 8px;font-size:10.4px;font-weight:950;white-space:nowrap}.minimum-achievement .course-badge.is-common{color:#315d90;background:#e7f1fc}.minimum-achievement .course-badge.is-elective{color:#6a4f87;background:#f1eafa}.minimum-achievement .ok{display:inline-flex;align-items:center;gap:3px;color:#2f7047;font-weight:900}.minimum-achievement .bad{color:#a33d35;font-weight:900}.minimum-achievement .na{color:#667485;background:#eef1f5;border-radius:999px;padding:4px 7px;font-size:10.3px;font-weight:850}
@media(max-width:850px){.minimum-achievement [style*="ruleGrid"]{grid-template-columns:1fr!important}.minimum-achievement [style*="hero"]{align-items:flex-start!important;flex-direction:column!important}}
`;
const ui={
  root:{fontFamily:FONT,display:"grid",gap:14,color:"#253244"},hero:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:18,padding:"23px 25px",borderRadius:20,color:"#fff",background:"linear-gradient(135deg,#2f659f,#5576ac 55%,#6f67ad)",boxShadow:"0 14px 32px rgba(49,83,145,.16)"},eyebrow:{fontSize:11.5,fontWeight:950,opacity:.82,letterSpacing:".04em"},saveButton:{display:"inline-flex",alignItems:"center",gap:6,border:"1px solid rgba(255,255,255,.8)",borderRadius:11,padding:"10px 13px",background:"#fff",color:"#315d90",fontWeight:950,cursor:"pointer",whiteSpace:"nowrap",boxShadow:"0 7px 18px rgba(36,61,111,.14)"},saveButtonDisabled:{opacity:.45},ruleGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10},ruleCard:{display:"flex",gap:11,alignItems:"flex-start",padding:"14px 16px",border:"1px solid #d9e3ef",borderRadius:15,background:"linear-gradient(135deg,#fff,#f8fbff)",boxShadow:"0 5px 16px rgba(55,72,110,.04)"},ruleIcon:{width:36,height:36,display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:11,color:"#3568a3",background:"#e8f1fb"},section:{border:"1px solid #dce4ef",borderRadius:16,padding:16,background:"#fff",boxShadow:"0 7px 20px rgba(55,72,110,.05)"},filterHeader:{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",marginBottom:12},roleBadge:{border:"1px solid #c8d9ea",borderRadius:999,padding:"6px 9px",color:"#315d90",background:"#eef5fc",fontSize:10.5,fontWeight:900},toolbar:{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap",marginBottom:11},search:{display:"flex",alignItems:"center",gap:7,flex:"1 1 250px",border:"1px solid #d0dbe8",borderRadius:10,padding:"0 9px",background:"#fff"},metrics:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(125px,1fr))",gap:8},metric:{display:"grid",gap:3,padding:"10px 11px",border:"1px solid #e0e6ef",borderRadius:11,background:"#fafbfd"},metric_good:{borderColor:"#c5e2cf",background:"#f0f8f3"},metric_warn:{borderColor:"#ecd59d",background:"#fff9ea"},metric_bad:{borderColor:"#ecc6c1",background:"#fff4f2"},attentionPanel:{border:"1px solid #edc8c2",borderRadius:15,padding:14,background:"linear-gradient(135deg,#fff8f6,#fffdf9)"},attentionHead:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,color:"#8f453a"},attentionList:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:7,marginTop:10},attentionChip:{display:"grid",gap:2,padding:"8px 9px",border:"1px solid #ecd4cf",borderRadius:10,background:"#fff"},moreButton:{display:"inline-flex",alignItems:"center",gap:5,marginTop:10,border:"1px solid #d8c0bb",borderRadius:9,padding:"7px 10px",color:"#875045",background:"#fff",fontWeight:900,cursor:"pointer"},tableWrap:{overflowX:"auto",border:"1px solid #dfe5ee",borderRadius:12},attendanceEdit:{display:"grid",gridTemplateColumns:"112px minmax(125px,1fr)",gap:5},missing:{display:"grid",gap:3,color:"#9c493b"},noRows:{padding:24,textAlign:"center",color:"#778497",fontWeight:800},empty:{minHeight:240,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,border:"1px dashed #d5deea",borderRadius:15,color:"#738095",background:"#fafbfd"}
};
