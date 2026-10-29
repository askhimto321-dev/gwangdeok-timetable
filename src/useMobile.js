// 휴대폰 세로 화면인지(760px 이하 + 세로) 알려 주는 훅. 가로로 돌리면 false가 되어 PC용 전체 표를 그대로 보여 줍니다.
import { useEffect, useState } from "react";

export const MOBILE_PORTRAIT_QUERY = "(max-width: 760px) and (orientation: portrait)";

export function useIsMobile(query = MOBILE_PORTRAIT_QUERY) {
  const read = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  const [match, setMatch] = useState(read);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const list = window.matchMedia(query);
    const onChange = () => setMatch(list.matches);
    onChange();
    list.addEventListener?.("change", onChange);
    return () => list.removeEventListener?.("change", onChange);
  }, [query]);
  return match;
}
