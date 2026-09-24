// Narrow source corrections verified against the university's published plan.
// Only the old source/ID/text combination is migrated; edited rules are retained.
const dkuSource='단국대학교 2028학년도 대학입학전형시행계획(2026.04.30)';
const dkuUrl='https://ipsi.dankook.ac.kr/bbs/filedown.php?bbsid=juk_ipca&file_seq=6715';
const admissions119='https://adiga.kr/cmm/com/file/fileDown.do?fileId=00000000000000246095&fileSn=3';
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
