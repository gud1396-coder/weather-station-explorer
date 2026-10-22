export function requestParams(mode, point, service) {
  if (!point || !service?.endpoint) return null;
  if (mode === 'GRID') return {
    [service.keyParameter || 'ServiceKey']:'YOUR_API_KEY', pageNo:1, numOfRows:1000, dataType:'JSON',
    base_date:'YYYYMMDD', base_time:service.baseTimeExample || 'HH00', nx:point.nx, ny:point.ny
  };
  return {[service.keyParameter]:'YOUR_API_KEY', [service.stationParameter]:point.id,
    [service.timeParameter]:'YYYYMMDDHHmm', ...(mode === 'AWS' ? {disp:1} : {}), help:1};
}

function timeCode(mode, service) {
  if (mode !== 'GRID') return `# ASOS는 정시, AWS는 분 단위. 제공 지연/결측 시 더 이전 시각으로 조정하세요.\nbase = datetime.now(ZoneInfo("Asia/Seoul")) - timedelta(${mode === 'AWS' ? 'minutes=10' : 'hours=1'})\nparams["${service.timeParameter}"] = base.strftime("${mode === 'AWS' ? '%Y%m%d%H%M' : '%Y%m%d%H00'}")`;
  if (service.kind === 'short-forecast') return `# 명세에 제시된 05시 발표 예보를 사용합니다(최신 발표 선택 기능 아님).\n# 06시 전에는 제공 지연을 고려해 전날 05시 발표를 사용합니다.\nbase = datetime.now(ZoneInfo("Asia/Seoul"))\nif base.hour < 6:\n    base -= timedelta(days=1)\nparams["base_date"] = base.strftime("%Y%m%d")\nparams["base_time"] = "0500"\n# 최신 발표가 필요하면 공식 발표 일정에 맞춰 base_date/base_time을 조정하세요.\n# 분석 시 fcstDate, fcstTime, nx, ny가 같은 행을 묶고 fcstValue를 사용하세요.`;
  if (service.kind === 'ultra-forecast') return `# 매시 30분 발표. 제공 지연을 고려해 최소 1시간 전 발표를 선택합니다.\nbase = datetime.now(ZoneInfo("Asia/Seoul")) - timedelta(hours=1)\nif base.minute < 30:\n    base -= timedelta(hours=1)\nparams["base_date"] = base.strftime("%Y%m%d")\nparams["base_time"] = base.strftime("%H30")\n# fcstDate/fcstTime은 예보 대상 시각이며 fcstValue가 미래 예보값입니다.`;
  return `# 제공 지연을 고려한 이전 시각. 자료가 없으면 더 이전 시각으로 조정하세요.\nbase = datetime.now(ZoneInfo("Asia/Seoul")) - timedelta(hours=1)\nparams["base_date"] = base.strftime("%Y%m%d")\nparams["base_time"] = base.strftime("%H00")`;
}

export function pythonCode(mode, point, service) {
  const params = requestParams(mode, point, service);
  if (!params) return '';
  const keyEnvironment=service.keyEnvironment || (mode==='GRID' ? 'DATA_GO_KR_KEY' : 'KMA_API_KEY');
  const keyParameter=service.keyParameter || 'ServiceKey';
  const jsonResult=`rows = []\nwhile True:\n    response = fetch_page()\n    try:\n        envelope = response.json().get("response", {})\n    except ValueError:\n        raise SystemExit("JSON이 아닙니다. 활용승인·인증키·요청변수를 확인하세요.")\n    header = envelope.get("header", {})\n    if str(header.get("resultCode")) not in ("00", "0"):\n        raise SystemExit("API 오류: " + str(header.get("resultMsg", "알 수 없는 오류")))\n    body = envelope.get("body", {})\n    items = body.get("items") or {}\n    page_rows = items.get("item", []) if isinstance(items, dict) else []\n    if not page_rows:\n        raise SystemExit("해당 발표시각/격자 또는 후속 페이지에 자료가 없습니다.")\n    rows.extend(page_rows)\n    total = int(body.get("totalCount", len(rows)))\n    if len(rows) >= total:\n        break\n    params["pageNo"] += 1\n    if params["pageNo"] > 100:\n        raise SystemExit("페이지 수가 예상보다 많습니다. 요청 조건을 확인하세요.")\nprint(json.dumps(rows, ensure_ascii=False, indent=2))`;
  const textResult=`response = fetch_page()\n# 응답은 CSV/공백 텍스트이며 결측값은 명세를 확인하세요.\ntext = response.text\nrows = [line for line in text.splitlines()\n        if line.strip() and not line.lstrip().startswith("#")\n        and line.lstrip()[:1].isdigit()]\nif not rows:\n    raise SystemExit("관측자료가 없거나 API 오류입니다. 활용승인·키·시각·지점번호를 확인하세요.")\nprint("\\n".join(rows))`;
  return `# Python 3.9+ · pip install requests tzdata\n# 인증키 실호출 미검증 템플릿 · API 활용승인 후 개인 환경에서 실행\n# ${service.docs}\nimport os\nimport json\nimport requests\nfrom datetime import datetime, timedelta\nfrom zoneinfo import ZoneInfo\n\nparams = ${JSON.stringify(params, null, 4)}\n# 공공데이터포털 키는 Decoding(일반 인증키) 사용. API허브 키와 서로 다릅니다.\n# 인증키를 소스/저장소에 저장하지 마세요.\nparams["${keyParameter}"] = os.environ.get("${keyEnvironment}", "YOUR_API_KEY")\nif params["${keyParameter}"] == "YOUR_API_KEY":\n    raise SystemExit("환경변수에 해당 서비스의 본인 API 키를 설정하세요.")\n${timeCode(mode,service)}\n\ndef fetch_page():\n    try:\n        response = requests.get("${service.endpoint}", params=params, timeout=30)\n        response.raise_for_status()\n    except requests.RequestException:\n        # 오류 객체에는 키가 포함된 URL이 들어갈 수 있으므로 출력하지 않습니다.\n        raise SystemExit("HTTP 요청 실패. 네트워크·서비스 상태를 확인하세요.")\n    response.encoding = "utf-8"\n    return response\n\n${mode==='GRID' ? jsonResult : textResult}\n`;
}
