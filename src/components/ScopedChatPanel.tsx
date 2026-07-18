import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Mic, MicOff, Send } from 'lucide-react';
import { ExplainMode, Lang, PrescriptionChatMessage, PrescriptionResult } from '../types';
import { callMedicalChatbot } from '../services/aiService';
import { UI } from '../i18n';

interface ScopedChatPanelProps {
  result: PrescriptionResult;
  mode: ExplainMode;
  lang: Lang;
}

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AVATAR — reused in empty state and beside every AI bubble
// ─────────────────────────────────────────────────────────────────────────────
function DoctorAvatar({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  if (size === 'lg') {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#e8f0fe] to-[#c7d9f9] shadow-[0_4px_16px_rgba(26,111,212,0.18)] ring-4 ring-white">
          <Bot className="h-8 w-8 text-[#1a6fd4]" />
        </div>
        <div className="rounded-full bg-[#1a6fd4] px-3 py-0.5 text-[10px] font-bold tracking-widest text-white shadow-sm">
          MedSutra AI
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#e8f0fe] to-[#c7d9f9] ring-2 ring-white shadow-sm">
      <Bot className="h-3.5 w-3.5 text-[#1a6fd4]" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function ScopedChatPanel({ result, mode, lang }: ScopedChatPanelProps) {
  const t = UI[lang] as Record<string, string>;
  const [messages, setMessages] = useState<PrescriptionChatMessage[]>(
    result.chatHistory || []
  );
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages(result.chatHistory || []);
  }, [result.chatHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = async () => {
    const question = input.trim();
    if (!question || loading) return;

    const createdAt = new Date().toISOString();
    const userMessage: PrescriptionChatMessage = {
      role: 'user',
      content: question,
      createdAt,
    };

    setMessages(current => [...current, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const answer = await callMedicalChatbot(messages, question, result, mode);
      setMessages(current => [
        ...current,
        { role: 'assistant', content: answer, createdAt: new Date().toISOString() },
      ]);
    } catch (error) {
      console.error('[MedSutra AI] Chat request failed.', {
        error,
        message: error instanceof Error ? error.message : String(error),
        question,
        historyMessageCount: messages.length,
        mode,
        prescriptionContext: {
          medicineCount: result.medicines?.length ?? 0,
          interactionCount: result.interactions?.length ?? 0,
          warningCount: (result.generalWarnings?.length ?? 0) + (result.warningsAndCautions?.length ?? 0),
        },
      });
      setMessages(current => [
        ...current,
        {
          role: 'assistant',
          content: 'Sorry, I could not reach the AI right now. Please check your connection and try again.',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const startBrowserVoice = () => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      setInput(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const transcribeRecording = async (audio: Blob) => {
    const audioBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(audio);
    });
    const response = await fetch('/api/voice/transcribe', {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64, mimeType: audio.type || 'audio/webm', language: 'en-IN' }),
    });
    const body = await response.json().catch(() => ({})) as { text?: string; error?: string };
    if (!response.ok || !body.text) throw new Error(body.error || 'Voice transcription failed.');
    setInput(body.text);
  };

  const handleVoice = async () => {
    if (listening && recorderRef.current) {
      recorderRef.current.stop();
      return;
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) audioChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        recorderRef.current = null;
        setListening(false);
        const audio = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        void transcribeRecording(audio).catch(() => startBrowserVoice());
      };
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      setListening(true);
      recorder.start();
    } catch {
      startBrowserVoice();
    }
  };

  useEffect(() => () => recordingStreamRef.current?.getTracks().forEach((track) => track.stop()), []);

  const SUGGESTIONS = [
    'When do I take Amoxicillin?',
    'Side effects of Pantoprazole?',
    'Can I take paracetamol now?',
    'Foods to avoid with antibiotics?',
  ];

  return (
    <div className="flex flex-col gap-0 overflow-hidden rounded-3xl border border-slate-100 bg-[#f7faff] shadow-sm">

      {/* ── HEADER ── */}
      <div className="flex items-center gap-3 border-b border-slate-100 bg-white px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1a6fd4] to-[#4f9cf9] shadow-[0_2px_8px_rgba(26,111,212,0.3)]">
          <Bot className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-sm font-bold text-[#1a3a6b]">{t.medicalAiAssistant}</div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_#34d399]" />
            <span className="text-[11px] font-medium text-slate-400">Online · Prescription context loaded</span>
          </div>
        </div>
      </div>

      {/* ── MESSAGE AREA ── */}
      <div className="h-80 space-y-4 overflow-y-auto px-4 py-5">

        {/* Empty state */}
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center gap-5 py-4">
            <DoctorAvatar size="lg" />
            <p className="text-center text-sm font-medium text-slate-500">
              Hi! I'm MedSutra AI. Ask me anything about your medicines, symptoms, or health.
            </p>
            <div className="flex w-full flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="rounded-full border border-[#c7d9f9] bg-white px-3 py-1.5 text-xs font-semibold text-[#1a6fd4] shadow-sm transition hover:bg-[#e8f0fe]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((message, index) => (
          <div
            key={`${message.createdAt}-${index}`}
            className={`flex items-end gap-2 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            {/* Avatar beside AI messages only */}
            {message.role === 'assistant' && <DoctorAvatar size="sm" />}

            <div
              className={`max-w-[80%] px-4 py-3 text-sm leading-relaxed ${
                message.role === 'user'
                  ? 'rounded-2xl rounded-br-sm bg-[#1a6fd4] text-white shadow-[0_2px_12px_rgba(26,111,212,0.25)]'
                  : 'rounded-2xl rounded-bl-sm border border-slate-100 bg-white text-slate-700 shadow-sm'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}

        {/* Loading bubble */}
        {loading && (
          <div className="flex items-end gap-2">
            <DoctorAvatar size="sm" />
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-slate-100 bg-white px-4 py-3 shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1a6fd4]" />
              <span className="text-xs font-medium text-slate-400">MedSutra AI is thinking…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── INPUT AREA ── */}
      <div className="border-t border-slate-100 bg-white px-4 py-4">
        <div className={`flex items-center gap-2 rounded-2xl border-2 bg-white px-3 py-2 shadow-[0_4px_16px_rgba(26,111,212,0.08)] transition-all duration-200 focus-within:border-[#1a6fd4] focus-within:ring-4 focus-within:ring-blue-50 ${listening ? 'border-rose-300' : 'border-blue-100'}`}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleSend(); }}
            placeholder="Ask about any health, medicine or wellness question…"
            disabled={loading}
            className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none disabled:opacity-60"
          />

          {/* Mic button */}
          <button
            onClick={handleVoice}
            disabled={loading}
            title="Voice input"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-150 disabled:opacity-50 ${
              listening
                ? 'bg-rose-500 text-white shadow-[0_2px_8px_rgba(239,68,68,0.35)] hover:bg-rose-600'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#1a6fd4] text-white shadow-[0_2px_8px_rgba(26,111,212,0.35)] transition-all duration-150 hover:bg-[#155db8] disabled:opacity-40"
          >
            {loading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />
            }
          </button>
        </div>

        <p className="mt-2 text-center text-[10px] text-slate-400">
          MedSutra AI · Not a substitute for professional medical advice
        </p>
      </div>

    </div>
  );
}
