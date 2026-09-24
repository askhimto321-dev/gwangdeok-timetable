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
test('사진의 전체 문장 2개 영역 합6은 2합8 미충족으로 계산',()=>{
 for(const requiredSubjects of ['', '국, 수, 영, 사/과(1)']){
 const ev=n.evaluateStoredMinimum({admissionYear:2028,requiredSubjects,requiredSum:'국, 수, 영, 사/과(1) 중 2개 영역 등급 합 6'},student);
 assert.equal(ev.status,'unsatisfied');assert.equal(ev.studentSum,8);assert.equal(ev.threshold,6);assert.ok(ev.selectedSubjects.every(s=>s.name!=='한국사'));
 }
});
test('단국대 죽전 지역균형은 오래된 제외범위 표시를 원문으로 보완',()=>{
 const ev=c.resolveCatalogMinimum({target:{university:'단국대(죽전)',department:'화학공학과',admissionType:'교과',track:'지역균형선발'},student,identity}).evaluation;
 assert.equal(ev.status,'unsatisfied');assert.equal(ev.threshold,6);assert.equal(ev.studentSum,8);
});
test('다른 전형의 명시 캠퍼스 행이 공통 캠퍼스 전형을 가리지 않음',()=>{
 const base=rows.find(r=>r.reviewStatus==='계산가능'&&r.ruleType==='합');
 const catalog=[{...base,university:'단국대',campus:'죽전',track:'다른전형',scopeType:'전체',department:'전체',excluded:'',admissionType:'교과'}, {...base,university:'단국대',campus:'',track:'목표전형',scopeType:'전체',department:'전체',excluded:'',admissionType:'교과'}];
 const ev=c.resolveCatalogMinimum({target:{university:'단국대(죽전)',department:'화학과',admissionType:'교과',track:'목표전형'},student:{...student,minimumCatalogRows:catalog},identity}).evaluation;
 assert.notEqual(ev.status,'unlinked');
});
test('연결 실패에는 대학 자료 연도를 확정 표시하지 않음',()=>{
 const ev=c.resolveCatalogMinimum({target:{university:'단국대(죽전)',department:'화학과',admissionType:'교과',track:'존재하지않는전형'},student,identity}).evaluation;
 assert.equal(ev.status,'unlinked');assert.equal(ev.year,null);assert.match(n.minimumYearLabel(ev,student),/연도 미확정/);
});
