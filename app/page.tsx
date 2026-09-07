'use client';

import { useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronDown,
  CircleHelp,
  FlaskConical,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Waves,
} from 'lucide-react';

type Mode = 'selection' | 'text' | 'voice';
type SelectionState = {
  skinType: string;
  sensitivity: string;
  concerns: string[];
  categories: string[];
  budget: number;
  finish: string;
  avoidIngredients: string[];
  swatch: string;
  compare: Record<string, string>;
};

const skinOptions = [
  ['dry', '건성', '당김이 있고 쉽게 건조해져요'],
  ['oily', '지성', '유분과 번들거림이 신경 쓰여요'],
  ['combination', '복합성', '부위마다 컨디션이 달라요'],
  ['normal', '중성', '큰 불편 없이 무난한 편이에요'],
  ['unknown', '잘 모르겠어요', '지금 느끼는 고민만 알려주세요'],
];
const concerns = [['dryness', '건조함'], ['shine', '번들거림'], ['redness', '붉은기'], ['blemish', '트러블 흔적'], ['texture', '피부결'], ['dullness', '칙칙함']];
const categories = [
  ['moisturizer', '보습', '수분크림 · 에센스'], ['cleanser', '클렌저', '세안 · 순한 워시'], ['base', '베이스', '쿠션 · 파운데이션'],
  ['lip', '립', '립스틱 · 틴트'], ['blush', '블러셔', '치크 · 멀티밤'], ['eye', '아이', '섀도 · 라이너'],
];
const swatches = [['S01', '#F3D3C6'], ['S02', '#EDB9A3'], ['S03', '#DDA084'], ['S04', '#C78269'], ['S05', '#A96F58'], ['S06', '#8E5B4E'], ['S07', '#72493F'], ['S08', '#B98291']];
const budgets = [[10000, '1만원 이하'], [30000, '1–3만원'], [50000, '3–5만원'], [100000, '5만원 이상']];
const finishes = [['natural', '자연스러움'], ['satin', '세미매트'], ['matte', '매트'], ['glowy', '광택감'], ['unknown', '모르겠어요']];
const comparePairs = [['warmth_01', '색의 온도', '따뜻한 쪽', '차가운 쪽'], ['chroma_01', '선명도', '또렷한 쪽', '차분한 쪽'], ['depth_01', '밝기', '밝은 쪽', '깊은 쪽']];
const compareChoices = [['left', '왼쪽'], ['right', '오른쪽'], ['similar', '비슷함'], ['unknown', '모르겠음']];
const products = [
  { category: 'base', label: '소프트 세미매트 쿠션', brand: 'tone / base', price: '₩28,000', tone: '웜 뉴트럴' },
  { category: 'lip', label: '로즈 브릭 립 컬러', brand: 'tone / color', price: '₩19,000', tone: '차분한 장미빛' },
  { category: 'moisturizer', label: '밸런싱 수분 크림', brand: 'tone / care', price: '₩24,000', tone: '가벼운 보습감' },
];

export default function Home() {
  const [mode, setMode] = useState<Mode>('selection');
  const [textInput, setTextInput] = useState('');
  const [voiceText, setVoiceText] = useState('지성인데 볼은 건조하고, 너무 번들거리지 않는 쿠션과 차분한 장미빛 립을 추천해줘.');
  const [recording, setRecording] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [selection, setSelection] = useState<SelectionState>({
    skinType: 'combination', sensitivity: 'sometimes', concerns: ['dryness', 'shine'], categories: ['base', 'lip'], budget: 30000,
    finish: 'satin', avoidIngredients: [], swatch: 'S08', compare: { warmth_01: 'right', chroma_01: 'right', depth_01: 'similar' },
  });
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const inputPayload = useMemo(() => ({
    schema_version: '2.0', input_mode: mode,
    selection: {
      skin_type: selection.skinType, sensitivity: selection.sensitivity, concerns: selection.concerns, swatch_id: selection.swatch,
      compare_choices: Object.entries(selection.compare).map(([pair_id, choice]) => ({ pair_id, choice })), categories: selection.categories,
      budget_krw: selection.budget, finish: selection.finish, avoid_ingredient_ids: selection.avoidIngredients, answer_style: 'realistic',
    },
    text: mode === 'text' ? textInput : mode === 'voice' ? voiceText : '',
    voice: { transcript: mode === 'voice' ? voiceText : '', confidence: mode === 'voice' ? 0.94 : null, provider: mode === 'voice' ? 'web_server_stt' : null },
  }), [mode, selection, textInput, voiceText]);

  const chosenSkin = skinOptions.find(([value]) => value === selection.skinType)?.[1] ?? '미정';
  const chosenFinish = finishes.find(([value]) => value === selection.finish)?.[1] ?? '미정';
  const modeLabel = mode === 'selection' ? '빠른 선택' : mode === 'text' ? '자연어' : '음성';

  function toggleList(key: 'concerns' | 'categories' | 'avoidIngredients', value: string) {
    setSelection((current) => ({ ...current, [key]: current[key].includes(value) ? current[key].filter((item) => item !== value) : [...current[key], value] }));
    setSubmitted(false);
  }
  function updateSelection(key: keyof SelectionState, value: string | number) {
    setSelection((current) => ({ ...current, [key]: value })); setSubmitted(false);
  }
  function chooseCompare(pairId: string, value: string) {
    setSelection((current) => ({ ...current, compare: { ...current.compare, [pairId]: value } })); setSubmitted(false);
  }
  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop(); streamRef.current?.getTracks().forEach((track) => track.stop()); setRecording(false); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); streamRef.current = stream;
      const recorder = new MediaRecorder(stream); recorderRef.current = recorder;
      recorder.onstop = () => setVoiceText('지성인데 볼은 건조하고, 차분한 장미빛 립을 3만원 안에서 추천해줘.'); recorder.start(); setRecording(true);
    } catch { setVoiceText('마이크 권한을 확인한 뒤, 아래 전사 문장을 직접 수정해 주세요.'); }
  }
  function reset() { setSubmitted(false); setMode('selection'); setTextInput(''); }

  return (
    <main className="tonepick-app">
      <header className="topbar">
        <div className="brand-lockup"><div className="brand-mark"><span /><span /><span /></div><div><div className="brand-name">tonepick</div><div className="brand-subtitle">RECOMMENDATION STUDIO <span>v2</span></div></div></div>
        <div className="topbar-center"><span className="live-dot" /> live profile builder</div>
        <div className="topbar-right"><span className="topbar-note">COSMETIC REFERENCE ONLY</span><button className="icon-button" aria-label="도움말"><CircleHelp size={18} /></button></div>
      </header>

      <div className="content-grid">
        <section className="builder-column">
          <div className="intro-block"><div className="eyebrow"><span className="eyebrow-line" /> INPUT YOUR SIGNALS</div><h1>지금의 톤을<br /><em>편하게 알려주세요.</em></h1><p>고르거나, 적거나, 말해도 괜찮아요.<br />입력 방식은 나중에 바꿀 수 있어요.</p></div>

          <div className="mode-tabs" role="tablist" aria-label="입력 모드 선택">
            <button className={mode === 'selection' ? 'mode-tab active' : 'mode-tab'} onClick={() => setMode('selection')} role="tab" aria-selected={mode === 'selection'}><Sparkles size={16} /> 빠른 선택 <span className="mode-tab-hint">01</span></button>
            <button className={mode === 'text' ? 'mode-tab active' : 'mode-tab'} onClick={() => setMode('text')} role="tab" aria-selected={mode === 'text'}><Waves size={16} /> 자연어로 말하기 <span className="mode-tab-hint">02</span></button>
            <button className={mode === 'voice' ? 'mode-tab active' : 'mode-tab'} onClick={() => setMode('voice')} role="tab" aria-selected={mode === 'voice'}><Mic size={16} /> 음성으로 말하기 <span className="mode-tab-hint">03</span></button>
          </div>

          {mode === 'selection' ? <div className="selection-form" role="tabpanel">
            <section className="form-section"><SectionHeading index="01" title="피부 타입" caption="가장 가까운 컨디션을 골라주세요." /><div className="option-grid skin-grid">{skinOptions.map(([value, label, description]) => <button key={value} className={selection.skinType === value ? 'option-card selected' : 'option-card'} onClick={() => updateSelection('skinType', value)}><span className="option-radio">{selection.skinType === value && <span />}</span><span><strong>{label}</strong><small>{description}</small></span></button>)}</div></section>

            <section className="form-section split-section"><div><SectionHeading index="02" title="민감도" caption="새 제품에 느끼는 반응이에요." /><div className="pill-row">{[['high', '자극을 자주 느낌'], ['sometimes', '가끔 느낌'], ['low', '거의 없음'], ['unknown', '잘 모르겠어요']].map(([value, label]) => <ChoicePill key={value} active={selection.sensitivity === value} label={label} onClick={() => updateSelection('sensitivity', value)} />)}</div></div><div><SectionHeading index="03" title="지금의 고민" caption="여러 개를 골라도 좋아요." /><div className="pill-row">{concerns.map(([value, label]) => <ChoicePill key={value} active={selection.concerns.includes(value)} label={label} onClick={() => toggleList('concerns', value)} />)}</div></div></section>

            <section className="form-section"><SectionHeading index="04" title="찾고 있는 제품" caption="추천받고 싶은 카테고리를 선택하세요." /><div className="category-grid">{categories.map(([value, label, description]) => <button key={value} className={selection.categories.includes(value) ? 'category-card selected' : 'category-card'} onClick={() => toggleList('categories', value)}><span className="category-icon">{value === 'base' ? '◐' : value === 'lip' ? '◒' : value === 'blush' ? '◓' : value === 'eye' ? '⌁' : value === 'cleanser' ? '◌' : '✦'}</span><span><strong>{label}</strong><small>{description}</small></span><span className="check-mark">{selection.categories.includes(value) ? <Check size={14} /> : '+'}</span></button>)}</div></section>

            <section className="form-section split-section"><div><SectionHeading index="05" title="예산" caption="제품 하나 기준이에요." /><div className="budget-grid">{budgets.map(([value, label]) => <button key={value} className={selection.budget === value ? 'budget-card selected' : 'budget-card'} onClick={() => updateSelection('budget', value)}>{label}</button>)}</div></div><div><SectionHeading index="06" title="원하는 마무리감" caption="베이스 제품에 반영돼요." /><div className="finish-grid">{finishes.map(([value, label]) => <button key={value} className={selection.finish === value ? 'finish-card selected' : 'finish-card'} onClick={() => updateSelection('finish', value)}>{label}</button>)}</div></div></section>

            <section className="form-section split-section color-section"><div><SectionHeading index="07" title="피부색" caption="가장 가까운 색상표를 골라주세요." /><div className="swatch-grid">{swatches.map(([id, color]) => <button key={id} className={selection.swatch === id ? 'swatch selected' : 'swatch'} style={{ backgroundColor: color }} onClick={() => updateSelection('swatch', id)} aria-label={id}><span>{id}</span></button>)}</div><div className="swatch-caption"><span className="selected-swatch" style={{ backgroundColor: swatches.find(([id]) => id === selection.swatch)?.[1] }} /> {selection.swatch} · neutral range</div></div><div><SectionHeading index="08" title="색상 비교" caption="각 행에서 더 가까운 쪽을 골라주세요." /><div className="compare-list">{comparePairs.map(([pairId, axis, left, right]) => <div className="compare-row" key={pairId}><div className="compare-title"><span>{axis}</span><small>{pairId}</small></div><div className="compare-options">{compareChoices.map(([value, label]) => <button key={value} className={selection.compare[pairId] === value ? 'compare-choice selected' : 'compare-choice'} onClick={() => chooseCompare(pairId, value)}>{value === 'left' ? 'L' : value === 'right' ? 'R' : value === 'similar' ? '≈' : '?'} <span>{label}</span></button>)}</div><div className="compare-hints"><span>{left}</span><span>{right}</span></div></div>)}</div></div></section>

            <section className="form-section avoid-section"><div className="section-heading-row"><SectionHeading index="09" title="피하고 싶은 성분" caption="선택하면 후보에서 제외해요." /><span className="optional-label">선택 사항</span></div><div className="ingredient-grid">{[['fragrance', '향료'], ['alcohol', '에탄올'], ['essential_oil', '에센셜 오일']].map(([value, label]) => <button key={value} className={selection.avoidIngredients.includes(value) ? 'ingredient-card selected' : 'ingredient-card'} onClick={() => toggleList('avoidIngredients', value)}><span className="checkbox">{selection.avoidIngredients.includes(value) && <Check size={13} />}</span>{label}</button>)}</div></section>
          </div> : mode === 'text' ? <section className="free-input-panel" role="tabpanel"><div className="free-input-label"><span className="section-number">N</span><div><h2>편하게 적어주세요.</h2><p>선택형 값이 있다면 함께 반영하고, 직접 고른 값이 우선돼요.</p></div></div><textarea className="natural-textarea" value={textInput} onChange={(event) => { setTextInput(event.target.value); setSubmitted(false); }} placeholder="피부 타입, 원하는 제품, 예산, 좋아하는 색을 편하게 적어주세요. 예: 지성인데 볼은 건조하고 차분한 립을 추천해줘." /><div className="prompt-suggestions"><span>이런 식으로 써도 좋아요</span><button onClick={() => setTextInput('지성인데 볼은 건조해. 너무 번들거리지 않는 쿠션과 차분한 장미빛 립을 3만원 안에서 추천해줘.')}>지성 + 건조함 + 차분한 립 + 3만원</button><button onClick={() => setTextInput('예민한 편이라 향료를 피하고 싶고, 자연스러운 마무리의 보습 제품을 찾고 있어요.')}>예민한 피부 + 향료 제외</button></div><div className="input-note"><ShieldCheck size={16} /> 제품명·가격·성분은 서버가 관리하는 목록에서만 가져와요.</div></section> : <section className="free-input-panel voice-panel" role="tabpanel"><div className="free-input-label"><span className="section-number">V</span><div><h2>말로 알려주세요.</h2><p>녹음 후 전사된 문장을 확인하고, 필요한 부분만 고쳐주세요.</p></div></div><div className={recording ? 'voice-recorder recording' : 'voice-recorder'}><div className="voice-orb"><AudioLines size={26} /></div><div className="voice-recorder-copy"><strong>{recording ? '듣고 있어요…' : '마이크를 눌러 시작하세요.'}</strong><span>{recording ? '원하는 만큼 말한 뒤 다시 눌러 멈춰요.' : '첫 버전은 음성을 서버에서 텍스트로 바꿔요.'}</span></div><button className="record-button" onClick={toggleRecording} aria-label={recording ? '녹음 중지' : '녹음 시작'}>{recording ? <Pause size={18} /> : <Mic size={18} />}</button></div><label className="transcript-label" htmlFor="transcript">전사 결과 <span>직접 수정 가능</span></label><textarea id="transcript" className="natural-textarea transcript" value={voiceText} onChange={(event) => { setVoiceText(event.target.value); setSubmitted(false); }} /><div className="input-note"><ShieldCheck size={16} /> 전사 신뢰도 94% · 수정된 문장이 최종 `text`로 전달돼요.</div></section>}

          <div className="submit-bar"><div className="payload-status"><span className="payload-dot" /><div><strong>{modeLabel} 입력 준비됨</strong><span>inputPayload · schema 2.0</span></div></div><button className="submit-button" onClick={() => setSubmitted(true)}><span>{submitted ? '다시 계산하기' : '추천 결과 보기'}</span>{submitted ? <RotateCcw size={18} /> : <ArrowUpRight size={18} />}</button></div>
        </section>

        <aside className="preview-column" aria-live="polite">
          <div className="preview-topline"><span>OUTPUT PREVIEW</span><span className="preview-status"><span /> {submitted ? 'result ready' : 'waiting for input'}</span></div>
          <div className="preview-hero"><div className="preview-orbit orbit-one" /><div className="preview-orbit orbit-two" /><div className="preview-orbit orbit-three" /><div className="preview-hero-content"><div className="preview-kicker">YOUR CURRENT PROFILE</div><h2>{submitted ? <>좋아요, 이 톤으로<br /><em>찾아볼게요.</em></> : <>당신의 선택을<br /><em>한 장면으로</em></>}</h2><p>{submitted ? '서버가 입력값을 정리하고 제품·컬러 후보를 매칭했어요.' : <>왼쪽 입력을 채우면<br />추천의 방향이 이곳에 쌓여요.</>}</p></div><div className="preview-palette"><span style={{ background: '#D89B85' }} /><span style={{ background: '#B98291' }} /><span style={{ background: '#8D596B' }} /><small>soft rose / neutral</small></div></div>

          <div className="signal-card"><div className="signal-card-header"><span>PROFILE SIGNALS</span><span className="signal-count">{selection.concerns.length + selection.categories.length + 4} signals</span></div><div className="signal-chips"><span className="signal-chip accent">{chosenSkin}</span>{selection.concerns.slice(0, 2).map((item) => <span className="signal-chip" key={item}>{concerns.find(([value]) => value === item)?.[1]}</span>)}<span className="signal-chip">{chosenFinish}</span><span className="signal-chip">{selection.budget.toLocaleString('ko-KR')}원</span></div><div className="signal-meter"><span /><span /><span /><span /><span /></div><div className="signal-footer"><span>selection strength</span><strong>{submitted ? '92%' : '76%'}</strong></div></div>

          <div className="recommendation-card"><div className="recommendation-header"><div><span className="section-number">R</span><div><p>RECOMMENDATION PREVIEW</p><h3>{submitted ? '추천 후보가 준비됐어요' : '이런 결과가 나와요'}</h3></div></div><button className="mini-icon-button" aria-label="결과 더 보기"><ChevronDown size={16} /></button></div><div className="product-preview-list">{products.filter((product) => selection.categories.includes(product.category)).slice(0, submitted ? 3 : 2).map((product, index) => <div className="product-preview" key={product.category}><div className={`product-swatch product-${index}`}><span>{index + 1}</span></div><div className="product-copy"><span>{product.brand}</span><strong>{product.label}</strong><small>{product.price} · {product.tone}</small></div><ArrowUpRight size={15} /></div>)}{selection.categories.length === 0 && <div className="empty-preview">제품 카테고리를 한 가지 이상 골라주세요.</div>}</div><div className="recommendation-foot"><FlaskConical size={15} /><span>제품·가격·성분은 검토된 catalog에서만 선택돼요.</span></div></div>

          <div className="json-drawer"><div className="json-title"><span><Send size={14} /> REQUEST PAYLOAD</span><span>Object</span></div><pre>{JSON.stringify(inputPayload, null, 2)}</pre></div>
          <footer className="preview-footer"><span><ShieldCheck size={14} /> 분석 결과는 화장품 선택 참고용이에요.</span><button onClick={reset}><Play size={13} /> 처음으로</button></footer>
        </aside>
      </div>
    </main>
  );
}

function SectionHeading({ index, title, caption }: { index: string; title: string; caption: string }) {
  return <div className="section-heading"><span className="section-number">{index}</span><div><h2>{title}</h2><p>{caption}</p></div></div>;
}
function ChoicePill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button className={active ? 'choice-pill active' : 'choice-pill'} onClick={onClick}>{active && <Check size={13} />}{label}</button>;
}
