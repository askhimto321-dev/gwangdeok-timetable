// Patch77: relationship-aware scope mapping and structured shared conditions.
const compact = x => String(x ?? '').normalize('NFKC').replace(/\s/g, '');
export const PARSE_REVIEW = '복합 문장·추가조건 또는 생략된 반영영역을 원문과 대조해야 함';
const SCOPE_REVIEW = '모집단위·계열 적용범위 확정 필요';
const unitAlias = s => ({의예:'의예과',의대:'의예과',의과대학:'의예과',의학과:'의예과',치의예:'치의예과',한의예:'한의예과',수의예:'수의예과',약학:'약학과',약학대학:'약학과',약학부:'약학과',약학전공:'약학과',간호:'간호학과',간호학:'간호학과',간호대학:'간호학과',간호학부:'간호학과',물리치료:'물리치료학과',클라우드공학:'클라우드공학과',바이오로직스:'바이오로직스학과',항공시스템공학:'항공시스템공학과',경찰행정:'경찰행정학과'}[s]||s);
const scopeUnits = s => compact(s).split(/[,/|]/).filter(Boolean).map(unitAlias);
const removeReason=(reasons,test)=>reasons.filter(r=>!test(r));
function normalizeUniversity(row,reasons) {
 const exact={
  '강원대(강릉)':['강원대','강릉'],'을지대(대전)':['을지대','대전'],
  '동국대(바이오메디)':['동국대','바이오메디'],'홍익대(서울/세종)':['홍익대','서울'],
 };
 if(exact[row.university]){[row.university,row.campus]=exact[row.university];reasons=removeReason(reasons,r=>r==='대학·캠퍼스 구분 확인 필요');}
 else if(/^포항공대\(POSTECH\)$/.test(row.university)){row.university='포항공대';row.trackAliases=[row.trackAliases,'POSTECH'].filter(Boolean).join('|');reasons=removeReason(reasons,r=>r==='대학·캠퍼스 구분 확인 필요');}
 else if(/^(?:DGIST|GIST|KAIST|KENTECH|UNIST)\(/.test(row.university)){
  // Parentheses contain a full-name alias, not a campus.
  reasons=removeReason(reasons,r=>r==='대학·캠퍼스 구분 확인 필요');
 }
 else if(/^(?:부산대|서울대|전남대)\(학석사통합\)$/.test(row.university)){
  row.university=row.university.replace(/\(학석사통합\)$/,'');reasons=removeReason(reasons,r=>r==='대학·캠퍼스 구분 확인 필요');
 }
 else if(row.university==='단국대(죽전/천안)'&&/^죽전(?:$|\()/.test(compact(row.department))){row.university='단국대';row.campus='죽전';row.department=compact(row.department).replace(/^죽전(?:\((.*)\))?$/,(_,x)=>x||'전체');reasons=removeReason(reasons,r=>r==='대학·캠퍼스 구분 확인 필요');}
 else if(row.university==='단국대(죽전/천안)'&&/^(?:천안|\[천안\])/.test(compact(row.department))){row.university='단국대';row.campus='천안';row.department=compact(row.department).replace(/^\[?천안\]?(?:\((.*)\))?/,(_,x)=>x||'');reasons=removeReason(reasons,r=>r==='대학·캠퍼스 구분 확인 필요');}
 else if(row.university==='한국외대(서울/글로벌)'&&/^(?:서울|글로벌)캠?$/.test(compact(row.department))){row.university='한국외대';row.campus=compact(row.department).startsWith('서울')?'서울':'글로벌';row.department='전체';row.scopeType='전체';reasons=removeReason(reasons,r=>r==='대학·캠퍼스 구분 확인 필요'||r===SCOPE_REVIEW);}
 else if(row.university==='명지대'&&/^(?:인문|자연)캠$/.test(compact(row.department))){row.campus=compact(row.department).startsWith('인문')?'서울':'용인';row.department='전체';row.scopeType='전체';reasons=removeReason(reasons,r=>r==='대학·캠퍼스 구분 확인 필요'||r===SCOPE_REVIEW||r==='다른 예외 모집단위의 제외범위 확정 필요');}
 return reasons;
}
function normalizeScope(row,reasons) {
 if(!reasons.includes(SCOPE_REVIEW))return reasons;
 let scope=compact(row.department)
  .replace(/자율\/자유전공학부/g,'자율전공학부,자유전공학부')
  .replace(/(학과|학부|전공|계열|대학)(?:모집단위|수능최저)$/,'$1')
  .replace(/한의예(?:과)?\(인문[·/]자연\)/g,'한의예과')
  .replace(/^통합\((.+)\)$/,'$1')
  .replace(/체능/g,'예체능');
 const m=scope.match(/^((?:의|치의|한의|수의)예과)\((지역의사선발)\)$/);
 if(m&&compact(row.track).includes(m[2])){row.scopeType='학과';row.department=m[1];return removeReason(reasons,r=>r===SCOPE_REVIEW);}
 const units=scopeUnits(scope).map(s=>s.replace(/\((?:인문[·/]?자연|인문|자연)\)$/,''));
 if(units.length&&units.every(s=>/^(?:의예과|치의예과|한의예과|수의예과|약학과|간호학과)$/.test(s))){row.scopeType='학과';row.department=[...new Set(units)].join('|');return removeReason(reasons,r=>r===SCOPE_REVIEW);}
 if(/^(?:인문|자연|체육|예술·체육|예체능|인문사회|인문사회및자연과학계열)(?:[|,/·](?:인문|자연|체육|예술·체육|예체능))*$/.test(scope)){
  row.scopeType='계열';row.department=scope.split(/[|,/]/).map(s=>s.replace(/계열$/,'')).join('|');return removeReason(reasons,r=>r===SCOPE_REVIEW);
 }
 if(/^(?:전체|전모집단위|해당전형모집단위|원문전형모집단위)$/.test(scope)){
  row.scopeType='전체';row.department='전체';return removeReason(reasons,r=>r===SCOPE_REVIEW);
 }
 const excluded=scope.match(/^(?:전체|전모집단위)\(([^()]+)제외\)$/);
 if(excluded){row.scopeType='전체';row.department='전체';row.excluded=[...new Set([...scopeUnits(row.excluded),...scopeUnits(excluded[1])])].join('|');return removeReason(reasons,r=>r===SCOPE_REVIEW);}
 if(/^(?:서울|글로벌|다빈치)전?캠(?:퍼스)?$/.test(scope)){row.scopeType='전체';row.campus=scope.replace(/전?캠(?:퍼스)?$/,'');row.department='전체';return removeReason(reasons,r=>r===SCOPE_REVIEW);}
 const campusAll=scope.match(/^(서울|글로벌|다빈치|평택)전모집단위$/);
 if(campusAll){row.scopeType='전체';row.campus=campusAll[1];row.department='전체';return removeReason(reasons,r=>r===SCOPE_REVIEW);}
 if(/^(?:일반고전형|일반고\(특별\)-간호학과)$/.test(scope)){row.scopeType='학과';row.department=scope.includes('간호')?'간호학과':'전체';return removeReason(reasons,r=>r===SCOPE_REVIEW);}
 const flat=scope.replace(/\((?:인문[·/]?자연|인문|자연|야)\)$/g,'').split(/[,/|]/).filter(Boolean).map(unitAlias);
 const field=s=>/^(?:인문|자연|상경|체육|예체능|예술·체육|인문사회|보건)(?:계열)?$/.test(s);
 const named=s=>/(?:학과|학부|대학|계열|계열광역|전공|칼리지|캠)$/.test(s);
 if(flat.length&&flat.every(s=>field(s)||named(s))){row.scopeType=flat.every(field)?'계열':flat.every(named)?'학과':'혼합';row.department=[...new Set(flat.map(s=>s.replace(/^\[?천안\]?/,'').replace(/계열$/,'')))].join('|');return removeReason(reasons,r=>r===SCOPE_REVIEW);}
 return reasons;
}
const scopedLines = value => String(value||'').split(/\n|\s+\/\s+(?=[^⇨\n]+⇨)/).filter(s=>s.trim());
function scopedNote(row) {
 const lines=scopedLines(row.note);
 const branches=lines.map(s=>s.match(/^\s*(.+?)\s*⇨\s*(.+)$/));
 // Only a complete list of explicitly scoped branches may be separated.
 if(!branches.length||branches.some(x=>!x))return row.note;
 const own=branches.filter(b=>scopeUnits(b[1]).join('|')===scopeUnits(row.department).join('|'));
 if(row.scopeType!=='전체'&&row.scopeType!=='미확정'&&own.length===1&&compact(own[0][2])===compact(row.ruleText))return '';
 // Some rows carry one exact inquiry-calculation note rather than a department branch.
 if(/^탐\(2\)⇨평균반영:소수점절사$/.test(compact(row.note)))return '탐구 2과목 평균 소수점 절사';
 return row.note;
}
export function normalizeMinimumSubjects(value, year) {
 return String(value ?? '').replace(/한국사/g,'한').replace(/국어/g,'국').replace(/수학/g,'수').replace(/영어/g,'영')
  .replace(Number(year)>=2028?/통합사회|통사|사회탐구|사탐/g:/(?!)/g,'사')
  .replace(Number(year)>=2028?/통합과학|통과|과학탐구|과탐/g:/(?!)/g,'과')
  // 기존 학교 자료는 2028 체계에서도 넓은 영역을 단순히 '탐구'라고 적은 경우가 많습니다.
  // 이 표기는 통합사회·통합과학 가운데 한 영역을 고르는 뜻으로 구조화합니다.
  .replace(Number(year)>=2028?/탐구/g:/(?!)/g,'사/과');
}
export function parseExplicitMinimum(condition, note, year) {
 const fields={ruleType:'',subjects:'',count:null,threshold:null,mandatory:'',englishMax:null,historyMax:null,inquiryMode:'해당없음',rounding:'없음',englishConversion:'없음'};
 let text=compact(condition).replace(/(영역|과목)([1-5])개/g,'$2개$1'), extra=compact(note);
 if(Number(year)===2027){
  // A history ceiling in the note is independent of the selected grade sum.
  const historyCaps=[...`${text} ${extra}`.matchAll(/한국사\s*([1-9])(?!\d|[~～·-])(?:등급)?(?:이내|이하)?/g)].map(m=>Number(m[1]));
  if(new Set(historyCaps).size>1)return null;
  fields.historyMax=historyCaps[0]??null;
  const first=text.split(/\n|※/)[0];
  const sum=first.match(/^([1-4])개(?:영역|과목)?(?:등급)?합(?:계)?([1-9]\d?)/);
  const each=first.match(/^([1-4])개(?:영역|과목)?(?:각각|각)?([1-9])등급/) || first.match(/^([1-4])개(?:영역|과목)?(?:각각|각)([1-9])등급/);
  if(!sum&&!each)return null;
  const count=Number((sum||each)[1]),threshold=Number((sum||each)[2]);
  const detail=compact(condition);
  const scienceOnly=/과\(?[12]\)?|과탐/.test(detail)&&!/탐\(?[12]\)?/.test(detail.replace(/과탐/g,''));
  // 구형 탐구 한 영역을 사·과 두 영역으로 펼치면 2합/3합을 잘못 충족한다.
  // 통합사회·통합과학 중 한 영역만 참고 환산하고, 미/기는 수학 필수 지정이 아니다.
  return {...fields,ruleType:sum?'합':'각',subjects:scienceOnly?'국|수|영|과':'국|수|영|사/과',count,threshold,mandatory:'',inquiryMode:'통합개별',referenceMapped:true};
 }
 if(Number(year)!==2028)return null;
 // A repeated verbatim condition adds no new restriction. Never discard scoped notes.
 if(extra===text)extra='';
 text=[text,extra].filter(Boolean).join('※').replace(/과팀/g,'과탐').replace(/수능최저학력기준|수능최저기준|수능최저|최저/g,'').replace(/^⇨/,'');
 text=text.replace(/^국수영(?=[1-5](?:개|합|등급))/,'국,수,영');
 text=text.replace(/※?(?:적성·인성|인·적성)면접추가시행/g,'');
 if(/^(?:미적용|없음|기준없음|※|[.,;])+$/u.test(text)&&/미적용|없음/.test(text))return {...fields,ruleType:'없음'};
 // Population-based conversion, conditional inclusion, alternatives and scoped notes
 // need a separate rule model; never mistake these for a simple grade ceiling.
 const mandatory=[];
 text=text.replace(/(?:국어|국),(?:수학|수)중1개(?:영역|과목)?(?:을)?(?:필수)?(?:포함하여|포함)/g,()=>{mandatory.push('국/수');return '';});
 // 판정식과 무관한 전형 안내는 비고에 있어도 최저 계산을 막지 않습니다.
 text=text.replace(/※?학생부100%전형/g,'').replace(/※?한국사(?:에)?포함/g,'');
 const inquiryAverageNote=/탐구(?:영역)?[:：]?2(?:개)?과목평균/.test(text);
 const inquiryOne=/사\/과\(1\)|탐\(1\)/.test(text);
 const inquiryTwo=/사\/과\(2\)|탐\(2\)|과탐2개?과목평균/.test(text);
 if(inquiryAverageNote&&inquiryTwo){fields.inquiryMode='통합평균';text=text.replace(/※?(?:탐구(?:영역)?[:：]?|과탐)2(?:개)?과목평균/g,'');}
 // 건국대처럼 본문은 '사/과(1)'로 한 영역을 명시했지만 비고에는 구체제의
 // '탐구 2과목 평균' 문장이 함께 남은 2028 자료가 있습니다. 2028 모평 입력에는
 // 선택탐구 2과목이 없으므로 본문의 명시적 (1)을 우선하고 사·과 중 한 영역으로 판정합니다.
 else if(inquiryAverageNote&&inquiryOne){fields.referenceMapped=true;text=text.replace(/※?(?:탐구(?:영역)?[:：]?|과탐)2(?:개)?과목평균/g,'');}
 else if(inquiryAverageNote)return null;
 if(/누적|%|경우|간주|대체|⇨|：|:|또는|직/.test(text))return null;
 text=text.replace(/수학(?:,|과)(과학|과탐|탐구)필수포함/g,(_,s)=>{mandatory.push('수',s==='탐구'?'탐':'과');return '';});
 text=text.replace(/(국어|수학|영어|탐구)(?:필수포함|필수반영|포함하여|포함)/g,(_,s)=>{mandatory.push({국어:'국',수학:'수',영어:'영',탐구:'탐'}[s]);return '';});
 text=text.replace(/([국수영])(?:필수포함|필수반영|포함하여|포함)/g,(_,s)=>{mandatory.push(s);return '';});
 text=text.replace(/(국어|수학|영어|과학|탐구)\(필수\)/g,(_,s)=>{mandatory.push({국어:'국',수학:'수',영어:'영',과학:'과',탐구:'탐'}[s]);return s;});
 text=text.replace(/([국수영사과])\(필수\)/g,(_,s)=>{mandatory.push(s);return s;});
 for(const [name,field] of [['한국사','historyMax'],['영어','englishMax']]) {
  const vals=[];
  text=text.replace(new RegExp(name+'([1-9])(?!개|[~～·-])(?:등급)?(?:이내|이하)?','g'),(_,n)=>{vals.push(+n);return '';});
  if(new Set(vals).size>1)return null;
  fields[field]=vals[0]??null;
 }
 if(/탐구(?:영역)?[:：]?2(?:개)?과목평균|과탐2개?과목평균|사\/과\(2\)(?:\(소수점(?:첫째자리(?:에서)?)?(?:절사|올림|반올림)\))?/.test(text)) {
  fields.inquiryMode='통합평균';text=text.replace(/(?:탐구(?:영역)?[:：]?|과탐)2(?:개)?과목평균/g,'');
 }
 const exactAverage=/절사하지않고소수점까지반영/.test(text);
 text=text.replace(/절사하지않고소수점까지반영/g,'');
 for(const [pattern,value] of [[/소수점(?:첫째자리(?:에서)?)?절사/g,'절사'],[/소수점첫째자리(?:에서)?올림/g,'올림'],[/소수점(?:첫째자리(?:에서)?)?반올림/g,'반올림']]) {
  if(pattern.test(text)){if(fields.rounding!=='없음'&&fields.rounding!==value)return null;fields.rounding=value;text=text.replace(pattern,'');}
 }
 if(/영어1[~～·-]2등급(?:은|을)?(?:모두|통합)?1등급(?:으로)?반영/.test(text)){fields.englishConversion='2등급까지1';text=text.replace(/영어1[~～·-]2등급(?:은|을)?(?:모두|통합)?1등급(?:으로)?반영/g,'');}
 text=text.replace(/(?:적성·인성|인·적성)면접추가시행/g,'').replace(/한국사(?:수능최저학력기준)?(?:에)?포함/g,'').replace(/수학,?(?:과학|과탐)필수포함/g,'').replace(/수학과탐구필수포함/g,'');
 if(/사\/과\(2\)\(필수\)/.test(text)){mandatory.push('탐');text=text.replace(/사\/과\(2\)\(필수\)/g,'사/과(2)');}
 if(exactAverage&&(fields.inquiryMode!=='통합평균'||fields.rounding!=='없음'))return null;
 text=normalizeMinimumSubjects(text,year).replace(/탐\(사\/과\)\(1\)|탐\(1\)/g,'사/과').replace(/사\/과\(1\)/g,'사/과').replace(/중([1-5])개영역중등급합/g,'중$1개영역등급합');
 if(fields.inquiryMode==='통합평균')text=text.replace(/사\/과\(2\)|탐\(2\)/g,'탐');
 text=text.replace(/\[공통\]|\(\)|\(단,?\)|\(단,?/g,'').replace(/\)/g,'').replace(/※|;|및/g,'').replace(/\.(?![0-9])/g,'').replace(/,+$/,'');
 const fixed=text.match(/^국,영,(탐)중상위2개영역과수(?:학)?합산(?:(?:등급)?합)?([1-9][0-9]?)(?:등급)?(?:이내|이하)?$/);
 if(fixed&&fields.inquiryMode==='통합평균')return {...fields,ruleType:'합',subjects:'국|영|탐|수',count:3,threshold:+fixed[2],mandatory:[...new Set(['수',...mandatory])].join('|')};
 const declared=text.match(/([1-5])개영역중/);
 if(declared){const prefix=text.slice(0,declared.index);if(prefix.split(',').length!==Number(declared[1]))return null;text=text.replace(/[1-5]개영역중/,'중');}
 const pool='([국수영사과한탐/]+(?:,[국수영사과한탐/]+)+)';
 let m=text.match(new RegExp('^'+pool+'(?:중)?(?:상위)?([1-5])개?(?:영역|과목)?(?:등급)?(?:합|합계)([1-9][0-9]?)(?:등급)?(?:이내|이하)?$'));
 let type='합';
 if(!m){m=text.match(new RegExp('^'+pool+'(?:중)?([1-5])개?(?:영역|과목)?(?:각각|각|모두)([1-9])(?:등급)?(?:이내|이하)?$'));type='각';}
 if(!m){
  // Named areas followed by "each" mean every listed area, never best one.
  // "중" without a selection count remains ambiguous and is not guessed.
  const all=text.match(new RegExp('^'+pool+'(?:각각|각|모두)([1-9])(?:등급)?(?:이내|이하)?$'));
  if(all){m=[all[0],all[1],String(all[1].split(',').length),all[2]];type='각';}
 }
 if(!m){m=text.match(new RegExp('^'+pool+'(?:중)?(1)개(?:영역|과목)(?:이상)?([1-9])등급(?:이내|이하)?$'));type='각';}
 if(!m){
  const reverse=text.match(new RegExp('^'+pool+'(?:[1-5]개영역)?중([1-9])등급([1-5])개(?:이상)?$'));
  if(reverse){m=[reverse[0],reverse[1],reverse[3],reverse[2]];type='각';}
 }
 if(!m)return null;
 const groups=m[1].split(','),flat=groups.flatMap(g=>g.split('/'));
 if(groups.some(g=>!['국','수','영','사','과','한','탐','사/과'].includes(g))||new Set(flat).size!==flat.length)return null;
 if(flat.includes('탐')&&fields.inquiryMode!=='통합평균')return null;
 if(fields.inquiryMode==='통합평균'&&(flat.includes('사')||flat.includes('과')||!flat.includes('탐')))return null;
 if(fields.rounding!=='없음'&&fields.inquiryMode!=='통합평균')return null;
 if(mandatory.some(s=>s.split('/').some(x=>!flat.includes(x))))return null;
 fields.mandatory=[...new Set(mandatory)].join('|');
 if(flat.includes('사')||flat.includes('과'))fields.inquiryMode='통합개별';
 return {...fields,ruleType:type,subjects:groups.join('|'),count:+m[2],threshold:+m[3]};
}
export function repairMinimumRow(input) {
 let row={...input,subjects:normalizeMinimumSubjects(input.subjects,input.admissionYear),mandatory:normalizeMinimumSubjects(input.mandatory,input.admissionYear)};
 if(row.reviewStatus!=='검토필요'||![2027,2028].includes(Number(row.admissionYear)))return row;
 let reasons=String(row.reviewReason||'').split(' · ');
 reasons=normalizeUniversity(row,reasons);
 // Patch72 inherited an 의예-only warning into sibling branches; substring
 // matching also incorrectly treated 한의예과 as 의예과. Clear only those known
 // warnings where this scope demonstrably excludes 의예과.
 if(row.university==='가천대'&&(
  row.scopeType==='학과'&&!scopeUnits(row.department).includes('의예과')||
  ['전체','계열'].includes(row.scopeType)&&scopeUnits(row.excluded).includes('의예과')
 ))reasons=reasons.filter(r=>!['원문 대조 필요: 의예 최저는 2·10·14쪽의 해당 전형 조건을 함께 확인','의예 조건이 일반표와 의예 표에서 다르게 기재됨'].includes(r));
 reasons=normalizeScope(row,reasons);
 if(Number(row.admissionYear)===2027&&reasons.includes('2027 선택과목·전형명·별도조건 원문 확인 필요')){
  const parsed=parseExplicitMinimum(row.ruleText,row.note,row.admissionYear);
  if(parsed){row={...row,...parsed};reasons=removeReason(reasons,r=>r==='2027 선택과목·전형명·별도조건 원문 확인 필요');}
 }
 if(compact(row.ruleText)==='미선발'&&reasons.includes(PARSE_REVIEW)){row.reviewStatus='사용안함';row.reviewReason='';return row;}
 const parseableReasons=new Set([PARSE_REVIEW,'탐구 (2)의 계산 방법·적용 범위 확인 필요','원문 오탈자 의심: 과팀 표기를 그대로 보존']);
 const isParseableReason=reason=>parseableReasons.has(reason)||/^탐구 반영 확인:/.test(reason)||(
  reason==='탐구·직탐 선택 방식 확인 필요'&&!/직/.test(`${row.ruleText} ${row.note}`)
 );
 if(reasons.some(isParseableReason)) {
  const parsed=parseExplicitMinimum(row.ruleText,scopedNote(row),row.admissionYear);
  if(parsed){row={...row,...parsed};reasons=reasons.filter(reason=>!isParseableReason(reason));}
 }
 // A clearly stated no-minimum rule remains such even when the same note repeats
 // it or contains a non-CSAT selection notice. Scoped exceptions remain blocked.
 if(reasons.includes(PARSE_REVIEW)&&/^(?:미적용|수능최저미적용)(?:※수능최저학력기준없음)?$/.test(compact(row.ruleText))&&!/⇨/.test(row.note)){
  const residue=compact(row.note).replace(/수능최저학력기준없음/g,'').replace(/학업탐구역량입증자료도입/g,'');
  if(!residue){row={...row,ruleType:'없음',subjects:'',count:null,threshold:null,mandatory:'',englishMax:null,historyMax:null,inquiryMode:'해당없음',rounding:'없음',englishConversion:'없음'};reasons=removeReason(reasons,r=>r===PARSE_REVIEW);}
 }
 reasons=normalizeScope(row,reasons);
 row.reviewReason=reasons.join(' · ');
 if(!row.reviewReason)row.reviewStatus='계산가능';
 return row;
}
export function minimumReviewDisposition(row) {
 if(row.reviewStatus!=='검토필요')return {code:'resolved',label:'자동 판정 가능',action:'추가 검토 없음'};
 const issues=minimumReviewIssues(row),codes=new Set(issues.map(i=>i.code));
 if(codes.has('season'))return {code:'reference',label:'수시 판정 대상 아님',action:'원문 조회용으로 유지하고 수시지원 자동 연결에서 제외'};
 if(codes.has('conflict'))return {code:'official',label:'대학 공식자료 확인',action:'최종 모집요강에서 전형·모집단위 조건을 확인한 뒤 상충 행 중 하나를 확정'};
 if(codes.has('year2027')&&(codes.has('track')||codes.has('scope')))return {code:'source-missing',label:'현재 원문 정보 부족',action:'2027 대학별 모집요강에서 전형명·반영영역·탐구 처리·한국사 조건을 보완'};
 if(codes.has('conversion')||codes.has('alternative')||codes.has('grammar')||codes.has('inquiry'))return {code:'engine',label:'판정 규칙 확장 필요',action:'복합 포함조건·대체영역·조건부 환산·탐구 계산을 구조화한 뒤 경계값 테스트'};
 return {code:'mapping',label:'연결 정보 보완',action:'대학·캠퍼스·전형·계열·학과·제외범위를 홈페이지 표기와 정확히 매핑'};
}
const plan=(code,label,action,required)=>({code,label,action,required});
export function minimumMappingPlan(row) {
 if(minimumReviewDisposition(row).code!=='mapping')return null;
 const issues=new Set(minimumReviewIssues(row).map(i=>i.code)),reason=String(row.reviewReason||'');
 if(issues.has('year2027'))return plan('legacy-2027','2027 세부조건 연결','2027 원문에서 반영영역·탐구 수·별도조건을 채운 뒤 현재 전형 키에 연결','반영영역, 탐구 처리, 별도조건');
 if(issues.has('campus'))return plan('campus-split','대학·캠퍼스 분리','괄호 안 복수 캠퍼스를 대학명과 캠퍼스 열로 분리하고 캠퍼스별 행으로 연결','표준 대학명, 캠퍼스, 캠퍼스별 적용범위');
 if(issues.has('scoped-note'))return plan('scope-branch','학과별 조건 분기','공통 행과 학과별 예외 행을 분리하고 각 행의 적용범위·제외범위를 서로 맞춤','범위유형, 표준 모집단위, 제외범위');
 const hasScope=reason.includes('모집단위·계열 적용범위'),hasExcluded=reason.includes('다른 예외 모집단위');
 if(hasScope&&hasExcluded)return plan('scope-exception-pair','적용·제외범위 짝맞춤','일반 규칙의 제외범위와 예외 규칙의 적용범위를 같은 표준 모집단위명으로 맞춤','표준 모집단위, 일반행 ID, 예외행 ID');
 if(hasExcluded)return plan('exclusion-boundary','제외범위 확정','같은 대학·전형의 예외 행을 찾아 일반 행의 제외범위에 정확히 연결','예외 모집단위, 연결 규칙 ID');
 return plan('scope-canonical','모집단위 표준화','원문 모집단위를 계열 또는 학과로 판별하고 홈페이지 표준명과 별칭을 연결','범위유형, 표준 모집단위, 모집단위 별칭');
}
export function minimumRulePattern(row) {
 if(minimumReviewDisposition(row).code!=='engine')return null;
 const issues=new Set(minimumReviewIssues(row).map(i=>i.code));
 const text=compact(`${row.ruleText} ${row.note}`);
 if(issues.has('conversion'))return plan('conditional-conversion','조건부 등급 환산','과목·원등급·집단비율 조건을 별도 환산 규칙으로 저장한 뒤 계산 전 적용','환산과목, 원등급, 환산등급, 발동조건');
 if(issues.has('alternative'))return plan('subject-substitution','대체영역 허용','직탐·제2외국어·한문 등 대체 가능한 원영역과 대상영역을 명시','원영역, 대체영역, 허용 모집단위');
 if(issues.has('scoped-note'))return plan('multi-scope-rule','학과별 다중 규칙','비고의 학과별 조건을 독립 규칙 행으로 분리하고 공통조건만 공유','분기 모집단위, 분기별 규칙, 공통조건');
 if(/상위2개영역과수학|수학합산/.test(text))return plan('fixed-plus-best','고정영역+상위영역','필수 고정영역과 나머지 후보 중 상위 N개를 별도 구조로 계산','고정영역, 후보영역, 선택수, 합 기준');
 if(/반올림/.test(text))return plan('inquiry-rounding','탐구 평균 반올림','탐구 2과목 평균의 반올림 자릿수와 방식을 구조화','탐구 과목수, 평균, 반올림 자릿수');
 if(issues.has('inquiry'))return plan('inquiry-aggregation','탐구 2과목 계산','탐구 2과목의 평균·상위과목·절사 여부를 확정해 하나의 반영등급으로 계산','탐구 과목수, 집계방식, 소수 처리');
 if(/제2외국어|한문영역응시필수/.test(text))return plan('required-exam','응시 필수영역','등급 합과 별개인 응시 여부 조건을 학생 성적 입력과 연결','필수 응시영역, 충족값');
 if(/2합8|3개합3|3개합6/.test(text)&&!/국|수|영|사|과/.test(text.replace(/[0-9합이내개]/g,'')))return plan('missing-subject-pool','반영영역 원문 보완','합 기준만 있는 행에 실제 반영영역과 선택 수를 원문에서 보완','후보영역, 선택수, 합 기준');
 if(/또는|경우|중하나만족/.test(text))return plan('conditional-choice','조건부 선택 규칙','조건에 따른 기준 변경 또는 여러 기준 중 하나 충족을 OR 분기로 계산','발동조건, 대안 규칙, 선택방식');
 if(/필수/.test(text))return plan('required-subject','필수영역 포함','상위 N개 선택 전에 필수 포함영역을 고정하고 나머지를 선택','필수영역, 후보영역, 선택수');
 if(/미선발/.test(text))return plan('non-applicable','판정 대상 제외','미선발 행은 자동 판정 대상에서 제외하고 조회용 상태로 분리','비적용 상태');
 if(/면접추가시행|인·적성면접/.test(text))return plan('non-csat-note','비수능 조건 분리','면접 안내를 수능최저 규칙에서 분리하고 참고조건으로 보존','수능 규칙, 참고조건');
 return plan('grammar-normalize','조건 문법 표준화','원문 표현을 후보영역·선택수·합/각 기준·별도상한으로 분해','후보영역, 선택수, 판정방식, 기준값');
}
export function minimumReviewIssues(row) {
 if(row.reviewStatus!=='검토필요')return [];
 const reason=row.reviewReason||'',text=`${row.ruleText} ${row.note}`,issues=[];
 const add=(code,label,action)=>issues.push({code,label,action});
 if(/상충|다르게|상이|불일치|3합6.*3합4/.test(reason))add('conflict','원문 조건 상충','같은 학년도·전형의 대학 모집요강과 대조해 기준을 확정');
 if(/미기재/.test(row.track)||/세부전형명/.test(reason))add('track','전형명 누락','모집요강의 전형명을 입력하고 홈페이지 전형명은 전형별칭에 연결');
 if(/2027/.test(reason))add('year2027','2027 선택탐구 확인','선택과목·탐구 반영수·별도조건을 확인; 2028 통합과목과 분리');
 if(/캠퍼스/.test(reason))add('campus','대학·캠퍼스 구분','대학 약칭과 캠퍼스를 분리하고 해당 캠퍼스의 전형만 연결');
 if(/적용범위|제외범위/.test(reason))add('scope','모집단위 범위 확인','계열·학과·예외 모집단위를 분리해 적용범위와 제외범위에 입력');
 if(/누적|%/.test(text))add('conversion','조건부 등급 환산','영어 누적비율 등 환산 조건과 적용 대상이 필요; 영어 상한으로 입력하지 않음');
 if(/대체|직탐|사\/과\/직/.test(text))add('alternative','대체·직업탐구 조건','대체 허용 과목과 해당 성적을 추가해야 판정 가능');
 if(/\(2\)/.test(text)&&row.inquiryMode!=='통합평균')add('inquiry','탐구 2과목 처리','평균·반올림·절사 여부를 원문에서 확인해 탐구처리와 평균처리에 입력');
 if(/⇨|\n|공통\s*[:：]/.test(text)&&reason.includes(PARSE_REVIEW))add('scoped-note','학과별 추가조건 혼재','해당 학과의 조건과 공통조건을 분리; 다른 학과의 조건을 복사하지 않음');
 if(/수시지원 연결 대상 외/.test(reason))add('season','수시 외 조회 자료','정시·특별법대학 자료는 수시지원 자동 연결 대상에서 분리');
 if(!issues.length||reason.includes(PARSE_REVIEW)&&!issues.some(x=>['conversion','alternative','inquiry','scoped-note'].includes(x.code)))add('grammar','조건 문장 해석 보완','필수영역·합/각·반영수·별도조건을 분리; 미지원 문장은 원문과 대조해 구조화');
 return issues;
}
