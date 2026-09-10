# ONUL FIT

오늘의 날씨와 내 취향·옷장을 함께 반영해 외출 준비를 도와주는 웹서비스입니다.

## 실행

```bash
pnpm install
pnpm dev
```

## API 연결

날씨는 서버 라우트 `/api/weather/`를 통해 기상청 단기예보 조회서비스와 연결됩니다. 브라우저가 외부 API를 직접 호출하지 않도록 서버에서 데이터를 표준화합니다.

옷차림 추천은 `/api/recommend/`에서 처리합니다. `AGENTRIA_API_URL`을 설정하면 에이전트리아에 배포한 오늘핏 어빌리티 API로 요청을 전달합니다. URL이 비어 있거나 일부 AI 조합이 실패하면 동일한 입력 구조를 사용하는 로컬 규칙 기반 추천이 동작합니다.

## 기상청 API 설정

1. [기상청 단기예보 조회서비스](https://www.data.go.kr/data/15084084/openapi.do), 생활기상지수 조회서비스 V5, [기상특보 조회서비스](https://www.data.go.kr/data/15000415/openapi.do)에서 각각 활용신청을 합니다.
2. 발급된 일반 인증키(Decoding)를 프로젝트 루트의 `.env.local`에 입력합니다.

```env
KMA_FORECAST_SERVICE_KEY=단기예보_인증키
KMA_UV_SERVICE_KEY=생활기상지수_인증키
KMA_WARNING_SERVICE_KEY=기상특보_인증키
```

3. 개발 서버를 재시작합니다. 주요 도시명 또는 브라우저 위치 권한을 허용하면 기상청 격자 좌표로 예보를 조회합니다.

`.env.local`과 인증키는 Git에 커밋하지 마세요. 현재 `/api/weather/`는 단기예보에서 기온·습도·강수량·강수확률·풍속·하늘상태·강수형태를 읽고, 생활기상지수 API에서 자외선 지수를, 기상특보 API에서 공식 특보를 읽습니다. 부가 API가 일시적으로 실패해도 기본 날씨 응답은 유지됩니다.

```bash
cp .env.example .env.local
```

`.env.local`에 에이전트리아 API 주소와 인증값을 입력한 뒤 다시 실행하세요. 인증키는 서버 라우트에서만 사용되며 브라우저 코드에 포함되지 않습니다.

브라우저가 추천 API에 전달하는 입력은 아래 구조를 사용합니다.

```json
{
  "weather": { "current": {}, "daily": {}, "hourly": [] },
  "profile": { "gender": "female", "style": "미니멀", "activity": "출근", "sensitivity": "보통" },
  "wardrobe": [{ "id": "item-1", "name": "네이비 재킷", "category": "아우터", "selected": true }],
  "refreshToken": 0
}
```

서버는 이 값을 에이전트리아 Ability Input의 `location`, `gender`, `style`, `activity`, `sensitivity`, `refreshToken`, `weatherText`, `wardrobeText`로 변환합니다. `weatherText`의 풍속 단위는 실제 값과 동일한 `m/s`로 전달합니다.

## Agentria 추천 흐름

1. 사용자 취향 세 요소로 균형 추천·날씨 우선·스타일 우선 조합을 만듭니다.
2. 날씨 정보를 표준화하고 위험 요소와 준비물을 계산합니다.
3. 세 조합을 세마포어 3으로 제한해 코디 추천 LLM Function을 병렬 호출합니다.
4. LLM 결과의 의류 ID를 실제 `wardrobeText`와 대조해 검증합니다.
5. 최종 응답의 `recommendations` 배열에 최대 세 개의 추천을 담습니다.

웹 서버는 `finalResponse.recommendations`를 화면용 배열로 변환합니다. 일부 LLM 호출만 실패하면 실패한 조합만 로컬 추천으로 대체하고, 전체 어빌리티가 실패해도 세 개의 규칙 기반 추천을 반환합니다.

## 주요 기능

- 지역 검색 및 현재 위치 기반 날씨 조회
- 현재 날씨·시간대별 기온·강수확률·자외선 안내
- 날씨별 준비물과 주의사항 추천
- 여성/남성 선택, 스타일·외출 목적·추위 민감도 설정
- 내 옷장 등록 및 추천에 사용할 의류 선택
- 에이전트리아 추천 API 연결 및 로컬 fallback
- 타임아웃·재시도·동시 요청 제한을 포함한 외부 호출 처리
- WebMCP 지원 브라우저에서 `refresh_today_fit` 도구 제공
