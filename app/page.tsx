'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  LocateFixed,
  MapPin,
  Plus,
  RefreshCw,
  Shirt,
  Snowflake,
  Sun,
  Umbrella,
  Wind,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

type WeatherKind = 'sun' | 'cloud' | 'rain' | 'snow' | 'storm' | 'fog';
type WeatherData = {
  location: string;
  coordinates: { latitude: number; longitude: number };
  updatedAt: string;
  current: {
    temperature: number;
    apparentTemperature: number;
    humidity: number;
    precipitation: number;
    precipitationProbability: number;
    windSpeed: number;
    weatherCode: number;
    label: string;
    kind: WeatherKind;
    uvIndex: number;
    uvLabel: string;
  };
  daily: { maxTemperature: number; minTemperature: number };
  hourly: Array<{ time: string; kind: WeatherKind; label: string; temperature: number; precipitationProbability: number }>;
  source: string;
};

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

type WardrobeItem = { id: string; name: string; category: string; color: string };
type FormSubmitEvent = { preventDefault: () => void };
type WeatherRequester = (query: string, coordinates?: { latitude: number; longitude: number }, overrides?: { gender?: 'female' | 'male'; style?: string; activity?: string; sensitivity?: string; wardrobe?: WardrobeItem[]; selectedItems?: string[] }) => Promise<WeatherData>;

type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: object) => Promise<unknown>;
    },
    options?: { signal?: AbortSignal },
  ) => void | Promise<void>;
};

const defaultWeather: WeatherData = {
  location: '서울',
  coordinates: { latitude: 37.5665, longitude: 126.978 },
  updatedAt: '--:--',
  current: {
    temperature: 21,
    apparentTemperature: 20,
    humidity: 68,
    precipitation: 0,
    precipitationProbability: 40,
    windSpeed: 3.2,
    weatherCode: 61,
    label: '날씨를 확인하고 있어요',
    kind: 'rain',
    uvIndex: 4,
    uvLabel: '보통',
  },
  daily: { maxTemperature: 24, minTemperature: 18 },
  hourly: [
    { time: '지금', kind: 'rain', label: '비', temperature: 21, precipitationProbability: 40 },
    { time: '11시', kind: 'rain', label: '비', temperature: 22, precipitationProbability: 60 },
    { time: '13시', kind: 'cloud', label: '흐림', temperature: 23, precipitationProbability: 30 },
    { time: '15시', kind: 'sun', label: '맑음', temperature: 24, precipitationProbability: 10 },
    { time: '18시', kind: 'cloud', label: '흐림', temperature: 21, precipitationProbability: 20 },
    { time: '21시', kind: 'cloud', label: '흐림', temperature: 19, precipitationProbability: 20 },
  ],
  source: 'Open-Meteo',
};

const defaultRecommendation: Recommendation = {
  headline: '날씨에 맞는 조합을 준비 중이에요',
  description: '기온과 강수 가능성, 저장한 취향과 옷장을 함께 확인하고 있어요.',
  notice: '외출 전에 최신 날씨를 한 번 더 확인하세요.',
  matchScore: 88,
  tags: ['미니멀', '출근', '간절기'],
  essentials: [
    { name: '접이식 우산', reason: '갑작스러운 비 대비', priority: 'required' },
    { name: '얇은 겉옷', reason: '실내외 온도 차 대비', priority: 'recommended' },
    { name: '작은 가방', reason: '준비물을 가볍게 보관', priority: 'recommended' },
  ],
  outfitItems: ['얇은 상의', '가벼운 아우터', '긴 바지', '스니커즈'],
};

const initialWardrobe: WardrobeItem[] = [
  { id: 'rain-jacket', name: '네이비 레인 재킷', category: '아우터', color: '#263951' },
  { id: 'cream-knit', name: '크림 코튼 니트', category: '상의', color: '#e8e2d3' },
  { id: 'charcoal-pants', name: '차콜 스트레이트 팬츠', category: '하의', color: '#4b4d50' },
  { id: 'white-sneakers', name: '화이트 스니커즈', category: '신발', color: '#f2f0ea' },
  { id: 'linen-shirt', name: '블루 린넨 셔츠', category: '상의', color: '#9db7ca' },
  { id: 'black-loafers', name: '블랙 로퍼', category: '신발', color: '#24272b' },
];

const styles = ['미니멀', '캐주얼', '오피스', '스트릿', '페미닌', '스포티'];
const itemColors: Record<string, string> = { '상의': '#9db7ca', '하의': '#53585f', '아우터': '#263951', '신발': '#e9e5da', '액세서리': '#cf8a64' };

const dateLabel = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Seoul',
}).format(new Date());

export default function Home() {
  const [weather, setWeather] = useState(defaultWeather);
  const [recommendation, setRecommendation] = useState(defaultRecommendation);
  const [locationInput, setLocationInput] = useState('서울');
  const [gender, setGender] = useState<'female' | 'male'>('female');
  const [style, setStyle] = useState('미니멀');
  const [activity, setActivity] = useState('출근');
  const [sensitivity, setSensitivity] = useState('보통');
  const [wardrobe, setWardrobe] = useState(initialWardrobe);
  const [selectedItems, setSelectedItems] = useState(initialWardrobe.slice(0, 4).map((item) => item.id));
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('상의');
  const [showAddItem, setShowAddItem] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('최신 날씨를 확인하고 있어요.');
  const [storageReady, setStorageReady] = useState(false);

  const requestRecommendation = useCallback(async (
    nextWeather: WeatherData,
    overrides?: { gender?: 'female' | 'male'; style?: string; activity?: string; sensitivity?: string; wardrobe?: WardrobeItem[]; selectedItems?: string[] },
  ) => {
    const nextWardrobe = overrides?.wardrobe ?? wardrobe;
    const nextSelected = overrides?.selectedItems ?? selectedItems;
    const response = await fetch('/api/recommend/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weather: nextWeather,
        profile: {
          gender: overrides?.gender ?? gender,
          style: overrides?.style ?? style,
          activity: overrides?.activity ?? activity,
          sensitivity: overrides?.sensitivity ?? sensitivity,
        },
        wardrobe: nextWardrobe.map((item) => ({ ...item, selected: nextSelected.includes(item.id) })),
      }),
    });
    if (!response.ok) throw new Error('추천을 불러오지 못했어요.');
    const result = await response.json() as { data: Recommendation };
    setRecommendation(result.data);
    return result.data;
  }, [activity, gender, sensitivity, selectedItems, style, wardrobe]);

  const requestWeather = useCallback(async (
    query: string,
    coordinates?: { latitude: number; longitude: number },
    overrides?: { gender?: 'female' | 'male'; style?: string; activity?: string; sensitivity?: string; wardrobe?: WardrobeItem[]; selectedItems?: string[] },
  ) => {
    setIsLoading(true);
    setMessage('날씨와 옷장을 함께 확인하고 있어요.');
    try {
      const params = new URLSearchParams({ location: query });
      if (coordinates) {
        params.set('lat', String(coordinates.latitude));
        params.set('lon', String(coordinates.longitude));
      }
      const response = await fetch(`/api/weather/?${params.toString()}`);
      const result = await response.json() as WeatherData & { message?: string };
      if (!response.ok) throw new Error(result.message || '날씨를 불러오지 못했어요.');
      setWeather(result);
      setLocationInput(result.location);
      await requestRecommendation(result, overrides);
      setMessage(`${result.location} 날씨로 추천을 업데이트했어요.`);
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [requestRecommendation]);

  const requestWeatherRef = useRef<WeatherRequester>(requestWeather);
  const recommendationRef = useRef(recommendation);

  useEffect(() => {
    requestWeatherRef.current = requestWeather;
    recommendationRef.current = recommendation;
  }, [recommendation, requestWeather]);

  useEffect(() => {
    const saved = window.localStorage.getItem('onul-fit-preferences');
    let nextGender: 'female' | 'male' = 'female';
    let nextStyle = '미니멀';
    let nextActivity = '출근';
    let nextSensitivity = '보통';
    let nextWardrobe = initialWardrobe;
    let nextSelected = initialWardrobe.slice(0, 4).map((item) => item.id);
    let nextLocation = '서울';

    if (saved) {
      try {
        const parsed = JSON.parse(saved) as {
          gender?: 'female' | 'male'; style?: string; activity?: string; sensitivity?: string;
          wardrobe?: WardrobeItem[]; selectedItems?: string[]; location?: string;
        };
        nextGender = parsed.gender ?? nextGender;
        nextStyle = parsed.style ?? nextStyle;
        nextActivity = parsed.activity ?? nextActivity;
        nextSensitivity = parsed.sensitivity ?? nextSensitivity;
        nextWardrobe = parsed.wardrobe ?? nextWardrobe;
        nextSelected = parsed.selectedItems ?? nextSelected;
        nextLocation = parsed.location ?? nextLocation;
        queueMicrotask(() => {
          setGender(nextGender);
          setStyle(nextStyle);
          setActivity(nextActivity);
          setSensitivity(nextSensitivity);
          setWardrobe(nextWardrobe);
          setSelectedItems(nextSelected);
          setLocationInput(nextLocation);
        });
      } catch {
        window.localStorage.removeItem('onul-fit-preferences');
      }
    }

    queueMicrotask(() => setStorageReady(true));
    void requestWeatherRef.current(nextLocation, undefined, {
      gender: nextGender, style: nextStyle, activity: nextActivity, sensitivity: nextSensitivity,
      wardrobe: nextWardrobe, selectedItems: nextSelected,
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem('onul-fit-preferences', JSON.stringify({
      gender, style, activity, sensitivity, wardrobe, selectedItems, location: weather.location,
    }));
  }, [storageReady, gender, style, activity, sensitivity, wardrobe, selectedItems, weather.location]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();

    void Promise.resolve(context.registerTool({
      name: 'refresh_today_fit',
      title: '오늘핏 추천 새로 받기',
      description: '지역을 지정해 최신 날씨와 현재 사용자 취향으로 오늘의 준비물과 옷차림 추천을 갱신합니다.',
      inputSchema: {
        type: 'object',
        properties: { location: { type: 'string', description: '날씨를 확인할 한국의 도시 또는 동네 이름' } },
        required: ['location'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input) {
        const value = input as { location?: unknown };
        if (typeof value.location !== 'string' || !value.location.trim()) throw new Error('location은 비어 있지 않은 문자열이어야 합니다.');
        const result = await requestWeatherRef.current(value.location.trim());
        return { location: result.location, temperature: result.current.temperature, recommendation: recommendationRef.current.headline };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);

    return () => lifecycle.abort();
  }, [gender, style, activity, sensitivity, wardrobe, selectedItems]);

  async function updateLocation(event: FormSubmitEvent) {
    event.preventDefault();
    const nextLocation = locationInput.trim();
    if (!nextLocation) return;
    await requestWeather(nextLocation).catch(() => undefined);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage('이 브라우저에서는 현재 위치를 사용할 수 없어요.');
      return;
    }
    setMessage('현재 위치를 확인하고 있어요.');
    navigator.geolocation.getCurrentPosition(
      (position) => void requestWeather('현재 위치', { latitude: position.coords.latitude, longitude: position.coords.longitude }).catch(() => undefined),
      () => setMessage('위치 권한을 확인하거나 지역을 직접 입력해 주세요.'),
      { enableHighAccuracy: false, timeout: 7_000, maximumAge: 600_000 },
    );
  }

  function toggleWardrobe(id: string) {
    setSelectedItems((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function addWardrobeItem(event: FormSubmitEvent) {
    event.preventDefault();
    const name = newItemName.trim();
    if (!name) return;
    const id = `item-${Date.now()}`;
    setWardrobe((current) => [...current, { id, name, category: newItemCategory, color: itemColors[newItemCategory] }]);
    setSelectedItems((current) => [...current, id]);
    setNewItemName('');
    setShowAddItem(false);
    setMessage(`${name}을(를) 내 옷장에 추가했어요.`);
  }

  async function refreshRecommendation() {
    setIsLoading(true);
    setMessage('저장한 취향으로 추천을 다시 만들고 있어요.');
    try {
      await requestRecommendation(weather);
      setMessage('내 취향과 옷장을 반영했어요.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '추천을 다시 만들지 못했어요.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className={`onul-app ${isLoading ? 'is-loading' : ''}`}>
      <header className="app-header">
        <a className="brand" href="#top" aria-label="오늘핏 홈">
          <span className="brand-word">ONUL</span>
          <span className="brand-mark"><i /><i /><i /></span>
          <span className="brand-word accent">FIT</span>
        </a>
        <nav className="main-nav" aria-label="주요 메뉴">
          <a className="active" href="#today">오늘</a>
          <a href="#wardrobe">내 옷장</a>
          <a href="#profile">내 취향</a>
        </nav>
        <div className="header-profile">
          <span className="sync-dot" />
          <span className="sync-label">{isLoading ? '업데이트 중' : '설정 저장됨'}</span>
          <span className="avatar">OF</span>
        </div>
      </header>

      <div className="page-shell" id="top">
        <section className="page-intro">
          <div>
            <p className="date-label">{dateLabel}</p>
            <h1>오늘, 이렇게 나가세요.</h1>
          </div>
          <form className="location-search" onSubmit={updateLocation}>
            <MapPin aria-hidden="true" />
            <Input aria-label="날씨를 확인할 지역" value={locationInput} onChange={(event) => setLocationInput(event.target.value)} placeholder="동네나 도시를 입력하세요" />
            <Button type="submit" disabled={isLoading}>{isLoading ? '확인 중' : '날씨 보기'}</Button>
            <button className="locate-button" type="button" onClick={useCurrentLocation} aria-label="현재 위치 사용"><LocateFixed /></button>
          </form>
        </section>

        <output className="status-line" aria-live="polite"><span className="status-pulse" />{message}</output>

        <section className="dashboard-grid" id="today">
          <article className="weather-card">
            <div className="card-topline">
              <span><MapPin /> {weather.location}</span>
              <span>{weather.updatedAt} 기준 · {weather.source}</span>
            </div>
            <div className="weather-main">
              <div>
                <div className="weather-state"><WeatherIcon type={weather.current.kind} /> {weather.current.label}</div>
                <div className="temperature">{weather.current.temperature}<span>°</span></div>
                <p>체감 {weather.current.apparentTemperature}° · 최고 {weather.daily.maxTemperature}° / 최저 {weather.daily.minTemperature}°</p>
              </div>
              <div className="weather-disc" aria-hidden="true">
                <WeatherIcon type={weather.current.kind} />
                {(weather.current.kind === 'rain' || weather.current.kind === 'storm') && <><span className="rain-line line-one" /><span className="rain-line line-two" /><span className="rain-line line-three" /></>}
              </div>
            </div>
            <div className="weather-metrics">
              <div><Droplets /><span>강수 확률<strong>{weather.current.precipitationProbability}%</strong></span></div>
              <div><Wind /><span>바람<strong>{weather.current.windSpeed} m/s</strong></span></div>
              <div><Sun /><span>자외선<strong>{weather.current.uvLabel}</strong></span></div>
            </div>
            <div className="weather-note"><EssentialIcon name={recommendation.essentials[0]?.name ?? ''} /><p><strong>{recommendation.essentials[0]?.name ?? '외출 준비'}을(를) 확인하세요.</strong><span>{recommendation.notice}</span></p></div>
          </article>

          <article className="outfit-card">
            <div className="outfit-image-wrap">
              <Image src="/outfit-rainy-day.jpg" width={1000} height={1000} priority alt="네이비 재킷, 크림 니트, 차콜 팬츠와 우산으로 구성한 옷장 예시" />
              <span className="image-label">WARDROBE EDIT</span>
              <span className="match-badge">{recommendation.matchScore}% 맞춤</span>
            </div>
            <div className="outfit-copy">
              <div className="section-kicker">오늘의 조합</div>
              <h2>{recommendation.headline}</h2>
              <p>{recommendation.description}</p>
              <ul className="outfit-item-list">{recommendation.outfitItems.map((item) => <li key={item}>{item}</li>)}</ul>
              <div className="outfit-tags">{recommendation.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              <button className="text-link" type="button" onClick={refreshRecommendation} disabled={isLoading}>다른 조합 보기 <ArrowRight /></button>
            </div>
          </article>

          <article className="hourly-card">
            <div className="section-heading">
              <div><span className="section-kicker">시간대별</span><h2>오늘의 기온과 강수 가능성</h2></div>
              <span className="subtle-label">{weather.location} 기준</span>
            </div>
            <div className="hourly-list">
              {weather.hourly.map((item) => (
                <div className="hour-item" key={`${item.time}-${item.temperature}`}>
                  <span className="hour-time">{item.time}</span><WeatherIcon type={item.kind} /><strong>{item.temperature}°</strong><span className="rain-chance">{item.precipitationProbability}%</span>
                </div>
              ))}
            </div>
          </article>

          <article className="essentials-card">
            <div className="section-heading compact"><div><span className="section-kicker">외출 준비</span><h2>오늘 챙길 것</h2></div><span className="count-label">{recommendation.essentials.length}</span></div>
            <div className="essential-list">
              {recommendation.essentials.map((item) => (
                <div className={item.priority === 'required' ? 'essential-item required' : 'essential-item'} key={item.name}>
                  <span className="essential-icon"><EssentialIcon name={item.name} /></span><p><strong>{item.name}</strong><small>{item.reason}</small></p>{item.priority === 'required' ? <span>필수</span> : <Check />}
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="settings-grid">
          <article className="profile-card" id="profile">
            <div className="section-heading"><div><span className="section-kicker">내 취향</span><h2>추천 기준</h2></div><span className="saved-label"><Check /> 자동 저장</span></div>
            <div className="preference-row">
              <span className="preference-label">성별</span>
              <RadioGroup className="choice-group" value={gender} onValueChange={(value) => setGender(value as 'female' | 'male')}>
                <label htmlFor="gender-female" className={gender === 'female' ? 'radio-choice selected' : 'radio-choice'}><RadioGroupItem id="gender-female" value="female" /><span>여성</span></label>
                <label htmlFor="gender-male" className={gender === 'male' ? 'radio-choice selected' : 'radio-choice'}><RadioGroupItem id="gender-male" value="male" /><span>남성</span></label>
              </RadioGroup>
            </div>
            <div className="preference-row stacked">
              <span className="preference-label">즐겨 입는 스타일</span>
              <RadioGroup className="style-options" value={style} onValueChange={(value) => setStyle(value as string)}>
                {styles.map((item) => <label htmlFor={`style-${item}`} key={item} className={style === item ? 'style-choice selected' : 'style-choice'}><RadioGroupItem id={`style-${item}`} value={item} /><span>{item}</span></label>)}
              </RadioGroup>
            </div>
            <div className="preference-row two-settings">
              <div className="setting-field"><label className="preference-label" htmlFor="activity">외출 목적</label><NativeSelect id="activity" value={activity} onChange={(event) => setActivity(event.target.value)}><NativeSelectOption value="출근">출근</NativeSelectOption><NativeSelectOption value="등교">등교</NativeSelectOption><NativeSelectOption value="데이트">데이트</NativeSelectOption><NativeSelectOption value="운동">운동</NativeSelectOption><NativeSelectOption value="여행">여행</NativeSelectOption></NativeSelect></div>
              <div className="setting-field"><label className="preference-label" htmlFor="sensitivity">추위 민감도</label><NativeSelect id="sensitivity" value={sensitivity} onChange={(event) => setSensitivity(event.target.value)}><NativeSelectOption value="더위를 많이 탐">더위를 많이 탐</NativeSelectOption><NativeSelectOption value="보통">보통</NativeSelectOption><NativeSelectOption value="추위를 많이 탐">추위를 많이 탐</NativeSelectOption></NativeSelect></div>
            </div>
            <div className="profile-summary"><Shirt /><p><strong>{style} 스타일을 중심으로 추천해요.</strong><span>{activity}할 때 편하고 자연스러운 조합을 우선합니다.</span></p></div>
          </article>

          <article className="wardrobe-card" id="wardrobe">
            <div className="section-heading"><div><span className="section-kicker">내 옷장</span><h2>추천에 사용할 옷</h2></div><Button variant="outline" size="sm" onClick={() => setShowAddItem((current) => !current)}><Plus /> 옷 추가</Button></div>
            {showAddItem && <form className="add-item-form" onSubmit={addWardrobeItem}><Input value={newItemName} onChange={(event) => setNewItemName(event.target.value)} placeholder="예: 그레이 후드 집업" aria-label="추가할 옷 이름" /><NativeSelect aria-label="추가할 옷 카테고리" value={newItemCategory} onChange={(event) => setNewItemCategory(event.target.value)}><NativeSelectOption value="상의">상의</NativeSelectOption><NativeSelectOption value="하의">하의</NativeSelectOption><NativeSelectOption value="아우터">아우터</NativeSelectOption><NativeSelectOption value="신발">신발</NativeSelectOption><NativeSelectOption value="액세서리">액세서리</NativeSelectOption></NativeSelect><Button type="submit">등록</Button></form>}
            <div className="wardrobe-list">
              {wardrobe.map((item) => {
                const selected = selectedItems.includes(item.id);
                return <button key={item.id} type="button" className={selected ? 'wardrobe-item selected' : 'wardrobe-item'} onClick={() => toggleWardrobe(item.id)} aria-pressed={selected}><span className="item-color" style={{ backgroundColor: item.color }} /><span><strong>{item.name}</strong><small>{item.category}</small></span><span className="item-check">{selected && <Check />}</span></button>;
              })}
            </div>
            <div className="wardrobe-footer"><span>{selectedItems.length}벌을 추천에 사용 중</span><Button onClick={refreshRecommendation} disabled={isLoading}><RefreshCw /> {isLoading ? '추천 만드는 중' : '추천 새로 받기'}</Button></div>
          </article>
        </section>

        <footer className="app-footer"><span>날씨 데이터: Open-Meteo</span><span>기상특보가 있는 날에는 공식 안내를 함께 확인하세요.</span></footer>
      </div>
    </main>
  );
}

function WeatherIcon({ type }: { type: WeatherKind }) {
  if (type === 'sun') return <Sun className="hour-icon sun" aria-label="맑음" />;
  if (type === 'rain') return <CloudRain className="hour-icon rain" aria-label="비" />;
  if (type === 'snow') return <CloudSnow className="hour-icon snow" aria-label="눈" />;
  if (type === 'storm') return <CloudLightning className="hour-icon storm" aria-label="뇌우" />;
  if (type === 'fog') return <CloudFog className="hour-icon cloud" aria-label="안개" />;
  return <CloudSun className="hour-icon cloud" aria-label="흐림" />;
}

function EssentialIcon({ name }: { name: string }) {
  if (name.includes('우산')) return <Umbrella />;
  if (name.includes('물')) return <Droplets />;
  if (name.includes('선크림')) return <Sun />;
  if (name.includes('눈') || name.includes('미끄럼')) return <Snowflake />;
  if (name.includes('바람') || name.includes('겉옷') || name.includes('보온')) return <Shirt />;
  return <BriefcaseBusiness />;
}
