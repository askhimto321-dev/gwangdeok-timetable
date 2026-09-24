// Legacy favorites stored a detailed track in admissionType. Keep type and
// name distinct at read time so existing saved data needs no destructive migration.
const clean=value=>String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim();
const typePattern='(?:학생부\\s*)?(교과|종합|논술|실기(?:/실적)?|실적)';
export function favoriteAdmissionSelection(item={}) {
  let raw=clean(item.admissionType);
  if(/수시\s*NAVI|수시나비|Beta/i.test(raw))raw='';
  const broad=raw.match(new RegExp(`^${typePattern}(?:전형)?$`));
  const wrapped=raw.match(new RegExp(`^${typePattern}(?:전형)?\\s*(?:\\((.+)\\)|[·:：]\\s*(.+))$`));
  const type=(broad?.[1]||wrapped?.[1]||'').replace(/실기\/실적|실적/,'실기');
  const track=clean(item.track||item.detailType||wrapped?.[2]||wrapped?.[3]||(!broad?raw:''));
  return {type,track};
}
export function favoriteTrackKey(value) {
  const raw=clean(value);
  const selected=favoriteAdmissionSelection({admissionType:raw});
  return (selected.track||raw).replace(/\s/g,'').replace(/전형$/,'').toLowerCase();
}
