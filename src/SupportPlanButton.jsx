import React from "react";
import { ClipboardList, Check, Loader2 } from "lucide-react";
import "./supportPlan.css";
import { loadSupportPlan, subscribeSupportPlanChanges } from "./supportPlanStore.js";

export default function SupportPlanButton({ onClick, count, children = "수시 지원 구성", compact = false, active = false, busy = false, disabled = false, className = "", ...props }) {
  const Icon = busy ? Loader2 : active ? Check : ClipboardList;
  return <button {...props} type="button" onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined} className={`kd-support-plan-button no-print ${compact ? "is-compact" : ""} ${active ? "is-saved" : ""} ${className}`}>
    <Icon size={compact ? 16 : 19} aria-hidden="true" className={busy ? "spin" : ""}/>
    <span>{busy ? "저장 중…" : children}</span>
    {count !== undefined && <strong className="kd-support-plan-count">{count == null ? "—" : `${count}/6`}</strong>}
  </button>;
}

// Reused by the persistent student header and the consultation summary.
export function useSupportPlanCount(sid) {
  const [count, setCount] = React.useState(null);
  React.useEffect(() => {
    let active = true, request = 0;
    setCount(null);
    const refresh = async () => {
      const token = ++request;
      try {
        const items = await loadSupportPlan(sid);
        if (active && token === request) setCount(items.length);
      } catch { if (active && token === request) setCount(null); }
    };
    refresh();
    const unsubscribe = subscribeSupportPlanChanges(sid, refresh);
    return () => { active = false; unsubscribe(); };
  }, [sid]);
  return count;
}
