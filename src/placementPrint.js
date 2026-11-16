// 반편성 현황 인쇄(PDF로 저장 가능): 1쪽 반별 현황표 · 이동 내역, 다음 쪽부터 반마다 한 장(학생 명단·표시·메모)
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// data: { title, subtitle, totals: [[label, value, warn]], columns: [{ key, label, warn }], classRows: [{ cls, cells: {key: n} }],
//   moves: [[시각, 학생, 반, 맞바꿈, 옮긴 사람]], classes: [{ cls, head, chips: [[label, n, warn]], checks: [], notes: [], flags: [label], students: [...] }] }
export function printPlacement(data, { overview = true, roster = true, memos = true } = {}) {
  const win = window.open("", "_blank");
  if (!win) return false;
  const printedAt = new Date().toLocaleString("ko-KR");
  const cover = overview ? `<section class="page">
    <header class="top"><h1>${esc(data.title)}</h1><span>${esc(data.subtitle)}<br>출력 ${esc(printedAt)}</span></header>
    <div class="totals">${data.totals.map(([l, v, w]) => `<div class="${w ? "warn" : ""}"><small>${esc(l)}</small><b>${esc(v)}</b></div>`).join("")}</div>
    <h2>반별 현황</h2>
    <table class="ov"><thead><tr><th class="c">반</th>${data.columns.map(c => `<th class="c">${esc(c.label)}</th>`).join("")}</tr></thead><tbody>
    ${data.classRows.map(r => `<tr><td class="c cls">${esc(r.cls)}반</td>${data.columns.map(c => { const v = r.cells[c.key]; const bad = c.warn && Number(v) > 0; const low = c.low && Number(v) === 0; return `<td class="c${bad ? " bad" : ""}${low ? " low" : ""}${!v && !low ? " dim" : ""}">${v || (low ? "0" : "·")}</td>`; }).join("")}</tr>`).join("")}
    <tr class="sum"><td class="c">합계</td>${data.columns.map(c => `<td class="c">${data.classRows.reduce((t, r) => t + (Number(r.cells[c.key]) || 0), 0) || "·"}</td>`).join("")}</tr>
    </tbody></table>
    <p class="legend">빨강 = 확인이 필요한 수(분리희망 미반영·조합 우려가 같은 반 등), 주황 바탕 = 리더 후보가 없는 반. · = 0</p>
    ${data.moves.length ? `<h2>이동 내역 <small>${data.moves.length}건</small></h2><table class="ov mv"><thead><tr><th>시각</th><th>학생</th><th>이동</th><th>맞바꾼 학생</th><th>옮긴 사람</th></tr></thead><tbody>${data.moves.map(m => `<tr>${m.map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : ""}
  </section>` : "";
  const pages = roster ? data.classes.map(c => `<section class="page">
    <header class="top sm"><span>${esc(data.title)}</span><span>${esc(printedAt)}</span></header>
    <div class="who"><strong>${esc(c.cls)}반</strong><span>${esc(c.head)}</span><div class="chips">${c.chips.map(([l, n, w]) => `<span class="${w ? "warn" : ""}">${esc(l)} <b>${esc(n)}</b></span>`).join("")}</div></div>
    ${c.checks.length || (memos && c.notes.length) ? `<div class="notes">${c.checks.length ? `<p><b>반 점검</b> ${c.checks.map(esc).join(" · ")}</p>` : ""}${memos ? c.notes.map(n => `<p><b>의견</b> ${esc(n)}</p>`).join("") : ""}</div>` : ""}
    <table class="st"><thead><tr><th class="c n">번호</th><th class="c">구반-번호</th><th>이름</th><th class="c">성별</th>${c.flags.map(f => `<th class="c f">${esc(f)}</th>`).join("")}<th class="c">분리희망</th><th>비고${memos ? " · 메모" : ""}</th><th class="c ck">확인</th></tr></thead><tbody>
    ${c.students.map(s => `<tr class="${s.alert ? "alert" : ""}"><td class="c n">${esc(s.no)}</td><td class="c">${esc(s.old)}</td><td class="nm">${esc(s.name)}</td><td class="c">${esc(s.gender)}</td>${s.flags.map(on => `<td class="c f">${on ? "●" : ""}</td>`).join("")}<td class="c ${s.sepTone}">${esc(s.sep)}</td><td class="rm">${s.notes.map(n => `<span>${esc(n)}</span>`).join("")}${memos ? s.memos.map(m => `<span class="memo">${esc(m)}</span>`).join("") : ""}</td><td class="c ck"><i class="box"></i></td></tr>`).join("")}
    </tbody></table>
  </section>`).join("") : "";
  win.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(data.title)}</title><style>
  @page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;font-family:"Pretendard","Noto Sans KR","Malgun Gothic",sans-serif;color:#17181d;font-size:9.5pt;line-height:1.5}
  .page{break-after:page;page-break-after:always;display:flex;flex-direction:column;gap:9px}.page:last-child{break-after:auto;page-break-after:auto}
  .top{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding-bottom:6px;border-bottom:2px solid #17181d}.top h1{margin:0;font-size:16pt}.top span{font-size:8.5pt;color:#5b606b;text-align:right}
  .top.sm{border-bottom:1px solid #c9c5bd;padding-bottom:4px}.top.sm span{font-size:8pt}
  h2{margin:6px 0 0;font-size:11.5pt}h2 small{font-size:9pt;color:#6b7280;font-weight:600}
  .totals{display:grid;grid-template-columns:repeat(auto-fit,minmax(28mm,1fr));gap:6px}.totals div{padding:6px 10px;border:1px solid #d9dee7;border-radius:8px}.totals small{display:block;font-size:8pt;color:#5b606b}.totals b{font-size:14pt}.totals .warn{border-color:#f3b4ae;background:#fdf3f1}.totals .warn b{color:#b42318}
  table{width:100%;border-collapse:collapse}th{padding:5px 4px;border-top:1.5px solid #17181d;border-bottom:1px solid #17181d;font-size:8pt;color:#3d4048;text-align:left;word-break:keep-all}td{padding:4px;border-bottom:1px solid #e1ded7;vertical-align:top}
  .c{text-align:center}table.ov td{font-size:9.5pt;font-variant-numeric:tabular-nums}table.ov td.cls,table.ov tr.sum td:first-child{font-weight:800;white-space:nowrap}table.ov td.bad{color:#b42318;font-weight:800}table.ov td.low{background:#fff4e5;color:#b45309;font-weight:800}table.ov td.dim{color:#b5b9c1}
  table.ov tr.sum td{border-top:1.5px solid #17181d;font-weight:800}table.mv td{font-size:8.5pt}
  .legend{margin:0;font-size:8pt;color:#6b7280}
  .who{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;padding:8px 12px;border-radius:9px;background:#f4f3f0}.who strong{font-size:17pt;line-height:1.1}.who>span{font-size:10pt;font-weight:700;color:#3d4048}
  .chips{display:flex;flex-wrap:wrap;gap:4px;margin-left:auto}.chips span{padding:1px 8px;border-radius:99px;background:#fff;border:1px solid #d9dee7;font-size:8.5pt}.chips span.warn{border-color:#f3b4ae;color:#b42318;font-weight:700}
  .notes{padding:6px 10px;border-left:3px solid #2563eb;background:#f5f8ff;font-size:9pt}.notes p{margin:1px 0}.notes b{color:#1d4ed8;margin-right:4px}
  table.st td{font-size:9pt}table.st .n{width:9mm}table.st .f{width:11mm;font-size:7.5pt}table.st td.f{font-size:10pt;color:#1d4ed8}table.st .ck{width:10mm}table.st td.nm{font-weight:800;white-space:nowrap}
  table.st tr:nth-child(even) td{background:#fafaf8}table.st tr.alert td{background:#fdf3f1}
  td.bad{color:#b42318;font-weight:800}td.good{color:#15803d}td.rm span{display:inline-block;margin:0 6px 1px 0;font-size:8pt}td.rm span.memo{display:block;color:#3d4048}td.rm span.memo::before{content:"✎ ";color:#9aa0ab}
  .box{display:inline-block;width:3.8mm;height:3.8mm;border:1px solid #5b606b;border-radius:1mm}
  thead{display:table-header-group}tr{break-inside:avoid}
  @media screen{body{background:#e9e7e2}.page{width:210mm;min-height:297mm;margin:10mm auto;padding:12mm;background:#fff;box-shadow:0 4px 20px rgba(0,0,0,.12)}}
  </style></head><body>${cover}${pages}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  win.document.close();
  return true;
}
