import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const host = '127.0.0.1';
const port = Number(process.env.AGENTRIA_PROXY_PORT || 3101);
const envPath = resolve(process.cwd(), '.env.local');

function loadLocalEnv() {
  let contents = '';
  try {
    contents = readFileSync(envPath, 'utf8');
  } catch {
    return;
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[name]) process.env[name] = value;
  }
}

function parseResponse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function getRequestId(value) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (!value || typeof value !== 'object') return null;
  for (const key of ['request_id', 'requestId', 'transaction_id', 'transactionId']) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function runAgentria(params, ability = 'main') {
  const isWardrobe = ability === 'wardrobe';
  const endpoint = isWardrobe
    ? process.env.AGENTRIA_WARDROBE_API_URL
    : process.env.AGENTRIA_API_URL;
  const apiKey = isWardrobe
    ? process.env.AGENTRIA_WARDROBE_API_KEY || process.env.AGENTRIA_API_KEY
    : process.env.AGENTRIA_API_KEY;
  if (!endpoint || !apiKey) throw new Error('Agentria API 환경 변수가 설정되지 않았습니다.');

  const form = new FormData();
  form.append('params_json', JSON.stringify(params));
  const headers = { 'X-API-KEY': apiKey };
  const runResponse = await fetch(endpoint, { method: 'POST', headers, body: form });
  const runText = await runResponse.text();
  if (!runResponse.ok) {
    throw new Error(`Agentria API error ${runResponse.status}: ${runText.slice(0, 240)}`);
  }

  const runBody = parseResponse(runText);
  const requestId = getRequestId(runBody);
  if (!requestId) return runBody;

  const statusEndpoint = endpoint.replace(/\/+$/, '');
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const statusResponse = await fetch(
      `${statusEndpoint}/${encodeURIComponent(requestId)}/status`,
      { headers },
    );
    const statusText = await statusResponse.text();
    if (!statusResponse.ok) {
      // A newly created asynchronous request can take a moment to become
      // visible to the status endpoint. Treat that short 404 window as pending.
      if (statusResponse.status === 404) {
        await delay(1_000);
        continue;
      }
      throw new Error(`Agentria status error ${statusResponse.status}: ${statusText.slice(0, 240)}`);
    }

    const statusBody = parseResponse(statusText);
    const status = typeof statusBody?.status === 'string'
      ? statusBody.status.toUpperCase()
      : '';
    if (['COMPLETED', 'SUCCESS', 'SUCCEEDED'].includes(status)) {
      return statusBody.results ?? statusBody.result ?? statusBody;
    }
    if (['FAILURE', 'FAILED', 'CANCELED'].includes(status)) {
      throw new Error(statusBody.failure_reason || statusBody.message || `Agentria execution ${status}`);
    }
    await delay(1_000);
  }

  throw new Error('Agentria 응답 대기 시간이 초과되었습니다.');
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 5_000_000) throw new Error('요청 본문이 너무 큽니다.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

loadLocalEnv();

const server = createServer(async (request, response) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (request.method === 'GET' && request.url === '/health') {
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.method !== 'POST' || request.url !== '/run') {
    response.statusCode = 404;
    response.end(JSON.stringify({ message: 'Not found' }));
    return;
  }

  try {
    const body = await readJsonBody(request);
    const ability = body.ability === 'wardrobe' ? 'wardrobe' : 'main';
    const result = await runAgentria(body.params ?? {}, ability);
    response.end(JSON.stringify(result));
  } catch (error) {
    console.error('Agentria proxy error', error);
    response.statusCode = 502;
    response.end(JSON.stringify({
      message: error instanceof Error ? error.message : '추천 요청에 실패했습니다.',
    }));
  }
});

server.listen(port, host, () => {
  console.log(`Agentria Node proxy: http://${host}:${port}`);
});
