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
    anonymousAuthPromise = signInAnonymously(auth)
      .then(result => result.user)
      .catch(error => {
        // 공개 Storage 규칙을 사용하는 기존 설치도 동작해야 하므로 인증 실패 자체로 업로드를 막지는 않습니다.
        console.warn("anonymous auth unavailable", error?.code || error?.message || error);
        return null;
      });
  }
  return anonymousAuthPromise;
}

function uploadResumableWithTimeout(target, file, metadata, timeoutMs = STORAGE_UPLOAD_TIMEOUT_MS) {
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
    task.on("state_changed", () => resetTimer(), error => {
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

async function uploadFile(path, file, metadata) {
  await ensureStorageIdentity();
  const target = storageRef(fileStorage, path);
  const snapshot = await uploadResumableWithTimeout(target, file, metadata);
  const url = await withTimeout(getDownloadURL(snapshot.ref), 30000, "다운로드 주소 발급");
  return { snapshot, url };
}

export async function diagnoseStorageConnection() {
  const body = new Blob([`storage test ${new Date().toISOString()}`], { type: "text/plain" });
  const file = new File([body], "storage-connection-test.txt", { type: "text/plain" });
  const path = `diagnostics/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.txt`;
  try {
    const { snapshot, url } = await uploadFile(path, file, { contentType: "text/plain", cacheControl: "no-store" });
    await deleteObject(snapshot.ref).catch(() => null);
    return { ok: true, url, authenticated: !!auth.currentUser, bucket: firebaseConfig.storageBucket };
  } catch (error) {
    return {
      ok: false,
      code: error?.code || "",
      error: error?.message || String(error),
      authenticated: !!auth.currentUser,
      bucket: firebaseConfig.storageBucket,
    };
  }
}

// 모집요강·교과 반영표 파일은 Firebase Storage에 저장하고,
// Firestore에는 URL·대학명·문서 유형 등의 작은 메타데이터만 저장합니다.
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
  try {
    const { snapshot, url } = await uploadFile(path, file, {
      contentType,
      contentDisposition: `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name || "document")}`,
      customMetadata: { university: String(university || ""), documentType },
    });
    return { path: snapshot.ref.fullPath, url, fileName: file.name, size: file.size, contentType, documentType, storageMode: "firebase-storage" };
  } catch (error) {
    if (options.allowInlineFallback !== false && file.size <= 6 * 1024 * 1024) {
      const url = await fileToDataUrl(file);
      return {
        path: "",
        url,
        fileName: file.name,
        size: file.size,
        contentType,
        documentType,
        storageMode: "firestore-inline",
        storageWarning: error?.code || error?.message || String(error),
      };
    }
    const detail = error?.code || error?.message || String(error);
    throw new Error(`Firebase Storage 업로드 실패 (${detail}). 개별 6MB 이하 자료는 자동 대체 저장할 수 있지만 ZIP 일괄 업로드 또는 더 큰 파일은 Storage 설정이 필요합니다.`);
  }
}

export async function uploadAdmissionPdf(file, university) {
  return uploadAdmissionDocument(file, university, "guide");
}

// 선생님 ZONE 공지 게시글의 첨부파일을 Firebase Storage에 저장합니다.
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
  } catch (error) {
    // Storage가 아직 활성화되지 않았거나 Anonymous Auth 규칙이 준비되지 않은 학교에서도
    // 작은 수업자료는 공지 데이터와 함께 Firestore 분할 저장으로 보존합니다.
    // 대용량 파일은 Firestore 읽기 비용과 초기 로딩 부담이 커지므로 6MB까지만 대체 저장합니다.
    if (file.size <= 6 * 1024 * 1024) {
      const url = await fileToDataUrl(file);
      return {
        path: "",
        url,
        fileName: file.name || "첨부파일",
        size: file.size || 0,
        contentType,
        storageMode: "firestore-inline",
        download: true,
        storageWarning: error?.code || error?.message || String(error),
      };
    }
    const detail = error?.code || error?.message || String(error);
    throw new Error(`Firebase Storage 업로드 실패 (${detail}). 6MB 이하 파일은 자동 대체 저장되지만, 이 파일은 더 큽니다. 관리자 화면의 저장소 연결 진단과 Firebase Anonymous Authentication·Storage 규칙을 확인해주세요.`);
  }
}

export async function deleteClassroomAttachment(path) {
  if (!path) return { ok: true };
  try {
    await deleteObject(storageRef(fileStorage, path));
    return { ok: true };
  } catch (error) {
    if (error?.code === "storage/object-not-found") return { ok: true };
    return { ok: false, error: error?.code || error?.message || String(error) };
  }
}

export async function deleteAdmissionPdf(path) {
  if (!path) return { ok: true };
  try {
    await deleteObject(storageRef(fileStorage, path));
    return { ok: true };
  } catch (error) {
    if (error?.code === "storage/object-not-found") return { ok: true };
    return { ok: false, error: error?.code || error?.message || String(error) };
  }
}
