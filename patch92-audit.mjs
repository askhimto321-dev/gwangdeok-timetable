import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {renderToStaticMarkup} from 'react-dom/server';
import {chromium} from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const server=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
let browser;
try {
 const c=await server.ssrLoadModule('/src/minimumCatalog.js');
 const p=await server.ssrLoadModule('/src/SupportPlanPrint.jsx');
 const seed=JSON.parse(fs.readFileSync('src/minimumCatalogSeed.json','utf8'));
 const rows=c.normalizeMinimumCatalog(seed),ready=rows.filter(r=>r.reviewStatus==='계산가능');
 let checks=0;
 for(const row of ready){
  assert.deepEqual(c.validateMinimumRow(row),[],row.id);
  for(const grade of [1,3,9,null]){
   const grades=Object.fromEntries(['국어','수학','영어','통합사회','통합과학','한국사'].map(k=>[k,grade]));
   const ev=c.evaluateCatalogMinimum(row,{admissionYear:2028,latestMockGrades:grades});
   assert.notEqual(ev.status,'manual',row.id);
   if(grade===1)assert.ok(['satisfied','no-minimum'].includes(ev.status),row.id);
   if(grade===null&&row.ruleType!=='없음')assert.ok(['unavailable','satisfied'].includes(ev.status),row.id);
   if(ev.selectedSubjects)assert.equal(ev.studentSum,ev.selectedSubjects.reduce((n,x)=>n+x.grade,0),row.id);
   checks++;
  }
 }
 const linked=c.resolveCatalogMinimum({target:{university:'서울과기대',region:'서울',department:'환경공학과',field:'자연',admissionType:'교과',track:'고교추천'},student:{admissionYear:2028,minimumCatalogRows:rows,latestMockGrades:{국어:5,수학:4,영어:3,통합사회:3,통합과학:4,한국사:2}},identity:u=>u});
 assert.equal(linked.evaluation.status,'satisfied');assert.equal(linked.evaluation.year,2028);assert.equal(linked.evaluation.threshold,6);
 browser=await chromium.launch({headless:true,executablePath:'/workspace/scratch/6dc1391e7241/audit/chromium-local/chromium133',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1077,height:748}});
 await page.emulateMedia({media:'print'});
 const courses=['대수','미적분I','미적분II','확률과 통계','기하','물리학','화학','생명과학','물질과 에너지','화학 반응의 세계','세포와 물질대사'];
 const item={stored:{university:'서울과기대',department:'환경공학과',admissionType:'교과',track:'고교추천'},admissionItem:['고교추천',1.96,2],support:{label:'적정'},minimumEvaluation:linked.evaluation,recommendationProgress:{total:11,matched:6,studentCourseCount:6,matchedCourses:courses.slice(0,6),missingCourses:courses.slice(6),courseGroups:[['핵심과목',courses.slice(0,8)],['권장과목',courses.slice(8)]]}};
 for(const count of [1,2,3,4,5,6]){
  const html=renderToStaticMarkup(p.SupportPlanReport({items:Array(count).fill(item),student:{sid:'검증',name:'테스트',admissionYear:2028},studentGrade:2.03,cutoffBasis:'70'}));
  const font=fs.readFileSync('../audit/patch93-korean.otf').toString('base64');
  await page.setContent(`<style>@font-face{font-family:AuditKorean;src:url(data:font/otf;base64,${font})} ${p.supportPlanPrintCss} .kd-print-doc,.kd-print-doc *{font-family:AuditKorean,sans-serif!important}</style>${html}`);
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(`(${p.fitPrintCards.toString()})(document)`);
  const overflow=await page.locator('.kd-decision-card').evaluateAll(cards=>cards.map(e=>({scroll:e.scrollHeight,client:e.clientHeight,course:e.querySelector('.kd-course-details').scrollHeight,courseClient:e.querySelector('.kd-course-details').clientHeight})));
  assert.ok(overflow.every(x=>x.scroll<=x.client+1&&x.course<=x.courseClient+1),JSON.stringify({count,overflow}));
  if(count===6)await page.screenshot({path:'../audit/patch92-print-six.png',fullPage:true});
 }
 console.log(JSON.stringify({rules:rows.length,ready:ready.length,evaluationChecks:checks,printLayouts:6,alias:'서울과기대 → 2028 고교추천 2합6 충족'}));
} finally {await browser?.close();await server.close();}
