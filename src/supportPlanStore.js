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

/* 지원 구성 프리셋: 실제 수시 지원은 6장이라 '현재 구성'은 6개로 두고, 대신 A안·B안처럼 여러 구성을
   이름 붙여 저장해 두었다가 언제든 현재 구성으로 불러올 수 있게 합니다. */
export const PRESET_LIMIT = 10;
export const supportPlanPresetKey = sid => `kd_susi_support_plan_presets_v1:${String(sid || "staff")}`;
function presetValue(value) {
  if (!value || !Array.isArray(value.presets)) throw new Error("프리셋 목록 형식을 확인할 수 없습니다. 새로고침 후 다시 시도해주세요.");
  return value;
}
export async function loadSupportPlanPresets(sid) {
  if (!String(sid || "").trim()) return [];
  return presetValue(await readStorage(supportPlanPresetKey(sid), { presets: [] }, { throwOnError: true })).presets;
}
export async function saveSupportPlanPreset(sid, name, items) {
  const label = String(name || "").trim().slice(0, 20);
  if (!String(sid || "").trim()) return { ok: false, error: "학생을 먼저 선택해주세요." };
  if (!label) return { ok: false, error: "프리셋 이름을 입력해주세요." };
  if (!items?.length) return { ok: false, error: "저장할 지원 구성이 없습니다." };
  const result = await updateStorage(supportPlanPresetKey(sid), { presets: [] }, stored => {
    const current = presetValue(stored).presets;
    const others = current.filter(preset => preset.name !== label);
    if (others.length >= PRESET_LIMIT) throw new Error(`프리셋은 ${PRESET_LIMIT}개까지 저장할 수 있습니다. 먼저 하나를 삭제해주세요.`);
    const preset = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: label, items: items.map(item => ({ ...item })), savedAt: new Date().toISOString() };
    return { ...stored, presets: [...others, preset], updatedAt: new Date().toISOString() };
  });
  return result.ok ? { ok: true, presets: result.value.presets } : result;
}
export async function deleteSupportPlanPreset(sid, id) {
  const result = await updateStorage(supportPlanPresetKey(sid), { presets: [] }, stored => ({ ...stored, presets: presetValue(stored).presets.filter(preset => preset.id !== id), updatedAt: new Date().toISOString() }));
  return result.ok ? { ok: true, presets: result.value.presets } : result;
}
export async function applySupportPlanPreset(sid, preset) {
  if (!String(sid || "").trim()) return { ok: false, error: "학생을 먼저 선택해주세요." };
  const items = (preset?.items || []).slice(0, 6);
  const result = await updateStorage(supportPlanStorageKey(sid), { items: [] }, stored => ({ ...listValue(stored), items, updatedAt: new Date().toISOString() }));
  if (!result.ok) return result;
  notifySupportPlanChanged(sid);
  return { ok: true, items: result.value.items };
}
