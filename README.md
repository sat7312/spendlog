# SpendLog

`spendlog.html`을 바탕으로 만든 가계부 웹 앱입니다. React·TypeScript 화면은 `frontend/`, Spring Boot API는 `backend/`에 있습니다. Google 계정으로 로그인하며, 카테고리와 지출 기록은 사용자별로 분리되어 저장됩니다.

## 구조

```
GitHub Pages (frontend/dist)
  └─ Google 로그인 버튼 → Google ID 토큰
        └─ POST /api/auth/google ─→ Spring Boot (backend/)
                                     ├─ Google 공개키로 ID 토큰 검증
                                     ├─ users 테이블에 사용자 저장
                                     └─ 자체 JWT(7일) 발급 → 이후 모든 API에 Bearer로 전달
```

- 인증: Spring Security OAuth2 Resource Server가 서버가 발급한 HS256 JWT를 검증합니다.
- 데이터: 로컬은 H2 파일 DB, 배포 환경은 `SPRING_DATASOURCE_*` 환경변수로 지정한 Postgres를 사용합니다.

## 준비: Google OAuth 클라이언트

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials)에서 **OAuth 클라이언트 ID → 웹 애플리케이션**을 만듭니다.
2. **승인된 JavaScript 원본**에 `http://localhost:5173`과 `https://sat7312.github.io`를 추가합니다.
3. 발급된 클라이언트 ID를 백엔드 `GOOGLE_CLIENT_ID`와 프론트엔드 `VITE_GOOGLE_CLIENT_ID`에 같은 값으로 넣습니다.

## 로컬 실행

JDK 25와 Node.js 20 이상이 필요합니다. 터미널 두 개에서 각각 실행하세요.

```bash
cd backend
GOOGLE_CLIENT_ID=<클라이언트 ID> ./gradlew bootRun
```

```bash
cd frontend
npm install
VITE_GOOGLE_CLIENT_ID=<클라이언트 ID> npm run dev
```

브라우저에서 `http://localhost:5173`을 엽니다. 개발 서버는 `/api` 요청을 `http://localhost:8080`으로 전달합니다. 환경변수 목록은 [`backend/.env.example`](backend/.env.example)과 [`frontend/.env.example`](frontend/.env.example)에 있습니다. `JWT_SECRET`을 비워 두면 실행할 때마다 임의 키를 쓰므로 재시작 시 다시 로그인해야 합니다.

## 배포

### 백엔드

[`backend/Dockerfile`](backend/Dockerfile)로 이미지를 만들어 Cloud Run, Render, Fly.io 등 Docker를 실행하는 곳에 올립니다. 서버는 `PORT` 환경변수를 따릅니다. 다음 환경변수를 설정하세요.

| 변수 | 값 |
| --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth 클라이언트 ID |
| `JWT_SECRET` | 32바이트 이상 임의 문자열 (`openssl rand -base64 48`) |
| `CORS_ALLOWED_ORIGINS` | `https://sat7312.github.io` |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://<host>:5432/<db>?sslmode=require` |
| `SPRING_DATASOURCE_USERNAME` / `SPRING_DATASOURCE_PASSWORD` | DB 계정 |

Postgres는 Neon, Supabase 등의 무료 플랜을 쓸 수 있습니다. 서비스가 `postgres://...` 형식 주소를 주면 `jdbc:postgresql://` 형식으로 바꾸고 계정 정보는 별도 변수로 넣습니다.

### 프론트엔드 (GitHub Pages)

1. 저장소 **Settings → Pages → Source**를 **GitHub Actions**로 바꿉니다.
2. **Settings → Secrets and variables → Actions → Variables**에 `API_BASE_URL`(백엔드 주소, 예: `https://spendlog-api.example.com`)과 `GOOGLE_CLIENT_ID`를 추가합니다.
3. `main`에 `frontend/` 변경을 푸시하면 [`deploy-frontend.yml`](.github/workflows/deploy-frontend.yml)이 빌드해 `https://sat7312.github.io/spendlog/`에 배포합니다.

## 데이터와 기능

- Google 로그인, 사용자별 데이터 분리, 로그아웃
- 카테고리 추가·삭제, 기록 추가·수정·삭제
- 월별 지출 차트, 총 지출·이번 달·최근 6개월 월평균, 월별 기록 펼치기
- 라이트·다크 테마, JSON 백업·복원

처음에는 빈 가계부가 표시됩니다. 예시 데이터를 확인하려면 로그인 후 **데이터 복원**에서 [`frontend/public/sample-data.json`](frontend/public/sample-data.json)을 선택하세요. 복원은 내 데이터만 교체하며, 카테고리와 기록 ID는 서버에서 새로 발급합니다.

프론트엔드 빌드는 `cd frontend && npm run build`, 백엔드 테스트는 `cd backend && ./gradlew test`로 확인할 수 있습니다.
