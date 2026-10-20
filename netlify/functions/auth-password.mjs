// POST /api/auth/password  { session, current, next } — 내 비밀번호 바꾸기
import { checkLogin } from "../lib/authCore.mjs";
import { handle, readJson, json, loadPasswordHash, storePasswordHash, HttpError, admin } from "../lib/kdServer.mjs";
import { requireSession } from "../lib/session.mjs";
import { HASHED_PW } from "../../src/accountSecret.js";

export default handle(async req => {
  const body = await readJson(req);
  const { kind, id, accounts } = await requireSession(body.session);
  const next = String(body.next || "");
  if (next.length < 4) throw new HttpError(400, "새 비밀번호는 4자 이상 입력해주세요.");
  if (next === HASHED_PW) throw new HttpError(400, "쓸 수 없는 비밀번호입니다.");
  const match = await checkLogin({ [kind]: accounts[kind] || [] }, id, String(body.current || ""), loadPasswordHash);
  if (!match || match.kind !== kind) throw new HttpError(401, "현재 비밀번호가 올바르지 않습니다.");
  // 새 암호 저장 → 공개 목록은 '암호화됨' 표시(지금 평문이면 바꾸고, 이미 표시면 그대로)
  await storePasswordHash(kind, id, next, { replaceVisible: false });
  if (match.via === "plain") {
    const { markHashed } = await import("../lib/authCore.mjs");
    const { db } = admin();
    const ref = db.collection("kd_timetable_kv").doc("kd_accounts");
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : null;
      if (!data || data.chunked || typeof data.value !== "string") return;
      const updated = markHashed(JSON.parse(data.value), kind, id, String(body.current));
      if (!updated) return;
      const value = JSON.stringify(updated);
      tx.set(ref, { value, chunked: false, byteLength: Buffer.byteLength(value), updatedAt: new Date().toISOString() });
    });
  }
  return json({ ok: true });
});

export const config = { path: "/api/auth/password" };
