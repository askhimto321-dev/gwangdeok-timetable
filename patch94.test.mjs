import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {renderToStaticMarkup} from 'react-dom/server';
import React from 'react';
const server=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
const navi=await server.ssrLoadModule('/src/SusiNaviBeta.jsx');
const panel=await server.ssrLoadModule('/src/CounselingAdmissionFacts.jsx');
after(()=>server.close());
export const favorite={id:'f1',university:'경희대',region:'서울',department:'화학공학과'};
export const rules=['학교추천','네오르네상스'].map((track,i)=>({schema:'KD_MINIMUM_V1',id:String(i),sourceId:'fixture',admissionYear:2028,season:'수시',university:'경희대',campus:'',admissionType:i?'종합':'교과',track,scopeType:'전체',department:'전체',reviewStatus:'계산가능',reviewReason:'',ruleType:'합',subjects:'국|수|영|사/과',count:2,threshold:i?5:7,mandatory:'',historyMax:null,englishMax:null,inquiryMode:'통합개별',rounding:'없음',englishConversion:'없음',ruleText:`국, 수, 영, 사/과 중 2개 합 ${i?5:7}`,note:'',source:'테스트 자료',page:1}));
export const student={sid:'20999',admissionYear:2028,latestMockLabel:'2026년 9월 모평',minimumCatalogRows:rules,subjects:[{subject:'미적분I',source:'timetable',enrollmentStatus:'enrolled'},{subject:'화학',source:'grades'}],latestMockGrades:{국어:5,수학:4,영어:3,통합사회:3,통합과학:4,한국사:1}};
export const recommendedData={records:[{...favorite,field:'공학',core:['미적분I','미적분II'],recommended:['화학'],noteRecommended:['기하']}],source:{name:'검증용 대학 발표 자료'}};
export const indexes=navi.buildCounselingFactIndex({},recommendedData);
export const facts=navi.counselingFactsForFavorite({favorite,data:{},student,recommendedData,indexes});
test('상담 학과 즐겨찾기는 NAVI 파일 없이도 카탈로그 전형별 최저를 표시한다',()=>{
 assert.equal(facts.minimums.length,2);
 assert.equal(facts.minimums.find(x=>x.track==='학교추천').evaluation.status,'satisfied');
 assert.equal(facts.minimums.find(x=>x.track==='네오르네상스').evaluation.status,'unsatisfied');
 assert.ok(facts.minimums.every(x=>x.evaluation.selectedSubjects.every(s=>s.name!=='한국사')));
});
test('상담 권장과목은 해당 대학 공식 핵심·권장·비고와 시간표 수강을 함께 대조한다',()=>{
 assert.equal(facts.progress.total,4);assert.equal(facts.progress.matched,2);assert.equal(facts.progress.estimated,false);
 assert.ok(facts.progress.matchedCourses.includes('미적분I'));assert.ok(facts.progress.missingCourses.includes('기하'));
});
test('전형명만 admissionType에 저장한 기존 즐겨찾기도 해당 전형으로 제한한다',()=>{
 const result=navi.counselingFactsForFavorite({favorite:{...favorite,source:'admission',favoriteKind:'전형',admissionType:'학교추천'},data:{},student,recommendedData,indexes});
 assert.equal(result.minimums.length,1);assert.equal(result.minimums[0].track,'학교추천');
});
test('대학 전체 즐겨찾기에 특정 학과 기준을 임의로 붙이지 않는다',()=>{
 assert.equal(navi.counselingFactsForFavorite({favorite:{...favorite,department:''},student,recommendedData,indexes}).needsDepartment,true);
});
test('학생을 바꾸면 모평 판정과 이수 개수가 함께 바뀐다',()=>{
 const result=navi.counselingFactsForFavorite({favorite,student:{...student,sid:'20998',subjects:[],latestMockGrades:{국어:8,수학:8,영어:8,통합사회:8,통합과학:8}},recommendedData,indexes});
 assert.equal(result.progress.matched,0);assert.ok(result.minimums.every(x=>x.evaluation.status==='unsatisfied'));
});
test('상담 패널에 최저 합·연도·핵심 권장 비고 과목이 출력된다',()=>{
 const html=renderToStaticMarkup(React.createElement(panel.default,{facts,student,status:'ready',recommendationStatus:'ready'}));
 for(const text of ['수능최저','2028','2합 6','미적분I','기하','학교추천','네오르네상스'])assert.ok(html.includes(text),text);
});
