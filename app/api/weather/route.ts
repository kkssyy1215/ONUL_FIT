import { resilientFetch } from '@/lib/resilient-fetch';

type WeatherKind = 'sun' | 'cloud' | 'rain' | 'snow' | 'storm' | 'fog';

type Location = {
  aliases: string[];
  name: string;
  latitude: number;
  longitude: number;
  nx: number;
  ny: number;
};

type KstParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

type KmaPoint = {
  date: string;
  time: string;
  values: Record<string, string>;
};

const knownLocations: Location[] = [
  { aliases: ['서울', '서울시', '용산', '강남', '마포', '종로'], name: '서울', latitude: 37.5665, longitude: 126.978, nx: 60, ny: 127 },
  { aliases: ['부산', '부산시', '해운대'], name: '부산', latitude: 35.1796, longitude: 129.0756, nx: 98, ny: 76 },
  { aliases: ['인천', '인천시'], name: '인천', latitude: 37.4563, longitude: 126.7052, nx: 55, ny: 124 },
  { aliases: ['대구', '대구시'], name: '대구', latitude: 35.8714, longitude: 128.6014, nx: 89, ny: 90 },
  { aliases: ['광주', '광주시'], name: '광주', latitude: 35.1595, longitude: 126.8526, nx: 58, ny: 74 },
  { aliases: ['대전', '대전시'], name: '대전', latitude: 36.3504, longitude: 127.3845, nx: 67, ny: 100 },
  { aliases: ['울산', '울산시'], name: '울산', latitude: 35.5384, longitude: 129.3114, nx: 102, ny: 84 },
  { aliases: ['세종', '세종시'], name: '세종', latitude: 36.48, longitude: 127.289, nx: 66, ny: 103 },
  { aliases: ['제주', '제주시'], name: '제주', latitude: 33.4996, longitude: 126.5312, nx: 52, ny: 38 },
  { aliases: ['수원', '수원시'], name: '수원', latitude: 37.2636, longitude: 127.0286, nx: 60, ny: 121 },
  { aliases: ['성남', '성남시', '판교'], name: '성남', latitude: 37.4449, longitude: 127.1389, nx: 62, ny: 123 },
  { aliases: ['고양', '고양시', '일산'], name: '고양', latitude: 37.6584, longitude: 126.832, nx: 57, ny: 128 },
  { aliases: ['청주', '청주시'], name: '청주', latitude: 36.6424, longitude: 127.489, nx: 69, ny: 107 },
  { aliases: ['전주', '전주시'], name: '전주', latitude: 35.8242, longitude: 127.148, nx: 63, ny: 89 },
  { aliases: ['춘천', '춘천시'], name: '춘천', latitude: 37.8813, longitude: 127.7298, nx: 73, ny: 134 },
  { aliases: ['강릉', '강릉시'], name: '강릉', latitude: 37.7519, longitude: 128.8761, nx: 92, ny: 131 },
];

// 생활기상지수는 KMA 격자(nx, ny)가 아니라 행정구역번호(areaNo)를 사용합니다.
// 주요 도시 기준으로 조회하고, 현재 위치를 사용하는 경우 가장 가까운 도시의 광역 코드로 보완합니다.
const locationMetadata: Record<string, { uvAreaNo: string; warningStnId: string }> = {
  서울: { uvAreaNo: '1100000000', warningStnId: '108' },
  부산: { uvAreaNo: '2600000000', warningStnId: '159' },
  인천: { uvAreaNo: '2800000000', warningStnId: '112' },
  대구: { uvAreaNo: '2700000000', warningStnId: '143' },
  광주: { uvAreaNo: '2900000000', warningStnId: '156' },
  대전: { uvAreaNo: '3000000000', warningStnId: '133' },
  울산: { uvAreaNo: '3100000000', warningStnId: '152' },
  세종: { uvAreaNo: '3611000000', warningStnId: '133' },
  제주: { uvAreaNo: '5000000000', warningStnId: '184' },
  수원: { uvAreaNo: '4111000000', warningStnId: '119' },
  성남: { uvAreaNo: '4113000000', warningStnId: '119' },
  고양: { uvAreaNo: '4128000000', warningStnId: '119' },
  청주: { uvAreaNo: '4311000000', warningStnId: '131' },
  전주: { uvAreaNo: '4511000000', warningStnId: '146' },
  춘천: { uvAreaNo: '4211000000', warningStnId: '101' },
  강릉: { uvAreaNo: '4215000000', warningStnId: '105' },
};

// 기상특보 API는 stnId(지방기상청)가 관할하는 여러 시/도를 함께 반환합니다.
// 예: 서울(stnId 108)로 조회해도 강원도 특보가 섞여 옵니다.
// 조회한 도시가 속한 시/도명을 텍스트 매칭에 사용해 무관한 지역 특보를 걸러냅니다.
const locationProvince: Record<string, string> = {
  서울: '서울', 부산: '부산', 인천: '인천', 대구: '대구', 광주: '광주',
  대전: '대전', 울산: '울산', 세종: '세종', 제주: '제주',
  수원: '경기', 성남: '경기', 고양: '경기',
  청주: '충북', 전주: '전북', 춘천: '강원', 강릉: '강원',
};

function nearestKnownLocation(latitude: number, longitude: number) {
  return knownLocations.reduce((nearest, candidate) => {
    const nearestDistance = (nearest.latitude - latitude) ** 2 + (nearest.longitude - longitude) ** 2;
    const candidateDistance = (candidate.latitude - latitude) ** 2 + (candidate.longitude - longitude) ** 2;
    return candidateDistance < nearestDistance ? candidate : nearest;
  });
}

function getLocationMetadata(location: Location) {
  return locationMetadata[location.name] || locationMetadata[nearestKnownLocation(location.latitude, location.longitude).name] || locationMetadata.서울;
}

function getLocationProvince(location: Location) {
  const knownName = location.name in locationProvince
    ? location.name
    : nearestKnownLocation(location.latitude, location.longitude).name;
  return locationProvince[knownName] || locationProvince.서울;
}

function getKstParts(date = new Date()): KstParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

function dateText(parts: KstParts) {
  return `${parts.year}${String(parts.month).padStart(2, '0')}${String(parts.day).padStart(2, '0')}`;
}

function previousDate(parts: KstParts): KstParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - 86_400_000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: 0,
    minute: 0,
  };
}

function getLatestBaseTime(now: KstParts) {
  const releaseHours = [2, 5, 8, 11, 14, 17, 20, 23];
  const availableBefore = now.hour * 60 + now.minute - 20;
  const baseHour = releaseHours.filter((hour) => hour * 60 <= availableBefore).pop();

  if (baseHour !== undefined) {
    return { baseDate: dateText(now), baseTime: `${String(baseHour).padStart(2, '0')}00` };
  }

  const yesterday = previousDate(now);
  return { baseDate: dateText(yesterday), baseTime: '2300' };
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  // KMA uses negative sentinel values such as -999/-998 when a value is
  // unavailable. They must not leak into the UI as real temperatures or
  // percentages.
  return Number.isFinite(parsed) && parsed > -900 ? parsed : fallback;
}

function parsePrecipitation(value: unknown) {
  const raw = String(value ?? '');
  if (/-99[89]/.test(raw)) return 0;
  const numbers = raw.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  return numbers.length > 0 ? Math.max(...numbers) : 0;
}

function isUsableWeatherValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > -900;
}

function toWeatherDescription(pty: number, sky: number) {
  if (pty === 1) return { label: '비가 와요', kind: 'rain' as WeatherKind, weatherCode: 61 };
  if (pty === 2) return { label: '비와 눈이 섞여 와요', kind: 'snow' as WeatherKind, weatherCode: 68 };
  if (pty === 3) return { label: '눈이 와요', kind: 'snow' as WeatherKind, weatherCode: 71 };
  if (pty === 4) return { label: '소나기가 와요', kind: 'rain' as WeatherKind, weatherCode: 80 };
  if (sky === 1) return { label: '맑아요', kind: 'sun' as WeatherKind, weatherCode: 0 };
  if (sky === 2) return { label: '구름이 조금 있어요', kind: 'cloud' as WeatherKind, weatherCode: 2 };
  if (sky === 3) return { label: '구름이 많아요', kind: 'cloud' as WeatherKind, weatherCode: 3 };
  return { label: '흐려요', kind: 'cloud' as WeatherKind, weatherCode: 3 };
}

function estimateApparentTemperature(temperature: number, humidity: number, windSpeedMs: number) {
  // 단기예보에는 체감온도 항목이 없으므로 습도·풍속을 이용해 근사합니다.
  // 바람이 강한 추운 날에는 wind-chill, 그 외에는 Steadman 근사를 사용합니다.
  const windKmh = Math.max(0, windSpeedMs) * 3.6;
  if (temperature <= 10 && windKmh >= 4.8) {
    return 13.12 + 0.6215 * temperature - 11.37 * windKmh ** 0.16 + 0.3965 * temperature * windKmh ** 0.16;
  }

  const vaporPressure = (Math.max(0, Math.min(100, humidity)) / 100) * 6.105 * Math.exp((17.27 * temperature) / (237.7 + temperature));
  return temperature + 0.33 * vaporPressure - 0.7 * windKmh - 4;
}

function toKmaGrid(latitude: number, longitude: number) {
  const DEGRAD = Math.PI / 180;
  const RE = 6371.00877;
  const GRID = 5;
  const SLAT1 = 30;
  const SLAT2 = 60;
  const OLON = 126;
  const OLAT = 38;
  const XO = 43;
  const YO = 136;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;
  const sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) /
    Math.log(Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5));
  // KMA's Lambert conformal conic formula includes the standard-parallel
  // correction in `sf`. Omitting the cosine/slope correction sends GPS
  // coordinates to invalid grids such as ny=498.
  const sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5) ** sn * Math.cos(slat1) / sn;
  const ro = re * sf / Math.tan(Math.PI * 0.25 + olat * 0.5) ** sn;
  const ra = re * sf / Math.tan(Math.PI * 0.25 + latitude * DEGRAD * 0.5) ** sn;
  const theta = longitude * DEGRAD - olon;
  const adjustedTheta = Math.abs(theta) > Math.PI ? (theta < 0 ? theta + 2 * Math.PI : theta - 2 * Math.PI) : theta;

  return {
    nx: Math.floor(ra * Math.sin(sn * adjustedTheta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(sn * adjustedTheta) + YO + 0.5),
  };
}

function normalizeServiceKey(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function fetchKmaJson(url: URL, label: string) {
  const response = await resilientFetch(url, {}, { timeoutMs: 7_000, retries: 1 });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`KMA ${label} error ${response.status}: ${responseText.slice(0, 240)}`);

  const payload = JSON.parse(responseText) as {
    response?: { header?: { resultCode?: string; resultMsg?: string } };
    OpenAPI_ServiceResponse?: {
      cmmMsgHeader?: {
        errMsg?: string;
        returnReasonCode?: string;
        returnAuthMsg?: string;
      };
    };
  };
  const resultCode = payload.response?.header?.resultCode;
  if (resultCode && resultCode !== '00' && resultCode !== '0') {
    throw new Error(`KMA ${label} ${resultCode}: ${payload.response?.header?.resultMsg || '요청 실패'}`);
  }

  // 일부 기상청 서비스는 HTTP 200으로도 인증키 오류를 반환합니다.
  // 이 응답을 정상 데이터로 처리하면 화면에는 UV 0처럼 보이므로 원인을 로그에 남깁니다.
  const serviceError = payload.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (serviceError?.returnReasonCode) {
    throw new Error(
      `KMA ${label} ${serviceError.returnReasonCode}: ${serviceError.errMsg || serviceError.returnAuthMsg || '요청 실패'}`,
    );
  }

  return payload;
}

function getKmaItems(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as { response?: { body?: { items?: { item?: unknown } } } };
  const rawItems = root.response?.body?.items?.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  return items.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'));
}

function getUvLabel(value: number) {
  if (value >= 11) return '위험';
  if (value >= 8) return '매우 높음';
  if (value >= 6) return '높음';
  if (value >= 3) return '보통';
  return '낮음';
}

function getUvRequestTime(now: KstParts) {
  // 생활기상지수 V5의 time은 예보 발표시각(YYYYMMDDHH)입니다.
  return `${dateText(now)}${String(now.hour).padStart(2, '0')}`;
}

async function fetchUvIndex(serviceKey: string, location: Location, now: KstParts) {
  const url = new URL('https://apis.data.go.kr/1360000/LivingWthrIdxServiceV5/getUVIdxV5');
  const { uvAreaNo } = getLocationMetadata(location);
  url.searchParams.set('serviceKey', normalizeServiceKey(serviceKey));
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '10');
  url.searchParams.set('dataType', 'JSON');
  url.searchParams.set('areaNo', uvAreaNo);
  url.searchParams.set('time', getUvRequestTime(now));

  const payload = await fetchKmaJson(url, '생활기상지수');
  const item = getKmaItems(payload)[0];
  if (!item) throw new Error('자외선 지수 데이터가 비어 있습니다.');

  // V5는 발표시각부터 3시간 단위의 h0, h3, h6 ... 값을 제공합니다.
  // 현재값은 발표시각 기준 h0로 사용하고, 값이 없으면 today를 보완합니다.
  const rawValue = item.h0 ?? item.today;
  const uvIndex = toNumber(rawValue, 0);
  return { uvIndex, uvLabel: getUvLabel(uvIndex) };
}

const alertKeywords = [
  ['호우', 'heavy_rain'],
  ['폭염', 'heat_wave'],
  ['한파', 'cold_wave'],
  ['대설', 'heavy_snow'],
  ['강풍', 'strong_wind'],
  ['풍랑', 'high_waves'],
  ['태풍', 'typhoon'],
  ['건조', 'dryness'],
  ['안개', 'fog'],
  ['황사', 'yellow_dust'],
  ['폭풍해일', 'storm_surge'],
  ['지진해일', 'tsunami'],
] as const;

function getAnnounceTime(item: Record<string, unknown>) {
  return Number(item.tmFc ?? item.t5 ?? 0);
}

function parseWeatherAlert(items: Record<string, unknown>[], province: string) {
  // 기상특보 통보문 API는 조회 기간 내 발표된 모든 통보문(발표/해제/연장/변경)을
  // 이력으로 반환합니다. 특보 종류별 "현재 상태"를 알려면 가장 최근 통보문만
  // 봐야 하므로, 발표시각(tmFc) 내림차순으로 정렬한 뒤 종류별 최신 1건만 채택합니다.
  const sorted = [...items].sort((a, b) => getAnnounceTime(b) - getAnnounceTime(a));

  const seenFlags = new Set<string>();
  const active: { title: string; flag: string }[] = [];

  for (const item of sorted) {
    const text = Object.values(item)
      .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
      .join(' ');
    if (!text) continue;

    const keyword = alertKeywords.find(([label]) => text.includes(label));
    if (!keyword || !/(주의보|경보|특보|예비특보)/.test(text)) continue;

    // stnId(지방기상청)는 여러 시/도를 함께 반환하므로, 조회 중인 지역과
    // 무관한 시/도의 통보문은 먼저 걸러냅니다. 이 필터를 "종류별 최신 1건"
    // 판단보다 먼저 적용해야 합니다 — 그렇지 않으면 무관한 지역의 통보문이
    // 먼저 seenFlags를 채워버려, 정작 우리 지역의 발표/해제 이력은
    // 확인조차 못 하고 건너뛰게 됩니다.
    if (!text.includes(province)) continue;

    // 같은 지역·같은 특보 종류는 발표시각(tmFc) 기준 가장 최근 통보문만
    // "현재 상태"로 채택합니다.
    if (seenFlags.has(keyword[1])) continue;
    seenFlags.add(keyword[1]);

    // 가장 최근 통보문이 해제/취소/종료라면 이 특보는 이제 비활성 상태입니다.
    if (/(해제|취소|종료)/.test(text)) continue;

    const level = text.includes('경보') ? '경보' : text.includes('주의보') ? '주의보' : '특보';
    const title = typeof item.title === 'string' ? item.title : `${keyword[0]} ${level}`;
    active.push({ title, flag: keyword[1] });
  }

  if (active.length === 0) return { weatherAlert: '', alertFlags: [] as string[], officialAlert: false };

  return {
    weatherAlert: active.map((value) => value.title).join(', '),
    alertFlags: active.map((value) => value.flag),
    officialAlert: true,
  };
}

async function fetchWeatherAlert(serviceKey: string, location: Location, now: KstParts) {
  const url = new URL('https://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnMsg');
  const { warningStnId } = getLocationMetadata(location);
  const twoDaysAgo = previousDate(previousDate(now));
  url.searchParams.set('serviceKey', normalizeServiceKey(serviceKey));
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '100');
  url.searchParams.set('dataType', 'JSON');
  url.searchParams.set('stnId', warningStnId);
  url.searchParams.set('fromTmFc', dateText(twoDaysAgo));
  url.searchParams.set('toTmFc', dateText(now));

  const payload = await fetchKmaJson(url, '기상특보');
  return parseWeatherAlert(getKmaItems(payload), getLocationProvince(location));
}

function collectPoints(payload: unknown): KmaPoint[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as { response?: { body?: { items?: { item?: unknown } } } };
  const rawItems = root.response?.body?.items?.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const pointMap = new Map<string, KmaPoint>();

  for (const rawItem of items) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const item = rawItem as Record<string, unknown>;
    const date = String(item.fcstDate || '');
    const time = String(item.fcstTime || '').padStart(4, '0');
    const category = String(item.category || '');
    if (!date || !time || !category) continue;

    const key = `${date}${time}`;
    const point = pointMap.get(key) || { date, time, values: {} };
    point.values[category] = String(item.fcstValue ?? '');
    pointMap.set(key, point);
  }

  return Array.from(pointMap.values()).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
}

function selectPoint(points: KmaPoint[], now: KstParts) {
  const nowKey = `${dateText(now)}${String(now.hour).padStart(2, '0')}${String(now.minute).padStart(2, '0')}`;
  const index = points.findIndex((point) => `${point.date}${point.time}` >= nowKey);
  return { point: points[index >= 0 ? index : 0], index: index >= 0 ? index : 0 };
}

function getDailyTemperature(points: KmaPoint[], category: 'TMX' | 'TMN', fallback: number) {
  const value = points.find((point) => point.values[category] && point.values[category] !== '-')?.values[category];
  return value === undefined ? fallback : toNumber(value, fallback);
}

export async function GET(request: Request) {
  try {
    // 서비스별 키를 우선 사용하고, 기존 단일 키 설정도 임시로 지원합니다.
    const fallbackServiceKey = process.env.KMA_SERVICE_KEY;
    const forecastServiceKey = process.env.KMA_FORECAST_SERVICE_KEY || fallbackServiceKey;
    const uvServiceKey = process.env.KMA_UV_SERVICE_KEY || fallbackServiceKey || forecastServiceKey;
    const warningServiceKey = process.env.KMA_WARNING_SERVICE_KEY || fallbackServiceKey || forecastServiceKey;
    if (!forecastServiceKey) {
      return Response.json({ message: 'KMA_FORECAST_SERVICE_KEY가 설정되지 않았어요.' }, { status: 500 });
    }

    const url = new URL(request.url);
    const query = (url.searchParams.get('location') || '서울').trim().slice(0, 80);
    const latitude = Number(url.searchParams.get('lat'));
    const longitude = Number(url.searchParams.get('lon'));
    const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
    const known = knownLocations.find((place) => place.aliases.some((alias) => query.includes(alias)));

    let location: Location | undefined = known;
    if (!location && hasCoordinates) {
      // The KMA grid is nationwide for South Korea, but coordinates outside
      // the Korean Peninsula cannot be mapped to a useful domestic forecast.
      if (latitude < 33 || latitude > 39.5 || longitude < 124 || longitude > 132) {
        return Response.json({
          message: '현재 위치가 기상청 국내 예보 범위 밖이에요. 국내 도시를 직접 입력해 주세요.',
        }, { status: 422 });
      }
      const grid = toKmaGrid(latitude, longitude);
      const nearest = nearestKnownLocation(latitude, longitude);
      location = {
        aliases: [],
        name: query === '현재 위치' ? `현재 위치 · ${nearest.name}` : (query || `현재 위치 · ${nearest.name}`),
        latitude,
        longitude,
        nx: grid.nx,
        ny: grid.ny,
      };
    }

    if (!location) {
      return Response.json({ message: '현재는 주요 도시 또는 현재 위치 좌표를 사용해 주세요.' }, { status: 400 });
    }

    const now = getKstParts();
    const base = getLatestBaseTime(now);
    const forecastUrl = new URL('https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst');
    forecastUrl.searchParams.set('serviceKey', normalizeServiceKey(forecastServiceKey));
    forecastUrl.searchParams.set('pageNo', '1');
    forecastUrl.searchParams.set('numOfRows', '1000');
    forecastUrl.searchParams.set('dataType', 'JSON');
    forecastUrl.searchParams.set('base_date', base.baseDate);
    forecastUrl.searchParams.set('base_time', base.baseTime);
    forecastUrl.searchParams.set('nx', String(location.nx));
    forecastUrl.searchParams.set('ny', String(location.ny));

    const payload = await fetchKmaJson(forecastUrl, '단기예보');

    const points = collectPoints(payload);
    if (points.length === 0) throw new Error('기상청 예보 데이터가 비어 있습니다.');

    const selected = selectPoint(points, now);
    const currentPoint = selected.point;
    const currentValues = currentPoint.values;
    if (!isUsableWeatherValue(currentValues.TMP)) {
      return Response.json({
        message: '현재 위치의 기상청 예보를 찾지 못했어요. 잠시 후 다시 시도하거나 국내 도시를 직접 입력해 주세요.',
      }, { status: 422 });
    }
    const currentTemperature = toNumber(currentValues.TMP);
    const currentHumidity = toNumber(currentValues.REH);
    const currentWindSpeed = toNumber(currentValues.WSD);
    const apparentTemperature = estimateApparentTemperature(currentTemperature, currentHumidity, currentWindSpeed);
    const description = toWeatherDescription(toNumber(currentValues.PTY), toNumber(currentValues.SKY));
    const todayPoints = points.filter((point) => point.date === dateText(now));
    const todayTemperatures = todayPoints
      .map((point) => toNumber(point.values.TMP, NaN))
      .filter(Number.isFinite);
    const maxTemperature = getDailyTemperature(todayPoints, 'TMX', Math.max(...todayTemperatures, currentTemperature));
    const minTemperature = getDailyTemperature(todayPoints, 'TMN', Math.min(...todayTemperatures, currentTemperature));
    const dailyPrecipitationProbability = Math.max(
      ...todayPoints.map((point) => toNumber(point.values.POP)),
      toNumber(currentValues.POP),
    );

    // 부가 API가 일시적으로 실패해도 기본 날씨 화면은 계속 표시합니다.
    const [uvResult, alertResult] = await Promise.allSettled([
      fetchUvIndex(uvServiceKey || forecastServiceKey, location, now),
      fetchWeatherAlert(warningServiceKey || forecastServiceKey, location, now),
    ]);
    const uv = uvResult.status === 'fulfilled'
      ? uvResult.value
      : { uvIndex: 0, uvLabel: '제공 안 됨' };
    const alert = alertResult.status === 'fulfilled'
      ? alertResult.value
      : { weatherAlert: '', alertFlags: [] as string[], officialAlert: false };

    if (uvResult.status === 'rejected') console.warn('KMA UV API fallback:', uvResult.reason);
    if (alertResult.status === 'rejected') console.warn('KMA warning API fallback:', alertResult.reason);

    const hourly = points.slice(selected.index, selected.index + 6).map((point, index) => {
      const pointDescription = toWeatherDescription(toNumber(point.values.PTY), toNumber(point.values.SKY));
      return {
        time: index === 0 ? '지금' : `${Number(point.time.slice(0, 2))}시`,
        kind: pointDescription.kind,
        label: pointDescription.label,
        temperature: Math.round(toNumber(point.values.TMP, currentTemperature)),
        precipitationProbability: toNumber(point.values.POP),
      };
    });

    return Response.json({
      location: location.name,
      coordinates: { latitude: location.latitude, longitude: location.longitude },
      updatedAt: `${String(now.hour).padStart(2, '0')}:${String(now.minute).padStart(2, '0')}`,
      current: {
        temperature: Math.round(currentTemperature),
        apparentTemperature: Math.round(apparentTemperature),
        humidity: Math.round(currentHumidity),
        precipitation: parsePrecipitation(currentValues.PCP),
        precipitationProbability: Math.round(toNumber(currentValues.POP, dailyPrecipitationProbability)),
        windSpeed: Number(currentWindSpeed.toFixed(1)),
        weatherCode: description.weatherCode,
        label: description.label,
        kind: description.kind,
        uvIndex: uv.uvIndex,
        uvLabel: uv.uvLabel,
      },
      daily: {
        maxTemperature: Math.round(maxTemperature),
        minTemperature: Math.round(minTemperature),
      },
      hourly,
      weatherAlert: alert.weatherAlert,
      alertFlags: alert.alertFlags,
      officialAlert: alert.officialAlert,
      source: '기상청 단기예보',
    }, { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=300' } });
  } catch (error) {
    console.error('KMA weather API error', error);
    return Response.json({ message: '기상청 날씨 정보를 불러오지 못했어요. API 키와 요청 지역을 확인해 주세요.' }, { status: 502 });
  }
}
