import React,{useMemo,useRef,useState} from 'react';
import {parseMinimumWorkbook,minimumCatalogStats,mergeMinimumCatalog,normalizeMinimumCatalog} from './minimumCatalog.js';
import {minimumReviewIssues,minimumReviewDisposition,minimumMappingPlan,minimumRulePattern} from './minimumMapping.js';
import seed from './minimumCatalogSeed.json';
import './minimumCatalog.css';

export default function MinimumCatalogAdmin({gdb,persistGrades,showToast}) {
 const current=normalizeMinimumCatalog(gdb.minimumCatalog?.rows||seed);
 const [preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('전체');
 const [issueFilter,setIssueFilter]=useState('전체'),[dispositionFilter,setDispositionFilter]=useState('전체'),[workTypeFilter,setWorkTypeFilter]=useState('전체');
 const fileRef=useRef(null);
 const displayed=preview?.rows||current,stats=minimumCatalogStats(displayed);
 const issueCounts=useMemo(()=>{const counts=new Map();for(const r of displayed)for(const issue of minimumReviewIssues(r))counts.set(issue.code,{...issue,count:(counts.get(issue.code)?.count||0)+1});return [...counts.values()];},[displayed]);

 const diff=useMemo(()=>preview?mergeMinimumCatalog(current,preview.rows):null,[current,preview]);
 const dispositions=useMemo(()=>{const m=new Map();for(const r of displayed.filter(x=>x.reviewStatus==='검토필요')){const d=minimumReviewDisposition(r);m.set(d.code,{...d,count:(m.get(d.code)?.count||0)+1});}return [...m.values()];},[displayed]);
 const workTypes=useMemo(()=>{const m=new Map();for(const r of displayed){const p=minimumMappingPlan(r)||minimumRulePattern(r);if(p)m.set(p.code,{...p,count:(m.get(p.code)?.count||0)+1});}return [...m.values()];},[displayed]);
 const filtered=useMemo(()=>displayed.filter(r=>{const p=minimumMappingPlan(r)||minimumRulePattern(r);return (filter==='전체'||r.reviewStatus===filter)&&(issueFilter==='전체'||minimumReviewIssues(r).some(i=>i.code===issueFilter))&&(dispositionFilter==='전체'||minimumReviewDisposition(r).code===dispositionFilter)&&(workTypeFilter==='전체'||p?.code===workTypeFilter)&&(!query||`${r.university} ${r.campus} ${r.track} ${r.department} ${r.reviewReason} ${p?.label||''}`.includes(query));}),[displayed,query,filter,issueFilter,dispositionFilter,workTypeFilter]);
 async function readFile(file) {
  if(!file)return;setBusy(true);setError('');setPreview(null);
  try {
   if(file.size>20*1024*1024)throw new Error('20MB 이하의 최저자료 엑셀을 선택하세요.');
   const XLSX=await import('xlsx');const book=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
   const parsed=parseMinimumWorkbook(book,XLSX);setPreview({...parsed,fileName:file.name});
  }catch(e){setError(e.message||'엑셀을 읽지 못했습니다.');}finally{setBusy(false);if(fileRef.current)fileRef.current.value='';}
 }
 async function save() {
  if(!preview||preview.errors.length||busy)return;setBusy(true);setError('');
  try {
   const catalog={schema:1,rows:diff.rows,previousRows:current,updatedAt:new Date().toISOString(),fileName:preview.fileName};
   const ok=await persistGrades({minimumCatalog:catalog});
   if(ok){setPreview(null);showToast?.(`최저자료 ${diff.added}건 추가 · ${diff.changed}건 수정`,'success');}
   else setError('저장되지 않았습니다. 미리보기를 유지했습니다. 다시 시도하세요.');
  }catch(e){setError(e.message||'저장 실패');}finally{setBusy(false);}
 }
 async function restore() {
  if(!gdb.minimumCatalog?.previousRows||busy)return;setBusy(true);setError('');
  try {const ok=await persistGrades({minimumCatalog:{...gdb.minimumCatalog,rows:gdb.minimumCatalog.previousRows,previousRows:current,updatedAt:new Date().toISOString(),fileName:'직전 자료 복구'}});if(ok)showToast?.('직전 최저자료로 복구했습니다.','success');else setError('복구 저장 실패');}catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <section className="kd-minimum-admin">
  <header><div><h3>수능최저 자료 연결</h3><p>학년도·캠퍼스·전형·모집단위 연결과 판정식을 분리해 관리합니다. 통사·통과는 2028 자료에서 사·과로 자동 보정합니다.</p></div><span>{gdb.minimumCatalog?.updatedAt?`최근 반영 ${new Date(gdb.minimumCatalog.updatedAt).toLocaleDateString('ko-KR')}`:'Patch83 기본 자료 적용 중'}</span></header>
  <div className="kd-minimum-stats"><b>전체 {stats.total}</b><b>계산 가능 {stats.ready}</b><b>검토 필요 {stats.review}</b><span>사용 안 함 {stats.disabled}</span></div>
  <p>‘계산 가능’은 계산 규칙이 준비된 상태입니다. 학생 성적이나 홈페이지 전형명이 부족하면 판정을 보류합니다. 원문 상충·전형명 누락은 검토 필요로 유지합니다.</p>
  <div className="kd-minimum-actions"><label className="kd-minimum-button">{busy?'처리 중…':'호환 엑셀 선택'}<input ref={fileRef} type="file" accept=".xlsx" disabled={busy} onChange={e=>readFile(e.target.files?.[0])}/></label>{!preview&&gdb.minimumCatalog?.previousRows&&<button disabled={busy} onClick={restore}>직전 자료로 복구</button>}</div>
  {error&&<p role="alert" className="kd-minimum-error">{error}</p>}
  {preview&&<div className="kd-minimum-preview"><b>{preview.fileName}</b><p>신규 {diff.added} · 변경 {diff.changed} · 동일 {diff.unchanged} · 형식 오류 {preview.errors.length}</p><p>규칙ID가 같은 행만 갱신합니다. 파일에서 빠진 기존 행은 유지되며, 제외하려면 검토상태를 ‘사용안함’으로 변경하세요.</p>{preview.errors.length>0&&<ul>{preview.errors.slice(0,20).map((e,i)=><li key={i}>{e.line}행 {e.id}: {e.reason}</li>)}</ul>}<button className="kd-minimum-primary" disabled={busy||preview.errors.length>0||(!diff.added&&!diff.changed)} onClick={save}>검사 결과 반영</button><button disabled={busy} onClick={()=>setPreview(null)}>취소</button></div>}
  <div className="kd-minimum-actions"><label>해결 유형 <select aria-label="최저자료 해결유형" value={dispositionFilter} onChange={e=>setDispositionFilter(e.target.value)}><option value="전체">전체 유형</option>{dispositions.map(i=><option key={i.code} value={i.code}>{i.label} ({i.count})</option>)}</select></label><label>검토 사유 <select aria-label="최저자료 검토사유" value={issueFilter} onChange={e=>setIssueFilter(e.target.value)}><option value="전체">전체 사유</option>{issueCounts.map(i=><option key={i.code} value={i.code}>{i.label} ({i.count})</option>)}</select></label><small>해결 유형은 우선 조치 기준이며, 검토 사유는 중복될 수 있습니다.</small></div>
  <div className="kd-minimum-actions"><label>세부 작업 <select aria-label="최저자료 세부작업" value={workTypeFilter} onChange={e=>setWorkTypeFilter(e.target.value)}><option value="전체">전체 작업</option>{workTypes.map(i=><option key={i.code} value={i.code}>{i.label} ({i.count})</option>)}</select></label><small>현재 표시 자료의 매핑·규칙 작업을 유형별로 분류합니다.</small></div>
  <div className="kd-minimum-actions"><input aria-label="최저자료 검색" placeholder="대학·전형·모집단위·검토사유 검색" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="최저자료 검토상태" value={filter} onChange={e=>setFilter(e.target.value)}>{['전체','계산가능','검토필요','사용안함'].map(s=><option key={s}>{s}</option>)}</select><span>{filtered.length}건 · 최대 100건 표시</span></div>
  <div className="kd-minimum-table"><table><thead><tr><th>학년도·대학</th><th>전형·범위</th><th>최저 조건</th><th>상태·확인 사항</th><th>출처</th></tr></thead><tbody>{filtered.slice(0,100).map(r=>{const disposition=minimumReviewDisposition(r),work=minimumMappingPlan(r)||minimumRulePattern(r);return <tr key={r.id}><td>{r.admissionYear}<br/><b>{r.university}{r.campus?`(${r.campus})`:''}</b></td><td>{r.admissionType} · {r.track}<br/>{r.department}{r.excluded&&<small>제외: {r.excluded}</small>}</td><td>{r.ruleText}{r.note&&<small>{r.note}</small>}</td><td><b className={r.reviewStatus==='계산가능'?'is-ready':'is-review'}>{r.reviewStatus}</b>{r.reviewStatus==='검토필요'&&<small><strong>{disposition.label}</strong>: {disposition.action}</small>}{work&&<small><strong>{work.label}</strong>: {work.action}<br/>필요 정보: {work.required}</small>}<small>{r.reviewReason||'원문에서 구조화한 조건'}</small>{minimumReviewIssues(r).map(i=><small key={i.code}><strong>{i.label}</strong>: {i.action}</small>)}<small>{r.id}</small></td><td>{r.source}<br/>{r.page}쪽</td></tr>})}</tbody></table>{!filtered.length&&<p>검색 결과가 없습니다.</p>}</div>
  <details><summary>전형명·캠퍼스·범위 연결을 수정하는 방법</summary><p>엑셀 ‘홈페이지 연동’ 시트에서 전형별칭에 홈페이지에 표시되는 전형명을 입력하세요. 여러 이름은 |로 구분합니다. 다른 연도·전형유형·캠퍼스를 하나의 별칭으로 묶지 마세요. 범위유형은 전체·계열·학과·혼합 중 선택하고, 일반 규칙의 제외범위와 예외 학과의 적용범위를 같은 표준명으로 맞춥니다. 누락 정보를 공식 원문으로 보완한 뒤 검토사유를 지우고 검토상태를 계산가능으로 변경하면 업로드 때 연결과 판정식을 다시 검사합니다.</p></details>
 </section>;
}
