# 모아트립 MoaTrip v1.1.0 🇹🇼

아이폰·갤럭시·PC 브라우저에서 사용하는 **대만 여행 동선 계획 웹앱**입니다. 앱스토어 설치 없이 웹사이트로 접속하며, 휴대폰에서 홈 화면에 추가할 수 있습니다.

## 기능

- 1일~30일까지 DAY 1, DAY 2 ... 날짜별 일정, 전체 일정 확인
- 대만 3박 4일 **예시 동선** 제공: 타이베이·스펀·지우펀 등 (실제 여행 날짜/이동 시간은 직접 수정)
- 장소 검색: 한국어·중국어·영어 이름으로 대만 인기 장소 25곳 즉시 검색; 추가 OpenStreetMap Photon 검색
- **Google Places API (New)** 연결 시 구글 장소 검색도 가능 (선택·유료 과금 가능)
- 장소별 시간, 체류 시간, 카테고리, 메모 기록
- 날짜 변경, 드래그/위아래 버튼으로 방문 순서 조정, 삭제
- 지도에 날짜별 색상 표시, 방문 순서별 마커·연결선
- **구글 지도에서 실제 길찾기**: 도보·대중교통·자동차 (Google Maps URL, 별도 키 불필요)
- 여행 공유 링크로 친구와 실시간 공동 편집(SSE), 자동 저장
- JSON 백업/복원, 텍스트 일정표 및 캘린더 내보내기

### 알아두실 점

- 지도에 보이는 점선은 **실제 보행/차량 경로가 아니라 장소를 잇는 방문 순서**입니다. 실제 길과 이동 시간은 `구글 지도 길찾기`를 누르세요.
- 앱 기본 지도는 **OpenStreetMap**입니다. 실제 Google 지도 타일을 앱 안에 표시하려면 Google Maps JavaScript API 키가 필요합니다. `구글 지도 길찾기` 버튼은 키 없이 사용할 수 있습니다.
- OpenStreetMap 기반 무료 검색은 구글 장소 목록과 일치하지 않을 수 있습니다. 대만 인기 장소는 앱에 내장되어 있습니다.
- 장소 5개 이상이면 모바일 구글지도 경유지 제한을 고려해 길찾기를 **여러 구간으로 분할**합니다.
- 공유 링크를 아는 사람은 누구나 해당 여행을 **조회하고 수정할 수 있습니다**. 비공개 링크로 관리하세요. 로그인/권한 구분은 아직 없습니다.
- 공공 Photon 검색 서버는 사용량 제한 또는 장애가 있을 수 있습니다.
- 예시 관광지의 시간은 임의의 **편집용 샘플**이며 영업시간·예약·대중교통 연결을 보장하지 않습니다.

## 1. 윈도우에서 먼저 실행하기

Node.js 20 이상이 설치되어 있다고 가정합니다.

1. ZIP 파일을 풀고, **`server.js`가 보이는 폴더**를 엽니다.
2. 탐색기 주소창에 `cmd`를 입력하여 해당 폴더에서 CMD를 실행합니다.
3. 다음 명령어를 각각 실행합니다.

```cmd
npm run verify
npm start
```

4. PC 브라우저에서 `http://localhost:3000` 을 엽니다.
5. 첫 창에서 `🇹🇼 대만 샘플로 시작` 또는 `여행 만들기`를 누릅니다.

> `localhost`는 실행한 PC에서만 접근할 수 있습니다. 여자친구와 서로 다른 장소에서 이용하려면 아래 배포가 필요합니다.

## 2. GitHub + Render 배포

1. **새 GitHub 저장소**를 만듭니다. 기존 다른 프로젝트 저장소와 섞지 마세요.
2. ZIP을 풀어 나온 `server.js`, `package.json`, `public`, `locations`, `test`, `render.yaml`, `data` 등을 **저장소 최상위 폴더**에 업로드합니다. ZIP 자체를 업로드하면 실행되지 않습니다.
3. Render > New > **Web Service**에서 GitHub 저장소를 연결합니다.
4. Runtime: **Node**, Build Command: `npm install`, Start Command: `npm start`, Health Check Path: `/api/health` 로 설정합니다.
5. 배포된 Render 주소를 열어 샘플 여행을 생성합니다.
6. 상단 `함께 계획하기` 버튼으로 URL을 복사하여 카카오톡으로 보내면 동일한 여행을 함께 수정할 수 있습니다.

**중요: Render의 임시 파일 저장소는 배포·재시작 시 사라질 수 있습니다.** 여행을 오래 보존하고 여러 기기에서 안정적으로 사용하려면 아래 **Turso DB**를 연결하세요. 이를 설정하지 않은 경우 실제 서비스를 위한 영구 저장을 보장하지 않습니다.

## 3. 영구 저장 및 안정적인 공동 편집 (권장)

Render > 해당 Web Service > Environment에서 다음 환경변수를 추가합니다. 값은 본인 Turso 프로젝트에서 발급받습니다.

```env
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-token-here
```

DB 연결 후 서버를 재시작하면 `https://내-앱주소/api/health`의 `storage` 값이 `turso`로 표시됩니다. **토큰이나 비밀번호를 GitHub 소스에 올리지 마세요.** `DATA_DIR`을 따로 지정하면 로컬 JSON 저장 폴더를 바꿀 수 있습니다.

## 4. 선택: 구글 장소 검색·지도 활성화

Google Cloud Console에서 API를 활성화하고 결제 설정을 해야 하며, **사용량에 따른 요금이 발생할 수 있습니다.** 필요하지 않다면 설정하지 않아도 됩니다.

- **구글 장소 검색**: Google Cloud에서 `Places API (New)`를 활성화한 뒤 Render Environment에 `GOOGLE_PLACES_API_KEY`를 추가합니다. 이 키는 서버에서만 사용되며 `/api/config` 응답에 값이 나오지 않습니다.
- **앱 내부 Google 지도 화면**: Google Cloud에서 `Maps JavaScript API`를 활성화한 뒤 Render Environment에 `GOOGLE_MAPS_API_KEY`를 추가합니다. 이는 웹 브라우저로 전달되는 *브라우저용* 키이므로 웹사이트 주소(HTTP 리퍼러) 및 API 제한을 반드시 설정하세요. 개인 기기의 앱 설정에서도 키를 등록할 수 있습니다.
- **Google 지도 실제 길찾기**: API 키 없이도 버튼이 작동합니다.

Google Maps Platform 공식 안내:
- Maps URLs: https://developers.google.com/maps/documentation/urls/quick-reference
- Places API (New): https://developers.google.com/maps/documentation/places/web-service/overview
- Maps JavaScript API: https://developers.google.com/maps/documentation/javascript/get-api-key

## 프로젝트 구조

```text
server.js                 Node.js HTTP 서버 (SSE 실시간 동기화)
package.json              Node.js 실행/테스트 명령
render.yaml               Render 배포 청사진
public/index.html         웹앱 화면
public/style.css          PC/모바일 디자인
public/app.js             일정, 지도, 검색, 공유 UI
public/icon.svg           아이콘
public/manifest.webmanifest
locations/taiwan.json     대만 주요 장소 다국어 검색 목록
data/.gitkeep             개발용 저장 폴더 (데이터 파일은 Git 미포함)
test/server.test.js       자동 테스트
```
