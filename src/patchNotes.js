// 업데이트(패치) 안내: 배포할 때마다 맨 앞에 한 건씩 추가합니다.
// date(배포일)부터 SHOW_DAYS일 동안, 로그인한 사람에게 팝업으로 한 번 보여 주고 '확인했어요'를 누르면 다시 띄우지 않습니다.
// items의 audience: "all"(모두) · "staff"(선생님·관리자) · "student"(학생)
export const SHOW_DAYS = 2;

export const PATCH_NOTES = [
  {
    id: "2026-10-28-d",
    date: "2026-10-28",
    title: "분리희망학생 화면 정리",
    items: [
      { audience: "staff", text: "학생 화면을 '이 학생이 적은 분리희망'과 '이 학생을 적은 학생' 두 탭으로 나눴습니다. 다른 학생이 적은 내용이 있으면 주황색으로 표시돼요." },
      { audience: "staff", text: "'분리 쌍'을 '분리 관계'로 바꾸고, 현황 목록은 '적은 학생 → 분리할 학생' 순서로 보여 줍니다." },
    ],
  },
  {
    id: "2026-10-28-c",
    date: "2026-10-28",
    title: "선생님 ZONE 정리",
    items: [
      { audience: "staff", text: "정기시험 강조(성적 산출 큰 카드·시험 안내)는 시험이 끝나고 6일까지만 보입니다." },
      { audience: "staff", text: "2학년 담임 선생님 홈에 '반편성 분리희망학생' 입력 안내를 크게 보여 줍니다." },
      { audience: "staff", text: "분리 등급 기준을 색 띠 하나로 정리하고, 예시는 펼치거나 접을 수 있게 했습니다." },
    ],
  },
  {
    id: "2026-10-28-b",
    date: "2026-10-28",
    title: "분리희망학생 개선 · 성적 확인 팝업 수정",
    items: [
      { audience: "staff", text: "분리희망학생: 분리 등급이 4단계(반드시·되도록·가능하면·참고)가 되고 등급별 예시를 보여 줍니다. 사유는 목록에서 고르거나 직접 적을 수 있어요." },
      { audience: "staff", text: "다른 반에서 우리 반 학생을 분리 희망으로 적으면 그 학생 화면에도 보이고, 버튼 하나로 이 학생에도 추가할 수 있습니다." },
      { audience: "staff", text: "전체 현황: 등급별 쌍 수, 반별 입력 현황, 분리 쌍 목록을 한 화면에서 봅니다." },
      { audience: "staff", text: "시험이 끝나고 6일이 지나도 성적 확인 팝업이 뜨던 문제를 고쳤습니다." },
    ],
  },
  {
    id: "2026-10-28-a",
    date: "2026-10-28",
    title: "2학년 반편성 분리희망학생 입력",
    items: [
      { audience: "staff", text: "선생님 ZONE에 '분리희망학생' 탭이 생겼습니다. 2학년 담임 선생님은 우리 반 학생마다 같은 반이 되면 안 되는 학생(최대 10명)·분리 등급·사유를 적어 저장해 주세요." },
      { audience: "staff", text: "2학년부·관리자는 전체 현황을 보고 학교 양식(분리희망학생(2학년부)) 그대로 엑셀로 받을 수 있습니다." },
    ],
  },
  {
    id: "2026-10-27-b",
    date: "2026-10-27",
    title: "성적 시뮬레이터·팝업 개선",
    items: [
      { audience: "all", text: "성적 시뮬레이터가 시간표 과목을 교육과정 편제표 이름(예: 미창 → 미술 창작)으로 바꿔 넣고, 체육·예술·창체처럼 석차등급이 없는 과목은 빼고 계산합니다." },
      { audience: "staff", text: "성적 확인 기간 팝업: 담당 과목을 시험 뒤에 모두 저장했으면 더 이상 뜨지 않고, '산출 끝났어요'로 이번 시험 동안 끌 수 있습니다." },
      { audience: "all", text: "업데이트가 있을 때 이렇게 바뀐 점을 2일 동안 알려 드립니다." },
    ],
  },
  {
    id: "2026-10-27-a",
    date: "2026-10-27",
    title: "NAVI·성적표 인쇄 개선",
    items: [
      { audience: "staff", text: "NAVI·상담: 같은 전형이 컷이 다르게 두 번 보이던 문제를 고쳤습니다. 합쳐진 학과 컷은 가운데값으로 묶고 원래 값을 함께 보여 줍니다." },
      { audience: "staff", text: "NAVI 표에서 상세 카드로 간 뒤 '표로 돌아가기'로 보던 자리로 돌아올 수 있습니다." },
      { audience: "all", text: "성적표 인쇄가 종이를 빈 공간 없이 채우도록 고쳤습니다." },
    ],
  },
];

const dayStart = value => { const d = new Date(`${value}T00:00:00`); return Number.isFinite(d.getTime()) ? d.getTime() : NaN; };

// 지금 보여 줄 안내(최신순). audience: "staff" | "student", seen: 이미 확인한 id 목록
export function activePatchNotes({ notes = PATCH_NOTES, now = new Date(), audience = "staff", seen = [], days = SHOW_DAYS } = {}) {
  const time = now.getTime();
  return notes
    .filter(note => {
      const start = dayStart(note.date);
      return Number.isFinite(start) && time >= start && time < start + days * 86400000 && !seen.includes(note.id);
    })
    .map(note => ({ ...note, items: (note.items || []).filter(item => !item.audience || item.audience === "all" || item.audience === audience) }))
    .filter(note => note.items.length);
}
