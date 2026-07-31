import { initializeApp } from "firebase/app";
import { initializeFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { firebaseConfig } from "./firebaseConfig.js";

const app = initializeApp(firebaseConfig);
// experimentalAutoDetectLongPolling: falls back to HTTPS long-polling when the
// network/firewall blocks Firestore's normal streaming connection (common on
// school/corporate networks). This fixes "client is offline" errors.
// NOTE: local cache/persistence is intentionally NOT enabled here. With it on,
// writes can appear to "succeed" locally (queued) even when they never reach
// the server, which was masking real failures. Keeping this online-only makes
// success/failure messages trustworthy: they reflect the actual server state.
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
const COLLECTION = "kd_timetable_kv";

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} 응답 없음 (연결 시간 초과)`)), ms)),
  ]);
}

export async function readStorage(key, fallback) {
  try {
    const snap = await withTimeout(getDoc(doc(db, COLLECTION, key)), 15000, "읽기");
    if (!snap.exists()) return fallback;
    const data = snap.data();
    return data.value !== undefined ? JSON.parse(data.value) : fallback;
  } catch (e) {
    console.error("storage read failed", key, e);
    return fallback;
  }
}

export async function writeStorage(key, value) {
  try {
    await withTimeout(setDoc(doc(db, COLLECTION, key), { value: JSON.stringify(value) }), 15000, "저장");
    return { ok: true };
  } catch (e) {
    console.error("storage write failed", key, e);
    const detail = e && e.code ? `${e.code}` : (e && e.message ? e.message : String(e));
    return { ok: false, error: detail };
  }
}
