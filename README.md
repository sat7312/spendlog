# SpendLog

`spendlog.html`을 바탕으로 만든 가계부 웹 앱입니다. React·TypeScript 화면은 `frontend/`, Spring Boot API는 `backend/`에 있습니다. 내 컴퓨터에서 백엔드와 프론트엔드를 함께 실행해 브라우저로 쓰는 혼자용 앱이며, 로그인 없이 바로 사용합니다.

## 구조

```
브라우저 (http://localhost:5173)
  └─ Vite 개발 서버 (frontend/) ── /api 요청 전달 ─→ Spring Boot (backend/, 127.0.0.1:8080)
                                                        └─ H2 파일 DB (backend/spendlog-data.mv.db)
```

- 백엔드는 이 컴퓨터(127.0.0.1)에서만 접속을 받습니다.
- 데이터는 백엔드를 실행한 폴더의 `spendlog-data.mv.db` 파일에 저장됩니다. 반드시 `backend/` 폴더에서 실행하세요. 다른 폴더에서 실행하면 그 폴더에 빈 DB 파일이 새로 생깁니다.

## 로컬 실행

JDK 25와 Node.js 20 이상이 필요합니다. 터미널 두 개에서 각각 실행하세요.

```bash
cd backend
./gradlew bootRun
```

```bash
cd frontend
npm install
npm run dev
```

브라우저에서 `http://localhost:5173`을 엽니다. 개발 서버는 `/api` 요청을 `http://localhost:8080`으로 전달합니다.

예전에 배포용으로 설정한 `SPRING_DATASOURCE_URL`/`USERNAME`/`PASSWORD` 환경변수가 셸이나 IDE에 남아 있으면 Spring이 그 값을 우선 사용합니다. 로컬 H2를 쓰려면 이 변수들을 해제한 뒤 실행하세요.

## 데이터와 기능

- 카테고리 추가·수정·삭제, 기록 추가·수정·삭제
- 월별 지출 차트, 총 지출·이번 달·최근 6개월 월평균, 월별 기록 펼치기
- 라이트·다크 테마, JSON 백업·복원

처음에는 빈 가계부가 표시됩니다. 예시 데이터를 확인하려면 **데이터 복원**에서 [`frontend/public/sample-data.json`](frontend/public/sample-data.json)을 선택하세요. 복원은 저장된 데이터 전체를 백업 파일 내용으로 교체하며, 카테고리와 기록 ID는 서버에서 새로 발급합니다.

로그인 기능이 있던 시절에 만든 DB 파일도 그대로 열 수 있습니다. 그때의 `users` 테이블과 `owner_id` 컬럼은 지우지 않고 남겨 두며, 모든 카테고리와 기록이 하나의 가계부로 보입니다. 그 시절 서로 다른 계정에 같은 이름의 카테고리가 있었다면 그대로 보이지만, 백업 파일을 복원할 때는 이름 중복으로 거부되니 먼저 이름을 바꿔 주세요.

## 오류 상황에서의 동작

- 브라우저 저장소(localStorage)를 쓸 수 없으면 테마를 현재 탭에서만 기억합니다. 이 경우 새로고침하면 테마가 라이트로 돌아갑니다.
- 저장·삭제·복원은 완료되었는데 목록을 새로 불러오지 못하면, 변경이 반영되었다는 안내와 **다시 불러오기** 버튼을 보여 줍니다. 다시 불러오기는 조회만 다시 보내며, 목록을 불러올 때까지 다른 변경은 막습니다.

## 테스트

```bash
cd backend && ./gradlew test
```

```bash
cd frontend
npm ci
npm test -- --run
npm run build
```

프론트엔드 테스트는 Vitest와 React Testing Library를 jsdom 환경에서 실행합니다. `npm test`만 실행하면 감시 모드로 동작합니다.
