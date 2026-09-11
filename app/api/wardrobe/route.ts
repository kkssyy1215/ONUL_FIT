import { resilientFetch } from '@/lib/resilient-fetch';

type WardrobeItem = {
  id: string;
  name: string;
  category: string;
  color: string;
  styleTags: string[];
  warmthLevel: number;
  activityTags: string[];
  waterproof: boolean;
  selected: boolean;
};

type WardrobeResult = {
  success: boolean;
  message: string;
  wardrobeItems: WardrobeItem[];
  wardrobeCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [value.trim()];
  } catch {
    return [value.trim()];
  }
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.length > 0 ? asBoolean(value[0], fallback) : fallback;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return fallback;
  }
  if (typeof value === 'string') {
    const text = value.trim();
    const normalized = text.toLowerCase();
    if (['true', '1', 'yes', 'y', '네'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', '', '아니요'].includes(normalized)) return false;

    try {
      const parsed = JSON.parse(text) as unknown;
      if (parsed !== value) return asBoolean(parsed, fallback);
    } catch {
      return fallback;
    }
  }
  return fallback;
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

async function runWardrobeAbility(
  endpoint: string,
  apiKey: string,
  params: Record<string, string>,
) {
  // Workerd/Vinext의 URLSearchParams·FormData 직렬화는 Agentria에서
  // 간헐적으로 500을 일으킬 수 있어 multipart 본문을 직접 만듭니다.
  const boundary = `----onul-fit-wardrobe-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const headers = {
    'X-API-KEY': apiKey,
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
  };
  const formBody = [
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="params_json"\r\n\r\n',
    JSON.stringify(params),
    `\r\n--${boundary}--\r\n`,
  ].join('');
  const controller = new AbortController();
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
    throw new Error(`Wardrobe API error ${runResponse.status}: ${runText.slice(0, 240)}`);
  }

  const runBody = parseJsonOrText(runText);
  const requestId = getRequestId(runBody);
  if (!requestId) return runBody;

  const statusEndpoint = endpoint.replace(/\/+$/, '');
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    const statusResponse = await resilientFetch(
      `${statusEndpoint}/${encodeURIComponent(requestId)}/status`,
      { method: 'GET', headers },
      { timeoutMs: 8_000, retries: 0 },
    );
    const statusText = await statusResponse.text();

    if (!statusResponse.ok) {
      if (statusResponse.status === 404) {
        await delay(1_000);
        continue;
      }
      throw new Error(
        `Wardrobe status error ${statusResponse.status}: ${statusText.slice(0, 240)}`,
      );
    }

    const statusBody = parseJsonOrText(statusText);
    if (!isRecord(statusBody)) return statusBody;

    const statusValue = statusBody.status;
    const status = typeof statusValue === 'string' ? statusValue.toUpperCase() : '';
    if (status === 'COMPLETED' || status === 'SUCCESS' || status === 'SUCCEEDED') {
      return statusBody.results ?? statusBody.result ?? statusBody;
    }
    if (status === 'FAILURE' || status === 'FAILED' || status === 'CANCELED') {
      const reason = statusBody.failure_reason ?? statusBody.message;
      throw new Error(typeof reason === 'string' ? reason : `Wardrobe execution ${status}`);
    }

    await delay(1_000);
  }

  throw new Error('옷장 API 응답 대기 시간이 초과되었습니다.');
}

async function runWardrobeThroughNodeProxy(
  proxyUrl: string,
  params: Record<string, string>,
) {
  const response = await resilientFetch(
    `${proxyUrl.replace(/\/+$/, '')}/run`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ability: 'wardrobe', params }),
    },
    { timeoutMs: 180_000, retries: 0 },
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Wardrobe proxy error ${response.status}: ${text.slice(0, 240)}`);
  }

  return parseJsonOrText(text);
}

function findWardrobeResult(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 8 || value == null) return null;

  if (typeof value === 'string') {
    return findWardrobeResult(parseJsonOrText(value), depth + 1);
  }

  if (Array.isArray(value)) {
    const namedOutput = value.find(
      (item) => isRecord(item) && (item.name === 'result' || item.name === 'finalResponse'),
    );
    if (namedOutput && isRecord(namedOutput)) {
      return findWardrobeResult(namedOutput.value, depth + 1);
    }

    for (const item of value) {
      const found = findWardrobeResult(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (!isRecord(value)) return null;
  if (Array.isArray(value.wardrobeItems)) return value;

  for (const key of ['result', 'output', 'data', 'results', 'value']) {
    const found = findWardrobeResult(value[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function normalizeWardrobeResult(raw: unknown): WardrobeResult {
  const result = findWardrobeResult(raw);
  if (!result) throw new Error('옷장 API 결과에서 wardrobeItems를 찾지 못했습니다.');

  const rawItems = Array.isArray(result.wardrobeItems) ? result.wardrobeItems : [];
  const wardrobeItems = rawItems.flatMap((value): WardrobeItem[] => {
    if (!isRecord(value)) return [];

    const id = asText(value.id);
    const name = asText(value.name);
    const category = asText(value.category);
    if (!id || !name || !category) return [];

    const warmth = Number(value.warmthLevel ?? value.warmth_level);
    return [{
      id,
      name,
      category,
      color: asText(value.color, '#A0A0A0'),
      styleTags: asStringArray(value.styleTags ?? value.style),
      warmthLevel: Number.isFinite(warmth) ? Math.max(1, Math.min(5, Math.round(warmth))) : 3,
      activityTags: asStringArray(value.activityTags ?? value.activity),
      waterproof: asBoolean(value.waterproof),
      selected: asBoolean(value.selected, true),
    }];
  });

  return {
    success: result.success !== false,
    message: asText(result.message, '옷장을 업데이트했습니다.'),
    wardrobeItems,
    wardrobeCount: wardrobeItems.length,
  };
}

function getWardrobeApiConfig() {
  return {
    endpoint: process.env.AGENTRIA_WARDROBE_API_URL,
    apiKey:
      process.env.AGENTRIA_WARDROBE_API_KEY ||
      process.env.AGENTRIA_API_KEY,
    nodeProxyUrl: process.env.AGENTRIA_NODE_PROXY_URL,
  };
}

export async function GET() {
  try {
    const { endpoint, apiKey, nodeProxyUrl } = getWardrobeApiConfig();
    if (!endpoint || !apiKey) {
      return Response.json(
        { message: '옷장 목록 조회 API 연결 정보가 설정되지 않았습니다.' },
        { status: 503 },
      );
    }

    // 저장과 조회가 통합된 동일한 Ability를 사용합니다.
    // Ability 쪽에서 Name이 비어 있으면 db_list만 실행하도록 분기해야 합니다.
    const params = { Name: '', category: '' };
    const raw = nodeProxyUrl
      ? await runWardrobeThroughNodeProxy(nodeProxyUrl, params)
      : await runWardrobeAbility(endpoint, apiKey, params);
    const result = normalizeWardrobeResult(raw);
    return Response.json({ data: result, source: 'agentria' });
  } catch (error) {
    console.error('Wardrobe list API error', error);
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : '옷장 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
      },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const input = await request.json() as { name?: unknown; category?: unknown };
    const name = asText(input.name);
    const category = asText(input.category);
    const allowedCategories = ['상의', '하의', '아우터', '신발', '액세서리'];

    if (!name || !allowedCategories.includes(category)) {
      return Response.json(
        { message: '옷 이름과 올바른 카테고리를 입력해 주세요.' },
        { status: 400 },
      );
    }

    const { endpoint, apiKey, nodeProxyUrl } = getWardrobeApiConfig();
    if (!endpoint || !apiKey) {
      return Response.json(
        { message: '옷장 API 연결 정보가 설정되지 않았습니다.' },
        { status: 503 },
      );
    }

    const params = {
      Name: name,
      category,
    };
    const raw = nodeProxyUrl
      ? await runWardrobeThroughNodeProxy(nodeProxyUrl, params)
      : await runWardrobeAbility(endpoint, apiKey, params);
    const result = normalizeWardrobeResult(raw);

    return Response.json({ data: result, source: 'agentria' });
  } catch (error) {
    console.error('Wardrobe API error', error);
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : '옷장에 저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
      },
      { status: 502 },
    );
  }
}
