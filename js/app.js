import {toGrid} from './grid-converter.js';
import {validateStations, filterStations} from './stations.js';
import {requestParams, pythonCode} from './code-generator.js';

const $ = id => document.getElementById(id);
const state = {mode:'ASOS', gridService:'GRID', disaster:'heat', selected:null, codeTab:'params', datasets:{}, services:{}, sources:{}, mapping:[], visible:[], limit:50, errors:{}};
const labels = {ASOS:'종관기상관측', AWS:'방재기상관측', GRID:'초단기실황 격자'};
let map, markers, selectedMarker, gridMarker, toastTimer;

function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function value(v) { return v === null || v === undefined || v === '' ? '정보 없음' : String(v); }
function toast(message) {
  $('toast').textContent = message;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').textContent = '', 3500);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('클립보드에 복사했습니다.'); }
  catch {
    // Selectable fallback for restricted clipboard environments.
    const box = node('textarea'); box.value = text; box.setAttribute('aria-label','복사할 정보');
    document.body.append(box); box.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* manual copy below */ }
    if (ok) { box.remove(); toast('클립보드에 복사했습니다.'); }
    else { box.style.cssText='position:fixed;inset:20%;width:60%;height:50%;z-index:3000';
      toast('표시된 내용을 Ctrl+C로 복사한 후 Esc를 누르세요.');
      box.addEventListener('keydown', e => {if(e.key === 'Escape') box.remove();}); }
  }
}
function clearSelection() {
  state.selected = null;
  if (selectedMarker) { selectedMarker.remove(); selectedMarker = null; }
  if (gridMarker) { gridMarker.remove(); gridMarker = null; }
  renderDetails();
}
function setupMap() {
  if (!window.L) {
    $('map-warning').hidden = false;
    $('map-warning').textContent = '지도 라이브러리를 불러오지 못했습니다. 목록 검색과 좌표 직접 입력을 이용하세요.';
    return;
  }
  map = L.map('map', {preferCanvas:true, scrollWheelZoom:false}).setView([36.1,127.8],7);
  const tile = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom:18
  }).addTo(map);
  tile.on('tileerror', () => {
    $('map-warning').hidden = false;
    $('map-warning').textContent = '배경 지도 연결이 원활하지 않습니다. 관측소 목록과 좌표 기능은 계속 사용할 수 있습니다.';
  });
  markers = L.layerGroup().addTo(map);
  map.on('click', e => {
    if (state.mode !== 'GRID') return;
    $('latitude').value = e.latlng.lat.toFixed(6); $('longitude').value = e.latlng.lng.toFixed(6);
    convertGrid();
  });
}
function renderDisasters() {
  $('disasters').replaceChildren(...state.mapping.map(d => {
    const b = node('button'); b.append(node('span',d.symbol), document.createTextNode(d.name));
    b.setAttribute('aria-pressed',String(state.disaster === d.id));
    b.addEventListener('click', () => {
      const enteringTyphoon = d.id === 'typhoon' && state.disaster !== 'typhoon';
      state.disaster=d.id; renderDisasters();
      if (enteringTyphoon) {state.gridService='GRID_FORECAST';switchNetwork('GRID');}
    }); return b;
  }));
  const d = state.mapping.find(x=>x.id===state.disaster);
  if (!d) return;
  $('elements').textContent = d.elements.join(' · ');
  $('disaster-note').textContent = d.note;
  $('phenomenon').hidden = !d.phenomenon; $('explorer').hidden = d.id === 'earthquake';
  $('typhoon-guide').hidden = d.id !== 'typhoon';
  $('earthquake-guide').hidden = d.id !== 'earthquake';
  if (d.phenomenon) {
    $('phenomenon-title').textContent = d.title || `${d.name} 자료 선택 안내`;
    $('phenomenon-note').textContent = d.note;
    $('phenomenon-link').href = d.url;
    $('phenomenon-link').textContent = d.id === 'earthquake' ? '주변 관측소·지역 진도 확인 ↗' : '태풍 중심·진로 확인 ↗';
  }
  if (d.id !== 'earthquake' && map) { requestAnimationFrame(() => map.invalidateSize()); }
}
function switchNetwork(mode) {
  state.mode = mode; state.limit = 50; clearSelection();
  document.querySelectorAll('[data-network]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.network === mode)));
  const grid = mode === 'GRID';
  $('station-search').hidden = grid; $('grid-form').hidden = !grid;
  $('grid-service-picker').hidden = !grid;
  $('network-description').textContent = grid ? '예보구역의 대표 실황 자료 · 관측소 번호 대신 nx, ny 사용' :
    mode === 'ASOS' ? '종관기상관측 · 전국 지점정보에서 탐색' : '방재기상관측 · 전국 자동관측 지점정보에서 탐색';
  $('map-label').textContent = grid ? '위치를 선택해 격자로 변환' : `${mode} 관측소`;
  $('map-caption').textContent = grid ? '지도 클릭 또는 좌표 입력' : '실제 관측소 위치';
  $('map-legend').textContent = grid ? '◇ 선택 위치 · 격자 요청용 (관측소 아님)' : '● 관측소　● 선택 지점은 주황색';
  $('query').value = ''; $('region').replaceChildren(node('option','모든 시도')); $('region').firstChild.value='';
  $('grid-error').textContent = '';
  if (markers) markers.clearLayers();
  if (!grid) {
    const regions = [...new Set((state.datasets[mode] || []).map(s => s.region).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
    for (const region of regions) {const o=node('option',region);o.value=region;$('region').append(o);}
    updateResults(true);
    const initial = state.visible.find(s=>s.id === '108') || state.visible[0];
    if (initial) selectStation(initial, false);
  } else {
    $('latitude').value=''; $('longitude').value='';
    if (map) map.setView([36.1,127.8],7);
    updateGridService();
  }
}
function currentService() {return state.services[state.mode==='GRID' ? state.gridService : state.mode];}
function updateGridService() {
  $('grid-service').value = state.gridService;
  const forecast = state.gridService !== 'GRID';
  const note = state.gridService === 'GRID_FORECAST'
    ? '미래 예보 · WSD(풍속), VEC(풍향), PCP(1시간 강수량), POP(강수확률). 발표시각과 예보 대상 시각을 구분하세요.'
    : state.gridService === 'GRID_ULTRA_FORECAST'
      ? '가까운 미래 예보 · WSD(풍속), VEC(풍향), RN1(1시간 강수량). 초단기실황과 달리 fcstValue를 사용합니다.'
      : '현재 상황 · T1H(기온), REH(습도), WSD(풍속), VEC(풍향), RN1(1시간 강수량). obsrValue를 사용합니다.';
  $('grid-service-note').textContent=note;
  $('network-description').textContent=forecast ? '지역별 미래 예보 · 관측소 번호 대신 nx, ny 사용' : '예보구역의 대표 실황 자료 · 관측소 번호 대신 nx, ny 사용';
  $('map-label').textContent=forecast ? '예보를 확인할 지역의 격자 선택' : '현재 실황을 확인할 지역의 격자 선택';
  renderDetails();
}
function updateResults(fit=false) {
  state.visible = filterStations(state.datasets[state.mode] || [], $('query').value, $('region').value);
  if (state.selected && !state.visible.some(s=>s.id === state.selected.id)) clearSelection();
  $('result-count').textContent = state.visible.length.toLocaleString('ko');
  renderList(); drawStations();
  if (fit) fitMap();
}
function renderList() {
  const list = $('station-list'); list.replaceChildren();
  if (state.errors[state.mode]) list.append(node('p',`${state.mode} 지점정보를 불러오지 못했습니다. 새로고침하거나 데이터 파일을 확인하세요.`,'error'));
  else if (!state.visible.length) list.append(node('p','검색 결과가 없습니다. 지점명·번호·지역을 바꾸거나 필터를 초기화해 주세요.','empty'));
  for (const s of state.visible.slice(0,state.limit)) {
    const b = node('button',undefined,'station-row');
    b.dataset.id=s.id; b.setAttribute('aria-pressed',String(state.selected?.id === s.id));
    const desc = node('span'); desc.append(node('strong',value(s.name)),node('small',value(s.region)));
    b.append(desc,node('span',s.id,'station-id'));
    b.addEventListener('click',()=>selectStation(s,true)); list.append(b);
  }
  $('more').hidden = state.visible.length <= state.limit;
}
function drawStations() {
  if (!markers) return;
  markers.clearLayers();
  for (const s of state.visible) {
    if (s.latitude == null || s.longitude == null) continue;
    const marker = L.circleMarker([s.latitude,s.longitude],{radius:5,color:'#fff',weight:1.5,fillColor:'#087e78',fillOpacity:.88}).addTo(markers);
    marker.bindTooltip(node('span',`${value(s.name)} · ${s.id}`));
    marker.on('click',()=>selectStation(s,false));
  }
}
function selectStation(s, move) {
  state.selected = s;
  if (selectedMarker) selectedMarker.remove();
  if (map && s.latitude != null && s.longitude != null) {
    selectedMarker = L.circleMarker([s.latitude,s.longitude],{radius:9,color:'#fff',weight:3,fillColor:'#e38b27',fillOpacity:1}).addTo(map);
    selectedMarker.bindTooltip(node('span',`${value(s.name)} · ${s.id}`));
    if (move) map.setView([s.latitude,s.longitude], Math.max(map.getZoom(),9));
  }
  const index = state.visible.findIndex(x=>x.id===s.id);
  if (index >= state.limit) state.limit = Math.ceil((index+1)/50)*50;
  renderList(); renderDetails();
  const button = $('station-list').querySelector(`[data-id="${s.id}"]`);
  if (button && !move) $('station-list').scrollTop = Math.max(0,button.offsetTop - $('station-list').firstElementChild.offsetTop-100);
}
function fitMap() {
  if (!map) return;
  const coords = state.mode === 'GRID' ? [] : state.visible.filter(s=>s.latitude != null && s.longitude != null).map(s=>[s.latitude,s.longitude]);
  if (coords.length) map.fitBounds(coords,{padding:[26,26],maxZoom:10});
  else map.setView([36.1,127.8],7);
}
function convertGrid() {
  clearSelection(); $('grid-error').textContent='';
  try {
    if (!$('latitude').value.trim() || !$('longitude').value.trim()) throw new Error('위도와 경도를 모두 입력해 주세요.');
    const latitude=Number($('latitude').value), longitude=Number($('longitude').value);
    const {nx,ny}=toGrid(latitude,longitude);
    state.selected={name:'선택한 격자 위치',network:'GRID',latitude,longitude,nx,ny};
    if (map) {
      gridMarker=L.marker([latitude,longitude],{icon:L.divIcon({className:'grid-pointer',html:'<span style="display:block;font-size:32px;color:#087e78;text-shadow:0 0 3px white;line-height:32px">◇</span>',iconSize:[32,32],iconAnchor:[16,16]})}).addTo(map);
      gridMarker.bindTooltip(node('span',`격자 (${nx}, ${ny}) · 실제 관측소 아님`));
      map.panTo([latitude,longitude]);
    }
    renderDetails();
  } catch(e) { $('grid-error').textContent=e.message; }
}
function renderDetails() {
  const s=state.selected, grid=state.mode==='GRID';
  $('detail-network').textContent=state.mode;
  $('detail').hidden=!s; $('detail-empty').hidden=Boolean(s);
  if (!s) {$('code').textContent=''; return;}
  $('detail-kicker').textContent=grid ? '5 KM GRID · 관측소 아님' : `${labels[state.mode]}소`;
  $('detail-name').textContent=value(s.name);
  $('detail-address').textContent=grid ? '지도에서 지정한 위치를 기상청 격자로 변환' : value(s.address || s.region);
  const values=grid ? [['격자 좌표 (nx, ny)',`${s.nx}, ${s.ny}`],['입력 위도 (°N)',value(s.latitude)],['입력 경도 (°E)',value(s.longitude)]] :
    [['지점번호',s.id],['위도 (°N)',value(s.latitude)],['경도 (°E)',value(s.longitude)]];
  $('coordinate-values').replaceChildren(...values.map(([label,v])=>{
    const el=node('div',undefined,'coordinate-value'); el.append(node('small',label),node('strong',v)); return el;
  }));
  $('copy-id').textContent=grid ? 'nx, ny 복사' : '지점번호 복사';
  document.querySelector('.element-warning').textContent=grid ? '격자 번호는 관측소 지점번호가 아닙니다. 자료가 없는 격자도 있습니다.' : '관측 요소 제공 여부는 지점·서비스별로 확인해야 합니다.';
  const service=currentService();
  const options=grid ? ['GRID','GRID_FORECAST','GRID_ULTRA_FORECAST'] : [state.mode];
  $('api-service').replaceChildren(...options.map(key=>{
    const option=node('option',state.services[key]?.name || '검증된 API 명세 없음');option.value=key;return option;
  }));
  $('api-service').value=grid ? state.gridService : state.mode;
  $('api-docs').hidden=!service?.docs;
  if(service?.docs) $('api-docs').href=service.docs;
  renderCode();
}
function renderCode() {
  const service=currentService();
  const params=requestParams(state.mode,state.selected,service);
  $('tab-params').setAttribute('aria-pressed',String(state.codeTab==='params'));
  $('tab-python').setAttribute('aria-pressed',String(state.codeTab==='python'));
  $('copy-code').disabled=!params;
  $('copy-code').textContent=state.codeTab==='params' ? '요청변수 복사' : 'Python 코드 복사';
  $('code').textContent=params ? state.codeTab==='params' ? JSON.stringify(params,null,2) : pythonCode(state.mode,state.selected,service) : '공식 명세를 확인할 수 없어 코드 생성을 비활성화했습니다.';
}
function renderSources() {
  $('source-content').replaceChildren(...['ASOS','AWS'].map(key=>{
    const s=state.sources[key], el=node('div',undefined,'source-card');
    if(!s){el.append(node('p',`${key} 출처 정보 없음`));return el;}
    el.append(node('h3',`${key} · ${s.count.toLocaleString('ko')}개 ${s.sample ? '(샘플)' : '(전국 다운로드 기준)'}`));
    const link=node('a',s.provider);link.href=s.url;link.target='_blank';link.rel='noopener noreferrer';el.append(link);
    el.append(node('p',`수집·갱신일 ${s.updatedAt} / 이력선택 기준일 ${s.referenceDate}`));
    el.append(node('p',s.referenceDateMeaning),node('p',s.transform),node('p',s.limitations));return el;
  }));
  const counts=['ASOS','AWS'].map(key=>`${key} ${state.datasets[key]?.length ?? '로드 실패'}개`).join(' · ');
  const sample=Object.values(state.sources).some(s=>s.sample);
  $('source-summary').textContent=`${sample?'샘플 데이터 · ':''}${counts} / 갱신 ${state.sources.ASOS?.updatedAt || '정보 없음'}`;
}
async function getJSON(path) {
  const response=await fetch(path); if(!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}
async function init() {
  setupMap();
  const names=['ASOS','AWS','mapping','services','sources'];
  const paths=['data/asos.json','data/aws.json','data/disaster-mapping.json','data/services.json','data/sources.json'];
  const results=await Promise.allSettled(paths.map(getJSON));
  const failures=[];
  results.forEach((r,i)=>{
    const name=names[i];
    try {
      if(r.status==='rejected') throw r.reason;
      if(i<2) state.datasets[name]=validateStations(r.value,name);
      else if(name==='mapping') {if(!Array.isArray(r.value)||!r.value.length) throw new Error('재해 설정 오류');state.mapping=r.value;}
      else state[name]=r.value;
    } catch(e) {state.errors[name]=e.message; failures.push(paths[i]);}
  });
  for (const mode of ['ASOS','AWS']) {
    const source=state.sources[mode];
    if(source && state.datasets[mode] && source.count!==state.datasets[mode].length) failures.push(`${mode} 출처 지점 수 불일치`);
  }
  $('load-status').hidden=!failures.length;
  if(failures.length){$('load-status').classList.add('error');$('load-status').textContent=`일부 자료를 불러오지 못했습니다: ${failures.join(', ')}. 새로고침하거나 저장소의 JSON 파일을 확인해 주세요.`;}
  renderDisasters(); renderSources(); switchNetwork('ASOS');
}
function hideTooltips() {document.querySelectorAll('.network-tooltip').forEach(t=>t.hidden=true);}
document.querySelectorAll('[data-network]').forEach(b=>{
  const show=()=>{hideTooltips();$(`tooltip-${b.dataset.network}`).hidden=false;};
  b.addEventListener('click',()=>{switchNetwork(b.dataset.network);show();});
  b.addEventListener('mouseenter',show);b.addEventListener('focus',show);
  b.addEventListener('blur',hideTooltips);
});
document.querySelector('.network-tabs').addEventListener('mouseleave',()=>{
  const focused=document.activeElement;
  hideTooltips();
  if(focused?.matches('[data-network]')) $(`tooltip-${focused.dataset.network}`).hidden=false;
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideTooltips();});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.network-tabs'))hideTooltips();});
$('grid-service').addEventListener('change',()=>{state.gridService=$('grid-service').value;updateGridService();});
$('api-service').addEventListener('change',()=>{if(state.mode==='GRID'){state.gridService=$('api-service').value;updateGridService();}});
$('typhoon-forecast').addEventListener('click',()=>{
  state.gridService='GRID_FORECAST';switchNetwork('GRID');
  $('explorer').scrollIntoView({block:'start'});$('latitude').focus({preventScroll:true});
});
$('typhoon-observation').addEventListener('click',()=>{
  switchNetwork('AWS');$('explorer').scrollIntoView({block:'start'});$('query').focus({preventScroll:true});
});
$('query').addEventListener('input',()=>{state.limit=50;updateResults();});
$('region').addEventListener('change',()=>{state.limit=50;updateResults(true);});
$('reset-search').addEventListener('click',()=>{$('query').value='';$('region').value='';state.limit=50;updateResults(true);});
$('more').addEventListener('click',()=>{state.limit+=50;renderList();});
$('fit-map').addEventListener('click',fitMap);
$('grid-form').addEventListener('submit',e=>{e.preventDefault();convertGrid();});
for(const id of ['latitude','longitude']) $(id).addEventListener('input',()=>{if(state.mode==='GRID'){clearSelection();$('grid-error').textContent='';}});
$('copy-id').addEventListener('click',()=>{const s=state.selected;if(s) copy(state.mode==='GRID'?`nx=${s.nx}, ny=${s.ny}`:s.id);});
$('copy-coordinates').addEventListener('click',()=>{const s=state.selected;if(s)copy(`latitude=${value(s.latitude)}, longitude=${value(s.longitude)}`);});
$('copy-code').addEventListener('click',()=>copy($('code').textContent));
for(const tab of ['params','python']) $(`tab-${tab}`).addEventListener('click',()=>{state.codeTab=tab;renderCode();});
$('download').addEventListener('click',()=>{
  if(!state.selected)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(state.selected,null,2)],{type:'application/json;charset=utf-8'}));
  const a=node('a');a.href=url;a.download=`${state.mode}-${state.selected.id || `${state.selected.nx}-${state.selected.ny}`}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
init().catch(()=>{$('load-status').hidden=false;$('load-status').classList.add('error');$('load-status').textContent='앱 초기화에 실패했습니다. 새로고침하거나 데이터 파일을 확인해 주세요.';});
