import { readStorage, updateStorage } from "./storage.js";

const EVENT_NAME = "kd:susi-support-plan-updated";
const SIGNAL_KEY = "kd_susi_support_plan_signal_v67";
export const supportPlanStorageKey = sid => `kd_susi_support_plan_v1:${String(sid || "staff")}`;
export const compareTrayStorageKey = sid => `kd_susi_compare_tray_v1:${String(sid || "staff")}`;

function listValue(value) {
  if (!value || !Array.isArray(value.items)) throw new Error("저장 목록 형식을 확인할 수 없습니다. 새로고침 후 다시 시도해주세요.");
  return value;
}
export async function loadSupportPlan(sid) {
  if (!String(sid || "").trim()) return [];
  return listValue(await readStorage(supportPlanStorageKey(sid), { items: [] }, { throwOnError: true })).items;
}
export async function loadCompareTray(sid) {
  if (!String(sid || "").trim()) return [];
  return listValue(await readStorage(compareTrayStorageKey(sid), { items: [] }, { throwOnError: true })).items;
}
export function notifySupportPlanChanged(sid) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { sid: String(sid) } }));
  // Only an invalidation signal is persisted; student records stay out of this key.
  try { window.localStorage.setItem(SIGNAL_KEY, JSON.stringify({ sid: String(sid), nonce: `${Date.now()}-${Math.random()}` })); } catch { /* same-window event remains available */ }
}
export function subscribeSupportPlanChanges(sid, refresh) {
  if (typeof window === "undefined") return () => {};
  const handle = event => { if (!event?.detail?.sid || String(event.detail.sid) === String(sid)) refresh(); };
  const storage = event => {
    if (event.key !== SIGNAL_KEY || !event.newValue) return;
    try { if (JSON.parse(event.newValue).sid === String(sid)) refresh(); } catch { /* ignore malformed signal */ }
  };
  const focus = () => refresh();
  window.addEventListener(EVENT_NAME, handle);
  window.addEventListener("storage", storage);
  window.addEventListener("focus", focus);
  return () => { window.removeEventListener(EVENT_NAME, handle); window.removeEventListener("storage", storage); window.removeEventListener("focus", focus); };
}
export async function mutateWorkspaceList(sid, kind, action, item, itemKey) {
  if (!String(sid || "").trim()) return { ok: false, error: "학생을 먼저 선택해주세요." };
  const isPlan = kind === "plan", limit = isPlan ? 6 : 5;
  const key = isPlan ? supportPlanStorageKey(sid) : compareTrayStorageKey(sid);
  const result = await updateStorage(key, { items: [] }, stored => {
    const current = listValue(stored).items;
    const identity = itemKey(item);
    const exists = current.some(value => itemKey(value) === identity);
    if (action === "add" && exists) return stored;
    if (action === "remove") return { ...stored, items: current.filter(value => itemKey(value) !== identity), updatedAt: new Date().toISOString() };
    if (action !== "add") throw new Error("지원 목록 작업을 확인해주세요.");
    if (current.length >= limit) throw new Error(`${isPlan ? "수시 지원 구성은 6개 전형" : "대학 비교는 5개 모집단위"}까지 저장할 수 있습니다. 먼저 한 항목을 삭제해주세요.`);
    return { ...stored, items: [...current, { ...item, addedAt: new Date().toISOString() }], updatedAt: new Date().toISOString() };
  });
  if (!result.ok) return result;
  if (isPlan) notifySupportPlanChanged(sid);
  return { ok: true, duplicate: !result.changed && action === "add", items: result.value.items };
}
