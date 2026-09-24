import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'vite';

const server=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
try{
 const c=await server.ssrLoadModule('/src/minimumCatalog.js');
 const {homepageMinimumCoverage}=await server.ssrLoadModule('/src/minimumCatalogCoverage.js');
 const rows=c.normalizeMinimumCatalog(JSON.parse(fs.readFileSync('src/minimumCatalogSeed.json','utf8')));
 assert.deepEqual(c.minimumCatalogStats(rows),{total:804,ready:740,review:50,disabled:14});
 assert.equal(c.normalizeMinimumCatalog(rows).length,804);
 const by=id=>rows.find(r=>r.id===id);
 for(const id of ['MIN-20cc73377f0096c0-global','MIN-1bf9381478b1ebd9-nursing','MIN-66eeb27f037d542f-pyeongtaek','MIN-d87864e7f93fbf1e-design','MIN-080e2a6e732fd203-sejong'])assert.equal(by(id).reviewStatus,'계산가능');
 assert.equal(by('MIN-7ea70e55264efc90').reviewStatus,'검토필요');
 const student=grades=>({admissionYear:2028,latestMockGrades:{국어:5,수학:4,영어:3,통합사회:3,통합과학:4,한국사:2,...grades}});
 assert.equal(c.evaluateCatalogMinimum(by('MIN-57a764e7c74aadc1'),student({국어:1,수학:1,영어:2,통합과학:3})).status,'unsatisfied');
 assert.equal(c.evaluateCatalogMinimum(by('MIN-57a764e7c74aadc1'),student({국어:1,수학:1,영어:2,통합과학:2})).status,'satisfied');
 assert.equal(c.evaluateCatalogMinimum(by('MIN-d66eb2f48b60ccf0'),student({국어:5,수학:2,통합사회:3})).status,'satisfied');
 const target=(university,region,admissionType,track,department)=>({university,region,admissionType,track,department,admissionYear:2028});
 const coverage=homepageMinimumCoverage([
  target('한국외국어대학교','서울','교과','학교장추천','영어영문학과'),
  target('한국외국어대학교','경기','교과','학교장추천','영어영문학과'),
  target('한경국립대학교','경기','교과','일반','전기공학과'),
  {...target('없는대학교','서울','교과','지역균형','생물학과'),requiredSum:'2합 7'},
  target('없는대학교','서울','교과','학교장추천','화학과')
 ],rows);
 assert.equal(coverage.stats.total,5);
 assert.equal(coverage.stats.stored,1);
 assert.equal(coverage.stats.unlinked,1);
 assert.equal(coverage.targets.at(-1).status,'미연결');
 console.log('Patch100 branches, conditional English and lazy coverage passed');
}finally{await server.close();}
