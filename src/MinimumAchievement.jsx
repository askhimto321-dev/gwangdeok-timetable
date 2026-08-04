import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpenCheck, Check, Save, Search, ShieldCheck, Users } from "lucide-react";

const FONT='"Pretendard","SUIT","Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
const round=(value,digits=1)=>{const n=Number(value);if(!Number.isFinite(n))return null;const f=10**digits;return Math.round((n+Number.EPSILON)*f)/f};
const num=value=>{if(value==null||value==="")return null;const n=Number(value);return Number.isFinite(n)?n:null};
const text=value=>String(value??"").trim();
const workspaceWeight=workspace=>{
  const written=(workspace?.written||[]).reduce((sum,item)=>sum+(num(item.weight)||0),0);
  const areas=(workspace?.performance?.[0]?.areas||[]).reduce((sum,item)=>sum+(num(item.weight)||0),0);
  return round(written+areas,2)||0;
};
function workspaceDefaults(workspace,stored={}){
  const configured=workspaceWeight(workspace);
  return {
    courseType:stored.courseType||workspace?.settings?.courseType||"common",
    writtenExamCount:Number(stored.writtenExamCount||Math.max(1,(workspace?.written||[]).length||2)),
    nextExamLabel:stored.nextExamLabel||"다음 정기시험",
    nextExamWeight:num(stored.nextExamWeight)??Math.max(0,round(100-configured,2)||0),
    nextExamMax:num(stored.nextExamMax)??100,
  };
}
function analyzeWorkspace(workspace,roster={},storedSettings={},attendance={}){
  const settings=workspaceDefaults(workspace,storedSettings);
  const written=workspace?.written||[];
  const performance=workspace?.performance||[];
  const areas=performance[0]?.areas||[];
  const perfMap={};
  performance.forEach(file=>Object.entries(file.students||{}).forEach(([sid,student])=>{perfMap[sid]=student}));
  const ids=new Set();
  written.forEach(item=>Object.keys(item.students||{}).forEach(sid=>ids.add(sid)));
  performance.forEach(item=>Object.keys(item.students||{}).forEach(sid=>ids.add(sid)));
  return Array.from(ids).map(sid=>{
    const perf=perfMap[sid];
    const info=roster[sid]||{};
    let earned=0,completedWeight=0;
    const missing=[];
    written.forEach(item=>{
      const score=num(item.students?.[sid]?.score),weight=num(item.weight)||0,max=num(item.maxScore)||100;
      if(score==null){missing.push(item.title||"지필평가");return;}
      earned+=(score/max)*weight;completedWeight+=weight;
    });
    areas.forEach(area=>{
      const score=num(perf?.scores?.[area.id]),weight=num(area.weight)||0,max=num(area.maxScore)||100;
      if(score==null){missing.push(area.name||"수행평가");return;}
      earned+=(score/max)*weight;completedWeight+=weight;
    });
    earned=round(earned,2)||0;completedWeight=round(completedWeight,2)||0;
    const courseType=settings.courseType;
    const targetWeight=num(settings.nextExamWeight)||0;
    const targetMax=num(settings.nextExamMax)||100;
    let needed=null,academicLabel="",academicStatus="neutral";
    if(courseType==="elective"){
      academicLabel="선택과목: 학업성취율 이수 기준 미적용";
      academicStatus="neutral";
    }else if(missing.length){
      academicLabel=`기존 자료 확인 필요 (${missing.join(", ")})`;
      academicStatus="check";
    }else if(targetWeight>0){
      needed=round(((40-earned)/targetWeight)*targetMax,1);
      if(needed<=0){academicLabel="현재 점수만으로 40% 도달";academicStatus="reached";}
      else if(needed>targetMax){academicLabel=`${settings.nextExamLabel} 만점으로도 도달 어려움`;academicStatus="fail";}
      else {academicLabel=`${settings.nextExamLabel} ${needed}점 이상 필요`;academicStatus=needed>=70?"risk":"caution";}
    }else{
      const finalScore=round(earned,0);
      academicLabel=finalScore>=40?`학업성취율 도달 (${finalScore}점)`:`학업성취율 미도달 (${finalScore}점)`;
      academicStatus=finalScore>=40?"reached":"fail";
    }
    const attend=attendance?.[sid]||{};
    const attendanceStatus=attend.status||"확인필요";
    let overall="확인 필요",overallStatus="check";
    if(attendanceStatus==="미도달"){overall="출결 미도달";overallStatus="fail";}
    else if(courseType==="elective"){
      if(attendanceStatus==="도달"){overall="이수 기준 도달";overallStatus="reached";}
    }else if(attendanceStatus==="도달"){
      if(academicStatus==="reached"){overall="최소 성취수준 도달";overallStatus="reached";}
      else if(academicStatus==="fail"){overall="학업성취율 미도달";overallStatus="fail";}
      else if(["risk","caution"].includes(academicStatus)){overall="예방지도 주의";overallStatus="risk";}
    }
    return {
      workspaceId:workspace.id,subject:workspace.subject,sid,
      name:perf?.name||info.name||"",classNumber:perf?.classNumber||Number(String(sid).slice(1,3))||info.class||null,
      number:perf?.number||Number(String(sid).slice(3,5))||info.number||null,
      earned,completedWeight,needed,academicLabel,academicStatus,attendanceStatus,attendanceNote:attend.note||"",overall,overallStatus,settings,
    };
  }).sort((a,b)=>(a.classNumber||99)-(b.classNumber||99)||(a.number||99)-(b.number||99)||a.sid.localeCompare(b.sid));
}

export default function MinimumAchievement({db={},persist,actor,accessRole="teacher",grade="2",roster={},allRosters={},homeroomClass="",showToast}){
  const mergedRoster=useMemo(()=>{const out={};Object.values(allRosters||{}).forEach(value=>Object.assign(out,value||{}));return Object.keys(out).length?out:roster},[allRosters,roster]);
  const isManager=["admin","department","monitor"].includes(accessRole);
  const isHomeroom=accessRole==="teacher"&&!!homeroomClass;
  const allWorkspaces=useMemo(()=>Object.values(db.teacherGradeWorkspaces||{})
    .filter(item=>String(item.grade)===String(grade))
    .filter(item=>isManager||isHomeroom||item.ownerId===actor?.id)
    .sort((a,b)=>String(a.subject||"").localeCompare(String(b.subject||""),"ko")),[db.teacherGradeWorkspaces,grade,isManager,isHomeroom,actor?.id]);
  const [selectedId,setSelectedId]=useState("");
  const selected=allWorkspaces.find(item=>item.id===selectedId)||allWorkspaces[0]||null;
  const canEditSettings=!!selected&&(isManager||selected.ownerId===actor?.id);
  useEffect(()=>{if(!selectedId&&allWorkspaces[0])setSelectedId(allWorkspaces[0].id);if(selectedId&&!allWorkspaces.some(item=>item.id===selectedId))setSelectedId(allWorkspaces[0]?.id||"")},[allWorkspaces,selectedId]);
  const storedSettings=db.minimumAchievementSettings?.[selected?.id]||{};
  const [settings,setSettings]=useState(()=>workspaceDefaults(selected,storedSettings));
  useEffect(()=>setSettings(workspaceDefaults(selected,db.minimumAchievementSettings?.[selected?.id]||{})),[selected?.id,db.minimumAchievementSettings]);
  const attendanceSource=db.minimumAchievementAttendance?.[selected?.id]||{};
  const [attendanceDraft,setAttendanceDraft]=useState(attendanceSource);
  useEffect(()=>setAttendanceDraft(attendanceSource),[selected?.id,db.minimumAchievementAttendance]);
  const allowedClass=isHomeroom?String(homeroomClass):"all";
  const [classFilter,setClassFilter]=useState(allowedClass);
  const [statusFilter,setStatusFilter]=useState("all");
  const [query,setQuery]=useState("");
  useEffect(()=>{if(isHomeroom)setClassFilter(String(homeroomClass))},[isHomeroom,homeroomClass]);
  const rows=useMemo(()=>selected?analyzeWorkspace(selected,mergedRoster,settings,attendanceDraft):[],[selected,mergedRoster,settings,attendanceDraft]);
  const classes=useMemo(()=>Array.from(new Set(rows.map(row=>row.classNumber).filter(Boolean))).sort((a,b)=>a-b),[rows]);
  const visibleRows=useMemo(()=>rows.filter(row=>{
    if(isHomeroom&&String(row.classNumber)!==String(homeroomClass))return false;
    if(classFilter!=="all"&&String(row.classNumber)!==String(classFilter))return false;
    if(statusFilter!=="all"&&row.overallStatus!==statusFilter)return false;
    const q=text(query).toLowerCase();if(q&&!`${row.sid} ${row.name}`.toLowerCase().includes(q))return false;
    return true;
  }),[rows,isHomeroom,homeroomClass,classFilter,statusFilter,query]);
  const allRisks=useMemo(()=>allWorkspaces.flatMap(workspace=>analyzeWorkspace(workspace,mergedRoster,db.minimumAchievementSettings?.[workspace.id]||{},db.minimumAchievementAttendance?.[workspace.id]||{})).filter(row=>{
    if(isHomeroom&&String(row.classNumber)!==String(homeroomClass))return false;
    return row.attendanceStatus==="미도달"||["fail","risk","caution"].includes(row.academicStatus);
  }),[allWorkspaces,mergedRoster,db.minimumAchievementSettings,db.minimumAchievementAttendance,isHomeroom,homeroomClass]);
  const riskByStudent=useMemo(()=>{const map=new Map();allRisks.forEach(row=>{if(!map.has(row.sid))map.set(row.sid,{...row,subjects:[]});map.get(row.sid).subjects.push(`${row.subject}(${row.overall})`)});return Array.from(map.values()).sort((a,b)=>(a.classNumber||99)-(b.classNumber||99)||(a.number||99)-(b.number||99))},[allRisks]);
  const saveData=async()=>{
    if(!selected)return;
    const patch={minimumAchievementAttendance:{...(db.minimumAchievementAttendance||{}),[selected.id]:attendanceDraft}};
    if(canEditSettings)patch.minimumAchievementSettings={...(db.minimumAchievementSettings||{}),[selected.id]:settings};
    const ok=await persist?.(patch);
    if(ok!==false)showToast?.(canEditSettings?"최소 성취수준 설정과 출결 상태를 저장했습니다.":"담임 학급의 과목 출결 상태를 저장했습니다.","success");
  };
  const updateAttendance=(sid,patch)=>setAttendanceDraft(current=>({...current,[sid]:{...(current[sid]||{}),...patch,updatedBy:actor?.name||actor?.id,updatedAt:new Date().toISOString()}}));
  const canEditRow=row=>isManager||(isHomeroom&&String(row.classNumber)===String(homeroomClass));
  const summary={reached:visibleRows.filter(r=>r.overallStatus==="reached").length,risk:visibleRows.filter(r=>r.overallStatus==="risk").length,fail:visibleRows.filter(r=>r.overallStatus==="fail").length,check:visibleRows.filter(r=>r.overallStatus==="check").length};
  return <div className="minimum-achievement" style={ui.root}>
    <style>{css}</style>
    <header style={ui.hero}><div><span style={ui.eyebrow}>최소성취수준 보장지도</span><h2>{grade}학년 과목 이수·예방지도 현황</h2><p>공통과목은 출석률 2/3 이상과 학업성취율 40% 이상을 함께 확인하고, 선택과목은 출석률 기준을 중심으로 확인합니다.</p></div><button type="button" style={ui.saveButton} onClick={saveData}><Save size={15}/> 설정·출결 저장</button></header>
    <section style={ui.ruleGrid}><div><b>공통과목</b><strong>출석률 2/3 이상 + 학업성취율 40% 이상</strong><span>40% 미만 예상 학생은 다음 정기시험 필요점수를 계산합니다.</span></div><div><b>선택과목</b><strong>출석률 2/3 이상</strong><span>학업성취율 40% 기준은 이수 판정에 적용하지 않습니다.</span></div></section>
    {!allWorkspaces.length?<div style={ui.empty}><BookOpenCheck size={32}/><b>반영된 과목 성적 자료가 없습니다.</b><span>선생님 ZONE에서 성적 파일을 올린 뒤 ‘학교 자료에 반영’을 눌러주세요.</span></div>:<>
      <section style={ui.section}>
        <div style={ui.sectionHead}><div><b>과목 및 계산 기준</b><span>정기시험을 한 번만 보는 과목도 실시 횟수와 남은 반영비율을 직접 설정할 수 있습니다.</span></div></div>
        <div style={ui.settingsRow}>
          <label><span>과목</span><select value={selected?.id||""} onChange={event=>setSelectedId(event.target.value)}>{allWorkspaces.map(item=><option key={item.id} value={item.id}>{item.subject} · {item.ownerName||item.ownerId}</option>)}</select></label>
          <label><span>과목 구분</span><select value={settings.courseType} disabled={!canEditSettings} onChange={event=>setSettings(current=>({...current,courseType:event.target.value}))}><option value="common">공통과목</option><option value="elective">선택과목</option></select></label>
          <label><span>정기시험 횟수</span><select value={settings.writtenExamCount} disabled={!canEditSettings} onChange={event=>setSettings(current=>({...current,writtenExamCount:Number(event.target.value)}))}><option value="1">1회</option><option value="2">2회</option></select></label>
          <label><span>다음 시험 반영비율</span><div style={ui.numberShell}><input type="number" min="0" max="100" step="0.01" value={settings.nextExamWeight} disabled={!canEditSettings} onChange={event=>setSettings(current=>({...current,nextExamWeight:event.target.value}))}/><b>%</b></div></label>
          <label><span>다음 시험 만점</span><div style={ui.numberShell}><input type="number" min="1" step="1" value={settings.nextExamMax} disabled={!canEditSettings} onChange={event=>setSettings(current=>({...current,nextExamMax:event.target.value}))}/><b>점</b></div></label>
        </div>
        {!canEditSettings&&<div style={ui.readOnlyNotice}>과목 산출 기준은 담당 교사 또는 관리자만 수정할 수 있습니다. 학급담임은 본인 학급의 출결 상태를 입력할 수 있습니다.</div>}
      </section>
      <section style={ui.section}>
        <div style={ui.metrics}><Metric label="조회 학생" value={`${visibleRows.length}명`}/><Metric label="도달" value={`${summary.reached}명`} tone="good"/><Metric label="예방지도 주의" value={`${summary.risk}명`} tone="warn"/><Metric label="미도달" value={`${summary.fail}명`} tone="bad"/><Metric label="확인 필요" value={`${summary.check}명`}/></div>
        {riskByStudent.length>0&&<div style={ui.homeroomRisk}><div><Users size={16}/><b>{isHomeroom?`${homeroomClass}반`:"학년 전체"} 최성보 주의 대상자</b><span>{riskByStudent.length}명</span></div><div>{riskByStudent.slice(0,30).map(row=><span key={row.sid}><b>{row.classNumber}반 {row.number}번 {row.name||row.sid}</b><small>{row.subjects.join(" · ")}</small></span>)}</div></div>}
        <div style={ui.toolbar}><div style={ui.search}><Search size={15}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="학번·이름 검색"/></div>{!isHomeroom&&<select value={classFilter} onChange={event=>setClassFilter(event.target.value)}><option value="all">전체 반</option>{classes.map(c=><option key={c} value={String(c)}>{c}반</option>)}</select>}<select value={statusFilter} onChange={event=>setStatusFilter(event.target.value)}><option value="all">전체 상태</option><option value="reached">도달</option><option value="risk">주의</option><option value="fail">미도달</option><option value="check">확인 필요</option></select></div>
        <div style={ui.tableWrap}><table><thead><tr><th>학생</th><th>현재 환산점수</th><th>입력 완료 비율</th><th>다음 정기시험 필요점수</th><th>학업성취율 판단</th><th>과목 출결</th><th>최종 상태</th></tr></thead><tbody>{visibleRows.map(row=><tr key={row.sid}><td><b>{row.name||"이름 미연결"}</b><small>{row.sid} · {row.classNumber}반 {row.number}번</small></td><td><strong>{row.earned.toFixed(2)}</strong></td><td>{row.completedWeight}%</td><td>{settings.courseType==="elective"?"적용 안 함":row.needed==null?"-":row.needed<=0?"현재 도달":row.needed>Number(settings.nextExamMax)?"만점 초과 필요":`${row.needed}점 이상`}</td><td><StatusBadge status={row.academicStatus}>{row.academicLabel}</StatusBadge></td><td>{canEditRow(row)?<div style={ui.attendanceEdit}><select value={attendanceDraft[row.sid]?.status||"확인필요"} onChange={event=>updateAttendance(row.sid,{status:event.target.value})}><option value="확인필요">확인 필요</option><option value="도달">출결 도달</option><option value="미도달">출결 미도달</option></select><input value={attendanceDraft[row.sid]?.note||""} onChange={event=>updateAttendance(row.sid,{note:event.target.value})} placeholder="사유·메모"/></div>:<span>{row.attendanceStatus}</span>}</td><td><StatusBadge status={row.overallStatus}>{row.overall}</StatusBadge></td></tr>)}</tbody></table></div>
      </section>
    </>}
  </div>
}
function Metric({label,value,tone}){return <div style={{...ui.metric,...(tone?ui[`metric_${tone}`]:{})}}><span>{label}</span><b>{value}</b></div>}
function StatusBadge({status,children}){return <span className={`minimum-status is-${status||"check"}`}>{children}</span>}
const css=`
.minimum-achievement *{box-sizing:border-box}.minimum-achievement button,.minimum-achievement input,.minimum-achievement select{font-family:${FONT};letter-spacing:-.02em}
.minimum-achievement table{width:100%;border-collapse:collapse;min-width:1050px;font-size:11.5px}.minimum-achievement th{position:sticky;top:0;background:#f1f5fa;color:#40526a;font-weight:900;padding:10px 8px;border-bottom:1px solid #d7e0eb;white-space:nowrap}.minimum-achievement td{padding:9px 8px;border-bottom:1px solid #edf0f4;text-align:center;color:#35445a}.minimum-achievement td:first-child{text-align:left}.minimum-achievement td small{display:block;margin-top:3px;color:#8793a3;font-size:9.7px}.minimum-achievement tbody tr:hover{background:#f8fbff}
.minimum-status{display:inline-flex;max-width:240px;align-items:center;justify-content:center;border-radius:999px;padding:5px 8px;font-size:10.5px;font-weight:850;line-height:1.3;white-space:normal}.minimum-status.is-reached{color:#286842;background:#eaf7ee}.minimum-status.is-risk,.minimum-status.is-caution{color:#8a5d18;background:#fff4dc}.minimum-status.is-fail{color:#a23d35;background:#fdeceb}.minimum-status.is-check{color:#5f6875;background:#eef1f5}.minimum-status.is-neutral{color:#41617e;background:#edf3f9}
.minimum-achievement select,.minimum-achievement input{border:1px solid #d2dce9;border-radius:9px;background:#fff;color:#33445a;padding:8px 9px;min-width:0}.minimum-achievement label{display:grid;gap:5px;color:#68778a;font-size:10.5px;font-weight:850}.minimum-achievement label>span{white-space:nowrap}
@media(max-width:850px){.minimum-achievement [style*="settingsRow"]{grid-template-columns:1fr 1fr!important}.minimum-achievement [style*="ruleGrid"]{grid-template-columns:1fr!important}}
`;
const ui={
  root:{fontFamily:FONT,display:"grid",gap:14,color:"#253244"},hero:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,padding:"20px 22px",borderRadius:19,color:"#fff",background:"linear-gradient(135deg,#2f659f,#5576ac 55%,#6f67ad)",boxShadow:"0 14px 32px rgba(49,83,145,.16)"},eyebrow:{fontSize:11.5,fontWeight:900,opacity:.8,letterSpacing:".04em"},saveButton:{display:"inline-flex",alignItems:"center",gap:6,border:"1px solid rgba(255,255,255,.65)",borderRadius:10,padding:"9px 12px",background:"#fff",color:"#315d90",fontWeight:900,cursor:"pointer",whiteSpace:"nowrap"},ruleGrid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10},section:{border:"1px solid #dce4ef",borderRadius:16,padding:16,background:"#fff",boxShadow:"0 7px 20px rgba(55,72,110,.05)"},sectionHead:{display:"flex",justifyContent:"space-between",gap:10,marginBottom:12},settingsRow:{display:"grid",gridTemplateColumns:"minmax(250px,1.3fr) repeat(4,minmax(125px,.7fr))",gap:10,alignItems:"end"},numberShell:{display:"flex",alignItems:"center",gap:5},metrics:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:8,marginBottom:12},metric:{display:"grid",gap:3,padding:"10px 11px",border:"1px solid #e0e6ef",borderRadius:11,background:"#fafbfd"},metric_good:{borderColor:"#c5e2cf",background:"#f0f8f3"},metric_warn:{borderColor:"#ecd59d",background:"#fff9ea"},metric_bad:{borderColor:"#ecc6c1",background:"#fff4f2"},toolbar:{display:"flex",gap:7,alignItems:"center",flexWrap:"wrap",marginBottom:9},search:{display:"flex",alignItems:"center",gap:6,flex:"1 1 220px",border:"1px solid #d2dce9",borderRadius:9,padding:"0 8px"},tableWrap:{overflowX:"auto",border:"1px solid #dfe5ee",borderRadius:12},attendanceEdit:{display:"grid",gridTemplateColumns:"110px minmax(120px,1fr)",gap:5},homeroomRisk:{display:"grid",gap:8,marginBottom:12,padding:11,border:"1px solid #edc9c3",borderRadius:12,background:"#fff8f6"},readOnlyNotice:{marginTop:10,padding:"8px 10px",border:"1px solid #e7d5aa",borderRadius:9,color:"#7b612c",background:"#fff9e9",fontSize:10.8,fontWeight:750},empty:{minHeight:240,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,border:"1px dashed #d5deea",borderRadius:15,color:"#738095",background:"#fafbfd"}
};
