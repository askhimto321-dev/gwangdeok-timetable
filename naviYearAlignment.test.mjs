import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';

const server=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
const {resolveMinimumLink,buildComparisonRows}=await server.ssrLoadModule('/src/admissionComparison.js');
const {evaluateNaviMinimumSafe}=await server.ssrLoadModule('/src/naviMinimum.js');
const {universityIdentityKey:identity}=await server.ssrLoadModule('/src/universityIdentity.js');
const {default:seed}=await server.ssrLoadModule('/src/minimumCatalogSeed.json');
after(()=>server.close());
const student={admissionYear:2028,minimumCatalogRows:seed,latestMockGrades:{}};
const evaluateMinimum=row=>evaluateNaviMinimumSafe(row,student);
const target=(university,track,department)=>({university,region:'서울',department,historicalDepartment:department,field:'자연',admissionType:'종합',track,trackYear:2026});

test('2026 컷 카드에 2028 성신여대 간호학과 현행 최저를 연결한다',()=>{
 const result=resolveMinimumLink({target:target('성신여대','자기주도인재','간호학과'),data:{},student,identity,evaluateMinimum});
 assert.equal(result.evaluation.year,2028);
 assert.equal(result.evaluation.status,'no-minimum');
});
test('삼육대 복합 전형명의 세움인재를 연결하고 약학 예외는 간호에 적용하지 않는다',()=>{
 const nursing=resolveMinimumLink({target:target('삼육대','세움인재','간호학과'),data:{},student,identity,evaluateMinimum});
 const pharmacy=resolveMinimumLink({target:target('삼육대','세움인재','약학과'),data:{},student,identity,evaluateMinimum});
 assert.equal(nursing.evaluation.year,2028);
 assert.equal(nursing.evaluation.status,'no-minimum');
 assert.equal(pharmacy.evaluation.year,2028);
 assert.notEqual(pharmacy.evaluation.status,'no-minimum');
});
test('2028 자료가 없는 학교에서는 2027 자료를 참고 연결한다',()=>{
 const oldStudent={admissionYear:2028,minimumCatalogRows:[],latestMockGrades:{}};
 const rule=['서울','검증대','종합','서류형','자연','간호학과','국,수,영',2,'2합7',null,'','',2027];
 const result=resolveMinimumLink({target:target('검증대','서류형','간호학과'),data:{minimums:[rule]},student:oldStudent,identity,evaluateMinimum:row=>evaluateNaviMinimumSafe(row,oldStudent)});
 assert.equal(result.minimum,rule);
 assert.equal(result.evaluation.year,2027);
});
test('전형 비교의 컷 연도와 최저 연도는 독립적이다',()=>{
 const row=['수도권','서울','','성신여대','간호학과','간호학과','자연',[],[['자기주도인재',2,2.1]],null];
 const result=buildComparisonRows({compareItems:[{stored:{university:'성신여대',region:'서울',department:'간호학과'},entry:{row}}],data:{},caseRows:[],convertedGrade:2,identity,evaluateMinimum,minimumContext:student});
 assert.equal(result[0].minimumEvaluation.year,2028);
 assert.equal(result[0].planItem.trackYear,2026);
});
