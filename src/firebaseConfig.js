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
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};
