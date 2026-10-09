// 학생 성적 시뮬레이터 프리셋 저장소.
// 남은 학기에 넣어 본 과목·석차등급·성취도와 그때의 예상 내신을 학생별로 저장하고,
// NAVI(기준 설정)·대입상담 화면에서 같은 값을 꺼내 씁니다.
import React from "react";
import { readStorage, updateStorage } from "./storage.js";
import { computeAllGroupAverages } from "./gradeEngine.js";

export const GRADE_SIM_EVENT = "kd-grade-sim-presets-changed";
export const gradeSimPresetKey = sid => `kd_grade_sim_presets_v1:${String(sid || "")}`;

// 시뮬레이터 결과를 NAVI와 같은 교과 조합 이름으로 묶습니다(Grades.jsx의 grade5ByGroup과 같은 계산).
export function simulatedGroupAverages(subjectLists, gradeSystem = 5) {
  const groups = computeAllGroupAverages(subjectLists, gradeSystem);
  const field = Number(gradeSystem) === 5 ? "avg5" : "avg9";
  return {
    전교과: groups?.전과목?.[field] ?? null,
    국수영사과: groups?.국영수사과?.[field] ?? null,
    국수영과: groups?.국영수과?.[field] ?? null,
    국수영사: groups?.국영수사?.[field] ?? null,
    perSemester: groups?.전과목?.[Number(gradeSystem) === 5 ? "perSemester5" : "perSemester9"] || [],
  };
}

function presetList(value) {
  if (!value || !Array.isArray(value.presets)) throw new Error("시뮬레이션 프리셋 형식을 확인할 수 없습니다. 새로고침 후 다시 시도해주세요.");
  return value.presets;
}
function announce(sid) {
  try { window.dispatchEvent(new CustomEvent(GRADE_SIM_EVENT, { detail: { sid: String(sid || "") } })); } catch { /* 알림 실패는 무시 */ }
}

export async function loadGradeSimPresets(sid) {
  if (!sid) return [];
  return presetList(await readStorage(gradeSimPresetKey(sid), { presets: [] }, { throwOnError: true }));
}

export async function saveGradeSimPreset(sid, preset) {
  const name = String(preset?.name || "").trim().slice(0, 30);
  if (!sid) return { ok: false, error: "학생을 먼저 선택하세요." };
  if (!name) return { ok: false, error: "프리셋 이름을 입력하세요." };
  const result = await updateStorage(gradeSimPresetKey(sid), { presets: [] }, stored => {
    const others = presetList(stored).filter(item => item.name !== name);
    const next = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      gradeSystem: preset.gradeSystem,
      semesters: preset.semesters,
      excludeLast: !!preset.excludeLast,
      result: preset.result,
      savedAt: new Date().toISOString(),
    };
    return { ...stored, presets: [...others, next].slice(-12), updatedAt: new Date().toISOString() };
  });
  if (result.ok) announce(sid);
  return result.ok ? { ok: true, presets: result.value.presets } : result;
}

export async function deleteGradeSimPreset(sid, id) {
  const result = await updateStorage(gradeSimPresetKey(sid), { presets: [] }, stored => ({ ...stored, presets: presetList(stored).filter(item => item.id !== id), updatedAt: new Date().toISOString() }));
  if (result.ok) announce(sid);
  return result.ok ? { ok: true, presets: result.value.presets } : result;
}

// 화면 어디서든 같은 학생의 프리셋 목록을 읽고, 저장·삭제되면 다시 읽습니다.
export function useGradeSimPresets(sid) {
  const [state, setState] = React.useState({ presets: [], status: sid ? "loading" : "idle" });
  React.useEffect(() => {
    let active = true;
    if (!sid) { setState({ presets: [], status: "idle" }); return () => {}; }
    const refresh = () => loadGradeSimPresets(sid)
      .then(presets => { if (active) setState({ presets, status: "ready" }); })
      .catch(() => { if (active) setState(current => ({ ...current, status: "error" })); });
    setState(current => ({ ...current, status: "loading" }));
    refresh();
    const onChange = event => { if (!event?.detail?.sid || event.detail.sid === String(sid)) refresh(); };
    window.addEventListener(GRADE_SIM_EVENT, onChange);
    return () => { active = false; window.removeEventListener(GRADE_SIM_EVENT, onChange); };
  }, [sid]);
  return state;
}
