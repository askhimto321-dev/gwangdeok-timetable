import { validGrade } from './admissionMetrics.js';
import {evaluateCatalogMinimum,MINIMUM_SCHEMA} from './minimumCatalog.js';
import {parseExplicitMinimum} from './minimumMapping.js';
import {parseAdmissionSubjectGroups} from './gradeEngine.js';
const compact = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, '').trim();
const empty = value => !compact(value) || compact(value) === '-';

// Auto-evaluate only an explicitly understood rule. Complex requirements stay manual.
export function evaluateNaviMinimumSafe(row, student) {
  if (!row) return { status:'unlinked', reason:'일치하는 최저 자료가 없습니다.' };
  if (row.catalogRule) return evaluateCatalogMinimum(row.catalogRule,student);
  if (row.schema===MINIMUM_SCHEMA) return evaluateCatalogMinimum(row,student);
  if (!Array.isArray(row)) return evaluateStoredMinimum(row, student);
  const rule=compact(row[8]), area=compact(row[6]), notes=[row[10],row[11]].filter(x=>!empty(x)).join(' · ');
  const base={ruleText:String(row[8] || ''),subjectsText:String(row[6] || ''),note:notes,year:2027,yearMismatch:Boolean(student?.admissionYear&&Number(student.admissionYear)!==2027)};
  const result=(status,reason,extra={})=>({...base,status,reason,satisfied:status==='satisfied'?true:status==='unsatisfied'?false:null,...extra});
  if (/^(없음|미적용|해당없음|수능최저(?:학력기준)?(?:없음|미적용))$/.test(rule)) {
    return notes ? result('manual','미적용 표기와 별도 비고가 함께 있어 원문 확인이 필요합니다.') : result('no-minimum','자료에 수능최저 미적용이 명시되어 있습니다.');
  }
  if (!rule) return result('manual','최저 조건 원문이 비어 있습니다.');
  // 구형 2027 표에는 판정식과 무관한 안내가 비고에 함께 저장되기도 합니다.
  // 비고가 존재한다는 이유만으로 단순 합 기준을 막지 않고, 실제 등급·필수·대체
  // 조건을 바꾸는 문장만 원문 확인 대상으로 남깁니다.
  const noteChangesMinimum=/(?:누적|%|환산|대체|경우|또는|⇨)|(?:국어|수학|영어|한국사|탐구|사탐|과탐|통합사회|통합과학)[^.\n]{0,30}(?:필수|포함|평균|절사|올림|반올림|[1-9]\s*등급)/.test(notes);
  if (noteChangesMinimum) return result('manual','비고의 추가 조건이 있어 원문 대조가 필요합니다.');
  let count, threshold;
  // 원자료에는 같은 뜻이 `2합7`, `2개합7등급`, `2개 영역 합 7`처럼
  // 섞여 있습니다. bare `개`도 정상 문법으로 받아들입니다.
  const match=rule.match(/^([1-5])(?:개(?:영역|과목)?)?(?:등급)?합(?:계)?([1-9]\d?)(?:등급)?(?:이내|이하)?$/);
  if(match){count=Number(match[1]);threshold=Number(match[2]);}
  else if (/^[1-9]\d?$/.test(rule) && /^[1-4]$/.test(compact(row[7]))) {count=Number(row[7]);threshold=Number(rule);}
  else return result('manual','영역별·필수 포함·복수 조건 등은 현재 자동 판정 범위 밖입니다.');
  if(!empty(row[7]) && Number(row[7])!==count) return result('manual','반영 영역 수와 원문 조건이 일치하지 않습니다.');
  // NAVI 원본의 평균등급 열(row[9])은 대개 `2합 7 → 3.5`처럼 합 기준을
  // 반영 수로 나눈 파생값입니다. 별도 조건이 아니므로 일치하면 판정을 막지 않습니다.
  // 실제 합 기준과 다른 숫자가 들어온 경우에만 원문 확인 대상으로 남깁니다.
  const sourceAverage=empty(row[9])?null:Number(row[9]);
  if(sourceAverage!=null&&(!Number.isFinite(sourceAverage)||Math.abs(sourceAverage-threshold/count)>0.001))return result('manual','최저 합과 원자료 평균등급 값이 일치하지 않습니다.',{count,threshold});
  // 학년도가 달라도 화면에서 참고 판정해 달라는 운영 기준에 따라, 2027의 탐구 표기는
  // 현재 입력된 통합사회·통합과학 중 유리한 한 영역으로 대응합니다. 자료연도는 결과에 남겨
  // 실제 지원 시 해당 연도 모집요강과 구분할 수 있게 합니다.
  if (/탐|사|과/.test(area)) {
    const groups=parseAdmissionSubjectGroups(area);
    if(!groups.length||count>groups.length)return result('manual','반영 영역 또는 탐구 선택 구조를 해석하지 못했습니다.',{count,threshold});
    const grades=student?.latestMockGrades||{};
    const candidates=groups.map(group=>group.subjects.map(name=>({name,grade:validGrade(grades[name])})).filter(item=>item.grade!=null&&Number.isInteger(item.grade)).sort((a,b)=>a.grade-b.grade)[0]).filter(Boolean).sort((a,b)=>a.grade-b.grade);
    if(candidates.length<count)return result('unavailable','모평 성적 미입력/확인 필요: 반영 영역 성적을 확인하세요.',{count,threshold});
    const selected=candidates.slice(0,count),studentSum=selected.reduce((sum,item)=>sum+item.grade,0);
    return result(studentSum<=threshold?'satisfied':'unsatisfied',`${selected.map(item=>`${item.name} ${item.grade}`).join(' + ')} = ${studentSum} / 기준 ${threshold} 이내 · 2027 탐구 표기를 현재 통합사회·통합과학 성적으로 참고 판정`,{count,threshold,studentSum,selectedSubjects:selected,ruleType:'sum',yearMapped:true});
  }
  const normalized=area.replace(/국어/g,'국').replace(/수학/g,'수').replace(/영어/g,'영').replace(/[,·ㆍ/＋+]/g,'');
  if(!/^[국수영]+$/.test(normalized)) return result('manual','반영 영역 또는 필수 포함 조건을 정확히 해석하지 못했습니다.',{count,threshold});
  const names=[...new Set([...normalized])].map(x=>({국:'국어',수:'수학',영:'영어'})[x]);
  if(count>names.length || threshold<count || threshold>9*count) return result('manual','반영 영역 수 또는 등급 합 범위를 확인하세요.',{count,threshold});
  const grades=student?.latestMockGrades || {};
  const values=names.map(name=>({name,grade:validGrade(grades[name])}));
  const missing=values.filter(x=>x.grade==null || !Number.isInteger(x.grade));
  if(missing.length) return result('unavailable',`모평 성적 미입력/확인 필요: ${missing.map(x=>x.name).join('·')}`,{count,threshold});
  const selected=values.sort((a,b)=>a.grade-b.grade).slice(0,count);
  const studentSum=selected.reduce((sum,x)=>sum+x.grade,0);
  return result(studentSum<=threshold?'satisfied':'unsatisfied',`${selected.map(x=>`${x.name} ${x.grade}`).join(' + ')} = ${studentSum} / 기준 ${threshold} 이내`,{count,threshold,studentSum,selectedSubjects:selected,ruleType:'sum'});
}

// Reuse the existing diagnosis engine, with explicit grammar/year/input guards.
// Scoped 2028+ rows can use integrated subjects; 2027 inquiry is never substituted.
export function evaluateStoredMinimum(row, student) {
  if (row.schema===MINIMUM_SCHEMA) return evaluateCatalogMinimum(row,student);
  const year=Number(row.admissionYear) || null;
  const base={year,ruleText:String(row.requiredSum ?? ''),subjectsText:String(row.requiredSubjects || ''),note:String(row.note || ''),source:'기존 대학 지원 진단 · 학년별 최저 자료',yearMismatch:Boolean(year&&student?.admissionYear&&year!==Number(student.admissionYear))};
  const result=(status,reason,extra={})=>({...base,status,satisfied:status==='satisfied'?true:status==='unsatisfied'?false:null,reason,...extra});
  if(!year)return result('manual','최저 자료의 기준 학년도를 확인할 수 없습니다.');
  const rule=compact(row.requiredSum);
  if(/^(없음|미적용|해당없음|수능최저(?:학력기준)?(?:없음|미적용))$/.test(rule))return result('no-minimum','자료에 수능최저 미적용이 명시되어 있습니다.');
  const sumRule=rule.match(/^([1-5])(?:개(?:영역|과목)?)?(?:등급)?합(?:계)?([1-9]\d?)(?:등급)?(?:이내|이하)?$/);
  const eachRule=rule.match(/^(?:([1-5])개(?:영역|과목)?)?(?:각각|각|모두)([1-9])등급(?:이내|이하)?$/);
  const declaredCount=Number(sumRule?.[1]||eachRule?.[1]||row.requiredSubjectCount);
  const declaredThreshold=Number(sumRule?.[2]||eachRule?.[2]||(/^[1-9]\d?$/.test(rule)?rule:NaN));
  let inferredSubjectPool=false;
  let normalizedArea=String(row.requiredSubjects||'')
    .replace(/공통수학|수학/g,'수').replace(/국어/g,'국').replace(/영어/g,'영').replace(/한국사/g,'한')
    .replace(/통합사회|통사|사회탐구|사탐|사회/g,'사').replace(/통합과학|통과|과학탐구|과탐|과학/g,'과')
    .replace(/탐구영역|탐구|탐/g,'사/과')
    .replace(/\((?:사회|사)\s*[,/]\s*(?:과학|과)\)/g,'사/과')
    .replace(/(?:사회|사)\s*\/\s*(?:과학|과)/g,'사/과');
  // 구형 저장 행에는 '2합 7' 또는 기준 숫자만 있고 반영영역 열이 비어 있는 경우가 있습니다.
  // 합/반영수가 명시된 경우에만 학년도별 공통 모평 영역을 후보군으로 사용해 참고 판정합니다.
  if(!compact(normalizedArea)&&Number.isInteger(declaredCount)&&Number.isFinite(declaredThreshold)){
    normalizedArea=year>=2028?'국,수,영,사,과':'국,수,영,사/과';
    inferredSubjectPool=true;
  }
  // 기존 학년별 최저 표도 구조화 파서로 먼저 승격합니다. 비고가 있다는 이유만으로 모든
  // 행을 수동 확인으로 돌리던 동작을 없애고, 영어·한국사 상한/필수영역/탐구 처리처럼
  // 해석 가능한 조건은 대학별 최저 카탈로그와 같은 엔진으로 계산합니다.
  const explicitRule=Number.isInteger(declaredCount)&&Number.isFinite(declaredThreshold)
    ? `${declaredCount}${eachRule?'개영역각':'합'}${declaredThreshold}${eachRule?'등급':' '}`
    : String(row.requiredSum||'');
  const explicit=parseExplicitMinimum(`${normalizedArea} 중 ${explicitRule}`,row.note,year);
  if(explicit){
    const evaluated=evaluateCatalogMinimum({
      schema:MINIMUM_SCHEMA,id:`LEGACY-${year}-${compact(row.university)}-${compact(row.track)}`,sourceId:'기존-학년별-최저',admissionYear:year,season:'수시',
      university:row.university||'연결 대학',campus:row.region||'',admissionType:row.admissionType||'',track:row.track||'연결 전형',trackAliases:'',
      scopeType:'전체',department:'전체',excluded:'',reviewStatus:'계산가능',reviewReason:'',ruleText:`${normalizedArea} 중 ${String(row.requiredSum||'')}`,
      note:String(row.note||''),source:'기존 대학 지원 진단 · 학년별 최저 자료',page:'-',...explicit,
    },student);
    return {...evaluated,ruleText:`${normalizedArea} 중 ${declaredCount}${eachRule?'개 영역 각':'합'} ${declaredThreshold}${eachRule?'등급 이내':' 이내'}`,subjectsText:normalizedArea,inferredSubjectPool,
      reason:inferredSubjectPool?`${evaluated.reason} · 반영영역 미기재로 ${year>=2028?'국·수·영·사·과':'국·수·영·탐구'} 공통영역 참고 판정`:evaluated.reason};
  }
  const noteText=String(row.note||'');
  const noteChangesMinimum=/(?:누적|%|환산|대체|경우|또는|⇨)|(?:국어|수학|영어|한국사|탐구|사탐|과탐|통합사회|통합과학)[^.\n]{0,30}(?:필수|포함|평균|절사|올림|반올림|[1-9]\s*등급)/.test(noteText);
  if(noteChangesMinimum)return result('manual',`원문 추가조건: ${noteText}`);
  const sum=sumRule;
  const each=eachRule;
  const count=Number(sum?.[1] || each?.[1] || row.requiredSubjectCount);
  const threshold=Number(sum?.[2] || each?.[2] || (/^[1-9]\d?$/.test(rule)?rule:NaN));
  if(!Number.isInteger(count) || count<1 || count>5 || !Number.isFinite(threshold) || (!empty(row.requiredSubjectCount) && Number(row.requiredSubjectCount)!==count))return result('manual','반영 영역 수와 최저 조건 원문을 확인하세요.');
  if(threshold<(each?1:count) || threshold>(each?9:9*count))return result('manual','최저 기준의 등급 범위를 확인하세요.');
  const area=compact(normalizedArea);
  const residue=area.replace(/통합사회|통합과학|한국사|국어|수학|영어|사회|과학|탐구|[국수영사과한탐(),·ㆍ/＋+]/g,'');
  if(residue || !area || (area.match(/\(/g)||[]).length!==(area.match(/\)/g)||[]).length)return result('manual','필수 포함·평균·복수 조건 등 반영 영역 원문을 확인하세요.');
  const groupingArea=normalizedArea.replace(/(?:사회|사)\s*\/\s*(?:과학|과)/g,'(사,과)');
  const groups=parseAdmissionSubjectGroups(groupingArea);
  const names=groups.flatMap(group=>group.subjects);
  if(count>groups.length || new Set(names).size!==names.length)return result('manual','반영 영역의 중복 또는 선택 조건을 확인하세요.');
  const grades=student.latestMockGrades || {};
  const candidates=groups.map(group=>group.subjects.map(name=>({name,grade:validGrade(grades[name])})).filter(item=>item.grade!=null&&Number.isInteger(Number(item.grade))).sort((a,b)=>a.grade-b.grade)[0]).filter(Boolean).sort((a,b)=>a.grade-b.grade);
  if(candidates.length<count)return result('unavailable','반영 가능한 모평 성적이 부족합니다.');
  const selected=candidates.slice(0,count),studentSum=selected.reduce((sum,item)=>sum+Number(item.grade),0);
  const status=each?selected.every(item=>item.grade<=threshold)?'satisfied':'unsatisfied':studentSum<=threshold?'satisfied':'unsatisfied';
  const calculation=selected.map(x=>`${x.name} ${x.grade}`).join(' + ');
  return result(status,each?`${calculation} / 선택 ${count}개 영역 각각 ${threshold}등급 이내`:`${calculation} = ${studentSum} / 기준 ${threshold} 이내`,{studentSum,selectedSubjects:selected,count,threshold,ruleType:each?'each':'sum'});
}

// 3순위(모평 선택·시뮬레이션): 학생이 응시한 회차별로 같은 판정 함수를 그대로 다시 돌려,
// "최근 N회 중 M회 충족"을 계산합니다. 회차마다 그 회차 성적만 통째로 사용하고(한 회차 내에서만
// 값을 가져옴), 서로 다른 회차의 과목별 최고 등급을 섞어 쓰지 않습니다.
export function minimumHistorySummary(row, student, exams = []) {
  if (!row || !exams?.length) return null;
  const results = exams.map(exam => ({
    key: exam.key,
    label: exam.label,
    evaluation: evaluateNaviMinimumSafe(row, { ...student, latestMockGrades: exam.grades }),
  }));
  const decided = results.filter(item => ["satisfied", "unsatisfied"].includes(item.evaluation.status));
  const satisfiedCount = results.filter(item => item.evaluation.status === "satisfied").length;
  return { results, satisfiedCount, decidedCount: decided.length, total: results.length };
}

// 4번 요청: 등급이 몇 등급 개선되면 이 최저를 충족하는지 계산합니다.
// 규칙별 계산 로직을 새로 만들지 않고, 실제 판정 함수(evaluateNaviMinimumSafe)를 그대로 다시
// 호출해서 확인합니다. "각각" 조건에서 특정 과목이 기준을 못 넘기면 다른 과목을 올려도 충족되지
// 않는 것 역시 이 방식으로 자연히 반영됩니다(별도로 "필수 과목" 여부를 하드코딩하지 않습니다).
const IMPROVEMENT_CANDIDATE_SUBJECTS = ["국어", "수학", "영어", "통합사회", "통합과학"];
export function minimumImprovementAdvice(row, student) {
  const base = evaluateNaviMinimumSafe(row, student);
  if (base.status !== "unsatisfied") return null;
  const grades = student?.latestMockGrades || {};
  const options = IMPROVEMENT_CANDIDATE_SUBJECTS.map(name => {
    const current = validGrade(grades[name]);
    if (current == null || !Number.isInteger(current) || current <= 1) return null;
    for (let candidate = current - 1; candidate >= 1; candidate--) {
      const trial = evaluateNaviMinimumSafe(row, { ...student, latestMockGrades: { ...grades, [name]: candidate } });
      if (trial.status === "satisfied") return { name, from: current, to: candidate, steps: current - candidate };
    }
    return null;
  }).filter(Boolean).sort((a, b) => a.steps - b.steps);
  return { possible: options.length > 0, options };
}

export function improvementAdviceText(advice) {
  if (!advice) return "";
  if (!advice.possible) return "한 과목만 올려서는 충족되지 않습니다 (여러 과목 개선이 필요합니다).";
  const best = advice.options[0];
  return `${best.name} ${best.from}→${best.to}등급이면 충족`;
}

export function minimumDisplay(evaluation, status) {
  const state=evaluation?.status || status || 'unlinked';
  const labels={satisfied:'모평 기준 충족',unsatisfied:'모평 기준 미충족','no-minimum':'수능최저 없음',manual:'원문 조건',unavailable:'모평 성적 필요',unlinked:'최저 자료 미연결'};
  return {status:state,label:labels[state] || '원문 조건',reason:evaluation?.reason || '연도·캠퍼스·모집단위·전형이 일치하는 원자료를 확인하세요.'};
}

export function minimumYearLabel(evaluation, student) {
  const year=Number(evaluation?.year);
  if(!year)return '기준연도 확인';
  const studentYear=Number(student?.admissionYear);
  const reference=Boolean(evaluation?.yearMismatch)||(studentYear&&studentYear!==year);
  return `${year}학년도 ${reference?'참고 기준':'기준'}`;
}

// UI patch: 대학별 최저 자료가 연결되지 않아도(=unlinked), 학생 본인의 최근 모의고사 등급은
// 이미 저장돼 있으므로 그것만이라도 보여줍니다. "대학 정보가 없어도 내 최저 현황은 보여달라"는
// 요청에 대응합니다. 2028 체계 5과목(국/수/영/통합사회/통합과학) 중 값이 있는 것만 반환합니다.
const MOCK_SUBJECT_LABELS = { 국어: '국', 수학: '수', 영어: '영', 통합사회: '사', 통합과학: '과', 한국사: '한' };
// 화면 곳곳(모평 칩, 최저 판정 근거)에서 과목 전체 이름 대신 같은 짧은 이름을 쓰도록 공용 함수로 뺐습니다.
export function shortSubjectName(name) {
  return MOCK_SUBJECT_LABELS[name] || name;
}
export function studentMockChips(student) {
  const grades = student?.latestMockGrades || student?.latestMockSums?.subjectGrades;
  if (!grades) return null;
  const chips = Object.entries(MOCK_SUBJECT_LABELS)
    .map(([key, label]) => [label, grades[key]])
    .filter(([, value]) => validGrade(value)!=null && Number.isInteger(Number(value)));
  return chips.length ? chips : null;
}
