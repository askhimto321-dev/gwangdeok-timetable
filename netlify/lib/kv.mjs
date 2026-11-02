// 서버에서 앱 자료(kd_timetable_kv)를 읽고 쓰기 — 화면(storage.js)과 같은 저장 형식(직접 저장 또는 분할 저장)
import { admin } from "./kdServer.mjs";

const KV = "kd_timetable_kv";
const DIRECT_LIMIT = 650 * 1024;
const CHUNK_BYTES = 420 * 1024;
const chunkId = (key, batchId, index) => `${key}__chunk__${batchId}__${String(index).padStart(4, "0")}`;

export async function readKv(key, fallback = null) {
  const { db } = admin();
  const snap = await db.collection(KV).doc(key).get();
  if (!snap.exists) return fallback;
  const data = snap.data();
  if (!data.chunked) return JSON.parse(data.value || "null") ?? fallback;
  const parts = await Promise.all(Array.from({ length: Number(data.chunks) || 0 }, (_, index) => db.collection(KV).doc(chunkId(key, data.batchId, index)).get()));
  return JSON.parse(Buffer.concat(parts.map(part => Buffer.from(part.data()?.data || "", "base64"))).toString("utf8"));
}

// 새 내용을 다 쓴 뒤 목록(manifest)을 바꾸고, 그다음 예전 조각을 지웁니다(중간 실패 때 예전 자료 유지).
export async function writeKv(key, value) {
  const { db } = admin();
  const ref = db.collection(KV).doc(key);
  const before = await ref.get();
  const old = before.exists ? before.data() : null;
  const text = JSON.stringify(value);
  const bytes = Buffer.from(text, "utf8");
  const at = new Date().toISOString();
  if (bytes.length <= DIRECT_LIMIT) {
    await ref.set({ value: text, chunked: false, byteLength: bytes.length, updatedAt: at });
  } else {
    const batchId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const count = Math.ceil(bytes.length / CHUNK_BYTES);
    for (let index = 0; index < count; index += 1) {
      await db.collection(KV).doc(chunkId(key, batchId, index)).set({ data: bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES).toString("base64"), index, batchId, key });
    }
    await ref.set({ chunked: true, encoding: "base64-utf8", chunks: count, batchId, byteLength: bytes.length, updatedAt: at });
  }
  if (old?.chunked && old.batchId) {
    await Promise.all(Array.from({ length: Number(old.chunks) || 0 }, (_, index) => db.collection(KV).doc(chunkId(key, old.batchId, index)).delete().catch(() => null)));
  }
}
