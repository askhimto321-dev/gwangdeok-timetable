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
  if(row.id==='MIN-abaa759dc3829187'&&row.university==='덕성여대')add(row,'MIN-abaa759dc3829187-global',{scopeType:'학과',department:'글로벌융합대학',subjects:'국|수|영/외|사/과',count:2,threshold:7,
   ruleText:'국, 수, 영(제2외국어/한문 대체 가능), 사/과(1) 중 2개 영역 등급 합 7 이내',note:'제2외국어/한문 성적이 없고 다른 영역으로 충족할 수 없으면 판정 보류'});
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
 '국민대':'논술','숭실대':'논술우수자',
};
const official2027EssaySources={
 '국민대':'https://admission.kookmin.ac.kr/nonschedule/faq.php?page=2',
 '숭실대':'https://iphak.ssu.ac.kr/upload/2027_plan4.pdf',
};
export function correctMinimumSource(input) {
 const row={...input};
 if(row.admissionYear===2028&&row.university==='상지대'&&['MIN-493fcd33df792d78','MIN-bea66e0a2367618e'].includes(row.id))Object.assign(row,{...branchDefaults,scopeType:'학과',department:'한의예과',subjects:'국|수|영',count:3,threshold:5,
  ruleText:'국어·수학·영어 3개 영역 등급 합 5 이내',note:'요약 원문의 탐구 평균 주석은 반영영역에 탐구가 없는 이 행의 합산에 적용하지 않음',resolutionNote:'원문에 열거된 세 영역만 합산; 탐구 평균 주석을 합산 영역으로 오인하지 않음'});
 if(row.admissionYear===2028&&row.university==='서울대'){
  if(['MIN-1187a9ffdaf4504e','MIN-fe1eb58a26531eac'].includes(row.id))Object.assign(row,{reviewStatus:'사용안함',reviewReason:'',resolutionNote:'별도 수능최저 등급 규칙이 아닌 제2외국어/한문 응시 안내를 같은 전형의 최저 미적용 행에 병합'});
  if(['MIN-e907c7749427ab39','MIN-e7eac8b43b1a3fbf'].includes(row.id))row.note=[row.note,'인문대학·사회과학대학·경영대학·농경제사회학부·사범대학 인문사회/체육계열·소비자아동학부: 제2외국어/한문 응시 필수. 응시 여부는 별도 확인'].filter(Boolean).join(' · ');
 }
 if(row.admissionYear===2028&&row.university==='한성대'&&['MIN-ab00ab6107f1f029','MIN-12c6833cf1a965c6'].includes(row.id)){
  const night=row.id==='MIN-12c6833cf1a965c6';Object.assign(row,{...branchDefaults,scopeType:'전체',department:'전체',nightOnly:night,dayOnly:!night,subjects:'국|수|영|사/과/외',count:2,threshold:night?8:7,
   ruleText:`국·수·영·사/과(1, 제2외국어/한문 대체 가능) 중 2개 영역 등급 합 ${night?8:7} 이내`,
   note:'제2외국어/한문 성적을 입력하지 않았을 때 대체로 결과가 달라질 수 있으면 판정 보류',
   resolutionSource:'https://use.go.kr/component/file/ND_fileDownload.do?q_fileId=a0b5f551-1a75-474b-8a95-ec8bf0da87b4&q_fileSn=876420',resolutionNote:'2028 한성대 시행계획의 주간·야간 2합7/2합8과 제2외국어/한문 탐구 대체 조건'});
 }
 if(row.admissionYear===2028&&row.university==='성균관대'&&row.admissionType==='논술'){
  if(row.id==='MIN-032d76c62980aa95')Object.assign(row,{reviewStatus:'계산가능',reviewReason:'',scopeType:'학과',
   department:'자유전공계열|글로벌리더학부|글로벌경제학과|글로벌경영학과|전자전기정보공학부|반도체시스템공학과|컴퓨터공학과|글로벌바이오메디컬공학과|지능형소프트웨어학과|약학과|반도체융합공학과|에너지학과',
   conditionalMandatory:'언어형:전자전기정보공학부|컴퓨터공학과',resolutionSource:'https://admission.skku.edu/',resolutionNote:'2028 논술 3합5 모집단위를 공식 전형계획의 개별 학과로 분리'});
  if(row.id==='MIN-18f9cd3ff0739978')row.conditionalMandatory='언어형:자연과학|공학|건설환경공학부|글로벌AI융합학부';
  if(row.id==='MIN-82d869fc7e5c2dc8')Object.assign(row,{reviewStatus:'사용안함',reviewReason:'',resolutionNote:'언어형 자연·공학 모집단위의 수학 필수 조건을 3합5/3합6 본 규칙의 조건부 필수영역으로 병합'});
 }
 // The university's 2028 plan explicitly applies a minimum to every 논술 unit.
 // The preview also contains the previous no-minimum entry and two pharmacy
 // descriptions; retain one scoped rule per actual admission branch.
 if(row.admissionYear===2028&&row.university==='연세대'&&row.admissionType==='논술'&&row.track==='논술'){
  const official='https://www2.yonsei.ac.kr/entrance/plan/2028_plan.pdf';
  const common={...branchDefaults,subjects:'국|수|사/과',mandatory:'국|수',count:3,englishMax:3,historyMax:4,scopeType:'전체',department:'전체',excluded:'약학과',
   source:'연세대학교 2028학년도 입학전형 시행계획',page:'2, 16',resolutionSource:official,
   note:'영어 3등급·한국사 4등급 이내. 국어·수학 모두 포함',resolutionNote:'공식 시행계획: 논술 전 모집단위 최저 적용, 국어·수학 필수'};
  if(row.id==='MIN-f9c884bbdb1a80e1')Object.assign(row,common,{threshold:6,ruleText:'국어·수학을 모두 포함한 국·수·사/과 중 3개 과목 등급 합 6 이내'});
  if(row.id==='MIN-d175e2d250015750')Object.assign(row,common,{scopeType:'학과',department:'약학과',excluded:'',threshold:5,
   ruleText:'약학과: 국어·수학을 모두 포함한 3개 과목 등급 합 5 이내'});
  if(['MIN-10035f91054872de','MIN-aa3446ab6d8c6d90'].includes(row.id))Object.assign(row,{reviewStatus:'사용안함',reviewReason:'',resolutionSource:official,
   resolutionNote:'공식 2028 논술 최저 적용표와 중복 또는 상충하는 요약 행. 정확한 범위의 단일 규칙에 통합'});
 }
 if(row.admissionYear===2028&&row.id==='MIN-adf213fcb109114a'&&row.university==='연세대'&&row.admissionType==='논술')Object.assign(row,{reviewStatus:'사용안함',reviewReason:'',
  resolutionSource:'https://www2.yonsei.ac.kr/entrance/plan/2028_plan.pdf',resolutionNote:'공식 전형명은 논술전형이고 전 모집단위에 최저를 적용함. 구 전형명 미적용 요약행 제외'});
 if(row.admissionYear===2028&&row.university==='인하대'&&row.admissionType==='종합'&&['MIN-34d1678e32344234','MIN-efc3efaff9631439','MIN-149bfcfcee5e4f42'].includes(row.id)){
  const official='https://use.go.kr/component/file/ND_fileDownload.do?q_fileId=5b884140-e638-4389-bb96-f6aa543c8171&q_fileSn=876433';
  if(row.id==='MIN-34d1678e32344234')Object.assign(row,{reviewStatus:'계산가능',reviewReason:'',ruleType:'없음',subjects:'',count:null,threshold:null,
   scopeType:'전체',department:'전체',excluded:'의예과',inquiryMode:'해당없음',resolutionSource:official,
   resolutionNote:'2028 시행계획 면접형 일반 모집단위는 최저 미적용, 의예과는 별도 3합4'});
  if(row.id==='MIN-efc3efaff9631439')Object.assign(row,{reviewStatus:'사용안함',reviewReason:'',resolutionSource:official,
   resolutionNote:'요약표 의예과 3합6은 동일 전형의 2028 의예과 3합4 공식 조건과 상충하므로 제외'});
  if(row.id==='MIN-149bfcfcee5e4f42')Object.assign(row,{...branchDefaults,track:'인하미래인재(면접형)',scopeType:'학과',department:'의예과',subjects:'국|수|영|탐',count:3,threshold:4,
   inquiryMode:'통합평균',rounding:'절사',ruleText:'국, 수, 영, 통합사회·통합과학 평균(소수점 첫째자리 절사) 중 3개 영역 등급 합 4 이내',
   resolutionSource:official,resolutionNote:'2028 시행계획 면접형 의예과 3합4 및 탐구 2과목 평균 절사 기준'});
 }
 if(row.admissionYear===2028&&row.university==='중앙대'&&row.admissionType==='논술'&&row.track==='모두의 논술'){
  const official='https://admission.cau.ac.kr/detail.do?board_seq=3310&categoryid=65&menuurl=n5%2FP1yX8Zyh%2Fvtvla1KeyA%3D%3D&pageNo=1';
  if(row.id==='MIN-7ea70e55264efc90'&&/서울전모집단위/.test(row.department)){
   Object.assign(row,{...branchDefaults,campus:'서울',scopeType:'전체',department:'전체',count:3,threshold:6,historyMax:4,englishMax:null,
    resolutionSource:official,resolutionNote:'공식 2028 전형계획: 모두의 논술 서울 최저 적용. 기존 원문 3합6·한국사 4를 서울로 한정; 영어 누적비율은 비고에 유지'});
  }
  if(row.id==='MIN-6c400c539d4dff82'&&/다빈치캠/.test(row.department)){
   Object.assign(row,{reviewStatus:'계산가능',reviewReason:'',campus:'다빈치',scopeType:'전체',department:'전체',ruleType:'없음',subjects:'',count:null,threshold:null,englishMax:null,historyMax:null,inquiryMode:'해당없음',
    resolutionSource:official,resolutionNote:'공식 2028 전형계획: 모두의 논술 다빈치캠퍼스 수능최저 미적용'});
  }
 }
 if(row.admissionYear===2028&&row.university==='중앙대'&&row.admissionType==='종합'&&row.track==='최저있는학종(Up)'){
  const official='https://admission.cau.ac.kr/detail.do?board_seq=3310&categoryid=65&menuurl=n5%2FP1yX8Zyh%2Fvtvla1KeyA%3D%3D&pageNo=1';
  if(row.id==='MIN-ca1a877f5dc85ead'&&row.ruleText==='미적용'){
   row.reviewStatus='사용안함';row.reviewReason='';
   row.resolutionSource=official;row.resolutionNote='공식 2028 전형계획은 Up 전형의 최저 적용을 명시. 같은 원문의 미적용 중복 행 제외';
  }
  if(row.id==='MIN-6d2e516ff48c035b'&&/3개\s*영역\s*등급\s*합\s*6/.test(row.ruleText)){
   Object.assign(row,{...branchDefaults,scopeType:'전체',department:'전체',excluded:'약학부|약학과|의학부|의예과',count:3,threshold:6,historyMax:4,
    resolutionSource:official,resolutionNote:'공식 2028 전형계획 Up 최저 적용 및 2028 전형별 표 일반 3합6·한국사4 확인; 영어 누적비율은 비고에 유지'});
  }
  if(row.id==='MIN-4ca3465fdfceffdc'&&/4개\s*영역\s*등급\s*합\s*5/.test(row.ruleText)){
   Object.assign(row,{...branchDefaults,scopeType:'학과',department:'약학부|약학과',count:4,threshold:5,historyMax:4,
    resolutionSource:official,resolutionNote:'공식 2028 전형계획 Up 최저 적용 및 2028 전형별 표 약학부 4합5·한국사4 확인; 영어 누적비율은 비고에 유지'});
  }
 }
 if(row.admissionYear===2028&&row.season==='수시'){
  const simple=fields=>Object.assign(row,{...branchDefaults,...fields});
  if(row.id==='MIN-c118b86e28db77c0'&&row.university==='덕성여대')simple({scopeType:'학과',department:'글로벌융합대학',subjects:'국|수|영/외|사/과',count:2,threshold:7,
   ruleText:'국, 수, 영(제2외국어/한문 대체 가능), 사/과(1) 중 2개 영역 등급 합 7 이내',note:'제2외국어/한문 성적이 없고 다른 영역으로 충족할 수 없으면 판정 보류',resolutionNote:'원문 고교추천 글로벌융합대학 2합7에 영어 대체영역을 결합'});
  if(row.id==='MIN-abaa759dc3829187'&&row.university==='덕성여대')simple({scopeType:'학과',department:'과학기술대학',count:2,threshold:7,
   ruleText:'국, 수, 영, 사/과(1) 중 2개 영역 등급 합 7 이내',resolutionNote:'과학기술대학 일반 2합7. 글로벌융합대학의 영어 대체 허용은 별도 행'});
  if(row.id==='MIN-1ba89fe59e2a9e10'&&row.university==='덕성여대')Object.assign(row,{reviewStatus:'사용안함',reviewReason:'',resolutionNote:'동일 논술 약학과 3합5·수학 필수 조건은 MIN-bb46864714f7ddab에서 계산'});
  if(['MIN-927fdbe46187eec7','MIN-81da2d9ebd896f29','MIN-6164d61aa17b009c','MIN-ce560bbd111980ce','MIN-d612b647efde6126'].includes(row.id)&&/사\/과\/직\(1\)/.test(row.ruleText))simple({subjects:'국|수|영|사/과/직',count:2,threshold:/합\s*7/.test(row.ruleText)?7:6,
   note:[row.note,'직업탐구를 선택한 경우 해당 성적도 입력해야 완전한 판정이 가능합니다.'].filter(Boolean).join(' · '),
   resolutionNote:'원문 직업탐구 선택을 탐구 후보 한 영역으로 반영. 성적이 없으면 충족 확정 또는 판정 보류'});
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
  row.resolutionSource=official2027EssaySources[row.university]||admissions119;
  row.resolutionNote=official2027EssaySources[row.university]?'대학 입학처 2027학년도 논술전형 안내의 전형명 대조':'대입정보포털 2027 대입정보 119 논술전형 pp.392, 423, 428의 전형명 대조';
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
 if(uni==='성균관대'&&['MIN-d8ccd9deec29f6ac','MIN-f5df0ae9390435ff','MIN-fc53c2d47ad3ae2e','MIN-5d52fc4a8d0b9a76','MIN-2dbb6308367454e9'].includes(row.id)){
  const official='https://admission.skku.edu/upload/guide/20260813104526BBPE44.pdf';
  const scopes={
   'MIN-d8ccd9deec29f6ac':['자유전공계열|글로벌리더학부|글로벌경제학과|글로벌경영학과|글로벌바이오메디컬공학과|소프트웨어학과|반도체융합공학과|에너지학과',6],
   'MIN-f5df0ae9390435ff':['인문과학계열|사회과학계열|경영학과|사범대학|영상학과|의상학과|자연과학계열|공학계열|건설환경공학부|건축학과',7],
   'MIN-fc53c2d47ad3ae2e':['의예과',5],
   'MIN-5d52fc4a8d0b9a76':['자유전공계열|글로벌리더학부|글로벌경제학과|글로벌경영학과|글로벌바이오메디컬공학과|전자전기공학부|반도체시스템공학과|반도체융합공학과|소프트웨어학과|지능형소프트웨어학과|에너지학과|약학과',5],
   'MIN-2dbb6308367454e9':['글로벌융합학부|인문과학계열|사회과학계열|경영학과|자연과학계열|공학계열|건설환경공학부',6]
  };const [department,threshold]=scopes[row.id],essay=type==='논술',medicine=/의예/.test(department);
  Object.assign(row,{scopeType:'학과',department,track:essay?'논술':'추천인재',reviewStatus:'계산가능',reviewReason:'',subjects:medicine?'국|수|영|탐':'국|수|영|사/과/외',count:medicine?4:3,threshold,
   ruleType:'합',inquiryMode:medicine?'통합평균':'통합개별',referenceMapped:true,conditionalMandatory:essay&&!medicine?'언어형:자연과학계열|공학계열|건설환경공학부|전자전기공학부|소프트웨어학과':'',
   note:medicine?'탐구 두 과목 평균. 2027 선택과목 점수는 통합 모평으로 참고 환산':'탐구 2과목 평균·제2외국어/한문 대체 허용·과학탐구 우수 1과목 가능. 선택탐구 상세 성적이 없으면 미충족 확정을 보류',
   source:'성균관대학교 2027학년도 수시모집요강',page:essay?'12':'9',resolutionSource:official,
   resolutionNote:'공식 수시모집요강의 전형명·모집단위·3합/4합 범위 확인; 선택탐구 대체는 현재 성적으로 참고 판정'});
  // The medicine row specifies a two-subject inquiry average; other rows
  // allow a higher individual science result that cannot be reconstructed.
  if(!medicine)row.optionalInquiryAlternative=true;
 }
 if(uni==='중앙대'&&row.id==='MIN-4197063d61f52278')Object.assign(row,{track:'일반형',scopeType:'학과',department:'약학부',reviewStatus:'계산가능',reviewReason:'',subjects:'국|수|영|사/과',count:4,threshold:5,ruleType:'합',historyMax:4,englishConversion:'2등급까지1',inquiryMode:'통합개별',referenceMapped:true,
  ruleText:'국어·수학·영어·탐구(1) 4개 영역 등급 합 5 이내, 한국사 4등급 이내',note:'영어 1·2등급은 1등급으로 환산. 2027 탐구는 통합 모평 참고 환산',source:'중앙대학교 2027학년도 수시모집요강',resolutionSource:'https://admission.cau.ac.kr/file/pdfDown.pdf?ofn=2027%ED%95%99%EB%85%84%EB%8F%84+%EC%A4%91%EC%95%99%EB%8C%80%ED%95%99%EA%B5%90+%EC%88%98%EC%8B%9C%EB%AA%A8%EC%A7%91%EC%9A%94%EA%B0%95_20260529_VF.pdf&sfn=20260529040050578_55c4ff8925324156a16c17aaab30fe7e.pdf',resolutionNote:'공식 논술 일반형 약학부 4합5; 요약표의 3합5를 교정'});
 if(uni==='한국항공대'&&row.id==='MIN-5e235b2e1ba410b3')Object.assign(row,{track:'논술우수자',reviewStatus:'계산가능',reviewReason:'',subjects:'국|수|영|사/과/직',referenceMapped:true,
  ruleText:'국·수·영·사/과/직업탐구(1) 중 2개 영역 등급 합 6 이내',resolutionSource:'https://cdn013.negagea.net/dgsmidc/omr/seoul/web/univ_info2025/%ED%95%9C%EA%B5%AD%ED%95%AD%EA%B3%B5%EB%8C%80%ED%95%99%EA%B5%90/%ED%95%9C%EA%B5%AD%ED%95%AD%EA%B3%B5%EB%8C%80%ED%95%99%EA%B5%90_2027%ED%95%99%EB%85%84%EB%8F%84_%EB%8C%80%ED%95%99%EC%9E%85%ED%95%99%EC%A0%84%ED%98%95%EA%B3%84%ED%9A%8D.pdf',resolutionNote:'공식 2027 시행계획 p.9 논술우수자 전 모집단위 2합6·직업탐구 선택 가능'});
 if(uni==='홍익대'&&row.id==='MIN-3979d8d386097d39')Object.assign(row,{scopeType:'전체',department:'전체',campus:'서울',reviewStatus:'계산가능',reviewReason:'',historyMax:4,referenceMapped:true,
  ruleText:'서울캠퍼스 학교생활우수자: 국·수·영·탐구 중 2개 영역 등급 합 5 이내, 한국사 4등급 이내',resolutionSource:'https://www.hongik.ac.kr/kr/admission/recruitment.do?articleNo=152315&mode=view',resolutionNote:'2027 수시모집요강 서울캠퍼스 학교생활우수자 적용범위'});
 if(uni==='연세대'&&['추천형','활동우수형','국제형(국내고)'].includes(row.track)){
  const official='https://www2.yonsei.ac.kr/entrance/plan/2027_plan.pdf';
  const history={englishMax:3,historyMax:4};
  const scopes={
   'MIN-765405a122ed617f':{scopeType:'학과',department:'의예과|치의예과|약학과',ruleType:'각',subjects:'국|수|과',count:2,threshold:1,mandatory:'국/수',...history},
   'MIN-9df741004f7bb566':{scopeType:'계열',department:'인문',ruleType:'합',subjects:'국|수|사/과',count:2,threshold:4,mandatory:'국/수',...history},
   'MIN-d582e564b3d8959c':{scopeType:'계열',department:'자연',excluded:'의예과|치의예과|약학과',ruleType:'합',subjects:'국|수|과',count:2,threshold:5,mandatory:'수',...history},
   'MIN-31b85ed99ae0e7be':{scopeType:'전체',department:'전체',ruleType:'합',subjects:'국|수|사/과',count:2,threshold:5,mandatory:'국/수',englishMax:2,historyMax:4},
   'MIN-e9d1f52a91a9afeb':{scopeType:'학과',department:'의예과|치의예과|약학과',ruleType:'각',subjects:'국|수|과',count:2,threshold:1,mandatory:'국/수',...history},
   'MIN-bc7e0dd09542897b':{scopeType:'계열',department:'인문',ruleType:'합',subjects:'국|수|사/과',count:2,threshold:4,mandatory:'국/수',...history},
   'MIN-7f77ddd4ae6f7fb9':{scopeType:'계열',department:'자연',excluded:'의예과|치의예과|약학과',ruleType:'합',subjects:'국|수|과',count:2,threshold:5,mandatory:'수',...history},
  };
  if(row.id==='MIN-62ee43a37b9bc7f2')return {...row,reviewStatus:'사용안함',reviewReason:'',resolutionSource:official,resolutionNote:'공식 2027 추천형 자연 일반 2합5와 중복된 불완전한 요약 행'};
  if(scopes[row.id]){
   const rule=scopes[row.id],isEach=rule.ruleType==='각';
   Object.assign(row,{...rule,reviewStatus:'계산가능',reviewReason:'',inquiryMode:'통합개별',rounding:'없음',englishConversion:'없음',referenceMapped:true,
    ruleText:`국어·수학·${rule.subjects.includes('사/과')?'탐구':'과학탐구'} 중 ${rule.mandatory==='수'?'수학': '국어·수학 중 한 과목'} 포함 ${isEach?'2개 과목 각 1등급':`2개 과목 등급 합 ${rule.threshold}`} 이내`,
    note:`영어 ${rule.englishMax}등급·한국사 4등급 이내. 2027 선택탐구·수학 선택과목 조건은 실제 원서접수 시 확인`,
    source:'연세대학교 2027학년도 입학전형 시행계획',page:row.track==='추천형'?'11':row.track==='활동우수형'?'12':'13',resolutionSource:official,
    resolutionNote:'공식 2027 시행계획의 전형별 범위·등급·영어·한국사 조건으로 요약표의 상충 항목 교정. 통합 모평 성적은 참고 환산'});
  }
 }
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
  row.resolutionSource=row.resolutionSource||admissions119;
  const note='2027 대입정보 119 교과 pp.93–99/논술 pp.195–196, 2027 한국사·필수영역 대조';
  if(!String(row.resolutionNote||'').includes(note))row.resolutionNote=[row.resolutionNote,note].filter(Boolean).join(' · ');
 }
 if(uni==='한국공학대'&&course&&row.track==='교과우수자'){
  const official='https://iphak.tukorea.ac.kr/guide/notice.htm?bbsid=notice&bltn_seq=12585&mode=view';
  if(row.id==='MIN-7b7dd8b2d3ef5d7d')return {...row,reviewStatus:'사용안함',reviewReason:'',resolutionSource:official,
   resolutionNote:'공식 2027 시행계획: 공학계열은 2합7. 요약표 2합6 행 제외'};
  if(['MIN-54352cf32d48c2ab','MIN-61ff84e885ae6129'].includes(row.id))Object.assign(row,{reviewStatus:'계산가능',reviewReason:'',
   scopeType:row.id==='MIN-61ff84e885ae6129'?'학과':'계열',department:row.id==='MIN-61ff84e885ae6129'?'경영학부':'공학|자연',
   subjects:'국|수|영|사/과',ruleType:'합',count:2,threshold:row.id==='MIN-61ff84e885ae6129'?8:7,mandatory:'',inquiryMode:'통합개별',referenceMapped:true,
   ruleText:`국, 수, 영, 탐구(사/과 1과목) 중 2개 영역 등급 합 ${row.id==='MIN-61ff84e885ae6129'?8:7} 이내`,
   note:'한국사 응시 필수. 2027 수학 미적분/기하 선택 시 수학 반영등급 1등급 상향(선택과목 미입력 상태에서는 가산 계산하지 않음)',
   resolutionSource:official,resolutionNote:'한국공학대학교 공식 2027 시행계획: 공학 2합7, 경영학부 2합8로 적용범위 교정'});
 }
 return row;
}
