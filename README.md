# ONUL FIT

오늘의 날씨와 내 취향·옷장을 함께 반영해 외출 준비를 도와주는 웹서비스입니다.

## 실행

```bash
pnpm install
pnpm dev
```

## API 연결

날씨는 서버 라우트 `/api/weather/`를 통해 Open-Meteo의 지역 검색·예보 API와 연결됩니다. 브라우저가 외부 API를 직접 호출하지 않도록 서버에서 데이터를 표준화합니다.

옷차림 추천은 `/api/recommend/`에서 처리합니다. `AGENTRIA_API_URL`을 설정하면 에이전트리아에 배포한 `today_fit_agent` API로 요청을 전달합니다. URL이 비어 있으면 개발 확인을 위해 동일한 입력 구조를 사용하는 로컬 규칙 기반 추천이 동작합니다.

```bash
cp .env.example .env.local
```

`.env.local`에 에이전트리아 API 주소와 인증값을 입력한 뒤 다시 실행하세요. 인증키는 서버 라우트에서만 사용되며 브라우저 코드에 포함되지 않습니다.

추천 API는 아래 입력 구조를 사용합니다.

```json
{
  "weather": { "current": {}, "daily": {}, "hourly": [] },
  "profile": { "gender": "female", "style": "미니멀", "activity": "출근", "sensitivity": "보통" },
  "wardrobe": [{ "id": "item-1", "name": "네이비 재킷", "category": "아우터", "selected": true }]
}
```

에이전트리아의 응답은 `data` 또는 `result` 안에 `headline`, `description`, `notice`, `matchScore`, `tags`, `essentials`, `outfitItems`를 반환하면 화면에 바로 반영됩니다.

## 주요 기능

- 지역 검색 및 현재 위치 기반 날씨 조회
- 현재 날씨·시간대별 기온·강수확률·자외선 안내
- 날씨별 준비물과 주의사항 추천
- 여성/남성 선택, 스타일·외출 목적·추위 민감도 설정
- 내 옷장 등록 및 추천에 사용할 의류 선택
- 에이전트리아 추천 API 연결 및 로컬 fallback
- 타임아웃·재시도·동시 요청 제한을 포함한 외부 호출 처리
- WebMCP 지원 브라우저에서 `refresh_today_fit` 도구 제공
