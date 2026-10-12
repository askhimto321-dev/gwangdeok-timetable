// 계정 목록(kd_accounts) 저장 시 다른 화면에서 그사이 바뀐 내용을 지우지 않도록 합칩니다.
// 예전에는 각 화면이 들고 있던 계정 전체로 덮어써서, 관리자가 준 권한이 다른 선생님의
// '내 정보 저장'이나 학생 계정 만들기로 되돌아가는 일이 있었습니다.
// base: 이 화면이 처음 받은 계정 · mine: 이 화면이 저장하려는 계정 · theirs: 저장 직전 최신 계정
// 내가 바꾼(추가·수정·삭제한) 계정만 반영하고, 나머지는 최신 계정을 그대로 둡니다.

export const ACCOUNT_LISTS = ["admin", "classView", "departments", "teacher", "teacherPending", "monitors", "students"];

const keyOf = item => String(item?.id ?? "");
const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

export function mergeAccountList(base = [], mine = [], theirs = []) {
  if (same(base, mine)) return theirs;
  const baseMap = new Map(base.map(item => [keyOf(item), item]));
  const mineMap = new Map(mine.map(item => [keyOf(item), item]));
  const removed = new Set([...baseMap.keys()].filter(id => !mineMap.has(id)));
  const changed = new Map([...mineMap].filter(([id, item]) => !baseMap.has(id) || !same(baseMap.get(id), item)));
  const out = [];
  const seen = new Set();
  theirs.forEach(item => {
    const id = keyOf(item);
    if (removed.has(id)) return;
    seen.add(id);
    out.push(changed.has(id) ? changed.get(id) : item);
  });
  // 내가 새로 추가한 계정(최신본에 없음)
  mine.forEach(item => {
    const id = keyOf(item);
    if (!seen.has(id) && changed.has(id)) { seen.add(id); out.push(item); }
  });
  return out;
}

export function mergeAccounts(base = {}, mine = {}, theirs = {}) {
  const merged = { ...theirs, ...mine };
  ACCOUNT_LISTS.forEach(list => {
    const b = Array.isArray(base?.[list]) ? base[list] : [];
    const m = Array.isArray(mine?.[list]) ? mine[list] : [];
    const t = Array.isArray(theirs?.[list]) ? theirs[list] : [];
    merged[list] = mergeAccountList(b, m, t);
  });
  return merged;
}
