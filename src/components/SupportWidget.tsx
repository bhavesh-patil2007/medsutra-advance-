import { MessageCircle, Phone, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UI } from '../i18n';
import { Lang } from '../types';

export default function SupportWidget({ lang }: { lang: Lang }) {
  const t = UI[lang] as Record<string, string>;
  const [open, setOpen] = useState(false);
  const supportNumber = import.meta.env.VITE_SUPPORT_PHONE || '104';
  return <div className="fixed bottom-5 right-5 z-50"><div className="mb-3 flex flex-col items-end gap-2">{open && <div className="w-72 rounded-3xl border border-blue-100 bg-white p-4 shadow-xl"><div className="flex items-center justify-between"><div className="font-bold text-[#1a3a6b]">{t.needHelp}</div><button onClick={() => setOpen(false)} aria-label="Close support"><X className="h-4 w-4" /></button></div><p className="mt-2 text-sm leading-5 text-slate-600">{t.supportChannelsWarning}</p><Link to="/consult" className="mt-4 flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-bold text-white"><MessageCircle className="h-4 w-4" /> {t.consultADoctor}</Link><a href={`tel:${supportNumber}`} className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700"><Phone className="h-4 w-4" /> {t.callSupport}</a></div>}</div><button onClick={() => setOpen((value) => !value)} aria-label="Open support" className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl shadow-blue-300 transition hover:bg-blue-700"><MessageCircle className="h-6 w-6" /></button></div>;
}
