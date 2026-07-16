// @ts-nocheck
import { ShieldCheck, ShieldAlert, ScanSearch } from 'lucide-react';

export default function TrustBadge({ metadata }) {
  // Only use the two valid metrics
  const selfCheck = metadata?.trustBreakdown?.selfConsistency ?? 0;
  const nameMatch = metadata?.trustBreakdown?.nameMatch ?? 0;
  
  // Calculate score based ONLY on reliable data
  const score = Math.round((selfCheck + nameMatch) / 2);
  const tone = score >= 85 ? 'emerald' : score >= 65 ? 'amber' : 'rose';

  const styles = {
    emerald: { bg: 'bg-white border-emerald-100 text-slate-800', pill: 'bg-emerald-100 text-emerald-800', icon: <ShieldCheck /> },
    amber: { bg: 'bg-white border-amber-100 text-slate-800', pill: 'bg-amber-100 text-amber-800', icon: <ScanSearch /> },
    rose: { bg: 'bg-white border-rose-100 text-slate-800', pill: 'bg-rose-100 text-rose-800', icon: <ShieldAlert /> },
  }[tone];

  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${styles.bg}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.25em] opacity-70">Prescription Trust Score</div>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/70">{styles.icon}</div>
            <div>
              <div className="text-3xl font-black leading-none">{score}%</div>
              <div className="text-xs font-medium opacity-80">Final Confidence</div>
            </div>
          </div>
        </div>
        <div className={`rounded-full px-3 py-1 text-xs font-bold ${styles.pill}`}>0-100</div>
      </div>

      <div className="mt-5 flex overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80">
        <div className="flex-1 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Drug DB Match</div>
          <div className="mt-1 text-lg font-bold text-slate-800">{nameMatch}%</div>
        </div>
        <div className="w-px bg-slate-200" />
        <div className="flex-1 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">AI Consistency</div>
          <div className="mt-1 text-lg font-bold text-slate-800">{selfCheck}%</div>
        </div>
      </div>
    </div>
  );
}
