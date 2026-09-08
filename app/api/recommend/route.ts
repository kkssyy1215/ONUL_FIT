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
    current: { temperature: number; apparentTemperature: number; precipitationProbability: number; windSpeed: number; uvLabel: string; kind: string };
    daily: { maxTemperature: number; minTemperature: number };
  };
  profile: { gender: 'female' | 'male'; style: string; activity: string; sensitivity: string };
  wardrobe: Array<{ id: string; name: string; category: string; selected: boolean }>;
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

function normalizeUpstream(raw: unknown, fallback: Recommendation): Recommendation {
  if (!raw || typeof raw !== 'object') return fallback;
  const root = raw as Record<string, unknown>;
  const nested = (root.output ?? root.result ?? root.data ?? root) as unknown;
  if (!nested || typeof nested !== 'object') return fallback;
  const value = nested as Partial<Recommendation>;
  return {
    ...fallback,
    ...value,
    essentials: Array.isArray(value.essentials) ? value.essentials : fallback.essentials,
    outfitItems: Array.isArray(value.outfitItems) ? value.outfitItems : fallback.outfitItems,
    tags: Array.isArray(value.tags) ? value.tags : fallback.tags,
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

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = process.env.AGENTRIA_API_KEY;
    if (apiKey) {
      const headerName = process.env.AGENTRIA_API_KEY_HEADER || 'Authorization';
      headers[headerName] = headerName.toLowerCase() === 'authorization' ? `Bearer ${apiKey}` : apiKey;
    }

    const body = process.env.AGENTRIA_PAYLOAD_MODE === 'wrapped'
      ? { ability: process.env.AGENTRIA_ABILITY_NAME || 'today_fit_agent', input }
      : input;
    const response = await resilientFetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }, { timeoutMs: 9_000, retries: 1 });

    if (!response.ok) throw new Error(`Agentria API error: ${response.status}`);
    const raw = await response.json();
    return Response.json({ data: normalizeUpstream(raw, fallback), source: 'agentria' });
  } catch (error) {
    console.error('Recommendation API error', error);
    return Response.json({ message: '추천을 만드는 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.' }, { status: 502 });
  }
}
