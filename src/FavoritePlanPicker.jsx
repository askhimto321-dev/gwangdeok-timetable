import React,{useEffect,useState} from 'react';
import { addSusiSupportPlanExternal, supportOptionsForFavorite } from './SusiNaviBeta.jsx';
import './supportDecision.css';

export default function FavoritePlanPicker({sid,item,data,onOpenNavi,onOpenPlan}) {
  const [open,setOpen]=useState(false),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const options=supportOptionsForFavorite(data,item);
  useEffect(()=>{setSelected('');setMessage('');setOpen(false);},[sid,item.university,item.region,item.department]);
  const save=async()=>{
    if(!sid || busy || selected==='')return;
    const option=options[Number(selected)];if(!option)return;
    setBusy(true);setMessage('');
    try{const result=await addSusiSupportPlanExternal(sid,option);setMessage(result.ok?(result.duplicate?'이미 지원 구성에 있습니다.':'지원 구성에 추가했습니다.'):result.error||'저장 실패');}
    catch{setMessage('저장하지 못했습니다. 다시 시도해주세요.');}
    finally{setBusy(false);}
  };
  return <div className="kd-favorite-plan-picker no-print"><button type="button" onClick={()=>setOpen(x=>!x)} aria-expanded={open}>지원 전형 선택</button>{open && <>
    {options.length ? <><select aria-label={`${item.university} ${item.department} 지원 전형 선택`} value={selected} onChange={e=>{setSelected(e.target.value);setMessage('');}}><option value="">전형을 선택하세요</option>{options.map((x,i)=><option key={`${x.admissionType}-${x.track}-${i}`} value={i}>{x.admissionType} · {x.track}</option>)}</select><button type="button" disabled={busy || !sid || selected===''} onClick={save}>{busy?'저장 중…':'수시 지원 구성에 추가'}</button></> : <><small>학과·캠퍼스가 정확히 연결된 전형이 없습니다. 대학 상세에서 학과와 전형을 확인해주세요.</small>{onOpenNavi && <button type="button" onClick={()=>onOpenNavi(item.university,item.department||'')}>NAVI에서 전형 찾기</button>}</>}
    {message && <small role="status">{message}</small>}{onOpenPlan && <button type="button" onClick={onOpenPlan}>지원 구성 보기</button>}
  </>}</div>;
}
