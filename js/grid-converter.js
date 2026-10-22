// KMA Lambert conformal conic: 5 km, R=6371.00877, parallels 30°/60°,
// origin 38°N/126°E -> (43,136), 1-based integer grid points.
// See data/services.json for the official grid reference.
const RAD = Math.PI / 180;
const re = 6371.00877 / 5;
const slat1 = 30 * RAD, slat2 = 60 * RAD;
const sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) /
  Math.log(Math.tan(Math.PI / 4 + slat2 / 2) / Math.tan(Math.PI / 4 + slat1 / 2));
const sf = Math.pow(Math.tan(Math.PI / 4 + slat1 / 2), sn) * Math.cos(slat1) / sn;
const ro = re * sf / Math.pow(Math.tan(Math.PI / 4 + 38 * RAD / 2), sn);

export function toGrid(latitude, longitude) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude <= -90 || latitude >= 90 || longitude < -180 || longitude > 180) {
    throw new Error('유효한 위도·경도를 입력해 주세요.');
  }
  const ra = re * sf / Math.pow(Math.tan(Math.PI / 4 + latitude * RAD / 2), sn);
  let theta = (longitude - 126) * RAD;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;
  const nx = Math.floor(ra * Math.sin(theta) + 43 + 0.5);
  const ny = Math.floor(ro - ra * Math.cos(theta) + 136 + 0.5);
  if (nx < 1 || nx > 149 || ny < 1 || ny > 253) {
    throw new Error('기상청 동네예보 격자 영역(149 × 253) 밖입니다. 국내 위치를 선택해 주세요.');
  }
  return {nx, ny};
}
