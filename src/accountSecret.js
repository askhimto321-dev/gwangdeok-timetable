// 계정 비밀번호 표시: 서버 로그인 뒤 비밀번호는 암호화되어 서버 전용 저장소로 옮겨지고,
// 공개 계정 목록(kd_accounts)의 pw 칸에는 이 표시만 남습니다.
// 관리자가 새 비밀번호를 적어 넣으면(평문) 그 계정의 다음 로그인 때 다시 암호화됩니다.
export const HASHED_PW = "__kd_hashed__";
export const isHashedPw = value => value === HASHED_PW;
