import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'vite';
const server=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
const catalog=await server.ssrLoadModule('/src/minimumCatalog.js');
const navi=await server.ssrLoadModule('/src/SusiNaviBeta.jsx');
const grades=await server.ssrLoadModule('/src/Grades.jsx');
const {universityIdentityKey:identity}=await server.ssrLoadModule('/src/universityIdentity.js');
after(()=>server.close());
const rows=catalog.normalizeMinimumCatalog(JSON.parse(fs.readFileSync('src/minimumCatalogSeed.json','utf8')));
const student={admissionYear:2028,minimumCatalogRows:rows,subjects:[],latestMockGrades:{국어:5,수학:5,영어:3,통합사회:6,통합과학:5,한국사:6}};
const favorite={university:'협성대',region:'경기',department:'건축공학과',admissionType:'미래역량우수자',favoriteKind:'전형',source:'admission'};
test('이전 협성대 전형명을 현행 교과 전형에 연결하고 수능최저 미적용으로 표시',()=>{
 const match=catalog.resolveCatalogMinimum({target:{...favorite,admissionType:'교과',track:'미래역량우수자'},student,identity});
 assert.equal(match?.minimum?.track,'미래창의인재');
 assert.equal(match.evaluation.status,'no-minimum');
 const facts=navi.counselingFactsForFavorite({favorite,student,indexes:navi.buildCounselingFactIndex({},null)});
 assert.deepEqual(facts.minimums.map(x=>[x.admissionType,x.track,x.evaluation.status]),[['교과','미래창의인재','no-minimum']]);
});
test('상담 NAVI 컷은 저장된 전형과 정확히 일치하는 경우만 표시',()=>{
 const data={records:[[null,'경기',null,'검증대',null,'건축공학과','자연',[['학생부교과(학교장추천)',2.2,2.4],['학생부교과(지역균형)',2.5,2.7]],[['학생부종합(미래인재)',2.8,3.0]]]]};
 const cuts=(name)=>grades.favoriteNaviCutRows(data,'검증대','경기','건축공학과',name);
 assert.equal(cuts('학교장추천').length,1);
 assert.equal(cuts('전형명불일치').length,0);
 assert.equal(cuts('교과').length,2);
 assert.equal(cuts('종합').length,1);
 assert.equal(cuts('학생부교과(미래인재)').length,0);
});
test('구형 최저 자료도 해당 전형에 적용 가능한 2028을 우선한다',async()=>{
 const result=(await server.ssrLoadModule('/src/admissionComparison.js')).resolveMinimumLink({target:{university:'검증대',region:'경기',department:'화학과',admissionType:'교과',track:'추천'},data:{},student:{...student,admissionYear:2027,minimumCatalogRows:[],minimumRows:[{university:'검증대',region:'경기',department:'전체',admissionType:'교과',track:'추천',admissionYear:2027},{university:'검증대',region:'경기',department:'전체',admissionType:'교과',track:'추천',admissionYear:2028}]},identity,evaluateMinimum:row=>({status:'manual',year:row.admissionYear})});
 assert.equal(result.evaluation.year,2028);
});
test('2027 탐구는 통합사회·통합과학 중 한 영역으로만 참고 환산한다',()=>{
 const row=rows.find(r=>r.admissionYear===2027&&r.university==='경기대'&&r.admissionType==='교과'&&r.reviewStatus==='계산가능');
 assert.equal(row.subjects,'국|수|영|사/과');
 assert.equal(row.historyMax,6);
 const result=catalog.evaluateCatalogMinimum(row,{...student,latestMockGrades:{국어:7,수학:7,영어:7,통합사회:3,통합과학:3,한국사:6}});
 assert.notEqual(result.status,'satisfied');
});
test('2027 한국사는 별도 상한이며 수학 선택과목 표기만으로 필수영역을 만들지 않는다',()=>{
 const k=rows.find(r=>r.admissionYear===2027&&r.university==='고려대'&&r.admissionType==='교과'&&r.department==='인문|자연');
 assert.equal(k.historyMax,4);
 assert.equal(k.subjects,'국|수|영|사/과');
 const fail=catalog.evaluateCatalogMinimum(k,{...student,latestMockGrades:{국어:2,수학:2,영어:3,통합사회:9,통합과학:9,한국사:5}});
 assert.equal(fail.status,'unsatisfied');
 const sam=rows.find(r=>r.admissionYear===2027&&r.university==='삼육대'&&r.admissionType==='교과'&&r.department==='약학과');
 assert.equal(sam.mandatory,'');
});
test('2026 홍익대 3합8 잔존 행은 2027 지원 전형에서 제외한다',()=>{
 assert.equal(rows.find(r=>r.id==='MIN-e588c71076ab6fd8')?.reviewStatus,'사용안함');
});
test('2027 빈 필수영역은 재정규화해도 비어 있고 보정 상태가 유지된다',()=>{
 const id='MIN-a4d6866e069e2e03';
 const first=rows.find(r=>r.id===id);
 const again=catalog.normalizeMinimumCatalog([...rows]).find(r=>r.id===id);
 assert.equal(first.mandatory,'');
 assert.equal(again.mandatory,'');
 assert.equal(again.reviewStatus,'계산가능');
 assert.deepEqual(catalog.minimumCatalogStats(catalog.normalizeMinimumCatalog([...rows])),catalog.minimumCatalogStats(rows));
});
