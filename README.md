# SpendLog

`spendlog.html`을 바탕으로 만든 가계부 웹 앱입니다. React·TypeScript 화면은 `frontend/`, Spring Boot API는 `backend/spendlog/`에 있습니다. 카테고리와 지출 기록은 H2 파일 DB에 저장됩니다.

## 실행

JDK 25와 Node.js 20 이상이 필요합니다. 터미널 두 개에서 각각 실행하세요.

```bash
cd backend/spendlog
./gradlew bootRun
```

```bash
cd frontend
npm install
npm run dev
```

브라우저에서 `http://localhost:5173`을 엽니다. 개발 서버는 `/api` 요청을 `http://localhost:8080`으로 전달합니다. 백엔드 데이터 파일 `backend/spendlog/spendlog-data.mv.db`는 Git에서 제외됩니다.

## 데이터와 기능

- 카테고리 추가·삭제, 기록 추가·수정·삭제
- 월별 지출 차트, 총 지출·이번 달·최근 6개월 월평균, 월별 기록 펼치기
- 라이트·다크 테마, JSON 백업·복원

처음에는 빈 가계부가 표시됩니다. 원본 HTML의 예시 데이터를 확인하려면 화면의 **데이터 복원**에서 [`frontend/public/sample-data.json`](frontend/public/sample-data.json)을 선택하세요. 복원은 현재 서버 데이터를 교체하므로 화면에서 확인을 받습니다. 기존 HTML에서 만든 백업 JSON도 같은 형식으로 복원할 수 있습니다.

프론트엔드 빌드는 `cd frontend && npm run build`, 백엔드 테스트는 `cd backend/spendlog && ./gradlew test`로 확인할 수 있습니다.
