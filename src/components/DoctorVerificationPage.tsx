// @ts-nocheck
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, FilePenLine, ShieldCheck, Search } from 'lucide-react';
import { PrescriptionResult, UserProfile, VerificationStatus } from '../types';
import { verifyDrugName } from '../utils/drugMatcher'; // <-- Hooked up our new offline DB!

interface DoctorVerificationPageProps {
  result: PrescriptionResult;
  profile: UserProfile;
  onUpdate: (result: PrescriptionResult) => void;
}

type DraftField = {
  name: string;
  dosage: string;
  timing: string;
};

export default function DoctorVerificationPage({ result, profile, onUpdate }: DoctorVerificationPageProps) {
  const navigate = useNavigate();
  const [reviewerName, setReviewerName] = useState(result.metadata?.doctorReview?.reviewerName || '');
  const [notes, setNotes] = useState(result.metadata?.doctorReview?.notes || '');
  const [drafts, setDrafts] = useState<DraftField[]>(() =>
    result.medicines.map((medicine) => ({
      name: medicine.name,
      dosage: medicine.dosage,
      timing: medicine.timing,
    })),
  );
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDrafts(
      result.medicines.map((medicine) => ({
        name: medicine.name,
        dosage: medicine.dosage,
        timing: medicine.timing,
      })),
    );
  }, [result]);

  const saveReview = async (status: 'verified' | 'corrected') => {
    setIsSaving(true);
    
    // Process all medicines asynchronously to check them against the Fuse.js offline database
    const updatedMedicines = await Promise.all(result.medicines.map(async (medicine, index) => {
      const changed =
        drafts[index].name !== medicine.name ||
        drafts[index].dosage !== medicine.dosage ||
        drafts[index].timing !== medicine.timing;
      const verificationStatus: VerificationStatus = changed ? 'corrected' : 'verified';

      // MAGIC HAPPENS HERE: Cross-check the doctor's typed correction against the offline DB
      const dbMatch = await verifyDrugName(drafts[index].name);

      return {
        ...medicine,
        ...drafts[index],
        reviewRequired: false,
        verification: {
          ...medicine.verification,
          status: verificationStatus,
          matchedName: dbMatch.matchedName, // Use the officially recognized Indian brand name
          confidence: dbMatch.confidence > 0 ? dbMatch.confidence : 100, // Trust the doctor if DB misses
          notes: changed ? 'Doctor or pharmacist corrected this field.' : 'Doctor or pharmacist verified this field.',
        }
      };
    }));

    onUpdate({
      ...result,
      medicines: updatedMedicines,
      reviewFlags: [],
      metadata: {
        ...result.metadata!,
        trustScore: 100, // Human verification immediately sets trust to 100%
        doctorReview: {
          status,
          reviewerName: reviewerName || 'Doctor review',
          verifiedAt: new Date().toISOString(),
          notes,
        },
        selfConsistency: {
          ...result.metadata!.selfConsistency,
          reviewFlags: [],
        },
      },
    });

    setIsSaving(false);
    setSaved(true);
    
    // Auto-return to dashboard after a short delay
    setTimeout(() => navigate(-1), 1500);
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm hover:bg-slate-50 transition">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-black">Doctor-Side Verification Portal</h1>
              <p className="text-sm text-slate-600">Review low-confidence extraction fields for {profile.name}.</p>
            </div>
          </div>
          {saved && (
            <div className="flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="w-4 h-4" />
              Verified & Saved
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-4">
            {drafts.map((draft, index) => (
              <div key={index} className={`rounded-3xl border ${result.medicines[index].verification?.status === 'unverified' ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200 bg-white'} p-5 shadow-sm`}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Medicine {index + 1}</div>
                    <div className={`mt-1 text-sm ${result.medicines[index].verification?.status === 'unverified' ? 'text-amber-700 font-semibold' : 'text-slate-600'}`}>
                      {result.medicines[index].verification?.notes || 'Verify extracted text against the original prescription.'}
                    </div>
                  </div>
                  <div className={`rounded-2xl p-3 text-white ${result.medicines[index].verification?.status === 'unverified' ? 'bg-amber-500' : 'bg-slate-900'}`}>
                    <FilePenLine className="w-5 h-5" />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <Field
                    label="Medicine Name"
                    value={draft.name}
                    icon={<Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />}
                    onChange={(value) =>
                      setDrafts((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, name: value } : item)))
                    }
                  />
                  <Field
                    label="Dosage"
                    value={draft.dosage}
                    onChange={(value) =>
                      setDrafts((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, dosage: value } : item)))
                    }
                  />
                  <Field
                    label="Timing"
                    value={draft.timing}
                    onChange={(value) =>
                      setDrafts((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, timing: value } : item)))
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Reviewer</div>
              <input
                value={reviewerName}
                onChange={(event) => setReviewerName(event.target.value)}
                placeholder="Doctor / pharmacist name"
                className="mt-3 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
              />
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional verification notes"
                className="mt-3 min-h-32 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Pending Flags</div>
              <div className="mt-3 space-y-3">
                {(result.reviewFlags || []).length === 0 && (
                  <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">No unresolved review flags.</div>
                )}
                {(result.reviewFlags || []).map((flag, index) => (
                  <div key={index} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <div className="font-semibold">{flag.medicineName || flag.field}</div>
                    <div className="mt-1">{flag.message}</div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => saveReview('verified')}
              disabled={isSaving}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 px-5 py-4 font-bold text-white shadow-sm hover:bg-emerald-700 transition disabled:opacity-50"
            >
              <ShieldCheck className="w-5 h-5" />
              {isSaving ? 'Processing...' : 'Approve As Verified'}
            </button>
            <button
              onClick={() => saveReview('corrected')}
              disabled={isSaving}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-blue-600 px-5 py-4 font-bold text-white shadow-sm hover:bg-blue-700 transition disabled:opacity-50"
            >
              <CheckCircle2 className="w-5 h-5" />
              {isSaving ? 'Processing...' : 'Save Corrections'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  icon
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon?: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="relative">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
        />
        {icon}
      </div>
    </label>
  );
}