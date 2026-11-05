// 선생님 ZONE '업무 인수인계': 부서별 업무분장(담당 → 세부 업무)에서 업무를 골라
// 한눈 요약 · 타임라인(3월→2월) · 자료 · 코멘트를 남겨 다음 해 담당에게 넘깁니다.
// - 처음에는 읽기 화면, '고치기'를 눌러야 입력 칸이 나와요(한 화면에 글이 너무 많지 않게).
// - 보기·코멘트: 교직원 모두 / 고치기: 담당 선생님 · 함께 고칠 선생님 · 관리자 · 부서 계정 · 학년부장
// - 업무분장(부서·담당·세부 업무) 추가·삭제: 교직원 모두('업무 추가·삭제')
// - 나눠 맡는 업무(따라체험 1·2): 서로의 역할을 보여 주고, '타임라인 함께 쓰기'로 한 타임라인을 같이 써요.
// - 공유: 링크 복사(로그인하면 이 업무가 바로 열림), 글로 복사(메신저용)
import React from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowDown, ArrowUp, Check, CheckCircle2, Info, Sparkles, ChevronRight, ClipboardList, ClipboardPaste, Copy, ExternalLink, FileSpreadsheet, FileText, Film, FolderOpen, Globe, Link2, Loader2, MessageSquare, Palette, Paperclip, Pencil, Plus, Presentation, Search, Share2, Trash2, Users, Wand2, X } from "lucide-react";
import { readStorage, updateStorage, uploadClassroomAttachment } from "./storage.js";
import { HANDOVER_KEY, normalizeHandover, normalizeTask, emptyTask, newStep, newLink, newComment, groupSteps, linkKind, safeUrl, stepTemplate, taskProgress, SCHOOL_MONTHS, parseSheetRows, siblingDuties, dutyPartNo, taskStoreKey, mergeTasks, taskAsText, stepPeople, formatDetail } from "./handover.js";

const KIND_ICON = { sheet: FileSpreadsheet, doc: FileText, slide: Presentation, form: ClipboardList, drive: FolderOpen, design: Palette, video: Film, web: Globe };
const fmtAt = iso => { if (!iso) return ""; const d = new Date(iso); if (Number.isNaN(d.getTime())) return ""; return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
const fmtAtFull = iso => { if (!iso) return ""; const d = new Date(iso); if (Number.isNaN(d.getTime())) return ""; return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const LINK_PARAM = "handover";
const roleNo = (data, role) => role.title || `담당 ${data.roles.filter(r => r.deptId === role.deptId).findIndex(r => r.id === role.id) + 1}`;

async function openFile(file) {
  if (file.dataKey) {
    const stored = await readStorage(file.dataKey, null);
    if (!stored?.dataUrl) throw new Error("파일을 찾지 못했어요.");
    const a = document.createElement("a"); a.href = stored.dataUrl; a.download = file.fileName || stored.fileName || "첨부파일";
    document.body.appendChild(a); a.click(); a.remove(); return;
  }
  if (file.url) window.open(file.url, "_blank", "noopener,noreferrer");
}
async function copyText(text) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }

export default function Handover({ actor = null, accounts = null, canManage = false, canEditStructure = canManage, isTeacher = false, showToast = () => {} }) {
  const [data, setData] = React.useState(null);
  const [deptId, setDeptId] = React.useState("");
  const [dutyId, setDutyId] = React.useState("");
  const [mineOnly, setMineOnly] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [manage, setManage] = React.useState(false);
  const myId = String(actor?.id || "");

  React.useEffect(() => {
    let on = true;
    readStorage(HANDOVER_KEY, null).then(raw => {
      if (!on) return;
      const v = normalizeHandover(raw); setData(v);
      // 공유 링크(?handover=업무)로 들어오면 그 업무를 열어요
      let linked = "";
      try { linked = new URLSearchParams(window.location.search).get(LINK_PARAM) || ""; } catch { /* 주소 읽기 실패는 무시 */ }
      const hit = linked && v.roles.find(r => r.duties.some(d => d.id === linked));
      if (hit) { setDeptId(hit.deptId); setDutyId(linked); try { const u = new URL(window.location.href); u.searchParams.delete(LINK_PARAM); window.history.replaceState(window.history.state, "", u.toString()); } catch { /* 주소 정리는 편의 기능 */ } }
      else setDeptId(id => id || v.depts[0]?.id || "");
    }).catch(() => on && setData(normalizeHandover(null)));
    return () => { on = false; };
  }, []);
  const saveStructure = React.useCallback(async change => {
    const result = await updateStorage(HANDOVER_KEY, null, current => ({ ...change(normalizeHandover(current)), updatedAt: new Date().toISOString() }));
    if (result?.ok === false) { showToast("저장하지 못했어요. 잠시 뒤 다시 해 주세요.", "error"); return false; }
    setData(normalizeHandover(result?.value)); return true;
  }, [showToast]);
  const editDuty = React.useCallback((id, patch) => saveStructure(v => ({ ...v, roles: v.roles.map(r => ({ ...r, duties: r.duties.map(d => d.id === id ? { ...d, ...(typeof patch === "function" ? patch(d) : patch) } : d) })) })), [saveStructure]);
  const onMeta = React.useCallback((ids, meta) => saveStructure(v => ({ ...v, meta: { ...(v.meta || {}), ...Object.fromEntries(ids.map(id => [id, meta])) } })), [saveStructure]);

  if (!data) return <div className="kho"><style>{CSS}</style><p className="kho-loading"><Loader2 size={16} className="spin" /> 불러오는 중이에요.</p></div>;
  const dept = data.depts.find(d => d.id === deptId) || data.depts[0];
  const roles = data.roles.filter(r => r.deptId === dept?.id);
  const q = query.trim();
  const visibleRoles = roles.filter(r => !mineOnly || r.ownerId === myId || r.duties.some(d => d.editors.some(e => e.id === myId))).map(r => ({ ...r, duties: q ? r.duties.filter(d => d.text.includes(q)) : r.duties })).filter(r => !q || r.duties.length);
  const found = data.roles.flatMap(r => r.duties.map(d => ({ duty: d, role: r }))).find(x => x.duty.id === dutyId);
  const canEditDuty = (role, duty) => !!role && (canManage || (isTeacher && myId && (role.ownerId === myId || (duty?.editors || []).some(e => e.id === myId))));
  const teachers = (accounts?.teacher || []).filter(t => t?.id && t?.name);
  const open = id => { setDutyId(id); if (window.matchMedia?.("(max-width: 960px)").matches) window.scrollTo({ top: 0 }); };

  const claim = (role, on) => saveStructure(v => ({ ...v, roles: v.roles.map(r => r.id === role.id ? { ...r, ownerId: on ? myId : "", ownerName: on ? String(actor?.name || "") : "" } : r) }))
    .then(ok => ok && showToast(on ? "내 담당으로 정했어요." : "담당을 풀었어요.", "success"));
  const editRole = (roleId, patch) => saveStructure(v => ({ ...v, roles: v.roles.map(r => r.id === roleId ? { ...r, ...patch } : r) }));
  const editDuties = (roleId, fn) => saveStructure(v => ({ ...v, roles: v.roles.map(r => r.id === roleId ? { ...r, duties: fn(r.duties) } : r) }));
  const addRole = () => saveStructure(v => ({ ...v, roles: [...v.roles, { id: `role_${Date.now().toString(36)}`, deptId: dept.id, title: "", ownerId: "", ownerName: "", order: v.roles.length, duties: [{ id: `duty_${Date.now().toString(36)}`, text: "새 업무", part: "", group: "", editors: [] }] }] }));
  const removeRole = role => { if (window.confirm("이 담당을 지울까요? 적어 둔 업무 내용은 남지만 목록에서 사라져요.")) saveStructure(v => ({ ...v, roles: v.roles.filter(r => r.id !== role.id) })); };
  const addDept = () => { const name = window.prompt("새 부서 이름(예: 교무부, 1학년부)"); if (!name?.trim()) return; const id = `dept_${Date.now().toString(36)}`; saveStructure(v => ({ ...v, depts: [...v.depts, { id, name: name.trim(), order: v.depts.length, common: "" }] })).then(ok => ok && setDeptId(id)); };
  const renameDept = () => { const name = window.prompt("부서 이름", dept.name); if (!name?.trim()) return; saveStructure(v => ({ ...v, depts: v.depts.map(d => d.id === dept.id ? { ...d, name: name.trim() } : d) })); };
  const removeDept = () => { if (roles.length) { showToast("담당이 남아 있는 부서는 지울 수 없어요.", "error"); return; } if (window.confirm(`'${dept.name}' 부서를 지울까요?`)) saveStructure(v => ({ ...v, depts: v.depts.filter(d => d.id !== dept.id) })).then(() => setDeptId("")); };

  return <div className="kho"><style>{CSS}</style>
    <header className="kho-top">
      <b className="ttl">업무 인수인계</b>
      <div className="depts" role="tablist">{data.depts.map(d => <button key={d.id} type="button" data-kdn-bare role="tab" aria-selected={d.id === dept?.id} className={d.id === dept?.id ? "on" : ""} onClick={() => { setDeptId(d.id); setDutyId(""); }}>{d.name}</button>)}
        {manage && <button type="button" data-kdn-bare className="add" onClick={addDept}><Plus size={13} /> 부서</button>}</div>
      {canEditStructure && <button type="button" data-kdn-bare className={`kho-ghost${manage ? " on" : ""}`} onClick={() => setManage(v => !v)}>{manage ? <><Check size={13} /> 다 고쳤어요</> : <><Pencil size={13} /> 업무 추가·삭제</>}</button>}
    </header>
    <div className={`kho-body${found ? " has-sel" : ""}`}>
      <aside className="kho-list">
        <div className="tools">
          <label className="srch"><Search size={14} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="업무 찾기" /></label>
          {isTeacher && <button type="button" data-kdn-bare className={`kho-ghost${mineOnly ? " on" : ""}`} onClick={() => setMineOnly(v => !v)}>내 업무</button>}
        </div>
        {manage && <p className="mng-hint">업무 이름을 고치면 바로 저장돼요. 담당·세부 업무를 더하거나 지울 수 있고, 위에서 부서도 더할 수 있어요.</p>}
        {manage && dept && <div className="mng-dept"><span>{dept.name}</span><button type="button" data-kdn-bare onClick={renameDept}>이름 바꾸기</button><button type="button" data-kdn-bare onClick={removeDept}>지우기</button></div>}
        {visibleRoles.length === 0 && <p className="none">{mineOnly ? "내 담당이 아직 없어요. 맡은 담당의 '내 담당으로'를 눌러 주세요." : q ? "찾는 업무가 없어요." : "아직 담당이 없어요."}</p>}
        {visibleRoles.map(role => { const mine = role.ownerId && role.ownerId === myId; return <section key={role.id} className={`kho-role${mine ? " mine" : ""}`}>
          <header>
            <b className="rn">{roleNo(data, role)}</b>
            {manage ? <select value={role.ownerId} onChange={e => { const t = teachers.find(x => String(x.id) === e.target.value); editRole(role.id, { ownerId: t ? String(t.id) : "", ownerName: t ? String(t.name) : "" }); }}><option value="">담당 미정</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              : <span className={role.ownerName ? "who" : "who nil"}>{role.ownerName || "미정"}</span>}
            {!manage && mine && <span className="me">내 담당</span>}
            {!manage && isTeacher && !role.ownerId && <button type="button" data-kdn-bare className="claim" onClick={() => claim(role, true)}>내 담당으로</button>}
            {manage && <span className="mng"><input defaultValue={role.title} placeholder="담당 이름" onBlur={e => e.target.value !== role.title && editRole(role.id, { title: e.target.value.trim() })} /><button type="button" data-kdn-bare title="담당 지우기" onClick={() => removeRole(role)}><Trash2 size={13} /></button></span>}
          </header>
          <ul>{role.duties.map(duty => { const m = data.meta?.[duty.id]; const filled = !!(m && (m.steps || m.files || m.filled)); return <li key={duty.id}>
            {manage ? <span className="mng-duty"><input defaultValue={duty.text} onBlur={e => e.target.value.trim() && e.target.value !== duty.text && editDuties(role.id, list => list.map(d => d.id === duty.id ? { ...d, text: e.target.value.trim() } : d))} /><button type="button" data-kdn-bare title="지우기" onClick={() => window.confirm("이 세부 업무를 목록에서 지울까요?") && editDuties(role.id, list => list.filter(d => d.id !== duty.id))}><X size={13} /></button></span>
              : <button type="button" data-kdn-bare className={duty.id === dutyId ? "on" : ""} onClick={() => open(duty.id)} title={filled ? "정리된 업무" : "아직 비어 있는 업무"}>
                {filled ? <CheckCircle2 size={15} className="st on" /> : <i className="st" />}<span className="tx">{duty.text}</span>{m?.steps ? <small>{m.steps}단계</small> : null}<ChevronRight size={14} className="go" /></button>}
          </li>; })}</ul>
          {manage && <button type="button" data-kdn-bare className="add-duty" onClick={() => editDuties(role.id, list => [...list, { id: `duty_${Date.now().toString(36)}`, text: "새 세부 업무", part: "", group: "", editors: [] }])}><Plus size={13} /> 세부 업무</button>}
        </section>; })}
        {manage && <button type="button" data-kdn-bare className="add-role" onClick={addRole}><Plus size={14} /> 담당 추가</button>}
        {dept?.common && !manage && <p className="common"><b>공동</b> {dept.common}</p>}
      </aside>
      <main className="kho-main">
        {found ? <TaskPanel key={`${found.duty.id}-${found.duty.group}`} data={data} duty={found.duty} role={found.role} dept={data.depts.find(d => d.id === found.role.deptId)}
          canEdit={canEditDuty(found.role, found.duty) || siblingDuties(data, found.duty.id).some(x => found.duty.group && x.duty.group === found.duty.group && canEditDuty(x.role, x.duty))}
          canEditOf={canEditDuty} teachers={teachers} actor={actor} showToast={showToast} onMeta={onMeta} editDuty={editDuty} onOpen={open} onClose={() => setDutyId("")} />
          : <div className="kho-guide">
            <b>업무를 골라 주세요</b>
            <p>맡은 담당에서 <em>내 담당으로</em>를 누르고, 업무를 열어 <em>고치기</em>로 정리해요. <CheckCircle2 size={14} className="gk" /> 표시는 정리된 업무예요.</p>
          </div>}
      </main>
    </div>
  </div>;
}

function TaskPanel({ data, duty, role, dept, canEdit, canEditOf, teachers, actor, showToast, onMeta, editDuty, onOpen, onClose }) {
  const key = taskStoreKey(duty);
  const siblings = siblingDuties(data, duty.id);
  const groupIds = duty.group ? siblings.filter(x => x.duty.group === duty.group).map(x => x.duty.id) : [duty.id];
  const [task, setTask] = React.useState(null);
  const [state, setState] = React.useState("idle");
  const [editing, setEditing] = React.useState(false);
  const [tab, setTab] = React.useState("timeline");
  const [shareOpen, setShareOpen] = React.useState(false);
  const [pasteOpen, setPasteOpen] = React.useState(false);
  const [whoFilter, setWhoFilter] = React.useState("");
  const ref = React.useRef(null);
  const timer = React.useRef(0);
  React.useEffect(() => { let on = true; readStorage(key, null).then(raw => { if (on) { const t = normalizeTask(raw); ref.current = t; setTask(t); } }).catch(() => on && setTask(emptyTask())); return () => { on = false; clearTimeout(timer.current); }; }, [key]);
  const pushMeta = saved => onMeta(groupIds, { ...taskProgress(saved), updatedAt: saved.updatedAt, updatedBy: saved.updatedBy });
  const save = async () => {
    clearTimeout(timer.current);
    const draft = ref.current; if (!draft) return;
    setState("saving");
    const stamp = { updatedAt: new Date().toISOString(), updatedBy: String(actor?.name || "") };
    const result = await updateStorage(key, null, current => { const cur = normalizeTask(current); return { ...cur, summary: draft.summary, must: draft.must, changes: draft.changes, steps: draft.steps, links: draft.links, files: draft.files, ...stamp }; });
    if (result?.ok === false) { setState("dirty"); showToast("저장하지 못했어요. 잠시 뒤 다시 해 주세요.", "error"); return; }
    const saved = normalizeTask(result?.value);
    ref.current = { ...draft, ...stamp, comments: saved.comments }; setTask(ref.current); setState("saved"); pushMeta(saved);
  };
  const edit = fn => { if (!canEdit) return; const next = fn(ref.current); ref.current = next; setTask(next); setState("dirty"); clearTimeout(timer.current); timer.current = setTimeout(save, 1000); };
  const finish = async () => { if (state === "dirty") await save(); setEditing(false); };
  const editStep = (id, patch) => edit(t => ({ ...t, steps: t.steps.map(s => s.id === id ? { ...s, ...patch } : s) }));
  const moveStep = (id, dir) => edit(t => { const list = [...t.steps]; const i = list.findIndex(s => s.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= list.length) return t; [list[i], list[j]] = [list[j], list[i]]; return { ...t, steps: list }; });
  const addComment = async text => {
    const c = newComment(text, actor); if (!c.text) return false;
    const result = await updateStorage(key, null, current => { const cur = normalizeTask(current); return { ...cur, comments: [...cur.comments, c] }; });
    if (result?.ok === false) { showToast("코멘트를 남기지 못했어요.", "error"); return false; }
    const saved = normalizeTask(result?.value); ref.current = { ...ref.current, comments: saved.comments }; setTask(ref.current); pushMeta(saved); return true;
  };
  const removeComment = async id => {
    if (!window.confirm("이 코멘트를 지울까요?")) return;
    const result = await updateStorage(key, null, current => { const cur = normalizeTask(current); return { ...cur, comments: cur.comments.filter(c => c.id !== id) }; });
    if (result?.ok !== false) { const saved = normalizeTask(result?.value); ref.current = { ...ref.current, comments: saved.comments }; setTask(ref.current); }
  };
  const upload = async (list, stepId) => {
    const files = Array.from(list || []).slice(0, 5); if (!files.length) return;
    showToast("파일을 올리는 중이에요.", "info");
    const done = [];
    for (const file of files) { try { done.push({ ...(await uploadClassroomAttachment(file, { scopeKey: "handover", subject: dept?.name || "업무", target: duty.text.slice(0, 30), teacherName: actor?.name || "선생님" })), fileName: file.name, size: file.size, id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}` }); } catch (error) { showToast(error?.message || "파일을 올리지 못했어요.", "error"); } }
    if (!done.length) return;
    if (stepId) editStep(stepId, { files: [...(ref.current.steps.find(s => s.id === stepId)?.files || []), ...done] });
    else edit(t => ({ ...t, files: [...t.files, ...done] }));
    showToast(`파일 ${done.length}개를 붙였어요.`, "success");
  };
  // 나눠 맡는 업무: 타임라인 함께 쓰기 켜기/끄기
  const toggleShared = async on => {
    if (on) {
      if (!window.confirm("나눠 맡은 업무들이 타임라인·자료·코멘트를 함께 쓰게 할까요? 지금까지 적은 내용은 하나로 합쳐져요.")) return;
      const group = `g${Date.now().toString(36)}`;
      const parts = await Promise.all(siblings.map(x => readStorage(taskStoreKey(x.duty), null).catch(() => null)));
      const merged = { ...mergeTasks(parts), updatedAt: new Date().toISOString(), updatedBy: String(actor?.name || "") };
      const result = await updateStorage(taskStoreKey({ group }), null, () => merged);
      if (result?.ok === false) { showToast("합치지 못했어요.", "error"); return; }
      for (const x of siblings) await editDuty(x.duty.id, { group });
      onMeta(siblings.map(x => x.duty.id), { ...taskProgress(merged), updatedAt: merged.updatedAt, updatedBy: merged.updatedBy });
      showToast("타임라인을 함께 쓰게 했어요.", "success");
    } else {
      if (!window.confirm("함께 쓰기를 끌까요? 업무마다 지금의 함께 쓴 내용을 따로 복사해 가져가요.")) return;
      const shared = await readStorage(key, null).catch(() => null);
      for (const x of siblings.filter(y => y.duty.group === duty.group)) { await updateStorage(taskStoreKey({ id: x.duty.id }), null, () => normalizeTask(shared)); await editDuty(x.duty.id, { group: "" }); }
      showToast("업무마다 따로 쓰게 했어요.", "success");
    }
  };

  const people = stepPeople({ duty, role, siblings, roleLabel: r => roleNo(data, r) });
  const personOf = id => people.find(p => p.id === id);
  const whoLabel = id => (id === "all" ? "함께" : personOf(id)?.label || "");
  if (!task) return <div className="kho-task"><p className="kho-loading"><Loader2 size={16} className="spin" /> 불러오는 중이에요.</p></div>;
  const brief = [["summary", "업무 요약", "무엇을, 누구와, 언제 하는 업무인지", Info], ["must", "꼭 알아둘 것", "놓치면 안 되는 점, 연락처", AlertTriangle], ["changes", "달라진 점 · 내년 제안", "예: 평가회 영상 대신 팜플렛 제작", Sparkles]];
  const filledBrief = brief.filter(([k]) => task[k].trim());
  const fileCount = task.links.length + task.files.length;
  const shareLink = () => { const u = new URL(window.location.origin + window.location.pathname); u.searchParams.set(LINK_PARAM, duty.id); return u.toString(); };
  const tabs = [["timeline", "타임라인", task.steps.length], ["files", "자료", fileCount], ["comments", "코멘트", task.comments.length]];

  return <div className="kho-task">
    <section className="kho-head">
      <button type="button" data-kdn-bare className="back" onClick={onClose}>← 목록</button>
      <div className="row">
        <h2>{duty.text}</h2>
        <div className="acts">
          <span className="share-wrap"><button type="button" data-kdn-bare className="kho-ghost" onClick={() => setShareOpen(v => !v)}><Share2 size={14} /> 공유</button>
            {shareOpen && <SharePop duty={duty} canEdit={canEdit} teachers={teachers} onClose={() => setShareOpen(false)} showToast={showToast}
              onCopyLink={async () => showToast(await copyText(shareLink()) ? "링크를 복사했어요. 로그인한 선생님은 이 업무가 바로 열려요." : "복사하지 못했어요.", "success")}
              onCopyText={async () => showToast(await copyText(`${taskAsText(task, duty.text, whoLabel)}\n\n${shareLink()}`) ? "글로 복사했어요. 메신저에 붙여 넣으세요." : "복사하지 못했어요.", "success")}
              onEditors={editors => editDuty(duty.id, { editors })} />}</span>
          {canEdit && (editing ? <button type="button" data-kdn-bare className="kho-pri" onClick={finish}><Check size={14} /> 다 했어요</button> : <button type="button" data-kdn-bare className="kho-pri" onClick={() => setEditing(true)}><Pencil size={14} /> 고치기</button>)}
          <button type="button" data-kdn-bare className="x" onClick={onClose} aria-label="닫기"><X size={16} /></button>
        </div>
      </div>
      <div className="chips"><em className="d">{dept?.name}</em><em>{roleNo(data, role)}</em><em className={role.ownerName ? "o" : "o nil"}>{role.ownerName ? `${role.ownerName} 선생님` : "담당 미정"}</em>{duty.editors.length ? <em>함께 고침 {duty.editors.map(e => e.name).join(", ")}</em> : null}</div>
      <div className="meta">{editing ? (state === "saving" ? "저장 중…" : state === "dirty" ? "고치는 중 · 자동 저장" : state === "saved" ? "저장됨" : "적으면 자동 저장돼요") : task.updatedAt ? `${fmtAt(task.updatedAt)} ${task.updatedBy || ""} 수정` : "아직 정리 전"}</div>
    </section>

    {siblings.length > 1 && <section className="kho-parts">
      <div className="hd"><b>나눠 맡는 업무</b>{duty.group ? <span className="tag">타임라인 함께 쓰는 중</span> : null}
        {canEdit && <button type="button" data-kdn-bare className="lnk" onClick={() => toggleShared(!duty.group)}>{duty.group ? "따로 쓰기" : "타임라인 함께 쓰기"}</button>}</div>
      <div className="cards">{siblings.map(x => { const me = x.duty.id === duty.id; const r = x.role; return <div key={x.duty.id} className={`part${me ? " me" : ""}`} role={me ? undefined : "button"} tabIndex={me ? -1 : 0} onClick={() => !me && onOpen(x.duty.id)} onKeyDown={e => !me && e.key === "Enter" && onOpen(x.duty.id)}>
        <span className="no">{dutyPartNo(x.duty.text)}</span>
        <span className="who">{roleNo(data, r)} · {r.ownerName || "미정"}</span>
        {me && editing && canEditOf(r, x.duty) ? <input defaultValue={x.duty.part} placeholder="이 담당이 맡는 일(예: 체험처 섭외, 당일 운영)" onBlur={e => e.target.value !== x.duty.part && editDuty(x.duty.id, { part: e.target.value.trim() })} />
          : <span className={x.duty.part ? "pt" : "pt nil"}>{x.duty.part || "맡는 일을 아직 적지 않았어요"}</span>}
      </div>; })}</div>
    </section>}

    {(editing || filledBrief.length > 0) && <section className="kho-brief">
      {(editing ? brief : filledBrief).map(([k, label, ph, Icon]) => <div key={k} className={`it k-${k}`}><b><Icon size={14} /> {label}</b>
        {editing ? <AutoText value={task[k]} placeholder={ph} onChange={v => edit(t => ({ ...t, [k]: v }))} /> : <p>{task[k]}</p>}</div>)}
    </section>}

    <section className="kho-card">
      <div className="kho-tabs" role="tablist">{tabs.map(([k, label, n]) => <button key={k} type="button" data-kdn-bare role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}><b>{label}</b><span>{n || 0}</span></button>)}</div>

      {tab === "timeline" && <>
        {task.steps.length === 0 && <div className="kho-empty">
          <p>{canEdit ? "달마다 한 일을 단계로 적어 두면 다음 담당이 그대로 따라 할 수 있어요." : "아직 정리된 타임라인이 없어요."}</p>
          {canEdit && <div className="row">
            <button type="button" data-kdn-bare className="kho-pri" onClick={() => setPasteOpen(true)}><ClipboardPaste size={14} /> 시트에서 붙여넣기</button>
            <button type="button" data-kdn-bare className="kho-ghost" onClick={() => { setEditing(true); edit(t => ({ ...t, steps: stepTemplate(duty.text) })); }}><Wand2 size={14} /> 예시 틀로 시작</button>
            <button type="button" data-kdn-bare className="kho-ghost" onClick={() => { setEditing(true); edit(t => ({ ...t, steps: [newStep()] })); }}><Plus size={14} /> 직접 적기</button>
          </div>}
        </div>}
        {people.length > 0 && task.steps.length > 0 && <div className="kho-who-filter" role="group" aria-label="담당별 보기">
          <button type="button" data-kdn-bare className={whoFilter ? "" : "on"} onClick={() => setWhoFilter("")}>전체 <small>{task.steps.length}</small></button>
          {people.map(p => <button key={p.id} type="button" data-kdn-bare className={`t${p.tone}${whoFilter === p.id ? " on" : ""}`} onClick={() => setWhoFilter(p.id)}>{p.label} <small>{task.steps.filter(s => s.who === p.id || s.who === "all").length}</small></button>)}
          {task.steps.some(s => !s.who) && <button type="button" data-kdn-bare className={whoFilter === "none" ? "on" : ""} onClick={() => setWhoFilter("none")}>담당 미정 <small>{task.steps.filter(s => !s.who).length}</small></button>}
        </div>}
        <ol className={`kho-tl${editing ? " is-edit" : ""}`}>{groupSteps(task.steps.filter(s => !whoFilter || (whoFilter === "none" ? !s.who : s.who === whoFilter || s.who === "all"))).map(g => <li key={g.month} className={g.month ? (g.month >= 3 && g.month <= 8 ? "s1" : "s2") : "nil"}>
          <span className={`mo${g.month ? (g.month >= 3 && g.month <= 8 ? " s1" : " s2") : " nil"}`}>{g.label}</span>
          <div className="steps">{g.steps.map(step => editing
            ? <StepEdit key={step.id} step={step} people={people} onChange={patch => editStep(step.id, patch)} onMove={dir => moveStep(step.id, dir)} onRemove={() => window.confirm("이 단계를 지울까요?") && edit(t => ({ ...t, steps: t.steps.filter(s => s.id !== step.id) }))} onUpload={list => upload(list, step.id)} showToast={showToast} />
            : <article key={step.id} className={`kho-step${step.done ? " done" : ""}`}>
              <button type="button" data-kdn-bare className="ck" disabled={!canEdit} aria-pressed={step.done} title={canEdit ? (step.done ? "끝냄 취소" : "끝냄") : ""} onClick={() => editStep(step.id, { done: !step.done })}>{step.done && <Check size={12} />}</button>
              <div className="bd"><div className="hl"><b className="tt">{step.title || "(제목 없음)"}</b><span className="mt">{step.who && whoLabel(step.who) ? <span className={`kho-who t${step.who === "all" ? "a" : personOf(step.who)?.tone ?? 0}`}>{whoLabel(step.who)}</span> : null}{step.when ? <em className="wh">{step.when}</em> : null}</span></div>{step.detail ? <Detail text={step.detail} /> : null}
                {(step.links.length > 0 || step.files.length > 0) && <Chips links={step.links} files={step.files} showToast={showToast} />}</div>
            </article>)}</div>
        </li>)}</ol>
        {editing && task.steps.length > 0 && <div className="kho-addrow"><button type="button" data-kdn-bare className="kho-ghost" onClick={() => edit(t => ({ ...t, steps: [...t.steps, newStep({ month: t.steps[t.steps.length - 1]?.month || 0 })] }))}><Plus size={14} /> 단계 추가</button><button type="button" data-kdn-bare className="kho-ghost" onClick={() => setPasteOpen(true)}><ClipboardPaste size={14} /> 시트에서 붙여넣기</button></div>}
      </>}

      {tab === "files" && <div className="kho-files">
        {fileCount ? <Chips links={task.links} files={task.files} showToast={showToast} large onRemoveLink={editing ? id => edit(t => ({ ...t, links: t.links.filter(l => l.id !== id) })) : null} onRemoveFile={editing ? i => edit(t => ({ ...t, files: t.files.filter((_, k) => k !== i) })) : null} />
          : <p className="kho-nil">{canEdit ? "업무 전체에 쓰는 시트·문서·폴더 링크나 파일을 모아 두세요." : "붙인 자료가 없어요."}</p>}
        {canEdit && <AddMaterial onLink={l => edit(t => ({ ...t, links: [...t.links, l] }))} onUpload={list => upload(list, "")} showToast={showToast} />}
      </div>}

      {tab === "comments" && <Comments list={task.comments} actor={actor} canModerate={canEdit} onAdd={addComment} onRemove={removeComment} />}
    </section>

    {pasteOpen && <PasteModal onClose={() => setPasteOpen(false)} onApply={steps => { setEditing(true); edit(t => ({ ...t, steps: [...t.steps, ...steps] })); setPasteOpen(false); setTab("timeline"); showToast(`${steps.length}단계를 넣었어요. 확인하고 고쳐 주세요.`, "success"); }} />}
  </div>;
}

// 단계 내용: 항목(ⓐⓑ, ①②, -, 1)) 은 목록, '*' 줄은 참고 메모, 나머지는 문단
function Detail({ text }) {
  const blocks = formatDetail(text);
  const out = []; let list = null;
  blocks.forEach((b, i) => {
    if (b.type === "li") { if (!list) { list = []; out.push(<ul key={`u${i}`} className="dl">{list}</ul>); } list.push(<li key={i}><span className="mk">{b.marker}</span><span>{b.text}</span></li>); return; }
    list = null;
    out.push(b.type === "note" ? <p key={i} className="dn"><Info size={13} /><span>{b.text}</span></p> : <p key={i} className="dp">{b.text}</p>);
  });
  return <div className="kho-detail">{out}</div>;
}

function StepEdit({ step, people = [], onChange, onMove, onRemove, onUpload, showToast }) {
  const [more, setMore] = React.useState(false);
  return <article className={`kho-step edit${step.done ? " done" : ""}`}>
    <div className="er">
      <button type="button" data-kdn-bare className="ck" aria-pressed={step.done} onClick={() => onChange({ done: !step.done })}>{step.done && <Check size={12} />}</button>
      <select value={step.month || 0} onChange={e => onChange({ month: Number(e.target.value) })} aria-label="달"><option value={0}>미정</option>{SCHOOL_MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}</select>
      <input className="tt" value={step.title} placeholder="할 일" onChange={e => onChange({ title: e.target.value })} />
      <input className="wh" value={step.when} placeholder="2주" onChange={e => onChange({ when: e.target.value })} aria-label="때" />
      {people.length > 0 && <select className="who" value={step.who || ""} onChange={e => onChange({ who: e.target.value })} aria-label="이 단계 담당"><option value="">담당 미정</option>{people.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}<option value="all">함께</option></select>}
      <span className="ops"><button type="button" data-kdn-bare title="위로" onClick={() => onMove(-1)}><ArrowUp size={13} /></button><button type="button" data-kdn-bare title="아래로" onClick={() => onMove(1)}><ArrowDown size={13} /></button><button type="button" data-kdn-bare title="지우기" onClick={onRemove}><Trash2 size={13} /></button></span>
    </div>
    <AutoText value={step.detail} placeholder="내용 · 방법 · 참고할 점" onChange={v => onChange({ detail: v })} />
    {(step.links.length > 0 || step.files.length > 0) && <Chips links={step.links} files={step.files} showToast={showToast} onRemoveLink={id => onChange({ links: step.links.filter(l => l.id !== id) })} onRemoveFile={i => onChange({ files: step.files.filter((_, k) => k !== i) })} />}
    {more ? <AddMaterial onLink={l => { onChange({ links: [...step.links, l] }); setMore(false); }} onUpload={list => { onUpload(list); setMore(false); }} showToast={showToast} /> : <button type="button" data-kdn-bare className="kho-more" onClick={() => setMore(true)}><Plus size={12} /> 자료</button>}
  </article>;
}

function Chips({ links = [], files = [], showToast, large = false, onRemoveLink = null, onRemoveFile = null }) {
  return <ul className={`kho-chips${large ? " lg" : ""}`}>
    {links.map(l => { const k = linkKind(l.url); const Icon = KIND_ICON[k.kind] || Globe; return <li key={l.id} className={`k-${k.kind}`}><a href={l.url} target="_blank" rel="noopener noreferrer" title={l.url}><Icon size={14} /><span>{l.label || k.label}</span>{large && <small>{k.label}</small>}<ExternalLink size={11} className="ext" /></a>{onRemoveLink && <button type="button" data-kdn-bare title="빼기" onClick={() => onRemoveLink(l.id)}><X size={12} /></button>}</li>; })}
    {files.map((f, i) => <li key={f.id || i} className="k-file"><button type="button" data-kdn-bare className="open" onClick={() => openFile(f).catch(e => showToast(e.message, "error"))}><Paperclip size={14} /><span>{f.fileName || "첨부파일"}</span>{large && <small>{f.size ? `${Math.max(1, Math.round(f.size / 1024))}KB` : "파일"}</small>}</button>{onRemoveFile && <button type="button" data-kdn-bare title="빼기" onClick={() => window.confirm("이 파일을 뺄까요?") && onRemoveFile(i)}><X size={12} /></button>}</li>)}
  </ul>;
}

function AddMaterial({ onLink, onUpload, showToast }) {
  const [url, setUrl] = React.useState("");
  const [label, setLabel] = React.useState("");
  const input = React.useRef(null);
  const add = () => { const u = safeUrl(url); if (!u) { showToast("https://로 시작하는 주소를 붙여 넣어 주세요.", "error"); return; } onLink(newLink(label.trim() || linkKind(u).label, u)); setUrl(""); setLabel(""); };
  return <div className="kho-addmat">
    <input value={url} onChange={e => setUrl(e.target.value)} placeholder="시트·문서·폴더 주소 붙여 넣기" onKeyDown={e => e.key === "Enter" && add()} />
    <input value={label} onChange={e => setLabel(e.target.value)} placeholder="이름(선택)" onKeyDown={e => e.key === "Enter" && add()} className="lb" />
    <button type="button" data-kdn-bare className="kho-ghost" disabled={!url.trim()} onClick={add}><Link2 size={13} /> 붙이기</button>
    <button type="button" data-kdn-bare className="kho-ghost" onClick={() => input.current?.click()}><Paperclip size={13} /> 파일</button>
    <input ref={input} type="file" multiple hidden onChange={e => { const list = Array.from(e.target.files || []); e.target.value = ""; onUpload(list); }} />
  </div>;
}

function SharePop({ duty, canEdit, teachers, onClose, onCopyLink, onCopyText, onEditors }) {
  const ref = React.useRef(null);
  React.useEffect(() => { const off = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); }; setTimeout(() => document.addEventListener("click", off), 0); return () => document.removeEventListener("click", off); }, [onClose]);
  const add = id => { const t = teachers.find(x => String(x.id) === id); if (t && !duty.editors.some(e => e.id === String(t.id))) onEditors([...duty.editors, { id: String(t.id), name: String(t.name) }]); };
  return <div className="kho-pop" ref={ref}>
    <button type="button" data-kdn-bare onClick={() => { onCopyLink(); onClose(); }}><Link2 size={14} /><span><b>링크 복사</b><small>로그인하면 이 업무가 바로 열려요</small></span></button>
    <button type="button" data-kdn-bare onClick={() => { onCopyText(); onClose(); }}><Copy size={14} /><span><b>글로 복사</b><small>요약과 타임라인을 메신저에 붙여 넣기</small></span></button>
    {canEdit && <div className="eds"><b><Users size={13} /> 함께 고칠 선생님</b>
      {duty.editors.length ? <ul>{duty.editors.map(e => <li key={e.id}>{e.name}<button type="button" data-kdn-bare onClick={() => onEditors(duty.editors.filter(x => x.id !== e.id))} aria-label="빼기"><X size={11} /></button></li>)}</ul> : <small>담당이 아니어도 이 업무를 같이 고칠 수 있게 해요</small>}
      <select value="" onChange={e => add(e.target.value)}><option value="">선생님 추가</option>{teachers.filter(t => !duty.editors.some(e => e.id === String(t.id))).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>}
  </div>;
}

function PasteModal({ onClose, onApply }) {
  const [text, setText] = React.useState("");
  const steps = React.useMemo(() => parseSheetRows(text), [text]);
  return createPortal(<div className="kho-modal" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && onClose()}><style>{CSS}</style>
    <div className="box">
      <header><b>시트에서 붙여넣기</b><button type="button" data-kdn-bare className="x" onClick={onClose} aria-label="닫기"><X size={16} /></button></header>
      <p>구글 시트·엑셀에서 <em>시기 · 할 일 · 내용</em> 칸을 머리글째 골라 복사(Ctrl+C)한 뒤 아래에 붙여 넣으세요. 링크가 있으면 자료로 붙어요.</p>
      <textarea autoFocus value={text} onChange={e => setText(e.target.value)} placeholder={"시기\t할 일\t내용\n3월\t계획 수립\t계획서 작성, 예산 협의\n5월 2주\t체험처 섭외\t협조 공문 발송"} />
      {steps.length > 0 && <div className="pv"><small>{steps.length}단계로 읽었어요</small><ol>{steps.slice(0, 6).map(s => <li key={s.id}><em>{s.month ? `${s.month}월` : "미정"}</em><b>{s.title}</b><span>{s.detail}</span></li>)}{steps.length > 6 && <li className="more">외 {steps.length - 6}단계</li>}</ol></div>}
      <footer><button type="button" data-kdn-bare className="kho-ghost" onClick={onClose}>닫기</button><button type="button" data-kdn-bare className="kho-pri" disabled={!steps.length} onClick={() => onApply(steps)}>{steps.length ? `${steps.length}단계 넣기` : "붙여 넣어 주세요"}</button></footer>
    </div>
  </div>, document.body);
}

function AutoText({ value, onChange, placeholder }) {
  const el = React.useRef(null);
  React.useLayoutEffect(() => { const t = el.current; if (t) { t.style.height = "auto"; t.style.height = `${Math.max(38, t.scrollHeight)}px`; } }, [value]);
  return <textarea ref={el} rows={1} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />;
}

function Comments({ list, actor, canModerate, onAdd, onRemove }) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const myId = String(actor?.id || "");
  const send = async () => { if (!text.trim() || busy) return; setBusy(true); const ok = await onAdd(text); setBusy(false); if (ok) setText(""); };
  return <div className="kho-cm">
    {list.length ? <ul>{list.map(c => <li key={c.id} className={c.byId && c.byId === myId ? "me" : ""}><header><b>{c.by}</b><small>{fmtAtFull(c.at)}</small>{(canModerate || (c.byId && c.byId === myId)) && <button type="button" data-kdn-bare title="지우기" onClick={() => onRemove(c.id)}><Trash2 size={12} /></button>}</header><p>{c.text}</p></li>)}</ul> : <p className="kho-nil">궁금한 점을 남기면 담당 선생님이 답해요.</p>}
    <div className="new"><AutoText value={text} onChange={setText} placeholder="코멘트 남기기" /><button type="button" data-kdn-bare className="kho-pri" disabled={!text.trim() || busy} onClick={send}>{busy ? <Loader2 size={14} className="spin" /> : <MessageSquare size={14} />} 남기기</button></div>
  </div>;
}

const CSS = `
.kho{display:grid;gap:12px;color:var(--kdn-ink,#17181d);--kho-acc:#ff7a3d;--kho-acc-ink:#c2410c;--kho-soft:var(--kdn-surface-2,color-mix(in srgb,currentColor 7%,transparent))}
.kho .spin{animation:kho-spin 1s linear infinite}@keyframes kho-spin{to{transform:rotate(360deg)}}
.kho-loading{display:flex;align-items:center;gap:8px;color:var(--kdn-muted,#8a8f99);font-size:14px}
.kho-pri,.kho-ghost{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 14px;border-radius:10px;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;white-space:nowrap}
.kho-pri{border:1px solid var(--kdn-ink,#17181d);background:var(--kdn-ink,#17181d);color:var(--kdn-surface,#fff)}
.kho-ghost{border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:var(--kdn-ink-soft,#3d4048)}
.kho-ghost.on{border-color:var(--kho-acc);color:var(--kho-acc-ink);background:color-mix(in srgb,var(--kho-acc) 9%,var(--kdn-surface,#fff))}
.kho-pri:disabled,.kho-ghost:disabled{opacity:.45;cursor:default}
.kho-top{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px}
.kho-top .ttl{font-size:20px;font-weight:800;letter-spacing:-.02em}
.kho-top .depts{display:flex;flex-wrap:wrap;gap:4px;flex:1;min-width:0}
.kho-top .depts button{height:34px;padding:0 14px;border-radius:99px;border:1px solid transparent;background:transparent;color:var(--kdn-ink-soft,#5b606b);font:inherit;font-size:14px;font-weight:700;cursor:pointer}
.kho-top .depts button:hover{background:var(--kdn-surface,#fff)}
.kho-top .depts button.on{background:var(--kdn-ink,#17181d);color:var(--kdn-surface,#fff)}
.kho-top .depts button.add{border:1px dashed var(--kdn-line,#d9d6cf)}
.kho-body{display:grid;grid-template-columns:minmax(280px,340px) minmax(0,1fr);gap:16px;align-items:start}
@media (max-width:960px){.kho-body{grid-template-columns:1fr}.kho-body.has-sel .kho-list{display:none}}
.kho-list{display:grid;gap:8px;position:sticky;top:72px;max-height:calc(100vh - 92px);overflow:auto;padding:2px;scrollbar-width:none}
.kho-list::-webkit-scrollbar{display:none}
@media (max-width:960px){.kho-list{position:static;max-height:none;overflow:visible}}
.kho-list .tools{display:flex;gap:6px}
.kho-list .srch{flex:1;display:flex;align-items:center;gap:6px;height:36px;padding:0 10px;border-radius:10px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:var(--kdn-muted,#8a8f99)}
.kho-list .srch input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:13.5px;color:var(--kdn-ink,#17181d)}
.kho-list .none,.kho-nil{margin:0;font-size:13px;color:var(--kdn-muted,#8a8f99)}
.kho-list .mng-dept{display:flex;gap:10px;align-items:center;font-size:13px;font-weight:700}.kho-list .mng-dept button{font:inherit;font-size:12.5px;color:var(--kho-acc-ink);background:none;border:0;cursor:pointer;padding:0}
.kho-role{border-radius:14px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#ebe9e4)}
.kho-role.mine{border-color:color-mix(in srgb,var(--kho-acc) 50%,transparent)}
.kho-role>header{display:flex;align-items:center;gap:8px;min-height:40px;padding:6px 8px 2px 12px}
.kho-role>header b{font-size:12.5px;font-weight:800;color:var(--kdn-ink,#17181d)}
.kho-role .who{font-size:12.5px;color:var(--kdn-ink-soft,#5b606b)}.kho-role .who.nil{color:var(--kdn-muted,#a4a8b1)}
.kho-role .me{font-size:11px;font-weight:800;color:var(--kho-acc-ink);padding:2px 7px;border-radius:99px;background:color-mix(in srgb,var(--kho-acc) 12%,transparent)}
.kho-role .claim{margin-left:auto;height:26px;padding:0 9px;border-radius:8px;border:0;background:transparent;color:var(--kho-acc-ink);font:inherit;font-size:12px;font-weight:800;cursor:pointer}
.kho-role .claim:hover{background:color-mix(in srgb,var(--kho-acc) 10%,transparent)}
.kho-role select,.kho-role .mng input,.kho-role .mng-duty input{height:28px;padding:0 8px;border-radius:8px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#17181d);font:inherit;font-size:12.5px}
.kho-role .mng{display:flex;gap:4px;margin-left:auto}.kho-role .mng input{width:90px}
.kho-role .mng button,.kho-role .mng-duty button{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:#b42318;cursor:pointer}
.kho-role ul{list-style:none;margin:0;padding:2px 4px 6px}
.kho-role li>button{display:flex;align-items:center;gap:8px;width:100%;min-height:36px;padding:6px 8px;border-radius:9px;border:0;background:transparent;text-align:left;color:inherit;font:inherit;cursor:pointer}
.kho-role li>button:hover{background:var(--kho-soft)}
.kho-role li>button.on{background:color-mix(in srgb,var(--kho-acc) 11%,var(--kdn-surface,#fff))}
.kho .dot{flex:none;display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--kdn-line,#d9d6cf)}.kho .dot.on{background:#22a06b}
.kho-role li .tx{flex:1;min-width:0;font-size:13.5px;line-height:1.4;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:keep-all}
.kho-role li small{flex:none;font-size:11.5px;color:var(--kdn-muted,#8a8f99)}
.kho-role li .go{flex:none;color:var(--kdn-muted,#c3c6cc);opacity:0}.kho-role li>button:hover .go,.kho-role li>button.on .go{opacity:1}
.kho-role .mng-duty{display:flex;gap:4px;padding:3px 4px}.kho-role .mng-duty input{flex:1;min-width:0}
.kho-role .add-duty{margin:0 8px 8px;height:28px;padding:0 10px;border-radius:8px;border:1px dashed var(--kdn-line,#d9d6cf);background:transparent;color:var(--kdn-ink-soft,#5b606b);font:inherit;font-size:12.5px;cursor:pointer}
.kho-list .add-role{display:flex;align-items:center;justify-content:center;gap:6px;height:40px;border-radius:12px;border:1px dashed var(--kdn-line,#d9d6cf);background:transparent;color:var(--kdn-ink-soft,#3d4048);font:inherit;font-weight:700;cursor:pointer}
.kho-list .common{margin:2px 4px 0;font-size:12.5px;line-height:1.5;color:var(--kdn-muted,#8a8f99)}.kho-list .common b{color:var(--kdn-ink-soft,#5b606b)}
.kho-main{min-width:0}
.kho-guide{display:grid;gap:6px;padding:28px;border-radius:16px;border:1px dashed var(--kdn-line,#d9d6cf);color:var(--kdn-ink-soft,#5b606b)}
.kho-guide b{font-size:16px;color:var(--kdn-ink,#17181d)}.kho-guide p{margin:0;font-size:14px;line-height:1.6}.kho-guide em{font-style:normal;font-weight:800;color:var(--kdn-ink,#17181d)}.kho-guide .dot{margin:0 2px 1px 4px;vertical-align:middle}
.kho-task{display:grid;gap:12px}
.kho-head{display:grid;gap:4px;padding:16px 18px;border-radius:16px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#ebe9e4)}
.kho-head .back{display:none;justify-self:start;margin-bottom:4px;height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:var(--kdn-ink-soft,#3d4048);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.kho-head .crumb{font-size:12.5px;font-weight:700;color:var(--kdn-muted,#8a8f99)}
.kho-head .row{display:flex;align-items:flex-start;gap:10px}
.kho-head h2{flex:1;min-width:0;margin:0;font-size:21px;font-weight:800;line-height:1.35;letter-spacing:-.02em;word-break:keep-all}
.kho-head .acts{display:flex;align-items:center;gap:6px;flex:none}
.kho-head .x{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;border:0;background:transparent;color:var(--kdn-muted,#8a8f99);cursor:pointer}.kho-head .x:hover{background:var(--kho-soft)}
.kho-head .meta{font-size:12.5px;color:var(--kdn-muted,#8a8f99)}
@media (max-width:960px){.kho-head .back{display:inline-flex;align-items:center}.kho-head .x{display:none}}
@media (max-width:560px){.kho-head .row{flex-direction:column}.kho-head .acts{align-self:stretch}.kho-head .acts>*{flex:1}.kho-head .acts .share-wrap .kho-ghost{width:100%}}
.share-wrap{position:relative;display:inline-flex}
.kho-pop{position:absolute;right:0;top:calc(100% + 6px);z-index:30;width:280px;display:grid;gap:2px;padding:6px;border-radius:14px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e2dfd8);box-shadow:0 16px 40px rgba(20,24,33,.16)}
.kho-pop>button{display:flex;gap:10px;align-items:flex-start;padding:9px 10px;border-radius:10px;border:0;background:transparent;text-align:left;color:inherit;font:inherit;cursor:pointer}.kho-pop>button:hover{background:var(--kho-soft)}
.kho-pop>button svg{margin-top:2px;color:var(--kdn-ink-soft,#5b606b)}.kho-pop span{display:grid;gap:1px}.kho-pop b{font-size:13.5px}.kho-pop small{font-size:12px;color:var(--kdn-muted,#8a8f99)}
.kho-pop .eds{display:grid;gap:6px;margin-top:4px;padding:10px;border-top:1px solid var(--kdn-line,#eceae5)}.kho-pop .eds>b{display:flex;align-items:center;gap:5px}
.kho-pop .eds ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px}.kho-pop .eds li{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 4px 0 9px;border-radius:99px;background:var(--kho-soft);font-size:12.5px;font-weight:700}
.kho-pop .eds li button{display:grid;place-items:center;width:18px;height:18px;border:0;border-radius:50%;background:transparent;color:var(--kdn-muted,#8a8f99);cursor:pointer}
.kho-pop select{height:32px;padding:0 8px;border-radius:8px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#17181d);font:inherit;font-size:13px}
.kho-parts{display:grid;gap:8px;padding:14px 16px;border-radius:16px;background:color-mix(in srgb,#2563eb 5%,var(--kdn-surface,#fff));border:1px solid color-mix(in srgb,#2563eb 18%,var(--kdn-line,#ebe9e4))}
.kho-parts .hd{display:flex;align-items:center;gap:8px}.kho-parts .hd b{font-size:13.5px}
.kho-parts .tag{font-size:11.5px;font-weight:800;color:#1d4ed8;padding:2px 8px;border-radius:99px;background:color-mix(in srgb,#2563eb 12%,transparent)}
.kho-parts .lnk{margin-left:auto;border:0;background:none;color:#1d4ed8;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;padding:0}
.kho-parts .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}
.kho-parts .part{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:10px;row-gap:2px;padding:10px 12px;border-radius:12px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0);cursor:pointer;text-align:left}
.kho-parts .part.me{border-color:#2563eb;cursor:default;box-shadow:0 0 0 1px #2563eb}
.kho-parts .part .no{grid-row:1/3;display:grid;place-items:center;width:26px;height:26px;border-radius:8px;background:#1d4ed8;color:#fff;font-size:13px;font-weight:800}
.kho-parts .part:not(.me) .no{background:var(--kho-soft);color:var(--kdn-ink-soft,#5b606b)}
.kho-parts .who{font-size:12px;font-weight:700;color:var(--kdn-muted,#8a8f99)}
.kho-parts .pt{font-size:13.5px;font-weight:700;line-height:1.45}.kho-parts .pt.nil{font-weight:500;color:var(--kdn-muted,#a4a8b1)}
.kho-parts input{height:32px;padding:0 10px;border-radius:8px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#17181d);font:inherit;font-size:13px}
.kho-brief{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
.kho-brief .it{display:grid;gap:6px;align-content:start;padding:14px 16px;border-radius:16px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#ebe9e4);border-top:3px solid var(--kdn-line,#d9d6cf)}
.kho-brief .k-summary{border-top-color:var(--kho-acc)}.kho-brief .k-must{border-top-color:#dc2626}.kho-brief .k-changes{border-top-color:#2563eb}
.kho-brief .it b{font-size:12.5px;font-weight:800;color:var(--kdn-ink-soft,#5b606b)}
.kho-brief .it p{margin:0;font-size:14px;line-height:1.6;white-space:pre-wrap;word-break:keep-all}
.kho textarea{width:100%;box-sizing:border-box;resize:none;padding:8px 10px;border-radius:10px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#17181d);font:inherit;font-size:13.5px;line-height:1.6;overflow:hidden}
.kho textarea:focus,.kho input:focus,.kho select:focus{outline:0;border-color:var(--kho-acc);box-shadow:0 0 0 3px color-mix(in srgb,var(--kho-acc) 16%,transparent)}
.kho-card{display:grid;gap:12px;padding:6px 18px 18px;border-radius:16px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#ebe9e4)}
.kho-tabs{display:flex;gap:4px;border-bottom:1px solid var(--kdn-line,#eceae5);margin:0 -18px;padding:0 12px}
.kho-tabs button{position:relative;display:inline-flex;align-items:center;gap:6px;height:44px;padding:0 10px;border:0;background:none;color:var(--kdn-muted,#8a8f99);font:inherit;font-size:14px;font-weight:700;cursor:pointer}
.kho-tabs button small{font-size:11.5px;font-weight:800;padding:1px 7px;border-radius:99px;background:var(--kho-soft);color:var(--kdn-ink-soft,#5b606b)}
.kho-tabs button.on{color:var(--kdn-ink,#17181d)}.kho-tabs button.on::after{content:"";position:absolute;left:8px;right:8px;bottom:-1px;height:2px;border-radius:2px;background:var(--kdn-ink,#17181d)}
.kho-empty{display:grid;gap:12px;justify-items:start;padding:18px 0 6px}.kho-empty p{margin:0;font-size:14px;color:var(--kdn-ink-soft,#5b606b)}.kho-empty .row{display:flex;flex-wrap:wrap;gap:6px}
.kho-tl{list-style:none;margin:4px 0 0;padding:0;display:grid}
.kho-tl>li{display:grid;grid-template-columns:52px minmax(0,1fr);gap:12px;position:relative}
.kho-tl>li::before{content:"";position:absolute;left:25px;top:30px;bottom:0;width:2px;background:var(--kdn-line,#eceae5)}
.kho-tl>li:last-child::before{display:none}
.kho-tl .mo{position:relative;z-index:1;align-self:start;display:grid;place-items:center;height:26px;margin-top:6px;border-radius:99px;background:var(--kdn-ink,#17181d);color:var(--kdn-surface,#fff);font-size:12px;font-weight:800}
.kho-tl .mo.nil{background:var(--kho-soft);color:var(--kdn-ink-soft,#5b606b)}
.kho-tl .steps{display:grid;gap:2px;padding-bottom:14px}
.kho-step{display:flex;gap:10px;padding:8px 6px;border-radius:10px}
.kho-step .ck{flex:none;display:grid;place-items:center;width:20px;height:20px;margin-top:2px;border-radius:50%;border:1.5px solid var(--kdn-line,#c9c5bd);background:var(--kdn-surface,#fff);color:#fff;cursor:pointer;padding:0}
.kho-step .ck[aria-pressed=true]{background:#22a06b;border-color:#22a06b}.kho-step .ck:disabled{cursor:default}
.kho-step .bd{display:grid;gap:4px;min-width:0}
.kho-step .bd b{font-size:14.5px;font-weight:800;line-height:1.45}.kho-step .bd b em{margin-left:8px;font-style:normal;font-size:12px;font-weight:700;color:var(--kdn-muted,#8a8f99)}
.kho-step .bd p{margin:0;font-size:13.5px;line-height:1.6;color:var(--kdn-ink-soft,#5b606b);white-space:pre-wrap;word-break:keep-all}
.kho-step.done .bd b{color:var(--kdn-muted,#8a8f99)}
.kho-step.edit{display:grid;gap:6px;padding:10px;border:1px solid var(--kdn-line,#e7e5e0);margin-bottom:6px}
.kho-step.edit .er{display:flex;align-items:center;gap:6px}
.kho-step.edit select,.kho-step.edit input{height:34px;padding:0 8px;border-radius:8px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#17181d);font:inherit;font-size:13px}
.kho-step.edit select{width:68px}.kho-step.edit .tt{flex:1;min-width:0;font-weight:700;font-size:14px}.kho-step.edit .wh{width:64px}
.kho-step.edit .ops{display:inline-flex}.kho-step.edit .ops button{display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:8px;background:transparent;color:var(--kdn-muted,#a4a8b1);cursor:pointer}.kho-step.edit .ops button:hover{background:var(--kho-soft);color:var(--kdn-ink,#17181d)}
@media (max-width:560px){.kho-step.edit .er{flex-wrap:wrap}.kho-step.edit .tt{flex-basis:100%;order:5}}
.kho-more{justify-self:start;display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 8px;border-radius:8px;border:0;background:transparent;color:var(--kdn-muted,#8a8f99);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}.kho-more:hover{background:var(--kho-soft);color:var(--kdn-ink,#17181d)}
.kho-addrow{display:flex;flex-wrap:wrap;gap:6px;padding-left:64px}
@media (max-width:560px){.kho-addrow{padding-left:0}.kho-tl>li{grid-template-columns:44px minmax(0,1fr);gap:8px}.kho-tl>li::before{left:21px}}
.kho-chips{list-style:none;margin:2px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.kho-chips li{display:inline-flex;align-items:center;max-width:100%;border-radius:8px;background:var(--kho-soft);overflow:hidden}
.kho-chips li a,.kho-chips li .open{display:inline-flex;align-items:center;gap:6px;min-width:0;height:28px;padding:0 9px;color:var(--kdn-ink,#17181d);text-decoration:none;font:inherit;font-size:12.5px;font-weight:700;background:none;border:0;cursor:pointer}
.kho-chips li span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px}.kho-chips li small{font-size:11px;font-weight:600;color:var(--kdn-muted,#8a8f99)}
.kho-chips li .ext{color:var(--kdn-muted,#a4a8b1)}
.kho-chips li>button:not(.open){display:grid;place-items:center;width:24px;height:28px;border:0;background:transparent;color:var(--kdn-muted,#8a8f99);cursor:pointer}
.kho-chips.lg li{border-radius:10px;border:1px solid var(--kdn-line,#e7e5e0);background:var(--kdn-surface,#fff)}.kho-chips.lg li a,.kho-chips.lg li .open{height:40px;padding:0 12px;font-size:13.5px}
.kho-chips .k-sheet svg:first-child{color:#16a34a}.kho-chips .k-doc svg:first-child{color:#2563eb}.kho-chips .k-slide svg:first-child{color:#d97706}.kho-chips .k-form svg:first-child{color:#7c3aed}.kho-chips .k-drive svg:first-child{color:#0e7490}.kho-chips .k-file svg:first-child{color:var(--kho-acc-ink)}
.kho-files{display:grid;gap:12px;padding-top:6px}
.kho-addmat{display:flex;flex-wrap:wrap;gap:6px}.kho-addmat input{flex:2 1 220px;height:36px;padding:0 10px;border-radius:10px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#17181d);font:inherit;font-size:13px}.kho-addmat input.lb{flex:1 1 120px}
.kho-cm{display:grid;gap:10px;padding-top:6px}.kho-cm ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.kho-cm li{padding:10px 12px;border-radius:12px;background:var(--kho-soft)}.kho-cm li.me{background:color-mix(in srgb,var(--kho-acc) 7%,var(--kdn-surface,#fff))}
.kho-cm li header{display:flex;align-items:center;gap:8px}.kho-cm li header b{font-size:13px}.kho-cm li header small{font-size:11.5px;color:var(--kdn-muted,#8a8f99)}
.kho-cm li header button{margin-left:auto;display:grid;place-items:center;width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:var(--kdn-muted,#8a8f99);cursor:pointer}
.kho-cm li p{margin:4px 0 0;font-size:13.5px;line-height:1.6;white-space:pre-wrap}
.kho-cm .new{display:flex;gap:8px;align-items:flex-end}.kho-cm .new textarea{flex:1}.kho-cm .new .kho-pri{flex:none}
.kho-modal{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:16px;background:rgba(15,18,25,.45)}
.kho-modal .box{width:min(640px,100%);max-height:calc(100vh - 32px);overflow:auto;display:grid;gap:10px;padding:18px;border-radius:18px;background:var(--kdn-surface,#fff);color:var(--kdn-ink,#17181d);box-shadow:0 24px 60px rgba(15,18,25,.3)}
.kho-modal header{display:flex;align-items:center}.kho-modal header b{flex:1;font-size:17px}.kho-modal .x{display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:var(--kdn-muted,#8a8f99);cursor:pointer}
.kho-modal p{margin:0;font-size:13.5px;line-height:1.6;color:var(--kdn-ink-soft,#5b606b)}.kho-modal p em{font-style:normal;font-weight:800;color:var(--kdn-ink,#17181d)}
.kho-modal textarea{width:100%;box-sizing:border-box;min-height:150px;padding:10px;border-radius:12px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kho-soft);color:var(--kdn-ink,#17181d);font:13px/1.6 ui-monospace,monospace;resize:vertical}
.kho-modal .pv{display:grid;gap:6px}.kho-modal .pv small{font-size:12.5px;font-weight:800;color:#15803d}
.kho-modal .pv ol{list-style:none;margin:0;padding:0;display:grid;gap:4px}.kho-modal .pv li{display:grid;grid-template-columns:44px minmax(0,auto) minmax(0,1fr);gap:8px;align-items:baseline;font-size:13px}
.kho-modal .pv li em{font-style:normal;font-weight:800;color:var(--kdn-muted,#8a8f99)}.kho-modal .pv li span{color:var(--kdn-muted,#8a8f99);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kho-modal .pv li.more{display:block;color:var(--kdn-muted,#8a8f99)}
.kho-modal footer{display:flex;justify-content:flex-end;gap:6px}

/* ── 구분감: 면 색·띠·배지 ── */
.kho{--kho-s1:#ea580c;--kho-s1-soft:color-mix(in srgb,#ff7a3d 9%,var(--kdn-surface,#fff));--kho-s2:#2563eb;--kho-s2-soft:color-mix(in srgb,#2563eb 8%,var(--kdn-surface,#fff))}
.kho-top{padding:12px 14px;border-radius:16px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#ebe9e4)}
.kho-top .depts button{background:var(--kho-soft)}
.kho-role{overflow:hidden;box-shadow:0 1px 2px rgba(20,24,33,.04)}
.kho-role>header{min-height:42px;padding:6px 8px 6px 10px;background:var(--kho-soft);border-bottom:1px solid var(--kdn-line,#ebe9e4)}
.kho-role .rn{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:99px;background:var(--kdn-ink,#17181d);color:var(--kdn-surface,#fff)!important;font-size:12px!important}
.kho-role.mine>header{background:color-mix(in srgb,var(--kho-acc) 14%,var(--kdn-surface,#fff));border-bottom-color:color-mix(in srgb,var(--kho-acc) 30%,transparent)}
.kho-role.mine .rn{background:var(--kho-acc)}
.kho-role .who{font-weight:700}
.kho-role .claim{border:1px solid color-mix(in srgb,var(--kho-acc) 45%,transparent);background:var(--kdn-surface,#fff)}
.kho-role ul{padding:4px}
.kho-role li+li{border-top:1px dashed var(--kdn-line,#eceae5)}
.kho-role li>button{min-height:40px}
.kho-role li .st{flex:none;display:inline-block;width:15px;height:15px;border-radius:50%;border:1.5px solid var(--kdn-line,#d4d1ca);box-sizing:border-box}
.kho-role li svg.st{border:0;color:#16a34a}
.kho-role li small{padding:1px 7px;border-radius:99px;background:color-mix(in srgb,#16a34a 12%,transparent);color:#15803d;font-weight:800}
.kho-role li>button.on{background:color-mix(in srgb,var(--kho-acc) 13%,var(--kdn-surface,#fff));box-shadow:inset 3px 0 0 var(--kho-acc)}
.kho-guide{background:var(--kdn-surface,#fff)}.kho-guide .gk{color:#16a34a;vertical-align:-2px}
.kho-head{border-left:5px solid var(--kho-acc);background:linear-gradient(90deg,color-mix(in srgb,var(--kho-acc) 7%,var(--kdn-surface,#fff)),var(--kdn-surface,#fff) 60%)}
.kho-head .crumb{display:inline-flex;align-self:start;width:max-content;max-width:100%;padding:2px 10px;border-radius:99px;background:color-mix(in srgb,var(--kho-acc) 12%,transparent);color:var(--kho-acc-ink)}
.kho-brief .it{border-top:0;border-left:4px solid var(--kdn-line,#d9d6cf)}
.kho-brief .it b{display:inline-flex;align-items:center;gap:5px}
.kho-brief .k-summary{background:color-mix(in srgb,var(--kho-acc) 7%,var(--kdn-surface,#fff));border-left-color:var(--kho-acc)}.kho-brief .k-summary b{color:var(--kho-acc-ink)}
.kho-brief .k-must{background:color-mix(in srgb,#dc2626 6%,var(--kdn-surface,#fff));border-left-color:#dc2626}.kho-brief .k-must b{color:#b42318}
.kho-brief .k-changes{background:color-mix(in srgb,#2563eb 6%,var(--kdn-surface,#fff));border-left-color:#2563eb}.kho-brief .k-changes b{color:#1d4ed8}
.kho-tabs{background:var(--kho-soft);border-radius:16px 16px 0 0;margin-top:-6px;padding-top:4px}
.kho-tabs button.on{color:var(--kho-acc-ink)}.kho-tabs button.on::after{background:var(--kho-acc)}
.kho-tabs button.on small{background:var(--kho-acc);color:#fff}
.kho-tl .mo.s1{background:var(--kho-s1)}.kho-tl .mo.s2{background:var(--kho-s2)}
.kho-tl>li.s1::before{background:color-mix(in srgb,var(--kho-s1) 30%,transparent)}.kho-tl>li.s2::before{background:color-mix(in srgb,var(--kho-s2) 30%,transparent)}
.kho-tl .steps{gap:8px}
.kho-step:not(.edit){padding:10px 12px;border-radius:12px;background:var(--kho-soft);border-left:3px solid var(--kdn-line,#d9d6cf)}
.kho-tl>li.s1 .kho-step:not(.edit){background:var(--kho-s1-soft);border-left-color:color-mix(in srgb,var(--kho-s1) 55%,transparent)}
.kho-tl>li.s2 .kho-step:not(.edit){background:var(--kho-s2-soft);border-left-color:color-mix(in srgb,var(--kho-s2) 55%,transparent)}
.kho-step.done:not(.edit){background:color-mix(in srgb,#16a34a 8%,var(--kdn-surface,#fff))!important;border-left-color:#16a34a!important}
.kho-step.edit{background:var(--kdn-surface,#fff);box-shadow:0 1px 3px rgba(20,24,33,.06)}
.kho-tl>li.s1 .kho-step.edit{border-left:3px solid var(--kho-s1)}.kho-tl>li.s2 .kho-step.edit{border-left:3px solid var(--kho-s2)}
.kho-chips li{background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e2dfd8)}
.kho-chips .k-sheet{background:color-mix(in srgb,#16a34a 8%,var(--kdn-surface,#fff));border-color:color-mix(in srgb,#16a34a 30%,transparent)}
.kho-chips .k-doc{background:color-mix(in srgb,#2563eb 8%,var(--kdn-surface,#fff));border-color:color-mix(in srgb,#2563eb 30%,transparent)}
.kho-chips .k-drive{background:color-mix(in srgb,#0e7490 8%,var(--kdn-surface,#fff));border-color:color-mix(in srgb,#0e7490 30%,transparent)}
.kho-chips .k-file{background:color-mix(in srgb,var(--kho-acc) 8%,var(--kdn-surface,#fff));border-color:color-mix(in srgb,var(--kho-acc) 30%,transparent)}
.kho-cm li{border-left:3px solid var(--kdn-line,#d9d6cf)}.kho-cm li.me{border-left-color:var(--kho-acc)}

/* ── 정렬·가독성(반편성 분리 화면 기준: 본문 14.5px, 줄 간격 1.55~1.65, 칸 폭 같은 탭) ── */
.kho{line-height:1.55;font-size:14.5px}
.kho p,.kho .tx,.kho .pt,.kho .bd b{word-break:keep-all;overflow-wrap:anywhere}
.kho-top{padding:14px 18px}.kho-top .ttl{font-size:19px}
.kho-role>header{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px}
.kho-role>header .who{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kho-role>header .me,.kho-role>header .claim{margin-left:0;justify-self:end}
.kho-role li>button{display:grid;grid-template-columns:18px minmax(0,1fr) auto;align-items:start;gap:8px;padding:9px 10px}
.kho-role li>button .st{margin-top:3px}
.kho-role li .tx{display:block;-webkit-line-clamp:unset;overflow:visible;font-size:14px;line-height:1.5}
.kho-role li small{margin-top:1px;align-self:start}
.kho-role li .go{display:none}
.kho-head{gap:8px;padding:20px 22px}
.kho-head .row{align-items:center}
.kho-head h2{font-size:22px;line-height:1.3}
.kho-head .chips{display:flex;flex-wrap:wrap;gap:6px}
.kho-head .chips em{font-style:normal;padding:3px 10px;border-radius:999px;background:var(--kho-soft);font-size:13px;font-weight:700;color:var(--kdn-ink-soft,#3d4048)}
.kho-head .chips em.d{background:color-mix(in srgb,var(--kho-acc) 13%,transparent);color:var(--kho-acc-ink)}
.kho-head .chips em.o.nil{color:var(--kdn-muted,#8a8f99)}
.kho-head .meta{font-size:12.5px}
.kho-parts{padding:16px 18px}
.kho-parts .part{align-items:center;padding:12px 14px}
.kho-parts .pt{font-size:14.5px;line-height:1.5}
.kho-brief .it{padding:16px 18px;gap:8px}
.kho-brief .it p{font-size:14.5px;line-height:1.65}
.kho-card{padding:0 22px 20px}
.kho-tabs{gap:4px;margin:0 -22px;padding:0 10px;border-bottom:1.5px solid var(--kdn-line,#e7e5e0);border-radius:16px 16px 0 0}
.kho-tabs button{flex:1 1 0;justify-content:center;gap:10px;height:auto;min-height:52px;margin-bottom:-1.5px;border-bottom:3px solid transparent}
.kho-tabs button::after{display:none}
.kho-tabs button b{font-size:15px;font-weight:800}
.kho-tabs button span{min-width:28px;padding:1px 9px;border-radius:999px;background:var(--kdn-surface,#fff);font-size:13px;font-weight:800;color:var(--kdn-ink-soft,#3d4048);text-align:center}
.kho-tabs button.on{color:var(--kdn-ink,#17181d);border-bottom-color:var(--kho-acc)}
.kho-tabs button.on span{background:var(--kho-acc);color:#fff}
.kho-tl{margin-top:8px}
.kho-tl>li{grid-template-columns:56px minmax(0,1fr);gap:14px}
.kho-tl>li::before{left:27px}
.kho-tl .mo{height:28px;margin-top:10px;font-size:13px}
.kho-step:not(.edit){padding:12px 14px;gap:12px}
.kho-step .bd{gap:5px}
.kho-step .bd b{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;font-size:15px;line-height:1.45}
.kho-step .bd b em{margin-left:0;padding:1px 8px;border-radius:99px;background:var(--kdn-surface,#fff);font-size:12px}
.kho-step .bd p{font-size:14px;line-height:1.65}
.kho-step .ck{margin-top:1px}
.kho-cm li p{font-size:14px;line-height:1.65}
.kho-empty p{font-size:14.5px;line-height:1.6}
@media (max-width:560px){.kho-head{padding:16px}.kho-head h2{font-size:19px}.kho-card{padding:0 14px 16px}.kho-tabs{margin:0 -14px;padding:0 4px}.kho-tabs button{gap:6px;min-height:46px}.kho-tabs button b{font-size:14px}.kho-tl>li{grid-template-columns:46px minmax(0,1fr);gap:10px}.kho-tl>li::before{left:22px}}

.kho-tabs button{min-width:0;white-space:nowrap}
.kho-modal{--kho-soft:var(--kdn-surface-2,color-mix(in srgb,currentColor 7%,transparent))}
@media (max-width:560px){.kho-head .row{flex-direction:column;align-items:stretch}.kho-head h2{text-align:left}.kho-tabs button{padding:8px 4px}.kho-tabs button span{min-width:22px;padding:0 6px;font-size:12px}}

.kho-list .mng-hint{margin:0;padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--kho-acc) 9%,var(--kdn-surface,#fff));border:1px solid color-mix(in srgb,var(--kho-acc) 30%,transparent);font-size:13px;line-height:1.55;color:var(--kho-acc-ink)}

.kho-who-filter{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.kho-who-filter button{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:99px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:var(--kdn-ink-soft,#3d4048);font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.kho-who-filter button small{font-size:11.5px;font-weight:800;color:var(--kdn-muted,#8a8f99)}
.kho-who-filter button.on{background:var(--kdn-ink,#17181d);border-color:var(--kdn-ink,#17181d);color:var(--kdn-surface,#fff)}.kho-who-filter button.on small{color:inherit;opacity:.8}
.kho-who{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:99px;font-size:12px;font-weight:800;white-space:nowrap}
.kho-who.t0{background:color-mix(in srgb,#2563eb 14%,transparent);color:#1d4ed8}
.kho-who.t1{background:color-mix(in srgb,#7c3aed 14%,transparent);color:#6d28d9}
.kho-who.t2{background:color-mix(in srgb,#0d9488 14%,transparent);color:#0f766e}
.kho-who.t3{background:color-mix(in srgb,#db2777 14%,transparent);color:#be185d}
.kho-who.ta{background:color-mix(in srgb,#16a34a 14%,transparent);color:#15803d}
.kho-step.edit select.who{width:auto;max-width:130px}
@media (max-width:560px){.kho-step.edit select.who{order:6;flex:1 1 100%;max-width:none}}

/* ── 단계 카드 가독성: 흰 카드 + 달 색 테두리, 제목 줄 오른쪽에 담당·때, 내용은 목록·메모로 ── */
.kho-step:not(.edit){background:var(--kdn-surface,#fff)!important;border:1px solid var(--kdn-line,#e7e5e0);border-left:4px solid var(--kdn-line,#d9d6cf);padding:14px 16px;gap:12px;box-shadow:0 1px 2px rgba(20,24,33,.04)}
.kho-tl>li.s1 .kho-step:not(.edit){border-left-color:var(--kho-s1)}
.kho-tl>li.s2 .kho-step:not(.edit){border-left-color:var(--kho-s2)}
.kho-step.done:not(.edit){background:color-mix(in srgb,#16a34a 5%,var(--kdn-surface,#fff))!important;border-left-color:#16a34a!important}
.kho-step .bd{flex:1;gap:8px}
.kho-step .hl{display:flex;flex-wrap:wrap;align-items:flex-start;gap:6px 12px}
.kho-step .hl .tt{flex:1 1 260px;min-width:0;font-size:15.5px;font-weight:800;line-height:1.45;word-break:keep-all}
.kho-step .hl .mt{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px;margin-left:auto}
.kho-step .hl .wh{font-style:normal;height:22px;display:inline-flex;align-items:center;padding:0 9px;border-radius:99px;background:var(--kho-soft);font-size:12px;font-weight:700;color:var(--kdn-ink-soft,#5b606b)}
.kho-step.done .hl .tt{color:var(--kdn-muted,#8a8f99);text-decoration:line-through;text-decoration-color:color-mix(in srgb,#16a34a 55%,transparent)}
.kho-detail{display:grid;gap:6px;max-width:78ch;font-size:14px;line-height:1.65;color:var(--kdn-ink-soft,#3d4048)}
.kho-detail .dp{margin:0;word-break:keep-all;overflow-wrap:anywhere}
.kho-detail .dl{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.kho-detail .dl li{display:grid;grid-template-columns:22px minmax(0,1fr);align-items:baseline;word-break:keep-all;overflow-wrap:anywhere}
.kho-detail .dl .mk{font-weight:800;color:var(--kdn-muted,#8a8f99);font-size:13px}
.kho-detail .dn{margin:0;display:flex;gap:6px;align-items:flex-start;padding:7px 10px;border-radius:8px;background:color-mix(in srgb,#ca8a04 9%,var(--kdn-surface,#fff));color:#854d0e;font-size:13px;line-height:1.55}
.kho-detail .dn svg{flex:none;margin-top:3px}
.kho-tl .steps{gap:10px}
`;
