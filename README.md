# 관측지점 탐색기

자연재해 탐구에 필요한 실제 관측소의 위치·지점번호와 초단기실황 격자 좌표를 찾는 한국어 정적 웹앱입니다.

**사이트:** https://gud1396-coder.github.io/weather-station-explorer/

## 기능

- 폭염(기온·습도), 호우(강수량), 강풍(풍속·풍향) 자료 선택. 매핑은 `data/disaster-mapping.json`에서 수정합니다.
- ASOS/AWS별 검색·지역 필터·지도와 목록 선택 연동, 지점번호·위경도 복사 및 JSON 내려받기.
- 지도 클릭/좌표 입력으로 기상청 5 km 격자 `nx`, `ny` 변환. 실제 관측소 핀과 분리합니다.
- 명세가 확인된 ASOS 시간자료, AWS 매분자료, 초단기실황의 요청변수와 Python requests 코드 복사.
- 태풍과 지진은 별도의 현상 정보 화면에서 공식 정보로 안내합니다. 지진 사전 예측 기능이 아닙니다.
- 지도 없이 목록으로 모든 지점 선택 가능, 모바일 세로 배치, 키보드 접근성, 로딩·0건·JSON/네트워크 오류 안내.

## 데이터와 한계

2026-10-22에 기상청 국가기후데이터센터의 [관측지점정보](https://data.kma.go.kr/tmeta/stn/selectStnList.do?pgmNo=123)에서 관측망별 전국 CSV를 다운로드했습니다. **ASOS 97개, AWS 606개**의 해당 날짜 유효 이력을 포함합니다. 예시 데이터가 아닙니다. 원본에 별도 기준일이 없어 수집일을 이력 선택 기준으로 사용했습니다.

원본 148개 ASOS 이력 중 종료·미래 이력 51개, AWS 2,619개 중 2,013개를 제외했습니다. 운영 중인 장비·관측 요소·API별 제공 지점 수와 같다고 보장하지 않습니다. 서비스 이용 전 지점과 관측 요소를 다시 확인하세요. 상세 출처·분류·갱신일·변환·원본 SHA-256은 `data/sources.json`과 사이트 하단에 있습니다.

이 앱은 **관측값을 표시하거나 기상 API를 호출하지 않습니다.** 지점 메타데이터는 같은 저장소의 정적 JSON에서만 읽습니다. 교사·학생 인증키 입력란도 없습니다. 배경 지도는 OpenStreetMap 공개 타일을 사용하므로 인터넷이 필요하며 타일 실패 시에도 목록 탐색은 작동합니다. Leaflet 1.9.4는 `vendor/`에 포함해 CDN에 의존하지 않습니다. 관측소는 canvas로 표시하며, 긴 목록은 50개씩 추가 표시합니다.

가장 가까운 지점이 항상 대표성이 높은 것은 아닙니다. 고도·주변 환경을 고려하고, 실제 재난 대응에는 공식 예보·경보를 확인하세요.

## API 코드 사용

서비스별 엔드포인트·변수 정의는 `data/services.json`에 별도로 관리합니다. 현재 공식 문서와 대조한 날짜는 2026-10-22입니다.

| 서비스 | 위치 변수 | 시각 변수 | 인증 환경변수 |
|---|---|---|---|
| [API허브 지상 시간자료](https://apihub.kma.go.kr/apiList.do) | `stn` | `tm`, KST 정시 | `KMA_API_KEY` |
| [API허브 AWS 매분자료](https://apihub.kma.go.kr/apiList.do?seqApi=2&seqApiSub=239) | `stn` | `tm2`, KST 분 | `KMA_API_KEY` |
| [공공데이터포털 초단기실황](https://www.data.go.kr/data/15084084/openapi.do) | `nx`, `ny` | `base_date`, `base_time` | `DATA_GO_KR_KEY` |

**본인 명의의 API 활용승인·인증키는 별도 프로그램에서 관측값을 실제 조회할 때 필요합니다.** 사이트 배포·지점 탐색에는 필요 없습니다. 코드의 `YOUR_API_KEY`는 환경변수로 대체하고 키를 저장소에 커밋하지 마세요. 공공데이터포털은 일반(Decoding) 인증키를 사용합니다. 생성 코드는 Python 3.9+와 `requests`, `tzdata`가 필요합니다.

코드는 HTTP 오류·빈 결과·API 오류를 확인하며 Asia/Seoul 시각을 사용합니다. 인증키를 사용한 실제 응답 검증은 수행하지 않았습니다. 제공 지연·결측·서비스별 과거 자료 제한에 따라 조회 시각을 조정하세요. 응답 결측 코드와 시간 누적 구간은 공식 명세를 확인하세요. 다른 서비스의 `stnId` 등을 여기의 `stn`과 혼용하지 마세요. 확인할 수 없는 서비스는 코드 생성을 비활성화합니다.

## 로컬 실행 및 검증

번들러·설치 과정 없이 실행할 수 있습니다. `file://`로 직접 열면 브라우저의 JSON 로딩 제한이 있으므로 HTTP 서버로 여세요.

```sh
python -m http.server 8000
```

브라우저에서 `http://localhost:8000`을 엽니다.

```sh
node --test tests/*.test.js
python -m unittest discover -s tests -p "test_*.py"
```

격자 검증은 [기상청 동네예보 격자영역 정보(2024-03-05)](https://apihub.kma.go.kr/getAttachFile.do?fileName=%2820240305%29%EB%8F%99%EB%84%A4%EC%98%88%EB%B3%B4+%EA%B2%A9%EC%9E%90%EC%98%81%EC%97%AD+%EC%A0%95%EB%B3%B4.pdf)의 기준점 (38°N,126°E)→(43,136)과 네 모서리 좌표, 주요 도시 회귀 사례, 영역 밖 입력을 확인합니다. 지점 검증은 스키마·좌표·이력·중복·검색·서비스별 변수 분리를 확인합니다.

브라우저 QA의 실제 수행 결과는 `VALIDATION.md`에 기록합니다. 실제 크롬북 하드웨어 테스트는 별도 필요합니다.

## GitHub Pages 배포

저장소 **Settings → Pages → Build and deployment**에서 `Deploy from a branch`, `main`, `/(root)`를 저장합니다. 루트 `index.html`이 배포되며, `.nojekyll`로 정적 파일을 그대로 사용합니다. 이후 `main`에 JSON/HTML/JS/CSS를 커밋하면 재배포됩니다. 최초 설정에는 저장소 관리자 권한이 필요합니다.

키 없이 정적 배포되므로 별도 서버·빌드 환경·GitHub Secrets 설정은 필요 없습니다. 저장소의 모든 파일과 이력은 공개되므로 인증키는 처음부터 넣지 마세요.

## 교사 데이터 갱신

[scripts/README.md](scripts/README.md)의 CSV 수집·정규화·검증 절차를 따르세요. `data/asos.json`, `data/aws.json`, `data/sources.json`을 교체해 커밋하면 됩니다. 수집 과정과 탐색 과정을 분리했습니다.

## 파일 구성

`index.html` / `css/style.css` / `js/app.js` / `js/stations.js` / `js/grid-converter.js` / `js/code-generator.js` / `data/` / `scripts/` / `tests/` / `vendor/`

개발 요구사항 원문은 `CODEX_TASKS.md`입니다. 이번 작업은 새 저장소에서 시작했으며 재사용할 기존 앱 코드는 없었습니다.

## 외부 자료

기상청 지점정보 출처와 갱신일은 `data/sources.json` 참조. Leaflet은 BSD-2-Clause이며 원문은 `vendor/LICENSE-Leaflet`에 있습니다. OpenStreetMap 지도 데이터는 ODbL이며 지도에 저작자 표시를 유지합니다. 타일 이용은 [공식 타일 이용 정책](https://operations.osmfoundation.org/policies/tiles/)에 따릅니다.
