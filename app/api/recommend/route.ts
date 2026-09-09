import { resilientFetch } from '@/lib/resilient-fetch';

type Essential = { name: string; reason: string; priority: 'required' | 'recommended' };
type Recommendation = {
  headline: string;
  description: string;
  notice: string;
  matchScore: number;
  tags: string[];
  essentials: Essential[];
  outfitItems: string[];
};

type RecommendationInput = {
  weather: {
    location?: string;
    current: {
      temperature: number;
      apparentTemperature: number;
      humidity: number;
      precipitation: number;
      precipitationProbability: number;
      windSpeed: number;
      weatherCode: number;
      label: string;
      uvIndex: number;
      uvLabel: string;
      kind: string;
    };
    daily: { maxTemperature: number; minTemperature: number };
    weatherAlert?: string;
    officialAlert?: boolean;
  };
  profile: { gender: 'female' | 'male'; style: string; activity: string; sensitivity: string };
  wardrobe: Array<{ id: string; name: string; category: string; color?: string; selected: boolean }>;
};

function localRecommendation(input: RecommendationInput): Recommendation {
  const { current } = input.weather;
  const rainy = current.kind === 'rain' || current.kind === 'storm';
  const snowy = current.kind === 'snow';
  const hot = current.apparentTemperature >= 28;
  const cold = current.apparentTemperature <= 8;
  const essentials: Essential[] = [];

  if (rainy || current.precipitationProbability >= 40) essentials.push({ name: '접이식 우산', reason: `강수 확률 ${current.precipitationProbability}%`, priority: 'required' });
  if (snowy) essentials.push({ name: '미끄럼 방지 신발', reason: '눈길 이동에 대비', priority: 'required' });
  if (current.uvLabel === '높음' || current.uvLabel === '매우 높음') essentials.push({ name: '선크림', reason: `자외선 ${current.uvLabel}`, priority: 'required' });
  if (hot) essentials.push({ name: '물', reason: '높은 체감온도 대비', priority: 'recommended' });
  if (cold) essentials.push({ name: '보온 소품', reason: '낮은 체감온도 대비', priority: 'recommended' });
  if (current.windSpeed >= 8) essentials.push({ name: '바람막이', reason: '강한 바람 대비', priority: 'recommended' });
  if (essentials.length < 3) essentials.push({ name: '얇은 겉옷', reason: '실내외 온도 차 대비', priority: 'recommended' });
  if (essentials.length < 3) essentials.push({ name: '작은 가방', reason: '외출 준비물을 가볍게 보관', priority: 'recommended' });

  let outfitItems = ['반팔 상의', '가벼운 하의', '통풍이 좋은 신발'];
  let headline = '가볍고 편안하게';
  let description = '기온에 맞는 가벼운 소재를 중심으로 구성했어요.';

  if (cold) {
    outfitItems = ['니트', '보온 아우터', '긴 바지', '막힌 신발'];
    headline = '체온을 지키는 단정한 겹쳐 입기';
    description = '보온성이 있는 상의와 아우터를 겹쳐 입고, 목과 손목을 차갑지 않게 준비하세요.';
  } else if (current.apparentTemperature <= 16) {
    outfitItems = ['긴팔 상의', '가벼운 재킷', '긴 바지', '스니커즈'];
    headline = '겉옷 하나로 일교차에 대비';
    description = '낮에는 가볍게 벗을 수 있는 재킷이나 카디건을 더한 조합이 좋아요.';
  } else if (current.apparentTemperature <= 22) {
    outfitItems = ['얇은 긴팔', '코튼 팬츠', '가벼운 아우터', '스니커즈'];
    headline = rainy ? '젖지 않고, 답답하지 않게' : '가볍게 겹쳐 입기 좋은 날';
    description = rainy ? '얇은 상의에 생활 방수 아우터를 더하면 비가 그친 뒤에도 편안합니다.' : '얇은 긴팔과 가벼운 아우터로 시간대별 기온 변화에 대응하세요.';
  } else if (!hot) {
    outfitItems = ['반팔 상의', '얇은 셔츠', '가벼운 팬츠', '스니커즈'];
    headline = rainy ? '습한 날에도 가볍게' : '선선함을 남긴 가벼운 차림';
    description = '통기성이 좋은 상의와 가벼운 하의를 골라 한낮에도 부담이 없도록 구성했어요.';
  }

  if (rainy) outfitItems = [...outfitItems.filter((item) => item !== '가벼운 아우터'), '생활 방수 아우터'];
  const selectedNames = input.wardrobe.filter((item) => item.selected).map((item) => item.name);
  const ownedMatches = selectedNames.filter((name) => outfitItems.some((item) => name.includes(item.split(' ')[0])));
  if (ownedMatches.length) outfitItems = [...ownedMatches, ...outfitItems.filter((item) => !ownedMatches.some((name) => name.includes(item.split(' ')[0])))];

  return {
    headline,
    description,
    notice: rainy ? '비가 오는 시간대에는 미끄러운 길을 주의하세요.' : hot ? '한낮의 장시간 야외 활동은 피하고 물을 자주 마시세요.' : '시간대별 기온을 확인하고 얇은 겉옷을 조절하세요.',
    matchScore: Math.min(96, 82 + Math.min(selectedNames.length, 6) * 2),
    tags: [input.profile.style, input.profile.activity, rainy ? '우천' : hot ? '여름' : cold ? '보온' : '간절기'],
    essentials: essentials.slice(0, 3),
    outfitItems: outfitItems.slice(0, 5),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildAgentriaInput(input: RecommendationInput) {
  const categoryMap: Record<string, string> = {
    상의: 'top',
    하의: 'bottom',
    아우터: 'outer',
    신발: 'shoes',
    액세서리: 'accessory',
  };

  const location = input.weather.location || '현재 위치';
  const genderLabel = input.profile.gender === 'female' ? '여성' : '남성';

  const requestText =
    `오늘 ${location} 날씨에 맞는 ${genderLabel} ` +
    `${input.profile.style} 스타일의 ${input.profile.activity} 코디를 추천해줘. ` +
    `온도 민감도는 ${input.profile.sensitivity}이야.`;

  // 에이전트리아의 날씨 표준화 Python 노드가 읽을 수 있도록
  // 웹페이지의 정규화된 날씨 데이터를 기존 weatherText 입력 스키마로 변환합니다.
  const weatherText = JSON.stringify({
    location,
    current_units: { wind_speed_10m: 'km/h' },
    current: {
      temperature_2m: input.weather.current.temperature,
      apparent_temperature: input.weather.current.apparentTemperature,
      relative_humidity_2m: input.weather.current.humidity,
      precipitation: input.weather.current.precipitation,
      wind_speed_10m: input.weather.current.windSpeed,
      weather_code: input.weather.current.weatherCode,
    },
    daily: {
      temperature_2m_max: [input.weather.daily.maxTemperature],
      temperature_2m_min: [input.weather.daily.minTemperature],
      precipitation_probability_max: [input.weather.current.precipitationProbability],
      uv_index_max: [input.weather.current.uvIndex],
    },
    weatherAlert: input.weather.weatherAlert || '',
    officialAlert: input.weather.officialAlert === true,
  });

  const defaultWarmth: Record<string, number> = {
    outer: 3,
    top: 2,
    bottom: 2,
    shoes: 1,
    accessory: 1,
  };

  const wardrobeText = JSON.stringify(
    input.wardrobe
      .filter((item) => item.selected)
      .map((item) => {
        const category = categoryMap[item.category] || item.category;

        return {
          id: item.id,
          name: item.name,
          category,
          color: item.color || '',
          warmthLevel: defaultWarmth[category] || 2,
          waterproof: /방수|레인|rain|waterproof/i.test(item.name),
          styleTags: [input.profile.style],
          activityTags: [input.profile.activity],
          active: true,
        };
      }),
  );

  return { requestText, weatherText, wardrobeText };
}

function parseJsonOrText(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function getRequestId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!isRecord(value)) return null;

  for (const key of ['request_id', 'requestId', 'transaction_id', 'transactionId']) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }

  return null;
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function runAgentriaAbility(
  endpoint: string,
  apiKey: string,
  params: Record<string, string>,
) {
  const headers = { 'X-API-KEY': apiKey };
  const formData = new FormData();
  formData.append('params_json', JSON.stringify(params));

  const runResponse = await resilientFetch(endpoint, {
    method: 'POST',
    headers,
    body: formData,
  }, { timeoutMs: 10_000, retries: 1 });

  const runText = await runResponse.text();
  if (!runResponse.ok) {
    throw new Error(`Agentria API error ${runResponse.status}: ${runText.slice(0, 240)}`);
  }

  const runBody = parseJsonOrText(runText);
  const requestId = getRequestId(runBody);

  // 동기 응답을 지원하는 환경에서는 받은 결과를 바로 사용합니다.
  if (!requestId) return runBody;

  const statusEndpoint = endpoint.replace(/\/+$/, '');
  const deadline = Date.now() + 45_000;

  while (Date.now() < deadline) {
    const statusResponse = await resilientFetch(
      `${statusEndpoint}/${encodeURIComponent(requestId)}/status`,
      { method: 'GET', headers },
      { timeoutMs: 8_000, retries: 0 },
    );

    const statusText = await statusResponse.text();
    if (!statusResponse.ok) {
      throw new Error(`Agentria status error ${statusResponse.status}: ${statusText.slice(0, 240)}`);
    }

    const statusBody = parseJsonOrText(statusText);
    if (!isRecord(statusBody)) return statusBody;

    const statusValue = statusBody.status;
    const status = typeof statusValue === 'string' ? statusValue.toUpperCase() : '';
    if (status === 'COMPLETED' || status === 'SUCCESS' || status === 'SUCCEEDED') {
      return statusBody.results ?? statusBody.result ?? statusBody;
    }

    if (status === 'FAILURE' || status === 'FAILED' || status === 'CANCELED') {
      const failureValue = statusBody.failure_reason || statusBody.message;
      const failureMessage = typeof failureValue === 'string'
        ? failureValue
        : `Agentria execution ${status}`;
      throw new Error(failureMessage);
    }

    await delay(1_000);
  }

  throw new Error('Agentria 응답 대기 시간이 초과되었습니다.');
}

type FinalResponse = {
  request?: { style?: string; activity?: string };
  risk?: { warningText?: string };
  preparation?: { items?: unknown[]; message?: string };
  outfit?: {
    title?: string;
    description?: string;
    selectedItemNames?: unknown[];
    cautionMessage?: string;
    unmatchedCategories?: unknown[];
  };
};

function findFinalResponse(value: unknown, depth = 0): FinalResponse | null {
  if (depth > 8 || value == null) return null;

  if (typeof value === 'string') {
    return findFinalResponse(parseJsonOrText(value), depth + 1);
  }

  if (Array.isArray(value)) {
    const namedOutput = value.find(
      (item: unknown) => isRecord(item) && item.name === 'finalResponse',
    );

    if (namedOutput) return findFinalResponse(namedOutput.value, depth + 1);

    for (const item of value) {
      const found = findFinalResponse(item, depth + 1);
      if (found) return found;
    }

    return null;
  }

  if (!isRecord(value)) return null;

  if (value.outfit || value.preparation || value.risk) {
    return value as FinalResponse;
  }

  if (value.finalResponse !== undefined) {
    return findFinalResponse(value.finalResponse, depth + 1);
  }

  for (const key of ['output', 'result', 'data', 'results']) {
    const found = findFinalResponse(value[key], depth + 1);
    if (found) return found;
  }

  return null;
}

function mapAgentriaResponse(raw: unknown, fallback: Recommendation): Recommendation {
  const result = findFinalResponse(raw);
  if (!result) return fallback;

  const preparationItems = Array.isArray(result.preparation?.items)
    ? result.preparation.items.map(String)
    : [];
  const selectedItemNames = Array.isArray(result.outfit?.selectedItemNames)
    ? result.outfit.selectedItemNames.map(String)
    : [];
  const unmatchedCategories = Array.isArray(result.outfit?.unmatchedCategories)
    ? result.outfit.unmatchedCategories
    : [];

  return {
    headline: result.outfit?.title || fallback.headline,
    description: result.outfit?.description || fallback.description,
    notice: result.outfit?.cautionMessage || result.risk?.warningText || fallback.notice,
    matchScore: Math.max(60, 95 - unmatchedCategories.length * 10),
    tags: [result.request?.style, result.request?.activity].filter(
      (value): value is string => Boolean(value),
    ),
    essentials: preparationItems.length > 0
      ? preparationItems.slice(0, 3).map((name, index) => ({
        name,
        reason: result.preparation?.message || '오늘 날씨에 필요한 준비물이에요.',
        priority: index === 0 ? 'required' : 'recommended',
      }))
      : fallback.essentials,
    outfitItems: selectedItemNames.length > 0 ? selectedItemNames : fallback.outfitItems,
  };
}

export async function POST(request: Request) {
  try {
    const input = await request.json() as RecommendationInput;
    if (!input?.weather?.current || !input?.profile || !Array.isArray(input?.wardrobe)) {
      return Response.json({ message: '추천에 필요한 입력값이 부족해요.' }, { status: 400 });
    }

    const fallback = localRecommendation(input);
    const endpoint = process.env.AGENTRIA_API_URL;
    if (!endpoint) return Response.json({ data: fallback, source: 'local' });

    const apiKey = process.env.AGENTRIA_API_KEY;
    if (!apiKey) throw new Error('AGENTRIA_API_KEY가 설정되지 않았습니다.');

    const agentriaInput = buildAgentriaInput(input);
    const raw = await runAgentriaAbility(endpoint, apiKey, agentriaInput);
    return Response.json({ data: mapAgentriaResponse(raw, fallback), source: 'agentria' });
  } catch (error) {
    console.error('Recommendation API error', error);
    return Response.json({ message: '추천을 만드는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' }, { status: 502 });
  }
}
