import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { firebaseConfig } from "./firebaseConfig.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
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
