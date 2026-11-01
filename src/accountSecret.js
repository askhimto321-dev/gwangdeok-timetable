// 계정 비밀번호 표시: 서버 로그인 뒤 비밀번호는 암호화되어 서버 전용 저장소로 옮겨지고,
// 공개 계정 목록(kd_accounts)의 pw 칸에는 이 표시만 남습니다.
// 관리자가 새 비밀번호를 적어 넣으면(평문) 그 계정의 다음 로그인 때 다시 암호화됩니다.
export const HASHED_PW = "__kd_hashed__";
export const isHashedPw = value => value === HASHED_PW;

// 계정마다 다른 초기 비밀번호(헷갈리는 글자 0·O·1·l·I 뺌). 모두 같은 비밀번호로 만들면 학번만 알아도 남의 계정에 들어갈 수 있어서입니다.
const CODE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
export function randomInitialPassword(length = 8) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, b => CODE_CHARS[b % CODE_CHARS.length]).join("");
}
