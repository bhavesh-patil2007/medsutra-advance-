import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, UserRound, Users } from 'lucide-react';
import { FamilyProfilesState, Lang, UserProfile } from '../types';
import { UI } from '../i18n';
import { createDefaultProfile } from '../utils/storage';

interface ProfilePageProps {
  familyProfiles: FamilyProfilesState;
  activeProfile: UserProfile;
  onChange: (state: FamilyProfilesState) => void;
  onUpdateProfile: (profile: UserProfile) => void;
  lang: Lang;
}

export default function ProfilePage({
  familyProfiles,
  activeProfile,
  onChange,
  onUpdateProfile,
  lang,
}: ProfilePageProps) {
  const navigate = useNavigate();
  const t = UI[lang] as Record<string, string>;
  const [newAllergy, setNewAllergy] = useState('');
  const [newMemberName, setNewMemberName] = useState('');

  const addAllergy = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = newAllergy.trim();
    if (!trimmed || activeProfile.allergies.includes(trimmed)) return;
    onUpdateProfile({ ...activeProfile, allergies: [...activeProfile.allergies, trimmed] });
    setNewAllergy('');
  };

  const removeAllergy = (allergy: string) => {
    onUpdateProfile({ ...activeProfile, allergies: activeProfile.allergies.filter((item) => item !== allergy) });
  };

  const toggleCondition = (key: keyof UserProfile) => {
    if (key === 'allergies' || key === 'id' || key === 'name' || key === 'createdAt' || key === 'relation') return;
    onUpdateProfile({ ...activeProfile, [key]: !activeProfile[key] });
  };

  const addFamilyMember = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = newMemberName.trim();
    if (!trimmed) return;
    const profile = createDefaultProfile(trimmed);
    profile.isAdult = true;
    profile.relation = 'Family';
    onChange({
      activeProfileId: profile.id,
      profiles: [...familyProfiles.profiles, profile],
    });
    setNewMemberName('');
  };

  const removeMember = (id: string) => {
    if (familyProfiles.profiles.length === 1) return;
    const profiles = familyProfiles.profiles.filter((profile) => profile.id !== id);
    onChange({
      activeProfileId: familyProfiles.activeProfileId === id ? profiles[0].id : familyProfiles.activeProfileId,
      profiles,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-3xl font-black text-slate-900">{t.healthProfile || 'Health Profiles'}</h1>
            <p className="text-sm text-slate-600">Manage separate prescription contexts for yourself and family members.</p>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Family member profiles</div>
                  <div className="mt-1 text-sm text-slate-600">Stored locally so each person can have their own allergies and risk flags.</div>
                </div>
                <div className="rounded-2xl bg-slate-900 p-3 text-white">
                  <Users className="w-5 h-5" />
                </div>
              </div>

              <form onSubmit={addFamilyMember} className="mt-4 flex gap-3">
                <input
                  value={newMemberName}
                  onChange={(event) => setNewMemberName(event.target.value)}
                  placeholder="Add a family member"
                  className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400"
                />
                <button className="rounded-2xl bg-blue-600 px-4 text-white shadow-sm">
                  <Plus className="w-5 h-5" />
                </button>
              </form>

              <div className="mt-4 space-y-3">
                {familyProfiles.profiles.map((profile) => {
                  const active = profile.id === familyProfiles.activeProfileId;
                  return (
                    <div
                      key={profile.id}
                      className={`rounded-2xl border p-4 transition ${active ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <button
                          onClick={() => onChange({ ...familyProfiles, activeProfileId: profile.id })}
                          className="flex flex-1 items-center gap-3 text-left"
                        >
                          <div className={`rounded-2xl p-3 ${active ? 'bg-blue-600 text-white' : 'bg-white text-slate-700'}`}>
                            <UserRound className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">{profile.name}</div>
                            <div className="text-sm text-slate-600">{profile.relation || 'Family member'}</div>
                          </div>
                        </button>
                        {familyProfiles.profiles.length > 1 && (
                          <button onClick={() => removeMember(profile.id)} className="rounded-xl p-2 text-slate-400 hover:bg-white hover:text-rose-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Why it matters</div>
              <div className="mt-3 text-sm leading-6 text-slate-200">
                Each profile has its own allergies and risk flags, so a child, an elderly parent, and an adult can all be scanned safely under one account.
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Active profile</div>
              <input
                value={activeProfile.name}
                onChange={(event) => onUpdateProfile({ ...activeProfile, name: event.target.value })}
                className="mt-3 w-full rounded-2xl border border-slate-200 px-4 py-3 text-lg font-semibold outline-none focus:border-blue-400"
              />
              <input
                value={activeProfile.relation || ''}
                onChange={(event) => onUpdateProfile({ ...activeProfile, relation: event.target.value })}
                placeholder="Relation e.g. Self, Mother, Child"
                className="mt-3 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400"
              />
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">{t.medicationAllergies || 'Medication allergies'}</div>
              <form onSubmit={addAllergy} className="mt-4 flex gap-3">
                <input
                  value={newAllergy}
                  onChange={(event) => setNewAllergy(event.target.value)}
                  placeholder={t.allergyPlaceholder || 'e.g. Penicillin'}
                  className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400"
                />
                <button className="rounded-2xl bg-blue-600 px-4 text-white shadow-sm">
                  <Plus className="w-5 h-5" />
                </button>
              </form>
              <div className="mt-4 flex flex-wrap gap-2">
                {activeProfile.allergies.length === 0 && (
                  <div className="rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-500">{t.noAllergiesYet || 'No allergies yet'}</div>
                )}
                {activeProfile.allergies.map((allergy) => (
                  <div key={allergy} className="flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-900">
                    {allergy}
                    <button onClick={() => removeAllergy(allergy)} className="text-blue-500 hover:text-blue-900">×</button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">{t.specialConsiderations || 'Special considerations'}</div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Toggle label={t.pregnant || 'Pregnant'} active={activeProfile.isPregnant} onClick={() => toggleCondition('isPregnant')} />
                <Toggle label={t.elderly || 'Elderly'} active={activeProfile.isElderly} onClick={() => toggleCondition('isElderly')} />
                <Toggle label={t.child || 'Child'} active={activeProfile.isChild} onClick={() => toggleCondition('isChild')} />
                <Toggle label={t.adult || 'Adult'} active={activeProfile.isAdult} onClick={() => toggleCondition('isAdult')} />
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Personalized AI memory</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">With your consent, verified prescription details can be stored with Mem0 to make future medication questions more relevant. You can turn this off at any time.</p>
              <div className="mt-4"><Toggle label="Allow consent-based memory" active={Boolean(activeProfile.memoryConsent)} onClick={() => onUpdateProfile({ ...activeProfile, memoryConsent: !activeProfile.memoryConsent })} /></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border px-4 py-4 text-left transition ${active ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-2 text-xs uppercase tracking-[0.18em] opacity-60">{active ? 'Active' : 'Off'}</div>
    </button>
  );
}
