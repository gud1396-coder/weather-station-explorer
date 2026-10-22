export function validateStations(items, network) {
  if (!Array.isArray(items)) throw new Error(`${network}: 지점 JSON이 배열이 아닙니다.`);
  const ids = new Set();
  for (const s of items) {
    if (!s || typeof s.id !== 'string' || !/^\d+$/.test(s.id) || s.network !== network || ids.has(s.id)) {
      throw new Error(`${network}: 지점번호·관측망·중복 데이터를 확인해 주세요.`);
    }
    for (const [key, min, max] of [['latitude',32,44], ['longitude',123,133]]) {
      if (s[key] != null && (typeof s[key] !== 'number' || !Number.isFinite(s[key]) || s[key] < min || s[key] > max)) {
        throw new Error(`${network}: ${s.id} 좌표 오류`);
      }
    }
    ids.add(s.id);
  }
  return items;
}
export function filterStations(items, query = '', region = '') {
  const terms = query.trim().toLocaleLowerCase('ko').split(/\s+/).filter(Boolean);
  return items.filter(s => (!region || s.region === region) && terms.every(q =>
    [s.name, s.id, s.region, s.address].filter(Boolean).join(' ').toLocaleLowerCase('ko').includes(q)));
}
