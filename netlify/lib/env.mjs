// 로그인 서버 환경변수 읽기: 실행 환경 → Netlify.env → 빌드 때 넣어 둔 값 순서
let buildEnv = {};
try { buildEnv = (await import("./buildEnv.generated.mjs")).default || {}; } catch { buildEnv = {}; }

function runtime(name) {
  const fromProcess = typeof process !== "undefined" ? process.env?.[name] : undefined;
  if (fromProcess) return fromProcess;
  try { return globalThis.Netlify?.env?.get?.(name) || ""; } catch { return ""; }
}
export function env(name) {
  return String(runtime(name) || buildEnv[name] || "").trim();
}
// 점검용: 어디서 읽었는지(값은 돌려주지 않음)
export function envSource(name) {
  if (runtime(name)) return "runtime";
  if (buildEnv[name]) return "build";
  return "";
}
