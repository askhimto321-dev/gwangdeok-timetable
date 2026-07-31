import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  doc, getDoc, setDoc,
} from "firebase/firestore";
import { firebaseConfig } from "./firebaseConfig.js";

const app = initializeApp(firebaseConfig);
// experimentalAutoDetectLongPolling: falls back to HTTPS long-polling when the
// network/firewall blocks Firestore's normal streaming connection (common on
// school/corporate networks). This fixes "client is offline" errors.
// persistentLocalCache: caches data in the browser (IndexedDB) so repeat
// visits load instantly from cache while syncing with the server in the
// background, instead of waiting on a fresh network round-trip every time.
const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }),
});
const COLLECTION = "kd_timetable_kv";

export async function readStorage(key, fallback) {
  try {
    const snap = await getDoc(doc(db, COLLECTION, key));
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
    await setDoc(doc(db, COLLECTION, key), { value: JSON.stringify(value) });
    return true;
  } catch (e) {
    console.error("storage write failed", key, e);
    return false;
  }
}
