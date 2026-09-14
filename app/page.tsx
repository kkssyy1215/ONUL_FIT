'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
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
  Search,
  Shirt,
  Snowflake,
  Sun,
  Trash2,
  Umbrella,
  UserRound,
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
  weatherAlert: string;
  alertFlags: string[];
  officialAlert: boolean;
  source: string;
};

type Essential = { name: string; reason: string; priority: 'required' | 'recommended' };
type Recommendation = {
  combinationId: string;
  strategy: 'balanced' | 'weather_first' | 'style_first';
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
type SuggestedItem = { name: string; category: string; reason: string; priority: 'high' | 'medium' | 'low' };
type RecommendationResponse = {
  data: Recommendation[];
  missingItems?: SuggestedItem[];
  source?: 'agentria' | 'local' | 'local-fallback';
  warning?: string;
};

type WardrobeItem = {
  id: string;
  name: string;
  category: string;
  color: string;
  styleTags?: string[];
  warmthLevel?: number;
  activityTags?: string[];
  waterproof?: boolean;
  selected?: boolean;
};
type WardrobeResponse = {
  data: {
    success: boolean;
    message: string;
    wardrobeItems: WardrobeItem[];
    wardrobeCount: number;
  };
  source?: 'agentria';
  message?: string;
};
type FormSubmitEvent = { preventDefault: () => void };
type WardrobeDraft = { draftId: number; name: string; category: string };
type RecommendationOverrides = { gender?: 'female' | 'male'; style?: string; activity?: string; sensitivity?: string; wardrobe?: WardrobeItem[]; selectedItems?: string[]; refreshToken?: number };
type WeatherRequester = (query: string, coordinates?: { latitude: number; longitude: number }, overrides?: RecommendationOverrides) => Promise<WeatherData>;

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
  weatherAlert: '',
  alertFlags: [],
  officialAlert: false,
  source: '기상청 단기예보',
};

const defaultRecommendation: Recommendation = {
  combinationId: 'combo-1',
  strategy: 'balanced',
  strategyLabel: '균형 추천',
  complete: true,
  missingCategories: [],
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

const styles = ['미니멀', '캐주얼', '오피스', '스트릿', '페미닌', '스포티'];
const wardrobeCategories = ['상의', '하의', '아우터', '신발', '액세서리'];
const wardrobeCategoryEmoji: Record<string, string> = { '상의': '👕', '하의': '👖', '아우터': '🧥', '신발': '👟', '액세서리': '👜' };

function getWardrobeStyles(items: WardrobeItem[]) {
  const ownedStyles = new Set(items.flatMap((item) => item.styleTags ?? []));
  return styles.filter((item) => ownedStyles.has(item));
}

function inferOutfitCategory(itemName: string, index: number, items: WardrobeItem[]) {
  const ownedItem = items.find((item) => item.name === itemName);
  if (ownedItem) return ownedItem.category;
  if (/신발|부츠|로퍼|스니커즈|운동화|샌들|shoes/i.test(itemName)) return '신발';
  if (/아우터|재킷|자켓|코트|패딩|가디건|바람막이|outer/i.test(itemName)) return '아우터';
  if (/하의|바지|팬츠|슬랙스|치노|스커트|bottom/i.test(itemName)) return '하의';
  if (/가방|우산|모자|장갑|목도리|액세서리/i.test(itemName)) return '액세서리';
  return index === 1 ? '하의' : index >= 3 ? '신발' : '상의';
}

const dateLabel = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Seoul',
}).format(new Date());

export default function Home() {
  const [weather, setWeather] = useState(defaultWeather);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([defaultRecommendation]);
  const [activeRecommendationIndex, setActiveRecommendationIndex] = useState(0);
  const [locationInput, setLocationInput] = useState('서울');
  const [gender, setGender] = useState<'female' | 'male'>('female');
  const [style, setStyle] = useState('미니멀');
  const [activity, setActivity] = useState('출근');
  const [sensitivity, setSensitivity] = useState('보통');
  const [wardrobe, setWardrobe] = useState<WardrobeItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [wardrobeSearch, setWardrobeSearch] = useState('');
  const [wardrobeColorFilters, setWardrobeColorFilters] = useState<Record<string, string>>({});
  const [wardrobeDrafts, setWardrobeDrafts] = useState<WardrobeDraft[]>([
    { draftId: 1, name: '', category: '상의' },
  ]);
  const [showAddItem, setShowAddItem] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecommendationLoading, setIsRecommendationLoading] = useState(false);
  const [isWardrobeSaving, setIsWardrobeSaving] = useState(false);
  const [message, setMessage] = useState('최신 날씨를 확인하고 있어요.');
  const [recommendationSource, setRecommendationSource] = useState<RecommendationResponse['source']>('local');
  const [missingItems, setMissingItems] = useState<SuggestedItem[]>([]);
  const [recommendationCycle, setRecommendationCycle] = useState(0);
  const [storageReady, setStorageReady] = useState(false);
  const nextWardrobeDraftId = useRef(2);

  const requestRecommendation = useCallback(async (
    nextWeather: WeatherData,
    overrides?: RecommendationOverrides,
  ) => {
    const nextWardrobe = overrides?.wardrobe ?? wardrobe;
    const nextSelected = overrides?.selectedItems ?? selectedItems;
    setIsRecommendationLoading(true);
    try {
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
          refreshToken: overrides?.refreshToken,
        }),
      });
      if (!response.ok) throw new Error('추천을 불러오지 못했어요.');
      const result = await response.json() as RecommendationResponse;
      setRecommendations(result.data.length > 0 ? result.data : [defaultRecommendation]);
      setActiveRecommendationIndex(0);
      setRecommendationSource(result.source ?? 'local');
      setMissingItems(result.missingItems ?? []);
      return result;
    } finally {
      setIsRecommendationLoading(false);
    }
  }, [activity, gender, sensitivity, selectedItems, style, wardrobe]);

  const requestWardrobe = useCallback(async () => {
    const response = await fetch('/api/wardrobe/');
    const result = await response.json() as WardrobeResponse;
    if (!response.ok) throw new Error(result.message || '옷장 목록을 불러오지 못했어요.');

    const items = result.data.wardrobeItems;
    setWardrobe(items);
    setSelectedItems(items.filter((item) => item.selected !== false).map((item) => item.id));
    return items;
  }, []);

  const requestWeather = useCallback(async (
    query: string,
    coordinates?: { latitude: number; longitude: number },
    overrides?: RecommendationOverrides,
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
      // 날씨는 먼저 보여주고, Agentria 추천은 별도 상태로 표시합니다.
      // AI가 느리거나 실패해도 날씨 화면 전체가 잠기지 않습니다.
      setIsLoading(false);
      setMessage(`${result.location} 날씨를 업데이트했어요. AI 추천을 분석 중이에요.`);
      try {
        const recommendationResult = await requestRecommendation(result, overrides);
        setMessage(recommendationResult.warning || `${result.location} 날씨와 추천을 업데이트했어요.`);
      } catch {
        // Weather and recommendation are independent. Keep the valid weather
        // result visible even when the external recommendation API is down.
        setMessage(`${result.location} 날씨는 업데이트했어요. 추천은 잠시 후 다시 시도해 주세요.`);
      }
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [requestRecommendation]);

  const requestWeatherRef = useRef<WeatherRequester>(requestWeather);
  const activeRecommendation = recommendations[activeRecommendationIndex] ?? recommendations[0] ?? defaultRecommendation;
  const recommendationRef = useRef(activeRecommendation);
  const normalizedWardrobeSearch = wardrobeSearch.trim().toLowerCase();
  const availableStyles = getWardrobeStyles(wardrobe);
  const firstAvailableStyle = availableStyles[0] ?? '';
  const selectedStyleIsAvailable = availableStyles.includes(style);
  const visibleWardrobe = wardrobe.filter((item) => (
    !normalizedWardrobeSearch
    || item.name.toLowerCase().includes(normalizedWardrobeSearch)
    || item.category.toLowerCase().includes(normalizedWardrobeSearch)
    || item.styleTags?.some((tag) => tag.toLowerCase().includes(normalizedWardrobeSearch))
  ));

  useEffect(() => {
    requestWeatherRef.current = requestWeather;
    recommendationRef.current = activeRecommendation;
  }, [activeRecommendation, requestWeather]);

  useEffect(() => {
    if (!firstAvailableStyle || selectedStyleIsAvailable) return;
    queueMicrotask(() => setStyle(firstAvailableStyle));
  }, [firstAvailableStyle, selectedStyleIsAvailable]);

  useEffect(() => {
    const saved = window.localStorage.getItem('onul-fit-preferences');
    let nextGender: 'female' | 'male' = 'female';
    let nextStyle = '미니멀';
    let nextActivity = '출근';
    let nextSensitivity = '보통';
    let nextWardrobe: WardrobeItem[] = [];
    let nextSelected: string[] = [];
    let savedSelectedItems: string[] | undefined;
    let nextLocation = '서울';

    if (saved) {
      try {
        const parsed = JSON.parse(saved) as {
          gender?: 'female' | 'male'; style?: string; activity?: string; sensitivity?: string;
          selectedItems?: string[]; location?: string; wardrobe?: WardrobeItem[];
        };
        nextGender = parsed.gender ?? nextGender;
        nextStyle = parsed.style ?? nextStyle;
        nextActivity = parsed.activity ?? nextActivity;
        nextSensitivity = parsed.sensitivity ?? nextSensitivity;
        savedSelectedItems = parsed.selectedItems;
        nextLocation = parsed.location ?? nextLocation;
        if (Array.isArray(parsed.wardrobe)) {
          nextWardrobe = parsed.wardrobe.filter((item) => (
            item
            && typeof item.id === 'string'
            && typeof item.name === 'string'
            && typeof item.category === 'string'
          ));
          nextSelected = savedSelectedItems
            ? nextWardrobe.filter((item) => savedSelectedItems?.includes(item.id)).map((item) => item.id)
            : nextWardrobe.filter((item) => item.selected !== false).map((item) => item.id);
        }
        queueMicrotask(() => {
          setGender(nextGender);
          setStyle(nextStyle);
          setActivity(nextActivity);
          setSensitivity(nextSensitivity);
          setLocationInput(nextLocation);
          setWardrobe(nextWardrobe);
          setSelectedItems(nextSelected);
        });
      } catch {
        window.localStorage.removeItem('onul-fit-preferences');
      }
    }

    queueMicrotask(() => setStorageReady(true));
    void (async () => {
      try {
        nextWardrobe = await requestWardrobe();
        nextSelected = savedSelectedItems
          ? nextWardrobe.filter((item) => savedSelectedItems?.includes(item.id)).map((item) => item.id)
          : nextWardrobe.filter((item) => item.selected !== false).map((item) => item.id);
        const loadedStyles = getWardrobeStyles(nextWardrobe);
        if (loadedStyles.length > 0 && !loadedStyles.includes(nextStyle)) {
          nextStyle = loadedStyles[0];
          setStyle(nextStyle);
        }
        setSelectedItems(nextSelected);
      } catch {
        setMessage(
          nextWardrobe.length > 0
            ? '최근에 불러온 옷장을 보여드리고 있어요.'
            : '옷장을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
        );
      }

      void requestWeatherRef.current(nextLocation, undefined, {
        gender: nextGender, style: nextStyle, activity: nextActivity, sensitivity: nextSensitivity,
        wardrobe: nextWardrobe, selectedItems: nextSelected,
      }).catch(() => undefined);
    })();
  }, [requestWardrobe]);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem('onul-fit-preferences', JSON.stringify({
      gender, style, activity, sensitivity, selectedItems, location: weather.location, wardrobe,
    }));
  }, [storageReady, gender, style, activity, sensitivity, selectedItems, wardrobe, weather.location]);

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
    if (!nextLocation) {
      setMessage('지역이나 도시를 입력해 주세요.');
      return;
    }
    await requestWeather(nextLocation).catch(() => undefined);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage('이 브라우저에서는 현재 위치를 사용할 수 없어요.');
      return;
    }
    setLocationInput('현재 위치');
    setMessage('현재 위치를 확인하고 있어요.');
    navigator.geolocation.getCurrentPosition(
      (position) => void requestWeather('현재 위치', { latitude: position.coords.latitude, longitude: position.coords.longitude }).catch(() => undefined),
      () => setMessage('위치 권한을 확인하거나 지역을 직접 입력해 주세요.'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  function toggleWardrobe(id: string) {
    setSelectedItems((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function updateWardrobeDraft(
    draftId: number,
    field: 'name' | 'category',
    value: string,
  ) {
    setWardrobeDrafts((current) => current.map((draft) => (
      draft.draftId === draftId ? { ...draft, [field]: value } : draft
    )));
  }

  function appendWardrobeDraft() {
    setWardrobeDrafts((current) => {
      if (current.length >= 5) return current;

      const draft = {
        draftId: nextWardrobeDraftId.current,
        name: '',
        category: '상의',
      };
      nextWardrobeDraftId.current += 1;
      return [...current, draft];
    });
  }

  function removeWardrobeDraft(draftId: number) {
    setWardrobeDrafts((current) => (
      current.length === 1
        ? current
        : current.filter((draft) => draft.draftId !== draftId)
    ));
  }

  function resetWardrobeDrafts() {
    nextWardrobeDraftId.current = 2;
    setWardrobeDrafts([{ draftId: 1, name: '', category: '상의' }]);
  }

  async function addWardrobeItems(event: FormSubmitEvent) {
    event.preventDefault();
    const items = wardrobeDrafts
      .map((draft) => ({ name: draft.name.trim(), category: draft.category }))
      .filter((item) => item.name);

    if (items.length === 0) {
      setMessage('추가할 옷 이름을 한 개 이상 입력해 주세요.');
      return;
    }

    setIsWardrobeSaving(true);
    setMessage(`${items.length}벌을 분석해 옷장에 저장하고 있어요.`);

    try {
      const response = await fetch('/api/wardrobe/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const result = await response.json() as WardrobeResponse;
      if (!response.ok) {
        throw new Error(result.message || '옷장에 저장하지 못했어요.');
      }

      const nextWardrobe = result.data.wardrobeItems;
      const nextSelected = nextWardrobe
        .filter((item) => item.selected !== false)
        .map((item) => item.id);
      setWardrobe(nextWardrobe);
      setSelectedItems(nextSelected);
      resetWardrobeDrafts();
      setShowAddItem(false);

      const nextCycle = recommendationCycle + 1;
      const nextAvailableStyles = getWardrobeStyles(nextWardrobe);
      const nextStyle = nextAvailableStyles.includes(style)
        ? style
        : nextAvailableStyles[0] ?? style;
      if (nextStyle !== style) setStyle(nextStyle);
      setRecommendationCycle(nextCycle);
      const recommendationResult = await requestRecommendation(weather, {
        style: nextStyle,
        wardrobe: nextWardrobe,
        selectedItems: nextSelected,
        refreshToken: nextCycle,
      });
      setMessage(
        recommendationResult.warning ||
        `${items.length}벌을 처리하고 옷장 기준으로 추천을 업데이트했어요.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '옷장에 저장하지 못했어요.');
    } finally {
      setIsWardrobeSaving(false);
    }
  }

  async function refreshRecommendation() {
    setMessage('저장한 취향으로 추천을 다시 만들고 있어요.');
    try {
      const nextCycle = recommendationCycle + 1;
      setRecommendationCycle(nextCycle);
      const result = await requestRecommendation(weather, { refreshToken: nextCycle });
      setMessage(result.warning || '내 취향과 옷장을 반영해 추천을 다시 계산했어요.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '추천을 다시 만들지 못했어요.');
    }
  }

  const isBusy = isLoading || isRecommendationLoading || isWardrobeSaving;
  const pendingWardrobeCount = wardrobeDrafts.filter((draft) => draft.name.trim()).length;

  return (
    <main className={`onul-app ${isBusy ? 'is-loading' : ''}`}>
      <header className="app-header">
        <a className="brand" href="#top" aria-label="오늘핏 홈">
          <span className="brand-emblem" aria-hidden="true"><span>O</span></span>
          <span className="brand-lockup"><strong>오늘핏</strong><small>ONUL FIT</small></span>
        </a>
        <nav className="main-nav" aria-label="주요 메뉴">
          <a className="active" href="#today">오늘</a>
          <a href="#wardrobe">내 옷장</a>
          <a href="#profile">오늘 입을 옷</a>
        </nav>
        <div className="header-profile">
          <span className="sync-dot" />
          <span className="sync-label">{isLoading ? '날씨 업데이트 중' : isWardrobeSaving ? '옷장 저장 중' : isRecommendationLoading ? 'AI 추천 분석 중' : '설정 저장됨'}</span>
          <a className="profile-shortcut" href="#profile" aria-label="내 취향 설정으로 이동"><UserRound /><span>내 설정</span></a>
        </div>
      </header>

      <div className="page-shell" id="top">
        <section className="page-intro">
          <div>
            <p className="date-label">{dateLabel}</p>
            <h1>오늘의 추천핏</h1>
          </div>
          <form className="location-search" onSubmit={updateLocation}>
            <div className="location-field">
              <MapPin aria-hidden="true" />
              <div className="location-field-copy">
                <span className="location-field-label">날씨를 확인할 곳</span>
                <Input type="search" aria-label="날씨를 확인할 지역" value={locationInput} onChange={(event) => setLocationInput(event.target.value)} placeholder="서울, 마포구처럼 입력" autoComplete="address-level2" />
              </div>
            </div>
            <div className="location-actions">
              <Button type="submit" disabled={isLoading} aria-label={isLoading ? '날씨 확인 중' : '입력한 지역의 날씨 확인'}>
                {isLoading ? <><RefreshCw className="loading-spin" /> 확인 중</> : <>날씨 확인 <ArrowRight /></>}
              </Button>
              <button className="locate-button" type="button" onClick={useCurrentLocation} disabled={isLoading} aria-label="현재 위치 사용" title="현재 위치 사용"><LocateFixed /><span>현재 위치</span></button>
            </div>
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
            <div className="weather-note"><EssentialIcon name={activeRecommendation.essentials[0]?.name ?? ''} /><p><strong>{weather.weatherAlert || `${activeRecommendation.essentials[0]?.name ?? '외출 준비'}을(를) 확인하세요.`}</strong><span>{weather.weatherAlert ? '기상청 공식 특보를 확인하고 외출 시 주의하세요.' : activeRecommendation.notice}</span></p></div>
          </article>

          <article className="outfit-card">
            <div className="outfit-copy">
              <div className="outfit-variant-tabs" role="tablist" aria-label="코디 추천 기준">
                {recommendations.map((item, index) => (
                  <button
                    key={item.combinationId}
                    type="button"
                    role="tab"
                    aria-selected={activeRecommendationIndex === index}
                    className={activeRecommendationIndex === index ? 'active' : ''}
                    onClick={() => setActiveRecommendationIndex(index)}
                  >
                    {item.strategyLabel}
                  </button>
                ))}
              </div>
              <div className="outfit-kicker-row"><div className="section-kicker">오늘의 조합</div><div className="outfit-meta"><span className={activeRecommendation.complete ? 'match-badge' : 'match-badge partial'}>{activeRecommendation.complete ? `${activeRecommendation.matchScore}% 맞춤` : `부분 추천 · ${activeRecommendation.matchScore}%`}</span><span className="recommendation-source">{isRecommendationLoading ? 'AI 분석 중' : recommendationSource === 'agentria' ? 'AI 분석' : recommendationSource === 'local-fallback' ? '보완 추천' : '규칙 기반'}</span></div></div>
              <h2>{activeRecommendation.headline.split(/(?<=[.!?])/)[0]?.trim() || activeRecommendation.headline}</h2>
              <p>{activeRecommendation.description}</p>
              {!activeRecommendation.complete && activeRecommendation.missingCategories.length > 0 && <div className="partial-recommendation" role="status"><strong>옷장이 조금 부족해요</strong><span>{activeRecommendation.missingCategories.join(' · ')}를 추가하면 코디를 완성할 수 있어요.</span></div>}
              <ul className="outfit-item-list">{activeRecommendation.outfitItems.map((item, index) => {
                const category = inferOutfitCategory(item, index, wardrobe);
                return <li key={item}><span className="outfit-item-icon" aria-hidden="true">{wardrobeCategoryEmoji[category] ?? '👕'}</span><span><small>{category}</small><strong>{item}</strong></span></li>;
              })}</ul>
              <div className="outfit-tags">{activeRecommendation.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              <button
                className="text-link"
                type="button"
                onClick={() => setActiveRecommendationIndex((current) => (current + 1) % recommendations.length)}
                disabled={isBusy || recommendations.length < 2}
              >
                다음 조합 보기 <ArrowRight />
              </button>
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
            <div className="section-heading compact"><div><span className="section-kicker">외출 준비</span><h2>오늘 챙길 것</h2></div><span className="count-label">{activeRecommendation.essentials.length}</span></div>
            <div className="essential-list">
              {activeRecommendation.essentials.map((item) => (
                <div className={item.priority === 'required' ? 'essential-item required' : 'essential-item'} key={item.name}>
                  <span className="essential-icon"><EssentialIcon name={item.name} /></span><p><strong>{item.name}</strong><small>{item.reason}</small></p>{item.priority === 'required' ? <span>필수</span> : <Check />}
                </div>
              ))}
            </div>
          </article>

          {missingItems.length > 0 && (
            <article className="missing-items-card">
              <div className="section-heading compact"><div><span className="section-kicker">쇼핑 제안</span><h2>옷장에 없는 추천 아이템</h2></div><span className="count-label">{missingItems.length}</span></div>
              <div className="missing-items-list">
                {missingItems.map((item) => (
                  <div className={item.priority === 'high' ? 'essential-item required' : 'essential-item'} key={item.name}>
                    <span className="essential-icon" aria-hidden="true">{wardrobeCategoryEmoji[item.category] ?? '🛍️'}</span><p><strong>{item.name}</strong><small>{item.reason}</small></p><span>{item.priority === 'high' ? '구매 추천' : item.priority === 'medium' ? '있으면 좋아요' : '참고'}</span>
                  </div>
                ))}
              </div>
            </article>
          )}
        </section>

        <section className="settings-grid">
          <article className="profile-card" id="profile">
            <div className="section-heading"><div><span className="section-kicker">오늘 입을 옷은?</span><h2>오늘의 선택</h2></div><span className="saved-label"><Check /> 자동 저장</span></div>
            <div className="preference-row">
              <span className="preference-label">성별</span>
              <RadioGroup className="choice-group" value={gender} onValueChange={(value) => setGender(value as 'female' | 'male')}>
                <label htmlFor="gender-female" className={gender === 'female' ? 'radio-choice selected' : 'radio-choice'}><RadioGroupItem id="gender-female" value="female" /><span>여성</span></label>
                <label htmlFor="gender-male" className={gender === 'male' ? 'radio-choice selected' : 'radio-choice'}><RadioGroupItem id="gender-male" value="male" /><span>남성</span></label>
              </RadioGroup>
            </div>
            <div className="preference-row stacked">
              <span className="preference-label">오늘 입을 스타일</span>
              <div className="style-selection">
                {availableStyles.length > 0 ? (
                  <RadioGroup
                    className="style-options"
                    value={selectedStyleIsAvailable ? style : firstAvailableStyle}
                    onValueChange={(value) => {
                      if (availableStyles.includes(value)) setStyle(value);
                    }}
                  >
                    {availableStyles.map((item) => <label htmlFor={`style-${item}`} key={item} className={style === item ? 'style-choice selected' : 'style-choice'}><RadioGroupItem id={`style-${item}`} value={item} /><span>{item}</span></label>)}
                  </RadioGroup>
                ) : (
                  <div className="style-empty">옷장에 스타일 정보가 있는 옷을 먼저 추가해 주세요.</div>
                )}
                <small className="style-helper">현재 옷장에 있는 스타일만 선택할 수 있어요.</small>
              </div>
            </div>
            <div className="preference-row two-settings">
              <div className="setting-field"><label className="preference-label" htmlFor="activity">외출 목적</label><NativeSelect id="activity" value={activity} onChange={(event) => setActivity(event.target.value)}><NativeSelectOption value="출근">출근</NativeSelectOption><NativeSelectOption value="등교">등교</NativeSelectOption><NativeSelectOption value="데이트">데이트</NativeSelectOption><NativeSelectOption value="운동">운동</NativeSelectOption><NativeSelectOption value="여행">여행</NativeSelectOption></NativeSelect></div>
              <div className="setting-field"><label className="preference-label" htmlFor="sensitivity">추위 민감도</label><NativeSelect id="sensitivity" value={sensitivity} onChange={(event) => setSensitivity(event.target.value)}><NativeSelectOption value="더위를 많이 탐">더위를 많이 탐</NativeSelectOption><NativeSelectOption value="보통">보통</NativeSelectOption><NativeSelectOption value="추위를 많이 탐">추위를 많이 탐</NativeSelectOption></NativeSelect></div>
            </div>
            <div className="profile-summary"><Shirt /><p><strong>{availableStyles.length > 0 ? `${selectedStyleIsAvailable ? style : firstAvailableStyle} 스타일을 중심으로 추천해요.` : '선택할 수 있는 옷장 스타일이 없어요.'}</strong><span>{availableStyles.length > 0 ? `${activity}할 때 편하고 자연스러운 조합을 우선합니다.` : '옷장에 옷을 추가하면 선택 가능한 스타일이 표시됩니다.'}</span></p></div>
          </article>

          <article className="wardrobe-card" id="wardrobe">
            <div className="wardrobe-header">
              <div>
                <span className="section-kicker">내 옷장</span>
                <h2>추천에 사용할 옷</h2>
                <p>선택한 옷만 날씨와 취향에 맞춰 조합해요.</p>
              </div>
              <div className="wardrobe-header-actions">
                <span><strong>{selectedItems.length}</strong> / {wardrobe.length}벌 선택</span>
                <Button variant="outline" size="sm" disabled={isWardrobeSaving} onClick={() => setShowAddItem((current) => !current)}><Plus /> 옷 추가</Button>
              </div>
            </div>
            {showAddItem && (
              <form className="add-item-form" onSubmit={addWardrobeItems}>
                <div className="add-item-form-heading">
                  <div>
                    <strong>옷 한 번에 추가</strong>
                    <span>최대 5벌을 입력한 뒤 한 번에 저장할 수 있어요.</span>
                  </div>
                  <span aria-live="polite">{pendingWardrobeCount} / 5벌 입력</span>
                </div>
                <div className="add-item-rows">
                  {wardrobeDrafts.map((draft, index) => (
                    <div className="add-item-row" key={draft.draftId}>
                      <span className="add-item-number" aria-hidden="true">{index + 1}</span>
                      <Input
                        value={draft.name}
                        maxLength={80}
                        disabled={isWardrobeSaving}
                        onChange={(event) => updateWardrobeDraft(draft.draftId, 'name', event.target.value)}
                        placeholder="예: 검정색 두꺼운 방수 바람막이"
                        aria-label={`${index + 1}번째 옷 이름`}
                      />
                      <NativeSelect
                        aria-label={`${index + 1}번째 옷 카테고리`}
                        value={draft.category}
                        disabled={isWardrobeSaving}
                        onChange={(event) => updateWardrobeDraft(draft.draftId, 'category', event.target.value)}
                      >
                        {wardrobeCategories.map((category) => (
                          <NativeSelectOption value={category} key={category}>{category}</NativeSelectOption>
                        ))}
                      </NativeSelect>
                      <Button
                        className="add-item-remove"
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={isWardrobeSaving || wardrobeDrafts.length === 1}
                        onClick={() => removeWardrobeDraft(draft.draftId)}
                        aria-label={`${index + 1}번째 옷 입력 삭제`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="add-item-actions">
                  <Button
                    className="add-item-more"
                    type="button"
                    variant="outline"
                    disabled={isWardrobeSaving || wardrobeDrafts.length >= 5}
                    onClick={appendWardrobeDraft}
                  >
                    <Plus /> 옷 입력 추가
                  </Button>
                  <span>{wardrobeDrafts.length >= 5 ? '최대 5벌까지 추가할 수 있어요.' : `${5 - wardrobeDrafts.length}개 항목을 더 만들 수 있어요.`}</span>
                  <div className="add-item-submit-actions">
                    <Button
                      className="add-item-cancel"
                      type="button"
                      variant="ghost"
                      disabled={isWardrobeSaving}
                      onClick={() => {
                        resetWardrobeDrafts();
                        setShowAddItem(false);
                      }}
                    >
                      취소
                    </Button>
                    <Button
                      className="add-item-submit"
                      type="submit"
                      disabled={isWardrobeSaving || pendingWardrobeCount === 0}
                    >
                      <Check /> {isWardrobeSaving ? '저장 중' : '옷장에 저장'}
                    </Button>
                  </div>
                </div>
              </form>
            )}
            <div className="wardrobe-toolbar">
              <label className="wardrobe-search">
                <Search aria-hidden="true" />
                <Input value={wardrobeSearch} onChange={(event) => setWardrobeSearch(event.target.value)} placeholder="옷 이름, 카테고리, 스타일 검색" aria-label="옷장 검색" />
              </label>
              <span>{visibleWardrobe.length}벌 표시 중</span>
            </div>
            <div className="wardrobe-groups" aria-label="카테고리별 옷 목록">
              {wardrobeCategories.map((category) => {
                const categoryColors = Array.from(new Set(wardrobe.filter((item) => item.category === category).map((item) => item.color)));
                const activeColor = wardrobeColorFilters[category] ?? '';
                const categoryItems = visibleWardrobe.filter((item) => item.category === category && (!activeColor || item.color === activeColor));
                return <section className="wardrobe-group" key={category}>
                  <div className="wardrobe-group-heading"><div><strong>{category}</strong><small>{categoryItems.length}벌</small></div></div>
                  <div className="wardrobe-color-filter" aria-label={`${category} 색상 필터`}>
                    <button type="button" className={!activeColor ? 'active all-colors' : 'all-colors'} onClick={() => setWardrobeColorFilters((current) => ({ ...current, [category]: '' }))} aria-label={`${category} 전체 색상 보기`}>전체</button>
                    {categoryColors.map((color) => <button key={color} type="button" className={activeColor === color ? 'active' : ''} style={{ '--item-color': color } as CSSProperties} onClick={() => setWardrobeColorFilters((current) => ({ ...current, [category]: current[category] === color ? '' : color }))} aria-label={`${category} ${color} 색상만 보기`} title={color}><span /></button>)}
                  </div>
                  <div className="wardrobe-list">{categoryItems.map((item) => {
                  const selected = selectedItems.includes(item.id);
                  const warmthText = item.warmthLevel && item.warmthLevel >= 4 ? '따뜻함' : item.warmthLevel && item.warmthLevel <= 1 ? '가벼움' : '보통 두께';
                  return <button key={item.id} type="button" className={selected ? 'wardrobe-item selected' : 'wardrobe-item'} onClick={() => toggleWardrobe(item.id)} aria-pressed={selected}><span className="item-color" style={{ backgroundColor: item.color }} /><span className="item-copy"><strong>{item.name}</strong><small>{[item.styleTags?.[0], warmthText, item.waterproof ? '방수' : null].filter(Boolean).join(' · ')}</small></span><span className="item-check" aria-hidden="true">{selected && <Check />}</span></button>;
                })}{categoryItems.length === 0 && <div className="wardrobe-column-empty">해당 색상의 옷이 없어요.</div>}</div></section>;
              })}
            </div>
            <div className="wardrobe-footer"><span>{selectedItems.length}벌을 추천에 사용 중</span><Button onClick={refreshRecommendation} disabled={isBusy}><RefreshCw /> {isBusy ? '추천 만드는 중' : '추천 새로 받기'}</Button></div>
          </article>
        </section>

        <footer className="app-footer"><span>날씨 데이터: 기상청 단기예보</span><span>기상특보가 있는 날에는 공식 안내를 함께 확인하세요.</span></footer>
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
