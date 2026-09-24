import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'vite';
const server=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
const c=await server.ssrLoadModule('/src/minimumCatalog.js');
const l=await server.ssrLoadModule('/src/admissionMinimumLink.js');
const n=await server.ssrLoadModule('/src/naviMinimum.js');
const m=await server.ssrLoadModule('/src/minimumMapping.js');
const {universityIdentityKey:identity}=await server.ssrLoadModule('/src/universityIdentity.js');
after(()=>server.close());
const rows=c.normalizeMinimumCatalog(JSON.parse(fs.readFileSync('src/minimumCatalogSeed.json','utf8')));
const student={admissionYear:2028,minimumCatalogRows:rows,latestMockGrades:{국어:5,수학:4,영어:3,통합사회:3,통합과학:4,한국사:2}};
test('화면의 빈 구형 기준보다 등록된 건국대 KU지역균형 기준을 연결',()=>{
 const link=l.resolveAdmissionMinimum({university:'건국대학교(서울)',region:'서울',department:'전모집단위',track:'KU지역균형',requiredSubjects:'한·국·수·영·사/과택1',requiredSum:'',admissionYear:2028},student);
 assert.equal(link.evaluation.status,'satisfied');assert.equal(link.evaluation.threshold,8);assert.equal(link.evaluation.year,2028);
});
test('화면의 경희대 지역균형과 고려대 세종 학생부교과도 카탈로그에서 연결',()=>{
 for(const [university,track] of [['경희대학교(서울)','지역균형'],['고려대학교(세종)','학생부교과']]){
  const link=l.resolveAdmissionMinimum({university,region:'서울',department:'전모집단위',track,admissionYear:2028},student);
  assert.ok(['satisfied','unsatisfied'].includes(link.evaluation.status),JSON.stringify(link.evaluation));
 }
});
test('고려대 학교장추천 별칭은 의예과만 연결하고 사용안함 전체 행은 복원하지 않음',()=>{
 const row={university:'고려대학교(서울)',track:'학교장추천',admissionYear:2028};
 assert.equal(l.resolveAdmissionMinimum({...row,department:'의예과'},student).evaluation.threshold,5);
 assert.equal(l.resolveAdmissionMinimum({...row,department:'전모집단위'},student).evaluation.status,'unlinked');
});
test('NAVI 목록에서도 같은 범위에 상충하는 카탈로그 행을 무시하지 않음',()=>{
 const base=rows.find(r=>r.university==='건국대'&&r.track==='KU지역균형'&&r.admissionYear===2028);
 const array=['서울','건국대','교과','KU지역균형','','화학과','국수영',2,'2합7'];
 array.catalogRule=base;array.catalogTarget={university:'건국대(서울)',department:'화학과',admissionType:'교과',track:'KU지역균형'};
 assert.equal(n.evaluateNaviMinimumSafe(array,{...student,minimumCatalogRows:[base,{...base,id:'conflict',threshold:9}]}).status,'manual');
});
test('모든 계산가능 원문은 정상·미충족·미입력 경계에서 예외 없이 계산',()=>{
 for(const row of rows.filter(r=>r.reviewStatus==='계산가능'))for(const grade of [1,3,9,null]){
  const ev=c.evaluateCatalogMinimum(row,{...student,latestMockGrades:Object.fromEntries(Object.keys(student.latestMockGrades).map(k=>[k,grade]))});
  assert.notEqual(ev.status,'manual',row.id);assert.ok(['satisfied','unsatisfied','unavailable','no-minimum'].includes(ev.status),row.id);
 }
});
test('다른 전형의 2028 자료가 같은 전형의 2027 연결을 가리지 않음',()=>{
 const base=rows.find(r=>r.university==='건국대'&&r.track==='KU지역균형'&&r.admissionYear===2028);
 const changed=[{...base,admissionYear:2027,referenceMapped:true,track:'기존전형'},{...base,track:'새전형'}];
 const ev=c.resolveCatalogMinimum({target:{university:'건국대(서울)',department:'화학과',admissionType:'교과',track:'기존전형'},student:{...student,minimumCatalogRows:changed},identity}).evaluation;
 assert.equal(ev.year,2027);assert.notEqual(ev.status,'unlinked');
});
test('2027 구형 분리 셀에서도 필수 수학과 한국사 별도 조건을 계산',()=>{
 const ev=n.evaluateStoredMinimum({university:'검증대',admissionYear:2027,requiredSubjects:'국,수,영,사/과',requiredSum:'2개합7등급',note:'수학 포함, 한국사 4등급 이내'},student);
 assert.equal(ev.status,'satisfied');assert.equal(ev.studentSum,7);assert.ok(ev.selectedSubjects.some(s=>s.name==='수학'));assert.ok(ev.selectedSubjects.every(s=>s.name!=='한국사'));
});
test('서울·세종 캠퍼스 혼합 금지',()=>{
 assert.notEqual(identity('고려대학교(서울)'),identity('고려대학교(세종)'));
 assert.equal(identity('경희대학교(국제)'),identity('경희대','경기'));
});
test('국수영 각4등급은 세 과목 모두 검사하며 수학5를 다른 3등급으로 대체하지 않음',()=>{
 const rule=m.parseExplicitMinimum('국, 수, 영 각 4등급','',2028);
 assert.equal(rule.count,3);assert.equal(rule.ruleType,'각');
 for(const requiredSubjectCount of [undefined,'',3]){
  const ev=n.evaluateStoredMinimum({admissionYear:2028,requiredSubjects:'국,수,영',requiredSum:'각4등급',requiredSubjectCount},{...student,latestMockGrades:{...student.latestMockGrades,수학:5}});
  assert.equal(ev.count,3);assert.equal(ev.status,'unsatisfied');assert.equal(ev.ruleType,'each');
 }
});
test('후보 중 3개 각4는 3개를 검사하고 하나만 4등급인 경우 미충족',()=>{
 const row={admissionYear:2028,requiredSubjects:'국,수,영,사/과',requiredSum:'각4',requiredSubjectCount:3};
 const ev=n.evaluateStoredMinimum(row,{...student,latestMockGrades:{국어:4,수학:5,영어:5,통합사회:5,통합과학:6}});
 assert.equal(ev.count,3);assert.equal(ev.status,'unsatisfied');
 assert.equal(n.evaluateStoredMinimum(row,{...student,latestMockGrades:{국어:4,수학:4,영어:4,통합사회:5,통합과학:6}}).status,'satisfied');
});
test('구형 카탈로그의 각4 반영수1 저장 오류는 원문3개로 보정',()=>{
 const base=rows.find(r=>r.reviewStatus==='계산가능'&&r.ruleType==='각');
 const ev=c.evaluateCatalogMinimum({...base,admissionYear:2028,ruleText:'국,수,영 중 3개 영역 각 4등급',note:'',subjects:'국|수|영',count:1,threshold:4,mandatory:'',englishMax:null,historyMax:null},{...student,latestMockGrades:{국어:4,수학:5,영어:4}});
 assert.equal(ev.count,3);assert.equal(ev.correctedEachRule,true);assert.equal(ev.status,'unsatisfied');
});
test('선택수 없는 중 각4와 상충 반영수는 1개로 추정하지 않음',()=>{
 assert.equal(m.parseExplicitMinimum('국,수,영 중 각4등급','',2028),null);
 assert.equal(n.evaluateStoredMinimum({admissionYear:2028,requiredSubjects:'국,수,영',requiredSum:'3개 각4등급',requiredSubjectCount:1},student).status,'manual');
});
