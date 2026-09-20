import React, {useEffect, useRef, useState} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {minimumDisplay} from './naviMinimum.js';
import {validGrade} from './admissionMetrics.js';

const grade=x=>validGrade(x)==null?'—':Number(x).toFixed(2);
export function SupportPlanReport({items,student,studentGrade,cutoffBasis}) {
  // 15번 요청: "선택한 전형만" 인쇄할 때 items는 안 고른 자리가 비어 있는(null) 배열로 옵니다.
  // 카드 번호가 실제 지원 구성 순서와 어긋나지 않도록 자리는 그대로 두고 개수만 실제 선택 수로 셉니다.
  const printedCount=items.filter(Boolean).length;
  return <main><header><h1>수시지원 상담 카드</h1><p>{student?.sid} {student?.name} · {student?.latestMockLabel || '모평 미선택'} · {printedCount}/6개 전형</p><p>학생 9등급 환산 {grade(studentGrade)} · {cutoffBasis}%컷 비교 · 작성 {new Date().toLocaleDateString('ko-KR')}</p></header><div className="grid">{Array.from({length:6},(_,i)=>{
    const item=items[i];if(!item)return <article key={i} className="empty">{i+1}. 비어 있음</article>;
    const ev=item.comparisonEvidence?.minimumEvaluation || item.minimumEvaluation;
    const min=minimumDisplay(ev,item.minimumStatus), progress=item.recommendationProgress;
    return <article key={i}><h2>{i+1}. {item.stored.university}</h2><p>{item.stored.department}</p><p>{item.stored.admissionType} · {item.stored.track}</p>
      <section><b>내신 컷 비교</b><p className="numbers">학생 {grade(studentGrade)} ↔ {cutoffBasis}%컷 {grade(item.admissionItem?.[cutoffBasis==='50'?1:2])}</p><p>{item.support?.label || '판정 자료 없음'} · 50% {grade(item.admissionItem?.[1])} / 70% {grade(item.admissionItem?.[2])}</p></section>
      <section className={`minimum ${min.status}`}><b>{min.label}</b><p>{ev?.year || '연도 확인'} 참고 · {ev?.ruleText || item.comparisonEvidence?.minimumText || '자료 미연결'}</p><p>반영 영역: {ev?.subjectsText || '미제공'}</p><p>{min.reason}</p>{ev?.note && <p>비고: {ev.note}</p>}<p>출처: {ev ? (ev.source || 'NAVI 수능최저 자료') : '연결 확인 필요'}</p></section>
      <section><b>권장과목 {progress?.total?`${progress.matched}/${progress.total}과목 확인`:'자료 미연결'}</b>{progress?.total>0 && <><p>확인: {progress.matchedCourses?.join(', ') || '없음'}</p><p>미확인: {progress.missingCourses?.join(', ') || '없음'}</p></>}</section>
      <p className="source">NAVI 통합 사례 {item.naviCaseCount==null?'미제공':`${item.naviCaseCount}건`} · 광덕고 {item.schoolTrend?.total==null?'미연결':`지원 ${item.schoolTrend.total}건 / 합격 ${item.schoolTrend.accepted ?? '미제공'}건`} · {item.schoolTrend?.years || '사례 연도 미제공'}</p>
    </article>;
  })}</div><footer>상담 참고용 · 공개 컷 2026 / 권장과목 2028 / 최저 연도는 각 카드 표시. NAVI 사례는 대학·전형·계열 기준이며 연도 미제공. 미확인은 미이수 확정이 아닙니다. 모평 충족은 실제 수능 충족이나 합격을 보장하지 않습니다. 최종 모집요강 확인이 필요합니다.</footer></main>;
}

// A separate same-origin print document avoids existing whole-app print CSS.
export const supportPlanPrintCss=`@page{size:A4 landscape;margin:8mm}*{box-sizing:border-box}body{margin:0;color:#20334c;font:10px/1.35 'Malgun Gothic',system-ui,sans-serif}h1{font-size:18px;margin:0}header{border-bottom:2px solid #264a76;padding-bottom:5px;margin-bottom:7px}header p{display:inline-block;margin:3px 16px 0 0}h2{font-size:14px;margin:0 0 3px;color:#253d61}p{margin:3px 0;overflow-wrap:anywhere}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;align-items:start}article{border:1px solid #b9c8d9;border-top:3px solid #476da6;border-radius:6px;padding:8px;break-inside:avoid}section{border-top:1px solid #d8e1eb;margin-top:5px;padding-top:5px}.numbers{font-size:16px;font-weight:800;color:#194f91;font-variant-numeric:tabular-nums}.minimum>b{font-size:13px}.satisfied>b{color:#17613e}.unsatisfied>b{color:#a22430}.manual>b,.unlinked>b,.unavailable>b{color:#88550d}.source,footer{color:#536170;font-size:9px}footer{margin-top:8px}.empty{min-height:100px;color:#67778b;display:grid;place-items:center}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}`;

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
