// 새 버전이 배포되면 이전 화면이 불러오려던 코드 조각(assets/*.js) 이름이 바뀌어
// "Failed to fetch dynamically imported module" 오류가 납니다. 이 경우 한 번만 자동으로 새로고침해
// 최신 버전을 받습니다(15초 안에 반복되면 무한 새로고침을 막기 위해 멈추고 오류 화면을 보여 줍니다).
const KEY = "kd_chunk_reload_at";
export function isChunkLoadError(error) {
  const text = String(error?.message || error || "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading chunk [\w-]+ failed/i.test(text);
}
export function reloadForNewVersion() {
  if (typeof window === "undefined") return false;
  let last = 0;
  try { last = Number(window.sessionStorage.getItem(KEY) || 0); } catch { /* storage unavailable */ }
  if (Date.now() - last < 15000) return false;
  try { window.sessionStorage.setItem(KEY, String(Date.now())); } catch { /* storage unavailable */ }
  window.location.reload();
  return true;
}
export function installChunkReloadHandler() {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", event => { if (reloadForNewVersion()) event.preventDefault(); });
  window.addEventListener("unhandledrejection", event => { if (isChunkLoadError(event.reason)) reloadForNewVersion(); });
}
