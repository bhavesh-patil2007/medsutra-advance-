import { FormEvent, useState } from 'react';
import { ArrowLeft, CalendarDays, MessageCircle, Phone, Stethoscope, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function ConsultDoctorPage() {
  const navigate = useNavigate();
  const [reason, setReason] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [consultationType, setConsultationType] = useState<'video' | 'chat' | 'phone'>('video');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSubmitting(true); setError('');
    try {
      const response = await fetch('/api/consultations', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason, preferredDate, preferredTime, consultationType }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Could not request a consultation.');
      setStatus('Your request has been received. A healthcare representative will confirm the appointment securely.');
      setReason(''); setPreferredDate(''); setPreferredTime('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Please try again.'); }
    finally { setSubmitting(false); }
  };
  const options = [{ id: 'video', label: 'Video consultation', icon: Video }, { id: 'chat', label: 'Secure chat', icon: MessageCircle }, { id: 'phone', label: 'Phone call', icon: Phone }] as const;
  return <div className="min-h-screen bg-[#e9f3f5] px-4 py-8 text-slate-900"><div className="mx-auto max-w-2xl"><button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm font-bold text-blue-700"><ArrowLeft className="h-4 w-4" /> Back</button><div className="mt-5 rounded-[30px] border border-white bg-white/90 p-6 shadow-xl shadow-blue-100/60 sm:p-8"><div className="flex items-start gap-4"><div className="rounded-2xl bg-blue-600 p-3 text-white"><Stethoscope className="h-7 w-7" /></div><div><h1 className="text-2xl font-black text-[#1a3a6b]">Consult a doctor</h1><p className="mt-1 text-sm leading-6 text-slate-600">Request a consultation now. The booking model supports secure chat, phone, and future video visits.</p></div></div><form onSubmit={submit} className="mt-7 space-y-5"><div className="grid gap-3 sm:grid-cols-3">{options.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setConsultationType(id)} className={`rounded-2xl border p-4 text-left transition ${consultationType === id ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-700'}`}><Icon className="h-5 w-5" /><div className="mt-2 text-sm font-bold">{label}</div></button>)}</div><label className="block"><span className="mb-2 block text-sm font-bold">What would you like help with?</span><textarea required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Briefly describe your concern. Do not use this form for emergencies." className="min-h-28 w-full rounded-2xl border border-slate-200 p-4 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-2 flex items-center gap-2 text-sm font-bold"><CalendarDays className="h-4 w-4" /> Preferred date</span><input required type="date" min={new Date().toISOString().slice(0, 10)} value={preferredDate} onChange={(event) => setPreferredDate(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400" /></label><label><span className="mb-2 block text-sm font-bold">Preferred time</span><input required type="time" value={preferredTime} onChange={(event) => setPreferredTime(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400" /></label></div>{error && <p className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{status && <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">{status}</p>}<button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:opacity-60"><Stethoscope className="h-5 w-5" />{submitting ? 'Requesting…' : 'Request consultation'}</button></form></div></div></div>;
}
