"""Normalize an official KMA station CSV without credentials or extra packages."""
import argparse
import csv
import hashlib
import io
import json
import math
from datetime import date
from pathlib import Path


def normalize(raw, network, as_of):
    text = raw.decode('utf-8-sig') if raw.startswith(b'\xef\xbb\xbf') else raw.decode('cp949')
    rows = list(csv.DictReader(io.StringIO(text.lstrip('\r\n\ufeff'))))
    required = {'지점', '시작일', '종료일', '지점명', '지점주소', '위도', '경도'}
    if not rows or not required.issubset(rows[0]):
        raise ValueError('기상자료개방포털 관측지점정보 CSV의 필수 열이 없습니다.')
    stations = {}
    excluded = 0
    for row in rows:
        start, end = row['시작일'].strip(), row['종료일'].strip()
        if not start:
            raise ValueError('시작일 누락')
        date.fromisoformat(start)
        if end:
            date.fromisoformat(end)
        if start > as_of or (end and end <= as_of):
            excluded += 1
            continue
        sid, name = row['지점'].strip(), row['지점명'].strip()
        if not sid.isdigit() or not name:
            raise ValueError('지점번호/지점명 오류')
        lat, lon = float(row['위도']), float(row['경도'])
        if not (math.isfinite(lat) and math.isfinite(lon) and 32 <= lat <= 44 and 123 <= lon <= 133):
            raise ValueError(f'{sid}: 한반도 관측소 좌표 범위 오류')
        address = row['지점주소'].strip()
        item = dict(id=sid, name=name, network=network, latitude=lat, longitude=lon,
                    region=address.split()[0] if address else None, address=address or None,
                    status='active', historyStart=start, historyEnd=end or None)
        old = stations.get(sid)
        if old and old['historyStart'] == start and old != item:
            raise ValueError(f'{sid}: 동일 시작일의 상충된 중복 이력')
        if old is None or old['historyStart'] < start:
            stations[sid] = item
    return sorted(stations.values(), key=lambda s: int(s['id'])), len(rows), excluded


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('input', type=Path)
    p.add_argument('--network', required=True, choices=['ASOS', 'AWS'])
    p.add_argument('--as-of', required=True, help='YYYY-MM-DD, 한국 날짜 기준')
    p.add_argument('--output', required=True, type=Path)
    p.add_argument('--sources', type=Path, help='기존 sources.json에 해당 관측망 메타데이터 병합')
    args = p.parse_args()
    date.fromisoformat(args.as_of)
    raw = args.input.read_bytes()
    stations, total, excluded = normalize(raw, args.network, args.as_of)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(stations, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    if args.sources:
        sources = json.loads(args.sources.read_text(encoding='utf-8')) if args.sources.exists() else {}
        sources[args.network] = dict(
            dataset=f'{args.network} 관측지점정보', provider='기상청 국가기후데이터센터',
            url='https://data.kma.go.kr/tmeta/stn/selectStnList.do?pgmNo=123',
            downloadUrl='https://data.kma.go.kr/tmeta/stn/selectStnListDownload.do',
            classification='SFC01' if args.network == 'ASOS' else 'SFC02',
            collectedAt=args.as_of, updatedAt=args.as_of, referenceDate=args.as_of,
            referenceDateMeaning='원본 제공기관의 별도 기준일은 미표기. 수집일 기준 유효 이력을 선택.',
            count=len(stations), originalRows=total, excludedHistoricalRows=excluded,
            originalSha256=hashlib.sha256(raw).hexdigest(), coverage='national', sample=False,
            transform='CP949/UTF-8 CSV; 지점→문자열 id, 지점명→name, 위도/경도→숫자, 주소 첫 토큰→region. 시작일≤기준일<종료일(공란은 종료 없음); 동일 번호의 최신 시작일 선택. 좌표 범위·상충 중복 검증.',
            limitations='active는 원본 이력 유효성만 의미하며 실시간 운영·관측요소 제공을 보장하지 않습니다.')
        args.sources.write_text(json.dumps(sources, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'network': args.network, 'count': len(stations), 'originalRows': total, 'excluded': excluded}))


if __name__ == '__main__':
    main()
