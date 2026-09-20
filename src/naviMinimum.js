import { validGrade } from './admissionMetrics.js';
const compact = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, '').trim();
const empty = value => !compact(value) || compact(value) === '-';

// Auto-evaluate only an explicitly understood rule. Complex requirements stay manual.
export function evaluateNaviMinimumSafe(row, student) {
  if (!row) return { status:'unlinked', reason:'일치하는 최저 자료가 없습니다.' };
  const rule=compact(row[8]), area=compact(row[6]), notes=[row[10],row[11]].filter(x=>!empty(x)).join(' · ');
  const base={ruleText:String(row[8] || ''),subjectsText:String(row[6] || ''),note:notes,year:2027};
  const result=(status,reason,extra={})=>({...base,status,reason,satisfied:status==='satisfied'?true:status==='unsatisfied'?false:null,...extra});
  if (/^(없음|미적용|해당없음|수능최저(?:학력기준)?(?:없음|미적용))$/.test(rule)) {
    return notes ? result('manual','미적용 표기와 별도 비고가 함께 있어 원문 확인이 필요합니다.') : result('no-minimum','자료에 수능최저 미적용이 명시되어 있습니다.');
  }
  if (!rule) return result('manual','최저 조건 원문이 비어 있습니다.');
  if (notes || !empty(row[9])) return result('manual','비고·평균등급 등 추가 조건이 있어 원문 대조가 필요합니다.');
  let count, threshold;
  const match=rule.match(/^([1-4])(?:개(?:영역|과목))?(?:등급)?합(?:계)?([1-9]\d?)(?:등급)?(?:이내|이하)?$/);
  if(match){count=Number(match[1]);threshold=Number(match[2]);}
  else if (/^[1-9]\d?$/.test(rule) && /^[1-4]$/.test(compact(row[7]))) {count=Number(row[7]);threshold=Number(rule);}
  else return result('manual','영역별·필수 포함·복수 조건 등은 현재 자동 판정 범위 밖입니다.');
  if(!empty(row[7]) && Number(row[7])!==count) return result('manual','반영 영역 수와 원문 조건이 일치하지 않습니다.');
  // Do not reinterpret 2027 elective inquiry as 2028 integrated social/science.
  if (/탐|사|과/.test(area)) return result('manual','탐구 과목 수·평균·절사와 시험 체계 확인이 필요합니다. 통합사회·통합과학으로 임의 대체하지 않습니다.',{count,threshold});
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
  return result(studentSum<=threshold?'satisfied':'unsatisfied',`${selected.map(x=>`${x.name} ${x.grade}`).join(' + ')} = ${studentSum} / 기준 ${threshold} 이내`,{count,threshold,studentSum,selectedSubjects:selected});
}

export function minimumDisplay(evaluation, status) {
  const state=evaluation?.status || status || 'unlinked';
  const labels={satisfied:'모평 기준 충족',unsatisfied:'모평 기준 미충족','no-minimum':'수능최저 없음',manual:'조건 확인 필요',unavailable:'모평 성적 필요',unlinked:'최저 자료 미연결'};
  return {status:state,label:labels[state] || '조건 확인 필요',reason:evaluation?.reason || '연도·캠퍼스·모집단위·전형이 일치하는 원자료를 확인하세요.'};
}

// UI patch: 대학별 최저 자료가 연결되지 않아도(=unlinked), 학생 본인의 최근 모의고사 등급은
// 이미 저장돼 있으므로 그것만이라도 보여줍니다. "대학 정보가 없어도 내 최저 현황은 보여달라"는
// 요청에 대응합니다. 2028 체계 5과목(국/수/영/통합사회/통합과학) 중 값이 있는 것만 반환합니다.
const MOCK_SUBJECT_LABELS = { 국어: '국', 수학: '수', 영어: '영', 통합사회: '사회', 통합과학: '과학' };
export function studentMockChips(student) {
  const grades = student?.latestMockGrades || student?.latestMockSums?.subjectGrades;
  if (!grades) return null;
  const chips = Object.entries(MOCK_SUBJECT_LABELS)
    .map(([key, label]) => [label, grades[key]])
    .filter(([, value]) => value != null && Number.isFinite(Number(value)));
  return chips.length ? chips : null;
}
