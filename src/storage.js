import { initializeApp } from "firebase/app";
import { initializeFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
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
const fileStorage = getStorage(app);
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

function safeFilePart(value) {
  return String(value || "file")
    .normalize("NFKC")
    .replace(/[^0-9A-Za-z가-힣._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100) || "file";
}

// 모집요강 PDF 본문은 Firestore 문서 용량 제한 때문에 Firebase Storage에 저장하고,
// Firestore에는 URL·대학명·파일명 등의 메타데이터만 저장합니다.
export async function uploadAdmissionPdf(file, university) {
  if (!file) throw new Error("PDF 파일을 선택해주세요.");
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (!isPdf) throw new Error("PDF 파일만 업로드할 수 있습니다.");
  if (file.size > 30 * 1024 * 1024) throw new Error("PDF 파일은 30MB 이하만 업로드할 수 있습니다.");

  const universityPart = safeFilePart(university || "대학");
  const filePart = safeFilePart(file.name || "모집요강.pdf");
  const path = `admission-guides/${universityPart}/${Date.now()}_${filePart}`;
  const target = storageRef(fileStorage, path);
  const snapshot = await uploadBytes(target, file, {
    contentType: "application/pdf",
    contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(file.name || "guide.pdf")}`,
    customMetadata: { university: String(university || "") },
  });
  const url = await getDownloadURL(snapshot.ref);
  return { path: snapshot.ref.fullPath, url, fileName: file.name, size: file.size };
}


// 선생님 ZONE의 수업자료 첨부파일을 Firebase Storage에 저장합니다.
// Firestore에는 게시글과 파일 메타데이터만 저장하여 문서 용량을 작게 유지합니다.
export async function uploadClassroomAttachment(file, meta = {}) {
  if (!file) throw new Error("첨부파일을 선택해주세요.");
  if (file.size > 30 * 1024 * 1024) throw new Error("첨부파일은 개별 30MB 이하만 업로드할 수 있습니다.");

  const scopePart = safeFilePart(meta.scopeKey || "학기");
  const subjectPart = safeFilePart(meta.subject || "수업자료");
  const targetPart = safeFilePart(meta.target || "전체");
  const filePart = safeFilePart(file.name || "첨부파일");
  const path = `classroom-materials/${scopePart}/${subjectPart}/${targetPart}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${filePart}`;
  const target = storageRef(fileStorage, path);
  const contentType = file.type || "application/octet-stream";
  const inline = contentType === "application/pdf" || contentType.startsWith("image/");
  const snapshot = await uploadBytes(target, file, {
    contentType,
    contentDisposition: `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name || "attachment")}`,
    customMetadata: {
      scopeKey: String(meta.scopeKey || ""),
      subject: String(meta.subject || ""),
      target: String(meta.target || ""),
      teacherName: String(meta.teacherName || ""),
    },
  });
  const url = await getDownloadURL(snapshot.ref);
  return {
    path: snapshot.ref.fullPath,
    url,
    fileName: file.name || "첨부파일",
    size: file.size || 0,
    contentType,
  };
}

export async function deleteClassroomAttachment(path) {
  if (!path) return { ok: true };
  try {
    await deleteObject(storageRef(fileStorage, path));
    return { ok: true };
  } catch (e) {
    if (e?.code === "storage/object-not-found") return { ok: true };
    return { ok: false, error: e?.code || e?.message || String(e) };
  }
}

export async function deleteAdmissionPdf(path) {
  if (!path) return { ok: true };
  try {
    await deleteObject(storageRef(fileStorage, path));
    return { ok: true };
  } catch (e) {
    // 이미 Storage에서 지워진 파일은 메타데이터 정리를 계속할 수 있도록 성공 처리합니다.
    if (e?.code === "storage/object-not-found") return { ok: true };
    const detail = e?.code || e?.message || String(e);
    return { ok: false, error: detail };
  }
}
