import { resilientFetch } from '@/lib/resilient-fetch';

type Essential = { name: string; reason: string; priority: 'required' | 'recommended' };
type RecommendationStrategy = 'balanced' | 'weather_first' | 'style_first';
type Recommendation = {
  combinationId: string;
  strategy: RecommendationStrategy;
  strategyLabel: string;
  complete: boolean;
  missingCategories: string[];
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
  refreshToken?: number;
};

const recommendationStrategies: Array<{
  combinationId: string;
  strategy: RecommendationStrategy;
  strategyLabel: string;
}> = [
  { combinationId: 'combo-1', strategy: 'balanced', strategyLabel: '균형 추천' },
  { combinationId: 'combo-2', strategy: 'weather_first', strategyLabel: '날씨 우선' },
  { combinationId: 'combo-3', strategy: 'style_first', strategyLabel: '스타일 우선' },
];

const categoryLabels: Record<string, string> = {
  top: '상의',
  bottom: '하의',
  outer: '아우터',
  shoes: '신발',
  accessory: '액세서리',
};

function categoryMatches(category: string, expected: string) {
  const aliases: Record<string, string[]> = {
    top: ['상의', 'top'],
    bottom: ['하의', 'bottom'],
    outer: ['아우터', '겉옷', 'outer'],
    shoes: ['신발', 'shoes'],
    accessory: ['액세서리', '악세서리', 'accessory'],
  };
  return aliases[expected]?.includes(category.toLowerCase()) ?? false;
}

function localRecommendation(
  input: RecommendationInput,
  variant = recommendationStrategies[0],
  rotationOffset = 0,
): Recommendation {
  const { current } = input.weather;
  const profile = input.profile;
  const rainy = current.kind === 'rain' || current.kind === 'storm' || current.precipitationProbability >= 40 || current.precipitation > 0;
  const snowCodes = [68, 71, 73, 75, 77, 85, 86];
  const snowy = current.kind === 'snow' || snowCodes.includes(current.weatherCode);
  const hot = current.apparentTemperature >= 28 || (profile.sensitivity === '더위를 많이 탐' && current.apparentTemperature >= 24);
  const cold = current.apparentTemperature <= 8 || (profile.sensitivity === '추위를 많이 탐' && current.apparentTemperature <= 12);
  const essentials: Essential[] = [];

  if (snowy) essentials.push({ name: '미끄럼 방지 신발', reason: '눈길과 결빙 구간에 대비', priority: 'required' });
  else if (rainy) essentials.push({ name: '접이식 우산', reason: `강수 확률 ${current.precipitationProbability}%`, priority: 'required' });
  if (current.uvLabel === '높음' || current.uvLabel === '매우 높음' || current.uvIndex >= 6) essentials.push({ name: '선크림', reason: `자외선 ${current.uvLabel || current.uvIndex}`, priority: 'required' });
  if (hot) essentials.push({ name: '물', reason: '높은 체감온도 대비', priority: 'recommended' });
  if (cold || snowy) essentials.push({ name: '보온 소품', reason: '낮은 체감온도 대비', priority: 'recommended' });
  if (current.windSpeed >= 8) essentials.push({ name: '바람막이', reason: '강한 바람 대비', priority: 'recommended' });
  if (essentials.length < 3) essentials.push({ name: '얇은 겉옷', reason: '실내외 온도 차 대비', priority: 'recommended' });
  if (essentials.length < 3) essentials.push({ name: '작은 가방', reason: '외출 준비물을 가볍게 보관', priority: 'recommended' });

  const selected = input.wardrobe.filter((item) => item.selected);
  const rotation = Math.max(0, Math.floor(input.refreshToken || 0)) + rotationOffset;
  const chooseOwned = (category: string, keywords: string[]) => {
    const candidates = selected.filter((item) => categoryMatches(item.category, category));
    const matches = candidates.filter((item) => keywords.some((keyword) => item.name.toLowerCase().includes(keyword.toLowerCase())));
    const pool = matches.length > 0 ? matches : candidates;
    return pool.length > 0 ? pool[rotation % pool.length] : undefined;
  };
  const itemName = (category: string, keywords: string[], fallback: string) => chooseOwned(category, keywords)?.name || fallback;

  let outfitItems: string[];
  let headline: string;
  let description: string;
  let seasonTag: string;

  if (snowy) {
    outfitItems = [itemName('top', ['니트', '기모', '울'], '보온 니트'), itemName('outer', ['패딩', '코트', '다운'], '보온 아우터'), itemName('bottom', ['팬츠', '바지'], '기모 긴 바지'), itemName('shoes', ['부츠', '방수'], '미끄럼 방지 신발')];
    headline = `${profile.style} 스타일로 눈길에 대비하는 코디`;
    description = `${profile.activity} 일정에 맞춰 보온성과 미끄럼 방지를 우선했어요. 눈이 녹는 구간에서는 밑창이 미끄럽지 않은 신발을 선택하세요.`;
    seasonTag = '눈·결빙';
  } else if (cold) {
    outfitItems = [itemName('top', ['니트', '울', '기모'], '보온 니트'), itemName('outer', ['패딩', '코트', '다운', '재킷'], '보온 아우터'), itemName('bottom', ['팬츠', '바지'], '긴 바지'), itemName('shoes', ['부츠', '운동화', '로퍼'], '막힌 신발')];
    headline = `${profile.style} 스타일로 체온을 지키는 겹쳐 입기`;
    description = `${profile.activity}할 때 벗고 입기 쉬운 보온 레이어드를 구성했어요. ${profile.sensitivity === '추위를 많이 탐' ? '추위를 많이 타는 편이므로 목과 손목도 따뜻하게 보호하세요.' : '실내에서는 아우터를 벗어 체온을 조절하세요.'}`;
    seasonTag = '보온';
  } else if (hot) {
    outfitItems = [itemName('top', ['린넨', '반팔', '반소매', '셔츠'], '통기성 좋은 상의'), itemName('bottom', ['반바지', '팬츠', '바지'], '가벼운 하의'), itemName('shoes', ['샌들', '스니커즈', '로퍼'], '통풍이 좋은 신발')];
    headline = `${profile.style} 스타일로 시원하고 가볍게`;
    description = `${profile.activity} 일정에 맞춰 통기성과 활동성을 우선했어요. 햇볕에 오래 있으면 자외선 지수에 맞춰 선크림을 덧바르세요.`;
    seasonTag = '더운 날';
  } else if (rainy) {
    outfitItems = [itemName('top', ['니트', '긴팔', '셔츠'], '얇은 긴팔 상의'), itemName('bottom', ['팬츠', '바지'], '젖기 쉬운 밑단이 짧은 하의'), itemName('outer', ['레인', '방수', '우비'], '생활 방수 아우터'), itemName('shoes', ['방수', '부츠'], '미끄럼이 적은 신발')];
    headline = `${profile.style} 스타일로 비에 젖지 않는 ${profile.activity} 코디`;
    description = '강수 가능성을 반영해 방수 아우터와 미끄럼이 적은 신발을 우선했어요. 우산을 함께 준비하면 갑작스러운 비에도 대응할 수 있습니다.';
    seasonTag = '우천';
  } else if (current.apparentTemperature <= 16) {
    outfitItems = [itemName('top', ['긴팔', '니트', '셔츠'], '긴팔 상의'), itemName('outer', ['재킷', '가디건', '코트'], '가벼운 재킷'), itemName('bottom', ['팬츠', '바지'], '긴 바지'), itemName('shoes', ['스니커즈', '로퍼'], '스니커즈')];
    headline = `${profile.style} 스타일로 일교차에 대비`;
    description = `${profile.activity} 중 더워지면 벗을 수 있는 가벼운 겉옷을 더했어요.`;
    seasonTag = '간절기';
  } else {
    outfitItems = [itemName('top', ['반팔', '린넨', '셔츠', '니트'], '가벼운 상의'), itemName('bottom', ['팬츠', '바지'], '가벼운 하의'), itemName('shoes', ['스니커즈', '로퍼'], '편한 신발')];
    headline = `${profile.style} 스타일로 편안하게`;
    description = `${profile.activity} 일정에 맞춰 무난하고 활동하기 편한 조합을 골랐어요.`;
    seasonTag = '쾌적한 날';
  }

  const selectedCategoryCount = new Set(selected.map((item) => item.category)).size;
  const categoryCount = new Set(outfitItems).size;

  return {
    ...variant,
    complete: true,
    missingCategories: [],
    headline,
    description,
    notice: rainy ? '비가 오는 시간대에는 미끄러운 길을 주의하세요.' : hot ? '한낮의 장시간 야외 활동은 피하고 물을 자주 마시세요.' : '시간대별 기온을 확인하고 얇은 겉옷을 조절하세요.',
    matchScore: Math.min(98, 72 + Math.min(selected.length, 6) * 3 + Math.min(selectedCategoryCount, categoryCount) * 3),
    tags: [variant.strategyLabel, profile.style, profile.activity, seasonTag],
    essentials: essentials.slice(0, 3),
    outfitItems: Array.from(new Set(outfitItems)).slice(0, 5),
  };
}

function localRecommendations(input: RecommendationInput) {
  return recommendationStrategies.map((strategy, index) =>
    localRecommendation(input, strategy, index),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildAgentriaInput(input: RecommendationInput) {
  const location = input.weather.location || '현재 위치';

  // 에이전트리아의 날씨 표준화 Python 노드가 읽을 수 있도록
  // 웹페이지의 정규화된 날씨 데이터를 weatherText 입력 스키마로 변환합니다.
  const weatherText = JSON.stringify({
    location,
    current_units: { wind_speed_10m: 'm/s' },
    current: {
      temperature_2m: input.weather.current.temperature,
      apparent_temperature: input.weather.current.apparentTemperature,
      relative_humidity_2m: input.weather.current.humidity,
      precipitation: input.weather.current.precipitation,
      precipitation_probability: input.weather.current.precipitationProbability,
      wind_speed_10m: input.weather.current.windSpeed,
      weather_code: input.weather.current.weatherCode,
      uv_index: input.weather.current.uvIndex,
      label: input.weather.current.label,
      kind: input.weather.current.kind,
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

  return {
    location,
    gender: input.profile.gender,
    style: input.profile.style,
    activity: input.profile.activity,
    sensitivity: input.profile.sensitivity,
    refreshToken: Math.max(0, Math.floor(input.refreshToken || 0)),
    weatherText,
  };
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
  params: Record<string, string | number>,
) {
  const headers = { 'X-API-KEY': apiKey };
  // Agentria는 params_json 한 필드를 받으므로 boundary가 필요한 multipart보다
  // 런타임 차이가 적은 URL-encoded form으로 전송합니다. 이 형식은 API가
  // 동일하게 파싱하며 Cloudflare/Vinext 로컬 워커에서도 안정적으로 동작합니다.
  const formBody = new URLSearchParams({ params_json: JSON.stringify(params) });

  // 실행 POST는 중복 전송을 피하기 위해 공통 재시도 래퍼와 분리합니다.
  const controller = new AbortController();
  // 실행 요청은 비동기 request ID를 받을 때까지 충분히 기다립니다.
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let runResponse: Response;
  try {
    runResponse = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: formBody,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const runText = await runResponse.text();
  if (!runResponse.ok) {
    throw new Error(`Agentria API error ${runResponse.status}: ${runText.slice(0, 240)}`);
  }

  const runBody = parseJsonOrText(runText);
  const requestId = getRequestId(runBody);

  // 동기 응답을 지원하는 환경에서는 받은 결과를 바로 사용합니다.
  if (!requestId) return runBody;

  const statusEndpoint = endpoint.replace(/\/+$/, '');
  // 비동기 실행 ID가 반환되면 최대 2분 동안 완료 상태를 확인합니다.
  // 실행 요청 60초 + 상태 대기 120초가 전체 상한입니다.
  const deadline = Date.now() + 120_000;

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
  recommendations?: unknown[];
  // 이전 어빌리티 응답도 배포 전환 중에는 읽을 수 있도록 유지합니다.
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

  if (value.recommendations || value.outfit || value.preparation || value.risk) {
    return value as FinalResponse;
  }

  if (value.finalResponse !== undefined) {
    return findFinalResponse(value.finalResponse, depth + 1);
  }

  for (const key of ['output', 'result', 'data', 'results', 'value']) {
    const found = findFinalResponse(value[key], depth + 1);
    if (found) return found;
  }

  return null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(String).filter((item) => item.trim().length > 0)
    : [];
}

function mapAgentriaResponse(raw: unknown, fallback: Recommendation[]) {
  const result = findFinalResponse(raw);
  if (!result) return { recommendations: fallback, aiRecommendationCount: 0 };

  const preparationItems = stringArray(result.preparation?.items);
  const essentials = preparationItems.length > 0
    ? preparationItems.slice(0, 3).map((name, index): Essential => ({
      name,
      reason: result.preparation?.message || '오늘 날씨에 필요한 준비물이에요.',
      priority: index === 0 ? 'required' : 'recommended',
    }))
    : null;

  const legacyRecommendation = result.outfit
    ? [{
      combinationId: 'combo-1',
      strategy: 'balanced',
      strategyLabel: '균형 추천',
      success: true,
      outfitTitle: result.outfit.title,
      outfitDescription: result.outfit.description,
      selectedItemNames: result.outfit.selectedItemNames,
      cautionMessage: result.outfit.cautionMessage,
      unmatchedCategories: result.outfit.unmatchedCategories,
    }]
    : [];
  const rawRecommendations = Array.isArray(result.recommendations)
    ? result.recommendations
    : legacyRecommendation;

  let aiRecommendationCount = 0;
  const recommendations = recommendationStrategies.map((strategy, index) => {
    const matchedByIdentity = rawRecommendations.find((candidate) =>
      isRecord(candidate) && (
        candidate.combinationId === strategy.combinationId ||
        candidate.strategy === strategy.strategy
      ),
    );
    const candidate = matchedByIdentity ?? rawRecommendations[index];
    const localFallback = fallback[index] ?? fallback[0];
    if (!isRecord(candidate)) return localFallback;

    const selectedItemNames = stringArray(candidate.selectedItemNames);
    const headline = typeof candidate.outfitTitle === 'string'
      ? candidate.outfitTitle.trim()
      : '';
    const description = typeof candidate.outfitDescription === 'string'
      ? candidate.outfitDescription.trim()
      : '';
    if (!headline || selectedItemNames.length === 0) return localFallback;

    aiRecommendationCount += 1;
    const unmatchedCategories = stringArray(candidate.unmatchedCategories);
    const missingCategories = unmatchedCategories.map(
      (category) => categoryLabels[category] || category,
    );
    const complete =
      candidate.success !== false &&
      missingCategories.length === 0 &&
      selectedItemNames.length > 0;
    const numericScore = Number(candidate.matchScore);
    const matchScore = Number.isFinite(numericScore)
      ? Math.max(0, Math.min(100, Math.round(numericScore)))
      : Math.max(0, 95 - unmatchedCategories.length * 10);
    const strategyLabel = typeof candidate.strategyLabel === 'string' && candidate.strategyLabel.trim()
      ? candidate.strategyLabel.trim()
      : strategy.strategyLabel;
    const cautionMessage = typeof candidate.cautionMessage === 'string'
      ? candidate.cautionMessage.trim()
      : '';

    return {
      ...strategy,
      strategyLabel,
      complete,
      missingCategories,
      headline,
      description: description || localFallback.description,
      notice: cautionMessage || result.risk?.warningText || localFallback.notice,
      matchScore,
      tags: [strategyLabel, result.request?.style, result.request?.activity].filter(
        (value): value is string => Boolean(value),
      ),
      essentials: essentials ?? localFallback.essentials,
      outfitItems: selectedItemNames,
    };
  });

  return { recommendations, aiRecommendationCount };
}

export async function POST(request: Request) {
  let fallback: Recommendation[] | null = null;
  try {
    const input = await request.json() as RecommendationInput;
    if (!input?.weather?.current || !input?.profile || !Array.isArray(input?.wardrobe)) {
      return Response.json({ message: '추천에 필요한 입력값이 부족해요.' }, { status: 400 });
    }

    fallback = localRecommendations(input);
    const endpoint = process.env.AGENTRIA_API_URL;
    if (!endpoint) return Response.json({ data: fallback, source: 'local' });

    const apiKey = process.env.AGENTRIA_API_KEY;
    if (!apiKey) throw new Error('AGENTRIA_API_KEY가 설정되지 않았습니다.');

    const agentriaInput = buildAgentriaInput(input);
    const raw = await runAgentriaAbility(endpoint, apiKey, agentriaInput);
    const mapped = mapAgentriaResponse(raw, fallback);
    const usedFallbackCount = recommendationStrategies.length - mapped.aiRecommendationCount;
    return Response.json({
      data: mapped.recommendations,
      source: mapped.aiRecommendationCount > 0 ? 'agentria' : 'local-fallback',
      warning: usedFallbackCount > 0
        ? `AI 추천 ${usedFallbackCount}개를 날씨·취향·옷장 기반 보완 추천으로 대체했어요.`
        : undefined,
    });
  } catch (error) {
    console.error('Recommendation API error', error);
    if (fallback) {
      const upstreamFailed = error instanceof Error && /Agentria API error 5\d\d/.test(error.message);
      return Response.json({
        data: fallback,
        source: 'local-fallback',
        warning: upstreamFailed
          ? 'AI 추천 서버가 오류를 반환해 날씨·취향·옷장 기반 보완 추천을 표시했어요.'
          : 'AI 추천 응답이 늦어 날씨·취향·옷장 기반 보완 추천을 표시했어요.',
      });
    }
    return Response.json({ message: '추천을 만드는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' }, { status: 502 });
  }
}
