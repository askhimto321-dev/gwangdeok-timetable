// ============================================================
// Firebase 설정 파일
// 아래 값을 Firebase 콘솔에서 발급받은 값으로 교체해주세요.
//
// 1) https://console.firebase.google.com 접속 → 구글 계정으로 로그인
// 2) "프로젝트 추가" → 이름 입력(예: gwangdeok-timetable) → 만들기
// 3) 왼쪽 메뉴에서 "Firestore Database" → "데이터베이스 만들기"
//    → 위치는 asia-northeast3(서울) 선택 → 테스트 모드로 시작
// 4) 프로젝트 설정(톱니바퀴 아이콘) → "일반" 탭 → 아래로 스크롤
//    → "내 앱" → 웹 아이콘(</>) 클릭 → 앱 닉네임 입력 → 앱 등록
// 5) 화면에 나오는 firebaseConfig 객체 값을 아래에 그대로 붙여넣기
// ============================================================
export const firebaseConfig = {
  apiKey: "여기에_API_KEY_붙여넣기",
  authDomain: "여기에_AUTH_DOMAIN_붙여넣기",
  projectId: "여기에_PROJECT_ID_붙여넣기",
  storageBucket: "여기에_STORAGE_BUCKET_붙여넣기",
  messagingSenderId: "여기에_SENDER_ID_붙여넣기",
  appId: "여기에_APP_ID_붙여넣기",
};
