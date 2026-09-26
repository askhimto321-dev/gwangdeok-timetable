import React, {useEffect, useRef, useState} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Printer} from 'lucide-react';
import {validGrade} from './admissionMetrics.js';
import SupportDecisionCard from './SupportDecisionCard.jsx';
// 3번 요청: "인쇄했을 때 수시카드가 홈페이지 UI 그대로 나오게" — 예전에는 이 파일이 직접 만든
// 별도 카드 마크업(<article><h2>...)과 별도 CSS(supportPlanPrintCss)를 써서, 실제 화면의
// SupportDecisionCard와 생김새가 달랐습니다. 이제는 화면에서 쓰는 카드 컴포넌트와 실제 CSS
// 파일 두 개(theme.css, supportDecision.css)를 그대로 가져와 인쇄 문서에 심습니다.
import themeCss from './theme.css?raw';
import supportDecisionCss from './supportDecision.css?raw';

const grade=x=>validGrade(x)==null?'—':Number(x).toFixed(2);
export function SupportPlanReport({items,student,studentGrade,cutoffBasis,layout='six'}) {
  // 선택 인쇄 때 비어 있는 슬롯까지 종이에 찍으면 한 카드가 불필요하게 다음 페이지로 밀립니다.
  // 실제 카드만 촘촘히 배치하되, 카드 번호는 원래 지원 구성 순서(1~6)를 유지합니다.
  const printableItems=items.map((item,index)=>({item,index})).filter(value=>value.item);
  const printedCount=printableItems.length;
  const perPage=layout==='two'?2:6;
  const pages=Array.from({length:Math.ceil(printedCount/perPage)},(_,page)=>printableItems.slice(page*perPage,(page+1)*perPage));
  return <>{pages.map((page,pageIndex)=><main key={pageIndex} className={`kd-print-doc is-mode-${layout} is-count-${page.length}`}>
    <header className="kd-print-head">
      <div><h1>수시지원 상담 카드</h1><p>{student?.sid} {student?.name} · {student?.latestMockLabel || '모평 미선택'} · 전체 {printedCount}개 전형</p></div>
      <p>9등급 환산 {grade(studentGrade)} · {cutoffBasis}%컷 · {pages.length>1?`${pageIndex+1}/${pages.length}쪽 · `:''}{new Date().toLocaleDateString('ko-KR')}</p>
    </header>
    {/* 실제 "수시 지원 구성" 화면과 같은 .susi-beta-workspace > .susi-beta-plan-grid 구조로 감싸서,
        supportDecision.css의 화면 전용(.susi-beta-workspace 안에서만 적용되는) 규칙이 인쇄 문서에도 그대로 먹습니다. */}
    <div className="susi-beta-workspace">
      <div className="susi-beta-plan-grid">{page.map(({item,index})=><SupportDecisionCard key={index} item={item} index={index} studentGrade={studentGrade} cutoffBasis={cutoffBasis} student={student} printMode compactPrint={layout==='six'}/>)}</div>
    </div>
    <footer className="kd-print-foot">상담 참고용 · 공개 컷 2026 / 권장과목 2028 / 최저 연도는 각 카드 표시. NAVI 사례는 대학·전형·계열 기준이며 연도 미제공. 미확인은 미이수 확정이 아닙니다. 모평 충족은 실제 수능 충족이나 합격을 보장하지 않습니다. 최종 모집요강 확인이 필요합니다.</footer>
  </main>)}</>;
}

// A separate same-origin print document avoids existing whole-app print CSS.
// theme.css/supportDecisionCss를 그대로 심어서 배지·박스 색이 화면과 100% 동일합니다.
// 그 위에 인쇄 전용 레이아웃(A4 가로, 2열 카드, 페이지 나눔 방지)만 추가합니다.
export const supportPlanPrintCss=`${themeCss}
${supportDecisionCss}
.susi-beta-plan-card{box-sizing:border-box;min-width:0}
.susi-beta-plan-card b,.susi-beta-plan-card span,.susi-beta-plan-card small{min-width:0;overflow-wrap:anywhere;word-break:keep-all}
.kd-print-doc .susi-beta-plan-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:3mm!important;align-items:stretch;height:166mm}
.kd-print-doc.is-count-1 .susi-beta-plan-grid{grid-template-columns:minmax(0,190mm)!important;justify-content:center}
.kd-print-doc.is-count-3 .susi-beta-plan-grid,.kd-print-doc.is-count-4 .susi-beta-plan-grid{grid-template-rows:repeat(2,minmax(0,1fr))}
.kd-print-doc.is-count-5 .susi-beta-plan-grid,.kd-print-doc.is-count-6 .susi-beta-plan-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;grid-template-rows:repeat(2,minmax(0,1fr))}
@page{size:A4 landscape;margin:6mm}
*{box-sizing:border-box}
html,body{margin:0;width:100%;height:100%;overflow:hidden;color:var(--kd-ink);font:9pt/1.25 KDRound,Pretendard,'Malgun Gothic',system-ui,sans-serif;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.kd-print-doc{height:198mm;display:grid;grid-template-rows:auto 1fr auto;gap:2.4mm;overflow:hidden}
.kd-print-head{display:flex;align-items:flex-end;justify-content:space-between;gap:8mm;border-bottom:1.5px solid var(--kd-brand);padding:0 0 2mm;margin:0}
.kd-print-head h1{font-size:14pt;line-height:1.15;margin:0;color:var(--kd-brand)}
.kd-print-head p{margin:1mm 0 0;font-size:7.7pt;color:#536170}
.kd-print-head>p{text-align:right;white-space:nowrap}
.kd-print-doc .susi-beta-workspace{min-height:0}
.kd-print-doc .kd-decision-card{height:100%;min-height:0;padding:2.2mm!important;gap:1.5mm!important;border-radius:2.5mm!important;break-inside:avoid-page;page-break-inside:avoid;overflow:hidden;font-size:7.1pt!important;line-height:1.24!important;box-shadow:none!important}
.kd-print-doc .kd-decision-card header{gap:2mm}
.kd-print-doc .kd-decision-card h4{font-size:10.5pt!important;line-height:1.15!important;margin:0 0 .5mm!important}
.kd-print-doc .kd-decision-card header p{font-size:7.2pt!important;line-height:1.2!important;margin:.4mm 0!important}
.kd-print-doc .kd-decision-card header [class*="kd-track-chip"]{font-size:6.5pt!important;padding:.8mm 1.4mm!important}
.kd-print-doc .kd-decision-number{width:5.5mm!important;height:5.5mm!important;flex-basis:5.5mm!important;font-size:6.7pt!important}
.kd-print-doc .kd-decision-primary{gap:1.5mm!important}
.kd-print-doc .kd-decision-primary section{padding:1.6mm!important;border-radius:2mm!important}
.kd-print-doc .kd-decision-primary h5{font-size:7.1pt!important;line-height:1.2!important;margin:0 0 1mm!important}
.kd-print-doc .kd-decision-primary h5>span{font-size:5.9pt!important}
.kd-print-doc .kd-decision-num-box{padding:1mm!important;border-radius:1.5mm!important}
.kd-print-doc .kd-decision-card .kd-decision-num-box small,.kd-print-doc .kd-minimum-fact small,.kd-print-doc .kd-minimum-grade-block>small{font-size:5.7pt!important;line-height:1.15!important}
.kd-print-doc .kd-decision-card .kd-decision-num-box b{font-size:11pt!important}
.kd-print-doc .kd-decision-band-row{margin:1mm 0 .4mm!important;gap:1mm!important}
.kd-print-doc .kd-decision-band-row span,.kd-print-doc .kd-decision-diff,.kd-print-doc .kd-decision-subref{font-size:6pt!important;line-height:1.2!important}
.kd-print-doc .kd-decision-verdict{font-size:7.2pt!important;line-height:1.2!important;margin:0!important}
.kd-print-doc .kd-minimum-grade-block{margin-top:1mm!important;padding:1mm!important}
.kd-print-doc .kd-mock-chip{font-size:6pt!important;padding:.5mm 1mm!important}
.kd-print-doc .kd-mock-chip b{font-size:6.5pt!important}
.kd-print-doc .kd-minimum-rule-grid{gap:1mm!important;margin-top:1mm!important}
.kd-print-doc .kd-minimum-fact{padding:1mm!important;border-radius:1.5mm!important}
.kd-print-doc .kd-minimum-fact b{font-size:6.8pt!important;margin-top:.4mm!important}
.kd-print-doc .kd-minimum-status{font-size:5.8pt!important;margin-top:1mm!important;padding:.7mm 1.2mm!important}
.kd-print-doc .kd-decision-min-detail,.kd-print-doc .kd-decision-evidence,.kd-print-doc .kd-course-source-note,.kd-print-doc .kd-course-details>small{display:none!important}
.kd-print-doc .kd-course-details{padding:1.4mm!important;border-radius:2mm!important;min-height:0;flex-shrink:0}
.kd-print-doc .kd-course-details summary{min-height:0!important;font-size:6.8pt!important;line-height:1.2!important;gap:1mm!important;margin:0!important}
.kd-print-doc .kd-course-details summary strong{font-size:6.4pt!important;white-space:nowrap}
.kd-print-doc .kd-course-details summary:after{display:none!important}
.kd-print-doc .kd-course-group-title{font-size:6.2pt!important;line-height:1.15!important;margin:1mm 0 .6mm!important}
.kd-print-doc .kd-course-chips{gap:.7mm!important}
.kd-print-doc .kd-course-chips span{font-size:5.8pt!important;line-height:1.15!important;padding:.55mm 1mm!important;border-radius:1.2mm!important}
.kd-print-doc .kd-decision-warning{font-size:6.2pt!important;padding:1mm!important;margin:0!important}
.kd-print-doc.is-count-1 .kd-decision-card,.kd-print-doc.is-count-2 .kd-decision-card{height:auto;align-self:start}
.kd-print-foot{margin:0;padding-top:1.4mm;border-top:1px solid #dce3ea;color:#536170;font-size:5.9pt;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* Leave tolerance for the browser's mm-to-pixel rounding and printer margins. */
html,body{height:auto!important;overflow:visible!important}
.kd-print-doc{height:188mm!important;max-height:188mm!important;margin:0!important;grid-template-rows:auto minmax(0,1fr) auto!important;break-after:page;page-break-after:always;break-inside:avoid-page;page-break-inside:avoid;overflow:hidden!important}
.kd-print-doc:last-child{break-after:auto;page-break-after:auto}
.kd-print-doc .susi-beta-workspace{min-height:0!important;overflow:hidden!important}
.kd-print-doc .susi-beta-plan-grid{height:100%!important;min-height:0!important;align-content:stretch!important}
.kd-print-doc.is-mode-six .susi-beta-plan-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;grid-template-rows:repeat(2,minmax(0,1fr))!important}
.kd-print-doc.is-mode-six.is-count-1 .susi-beta-plan-grid{grid-template-columns:minmax(0,190mm)!important;grid-template-rows:minmax(0,1fr)!important;justify-content:center}
.kd-print-doc.is-mode-six.is-count-2 .susi-beta-plan-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-template-rows:minmax(0,1fr)!important}
.kd-print-doc.is-mode-six.is-count-3 .susi-beta-plan-grid,.kd-print-doc.is-mode-six.is-count-4 .susi-beta-plan-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
.kd-print-doc.is-mode-two .susi-beta-plan-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-template-rows:minmax(0,1fr)!important}
.kd-print-doc.is-mode-two.is-count-1 .susi-beta-plan-grid{grid-template-columns:minmax(0,190mm)!important;justify-content:center}
.kd-print-doc .kd-decision-card{height:100%!important;align-self:stretch!important}
.kd-print-doc.is-mode-two .kd-decision-card{font-size:8.2pt!important;padding:3mm!important}
.kd-print-doc.is-mode-two .kd-decision-card h4{font-size:12pt!important}
.kd-print-doc.is-mode-two .kd-course-chips span{font-size:8pt!important}
/* A consistent type scale keeps the same Hangul font and avoids tiny labels. */
.kd-print-doc .kd-decision-card{font-family:"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif!important;font-size:8pt!important;line-height:1.32!important;letter-spacing:0!important}
.kd-print-doc .kd-decision-card *{font-family:inherit!important;letter-spacing:inherit!important}
.kd-print-doc .kd-decision-card h4{font-size:11pt!important;line-height:1.24!important}
.kd-print-doc .kd-decision-card header p,.kd-print-doc .kd-decision-card header [class*="kd-track-chip"]{font-size:8pt!important;line-height:1.3!important}
.kd-print-doc .kd-decision-primary h5,.kd-print-doc .kd-course-details summary{font-size:8.3pt!important;line-height:1.3!important}
.kd-print-doc .kd-decision-primary h5>span,.kd-print-doc .kd-course-details summary strong{font-size:7.5pt!important}
.kd-print-doc .kd-decision-card .kd-decision-num-box small,.kd-print-doc .kd-minimum-fact small,.kd-print-doc .kd-minimum-grade-block>small{font-size:7pt!important}
.kd-print-doc .kd-decision-card .kd-decision-num-box b{font-size:12pt!important}
.kd-print-doc .kd-decision-band-row span,.kd-print-doc .kd-decision-diff,.kd-print-doc .kd-decision-subref,.kd-print-doc .kd-decision-verdict,.kd-print-doc .kd-minimum-fact b,.kd-print-doc .kd-course-group-title,.kd-print-doc .kd-decision-warning,.kd-print-doc .kd-mock-chip,.kd-print-doc .kd-mock-chip b,.kd-print-doc .kd-minimum-status{font-size:7.5pt!important;line-height:1.3!important}
.kd-print-doc .kd-course-chips span{font-size:7.3pt!important;line-height:1.25!important}
.kd-print-doc .kd-decision-card{overflow:visible!important}
.kd-print-doc.is-mode-two .kd-decision-card{font-size:9pt!important}
.kd-print-doc.is-mode-two .kd-decision-card h4{font-size:12pt!important}
.kd-print-doc.is-mode-two .kd-course-chips span{font-size:8pt!important}`;

export function fitPrintCards(doc) {
 return [...doc.querySelectorAll('.kd-decision-card')].some(card=>card.scrollHeight>card.clientHeight+3);
}

export default function SupportPlanPrint(props) {
  const frame=useRef(null), [busy,setBusy]=useState(false), [message,setMessage]=useState('');
  useEffect(()=>{setBusy(false);setMessage('');return ()=>{frame.current?.remove();frame.current=null;};},[props.student?.sid]);
  const [layout,setLayout]=useState('six');
  const print=()=>{
    if(busy || props.disabled || !props.items.filter(Boolean).length)return;
    frame.current?.remove();setBusy(true);setMessage('인쇄 문서를 준비합니다.');
    const el=document.createElement('iframe');frame.current=el;
    el.title='수시지원 카드 인쇄 문서';el.setAttribute('aria-hidden','true');
    el.style.cssText='position:fixed;left:-10000px;top:0;width:1077px;height:748px;border:0';
    let effectiveLayout=layout;
    const printHtml=mode=>'<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>수시지원 상담 카드</title><style>'+supportPlanPrintCss+'</style></head><body>'+renderToStaticMarkup(<SupportPlanReport {...props} layout={mode}/>)+'</body></html>';
    el.onload=async()=>{
      try{
        await el.contentDocument?.fonts?.ready;
        if(frame.current!==el)return;
        // Keep a readable font. If a six-card grid overflows, use the two-card layout.
        if(effectiveLayout==='six' && fitPrintCards(el.contentDocument)){
          effectiveLayout='two';
          el.srcdoc=printHtml('two');
          return;
        }
        el.contentWindow.focus();el.contentWindow.print();
        setMessage(`인쇄 창에서 ‘PDF로 저장’을 선택하세요. A4 가로 · ${effectiveLayout==='six'?'한 쪽에 최대 6장':'한 쪽에 최대 2장'}입니다.${effectiveLayout!==layout?' 긴 카드가 있어 글자 크기를 유지하도록 2장씩 배치했습니다.':''}`);
        if(frame.current===el)setBusy(false);
      }catch{setMessage('인쇄 창을 열지 못했습니다. 브라우저의 인쇄 허용 설정을 확인한 뒤 다시 시도하세요.');if(frame.current===el)setBusy(false);}
    };
    el.srcdoc=printHtml(layout);
    document.body.appendChild(el);
  };
  return <><div className="kd-plan-print-choice" role="group" aria-label="한 페이지에 인쇄할 카드 수"><button type="button" className="kd-plan-print-option" aria-pressed={layout==='six'} onClick={()=>setLayout('six')}>6장 / 1쪽</button><button type="button" className="kd-plan-print-option" aria-pressed={layout==='two'} onClick={()=>setLayout('two')}>2장 / 1쪽</button></div><button type="button" className="kd-plan-action is-print" disabled={props.disabled || busy || !props.items.filter(Boolean).length} onClick={print}><Printer size={15}/>{busy?'인쇄 준비 중…':'카드 인쇄·PDF 저장'}</button>{message && <small className="kd-plan-print-message" role="status">{message}</small>}</>;
}
