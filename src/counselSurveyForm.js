// 진학상담 사전 설문 구글폼 만들기 도우미.
// (1) 원본 폼 주소가 저장돼 있으면 '사본 만들기' 주소(…/copy)로 바로 엽니다.
// (2) 원본이 없어도, 구글 Apps Script에 붙여 넣어 실행하면 같은 질문의 새 폼(+응답 시트)을 만들어 주는 코드를 줍니다.
// 질문 문장은 counselSurvey.js가 응답 파일에서 열을 찾는 말과 맞춰 두었습니다(tests/counselSurveyForm.test.mjs가 확인).

export const SURVEY_FORM_KEY = "kd_counsel_survey_form_v1";
export const SURVEY_FORM_TITLE = "진학상담 사전 설문";
export const SURVEY_FORM_DESCRIPTION = "진학 상담 전에 미리 답해 주세요. 담임 선생님이 상담 준비에만 사용합니다. 학번은 5자리로 적어 주세요(예: 20301).";

// [질문, 종류(text|paragraph|choice|check), 보기, 필수]
export const SURVEY_FORM_QUESTIONS = [
  ["학번 (5자리)", "text", null, true],
  ["이름", "text", null, true],
  ["현재 진로·진학 목표는 어느 정도 정해져 있나요?", "choice", ["구체적으로 정했어요", "어느 정도 정했어요", "아직 고민 중이에요", "전혀 모르겠어요"], true],
  ["관심 있는 학과 또는 전공·직업을 적어 주세요.", "paragraph", null, false],
  ["그 분야에 관심을 갖게 된 이유는 무엇인가요?", "paragraph", null, false],
  ["가장 관심 있는 대학과 학과를 적어 주세요. (예: ○○대학교 ○○학과)", "text", null, false],
  ["추가로 알아보고 싶은 대학·학과가 있다면 적어 주세요.", "paragraph", null, false],
  ["대학과 학과 중 무엇을 더 중요하게 생각하나요?", "choice", ["대학", "학과", "비슷해요"], false],
  ["대학 선택 시 중요하게 생각하는 조건을 모두 골라 주세요.", "check", ["취업률·진로", "학교 인지도", "통학 거리", "장학금·등록금", "기숙사", "학과 분위기·교육과정"], false],
  ["진학을 고려할 수 있는 지역을 모두 골라 주세요.", "check", ["서울", "경기·인천", "충청·대전·세종", "강원", "경상·부산·대구", "전라·광주", "제주", "상관없음"], false],
  ["통학 또는 거주와 관련해 고려할 점이 있나요?", "choice", ["집에서 통학하고 싶어요", "기숙사·자취도 괜찮아요", "상관없어요"], false],
  ["현재 생각하는 대입 준비 방향은 무엇인가요?", "choice", ["수시 교과 위주", "수시 종합 위주", "논술", "정시 위주", "아직 모르겠어요"], false],
  ["관심 있거나 상담받고 싶은 전형을 모두 골라 주세요.", "check", ["학생부교과", "학생부종합", "논술", "실기·실적", "정시(수능)", "잘 모르겠어요"], false],
  ["본인의 지원 성향은 어떤가요?", "choice", ["상향 위주로 도전하고 싶어요", "소신·안정을 섞고 싶어요", "안정 위주로 가고 싶어요"], false],
  ["지원 범위에 관해 더 하고 싶은 말이 있나요?", "paragraph", null, false],
  ["자신 있거나 좋아하는 과목은 무엇인가요?", "text", null, false],
  ["도움이 필요한 과목은 무엇인가요?", "text", null, false],
  ["수능최저학력기준에 대해 어느 정도 알고 있나요?", "choice", ["잘 알고 준비하고 있어요", "들어 봤지만 잘 몰라요", "처음 들어요"], false],
  ["상담 때 소개하고 싶은 활동이 있나요? (동아리·탐구·봉사 등)", "paragraph", null, false],
  ["선택과목·권장과목과 관련해 궁금한 점이 있나요?", "paragraph", null, false],
  ["이번 상담에서 우선적으로 다루고 싶은 내용을 모두 골라 주세요.", "check", ["희망 대학·학과 정하기", "수시 지원 전략", "내신 관리", "수능최저 준비", "학생부 활동", "선택과목", "정시"], false],
  ["선생님께 꼭 물어보고 싶은 질문이 있나요?", "paragraph", null, false],
  ["상담 전에 알고 있으면 좋을 점이 있다면 적어 주세요.", "paragraph", null, false],
];

// 편집 주소(…/forms/d/<ID>/edit)에서 사본 주소를 만듭니다. 학생용 응답 주소(…/forms/d/e/…)나 forms.gle 짧은 주소로는 사본을 만들 수 없습니다.
export function formCopyUrl(url) {
  const text = String(url || "").trim();
  if (!text) return { ok: false, error: "" };
  if (/forms\.gle\//.test(text) || /\/forms\/d\/e\//.test(text)) return { ok: false, error: "학생용 응답 주소예요. 폼 편집 화면 주소(…/forms/d/…/edit)를 넣어 주세요." };
  const match = text.match(/docs\.google\.com\/forms\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,})/);
  if (!match) return { ok: false, error: "구글폼 편집 주소가 아니에요. 예: https://docs.google.com/forms/d/…/edit" };
  return { ok: true, id: match[1], url: `https://docs.google.com/forms/d/${match[1]}/copy` };
}

// 구글 Apps Script(script.google.com)에 붙여 넣고 실행하면 새 폼과 응답 시트를 만듭니다.
export function surveyFormScript(title = SURVEY_FORM_TITLE) {
  const data = JSON.stringify({ title, description: SURVEY_FORM_DESCRIPTION, questions: SURVEY_FORM_QUESTIONS }, null, 1);
  return `// KDTIME · ${title} 만들기
// 1) script.google.com → 새 프로젝트 → 이 코드를 모두 붙여 넣기 → 저장
// 2) 위쪽 '실행'(makeSurvey) → 권한 허용 → 아래 '실행 로그'에 폼 주소가 나옵니다.
const DATA = ${data};
function makeSurvey() {
  const form = FormApp.create(DATA.title);
  form.setDescription(DATA.description);
  form.setCollectEmail(false);
  DATA.questions.forEach(([q, type, choices, required]) => {
    let item;
    if (type === 'paragraph') item = form.addParagraphTextItem();
    else if (type === 'choice') item = form.addMultipleChoiceItem().setChoiceValues(choices).showOtherOption(false);
    else if (type === 'check') item = form.addCheckboxItem().setChoiceValues(choices).showOtherOption(true);
    else item = form.addTextItem();
    item.setTitle(q).setRequired(!!required);
  });
  const sheet = SpreadsheetApp.create(DATA.title + ' (응답)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());
  Logger.log('학생에게 보낼 주소: ' + form.getPublishedUrl());
  Logger.log('폼 편집 주소: ' + form.getEditUrl());
  Logger.log('응답 시트: ' + sheet.getUrl());
}
`;
}
