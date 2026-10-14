// 교직원 기능 권한: 역할별 기본값 + 계정마다 켜고 끄기(featureAccess).
// 학년별 '성적 조회'·'시간표 조회'는 그대로 두고, 그 학년 안에서 쓸 수 있는 기능을 나눕니다.
// 예전에는 '반별 성적'이 담임반이 있는 선생님에게만 하드코딩돼 학년부장·교과담임·부서가 빠졌습니다.

export const STAFF_FEATURES = [
  { key: "classGrades", label: "반별 성적·반 비교", hint: "권한 학년의 모든 반 선택 (담임은 자기 반부터)" },
  { key: "gradeCompare", label: "학생 성적 비교", hint: "여러 학생 성적을 나란히 비교" },
  { key: "mockAnalysis", label: "모의고사 분석", hint: "학년 모의고사 성적 분석" },
  { key: "minimum", label: "최소성취수준", hint: "최성보 대상자 관리" },
];

const ROLE_DEFAULTS = {
  homeroom: { classGrades: true, gradeCompare: true, mockAnalysis: true, minimum: true },
  gradeHead: { classGrades: true, gradeCompare: true, mockAnalysis: true, minimum: true },
  other: { classGrades: true, gradeCompare: true, mockAnalysis: true, minimum: false },
  department: { classGrades: true, gradeCompare: true, mockAnalysis: true, minimum: true },
};

// account.teacherRole이 없으면 담임반 유무로 판단(App의 normalizedTeacherRole과 같은 규칙)
export function staffRoleOf(account) {
  if (!account) return "";
  if (account.accountType === "department") return "department";
  if (ROLE_DEFAULTS[account.teacherRole]) return account.teacherRole;
  return account.homeroomClass ? "homeroom" : "other";
}

export function featureDefault(role, key) {
  return !!ROLE_DEFAULTS[role]?.[key];
}

// 관리자는 항상 허용. 계정에 저장한 값(true/false)이 있으면 그 값이 우선입니다.
export function featureAllowed(account, key, { admin = false } = {}) {
  if (admin) return true;
  if (!account) return false;
  const stored = account.featureAccess?.[key];
  if (typeof stored === "boolean") return stored;
  return featureDefault(staffRoleOf(account), key);
}

// 관리자 화면에서 한 기능을 뒤집습니다. 결과가 역할 기본값과 같으면 저장값을 지워 '기본'으로 돌립니다.
export function toggleFeature(account, key) {
  const role = staffRoleOf(account);
  const next = !featureAllowed(account, key);
  const access = { ...(account?.featureAccess || {}) };
  if (next === featureDefault(role, key)) delete access[key];
  else access[key] = next;
  return { ...account, featureAccess: access };
}
