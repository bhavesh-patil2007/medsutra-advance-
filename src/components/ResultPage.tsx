// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BellRing,
  CheckCircle2,
  Clock,
  CloudSun,
  Download,
  Languages,
  Layout,
  Mail,
  MapPin,
  MessageCircleWarning,
  Moon,
  Package,
  PhoneCall,
  Share2,
  ShieldCheck,
  Smartphone,
  Square,
  Stethoscope,
  Tag,
  Sun,
  Truck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { ExplainMode, Lang, Medicine, PrescriptionResult, UserProfile } from '../types';
import { translateResult } from '../services/aiService';
import { UI, translateMedText } from '../i18n';
import { useTTS } from '../hooks/useTTS';
import { saveResultToHistory } from '../utils/storage';
import InteractionGraph from './InteractionGraph';
import ScopedChatPanel from './ScopedChatPanel';

interface ResultPageProps {
  result: PrescriptionResult;
  profile: UserProfile;
  lang: Lang;
  onResultUpdate: (result: PrescriptionResult) => void;
}

type ResultSection = 'overview' | 'safety' | 'analysis' | 'actions' | 'assistant';

const SESSION_TAB_KEY = 'medsutra_last_tab';

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

  .rxb-root { font-family: 'Inter', sans-serif; }

  .rxb-bg-pattern {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background-image: radial-gradient(#a8c0e4 1px, transparent 1px), radial-gradient(#a8c0e4 1px, transparent 1px);
    background-size: 40px 40px; background-position: 0 0, 20px 20px;
    opacity: 0.05; z-index: 0; pointer-events: none;
  }

  .rxb-floating-layer {
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    z-index: 0; pointer-events: none; overflow: hidden; opacity: 0.08;
  }
  .rxb-float-item { position: absolute; filter: drop-shadow(0px 8px 16px rgba(0,0,0,0.06)); }

  @keyframes float-1 {
    0% { transform: translateY(0px) rotate(0deg); }
    50% { transform: translateY(-15px) rotate(5deg); }
    100% { transform: translateY(0px) rotate(0deg); }
  }
  @keyframes float-2 {
    0% { transform: translateY(0px) rotate(0deg); }
    50% { transform: translateY(-10px) rotate(-8deg); }
    100% { transform: translateY(0px) rotate(0deg); }
  }
  @keyframes float-3 {
    0% { transform: translateY(0px) rotate(0deg) scale(1); }
    50% { transform: translateY(-20px) rotate(10deg) scale(1.05); }
    100% { transform: translateY(0px) rotate(0deg); }
  }
  .float-anim-1 { animation: float-1 8s ease-in-out infinite; }
  .float-anim-2 { animation: float-2 6s ease-in-out infinite; }
  .float-anim-3 { animation: float-3 10s ease-in-out infinite; }

  .rxb-glass-card {
    background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,0.9); box-shadow: 0 4px 20px rgba(26,58,107,0.04);
  }
  .rxb-glass-panel {
    background: rgba(255, 255, 255, 0.65); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgba(255,255,255,0.7); box-shadow: 0 2px 12px rgba(26,58,107,0.03);
  }

  @keyframes fab-menu-in {
    from { opacity: 0; transform: translateY(12px) scale(0.95); }
    to   { opacity: 1; transform: translateY(0px) scale(1); }
  }
  .fab-menu-enter { animation: fab-menu-in 0.2s ease-out forwards; }

  @keyframes modal-backdrop-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes modal-card-in {
    from { opacity: 0; transform: translateY(16px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0px) scale(1); }
  }
  .modal-backdrop-enter { animation: modal-backdrop-in 0.2s ease-out forwards; }
  .modal-card-enter { animation: modal-card-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
`;

function LeafSVG({ width = 80, style, animClass = '' }: { width?: number, style?: React.CSSProperties, animClass?: string }) {
  return (
    <svg width={width} viewBox="0 0 100 100" style={style} className={`rxb-float-item ${animClass}`}>
      <defs>
        <linearGradient id="leafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a8cdb6" /><stop offset="100%" stopColor="#629277" />
        </linearGradient>
      </defs>
      <path d="M50 90 C 10 90, 10 30, 50 10 C 90 30, 90 90, 50 90 Z" fill="url(#leafGrad)" opacity="0.9" />
      <path d="M50 95 L50 10" stroke="#48785e" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

function PillSVG({ width = 60, style, animClass = '' }: { width?: number, style?: React.CSSProperties, animClass?: string }) {
  return (
    <svg width={width} viewBox="0 0 100 40" style={style} className={`rxb-float-item ${animClass}`}>
      <defs>
        <linearGradient id="pillBlue" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#6fa8d6" /><stop offset="100%" stopColor="#356c9e" />
        </linearGradient>
        <linearGradient id="pillWhite" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" /><stop offset="100%" stopColor="#d0dee8" />
        </linearGradient>
      </defs>
      <rect x="5" y="0" width="50" height="36" fill="url(#pillWhite)" rx="18" />
      <rect x="45" y="0" width="50" height="36" fill="url(#pillBlue)" rx="18" />
    </svg>
  );
}

function MoleculeSVG({ width = 90, style, animClass = '' }: { width?: number, style?: React.CSSProperties, animClass?: string }) {
  return (
    <svg width={width} viewBox="0 0 100 100" style={style} className={`rxb-float-item ${animClass}`}>
      <defs>
        <radialGradient id="molBlue" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#9fbfe0" /><stop offset="100%" stopColor="#4376ad" />
        </radialGradient>
        <radialGradient id="molPurple" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#bba4d6" /><stop offset="100%" stopColor="#6c528f" />
        </radialGradient>
      </defs>
      <line x1="25" y1="75" x2="50" y2="50" stroke="#879cb5" strokeWidth="5" strokeLinecap="round" opacity="0.6" />
      <line x1="50" y1="50" x2="80" y2="30" stroke="#879cb5" strokeWidth="5" strokeLinecap="round" opacity="0.6" />
      <line x1="50" y1="50" x2="75" y2="75" stroke="#879cb5" strokeWidth="5" strokeLinecap="round" opacity="0.6" />
      <circle cx="25" cy="75" r="12" fill="url(#molBlue)" />
      <circle cx="50" cy="50" r="16" fill="url(#molPurple)" />
      <circle cx="80" cy="30" r="11" fill="url(#molBlue)" />
      <circle cx="75" cy="75" r="13" fill="url(#molPurple)" />
    </svg>
  );
}

function BackgroundElements() {
  return (
    <div className="rxb-floating-layer">
      <LeafSVG width={90} animClass="float-anim-1" style={{ top: '8%', left: '5%', transform: 'rotate(-25deg)' }} />
      <PillSVG width={55} animClass="float-anim-2" style={{ top: '22%', left: '12%', transform: 'rotate(40deg)' }} />
      <MoleculeSVG width={80} animClass="float-anim-3" style={{ top: '45%', left: '-2%', filter: 'blur(1px)' }} />
      <LeafSVG width={110} animClass="float-anim-2" style={{ top: '-2%', right: '15%', transform: 'rotate(110deg)' }} />
      <MoleculeSVG width={100} animClass="float-anim-1" style={{ top: '10%', right: '8%', transform: 'rotate(-15deg)' }} />
      <PillSVG width={65} animClass="float-anim-3" style={{ top: '35%', right: '5%', transform: 'rotate(-60deg)' }} />
    </div>
  );
}

// ── TIME-OF-DAY PARSER ──
function getActiveSlots(timingRaw: string) {
  const timing = (timingRaw || '').toLowerCase();
  const slots = { morning: false, afternoon: false, evening: false, night: false };

  if (/only if|as needed|sos|prn/.test(timing)) return slots;

  let matched = false;
  if (/morning/.test(timing)) { slots.morning = true; matched = true; }
  if (/afternoon/.test(timing)) { slots.afternoon = true; matched = true; }
  if (/evening/.test(timing)) { slots.evening = true; matched = true; }
  if (/night|bedtime/.test(timing)) { slots.night = true; matched = true; }
  if (matched) return slots;

  const timesMatch = timing.match(/(\d+)\s*times?/);
  const wordMap: Record<string, number> = { once: 1, twice: 2, thrice: 3 };
  let count = 0;
  if (timesMatch) {
    count = parseInt(timesMatch[1], 10);
  } else {
    for (const word of Object.keys(wordMap)) {
      if (timing.includes(word)) { count = wordMap[word]; break; }
    }
  }

  if (count === 1) { slots.morning = true; return slots; }
  if (count === 2) { slots.morning = true; slots.night = true; return slots; }
  if (count === 3) { slots.morning = true; slots.afternoon = true; slots.evening = true; return slots; }
  if (count >= 4) { slots.morning = true; slots.afternoon = true; slots.evening = true; slots.night = true; return slots; }

  if (/daily/.test(timing)) { slots.morning = true; return slots; }

  return slots;
}

// ── CAREGIVER CARD GROUPING (Morning / Afternoon / Night, evening folded into Night) ──
function groupMedicinesForCaregiverCard(medicines: Medicine[]) {
  const groups: { morning: Medicine[]; afternoon: Medicine[]; night: Medicine[]; asNeeded: Medicine[] } = {
    morning: [],
    afternoon: [],
    night: [],
    asNeeded: [],
  };
  (medicines || []).forEach((medicine) => {
    const slots = getActiveSlots(medicine.timing || '');
    let placed = false;
    if (slots.morning) { groups.morning.push(medicine); placed = true; }
    if (slots.afternoon) { groups.afternoon.push(medicine); placed = true; }
    if (slots.evening || slots.night) { groups.night.push(medicine); placed = true; }
    if (!placed) groups.asNeeded.push(medicine);
  });
  return groups;
}

const VALID_SECTIONS: ResultSection[] = ['overview', 'safety', 'analysis', 'actions', 'assistant'];

// Deterministic mock price per medicine so the same list re-renders consistently
function getMockPrice(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return 40 + (hash % 120); // ₹40 - ₹159
}

export default function ResultPage({ result, profile, lang, onResultUpdate }: ResultPageProps) {
  const navigate = useNavigate();
  const t = UI[lang] as Record<string, string>;
  const [currentResult, setCurrentResult] = useState<PrescriptionResult>(result);
  const [translatedLang, setTranslatedLang] = useState<Lang>('en');
  const [translating, setTranslating] = useState(false);
  const [mode, setMode] = useState<ExplainMode>(result.metadata?.explainMode || 'patient');
  const [isOffline, setIsOffline] = useState(() => !navigator.onLine);
  const [isEmergencyOpen, setIsEmergencyOpen] = useState(false);

  // ── CAREGIVER EXPORT CARD STATE ──
  const [showCaregiverCard, setShowCaregiverCard] = useState(false);

  // ── DELIVERY MODAL STATE ──
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('UPI');
  const [trackingStep, setTrackingStep] = useState(0);
  const [coupon, setCoupon] = useState<{ code: string; savings: number; description: string } | null>(null);
  const [couponStatus, setCouponStatus] = useState('');
  const [isMailOpen, setIsMailOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailRecipients, setEmailRecipients] = useState('');
  const [mailStatus, setMailStatus] = useState('');
  const [mailError, setMailError] = useState('');

  // ── TAB PERSISTENCE via sessionStorage ──
  const [activeSection, setActiveSection] = useState<ResultSection>(() => {
    const saved = sessionStorage.getItem(SESSION_TAB_KEY) as ResultSection | null;
    return saved && VALID_SECTIONS.includes(saved) ? saved : 'overview';
  });

  useEffect(() => {
    sessionStorage.setItem(SESSION_TAB_KEY, activeSection);
  }, [activeSection]);

  const resultTabs: { id: ResultSection; label: string }[] = [
    { id: 'overview', label: '💊 Overview' },
    { id: 'safety', label: '🛡️ Safety & Alerts' },
    { id: 'analysis', label: '🔬 Analysis' },
    { id: 'actions', label: '📍 Actions' },
    { id: 'assistant', label: '💬 Medical Assistant' },
  ];

  useEffect(() => { saveResultToHistory(result); }, [result]);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  useEffect(() => { setCurrentResult(result); setTranslatedLang('en'); }, [result]);

  useEffect(() => {
    const reviewStatus = result.metadata?.doctorReview?.status;
    if (!profile.memoryConsent || (reviewStatus !== 'verified' && reviewStatus !== 'corrected')) return;
    const context = `Verified prescription for ${profile.name}: ${result.medicines.map((medicine) => `${medicine.name} ${medicine.dosage} ${medicine.timing}`).join('; ')}`;
    void fetch('/api/memory', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: true, context }) });
  }, [profile.memoryConsent, profile.name, result]);

  useEffect(() => {
    if (lang === 'en') { setCurrentResult(result); setTranslatedLang('en'); return; }
    if (translatedLang === lang) return;
    setTranslating(true);
    translateResult(result, lang)
      .then((translated) => { setCurrentResult(translated); setTranslatedLang(lang); })
      .catch(() => { setCurrentResult(result); setTranslatedLang('en'); })
      .finally(() => setTranslating(false));
  }, [lang, result, translatedLang]);

  const warnings = useMemo(() => [
    ...(currentResult.generalWarnings || []),
    ...(currentResult.usageAlerts || []),
    ...(currentResult.warningsAndCautions || []),
  ], [currentResult]);

  const refillDays = currentResult.metadata?.supplySummary?.nextRefillInDays;
  const runningLow = currentResult.metadata?.supplySummary?.medicinesRunningLow || [];

  const shareText = useMemo(() => {
    const summary = currentResult.medicines?.map((m) => `${m.name} ${m.dosage}`.trim() + ` - ${m.timing}`).join('\n');
    const warningText = warnings.slice(0, 4).join('\n');
    return [
      `MedSutra AI summary for ${profile.name}`, '', summary, '',
      warningText ? `Warnings:\n${warningText}` : 'No major warnings captured.'
    ].join('\n');
  }, [currentResult, profile.name, warnings]);

  // ── CAREGIVER CARD SCHEDULE ──
  const caregiverSchedule = useMemo(
    () => groupMedicinesForCaregiverCard(currentResult.medicines || []),
    [currentResult]
  );

  const { ttsState, toggle: ttsToggle, stop: ttsStop } = useTTS({
    medicines: (currentResult.medicines || []).map((m) => ({
      ...m,
      purpose: getExplanation(m, mode, lang),
      usageAlert: getUsage(m, mode, lang),
      caution: getCaution(m, mode, lang),
    })),
    interactions: (currentResult.interactions || []).map((i) => ({
      drugs: i.drugs,
      description: mode === 'clinical' ? i.descriptionClinical || i.description : i.description,
    })),
    warnings,
  }, lang);

  const handleWhatsAppShare = () => window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
  const handleSmsShare = () => window.open(`sms:?&body=${encodeURIComponent(shareText)}`, '_self');

  // Placeholder: wire up an actual image export (e.g. html-to-image / html2canvas) later
  const handleDownloadCaregiverCard = () => {
    console.log('[MedSutra AI] Download image requested — export not wired up yet.');
  };

  const openDeliveryModal = () => {
    setOrderPlaced(false);
    setCoupon(null);
    setCouponStatus('');
    setIsDeliveryModalOpen(true);
  };

  // ── LIVE ORDER TRACKING SEQUENCE ──
  // Advances trackingStep from 0 to 3 every 2.5s once the order is placed.
  useEffect(() => {
    if (!orderPlaced) {
      setTrackingStep(0);
      return;
    }
    if (trackingStep >= 3) return;
    const timeout = setTimeout(() => {
      setTrackingStep((step) => Math.min(step + 1, 3));
    }, 2500);
    return () => clearTimeout(timeout);
  }, [orderPlaced, trackingStep]);

  const closeDeliveryModal = () => {
    setIsDeliveryModalOpen(false);
    // Reset shortly after close animation so re-opening starts fresh
    setTimeout(() => {
      setOrderPlaced(false);
      setDeliveryAddress('');
    }, 200);
  };

  const cartItems = currentResult.medicines || [];
  const cartTotal = 450; // fixed mock total, per spec
  const discountedTotal = Math.max(0, cartTotal - (coupon?.savings || 0));

  const handlePlaceOrder = () => {
    setOrderPlaced(true);
  };

  const applyBestCoupon = async () => {
    setCouponStatus('Finding the best pharmacy offer…');
    try {
      const response = await fetch('/api/discounts', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtotal: cartTotal, medicineNames: cartItems.map((medicine) => medicine.name) }),
      });
      const body = await response.json() as { coupons?: Array<{ code: string; savings: number; description: string }>; error?: string };
      if (!response.ok) throw new Error(body.error || 'Could not find a coupon.');
      const best = (body.coupons || []).sort((left, right) => right.savings - left.savings)[0];
      if (!best) throw new Error('No eligible offers are available for this order.');
      setCoupon(best); setCouponStatus(`${best.code} applied — save ₹${best.savings}.`);
    } catch (error) { setCouponStatus(error instanceof Error ? error.message : 'Could not find a coupon.'); }
  };

  const openAutoMail = async () => {
    setIsMailOpen(true); setEmailDraft(''); setMailError(''); setMailStatus('Slashy is analyzing your prescription and drafting your email…');
    try {
      const response = await fetch('/api/slashy/draft', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileName: profile.name, prescription: currentResult, recipients: emailRecipients.split(',').map((value) => value.trim()).filter(Boolean) }),
      });
      const body = await response.json() as { draft?: string; error?: string };
      if (!response.ok || !body.draft) throw new Error(body.error || 'Could not draft the email.');
      setEmailDraft(body.draft); setMailStatus('Review and edit the draft before sending.');
    } catch (error) { setMailError(error instanceof Error ? error.message : 'Could not draft the email.'); setMailStatus(''); }
  };

  const sendAutoMail = () => {
    const recipients = emailRecipients.split(',').map((value) => value.trim()).filter(Boolean);
    if (!recipients.length) { setMailError('Add at least one recipient email address.'); return; }
    window.location.href = `mailto:${encodeURIComponent(recipients.join(','))}?subject=${encodeURIComponent(`Medication update for ${profile.name}`)}&body=${encodeURIComponent(emailDraft)}`;
  };

  return (
    <div className="rxb-root" style={{ background: '#E9F3F5', color: '#1a3a6b', minHeight: '100vh', position: 'relative', overflowX: 'hidden' }}>
      <style>{css}</style>
      <div className="rxb-bg-pattern"></div>
      <BackgroundElements />

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 relative z-10">

        <header className="rxb-glass-card mb-8 flex animate-fade-in-up flex-col gap-4 rounded-3xl p-5 lg:flex-row lg:items-center lg:justify-between transition-all duration-300 hover:shadow-[0_12px_30px_rgba(26,111,212,0.08)]">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="rounded-2xl border border-[rgba(255,255,255,0.9)] bg-white/60 p-3 text-[#1a6fd4] shadow-sm transition hover:bg-white hover:shadow-md">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-[#1a3a6b] sm:text-3xl">
                {t.prescriptionSummary || 'Prescription Summary'}
              </h1>
              <p className="mt-1 text-sm font-medium text-[#7b93b8]">
                For {profile.name} • scanned {new Date(currentResult.metadata?.scannedAt || Date.now()).toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {translating && (
              <div className="rounded-2xl border border-[#a8c0e4] bg-[#e8f0fe] px-4 py-2 text-sm font-semibold text-[#1a6fd4]">
                <Languages className="mr-2 inline-block w-4 h-4" /> {t.translating || 'Translating...'}
              </div>
            )}
            {ttsState !== 'unsupported' && (
              <div className="flex items-center gap-2">
                <button onClick={ttsToggle} disabled={ttsState === 'loading'} className="flex items-center gap-2 rounded-2xl border border-[rgba(255,255,255,0.9)] bg-white/70 px-4 py-3 text-sm font-semibold text-[#1a6fd4] shadow-sm transition hover:bg-white">
                  {ttsState === 'playing' ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  {ttsState === 'playing' ? 'Pause audio' : ttsState === 'paused' ? 'Resume audio' : 'Read aloud'}
                </button>
                {(ttsState === 'playing' || ttsState === 'paused') && (
                  <button onClick={ttsStop} className="rounded-2xl border border-[rgba(255,255,255,0.9)] bg-white/70 p-3 text-[#1a6fd4] shadow-sm transition hover:bg-white">
                    <Square className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </header>

        {isOffline && (
          <div className="rxb-glass-card mb-6 rounded-3xl border border-amber-200 bg-amber-50/80 p-4 text-sm font-medium text-amber-900">
            Offline mode is active. Cached prescription history and refill estimates are still available.
          </div>
        )}

        {refillDays != null && (
          <div className={`rxb-glass-card mb-8 flex items-center gap-4 rounded-3xl p-5 ${refillDays <= 3 ? 'border-amber-200 bg-amber-50/80' : 'border-emerald-200 bg-emerald-50/80'}`}>
            <div className={`flex h-12 w-12 items-center justify-center rounded-full ${refillDays <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
              <BellRing className="w-6 h-6" />
            </div>
            <div>
              <div className={`text-lg font-black ${refillDays <= 3 ? 'text-amber-900' : 'text-emerald-900'}`}>
                {refillDays <= 3 ? `Refill in ${refillDays} day${refillDays === 1 ? '' : 's'}` : `Estimated supply lasts about ${refillDays} more day${refillDays === 1 ? '' : 's'}`}
              </div>
              <div className={`mt-0.5 text-sm font-medium ${refillDays <= 3 ? 'text-amber-800' : 'text-emerald-800'}`}>
                {runningLow.length > 0 ? `Running low: ${runningLow.join(', ')}.` : 'Refill timing is estimated from the extracted dosage schedule and supply details.'}
              </div>
            </div>
          </div>
        )}

        <nav className="rxb-glass-card mb-6 overflow-x-auto rounded-3xl p-2 animate-fade-in-up [animation-delay:80ms] scrollbar-hide">
          <div className="flex min-w-max gap-2">
            {resultTabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveSection(tab.id)} className={`rounded-2xl px-5 py-3 text-sm font-bold transition-all duration-300 ${activeSection === tab.id ? 'bg-[#1a6fd4] text-white shadow-[0_4px_12px_rgba(26,111,212,0.3)]' : 'bg-transparent text-[#4a5d7a] hover:bg-white/60 hover:text-[#1a6fd4]'}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        <main>
          <section hidden={activeSection !== 'overview'} className="rxb-glass-card animate-fade-in-up overflow-hidden rounded-[32px]">
            <div className="border-b border-[rgba(255,255,255,0.4)] bg-[#e8f0fe]/30 px-6 py-5 sm:px-8">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#1a6fd4]">Section 1</div>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-[#1a3a6b]">The Core Overview</h2>
            </div>

            <div className="space-y-7 p-6 sm:p-8">
              <div className="rxb-glass-panel rounded-3xl p-6">
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#1a6fd4]">Explanation mode</div>
                <h3 className="mt-2 text-xl font-black tracking-tight text-[#1a3a6b]">Choose your level of detail</h3>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <button onClick={() => setMode('patient')} className={`rounded-2xl border p-5 text-left transition-all duration-300 ${mode === 'patient' ? 'border-[#a8c0e4] bg-[#e8f0fe] text-[#1a6fd4] shadow-sm' : 'border-[rgba(255,255,255,0.9)] bg-white/50 text-[#4a5d7a] hover:bg-white/80'}`}>
                    <div className="font-bold">Patient mode</div>
                    <div className="mt-1 text-sm font-medium opacity-80">Simple, reassuring language for caregivers.</div>
                  </button>
                  <button onClick={() => setMode('clinical')} className={`rounded-2xl border p-5 text-left transition-all duration-300 ${mode === 'clinical' ? 'border-[#a8c0e4] bg-[#e8f0fe] text-[#1a6fd4] shadow-sm' : 'border-[rgba(255,255,255,0.9)] bg-white/50 text-[#4a5d7a] hover:bg-white/80'}`}>
                    <div className="font-bold">Clinical mode</div>
                    <div className="mt-1 text-sm font-medium opacity-80">More medical context for pharmacists.</div>
                  </button>
                </div>
              </div>

              <div className="pt-4">
                <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#1a6fd4]">Medication list</div>
                    <h3 className="mt-2 text-2xl font-black tracking-tight text-[#1a3a6b]">Your medicines at a glance</h3>
                  </div>
                  <div className="rounded-2xl bg-[#1a6fd4] px-5 py-2.5 text-sm font-bold text-white shadow-[0_4px_12px_rgba(26,111,212,0.3)]">
                    {(currentResult.medicines || []).length} meds
                  </div>
                </div>
                <div className="space-y-4">
                  {(currentResult.medicines || []).map((medicine, index) => (
                    <MedicineCard key={`${medicine.name}-${index}`} medicine={medicine} mode={mode} lang={lang} />
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-200/60 pt-7">
                <div className="rxb-glass-panel rounded-3xl p-5">
                  <div className="text-xs font-bold uppercase tracking-[0.22em] text-[#1a6fd4]">Doctor review status</div>
                  <div className="mt-3 rounded-2xl border border-[rgba(255,255,255,0.9)] bg-white/70 p-4 text-sm text-[#4a5d7a] shadow-sm">
                    <div className="font-bold capitalize text-[#1a3a6b]">{currentResult.metadata?.doctorReview?.status || 'pending'}</div>
                    <div className="mt-1 font-medium">
                      {currentResult.metadata?.doctorReview?.reviewerName ? `Reviewed by ${currentResult.metadata.doctorReview.reviewerName}` : 'No doctor or pharmacist has confirmed this scan yet.'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section hidden={activeSection !== 'safety'} className="rxb-glass-card animate-fade-in-up overflow-hidden rounded-[32px] border-[#fca5a5]/40 bg-gradient-to-br from-[#fef2f2]/80 to-white/60 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#fee2e2] text-[#dc2626] shadow-sm">
                <MessageCircleWarning className="h-7 w-7" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#dc2626]">Section 2 · Safety & alerts</div>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-[#1a3a6b]">Warnings and review flags</h2>
              </div>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {warnings.map((warning, index) => (
                <div key={`${warning}-${index}`} className="rounded-2xl border border-[#fecaca]/50 bg-white/90 p-5 text-sm font-medium text-[#4a5d7a] shadow-sm">
                  {translateMedText(warning, lang)}
                </div>
              ))}
              {warnings.length === 0 && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-5 text-sm font-bold text-emerald-800 shadow-sm">
                  No major unresolved warnings were captured.
                </div>
              )}
            </div>
          </section>

          <section hidden={activeSection !== 'analysis'} className="rxb-glass-card animate-fade-in-up rounded-[32px] p-6 sm:p-8">
            <div className="mb-6">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#1a6fd4]">Section 3 · Analysis</div>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-[#1a3a6b]">Medication interaction graph</h2>
            </div>
            <div className="overflow-hidden rounded-3xl border border-[rgba(255,255,255,0.9)] bg-white/40 p-2 shadow-inner">
              <InteractionGraph medicines={currentResult.medicines || []} interactions={currentResult.interactions || []} />
            </div>
          </section>

          <section hidden={activeSection !== 'actions'} className="animate-fade-in-up rounded-[32px] bg-[rgba(255,255,255,0.85)] backdrop-blur-[12px] border border-[#a8c0e4] shadow-[0_0_20px_rgba(26,111,212,0.15)] p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f0fe] text-[#1a6fd4] shadow-sm">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#1a6fd4]">Section 4 · Actions</div>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-[#1a3a6b]">Share and verify</h2>
              </div>
            </div>

            {/* ── ORDER HOME DELIVERY (prominent CTA) ── */}
            <button
              onClick={openDeliveryModal}
              className="mt-8 flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-base font-bold text-white shadow-[0_8px_24px_rgba(79,70,229,0.35)] transition hover:-translate-y-1 hover:shadow-[0_12px_32px_rgba(79,70,229,0.45)] active:translate-y-0"
            >
              <Package className="h-6 w-6" />
              Order Home Delivery
            </button>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <button onClick={handleWhatsAppShare} className="flex items-center justify-center gap-3 rounded-full bg-[#1a6fd4] px-5 py-4 font-bold text-white shadow-[0_4px_14px_rgba(26,111,212,0.25)] transition hover:-translate-y-1 hover:bg-[#155db8]">
                <Share2 className="h-5 w-5" />Share via WhatsApp
              </button>

              {/* ── CAREGIVER CARD TRIGGER (gradient ring to stand out as a visual feature) ── */}
              <button
                onClick={() => setShowCaregiverCard(true)}
                className="group relative flex items-center justify-center rounded-full bg-gradient-to-r from-fuchsia-500 via-blue-500 to-cyan-400 p-[2px] shadow-[0_4px_14px_rgba(59,130,246,0.3)] transition hover:-translate-y-1 hover:shadow-[0_8px_22px_rgba(59,130,246,0.4)]"
              >
                <span className="flex w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-4 font-bold text-[#1a3a6b] transition group-hover:bg-white/95">
                  <Layout className="h-5 w-5 text-blue-600" />
                  Caregiver Card
                </span>
              </button>

              <button onClick={handleSmsShare} className="flex items-center justify-center gap-3 rounded-full border border-[#a8c0e4] bg-white/80 px-5 py-4 font-bold text-[#1a6fd4] shadow-sm transition hover:-translate-y-1 hover:bg-[#e8f0fe]">
                <Smartphone className="h-5 w-5" />Export by SMS
              </button>
              <button onClick={() => navigate('/verify')} className="flex items-center justify-center gap-3 rounded-full border border-[#a8c0e4] bg-white/80 px-5 py-4 font-bold text-[#1a6fd4] shadow-sm transition hover:-translate-y-1 hover:bg-[#e8f0fe]">
                <Stethoscope className="h-5 w-5" />Doctor Portal
              </button>
              <button onClick={() => navigate('/pharmacies')} className="flex items-center justify-center gap-3 rounded-full border border-[#a8c0e4] bg-white/80 px-5 py-4 font-bold text-[#1a6fd4] shadow-sm transition hover:-translate-y-1 hover:bg-[#e8f0fe]">
                <MapPin className="h-5 w-5" />Find Pharmacies
              </button>
              <button onClick={openAutoMail} className="flex items-center justify-center gap-3 rounded-full border border-violet-200 bg-violet-50 px-5 py-4 font-bold text-violet-700 shadow-sm transition hover:-translate-y-1 hover:bg-violet-100">
                <Mail className="h-5 w-5" />Auto-Mail via Slashy
              </button>
              <button onClick={() => navigate('/consult')} className="flex items-center justify-center gap-3 rounded-full border border-emerald-200 bg-emerald-50 px-5 py-4 font-bold text-emerald-700 shadow-sm transition hover:-translate-y-1 hover:bg-emerald-100">
                <Stethoscope className="h-5 w-5" />Consult Doctor
              </button>
            </div>
          </section>

          <section hidden={activeSection !== 'assistant'} className="rxb-glass-card animate-fade-in-up overflow-hidden rounded-[32px]">
            <div className="border-b border-[rgba(255,255,255,0.4)] bg-[#e8f0fe]/30 px-6 py-5 sm:px-8">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#1a6fd4]">Section 5 · Medical assistant</div>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-[#1a3a6b]">Ask MedSutra AI</h2>
            </div>
            <div className="p-2 sm:p-4">
              <ScopedChatPanel result={currentResult} mode={mode} />
            </div>
          </section>
        </main>
      </div>

      {/* ── EMERGENCY FAB ── */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {isEmergencyOpen && (
          <div className="fab-menu-enter w-52 rounded-2xl border border-slate-200 bg-white/90 p-2 shadow-xl backdrop-blur-md">
            <div className="mb-1.5 px-3 pt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Emergency Contacts
            </div>
            {[
              { label: 'National Emergency', number: '112', color: 'text-rose-600' },
              { label: 'Ambulance', number: '108', color: 'text-orange-600' },
              { label: 'Health Helpline', number: '104', color: 'text-blue-600' },
            ].map(({ label, number, color }) => (
              <a
                key={number}
                href={`tel:${number}`}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50"
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 ${color}`}>
                  <PhoneCall className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="text-[13px] font-bold text-slate-800">{label}</div>
                  <div className={`text-xs font-semibold ${color}`}>{number}</div>
                </div>
              </a>
            ))}
          </div>
        )}
        <button
          onClick={() => setIsEmergencyOpen((o) => !o)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/90 text-white shadow-[0_4px_20px_rgba(225,29,72,0.4)] backdrop-blur-md transition-all duration-200 hover:scale-110 hover:bg-rose-600 active:scale-95"
          aria-label="Emergency contacts"
        >
          {isEmergencyOpen ? <X className="h-6 w-6" /> : <PhoneCall className="h-6 w-6" />}
        </button>
      </div>

      {/* ── CAREGIVER EXPORT CARD MODAL ── */}
      {showCaregiverCard && (
        <div
          className="modal-backdrop-enter fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => setShowCaregiverCard(false)}
        >
          <div className="modal-card-enter flex flex-col items-center gap-5" onClick={(e) => e.stopPropagation()}>
            {/* 9:16 "story" card */}
            <div className="flex h-[568px] w-[320px] flex-col overflow-hidden rounded-[28px] border border-white/60 bg-gradient-to-br from-blue-50 via-white to-blue-100 shadow-[0_24px_60px_rgba(15,23,42,0.35)]">
              <div className="px-6 pb-3 pt-7 text-center">
                <div className="text-lg font-black tracking-tight text-[#1a6fd4]">Med Sutra AI</div>
                <div className="mt-1.5 text-sm font-bold text-[#1a3a6b]">Daily Schedule for {profile.name}</div>
                <div className="mt-1 text-[10px] font-semibold text-[#7b93b8]">
                  Based on prescription scanned {new Date(currentResult.metadata?.scannedAt || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                {profile.allergies && profile.allergies.length > 0 && (
                  <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50/90 px-3 py-1 text-[10px] font-bold text-rose-700">
                    ⚠️ Allergies: {profile.allergies.join(', ')}
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-2">
                {[
                  { key: 'morning' as const, label: 'Morning', icon: Sun, ring: 'from-amber-200 to-amber-100', iconColor: 'text-amber-600' },
                  { key: 'afternoon' as const, label: 'Afternoon', icon: CloudSun, ring: 'from-sky-200 to-sky-100', iconColor: 'text-sky-600' },
                  { key: 'night' as const, label: 'Night', icon: Moon, ring: 'from-indigo-200 to-indigo-100', iconColor: 'text-indigo-600' },
                ].map(({ key, label, icon: Icon, ring, iconColor }) => {
                  const meds = caregiverSchedule[key];
                  if (!meds || meds.length === 0) return null;
                  return (
                    <div key={key} className="rounded-2xl border border-white/80 bg-white/55 p-3 shadow-sm backdrop-blur-md">
                      <div className="mb-2 flex items-center gap-2">
                        <div className={`flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br ${ring} ${iconColor}`}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-[#1a3a6b]">{label}</div>
                      </div>
                      <div className="space-y-1.5">
                        {meds.map((medicine, index) => {
                          const foodNote = medicine.foodWarning ? translateMedText(medicine.foodWarning, lang) : '';
                          const cautionNote = translateMedText(getCaution(medicine, mode, lang), lang);
                          const usageNote = translateMedText(getUsage(medicine, mode, lang), lang);
                          const alertNote = cautionNote || usageNote;
                          return (
                            <div key={`${medicine.name}-${index}`} className="rounded-xl bg-white/80 px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-[13px] font-bold text-[#1a3a6b]">{medicine.name}</span>
                                <span className="shrink-0 text-[11px] font-semibold text-[#7b93b8]">{medicine.dosage || 'Dosage not captured'}</span>
                              </div>
                              {medicine.timing && (
                                <div className="mt-0.5 text-[10px] font-medium text-[#94a3b8]">{medicine.timing}</div>
                              )}
                              {foodNote && (
                                <div className="mt-1 text-[10px] font-semibold text-amber-700">🍴 {foodNote}</div>
                              )}
                              {alertNote && (
                                <div className="mt-1 text-[10px] font-semibold text-rose-600">⚠️ {alertNote}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {caregiverSchedule.asNeeded.length > 0 && (
                  <div className="rounded-2xl border border-white/80 bg-white/55 p-3 shadow-sm backdrop-blur-md">
                    <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#1a3a6b]">As needed</div>
                    <div className="space-y-1.5">
                      {caregiverSchedule.asNeeded.map((medicine, index) => {
                        const foodNote = medicine.foodWarning ? translateMedText(medicine.foodWarning, lang) : '';
                        const cautionNote = translateMedText(getCaution(medicine, mode, lang), lang);
                        const usageNote = translateMedText(getUsage(medicine, mode, lang), lang);
                        const alertNote = cautionNote || usageNote;
                        return (
                          <div key={`${medicine.name}-${index}`} className="rounded-xl bg-white/80 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[13px] font-bold text-[#1a3a6b]">{medicine.name}</span>
                              <span className="shrink-0 text-[11px] font-semibold text-[#7b93b8]">{medicine.dosage || 'Dosage not captured'}</span>
                            </div>
                            {medicine.timing && (
                              <div className="mt-0.5 text-[10px] font-medium text-[#94a3b8]">{medicine.timing}</div>
                            )}
                            {foodNote && (
                              <div className="mt-1 text-[10px] font-semibold text-amber-700">🍴 {foodNote}</div>
                            )}
                            {alertNote && (
                              <div className="mt-1 text-[10px] font-semibold text-rose-600">⚠️ {alertNote}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {warnings.length > 0 && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-3 shadow-sm backdrop-blur-md">
                    <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-rose-700">General warnings</div>
                    <div className="space-y-1">
                      {warnings.slice(0, 4).map((warning, index) => (
                        <div key={`${warning}-${index}`} className="text-[10px] font-semibold text-rose-700">
                          • {translateMedText(warning, lang)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-5 pb-5 pt-3 text-center">
                <div className="text-[10px] font-semibold text-[#a8b8cf]">Generated safely by Med Sutra AI</div>
                <div className="mt-0.5 text-[9px] font-medium text-[#c3cfe0]">Not a substitute for professional medical advice</div>
              </div>
            </div>

            {/* Modal actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowCaregiverCard(false)}
                className="rounded-full border border-white/70 bg-white/85 px-5 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-white"
              >
                Close
              </button>
              <button
                onClick={handleDownloadCaregiverCard}
                className="flex items-center gap-2 rounded-full bg-[#1a6fd4] px-5 py-2.5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(26,111,212,0.3)] transition hover:bg-[#155db8]"
              >
                <Download className="h-4 w-4" />
                Download Image
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELIVERY CHECKOUT MODAL ── */}
      {isDeliveryModalOpen && (
        <div
          className="modal-backdrop-enter fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onClick={closeDeliveryModal}
        >
          <div
            className="modal-card-enter w-full max-w-md overflow-hidden rounded-[28px] border border-white/60 bg-white/90 shadow-[0_24px_60px_rgba(15,23,42,0.25)] backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {!orderPlaced ? (
              <>
                {/* Header — ETA & Sourcing */}
                <div className="relative border-b border-slate-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-6 py-5">
                  <button
                    onClick={closeDeliveryModal}
                    className="absolute right-5 top-5 rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-800"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="text-lg font-black tracking-tight text-emerald-600">
                    ⚡ Arriving in 14 minutes
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    Fulfilling from Wellness Forever, Pimpri-Chinchwad
                  </div>
                </div>

                <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
                  {/* Delivery Partner Contact */}
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                        <Package className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-800">Ramesh is near the pharmacy</div>
                        <div className="text-xs font-medium text-slate-400">Your delivery partner</div>
                      </div>
                    </div>
                    <a
                      href="tel:+911234567890"
                      className="flex shrink-0 items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800"
                    >
                      📞 Call Partner
                    </a>
                  </div>

                  {/* Compact Cart */}
                  <div className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Order summary</div>
                  <div className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
                    {cartItems.length === 0 && (
                      <div className="p-3 text-sm text-slate-500">No medicines found in this prescription.</div>
                    )}
                    {cartItems.map((medicine, index) => (
                      <div
                        key={`${medicine.name}-${index}`}
                        className="flex items-center justify-between px-4 py-2.5"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="truncate text-sm font-bold text-slate-800">{medicine.name}</div>
                          <div className="truncate text-[11px] font-medium text-slate-400">{medicine.dosage || 'Dosage not captured'}</div>
                        </div>
                        <div className="shrink-0 text-sm font-bold text-blue-700">₹{getMockPrice(medicine.name)}</div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
                      <span className="text-sm font-semibold opacity-80">Total</span>
                      <span className="text-base font-black">₹{discountedTotal}</span>
                    </div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div><div className="text-sm font-bold text-violet-900">Apply coupon</div><div className="mt-1 text-xs text-violet-700">Find the best delivery discount with GenZDeal AI.</div></div>
                      <button type="button" onClick={applyBestCoupon} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white"><Tag className="h-3.5 w-3.5" />Apply</button>
                    </div>
                    {couponStatus && <div className={`mt-3 text-xs font-semibold ${coupon ? 'text-emerald-700' : 'text-violet-700'}`}>{couponStatus}</div>}
                  </div>

                  {/* Address Input */}
                  <div className="mt-5">
                    <label className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Delivery Address</label>
                    <input
                      type="text"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Flat / House no., street, area, city, pincode"
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm font-medium text-slate-800 placeholder:text-slate-400 shadow-inner outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                    />
                  </div>

                  {/* Payment Method */}
                  <div className="mt-5">
                    <label className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Payment Method</label>
                    <div className="mt-2 space-y-2">
                      {[
                        { id: 'UPI', label: 'UPI (GPay/PhonePe)' },
                        { id: 'CARD', label: 'Credit/Debit Card' },
                        { id: 'COD', label: 'Cash on Delivery (COD)' },
                      ].map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setPaymentMethod(option.id)}
                          className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ${
                            paymentMethod === option.id
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          {option.label}
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                              paymentMethod === option.id ? 'border-blue-500' : 'border-slate-300'
                            }`}
                          >
                            {paymentMethod === option.id && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* CTA */}
                  <button
                    onClick={handlePlaceOrder}
                    disabled={cartItems.length === 0 || deliveryAddress.trim().length === 0}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 text-base font-bold text-white shadow-[0_8px_20px_rgba(79,70,229,0.35)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
                  >
                    <Package className="h-5 w-5" />
                    {paymentMethod === 'COD'
                      ? 'Place Order (COD)'
                      : `Pay ₹${discountedTotal} via ${paymentMethod === 'UPI' ? 'UPI' : 'Card'}`}
                  </button>
                  <p className="mt-3 text-center text-[11px] font-medium text-slate-400">
                    Mock checkout for demo purposes — no real payment is processed.
                  </p>
                </div>
              </>
            ) : (
              /* Live Order Tracking */
              <div className="px-6 py-6">
                <div className="text-center">
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-600">Med Sutra Delivery</div>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-900">Tracking Your Order</h3>
                </div>

                {/* Map Placeholder */}
                <div
                  className="relative mt-5 flex h-36 flex-col items-center justify-center overflow-hidden rounded-2xl border border-white bg-slate-100/50 text-blue-900 shadow-inner"
                  style={{
                    backgroundImage:
                      'linear-gradient(rgba(148,163,184,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.25) 1px, transparent 1px)',
                    backgroundSize: '18px 18px',
                  }}
                >
                  <div className="animate-bounce rounded-full bg-white/80 p-3 shadow-md">
                    <Truck className="h-7 w-7 text-blue-700" />
                  </div>
                  <div className="mt-2 text-sm font-bold text-blue-900">Ramesh is en route...</div>
                </div>

                {/* Progress Timeline */}
                <div className="mt-6 space-y-4">
                  {[
                    'Order Confirmed at Wellness Forever',
                    'Medicines Verified & Packed',
                    'Out for Delivery',
                    'Arriving at your location in 2 mins!',
                  ].map((label, index) => {
                    const isDone = index < trackingStep;
                    const isActive = index === trackingStep;
                    return (
                      <div key={label} className="flex items-start gap-3">
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                            isDone
                              ? 'bg-emerald-100 text-emerald-600'
                              : isActive
                              ? 'bg-blue-100 text-blue-600 animate-pulse'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Package className="h-3.5 w-3.5" />}
                        </div>
                        <div
                          className={`pt-0.5 text-sm ${
                            isActive
                              ? 'font-bold text-slate-900'
                              : isDone
                              ? 'font-medium text-slate-500'
                              : 'font-medium text-slate-400'
                          }`}
                        >
                          {label}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Driver Card */}
                <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                      <Package className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">Ramesh · ⭐️ 4.9 rating</div>
                      <div className="text-xs font-medium text-slate-400">Your delivery partner</div>
                    </div>
                  </div>
                  <a
                    href="tel:+911234567890"
                    className="flex shrink-0 items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800"
                  >
                    📞 Call Partner
                  </a>
                </div>

                <button
                  onClick={closeDeliveryModal}
                  className="mt-6 w-full rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {isMailOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={() => setIsMailOpen(false)}>
          <div className="w-full max-w-xl rounded-[28px] bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4"><div><div className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600">Slashy AI</div><h3 className="mt-1 text-xl font-black text-slate-900">Caregiver email draft</h3></div><button onClick={() => setIsMailOpen(false)} className="rounded-full bg-slate-100 p-2 text-slate-500"><X className="h-4 w-4" /></button></div>
            {mailStatus && <p className="mt-4 rounded-2xl bg-violet-50 p-3 text-sm text-violet-800">{mailStatus}</p>}
            {mailError && <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm text-rose-700">{mailError}</p>}
            <label className="mt-5 block text-sm font-bold text-slate-700">Recipients <span className="font-normal text-slate-400">(comma-separated)</span><input value={emailRecipients} onChange={(event) => setEmailRecipients(event.target.value)} placeholder="family@example.com" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-violet-400" /></label>
            {emailDraft && <label className="mt-4 block text-sm font-bold text-slate-700">Review draft<textarea value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} className="mt-2 min-h-56 w-full rounded-2xl border border-slate-200 p-4 text-sm font-normal leading-6 outline-none focus:border-violet-400" /></label>}
            <div className="mt-5 flex justify-end gap-3"><button onClick={() => setIsMailOpen(false)} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700">Cancel</button><button disabled={!emailDraft} onClick={sendAutoMail} className="rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Open mail client</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MEDICINE FORM ICONS
// ─────────────────────────────────────────────────────────────────────────────
function TabletIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <circle cx="16" cy="16" r="13" fill="#e8f0fe" stroke="#1a6fd4" strokeWidth="1.5" />
      <path d="M16 3v26" stroke="#1a6fd4" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2.2" fill="#ffffff" fillOpacity="0.7" />
    </svg>
  );
}

function CapsuleIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect x="3" y="12" width="26" height="8" rx="4" fill="#c7d9f5" stroke="#1a6fd4" strokeWidth="1.2" transform="rotate(-30 16 16)" />
      <path d="M13.5 9.5 L21 22.5" stroke="#1a6fd4" strokeWidth="1.2" strokeLinecap="round" transform="rotate(0)" />
      <rect x="3" y="12" width="13" height="8" rx="4" fill="#1a6fd4" transform="rotate(-30 16 16)" />
    </svg>
  );
}

function SyrupIcon({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none">
      <rect x="12" y="4" width="8" height="5" rx="1" fill="#94a3b8" />
      <path d="M13 9h6l2 5v11a2 2 0 01-2 2h-6a2 2 0 01-2-2V14l2-5z" fill="#dbeafe" stroke="#1a6fd4" strokeWidth="1.2" />
      <rect x="11" y="18" width="10" height="6" fill="#60a5fa" opacity="0.7" />
    </svg>
  );
}

function getMedicineIcon(medicineName: string, dosage: string) {
  const text = `${medicineName || ''} ${dosage || ''}`.toLowerCase();
  if (/\bml\b|syrup|suspension/.test(text)) return SyrupIcon;
  if (/\bcap\b|capsule/.test(text)) return CapsuleIcon;
  return TabletIcon;
}

// ─────────────────────────────────────────────────────────────────────────────
// MEDICINE CARD
// ─────────────────────────────────────────────────────────────────────────────
const TIME_SLOTS: { key: 'morning' | 'afternoon' | 'evening' | 'night'; label: string; icon: any }[] = [
  { key: 'morning', label: 'Morning', icon: Sun },
  { key: 'afternoon', label: 'Afternoon', icon: Clock },
  { key: 'evening', label: 'Evening', icon: CloudSun },
  { key: 'night', label: 'Night', icon: Moon },
];

function MedicineCard({ medicine, mode, lang }: { medicine: Medicine; mode: ExplainMode; lang: Lang; }) {
  const explanation = translateMedText(getExplanation(medicine, mode, lang), lang);
  const usage = translateMedText(getUsage(medicine, mode, lang), lang);
  const caution = translateMedText(getCaution(medicine, mode, lang), lang);
  const slots = getActiveSlots(medicine.timing || '');
  const MedicineIcon = getMedicineIcon(medicine.name, medicine.dosage || '');

  return (
    <article className="rxb-glass-panel overflow-hidden rounded-[24px] p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(26,111,212,0.08)] hover:bg-white/90">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex shrink-0 items-center justify-center rounded-full bg-white/60 p-1.5 shadow-sm">
            <MedicineIcon className="h-8 w-8" />
          </div>
          <div>
            <div className="text-xl font-black tracking-tight text-[#1a3a6b]">{medicine.name}</div>
            <div className="mt-1 text-sm font-semibold text-[#7b93b8]">{medicine.dosage || 'Dosage not captured'}</div>
          </div>
        </div>
        <div className="rounded-full border border-[#a8c0e4] bg-[#e2ecfc] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#1a6fd4]">
          {medicine.timing || 'As directed'}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-4 gap-2">
        {TIME_SLOTS.map(({ key, label, icon: Icon }) => {
          const active = slots[key];
          return (
            <div
              key={key}
              className={`flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-[11px] font-bold transition-all duration-300 ${
                active
                  ? 'border-[#1a6fd4] bg-[#1a6fd4] text-white shadow-[0_4px_12px_rgba(26,111,212,0.3)]'
                  : 'border-[rgba(255,255,255,0.9)] bg-white/50 text-[#a8b8cf]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </div>
          );
        })}
      </div>

      {explanation && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-white/50 px-4 py-3 text-sm font-medium text-[#374151]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#1e9e52]" />
          <div><span className="font-bold text-[#1a3a6b]">Purpose:</span> {explanation}</div>
        </div>
      )}

      {(usage || medicine.foodWarning || caution) && (
        <div className="mt-3 space-y-2">
          {medicine.foodWarning && <Notice tone="amber" emoji="🍴" text={translateMedText(medicine.foodWarning, lang)} />}
          {usage && <Notice tone="blue" text={usage} />}
          {caution && <Notice tone="rose" emoji="⚠️" text={caution} />}
        </div>
      )}
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function Notice({ tone, text, emoji }: { tone: 'blue' | 'amber' | 'rose'; text: string; emoji?: string }) {
  const styles = {
    blue: 'border-[#a8c0e4] bg-[#e8f0fe] text-[#1a6fd4]',
    amber: 'border-[#fde68a] bg-[#fffbeb] text-[#d97706]',
    rose: 'border-[#fecaca] bg-[#fef2f2] text-[#dc2626]',
  }[tone];
  return (
    <div className={`rounded-[16px] border px-4 py-3 text-sm font-semibold ${styles}`}>
      {emoji && <span className="mr-1.5">{emoji}</span>}
      {text}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPLANATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function getExplanation(medicine: Medicine, mode: ExplainMode, lang: Lang) {
  return mode === 'clinical' ? medicine.purposeClinical || medicine.purpose || '' : medicine.purpose || '';
}

function getUsage(medicine: Medicine, mode: ExplainMode, lang: Lang) {
  return mode === 'clinical' ? medicine.usageAlertClinical || medicine.usageAlert || '' : medicine.usageAlert || medicine.usageAlertClinical || '';
}

function getCaution(medicine: Medicine, mode: ExplainMode, lang: Lang) {
  return mode === 'clinical' ? medicine.cautionClinical || medicine.caution || '' : medicine.caution || medicine.cautionClinical || '';
}
