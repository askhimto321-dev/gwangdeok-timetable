// 관리자 › 백업·복원: 자료를 덮어쓸 때 자동으로 남는 이전 버전(최근 20개 + 30일간 하루 1개)을 보고,
// 내려받거나 그 시점으로 되돌립니다. '전체 내려받기'로 지금 자료를 한 파일로 따로 보관할 수 있습니다.
import React, { useEffect, useState } from "react";
import { Archive, Download, RotateCcw, Loader2 } from "lucide-react";
import { listBackupKeys, listBackups, readBackup, restoreBackup, readStorage } from "./storage.js";

// 자료 이름(저장 키) → 화면 이름
const KEY_LABELS = {
  kd_accounts: "계정(선생님·학생 로그인)",
  kd_roster: "학생 명단",
  kd_enroll: "이동수업 출석부(수강 명단)",
  kd_tt: "시간표",
  kd_meta: "시간표 설정",
  kd_teacher_grade_workspaces: "성적 산출 학교 공동본",
  kd_grades_semesters: "학기 성적",
  kd_grades_mocks: "모의고사 성적",
  kd_grades_admission_counseling: "상담 기록",
  kd_grades_counsel_surveys: "진학상담 사전 설문",
  kd_grades_admission_favorites: "관심 대학",
  kd_minimum_achievement_settings: "최성보 설정",
  kd_minimum_achievement_attendance: "최성보 출결",
  kd_notices: "공지",
  kd_materials: "수업 자료",
  kd_staff_notices: "교직원 공지",
  kd_academic_calendar: "학사일정",
  kd_grade_department_data: "학년부 자료",
};
// 전체 내려받기에 늘 넣는 주요 자료
const CORE_KEYS = Object.keys(KEY_LABELS);
const labelOf = key => KEY_LABELS[key] || (key.startsWith("kd_stamps__") ? `수업 포트폴리오 · ${key.slice(11).replace(/^(\d)-sem(\d)-/, "$1학년 $2학기 ")}` : key.replace(/^kd_/, ""));
const when = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); };
const sizeOf = bytes => (bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`);
const download = (name, value) => {
  const blob = new Blob([JSON.stringify(value, null, 1)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
};

export default function AdminBackup({ showToast }) {
  const [keys, setKeys] = useState(null);
  const [picked, setPicked] = useState("");
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    let alive = true;
    listBackupKeys().then(list => { if (alive) setKeys(Array.from(new Set([...list])).sort((a, b) => labelOf(a).localeCompare(labelOf(b), "ko"))); }).catch(() => alive && setKeys([]));
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!picked) { setItems(null); return undefined; }
    let alive = true;
    setItems(null);
    listBackups(picked).then(list => { if (alive) setItems(list); }).catch(() => alive && setItems([]));
    return () => { alive = false; };
  }, [picked]);

  const downloadAll = async () => {
    if (!window.confirm("지금 저장된 주요 자료를 한 파일(JSON)로 내려받을까요?\n학생 이름·성적·상담 기록·계정 정보가 들어 있으니 학교 컴퓨터의 안전한 곳에만 보관하세요.")) return;
    setBusy("all");
    try {
      const all = Array.from(new Set([...CORE_KEYS, ...(keys || [])]));
      const out = { exportedAt: new Date().toISOString(), site: "kdtime", data: {} };
      for (const key of all) { const value = await readStorage(key, undefined); if (value !== undefined) out.data[key] = value; }
      download(`kdtime-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}.json`, out);
      showToast?.(`${Object.keys(out.data).length}개 자료를 내려받았어요.`, "success");
    } catch (error) { showToast?.(`내려받지 못했어요. (${error?.message || "오류"})`, "error"); } finally { setBusy(""); }
  };
  const downloadOne = async entry => {
    setBusy(entry.id);
    try { download(`${picked}-${entry.at.slice(0, 16).replace(/[:T]/g, "")}.json`, await readBackup(picked, entry)); }
    catch (error) { showToast?.(`백업을 읽지 못했어요. (${error?.message || "오류"})`, "error"); } finally { setBusy(""); }
  };
  const restore = async entry => {
    if (!window.confirm(`'${labelOf(picked)}'을(를) ${when(entry.at)} 백업으로 되돌릴까요?\n지금 내용은 되돌리기 직전에 다시 백업됩니다.`)) return;
    if (!window.confirm("정말 되돌릴까요? 그 뒤에 다른 선생님이 저장한 내용도 이 시점으로 돌아갑니다.")) return;
    setBusy(entry.id);
    try {
      const result = await restoreBackup(picked, entry);
      if (result?.ok === false) throw new Error(result.error);
      showToast?.("되돌렸어요. 화면을 새로고침하면 반영돼요.", "success");
      setItems(await listBackups(picked));
    } catch (error) { showToast?.(`되돌리지 못했어요. (${error?.message || "오류"})`, "error"); } finally { setBusy(""); }
  };

  return <div className="kd-bk">
    <style>{BK_CSS}</style>
    <div className="kd-bk-head">
      <div><b><Archive size={16} aria-hidden="true" /> 백업·복원</b><span>자료를 바꿔 저장할 때마다 바로 전 내용이 자동으로 남아요(같은 자료는 30분에 한 번 · 최근 20개 + 30일간 하루 1개).</span></div>
      <button type="button" data-kdn-bare onClick={downloadAll} disabled={busy === "all"}>{busy === "all" ? <Loader2 size={14} className="spin" /> : <Download size={14} />}지금 전체 내려받기</button>
    </div>
    {keys == null ? <p className="kd-bk-note"><Loader2 size={14} className="spin" /> 백업 목록을 읽는 중…</p>
      : !keys.length ? <p className="kd-bk-note">아직 자동 백업이 없어요. 이 기능을 배포한 뒤 자료가 처음 바뀔 때부터 쌓입니다.</p>
      : <div className="kd-bk-body">
        <ul className="kd-bk-keys">{keys.map(key => <li key={key}><button type="button" data-kdn-bare className={picked === key ? "is-on" : ""} onClick={() => setPicked(key)}><b>{labelOf(key)}</b><small>{key}</small></button></li>)}</ul>
        <div className="kd-bk-list">
          {!picked ? <p className="kd-bk-note">왼쪽에서 자료를 고르세요.</p>
            : items == null ? <p className="kd-bk-note"><Loader2 size={14} className="spin" /> 읽는 중…</p>
            : !items.length ? <p className="kd-bk-note">백업이 없어요.</p>
            : <table><thead><tr><th>백업 시각</th><th>그때 자료가 저장된 시각</th><th>크기</th><th /></tr></thead>
              <tbody>{items.map(entry => <tr key={entry.id}><td><b>{when(entry.at)}</b></td><td>{entry.sourceAt ? when(entry.sourceAt) : "-"}</td><td>{sizeOf(entry.bytes || 0)}</td>
                <td className="act"><button type="button" data-kdn-bare onClick={() => downloadOne(entry)} disabled={!!busy}><Download size={13} />내려받기</button><button type="button" data-kdn-bare className="danger" onClick={() => restore(entry)} disabled={!!busy}>{busy === entry.id ? <Loader2 size={13} className="spin" /> : <RotateCcw size={13} />}이 시점으로 되돌리기</button></td></tr>)}</tbody></table>}
        </div>
      </div>}
  </div>;
}

const BK_CSS = `
.kd-bk{display:grid;gap:14px}
.kd-bk-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 16px;border:1px solid var(--kdn-line,#dfe2e8);border-radius:16px;background:var(--kdn-surface,#fff)}
.kd-bk-head>div{display:grid;gap:4px;flex:1 1 320px}
.kd-bk-head b{display:inline-flex;align-items:center;gap:6px;font-size:16px;font-weight:900;color:var(--kdn-ink,#1f2430)}
.kd-bk-head span{font-size:13px;color:var(--kdn-muted,#5d6574)}
.kd-bk-head button,.kd-bk-list td.act button{display:inline-flex;align-items:center;gap:5px;height:34px;padding:0 13px;border:1px solid var(--kdn-control-line,#cfd5df);border-radius:10px;background:var(--kdn-surface-2,#f6f8fb);color:var(--kdn-ink,#1f2430);font:inherit;font-size:13px;font-weight:800;cursor:pointer}
.kd-bk-list td.act button.danger{border-color:#f3b8a0;color:#b4410f}
.kd-bk-body{display:grid;grid-template-columns:260px 1fr;gap:14px;align-items:start}
.kd-bk-keys{list-style:none;margin:0;padding:6px;display:grid;gap:2px;border:1px solid var(--kdn-line,#dfe2e8);border-radius:14px;background:var(--kdn-surface,#fff)}
.kd-bk-keys button{width:100%;display:grid;gap:1px;padding:8px 10px;border:0;border-radius:9px;background:transparent;text-align:left;font:inherit;cursor:pointer;color:var(--kdn-ink,#1f2430)}
.kd-bk-keys button.is-on{background:var(--kdn-accent-soft,#fff1e8)}
.kd-bk-keys b{font-size:13.5px;font-weight:850}.kd-bk-keys small{font-size:11px;color:var(--kdn-muted,#5d6574)}
.kd-bk-list{border:1px solid var(--kdn-line,#dfe2e8);border-radius:14px;background:var(--kdn-surface,#fff);overflow:auto}
.kd-bk-list table{width:100%;border-collapse:collapse;font-size:13.5px}
.kd-bk-list th,.kd-bk-list td{padding:10px 12px;border-bottom:1px solid var(--kdn-line,#dfe2e8);text-align:center;white-space:nowrap}
.kd-bk-list th{font-size:12.5px;color:var(--kdn-muted,#5d6574);background:var(--kdn-surface-2,#f6f8fb)}
.kd-bk-list td.act{display:flex;gap:6px;justify-content:flex-end}
.kd-bk-note{display:flex;align-items:center;gap:6px;margin:0;padding:14px;font-size:13px;color:var(--kdn-muted,#5d6574)}
@media (max-width:760px){.kd-bk-body{grid-template-columns:1fr}}
`;
