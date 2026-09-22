import { readStorage } from "./storage.js";

const STORAGE_KEY = "kd_susi_navi_beta_v1";
const SCHEMA_VERSION = 1;

let betaCache = null;
let betaCachePromise = null;

function clampGrade(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.min(5, Math.max(1, Math.round(num * 100) / 100));
}

function legacyConvert(value) {
  const num = clampGrade(value);
  return num == null ? null : Math.round((2 * num - 1) * 100) / 100;
}

function nearestConversion(conversions, grade5) {
  const target = clampGrade(grade5);
  if (target == null || !conversions?.length) return null;
  let low = 0;
  let high = conversions.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const value = conversions[mid][0];
    if (value === target) return conversions[mid];
    if (value < target) low = mid + 1;
    else high = mid - 1;
  }
  const left = conversions[Math.max(0, high)];
  const right = conversions[Math.min(conversions.length - 1, low)];
  return Math.abs((left?.[0] ?? 99) - target) <= Math.abs((right?.[0] ?? 99) - target) ? left : right;
}

export function conversionDetails(data, method, group, grade5) {
  const input = clampGrade(grade5);
  if (input == null) return null;
  if (method === "legacy") return { input, value: legacyConvert(input), range: "", cumulative: "", sourceGrade: input };
  const row = nearestConversion(data?.conversions, input);
  if (!row) return null;
  const groupIndex = { 전교과: 2, 국수영사과: 4, 국수영과: 6, 국수영사: 8 }[group] ?? 2;
  return { input, value: row[groupIndex + 1], range: row[groupIndex], cumulative: row[1], sourceGrade: row[0] };
}

export async function loadSusiNaviBetaData(force = false) {
  if (!force && betaCache) return betaCache;
  if (!force && betaCachePromise) return betaCachePromise;
  betaCachePromise = readStorage(STORAGE_KEY, null, { throwOnError: true }).then(value => {
    betaCache = value?.schemaVersion === SCHEMA_VERSION ? value : null;
    betaCachePromise = null;
    return betaCache;
  }).catch(error => {
    betaCachePromise = null;
    throw error;
  });
  return betaCachePromise;
}

export async function loadSusiNaviBetaDataReliable(force = false, attempts = 2) {
  let lastError = null;
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    try {
      return await loadSusiNaviBetaData(force || attempt > 0);
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 450 * (attempt + 1)));
    }
  }
  throw lastError || new Error("수시 NAVI 자료를 불러오지 못했습니다.");
}

export function updateSusiNaviBetaCache(value) {
  betaCache = value;
  betaCachePromise = null;
}
