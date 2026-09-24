import {resolveAdmissionMinimum} from './admissionMinimumLink.js';

// Run only when the administrator opens the audit. The live admission table
// is authoritative here; a university-wide resemblance is not a rule link.
export function homepageMinimumCoverage(admissionRows=[],catalogRows=[]) {
 const seen=new Set(),targets=[];
 for(const row of admissionRows){
  if(!row?.university)continue;
  const year=Number(row.admissionYear)||({1:2029,2:2028,3:2027})[Number(row.targetGrade)]||2028;
  const key=[year,row.university,row.region,row.admissionType,row.track,row.department].join('\u0001');
  if(seen.has(key))continue;seen.add(key);
  const student={admissionYear:year,latestMockGrades:{},minimumCatalogRows:catalogRows};
  const link=resolveAdmissionMinimum(row,student);
  const linked=Boolean(link.minimum?.id?.startsWith('MIN-'));
  const status=linked?(link.evaluation.status==='manual'?'검토필요':'연결됨'):
   (String(row.requiredSum||'').trim()&&link.evaluation.status!=='unlinked'?'홈페이지 기준':'미연결');
  targets.push({year,university:row.university,region:row.region||'',admissionType:row.admissionType||'',track:row.track||'',department:row.department||'',status,
   reason:status==='미연결'?link.evaluation.reason:status==='검토필요'?(link.evaluation.reason||link.minimum?.reviewReason):'',ruleId:linked?link.minimum.id:''});
 }
 return {targets,stats:{total:targets.length,linked:targets.filter(x=>x.status==='연결됨').length,stored:targets.filter(x=>x.status==='홈페이지 기준').length,review:targets.filter(x=>x.status==='검토필요').length,unlinked:targets.filter(x=>x.status==='미연결').length}};
}
