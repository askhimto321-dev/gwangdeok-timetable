import React, {useEffect, useRef, useState} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {validGrade} from './admissionMetrics.js';
import SupportDecisionCard from './SupportDecisionCard.jsx';
// 3번 요청: "인쇄했을 때 수시카드가 홈페이지 UI 그대로 나오게" — 예전에는 이 파일이 직접 만든
// 별도 카드 마크업(<article><h2>...)과 별도 CSS(supportPlanPrintCss)를 써서, 실제 화면의
// SupportDecisionCard와 생김새가 달랐습니다. 이제는 화면에서 쓰는 카드 컴포넌트와 실제 CSS
// 파일 두 개(theme.css, supportDecision.css)를 그대로 가져와 인쇄 문서에 심습니다.
import themeCss from './theme.css?raw';
import supportDecisionCss from './supportDecision.css?raw';

const grade=x=>validGrade(x)==null?'—':Number(x).toFixed(2);
export function SupportPlanReport({items,student,studentGrade,cutoffBasis}) {
  // 15번 요청: "선택한 전형만" 인쇄할 때 items는 안 고른 자리가 비어 있는(null) 배열로 옵니다.
  // 카드 번호가 실제 지원 구성 순서와 어긋나지 않도록 자리는 그대로 두고 개수만 실제 선택 수로 셉니다.
  const printedCount=items.filter(Boolean).length;
  return <main className="kd-print-doc">
    <header className="kd-print-head">
      <h1>수시지원 상담 카드</h1>
      <p>{student?.sid} {student?.name} · {student?.latestMockLabel || '모평 미선택'} · {printedCount}/6개 전형</p>
      <p>학생 9등급 환산 {grade(studentGrade)} · {cutoffBasis}%컷 비교 · 작성 {new Date().toLocaleDateString('ko-KR')}</p>
    </header>
    {/* 실제 "수시 지원 구성" 화면과 같은 .susi-beta-workspace > .susi-beta-plan-grid 구조로 감싸서,
        supportDecision.css의 화면 전용(.susi-beta-workspace 안에서만 적용되는) 규칙이 인쇄 문서에도 그대로 먹습니다. */}
    <div className="susi-beta-workspace">
      <div className="susi-beta-plan-grid">{Array.from({length:6},(_,i)=>{
        const item=items[i];
        if(!item) return <article key={i} className="susi-beta-plan-empty"><span>{i+1}</span><b>비어 있음</b></article>;
        return <SupportDecisionCard key={i} item={item} index={i} studentGrade={studentGrade} cutoffBasis={cutoffBasis} student={student} printMode/>;
      })}</div>
    </div>
    <footer className="kd-print-foot">상담 참고용 · 공개 컷 2026 / 권장과목 2028 / 최저 연도는 각 카드 표시. NAVI 사례는 대학·전형·계열 기준이며 연도 미제공. 미확인은 미이수 확정이 아닙니다. 모평 충족은 실제 수능 충족이나 합격을 보장하지 않습니다. 최종 모집요강 확인이 필요합니다.</footer>
  </main>;
}

// A separate same-origin print document avoids existing whole-app print CSS.
// theme.css/supportDecisionCss를 그대로 심어서 배지·박스 색이 화면과 100% 동일합니다.
// 그 위에 인쇄 전용 레이아웃(A4 가로, 2열 카드, 페이지 나눔 방지)만 추가합니다.
export const supportPlanPrintCss=`${themeCss}
${supportDecisionCss}
.susi-beta-plan-card,.susi-beta-plan-empty{box-sizing:border-box;min-width:0}
.susi-beta-plan-card b,.susi-beta-plan-card span,.susi-beta-plan-card small{min-width:0;overflow-wrap:anywhere;word-break:keep-all}
.susi-beta-plan-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
@page{size:A4 landscape;margin:9mm}
*{box-sizing:border-box}
body{margin:0;color:var(--kd-ink);font:12px/1.4 KDRound,Pretendard,'Malgun Gothic',system-ui,sans-serif;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.kd-print-head{border-bottom:2px solid var(--kd-brand);padding-bottom:6px;margin-bottom:10px}
.kd-print-head h1{font-size:19px;margin:0 0 4px;color:var(--kd-brand)}
.kd-print-head p{margin:2px 0;font-size:11.5px;color:#536170}
.susi-beta-plan-empty{min-height:120px;display:grid;place-items:center;gap:4px;border:1px dashed #d6dde8;border-radius:12px;background:#fafbfc;color:#9aa3b1;text-align:center;padding:12px}
.susi-beta-plan-empty span{font-weight:800}
.kd-decision-card{break-inside:avoid}
.kd-print-foot{margin-top:10px;color:#536170;font-size:9.5px;line-height:1.5}`;

export default function SupportPlanPrint(props) {
  const frame=useRef(null), [busy,setBusy]=useState(false), [message,setMessage]=useState('');
  useEffect(()=>{setBusy(false);setMessage('');return ()=>{frame.current?.remove();frame.current=null;};},[props.student?.sid]);
  const print=()=>{
    if(busy || props.disabled || !props.items.filter(Boolean).length)return;
    frame.current?.remove();setBusy(true);setMessage('인쇄 문서를 준비합니다.');
    const el=document.createElement('iframe');frame.current=el;
    el.title='수시지원 카드 인쇄 문서';el.setAttribute('aria-hidden','true');
    el.style.cssText='position:fixed;left:-10000px;top:0;width:1120px;height:790px;border:0';
    el.onload=async()=>{
      try{
        await el.contentDocument?.fonts?.ready;
        if(frame.current!==el)return;
        el.contentWindow.focus();el.contentWindow.print();
        setMessage('인쇄 창에서 프린터 또는 ‘PDF로 저장’을 선택하세요. A4 가로·기본 배율을 권장합니다.');
      }catch{setMessage('인쇄 창을 열지 못했습니다. 브라우저의 인쇄 허용 설정을 확인한 뒤 다시 시도하세요.');}
      finally{if(frame.current===el)setBusy(false);}
    };
    el.srcdoc='<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>수시지원 상담 카드</title><style>'+supportPlanPrintCss+'</style></head><body>'+renderToStaticMarkup(<SupportPlanReport {...props}/>)+'</body></html>';
    document.body.appendChild(el);
  };
  return <><button type="button" disabled={props.disabled || busy || !props.items.filter(Boolean).length} onClick={print}>{busy?'인쇄 준비 중…':'카드 인쇄 / PDF 저장'}</button>{message && <small role="status">{message}</small>}</>;
}
