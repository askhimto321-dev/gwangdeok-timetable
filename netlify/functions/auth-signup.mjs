// POST /api/auth/signup  { entry, pw } — 선생님 가입 신청(로그인 전 화면).
// 화면이 직접 계정 목록에 쓰지 않도록 서버가 받습니다. 비밀번호는 암호로만 보관하고,
// 신청서는 관리자 승인 화면이 읽는 별도 목록(kd_teacher_signups)에 넣습니다.
import { handle, readJson, json, admin, readAccounts, storePasswordHash, HttpError } from "../lib/kdServer.mjs";
import { HASHED_PW, LOGIN_KINDS } from "../lib/authCore.mjs";

const KV = "kd_timetable_kv";
const DOC = "kd_teacher_signups";
const MAX_PENDING = 200;
const grades = list => (Array.isArray(list) ? list.map(String).filter(g => ["1", "2", "3"].includes(g)) : []);
const text = (value, max = 40) => String(value ?? "").trim().slice(0, max);

export default handle(async req => {
  const body = await readJson(req);
  const raw = body.entry || {};
  const id = text(raw.id, 40);
  const name = text(raw.name, 30);
  const pw = String(body.pw || "");
  if (!id || !name || !pw) throw new HttpError(400, "이름·아이디·비밀번호를 입력해주세요.");
  if (!/^\S{2,40}$/.test(id)) throw new HttpError(400, "아이디는 띄어쓰기 없이 2자 이상 입력해주세요.");
  if (pw.length < 4 || pw === HASHED_PW) throw new HttpError(400, "비밀번호는 4자 이상 입력해주세요.");
  const accounts = await readAccounts();
  if ([...LOGIN_KINDS, "teacherPending"].some(kind => (accounts?.[kind] || []).some(entry => String(entry?.id ?? "") === id))) throw new HttpError(409, "이미 사용 중인 아이디입니다.");
  const entry = {
    id, name, pw: HASHED_PW,
    homeroomClass: text(raw.homeroomClass, 4),
    teacherRole: ["homeroom", "gradeHead", "other"].includes(raw.teacherRole) ? raw.teacherRole : "other",
    roleGrade: grades([raw.roleGrade])[0] || "",
    gradeAccessGrades: grades(raw.gradeAccessGrades),
    timetableAccessGrades: grades(raw.timetableAccessGrades),
    assignments: (Array.isArray(raw.assignments) ? raw.assignments : []).slice(0, 20).map(a => ({ kind: a?.kind === "common" ? "common" : "elective", subject: text(a?.subject, 40), targets: text(a?.targets, 60) || "전체", ...(a?.grade ? { grade: grades([a.grade])[0] || "" } : {}), ...(a?.semester ? { semester: a.semester === "sem2" ? "sem2" : "sem1" } : {}) })).filter(a => a.subject),
    requestedAt: new Date().toISOString(),
  };
  const { db } = admin();
  const ref = db.collection(KV).doc(DOC);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const list = snap.exists ? JSON.parse(snap.data()?.value || "[]") : [];
    if (list.some(item => item?.id === id)) throw new HttpError(409, "이미 신청한 아이디입니다. 관리자 승인을 기다려주세요.");
    if (list.length >= MAX_PENDING) throw new HttpError(429, "가입 신청이 많이 밀려 있어요. 관리자에게 문의해주세요.");
    const value = JSON.stringify([...list, entry]);
    tx.set(ref, { value, chunked: false, byteLength: Buffer.byteLength(value), updatedAt: new Date().toISOString() });
  });
  await storePasswordHash("teacher", id, pw, { replaceVisible: false });
  return json({ ok: true });
});

export const config = { path: "/api/auth/signup" };
