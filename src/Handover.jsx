// 선생님 ZONE '업무 인수인계': 부서별 업무분장(담당 → 세부 업무)을 보고, 세부 업무마다
// 한눈 요약 · 타임라인(3월→2월) · 자료(시트·문서 링크, 파일) · 코멘트를 남겨 다음 해 담당 선생님에게 넘깁니다.
// - 보기·코멘트: 교직원 모두 / 내용 고치기: 그 담당 선생님 · 관리자 · 부서 계정 · 학년부장
// - 구조(부서·담당·세부 업무) 고치기: 관리자 · 부서 계정 · 학년부장('업무분장 고치기')
import React from "react";
import { ArrowDown, ArrowUp, Check, ChevronRight, ExternalLink, FileSpreadsheet, FileText, FolderOpen, Link2, Loader2, MessageSquare, Paperclip, Pencil, Plus, Presentation, Search, Trash2, UserCheck, Wand2, X, ClipboardList, Film, Palette, Globe, Users } from "lucide-react";
import { readStorage, updateStorage, uploadClassroomAttachment } from "./storage.js";
import { HANDOVER_KEY, handoverTaskKey, normalizeHandover, normalizeTask, emptyTask, newStep, newLink, newComment, groupSteps, linkKind, safeUrl, stepTemplate, taskProgress, SCHOOL_MONTHS } from "./handover.js";

const KIND_ICON = { sheet: FileSpreadsheet, doc: FileText, slide: Presentation, form: ClipboardList, drive: FolderOpen, design: Palette, video: Film, web: Globe };
const fmtAt = iso => { if (!iso) return ""; const d = new Date(iso); if (Number.isNaN(d.getTime())) return ""; return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

async function openFile(file) {
  if (file.dataKey) {
    const stored = await readStorage(file.dataKey, null);
    if (!stored?.dataUrl) throw new Error("파일을 찾지 못했어요.");
    const a = document.createElement("a"); a.href = stored.dataUrl; a.download = file.fileName || stored.fileName || "첨부파일";
    document.body.appendChild(a); a.click(); a.remove(); return;
  }
  if (file.url) window.open(file.url, "_blank", "noopener,noreferrer");
}

export default function Handover({ actor = null, accounts = null, canManage = false, isTeacher = false, showToast = () => {} }) {
  const [data, setData] = React.useState(null);
  const [deptId, setDeptId] = React.useState("");
  const [dutyId, setDutyId] = React.useState("");
  const [mineOnly, setMineOnly] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [manage, setManage] = React.useState(false);
  const myId = String(actor?.id || "");

  React.useEffect(() => {
    let on = true;
    readStorage(HANDOVER_KEY, null).then(raw => { if (!on) return; const v = normalizeHandover(raw); setData(v); setDeptId(id => id || v.depts[0]?.id || ""); })
      .catch(() => on && setData(normalizeHandover(null)));
    return () => { on = false; };
  }, []);
  const saveStructure = async change => {
    const result = await updateStorage(HANDOVER_KEY, null, current => ({ ...change(normalizeHandover(current)), updatedAt: new Date().toISOString() }));
    if (result?.ok === false) { showToast("저장하지 못했어요. 잠시 뒤 다시 해 주세요.", "error"); return false; }
    setData(normalizeHandover(result?.value)); return true;
  };
  const onMeta = (id, meta) => saveStructure(v => ({ ...v, meta: { ...(v.meta || {}), [id]: meta } }));

  if (!data) return <div className="kho"><style>{CSS}</style><p className="kho-loading"><Loader2 size={16} className="spin" /> 업무 인수인계를 불러오는 중이에요.</p></div>;
  const dept = data.depts.find(d => d.id === deptId) || data.depts[0];
  const roles = data.roles.filter(r => r.deptId === dept?.id);
  const q = query.trim();
  const visibleRoles = roles.filter(r => !mineOnly || r.ownerId === myId).map(r => ({ ...r, duties: q ? r.duties.filter(d => d.text.includes(q)) : r.duties })).filter(r => !q || r.duties.length);
  const found = data.roles.flatMap(r => r.duties.map(d => ({ duty: d, role: r }))).find(x => x.duty.id === dutyId);
  const canEditRole = role => !!role && (canManage || (isTeacher && myId && role.ownerId === myId));
  const teachers = (accounts?.teacher || []).filter(t => t?.id && t?.name);

  const claim = (role, on) => saveStructure(v => ({ ...v, roles: v.roles.map(r => r.id === role.id ? { ...r, ownerId: on ? myId : "", ownerName: on ? String(actor?.name || "") : "" } : r) }))
    .then(ok => ok && showToast(on ? "내 담당으로 정했어요. 이제 이 담당의 업무를 적을 수 있어요." : "담당을 풀었어요.", "success"));
  const editRole = (roleId, patch) => saveStructure(v => ({ ...v, roles: v.roles.map(r => r.id === roleId ? { ...r, ...patch } : r) }));
  const editDuties = (roleId, fn) => saveStructure(v => ({ ...v, roles: v.roles.map(r => r.id === roleId ? { ...r, duties: fn(r.duties) } : r) }));
  const addRole = () => saveStructure(v => ({ ...v, roles: [...v.roles, { id: `role_${Date.now().toString(36)}`, deptId: dept.id, title: "", ownerId: "", ownerName: "", order: v.roles.length, duties: [{ id: `duty_${Date.now().toString(36)}`, text: "새 업무" }] }] }));
  const removeRole = role => { if (window.confirm("이 담당을 지울까요? 적어 둔 업무 내용은 남지만 목록에서 사라져요.")) saveStructure(v => ({ ...v, roles: v.roles.filter(r => r.id !== role.id) })); };
  const addDept = () => { const name = window.prompt("새 부서 이름(예: 교무부, 1학년부)"); if (!name?.trim()) return; const id = `dept_${Date.now().toString(36)}`; saveStructure(v => ({ ...v, depts: [...v.depts, { id, name: name.trim(), order: v.depts.length, common: "" }] })).then(ok => ok && setDeptId(id)); };
  const renameDept = () => { const name = window.prompt("부서 이름", dept.name); if (!name?.trim()) return; saveStructure(v => ({ ...v, depts: v.depts.map(d => d.id === dept.id ? { ...d, name: name.trim() } : d) })); };
  const removeDept = () => { if (roles.length) { showToast("담당이 남아 있는 부서는 지울 수 없어요. 담당을 먼저 지워 주세요.", "error"); return; } if (window.confirm(`'${dept.name}' 부서를 지울까요?`)) saveStructure(v => ({ ...v, depts: v.depts.filter(d => d.id !== dept.id) })).then(() => setDeptId("")); };

  return <div className="kho"><style>{CSS}</style>
    <header className="kho-top">
      <div className="tt"><b>업무 인수인계</b><span>맡은 업무를 타임라인으로 정리하고 시트·파일·코멘트를 남겨, 다음 담당 선생님이 그대로 이어받게 해요.</span></div>
      <div className="depts" role="tablist">{data.depts.map(d => <button key={d.id} type="button" data-kdn-bare role="tab" aria-selected={d.id === dept?.id} className={d.id === dept?.id ? "on" : ""} onClick={() => { setDeptId(d.id); setDutyId(""); }}>{d.name}<small>{data.roles.filter(r => r.deptId === d.id).length}</small></button>)}
        {canManage && manage && <button type="button" data-kdn-bare className="add" onClick={addDept}><Plus size={13} /> 부서</button>}</div>
    </header>
    <div className={`kho-body${found ? " has-sel" : ""}`}>
      <aside className="kho-list">
        <div className="tools">
          <label className="srch"><Search size={14} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="업무 찾기" /></label>
          {isTeacher && <button type="button" data-kdn-bare className={`chip${mineOnly ? " on" : ""}`} onClick={() => setMineOnly(v => !v)}><UserCheck size={13} /> 내 업무</button>}
          {canManage && <button type="button" data-kdn-bare className={`chip${manage ? " on" : ""}`} onClick={() => setManage(v => !v)}><Pencil size={13} /> {manage ? "다 고쳤어요" : "업무분장 고치기"}</button>}
        </div>
        {manage && dept && <div className="mng-dept"><b>{dept.name}</b><button type="button" data-kdn-bare onClick={renameDept}>이름 바꾸기</button><button type="button" data-kdn-bare onClick={removeDept}>부서 지우기</button></div>}
        {visibleRoles.length === 0 && <p className="none">{mineOnly ? "내 담당이 아직 없어요. 목록에서 맡은 담당의 '내 담당으로'를 눌러 주세요." : q ? "찾는 업무가 없어요." : "아직 담당이 없어요."}</p>}
        {visibleRoles.map(role => <section key={role.id} className={`kho-role${role.ownerId && role.ownerId === myId ? " mine" : ""}`}>
          <header>
            <span className="no">{role.title || `담당 ${roles.findIndex(r => r.id === role.id) + 1}`}</span>
            {manage ? <select value={role.ownerId} onChange={e => { const t = teachers.find(x => String(x.id) === e.target.value); editRole(role.id, { ownerId: t ? String(t.id) : "", ownerName: t ? String(t.name) : "" }); }}><option value="">담당 선생님 미정</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
              : <span className="who">{role.ownerName ? `${role.ownerName} 선생님` : "담당 미정"}</span>}
            {!manage && isTeacher && !role.ownerId && <button type="button" data-kdn-bare className="claim" onClick={() => claim(role, true)}>내 담당으로</button>}
            {!manage && isTeacher && role.ownerId === myId && <button type="button" data-kdn-bare className="claim off" onClick={() => claim(role, false)}>담당 풀기</button>}
            {manage && <span className="mng"><input defaultValue={role.title} placeholder="담당 이름(예: 부장)" onBlur={e => e.target.value !== role.title && editRole(role.id, { title: e.target.value.trim() })} /><button type="button" data-kdn-bare title="담당 지우기" onClick={() => removeRole(role)}><Trash2 size={13} /></button></span>}
          </header>
          <ul>{role.duties.map(duty => { const m = data.meta?.[duty.id]; return <li key={duty.id}>
            {manage ? <span className="mng-duty"><input defaultValue={duty.text} onBlur={e => e.target.value.trim() && e.target.value !== duty.text && editDuties(role.id, list => list.map(d => d.id === duty.id ? { ...d, text: e.target.value.trim() } : d))} /><button type="button" data-kdn-bare title="세부 업무 지우기" onClick={() => window.confirm("이 세부 업무를 목록에서 지울까요?") && editDuties(role.id, list => list.filter(d => d.id !== duty.id))}><X size={13} /></button></span>
              : <button type="button" data-kdn-bare className={duty.id === dutyId ? "on" : ""} onClick={() => { setDutyId(duty.id); if (window.matchMedia?.("(max-width: 960px)").matches) window.scrollTo({ top: 0 }); }}><span className="tx">{duty.text}</span>
                <span className="mt">{m?.steps ? <em title="타임라인 단계">{m.done || 0}/{m.steps}단계</em> : null}{m?.files ? <em title="자료"><Paperclip size={11} />{m.files}</em> : null}{m?.comments ? <em title="코멘트"><MessageSquare size={11} />{m.comments}</em> : null}{!m?.steps && !m?.files ? <em className="empty">아직 비어 있음</em> : null}</span><ChevronRight size={14} className="go" /></button>}
          </li>; })}</ul>
          {manage && <button type="button" data-kdn-bare className="add-duty" onClick={() => editDuties(role.id, list => [...list, { id: `duty_${Date.now().toString(36)}`, text: "새 세부 업무" }])}><Plus size={13} /> 세부 업무</button>}
        </section>)}
        {manage && <button type="button" data-kdn-bare className="add-role" onClick={addRole}><Plus size={14} /> 담당 추가</button>}
        {dept?.common && <p className="common"><b>공동</b>{dept.common}</p>}
      </aside>
      <main className="kho-main">
        {found ? <TaskPanel key={found.duty.id} duty={found.duty} role={found.role} roleLabel={found.role.title || `담당 ${data.roles.filter(r => r.deptId === found.role.deptId).findIndex(r => r.id === found.role.id) + 1}`} dept={data.depts.find(d => d.id === found.role.deptId)} canEdit={canEditRole(found.role)} actor={actor} showToast={showToast} onMeta={onMeta} onClose={() => setDutyId("")} />
          : <div className="kho-guide">
            <Users size={26} />
            <b>왼쪽에서 업무를 골라 주세요</b>
            <ol>
              <li>맡은 담당에서 <em>내 담당으로</em>를 눌러요. 내 담당의 업무만 고칠 수 있어요.</li>
              <li>업무를 열어 <em>한눈에 보기</em>에 목적과 꼭 알아둘 것을 적어요.</li>
              <li><em>타임라인</em>에 달마다 한 일을 적고, 관련 시트·문서 링크나 파일을 붙여요.</li>
              <li>다음 담당 선생님은 <em>코멘트</em>로 궁금한 점을 물어볼 수 있어요.</li>
            </ol>
          </div>}
      </main>
    </div>
  </div>;
}

function TaskPanel({ duty, role, roleLabel = "", dept, canEdit, actor, showToast, onMeta, onClose }) {
  const key = handoverTaskKey(duty.id);
  const [task, setTask] = React.useState(null);
  const [state, setState] = React.useState("idle"); // idle | dirty | saving | saved
  const ref = React.useRef(null);
  const timer = React.useRef(0);
  React.useEffect(() => { let on = true; readStorage(key, null).then(raw => { if (on) { const t = normalizeTask(raw); ref.current = t; setTask(t); } }).catch(() => on && setTask(emptyTask())); return () => { on = false; clearTimeout(timer.current); }; }, [key]);
  const save = async () => {
    clearTimeout(timer.current);
    const draft = ref.current; if (!draft) return;
    setState("saving");
    const stamp = { updatedAt: new Date().toISOString(), updatedBy: String(actor?.name || "") };
    // 코멘트는 다른 선생님이 동시에 남길 수 있어 저장된 쪽을 그대로 둬요.
    const result = await updateStorage(key, null, current => { const cur = normalizeTask(current); return { ...cur, summary: draft.summary, must: draft.must, changes: draft.changes, steps: draft.steps, links: draft.links, files: draft.files, ...stamp }; });
    if (result?.ok === false) { setState("dirty"); showToast("저장하지 못했어요. 잠시 뒤 다시 해 주세요.", "error"); return; }
    const saved = normalizeTask(result?.value);
    ref.current = { ...draft, ...stamp, comments: saved.comments }; setTask(ref.current); setState("saved");
    onMeta(duty.id, { ...taskProgress(saved), updatedAt: stamp.updatedAt, updatedBy: stamp.updatedBy });
  };
  const edit = fn => { if (!canEdit) return; const next = fn(ref.current); ref.current = next; setTask(next); setState("dirty"); clearTimeout(timer.current); timer.current = setTimeout(save, 1200); };
  const editStep = (id, patch) => edit(t => ({ ...t, steps: t.steps.map(s => s.id === id ? { ...s, ...patch } : s) }));
  const moveStep = (id, dir) => edit(t => { const list = [...t.steps]; const i = list.findIndex(s => s.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= list.length) return t; [list[i], list[j]] = [list[j], list[i]]; return { ...t, steps: list }; });
  const addComment = async text => {
    const c = newComment(text, actor); if (!c.text) return false;
    const result = await updateStorage(key, null, current => { const cur = normalizeTask(current); return { ...cur, comments: [...cur.comments, c] }; });
    if (result?.ok === false) { showToast("코멘트를 남기지 못했어요.", "error"); return false; }
    const saved = normalizeTask(result?.value); ref.current = { ...ref.current, comments: saved.comments }; setTask(ref.current);
    onMeta(duty.id, { ...taskProgress(saved), updatedAt: saved.updatedAt, updatedBy: saved.updatedBy }); return true;
  };
  const removeComment = async id => {
    if (!window.confirm("이 코멘트를 지울까요?")) return;
    const result = await updateStorage(key, null, current => { const cur = normalizeTask(current); return { ...cur, comments: cur.comments.filter(c => c.id !== id) }; });
    if (result?.ok !== false) { const saved = normalizeTask(result?.value); ref.current = { ...ref.current, comments: saved.comments }; setTask(ref.current); }
  };
  const upload = async (list, target) => {
    const files = Array.from(list || []).slice(0, 5); if (!files.length) return;
    showToast("파일을 올리는 중이에요.", "info");
    const done = [];
    for (const file of files) { try { done.push({ ...(await uploadClassroomAttachment(file, { scopeKey: "handover", subject: dept?.name || "업무", target: duty.text.slice(0, 30), teacherName: actor?.name || "선생님" })), fileName: file.name, size: file.size, id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}` }); } catch (error) { showToast(error?.message || "파일을 올리지 못했어요.", "error"); } }
    if (!done.length) return;
    if (target) editStep(target, { files: [...(ref.current.steps.find(s => s.id === target)?.files || []), ...done] });
    else edit(t => ({ ...t, files: [...t.files, ...done] }));
    showToast(`파일 ${done.length}개를 붙였어요.`, "success");
  };

  if (!task) return <div className="kho-task"><p className="kho-loading"><Loader2 size={16} className="spin" /> 불러오는 중이에요.</p></div>;
  const groups = groupSteps(task.steps);
  const monthsUsed = new Set(task.steps.map(s => s.month).filter(Boolean));
  const allFiles = task.links.length + task.files.length;
  return <div className="kho-task">
    <header className="kho-th">
      <div><button type="button" data-kdn-bare className="back" onClick={onClose}>← 업무 목록</button><small>{dept?.name} · {roleLabel || role.title || "담당"} · {role.ownerName ? `${role.ownerName} 선생님` : "담당 미정"}</small><h2>{duty.text}</h2>
        <span className="st">{canEdit ? (state === "saving" ? <><Loader2 size={12} className="spin" /> 저장 중</> : state === "dirty" ? "고치는 중 · 잠시 뒤 자동 저장" : state === "saved" ? <><Check size={12} /> 저장됨</> : "적으면 자동으로 저장돼요") : "보기 전용 · 코멘트는 누구나 남길 수 있어요"}{task.updatedAt ? ` · 마지막 수정 ${task.updatedBy ? `${task.updatedBy} ` : ""}${fmtAt(task.updatedAt)}` : ""}</span></div>
      <button type="button" data-kdn-bare className="x" onClick={onClose} aria-label="닫기"><X size={16} /></button>
    </header>

    <section className="kho-sec">
      <h3>한눈에 보기</h3>
      <div className="kho-brief">
        <Area label="업무 요약" hint="무엇을, 누구와, 언제 하는 업무인지" value={task.summary} canEdit={canEdit} onChange={v => edit(t => ({ ...t, summary: v }))} placeholder="예: 2학년 전체가 희망 진로 분야를 직접 체험하는 진로 행사. 체험처 섭외부터 결과 공유까지 맡음." />
        <Area label="꼭 알아둘 것" hint="놓치면 안 되는 점, 연락처, 주의할 점" value={task.must} canEdit={canEdit} onChange={v => edit(t => ({ ...t, must: v }))} placeholder="예: 체험처 섭외는 늦어도 두 달 전에. 학부모 동의서 회수율 확인." tone="must" />
        <Area label="올해 달라진 점 · 내년 제안" hint="바꾼 방식, 잘된 점, 고칠 점" value={task.changes} canEdit={canEdit} onChange={v => edit(t => ({ ...t, changes: v }))} placeholder="예: 평가회 영상 대신 팜플렛을 제작함." tone="chg" />
      </div>
    </section>

    <section className="kho-sec">
      <h3>타임라인 <small>{task.steps.length ? `${task.steps.filter(s => s.done).length}/${task.steps.length}단계 완료` : "달마다 한 일을 순서대로"}</small></h3>
      <div className="kho-months" aria-label="달별 업무">{SCHOOL_MONTHS.map(m => <a key={m} href={`#kho-m-${duty.id}-${m}`} className={monthsUsed.has(m) ? "on" : ""} onClick={e => { e.preventDefault(); document.getElementById(`kho-m-${duty.id}-${m}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{m}월</a>)}</div>
      {task.steps.length === 0 && <div className="kho-empty">
        <p>아직 타임라인이 없어요.{canEdit ? " 예시 틀로 시작해 고쳐 써도 돼요." : ""}</p>
        {canEdit && <div className="row"><button type="button" data-kdn-bare className="kho-btn pri" onClick={() => edit(t => ({ ...t, steps: stepTemplate(duty.text) }))}><Wand2 size={14} /> 예시 틀로 시작</button><button type="button" data-kdn-bare className="kho-btn" onClick={() => edit(t => ({ ...t, steps: [newStep()] }))}><Plus size={14} /> 빈 단계 추가</button></div>}
      </div>}
      <ol className="kho-tl">{groups.map(g => <li key={g.month} id={g.month ? `kho-m-${duty.id}-${g.month}` : undefined} className={g.month ? "" : "undated"}>
        <span className="mo">{g.label}</span>
        <div className="steps">{g.steps.map(step => <article key={step.id} className={`kho-step${step.done ? " done" : ""}`}>
          <div className="hd">
            <button type="button" data-kdn-bare className="ck" disabled={!canEdit} aria-pressed={step.done} title={step.done ? "끝냄 취소" : "끝냄"} onClick={() => editStep(step.id, { done: !step.done })}>{step.done && <Check size={13} />}</button>
            {canEdit ? <input className="tt" value={step.title} placeholder="무엇을 하나요(예: 체험처 섭외)" onChange={e => editStep(step.id, { title: e.target.value })} /> : <b className="tt">{step.title || "(제목 없음)"}</b>}
            {canEdit ? <span className="when"><select value={step.month || 0} onChange={e => editStep(step.id, { month: Number(e.target.value) })} aria-label="달"><option value={0}>시기 미정</option>{SCHOOL_MONTHS.map(m => <option key={m} value={m}>{m}월</option>)}</select><input value={step.when} placeholder="예: 2주, 15일" onChange={e => editStep(step.id, { when: e.target.value })} /></span>
              : step.when ? <span className="when ro">{step.when}</span> : null}
            {canEdit && <span className="ops"><button type="button" data-kdn-bare title="위로" onClick={() => moveStep(step.id, -1)}><ArrowUp size={13} /></button><button type="button" data-kdn-bare title="아래로" onClick={() => moveStep(step.id, 1)}><ArrowDown size={13} /></button><button type="button" data-kdn-bare title="단계 지우기" onClick={() => window.confirm("이 단계를 지울까요?") && edit(t => ({ ...t, steps: t.steps.filter(s => s.id !== step.id) }))}><Trash2 size={13} /></button></span>}
          </div>
          {canEdit ? <AutoText value={step.detail} placeholder="한 일, 방법, 참고할 점" onChange={v => editStep(step.id, { detail: v })} /> : step.detail ? <p className="dt">{step.detail}</p> : null}
          <Materials links={step.links} files={step.files} canEdit={canEdit} compact showToast={showToast}
            onAddLink={l => editStep(step.id, { links: [...step.links, l] })} onRemoveLink={id => editStep(step.id, { links: step.links.filter(l => l.id !== id) })}
            onUpload={list => upload(list, step.id)} onRemoveFile={i => editStep(step.id, { files: step.files.filter((_, k) => k !== i) })} />
        </article>)}</div>
      </li>)}</ol>
      {canEdit && task.steps.length > 0 && <button type="button" data-kdn-bare className="kho-btn add-step" onClick={() => edit(t => ({ ...t, steps: [...t.steps, newStep({ month: t.steps[t.steps.length - 1]?.month || 0 })] }))}><Plus size={14} /> 단계 추가</button>}
    </section>

    <section className="kho-sec">
      <h3>자료함 <small>업무 전체에 쓰는 시트·문서·파일{allFiles ? ` · ${allFiles}개` : ""}</small></h3>
      <Materials links={task.links} files={task.files} canEdit={canEdit} showToast={showToast}
        onAddLink={l => edit(t => ({ ...t, links: [...t.links, l] }))} onRemoveLink={id => edit(t => ({ ...t, links: t.links.filter(l => l.id !== id) }))}
        onUpload={list => upload(list, "")} onRemoveFile={i => edit(t => ({ ...t, files: t.files.filter((_, k) => k !== i) }))} />
    </section>

    <section className="kho-sec">
      <h3>코멘트 <small>인수인계 질문과 답, 메모 · 누구나 남길 수 있어요</small></h3>
      <Comments list={task.comments} actor={actor} canModerate={canEdit} onAdd={addComment} onRemove={removeComment} />
    </section>
  </div>;
}

function Area({ label, hint, value, canEdit, onChange, placeholder, tone = "" }) {
  return <div className={`kho-area ${tone}`}><span className="lb"><b>{label}</b><small>{hint}</small></span>
    {canEdit ? <AutoText value={value} placeholder={placeholder} onChange={onChange} /> : <p className={value ? "" : "nil"}>{value || "아직 적지 않았어요."}</p>}</div>;
}
function AutoText({ value, onChange, placeholder }) {
  const el = React.useRef(null);
  React.useLayoutEffect(() => { const t = el.current; if (t) { t.style.height = "auto"; t.style.height = `${Math.max(44, t.scrollHeight)}px`; } }, [value]);
  return <textarea ref={el} rows={2} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />;
}

function Materials({ links, files, canEdit, compact = false, onAddLink, onRemoveLink, onUpload, onRemoveFile, showToast }) {
  const [open, setOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [url, setUrl] = React.useState("");
  const input = React.useRef(null);
  const add = () => { const u = safeUrl(url); if (!u) { showToast("https://로 시작하는 주소를 붙여 넣어 주세요.", "error"); return; } onAddLink(newLink(label.trim() || linkKind(u).label, u)); setLabel(""); setUrl(""); setOpen(false); };
  if (!canEdit && !links.length && !files.length) return compact ? null : <p className="kho-nil">붙인 자료가 없어요.</p>;
  return <div className={`kho-mat${compact ? " compact" : ""}`}>
    {(links.length > 0 || files.length > 0) && <ul>
      {links.map(l => { const k = linkKind(l.url); const Icon = KIND_ICON[k.kind] || Globe; return <li key={l.id} className={`k-${k.kind}`}><a href={l.url} target="_blank" rel="noopener noreferrer"><Icon size={14} /><span>{l.label || k.label}</span><small>{k.label}</small><ExternalLink size={12} /></a>{canEdit && <button type="button" data-kdn-bare title="빼기" onClick={() => onRemoveLink(l.id)}><X size={12} /></button>}</li>; })}
      {files.map((f, i) => <li key={f.id || i} className="k-file"><button type="button" data-kdn-bare className="open" onClick={() => openFile(f).catch(e => showToast(e.message, "error"))}><Paperclip size={14} /><span>{f.fileName || "첨부파일"}</span><small>{f.size ? `${Math.max(1, Math.round(f.size / 1024))}KB` : "파일"}</small></button>{canEdit && <button type="button" data-kdn-bare title="빼기" onClick={() => window.confirm("이 파일을 목록에서 뺄까요?") && onRemoveFile(i)}><X size={12} /></button>}</li>)}
    </ul>}
    {canEdit && <div className="acts">
      <button type="button" data-kdn-bare className="kho-mini" onClick={() => setOpen(v => !v)}><Link2 size={13} /> 링크 붙이기</button>
      <button type="button" data-kdn-bare className="kho-mini" onClick={() => input.current?.click()}><Paperclip size={13} /> 파일 올리기</button>
      <input ref={input} type="file" multiple hidden onChange={e => { const list = Array.from(e.target.files || []); e.target.value = ""; onUpload(list); }} />
    </div>}
    {open && <div className="addlink"><input value={url} onChange={e => setUrl(e.target.value)} placeholder="시트·문서·드라이브 주소(https://...)" autoFocus onKeyDown={e => e.key === "Enter" && add()} /><input value={label} onChange={e => setLabel(e.target.value)} placeholder="이름(예: 체험처 목록 시트)" onKeyDown={e => e.key === "Enter" && add()} /><button type="button" data-kdn-bare className="kho-btn pri" onClick={add}>붙이기</button></div>}
  </div>;
}

function Comments({ list, actor, canModerate, onAdd, onRemove }) {
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const myId = String(actor?.id || "");
  const send = async () => { if (!text.trim() || busy) return; setBusy(true); const ok = await onAdd(text); setBusy(false); if (ok) setText(""); };
  return <div className="kho-cm">
    {list.length ? <ul>{list.map(c => <li key={c.id} className={c.byId && c.byId === myId ? "me" : ""}><header><b>{c.by}</b><small>{fmtAt(c.at)}</small>{(canModerate || (c.byId && c.byId === myId)) && <button type="button" data-kdn-bare title="지우기" onClick={() => onRemove(c.id)}><Trash2 size={12} /></button>}</header><p>{c.text}</p></li>)}</ul> : <p className="kho-nil">아직 코멘트가 없어요.</p>}
    <div className="new"><textarea rows={2} value={text} onChange={e => setText(e.target.value)} placeholder="궁금한 점이나 남길 말(예: 체험처 연락은 누구에게 하면 되나요?)" onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); }} /><button type="button" data-kdn-bare className="kho-btn pri" disabled={!text.trim() || busy} onClick={send}>{busy ? <Loader2 size={14} className="spin" /> : <MessageSquare size={14} />} 남기기</button></div>
  </div>;
}

const CSS = `
.kho{display:grid;gap:14px;color:var(--kdn-ink,#17181d)}
.kho .spin{animation:kho-spin 1s linear infinite}@keyframes kho-spin{to{transform:rotate(360deg)}}
.kho-loading{display:flex;align-items:center;gap:8px;color:var(--kdn-muted,#8a8f99);font-size:14px}
.kho-top{display:grid;gap:10px;padding:16px 18px;border-radius:18px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0)}
.kho-top .tt{display:grid;gap:2px}.kho-top .tt b{font-size:19px;font-weight:800;letter-spacing:-.01em}.kho-top .tt span{font-size:13px;color:var(--kdn-ink-soft,#5b606b)}
.kho-top .depts{display:flex;flex-wrap:wrap;gap:6px}
.kho-top .depts button{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:99px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:var(--kdn-ink-soft,#3d4048);font:inherit;font-size:14px;font-weight:700;cursor:pointer}
.kho-top .depts button small{font-size:11.5px;color:var(--kdn-muted,#8a8f99);font-weight:700}
.kho-top .depts button.on{background:#17181d;border-color:#17181d;color:#fff}.kho-top .depts button.on small{color:#c9ccd3}
.kho-top .depts button.add{border-style:dashed}
.kho-body{display:grid;grid-template-columns:minmax(300px,380px) minmax(0,1fr);gap:14px;align-items:start}
@media (max-width:960px){.kho-body{grid-template-columns:1fr}}
.kho-list{display:grid;gap:10px;position:sticky;top:72px;max-height:calc(100vh - 92px);overflow:auto;padding-right:2px;scrollbar-width:thin}
@media (max-width:960px){.kho-list{position:static;max-height:none}.kho-body.has-sel .kho-list{display:none}}
.kho-th .back{display:none;justify-self:start;height:28px;padding:0 10px;margin-bottom:4px;border-radius:8px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:var(--kdn-ink-soft,#3d4048);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.kho-list .tools{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.kho-list .srch{flex:1 1 140px;display:flex;align-items:center;gap:6px;height:34px;padding:0 10px;border-radius:10px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:var(--kdn-muted,#8a8f99)}
.kho-list .srch input{flex:1;min-width:0;border:0;outline:0;background:transparent;font:inherit;font-size:13.5px;color:var(--kdn-ink,#17181d)}
.kho .chip{display:inline-flex;align-items:center;gap:5px;height:34px;padding:0 11px;border-radius:10px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:var(--kdn-ink-soft,#3d4048);font:inherit;font-size:13px;font-weight:700;cursor:pointer}
.kho .chip.on{border-color:#ff7a3d;background:color-mix(in srgb,#ff7a3d 10%,var(--kdn-surface,#fff));color:#c2410c}
.kho-list .none,.kho-nil{margin:0;font-size:13px;color:var(--kdn-muted,#8a8f99)}
.kho-list .mng-dept{display:flex;gap:8px;align-items:center;font-size:13px}.kho-list .mng-dept button{font:inherit;font-size:12.5px;color:#c2410c;background:none;border:0;cursor:pointer;text-decoration:underline}
.kho-role{border-radius:14px;border:1px solid var(--kdn-line,#e7e5e0);background:var(--kdn-surface,#fff);overflow:hidden}
.kho-role.mine{border-color:color-mix(in srgb,#ff7a3d 55%,transparent);box-shadow:0 0 0 2px color-mix(in srgb,#ff7a3d 14%,transparent)}
.kho-role>header{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;padding:9px 12px;background:var(--kdn-surface-2,#f6f5f2);border-bottom:1px solid var(--kdn-line,#eceae5)}
.kho-role .no{font-size:12.5px;font-weight:800;color:#c2410c}
.kho-role .who{font-size:13px;font-weight:700;color:var(--kdn-ink-soft,#3d4048)}
.kho-role select,.kho-role .mng input,.kho-role .mng-duty input{height:28px;padding:0 8px;border-radius:8px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#17181d);font:inherit;font-size:12.5px}
.kho-role .mng{display:flex;gap:4px;margin-left:auto}.kho-role .mng input{width:120px}
.kho-role .mng button,.kho-role .mng-duty button{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:#b42318;cursor:pointer}
.kho-role .claim{margin-left:auto;height:26px;padding:0 10px;border-radius:99px;border:0;background:#ff7a3d;color:#fff;font:inherit;font-size:12px;font-weight:800;cursor:pointer}
.kho-role .claim.off{background:transparent;border:1px solid var(--kdn-line,#e2dfd8);color:var(--kdn-muted,#8a8f99)}
.kho-role ul{list-style:none;margin:0;padding:4px}
.kho-role li>button{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;column-gap:6px;width:100%;padding:8px 10px;border-radius:10px;border:0;background:transparent;text-align:left;color:inherit;font:inherit;cursor:pointer}
.kho-role li>button:hover{background:var(--kdn-surface-2,#f6f5f2)}
.kho-role li>button.on{background:color-mix(in srgb,#ff7a3d 10%,var(--kdn-surface,#fff))}
.kho-role li .tx{font-size:13.5px;font-weight:600;line-height:1.45;word-break:keep-all}
.kho-role li .go{grid-row:1/3;grid-column:2;align-self:center;color:var(--kdn-muted,#b5b9c1)}
.kho-role li .mt{display:flex;flex-wrap:wrap;gap:6px;margin-top:3px}
.kho-role li .mt em{display:inline-flex;align-items:center;gap:3px;font-style:normal;font-size:11.5px;font-weight:700;color:#2f6b4c}
.kho-role li .mt em.empty{color:var(--kdn-muted,#a4a8b1);font-weight:600}
.kho-role .mng-duty{display:flex;gap:4px;padding:3px 6px}.kho-role .mng-duty input{flex:1;min-width:0}
.kho-role .add-duty{margin:0 8px 8px;height:28px;padding:0 10px;border-radius:8px;border:1px dashed var(--kdn-line,#d9d6cf);background:transparent;color:var(--kdn-ink-soft,#5b606b);font:inherit;font-size:12.5px;cursor:pointer}
.kho-list .add-role{display:flex;align-items:center;justify-content:center;gap:6px;height:40px;border-radius:12px;border:1px dashed var(--kdn-line,#d9d6cf);background:transparent;color:var(--kdn-ink-soft,#3d4048);font:inherit;font-weight:700;cursor:pointer}
.kho-list .common{margin:0;padding:10px 12px;border-radius:12px;background:var(--kdn-surface-2,#f6f5f2);font-size:12.5px;line-height:1.5;color:var(--kdn-ink-soft,#5b606b)}.kho-list .common b{margin-right:8px;color:var(--kdn-ink,#17181d)}
.kho-main{min-width:0}
.kho-guide{display:grid;justify-items:start;gap:10px;padding:28px;border-radius:18px;border:1px dashed var(--kdn-line,#d9d6cf);background:var(--kdn-surface,#fff);color:var(--kdn-ink-soft,#3d4048)}
.kho-guide svg{color:#ff7a3d}.kho-guide b{font-size:17px;color:var(--kdn-ink,#17181d)}
.kho-guide ol{margin:0;padding-left:20px;display:grid;gap:6px;font-size:14px;line-height:1.55}.kho-guide em{font-style:normal;font-weight:800;color:#c2410c}
.kho-task{display:grid;gap:14px}
.kho-th{display:flex;gap:12px;align-items:flex-start;padding:16px 18px;border-radius:18px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0)}
.kho-th>div{flex:1;min-width:0;display:grid;gap:4px}.kho-th small{font-size:12.5px;font-weight:700;color:#c2410c}
.kho-th h2{margin:0;font-size:20px;font-weight:800;line-height:1.35;word-break:keep-all}
.kho-th .st{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;color:var(--kdn-muted,#8a8f99)}
.kho-th .x{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:var(--kdn-ink-soft,#5b606b);cursor:pointer}
.kho-sec{display:grid;gap:10px;padding:16px 18px;border-radius:18px;background:var(--kdn-surface,#fff);border:1px solid var(--kdn-line,#e7e5e0)}
.kho-sec h3{margin:0;font-size:15.5px;font-weight:800}.kho-sec h3 small{margin-left:8px;font-size:12.5px;font-weight:600;color:var(--kdn-muted,#8a8f99)}
.kho-brief{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}@media (max-width:1180px){.kho-brief{grid-template-columns:1fr}}
.kho-area{display:grid;gap:6px;align-content:start;padding:12px;border-radius:14px;background:var(--kdn-surface-2,#f6f5f2)}
.kho-area.must{background:color-mix(in srgb,#ef4444 7%,var(--kdn-surface,#fff))}.kho-area.chg{background:color-mix(in srgb,#2563eb 7%,var(--kdn-surface,#fff))}
.kho-area .lb{display:grid;gap:1px}.kho-area .lb b{font-size:13.5px}.kho-area .lb small{font-size:11.5px;color:var(--kdn-muted,#8a8f99)}
.kho-area p{margin:0;font-size:13.5px;line-height:1.6;white-space:pre-wrap;word-break:keep-all}.kho-area p.nil{color:var(--kdn-muted,#a4a8b1)}
.kho textarea{width:100%;box-sizing:border-box;resize:none;padding:8px 10px;border-radius:10px;border:1px solid transparent;background:var(--kdn-surface,#fff);color:var(--kdn-ink,#17181d);font:inherit;font-size:13.5px;line-height:1.6;overflow:hidden}
.kho textarea:hover{border-color:var(--kdn-line,#e2dfd8)}.kho textarea:focus{outline:0;border-color:#ff7a3d;box-shadow:0 0 0 3px color-mix(in srgb,#ff7a3d 16%,transparent)}
.kho-months{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:4px}
.kho-months a{display:grid;place-items:center;height:28px;border-radius:8px;background:var(--kdn-surface-2,#f3f2ee);color:var(--kdn-muted,#a4a8b1);font-size:12px;font-weight:700;text-decoration:none}
.kho-months a.on{background:color-mix(in srgb,#ff7a3d 16%,var(--kdn-surface,#fff));color:#c2410c}
@media (max-width:560px){.kho-months{grid-template-columns:repeat(6,minmax(0,1fr))}}
.kho-empty{display:grid;gap:10px;justify-items:start;padding:14px;border-radius:14px;border:1px dashed var(--kdn-line,#d9d6cf)}.kho-empty p{margin:0;font-size:13.5px;color:var(--kdn-ink-soft,#5b606b)}.kho-empty .row{display:flex;flex-wrap:wrap;gap:6px}
.kho-tl{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.kho-tl>li{display:grid;grid-template-columns:64px minmax(0,1fr);gap:10px;position:relative;scroll-margin-top:84px}
.kho-tl>li::before{content:"";position:absolute;left:31px;top:30px;bottom:-4px;width:2px;background:var(--kdn-line,#e7e5e0)}
.kho-tl>li:last-child::before{display:none}
.kho-tl .mo{position:relative;z-index:1;display:grid;place-items:center;align-self:start;height:28px;margin-top:8px;border-radius:99px;background:#17181d;color:#fff;font-size:12.5px;font-weight:800}
.kho-tl li.undated .mo{background:var(--kdn-surface-2,#eceae5);color:var(--kdn-ink-soft,#5b606b)}
.kho-tl .steps{display:grid;gap:8px;padding:4px 0 10px}
.kho-step{display:grid;gap:6px;padding:10px 12px;border-radius:14px;border:1px solid var(--kdn-line,#e7e5e0);background:var(--kdn-surface,#fff)}
.kho-step.done{background:color-mix(in srgb,#16a34a 5%,var(--kdn-surface,#fff))}
.kho-step .hd{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px}
.kho-step .ck{display:grid;place-items:center;flex:none;width:22px;height:22px;border-radius:7px;border:1.5px solid #b5b9c1;background:var(--kdn-surface,#fff);color:#fff;cursor:pointer;padding:0}
.kho-step .ck[aria-pressed=true]{background:#16a34a;border-color:#16a34a}.kho-step .ck:disabled{cursor:default}
.kho-step .tt{flex:1 1 200px;min-width:0;font-size:14.5px;font-weight:800}
.kho-step input.tt{height:32px;padding:0 8px;border-radius:8px;border:1px solid transparent;background:transparent;color:var(--kdn-ink,#17181d);font-family:inherit}
.kho-step input.tt:hover{border-color:var(--kdn-line,#e2dfd8)}.kho-step input.tt:focus{outline:0;border-color:#ff7a3d}
.kho-step.done .tt{text-decoration:line-through;text-decoration-color:color-mix(in srgb,#16a34a 60%,transparent)}
.kho-step .when{display:inline-flex;gap:4px}.kho-step .when select,.kho-step .when input{height:30px;padding:0 8px;border-radius:8px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#17181d);font:inherit;font-size:12.5px}.kho-step .when input{width:92px}
.kho-step .when.ro{font-size:12.5px;font-weight:700;color:var(--kdn-ink-soft,#5b606b)}
.kho-step .ops{display:inline-flex;gap:2px}.kho-step .ops button{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;border:0;background:transparent;color:var(--kdn-muted,#8a8f99);cursor:pointer}.kho-step .ops button:hover{background:var(--kdn-surface-2,#f3f2ee);color:var(--kdn-ink,#17181d)}
.kho-step .dt{margin:0;padding-left:30px;font-size:13.5px;line-height:1.6;white-space:pre-wrap;color:var(--kdn-ink-soft,#3d4048)}
.kho-step textarea{background:var(--kdn-surface-2,#f8f7f4)}
.kho-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 14px;border-radius:10px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#17181d);font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}
.kho-btn.pri{background:#17181d;border-color:#17181d;color:#fff}.kho-btn:disabled{opacity:.45;cursor:default}
.kho-btn.add-step{justify-self:start;border-style:dashed}
.kho-mini{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:var(--kdn-ink-soft,#3d4048);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.kho-mat{display:grid;gap:8px}.kho-mat.compact{padding-left:30px}
.kho-mat ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.kho-mat li{display:inline-flex;align-items:center;max-width:100%;border-radius:10px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);overflow:hidden}
.kho-mat li a,.kho-mat li .open{display:inline-flex;align-items:center;gap:6px;min-width:0;height:32px;padding:0 10px;color:var(--kdn-ink,#17181d);text-decoration:none;font:inherit;font-size:13px;font-weight:700;background:none;border:0;cursor:pointer}
.kho-mat li span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px}.kho-mat li small{font-size:11px;font-weight:600;color:var(--kdn-muted,#8a8f99)}
.kho-mat li>button:last-child:not(.open){display:grid;place-items:center;width:26px;height:32px;border:0;border-left:1px solid var(--kdn-line,#eceae5);background:transparent;color:var(--kdn-muted,#8a8f99);cursor:pointer}
.kho-mat li.k-sheet svg:first-child{color:#16a34a}.kho-mat li.k-doc svg:first-child{color:#2563eb}.kho-mat li.k-slide svg:first-child{color:#d97706}.kho-mat li.k-form svg:first-child{color:#7c3aed}.kho-mat li.k-drive svg:first-child{color:#0e7490}.kho-mat li.k-file svg:first-child{color:#c2410c}
.kho-mat .acts{display:flex;flex-wrap:wrap;gap:6px}
.kho-mat .addlink{display:flex;flex-wrap:wrap;gap:6px}.kho-mat .addlink input{flex:1 1 200px;height:36px;padding:0 10px;border-radius:10px;border:1px solid var(--kdn-line,#e2dfd8);background:var(--kdn-surface,#fff);color:var(--kdn-ink,#17181d);font:inherit;font-size:13px}
.kho-cm{display:grid;gap:10px}.kho-cm ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.kho-cm li{padding:10px 12px;border-radius:12px;background:var(--kdn-surface-2,#f6f5f2)}.kho-cm li.me{background:color-mix(in srgb,#ff7a3d 8%,var(--kdn-surface,#fff))}
.kho-cm li header{display:flex;align-items:center;gap:8px}.kho-cm li header b{font-size:13px}.kho-cm li header small{font-size:11.5px;color:var(--kdn-muted,#8a8f99)}
.kho-cm li header button{margin-left:auto;display:grid;place-items:center;width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:var(--kdn-muted,#8a8f99);cursor:pointer}
.kho-cm li p{margin:4px 0 0;font-size:13.5px;line-height:1.6;white-space:pre-wrap}
.kho-cm .new{display:flex;gap:8px;align-items:flex-end}.kho-cm .new textarea{flex:1;border-color:var(--kdn-line,#e2dfd8);overflow:auto}.kho-cm .new .kho-btn{flex:none}
@media (max-width:960px){.kho-th .back{display:inline-flex;align-items:center}.kho-th .x{display:none}}
`;
