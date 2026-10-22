import test from 'node:test';
import assert from 'node:assert/strict';
import {toGrid} from '../js/grid-converter.js';

test('공식 기준점과 모서리 좌표 (기상청 2024-03-05 격자영역 문서)', () => {
  assert.deepEqual(toGrid(38,126),{nx:43,ny:136});
  assert.deepEqual(toGrid(31.7944,123.7613),{nx:1,ny:1});
  assert.deepEqual(toGrid(43.3935,123.3102),{nx:1,ny:253});
  assert.deepEqual(toGrid(31.6518,131.6423),{nx:149,ny:1});
  assert.deepEqual(toGrid(43.2175,132.7750),{nx:149,ny:253});
});
test('주요 도시 회귀 사례', () => {
  assert.deepEqual(toGrid(37.5665,126.978),{nx:60,ny:127});
  assert.deepEqual(toGrid(35.1796,129.0756),{nx:98,ny:76});
  assert.deepEqual(toGrid(33.4996,126.5312),{nx:53,ny:38});
});
test('미입력·비수치·극점·해외 위치 거부', () => {
  for(const [lat,lon] of [[null,127],['37',127],[NaN,127],[90,127],[37,Infinity],[0,0],[51.5,-.1]])
    assert.throws(()=>toGrid(lat,lon));
});
