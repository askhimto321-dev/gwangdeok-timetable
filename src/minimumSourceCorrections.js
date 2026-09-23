// Narrow source corrections verified against the university's published plan.
// Only the old source/ID/text combination is migrated; edited rules are retained.
const dkuSource='단국대학교 2028학년도 대학입학전형시행계획(2026.04.30)';
const dkuUrl='https://ipsi.dankook.ac.kr/bbs/filedown.php?bbsid=juk_ipca&file_seq=6715';
export function correctMinimumSource(input) {
 const row={...input};
 if(row.reviewStatus==='사용안함'||row.admissionYear!==2028||!String(row.source).includes('인천광역시교육청'))return row;
 const mark=(page,reason)=>Object.assign(row,{source:dkuSource,page,resolutionSource:dkuUrl,resolutionNote:reason});
 if(row.id==='MIN-69b8724bddd5d777'&&row.university==='단국대'&&row.campus==='죽전'&&row.track==='지역균형선발'&&row.ruleText==='국, 수, 영, 사/과(1) 중 2개 영역 등급 합 6'){
  row.reviewReason=String(row.reviewReason||'').split(' · ').filter(r=>!['모집단위·계열 적용범위 확정 필요','다른 예외 모집단위의 제외범위 확정 필요'].includes(r)).join(' · ');
  row.scopeType='전체';row.department='전체';
  if(!row.reviewReason)row.reviewStatus='계산가능';
  mark('18','공식 전형계획의 죽전 2합6·천안 2합8을 캠퍼스별로 확인');
 }
 if(['MIN-7fae61bb38b1d078','MIN-0896760f01f2d4cc'].includes(row.id)&&row.university==='단국대(죽전/천안)'&&row.ruleText==='미적용'&&row.department==='전체'){
  row.university='단국대';row.campus='';
  row.trackAliases=row.id==='MIN-7fae61bb38b1d078'?'DKU인재(면접형)|SW인재':row.trackAliases;
  row.excluded=row.id==='MIN-7fae61bb38b1d078'?'의예과|치의예과|약학과':row.excluded;
  row.reviewReason=String(row.reviewReason||'').split(' · ').filter(r=>!['대학·캠퍼스 구분 확인 필요','다른 예외 모집단위의 제외범위 확정 필요'].includes(r)).join(' · ');
  if(!row.reviewReason)row.reviewStatus='계산가능';
  mark(row.id==='MIN-7fae61bb38b1d078'?'10,13':'9','양 캠퍼스 공통 적용. 면접형 의학·약학계열 예외는 개별 규칙으로 연결');
 }
 if(row.id==='MIN-5e42261cc653a46c'&&row.university==='단국대'&&row.department==='치의예과'&&row.ruleText==='국, 수, 영, 과 중 3개 영역 합 4'){
  row.mandatory='수';row.ruleText='국, 수, 영, 과 중 수학 포함 3개 영역 합 4';mark('10','의학계열 수학 필수 포함 누락 보완');
 }
 return row;
}
