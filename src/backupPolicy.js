// 자동 백업 보관 규칙(순수 함수, node 테스트용): 최근 20개 + 30일 동안 날짜마다 가장 늦은 1개.
export const BACKUP_KEEP_RECENT = 20;
export const BACKUP_KEEP_DAYS = 30;
export function pruneBackups(list, now = Date.now()) {
  const sorted = list.slice().sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const keep = new Set(sorted.slice(0, BACKUP_KEEP_RECENT).map(item => item.id));
  const days = new Set();
  sorted.forEach(item => {
    const age = now - Date.parse(item.at || 0);
    // 날짜는 한국 시간 기준
    const day = new Date((Date.parse(item.at || 0) || 0) + 9 * 3600000).toISOString().slice(0, 10);
    if (age <= BACKUP_KEEP_DAYS * 86400000 && !days.has(day)) { days.add(day); keep.add(item.id); }
  });
  return { kept: sorted.filter(item => keep.has(item.id)), removed: sorted.filter(item => !keep.has(item.id)) };
}
