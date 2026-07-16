import { FormEvent, ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

type Mode = 'signin' | 'signup' | 'reset';

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const next = new URLSearchParams(location.search).get('next') || '/';

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage(''); setSubmitting(true);
    try {
      if (mode === 'signin') { await signIn(email, password); navigate(next, { replace: true }); return; }
      if (mode === 'signup') { await signUp(name, email, password); navigate(next, { replace: true }); return; }
      const response = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const body = await response.json() as { message?: string; developmentResetToken?: string; error?: string };
      if (!response.ok) throw new Error(body.error || 'Could not request a reset.');
      setMessage(`${body.message || 'Check your email for a password reset link.'}${body.developmentResetToken ? ` Development token: ${body.developmentResetToken}` : ''}`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Please try again.'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-[#e9f3f5] px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-md">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700"><ArrowLeft className="h-4 w-4" /> Back to MedSutra</Link>
        <div className="mt-6 rounded-[28px] border border-white bg-white/90 p-7 shadow-xl shadow-blue-100/50 backdrop-blur">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white"><ShieldCheck className="h-6 w-6" /></div>
          <h1 className="mt-5 text-2xl font-black text-[#1a3a6b]">{mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back'}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Your account keeps your profile, consultation requests, and prescription information protected.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === 'signup' && <Field label="Name" value={name} onChange={setName} icon={<UserRound className="h-4 w-4" />} />}
            <Field label="Email address" type="email" value={email} onChange={setEmail} icon={<Mail className="h-4 w-4" />} />
            {mode !== 'reset' && <Field label="Password" type="password" value={password} onChange={setPassword} icon={<LockKeyhole className="h-4 w-4" />} hint={mode === 'signup' ? 'At least 10 characters' : undefined} />}
            {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
            {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}
            <button disabled={submitting} className="w-full rounded-2xl bg-blue-600 px-4 py-3.5 font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:opacity-60">{submitting ? 'Please wait…' : mode === 'signup' ? 'Create secure account' : mode === 'reset' ? 'Request reset link' : 'Sign in'}</button>
          </form>
          {mode !== 'reset' && <div className="mt-5 text-center text-sm text-slate-600">{mode === 'signup' ? 'Already have an account?' : 'New to MedSutra?'} <button onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')} className="font-bold text-blue-700">{mode === 'signup' ? 'Sign in' : 'Create an account'}</button></div>}
          {mode !== 'reset' && <button onClick={() => setMode('reset')} className="mt-3 w-full text-center text-sm font-semibold text-blue-700">Forgot password?</button>}
          {mode === 'reset' && <button onClick={() => setMode('signin')} className="mt-4 w-full text-center text-sm font-semibold text-blue-700">Return to sign in</button>}
          {mode !== 'reset' && <a href="/api/auth/google" className="mt-5 flex w-full items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50">Continue with Google</a>}
          <p className="mt-4 border-t border-slate-100 pt-4 text-center text-xs leading-5 text-slate-500">Google sign-in requires the OAuth credentials in `.env`. Apple Sign In can be added for supported iOS deployments; phone OTP is optional.</p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', icon, hint }: { label: string; value: string; onChange: (value: string) => void; type?: string; icon: ReactNode; hint?: string }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span><div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100"><span className="text-slate-400">{icon}</span><input required type={type} value={value} onChange={(event) => onChange(event.target.value)} className="w-full bg-transparent py-3 text-sm outline-none" /></div>{hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}</label>;
}
