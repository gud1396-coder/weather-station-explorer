import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateStations,filterStations} from '../js/stations.js';
import {requestParams,pythonCode} from '../js/code-generator.js';
const read = path => JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const datasets={ASOS:read('data/asos.json'),AWS:read('data/aws.json')};
const sources=read('data/sources.json'), services=read('data/services.json');
test('전국 정규화 데이터와 출처 수 일치, 현재 이력, 좌표',()=>{
  for(const [mode,data] of Object.entries(datasets)){
    assert.equal(validateStations(data,mode),data);
    assert.equal(data.length,sources[mode].count);
    assert.ok(data.length>50);
    for(const s of data){
      assert.ok(s.historyStart <= sources[mode].referenceDate);
      assert.ok(!s.historyEnd || s.historyEnd > sources[mode].referenceDate);
      assert.equal(typeof s.id,'string');
    }
  }
});
test('이름·번호·주소 검색, 시도 필터, 0건',()=>{
  assert.equal(filterStations(datasets.ASOS,'108')[0].name,'서울');
  assert.equal(filterStations(datasets.ASOS,'서울 108').length,1);
  assert.ok(filterStations(datasets.AWS,'서울').length>0);
  assert.ok(filterStations(datasets.ASOS,'','제주특별자치도').length>0);
  assert.equal(filterStations(datasets.ASOS,'없는지점xyz').length,0);
  assert.ok(filterStations(datasets.AWS,'').every(s=>s.network==='AWS'));
});
test('스키마 오류·잘못된 망·중복·잘못된 좌표 거부, 누락좌표 수용',()=>{
  const s=datasets.ASOS[0];
  for(const data of [{},[s,s],[{...s,network:'AWS'}],[{...s,id:90}],[{...s,latitude:999}]])
    assert.throws(()=>validateStations(data,'ASOS'));
  assert.equal(validateStations([{...s,latitude:null,longitude:null}], 'ASOS').length,1);
});
test('API 서비스별 위치·시간 변수 분리',()=>{
  const point=datasets.ASOS.find(s=>s.id==='108');
  const asos=requestParams('ASOS',point,services.ASOS);
  assert.equal(asos.stn,'108'); assert.ok(asos.tm); assert.equal(asos.nx,undefined);
  const aws=requestParams('AWS',datasets.AWS[0],services.AWS);
  assert.ok(aws.tm2); assert.equal(aws.tm,undefined);
  const grid=requestParams('GRID',{nx:60,ny:127},services.GRID);
  assert.equal(grid.nx,60); assert.equal(grid.stn,undefined); assert.ok(grid.base_time);
  assert.equal(requestParams('AWS',point,{}),null);
});
test('생성 코드에 개인키 대신 환경변수·오류처리 포함',()=>{
  for(const mode of ['ASOS','AWS','GRID']){
    const point=mode==='GRID'?{nx:60,ny:127}:datasets[mode][0];
    const code=pythonCode(mode,point,services[mode]);
    assert.match(code,/YOUR_API_KEY/); assert.match(code,/os.environ.get/);
    assert.match(code,/Asia\/Seoul/); assert.match(code,/raise_for_status/);
    assert.match(code,/timeout=30/); assert.doesNotMatch(code,/print\(response.url\)/);
  }
});
