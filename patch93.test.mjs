import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
const catalog=await server.ssrLoadModule('/src/minimumCatalog.js');
const mapping=await server.ssrLoadModule('/src/minimumMapping.js');
after(()=>server.close());
const rule={schema:'KD_MINIMUM_V1',id:'history-test',sourceId:'source',admissionYear:2028,season:'수시',university:'검증대',track:'교과',scopeType:'전체',department:'전체',reviewStatus:'계산가능',reviewReason:'',ruleType:'합',subjects:'국|수|영|사/과',count:3,threshold:8,mandatory:'',englishMax:null,historyMax:null,inquiryMode:'통합개별',rounding:'없음',englishConversion:'없음',ruleText:'국, 수, 영, 사/과 중 3개 영역 합 8',note:'',source:'검증',page:1};
const student={admissionYear:2028,latestMockGrades:{국어:5,수학:4,영어:3,통합사회:3,통합과학:4,한국사:2}};
test('한국사 미반영 3합8은 영3+사3+수4=10으로 미충족',()=>{
 const ev=catalog.evaluateCatalogMinimum(rule,student);
 assert.equal(ev.status,'unsatisfied');assert.equal(ev.studentSum,10);
 assert.ok(ev.selectedSubjects.every(x=>x.name!=='한국사'));assert.equal(ev.historyInSum,false);
});
test('한국사 별도 기준은 합산에 넣지 않으며 기준 초과 시 미충족',()=>{
 const row={...rule,count:2,threshold:7,historyMax:4,ruleText:'국, 수, 영, 사/과 중 2개 영역 합 7 ※ 한국사 4등급 이내'};
 const ev=catalog.evaluateCatalogMinimum(row,student);
 assert.equal(ev.status,'satisfied');assert.equal(ev.studentSum,6);assert.equal(ev.historyMax,4);
 assert.equal(catalog.evaluateCatalogMinimum(row,{...student,latestMockGrades:{...student.latestMockGrades,한국사:5}}).status,'unsatisfied');
 assert.equal(catalog.evaluateCatalogMinimum(row,{...student,latestMockGrades:{...student.latestMockGrades,한국사:null}}).status,'unavailable');
});
test('한국사 합산 명시 전형은 한국사2+영3+사3=8로 유지',()=>{
 const ev=catalog.evaluateCatalogMinimum({...rule,subjects:'국|수|영|사/과|한',ruleText:'국, 수, 영, 사/과, 한국사 중 3개 영역 합 8'},student);
 assert.equal(ev.status,'satisfied');assert.equal(ev.studentSum,8);assert.equal(ev.historyInSum,true);
});
test('원문 후보와 달리 한국사를 넣은 가져오기 행은 충족으로 오판하지 않음',()=>{
 const ev=catalog.evaluateCatalogMinimum({...rule,subjects:'국|수|영|사/과|한',historyMax:4,ruleText:rule.ruleText+' ※ 한국사 4등급 이내'},student);
 assert.equal(ev.status,'unsatisfied');assert.equal(ev.studentSum,10);assert.equal(ev.historyMax,4);assert.equal(ev.correctedHistoryPool,true);
});
test('2027 별도 한국사 등급도 파싱하고 상충 기준은 확정하지 않음',()=>{
 const parsed=mapping.parseExplicitMinimum('2개 합 7등급','한국사 4등급 이내',2027);
 assert.equal(parsed.historyMax,4);assert.ok(!parsed.subjects.includes('한'));
 assert.equal(mapping.parseExplicitMinimum('2개 합 7등급','한국사 4등급, 한국사 5등급',2027),null);
});
