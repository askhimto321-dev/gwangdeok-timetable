import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'vite';
const server=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
const c=await server.ssrLoadModule('/src/minimumCatalog.js');
const n=await server.ssrLoadModule('/src/naviMinimum.js');
const {universityIdentityKey:identity}=await server.ssrLoadModule('/src/universityIdentity.js');
after(()=>server.close());
const rows=c.normalizeMinimumCatalog(JSON.parse(fs.readFileSync('src/minimumCatalogSeed.json','utf8')));
const student={admissionYear:2028,minimumCatalogRows:rows,latestMockGrades:{국어:5,수학:5,영어:3,통합사회:6,통합과학:5,한국사:6}};
test('학생이 2027이어도 적용 가능한 2028 기준을 우선',()=>{
 const base=rows.find(r=>r.reviewStatus==='계산가능'&&r.ruleType==='합'&&r.admissionYear===2028);
 const target={university:'검증대',department:'화학과',admissionType:'논술',track:'논술'};
 const pair=[2027,2028].map(admissionYear=>({...base,id:`test-${admissionYear}`,university:'검증대',campus:'',scopeType:'전체',department:'전체',excluded:'',admissionType:'논술',track:'논술',admissionYear,referenceMapped:true}));
 const ev=c.resolveCatalogMinimum({target,student:{...student,admissionYear:2027,minimumCatalogRows:pair},identity}).evaluation;
 assert.equal(ev.year,2028);
 assert.equal(c.catalogRowsForTarget(pair,target,2027,identity)[0].admissionYear,2028);
});
test('가천 공식 교과·논술 전형명을 복구하고 종합 가천의약학은 보존',()=>{
 const pharmacy=rows.filter(r=>r.university==='가천대'&&r.admissionYear===2027&&r.department==='약학과');
 assert.equal(pharmacy.find(r=>r.admissionType==='논술').track,'논술');
 assert.equal(pharmacy.find(r=>r.admissionType==='논술').reviewStatus,'계산가능');
 assert.equal(pharmacy.find(r=>r.admissionType==='종합').track,'가천의약학');
 assert.equal(pharmacy.find(r=>r.admissionType==='교과').track,'학생부우수자');
});
