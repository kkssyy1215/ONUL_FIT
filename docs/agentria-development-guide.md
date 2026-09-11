# 오늘핏 Agentria 전용 개발 지침서

> 버전: 1.0  
> 적용 범위: 오늘핏 옷장 API, Main API, Python 노드, LLM 노드, 데이터 스토리지 Function  
> 핵심 목표: **고정된 타입 계약, JSON 1회 파싱, 비동기 호출, snake_case, 긴 선언부와 짧은 실행부**

---

## 1. 지침서의 목적

이 문서는 Agentria에서 오늘핏 어빌리티를 개발할 때 노드별 입출력 형식과 Python 코드 작성 방식을 하나로 통일하기 위한 기준이다.

다음 문제를 반복하지 않는 것이 주요 목적이다.

- LLM 결과를 JSON 문자열로 바꾸고, 다음 노드에서 다시 파싱하는 중복 처리
- 출력 타입이 정해져 있는데도 `dict`, `list`, `str`을 반복 추측하는 코드
- `camelCase`와 `snake_case`가 섞여 노드 연결이 깨지는 문제
- `for`, `while` 반복문에 `await`가 없어 Agentria 검증에서 실패하는 문제
- DB의 `record_items`에 `None` 또는 단일 객체를 보내는 문제
- 필수 출력 변수가 특정 분기에서 누락되는 문제
- 실행 로직이 한 파일에 길게 펼쳐져 수정 위치를 찾기 어려운 문제

---

## 2. 절대 규칙

### 2.1 `import` 구문을 작성하지 않는다

Agentria Python 노드에서 제공되는 `json`, `re`, `uuid`, `asyncio`, Pydantic 관련 기능은 별도 `import` 없이 사용한다.

```python
# 금지
import json
import asyncio
from pydantic import BaseModel, Field
```

```python
# 권장
data = json.loads(text)
await asyncio.sleep(0)

class clothing_analysis_model(BaseModel):
    name: str
```

### 2.2 모든 사용자 정의 이름은 `snake_case`를 사용한다

변수, 함수, JSON 키, 노드 출력 변수, LLM 출력 키를 모두 `snake_case`로 통일한다. 클래스명도 Agentria 노드 코드 내에서는 예외 없이 `snake_case`를 사용한다.

| 사용하지 않음 | 표준 이름 |
|---|---|
| `preferenceCombinations` | `preference_combinations` |
| `combinationId` | `combination_id` |
| `strategyLabel` | `strategy_label` |
| `wardrobeItems` | `wardrobe_items` |
| `wardrobeCount` | `wardrobe_count` |
| `styleTags` | `style_tags` |
| `warmthLevel` | `warmth_level` |
| `activityTags` | `activity_tags` |
| `rawRecommendations` | `raw_recommendations` |
| `refreshToken` | `refresh_token` |

프론트엔드가 기존 `camelCase`를 사용해야 하면 **웹 API 어댑터의 최종 경계에서만** 변환한다. Agentria 내부 코드와 노드 사이에서는 변환하지 않는다.

### 2.3 Function, LLM, DB 호출은 항상 `await`한다

```python
llm_result = await clothing_analysis_llm(
    analysis_input=analysis_input
)

db_result = await db_add(
    record_items=records
)

db_result = await db_list()
```

- Agentria 왼쪽 Function 목록에서 연결한 함수는 반드시 `await`한다.
- 일반 문자열 정리, 숫자 변환, JSON 파싱 함수는 동기 함수로 유지한다.
- 동기 함수에 `await`를 붙이지 않는다.

### 2.4 모든 `for`, `while` 반복문 내부에는 `await`가 있어야 한다

반복문안에서 실제 비동기 함수를 호출하면 그 호출을 `await`한다. 비동기 호출이 없는 CPU 처리 반복문은 `await asyncio.sleep(0)`로 제어권을 양보한다.

```python
async def normalize_items(items):
    normalized_items = []

    for item in items:
        await asyncio.sleep(0)
        normalized_items.append(
            normalize_item(item)
        )

    return normalized_items
```

```python
async def analyze_items(items):
    tasks = []

    for item in items[:5]:
        await asyncio.sleep(0)
        task = asyncio.create_task(
            analyze_item(item)
        )
        tasks.append(task)

    return await asyncio.gather(*tasks)
```

- 새 코드에서 반복 식을 숨기는 list/dict comprehension 남용을 피한다.
- 반복 처리는 가능하면 `async def` 함수 안으로 옮긴다.
- 반복문 내부에서 `await` 없이 계속 도는 코드는 작성하지 않는다.

### 2.5 노드에 설정된 출력 타입을 코드의 계약으로 간주한다

Agentria 노드의 출력 변수 타입이 정해져 있다면, 다음 노드는 그 타입을 다시 추측하지 않는다.

- LLM 출력 `data`: `String`
- DB 쓰기 출력 `saved_records`: `Array`
- DB 읽기 출력 `data_records`: `Array`
- DB 읽기 출력 `data_structure_items`: `Array`

```python
# 금지: 이미 출력 계약이 있는데 경우의 수를 추측함
if isinstance(db_result, dict):
    saved_records = db_result.get("saved_records")
elif isinstance(db_result, list):
    saved_records = db_result
else:
    saved_records = []
```

```python
# 권장: 고정된 출력 계약 사용
db_result = await db_add(
    record_items=records
)
saved_records = db_result["saved_records"]
```

### 2.6 Function 연결 코드를 직접 입력하지 않는다

`{%new_node@575827%}`같은 노드 ID를 추측해 직접 작성하지 않는다. Agentria 편집기 왼쪽의 Function을 Python 코드 영역으로 끌어와 생성된 함수명을 사용한다.

### 2.7 필수 출력 변수는 모든 정상 반환 분기에서 제공한다

노드의 출력에 `saved_records`, `db_ok`, `errors`를 등록했다면 성공, 빈 결과, 중복, 검증 실패의 모든 정상 반환에 세 키가 존재해야 한다.

```python
return {
    "saved_records": saved_records,
    "db_ok": len(saved_records) > 0,
    "errors": errors,
}
```

Array 출력에 `None`을 반환하지 않는다. 결과가 없으면 `[]`를 반환한다.

---

## 3. 표준 노드 코드 구조

Python 노드는 다음 순서로 작성한다.

1. 입력 변수 연결
2. 상수와 허용값 선언
3. 검증 모델 선언
4. 순수 변환 함수 선언
5. 비동기 업무 함수 선언
6. 짧은 실행부
7. 고정된 출력 반환

실행부에서 필드를 하나씩 조립하지 않는다. 실행부는 업무 흐름만 보이도록 10~20줄 정도로 유지한다.

```python
# 1. 입력
items_input = {{items@node_output}}

# 2. 상수
max_item_count = 5

# 3. 검증 모델
class wardrobe_input_model(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    category: str

# 4. 순수 함수
def validate_inputs(items):
    return items[:max_item_count]

# 5. 비동기 함수
async def analyze_items(items):
    tasks = []

    for item in items:
        await asyncio.sleep(0)
        tasks.append(
            asyncio.create_task(
                analyze_item(item)
            )
        )

    return await asyncio.gather(*tasks)

# 6. 실행부
input_items = validate_inputs(items_input)
analysis_models = await analyze_items(input_items)
existing_records = await load_wardrobe_records()
records = await build_new_records(
    analysis_models,
    existing_records
)
saved_records = await save_wardrobe_records(records)

# 7. 출력
return {
    "saved_records": saved_records,
    "saved_count": len(saved_records),
    "db_ok": len(saved_records) > 0,
}
```

---

## 4. 입출력 타입 계약

### 4.0 Agentria에서 선택 가능한 타입

Agentria의 입력/출력 변수는 아래 타입만 사용한다.

| Agentria 타입 | Python에서 받는 값 | 오늘핏 사용 예시 |
|---|---|---|
| `Any` | 타입이 정해지지 않은 값 | 가능하면 사용하지 않음 |
| `String` | Python `str` | LLM JSON 문자열, 이름, 카테고리 |
| `Integer` | Python `int` | 보온도, 건수, 시도 횟수 |
| `Float` | Python `float` | 온도, 습도, 강수량, 바람 |
| `Boolean` | Python `bool` | 방수 여부, 성공 여부 |
| `Object` | Python `dict` | 하나의 결과 객체 |
| `File` | Agentria 파일 객체 | 파일 한 개 |
| `Array` | Python `list` | 옷장 목록, 복수 의류, 복수 결과 |
| `Datetime` | Agentria 날짜/시간 값 | 날짜, 시간 |
| `Filearray` | Agentria 파일 Array | 여러 파일 |

Agentria에는 별도의 `JSON` 또는 `Number` 타입이 없다. 따라서 다음과 같이 적용한다.

- JSON 객체를 타입으로 전달: `Object`
- JSON 배열을 타입으로 전달: `Array`
- 숫자 필드가 정수: `Integer`
- 숫자 필드가 소수: `Float`

#### 타입별 반환 계약

```python
# String 출력에는 문자열만 반환
return {
    "raw": raw_text,
}

# Object 출력에는 dict 반환
return {
    "saved": saved_item,
}

# Array 출력에는 list 반환
return {
    "saved_records": saved_records,
}

# Integer 출력에는 int 반환
return {
    "saved_count": len(saved_records),
}

# Boolean 출력에는 bool 반환
return {
    "db_ok": True,
}
```

String 입력에 JSON을 넘길 때는 경계에서만 `json.dumps`를 사용한다. String을 다음 노드에서 Object로 사용할 때는 백틱을 제거한 후 `json.loads`를 한 번만 사용한다.

```python
# LLM data 입력이 String인 경우
llm_input = json.dumps(
    payload,
    ensure_ascii=False
)

# LLM output이 String인 경우
item = json.loads(
    clean_json_text(raw_text)
)
```

`String` 출력 변수에 Python `dict`를 반환하지 않는다. 반대로 `Object` 출력 변수에 JSON 문자열을 반환하지도 않는다.

#### 오늘핏 옷장 계약

| 변수 | Agentria 타입 |
|---|---|
| `items` | `Array` |
| `analysis_results` | `Array` |
| `raw` | `String` |
| `saved` | `Object` |
| `saved_records` | `Array` |
| `data_records` | `Array` |
| `data_structure_items` | `Array` |
| `warmth_level` | `Integer` |
| `waterproof` | `Boolean` |

`items` Array의 각 항목과 `analysis_results` Array의 각 항목은 Object 형식의 레코드로 사용한다. DB Function의 `record_items`, `data_records`, `data_structure_items`, `saved_records` 모두 `Array`로 고정한다.

### 4.1 옷장 API 입력

조회와 추가를 하나의 API로 사용하더라도 작업을 명시적으로 구분한다.

```json
{
  "action": "add",
  "items": [
    {
      "name": "검정색 두꺼운 방수 바람막이",
      "category": "아우터"
    }
  ]
}
```

```json
{
  "action": "list",
  "items": []
}
```

규칙:

- `items`는 항상 Array이다.
- 한 번에 최대 5개까지 받는다.
- 각 항목은 `name`, `category`를 갖는 JSON 객체이다.
- `category`는 `상의`, `하의`, `아우터`, `신발`, `액세서리` 중 하나다.
- 화면에서 하나만 추가해도 `items` Array안에 넣어 보낸다.

### 4.2 의류 분석 LLM 출력

LLM 노드의 출력 변수명은 `data`, 타입은 `String`으로 고정한다. `data` 문자열의 내용은 다음 JSON 스키마를 정확히 따른다.

```json
{
  "name": "두꺼운 방수 바람막이",
  "category": "아우터",
  "color": "#202226",
  "style": ["캐주얼", "스포티"],
  "warmth_level": 4,
  "activity": ["일상", "운동"],
  "waterproof": true
}
```

### 4.3 오늘핏 옷장 DB 표준 스키마

| 컬럼 | DB 타입 | 의미 |
|---|---|---|
| `id` | String | 의류 고유 식별자 |
| `name` | String | 정규화된 의류명 |
| `category` | String | 5개 표준 카테고리 |
| `color` | String | `#RRGGBB` |
| `style` | String | JSON Array를 저장한 문자열 |
| `warmth_level` | Integer | 1~5 |
| `activity` | String | JSON Array를 저장한 문자열 |
| `waterproof` | Boolean | 방수 여부 |

`style`, `activity`를 DB에서 Array 타입으로 변경할 수 있다면 Array를 권장한다. 현재처럼 String 컬럼을 사용하면 **JSON Array 문자열**로만 저장한다.

```python
def build_storage_record(item_model, item_id):
    return {
        "id": item_id,
        "name": item_model.name,
        "category": item_model.category,
        "color": item_model.color.upper(),
        "style": json.dumps(
            item_model.style,
            ensure_ascii=False
        ),
        "warmth_level": item_model.warmth_level,
        "activity": json.dumps(
            item_model.activity,
            ensure_ascii=False
        ),
        "waterproof": item_model.waterproof,
    }
```

DB 저장 직전이 **직렬화의 유일한 위치**이다. DB에서 읽은 직후가 **역직렬화의 유일한 위치**이다.

### 4.4 DB Function 계약

#### DB 쓰기

- 입력: `record_items` / Array
- 출력: `saved_records` / Array

```python
db_result = await db_add(
    record_items=records
)
saved_records = db_result["saved_records"]
```

`record_items`는 반드시 행 객체의 Array여야 한다.

```python
# 올바름
records = [record]
await db_add(record_items=records)
```

```python
# 잘못됨
await db_add(record_items=None)
await db_add(record_items=record)
await db_add(record_items={"items": records})
```

#### DB 읽기

- 출력: `data_records` / Array
- 출력: `data_structure_items` / Array

```python
db_result = await db_list()
data_records = db_result["data_records"]
data_structure_items = db_result[
    "data_structure_items"
]
```

`data_records`가 Array로 설정되어 있다면 `startswith`, `json.loads`, `isinstance(..., str)`를 적용하지 않는다. `list object has no attribute startswith`는 Array에 문자열 함수를 적용했을 때 발생한다.

### 4.5 옷장 API 출력

```json
{
  "success": true,
  "message": "옷장 목록을 불러왔습니다.",
  "saved_records": [],
  "wardrobe_items": [
    {
      "id": "03",
      "name": "얇은 면 반팔 티셔츠",
      "category": "상의",
      "color": "#F5F3ED",
      "style_tags": ["미니멀", "캐주얼"],
      "warmth_level": 1,
      "activity_tags": ["일상", "등교"],
      "waterproof": false,
      "selected": true
    }
  ],
  "wardrobe_count": 1,
  "errors": []
}
```

---

## 5. JSON 처리 표준

### 5.1 노드 사이에서는 Python 객체를 그대로 넘긴다

`dict`를 `json.dumps`로 문자열로 바꾸고, 다음 Python 노드에서 `json.loads`로 다시 풀지 않는다.

```python
# 금지: 포장 -> 전달 -> 포장 해제
wrapped_text = json.dumps(result)
return {"raw_result": wrapped_text}
```

```python
# 권장: 타입을 유지한 채 전달
return {
    "recommendations": recommendations,
    "wardrobe_items": wardrobe_items,
}
```

직렬화는 다음 경계에서만 허용한다.

1. String 입력만 받는 LLM 노드에 JSON을 전달할 때
2. DB String 컬럼에 Array 또는 Object를 저장할 때
3. 외부 HTTP API 본문을 만들 때

### 5.2 LLM String 출력은 백틱 제거 후 한 번만 파싱한다

LLM 노드의 `data`를 String으로 설정했다면 `llm_result["data"]`는 문자열임이 보장된다. 다시 `isinstance(data_text, str)`를 검사하지 않는다.

LLM이 드물게 Markdown 코드 블록을 넣을 수 있으므로 백틱 제거는 유지한다.

```python
def strip_code_fence(text):
    clean_text = text.strip()

    if not clean_text.startswith("```"):
        return clean_text

    lines = clean_text.splitlines()

    if lines and lines[0].strip().startswith("```"):
        lines = lines[1:]

    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]

    return "\n".join(lines).strip()


def parse_llm_output(data_text):
    clean_text = strip_code_fence(data_text)
    return json.loads(clean_text)
```

권장하는 더 간단한 방식은 Pydantic에 파싱과 검증을 함께 맡기는 것이다.

```python
def validate_llm_output(data_text, model_type):
    clean_text = strip_code_fence(data_text)
    return model_type.model_validate_json(clean_text)
```

### 5.3 잘못된 JSON을 억지로 살리지 않는다

고정 스키마를 지시했는데 LLM이 설명문과 여러 JSON 객체를 함께 반환했다면 `find("{")`, `rfind("}")`로 일부만 잘라 저장하지 않는다. 검증 실패로 처리하고 프롬프트나 출력 설정을 수정한다.

---

## 6. Pydantic 검증 모델 표준

### 6.1 의류 분석 모델

```python
class clothing_analysis_model(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=80
    )
    category: Literal[
        "상의",
        "하의",
        "아우터",
        "신발",
        "액세서리",
    ]
    color: str = Field(
        pattern=r"^#[0-9A-Fa-f]{6}$"
    )
    style: list[str] = Field(
        min_length=1,
        max_length=3
    )
    warmth_level: int = Field(
        ge=1,
        le=5
    )
    activity: list[str] = Field(
        min_length=1,
        max_length=3
    )
    waterproof: bool
```

### 6.2 코디 추천 모델

```python
class selected_item_model(BaseModel):
    id: str
    name: str
    category: Literal[
        "상의",
        "하의",
        "아우터",
        "신발",
        "액세서리",
    ]


class suggested_item_model(BaseModel):
    name: str
    category: Literal[
        "상의",
        "하의",
        "아우터",
        "신발",
        "액세서리",
    ]
    color: str
    reason: str


class outfit_recommendation_model(BaseModel):
    combination_id: str
    strategy: Literal[
        "balanced",
        "weather_first",
        "style_first",
    ]
    strategy_label: str
    title: str
    complete: bool
    selected_items: list[selected_item_model]
    missing_categories: list[str]
    suggested_items: list[suggested_item_model]
    reason: str
    match_score: int = Field(ge=0, le=100)
```

검증 실패 시 잘못된 결과를 DB에 저장하거나 프론트엔드에 정상 결과로 전달하지 않는다.

---

## 7. LLM 프롬프트 작성 규칙

### 7.1 공통 규칙

시스템 프롬프트에는 다음을 명시한다.

1. LLM의 역할
2. 허용된 입력과 각 필드의 의미
3. 정확한 출력 JSON 스키마
4. Enum 허용값
5. 숫자 범위
6. 소유 옷과 추가 제안 옷을 구분하는 규칙
7. JSON 외의 설명, Markdown, 코드 블록을 출력하지 말라는 지시

출력 예시는 하나만 제공하고 키 이름은 모두 `snake_case`로 유지한다.

### 7.2 의류 분석 LLM 시스템 프롬프트

```text
너는 사용자가 입력한 의류명과 카테고리를 오늘핏 옷장 스키마로
정규화하는 의류 데이터 분석기다.

반드시 아래 7개 키만 가진 단일 JSON 객체를 반환한다.
name, category, color, style, warmth_level, activity, waterproof

규칙:
- category는 상의, 하의, 아우터, 신발, 액세서리 중 하나다.
- 입력 category가 허용값이면 그 값을 유지한다.
- color는 #RRGGBB 형식이다.
- style과 activity는 각각 1~3개의 문자열 Array이다.
- warmth_level은 1~5의 정수이다.
- waterproof는 입력에 '방수' 또는 '워터프루프' 같은 명시적 근거가
  있을 때만 true로 판단한다.
- 일반 면 티셔츠, 니트, 맨투맨, 린넨 셔츠는 기본적으로 waterproof=false이다.
- '발수'는 '방수'와 같은 속성으로 간주하지 않는다.
- 알 수 없는 속성을 임의로 창작하지 않는다.
- JSON 외의 설명, 인사, Markdown, 백틱을 출력하지 않는다.
```

### 7.3 의류 분석 LLM 사용자 프롬프트

LLM 입력 타입이 String이므로 이 경계에서만 `json.dumps`를 사용한다.

```python
def build_analysis_input(item):
    payload = {
        "name": item["name"],
        "category": item["category"],
    }

    return json.dumps(
        payload,
        ensure_ascii=False
    )
```

LLM 사용자 프롬프트:

```text
다음 JSON 의류 입력을 분석하여 시스템 프롬프트의 출력 스키마로 반환하라.

{{analysis_input}}
```

### 7.4 코디 추천 LLM 핵심 지시

```text
너는 사용자의 옷장, 선호 스타일, 오늘 원하는 스타일, 활동, 날씨,
체감온도 민감도를 반영하여 코디를 선택한다.

규칙:
- selected_items에는 wardrobe_items에 존재하는 id만 사용한다.
- wardrobe_items에 없는 옷을 selected_items에 추가하지 않는다.
- 옷장으로 완성된 코디를 만들 수 없으면 complete=false로 반환한다.
- 부족한 카테고리는 missing_categories에 넣는다.
- 새로 구비하면 좋은 옷은 suggested_items에만 넣는다.
- avoid_item_ids에 있는 옷은 다른 선택지가 있을 때 우선적으로 피한다.
- 최저/최고온도와 hourly_weather를 사용해 시간대별 기온 차를 판단한다.
- 입력에 없는 옷장 id, 속성, 날씨 정보를 창작하지 않는다.
- 결과는 지정된 snake_case JSON 스키마로만 반환한다.
- JSON 외의 설명, Markdown, 백틱을 출력하지 않는다.
```

### 7.5 사용자 스타일 입력을 두 개로 분리한다

`style`이라는 하나의 필드에 서로 다른 의미를 넣지 않는다.

- `favorite_style`: 평소 즐겨 입는 스타일
- `requested_style`: 오늘 추천받고 싶은 스타일

`requested_style`에 맞는 옷이 옷장에 없을 때는 시스템이 있는 옷을 억지로 해당 스타일이라고 표현하지 않는다. `complete=false`와 `suggested_items`로 부족함을 알린다.

---

## 8. 비동기 처리 표준

### 8.1 최대 5개 의류 동시 분석

```python
max_concurrency = 5
llm_timeout_seconds = 45
llm_semaphore = asyncio.Semaphore(
    max_concurrency
)


async def analyze_item(item):
    analysis_input = build_analysis_input(item)

    async with llm_semaphore:
        async with asyncio.timeout(
            llm_timeout_seconds
        ):
            llm_result = await clothing_analysis_llm(
                analysis_input=analysis_input
            )

    data_text = llm_result["data"]

    return validate_llm_output(
        data_text,
        clothing_analysis_model
    )


async def analyze_items(items):
    tasks = []

    for item in items[:5]:
        await asyncio.sleep(0)
        tasks.append(
            asyncio.create_task(
                analyze_item(item)
            )
        )

    return await asyncio.gather(*tasks)
```

### 8.2 세 가지 코디 추천 동시 실행

웹은 Main API를 한 번만 호출한다. Main 어빌리티 내부에서 `balanced`, `weather_first`, `style_first` 세 개의 LLM Function을 동시에 실행한다.

```python
max_concurrency = 3
llm_semaphore = asyncio.Semaphore(
    max_concurrency
)


async def request_recommendations(
    preference_combinations,
    context
):
    tasks = []

    for combination in preference_combinations[:3]:
        await asyncio.sleep(0)
        tasks.append(
            asyncio.create_task(
                request_recommendation(
                    combination,
                    context
                )
            )
        )

    return await asyncio.gather(*tasks)
```

`asyncio.gather`에 넘길 task를 생성하는 반복문에도 `await asyncio.sleep(0)`를 넣어 Agentria 규칙을 따른다.

### 8.3 비동기 오류 처리

- `TimeoutError`는 시간 초과 코드로 변환한다.
- `asyncio.CancelledError`는 재발생시켜 작업 취소가 정상 전파되게 한다.
- 하나의 LLM 요청이 실패해도 나머지 조합을 표시할지, 전체를 실패할지는 노드 출력 계약으로 명시한다.

---

## 9. 중복 의류와 ID 처리

### 9.1 중복 판단에 새로 생성한 ID를 사용하지 않는다

같은 옷을 다시 입력해도 새 UUID나 순번을 만들면 ID가 다르므로 중복을 찾을 수 없다. ID 생성 전에 의류의 의미 키를 비교한다.

```python
def normalize_compare_text(value):
    return (
        value
        .strip()
        .lower()
        .replace(" ", "")
    )


def build_duplicate_key(record):
    return (
        normalize_compare_text(record["name"]),
        record["category"],
        record["color"].upper(),
    )
```

중복 기준은 최소 `name + category`를 사용하고, 같은 이름의 다른 색상을 별개 옷으로 저장하려면 `color`까지 포함한다.

### 9.2 `01`, `02` 형식 ID

표시용 ID는 저장 식별자와 분리하는 것이 가장 안전하다.

- 내부 고유 식별자: UUID 또는 DB 자동 증가 ID
- 화면 표시: `str(number).zfill(2)`

DB 구조상 `id`에 `01`, `02`를 직접 저장해야 한다면 저장 직전에 기존 레코드의 최댓값을 읽어 다음 ID를 할당한다. 다만 여러 요청이 동시에 저장되면 같은 ID가 발급될 수 있으므로 DB 고유 제약 또는 단일 쓰기 함수에서 할당해야 한다.

---

## 10. 오늘핏 옷장 어빌리티 표준 흐름

```text
Ability Input
  -> 입력 검증 및 최대 5개 제한
  -> 의류 분석 LLM Function 병렬 호출
  -> Pydantic 출력 검증
  -> db_list Function 비동기 호출
  -> 중복 제거
  -> DB 레코드 생성
  -> db_add Function 비동기 호출
  -> db_list Function 재호출
  -> 새로운 전체 옷장 반환
  -> Ability Output
```

중요 규칙:

- `add` 성공 후 반환 화면에서는 저장된 항목만 나열하지 말고 DB의 전체 옷장을 다시 읽어 반환한다.
- 새로고침 시에도 `list` 작업을 호출해 DB 데이터를 보여준다.
- 웹의 하드코딩 옷장은 사용하지 않는다.
- DB의 `waterproof=false`는 화면에서 `방수`라고 표시하지 않는다.
- 스타일 필터는 DB 옷장에 실제 존재하는 `style` 값을 기준으로 생성한다.

---

## 11. 오늘핏 Main 어빌리티 표준 흐름

```text
Ability Input
  -> 입력 정규화
  -> 사용자 취향 3개 조합
       -> db_list Function으로 옷장 1회 조회
       -> 실제 옷장 기반 preference_combinations 생성
  -> 날씨 표준화
  -> 날씨 위험 판단
  -> 준비물 추천
  -> 코디 추천 LLM Function 3개 병렬 호출
  -> 코디 결과 파싱 및 Pydantic 검증
  -> 최종 응답
```

### 11.1 사용자 취향 3개 조합 노드

- `wardrobe_text` 사용자 입력을 제거한다.
- 옷장 DB 읽기 Function을 노드에 연결하고 `await db_list()`로 한 번만 호출한다.
- `data_records`를 웹/추천용 `wardrobe_items`로 변환한다.
- `balanced`, `weather_first`, `style_first` 세 조합을 만든다.
- 같은 옷장 Array를 JSON 문자열로 변환해 세 번 복제하지 않는다.
- 가능하면 `preference_combinations`, `wardrobe_items`를 별도 출력으로 제공한다.

### 11.2 날씨 데이터

현재 날씨만 LLM에 보내지 말고 최저/최고온도와 시간대별 예보를 함께 제공한다.

```json
{
  "current_weather": {
    "temperature": 23.0,
    "apparent_temperature": 22.0,
    "humidity": 55,
    "rain_amount": 0.0,
    "precipitation_probability": 20,
    "wind_speed": 3.2,
    "uv_index": 5
  },
  "daily_weather": {
    "min_temperature": 16.0,
    "max_temperature": 25.0
  },
  "hourly_weather": [
    {
      "time": "09:00",
      "temperature": 17.0,
      "precipitation_probability": 10
    },
    {
      "time": "15:00",
      "temperature": 25.0,
      "precipitation_probability": 20
    }
  ]
}
```

### 11.3 추천 중복 방지

`refresh_token`은 호출 횟수를 나타내는 정수일 뿐, 이전 코디의 옷 ID를 알려주지 않는다. 실제 중복 방지에는 다음 필드를 사용한다.

```json
{
  "avoid_item_ids": ["01", "04", "07"],
  "previous_recommendation_ids": ["recommendation_20260911_01"]
}
```

새로고침 시 직전 추천의 `selected_items[].id`를 `avoid_item_ids`로 보낸다. 일자별 이력을 피하려면 추천 이력 DB가 추가로 필요하다.

### 11.4 옷장이 부족한 경우

옷장에 상의 1벌, 하의 1벌만 있는데 세 추천을 억지로 서로 다른 조합인 것처럼 만들지 않는다.

```json
{
  "complete": false,
  "selected_items": [
    {
      "id": "01",
      "name": "두꺼운 니트",
      "category": "상의"
    }
  ],
  "missing_categories": ["하의", "신발"],
  "suggested_items": [
    {
      "name": "차콜 스트레이트 팬츠",
      "category": "하의",
      "color": "#4B4D50",
      "reason": "니트와 조화롭고 오피스 용도에 적합합니다."
    }
  ]
}
```

소유 옷과 추가 제안 옷을 UI에서도 서로 다른 영역으로 표시한다.

---

## 12. `코디 결과 파싱 및 검증` 노드 전용 규칙

이 노드에서는 JSON을 반복 포장하고 해제하는 로직을 제거한다.

### 12.1 입력 계약

- `raw_recommendations`: Array
- `wardrobe_items`: Array
- 각 `raw_recommendations` 항목의 `raw_recommendation`: String

입력이 이 타입으로 설정되어 있으므로 전체 입력에 대한 `isinstance` 추측과 JSON 재파싱을 하지 않는다.

### 12.2 권장 처리 흐름

```text
raw_recommendation String
  -> 코드 펜스 제거
  -> Pydantic model_validate_json 1회
  -> 옷장 ID 대조
  -> model_dump로 native dict 반환
```

### 12.3 표준 코드 형태

```python
raw_recommendations_input = (
    {{raw_recommendations@node_output}}
)
wardrobe_items_input = (
    {{wardrobe_items@node_output}}
)


def parse_recommendation(data_text):
    clean_text = strip_code_fence(data_text)

    return (
        outfit_recommendation_model
        .model_validate_json(clean_text)
    )


async def build_wardrobe_index(wardrobe_items):
    wardrobe_index = {}

    for item in wardrobe_items:
        await asyncio.sleep(0)
        wardrobe_index[item["id"]] = item

    return wardrobe_index


async def validate_selected_items(
    recommendation_model,
    wardrobe_index
):
    validated_items = []

    for selected_item in (
        recommendation_model.selected_items
    ):
        await asyncio.sleep(0)

        wardrobe_item = wardrobe_index.get(
            selected_item.id
        )

        if wardrobe_item is None:
            continue

        validated_items.append(wardrobe_item)

    return validated_items


async def validate_recommendation(
    raw_result,
    wardrobe_index
):
    recommendation_model = parse_recommendation(
        raw_result["raw_recommendation"]
    )

    selected_items = await validate_selected_items(
        recommendation_model,
        wardrobe_index
    )

    recommendation = (
        recommendation_model.model_dump()
    )
    recommendation["selected_items"] = selected_items

    return recommendation


async def validate_recommendations(
    raw_recommendations,
    wardrobe_items
):
    wardrobe_index = await build_wardrobe_index(
        wardrobe_items
    )
    validated_recommendations = []

    for raw_result in raw_recommendations:
        recommendation = await validate_recommendation(
            raw_result,
            wardrobe_index
        )
        validated_recommendations.append(
            recommendation
        )

    return validated_recommendations


# 실행부
recommendations = await validate_recommendations(
    raw_recommendations_input,
    wardrobe_items_input
)

return {
    "recommendations": recommendations,
    "recommendation_count": len(recommendations),
}
```

핵심은 `raw_recommendation -> model_validate_json -> model_dump` 한 번씩이다. 중간에 `json.dumps` 후 다시 `json.loads`하는 로직을 넣지 않는다.

---

## 13. 코드 작성 세부 규칙

### 13.1 함수는 한 가지 역할만 담당한다

권장 함수 단위:

- `strip_code_fence`
- `validate_llm_output`
- `normalize_category`
- `build_analysis_input`
- `analyze_item`
- `analyze_items`
- `load_wardrobe_records`
- `build_duplicate_key`
- `filter_duplicate_records`
- `build_storage_record`
- `save_wardrobe_records`
- `convert_storage_record`
- `build_preference_combinations`
- `build_recommendation_payload`
- `request_recommendation`
- `request_recommendations`
- `validate_recommendation`

함수명은 짧으면서도 동작을 알 수 있게 작성한다. `fn1`, `do_data`, `temp_result`같은 이름을 사용하지 않는다.

### 13.2 예외을 무조건 기본값으로 숨기지 않는다

`except: return []`를 반복하면 LLM 프롬프트, DB 연결, 스키마 오류를 모두 빈 옷장으로 오인하게 된다.

- 외부 Function 호출 실패: `external_call_failed`
- JSON 파싱 실패: `invalid_json`
- Pydantic 검증 실패: `schema_validation_failed`
- DB 저장 결과 없음: `db_write_failed`
- 중복으로 저장 안 함: `duplicate_item`

오류는 사용자용 `message`와 시스템용 `error_code`, `error_detail`로 분리한다.

### 13.3 Boolean을 문자열 진릿값으로 판단하지 않는다

```python
# 금지: "false"도 빈 문자열이 아니므로 True가 됨
waterproof = bool(row["waterproof"])
```

DB 컬럼이 Boolean으로 설정되어 있다면 그 값을 그대로 사용한다.

```python
waterproof = row["waterproof"]
```

만약 외부 API 경계에서만 문자열 Boolean이 올 수 있다면 그 경계에서 한 번만 변환한다.

---

## 14. 금지 패턴

다음 패턴은 새 노드에 사용하지 않고, 기존 노드에서 발견하면 제거한다.

1. `import` 구문 작성
2. `camelCase`와 `snake_case` 혼용
3. Function/LLM/DB 호출에서 `await` 누락
4. `for`, `while` 반복문 안에 `await` 누락
5. 노드 ID를 직접 입력한 Function 호출
6. 타입이 고정된 출력에 대한 반복 `isinstance` 분기
7. `dict -> json.dumps -> json.loads -> dict` 반복
8. LLM 출력 키를 `data`, `result`, `output`, `text` 순으로 추측
9. `record_items=None`
10. 단일 레코드를 Array로 감싸지 않고 DB에 전달
11. Array 출력에 `startswith`나 문자열 함수 적용
12. `warmth_level`을 Array로 저장
13. `waterproof=false`를 `bool("false")`로 변환
14. 중복 판단 전에 새 ID 생성
15. DB 옷장에 없는 옷을 소유 옷으로 추천
16. 옷장이 부족한데도 완성된 코디라고 반환
17. 의미가 다른 `favorite_style`, `requested_style`을 `style`로 합침
18. 이전 추천 정보 없이 `refresh_token` 숫자만으로 중복 방지
19. 필수 출력 키를 특정 return 분기에서 누락
20. 모든 업무 로직을 200줄 이상 실행부에 직접 작성

---

## 15. 모델 선정 기준

모델은 익숙하다는 이유로 선택하지 않고 업무 난이도와 측정 결과로 선택한다.

- 의류 카테고리/색상/방수/보온도 분류: 빠르고 비용이 낮은 모델을 우선 평가
- 세 가지 코디 추천과 부족 옷 제안: 복합 조건 준수율이 높은 모델 사용
- 모델 변경 전후에 같은 테스트 데이터로 정확도, 형식 준수율, 응답 시간, 비용을 비교

의류 분석 필수 테스트:

- `검정색 두꺼운 방수 바람막이` -> `waterproof=true`
- `검은색 두꺼운 니트` -> `waterproof=false`
- `얇은 면 반팔 티셔츠` -> `warmth_level=1`, `waterproof=false`
- `발수 코팅 점퍼` -> 현재 스키마 기준 `waterproof=false`

---

## 16. 노드 완료 체크리스트

### 네이밍

- [ ] 모든 입력, 출력, JSON 키가 `snake_case`인가?
- [ ] `style`과 같이 서로 다른 의미를 하나의 변수에 넣지 않았는가?
- [ ] 변수명이 짧으면서도 역할을 알 수 있는가?

### 비동기

- [ ] 모든 Function, LLM, DB 호출에 `await`가 있는가?
- [ ] 모든 `for`, `while` 반복문 안에 `await`가 있는가?
- [ ] 복수 LLM 호출은 task + gather로 병렬 처리하는가?
- [ ] 동시성 제한과 timeout이 있는가?

### JSON과 타입

- [ ] LLM 출력 스키마가 고정되어 있는가?
- [ ] 백틱 제거 후 JSON을 한 번만 파싱하는가?
- [ ] 노드 사이에서 native `dict`, `list`를 그대로 전달하는가?
- [ ] 출력 타입이 고정된 값을 `isinstance`로 반복 추측하지 않는가?
- [ ] Pydantic으로 LLM 키, 타입, Enum, 범위를 검증하는가?

### DB

- [ ] `record_items`가 항상 Array인가?
- [ ] `saved_records`, `data_records`, `data_structure_items`의 설정 타입과 코드가 일치하는가?
- [ ] `style`, `activity` String 컬럼은 DB 경계에서만 JSON 문자열로 변환하는가?
- [ ] `warmth_level`이 Integer인가?
- [ ] `waterproof`가 Boolean인가?
- [ ] ID 생성 전에 중복을 검사하는가?
- [ ] 저장 후 전체 옷장을 재조회하는가?

### 코디 추천

- [ ] `selected_items`의 ID가 모두 실제 옷장에 존재하는가?
- [ ] 소유 옷과 `suggested_items`을 구분하는가?
- [ ] 옷장이 부족하면 `complete=false`를 반환하는가?
- [ ] 이전 추천의 실제 ID를 `avoid_item_ids`로 제공하는가?
- [ ] `hourly_weather`를 추천에 반영하는가?

### 코드 구조

- [ ] 실행부가 10~20줄 정도로 짧고 업무 흐름만 보이는가?
- [ ] 변환, 검증, DB 읽기, DB 쓰기, LLM 호출이 서로 다른 함수로 분리되어 있는가?
- [ ] 필수 출력 변수가 모든 반환 분기에 존재하는가?
- [ ] 오류를 빈 Array로만 숨기지 않고 `error_code`로 구분하는가?

---

## 17. 요약

오늘핏 Agentria 코드의 표준은 다음 한 문장으로 정리한다.

> **노드 입출력 타입을 먼저 고정하고, LLM JSON을 경계에서 한 번만 파싱·검증하며, native 객체를 snake_case로 전달하고, 모든 외부 함수와 반복문을 비동기 규칙에 맞게 작성하며, 실행부는 짧게 유지한다.**
