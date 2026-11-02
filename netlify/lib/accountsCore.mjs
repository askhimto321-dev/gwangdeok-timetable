// 계정 목록 저장 규칙(파이어베이스 없이 동작 — node 테스트용)
// - 관리자: 모든 계정을 바꿀 수 있음
// - 선생님: 자기 담당 과목·담임 반, 교과부장 학생 목록만
// - 그 밖의 계정: 계정 목록을 바꿀 수 없음
// 비밀번호는 평문으로 남기지 않습니다. 새로 적은 비밀번호는 따로 모아(서버가 암호화해 보관) 목록에는 '암호화됨' 표시만 둡니다.
import { HASHED_PW } from "./authCore.mjs";

export const ACCOUNT_LISTS = ["admin", "classView", "departments", "teacher", "teacherPending", "monitors", "students"];
const PASSWORD_KINDS = { admin: "admin", classView: "classView", departments: "departments", teacher: "teacher", teacherPending: "teacher", monitors: "monitors", students: "students" };
const list = (accounts, kind) => (Array.isArray(accounts?.[kind]) ? accounts[kind] : []);
const same = (a, b) => String(a?.id ?? "") === String(b?.id ?? "");

// 화면에 보낼 공개용 목록: 비밀번호 칸은 '암호화됨' 표시(비어 있으면 빈칸)
export function publicAccounts(accounts = {}) {
  const out = { ...accounts };
  ACCOUNT_LISTS.forEach(kind => { out[kind] = list(accounts, kind).map(entry => (entry && typeof entry === "object" ? { ...entry, pw: entry.pw ? HASHED_PW : "" } : entry)); });
  return out;
}

// 저장할 목록에서 평문 비밀번호를 빼고 [{ kind, id, pw }]로 모읍니다. 화면이 '암호화됨'이나 빈칸을 보냈으면 저장된 값을 그대로 둡니다.
// limit: 한 번에 암호화할 최대 개수(서버 함수 시간 제한). 넘는 건 평문 그대로 두고 다음 번에 이어서 합니다.
function sealPasswords(next, stored, limit = Infinity) {
  const plain = [];
  const waiting = new Set(); // 이번에 못 한 계정(두 번 세지 않게)
  const take = (kind, entry, pw) => {
    if (plain.length >= limit) { waiting.add(`${kind}|${entry.id}`); return { ...entry, pw }; }
    plain.push({ kind: PASSWORD_KINDS[kind], id: String(entry.id), pw });
    return { ...entry, pw: HASHED_PW };
  };
  ACCOUNT_LISTS.forEach(kind => {
    next[kind] = list(next, kind).map(entry => {
      if (!entry || typeof entry !== "object") return entry;
      const before = list(stored, kind).find(item => same(item, entry));
      const pw = typeof entry.pw === "string" ? entry.pw : "";
      if (!pw || pw === HASHED_PW) return { ...entry, pw: before?.pw ? (before.pw === HASHED_PW ? HASHED_PW : before.pw) : pw };
      return take(kind, entry, pw);
    });
  });
  // 저장된 쪽에 남아 있던 평문도 이번에 함께 암호화합니다.
  ACCOUNT_LISTS.forEach(kind => {
    next[kind] = next[kind].map(entry => {
      if (!entry || typeof entry !== "object" || !entry.pw || entry.pw === HASHED_PW) return entry;
      return take(kind, entry, entry.pw);
    });
  });
  return { plain, deferred: waiting.size };
}

export class AccountChangeError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// 사람 한 명 = 아이디 하나: 선생님 계정과 아이디가 같은 관리자 계정은 선생님 계정의 '관리자 권한'(adminPermissions)으로 합칩니다.
// 로그인은 선생님 비밀번호로 하고, 관리자 역할도 함께 켜집니다. (아이디가 다른 관리자 전용 계정은 그대로)
export function mergeAdminsIntoTeachers(next) {
  const teachers = list(next, "teacher");
  const keep = [];
  list(next, "admin").forEach(admin => {
    const index = teachers.findIndex(t => String(t?.id ?? "") === String(admin?.id ?? ""));
    if (index < 0) { keep.push(admin); return; }
    teachers[index] = { ...teachers[index], adminPermissions: Array.isArray(admin.permissions) ? admin.permissions : [] };
  });
  next.teacher = teachers;
  next.admin = keep;
  return next;
}

// who: { kind, id } (로그인 서버가 확인한 계정). 결과 { next, plain }
export function applyAccountChange(who, stored = {}, submitted = {}, { limit = Infinity } = {}) {
  let next;
  if (who.kind === "admin") {
    next = { ...stored, ...submitted };
    ACCOUNT_LISTS.forEach(kind => { next[kind] = list(submitted, kind).length || Array.isArray(submitted?.[kind]) ? list(submitted, kind) : list(stored, kind); });
    mergeAdminsIntoTeachers(next);
    const adminCount = accounts => list(accounts, "admin").length + list(accounts, "teacher").filter(t => Array.isArray(t?.adminPermissions)).length;
    if (!adminCount(next) && adminCount(stored)) throw new AccountChangeError(400, "관리자 계정을 모두 지울 수는 없어요.");
  } else if (who.kind === "teacher") {
    next = { ...stored };
    ACCOUNT_LISTS.forEach(kind => { next[kind] = list(stored, kind).map(entry => ({ ...entry })); });
    const mine = list(submitted, "teacher").find(entry => String(entry?.id) === String(who.id));
    if (mine) {
      next.teacher = next.teacher.map(entry => {
        if (String(entry?.id) !== String(who.id)) return entry;
        const out = { ...entry, assignments: Array.isArray(mine.assignments) ? mine.assignments : entry.assignments };
        if (entry.teacherRole === "homeroom" && mine.homeroomClass !== undefined) out.homeroomClass = String(mine.homeroomClass || "");
        return out;
      });
    }
    // 교과부장(학생) 지정·해제·비밀번호 초기화
    if (Array.isArray(submitted?.monitors)) next.monitors = submitted.monitors.filter(entry => entry && entry.id);
  } else {
    throw new AccountChangeError(403, "계정 목록을 바꿀 권한이 없어요.");
  }
  const { plain, deferred } = sealPasswords(next, stored, limit);
  return { next, plain, deferred };
}
