import React, { useEffect, useMemo, useState } from "react";
import { Upload, FileSpreadsheet, Loader2, Save, Trash2, Search, GraduationCap, Database, AlertTriangle, CheckCircle2, Filter, BarChart3, RotateCcw, ChevronUp, ChevronDown } from "lucide-react";
import { computeAllGroupAverages, computeMockExamSums, grade5to9, parseAdmissionCaseRows, summarizeAdmissionCases } from "./gradeEngine.js";

const SEMESTERS=["1-1","1-2","2-1","2-2","3-1","3-2"];
const MOCKS=["1-3","1-6","1-9","1-10","2-3","2-6","2-9","3-3","3-6","3-9"];
const PAGE_SIZE=50;
const COLORS={blue:"#315a9b",green:"#39724c",purple:"#6b4f91",red:"#9a3f3f",gold:"#8a641d",line:"#e2ded3",muted:"#777167"};
const CSS=`
.admission-case-ui{
  font-family:Pretendard,"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",Arial,sans-serif;
  color:#242a31;
  letter-spacing:-.01em;
}
.admission-case-ui *{box-sizing:border-box}
.admission-case-ui h2,.admission-case-ui h3,.admission-case-ui p{margin:0}
.admission-case-ui table{width:100%;border-collapse:collapse;text-align:center;font-size:12px}
.admission-case-ui th,.admission-case-ui td{border-right:1px solid #e5e0d6;border-bottom:1px solid #e5e0d6;padding:9px 8px;vertical-align:middle;word-break:keep-all}
.admission-case-ui th{background:#f5f3ee;font-weight:900;white-space:nowrap}
.admission-case-ui th:last-child,.admission-case-ui td:last-child{border-right:0}
.admission-case-ui input,.admission-case-ui select,.admission-case-ui button{font:inherit}
.admission-case-ui button:disabled{opacity:.45;cursor:not-allowed}
.admission-case-search button{display:block;width:100%;padding:8px 10px;border:0;background:#fff;text-align:left;cursor:pointer}
.admission-case-search button:hover{background:#edf3ff}
.admission-filter-chip{
  display:inline-flex;align-items:center;justify-content:center;gap:5px;
  min-height:31px;padding:6px 10px;border:1px solid #d8dfe8;border-radius:999px;
  background:#fff;color:#4c5767;font-size:11.5px;font-weight:800;cursor:pointer;
  transition:background .15s,border-color .15s,color .15s,box-shadow .15s;
}
.admission-filter-chip:hover{border-color:#90a7c3;background:#f5f8fc}
.admission-filter-chip.is-active{background:#365f91;border-color:#365f91;color:#fff;box-shadow:0 3px 8px rgba(49,90,155,.16)}
.admission-filter-chip.is-soft{background:#eef3f9;color:#315a86;border-color:#cbd7e5}
.admission-filter-group{display:grid;gap:8px;padding:12px;border:1px solid #e4e7eb;border-radius:12px;background:#fbfcfd}
.admission-filter-options{display:flex;gap:7px;flex-wrap:wrap}
.admission-range-button{
  min-width:58px;padding:7px 11px;border:1px solid #d8dfe8;border-radius:9px;
  background:#fff;color:#4d5968;font-weight:850;cursor:pointer;
}
.admission-range-button.is-active{background:#334f78;border-color:#334f78;color:#fff}
.admission-filter-primary,.admission-filter-secondary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
@media(max-width:900px){
  .admission-case-summary{grid-template-columns:repeat(3,minmax(0,1fr))!important}
  .admission-case-two{grid-template-columns:1fr!important}
  .admission-case-student{grid-template-columns:1fr!important}
  .admission-case-university{grid-template-columns:1fr!important}
  .admission-filter-primary,.admission-filter-secondary{grid-template-columns:1fr}
}
@media(max-width:640px){
  .admission-case-summary{grid-template-columns:repeat(2,minmax(0,1fr))!important}
}
`;

function num(v){
  if(v==null||v===""||(typeof v==="string"&&v.trim()===""))return null;
  const x=Number(v);
  return Number.isFinite(x)?x:null;
}
function fmt(v,d=2){const x=num(v);return x==null?"-":Number(x.toFixed(d)).toString()}
function unique(values){return Array.from(new Set(values.filter(v=>v!=null&&String(v).trim()!=="")))}
function record(data,entryYear,key){return data?.[`${entryYear}:${key}`]||data?.[key]||null}
function entryYearForGrade(settings,grade){const year=Number(settings?.academicYear)||new Date().getFullYear();const hit=(settings?.cohorts||[]).find(x=>Number(x.currentGrade)===Number(grade)&&x.status!=="졸업");return Number(hit?.entryYear)||year-Number(grade)+1}
function median(values){const s=values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);if(!s.length)return null;const m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2}
function percentile(values,ratio){const s=values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);if(!s.length)return null;const i=(s.length-1)*ratio,l=Math.floor(i),u=Math.ceil(i);return l===u?s[l]:s[l]+(s[u]-s[l])*(i-l)}
function studentProfile(sid,roster,gdb,currentGrade){if(!sid)return null;const info=roster?.[sid]||{};const grade=Number(info.grade)||Number(String(sid).charAt(0))||Number(currentGrade)||1;const entryYear=Number(info.entryYear)||entryYearForGrade(gdb.cohortSettings,grade);const gradeSystem=entryYear>=2025?5:9;const subjectLists=SEMESTERS.map(k=>record(gdb.semesterData,entryYear,k)?.students?.[sid]?.subjects||null);const groups=computeAllGroupAverages(subjectLists,gradeSystem);const average=gradeSystem===5?groups?.전과목?.avg5:groups?.전과목?.avg9;const converted=average==null?null:(gradeSystem===5?grade5to9(average):average);const latestMock=MOCKS.slice().reverse().find(k=>record(gdb.mockData,entryYear,k)?.students?.[sid]);const mock=latestMock?record(gdb.mockData,entryYear,latestMock)?.students?.[sid]||{}:{};let name=info.name||"";if(!name){for(const k of SEMESTERS.slice().reverse()){name=record(gdb.semesterData,entryYear,k)?.students?.[sid]?.name||"";if(name)break}}return{sid:String(sid),name,grade,entryYear,gradeSystem,average,converted,sums:computeMockExamSums(mock)}}
function groupStats(rows,getter){const map=new Map();rows.forEach(row=>{const key=getter(row)||"미지정";if(!map.has(key))map.set(key,[]);map.get(key).push(row)});return Array.from(map,([label,items])=>{const accepted=items.filter(x=>x.finalResult==="합격");return{label,total:items.length,accepted:accepted.length,first:items.filter(x=>x.finalResultDetail==="최초합격").length,waitlist:items.filter(x=>x.finalResultDetail==="충원합격").length,rejected:items.filter(x=>x.finalResult==="불합격").length,rate:items.length?accepted.length/items.length*100:null,median:median(accepted.map(x=>x.universityGrade??x.overallGrade))}}).sort((a,b)=>b.total-a.total||a.label.localeCompare(b.label,"ko"))}
function resultStyle(value){if(value==="최초합격")return{color:COLORS.blue,background:"#edf3ff",borderColor:"#cbd9ef"};if(value==="충원합격")return{color:COLORS.purple,background:"#f3effa",borderColor:"#d8cdea"};if(value==="불합격")return{color:COLORS.red,background:"#fff0f0",borderColor:"#efcaca"};return{color:COLORS.muted,background:"#f4f2ed",borderColor:"#ddd8cd"}}
function textMatch(row,query){const q=String(query||"").trim().toLowerCase();return!q||[row.university,row.universityNormalized,row.department,row.detailType,row.admissionType,row.region].filter(Boolean).join(" ").toLowerCase().includes(q)}
function applyFilters(rows,filters){
  const source=Array.isArray(rows)?rows:[];
  const min=num(filters?.minGrade);
  const max=num(filters?.maxGrade);
  return source.filter(row=>{
    if(!textMatch(row,filters?.query))return false;
    if(filters?.regions?.length&&!filters.regions.includes(row.region))return false;
    if(filters?.fields?.length&&!filters.fields.includes(row.field))return false;
    if(filters?.schoolTypes?.length&&!filters.schoolTypes.includes(row.schoolType))return false;
    if(filters?.admissionTypes?.length&&!filters.admissionTypes.includes(row.admissionType))return false;
    if(filters?.results?.length&&!filters.results.includes(row.finalResultDetail))return false;
    if(min!=null&&(row.overallGrade==null||Number(row.overallGrade)<min))return false;
    if(max!=null&&(row.overallGrade==null||Number(row.overallGrade)>max))return false;
    return true;
  });
}

function SummaryCards({rows}){const summary=useMemo(()=>summarizeAdmissionCases(rows),[rows]);const cards=[["지원 사례",summary.total,COLORS.blue],["합격 사례",summary.accepted,COLORS.green],["최초합격",summary.firstAccepted,COLORS.blue],["충원합격",summary.waitlistAccepted,COLORS.purple],["불합격",summary.rejected,COLORS.red],["등록 확인",summary.registered,COLORS.gold]];return <div className="admission-case-summary" style={styles.summary}>{cards.map(([label,value,color])=><div key={label} style={{...styles.summaryCard,borderTopColor:color}}><b style={{color}}>{value.toLocaleString()}</b><span>{label}</span></div>)}</div>}
function Section({title,description,children}){return <section style={styles.section}><div style={styles.sectionTitle}><div><h3>{title}</h3>{description&&<p>{description}</p>}</div></div>{children}</section>}
function Table({children,minWidth=0}){return <div style={styles.tableWrap}><table style={{minWidth}}>{children}</table></div>}
function Empty({title,text,icon=<Database size={28}/>}){return <div style={styles.empty}>{icon}<b>{title}</b>{text&&<span>{text}</span>}</div>}
function SearchBox({value,onChange,placeholder,count}){return <div style={styles.searchBox}><Search size={16}/><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>{count&&<span>{count}</span>}</div>}

function StudentConnector({profile,query,onQuery,onSelect,roster}){const hits=useMemo(()=>{const q=String(query||"").trim().toLowerCase();return q?Object.entries(roster||{}).filter(([sid,info])=>`${sid} ${info?.name||""}`.toLowerCase().includes(q)).slice(0,8):[]},[query,roster]);return <div className="admission-case-student" style={styles.studentConnector}><div style={{position:"relative",display:"grid",gap:6}}><label style={styles.label}>학생 성적 연동</label><div style={{position:"relative"}}><Search size={15} style={{position:"absolute",left:11,top:11,color:"#8a8578"}}/><input style={{...styles.input,paddingLeft:34}} value={query||""} onChange={e=>onQuery(e.target.value)} placeholder="학번 또는 이름 검색"/>{hits.length>0&&<div className="admission-case-search" style={styles.searchResults}>{hits.map(([sid,info])=><button key={sid} onClick={()=>{onSelect(sid);onQuery(sid)}}><b>{sid}</b> {info?.name}</button>)}</div>}</div></div>{profile?<div style={styles.studentProfile}><div><b>{profile.sid} {profile.name}</b><span>{profile.entryYear}학년도 입학생 · {profile.gradeSystem}등급제</span></div><div style={styles.studentMetrics}><span>현재 내신 <b>{fmt(profile.average)}</b></span><span>9등급 비교값 <b>{fmt(profile.converted)}</b></span><span>최신 최저 <b>{profile.sums?.sum2?`2합 ${profile.sums.sum2}`:"미입력"}</b></span></div></div>:<div style={styles.studentPlaceholder}>학생을 선택하면 현재 성적과 과거 사례를 연결합니다.</div>}</div>}


function toggleSelection(values,option){
  return values.includes(option)?values.filter(item=>item!==option):[...values,option];
}

function FilterChipGroup({label,options,value,onChange,compact=false}){
  return <div className="admission-filter-group" style={compact?{padding:10}:{}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
      <b style={{fontSize:12.5,color:"#354052"}}>{label}</b>
      <span style={{fontSize:10.5,color:"#7b8491"}}>{value.length?`${value.length}개 선택`:"전체"}</span>
    </div>
    <div className="admission-filter-options">
      <button type="button" className={`admission-filter-chip ${value.length===0?"is-active":""}`} onClick={()=>onChange([])}>전체</button>
      {options.map(option=><button
        type="button"
        key={option}
        className={`admission-filter-chip ${value.includes(option)?"is-active":""}`}
        onClick={()=>onChange(toggleSelection(value,option))}
      >{option}</button>)}
    </div>
  </div>;
}

function FilterPanel({cases,filters,setFilters,filteredCount}){
  const[advanced,setAdvanced]=useState(false);
  const regions=useMemo(()=>unique(cases.map(x=>x.region)).sort((a,b)=>a.localeCompare(b,"ko")),[cases]);
  const fields=useMemo(()=>unique(cases.map(x=>x.field)).sort((a,b)=>a.localeCompare(b,"ko")),[cases]);
  const schoolTypes=useMemo(()=>unique(cases.map(x=>x.schoolType)).sort((a,b)=>a.localeCompare(b,"ko")),[cases]);
  const admissionTypes=useMemo(()=>unique(cases.map(x=>x.admissionType)).sort((a,b)=>a.localeCompare(b,"ko")),[cases]);
  const reset=()=>setFilters({query:"",regions:[],fields:[],schoolTypes:[],admissionTypes:[],results:[],minGrade:"",maxGrade:""});
  const selectedCount=(filters.regions?.length||0)+(filters.fields?.length||0)+(filters.schoolTypes?.length||0)+(filters.admissionTypes?.length||0)+(filters.results?.length||0)+(filters.minGrade!==""?1:0)+(filters.maxGrade!==""?1:0);

  return <div style={{...styles.filters,padding:16}}>
    <div style={{...styles.filterHeader,marginBottom:14}}>
      <div style={{display:"grid",gap:4}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <b style={{fontSize:15}}>분석 조건</b>
          <span style={{padding:"3px 8px",borderRadius:999,background:"#edf3fb",color:"#315a86",fontSize:10.5,fontWeight:850}}>
            {filteredCount.toLocaleString()}건 조회
          </span>
        </div>
        <span style={{fontSize:11.5,color:"#737b87"}}>같은 항목 안에서는 OR, 서로 다른 항목끼리는 AND로 적용됩니다.</span>
      </div>
      <button type="button" onClick={reset} style={styles.smallButton}><RotateCcw size={13}/>전체 초기화</button>
    </div>

    <div className="admission-filter-primary">
      <FilterChipGroup label="계열" options={fields} value={filters.fields} onChange={v=>setFilters(x=>({...x,fields:v}))}/>
      <FilterChipGroup label="전형유형" options={admissionTypes} value={filters.admissionTypes} onChange={v=>setFilters(x=>({...x,admissionTypes:v}))}/>
    </div>

    <button type="button" style={{...styles.advancedButton,width:"100%",marginTop:12,background:advanced?"#f0f4f9":"#fff"}} onClick={()=>setAdvanced(v=>!v)}>
      {advanced?<ChevronUp size={15}/>:<ChevronDown size={15}/>}
      고급 조건 {advanced?"접기":"펼치기"}
      {selectedCount>0&&<span style={{marginLeft:4,padding:"2px 7px",borderRadius:999,background:"#315a86",color:"#fff",fontSize:10}}>{selectedCount}</span>}
    </button>

    {advanced&&<div style={{display:"grid",gap:12,marginTop:12,paddingTop:12,borderTop:"1px solid #e7e9ed"}}>
      <FilterChipGroup label="지역" options={regions} value={filters.regions} onChange={v=>setFilters(x=>({...x,regions:v}))} compact/>
      <div className="admission-filter-secondary">
        <FilterChipGroup label="학교유형" options={schoolTypes} value={filters.schoolTypes} onChange={v=>setFilters(x=>({...x,schoolTypes:v}))} compact/>
        <FilterChipGroup label="최종 결과" options={["최초합격","충원합격","불합격"]} value={filters.results} onChange={v=>setFilters(x=>({...x,results:v}))} compact/>
      </div>
      <div style={{display:"grid",gap:8,padding:12,border:"1px solid #e4e7eb",borderRadius:12,background:"#fbfcfd"}}>
        <b style={{fontSize:12.5,color:"#354052"}}>전교과 등급 범위</b>
        <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto minmax(0,1fr)",gap:8,alignItems:"center"}}>
          <input style={styles.input} type="number" min="1" max="9" step="0.1" value={filters.minGrade} onChange={e=>setFilters(x=>({...x,minGrade:e.target.value}))} placeholder="최소 등급"/>
          <span style={{color:"#8a929d",fontWeight:800}}>~</span>
          <input style={styles.input} type="number" min="1" max="9" step="0.1" value={filters.maxGrade} onChange={e=>setFilters(x=>({...x,maxGrade:e.target.value}))} placeholder="최대 등급"/>
        </div>
      </div>
    </div>}
  </div>;
}

function StudentMatch({rows,profile}){
  const[range,setRange]=useState(0.5);
  const[field,setField]=useState("전체");
  const fields=useMemo(()=>unique(rows.map(x=>x.field)).sort((a,b)=>a.localeCompare(b,"ko")),[rows]);
  const similar=useMemo(()=>{
    if(profile?.converted==null)return[];
    return rows.filter(row=>{
      const grade=row.universityGrade??row.overallGrade;
      return grade!=null&&Math.abs(grade-profile.converted)<=range&&(field==="전체"||row.field===field);
    });
  },[rows,profile,range,field]);
  const stats=useMemo(()=>groupStats(similar,row=>row.universityNormalized||row.university).slice(0,24),[similar]);
  if(!profile)return <Empty title="학생을 먼저 선택하세요." text="학번을 연동하면 현재 성적과 비슷한 과거 지원 사례를 보여줍니다." icon={<GraduationCap size={28}/>}/>;
  if(profile.converted==null)return <Empty title="비교할 내신 성적이 없습니다." text="학생의 학기 성적을 먼저 업로드하세요." icon={<AlertTriangle size={28}/>}/>;

  return <div style={{display:"grid",gap:15}}>
    <div style={styles.notice}><AlertTriangle size={16}/><span>과거 사례는 9등급제 자료입니다. 현재 5등급제 학생은 9등급 환산값으로 비교하며, 합격 예측이 아닌 상담 참고자료입니다.</span></div>
    <div style={{display:"grid",gap:12,padding:15,background:"#fff",border:`1px solid ${COLORS.line}`,borderRadius:13}}>
      <div style={{display:"grid",gap:7}}>
        <b style={{fontSize:12.5}}>성적 비교 범위</b>
        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
          {[0.3,0.5,1].map(value=><button type="button" key={value} className={`admission-range-button ${range===value?"is-active":""}`} onClick={()=>setRange(value)}>±{value.toFixed(1)}</button>)}
        </div>
      </div>
      <div style={{display:"grid",gap:7}}>
        <b style={{fontSize:12.5}}>계열</b>
        <div className="admission-filter-options">
          {["전체",...fields].map(value=><button type="button" key={value} className={`admission-filter-chip ${field===value?"is-active":""}`} onClick={()=>setField(value)}>{value}</button>)}
        </div>
      </div>
    </div>
    <SummaryCards rows={similar}/>
    <div style={styles.context}>현재 9등급 비교값 <b>{fmt(profile.converted)}</b>에서 ±{range.toFixed(1)} 범위의 지원 사례는 <b>{similar.length}건</b>, 합격 사례는 <b>{similar.filter(x=>x.finalResult==="합격").length}건</b>입니다.</div>
    <Section title="대학별 유사 사례" description="표본이 적은 대학은 비율보다 사례 수를 우선 확인하세요.">
      {stats.length?<div style={styles.caseCards}>{stats.map(stat=><div key={stat.label} style={styles.caseCard}><div style={styles.caseCardHead}><b>{stat.label}</b><span>{stat.total>=20?"사례 충분":stat.total>=10?"참고 가능":stat.total>=5?"사례 적음":"해석 주의"}</span></div><div style={styles.caseCounts}><span>지원 <b>{stat.total}</b></span><span>합격 <b>{stat.accepted}</b></span><span>불합격 <b>{stat.rejected}</b></span></div><small>합격 사례 중앙값 <b>{fmt(stat.median)}</b></small></div>)}</div>:<Empty title="선택한 범위의 유사 사례가 없습니다." text="성적 범위를 넓히거나 계열을 전체로 바꿔보세요."/>}
    </Section>
  </div>;
}

function Bars({rows}){const max=Math.max(1,...rows.map(x=>x.total));return <div style={{display:"grid",gap:9}}>{rows.map(row=><div key={row.label} style={styles.barRow}><span>{row.label}</span><div style={styles.barTrack}><div style={{...styles.barFill,width:`${Math.max(2,row.total/max*100)}%`}}/></div><b>{row.total}</b><small>합격 {row.accepted}</small></div>)}</div>}
function Overview({rows}){const types=useMemo(()=>groupStats(rows,x=>x.admissionType).slice(0,10),[rows]);const regions=useMemo(()=>groupStats(rows,x=>x.region).slice(0,12),[rows]);const grades=useMemo(()=>groupStats(rows.filter(x=>x.gradeBand),x=>`${x.gradeBand}등급대`).sort((a,b)=>parseFloat(a.label)-parseFloat(b.label)),[rows]);return <div style={{display:"grid",gap:16}}><SummaryCards rows={rows}/><div className="admission-case-two" style={styles.twoColumns}><Section title="전형별 지원 사례"><Bars rows={types}/></Section><Section title="지역별 지원 사례"><Bars rows={regions}/></Section></div><Section title="등급대별 결과"><Table><thead><tr><th>등급대</th><th>지원</th><th>최초합</th><th>충원합</th><th>불합격</th><th>합격 중앙값</th></tr></thead><tbody>{grades.map(row=><tr key={row.label}><td><b>{row.label}</b></td><td>{row.total}</td><td>{row.first}</td><td>{row.waitlist}</td><td>{row.rejected}</td><td>{fmt(row.median)}</td></tr>)}</tbody></Table></Section></div>}

function UniversityAnalysis({rows}){const[query,setQuery]=useState("");const[selected,setSelected]=useState("");const universities=useMemo(()=>groupStats(rows,x=>x.universityNormalized||x.university).filter(x=>x.label.toLowerCase().includes(query.toLowerCase())).slice(0,100),[rows,query]);const selectedRows=useMemo(()=>selected?rows.filter(x=>(x.universityNormalized||x.university)===selected):[],[rows,selected]);const details=useMemo(()=>groupStats(selectedRows,x=>`${x.department} · ${x.detailType}`),[selectedRows]);const acceptedGrades=selectedRows.filter(x=>x.finalResult==="합격").map(x=>x.universityGrade??x.overallGrade);return <div style={{display:"grid",gap:13}}><SearchBox value={query} onChange={setQuery} placeholder="대학명 검색" count={`${universities.length}개 대학`}/><div className="admission-case-university" style={styles.universityGrid}><div style={styles.universityList}>{universities.map(row=><button key={row.label} onClick={()=>setSelected(row.label)} style={{...styles.universityButton,...(selected===row.label?styles.universityButtonActive:{})}}><b>{row.label}</b><span>지원 {row.total} · 합격 {row.accepted}</span></button>)}</div><div style={styles.universityDetail}>{!selected?<Empty title="대학을 선택하세요."/>:<><div style={styles.universityHead}><div><b>{selected}</b><span>광덕고 통합 지원 사례</span></div><div style={styles.studentMetrics}><span>지원 <b>{selectedRows.length}</b></span><span>합격 <b>{selectedRows.filter(x=>x.finalResult==="합격").length}</b></span><span>중앙값 <b>{fmt(median(acceptedGrades))}</b></span><span>25~75% <b>{fmt(percentile(acceptedGrades,.25))}~{fmt(percentile(acceptedGrades,.75))}</b></span></div></div><Table><thead><tr><th>모집단위·전형</th><th>지원</th><th>최초합</th><th>충원합</th><th>불합격</th><th>합격 중앙값</th></tr></thead><tbody>{details.map(row=><tr key={row.label}><td style={{textAlign:"left"}}>{row.label}</td><td>{row.total}</td><td>{row.first}</td><td>{row.waitlist}</td><td>{row.rejected}</td><td>{fmt(row.median)}</td></tr>)}</tbody></Table></>}</div></div></div>}

function DimensionAnalysis({rows}){const[mode,setMode]=useState("등급별");const getter=mode==="지역별"?x=>x.region:mode==="계열별"?x=>x.field:mode==="전형별"?x=>x.admissionType:x=>x.gradeBand?`${x.gradeBand}등급대`:"등급 미입력";let stats=useMemo(()=>groupStats(rows,getter),[rows,mode]);if(mode==="등급별")stats=[...stats].sort((a,b)=>(parseFloat(a.label)||99)-(parseFloat(b.label)||99));return <div style={{display:"grid",gap:13}}><div style={styles.modeTabs}>{["등급별","지역별","계열별","전형별"].map(value=><button key={value} onClick={()=>setMode(value)} style={{...styles.modeButton,...(mode===value?styles.modeButtonActive:{})}}>{value}</button>)}</div><Table><thead><tr><th>{mode.replace("별","")}</th><th>지원 사례</th><th>최초합</th><th>충원합</th><th>불합격</th><th>합격 사례 비율</th><th>합격 중앙값</th></tr></thead><tbody>{stats.map(row=><tr key={row.label}><td><b>{row.label}</b></td><td>{row.total}</td><td>{row.first}</td><td>{row.waitlist}</td><td>{row.rejected}</td><td>{row.total>=5?`${fmt(row.rate,1)}%`:<span style={{color:COLORS.gold,fontWeight:900}}>사례 적음</span>}</td><td>{fmt(row.median)}</td></tr>)}</tbody></Table></div>}

function CaseSearch({rows}){const[query,setQuery]=useState("");const[page,setPage]=useState(1);const filtered=useMemo(()=>rows.filter(x=>textMatch(x,query)),[rows,query]);useEffect(()=>setPage(1),[query,rows.length]);const max=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));const visible=filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);return <div style={{display:"grid",gap:12}}><SearchBox value={query} onChange={setQuery} placeholder="대학·학과·전형 검색" count={`${filtered.length.toLocaleString()}건`}/><Table minWidth={980}><thead><tr><th>대학</th><th>모집단위</th><th>지역·계열</th><th>전형</th><th>전교과</th><th>대학 환산</th><th>수능 평균</th><th>최종 결과</th><th>등록</th></tr></thead><tbody>{visible.map(row=><tr key={row.caseId}><td><b>{row.university}</b></td><td style={{textAlign:"left"}}>{row.department}</td><td>{row.region}<br/><small>{row.field}</small></td><td style={{textAlign:"left"}}>{row.admissionType}<br/><small>{row.detailType}</small></td><td>{fmt(row.overallGrade)}</td><td>{fmt(row.universityGrade)}</td><td>{fmt(row.csatAverage)}</td><td><span style={{...styles.badge,...resultStyle(row.finalResultDetail)}}>{row.finalResultDetail}</span></td><td>{row.registered}</td></tr>)}</tbody></Table><div style={styles.pagination}><button disabled={page<=1} onClick={()=>setPage(x=>x-1)}>이전</button><span>{page} / {max}</span><button disabled={page>=max} onClick={()=>setPage(x=>x+1)}>다음</button></div></div>}

export function AdmissionCaseAnalytics({gdb,roster={},currentGrade="2",selectedStudentSid,onSelectedStudentSidChange,selectedStudentQuery,onSelectedStudentQueryChange}){const cases=gdb?.admissionCases||[];const[tab,setTab]=useState("student");const[localSid,setLocalSid]=useState("");const[localQuery,setLocalQuery]=useState("");const sid=selectedStudentSid!==undefined?selectedStudentSid:localSid;const query=selectedStudentQuery!==undefined?selectedStudentQuery:localQuery;const setSid=value=>selectedStudentSid!==undefined?onSelectedStudentSidChange?.(value):setLocalSid(value);const setQuery=value=>selectedStudentQuery!==undefined?onSelectedStudentQueryChange?.(value):setLocalQuery(value);const profile=useMemo(()=>studentProfile(sid,roster,gdb,currentGrade),[sid,roster,gdb,currentGrade]);const[filters,setFilters]=useState({query:"",regions:[],fields:[],schoolTypes:[],admissionTypes:[],results:[],minGrade:"",maxGrade:""});const filtered=useMemo(()=>applyFilters(cases,filters),[cases,filters]);if(!cases.length)return <Empty title="아직 저장된 대입 사례 데이터가 없습니다." text="관리자 → 성적 데이터 → 2024–2026 대입 사례 데이터에서 엑셀을 업로드하세요."/>;return <div className="admission-case-ui" style={styles.page}><style>{CSS}</style><div style={styles.hero}><div><small>광덕고 상담 지원 자료</small><h2>2024–2026 광덕고 대입 결과</h2><p>과거 졸업생의 통합 지원 사례를 등급·지역·전형별로 분석합니다. 학생 수가 아니라 지원 사례 수입니다.</p></div><div style={styles.heroMeta}><b>{cases.length.toLocaleString()}</b><span>통합 지원 사례</span></div></div><StudentConnector profile={profile} query={query} onQuery={setQuery} onSelect={setSid} roster={roster}/><div style={styles.tabs}>{[["student","학생 맞춤 분석"],["overview","전체 현황"],["university","대학·전형별"],["dimension","등급·지역별"],["search","사례 검색"]].map(([key,label])=><button key={key} onClick={()=>setTab(key)} style={{...styles.tab,...(tab===key?styles.tabActive:{})}}>{label}</button>)}</div><FilterPanel cases={cases} filters={filters} setFilters={setFilters} filteredCount={filtered.length}/><div style={styles.filteredCount}><Filter size={13}/>전체 {cases.length.toLocaleString()}건 중 현재 조건에 해당하는 사례 <b>{filtered.length.toLocaleString()}건</b></div>{filtered.length===0&&<div style={{display:"flex",alignItems:"center",gap:9,padding:"12px 14px",borderRadius:11,background:"#fff4ed",border:"1px solid #f1cfb7",color:"#8a4f25",fontSize:12}}><AlertTriangle size={16}/><span>조건에 해당하는 사례가 없습니다. 상단의 <b>전체 초기화</b>를 누르거나 선택 범위를 넓혀보세요.</span></div>}{tab==="student"&&<StudentMatch rows={filtered} profile={profile}/>} {tab==="overview"&&<Overview rows={filtered}/>} {tab==="university"&&<UniversityAnalysis rows={filtered}/>} {tab==="dimension"&&<DimensionAnalysis rows={filtered}/>} {tab==="search"&&<CaseSearch rows={filtered}/>}</div>}

function QualityCards({cases}){const summary=summarizeAdmissionCases(cases);const rows=[["연도 미입력",cases.filter(x=>x.admissionYear==null).length],["등록 여부 미입력",summary.registrationUnknown],["대학 환산등급 미입력",summary.universityGradeMissing],["수능 평균 미입력",summary.csatMissing],["전교과 미입력",cases.filter(x=>x.overallGrade==null).length]];return <div style={styles.qualityGrid}>{rows.map(([label,value])=><div key={label}><b>{value.toLocaleString()}</b><span>{label}</span></div>)}</div>}
export function AdmissionCaseAdmin({gdb,persistGrades,showToast,roster={},currentGrade="2"}){const[subtab,setSubtab]=useState("upload");const[preview,setPreview]=useState(null);const[source,setSource]=useState(null);const[loading,setLoading]=useState(false);const[saving,setSaving]=useState(false);const readFile=async file=>{setLoading(true);try{const XLSX=await import("xlsx");const workbook=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});const sheetName=workbook.SheetNames.find(name=>String(name).trim()==="작업용")||workbook.SheetNames.find(name=>/작업|원본|data/i.test(name));if(!sheetName)throw new Error("'작업용' 원본 시트를 찾지 못했습니다.");const rows=XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,defval:null,raw:true});const meta={sourceId:`admission_${Date.now().toString(36)}`,label:"2024~2026 통합",periodLabel:"2024~2026 통합",fileName:file.name,importedAt:new Date().toISOString(),sheetName,hasYearColumn:false};const cases=parseAdmissionCaseRows(rows,meta);if(!cases.length)throw new Error("지원 사례를 인식하지 못했습니다.");setPreview(cases);setSource({...meta,rowCount:cases.length})}catch(error){showToast?.(`대입 사례 파일을 읽지 못했습니다. (${error?.message||error})`,"error")}finally{setLoading(false)}};const save=async()=>{if(!preview||!source)return;setSaving(true);const ok=await persistGrades({admissionCaseSources:[{...source,updatedAt:new Date().toISOString()}],admissionCases:preview});setSaving(false);if(ok){showToast?.(`${preview.length.toLocaleString()}건의 대입 지원 사례를 저장했습니다.`,"success");setPreview(null);setSource(null);setSubtab("analytics")}};const clear=async()=>{if(!window.confirm("저장된 대입 사례 데이터를 모두 삭제할까요?"))return;const ok=await persistGrades({admissionCaseSources:[],admissionCases:[]});if(ok)showToast?.("대입 사례 데이터를 삭제했습니다.","success")};const stored=gdb.admissionCases||[];const sources=gdb.admissionCaseSources||[];return <div className="admission-case-ui" style={{display:"grid",gap:14}}><style>{CSS}</style><div style={styles.adminTabs}>{[["upload","파일 업로드·반영"],["analytics","데이터 현황·사례 탐색"],["history","업로드 이력"]].map(([key,label])=><button key={key} onClick={()=>setSubtab(key)} style={{...styles.adminTab,...(subtab===key?styles.adminTabActive:{})}}>{label}</button>)}</div>{subtab==="upload"&&<div style={{display:"grid",gap:14}}><div style={styles.uploadBox}><FileSpreadsheet size={30}/><div><b>2024–2026 대입 통계 엑셀 업로드</b><span>XLSX·XLSM 파일의 숨김 ‘작업용’ 시트를 자동 인식합니다.</span></div><label style={styles.fileButton}>{loading?<Loader2 size={15} className="spin"/>:<Upload size={15}/>} {loading?"파일 분석 중":"엑셀 파일 선택"}<input hidden type="file" accept=".xlsx,.xlsm,.xls" disabled={loading} onChange={e=>e.target.files?.[0]&&readFile(e.target.files[0])}/></label></div>{preview&&<><div style={styles.previewHeader}><div><b>{source.fileName}</b><span>{source.sheetName} 시트 · {preview.length.toLocaleString()}건 인식</span></div><em>연도 열 없음 · 2024~2026 통합 저장</em></div><SummaryCards rows={preview}/><Section title="데이터 품질 검사" description="빈값을 임의로 합격·미등록으로 변환하지 않습니다."><QualityCards cases={preview}/></Section><div style={styles.actions}><button style={styles.primaryButton} disabled={saving} onClick={save}>{saving?<Loader2 size={15} className="spin"/>:<Save size={15}/>}최종 반영</button><button style={styles.secondaryButton} onClick={()=>{setPreview(null);setSource(null)}}>취소</button></div></>}{!preview&&stored.length>0&&<div style={styles.savedNotice}><CheckCircle2 size={18}/><div><b>현재 {stored.length.toLocaleString()}건이 저장되어 있습니다.</b><span>새 파일을 반영하면 기존 통합 자료를 교체합니다.</span></div><button style={styles.dangerButton} onClick={clear}><Trash2 size={13}/>전체 삭제</button></div>}</div>}{subtab==="analytics"&&<AdmissionCaseAnalytics gdb={gdb} roster={roster} currentGrade={currentGrade}/>} {subtab==="history"&&<Section title="업로드 이력">{sources.length?<Table><thead><tr><th>자료명</th><th>원본 파일</th><th>원본 시트</th><th>사례 수</th><th>업로드 시각</th></tr></thead><tbody>{sources.map(item=><tr key={item.sourceId}><td>{item.label}</td><td>{item.fileName}</td><td>{item.sheetName}</td><td>{Number(item.rowCount||0).toLocaleString()}</td><td>{item.importedAt?new Date(item.importedAt).toLocaleString("ko-KR"):"-"}</td></tr>)}</tbody></Table>:<Empty title="업로드 이력이 없습니다."/>}</Section>}</div>}

const styles={page:{display:"grid",gap:16},hero:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:18,padding:"22px 24px",borderRadius:18,color:"#fff",background:"linear-gradient(135deg,#405e87,#6079a5 48%,#796d9c)",boxShadow:"0 12px 28px rgba(53,72,103,.18)"},heroMeta:{minWidth:116,padding:"13px 16px",borderRadius:14,background:"rgba(255,255,255,.14)",border:"1px solid rgba(255,255,255,.25)",textAlign:"center",display:"grid",gap:2},studentConnector:{display:"grid",gridTemplateColumns:"minmax(240px,.75fr) minmax(360px,1.4fr)",gap:12,padding:14,background:"#fff",border:`1px solid ${COLORS.line}`,borderRadius:15},label:{fontSize:11,fontWeight:900,color:"#6c675d"},input:{width:"100%",boxSizing:"border-box",border:"1px solid #ddd6c8",borderRadius:10,padding:"10px 12px",fontSize:13,outline:"none"},searchResults:{position:"absolute",zIndex:20,top:43,left:0,right:0,background:"#fff",border:"1px solid #d9d2c5",borderRadius:10,boxShadow:"0 12px 28px rgba(45,40,32,.14)",overflow:"hidden"},studentProfile:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:14,padding:"11px 14px",borderRadius:11,background:"#f4f7fb",border:"1px solid #dce4ef"},studentMetrics:{display:"flex",gap:7,flexWrap:"wrap",justifyContent:"flex-end"},studentPlaceholder:{display:"grid",placeItems:"center",border:"1px dashed #d8d1c3",borderRadius:11,color:COLORS.muted,fontSize:12},tabs:{display:"flex",gap:6,flexWrap:"wrap",padding:6,background:"#f2f0eb",borderRadius:13},tab:{border:0,background:"transparent",borderRadius:9,padding:"9px 13px",fontWeight:850,color:"#6d685e",cursor:"pointer"},tabActive:{background:"#fff",color:COLORS.blue,boxShadow:"0 2px 7px rgba(41,50,67,.12)"},filters:{background:"#fff",border:`1px solid ${COLORS.line}`,borderRadius:14,padding:14},filterHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:12},filterGrid:{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10,alignItems:"end"},filterSelect:{display:"grid",gridTemplateColumns:"70px minmax(0,1fr) 55px",gap:7,alignItems:"center",fontSize:11,fontWeight:850},advancedButton:{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:5,border:"1px solid #d9d2c5",borderRadius:9,background:"#fff",padding:"9px",fontWeight:850,cursor:"pointer"},gradeRange:{display:"flex",alignItems:"center",gap:7},smallButton:{display:"inline-flex",alignItems:"center",gap:5,border:"1px solid #d9d2c5",borderRadius:8,background:"#fff",padding:"7px 9px",fontWeight:800,cursor:"pointer"},filteredCount:{display:"flex",alignItems:"center",gap:6,fontSize:11.5,color:"#6e695f"},summary:{display:"grid",gridTemplateColumns:"repeat(6,minmax(0,1fr))",gap:9},summaryCard:{display:"grid",gap:4,padding:"13px 14px",border:`1px solid ${COLORS.line}`,borderTop:"4px solid",borderRadius:12,background:"#fff"},section:{background:"#fff",border:`1px solid ${COLORS.line}`,borderRadius:14,padding:16},sectionTitle:{display:"flex",justifyContent:"space-between",marginBottom:14},tableWrap:{width:"100%",overflowX:"auto",border:`1px solid ${COLORS.line}`,borderRadius:10},empty:{minHeight:210,display:"grid",placeItems:"center",alignContent:"center",gap:7,padding:25,border:"1px dashed #d8d1c3",borderRadius:14,background:"#fbfaf7",color:COLORS.muted,textAlign:"center"},notice:{display:"flex",gap:8,alignItems:"flex-start",padding:"11px 13px",borderRadius:10,background:"#fff8e8",border:"1px solid #efd89c",color:"#755b20",fontSize:11.5},matchControls:{display:"flex",gap:14,flexWrap:"wrap",padding:"13px 15px",background:"#fff",border:`1px solid ${COLORS.line}`,borderRadius:12},context:{padding:"12px 14px",borderRadius:11,background:"#f4f7fb",border:"1px solid #dce4ef",color:"#49566a",fontSize:12.5},caseCards:{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10},caseCard:{border:`1px solid ${COLORS.line}`,borderRadius:11,padding:12,display:"grid",gap:9},caseCardHead:{display:"flex",justifyContent:"space-between",gap:8},caseCounts:{display:"flex",gap:8,flexWrap:"wrap",fontSize:11},twoColumns:{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:14},barRow:{display:"grid",gridTemplateColumns:"100px minmax(100px,1fr) 40px 55px",alignItems:"center",gap:8},barTrack:{height:9,borderRadius:999,background:"#ece9e2",overflow:"hidden"},barFill:{height:"100%",borderRadius:999,background:"linear-gradient(90deg,#4e73a6,#8b79ad)"},searchBox:{display:"flex",alignItems:"center",gap:9,border:`1px solid ${COLORS.line}`,borderRadius:11,background:"#fff",padding:"9px 12px"},universityGrid:{display:"grid",gridTemplateColumns:"260px minmax(0,1fr)",gap:12},universityList:{maxHeight:570,overflowY:"auto",display:"grid",gap:5,alignContent:"start"},universityButton:{display:"grid",gap:3,textAlign:"left",padding:"9px 10px",border:`1px solid ${COLORS.line}`,background:"#fff",borderRadius:9,cursor:"pointer"},universityButtonActive:{borderColor:COLORS.blue,background:"#edf3ff"},universityDetail:{minWidth:0,background:"#fff",border:`1px solid ${COLORS.line}`,borderRadius:12,padding:14},universityHead:{display:"flex",justifyContent:"space-between",gap:12,marginBottom:13},modeTabs:{display:"flex",gap:6,flexWrap:"wrap"},modeButton:{border:"1px solid #ddd6c8",background:"#fff",borderRadius:9,padding:"8px 13px",fontWeight:850,cursor:"pointer"},modeButtonActive:{background:COLORS.blue,borderColor:COLORS.blue,color:"#fff"},badge:{display:"inline-flex",alignItems:"center",justifyContent:"center",border:"1px solid",borderRadius:999,padding:"4px 8px",fontSize:10.5,fontWeight:850,whiteSpace:"nowrap"},pagination:{display:"flex",justifyContent:"center",alignItems:"center",gap:10},adminTabs:{display:"flex",gap:6,flexWrap:"wrap",padding:6,background:"#f2f0eb",borderRadius:12},adminTab:{border:0,background:"transparent",padding:"9px 13px",borderRadius:8,fontWeight:850,cursor:"pointer"},adminTabActive:{background:"#2f4630",color:"#fff"},uploadBox:{minHeight:150,display:"flex",alignItems:"center",justifyContent:"center",gap:16,padding:20,border:"1px dashed #cfc7b8",borderRadius:14,background:"#fff"},fileButton:{display:"inline-flex",alignItems:"center",gap:6,background:COLORS.blue,color:"#fff",borderRadius:9,padding:"10px 13px",fontWeight:850,cursor:"pointer"},previewHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,padding:"12px 14px",border:`1px solid ${COLORS.line}`,borderRadius:11,background:"#fff"},qualityGrid:{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:8},actions:{display:"flex",gap:8,justifyContent:"flex-end"},primaryButton:{display:"inline-flex",alignItems:"center",gap:6,border:0,borderRadius:9,background:"#2f5b3a",color:"#fff",padding:"10px 14px",fontWeight:850,cursor:"pointer"},secondaryButton:{border:"1px solid #d9d2c5",borderRadius:9,background:"#fff",padding:"10px 14px",fontWeight:850,cursor:"pointer"},dangerButton:{display:"inline-flex",alignItems:"center",gap:5,border:"1px solid #ebc5c0",background:"#fff4f2",color:COLORS.red,borderRadius:8,padding:"7px 9px",fontWeight:850,cursor:"pointer"},savedNotice:{display:"flex",alignItems:"center",gap:10,padding:14,border:"1px solid #cce1d1",borderRadius:11,background:"#f1f8f2"}};
