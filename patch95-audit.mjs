import fs from 'node:fs';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import * as XLSX from 'xlsx';
import {chromium} from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const server=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
let browser;
try {
 const c=await server.ssrLoadModule('/src/minimumCatalog.js');
 const m=await server.ssrLoadModule('/src/minimumMapping.js');
 const g=await server.ssrLoadModule('/src/Grades.jsx');
 const book=XLSX.read(fs.readFileSync('../upload/대학별_전형별_수능최저_2027_2028(1).xlsx'),{type:'buffer'});
 const parsed=c.parseMinimumWorkbook(book,XLSX);assert.equal(parsed.errors.length,0);
 const rows=c.normalizeMinimumCatalog(parsed.rows);
 const student={admissionYear:2028,latestMockGrades:{국어:5,수학:4,영어:3,통합사회:3,통합과학:4,한국사:2}};
 const csv=[['규칙ID','학년도','대학','캠퍼스','전형유형','전형명','범위','조건원문','비고','검토상태','검토사유','해결분류','후속조치','샘플판정','판정사유']];
 const counts={};
 for(const row of rows){
  const ev=c.evaluateCatalogMinimum(row,student),disposition=row.reviewStatus==='사용안함'?{code:'disabled',label:'사용안함',action:'비활성 상태 유지. 원문 확인 후 관리자가 사용 여부 결정'}:m.minimumReviewDisposition(row);
  if(row.reviewStatus==='검토필요')counts[disposition.code]=(counts[disposition.code]||0)+1;
  csv.push([row.id,row.admissionYear,row.university,row.campus,row.admissionType,row.track,row.department,row.ruleText,row.note,row.reviewStatus,row.reviewReason,disposition.label,disposition.action,ev.status,ev.reason]);
 }
 fs.writeFileSync('../Patch95_minimum_audit.csv','\ufeff'+csv.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\r\n'));
 console.log(JSON.stringify({stats:c.minimumCatalogStats(rows),remaining:counts}));
 const admissionRows=[['건국대학교(서울)','KU지역균형'],['경희대학교(서울)','지역균형'],['고려대학교(서울)','학교장추천'],['고려대학교(세종)','학생부교과']].map(([university,track])=>({university,track,region:university.includes('세종')?'세종':'서울',department:'전모집단위',admissionYear:2028,requiredSubjects:'국·수·영·사/과택1',requiredSum:''}));
 const props={sid:'20999',studentInfo:{name:'검증학생',grade:2,entryYear:2025},gdb:{semesterData:{},mockData:{'2-9':{students:{20999:student.latestMockGrades}}},admissionRows,admissionDocs:[],minimumCatalog:{rows},studentAccounts:[],cohortSettings:{}}};
 const html=renderToStaticMarkup(React.createElement(g.StudentAdmissionView,props));
 assert.ok(html.includes('3합 8'));assert.ok(html.includes('2합 5'));assert.ok(html.includes('1개 영역'));assert.ok(html.includes('2028학년도'));
 browser=await chromium.launch({headless:true,executablePath:'/workspace/scratch/6dc1391e7241/audit/chromium-local/chromium133',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1400,height:1100}});
 const font=fs.readFileSync('../audit/NotoSansCJKkr-Regular.otf').toString('base64');
 await page.setContent(html+`<style>@font-face{font-family:Audit;src:url(data:font/otf;base64,${font})}body{margin:20px}body,body *{font-family:Audit,sans-serif!important}</style>`);
 await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('tbody tr').count(),4);
 assert.match(await page.locator('tbody tr').nth(3).innerText(),/(?:영어|통합사회) 3/);
 await page.screenshot({path:'../audit/patch95-diagnosis.png',fullPage:true});
 console.log('four screenshot rows rendered with registered criteria; full workbook audited');
} finally {await browser?.close();await server.close();}
