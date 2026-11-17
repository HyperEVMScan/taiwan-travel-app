# 모아트립 (MoaTrip) v1.2.0 🇹🇼

대만 여행의 Day 1~Day 4 일정, 지도, 주변 후보 장소, 카테고리별 핀을 친구와 함께 관리하는 반응형 웹앱입니다. 기존 v1.1.0의 링크 및 여행 데이터 구조와 호환됩니다.

## 이번 버전 주요 기능

- **📸 사진 + 한 줄로 빠르게 추가:** 블로그·맛집·구글지도 캡처를 업로드하고 `셋째날 첫 장소, 아침 8시쯤, 주먹밥 맛집. 근처 총좌빙 참고`처럼 메모를 입력합니다. 사진 인식은 `GEMINI_API_KEY`가 설정된 경우에만 작동합니다.
- AI가 사진의 **핵심 장소명/현지 지명**을 추출하고, 메모에서 날짜·시간·카테고리·첫 방문 여부를 분석합니다. **검색된 지도 장소 목록에서 정확한 장소를 한 번 확인하고** `지도와 일정에 추가하기`를 누르면 저장됩니다. 잘못된 지도 좌표를 자동 등록하지 않습니다.
- **사진 인식 키가 없어도** 장소 이름을 입력하면 동일한 빠른 추가 흐름으로 날짜/시간 메모를 해석하고 장소 검색 후 추가할 수 있습니다.
- **시간순 동선:** 오전 8시/12시/18시 등 방문 시간순으로 자동 삽입합니다. `첫 방문` 표현이 있으면 우선 맨 앞으로 삽입합니다. 방문 시간이 없는 장소는 시간을 지정한 일정 이후에서 **직선거리 증가가 가장 적은 위치**를 선택합니다. 실제 도로 길찾기 최적화는 아닙니다.
- **카테고리 지도 핀:** 🔴 음식점·맛집 / 🔵 소품샵·마트·쇼핑 / 🟡 카페·디저트·간식 / 🟣 관광 / 🟢 숙소 / 회색 교통. 색상은 날짜가 아니라 장소 종류를 나타냅니다.
- **⭐ 근처 후보 장소:** 정식 일정과 별도 카드·테두리 핀으로 표시되며, 구글지도 길찾기 경유지와 동선 연결선에서 제외됩니다. 지도 하단 체크박스로 후보를 숨기거나 표시할 수 있습니다.
- **휴대폰 화면:** 상단에 지도, 하단에 DAY별 일정을 동시에 보는 화면을 기본 제공하고, 전체 지도 보기로 전환할 수 있습니다.
- 기존 친구 공유 URL, 실시간 편집(SSE), JSON/텍스트/ICS 내보내기, 수동 장소 검색과 지도 위치 선택을 유지합니다.

## 실제 입력 예시

블로그 화면을 캡처해서 사진을 고르고 아래와 같이 입력합니다.

> `7/23 셋째날 처음 갈 곳. 아침 8시쯤. 주먹밥 맛집. 근처에 총좌빙 맛집도 있다고 해요.`

자동 분석 내용: **DAY 3, 08:00, 맛집(빨간 핀), 첫 방문 순서**. 총좌빙 참고는 메모에 남깁니다. 날짜가 여행 기간과 일치하지 않는 경우에는 `셋째날`을 우선합니다. 검색된 장소 주소와 지도 위치는 저장 전 확인이 필요합니다.

근처 후보로 저장할 때는 `저장 유형`을 **⭐ 근처 후보**로 바꾸세요. 후보의 날짜·메모는 보관하지만 실제 동선에는 포함되지 않습니다.

## GitHub 저장소 업그레이드 (기존 Render 프로젝트 유지)

기존 저장소: `https://github.com/HyperEVMScan/taiwan-travel-app`

1. 이 ZIP을 **압축 해제**합니다.
2. GitHub의 기존 `taiwan-travel-app` 저장소에서 **Add file → Upload files**를 누릅니다.
3. 압축 해제 폴더 *안의* `server.js`, `package.json`, `public`, `locations`, 새 `lib`, `test`, `README.md` 등 전체를 선택해 업로드합니다. 기존 동일 경로 파일은 이번 버전으로 대체해야 합니다. ZIP 자체는 올리지 마세요.
4. **Commit changes**를 누릅니다.
5. Render의 기존 `taiwan-travel-app` 웹서비스에서 새 배포가 시작되는지 확인하고, 자동 배포가 시작되지 않으면 **Manual Deploy → Deploy latest commit**을 누르세요. 기존 `baseball-live-3leagues`에는 절대 올리지 마세요.
6. 새 기능이 보이지 않으면 휴대폰 브라우저에서 페이지를 새로고침하세요.

설정:
- Language: Node
- Branch: `main`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`
- 기존 Render 웹서비스 이름·주소 유지

## 사진 속 상호명을 자동으로 읽도록 설정 (선택이지만 사진 기능에 필요)

**Google AI Studio에서 새 Gemini API 키**를 발급한 다음, Render의 해당 웹서비스 → **Environment**에서 아래를 추가합니다.

| KEY | VALUE |
| --- | --- |
| `GEMINI_API_KEY` | Google AI Studio에서 발급받은 **본인** API 키 |
| `GEMINI_MODEL` | `gemini-3.6-flash` (선택, 기본값) |

- 키 생성: https://aistudio.google.com/api-keys
- 공식 API 설명: https://ai.google.dev/gemini-api/docs/generate-content/image-understanding
- Google AI의 사용량 제한/요금제에 따라 **비용 또는 호출 제한이 발생할 수 있습니다**. 먼저 본인의 서비스 한도를 확인하세요.
- **키를 채팅, GitHub, 웹페이지 소스 코드, 스크린샷에 올리지 마세요.** Render의 비공개 환경변수에만 입력합니다.
- 업로드한 사진은 브라우저에서 축소한 후 **서버를 거쳐 Google Gemini API로 전송**되며, 모아트립 여행 데이터나 디스크에는 저장하지 않습니다. 분석 요청은 여행 단위/접속 IP별 15분에 최대 25회로 제한됩니다.
- 사진 인식 후 추출된 **장소 이름과 메모만** 저장됩니다. AI가 틀릴 수 있으므로 지도 검색 결과를 반드시 확인해야 합니다.
- **API 키가 없으면 사진 자동 인식은 작동하지 않습니다.** 그 대신 상호명 직접 입력 + 메모 자동 해석 기능을 사용하세요.

## 정확한 장소 검색(선택)

대만 현지 음식점이나 한자 상호명을 자주 검색한다면 `GOOGLE_PLACES_API_KEY` 연결을 권장합니다. 이는 **사진 인식 키와 별개**입니다.

1. Google Cloud에서 Places API (New)를 활성화합니다.
2. Render Environment에 `GOOGLE_PLACES_API_KEY`를 추가합니다.
3. Google Cloud에서 API 키 제한·청구 한도를 관리하세요. Places API (New) 사용량에 따라 비용이 발생할 수 있습니다.

설정하지 않아도 앱 내장 대만 주요 관광지 및 OpenStreetMap 검색은 작동합니다. 다만 **작은 식당, 현지 별칭, 블로그 속 가게는 검색되지 않을 수 있습니다.** 인식된 상호명을 수정해 재검색하거나 지도에서 직접 위치를 찍어 추가할 수 있습니다.

## 영구 저장 (꼭 확인)

기본 저장소는 `data/`의 로컬 JSON입니다. Render 무료 웹서비스에서는 **재배포·재시작 시 이 파일이 유실될 수 있습니다.** 링크 공유와 실시간 편집이 되더라도 영구 보존을 보장하지 않습니다.

장기간 사용할 여행 일정은 Render Environment에 별도 Turso DB 연결을 권장합니다.

```env
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-database-token
```

기존 로컬 JSON 데이터가 **Turso로 자동 이전되지는 않습니다**. 변경 전에 현재 여행을 `여행 내보내기 → JSON 파일`로 백업하고, DB 연결 후 앱 `JSON 여행 가져오기` 기능으로 복원하세요. 복원된 여행은 **새 링크 ID**로 생성되므로 친구에게 새 링크를 공유해야 합니다.

## 개발 및 테스트

Node.js 20 이상. 외부 Node npm 라이브러리 없이 실행됩니다.

```cmd
npm install
npm run verify
npm start
```

URL: `http://localhost:3000` / 상태 확인: `/api/health`

프로젝트 구조:

```text
server.js                  백엔드/지도검색/사진 분석/동시편집
lib/quick-add.js           날짜·시간·카테고리 파싱/동선 자동 삽입
package.json               Node 실행·테스트 설정
public/index.html          웹화면
public/app.js              빠른 추가/일정/지도/공유
public/style.css           PC·모바일 스타일
public/icon.svg            아이콘
public/manifest.webmanifest
locations/taiwan.json      기본 대만 장소 목록
data/.gitkeep              로컬 저장소 (JSON 데이터는 Git에 포함하지 않음)
test/server.test.js        자동 테스트
render.yaml                Render 배포 설정
```

**테스트 범위:** 백엔드 자동 테스트 22개; 브라우저 UI 독립 스모크 테스트에서 수동 장소명+메모→분석 결과→DAY 3 추가 플로우 확인. 실제 Gemini API, Google Places, 외부 타일 CDN, 실제 아이폰/갤럭시 네트워크를 사용한 종단 테스트는 수행하지 않았습니다.
