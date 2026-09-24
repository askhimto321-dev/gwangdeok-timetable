# 광덕고 이동수업 시간표 조회하기 (Beta)

## 1. 준비: Firebase 프로젝트 만들기 (5분, 무료)

1. https://console.firebase.google.com 접속 → 구글 계정으로 로그인
2. "프로젝트 추가" → 이름 입력(예: gwangdeok-timetable) → 계속 → Google Analytics는 "사용 안 함" 선택 후 만들기
3. 왼쪽 메뉴 "Firestore Database" → "데이터베이스 만들기"
   - 위치: asia-northeast3 (서울)
   - 보안 규칙: "테스트 모드에서 시작" 선택 (30일간 열려있음, 이후 아래 4번 규칙 참고)
4. 왼쪽 메뉴 상단 톱니바퀴(프로젝트 설정) → "일반" 탭 → 아래로 스크롤 →
   "내 앱" 섹션에서 웹 아이콘(</>) 클릭 → 앱 닉네임 입력 → "앱 등록"
5. 화면에 나오는 `firebaseConfig` 객체의 값들을 `src/firebaseConfig.js` 파일에
   그대로 붙여넣어 주세요.

## 2. 로컬에서 실행해보기 (선택)

```
npm install
npm run dev
```

## 3. 배포하기 (Netlify, 가장 쉬움)

```
npm install
npm run build
```

위 명령이 끝나면 `dist` 폴더가 생성됩니다.

1. https://app.netlify.com/drop 접속
2. `dist` 폴더를 그대로 화면에 끌어다 놓기(drag & drop)
3. 몇 초 후 `https://무작위이름.netlify.app` 주소가 발급됩니다.
4. Netlify 계정(무료)에 로그인하면 "Site settings > Domain management"에서
   원하는 이름으로 서브도메인을 바꾸거나, 학교가 보유한 도메인을 연결할 수 있습니다.

재배포(업데이트)할 때도 `npm run build` 후 새로 생성된 `dist` 폴더를
같은 방식으로 다시 끌어다 놓으면 됩니다.

## 4. Firestore 보안 규칙 (30일 테스트 모드가 끝나기 전에 설정)

Firebase 콘솔 > Firestore Database > 규칙 탭에서 아래로 교체:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /kd_timetable_kv/{docId} {
      allow read: if true;
      allow write: if true;
    }
  }
}
```

(이 앱은 관리자 보호를 앱 자체의 아이디/비밀번호 로그인으로 처리하므로,
Firestore 규칙은 read/write를 열어둡니다. 더 엄격한 보안이 필요하면
Firebase Authentication을 추가로 연동하는 방법도 있습니다 — 필요하시면 말씀해주세요.)

## 5. 사용법

- **학생 조회**: 로그인 없이 누구나 학번/이름으로 검색
- **반별 조회**: 로그인 필요 (관리자 탭 > 계정 관리에서 계정 생성)
- **관리자**: 초기 계정 admin / kd2026 (반드시 로그인 후 계정 관리에서 변경 권장)
  - 이동수업 명단(엑셀) 업로드
  - 학급 시간표 업로드 (한글 .hwp 또는 엑셀 .xlsx) — 파일 업로드 또는 표 붙여넣기
  - 약어 매핑 (자동 제안 지원)
  - 검증 리포트
