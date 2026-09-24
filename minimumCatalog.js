import {repairMinimumRow,parseExplicitMinimum} from './minimumMapping.js';
import {correctMinimumSource,correct2027Conditions,expandMinimumSourceRows} from './minimumSourceCorrections.js';
// Patch77: relationship-aware scope mapping and mandatory alternative groups.
export const MINIMUM_SCHEMA = 'KD_MINIMUM_V1';
export const MINIMUM_COLUMNS = {
 schema:'양식버전', id:'규칙ID', sourceId:'원문ID', admissionYear:'학년도', season:'모집시기',
 university:'대학명', campus:'캠퍼스', admissionType:'전형유형', track:'전형명', trackAliases:'전형별칭',
 scopeType:'범위유형', department:'적용범위', excluded:'제외범위', reviewStatus:'검토상태',
 ruleType:'판정방식', subjects:'반영영역', count:'반영수', threshold:'기준등급', mandatory:'필수영역',
 englishMax:'영어별도', historyMax:'한국사별도', inquiryMode:'탐구처리', rounding:'평균처리',
 englishConversion:'영어환산', ruleText:'조건원문', note:'추가조건원문', reviewReason:'검토사유', source:'출처파일', page:'출처쪽'
};
export const compactMinimum = x => String(x ?? '').normalize('NFKC').replace(/\s/g,'');
const list = x => String(x || '').split('|').map(x=>x.trim()).filter(Boolean);
export const minimumTrackKey = x => compactMinimum(x).replace(/^(?:학생부)?(?:교과|종합)\((.*)\)$/,'$1').replace(/^(?:학생부)?(?:교과|종합)[·:：]/,'');
export const catalogTrackKey = (university,track) => {
 const key=minimumTrackKey(track).replace(/전형$/,'');
 return /고려/.test(university)&&key==='학교장추천'?'학교추천':key;
};
const baseUniversity = x => {
 const name=compactMinimum(x).replace(/\([^)]*\)/g,'').replace(/여자대학교/g,'여대').replace(/대학교/g,'대').replace(/교육대/g,'교대');
 return ({서울과기대:'서울과학기술대',한국외국어대:'한국외대',서울여자대:'서울여대',성신여자대:'성신여대',덕성여자대:'덕성여대',숙명여자대:'숙명여대'})[name]||name;
};
const catalogIndexes=new WeakMap();
function universityRows(rows,name) {
 if(!Array.isArray(rows))return [];
 let index=catalogIndexes.get(rows);
 if(!index){index=new Map();for(const r of rows){const k=baseUniversity(r.university);if(!index.has(k))index.set(k,[]);index.get(k).push(r);}catalogIndexes.set(rows,index);}
 return index.get(baseUniversity(name))||[];
}
const subjects = ['국','수','영','사','과','한','탐'];
const numberOrNull = x => x === '' || x == null ? null : Number(x);
export function validateMinimumRow(row) {
 const errors=[];
 if(row.schema!==MINIMUM_SCHEMA)errors.push('양식버전 불일치');
 if(!row.id || !row.sourceId || !row.university)errors.push('규칙ID·원문ID·대학명 필수');
 if(!Number.isInteger(row.admissionYear)||row.admissionYear<2027||row.admissionYear>2100)errors.push('학년도 오류');
 for(const k of ['count','threshold','englishMax','historyMax'])if(row[k]!=null&&!Number.isFinite(row[k]))errors.push(`${MINIMUM_COLUMNS[k]} 숫자 형식 오류`);
 if(!['수시','정시','특별법대학 선발'].includes(row.season))errors.push('모집시기 오류');
 if(!['계산가능','검토필요','사용안함'].includes(row.reviewStatus))errors.push('검토상태 오류');
 if(!['전체','학과','계열','혼합','미확정'].includes(row.scopeType))errors.push('범위유형 오류');
 if(row.reviewStatus==='계산가능') {
  if(!row.track||/미기재|미확정/.test(row.track)||row.scopeType==='미확정')errors.push('전형명·적용범위 확정 필요');
  if(row.scopeType!=='전체'&&!list(row.department).length)errors.push('적용범위 필수');
  if(row.reviewReason)errors.push('검토사유 해소 후 계산가능으로 변경');
  if(!['없음','합','각'].includes(row.ruleType))errors.push('판정방식 오류');
  if(row.ruleType!=='없음') {
   const groups=list(row.subjects).map(g=>g.split('/'));
   const flat=groups.flat();
   if(!groups.length||flat.some(s=>!subjects.includes(s))||new Set(flat).size!==flat.length)errors.push('반영영역 오류 또는 중복');
   if(!Number.isInteger(row.count)||row.count<1||row.count>groups.length)errors.push('반영수 오류');
   if(!Number.isFinite(row.threshold)||row.threshold<(row.ruleType==='각'?1:row.count)||row.threshold>(row.ruleType==='각'?9:row.count*9))errors.push('기준등급 오류');
   if(list(row.mandatory).some(group=>group.split('/').some(s=>!flat.includes(s))))errors.push('필수영역이 반영영역에 없음');
   if(list(row.mandatory).length>row.count)errors.push('필수영역 수가 반영수보다 많음');
   for(const k of ['englishMax','historyMax'])if(row[k]!=null&&(!Number.isInteger(row[k])||row[k]<1||row[k]>9))errors.push(`${MINIMUM_COLUMNS[k]} 오류`);
   if(!['해당없음','통합개별','통합평균','선택탐구'].includes(row.inquiryMode))errors.push('탐구처리 오류');
   if(!['없음','절사','올림','반올림'].includes(row.rounding))errors.push('평균처리 오류');
   if(!['없음','2등급까지1'].includes(row.englishConversion))errors.push('영어환산 오류');
   // 2027 자료는 referenceMapped=true인 경우 현재 입력된 통합사회·통합과학 등급으로
   // 참고 환산합니다. 자료 학년도와 환산 사실은 판정 결과에 남겨 실제 모집요강과 구분합니다.
   if(row.admissionYear<2028&&flat.some(s=>['사','과','탐'].includes(s))&&!row.referenceMapped)errors.push('2027 선택탐구는 참고 환산 설정 필요');
   if(flat.includes('탐')&&row.inquiryMode!=='통합평균')errors.push('탐 영역의 평균 규칙 필요');
   if(row.inquiryMode==='통합평균'&&(!flat.includes('탐')||flat.includes('사')||flat.includes('과')))errors.push('탐구 평균과 개별 영역 중복 불가');
  } else if(row.subjects||row.count!=null||row.threshold!=null||row.mandatory||row.englishMax!=null||row.historyMax!=null)errors.push('미적용 행에 계산조건이 남아 있음');
 }
 return errors;
}
const normalizedCatalogs=new WeakMap();
const EXCLUSION_REVIEW='다른 예외 모집단위의 제외범위 확정 필요';
const PARSE_REVIEW='복합 문장·추가조건 또는 생략된 반영영역을 원문과 대조해야 함';
const splitScope=x=>String(x||'').split('|').map(unitKey).filter(Boolean);
const scopedBranches=value=>String(value||'').split(/\n|\s+\/\s+(?=[^⇨\n]+⇨)/).map(s=>s.match(/^\s*(.+?)\s*⇨\s*(.+)$/)).filter(Boolean);
const ruleCore=value=>compactMinimum(value).replace(/※.*$/,'').replace(/수능최저학력기준|수능최저기준|수능최저/g,'').replace(/등급|이내|[,.]/g,'');
const structuredKeys=['ruleType','subjects','count','threshold','mandatory','englishMax','historyMax','inquiryMode','rounding','englishConversion'];
const structuredSignature=row=>JSON.stringify(structuredKeys.map(k=>row[k]));
function relationshipMapped(rows) {
 const groups=new Map();
 for(const row of rows){const key=[row.admissionYear,row.season,row.university,row.campus,row.admissionType,minimumTrackKey(row.track)].join('\u0001');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 return rows.map(row=>{
  if(row.reviewStatus==='사용안함')return row;
  const key=[row.admissionYear,row.season,row.university,row.campus,row.admissionType,minimumTrackKey(row.track)].join('\u0001'),group=groups.get(key)||[];
  const scoped=group.filter(r=>r.id!==row.id&&['학과','계열','혼합'].includes(r.scopeType)&&r.department);
  let next={...row},reasons=String(row.reviewReason||'').split(' · ').filter(Boolean);
  // A whole-scope source summary is redundant after every explicit branch has
  // its own row. Keep the source row for audit, but exclude it from matching.
  const branches=scopedBranches(row.note);
  if(row.reviewStatus==='검토필요'&&row.scopeType==='전체'&&branches.length>=1&&scoped.length){
   const covered=branches.every(b=>scopeUnitsForLink(b[1]).every(t=>scoped.some(s=>splitScope(s.department).includes(t))));
   if(covered)return {...next,reviewStatus:'사용안함',reviewReason:''};
  }
  // 예외 모집단위가 학과만으로 구성되지 않고 `자연|상경|특정학부`처럼
  // 계열과 학과가 섞인 행(혼합)으로 분리되는 대학도 있습니다. 이 행도
  // 일반 규칙의 제외범위에 연결해야 완성된 두 분기가 각각 판정됩니다.
  const childScopes=scoped.filter(s=>['학과','혼합'].includes(s.scopeType)&&(
   reasons.includes(EXCLUSION_REVIEW)||branches.some(b=>scopeUnitsForLink(b[1]).some(t=>splitScope(s.department).includes(t)))
  ));
  if(['전체','계열','혼합'].includes(row.scopeType)&&childScopes.length){
   next.excluded=[...new Set([...splitScope(row.excluded),...childScopes.flatMap(s=>splitScope(s.department))])].join('|');
  }
  if(reasons.includes(EXCLUSION_REVIEW)&&childScopes.length){
   reasons=reasons.filter(r=>r!==EXCLUSION_REVIEW);
  }
  // If the same source group contains a fully structured duplicate for exactly
  // the same scope and literal grade rule, reuse its missing calculation detail.
  // This mainly resolves rows where one source omitted only the inquiry-average
  // sentence while another source recorded it explicitly.
  const reusable=scoped.filter(s=>s.reviewStatus==='계산가능'&&s.scopeType===row.scopeType&&splitScope(s.department).join('|')===splitScope(row.department).join('|')&&ruleCore(s.ruleText)===ruleCore(row.ruleText));
  const reusableSignatures=new Set(reusable.map(structuredSignature));
  if(row.reviewStatus==='검토필요'&&reusable.length&&reusableSignatures.size===1&&reasons.length&&reasons.every(r=>r===PARSE_REVIEW||r==='탐구 (2)의 계산 방법·적용 범위 확인 필요')){
   for(const key of structuredKeys)next[key]=reusable[0][key];
   reasons=[];
  }
  next.reviewReason=reasons.join(' · ');
  if(!next.reviewReason)next.reviewStatus='계산가능';
  return next;
 });
}
function scopeUnitsForLink(value){return compactMinimum(value).split(/[,/|]/).filter(Boolean).map(unitKey);}
export function normalizeMinimumCatalog(rows=[]) {
 if(normalizedCatalogs.has(rows))return normalizedCatalogs.get(rows);
 const activeRows=expandMinimumSourceRows(rows.filter(original=>original.season==='수시'));
 const repaired=activeRows.map(original=>{
  // University/campus normalization may expose an exact source correction
  // (e.g. 단국대(죽전/천안) -> 단국대·죽전). Resolve both before validation.
  let first=repairMinimumRow(correctMinimumSource(original));
  if(original.admissionYear===2027&&original.reviewStatus==='검토필요'&&first.reviewStatus==='계산가능'&&first.ruleType!=='없음'){
   // Source-name repair can clear the last review reason before the old
   // selection-subject fields are recalculated. Never inherit those defaults.
   const parsed=parseExplicitMinimum(first.ruleText,first.note,2027);
   if(parsed)first={...first,...parsed};
   else first={...first,reviewStatus:'검토필요',reviewReason:'2027 선택과목·별도조건 원문 확인 필요'};
  }
  return correct2027Conditions(repairMinimumRow(correctMinimumSource(first)));
 });
 const linked=relationshipMapped(repaired);
 const normalized=linked.map((mapped,i)=>{
  // Do not promote a parsed row unless the complete contract validates.
  return mapped.reviewStatus==='계산가능'&&validateMinimumRow(mapped).length?activeRows[i]:mapped;
 });
 normalizedCatalogs.set(rows,normalized);normalizedCatalogs.set(normalized,normalized);
 return normalized;
}
export function parseMinimumWorkbook(workbook, XLSX) {
 const sheet=workbook.Sheets['홈페이지 연동'];
 if(!sheet)throw new Error('홈페이지 연동 시트가 없습니다. Patch72 호환 엑셀을 선택하세요.');
 const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true});
 const hi=matrix.findIndex(row=>row.includes('양식버전')&&row.includes('규칙ID'));
 if(hi<0)throw new Error('연동용 열 제목을 찾지 못했습니다.');
 const header=matrix[hi].map(x=>String(x).trim());
 const missing=Object.values(MINIMUM_COLUMNS).filter(x=>!header.includes(x));
 if(missing.length)throw new Error(`필수 열 누락: ${missing.join(', ')}`);
 if(new Set(header.filter(Boolean)).size!==header.filter(Boolean).length)throw new Error('중복된 열 제목이 있습니다.');
 const rawRows=[], ids=new Set();
 matrix.slice(hi+1).forEach((values,i)=>{
  if(!values.some(x=>String(x).trim()))return;
  let row=Object.fromEntries(Object.entries(MINIMUM_COLUMNS).map(([k,h])=>[k,String(values[header.indexOf(h)]??'').trim()]));
  for(const k of ['admissionYear','count','threshold','englishMax','historyMax'])row[k]=numberOrNull(row[k]);
  // Optional extension: the source's 2027 선택탐구 grade uses a documented
  // reference conversion to the current 통합사회·통합과학 input, not a literal 2028 rule.
  const referenceColumn=header.indexOf('2027 참고환산');
  if(referenceColumn>=0)row.referenceMapped=/^(?:1|true|y|예|적용)$/i.test(String(values[referenceColumn]??'').trim());
  else if(row.admissionYear===2027&&row.reviewStatus==='계산가능'&&/[사과탐]/.test(row.subjects)){
   // Older compatible exports did not carry this optional column. A row that
   // was already marked calculable used the documented 2027 reference mapping.
   row.referenceMapped=true;
  }
  rawRows.push({...row,__line:hi+i+2});
 });
 const normalized=normalizeMinimumCatalog(rawRows);
 const rows=[],errors=[];
 normalized.forEach(rowWithLine=>{
  const {__line,...row}=rowWithLine;
  const issues=validateMinimumRow(row);
  if(ids.has(row.id))issues.push('중복 규칙ID');ids.add(row.id);
  if(issues.length)errors.push({line:__line,id:row.id,reason:issues.join(' · ')});
  rows.push(row);
 });
 if(!rows.length)throw new Error('연동 시트에 데이터가 없습니다.');
 return {rows,errors,stats:minimumCatalogStats(rows)};
}
export function minimumCatalogStats(rows=[]) {return {total:rows.length,ready:rows.filter(r=>r.reviewStatus==='계산가능').length,review:rows.filter(r=>r.reviewStatus==='검토필요').length,disabled:rows.filter(r=>r.reviewStatus==='사용안함').length};}
export function mergeMinimumCatalog(current, incoming) {
 const map=new Map(current.filter(r=>r.season==='수시').map(r=>[r.id,r]));let added=0,changed=0,unchanged=0;
 for(const row of incoming){const before=map.get(row.id);if(!before)added++;else if(JSON.stringify(before)===JSON.stringify(row))unchanged++;else changed++;map.set(row.id,row);}
 return {rows:[...map.values()],added,changed,unchanged};
}
const gradeNames={국:'국어',수:'수학',영:'영어',사:'통합사회',과:'통합과학',한:'한국사'};
const gradeValue=x=>x!==''&&x!=null&&Number.isInteger(Number(x))&&Number(x)>=1&&Number(x)<=9?Number(x):null;
export function evaluateCatalogMinimum(row,student) {
 // Older uploads may have stored "각 4등급" with a default count of one.
 // Correct only when the complete original sentence explicitly determines it.
 if(row.reviewStatus==='계산가능'&&/(?:각각|각|모두)\s*[1-9]/.test(row.ruleText||'')){
  const parsed=parseExplicitMinimum(row.ruleText,row.note,Number(row.admissionYear)===2027?2028:row.admissionYear);
  if(parsed?.ruleType==='각'&&(row.ruleType!=='각'||row.count!==parsed.count||row.threshold!==parsed.threshold)){
   return {...evaluateCatalogMinimum({...row,...parsed},student),correctedEachRule:true};
  }
 }
 const historyInSum=list(row.subjects).some(group=>group.split('/').includes('한'));
 const base={year:row.admissionYear,ruleText:row.ruleText,subjectsText:row.subjects,source:`${row.source} · ${row.page}쪽`,note:row.note,ruleId:row.id,
  historyInSum,historyMax:row.historyMax,historyGrade:gradeValue(student?.latestMockGrades?.한국사)};
 const yearMismatch=Number(student?.admissionYear)&&Number(student.admissionYear)!==Number(row.admissionYear);
 const result=(status,reason,extra={})=>({...base,status,reason:yearMismatch?`${reason} · 학생 지원연도 ${student.admissionYear}, 자료 ${row.admissionYear} 기준`:reason,satisfied:status==='satisfied'?true:status==='unsatisfied'?false:null,yearMismatch,...extra});
 if(row.alternativeRules?.length){
  const options=row.alternativeRules.map(option=>({label:option.label,evaluation:evaluateCatalogMinimum({...row,...option,alternativeRules:null},student)}));
  const winner=options.find(x=>x.evaluation.status==='satisfied')||options.find(x=>x.evaluation.status==='unavailable')||options.find(x=>x.evaluation.status==='manual')||options[0];
  return {...winner.evaluation,ruleText:row.ruleText,note:row.note,
   reason:`${winner.label} 기준: ${winner.evaluation.reason} · ${options.map(x=>`${x.label} ${x.evaluation.status==='satisfied'?'충족':x.evaluation.status==='unsatisfied'?'미충족':'판정보류'}`).join(' / ')}`,
   alternatives:options.map(x=>({label:x.label,status:x.evaluation.status}))};
 }
 const errors=validateMinimumRow(row);
 if(row.reviewStatus!=='계산가능'||errors.length)return result('manual',row.reviewReason||errors.join(' · ')||'원문 조건 검토가 필요합니다.');
 if(row.ruleType==='없음')return result('no-minimum','해당 적용 범위에 수능최저 미적용이 명시되어 있습니다.');
 // A separate history ceiling is never evidence that history belongs in the sum.
 // Detect imported subject pools contradicting a clearly enumerated source pool.
 const sourcePool=String(row.ruleText||'').split(/중/)[0];
 const enumeratedPool=/[,·|]/.test(sourcePool)&&/국|수|영/.test(sourcePool)&&/중/.test(row.ruleText||'');
 if(historyInSum&&enumeratedPool&&!/(?:한국사|(?:^|[,·|\s])한(?:$|[,·|\s]))/.test(sourcePool)){
  const parsed=parseExplicitMinimum(row.ruleText,row.note,row.admissionYear);
  if(parsed&&!parsed.subjects.split(/[|/]/).includes('한'))return {...evaluateCatalogMinimum({...row,...parsed,historyMax:parsed.historyMax??row.historyMax,englishMax:parsed.englishMax??row.englishMax},student),correctedHistoryPool:true};
  return result('manual','반영영역에 한국사가 있으나 원문의 합산 후보에는 없습니다. 반영영역에서 한국사를 제외하고 별도 기준을 확인하세요.');
 }
 const grades=student?.latestMockGrades||{},groups=list(row.subjects).map(x=>x.split('/')),mandatory=list(row.mandatory);
 const get=(s,fill)=>{
  if(s==='탐') {let v=(get('사',fill)+get('과',fill))/2;return row.rounding==='절사'?Math.floor(v):row.rounding==='올림'?Math.ceil(v):row.rounding==='반올림'?Math.round(v):v;}
  let v=gradeValue(grades[gradeNames[s]])??fill;
  if(row.subjectBoosts?.[s])v=Math.max(1,v-row.subjectBoosts[s]);
  return s==='영'&&row.englishConversion==='2등급까지1'&&v<=2?1:v;
 };
 const requiredNames=[...new Set([...groups.flat().flatMap(s=>s==='탐'?['사','과']:[s]),...(row.englishMax?['영']:[]),...(row.historyMax?['한']:[])])];
 const missing=requiredNames.filter(s=>gradeValue(grades[gradeNames[s]])==null),missingCodes=new Set(missing);
 const simulate=fill=>{
  const candidates=[];
  const walk=(i,chosen)=>{
   if(chosen.length===row.count){if(mandatory.every(group=>group.split('/').some(s=>chosen.some(c=>c.code===s))))candidates.push(chosen);return;}
   if(i>=groups.length)return;walk(i+1,chosen);for(const s of groups[i])walk(i+1,[...chosen,{code:s,name:gradeNames[s]||'사·과 평균',grade:get(s,fill)}]);
  };walk(0,[]);
  const passes=c=>(row.ruleType==='각'?c.every(x=>x.grade<=row.threshold):c.reduce((n,x)=>n+x.grade,0)<=row.threshold)
    &&(!row.englishIfSelectedMax||!c.some(x=>x.code==='영')||c.find(x=>x.code==='영').grade<=row.englishIfSelectedMax)
    &&(!row.englishMax||(gradeValue(grades.영어)??fill)<=row.englishMax)&&(!row.historyMax||(gradeValue(grades.한국사)??fill)<=row.historyMax);
  candidates.sort((a,b)=>Number(passes(b))-Number(passes(a))||a.reduce((s,x)=>s+x.grade,0)-b.reduce((s,x)=>s+x.grade,0));
  return {selected:candidates[0],pass:candidates[0]?passes(candidates[0]):false};
 };
 const worst=simulate(9),best=simulate(1);
 if(!worst.selected)return result('manual','필수영역을 만족하는 반영 조합이 없습니다.');
 if(missing.length&&!worst.pass&&best.pass)return result('unavailable',`추가 성적 필요: ${missing.map(s=>gradeNames[s]).join('·')}`,{missingSubjects:missing.map(s=>gradeNames[s]),count:row.count,threshold:row.threshold,ruleType:row.ruleType==='합'?'sum':'each'});
 const pass=worst.pass,selected=pass?worst.selected:best.selected;
 // 후보 영역 하나(예: 한국사)가 비어 있어도 실제 최적 조합이 이미 입력된 다른 영역만으로
 // 확정되면 그 조합과 학생 합을 숨기지 않습니다. 반대로 선택 조합/별도상한에 미입력 영역이
 // 들어갈 때에는 가상 1·9등급을 학생의 실제 점수처럼 표시하지 않습니다.
 const selectedUsesMissing=selected.some(item=>missingCodes.has(item.code));
 const missingSeparateCap=(row.englishMax&&missingCodes.has('영'))||(row.historyMax&&missingCodes.has('한'));
 if(missing.length&&(selectedUsesMissing||missingSeparateCap))return result(pass?'satisfied':'unsatisfied',pass?'입력된 성적과 조건으로 충족이 확정됩니다. 미입력 성적을 유리하게 가정하지 않았습니다.':'미입력 영역을 1등급으로 가정해도 충족하지 못합니다.',{missingSubjects:missing.map(s=>gradeNames[s]),count:row.count,threshold:row.threshold,ruleType:row.ruleType==='합'?'sum':'each'});
 const sum=selected.reduce((n,x)=>n+x.grade,0);
 const extra=[row.mandatory?`필수 ${row.mandatory}`:'',row.englishMax?`영어 ${grades.영어} / ${row.englishMax} 이내`:'',row.englishIfSelectedMax&&selected.some(x=>x.code==='영')?`영어 선택 시 ${row.englishIfSelectedMax}등급 이내`:'',row.historyMax?`한국사 ${grades.한국사} / ${row.historyMax} 이내`:'',row.englishConversion!=='없음'?'영어 2등급까지 1등급 환산':'',row.referenceMapped?'2027 선택탐구를 현재 통합사회·통합과학으로 참고 환산':''].filter(Boolean).join(' · ');
 return result(pass?'satisfied':'unsatisfied',`${selected.map(x=>`${x.name} ${x.grade}`).join(' + ')}${row.ruleType==='합'?` = ${sum} / 합 ${row.threshold} 이내`:` / 각각 ${row.threshold} 이내`}${extra?' · '+extra:''}`,{studentSum:sum,selectedSubjects:selected,count:row.count,threshold:row.threshold,ruleType:row.ruleType==='합'?'sum':'each',referenceMapped:Boolean(row.referenceMapped),missingIgnored:missing.filter(code=>!selected.some(item=>item.code===code)).map(code=>gradeNames[code])});
}
const unitKey=x=>compactMinimum(x).replace(/^의(?:과대학|학과)$/,'의예과').replace(/^치의학과$/,'치의예과').replace(/^한의학과$/,'한의예과').replace(/^수의학과$/,'수의예과').replace(/^약학(?:부|대학|전공)?$/,'약학과').replace(/^간호(?:대학|학부)?$/,'간호학과');
function scopeRank(row,target) {
 const unit=unitKey(target.department),field=compactMinimum(target.field).replace(/계열$/,'');
 if(!unit)return -1;
 if(list(row.excluded).some(x=>unitKey(x)===unit||compactMinimum(x).replace(/계열$/,'')===field||(x==='디자인'&&/디자인/.test(unit))))return -1;
 if(row.scopeType==='학과')return list(row.department).some(x=>unitKey(x)===unit)?3:-1;
 if(row.scopeType==='계열')return (field&&list(row.department).some(x=>compactMinimum(x).replace(/계열$/,'')===field))||(row.department==='디자인'&&/디자인/.test(unit))?1:-1;
 if(row.scopeType==='혼합'){
  const units=list(row.department);
  // 혼합 행 안의 정확한 모집단위명은 계열명보다 우선합니다. 그렇지 않으면
  // `자연` 일반 규칙과 `의류학과` 예외 규칙이 같은 점수로 충돌할 수 있습니다.
  if(units.some(x=>unitKey(x)===unit))return 3;
  return field&&units.some(x=>compactMinimum(x).replace(/계열$/,'')===field)?1:-1;
 }
 return row.scopeType==='전체'?0:-1;
}
function universityMatch(row,target,identity) {
 return campusRank(row,target,identity)>=0;
}
function campusRank(row,target,identity) {
 if(baseUniversity(row.university)!==baseUniversity(target.university))return -1;
 const source=row.campus?`${row.university}(${row.campus})`:row.university;
 if(identity(source,'')===identity(target.university,target.region||''))return 2;
 // 원문이 캠퍼스를 비워 둔 대학은 본교/공통 행으로 취급하되, 같은 전형에 캠퍼스가
 // 명시된 행이 있으면 아래 resolve 단계에서 명시 행(2점)을 이 공통 행(1점)보다 우선합니다.
 return compactMinimum(row.campus)?-1:1;
}
const signature=r=>JSON.stringify([r.ruleType,r.subjects,r.count,r.threshold,r.mandatory,r.englishMax,r.historyMax,r.inquiryMode,r.rounding,r.englishConversion]);
function evaluable2027Reference(row,targetTrack='') {
 if(Number(row.admissionYear)!==2027||!row.referenceMapped||row.reviewStatus!=='검토필요')return row;
 const reasons=String(row.reviewReason||'').split(' · ').filter(Boolean);
 if(!reasons.length||reasons.some(reason=>reason!=='세부전형명 원문 미기재'))return row;
 return {...row,track:targetTrack||`${row.admissionType} 참고`,trackAliases:[row.trackAliases,row.track].filter(Boolean).join('|'),reviewStatus:'계산가능',reviewReason:'',referenceSourceTrack:true};
}
export function catalogRowsForTarget(rows,target,year,identity) {
 const current=Number(year)||0;
 return universityRows(rows,target.university)
  .filter(r=>r.reviewStatus!=='사용안함'&&r.season===(target.season||'수시')&&universityMatch(r,target,identity)&&scopeRank(r,target)>=0)
  .map(row=>evaluable2027Reference(row))
  .sort((a,b)=>Number(b.admissionYear===2028)-Number(a.admissionYear===2028)||Number(b.admissionYear===current)-Number(a.admissionYear===current)||Number(b.admissionYear)-Number(a.admissionYear)||campusRank(b,target,identity)-campusRank(a,target,identity));
}
export function resolveCatalogMinimum({target,student,identity}) {
 const trackKey=value=>catalogTrackKey(target.university,value);
 // Combined source labels name separate tracks (for example 세움인재 / S/W인재).
 // Accept either explicit part even when an uploaded workbook lacks aliases.
 const matchesTrack=r=>[r.track,...list(r.trackAliases),...String(r.track||'').split(/\s+\/\s+/)].some(t=>trackKey(t)===trackKey(target.track));
 const genericTrack=/^(?:학생부)?(?:교과|종합)$/.test(compactMinimum(target.track));
 const all=universityRows(student?.minimumCatalogRows||[],target.university).filter(r=>r.reviewStatus!=='사용안함');
 if(!all.length)return null;
 const sameBase=all.filter(r=>baseUniversity(r.university)===baseUniversity(target.university));
 const seasonRows=sameBase.filter(r=>r.season===(target.season||'수시'));
 // Choose a year after checking the requested campus/track/scope. An unrelated
 // 2028 track must not hide a matching 2027 reference for the requested track.
 const applicable=seasonRows.filter(r=>campusRank(r,target,identity)>=0&&r.admissionType===target.admissionType&&scopeRank(r,target)>=0&&(
  genericTrack||matchesTrack(r)||/원문미기재|미확정/.test(compactMinimum(r.track))));
 const yearCandidates=applicable.length?applicable:seasonRows;
 const preferred2028=applicable.some(r=>Number(r.admissionYear)===2028);
 const exactYear=yearCandidates.filter(r=>r.admissionYear===Number(student?.admissionYear));
 const availableYears=[...new Set(yearCandidates.map(r=>Number(r.admissionYear)).filter(Boolean))].sort((a,b)=>Math.abs(a-Number(student?.admissionYear||a))-Math.abs(b-Number(student?.admissionYear||b))||b-a);
 const selectedYear=preferred2028?2028:exactYear.length?Number(student?.admissionYear):(availableYears[0]||null);
 const year=seasonRows.filter(r=>Number(r.admissionYear)===selectedYear);
 const campusCandidates=year.map(r=>({r,rank:campusRank(r,target,identity)})).filter(x=>x.rank>=0);
 const university=campusCandidates.map(x=>x.r);
 const typed=university.filter(r=>r.admissionType===target.admissionType&&scopeRank(r,target)>=0);
 const uniqueGeneric=genericTrack&&new Set(typed.map(r=>trackKey(r.track))).size===1;
 const exactTrack=university.filter(r=>r.admissionType===target.admissionType&&(uniqueGeneric||matchesTrack(r)));
 // 2027 요약표는 일부 대학의 세부 전형명을 생략했습니다. 같은 전형유형 안에서 목표
 // 모집단위에 해당하는 행이 하나로 결정될 때만 '원문 미기재' 행을 참고 연결합니다.
 const unnamedTrack=university.filter(r=>r.admissionType===target.admissionType&&/원문미기재|미확정/.test(compactMinimum(r.track)));
 const track=exactTrack.length?exactTrack:unnamedTrack;
 const scopeCandidates=track.map(r=>({r,rank:scopeRank(r,target)})).filter(x=>x.rank>=0);
 const campusBest=Math.max(-1,...scopeCandidates.map(x=>campusRank(x.r,target,identity)));
 const scoped=scopeCandidates.filter(x=>campusRank(x.r,target,identity)===campusBest);
 if(!scoped.length) {
  if(!sameBase.length)return null;
  return {minimum:null,evaluation:{status:'unlinked',year:null,candidateYears:availableYears,linkCode:!year.length?'year':!campusCandidates.length?'campus':!track.length?'track':'scope',reason:!year.length?'연결 가능한 학년도의 최저 자료 없음':!campusCandidates.length?'대학은 있으나 캠퍼스 연결 확인 필요':!track.length?'전형명·전형유형 연결 확인 필요':'모집단위·계열·제외범위 연결 확인 필요'}};
 }
 const max=Math.max(...scoped.map(x=>x.rank)), rows=scoped.filter(x=>x.rank===max).map(x=>evaluable2027Reference(x.r,target.track));
 // An unresolved source for the same track/scope must not be hidden by a ready duplicate.
 if(rows.some(r=>r.reviewStatus!=='계산가능')||new Set(rows.map(signature)).size>1)return {minimum:rows[0],evaluation:{status:'manual',year:rows[0].admissionYear,ruleText:rows.map(r=>r.ruleText).join(' / '),source:rows.map(r=>`${r.source} ${r.page}쪽`).join(' / '),reason:rows.find(r=>r.reviewReason)?.reviewReason||'같은 범위의 조건이 상충하거나 검토가 필요합니다.'}};
 return {minimum:rows[0],evaluation:evaluateCatalogMinimum(rows[0],student)};
}
