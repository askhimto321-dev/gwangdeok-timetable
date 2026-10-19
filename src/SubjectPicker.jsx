import React, { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Check, ChevronDown, Search } from "lucide-react";

// 성적 산출 과목 고르기: 편제표 정식 이름으로 보여주고, 시간표 이름이 다르면 작게 함께 표시합니다.
// mine: [{ subject, label, semester, targets }] (담당 과목) · curriculum: [{ name, credit, kind, group }]
const semName = sem => (sem === "sem2" ? "2학기" : sem === "sem1" ? "1학기" : "");
const norm = value => String(value || "").replace(/\s+/g, "").toLowerCase();

export default function SubjectPicker({ value, onChange, mine = [], curriculum = [], others = [], allowFree = false, grade = "", semester = "sem1", disabled = false, emptyText = "담당과목 없음" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = event => { if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false); };
    const onKey = event => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    if (allowFree) setTimeout(() => inputRef.current?.focus(), 0);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, allowFree]);

  // 같은 과목 담당(반만 다른 것)은 한 줄로
  const mineRows = useMemo(() => {
    const map = new Map();
    mine.forEach(item => {
      const key = norm(item.subject);
      if (!key) return;
      const row = map.get(key) || { subject: item.subject, labels: new Set(), semesters: new Set(), targets: new Set() };
      if (item.label && norm(item.label) !== key) row.labels.add(item.label);
      if (item.semester) row.semesters.add(item.semester);
      String(item.targets || "").split(/[,\s]+/).filter(target => target && target !== "전체").forEach(target => row.targets.add(target));
      map.set(key, row);
    });
    return Array.from(map.values()).sort((a, b) => {
      const sa = a.semesters.has(semester) ? 0 : 1, sb = b.semesters.has(semester) ? 0 : 1;
      return sa - sb || a.subject.localeCompare(b.subject, "ko");
    });
  }, [mine, semester]);

  const q = norm(query);
  const hit = name => !q || norm(name).includes(q);
  // 2022 개정 교육과정 구분(공통과목·일반선택·진로선택·융합선택)으로 묶습니다. 편제표 '택4' 같은 묶음은 칩 옆 작은 글씨로.
  const groups = useMemo(() => {
    const order = ["공통과목", "일반선택", "진로선택", "융합선택", "전문교과", "기타"];
    const out = [];
    curriculum.forEach(item => {
      const label = item.category || "기타";
      let group = out.find(entry => entry.label === label);
      if (!group) { group = { label, items: [] }; out.push(group); }
      group.items.push(item);
    });
    return out.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  }, [curriculum]);
  const inCurriculum = new Set(curriculum.map(item => norm(item.name)));
  const extra = others.filter(name => !inCurriculum.has(norm(name)) && !mineRows.some(row => norm(row.subject) === norm(name)));
  const current = mineRows.find(row => norm(row.subject) === norm(value));
  const pick = name => { onChange?.(name); setOpen(false); setQuery(""); };
  const isOn = name => norm(name) === norm(value);
  const nothing = !mineRows.length && !curriculum.length && !extra.length && !allowFree;

  return <div className="kd-sp" ref={boxRef}>
    <style>{SP_CSS}</style>
    <button type="button" data-kdn-bare className={`kd-sp-trigger${open ? " is-open" : ""}`} disabled={disabled || nothing} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(on => !on)}>
      <BookOpen size={14} aria-hidden="true" />
      <span className="kd-sp-value">{value ? <b>{value}</b> : <em>{nothing ? emptyText : "과목 선택"}</em>}{current?.labels.size ? <small>시간표 {Array.from(current.labels).join("·")}</small> : null}</span>
      <ChevronDown size={14} aria-hidden="true" className="kd-sp-caret" />
    </button>
    {open && <div className="kd-sp-panel" role="listbox" aria-label="과목">
      {allowFree && <label className="kd-sp-search"><Search size={13} aria-hidden="true" /><input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && query.trim()) pick(query.trim()); }} placeholder="과목 검색 · 없으면 입력 후 Enter" /></label>}
      {mineRows.some(row => hit(row.subject)) && <section>
        <h4>내 담당 과목</h4>
        <ul className="kd-sp-list">{mineRows.filter(row => hit(row.subject)).map(row => <li key={row.subject}>
          <button type="button" data-kdn-bare role="option" aria-selected={isOn(row.subject)} className={isOn(row.subject) ? "is-on" : ""} onClick={() => pick(row.subject)}>
            <span className="kd-sp-check">{isOn(row.subject) ? <Check size={13} /> : null}</span>
            <span className="kd-sp-name"><b>{row.subject}</b>{row.labels.size ? <small>시간표 {Array.from(row.labels).join("·")}</small> : null}</span>
            <span className="kd-sp-meta">{[Array.from(row.semesters).map(semName).filter(Boolean).join("·"), row.targets.size ? `${Array.from(row.targets).slice(0, 4).join(", ")}${row.targets.size > 4 ? " 외" : ""}` : ""].filter(Boolean).join(" · ")}</span>
          </button>
        </li>)}</ul>
      </section>}
      {groups.length > 0 && groups.some(group => group.items.some(item => hit(item.name))) && <section>
        <h4>편제표 {grade}학년 {semName(semester)}</h4>
        {groups.filter(group => group.items.some(item => hit(item.name))).map(group => <div key={group.label} className="kd-sp-group">
          <small>{group.label === "기타" ? "기타 (구분 확인 필요)" : group.label}</small>
          <div className="kd-sp-chips">{group.items.filter(item => hit(item.name)).map(item => <button key={item.name} type="button" data-kdn-bare role="option" aria-selected={isOn(item.name)} className={isOn(item.name) ? "is-on" : ""} onClick={() => pick(item.name)} title={`${item.category || "기타"} · ${item.credit}학점 · 편제표 ${item.kind === "common" ? "학교 공통 편성" : `선택 ${item.group}`}`}>{item.name}<i>{item.credit}</i>{item.kind !== "common" && <em className="kd-sp-pick">{item.group}</em>}</button>)}</div>
        </div>)}
      </section>}
      {extra.some(hit) && <section>
        <h4>그 밖의 과목</h4>
        <div className="kd-sp-chips">{extra.filter(hit).map(name => <button key={name} type="button" data-kdn-bare role="option" aria-selected={isOn(name)} className={isOn(name) ? "is-on" : ""} onClick={() => pick(name)}>{name}</button>)}</div>
      </section>}
      {allowFree && q && ![...mineRows.map(row => row.subject), ...curriculum.map(item => item.name), ...extra].some(name => norm(name) === q) && <button type="button" data-kdn-bare className="kd-sp-free" onClick={() => pick(query.trim())}>“{query.trim()}” 과목으로 시작</button>}
      {!mineRows.length && !curriculum.length && !extra.length && !allowFree && <p className="kd-sp-empty">담당 과목이 없어요. 내 정보에서 담당 과목을 골라 주세요.</p>}
    </div>}
  </div>;
}

const SP_CSS = `
.kd-sp{position:relative;flex:0 1 250px;min-width:190px}
.kd-sp-trigger{width:100%;display:flex;align-items:center;gap:8px;padding:8px 11px;border:1px solid var(--kdn-control-line,#cfdbe9);border-radius:10px;background:var(--kdn-surface,#fff);color:var(--kdn-ink,#2a3a4f);cursor:pointer;font:inherit;text-align:left}
.kd-sp-trigger:hover:not(:disabled),.kd-sp-trigger.is-open{border-color:var(--kdn-accent,#3b6fb0)}
.kd-sp-trigger:disabled{opacity:.6;cursor:default}
.kd-sp-trigger svg{flex:none;color:var(--kdn-accent,#3b6fb0)}
.kd-sp-value{flex:1;min-width:0;display:flex;align-items:baseline;gap:6px;overflow:hidden}
.kd-sp-value b{font-weight:850;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kd-sp-value em{font-style:normal;color:var(--kdn-muted,#7b8797);font-weight:700;font-size:13px}
.kd-sp-value small,.kd-sp-name small{font-size:11px;color:var(--kdn-muted,#7b8797);font-weight:600;white-space:nowrap}
.kd-sp-trigger .kd-sp-caret{color:var(--kdn-muted,#7b8797);transition:transform .15s}
.kd-sp-trigger.is-open .kd-sp-caret{transform:rotate(180deg)}
.kd-sp-panel{position:absolute;z-index:40;top:calc(100% + 6px);left:0;width:min(400px,calc(100vw - 32px));max-height:min(440px,70vh);overflow:auto;padding:10px;border:1px solid var(--kdn-line,#dde4ee);border-radius:14px;background:var(--kdn-surface,#fff);box-shadow:0 16px 40px rgba(20,32,56,.16);display:grid;gap:10px}
.kd-sp-panel section{display:grid;gap:6px}
.kd-sp-panel h4{margin:0;padding:0 4px;font-size:11px;font-weight:800;color:var(--kdn-muted,#7b8797);letter-spacing:.02em}
.kd-sp-search{display:flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid var(--kdn-control-line,#cfdbe9);border-radius:9px;background:var(--kdn-surface-2,#f6f8fb);color:var(--kdn-muted,#7b8797)}
.kd-sp-search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--kdn-ink,#2a3a4f);font:inherit;font-size:13px}
.kd-sp-list{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.kd-sp-list button{width:100%;display:grid;grid-template-columns:18px 1fr auto;align-items:center;gap:6px;padding:8px 8px;border:0;border-radius:9px;background:transparent;color:var(--kdn-ink,#2a3a4f);cursor:pointer;font:inherit;text-align:left}
.kd-sp-list button:hover{background:var(--kdn-surface-2,#f3f6fa)}
.kd-sp-list button.is-on{background:var(--kdn-accent-soft,#eaf1fb)}
.kd-sp-check{display:grid;place-items:center;color:var(--kdn-accent,#3b6fb0)}
.kd-sp-name{display:flex;align-items:baseline;gap:6px;min-width:0}
.kd-sp-name b{font-size:13.5px;font-weight:800}
.kd-sp-meta{font-size:11px;color:var(--kdn-muted,#7b8797);font-weight:600;white-space:nowrap}
.kd-sp-chips em.kd-sp-pick{font-style:normal;font-size:10px;font-weight:700;opacity:.65;margin-left:3px}
.kd-sp-group{display:grid;gap:4px;padding:0 4px}
.kd-sp-group>small{font-size:10.5px;font-weight:700;color:var(--kdn-muted,#7b8797)}
.kd-sp-chips{display:flex;flex-wrap:wrap;gap:5px}
.kd-sp-chips button{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border:1px solid var(--kdn-line,#dde4ee);border-radius:999px;background:var(--kdn-surface,#fff);color:var(--kdn-ink,#2a3a4f);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.kd-sp-chips button:hover{border-color:var(--kdn-accent,#3b6fb0)}
.kd-sp-chips button.is-on{border-color:var(--kdn-accent,#3b6fb0);background:var(--kdn-accent-soft,#eaf1fb);color:var(--kdn-accent-text,#2d5f9e)}
.kd-sp-chips i{font-style:normal;font-size:10.5px;color:var(--kdn-muted,#7b8797);font-weight:700}
.kd-sp-free{justify-self:start;padding:6px 10px;border:1px dashed var(--kdn-accent,#3b6fb0);border-radius:8px;background:transparent;color:var(--kdn-accent-text,#2d5f9e);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer}
.kd-sp-empty{margin:0;padding:6px 4px;font-size:12.5px;color:var(--kdn-muted,#7b8797)}
`;
