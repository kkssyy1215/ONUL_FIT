import { resilientFetch } from '@/lib/resilient-fetch';

type WeatherKind = 'sun' | 'cloud' | 'rain' | 'snow' | 'storm' | 'fog';

const weatherMap: Record<number, { label: string; kind: WeatherKind }> = {
  0: { label: '맑아요', kind: 'sun' },
  1: { label: '대체로 맑아요', kind: 'sun' },
  2: { label: '구름이 조금 있어요', kind: 'cloud' },
  3: { label: '흐려요', kind: 'cloud' },
  45: { label: '안개가 있어요', kind: 'fog' },
  48: { label: '안개가 짙어요', kind: 'fog' },
  51: { label: '약한 이슬비가 와요', kind: 'rain' },
  53: { label: '이슬비가 와요', kind: 'rain' },
  55: { label: '강한 이슬비가 와요', kind: 'rain' },
  61: { label: '약한 비가 와요', kind: 'rain' },
  63: { label: '비가 와요', kind: 'rain' },
  65: { label: '강한 비가 와요', kind: 'rain' },
  71: { label: '약한 눈이 와요', kind: 'snow' },
  73: { label: '눈이 와요', kind: 'snow' },
  75: { label: '많은 눈이 와요', kind: 'snow' },
  80: { label: '한때 소나기가 와요', kind: 'rain' },
  81: { label: '소나기가 와요', kind: 'rain' },
  82: { label: '강한 소나기가 와요', kind: 'rain' },
  85: { label: '눈이 날려요', kind: 'snow' },
  86: { label: '강한 눈보라가 와요', kind: 'snow' },
  95: { label: '천둥번개가 있어요', kind: 'storm' },
  96: { label: '우박을 동반한 뇌우가 있어요', kind: 'storm' },
  99: { label: '강한 우박과 뇌우가 있어요', kind: 'storm' },
};

const knownLocations = [
  { aliases: ['서울', '서울시', '용산', '강남', '마포', '종로'], name: '서울', latitude: 37.5665, longitude: 126.978 },
  { aliases: ['부산', '부산시', '해운대'], name: '부산', latitude: 35.1796, longitude: 129.0756 },
  { aliases: ['인천', '인천시'], name: '인천', latitude: 37.4563, longitude: 126.7052 },
  { aliases: ['대구', '대구시'], name: '대구', latitude: 35.8714, longitude: 128.6014 },
  { aliases: ['광주', '광주시'], name: '광주', latitude: 35.1595, longitude: 126.8526 },
  { aliases: ['대전', '대전시'], name: '대전', latitude: 36.3504, longitude: 127.3845 },
  { aliases: ['울산', '울산시'], name: '울산', latitude: 35.5384, longitude: 129.3114 },
  { aliases: ['세종', '세종시'], name: '세종', latitude: 36.48, longitude: 127.289 },
  { aliases: ['제주', '제주시'], name: '제주', latitude: 33.4996, longitude: 126.5312 },
];

function describeWeather(code: number) {
  return weatherMap[code] ?? { label: '날씨를 확인했어요', kind: 'cloud' as WeatherKind };
}

function uvLevel(value: number) {
  if (value >= 8) return '매우 높음';
  if (value >= 6) return '높음';
  if (value >= 3) return '보통';
  return '낮음';
}

function formatHour(value: string, index: number) {
  if (index === 0) return '지금';
  return `${Number(value.slice(11, 13))}시`;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = (url.searchParams.get('location') || '서울').trim().slice(0, 80);
    const latParam = url.searchParams.get('lat');
    const lonParam = url.searchParams.get('lon');
    let latitude = latParam ? Number(latParam) : null;
    let longitude = lonParam ? Number(lonParam) : null;
    let displayName = query;

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      const known = knownLocations.find((place) => place.aliases.some((alias) => query.includes(alias)));
      if (known) {
        latitude = known.latitude;
        longitude = known.longitude;
        displayName = known.name;
      }
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      const geocodeUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
      geocodeUrl.searchParams.set('name', query);
      geocodeUrl.searchParams.set('count', '1');
      geocodeUrl.searchParams.set('language', 'ko');
      geocodeUrl.searchParams.set('format', 'json');

      const geocodeResponse = await resilientFetch(geocodeUrl, {}, { timeoutMs: 4_500 });
      if (!geocodeResponse.ok) throw new Error('지역 검색 서비스에 연결할 수 없습니다.');
      const geocode = await geocodeResponse.json() as { results?: Array<{ name: string; admin1?: string; latitude: number; longitude: number }> };
      const place = geocode.results?.[0];
      if (!place) return Response.json({ message: '입력한 지역을 찾지 못했어요.' }, { status: 404 });

      latitude = place.latitude;
      longitude = place.longitude;
      displayName = [place.admin1, place.name].filter(Boolean).join(' ');
    }

    const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
    forecastUrl.searchParams.set('latitude', String(latitude));
    forecastUrl.searchParams.set('longitude', String(longitude));
    forecastUrl.searchParams.set('timezone', 'Asia/Seoul');
    forecastUrl.searchParams.set('forecast_days', '2');
    forecastUrl.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m');
    forecastUrl.searchParams.set('hourly', 'temperature_2m,precipitation_probability,weather_code');
    forecastUrl.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max');

    const forecastResponse = await resilientFetch(forecastUrl, {}, { timeoutMs: 5_500 });
    if (!forecastResponse.ok) throw new Error('날씨 서비스에 연결할 수 없습니다.');
    const forecast = await forecastResponse.json() as {
      current: { time: string; temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; precipitation: number; weather_code: number; wind_speed_10m: number };
      hourly: { time: string[]; temperature_2m: number[]; precipitation_probability: number[]; weather_code: number[] };
      daily: { temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[]; uv_index_max: number[] };
    };

    const currentIndex = Math.max(0, forecast.hourly.time.findIndex((time) => time >= forecast.current.time));
    const currentDescription = describeWeather(forecast.current.weather_code);
    const hourly = forecast.hourly.time.slice(currentIndex, currentIndex + 6).map((time, index) => {
      const sourceIndex = currentIndex + index;
      const description = describeWeather(forecast.hourly.weather_code[sourceIndex]);
      return {
        time: formatHour(time, index),
        kind: description.kind,
        label: description.label,
        temperature: Math.round(forecast.hourly.temperature_2m[sourceIndex]),
        precipitationProbability: forecast.hourly.precipitation_probability[sourceIndex] ?? 0,
      };
    });

    return Response.json({
      location: displayName,
      coordinates: { latitude, longitude },
      updatedAt: new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' }).format(new Date()),
      current: {
        temperature: Math.round(forecast.current.temperature_2m),
        apparentTemperature: Math.round(forecast.current.apparent_temperature),
        humidity: Math.round(forecast.current.relative_humidity_2m),
        precipitation: forecast.current.precipitation,
        precipitationProbability: forecast.daily.precipitation_probability_max[0] ?? 0,
        windSpeed: Number(forecast.current.wind_speed_10m.toFixed(1)),
        weatherCode: forecast.current.weather_code,
        label: currentDescription.label,
        kind: currentDescription.kind,
        uvIndex: Number((forecast.daily.uv_index_max[0] ?? 0).toFixed(1)),
        uvLabel: uvLevel(forecast.daily.uv_index_max[0] ?? 0),
      },
      daily: {
        maxTemperature: Math.round(forecast.daily.temperature_2m_max[0]),
        minTemperature: Math.round(forecast.daily.temperature_2m_min[0]),
      },
      hourly,
      source: 'Open-Meteo',
    }, { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=300' } });
  } catch (error) {
    console.error('Weather API error', error);
    return Response.json({ message: '날씨 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' }, { status: 502 });
  }
}
