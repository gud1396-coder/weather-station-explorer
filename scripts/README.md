# 교사 지점정보 갱신

1. [기상자료개방포털 관측지점정보](https://data.kma.go.kr/tmeta/stn/selectStnList.do?pgmNo=123)에서 **종관기상관측**과 **방재기상관측**을 각각 선택해 CSV로 다운로드합니다. 다른 관측망을 섞지 마세요.
2. 원본은 추적하지 않는 `raw/` 등에 저장합니다. 포털에서 내려받은 CP949 CSV 또는 BOM 포함 UTF-8 CSV를 지원합니다. API허브 TXT는 열 구조가 다르므로 직접 입력하지 않습니다.
3. 저장소 루트에서 실행합니다. 날짜는 실제 수집한 한국 날짜를 지정하세요.

```sh
python scripts/normalize_stations.py raw/asos.csv --network ASOS --as-of 2026-10-22 --output data/asos.json --sources data/sources.json
python scripts/normalize_stations.py raw/aws.csv --network AWS --as-of 2026-10-22 --output data/aws.json --sources data/sources.json
node --test tests/*.test.js
python -m unittest discover -s tests -p "test_*.py"
```

`--network`는 다운로드 시 선택한 관측망과 일치해야 합니다. 스크립트가 지점번호만으로 관측망을 추측하지 않습니다. 원본 파일 헤더에는 관측망 열이 없으므로 올바른 분류로 다운로드했는지 교사가 확인해야 합니다.

현재 이력은 `시작일 ≤ 기준일 < 종료일`로 선택하고 종료일 공란은 유효 이력으로 취급합니다. 동일 번호의 최신 이력을 선택하며, 같은 시작일의 상충 이력·비정상 좌표·필수 열 누락은 오류로 중단합니다. `active`는 이력이 유효하다는 뜻이며 장비 운영이나 관측요소 지원을 보장하지 않습니다. 주소·이전·폐쇄 지점과 갱신 전후 지점 수를 확인하세요.

원본 갱신일은 제공되지 않아 `referenceDate`는 원본이 보장하는 기준일이 아니라 **수집일을 기준으로 이력을 선택한 날짜**입니다. 출처, 분류, 원본 행 수, SHA-256, 변환 규칙을 `sources.json`에 기록합니다. 새 데이터의 지점 수가 기존과 다르면 교사가 변동을 확인하세요.

이번 최초 수집은 공개 다운로드 폼에 `fileType=csv`, `pgmNo=123`, `serviceSe=F00101`, `mddlClssCd=SFC01` 또는 `SFC02`, 빈 `stnIds`를 전송했습니다. 분류 코드는 같은 포털의 분류 트리에서 확인했습니다. 추후 사이트가 바뀌면 웹 화면의 CSV 다운로드를 사용하세요.

이 스크립트는 인증키를 요구하거나 외부 API를 호출하지 않습니다. 결과 JSON과 출처 메타데이터만 커밋하세요. 원본·키·`.env`는 커밋하지 마세요. 학기 시작 전과 새 목록 발표 시 교사가 갱신하면 됩니다.
