import fs from 'node:fs';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {chromium} from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const server=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
let browser;
try{
 const g=await server.ssrLoadModule('/src/Grades.jsx');
 const props={sid:'20999',studentInfo:{name:'검증학생',grade:2,class:9,number:99},gdb:{admissionCounseling:{20999:[{id:'note',date:'2026-09-23',author:'담임',text:'관심 학과와 지원 전형을 확인했습니다. 다음 상담까지 수능최저와 권장과목을 확인합니다.',attachments:[{fileName:'상담 자료.pdf'}]}]}},favorites:['경희대','가천대','건국대','국민대','서울과기대','한양대'].map((university,i)=>({id:String(i),university,region:'서울',department:'화학공학과',admissionType:'교과'}))};
 const font=fs.readFileSync('../audit/patch93-korean.otf').toString('base64');
 const fontCss=`@font-face{font-family:AuditKorean;src:url(data:font/otf;base64,${font})}html body .kd-consultation-ui,html body .kd-consultation-ui *,html body.print-counseling-history>.counseling-print-root-clone,html body.print-counseling-history>.counseling-print-root-clone *{font-family:AuditKorean,sans-serif!important}`;
 browser=await chromium.launch({headless:true,executablePath:'/workspace/scratch/6dc1391e7241/audit/chromium-local/chromium133',args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1400,height:950}});
 await page.setContent(renderToStaticMarkup(React.createElement(g.StudentConsultationView,props))+`<style>${fontCss}</style>`);
 // React's static serializer escapes style text; the live client assigns textContent.
 await page.evaluate(()=>document.querySelectorAll('.kd-consultation-ui>style').forEach(style=>{const t=document.createElement('textarea');t.innerHTML=style.textContent;style.textContent=t.value;}));
 await page.evaluate(()=>document.fonts.ready);
 await page.locator('.kd-consultation-ui').evaluate(el=>el.classList.add('is-card-focus'));
 assert.equal(await page.locator('.favorite-print-card').count(),6);
 assert.equal(await page.locator('.favorite-print-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),3);
 await page.screenshot({path:'../audit/patch93-consult-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('.favorite-print-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 await page.screenshot({path:'../audit/patch93-consult-mobile.png',fullPage:true});
 for(const paper of ['A4','B4']){
  for(const mode of ['both','favorites','notes']){
   console.log('checking',paper,mode);
   await page.evaluate(({fn,paper,mode})=>{
    const styles=[...document.querySelectorAll('.kd-consultation-ui>style')].map(s=>s.textContent);
    window.COUNSELING_PRINT_CSS=styles[0];window.counselingCss=styles[1];
    const note=document.querySelector('.counseling-print-note-text');
    note.textContent=mode==='notes'?'긴 상담 기록을 다음 페이지까지 누락 없이 출력합니다.\n'.repeat(140)+'END_OF_LONG_NOTE':'상담 기록과 권장과목을 확인했습니다.';
    document.querySelectorAll('[data-test-long]').forEach(node=>node.remove());
    if(paper==='B4'&&mode==='favorites'){
     const first=document.querySelector('.favorite-print-item');
     for(let i=1;i<=40;i++){const item=first.cloneNode(true);item.dataset.testLong='true';item.querySelector('b').textContent=`추가 관심 학과 ${i} LAST_FAVORITE_${i}`;first.parentElement.appendChild(item);}
    }
    (0,eval)(`(${fn})`)({paper,notes:mode!=='favorites',favorites:mode!=='notes'});
    const f=document.querySelector('iframe');f.contentWindow.print=()=>{f.dataset.printReady='true';};
   },{fn:g.printCounselingHistory.toString().replace(/__vite_ssr_import_\d+__\.default/g,'counselingCss'),paper,mode});
   await page.waitForFunction(()=>document.querySelector('iframe')?.dataset.printReady==='true');
   const html=await page.locator('iframe').evaluate(frame=>frame.contentDocument.documentElement.outerHTML);
   const printPage=await browser.newPage();await printPage.setContent(html+`<style>${fontCss}</style>`);await printPage.evaluate(()=>document.fonts.ready);
   assert.equal(await printPage.locator('.favorite-print-card').count(),mode==='notes'?0:6);
   assert.equal(await printPage.locator('.counseling-print-note').count(),mode==='favorites'?0:1);
   assert.equal(await printPage.locator('button').count(),0);
   if(mode!=='favorites')assert.match(await printPage.locator('body').innerText(),/상담 자료.pdf/);
   await printPage.pdf({path:`../audit/patch93-${paper}-${mode}.pdf`,preferCSSPageSize:true,printBackground:true,timeout:30000});
   await printPage.close();await page.locator('iframe').evaluate(frame=>frame.remove());
  }
 }
 console.log('desktop/mobile layout and six A4/B4 print combinations passed');
}finally{await browser?.close();await server.close();}
