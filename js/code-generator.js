export function requestParams(mode, point, service) {
  if (!point || !service?.endpoint) return null;
  if (mode === 'GRID') return {
    ServiceKey:'YOUR_API_KEY', pageNo:1, numOfRows:1000, dataType:'JSON',
    base_date:'YYYYMMDD', base_time:'HH00', nx:point.nx, ny:point.ny
  };
  return {[service.keyParameter]:'YOUR_API_KEY', [service.stationParameter]:point.id,
    [service.timeParameter]:'YYYYMMDDHHmm', ...(mode === 'AWS' ? {disp:1} : {}), help:1};
}
export function pythonCode(mode, point, service) {
  const params = requestParams(mode, point, service);
  if (!params) return '';
  const time = mode === 'GRID'
    ? `# 제공 지연을 고려한 이전 시각. 데이터가 없으면 더 이전 시각으로 조정하세요.\nbase = datetime.now(ZoneInfo("Asia/Seoul")) - timedelta(hours=1)\nparams["base_date"] = base.strftime("%Y%m%d")\nparams["base_time"] = base.strftime("%H00")`
    : `# ASOS는 정시, AWS는 분 단위. 제공 지연/결측 시 더 이전 시각으로 조정하세요.\nbase = datetime.now(ZoneInfo("Asia/Seoul")) - timedelta(${mode === 'AWS' ? 'minutes=10' : 'hours=1'})\nparams["${service.timeParameter}"] = base.strftime("${mode === 'AWS' ? '%Y%m%d%H%M' : '%Y%m%d%H00'}")`;
  const result = mode === 'GRID' ? `try:\n    envelope = response.json().get("response", {})\nexcept ValueError:\n    raise SystemExit("JSON이 아닙니다. 서비스 활용승인·인증키·요청변수를 확인하세요.")\nheader = envelope.get("header", {})\nif str(header.get("resultCode")) not in ("00", "0"):\n    raise SystemExit("API 오류: " + str(header.get("resultMsg", "알 수 없는 오류")))\nitems = envelope.get("body", {}).get("items") or {}\nrows = items.get("item", []) if isinstance(items, dict) else []\nif not rows:\n    raise SystemExit("해당 시각/격자에 자료가 없습니다. 발표 시각과 제공 범위를 확인하세요.")\nprint(json.dumps(rows, ensure_ascii=False, indent=2))`
    : `# 응답은 CSV/공백 텍스트이며 결측값은 명세를 확인하세요.\ntext = response.text\nrows = [line for line in text.splitlines()\n        if line.strip() and not line.lstrip().startswith("#")\n        and line.lstrip()[:1].isdigit()]\nif not rows:\n    raise SystemExit("관측자료가 없거나 API 오류입니다. 활용승인·키·시각·지점번호를 확인하세요.")\nprint("\\n".join(rows))`;
  return `# Python 3.9+ · pip install requests tzdata\n# 인증키 실호출 미검증 템플릿 · API 활용승인 후 개인 환경에서 실행\n# ${service.docs}\nimport os\nimport json\nimport requests\nfrom datetime import datetime, timedelta\nfrom zoneinfo import ZoneInfo\n\nparams = ${JSON.stringify(params, null, 4)}\n# 공공데이터포털 키는 Decoding(일반 인증키) 사용. 소스/저장소에 키를 저장하지 마세요.\nparams["${service.keyParameter}"] = os.environ.get("${mode === 'GRID' ? 'DATA_GO_KR_KEY' : 'KMA_API_KEY'}", "YOUR_API_KEY")\nif params["${service.keyParameter}"] == "YOUR_API_KEY":\n    raise SystemExit("환경변수에 본인의 API 키를 설정하세요.")\n${time}\n\ntry:\n    response = requests.get("${service.endpoint}", params=params, timeout=30)\n    response.raise_for_status()\nexcept requests.RequestException:\n    # 오류 객체에는 인증키가 포함된 URL이 들어갈 수 있으므로 출력하지 않습니다.\n    raise SystemExit("HTTP 요청 실패. 네트워크·서비스 상태를 확인하세요.")\nresponse.encoding = "utf-8"\n${result}\n`;
}
