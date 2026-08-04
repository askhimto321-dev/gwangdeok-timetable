import React, { useEffect, useMemo, useState } from "react";
import { Upload, FileSpreadsheet, Loader2, Save, Trash2, Search, GraduationCap, Database, AlertTriangle, CheckCircle2, Filter, RotateCcw, ChevronUp, ChevronDown, ArrowLeft, ChevronRight, Star, ExternalLink } from "lucide-react";
import { computeAllGroupAverages, computeMockExamSums, grade5to9, parseAdmissionCaseRows, summarizeAdmissionCases } from "./gradeEngine.js";

const SEMESTERS=["1-1","1-2","2-1","2-2","3-1","3-2"];
const MOCKS=["1-3","1-6","1-9","1-10","2-3","2-6","2-9","3-3","3-6","3-9"];
const PAGE_SIZE=50;
const COLORS={blue:"#315a9b",green:"#39724c",purple:"#6b4f91",red:"#9a3f3f",gold:"#8a641d",line:"#e2ded3",muted:"#777167"};
const CSS=`
.admission-case-ui{
  font-family:Pretendard,"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  color:#202832;
  letter-spacing:-.015em;
  line-height:1.45;
  font-size:14px;
}
.admission-case-ui *{box-sizing:border-box}
.admission-case-ui h2,.admission-case-ui h3,.admission-case-ui h4,.admission-case-ui p{margin:0}
.admission-case-ui h2{font-size:24px;line-height:1.25;font-weight:800}
.admission-case-ui h3{font-size:18px;line-height:1.35;font-weight:800}
.admission-case-ui table{width:100%;border-collapse:collapse;text-align:center;font-size:13px;line-height:1.4}
.admission-case-ui th,.admission-case-ui td{border-right:1px solid #e5e0d6;border-bottom:1px solid #e5e0d6;padding:10px 9px;vertical-align:middle;word-break:keep-all}
.admission-case-ui th{background:#f4f2ed;font-weight:800;white-space:nowrap;color:#303741}
.admission-case-ui td{color:#313842}
.admission-case-ui th:last-child,.admission-case-ui td:last-child{border-right:0}
.admission-case-ui input,.admission-case-ui select,.admission-case-ui button{font:inherit}
.admission-case-ui button:disabled{opacity:.45;cursor:not-allowed}
.admission-case-ui [style*="studentMetrics"]{}
.admission-case-ui small{line-height:1.35}
.admission-student-profile-badges span{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;background:#fff;border:1px solid #dbe3ef;color:#5b6879;font-size:10.5px;font-weight:800;white-space:nowrap}
.admission-student-score-groups{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;min-width:0;width:100%;max-width:100%;align-content:center}
.admission-student-score-group{display:grid;grid-template-columns:62px minmax(0,1fr);align-items:center;gap:8px;padding:8px;border-radius:11px;border:1px solid #dce3ed;background:#fff;min-width:0;max-width:100%;overflow:hidden}
.admission-student-score-group>strong{font-size:10.5px;color:#536379;letter-spacing:.02em;white-space:nowrap;text-align:center}
.admission-student-metrics{display:grid;gap:7;min-width:0}
.admission-student-metrics.is-school{grid-template-columns:repeat(2,minmax(0,1fr))}
.admission-student-metrics.is-mock{grid-template-columns:repeat(3,minmax(0,1fr))}
.admission-student-metrics>div{display:grid;gap:3px;align-content:center;min-height:48px;padding:6px 7px;border-radius:9px;background:#f8fafc;border:1px solid #e0e6ef;text-align:center;min-width:0;overflow:hidden}
.admission-student-metrics small{font-size:9.2px;color:#778395;font-weight:800;white-space:normal;word-break:keep-all;line-height:1.2}
.admission-student-metrics b{font-size:14.5px;color:#263345;white-space:nowrap;line-height:1.15}
.admission-case-search button{display:block;width:100%;padding:9px 11px;border:0;background:#fff;text-align:left;cursor:pointer;font-size:13px}
.admission-case-search button:hover{background:#edf3ff}
.admission-favorite-button{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9px;border:1px solid #dce2eb;background:#fff;color:#8993a0;cursor:pointer;flex:0 0 auto}
.admission-favorite-button:hover{border-color:#f0c94d;background:#fffaf0;color:#c69600}
.admission-favorite-button.is-active{background:#0f1a2e;border-color:#0f1a2e;color:#ffd84d}
.admission-favorite-button svg{fill:currentColor}
.admission-link-button{display:inline-flex;align-items:center;gap:4px;border:1px solid #d5deea;background:#fff;color:#315a86;border-radius:8px;padding:5px 8px;font-size:10.5px;font-weight:850;cursor:pointer}
.admission-link-button:hover{background:#edf3fb}
.admission-filter-chip{
  display:inline-flex;align-items:center;justify-content:center;gap:5px;
  min-height:34px;padding:7px 12px;border:1px solid #d7dfe9;border-radius:999px;
  background:#fff;color:#465466;font-size:12.5px;font-weight:700;cursor:pointer;
  transition:transform .15s,background .15s,border-color .15s,color .15s,box-shadow .15s;
  white-space:nowrap;
}
.admission-filter-chip:hover{transform:translateY(-1px);border-color:#8ca6c4;background:#f6f9fc}
.admission-filter-chip.is-active{background:#315f95;border-color:#315f95;color:#fff;box-shadow:0 4px 10px rgba(49,95,149,.18)}
.admission-filter-group{display:grid;gap:10px;padding:13px;border:1px solid #e1e6ec;border-radius:14px;background:#fafcfe}
.admission-filter-options{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.admission-filter-group.is-region .admission-filter-options{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:8px}
.admission-filter-group.is-region .admission-filter-chip{width:100%;padding-left:6px;padding-right:6px}
.admission-filter-group.is-field{background:linear-gradient(135deg,#f8fbff,#fbf9ff);border-color:#dce4ef}
.admission-filter-group.is-field .admission-filter-options{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
.admission-filter-group.is-field .admission-filter-chip{width:100%;min-height:38px}
.admission-filter-group.is-field .admission-filter-chip.is-active{background:linear-gradient(135deg,#315f95,#5d69a4);border-color:transparent}
.admission-filter-group.is-admission-type{background:linear-gradient(135deg,#f8fbff,#fcfbff);border-color:#dce4ef}
.admission-filter-priority{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.admission-filter-secondary-options{display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
.admission-filter-priority .admission-filter-chip,.admission-filter-secondary-options .admission-filter-chip{width:100%;min-height:38px}
.admission-filter-priority .admission-filter-chip{background:#f5f8fd;border-color:#cdd9ea;color:#294c76}
.admission-filter-priority .admission-filter-chip.is-active{background:linear-gradient(135deg,#294f7f,#536e9a);border-color:transparent;color:#fff}
.admission-filter-secondary-options .admission-filter-chip.is-active{background:#5b6374;border-color:#5b6374;color:#fff}
.admission-cut-arrow{display:inline-flex;align-items:center;justify-content:center;gap:4px;white-space:nowrap;font-weight:900}
.admission-holistic-notice{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:10px;background:#fff8e8;border:1px solid #ecd69e;color:#755b20;font-size:11.5px;line-height:1.45}
.admission-university-picker{display:grid;grid-template-columns:minmax(240px,1fr) minmax(250px,.9fr);gap:10px;align-items:end}
.admission-university-picker select{width:100%;height:42px;border:1px solid #cfd8e5;border-radius:11px;background:#fff;padding:0 12px;font-weight:800;color:#2d3948;outline:none}
.admission-university-picker select:focus{border-color:#6e8db8;box-shadow:0 0 0 3px rgba(64,101,151,.12)}
.admission-range-button{
  min-width:66px;padding:8px 13px;border:1px solid #d5deea;border-radius:10px;
  background:#fff;color:#465466;font-size:13px;font-weight:700;cursor:pointer;
}
.admission-range-button.is-active{background:#334f78;border-color:#334f78;color:#fff;box-shadow:0 3px 8px rgba(51,79,120,.18)}
.admission-filter-primary,.admission-filter-secondary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.admission-case-count-pill{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:5px 9px;font-size:11.5px;font-weight:800;white-space:nowrap}
.admission-case-count-pill.support{background:#edf3ff;color:#315a9b;border:1px solid #cfdbef}
.admission-case-count-pill.accept{background:#edf8f0;color:#2f7347;border:1px solid #c7e4cf}
.admission-case-count-pill.reject{background:#fff0f0;color:#9a3f3f;border:1px solid #efcaca}
.admission-case-count-pill.first{background:#eef4ff;color:#315a9b;border:1px solid #cedbef}
.admission-case-count-pill.wait{background:#f4effb;color:#6b4f91;border:1px solid #d9cdeb}
.admission-case-comparison{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.admission-case-comparison>div{display:grid;gap:2px;padding:9px 10px;border-radius:10px;background:#f7f9fc;border:1px solid #e0e6ef}
.admission-case-comparison small{color:#6e7785;font-size:10.5px;font-weight:700}
.admission-case-comparison b{font-size:14px}
.admission-comparison-summary>div,.admission-detail-compare>div,.admission-detail-metrics>div{display:grid;gap:5px;align-content:center;min-width:0}
.admission-comparison-summary small,.admission-detail-compare small,.admission-detail-metrics small{display:block;color:#6f7b8b;font-size:10px;font-weight:850;line-height:1.35}
.admission-comparison-summary b,.admission-detail-compare b,.admission-detail-metrics b{display:block;font-size:15px;line-height:1.2;white-space:nowrap}
.admission-comparison-summary>div{padding:10px 11px;border-radius:10px;background:#fff;border:1px solid #dfe5ee}
.admission-detail-compare>div{padding:10px 11px;border-radius:10px;background:#f7f9fc;border:1px solid #e0e6ef;text-align:center}
.admission-detail-metrics>div{padding:10px 11px;border-radius:10px;background:#fbfcfe;border:1px solid #e3e7ed;text-align:center}
.admission-case-ui .metric-card{}
.admission-search-shell{display:flex;align-items:center;gap:10px;border:1px solid #cfd9e7;border-radius:13px;background:#fff;padding:10px 12px;box-shadow:0 4px 14px rgba(48,65,88,.06)}
.admission-search-shell input{flex:1;min-width:0;border:0;outline:0;background:transparent;font-size:13.5px;font-weight:650;color:#273344}
.admission-search-count{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;background:#eef3fa;color:#315a86;padding:4px 9px;font-size:11px;font-weight:900;white-space:nowrap}
.admission-university-card{transition:transform .15s,box-shadow .15s,border-color .15s;background:#fff;text-align:left;width:100%;font:inherit;color:inherit;cursor:pointer}
.admission-university-card:focus-visible{outline:3px solid rgba(49,95,149,.22);outline-offset:2px}
.admission-sample-badge{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:5px 9px;background:#20242a;color:#ffd45d;border:1px solid #20242a;font-size:10px;font-weight:900;line-height:1;white-space:nowrap;box-shadow:0 3px 8px rgba(20,24,29,.13)}
.admission-band-badge{display:inline-flex;align-items:center;justify-content:center;border-radius:8px;padding:5px 9px;font-size:11px;font-weight:900;line-height:1;white-space:nowrap;border:1px solid}
.admission-detail-table{table-layout:fixed}
.admission-detail-table td,.admission-detail-table th{overflow-wrap:anywhere}
.admission-grade-row-1 td{background:#f0f7ff}
.admission-grade-row-1 td:first-child{background:#315f95;color:#fff}
.admission-grade-row-2 td{background:#f5f8ff}
.admission-grade-row-2 td:first-child{background:#dbe8fb;color:#274d7a}
.admission-grade-row-1 td:first-child,.admission-grade-row-2 td:first-child{font-weight:900}
.admission-university-choice-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;max-height:210px;overflow-y:auto;padding:2px 3px 4px 0}
.admission-university-choice-grid button{min-width:0}
.admission-rate-meter{height:5px;border-radius:99px;background:#ebe8e1;overflow:hidden;margin-top:4px}
.admission-rate-meter>span{display:block;height:100%;border-radius:99px}
.admission-case-ui [style*="bandLegend"]{}
.admission-case-ui .admission-band-legend-item{}
.admission-university-card:hover{transform:translateY(-2px);box-shadow:0 7px 18px rgba(44,59,81,.09);border-color:#c4cfdd}
.admission-mode-button{min-width:92px}
@media(max-width:1000px){
  .admission-filter-group.is-region .admission-filter-options{grid-template-columns:repeat(6,minmax(0,1fr))}
  .admission-filter-group.is-field .admission-filter-options{grid-template-columns:repeat(4,minmax(0,1fr))}
}
@media(max-width:900px){
  .admission-student-score-groups{grid-template-columns:1fr}
  .admission-student-score-group{grid-template-columns:56px minmax(0,1fr)}
  .admission-case-summary{grid-template-columns:repeat(3,minmax(0,1fr))!important}
  .admission-case-two{grid-template-columns:1fr!important}
  .admission-case-student{grid-template-columns:1fr!important}
  .admission-student-profile{grid-template-columns:1fr!important}
  .admission-case-university{grid-template-columns:1fr!important}
  .admission-filter-primary,.admission-filter-secondary{grid-template-columns:1fr}
  .admission-case-comparison{grid-template-columns:1fr}
  .admission-university-choice-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .admission-university-picker{grid-template-columns:1fr}
}
@media(max-width:640px){
  .admission-case-summary{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .admission-filter-group.is-region .admission-filter-options{grid-template-columns:repeat(3,minmax(0,1fr))}
  .admission-filter-group.is-field .admission-filter-options{grid-template-columns:repeat(2,minmax(0,1fr))}
  .admission-university-choice-grid{grid-template-columns:1fr}
  .admission-filter-priority{grid-template-columns:1fr}
  .admission-filter-secondary-options{grid-template-columns:repeat(2,minmax(0,1fr))}
  .admission-student-score-group{grid-template-columns:1fr}
  .admission-student-score-group>strong{text-align:left;padding-left:2px}
}
`

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
function caseSufficiency(total){
  if(total>=20)return{label:"표본 충분",detail:"20건 이상"};
  if(total>=10)return{label:"표본 보통",detail:"10~19건"};
  if(total>=5)return{label:"표본 제한",detail:"5~9건"};
  return{label:"표본 주의",detail:"4건 이하"};
}
function signedGradeGap(studentGrade,cutGrade){
  const student=num(studentGrade),cut=num(cutGrade);
  if(student==null||cut==null)return null;
  return Math.round((student-cut)*100)/100;
}
function gradeDifference(studentGrade,cutGrade){
  const diff=signedGradeGap(studentGrade,cutGrade);
  if(diff==null)return{label:"-",detail:"비교 불가",color:"#777167",background:"#f3f1ed"};
  if(Math.abs(diff)<0.05)return{label:"±0.0",detail:"합격자 50%컷과 유사",color:"#315a9b",background:"#edf3ff"};
  const label=`${diff>0?"+":""}${fmt(diff)}`;
  return diff<0
    ?{label,detail:`50%컷보다 ${fmt(Math.abs(diff))}등급 앞`,color:"#2f7347",background:"#edf8f0"}
    :{label,detail:`50%컷보다 ${fmt(diff)}등급 뒤`,color:"#9a3f3f",background:"#fff0f0"};
}
function normalizeUniversityLink(value){return String(value||"").replace(/대학교/g,"대").replace(/\s+/g,"").replace(/[()·ㆍ.\-]/g,"").toLowerCase()}
function favoriteId(item){return [item?.source||"case",normalizeUniversityLink(item?.university),String(item?.department||"전체"),String(item?.admissionType||"")].join("|")}
function isFavorite(items,item){const id=favoriteId(item);return (items||[]).some(value=>favoriteId(value)===id)}
function applicationBand(studentGrade,cutGrade){
  const student=num(studentGrade),cut=num(cutGrade);
  if(student==null||cut==null)return{label:"판단 보류",detail:"50%컷 자료 부족",color:"#656b75",background:"#f1f3f5",border:"#d9dde2"};
  const diff=student-cut;
  if(diff>0.5)return{label:"상향",detail:"50%컷보다 0.5등급 초과 뒤",color:"#9c3f45",background:"#fff0f1",border:"#efc8cb"};
  if(diff>0.2)return{label:"소신",detail:"50%컷보다 0.2~0.5등급 뒤",color:"#9a5f22",background:"#fff4e7",border:"#edcfaa"};
  if(diff>=-0.2)return{label:"적정",detail:"50%컷 ±0.2등급",color:"#6f5a17",background:"#fff8d9",border:"#eadb91"};
  if(diff>=-0.5)return{label:"안정",detail:"50%컷보다 0.2~0.5등급 앞",color:"#2f6d4b",background:"#edf8f1",border:"#c7e3d1"};
  return{label:"하향",detail:"50%컷보다 0.5등급 초과 앞",color:"#365a8a",background:"#edf3ff",border:"#cad8ef"};
}
function acceptanceRateMeta(rate){
  const value=Number(rate)||0;
  if(value>=50)return{color:"#2f7347",background:"#edf8f0",border:"#c7e4cf"};
  if(value>=30)return{color:"#8a641d",background:"#fff7e5",border:"#ecd7a6"};
  return{color:"#9a3f3f",background:"#fff0f0",border:"#efcaca"};
}
function registrationDisplay(row){if(row?.finalResult==="불합격")return{label:"-",color:"#8a857a",background:"transparent"};if(row?.registered==="등록")return{label:"등록",color:"#2f7347",background:"#edf8f0"};if(row?.registered==="미등록")return{label:"미등록",color:"#8a641d",background:"#fff6df"};return{label:"미입력",color:"#777167",background:"#f3f1ed"}}
function buildUniversityDetails(rows){const map=new Map();for(const row of rows){const department=row.department||"모집단위 미입력";const type=row.detailType&&row.detailType!=="미지정"?row.detailType:(row.admissionType||"전형 미입력");const key=`${department}|||${type}`;if(!map.has(key))map.set(key,{department,type,items:[]});map.get(key).items.push(row)}return Array.from(map.values()).map(group=>{const accepted=group.items.filter(x=>x.finalResult==="합격");return{department:group.department,type:group.type,total:group.items.length,accepted:accepted.length,first:group.items.filter(x=>x.finalResultDetail==="최초합격").length,waitlist:group.items.filter(x=>x.finalResultDetail==="충원합격").length,rejected:group.items.filter(x=>x.finalResult==="불합격").length,rate:group.items.length?accepted.length/group.items.length*100:null,median:median(accepted.map(x=>x.universityGrade??x.overallGrade))}}).sort((a,b)=>b.total-a.total||a.department.localeCompare(b.department,"ko"))}
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
function Table({children,minWidth=0,style=null,className=""}){return <div style={styles.tableWrap}><table className={className} style={{minWidth,...(style||{})}}>{children}</table></div>}
function Empty({title,text,icon=<Database size={28}/>}){return <div style={styles.empty}>{icon}<b>{title}</b>{text&&<span>{text}</span>}</div>}
function SearchBox({value,onChange,placeholder,count}){return <div className="admission-search-shell"><Search size={17} color="#607087"/><input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>{count&&<span className="admission-search-count">{count}</span>}</div>}
function RateBand({rate,total,compact=false}){
  const meta=acceptanceRateMeta(rate);
  return <div style={{display:"grid",gap:compact?2:4,justifyItems:"center"}} title={`지원 ${total||0}건 중 합격 사례 비율`}>
    <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",padding:compact?"4px 7px":"5px 9px",borderRadius:999,border:`1px solid ${meta.border}`,background:meta.background,color:meta.color,fontWeight:900,fontSize:compact?10:12,whiteSpace:"nowrap"}}>합격 {fmt(rate,1)}%</span>
    {!compact&&<div className="admission-rate-meter" style={{width:92}}><span style={{width:`${Math.max(0,Math.min(100,Number(rate)||0))}%`,background:meta.color}}/></div>}
  </div>;
}

function StudentConnector({profile,query,onQuery,onSelect,roster}){
  const hits=useMemo(()=>{
    const q=String(query||"").trim().toLowerCase();
    return q?Object.entries(roster||{}).filter(([sid,info])=>`${sid} ${info?.name||""}`.toLowerCase().includes(q)).slice(0,8):[];
  },[query,roster]);
  return <div className="admission-case-student" style={styles.studentConnector}>
    <div style={styles.studentSearchPanel}>
      <label style={styles.label}>학생 성적 연동</label>
      <div style={{position:"relative"}}>
        <Search size={16} style={{position:"absolute",left:12,top:12,color:"#748094"}}/>
        <input style={{...styles.input,paddingLeft:36,height:42}} value={query||""} onChange={e=>onQuery(e.target.value)} placeholder="학번 또는 이름 검색"/>
        {hits.length>0&&<div className="admission-case-search" style={styles.searchResults}>{hits.map(([sid,info])=><button key={sid} onClick={()=>{onSelect(sid);onQuery(sid)}}><b>{sid}</b> {info?.name}</button>)}</div>}
      </div>
    </div>
    {profile?<div className="admission-student-profile" style={styles.studentProfile}>
      <div style={styles.studentProfileIdentity}>
        <span style={styles.studentProfileEyebrow}>선택 학생</span>
        <div style={styles.studentProfileTitle}><b>{profile.sid}</b><strong>{profile.name}</strong></div>
        <div className="admission-student-profile-badges" style={styles.studentProfileBadges}>
          <span>{profile.entryYear}학년도 입학생</span><span>{profile.gradeSystem}등급제</span><span>{profile.grade}학년</span>
        </div>
      </div>
      <div className="admission-student-score-groups">
        <div className="admission-student-score-group"><strong>내신</strong><div className="admission-student-metrics is-school">
          <div><small>현재 내신</small><b>{fmt(profile.average)}</b></div>
          <div><small>환산 등급</small><b style={{color:COLORS.blue}}>{fmt(profile.converted)}</b></div>
        </div></div>
        <div className="admission-student-score-group"><strong>모의고사</strong><div className="admission-student-metrics is-mock">
          <div><small>2합</small><b>{profile.sums?.sum2??"-"}</b></div>
          <div><small>3합</small><b>{profile.sums?.sum3??"-"}</b></div>
          <div><small>4합</small><b>{profile.sums?.sum4??"-"}</b></div>
        </div></div>
      </div>
    </div>:<div style={styles.studentPlaceholder}>학생을 선택하면 현재 성적과 과거 사례를 연결합니다.</div>}
  </div>;
}

function toggleSelection(values,option){
  return values.includes(option)?values.filter(item=>item!==option):[...values,option];
}

function FilterChipGroup({label,options,value,onChange,compact=false,kind="default",priorityOptions=[]}){
  const className=`admission-filter-group ${kind==="region"?"is-region":""} ${kind==="field"?"is-field":""} ${kind==="admissionType"?"is-admission-type":""}`.trim();
  const priority=priorityOptions.filter(option=>options.includes(option));
  const secondary=options.filter(option=>!priority.includes(option));
  const optionButton=option=><button type="button" key={option} className={`admission-filter-chip ${value.includes(option)?"is-active":""}`} onClick={()=>onChange(toggleSelection(value,option))}>{option}</button>;
  return <div className={className} style={compact?{padding:11}:{}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
      <b style={{fontSize:13,color:"#354052"}}>{label}</b>
      <span style={{fontSize:11,color:"#7b8491",fontWeight:700}}>{value.length?`${value.length}개 선택`:"전체"}</span>
    </div>
    {kind==="admissionType"?<>
      <div className="admission-filter-options admission-filter-priority">{priority.map(optionButton)}</div>
      <div className="admission-filter-options admission-filter-secondary-options"><button type="button" className={`admission-filter-chip ${value.length===0?"is-active":""}`} onClick={()=>onChange([])}>전체</button>{secondary.map(optionButton)}</div>
    </>:<div className="admission-filter-options"><button type="button" className={`admission-filter-chip ${value.length===0?"is-active":""}`} onClick={()=>onChange([])}>전체</button>{options.map(optionButton)}</div>}
  </div>;
}

function FilterPanel({cases,filters,setFilters,filteredCount}){
  const[advanced,setAdvanced]=useState(false);
  const regions=useMemo(()=>unique(cases.map(x=>x.region)).sort((a,b)=>a.localeCompare(b,"ko")),[cases]);
  const fields=useMemo(()=>unique(cases.map(x=>x.field)).sort((a,b)=>a.localeCompare(b,"ko")),[cases]);
  const schoolTypes=useMemo(()=>unique(cases.map(x=>x.schoolType)).sort((a,b)=>a.localeCompare(b,"ko")),[cases]);
  const admissionTypes=useMemo(()=>{const priority=["학생부교과","학생부위주","학생부종합","서류위주","논술","면접","실기"];const values=unique(cases.map(x=>x.admissionType));return [...priority.filter(x=>values.includes(x)),...values.filter(x=>!priority.includes(x)).sort((a,b)=>a.localeCompare(b,"ko"))]},[cases]);
  const reset=()=>setFilters({query:"",regions:[],fields:[],schoolTypes:[],admissionTypes:[],results:[],minGrade:"",maxGrade:""});
  const selectedCount=(filters.regions?.length||0)+(filters.fields?.length||0)+(filters.schoolTypes?.length||0)+(filters.admissionTypes?.length||0)+(filters.results?.length||0)+(filters.minGrade!==""?1:0)+(filters.maxGrade!==""?1:0);

  return <div style={{...styles.filters,padding:16}}>
    <div style={{...styles.filterHeader,marginBottom:14}}>
      <div style={{display:"grid",gap:4}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <b style={{fontSize:16}}>분석 조건</b>
          <span style={{padding:"4px 9px",borderRadius:999,background:"#edf3fb",color:"#315a86",fontSize:11,fontWeight:800}}>
            {filteredCount.toLocaleString()}건 조회
          </span>
        </div>
        <span style={{fontSize:12,color:"#737b87"}}>같은 항목 안에서는 OR, 서로 다른 항목끼리는 AND로 적용됩니다.</span>
      </div>
      <button type="button" onClick={reset} style={styles.smallButton}><RotateCcw size={14}/>전체 초기화</button>
    </div>

    <div className="admission-filter-primary">
      <FilterChipGroup label="계열" kind="field" options={fields} value={filters.fields} onChange={v=>setFilters(x=>({...x,fields:v}))}/>
      <FilterChipGroup label="전형유형" options={admissionTypes} value={filters.admissionTypes} onChange={v=>setFilters(x=>({...x,admissionTypes:v}))}/>
    </div>

    <button type="button" style={{...styles.advancedButton,width:"100%",marginTop:12,background:advanced?"#eef3f9":"#fff"}} onClick={()=>setAdvanced(v=>!v)}>
      {advanced?<ChevronUp size={15}/>:<ChevronDown size={15}/>} 고급 조건 {advanced?"접기":"펼치기"}
      {selectedCount>0&&<span style={{marginLeft:4,padding:"2px 7px",borderRadius:999,background:"#315a86",color:"#fff",fontSize:10.5}}>{selectedCount}</span>}
    </button>

    {advanced&&<div style={{display:"grid",gap:12,marginTop:12,paddingTop:12,borderTop:"1px solid #e7e9ed"}}>
      <FilterChipGroup label="지역" kind="region" options={regions} value={filters.regions} onChange={v=>setFilters(x=>({...x,regions:v}))} compact/>
      <div className="admission-filter-secondary">
        <FilterChipGroup label="학교유형" options={schoolTypes} value={filters.schoolTypes} onChange={v=>setFilters(x=>({...x,schoolTypes:v}))} compact/>
        <FilterChipGroup label="최종 결과" options={["최초합격","충원합격","불합격"]} value={filters.results} onChange={v=>setFilters(x=>({...x,results:v}))} compact/>
      </div>
      <div style={{display:"grid",gap:9,padding:13,border:"1px solid #e1e6ec",borderRadius:13,background:"#fafcfe"}}>
        <b style={{fontSize:13,color:"#354052"}}>전교과 등급 범위</b>
        <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto minmax(0,1fr)",gap:9,alignItems:"center"}}>
          <input style={styles.input} type="number" min="1" max="9" step="0.1" value={filters.minGrade} onChange={e=>setFilters(x=>({...x,minGrade:e.target.value}))} placeholder="최소 등급"/>
          <span style={{color:"#8a929d",fontWeight:800}}>~</span>
          <input style={styles.input} type="number" min="1" max="9" step="0.1" value={filters.maxGrade} onChange={e=>setFilters(x=>({...x,maxGrade:e.target.value}))} placeholder="최대 등급"/>
        </div>
      </div>
    </div>}
  </div>;
}

function StudentMatch({rows,profile,favorites=[],onToggleFavorite,onOpenAdmission,admissionRows=[]}){
  const[range,setRange]=useState(0.5);
  const[field,setField]=useState("전체");
  const[selectedUniversity,setSelectedUniversity]=useState("");
  const fields=useMemo(()=>unique(rows.map(x=>x.field)).sort((a,b)=>a.localeCompare(b,"ko")),[rows]);
  const similar=useMemo(()=>{
    if(profile?.converted==null)return[];
    return rows.filter(row=>{
      const grade=row.universityGrade??row.overallGrade;
      return grade!=null&&Math.abs(grade-profile.converted)<=range&&(field==="전체"||row.field===field);
    });
  },[rows,profile,range,field]);
  const stats=useMemo(()=>{
    const labels=unique(similar.map(row=>row.universityNormalized||row.university));
    return labels.map(label=>{
      const similarRows=similar.filter(row=>(row.universityNormalized||row.university)===label);
      const allRows=rows.filter(row=>(row.universityNormalized||row.university)===label&&(field==="전체"||row.field===field));
      const acceptedAll=allRows.filter(row=>row.finalResult==="합격");
      return{label,total:similarRows.length,accepted:similarRows.filter(row=>row.finalResult==="합격").length,rejected:similarRows.filter(row=>row.finalResult==="불합격").length,median:median(acceptedAll.map(row=>row.universityGrade??row.overallGrade)),allTotal:allRows.length,allAccepted:acceptedAll.length};
    }).sort((a,b)=>b.total-a.total||a.label.localeCompare(b.label,"ko")).slice(0,30);
  },[similar,rows,field]);
  const hasHolistic=useMemo(()=>similar.some(row=>String(row.admissionType||row.detailType||"").includes("종합")),[similar]);
  useEffect(()=>setSelectedUniversity(""),[range,field,profile?.sid]);
  if(!profile)return <Empty title="학생을 먼저 선택하세요." text="학번을 연동하면 현재 성적과 가까운 과거 지원 사례를 보여줍니다." icon={<GraduationCap size={28}/>}/>;
  if(profile.converted==null)return <Empty title="비교할 내신 성적이 없습니다." text="학생의 학기 성적을 먼저 업로드하세요." icon={<AlertTriangle size={28}/>}/>;

  const accepted=similar.filter(x=>x.finalResult==="합격").length;
  if(selectedUniversity){
    const selectedSimilar=similar.filter(row=>(row.universityNormalized||row.university)===selectedUniversity);
    const selectedAll=rows.filter(row=>(row.universityNormalized||row.university)===selectedUniversity&&(field==="전체"||row.field===field));
    const acceptedAll=selectedAll.filter(row=>row.finalResult==="합격");
    const detailRows=buildUniversityDetails(selectedAll);
    const cut50=median(acceptedAll.map(row=>row.universityGrade??row.overallGrade));
    const rate=selectedAll.length?acceptedAll.length/selectedAll.length*100:0;
    const sample=caseSufficiency(selectedAll.length);
    const difference=gradeDifference(profile.converted,cut50);
    const fit=applicationBand(profile.converted,cut50);
    const holistic=selectedAll.some(row=>String(row.admissionType||row.detailType||"").includes("종합"));
    return <div style={{display:"grid",gap:16}}>
      <button type="button" onClick={()=>setSelectedUniversity("")} style={styles.backButton}><ArrowLeft size={15}/>대학 목록으로</button>
      <section style={styles.universityDetailPage}>
        <div style={styles.detailHero}>
          <div style={{display:"grid",gap:6}}>
            <span style={styles.detailEyebrow}>학생 맞춤 대학 상세</span>
            <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><h3 style={{fontSize:22}}>{selectedUniversity}</h3>{onToggleFavorite&&<button type="button" className={`admission-favorite-button ${isFavorite(favorites,{source:"case",university:selectedUniversity})?"is-active":""}`} onClick={()=>onToggleFavorite({source:"case",university:selectedUniversity,label:`${selectedUniversity} 광덕고 사례`})} title="관심 대학에 저장"><Star size={15} fill="currentColor"/></button>}{onOpenAdmission&&admissionRows.some(row=>normalizeUniversityLink(row.university)===normalizeUniversityLink(selectedUniversity))&&<button type="button" className="admission-link-button" onClick={()=>onOpenAdmission(selectedUniversity)}>대학 지원 진단 <ExternalLink size={12}/></button>}</div>
            <div style={{display:"flex",gap:7,flexWrap:"wrap"}}><span className="admission-sample-badge" title={sample.detail}>{sample.label}</span><span className="admission-band-badge" title={fit.detail} style={{color:fit.color,background:fit.background,borderColor:fit.border}}>{fit.label}</span><RateBand rate={rate} total={selectedAll.length}/></div>
          </div>
          <div className="admission-detail-compare" style={styles.detailStudentCompare}>
            <div><small>학생 환산 등급</small><b>{fmt(profile.converted)}</b></div>
            <div><small>합격자 50%컷</small><b>{fmt(cut50)}</b></div>
            <div><small>50%컷 대비</small><b className="admission-cut-arrow" title={difference.detail} style={{color:difference.color}}>{difference.label}</b></div>
          </div>
        </div>
        <div className="admission-detail-metrics" style={styles.detailMetricGrid}>
          <div><small>전체 지원</small><b style={{color:COLORS.blue}}>{selectedAll.length}</b></div>
          <div><small>학생 유사 지원</small><b style={{color:COLORS.blue}}>{selectedSimilar.length}</b></div>
          <div><small>최초합격</small><b style={{color:COLORS.blue}}>{selectedAll.filter(x=>x.finalResultDetail==="최초합격").length}</b></div>
          <div><small>충원합격</small><b style={{color:COLORS.purple}}>{selectedAll.filter(x=>x.finalResultDetail==="충원합격").length}</b></div>
          <div><small>불합격</small><b style={{color:COLORS.red}}>{selectedAll.filter(x=>x.finalResult==="불합격").length}</b></div>
        </div>
        {holistic&&<div className="admission-holistic-notice"><AlertTriangle size={15}/><span><b>학생부종합 참고</b> · 서류·활동·과목 선택 등이 함께 평가되므로 50%컷은 성적 위치를 확인하는 참고값으로만 활용하세요.</span></div>}
      </section>
      <Section title="모집단위·전형별 결과" description="해당 대학의 모집단위와 전형을 지원 사례 수와 합격자 50%컷으로 비교합니다.">
        <Table style={{tableLayout:"fixed"}} className="admission-detail-table"><colgroup><col style={{width:"24%"}}/><col style={{width:"25%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"11%"}}/><col style={{width:"8%"}}/></colgroup><thead><tr><th>모집단위</th><th>전형</th><th>지원</th><th>최초합</th><th>충원합</th><th>불합격</th><th>합격률</th><th>50%컷</th></tr></thead><tbody>{detailRows.map(row=><tr key={`${row.department}|${row.type}`}><td style={{textAlign:"left",fontWeight:800}}>{row.department}</td><td style={{textAlign:"left",color:"#566171"}}>{row.type}</td><td><b style={{color:COLORS.blue}}>{row.total}</b></td><td style={{color:COLORS.blue,fontWeight:800}}>{row.first}</td><td style={{color:COLORS.purple,fontWeight:800}}>{row.waitlist}</td><td style={{color:COLORS.red,fontWeight:800}}>{row.rejected}</td><td><RateBand rate={row.rate} total={row.total} compact/></td><td>{fmt(row.median)}</td></tr>)}</tbody></Table>
      </Section>
      <Section title={`학생 유사 사례 ${selectedSimilar.length}건`} description={`현재 9등급 환산 ${fmt(profile.converted)}에서 ±${range.toFixed(1)} 범위의 사례입니다.`}>
        {selectedSimilar.length?<Table style={{tableLayout:"fixed"}} className="admission-detail-table"><colgroup><col style={{width:"7%"}}/><col style={{width:"20%"}}/><col style={{width:"23%"}}/><col style={{width:"10%"}}/><col style={{width:"10%"}}/><col style={{width:"14%"}}/><col style={{width:"16%"}}/></colgroup><thead><tr><th>관심</th><th>모집단위</th><th>전형</th><th>전교과</th><th>대학 환산</th><th>최종 결과</th><th>등록 여부</th></tr></thead><tbody>{selectedSimilar.slice(0,40).map(row=>{const registration=registrationDisplay(row);const favoriteItem={source:"case",university:selectedUniversity,department:row.department,admissionType:row.detailType||row.admissionType,label:`${selectedUniversity} ${row.department}`};return <tr key={row.caseId}><td>{onToggleFavorite&&<button type="button" className={`admission-favorite-button ${isFavorite(favorites,favoriteItem)?"is-active":""}`} onClick={()=>onToggleFavorite(favoriteItem)} title="이 유사 사례를 상담·관심 대학에 저장" aria-label="유사 사례 즐겨찾기"><Star size={13} fill="currentColor"/></button>}</td><td style={{textAlign:"left",fontWeight:800}}>{row.department}</td><td style={{textAlign:"left"}}>{row.detailType||row.admissionType}</td><td>{fmt(row.overallGrade)}</td><td>{fmt(row.universityGrade)}</td><td><span style={{...styles.badge,...resultStyle(row.finalResultDetail)}}>{row.finalResultDetail}</span></td><td><span style={{...styles.registrationBadge,color:registration.color,background:registration.background}}>{registration.label}</span></td></tr>})}</tbody></Table>:<Empty title="현재 범위의 유사 사례가 없습니다." text="대학 전체 지원 결과는 위 표에서 확인할 수 있습니다."/>}
      </Section>
    </div>;
  }

  return <div style={{display:"grid",gap:16}}>
    <div style={styles.notice}><AlertTriangle size={16}/><span>과거 사례는 9등급제 자료입니다. 5등급제 학생은 9등급 환산값으로 비교하며, 상향·소신·적정·안정·하향은 <b>합격자 50%컷과의 차이</b>를 기준으로 표시합니다.</span></div>
    <div style={styles.matchPanel}>
      <div style={{display:"grid",gap:8}}><b style={{fontSize:13}}>성적 비교 범위</b><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{[0.3,0.5,1].map(value=><button type="button" key={value} className={`admission-range-button ${range===value?"is-active":""}`} onClick={()=>setRange(value)}>±{value.toFixed(1)}</button>)}</div></div>
      <div style={{display:"grid",gap:8}}><b style={{fontSize:13}}>비교 계열</b><div className="admission-filter-options">{["전체",...fields].map(value=><button type="button" key={value} className={`admission-filter-chip ${field===value?"is-active":""}`} onClick={()=>setField(value)}>{value}</button>)}</div></div>
    </div>
    <div className="admission-comparison-summary" style={styles.studentComparisonHeader}>
      <div><small>내신 평균 · {profile.gradeSystem}등급제</small><b>{fmt(profile.average)}</b></div>
      <div><small>환산 등급</small><b style={{color:COLORS.blue}}>{fmt(profile.converted)}</b></div>
      <div><small>비교 범위</small><b>±{range.toFixed(1)}등급</b></div>
      <div><small>유사 지원 · 합격</small><b><span style={{color:COLORS.blue}}>{similar.length}</span><span style={{color:"#98a1ad",padding:"0 5px"}}>/</span><span style={{color:COLORS.green}}>{accepted}</span></b></div>
    </div>
    <SummaryCards rows={similar}/>
    <Section title="현재 성적 기준 대학별 지원 사례" description="지원 구간은 합격 사례 비율이 아니라 학생의 9등급 환산과 합격자 50%컷의 차이로 산출합니다.">
      <div style={styles.bandLegend}>{[["상향","+0.5 초과"],["소신","+0.2~+0.5"],["적정","-0.2~+0.2"],["안정","-0.5~-0.2"],["하향","-0.5 미만"]].map(([label,rangeText])=>{const sampleGrade=label==="상향"?3:label==="소신"?2.4:label==="적정"?2:label==="안정"?1.7:1.3;const meta=applicationBand(sampleGrade,2);return <span key={label} title={meta.detail} style={{display:"inline-flex",alignItems:"center",gap:5,padding:"5px 8px",border:"1px solid",borderRadius:999,fontSize:10.5,fontWeight:750,color:meta.color,background:meta.background,borderColor:meta.border}}><b>{label}</b>{rangeText}</span>})}</div>
      {hasHolistic&&<div className="admission-holistic-notice" style={{marginBottom:12}}><AlertTriangle size={15}/><span><b>학생부종합 전형</b>은 서류·활동·과목 선택 등을 종합 평가하므로 50%컷과 지원 구간을 참고용으로만 활용하세요.</span></div>}
      {stats.length?<div style={styles.caseCards}>{stats.map(stat=>{
        const sample=caseSufficiency(stat.total),difference=gradeDifference(profile.converted,stat.median),rate=stat.total?stat.accepted/stat.total*100:0,fit=applicationBand(profile.converted,stat.median);
        return <button type="button" className="admission-university-card" key={stat.label} style={styles.caseCard} onClick={()=>setSelectedUniversity(stat.label)}>
          <div style={styles.caseCardHead}><div style={{display:"grid",gap:4}}><b style={{fontSize:15.5,color:"#222b36"}}>{stat.label}</b><span style={{fontSize:10.5,color:"#7b8491"}}>클릭하여 상세 보기</span></div><div style={{display:"flex",gap:6,alignItems:"center"}}>{onToggleFavorite&&<span role="button" tabIndex={0} className={`admission-favorite-button ${isFavorite(favorites,{source:"case",university:stat.label})?"is-active":""}`} onClick={event=>{event.stopPropagation();onToggleFavorite({source:"case",university:stat.label,label:`${stat.label} 광덕고 사례`})}} onKeyDown={event=>{if(event.key==="Enter"){event.stopPropagation();onToggleFavorite({source:"case",university:stat.label,label:`${stat.label} 광덕고 사례`})}}} title="관심 대학에 저장"><Star size={14} fill="currentColor"/></span>}<span className="admission-sample-badge" title={sample.detail}>{sample.label}</span></div></div>
          <div className="admission-case-comparison"><div><small>학생 환산 등급</small><b style={{color:COLORS.blue}}>{fmt(profile.converted)}</b></div><div><small>합격자 50%컷</small><b style={{color:COLORS.green}}>{fmt(stat.median)}</b></div><div><small>50%컷 대비</small><b className="admission-cut-arrow" title={difference.detail} style={{fontSize:12.5,color:difference.color}}>{difference.label}</b></div></div>
          <div style={styles.caseCountRow}><span className="admission-case-count-pill support">지원 <b>{stat.total}</b></span><span className="admission-case-count-pill accept">합격 <b>{stat.accepted}</b></span><span className="admission-case-count-pill reject">불합격 <b>{stat.rejected}</b></span></div>
          <div style={styles.caseFooter}><div style={{display:"grid",gap:3}}><span style={{fontSize:10.5,color:"#777f8b"}}>합격 사례 비율 {fmt(rate,1)}%</span><div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontWeight:800}}>50%컷 기준</span><span className="admission-band-badge" title={fit.detail} style={{color:fit.color,background:fit.background,borderColor:fit.border}}>{fit.label}</span></div></div><ChevronRight size={17} color="#7a8799"/></div>
        </button>;
      })}</div>:<Empty title="선택한 범위의 유사 사례가 없습니다." text="성적 범위를 넓히거나 계열을 전체로 바꿔보세요."/>}
    </Section>
  </div>;
}
function Bars({rows}){
  const max=Math.max(1,...rows.map(x=>x.total));
  return <div style={{display:"grid",gap:12}}>{rows.map(row=><div key={row.label} style={styles.barRowNew}>
    <b style={{fontSize:13}}>{row.label}</b>
    <div style={styles.dualBarWrap}>
      <div style={styles.dualBarTrack}><div style={{...styles.supportBar,width:`${Math.max(2,row.total/max*100)}%`}}/></div>
      <div style={styles.dualBarTrack}><div style={{...styles.acceptBar,width:`${Math.max(row.accepted?2:0,row.accepted/max*100)}%`}}/></div>
    </div>
    <div style={styles.barCounts}>
      <span className="admission-case-count-pill support">지원 <b>{row.total}</b></span>
      <span className="admission-case-count-pill accept">합격 <b>{row.accepted}</b></span>
    </div>
  </div>)}</div>;
}
function Overview({rows}){
  const types=useMemo(()=>groupStats(rows,x=>x.admissionType).slice(0,10),[rows]);
  const regions=useMemo(()=>groupStats(rows,x=>x.region).slice(0,12),[rows]);
  const grades=useMemo(()=>groupStats(rows.filter(x=>x.gradeBand),x=>`${x.gradeBand}등급대`).sort((a,b)=>parseFloat(a.label)-parseFloat(b.label)),[rows]);
  return <div style={{display:"grid",gap:18}}>
    <SummaryCards rows={rows}/>
    <div className="admission-case-two" style={styles.twoColumns}><Section title="전형별 지원·합격 사례" description="파란색은 지원, 초록색은 합격 사례입니다."><Bars rows={types}/></Section><Section title="지역별 지원·합격 사례" description="사례 수와 합격 사례 수를 함께 비교합니다."><Bars rows={regions}/></Section></div>
    <Section title="등급대별 결과" description="1·2등급대는 별도 색으로 강조하고, 각 등급대의 합격 사례 비율과 합격자 50%컷을 표시합니다.">
      <Table style={{tableLayout:"fixed"}} className="admission-detail-table"><colgroup><col style={{width:"15%"}}/><col style={{width:"11%"}}/><col style={{width:"11%"}}/><col style={{width:"11%"}}/><col style={{width:"12%"}}/><col style={{width:"11%"}}/><col style={{width:"16%"}}/><col style={{width:"13%"}}/></colgroup><thead><tr><th>등급대</th><th>지원</th><th>최초합</th><th>충원합</th><th>합격 합계</th><th>불합격</th><th>합격률</th><th>합격자 50%컷</th></tr></thead><tbody>{grades.map(row=>{const level=parseInt(row.label,10);return <tr key={row.label} className={level===1?"admission-grade-row-1":level===2?"admission-grade-row-2":""}><td><b>{row.label}</b></td><td><b style={{color:COLORS.blue}}>{row.total}</b></td><td style={{color:COLORS.blue,fontWeight:800}}>{row.first}</td><td style={{color:COLORS.purple,fontWeight:800}}>{row.waitlist}</td><td><b style={{color:COLORS.green}}>{row.accepted}</b></td><td style={{color:COLORS.red,fontWeight:800}}>{row.rejected}</td><td><RateBand rate={row.rate} total={row.total} compact/></td><td><b>{fmt(row.median)}</b></td></tr>})}</tbody></Table>
    </Section>
  </div>;
}
function UniversityAnalysis({rows}){
  const[query,setQuery]=useState("");
  const[selected,setSelected]=useState("");
  const allUniversities=useMemo(()=>groupStats(rows,x=>x.universityNormalized||x.university),[rows]);
  const universities=useMemo(()=>allUniversities.filter(x=>x.label.toLowerCase().includes(query.toLowerCase())).slice(0,100),[allUniversities,query]);
  useEffect(()=>{if((!selected||!allUniversities.some(x=>x.label===selected))&&universities[0])setSelected(universities[0].label)},[universities,selected,allUniversities]);
  const selectedRows=useMemo(()=>selected?rows.filter(x=>(x.universityNormalized||x.university)===selected):[],[rows,selected]);
  const details=useMemo(()=>buildUniversityDetails(selectedRows),[selectedRows]);
  const acceptedGrades=selectedRows.filter(x=>x.finalResult==="합격").map(x=>x.universityGrade??x.overallGrade);
  const selectedAccepted=selectedRows.filter(x=>x.finalResult==="합격").length;
  const selectedRate=selectedRows.length?selectedAccepted/selectedRows.length*100:0;
  const holistic=selectedRows.some(row=>String(row.admissionType||row.detailType||"").includes("종합"));
  return <div style={{display:"grid",gap:12}}>
    <div style={styles.universitySearchPanel}>
      <div style={{display:"grid",gap:3}}><b style={{fontSize:15}}>대학별 상세 조회</b><span style={{fontSize:11.5,color:"#737b87"}}>검색하고 대학을 선택하면 바로 아래에서 모집단위·전형별 결과를 확인합니다.</span></div>
      <div className="admission-university-picker">
        <div style={{...styles.searchBox,minWidth:0}}><Search size={17} color="#59677a"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="대학명 검색"/><span>{universities.length}개</span></div>
        <label style={{display:"grid",gap:5,fontSize:10.5,fontWeight:800,color:"#667180"}}>대학 선택<select value={selected} onChange={e=>setSelected(e.target.value)}>{universities.map(row=><option key={row.label} value={row.label}>{row.label} · 지원 {row.total} · 합격 {row.accepted}</option>)}</select></label>
      </div>
    </div>
    <div style={styles.universityDetail}>{!selected?<Empty title="대학을 선택하세요." text="상단 검색과 대학 선택 메뉴를 이용하세요."/>:<>
      <div style={styles.universityHead}><div style={{display:"grid",gap:4}}><b style={{fontSize:20,color:"#202a35"}}>{selected}</b><span style={{fontSize:12,color:"#737b87"}}>광덕고 2024~2026 통합 지원 사례</span></div><div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span className="admission-sample-badge">{caseSufficiency(selectedRows.length).label}</span><RateBand rate={selectedRate} total={selectedRows.length}/></div></div>
      <div style={styles.universityMetrics}><div><small>지원 사례</small><b style={{color:COLORS.blue}}>{selectedRows.length}</b></div><div><small>합격 사례</small><b style={{color:COLORS.green}}>{selectedAccepted}</b></div><div><small>합격자 50%컷</small><b>{fmt(median(acceptedGrades))}</b></div><div><small>합격자 25~75%</small><b>{fmt(percentile(acceptedGrades,.25))}~{fmt(percentile(acceptedGrades,.75))}</b></div></div>
      {holistic&&<div className="admission-holistic-notice" style={{marginTop:12}}><AlertTriangle size={15}/><span><b>학생부종합 참고</b> · 학생부종합은 서류·활동·과목 선택 등을 종합 평가하므로 커트라인은 참고용으로만 활용하세요.</span></div>}
      <div style={{marginTop:12}}><Table style={{tableLayout:"fixed"}} className="admission-detail-table"><colgroup><col style={{width:"24%"}}/><col style={{width:"26%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"8%"}}/><col style={{width:"10%"}}/><col style={{width:"8%"}}/></colgroup><thead><tr><th>모집단위</th><th>전형</th><th>지원</th><th>최초합</th><th>충원합</th><th>불합격</th><th>합격률</th><th>50%컷</th></tr></thead><tbody>{details.map(row=><tr key={`${row.department}|${row.type}`}><td style={{textAlign:"left",fontWeight:800}}>{row.department}</td><td style={{textAlign:"left",color:"#566171"}}>{row.type}</td><td><b style={{color:COLORS.blue}}>{row.total}</b></td><td style={{color:COLORS.blue,fontWeight:800}}>{row.first}</td><td style={{color:COLORS.purple,fontWeight:800}}>{row.waitlist}</td><td style={{color:COLORS.red,fontWeight:800}}>{row.rejected}</td><td><RateBand rate={row.rate} total={row.total} compact/></td><td>{fmt(row.median)}</td></tr>)}</tbody></Table></div>
    </>}</div>
  </div>;
}
function DimensionAnalysis({rows}){
  const[mode,setMode]=useState("등급별");
  const getter=mode==="지역별"?x=>x.region:mode==="계열별"?x=>x.field:mode==="전형별"?x=>x.admissionType:x=>x.gradeBand?`${x.gradeBand}등급대`:"등급 미입력";
  let stats=useMemo(()=>groupStats(rows,getter),[rows,mode]);
  if(mode==="등급별")stats=[...stats].sort((a,b)=>(parseFloat(a.label)||99)-(parseFloat(b.label)||99));
  return <div style={{display:"grid",gap:15}}>
    <div style={styles.modePanel}><div style={{display:"grid",gap:3}}><b style={{fontSize:15}}>분석 기준</b><span style={{fontSize:11.5,color:"#737b87"}}>원하는 기준으로 지원·합격 결과를 비교하세요.</span></div><div style={styles.modeTabs}>{["등급별","지역별","계열별","전형별"].map(value=><button className="admission-mode-button" key={value} onClick={()=>setMode(value)} style={{...styles.modeButton,...(mode===value?styles.modeButtonActive:{})}}>{value}</button>)}</div></div>
    <Table style={{tableLayout:"fixed"}} className="admission-detail-table"><colgroup><col style={{width:"16%"}}/><col style={{width:"11%"}}/><col style={{width:"11%"}}/><col style={{width:"11%"}}/><col style={{width:"12%"}}/><col style={{width:"11%"}}/><col style={{width:"20%"}}/><col style={{width:"8%"}}/></colgroup><thead><tr><th>{mode.replace("별","")}</th><th>지원 사례</th><th>최초합</th><th>충원합</th><th>합격 합계</th><th>불합격</th><th>합격률</th><th>50%컷</th></tr></thead><tbody>{stats.map(row=>{const level=mode==="등급별"?parseInt(row.label,10):null;return <tr key={row.label} className={level===1?"admission-grade-row-1":level===2?"admission-grade-row-2":""}><td><b>{row.label}</b></td><td><b style={{color:COLORS.blue}}>{row.total}</b></td><td style={{color:COLORS.blue,fontWeight:800}}>{row.first}</td><td style={{color:COLORS.purple,fontWeight:800}}>{row.waitlist}</td><td><b style={{color:COLORS.green}}>{row.accepted}</b></td><td style={{color:COLORS.red,fontWeight:800}}>{row.rejected}</td><td><RateBand rate={row.rate} total={row.total} compact/></td><td>{fmt(row.median)}</td></tr>})}</tbody></Table>
  </div>;
}
function CaseSearch({rows}){
  const[query,setQuery]=useState("");
  const[page,setPage]=useState(1);
  const filtered=useMemo(()=>rows.filter(x=>textMatch(x,query)),[rows,query]);
  useEffect(()=>setPage(1),[query,rows.length]);
  const max=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const visible=filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
  return <div style={{display:"grid",gap:13}}>
    <SearchBox value={query} onChange={setQuery} placeholder="대학·학과·전형 검색" count={`${filtered.length.toLocaleString()}건`}/>
    <Table minWidth={1000}><thead><tr><th>대학</th><th>모집단위</th><th>지역·계열</th><th>전형</th><th>전교과</th><th>대학 환산</th><th>수능 평균</th><th>최종 결과</th><th>등록</th></tr></thead><tbody>{visible.map(row=>{
      const registration=registrationDisplay(row);
      return <tr key={row.caseId}>
        <td><b style={{fontSize:13.5}}>{row.university}</b></td>
        <td style={{textAlign:"left",fontWeight:700}}>{row.department}</td>
        <td>{row.region}<br/><small style={{color:"#727b86"}}>{row.field}</small></td>
        <td style={{textAlign:"left"}}><b style={{fontSize:12.5}}>{row.admissionType}</b><br/><small style={{color:"#727b86"}}>{row.detailType}</small></td>
        <td>{fmt(row.overallGrade)}</td><td>{fmt(row.universityGrade)}</td><td>{fmt(row.csatAverage)}</td>
        <td><span style={{...styles.badge,...resultStyle(row.finalResultDetail)}}>{row.finalResultDetail}</span></td>
        <td><span style={{...styles.registrationBadge,color:registration.color,background:registration.background}}>{registration.label}</span></td>
      </tr>;
    })}</tbody></Table>
    <div style={styles.pagination}><button style={styles.pageButton} disabled={page<=1} onClick={()=>setPage(x=>x-1)}><ArrowLeft size={14}/>이전</button><span style={styles.pageStatus}><b>{page}</b><em>/</em>{max}</span><button style={styles.pageButton} disabled={page>=max} onClick={()=>setPage(x=>x+1)}>다음<ChevronRight size={14}/></button></div>
  </div>;
}

export function AdmissionCaseAnalytics({gdb,roster={},currentGrade="2",selectedStudentSid,onSelectedStudentSidChange,selectedStudentQuery,onSelectedStudentQueryChange,favorites=[],onToggleFavorite,onOpenAdmission,focusUniversity=""}){
  const cases=gdb?.admissionCases||[];
  const[tab,setTab]=useState("student");
  const[localSid,setLocalSid]=useState("");
  const[localQuery,setLocalQuery]=useState("");
  const sid=selectedStudentSid!==undefined?selectedStudentSid:localSid;
  const query=selectedStudentQuery!==undefined?selectedStudentQuery:localQuery;
  const setSid=value=>selectedStudentSid!==undefined?onSelectedStudentSidChange?.(value):setLocalSid(value);
  const setQuery=value=>selectedStudentQuery!==undefined?onSelectedStudentQueryChange?.(value):setLocalQuery(value);
  const profile=useMemo(()=>studentProfile(sid,roster,gdb,currentGrade),[sid,roster,gdb,currentGrade]);
  const[filters,setFilters]=useState({query:"",regions:[],fields:[],schoolTypes:[],admissionTypes:[],results:[],minGrade:"",maxGrade:""});
  const filtered=useMemo(()=>applyFilters(cases,filters),[cases,filters]);
  useEffect(()=>{if(!focusUniversity)return;setTab("university");setFilters(value=>({...value,query:focusUniversity}))},[focusUniversity]);
  if(!cases.length)return <Empty title="아직 저장된 대입 사례 데이터가 없습니다." text="관리자 → 성적 데이터 → 2024–2026 대입 사례 데이터에서 엑셀을 업로드하세요."/>;
  return <div className="admission-case-ui" style={styles.page}><style>{CSS}</style><div style={styles.hero}><div><small>광덕고 상담 지원 자료</small><h2>2024–2026 광덕고 대입 결과</h2><p>과거 졸업생의 통합 지원 사례를 등급·지역·전형별로 분석합니다. 학생 수가 아니라 지원 사례 수입니다.</p></div><div style={styles.heroMeta}><b>{cases.length.toLocaleString()}</b><span>통합 지원 사례</span></div></div><StudentConnector profile={profile} query={query} onQuery={setQuery} onSelect={setSid} roster={roster}/><div style={styles.tabs}>{[["student","학생 맞춤 분석"],["overview","전체 현황"],["university","대학·전형별"],["dimension","등급·지역별"],["search","사례 검색"]].map(([key,label])=><button key={key} onClick={()=>setTab(key)} style={{...styles.tab,...(tab===key?styles.tabActive:{})}}>{label}</button>)}</div><FilterPanel cases={cases} filters={filters} setFilters={setFilters} filteredCount={filtered.length}/><div style={styles.filteredCount}><Filter size={13}/>전체 {cases.length.toLocaleString()}건 중 현재 조건에 해당하는 사례 <b>{filtered.length.toLocaleString()}건</b></div>{filtered.length===0&&<div style={{display:"flex",alignItems:"center",gap:9,padding:"12px 14px",borderRadius:11,background:"#fff4ed",border:"1px solid #f1cfb7",color:"#8a4f25",fontSize:12}}><AlertTriangle size={16}/><span>조건에 해당하는 사례가 없습니다. 상단의 <b>전체 초기화</b>를 누르거나 선택 범위를 넓혀보세요.</span></div>}{tab==="student"&&<StudentMatch rows={filtered} profile={profile} favorites={favorites} onToggleFavorite={onToggleFavorite} onOpenAdmission={onOpenAdmission} admissionRows={gdb?.admissionRows||[]}/>} {tab==="overview"&&<Overview rows={filtered}/>} {tab==="university"&&<UniversityAnalysis rows={filtered}/>} {tab==="dimension"&&<DimensionAnalysis rows={filtered}/>} {tab==="search"&&<CaseSearch rows={filtered}/>}</div>
}

function QualityCards({cases}){const summary=summarizeAdmissionCases(cases);const rows=[["연도 미입력",cases.filter(x=>x.admissionYear==null).length],["등록 여부 미입력",summary.registrationUnknown],["대학 환산등급 미입력",summary.universityGradeMissing],["수능 평균 미입력",summary.csatMissing],["전교과 미입력",cases.filter(x=>x.overallGrade==null).length]];return <div style={styles.qualityGrid}>{rows.map(([label,value])=><div key={label}><b>{value.toLocaleString()}</b><span>{label}</span></div>)}</div>}
export function AdmissionCaseAdmin({gdb,persistGrades,showToast,roster={},currentGrade="2"}){const[subtab,setSubtab]=useState("upload");const[preview,setPreview]=useState(null);const[source,setSource]=useState(null);const[loading,setLoading]=useState(false);const[saving,setSaving]=useState(false);const readFile=async file=>{setLoading(true);try{const XLSX=await import("xlsx");const workbook=XLSX.read(await file.arrayBuffer(),{type:"array",cellDates:true});const sheetName=workbook.SheetNames.find(name=>String(name).trim()==="작업용")||workbook.SheetNames.find(name=>/작업|원본|data/i.test(name));if(!sheetName)throw new Error("'작업용' 원본 시트를 찾지 못했습니다.");const rows=XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,defval:null,raw:true});const meta={sourceId:`admission_${Date.now().toString(36)}`,label:"2024~2026 통합",periodLabel:"2024~2026 통합",fileName:file.name,importedAt:new Date().toISOString(),sheetName,hasYearColumn:false};const cases=parseAdmissionCaseRows(rows,meta);if(!cases.length)throw new Error("지원 사례를 인식하지 못했습니다.");setPreview(cases);setSource({...meta,rowCount:cases.length})}catch(error){showToast?.(`대입 사례 파일을 읽지 못했습니다. (${error?.message||error})`,"error")}finally{setLoading(false)}};const save=async()=>{if(!preview||!source)return;setSaving(true);const ok=await persistGrades({admissionCaseSources:[{...source,updatedAt:new Date().toISOString()}],admissionCases:preview});setSaving(false);if(ok){showToast?.(`${preview.length.toLocaleString()}건의 대입 지원 사례를 저장했습니다.`,"success");setPreview(null);setSource(null);setSubtab("analytics")}};const clear=async()=>{if(!window.confirm("저장된 대입 사례 데이터를 모두 삭제할까요?"))return;const ok=await persistGrades({admissionCaseSources:[],admissionCases:[]});if(ok)showToast?.("대입 사례 데이터를 삭제했습니다.","success")};const stored=gdb.admissionCases||[];const sources=gdb.admissionCaseSources||[];return <div className="admission-case-ui" style={{display:"grid",gap:14}}><style>{CSS}</style><div style={styles.adminTabs}>{[["upload","파일 업로드·반영"],["analytics","데이터 현황·사례 탐색"],["history","업로드 이력"]].map(([key,label])=><button key={key} onClick={()=>setSubtab(key)} style={{...styles.adminTab,...(subtab===key?styles.adminTabActive:{})}}>{label}</button>)}</div>{subtab==="upload"&&<div style={{display:"grid",gap:14}}><div style={styles.uploadBox}><FileSpreadsheet size={30}/><div><b>2024–2026 대입 통계 엑셀 업로드</b><span>XLSX·XLSM 파일의 숨김 ‘작업용’ 시트를 자동 인식합니다.</span></div><label style={styles.fileButton}>{loading?<Loader2 size={15} className="spin"/>:<Upload size={15}/>} {loading?"파일 분석 중":"엑셀 파일 선택"}<input hidden type="file" accept=".xlsx,.xlsm,.xls" disabled={loading} onChange={e=>e.target.files?.[0]&&readFile(e.target.files[0])}/></label></div>{preview&&<><div style={styles.previewHeader}><div><b>{source.fileName}</b><span>{source.sheetName} 시트 · {preview.length.toLocaleString()}건 인식</span></div><em>연도 열 없음 · 2024~2026 통합 저장</em></div><SummaryCards rows={preview}/><Section title="데이터 품질 검사" description="빈값을 임의로 합격·미등록으로 변환하지 않습니다."><QualityCards cases={preview}/></Section><div style={styles.actions}><button style={styles.primaryButton} disabled={saving} onClick={save}>{saving?<Loader2 size={15} className="spin"/>:<Save size={15}/>}최종 반영</button><button style={styles.secondaryButton} onClick={()=>{setPreview(null);setSource(null)}}>취소</button></div></>}{!preview&&stored.length>0&&<div style={styles.savedNotice}><CheckCircle2 size={18}/><div><b>현재 {stored.length.toLocaleString()}건이 저장되어 있습니다.</b><span>새 파일을 반영하면 기존 통합 자료를 교체합니다.</span></div><button style={styles.dangerButton} onClick={clear}><Trash2 size={13}/>전체 삭제</button></div>}</div>}{subtab==="analytics"&&<AdmissionCaseAnalytics gdb={gdb} roster={roster} currentGrade={currentGrade}/>} {subtab==="history"&&<Section title="업로드 이력">{sources.length?<Table><thead><tr><th>자료명</th><th>원본 파일</th><th>원본 시트</th><th>사례 수</th><th>업로드 시각</th></tr></thead><tbody>{sources.map(item=><tr key={item.sourceId}><td>{item.label}</td><td>{item.fileName}</td><td>{item.sheetName}</td><td>{Number(item.rowCount||0).toLocaleString()}</td><td>{item.importedAt?new Date(item.importedAt).toLocaleString("ko-KR"):"-"}</td></tr>)}</tbody></Table>:<Empty title="업로드 이력이 없습니다."/>}</Section>}</div>}

const styles={
page:{display:"grid",gap:18},
hero:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:18,padding:"22px 24px",borderRadius:18,color:"#fff",background:"linear-gradient(135deg,#405e87,#6079a5 48%,#796d9c)",boxShadow:"0 12px 28px rgba(53,72,103,.18)"},
heroMeta:{minWidth:126,padding:"14px 16px",borderRadius:14,background:"rgba(255,255,255,.14)",border:"1px solid rgba(255,255,255,.25)",textAlign:"center",display:"grid",gap:3},
studentConnector:{display:"grid",gridTemplateColumns:"minmax(220px,.55fr) minmax(0,1.45fr)",gap:14,padding:15,background:"#fff",border:`1px solid ${COLORS.line}`,borderRadius:15,alignItems:"stretch",minWidth:0,maxWidth:"100%",overflow:"hidden"},
studentSearchPanel:{position:"relative",display:"grid",gap:7,alignContent:"center",padding:"4px 2px"},
label:{fontSize:12,fontWeight:800,color:"#5f6874"},
input:{width:"100%",boxSizing:"border-box",border:"1px solid #d8dde5",borderRadius:10,padding:"10px 12px",fontSize:13,outline:"none",background:"#fff"},
searchResults:{position:"absolute",zIndex:20,top:43,left:0,right:0,background:"#fff",border:"1px solid #d9dfe7",borderRadius:10,boxShadow:"0 12px 28px rgba(45,55,72,.14)",overflow:"hidden"},
studentProfile:{display:"grid",gridTemplateColumns:"minmax(145px,.52fr) minmax(0,1.48fr)",alignItems:"center",gap:11,padding:"12px 13px",borderRadius:12,background:"linear-gradient(135deg,#f3f7fc,#faf8ff)",border:"1px solid #d9e2ef",minWidth:0,width:"100%",maxWidth:"100%",overflow:"hidden"},
studentProfileIdentity:{display:"grid",gap:6,minWidth:0},
studentProfileEyebrow:{fontSize:10.5,fontWeight:900,color:"#66758a",letterSpacing:".04em"},
studentProfileTitle:{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap",fontSize:18,color:"#202a35"},
studentProfileBadges:{display:"flex",gap:6,flexWrap:"wrap"},
studentMetrics:{display:"grid",gap:7,minWidth:0},
studentPlaceholder:{display:"grid",placeItems:"center",border:"1px dashed #d8d1c3",borderRadius:11,color:COLORS.muted,fontSize:12.5},
tabs:{display:"flex",gap:7,flexWrap:"wrap",padding:7,background:"#f2f0eb",borderRadius:13},
tab:{border:0,background:"transparent",borderRadius:9,padding:"10px 14px",fontWeight:800,color:"#655f55",cursor:"pointer",fontSize:13},
tabActive:{background:"#fff",color:COLORS.blue,boxShadow:"0 2px 7px rgba(41,50,67,.12)"},
filters:{background:"#fff",border:`1px solid ${COLORS.line}`,borderRadius:15,padding:15},
filterHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:12},
filterGrid:{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10,alignItems:"end"},
filterSelect:{display:"grid",gridTemplateColumns:"70px minmax(0,1fr) 55px",gap:7,alignItems:"center",fontSize:11,fontWeight:800},
advancedButton:{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,border:"1px solid #cfd7e2",borderRadius:10,background:"#fff",padding:"10px",fontWeight:800,cursor:"pointer",color:"#354052"},
gradeRange:{display:"flex",alignItems:"center",gap:7},
smallButton:{display:"inline-flex",alignItems:"center",gap:5,border:"1px solid #d5dbe4",borderRadius:9,background:"#fff",padding:"8px 10px",fontWeight:800,cursor:"pointer",color:"#354052"},
filteredCount:{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#656e79"},
summary:{display:"grid",gridTemplateColumns:"repeat(6,minmax(0,1fr))",gap:10},
summaryCard:{display:"grid",gap:5,padding:"14px 15px",border:`1px solid ${COLORS.line}`,borderTop:"4px solid",borderRadius:12,background:"#fff",fontSize:13},
section:{background:"#fff",border:`1px solid ${COLORS.line}`,borderRadius:15,padding:17},
sectionTitle:{display:"flex",justifyContent:"space-between",marginBottom:15},
tableWrap:{width:"100%",overflowX:"auto",border:`1px solid ${COLORS.line}`,borderRadius:11},
empty:{minHeight:210,display:"grid",placeItems:"center",alignContent:"center",gap:8,padding:25,border:"1px dashed #d8d1c3",borderRadius:14,background:"#fbfaf7",color:COLORS.muted,textAlign:"center"},
notice:{display:"flex",gap:8,alignItems:"flex-start",padding:"12px 14px",borderRadius:10,background:"#fff8e8",border:"1px solid #efd89c",color:"#755b20",fontSize:12},
matchControls:{display:"flex",gap:14,flexWrap:"wrap",padding:"13px 15px",background:"#fff",border:`1px solid ${COLORS.line}`,borderRadius:12},
matchPanel:{display:"grid",gridTemplateColumns:"minmax(230px,.65fr) minmax(0,1.35fr)",gap:14,padding:15,background:"#fff",border:`1px solid ${COLORS.line}`,borderRadius:13},
studentComparisonHeader:{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:9,padding:12,borderRadius:13,background:"linear-gradient(135deg,#f4f7fb,#fbf9ff)",border:"1px solid #dce4ef",minWidth:0},
context:{padding:"12px 14px",borderRadius:11,background:"#f4f7fb",border:"1px solid #dce4ef",color:"#49566a",fontSize:12.5},
caseCards:{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:11},
caseCard:{border:`1px solid ${COLORS.line}`,borderRadius:12,padding:13,display:"grid",gap:11,background:"#fff",textAlign:"left"},
caseCardHead:{display:"flex",justifyContent:"space-between",gap:8,alignItems:"flex-start"},
caseCounts:{display:"flex",gap:8,flexWrap:"wrap",fontSize:11},
caseCountRow:{display:"flex",gap:7,flexWrap:"wrap"},
caseFooter:{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:9,borderTop:"1px solid #ece8df",fontSize:12},
bandLegend:{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12,padding:"9px 10px",borderRadius:10,background:"#fafbfc",border:"1px solid #e3e7ed"},
softBadge:{display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:999,padding:"4px 8px",fontSize:10.5,fontWeight:800,whiteSpace:"nowrap"},
backButton:{justifySelf:"start",display:"inline-flex",alignItems:"center",gap:6,border:"1px solid #d5dce6",borderRadius:9,background:"#fff",color:"#34445b",padding:"8px 11px",fontWeight:900,cursor:"pointer"},
universityDetailPage:{display:"grid",gap:14,padding:18,borderRadius:16,border:`1px solid ${COLORS.line}`,background:"#fff"},
detailHero:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:16,flexWrap:"wrap",paddingBottom:14,borderBottom:"1px solid #e8e4dc"},
detailEyebrow:{fontSize:10.5,fontWeight:900,color:"#65758a",letterSpacing:".05em"},
detailStudentCompare:{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8,minWidth:0,width:"min(100%,430px)",maxWidth:"100%"},
detailMetricGrid:{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:8},
twoColumns:{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:16},
barRow:{display:"grid",gridTemplateColumns:"100px minmax(100px,1fr) 40px 55px",alignItems:"center",gap:8},
barRowNew:{display:"grid",gridTemplateColumns:"95px minmax(120px,1fr) auto",alignItems:"center",gap:10},
dualBarWrap:{display:"grid",gap:5},
dualBarTrack:{height:8,borderRadius:999,background:"#ece9e2",overflow:"hidden"},
supportBar:{height:"100%",borderRadius:999,background:"linear-gradient(90deg,#4f79b2,#7897c2)"},
acceptBar:{height:"100%",borderRadius:999,background:"linear-gradient(90deg,#3d8656,#72a680)"},
barCounts:{display:"flex",gap:5,justifyContent:"flex-end",flexWrap:"wrap"},
barTrack:{height:9,borderRadius:999,background:"#ece9e2",overflow:"hidden"},
barFill:{height:"100%",borderRadius:999,background:"linear-gradient(90deg,#4e73a6,#8b79ad)"},
searchBox:{display:"flex",alignItems:"center",gap:10,border:"1px solid #cfd9e7",borderRadius:13,background:"#fff",padding:"10px 12px",boxShadow:"0 4px 14px rgba(48,65,88,.06)"},
universityGrid:{display:"grid",gridTemplateColumns:"1fr",gap:14},
universitySearchPanel:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap",padding:"14px 15px",border:"1px solid #dfe5ed",borderRadius:14,background:"linear-gradient(135deg,#f7faff,#fbf9ff)"},
universityList:{maxHeight:210,overflowY:"auto",display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:8,alignContent:"start",paddingRight:3},
universityButton:{display:"grid",gap:7,textAlign:"left",padding:"10px 11px",border:`1px solid ${COLORS.line}`,background:"#fff",borderRadius:10,cursor:"pointer",minWidth:0},
universityButtonActive:{borderColor:COLORS.blue,background:"#edf3ff",boxShadow:"0 4px 12px rgba(49,90,155,.12)"},
universityDetail:{minWidth:0,background:"#fff",border:`1px solid ${COLORS.line}`,borderRadius:13,padding:16},
universityHead:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:14,marginBottom:15,paddingBottom:14,borderBottom:"1px solid #ebe7de"},
universityMetrics:{display:"grid",gridTemplateColumns:"repeat(4,minmax(95px,1fr))",gap:8},
modePanel:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,padding:"14px 15px",border:"1px solid #dbe2ec",borderRadius:14,background:"linear-gradient(135deg,#f7f9fc,#ffffff)"},
modeTabs:{display:"flex",gap:8,flexWrap:"wrap"},
modeButton:{border:"1px solid #cfd7e2",background:"#fff",borderRadius:10,padding:"10px 17px",fontWeight:900,fontSize:13.5,cursor:"pointer",color:"#354052",letterSpacing:"-.01em"},
modeButtonActive:{background:"#233f68",borderColor:"#233f68",color:"#ffe06a",boxShadow:"0 4px 10px rgba(35,63,104,.20)"},
badge:{display:"inline-flex",alignItems:"center",justifyContent:"center",border:"1px solid",borderRadius:999,padding:"5px 9px",fontSize:11,fontWeight:800,whiteSpace:"nowrap"},
registrationBadge:{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:45,borderRadius:999,padding:"5px 8px",fontSize:11,fontWeight:800},
rateBadge:{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:52,padding:"4px 7px",borderRadius:999,background:"#f6f4ef",fontWeight:800},
pagination:{display:"flex",justifyContent:"center",alignItems:"center",gap:10,paddingTop:4},
pageButton:{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:5,minWidth:84,padding:"9px 13px",border:"1px solid #ccd5e1",borderRadius:10,background:"#fff",color:"#33445b",fontWeight:900,cursor:"pointer",boxShadow:"0 2px 6px rgba(44,58,78,.06)"},
pageStatus:{display:"inline-flex",alignItems:"center",gap:7,minWidth:76,justifyContent:"center",padding:"8px 12px",borderRadius:10,background:"#eef3f9",color:"#5e6b7b",fontSize:12},
adminTabs:{display:"flex",gap:6,flexWrap:"wrap",padding:6,background:"#f2f0eb",borderRadius:12},
adminTab:{border:0,background:"transparent",padding:"9px 13px",borderRadius:8,fontWeight:800,cursor:"pointer"},
adminTabActive:{background:"#2f4630",color:"#fff"},
uploadBox:{minHeight:150,display:"flex",alignItems:"center",justifyContent:"center",gap:16,padding:20,border:"1px dashed #cfc7b8",borderRadius:14,background:"#fff"},
fileButton:{display:"inline-flex",alignItems:"center",gap:6,background:COLORS.blue,color:"#fff",borderRadius:9,padding:"10px 13px",fontWeight:800,cursor:"pointer"},
previewHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,padding:"12px 14px",border:`1px solid ${COLORS.line}`,borderRadius:11,background:"#fff"},
qualityGrid:{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:8},
actions:{display:"flex",gap:8,justifyContent:"flex-end"},
primaryButton:{display:"inline-flex",alignItems:"center",gap:6,border:0,borderRadius:9,background:"#2f5b3a",color:"#fff",padding:"10px 14px",fontWeight:800,cursor:"pointer"},
secondaryButton:{border:"1px solid #d9d2c5",borderRadius:9,background:"#fff",padding:"10px 14px",fontWeight:800,cursor:"pointer"},
dangerButton:{display:"inline-flex",alignItems:"center",gap:5,border:"1px solid #ebc5c0",background:"#fff4f2",color:COLORS.red,borderRadius:8,padding:"7px 9px",fontWeight:800,cursor:"pointer"},
savedNotice:{display:"flex",alignItems:"center",gap:10,padding:14,border:"1px solid #cce1d1",borderRadius:11,background:"#f1f8f2"}
};
