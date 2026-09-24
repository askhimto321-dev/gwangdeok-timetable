// Narrow source corrections verified against the university's published plan.
// Only the old source/ID/text combination is migrated; edited rules are retained.
const dkuSource='단국대학교 2028학년도 대학입학전형시행계획(2026.04.30)';
const dkuUrl='https://ipsi.dankook.ac.kr/bbs/filedown.php?bbsid=juk_ipca&file_seq=6715';
const admissions119='https://adiga.kr/cmm/com/file/fileDown.do?fileId=00000000000000246095&fileSn=3';
const branchDefaults={ruleType:'합',subjects:'국|수|영|사/과',mandatory:'',englishMax:null,historyMax:null,inquiryMode:'통합개별',rounding:'없음',englishConversion:'없음',reviewStatus:'계산가능',reviewReason:''};
export function expandMinimumSourceRows(rows) {
 const known=new Set(rows.map(row=>row.id)),derived=[];
 const add=(parent,id,fields)=>{if(!known.has(id)){derived.push({...parent,...branchDefaults,...fields,id,sourceId:parent.sourceId,resolutionNote:'동일 원문의 캠퍼스·모집단위별 조건을 독립 행으로 분리'});known.add(id);}};
 for(const row of rows){
  if(row.admissionYear!==2028||row.season!=='수시')continue;
  if(row.id==='MIN-20cc73377f0096c0'&&/서울.*합\s*5.*글로벌.*합\s*6/.test(row.ruleText))add(row,'MIN-20cc73377f0096c0-global',{campus:'글로벌',scopeType:'전체',department:'전체',ruleText:'국, 수, 영, 사/과(1) 중 2개 영역 등급 합 6',count:2,threshold:6,note:''});
  if(row.id==='MIN-1bf9381478b1ebd9'&&/간호학과는\s*2개\s*영역\s*합\s*6/.test(row.ruleText))add(row,'MIN-1bf9381478b1ebd9-nursing',{scopeType:'학과',department:'간호학과',ruleText:'국, 수, 영, 사/과(1) 중 2개 영역 합 6',count:2,threshold:6,note:''});
  if(row.id==='MIN-66eeb27f037d542f'&&/평택캠퍼스는.*미적용/.test(row.note))add(row,'MIN-66eeb27f037d542f-pyeongtaek',{campus:'평택',scopeType:'전체',department:'전체',ruleType:'없음',subjects:'',count:null,threshold:null,inquiryMode:'해당없음',ruleText:'평택캠퍼스 수능최저 미적용',note:''});
  if(row.id==='MIN-d87864e7f93fbf1e'&&/디자인계열.*미적용/.test(row.note))add(row,'MIN-d87864e7f93fbf1e-design',{scopeType:'계열',department:'디자인',ruleType:'없음',subjects:'',count:null,threshold:null,inquiryMode:'해당없음',ruleText:'디자인계열 수능최저 미적용',note:''});
  if(row.id==='MIN-080e2a6e732fd203'&&/세종캠퍼스.*미적용/.test(row.note))add(row,'MIN-080e2a6e732fd203-sejong',{campus:'세종',scopeType:'전체',department:'전체',ruleType:'없음',subjects:'',count:null,threshold:null,inquiryMode:'해당없음',ruleText:'세종캠퍼스 수능최저 미적용',note:''});
 }
 return derived.length?[...rows,...derived]:rows;
}
// 2027 대입정보 119 pp.93–99의 교과전형 표. 대학과 전형유형이 같은 행만
// 보완하며, 원문에 없는 세부 조건·캠퍼스는 이 대응표로 추정하지 않는다.
const named2027Courses={
 '가천대':'학생부우수자','가톨릭대':'지역균형','강남대':'지역균형',
 '강서대':'일반학생','경기대':'교과성적우수자','경인교대':'학교장추천',
 '경희대':'지역균형','고려대':'학교추천','국민대':'교과성적우수자',
 '단국대':'지역균형선발','덕성여대':'고교추천','동덕여대':'학생부교과우수자',
 '삼육대':'학교장추천','서강대':'지역균형','서경대':'교과균형',
 '서울과학기술대':'고교추천','서울교대':'학교장추천',
 '서울시립대':'지역균형선발','서울여대':'교과우수자',
 '성균관대':'추천인재','성신여대':'지역균형','수원대':'교과우수',
 '숙명여대':'지역균형선발','숭실대':'교과우수자','아주대':'고교추천',
 '연세대':'추천형','용인대':'교과성적우수자','을지대':'지역균형',
 '이화여대':'고교추천','인천대':'교과성적우수자','인하대':'지역균형',
 '중앙대':'지역균형','한국공학대':'교과우수자','한국성서대':'일반학생',
 '한국외대':'학교장추천','한국외국어대(글)':'학교장추천',
 '한국항공대':'교과성적우수자','한성대':'교과우수',
};
// 같은 자료 pp.392, 423, 428의 의치약수 논술 전형표에 전형명이 명시된 대학.
// 그 전형이 일반 모집단위에도 쓰이는 경우에만 아래에서 범위를 확장한다.
const named2027Essays={
 '가톨릭대':'논술','건국대':'KU논술우수자','경희대':'논술우수자',
 '고려대':'논술','덕성여대':'논술','동국대':'논술','동덕여대':'논술우수자',
 '삼육대':'논술','서강대':'일반','성신여대':'논술우수자','세종대':'논술',
 '숙명여대':'논술우수자',
 '이화여대':'논술','인하대':'논술우수자','아주대':'논술우수자',
 '한국외대':'논술','한양대':'논술','홍익대':'논술',
};
export function correctMinimumSource(input) {
 const row={...input};
 if(row.admissionYear===2028&&row.university==='중앙대'&&['MIN-7ea70e55264efc90','MIN-6c400c539d4dff82'].includes(row.id)){
  row.reviewStatus='검토필요';row.reviewReason='동일 전형 전체 범위에 적용과 미적용 원문 상충';
 }
 if(row.admissionYear===2028&&row.season==='수시'){
  const simple=fields=>Object.assign(row,{...branchDefaults,...fields});
  if(row.id==='MIN-20cc73377f0096c0'&&/서울.*합\s*5.*글로벌.*합\s*6/.test(row.ruleText))simple({campus:'서울',scopeType:'전체',department:'전체',count:2,threshold:5,ruleText:'국, 수, 영, 사/과(1) 중 2개 영역 등급 합 5',note:'글로벌캠퍼스 2합6은 별도 행',resolutionNote:'서울 2합5·글로벌 2합6 원문 분리'});
  if(row.id==='MIN-1bf9381478b1ebd9'&&/간호학과는\s*2개\s*영역\s*합\s*6/.test(row.ruleText))simple({scopeType:'전체',department:'전체',excluded:[row.excluded,'간호학과'].filter(Boolean).join('|'),count:2,threshold:7,ruleText:'국, 수, 영, 사/과(1) 중 2개 영역 합 7',note:'간호학과 2합6은 별도 행'});
  if(row.id==='MIN-66eeb27f037d542f'&&/평택캠퍼스는.*미적용/.test(row.note))simple({campus:'안성',scopeType:'전체',department:'전체',count:2,threshold:8,ruleText:'국, 수, 영, 사/과(1) 중 2개 영역 등급 합 8',note:'평택캠퍼스 수능최저 미적용은 별도 행'});
  if(row.id==='MIN-d87864e7f93fbf1e'&&/디자인계열.*미적용/.test(row.note))simple({scopeType:'전체',department:'전체',excluded:[row.excluded,'디자인'].filter(Boolean).join('|'),count:2,threshold:7,note:'디자인계열 수능최저 미적용은 별도 행'});
  if(row.id==='MIN-080e2a6e732fd203'&&/세종캠퍼스.*미적용/.test(row.note))simple({campus:'서울',scopeType:'전체',department:'전체',count:2,threshold:5,historyMax:4,note:'세종캠퍼스 수능최저 미적용은 별도 행'});
  if(row.id==='MIN-57a764e7c74aadc1'&&/영어\s*포함하는\s*경우\s*영어\s*1등급/.test(row.ruleText))simple({scopeType:'학과',department:'의예과',subjects:'국|수|영|과',count:3,threshold:4,englishIfSelectedMax:1,resolutionNote:'영어를 선택한 조합에서만 영어 1등급을 요구'});
  if(['MIN-49d945bf5a521125','MIN-ebad5ab924e22166'].includes(row.id)&&row.campus==='서울'&&row.reviewReason==='다른 예외 모집단위의 제외범위 확정 필요'){
   row.reviewReason='';row.reviewStatus='계산가능';row.resolutionNote='서울·글로벌 캠퍼스별 행이 이미 분리되어 있어 서로 예외 모집단위가 아님';
  }
  if(row.id==='MIN-7e83830f524a4b28'&&row.university==='성균관대'&&row.scopeType==='미확정')simple({scopeType:'학과',department:'글로벌리더학부|글로벌경영학과|글로벌경제학과|자유전공계열|전자전기정보공학부|컴퓨터공학과|반도체융합공학과|글로벌바이오메디컬공학과|에너지학과',count:3,threshold:6,resolutionNote:'원문에 열거된 9개 모집단위를 학과·학부 단위로 분리'});
  if(row.id==='MIN-fd45a6aeaf92daaf'&&row.reviewReason==='다른 예외 모집단위의 제외범위 확정 필요'){
   row.excluded='글로벌리더학부|글로벌경영학과|글로벌경제학과|자유전공계열|전자전기정보공학부|컴퓨터공학과|반도체융합공학과|글로벌바이오메디컬공학과|에너지학과';row.reviewReason='';row.reviewStatus='계산가능';row.resolutionNote='동일 추천인재 전형의 3합6 예외 모집단위를 일반 3합7에서 제외';
  }
  const yonsei={ruleType:'합',subjects:'국|수|사/과',count:2,mandatory:'국/수',threshold:4,englishMax:3,historyMax:4,inquiryMode:'통합개별',reviewStatus:'계산가능',reviewReason:'',note:'공통: 영어 3등급·한국사 4등급 이내'};
  if(row.university==='연세대'&&row.track==='종합인재형'&&(row.reviewStatus==='검토필요'||row.id==='MIN-d66eb2f48b60ccf0')){
   if(row.id==='MIN-6a2f7a83101b5e35')simple({...yonsei,scopeType:'계열',department:'인문|사회'});
   if(row.id==='MIN-5cb2d6c15a197b4d')simple({...yonsei,scopeType:'계열',department:'자연',mandatory:'수',threshold:5});
   if(row.id==='MIN-b3846055539a23ab')simple({...yonsei,scopeType:'학과',department:'의예과|치의예과|약학과',ruleType:'각',mandatory:'수',threshold:1});
   if(row.id==='MIN-d66eb2f48b60ccf0')simple({...yonsei,scopeType:'혼합',department:'상경|응용통계학과|생활과학대학|간호대학|간호학과',alternativeRules:[{label:'인문',mandatory:'국/수',threshold:4},{label:'자연',mandatory:'수',threshold:5}]});
   if(row.id==='MIN-648c8e3880426b50')simple({...yonsei,scopeType:'학과',department:'아시아학전공|융합인문사회과학부|융합과학공학부',threshold:5,englishMax:2,note:'국제: 영어 2등급·한국사 4등급 이내',ruleText:'국, 수, 사/과 중 국·수 하나 포함 2개 영역 등급 합 5'});
   if(row.id==='MIN-e31ec6c960ec28c5')simple({ruleType:'없음',subjects:'',count:null,threshold:null,scopeType:'학과',department:'언더우드학부(인문·사회)|언더우드학부(생명과학공학)',inquiryMode:'해당없음',note:'언더우드학부 최저 미적용. 공통·국제 안내는 다른 모집단위 조건'});
   row.resolutionNote='2028 종합인재형 원문에서 일반·국제·언더우드 분기와 별도 영어·한국사 상한을 구분';
  }
 }
 // 2028 인천광역시교육청 전형별 표: 가천대 학생부우수자·논술·가천의약학
 // 의예과는 각각 3개 영역 각 1등급이다. 요약 표의 3합4는 이 전형에 연결하지 않는다.
 if(row.admissionYear===2028&&row.university==='가천대'&&row.department==='의예과'){
  if(row.id==='MIN-b16e38deb53f6d96'){
   row.reviewStatus='사용안함';row.reviewReason='';
   row.resolutionNote='전형별 학생부우수자 표와 상충하는 3합4 요약 행을 연결에서 제외';
  } else if(['MIN-5105ee62984f1264','MIN-b9fd1aa20b993b11','MIN-0007c800ffe5589a'].includes(row.id)&&/3개\s*영역\s*각\s*1등급/.test(row.ruleText)){
   row.reviewStatus='계산가능';row.reviewReason='';row.ruleType='각';row.subjects='국|수|영|과';
   row.count=3;row.threshold=1;row.inquiryMode='통합개별';
   row.resolutionNote='2028 대입전형 프리뷰 학생부교과·논술·종합 전형별 의예과 각 1등급 대조';
  }
 }
 // 영역을 적지 않은 2합8은 사용자가 지정한 기본 후보군으로만 환산한다.
 if(row.id==='MIN-827f7d8c7e1651e5'&&row.admissionYear===2028&&/^2합\s*8이내$/.test(row.ruleText)){
  Object.assign(row,{ruleType:'합',subjects:'국|수|영|사/과',count:2,threshold:8,
   mandatory:'',inquiryMode:'통합개별',scopeType:'학과',
   department:'방사선학과|임상병리학과|물리치료학과|간호학부|간호학과',
   reviewStatus:'계산가능',reviewReason:'',
   resolutionNote:'반영영역 미기재 시 국·수·영·사/과(택1) 중 2합으로 처리하는 운영 기준'});
 }
 if(row.id==='MIN-3b07bc3d9c83f81a'&&row.admissionYear===2028&&row.university==='가천대'&&/2개\s*영역\s*합\s*6/.test(row.ruleText)){
  Object.assign(row,{ruleType:'합',subjects:'국|수|영|사/과',count:2,threshold:6,
   mandatory:'',inquiryMode:'통합개별',subjectBoosts:{국:1,수:1},
   reviewStatus:'계산가능',reviewReason:'',
   resolutionNote:'논술 인문·자연 2합6: 선택한 국어·수학 영역은 각각 한 등급 올려 계산(최저 1등급)'});
 }
 if(row.id==='MIN-0db9fcfb28f9d6f7'&&row.admissionYear===2028&&row.university==='연세대'&&/인문 또는 자연계열/.test(row.ruleText)){
  Object.assign(row,{ruleType:'합',subjects:'국|수|사/과',count:2,threshold:4,
   mandatory:'국/수',englishMax:3,historyMax:4,inquiryMode:'통합개별',
   scopeType:'혼합',department:'상경|응용통계학과|생활과학대학|간호대학|간호학과',
   alternativeRules:[{label:'인문',mandatory:'국/수',threshold:4},{label:'자연',mandatory:'수',threshold:5}],
   reviewStatus:'계산가능',reviewReason:'',
   resolutionNote:'동일 추천형의 인문 2합4(국/수 포함) 또는 자연 2합5(수 필수) 중 하나 충족'});
 }
 // 중앙대 영어 누적비율은 학생별로 알 수 없는 시험 전체 통계다. 원문은
 // 비고에 남기고 기본 합산을 계산한다. 같은 원문의 탐구 환산도 비고에 남는다.
 if(row.admissionYear===2028&&row.university==='중앙대'&&row.season==='수시'&&
    row.reviewStatus==='검토필요'&&row.reviewReason==='복합 문장·추가조건 또는 생략된 반영영역을 원문과 대조해야 함'&&
    /[34]개\s*영역\s*(?:등급)?\s*합\s*[567]/.test(row.ruleText)&&
    /영어2등급.*(?:누적|20%)|영어2등급이20%/.test(`${row.ruleText}${row.note}`.replace(/\s/g,''))){
  const grade=row.ruleText.match(/[34]개\s*영역\s*(?:등급)?\s*합\s*([567])|[34]개\s*영역\s*등급합\s*([567])/);
  const count=Number(row.ruleText.match(/([34])개\s*영역/)?.[1]);
  const [primary,...special]=row.ruleText.split(/\s*※\s*/);
  Object.assign(row,{ruleType:'합',subjects:'국|수|영|사/과',count,threshold:Number(grade[1]||grade[2]),
   mandatory:'',englishMax:null,historyMax:4,inquiryMode:'통합개별',englishConversion:'없음',reviewStatus:'계산가능',reviewReason:'',
   ruleText:primary,note:[row.note,...special].filter(Boolean).join(' · '),
   resolutionNote:'기본 등급 합산만 자동 판정. 영어 누적비율·탐구 환산 특이사항은 원문 비고에서 확인'});
 }
 if(row.id==='MIN-00f724f342783a3b'&&row.admissionYear===2028&&row.university==='가톨릭대'&&row.admissionType==='논술'&&row.ruleText==='미적용'&&/인문\/자연\s*⇨/.test(row.note)){
  // Every named branch has a separate exact-scope rule in the catalog.
  row.reviewStatus='사용안함';row.reviewReason='';
 }
 if(row.admissionYear===2028&&row.ruleText==='미적용'&&[
  'MIN-434aa0781ddf04e4','MIN-1fda8d66ecbf209f'
 ].includes(row.id)){
  // These source rows explicitly cover both campuses with the same no-minimum rule.
  row.university=row.id==='MIN-434aa0781ddf04e4'?'상명대':'한국외대';
  row.reviewReason='';row.reviewStatus='계산가능';
  row.resolutionNote='원문에서 서울·천안 또는 서울·글로벌 양 캠퍼스 공통 미적용으로 기재';
 }
 if(row.admissionYear===2027&&String(row.source).includes('경기도교육청')&&['한국외국어대(글)','한국외대(글로벌캠)'].includes(row.university)){
  row.university='한국외대';row.campus='글로벌';
  row.reviewReason=String(row.reviewReason||'').split(' · ').filter(r=>r!=='대학·캠퍼스 구분 확인 필요').join(' · ');
  row.resolutionSource=admissions119;
  row.resolutionNote='2027 대입정보 119 pp.95, 196: 서울·글로벌 캠퍼스 별도 기준';
 }
 if(row.admissionYear===2027&&String(row.source).includes('경기도교육청')&&row.university==='한국외대'&&!row.campus&&/2개\s*합\s*4/.test(row.ruleText))row.campus='서울';
 if(row.admissionYear===2027&&row.admissionType==='교과'&&row.track==='원문 미기재'&&String(row.source).includes('경기도교육청')){
  const name=row.university==='세종대'?(/항공시스템/.test(row.department)?'항공시스템공학':'지역균형')
   :row.university==='차의과대'?'지역균형선발'
   :row.university==='한양대'?(row.campus==='에리카'?'지역균형선발':'추천형')
   :row.university==='홍익대'&&/2개\s*합\s*5/.test(row.ruleText)?'학교장추천자'
   :named2027Courses[row.university];
  if(name){
   row.track=name;
   row.reviewReason=String(row.reviewReason||'').split(' · ').filter(reason=>reason!=='세부전형명 원문 미기재').join(' · ');
   if(!row.reviewReason)row.reviewStatus='계산가능';
   row.resolutionSource=admissions119;
   row.resolutionNote='대입정보포털 2027 대입정보 119 학생부교과전형 pp.93–99의 대학·전형명 대조';
  }
 }
 if(row.admissionYear===2027&&row.admissionType==='논술'&&row.track==='원문 미기재'&&String(row.source).includes('경기도교육청')&&named2027Essays[row.university]){
  row.track=named2027Essays[row.university];
  row.reviewReason=String(row.reviewReason||'').split(' · ').filter(reason=>reason!=='세부전형명 원문 미기재').join(' · ');
  if(!row.reviewReason)row.reviewStatus='계산가능';
  row.resolutionSource=admissions119;
  row.resolutionNote='대입정보포털 2027 대입정보 119 논술전형 pp.392, 423, 428의 전형명 대조';
 }
 // 대학어디가 2027 전형명 변경표: 2026 미래역량우수자는 2027 미래창의인재.
 // 2028 원문 행의 판정조건은 그대로 두고 저장된 옛 전형명만 조회 별칭으로 연결한다.
 if(row.id==='MIN-d8d53bec3fe4c15a'&&row.admissionYear===2028&&row.university==='협성대'&&row.admissionType==='교과'&&row.track==='미래창의인재'&&row.ruleText==='미적용'){
  row.trackAliases=[row.trackAliases,'미래역량우수자'].filter(Boolean).join('|');
  row.resolutionSource='https://www.adiga.kr/ucp/uvt/uni/univDetailSelection.do?menuId=PCUVTINF2000&searchSyr=2027&unvCd=0000207';
  row.resolutionNote='대학어디가 2027 전형명 변경표: 2026 미래역량우수자 → 2027 미래창의인재';
 }
 // The 2027 official admissions guide lists the track itself as '논술'.
 // Do not infer named 교과/종합 tracks from their type alone.
 if(row.reviewStatus!=='사용안함'&&row.admissionYear===2027&&row.university==='가천대'&&row.admissionType==='논술'&&row.track==='원문 미기재'&&String(row.source).includes('경기도교육청')){
  row.track='논술';
  row.reviewReason=String(row.reviewReason||'').split(' · ').filter(r=>r!=='세부전형명 원문 미기재').join(' · ');
  row.resolutionSource='https://admission.gachon.ac.kr/upload/BBS0021/20260522154511HBZYTW.PDF';
  row.resolutionNote='2027 수시모집요강 모집전형 표의 논술 명칭 확인. 등급 조건은 기존 원문 유지';
 }

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

// The 2027 summary often omits a separate Korean-history ceiling from its
// abbreviated rule cell. Add only conditions printed for the same type/track
// and scope in the official 2027 대입정보 119 tables. History never joins the sum.
export function correct2027Conditions(input) {
 if(input.admissionYear!==2027||!String(input.source).includes('경기도교육청')||input.reviewStatus==='사용안함')return input;
 const row={...input}, uni=row.university.replace(/\([^)]*\)/g,''), type=row.admissionType;
 const course=type==='교과', essay=type==='논술';
 const historyCourse={가톨릭대:4,경기대:6,경희대:5,고려대:4,서강대:4,서울교대:4,서울시립대:4,중앙대:4,홍익대:4};
 const historyEssay={가톨릭대:4,건국대:5,경희대:5,고려대:4,동국대:4,서강대:4,홍익대:4};
 if(course&&historyCourse[uni]){
  // 가톨릭 지역균형의 한국사 4 조건은 의예에만 명시되어 있다.
  if(uni!=='가톨릭대'||/의예/.test(row.department))row.historyMax=historyCourse[uni];
 }
 if(essay&&historyEssay[uni]){
  if(uni!=='가톨릭대'||/의예/.test(row.department))row.historyMax=historyEssay[uni];
 }
 if(course&&uni==='중앙대')row.englishConversion='2등급까지1';
 if(course&&uni==='숙명여대'&&/약학/.test(row.department))row.mandatory='수';
 if(essay&&uni==='숙명여대'&&/약학/.test(row.department))row.mandatory='수';
 if(course&&uni==='덕성여대'&&/약학/.test(row.department)){
  row.subjects='국|수|영|사';row.mandatory='수';
 }
 if(essay&&uni==='덕성여대'&&/약학/.test(row.department))row.mandatory='수';
 if(course&&uni==='이화여대'&&row.department==='인문')row.mandatory='국';
 if(essay&&uni==='이화여대'&&row.department==='인문')row.mandatory='국';
 if(course&&uni==='가톨릭대'&&/의예/.test(row.department))row.subjects='국|수|영|과';
 if(essay&&uni==='가톨릭대'&&/의예/.test(row.department))row.subjects='국|수|영|과';
 if(essay&&uni==='건국대'&&/수의예/.test(row.department))row.subjects='국|수|영|과';
 if(essay&&uni==='인하대'&&/의예/.test(row.department))row.subjects='국|수|영|과';
 const exactScope={
  'MIN-32dfbfd2bc101b6e':['계열','인문|자연|자율',''],
  'MIN-49c8ab27037a73f8':['학과','초등교육과',''],
  'MIN-38299dff1da558a1':['학과','초등교육과',''],
  'MIN-7b75289a96762275':['계열','디자인',''],
  'MIN-a4b92ccd9e5b7694':['혼합','인문|자연','약학과'],
  'MIN-392364512b87aa01':['학과','의예과|의학부',''],
  'MIN-68e82614d73ed9b1':['학과','체육과학과|체육과학부',''],
  'MIN-b0f20b4e38d7d8c6':['계열','디자인',''],
  'MIN-7106871e53ebe052':['학과','동북아국제통상학부|동북아국제통상학과',''],
  'MIN-a63e7cad5483167d':['학과','의예과|의학부',''],
 };
 if(exactScope[row.id]&&row.reviewReason==='모집단위·계열 적용범위 확정 필요'){
  [row.scopeType,row.department,row.excluded]=exactScope[row.id];
  row.reviewReason='';row.reviewStatus='계산가능';
  row.resolutionNote='2027 요약표에 명시된 계열·학과 범위를 연동용 모집단위로 분리';
 }
 if(course&&uni==='홍익대'&&/3개\s*합\s*8/.test(row.ruleText)){
  // The 2027 table explicitly replaces the preceding 2026 3합8 with 2합5.
  return {...row,reviewStatus:'사용안함',reviewReason:'',resolutionSource:admissions119,resolutionNote:'2027 학생부교과 표 p.95: 학교장추천자 2개 합 5, 한국사 4'};
 }
 if(course&&uni==='서강대'&&/3개\s*각\s*3/.test(row.ruleText)){
  row.ruleType='각';row.subjects='국|수|영|사/과';row.count=3;row.threshold=3;
  row.inquiryMode='통합개별';row.referenceMapped=true;
  row.reviewReason=String(row.reviewReason||'').split(' · ').filter(r=>r==='세부전형명 원문 미기재').join(' · ');
  if(!row.reviewReason)row.reviewStatus='계산가능';
 }
 if(course&&['경인교대','서울교대'].includes(uni)&&row.department==='원문모집단위미기재'){
  row.scopeType='학과';row.department='초등교육과';
  row.reviewReason=String(row.reviewReason||'').split(' · ').filter(r=>r!=='모집단위·계열 적용범위 확정 필요').join(' · ');
  if(!row.reviewReason)row.reviewStatus='계산가능';
 }
 if(row.reviewStatus==='계산가능'){
  row.resolutionSource=admissions119;
  const note='2027 대입정보 119 교과 pp.93–99/논술 pp.195–196, 2027 한국사·필수영역 대조';
  if(!String(row.resolutionNote||'').includes(note))row.resolutionNote=[row.resolutionNote,note].filter(Boolean).join(' · ');
 }
 return row;
}
