import { initializeApp } from "firebase/app";
import { initializeFirestore, doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { getStorage, ref as storageRef, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { getAuth, signInAnonymously } from "firebase/auth";
import { firebaseConfig } from "./firebaseConfig.js";

const app = initializeApp(firebaseConfig);
// 학교·기관 네트워크에서 Firestore 스트리밍 연결이 막히는 경우를 대비해
// HTTPS long-polling을 자동 감지합니다. 로컬 영속 캐시는 사용하지 않아
// 화면의 저장 성공 메시지가 실제 서버 저장 성공을 의미하도록 합니다.
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
const fileStorage = getStorage(app);
const admissionStorageInstances = new Map();
let preferredAdmissionBucket = String(firebaseConfig.storageBucket || "").replace(/^gs:\/\//, "");

function normalizeBucketName(value) {
  return String(value || "").trim().replace(/^gs:\/\//, "").replace(/\/$/, "");
}

function admissionBucketCandidates() {
  const projectId = String(firebaseConfig.projectId || "").trim();
  return Array.from(new Set([
    normalizeBucketName(firebaseConfig.storageBucket),
    projectId ? `${projectId}.firebasestorage.app` : "",
    projectId ? `${projectId}.appspot.com` : "",
  ].filter(Boolean)));
}

function getAdmissionStorage(bucketName = preferredAdmissionBucket) {
  const bucket = normalizeBucketName(bucketName) || normalizeBucketName(firebaseConfig.storageBucket);
  if (!admissionStorageInstances.has(bucket)) {
    admissionStorageInstances.set(bucket, getStorage(app, `gs://${bucket}`));
  }
  return admissionStorageInstances.get(bucket);
}

const auth = getAuth(app);
const COLLECTION = "kd_timetable_kv";

const DIRECT_VALUE_LIMIT_BYTES = 650 * 1024;
const CHUNK_RAW_BYTES = 420 * 1024;
const STORAGE_UPLOAD_TIMEOUT_MS = 120000;
let anonymousAuthPromise = null;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} 응답 없음 (연결 시간 초과)`)), ms)),
  ]);
}

function utf8Bytes(text) {
  return new TextEncoder().encode(String(text || ""));
}

function bytesToBase64(bytes) {
  let binary = "";
  const block = 0x8000;
  for (let index = 0; index < bytes.length; index += block) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + block, bytes.length)));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function chunkDocumentId(key, batchId, index) {
  return `${key}__chunk__${batchId}__${String(index).padStart(4, "0")}`;
}

async function readManifest(key) {
  const snap = await withTimeout(getDoc(doc(db, COLLECTION, key)), 20000, "읽기");
  return snap.exists() ? snap.data() : null;
}

async function removeChunkBatch(key, manifest) {
  if (!manifest?.chunked || !manifest?.batchId || !Number(manifest?.chunks)) return;
  const jobs = [];
  for (let index = 0; index < Number(manifest.chunks); index += 1) {
    jobs.push(deleteDoc(doc(db, COLLECTION, chunkDocumentId(key, manifest.batchId, index))).catch(() => null));
  }
  await Promise.all(jobs);
}

export async function readStorage(key, fallback) {
  try {
    const data = await readManifest(key);
    if (!data) return fallback;
    if (!data.chunked) return data.value !== undefined ? JSON.parse(data.value) : fallback;

    const chunkCount = Number(data.chunks || 0);
    if (!chunkCount || !data.batchId) return fallback;
    const snaps = await withTimeout(Promise.all(Array.from({ length: chunkCount }, (_, index) => (
      getDoc(doc(db, COLLECTION, chunkDocumentId(key, data.batchId, index)))
    ))), Math.max(30000, chunkCount * 7000), "분할 데이터 읽기");
    const parts = snaps.map((snap, index) => {
      if (!snap.exists()) throw new Error(`분할 데이터 ${index + 1}/${chunkCount} 누락`);
      return base64ToBytes(snap.data()?.data || "");
    });
    const totalLength = parts.reduce((sum, bytes) => sum + bytes.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    parts.forEach(bytes => { merged.set(bytes, offset); offset += bytes.length; });
    return JSON.parse(new TextDecoder().decode(merged));
  } catch (error) {
    console.error("storage read failed", key, error);
    return fallback;
  }
}

export async function writeStorage(key, value) {
  let previousManifest = null;
  try {
    const serialized = JSON.stringify(value);
    const bytes = utf8Bytes(serialized);
    previousManifest = await readManifest(key).catch(() => null);

    if (bytes.length <= DIRECT_VALUE_LIMIT_BYTES) {
      await withTimeout(setDoc(doc(db, COLLECTION, key), {
        value: serialized,
        chunked: false,
        byteLength: bytes.length,
        updatedAt: new Date().toISOString(),
      }), 30000, "저장");
      await removeChunkBatch(key, previousManifest);
      return { ok: true, mode: "direct", bytes: bytes.length };
    }

    const batchId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const chunks = [];
    for (let offset = 0; offset < bytes.length; offset += CHUNK_RAW_BYTES) {
      chunks.push(bytes.subarray(offset, Math.min(offset + CHUNK_RAW_BYTES, bytes.length)));
    }

    // 새 청크를 먼저 모두 저장한 뒤 마지막에 원본 키의 manifest를 교체합니다.
    // 중간 실패 시 기존 데이터가 그대로 남아 있어 대용량 성적 업로드가 원자적으로 동작합니다.
    const concurrency = 3;
    for (let start = 0; start < chunks.length; start += concurrency) {
      await Promise.all(chunks.slice(start, start + concurrency).map((chunk, localIndex) => {
        const index = start + localIndex;
        return withTimeout(setDoc(doc(db, COLLECTION, chunkDocumentId(key, batchId, index)), {
          data: bytesToBase64(chunk),
          index,
          batchId,
          key,
        }), 45000, `분할 저장 ${index + 1}/${chunks.length}`);
      }));
    }

    await withTimeout(setDoc(doc(db, COLLECTION, key), {
      chunked: true,
      encoding: "base64-utf8",
      chunks: chunks.length,
      batchId,
      byteLength: bytes.length,
      updatedAt: new Date().toISOString(),
    }), 30000, "분할 데이터 목록 저장");
    await removeChunkBatch(key, previousManifest);
    return { ok: true, mode: "chunked", bytes: bytes.length, chunks: chunks.length };
  } catch (error) {
    console.error("storage write failed", key, error);
    const detail = error?.code || error?.message || String(error);
    return { ok: false, error: detail };
  }
}

function safeFilePart(value) {
  return String(value || "file")
    .normalize("NFKC")
    .replace(/[^0-9A-Za-z가-힣._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100) || "file";
}


function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("첨부파일을 브라우저에서 읽지 못했습니다."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function attachmentContentType(file) {
  const supplied = String(file?.type || "").trim();
  if (supplied && supplied !== "application/octet-stream") return supplied;
  const name = String(file?.name || "").toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".hwp")) return "application/x-hwp";
  if (name.endsWith(".hwpx")) return "application/vnd.hancom.hwpx";
  if (name.endsWith(".doc")) return "application/msword";
  if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (name.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
  if (name.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (name.endsWith(".xls")) return "application/vnd.ms-excel";
  if (name.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (name.endsWith(".zip")) return "application/zip";
  if (/\.(png)$/i.test(name)) return "image/png";
  if (/\.(jpe?g)$/i.test(name)) return "image/jpeg";
  if (/\.(webp)$/i.test(name)) return "image/webp";
  return supplied || "application/octet-stream";
}

async function ensureStorageIdentity() {
  if (auth.currentUser) return auth.currentUser;
  if (!anonymousAuthPromise) {
    anonymousAuthPromise = withTimeout(signInAnonymously(auth), 8000, "익명 인증")
      .then(result => result.user)
      .catch(error => {
        // 공개 Storage 규칙을 사용하는 기존 설치도 동작해야 하므로 인증 실패 자체로 업로드를 막지는 않습니다.
        console.warn("anonymous auth unavailable", error?.code || error?.message || error);
        return null;
      });
  }
  return anonymousAuthPromise;
}

function uploadResumableWithTimeout(target, file, metadata, timeoutMs = STORAGE_UPLOAD_TIMEOUT_MS, onProgress = null) {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(target, file, metadata);
    let settled = false;
    let timer = null;
    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { task.cancel(); } catch {}
        const error = new Error("첨부파일 업로드 응답 없음 (연결 시간 초과)");
        error.code = "storage/retry-limit-exceeded";
        reject(error);
      }, timeoutMs);
    };
    resetTimer();
    task.on("state_changed", snapshot => {
      resetTimer();
      if (typeof onProgress === "function") {
        const totalBytes = Number(snapshot.totalBytes || file?.size || 0);
        const bytesTransferred = Number(snapshot.bytesTransferred || 0);
        onProgress({
          phase: "firebase-storage",
          bytesTransferred,
          totalBytes,
          percent: totalBytes ? Math.round((bytesTransferred / totalBytes) * 100) : 0,
        });
      }
    }, error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    }, () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(task.snapshot);
    });
  });
}

async function uploadFile(path, file, metadata, timeoutMs = STORAGE_UPLOAD_TIMEOUT_MS, options = {}) {
  await ensureStorageIdentity();
  const storageInstance = options.storageInstance || fileStorage;
  const target = storageRef(storageInstance, path);
  const snapshot = await uploadResumableWithTimeout(target, file, metadata, timeoutMs, options.onProgress);
  const url = await withTimeout(getDownloadURL(snapshot.ref), 30000, "다운로드 주소 발급");
  return { snapshot, url };
}

async function probeAdmissionBucket(bucket, file, timeoutMs) {
  const path = `diagnostics/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.txt`;
  try {
    const storageInstance = getAdmissionStorage(bucket);
    const { snapshot, url } = await uploadFile(path, file, { contentType: "text/plain", cacheControl: "no-store" }, timeoutMs, { storageInstance });
    await deleteObject(snapshot.ref).catch(() => null);
    return { ok: true, bucket, url };
  } catch (error) {
    return { ok: false, bucket, code: error?.code || "", error: error?.message || String(error) };
  }
}

export async function diagnoseStorageConnection(options = {}) {
  const body = new Blob([`storage test ${new Date().toISOString()}`], { type: "text/plain" });
  const file = new File([body], "storage-connection-test.txt", { type: "text/plain" });
  const timeoutMs = Number(options.timeoutMs || 7000);
  await ensureStorageIdentity().catch(() => null);
  const attempts = await Promise.all(admissionBucketCandidates().map(bucket => probeAdmissionBucket(bucket, file, timeoutMs)));
  const success = attempts.find(item => item.ok);
  if (success) {
    preferredAdmissionBucket = success.bucket;
    return {
      ok: true,
      url: success.url,
      authenticated: !!auth.currentUser,
      bucket: success.bucket,
      configuredBucket: normalizeBucketName(firebaseConfig.storageBucket),
      attempts,
    };
  }
  const first = attempts[0] || {};
  return {
    ok: false,
    code: first.code || "storage/unavailable",
    error: attempts.map(item => `${item.bucket}: ${item.code || item.error || "연결 실패"}`).join(" / "),
    authenticated: !!auth.currentUser,
    bucket: normalizeBucketName(firebaseConfig.storageBucket),
    configuredBucket: normalizeBucketName(firebaseConfig.storageBucket),
    attempts,
  };
}

const ADMISSION_FIRESTORE_FILE_LIMIT_BYTES = 30 * 1024 * 1024;

async function writeBinaryAttachment(key, file, metadata = {}, options = {}) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const previousManifest = await readManifest(key).catch(() => null);
  const batchId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK_RAW_BYTES) {
    chunks.push(bytes.subarray(offset, Math.min(offset + CHUNK_RAW_BYTES, bytes.length)));
  }
  const concurrency = Math.max(1, Math.min(2, Number(options.concurrency || 1)));
  if (typeof options.onProgress === "function") options.onProgress({ phase: "firestore-binary", completedChunks: 0, totalChunks: chunks.length, percent: 0 });
  try {
    for (let start = 0; start < chunks.length; start += concurrency) {
      await Promise.all(chunks.slice(start, start + concurrency).map((chunk, localIndex) => {
        const index = start + localIndex;
        return withTimeout(setDoc(doc(db, COLLECTION, chunkDocumentId(key, batchId, index)), {
          data: bytesToBase64(chunk),
          index,
          batchId,
          key,
          binary: true,
        }), 45000, `파일 분할 저장 ${index + 1}/${chunks.length}`);
      }));
      if (typeof options.onProgress === "function") {
        const completedChunks = Math.min(start + concurrency, chunks.length);
        options.onProgress({
          phase: "firestore-binary",
          completedChunks,
          totalChunks: chunks.length,
          percent: chunks.length ? Math.round((completedChunks / chunks.length) * 100) : 100,
        });
      }
    }
    await withTimeout(setDoc(doc(db, COLLECTION, key), {
      binary: true,
      chunked: true,
      encoding: "base64-binary",
      chunks: chunks.length,
      batchId,
      byteLength: bytes.length,
      fileName: file.name || "document.pdf",
      size: file.size || bytes.length,
      contentType: metadata.contentType || attachmentContentType(file),
      metadata,
      updatedAt: new Date().toISOString(),
    }), 30000, "파일 목록 저장");
    await removeChunkBatch(key, previousManifest);
    return { ok: true, chunks: chunks.length, bytes: bytes.length };
  } catch (error) {
    await removeChunkBatch(key, { chunked: true, batchId, chunks: chunks.length }).catch(() => null);
    throw error;
  }
}

async function readBinaryAttachment(key) {
  const manifest = await readManifest(key);
  if (!manifest?.binary || !manifest?.chunked || !manifest?.batchId || !Number(manifest?.chunks)) {
    throw new Error("저장된 파일 정보를 찾지 못했습니다.");
  }
  const chunkCount = Number(manifest.chunks);
  const snaps = await withTimeout(Promise.all(Array.from({ length: chunkCount }, (_, index) => (
    getDoc(doc(db, COLLECTION, chunkDocumentId(key, manifest.batchId, index)))
  ))), Math.max(30000, chunkCount * 7000), "저장 파일 읽기");
  const parts = snaps.map((snap, index) => {
    if (!snap.exists()) throw new Error(`저장 파일 ${index + 1}/${chunkCount} 누락`);
    return base64ToBytes(snap.data()?.data || "");
  });
  const totalLength = parts.reduce((sum, bytes) => sum + bytes.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  parts.forEach(bytes => { merged.set(bytes, offset); offset += bytes.length; });
  return new Blob([merged], { type: manifest.contentType || "application/pdf" });
}

async function saveAdmissionDocumentInFirestore(file, university, documentType, storageWarning = "", options = {}) {
  if (file.size > ADMISSION_FIRESTORE_FILE_LIMIT_BYTES) {
    throw new Error("Firebase Storage 연결이 되지 않아 Firestore 대체 저장을 시도했지만, 파일이 30MB를 초과합니다.");
  }
  const dataKey = `kd_admission_document_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  const contentType = attachmentContentType(file);
  await writeBinaryAttachment(dataKey, file, {
    university: String(university || ""),
    documentType,
    contentType,
    storageWarning,
  }, { onProgress: options.onProgress, concurrency: options.firestoreConcurrency || 1 });
  return {
    path: "",
    dataKey,
    url: "",
    fileName: file.name,
    size: file.size,
    contentType,
    documentType,
    storageMode: "firestore-binary",
    storageWarning,
  };
}

export async function readAdmissionDocument(dataKey) {
  return readBinaryAttachment(dataKey);
}

async function diagnoseFirestoreFileFallback(options = {}) {
  const timeoutMs = Number(options.timeoutMs || 12000);
  const testFile = new File([new Uint8Array(2048)], "firestore-file-test.pdf", { type: "application/pdf" });
  const dataKey = `kd_admission_document_diagnostic_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  try {
    await withTimeout(writeBinaryAttachment(dataKey, testFile, { diagnostic: true, contentType: "application/pdf" }, { concurrency: 1 }), timeoutMs, "Firestore 파일 저장 진단");
    const manifest = await readManifest(dataKey).catch(() => null);
    await removeChunkBatch(dataKey, manifest).catch(() => null);
    await deleteDoc(doc(db, COLLECTION, dataKey)).catch(() => null);
    return { ok: true };
  } catch (error) {
    const manifest = await readManifest(dataKey).catch(() => null);
    await removeChunkBatch(dataKey, manifest).catch(() => null);
    await deleteDoc(doc(db, COLLECTION, dataKey)).catch(() => null);
    return { ok: false, code: error?.code || "", error: error?.message || String(error) };
  }
}

export async function diagnoseAdmissionFileBackends(options = {}) {
  const storageTimeoutMs = Number(options.storageTimeoutMs || 6000);
  const firestoreTimeoutMs = Number(options.firestoreTimeoutMs || 12000);
  const storagePromise = withTimeout(
    diagnoseStorageConnection({ timeoutMs: storageTimeoutMs }),
    storageTimeoutMs + 2500,
    "Storage 전체 진단",
  ).catch(error => ({ ok: false, code: error?.code || "storage/diagnostic-timeout", error: error?.message || String(error), bucket: normalizeBucketName(firebaseConfig.storageBucket), configuredBucket: normalizeBucketName(firebaseConfig.storageBucket), attempts: [] }));
  const firestorePromise = withTimeout(
    diagnoseFirestoreFileFallback({ timeoutMs: firestoreTimeoutMs }),
    firestoreTimeoutMs + 1500,
    "Firestore 파일 저장 전체 진단",
  ).catch(error => ({ ok: false, code: error?.code || "firestore/diagnostic-timeout", error: error?.message || String(error) }));
  const [storage, firestore] = await Promise.all([storagePromise, firestorePromise]);
  return {
    ok: !!(storage.ok || firestore.ok),
    storage,
    firestore,
    recommendedMode: storage.ok ? "firebase-storage" : (firestore.ok ? "firestore-binary" : "none"),
    selectedBucket: storage.ok ? storage.bucket : "",
  };
}

// 모집요강·교과 반영표는 Firebase Storage를 우선 사용하고,
// Storage가 차단된 학교 네트워크에서는 파일별 Firestore 분할 저장으로 자동 전환합니다.
export async function uploadAdmissionDocument(file, university, documentType = "guide", options = {}) {
  if (!file) throw new Error("파일을 선택해주세요.");
  const contentType = attachmentContentType(file);
  const name = String(file.name || "");
  const isPdf = contentType === "application/pdf" || /\.pdf$/i.test(name);
  const isImage = contentType.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(name);
  if (documentType === "guide" && !isPdf) throw new Error("모집요강은 PDF 파일만 업로드할 수 있습니다.");
  if (documentType === "reflection" && !isPdf && !isImage) throw new Error("반영표는 PDF 또는 PNG·JPG·WEBP 이미지만 업로드할 수 있습니다.");
  if (file.size > 30 * 1024 * 1024) throw new Error("파일은 개별 30MB 이하만 업로드할 수 있습니다.");

  const universityPart = safeFilePart(university || "대학");
  const typePart = documentType === "reflection" ? "reflection-tables" : "admission-guides";
  const filePart = safeFilePart(file.name || "자료");
  const path = `${typePart}/${universityPart}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${filePart}`;
  const inline = isPdf || isImage;
  const allowFirestoreFallback = options.allowFirestoreFallback !== false;
  if (options.forceFirestoreFallback) {
    try {
      return await saveAdmissionDocumentInFirestore(file, university, documentType, options.storageWarning || "Storage 사전 진단 실패", options);
    } catch (fallbackError) {
      const fallbackDetail = fallbackError?.code || fallbackError?.message || String(fallbackError);
      throw new Error(`파일 저장 실패 · 대상 경로 ${path} · Firestore 대체 저장 ${fallbackDetail}`);
    }
  }
  try {
    const bucket = normalizeBucketName(options.storageBucket || preferredAdmissionBucket || firebaseConfig.storageBucket);
    const storageInstance = getAdmissionStorage(bucket);
    const { snapshot, url } = await uploadFile(path, file, {
      contentType,
      contentDisposition: `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name || "document")}`,
      customMetadata: { university: String(university || ""), documentType },
    }, Number(options.storageTimeoutMs || STORAGE_UPLOAD_TIMEOUT_MS), { storageInstance, onProgress: options.onProgress });
    preferredAdmissionBucket = bucket;
    return { path: snapshot.ref.fullPath, url, fileName: file.name, size: file.size, contentType, documentType, storageMode: "firebase-storage", storageBucket: bucket };
  } catch (error) {
    const detail = error?.code || error?.message || String(error);
    if (allowFirestoreFallback) {
      try {
        return await saveAdmissionDocumentInFirestore(file, university, documentType, detail, options);
      } catch (fallbackError) {
        const fallbackDetail = fallbackError?.code || fallbackError?.message || String(fallbackError);
        throw new Error(`파일 저장 실패 · 대상 경로 ${path} · Firebase Storage ${detail} · Firestore 대체 저장 ${fallbackDetail}`);
      }
    }
    throw new Error(`Firebase Storage 업로드 실패 · 대상 경로 ${path} · ${detail}`);
  }
}

export async function uploadAdmissionPdf(file, university) {
  return uploadAdmissionDocument(file, university, "guide");
}

// 선생님 ZONE 공지 게시글의 첨부파일을 Firebase Storage에 저장합니다.
async function saveClassroomAttachmentInFirestore(file, contentType, storageWarning = "") {
  const dataUrl = await fileToDataUrl(file);
  const dataKey = `kd_classroom_attachment_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  const fallback = await writeStorage(dataKey, {
    dataUrl,
    fileName: file.name || "첨부파일",
    size: file.size || 0,
    contentType,
    createdAt: new Date().toISOString(),
  });
  if (!fallback?.ok) throw new Error(fallback?.error || "Firestore 첨부파일 저장 실패");
  return {
    path: "",
    dataKey,
    url: "",
    fileName: file.name || "첨부파일",
    size: file.size || 0,
    contentType,
    storageMode: "firestore-attachment",
    download: true,
    storageWarning,
  };
}

export async function uploadClassroomAttachment(file, meta = {}) {
  if (!file) throw new Error("첨부파일을 선택해주세요.");
  if (file.size > 30 * 1024 * 1024) throw new Error("첨부파일은 개별 30MB 이하만 업로드할 수 있습니다.");

  const scopePart = safeFilePart(meta.scopeKey || "학기");
  const subjectPart = safeFilePart(meta.subject || "공지자료");
  const targetPart = safeFilePart(meta.target || "전체");
  const filePart = safeFilePart(file.name || "첨부파일");
  const path = `classroom-materials/${scopePart}/${subjectPart}/${targetPart}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${filePart}`;
  const contentType = attachmentContentType(file);
  const inline = contentType === "application/pdf" || contentType.startsWith("image/");

  // 일반적인 HWP·HWPX·PDF 수업자료는 Storage 연결을 먼저 기다리지 않고
  // Firestore 분할 문서에 바로 저장합니다. 이 방식은 홈페이지 자체 로그인 환경에서도
  // 안정적으로 동작하며, 작은 파일이 업로드 로딩 상태에서 오래 멈추는 문제를 방지합니다.
  const directFirestoreLimit = 8 * 1024 * 1024;
  let firestoreError = null;
  if (file.size <= directFirestoreLimit) {
    try {
      return await saveClassroomAttachmentInFirestore(file, contentType);
    } catch (error) {
      firestoreError = error;
      console.warn("direct Firestore attachment save failed; trying Firebase Storage", error);
    }
  }

  try {
    const { snapshot, url } = await uploadFile(path, file, {
      contentType,
      contentDisposition: `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name || "attachment")}`,
      customMetadata: {
        scopeKey: String(meta.scopeKey || ""),
        subject: String(meta.subject || ""),
        target: String(meta.target || ""),
        teacherName: String(meta.teacherName || ""),
      },
    });
    return {
      path: snapshot.ref.fullPath,
      url,
      fileName: file.name || "첨부파일",
      size: file.size || 0,
      contentType,
      storageMode: "firebase-storage",
    };
  } catch (storageError) {
    // 8~10MB 파일은 Storage가 막힌 경우에 한해 Firestore 대체 저장을 마지막으로 시도합니다.
    if (file.size <= 10 * 1024 * 1024 && file.size > directFirestoreLimit) {
      try {
        return await saveClassroomAttachmentInFirestore(file, contentType, storageError?.code || storageError?.message || String(storageError));
      } catch (fallbackError) {
        firestoreError = fallbackError;
      }
    }
    const storageDetail = storageError?.code || storageError?.message || String(storageError);
    const firestoreDetail = firestoreError?.message || firestoreError || "시도하지 않음";
    throw new Error(`첨부 저장 실패: Firestore (${firestoreDetail}) / Firebase Storage (${storageDetail}). 관리자 화면의 첨부 연결 진단을 확인해주세요.`);
  }
}

export async function deleteClassroomAttachment(identifier) {
  if (!identifier) return { ok: true };
  if (String(identifier).startsWith("kd_classroom_attachment_")) {
    const result = await writeStorage(String(identifier), null);
    return result?.ok ? { ok: true } : { ok: false, error: result?.error || "대체 첨부파일 삭제 실패" };
  }
  try {
    await deleteObject(storageRef(fileStorage, identifier));
    return { ok: true };
  } catch (error) {
    if (error?.code === "storage/object-not-found") return { ok: true };
    return { ok: false, error: error?.code || error?.message || String(error) };
  }
}

export async function deleteAdmissionPdf(identifier, bucketName = "") {
  if (!identifier) return { ok: true };
  if (String(identifier).startsWith("kd_admission_document_")) {
    try {
      const manifest = await readManifest(String(identifier)).catch(() => null);
      await removeChunkBatch(String(identifier), manifest);
      await deleteDoc(doc(db, COLLECTION, String(identifier)));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.code || error?.message || String(error) };
    }
  }
  try {
    const targetStorage = bucketName ? getAdmissionStorage(bucketName) : getAdmissionStorage(firebaseConfig.storageBucket);
    await deleteObject(storageRef(targetStorage, identifier));
    return { ok: true };
  } catch (error) {
    if (error?.code === "storage/object-not-found") return { ok: true };
    return { ok: false, error: error?.code || error?.message || String(error) };
  }
}
