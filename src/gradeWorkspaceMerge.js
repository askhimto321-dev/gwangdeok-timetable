// 같은 과목을 여러 선생님이 동시에 작업할 때 학교 공동본을 합치는 3자 병합.
// ancestor = 내가 마지막으로 받아오거나 반영한 학교 공동본, mine = 지금 내 화면, theirs = 방금 읽은 학교 공동본.
// 항목(지필 시험·수행 파일·설정 키·학생별 보정값) 단위로 비교해서
//  - 한쪽만 바꿨으면 바뀐 쪽을, 둘 다 바꿨으면 더 최근 것(없으면 내 것)을 씁니다.
// 그래서 A 선생님이 1~4반 수행, B 선생님이 5~8반 수행을 올려도 서로 지워지지 않습니다.

export const WORKSPACE_PARTS = ["written", "performance", "settings", "tieScores", "studentOverrides"];

const same = (a, b) => {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
};

const stamp = value => {
  const raw = value?.updatedAt || value?.uploadedAt || "";
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : 0;
};

function pick(a, m, t, conflicts, key) {
  if (same(m, t)) return m;
  if (same(m, a)) return t;
  if (same(t, a)) return m;
  conflicts.push(key);
  return stamp(t) > stamp(m) ? t : m;
}

function mergeMap(a = {}, m = {}, t = {}, conflicts, prefix) {
  const out = {};
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(m || {}), ...Object.keys(t || {})]);
  for (const key of keys) {
    const value = pick(a?.[key], m?.[key], t?.[key], conflicts, `${prefix}:${key}`);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

const byId = list => Object.fromEntries((Array.isArray(list) ? list : []).filter(item => item?.id).map(item => [item.id, item]));

function mergeList(a, m, t, conflicts, prefix) {
  const merged = mergeMap(byId(a), byId(m), byId(t), conflicts, prefix);
  // 순서: 내 화면 순서 → 새로 생긴 것(상대 순서)
  const order = [...(m || []).map(item => item?.id), ...(t || []).map(item => item?.id)].filter(Boolean);
  return [...new Set(order)].filter(id => merged[id]).map(id => merged[id]);
}

export function workspacePayload(item) {
  return {
    written: Array.isArray(item?.written) ? item.written : [],
    performance: Array.isArray(item?.performance) ? item.performance : [],
    settings: item?.settings || {},
    tieScores: item?.tieScores || {},
    studentOverrides: item?.studentOverrides || {},
  };
}

export function samePayload(a, b) {
  return same(workspacePayload(a), workspacePayload(b));
}

export function mergeWorkspacePayload(ancestor, mine, theirs) {
  const conflicts = [];
  const a = workspacePayload(ancestor || {});
  const m = workspacePayload(mine || {});
  const t = workspacePayload(theirs || {});
  const merged = {
    written: mergeList(a.written, m.written, t.written, conflicts, "written"),
    performance: mergeList(a.performance, m.performance, t.performance, conflicts, "performance"),
    settings: mergeMap(a.settings, m.settings, t.settings, conflicts, "settings"),
    tieScores: mergeMap(a.tieScores, m.tieScores, t.tieScores, conflicts, "tieScores"),
    studentOverrides: mergeMap(a.studentOverrides, m.studentOverrides, t.studentOverrides, conflicts, "studentOverrides"),
  };
  return { merged, conflicts };
}

// 함께 작업 중 표시: presence[workspaceId] = { [editorId]: { name, at } } 에서 최근(2분) 활동만.
export function activeEditors(presence, workspaceId, selfId, now = Date.now(), windowMs = 120000) {
  return Object.entries(presence?.[workspaceId] || {})
    .filter(([id, info]) => id !== selfId && now - Date.parse(info?.at || 0) <= windowMs)
    .map(([id, info]) => ({ id, name: info?.name || "선생님", at: info?.at }));
}
