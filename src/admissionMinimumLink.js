import {resolveCatalogMinimum, catalogTrackKey} from './minimumCatalog.js';
import {comparisonType} from './admissionComparison.js';
import {evaluateStoredMinimum} from './naviMinimum.js';
import {universityIdentityKey, universityBaseKey} from './universityIdentity.js';

// Old admission tables often store only a track name, with the criteria in the
// separately uploaded catalog. Infer a type only from that same named track.
export function resolveAdmissionMinimum(row, student) {
  const candidates=(student?.minimumCatalogRows||[]).filter(r=>
    r.reviewStatus!=='사용안함' && universityBaseKey(r.university)===universityBaseKey(row.university)
    && [r.track,...String(r.trackAliases||'').split('|')].some(t=>catalogTrackKey(row.university,t)===catalogTrackKey(row.university,row.track)));
  const declared=comparisonType(row.admissionType||row.track);
  const types=['교과','종합','논술','실기'].includes(declared)?[declared]:[...new Set(candidates.map(r=>r.admissionType))];
  const links=types.map(admissionType=>resolveCatalogMinimum({target:{...row,field:row.field||row.series||'',admissionType},student,identity:universityIdentityKey})).filter(x=>x&&x.evaluation.status!=='unlinked');
  if(links.length===1)return links[0];
  if(links.length>1)return {minimum:null,evaluation:{status:'manual',reason:'동명 전형이 여러 전형유형에 있습니다. 전형유형을 지정하세요.'}};
  const evaluation=evaluateStoredMinimum(row,student);
  if(evaluation.status==='manual'&&!String(row.requiredSum||'').trim())return {minimum:null,evaluation:{...evaluation,status:'unlinked',reason:'등록 자료에서 이 전형·모집범위의 사용 가능한 기준을 찾지 못했습니다. 사용안함 행과 세부 모집단위를 확인하세요.'}};
  return {minimum:row,evaluation};
}
